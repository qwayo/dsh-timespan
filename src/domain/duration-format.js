/**
 * 时长数字格式的唯一权威定义。
 *
 * 页面、导出与只读统计工具都使用这里的五种预设，避免各自维护一套格式化
 * 规则。预设取自设计原型 FORMATS：
 *   hms    2:48:16      时:分:秒（小时不补零）
 *   short  2h 48m       紧凑单位（有小时时省略秒，默认）
 *   zh     2 小时 48 分 中文单位（有小时时省略秒）
 *   sec    10096 秒     纯秒
 *   padded 02:48:16     补零时钟
 *
 * 毫秒向下取整；负数与非法数值按 0；跨 24 小时继续累加小时，不折算成天。
 */

export const DURATION_FORMATS = Object.freeze(['hms', 'short', 'zh', 'sec', 'padded'])

/** 首次安装与恢复初始设置使用的数字格式：紧凑单位。 */
export const DEFAULT_DURATION_FORMAT = 'short'

/** 只接受五种预设之一；缺省、旧值或脏数据一律回落到默认的紧凑单位。 */
export function normalizeDurationFormat(value) {
  return typeof value === 'string' && DURATION_FORMATS.includes(value)
    ? value
    : DEFAULT_DURATION_FORMAT
}

function secondsOf(ms) {
  const numeric = Number(ms)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.floor(numeric / 1000)
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

/**
 * 按预设格式化毫秒值。format 缺省或非法时按默认的紧凑单位输出，保证旧调用方仍可只传一个参数。
 */
export function formatDurationByPreset(ms, format = DEFAULT_DURATION_FORMAT) {
  const preset = normalizeDurationFormat(format)
  const totalSeconds = secondsOf(ms)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  switch (preset) {
    case 'short':
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`
    case 'zh':
      return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分 ${seconds} 秒`
    case 'sec':
      return `${totalSeconds} 秒`
    case 'padded':
      return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
    case 'hms':
    default:
      return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
  }
}
