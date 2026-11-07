/**
 * 日/周/月周期边界与趋势桶。
 *
 * 所有边界都按 Host 本地时区派生：用 `new Date(y, m, d, h, ...)` 逐日、逐时
 * 构造，而不是在时间戳上加减固定毫秒，这样夏令时切换日仍然正确。周期上界
 * 一律截到当前时刻；未来桶仍然保留，但长度为 0，趋势图因此能画出完整周期。
 *
 * 这里是纯函数，不读取存储、不持有业务规则；日/周/月都只作为查询时的派生
 * 视图，原始区间不做跨层累加。
 */

export const PERIODS = ['day', 'week', 'month']

/** 两位补零，供日期键与可读时长共用，避免各模块各写一份。 */
export function pad2(value) {
  return String(value).padStart(2, '0')
}

/** 周起始：1 表示周一（默认），7 表示周日；由设置项提供，默认周一。 */
export const MONDAY_WEEK_START = 1
export const SUNDAY_WEEK_START = 7

export function isPeriod(value) {
  return value === 'day' || value === 'week' || value === 'month'
}

export function normalizeWeekStart(value) {
  return value === SUNDAY_WEEK_START || value === '7' ? SUNDAY_WEEK_START : MONDAY_WEEK_START
}

function startOfLocalDay(timestamp) {
  const at = new Date(timestamp)
  return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, 0, 0, 0)
}

function addLocalDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0)
}

/**
 * 导出用：某一时刻所在的 Host 本地自然日的完整边界 `[from, to)` 与日期键。
 * 走 `new Date(y, m, d)` 而不是时间戳加减，夏令时切换日也只有 23/25 小时。
 */
export function localDayBounds(timestamp) {
  const at = new Date(timestamp)
  const day = startOfLocalDay(timestamp)
  return {
    from: day.getTime(),
    to: addLocalDays(day, 1).getTime(),
    dateKey: `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`,
  }
}

/**
 * 给定周期在 Host 本地时区下的查询窗口 `[from, to)`。
 *
 * `from` 是周期起点，`to` 是周期终点与当前时刻的较小值；`periodStart` 与
 * `periodEnd` 是未经裁剪的完整周期边界，供趋势桶生成使用。
 */
export function periodRange(period, now, { weekStartsOn = MONDAY_WEEK_START } = {}) {
  if (!isPeriod(period)) throw new Error(`未知统计周期：${String(period)}`)
  const today = startOfLocalDay(now)
  let fromDate
  let periodEndDate

  if (period === 'day') {
    fromDate = today
    periodEndDate = addLocalDays(today, 1)
  } else if (period === 'week') {
    // getDay() 以周日为 0；周日为周起始时直接回退 0–6 天，周一时回退 0–6 天到周一。
    const offset = weekStartsOn === SUNDAY_WEEK_START ? today.getDay() : (today.getDay() + 6) % 7
    fromDate = addLocalDays(today, -offset)
    periodEndDate = addLocalDays(fromDate, 7)
  } else {
    // 用「下个月 1 日」而不是 setMonth(month + 1)，避免 1 月 31 日溢出到 3 月。
    fromDate = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0)
    periodEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 1, 0, 0, 0, 0)
  }

  const periodStart = fromDate.getTime()
  const periodEnd = periodEndDate.getTime()
  return {
    from: periodStart,
    to: Math.max(periodStart, Math.min(now, periodEnd)),
    periodStart,
    periodEnd,
  }
}

/**
 * 当前周期内的自然子区间桶：日按小时（24 个）、周按天（7 个）、月按天
 * （当月天数）。桶只描述时间边界，活跃与任务两个系列的数值由领域服务填。
 */
export function trendBuckets(period, now, { weekStartsOn = MONDAY_WEEK_START } = {}) {
  if (!isPeriod(period)) return []
  const range = periodRange(period, now, { weekStartsOn })
  const at = new Date(now)
  const buckets = []

  if (period === 'day') {
    for (let hour = 0; hour < 24; hour += 1) {
      const start = new Date(at.getFullYear(), at.getMonth(), at.getDate(), hour, 0, 0, 0).getTime()
      const end = new Date(at.getFullYear(), at.getMonth(), at.getDate(), hour + 1, 0, 0, 0).getTime()
      pushBucket(buckets, `h${hour}`, start, end, now)
    }
    return buckets
  }

  const firstDay = new Date(range.periodStart)
  if (period === 'week') {
    for (let day = 0; day < 7; day += 1) {
      const start = addLocalDays(firstDay, day).getTime()
      const end = addLocalDays(firstDay, day + 1).getTime()
      pushBucket(buckets, `w${day}`, start, end, now)
    }
    return buckets
  }

  let day = 1
  while (day <= 40) {
    const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), day, 0, 0, 0, 0)
    if (start.getTime() >= range.periodEnd) break
    const end = new Date(firstDay.getFullYear(), firstDay.getMonth(), day + 1, 0, 0, 0, 0)
    pushBucket(buckets, `m${day}`, start.getTime(), end.getTime(), now)
    day += 1
  }
  return buckets
}

function pushBucket(buckets, key, from, end, now) {
  const to = Math.max(from, Math.min(end, now))
  buckets.push({ key, from, to, future: from > now })
}
