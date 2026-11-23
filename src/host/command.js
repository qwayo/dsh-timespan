import { parseArgs } from 'node:util'
import { formatDurationByPreset } from '../domain/duration-format.js'
import { MAX_COUNTDOWN_MS } from '../domain/manual-timer.js'
import { queryTimespanStats } from './tool.js'

const PERIOD = { today: 'day', week: 'week', month: 'month', all: 'day' }
const DURATION_UNITS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }
const TIMER_ACTIONS = { pause: 'pause', resume: 'resume', stop: 'complete' }
const STATS_OPTIONS = {
  from: { type: 'string' },
  to: { type: 'string' },
  workspace: { type: 'string' },
  session: { type: 'string' },
  'group-by': { type: 'string' },
}

const zh = {
  locale: 'zh-CN',
  description: '查看时长、操作手动计时或打开本会话回顾',
  help: '/timespan stats [session|workspace|today|week|month|all]\n'
    + '/timespan timer [start|25m|pause|resume|stop|status]\n/timespan review',
  statsHelp: '统计用法：/timespan stats [session|workspace] [today|week|month|all] '
    + '[--from YYYY-MM-DD] [--to YYYY-MM-DD] [--workspace 名称或ID] [--session 标题或ID] [--group-by workspace|session]',
  statsError: '无法查询此范围，请检查日期、分组和会话或工作区名称。重名时请使用 ID。',
  noSession: '请在会话中运行此命令。',
  noWorkspace: '当前会话没有归属工作区。',
  review: '回顾范围为当前会话，请核对范围后生成。',
  today: '今日', week: '本周', month: '本月', all: '累计', range: '自定义范围',
  session: '本会话', workspace: '当前工作区', online: '在线', active: '活跃',
  task: '任务', count: '任务次数', noData: '暂无时长记录', unassigned: '未归属',
  timerHelp: '计时用法：/timespan timer [start|25m|pause|resume|stop|status]。倒计时支持 s、m、h、d，最长 7 天。',
  idle: '手动计时未开始', stopwatch: '正计时', countdown: '倒计时',
  paused: '已暂停', completed: '已结束', expired: '时间到', remaining: '剩余', elapsed: '已用',
  inProgress: '已有手动计时，请先结束当前计时。',
  changed: '计时状态已变化，请查看当前状态后重试。',
  timerError: '手动计时操作失败，请稍后重试。',
}
const en = {
  locale: 'en',
  description: 'Check durations, control the manual timer, or open a session review',
  help: zh.help,
  statsHelp: 'Usage: /timespan stats [session|workspace] [today|week|month|all] '
    + '[--from YYYY-MM-DD] [--to YYYY-MM-DD] [--workspace name-or-id] [--session title-or-id] [--group-by workspace|session]',
  statsError: 'Check the dates, grouping, and session or workspace name. Use an ID when names match more than one record.',
  noSession: 'Run this command in a session.',
  noWorkspace: 'This session has no workspace.',
  review: 'Review scope set to this session. Check the scope before generating.',
  today: 'Today', week: 'This week', month: 'This month', all: 'All time', range: 'Custom range',
  session: 'This session', workspace: 'Current workspace', online: 'Online', active: 'Active',
  task: 'Task time', count: 'Tasks', noData: 'No time recorded', unassigned: 'Unassigned',
  timerHelp: 'Usage: /timespan timer [start|25m|pause|resume|stop|status]. Countdowns accept s, m, h, or d, up to 7 days.',
  idle: 'Manual timer is idle', stopwatch: 'Stopwatch', countdown: 'Countdown',
  paused: 'Paused', completed: 'Finished', expired: 'Time is up', remaining: 'Remaining', elapsed: 'Elapsed',
  inProgress: 'Finish the current manual timer before starting a new one.',
  changed: 'The timer state changed. Check the current state and retry.',
  timerError: 'The timer operation failed. Try again.',
}

function ok(text) { return { kind: 'success', text } }
function failure(text) { return { kind: 'error', text } }

/** 只解释引号和空格，交给统计的仍是各个字段。 */
function tokenize(rawInput) {
  const parts = rawInput.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+|["']/gu) ?? []
  if (parts.includes('"') || parts.includes("'")) return null
  return parts.map((part) => part.replace(/"([^"]*)"|'([^']*)'/gu, (_, double, single) => double ?? single))
}

export function registerTimespanCommand(ctx, service, { getWorkspaceId = () => null, beforeStats = () => {} } = {}) {
  const language = () => service.getSettings().language === 'en' ? en : zh
  return ctx.commands.register({
    name: 'timespan',
    description: language().description,
    input: { hint: 'stats | timer | review' },
    async handler({ agent, rawInput, signal }) {
      signal?.throwIfAborted()
      const t = language()
      const parts = tokenize(rawInput)
      if (parts === null) return failure(t.help)
      const [verb, ...args] = parts
      if (verb === undefined) return ok(t.help)
      if (verb === 'stats') {
        await beforeStats()
        signal?.throwIfAborted()
        return runStats(service, t, args, agent?.session, getWorkspaceId)
      }
      if (verb === 'timer') return runTimer(service, t, args, signal)
      if (verb === 'review' && args.length === 0) {
        return agent?.session?.id ? ok(t.review) : failure(t.noSession)
      }
      return failure(t.help)
    },
  })
}

function runStats(service, t, args, session, getWorkspaceId) {
  let parsed
  try {
    parsed = parseArgs({ args, options: STATS_OPTIONS, allowPositionals: true })
  } catch {
    return failure(t.statsHelp)
  }
  const { positionals, values } = parsed
  const [first, second] = positionals
  const scope = first === 'session' || first === 'workspace' ? first : null
  const range = (scope ? second : first) ?? (scope === 'session' ? 'all' : 'today')
  if (!Object.hasOwn(PERIOD, range) || positionals.length > (scope ? 2 : 1)) return failure(t.statsHelp)
  if (scope && (values.workspace !== undefined || values.session !== undefined)) return failure(t.statsHelp)
  if (scope && !session?.id) return failure(t.noSession)
  const query = {
    period: PERIOD[range],
    workspace: values.workspace,
    session: values.session,
    from: values.from,
    to: values.to,
    groupBy: values['group-by'],
  }
  if (scope === 'session') query.session = session.id
  if (scope === 'workspace') {
    query.workspace = getWorkspaceId(session)
    if (!query.workspace) return failure(t.noWorkspace)
  }
  const value = queryTimespanStats(service, query, { allTime: range === 'all', currentScope: scope !== null })
  if (!value.ok) return failure(t.locale === 'zh-CN' ? value.error.message : t.statsError)

  const label = scope ? value.filters?.[scope]?.title ?? t[scope] : null
  const custom = values.from !== undefined || values.to !== undefined
  const dates = new Intl.DateTimeFormat(t.locale, { year: 'numeric', month: 'short', day: 'numeric' })
  const dateRange = range === 'all' && !custom ? '' : value.range.from === 0
    ? dates.format(value.range.to) : dates.formatRange(value.range.from, Math.max(value.range.from, value.range.to - 1))
  const externalFilters = scope ? [] : [value.filters?.workspace, value.filters?.session]
    .filter(Boolean).map((filter) => filter.title ?? filter.requested)
  const lines = [[label, ...externalFilters, t[custom ? 'range' : range], dateRange].filter(Boolean).join(' · ')]
  const duration = (ms) => formatDurationByPreset(ms, value.durationFormat)
  const { totals, groups } = value
  const summarize = (row) => [t.active + ' ' + duration(row.activeMs), t.task + ' ' + duration(row.taskMs), t.count + ' ' + row.taskCount]
  const online = value.filters ? [] : [t.online + ' ' + duration(totals.onlineMs)]
  lines.push([...online, ...summarize(totals)].join(' · '))
  if (!totals.onlineMs && !totals.activeMs && !totals.taskCount) lines.push(t.noData)
  for (const group of groups) {
    lines.push([group.title ?? group.id ?? t.unassigned, ...summarize(group)].join(' · '))
  }
  return ok(lines.join('\n'))
}

async function runTimer(service, t, args, signal) {
  const [action = 'status'] = args
  if (args.length > 1) return failure(t.timerHelp)
  if (action === 'status') {
    try { return ok(describeTimer(await service.getTimer(), t)) } catch { return failure(t.timerError) }
  }
  let input
  if (Object.hasOwn(TIMER_ACTIONS, action)) {
    input = { action: TIMER_ACTIONS[action] }
  } else if (action === 'start') {
    input = { action: 'start', mode: 'stopwatch' }
  } else {
    const duration = /^(\d+)(s|m|h|d)$/u.exec(action)
    if (duration === null) return failure(t.timerHelp)
    const durationMs = Number(duration[1]) * DURATION_UNITS[duration[2]]
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > MAX_COUNTDOWN_MS) return failure(t.timerHelp)
    input = { action: 'start', mode: 'countdown', durationMs }
  }
  try {
    const timer = await service.getTimer()
    signal?.throwIfAborted()
    return ok(describeTimer(await service.controlTimer({ ...input, id: timer.id }), t))
  } catch (error) {
    signal?.throwIfAborted()
    if (error?.code === 'timer-in-progress') return failure(t.inProgress)
    if (error?.code === 'stale-timer' || error?.code === 'invalid-timer-action') return failure(t.changed)
    return failure(t.timerError)
  }
}

function describeTimer(timer, t) {
  if (timer.status === 'idle') return t.idle
  const amount = (ms) => formatDurationByPreset(ms, 'padded')
  if (timer.status === 'completed') {
    return [timer.lastResult?.reason === 'expired' ? t.expired : t.completed, t.elapsed + ' ' + amount(timer.elapsedMs)].join(' · ')
  }
  const label = timer.mode === 'countdown' ? t.countdown : t.stopwatch
  const reading = timer.mode === 'countdown'
    ? t.remaining + ' ' + amount(Math.ceil(timer.remainingMs / 1000) * 1000)
    : t.elapsed + ' ' + amount(timer.elapsedMs)
  return [label, timer.status === 'paused' ? t.paused : null, reading].filter(Boolean).join(' · ')
}
