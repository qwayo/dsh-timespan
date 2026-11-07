import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// 通过插件原有装载入口运行实际客户端函数，使用轻量节点记录渲染结果。
async function loadClientFunctions() {
  let source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const anchor = '    const CHRONOSCOPE_CSS = `'
  assert.ok(source.includes(anchor), '客户端测试入口不存在')
  source = source.replace(anchor,
    `    window.__testFunctions = {
      renderComposition, renderSessionBreakdown, normalizeBackfill, normalizeDashboard,
      approximateNoticeVisible, renderApproximateNotice, localDayCount, averageMsPerDay, overviewHint,
      renderWorkspaceRanking, renderTrendChart, Info, renderInfo,
      overviewInfoMessages: typeof overviewInfoMessages === 'function' ? overviewInfoMessages : undefined,
      footerInfoMessages: typeof footerInfoMessages === 'function' ? footerInfoMessages : undefined,
      normalizePalette: typeof normalizePalette === 'function' ? normalizePalette : undefined,
      normalizeAppearance: typeof normalizeAppearance === 'function' ? normalizeAppearance : undefined,
      cycleAppearance: typeof cycleAppearance === 'function' ? cycleAppearance : undefined,
      resolveAppearance: typeof resolveAppearance === 'function' ? resolveAppearance : undefined,
      chronoscopeCss: typeof chronoscopeCss === 'function' ? chronoscopeCss : undefined,
    };\n${anchor}`)
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  }
  const window = { __ModuleLoader__: { load: ({ factory }) => factory(() => React) } }
  vm.runInNewContext(source, { window, crypto: { randomUUID: () => 'test-client' } })
  return window.__testFunctions
}

function textOf(node) {
  if (node == null || node === false) return ''
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node !== 'object') return String(node)
  return textOf(node.children)
}

function findNodes(node, predicate, found = []) {
  if (node == null || node === false) return found
  if (Array.isArray(node)) {
    for (const child of node) findNodes(child, predicate, found)
    return found
  }
  if (typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  findNodes(node.children, predicate, found)
  return found
}

test('客户端：混合历史与新任务时保留已知构成并单列未拆分', async () => {
  const { renderComposition, renderSessionBreakdown } = await loadClientFunctions()
  const session = {
    taskMs: 120000, modelMs: 60000, toolMs: 0, waitMs: 0, otherMs: 0,
    hasBreakdown: false,
  }
  const labels = {
    breakdownModel: '模型', breakdownTool: '工具', breakdownWait: '等待',
    breakdownOther: '其他', unknownBreakdown: '未拆分', notBroken: '未拆分',
  }
  const t = (key) => labels[key] ?? key
  const composition = textOf(renderComposition({ workspaces: [{ sessions: [session] }] }, t))
  assert.match(composition, /模型\s+50%\s+0:01:00/)
  assert.match(composition, /未拆分\s+50%\s+0:01:00/)
  const detail = textOf(renderSessionBreakdown(session, t))
  assert.match(detail, /模型 0:01:00/)
  assert.match(detail, /未拆分 0:01:00/)
})

test('客户端：缺失或未知回填状态不得伪装成未开始', async () => {
  const { normalizeBackfill } = await loadClientFunctions()
  assert.equal(normalizeBackfill(undefined).status, 'unavailable')
  assert.equal(normalizeBackfill({ status: 'new-status' }).status, 'unavailable')
  assert.equal(normalizeBackfill({ status: 'idle' }).status, 'idle')
  assert.equal(normalizeBackfill({ status: 'done' }).status, 'done')
})

test('客户端：存在近似记录时保留标记并显示说明', async () => {
  const { normalizeDashboard, approximateNoticeVisible, renderApproximateNotice } = await loadClientFunctions()
  assert.equal(normalizeDashboard({ approximate: true }).approximate, true)
  assert.equal(normalizeDashboard({ approximate: false }).approximate, false)
  assert.equal(approximateNoticeVisible({ approximate: true, workspaces: [] }), true)
  assert.equal(approximateNoticeVisible({ approximate: false, workspaces: [{ approximate: true }] }), true)
  assert.equal(approximateNoticeVisible({ approximate: false, workspaces: [{ approximate: false }] }), false)
  const labels = { approximateTag: '近似', approximateNotice: '按最后心跳或最后事件时间近似收口' }
  const notice = textOf(renderApproximateNotice((key) => labels[key] ?? key, true))
  assert.match(notice, /近似/)
  assert.match(notice, /按最后心跳或最后事件时间近似收口/)
  assert.equal(renderApproximateNotice((key) => labels[key] ?? key, false), null)
})

test('客户端：概览提示标明起算点，周/月按本地日历日显示日均', async () => {
  const { localDayCount, averageMsPerDay, overviewHint } = await loadClientFunctions()
  const from = new Date(2026, 10, 2).getTime()
  const to = new Date(2026, 10, 3, 23, 59).getTime()
  assert.equal(localDayCount({ from, to }), 2, '两天按本地日历日计算')
  assert.equal(averageMsPerDay({ activeMs: 4 * 60 * 60 * 1000, range: { from, to } }, 'activeMs'), 2 * 60 * 60 * 1000)
  const labels = {
    periodHint: '选择周期', dailyAverageActive: '日均活跃', dailyAverageTask: '日均任务',
    recordSinceBoot: '在线/活跃从插件启用时开始记录；历史只回填任务时长',
  }
  const data = { period: 'week', range: { from, to }, activeMs: 4 * 60 * 60 * 1000, taskMs: 2 * 60 * 60 * 1000 }
  const weekText = overviewHint(data, (key) => labels[key] ?? key)
  assert.match(weekText, /日均活跃 2:00:00/)
  assert.match(weekText, /日均任务 1:00:00/)
  assert.match(weekText, /从插件启用时开始记录/)
  const dayText = overviewHint({ ...data, period: 'day' }, (key) => labels[key] ?? key)
  assert.doesNotMatch(dayText, /日均/, '日视图不需要再折算日均')
  assert.match(dayText, /从插件启用时开始记录/)
})

test('客户端：配色归一化为 blue/stone/clay，旧值回落到默认蓝', async () => {
  const { normalizePalette } = await loadClientFunctions()
  assert.equal(typeof normalizePalette, 'function')
  assert.equal(normalizePalette('blue'), 'blue')
  assert.equal(normalizePalette('stone'), 'stone')
  assert.equal(normalizePalette('clay'), 'clay')
  for (const legacy of ['mono', 'green', 'warm', '', null, undefined, 'unknown']) {
    assert.equal(normalizePalette(legacy), 'blue', `旧配色 ${String(legacy)} 必须落回默认蓝`)
  }
})

test('客户端：视觉基座导出三档蓝 token、三套配色与蓝派生色阶', async () => {
  const { chronoscopeCss } = await loadClientFunctions()
  assert.equal(typeof chronoscopeCss, 'function')
  const css = chronoscopeCss()
  assert.match(css, /--cs-signal-deep\s*:\s*#133463/i)
  assert.match(css, /--cs-signal\s*:\s*#1F4E94/i)
  assert.match(css, /--cs-signal-soft\s*:\s*#79B3F9/i)
  assert.match(css, /--cs-accent\s*:\s*var\(--cs-signal/)
  assert.match(css, /--cs-live\s*:\s*var\(--cs-signal\)/)
  assert.match(css, /--cs-task\s*:\s*color-mix\(/)
  assert.match(css, /--cs-tone-faint\s*:/)
  assert.match(css, /--cs-tone-soft\s*:/)
  assert.match(css, /--cs-tone-other\s*:/)
  for (let step = 0; step <= 5; step += 1) assert.match(css, new RegExp(`--cs-heat-${step}\\s*:`))
  assert.match(css, /\.cs-page\.cs-palette-stone\s*\{/)
  assert.match(css, /\.cs-page\.cs-palette-clay\s*\{/)
  assert.match(css, /\.cs-page\.cs-palette-blue\s*\{/)
  assert.match(css, /\.cs-page\.cs-appearance-dark\s*\{/)
  assert.match(css, /\.cs-info:hover \.cs-info-tip/)
  assert.match(css, /\.cs-info:focus-within \.cs-info-tip/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /--cs-dur-tap\s*:\s*160ms/)
  assert.doesNotMatch(css, /#315878|#285642|#78947c|#96543f|#7492a8|#73797b/i, '旧的灰绿配色值不得残留')
})

test('客户端：外观三态按浅色→深色→跟随系统循环，非法值回落浅色', async () => {
  const { normalizeAppearance, cycleAppearance, resolveAppearance } = await loadClientFunctions()
  assert.equal(typeof normalizeAppearance, 'function')
  assert.equal(typeof cycleAppearance, 'function')
  assert.equal(typeof resolveAppearance, 'function')
  assert.equal(normalizeAppearance('light'), 'light')
  assert.equal(normalizeAppearance('dark'), 'dark')
  assert.equal(normalizeAppearance('system'), 'system')
  assert.equal(normalizeAppearance('auto'), 'light')
  assert.equal(normalizeAppearance(null), 'light')
  assert.equal(cycleAppearance('light'), 'dark')
  assert.equal(cycleAppearance('dark'), 'system')
  assert.equal(cycleAppearance('system'), 'light')
  assert.equal(cycleAppearance('legacy-value'), 'dark', '非法值先归一到浅色再循环')
  assert.equal(resolveAppearance('light', true), 'light')
  assert.equal(resolveAppearance('dark', false), 'dark')
  assert.equal(resolveAppearance('system', true), 'dark')
  assert.equal(resolveAppearance('system', false), 'light')
  assert.equal(resolveAppearance('unknown', true), 'light')
})

test('客户端：图表的数据状态使用三档蓝 token，不用灰或绿', async () => {
  const { renderTrendChart } = await loadClientFunctions()
  const from = new Date(2026, 10, 7, 0).getTime()
  const tree = renderTrendChart([
    { key: 'a', from, to: from + 3_600_000, activeMs: 3_600_000, taskMs: 1_800_000 },
  ], 'day', (key) => key, true)
  const fills = findNodes(tree, (node) => node.type === 'rect').map((node) => node.props.fill)
  assert.ok(fills.includes('var(--cs-live)'), '活跃柱使用 --cs-live')
  assert.ok(fills.includes('var(--cs-task)'), '任务柱使用 --cs-task')
  assert.ok(fills.every((fill) => typeof fill === 'string' && fill.startsWith('var(--cs-')), '图表只使用设计 token 着色')
})

test('客户端：ⓘ 按钮以完整说明作为 aria 名称，浮层含同一说明', async () => {
  const { Info } = await loadClientFunctions()
  const message = '实际占用：多会话重叠时段只计一次；在线时长包含挂机时间。'
  const node = Info({ message })
  assert.equal(node.type, 'span')
  const button = node.children[0]
  assert.equal(button.type, 'button')
  assert.equal(button.props.type, 'button')
  assert.equal(button.props['aria-label'], message, 'aria 名称必须是完整说明')
  assert.equal(button.props['aria-expanded'], false)
  const tip = node.children[1]
  assert.equal(tip.props.role, 'tooltip')
  assert.equal(textOf(tip), message)
  assert.equal(typeof button.props.onKeyDown, 'function', '键盘可操作')
})

test('客户端：散落小字收进 ⓘ 消息，信息不丢失', async () => {
  const { overviewInfoMessages, footerInfoMessages } = await loadClientFunctions()
  const labels = {
    periodHint: '选择周期查看明细', dailyAverageActive: '日均活跃', dailyAverageTask: '日均任务',
    recordSinceBoot: '在线/活跃从插件启用时开始记录；历史只回填任务时长',
    unionFoot: '实际占用：多会话重叠时段只计一次',
    sinceBoot: '活跃按页面可见、窗口聚焦与键鼠操作判定',
    onlineFoot: '在线时长包含挂机时间',
    localOnly: '数据仅保存在本机',
    approximateHint: '记录按最后心跳/最后事件时间近似收口，时长可能偏短',
  }
  const t = (key) => labels[key] ?? key
  const data = { period: 'day', range: { from: Date.now(), to: Date.now() }, activeMs: 0, taskMs: 0 }
  const overview = overviewInfoMessages(data, t).join('；')
  assert.match(overview, /选择周期查看明细/)
  assert.match(overview, /从插件启用时开始记录/)
  assert.match(overview, /活跃按页面可见/)
  assert.match(overview, /在线时长包含挂机时间/)
  assert.match(overview, /实际占用/)
  const footer = footerInfoMessages(t, true).join('；')
  assert.match(footer, /数据仅保存在本机/)
  assert.match(footer, /按最后心跳/)
  assert.doesNotMatch(footer, /undefined/)
})

test('客户端：任务构成与排行的口径说明也收进 ⓘ', async () => {
  const { renderComposition, renderWorkspaceRanking, Info } = await loadClientFunctions()
  const labels = {
    compositionTitle: '任务时长构成', compositionInfo: '按会话累计的任务构成',
    compositionHint: '按会话累计', noTaskComposition: '暂无任务', accumulated: '累计工时',
    workspaceRanking: '工作区任务排行', sumFoot: '累计工时：明细按会话逐条累加',
    unassigned: '未归属', taskLabel: '任务', colShare: '任务占比',
  }
  const t = (key) => labels[key] ?? key
  const messagesOf = (tree) => findNodes(tree, (node) => node.type === Info).map((node) => node.props.message)
  const composition = messagesOf(renderComposition({ workspaces: [] }, t)).join('；')
  assert.match(composition, /按会话累计的任务构成/)
  assert.match(composition, /按会话累计/)
  const ranking = messagesOf(renderWorkspaceRanking({ workspaces: [] }, t)).join('；')
  assert.match(ranking, /明细按会话逐条累加/)
  assert.match(ranking, /累计工时/)
})
