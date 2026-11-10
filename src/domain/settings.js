/**
 * dsh-timespan 设置项的纯规则模块。
 *
 * 设置是「业务状态的唯一权威副本」：只存在 Host 存储域的 meta 里，由领域服务
 * 读写；Client 不缓存、不落 localStorage、不参与判定。这里只做归一化与默认值，
 * 不读取存储、不依赖 DSH 运行时，因此 domain-spec 的 schema 与领域服务可以
 * 共用同一套规则，重启后读到的值一定与写入时一致。
 */

import { DEFAULT_DURATION_FORMAT, normalizeDurationFormat } from './duration-format.js'
import { MONDAY_WEEK_START, normalizeWeekStart } from './periods.js'

/** 空闲阈值允许范围（分钟）。UI 与 Host 都按这个范围收敛。 */
export const MIN_IDLE_THRESHOLD_MINUTES = 1
export const MAX_IDLE_THRESHOLD_MINUTES = 15

/** 侧栏入口常驻展示的时长类型；默认在线时长，活跃与任务可另行选择。 */
export const SIDEBAR_DURATION_VALUES = Object.freeze(['online', 'active', 'task'])
export const DEFAULT_SIDEBAR_DURATION = 'online'

/**
 * 侧栏状态点的位置：inline = 跟随时长留在内容簇里（默认），end = 贴到侧栏行最右侧。
 * 默认跟随入口里的时长，保留原有阅读顺序；需要把关注点拉到行末时可在设置里切到 end。
 */
export const SIDEBAR_DOT_POSITION_VALUES = Object.freeze(['end', 'inline'])
export const DEFAULT_SIDEBAR_DOT_POSITION = 'inline'

/**
 * 插件自己的界面语言：中文（默认）与英文两档。
 * 它只决定本插件文案用哪套字典，与宿主（DSH）的界面语言互不影响，
 * 因此同一台机器上的多个页面可以各自选择显示语言。
 */
export const LANGUAGE_VALUES = Object.freeze(['zh', 'en'])
export const DEFAULT_LANGUAGE = 'zh'

export const DEFAULT_SETTINGS = Object.freeze({
  idleThresholdMinutes: 5,
  weekStartsOn: MONDAY_WEEK_START,
  showSubagents: true,
  durationFormat: DEFAULT_DURATION_FORMAT,
  // 侧栏入口是否显示状态文字（空闲/活跃中/任务中）；首次安装默认关闭，仍保留时长、状态点与今日构成环。
  sidebarShowName: false,
  // 侧栏入口常驻显示哪种时长：online = 在线时长（默认）、active = 活跃时长、task = 任务时长。
  sidebarDuration: DEFAULT_SIDEBAR_DURATION,
  // 侧栏状态点是否显示；默认显示，与状态文字是两个独立开关。
  sidebarDotVisible: true,
  // 侧栏状态点位置：inline = 跟随时长（默认）、end = 最右侧。
  sidebarDotPosition: DEFAULT_SIDEBAR_DOT_POSITION,
  // 插件界面语言：中文（默认）或英文；只影响本插件文案，不改变宿主界面语言。
  language: DEFAULT_LANGUAGE,
  // 「近似数据」说明是否已被用户关闭；属于展示偏好，默认未关闭。
  approximateNoticeDismissed: false,
})

/** 兼容既有导出名：领域服务旧构造参数以毫秒表达同一默认值。 */
export const DEFAULT_IDLE_THRESHOLD_MS = DEFAULT_SETTINGS.idleThresholdMinutes * 60_000

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeIdleMinutes(value) {
  const parsed = finiteNumber(value)
  if (parsed === null) return DEFAULT_SETTINGS.idleThresholdMinutes
  return Math.min(
    MAX_IDLE_THRESHOLD_MINUTES,
    Math.max(MIN_IDLE_THRESHOLD_MINUTES, Math.round(parsed)),
  )
}

function normalizeShowSubagents(value) {
  if (value === false || value === 'false' || value === 0) return false
  return true
}

/**
 * 侧栏状态文字默认关闭：只有明确打开才显示，缺省、旧版本字段缺失与脏数据都收敛为
 * 关闭。这样首次安装不会先闪出一行状态文字。
 */
function normalizeSidebarShowName(value) {
  return value === true || value === 'true' || value === 1
}

/** 侧栏时长只认三个预设；缺省与脏数据回落到在线时长。 */
function normalizeSidebarDuration(value) {
  return typeof value === 'string' && SIDEBAR_DURATION_VALUES.includes(value)
    ? value
    : DEFAULT_SIDEBAR_DURATION
}

/**
 * 状态点显示开关默认开启：只有明确关闭才隐藏，缺省与旧版本字段缺失都保持可见。
 */
function normalizeSidebarDotVisible(value) {
  if (value === false || value === 'false' || value === 0) return false
  return true
}

/** 状态点位置只认 end / inline；缺省、旧版本字段缺失与脏数据都跟随时长。 */
function normalizeSidebarDotPosition(value) {
  return typeof value === 'string' && SIDEBAR_DOT_POSITION_VALUES.includes(value)
    ? value
    : DEFAULT_SIDEBAR_DOT_POSITION
}

/**
 * 界面语言只认 zh / en：缺省、旧版本字段缺失与脏数据都回落默认中文，
 * 这样升级后第一次打开一定是中文界面，不会被浏览器语言改变。
 */
function normalizeLanguage(value) {
  return typeof value === 'string' && LANGUAGE_VALUES.includes(value) ? value : DEFAULT_LANGUAGE
}

/**
 * 近似数据说明的关闭开关只认布尔值：非布尔（含字符串、数字、null、undefined）
 * 一律按未关闭处理，不沿用 showSubagents 那套「字符串 false」的宽松收敛。
 */
function normalizeApproximateNoticeDismissed(value) {
  return value === true
}

/**
 * 把任意输入（含缺省、脏数据）收敛成完整、合法的设置对象。
 * 未知字段一律丢弃，避免把页面草稿或旧版本字段写进权威状态。
 */
export function normalizeSettings(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  return {
    idleThresholdMinutes: normalizeIdleMinutes(source.idleThresholdMinutes),
    weekStartsOn: normalizeWeekStart(source.weekStartsOn),
    showSubagents: normalizeShowSubagents(source.showSubagents),
    durationFormat: normalizeDurationFormat(source.durationFormat),
    sidebarShowName: normalizeSidebarShowName(source.sidebarShowName),
    sidebarDuration: normalizeSidebarDuration(source.sidebarDuration),
    sidebarDotVisible: normalizeSidebarDotVisible(source.sidebarDotVisible),
    sidebarDotPosition: normalizeSidebarDotPosition(source.sidebarDotPosition),
    language: normalizeLanguage(source.language),
    approximateNoticeDismissed: normalizeApproximateNoticeDismissed(source.approximateNoticeDismissed),
  }
}

/**
 * 局部更新：只替换显式给出的字段，其余沿用当前值。
 * Client 表单一次提交全部可编辑项，Host 仍按「补丁」处理，避免漏传字段被当成重置。
 */
export function mergeSettings(current, patch) {
  const base = normalizeSettings(current)
  const incoming = patch !== null && typeof patch === 'object' ? patch : {}
  return normalizeSettings({
    idleThresholdMinutes: Object.hasOwn(incoming, 'idleThresholdMinutes')
      ? incoming.idleThresholdMinutes
      : base.idleThresholdMinutes,
    weekStartsOn: Object.hasOwn(incoming, 'weekStartsOn') ? incoming.weekStartsOn : base.weekStartsOn,
    showSubagents: Object.hasOwn(incoming, 'showSubagents') ? incoming.showSubagents : base.showSubagents,
    durationFormat: Object.hasOwn(incoming, 'durationFormat') ? incoming.durationFormat : base.durationFormat,
    sidebarShowName: Object.hasOwn(incoming, 'sidebarShowName') ? incoming.sidebarShowName : base.sidebarShowName,
    sidebarDuration: Object.hasOwn(incoming, 'sidebarDuration') ? incoming.sidebarDuration : base.sidebarDuration,
    sidebarDotVisible: Object.hasOwn(incoming, 'sidebarDotVisible') ? incoming.sidebarDotVisible : base.sidebarDotVisible,
    sidebarDotPosition: Object.hasOwn(incoming, 'sidebarDotPosition') ? incoming.sidebarDotPosition : base.sidebarDotPosition,
    language: Object.hasOwn(incoming, 'language') ? incoming.language : base.language,
    approximateNoticeDismissed: Object.hasOwn(incoming, 'approximateNoticeDismissed')
      ? incoming.approximateNoticeDismissed
      : base.approximateNoticeDismissed,
  })
}

export function settingsToIdleMs(settings) {
  return normalizeSettings(settings).idleThresholdMinutes * 60_000
}
