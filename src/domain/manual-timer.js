/** 手动计时只按墙钟和已保存的计时段计算，不依赖进程 uptime 或自动统计。 */

export const MAX_COUNTDOWN_MS = 7 * 24 * 60 * 60_000
const MAX_DATE_MS = 8_640_000_000_000_000
const MAX_ID_LENGTH = 128

export function emptyManualTimer() {
  return { current: null, lastResult: null, showCompleted: false, notificationPending: false }
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
  const lastResult = parseManualTimerResult(value.lastResult)
  const showCompleted = value.showCompleted === true
  const notificationPending = value.notificationPending === true
  if (
    (showCompleted && (current !== null || lastResult === null)) ||
    (notificationPending && lastResult?.reason !== 'expired')
  ) throw new Error('手动计时的完成状态无效')
  return { current, lastResult, showCompleted, notificationPending }
}

function deadlineFor(run) {
  if (run?.runningSince == null || run.durationMs === null) return null
  return run.runningSince + run.durationMs - run.elapsedMs
}

function elapsedAt(run, at) {
  return run.elapsedMs + (run.runningSince === null ? 0 : Math.max(0, at - run.runningSince))
}

function completeTimer(run, at, reason) {
  const { id, mode, durationMs, startedAt } = run
  return {
    current: null,
    lastResult: { id, mode, durationMs, startedAt, elapsedMs: elapsedAt(run, at), completedAt: at, reason },
    showCompleted: true,
    notificationPending: reason === 'expired',
  }
}

/** 允许迟到的观察收口，但完成时刻永远是实际到期的时刻。 */
export function settleManualTimer(timer, at) {
  const deadline = deadlineFor(timer.current)
  return deadline !== null && deadline <= at ? completeTimer(timer.current, deadline, 'expired') : timer
}

export function manualTimerView(timer, at) {
  const { current, lastResult, showCompleted, notificationPending } = timer
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
    lastResult: lastResult === null ? null : { ...lastResult },
    notification: notificationPending ? { id: lastResult.id } : null,
  }
}

/** 调用方先收口到期的计时，再校验命令与当前状态，最后串行保存。 */
export function applyManualTimerAction(timer, input, at, createId) {
  if (!isRecord(input)) throw timerError('invalid-timer-action', '计时操作必须是对象')
  const { action, mode, durationMs, id } = input
  const { current, lastResult, showCompleted } = timer
  // 删除针对完成记录的 ID；另一个正在进行的计时不属于这次操作。
  if (action === 'clear-result') {
    if (!isId(id)) throw timerError('invalid-timer-action', '删除计时记录需要记录标识')
    if (id !== lastResult?.id) throw timerError('stale-timer', '计时记录已变化，请刷新后再操作')
    return { ...timer, lastResult: null, showCompleted: false, notificationPending: false }
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
    if (action === 'complete') return completeTimer(current, effectiveAt, 'manual')
  }
  throw timerError('invalid-timer-action', '当前计时状态不允许此操作')
}

export function canClaimManualTimerNotification(timer, input) {
  if (!isRecord(input) || !isId(input.id) || !isId(input.clientId)) {
    throw timerError('invalid-timer-claim', '认领到期提醒需要计时标识和客户端标识')
  }
  return timer.notificationPending && input.id === timer.lastResult.id
}

function timerError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}
