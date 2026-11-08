import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// 轻量 React 替身：只记录元素树，并为组件测试提供最小的状态/引用 hook 运行环境。
function createTestReact() {
  let cursor = 0
  const hooks = []
  return {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      return [hooks[index], (next) => {
        hooks[index] = typeof next === 'function' ? next(hooks[index]) : next
      }]
    },
    useEffect() {
      cursor += 1
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = { current: initial }
      return hooks[index]
    },
    render(component, props) {
      cursor = 0
      const tree = component(props)
      cursor = 0
      return tree
    },
  }
}

// 通过插件原有装载入口运行实际客户端函数，使用轻量节点记录渲染结果。
// windowExtras 只用于给隔离上下文补 localStorage / matchMedia 等浏览器表面。
async function loadClientFunctions(windowExtras = {}) {
  let source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const anchor = '    const CHRONOSCOPE_CSS = `'
  assert.ok(source.includes(anchor), '客户端测试入口不存在')
  source = source.replace(anchor,
    `    window.__testFunctions = {
      renderComposition, renderSessionBreakdown, renderSessionRow, renderWorkspaceRow,
      normalizeBackfill, normalizeDashboard, approximateNoticeVisible, renderApproximateNotice,
      localDayCount, averageMsPerDay, overviewHint, clampTipPosition, renderHoverTip,
      buildTrendTip, buildCompositionTip, renderTrendChart, HoverTip, useHoverTip,
      renderBackfillBanner, renderBackfillNotices, isBackfillUnread,
      Select, isSelectOutside, createSelectOutsideHandler,
      renderWorkspaceRanking, Info, renderInfo,
      overviewInfoMessages: typeof overviewInfoMessages === 'function' ? overviewInfoMessages : undefined,
      footerInfoMessages: typeof footerInfoMessages === 'function' ? footerInfoMessages : undefined,
      normalizePalette: typeof normalizePalette === 'function' ? normalizePalette : undefined,
      normalizeAppearance: typeof normalizeAppearance === 'function' ? normalizeAppearance : undefined,
      cycleAppearance: typeof cycleAppearance === 'function' ? cycleAppearance : undefined,
      resolveAppearance: typeof resolveAppearance === 'function' ? resolveAppearance : undefined,
      formatDuration: typeof formatDuration === 'function' ? formatDuration : undefined,
      normalizeDurationFormat: typeof normalizeDurationFormat === 'function' ? normalizeDurationFormat : undefined,
      settingsDraft: typeof settingsDraft === 'function' ? settingsDraft : undefined,
      renderDurationFormatSection: typeof renderDurationFormatSection === 'function' ? renderDurationFormatSection : undefined,
      subscribeDurationFormatPreview: typeof subscribeDurationFormatPreview === 'function' ? subscribeDurationFormatPreview : undefined,
      notifyDurationFormatPreview: typeof notifyDurationFormatPreview === 'function' ? notifyDurationFormatPreview : undefined,
      chronoscopeCss: typeof chronoscopeCss === 'function' ? chronoscopeCss : undefined,
      chronoscopeSidebarCss: typeof chronoscopeSidebarCss === 'function' ? chronoscopeSidebarCss : undefined,
      sidebarRingSegments: typeof sidebarRingSegments === 'function' ? sidebarRingSegments : undefined,
      sidebarRingGradient: typeof sidebarRingGradient === 'function' ? sidebarRingGradient : undefined,
      sidebarThemeClass: typeof sidebarThemeClass === 'function' ? sidebarThemeClass : undefined,
      readStoredTheme: typeof readStoredTheme === 'function' ? readStoredTheme : undefined,
      subscribeThemeChanged: typeof subscribeThemeChanged === 'function' ? subscribeThemeChanged : undefined,
      notifyThemeChanged: typeof notifyThemeChanged === 'function' ? notifyThemeChanged : undefined,
      renderSidebarEntry: typeof renderSidebarEntry === 'function' ? renderSidebarEntry : undefined,
      buildSidebarTip: typeof buildSidebarTip === 'function' ? buildSidebarTip : undefined,
      settingsDraft: typeof settingsDraft === 'function' ? settingsDraft : undefined,
      settingsPayload: typeof settingsPayload === 'function' ? settingsPayload : undefined,
      createSettingsSection: typeof createSettingsSection === 'function' ? createSettingsSection : undefined,
      normalizeView: typeof normalizeView === 'function' ? normalizeView : undefined,
      nextTabIndex: typeof nextTabIndex === 'function' ? nextTabIndex : undefined,
      viewLabels: typeof viewLabels === 'function' ? viewLabels : undefined,
      TabNav: typeof TabNav === 'function' ? TabNav : undefined,
      renderOverviewView: typeof renderOverviewView === 'function' ? renderOverviewView : undefined,
      renderTrendView: typeof renderTrendView === 'function' ? renderTrendView : undefined,
      renderDetailsView: typeof renderDetailsView === 'function' ? renderDetailsView : undefined,
      renderSettingsView: typeof renderSettingsView === 'function' ? renderSettingsView : undefined,
      renderRecentSessions: typeof renderRecentSessions === 'function' ? renderRecentSessions : undefined,
      flattenRecentSessions: typeof flattenRecentSessions === 'function' ? flattenRecentSessions : undefined,
      filterWorkspaces: typeof filterWorkspaces === 'function' ? filterWorkspaces : undefined,
      viewTransitionDelay: typeof viewTransitionDelay === 'function' ? viewTransitionDelay : undefined,
      VIEW_ENTER_MS: typeof VIEW_ENTER_MS === 'number' ? VIEW_ENTER_MS : undefined,
      VIEW_EXIT_MS: typeof VIEW_EXIT_MS === 'number' ? VIEW_EXIT_MS : undefined,
      prefersReducedMotion: typeof prefersReducedMotion === 'function' ? prefersReducedMotion : undefined,
      normalizeFocus: typeof normalizeFocus === 'function' ? normalizeFocus : undefined,
      readStoredFocus: typeof readStoredFocus === 'function' ? readStoredFocus : undefined,
      writeStoredFocus: typeof writeStoredFocus === 'function' ? writeStoredFocus : undefined,
      focusTransitionMs: typeof focusTransitionMs === 'function' ? focusTransitionMs : undefined,
      FOCUS_KEY: typeof FOCUS_KEY === 'string' ? FOCUS_KEY : undefined,
      renderZoomButton: typeof renderZoomButton === 'function' ? renderZoomButton : undefined,
      renderHeroCard: typeof renderHeroCard === 'function' ? renderHeroCard : undefined,
      renderHeroFocusPage: typeof renderHeroFocusPage === 'function' ? renderHeroFocusPage : undefined,
      subtractCalendarMonths: typeof subtractCalendarMonths === 'function' ? subtractCalendarMonths : undefined,
      defaultHeatRange: typeof defaultHeatRange === 'function' ? defaultHeatRange : undefined,
      heatLevel: typeof heatLevel === 'function' ? heatLevel : undefined,
      buildHeatGrid: typeof buildHeatGrid === 'function' ? buildHeatGrid : undefined,
      buildHeatTip: typeof buildHeatTip === 'function' ? buildHeatTip : undefined,
      summarizeHeatDays: typeof summarizeHeatDays === 'function' ? summarizeHeatDays : undefined,
      summarizeHeatFocus: typeof summarizeHeatFocus === 'function' ? summarizeHeatFocus : undefined,
      renderDailyHeatmap: typeof renderDailyHeatmap === 'function' ? renderDailyHeatmap : undefined,
      renderHeatmapFocusPage: typeof renderHeatmapFocusPage === 'function' ? renderHeatmapFocusPage : undefined,
      useDailySeries: typeof useDailySeries === 'function' ? useDailySeries : undefined,
      HEAT_DEFAULT_RANGE: typeof HEAT_DEFAULT_RANGE === 'string' ? HEAT_DEFAULT_RANGE : undefined,
      HEAT_RANGE_OPTIONS: typeof HEAT_RANGE_OPTIONS !== 'undefined' ? HEAT_RANGE_OPTIONS : undefined,
      HEAT_MONTH_ABBR: typeof HEAT_MONTH_ABBR !== 'undefined' ? HEAT_MONTH_ABBR : undefined,
      resolveHeatRange: typeof resolveHeatRange === 'function' ? resolveHeatRange : undefined,
      heatRangeLabel: typeof heatRangeLabel === 'function' ? heatRangeLabel : undefined,
      heatLayoutFor: typeof heatLayoutFor === 'function' ? heatLayoutFor : undefined,
      buildMonthGrid: typeof buildMonthGrid === 'function' ? buildMonthGrid : undefined,
      buildYearMatrix: typeof buildYearMatrix === 'function' ? buildYearMatrix : undefined,
      renderHeatRangePicker: typeof renderHeatRangePicker === 'function' ? renderHeatRangePicker : undefined,
      renderTrendCard: typeof renderTrendCard === 'function' ? renderTrendCard : undefined,
      trendFocusStats: typeof trendFocusStats === 'function' ? trendFocusStats : undefined,
      renderTrendFocusPage: typeof renderTrendFocusPage === 'function' ? renderTrendFocusPage : undefined,
      TREND_FOCUS_HEIGHT: typeof TREND_FOCUS_HEIGHT === 'number' ? TREND_FOCUS_HEIGHT : undefined,
    };\n${anchor}`)
  const React = createTestReact()
  const window = { __ModuleLoader__: { load: ({ factory }) => factory(() => React) }, ...windowExtras }
  vm.runInNewContext(source, { window, crypto: { randomUUID: () => 'test-client' } })
  return { ...window.__testFunctions, React }
}

function walkTree(node, visit) {
  if (node == null || node === false) return
  if (Array.isArray(node)) {
    for (const child of node) walkTree(child, visit)
    return
  }
  if (typeof node !== 'object') return
  visit(node)
  walkTree(node.children, visit)
}

function findAllByClass(node, className) {
  const matches = []
  walkTree(node, (item) => {
    const classes = typeof item.props?.className === 'string' ? item.props.className.split(/\s+/) : []
    if (classes.includes(className)) matches.push(item)
  })
  return matches
}

function findByClass(node, className) {
  return findAllByClass(node, className)[0]
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

function findAll(node, predicate) {
  const found = []
  const visit = (value) => {
    if (value == null || value === false) return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== 'object') return
    if (predicate(value)) found.push(value)
    visit(value.children)
  }
  visit(node)
  return found
}

function hasClass(node, name) {
  return String(node?.props?.className ?? '').split(/\s+/).includes(name)
}

async function loadClientCss() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('const CHRONOSCOPE_CSS = `')
  assert.ok(start >= 0, '客户端样式入口不存在')
  const end = source.indexOf('\n    `', start)
  assert.ok(end > start, '客户端样式结束标记不存在')
  return source.slice(start, end)
}

/** 汇总同一选择器在样式表中的全部声明，避免被后写的覆盖块漏检。 */
function declarationsFor(css, selector) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g')
  return [...css.matchAll(pattern)].map((match) => match[1]).join('\n')
}

/** 取出指定 max-width 媒体查询里的全部规则，按大括号层级切分。 */
function mediaBlocks(css, maxWidth) {
  const pattern = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)\\s*\\{`, 'g')
  const blocks = []
  let match
  while ((match = pattern.exec(css)) !== null) {
    let depth = 1
    let index = pattern.lastIndex
    while (index < css.length && depth > 0) {
      if (css[index] === '{') depth += 1
      else if (css[index] === '}') depth -= 1
      index += 1
    }
    blocks.push(css.slice(pattern.lastIndex, index - 1))
    pattern.lastIndex = index
  }
  return blocks.join('\n')
}

function allOf(node, predicate, out = []) {
  if (node == null || node === false) return out
  if (Array.isArray(node)) {
    for (const child of node) allOf(child, predicate, out)
    return out
  }
  if (typeof node !== 'object' || node.type === undefined) return out
  if (predicate(node)) out.push(node)
  allOf(node.children, predicate, out)
  return out
}

function byClass(name) {
  return (node) => String(node.props?.className ?? '').split(/\s+/).includes(name)
}

function fakeEvent(rect = { left: 100, top: 80, width: 24, height: 100, right: 124, bottom: 180 }) {
  return {
    currentTarget: { getBoundingClientRect: () => rect },
    preventDefault() {},
  }
}

test('客户端：柱图每个时段分组有可聚焦命中区并浮出活跃与任务', async () => {
  const { renderTrendChart } = await loadClientFunctions()
  const labels = { activeLabel: '活跃', taskLabel: '任务' }
  const t = (key) => labels[key] ?? key
  const trend = [
    { key: 'h0', from: new Date(2026, 10, 7, 0).getTime(), to: new Date(2026, 10, 7, 1).getTime(), activeMs: 3600000, taskMs: 1800000 },
    { key: 'h1', from: new Date(2026, 10, 7, 1).getTime(), to: new Date(2026, 10, 7, 2).getTime(), activeMs: 0, taskMs: 0 },
  ]
  const events = []
  const chart = renderTrendChart(trend, 'day', t, false, null, {
    onHover: (tip, event) => events.push({ tip, event }),
    onLeave: () => events.push({ leave: true }),
  })
  const groups = allOf(chart, byClass('cs-bar-group'))
  assert.equal(groups.length, 2)
  for (const group of groups) {
    assert.equal(group.props.tabIndex, 0, '每个分组可被 Tab 聚焦')
    assert.equal(group.props.role, 'button')
    assert.equal(typeof group.props.onFocus, 'function')
    assert.equal(typeof group.props.onKeyDown, 'function')
  }
  assert.match(groups[0].props['aria-label'], /00:00 · 活跃 1:00:00 · 任务 0:30:00/)
  assert.equal(allOf(chart, (node) => node.type === 'title').length, 0, '不再只靠 SVG title 展示数值')

  const hotChart = renderTrendChart(trend, 'day', t, false, { kind: 'bucket', key: 'h1' }, {})
  const hotGroups = allOf(hotChart, byClass('cs-bar-group'))
  assert.doesNotMatch(hotGroups[0].props.className, /is-hot/)
  assert.match(hotGroups[1].props.className, /is-hot/, '悬停分组整体放大')

  groups[0].props.onFocus(fakeEvent())
  assert.equal(events[0].tip.title, '00:00')
  assert.equal(events[0].tip.rows[0].label, '活跃')
  assert.equal(events[0].tip.rows[0].value, '1:00:00')
  assert.equal(events[0].tip.rows[1].label, '任务')
  assert.equal(events[0].tip.rows[1].value, '0:30:00')

  groups[0].props.onKeyDown({ key: 'Enter', currentTarget: { getBoundingClientRect: () => ({}) }, preventDefault() {} })
  assert.equal(events.length, 2, 'Enter 同样触发浮层')

  const focused = []
  const fakeGroups = [{ focus() { focused.push(0) } }, { focus() { focused.push(1) } }]
  fakeGroups[0].parentElement = { querySelectorAll: () => fakeGroups }
  groups[0].props.onKeyDown({ key: 'ArrowRight', currentTarget: fakeGroups[0], preventDefault() {} })
  assert.deepEqual(focused, [1], '方向键在分组之间移动焦点')
})

test('客户端：圆环扇区与右侧列表双向联动并浮出占比与时长', async () => {
  const { renderComposition } = await loadClientFunctions()
  const labels = {
    breakdownModel: '模型', breakdownTool: '工具', breakdownWait: '等待',
    breakdownOther: '其他', unknownBreakdown: '未拆分', notBroken: '未拆分',
    shareLabel: '占比', durationLabel: '时长',
  }
  const t = (key) => labels[key] ?? key
  const data = { workspaces: [{ sessions: [{ taskMs: 120000, modelMs: 60000, toolMs: 60000, waitMs: 0, otherMs: 0, hasBreakdown: true }] }] }
  const events = []
  const tree = renderComposition(data, t, { kind: 'composition', key: 'model' }, {
    onHover: (tip, event) => events.push({ tip, event }),
    onLeave: () => events.push({ leave: true }),
  })
  const donut = allOf(tree, byClass('cs-donut'))[0]
  assert.match(donut.props.className, /has-hot/, '有高亮段时其它段淡出')
  const segments = allOf(tree, byClass('cs-donut-seg'))
  assert.equal(segments.length, 2)
  for (const segment of segments) {
    assert.equal(segment.props.tabIndex, 0, '扇区可被 Tab 聚焦')
    assert.equal(segment.props.role, 'button')
    assert.equal(typeof segment.props.onFocus, 'function')
    assert.match(segment.props['aria-label'], /模型|工具/)
  }
  const modelSegment = segments.find((segment) => String(segment.props.className).includes('is-model'))
  const toolSegment = segments.find((segment) => String(segment.props.className).includes('is-tool'))
  assert.match(modelSegment.props.className, /is-hot/)
  assert.doesNotMatch(toolSegment.props.className, /is-hot/)

  const rows = allOf(tree, byClass('cs-composition-row'))
  assert.equal(rows.length, 2)
  const modelRow = rows.find((row) => textOf(row).includes('模型'))
  assert.equal(modelRow.props.tabIndex, 0, '列表项可被 Tab 聚焦')
  assert.match(modelRow.props.className, /is-hot/, '列表项与扇区联动高亮')
  assert.equal(typeof modelRow.props.onMouseEnter, 'function')
  assert.equal(typeof modelRow.props.onFocus, 'function')

  modelRow.props.onMouseEnter(fakeEvent())
  assert.equal(events[0].tip.title, '模型')
  assert.equal(events[0].tip.rows[0].label, '占比')
  assert.equal(events[0].tip.rows[0].value, '50%')
  assert.equal(events[0].tip.rows[1].label, '时长')
  assert.equal(events[0].tip.rows[1].value, '0:01:00')

  modelSegment.props.onFocus(fakeEvent())
  assert.equal(events[1].tip.title, '模型', '从扇区聚焦也能浮出同一份数值')
})

test('客户端：统一浮层按视口夹取位置并渲染标题与数值', async () => {
  const { clampTipPosition, buildTrendTip, renderHoverTip } = await loadClientFunctions()
  const anchor = { left: 780, top: 10, width: 20, height: 20, right: 800, bottom: 30 }
  const position = clampTipPosition(anchor, { width: 200, height: 60 }, { width: 800, height: 600 })
  assert.equal(position.left, 592, '右侧贴边的浮层向左夹取')
  assert.equal(position.top, 40, '顶部空间不足时翻到锚点下方')
  const leftEdge = clampTipPosition({ left: 2, top: 300, width: 20, height: 20, right: 22, bottom: 320 }, { width: 200, height: 60 }, { width: 800, height: 600 })
  assert.equal(leftEdge.left, 8, '左侧贴边的浮层向右夹取')
  assert.equal(leftEdge.top, 230, '顶部空间充足时浮在锚点上方')
  const labels = { activeLabel: '活跃', taskLabel: '任务' }
  const tip = buildTrendTip(
    { key: 'b1', from: new Date(2026, 10, 7, 9).getTime(), to: new Date(2026, 10, 7, 10).getTime(), activeMs: 3600000, taskMs: 1800000 },
    'day',
    (key) => labels[key] ?? key,
    false,
  )
  const rendered = renderHoverTip(tip, { left: 40, top: 50 })
  assert.equal(rendered.props.role, 'tooltip')
  assert.match(textOf(rendered), /09:00 活跃 1:00:00 任务 0:30:00/)
})

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

test('客户端：自定义下拉显示选中项并打勾', async () => {
  const { Select, React } = await loadClientFunctions()
  const tree = React.render(Select, {
    value: 'dark',
    options: [
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' },
    ],
    ariaLabel: '外观',
    onChange: () => {},
  })
  const trigger = findByClass(tree, 'cs-select-btn')
  assert.equal(trigger.props['aria-label'], '外观')
  assert.equal(textOf(findByClass(tree, 'cs-select-val')), '深色')
  const options = findAllByClass(tree, 'cs-opt')
  assert.equal(options.length, 2)
  assert.equal(options[0].props['aria-selected'], false)
  assert.equal(options[1].props['aria-selected'], true)
  assert.match(options[1].props.className, /is-on/)
  assert.match(textOf(options[1]), /✓/)
})

test('客户端：自定义下拉接受字符串选项并保留字符串值', async () => {
  const { Select, React } = await loadClientFunctions()
  const changes = []
  let tree = React.render(Select, {
    value: '5',
    options: ['1', '2', '5'],
    ariaLabel: '空闲阈值',
    onChange: (value) => changes.push(value),
  })
  assert.equal(textOf(findByClass(tree, 'cs-select-val')), '5')
  findByClass(tree, 'cs-select-btn').props.onClick()
  tree = React.render(Select, {
    value: '5',
    options: ['1', '2', '5'],
    ariaLabel: '空闲阈值',
    onChange: (value) => changes.push(value),
  })
  findAllByClass(tree, 'cs-opt')[1].props.onClick()
  assert.deepEqual(changes, ['2'])
  assert.equal(typeof changes[0], 'string')
})

test('客户端：自定义下拉开合由组件状态驱动并回调选中值', async () => {
  const { Select, React } = await loadClientFunctions()
  const changes = []
  const props = {
    value: 'light',
    options: [
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' },
    ],
    ariaLabel: '外观',
    onChange: (value) => changes.push(value),
  }
  let tree = React.render(Select, props)
  assert.equal(findByClass(tree, 'cs-select-btn').props['aria-expanded'], false)
  assert.equal(findByClass(tree, 'cs-select-menu').props.hidden, true)

  findByClass(tree, 'cs-select-btn').props.onClick()
  tree = React.render(Select, props)
  assert.equal(findByClass(tree, 'cs-select-btn').props['aria-expanded'], true)
  assert.equal(findByClass(tree, 'cs-select-menu').props.hidden, false)

  findAllByClass(tree, 'cs-opt')[1].props.onClick()
  tree = React.render(Select, props)
  assert.deepEqual(changes, ['dark'])
  assert.equal(findByClass(tree, 'cs-select-btn').props['aria-expanded'], false)
  assert.equal(findByClass(tree, 'cs-select-menu').props.hidden, true)
})

test('客户端：自定义下拉支持键盘开合、移动与选择', async () => {
  const { Select, React } = await loadClientFunctions()
  const changes = []
  const props = {
    value: 'light',
    options: [
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' },
      { value: 'system', label: '跟随系统' },
    ],
    ariaLabel: '外观',
    onChange: (value) => changes.push(value),
  }
  let tree = React.render(Select, props)
  const trigger = () => findByClass(tree, 'cs-select-btn')
  const options = () => findAllByClass(tree, 'cs-opt')
  const press = (key) => {
    let prevented = false
    trigger().props.onKeyDown({ key, preventDefault: () => { prevented = true } })
    tree = React.render(Select, props)
    assert.equal(prevented, true, `${key} 应阻止浏览器默认行为`)
  }

  assert.equal(trigger().props.tabIndex, undefined, '触发器是原生按钮，可通过 Tab 聚焦')
  press(' ')
  assert.equal(trigger().props['aria-expanded'], true)
  assert.match(options()[0].props.className, /is-active/)

  press('ArrowDown')
  assert.match(options()[1].props.className, /is-active/)
  press('Enter')
  assert.deepEqual(changes, ['dark'])
  assert.equal(trigger().props['aria-expanded'], false)

  press('ArrowDown')
  press('End')
  assert.match(options()[2].props.className, /is-active/)
  press('Home')
  assert.match(options()[0].props.className, /is-active/)
  press('Escape')
  assert.equal(trigger().props['aria-expanded'], false)
})

test('客户端：自定义下拉点击外部关闭', async () => {
  const { isSelectOutside, createSelectOutsideHandler } = await loadClientFunctions()
  const inside = { id: 'inside' }
  const outside = { id: 'outside' }
  const root = { contains: (target) => target === inside }
  assert.equal(isSelectOutside(root, inside), false)
  assert.equal(isSelectOutside(root, outside), true)
  assert.equal(isSelectOutside(null, outside), true)

  let closed = 0
  const handler = createSelectOutsideHandler({ current: root }, () => { closed += 1 })
  handler({ target: inside })
  assert.equal(closed, 0, '点击组件内部不关闭')
  handler({ target: outside })
  assert.equal(closed, 1, '点击组件外部关闭')
})

test('客户端：范围菜单向上弹出并两列展示全部选项', async () => {
  const { Select, React } = await loadClientFunctions()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const options = [
    { value: '3m', label: '最近 3 个月', span: 2 },
    { value: '6m', label: '近半年', span: 2 },
    { value: 'year', label: '全年', span: 2 },
    ...months.map((label, index) => ({ value: String(index + 1), label })),
  ]
  const tree = React.render(Select, {
    value: '3m',
    options,
    menuVariant: 'grid',
    placement: 'top',
    ariaLabel: '热力图范围',
    onChange: () => {},
  })
  assert.match(findByClass(tree, 'cs-select').props.className, /is-top/)
  assert.match(findByClass(tree, 'cs-select-menu').props.className, /is-grid/)
  const rendered = findAllByClass(tree, 'cs-opt')
  assert.equal(rendered.length, 15, '15 个范围选项一次全部渲染')
  assert.match(rendered[0].props.className, /is-span-2/)
  assert.match(rendered[2].props.className, /is-span-2/)
  assert.doesNotMatch(rendered[3].props.className, /is-span-2/)
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
  // ⓘ 改为点击展开的 popover：浮层 fixed 定位，显示规则只有 .cs-info.is-open .cs-info-tip。
  assert.match(css, /\.cs-info-tip\s*\{[^}]*position:\s*fixed/, '说明浮层用 fixed 定位，脱离卡片裁切')
  assert.match(css, /\.cs-info-tip\s*\{[^}]*z-index:\s*90/, '说明浮层层级为 90')
  assert.match(css, /\.cs-info\.is-open \.cs-info-tip\s*\{[^}]*visibility:\s*visible/, '仅 is-open 展开态显示浮层')
  assert.doesNotMatch(css, /\.cs-info:hover \.cs-info-tip/, '不再用 hover 触发说明浮层')
  assert.doesNotMatch(css, /\.cs-info:focus-within \.cs-info-tip/, '不再用 focus-within 触发说明浮层')
  assert.doesNotMatch(css, /\.cs-info\.is-dismissed/, '不再有 dismissed 状态')
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
  const fills = findNodes(tree, (node) => node.type === 'rect' && String(node.props.className ?? '').split(/\s+/).includes('cs-bar')).map((node) => node.props.fill)
  assert.ok(fills.includes('var(--cs-live)'), '活跃柱使用 --cs-live')
  assert.ok(fills.includes('var(--cs-task)'), '任务柱使用 --cs-task')
  assert.ok(fills.every((fill) => typeof fill === 'string' && fill.startsWith('var(--cs-')), '图表只使用设计 token 着色')
})

test('客户端：ⓘ 按钮以完整说明作为 aria 名称，点击展开 popover', async () => {
  const { Info, React } = await loadClientFunctions()
  const message = '实际占用：多会话重叠时段只计一次；在线时长包含挂机时间。'
  let tree = React.render(Info, { message })
  const buttonOf = (current) => findAll(current, (node) => node.type === 'button')[0]
  let button = buttonOf(tree)
  assert.equal(findByClass(tree, 'cs-info').type, 'span')
  assert.equal(button.type, 'button')
  assert.equal(button.props.type, 'button')
  assert.equal(button.props['aria-label'], message, 'aria 名称必须是完整说明')
  assert.equal(button.props['aria-expanded'], false)
  const tip = findByClass(tree, 'cs-info-tip')
  assert.equal(tip.props.role, 'tooltip')
  assert.equal(textOf(tip), message)
  assert.equal(typeof tip.props.style.left, 'string', '浮层用内联 left 定位')
  assert.equal(typeof tip.props.style.top, 'string', '浮层用内联 top 定位（clampTipPosition 计算）')
  assert.equal(typeof button.props.onClick, 'function', '点击可展开说明')
  assert.equal(button.props.onFocus, undefined, '不再用聚焦打开')
  assert.equal(button.props.onBlur, undefined, '不再用失焦关闭')
  assert.equal(button.props.onKeyDown, undefined, '不再有 dismissed 键盘关闭')

  button.props.onClick()
  tree = React.render(Info, { message })
  button = buttonOf(tree)
  assert.equal(button.props['aria-expanded'], true, '点击后 aria-expanded 为 true')
  assert.match(findByClass(tree, 'cs-info').props.className, /is-open/, '点击后展开 popover')
  assert.doesNotMatch(findByClass(tree, 'cs-info').props.className, /is-dismissed/, '不再有 dismissed 状态')

  button.props.onClick()
  tree = React.render(Info, { message })
  button = buttonOf(tree)
  assert.equal(button.props['aria-expanded'], false, '再次点击收起')
  assert.doesNotMatch(findByClass(tree, 'cs-info').props.className, /is-open/)
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

test('客户端：明细标题保留完整文本并走统一浮层', async () => {
  const { renderWorkspaceRow, renderSessionRow } = await loadClientFunctions()
  const labels = {
    unassigned: '未归属', sessionsUnit: '个会话', expand: '展开', collapse: '收起',
    unknownSession: '未命名会话', notBroken: '未拆分',
  }
  const t = (key) => labels[key] ?? key
  const now = new Date(2026, 10, 7, 12, 0, 0).getTime()
  const shown = []
  const hoverTip = {
    tip: null,
    show: (content) => shown.push(content),
    hide: () => shown.push(null),
  }
  const longWorkspace = '这是一个特别长的工作区名称，长到必须省略而不是把卡片撑破'
  const workspace = renderWorkspaceRow({
    key: 'workspace-1',
    workspaceTitle: longWorkspace,
    activeMs: 3_600_000,
    taskMs: 600_000,
    share: 0.5,
    lastActivityAt: now - 60_000,
    sessions: [],
  }, false, () => {}, t, now, {}, 'hms', hoverTip)
  const workspaceTitle = findAll(workspace, (node) => hasClass(node, 'cs-name-text'))[0]
  assert.ok(workspaceTitle, '工作区标题节点存在')
  assert.equal(workspaceTitle.props.title, undefined, '不再使用原生 title 属性')
  assert.equal(typeof workspaceTitle.props.onMouseEnter, 'function', '悬停改走统一 HoverTip')
  assert.equal(textOf(workspaceTitle), longWorkspace, '工作区标题文本未被截断')
  workspaceTitle.props.onMouseEnter({ currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }) } })
  assert.equal(shown.at(-1)?.title, longWorkspace, '浮层展示完整工作区名称')

  const longSession = '这是一个特别长的会话标题，长到必须省略而不是被裁切'
  const session = renderSessionRow({
    sessionId: 'session-1',
    sessionTitle: longSession,
    taskRunning: false,
    approximate: false,
    activeMs: 3_600_000,
    taskMs: 600_000,
    taskCount: 2,
    lastActivityAt: now - 60_000,
    modelMs: 600_000,
    toolMs: 0,
    waitMs: 0,
    otherMs: 0,
  }, t, now, [], 'hms', hoverTip)
  const sessionTitle = findAll(session, (node) => hasClass(node, 'cs-session-title'))[0]
  assert.ok(sessionTitle, '会话标题节点存在')
  assert.equal(sessionTitle.props.title, undefined, '会话标题不再使用原生 title 属性')
  assert.equal(typeof sessionTitle.props.onMouseEnter, 'function', '会话标题悬停走统一 HoverTip')
  assert.equal(textOf(sessionTitle), longSession, '会话标题文本未被截断')
  sessionTitle.props.onMouseEnter({ currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }) } })
  assert.equal(shown.at(-1)?.title, longSession, '浮层展示完整会话名称')
})

test('客户端：排行、近似标签与子代理说明一律收进统一浮层', async () => {
  const { renderWorkspaceRanking, renderSessionRow } = await loadClientFunctions()
  const labels = {
    unassigned: '未归属', accumulated: '累计', sumFoot: '合计', workspaceRanking: '工作区排行',
    taskLabel: '任务', colShare: '占比', noTaskComposition: '暂无', approximateTag: '近似',
    approximateHint: '按最后心跳估算', subagentDetail: '子代理', subagentDetailHint: '{count} 个 · {duration}',
    unknownSession: '未命名会话', notBroken: '未拆分', activeLabel: '活跃', taskCountUnit: '个任务',
  }
  const t = (key) => labels[key] ?? key
  const shown = []
  const hoverTip = { tip: null, show: (content) => shown.push(content), hide: () => {} }
  const event = { currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }) } }
  const ranking = renderWorkspaceRanking({ workspaces: [
    { key: 'w1', workspaceTitle: '工作区甲', taskMs: 3_600_000, share: 0.6 },
  ] }, t, 'hms', hoverTip)
  const rankRow = findAll(ranking, (node) => hasClass(node, 'cs-ranking-row'))[0]
  assert.ok(rankRow, '排行行存在')
  assert.equal(rankRow.props.title, undefined, '排行行不再使用原生 title')
  rankRow.props.onMouseEnter(event)
  assert.equal(shown.at(-1)?.title, '工作区甲', '浮层标题为工作区名')
  assert.equal(shown.at(-1)?.rows.length, 2, '浮层带任务时长与占比两行')

  const session = renderSessionRow({
    sessionId: 's1', sessionTitle: '会话甲', taskRunning: false, approximate: true,
    activeMs: 0, taskMs: 0, taskCount: 0, lastActivityAt: Date.now(),
    modelMs: 0, toolMs: 0, waitMs: 0, otherMs: 0,
  }, t, Date.now(), [{ sessionId: 'a1', sessionTitle: '子任务甲', durationMs: 1000 }], 'hms', hoverTip)
  const withTitle = findAll(session, (node) => typeof node?.type === 'string' && node.props && 'title' in node.props)
  assert.equal(withTitle.length, 0, '会话行内没有任何原生 title 属性')
  const chip = findAll(session, (node) => hasClass(node, 'cs-chip'))[0]
  assert.ok(chip, '近似标签存在')
  chip.props.onMouseEnter(event)
  assert.equal(shown.at(-1)?.title, '按最后心跳估算', '近似说明走统一浮层')
  const subagents = findAll(session, (node) => hasClass(node, 'cs-session-subagents'))[0]
  assert.ok(subagents, '子代理说明存在')
  subagents.props.onMouseEnter(event)
  assert.equal(shown.at(-1)?.title, '子任务甲', '子代理名称列表走统一浮层')
})

test('客户端：明细行把活跃与任务数值暴露为带标签的单元', async () => {
  const { renderWorkspaceRow, renderSessionRow } = await loadClientFunctions()
  const labels = {
    unassigned: '未归属', sessionsUnit: '个会话', expand: '展开', collapse: '收起',
    colActive: '活跃', colTask: '任务', colShare: '任务占比', colLast: '最近活动',
    activeLabel: '活跃', taskLabel: '任务', unknownSession: '未命名会话', notBroken: '未拆分',
    taskCountUnit: '个任务',
  }
  const t = (key) => labels[key] ?? key
  const now = new Date(2026, 10, 7, 12, 0, 0).getTime()
  const workspace = renderWorkspaceRow({
    key: 'workspace-1',
    workspaceTitle: '工作区一',
    activeMs: 3_600_000,
    taskMs: 600_000,
    share: 0.5,
    lastActivityAt: now - 60_000,
    sessions: [],
  }, false, () => {}, t, now, {})
  const workspaceCells = findAll(workspace, (node) => hasClass(node, 'cs-active') || hasClass(node, 'cs-task'))
  assert.deepEqual(
    workspaceCells.map((node) => [node.props['data-label'], textOf(node).trim()]),
    [['活跃', '1:00:00'], ['任务', '0:10:00']],
    '工作区行的活跃与任务各有带标签的数值单元',
  )

  const session = renderSessionRow({
    sessionId: 'session-1',
    sessionTitle: '会话一',
    taskRunning: false,
    approximate: false,
    activeMs: 3_600_000,
    taskMs: 600_000,
    taskCount: 2,
    lastActivityAt: now - 60_000,
    modelMs: 600_000,
    toolMs: 0,
    waitMs: 0,
    otherMs: 0,
  }, t, now, [])
  const sessionStats = findAll(session, (node) => hasClass(node, 'cs-session-stat'))
  assert.deepEqual(
    sessionStats.map((node) => [node.props['data-label'], textOf(node).trim()]),
    [['活跃', '活跃 1:00:00'], ['任务', '任务 0:10:00'], [undefined, '2 个任务']],
    '会话行的活跃与任务数值带标签，任务次数保持原样',
  )
})

test('客户端：明细样式补右内边距并在 390px 折叠带标签数值', async () => {
  const css = await loadClientCss()
  assert.match(declarationsFor(css, '.cs-table-card'), /padding-right:\s*24px/, '明细容器右侧留出内边距')
  assert.match(declarationsFor(css, '.cs-sessions'), /padding-right:\s*24px/, '会话容器不贴右边缘')
  const last = declarationsFor(css, '.cs-last')
  assert.match(last, /text-align:\s*right/, '相对时间与数字列右对齐')
  assert.match(last, /padding-right:\s*\d+px/, '相对时间与操作列之间保留固定槽位')

  const mobile = mediaBlocks(css, 600)
  assert.ok(mobile.length > 0, '存在 390px 所在断点的规则')
  assert.match(mobile, /\.cs-summary \.cs-active::before/, '工作区活跃数值在窄屏显示标签')
  assert.match(mobile, /\.cs-summary \.cs-task::before/, '工作区任务数值在窄屏显示标签')
  assert.match(mobile, /content:\s*attr\(data-label\)/, '标签来自 data-label，随语言切换')
  assert.match(mobile, /\.cs-summary\s*\{[^}]*flex-wrap:\s*wrap/, '窄屏行内块允许换行，不产生横向溢出')
  assert.match(mobile, /\.cs-session-stat\s*\{[^}]*display:\s*inline-flex/, '会话数值在窄屏成为带标签的行内块')

  assert.match(declarationsFor(css, '.cs-name-text'), /text-overflow:\s*ellipsis/, '工作区名使用省略号')
  assert.match(declarationsFor(css, '.cs-session-title'), /text-overflow:\s*ellipsis/, '会话标题使用省略号')
})

test('客户端：回填横幅只在未读事件显示，文案明确为累计回填', async () => {
  const { renderBackfillBanner, normalizeBackfill, isBackfillUnread } = await loadClientFunctions()
  const labels = {
    backfillDone: '历史任务回填完成',
    backfillDoneHint: '已累计回填 {tasks} 条历史任务，仪表盘数据已更新',
    backfillDismiss: '知道了',
  }
  const t = (key) => labels[key] ?? key

  const unread = normalizeBackfill({
    status: 'done', eventId: 'backfill_1_v1', readEventId: '', tasksWritten: 130,
  })
  assert.equal(isBackfillUnread(unread), true)
  const banner = renderBackfillBanner(unread, { onDismiss: () => {} }, t)
  assert.ok(banner, '未读完成事件必须显示横幅')
  assert.match(textOf(banner), /历史任务回填完成/)
  assert.match(textOf(banner), /已累计回填 130 条历史任务/, '横幅必须说明是累计回填条数')
  assert.doesNotMatch(textOf(banner), /已补入 130 条历史任务/)

  // 同一事件已读：组件重挂载/刷新后不显示。
  const read = normalizeBackfill({
    status: 'done', eventId: 'backfill_1_v1', readEventId: 'backfill_1_v1', tasksWritten: 130,
  })
  assert.equal(isBackfillUnread(read), false)
  assert.equal(renderBackfillBanner(read, { onDismiss: () => {} }, t), null)

  // 新一代事件即使旧事件已读，也要再提示一次。
  const next = normalizeBackfill({
    status: 'done', eventId: 'backfill_2_v1', readEventId: 'backfill_1_v1', tasksWritten: 130,
  })
  assert.equal(isBackfillUnread(next), true)
  assert.ok(renderBackfillBanner(next, { onDismiss: () => {} }, t))

  // 旧响应没有事件字段时不能被误判成「有未读事件」。
  const legacy = normalizeBackfill({ status: 'done', tasksWritten: 5 })
  assert.equal(legacy.eventId, '')
  assert.equal(legacy.notices.length, 0)
  assert.equal(isBackfillUnread(legacy), false)
})

test('客户端：侧栏入口使用插件主题 token，不再继承宿主 success 绿', async () => {
  const { chronoscopeSidebarCss } = await loadClientFunctions()
  assert.equal(typeof chronoscopeSidebarCss, 'function')
  const css = chronoscopeSidebarCss()
  assert.match(css, /\.chronoscope-nav-entry\s*\{/)
  assert.match(css, /--cs-signal-deep\s*:\s*#133463/i)
  assert.match(css, /--cs-signal\s*:\s*#1F4E94/i)
  assert.match(css, /--cs-signal-soft\s*:\s*#79B3F9/i)
  assert.match(css, /--cs-live\s*:\s*var\(--cs-signal\)/)
  assert.match(css, /--cs-task\s*:\s*color-mix\(/)
  assert.match(css, /\.chronoscope-nav-entry\.cs-palette-blue/)
  assert.match(css, /\.chronoscope-nav-entry\.cs-palette-stone/)
  assert.match(css, /\.chronoscope-nav-entry\.cs-palette-clay/)
  assert.match(css, /\.chronoscope-nav-entry\.cs-appearance-dark/)
  assert.doesNotMatch(css, /--dsw-alias-state-success-primary/, '侧栏入口不得再吃宿主 success 绿')
  const entry = declarationsFor(css, '.chronoscope-nav-entry')
  assert.match(entry, /display:\s*inline-flex/)
  assert.match(entry, /flex-wrap:\s*nowrap/, '入口保持单行')
  assert.match(entry, /white-space:\s*nowrap/)
  assert.match(declarationsFor(css, '.chronoscope-nav-name'), /text-overflow:\s*ellipsis/, '长名称省略而不撑破侧栏')
})

test('客户端：侧栏构成环按今日在线/活跃/任务三项毫秒分段', async () => {
  const { sidebarRingSegments, sidebarRingGradient } = await loadClientFunctions()
  const segments = sidebarRingSegments({
    onlineMs: 4 * 3_600_000,
    activeMs: 3 * 3_600_000,
    taskMs: 1 * 3_600_000,
  })
  assert.equal(segments.map((segment) => segment.key).join(','), 'online,active,task', '三段口径固定为在线、活跃、任务')
  assert.equal(segments.map((segment) => segment.ms).join(','), '14400000,10800000,3600000')
  assert.equal(segments.map((segment) => segment.share).join(','), '0.5,0.375,0.125', '按三项之和归一化')
  assert.equal(segments.map((segment) => segment.color).join(','), '--cs-signal-soft,--cs-live,--cs-task')
  const gradient = sidebarRingGradient(segments)
  assert.match(gradient, /^conic-gradient\(/)
  assert.match(gradient, /var\(--cs-signal-soft\)\s+0%\s+50%/)
  assert.match(gradient, /var\(--cs-live\)\s+50%\s+87\.5%/)
  assert.match(gradient, /var\(--cs-task\)\s+87\.5%\s+100%/)
  const empty = sidebarRingGradient(sidebarRingSegments({ onlineMs: 0, activeMs: 0, taskMs: 0 }))
  assert.match(empty, /--cs-ring-track/, '全零时不除零，只画轨道')
})

test('客户端：侧栏主题跟随 localStorage 的配色与外观，system 解析为实际明暗', async () => {
  const { sidebarThemeClass, readStoredTheme } = await loadClientFunctions({
    localStorage: {
      getItem: (key) => ({
        'chrono-scope.palette': 'clay',
        'chrono-scope.appearance': 'system',
      })[key] ?? null,
    },
  })
  assert.equal(JSON.stringify(readStoredTheme()), JSON.stringify({ palette: 'clay', appearance: 'system' }))
  assert.equal(sidebarThemeClass('blue', 'light', false), 'cs-palette-blue cs-appearance-light')
  assert.equal(sidebarThemeClass('blue', 'system', true), 'cs-palette-blue cs-appearance-dark', 'system 在深色系统下解析为 dark')
  assert.equal(sidebarThemeClass('stone', 'system', false), 'cs-palette-stone cs-appearance-light')
  assert.equal(sidebarThemeClass('clay', 'dark', false), 'cs-palette-clay cs-appearance-dark')
  assert.equal(sidebarThemeClass('legacy', 'auto', true), 'cs-palette-blue cs-appearance-light', '旧值回落到蓝与浅色')
})

test('客户端：配色/外观变更通过主题事件即时通知侧栏入口', async () => {
  const { subscribeThemeChanged, notifyThemeChanged } = await loadClientFunctions()
  const calls = []
  const unsubscribe = subscribeThemeChanged(() => calls.push('changed'))
  notifyThemeChanged()
  assert.equal(calls.length, 1)
  unsubscribe()
  notifyThemeChanged()
  assert.equal(calls.length, 1, '退订后不再收到通知')
})

test('客户端：侧栏入口隐藏名称后仍保留时长与状态点，悬停不再弹出浮层', async () => {
  const { renderSidebarEntry } = await loadClientFunctions()
  const labels = {
    title: 'ChronoScope',
    onlineLabel: '在线时长',
    activeLabel: '活跃',
    taskLabel: '任务',
    live: '活跃中',
    idle: '空闲',
    sidebarRingTitle: '今日在线、活跃与任务时长',
  }
  const t = (key) => labels[key] ?? key
  const shown = []
  const hidden = []
  const hover = {
    tip: null,
    show: (tip, event) => shown.push({ tip, event }),
    hide: () => hidden.push(true),
  }
  const stats = {
    status: 'ready',
    onlineMs: 4 * 3_600_000,
    activeMs: 3 * 3_600_000,
    taskMs: 3_600_000,
    activeRunning: true,
    receivedAt: Date.now(),
  }
  const tree = renderSidebarEntry({
    stats,
    theme: { palette: 'blue', appearance: 'light' },
    showName: false,
    t,
    hover,
  })
  assert.ok(hasClass(tree, 'chronoscope-nav-entry'), '入口根节点存在')
  assert.match(tree.props.className, /cs-palette-blue/)
  assert.match(tree.props.className, /cs-appearance-light/)
  assert.equal(tree.props.tabIndex, 0, '入口可被键盘聚焦')
  assert.ok(findByClass(tree, 'chronoscope-nav-ring'), '迷你构成环存在')
  assert.equal(findByClass(tree, 'chronoscope-nav-name'), undefined, '隐藏名称后不渲染名称节点')
  assert.equal(textOf(findByClass(tree, 'chronoscope-nav-time')), '3:00:00', '隐藏名称后时长仍在')
  const dot = findByClass(tree, 'chronoscope-nav-dot')
  assert.ok(dot, '隐藏名称后状态点仍在')
  assert.match(dot.props.className, /is-live/, '活跃状态点按活跃状态着色')
  assert.equal(dot.props['aria-label'], '活跃中')

  assert.equal(tree.props.onMouseEnter, undefined, '入口不再绑定悬停浮层')
  assert.equal(tree.props.onFocus, undefined, '入口不再绑定聚焦浮层')
  assert.equal(shown.length, 0, '悬停与聚焦都不再触发浮层')
  assert.equal(hidden.length, 0, '也不再触发浮层收起')
  assert.equal(findAll(tree, (node) => hasClass(node, 'cs-hover-tip')).length, 0, '入口内不再渲染 HoverTip 节点')
  assert.match(tree.props['aria-label'], /在线时长 4:00:00/, '在线时长仍留在无障碍标签里')
  assert.match(tree.props['aria-label'], /活跃 3:00:00/, '活跃时长仍留在无障碍标签里')
  assert.match(tree.props['aria-label'], /任务 1:00:00/, '任务时长仍留在无障碍标签里')

  const named = renderSidebarEntry({
    stats: { ...stats, activeRunning: false },
    theme: { palette: 'stone', appearance: 'dark' },
    showName: true,
    t,
    hover,
  })
  assert.equal(findByClass(named, 'chronoscope-nav-name'), undefined, '无工作区标题时不再渲染名称，避免与宿主 label 重复')
  assert.doesNotMatch(findByClass(named, 'chronoscope-nav-dot').props.className, /is-live/, '空闲状态点不点亮')
})

test('客户端：侧栏名称只显示工作区标题，空值不回落插件名，隐藏时都不渲染', async () => {
  const { renderSidebarEntry } = await loadClientFunctions()
  const t = (key) => ({
    title: 'ChronoScope',
    onlineLabel: '在线',
    activeLabel: '活跃',
    taskLabel: '任务',
    sidebarRingTitle: '今日在线、活跃与任务时长',
  })[key] ?? key
  const base = {
    stats: { status: 'ready', onlineMs: 3_600_000, activeMs: 1_800_000, taskMs: 600_000 },
    theme: { palette: 'blue', appearance: 'light' },
    t,
    hover: { show() {}, hide() {} },
  }
  const named = renderSidebarEntry({ ...base, workspaceTitle: '项目甲' })
  assert.equal(textOf(findByClass(named, 'chronoscope-nav-name')), '项目甲', '有工作区时显示工作区名')

  const fallback = renderSidebarEntry({ ...base, workspaceTitle: '   ' })
  assert.equal(findByClass(fallback, 'chronoscope-nav-name'), undefined, '空白工作区名不再回落插件名')
  const missing = renderSidebarEntry(base)
  assert.equal(findByClass(missing, 'chronoscope-nav-name'), undefined, '没有工作区名时不再渲染名称')
  const sameAsPlugin = renderSidebarEntry({ ...base, workspaceTitle: 'ChronoScope' })
  assert.equal(findByClass(sameAsPlugin, 'chronoscope-nav-name'), undefined, '工作区名与插件名相同时也不重复渲染')
  for (const variant of ['chrono-scope', 'CHRONO-SCOPE', 'Chrono Scope', 'chrono_scope']) {
    const folded = renderSidebarEntry({ ...base, workspaceTitle: variant })
    assert.equal(findByClass(folded, 'chronoscope-nav-name'), undefined,
      `工作区名「${variant}」忽略大小写与分隔符后与插件名等价，不重复渲染`)
  }

  const hiddenWorkspace = renderSidebarEntry({ ...base, workspaceTitle: '项目甲', showName: false })
  assert.equal(findByClass(hiddenWorkspace, 'chronoscope-nav-name'), undefined, '隐藏名称时工作区名不渲染')
  const hiddenFallback = renderSidebarEntry({ ...base, showName: false })
  assert.equal(findByClass(hiddenFallback, 'chronoscope-nav-name'), undefined, '隐藏名称时插件名也不渲染')
})

test('客户端：侧栏名称开关进入设置草稿、保存载荷与设置页控件', async () => {
  const { settingsDraft, settingsPayload, createSettingsSection, React } = await loadClientFunctions()
  assert.equal(settingsDraft({ sidebarShowName: false }).sidebarShowName, false)
  assert.equal(settingsDraft({}).sidebarShowName, true, '缺省时显示名称')
  assert.equal(JSON.stringify(settingsPayload({
    idleThresholdMinutes: '9',
    weekStartsOn: '7',
    showSubagents: false,
    sidebarShowName: false,
  })), JSON.stringify({
    idleThresholdMinutes: 9,
    weekStartsOn: 7,
    showSubagents: false,
    durationFormat: 'hms',
    sidebarShowName: false,
    approximateNoticeDismissed: false,
  }), '保存时提交 sidebarShowName 与数字格式')

  const labels = {
    settingsSectionDisplay: '明细展示',
    settingsSidebarNameLabel: '侧栏显示名称',
    settingsSidebarNameOn: '显示名称',
    settingsSidebarNameOff: '隐藏名称',
  }
  const t = (key) => labels[key] ?? key
  const tree = React.render(createSettingsSection({}), { t })
  const checkbox = findAll(tree, (node) => node.type === 'input' && node.props?.['aria-label'] === '侧栏显示名称')[0]
  assert.ok(checkbox, '设置页存在侧栏名称开关')
  assert.equal(checkbox.props.type, 'checkbox')
  assert.equal(checkbox.props.checked, true, '默认显示名称')
})

test('客户端：设置页通知记录可回看已读事件并显示累计条数', async () => {
  const { normalizeBackfill, renderBackfillNotices } = await loadClientFunctions()
  const completedAt = new Date(2026, 10, 5, 13, 2).getTime()
  const labels = {
    backfillDone: '历史任务回填完成',
    backfillNoticeCount: '累计回填 {tasks} 条',
    backfillNoticeRead: '已读',
    backfillNoticeUnread: '待确认',
    backfillNoticeKindInitial: '首次回填',
    backfillNoticeKindRetry: '手动重试',
    backfillNoticeEmpty: '暂无通知记录',
  }
  const t = (key) => labels[key] ?? key
  const backfill = normalizeBackfill({
    status: 'done',
    notices: [
      { eventId: 'backfill_1_v1', kind: 'initial', version: 1, total: 1, tasksWritten: 130, completedAt, readAt: completedAt + 1000 },
      { eventId: 'backfill_2_v1', kind: 'retry', version: 1, total: 1, tasksWritten: 131, completedAt: completedAt + 2000, readAt: 0 },
    ],
  })
  const text = textOf(renderBackfillNotices(backfill, t))
  assert.match(text, /历史任务回填完成/)
  assert.match(text, /累计回填 130 条/)
  assert.match(text, /累计回填 131 条/)
  assert.match(text, /2026-11-05 13:02/)
  assert.match(text, /首次回填/)
  assert.match(text, /手动重试/)
  assert.match(text, /已读/)
  assert.match(text, /待确认/)
  assert.equal(textOf(renderBackfillNotices(normalizeBackfill({ status: 'done' }), t)), '暂无通知记录')
})

test('客户端：统一 formatDuration 输出五档，非法值与负数安全回落', async () => {
  const { formatDuration, normalizeDurationFormat } = await loadClientFunctions()
  const ms = 2 * 3_600_000 + 48 * 60_000 + 16_000
  assert.equal(formatDuration(ms), '2:48:16', '缺省保持 hms 兼容旧调用')
  assert.equal(formatDuration(ms, 'hms'), '2:48:16')
  assert.equal(formatDuration(ms, 'short'), '2h 48m')
  assert.equal(formatDuration(ms, 'zh'), '2 小时 48 分')
  assert.equal(formatDuration(ms, 'sec'), '10096 秒')
  assert.equal(formatDuration(ms, 'padded'), '02:48:16')
  assert.equal(formatDuration(48 * 60_000 + 16_000, 'short'), '48m 16s')
  assert.equal(formatDuration(48 * 60_000 + 16_000, 'zh'), '48 分 16 秒')
  assert.equal(formatDuration(0, 'hms'), '0:00:00')
  assert.equal(formatDuration(0, 'short'), '0m 0s')
  assert.equal(formatDuration(0, 'zh'), '0 分 0 秒')
  assert.equal(formatDuration(0, 'sec'), '0 秒')
  assert.equal(formatDuration(0, 'padded'), '00:00:00')
  assert.equal(formatDuration(25 * 3_600_000 + 61_000, 'hms'), '25:01:01')
  assert.equal(formatDuration(1_999, 'hms'), '0:00:01', '毫秒向下取整')
  assert.equal(formatDuration(-5_000, 'sec'), '0 秒')
  assert.equal(formatDuration(Number.NaN, 'padded'), '00:00:00')
  assert.equal(formatDuration(ms, 'unknown'), '2:48:16', '非法格式回落 hms')
  assert.equal(normalizeDurationFormat('zh'), 'zh')
  assert.equal(normalizeDurationFormat('bogus'), 'hms')
})

test('客户端：设置草稿包含数字格式，五档卡片与预览行可用，预览事件广播并支持退订', async () => {
  const {
    settingsDraft,
    renderDurationFormatSection,
    subscribeDurationFormatPreview,
    notifyDurationFormatPreview,
  } = await loadClientFunctions()
  const draft = settingsDraft({
    idleThresholdMinutes: 5,
    weekStartsOn: 1,
    showSubagents: true,
    durationFormat: 'zh',
  })
  assert.equal(draft.idleThresholdMinutes, '5')
  assert.equal(draft.weekStartsOn, '1')
  assert.equal(draft.showSubagents, true)
  assert.equal(draft.durationFormat, 'zh')
  assert.equal(settingsDraft(null).durationFormat, 'hms')
  assert.equal(settingsDraft({ durationFormat: 'invalid' }).durationFormat, 'hms')

  const labels = {
    settingsSectionFormat: '数字格式',
    settingsFormatHint: '选择后整页立即预览；点「保存设置」才写入 Host。',
    formatHintHms: '时:分:秒',
    formatHintShort: '紧凑单位',
    formatHintZh: '中文单位',
    formatHintSec: '纯秒',
    formatHintPadded: '补零时钟',
    formatPreviewLabel: '预览 · 2:48:16 显示为',
  }
  const t = (key) => labels[key] ?? key
  const picked = []
  const section = renderDurationFormatSection(t, 'zh', { onSelect: (value) => picked.push(value) })
  const optionButtons = allOf(section, byClass('cs-format-opt'))
  assert.equal(optionButtons.length, 5, '五档格式始终同时可见')
  const checked = optionButtons.filter((button) => button.props['aria-checked'] === true)
  assert.equal(checked.length, 1, '只有一个格式处于选中态')
  assert.match(textOf(checked[0]), /2 小时 48 分/, '中文单位卡片给出真实样例')
  assert.match(textOf(allOf(section, byClass('cs-format-preview'))[0]), /预览 · 2:48:16 显示为\s*2 小时 48 分/, '预览行跟随当前草稿')
  optionButtons[0].props.onClick()
  assert.deepEqual(picked, ['hms'], '点击卡片把对应格式交给选择回调')

  const received = []
  const unsubscribe = subscribeDurationFormatPreview((value) => received.push(value))
  notifyDurationFormatPreview('short')
  notifyDurationFormatPreview('bogus')
  assert.deepEqual(received, ['short', 'hms'], '预览事件携带归一化后的格式')
  unsubscribe()
  notifyDurationFormatPreview('sec')
  assert.deepEqual(received, ['short', 'hms'], '退订后不再收到预览')
})

test('客户端：图表、排行与明细的渲染调用点使用传入格式', async () => {
  const { renderTrendChart, buildTrendTip, renderWorkspaceRanking, renderWorkspaceRow } = await loadClientFunctions()
  const labels = { activeLabel: '活跃', taskLabel: '任务', shareLabel: '占比', durationLabel: '时长' }
  const t = (key) => labels[key] ?? key
  const bucket = {
    key: 'h0',
    from: new Date(2026, 10, 7, 0).getTime(),
    to: new Date(2026, 10, 7, 1).getTime(),
    activeMs: 3_600_000,
    taskMs: 1_800_000,
  }
  const trend = [bucket]

  const chart = renderTrendChart(trend, 'day', t, false, null, {}, 'zh')
  const groups = allOf(chart, byClass('cs-bar-group'))
  assert.match(groups[0].props['aria-label'], /活跃 1 小时 0 分 · 任务 30 分 0 秒/, 'aria-label 使用当前格式')
  const axisText = textOf(allOf(chart, byClass('cs-y-axis'))[0])
  assert.match(axisText, /1 小时 0 分/, 'y 轴使用当前格式')

  const tip = buildTrendTip(bucket, 'day', t, false, 'sec')
  assert.equal(tip.rows[0].value, '3600 秒')
  assert.equal(tip.rows[1].value, '1800 秒')

  const row = {
    key: 'w1',
    workspaceTitle: '工作区一',
    activeMs: 3_600_000,
    taskMs: 1_800_000,
    share: 0.5,
    lastActivityAt: 0,
    sessions: [],
  }
  const rankingText = textOf(renderWorkspaceRanking({ workspaces: [{ ...row, taskMs: 3_600_000 }] }, t, 'sec'))
  assert.match(rankingText, /3600 秒/, '排行使用当前格式')

  const workspaceText = textOf(renderWorkspaceRow(row, false, () => {}, t, 0, {}, 'short'))
  assert.match(workspaceText, /1h 0m/)
  assert.match(workspaceText, /30m 0s/)
})

test('客户端：视图名归一化只接受四视图，非法值回落概览', async () => {
  const { normalizeView } = await loadClientFunctions()
  assert.equal(typeof normalizeView, 'function')
  for (const value of ['overview', 'trend', 'details', 'settings']) {
    assert.equal(normalizeView(value), value, `${value} 是合法视图`)
  }
  for (const value of ['bogus', '', null, undefined, 'Overview', 0, {}]) {
    assert.equal(normalizeView(value), 'overview', `${String(value)} 回落到概览`)
  }
})

test('客户端：tab 键盘索引支持左右循环与 Home/End', async () => {
  const { nextTabIndex } = await loadClientFunctions()
  assert.equal(typeof nextTabIndex, 'function')
  assert.equal(nextTabIndex(0, 'ArrowRight'), 1)
  assert.equal(nextTabIndex(1, 'ArrowRight'), 2)
  assert.equal(nextTabIndex(3, 'ArrowRight'), 0, '右方向键从最后一项循环到第一项')
  assert.equal(nextTabIndex(0, 'ArrowLeft'), 3, '左方向键从第一项循环到最后一项')
  assert.equal(nextTabIndex(2, 'ArrowLeft'), 1)
  assert.equal(nextTabIndex(2, 'Home'), 0)
  assert.equal(nextTabIndex(1, 'End'), 3)
  assert.equal(nextTabIndex(2, 'Enter'), 2, '其它按键保持当前项')
})

test('客户端：分段导航渲染四个 tab、移动滑块与 roving tabindex', async () => {
  const { TabNav, React } = await loadClientFunctions()
  assert.equal(typeof TabNav, 'function')
  const labels = {
    tabOverview: '概览', tabTrend: '趋势', tabDetails: '明细', tabSettings: '设置',
    tabsLabel: 'ChronoScope 页面',
  }
  const t = (key) => labels[key] ?? key
  const picked = []
  const tree = React.render(TabNav, { view: 'trend', t, onChange: (value) => picked.push(value) })

  const nav = findAll(tree, (node) => node.props?.role === 'tablist')[0]
  assert.ok(nav, '导航以 tablist 呈现')
  assert.equal(nav.props['aria-label'], 'ChronoScope 页面')
  const tabs = findAll(tree, (node) => node.props?.role === 'tab')
  assert.equal(tabs.length, 4, '四个同级 tab')
  assert.deepEqual(tabs.map((tab) => textOf(tab).trim()), ['概览', '趋势', '明细', '设置'])
  assert.deepEqual(tabs.map((tab) => tab.props['aria-selected']), [false, true, false, false])
  assert.deepEqual(tabs.map((tab) => tab.props.tabIndex), [-1, 0, -1, -1], '激活项 0，其余 -1')
  const thumb = findAll(tree, byClass('cs-tab-thumb'))[0]
  assert.ok(thumb, '存在移动滑块')
  assert.match(thumb.props.style.transform, /^translateX\(-?\d+(?:\.\d+)?px\)$/)
  assert.match(thumb.props.style.width, /^\d+(?:\.\d+)?px$/)

  tabs[1].props.onKeyDown({ key: 'ArrowRight', preventDefault() {} })
  assert.deepEqual(picked, ['details'], '右方向键切到下一视图')
  tabs[0].props.onKeyDown({ key: 'End', preventDefault() {} })
  assert.deepEqual(picked, ['details', 'settings'], 'End 跳到最后一个视图')
  tabs[0].props.onClick()
  assert.deepEqual(picked, ['details', 'settings', 'overview'], '点击 tab 切到对应视图')
})

test('客户端：视图转场退出约为进入的 60%，减少动效直接到位', async () => {
  const { viewTransitionDelay, VIEW_ENTER_MS, VIEW_EXIT_MS } = await loadClientFunctions()
  assert.equal(VIEW_ENTER_MS, 300)
  assert.equal(VIEW_EXIT_MS, 180)
  assert.equal(VIEW_EXIT_MS / VIEW_ENTER_MS, 0.6, '退出 180ms 是进入 300ms 的 60%')
  assert.equal(viewTransitionDelay(false), 180)
  assert.equal(viewTransitionDelay(true), 0, 'prefers-reduced-motion 下直接切换')

  const css = await loadClientCss()
  assert.match(css, /@keyframes\s+viewIn/)
  assert.match(css, /@keyframes\s+viewOut/)
  assert.match(declarationsFor(css, '.cs-view'), /animation:\s*viewIn/)
  assert.match(declarationsFor(css, '.cs-view.is-leaving'), /animation:\s*viewOut/)
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cs-view/)
})

function sampleDashboardData() {
  const now = new Date(2026, 10, 7, 12, 0, 0).getTime()
  return {
    period: 'day',
    range: { from: now - 3_600_000, to: now },
    onlineMs: 4 * 3_600_000,
    activeMs: 3 * 3_600_000,
    taskMs: 3_600_000,
    taskCount: 4,
    taskRunning: false,
    activeRunning: false,
    cycles: {
      day: { activeMs: 3 * 3_600_000, taskMs: 3_600_000, taskCount: 4, onlineMs: 4 * 3_600_000, from: now - 86_400_000, to: now },
      week: { activeMs: 5 * 3_600_000, taskMs: 2 * 3_600_000, taskCount: 7, onlineMs: 6 * 3_600_000, from: now - 7 * 86_400_000, to: now },
      month: { activeMs: 12 * 3_600_000, taskMs: 5 * 3_600_000, taskCount: 20, onlineMs: 14 * 3_600_000, from: now - 30 * 86_400_000, to: now },
    },
    workspaces: [{
      key: 'ws-1',
      workspaceTitle: '工作区一',
      activeMs: 3 * 3_600_000,
      taskMs: 3_600_000,
      taskCount: 4,
      taskRunning: false,
      approximate: false,
      share: 1,
      lastActivityAt: now - 60_000,
      sessions: [{
        sessionId: 's-1',
        sessionTitle: '会话一',
        activeMs: 3 * 3_600_000,
        taskMs: 3_600_000,
        taskCount: 4,
        taskRunning: false,
        approximate: false,
        hasBreakdown: true,
        modelMs: 1_800_000,
        toolMs: 900_000,
        waitMs: 600_000,
        otherMs: 300_000,
        lastActivityAt: now - 60_000,
      }],
    }],
    subagentTasks: [],
    trend: [
      { key: 'h10', from: now - 7_200_000, to: now - 3_600_000, future: false, activeMs: 1_800_000, taskMs: 600_000 },
      { key: 'h11', from: now - 3_600_000, to: now, future: false, activeMs: 3_600_000, taskMs: 1_800_000 },
    ],
    backfill: { status: 'done', notices: [] },
    durationFormat: 'hms',
  }
}

test('客户端：概览、趋势、明细三个视图各有真实内容', async () => {
  const { renderOverviewView, renderTrendView, renderDetailsView } = await loadClientFunctions()
  const labels = {
    overviewTitle: '周期概览', actualOccupied: '实际占用', cycleToday: '今日', cycleWeek: '本周', cycleMonth: '本月',
    taskCountUnit: '次任务', activeLabel: '活跃', taskLabel: '任务', selectedPeriod: '当前',
    compositionTitle: '任务时长构成', compositionInfo: '按会话累计', compositionHint: '按会话累计',
    noTaskComposition: '暂无任务', accumulated: '累计工时', workspaceRanking: '工作区任务排行',
    sumFoot: '明细按会话逐条累加', unassigned: '未归属', colShare: '任务占比',
    trendDay: '今日逐小时', trendWeek: '本周每日', trendMonth: '本月每日', trendInfo: '活跃与任务独立统计',
    emptyDashboard: '暂无记录', recentSessions: '最近会话', recentSessionsHint: '按最近活动排序',
    unknownSession: '未命名会话', justNow: '刚刚', minutesAgo: '{n} 分钟前', hoursAgo: '{n} 小时前', daysAgo: '{n} 天前',
    trendSummary: '本周期概览', dailyAverageActive: '日均活跃', dailyAverageTask: '日均任务',
    taskCountShort: '任务次数', peakActive: '峰值活跃', searchPlaceholder: '搜索工作区或会话',
    workspaceTitle: '工作区明细', workspaceHint: '展开查看会话', colActive: '活跃', colTask: '任务',
    colLast: '最近活动', sessionsUnit: '个会话', expand: '展开会话', collapse: '收起会话',
    detailsEmpty: '没有匹配的工作区或会话', emptyWorkspace: '这个工作区还没有会话记录',
    rangeLabel: '统计范围', trendHint: '活跃与任务时长',
  }
  const t = (key) => labels[key] ?? key
  const data = sampleDashboardData()
  const hoverTip = { tip: null, show() {}, hide() {} }
  const now = Date.now()

  const overview = renderOverviewView({
    data, t, isZh: true, period: 'day', onSelectPeriod() {}, durationFormat: 'hms',
    hoverTip, nowMs: now, onOpenWorkspace() {},
  })
  assert.equal(allOf(overview, byClass('cs-cycle')).length, 3, '概览保留今日/本周/本月周期卡')
  assert.ok(allOf(overview, byClass('cs-trend-card')).length >= 1, '概览含趋势卡')
  assert.ok(allOf(overview, byClass('cs-composition')).length >= 1, '概览含任务构成')
  assert.ok(allOf(overview, byClass('cs-ranking')).length >= 1, '概览含工作区排行')
  const recentRows = allOf(overview, byClass('cs-recent-row'))
  assert.equal(recentRows.length, 1, '最近会话从工作区扁平化出真实行')
  assert.match(textOf(recentRows[0]), /会话一/)

  const trend = renderTrendView({
    data, t, isZh: true, period: 'day', onSelectPeriod() {}, durationFormat: 'hms', hoverTip,
    nowMs: now,
  })
  assert.equal(allOf(trend, byClass('cs-cycle')).length, 3, '趋势同样能切换日/周/月比较')
  assert.ok(allOf(trend, byClass('cs-trend-card')).length >= 1, '趋势含趋势图卡')
  const summaryText = textOf(allOf(trend, byClass('cs-trend-summary'))[0])
  assert.match(summaryText, /日均活跃/)
  assert.match(summaryText, /日均任务/)
  assert.match(summaryText, /任务次数/)

  const details = renderDetailsView({
    data, t, query: '', onQueryChange() {}, durationFormat: 'hms', expanded: {}, onToggleRow() {},
    nowMs: now, subagentByParent: {},
  })
  const search = findAll(details, (node) => node.type === 'input' && node.props?.type === 'search')[0]
  assert.ok(search, '明细含搜索框')
  assert.equal(search.props['aria-label'], '搜索工作区或会话')
  const workspaceRow = allOf(details, byClass('cs-summary'))[0]
  assert.ok(workspaceRow, '明细含工作区行')
  assert.match(textOf(workspaceRow), /工作区一/)

  const filtered = renderDetailsView({
    data, t, query: '不存在的关键词', onQueryChange() {}, durationFormat: 'hms', expanded: {}, onToggleRow() {},
    nowMs: now, subagentByParent: {},
  })
  assert.match(textOf(filtered), /没有匹配的工作区或会话/, '本地过滤无结果时给出空状态')
})

test('客户端：Dashboard 设置页包含格式、外观、统计、通知、导出与二次确认清空', async () => {
  const { renderSettingsView, normalizeBackfill, settingsDraft, React } = await loadClientFunctions()
  assert.equal(typeof renderSettingsView, 'function')
  const labels = {
    settingsPageTitle: '仪表盘设置', settingsPageHint: '设置保存在本机',
    settingsSectionFormat: '数字格式', settingsFormatHint: '选择后立即预览',
    formatHintHms: '时:分:秒', formatHintShort: '紧凑单位', formatHintZh: '中文单位',
    formatHintSec: '纯秒', formatHintPadded: '补零时钟', formatPreviewLabel: '预览 · 2:48:16 显示为',
    settingsSectionAppearance: '外观与配色', appearanceLabel: '外观',
    appearanceLight: '浅色', appearanceDark: '深色', appearanceSystem: '跟随系统',
    appearanceToggle: '外观：{mode}，点击切换', paletteLabel: '配色',
    paletteBlue: '蓝', paletteStone: '石墨', paletteClay: '赤陶',
    settingsSectionGeneral: '统计口径', settingsIdleLabel: '活跃判定阈值', settingsIdleHint: '空闲多久后不计入',
    settingsIdleUnit: '分钟', settingsIdleRange: '可选 1–15 分钟', settingsWeekLabel: '每周起始',
    settingsWeekHint: '决定本周边界', settingsWeekMonday: '周一', settingsWeekSunday: '周日',
    settingsSectionDisplay: '明细展示', settingsSubagentLabel: '显示子代理明细', settingsSubagentHint: '开关子代理',
    settingsSubagentOn: '显示', settingsSubagentOff: '隐藏', settingsSidebarNameLabel: '侧栏显示名称',
    settingsSidebarNameHint: '侧栏名称开关', settingsSidebarNameOn: '显示名称', settingsSidebarNameOff: '隐藏名称',
    settingsSectionNotices: '通知记录', backfillNoticeCount: '累计回填 {tasks} 条',
    backfillNoticeRead: '已读', backfillNoticeUnread: '待确认', backfillNoticeKindInitial: '首次回填',
    backfillNoticeEmpty: '暂无通知记录', backfillNoticeUnavailable: '暂时无法读取通知记录',
    settingsRecheck: '重新检查回填', settingsRechecking: '正在检查…',
    dataTitle: '数据管理', dataHint: '导出与清空', exportJson: '导出 JSON', exportCsv: '导出 CSV',
    exporting: '正在导出…', clearData: '清空全部数据', clearStepTitle: '确认清空？',
    clearStepHint: '此操作不可撤销', clearConfirm: '确认清空', clearCancel: '取消', clearing: '正在清空…',
    settingsSave: '保存设置', settingsSaving: '正在保存…', settingsSaved: '已保存',
    settingsLoadError: '无法读取设置', settingsRetry: '重试', settingsSaveError: '保存失败',
    savedBadge: '已保存', importData: '从备份文件恢复', approximateShowAgain: '重新显示说明',
    backfillNoticeKindRetry: '手动重试', backfillDone: '历史任务回填完成',
  }
  const t = (key) => labels[key] ?? key
  const draft = settingsDraft({ idleThresholdMinutes: 7, weekStartsOn: 7, showSubagents: false, sidebarShowName: false, durationFormat: 'short' })
  const backfill = normalizeBackfill({
    status: 'done',
    notices: [{ eventId: 'n1', kind: 'initial', tasksWritten: 130, completedAt: Date.now(), readAt: Date.now() }],
  })
  const calls = []
  const tree = renderSettingsView({
    t, draft, phase: 'ready', message: '', noticeState: { status: 'ready', data: backfill },
    appearance: 'system', palette: 'clay', dataBusy: '', dataMessage: null, clearStep: false,
    retrying: false, retryError: null,
    onPatch: () => {}, onSelectFormat: (value) => calls.push(['format', value]),
    onSave: () => calls.push(['save']), onRetryLoad: () => {}, onExport: (value) => calls.push(['export', value]),
    onRequestClear: () => calls.push(['clear-request']), onCancelClear: () => {}, onClear: () => {},
    onRecheckBackfill: () => {}, onCycleAppearance: () => {}, onChangePalette: () => {},
  })
  const text = textOf(tree)
  for (const expected of ['数字格式', '外观与配色', '活跃判定阈值', '每周起始', '显示子代理明细', '侧栏显示名称', '通知记录', '导出 JSON', '导出 CSV', '从备份文件恢复', '重新显示说明', '清空全部数据']) {
    assert.match(text, new RegExp(expected), `设置页包含「${expected}」`)
  }
  assert.doesNotMatch(text, /保存设置/, '即点即存后不再有「保存设置」按钮')
  assert.equal(allOf(tree, byClass('cs-format-opt')).length, 5, '五张数字格式卡片')
  const checkboxes = findAll(tree, (node) => node.type === 'input' && node.props?.type === 'checkbox')
  assert.equal(checkboxes.length, 2, '子代理与侧栏名称两个开关')
  const selectLabels = findAll(tree, (node) => typeof node.props?.ariaLabel === 'string')
    .map((node) => node.props.ariaLabel)
  assert.ok(selectLabels.includes('活跃判定阈值'), '空闲阈值下拉可用')
  assert.ok(selectLabels.includes('每周起始'), '每周起始下拉可用')
  assert.equal(allOf(tree, byClass('cs-swatch-preview')).length, 3, '配色区改为三枚可预览色板')
  assert.match(text, /累计回填 130 条/, '通知记录可回看')
  assert.equal(findAll(tree, (node) => node.props?.role === 'alertdialog').length, 0, '清空前不显示确认框')
  const exportButtons = findAll(tree, (node) => node.type === 'button' && /导出 JSON/.test(textOf(node)))
  exportButtons[0].props.onClick()
  assert.deepEqual(calls, [['export', 'json']], '导出按钮直接调用导出')
  const clearButton = findAll(tree, (node) => node.type === 'button' && /清空全部数据/.test(textOf(node)))[0]
  clearButton.props.onClick()
  assert.deepEqual(calls, [['export', 'json'], ['clear-request']], '第一次点清空只进入二次确认')

  const confirming = renderSettingsView({
    t, draft, phase: 'ready', message: '', noticeState: { status: 'ready', data: backfill },
    appearance: 'light', palette: 'blue', dataBusy: '', dataMessage: null, clearStep: true,
    retrying: false, retryError: null,
    onPatch: () => {}, onSelectFormat: () => {}, onSave: () => {}, onRetryLoad: () => {},
    onExport: () => {}, onRequestClear: () => {}, onCancelClear: () => {}, onClear: () => {},
    onRecheckBackfill: () => {}, onCycleAppearance: () => {}, onChangePalette: () => {},
  })
  const dialog = findAll(confirming, (node) => node.props?.role === 'alertdialog')[0]
  assert.ok(dialog, '第二次确认时显示确认框')
  assert.match(textOf(dialog), /确认清空/)
  assert.match(textOf(dialog), /取消/)
})

/** 首屏相关测试共用的今日/本周/本月数据：活跃 2:48:16、在线 5:58:08、任务 1:37:14。 */
function heroSampleData() {
  return {
    period: 'day',
    activeMs: 10_096_000,
    onlineMs: 21_488_000,
    taskMs: 5_834_000,
    taskCount: 4,
    cycles: {
      day: { activeMs: 10_096_000, onlineMs: 21_488_000, taskMs: 5_834_000, taskCount: 4 },
      week: { activeMs: 21_061_000, onlineMs: 25_000_000, taskMs: 9_000_000, taskCount: 9 },
      month: { activeMs: 51_240_000, onlineMs: 60_000_000, taskMs: 20_000_000, taskCount: 20 },
    },
    workspaces: [],
    trend: [],
    subagentTasks: [],
    backfill: { status: 'done', notices: [] },
    durationFormat: 'hms',
  }
}

test('客户端：首屏状态只认三个合法值，非法持久化值回落普通概览', async () => {
  const { normalizeFocus } = await loadClientFunctions()
  assert.equal(typeof normalizeFocus, 'function')
  assert.equal(normalizeFocus('hero'), 'hero')
  assert.equal(normalizeFocus('trend'), 'trend')
  assert.equal(normalizeFocus('heatmap'), 'heatmap', '#14/#15 共用同一份状态')
  for (const value of ['', 'Hero', 'other', null, undefined, 0, {}, []]) {
    assert.equal(normalizeFocus(value), null, `非法值 ${JSON.stringify(value)} 归一为 null`)
  }
})

test('客户端：首屏状态从本地设置读取、写回与删除，存储异常不冒泡', async () => {
  const { readStoredFocus, writeStoredFocus, focusTransitionMs, FOCUS_KEY } = await loadClientFunctions()
  assert.equal(FOCUS_KEY, 'chrono-scope.focus')

  const calls = []
  const fake = {
    getItem: (key) => { calls.push(['get', key]); return 'hero' },
    setItem: (key, value) => calls.push(['set', key, value]),
    removeItem: (key) => calls.push(['remove', key]),
  }
  assert.equal(readStoredFocus(fake), 'hero')
  assert.deepEqual(calls, [['get', 'chrono-scope.focus']], '读取使用同一个存储键')

  assert.equal(readStoredFocus({ getItem: () => 'bogus' }), null, '非法旧值回落普通概览')
  assert.equal(readStoredFocus({ getItem: () => null }), null)
  assert.equal(readStoredFocus({ getItem: () => { throw new Error('denied') } }), null, '隐私模式读取失败不崩溃')
  assert.equal(readStoredFocus(null), null)

  writeStoredFocus(fake, 'trend')
  assert.deepEqual(calls.at(-1), ['set', 'chrono-scope.focus', 'trend'])
  writeStoredFocus(fake, null)
  assert.deepEqual(calls.at(-1), ['remove', 'chrono-scope.focus'], '缩回时删除持久化值')
  writeStoredFocus(fake, undefined)
  assert.deepEqual(calls.at(-1), ['remove', 'chrono-scope.focus'])
  assert.doesNotThrow(() => writeStoredFocus({
    setItem() { throw new Error('quota') },
    removeItem() { throw new Error('quota') },
  }, 'hero'), '写入失败不影响页面')

  assert.equal(focusTransitionMs(false), 240)
  assert.equal(focusTransitionMs(true), 0, 'prefers-reduced-motion 下直接到位')
})

test('客户端：概览首屏卡片右上角有无边框纯图标按钮，主数字用统一格式', async () => {
  const { renderHeroCard } = await loadClientFunctions()
  const labels = {
    todayActive: '今日活跃时长', actualOccupied: '实际占用', focusSet: '设为首屏',
    focusUnset: '退出首屏', todayOnline: '今日在线时长', todayTask: '今日任务时长',
  }
  const t = (key) => labels[key] ?? key
  const calls = []
  const card = renderHeroCard({
    data: heroSampleData(), t, format: 'hms', focus: null, onToggleFocus: (value) => calls.push(value),
  })
  assert.equal(allOf(card, byClass('cs-hero')).length, 1, '新增独立的首屏卡片')
  const text = textOf(card)
  assert.match(text, /今日活跃时长/)
  assert.match(text, /实际占用/)
  assert.match(text, /2:48:16/, '主数字与设置页示例值同源')
  const button = allOf(card, byClass('cs-zoom-btn'))[0]
  assert.ok(button, '卡片最右上角有缩放按钮')
  assert.equal(button.type, 'button')
  assert.equal(button.props['aria-label'], '设为首屏')
  assert.equal(button.props['aria-pressed'], false)
  assert.ok(allOf(button, (node) => node.type === 'svg').length === 1, '纯图标按钮内联 SVG')
  button.props.onClick()
  assert.deepEqual(calls, ['hero'], '点击请求放大首屏')

  const zoomed = renderHeroCard({
    data: heroSampleData(), t, format: 'hms', focus: 'hero', onToggleFocus: () => {},
  })
  const zoomedButton = allOf(zoomed, byClass('cs-zoom-btn'))[0]
  assert.equal(zoomedButton.props['aria-label'], '退出首屏')
  assert.equal(zoomedButton.props['aria-pressed'], true)
})

test('客户端：首屏放大页重新排版为大数字、多项统计与占比进度条', async () => {
  const { renderHeroFocusPage } = await loadClientFunctions()
  const labels = {
    todayActive: '今日活跃时长', actualOccupied: '实际占用', focusSummary: '首屏概览',
    focusSet: '设为首屏', focusUnset: '退出首屏', todayOnline: '今日在线时长',
    onlineLabel: '在线时长', todayTask: '任务时长', activeShare: '活跃占比',
    taskCountShort: '任务次数', focusTodayActive: '今日活跃', focusWeekActive: '本周活跃',
    focusMonthActive: '本月活跃',
  }
  const t = (key) => labels[key] ?? key
  const calls = []
  const page = renderHeroFocusPage({
    data: heroSampleData(), t, format: 'hms', onToggleFocus: (value) => calls.push(value),
  })
  assert.equal(allOf(page, byClass('cs-hero-focus')).length, 1, '放大态是独立首屏页')
  assert.equal(textOf(allOf(page, byClass('cs-hero-num'))[0]).trim(), '2:48:16', '大数字沿用统一格式')
  const panelText = textOf(allOf(page, byClass('cs-focus-panel'))[0])
  for (const expected of ['在线时长', '任务时长', '活跃占比', '任务次数', '今日活跃', '本周活跃', '本月活跃']) {
    assert.match(panelText, new RegExp(expected), `放大页包含「${expected}」`)
  }
  assert.match(panelText, /5:58:08/, '在线时长')
  assert.match(panelText, /1:37:14/, '任务时长')
  assert.match(panelText, /47%/, '活跃占比 = 2:48:16 / 5:58:08')
  assert.match(panelText, /5:51:01/, '本周活跃')
  assert.match(panelText, /14:14:00/, '本月活跃')
  const bar = allOf(page, byClass('cs-focus-bar'))[0]
  const fill = allOf(bar, (node) => node.type === 'i')[0]
  assert.equal(fill.props.style.width, '47%', '进度条宽度即活跃占比')
  const button = allOf(page, byClass('cs-zoom-btn'))[0]
  assert.equal(button.props['aria-label'], '退出首屏')
  button.props.onClick()
  assert.deepEqual(calls, ['hero'], '再次点击缩回普通概览')

  const noOnline = renderHeroFocusPage({
    data: { ...heroSampleData(), cycles: { ...heroSampleData().cycles, day: { ...heroSampleData().cycles.day, onlineMs: 0 } } },
    t, format: 'hms', onToggleFocus: () => {},
  })
  const zeroFill = allOf(allOf(noOnline, byClass('cs-focus-bar'))[0], (node) => node.type === 'i')[0]
  assert.equal(zeroFill.props.style.width, '0%', '在线为 0 时占比显示 0%')

  const reduced = await loadClientFunctions({ matchMedia: () => ({ matches: true }) })
  const reducedPage = reduced.renderHeroFocusPage({ data: heroSampleData(), t, format: 'hms', onToggleFocus: () => {} })
  assert.equal(reducedPage.props.style['--cs-focus-ms'], '0ms', '减少动效偏好下直接到位')
})

test('客户端：概览在首屏状态只渲染放大页，普通状态同时有首屏卡片与周期卡', async () => {
  const { renderOverviewView } = await loadClientFunctions()
  const t = (key) => ({
    overviewTitle: '周期概览', actualOccupied: '实际占用', cycleToday: '今日', cycleWeek: '本周', cycleMonth: '本月',
    taskCountUnit: '次任务', activeLabel: '活跃', taskLabel: '任务', selectedPeriod: '当前',
    compositionTitle: '任务时长构成', compositionInfo: '按会话累计', compositionHint: '按会话累计',
    noTaskComposition: '暂无任务', accumulated: '累计工时', workspaceRanking: '工作区任务排行',
    sumFoot: '明细按会话逐条累加', unassigned: '未归属', colShare: '任务占比',
    trendDay: '今日逐小时', trendWeek: '本周每日', trendMonth: '本月每日', trendInfo: '活跃与任务独立统计',
    emptyDashboard: '暂无记录', recentSessions: '最近会话', recentSessionsHint: '按最近活动排序',
    recentSessionsEmpty: '暂无会话', unknownSession: '未命名会话',
    justNow: '刚刚', minutesAgo: '{n} 分钟前', hoursAgo: '{n} 小时前', daysAgo: '{n} 天前',
    todayActive: '今日活跃时长', focusSet: '设为首屏', focusUnset: '退出首屏',
    focusSummary: '首屏概览', todayOnline: '今日在线时长', todayTask: '今日任务时长',
    onlineLabel: '在线时长', activeShare: '活跃占比', taskCountShort: '任务次数',
    focusTodayActive: '今日活跃', focusWeekActive: '本周活跃', focusMonthActive: '本月活跃',
    peakActive: '峰值活跃', peakPeriod: '最活跃时段', trendFocusTitle: '条状图首屏',
  })[key] ?? key
  const data = sampleDashboardData()
  const hoverTip = { tip: null, show() {}, hide() {} }
  const common = {
    data, t, isZh: true, period: 'day', onSelectPeriod() {}, durationFormat: 'hms',
    hoverTip, nowMs: Date.now(), onOpenWorkspace() {}, onToggleFocus() {},
  }

  const normal = renderOverviewView({ ...common, focus: null })
  assert.equal(allOf(normal, byClass('cs-hero')).length, 1, '普通概览含首屏卡片')
  assert.equal(allOf(normal, byClass('cs-cycle')).length, 3, '普通概览保留日/周/月周期卡')
  assert.ok(allOf(normal, byClass('cs-trend-card')).length >= 1)
  assert.ok(allOf(normal, byClass('cs-composition')).length >= 1)
  const normalZoomButtons = allOf(normal, byClass('cs-zoom-btn'))
  assert.equal(normalZoomButtons.length, 3, '首屏卡片、趋势卡与热力图卡各有一个缩放按钮')
  assert.ok(normalZoomButtons.every((button) => button.props['aria-label'] === '设为首屏'))
  const normalHeatmap = allOf(normal, byClass('cs-heatmap-card'))[0]
  assert.equal(allOf(normalHeatmap, byClass('cs-zoom-btn')).length, 1, '普通概览热力图卡右上角有缩放按钮')
  assert.equal(allOf(normalHeatmap, byClass('cs-zoom-btn'))[0].props['aria-label'], '设为首屏')

  const focused = renderOverviewView({ ...common, focus: 'hero' })
  assert.equal(allOf(focused, byClass('cs-hero-focus')).length, 1, '首屏态只留放大页')
  assert.equal(allOf(focused, byClass('cs-cycle')).length, 0, '首屏态不渲染周期卡')
  assert.equal(allOf(focused, byClass('cs-trend-card')).length, 0, '首屏态不渲染趋势卡')
  assert.equal(allOf(focused, byClass('cs-composition')).length, 0, '首屏态不渲染构成卡')
  assert.match(textOf(focused), /3:00:00/, '放大页主数字来自今日活跃')

  const trendFocus = renderOverviewView({ ...common, focus: 'trend' })
  assert.equal(allOf(trendFocus, byClass('cs-trend-focus')).length, 1, '趋势首屏只留独立页')
  assert.equal(allOf(trendFocus, byClass('cs-hero-focus')).length, 0, '两种首屏互斥')
  assert.equal(allOf(trendFocus, byClass('cs-cycle')).length, 0, '趋势首屏不渲染周期卡')
  assert.equal(allOf(trendFocus, byClass('cs-trend-card')).length, 0, '趋势首屏不渲染普通趋势卡')
  assert.equal(allOf(trendFocus, byClass('cs-composition')).length, 0, '趋势首屏不渲染构成卡')
  const trendText = textOf(trendFocus)
  for (const expected of ['条状图首屏', '峰值活跃', '最活跃时段', '活跃占比', '75%']) {
    assert.match(trendText, new RegExp(expected), `趋势首屏包含「${expected}」`)
  }

  const heatmapFocus = renderOverviewView({ ...common, focus: 'heatmap' })
  assert.equal(allOf(heatmapFocus, byClass('cs-heatmap-focus-page')).length, 1, '热力图首屏只留独立页')
  assert.equal(allOf(heatmapFocus, byClass('cs-heatmap-focus')).length, 1, '热力图卡片进入首屏排版')
  assert.equal(allOf(heatmapFocus, byClass('cs-hero-focus')).length, 0, '与 hero 首屏互斥')
  assert.equal(allOf(heatmapFocus, byClass('cs-trend-focus')).length, 0, '与趋势首屏互斥')
  assert.equal(allOf(heatmapFocus, byClass('cs-cycle')).length, 0, '热力图首屏不渲染周期卡')
  assert.equal(allOf(heatmapFocus, byClass('cs-composition')).length, 0, '热力图首屏不渲染构成卡')
})

test('客户端：普通概览用三行 Bento 网格包住七个区块，首屏页不受影响', async () => {
  const { renderOverviewView } = await loadClientFunctions()
  const t = (key) => key
  const data = sampleDashboardData()
  const common = {
    data, t, isZh: true, period: 'day', onSelectPeriod() {}, durationFormat: 'hms',
    hoverTip: { tip: null, show() {}, hide() {} }, nowMs: Date.now(), onOpenWorkspace() {},
    onToggleFocus() {},
  }
  const expected = ['cs-hero', 'cs-cycles', 'cs-trend-card', 'cs-composition', 'cs-ranking', 'cs-recent', 'cs-heatmap-card']
  const overview = renderOverviewView({ ...common, focus: null })
  const grid = allOf(overview, byClass('cs-overview-grid'))[0]
  assert.ok(grid, '普通概览有一个总网格容器')
  assert.equal(grid.children.length, 7, '七个区块都是网格的直接子项')
  assert.deepEqual(
    grid.children.map((child) => expected.find((name) => hasClass(child, name))),
    expected,
    '区块按 hero、周期卡、趋势、构成、排行、最近会话、热力图的顺序进入网格',
  )
  for (const name of expected) {
    assert.equal(allOf(grid, byClass(name)).length, 1, `${name} 位于概览网格内`)
  }

  for (const focus of ['hero', 'trend', 'heatmap']) {
    const page = renderOverviewView({ ...common, focus })
    assert.equal(allOf(page, byClass('cs-overview-grid')).length, 0, `${focus} 首屏不渲染普通概览网格`)
  }
})

test('客户端：概览 Bento 网格声明三列三行，窄屏回落两列与单列', async () => {
  const css = await loadClientCss()
  const grid = declarationsFor(css, '.cs-overview-grid')
  assert.match(grid, /grid-template-columns:\s*1\.05fr\s+1fr\s+1fr/, '桌面三列，hero 列略宽')
  assert.match(grid, /grid-template-rows:\s*auto\s+auto\s+auto/, '三行 Bento 布局')

  const placements = [
    ['.cs-hero', 1, '1'],
    ['.cs-cycles', 1, '2 / 4'],
    ['.cs-trend-card', 2, '1 / 3'],
    ['.cs-composition', 2, '3'],
    ['.cs-ranking', 3, '1'],
    ['.cs-recent', 3, '2'],
    ['.cs-heatmap-card', 3, '3'],
  ]
  for (const [selector, row, column] of placements) {
    const declarations = declarationsFor(css, selector)
    assert.match(declarations, new RegExp(`grid-row:\\s*${row}`), `${selector} 位于第 ${row} 行`)
    assert.match(declarations, new RegExp(`grid-column:\\s*${column.replace('/', '\\/')}`), `${selector} 位于第 ${column} 列`)
  }

  const twoColumns = mediaBlocks(css, 900)
  assert.match(twoColumns, /\.cs-overview-grid[^{]*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, '900px 以下两列')
  assert.match(twoColumns, /\.cs-trend-card[^{]*\{[^}]*grid-column:\s*1\s*\/\s*-1/, '趋势卡在窄屏横跨两列')

  const oneColumn = mediaBlocks(css, 600)
  assert.match(oneColumn, /\.cs-overview-grid[^{]*\{[^}]*grid-template-columns:\s*1fr/, '600px 以下单列')
  for (const selector of ['.cs-hero', '.cs-cycles', '.cs-trend-card', '.cs-composition', '.cs-ranking', '.cs-recent', '.cs-heatmap-card']) {
    assert.match(oneColumn, new RegExp(`${selector.replace('.', '\\.')}[^{]*\\{[^}]*grid-column:\\s*1`), `${selector} 在单列下占满一行`)
  }
})

test('客户端：首屏缩放按钮与进度条样式无边框，并尊重减少动效', async () => {
  const css = await loadClientCss()
  const zoom = declarationsFor(css, '.cs-zoom-btn')
  assert.match(zoom, /position:\s*absolute/, '按钮固定在卡片右上角')
  assert.match(zoom, /background:\s*transparent/, '无填充')
  assert.match(zoom, /border:\s*0/, '无边框')
  assert.match(declarationsFor(css, '.cs-zoom-btn:hover'), /scale\(1\.15\)/, '悬浮放大')
  assert.match(declarationsFor(css, '.cs-zoom-btn svg'), /stroke:\s*var\(--cs-ink-2\)/, '图标用次级文字色')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-hero-num'), /font-size:\s*clamp\(56px,\s*8vw,\s*104px\)/, '首屏大数字')
  assert.match(declarationsFor(css, '.cs-focus-bar'), /background:\s*var\(--cs-tone-faint\)/, '进度条轨道')
  assert.match(declarationsFor(css, '.cs-focus-bar i'), /background:\s*var\(--cs-signal\)/, '进度条填充')
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cs-hero-focus/, '减少动效下首屏直接到位')
})

/** 构造一段连续的每日序列；每三天有一整天无观测，用来验证「无记录」与汇总口径。 */
function buildHeatDays(from, to) {
  const days = []
  const last = new Date(to)
  last.setDate(last.getDate() - 1)
  for (let cursor = new Date(from); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    const at = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
    const observed = at.getDate() % 3 !== 0
    days.push({
      dateKey: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`,
      from: at.getTime(),
      to: new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime(),
      onlineMs: observed ? 2 * 3_600_000 : 0,
      activeMs: observed ? 3_600_000 : 0,
      taskMs: observed ? 1_800_000 : 0,
      hasObservations: observed,
    })
  }
  return days
}

test('客户端：热力图默认范围是本地今天往前三个日历月', async () => {
  const { defaultHeatRange, subtractCalendarMonths, HEAT_DEFAULT_RANGE } = await loadClientFunctions()
  assert.equal(HEAT_DEFAULT_RANGE, '3m', '默认范围常量为最近 3 个月')
  const now = new Date(2026, 10, 7, 12, 34, 56).getTime()
  assert.deepEqual({ ...defaultHeatRange(now) }, {
    from: new Date(2026, 7, 7, 0, 0, 0, 0).getTime(),
    to: new Date(2026, 10, 8, 0, 0, 0, 0).getTime(),
  }, '默认从三个月前的本地零点到今天结束')
  assert.equal(
    subtractCalendarMonths(new Date(2026, 4, 31, 10, 30).getTime(), 3),
    new Date(2026, 1, 28, 10, 30).getTime(),
    '月末溢出收敛到目标月最后一天')
  assert.equal(
    subtractCalendarMonths(new Date(2028, 4, 31, 10, 30).getTime(), 3),
    new Date(2028, 1, 29, 10, 30).getTime(),
    '闰年二月保留 29 日')
  assert.equal(
    subtractCalendarMonths(new Date(2026, 0, 15).getTime(), 3),
    new Date(2025, 9, 15).getTime(),
    '跨年回退仍按本地日历月')
})

test('客户端：热力等级为 0–5 且对极值与超峰值钳制', async () => {
  const { heatLevel } = await loadClientFunctions()
  assert.equal(heatLevel(0, 0), 0, '没有峰值时保持 0')
  assert.equal(heatLevel(0, 100), 0, '零活跃为 0')
  assert.equal(heatLevel(1, 100_000), 1, '极小正值至少一级')
  assert.equal(heatLevel(50, 100), 3, '按峰值比例向上取整')
  assert.equal(heatLevel(100, 100), 5, '峰值当天为最深一级')
  assert.equal(heatLevel(150, 100), 5, '超过峰值仍钳制为 5')
})

test('客户端：热力图网格从周一开始且月份刻度对齐首日所在列', async () => {
  const { buildHeatGrid } = await loadClientFunctions()
  const augustRange = { from: new Date(2026, 7, 1).getTime(), to: new Date(2026, 8, 1).getTime() }
  const august = buildHeatGrid(buildHeatDays(augustRange.from, augustRange.to), augustRange)
  assert.equal(august.weekdayLabels.join(','), '一,二,三,四,五,六,日', '默认中文星期刻度固定周一到周日')
  assert.equal(august.weeks.length, 6, '8 月对齐到完整的 6 周')
  assert.ok(august.weeks.every((week) => week.length === 7), '每周恰好 7 格')
  assert.equal(august.weeks[0][0], null, '范围之前的补齐格为空')
  assert.equal(august.weeks[0][5].dateKey, '2026-08-01', '8 月 1 日落在第一列周六')
  assert.equal(august.weeks[0][5].inRange, true)
  const augustColumn = august.weeks.findIndex((week) => week.some((cell) => cell?.dateKey === '2026-08-01'))
  assert.equal(august.months.find((month) => month.abbr === '8月').column, augustColumn, '8月 刻度与 8 月 1 日所在列严格对齐')

  const range = { from: new Date(2026, 7, 7).getTime(), to: new Date(2026, 10, 8).getTime() }
  const grid = buildHeatGrid(buildHeatDays(range.from, range.to), range)
  assert.equal(grid.months.map((month) => month.abbr).join(','), '8月,9月,10月,11月', '默认中文四个月份刻度')
  assert.equal(grid.weeks[0][4].dateKey, '2026-08-07', '首列只保留范围内的日期')
  for (const [abbr, monthNumber] of [['9月', 9], ['10月', 10], ['11月', 11]]) {
    const firstKey = `2026-${String(monthNumber).padStart(2, '0')}-01`
    const column = grid.weeks.findIndex((week) => week.some((cell) => cell?.dateKey === firstKey))
    assert.ok(column >= 0, `${abbr} 1 日必须在网格内`)
    assert.equal(grid.months.find((month) => month.abbr === abbr).column, column, `${abbr} 刻度与当月 1 日所在列严格对齐`)
  }
  // 显式传入英文标签（en 字典调用）时仍是英文界面。
  const english = buildHeatGrid(
    buildHeatDays(range.from, range.to), range,
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  )
  assert.equal(english.weekdayLabels.join(','), 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', '显式英文标签时星期仍为英文')
  assert.equal(english.months.map((month) => month.abbr).join(','), 'Aug,Sep,Oct,Nov', '显式英文标签时月份刻度仍为英文')
})

test('客户端：热力图浮层给出当天三项时长，无观测显示无记录', async () => {
  const { buildHeatTip } = await loadClientFunctions()
  const labels = {
    periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
  }
  const t = (key) => labels[key] ?? key
  const day = {
    dateKey: '2026-11-07',
    from: new Date(2026, 10, 7).getTime(),
    onlineMs: 3 * 3_600_000 + 61_000,
    activeMs: 2 * 3_600_000,
    taskMs: 30 * 60_000,
    hasObservations: true,
  }
  const tip = buildHeatTip(day, t, 'hms')
  assert.equal(tip.kind, 'heat')
  assert.equal(tip.key, '2026-11-07')
  assert.equal(tip.title, '11月7日')
  assert.equal(
    tip.rows.map((row) => `${row.label} ${row.value}`).join(' | '),
    '在线时长 3:01:01 | 活跃 2:00:00 | 任务 0:30:00',
    '有观测时按传入格式显示三项时长')
  const empty = buildHeatTip({ ...day, onlineMs: 0, activeMs: 0, taskMs: 0, hasObservations: false }, t, 'hms')
  const emptyText = [empty.title, ...empty.rows.map((row) => `${row.label} ${row.value}`)].join(' ')
  assert.match(emptyText, /无记录/, '无观测日期标无记录')
  assert.doesNotMatch(emptyText, /0:00:00/, '无观测日期不显示为 0')
})

test('客户端：热力图范围汇总只统计有观测的日期', async () => {
  const { summarizeHeatDays } = await loadClientFunctions()
  const summary = summarizeHeatDays([
    { onlineMs: 1000, activeMs: 600, taskMs: 100, hasObservations: true },
    { onlineMs: 9999, activeMs: 9999, taskMs: 9999, hasObservations: false },
    { onlineMs: 2000, activeMs: 0, taskMs: 0, hasObservations: true },
  ])
  assert.deepEqual({ ...summary }, {
    onlineMs: 3000,
    activeMs: 600,
    taskMs: 100,
    activeDays: 1,
    observedDays: 2,
    dailyAverageActiveMs: 300,
  }, '无观测日期既不求和也不进入分母')
  assert.deepEqual({ ...summarizeHeatDays([]) }, {
    onlineMs: 0, activeMs: 0, taskMs: 0, activeDays: 0, observedDays: 0, dailyAverageActiveMs: 0,
  }, '空序列汇总全为 0')
})

test('客户端：热力图首屏范围统计给出六项数值并只计算有观测的日期', async () => {
  const { summarizeHeatFocus } = await loadClientFunctions()
  const summary = summarizeHeatFocus([
    { dateKey: '2026-11-01', onlineMs: 4 * 3_600_000, activeMs: 2 * 3_600_000, taskMs: 3_600_000, hasObservations: true },
    { dateKey: '2026-11-02', onlineMs: 999, activeMs: 999, taskMs: 999, hasObservations: false },
    { dateKey: '2026-11-03', onlineMs: 2 * 3_600_000, activeMs: 3_600_000, taskMs: 1_800_000, hasObservations: true },
    { dateKey: '2026-11-04', onlineMs: 6 * 3_600_000, activeMs: 3 * 3_600_000, taskMs: 2 * 3_600_000, hasObservations: true },
  ])
  const { peakDay, ...ranges } = summary
  assert.deepEqual({ ...ranges }, {
    onlineMs: 12 * 3_600_000,
    activeMs: 6 * 3_600_000,
    taskMs: 3.5 * 3_600_000,
    activeDays: 3,
    observedDays: 3,
    dailyAverageActiveMs: 2 * 3_600_000,
  }, '六项范围数值只累加有观测日期')
  assert.deepEqual({ ...peakDay }, { dateKey: '2026-11-04', activeMs: 3 * 3_600_000 }, '峰值日取活跃最大的一天')
  assert.deepEqual({ ...summarizeHeatFocus([]) }, {
    onlineMs: 0,
    activeMs: 0,
    taskMs: 0,
    activeDays: 0,
    observedDays: 0,
    dailyAverageActiveMs: 0,
    peakDay: null,
  }, '无观测时全部为 0 且没有峰值日')
  assert.equal(
    summarizeHeatFocus([
      { dateKey: '2026-11-01', activeMs: 1, hasObservations: true },
      { dateKey: '2026-11-02', activeMs: 2, hasObservations: true },
    ]).dailyAverageActiveMs,
    2,
    '日均活跃按观测日四舍五入')
})

test('客户端：热力图汇总优先复用 Host summary 且对外字段不变', async () => {
  const { summarizeHeatDays, summarizeHeatFocus } = await loadClientFunctions()
  const days = [
    { dateKey: '2026-11-01', onlineMs: 3_600_000, activeMs: 1_800_000, taskMs: 600_000, hasObservations: true },
    { dateKey: '2026-11-02', onlineMs: 9_000_000, activeMs: 9_000_000, taskMs: 9_000_000, hasObservations: true },
  ]
  const hostSummary = {
    onlineMs: 72 * 3_600_000,
    activeMs: 48 * 3_600_000,
    taskMs: 12 * 3_600_000,
    activeDays: 7,
    observedDays: 9,
    dailyAverageActiveMs: 5 * 3_600_000,
    peak: { dateKey: '2026-11-02', activeMs: 48 * 3_600_000 },
  }
  const { peakDay, ...focusRanges } = summarizeHeatFocus(days, hostSummary)
  assert.deepEqual({ ...focusRanges }, {
    onlineMs: hostSummary.onlineMs,
    activeMs: hostSummary.activeMs,
    taskMs: hostSummary.taskMs,
    activeDays: hostSummary.activeDays,
    observedDays: hostSummary.observedDays,
    dailyAverageActiveMs: hostSummary.dailyAverageActiveMs,
  }, '传入 Host summary 时不再用 days 重算')
  assert.deepEqual({ ...peakDay }, { ...hostSummary.peak }, '峰值映射为 peakDay')

  const summary = summarizeHeatDays(days, hostSummary)
  assert.deepEqual({ ...summary }, {
    onlineMs: hostSummary.onlineMs,
    activeMs: hostSummary.activeMs,
    taskMs: hostSummary.taskMs,
    activeDays: hostSummary.activeDays,
    observedDays: hostSummary.observedDays,
    dailyAverageActiveMs: hostSummary.dailyAverageActiveMs,
  }, '普通汇总复用同一份 Host summary 且不新增字段')
})

test('客户端：热力图全范围复用 Host summary，过滤范围仍按 scopedDays 计算', async () => {
  const { renderDailyHeatmap, renderHeatmapFocusPage } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日时长', heatmapInfo: '每格代表一天', heatmapFocusTitle: '热力图首屏',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    rangeOnline: '范围在线', rangeActive: '范围活跃', rangeTask: '范围任务',
    peakDay: '最活跃日', activeDaysLabel: '活跃天数', dailyAverageActive: '日均活跃',
    heatmapLoading: '正在加载每日时长…', heatmapEmpty: '暂无每日记录',
  }
  const t = (key) => labels[key] ?? key
  const days = [
    heatDay('2026-01-01', 3_600_000),
    heatDay('2026-02-01', 2 * 3_600_000),
    heatDay('2026-03-01', 9 * 3_600_000),
  ]
  const range = { from: new Date(2026, 2, 16).getTime(), to: new Date(2026, 2, 16).getTime() }
  const series = {
    range,
    days,
    summary: {
      onlineMs: 72 * 3_600_000,
      activeMs: 24 * 3_600_000,
      taskMs: 12 * 3_600_000,
      activeDays: 7,
      observedDays: 9,
      dailyAverageActiveMs: 3_600_000,
      peak: { dateKey: '2026-02-01', activeMs: 24 * 3_600_000 },
    },
  }
  const common = {
    series, status: 'ready', t, format: 'hms',
    nowMs: new Date(2026, 2, 16, 12).getTime(),
    hoverTip: { tip: null, show() {}, hide() {} },
    rangeValue: '6m', onSelectRange() {},
  }
  const full = renderDailyHeatmap(common)
  const fullSummary = textOf(findByClass(full, 'heat-summary'))
  assert.match(fullSummary, /范围活跃 24:00:00/, '整段查询直接使用 Host 的 activeMs')
  assert.match(fullSummary, /活跃天数 7\/9/, '整段查询直接使用 Host 的 activeDays/observedDays')

  const focus = renderHeatmapFocusPage(common)
  const panel = textOf(findByClass(focus, 'heat-focus-panel'))
  assert.match(panel, /范围活跃 24:00:00/, '首屏范围活跃复用 Host summary')
  assert.match(panel, /7\/9/, '首屏活跃天数复用 Host summary')
  assert.match(panel, /2月1日 · 24:00:00/, 'Host 峰值映射为 peakDay 并显示对应日期')

  const filtered = renderDailyHeatmap({ ...common, rangeValue: 2 })
  const filteredSummary = textOf(findByClass(filtered, 'heat-summary'))
  assert.match(filteredSummary, /范围活跃 2:00:00/, '单月过滤后按 scopedDays 客户端求和')
  assert.match(filteredSummary, /活跃天数 1\/1/)
  assert.doesNotMatch(filteredSummary, /24:00:00/, '过滤范围不复用整段 Host summary')
})

test('客户端：热力图首屏独立页给出六项范围统计、12 个月度条与退出按钮', async () => {
  const { renderHeatmapFocusPage, Select } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日时长', heatmapFocusTitle: '热力图首屏', heatmapInfo: '每格代表一天',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', monthBars: '月度活跃', periodDay: '日',
    onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务', noRecord: '无记录',
    heatDayTitle: '{month}月{day}日',
    rangeOnline: '范围在线', rangeActive: '范围活跃', rangeTask: '范围任务',
    peakDay: '最活跃日', activeDaysLabel: '活跃天数', dailyAverageActive: '日均活跃',
    focusSet: '设为首屏', focusUnset: '退出首屏', focusSummary: '首屏概览',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日时长…', heatmapEmpty: '暂无每日记录',
  }
  const t = (key) => labels[key] ?? key
  const nowMs = new Date(2026, 10, 7, 12).getTime()
  const range = { from: new Date(2026, 7, 7).getTime(), to: new Date(2026, 10, 8).getTime() }
  const day = (dayOfMonth, onlineMs, activeMs, taskMs) => ({
    dateKey: `2026-11-${String(dayOfMonth).padStart(2, '0')}`,
    from: new Date(2026, 10, dayOfMonth).getTime(),
    to: new Date(2026, 10, dayOfMonth + 1).getTime(),
    onlineMs,
    activeMs,
    taskMs,
    hasObservations: true,
  })
  const days = [
    day(1, 4 * 3_600_000, 2 * 3_600_000, 3_600_000),
    day(2, 2 * 3_600_000, 3_600_000, 1_800_000),
    day(3, 6 * 3_600_000, 3 * 3_600_000, 2 * 3_600_000),
  ]
  const calls = []
  const props = {
    series: { range, days }, status: 'ready', t, format: 'hms', nowMs,
    hoverTip: { tip: null, show() {}, hide() {} },
    rangeValue: '3m', onSelectRange() {}, onToggleFocus: (value) => calls.push(value),
  }
  const page = renderHeatmapFocusPage(props)
  assert.equal(page.props['data-focus'], 'heatmap', '首屏语义为 heatmap')
  assert.equal(allOf(page, byClass('cs-heatmap-focus-page')).length, 1, '独立首屏页外壳')
  assert.equal(allOf(page, byClass('cs-heatmap-focus')).length, 1, '热力图卡片进入放大态')
  assert.match(textOf(page), /热力图首屏/, '首屏页使用专属标题')
  const panel = allOf(page, byClass('heat-focus-panel'))[0]
  assert.ok(panel, '右侧统计栏存在')
  const panelText = textOf(panel)
  for (const expected of ['范围在线', '范围活跃', '范围任务', '最活跃日', '活跃天数', '日均活跃']) {
    assert.match(panelText, new RegExp(expected), `统计栏包含「${expected}」`)
  }
  assert.match(panelText, /12:00:00/, '范围在线为 4h + 2h + 6h')
  assert.match(panelText, /6:00:00/, '范围活跃为 2h + 1h + 3h')
  assert.match(panelText, /3:30:00/, '范围任务为 1h + 0.5h + 2h')
  assert.match(panelText, /11月3日 · 3:00:00/, '最活跃日为 11 月 3 日')
  assert.match(panelText, /3\/3/, '活跃天数为 3/3')
  assert.match(panelText, /2:00:00/, '日均活跃为 6h / 3 天')
  assert.equal(allOf(page, byClass('heat-summary')).length, 0, '首屏不重复普通范围汇总')
  assert.equal(allOf(page, byClass('heat-month-bar')).length, 12, '正文下方保留 12 个月度条')
  assert.equal(allOf(page, byClass('heat-month-bar'))[0].props['data-month'], '1月', '首屏月度条月份名使用中文')
  const picker = allOf(page, (node) => node.type === Select)[0]
  assert.ok(picker, '首屏复用统一自定义下拉')
  assert.equal(picker.props.options.length, 15, '范围选择器一次展示全部 15 项')
  const zoom = allOf(page, byClass('cs-zoom-btn'))[0]
  assert.ok(zoom, '首屏页有缩放按钮')
  assert.equal(zoom.props['aria-label'], '退出首屏')
  assert.equal(zoom.props['aria-pressed'], true)
  zoom.props.onClick()
  assert.deepEqual(calls, ['heatmap'], '再次点击请求缩回普通概览')

  for (const [value, label] of [['3m', '3m'], [11, '单月'], ['year', '全年']]) {
    const variant = renderHeatmapFocusPage({ ...props, rangeValue: value })
    assert.equal(allOf(variant, byClass('heat-month-bar')).length, 12, `${label}放大态同样有 12 个月度条`)
    assert.equal(allOf(variant, byClass('cs-heatmap-focus')).length, 1, `${label}放大态仍为自适应卡片`)
  }
})

test('客户端：热力图卡片含月份刻度、星期标签与浮层，且无图例和单日明细', async () => {
  const { renderDailyHeatmap, renderOverviewView } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日时长', heatmapInfo: '每格代表一天',
    periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日时长…', heatmapEmpty: '暂无每日记录',
  }
  const t = (key) => labels[key] ?? key
  const range = { from: new Date(2026, 7, 1).getTime(), to: new Date(2026, 8, 1).getTime() }
  const series = { range, days: buildHeatDays(range.from, range.to) }
  const shown = []
  const hoverTip = { tip: null, show(tip) { shown.push(tip) }, hide() { shown.push(null) } }
  const tree = renderDailyHeatmap({
    series, status: 'ready', t, format: 'hms',
    nowMs: new Date(2026, 7, 15, 12).getTime(), hoverTip,
  })
  assert.equal(allOf(tree, byClass('cs-heatmap-card')).length, 1, '概览中的每日热力图卡片')
  assert.equal(allOf(tree, byClass('heat-legend')).length, 0, '没有深浅图例')
  assert.equal(allOf(tree, byClass('heat-detail')).length, 0, '没有下方重复的单日明细')

  const monthRow = allOf(tree, byClass('heat-months'))[0]
  assert.ok(monthRow, '存在月份刻度行')
  assert.match(textOf(monthRow), /8月/, '月份刻度使用中文月份')
  const weekdayRow = allOf(tree, byClass('heat-weekdays'))[0]
  assert.ok(weekdayRow, '存在星期刻度')
  const weekdayText = textOf(weekdayRow)
  for (const label of ['一', '二', '三', '四', '五', '六', '日']) {
    assert.match(weekdayText, new RegExp(label))
  }
  // 3m/6m 的月份刻度仍在网格上方，全年才移到网格下方。
  const heatBody = findByClass(tree, 'heatmap-body')
  assert.ok(heatBody && !hasClass(heatBody, 'is-year'), '3m/6m 容器不带 is-year')
  assert.equal(typeof heatBody.props.ref, 'function', '横向滚动容器挂初始对齐回调')
  const scrollNode = { dataset: {}, scrollLeft: 0, scrollWidth: 900, clientWidth: 300 }
  heatBody.props.ref(scrollNode)
  assert.equal(scrollNode.scrollLeft, 600, '初始滚动停在最右列，即当前实时月份')
  assert.ok(scrollNode.dataset.csScrollKey, '记住已经对齐过的范围')
  scrollNode.scrollLeft = 0
  heatBody.props.ref(scrollNode)
  assert.equal(scrollNode.scrollLeft, 0, '同一范围内重渲染不打断用户手动滚动')
  const heatPlot = findByClass(tree, 'heat-plot')
  assert.ok(hasClass(heatPlot.children.filter(Boolean)[0], 'heat-months'), '3m/6m 月份刻度位于网格上方')

  const grid = allOf(tree, byClass('heat-weekgrid'))[0]
  assert.ok(grid, '存在热力图网格')
  const cells = findAll(grid, (node) => hasClass(node, 'heat-cell'))
  const augustIndex = cells.findIndex((cell) => cell.props['data-date'] === '2026-08-01')
  assert.ok(augustIndex >= 0, '8 月 1 日格子存在')
  const augustLabel = findAll(monthRow, (node) => node.props?.['data-column'] !== undefined && textOf(node) === '8月')[0]
  assert.ok(augustLabel, '8月 刻度存在')
  assert.equal(Number(augustLabel.props['data-column']), Math.floor(augustIndex / 7), '8月 刻度与 8 月 1 日所在列严格对齐')

  const observed = cells.find((cell) => !hasClass(cell, 'is-pad') && !hasClass(cell, 'is-empty'))
  assert.ok(observed, '有可聚焦的观测格')
  assert.equal(observed.props.tabIndex, 0)
  assert.equal(observed.props.role, 'button')
  assert.match(String(observed.props['aria-label']), /活跃/)
  observed.props.onMouseEnter(fakeEvent())
  assert.equal(shown.length, 1)
  assert.equal(shown[0].kind, 'heat')
  assert.equal(shown[0].rows.length, 3, '浮层显示在线/活跃/任务三项')
  assert.equal(shown[0].rows.map((row) => row.label).join(','), '在线时长,活跃,任务')
  observed.props.onMouseLeave()
  assert.equal(shown[shown.length - 1], null, '移出后收起浮层')
  observed.props.onFocus(fakeEvent())
  assert.equal(shown[shown.length - 1].kind, 'heat', '键盘聚焦同样浮出')

  const empty = cells.find((cell) => hasClass(cell, 'is-empty'))
  assert.ok(empty, '无观测日期有独立样式')
  assert.match(String(empty.props['aria-label']), /无记录/)
  empty.props.onMouseEnter(fakeEvent())
  const emptyTip = shown[shown.length - 1]
  const emptyText = [emptyTip.title, ...emptyTip.rows.map((row) => `${row.label} ${row.value}`)].join(' ')
  assert.match(emptyText, /无记录/)
  assert.doesNotMatch(emptyText, /0:00:00/, '无观测日期不显示为 0')

  const summary = allOf(tree, byClass('heat-summary'))[0]
  assert.ok(summary, '底部只有范围汇总')
  assert.match(textOf(summary), /范围活跃/)
  assert.match(textOf(summary), /活跃天数 21\/21/)

  const loading = renderDailyHeatmap({ series: null, status: 'loading', t, format: 'hms', nowMs: range.from, hoverTip })
  assert.match(textOf(loading), /正在加载每日时长/)
  assert.equal(allOf(loading, byClass('cs-heatmap-card')).length, 1, '加载时也保留卡片骨架')

  const overview = renderOverviewView({
    data: sampleDashboardData(), t, isZh: true, period: 'day', onSelectPeriod() {},
    durationFormat: 'hms', hoverTip, nowMs: new Date(2026, 7, 15).getTime(), onOpenWorkspace() {},
    heatSeries: series, heatStatus: 'ready',
  })
  assert.equal(allOf(overview, byClass('cs-heatmap-card')).length, 1, '概览嵌入每日热力图')
})

test('客户端：热力图月份绝对定位、星期与网格共用七行对齐', async () => {
  const css = await loadClientCss()
  const card = declarationsFor(css, '.cs-heatmap-card')
  assert.match(card, /--cs-heat-cell:\s*clamp\(/, '周网格格子尺寸按可用宽度自适应')
  assert.match(card, /--cs-heat-gap:\s*3px/)
  assert.match(declarationsFor(css, '.heat-months'), /position:\s*relative/)
  assert.match(declarationsFor(css, '.heat-months span'), /position:\s*absolute/)
  const grid = declarationsFor(css, '.heat-weekgrid')
  assert.match(grid, /grid-auto-flow:\s*column/, '按列排周')
  assert.match(grid, /grid-template-rows:\s*repeat\(7,\s*var\(--cs-heat-cell\)\)/, '七行对应周一到周日')
  assert.match(grid, /grid-auto-columns:\s*var\(--cs-heat-cell\)/)
  const weekdays = declarationsFor(css, '.heat-weekday-list')
  assert.match(weekdays, /grid-template-rows:\s*repeat\(7,\s*var\(--cs-heat-cell\)\)/, '星期刻度与格子共用七行网格')
  assert.match(weekdays, /row-gap:\s*var\(--cs-heat-gap\)/)
  for (let step = 1; step <= 5; step += 1) {
    assert.match(css, new RegExp(`\\.heat-cell\\.l${step}\\s*\\{\\s*background:\\s*var\\(--cs-heat-${step}\\)`), `热力等级 ${step} 使用对应 token`)
  }
  for (const color of ['#c9d8ea', '#9fbde0', '#5e8fc9', '#1F4E94']) {
    assert.match(css, new RegExp(color, 'i'), `默认蓝热力色阶包含 ${color}`)
  }
})

test('客户端：条状图首屏统计给出峰值桶、最活跃时段、活跃占比与任务时长', async () => {
  const { trendFocusStats } = await loadClientFunctions()
  const data = sampleDashboardData()
  const stats = trendFocusStats(data, 'day', true, 'hms')
  assert.equal(stats.peakMs, 3_600_000, '峰值取最大活跃桶')
  assert.equal(stats.peakLabel, '11:00', '最活跃时段用统一的桶标签')
  assert.equal(stats.activeSharePct, 75, '活跃占比 = 3:00:00 / 4:00:00')
  assert.equal(stats.taskMs, 3_600_000, '任务时长取当前周期总任务时长')

  const empty = trendFocusStats({ trend: [], activeMs: 0, onlineMs: 0, taskMs: 0 }, 'day', true, 'hms')
  assert.equal(empty.peakMs, 0)
  assert.equal(empty.peakLabel, '—')
  assert.equal(empty.activeSharePct, 0)
  assert.equal(empty.taskMs, 0)
})

test('客户端：条状图首屏独立成页，按可用高度重排并给出统计与悬停浮层', async () => {
  const { renderTrendFocusPage, TREND_FOCUS_HEIGHT } = await loadClientFunctions()
  assert.equal(TREND_FOCUS_HEIGHT, 360, '首屏图形使用独立高度')
  const labels = {
    trendFocusTitle: '条状图首屏', focusSummary: '首屏概览', trendInfo: '活跃与任务独立统计',
    activeLabel: '活跃', taskLabel: '任务', peakActive: '峰值活跃', peakPeriod: '最活跃时段',
    activeShare: '活跃占比', focusSet: '设为首屏', focusUnset: '退出首屏', emptyDashboard: '暂无记录',
  }
  const t = (key) => labels[key] ?? key
  const calls = []
  const hoverEvents = []
  const page = renderTrendFocusPage({
    data: sampleDashboardData(), t, isZh: true, period: 'day', format: 'hms',
    hoverTip: { tip: null, show: (content) => hoverEvents.push(content), hide() {} },
    onToggleFocus: (value) => calls.push(value),
  })
  assert.match(page.props.className, /\bcs-trend-focus\b/, '放大态是独立首屏页')
  assert.equal(page.props['data-focus'], 'trend', '与活跃时长共用 data-focus 语义')
  assert.equal(page.props.style['--cs-focus-ms'], '240ms', '首屏转场时长变量与 hero 页一致')

  const panel = allOf(page, byClass('cs-focus-panel'))[0]
  assert.ok(panel, '统计面板存在')
  const panelText = textOf(panel)
  for (const expected of ['峰值活跃', '最活跃时段', '活跃占比', '任务']) {
    assert.match(panelText, new RegExp(expected), `统计面板包含「${expected}」`)
  }
  assert.match(panelText, /1:00:00/, '峰值活跃为最大桶的活跃时长')
  assert.match(panelText, /11:00/, '最活跃时段')
  assert.match(panelText, /75%/, '活跃占比')
  assert.match(panelText, /任务 1:00:00/, '任务时长')

  const chartSvg = allOf(page, (node) => node.type === 'svg' && node.props?.viewBox === `0 0 1000 ${TREND_FOCUS_HEIGHT}`)[0]
  assert.ok(chartSvg, 'SVG 视图高度随首屏高度重算')
  const bars = allOf(page, byClass('cs-bar'))
  assert.ok(bars.length >= 2, '首屏仍渲染真实柱形')
  const tallest = Math.max(...bars.map((bar) => bar.props.height))
  assert.equal(tallest, TREND_FOCUS_HEIGHT - 12, '柱高按可用高度计算而不是拉宽')

  const groups = allOf(page, byClass('cs-bar-group'))
  groups[1].props.onMouseEnter(fakeEvent())
  assert.equal(hoverEvents[0].title, '11:00', '悬停浮出该时段')
  assert.equal(hoverEvents[0].rows[0].value, '1:00:00', '浮出活跃时长')
  assert.equal(hoverEvents[0].rows[1].value, '0:30:00', '浮出任务时长')

  const zoom = allOf(page, byClass('cs-zoom-btn'))[0]
  assert.equal(zoom.props['aria-label'], '退出首屏')
  assert.equal(zoom.props['aria-pressed'], true)
  zoom.props.onClick()
  assert.deepEqual(calls, ['trend'], '再次点击缩回并回到同一首屏状态')
})

test('客户端：概览趋势卡复用首屏缩放按钮，趋势视图不传回调时不渲染按钮', async () => {
  const { renderTrendCard } = await loadClientFunctions()
  const labels = {
    trendDay: '今日逐小时', trendWeek: '本周每日', trendMonth: '本月每日',
    trendInfo: '活跃与任务独立统计', activeLabel: '活跃', taskLabel: '任务',
    focusSet: '设为首屏', focusUnset: '退出首屏',
  }
  const t = (key) => labels[key] ?? key
  const hoverTip = { tip: null, show() {}, hide() {} }
  const data = sampleDashboardData()
  const calls = []
  const card = renderTrendCard(data, t, true, hoverTip, 'hms', 'day', {
    focus: null, onToggleFocus: (value) => calls.push(value),
  })
  const button = allOf(card, byClass('cs-zoom-btn'))[0]
  assert.ok(button, '概览趋势卡右上角有缩放按钮')
  assert.equal(button.props['aria-label'], '设为首屏')
  assert.equal(button.props['aria-pressed'], false)
  button.props.onClick()
  assert.deepEqual(calls, ['trend'], '点击把趋势卡设为首屏')

  const focused = renderTrendCard(data, t, true, hoverTip, 'hms', 'day', {
    focus: 'trend', onToggleFocus: () => {},
  })
  const focusedButton = allOf(focused, byClass('cs-zoom-btn'))[0]
  assert.equal(focusedButton.props['aria-label'], '退出首屏', '首屏态图标语义为缩回')
  assert.equal(focusedButton.props['aria-pressed'], true)

  const plain = renderTrendCard(data, t, true, hoverTip, 'hms', 'day')
  assert.equal(allOf(plain, byClass('cs-zoom-btn')).length, 0, '趋势视图复用同一卡片时不显示按钮')
})

test('客户端：条状图首屏按可用高度铺开、悬停分组放大并尊重减少动效', async () => {
  const css = await loadClientCss()
  assert.match(declarationsFor(css, '.cs-trend-focus'), /min-height:\s*calc\(100vh - 260px\)/, '首屏页占满可用高度')
  const chart = declarationsFor(css, '.cs-trend-focus .cs-chart')
  assert.match(chart, /height:\s*calc\(100vh - 420px\)/, '图表容器按视口高度铺开')
  assert.match(declarationsFor(css, '.cs-trend-focus .cs-plot'), /flex:\s*1/, '绘图区弹性填满容器')
  assert.match(declarationsFor(css, '.cs-trend-focus .cs-chart svg'), /height:\s*100%/, 'SVG 填满绘图区')
  assert.match(
    declarationsFor(css, '.cs-trend-focus .cs-bar-group:hover .cs-bar-pair'),
    /scale\(1\.3/,
    '悬停分组放大到 1.3 倍')
  assert.match(
    declarationsFor(css, '.cs-trend-focus .cs-bar-group:hover .cs-bar-pair'),
    /brightness\(1\.12\)/,
    '悬停分组提亮')
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cs-trend-focus/, '减少动效下取消首屏动画')
})

test('客户端：热力图格子悬停与键盘聚焦时放大提亮', async () => {
  const css = await loadClientCss()
  const base = declarationsFor(css, '.heat-cell[role="button"]')
  assert.match(base, /position:\s*relative/)
  assert.match(base, /transition:\s*transform\s+120ms\s+ease,\s*filter\s+120ms\s+ease/)
  for (const selector of ['.heat-cell[role="button"]:hover', '.heat-cell[role="button"]:focus-visible']) {
    const declarations = declarationsFor(css, selector)
    assert.match(declarations, /transform:\s*scale\(1\.35\)/, `${selector} 放大到 1.35 倍`)
    assert.match(declarations, /filter:\s*brightness\(1\.12\)/, `${selector} 提亮`)
    assert.match(declarations, /z-index:\s*3/, `${selector} 提升层级不被相邻格遮挡`)
  }
})

/** 构造指定日期的日序列单元，用于范围口径与相邻月份污染测试。 */
function heatDay(dateKey, activeMs, hasObservations = true) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const at = new Date(year, month - 1, day)
  return {
    dateKey,
    from: at.getTime(),
    to: new Date(year, month - 1, day + 1).getTime(),
    onlineMs: hasObservations ? activeMs * 2 : 0,
    activeMs: hasObservations ? activeMs : 0,
    taskMs: hasObservations ? Math.floor(activeMs / 2) : 0,
    hasObservations,
  }
}

test('客户端：热力图范围选项覆盖 3m/6m/全年与 12 个英文月份', async () => {
  const { HEAT_RANGE_OPTIONS } = await loadClientFunctions()
  assert.ok(Array.isArray(HEAT_RANGE_OPTIONS), '范围选项是数组')
  assert.equal(HEAT_RANGE_OPTIONS.length, 15, '3 个跨度 + 12 个月份')
  assert.deepEqual(
    Array.from(HEAT_RANGE_OPTIONS, (option) => option.value),
    ['3m', '6m', 'year', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    '顺序固定为 3m、6m、year、Jan…Dec，月份值是数字 1–12')
  assert.deepEqual(
    Array.from(HEAT_RANGE_OPTIONS.slice(3), (option) => option.label),
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    '月份选项一律英文缩写')
  assert.equal(HEAT_RANGE_OPTIONS[0].label, '3m')
  assert.equal(HEAT_RANGE_OPTIONS[1].label, '6m')
  assert.equal(HEAT_RANGE_OPTIONS[2].label, 'year')
})

test('客户端：热力图范围解析为本地日历边界，无效值回落 3m', async () => {
  const { resolveHeatRange } = await loadClientFunctions()
  const now = new Date(2026, 10, 7, 12, 34, 56).getTime()
  const three = resolveHeatRange('3m', now)
  assert.deepEqual({ ...three }, {
    value: '3m',
    from: new Date(2026, 7, 7, 0, 0, 0, 0).getTime(),
    to: new Date(2026, 10, 8, 0, 0, 0, 0).getTime(),
  }, '3m 从三个月前的本地零点到今天结束')
  const six = resolveHeatRange('6m', now)
  assert.deepEqual({ ...six }, {
    value: '6m',
    from: new Date(2026, 4, 7, 0, 0, 0, 0).getTime(),
    to: new Date(2026, 10, 8, 0, 0, 0, 0).getTime(),
  }, '6m 从六个月前的本地零点到今天结束')
  assert.deepEqual({ ...resolveHeatRange('year', now) }, {
    value: 'year',
    from: new Date(2026, 0, 1, 0, 0, 0, 0).getTime(),
    to: new Date(2027, 0, 1, 0, 0, 0, 0).getTime(),
  }, '全年为本地当年 1 月 1 日到次年 1 月 1 日')
  assert.deepEqual({ ...resolveHeatRange(1, now) }, {
    value: 1,
    month: 0,
    from: new Date(2026, 0, 1, 0, 0, 0, 0).getTime(),
    to: new Date(2026, 1, 1, 0, 0, 0, 0).getTime(),
  }, '1 月范围只覆盖本月，规范值输出数字')
  assert.deepEqual({ ...resolveHeatRange('1', now) }, { ...resolveHeatRange(1, now) }, '旧字符串月份仍兼容并输出数字')
  assert.deepEqual({ ...resolveHeatRange(12, now) }, {
    value: 12,
    month: 11,
    from: new Date(2026, 11, 1, 0, 0, 0, 0).getTime(),
    to: new Date(2027, 0, 1, 0, 0, 0, 0).getTime(),
  }, '12 月范围跨到次年 1 月 1 日')
  for (const invalid of ['0', '13', 'abc', '', null, undefined, 'yearish']) {
    const result = resolveHeatRange(invalid, now)
    assert.equal(result.value, '3m', `无效值 ${String(invalid)} 规范化为 3m`)
    assert.equal(result.from, three.from, `无效值 ${String(invalid)} 沿用 3m 起点`)
    assert.equal(result.to, three.to, `无效值 ${String(invalid)} 沿用 3m 终点`)
  }
})

test('客户端：热力图范围标签与布局类型只认 3m/6m/year/1-12', async () => {
  const { heatRangeLabel, heatLayoutFor } = await loadClientFunctions()
  assert.equal(heatRangeLabel('3m'), '3m')
  assert.equal(heatRangeLabel('6m'), '6m')
  assert.equal(heatRangeLabel('year'), 'year')
  assert.equal(heatRangeLabel(1), 'Jan')
  assert.equal(heatRangeLabel(7), 'Jul')
  assert.equal(heatRangeLabel(12), 'Dec')
  assert.equal(heatRangeLabel('7'), 'Jul', '旧字符串月份仍兼容')
  assert.equal(heatRangeLabel('bogus'), '3m', '无效值回落 3m')
  assert.equal(heatRangeLabel(0), '3m')
  assert.equal(heatLayoutFor('year'), 'year')
  assert.equal(heatLayoutFor(1), 'month')
  assert.equal(heatLayoutFor('1'), 'month', '旧字符串月份仍兼容')
  assert.equal(heatLayoutFor(12), 'month')
  assert.equal(heatLayoutFor('3m'), 'weeks')
  assert.equal(heatLayoutFor('6m'), 'weeks')
  assert.equal(heatLayoutFor('bogus'), 'weeks', '无效值按 3m 的周网格渲染')
})

test('客户端：单月网格从周一开始、前后补齐为 null 且只含本月日期', async () => {
  const { buildMonthGrid } = await loadClientFunctions()
  const augustRange = { from: new Date(2026, 7, 1).getTime(), to: new Date(2026, 8, 1).getTime() }
  // 2026-08-01 是周六：第一周应有 5 个前补格。
  const days = [
    ...buildHeatDays(augustRange.from, augustRange.to),
    heatDay('2026-07-31', 99 * 3_600_000),
    heatDay('2026-09-01', 99 * 3_600_000),
  ]
  const grid = buildMonthGrid(days, augustRange)
  assert.equal(grid.weekdayLabels.join(','), '一,二,三,四,五,六,日', '默认中文星期刻度固定周一到周日')
  assert.equal(grid.daysInMonth, 31)
  assert.equal(grid.weeks.length, 6, '8 月对齐到完整的 6 周')
  assert.ok(grid.weeks.every((week) => week.length === 7), '每周恰好 7 格')
  assert.deepEqual(Array.from(grid.weeks[0].slice(0, 5)), [null, null, null, null, null], '月初前补齐为 null')
  assert.equal(grid.weeks[0][5].dateKey, '2026-08-01', '8 月 1 日落在第一周周六')
  assert.equal(grid.weeks[0][5].inRange, true)
  const keys = grid.weeks.flat().filter(Boolean).map((cell) => cell.dateKey)
  assert.equal(keys.length, 31, '单月只保留 31 个日期格')
  assert.ok(keys.every((key) => key.startsWith('2026-08-')), '相邻月份日期不进入单月网格')
  assert.ok(!keys.includes('2026-07-31'), '前补格里的 7 月 31 日不显示')
  assert.ok(!keys.includes('2026-09-01'), '后补格里的 9 月 1 日不显示')
  assert.equal(grid.weeks[5].filter(Boolean).length, 1, '最后一周只有 31 日一天')
  const juneRange = { from: new Date(2026, 5, 1).getTime(), to: new Date(2026, 6, 1).getTime() }
  const june = buildMonthGrid([], juneRange)
  assert.equal(june.weeks[0][0].dateKey, '2026-06-01', '6 月 1 日是周一，无前补格')
  assert.equal(june.weeks[0][0].day.hasObservations, false, '缺失日期补成无观测格')

  // 显式传入英文标签时仍是英文界面。
  const english = buildMonthGrid(days, augustRange, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  assert.equal(english.weekdayLabels.join(','), 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', '显式英文标签时星期仍为英文')
})

test('客户端：全年月度条数据仍是 12 月 × 31 格，默认中文刻度且只统计有观测的日期', async () => {
  const { buildYearMatrix, HEAT_MONTH_ABBR } = await loadClientFunctions()
  const days = [
    heatDay('2026-01-01', 3_600_000),
    { ...heatDay('2026-01-02', 99 * 3_600_000), hasObservations: false, activeMs: 99 * 3_600_000 },
    heatDay('2026-02-28', 1_800_000),
    heatDay('2025-12-31', 77 * 3_600_000),
  ]
  const matrix = buildYearMatrix(days, 2026)
  assert.equal(matrix.year, 2026)
  assert.equal(matrix.months.length, 12)
  assert.deepEqual(
    Array.from(matrix.months, (month) => month.abbr),
    ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    '默认中文月份刻度为 1月…12月')
  assert.deepEqual(
    Array.from(HEAT_MONTH_ABBR),
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    '英文缩写常量保留作英文回退')
  const english = buildYearMatrix(days, 2026, HEAT_MONTH_ABBR)
  assert.deepEqual(Array.from(english.months, (month) => month.abbr), Array.from(HEAT_MONTH_ABBR), '显式英文标签时月份刻度仍为英文')
  assert.deepEqual(Array.from(matrix.months, (month) => month.month), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  assert.ok(matrix.months.every((month) => month.days.length === 31), '每月一行 31 格')
  assert.equal(matrix.months[1].days[27].dateKey, '2026-02-28')
  assert.equal(matrix.months[1].days[28], null, '2 月 29 日超出当月天数')
  assert.equal(matrix.months[1].days[29], null)
  assert.equal(matrix.months[1].days[30], null)
  assert.equal(matrix.months[0].days[0].day.activeMs, 3_600_000, '1 月 1 日取到真实日数据')
  assert.equal(matrix.months[1].days[0].day.hasObservations, false, '缺失日期补成无观测格')
  assert.equal(matrix.bars.length, 12, '下方 12 个月度条')
  assert.deepEqual(Array.from(matrix.bars, (bar) => bar.month), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  assert.equal(matrix.bars[0].activeMs, 3_600_000, '无观测日期不计入月度条，跨年日期也不混入')
  assert.equal(matrix.bars[1].activeMs, 1_800_000)
  assert.equal(matrix.bars[2].activeMs, 0)
})

test('客户端：全年视图为 7 行 × 约 53 列周网格，中文月份刻度位于网格下方', async () => {
  const { renderDailyHeatmap } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日时长', heatmapInfo: '每格代表一天', yearHeatTitle: '全年每日时长',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    monthBars: '月度活跃', periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日时长…', heatmapEmpty: '暂无每日记录',
  }
  const t = (key) => labels[key] ?? key
  const range = { from: new Date(2026, 0, 1).getTime(), to: new Date(2027, 0, 1).getTime() }
  // 稀疏序列也能撑起完整全年周网格；首屏月度条高度只取决于真实观测。
  const series = { range, days: [heatDay('2026-01-01', 3_600_000), heatDay('2026-02-28', 1_800_000)] }
  const shown = []
  const hoverTip = { tip: null, show(tip) { shown.push(tip) }, hide() { shown.push(null) } }
  const tree = renderDailyHeatmap({
    series, status: 'ready', t, format: 'hms',
    nowMs: new Date(2026, 10, 7, 12).getTime(), hoverTip, rangeValue: 'year',
  })
  const card = allOf(tree, byClass('cs-heatmap-card'))[0]
  assert.equal(card.props['data-range'], 'year')
  assert.equal(card.props['data-layout'], 'year')
  assert.match(textOf(card), /全年每日时长/, '全年视图使用全年标题')

  // 不再有 12 行 × 31 天矩阵，也不在主视图渲染 12 个月度条。
  assert.equal(allOf(tree, byClass('heat-year-row')).length, 0, '不再渲染 12 行月份矩阵')
  assert.equal(allOf(tree, byClass('heat-year-label')).length, 0, '不再渲染月份矩阵行标签')
  assert.equal(allOf(tree, byClass('heat-year-grid')).length, 0, '不再渲染 31 列全年矩阵')
  assert.equal(allOf(tree, byClass('heat-month-bar')).length, 0, '主视图不再渲染 12 个月度条')
  assert.equal(allOf(tree, byClass('heat-month-grid')).length, 0, '全年不渲染单月日历')

  const heatBody = allOf(tree, byClass('heatmap-body'))[0]
  assert.ok(heatBody, '存在周网格容器')
  assert.ok(hasClass(heatBody, 'is-year'), '全年容器带 class heatmap-body is-year')
  assert.equal(heatBody.props.ref, undefined, '全年网格铺满整行不横向滚动，无需初始对齐')
  const heatPlot = findByClass(tree, 'heat-plot')
  assert.ok(heatPlot, '全年与 3m/6m 共用 .heat-plot')
  const plotChildren = heatPlot.children.filter(Boolean)
  const monthRow = plotChildren.at(-1)
  assert.ok(monthRow && hasClass(monthRow, 'heat-months'), '月份刻度是 .heat-plot 最后一个子节点（网格下方）')
  assert.ok(!hasClass(plotChildren[0], 'heat-months'), '全年不在网格上方放月份刻度')

  const weekgrid = allOf(tree, byClass('heat-weekgrid'))[0]
  assert.ok(weekgrid, '全年与 3m/6m 共用 buildHeatGrid 周网格')
  const cells = findAll(weekgrid, (node) => hasClass(node, 'heat-cell'))
  const columns = cells.length / 7
  assert.equal(columns, Math.round(columns), '7 行网格的格子总数是 7 的整数倍')
  assert.ok(columns >= 52 && columns <= 54, `全年约 53 列，实际 ${columns} 列`)
  const weekdayList = allOf(tree, byClass('heat-weekday-list'))[0]
  assert.ok(weekdayList, '全年仍渲染星期刻度列')
  assert.deepEqual(
    textOf(weekdayList).trim().split(/\s+/),
    ['一', '二', '三', '四', '五', '六', '日'],
    '星期刻度为 7 行中文单字')

  // 中文月份刻度 12 项，且与当月 1 日所在列严格对齐。
  const monthSpans = findAll(monthRow, (node) => node.props?.['data-column'] !== undefined)
  assert.equal(monthSpans.length, 12, '全年 12 个中文月份刻度')
  assert.deepEqual(
    monthSpans.map((span) => textOf(span)),
    ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    '月份刻度一律中文 1月…12月')
  for (let month = 1; month <= 12; month += 1) {
    const firstKey = `2026-${String(month).padStart(2, '0')}-01`
    const index = cells.findIndex((cell) => cell.props['data-date'] === firstKey)
    assert.ok(index >= 0, `${firstKey} 必须在网格内`)
    assert.equal(Number(monthSpans[month - 1].props['data-column']), Math.floor(index / 7), `${month}月 刻度与当月 1 日所在列对齐`)
  }

  const dated = cells.filter((cell) => cell.props['data-date'] !== undefined)
  assert.equal(dated.length, 365, '2026 年有 365 个真实日期格')
  assert.equal(cells.filter((cell) => hasClass(cell, 'is-pad')).length, 6, '首尾 6 个补齐格')
  const jan1 = dated.find((cell) => cell.props['data-date'] === '2026-01-01')
  jan1.props.onMouseEnter(fakeEvent())
  assert.equal(shown[shown.length - 1].kind, 'heat', '全年格子仍可浮出单日明细')
})

test('客户端：单月视图为 7 列日历且汇总只统计本月', async () => {
  const { renderDailyHeatmap } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日时长', heatmapInfo: '每格代表一天', monthHeatTitle: '{month}每日时长',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日时长…', heatmapEmpty: '暂无每日记录',
  }
  const t = (key) => labels[key] ?? key
  const range = { from: new Date(2026, 7, 1).getTime(), to: new Date(2026, 8, 1).getTime() }
  const days = [
    ...buildHeatDays(range.from, range.to),
    heatDay('2026-07-31', 100 * 3_600_000),
    heatDay('2026-09-01', 100 * 3_600_000),
  ]
  const hoverTip = { tip: null, show() {}, hide() {} }
  const tree = renderDailyHeatmap({
    series: { range, days }, status: 'ready', t, format: 'hms',
    nowMs: new Date(2026, 7, 15, 12).getTime(), hoverTip, rangeValue: '8',
  })
  const card = allOf(tree, byClass('cs-heatmap-card'))[0]
  assert.equal(card.props['data-range'], 8, '月份范围规范化为数字')
  assert.equal(card.props['data-layout'], 'month')
  assert.match(textOf(card), /8月每日时长/, '单月标题的 {month} 占位替换成中文月份')
  assert.equal(allOf(tree, byClass('heat-year-grid')).length, 0, '单月不渲染全年矩阵')
  const weekdays = allOf(tree, byClass('heat-month-weekdays'))[0]
  assert.ok(weekdays, '单月顶部有星期刻度')
  assert.deepEqual(textOf(weekdays).trim().split(/\s+/), ['一', '二', '三', '四', '五', '六', '日'], '单月星期刻度使用中文单字')
  const monthGrid = allOf(tree, byClass('heat-month-grid'))[0]
  const cells = findAll(monthGrid, (node) => hasClass(node, 'heat-cell'))
  assert.equal(cells.length, 42, '6 周 × 7 列')
  const realCells = cells.filter((cell) => !hasClass(cell, 'is-pad'))
  assert.equal(realCells.length, 31, '只渲染 8 月的 31 天')
  assert.ok(realCells.every((cell) => String(cell.props['data-date']).startsWith('2026-08-')))
  assert.deepEqual(cells.slice(0, 5).map((cell) => hasClass(cell, 'is-pad')), [true, true, true, true, true])
  const summary = allOf(tree, byClass('heat-summary'))[0]
  assert.ok(summary, '底部有范围汇总')
  assert.match(textOf(summary), /范围活跃 21:00:00/, '汇总只累加本月有观测的 21 天，不含相邻月份')
  assert.match(textOf(summary), /活跃天数 21\/21/)
  assert.doesNotMatch(textOf(summary), /100:00:00/, '相邻月份的大数值不混入本月汇总')
})

test('客户端：热力图范围复用统一自定义下拉并一次展示 15 项', async () => {
  const { renderDailyHeatmap, Select, React } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日时长', heatmapInfo: '每格代表一天',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日时长…', heatmapEmpty: '暂无每日记录',
  }
  const t = (key) => labels[key] ?? key
  const range = { from: new Date(2026, 7, 1).getTime(), to: new Date(2026, 8, 1).getTime() }
  const series = { range, days: buildHeatDays(range.from, range.to) }
  const picked = []
  const tree = renderDailyHeatmap({
    series, status: 'ready', t, format: 'hms', nowMs: new Date(2026, 7, 15).getTime(),
    hoverTip: { tip: null, show() {}, hide() {} },
    rangeValue: '3m', onSelectRange: (value) => picked.push(value),
  })
  const picker = allOf(tree, (node) => node.type === Select)[0]
  assert.ok(picker, '卡片头部复用统一下拉组件')
  assert.equal(picker.props.value, '3m')
  assert.equal(picker.props.placement, 'top')
  assert.equal(picker.props.menuVariant, 'grid')
  assert.equal(picker.props.className, 'heat-range-select')
  assert.equal(picker.props.ariaLabel, '统计范围')
  assert.equal(allOf(tree, (node) => node.type === 'details').length, 0, '不再渲染原生 details')

  const rendered = React.render(Select, picker.props)
  assert.equal(allOf(rendered, byClass('cs-select')).length, 1, '渲染统一自定义下拉')
  assert.equal(findByClass(rendered, 'cs-select-btn').props['aria-expanded'], false, '收起态 aria-expanded=false')
  const options = allOf(rendered, byClass('cs-opt'))
  assert.equal(options.length, 15, '一次渲染全部 15 项，不做滚动裁切')
  assert.equal(options.filter((option) => hasClass(option, 'is-span-2')).length, 3, '前三个跨度选项横跨两列')
  assert.match(textOf(options[0]), /近3个月/, '范围菜单含「近3个月」')
  assert.match(textOf(options[1]), /近半年/, '范围菜单含「近半年」')
  assert.match(textOf(options[2]), /全年/, '范围菜单含「全年」')
  assert.deepEqual(
    options.slice(3).map((option) => textOf(option).trim()),
    ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    '范围菜单 15 项含「1月」，12 个月份一律中文')
  options.find((option) => textOf(option).trim() === '7月').props.onClick()
  assert.deepEqual(picked, [7], '点击月份回传数字范围值')
})

test('客户端：热力图范围复用统一下拉的向上两列菜单与自适应网格', async () => {
  const { chronoscopeCss } = await loadClientFunctions()
  const css = chronoscopeCss()
  const menu = declarationsFor(css, '.cs-select-menu.is-grid')
  assert.match(menu, /display:\s*grid/)
  assert.match(menu, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, '两列网格一次展示 15 项')
  assert.match(menu, /max-height:\s*none/, '不限制高度，15 项一次可见')
  assert.match(menu, /overflow:\s*visible/, '菜单不被裁切')
  const upward = declarationsFor(css, '.cs-select.is-top .cs-select-menu')
  assert.match(upward, /bottom:\s*calc\(100%\s*\+\s*6px\)/, '菜单向上弹出，避免被页面底部裁切')
  assert.match(upward, /top:\s*auto/)
  assert.match(declarationsFor(css, '.cs-select'), /position:\s*relative/)
  assert.match(declarationsFor(css, '.cs-heatmap-card'), /overflow:\s*visible/)
  const card = declarationsFor(css, '.cs-heatmap-card')
  assert.match(card, /--cs-heat-cell:\s*clamp\(/, '周网格格子尺寸随可用宽度自适应')
  // 全年已改为 7 行周网格，容器带 is-year：间隙与格子尺寸收紧到 2px / 10–13px。
  const yearBody = declarationsFor(css, '.heatmap-body.is-year')
  assert.match(yearBody, /--cs-heat-gap:\s*2px/, '全年网格间隙 2px')
  assert.match(yearBody, /--cs-heat-cell:\s*clamp\(10px,\s*0\.95vw,\s*13px\)/, '全年格子尺寸 10–13px')
  assert.match(declarationsFor(css, '.heatmap-body.is-year .heat-plot'), /gap:\s*4px/, '全年月份刻度与网格之间留间距')
  assert.match(declarationsFor(css, '.heatmap-body.is-year .heat-weekdays-spacer'), /display:\s*none/, '全年去掉星期标签上方空行，七行刻度与格子严格对齐')
  const monthGrid = declarationsFor(css, '.heat-month-grid')
  assert.match(monthGrid, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/, '单月日历 7 列')
  assert.match(declarationsFor(css, '.heat-month .heat-cell'), /aspect-ratio:\s*1/, '单月格子随列宽保持正方形')
  assert.match(declarationsFor(css, '.heat-month-bars'), /grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/, '12 个月度条铺满宽度')
})

test('客户端：任务时长构成行的时长不撑出卡片边框', async () => {
  const { chronoscopeCss } = await loadClientFunctions()
  const css = chronoscopeCss()
  const row = declarationsFor(css, '.cs-composition-row')
  assert.match(row, /grid-template-columns:\s*10px minmax\(0,1fr\) 38px minmax\(0,max-content\)/, '标签列吸收收缩、时长列按内容但不撑破')
  assert.match(row, /min-width:\s*0/, '构成行本身允许收缩')
  assert.match(declarationsFor(css, '.cs-composition-label'), /text-overflow:\s*ellipsis/, '过长标签省略')
  assert.match(declarationsFor(css, '.cs-composition-time, .cs-ranking-time'), /text-overflow:\s*ellipsis/, '过长时长省略而不溢出边框')
  assert.match(declarationsFor(css, '.cs-composition-body'), /gap:\s*16px/, '给列表留出更多宽度')
})

test('客户端：热力图首屏三种布局自适应且右侧统计与月度条铺开', async () => {
  const css = await loadClientCss()
  assert.match(declarationsFor(css, '.cs-heatmap-focus-page'), /min-height:\s*calc\(100vh - 260px\)/, '首屏页占满可用高度')
  const layout = declarationsFor(css, '.heat-focus-layout')
  assert.match(layout, /display:\s*grid/, '首屏为左右两栏')
  assert.match(layout, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+240px/, '左侧自适应、右侧固定统计栏')
  assert.match(layout, /gap:\s*20px/)
  assert.match(declarationsFor(css, '.heat-focus-main'), /min-width:\s*0/)
  const body = declarationsFor(css, '.cs-heatmap-focus .heatmap-body')
  assert.match(body, /width:\s*100%/, '周网格容器铺满宽度')
  assert.match(body, /overflow:\s*visible/, '放大态不再横向滚动裁切')
  const weekgrid = declarationsFor(css, '.cs-heatmap-focus .heat-weekgrid')
  assert.match(weekgrid, /width:\s*100%/, '3m/6m 周网格随卡片铺满')
  assert.match(weekgrid, /grid-auto-columns:\s*minmax\(0,\s*1fr\)/, '周网格列宽等比分配')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heat-weekgrid .heat-cell'), /aspect-ratio:\s*1/, '格子在放大态保持正方形')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heat-months'), /display:\s*grid/, '放大态月份刻度随周网格等比铺开')
  const month = declarationsFor(css, '.cs-heatmap-focus .heat-month')
  assert.match(month, /width:\s*100%/, '单月日历随卡片铺满')
  assert.match(month, /max-width:\s*none/, '单月不再固定最大宽度')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heat-month-grid'), /width:\s*100%/, '单月 7 列网格铺满')
  assert.match(declarationsFor(css, '.cs-heatmap-focus'), /--cs-heat-cell:\s*clamp\(10px,\s*1\.6vw,\s*20px\)/, '放大态格子尺寸随视口增长')
  const panel = declarationsFor(css, '.heat-focus-panel')
  assert.match(panel, /display:\s*flex/)
  assert.match(panel, /flex-direction:\s*column/, '右侧六项统计纵向排列')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heat-month-bars'), /min-height:\s*130px/, '月度条填充下方空白')
  assert.match(mediaBlocks(css, 900), /\.heat-focus-layout[^{]*\{[^}]*grid-template-columns:\s*1fr/, '窄屏回落单列')
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cs-heatmap-focus-page/, '减少动效下首屏直接到位')
})

test('客户端：概览把范围值与切换回调透传给每日热力图', async () => {
  const { renderOverviewView, Select } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日时长', heatmapInfo: '每格代表一天', yearHeatTitle: '全年每日时长',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', monthBars: '月度活跃', periodDay: '日', onlineLabel: '在线时长',
    activeLabel: '活跃', taskLabel: '任务', noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日时长…', heatmapEmpty: '暂无每日记录',
  }
  const t = (key) => labels[key] ?? key
  const range = { from: new Date(2026, 0, 1).getTime(), to: new Date(2027, 0, 1).getTime() }
  const series = { range, days: buildHeatDays(range.from, range.to) }
  const picked = []
  const overview = renderOverviewView({
    data: sampleDashboardData(), t, isZh: true, period: 'day', onSelectPeriod() {},
    durationFormat: 'hms', hoverTip: { tip: null, show() {}, hide() {} },
    nowMs: new Date(2026, 10, 7).getTime(), onOpenWorkspace() {},
    heatSeries: series, heatStatus: 'ready', heatRangeValue: 'year',
    onSelectHeatRange: (value) => picked.push(value),
  })
  const card = allOf(overview, byClass('cs-heatmap-card'))[0]
  assert.ok(card, '概览嵌入每日热力图')
  assert.equal(card.props['data-range'], 'year')
  assert.equal(card.props['data-layout'], 'year')
  const picker = allOf(card, (node) => node.type === Select)[0]
  assert.ok(picker, '概览里的热力图复用统一选择器')
  assert.ok(picker.props.options.some((option) => option.value === 11), '概览里的选择器有 11 月选项')
  picker.props.onChange(11)
  assert.deepEqual(picked, [11], '切换范围回调从概览透传到页面状态')
})

test('客户端：英文界面仍显示英文月份/星期与 3 months/6 months/Year', async () => {
  const { renderDailyHeatmap, heatRangeLabel, Select, React } = await loadClientFunctions()
  const en = {
    heatmapTitle: 'Daily time', heatmapInfo: 'Each cell is a day',
    yearHeatTitle: 'Daily time · year', monthHeatTitle: 'Daily time · {month}',
    heatRangeLabel: 'Range', heatRange3m: '3 months', heatRange6m: '6 months',
    heatRangeYear: 'Year', heatRangeMonth: '{month}',
    periodDay: 'Day', onlineLabel: 'Online', activeLabel: 'Active', taskLabel: 'Task',
    noRecord: 'No record', heatDayTitle: '{month}/{day}',
    heatSummary: 'Range active {active} · Active days {activeDays}/{observedDays}',
    heatmapLoading: 'Loading…', heatmapEmpty: 'No daily records', monthBars: 'Monthly active',
  }
  const t = (key) => en[key] ?? key
  assert.equal(t('periodDay'), 'Day', '英文界面 periodDay 不是「日」')
  assert.equal(heatRangeLabel(7, t), 'Jul', '英文界面单月标签仍是 Jul')
  assert.equal(heatRangeLabel(1, t), 'Jan')
  assert.equal(heatRangeLabel('3m', t), '3m')
  const zh = (key) => ({ periodDay: '日', heatRangeMonth: '{month}' })[key] ?? key
  assert.equal(heatRangeLabel(7, zh), '7月', '中文界面单月标签为 7月')

  const range = { from: new Date(2026, 7, 1).getTime(), to: new Date(2026, 8, 1).getTime() }
  const series = { range, days: buildHeatDays(range.from, range.to) }
  const common = {
    series, status: 'ready', t, format: 'hms', nowMs: new Date(2026, 7, 15, 12).getTime(),
    hoverTip: { tip: null, show() {}, hide() {} },
  }
  const weeks = renderDailyHeatmap(common)
  assert.match(textOf(findByClass(weeks, 'heat-months')), /Aug/, '英文界面月份刻度仍为 Aug')
  assert.deepEqual(
    textOf(findByClass(weeks, 'heat-weekday-list')).trim().split(/\s+/),
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    '英文界面星期刻度仍为 Mon…Sun')

  const month = renderDailyHeatmap({ ...common, rangeValue: '8' })
  assert.match(textOf(month), /Daily time · Aug/, '英文界面单月标题仍用 Aug')
  assert.deepEqual(
    textOf(findByClass(month, 'heat-month-weekdays')).trim().split(/\s+/),
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    '英文界面单月星期刻度仍为 Mon…Sun')

  const picker = allOf(weeks, (node) => node.type === Select)[0]
  const rendered = React.render(Select, picker.props)
  const options = allOf(rendered, byClass('cs-opt'))
  assert.match(textOf(options[0]), /3 months/, '跨度显示 3 months')
  assert.match(textOf(options[1]), /6 months/, '跨度显示 6 months')
  assert.match(textOf(options[2]), /Year/, '跨度显示 Year')
  const monthTexts = options.slice(3).map((node) => textOf(node).trim())
  assert.ok(monthTexts.includes('Jan'), '英文界面月份选项含 Jan')
  assert.ok(monthTexts.includes('Dec'), '英文界面月份选项含 Dec')
})

test('客户端：全年 Bento 跨行、范围选择器紧凑尺寸与顶栏图标按钮样式', async () => {
  const css = await loadClientCss()
  // 范围选择器只收窄触发器，弹出的两列 15 项菜单不变。
  const rangeTrigger = declarationsFor(css, '.heat-range-select .cs-select-btn')
  assert.match(rangeTrigger, /min-width:\s*88px/, '范围触发器最小宽度 88px')
  assert.match(rangeTrigger, /min-height:\s*28px/, '范围触发器最小高度 28px')
  assert.match(rangeTrigger, /padding:\s*4px 8px/, '范围触发器内边距 4px 8px')
  // 全年范围在普通概览跨满整行，:has() 让 .cs-recent 一起拉宽；其它范围仍是第 3 列。
  const yearPlacement = declarationsFor(css, '.cs-overview-grid > .cs-heatmap-card[data-range="year"]')
  assert.match(yearPlacement, /grid-column:\s*1\s*\/\s*-1/, '全年热力图跨满整行')
  assert.ok(
    css.includes(':has(> .cs-heatmap-card[data-range="year"]) > .cs-recent'),
    '有 :has() 规则让 .cs-recent 随全年范围拉宽')
  assert.match(declarationsFor(css, '.cs-heatmap-card'), /grid-column:\s*3/, '其它范围热力图仍在第 3 列')
  // 顶栏右侧拆成两个 group 加一条分隔线，配色改成单枚循环图标按钮。
  assert.match(declarationsFor(css, '.cs-topbar-group'), /display:\s*inline-flex/, '顶栏右侧两个 cs-topbar-group')
  assert.match(declarationsFor(css, '.cs-topbar-divider'), /width:\s*1px/, '顶栏两组之间有 1px 分隔线')
  assert.match(css, /\.cs-icon-toggle\s*\{/, '配色与外观共用单枚循环图标按钮样式')
  assert.doesNotMatch(css, /\.cs-palette-label/, '顶栏不再有配色下拉的标签')
})
