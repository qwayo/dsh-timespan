const MAX_SESSIONS = 64
const MAX_FAILED_SOURCES = 16
const MAX_WORKSPACES = 12
const MAX_EXCERPTS_PER_SESSION = 48
const MAX_TOOL_EXCERPTS_PER_SESSION = 8
const MAX_SESSION_BYTES = 8_192
const MIN_SESSION_BYTES = 384
const MAX_EXCERPT_LENGTH = 1_600
const MAX_TOOL_EXCERPT_LENGTH = 600

/** 取消分析时可退出只读等待。保留拒绝分支处理尚未结束的宿主读取。 */
export async function waitForAnalysisRead(read, signal) {
  signal.throwIfAborted()
  const { promise: aborted, reject } = Promise.withResolvers()
  const onAbort = () => reject(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    const pending = Promise.resolve().then(() => {
      signal.throwIfAborted()
      return read()
    })
    return await Promise.race([pending, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

/** 只读取统计快照中的主会话，以及目录中明确属于这些会话的子代理。 */
export async function collectAnalysisInput({ input, query, language, byteLimit, signal, onProgress }) {
  const { candidates, relatedSessionsUnavailable } = await discoverSessions(input.sessions, query, signal)
  const statistics = projectStatistics(input.stats, input.workspaceId !== null || input.sessionId !== null)
  const coverage = {
    totalSessions: candidates.length,
    readSessions: 0,
    includedSessions: 0,
    failedSessions: 0,
    omittedSessions: 0,
    truncated: statistics.omittedWorkspaces > 0,
    relatedSessionsUnavailable,
  }
  const scope = projectScope(input)
  const data = {
    language,
    scope: {
      period: scope.period,
      from: scope.from,
      to: scope.to,
      timeZone: scope.timeZone,
      workspaceTitle: label(scope.workspaceTitle, 160),
      sessionTitle: label(scope.sessionTitle, 160),
    },
    statistics,
    coverage,
    conversations: [],
  }
  const sources = []
  const failedSources = []
  const aliases = new Map()
  // 留出会话覆盖计数在扫描过程中增长所需的字节。
  let remainingBytes = byteLimit - jsonBytes(data) - 96
  while (remainingBytes < MIN_SESSION_BYTES && statistics.workspaces.length > 0) {
    statistics.workspaces.pop()
    statistics.omittedWorkspaces += 1
    coverage.truncated = true
    remainingBytes = byteLimit - jsonBytes(data) - 96
  }
  while (remainingBytes < MIN_SESSION_BYTES && statistics.trend.length > 0) {
    statistics.trend.shift()
    statistics.omittedTrendBuckets += 1
    coverage.truncated = true
    remainingBytes = byteLimit - jsonBytes(data) - 96
  }

  onProgress({ read: 0, total: candidates.length })
  for (const [index, entry] of candidates.entries()) {
    signal.throwIfAborted()
    if (index >= MAX_SESSIONS || remainingBytes < MIN_SESSION_BYTES) {
      coverage.omittedSessions += candidates.length - index
      coverage.truncated = true
      break
    }
    const result = await readSessionMaterial(query, entry, scope, signal)
    onProgress({ read: index + 1, total: candidates.length })
    if (result.reason !== undefined) {
      coverage.failedSessions += 1
      if (failedSources.length < MAX_FAILED_SOURCES) {
        failedSources.push({ ...projectSource(entry), reason: result.reason })
      }
      continue
    }

    const { material, isChild, parentSessionId } = result
    coverage.readSessions += 1
    if (material.excerpts.length === 0) continue

    const alias = `S${sources.length + 1}`
    const source = { ...projectSource(entry, material.title), parentSessionId }
    const conversation = {
      source: alias,
      sessionTitle: label(source.sessionTitle, 160),
      workspaceTitle: label(source.workspaceTitle, 160),
      kind: isChild ? 'subagent' : 'session',
      parentSource: aliases.get(parentSessionId) ?? null,
      excerpts: [],
    }
    const pendingSessions = Math.min(candidates.length - index, 8)
    const sessionBytes = Math.min(MAX_SESSION_BYTES, Math.floor(remainingBytes / pendingSessions))
    const trimmed = fitConversation(conversation, material.excerpts, sessionBytes)
    if (trimmed || conversation.excerpts.length !== material.excerpts.length || material.truncated) coverage.truncated = true
    if (conversation.excerpts.length === 0) {
      coverage.omittedSessions += 1
      continue
    }
    remainingBytes -= jsonBytes(conversation) + 1
    coverage.includedSessions += 1
    aliases.set(entry.sessionId, alias)
    sources.push(source)
    data.conversations.push(conversation)
  }
  // 失败名单用于页面定位会话，模型材料的覆盖信息只包含数量和标记。
  return { data, sources, coverage: { ...coverage, failedSources }, scope }
}

async function discoverSessions(sessions, query, signal) {
  const roots = new Map()
  for (const row of sessions) {
    if (!validId(row.sessionId) || roots.has(row.sessionId)) continue
    roots.set(row.sessionId, {
      sessionId: row.sessionId,
      sessionTitle: row.sessionTitle ?? null,
      workspaceId: row.workspaceId ?? null,
      workspaceTitle: row.workspaceTitle ?? null,
      parentSessionId: null,
    })
  }
  const candidates = [...roots.values()]
  if (candidates.length === 0) return { candidates, relatedSessionsUnavailable: false }

  let directory
  try {
    directory = await waitForAnalysisRead(() => query.listSessions(signal), signal)
    signal.throwIfAborted()
    if (!Array.isArray(directory)) throw new Error('会话目录格式无效')
  } catch {
    signal.throwIfAborted()
    return { candidates, relatedSessionsUnavailable: true }
  }
  const children = new Map()
  for (const record of directory) {
    const header = record?.header
    if (header?.origin !== 'subagent' || !validId(header.parentSession) || !validId(header.id)) continue
    if (!children.has(header.parentSession)) children.set(header.parentSession, [])
    children.get(header.parentSession).push(header.id)
  }

  // 以主会话为根广度优先遍历，普通 fork 不属于子代理。去重也保护错误的循环关系。
  const seen = new Set(roots.keys())
  for (let index = 0; index < candidates.length; index += 1) {
    const parent = candidates[index]
    for (const id of children.get(parent.sessionId) ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      candidates.push({
        sessionId: id,
        sessionTitle: null,
        workspaceId: parent.workspaceId,
        workspaceTitle: parent.workspaceTitle,
        parentSessionId: parent.sessionId,
      })
    }
  }
  return { candidates, relatedSessionsUnavailable: false }
}

async function readSessionMaterial(query, entry, scope, signal) {
  let snapshot
  try {
    snapshot = await waitForAnalysisRead(() => query.readSession(entry.sessionId), signal)
  } catch (error) {
    signal.throwIfAborted()
    const missing = error?.code === 'ENOENT' || error?.code === 'SESSION_QUERY_SESSION_NOT_FOUND'
      || error?.name === 'SessionPersistenceNotFoundError'
    return { reason: missing ? 'missing' : 'unavailable' }
  }
  signal.throwIfAborted()
  if (!isValidSnapshot(snapshot, entry)) return { reason: 'invalid-record' }

  const isChild = snapshot.session.origin === 'subagent'
  const parentSessionId = isChild && validId(snapshot.session.parentSession) ? snapshot.session.parentSession : null
  try {
    return { material: readEvidence(snapshot, scope, isChild), isChild, parentSessionId }
  } catch {
    return { reason: 'unavailable' }
  }
}

function isValidSnapshot(snapshot, entry) {
  const { session, events, inheritedEventCount } = snapshot ?? {}
  if (session?.id !== entry.sessionId || !Array.isArray(events) || !Number.isSafeInteger(inheritedEventCount)
    || inheritedEventCount < 0 || inheritedEventCount > events.length) {
    return false
  }
  return entry.parentSessionId === null
    || (session.origin === 'subagent' && session.parentSession === entry.parentSessionId)
}

function projectSource(entry, fallbackTitle) {
  return {
    sessionId: entry.sessionId,
    sessionTitle: label(entry.sessionTitle ?? fallbackTitle),
    workspaceId: validId(entry.workspaceId) ? entry.workspaceId : null,
    workspaceTitle: label(entry.workspaceTitle),
  }
}

function readEvidence(snapshot, { from, to }, child) {
  const excerpts = []
  const tools = []
  const calls = new Map()
  let title = null
  let childFinal = null
  let truncated = false

  function retain(list, evidence, count, length) {
    const text = evidence.text.trim()
    if (text.length === 0) return
    truncated ||= text.length > length
    list.push({ ...evidence, text: clip(text, length) })
    if (list.length > count) {
      list.shift()
      truncated = true
    }
  }

  for (let index = snapshot.inheritedEventCount; index < snapshot.events.length; index += 1) {
    const event = snapshot.events[index]
    if (event.time >= to) continue
    const { type, data, time } = event
    if (type === 'session/title') title = data.title

    if (child) {
      if (type === 'turn/start') childFinal = null
      if (type === 'assistant/message' && time >= from && event.surfaceOp === 'append') {
        childFinal = null
        const eligible = data.interrupted !== true && !data.message?.content?.some((block) => block.type === 'tool-call')
        const text = eligible ? messageText(data.message, MAX_EXCERPT_LENGTH) : ''
        if (text.length > 0) childFinal = { turn: data.turn, text }
      }
      if (type === 'turn/end') {
        if (time >= from && data.reason?.kind === 'completed' && childFinal?.turn === data.turn) {
          retain(excerpts, { kind: 'subagent-result', time, text: childFinal.text },
            MAX_EXCERPTS_PER_SESSION, MAX_EXCERPT_LENGTH)
        }
        childFinal = null
      }
      continue
    }

    if (type === 'turn/end') calls.clear()
    if (type === 'tool/call' && typeof data.callId === 'string') calls.set(data.callId, data.name)
    if (type === 'tool/result') {
      const name = calls.get(data.message?.toolCallId)
      calls.delete(data.message?.toolCallId)
      if (time < from || event.surfaceOp !== 'append' || typeof name !== 'string') continue
      const text = messageText(data.message, MAX_TOOL_EXCERPT_LENGTH)
      retain(tools, { kind: 'tool-result', time, tool: clip(name, 100), error: data.message.isError === true, text },
        MAX_TOOL_EXCERPTS_PER_SESSION, MAX_TOOL_EXCERPT_LENGTH)
    }
    if (time < from || event.surfaceOp !== 'append') continue
    if (type === 'user/message' && data.source?.kind === 'user') {
      retain(excerpts, { kind: 'user', time, text: messageText(data, MAX_EXCERPT_LENGTH) },
        MAX_EXCERPTS_PER_SESSION, MAX_EXCERPT_LENGTH)
    }
    if (type === 'assistant/message') {
      const kind = data.interrupted === true ? 'assistant-partial' : 'assistant'
      retain(excerpts, { kind, time, text: messageText(data.message, MAX_EXCERPT_LENGTH) },
        MAX_EXCERPTS_PER_SESSION, MAX_EXCERPT_LENGTH)
    }
  }
  return { excerpts: [...excerpts, ...tools], title, truncated }
}

function messageText(message, limit) {
  let text = ''
  for (const block of message?.content ?? []) {
    if (block.type !== 'text' || typeof block.text !== 'string') continue
    const trimmed = block.text.trim()
    if (trimmed === '') continue
    if (text.length > 0) text += '\n'
    // 多取一个字符供覆盖判定，同时避免拼接巨大的工具输出。
    text += trimmed.slice(0, limit + 1 - text.length)
    if (text.length > limit) break
  }
  return text
}

function fitConversation(conversation, excerpts, budget) {
  let remaining = budget - jsonBytes(conversation)
  let trimmed = false
  // 先保留临近截止时刻的主对话，再用余量补充相关工具结果。
  const prioritized = [...excerpts].sort((left, right) =>
    Number(left.kind === 'tool-result') - Number(right.kind === 'tool-result') || right.time - left.time)
  for (const excerpt of prioritized) {
    const candidate = fitExcerpt(excerpt, remaining)
    if (candidate === null) continue
    trimmed ||= candidate !== excerpt
    conversation.excerpts.push(candidate)
    remaining -= jsonBytes(candidate) + 1
  }
  conversation.excerpts.sort((left, right) => left.time - right.time)
  return trimmed
}

function fitExcerpt(excerpt, byteLimit) {
  if (jsonBytes(excerpt) + 1 <= byteLimit) return excerpt
  if (byteLimit < 256) return null
  let min = 1
  let max = excerpt.text.length - 1
  let fitted = null
  while (min <= max) {
    const length = Math.floor((min + max) / 2)
    const candidate = { ...excerpt, text: clip(excerpt.text, length) }
    if (jsonBytes(candidate) + 1 <= byteLimit) {
      fitted = candidate
      min = length + 1
    } else {
      max = length - 1
    }
  }
  return fitted
}

function projectScope(input) {
  return {
    period: input.period,
    from: input.from,
    to: input.to,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    workspaceId: input.workspaceId,
    workspaceTitle: label(input.stats.filters?.workspace?.title),
    sessionId: input.sessionId,
    sessionTitle: label(input.stats.filters?.session?.title),
  }
}

function projectStatistics(stats, filtered) {
  const trend = []
  const seenRanges = new Set()
  // 夏令时占位可能为空或映射到同一时段；只整理报告，不修改仪表盘原始桶。
  for (const { from, to, activeMs, taskMs } of stats.trend) {
    if (from >= stats.to || to <= from) continue
    const key = `${from}:${to}`
    if (seenRanges.has(key)) continue
    seenRanges.add(key)
    trend.push({ from, to, activeMs, taskMs })
  }
  const workspaces = stats.workspaces
    .map((row) => ({
      workspaceTitle: label(row.workspaceTitle, 160),
      activeMs: row.activeMs,
      taskMs: row.taskMs,
      taskCount: row.taskCount,
      approximate: row.approximate === true,
      taskBreakdown: summarizeBreakdown(row.sessions),
    }))
    .sort((left, right) => right.taskMs - left.taskMs || right.activeMs - left.activeMs)
  return {
    onlineMs: filtered ? null : stats.onlineMs,
    activeMs: stats.activeMs,
    activeSumMs: stats.activeSumMs,
    taskMs: stats.taskMs,
    taskSumMs: stats.taskSumMs,
    taskCount: stats.taskCount,
    approximate: stats.approximate === true,
    taskBreakdown: summarizeBreakdown(stats.workspaces.flatMap((row) => row.sessions)),
    trend,
    workspaces: workspaces.slice(0, MAX_WORKSPACES),
    omittedWorkspaces: Math.max(0, workspaces.length - MAX_WORKSPACES),
    omittedTrendBuckets: 0,
  }
}

function summarizeBreakdown(sessions) {
  const sums = { modelMs: 0, toolMs: 0, waitMs: 0, otherMs: 0, unsplitMs: 0 }
  for (const row of sessions) {
    const { modelMs = 0, toolMs = 0, waitMs = 0, otherMs = 0 } = row
    sums.modelMs += modelMs
    sums.toolMs += toolMs
    sums.waitMs += waitMs
    sums.otherMs += otherMs
    sums.unsplitMs += Math.max(0, (row.taskMs ?? 0) - modelMs - toolMs - waitMs - otherMs)
  }
  return sums
}

export function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function label(value, length = 512) {
  return typeof value === 'string' && value.trim() !== '' ? clip(value, length) : null
}

function clip(value, length) {
  if (value.length <= length) return value
  return `${value.slice(0, length - 1).replace(/[\uD800-\uDBFF]$/u, '').trimEnd()}…`
}

function validId(value) {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 512
}
