/**
 * dsh-timespan 的 Host 半。
 *
 * 装配顺序：打开 storageDomain 的 v1 域 → 启动领域服务（用进程 uptime 反推
 * 应用启动时刻并收口上次遗留区间）→ 注册 30 秒心跳 → 注册包内私有 RPC →
 * 客户端第一次取数/心跳时在后台触发一次历史回填。领域规则全部留在
 * src/domain/dsh-timespan-domain.js，这里只做 DSH 接线：把 sessionQuery
 * 读到的历史会话快照交给领域服务重放。
 */

import { createDshTimespanSpec } from './src/domain/domain-spec.js'
import { createDshTimespanDomain } from './src/domain/dsh-timespan-domain.js'
import { registerDshTimespanRpc } from './src/host/rpc.js'
import { registerTimespanStatsTool } from './src/host/tool.js'

export const name = 'dsh-timespan'
export const inject = ['storageDomain', 'timer', 'connection', 'tools']

const HEARTBEAT_MS = 30_000

const systemClock = {
  now: () => Date.now(),
  uptimeMs: () => process.uptime() * 1000,
}

export async function apply(ctx) {
  let domain
  let service
  let stopHeartbeat = () => {}
  let disposeRpc = () => {}
  let disposeSessionEvents = () => {}
  let eventQueue = Promise.resolve()
  let backfillPromise = null

  async function closeQuietly(label, dispose) {
    try {
      await dispose()
    } catch (error) {
      console.warn(`[dsh-timespan] ${label}失败：`, error)
    }
  }

  /** 会话间让出一次宏任务，让实时事件与心跳有机会插队写库。 */
  function yieldToEventLoop() {
    return new Promise((resolve) => {
      if (typeof setImmediate === 'function') setImmediate(resolve)
      else setTimeout(resolve, 0)
    })
  }

  /** sessionQuery 由组合里的后端插件提供，可能在 apply() 之后才挂载；它不在 inject 中，不能直接读 ctx.sessionQuery。 */
  function resolveSessionQuery() {
    try {
      const viaGet = typeof ctx.get === 'function' ? ctx.get('sessionQuery') : undefined
      if (viaGet !== undefined && viaGet !== null && typeof viaGet.listSessions === 'function') return viaGet
    } catch {
      // 服务尚未挂载；由 backfill() 记为 failed，页面可重试。
    }
    return null
  }

  /**
   * listSessions() 只列目录，readSession() 才解压整份事件日志。返回带 load()
   * 的延迟条目：领域服务逐个读取、重放、释放，进度在开始时就有准确的 total，
   * 也不会把全部历史日志一次性堆在内存里。
   * 归属字段与实时记录走同一套解析；标题留给日志里的 session/title 派生。
   */
  async function loadBackfillSessions() {
    const query = resolveSessionQuery()
    if (query === null || typeof query.readSession !== 'function') {
      throw new Error('sessionQuery 服务不可用，无法读取历史会话')
    }
    const records = await query.listSessions()
    const entries = []
    for (const record of records) {
      const id = record?.header?.id
      if (typeof id !== 'string' || id.length === 0 || record.persisted !== true) continue
      // 仍在运行的会话由实时 session/event 记录；重放它的历史 turn 会通过
      // closeOpenTasksForSession 误伤当前正在累积的实时任务，故整份跳过。
      if (record.live === true) continue
      entries.push({
        load: async () => {
          try {
            const loaded = await query.readSession(id)
            return {
              session: loaded.session,
              inheritedEventCount: loaded.inheritedEventCount,
              events: loaded.events,
              header: { ...buildTaskHeader({ id, header: loaded.session }), sessionTitle: null },
            }
          } catch (error) {
            // 单个损坏或格式不兼容的历史会话不该让整次回填失败。
            console.warn(`[dsh-timespan] 历史会话读取失败，已跳过 ${id}：`, error)
            return null
          }
        },
      })
    }
    return entries
  }

  /**
   * 首次启用在后台跑一次；force=true 供页面「失败可重试」按钮使用。
   * done 不在这一层短路：领域服务还要比对算法版本，版本升级后旧的 done
   * 会自动重扫，不会把历史永久锁死；failed 则由页面手动重试。
   */
  function startBackfill(force = false) {
    if (backfillPromise !== null) return backfillPromise
    if (!force && service.getBackfillStatus().status === 'failed') return Promise.resolve()
    backfillPromise = service
      .backfill(loadBackfillSessions, { force, yield: yieldToEventLoop })
      .catch((error) => {
        console.warn('[dsh-timespan] 历史回填失败：', error)
      })
      .finally(() => {
        backfillPromise = null
      })
    return backfillPromise
  }

  /** 会话事件是 fire-and-forget 推送；串行排队写库，避免同一 turn 的并发读写。 */
  function enqueueSessionEvent(session, event) {
    eventQueue = eventQueue
      .then(() =>
        service.recordSessionEvent({
          sessionId: String(session.id),
          header: buildTaskHeader(session),
          event,
        }),
      )
      .catch((error) => {
        console.warn('[dsh-timespan] 会话事件写入失败：', error)
      })
  }

  /** 把 DSH 的会话头转换成领域服务需要的任务归属信息；服务缺失时保持 null。 */
  function buildTaskHeader(session) {
    const header = session?.header ?? {}
    const workspace = resolveWorkspace(session)
    let title = null
    try {
      title = ctx.get('sessionTitle')?.get(session) ?? null
    } catch {
      // 标题服务暂不可用时只影响标题快照，不影响任务记录。
    }
    return {
      parentSessionId: header.parentSession ?? null,
      origin: header.origin ?? null,
      workspaceId: workspace?.id ?? null,
      workspaceTitle: workspace?.title ?? null,
      sessionTitle: title?.title ?? null,
    }
  }

  function resolveWorkspace(session) {
    try {
      const registry = ctx.get('workspaceRegistry')
      if (registry === undefined || registry === null || typeof registry.list !== 'function') return null
      const workspaces = registry.list()
      const sessionId = String(session.id)
      const bySession = workspaces.find((workspace) =>
        (workspace.sessionIds ?? []).some((id) => String(id) === sessionId),
      )
      if (bySession !== undefined) return bySession
      const cwd = normalizePath(session?.header?.cwd)
      if (cwd === null) return null
      return workspaces.find((workspace) => normalizePath(workspace.path) === cwd) ?? null
    } catch {
      // 归属解析失败不应阻断任务记录本身。
      return null
    }
  }

  try {
    domain = await ctx.storageDomain.open(createDshTimespanSpec())
    service = createDshTimespanDomain({ domain, clock: systemClock })
    await service.start()

    stopHeartbeat = ctx.timer.interval(() => {
      service.recordPresence().catch((error) => {
        console.warn('[dsh-timespan] 在线心跳写入失败：', error)
      })
    }, HEARTBEAT_MS)

    const removeSessionListener = ctx.on('session/event', (session, event) => {
      enqueueSessionEvent(session, event)
    })
    disposeSessionEvents = typeof removeSessionListener === 'function' ? removeSessionListener : () => {}

    disposeRpc = registerDshTimespanRpc(ctx, service, {
      // 由 RPC 的任意一次客户端活动兜底触发：此时组合里的服务已挂载完毕，
      // 不必赌一个固定启动延时。侧边栏每 5 秒的 queryStats 与每 15 秒的
      // presence 心跳都会经过这里。
      ensureBackfillStarted: () => startBackfill(false),
      retryBackfill: () => startBackfill(true),
    })

    // 只读工具与页面共用同一个 queryStats 领域操作；工具随插件 fiber 自动注销。
    registerTimespanStatsTool(ctx, service)

    ctx.effect(() => async () => {
      stopHeartbeat()
      disposeSessionEvents()
      await eventQueue
      if (backfillPromise !== null) await backfillPromise
      await closeQuietly('注销 RPC', disposeRpc)
      await closeQuietly('关闭领域服务', () => service.close())
      await closeQuietly('关闭存储域', () => domain.close())
    })
  } catch (error) {
    stopHeartbeat()
    disposeSessionEvents()
    await closeQuietly('注销 RPC', disposeRpc)
    if (service !== undefined) await closeQuietly('关闭领域服务', () => service.close())
    if (domain !== undefined) await closeQuietly('关闭存储域', () => domain.close())
    throw error
  }
}

/** 工作区路径比较：Windows 大小写不敏感，分隔符与结尾斜杠差异不影响归属。 */
function normalizePath(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  return value.replaceAll('\\', '/').replace(/\/+$/u, '').toLowerCase()
}
