import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'
import { createMemoryDomain } from './helpers/memory-domain.js'

// 使用真实 Host 装配与 RPC，数据与会话读取器全部隔离在内存中。
async function exercise(sessionQuery, expectedStatus, expectedCount = 0) {
  let route
  let cleanup
  let listCalls = 0
  const domain = createMemoryDomain()
  const reader = sessionQuery && {
    listSessions: async () => { listCalls++; return sessionQuery.listSessions() },
    readSession: async (id) => sessionQuery.readSession(id),
  }
  const connection = { fetch: { register: (value) => { route = value; return () => {} } } }
  const ctxBase = {
    storageDomain: { open: async () => domain },
    timer: { interval: () => () => {} },
    tools: { register: () => () => {} },
    sessionQuery: reader,
    get: (name) => name === 'connection' ? connection : name === 'sessionQuery' ? reader : undefined,
    on: () => () => {},
    effect: (fn) => { cleanup = fn() },
  }
  // DSH 对未声明注入的属性访问会抛错；可选服务仍可通过 ctx.get 获取。
  const ctx = new Proxy(ctxBase, {
    get(target, key, receiver) {
      if (key === 'sessionQuery') throw new Error('cannot get property "sessionQuery" without inject')
      return Reflect.get(target, key, receiver)
    },
  })
  try {
    await apply(ctx)
    const query = async () => {
      const response = await route.fetch(new Request('http://isolated/api/dsh-timespan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'isolated-check',
          payload: { method: 'queryStats', payload: { period: 'day', view: 'dashboard' } } }),
      }))
      const envelope = await response.json()
      assert.equal(envelope.result.ok, true)
      assert.ok(Object.hasOwn(envelope.result.value, 'backfill'), '统计响应必须包含回填状态')
      return envelope.result.value
    }
    let result = await query()
    for (let tick = 0; tick < 100 && result.backfill.status !== expectedStatus; tick++) {
      await new Promise((resolve) => setImmediate(resolve))
      result = await query()
    }
    assert.equal(result.backfill.status, expectedStatus)
    assert.equal(result.taskCount, expectedCount)
    if (expectedStatus === 'done') {
      assert.equal(result.backfill.version, 1)
      assert.equal(result.backfill.scanned, expectedCount)
      assert.equal(result.backfill.total, expectedCount)
      assert.equal(result.backfill.tasksWritten, expectedCount)
      if (expectedCount > 0) assert.equal(result.taskMs, 1000)
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal((await query()).backfill.status, 'done')
      assert.equal(listCalls, 1, '回填完成后重复查询不得再次扫描')
    } else {
      assert.match(result.backfill.error, /sessionQuery/)
    }
  } finally {
    if (cleanup) await cleanup()
  }
}

test('回填 RPC：读取器缺失时返回可见失败状态', async () => {
  await exercise(undefined, 'failed')
})

test('回填 RPC：空列表成功完成且重复查询不重扫', async () => {
  await exercise({ listSessions: () => [], readSession: () => { throw new Error('空列表不应读取会话') } }, 'done')
})

test('回填 RPC：历史任务回填完成后统计与状态一致', async (t) => {
  const now = Date.now()
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  if (now - dayStart < 3000 || nextDay.getTime() - now < 3000) return t.skip('跨日边界等待下一次运行')
  const start = now - 2000
  await exercise({
    listSessions: () => [{ header: { id: 'isolated-session' }, persisted: true, live: false }],
    readSession: (id) => ({ session: { id }, inheritedEventCount: 0, events: [
      { seq: 0, type: 'session/title', time: start - 1, data: { title: '隔离回填任务' } },
      { seq: 1, type: 'turn/start', time: start, data: { turn: 1 } },
      { seq: 2, type: 'turn/end', time: start + 1000, data: { turn: 1, reason: { kind: 'completed' } } },
    ] }),
  }, 'done', 1)
})

/** 与真实 Host 装配一致的回填 RPC 夹具；只在内存域与假会话读取器上运行。 */
async function createBackfillRpcHarness() {
  let route
  let cleanup
  let listCalls = 0
  const domain = createMemoryDomain()
  const now = Date.now()
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const start = Math.max(dayStart, now - 2000)
  const reader = {
    listSessions: async () => {
      listCalls += 1
      return [{ header: { id: 'notice-session' }, persisted: true, live: false }]
    },
    readSession: async (id) => ({
      session: { id },
      inheritedEventCount: 0,
      events: [
        { seq: 0, type: 'turn/start', time: start, data: { turn: 1 } },
        { seq: 1, type: 'turn/end', time: start + 1000, data: { turn: 1, reason: { kind: 'completed' } } },
      ],
    }),
  }
  const connection = { fetch: { register: (value) => { route = value; return () => {} } } }
  const ctxBase = {
    storageDomain: { open: async () => domain },
    timer: { interval: () => () => {} },
    tools: { register: () => () => {} },
    sessionQuery: reader,
    get: (name) => name === 'connection' ? connection : name === 'sessionQuery' ? reader : undefined,
    on: () => () => {},
    effect: (fn) => { cleanup = fn() },
  }
  const ctx = new Proxy(ctxBase, {
    get(target, key, receiver) {
      if (key === 'sessionQuery') throw new Error('cannot get property "sessionQuery" without inject')
      return Reflect.get(target, key, receiver)
    },
  })
  await apply(ctx)
  const call = async (method, payload = {}) => {
    const response = await route.fetch(new Request('http://isolated/api/dsh-timespan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'isolated-notice',
        payload: { method, payload } }),
    }))
    const envelope = await response.json()
    assert.equal(envelope.result.ok, true, `${method} 调用失败：${JSON.stringify(envelope.result)}`)
    return envelope.result.value
  }
  const waitDone = async () => {
    let value = await call('getBackfillStatus')
    for (let tick = 0; tick < 100 && value.status !== 'done'; tick++) {
      await new Promise((resolve) => setImmediate(resolve))
      value = await call('getBackfillStatus')
    }
    return value
  }
  return { call, waitDone, counts: () => ({ listCalls }), close: async () => { if (cleanup) await cleanup() } }
}

test('回填 RPC：getBackfillStatus 返回事件与通知，markBackfillRead 持久化已读', async (t) => {
  const now = Date.now()
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  if (now - dayStart < 3000 || nextDay.getTime() - now < 3000) return t.skip('跨日边界等待下一次运行')

  const harness = await createBackfillRpcHarness()
  try {
    const done = await harness.waitDone()
    assert.equal(done.status, 'done')
    assert.equal(done.tasksWritten, 1)
    assert.match(done.eventId, /^backfill_\d+_v\d+$/)
    assert.equal(done.readEventId, '')
    assert.equal(done.notices.length, 1)
    assert.equal(done.notices[0].eventId, done.eventId)
    assert.equal(done.notices[0].tasksWritten, 1)
    assert.equal(done.notices[0].readAt, 0)

    const read = await harness.call('markBackfillRead', { eventId: done.eventId })
    assert.equal(read.eventId, done.eventId)
    assert.equal(read.readEventId, done.eventId)
    assert.ok(read.readAt > 0)
    assert.ok(read.notices[0].readAt > 0)

    // 同一事件多次查询保持同一 eventId 与已读锚点，不重扫。
    const again = await harness.call('getBackfillStatus')
    assert.equal(again.eventId, done.eventId)
    assert.equal(again.readEventId, done.eventId)
    assert.equal(harness.counts().listCalls, 1)

    // queryStats 的 backfill 结构新增字段但不破坏原有字段。
    const stats = await harness.call('queryStats', { period: 'day', view: 'dashboard' })
    assert.equal(stats.backfill.status, 'done')
    assert.equal(stats.backfill.version, 1)
    assert.equal(stats.backfill.tasksWritten, 1)
    assert.equal(stats.backfill.eventId, done.eventId)
    assert.equal(stats.backfill.readEventId, done.eventId)
    assert.equal(stats.backfill.notices.length, 1)
  } finally {
    await harness.close()
  }
})

test('回填 RPC：queryStats details 接受自定义 from 并跳过趋势与周期卡', async (t) => {
  const now = Date.now()
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  if (now - dayStart < 3000 || nextDay.getTime() - now < 3000) return t.skip('跨日边界等待下一次运行')
  const harness = await createBackfillRpcHarness()
  try {
    await harness.waitDone()
    const details = await harness.call('queryStats', { from: dayStart, view: 'details' })
    assert.equal(details.view, 'details')
    assert.equal(details.from, dayStart)
    assert.ok(details.to >= dayStart)
    assert.ok(Array.isArray(details.workspaces), '明细响应包含工作区会话来支撑页面展开')
    assert.equal(details.trend, undefined, '明细响应不带趋势桶')
    assert.equal(details.cycles, undefined, '明细响应不带周期卡')
  } finally {
    await harness.close()
  }
})

test('回填 RPC：markBackfillRead 拒绝缺少 eventId 的载荷', async () => {
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
  const ctx = new Proxy(ctxBase, {
    get(target, key, receiver) {
      if (key === 'sessionQuery') throw new Error('cannot get property "sessionQuery" without inject')
      return Reflect.get(target, key, receiver)
    },
  })
  try {
    await apply(ctx)
    const response = await route.fetch(new Request('http://isolated/api/dsh-timespan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'isolated-bad-read',
        payload: { method: 'markBackfillRead', payload: {} } }),
    }))
    const envelope = await response.json()
    assert.equal(envelope.result.ok, false)
    assert.match(envelope.result.error.message, /eventId/)
  } finally {
    if (cleanup) await cleanup()
  }
})
