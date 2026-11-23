/** 手动计时只按墙钟和已保存的计时段计算，不依赖进程 uptime 或自动统计。 */

export const MAX_COUNTDOWN_MS = 7 * 24 * 60 * 60_000
const MAX_TIMER_HISTORY = 30
const MAX_DATE_MS = 8_640_000_000_000_000
const MAX_ID_LENGTH = 128

export function emptyManualTimer() {
  return { current: null, history: [], lastResult: null, showCompleted: false, notificationPending: false }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_ID_LENGTH
}

function isTime(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_DATE_MS
}

function isCountdownDuration(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_COUNTDOWN_MS
}

function parseRunFields(value) {
  if (!isRecord(value) || !isId(value.id) || !isTime(value.startedAt) || !isTime(value.elapsedMs)) {
    throw new Error('手动计时记录的标识或时刻无效')
  }
  if (
    (value.mode === 'stopwatch' && value.durationMs !== null) ||
    (value.mode === 'countdown' && (!isCountdownDuration(value.durationMs) || value.elapsedMs > value.durationMs)) ||
    (value.mode !== 'stopwatch' && value.mode !== 'countdown')
  ) throw new Error('手动计时记录的模式或时长无效')
  const { id, mode, durationMs, startedAt, elapsedMs } = value
  return { id, mode, durationMs, startedAt, elapsedMs }
}

/** 只投影已完成结果的字段，活动计时和提醒认领状态不属于备份。 */
export function parseManualTimerResult(value) {
  if (value === null || value === undefined) return null
  const run = parseRunFields(value)
  const { completedAt, reason } = value
  const expired = run.mode === 'countdown' && run.elapsedMs === run.durationMs
  if (
    !isTime(completedAt) || completedAt - run.startedAt < run.elapsedMs ||
    reason !== (expired ? 'expired' : 'manual')
  ) throw new Error('手动计时记录的完成时刻或结束原因无效')
  return { ...run, completedAt, reason }
}

/** 旧计时状态和旧备份只有一条结果，读取时并入历史。 */
export function parseManualTimerHistory(value, legacyResult) {
  if (value === undefined) {
    const result = parseManualTimerResult(legacyResult)
    return result ? [result] : []
  }
  if (!Array.isArray(value)) throw new Error('手动计时历史必须是数组')
  const results = new Map()
  for (const entry of value) {
    const result = parseManualTimerResult(entry)
    if (!result) throw new Error('手动计时历史的记录不能为空')
    if (results.size < MAX_TIMER_HISTORY && !results.has(result.id)) results.set(result.id, result)
  }
  return [...results.values()]
}

/** 历史首条仍对应本机完成状态，保留旧版本可读的单条字段。 */
function withHistory(timer, history) {
  return { ...timer, history, lastResult: history[0] ?? null }
}

/** 导入只使用剩余容量，保留本机记录、完成状态和待领提醒。 */
export function restoreManualTimerHistory(timer, imported) {
  const seen = new Set(timer.history.map((result) => result.id))
  if (timer.current) seen.add(timer.current.id)
  const added = imported.filter((result) => !seen.has(result.id))
  return withHistory(timer, [...timer.history, ...added].slice(0, MAX_TIMER_HISTORY))
}

/** 旧版本没有 timer 字段；现有字段在存储域读写时校验。 */
export function parseManualTimer(value) {
  if (value === null || value === undefined) return emptyManualTimer()
  if (!isRecord(value)) throw new Error('手动计时状态必须是对象')
  let current = null
  if (value.current !== null) {
    const run = parseRunFields(value.current)
    const { runningSince } = value.current
    const earliest = run.startedAt + run.elapsedMs
    if (
      !isTime(earliest) ||
      (runningSince !== null && (!isTime(runningSince) || runningSince < earliest)) ||
      (run.durationMs !== null && run.elapsedMs >= run.durationMs)
    ) throw new Error('手动计时活动状态无效')
    current = { ...run, runningSince }
  }
  const history = parseManualTimerHistory(value.history, value.lastResult)
  const lastResult = history[0]
  const showCompleted = value.showCompleted === true
  const notificationPending = value.notificationPending === true
  if (
    (showCompleted && (current !== null || !lastResult)) ||
    (notificationPending && lastResult?.reason !== 'expired')
  ) throw new Error('手动计时的完成状态无效')
  return withHistory({ current, showCompleted, notificationPending }, history)
}

function deadlineFor(run) {
  if (run?.runningSince == null || run.durationMs === null) return null
  return run.runningSince + run.durationMs - run.elapsedMs
}

function elapsedAt(run, at) {
  return run.elapsedMs + (run.runningSince === null ? 0 : Math.max(0, at - run.runningSince))
}

function completeTimer(timer, at, reason) {
  const run = timer.current
  const { id, mode, durationMs, startedAt } = run
  const result = { id, mode, durationMs, startedAt, elapsedMs: elapsedAt(run, at), completedAt: at, reason }
  return withHistory({
    current: null,
    showCompleted: true,
    notificationPending: reason === 'expired',
  }, [result, ...timer.history].slice(0, MAX_TIMER_HISTORY))
}

/** 允许迟到的观察收口，但完成时刻永远是实际到期的时刻。 */
export function settleManualTimer(timer, at) {
  const deadline = deadlineFor(timer.current)
  return deadline !== null && deadline <= at ? completeTimer(timer, deadline, 'expired') : timer
}

export function manualTimerView(timer, at) {
  const { current, history, showCompleted, notificationPending } = timer
  const lastResult = history[0]
  const displayed = current ?? (showCompleted ? lastResult : null)
  const elapsedMs = current === null ? displayed?.elapsedMs ?? 0 : elapsedAt(current, at)
  const durationMs = displayed?.durationMs ?? null
  return {
    now: at,
    status: current !== null ? (current.runningSince === null ? 'paused' : 'running') : (showCompleted ? 'completed' : 'idle'),
    id: displayed?.id ?? null,
    mode: displayed?.mode ?? null,
    startedAt: displayed?.startedAt ?? null,
    runningSince: current?.runningSince ?? null,
    durationMs,
    elapsedMs,
    remainingMs: durationMs === null ? null : Math.max(0, durationMs - elapsedMs),
    deadlineAt: deadlineFor(current),
    lastResult: lastResult ? { ...lastResult } : null,
    history: history.toSorted((left, right) => right.completedAt - left.completedAt).map((result) => ({ ...result })),
    notification: notificationPending ? { id: lastResult.id } : null,
  }
}

/** 调用方先收口到期的计时，再校验命令与当前状态，最后串行保存。 */
export function applyManualTimerAction(timer, input, at, createId) {
  if (!isRecord(input)) throw timerError('invalid-timer-action', '计时操作必须是对象')
  const { action, mode, durationMs, id } = input
  const { current, history, showCompleted } = timer
  const lastResult = history[0]
  // 删除针对完成记录的 ID；另一个正在进行的计时不属于这次操作。
  if (action === 'clear-result') {
    if (!isId(id)) throw timerError('invalid-timer-action', '删除计时记录需要记录标识')
    const retained = history.filter((result) => result.id !== id)
    if (retained.length === history.length) throw timerError('stale-timer', '计时记录已变化，请刷新后再操作')
    const updated = withHistory(timer, retained)
    return id === lastResult.id ? { ...updated, showCompleted: false, notificationPending: false } : updated
  }
  const currentId = current?.id ?? (showCompleted ? lastResult.id : null)
  if (id !== undefined && id !== currentId) {
    throw timerError('stale-timer', '计时状态已变化，请刷新后再操作')
  }

  if (action === 'start') {
    if (current !== null) throw timerError('timer-in-progress', '请先结束或重置当前计时')
    if (mode !== 'stopwatch' && mode !== 'countdown') throw timerError('invalid-timer-mode', '请选择计时模式')
    if (mode === 'countdown' && !isCountdownDuration(durationMs)) {
      throw timerError('invalid-countdown-duration', '倒计时时长必须是 1 毫秒到 7 天之间的整数毫秒')
    }
    return {
      ...timer,
      current: {
        id: createId(), mode, durationMs: mode === 'countdown' ? durationMs : null,
        startedAt: at, elapsedMs: 0, runningSince: at,
      },
      showCompleted: false,
    }
  }
  if (action === 'reset') {
    if (current?.runningSince != null) throw timerError('timer-running', '请先暂停计时再重置')
    if (current === null && !showCompleted) return timer
    return { ...timer, current: null, showCompleted: false }
  }
  // 从旧页面送来的暂停/完成如果刚好跨过截止时刻，仍返回已到期的完成状态。
  if ((action === 'pause' || action === 'complete') && showCompleted && lastResult.reason === 'expired') {
    return timer
  }
  if (current !== null) {
    // 系统时间回拨不能把完成时刻推到开始之前，也不能减掉已累计的计时段。
    const effectiveAt = Math.max(at, current.startedAt + current.elapsedMs, current.runningSince ?? 0)
    if (action === 'pause' && current.runningSince !== null) {
      return { ...timer, current: { ...current, runningSince: null, elapsedMs: elapsedAt(current, effectiveAt) } }
    }
    if (action === 'resume' && current.runningSince === null) {
      return { ...timer, current: { ...current, runningSince: effectiveAt } }
    }
    if (action === 'complete') return completeTimer(timer, effectiveAt, 'manual')
  }
  throw timerError('invalid-timer-action', '当前计时状态不允许此操作')
}

export function canClaimManualTimerNotification(timer, input) {
  if (!isRecord(input) || !isId(input.id) || !isId(input.clientId)) {
    throw timerError('invalid-timer-claim', '认领到期提醒需要计时标识和客户端标识')
  }
  return timer.notificationPending && input.id === timer.history[0].id
}

function timerError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}
