/**
 * 票 05：按天三项时长序列的领域行为与私有 RPC 契约测试。
 *
 * 测试缝沿用规格《Testing Decisions》的既有约定：领域层只通过公共入口
 * queryDailySeries 断言可观察的逐日数值与范围；RPC 层用真实 Host 装配与
 * 假 connection 验证参数校验与响应形状。时间一律用本地时间构造。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../index.js'
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

/** 推进假时钟时同步推进单调时钟，模拟正常运行的进程而不是系统时钟跳跃。 */
function advanceClock(clock, at) {
  const delta = at - clock.nowMs
  if (delta > 0) clock.uptimeMsValue += delta
  clock.nowMs = at
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

test('按天序列：跨午夜区间按 Host 本地自然日裁剪', async () => {
  const start = localTime(2026, 11, 3, 23, 0)
  const clock = createFakeClock(start, 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  await addTurn(service, 'session-1', 1, localTime(2026, 11, 3, 23, 30), localTime(2026, 11, 4, 0, 30))

  advanceClock(clock, localTime(2026, 11, 4, 1, 0))
  await service.close()

  const series = service.queryDailySeries({
    from: localTime(2026, 11, 3, 12, 0),
    to: localTime(2026, 11, 4, 12, 0),
  })

  assert.equal(series.range.from, localTime(2026, 11, 3, 0, 0), '起点归一到首个自然日零点')
  assert.equal(series.range.to, localTime(2026, 11, 5, 0, 0), '终点覆盖末个自然日全部')
  assert.equal(series.days.length, 2)
  assert.deepEqual(series.days[0], {
    dateKey: '2026-11-03',
    from: localTime(2026, 11, 3, 0, 0),
    to: localTime(2026, 11, 4, 0, 0),
    onlineMs: HOUR,
    activeMs: 0,
    taskMs: 30 * MINUTE,
    hasObservations: true,
  })
  assert.deepEqual(series.days[1], {
    dateKey: '2026-11-04',
    from: localTime(2026, 11, 4, 0, 0),
    to: localTime(2026, 11, 5, 0, 0),
    onlineMs: HOUR,
    activeMs: 0,
    taskMs: 30 * MINUTE,
    hasObservations: true,
  })
})

test('范围汇总：无观测日期标 false，日均活跃只按有观测的日期计算', async () => {
  const start = localTime(2026, 11, 2, 0, 0)
  const clock = createFakeClock(start, 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  // 11-02 活跃 30 分钟。每 30 秒一次心跳，维持同一条活跃区间。
  for (let at = localTime(2026, 11, 2, 9, 0); at <= localTime(2026, 11, 2, 9, 30); at += 30_000) {
    advanceClock(clock, at)
    await service.recordPresence(foregroundPresence(at))
  }
  // 11-03 活跃 10 分钟。
  for (let at = localTime(2026, 11, 3, 10, 0); at <= localTime(2026, 11, 3, 10, 10); at += 30_000) {
    advanceClock(clock, at)
    await service.recordPresence(foregroundPresence(at))
  }
  advanceClock(clock, localTime(2026, 11, 3, 12, 0))

  const series = service.queryDailySeries({
    from: localTime(2026, 11, 1, 12, 0),
    to: localTime(2026, 11, 4, 12, 0),
  })

  assert.equal(series.days.length, 4)
  assert.deepEqual(series.days[0], {
    dateKey: '2026-11-01',
    from: localTime(2026, 11, 1, 0, 0),
    to: localTime(2026, 11, 2, 0, 0),
    onlineMs: 0,
    activeMs: 0,
    taskMs: 0,
    hasObservations: false,
  }, '启用前/没有记录的日子不是 0 值，而是 false')
  assert.equal(series.days[1].hasObservations, true)
  assert.equal(series.days[1].activeMs, 30 * MINUTE)
  assert.equal(series.days[2].hasObservations, true)
  assert.equal(series.days[2].activeMs, 10 * MINUTE)
  assert.equal(series.days[3].hasObservations, false, '查询上界之后的自然日没有观测')

  assert.deepEqual(series.summary, {
    onlineMs: 36 * HOUR,
    activeMs: 40 * MINUTE,
    taskMs: 0,
    activeDays: 2,
    observedDays: 2,
    dailyAverageActiveMs: 20 * MINUTE,
    peak: { dateKey: '2026-11-02', activeMs: 30 * MINUTE },
  })
  assert.equal(series.summary.observedDays, 2, '分母不是自然日总数 4')
})

test('子代理任务：不进入按天三项时长与观测标记，顶层过滤语义不变', async () => {
  const now = localTime(2026, 11, 4, 12, 0)
  const clock = createFakeClock(now, 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await addTurn(service, 'session-1', 1, localTime(2026, 11, 2, 10, 0), localTime(2026, 11, 2, 10, 30), {
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
  })
  await addTurn(service, 'session-sub', 1, localTime(2026, 11, 3, 10, 0), localTime(2026, 11, 3, 11, 0), {
    origin: 'subagent',
    parentSessionId: 'session-1',
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
  })

  const series = service.queryDailySeries({
    from: localTime(2026, 11, 2, 0, 0),
    to: localTime(2026, 11, 3, 23, 0),
  })
  assert.equal(series.days[0].taskMs, 30 * MINUTE)
  assert.equal(series.days[0].hasObservations, true)
  assert.equal(series.days[1].taskMs, 0, '子代理任务不计入按天任务时长')
  assert.equal(series.days[1].hasObservations, false, '只有子代理任务不算三项口径的观测')
  assert.equal(series.summary.taskMs, 30 * MINUTE)
  assert.equal(series.summary.observedDays, 1)

  const stats = service.queryStats({
    from: localTime(2026, 11, 2, 0, 0),
    to: localTime(2026, 11, 4, 0, 0),
    view: 'dashboard',
  })
  assert.equal(stats.taskCount, 1, '既有 queryStats 的顶层过滤不变')
  assert.equal(stats.taskMs, 30 * MINUTE)
  assert.equal(stats.taskSumMs, 30 * MINUTE)
})

test('无观测范围：逐日全部 false，汇总为零且峰值为 null', async () => {
  const clock = createFakeClock(localTime(2026, 11, 10, 10, 0), 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  const series = service.queryDailySeries({
    from: localTime(2026, 11, 2, 18, 0),
    to: localTime(2026, 11, 3, 3, 0),
  })
  assert.equal(series.days.length, 2)
  assert.ok(series.days.every((day) => day.hasObservations === false))
  assert.ok(series.days.every((day) => day.onlineMs === 0 && day.activeMs === 0 && day.taskMs === 0))
  assert.deepEqual(series.summary, {
    onlineMs: 0,
    activeMs: 0,
    taskMs: 0,
    activeDays: 0,
    observedDays: 0,
    dailyAverageActiveMs: 0,
    peak: null,
  })
})

/** 真实 Host 装配与私有 RPC：connection 只提供内存中的 fetch.register。 */
async function createRpcHarness() {
  let route
  let cleanup
  const domain = createMemoryDomain()
  const connection = { fetch: { register: (value) => { route = value; return () => {} } } }
  const ctxBase = {
    storageDomain: { open: async () => domain },
    timer: { interval: () => () => {} },
    tools: { register: () => () => {} },
    get: (name) => name === 'connection' ? connection : undefined,
    on: () => () => {},
    effect: (fn) => { cleanup = fn() },
  }
  // DSH 对未声明注入的属性访问会抛错；可选服务只能通过 ctx.get 获取。
  const ctx = new Proxy(ctxBase, {
    get(target, key, receiver) {
      if (key === 'sessionQuery') throw new Error('cannot get property "sessionQuery" without inject')
      return Reflect.get(target, key, receiver)
    },
  })
  await apply(ctx)
  const call = async (method, payload) => {
    const response = await route.fetch(new Request('http://isolated/api/chrono-scope', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'daily-series-check', payload: { method, payload } }),
    }))
    return (await response.json()).result
  }
  const close = async () => { if (cleanup) await cleanup() }
  return { call, close }
}

test('RPC queryDailySeries：返回 range/days/summary 契约并拒绝非法参数', async () => {
  const harness = await createRpcHarness()
  try {
    const now = Date.now()
    const today = new Date(now)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).getTime()
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2, 0, 0, 0, 0).getTime()
    const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 0, 0, 0, 0).getTime()

    const result = await harness.call('queryDailySeries', { from, to: now })
    assert.equal(result.ok, true, JSON.stringify(result))
    const value = result.value
    assert.deepEqual(value.range, { from, to: tomorrowStart }, 'RPC 原样转发领域层归一后的自然日范围')
    assert.equal(value.days.length, 3)
    assert.deepEqual(value.days.map((day) => day.dateKey), [
      dateKeyOf(from),
      dateKeyOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime()),
      dateKeyOf(todayStart),
    ])
    for (const day of value.days) {
      assert.equal(typeof day.from, 'number')
      assert.equal(typeof day.to, 'number')
      assert.equal(typeof day.onlineMs, 'number')
      assert.equal(typeof day.activeMs, 'number')
      assert.equal(typeof day.taskMs, 'number')
      assert.equal(typeof day.hasObservations, 'boolean')
    }
    assert.equal(typeof value.summary.onlineMs, 'number')
    assert.equal(typeof value.summary.activeMs, 'number')
    assert.equal(typeof value.summary.taskMs, 'number')
    assert.equal(typeof value.summary.activeDays, 'number')
    assert.equal(typeof value.summary.observedDays, 'number')
    assert.equal(typeof value.summary.dailyAverageActiveMs, 'number')

    const missing = await harness.call('queryDailySeries', { from })
    assert.equal(missing.ok, false)
    assert.match(missing.error.message, /from 与 to/)

    const reversed = await harness.call('queryDailySeries', { from: from + 1, to: from })
    assert.equal(reversed.ok, false)
    assert.match(reversed.error.message, /不能晚于/)

    const nonNumber = await harness.call('queryDailySeries', { from: '2026-11-01', to: now })
    assert.equal(nonNumber.ok, false)
    assert.match(nonNumber.error.message, /from 与 to/)

    const extra = await harness.call('queryDailySeries', { from, to: now, period: 'day' })
    assert.equal(extra.ok, false, '参数只允许 from 与 to')
    assert.match(extra.error.message, /只接受 from 与 to/)
  } finally {
    await harness.close()
  }
})

function dateKeyOf(timestamp) {
  const at = new Date(timestamp)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}
