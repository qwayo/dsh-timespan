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
      const response = await route.fetch(new Request('http://isolated/api/chrono-scope', {
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
