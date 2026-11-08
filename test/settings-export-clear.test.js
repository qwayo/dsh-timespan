/**
 * 票 06：设置持久化与即时生效、导出、清空的领域行为测试。
 *
 * 测试缝沿用规格《Testing Decisions》约定的唯一公共入口：用假时钟与内存域
 * 注入 presence / session 事件，只断言对外可观察的返回值、数值与文件内容，
 * 不读私有存储表、不调用私有函数。时间一律用本地时间构造。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../index.js'
import { createChronoScopeDomain } from '../src/domain/chrono-scope-domain.js'
import { periodRange } from '../src/domain/periods.js'
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
  const clock = createFakeClock({ now, uptimeMs })
  const service = createChronoScopeDomain({ domain, clock })
  await service.start()
  return { domain, clock, service }
}

function csvRows(file) {
  const text = file.content.replace(/^\uFEFF/, '').trimEnd()
  const lines = text.split(/\r?\n/)
  return { header: lines[0].split(','), lines }
}

test('设置：默认空闲阈值 5 分钟、周起始周一、显示子代理、数字格式 hms 与侧栏名称', async () => {
  const { service } = await startedService(localTime(2026, 11, 4, 10, 0))
  assert.deepEqual(service.getSettings(), {
    idleThresholdMinutes: 5,
    weekStartsOn: 1,
    showSubagents: true,
    durationFormat: 'hms',
    sidebarShowName: true,
    approximateNoticeDismissed: false,
  })
})

test('设置归一化：durationFormat 只认五种预设，补丁不覆盖其它项', () => {
  assert.equal(DEFAULT_SETTINGS.durationFormat, 'hms')
  assert.equal(normalizeSettings({ durationFormat: 'zh' }).durationFormat, 'zh')
  for (const value of ['short', 'sec', 'padded', 'hms']) {
    assert.equal(normalizeSettings({ durationFormat: value }).durationFormat, value)
  }
  for (const value of ['', 'HMS', 'auto', null, undefined, 7]) {
    assert.equal(normalizeSettings({ durationFormat: value }).durationFormat, 'hms', `非法值 ${String(value)} 回落 hms`)
  }
  const merged = mergeSettings(
    { idleThresholdMinutes: 9, weekStartsOn: 7, showSubagents: false, durationFormat: 'zh' },
    { durationFormat: 'short' },
  )
  assert.deepEqual(merged, {
    idleThresholdMinutes: 9,
    weekStartsOn: 7,
    showSubagents: false,
    durationFormat: 'short',
    sidebarShowName: true,
    approximateNoticeDismissed: false,
  })
  const untouched = mergeSettings({ idleThresholdMinutes: 11, durationFormat: 'padded' }, { showSubagents: false })
  assert.equal(untouched.durationFormat, 'padded', '补丁未提及 durationFormat 时保留原值')
})

test('设置：侧栏名称默认显示，可关闭并在局部更新与重启后保留', async () => {
  const { domain, service } = await startedService(localTime(2026, 11, 4, 10, 0))
  assert.equal(service.getSettings().sidebarShowName, true, '默认显示侧栏名称')

  const saved = await service.setSettings({ sidebarShowName: 'false' })
  assert.equal(saved.sidebarShowName, false, '字符串 false 也收敛为关闭')

  const partial = await service.setSettings({ idleThresholdMinutes: 9 })
  assert.equal(partial.sidebarShowName, false, '局部更新保留侧栏名称开关')

  const restarted = createChronoScopeDomain({ domain, clock: createFakeClock({ now: localTime(2026, 11, 4, 10, 0) }) })
  await restarted.start()
  assert.equal(restarted.getSettings().sidebarShowName, false, '重启后侧栏名称开关仍保留')
})

test('设置：非法值收敛到合法范围，局部更新不覆盖其他项，保存后重启仍生效', async () => {
  const { domain, service } = await startedService(localTime(2026, 11, 4, 10, 0))

  assert.equal((await service.setSettings({ durationFormat: 'unsupported' })).durationFormat, 'hms', '非法格式回落默认')

  const saved = await service.setSettings({
    idleThresholdMinutes: 99,
    weekStartsOn: 7,
    showSubagents: false,
    durationFormat: 'zh',
    sidebarShowName: false,
  })
  assert.equal(saved.idleThresholdMinutes, 15, '超过 15 分钟收敛到上界')
  assert.equal(saved.weekStartsOn, 7)
  assert.equal(saved.showSubagents, false)
  assert.equal(saved.durationFormat, 'zh')
  assert.equal(saved.sidebarShowName, false)

  const partial = await service.setSettings({ idleThresholdMinutes: -3 })
  assert.equal(partial.idleThresholdMinutes, 1, '低于 1 分钟收敛到下界')
  assert.equal(partial.weekStartsOn, 7, '局部更新保留周起始')
  assert.equal(partial.showSubagents, false, '局部更新保留子代理开关')
  assert.equal(partial.durationFormat, 'zh', '局部更新保留数字格式')
  assert.equal(partial.sidebarShowName, false, '局部更新保留侧栏名称开关')

  // 重启：用同一个存储域重新构造领域服务，只通过公共操作确认设置仍在。
  const restarted = createChronoScopeDomain({ domain, clock: createFakeClock({ now: localTime(2026, 11, 4, 10, 0) }) })
  await restarted.start()
  assert.deepEqual(restarted.getSettings(), partial)
})

test('设置：空闲阈值修改后，后续活跃判定立即按新值执行，无需重启', async () => {
  const t0 = localTime(2026, 11, 4, 2, 0)
  const { clock, service } = await startedService(t0)

  clock.nowMs = t0 + 2 * MINUTE
  let result = await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0 }))
  assert.equal(result.active.active, true, '默认 5 分钟阈值下，2 分钟前的操作仍算活跃')

  await service.setSettings({ idleThresholdMinutes: 1 })
  clock.nowMs = t0 + 2 * MINUTE + 15_000
  result = await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0 }))
  assert.equal(result.active.active, false, '改成 1 分钟后，同一段空闲立刻被判为不活跃')

  await service.setSettings({ idleThresholdMinutes: 15 })
  clock.nowMs = t0 + 2 * MINUTE + 30_000
  result = await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0 }))
  assert.equal(result.active.active, true, '改回 15 分钟后重新算活跃')
})

test('设置：周起始修改后，周统计与周期卡边界立即改变，显式参数仍可覆盖', async () => {
  const now = localTime(2026, 11, 4, 12, 0) // 周三
  const { service } = await startedService(now)

  const monday = service.queryStats({ period: 'week', view: 'dashboard' })
  assert.equal(monday.weekStartsOn, 1)
  assert.equal(monday.range.from, periodRange('week', now, { weekStartsOn: 1 }).from)

  await service.setSettings({ weekStartsOn: 7 })
  const sunday = service.queryStats({ period: 'week', view: 'dashboard' })
  assert.equal(sunday.weekStartsOn, 7)
  assert.equal(sunday.range.from, periodRange('week', now, { weekStartsOn: 7 }).from)
  assert.notEqual(sunday.range.from, monday.range.from, '周起始不同，周窗口起点必须不同')
  assert.equal(sunday.cycles.week.from, sunday.range.from, '周期卡与趋势桶同步切换到新边界')

  const overridden = service.queryStats({ period: 'week', weekStartsOn: 1, view: 'dashboard' })
  assert.equal(overridden.range.from, monday.range.from, 'Host 工具仍可显式指定周起始')
})

test('设置：关闭子代理明细后，仪表盘响应不再携带子代理任务', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)
  await addTurn(service, 'session-a', 1, t0, t0 + MINUTE)
  await addTurn(service, 'session-sub', 1, t0, t0 + MINUTE, {
    origin: 'subagent',
    parentSessionId: 'session-a',
  })

  const shown = service.queryStats({ from: t0, to: t0 + 2 * MINUTE, view: 'dashboard' })
  assert.equal(shown.subagentTasks.length, 1)

  await service.setSettings({ showSubagents: false })
  const hidden = service.queryStats({ from: t0, to: t0 + 2 * MINUTE, view: 'dashboard' })
  assert.deepEqual(hidden.subagentTasks, [])
  assert.equal(hidden.taskCount, 1, '关闭明细不影响总计口径')
})

test('导出 JSON：包含原始区间、原始任务与设置，字段未经裁剪', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)
  await service.recordPresence(foregroundPresence(t0 + MINUTE))
  await addTurn(service, 'session-a', 1, t0, t0 + MINUTE, {
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
  })
  await service.setSettings({ idleThresholdMinutes: 9, weekStartsOn: 7 })

  const file = await service.exportData({ format: 'json' })
  assert.equal(file.format, 'json')
  assert.match(file.filename, /\.json$/)
  assert.match(file.mimeType, /application\/json/)

  const payload = JSON.parse(file.content)
  assert.deepEqual(payload.settings, {
    idleThresholdMinutes: 9,
    weekStartsOn: 7,
    showSubagents: true,
    durationFormat: 'hms',
    sidebarShowName: true,
    approximateNoticeDismissed: false,
  })
  assert.ok(payload.intervals.some((row) => row.type === 'online'), '原始在线区间必须导出')
  assert.ok(payload.intervals.some((row) => row.type === 'active'), '原始活跃区间必须导出')
  assert.equal(payload.tasks.length, 1)
  assert.equal(payload.tasks[0].sessionId, 'session-a')
  assert.equal(payload.tasks[0].workspaceTitle, '工作区一')
  assert.equal(payload.tasks[0].start, t0)
  assert.equal(payload.tasks[0].end, t0 + MINUTE)
  assert.ok(Array.isArray(payload.tasks[0].segments), '原始构成分段不丢失')
})

test('导出 CSV：按日 × 工作区平面表，字段完整可读且正确转义', async () => {
  const day1 = localTime(2026, 11, 4, 10, 0)
  const day2 = localTime(2026, 11, 5, 10, 0)
  const { clock, service } = await startedService(day1)

  await service.recordPresence(foregroundPresence(day1, { workspaceTitle: '工作区,一' }))
  await addTurn(service, 'session-a', 1, day1, day1 + 10 * MINUTE, {
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区,一',
  })
  await service.recordPresence(foregroundPresence(day2, {
    sessionId: 'session-2',
    workspaceId: 'workspace-2',
    workspaceTitle: '工作区二',
  }))
  await addTurn(service, 'session-2', 1, day2, day2 + 5 * MINUTE, {
    workspaceId: 'workspace-2',
    workspaceTitle: '工作区二',
  })
  clock.nowMs = day2 + 30 * MINUTE
  await service.close()

  const file = await service.exportData({ format: 'csv' })
  assert.equal(file.format, 'csv')
  assert.match(file.filename, /\.csv$/)
  assert.match(file.mimeType, /text\/csv/)
  assert.ok(file.content.startsWith('\uFEFF'), 'CSV 带 UTF-8 BOM，Excel 打开中文不乱码')

  const { header, lines } = csvRows(file)
  for (const column of ['日期', '工作区ID', '工作区名称', '会话数', '任务次数', '活跃时长(毫秒)', '活跃时长', '任务时长(毫秒)', '任务时长', '当日实际占用·活跃(毫秒)', '当日实际占用·任务(毫秒)', '当日在线时长(毫秒)', '当日在线时长']) {
    assert.ok(header.includes(column), `CSV 缺少列 ${column}`)
  }
  assert.equal(lines.length, 3, '两天各一个工作区，表头 + 2 行')
  assert.ok(file.content.includes('2026-11-04'), '按自然日给出日期键')
  assert.ok(file.content.includes('2026-11-05'))
  assert.ok(file.content.includes('"工作区,一"'), '含逗号的工作区名称必须被引号包裹')

  const row1 = lines[1]
  assert.ok(row1.includes('600000'), '第一行任务时长为 10 分钟（毫秒）')
  assert.ok(row1.includes(',600000,0:10:00,'), '同时给出可读时长（默认 hms，小时不补零）')
  const row2 = lines[2]
  assert.ok(row2.includes('300000'), '第二行任务时长为 5 分钟（毫秒）')
  assert.ok(row2.includes(',300000,0:05:00,'))
})

test('导出 CSV：可读时长跟随当前 durationFormat，与页面使用同一格式定义', async () => {
  const day = localTime(2026, 11, 4, 10, 0)
  const { clock, service } = await startedService(day)
  await addTurn(service, 'session-a', 1, day, day + 10 * MINUTE, {
    workspaceId: 'workspace-1',
    workspaceTitle: '工作区一',
  })
  clock.nowMs = day + 20 * MINUTE

  await service.setSettings({ durationFormat: 'zh' })
  let csv = (await service.exportData({ format: 'csv' })).content
  assert.ok(csv.includes('10 分 0 秒'), '中文单位格式写入 CSV')
  assert.ok(!csv.includes('0:10:00'), '不能混入默认格式')

  await service.setSettings({ durationFormat: 'padded' })
  csv = (await service.exportData({ format: 'csv' })).content
  assert.ok(csv.includes('00:10:00'), '补零时钟格式写入 CSV')

  await service.setSettings({ durationFormat: 'short' })
  csv = (await service.exportData({ format: 'csv' })).content
  assert.ok(csv.includes('10m 0s'), '紧凑单位格式写入 CSV')

  const json = JSON.parse((await service.exportData({ format: 'json' })).content)
  assert.equal(json.settings.durationFormat, 'short', 'JSON 导出保留当前格式设置')
})

test('导出：未知格式被拒绝，缺省格式不做猜测', async () => {
  const { service } = await startedService(localTime(2026, 11, 4, 10, 0))
  await assert.rejects(() => service.exportData({ format: 'xlsx' }), /不支持的导出格式/)
  await assert.rejects(() => service.exportData({}), /不支持的导出格式/)
})

test('清空：删除全部历史统计、保留设置、页面进入空状态且可继续记录', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { clock, service } = await startedService(t0)
  await service.recordPresence(foregroundPresence(t0 + MINUTE))
  await addTurn(service, 'session-a', 1, t0, t0 + MINUTE)
  await service.setSettings({ idleThresholdMinutes: 12, weekStartsOn: 7, showSubagents: false })

  const before = JSON.parse((await service.exportData({ format: 'json' })).content)
  assert.ok(before.intervals.length > 0)
  assert.equal(before.tasks.length, 1)

  const cleared = await service.clearData()
  assert.equal(cleared.intervalsRemoved, before.intervals.length)
  assert.equal(cleared.tasksRemoved, 1)

  const after = JSON.parse((await service.exportData({ format: 'json' })).content)
  assert.equal(after.tasks.length, 0, '历史任务全部删除')
  assert.equal(after.intervals.filter((row) => row.type === 'active').length, 0, '历史活跃区间全部删除')
  assert.deepEqual(after.settings, before.settings, '三项设置保留')

  const stats = service.queryStats({ period: 'day', view: 'dashboard' })
  assert.equal(stats.taskCount, 0)
  assert.equal(stats.taskMs, 0)
  assert.equal(stats.activeMs, 0)
  assert.deepEqual(stats.workspaces, [], '清空后页面进入空状态')

  // 记录并没有停止：下一次心跳仍能推进在线区间。
  clock.nowMs = t0 + 2 * MINUTE
  await service.recordPresence({ at: clock.nowMs })
  const resumed = service.queryStats({ from: t0, to: t0 + 3 * MINUTE })
  assert.ok(resumed.onlineMs > 0, '清空后仍从新起点继续记录')

  // 只删本域统计记录：JSON 导出的原始明细里不再有历史收口区间或任务，
  // 只剩一条从清空时刻起算的新在线区间；会话日志不在这个域里，领域服务也从不写入。
  assert.equal(after.intervals.filter((row) => row.end !== null).length, 0, '历史收口区间全部删除')
  assert.equal(after.intervals.filter((row) => row.type === 'online' && row.end === null).length, 1,
    '记录没有停止，只剩一条新开的在线区间')
  assert.equal(after.intervals.filter((row) => row.type === 'active').length, 0, '历史活跃区间全部删除')
})

test('清空：回填状态收口为已完成，清空后读取不会把历史任务重新灌回来', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const { service } = await startedService(t0)
  await addTurn(service, 'historical', 1, t0, t0 + MINUTE)

  await service.clearData()
  const status = service.getBackfillStatus()
  assert.equal(status.status, 'done')
  assert.equal(status.version, 1)

  let loadCalls = 0
  const loadSessions = async () => {
    loadCalls += 1
    return []
  }
  await service.backfill(loadSessions)
  assert.equal(loadCalls, 0, '已完成且版本一致，回填直接短路')
  assert.equal(domainTaskCount(service), 0, '历史任务没有被重新写入')
})

function domainTaskCount(service) {
  return service.queryStats({ from: 0, to: Number.MAX_SAFE_INTEGER, view: 'dashboard' }).taskCount
}

/** 走真实 Host 装配与私有 RPC，验证四个新方法都挂在 Host 公共操作上。 */
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
    const response = await route.fetch(new Request('http://isolated/api/chrono-scope', {
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

test('RPC：设置读写、导出与清空都经由 Host 公共操作', async (t) => {
  const now = Date.now()
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  if (now - dayStart < 3000 || nextDay.getTime() - now < 3000) return t.skip('跨日边界等待下一次运行')

  const harness = await createRpcHarness()
  try {
    const defaults = await harness.call('getSettings')
    assert.equal(defaults.idleThresholdMinutes, 5)
    assert.equal(defaults.weekStartsOn, 1)
    assert.equal(defaults.durationFormat, 'hms')
    assert.equal(defaults.sidebarShowName, true)

    const saved = await harness.call('setSettings', {
      idleThresholdMinutes: 11,
      weekStartsOn: 7,
      showSubagents: false,
      durationFormat: 'short',
      sidebarShowName: false,
      ignoredField: '不应写入',
    })
    assert.equal(saved.idleThresholdMinutes, 11)
    assert.equal(saved.durationFormat, 'short', 'RPC 白名单允许保存数字格式')
    assert.equal(saved.sidebarShowName, false, '侧栏名称开关进入 setSettings 白名单')
    assert.equal(Object.hasOwn(saved, 'ignoredField'), false, '未知字段仍被白名单丢弃')
    const readBack = await harness.call('getSettings')
    assert.equal(readBack.weekStartsOn, 7, '重启前就能读回新设置')
    assert.equal(readBack.sidebarShowName, false, '侧栏名称开关可读回')

    let stats = await harness.call('queryStats', { period: 'week', view: 'dashboard' })
    assert.equal(stats.weekStartsOn, 7, '统计响应如实反映生效中的周起始')
    assert.equal(stats.durationFormat, 'short', 'queryStats 带回当前数字格式供页面与侧栏初始化')
    assert.equal(stats.range.from, periodRange('week', now, { weekStartsOn: 7 }).from)

    // 等回填完成，确保清空前确实存在历史任务。
    for (let tick = 0; tick < 100 && stats.backfill.status !== 'done'; tick++) {
      await new Promise((resolve) => setImmediate(resolve))
      stats = await harness.call('queryStats', { period: 'day', view: 'dashboard' })
    }
    assert.equal(stats.backfill.status, 'done')
    assert.equal(stats.taskCount, 1)

    const json = await harness.call('exportData', { format: 'json' })
    assert.equal(json.format, 'json')
    assert.equal(JSON.parse(json.content).tasks.length, 1)
    const csv = await harness.call('exportData', { format: 'csv' })
    assert.equal(csv.format, 'csv')
    assert.ok(csv.content.includes('日期'))

    const listBefore = harness.counts().listCalls
    await harness.call('clearData')
    const after = await harness.call('queryStats', { period: 'day', view: 'dashboard' })
    assert.equal(after.taskCount, 0, '清空后统计为空')
    assert.deepEqual(after.workspaces, [], '清空后页面空状态')
    assert.equal(after.backfill.status, 'done', '回填状态保持已完成')
    assert.equal(harness.counts().listCalls, listBefore, '清空后读取不会重新扫描会话日志')
    assert.ok(harness.session.persisted === true, '会话日志对象本身未被改动')
    const keptSettings = await harness.call('getSettings')
    assert.equal(keptSettings.idleThresholdMinutes, 11, '设置保留')
    assert.equal(keptSettings.durationFormat, 'short', '数字格式随设置一并保留')
    assert.equal(keptSettings.sidebarShowName, false, '清空数据不影响侧栏名称开关')
  } finally {
    await harness.close()
  }
})
