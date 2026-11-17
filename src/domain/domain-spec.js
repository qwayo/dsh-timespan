/**
 * dsh-timespan 使用的存储域声明。
 *
 * 存储域名固定为 `chrono_scope`：这是已经落盘的持久化键（storages/chrono_scope），
 * 改名会让已有统计与设置失联，因此永久保留；对外的项目名是 dsh-timespan。
 * 域版本固定为 1。per-record 后端把未创建的表视为空表，可兼容新增表与字段。
 *
 * 这里不依赖 zod，而是提供与 DomainSpec 相同的 `parse` / `safeParse` 契约，
 * 让插件保持零运行时依赖，同时继续由存储域在 open 时校验每一条已存记录。
 */

import { normalizeBackfillStatus } from './backfill.js'
import { emptyManualTimer, parseManualTimer } from './manual-timer.js'
import { isPeriod, PERIODS } from './periods.js'
import { DEFAULT_SETTINGS, normalizeSettings } from './settings.js'

const RECORD_SOURCES = new Set(['live', 'backfill'])
const ANALYSIS_FAILURE_REASONS = new Set(['missing', 'invalid-record', 'unavailable'])

export function createDshTimespanSpec() {
  return {
    name: 'chrono_scope',
    version: 1,
    layout: 'per-record',
    global: {
      schema: compile(parseMeta),
      initial: initialMeta(),
    },
    tables: {
      intervals: { valueSchema: compile(parseIntervalRecord) },
      tasks: { valueSchema: compile(parseTaskRecord) },
      analysis: { valueSchema: compile(parseAnalysisState) },
    },
  }
}

function initialMeta() {
  return {
    version: 1,
    installTime: 0,
    currentBootId: null,
    lastHeartbeat: null,
    // 回填进度随 meta 一起持久化：重启后能直接显示「已完成」，崩溃中断的
    // running 状态也能在下一次启动时被重试。
    backfill: normalizeBackfillStatus(null),
    // 设置项是唯一权威副本；旧版本没有这一字段时，open 的 schema 会补出默认值。
    settings: { ...DEFAULT_SETTINGS },
    timer: emptyManualTimer(),
  }
}

function parseMeta(value) {
  if (!isPlainObject(value)) throw new Error('meta 必须是对象')
  return {
    version: 1,
    installTime: nonNegativeNumber(value.installTime, 'meta.installTime', 0),
    currentBootId: nullableString(value.currentBootId, 'meta.currentBootId'),
    lastHeartbeat: nullableNumber(value.lastHeartbeat, 'meta.lastHeartbeat'),
    backfill: normalizeBackfillStatus(value.backfill),
    settings: normalizeSettings(value.settings),
    timer: parseManualTimer(value.timer),
  }
}

/** 报告和对应的发送前请求前缀一次落盘；独立于频繁写入的心跳元数据。 */
export function emptyAnalysisState() {
  return {
    reports: parseAnalysisReports(),
    successfulRequests: Object.fromEntries(PERIODS.map((period) => [period, null])),
    latestRequest: null,
  }
}

function parseAnalysisState(value) {
  if (!isPlainObject(value) || !isPlainObject(value.successfulRequests)) throw new Error('分析状态必须是对象')
  const state = emptyAnalysisState()
  // 已移除的回顾范围可能还留在旧存储里；只读取当前三个周期，避免整份状态失效。
  const storedReports = isPlainObject(value.reports)
    ? Object.fromEntries(PERIODS.map((period) => [period, value.reports[period]]))
    : value.reports
  state.reports = parseAnalysisReports(storedReports)
  for (const period of PERIODS) {
    const request = value.successfulRequests[period]
    if (request == null) continue
    const parsed = parseAnalysisRequest(request)
    if (parsed.period !== period || state.reports[period] === null) throw new Error('分析请求与报告周期不符')
    state.successfulRequests[period] = parsed
  }
  // 旧版本可能留下已移除范围的最近请求；读取时直接丢弃，不让整份状态失效。
  if (value.latestRequest != null && isPeriod(value.latestRequest.period)) {
    state.latestRequest = parseAnalysisRequest(value.latestRequest)
  }
  return state
}

/** 备份与存储共用报告白名单；每个回顾范围只有一个结果槽位。 */
export function parseAnalysisReports(value) {
  if (value != null && (!isPlainObject(value) || Object.keys(value).some((key) => !isPeriod(key)))) {
    throw new Error('分析报告集合只能包含日、周、月')
  }
  const reports = Object.fromEntries(PERIODS.map((period) => [period, null]))
  for (const period of PERIODS) {
    if (value?.[period] == null) continue
    const report = parseAnalysisReport(value[period])
    if (report.period !== period) throw new Error('分析报告与存储周期不符')
    reports[period] = report
  }
  return reports
}

export function parseAnalysisReport(value) {
  if (!isPlainObject(value) || !isPeriod(value.period)) throw new Error('分析报告的周期无效')
  const { period, from, to, generatedAt, content, coverage } = value
  if (![from, to, generatedAt].every(isDateMs) || from > to || to > generatedAt) {
    throw new Error('分析报告的起止或生成时间无效')
  }
  if (
    !isPlainObject(content) || !isPlainObject(coverage) || typeof coverage.truncated !== 'boolean' ||
    (coverage.relatedSessionsUnavailable !== undefined && typeof coverage.relatedSessionsUnavailable !== 'boolean')
  ) {
    throw new Error('分析报告的正文或内容覆盖信息无效')
  }
  const sources = analysisArray(value.sources, 64, 'sources').map((source) => {
    if (!isPlainObject(source)) throw new Error('分析报告的来源必须是对象')
    return {
      sessionId: analysisText(source.sessionId, 512, 'source.sessionId'),
      sessionTitle: analysisOptionalText(source.sessionTitle, 'source.sessionTitle'),
      workspaceId: analysisOptionalText(source.workspaceId, 'source.workspaceId'),
      workspaceTitle: analysisOptionalText(source.workspaceTitle, 'source.workspaceTitle'),
      parentSessionId: analysisOptionalText(source.parentSessionId, 'source.parentSessionId'),
    }
  })
  const sessionIds = new Set(sources.map((source) => source.sessionId))
  if (sessionIds.size !== sources.length) throw new Error('分析报告的来源会话不可重复')
  const work = analysisArray(content.work, 32, 'content.work').map((item) => {
    if (!isPlainObject(item)) throw new Error('分析报告的工作总结必须是对象')
    const sourceIds = Array.from(analysisArray(item.sourceIds, 32, 'work.sourceIds'))
    if (sourceIds.length === 0 || sourceIds.some((sessionId) => !sessionIds.has(sessionId))) {
      throw new Error('分析报告的工作总结必须引用报告中的来源会话')
    }
    return { text: analysisText(item.text, 2_000, 'work.text'), sourceIds }
  })
  const counts = {}
  for (const key of ['totalSessions', 'readSessions', 'includedSessions', 'failedSessions', 'omittedSessions']) {
    if (!Number.isSafeInteger(coverage[key]) || coverage[key] < 0) {
      throw new Error(`分析报告 coverage.${key} 必须是非负整数`)
    }
    counts[key] = coverage[key]
  }
  const { totalSessions, readSessions, includedSessions, failedSessions, omittedSessions } = counts
  if (includedSessions !== sources.length || includedSessions > readSessions ||
      readSessions > totalSessions - failedSessions || omittedSessions > totalSessions - includedSessions - failedSessions) {
    throw new Error('分析报告的会话覆盖数量和来源不一致')
  }
  const failedSources = parseFailedAnalysisSources(coverage.failedSources, failedSessions)
  return {
    id: analysisText(value.id, 512, 'id'),
    period,
    from,
    to,
    generatedAt,
    provider: analysisText(value.provider, 256, 'provider'),
    model: analysisText(value.model, 256, 'model'),
    workspaceId: analysisOptionalText(value.workspaceId, 'workspaceId'),
    workspaceTitle: analysisOptionalText(value.workspaceTitle, 'workspaceTitle'),
    sessionId: analysisOptionalText(value.sessionId, 'sessionId'),
    sessionTitle: analysisOptionalText(value.sessionTitle, 'sessionTitle'),
    summary: analysisText(value.summary, 1_000, 'summary'),
    ...(value.snapshot == null ? {} : { snapshot: parseAnalysisSnapshot(value.snapshot, { from, to,
      filtered: value.workspaceId != null || value.sessionId != null }) }),
    content: {
      statistics: analysisText(content.statistics, 8_000, 'content.statistics'),
      work,
      suggestions: analysisText(content.suggestions, 8_000, 'content.suggestions', { allowEmpty: true }),
    },
    sources,
    coverage: {
      ...counts,
      truncated: coverage.truncated,
      relatedSessionsUnavailable: coverage.relatedSessionsUnavailable === true,
      failedSources,
    },
  }
}

/** 图表只接受生成时的有界统计字段；绝不把原始会话材料或模型生成的数字当作快照。 */
export function parseAnalysisSnapshot(value, { from, to, filtered = false }) {
  if (!isPlainObject(value)) throw new Error('回顾统计快照必须是对象')
  const number = (input) => {
    if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || input > Number.MAX_SAFE_INTEGER) {
      throw new Error('回顾统计快照包含无效数值')
    }
    return input
  }
  const count = (input) => {
    const result = number(input)
    if (!Number.isSafeInteger(result)) throw new Error('回顾统计计数必须是整数')
    return result
  }
  const timeZone = analysisText(value.timeZone, 100, 'snapshot.timeZone')
  try { new Intl.DateTimeFormat('en', { timeZone }).format(0) } catch { throw new Error('回顾统计时区无效') }
  let previousEnd = from
  const trend = analysisArray(value.trend, 32, 'snapshot.trend').map((row) => {
    if (!isPlainObject(row) || !isDateMs(row.from) || !isDateMs(row.to) || row.from < from || row.from >= to ||
        row.to <= row.from || row.from < previousEnd) throw new Error('回顾趋势时段无效')
    previousEnd = row.to
    return { from: row.from, to: Math.min(row.to, to), activeMs: number(row.activeMs), taskMs: number(row.taskMs) }
  })
  return {
    timeZone,
    onlineMs: filtered || value.onlineMs === null ? null : number(value.onlineMs),
    activeMs: number(value.activeMs), taskMs: number(value.taskMs),
    activeSumMs: number(value.activeSumMs), taskSumMs: number(value.taskSumMs), taskCount: count(value.taskCount),
    approximate: value.approximate === true,
    trend,
    workspaces: analysisArray(value.workspaces, 12, 'snapshot.workspaces').map((row) => {
      if (!isPlainObject(row)) throw new Error('回顾工作区快照无效')
      return { workspaceTitle: analysisOptionalText(row.workspaceTitle, 'snapshot.workspaceTitle'),
        activeMs: number(row.activeMs), taskMs: number(row.taskMs) }
    }),
    omittedWorkspaces: count(value.omittedWorkspaces), omittedTrendBuckets: count(value.omittedTrendBuckets),
  }
}

/** 诊断只保留可定位的会话与稳定原因；旧报告没有明细时保留原失败计数。 */
function parseFailedAnalysisSources(value, failedSessions) {
  if (value === undefined) return []
  const sources = analysisArray(value, 64, 'coverage.failedSources')
  if (sources.length > failedSessions) throw new Error('分析报告的失败会话明细超过失败计数')
  const seen = new Set()
  return Array.from(sources, (source) => {
    if (!isPlainObject(source) || !ANALYSIS_FAILURE_REASONS.has(source.reason)) {
      throw new Error('分析报告的失败来源或原因无效')
    }
    const sessionId = analysisText(source.sessionId, 512, 'failedSource.sessionId')
    if (seen.has(sessionId)) throw new Error('分析报告的失败来源会话不可重复')
    seen.add(sessionId)
    return {
      sessionId,
      sessionTitle: analysisOptionalText(source.sessionTitle, 'failedSource.sessionTitle'),
      workspaceId: analysisOptionalText(source.workspaceId, 'failedSource.workspaceId'),
      workspaceTitle: analysisOptionalText(source.workspaceTitle, 'failedSource.workspaceTitle'),
      reason: source.reason,
    }
  })
}

const MAX_ANALYSIS_INPUT_BYTES = 48 * 1_024
const MAX_ANALYSIS_SYSTEM_BYTES = 4 * 1_024
// 用户消息已经是一段 JSON，作为事件文本再次编码时，引号和反斜线还会转义。
const MAX_ANALYSIS_REQUEST_BYTES = 104 * 1_024
const ANALYSIS_REQUEST_EVENT_TYPES = ['turn/start', 'step/start', 'system/message', 'user/message', 'request/header']

/** 只保存能够还原实际发送内容的 DSH 事件前缀，拒绝任意事件或不定长上下文。 */
export function parseAnalysisRequest(value) {
  if (!isPlainObject(value) || !isPeriod(value.period) || !Array.isArray(value.events) ||
      value.events.length !== ANALYSIS_REQUEST_EVENT_TYPES.length) {
    throw new Error('分析请求日志必须包含有效的回顾范围及完整事件前缀')
  }
  const at = value.events[0]?.time
  if (!isDateMs(at)) throw new Error('分析请求事件时刻无效')
  const events = ANALYSIS_REQUEST_EVENT_TYPES.map((type, seq) => {
    const event = value.events[seq]
    if (!isPlainObject(event) || event.type !== type || event.seq !== seq || event.time !== at || !isPlainObject(event.data)) {
      throw new Error(`分析请求事件 ${type} 的顺序、时刻或内容不符`)
    }
    return parseAnalysisRequestEvent({ type, seq, time: at, data: event.data, surfaceOp: event.surfaceOp })
  })
  const request = { id: analysisText(value.id, 512, 'request.id'), period: value.period, events }
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_ANALYSIS_REQUEST_BYTES) {
    throw new Error('分析请求日志超过 104 KiB')
  }
  return request
}

function parseAnalysisRequestEvent({ type, seq, time, data, surfaceOp }) {
  const event = { type, seq, time }
  switch (type) {
    case 'turn/start':
      if (data.turn !== 1) throw new Error('分析请求轮次无效')
      return { ...event, data: { turn: 1 } }
    case 'step/start':
      if (data.turn !== 1 || data.step !== 1) throw new Error('分析请求步骤无效')
      return { ...event, data: { turn: 1, step: 1 } }
    case 'system/message':
      if (data.turn !== 1 || data.step !== 1 || surfaceOp !== 'append') throw new Error('分析请求的系统消息位置无效')
      return { ...event, surfaceOp, data: { turn: 1, step: 1, message: parseAnalysisMessage(data.message, 'system', 'system-prompt') } }
    case 'user/message':
      if (surfaceOp !== 'append') throw new Error('分析请求的用户消息位置无效')
      return { ...event, surfaceOp, data: parseAnalysisMessage(data, 'user', 'user') }
    case 'request/header': {
      const { header, reason, startsSeries } = data
      if (!isPlainObject(header) || !isPlainObject(header.config) || reason !== 'initial' || startsSeries !== true) {
        throw new Error('分析请求头无效')
      }
      const { provider, model, maxTokens, reasoningEffort } = header.config
      if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) throw new Error('分析请求的 maxTokens 无效')
      const config = {
        provider: analysisText(provider, 256, 'request.config.provider'),
        model: analysisText(model, 256, 'request.config.model'),
        maxTokens,
      }
      if (reasoningEffort !== undefined) config.reasoningEffort = analysisText(reasoningEffort, 64, 'request.config.reasoningEffort')
      const result = { config }
      if (header.adapterDefaults !== undefined) {
        const defaults = header.adapterDefaults
        if (!isPlainObject(defaults) || (defaults.reasoningEffort !== undefined && typeof defaults.reasoningEffort !== 'boolean')) {
          throw new Error('分析请求的 adapterDefaults 无效')
        }
        result.adapterDefaults = defaults.reasoningEffort === undefined ? {} : { reasoningEffort: defaults.reasoningEffort }
      }
      return { ...event, data: { header: result, reason, startsSeries } }
    }
    default:
      throw new Error('不支持的分析请求事件')
  }
}

function parseAnalysisMessage(message, role, sourceKind) {
  if (!isPlainObject(message) || message.role !== role || message.source?.kind !== sourceKind ||
      !Array.isArray(message.content) || message.content.length !== 1 || message.content[0]?.type !== 'text') {
    throw new Error(`分析请求的 ${role} 消息不符合单个文本块格式`)
  }
  const maxBytes = role === 'system' ? MAX_ANALYSIS_SYSTEM_BYTES : MAX_ANALYSIS_INPUT_BYTES
  const text = analysisText(message.content[0].text, maxBytes, `request.${role}.text`)
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error(`分析请求的 ${role} 消息超过 ${maxBytes / 1_024} KiB`)
  }
  return {
    role,
    id: analysisText(message.id, 512, `request.${role}.id`),
    source: { kind: sourceKind },
    content: [{ type: 'text', text }],
  }
}

function isDateMs(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000
}

function analysisArray(value, limit, name) {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`分析报告 ${name} 必须是至多 ${limit} 项的数组`)
  return value
}

function analysisText(value, limit, name, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value.length > limit || (!allowEmpty && value.trim() === '')) {
    throw new Error(`分析报告 ${name} 字段无效或超过 ${limit} 字符`)
  }
  return value
}

function analysisOptionalText(value, name) {
  return value == null ? null : analysisText(value, 512, name)
}

function parseIntervalRecord(value) {
  if (!isPlainObject(value)) throw new Error('interval 记录必须是对象')
  const type = value.type
  if (type !== 'online' && type !== 'active') throw new Error(`interval.type 非法：${String(type)}`)
  const source = value.source === undefined ? 'live' : value.source
  if (!RECORD_SOURCES.has(source)) throw new Error(`interval.source 非法：${String(source)}`)
  const start = requiredNumber(value.start, 'interval.start')
  const end = nullableNumber(value.end, 'interval.end')
  if (end !== null && end < start) throw new Error('interval.end 不能早于 interval.start')
  return {
    id: requiredString(value.id, 'interval.id'),
    type,
    start,
    end,
    lastHeartbeat: requiredNumber(value.lastHeartbeat, 'interval.lastHeartbeat'),
    // 最后一次心跳发生时的进程单调时钟读数；用于把真实经过的时间与墙钟
    // 跳变区分开。旧数据没有该字段时保持 null，按原有墙钟逻辑处理。
    lastHeartbeatUptime: nullableNumber(value.lastHeartbeatUptime, 'interval.lastHeartbeatUptime'),
    clientId: nullableString(value.clientId, 'interval.clientId'),
    sessionId: nullableString(value.sessionId, 'interval.sessionId'),
    workspaceId: nullableString(value.workspaceId, 'interval.workspaceId'),
    workspaceTitle: nullableString(value.workspaceTitle, 'interval.workspaceTitle'),
    sessionTitle: nullableString(value.sessionTitle, 'interval.sessionTitle'),
    // 崩溃恢复时按最后心跳推断出来的结束时刻，页面对这类记录要给出说明。
    approximate: value.approximate === true,
    source,
  }
}

function parseTaskRecord(value) {
  if (!isPlainObject(value)) throw new Error('task 记录必须是对象')
  const source = value.source === undefined ? 'live' : value.source
  if (!RECORD_SOURCES.has(source)) throw new Error(`task.source 非法：${String(source)}`)
  const start = requiredNumber(value.start, 'task.start')
  const end = nullableNumber(value.end, 'task.end')
  if (end !== null && end < start) throw new Error('task.end 不能早于 task.start')
  return {
    id: requiredString(value.id, 'task.id'),
    key: nullableString(value.key, 'task.key'),
    sessionId: requiredString(value.sessionId, 'task.sessionId'),
    turn: requiredNumber(value.turn, 'task.turn'),
    parentSessionId: nullableString(value.parentSessionId, 'task.parentSessionId'),
    origin: nullableString(value.origin, 'task.origin'),
    workspaceId: nullableString(value.workspaceId, 'task.workspaceId'),
    workspaceTitle: nullableString(value.workspaceTitle, 'task.workspaceTitle'),
    sessionTitle: nullableString(value.sessionTitle, 'task.sessionTitle'),
    start,
    end,
    endReason: nullableString(value.endReason, 'task.endReason'),
    modelMs: nonNegativeNumber(value.modelMs, 'task.modelMs', 0),
    toolMs: nonNegativeNumber(value.toolMs, 'task.toolMs', 0),
    waitMs: nonNegativeNumber(value.waitMs, 'task.waitMs', 0),
    otherMs: nonNegativeNumber(value.otherMs, 'task.otherMs', 0),
    hasBreakdown:
      value.hasBreakdown === undefined
        ? Array.isArray(value.segments) && value.segments.length > 0
        : value.hasBreakdown === true,
    approximate: value.approximate === true,
    lastEventAt: nullableNumber(value.lastEventAt, 'task.lastEventAt'),
    lastEventUptime: nullableNumber(value.lastEventUptime, 'task.lastEventUptime'),
    // 实时任务创建时的进程单调时钟读数；用于识别系统墙钟向前跳变，避免把
    // 时钟跳变产生的空白算进任务时长。历史回填没有这个读数，保持 null。
    startedUptime: nullableNumber(value.startedUptime, 'task.startedUptime'),
    segments: parseTaskSegments(value.segments),
    source,
  }
}

const TASK_SEGMENT_TYPES = new Set(['model', 'tool', 'wait'])

function parseTaskSegments(value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error('task.segments 必须是数组')
  return value.map((segment, index) => parseTaskSegment(segment, index))
}

function parseTaskSegment(value, index) {
  const name = `task.segments[${index}]`
  if (!isPlainObject(value)) throw new Error(`${name} 必须是对象`)
  if (!TASK_SEGMENT_TYPES.has(value.type)) throw new Error(`${name}.type 非法：${String(value.type)}`)
  const start = requiredNumber(value.start, `${name}.start`)
  const end = nullableNumber(value.end, `${name}.end`)
  if (end !== null && end < start) throw new Error(`${name}.end 不能早于 start`)
  return {
    type: value.type,
    start,
    end,
    step: value.step === undefined || value.step === null ? null : requiredNumber(value.step, `${name}.step`),
    callId: nullableString(value.callId, `${name}.callId`),
    approvalId: nullableString(value.approvalId, `${name}.approvalId`),
  }
}

function compile(parse) {
  return {
    parse,
    safeParse(value) {
      try {
        return { success: true, data: parse(value) }
      } catch (error) {
        return { success: false, error }
      }
    },
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value, name) {
  if (typeof value !== 'string') throw new Error(`${name} 必须是字符串`)
  return value
}

function nullableString(value, name) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new Error(`${name} 必须是字符串或 null`)
  return value
}

function requiredNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} 必须是有限数字`)
  return value
}

function nullableNumber(value, name) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} 必须是有限数字或 null`)
  return value
}

function nonNegativeNumber(value, name, fallback) {
  if (value === undefined || value === null) return fallback
  const number = requiredNumber(value, name)
  if (number < 0) throw new Error(`${name} 不能为负数`)
  return number
}
