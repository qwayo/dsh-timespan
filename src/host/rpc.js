/**
 * ChronoScope 的包内私有 RPC。
 *
 * Client 半通过它做四件事：每 15 秒上报一次 presence 心跳（可见性、窗口
 * 聚焦、前台会话与最近操作），按日/周/月读取统计与仪表盘明细（同一响应
 * 带回回填状态与子代理明细），读写三项设置、导出 JSON/CSV，以及二次确认后
 * 清空全部统计；另有失败时的历史回填重试。这里沿用 DSH 的
 * connection.rpc 通道：Host 侧用
 * connection.fetch.register 挂一条 /api/chrono-scope 的精确路由，Client 用
 * connection.rpc.call('/api', 'chrono-scope', { method, payload }) 调用。
 *
 * 通道是包内私有的，不占用公开 API 命名空间；调用方只能看到统计结果或
 * 已序列化的导出内容，不会看到存储结构。Client 只上报事实、只下载文件，
 * 活跃判定、设置归一化、统计口径与清空范围全部留在 Host 领域服务里。
 */

import { initialBackfillStatus } from '../domain/backfill.js'

export const RPC_CHANNEL = 'chrono-scope'
export const RPC_PATH = `/api/${RPC_CHANNEL}`

const RPC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

/**
 * @param {object} ctx Host 插件上下文
 * @param {object} service ChronoScope 领域服务
 * @param {{ ensureBackfillStarted?: () => Promise<unknown>, retryBackfill?: () => Promise<unknown> }} hooks
 * @returns {() => void} 注销函数
 */
export function registerChronoScopeRpc(ctx, service, hooks = {}) {
  const connection = ctx.get('connection')
  const fetchRegistry = connection?.fetch
  if (fetchRegistry === undefined || typeof fetchRegistry.register !== 'function') {
    throw new Error('ChronoScope 需要 connection.fetch 才能注册私有 RPC')
  }

  const routeFetch = async (request) => {
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
    let body
    try {
      body = await request.json()
    } catch {
      return new Response('body is not JSON', { status: 400 })
    }
    if (body === null || typeof body !== 'object' || body.type !== 'client-request' || typeof body.rpcId !== 'string' || !RPC_ID_PATTERN.test(body.rpcId)) {
      return reply('invalid-request', failure('gateway/bad-request', 'invalid client-request envelope'))
    }
    const call = body.payload
    if (call === null || typeof call !== 'object' || typeof call.method !== 'string') {
      return reply(body.rpcId, failure('gateway/bad-request', 'missing call payload'))
    }
    try {
      const value = await dispatch(call.method, call.payload)
      return reply(body.rpcId, { ok: true, value })
    } catch (error) {
      return reply(body.rpcId, failure('internal', String(error?.message ?? error)))
    }
  }

  async function dispatch(method, payload) {
    // 任意一次客户端活动都兜底触发后台回填：Host 的服务在此时已挂载完毕，
    // 不必赌一个固定启动延时，也不会拖慢本次请求的响应。清空是唯一例外：
    // 它本身要把回填状态收口成 done，先触发只会让在飞回填抢写进度。
    if (method !== 'clearData') ensureBackfillStarted()
    switch (method) {
      case 'presence':
        return reportPresence(payload)
      case 'queryStats':
        return queryStats(payload)
      case 'retryBackfill':
        return retryBackfill()
      case 'getSettings':
        return getSettings()
      case 'setSettings':
        return setSettings(payload)
      case 'exportData':
        return exportData(payload)
      case 'clearData':
        return clearData()
      default:
        throw new Error(`未知的 ChronoScope 方法：${method}`)
    }
  }

  /** 页面首次取数或心跳时兜底触发后台回填；不等待它，避免拖慢统计响应。 */
  function ensureBackfillStarted() {
    if (typeof hooks.ensureBackfillStarted === 'function') void hooks.ensureBackfillStarted()
  }

  /** 纯读：回填的触发统一放在 dispatch，读状态本身没有副作用。 */
  function readBackfillStatus() {
    return typeof service.getBackfillStatus === 'function'
      ? service.getBackfillStatus()
      : initialBackfillStatus()
  }

  /** 只触发、不等待整次回填：避免长任务把 RPC 请求一直挂住，由页面轮询收尾。 */
  function retryBackfill() {
    if (typeof hooks.retryBackfill !== 'function') {
      throw new Error('历史回填重试不可用')
    }
    if (typeof service.getBackfillStatus !== 'function') {
      throw new Error('历史回填状态不可用')
    }
    void hooks.retryBackfill()
    // 返回真实状态；页面随即用 refreshNonce 再取一次数收敛到 running，
    // 这里不伪造一个服务端还没写下的进度值。
    return service.getBackfillStatus()
  }

  /** 接受 Client 的事实上报；时间以 Host 时钟为准，客户端只提供 lastInteractionAt。 */
  async function reportPresence(payload) {
    if (payload === null || typeof payload !== 'object') throw new Error('presence 载荷必须是对象')
    if (typeof payload.visible !== 'boolean' || typeof payload.focused !== 'boolean') {
      throw new Error('presence 载荷缺少 visible / focused 布尔值')
    }
    const result = await service.recordPresence({
      clientId: optionalString(payload.clientId),
      visible: payload.visible,
      focused: payload.focused,
      foregroundRunning: payload.foregroundRunning === true,
      lastInteractionAt: optionalTimestamp(payload.lastInteractionAt),
      sessionId: optionalString(payload.sessionId),
      sessionTitle: optionalString(payload.sessionTitle),
      workspaceId: optionalString(payload.workspaceId),
      workspaceTitle: optionalString(payload.workspaceTitle),
    })
    return {
      active: result?.active?.active === true,
      since: result?.active?.since ?? null,
    }
  }

  /**
   * 周期边界、裁剪与两种口径都由 Host 领域服务决定；RPC 只做参数校验与
   * 字段裁剪，不重新实现任何业务规则。tasks 原始明细不整体向 Client 暴露，
   * 仪表盘视图只附带按父会话关联的子代理任务摘要。
   * 页面 RPC 只按周期查询：自定义起止范围由 Host 侧工具（票 07 的
   * chrono_stats）直接调用领域服务，避免自定义范围与趋势桶/周期卡窗口错配。
   * 周起始不再由页面下发，也不存在页面缓存的一份设置：Host 领域服务每次
   * 查询都从权威 meta 现取，改完设置的下一次取数立即换边界。
   */
  function queryStats(payload) {
    const now = Date.now()
    const period = normalizePeriod(payload?.period)
    const view = payload?.view === 'dashboard' ? 'dashboard' : 'summary'
    const stats = service.queryStats({ period, view })
    const result = {
      asOf: now,
      period,
      weekStartsOn: stats.weekStartsOn,
      view,
      from: stats.from,
      to: stats.to,
      range: stats.range,
      onlineMs: stats.onlineMs,
      activeMs: stats.activeMs,
      activeSumMs: stats.activeSumMs,
      taskMs: stats.taskMs,
      taskSumMs: stats.taskSumMs,
      taskCount: stats.taskCount,
      taskRunning: stats.taskRunning === true,
      sessions: stats.sessions,
      running: stats.running === true,
      activeRunning: stats.activeRunning === true,
      // 回填状态随每次取数一起返回：queryStats 读的是同一份任务表，因此
      // 状态翻到 done 的那一次响应里数字也已经是回填后的结果，页面无需刷新。
      backfill: readBackfillStatus(),
    }
    if (view === 'dashboard') {
      result.workspaces = stats.workspaces
      result.trend = stats.trend
      result.cycles = stats.cycles
      // 子代理任务只按父会话关联暴露，不进总计，也不暴露整张 tasks 原始明细。
      result.subagentTasks = stats.subagentTasks ?? []
    }
    return result
  }

  /**
   * 设置、导出、清空都只转发到 Host 领域服务。RPC 不复制规则、不缓存状态：
   * 设置项由领域服务归一化并持久化，导出内容由领域服务序列化，清空只删本域。
   */
  function getSettings() {
    return service.getSettings()
  }

  function setSettings(payload) {
    if (payload === null || typeof payload !== 'object') throw new Error('setSettings 载荷必须是对象')
    const patch = {}
    for (const key of ['idleThresholdMinutes', 'weekStartsOn', 'showSubagents']) {
      if (Object.hasOwn(payload, key)) patch[key] = payload[key]
    }
    return service.setSettings(patch)
  }

  function exportData(payload) {
    if (payload === null || typeof payload !== 'object') throw new Error('exportData 载荷必须是对象')
    return service.exportData({ format: payload.format })
  }

  function clearData() {
    return service.clearData()
  }

  function normalizePeriod(value) {
    if (value === undefined) return 'day'
    if (value === 'day' || value === 'week' || value === 'month') return value
    throw new Error(`未知统计周期：${String(value)}`)
  }

  return fetchRegistry.register({
    path: RPC_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: routeFetch,
  })
}

function reply(rpcId, result) {
  return Response.json({ type: 'server-response', rpcId, result })
}

function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}

function optionalString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function optionalTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}
