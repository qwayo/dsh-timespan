/**
 * 票据 #3：回填通知「已读」持久化与事件世代。
 *
 * 测试缝沿用现有 Host 领域服务公共 API：只断言 backfill / getBackfillStatus /
 * markBackfillRead / clearData 的外部可观察结果，不读取私有存储结构、不依赖
 * DSH 真实运行时与真实时钟。所有时间用固定假时钟构造。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createChronoScopeDomain } from '../src/domain/chrono-scope-domain.js'
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

function completedTurn(sessionId, turn, start, end) {
  return {
    session: { id: sessionId, cwd: '/repo/chrono-scope' },
    inheritedEventCount: 0,
    header: {},
    events: [
      { seq: 0, type: 'turn/start', time: start, data: { turn } },
      { seq: 1, type: 'turn/end', time: end, data: { turn, reason: { kind: 'completed' } } },
    ],
  }
}

async function startedService({ domain = createMemoryDomain(), now } = {}) {
  const clock = createFakeClock({ now })
  const service = createChronoScopeDomain({ domain, clock })
  await service.start()
  return { domain, clock, service }
}

test('回填完成生成稳定事件与「累计回填」通知记录', async () => {
  const t0 = Date.UTC(2026, 10, 7, 2, 0, 0)
  const { service } = await startedService({ now: t0 + 10 * MINUTE })
  const snapshots = [
    completedTurn('session-a', 1, t0, t0 + 20_000),
    completedTurn('session-a', 2, t0 + 30_000, t0 + 60_000),
  ]

  const status = await service.backfill(async () => snapshots)
  assert.equal(status.status, 'done')
  assert.equal(status.tasksWritten, 2)
  assert.match(status.eventId, /^backfill_\d+_v\d+$/, '完成事件必须有稳定可识别的事件 ID')
  assert.equal(status.eventKind, 'initial')
  assert.ok(status.eventAt > 0, '事件必须记录完成时间')
  assert.equal(status.readEventId, '', '新事件初始为未读')
  assert.equal(status.notices.length, 1)

  const notice = status.notices[0]
  assert.equal(notice.eventId, status.eventId)
  assert.equal(notice.kind, 'initial')
  assert.equal(notice.tasksWritten, 2, '通知记录保存的是累计回填条数')
  assert.equal(notice.completedAt, status.eventAt)
  assert.equal(notice.readAt, 0)

  // 同一事件多次查询必须返回同一 eventId，且重复调用回填不会再造一个事件。
  assert.equal(service.getBackfillStatus().eventId, status.eventId)
  assert.equal(service.getBackfillStatus().notices.length, 1)
  const again = await service.backfill(async () => {
    throw new Error('已完成且版本一致时不应重新扫描')
  })
  assert.equal(again.eventId, status.eventId)
  assert.equal(again.notices.length, 1)
})

test('点「知道了」写入已读锚点，重启后同一事件仍保持已读', async () => {
  const t0 = Date.UTC(2026, 10, 7, 2, 0, 0)
  const { domain, clock, service } = await startedService({ now: t0 + 10 * MINUTE })
  const snapshot = completedTurn('session-a', 1, t0, t0 + 20_000)
  const done = await service.backfill(async () => [snapshot])

  clock.nowMs = t0 + 11 * MINUTE
  const read = await service.markBackfillRead(done.eventId)
  assert.equal(read.readEventId, done.eventId)
  assert.equal(read.readAt, t0 + 11 * MINUTE)
  assert.equal(read.notices[0].readAt, t0 + 11 * MINUTE, '通知记录同步标记已读')

  // 幂等：同一事件再次标记已读不改写第一次的已读时间。
  clock.nowMs = t0 + 12 * MINUTE
  const again = await service.markBackfillRead(done.eventId)
  assert.equal(again.readAt, t0 + 11 * MINUTE)
  assert.equal(again.eventId, done.eventId)

  // 不存在的旧事件不能污染当前已读锚点。
  const stale = await service.markBackfillRead('backfill_999_v1')
  assert.equal(stale.readEventId, done.eventId)

  // 重启后从同一个存储域读回：事件与已读状态都持久化，且不会重扫。
  const restarted = createChronoScopeDomain({ domain, clock: createFakeClock({ now: t0 + 13 * MINUTE }) })
  await restarted.start()
  const persisted = restarted.getBackfillStatus()
  assert.equal(persisted.eventId, done.eventId)
  assert.equal(persisted.readEventId, done.eventId)
  assert.equal(persisted.notices[0].readAt, t0 + 11 * MINUTE)

  let loads = 0
  await restarted.backfill(async () => {
    loads += 1
    return [snapshot]
  })
  assert.equal(loads, 0, '已读不影响回填短路口径')
})

test('手动重试与清空后的再次回填各自产生新事件，旧已读锚点不会吞掉新通知', async () => {
  const t0 = Date.UTC(2026, 10, 7, 2, 0, 0)
  const { clock, service } = await startedService({ now: t0 + 10 * MINUTE })
  const snapshots = [
    completedTurn('session-a', 1, t0, t0 + 20_000),
    completedTurn('session-a', 2, t0 + 30_000, t0 + 60_000),
  ]
  const loadSessions = async () => snapshots

  const first = await service.backfill(loadSessions)
  await service.markBackfillRead(first.eventId)

  // 手动重试：完成事件换代，之前已读的仅是第一代事件。
  clock.nowMs = t0 + 11 * MINUTE
  const retried = await service.backfill(loadSessions, { force: true })
  assert.equal(retried.eventKind, 'retry')
  assert.notEqual(retried.eventId, first.eventId)
  assert.equal(retried.readEventId, first.eventId, '已读锚点仍指向旧事件')
  assert.notEqual(retried.eventId, retried.readEventId, '新事件必须重新提示')
  assert.equal(retried.notices.length, 2)
  assert.equal(retried.notices[1].eventId, retried.eventId)
  await service.markBackfillRead(retried.eventId)

  // 清空：当前事件结束；通知历史保留，清空后普通读取不会重新灌历史任务。
  clock.nowMs = t0 + 12 * MINUTE
  await service.clearData()
  const cleared = service.getBackfillStatus()
  assert.equal(cleared.status, 'done')
  assert.equal(cleared.eventId, '', '清空后没有待提示的完成事件')
  assert.ok(cleared.clearedAt > 0)
  assert.equal(cleared.notices.length, 2, '通知记录属于历史，清空统计数据时保留')

  let loads = 0
  await service.backfill(async () => {
    loads += 1
    return []
  })
  assert.equal(loads, 0, '清空后普通读取仍短路，避免历史任务被重新灌回')

  // 清空后的再次回填（由重试触发）是新一代事件，需要再提示一次。
  clock.nowMs = t0 + 13 * MINUTE
  const afterClear = await service.backfill(loadSessions, { force: true })
  assert.equal(afterClear.eventKind, 'clear')
  assert.notEqual(afterClear.eventId, retried.eventId)
  assert.notEqual(afterClear.eventId, afterClear.readEventId)
  assert.equal(afterClear.notices.length, 3)
  assert.equal(afterClear.notices[0].eventId, first.eventId)
  assert.ok(afterClear.notices[0].readAt > 0, '旧事件的已读状态不被新时代改写')
  assert.equal(afterClear.notices[2].kind, 'clear')
})

test('版本升级重扫产生新事件，已读的旧版本事件不会吞掉升级通知', async () => {
  const t0 = Date.UTC(2026, 10, 7, 2, 0, 0)
  const domain = createMemoryDomain()
  // 模拟磁盘上由旧算法版本写入的 meta：完成事件已读，但版本落后。
  await domain.global.set({
    version: 1,
    installTime: 0,
    currentBootId: null,
    lastHeartbeat: null,
    backfill: {
      status: 'done',
      version: 0,
      scanned: 1,
      total: 1,
      tasksWritten: 1,
      error: null,
      updatedAt: t0,
      eventId: 'backfill_1_v0',
      eventKind: 'initial',
      eventSeq: 1,
      eventAt: t0,
      readEventId: 'backfill_1_v0',
      readAt: t0,
      notices: [{
        eventId: 'backfill_1_v0', kind: 'initial', version: 0,
        total: 1, tasksWritten: 1, completedAt: t0, readAt: t0,
      }],
    },
  })
  const { service } = await startedService({ domain, now: t0 + 10 * MINUTE })

  const upgraded = await service.backfill(async () => [completedTurn('session-a', 1, t0, t0 + 20_000)])
  assert.equal(upgraded.status, 'done')
  assert.equal(upgraded.eventKind, 'version')
  assert.notEqual(upgraded.eventId, 'backfill_1_v0')
  assert.equal(upgraded.readEventId, 'backfill_1_v0', '旧已读锚点仍在')
  assert.equal(upgraded.notices.length, 2)
  assert.equal(upgraded.notices[1].kind, 'version')
  assert.equal(upgraded.notices[1].readAt, 0)
})

test('旧 meta 缺少通知字段时归一化出安全默认值', async () => {
  const t0 = Date.UTC(2026, 10, 7, 2, 0, 0)
  const domain = createMemoryDomain()
  await domain.global.set({
    version: 1,
    installTime: 0,
    currentBootId: null,
    lastHeartbeat: null,
    backfill: { status: 'done', version: 1, scanned: 1, total: 1, tasksWritten: 1, error: null, updatedAt: t0 },
  })
  const { service } = await startedService({ domain, now: t0 + 10 * MINUTE })
  const status = service.getBackfillStatus()
  assert.equal(status.status, 'done')
  assert.equal(status.eventId, '')
  assert.equal(status.eventKind, '')
  assert.equal(status.readEventId, '')
  assert.equal(status.readAt, 0)
  assert.deepEqual(status.notices, [])
  assert.equal(status.tasksWritten, 1, '既有字段保持原值')
})
