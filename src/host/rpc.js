/**
 * ChronoScope 的包内私有 RPC。
 *
 * Client 半通过它做几件事：每 15 秒上报一次 presence 心跳（可见性、窗口
 * 聚焦、前台会话与最近操作），按日/周/月读取统计与仪表盘明细（同一响应
 * 带回回填状态与子代理明细），读取按天三项时长序列，读写设置、导出
 * JSON/CSV、导入 JSON 文件，以及二次确认后清空全部统计；另有失败时的历史回填重试、回填
 * 通知读取与「已读」锚点写入。这里沿用 DSH 的 connection.rpc 通道：Host 侧用
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
    // 不必赌一个固定启动延时，也不会拖慢本次请求的响应。清空与导入是例外：
    // 它们本身要把回填状态收口成 done，先触发只会让在飞回填抢写进度。
    if (method !== 'clearData' && method !== 'importData') ensureBackfillStarted()
    switch (method) {
      case 'presence':
        return reportPresence(payload)
      case 'queryStats':
        return queryStats(payload)
      case 'queryDailySeries':
        return queryDailySeries(payload)
      case 'getBackfillStatus':
        return readBackfillStatus()
      case 'markBackfillRead':
        return markBackfillRead(payload)
      case 'retryBackfill':
        return retryBackfill()
      case 'getSettings':
        return getSettings()
      case 'setSettings':
        return setSettings(payload)
      case 'resetSettings':
        return resetSettings()
      case 'exportData':
        return exportData(payload)
      case 'clearData':
        return clearData()
      case 'importData':
        return importData(payload)
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

  /**
   * 写入回填完成事件的已读锚点。事件 id 由 Client 从 queryStats 的 backfill
   * 里带回；Host 只接受当前事件，未知/旧事件在领域服务里保持原状。
   */
  function markBackfillRead(payload) {
    if (payload === null || typeof payload !== 'object' || typeof payload.eventId !== 'string' || payload.eventId.length === 0) {
      throw new Error('markBackfillRead 载荷缺少 eventId')
    }
    if (typeof service.markBackfillRead !== 'function') {
      throw new Error('历史回填已读状态不可用')
    }
    return service.markBackfillRead(payload.eventId)
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
   * 页面按周期查询时会带上 `period`；明细页可选传入 `from`（以及 `to`）作为
   * 本地自然日范围，范围与周期卡/趋势桶互不影响。`details` 视图只返回工作区
   * 与会话明细，跳过趋势和周期卡计算。
   * 周起始不再由页面下发，也不存在页面缓存的一份设置：Host 领域服务每次
   * 查询都从权威 meta 现取，改完设置的下一次取数立即换边界。
   */
  function queryStats(payload) {
    const now = Date.now()
    const period = normalizePeriod(payload?.period)
    const view = payload?.view === 'dashboard'
      ? 'dashboard'
      : payload?.view === 'details'
        ? 'details'
        : 'summary'
    const range = {}
    if (payload?.from !== undefined) {
      if (typeof payload.from !== 'number' || !Number.isFinite(payload.from)) {
        throw new Error('queryStats 的 from 必须是有限数字')
      }
      range.from = payload.from
    }
    if (payload?.to !== undefined) {
      if (typeof payload.to !== 'number' || !Number.isFinite(payload.to)) {
        throw new Error('queryStats 的 to 必须是有限数字')
      }
      range.to = payload.to
    }
    if (range.from !== undefined && range.to !== undefined && range.from > range.to) {
      throw new Error('queryStats 的 from 不能晚于 to')
    }
    const stats = service.queryStats({ period, view, ...range })
    const settings = service.getSettings()
    const result = {
      asOf: now,
      period,
      weekStartsOn: stats.weekStartsOn,
      // 页面与侧栏的初始数字格式：设置是权威副本，随每次取数一起带回，
      // Client 不另存一份业务状态。刷新后自然回到已保存值。
      durationFormat: settings.durationFormat,
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
    if (view === 'dashboard' || view === 'details') {
      result.workspaces = stats.workspaces
      // 子代理任务只按父会话关联暴露，不进总计，也不暴露整张 tasks 原始明细。
      result.subagentTasks = stats.subagentTasks ?? []
    }
    if (view === 'dashboard') {
      result.trend = stats.trend
      result.cycles = stats.cycles
    }
    return result
  }

  /**
   * 每日时长热力图的只读数据源：只接受 `{ from, to }` 两个有限数字，
   * 其余规则（自然日切桶、裁剪与三项口径）全部由领域服务决定。
   */
  function queryDailySeries(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('queryDailySeries 载荷必须是对象')
    }
    const extra = Object.keys(payload).find((key) => key !== 'from' && key !== 'to')
    if (extra !== undefined) throw new Error(`queryDailySeries 只接受 from 与 to，收到多余参数：${extra}`)
    const { from, to } = payload
    if (typeof from !== 'number' || !Number.isFinite(from) || typeof to !== 'number' || !Number.isFinite(to)) {
      throw new Error('queryDailySeries 需要有限数字的 from 与 to')
    }
    if (from > to) throw new Error('queryDailySeries 的 from 不能晚于 to')
    return service.queryDailySeries({ from, to })
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
    for (const key of ['idleThresholdMinutes', 'weekStartsOn', 'showSubagents', 'durationFormat', 'sidebarShowName', 'sidebarDuration', 'approximateNoticeDismissed']) {
      if (Object.hasOwn(payload, key)) patch[key] = payload[key]
    }
    return service.setSettings(patch)
  }

  /** 恢复初始设置不接收任何字段，避免 Client 用不完整载荷覆盖默认预设。 */
  function resetSettings() {
    return service.resetSettings()
  }

  function exportData(payload) {
    if (payload === null || typeof payload !== 'object') throw new Error('exportData 载荷必须是对象')
    return service.exportData({ format: payload.format })
  }

  /**
   * 导入：入参是 Client 已读文件并 JSON.parse 好的导出对象（Host 不碰文件
   * 系统），和 exportData 一样只做参数校验与字段白名单，格式/版本校验、去重、
   * 收口规则全部留给领域服务。白名单只放行导出结构里出现过的字段与
   * restoreSettings，其余字段不会进入领域层。导入后回填收口为 done，因此
   * dispatch 里与 clearData 一样不触发 ensureBackfillStarted()。
   */
  function importData(payload) {
    if (payload === null || typeof payload !== 'object') throw new Error('importData 载荷必须是对象')
    return service.importData({
      format: payload.format,
      version: payload.version,
      exportedAt: payload.exportedAt,
      settings: payload.settings,
      intervals: payload.intervals,
      tasks: payload.tasks,
      restoreSettings: payload.restoreSettings,
    })
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
