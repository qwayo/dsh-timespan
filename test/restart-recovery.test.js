/**
 * 票 08：重启恢复与异常收口的领域行为测试。
 *
 * 测试缝沿用规格《Testing Decisions》约定的唯一公共入口：用假时钟与内存域
 * 驱动 start / recordPresence / recordSessionEvent / queryStats，只断言对外可
 * 观察的时长与近似标记，不读存储表、不调用私有函数。内存域在多个领域服务
 * 实例间共享，用来模拟进程重启；假时钟可以分别拨动墙钟与单调 uptime。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDshTimespanDomain } from '../src/domain/dsh-timespan-domain.js'
import { createMemoryDomain } from './helpers/memory-domain.js'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

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

async function addTurnStart(service, sessionId, turn, at) {
  await service.recordSessionEvent({
    sessionId,
    header: { workspaceId: 'workspace-1', workspaceTitle: '工作区一', sessionTitle: '会话一' },
    event: { type: 'turn/start', time: at, data: { turn } },
  })
}

test('重启恢复：在线悬空区间按最后心跳收口并标记近似，最多丢一个心跳周期', async () => {
  const t0 = Date.UTC(2026, 10, 5, 2, 0, 0)
  const domain = createMemoryDomain()
  const firstClock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const first = createDshTimespanDomain({ domain, clock: firstClock })
  await first.start()

  // 第一次运行在 t0+30s 留下最后一次在线心跳，t0+60s 时进程崩溃。
  firstClock.nowMs = t0 + 30 * SECOND
  firstClock.uptimeMsValue = 2 * MINUTE + 30 * SECOND
  await first.recordPresence({ at: firstClock.nowMs })

  // 新进程在 t0+5min 启动，uptime 2s 说明应用启动时刻是 t0+4min58s。
  const secondClock = createFakeClock({ now: t0 + 5 * MINUTE, uptimeMs: 2 * SECOND })
  const second = createDshTimespanDomain({ domain, clock: secondClock })
  await second.start()

  const stats = second.queryStats({ from: t0 - 3 * MINUTE, to: t0 + 6 * MINUTE })
  // 第一次运行从 t0-2min 开始，最后心跳停在 t0+30s：共 150 秒。
  // 进程实际活到 t0+60s，损失恰好一个 30 秒心跳周期；停机 4 分钟不计。
  // 新进程已经运行 2 秒，因此在线总计 152 秒。
  assert.equal(stats.onlineMs, 2 * MINUTE + 32 * SECOND)
  assert.equal(2 * MINUTE + MINUTE - (stats.onlineMs - 2 * SECOND), 30 * SECOND)
  assert.equal(stats.approximate, true, '悬空在线区间必须标记为近似值')
})

test('重启恢复：活跃悬空区间按最后心跳收口并标记近似，不把停机算进活跃', async () => {
  const t0 = Date.UTC(2026, 10, 5, 3, 0, 0)
  const domain = createMemoryDomain()
  const firstClock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const first = createDshTimespanDomain({ domain, clock: firstClock })
  await first.start()

  await first.recordPresence(foregroundPresence(t0))
  firstClock.nowMs = t0 + 15 * SECOND
  firstClock.uptimeMsValue = 2 * MINUTE + 15 * SECOND
  await first.recordPresence(foregroundPresence(firstClock.nowMs))

  // 浏览器与 Host 一起失联，30 分钟后才重启。
  const secondClock = createFakeClock({ now: t0 + 30 * MINUTE, uptimeMs: 2 * SECOND })
  const second = createDshTimespanDomain({ domain, clock: secondClock })
  await second.start()

  const stats = second.queryStats({ from: t0, to: t0 + 30 * MINUTE, view: 'dashboard' })
  assert.equal(stats.activeMs, 15 * SECOND, '活跃只到最后一次确认的心跳')
  assert.equal(stats.approximate, true, '悬空活跃区间必须标记为近似值')
  assert.equal(stats.workspaces[0].approximate, true, '近似活跃记录在工作区明细上可见')
})

test('重启恢复：未结束任务按最后事件时间收口并标记中断，不把停机算进任务', async () => {
  const t0 = Date.UTC(2026, 10, 5, 4, 0, 0)
  const domain = createMemoryDomain()
  const firstClock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const first = createDshTimespanDomain({ domain, clock: firstClock })
  await first.start()

  await addTurnStart(first, 'session-1', 1, t0)
  await first.recordSessionEvent({
    sessionId: 'session-1',
    header: { workspaceId: 'workspace-1', workspaceTitle: '工作区一', sessionTitle: '会话一' },
    event: { type: 'tool/call', time: t0 + 10 * SECOND, data: { turn: 1, callId: 'call-1', name: 'read' } },
  })

  // 任务在 t0+10s 后再无事件；进程一小时后才重启。
  const secondClock = createFakeClock({ now: t0 + HOUR, uptimeMs: 2 * SECOND })
  const second = createDshTimespanDomain({ domain, clock: secondClock })
  await second.start()

  const stats = second.queryStats({ from: t0, to: t0 + 2 * HOUR })
  assert.equal(stats.tasks.length, 1)
  const [task] = stats.tasks
  assert.equal(task.durationMs, 10 * SECOND)
  assert.equal(task.endReason, 'interrupted')
  assert.equal(task.approximate, true)
  assert.equal(task.running, false)
  assert.equal(stats.taskMs, 10 * SECOND)
  assert.equal(stats.approximate, true, '近似任务必须让统计结果带上近似标记')
})

test('多次重启：已收口的区间与任务不重复收口、不重复计数', async () => {
  const t0 = Date.UTC(2026, 10, 5, 5, 0, 0)
  const domain = createMemoryDomain()
  const firstClock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const first = createDshTimespanDomain({ domain, clock: firstClock })
  await first.start()
  await first.recordPresence(foregroundPresence(t0))
  firstClock.nowMs = t0 + 30 * SECOND
  firstClock.uptimeMsValue = 2 * MINUTE + 30 * SECOND
  await first.recordPresence({ at: firstClock.nowMs })
  await addTurnStart(first, 'session-1', 1, t0)

  const secondClock = createFakeClock({ now: t0 + 5 * MINUTE, uptimeMs: 2 * SECOND })
  const second = createDshTimespanDomain({ domain, clock: secondClock })
  await second.start()
  // 固定窗口截止到第二次启动时刻，排除第三次启动新增的在线时间。
  const window = { from: t0 - 3 * MINUTE, to: t0 + 5 * MINUTE }
  const before = second.queryStats(window)

  const thirdClock = createFakeClock({ now: t0 + 10 * MINUTE, uptimeMs: 2 * SECOND })
  const third = createDshTimespanDomain({ domain, clock: thirdClock })
  await third.start()
  const after = third.queryStats(window)

  assert.equal(after.onlineMs, before.onlineMs, '在线区间不因再次重启重复计入')
  assert.equal(after.activeMs, before.activeMs, '活跃区间不因再次重启重复计入')
  assert.equal(after.taskMs, before.taskMs, '已收口任务不因再次重启重新计时')
  assert.equal(after.taskCount, before.taskCount)
  assert.equal(after.tasks.length, 1)
  assert.equal(after.tasks[0].durationMs, 0)
  assert.equal(after.tasks[0].approximate, true)
  assert.equal(after.approximate, true)
})

test('时钟回拨：心跳不倒退，已观测任务不被缩短成负数或零', async () => {
  const t0 = Date.UTC(2026, 10, 5, 6, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  clock.nowMs = t0 + 60 * SECOND
  clock.uptimeMsValue = 3 * MINUTE
  await service.recordPresence({ at: clock.nowMs })

  await addTurnStart(service, 'session-1', 1, t0 + 30 * SECOND)
  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: { workspaceId: 'workspace-1', workspaceTitle: '工作区一', sessionTitle: '会话一' },
    event: { type: 'tool/call', time: t0 + 40 * SECOND, data: { turn: 1, callId: 'call-1', name: 'read' } },
  })

  // 系统时钟回拨 10 分钟：迟到的 presence 与 turn/end 都不允许让时间倒退。
  clock.nowMs = t0 - 10 * MINUTE
  clock.uptimeMsValue = 3 * MINUTE + SECOND
  const skipped = await service.recordPresence({ at: clock.nowMs })
  assert.equal(skipped.skipped, true)

  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: { workspaceId: 'workspace-1', workspaceTitle: '工作区一', sessionTitle: '会话一' },
    event: { type: 'turn/end', time: t0 - 5 * MINUTE, data: { turn: 1, reason: { kind: 'completed' } } },
  })

  const stats = service.queryStats({ from: t0 - 20 * MINUTE, to: t0 + 10 * MINUTE })
  for (const value of [stats.onlineMs, stats.activeMs, stats.taskMs, stats.taskSumMs]) {
    assert.ok(Number.isFinite(value) && value >= 0, `时长不能为负数：${value}`)
  }

  // 时钟恢复后心跳继续推进，不会因为回拨永久停摆；任务也不会被缩短。
  clock.nowMs = t0 + 2 * MINUTE
  clock.uptimeMsValue = 4 * MINUTE
  await service.recordPresence({ at: clock.nowMs })
  const recovered = service.queryStats({ from: t0 - 20 * MINUTE, to: t0 + 10 * MINUTE })
  assert.equal(recovered.onlineMs, 4 * MINUTE)
  assert.equal(recovered.tasks.length, 1)
  assert.equal(recovered.tasks[0].durationMs, 10 * SECOND, 'turn/end 早于最后事件时按最后事件收口')
})

test('时钟向前跳跃：在线与任务时长不出现异常巨大值', async () => {
  const t0 = Date.UTC(2026, 10, 5, 7, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  clock.nowMs = t0 + 10 * SECOND
  clock.uptimeMsValue = 2 * MINUTE + 10 * SECOND
  await addTurnStart(service, 'session-1', 1, clock.nowMs)
  clock.nowMs = t0 + 30 * SECOND
  clock.uptimeMsValue = 2 * MINUTE + 30 * SECOND
  await service.recordPresence({ at: clock.nowMs })

  // 墙钟向前跳跃 3 天，进程单调时钟只前进了 50 秒。先确认即便下一次心跳
  // 还没到，查询也不会把开放区间拉成数天。
  clock.nowMs = t0 + 3 * DAY
  clock.uptimeMsValue = 3 * MINUTE
  const duringJump = service.queryStats({ from: t0 - 5 * MINUTE, to: clock.nowMs + MINUTE })
  assert.ok(duringJump.onlineMs <= 3 * MINUTE, `查询不应显示异常巨大的在线时长：${duringJump.onlineMs}`)

  await service.recordPresence({ at: clock.nowMs })
  await service.recordSessionEvent({
    sessionId: 'session-1',
    header: { workspaceId: 'workspace-1', workspaceTitle: '工作区一', sessionTitle: '会话一' },
    event: { type: 'turn/end', time: clock.nowMs, data: { turn: 1, reason: { kind: 'completed' } } },
  })

  const stats = service.queryStats({ from: t0 - 5 * MINUTE, to: clock.nowMs + MINUTE })
  // 第一次运行从 t0-2min 到 t0+30s，共 150 秒；跳跃发生时进程实际又前进了
  // 60 秒 uptime，按真实经过时间补到 t0+60s，共 180 秒；跳跃后的新区间从
  // 跳跃时刻开始。
  assert.equal(stats.onlineMs, 3 * MINUTE)
  assert.equal(stats.tasks.length, 1)
  assert.equal(stats.tasks[0].durationMs, 50 * SECOND)
  assert.ok(stats.taskMs < 5 * MINUTE, `任务时长不应被时钟跳跃放大：${stats.taskMs}`)
})

test('正常休眠：墙钟与 uptime 同步前进，在线时长不被切断', async () => {
  const t0 = Date.UTC(2026, 10, 5, 8, 0, 0)
  const clock = createFakeClock({ now: t0, uptimeMs: 2 * MINUTE })
  const service = createDshTimespanDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  clock.nowMs = t0 + 2 * HOUR
  clock.uptimeMsValue = 2 * HOUR + 2 * MINUTE
  await service.recordPresence({ at: clock.nowMs })

  const stats = service.queryStats({ from: t0 - 5 * MINUTE, to: t0 + 3 * HOUR })
  assert.equal(stats.onlineMs, 2 * HOUR + 2 * MINUTE, '休眠期间进程仍从启动走到退出，在线不丢')
})
