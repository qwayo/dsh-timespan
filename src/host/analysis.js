import { randomUUID } from 'node:crypto'
import { isPeriod } from '../domain/periods.js'
import { collectAnalysisInput, waitForAnalysisRead } from './analysis-input.js'
import { AnalysisError, generateReportContent, prepareAnalysisCall, recordAnalysisRequest } from './analysis-llm.js'

const MODEL_CATALOG_TIMEOUT_MS = 10_000

function idleState() {
  return { phase: 'idle', request: null, progress: null, error: null }
}

/** Host 只运行一次用户启动的分析，按快照采集内容并在成功时替换对应周期报告。 */
export function createAnalysisService({ ctx, service, clock = Date }) {
  let state = idleState()
  let current = null
  const lifetime = new AbortController()
  const inFlight = new Set()

  function getState() {
    return { ...structuredClone(state), reports: service.getAnalysisReports() }
  }

  async function modelCatalog(jobSignal = lifetime.signal) {
    const timeout = new AbortController()
    const signal = AbortSignal.any([lifetime.signal, jobSignal, timeout.signal])
    const timer = setTimeout(() => timeout.abort(), MODEL_CATALOG_TIMEOUT_MS)
    try {
      const catalog = await waitForAnalysisRead(() => ctx.get('sessionController')?.modelCatalog(), signal)
      if (!Array.isArray(catalog?.groups) || !Array.isArray(catalog.routableProviders) || !Array.isArray(catalog.failures)) {
        throw new Error('模型目录格式无效')
      }
      return catalog
    } catch {
      jobSignal.throwIfAborted()
      lifetime.signal.throwIfAborted()
      if (timeout.signal.aborted) {
        throw new AnalysisError('catalog-unavailable', '读取 DSH 模型目录超时，请刷新重试')
      }
      throw new AnalysisError('catalog-unavailable', 'DSH 模型目录当前不可用，请稍后刷新')
    } finally {
      clearTimeout(timer)
    }
  }

  function start(options) {
    if (lifetime.signal.aborted) throw new Error('分析服务已关闭')
    if (current !== null) return getState()
    const period = options?.period
    if (!isPeriod(period)) throw new Error('分析需要指定日、周或月周期')
    const workspaceId = optionalId(options.workspaceId)
    const sessionId = optionalId(options.sessionId)
    const { analysisProvider: provider, analysisModel: model, language } = service.getSettings()
    const startedAt = clock.now()
    const request = { period, workspaceId, sessionId, provider, model, startedAt, from: null, to: null }
    state = { ...idleState(), request }
    if (!provider || !model) return fail('model-not-selected', '请先在设置中选择分析 Provider 与模型')

    let input
    try {
      input = structuredClone(service.queryAnalysisInput({ period, workspaceId, sessionId, at: startedAt }))
    } catch {
      return fail('input-unavailable', '无法读取本次分析的统计快照')
    }
    request.from = input.from
    request.to = input.to
    const filters = input.stats.filters
    if (filters?.mismatch === true
      || (workspaceId !== null && filters?.workspace?.status !== 'matched')
      || (sessionId !== null && filters?.session?.status !== 'matched')) {
      return fail('scope-unavailable', '所选工作区或会话已不在统计记录中，请重新选择范围')
    }

    const job = { id: randomUUID(), request, input, language, controller: new AbortController() }
    // 上一次取消立即作废结果。等适配器和存储退出后再开始新请求，避免两个模型流重叠。
    const retired = [...inFlight].map((entry) => entry.done)
    current = job
    inFlight.add(job)
    state = { ...state, phase: 'collecting', progress: { read: 0, total: input.sessions.length } }
    job.done = Promise.allSettled(retired).then(() => run(job))
    return getState()
  }

  function fail(code, message) {
    state = { ...state, phase: 'failed', error: { code, message } }
    return getState()
  }

  function ensureCurrent(job) {
    if (current !== job || service.getDataGeneration() !== job.input.dataGeneration) job.controller.abort()
    job.controller.signal.throwIfAborted()
  }

  async function run(job) {
    const { id, request, input, language, controller: { signal } } = job
    let stage = 'input-unavailable'
    try {
      ensureCurrent(job)
      const catalog = await modelCatalog(signal)
      ensureCurrent(job)
      requireCatalogModel(catalog, request)
      const llm = ctx.get('llm')
      const sessions = ctx.get('sessions')
      const query = ctx.get('sessionQuery')
      if (typeof llm?.prepareCall !== 'function' || typeof sessions?.prepare !== 'function') {
        throw new AnalysisError('host-unavailable', 'DSH 当前无法生成可重放的分析报告')
      }
      if (input.sessions.length > 0 && typeof query?.readSession !== 'function') {
        throw new AnalysisError('input-unavailable', 'DSH 会话查询服务当前不可用')
      }
      const { prepared, byteLimit } = await prepareAnalysisCall(llm, request, signal)
      ensureCurrent(job)

      const { data, sources, coverage, scope } = await collectAnalysisInput({
        input, query, language, byteLimit, signal,
        onProgress(progress) {
          ensureCurrent(job)
          state = { ...state, progress }
        },
      })
      ensureCurrent(job)
      state = { ...state, phase: 'generating' }
      const replayed = await recordAnalysisRequest({
        sessions, service, id, request, data, prepared, generation: input.dataGeneration, byteLimit, signal,
      })
      ensureCurrent(job)
      stage = 'generation-failed'
      const output = await generateReportContent(prepared, replayed, sources, id, signal)
      ensureCurrent(job)

      stage = 'save-failed'
      state = { ...state, phase: 'saving' }
      await service.saveAnalysisReport({
        id,
        period: request.period,
        from: request.from,
        to: request.to,
        workspaceId: request.workspaceId,
        workspaceTitle: scope.workspaceTitle,
        sessionId: request.sessionId,
        sessionTitle: scope.sessionTitle,
        provider: request.provider,
        model: request.model,
        generatedAt: clock.now(),
        ...output,
        snapshot: { ...data.statistics, timeZone: data.scope.timeZone },
        sources,
        coverage,
      }, { generation: input.dataGeneration, signal, requestId: id })
      ensureCurrent(job)
      state = { ...state, phase: 'succeeded' }
    } catch (error) {
      if (current !== job) return
      if (signal.aborted || service.getDataGeneration() !== input.dataGeneration) {
        state = { ...state, phase: 'cancelled' }
      } else {
        const fallback = {
          'input-unavailable': '分析材料暂时无法读取，请重试',
          'generation-failed': '所选模型未完成分析，请重试',
          'save-failed': '报告保存失败，请重试',
        }
        if (error instanceof AnalysisError) {
          state = { ...state, phase: 'failed', error: { code: error.code, message: error.message } }
        } else {
          state = { ...state, phase: 'failed', error: { code: stage, message: fallback[stage] } }
        }
      }
    } finally {
      if (current === job) current = null
      inFlight.delete(job)
    }
  }

  function cancel() {
    // 进入保存阶段后，底层原子写入负责完成请求。清空仍可作废代次并删除该结果。
    if (current !== null && state.phase !== 'saving') {
      const job = current
      current = null
      state = { ...state, phase: 'cancelled' }
      job.controller.abort()
    }
    return getState()
  }

  function clear() {
    const job = current
    current = null
    state = idleState()
    job?.controller.abort()
  }

  async function close() {
    lifetime.abort()
    clear()
    await Promise.allSettled([...inFlight].map((job) => job.done))
  }

  return { modelCatalog, getState, start, cancel, clear, close }
}

function requireCatalogModel(catalog, { provider, model }) {
  if (catalog.failures.some((failure) => failure.id === provider)) {
    throw new AnalysisError('model-unavailable', '暂时无法读取所选 Provider 的模型目录，请刷新后重试')
  }
  const group = catalog.groups.find((item) => item.id === provider)
  if (!catalog.routableProviders.includes(provider) || !group?.models.some((item) => item.id === model)) {
    throw new AnalysisError('model-unavailable', '所选 Provider 或模型已不在 DSH 模型目录中，请重新选择')
  }
}

function optionalId(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim() === '' || value.length > 512) throw new Error('分析范围标识无效')
  return value
}
