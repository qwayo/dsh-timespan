/**
 * 票 04：日/周/月仪表盘的领域行为测试。
 *
 * 测试缝沿用规格《Testing Decisions》约定的唯一公共入口 queryStats：用假时钟
 * 与内存域注入 presence / session 事件，只断言对外可观察的数值与范围，不读
 * 存储表、不调用私有函数。时间一律用本地时间构造，避免测试依赖机器时区。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createChronoScopeDomain } from '../src/domain/chrono-scope-domain.js'
import { createMemoryDomain } from './helpers/memory-domain.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

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

/** 取某一天所在周的周一 00:00（本地时区）。 */
function mondayOf(timestamp) {
  const at = new Date(timestamp)
  const offset = (at.getDay() + 6) % 7
  return new Date(at.getFullYear(), at.getMonth(), at.getDate() - offset, 0, 0, 0, 0).getTime()
}

test('日周期：跨午夜的在线与任务区间按本地午夜裁剪', async () => {
  const now = localTime(2026, 11, 5, 0, 30)
  const clock = createFakeClock(now, 2 * HOUR)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  await addTurn(service, 'session-1', 1, localTime(2026, 11, 4, 23, 30), localTime(2026, 11, 5, 0, 30))

  const stats = service.queryStats({ period: 'day', view: 'dashboard' })
  assert.equal(stats.range.from, localTime(2026, 11, 5, 0, 0))
  assert.equal(stats.range.to, now)
  assert.equal(stats.onlineMs, 30 * MINUTE, '今天只计入午夜之后的在线时长')
  assert.equal(stats.taskMs, 30 * MINUTE, '跨午夜任务只计入今天那一半')
  assert.equal(stats.taskCount, 1)

  const full = service.queryStats({ from: localTime(2026, 11, 4, 22, 0), to: localTime(2026, 11, 5, 1, 0) })
  assert.equal(full.onlineMs, 2 * HOUR)
  assert.equal(full.taskMs, HOUR, '显式范围不被午夜切断')
})

test('周周期：周一为周起始，跨周区间按周一零点裁剪', async () => {
  const monday = mondayOf(localTime(2026, 11, 4, 12, 0))
  const now = monday + 30 * MINUTE
  const at = new Date(monday)
  const sunday = new Date(at.getFullYear(), at.getMonth(), at.getDate() - 1, 23, 0, 0, 0).getTime()
  const clock = createFakeClock(now, 2 * HOUR)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  await addTurn(service, 'session-1', 1, sunday, monday + HOUR)

  const stats = service.queryStats({ period: 'week', view: 'dashboard' })
  assert.equal(stats.range.from, monday)
  assert.equal(stats.range.to, now)
  assert.equal(stats.onlineMs, 30 * MINUTE)
  assert.equal(stats.taskMs, 30 * MINUTE)
  assert.equal(stats.trend.length, 7)

  const sundayBased = service.queryStats({ period: 'week', weekStartsOn: 7, view: 'dashboard' })
  assert.equal(
    sundayBased.range.from,
    new Date(at.getFullYear(), at.getMonth(), at.getDate() - 1, 0, 0, 0, 0).getTime(),
    '周起始可配置，票 06 的设置能立即改变边界',
  )
})

test('月周期：跨月区间按月初零点裁剪', async () => {
  const now = localTime(2026, 11, 1, 0, 30)
  const clock = createFakeClock(now, 3 * HOUR)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  await addTurn(service, 'session-1', 1, localTime(2026, 10, 31, 23, 0), localTime(2026, 11, 1, 1, 0))

  const stats = service.queryStats({ period: 'month', view: 'dashboard' })
  assert.equal(stats.range.from, localTime(2026, 11, 1, 0, 0))
  assert.equal(stats.range.to, now)
  assert.equal(stats.onlineMs, 30 * MINUTE)
  assert.equal(stats.taskMs, 30 * MINUTE)

  // 显式范围查询时把时钟推到任务结束之后，才能看到完整的跨月区间。
  clock.nowMs = localTime(2026, 11, 1, 1, 0)
  const full = service.queryStats({ from: localTime(2026, 10, 31, 22, 0), to: localTime(2026, 11, 1, 2, 0) })
  assert.equal(full.taskMs, 2 * HOUR, '显式范围不被月初切断')
})

test('趋势桶：日按小时、周按天、月按当月天数，双系列与范围自洽', async () => {
  const now = localTime(2026, 11, 4, 10, 30)
  const clock = createFakeClock(now, 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  await addTurn(service, 'session-1', 1, localTime(2026, 11, 4, 3, 10), localTime(2026, 11, 4, 3, 40))

  const day = service.queryStats({ period: 'day', view: 'dashboard' })
  assert.equal(day.trend.length, 24)
  assert.equal(day.trend[3].from, localTime(2026, 11, 4, 3, 0))
  assert.equal(day.trend[3].to, localTime(2026, 11, 4, 4, 0))
  assert.equal(day.trend[3].taskMs, 30 * MINUTE)
  assert.equal(day.trend[3].activeMs, 0)
  assert.equal(
    day.trend.reduce((sum, bucket) => sum + bucket.taskMs, 0),
    day.taskMs,
    '各桶任务时长之和等于整个范围的实际占用',
  )

  const week = service.queryStats({ period: 'week', view: 'dashboard' })
  assert.equal(week.trend.length, 7)
  assert.equal(week.trend[0].from, mondayOf(now))

  const month = service.queryStats({ period: 'month', view: 'dashboard' })
  assert.equal(month.trend.length, 30, '2026 年 11 月有 30 天')
  assert.equal(month.trend[0].from, localTime(2026, 11, 1, 0, 0))
})

test('工作区→会话明细：两种口径、占比、最近活动与会话展开自洽', async () => {
  const t0 = localTime(2026, 11, 4, 10, 0)
  const clock = createFakeClock(t0, 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  // 前 2 分钟归工作区一，之后 2 分钟归工作区二；每 30 秒一次心跳维持活跃。
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
  await addTurn(service, 'session-2', 1, t0, t0 + 5 * MINUTE, {
    ...second,
  })

  clock.nowMs = t0 + 20 * MINUTE
  const stats = service.queryStats({ period: 'day', view: 'dashboard' })

  assert.equal(stats.activeMs, 4 * MINUTE, '总览活跃按时间并集')
  assert.equal(stats.activeSumMs, 4 * MINUTE, '明细活跃按会话求和')
  assert.equal(stats.taskMs, 10 * MINUTE, '总览任务按时间并集（实际占用）')
  assert.equal(stats.taskSumMs, 15 * MINUTE, '明细任务按会话求和（累计工时）')
  assert.equal(stats.taskCount, 2)

  assert.equal(stats.workspaces.length, 2)
  const [first, secondRow] = stats.workspaces
  assert.equal(first.workspaceId, 'workspace-1')
  assert.equal(first.activeMs, 2 * MINUTE)
  assert.equal(first.taskMs, 10 * MINUTE)
  assert.equal(first.taskCount, 1)
  assert.ok(Math.abs(first.share - 10 / 15) < 1e-9, '占比基于累计工时')
  assert.equal(first.lastActivityAt, t0 + 10 * MINUTE)
  assert.equal(first.sessions.length, 1)
  assert.equal(first.sessions[0].sessionId, 'session-1')
  assert.equal(first.sessions[0].activeMs, 2 * MINUTE)
  assert.equal(first.sessions[0].taskMs, 10 * MINUTE)
  assert.equal(first.sessions[0].taskCount, 1)

  assert.equal(secondRow.workspaceId, 'workspace-2')
  assert.equal(secondRow.activeMs, 2 * MINUTE)
  assert.equal(secondRow.taskMs, 5 * MINUTE)
  assert.equal(secondRow.lastActivityAt, t0 + 5 * MINUTE)
  assert.ok(Math.abs(secondRow.share - 5 / 15) < 1e-9)

  assert.equal(
    stats.workspaces.reduce((sum, row) => sum + row.taskMs, 0),
    stats.taskSumMs,
    '工作区明细之和等于累计工时',
  )
  assert.equal(
    stats.workspaces.reduce((sum, row) => sum + row.activeMs, 0),
    stats.activeSumMs,
    '工作区活跃之和等于活跃累计',
  )
  const hourBucket = stats.trend[10]
  assert.equal(hourBucket.taskMs, 10 * MINUTE)
  assert.equal(hourBucket.activeMs, 4 * MINUTE)
})

test('空数据：仪表盘返回空工作区与全零趋势，不抛错', async () => {
  const clock = createFakeClock(localTime(2026, 11, 4, 10, 0), 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  const stats = service.queryStats({ period: 'day', view: 'dashboard' })
  assert.deepEqual(stats.workspaces, [])
  assert.equal(stats.trend.length, 24)
  assert.ok(stats.trend.every((bucket) => bucket.activeMs === 0 && bucket.taskMs === 0))
  assert.equal(stats.taskMs, 0)
  assert.equal(stats.taskCount, 0)
  assert.equal(stats.taskSumMs, 0)
  assert.equal(stats.activeSumMs, 0)
})

test('周期卡：一次查询同时给出今日/本周/本月三个周期的活跃与任务', async () => {
  const now = localTime(2026, 11, 4, 10, 30)
  const clock = createFakeClock(now, 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  await addTurn(service, 'session-1', 1, localTime(2026, 11, 4, 9, 0), localTime(2026, 11, 4, 9, 30))
  await addTurn(service, 'session-1', 2, localTime(2026, 11, 3, 9, 0), localTime(2026, 11, 3, 9, 40))
  await addTurn(service, 'session-1', 3, localTime(2026, 10, 15, 9, 0), localTime(2026, 10, 15, 9, 20))

  const stats = service.queryStats({ period: 'day', view: 'dashboard' })
  assert.equal(stats.cycles.day.taskMs, 30 * MINUTE)
  assert.equal(stats.cycles.week.taskMs, 70 * MINUTE, '本周含 11-03 与 11-04 两段')
  assert.equal(stats.cycles.month.taskMs, 70 * MINUTE, '本月不含 10-15')
  assert.equal(stats.cycles.day.from, localTime(2026, 11, 4, 0, 0))
  assert.equal(stats.cycles.week.from, mondayOf(now))
  assert.equal(stats.cycles.month.from, localTime(2026, 11, 1, 0, 0))
  assert.equal(stats.cycles.week.taskCount, 2)
})

test('summary 视图：侧边栏读取保持轻量，不携带趋势与工作区', async () => {
  const clock = createFakeClock(localTime(2026, 11, 4, 10, 0), 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  const stats = service.queryStats({ period: 'day' })
  assert.equal(stats.range.from, localTime(2026, 11, 4, 0, 0))
  assert.ok(Number.isFinite(stats.activeMs))
  assert.equal(stats.trend, undefined)
  assert.equal(stats.workspaces, undefined)
})

test('details 视图：返回工作区与会话明细，跳过趋势和周期卡计算', async () => {
  const now = localTime(2026, 11, 4, 10, 30)
  const clock = createFakeClock(now, 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()
  await addTurn(service, 'session-1', 1, localTime(2026, 11, 4, 9, 0), localTime(2026, 11, 4, 9, 30), {
    workspaceId: 'workspace-1', workspaceTitle: '工作区一',
  })
  await addTurn(service, 'session-1', 2, localTime(2026, 10, 15, 9, 0), localTime(2026, 10, 15, 9, 20))

  const details = service.queryStats({ from: localTime(2026, 11, 4, 0, 0), view: 'details' })
  assert.equal(details.range.from, localTime(2026, 11, 4, 0, 0))
  assert.equal(details.range.to, now)
  assert.equal(details.taskCount, 1, '只统计今天这一段任务')
  assert.equal(details.workspaces.length, 1)
  assert.equal(details.workspaces[0].sessions.length, 1)
  assert.equal(details.trend, undefined, '明细不计算趋势桶')
  assert.equal(details.cycles, undefined, '明细不计算周期卡')
  assert.ok(Array.isArray(details.subagentTasks), '明细仍带子代理任务摘要')
})

test('只有活跃、没有任务的会话也出现在明细里，未归属活跃不被丢弃', async () => {
  const t0 = localTime(2026, 11, 4, 11, 0)
  const clock = createFakeClock(t0, 0)
  const service = createChronoScopeDomain({ domain: createMemoryDomain(), clock })
  await service.start()

  // 没有选择会话时的前台活跃：会话与工作区都为空，且没有任何任务记录。
  const unassigned = {
    sessionId: null,
    sessionTitle: null,
    workspaceId: null,
    workspaceTitle: null,
  }
  for (let at = t0; at < t0 + 2 * MINUTE; at += 30_000) {
    clock.nowMs = at
    await service.recordPresence(foregroundPresence(at, unassigned))
  }
  clock.nowMs = t0 + 2 * MINUTE
  await service.recordPresence(foregroundPresence(clock.nowMs, { ...unassigned, visible: false }))

  clock.nowMs = t0 + 10 * MINUTE
  const stats = service.queryStats({ period: 'day', view: 'dashboard' })

  assert.equal(stats.activeMs, 2 * MINUTE)
  assert.equal(stats.taskCount, 0)
  assert.equal(stats.workspaces.length, 1)
  const group = stats.workspaces[0]
  assert.equal(group.workspaceId, null)
  assert.equal(group.taskMs, 0)
  assert.equal(group.activeMs, 2 * MINUTE, '工作区活跃仍计入这段无会话的活跃')
  assert.equal(group.sessions.length, 1, '只有活跃、没有任务的会话仍占一行')
  assert.equal(group.sessions[0].sessionId, null)
  assert.equal(group.sessions[0].activeMs, 2 * MINUTE)
})
