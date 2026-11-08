/**
 * 票 09：统一时长格式化层的领域行为测试。
 *
 * 只通过共享格式化入口观察输出，断言取自设计原型 FORMATS 的精确字面值，
 * 不复制实现逻辑，也不依赖机器时区。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_DURATION_FORMAT,
  DURATION_FORMATS,
  formatDurationByPreset,
  normalizeDurationFormat,
} from '../src/domain/duration-format.js'

const TWO_HOURS_48_MINUTES_16_SECONDS = 2 * 3_600_000 + 48 * 60_000 + 16_000

test('五种预设：同一毫秒值按原型定义输出', () => {
  const ms = TWO_HOURS_48_MINUTES_16_SECONDS
  assert.equal(formatDurationByPreset(ms, 'hms'), '2:48:16')
  assert.equal(formatDurationByPreset(ms, 'short'), '2h 48m')
  assert.equal(formatDurationByPreset(ms, 'zh'), '2 小时 48 分')
  assert.equal(formatDurationByPreset(ms, 'sec'), '10096 秒')
  assert.equal(formatDurationByPreset(ms, 'padded'), '02:48:16')
})

test('五种预设：不足一小时时省略小时，零值给出稳定的零输出', () => {
  const ms = 48 * 60_000 + 16_000
  assert.equal(formatDurationByPreset(ms, 'hms'), '0:48:16')
  assert.equal(formatDurationByPreset(ms, 'short'), '48m 16s')
  assert.equal(formatDurationByPreset(ms, 'zh'), '48 分 16 秒')
  assert.equal(formatDurationByPreset(ms, 'sec'), '2896 秒')
  assert.equal(formatDurationByPreset(ms, 'padded'), '00:48:16')

  assert.equal(formatDurationByPreset(0, 'hms'), '0:00:00')
  assert.equal(formatDurationByPreset(0, 'short'), '0m 0s')
  assert.equal(formatDurationByPreset(0, 'zh'), '0 分 0 秒')
  assert.equal(formatDurationByPreset(0, 'sec'), '0 秒')
  assert.equal(formatDurationByPreset(0, 'padded'), '00:00:00')
})

test('跨 24 小时：继续累加小时，不折算成天', () => {
  const ms = 25 * 3_600_000 + 60_000 + 2_000
  assert.equal(formatDurationByPreset(ms, 'hms'), '25:01:02')
  assert.equal(formatDurationByPreset(ms, 'padded'), '25:01:02')
  assert.equal(formatDurationByPreset(ms, 'short'), '25h 1m')
  assert.equal(formatDurationByPreset(ms, 'zh'), '25 小时 1 分')
  assert.equal(formatDurationByPreset(ms, 'sec'), '90062 秒')
})

test('毫秒向下取整，负数与非法数值按零处理', () => {
  assert.equal(formatDurationByPreset(1_999, 'hms'), '0:00:01')
  assert.equal(formatDurationByPreset(999, 'sec'), '0 秒')
  assert.equal(formatDurationByPreset(-1_000, 'hms'), '0:00:00')
  assert.equal(formatDurationByPreset(-1_000, 'sec'), '0 秒')
  assert.equal(formatDurationByPreset(Number.NaN, 'padded'), '00:00:00')
  assert.equal(formatDurationByPreset(Number.POSITIVE_INFINITY, 'short'), '0m 0s')
})

test('格式名只认五种预设，非法值回落紧凑单位', () => {
  assert.deepEqual(DURATION_FORMATS, ['hms', 'short', 'zh', 'sec', 'padded'])
  assert.equal(DEFAULT_DURATION_FORMAT, 'short')
  for (const value of DURATION_FORMATS) assert.equal(normalizeDurationFormat(value), value)
  for (const value of ['', 'HMS', 'clock', 'zh-CN', null, undefined, 7, {}, []]) {
    assert.equal(normalizeDurationFormat(value), 'short', `非法格式 ${String(value)} 必须回落紧凑单位`)
  }
  assert.equal(formatDurationByPreset(3_600_000, 'unknown'), '1h 0m')
})
