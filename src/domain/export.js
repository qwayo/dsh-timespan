/**
 * 导出文件的序列化规则（纯函数）。
 *
 * 业务判定仍全部留在领域服务：这里只负责把领域服务投影出的行变成文件文本，
 * 不读存储、不重新统计。CSV 按「日 × 工作区」一行铺平，数值同时给出毫秒与
 * 可读时长；日级的在线/并集列在当天各行重复，列名已标明是日级，不做工作区
 * 归属。Client 只负责把返回的 content 交给 Blob 下载，不持有任何业务规则。
 */

import { DEFAULT_DURATION_FORMAT, formatDurationByPreset } from './duration-format.js'
import { localDayBounds, pad2 } from './periods.js'

export const EXPORT_FORMATS = new Set(['json', 'csv'])

/** 新导出格式；旧版 `chronoscope-export` 仍可导入，避免历史备份失效。 */
export const EXPORT_FORMAT = 'dsh-timespan-export'
export const LEGACY_EXPORT_FORMAT = 'chronoscope-export'

/** 表头顺序即列顺序；字段名用中文，打开即可读，毫秒列保留机器可算的口径。 */
export const CSV_COLUMNS = [
  '日期',
  '工作区ID',
  '工作区名称',
  '会话数',
  '任务次数',
  '活跃时长(毫秒)',
  '活跃时长',
  '任务时长(毫秒)',
  '任务时长',
  '模型耗时(毫秒)',
  '工具耗时(毫秒)',
  '等待耗时(毫秒)',
  '其他耗时(毫秒)',
  // 日级并集按 GLOSSARY「实际占用」命名，明确它是当日总览口径而不是工作区求和。
  '当日实际占用·活跃(毫秒)',
  '当日实际占用·任务(毫秒)',
  '当日在线时长(毫秒)',
  '当日在线时长',
]

export function isExportFormat(value) {
  return typeof value === 'string' && EXPORT_FORMATS.has(value)
}

export function exportFilename(format, exportedAt) {
  const at = new Date(exportedAt)
  const stamp = `${localDayBounds(exportedAt).dateKey}-${pad2(at.getHours())}${pad2(at.getMinutes())}${pad2(at.getSeconds())}`
  return `dsh-timespan-${stamp}.${format}`
}

export function exportMimeType(format) {
  return format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
}

/**
 * JSON 导出保留原始区间、原始任务与设置；字段不做裁剪，方便重新导入或核对。
 * @param {{ exportedAt: number, settings: object, intervals: object[], tasks: object[] }} input
 */
export function buildJsonExport({ exportedAt, settings, intervals, tasks }) {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt,
      settings,
      intervals,
      tasks,
    },
    null,
    2,
  )
}

/**
 * @param {{ dayRows: object[], durationFormat?: string }} input
 * dayRows: { dateKey, onlineMs, activeUnionMs, taskUnionMs, workspaces: object[] }
 * workspace: { workspaceId, workspaceTitle, sessionCount, taskCount, activeMs,
 *              taskMs, modelMs, toolMs, waitMs, otherMs }
 */
export function buildCsvExport({ dayRows, durationFormat = DEFAULT_DURATION_FORMAT }) {
  const lines = [CSV_COLUMNS.join(',')]
  for (const day of dayRows) {
    const groups = day.workspaces.length > 0 ? day.workspaces : [emptyWorkspaceRow()]
    for (const group of groups) {
      lines.push(
        [
          day.dateKey,
          group.workspaceId ?? '',
          group.workspaceTitle ?? '',
          group.sessionCount,
          group.taskCount,
          group.activeMs,
          formatDurationByPreset(group.activeMs, durationFormat),
          group.taskMs,
          formatDurationByPreset(group.taskMs, durationFormat),
          group.modelMs,
          group.toolMs,
          group.waitMs,
          group.otherMs,
          day.activeUnionMs,
          day.taskUnionMs,
          day.onlineMs,
          formatDurationByPreset(day.onlineMs, durationFormat),
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  // BOM 让 Excel 正确识别 UTF-8 中文表头与内容。
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

function emptyWorkspaceRow() {
  return {
    workspaceId: '',
    workspaceTitle: '',
    sessionCount: 0,
    taskCount: 0,
    activeMs: 0,
    taskMs: 0,
    modelMs: 0,
    toolMs: 0,
    waitMs: 0,
    otherMs: 0,
  }
}

/**
 * 可读时长沿用共享的五档格式定义；默认紧凑单位（`short`），超过 24 小时继续累加小时数。
 */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
