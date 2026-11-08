/**
 * 票 07：Agent 查询工具 chrono_stats 的对外行为测试。
 *
 * 工具是领域服务 queryStats 的只读适配器：测试只通过工具定义本身
 * （parameters / output / execute）和领域服务的公共查询入口观察行为，
 * 不读存储表、不调用私有函数。时间一律用本地时间构造。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { registerChronoStatsTool } from '../src/host/tool.js'
import { createChronoScopeDomain } from '../src/domain/chrono-scope-domain.js'
import { createMemoryDomain } from './helpers/memory-domain.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** 按 Host 本地时区构造时间戳；month 为 1–12。 */
function localTime(year, month, day, hour = 0, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
}

function createFakeClock(now, uptimeMs = 0) {
  return {
    nowMs: now,
    uptimeMsValue: uptimeMs,
    now() {
      return this.nowMs
    },
    uptimeMs() {
      return this.uptimeMsValue
    },
  }
}

function foregroundPresence(at, overrides = {}) {
  return {
    at,
    clientId: 'client-1',
    visible: true,
    focused: true,
    lastInteractionAt: at,
    sessionId: 'session-1',
    sessionTitle: '会话一',
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
    foregroundRunning: false,
    ...overrides,
  }
}

async function addTurn(service, sessionId, turn, start, end, header = {}) {
  await service.recordSessionEvent({
    sessionId,
    header,
    event: { type: 'turn/start', time: start, data: { turn } },
  })
  await service.recordSessionEvent({
    sessionId,
    header,
    event: { type: 'turn/end', time: end, data: { turn, reason: { kind: 'completed' } } },
  })
}

async function startedService(now, uptimeMs = 0) {
  const domain = createMemoryDomain()
  const clock = createFakeClock(now, uptimeMs)
  const service = createChronoScopeDomain({ domain, clock })
  await service.start()
  return { domain, clock, service }
}

function renderText(definition, value, args = {}) {
  return definition.output.render(args, value).map((block) => block.text).join('\n')
}

function createDefinition(service) {
  const registered = []
  registerChronoStatsTool(
    {
      tools: {
        register(definition) {
          registered.push(definition)
          return () => {}
        },
      },
    },
    service,
  )
  assert.equal(registered.length, 1)
  return registered[0]
}

test('注册：chrono_stats 暴露周期、日期、分组与筛选参数，并返回注销函数', () => {
  const registered = []
  let disposed = 0
  const ctx = {
    tools: {
      register(definition) {
        registered.push(definition)
        return () => {
          disposed += 1
        }
      },
    },
  }
  const dispose = registerChronoStatsTool(ctx, {
    queryStats() {
      throw new Error('这个用例不应执行查询')
    },
  })

  assert.equal(registered.length, 1)
  const definition = registered[0]
  assert.equal(definition.name, 'chrono_stats')
  assert.match(definition.description, /只读/u)
  assert.equal(definition.parameters.type, 'object')
  assert.deepEqual(Object.keys(definition.parameters.properties).sort(), [
    'from',
    'groupBy',
    'period',
    'session',
    'to',
    'workspace',
  ])
  assert.deepEqual(definition.parameters.properties.period.enum, ['day', 'week', 'month'])
  assert.deepEqual(definition.parameters.properties.groupBy.enum, ['summary', 'workspace', 'session'])
  assert.equal(definition.parameters.additionalProperties, false)
  assert.equal(definition.output.schema.oneOf.length, 2)
  assert.equal(definition.output.schema.oneOf[0].type, 'object')
  assert.equal(definition.output.schema.oneOf[1].type, 'object')
  assert.equal(typeof definition.output.render, 'function')
  assert.equal(typeof definition.execute, 'function')

  dispose()
  assert.equal(disposed, 1)
})

test('按周期汇总：chrono_stats 活跃、任务、次数与范围跟仪表盘完全一致', async () => {
  const t0 = localTime(2026, 11, 5, 9, 0)
  const { clock, service } = await startedService(t0)

  for (let at = t0; at < t0 + 10 * MINUTE; at += 30_000) {
    clock.nowMs = at
    await service.recordPresence(foregroundPresence(at))
  }
  await addTurn(service, 'session-1', 1, t0, t0 + 20 * MINUTE, {
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
    sessionTitle: '会话一',
  })
  clock.nowMs = t0 + 30 * MINUTE

  const definition = createDefinition(service)
  const value = await definition.execute({ period: 'day' })
  const dashboard = service.queryStats({ period: 'day', view: 'dashboard' })

  assert.equal(value.ok, true)
  assert.equal(value.period, 'day')
  assert.equal(value.groupBy, 'summary')
  assert.equal(value.range.from, dashboard.range.from)
  assert.equal(value.range.to, dashboard.range.to)
  assert.equal(value.totals.activeMs, dashboard.activeMs)
  assert.equal(value.totals.activeSumMs, dashboard.activeSumMs)
  assert.equal(value.totals.taskMs, dashboard.taskMs)
  assert.equal(value.totals.taskSumMs, dashboard.taskSumMs)
  assert.equal(value.totals.taskCount, dashboard.taskCount)
  assert.equal(value.totals.onlineMs, dashboard.onlineMs)

  for (const cycle of ['week', 'month']) {
    const cycleValue = await definition.execute({ period: cycle })
    const cycleDashboard = service.queryStats({ period: cycle, view: 'dashboard' })
    assert.equal(cycleValue.range.from, cycleDashboard.range.from, `${cycle} 范围起点一致`)
    assert.equal(cycleValue.range.to, cycleDashboard.range.to, `${cycle} 范围终点一致`)
    assert.equal(cycleValue.totals.activeMs, cycleDashboard.activeMs)
    assert.equal(cycleValue.totals.taskMs, cycleDashboard.taskMs)
    assert.equal(cycleValue.totals.taskCount, cycleDashboard.taskCount)
  }

  const text = renderText(definition, value)
  assert.match(text, /活跃时长/u)
  assert.match(text, /任务时长/u)
  assert.match(text, /任务次数/u)
  assert.match(text, /30m 0s/u, '在线时长按共享的紧凑单位格式呈现')
})

test('数字格式：chrono_stats 文本跟随 Host 设置，与页面使用同一份格式定义', async () => {
  const t0 = localTime(2026, 11, 5, 9, 0)
  const { clock, service } = await startedService(t0)
  await addTurn(service, 'session-1', 1, t0, t0 + 30 * MINUTE, {
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
    sessionTitle: '会话一',
  })
  clock.nowMs = t0 + 40 * MINUTE

  const definition = createDefinition(service)
  const cases = [
    ['hms', /任务时长 0:30:00/u],
    ['short', /任务时长 30m 0s/u],
    ['zh', /任务时长 30 分 0 秒/u],
    ['sec', /任务时长 1800 秒/u],
    ['padded', /任务时长 00:30:00/u],
  ]
  for (const [format, expected] of cases) {
    await service.setSettings({ durationFormat: format })
    const value = await definition.execute({ period: 'day' })
    assert.equal(value.ok, true)
    assert.equal(value.durationFormat, format, '工具响应如实带回当前格式')
    assert.match(renderText(definition, value), expected, `${format} 格式与页面数字一致`)
  }
})

test('分组：workspace/session 每行数字与仪表盘明细一致，summary 仍是并集总计', async () => {
  const t0 = localTime(2026, 11, 5, 10, 0)
  const { clock, service } = await startedService(t0)

  for (let at = t0; at < t0 + 2 * MINUTE; at += 30_000) {
    clock.nowMs = at
    await service.recordPresence(foregroundPresence(at))
  }
  const second = {
    sessionId: 'session-2',
    sessionTitle: '会话二',
    workspaceId: 'workspace-2',
    workspaceTitle: '工作区二',
  }
  for (let at = t0 + 2 * MINUTE; at < t0 + 4 * MINUTE; at += 30_000) {
    clock.nowMs = at
    await service.recordPresence(foregroundPresence(at, second))
  }
  clock.nowMs = t0 + 4 * MINUTE
  await service.recordPresence(foregroundPresence(clock.nowMs, { ...second, visible: false }))

  await addTurn(service, 'session-1', 1, t0, t0 + 10 * MINUTE, {
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
    sessionTitle: '会话一',
  })
  await addTurn(service, 'session-2', 1, t0, t0 + 5 * MINUTE, second)
  clock.nowMs = t0 + 20 * MINUTE

  const definition = createDefinition(service)
  const dashboard = service.queryStats({ period: 'day', view: 'dashboard' })

  const byWorkspace = await definition.execute({ period: 'day', groupBy: 'workspace' })
  assert.equal(byWorkspace.ok, true)
  assert.equal(byWorkspace.totals.taskMs, dashboard.taskMs, '总计保持实际占用并集口径')
  assert.equal(byWorkspace.totals.taskSumMs, dashboard.taskSumMs)
  assert.equal(byWorkspace.groups.length, dashboard.workspaces.length)
  for (const group of byWorkspace.groups) {
    const row = dashboard.workspaces.find((item) => item.workspaceId === group.id)
    assert.ok(row, `工作区 ${group.id} 应出现在仪表盘明细里`)
    assert.equal(group.title, row.workspaceTitle)
    assert.equal(group.activeMs, row.activeMs)
    assert.equal(group.taskMs, row.taskMs)
    assert.equal(group.taskCount, row.taskCount)
    assert.ok(Math.abs(group.share - row.share) < 1e-9)
  }

  const bySession = await definition.execute({ period: 'day', groupBy: 'session' })
  const dashboardSessions = dashboard.workspaces.flatMap((workspace) => workspace.sessions)
  assert.equal(bySession.groups.length, dashboardSessions.length)
  for (const group of bySession.groups) {
    const row = dashboardSessions.find((item) => item.sessionId === group.id)
    assert.ok(row, `会话 ${group.id} 应出现在仪表盘明细里`)
    assert.equal(group.title, row.sessionTitle)
    assert.equal(group.workspaceId, row.workspaceId)
    assert.equal(group.activeMs, row.activeMs)
    assert.equal(group.taskMs, row.taskMs)
    assert.equal(group.taskCount, row.taskCount)
  }
})

test('自定义起止日期：按本地自然日解释且结束日含当天，数字与显式范围查询一致', async () => {
  const t0 = localTime(2026, 11, 5, 12, 0)
  const { clock, service } = await startedService(t0)
  const header = { workspaceId: 'workspace-1', workspaceTitle: '工作区一', sessionTitle: '会话一' }

  await addTurn(service, 'session-1', 1, localTime(2026, 11, 3, 10, 0), localTime(2026, 11, 3, 10, 10), header)
  await addTurn(service, 'session-1', 2, localTime(2026, 11, 4, 23, 50), localTime(2026, 11, 5, 0, 10), header)

  const definition = createDefinition(service)
  const from = localTime(2026, 11, 3, 0, 0)
  const to = localTime(2026, 11, 5, 0, 0)
  const value = await definition.execute({ period: 'day', from: '2026-11-03', to: '2026-11-04' })

  assert.equal(value.ok, true)
  assert.equal(value.range.from, from)
  assert.equal(value.range.to, to, '结束日期包含 11-04 全天，上界是 11-05 零点')
  assert.match(value.range.label, /2026-11-03 – 2026-11-04（含当天/u)
  assert.equal(value.totals.taskCount, 2)
  assert.equal(value.totals.taskMs, 20 * MINUTE, '11-03 的 10 分钟 + 跨午夜的 10 分钟')

  const explicit = service.queryStats({ from, to, period: 'day', view: 'dashboard' })
  assert.equal(value.totals.activeMs, explicit.activeMs)
  assert.equal(value.totals.taskMs, explicit.taskMs)
  assert.equal(value.totals.taskCount, explicit.taskCount)
})

test('单边日期：只给 from 从该日零点到当前，只给 to 从最早记录到该日结束', async () => {
  const t0 = localTime(2026, 11, 5, 12, 0)
  const { service } = await startedService(t0)
  const header = { workspaceId: 'workspace-1', workspaceTitle: '工作区一', sessionTitle: '会话一' }
  await addTurn(service, 'session-1', 1, localTime(2026, 11, 3, 10, 0), localTime(2026, 11, 3, 10, 10), header)
  await addTurn(service, 'session-1', 2, localTime(2026, 11, 4, 10, 0), localTime(2026, 11, 4, 10, 10), header)

  const definition = createDefinition(service)
  const fromOnly = await definition.execute({ from: '2026-11-04' })
  assert.equal(fromOnly.ok, true)
  assert.equal(fromOnly.range.from, localTime(2026, 11, 4, 0, 0))
  assert.equal(fromOnly.range.to, t0)
  assert.match(fromOnly.range.label, /2026-11-04 00:00 – 现在/u)
  assert.equal(fromOnly.totals.taskCount, 1)

  const toOnly = await definition.execute({ to: '2026-11-03' })
  assert.equal(toOnly.ok, true)
  assert.equal(toOnly.range.from, 0)
  assert.equal(toOnly.range.to, localTime(2026, 11, 4, 0, 0))
  assert.match(toOnly.range.label, /截至 2026-11-03（含当天/u)
  assert.equal(toOnly.totals.taskCount, 1)
})

test('筛选：工作区或会话可按名称/ID 收窄统计，并可与分组组合', async () => {
  const t0 = localTime(2026, 11, 5, 10, 0)
  const { clock, service } = await startedService(t0)
  const first = { workspaceId: 'workspace-1', workspaceTitle: '工作区一', sessionTitle: '会话一' }
  const second = {
    sessionId: 'session-2',
    sessionTitle: '会话二',
    workspaceId: 'workspace-2',
    workspaceTitle: '工作区二',
  }

  for (let at = t0; at < t0 + 2 * MINUTE; at += 30_000) {
    clock.nowMs = at
    await service.recordPresence(foregroundPresence(at, first))
  }
  for (let at = t0 + 2 * MINUTE; at < t0 + 4 * MINUTE; at += 30_000) {
    clock.nowMs = at
    await service.recordPresence(foregroundPresence(at, second))
  }
  clock.nowMs = t0 + 4 * MINUTE
  await service.recordPresence(foregroundPresence(clock.nowMs, { ...second, visible: false }))

  await addTurn(service, 'session-1', 1, t0, t0 + 10 * MINUTE, first)
  await addTurn(service, 'session-2', 1, t0, t0 + 5 * MINUTE, second)
  clock.nowMs = t0 + 20 * MINUTE

  const definition = createDefinition(service)
  const byWorkspaceName = await definition.execute({ period: 'day', workspace: '工作区二' })
  assert.equal(byWorkspaceName.ok, true)
  assert.equal(byWorkspaceName.totals.taskMs, 5 * MINUTE)
  assert.equal(byWorkspaceName.totals.activeMs, 2 * MINUTE)
  assert.equal(byWorkspaceName.totals.taskCount, 1)
  assert.equal(byWorkspaceName.totals.onlineMs, 0, '按工作区筛选时在线时长不归属到工作区')

  const bySessionId = await definition.execute({ period: 'day', session: 'session-2' })
  assert.equal(bySessionId.ok, true)
  assert.equal(bySessionId.totals.taskMs, 5 * MINUTE)
  assert.equal(bySessionId.totals.activeMs, 2 * MINUTE)
  assert.equal(bySessionId.totals.taskCount, 1)

  const grouped = await definition.execute({ period: 'day', groupBy: 'session', workspace: 'workspace-2' })
  assert.equal(grouped.ok, true)
  assert.equal(grouped.groups.length, 1)
  assert.equal(grouped.groups[0].id, 'session-2')
  assert.equal(grouped.groups[0].taskMs, 5 * MINUTE)
})

test('错误与空结果：非法参数、未知工作区/会话、无数据都返回清楚结果而不抛出', async () => {
  const t0 = localTime(2026, 11, 5, 10, 0)
  const { service } = await startedService(t0)
  const definition = createDefinition(service)

  const invalidPeriod = await definition.execute({ period: 'year' })
  assert.equal(invalidPeriod.ok, false)
  assert.equal(invalidPeriod.error.code, 'invalid_period')
  assert.match(invalidPeriod.error.message, /year/u)

  const invalidGroup = await definition.execute({ period: 'day', groupBy: 'task' })
  assert.equal(invalidGroup.ok, false)
  assert.equal(invalidGroup.error.code, 'invalid_group_by')

  const invalidFrom = await definition.execute({ from: '2026-13-40' })
  assert.equal(invalidFrom.ok, false)
  assert.equal(invalidFrom.error.code, 'invalid_date')

  const invalidRange = await definition.execute({ from: '2026-11-05', to: '2026-11-04' })
  assert.equal(invalidRange.ok, false)
  assert.equal(invalidRange.error.code, 'invalid_range')

  const emptyWorkspace = await definition.execute({ period: 'day', workspace: '   ' })
  assert.equal(emptyWorkspace.ok, false)
  assert.equal(emptyWorkspace.error.code, 'invalid_workspace_filter')

  const emptySession = await definition.execute({ period: 'day', session: '' })
  assert.equal(emptySession.ok, false)
  assert.equal(emptySession.error.code, 'invalid_session_filter')

  const unknownWorkspace = await definition.execute({ period: 'day', workspace: '不存在的项目' })
  assert.equal(unknownWorkspace.ok, false)
  assert.equal(unknownWorkspace.error.code, 'workspace_not_found')
  assert.match(unknownWorkspace.error.message, /不存在的项目/u)

  const unknownSession = await definition.execute({ period: 'day', session: '不存在的会话' })
  assert.equal(unknownSession.ok, false)
  assert.equal(unknownSession.error.code, 'session_not_found')

  const ambiguous = await startedService(t0)
  await addTurn(ambiguous.service, 'session-a', 1, t0, t0 + 1 * MINUTE, {
    workspaceId: 'workspace-a',
    workspaceTitle: '同名项目',
    sessionTitle: '会话 A',
  })
  await addTurn(ambiguous.service, 'session-b', 1, t0, t0 + 1 * MINUTE, {
    workspaceId: 'workspace-b',
    workspaceTitle: '同名项目',
    sessionTitle: '会话 B',
  })
  const ambiguousDefinition = createDefinition(ambiguous.service)
  const ambiguousWorkspace = await ambiguousDefinition.execute({ workspace: '同名项目' })
  assert.equal(ambiguousWorkspace.ok, false)
  assert.equal(ambiguousWorkspace.error.code, 'workspace_ambiguous')

  const mismatch = await ambiguousDefinition.execute({ workspace: 'workspace-a', session: 'session-b' })
  assert.equal(mismatch.ok, false)
  assert.equal(mismatch.error.code, 'filter_mismatch')

  const empty = await definition.execute({ period: 'day', groupBy: 'workspace' })
  assert.equal(empty.ok, true)
  assert.deepEqual(empty.totals, {
    onlineMs: 0,
    activeMs: 0,
    activeSumMs: 0,
    taskMs: 0,
    taskSumMs: 0,
    taskCount: 0,
    taskRunning: false,
    activeRunning: false,
  })
  assert.deepEqual(empty.groups, [])

  const rendered = renderText(definition, invalidPeriod)
  assert.match(rendered, /未完成/u)
  assert.match(rendered, /period 必须是/u)
})

test('只读：工具调用前后导出的原始区间、任务与设置完全不变', async () => {
  const t0 = localTime(2026, 11, 5, 10, 0)
  const { clock, service } = await startedService(t0)
  await service.recordPresence(foregroundPresence(t0))
  await addTurn(service, 'session-1', 1, t0, t0 + 5 * MINUTE, {
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
    sessionTitle: '会话一',
  })
  clock.nowMs = t0 + 10 * MINUTE

  const definition = createDefinition(service)
  const before = JSON.parse((await service.exportData({ format: 'json' })).content)
  await definition.execute({ period: 'day', groupBy: 'session' })
  await definition.execute({ period: 'day', workspace: '工作区一' })
  await definition.execute({ period: 'week', groupBy: 'workspace' })
  const after = JSON.parse((await service.exportData({ format: 'json' })).content)

  delete before.exportedAt
  delete after.exportedAt
  assert.deepEqual(after, before, '工具只读，不得修改区间、任务或设置')
})

test('Host 接线：apply 注册 chrono_stats', async () => {
  const domain = createMemoryDomain()
  const registered = []
  let cleanup
  const connection = { fetch: { register: () => () => {} } }
  const ctx = {
    storageDomain: { open: async () => domain },
    timer: { interval: () => () => {} },
    tools: {
      register(definition) {
        registered.push(definition)
        return () => {}
      },
    },
    get(name) {
      return name === 'connection' ? connection : undefined
    },
    on() {
      return () => {}
    },
    effect(fn) {
      cleanup = fn()
    },
  }

  const { apply } = await import('../index.js')
  await apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'chrono_stats')
  const value = await registered[0].execute({ period: 'day' })
  assert.equal(value.ok, true)

  await cleanup()
})
