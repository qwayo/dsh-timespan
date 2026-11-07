/**
 * ChronoScope 使用的存储域声明。
 *
 * DSH 的 storageDomain 后端只接受 `[a-z][a-z0-9_]*` 形式的域名与表名，因此
 * 技术域名使用 `chrono_scope`；对外展示名仍是 ChronoScope。域版本固定为 1，
 * 表的完整形状在这里一次声明，后续切片只扩展读写逻辑，不改变存储版本。
 *
 * 这里不依赖 zod，而是提供与 DomainSpec 相同的 `parse` / `safeParse` 契约，
 * 让插件保持零运行时依赖，同时继续由存储域在 open 时校验每一条已存记录。
 */

import { normalizeBackfillStatus } from './backfill.js'
import { DEFAULT_SETTINGS, normalizeSettings } from './settings.js'

const RECORD_SOURCES = new Set(['live', 'backfill'])

export function createChronoScopeSpec() {
  return {
    name: 'chrono_scope',
    version: 1,
    layout: 'per-record',
    global: {
      schema: compile(parseMeta),
      initial: initialMeta(),
    },
    tables: {
      intervals: { valueSchema: compile(parseIntervalRecord) },
      tasks: { valueSchema: compile(parseTaskRecord) },
    },
  }
}

function initialMeta() {
  return {
    version: 1,
    installTime: 0,
    currentBootId: null,
    lastHeartbeat: null,
    // 回填进度随 meta 一起持久化：重启后能直接显示「已完成」，崩溃中断的
    // running 状态也能在下一次启动时被重试。
    backfill: normalizeBackfillStatus(null),
    // 设置项是唯一权威副本；旧版本没有这一字段时，open 的 schema 会补出默认值。
    settings: { ...DEFAULT_SETTINGS },
  }
}

function parseMeta(value) {
  if (!isPlainObject(value)) throw new Error('meta 必须是对象')
  return {
    version: 1,
    installTime: nonNegativeNumber(value.installTime, 'meta.installTime', 0),
    currentBootId: nullableString(value.currentBootId, 'meta.currentBootId'),
    lastHeartbeat: nullableNumber(value.lastHeartbeat, 'meta.lastHeartbeat'),
    backfill: normalizeBackfillStatus(value.backfill),
    settings: normalizeSettings(value.settings),
  }
}

function parseIntervalRecord(value) {
  if (!isPlainObject(value)) throw new Error('interval 记录必须是对象')
  const type = value.type
  if (type !== 'online' && type !== 'active') throw new Error(`interval.type 非法：${String(type)}`)
  const source = value.source === undefined ? 'live' : value.source
  if (!RECORD_SOURCES.has(source)) throw new Error(`interval.source 非法：${String(source)}`)
  const start = requiredNumber(value.start, 'interval.start')
  const end = nullableNumber(value.end, 'interval.end')
  if (end !== null && end < start) throw new Error('interval.end 不能早于 interval.start')
  return {
    id: requiredString(value.id, 'interval.id'),
    type,
    start,
    end,
    lastHeartbeat: requiredNumber(value.lastHeartbeat, 'interval.lastHeartbeat'),
    // 最后一次心跳发生时的进程单调时钟读数；用于把真实经过的时间与墙钟
    // 跳变区分开。旧数据没有该字段时保持 null，按原有墙钟逻辑处理。
    lastHeartbeatUptime: nullableNumber(value.lastHeartbeatUptime, 'interval.lastHeartbeatUptime'),
    clientId: nullableString(value.clientId, 'interval.clientId'),
    sessionId: nullableString(value.sessionId, 'interval.sessionId'),
    workspaceId: nullableString(value.workspaceId, 'interval.workspaceId'),
    workspaceTitle: nullableString(value.workspaceTitle, 'interval.workspaceTitle'),
    sessionTitle: nullableString(value.sessionTitle, 'interval.sessionTitle'),
    // 崩溃恢复时按最后心跳推断出来的结束时刻，页面对这类记录要给出说明。
    approximate: value.approximate === true,
    source,
  }
}

function parseTaskRecord(value) {
  if (!isPlainObject(value)) throw new Error('task 记录必须是对象')
  const source = value.source === undefined ? 'live' : value.source
  if (!RECORD_SOURCES.has(source)) throw new Error(`task.source 非法：${String(source)}`)
  const start = requiredNumber(value.start, 'task.start')
  const end = nullableNumber(value.end, 'task.end')
  if (end !== null && end < start) throw new Error('task.end 不能早于 task.start')
  return {
    id: requiredString(value.id, 'task.id'),
    key: nullableString(value.key, 'task.key'),
    sessionId: requiredString(value.sessionId, 'task.sessionId'),
    turn: requiredNumber(value.turn, 'task.turn'),
    parentSessionId: nullableString(value.parentSessionId, 'task.parentSessionId'),
    origin: nullableString(value.origin, 'task.origin'),
    workspaceId: nullableString(value.workspaceId, 'task.workspaceId'),
    workspaceTitle: nullableString(value.workspaceTitle, 'task.workspaceTitle'),
    sessionTitle: nullableString(value.sessionTitle, 'task.sessionTitle'),
    start,
    end,
    endReason: nullableString(value.endReason, 'task.endReason'),
    modelMs: nonNegativeNumber(value.modelMs, 'task.modelMs', 0),
    toolMs: nonNegativeNumber(value.toolMs, 'task.toolMs', 0),
    waitMs: nonNegativeNumber(value.waitMs, 'task.waitMs', 0),
    otherMs: nonNegativeNumber(value.otherMs, 'task.otherMs', 0),
    hasBreakdown:
      value.hasBreakdown === undefined
        ? Array.isArray(value.segments) && value.segments.length > 0
        : value.hasBreakdown === true,
    approximate: value.approximate === true,
    lastEventAt: nullableNumber(value.lastEventAt, 'task.lastEventAt'),
    lastEventUptime: nullableNumber(value.lastEventUptime, 'task.lastEventUptime'),
    // 实时任务创建时的进程单调时钟读数；用于识别系统墙钟向前跳变，避免把
    // 时钟跳变产生的空白算进任务时长。历史回填没有这个读数，保持 null。
    startedUptime: nullableNumber(value.startedUptime, 'task.startedUptime'),
    segments: parseTaskSegments(value.segments),
    source,
  }
}

const TASK_SEGMENT_TYPES = new Set(['model', 'tool', 'wait'])

function parseTaskSegments(value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error('task.segments 必须是数组')
  return value.map((segment, index) => parseTaskSegment(segment, index))
}

function parseTaskSegment(value, index) {
  const name = `task.segments[${index}]`
  if (!isPlainObject(value)) throw new Error(`${name} 必须是对象`)
  if (!TASK_SEGMENT_TYPES.has(value.type)) throw new Error(`${name}.type 非法：${String(value.type)}`)
  const start = requiredNumber(value.start, `${name}.start`)
  const end = nullableNumber(value.end, `${name}.end`)
  if (end !== null && end < start) throw new Error(`${name}.end 不能早于 start`)
  return {
    type: value.type,
    start,
    end,
    step: value.step === undefined || value.step === null ? null : requiredNumber(value.step, `${name}.step`),
    callId: nullableString(value.callId, `${name}.callId`),
    approvalId: nullableString(value.approvalId, `${name}.approvalId`),
  }
}

function compile(parse) {
  return {
    parse,
    safeParse(value) {
      try {
        return { success: true, data: parse(value) }
      } catch (error) {
        return { success: false, error }
      }
    },
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value, name) {
  if (typeof value !== 'string') throw new Error(`${name} 必须是字符串`)
  return value
}

function nullableString(value, name) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new Error(`${name} 必须是字符串或 null`)
  return value
}

function requiredNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} 必须是有限数字`)
  return value
}

function nullableNumber(value, name) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} 必须是有限数字或 null`)
  return value
}

function nonNegativeNumber(value, name, fallback) {
  if (value === undefined || value === null) return fallback
  const number = requiredNumber(value, name)
  if (number < 0) throw new Error(`${name} 不能为负数`)
  return number
}
