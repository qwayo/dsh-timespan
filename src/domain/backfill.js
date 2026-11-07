/**
 * ChronoScope 历史回填的纯规划层。
 *
 * 从第一性原理看，回填 = 把已持久化会话的事件流「重放」进领域服务同一套
 * 任务归约器：turn/start 建任务、turn/end 收口、step / tool / approval 事件
 * 补齐任务构成。这个模块只做与 DSH 运行时无关的纯变换：
 *
 *   - fork 会话跳过 readSession() 给出的继承前缀（inheritedEventCount 是前缀
 *     的事件数量、即数组切点下标，与事件的 seq 值无关），继承事件是父会话的
 *     副本，重放会凭空多出一批任务；派生标题与收口时间也只取自身事件；
 *   - 只保留会影响任务记录的结构事件，避免把大段正文与无关事件灌进写队列；
 *   - 从 session/title 事件派生历史会话标题（冷会话拿不到实时标题服务）；
 *   - 归一化回填进度状态，供 meta 持久化与页面读取共用。
 *
 * 归属（origin / parentSessionId / workspace）优先用 Host 注入的 header，
 * 缺失时从 readSession() 的 session 头补齐，避免子代理归属丢失被误计进总计。
 * 子代理沿用实时记录的 origin 口径：规格实施决策里的「跳过子代理会话」指
 * 不把它们当作顶层会话计入总计，回填仍按归属规则把任务写入 tasks 原始明细
 * （origin=subagent），既不计入总计，也能在父会话明细中看到。
 */

/** 会被领域服务的事件归约器消费的事件类型；其余事件只影响崩溃收口时间。 */
const BACKFILL_EVENT_TYPES = new Set([
  'turn/start',
  'turn/end',
  'step/start',
  'step/end',
  'assistant/message',
  'tool/call',
  'tool/result',
  'approval/asked',
  'approval/decided',
  'session/title',
])

const BACKFILL_STATUSES = new Set(['idle', 'running', 'done', 'failed'])

/**
 * 回填完成事件的原因。版本升级重扫、清空数据后的再次回填、手动重试都算
 * 新一代事件；通知记录用同一组值描述「事件类型」。
 */
const BACKFILL_EVENT_KINDS = new Set(['initial', 'version', 'retry', 'clear'])

/** 通知记录只保留最近若干条；回填事件不频繁，几十条足够回看。 */
const BACKFILL_NOTICE_LIMIT = 20

/**
 * 回填算法版本。升级它即让此前 status=done 的旧结果失效并重新扫描，避免
 * 「重复启动不重复计数」退化成「算法升级后永不补扫」。旧 meta 缺版本按 0 读。
 */
export const BACKFILL_VERSION = 1

export function initialBackfillStatus() {
  return {
    status: 'idle',
    version: 0,
    scanned: 0,
    total: 0,
    tasksWritten: 0,
    error: null,
    updatedAt: 0,
    // 回填完成事件：eventId 是该代事件的稳定标识；readEventId 是已读锚点。
    // 新事件开始时 eventId 换代，旧已读锚点就不会把新事件误判成已读。
    eventId: '',
    eventKind: '',
    eventAt: 0,
    eventSeq: 0,
    readEventId: '',
    readAt: 0,
    // 清空统计时记下时间，作为「清空后的再次回填」事件原因；消费后归零。
    clearedAt: 0,
    // 通知记录：已读后仍可回看的历史事件。
    notices: [],
  }
}

/** 读取历史 meta、页面状态与内部进度更新共用同一个归一化口径。 */
export function normalizeBackfillStatus(value) {
  const base = initialBackfillStatus()
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return base
  const notices = normalizeBackfillNotices(value.notices)
  const eventId = boundedText(value.eventId, 128)
  return {
    status: BACKFILL_STATUSES.has(value.status) ? value.status : base.status,
    version: nonNegative(value.version),
    scanned: nonNegative(value.scanned),
    total: nonNegative(value.total),
    tasksWritten: nonNegative(value.tasksWritten),
    error: typeof value.error === 'string' && value.error.length > 0 ? value.error.slice(0, 512) : null,
    updatedAt: nonNegative(value.updatedAt),
    eventId,
    eventKind: BACKFILL_EVENT_KINDS.has(value.eventKind) ? value.eventKind : '',
    eventAt: nonNegative(value.eventAt),
    // 代次同时参考事件 id：即使旧 meta 只留下 eventId，也不会复用同一代。
    eventSeq: Math.max(nonNegative(value.eventSeq), notices.length, eventSeqOf(eventId)),
    readEventId: boundedText(value.readEventId, 128),
    readAt: nonNegative(value.readAt),
    clearedAt: nonNegative(value.clearedAt),
    notices,
  }
}

function eventSeqOf(eventId) {
  const match = /^backfill_(\d+)_v\d+$/.exec(eventId)
  return match === null ? 0 : Number(match[1])
}

/** 规范化通知记录；缺少 eventId 的脏记录直接丢弃，其余字段给安全默认值。 */
function normalizeBackfillNotices(value) {
  if (!Array.isArray(value)) return []
  const notices = []
  for (const row of value) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    const eventId = boundedText(row.eventId, 128)
    if (eventId === '') continue
    notices.push({
      eventId,
      kind: BACKFILL_EVENT_KINDS.has(row.kind) ? row.kind : '',
      version: nonNegative(row.version),
      total: nonNegative(row.total),
      tasksWritten: nonNegative(row.tasksWritten),
      completedAt: nonNegative(row.completedAt),
      readAt: nonNegative(row.readAt),
    })
  }
  return notices.slice(-BACKFILL_NOTICE_LIMIT)
}

function boundedText(value, maxLength) {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, maxLength) : ''
}

/**
 * 把 readSession() 的快照规划成一次可重放的会话。
 *
 * @param {object} snapshot { session, inheritedEventCount, header, events }
 * @returns {{ sessionId: string, header: object, events: object[], logEndAt: number } | null}
 */
export function planBackfillSession(snapshot) {
  const raw = snapshot && typeof snapshot === 'object' ? snapshot : null
  if (raw === null) return null
  const session = raw.session && typeof raw.session === 'object' ? raw.session : {}
  const sessionId = pickSessionId(raw.sessionId, session.id, raw.header?.id)
  if (sessionId === null) return null
  const allEvents = Array.isArray(raw.events) ? raw.events : []
  if (allEvents.length === 0) return null

  // inheritedEventCount 是继承事件的数量，也是连续日志里的切点下标；按位置
  // 切片而不是按 seq 过滤，避免对缺 seq 的事件或已裁剪的夹具误判。
  const inherited = nonNegative(raw.inheritedEventCount)
  const ownEvents = inherited >= allEvents.length ? [] : allEvents.slice(inherited)
  if (ownEvents.length === 0) return null

  // 只重放已完成的任务（有 turn/end）：没有 turn/end 的任务是当前仍在进行中的
  // 实时任务，重放它的 step/tool 事件会污染领域服务里正在累积的同一条记录。
  // 这也正好落在票面口径「每个已完成 turn 生成任务记录」上。
  const completedTurns = new Set()
  for (const event of ownEvents) {
    if (event?.type !== 'turn/end') continue
    const turn = turnOf(event)
    if (turn !== null) completedTurns.add(turn)
  }
  const events = ownEvents.filter((event) => {
    if (event === null || typeof event !== 'object' || !BACKFILL_EVENT_TYPES.has(event.type)) return false
    if (event.type === 'session/title') return true
    const turn = turnOf(event)
    return turn !== null && completedTurns.has(turn)
  })
  if (events.length === 0) return null

  const rawHeader = raw.header && typeof raw.header === 'object' ? raw.header : {}
  return {
    sessionId,
    header: {
      ...rawHeader,
      parentSessionId: rawHeader.parentSessionId ?? session.parentSession ?? null,
      origin: rawHeader.origin ?? session.origin ?? null,
      sessionTitle: rawHeader.sessionTitle ?? deriveSessionTitle(ownEvents),
    },
    events,
    logEndAt: maxEventTime(ownEvents),
  }
}

/** 历史日志里最后一次 session/title 就是当前标题；实时重放时也是同一结果。 */
function deriveSessionTitle(events) {
  let title = null
  for (const event of events) {
    if (event === null || typeof event !== 'object' || event.type !== 'session/title') continue
    const value = event.data?.title
    if (typeof value === 'string' && value.length > 0) title = value.slice(0, 512)
  }
  return title
}

/** 日志最后一条事件的时间；用于给没有 turn/end 的历史任务做近似收口。 */
function maxEventTime(events) {
  let max = 0
  for (const event of events) {
    const time = event?.time
    if (typeof time === 'number' && Number.isFinite(time) && time > max) max = Math.floor(time)
  }
  return max
}

function pickSessionId(...candidates) {
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value.slice(0, 512)
  }
  return null
}

function turnOf(event) {
  const value = event?.data?.turn
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

function nonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}
