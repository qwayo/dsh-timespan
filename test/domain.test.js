import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDshTimespanDomain } from '../src/domain/dsh-timespan-domain.js'
import { createDshTimespanSpec } from '../src/domain/domain-spec.js'
import { createMemoryDomain } from './helpers/memory-domain.js'

const MINUTE = 60_000

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

function queryWindow(clock) {
  return { from: clock.now() - 24 * 60 * MINUTE, to: clock.now() }
}

test('启动：用进程 uptime 反推应用启动时刻，在线时长从应用启动开始计算', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })

  await service.start()

  const stats = service.queryStats(queryWindow(clock))
  assert.equal(stats.onlineMs, 2 * MINUTE)
  assert.equal(stats.running, true)
})

test('心跳：30 秒心跳推进最后心跳时间，在线时长持续增长', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const domain = createMemoryDomain()
  const service = createDshTimespanDomain({ domain, clock })
  await service.start()

  clock.nowMs = t0 + 30_000
  await service.recordPresence({ at: clock.nowMs })
  clock.nowMs = t0 + 60_000
  await service.recordPresence({ at: clock.nowMs })

  const stats = service.queryStats(queryWindow(clock))
  assert.equal(stats.onlineMs, 3 * MINUTE)
})

test('重启收口：上次运行悬空的在线区间按最后心跳收口，停机时间不计入', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const firstClock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const domain = createMemoryDomain()
  const firstService = createDshTimespanDomain({ domain, clock: firstClock })
  await firstService.start()

  firstClock.nowMs = t0 + 30_000
  await firstService.recordPresence({ at: firstClock.nowMs })

  // 进程在 t0+60s 崩溃，没有机会执行 close()。新进程在 t0+5min 启动，
  // 进程 uptime 2s 说明新的应用启动时刻是 t0+4min58s。
  const secondClock = createFakeClock({ now: t0 + 5 * MINUTE, uptimeMs: 2_000 })
  const secondService = createDshTimespanDomain({ domain, clock: secondClock })
  await secondService.start()

  const stats = secondService.queryStats({
    from: t0 - 2 * MINUTE,
    to: t0 + 5 * MINUTE + MINUTE,
  })
  // 第一次运行：09:58:00 → 10:00:30，共 150 秒；
  // 第二次运行：10:04:58 → 10:05:00，共 2 秒；中间停机不计。
  assert.equal(stats.onlineMs, 152_000)
})

test('同一进程重新加载：新区间从旧区间收口处继续，不重复计入', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const domain = createMemoryDomain()

  const firstService = createDshTimespanDomain({ domain, clock })
  await firstService.start()
  clock.nowMs = t0 + MINUTE
  await firstService.close()

  // 同一进程重新加载：应用启动时刻仍是 t0-2min，旧区间刚在 t0+1min 收口。
  clock.nowMs = t0 + MINUTE
  const secondService = createDshTimespanDomain({ domain, clock })
  await secondService.start()

  const stats = secondService.queryStats({ from: t0 - 2 * MINUTE, to: t0 + MINUTE })
  assert.equal(stats.onlineMs, 3 * MINUTE)
})

/** 前台存在、页面可见且聚焦时的一份最小 presence 载荷。 */
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

test('活跃归属：跟随前台会话与工作区，没有前台会话时归未归属', async () => {
  const t0 = Date.UTC(2026, 10, 4, 5, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const domain = createMemoryDomain()
  const service = createDshTimespanDomain({ domain, clock })
  await service.start()

  let result = await service.recordPresence(foregroundPresence(t0))
  assert.equal(result.active.active, true)
  assert.equal(result.active.sessionId, 'session-1')
  assert.equal(result.active.workspaceId, 'workspace-1')

  clock.nowMs = t0 + 15_000
  result = await service.recordPresence(
    foregroundPresence(clock.nowMs, {
      lastInteractionAt: clock.nowMs,
      sessionId: null,
      sessionTitle: null,
      workspaceId: null,
      workspaceTitle: null,
    }),
  )
  assert.equal(result.active.active, true)
  assert.equal(result.active.sessionId, null)
  assert.equal(result.active.workspaceId, null)

  // 归属必须真正落到 intervals 记录上：切换会话时旧段在切换点收口，
  // 新段从切换点开始并在记录里保持「未归属」。
  const activeRecords = [...domain.table('intervals').entries()]
    .map(([, record]) => record)
    .filter((record) => record.type === 'active')
    .sort((left, right) => left.start - right.start)
  assert.equal(activeRecords.length, 2)
  assert.deepEqual(
    activeRecords.map((record) => ({
      start: record.start,
      end: record.end,
      sessionId: record.sessionId,
      workspaceId: record.workspaceId,
    })),
    [
      { start: t0, end: t0 + 15_000, sessionId: 'session-1', workspaceId: 'workspace-1' },
      { start: t0 + 15_000, end: null, sessionId: null, workspaceId: null },
    ],
  )
})

test('会话标题变更：活跃区间标题快照跟随最新上报', async () => {
  const t0 = Date.UTC(2026, 10, 4, 5, 30, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.recordPresence(foregroundPresence(t0))
  clock.nowMs = t0 + 15_000
  await service.recordPresence(foregroundPresence(clock.nowMs, {
    sessionTitle: '会话一（新标题）',
    lastInteractionAt: clock.nowMs,
  }))

  const stats = service.queryStats({ from: t0, to: clock.nowMs, view: 'dashboard' })
  assert.equal(stats.workspaces.length, 1)
  assert.equal(stats.workspaces[0].sessions[0].sessionTitle, '会话一（新标题）')
})

test('工作区删除后：历史区间保留标题快照', async () => {
  const t0 = Date.UTC(2026, 10, 4, 5, 45, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const domain = createMemoryDomain()
  const firstService = createDshTimespanDomain({ domain, clock })
  await firstService.start()
  await firstService.recordPresence(foregroundPresence(t0, { workspaceTitle: '已删除工作区' }))
  clock.nowMs = t0 + 30_000
  await firstService.recordPresence(foregroundPresence(clock.nowMs, {
    workspaceTitle: '已删除工作区',
    lastInteractionAt: clock.nowMs,
  }))
  await firstService.close()

  // 重启后没有任何工作区注册表信息，历史区间只能依赖落库的标题快照。
  const laterClock = createFakeClock({ now: t0 + 60_000, uptimeMs: 0 })
  const secondService = createDshTimespanDomain({ domain, clock: laterClock })
  await secondService.start()
  const stats = secondService.queryStats({ from: t0, to: t0 + 60_000, view: 'dashboard' })
  assert.equal(stats.workspaces.length, 1)
  assert.equal(stats.workspaces[0].workspaceTitle, '已删除工作区')
  assert.equal(stats.workspaces[0].sessions[0].workspaceTitle, '已删除工作区')
})

test('窗口隐藏或失焦：活跃区间立即停止，不把不可见时间算进去', async () => {
  const t0 = Date.UTC(2026, 10, 4, 4, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.recordPresence(foregroundPresence(t0))
  clock.nowMs = t0 + 30_000
  await service.recordPresence(foregroundPresence(clock.nowMs, { visible: false }))
  let stats = service.queryStats({ from: t0, to: clock.nowMs })
  assert.equal(stats.activeMs, 30_000)
  assert.equal(stats.activeRunning, false)

  // 即使页面之后仍隐藏很久，也不继续累计。
  clock.nowMs = t0 + 10 * MINUTE
  await service.recordPresence(foregroundPresence(clock.nowMs, { visible: false, lastInteractionAt: clock.nowMs }))
  stats = service.queryStats({ from: t0, to: clock.nowMs })
  assert.equal(stats.activeMs, 30_000)

  // 重新可见并聚焦后恢复；随后失焦立即停止。
  await service.recordPresence(foregroundPresence(clock.nowMs))
  clock.nowMs = t0 + 10 * MINUTE + 20_000
  await service.recordPresence(foregroundPresence(clock.nowMs, { focused: false, lastInteractionAt: clock.nowMs }))
  stats = service.queryStats({ from: t0, to: clock.nowMs })
  assert.equal(stats.activeMs, 30_000 + 20_000)
  assert.equal(stats.activeRunning, false)
})

test('恢复显示：新区间从恢复时刻开始，不与隐藏前的区间重叠', async () => {
  const t0 = Date.UTC(2026, 10, 4, 6, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.recordPresence(foregroundPresence(t0))
  clock.nowMs = t0 + 30_000
  await service.recordPresence(foregroundPresence(clock.nowMs, { visible: false, lastInteractionAt: t0 }))

  // 60 秒后重新可见；最后一次操作仍停留在 t0，恢复前的时间不能回填成活跃。
  clock.nowMs = t0 + 60_000
  const resumed = await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0 }))
  assert.equal(resumed.active.since, t0 + 60_000)

  clock.nowMs = t0 + 90_000
  await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0 }))
  const stats = service.queryStats({ from: t0, to: clock.nowMs })
  assert.equal(stats.activeMs, 60_000)
})

test('迟到隐藏：只按最后心跳收口，不把休眠空白算成活跃', async () => {
  const t0 = Date.UTC(2026, 10, 4, 7, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.recordPresence(foregroundPresence(t0))
  // 浏览器休眠 10 分钟后才补报隐藏；期间没有任何心跳，不能按本次上报时刻拉长。
  clock.nowMs = t0 + 10 * MINUTE
  await service.recordPresence(foregroundPresence(clock.nowMs, { visible: false, lastInteractionAt: t0 }))

  const stats = service.queryStats({ from: t0, to: clock.nowMs })
  assert.equal(stats.activeMs, 0)
})

test('关闭：开放活跃区间按最后心跳收口，不把挂起后的时间算进去', async () => {
  const t0 = Date.UTC(2026, 10, 4, 8, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.recordPresence(foregroundPresence(t0))
  clock.nowMs = t0 + 30_000
  await service.recordPresence(foregroundPresence(clock.nowMs))

  // 进程在 t0+2h 才卸载，最后一次活跃心跳停留在 t0+30s。
  clock.nowMs = t0 + 2 * 60 * MINUTE
  await service.close()
  const stats = service.queryStats({ from: t0, to: clock.nowMs })
  assert.equal(stats.activeMs, 30_000)
})

test('任务保持活跃：前台会话运行任务时，超过 5 分钟无操作仍计活跃，任务结束立即停止', async () => {
  const t0 = Date.UTC(2026, 10, 4, 3, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.recordPresence(foregroundPresence(t0, { foregroundRunning: true }))
  for (let elapsed = 15_000; elapsed < 10 * MINUTE; elapsed += 15_000) {
    clock.nowMs = t0 + elapsed
    await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0, foregroundRunning: true }))
  }

  // 任务在 10 分钟整点结束，Client 在同一刻补发 presence。
  clock.nowMs = t0 + 10 * MINUTE
  await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0, foregroundRunning: false }))
  let stats = service.queryStats({ from: t0, to: clock.nowMs })
  assert.equal(stats.activeMs, 10 * MINUTE)
  assert.equal(stats.activeRunning, false)

  // 任务结束后的挂机时间不继续累计。
  clock.nowMs = t0 + 20 * MINUTE
  await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0 }))
  stats = service.queryStats({ from: t0, to: clock.nowMs })
  assert.equal(stats.activeMs, 10 * MINUTE)
})

test('活跃判定：连续 4 分 59 秒 999 毫秒内有操作仍活跃，满 5 分钟立即转空闲', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  // 每 15 秒一次心跳，最后一次操作固定在 t0。
  await service.recordPresence(foregroundPresence(t0))
  for (let elapsed = 15_000; elapsed <= 4 * MINUTE + 45_000; elapsed += 15_000) {
    clock.nowMs = t0 + elapsed
    await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0 }))
  }

  clock.nowMs = t0 + 5 * MINUTE - 1
  await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0 }))
  let stats = service.queryStats({ from: t0, to: clock.nowMs })
  assert.equal(stats.activeMs, 5 * MINUTE - 1)
  assert.equal(stats.activeRunning, true)

  clock.nowMs = t0 + 5 * MINUTE
  await service.recordPresence(foregroundPresence(clock.nowMs, { lastInteractionAt: t0 }))
  stats = service.queryStats({ from: t0, to: clock.nowMs })
  assert.equal(stats.activeMs, 5 * MINUTE)
  assert.equal(stats.activeRunning, false)
})

test('任务记录：turn/start 到 turn/end 生成一条任务记录，重复事件不重复计数', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: {},
    event: { type: 'turn/start', time: t0, data: { turn: 1 } },
  })
  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: {},
    event: { type: 'turn/end', time: t0 + MINUTE, data: { turn: 1, reason: { kind: 'completed' } } },
  })

  clock.nowMs = t0 + 2 * MINUTE
  let stats = service.queryStats({ from: t0, to: t0 + 2 * MINUTE })
  assert.equal(stats.taskMs, MINUTE)
  assert.equal(stats.taskCount, 1)
  assert.equal(stats.tasks.length, 1)
  assert.equal(stats.tasks[0].sessionId, 'session-1')
  assert.equal(stats.tasks[0].turn, 1)
  assert.equal(stats.tasks[0].start, t0)
  assert.equal(stats.tasks[0].end, t0 + MINUTE)
  assert.equal(stats.tasks[0].endReason, 'completed')
  assert.equal(stats.tasks[0].running, false)
  // 任务写在 per-record 存储里，键必须通过路径安全校验；业务键仍是 sessionId:turn。
  assert.match(stats.tasks[0].id, /^[A-Za-z0-9_-]+$/u)
  assert.equal(stats.tasks[0].key, 'session-1:1')

  // 同一条 turn 的重复事件不能生成第二条任务，也不能把时长翻倍。
  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: {},
    event: { type: 'turn/start', time: t0, data: { turn: 1 } },
  })
  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: {},
    event: { type: 'turn/end', time: t0 + MINUTE, data: { turn: 1, reason: { kind: 'completed' } } },
  })

  stats = service.queryStats({ from: t0, to: t0 + 2 * MINUTE })
  assert.equal(stats.taskMs, MINUTE)
  assert.equal(stats.taskCount, 1)
  assert.equal(stats.tasks.length, 1)
})

test('任务键：会话 id 含路径非法字符时仍可写入 per-record 存储', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.recordSessionEvent({
    sessionId: 'session:with/slash',
    header: {},
    event: { type: 'turn/start', time: t0, data: { turn: 1 } },
  })
  await service.recordSessionEvent({
    sessionId: 'session:with/slash',
    header: {},
    event: { type: 'turn/end', time: t0 + MINUTE, data: { turn: 1, reason: { kind: 'completed' } } },
  })

  clock.nowMs = t0 + 2 * MINUTE
  const [task] = service.queryStats({ from: t0, to: t0 + 2 * MINUTE }).tasks
  assert.equal(task.sessionId, 'session:with/slash')
  assert.equal(task.key, 'session:with/slash:1')
  assert.match(task.id, /^[A-Za-z0-9_-]+$/u)
})

test('零时长任务：turn 起止同毫秒时仍出现在任务数与会话列表', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: {},
    event: { type: 'turn/start', time: t0, data: { turn: 1 } },
  })
  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: {},
    event: { type: 'turn/end', time: t0, data: { turn: 1, reason: { kind: 'completed' } } },
  })

  clock.nowMs = t0 + MINUTE
  const stats = service.queryStats({ from: t0, to: t0 + MINUTE })
  assert.equal(stats.taskMs, 0)
  assert.equal(stats.taskCount, 1)
  assert.equal(stats.tasks.length, 1)
  assert.equal(stats.tasks[0].durationMs, 0)
  assert.equal(stats.sessions.length, 1)
  assert.equal(stats.sessions[0].taskCount, 1)
})

test('任务构成：模型、工具、等待与其他四部分之和等于任务总时长', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  clock.nowMs = t0 + 2 * MINUTE

  const events = [
    { type: 'turn/start', time: t0, data: { turn: 1 } },
    { type: 'step/start', time: t0, data: { turn: 1, step: 1 } },
    { type: 'assistant/message', time: t0 + 10_000, data: { turn: 1, step: 1, message: { content: [] } } },
    { type: 'tool/call', time: t0 + 10_000, data: { turn: 1, step: 1, callId: 'question-1', name: 'ask_user_question' } },
    { type: 'tool/result', time: t0 + 40_000, data: { turn: 1, step: 1, message: { source: { callId: 'question-1' } } } },
    { type: 'step/start', time: t0 + 40_000, data: { turn: 1, step: 2 } },
    { type: 'assistant/message', time: t0 + 50_000, data: { turn: 1, step: 2, message: { content: [] } } },
    { type: 'tool/call', time: t0 + 50_000, data: { turn: 1, step: 2, callId: 'tool-1', name: 'read_file' } },
    { type: 'tool/result', time: t0 + 55_000, data: { turn: 1, step: 2, message: { source: { callId: 'tool-1' } } } },
    { type: 'turn/end', time: t0 + 60_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  for (const event of events) {
    await service.recordSessionEvent({ sessionId: 'session-1', header: {}, event })
  }

  const stats = service.queryStats({ from: t0, to: t0 + 2 * MINUTE })
  assert.equal(stats.tasks.length, 1)
  const task = stats.tasks[0]
  assert.equal(task.durationMs, MINUTE)
  assert.equal(task.modelMs, 20_000)
  assert.equal(task.toolMs, 5_000)
  assert.equal(task.waitMs, 30_000)
  assert.equal(task.otherMs, 5_000)
  assert.equal(task.modelMs + task.toolMs + task.waitMs + task.otherMs, task.durationMs)
})

test('等待用户：审批询问到决定之间的区间计入等待', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  clock.nowMs = t0 + MINUTE

  const events = [
    { type: 'turn/start', time: t0, data: { turn: 1 } },
    { type: 'approval/asked', time: t0 + 10_000, data: { id: 'approval-1', toolName: 'bash' } },
    { type: 'approval/decided', time: t0 + 25_000, data: { id: 'approval-1', outcome: 'allowed-once' } },
    { type: 'turn/end', time: t0 + 30_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  for (const event of events) {
    await service.recordSessionEvent({ sessionId: 'session-1', header: {}, event })
  }

  const [task] = service.queryStats({ from: t0, to: t0 + MINUTE }).tasks
  assert.equal(task.durationMs, 30_000)
  assert.equal(task.waitMs, 15_000)
  assert.equal(task.otherMs, 15_000)
  assert.equal(task.modelMs + task.toolMs + task.waitMs + task.otherMs, task.durationMs)
})

test('等待用户：ask_user_question 的工具区间计入等待而不是工具', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  clock.nowMs = t0 + MINUTE

  const events = [
    { type: 'turn/start', time: t0, data: { turn: 1 } },
    { type: 'step/start', time: t0, data: { turn: 1, step: 1 } },
    { type: 'assistant/message', time: t0 + 5_000, data: { turn: 1, step: 1, message: { content: [] } } },
    { type: 'tool/call', time: t0 + 5_000, data: { turn: 1, step: 1, callId: 'ask-1', name: 'ask_user_question' } },
    {
      type: 'tool/result',
      time: t0 + 30_000,
      data: { turn: 1, step: 1, message: { source: { callId: 'ask-1' }, content: [] } },
    },
    { type: 'turn/end', time: t0 + 35_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  for (const event of events) {
    await service.recordSessionEvent({ sessionId: 'session-1', header: {}, event })
  }

  const [task] = service.queryStats({ from: t0, to: t0 + MINUTE }).tasks
  assert.equal(task.durationMs, 35_000)
  assert.equal(task.waitMs, 25_000)
  assert.equal(task.toolMs, 0)
  assert.equal(task.modelMs, 5_000)
  assert.equal(task.otherMs, 5_000)
  assert.equal(task.modelMs + task.toolMs + task.waitMs + task.otherMs, task.durationMs)
})

test('异常结束：turn/end 带错误原因仍收口，未完成的工具区间计入工具耗时', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  clock.nowMs = t0 + 2 * MINUTE

  const events = [
    { type: 'turn/start', time: t0, data: { turn: 1 } },
    { type: 'step/start', time: t0, data: { turn: 1, step: 1 } },
    { type: 'assistant/message', time: t0 + 10_000, data: { turn: 1, step: 1, message: { content: [] } } },
    { type: 'tool/call', time: t0 + 10_000, data: { turn: 1, step: 1, callId: 'tool-1', name: 'read_file' } },
    { type: 'turn/end', time: t0 + 20_000, data: { turn: 1, reason: { kind: 'error' } } },
  ]
  for (const event of events) {
    await service.recordSessionEvent({ sessionId: 'session-1', header: {}, event })
  }

  const [task] = service.queryStats({ from: t0, to: t0 + 2 * MINUTE }).tasks
  assert.equal(task.durationMs, 20_000)
  assert.equal(task.endReason, 'error')
  assert.equal(task.modelMs, 10_000)
  assert.equal(task.toolMs, 10_000)
  assert.equal(task.waitMs, 0)
  assert.equal(task.otherMs, 0)
})

test('未结束收口：下次启动时，按最后事件时间收口并标记中断', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const domain = createMemoryDomain()
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain, clock })
  await service.start()

  const events = [
    { type: 'turn/start', time: t0, data: { turn: 1 } },
    { type: 'step/start', time: t0, data: { turn: 1, step: 1 } },
    { type: 'assistant/message', time: t0 + 40_000, data: { turn: 1, step: 1, message: { content: [] } } },
    { type: 'tool/call', time: t0 + 40_000, data: { turn: 1, step: 1, callId: 'tool-1', name: 'read_file' } },
  ]
  for (const event of events) {
    await service.recordSessionEvent({ sessionId: 'session-1', header: {}, event })
  }

  // 十分钟后才重启：模拟插件崩溃后下次 start() 收口，任务只能算到最后
  // 一条事件，不能把挂起时间算进去。
  clock.nowMs = t0 + 10 * MINUTE
  const restarted = createDshTimespanDomain({ domain, clock })
  await restarted.start()
  const [task] = restarted.queryStats({ from: t0, to: t0 + 20 * MINUTE }).tasks
  assert.equal(task.durationMs, 40_000)
  assert.equal(task.endReason, 'interrupted')
  assert.equal(task.approximate, true)
  assert.equal(task.modelMs, 40_000)
  assert.equal(task.toolMs, 0)
  assert.equal(task.otherMs, 0)
})

test('未结束收口：插件关闭时，按最后事件时间收口并标记中断', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: {},
    event: { type: 'turn/start', time: t0, data: { turn: 1 } },
  })
  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: {},
    event: { type: 'tool/call', time: t0 + 10_000, data: { turn: 1, step: 1, callId: 'tool-1', name: 'read_file' } },
  })

  clock.nowMs = t0 + 10 * MINUTE
  await service.close()
  const [task] = service.queryStats({ from: t0, to: t0 + 20 * MINUTE }).tasks
  assert.equal(task.durationMs, 10_000)
  assert.equal(task.endReason, 'interrupted')
  assert.equal(task.approximate, true)
})

test('会话任务列表：总览按时间并集，会话明细按会话求和，子代理不计入总计', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  async function turn(sessionId, turnNumber, start, end, header = {}) {
    await service.recordSessionEvent({
      sessionId,
      header,
      event: { type: 'turn/start', time: start, data: { turn: turnNumber } },
    })
    await service.recordSessionEvent({
      sessionId,
      header,
      event: { type: 'turn/end', time: end, data: { turn: turnNumber, reason: { kind: 'completed' } } },
    })
  }

  // 两个会话并发：A 0–10s，B 0–20s；总览是并集 20s，明细各自求和。
  await turn('session-a', 1, t0, t0 + 10_000)
  await turn('session-b', 1, t0, t0 + 20_000)
  // 子代理会话不进入总览与会话列表。
  await turn('session-sub', 1, t0, t0 + 60_000, { origin: 'subagent', parentSessionId: 'session-a' })

  clock.nowMs = t0 + 2 * MINUTE
  const stats = service.queryStats({ from: t0, to: t0 + 2 * MINUTE })
  assert.equal(stats.taskMs, 20_000)
  assert.equal(stats.taskCount, 2)
  assert.equal(stats.sessions.length, 2)
  assert.deepEqual(
    stats.sessions.map((session) => [session.sessionId, session.taskMs]),
    [
      ['session-b', 20_000],
      ['session-a', 10_000],
    ],
  )
  assert.equal(stats.taskRunning, false)
  // 明细保留子代理任务，供子代理明细使用；但上面三项总览口径都不包含它。
  const subagentTask = stats.tasks.find((task) => task.sessionId === 'session-sub')
  assert.equal(subagentTask.origin, 'subagent')
  assert.equal(subagentTask.durationMs, 60_000)

  // 运行中的任务让页面能看到运行状态，并按当前时刻持续增长。
  await service.recordSessionEvent({
    sessionId: 'session-c',
    header: {},
    event: { type: 'turn/start', time: t0 + 30_000, data: { turn: 1 } },
  })
  clock.nowMs = t0 + 50_000
  const running = service.queryStats({ from: t0, to: t0 + 2 * MINUTE })
  assert.equal(running.taskRunning, true)
  assert.equal(running.tasks.find((task) => task.sessionId === 'session-c').running, true)
  assert.equal(running.sessions.find((session) => session.sessionId === 'session-c').taskMs, 20_000)
})

test('无拆分数据：历史任务标记未拆分，四部分保持为零', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const domain = createMemoryDomain()
  const clock = createFakeClock({ now: t0, uptimeMs: 0 })
  const service = createDshTimespanDomain({ domain, clock })
  await service.start()

  // 模拟回填/旧版本留下的任务：只有墙钟起止，没有可拆分的 segments。
  await domain.table('tasks').put('legacy-session_t1', {
    id: 'legacy-session_t1',
    sessionId: 'legacy-session',
    turn: 1,
    parentSessionId: null,
    origin: null,
    workspaceId: null,
    workspaceTitle: null,
    sessionTitle: '历史会话',
    start: t0,
    end: t0 + MINUTE,
    endReason: 'completed',
    modelMs: 0,
    toolMs: 0,
    waitMs: 0,
    otherMs: 0,
    hasBreakdown: false,
    approximate: false,
    lastEventAt: t0 + MINUTE,
    segments: [],
    source: 'backfill',
  })

  clock.nowMs = t0 + 2 * MINUTE
  const stats = service.queryStats({ from: t0, to: t0 + 2 * MINUTE })
  const [task] = stats.tasks
  assert.equal(task.hasBreakdown, false)
  assert.equal(task.durationMs, MINUTE)
  assert.equal(task.modelMs + task.toolMs + task.waitMs + task.otherMs, 0)
  assert.equal(stats.sessions[0].hasBreakdown, false)
})

test('存储解析：缺失或空 segments 的历史任务按未拆分处理', () => {
  const schema = createDshTimespanSpec().tables.tasks.valueSchema
  const base = {
    id: 'legacy_t1',
    sessionId: 'legacy',
    turn: 1,
    start: 0,
    end: 1000,
  }
  assert.equal(schema.parse(base).hasBreakdown, false)
  assert.equal(schema.parse({ ...base, segments: [] }).hasBreakdown, false)
  assert.equal(
    schema.parse({ ...base, segments: [{ type: 'model', start: 0, end: 1000 }] }).hasBreakdown,
    true,
  )
})
