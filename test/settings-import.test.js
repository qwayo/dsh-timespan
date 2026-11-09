/**
 * 票：数据导入的 Host/Domain 侧领域行为测试，以及新增设置项
 * approximateNoticeDismissed 的归一化测试。
 *
 * 测试缝沿用规格《Testing Decisions》约定的唯一公共入口：用假时钟与内存域
 * 注入数据、只断言对外可观察的返回值、统计与导出内容，不读私有存储表、
 * 不调用私有函数。时间一律用本地时间构造。Client 负责读文件与 JSON.parse，
 * 领域层的 importData 只接「已解析的对象」。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../index.js'
import { BACKFILL_VERSION } from '../src/domain/backfill.js'
import { createDshTimespanDomain } from '../src/domain/dsh-timespan-domain.js'
import { DEFAULT_SETTINGS, mergeSettings, normalizeSettings } from '../src/domain/settings.js'
import { createMemoryDomain } from './helpers/memory-domain.js'

const MINUTE = 60_000

/** 按 Host 本地时区构造时间戳；month 为 1–12。 */
function localTime(year, month, day, hour = 0, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
}

function createFakeClock({ now, uptimeMs = 0 }) {
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

async function startedService(now, uptimeMs = 0) {
  const domain = createMemoryDomain()
  const clock = createFakeClock({ now, uptimeMs })
  const service = createDshTimespanDomain({ domain, clock })
  await service.start()
  return { domain, clock, service }
}

/** 通过公共导出操作读回两张表与设置，避免直接读私有存储表。 */
async function exported(service) {
  const file = await service.exportData({ format: 'json' })
  return JSON.parse(file.content)
}

function dataSnapshot(payload) {
  return { settings: payload.settings, intervals: payload.intervals, tasks: payload.tasks }
}

/** 构造一条与 domain-spec 形状一致的在线区间记录。 */
function onlineInterval(id, at, overrides = {}) {
  return {
    id,
    type: 'online',
    start: at,
    end: at + MINUTE,
    lastHeartbeat: at + MINUTE,
    lastHeartbeatUptime: 0,
    clientId: null,
    sessionId: null,
    workspaceId: null,
    workspaceTitle: null,
    sessionTitle: null,
    approximate: false,
    source: 'live',
    ...overrides,
  }
}

/** 构造一条带归属的活跃区间记录。 */
function activeInterval(id, at, overrides = {}) {
  return {
    id,
    type: 'active',
    start: at,
    end: at + MINUTE,
    lastHeartbeat: at + MINUTE,
    clientId: 'client-1',
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
    sessionTitle: '会话一',
    approximate: false,
    source: 'live',
    ...overrides,
  }
}

/** 构造一条与 domain-spec 形状一致的任务记录。 */
function task(id, at, overrides = {}) {
  return {
    id,
    key: 'session-1:1',
    sessionId: 'session-1',
    turn: 1,
    parentSessionId: null,
    origin: null,
    workspaceId: null,
    workspaceTitle: null,
    sessionTitle: null,
    start: at,
    end: at + MINUTE,
    endReason: 'completed',
    modelMs: MINUTE,
    toolMs: 0,
    waitMs: 0,
    otherMs: 0,
    hasBreakdown: true,
    approximate: false,
    lastEventAt: at + MINUTE,
    lastEventUptime: null,
    startedUptime: null,
    segments: [],
    source: 'live',
    ...overrides,
  }
}

/** 构造一份合法导出对象；非法场景用 overrides 覆盖对应字段。 */
function makePayload(overrides = {}) {
  return {
    format: 'dsh-timespan-export',
    version: 1,
    exportedAt: localTime(2026, 11, 4, 10, 0),
    settings: { ...DEFAULT_SETTINGS },
    intervals: [],
    tasks: [],
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

test('导入：合法导出对象写入 intervals/tasks 并返回可断言统计', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)
  const payload = makePayload({
    intervals: [onlineInterval('iv-online-1', t0), activeInterval('iv-active-1', t0)],
    tasks: [
      task('task-1', t0),
      task('task-2', t0, { key: 'session-1:2', turn: 2 }),
    ],
  })

  const result = await service.importData(payload)
  assert.deepEqual(result.imported, { intervals: 2, tasks: 2 })
  assert.deepEqual(result.skipped, { intervals: 0, tasks: 0 })
  assert.equal(result.settingsRestored, false)
  assert.equal(typeof result.dataGeneration, 'number')

  const after = await exported(service)
  const intervalIds = after.intervals.map((row) => row.id)
  assert.ok(intervalIds.includes('iv-online-1'), '在线区间落库')
  assert.ok(intervalIds.includes('iv-active-1'), '活跃区间落库')
  const taskIds = after.tasks.map((row) => row.id)
  assert.ok(taskIds.includes('task-1'), '任务一落库')
  assert.ok(taskIds.includes('task-2'), '任务二落库')
  assert.equal(after.tasks.find((row) => row.id === 'task-1').start, t0, '记录内容原样保留')
})

test('导入：旧版 chronoscope-export 备份仍可导入', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)
  const result = await service.importData(makePayload({
    format: 'chronoscope-export',
    intervals: [onlineInterval('legacy-iv-1', t0)],
  }))
  assert.deepEqual(result.imported, { intervals: 1, tasks: 0 })
  const after = await exported(service)
  assert.ok(after.intervals.some((row) => row.id === 'legacy-iv-1'), '旧格式备份仍能落库')
})

test('导入：重复 ID 跳过且不覆盖已有记录', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { domain, service } = await startedService(t0)
  // 先放入两条「已存在」记录，与稍后导入的同 ID 记录内容不同。
  await domain.table('intervals').put('dup-1', onlineInterval('dup-1', t0, {
    sessionTitle: '原有记录',
    end: t0 + 5 * MINUTE,
  }))
  await domain.table('tasks').put('dup-task', task('dup-task', t0, { sessionTitle: '原有任务' }))

  const result = await service.importData(makePayload({
    intervals: [
      onlineInterval('dup-1', t0, { sessionTitle: '导入覆盖', end: t0 + 99 * MINUTE }),
      onlineInterval('new-2', t0),
    ],
    tasks: [
      task('dup-task', t0, { sessionTitle: '导入覆盖' }),
      task('new-task', t0, { key: 'session-1:9', turn: 9 }),
    ],
  }))
  assert.deepEqual(result.imported, { intervals: 1, tasks: 1 })
  assert.deepEqual(result.skipped, { intervals: 1, tasks: 1 })

  const after = await exported(service)
  const dupInterval = after.intervals.find((row) => row.id === 'dup-1')
  assert.equal(dupInterval.sessionTitle, '原有记录', '已存在区间未被覆盖')
  assert.equal(dupInterval.end, t0 + 5 * MINUTE, '已存在区间字段保持原值')
  assert.ok(after.intervals.some((row) => row.id === 'new-2'), '新区间 ID 被写入')
  const dupTask = after.tasks.find((row) => row.id === 'dup-task')
  assert.equal(dupTask.sessionTitle, '原有任务', '已存在任务未被覆盖')
  assert.ok(after.tasks.some((row) => row.id === 'new-task'), '新任务 ID 被写入')
})

test('导入：载荷内部重复 ID 只写入一次', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)
  const dup = onlineInterval('same-id', t0)
  const result = await service.importData(makePayload({
    intervals: [dup, { ...dup, sessionTitle: '第二次' }],
    tasks: [],
  }))
  assert.deepEqual(result.imported, { intervals: 1, tasks: 0 })
  assert.deepEqual(result.skipped, { intervals: 1, tasks: 0 })
  const after = await exported(service)
  const rows = after.intervals.filter((row) => row.id === 'same-id')
  assert.equal(rows.length, 1, '同一 ID 只落库一条')
  assert.equal(rows[0].sessionTitle, null, '先出现的记录胜出，后到的不覆盖')
})

test('导入：缺少显式 id 的记录按字段组合去重，非对象条目计入 skipped', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)
  const noId = onlineInterval('will-be-removed', t0)
  delete noId.id

  const result = await service.importData(makePayload({
    intervals: [noId, { ...noId }, null, 'garbage'],
    tasks: [],
  }))
  assert.equal(result.imported.intervals, 1, '同一字段组合只写入一次')
  assert.equal(result.skipped.intervals, 3, '重复键 + 两个非对象条目都计入 skipped')

  const after = await exported(service)
  const fallback = after.intervals.filter((row) => String(row.id).startsWith('import_iv_'))
  assert.equal(fallback.length, 1, '兜底键落库且路径安全')
  assert.ok(typeof fallback[0].id === 'string' && fallback[0].id.length > 0, '落库记录补上了 id')
})

test('导入：非法 format / version / 非数组载荷被结构化错误拒绝且不改库', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)
  const before = dataSnapshot(await exported(service))

  const cases = [
    [makePayload({ format: 'other' }), 'invalid-format', /格式/],
    [makePayload({ format: undefined }), 'invalid-format', /格式/],
    [makePayload({ version: 2 }), 'unsupported-version', /版本/],
    [makePayload({ version: '1' }), 'unsupported-version', /版本/],
    [makePayload({ intervals: 'nope' }), 'invalid-intervals', /intervals/],
    [makePayload({ intervals: null }), 'invalid-intervals', /intervals/],
    [makePayload({ tasks: {} }), 'invalid-tasks', /tasks/],
    [null, 'invalid-payload', /对象/],
    [[], 'invalid-payload', /对象/],
  ]
  for (const [payload, code, message] of cases) {
    await assert.rejects(
      () => service.importData(payload),
      (error) => {
        assert.ok(error instanceof Error)
        assert.equal(error.name, 'DshTimespanImportError')
        assert.equal(error.code, code)
        assert.match(error.message, message, '错误信息用中文')
        return true
      },
    )
  }

  const after = dataSnapshot(await exported(service))
  assert.deepEqual(after, before, '任何一次拒绝都没有改动存储')
})

test('导入：默认不恢复设置；restoreSettings:true 才合并且未知字段被丢弃', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)
  await service.setSettings({ idleThresholdMinutes: 12, showSubagents: false })

  const incomingSettings = {
    idleThresholdMinutes: 2,
    weekStartsOn: 7,
    showSubagents: true,
    durationFormat: 'zh',
    sidebarShowName: false,
    sidebarDuration: 'task',
    approximateNoticeDismissed: true,
    evilField: '不应写入',
  }

  // 默认：payload.settings 完全不生效，设置保持当前值。
  const defaultResult = await service.importData(makePayload({ settings: incomingSettings }))
  assert.equal(defaultResult.settingsRestored, false)
  assert.deepEqual(service.getSettings(), {
    idleThresholdMinutes: 12,
    weekStartsOn: 1,
    showSubagents: false,
    durationFormat: 'short',
    sidebarShowName: false,
    sidebarDuration: 'online',
    approximateNoticeDismissed: false,
  })

  // 显式恢复：合并 payload.settings，未知字段被白名单丢弃。
  const restoreResult = await service.importData(makePayload({
    settings: incomingSettings,
    restoreSettings: true,
  }))
  assert.equal(restoreResult.settingsRestored, true)
  const restored = service.getSettings()
  assert.equal(restored.idleThresholdMinutes, 2)
  assert.equal(restored.weekStartsOn, 7)
  assert.equal(restored.showSubagents, true)
  assert.equal(restored.durationFormat, 'zh')
  assert.equal(restored.sidebarShowName, false)
  assert.equal(restored.sidebarDuration, 'task')
  assert.equal(restored.approximateNoticeDismissed, true)
  assert.equal(Object.hasOwn(restored, 'evilField'), false, '未知字段被 normalizeSettings 白名单丢弃')

  // 局部恢复：payload.settings 只给出一项时，其余沿用当前值。
  await service.importData(makePayload({ settings: { idleThresholdMinutes: 3 }, restoreSettings: true }))
  const partial = service.getSettings()
  assert.equal(partial.idleThresholdMinutes, 3)
  assert.equal(partial.weekStartsOn, 7, '局部恢复保留其它字段')
  assert.equal(partial.approximateNoticeDismissed, true, '局部恢复保留布尔开关')
})

test('导入：回填状态收口为 done + 当前版本，dataGeneration 逐次递增', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)

  const first = await service.importData(makePayload())
  const status = service.getBackfillStatus()
  assert.equal(status.status, 'done')
  assert.equal(status.version, BACKFILL_VERSION)
  assert.equal(status.scanned, 0)
  assert.equal(status.total, 0)
  assert.equal(status.tasksWritten, 0)
  assert.equal(status.error, null)

  const second = await service.importData(makePayload())
  assert.equal(second.dataGeneration, first.dataGeneration + 1, '每次导入都递增 dataGeneration')
})

test('导入：空数据在全新空域导入后重开一条在线区间', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  // 刻意不调用 start()：域里没有任何区间，用来触发「合并后 intervals 为空」。
  const domain = createMemoryDomain()
  const clock = createFakeClock({ now: t0 })
  const service = createDshTimespanDomain({ domain, clock })

  const result = await service.importData(makePayload())
  assert.deepEqual(result.imported, { intervals: 0, tasks: 0 })

  const payload = await exported(service)
  const online = payload.intervals.filter((row) => row.type === 'online')
  assert.equal(online.length, 1, '重开唯一一条在线区间')
  assert.equal(online[0].end, null, '在线区间是开放的')
  assert.equal(online[0].start, t0)
  assert.equal(online[0].source, 'live')
  assert.equal(online[0].approximate, false)

  // meta.currentBootId 指向这条区间：下一次在线心跳仍能正常推进。
  clock.nowMs = t0 + MINUTE
  await service.recordPresence({ at: clock.nowMs })
  const stats = service.queryStats({ from: t0, to: t0 + 2 * MINUTE })
  assert.ok(stats.onlineMs > 0, '重开的在线区间能被心跳正常推进')
})

test('设置：approximateNoticeDismissed 默认 false，只认布尔，非法值收敛为 false', () => {
  assert.equal(DEFAULT_SETTINGS.approximateNoticeDismissed, false)
  assert.equal(normalizeSettings({}).approximateNoticeDismissed, false)
  assert.equal(normalizeSettings(null).approximateNoticeDismissed, false)
  assert.equal(normalizeSettings({ approximateNoticeDismissed: true }).approximateNoticeDismissed, true)
  assert.equal(normalizeSettings({ approximateNoticeDismissed: false }).approximateNoticeDismissed, false)
  for (const value of ['true', 'false', 1, 0, null, undefined, {}, [], 'yes']) {
    assert.equal(
      normalizeSettings({ approximateNoticeDismissed: value }).approximateNoticeDismissed,
      false,
      `非法值 ${String(value)} 收敛为 false`,
    )
  }

  // mergeSettings 局部更新语义不变：未提及时保留，给出非法值时收敛。
  const merged = mergeSettings({ approximateNoticeDismissed: true }, { idleThresholdMinutes: 8 })
  assert.equal(merged.approximateNoticeDismissed, true, '补丁未提及时保留已关闭状态')
  assert.equal(mergeSettings({}, { approximateNoticeDismissed: 'yes' }).approximateNoticeDismissed, false)
  assert.equal(mergeSettings({}, { approximateNoticeDismissed: true }).approximateNoticeDismissed, true)
})

test('设置：approximateNoticeDismissed 可保存、读回并在重启后保留', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { domain, service } = await startedService(t0)
  assert.equal(service.getSettings().approximateNoticeDismissed, false, '默认未关闭')

  await service.setSettings({ approximateNoticeDismissed: true })
  assert.equal(service.getSettings().approximateNoticeDismissed, true)
  const partial = await service.setSettings({ idleThresholdMinutes: 9 })
  assert.equal(partial.approximateNoticeDismissed, true, '局部更新保留')

  const restarted = createDshTimespanDomain({ domain, clock: createFakeClock({ now: t0 }) })
  await restarted.start()
  assert.equal(restarted.getSettings().approximateNoticeDismissed, true, '重启后保留')
})

test('导入：导出→导入往返数据一致，重复导入幂等', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)
  await service.recordPresence({
    at: t0 + MINUTE,
    clientId: 'client-1',
    visible: true,
    focused: true,
    lastInteractionAt: t0 + MINUTE,
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
    sessionTitle: '会话一',
    foregroundRunning: false,
  })
  await addTurn(service, 'session-1', 1, t0, t0 + MINUTE)

  const file = await service.exportData({ format: 'json' })
  const payload = JSON.parse(file.content)
  assert.ok(payload.intervals.length > 0)
  assert.equal(payload.tasks.length, 1)

  // 往返一：导入到全新空域，得到同一批 intervals / tasks / settings。
  const freshService = createDshTimespanDomain({
    domain: createMemoryDomain(),
    clock: createFakeClock({ now: t0 }),
  })
  const imported = await freshService.importData(payload)
  assert.equal(imported.imported.intervals, payload.intervals.length)
  assert.equal(imported.imported.tasks, payload.tasks.length)
  assert.equal(imported.skipped.intervals, 0)
  assert.equal(imported.skipped.tasks, 0)
  const freshExport = await exported(freshService)
  assert.deepEqual(freshExport.intervals, payload.intervals, '区间逐条一致')
  assert.deepEqual(freshExport.tasks, payload.tasks, '任务逐条一致')
  assert.deepEqual(freshExport.settings, payload.settings, '设置一致')

  // 往返二：把同一份内容再导入回原服务，全部命中已存在键，数据保持不变。
  const again = await service.importData(payload)
  assert.equal(again.imported.intervals, 0)
  assert.equal(again.imported.tasks, 0)
  assert.equal(again.skipped.intervals, payload.intervals.length)
  assert.equal(again.skipped.tasks, payload.tasks.length)
  const after = await exported(service)
  assert.deepEqual(after.intervals, payload.intervals, '重复导入不新增也不覆盖')
  assert.deepEqual(after.tasks, payload.tasks)
})

/** 走真实 Host 装配与私有 RPC，验证 importData 挂在 Host 公共操作上。 */
async function createRpcHarness() {
  let route
  let cleanup
  let listCalls = 0
  let readCalls = 0
  const domain = createMemoryDomain()
  const now = Date.now()
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const start = Math.max(dayStart, now - 2000)
  const session = {
    header: { id: 'historical-session' },
    persisted: true,
    live: false,
  }
  const reader = {
    listSessions: async () => {
      listCalls += 1
      return [session]
    },
    readSession: async (id) => {
      readCalls += 1
      return {
        session: { id },
        inheritedEventCount: 0,
        events: [
          { seq: 0, type: 'turn/start', time: start, data: { turn: 1 } },
          { seq: 1, type: 'turn/end', time: start + 1000, data: { turn: 1, reason: { kind: 'completed' } } },
        ],
      }
    },
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
      body: JSON.stringify({ type: 'client-request', rpcId: 'isolated-check', payload: { method, payload } }),
    }))
    const envelope = await response.json()
    assert.equal(envelope.result.ok, true, `${method} 调用失败：${JSON.stringify(envelope.result)}`)
    return envelope.result.value
  }
  const close = async () => { if (cleanup) await cleanup() }
  return { call, close, domain, counts: () => ({ listCalls, readCalls }), session }
}

test('RPC：importData 挂在 Host 公共操作上，导入后回填保持收口', async () => {
  const harness = await createRpcHarness()
  try {
    const t0 = Date.now()
    const result = await harness.call('importData', makePayload({
      intervals: [onlineInterval('rpc-iv-1', t0), activeInterval('rpc-iv-2', t0)],
      tasks: [task('rpc-task-1', t0)],
    }))
    assert.deepEqual(result.imported, { intervals: 2, tasks: 1 })
    assert.deepEqual(result.skipped, { intervals: 0, tasks: 0 })
    assert.equal(result.settingsRestored, false)
    assert.equal(typeof result.dataGeneration, 'number')

    // 导入后回填收口为 done，后续取数不再把历史会话重新灌回来。
    const listBefore = harness.counts().listCalls
    const stats = await harness.call('queryStats', { period: 'day', view: 'dashboard' })
    assert.equal(stats.backfill.status, 'done')
    assert.equal(harness.counts().listCalls, listBefore, '回填已 done，后续取数不扫描会话日志')

    // 新设置经由 setSettings 白名单保存并读回，供前端关闭近似说明使用。
    const saved = await harness.call('setSettings', { approximateNoticeDismissed: true })
    assert.equal(saved.approximateNoticeDismissed, true)
    const readBack = await harness.call('getSettings')
    assert.equal(readBack.approximateNoticeDismissed, true)
  } finally {
    await harness.close()
  }
})
