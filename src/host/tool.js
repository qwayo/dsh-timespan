/**
 * dsh-timespan 的 Agent 只读查询工具 timespan_stats。
 *
 * 工具本身不统计任何数字：它只把模型参数归一化成 queryStats 的查询选项，
 * 再把结果投影成稳定的 JSON 值与人类可读文本。这样页面与对话里的数字来自
 * 同一个 Host 领域操作，永远不会各算一套。
 */

import { DEFAULT_DURATION_FORMAT, DURATION_FORMATS, formatDurationByPreset, normalizeDurationFormat } from '../domain/duration-format.js'
import { PERIODS, pad2 } from '../domain/periods.js'

export const TIMESPAN_STATS_TOOL_NAME = 'timespan_stats'

const GROUP_BY_VALUES = ['summary', 'workspace', 'session']

const TOOL_DESCRIPTION =
  '查询 dsh-timespan 记录的 DSH 使用时长（只读）。按日/周/月或自定义起止日期统计，' +
  '可按 summary/workspace/session 分组，并可按工作区或会话筛选；返回活跃时长、任务时长、' +
  '任务次数与统计范围，数字与 dsh-timespan 仪表盘一致。'

const PARAMETERS = {
  type: 'object',
  properties: {
    period: {
      type: 'string',
      enum: PERIODS,
      description: '统计周期：day（日）、week（周）、month（月），默认 day。指定 from/to 时周期只影响展示标签。',
    },
    from: {
      type: 'string',
      description: '可选起始日期（含当天），格式 YYYY-MM-DD，按 Host 本地时区解释。',
    },
    to: {
      type: 'string',
      description: '可选结束日期（含当天），格式 YYYY-MM-DD，按 Host 本地时区解释。',
    },
    groupBy: {
      type: 'string',
      enum: GROUP_BY_VALUES,
      description: '分组方式：summary（只回总计）、workspace（按工作区）、session（按会话），默认 summary。',
    },
    workspace: {
      type: 'string',
      description: '可选工作区筛选：工作区 ID 或名称。',
    },
    session: {
      type: 'string',
      description: '可选会话筛选：会话 ID 或标题。',
    },
  },
  required: [],
  additionalProperties: false,
}

const RANGE_SCHEMA = {
  type: 'object',
  properties: {
    from: { type: 'number' },
    to: { type: 'number' },
    label: { type: 'string' },
  },
  required: ['from', 'to', 'label'],
  additionalProperties: false,
}

const TOTALS_SCHEMA = {
  type: 'object',
  properties: {
    onlineMs: { type: 'number' },
    activeMs: { type: 'number' },
    activeSumMs: { type: 'number' },
    taskMs: { type: 'number' },
    taskSumMs: { type: 'number' },
    taskCount: { type: 'number' },
    taskRunning: { type: 'boolean' },
    activeRunning: { type: 'boolean' },
  },
  required: [
    'onlineMs',
    'activeMs',
    'activeSumMs',
    'taskMs',
    'taskSumMs',
    'taskCount',
    'taskRunning',
    'activeRunning',
  ],
  additionalProperties: false,
}

const GROUP_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string' },
    id: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    title: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    workspaceId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    workspaceTitle: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    activeMs: { type: 'number' },
    taskMs: { type: 'number' },
    taskCount: { type: 'number' },
    share: { oneOf: [{ type: 'number' }, { type: 'null' }] },
    lastActivityAt: { oneOf: [{ type: 'number' }, { type: 'null' }] },
  },
  required: [
    'kind',
    'id',
    'title',
    'workspaceId',
    'workspaceTitle',
    'activeMs',
    'taskMs',
    'taskCount',
    'share',
    'lastActivityAt',
  ],
  additionalProperties: false,
}

const WORKSPACE_FILTER_SCHEMA = {
  type: 'object',
  properties: {
    requested: { type: 'string' },
    status: { type: 'string', enum: ['matched', 'missing', 'ambiguous'] },
    id: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    title: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    candidates: { type: 'array', items: { type: 'string' } },
  },
  required: ['requested', 'status', 'id', 'title', 'candidates'],
  additionalProperties: false,
}

const SESSION_FILTER_SCHEMA = {
  type: 'object',
  properties: {
    requested: { type: 'string' },
    status: { type: 'string', enum: ['matched', 'missing', 'ambiguous'] },
    id: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    title: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    workspaceId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    candidates: { type: 'array', items: { type: 'string' } },
  },
  required: ['requested', 'status', 'id', 'title', 'workspaceId', 'candidates'],
  additionalProperties: false,
}

const FILTERS_SCHEMA = {
  type: 'object',
  properties: {
    workspace: { oneOf: [{ type: 'null' }, WORKSPACE_FILTER_SCHEMA] },
    session: { oneOf: [{ type: 'null' }, SESSION_FILTER_SCHEMA] },
    mismatch: { type: 'boolean' },
  },
  required: ['workspace', 'session', 'mismatch'],
  additionalProperties: false,
}

const SUCCESS_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', const: true },
    period: { type: 'string', enum: PERIODS },
    groupBy: { type: 'string', enum: GROUP_BY_VALUES },
    weekStartsOn: { type: 'number' },
    durationFormat: { type: 'string', enum: [...DURATION_FORMATS] },
    range: RANGE_SCHEMA,
    totals: TOTALS_SCHEMA,
    filters: FILTERS_SCHEMA,
    groups: { type: 'array', items: GROUP_SCHEMA },
  },
  required: ['ok', 'period', 'groupBy', 'weekStartsOn', 'durationFormat', 'range', 'totals', 'groups'],
  additionalProperties: false,
}

const ERROR_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', const: false },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['code', 'message'],
      additionalProperties: false,
    },
  },
  required: ['ok', 'error'],
  additionalProperties: false,
}

const OUTPUT_SCHEMA = {
  oneOf: [SUCCESS_SCHEMA, ERROR_SCHEMA],
}

/**
 * @param {object} service dsh-timespan 领域服务
 * @returns {object} DSH 原始 ToolDefinition（ctx.tools.register 可直接接收）
 */
function createTimespanStatsToolDefinition(service) {
  if (service === undefined || service === null || typeof service.queryStats !== 'function') {
    throw new Error('dsh-timespan timespan_stats 需要 queryStats 领域操作')
  }

  return {
    name: TIMESPAN_STATS_TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: PARAMETERS,
    output: {
      schema: OUTPUT_SCHEMA,
      render: renderTimespanStats,
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (exec?.signal?.aborted) throw new Error('timespan_stats 已取消')
      return executeTimespanStats(service, args)
    },
  }
}

/**
 * @param {object} ctx Host 插件上下文（需要已注入 tools 服务）
 * @param {object} service dsh-timespan 领域服务
 * @returns {() => void} 注销函数
 */
export function registerTimespanStatsTool(ctx, service) {
  const tools = ctx.tools
  if (tools === undefined || tools === null || typeof tools.register !== 'function') {
    throw new Error('dsh-timespan 需要 tools 服务才能注册 timespan_stats')
  }
  return tools.register(createTimespanStatsToolDefinition(service))
}

async function executeTimespanStats(service, rawArgs) {
  const args = rawArgs !== null && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {}
  const period = args.period === undefined ? 'day' : args.period
  if (!PERIODS.includes(period)) {
    return failure('invalid_period', `period 必须是 day、week 或 month，收到「${String(period)}」。`)
  }
  const groupBy = args.groupBy === undefined ? 'summary' : args.groupBy
  if (!GROUP_BY_VALUES.includes(groupBy)) {
    return failure('invalid_group_by', `groupBy 必须是 summary、workspace 或 session，收到「${String(groupBy)}」。`)
  }
  if (args.workspace !== undefined && (typeof args.workspace !== 'string' || args.workspace.trim() === '')) {
    return failure('invalid_workspace_filter', 'workspace 必须是非空的工作区 ID 或名称字符串。')
  }
  if (args.session !== undefined && (typeof args.session !== 'string' || args.session.trim() === '')) {
    return failure('invalid_session_filter', 'session 必须是非空的会话 ID 或标题字符串。')
  }

  const from = args.from === undefined ? undefined : parseLocalDateKey(args.from, 'from')
  if (from !== null && typeof from === 'object') return from
  const toStart = args.to === undefined ? undefined : parseLocalDateKey(args.to, 'to')
  if (toStart !== null && typeof toStart === 'object') return toStart
  if (from !== undefined && toStart !== undefined) {
    const toExclusive = nextLocalDayStart(toStart)
    if (from >= toExclusive) {
      return failure('invalid_range', '起始日期不能晚于结束日期；两个日期都按本地自然日包含当天处理。')
    }
  }

  const query = { period, view: 'summary', groupBy }
  if (from !== undefined) query.from = from
  if (toStart !== undefined) query.to = nextLocalDayStart(toStart)
  if (args.workspace !== undefined) query.workspace = args.workspace
  if (args.session !== undefined) query.session = args.session

  const stats = service.queryStats(query)
  const filterFailure = describeFilterFailure(stats.filters)
  if (filterFailure !== null) return filterFailure
  // 页面、导出与工具共用 Host 设置里的同一份格式；工具没有自己的格式参数。
  const durationFormat = normalizeDurationFormat(service.getSettings?.().durationFormat)
  return successValue(stats, period, groupBy, { from, to: toStart }, durationFormat)
}

function parseLocalDateKey(value, field) {
  if (typeof value !== 'string') {
    return failure('invalid_date', `${field} 必须是 YYYY-MM-DD 格式的日期字符串。`)
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim())
  if (match === null) {
    return failure('invalid_date', `${field} 必须是 YYYY-MM-DD 格式的有效日期，收到「${value}」。`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return failure('invalid_date', `${field} 不是有效日期，收到「${value}」。`)
  }
  return date.getTime()
}

function nextLocalDayStart(timestamp) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0).getTime()
}

function describeFilterFailure(filters) {
  if (filters === undefined || filters === null) return null
  if (filters.workspace?.status === 'missing') {
    return failure(
      'workspace_not_found',
      `没有找到工作区「${filters.workspace.requested}」的统计数据；可能名称有误，或还没有任何记录。`,
    )
  }
  if (filters.workspace?.status === 'ambiguous') {
    return failure(
      'workspace_ambiguous',
      `工作区名称「${filters.workspace.requested}」匹配到多个工作区（${filters.workspace.candidates.join('、')}），请改用工作区 ID。`,
    )
  }
  if (filters.session?.status === 'missing') {
    return failure(
      'session_not_found',
      `没有找到会话「${filters.session.requested}」的统计数据；可能标题有误，或还没有任何记录。`,
    )
  }
  if (filters.session?.status === 'ambiguous') {
    return failure(
      'session_ambiguous',
      `会话标题「${filters.session.requested}」匹配到多个会话（${filters.session.candidates.join('、')}），请改用会话 ID。`,
    )
  }
  if (filters.mismatch === true) {
    return failure(
      'filter_mismatch',
      `会话「${filters.session?.requested ?? ''}」不属于工作区「${filters.workspace?.requested ?? ''}」。`,
    )
  }
  return null
}

function successValue(stats, period, groupBy, requested = {}, durationFormat = DEFAULT_DURATION_FORMAT) {
  const value = {
    ok: true,
    period,
    groupBy,
    weekStartsOn: stats.weekStartsOn,
    durationFormat: normalizeDurationFormat(durationFormat),
    range: {
      from: stats.range.from,
      to: stats.range.to,
      label: buildRangeLabel(stats.range, requested),
    },
    totals: {
      onlineMs: stats.onlineMs,
      activeMs: stats.activeMs,
      activeSumMs: stats.activeSumMs,
      taskMs: stats.taskMs,
      taskSumMs: stats.taskSumMs,
      taskCount: stats.taskCount,
      taskRunning: stats.taskRunning,
      activeRunning: stats.activeRunning,
    },
    groups: Array.isArray(stats.groups) ? stats.groups.map(normalizeGroup) : [],
  }
  if (stats.filters !== undefined && stats.filters !== null) value.filters = stats.filters
  return value
}

function normalizeGroup(group) {
  return {
    kind: group.kind,
    id: group.id ?? null,
    title: group.title ?? null,
    workspaceId: group.workspaceId ?? null,
    workspaceTitle: group.workspaceTitle ?? null,
    activeMs: group.activeMs,
    taskMs: group.taskMs,
    taskCount: group.taskCount,
    share: group.share ?? null,
    lastActivityAt: group.lastActivityAt ?? null,
  }
}

function failure(code, message) {
  return { ok: false, error: { code, message } }
}

function renderTimespanStats(_args, value) {
  if (value === null || typeof value !== 'object') {
    return [{ type: 'text', text: 'dsh-timespan 查询没有返回可读结果。' }]
  }
  if (value.ok !== true) {
    return [{ type: 'text', text: `dsh-timespan 查询未完成：${value.error?.message ?? '未知原因'}` }]
  }
  const lines = []
  const format = normalizeDurationFormat(value.durationFormat)
  if (value.filters?.workspace) {
    lines.push(`筛选：工作区「${value.filters.workspace.requested}」`)
  }
  if (value.filters?.session) {
    lines.push(`筛选：会话「${value.filters.session.requested}」`)
  }
  lines.push(`dsh-timespan 统计（${value.range.label}）：`)
  lines.push(`活跃时长 ${formatDurationByPreset(value.totals.activeMs, format)}；任务时长 ${formatDurationByPreset(value.totals.taskMs, format)}；任务次数 ${value.totals.taskCount}。`)
  if (value.filters === undefined) {
    lines.push(`在线时长 ${formatDurationByPreset(value.totals.onlineMs, format)}。`)
  }
  if (value.totals.activeSumMs !== value.totals.activeMs || value.totals.taskSumMs !== value.totals.taskMs) {
    lines.push(`按会话累计：活跃 ${formatDurationByPreset(value.totals.activeSumMs, format)}；任务 ${formatDurationByPreset(value.totals.taskSumMs, format)}。`)
  }
  if (Array.isArray(value.groups) && value.groups.length > 0) {
    lines.push(`按${value.groupBy === 'workspace' ? '工作区' : '会话'}（累计工时）：`)
    for (const group of value.groups) {
      const name = group.title ?? '未归属'
      lines.push(`- ${name}：活跃 ${formatDurationByPreset(group.activeMs, format)}，任务 ${formatDurationByPreset(group.taskMs, format)}，任务 ${group.taskCount} 次`)
    }
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

function buildRangeLabel(range, requested) {
  if (requested.from !== undefined && requested.to !== undefined) {
    return `${formatDateKey(range.from)} – ${formatDateKey(requested.to)}（含当天，本地时区）`
  }
  if (requested.from !== undefined) {
    return `${formatDateKey(range.from)} 00:00 – 现在`
  }
  if (requested.to !== undefined) {
    return `截至 ${formatDateKey(requested.to)}（含当天，本地时区）`
  }
  return formatRangeLabel(range.from, range.to)
}

function formatDateKey(timestamp) {
  const at = new Date(timestamp)
  return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`
}

function formatRangeLabel(from, to) {
  return `${formatDateTime(from)} – ${formatDateTime(to)}`
}

function formatDateTime(timestamp) {
  const at = new Date(timestamp)
  return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())} ${pad2(at.getHours())}:${pad2(at.getMinutes())}`
}
