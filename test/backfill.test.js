/**
 * 历史回填测试。
 *
 * 规格预设的唯一测试缝是 Host 领域服务公共 API：这里用内存域 + 假时钟驱动，
 * 断言 queryStats / getBackfillStatus / backfill 的外部可观察结果，不依赖 DSH
 * 真实运行时、真实文件系统与真实时钟，也不读取或断言内部存储结构。真实历史
 * 日志以仓库夹具形式签入（从真实 .v4.jsonl.zstd 日志抽取的结构事件，去掉
 * 大段正文载荷，时间戳/seq/turn/step/callId/reason.kind/title 保持原值）。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createChronoScopeDomain } from '../src/domain/chrono-scope-domain.js'
import { createMemoryDomain } from './helpers/memory-domain.js'

const MINUTE = 60_000
const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/historical-session.json', import.meta.url), 'utf8'),
)

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

function events(...list) {
  return list.map((event, index) => ({ seq: index, ...event }))
}

function completedTurn(sessionId, turn, start, end, header = {}) {
  return {
    session: { id: sessionId, cwd: '/repo/chrono-scope' },
    inheritedEventCount: 0,
    header,
    events: events(
      { type: 'turn/start', time: start, data: { turn } },
      { type: 'step/start', time: start + 1_000, data: { turn, step: 1 } },
      { type: 'assistant/message', time: start + 5_000, data: { turn, step: 1 } },
      { type: 'turn/end', time: end, data: { turn, reason: { kind: 'completed' } } },
    ),
  }
}

/** 从事件流推导每个已完成 turn 的墙钟时长，作为回填结果的期望值。 */
function expectedTurns(list) {
  const starts = new Map()
  const result = []
  for (const event of list) {
    if (event.type === 'turn/start') starts.set(event.data.turn, event.time)
    if (event.type === 'turn/end' && starts.has(event.data.turn)) {
      result.push({ turn: event.data.turn, durationMs: event.time - starts.get(event.data.turn) })
    }
  }
  return result
}

test('真实历史会话日志：回填把每个已完成 turn 写进同一份任务数据', async () => {
  const lastTime = Math.max(...FIXTURE.events.map((event) => event.time))
  const clock = createFakeClock({ now: lastTime + 60_000, uptimeMs: 0 })
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  const snapshot = {
    session: FIXTURE.session,
    inheritedEventCount: FIXTURE.inheritedEventCount,
    header: {
      parentSessionId: null,
      origin: null,
      workspaceId: 'ws-chrono-scope',
      workspaceTitle: 'chrono-scope',
      sessionTitle: null,
    },
    events: FIXTURE.events,
  }

  const status = await service.backfill(async () => [snapshot])
  assert.equal(status.status, 'done')
  assert.equal(status.scanned, 1)
  assert.equal(status.total, 1)
  assert.equal(status.tasksWritten, 2)
  assert.equal(service.getBackfillStatus().status, 'done')

  const from = Math.min(...FIXTURE.events.map((event) => event.time)) - 1_000
  const to = lastTime + 1_000
  const stats = service.queryStats({ from, to, view: 'dashboard' })
  const expected = expectedTurns(FIXTURE.events)

  assert.equal(stats.tasks.length, 2, '两个已完成 turn 各生成一条任务')
  assert.equal(stats.taskCount, 2)
  assert.deepEqual(
    stats.tasks.map((task) => ({ turn: task.turn, durationMs: task.durationMs })).sort((a, b) => a.turn - b.turn),
    expected.sort((a, b) => a.turn - b.turn),
    '任务时长等于真实日志 turn/start → turn/end 的墙钟差',
  )
  assert.equal(stats.taskMs, expected.reduce((sum, item) => sum + item.durationMs, 0))
  assert.equal(stats.taskSumMs, stats.taskMs)
  assert.deepEqual(stats.subagentTasks, [], '顶层会话没有子代理摘要')

  // 历史标题来自日志里的 session/title 事件，而不是实时标题服务。
  const titles = FIXTURE.events.filter((event) => event.type === 'session/title')
  const lastTitle = titles[titles.length - 1].data.title
  assert.equal(stats.sessions[0].sessionTitle, lastTitle)
  assert.equal(stats.sessions[0].workspaceTitle, 'chrono-scope')
})

test('假时钟：回填后的日/周/月任务时长立即出现，重复启动不重复计数', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0 + 2 * MINUTE, uptimeMs: 0 })
  const domain = createMemoryDomain()
  const service = createChronoScopeDomain({ domain, clock })
  await service.start()

  const snapshots = [
    completedTurn('session-a', 1, t0, t0 + 30_000),
    completedTurn('session-a', 2, t0 + 40_000, t0 + 90_000),
  ]
  let loads = 0
  const loadSessions = async () => {
    loads += 1
    return snapshots
  }

  const status = await service.backfill(loadSessions)
  assert.equal(status.status, 'done')
  assert.equal(status.scanned, 2)
  assert.equal(status.total, 2)
  assert.equal(status.tasksWritten, 2)
  assert.equal(loads, 1)

  clock.nowMs = t0 + 3 * MINUTE
  const stats = service.queryStats({ period: 'day', view: 'dashboard' })
  assert.equal(stats.taskCount, 2)
  assert.equal(stats.taskMs, 80_000)
  assert.equal(stats.taskSumMs, 80_000)
  assert.equal(stats.cycles.day.taskMs, 80_000)
  assert.equal(stats.cycles.week.taskMs, 80_000)
  assert.equal(stats.cycles.month.taskMs, 80_000)
  assert.equal(stats.workspaces[0].sessions[0].sessionId, 'session-a')

  // 同一进程再次启动回填：已完成状态直接短路，连会话列表都不再读。
  const again = await service.backfill(loadSessions)
  assert.equal(again.status, 'done')
  assert.equal(loads, 1)
  assert.equal(service.queryStats({ from: t0, to: t0 + 3 * MINUTE }).tasks.length, 2)

  // 进程重启：meta 持久化了 done，新服务不会重复扫描，任务数不变。
  const restartedClock = createFakeClock({ now: t0 + 5 * MINUTE, uptimeMs: 5_000 })
  const restarted = createChronoScopeDomain({ domain, clock: restartedClock })
  await restarted.start()
  assert.equal(restarted.getBackfillStatus().status, 'done')
  assert.equal(await restarted.backfill(loadSessions).then((value) => value.status), 'done')
  assert.equal(loads, 1)
  assert.equal(restarted.queryStats({ from: t0, to: t0 + 5 * MINUTE }).tasks.length, 2)
})

test('fork 按位置切继承前缀，子代理只在父会话明细中可见', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0 + 10 * MINUTE, uptimeMs: 0 })
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  // seq 故意不连续（与真实日志被裁剪后的形状一致）：继承前缀必须按
  // inheritedEventCount 的下标切，不能按 seq 值比较；前缀里的标题也不能串给 fork。
  const inherited = [
    { seq: 11, type: 'session/title', time: t0, data: { title: '父会话标题' } },
    { seq: 14, type: 'turn/start', time: t0, data: { turn: 1 } },
    { seq: 25, type: 'turn/end', time: t0 + 60_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  const own = [
    { seq: 27, type: 'turn/start', time: t0 + 2 * MINUTE, data: { turn: 2 } },
    { seq: 30, type: 'turn/end', time: t0 + 2 * MINUTE + 30_000, data: { turn: 2, reason: { kind: 'completed' } } },
  ]
  const fork = {
    session: { id: 'session-fork', parentSession: 'session-parent' },
    inheritedEventCount: inherited.length,
    header: { parentSessionId: 'session-parent', origin: null },
    events: [...inherited, ...own],
  }
  const parent = completedTurn('session-parent', 1, t0, t0 + 60_000)
  // Host 未注入 origin 时，规划层要从 session 头补齐子代理归属。
  const subagent = completedTurn('session-sub', 1, t0 + 3 * MINUTE, t0 + 3 * MINUTE + 45_000, {
    parentSessionId: 'session-parent',
  })
  subagent.session.origin = 'subagent'
  subagent.session.parentSession = 'session-parent'

  await service.backfill(async () => [parent, fork, subagent])
  const stats = service.queryStats({ from: t0, to: t0 + 10 * MINUTE, view: 'dashboard' })

  // 父会话 60s + fork 自身 30s；继承前缀里的 turn 1 没有再生成一份。
  assert.equal(stats.taskCount, 2)
  assert.equal(stats.taskMs, 90_000)
  assert.equal(stats.sessions.length, 2)
  const forkTasks = stats.tasks.filter((task) => task.sessionId === 'session-fork')
  assert.equal(forkTasks.length, 1)
  assert.equal(forkTasks[0].turn, 2)
  assert.equal(forkTasks[0].durationMs, 30_000)
  assert.equal(
    stats.sessions.find((session) => session.sessionId === 'session-fork').sessionTitle,
    null,
    '继承前缀里的父会话标题不能派给 fork',
  )

  // 子代理任务不进总计与会话列表，但按父会话关联出现在仪表盘明细里。
  assert.equal(stats.sessions.some((session) => session.sessionId === 'session-sub'), false)
  const sub = stats.tasks.find((task) => task.sessionId === 'session-sub')
  assert.equal(sub.origin, 'subagent')
  assert.equal(sub.parentSessionId, 'session-parent')
  assert.equal(sub.durationMs, 45_000)
  assert.equal(stats.subagentTasks.length, 1)
  assert.equal(stats.subagentTasks[0].parentSessionId, 'session-parent')
  assert.equal(stats.subagentTasks[0].durationMs, 45_000)
})

test('回填失败可重试，进度持久化后重启仍读到完成状态', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0 + 10 * MINUTE, uptimeMs: 0 })
  const domain = createMemoryDomain()
  const service = createChronoScopeDomain({ domain, clock })
  await service.start()

  const failed = await service.backfill(async () => {
    throw new Error('会话日志读取失败')
  })
  assert.equal(failed.status, 'failed')
  assert.match(failed.error, /会话日志读取失败/)
  assert.equal(service.getBackfillStatus().status, 'failed')
  assert.equal(service.queryStats({ from: t0, to: t0 + 10 * MINUTE }).taskCount, 0)

  const snapshots = [completedTurn('session-a', 1, t0, t0 + 20_000)]
  const retried = await service.backfill(async () => snapshots, { force: true })
  assert.equal(retried.status, 'done')
  assert.equal(retried.scanned, 1)
  assert.equal(retried.tasksWritten, 1)
  assert.equal(service.queryStats({ from: t0, to: t0 + 10 * MINUTE }).taskCount, 1)

  // 用重启后的服务读回 meta，验证进度被存储解析保留（不直接断言存储结构）。
  const restarted = createChronoScopeDomain({
    domain,
    clock: createFakeClock({ now: t0 + 12 * MINUTE, uptimeMs: 0 }),
  })
  await restarted.start()
  assert.equal(restarted.getBackfillStatus().status, 'done')
  assert.equal(restarted.getBackfillStatus().tasksWritten, 1)
  assert.equal(restarted.queryStats({ from: t0, to: t0 + 12 * MINUTE }).tasks.length, 1)
})

test('旧算法版本的 done 会失效重扫，迭代不再把历史永久锁死', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const domain = createMemoryDomain()
  // 模拟磁盘上由上一版算法写入的 meta（构造初始状态，不是断言内部存储）。
  await domain.global.set({
    version: 1,
    installTime: 0,
    currentBootId: null,
    lastHeartbeat: null,
    backfill: { status: 'done', version: 0, scanned: 0, total: 0, tasksWritten: 0, error: null, updatedAt: 0 },
  })
  const service = createChronoScopeDomain({ domain, clock: createFakeClock({ now: t0 + 10 * MINUTE }) })
  await service.start()

  let loads = 0
  const status = await service.backfill(async () => {
    loads += 1
    return [completedTurn('session-a', 1, t0, t0 + 20_000)]
  })
  assert.equal(loads, 1, 'done 但版本过旧必须重新扫描')
  assert.equal(status.status, 'done')
  assert.ok(status.version > 0, '完成后写入当前算法版本')
  assert.equal(service.queryStats({ from: t0, to: t0 + 10 * MINUTE }).taskCount, 1)
})

test('回填在后台执行时不阻塞实时记录：实时事件可在会话之间插队写入', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0 + 10 * MINUTE, uptimeMs: 0 })
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  let injected = false
  const yieldFn = async () => {
    if (injected) return
    injected = true
    await service.recordSessionEvent({
      sessionId: 'session-live',
      header: {},
      event: { type: 'turn/start', time: t0 + 5 * MINUTE, data: { turn: 1 } },
    })
    await service.recordSessionEvent({
      sessionId: 'session-live',
      header: {},
      event: { type: 'turn/end', time: t0 + 5 * MINUTE + 10_000, data: { turn: 1, reason: { kind: 'completed' } } },
    })
  }

  const status = await service.backfill(
    async () => [
      completedTurn('session-history', 1, t0, t0 + 30_000),
      completedTurn('session-history-2', 1, t0 + MINUTE, t0 + MINUTE + 20_000),
    ],
    { yield: yieldFn },
  )
  assert.equal(status.status, 'done')
  assert.equal(injected, true)

  const stats = service.queryStats({ from: t0, to: t0 + 10 * MINUTE })
  assert.equal(stats.taskCount, 3)
  assert.deepEqual(
    stats.tasks.map((task) => task.sessionId).sort(),
    ['session-history', 'session-history-2', 'session-live'],
  )
  assert.equal(stats.taskMs, 60_000)
})

test('回填不重放未完成的历史任务：只有 turn/start 的 turn 不产出统计', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0 + 10 * MINUTE, uptimeMs: 0 })
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  const open = {
    session: { id: 'session-open' },
    inheritedEventCount: 0,
    header: {},
    events: events(
      { type: 'turn/start', time: t0, data: { turn: 1 } },
      { type: 'step/start', time: t0 + 1_000, data: { turn: 1, step: 1 } },
      { type: 'assistant/message', time: t0 + 5_000, data: { turn: 1, step: 1 } },
    ),
  }
  const status = await service.backfill(async () => [open])
  assert.equal(status.status, 'done')
  assert.equal(status.tasksWritten, 0)

  const stats = service.queryStats({ from: t0, to: t0 + 10 * MINUTE })
  assert.equal(stats.taskCount, 0, '没有确定结束时刻的 turn 不能被当成运行到现在')
  assert.equal(stats.taskMs, 0)
  assert.equal(stats.taskRunning, false)
})

test('回填只补任务时长，不伪造在线与活跃历史', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0 + 10 * MINUTE, uptimeMs: 0 })
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  await service.backfill(async () => [completedTurn('session-a', 1, t0, t0 + 40_000)])
  const stats = service.queryStats({ from: t0, to: t0 + 10 * MINUTE })

  assert.equal(stats.taskMs, 40_000)
  assert.equal(stats.activeMs, 0)
  assert.equal(stats.onlineMs, 0, '在线区间只覆盖插件启用后的实时观测')
})

test('延迟读取会话：total 立即可知，单个不可读会话被跳过而不拖垮整次回填', async () => {
  const t0 = Date.UTC(2026, 10, 4, 2, 0, 0)
  const clock = createFakeClock({ now: t0 + 10 * MINUTE, uptimeMs: 0 })
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  const loads = []
  const entries = [
    {
      load: async () => {
        loads.push('broken')
        return null
      },
    },
    {
      load: async () => {
        loads.push('good')
        return completedTurn('session-good', 1, t0, t0 + 20_000)
      },
    },
  ]
  const progress = []
  await service.backfill(async () => entries, {
    yield: async () => {
      progress.push(service.getBackfillStatus())
    },
  })

  const status = service.getBackfillStatus()
  assert.deepEqual(loads, ['broken', 'good'], '会话逐个读取，不预先展开全部日志')
  assert.equal(status.status, 'done', '单个损坏会话不该让整次回填失败')
  assert.equal(status.total, 2)
  assert.equal(status.scanned, 2)
  assert.equal(status.tasksWritten, 1)
  assert.ok(progress.every((item) => item.total === 2), '扫描过程中进度已有准确 total')
  assert.equal(service.queryStats({ from: t0, to: t0 + 10 * MINUTE }).taskCount, 1)
})
