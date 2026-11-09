/**
 * dsh-timespan 的 Host 领域服务。
 *
 * 这是整个插件唯一的业务入口，也是唯一的测试缝：它只依赖一个存储域句柄与
 * 一个时钟接口。生产环境注入 DSH 的 storageDomain 与系统时钟；测试注入
 * 内存域与假时钟。Client 页面、RPC、心跳都只是它的调用方。
 *
 * 在线与活跃都表示成 intervals 表里的时间区间：在线区间由 Host 心跳推进，
 * 活跃区间由 Client 每 15 秒上报的「可见 / 聚焦 / 前台会话 / 最近操作」推导。
 * 网页不可见或失焦时立即收口；连续空闲超过阈值时只记到「最后一次操作 +
 * 阈值」为止，不把之后的挂机时间算进活跃时长。
 */

import {
  PERIODS,
  isPeriod,
  localDayBounds,
  localDayRange,
  normalizeWeekStart,
  periodRange,
  trendBuckets,
} from './periods.js'
import { BACKFILL_VERSION, normalizeBackfillStatus, planBackfillSession } from './backfill.js'
import { DEFAULT_SETTINGS, mergeSettings, normalizeSettings, settingsToIdleMs } from './settings.js'
import {
  buildCsvExport,
  buildJsonExport,
  EXPORT_FORMAT,
  LEGACY_EXPORT_FORMAT,
  exportFilename,
  exportMimeType,
  isExportFormat,
} from './export.js'

export const ONLINE_INTERVAL = 'online'
export const ACTIVE_INTERVAL = 'active'

/** 兼容既有公开常量：默认空闲阈值（毫秒），规则本体在 settings.js。 */
export { DEFAULT_IDLE_THRESHOLD_MS } from './settings.js'

/** 导出时最多往前铺多少天，避免极端脏数据生成超大文件。 */
const MAX_EXPORT_DAYS = 3660

/**
 * 活跃心跳超过这个间隔仍未到达时，不再把开放区间延伸到当前时刻，
 * 避免浏览器崩溃或机器休眠后把一大段停机时间算成活跃。15 秒心跳下
 * 相当于允许连续错过两次心跳。
 */
const ACTIVE_HEARTBEAT_STALE_MS = 45_000

/**
 * 在线心跳每 30 秒一次。心跳间隔超过这个值且墙钟明显快于单调时钟时，
 * 才把区间按断点分开：正常休眠时两者同步前进，不丢时间；时钟跳跃时
 * 只保留真实经过的 uptime，避免开放区间被拉成异常巨大的时长。
 */
const ONLINE_HEARTBEAT_STALE_MS = 5 * 60_000

/**
 * 查询时开放在线区间最多按墙钟延伸到最后一个心跳之后这么久；超过这个
 * 跨度且单调时钟没有同步前进，就视为系统时钟向前跳跃，只按 uptime 折算。
 * 正常测试或短暂无心跳的跨度不受影响。
 */
const ONLINE_CLOCK_JUMP_GUARD_MS = 60 * 60_000

/**
 * 墙钟与进程单调时钟之间允许的漂移。超过说明系统时钟被回拨或向前跳跃，
 * 任务事件时间按单调时钟折算，避免单次任务出现巨大时长。
 */
const CLOCK_DRIFT_TOLERANCE_MS = 60_000

const EMPTY_ATTRIBUTION = Object.freeze({
  clientId: null,
  sessionId: null,
  workspaceId: null,
  workspaceTitle: null,
  sessionTitle: null,
})

/**
 * @param {object} options
 * @param {object} options.domain 由 storageDomain.open() 返回的 Domain 句柄
 * @param {{ now: () => number, uptimeMs: () => number }} options.clock
 */
export function createDshTimespanDomain({ domain, clock }) {
  if (domain === undefined || domain === null) throw new Error('dsh-timespan 领域服务缺少存储域')
  if (clock === undefined || clock === null) throw new Error('dsh-timespan 领域服务缺少时钟')

  const intervals = domain.table('intervals')
  const tasks = domain.table('tasks')

  /** 每个 Client 最近一次 presence 的内存状态；进程重启后由区间本身恢复边界。 */
  const presenceByClient = new Map()

  /**
   * 清空会推进这一代次。后台回填是长任务，必须能在每个会话边界发现「数据
   * 已被清空」并立刻收手，否则刚删掉的历史任务会被重新灌回来。
   */
  let dataGeneration = 0

  /**
   * 所有写操作串行化：实时会话事件、presence 心跳与后台回填共用一张写队列，
   * 避免对同一任务键或同一份 meta 的读-改-写互相覆盖。回填按「事件」而不是
   * 按「整次回填」申请锁，并在会话之间让出事件循环，因此不会阻塞实时记录。
   */
  let writeQueue = Promise.resolve()
  function withWriteLock(work) {
    const result = writeQueue.then(work, work)
    writeQueue = result.then(() => {}, () => {})
    return result
  }

  /**
   * 设置是权威状态，每次都从 meta 现取并归一化：setSettings 之后无需重建
   * 服务，下一次心跳/查询立刻用上新值；旧数据缺字段时自动补出默认值。
   * Client 不持有副本，因此不存在「页面显示已保存但 Host 仍是旧值」的窗口。
   */
  function currentSettings() {
    return normalizeSettings(readMeta().settings)
  }

  function currentIdleThresholdMs() {
    return settingsToIdleMs(currentSettings())
  }

  function getSettings() {
    return currentSettings()
  }

  async function setSettings(patch) {
    if (patch === null || typeof patch !== 'object') throw new Error('setSettings 载荷必须是对象')
    return withWriteLock(async () => {
      const meta = readMeta()
      const next = mergeSettings(meta.settings, patch)
      await domain.global.set({ ...meta, settings: next })
      return next
    })
  }

  /**
   * 恢复首次安装的完整设置预设。只覆盖 meta.settings，不触碰统计区间、任务与
   * 回填记录；清空数据与恢复设置是两件独立的事。写入前仍经过 normalizeSettings，
   * 保证默认对象本身就是合法且可持久化的完整设置。
   */
  async function resetSettings() {
    return withWriteLock(async () => {
      const meta = readMeta()
      const next = normalizeSettings(DEFAULT_SETTINGS)
      await domain.global.set({ ...meta, settings: next })
      return next
    })
  }

  /**
   * 启动领域服务：用进程 uptime 反推应用启动时刻，收口上次运行遗留的悬空
   * 区间，并建立本次运行的在线区间。
   */
  async function start() {
    const at = now()
    const appStart = Math.max(0, at - uptimeMs())
    const meta = readMeta()

    // 上一次运行留下的悬空区间：在线与活跃都按最后心跳收口，而不是按本次启动
    // 时间，这样崩溃期间的停机时间不会被算进时长。
    for (const [id, interval] of intervals.entries()) {
      if (interval.type !== ONLINE_INTERVAL && interval.type !== ACTIVE_INTERVAL) continue
      if (interval.end !== null && interval.end !== undefined) continue
      const last = Number.isFinite(interval.lastHeartbeat) ? interval.lastHeartbeat : interval.start
      const end = Math.max(interval.start, Math.min(last, at))
      // 上次进程没有正常收口：结束时刻是从最后一次心跳推断的，不是真实观测，
      // 统一标记为近似值，页面据此给出说明。
      await intervals.put(id, { ...interval, end, approximate: true })
    }

    // 上次运行遗留的未结束任务：按该轮最后一条事件的时间收口，不把停机
    // 时间算进任务时长；近似标记留给页面说明。
    await closeAllOpenTasks('interrupted')

    // 同一进程内插件被卸载后重新加载时，旧区间已经覆盖了 appStart 之后的时间；
    // 新区间从与 appStart 之后有交集的最后一条在线区间结尾继续，避免重复计入。
    // 这里不能要求 interval.start >= appStart：旧记录可能来自早期版本，带有小数毫秒，
    // 比向下取整后的 appStart 略小。
    let startAt = appStart
    for (const [, interval] of intervals.entries()) {
      if (interval.type !== ONLINE_INTERVAL) continue
      const end = interval.end ?? interval.lastHeartbeat ?? interval.start
      if (end <= appStart) continue
      if (interval.start >= at) continue
      const clippedEnd = Math.min(end, at)
      if (clippedEnd > startAt) startAt = clippedEnd
    }

    const bootId = await openOnlineInterval(startAt, at)

    presenceByClient.clear()
    await domain.global.set({
      ...meta,
      installTime: Number.isFinite(meta.installTime) && meta.installTime > 0 ? meta.installTime : at,
      currentBootId: bootId,
      lastHeartbeat: at,
    })

    return { bootId, start: startAt }
  }

  /** 建立一段新的在线区间；启动与时钟跳变断点共用同一记录形状。 */
  async function openOnlineInterval(startAt, at) {
    const bootId = createRecordId('boot', at)
    await intervals.put(bootId, {
      id: bootId,
      type: ONLINE_INTERVAL,
      start: startAt,
      end: null,
      lastHeartbeat: at,
      lastHeartbeatUptime: uptimeMs(),
      ...EMPTY_ATTRIBUTION,
      approximate: false,
      source: 'live',
    })
    return bootId
  }

  /**
   * 30 秒在线心跳（也可由 Client 的 15 秒 presence 心跳顺带推进）。
   * 系统时钟回拨时保持原值，避免在线时长倒退。
   */
  async function recordPresence(input = {}) {
    const at = input.at ?? now()
    const online = await touchOnline(at)

    // 不带 visible 的调用是 Host 在线心跳，只推进在线区间，不触碰活跃判定。
    if (input.visible === undefined) return online

    const active = await updateActivePresence(input, at)
    return { ...online, active }
  }

  /**
   * 会话事件归约器。Client 不调用这里，Host 把 `session/event` 的原始事件
   * 原样交给领域服务；领域服务只依赖事件的类型、时间与数据，因此测试可以用
   * 假时钟直接重放事件。
   *
   * 历史回填走的是同一条归约器，只是把已持久化会话的事件按原顺序再喂进来
   * 并标记 source='backfill'：任务形状、键、构成分段与实时记录完全一致，
   * `sessionId:turn` 的幂等性也因此同时覆盖「重复启动」与「实时 + 回填重叠」。
   * 任务以「会话 id + turn」编码出的路径安全键为键，重复的 turn/start、
   * turn/end 或工具结果都是幂等的：事件日志可能被恢复或重放，不能重复计时。
   */
  async function applySessionEvent(input) {
    const sessionId = normalizeTaskSessionId(input?.sessionId)
    const event = input?.event
    if (event === undefined || event === null || typeof event.type !== 'string') {
      throw new Error('recordSessionEvent 缺少会话事件')
    }
    let at = normalizeEventTime(event.time)
    // 系统时钟向前跳变时，事件时间可能突然比真实经过的时间大出很多。
    // 对已经打开的任务，用创建时的单调 uptime 折算可信的任务时间，避免
    // 单次任务被放大成数天。turn/start 没有基准任务，不在这里折算。
    if (event.type !== 'turn/start') {
      const openTask = findOpenTask(sessionId)
      if (openTask !== null) at = clampTaskEventTime(openTask, at)
    }
    const source = input.source === 'backfill' ? 'backfill' : 'live'

    switch (event.type) {
      case 'turn/start':
        return handleTurnStart(sessionId, input.header, event, at, source)
      case 'turn/end':
        return handleTurnEnd(sessionId, event, at)
      case 'step/start':
        return handleStepStart(sessionId, event, at)
      case 'step/end':
        return handleStepEnd(sessionId, event, at)
      case 'assistant/message':
        return closeModelSegment(sessionId, event, at)
      case 'tool/call':
        return handleToolCall(sessionId, event, at)
      case 'tool/result':
        return closeToolSegment(sessionId, event, at)
      case 'approval/asked':
        return openApprovalSegment(sessionId, event, at)
      case 'approval/decided':
        return closeApprovalSegment(sessionId, event, at)
      case 'session/title':
        return updateSessionTitle(sessionId, event, at)
      default:
        return touchOpenTask(sessionId, at)
    }
  }

  async function handleStepStart(sessionId, event, at) {
    const task = taskForTurn(sessionId, event)
    if (task === null) return
    const step = normalizeTurn(event.data?.step)
    if (step === null) {
      await saveOpenTask(task, task.segments, at)
      return
    }
    // 同一 step 的重复 step/start 保持幂等；上一步没有 assistant/message
    // 的悬空模型段丢弃，不把两段之间的时间算进模型。
    let segments = task.segments.filter(
      (segment) => !(segment.type === 'model' && segment.end === null && segment.step !== step),
    )
    if (!segments.some((segment) => segment.type === 'model' && segment.step === step)) {
      segments = [
        ...segments,
        { type: 'model', start: at, end: null, step, callId: null, approvalId: null },
      ]
    }
    await saveOpenTask(task, segments, at)
  }

  async function handleStepEnd(sessionId, event, at) {
    const task = taskForTurn(sessionId, event)
    if (task === null) return
    const step = normalizeTurn(event.data?.step)
    // 未产出 assistant/message 的步骤（取消或失败）不计模型时长，留给「其他」。
    const segments = task.segments.filter(
      (segment) => !(segment.type === 'model' && segment.end === null && (step === null || segment.step === step)),
    )
    await saveOpenTask(task, segments, at)
  }

  async function closeModelSegment(sessionId, event, at) {
    const task = taskForTurn(sessionId, event)
    if (task === null) return
    const step = normalizeTurn(event.data?.step)
    const segments = closeFirstOpenSegment(
      task.segments,
      (segment) => segment.type === 'model' && segment.step === step,
      at,
    )
    await saveOpenTask(task, segments, at)
  }

  async function handleToolCall(sessionId, event, at) {
    const task = taskForTurn(sessionId, event)
    if (task === null) return
    const callId = normalizeNullableText(event.data?.callId)
    if (callId === null) return
    if (task.segments.some((segment) => segment.callId === callId)) return
    const step = normalizeTurn(event.data?.step)
    const name = normalizeNullableText(event.data?.name) ?? ''
    const segments = [
      ...task.segments,
      {
        type: name === 'ask_user_question' ? 'wait' : 'tool',
        start: at,
        end: null,
        step,
        callId,
        approvalId: null,
      },
    ]
    await saveOpenTask(task, segments, at)
  }

  async function closeToolSegment(sessionId, event, at) {
    const task = taskForTurn(sessionId, event)
    if (task === null) return
    const callId = normalizeNullableText(
      event.data?.message?.source?.callId ?? event.data?.message?.toolCallId ?? event.data?.callId,
    )
    if (callId === null) return
    const segments = closeFirstOpenSegment(task.segments, (segment) => segment.callId === callId, at)
    await saveOpenTask(task, segments, at)
  }

  async function openApprovalSegment(sessionId, event, at) {
    const task = findOpenTask(sessionId)
    if (task === null) return
    const approvalId = normalizeNullableText(event.data?.id)
    if (approvalId === null) return
    if (task.segments.some((segment) => segment.approvalId === approvalId)) return
    await saveOpenTask(
      task,
      [
        ...task.segments,
        { type: 'wait', start: at, end: null, step: null, callId: null, approvalId },
      ],
      at,
    )
  }

  async function closeApprovalSegment(sessionId, event, at) {
    const task = findOpenTask(sessionId)
    if (task === null) return
    const approvalId = normalizeNullableText(event.data?.id)
    if (approvalId === null) return
    const segments = closeFirstOpenSegment(task.segments, (segment) => segment.approvalId === approvalId, at)
    await saveOpenTask(task, segments, at)
  }

  function taskForTurn(sessionId, event) {
    const turn = normalizeTurn(event.data?.turn)
    if (turn === null) return null
    const task = tasks.get(taskKey(sessionId, turn))
    return isOpenTask(task) ? { ...task, id: taskKey(sessionId, turn) } : null
  }

  function closeFirstOpenSegment(segments, predicate, at) {
    let closed = false
    return segments.map((segment) => {
      if (closed || segment.end !== null || !predicate(segment)) return segment
      closed = true
      return { ...segment, end: at }
    })
  }

  async function saveOpenTask(task, segments, at) {
    const lastEventAt = Math.max(task.lastEventAt ?? task.start, at)
    const breakdown = computeTaskBreakdown(segments, task.start, lastEventAt)
    await tasks.put(task.id, {
      ...task,
      segments,
      lastEventAt,
      modelMs: breakdown.modelMs,
      toolMs: breakdown.toolMs,
      waitMs: breakdown.waitMs,
      otherMs: breakdown.otherMs,
    })
  }

  async function updateSessionTitle(sessionId, event, at) {
    const title = normalizeNullableText(event.data?.title)
    if (title === null) return
    for (const [id, task] of tasks.entries()) {
      if (task.sessionId !== sessionId) continue
      if (task.sessionTitle === title) continue
      await tasks.put(id, { ...task, sessionTitle: title })
    }
    await touchOpenTask(sessionId, at)
  }

  async function handleTurnStart(sessionId, header, event, at, source) {
    const turn = normalizeTurn(event.data?.turn)
    if (turn === null) return
    const id = taskKey(sessionId, turn)
    if (tasks.get(id) !== undefined) return

    // 崩溃或事件缺口导致上一条任务没有 turn/end：按它最后一条事件收口，
    // 不能把新任务开始后的时间算到旧任务上。
    await closeOpenTasksForSession(sessionId, 'interrupted', source)

    await tasks.put(id, {
      id,
      key: logicalTaskKey(sessionId, turn),
      sessionId,
      turn,
      parentSessionId: normalizeNullableText(header?.parentSessionId),
      origin: normalizeNullableText(header?.origin),
      workspaceId: normalizeNullableText(header?.workspaceId),
      workspaceTitle: normalizeNullableText(header?.workspaceTitle),
      sessionTitle: normalizeNullableText(header?.sessionTitle),
      start: at,
      end: null,
      endReason: null,
      ...emptyBreakdown(),
      hasBreakdown: true,
      approximate: false,
      lastEventAt: at,
      lastEventUptime: source === 'live' ? uptimeMs() : null,
      // 实时任务记录创建时的进程单调时钟读数，用来识别墙钟跳变；turn/start
      // 事件可能比处理时刻早（排队/回放），按处理延迟反推事件开始时刻的
      // uptime 基准。回填任务属于历史日志，没有当前进程的 uptime 基准。
      startedUptime: source === 'live'
        ? Math.max(0, uptimeMs() - Math.max(0, now() - at))
        : null,
      segments: [],
      source,
    })
  }

  async function handleTurnEnd(sessionId, event, at) {
    const turn = normalizeTurn(event.data?.turn)
    if (turn === null) return
    const id = taskKey(sessionId, turn)
    const task = tasks.get(id)
    if (!isOpenTask(task)) return
    const endReason = typeof event.data?.reason?.kind === 'string' ? event.data.reason.kind : 'completed'
    await tasks.put(id, finalizeTask(task, at, endReason, false))
  }

  /** 所有事件都推进当前任务的最后事件时间，供崩溃后的近似收口使用。 */
  async function touchOpenTask(sessionId, at) {
    const task = findOpenTask(sessionId)
    if (task === null) return
    if (at <= (task.lastEventAt ?? task.start)) return
    await tasks.put(task.id, { ...task, lastEventAt: at, lastEventUptime: uptimeMs() })
  }

  /**
   * 用任务创建时的单调 uptime 校正墙钟：墙钟走得过快（系统时钟向前跳跃）
   * 时，以「任务开始 + 真实经过的 uptime」为上限；单调时钟未推进、没有
   * 基准（回填任务）或墙钟没有明显超前时返回 null，表示沿用原墙钟时间。
   */
  function monotonicTaskEnd(task, wallAt) {
    const startedUptime = task.startedUptime
    // 没有单调时钟基准，或自最后一条任务事件后单调时钟没有前进（例如
    // 固定 uptime 的测试时钟），都无法判断墙钟是否跳跃，保持原墙钟时间。
    if (!Number.isFinite(startedUptime) || !Number.isFinite(task.lastEventUptime)) return null
    const monotonic = uptimeMs()
    if (monotonic <= task.lastEventUptime) return null
    const monotonicElapsed = monotonic - startedUptime
    if (wallAt - task.start <= monotonicElapsed + CLOCK_DRIFT_TOLERANCE_MS) return null
    return task.start + monotonicElapsed
  }

  function clampTaskEventTime(task, at) {
    return monotonicTaskEnd(task, at) ?? at
  }

  /** 运行中任务的投影结束时刻；只在墙钟明显快于单调时钟时收回。 */
  function runningTaskEnd(task, current) {
    return monotonicTaskEnd(task, current) ?? current
  }

  function findOpenTask(sessionId) {
    for (const [id, task] of tasks.entries()) {
      if (task.sessionId !== sessionId) continue
      if (!isOpenTask(task)) continue
      return { ...task, id }
    }
    return null
  }

  async function closeOpenTasks(predicate, endReason) {
    for (const [id, task] of tasks.entries()) {
      if (!isOpenTask(task) || !predicate(task)) continue
      const end = Math.max(task.start, task.lastEventAt ?? task.start)
      await tasks.put(id, finalizeTask({ ...task, id }, end, endReason, true))
    }
  }

  async function closeOpenTasksForSession(sessionId, endReason, source = null) {
    await closeOpenTasks(
      (task) => task.sessionId === sessionId && (source === null || task.source === source),
      endReason,
    )
  }

  function finalizeTask(task, end, endReason, approximate) {
    // 时钟回拨时 end 可能早于已经观测到的最后事件；结束时刻不能倒退回
    // 任务开始之前，也不能抹掉已知的最后事件时间。
    const safeEnd = Math.max(task.start, task.lastEventAt ?? task.start, end)
    const segments = settleSegmentsAtEnd(task.segments, safeEnd)
    const breakdown = computeTaskBreakdown(segments, task.start, safeEnd)
    return {
      ...task,
      segments,
      end: safeEnd,
      endReason,
      approximate: approximate || task.approximate === true,
      lastEventAt: Math.max(task.lastEventAt ?? task.start, safeEnd),
      modelMs: breakdown.modelMs,
      toolMs: breakdown.toolMs,
      waitMs: breakdown.waitMs,
      otherMs: breakdown.otherMs,
    }
  }

  /**
   * 收口时把仍然开放的区间按结束时刻截断。没有 assistant/message 的模型
   * 区间不计入模型耗时（没有完整响应），其时间自然落入「其他」。
   */
  function settleSegmentsAtEnd(segments, end) {
    return segments
      .filter((segment) => !(segment.type === 'model' && segment.end === null))
      .map((segment) => (segment.end === null ? { ...segment, end } : segment))
  }

  async function closeAllOpenTasks(endReason) {
    await closeOpenTasks(() => true, endReason)
  }

  /**
   * 判断一次心跳/关闭的墙钟时间是否明显快于进程单调时钟。正常休眠或短暂
   * 无心跳时两者大致同步；只有墙钟多出超过容差的部分才视为系统时钟跳跃。
   * 返回可归因于真实经过时间的毫秒数；不是跳跃时返回 null。
   */
  function clockJumpElapsed(interval, wallAt) {
    const lastUptime = interval.lastHeartbeatUptime
    if (!Number.isFinite(lastUptime)) return null
    const wallGap = wallAt - interval.lastHeartbeat
    if (wallGap <= ONLINE_HEARTBEAT_STALE_MS) return null
    const monotonicElapsed = Math.max(0, uptimeMs() - lastUptime)
    if (wallGap <= monotonicElapsed + CLOCK_DRIFT_TOLERANCE_MS) return null
    return monotonicElapsed
  }

  async function touchOnline(at) {
    const { meta, bootId, interval } = currentInterval()
    if (!isOpen(interval)) {
      throw new Error('dsh-timespan 领域服务尚未 start()：找不到当前启动的在线区间')
    }
    if (!Number.isFinite(at) || at <= interval.lastHeartbeat) {
      return { bootId, at: interval.lastHeartbeat, skipped: true }
    }

    // 墙钟大幅领先单调时钟：进程很可能被挂起/系统时钟发生了向前跳跃。
    // 旧区间只记到最后一次确认的心跳，新区间从本次心跳重新开始，避免把
    // 不存在的空白拉成异常巨大的在线时长。正常休眠时单调时钟同步前进，
    // 不会被切断。
    const jumped = clockJumpElapsed(interval, at)
    if (jumped !== null) {
      const end = Math.max(interval.start, interval.lastHeartbeat, interval.lastHeartbeat + jumped)
      await intervals.put(bootId, { ...interval, end, lastHeartbeat: end, approximate: true })
      const newBootId = await openOnlineInterval(at, at)
      await domain.global.set({ ...meta, currentBootId: newBootId, lastHeartbeat: at })
      return { bootId: newBootId, at, skipped: false, restarted: true }
    }

    await intervals.put(bootId, { ...interval, lastHeartbeat: at, lastHeartbeatUptime: uptimeMs() })
    await domain.global.set({ ...meta, lastHeartbeat: at })
    return { bootId, at, skipped: false }
  }

  /**
   * 用一次 Client presence 更新活跃区间。
   *
   * 判定口径：页面可见且窗口聚焦，并且（最近操作在空闲阈值内，或前台会话
   * 正在运行任务）时才算活跃。隐藏/失焦与任务刚结束时按本次上报时刻收口；
   * 仅因操作超时而空闲时，收口到「最后一次操作 + 阈值」这个精确边界。
   */
  async function updateActivePresence(input, at) {
    // 阈值按本次上报现取，setSettings 之后的下一次心跳立即生效。
    const idleThresholdMs = currentIdleThresholdMs()
    const clientId = normalizeClientId(input.clientId)
    const previous = presenceByClient.get(clientId)
    const visible = input.visible === true
    const focused = input.focused === true
    const running = input.foregroundRunning === true
    const lastInteractionAt = normalizeLastInteractionAt(input.lastInteractionAt, at)
    const attribution = normalizeAttribution(input)

    const idle = lastInteractionAt === null || at - lastInteractionAt >= idleThresholdMs
    const activeNow = visible && focused && (running || !idle)
    const open = findOpenActiveInterval(clientId)
    const presence = { at, visible, focused, running, lastInteractionAt }
    let activeStart = null

    if (open !== null) {
      // 系统时钟回拨：本次上报时间早于已确认的心跳。不能让心跳倒退，也不
      // 能在过去的时间点上切分区间；保持原区间，等时钟恢复后继续推进。
      if (at <= open.interval.lastHeartbeat) {
        if (!activeNow) {
          await closeInterval(open.id, open.interval.lastHeartbeat)
          presenceByClient.set(clientId, { ...presence, active: false, intervalId: null })
          return { active: false, ...attribution, since: null }
        }
        presenceByClient.set(clientId, { ...presence, active: true, intervalId: open.id })
        return { active: true, ...attribution, since: open.interval.start }
      }

      const gap = at - open.interval.lastHeartbeat
      if (!activeNow) {
        const end = inactiveEnd(open.interval, previous, { at, visible, focused, running, lastInteractionAt, idleThresholdMs })
        await closeInterval(open.id, end, { approximate: gap > ACTIVE_HEARTBEAT_STALE_MS })
        presenceByClient.set(clientId, { ...presence, active: false, intervalId: null })
        return { active: false, ...attribution, since: null }
      }

      if (gap > ACTIVE_HEARTBEAT_STALE_MS) {
        // 中间缺失了多个心跳（例如浏览器休眠）：旧区间只记到最后一次确认，
        // 新区间从本次重新确认的时刻开始，避免把休眠时间算成活跃。
        await closeInterval(open.id, open.interval.lastHeartbeat, { approximate: true })
        const startAt = activeStartAt({ at, running, lastInteractionAt, previous, idleThresholdMs })
        const created = await openActiveInterval({ startAt, at, clientId, attribution })
        activeStart = startAt
        presenceByClient.set(clientId, { ...presence, active: true, intervalId: created.id })
        return { active: true, ...attribution, since: activeStart }
      }

      if (!sameAttribution(open.interval, attribution)) {
        // 前台会话或工作区切换：旧归属立即收口，新归属从本次上报开始。
        await closeInterval(open.id, at)
        const created = await openActiveInterval({ startAt: at, at, clientId, attribution })
        activeStart = at
        presenceByClient.set(clientId, { ...presence, active: true, intervalId: created.id })
        return { active: true, ...attribution, since: activeStart }
      }

      await intervals.put(open.id, {
        ...open.interval,
        lastHeartbeat: at,
        ...attribution,
      })
      activeStart = open.interval.start
    } else if (activeNow) {
      const startAt = activeStartAt({ at, running, lastInteractionAt, previous, idleThresholdMs })
      const created = await openActiveInterval({ startAt, at, clientId, attribution })
      activeStart = startAt
      presenceByClient.set(clientId, { ...presence, active: true, intervalId: created.id })
      return { active: true, ...attribution, since: activeStart }
    }

    presenceByClient.set(clientId, { ...presence, active: activeNow, intervalId: open?.id ?? null })
    return { active: activeNow, ...attribution, since: activeStart }
  }

  function activeStartAt({ at, running, lastInteractionAt, previous, idleThresholdMs }) {
    if (running) return at
    // 从隐藏/失焦恢复：按本次重新可见、重新聚焦的上报时刻开始，
    // 不把不可见期间的旧操作时间回填进活跃区间。
    if (previous?.active === false && (previous.visible === false || previous.focused === false)) return at
    if (lastInteractionAt === null) return at
    if (at - lastInteractionAt >= idleThresholdMs) return at
    // 仅在本次进程收到过上一次上报时，把起点限制在上一次上报之后，
    // 避免两个相邻活跃区间重叠（例如任务结束后马上继续操作）。
    const lowerBound = Number.isFinite(previous?.at) ? previous.at : 0
    return Math.min(at, Math.max(lowerBound, lastInteractionAt))
  }

  function inactiveEnd(interval, previous, { at, visible, focused, running, lastInteractionAt, idleThresholdMs }) {
    // 隐藏/失焦前已经错过多个心跳：只算到最后一次确认，避免把休眠或崩溃
    // 期间的空白时间按本次上报时刻全部算成活跃。
    if (at - interval.lastHeartbeat > ACTIVE_HEARTBEAT_STALE_MS) return interval.lastHeartbeat
    // 页面隐藏 / 失焦：立即停止，收口到本次上报时刻。
    if (!visible || !focused) return at
    // 前台任务刚结束：Client 会在状态变化的同一刻补发 presence，按本次上报收口。
    if (previous?.running === true && !running) return at
    // 仅因空闲超时：记到最后一次操作 + 阈值这个精确边界。
    if (lastInteractionAt === null) return Math.min(at, Math.max(interval.lastHeartbeat, interval.start))
    return Math.min(at, Math.max(interval.lastHeartbeat, lastInteractionAt + idleThresholdMs))
  }

  async function openActiveInterval({ startAt, at, clientId, attribution }) {
    const id = createRecordId('active', at)
    await intervals.put(id, {
      id,
      type: ACTIVE_INTERVAL,
      start: Math.max(0, Math.floor(startAt)),
      end: null,
      lastHeartbeat: at,
      ...attribution,
      clientId,
      approximate: false,
      source: 'live',
    })
    return { id }
  }

  async function closeInterval(id, end, { approximate = false } = {}) {
    const interval = intervals.get(id)
    if (!isOpen(interval)) return
    // 结束时刻不能早于最后一次确认的心跳（时钟回拨），也不能晚于当前墙钟
    // （时钟向前跳跃）；两者都取较保守的一侧。
    const ceiling = Math.max(now(), interval.lastHeartbeat)
    const safeEnd = Math.max(
      interval.start,
      interval.lastHeartbeat,
      Math.min(Math.floor(end), ceiling),
    )
    await intervals.put(id, {
      ...interval,
      end: safeEnd,
      lastHeartbeat: Math.max(interval.lastHeartbeat, safeEnd),
      approximate: interval.approximate === true || approximate,
    })
  }

  function findOpenActiveInterval(clientId) {
    for (const [id, interval] of intervals.entries()) {
      if (interval.type !== ACTIVE_INTERVAL) continue
      if (!isOpen(interval)) continue
      if (interval.clientId !== clientId) continue
      return { id, interval }
    }
    return null
  }

  /**
   * 查询给定时间窗口内的在线、活跃与任务时长，以及仪表盘需要的分组与趋势。
   *
   * 这是唯一的统计入口：页面、侧边栏与后续的 timespan_stats 工具都从同一份
   * 结果取数。传 period 时按 Host 本地时区派生日/周/月窗口，传 from/to 时按
   * 显式范围查询；view='dashboard' 额外返回工作区→会话明细与趋势桶。开放
   * 区间一律以 min(窗口上界, 当前时刻) 收口，页面刷新时数字连续增长。
   *
   * 两种口径：总览的 activeMs / taskMs 按时间并集（实际占用）；明细里的
   * activeSumMs / taskSumMs 与工作区、会话行按会话求和（累计工时）。
   */
  function queryStats({ from, to, period, weekStartsOn, view, groupBy, workspace, session } = {}) {
    const current = now()
    const requestedPeriod = isPeriod(period) ? period : null
    // 未显式指定时以 Host 设置为准：设置一改，周窗口、周期卡与趋势桶同步换边界。
    const weekStart = normalizeWeekStart(weekStartsOn ?? currentSettings().weekStartsOn)
    // 显式起止日期优先于周期（供 timespan_stats 的自定义范围使用）；period
    // 仍然决定趋势桶的粒度。只给 from 或只给 to 也按「截至现在 / 从最早开始」处理。
    const hasFrom = Number.isFinite(from)
    const hasTo = Number.isFinite(to)
    const window = hasFrom || hasTo
      ? { from: hasFrom ? from : 0, to: Math.min(hasTo ? to : current, current) }
      : requestedPeriod !== null
        ? periodRange(requestedPeriod, current, { weekStartsOn: weekStart })
        : { from: 0, to: current }
    const startBoundary = window.from
    const endBoundary = Math.max(startBoundary, Math.min(window.to, current))
    const range = { from: startBoundary, to: endBoundary }

    // 工作区/会话筛选是查询期的投影过滤；解析不到的名称不静默忽略，交给调用方
    // 决定如何提示。过滤后的总计、分组与趋势都基于同一批筛选行。
    const filters = resolveStatsFilters(workspace, session)
    const matchRow = (row) => matchesStatsFilter(row, filters)

    const running = isOpen(currentInterval().interval)
    const openActive = [...intervals.entries()].filter(
      ([, interval]) => interval.type === ACTIVE_INTERVAL && isOpen(interval) && matchRow(interval),
    )
    const activeRunning = openActive.some(([, interval]) => current - interval.lastHeartbeat <= ACTIVE_HEARTBEAT_STALE_MS)
    const taskRows = projectTasks(startBoundary, endBoundary, current)
    // 子代理任务保留在 tasks 明细里，但不进入总计与会话列表；这样后续的
    // 子代理明细面板可以复用同一份投影，而总览不会被重复计入。
    const topLevelRows = taskRows.filter((task) => task.origin !== 'subagent' && matchRow(task))
    const visibleTaskRows = filters === null ? taskRows : taskRows.filter(matchRow)
    const activeRanges = projectActiveRanges(startBoundary, endBoundary, current).filter(matchRow)
    const taskSessions = groupTaskSessions(topLevelRows)
    const workspaces = groupWorkspaces(activeRanges, topLevelRows, taskSessions, endBoundary)
    const activeSumMs = workspaces.reduce((total, row) => total + row.activeMs, 0)
    const taskSumMs = workspaces.reduce((total, row) => total + row.taskMs, 0)

    const stats = {
      from: startBoundary,
      to: endBoundary,
      range,
      period: requestedPeriod,
      weekStartsOn: weekStart,
      // 在线时长是应用级指标，不归属到任何工作区或会话；带归属筛选时不能把
      // 全应用在线时间冒充成该筛选范围的时间，故归零并在工具文本里省略。
      onlineMs: filters === null
        ? unionDuration(intervals, ONLINE_INTERVAL, startBoundary, endBoundary,
            (interval) => onlineIntervalEnd(interval, current, endBoundary))
        : 0,
      activeMs: unionRanges(activeRanges.map((entry) => [entry.start, entry.end])),
      activeSumMs,
      taskMs: sumTaskUnion(topLevelRows, startBoundary, endBoundary),
      taskSumMs,
      taskCount: topLevelRows.length,
      taskRunning: topLevelRows.some((task) => task.running),
      sessions: taskSessions,
      tasks: visibleTaskRows.sort((left, right) => right.start - left.start),
      running,
      activeRunning,
      approximate: hasApproximateRecords(startBoundary, endBoundary, current, topLevelRows),
    }
    if (filters !== null) stats.filters = filters
    if (groupBy === 'workspace' || groupBy === 'session') {
      stats.groups = projectStatsGroups(workspaces, groupBy)
    }
    if (view !== 'dashboard' && view !== 'details') return stats
    // 子代理任务不进总计，但要能在父会话明细中看到：按 parentSessionId 交给页面
    // 折叠展示，避免 RPC 直接暴露整张 tasks 原始明细。
    // 子代理任务不进总计，是否露出明细由 Host 设置决定；页面只渲染拿到的行，
    // 不自己判断开关，也不缓存一份业务状态副本。
    const subagentTasks = currentSettings().showSubagents
      ? taskRows
          .filter((task) => task.origin === 'subagent' && task.parentSessionId !== null)
          .map((task) => ({
            sessionId: task.sessionId,
            sessionTitle: task.sessionTitle,
            parentSessionId: task.parentSessionId,
            durationMs: task.durationMs,
            taskCount: 1,
            start: task.start,
          }))
      : []
    const result = { ...stats, workspaces, subagentTasks }
    // 明细只需要工作区与会话；趋势和周期卡仅属于概览/趋势页，查询自定义
    // 历史范围时跳过这部分计算，避免「全部」范围重复扫描。
    if (view === 'details') return result
    return {
      ...result,
      trend: computeTrend(requestedPeriod, current, weekStart, filters),
      cycles: computeCycles(current, weekStart, filters),
    }
  }

  /**
   * 按 Host 本地时区的自然日返回逐日三项时长序列，供热力图使用。
   *
   * `from` / `to` 只用来确定首末自然日（含首尾），时刻部分被忽略；每个桶
   * 都是完整的本地自然日。原始区间在查询时裁剪，不写入任何预聚合数据。
   * 在线与活跃是时间并集（实际占用），任务沿用 `queryStats` 的顶层任务
   * 并集口径；子代理任务不进入三项时长总计。`hasObservations` 表示该日
   * 是否存在可计入三项口径的观测记录，启用前与无数据的日期为 false。
   */
  function queryDailySeries({ from, to } = {}) {
    if (typeof from !== 'number' || !Number.isFinite(from) || typeof to !== 'number' || !Number.isFinite(to)) {
      throw new Error('queryDailySeries 需要有限数字的 from 与 to')
    }
    if (from > to) throw new Error('queryDailySeries 的 from 不能晚于 to')

    const current = now()
    const calendar = localDayRange(from, to)
    const days = calendar.days.map((day) => {
      const taskRows = projectTasks(day.from, day.to, current)
      const topLevelRows = taskRows.filter((task) => task.origin !== 'subagent')
      const activeRanges = projectActiveRanges(day.from, day.to, current)
      const onlineMs = unionDuration(intervals, ONLINE_INTERVAL, day.from, day.to,
        (interval) => onlineIntervalEnd(interval, current, day.to))
      const activeMs = unionRanges(activeRanges.map((entry) => [entry.start, entry.end]))
      const taskMs = sumTaskUnion(topLevelRows, day.from, day.to)
      return {
        dateKey: day.dateKey,
        from: day.from,
        to: day.to,
        onlineMs,
        activeMs,
        taskMs,
        hasObservations: onlineMs > 0 || activeMs > 0 || topLevelRows.length > 0,
      }
    })
    const observedDays = days.filter((day) => day.hasObservations)
    const onlineMs = observedDays.reduce((total, day) => total + day.onlineMs, 0)
    const activeMs = observedDays.reduce((total, day) => total + day.activeMs, 0)
    const taskMs = observedDays.reduce((total, day) => total + day.taskMs, 0)
    const activeDays = observedDays.filter((day) => day.activeMs > 0).length
    let peak = null
    for (const day of observedDays) {
      if (day.activeMs <= 0) continue
      if (peak === null || day.activeMs > peak.activeMs) {
        peak = { dateKey: day.dateKey, activeMs: day.activeMs }
      }
    }
    return {
      range: calendar.range,
      days,
      summary: {
        onlineMs,
        activeMs,
        taskMs,
        activeDays,
        observedDays: observedDays.length,
        dailyAverageActiveMs: observedDays.length > 0 ? Math.round(activeMs / observedDays.length) : 0,
        peak,
      },
    }
  }

  /**
   * 把工具传入的工作区/会话名称解析成稳定 ID。优先精确 ID，其次大小写不敏感的
   * 完整标题匹配；重名不算匹配，避免把两个同名工作区悄悄合并成一份统计。
   * 返回结构只包含查询需要的身份与状态，不读也不改任何设置。
   */
  function resolveStatsFilters(workspace, session) {
    const requestedWorkspace = normalizeFilterText(workspace)
    const requestedSession = normalizeFilterText(session)
    if (requestedWorkspace === null && requestedSession === null) return null

    const index = collectDimensionIndex()
    const result = {
      workspace: null,
      session: null,
      mismatch: false,
    }
    if (requestedWorkspace !== null) {
      const matched = matchDimension(index.workspaces, requestedWorkspace)
      result.workspace = {
        requested: requestedWorkspace,
        status: matched.status,
        id: matched.entry?.id ?? null,
        title: matched.entry?.title ?? null,
        candidates: matched.candidates,
      }
    }
    if (requestedSession !== null) {
      const matched = matchDimension(index.sessions, requestedSession)
      result.session = {
        requested: requestedSession,
        status: matched.status,
        id: matched.entry?.id ?? null,
        title: matched.entry?.title ?? null,
        workspaceId: matched.entry?.workspaceId ?? null,
        candidates: matched.candidates,
      }
    }
    if (
      result.workspace?.status === 'matched' &&
      result.session?.status === 'matched' &&
      result.session.workspaceId !== null &&
      result.workspace.id !== result.session.workspaceId
    ) {
      result.mismatch = true
    }
    return result
  }

  function collectDimensionIndex() {
    const workspaces = new Map()
    const sessions = new Map()

    function visit(record) {
      const at = Number(record?.end ?? record?.start ?? 0)
      const workspaceId = normalizeNullableText(record?.workspaceId)
      const workspaceTitle = normalizeNullableText(record?.workspaceTitle)
      if (workspaceId !== null) {
        const previous = workspaces.get(workspaceId)
        if (previous === undefined || (workspaceTitle !== null && at >= previous.at)) {
          workspaces.set(workspaceId, { id: workspaceId, title: workspaceTitle ?? previous?.title ?? null, at })
        }
      }

      const sessionId = normalizeNullableText(record?.sessionId)
      if (sessionId !== null) {
        const sessionTitle = normalizeNullableText(record?.sessionTitle)
        const previous = sessions.get(sessionId)
        if (
          previous === undefined ||
          (sessionTitle !== null && at >= previous.at) ||
          (previous.workspaceId === null && workspaceId !== null && at >= previous.at)
        ) {
          sessions.set(sessionId, {
            id: sessionId,
            title: sessionTitle ?? previous?.title ?? null,
            workspaceId: workspaceId ?? previous?.workspaceId ?? null,
            at,
          })
        }
      }
    }

    for (const [, task] of tasks.entries()) visit(task)
    for (const [, interval] of intervals.entries()) visit(interval)
    return { workspaces: [...workspaces.values()], sessions: [...sessions.values()] }
  }

  function matchDimension(entries, requested) {
    const exact = entries.find((entry) => entry.id === requested)
    if (exact !== undefined) return { status: 'matched', entry: exact, candidates: [] }
    const wanted = requested.toLowerCase()
    const byTitle = entries.filter(
      (entry) => typeof entry.title === 'string' && entry.title.trim().toLowerCase() === wanted,
    )
    if (byTitle.length === 1) return { status: 'matched', entry: byTitle[0], candidates: [] }
    if (byTitle.length > 1) {
      return { status: 'ambiguous', entry: null, candidates: byTitle.map((entry) => entry.id) }
    }
    return { status: 'missing', entry: null, candidates: [] }
  }

  function statsFiltersMatched(filters) {
    return (
      (filters.workspace === null || filters.workspace.status === 'matched') &&
      (filters.session === null || filters.session.status === 'matched') &&
      filters.mismatch !== true
    )
  }

  function matchesStatsFilter(row, filters) {
    if (filters === null) return true
    if (!statsFiltersMatched(filters)) return false
    if (filters.workspace !== null && row.workspaceId !== filters.workspace.id) return false
    if (filters.session !== null && row.sessionId !== filters.session.id) return false
    return true
  }

  function projectStatsGroups(workspaces, groupBy) {
    if (groupBy === 'workspace') {
      return workspaces.map((workspace) => ({
        kind: 'workspace',
        id: workspace.workspaceId,
        title: workspace.workspaceTitle,
        workspaceId: workspace.workspaceId,
        workspaceTitle: workspace.workspaceTitle,
        activeMs: workspace.activeMs,
        taskMs: workspace.taskMs,
        taskCount: workspace.taskCount,
        share: workspace.share,
        lastActivityAt: workspace.lastActivityAt > 0 ? workspace.lastActivityAt : null,
      }))
    }
    const rows = []
    for (const workspace of workspaces) {
      for (const session of workspace.sessions) {
        rows.push({
          kind: 'session',
          id: session.sessionId,
          title: session.sessionTitle,
          workspaceId: session.workspaceId,
          workspaceTitle: session.workspaceTitle,
          activeMs: session.activeMs,
          taskMs: session.taskMs,
          taskCount: session.taskCount,
          share: null,
          lastActivityAt: session.lastActivityAt > 0 ? session.lastActivityAt : null,
        })
      }
    }
    return rows.sort(
      (left, right) => right.taskMs - left.taskMs || String(left.id).localeCompare(String(right.id)),
    )
  }

  /**
   * 导出由 Host 直接产出可下载的文件内容；Client 只负责把 content 交给 Blob，
   * 不参与序列化、不持有业务状态副本。JSON 给原始记录，CSV 逐日调用同一套
   * queryStats 投影再按工作区铺平，导出数字与页面因此永远一致。
   */
  async function exportData(options = {}) {
    return withWriteLock(() => {
      const format = options?.format
      if (!isExportFormat(format)) throw new Error(`不支持的导出格式：${String(format)}`)
      const exportedAt = now()
      const settings = currentSettings()
      const intervalRows = [...intervals.entries()].map(([, record]) => ({ ...record }))
      const taskRows = [...tasks.entries()].map(([, record]) => ({ ...record }))
      const days = format === 'csv' ? collectDayRows(exportedAt) : null
      const content = format === 'json'
        ? buildJsonExport({ exportedAt, settings, intervals: intervalRows, tasks: taskRows })
        : buildCsvExport({ dayRows: days.rows, durationFormat: settings.durationFormat })
      return {
        format,
        filename: exportFilename(format, exportedAt),
        mimeType: exportMimeType(format),
        content,
        exportedAt,
        // 超过上界时明确告知客户端「被截断」，绝不静默给一份残缺 CSV。
        truncated: days?.truncated === true,
      }
    })
  }

  /**
   * 逐日投影成「日 × 工作区」的平面行；日期边界走 periods 的本地自然日规则。
   * 异常早的时间戳（例如损坏记录）会让天数无限膨胀，因此按 MAX_EXPORT_DAYS
   * 封顶，并把「被截断」如实回给调用方。
   */
  function collectDayRows(exportedAt) {
    const earliest = earliestRecordStart()
    const lastDay = localDayBounds(exportedAt)
    let cursor = localDayBounds(earliest === null ? exportedAt : earliest)
    const rows = []
    let daysScanned = 0
    while (cursor.from < lastDay.to && daysScanned < MAX_EXPORT_DAYS) {
      const stats = queryStats({ from: cursor.from, to: cursor.to, view: 'dashboard' })
      rows.push({
        dateKey: cursor.dateKey,
        onlineMs: stats.onlineMs,
        activeUnionMs: stats.activeMs,
        taskUnionMs: stats.taskMs,
        workspaces: stats.workspaces.map(projectWorkspaceRow),
      })
      cursor = localDayBounds(cursor.to)
      daysScanned += 1
    }
    return { rows, truncated: cursor.from < lastDay.to }
  }

  function projectWorkspaceRow(group) {
    const breakdown = { modelMs: 0, toolMs: 0, waitMs: 0, otherMs: 0 }
    for (const session of group.sessions ?? []) {
      for (const key of Object.keys(breakdown)) {
        const value = Number(session?.[key])
        breakdown[key] += Number.isFinite(value) && value > 0 ? value : 0
      }
    }
    return {
      workspaceId: group.workspaceId ?? '',
      workspaceTitle: group.workspaceTitle ?? '',
      sessionCount: (group.sessions ?? []).length,
      taskCount: group.taskCount,
      activeMs: group.activeMs,
      taskMs: group.taskMs,
      ...breakdown,
    }
  }

  function earliestRecordStart() {
    let earliest = null
    for (const table of [intervals, tasks]) {
      for (const [, record] of table.entries()) {
        const start = Number(record?.start)
        if (!Number.isFinite(start) || start <= 0) continue
        if (earliest === null || start < earliest) earliest = start
      }
    }
    return earliest
  }

  /**
   * 清空只删本域 intervals / tasks 两张表，绝不触碰会话日志；三项设置保留。
   * 清空不是停止记录：立刻从当前时刻建立一条新的在线区间，下一次心跳仍能
   * 正常推进，且所有时长都从 0 起算。回填状态收口为 done + 当前版本，避免
   * 下一次 RPC 兜底触发回填时把刚删掉的历史任务重新灌回空状态。
   */
  async function clearData() {
    return withWriteLock(async () => {
      const at = now()
      let intervalsRemoved = 0
      let tasksRemoved = 0
      for (const table of [intervals, tasks]) {
        for (const key of table.keys()) {
          const removed = await table.delete(key)
          if (removed !== true) continue
          if (table === intervals) intervalsRemoved += 1
          else tasksRemoved += 1
        }
      }

      presenceByClient.clear()
      dataGeneration += 1

      const bootId = createRecordId('boot', at)
      await intervals.put(bootId, {
        id: bootId,
        type: ONLINE_INTERVAL,
        start: at,
        end: null,
        lastHeartbeat: at,
        lastHeartbeatUptime: uptimeMs(),
        ...EMPTY_ATTRIBUTION,
        approximate: false,
        source: 'live',
      })

      const meta = readMeta()
      const previousBackfill = normalizeBackfillStatus(meta.backfill)
      await domain.global.set({
        ...meta,
        settings: currentSettings(),
        // installTime 是插件启用时间，不属于统计数据，清空后保持原值。
        currentBootId: bootId,
        lastHeartbeat: at,
        // 清空结束当前完成事件，但不抹掉通知记录；clearedAt 让下一次真正
        // 发生的回填（手动重试或版本升级）被识别为「清空后重新回填」。
        backfill: normalizeBackfillStatus({
          ...previousBackfill,
          status: 'done',
          version: BACKFILL_VERSION,
          scanned: 0,
          total: 0,
          tasksWritten: 0,
          error: null,
          updatedAt: at,
          eventId: '',
          eventKind: '',
          eventAt: 0,
          readEventId: '',
          readAt: 0,
          clearedAt: at,
        }),
      })
      return { clearedAt: at, intervalsRemoved, tasksRemoved }
    })
  }

  /**
   * 数据导入：入参是 Client 已读文件并 JSON.parse 好的导出对象（Host 不碰
   * 文件系统、不调用浏览器 API），与 exportData / clearData 同级、同属领域层。
   *
   * 规则：格式与版本严格校验，不满足即抛结构化错误且在任何写入之前返回；
   * intervals / tasks 按各自稳定唯一键（优先记录自带 id，详见文件末尾
   * intervalImportKey / taskImportKey 的注释）跳过已存在记录，既不覆盖也不
   * 重复插入；设置默认不恢复，只有显式 restoreSettings === true 才把
   * payload.settings 经 normalizeSettings 白名单合并进当前 meta.settings。
   * 导入结束按 clearData 同一套不变量收口：回填状态置 done + 当前版本、
   * 递增 dataGeneration、合并后 intervals 为空时重开一条在线区间；会话日志
   * 不属于本域，绝不触碰；只写本插件 storageDomain。
   */
  async function importData(payload) {
    return withWriteLock(async () => {
      // 校验全部前置：任何一条不满足都在写入之前抛错，保证「拒绝且不改库」。
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        throw importValidationError('invalid-payload', '导入载荷必须是对象')
      }
      if (payload.format !== EXPORT_FORMAT && payload.format !== LEGACY_EXPORT_FORMAT) {
        throw importValidationError('invalid-format', `导入文件格式不合法：${String(payload.format)}`)
      }
      if (payload.version !== 1) {
        throw importValidationError('unsupported-version', `不支持的导入文件版本：${String(payload.version)}`)
      }
      if (!Array.isArray(payload.intervals)) {
        throw importValidationError('invalid-intervals', '导入文件的 intervals 必须是数组')
      }
      if (!Array.isArray(payload.tasks)) {
        throw importValidationError('invalid-tasks', '导入文件的 tasks 必须是数组')
      }

      const at = now()
      const restoreSettings = payload.restoreSettings === true

      // 现有记录的存储键即各自的 id；以此作为「已存在」集合，导入过程中新写入
      // 的键也即时加入，顺带把载荷内部的重复 ID 一并跳过。
      const seenIntervalKeys = new Set(intervals.keys())
      const seenTaskKeys = new Set(tasks.keys())
      const hadIntervals = seenIntervalKeys.size > 0

      let importedIntervals = 0
      let skippedIntervals = 0
      for (const record of payload.intervals) {
        const key = intervalImportKey(record)
        // 非对象条目与已存在/重复键一律跳过并计入 skipped，绝不写进存储。
        if (key === null || seenIntervalKeys.has(key)) {
          skippedIntervals += 1
          continue
        }
        // 补上 id（无显式 id 的兜底键），让落库记录始终满足 domain-spec 的必填形状。
        await intervals.put(key, { ...record, id: key })
        seenIntervalKeys.add(key)
        importedIntervals += 1
      }

      let importedTasks = 0
      let skippedTasks = 0
      for (const record of payload.tasks) {
        const key = taskImportKey(record)
        if (key === null || seenTaskKeys.has(key)) {
          skippedTasks += 1
          continue
        }
        await tasks.put(key, { ...record, id: key })
        seenTaskKeys.add(key)
        importedTasks += 1
      }

      // 合并而非清空：实时在线/活跃跟踪与内存 presence 状态保持原样，不清空。
      dataGeneration += 1

      // 设置：默认保留当前值；显式要求恢复时经白名单合并，未知字段被丢弃。
      const meta = readMeta()
      const settings = restoreSettings
        ? mergeSettings(meta.settings, payload.settings)
        : currentSettings()
      const previousBackfill = normalizeBackfillStatus(meta.backfill)
      const nextMeta = {
        ...meta,
        settings,
        // 照抄 clearData：回填收口为 done + 当前版本，避免下一次 RPC 兜底
        // 触发回填时把刚导入的数据当成需要重扫的历史。
        backfill: normalizeBackfillStatus({
          ...previousBackfill,
          status: 'done',
          version: BACKFILL_VERSION,
          scanned: 0,
          total: 0,
          tasksWritten: 0,
          error: null,
          updatedAt: at,
          eventId: '',
          eventKind: '',
          eventAt: 0,
          readEventId: '',
          readAt: 0,
          clearedAt: at,
        }),
      }

      // 合并后 intervals 仍为空（全新空域导入空文件）：照抄 clearData 重开
      // 一条在线区间，保证在线时长能从当前时刻继续记录。
      if (!hadIntervals && importedIntervals === 0) {
        const bootId = createRecordId('boot', at)
        await intervals.put(bootId, {
          id: bootId,
          type: ONLINE_INTERVAL,
          start: at,
          end: null,
          lastHeartbeat: at,
          lastHeartbeatUptime: uptimeMs(),
          ...EMPTY_ATTRIBUTION,
          approximate: false,
          source: 'live',
        })
        presenceByClient.clear()
        nextMeta.currentBootId = bootId
        nextMeta.lastHeartbeat = at
      }

      await domain.global.set(nextMeta)

      return {
        imported: { intervals: importedIntervals, tasks: importedTasks },
        skipped: { intervals: skippedIntervals, tasks: skippedTasks },
        settingsRestored: restoreSettings,
        dataGeneration,
      }
    })
  }

  /** 三张周期卡：一次查询同时给出今日/本周/本月的轻量汇总。 */
  function computeCycles(current, weekStartsOn, filters = null) {
    const cycles = {}
    for (const cycle of PERIODS) {
      const bounds = periodRange(cycle, current, { weekStartsOn })
      const to = Math.min(bounds.to, current)
      const ranges = projectActiveRanges(bounds.from, to, current).filter((row) => matchesStatsFilter(row, filters))
      const rows = projectTasks(bounds.from, to, current).filter(
        (task) => task.origin !== 'subagent' && matchesStatsFilter(task, filters),
      )
      cycles[cycle] = {
        from: bounds.from,
        to,
        onlineMs: filters === null
          ? unionDuration(intervals, ONLINE_INTERVAL, bounds.from, to,
              (interval) => onlineIntervalEnd(interval, current, to))
          : 0,
        activeMs: unionRanges(ranges.map((entry) => [entry.start, entry.end])),
        taskMs: sumTaskUnion(rows, bounds.from, to),
        taskCount: rows.length,
        taskRunning: rows.some((task) => task.running),
      }
    }
    return cycles
  }

  /** 把活跃区间裁剪到查询窗口并带上归属；开放区间按心跳容忍期收口。 */
  function projectActiveRanges(from, to, current) {
    const ranges = []
    for (const [, interval] of intervals.entries()) {
      if (interval.type !== ACTIVE_INTERVAL) continue
      const rawEnd = interval.end ?? activeIntervalEnd(interval, current, to)
      const start = Math.max(interval.start, from)
      const end = Math.min(rawEnd, to)
      if (end <= start) continue
      ranges.push({
        start,
        end,
        sessionId: interval.sessionId ?? null,
        workspaceId: interval.workspaceId ?? null,
        workspaceTitle: interval.workspaceTitle ?? null,
        sessionTitle: interval.sessionTitle ?? null,
        approximate: interval.approximate === true,
      })
    }
    return ranges
  }

  /** 查询窗口内是否存在按最后心跳/最后事件推断出来的近似记录。 */
  function hasApproximateRecords(from, to, current, taskRows) {
    for (const [, interval] of intervals.entries()) {
      if (interval.approximate !== true) continue
      const end = interval.end ?? (interval.type === ACTIVE_INTERVAL
        ? activeIntervalEnd(interval, current, to)
        : Math.min(current, to))
      if (interval.start <= to && end >= from) return true
    }
    return taskRows.some((task) => task.approximate === true)
  }

  /**
   * 工作区→会话明细。以任务会话行作为骨架，补进只有活跃、没有任务的会话，
   * 再按工作区聚合。会话活跃时长取该会话内区间的并集；工作区的活跃与任务
   * 时长都是其下会话的求和，因此明细之和恒等于累计工时。
   */
  function groupWorkspaces(activeRanges, taskRows, taskSessions, to) {
    const sessions = new Map()
    for (const row of taskSessions) {
      sessions.set(row.sessionId, { ...row, activeMs: 0, activeRanges: [], lastActivityAt: 0 })
    }

    function ensureSession(sessionId) {
      let row = sessions.get(sessionId)
      if (row !== undefined) return row
      row = {
        sessionId,
        sessionTitle: null,
        workspaceId: null,
        workspaceTitle: null,
        taskMs: 0,
        taskCount: 0,
        taskRunning: false,
        approximate: false,
        ...emptyBreakdown(),
        hasBreakdown: true,
        activeMs: 0,
        activeRanges: [],
        lastActivityAt: 0,
      }
      sessions.set(sessionId, row)
      return row
    }

    for (const range of activeRanges) {
      const row = ensureSession(range.sessionId)
      row.activeRanges.push([range.start, range.end])
      row.lastActivityAt = Math.max(row.lastActivityAt, range.end)
      row.approximate = row.approximate || range.approximate === true
      if (range.sessionTitle !== null) row.sessionTitle = range.sessionTitle
      if (range.workspaceId !== null) row.workspaceId = range.workspaceId
      if (range.workspaceTitle !== null) row.workspaceTitle = range.workspaceTitle
    }

    for (const task of taskRows) {
      const row = ensureSession(task.sessionId)
      row.lastActivityAt = Math.max(row.lastActivityAt, Math.min(task.end, to))
      if (row.sessionTitle === null && task.sessionTitle !== null) row.sessionTitle = task.sessionTitle
      if (row.workspaceId === null && task.workspaceId !== null) row.workspaceId = task.workspaceId
      if (row.workspaceTitle === null && task.workspaceTitle !== null) row.workspaceTitle = task.workspaceTitle
    }

    for (const row of sessions.values()) {
      row.activeMs = unionRanges(row.activeRanges)
      delete row.activeRanges
    }

    const groups = new Map()
    for (const row of sessions.values()) {
      const key = row.workspaceId
      let group = groups.get(key)
      if (group === undefined) {
        group = {
          workspaceId: key,
          workspaceTitle: null,
          activeMs: 0,
          taskMs: 0,
          taskCount: 0,
          taskRunning: false,
          approximate: false,
          share: 0,
          lastActivityAt: 0,
          sessions: [],
        }
        groups.set(key, group)
      }
      group.activeMs += row.activeMs
      group.taskMs += row.taskMs
      group.taskCount += row.taskCount
      group.taskRunning = group.taskRunning || row.taskRunning
      group.approximate = group.approximate || row.approximate
      group.lastActivityAt = Math.max(group.lastActivityAt, row.lastActivityAt)
      if (row.workspaceTitle !== null) group.workspaceTitle = row.workspaceTitle
      group.sessions.push(row)
    }

    const rows = [...groups.values()]
    const totalTaskMs = rows.reduce((sum, group) => sum + group.taskMs, 0)
    for (const group of rows) {
      group.share = totalTaskMs > 0 ? group.taskMs / totalTaskMs : 0
      // 会话列表按最近活动倒序；统计范围拉大后，旧会话不会仅因累计任务
      // 时长更高而排到刚用过的会话前面。最近活动相同时再按任务时长兜底。
      group.sessions.sort(
        (left, right) => right.lastActivityAt - left.lastActivityAt
          || right.taskMs - left.taskMs
          || String(left.sessionId).localeCompare(String(right.sessionId)),
      )
    }
    rows.sort(
      (left, right) => right.taskMs - left.taskMs || String(left.workspaceId).localeCompare(String(right.workspaceId)),
    )
    return rows
  }

  /** 趋势桶的活跃与任务双系列；桶之间互不重叠，裁剪后可直接相加。 */
  function computeTrend(period, current, weekStartsOn, filters = null) {
    if (period === null) return []
    return trendBuckets(period, current, { weekStartsOn }).map((bucket) => {
      if (bucket.to <= bucket.from) return { ...bucket, activeMs: 0, taskMs: 0 }
      const ranges = projectActiveRanges(bucket.from, bucket.to, current).filter((row) =>
        matchesStatsFilter(row, filters),
      )
      const rows = projectTasks(bucket.from, bucket.to, current).filter(
        (task) => task.origin !== 'subagent' && matchesStatsFilter(task, filters),
      )
      return {
        ...bucket,
        activeMs: unionRanges(ranges.map((entry) => [entry.start, entry.end])),
        taskMs: sumTaskUnion(rows, bucket.from, bucket.to),
      }
    })
  }

  /** 查询窗口内的全部任务；子代理是否计入由调用方按口径过滤。 */
  function projectTasks(from, to, current) {
    const rows = []
    for (const [id, task] of tasks.entries()) {
      // 回填是逐事件重放：turn/start 已写、turn/end 还没写的半成品任务如果
      // 在这里露出，会被当成从历史起点一直运行到当前的巨型任务。它们会在
      // 会话重放结束时按日志时间收口，收口前一律不参与统计。
      if (task.source === 'backfill' && isOpenTask(task)) continue
      if (!taskOverlaps(task, from, to, current)) continue
      const projected = projectTask({ ...task, id }, from, to, current)
      if (projected !== null) rows.push(projected)
    }
    return rows
  }

  function projectTask(task, from, to, current) {
    const running = isOpenTask(task)
    const rawEnd = running ? Math.min(current, to, runningTaskEnd(task, current)) : task.end
    const start = Math.max(task.start, from)
    const end = Math.min(rawEnd, to)
    if (end < start) return null
    const hasBreakdown = task.hasBreakdown !== false
    const breakdown = hasBreakdown
      ? computeTaskBreakdown(task.segments, start, end)
      : emptyBreakdown()
    return {
      id: task.id,
      key: task.key ?? logicalTaskKey(task.sessionId, task.turn),
      sessionId: task.sessionId,
      turn: task.turn,
      parentSessionId: task.parentSessionId ?? null,
      origin: task.origin ?? null,
      workspaceId: task.workspaceId ?? null,
      workspaceTitle: task.workspaceTitle ?? null,
      sessionTitle: task.sessionTitle ?? null,
      start: task.start,
      end: rawEnd,
      running,
      endReason: task.endReason ?? null,
      approximate: task.approximate === true,
      hasBreakdown,
      durationMs: end - start,
      modelMs: breakdown.modelMs,
      toolMs: breakdown.toolMs,
      waitMs: breakdown.waitMs,
      otherMs: breakdown.otherMs,
    }
  }

  function groupTaskSessions(rows) {
    const groups = new Map()
    for (const row of rows) {
      let group = groups.get(row.sessionId)
      if (group === undefined) {
        group = {
          sessionId: row.sessionId,
          sessionTitle: null,
          workspaceId: null,
          workspaceTitle: null,
          taskMs: 0,
          taskCount: 0,
          taskRunning: false,
          approximate: false,
          ...emptyBreakdown(),
          hasBreakdown: true,
        }
        groups.set(row.sessionId, group)
      }
      group.taskMs += row.durationMs
      group.taskCount += 1
      group.taskRunning = group.taskRunning || row.running
      group.approximate = group.approximate || row.approximate
      group.modelMs += row.modelMs
      group.toolMs += row.toolMs
      group.waitMs += row.waitMs
      group.otherMs += row.otherMs
      group.hasBreakdown = group.hasBreakdown && row.hasBreakdown
      if (row.sessionTitle !== null) group.sessionTitle = row.sessionTitle
      if (row.workspaceId !== null) group.workspaceId = row.workspaceId
      if (row.workspaceTitle !== null) group.workspaceTitle = row.workspaceTitle
    }
    return [...groups.values()].sort((left, right) => right.taskMs - left.taskMs)
  }

  function activeIntervalEnd(interval, current, endBoundary) {
    if (current - interval.lastHeartbeat <= ACTIVE_HEARTBEAT_STALE_MS) return Math.min(current, endBoundary)
    return Math.min(interval.lastHeartbeat, endBoundary)
  }

  /**
   * 开放在线区间的投影结束时刻。正常情况下延伸到当前墙钟；如果墙钟比
   * 进程单调时钟多走了太多（系统时钟向前跳跃），只延伸到「最后心跳 +
   * 真实经过的 uptime」，避免一次查询看到几天甚至几年的在线时长。
   * 旧记录没有单调时钟读数时保持原有墙钟行为。
   */
  function onlineIntervalEnd(interval, current, endBoundary) {
    const wallEnd = Math.min(current, endBoundary)
    const last = interval.lastHeartbeat
    const lastUptime = interval.lastHeartbeatUptime
    if (!Number.isFinite(last) || !Number.isFinite(lastUptime)) return wallEnd
    const wallElapsed = current - last
    if (wallElapsed <= ONLINE_CLOCK_JUMP_GUARD_MS) return wallEnd
    const monotonicElapsed = Math.max(0, uptimeMs() - lastUptime)
    if (wallElapsed > monotonicElapsed + CLOCK_DRIFT_TOLERANCE_MS) {
      return Math.min(last + monotonicElapsed, endBoundary)
    }
    return wallEnd
  }

  /** 插件卸载时正常收口；崩溃时由下一次 start() 按最后心跳收口。 */
  async function close() {
    const at = now()
    const { meta, bootId, interval } = currentInterval()
    if (isOpen(interval)) {
      // 正常卸载时在线一直算到退出时刻（含休眠，符合「进程启动到退出」的
      // 口径）；只有墙钟明显快于单调时钟的跳跃才按真实经过的 uptime 收口，
      // 并把推断的结束时刻标记为近似。
      const jumped = clockJumpElapsed(interval, at)
      const end = jumped === null
        ? Math.max(interval.start, interval.lastHeartbeat, at)
        : Math.max(interval.start, interval.lastHeartbeat + jumped)
      await intervals.put(bootId, {
        ...interval,
        end,
        lastHeartbeat: end,
        approximate: interval.approximate === true || jumped !== null,
      })
      await domain.global.set({ ...meta, lastHeartbeat: end })
    }
    for (const [id, active] of intervals.entries()) {
      if (active.type !== ACTIVE_INTERVAL || !isOpen(active)) continue
      // 活跃区间只算到最后一次确认的心跳；插件卸载或页面刷新发生在长时间
      // 挂起之后时，不能把未确认的空白时间按卸载时刻拉长。时钟回拨时也
      // 不能把结束时刻推到已知心跳之前。
      const end = Math.max(active.start, active.lastHeartbeat)
      await intervals.put(id, { ...active, end, lastHeartbeat: Math.max(active.lastHeartbeat, end) })
    }
    await closeAllOpenTasks('interrupted')
    presenceByClient.clear()
  }

  function currentInterval() {
    const meta = readMeta()
    const bootId = meta.currentBootId
    const interval = typeof bootId === 'string' ? intervals.get(bootId) : undefined
    return { meta, bootId, interval }
  }

  function isOpen(interval) {
    return interval !== undefined && (interval.end === null || interval.end === undefined)
  }

  function readMeta() {
    const value = domain.global.get()
    if (value === undefined || value === null || typeof value !== 'object') return {}
    return value
  }

  function now() {
    const value = Number(clock.now())
    return Number.isFinite(value) ? Math.floor(value) : 0
  }

  function uptimeMs() {
    const value = Number(clock.uptimeMs())
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  }

  /**
   * 后台回填：把 Host 读到的已持久化会话快照重放进同一套任务归约器。
   *
   * 幂等有两层：任务键 sessionId:turn 让重复重放不新增任务；meta 里的
   * backfill 状态成功后记为 done 且写入算法版本，只有版本一致才短路。失败记为 failed，页面可点「重试」用 force=true 再跑一次；版本升级后旧的 done 会自动失效重扫。
   * 回填不补在线/活跃区间：按 ADR-0001，在线由 Host 进程生命周期记录、活跃
   * 由客户端心跳推导，两者都是插件启用后的实时观测，历史日志无法重建。
   * loadSessions 由 Host 注入，领域服务因此不依赖 DSH 运行时、真实文件系统
   * 与真实时钟；测试注入夹具即可。
   */
  async function backfill(loadSessions, options = {}) {
    // 回填是长任务：记下代次，清空后每个会话/事件边界都能立刻收手。
    const generation = dataGeneration
    const existing = getBackfillStatus()
    if (existing.status === 'done' && existing.version === BACKFILL_VERSION && options.force !== true) {
      return existing
    }
    if (typeof loadSessions !== 'function') {
      return setBackfillStatus({ status: 'failed', error: '回填缺少会话读取器' }, generation)
    }
    // 本次完成事件的原因：清空后的再次回填优先于手动重试，因为用户先清空
    // 再重试时，记成「清空后重新回填」更贴近真实变化；版本升级次之。
    const eventKind = existing.clearedAt > 0
      ? 'clear'
      : options.force === true
        ? 'retry'
        : existing.status === 'done' && existing.version !== BACKFILL_VERSION
          ? 'version'
          : 'initial'
    const yieldFn = typeof options.yield === 'function' ? options.yield : () => Promise.resolve()
    let scanned = 0
    let total = 0
    let tasksWritten = 0
    try {
      await setBackfillStatus({ status: 'running', scanned: 0, total: 0, tasksWritten: 0, error: null }, generation)
      const snapshots = await loadSessions()
      const sessions = Array.isArray(snapshots) ? snapshots : []
      total = sessions.length
      await setBackfillStatus({ status: 'running', scanned: 0, total, tasksWritten: 0, error: null }, generation)

      for (const entry of sessions) {
        if (generation !== dataGeneration) return getBackfillStatus()
        // 条目可以自带 load()：Host 逐个解压历史日志，避免一次把全部会话的
        // 事件堆在内存里；total 在扫描开始前就已知，页面进度不会停在 0/0。
        const snapshot = typeof entry?.load === 'function' ? await entry.load() : entry
        const plan = planBackfillSession(snapshot)
        if (plan !== null) {
          for (const event of plan.events) {
            // 每个事件单独申请写锁：实时事件可以在两次重放之间插队，回填
            // 因此不会长时间占住写队列而阻塞实时记录。清空可能排在锁后面，
            // 所以代次检查要放进锁内，不能只在循环外做。
            await withWriteLock(() => {
              if (generation !== dataGeneration) return undefined
              return applySessionEvent({ sessionId: plan.sessionId, header: plan.header, event, source: 'backfill' })
            })
            if (generation !== dataGeneration) return getBackfillStatus()
          }
          await withWriteLock(() => {
            if (generation !== dataGeneration) return undefined
            return finalizeBackfillSession(plan.sessionId, plan.logEndAt)
          })
        }
        // 统计「当前共有多少条回填任务」而不是本会话新增数：同一会话的多个
        // 快照不能累加两次，重试时也能显示真实的历史任务数。
        tasksWritten = countBackfillTasks()
        scanned += 1
        await setBackfillStatus({ status: 'running', scanned, total, tasksWritten, error: null }, generation)
        // 会话之间让出事件循环，让实时 session/event 与 presence 心跳有机会执行。
        await yieldFn()
      }
      // 每完成一次真实的回填扫描就生成一代新事件：eventId 一旦写入 meta 就
      // 稳定不变，同一事件多次查询不会漂移；旧 readEventId 自然不等于新 id，
      // 因此版本升级、清空后的再次回填、手动重试都会重新提示一次。
      const completedAt = now()
      const current = getBackfillStatus()
      const eventSeq = Math.max(current.eventSeq, current.notices.length) + 1
      const eventId = `backfill_${eventSeq}_v${BACKFILL_VERSION}`
      const notice = {
        eventId,
        kind: eventKind,
        version: BACKFILL_VERSION,
        total,
        tasksWritten,
        completedAt,
        readAt: 0,
      }
      return await setBackfillStatus({
        status: 'done',
        version: BACKFILL_VERSION,
        scanned,
        total,
        tasksWritten,
        error: null,
        eventId,
        eventKind,
        eventAt: completedAt,
        eventSeq,
        clearedAt: 0,
        notices: [...current.notices, notice],
      }, generation)
    } catch (error) {
      if (generation !== dataGeneration) return getBackfillStatus()
      return await setBackfillStatus({
        status: 'failed',
        scanned,
        total,
        tasksWritten,
        error: String(error?.message ?? error),
      }, generation)
    }
  }

  /** 历史日志里没有 turn/end 的残余任务按日志最后事件时间近似收口，并标「未拆分」。 */
  async function finalizeBackfillSession(sessionId, logEndAt) {
    for (const [id, task] of tasks.entries()) {
      if (task.sessionId !== sessionId || task.source !== 'backfill') continue
      const segments = Array.isArray(task.segments) ? task.segments : []
      const hasBreakdown = segments.length > 0
      if (isOpenTask(task)) {
        const end = Math.max(task.start, logEndAt > 0 ? logEndAt : (task.lastEventAt ?? task.start))
        await tasks.put(id, { ...finalizeTask({ ...task, id }, end, 'interrupted', true), hasBreakdown })
      } else if (!hasBreakdown && task.hasBreakdown !== false) {
        await tasks.put(id, { ...task, hasBreakdown: false })
      }
    }
  }

  function countBackfillTasks() {
    let count = 0
    for (const [, task] of tasks.entries()) {
      if (task.source === 'backfill') count += 1
    }
    return count
  }

  function getBackfillStatus() {
    return normalizeBackfillStatus(readMeta().backfill)
  }

  async function setBackfillStatus(patch, generation = dataGeneration) {
    return withWriteLock(async () => {
      // 清空已发生：这一代回填的进度写入全部作废，直接读回当前（已完成）状态。
      if (generation !== dataGeneration) return getBackfillStatus()
      const meta = readMeta()
      const next = normalizeBackfillStatus({ ...(meta.backfill ?? {}), ...patch, updatedAt: now() })
      await domain.global.set({ ...meta, backfill: next })
      return next
    })
  }

  /**
   * 写入回填完成事件的已读锚点。只接受当前事件，未知/旧事件保持原状，
   * 避免页面持有旧 eventId 与新一代事件竞态时误把新事件标成已读。
   * 已读是幂等的：同一事件重复标记不会改写第一次的已读时间。
   */
  async function markBackfillRead(eventId) {
    return withWriteLock(async () => {
      const meta = readMeta()
      const status = normalizeBackfillStatus(meta.backfill)
      if (typeof eventId !== 'string' || eventId.length === 0) return status
      if (status.eventId === '' || status.eventId !== eventId) return status
      if (status.readEventId === eventId) return status
      const at = now()
      const notices = status.notices.map((notice) =>
        notice.eventId === eventId ? { ...notice, readAt: at } : notice)
      const next = normalizeBackfillStatus({ ...status, readEventId: eventId, readAt: at, notices })
      await domain.global.set({ ...meta, backfill: next })
      return next
    })
  }

  // 对外暴露的是加锁包装；backfill 自身不整体持锁，内部按事件分段申请，
  // 否则一次长回填会把实时记录堵在写队列后面。
  return {
    start: () => withWriteLock(start),
    recordPresence: (input) => withWriteLock(() => recordPresence(input)),
    recordSessionEvent: (input) => withWriteLock(() => applySessionEvent(input)),
    queryStats,
    queryDailySeries,
    getSettings,
    setSettings,
    resetSettings,
    exportData,
    clearData,
    importData,
    close: () => withWriteLock(close),
    backfill,
    getBackfillStatus,
    markBackfillRead,
  }
}

/** 生成一条记录的稳定标识；同一毫秒内多次写入也保持唯一。 */
function createRecordId(prefix, at) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `${prefix}_${at.toString(36)}_${String(random).replaceAll('-', '').slice(0, 12)}`
}

function normalizeClientId(value) {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 128) : 'default-client'
}

function normalizeLastInteractionAt(value, at) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.min(Math.floor(value), at)
}

function normalizeAttribution(input) {
  return {
    sessionId: normalizeNullableText(input.sessionId),
    workspaceId: normalizeNullableText(input.workspaceId),
    workspaceTitle: normalizeNullableText(input.workspaceTitle),
    sessionTitle: normalizeNullableText(input.sessionTitle),
  }
}

function normalizeNullableText(value) {
  if (typeof value !== 'string') return null
  return value.length > 0 ? value.slice(0, 512) : null
}

/** 工具筛选名允许首尾空白，但空字符串等同于没有筛选。 */
function normalizeFilterText(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 512) : null
}

function sameAttribution(interval, attribution) {
  return (
    interval.sessionId === attribution.sessionId &&
    interval.workspaceId === attribution.workspaceId
  )
}

function normalizeTaskSessionId(value) {
  const id = normalizeNullableText(value)
  if (id === null) throw new Error('recordSessionEvent 缺少 sessionId')
  return id
}

function normalizeTurn(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

function normalizeEventTime(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

/**
 * 任务存储键必须同时满足「同一会话同一 turn 唯一」与存储后端的路径安全
 * 约束（per-record 后端只接受字母、数字、下划线与连字符）。会话 id 通常
 * 本身是安全的；遇到异常字符时用 UTF-8 十六进制编码兜底，避免冒号等字符
 * 让写入直接失败。业务层仍用 logicalTaskKey 的 `sessionId:turn` 作为任务键。
 */
function logicalTaskKey(sessionId, turn) {
  return `${sessionId}:${turn}`
}

function taskKey(sessionId, turn) {
  const safeSession = /^[A-Za-z0-9_-]+$/u.test(sessionId)
    ? sessionId
    : `x${utf8Hex(sessionId)}`
  return `${safeSession}_t${turn}`
}

function utf8Hex(value) {
  return [...new TextEncoder().encode(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function emptyBreakdown() {
  return { modelMs: 0, toolMs: 0, waitMs: 0, otherMs: 0 }
}

function isOpenTask(task) {
  return task !== undefined && task !== null && (task.end === null || task.end === undefined)
}

function taskOverlaps(task, from, to, current) {
  const end = isOpenTask(task) ? Math.min(current, to) : task.end
  // 零时长任务（turn/start 与 turn/end 同毫秒）也应出现在任务数与列表中；
  // 这里用闭区间判断重叠，时长统计仍会在 sumTaskUnion 中自然为 0。
  return task.start <= to && end >= from
}

/** 任务总览按时间并集统计：多个会话并发运行时不重复计入同一段时间。 */
function sumTaskUnion(rows, from, to) {
  return unionRanges(
    rows.map((row) => [Math.max(row.start, from), Math.min(row.end, to)]).filter(([start, end]) => end > start),
  )
}

/**
 * 把任务的原始分段切成互不重叠的四类。
 *
 * 优先级为 等待 > 工具 > 模型：`ask_user_question` 的工具区间同时属于工具
 * 执行与等待用户，按等待归类后不再重复计入工具；并行工具调用取并集。剩余
 * 未被任何分段覆盖的时间归「其他」。这样四部分之和恒等于窗口总时长。
 *
 * 实现用「边界扫描」：每个分段在起止点记一条类型增量，按时间点排序后逐段
 * 累加各类在用数量，再按优先级取最高的一类记账。这样每个分段只参与一次，
 * 复杂度 O(n log n)；旧写法在每个基本区间上对全部分段做覆盖判断，分段上千
 * 的任务会退化到 O(n²)（趋势桶与逐日序列每个桶都会重算一次，整页会明显卡）。
 */
function computeTaskBreakdown(segments, start, end) {
  const total = Math.max(0, end - start)
  if (total <= 0) return { modelMs: 0, toolMs: 0, waitMs: 0, otherMs: 0 }
  const boundaries = new Map([[start, { model: 0, tool: 0, wait: 0 }], [end, { model: 0, tool: 0, wait: 0 }]])
  const boundaryAt = (at) => {
    let delta = boundaries.get(at)
    if (delta === undefined) {
      delta = { model: 0, tool: 0, wait: 0 }
      boundaries.set(at, delta)
    }
    return delta
  }
  for (const segment of segments ?? []) {
    if (segment.type !== 'model' && segment.type !== 'tool' && segment.type !== 'wait') continue
    const segmentStart = Math.max(start, segment.start)
    const segmentEnd = Math.min(end, segment.end ?? end)
    if (segmentEnd <= segmentStart) continue
    boundaryAt(segmentStart)[segment.type] += 1
    boundaryAt(segmentEnd)[segment.type] -= 1
  }
  const points = [...boundaries.keys()].sort((left, right) => left - right)
  let modelMs = 0
  let toolMs = 0
  let waitMs = 0
  let activeModel = 0
  let activeTool = 0
  let activeWait = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    const delta = boundaries.get(points[index])
    activeModel += delta.model
    activeTool += delta.tool
    activeWait += delta.wait
    const span = points[index + 1] - points[index]
    if (span <= 0) continue
    if (activeWait > 0) waitMs += span
    else if (activeTool > 0) toolMs += span
    else if (activeModel > 0) modelMs += span
  }
  return {
    modelMs,
    toolMs,
    waitMs,
    otherMs: Math.max(0, total - modelMs - toolMs - waitMs),
  }
}

function unionRanges(ranges) {
  const sorted = ranges.slice().sort((left, right) => left[0] - right[0] || left[1] - right[1])
  let total = 0
  let currentStart = null
  let currentEnd = null
  for (const [start, end] of sorted) {
    if (currentStart === null) {
      currentStart = start
      currentEnd = end
    } else if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end)
    } else {
      total += currentEnd - currentStart
      currentStart = start
      currentEnd = end
    }
  }
  if (currentStart !== null) total += currentEnd - currentStart
  return total
}

/** 把同类型区间按时间并集求和；重叠的多个 Client 区间不会重复计入。 */
function unionDuration(intervals, type, from, to, openEnd) {
  const ranges = []
  for (const [, interval] of intervals.entries()) {
    if (interval.type !== type) continue
    const end = interval.end ?? openEnd(interval)
    const lo = Math.max(interval.start, from)
    const hi = Math.min(end, to)
    if (hi > lo) ranges.push([lo, hi])
  }
  return unionRanges(ranges)
}

/**
 * 导入校验失败的结构化错误：中文 message 给调用方展示，code / name 供上层
 * 按原因分支处理。领域层只抛带信息的 Error，不引入任何运行时依赖。
 */
function importValidationError(code, message) {
  const error = new Error(message)
  error.name = 'DshTimespanImportError'
  error.code = code
  return error
}

/**
 * 导入去重键的约定（与 domain-spec 的存储形状一致）：
 * intervals / tasks 两张表都由领域服务以 table.put(id, { id, ... }) 写入，
 * 且 domain-spec 把 id 定为必填字符串，因此「记录自带的 id」就是稳定唯一键，
 * 按它跳过已存在记录、不覆盖、不重复插入。
 *
 * 兼容极旧或手工构造、缺少显式 id 的导出：改用能稳定标识一条记录的字段
 * 组合兜底——区间用 type|start|end|lastHeartbeat|clientId|sessionId，任务优先
 * 用逻辑键 key（即 sessionId:turn），无 key 时退到 sessionId|turn|start。组合
 * 经固定散列压成路径安全的键，重复导入同一批记录仍会命中同一批键。
 * 非对象条目返回 null，由调用方计入 skipped，绝不写进存储。
 */
function isPlainImportRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 把字段组合压成路径安全的稳定键；FNV-1a 32 位散列，纯函数无依赖。 */
function importStableKey(raw) {
  let hash = 2166136261
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function intervalImportKey(record) {
  if (!isPlainImportRecord(record)) return null
  if (typeof record.id === 'string' && record.id.length > 0) return record.id
  const raw = [
    record.type, record.start, record.end, record.lastHeartbeat,
    record.clientId, record.sessionId,
  ].map((part) => String(part ?? '')).join('|')
  return `import_iv_${importStableKey(raw)}`
}

function taskImportKey(record) {
  if (!isPlainImportRecord(record)) return null
  if (typeof record.id === 'string' && record.id.length > 0) return record.id
  const logical = typeof record.key === 'string' && record.key.length > 0
    ? record.key
    : [record.sessionId, record.turn, record.start].map((part) => String(part ?? '')).join('|')
  return `import_tk_${importStableKey(logical)}`
}
