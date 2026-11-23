import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDshTimespanDomain } from '../src/domain/dsh-timespan-domain.js'
import { registerTimespanCommand } from '../src/host/command.js'
import { createMemoryDomain } from './helpers/memory-domain.js'

async function setup() {
  const initial = Date.UTC(2026, 10, 22, 10)
  let now = initial
  const service = createDshTimespanDomain({
    domain: createMemoryDomain(),
    clock: { now: () => now, uptimeMs: () => now - initial },
  })
  await service.start()
  let command
  registerTimespanCommand({ commands: { register: (definition) => { command = definition } } }, service, {
    getWorkspaceId: (session) => session.workspaceId,
  })
  return {
    service,
    advance: (ms) => { now += ms },
    event: (sessionId, type, header) => service.recordSessionEvent({
      sessionId, header, event: { type, time: now, data: { turn: 1, reason: 'completed' } },
    }),
    run: (rawInput, id = 'real-session') => command.handler({
      agent: { session: { id, workspaceId: 'project' } },
      rawInput,
      signal: new AbortController().signal,
    }),
  }
}

test('/timespan 查询使用接收命令的真实会话 ID，空会话不按同名标题回退', async () => {
  const { event, advance, run } = await setup()
  await event('real-session', 'turn/start', { sessionTitle: 'empty-session', workspaceId: 'project', workspaceTitle: 'My project' })
  advance(35_000)
  await event('real-session', 'turn/end')
  const sameSession = await run(' stats session')
  assert.equal(sameSession.kind, 'success')
  assert.match(sameSession.text, /累计/)
  assert.match(sameSession.text, /任务 0m 35s/)
  assert.doesNotMatch(sameSession.text, /在线/)

  const emptySession = await run(' stats session', 'empty-session')
  assert.equal(emptySession.kind, 'success')
  assert.match(emptySession.text, /暂无时长记录/)
  assert.doesNotMatch(emptySession.text, /0m 35s/)

  const grouped = await run(' stats today --workspace="My project" --group-by session')
  assert.equal(grouped.kind, 'success')
  assert.match(grouped.text, /empty-session · 活跃/)
  assert.equal((await run(' stats session --session Other')).kind, 'error')
  assert.equal((await run(' stats --from 2026-02-31')).kind, 'error')
})

test('/timespan 共享手动计时的状态护栏，回顾只返回预选范围', async () => {
  const { run, service, advance } = await setup()
  assert.match((await run('')).text, /\/timespan review/)
  assert.equal((await run(' timer 8d')).kind, 'error')
  assert.equal((await run(' timer 25m')).kind, 'success')
  assert.equal((await service.getTimer()).remainingMs, 25 * 60_000)
  assert.equal((await run(' timer start')).kind, 'error')
  advance(1_000)
  assert.match((await run(' timer pause')).text, /已暂停/)
  advance(4_000)
  assert.equal((await service.getTimer()).remainingMs, 25 * 60_000 - 1_000)
  assert.equal((await run(' timer resume')).kind, 'success')
  assert.equal((await run(' timer stop')).kind, 'success')
  assert.equal((await service.getTimer()).status, 'completed')
  assert.equal((await run(' review today')).kind, 'error')
  assert.equal((await run(' review')).text, '回顾范围为当前会话，请核对范围后生成。')
})

test('会话浮窗只投影当前实时任务，完成后回到空状态', async () => {
  const { service, event, advance } = await setup()
  await event('real-session', 'turn/start')
  advance(1_500)
  assert.equal(service.getRunningTask('other'), null)
  assert.equal(service.getRunningTask('real-session').elapsedMs, 1_500)
  await event('real-session', 'turn/end')
  assert.equal(service.getRunningTask('real-session'), null)
})
