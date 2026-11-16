import test from 'node:test'
import assert from 'node:assert/strict'
import { registerDshTimespanRpc } from '../src/host/rpc.js'

function harness(service = {}, analysis) {
  let route
  const connection = { fetch: { register(value) { route = value; return () => {} } } }
  registerDshTimespanRpc({ get: (name) => name === 'connection' ? connection : undefined }, service, { analysis })
  return async (method, payload = {}) => {
    const response = await route.fetch(new Request('http://localhost/api/dsh-timespan', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'time-tools-check', payload: { method, payload } }),
    }))
    return (await response.json()).result
  }
}

test('分析范围非法时拒绝调用，不能静默扩大到所有会话', async () => {
  let calls = 0
  const call = harness({}, { start: () => { calls += 1 } })
  for (const payload of [null, [], { period: 'all' }, { period: 'day', workspaceId: 123 }, { period: 'day', sessionId: {} }]) {
    const result = await call('generateAnalysis', payload)
    assert.equal(result.ok, false)
  }
  assert.equal(calls, 0)
})

test('分析请求由 Host 决定模型和数据，客户端只能传周期及归属筛选', async () => {
  let received
  const call = harness({}, { start: (options) => { received = options; return { phase: 'collecting' } } })
  const result = await call('generateAnalysis', {
    period: 'week', workspaceId: 'workspace-1', sessionId: 'session-1',
    provider: 'untrusted-route', model: 'other', messages: ['替换分析内容'],
  })
  assert.equal(result.ok, true)
  assert.deepEqual(received, { period: 'week', workspaceId: 'workspace-1', sessionId: 'session-1' })
})

test('跨窗口模型变化时拒绝旧选择，不能向用户未确认的新 Provider 发送材料', async () => {
  let calls = 0
  const call = harness({ getSettings: () => ({ analysisProvider: 'new-provider', analysisModel: 'new-model' }) }, {
    start: (value) => { calls += 1; assert.deepEqual(value, { period: 'day' }); return { phase: 'collecting' } },
  })
  const stale = await call('generateAnalysis', { period: 'day', expectedProvider: 'old-provider', expectedModel: 'old-model' })
  assert.equal(stale.ok, false)
  assert.equal(stale.error.code, 'analysis-model-changed')
  assert.equal(calls, 0)
  assert.equal((await call('generateAnalysis', { period: 'day', expectedProvider: 'new-provider' })).ok, false)
  const current = await call('generateAnalysis', { period: 'day', expectedProvider: 'new-provider', expectedModel: 'new-model' })
  assert.equal(current.ok, true)
  assert.equal(calls, 1)
})

test('清空等待分析停止后才清领域数据', async () => {
  const events = []
  let release
  const stopped = new Promise((resolve) => { release = resolve })
  const call = harness({ clearData: () => { events.push('clear-data'); return { clearedAt: 1 } } }, {
    clear: async () => { events.push('stop-analysis'); await stopped; events.push('analysis-stopped') },
  })
  const pending = call('clearData')
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(events, ['stop-analysis'])
  release()
  assert.equal((await pending).ok, true)
  assert.deepEqual(events, ['stop-analysis', 'analysis-stopped', 'clear-data'])
})

test('导入只转交完成结果和报告，不把备份中的运行计时带入领域层', async () => {
  let received
  const call = harness({ importData: (payload) => { received = payload; return { imported: true } } })
  const lastTimerResult = { id: 'finished' }
  const reports = { day: null, week: null, month: null }
  assert.equal((await call('importData', {
    format: 'dsh-timespan-export', version: 1, intervals: [], tasks: [], lastTimerResult, reports,
    timer: { status: 'running' }, analysisAudit: { messages: ['不得从导入请求启动模型'] },
  })).ok, true)
  assert.deepEqual(received.lastTimerResult, lastTimerResult)
  assert.deepEqual(received.reports, reports)
  assert.equal(Object.hasOwn(received, 'timer'), false)
  assert.equal(Object.hasOwn(received, 'analysisAudit'), false)
})

test('分析 Provider 与模型一起保存，凭据字段不会进入插件设置', async () => {
  let received
  const call = harness({ setSettings: (patch) => { received = patch; return patch } })
  assert.equal((await call('setSettings', { analysisProvider: 'configured', analysisModel: 'model-a', timerSound: false, floatingEnabled: false, floatingShowClock: true, apiKey: 'not-a-key' })).ok, true)
  assert.deepEqual(received, { timerSound: false, floatingEnabled: false, floatingShowClock: true, analysisProvider: 'configured', analysisModel: 'model-a' })
})

test('计时操作保留实例 ID 和领域错误码，过期操作可被前端识别', async () => {
  const call = harness({ controlTimer: ({ id }) => {
    assert.equal(id, 'previous-timer')
    throw Object.assign(new Error('计时状态已变化，请重试'), { code: 'timer/stale' })
  } })
  const result = await call('controlTimer', { action: 'pause', id: 'previous-timer' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'timer/stale')
})
