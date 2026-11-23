import assert from 'node:assert/strict'
import test from 'node:test'
import { createDshTimespanDomain } from '../src/domain/dsh-timespan-domain.js'
import { createDshTimespanSpec } from '../src/domain/domain-spec.js'
import { createMemoryDomain } from './helpers/memory-domain.js'

const t0 = new Date(2026, 10, 18, 12).getTime()
const HOUR = 3_600_000

async function started({ domain = createMemoryDomain(), at = t0 } = {}) {
  const clock = { wall: at, now() { return this.wall }, uptimeMs: () => 0 }
  const service = createDshTimespanDomain({ domain, clock })
  await service.start()
  return { domain, clock, service }
}

test('正计时跨重启保留暂停，按墙钟续计并且不进入自动统计', async () => {
  const first = await started()
  const running = await first.service.controlTimer({ action: 'start', mode: 'stopwatch' })
  assert.equal(running.status, 'running')
  first.clock.wall += 10_000
  assert.equal((await first.service.getTimer()).elapsedMs, 10_000)
  await first.service.controlTimer({ action: 'pause', id: running.id })
  await first.service.close()

  const { service, clock } = await started({ domain: first.domain, at: t0 + HOUR })
  const paused = await service.getTimer()
  assert.equal(paused.id, running.id)
  assert.equal(paused.status, 'paused')
  assert.equal(paused.elapsedMs, 10_000)
  await service.controlTimer({ action: 'resume', id: running.id })
  clock.wall += 2_500
  const done = await service.controlTimer({ action: 'complete', id: running.id })
  assert.deepEqual(done.lastResult, {
    id: running.id, mode: 'stopwatch', durationMs: null, startedAt: t0,
    completedAt: t0 + HOUR + 2_500, elapsedMs: 12_500, reason: 'manual',
  })
  assert.equal(done.notification, null)
  await assert.rejects(service.controlTimer({ action: 'reset', id: '旧页面计时标识' }), { code: 'stale-timer' })
  const idle = await service.controlTimer({ action: 'reset', id: running.id })
  assert.equal(idle.status, 'idle')
  assert.deepEqual(idle.lastResult, done.lastResult)
  const stats = service.queryStats({ from: t0, to: clock.wall })
  assert.equal(stats.taskCount, 0)
  assert.equal(stats.activeMs, 0)
  assert.equal(stats.onlineMs, 12_500, '在线时长只统计两次实际运行区间')
})

test('同一 Host 串行启动，倒计时跨停机在原截止时刻完成，多个页面只认领一次', async () => {
  const { service, clock, domain } = await started()
  const [first, second] = await Promise.allSettled([
    service.controlTimer({ action: 'start', mode: 'countdown', durationMs: 5_000 }),
    service.controlTimer({ action: 'start', mode: 'stopwatch' }),
  ])
  assert.equal(first.status, 'fulfilled')
  assert.equal(second.status, 'rejected')
  assert.equal(second.reason.code, 'timer-in-progress')
  const { id } = first.value
  await assert.rejects(service.controlTimer({ action: 'reset', id }), { code: 'timer-running' })
  clock.wall += 2_000
  assert.equal((await service.controlTimer({ action: 'pause', id })).remainingMs, 3_000)
  clock.wall += 50_000
  assert.equal((await service.getTimer()).remainingMs, 3_000)
  const resumed = await service.controlTimer({ action: 'resume', id })
  assert.equal(resumed.deadlineAt, t0 + 55_000)
  await service.setSettings({ timerSound: false })
  await service.close()

  const { service: restarted } = await started({ domain, at: t0 + HOUR })
  const expired = await restarted.getTimer()
  assert.equal(expired.status, 'completed')
  assert.equal(expired.remainingMs, 0)
  assert.equal(expired.lastResult.completedAt, resumed.deadlineAt)
  assert.equal(expired.lastResult.elapsedMs, 5_000)
  assert.deepEqual(expired.notification, { id })
  assert.deepEqual(await Promise.all([
    restarted.claimTimerNotification({ id, clientId: 'one' }),
    restarted.claimTimerNotification({ id, clientId: 'two' }),
    restarted.claimTimerNotification({ id, clientId: 'one' }),
  ]), [
    { claimed: true, sound: false },
    { claimed: false, sound: false },
    { claimed: false, sound: false },
  ])
  await restarted.close()
  const { service: openedAgain } = await started({ domain, at: t0 + 2 * HOUR })
  assert.equal((await openedAgain.getTimer()).notification, null, '重启不能重复提示已认领的到期事件')
})

test('计时写入失败后仍能重试操作和提醒；没落盘就不宣称完成', async () => {
  const { service, clock, domain } = await started()
  let failNext = true
  const write = domain.global.set
  domain.global.set = async (value) => {
    if (failNext) {
      failNext = false
      throw new Error('无法写入数据')
    }
    await write(value)
  }
  const start = { action: 'start', mode: 'countdown', durationMs: 2_000 }
  await assert.rejects(service.controlTimer(start), /无法写入/)
  assert.equal((await service.getTimer()).status, 'idle')
  const { id } = await service.controlTimer(start)
  clock.wall += 4_000
  failNext = true
  await assert.rejects(service.getTimer(), /无法写入/)
  const expired = await service.controlTimer({ action: 'pause', id })
  assert.equal(expired.lastResult.completedAt, t0 + 2_000, '迟到的暂停不会丢掉到期结果')
  failNext = true
  await assert.rejects(service.claimTimerNotification({ id, clientId: 'first' }), /无法写入/)
  assert.deepEqual(await service.claimTimerNotification({ id, clientId: 'retry' }), { claimed: true, sound: true })
})

const legacyBackup = { format: 'chronoscope-export', version: 1, intervals: [], tasks: [] }

test('删除到期记录同时撤销完成显示和待提醒，重启与备份均不再读出记录', async () => {
  const first = await started()
  const run = await first.service.controlTimer({ action: 'start', mode: 'countdown', durationMs: 1_000 })
  first.clock.wall += 2_000
  assert.deepEqual((await first.service.getTimer()).notification, { id: run.id })
  const cleared = await first.service.controlTimer({ action: 'clear-result', id: run.id })
  assert.equal(cleared.status, 'idle')
  assert.equal(cleared.lastResult, null)
  assert.equal(cleared.notification, null)
  assert.deepEqual(await first.service.claimTimerNotification({ id: run.id, clientId: 'late' }), { claimed: false, sound: false })
  assert.equal((await backup(first.service)).lastTimerResult, null)
  await first.service.close()
  const reopened = await started({ domain: first.domain, at: t0 + HOUR })
  assert.equal((await reopened.service.getTimer()).lastResult, null)
  assert.equal((await reopened.service.getTimer()).status, 'idle')
})

test('删除最近结果独立于当前运行或暂停的计时，不重置也不扣减累计时间', async () => {
  for (const paused of [false, true]) {
    const { service, clock } = await started()
    const previous = await service.controlTimer({ action: 'start', mode: 'stopwatch' })
    clock.wall += 1_000
    await service.controlTimer({ action: 'complete', id: previous.id })
    const current = await service.controlTimer({ action: 'start', mode: 'countdown', durationMs: 10_000 })
    clock.wall += 2_000
    if (paused) await service.controlTimer({ action: 'pause', id: current.id })
    const before = await service.getTimer()
    const after = await service.controlTimer({ action: 'clear-result', id: previous.id })
    assert.deepEqual(after, { ...before, lastResult: null, history: [] })
    clock.wall += 1_000
    assert.equal((await service.getTimer()).elapsedMs, paused ? 2_000 : 3_000)
  }
})

test('删除失败可重试，过期页面不能删除新完成的记录', async () => {
  const { service, clock, domain } = await started()
  const first = await service.controlTimer({ action: 'start', mode: 'stopwatch' })
  clock.wall += 1_000
  await service.controlTimer({ action: 'complete', id: first.id })
  const write = domain.global.set
  domain.global.set = async () => { throw new Error('记录保存失败') }
  await assert.rejects(service.controlTimer({ action: 'clear-result', id: first.id }), /记录保存失败/)
  assert.equal((await service.getTimer()).lastResult.id, first.id)
  domain.global.set = write
  await service.controlTimer({ action: 'clear-result', id: first.id })
  const second = await service.controlTimer({ action: 'start', mode: 'countdown', durationMs: 1_000 })
  clock.wall += 2_000
  await assert.rejects(service.controlTimer({ action: 'clear-result', id: first.id }), { code: 'stale-timer' })
  await assert.rejects(service.controlTimer({ action: 'clear-result' }), { code: 'invalid-timer-action' })
  assert.equal((await service.getTimer()).lastResult.id, second.id)
})

test('手动计时历史迁移旧结果、跨重启保留最近 30 条，删除旧条目不影响到期提醒', async () => {
  const domain = createMemoryDomain()
  const { schema, initial } = createDshTimespanSpec().global
  const legacy = { id: 'legacy-run', mode: 'stopwatch', durationMs: null, startedAt: t0 - 5000,
    elapsedMs: 2000, completedAt: t0 - 1000, reason: 'manual' }
  await domain.global.set(schema.parse({ ...initial, timer: { current: null, lastResult: legacy, showCompleted: true } }))
  const { service, clock } = await started({ domain })
  assert.deepEqual((await service.getTimer()).history, [legacy])
  const completed = []
  for (let index = 0; index < 31; index += 1) {
    const run = await service.controlTimer({ action: 'start', mode: 'stopwatch' })
    clock.wall += 1000 + index
    const result = await service.controlTimer({ action: 'complete', id: run.id })
    completed.unshift(result.lastResult)
  }
  const countdown = await service.controlTimer({ action: 'start', mode: 'countdown', durationMs: 5_000 })
  clock.wall += 6_000
  const expired = await service.getTimer()
  const removed = expired.history.at(-1).id
  assert.deepEqual(expired.history.slice(1), completed.slice(0, 29))
  assert.equal(expired.history[0].elapsedMs, 5_000)
  assert.deepEqual(domain.global.get().timer.lastResult, expired.history[0], '旧版本仍可读取最近一次完成记录')
  assert.deepEqual(expired.notification, { id: countdown.id })
  await service.close()

  const reopened = await started({ domain, at: clock.wall })
  const current = await reopened.service.getTimer()
  assert.deepEqual(current.history, expired.history)
  const updated = await reopened.service.controlTimer({ action: 'clear-result', id: removed })
  assert.deepEqual(updated.history, expired.history.slice(0, -1))
  assert.equal(updated.id, countdown.id)
  assert.equal(updated.status, 'completed')
  assert.deepEqual(updated.notification, expired.notification)
})

function sampleReport(id, period = 'day') {
  return {
    id, period, from: t0 - HOUR, to: t0, generatedAt: t0 + 1, provider: 'provider', model: 'model',
    workspaceId: 'workspace', workspaceTitle: '工作区', sessionId: 'source', sessionTitle: '会话',
    summary: '摘要',
    content: { statistics: '统计解读', work: [{ text: '进展', sourceIds: ['source'] }], suggestions: '' },
    sources: [{
      sessionId: 'source', sessionTitle: '会话', workspaceId: 'workspace', workspaceTitle: '工作区', parentSessionId: null,
    }],
    coverage: {
      totalSessions: 1, readSessions: 1, includedSessions: 1, failedSessions: 0,
      omittedSessions: 0, truncated: false, relatedSessionsUnavailable: false,
    },
  }
}

async function backup(service) {
  return JSON.parse((await service.exportData({ format: 'json' })).content)
}

function reportSnapshot() {
  return { timeZone: 'Asia/Shanghai', onlineMs: HOUR, activeMs: 12_000, activeSumMs: 15_000,
    taskMs: 5_000, taskSumMs: 6_000, taskCount: 2, approximate: false,
    trend: [{ from: t0 - HOUR, to: t0, activeMs: 12_000, taskMs: 5_000 }],
    workspaces: [{ workspaceTitle: '工作区', activeMs: 15_000, taskMs: 6_000 }],
    omittedWorkspaces: 0, omittedTrendBuckets: 0 }
}

test('回顾快照固定于生成时，筛选不显示在线归属，备份读回只保留统计白名单', async () => {
  const { service, clock } = await started()
  const report = { ...sampleReport('snapshot'), snapshot: { ...reportSnapshot(), rawConversation: '不能导出' } }
  await service.saveAnalysisReport(report)
  const first = service.getAnalysisReports().day.snapshot
  assert.equal(first.onlineMs, null, '工作区和会话筛选没有在线时长归属')
  assert.equal(first.activeMs, 12_000)
  assert.equal(Object.hasOwn(first, 'rawConversation'), false)
  clock.wall += HOUR
  await service.getTimer()
  assert.deepEqual(service.getAnalysisReports().day.snapshot, first, '在线统计推进不会改写旧回顾')
  const file = await backup(service)
  const restored = await started()
  await restored.service.importData(file)
  assert.deepEqual(restored.service.getAnalysisReports().day.snapshot, first)
  for (const change of [{ activeMs: -1 }, { taskCount: .5 }, { timeZone: 'invalid-zone' },
    { trend: [{ from: t0 + 1, to: t0 + 2, activeMs: 0, taskMs: 0 }] },
    { trend: [reportSnapshot().trend[0], reportSnapshot().trend[0]] }]) {
    await assert.rejects(restored.service.importData({ ...file, reports: { day: { ...report, snapshot: { ...reportSnapshot(), ...change } } } }),
      { code: 'invalid-analysis-reports' })
  }
})

test('旧回顾只从匹配成功请求恢复图表，缺少或错期的材料保持无快照', async () => {
  const { service } = await started()
  const report = { ...sampleReport('legacy-snapshot'), workspaceId: null, sessionId: null }
  const input = { scope: { period: 'day', from: report.from, to: report.to, timeZone: 'Asia/Shanghai' },
    statistics: reportSnapshot(), conversations: [{ text: '私有对话材料' }] }
  const generation = service.getDataGeneration()
  await service.saveAnalysisRequest(sampleRequest(report.id, 'day', JSON.stringify(input)), { generation })
  await service.saveAnalysisReport(report, { generation, requestId: report.id })
  assert.equal(service.getAnalysisReports().day.snapshot.onlineMs, HOUR)
  const file = await backup(service)
  assert.equal(file.reports.day.snapshot.activeMs, 12_000)
  assert.equal(JSON.stringify(file).includes('私有对话材料'), false)
  await service.saveAnalysisRequest(sampleRequest(report.id, 'day', JSON.stringify({ ...input, scope: { ...input.scope, to: report.to - 1 } })), { generation })
  await service.saveAnalysisReport(report, { generation, requestId: report.id })
  assert.equal(service.getAnalysisReports().day.snapshot, undefined)
  await service.saveAnalysisReport({ ...report, id: 'another' })
  assert.equal(service.getAnalysisReports().day.snapshot, undefined)
})

test('备份导出计时历史和报告，导入去重且保留本机当前计时', async () => {
  const source = await started()
  await source.service.setSettings({ analysisProvider: 'provider', analysisModel: 'model', timerSound: false })
  const older = await source.service.controlTimer({ action: 'start', mode: 'stopwatch' })
  source.clock.wall += 2_000
  await source.service.controlTimer({ action: 'complete', id: older.id })
  const startedTimer = await source.service.controlTimer({ action: 'start', mode: 'countdown', durationMs: 1_000 })
  source.clock.wall += 1_000
  await source.service.controlTimer({ action: 'start', mode: 'stopwatch' })
  await source.service.saveAnalysisReport(sampleReport('源文件的日分析'))
  await source.service.saveAnalysisReport(sampleReport('源文件的周分析', 'week'))
  const file = await backup(source.service)
  assert.equal(file.lastTimerResult.id, startedTimer.id)
  assert.equal(file.lastTimerResult.reason, 'expired')
  assert.deepEqual(file.timerHistory.map((record) => record.id), [startedTimer.id, older.id])
  assert.equal(file.reports.week.id, '源文件的周分析')
  assert.equal(Object.hasOwn(file, 'timer'), false)

  const fresh = await started({ at: t0 + HOUR })
  await fresh.service.importData({ ...file, restoreSettings: true, timer: { current: { bogus: true } } })
  const imported = await fresh.service.getTimer()
  assert.equal(imported.status, 'idle')
  assert.deepEqual(imported.lastResult, file.lastTimerResult)
  assert.deepEqual(imported.history, file.timerHistory)
  assert.equal(imported.notification, null, '备份里的到期结果不再次提醒')
  assert.equal(fresh.service.getSettings().analysisModel, 'model')
  assert.equal(fresh.service.getSettings().timerSound, false)

  const target = await started({ at: t0 + HOUR })
  const local = await target.service.controlTimer({ action: 'start', mode: 'stopwatch' })
  await target.service.controlTimer({ action: 'complete', id: local.id })
  const current = await target.service.controlTimer({ action: 'start', mode: 'countdown', durationMs: 2_000 })
  await target.service.saveAnalysisReport(sampleReport('本机的日分析'))
  await target.service.importData(file)
  await target.service.importData(file)
  await target.service.importData(legacyBackup)
  const timer = await target.service.getTimer()
  assert.equal(timer.id, current.id)
  assert.equal(timer.status, 'running')
  assert.equal(timer.lastResult.id, local.id)
  assert.deepEqual(timer.history.map((record) => record.id), [local.id, startedTimer.id, older.id])
  const legacyTarget = await started()
  await legacyTarget.service.importData({ ...legacyBackup, lastTimerResult: file.lastTimerResult })
  assert.deepEqual((await legacyTarget.service.getTimer()).history, [file.lastTimerResult])
  assert.equal(target.service.getAnalysisReports().day.id, '本机的日分析')
  assert.equal(target.service.getAnalysisReports().week.id, '源文件的周分析')
})

test('导入在写任何记录前拒绝无效、超长或伪造来源的报告', async () => {
  const { service } = await started()
  const local = sampleReport('上次成功的报告')
  await service.saveAnalysisReport(local)
  const before = await backup(service)
  const partialWriteProbe = {
    ...legacyBackup,
    intervals: [{ id: 'unexpected', type: 'online', start: t0 - 100, end: t0, lastHeartbeat: t0 }],
  }
  const oversize = { ...local, summary: '一'.repeat(1_001) }
  const fakeSource = { ...local, content: { ...local.content, work: [{ text: '伪造', sourceIds: ['not-in-sources'] }] } }
  const invalidFailure = (failedSources, failedSessions) => ({
    ...local,
    coverage: { ...local.coverage, totalSessions: 1 + failedSessions, failedSessions, failedSources },
  })
  const failure = { sessionId: 'failed', reason: 'missing' }
  for (const reports of [
    [], { other: local }, { week: local }, { day: oversize }, { day: fakeSource }, { day: { ...local, to: t0 + 10 } },
    { day: invalidFailure(null, 1) },
    { day: invalidFailure([failure], 0) },
    { day: invalidFailure([{ ...failure, reason: 'unknown' }], 1) },
    { day: invalidFailure([{ ...failure, sessionTitle: '长'.repeat(513) }], 1) },
    { day: invalidFailure([failure, failure], 2) },
    { day: invalidFailure(Array.from({ length: 65 }, (_, index) => ({ ...failure, sessionId: `failed-${index}` })), 65) },
  ]) {
    await assert.rejects(service.importData({ ...partialWriteProbe, reports }), { code: 'invalid-analysis-reports' })
  }
  await assert.rejects(service.importData({ ...partialWriteProbe, lastTimerResult: { id: 'bad timer' } }), {
    code: 'invalid-timer-result',
  })
  await assert.rejects(service.importData({ ...partialWriteProbe, timerHistory: [null] }), { code: 'invalid-timer-result' })
  assert.deepEqual(await backup(service), before)
  assert.equal(service.getDataGeneration(), 0, '拒绝的导入不推进代次')
})

test('失败会话的稳定诊断随报告备份恢复；旧报告仅保留失败计数', async () => {
  const { service } = await started()
  const report = sampleReport('带来源诊断的日报')
  const failedSources = ['missing', 'invalid-record', 'unavailable'].map((reason) => ({
    sessionId: reason, sessionTitle: '失败会话', workspaceId: 'workspace', workspaceTitle: null, reason,
  }))
  await service.saveAnalysisReport({
    ...report,
    coverage: {
      ...report.coverage,
      totalSessions: 5,
      failedSessions: 4,
      failedSources: failedSources.map((source) => ({ ...source, rawError: '内部文件错误', path: 'internal.jsonl' })),
    },
  })
  const file = await backup(service)
  assert.equal(file.reports.day.coverage.failedSessions, 4)
  assert.deepEqual(file.reports.day.coverage.failedSources, failedSources, '备份不带原始错误与路径')

  const old = sampleReport('没有诊断字段的旧周报', 'week')
  old.coverage = { ...old.coverage, totalSessions: 2, failedSessions: 1 }
  const restored = await started({ at: t0 + HOUR })
  await restored.service.importData({ ...file, reports: { ...file.reports, week: old } })
  await restored.service.close()
  const { service: restarted } = await started({ domain: restored.domain, at: t0 + 2 * HOUR })
  const reports = restarted.getAnalysisReports()
  assert.deepEqual(reports.day.coverage.failedSources, failedSources)
  assert.equal(reports.week.coverage.failedSessions, 1)
  assert.deepEqual(reports.week.coverage.failedSources, [])
})

function sampleRequest(id, period = 'day', text = '发送给模型的材料') {
  const message = (role, kind, text) => ({ role, id: role, source: { kind }, content: [{ type: 'text', text }] })
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'system/message', surfaceOp: 'append', data: { turn: 1, step: 1, message: message('system', 'system-prompt', '角色约定') } },
    { type: 'user/message', surfaceOp: 'append', data: message('user', 'user', text) },
    { type: 'request/header', data: { header: { config: { provider: 'provider', model: 'model', maxTokens: 2048 } }, reason: 'initial', startsSeries: true } },
  ].map((event, seq) => ({ ...event, seq, time: t0 }))
  return { id, period, events }
}

test('新分析失败保留最近成功报告和可重放前缀，私有请求不会导出', async () => {
  const domain = createMemoryDomain()
  const openTable = domain.table
  let failNext = false
  domain.table = (name) => {
    const table = openTable(name)
    if (name !== 'analysis') return table
    return {
      ...table,
      async put(...args) {
        if (failNext) {
          failNext = false
          throw new Error('分析存储失败')
        }
        await table.put(...args)
      },
    }
  }
  const { service } = await started({ domain })
  const generation = service.getDataGeneration()
  const first = sampleRequest('request-1')
  await service.saveAnalysisRequest(first, { generation })
  await service.saveAnalysisReport(sampleReport('报告一'), { generation, requestId: first.id })
  // JSON 在日志里还需嵌套一次；引号和反斜线不会让合法的入模材料无法保存。
  const second = sampleRequest('request-2', 'day', JSON.stringify({ text: '"\\'.repeat(12_000) }))
  await service.saveAnalysisRequest(second, { generation })
  failNext = true
  await assert.rejects(service.saveAnalysisReport(sampleReport('报告二'), { generation, requestId: second.id }), /分析存储失败/)
  await assert.rejects(service.saveAnalysisRequest(sampleRequest('过大的请求', 'day', '汉'.repeat(25_000)), { generation }), /48 KiB/)
  assert.equal(service.getAnalysisReports().day.id, '报告一')
  assert.deepEqual(service.getAnalysisRequest(first.id), first)
  assert.deepEqual(service.getAnalysisRequest(second.id), second)
  const json = (await service.exportData({ format: 'json' })).content
  assert.equal(json.includes('发送给模型的材料'), false)
  assert.equal(json.includes(first.id), false)

  await service.saveAnalysisReport(sampleReport('报告二'), { generation, requestId: second.id })
  assert.equal(service.getAnalysisRequest(first.id), null, '同周期替换后不保留旧审计副本')
  assert.equal(service.getAnalysisReports().day.id, '报告二')
  assert.deepEqual(service.getAnalysisRequest(second.id), second)
})

test('恢复设置保留计时和报告；取消或清空后旧分析不能回写', async () => {
  const { service } = await started()
  const request = sampleRequest('request-in-progress')
  const generation = service.getDataGeneration()
  const previous = await service.controlTimer({ action: 'start', mode: 'stopwatch' })
  await service.controlTimer({ action: 'complete', id: previous.id })
  const running = await service.controlTimer({ action: 'start', mode: 'stopwatch' })
  await service.saveAnalysisRequest(request, { generation })
  await service.saveAnalysisReport(sampleReport('报告'), { generation, requestId: request.id })
  await service.setSettings({ timerPresetMinutes: 35, timerSound: false, analysisProvider: 'custom', analysisModel: 'custom' })
  assert.equal((await service.getTimer()).timerPresetMinutes, 35)
  const defaults = await service.resetSettings()
  assert.equal(defaults.timerSound, true)
  assert.equal((await service.getTimer()).timerPresetMinutes, 25)
  assert.equal(defaults.analysisProvider, '')
  assert.equal(defaults.analysisModel, '')
  assert.equal((await service.getTimer()).id, running.id)
  assert.equal((await service.getTimer()).lastResult.id, previous.id)
  assert.equal(service.getAnalysisReports().day.id, '报告')
  assert.equal(service.getAnalysisRequest(request.id).id, request.id)

  const controller = new AbortController()
  const cancelled = service.saveAnalysisReport(sampleReport('此报告已取消'), { generation, signal: controller.signal })
  controller.abort(new Error('取消分析'))
  await assert.rejects(cancelled, /取消分析/)
  assert.equal(service.getAnalysisReports().day.id, '报告')

  const clearing = service.clearData()
  const lateSave = assert.rejects(service.saveAnalysisReport(sampleReport('旧数据的迟到报告'), { generation }), {
    code: 'analysis-data-changed',
  })
  await clearing
  await lateSave
  assert.equal(service.getDataGeneration(), generation + 1)
  assert.equal((await service.getTimer()).id, null)
  assert.equal((await service.getTimer()).lastResult, null)
  assert.equal(service.getAnalysisRequest(request.id), null)
  assert.deepEqual(service.getAnalysisReports(), { day: null, week: null, month: null })
})

async function addTask(service, { sessionId, workspaceId, start, end }) {
  const header = { workspaceId, workspaceTitle: workspaceId === 'w1' ? '组一' : '组二', sessionTitle: sessionId }
  await service.recordSessionEvent({ sessionId, header, event: { type: 'turn/start', time: start, data: { turn: 1 } } })
  await service.recordSessionEvent({
    sessionId, header, event: { type: 'turn/end', time: end, data: { turn: 1, reason: { kind: 'completed' } } },
  })
}

test('分析快照以固定时间和 ID 裁剪，来源、趋势与统计沿用同一范围', async () => {
  const { service } = await started({ at: t0 + HOUR })
  await addTask(service, { sessionId: 'a', workspaceId: 'w1', start: t0 - 1_800, end: t0 - 800 })
  await addTask(service, { sessionId: 'b', workspaceId: 'w1', start: t0 - 1_600, end: t0 - 500 })
  await addTask(service, { sessionId: 'c', workspaceId: 'w2', start: t0 - 1_400, end: t0 - 900 })
  await addTask(service, { sessionId: 'cutoff', workspaceId: 'w1', start: t0, end: t0 + 1_000 })
  const yesterday = t0 - 24 * HOUR
  await addTask(service, { sessionId: 'yesterday', workspaceId: 'w1', start: yesterday - 1_000, end: yesterday - 200 })

  const snapshot = service.queryAnalysisInput({ period: 'day', workspaceId: 'w1', at: t0 })
  assert.equal(snapshot.to, t0)
  assert.deepEqual(snapshot.stats.range, { from: new Date(2026, 10, 18).getTime(), to: t0 })
  assert.deepEqual(snapshot.sessions.map((entry) => entry.sessionId), ['b', 'a'])
  assert.equal(snapshot.stats.taskMs, 1_300, '实际占用的任务时间并集')
  assert.equal(snapshot.stats.taskSumMs, 2_100, '工作区明细的累计任务时间')
  assert.equal(snapshot.stats.trend.reduce((sum, bucket) => sum + bucket.taskMs, 0), snapshot.stats.taskMs)
  assert.equal(snapshot.stats.onlineMs, 0, '在线时长不能归给工作区')
  assert.equal(Object.hasOwn(snapshot.stats, 'cycles'), false, '不能把其它时段透传给材料')
  const scope = service.queryAnalysisInput({ period: 'day', workspaceId: 'w1', sessionId: 'b', at: t0 })
  assert.equal(scope.stats.taskMs, 1_100)
  assert.deepEqual(scope.sessions.map((entry) => entry.sessionId), ['b'])
  assert.equal(service.queryAnalysisInput({ period: 'day', workspaceId: '组一', at: t0 }).stats.taskMs, 0, 'ID 不能按标题回退')
  const oldRange = service.queryAnalysisInput({ period: 'day', workspaceId: 'w1', at: yesterday })
  assert.deepEqual(oldRange.sessions.map((entry) => entry.sessionId), ['yesterday'])
  assert.equal(oldRange.stats.trend.reduce((sum, bucket) => sum + bucket.taskMs, 0), 800, '趋势使用快照所在日期')
})
