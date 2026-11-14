import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// 轻量 React 替身：只记录元素树，并为组件测试提供最小的状态/引用 hook 运行环境。
function createTestReact() {
  let cursor = 0
  const hooks = []
  const effects = []
  return {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      return [hooks[index], (next) => {
        hooks[index] = typeof next === 'function' ? next(hooks[index]) : next
      }]
    },
    useEffect(effect, deps) {
      const index = cursor++
      const previous = hooks[index]
      if (deps && previous?.deps?.length === deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return
      effects.push(() => {
        previous?.cleanup?.()
        hooks[index] = { deps, cleanup: effect() }
      })
    },
    flushEffects() {
      for (const effect of effects.splice(0)) effect()
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = { current: initial }
      return hooks[index]
    },
    render(component, props) {
      cursor = 0
      effects.length = 0
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
  const anchor = '    const DSH_TIMESPAN_CSS = `'
  assert.ok(source.includes(anchor), '客户端测试入口不存在')
  source = source.replace(anchor,
    `    window.__testFunctions = {
      renderComposition, renderSessionBreakdown, renderSessionRow, renderWorkspaceRow,
      selectDetailsWorkspaces, summarizeDetailSessions, selectedDetailSession, importResultText, formatSelectedRange,
      openSessionInHost, sessionIsOpenable, recentLimitForRow, heroRingModel, heroMetaItems,
      normalizeBackfill, normalizeDashboard, useDashboard, approximateNoticeVisible, renderApproximateNotice,
      localDayCount, averageMsPerDay, clampTipPosition, renderHoverTip,
      buildTrendTip, buildCompositionTip, renderTrendChart, HoverTip, useHoverTip,
      renderBackfillBanner, renderBackfillNotices, isBackfillUnread,
      Select, isSelectOutside, createSelectOutsideHandler,
      renderWorkspaceRanking, Info, renderInfo, DshTimespanIcon: typeof DshTimespanIcon === 'function' ? DshTimespanIcon : undefined,
      overviewInfoMessages: typeof overviewInfoMessages === 'function' ? overviewInfoMessages : undefined,
      footerInfoMessages: typeof footerInfoMessages === 'function' ? footerInfoMessages : undefined,
      normalizePalette: typeof normalizePalette === 'function' ? normalizePalette : undefined,
      normalizeAppearance: typeof normalizeAppearance === 'function' ? normalizeAppearance : undefined,
      cycleAppearance: typeof cycleAppearance === 'function' ? cycleAppearance : undefined,
      resolveAppearance: typeof resolveAppearance === 'function' ? resolveAppearance : undefined,
      formatDuration: typeof formatDuration === 'function' ? formatDuration : undefined,
      normalizeDurationFormat: typeof normalizeDurationFormat === 'function' ? normalizeDurationFormat : undefined,
      settingsDraft: typeof settingsDraft === 'function' ? settingsDraft : undefined,
      resetSettingsToDefaults: typeof resetSettingsToDefaults === 'function' ? resetSettingsToDefaults : undefined,
      renderBasicSettingsBody: typeof renderBasicSettingsBody === 'function' ? renderBasicSettingsBody : undefined,
      renderResetSettingsBody: typeof renderResetSettingsBody === 'function' ? renderResetSettingsBody : undefined,
      renderDurationFormatSection: typeof renderDurationFormatSection === 'function' ? renderDurationFormatSection : undefined,
      subscribeDurationFormatPreview: typeof subscribeDurationFormatPreview === 'function' ? subscribeDurationFormatPreview : undefined,
      notifyDurationFormatPreview: typeof notifyDurationFormatPreview === 'function' ? notifyDurationFormatPreview : undefined,
      dshTimespanCss: typeof dshTimespanCss === 'function' ? dshTimespanCss : undefined,
      dshTimespanSidebarCss: typeof dshTimespanSidebarCss === 'function' ? dshTimespanSidebarCss : undefined,
      sidebarRingSegments: typeof sidebarRingSegments === 'function' ? sidebarRingSegments : undefined,
      sidebarRingGradient: typeof sidebarRingGradient === 'function' ? sidebarRingGradient : undefined,
      sidebarThemeClass: typeof sidebarThemeClass === 'function' ? sidebarThemeClass : undefined,
      readStoredTheme: typeof readStoredTheme === 'function' ? readStoredTheme : undefined,
      resetStoredTheme: typeof resetStoredTheme === 'function' ? resetStoredTheme : undefined,
      subscribeThemeChanged: typeof subscribeThemeChanged === 'function' ? subscribeThemeChanged : undefined,
      notifyThemeChanged: typeof notifyThemeChanged === 'function' ? notifyThemeChanged : undefined,
      renderSidebarEntry: typeof renderSidebarEntry === 'function' ? renderSidebarEntry : undefined,
      renderSidebarRing: typeof renderSidebarRing === 'function' ? renderSidebarRing : undefined,
      renderSidebarTip: typeof renderSidebarTip === 'function' ? renderSidebarTip : undefined,
      SidebarTip: typeof SidebarTip === 'function' ? SidebarTip : undefined,
      useDelayedSidebarTip: typeof useDelayedSidebarTip === 'function' ? useDelayedSidebarTip : undefined,
      zoomIcon: typeof zoomIcon === 'function' ? zoomIcon : undefined,
      buildSidebarTip: typeof buildSidebarTip === 'function' ? buildSidebarTip : undefined,
      settingsDraft: typeof settingsDraft === 'function' ? settingsDraft : undefined,
      settingsPayload: typeof settingsPayload === 'function' ? settingsPayload : undefined,
      normalizeLanguage: typeof normalizeLanguage === 'function' ? normalizeLanguage : undefined,
      currentLanguage: typeof currentLanguage === 'function' ? currentLanguage : undefined,
      applyLanguage: typeof applyLanguage === 'function' ? applyLanguage : undefined,
      subscribeLanguage: typeof subscribeLanguage === 'function' ? subscribeLanguage : undefined,
      translate: typeof translate === 'function' ? translate : undefined,
      zhDict: typeof zh !== 'undefined' ? zh : undefined,
      enDict: typeof en !== 'undefined' ? en : undefined,
      LANGUAGE_OPTIONS: typeof LANGUAGE_OPTIONS !== 'undefined' ? LANGUAGE_OPTIONS : undefined,
      DEFAULT_LANGUAGE: typeof DEFAULT_LANGUAGE === 'string' ? DEFAULT_LANGUAGE : undefined,
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
      normalizeHeroMetric: typeof normalizeHeroMetric === 'function' ? normalizeHeroMetric : undefined,
      readStoredHeroMetric: typeof readStoredHeroMetric === 'function' ? readStoredHeroMetric : undefined,
      writeStoredHeroMetric: typeof writeStoredHeroMetric === 'function' ? writeStoredHeroMetric : undefined,
      HERO_METRIC_KEY: typeof HERO_METRIC_KEY === 'string' ? HERO_METRIC_KEY : undefined,
      renderZoomButton: typeof renderZoomButton === 'function' ? renderZoomButton : undefined,
      renderOverviewMetrics: typeof renderOverviewMetrics === 'function' ? renderOverviewMetrics : undefined,
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
      normalizeDetailsRange: typeof normalizeDetailsRange === 'function' ? normalizeDetailsRange : undefined,
      detailsRangeForPeriod: typeof detailsRangeForPeriod === 'function' ? detailsRangeForPeriod : undefined,
      resolveDetailsRange: typeof resolveDetailsRange === 'function' ? resolveDetailsRange : undefined,
      renderDetailsRangePicker: typeof renderDetailsRangePicker === 'function' ? renderDetailsRangePicker : undefined,
      DETAILS_RANGE_OPTIONS: typeof DETAILS_RANGE_OPTIONS !== 'undefined' ? DETAILS_RANGE_OPTIONS : undefined,
      DETAILS_SESSION_INITIAL: typeof DETAILS_SESSION_INITIAL === 'number' ? DETAILS_SESSION_INITIAL : undefined,
      DETAILS_SESSION_STEP: typeof DETAILS_SESSION_STEP === 'number' ? DETAILS_SESSION_STEP : undefined,
      heatLayoutFor: typeof heatLayoutFor === 'function' ? heatLayoutFor : undefined,
      buildMonthGrid: typeof buildMonthGrid === 'function' ? buildMonthGrid : undefined,
      buildYearMatrix: typeof buildYearMatrix === 'function' ? buildYearMatrix : undefined,
      renderHeatRangePicker: typeof renderHeatRangePicker === 'function' ? renderHeatRangePicker : undefined,
      renderTrendCard: typeof renderTrendCard === 'function' ? renderTrendCard : undefined,
      trendFocusStats: typeof trendFocusStats === 'function' ? trendFocusStats : undefined,
      renderTrendFocusPage: typeof renderTrendFocusPage === 'function' ? renderTrendFocusPage : undefined,
      TREND_FOCUS_HEIGHT: typeof TREND_FOCUS_HEIGHT === 'number' ? TREND_FOCUS_HEIGHT : undefined,
      SIDEBAR_TIP_DELAY_MS: typeof SIDEBAR_TIP_DELAY_MS === 'number' ? SIDEBAR_TIP_DELAY_MS : undefined,
    };\n${anchor}`)
  const React = createTestReact()
  const window = { __ModuleLoader__: { load: ({ factory }) => factory(() => React) }, ...windowExtras }
  vm.runInNewContext(source, { window, setInterval, clearInterval, crypto: { randomUUID: () => 'test-client' } })
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
  const start = source.indexOf('const DSH_TIMESPAN_CSS = `')
  assert.ok(start >= 0, '客户端样式入口不存在')
  const end = source.indexOf('\n    `', start)
  assert.ok(end > start, '客户端样式结束标记不存在')
  return source.slice(start, end)
}

async function loadSettingsCss() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('const DSH_TIMESPAN_SETTINGS_CSS = `')
  assert.ok(start >= 0, '设置页样式入口不存在')
  const end = source.indexOf('\n    `', start)
  assert.ok(end > start, '设置页样式结束标记不存在')
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
    { key: 'h1', from: new Date(2026, 10, 7, 1).getTime(), to: new Date(2026, 10, 7, 2).getTime(), activeMs: 0, taskMs: 1000 },
  ]
  const events = []
  const chart = renderTrendChart(trend, 'day', t, false, null, {
    onHover: (tip, event) => events.push({ tip, event }),
    onLeave: () => events.push({ leave: true }),
  })
  const groups = allOf(chart, byClass('cs-bar-group'))
  assert.equal(groups.length, 2)
  const bars = allOf(chart, byClass('cs-bar'))
  assert.equal(bars.length, 3, '零值不画柱')
  for (const { props: { rx, ry, width, height } } of bars) {
    assert.ok(rx > width / 3 && rx < width / 2, '圆角向端面中央延伸，留出短平边')
    assert.ok(ry > 0 && ry < rx && ry <= height / 2, '端面弧度较浅，短柱圆角不超过柱高一半')
  }
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
  const labels = { approximateTag: '近似', approximateNotice: '有些记录只能按最后心跳或最后事件时间结束，相关时长可能偏短' }
  const notice = textOf(renderApproximateNotice((key) => labels[key] ?? key, true))
  assert.match(notice, /近似/)
  assert.match(notice, /按最后心跳或最后事件时间结束/)
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

test('客户端：概览口径按行拆分，周/月补一句日均口径', async () => {
  const { localDayCount, averageMsPerDay, overviewInfoMessages } = await loadClientFunctions()
  const from = new Date(2026, 10, 2).getTime()
  const to = new Date(2026, 10, 3, 23, 59).getTime()
  assert.equal(localDayCount({ from, to }), 2, '两天按本地日历日计算')
  assert.equal(averageMsPerDay({ activeMs: 4 * 60 * 60 * 1000, range: { from, to } }, 'activeMs'), 2 * 60 * 60 * 1000)
  const labels = {
    onlineFoot: '在线：页面打开时长，包含挂机。',
    sinceBoot: '活跃：页面可见、窗口聚焦且有键鼠操作时计入。',
    unionFoot: '实际占用：多会话重叠的时段只计一次。',
    dailyAverageHint: '日均：按自然日折算。',
    recordSinceBoot: '在线和活跃从插件启用时开始记录，历史数据只回填任务时长。',
  }
  const t = (key) => labels[key] ?? key
  const dayLines = overviewInfoMessages({ period: 'day' }, t)
  assert.equal(dayLines.join('\n'), [
    labels.onlineFoot, labels.sinceBoot, labels.unionFoot, labels.recordSinceBoot,
  ].join('\n'), '日视图四条口径逐行展示，不混入已由页面说明的周期提示')
  const weekLines = overviewInfoMessages({ period: 'week' }, t)
  assert.ok(weekLines.includes(labels.dailyAverageHint), '周/月视图补充日均按自然日折算')
})

test('客户端：品牌时钟圆环三段固定，明暗两套主题对调上半与左下', async () => {
  const { DshTimespanIcon } = await loadClientFunctions()
  const icon = DshTimespanIcon({ size: 36 })
  const hand = findAll(icon, (node) => node.type === 'path' && node.props?.d === 'M12 12l4-4')[0]
  assert.equal(hand?.props?.stroke, 'var(--cs-brand-hand, #ffffff)', '指针颜色交给主题变量，浅色模式可切深色')
  const topArc = findAll(icon, (node) => node.type === 'path' && String(node.props?.d).startsWith('M3.69 10.23'))[0]
  assert.ok(topArc, '圆环上半段单独画一段弧')
  assert.match(topArc.props.d, /A8\.5 8\.5 0 0 1 20\.31 10\.23$/, '上半段跨过 12 点覆盖左右两侧')
  assert.match(topArc.props.stroke, /var\(--cs-brand-ring-high, currentColor\)/, '上半段颜色交给主题变量')
  const rightArc = findAll(icon, (node) => node.type === 'path' && String(node.props?.d).startsWith('M20.31 13.77'))[0]
  assert.ok(rightArc, '圆环右下段单独画一段弧')
  assert.match(rightArc.props.d, /A8\.5 8\.5 0 0 1 13\.77 20\.31$/, '右下段从 3 点方向画到 6 点方向')
  assert.match(rightArc.props.stroke, /var\(--cs-task, #7A5AA6\)/, '右下段使用任务紫')
  const leftArc = findAll(icon, (node) => node.type === 'path' && String(node.props?.d).startsWith('M10.23 20.31'))[0]
  assert.ok(leftArc, '圆环左下段单独画一段弧')
  assert.match(leftArc.props.d, /A8\.5 8\.5 0 0 1 3\.69 13\.77$/, '左下段从 6 点方向画到 9 点方向')
  assert.match(leftArc.props.stroke, /var\(--cs-brand-ring-low, #133463\)/, '左下段使用主题对应的环形色')
  for (const arc of [topArc, rightArc, leftArc]) {
    assert.equal(arc.props.strokeLinecap, 'round', '每段两端都保留半圆端帽')
  }
  const pointOf = (d, end) => {
    const match = String(d).match(/^M([\d.]+) ([\d.]+) A8\.5 8\.5 0 0 1 ([\d.]+) ([\d.]+)$/)
    assert.ok(match, `弧线路径格式可解析：${d}`)
    const offset = end ? 2 : 0
    return { x: Number(match[1 + offset]), y: Number(match[2 + offset]) }
  }
  const gapBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - 2.2
  const visibleGaps = [
    gapBetween(pointOf(topArc.props.d, true), pointOf(rightArc.props.d, false)),
    gapBetween(pointOf(rightArc.props.d, true), pointOf(leftArc.props.d, false)),
    gapBetween(pointOf(leftArc.props.d, true), pointOf(topArc.props.d, false)),
  ]
  for (const gap of visibleGaps) {
    assert.ok(gap > 0.9, `半圆端帽之间仍留有可见空隙，实际 ${gap.toFixed(2)}`)
  }
  assert.equal(findAll(icon, (node) => node.type === 'path' && /A8\.5 8\.5/.test(String(node.props?.d))).length, 3, '圆环一共三段')
  const center = findAll(icon, (node) => node.type === 'circle' && node.props?.r === 1.8)[0]
  assert.equal(center?.props?.fill, 'var(--cs-brand-hand, #ffffff)', '轴心与指针同色，浅色模式一起变深')
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

test('客户端：视觉基座导出三档蓝 token、三套配色与派生色阶', async () => {
  const { dshTimespanCss } = await loadClientFunctions()
  assert.equal(typeof dshTimespanCss, 'function')
  const css = dshTimespanCss()
  assert.match(css, /--cs-signal-deep\s*:\s*#133463/i)
  assert.match(css, /--cs-signal\s*:\s*#1F4E94/i)
  assert.match(css, /--cs-signal-soft\s*:\s*#79B3F9/i)
  assert.match(css, /--cs-accent\s*:\s*var\(--cs-signal/)
  assert.match(css, /--cs-live\s*:\s*var\(--cs-signal\)/)
  assert.match(css, /--cs-task\s*:\s*#7A5AA6/i, '任务系列使用与活跃蓝分开的紫罗兰辅助色')
  assert.match(css, /--cs-task\s*:\s*#C29BE8/i, '深色外观使用更亮的紫罗兰')
  assert.match(css, /--cs-brand-ring-high\s*:\s*var\(--cs-signal\)/, '上下半圆环使用独立变量，便于主题对调')
  assert.match(css, /--cs-brand-ring-low\s*:\s*var\(--cs-signal-soft\)/, '左下圆环在明暗主题都取同色系柔和档')
  assert.match(css, /--cs-brand-hand\s*:\s*var\(--cs-signal-deep\)/, '浅色外观的指针与轴心改用深色，白针不再落在白底上')
  assert.match(css, /--cs-brand-hand\s*:\s*#ffffff/, '深色外观的指针与轴心保持白色')
  assert.match(css, /--cs-ring-track\s*:\s*color-mix\(/, '主页面也导出圆环轨道色')
  assert.match(css, /--cs-tone-faint\s*:/)
  assert.match(css, /--cs-tone-soft\s*:/)
  assert.match(css, /--cs-tone-other\s*:/)
  for (let step = 0; step <= 5; step += 1) assert.match(css, new RegExp(`--cs-heat-${step}\\s*:`))
  assert.match(css, /\.cs-page\.cs-palette-stone\s*\{/)
  assert.match(css, /\.cs-page\.cs-palette-clay\s*\{/)
  assert.match(css, /\.cs-page\.cs-palette-blue\s*\{/)
  assert.match(css, /\.cs-page\.cs-appearance-dark\s*\{/)
  // ⓘ 改回鼠标悬浮 + 键盘聚焦触发：浮层仍 fixed 定位并做视口夹取，紧贴图标下方。
  assert.match(css, /\.cs-info-tip\s*\{[^}]*position:\s*fixed/, '说明浮层用 fixed 定位，脱离卡片裁切')
  assert.match(css, /\.cs-info-tip\s*\{[^}]*z-index:\s*90/, '说明浮层层级为 90')
  assert.match(css, /\.cs-info:hover \.cs-info-tip[^{]*\{[^}]*visibility:\s*visible/, '悬停即显示说明浮层')
  assert.match(css, /\.cs-info:focus-within \.cs-info-tip[^{]*\{[^}]*visibility:\s*visible/, '键盘聚焦也显示说明浮层')
  assert.doesNotMatch(css, /\.cs-info\.is-open \.cs-info-tip/, '不再由点击展开态控制显示')
  assert.doesNotMatch(css, /\.cs-info\.is-dismissed/, '不再有 dismissed 状态')
  assert.doesNotMatch(css, /\.cs-card-heading \.cs-info-tip/, '窄屏 left:-80px 死规则已删，改由视口夹取')
  assert.match(css, /\.cs-overview-grid \.cs-card-heading,\s*\.cs-trend-layout \.cs-card-heading,\s*\.cs-trend-bottom \.cs-card-heading\s*\{[^}]*top:\s*-4px/, '概览与趋势区块的标题文字整体上提 4px')
  assert.doesNotMatch(css, /\.cs-overview-grid \.cs-card-head,\s*\.cs-trend-layout \.cs-card-head,\s*\.cs-trend-bottom \.cs-card-head\s*\{[^}]*position:\s*relative/, '卡片头不成为缩放按钮的定位参照')
  assert.match(css, /@keyframes viewIn\s*\{\s*from\s*\{\s*opacity:/, '视图入场只动 opacity')
  assert.doesNotMatch(css, /@keyframes viewIn\s*\{[^}]*\btransform\b/, '入场不再保留 transform，避免 fixed 浮层定位错乱')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /--cs-dur-tap\s*:\s*160ms/)
  assert.doesNotMatch(css, /#315878|#285642|#78947c|#96543f|#7492a8|#73797b/i, '旧的灰绿配色值不得残留')
})

test('客户端：概览整页滚轮滚动，子模块不出现内部竖滚', async () => {
  const { dshTimespanCss } = await loadClientFunctions()
  const css = dshTimespanCss()
  const settingsCss = await loadSettingsCss()
  assert.doesNotMatch(css, /100dvh/, '根容器不固定视口高度')
  assert.match(declarationsFor(css, '.cs-page'), /overflow:\s*auto/, '整页由 .cs-page 自己滚动')
  assert.doesNotMatch(css, /grid-auto-rows:\s*minmax\(0,\s*1fr\)/, '隐式行不被压成 1fr，全年跨行时自然撑高')
  assert.match(declarationsFor(css, '.cs-shell'), /gap:\s*8px/, '顶栏与标签间距收到 8px')
  assert.doesNotMatch(declarationsFor(css, '.cs-shell'), /min-height:\s*0/, '不再用 flex 链压高度')
  assert.doesNotMatch(declarationsFor(css, '.cs-view'), /flex:\s*1 1 auto/, '视图不吃满固定剩余高度')
  assert.match(declarationsFor(css, '.cs-overview-grid'), /grid-template-rows:\s*auto\s+auto\s+auto/, '三行按内容自然高度')
  assert.match(declarationsFor(css, '.cs-overview-grid'), /align-content:\s*start/, 'Bento 从顶部排，不留底部空白')
  assert.match(declarationsFor(css, '.cs-chart svg'), /height:\s*clamp\(/, '图表高度随视口收缩')
  assert.match(declarationsFor(css, '.cs-trend-layout .cs-trend-card .cs-plot svg'), /flex:\s*1 1 auto/, '今日 24 小时图表吃满卡片剩余高度，柱图整体下沉')
  assert.match(declarationsFor(css, '.cs-table-body'), /overflow:\s*visible/, '明细表不设内部竖滚，交给整页')
  assert.doesNotMatch(css, /\.cs-table-body\s*\{[^}]*flex:\s*1 1 auto/, '明细表不再被 flex 拉进固定高度')
  assert.match(declarationsFor(css, '.cs-settings-card'), /align-self:\s*start/, '设置卡片按自然高度排，不再强行拉伸')
  assert.ok(
    settingsCss.includes('.cs-settings-list.is-split {') &&
      settingsCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    '统计与显示在宽卡内用双列填满右半区')
  assert.ok(
    settingsCss.includes('.cs-settings-board .cs-notices-card,') &&
      settingsCss.includes('.cs-settings-board .cs-data-card { align-self: stretch; }'),
    '通知记录与数据管理共享行高、底边齐平')
  assert.doesNotMatch(declarationsFor(css, '.cs-settings-grid'), /overflow-y:\s*auto/, '设置页不设内部竖滚')
  assert.doesNotMatch(css, /\.cs-recent\s*\{[^}]*min-height:\s*0/, '最近会话不被压到比内容矮')
})

test('客户端：外观三态按浅色→深色→跟随系统循环，非法值回落跟随系统', async () => {
  const { normalizeAppearance, cycleAppearance, resolveAppearance } = await loadClientFunctions()
  assert.equal(typeof normalizeAppearance, 'function')
  assert.equal(typeof cycleAppearance, 'function')
  assert.equal(typeof resolveAppearance, 'function')
  assert.equal(normalizeAppearance('light'), 'light')
  assert.equal(normalizeAppearance('dark'), 'dark')
  assert.equal(normalizeAppearance('system'), 'system')
  assert.equal(normalizeAppearance('auto'), 'system')
  assert.equal(normalizeAppearance(null), 'system')
  assert.equal(cycleAppearance('light'), 'dark')
  assert.equal(cycleAppearance('dark'), 'system')
  assert.equal(cycleAppearance('system'), 'light')
  assert.equal(cycleAppearance('legacy-value'), 'light', '非法值先归一到跟随系统再循环')
  assert.equal(resolveAppearance('light', true), 'light')
  assert.equal(resolveAppearance('dark', false), 'dark')
  assert.equal(resolveAppearance('system', true), 'dark')
  assert.equal(resolveAppearance('system', false), 'light')
  assert.equal(resolveAppearance('unknown', true), 'dark')
})

test('客户端：图表活跃与任务使用可区分的设计 token', async () => {
  const { renderTrendChart } = await loadClientFunctions()
  const from = new Date(2026, 10, 7, 0).getTime()
  const tree = renderTrendChart([
    { key: 'a', from, to: from + 3_600_000, activeMs: 3_600_000, taskMs: 1_800_000 },
  ], 'day', (key) => key, true)
  const fills = findNodes(tree, (node) => node.type === 'rect' && String(node.props.className ?? '').split(/\s+/).includes('cs-bar')).map((node) => node.props.fill)
  assert.ok(fills.includes('var(--cs-chart-active)'), '活跃柱使用图形专用 --cs-chart-active，独立于状态文字颜色')
  assert.ok(fills.includes('var(--cs-task)'), '任务柱使用 --cs-task')
  assert.ok(fills.every((fill) => typeof fill === 'string' && fill.startsWith('var(--cs-')), '图表只使用设计 token 着色')
})

test('客户端：ⓘ 说明改为鼠标悬浮与键盘聚焦触发，浮层紧贴图标下方', async () => {
  const { Info, React, clampTipPosition } = await loadClientFunctions()
  const message = '实际占用：多会话重叠时段只计一次；在线时长包含挂机时间。'
  const tree = React.render(Info, { message })
  const button = findAll(tree, (node) => node.type === 'button')[0]
  assert.equal(findByClass(tree, 'cs-info').type, 'span')
  assert.equal(button.type, 'button')
  assert.equal(button.props.type, 'button')
  assert.equal(button.props['aria-label'], message, 'aria 名称必须是完整说明')
  assert.equal(typeof button.props.onMouseEnter, 'function', '悬停触发')
  assert.equal(typeof button.props.onMouseLeave, 'function', '移出收起')
  assert.equal(typeof button.props.onFocus, 'function', '键盘聚焦触发')
  assert.equal(typeof button.props.onBlur, 'function', '失焦收起')
  assert.equal(button.props.onClick, undefined, '不再用点击切换')
  assert.equal(button.props.onKeyDown, undefined, 'Esc 收起由文档级监听处理')
  assert.equal(button.props['aria-expanded'], undefined, '悬浮浮层不再冒充可展开控件')
  const tip = findByClass(tree, 'cs-info-tip')
  assert.equal(tip.props.role, 'tooltip')
  assert.equal(textOf(tip), message)
  assert.equal(typeof tip.props.style.left, 'string', '浮层用内联 left 定位')
  assert.equal(typeof tip.props.style.top, 'string', '浮层用内联 top 定位（clampTipPosition 计算）')
  assert.equal(tip.props['data-placement'], 'bottom', '默认紧贴图标下方')

  const withLegend = React.render(Info, {
    message,
    content: React.createElement('span', { className: 'cs-heat-legend' }, '低 → 高'),
  })
  const legendTip = findByClass(withLegend, 'cs-info-tip')
  assert.equal(textOf(legendTip), '低 → 高', '有图例时浮层仅显示图例')
  assert.equal(findAll(withLegend, (node) => node.type === 'button')[0].props['aria-label'], message)

  // 默认贴图标下方 4px；底部贴边且上方放得下时翻到上方，仍然留 4px 间隙。
  const size = { width: 200, height: 60 }
  const below = clampTipPosition(
    { left: 600, top: 200, width: 16, height: 16 }, size,
    { width: 1200, height: 800 }, { gap: 4, prefer: 'bottom' })
  assert.equal(below.placement, 'bottom')
  assert.equal(below.top, 220, '锚点底边 + 4px')
  assert.equal(below.left, 508, '水平居中于图标')
  const flipped = clampTipPosition(
    { left: 600, top: 760, width: 16, height: 16 }, size,
    { width: 1200, height: 800 }, { gap: 4, prefer: 'bottom' })
  assert.equal(flipped.placement, 'top', '底部空间不足翻到上方')
  assert.equal(flipped.top, 696, '锚点顶边 - 浮层高 - 4px')
  const clamped = clampTipPosition(
    { left: 1190, top: 780, width: 16, height: 16 }, size,
    { width: 1200, height: 800 }, { gap: 4, prefer: 'bottom' })
  assert.ok(clamped.left <= 1200 - 200 - 8, '右边缘按视口夹取，说明文字读得全')
})

test('客户端：散落小字收进 ⓘ 消息，信息不丢失', async () => {
  const { Info, React, overviewInfoMessages, footerInfoMessages } = await loadClientFunctions()
  const labels = {
    recordSinceBoot: '在线和活跃从插件启用时开始记录，历史数据只回填任务时长。',
    unionFoot: '实际占用：多会话重叠的时段只计一次。',
    sinceBoot: '活跃：页面可见、窗口聚焦且有键鼠操作时计入。',
    onlineFoot: '在线：页面打开时长，包含挂机。',
    localOnly: '数据仅保存在本机',
    approximateHint: '部分记录按最后心跳或最后事件时间结束，时长可能偏短',
  }
  const t = (key) => labels[key] ?? key
  const data = { period: 'day', range: { from: Date.now(), to: Date.now() }, activeMs: 0, taskMs: 0 }
  const overview = overviewInfoMessages(data, t)
  assert.equal(overview.join('\n'), [labels.onlineFoot, labels.sinceBoot, labels.unionFoot, labels.recordSinceBoot].join('\n'))
  const tree = React.render(Info, { message: overview.join('；'), lines: overview })
  assert.equal(findByClass(tree, 'cs-info-tip').props.className.includes('cs-info-tip-lines'), true, '口径说明使用分行样式')
  assert.equal(findAll(tree, (node) => hasClass(node, 'cs-info-line')).length, 4, '四条口径各自成行')
  const footer = footerInfoMessages(t, true).join('；')
  assert.match(footer, /数据仅保存在本机/)
  assert.match(footer, /按最后心跳/)
  assert.doesNotMatch(footer, /undefined/)
})

test('客户端：任务构成、工作区排行、今日 24 小时与最近会话不再显示说明图标', async () => {
  const {
    renderComposition, renderWorkspaceRanking, renderTrendCard, renderRecentSessions, Info,
  } = await loadClientFunctions()
  const labels = {
    compositionTitle: '任务时长构成', noTaskComposition: '暂无任务', accumulated: '累计工时',
    workspaceRanking: '工作区任务排行', unassigned: '未归属', taskLabel: '任务', colShare: '任务占比',
    trendDay: '今日 24 小时', activeLabel: '活跃', emptyDashboard: '暂无记录',
    recentSessions: '最近会话', recentSessionsEmpty: '暂无会话',
  }
  const t = (key) => labels[key] ?? key
  const countInfo = (tree) => findNodes(tree, (node) => node.type === Info).length
  assert.equal(countInfo(renderComposition({ workspaces: [] }, t)), 0, '任务时长构成去掉右上角说明图标')
  assert.equal(countInfo(renderWorkspaceRanking({ workspaces: [] }, t)), 0, '工作区任务排行去掉右上角说明图标')
  const trend = renderTrendCard({ workspaces: [], trend: [] }, t, true, { tip: null, show() {}, hide() {} }, 'hms', 'day', {})
  assert.equal(countInfo(trend), 0, '今日 24 小时去掉标题右侧说明图标')
  const recent = renderRecentSessions({ workspaces: [] }, t, Date.now(), () => {}, 'hms')
  assert.equal(countInfo(recent), 0, '最近会话去掉标题右侧说明图标')
})

test('客户端：工作区标题不再挂浮层，会话标题保留完整文本浮层', async () => {
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
  const workspaceTitle = findAll(workspace, (node) => hasClass(node, 'cs-workspace-name'))[0]
  assert.ok(workspaceTitle, '工作区标题节点存在')
  assert.equal(workspaceTitle.props.title, undefined, '不再使用原生 title 属性')
  assert.equal(typeof workspaceTitle.props.onMouseEnter, 'undefined', '工作区标题不再挂 HoverTip')
  assert.equal(textOf(workspaceTitle), longWorkspace, '工作区标题文本完整保留在 DOM 中')
  const workspaceCount = findAll(workspace, (node) => hasClass(node, 'cs-workspace-count'))[0]
  assert.equal(workspaceCount.props['aria-label'], '0 个会话', '会话数语义留在 aria-label')
  assert.equal(textOf(workspaceCount).trim(), '0', '工作区只显示紧凑的数量徽标')

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

test('客户端：会话标题不直接打开宿主，宿主入口只接受真实会话 id', async () => {
  const { renderSessionRow, openSessionInHost, sessionIsOpenable } = await loadClientFunctions()
  const labels = {
    unknownSession: '未命名会话', runningTag: '运行中', approximateHint: '近似',
    activeLabel: '活跃', taskLabel: '任务', taskCountUnit: '次任务', compositionTitle: '任务时长构成',
    subagentDetail: '子代理', subagentDetailHint: '{count} 个 · {duration}', colLast: '最近活动',
    openSession: '打开会话', notBroken: '未拆分',
  }
  const t = (key) => labels[key] ?? key
  const now = new Date(2026, 10, 7, 12, 0, 0).getTime()
  const realSession = {
    sessionId: 'session-1', hasSessionId: true, sessionTitle: '会话一', taskRunning: false,
    approximate: false, activeMs: 3_600_000, taskMs: 600_000, taskCount: 2,
    lastActivityAt: now - 60_000, modelMs: 600_000, toolMs: 0, waitMs: 0, otherMs: 0,
  }
  const opened = []
  const ctx = { get: (name) => name === 'uiWorkspace' ? { openSession: (id) => opened.push(id) } : undefined }
  const onOpen = (session) => openSessionInHost(ctx, session)
  const row = renderSessionRow(realSession, t, now, [], 'hms')
  assert.equal(row.props.onClick, undefined, '未提供统计预览时，整行没有跳转操作')
  const title = findAll(row, (node) => hasClass(node, 'cs-session-title'))[0]
  assert.equal(title.type, 'span', '标题只承载文字与完整名称提示')
  assert.equal(title.props.onClick, undefined, '标题没有独立跳转处理')
  assert.deepEqual(opened, [])
  assert.equal(onOpen(realSession), true)
  assert.deepEqual(opened, ['session-1'], '显式宿主入口仍可打开真实会话')

  assert.equal(sessionIsOpenable(realSession), true)
  const unassigned = { ...realSession, sessionId: '__unassigned_active_0', hasSessionId: false }
  assert.equal(sessionIsOpenable(unassigned), false, '无归属活跃行的占位 id 不可打开')
  const plain = renderSessionRow(unassigned, t, now, [], 'hms')
  assert.equal(plain.props.onClick, undefined)
  assert.equal(openSessionInHost(ctx, unassigned), false)

  assert.equal(openSessionInHost({}, realSession), false, '服务缺失时回落由调用方处理')
  const throwing = { get: () => ({ openSession() { throw new Error('archived') } }) }
  assert.equal(openSessionInHost(throwing, realSession), false, '归档/未知会话抛错时不冒泡')
})

test('客户端：排行与子代理说明收进统一浮层，会话行不再显示近似标记', async () => {
  const { renderWorkspaceRanking, renderSessionRow } = await loadClientFunctions()
  const labels = {
    unassigned: '未归属', accumulated: '累计', sumFoot: '合计', workspaceRanking: '工作区排行',
    taskLabel: '任务', colShare: '占比', noTaskComposition: '暂无', approximateTag: '近似',
    approximateHint: '按最后心跳估算', subagentDetail: '含子代理任务', subagentDetailHint: '{count} 条 · {duration}',
    unknownSession: '未命名会话', notBroken: '未拆分', activeLabel: '活跃', taskCountUnit: '次任务',
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
  assert.equal(rankRow.children.length, 4, '排行行只保留名次、名称、进度条与时长四列')
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
  const approximate = findAll(session, (node) => hasClass(node, 'cs-session-status') && node.props['aria-label'] === '按最后心跳估算')
  assert.equal(approximate.length, 0, '会话行不再显示近似状态图标与说明文字')
  const subagents = findAll(session, (node) => hasClass(node, 'cs-session-tool') && String(node.props['aria-label']).includes('含子代理任务'))[0]
  assert.ok(subagents, '子代理图标存在')
  subagents.props.onMouseEnter(event)
  assert.equal(shown.at(-1)?.title, '含子代理任务', '子代理说明走统一浮层')
  assert.deepEqual(shown.at(-1)?.rows.map((row) => [row.label, row.value]), [['子任务甲', '0:00:01']], '浮层列出子代理名称与时长')
})

test('客户端：工作区退为轻量分组，会话行承载活跃、任务与次数', async () => {
  const { renderWorkspaceRow, renderSessionRow } = await loadClientFunctions()
  const labels = {
    unassigned: '未归属', sessionsUnit: '个会话', expand: '展开', collapse: '收起',
    colActive: '活跃', colTask: '任务', colShare: '任务占比', colLast: '最近活动',
    activeLabel: '活跃', taskLabel: '任务', unknownSession: '未命名会话', notBroken: '未拆分',
    taskCountUnit: '个任务', compositionTitle: '任务时长构成',
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
  assert.equal(findAll(workspace, (node) => hasClass(node, 'cs-active') || hasClass(node, 'cs-task') || hasClass(node, 'cs-share')).length, 0, '工作区行不再铺开时长与占比列')
  assert.equal(findAll(workspace, (node) => hasClass(node, 'cs-detail-meta')).length, 0, '工作区行不再挂任何指标说明单元')
  const head = findAll(workspace, (node) => hasClass(node, 'cs-workspace-head'))[0]
  assert.equal(head.props['aria-label'], '工作区一 · 0 个会话 · 展开', '工作区行只保留名称、数量与展开语义')
  const sessionCount = findAll(workspace, (node) => hasClass(node, 'cs-workspace-count'))[0]
  assert.equal(sessionCount.props['aria-label'], '0 个会话', '工作区会话数语义留在 aria-label')
  assert.equal(textOf(sessionCount).trim(), '0', '工作区会话数显示为紧凑徽标')

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
    sessionStats.map((node) => [node.props['aria-label'], textOf(node).trim()]),
    [['活跃 1:00:00', '1:00:00'], ['任务 0:10:00', '0:10:00'], ['2 个任务', '2']],
    '会话行的活跃、任务与次数改成图标加数值，完整标签放进 aria-label',
  )
  assert.equal(findAll(session, (node) => hasClass(node, 'cs-session-breakdown')).length, 0, '任务构成不再占一整行文字')
  assert.ok(findAll(session, (node) => hasClass(node, 'cs-session-tool')).length >= 1, '任务构成改为工具图标')
})

test('客户端：会话模块样式让工作区退后、会话行成为主体', async () => {
  const css = await loadClientCss()
  assert.match(declarationsFor(css, '.cs-sessions-card'), /padding:\s*16px 18px 10px/, '会话卡片使用独立内边距')
  const workspaceHead = declarationsFor(css, '.cs-summary.cs-workspace-head')
  assert.match(workspaceHead, /display:\s*flex/, '工作区标题改为单行导航样式')
  assert.match(workspaceHead, /min-height:\s*46px/, '工作区标题不再占据大块高度')
  assert.match(workspaceHead, /gap:\s*8px/, '工作区标题保持紧凑间距')
  assert.match(declarationsFor(css, '.cs-workspace-name'), /text-overflow:\s*ellipsis/, '工作区名过长时省略')
  assert.match(declarationsFor(css, '.cs-workspace-name'), /font-size:\s*12.5px/, '工作区名视觉降档')
  const session = declarationsFor(css, '.cs-session')
  assert.match(session, /display:\s*flex/, '会话行使用可读的两层布局')
  assert.match(session, /flex-wrap:\s*nowrap/, '会话行不因窄屏挤成碎块')
  assert.match(declarationsFor(css, '.cs-session-body'), /flex-direction:\s*column/, '会话标题与指标分成上下两层')
  assert.match(declarationsFor(css, '.cs-session-meta'), /display:\s*flex/, '会话指标保持紧凑成组')
  assert.match(declarationsFor(css, '.cs-session-title'), /text-overflow:\s*ellipsis/, '会话标题过长时省略')
  assert.doesNotMatch(css, /\.cs-page \.cs-session\.is-running\s*\{/, '任务执行中的会话行不再画紫色边线')
  assert.match(css, /\.cs-heatmap-card \.cs-card-heading\s*\{[^}]*align-items:\s*center/, '每日活跃信息图标与标题垂直居中')

  const mobile = mediaBlocks(css, 760)
  assert.ok(mobile.length > 0, '存在平板与手机断点')
  assert.match(mobile, /\.cs-details-stats\s*\{[^}]*grid-template-columns:\s*repeat\(4/, '窄屏统计带压成单行四列，把首屏高度留给会话列表')
  assert.match(mobile, /\.cs-session-meta\s*\{[^}]*gap:/, '窄屏会话指标收紧间距')
  assert.match(mobile, /\.cs-sessions-card-head\s*\{[^}]*flex-direction:\s*column/, '窄屏卡片头改为纵向排布')
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
  const { dshTimespanSidebarCss } = await loadClientFunctions()
  assert.equal(typeof dshTimespanSidebarCss, 'function')
  const css = dshTimespanSidebarCss()
  assert.match(css, /\.dsh-timespan-nav-entry\s*\{/)
  assert.match(css, /--cs-signal-deep\s*:\s*#133463/i)
  assert.match(css, /--cs-signal\s*:\s*#1F4E94/i)
  assert.match(css, /--cs-signal-soft\s*:\s*#79B3F9/i)
  assert.match(css, /--cs-live\s*:\s*var\(--cs-signal\)/)
  assert.match(css, /--cs-task\s*:\s*#7A5AA6/i, '侧栏任务构成段使用独立紫罗兰辅助色')
  assert.match(css, /--cs-task\s*:\s*#C29BE8/i, '侧栏深色外观使用更亮的紫罗兰')
  assert.match(css, /\.dsh-timespan-nav-entry\.cs-palette-blue/)
  assert.match(css, /\.dsh-timespan-nav-entry\.cs-palette-stone/)
  assert.match(css, /\.dsh-timespan-nav-entry\.cs-palette-clay/)
  assert.match(css, /\.dsh-timespan-nav-entry\.cs-appearance-dark/)
  assert.doesNotMatch(css, /--dsw-alias-state-success-primary/, '侧栏入口不得再吃宿主 success 绿')
  assert.match(css, /html\[data-dsh-timespan-hide-name\] button\[aria-label="TimeSpan"\]:not\(\[role="menuitem"\]\) > span \+ span/,
    '宿主名称行由根元素开关隐藏，折叠态唯一 span 不受影响')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-entry.is-nameless .dsh-timespan-nav-time'),
    /font-size:\s*15px/, '去掉名称后时间放大一档并居中')
  const entry = declarationsFor(css, '.dsh-timespan-nav-entry')
  assert.match(entry, /display:\s*inline-flex/)
  assert.match(entry, /flex-wrap:\s*nowrap/, '入口保持单行')
  assert.match(entry, /white-space:\s*nowrap/)
  assert.match(declarationsFor(css, '.dsh-timespan-nav-entry.is-dot-end'), /width:\s*100%/, '贴右时入口占满宿主行宽')
  assert.match(css, /\.dsh-timespan-nav-entry\.is-dot-end \.dsh-timespan-nav-dot\s*\{[^}]*margin-left:\s*auto[^}]*margin-right:\s*3px/, '状态点用 auto 外边距推到最右侧，并留 3px 避免贴得过右')
  assert.match(css, /button\[aria-label="TimeSpan"\] > span:has\(\.dsh-timespan-nav-entry\.is-dot-end\)\s*\{[^}]*flex:\s*1 1 auto/, '宿主定宽 icon 容器被撑开，圆点才能贴到整行最右')
  assert.match(css, /\.dsh-timespan-nav-entry\.is-nameless\.is-dot-end\s*\{[^}]*justify-content:\s*flex-start/, '贴右时时间仍紧跟构成环，不因整行撑开而居中')
  assert.match(css, /\.dsh-timespan-nav-entry\.is-nameless\.is-dot-end \.dsh-timespan-nav-time\s*\{[^}]*flex:\s*0 0 auto/, '贴右时时间不再吃掉剩余空间')
  assert.match(css, /\.dsh-timespan-nav-entry\.is-nameless\.is-dot-inline:has\(\.dsh-timespan-nav-dot\)\s*\{[^}]*justify-content:\s*flex-start/, '默认跟随时长时状态点紧贴时长')
  assert.match(css, /\.dsh-timespan-nav-entry\.is-nameless\.is-dot-inline:has\(\.dsh-timespan-nav-dot\) \.dsh-timespan-nav-time\s*\{[^}]*flex:\s*0 0 auto/, '默认跟随时长时时间不吃满整行')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-time'), /font-size:\s*14px/, '时长与导航文字比例更协调')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-time'), /animation:\s*dsh-timespan-time-swap 160ms ease-out/, '切换数字格式时侧栏时间播放短促淡入')
  assert.match(css, /@keyframes dsh-timespan-time-swap/, '换字动画关键帧存在')
  const navSwapStart = css.indexOf('@keyframes dsh-timespan-time-swap')
  const navSwap = css.slice(navSwapStart, css.indexOf('.dsh-timespan-nav-status', navSwapStart))
  assert.doesNotMatch(navSwap, /translate|scale\(|blur\(/, '换字动画不做位移、缩放或模糊，避免夸张')
  assert.match(navSwap, /from\s*\{\s*opacity:\s*0/, '从透明淡入')
  assert.match(navSwap, /to\s*\{\s*opacity:\s*1/, '以完全不透明收尾')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-ring'), /width:\s*18px/, '构成环放大到 18px')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-ring-track'), /stroke-width:\s*2\.9/, '圆环线宽加粗')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-ring svg'), /transform:\s*rotate\(-90deg\)/, '圆环从 12 点方向起画')
  assert.match(css, /\.dsh-timespan-nav-dot\.is-live::before/, '活跃或任务进行中的状态点都有扩散环')
  assert.match(css, /@keyframes dsh-timespan-dot-pulse/, '活跃与任务进行中状态点向外扩散')
  assert.match(css, /dsh-timespan-dot-pulse 3\.6s/, '扩散频率加快到 3.6 秒一轮')
  assert.match(css, /scale\(2\.15\)/, '扩散范围扩大到 2.15 倍')
  assert.match(css, /52%, 100% \{ transform: scale\(2\.15\); opacity: 0; \}/, '扩散结束后留出不可见的空档再开始下一轮')
  assert.doesNotMatch(css, /\.dsh-timespan-nav-dot\.is-task::after/, '只保留单圈扩散，旧环未结束不会叠出第二圈')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-dot'), /border-radius:\s*999px\s*!important/, '状态点强制标准圆形，不被宿主方角覆盖')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-dot.is-task'), /background:\s*var\(--cs-task\)/, '任务态状态点使用紫色')
  assert.match(css, /\.dsh-timespan-nav-dot\.is-task::before\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--cs-task\) 58%, transparent\)/, '任务态扩散环改为紫色并覆盖活跃环')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-tip'), /position:\s*fixed/, '时长浮层固定定位')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-status'), /font-size:\s*11px/, '状态文字与侧栏次级文字同档')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-status.is-active'), /color:\s*var\(--cs-live\)/, '活跃中文字使用蓝色')
  assert.match(declarationsFor(css, '.dsh-timespan-nav-status.is-task'), /color:\s*var\(--cs-task\)/, '任务中文字使用紫色')
  assert.doesNotMatch(css, /\.dsh-timespan-nav-name\s*\{/, '侧栏不再渲染工作区名称')
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

test('客户端：首次安装与恢复初始设置的外观都跟随系统', async () => {
  const store = new Map()
  const { readStoredTheme, resetStoredTheme } = await loadClientFunctions({
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
    },
  })
  assert.equal(readStoredTheme().appearance, 'system', '没有本地偏好时默认跟随系统')
  resetStoredTheme()
  assert.equal(store.get('dsh-timespan.appearance'), 'system', '恢复初始设置写入跟随系统')
  assert.equal(store.get('dsh-timespan.palette'), 'blue', '配色仍恢复默认蓝')
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /applyAppearance\('system'\)/, '仪表盘内恢复初始设置也回到跟随系统')
  assert.doesNotMatch(source, /applyAppearance\('light'\)/, '恢复初始设置不得再写死浅色')
})

test('客户端：侧栏主题跟随 localStorage 的配色与外观，system 解析为实际明暗', async () => {
  const { sidebarThemeClass, readStoredTheme } = await loadClientFunctions({
    localStorage: {
      getItem: (key) => ({
        'dsh-timespan.palette': 'clay',
        'dsh-timespan.appearance': 'system',
      })[key] ?? null,
    },
  })
  assert.equal(JSON.stringify(readStoredTheme()), JSON.stringify({ palette: 'clay', appearance: 'system' }))
  assert.equal(sidebarThemeClass('blue', 'light', false), 'cs-palette-blue cs-appearance-light')
  assert.equal(sidebarThemeClass('blue', 'system', true), 'cs-palette-blue cs-appearance-dark', 'system 在深色系统下解析为 dark')
  assert.equal(sidebarThemeClass('stone', 'system', false), 'cs-palette-stone cs-appearance-light')
  assert.equal(sidebarThemeClass('clay', 'dark', false), 'cs-palette-clay cs-appearance-dark')
  assert.equal(sidebarThemeClass('legacy', 'auto', true), 'cs-palette-blue cs-appearance-dark', '旧值回落到蓝与跟随系统')
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

test('客户端：侧栏入口保留时长与状态点，悬停延迟展示三项组成', async () => {
  const { renderSidebarEntry, buildSidebarTip, renderSidebarTip, SIDEBAR_TIP_DELAY_MS } = await loadClientFunctions()
  assert.equal(SIDEBAR_TIP_DELAY_MS, 200, '侧栏悬浮说明等待时长缩短到 200ms')
  const labels = {
    title: 'dsh-timespan',
    onlineLabel: '在线时长',
    activeLabel: '活跃',
    taskLabel: '任务',
    live: '活跃中',
    idle: '空闲',
    taskRunning: '任务中',
    cycleToday: '今日',
    navTooltip: 'dsh-timespan · 在线、活跃与任务时长',
  }
  const t = (key) => labels[key] ?? key
  const shown = []
  const hidden = []
  const hover = {
    tip: null,
    show: (tip, event, immediate) => shown.push({ tip, event, immediate }),
    hide: () => hidden.push(true),
  }
  const stats = {
    status: 'ready',
    onlineMs: 4 * 3_600_000,
    activeMs: 3 * 3_600_000,
    taskMs: 3_600_000,
    activeRunning: true,
    taskRunning: true,
    receivedAt: Date.now(),
  }
  const tree = renderSidebarEntry({
    stats,
    theme: { palette: 'blue', appearance: 'light' },
    showName: false,
    t,
    hover,
  })
  assert.ok(hasClass(tree, 'dsh-timespan-nav-entry'), '入口根节点存在')
  assert.match(tree.props.className, /cs-palette-blue/)
  assert.match(tree.props.className, /cs-appearance-light/)
  assert.match(tree.props.className, /is-nameless/, '隐藏名称后入口进入居中的无名称布局')
  assert.equal(tree.props.tabIndex, 0, '入口可被键盘聚焦')
  assert.ok(findByClass(tree, 'dsh-timespan-nav-ring'), '迷你构成环存在')
  assert.equal(findAll(tree, (node) => hasClass(node, 'dsh-timespan-nav-ring-seg')).length, 3, '标准圆环由三段 SVG 弧组成')
  assert.equal(findByClass(tree, 'dsh-timespan-nav-name'), undefined, '隐藏名称后不渲染名称节点')
  const navTime = findByClass(tree, 'dsh-timespan-nav-time')
  assert.equal(textOf(navTime), '4h 0m', '隐藏名称后默认显示在线时长')
  assert.equal(navTime.props['data-format'], 'short', '默认格式标记在时长节点上')
  assert.equal(navTime.props['data-metric'], 'online', '默认主指标标记为在线时长')
  const msTree = renderSidebarEntry({
    stats,
    theme: { palette: 'blue', appearance: 'light' },
    showName: false,
    t,
    format: 'ms',
  })
  assert.equal(findByClass(msTree, 'dsh-timespan-nav-time').props['data-format'], 'ms', '格式切换后节点重新挂载，动画可以重新播放')
  const dot = findByClass(tree, 'dsh-timespan-nav-dot')
  assert.ok(dot, '隐藏名称后状态点仍在')
  assert.match(dot.props.className, /is-live/, '活跃或任务状态点着色')
  assert.match(dot.props.className, /is-task/, '任务进行中带扩散环')
  assert.equal(dot.props['aria-label'], '任务中')

  assert.equal(typeof tree.props.onMouseEnter, 'function', '入口绑定悬停浮层')
  assert.equal(typeof tree.props.onFocus, 'function', '入口保留键盘聚焦浮层')
  tree.props.onMouseEnter({ currentTarget: {}, key: 'enter' })
  tree.props.onFocus({ currentTarget: {}, key: 'focus' })
  assert.equal(shown.length, 2, '悬停与聚焦都触发浮层请求')
  assert.equal(shown[0].immediate, false, '鼠标悬停走延迟')
  assert.equal(shown[1].immediate, true, '键盘聚焦立即出现')
  assert.equal(shown[0].tip.rows.length, 3, '浮层包含三项时长')
  assert.match(shown[0].tip.rows[0].share, /50%/, '在线时长占环上一半')
  assert.equal(findAll(tree, (node) => hasClass(node, 'dsh-timespan-nav-tip')).length, 0, '未展示时入口内不渲染浮层节点')
  assert.match(tree.props['aria-label'], /在线时长 4h 0m/, '在线时长仍留在无障碍标签里')
  assert.match(tree.props['aria-label'], /活跃 3h 0m/, '活跃时长仍留在无障碍标签里')
  assert.match(tree.props['aria-label'], /任务 1h 0m/, '任务时长仍留在无障碍标签里')
  assert.match(tree.props['aria-label'], /任务中/, '状态也进入无障碍标签')
  assert.match(tree.props['aria-label'], /在线、活跃与任务时长/, '无障碍标签使用不带「今日」的浮层标题')
  assert.doesNotMatch(tree.props['aria-label'], /今日/, '无障碍标签不再保留「今日」角标')

  const tip = buildSidebarTip(stats, t)
  const tipTree = renderSidebarTip(tip, { left: 12, top: 20, placement: 'top' })
  assert.equal(tipTree.props.id, 'dsh-timespan-sidebar-tip')
  assert.equal(tip.title, undefined, '浮层数据不再携带标题字段')
  assert.doesNotMatch(textOf(tipTree), /今日/, '浮层不再显示今日角标')
  assert.doesNotMatch(textOf(tipTree), /在线、活跃与任务时长/, '浮层不再显示标题说明')
  assert.equal(findAll(tipTree, (node) => hasClass(node, 'dsh-timespan-nav-tip-title')).length, 0, '浮层没有标题节点')
  assert.equal(findAll(tipTree, (node) => hasClass(node, 'dsh-timespan-nav-tip-kicker')).length, 0, '浮层没有上方小字')
  assert.equal(findAll(tipTree, (node) => hasClass(node, 'dsh-timespan-nav-tip-foot')).length, 0, '浮层没有下方小字')

  const named = renderSidebarEntry({
    stats: { ...stats, activeRunning: false, taskRunning: false },
    theme: { palette: 'stone', appearance: 'dark' },
    showName: true,
    t,
    hover,
  })
  assert.equal(textOf(findByClass(named, 'dsh-timespan-nav-status')), '空闲', '开启后显示当前状态文字')
  assert.equal(findByClass(named, 'dsh-timespan-nav-name'), undefined, '不再渲染工作区名称，避免与宿主 label 重复')
  assert.doesNotMatch(named.props.className, /is-nameless/, '显示状态时保持原有左对齐布局')
  assert.doesNotMatch(findByClass(named, 'dsh-timespan-nav-dot').props.className, /is-live/, '空闲状态点不点亮')

  const activeOnly = renderSidebarEntry({
    stats: { ...stats, activeRunning: true, taskRunning: false },
    theme: { palette: 'blue', appearance: 'light' },
    showName: false,
    t,
    hover,
  })
  const activeDot = findByClass(activeOnly, 'dsh-timespan-nav-dot')
  assert.match(activeDot.props.className, /is-live/, '活跃但未跑任务时状态点也点亮并脉冲')
  assert.doesNotMatch(activeDot.props.className, /is-task/, '没有任务时仍使用活跃状态')

  const activeMetric = renderSidebarEntry({
    stats,
    theme: { palette: 'blue', appearance: 'light' },
    showName: false,
    t,
    sidebarMetric: 'active',
  })
  assert.equal(textOf(findByClass(activeMetric, 'dsh-timespan-nav-time')), '3h 0m', '选择活跃时长后大数字切换口径')
  const taskMetric = renderSidebarEntry({
    stats,
    theme: { palette: 'blue', appearance: 'light' },
    showName: false,
    t,
    sidebarMetric: 'task',
  })
  assert.equal(textOf(findByClass(taskMetric, 'dsh-timespan-nav-time')), '1h 0m', '选择任务时长后大数字切换口径')
})

test('客户端：侧栏状态文字跟随状态点，任务中优先于活跃中，隐藏时都不渲染', async () => {
  const { renderSidebarEntry } = await loadClientFunctions()
  const t = (key) => ({
    title: 'dsh-timespan',
    onlineLabel: '在线',
    activeLabel: '活跃',
    taskLabel: '任务',
    live: '活跃中',
    idle: '空闲',
    taskRunning: '任务中',
    navTooltip: 'dsh-timespan · 在线、活跃与任务时长',
  })[key] ?? key
  const base = {
    stats: { status: 'ready', onlineMs: 3_600_000, activeMs: 1_800_000, taskMs: 600_000, activeRunning: false, taskRunning: false },
    theme: { palette: 'blue', appearance: 'light' },
    showName: true,
    t,
    hover: { show() {}, hide() {} },
  }
  const idle = renderSidebarEntry({ ...base, workspaceTitle: '项目甲' })
  const idleStatus = findByClass(idle, 'dsh-timespan-nav-status')
  assert.equal(textOf(idleStatus), '空闲', '没有运行任务且未活跃时显示空闲')
  assert.match(idleStatus.props.className, /is-idle/)
  assert.equal(findByClass(idle, 'dsh-timespan-nav-name'), undefined, '不再渲染工作区名称')

  const active = renderSidebarEntry({ ...base, stats: { ...base.stats, activeRunning: true } })
  const activeStatus = findByClass(active, 'dsh-timespan-nav-status')
  assert.equal(textOf(activeStatus), '活跃中', '用户操作 DSH 时显示活跃中')
  assert.match(activeStatus.props.className, /is-active/)

  const task = renderSidebarEntry({ ...base, stats: { ...base.stats, taskRunning: true } })
  const taskStatus = findByClass(task, 'dsh-timespan-nav-status')
  assert.equal(textOf(taskStatus), '任务中', '任务运行时显示任务中')
  assert.match(taskStatus.props.className, /is-task/)

  const both = renderSidebarEntry({ ...base, stats: { ...base.stats, activeRunning: true, taskRunning: true } })
  const bothStatus = findByClass(both, 'dsh-timespan-nav-status')
  assert.equal(textOf(bothStatus), '任务中', '任务中优先于活跃中')
  assert.match(bothStatus.props.className, /is-task/)
  assert.doesNotMatch(bothStatus.props.className, /is-active/, '任务态不再叠加活跃态样式')

  const hidden = renderSidebarEntry({ ...base, showName: false })
  assert.equal(findByClass(hidden, 'dsh-timespan-nav-status'), undefined, '隐藏状态后不渲染状态文字')
  assert.match(hidden.props.className, /is-nameless/, '隐藏状态后入口进入无名称紧凑布局')

  assert.match(hidden.props.className, /is-dot-inline/, '默认让状态点紧跟时长')
  const noDot = renderSidebarEntry({ ...base, showDot: false })
  assert.equal(findByClass(noDot, 'dsh-timespan-nav-dot'), undefined, '关闭状态点后不渲染圆点')
  assert.equal(textOf(findByClass(noDot, 'dsh-timespan-nav-status')), '空闲', '关闭圆点不影响状态文字')
  const endDot = renderSidebarEntry({ ...base, dotPosition: 'end' })
  assert.match(endDot.props.className, /is-dot-end/, '可把状态点贴到最右侧')
  assert.doesNotMatch(endDot.props.className, /is-dot-inline/, '两种位置互斥')
})

test('客户端：侧栏状态、状态点与时长进入设置草稿、保存载荷与设置页控件', async () => {
  const { settingsDraft, settingsPayload, resetSettingsToDefaults, createSettingsSection, React, Select } = await loadClientFunctions()
  assert.equal(settingsDraft({ sidebarShowName: true }).sidebarShowName, true)
  assert.equal(settingsDraft({}).sidebarShowName, false, '缺省时隐藏状态文字')
  assert.equal(settingsDraft({}).sidebarDuration, 'online', '缺省时侧栏显示在线时长')
  assert.equal(settingsDraft({ sidebarDuration: 'task' }).sidebarDuration, 'task')
  assert.equal(settingsDraft({ sidebarDuration: 'bogus' }).sidebarDuration, 'online', '非法侧栏时长回落在线时长')
  assert.equal(settingsDraft({}).sidebarDotVisible, true, '缺省时显示状态点')
  assert.equal(settingsDraft({ sidebarDotVisible: false }).sidebarDotVisible, false)
  assert.equal(settingsDraft({}).sidebarDotPosition, 'inline', '缺省时状态点跟随时长')
  assert.equal(settingsDraft({ sidebarDotPosition: 'end' }).sidebarDotPosition, 'end')
  assert.equal(settingsDraft({ sidebarDotPosition: 'bogus' }).sidebarDotPosition, 'inline', '非法状态点位置回落跟随时长')
  assert.equal(JSON.stringify(settingsPayload({
    idleThresholdMinutes: '9',
    weekStartsOn: '7',
    showSubagents: false,
    sidebarShowName: false,
    sidebarDuration: 'task',
  })), JSON.stringify({
    idleThresholdMinutes: 9,
    weekStartsOn: 7,
    showSubagents: false,
    durationFormat: 'short',
    sidebarShowName: false,
    sidebarDuration: 'task',
    sidebarDotVisible: true,
    sidebarDotPosition: 'inline',
    language: 'zh',
    approximateNoticeDismissed: false,
  }), '保存时提交侧栏状态、状态点、侧栏时长、界面语言与数字格式')

  const defaults = {
    idleThresholdMinutes: 5,
    weekStartsOn: 1,
    showSubagents: true,
    durationFormat: 'short',
    sidebarShowName: false,
    sidebarDuration: 'online',
    sidebarDotVisible: true,
    sidebarDotPosition: 'inline',
    language: 'zh',
    approximateNoticeDismissed: false,
  }
  const resetCalls = []
  const resetCtx = {
    get(name) {
      if (name !== 'connection') return undefined
      return {
        rpc: {
          async call(_api, _service, request) {
            resetCalls.push([request.method, request.payload])
            const value = request.method === 'resetSettings'
              ? { ...defaults, sidebarDotPosition: 'end' }
              : { ...defaults, sidebarDotPosition: 'inline' }
            return { ok: true, value }
          },
        },
      }
    },
  }
  const resetSaved = await resetSettingsToDefaults(resetCtx)
  assert.equal(resetSaved.sidebarDotPosition, 'inline', 'Host 仍返回旧默认 end 时，客户端补写跟随时长')
  assert.equal(resetCalls.length, 2, '先走 Host 恢复，再补写状态点位置')
  assert.equal(resetCalls[0][0], 'resetSettings')
  assert.equal(resetCalls[1][0], 'setSettings')
  assert.equal(JSON.stringify(resetCalls[1][1]), JSON.stringify({ sidebarDotPosition: 'inline' }), '补写载荷只包含跟随时长')

  const cleanCalls = []
  const cleanCtx = {
    get(name) {
      if (name !== 'connection') return undefined
      return {
        rpc: {
          async call(_api, _service, request) {
            cleanCalls.push(request.method)
            return { ok: true, value: defaults }
          },
        },
      }
    },
  }
  const cleanSaved = await resetSettingsToDefaults(cleanCtx)
  assert.equal(cleanSaved.sidebarDotPosition, 'inline')
  assert.deepEqual(cleanCalls, ['resetSettings'], 'Host 已返回跟随时长时不再多余写入')

  const labels = {
    settingsSectionDisplay: '明细展示',
    settingsSectionBasics: '统计与显示',
    settingsBasicsHint: '统计口径与侧栏入口',
    settingsSidebarNameLabel: '侧栏显示状态',
    settingsSidebarNameOn: '显示状态',
    settingsSidebarNameOff: '隐藏状态',
    settingsSidebarDotLabel: '侧栏状态点',
    settingsSidebarDotOn: '显示',
    settingsSidebarDotOff: '隐藏',
    settingsSidebarDotPositionLabel: '状态点位置',
    settingsSidebarDotPositionEnd: '最右侧',
    settingsSidebarDotPositionInline: '跟随时长',
    settingsSidebarDurationLabel: '侧栏显示时长',
    settingsSidebarDurationHint: '选择侧栏常驻时长',
    sidebarDurationOnline: '在线时长',
    sidebarDurationActive: '活跃时长',
    sidebarDurationTask: '任务时长',
  }
  const t = (key) => labels[key] ?? key
  const tree = React.render(createSettingsSection({}), { t })
  const checkbox = findAll(tree, (node) => node.type === 'input' && node.props?.['aria-label'] === '侧栏显示状态')[0]
  assert.ok(checkbox, '设置页存在侧栏状态开关')
  assert.equal(checkbox.props.type, 'checkbox')
  assert.equal(checkbox.props.checked, false, '首次安装默认隐藏状态')
  const dotCheckbox = findAll(tree, (node) => node.type === 'input' && node.props?.['aria-label'] === '侧栏状态点')[0]
  assert.ok(dotCheckbox, '设置页存在状态点显示开关')
  assert.equal(dotCheckbox.props.checked, true, '首次安装默认显示状态点')
  const dotPositionSelect = findAll(tree, (node) => node.type === Select && node.props?.ariaLabel === '状态点位置')[0]
  assert.ok(dotPositionSelect, '设置页存在状态点位置下拉')
  assert.equal(dotPositionSelect.props.value, 'inline', '状态点默认跟随时长')
  assert.equal(Array.from(dotPositionSelect.props.options, (option) => option.label).join(','), '跟随时长,最右侧', '状态点位置提供跟随与贴右两种选项')
  const durationSelect = findAll(tree, (node) => node.type === Select && node.props?.ariaLabel === '侧栏显示时长')[0]
  assert.ok(durationSelect, '设置页存在侧栏显示时长下拉')
  assert.equal(durationSelect.props.className, 'cs-settings-select', 'DSH 设置页下拉默认使用紧凑 class，避免菜单铺满整页')
  assert.equal(durationSelect.props.value, 'online', '侧栏时长默认在线时长')
  assert.equal(Array.from(durationSelect.props.options, (option) => option.label).join(','), '在线时长,活跃时长,任务时长', '侧栏时长提供三种口径')
})

test('客户端：界面语言默认中文，设置页可切英文并即时换掉全部文案', async () => {
  const {
    translate, normalizeLanguage, currentLanguage, applyLanguage, subscribeLanguage,
    LANGUAGE_OPTIONS, DEFAULT_LANGUAGE, settingsDraft, settingsPayload,
    renderBasicSettingsBody, createSettingsSection, React, Select, zhDict, enDict,
  } = await loadClientFunctions()

  // 两套字典必须键完全一致：缺一条键在英文界面下会漏出中文或键名。
  assert.equal(Object.keys(enDict).sort().join('|'), Object.keys(zhDict).sort().join('|'), '中英字典键完全一致')
  assert.equal(zhDict.settingsLanguageLabel, '界面语言')
  assert.equal(enDict.settingsLanguageLabel, 'Interface language')
  assert.equal(zhDict.heatLegendLabel, '活跃程度图例')
  assert.equal(enDict.heatLegendLabel, 'Activity level legend')
  assert.equal(zhDict.tabDetails, '会话', '原「明细」视图标题改为「会话」')
  assert.equal(enDict.tabDetails, 'Sessions', '英文视图标题同步改为 Sessions')
  assert.equal('currentPeriod' in zhDict, false, '顶栏「当前周期」文案已删除')

  assert.equal(DEFAULT_LANGUAGE, 'zh', '首次安装默认中文')
  assert.equal(currentLanguage(), 'zh')
  assert.equal(normalizeLanguage('en'), 'en')
  for (const value of ['', 'EN', 'zh-CN', 'fr', null, undefined, 7]) {
    assert.equal(normalizeLanguage(value), 'zh', `非法语言 ${String(value)} 回落中文`)
  }

  // 默认中文：同一批键在英文下是另一套文案，TimeSpan 这种品牌词两种语言一致。
  assert.equal(translate('todayActive'), '今日活跃时长')
  assert.equal(translate('settingsNav'), 'TimeSpan')
  assert.equal(translate('notARealKey'), 'notARealKey', '缺键时原样返回键名，不抛错')

  const changes = []
  const unsubscribe = subscribeLanguage((value) => changes.push(value))
  assert.equal(applyLanguage('en'), 'en')
  assert.equal(translate('todayActive'), 'Active today')
  assert.equal(translate('periodDay'), 'Day', '英文界面下 isZh 判定依据也随之改变')
  assert.deepEqual(changes, ['en'], '语言变化广播一次')
  applyLanguage('en')
  assert.deepEqual(changes, ['en'], '同值重复应用不再广播，避免轮询空转重渲染')
  applyLanguage('bogus')
  assert.equal(currentLanguage(), 'zh', '脏值回落中文并广播')
  assert.deepEqual(changes, ['en', 'zh'])
  unsubscribe()
  applyLanguage('en')
  assert.deepEqual(changes, ['en', 'zh'], '退订后不再收到广播')
  applyLanguage('zh')

  assert.equal(Array.from(LANGUAGE_OPTIONS, (option) => option.value).join(','), 'zh,en')
  assert.equal(Array.from(LANGUAGE_OPTIONS, (option) => option.label).join(','), '中文,English', '语言选项用各自语言书写')

  // 设置草稿与保存载荷都带语言：语言也是 Host 设置的一部分。
  assert.equal(settingsDraft({}).language, 'zh')
  assert.equal(settingsDraft({ language: 'en' }).language, 'en')
  assert.equal(settingsDraft({ language: 'bogus' }).language, 'zh')
  assert.equal(settingsPayload({ language: 'en' }).language, 'en')
  assert.equal(settingsPayload({}).language, 'zh')

  const labels = {
    settingsSectionBasics: '统计与显示',
    settingsBasicsHint: '统计口径、明细展示与侧栏入口，改动会立即生效。',
    settingsLanguageLabel: '界面语言',
    settingsLanguageHint: '只影响 TimeSpan 自己的文案，不改变 DSH 界面语言；默认中文。',
  }
  const t = (key) => labels[key] ?? key
  const tree = React.render(createSettingsSection({}), { t })
  const languageSelect = findAll(tree, (node) => node.type === Select && node.props?.ariaLabel === '界面语言')[0]
  assert.ok(languageSelect, '设置页存在界面语言下拉')
  assert.equal(languageSelect.props.value, 'zh', '语言下拉默认中文')
  assert.equal(languageSelect.props.className, 'cs-settings-select', '与其它设置项共用同一套紧凑下拉')
  assert.equal(Array.from(languageSelect.props.options, (option) => option.label).join(','), '中文,English')

  // 八项按统计规则与侧栏入口分组，共享控件与语言逻辑。
  const body = renderBasicSettingsBody(t, null, false, () => {}, { split: true })
  const lists = allOf(body, byClass('cs-settings-list'))
  assert.equal(lists.length, 2)
  assert.equal(allOf(lists[0], byClass('cs-settings-row')).length, 4)
  assert.equal(allOf(lists[1], byClass('cs-settings-row')).length, 4)
  assert.equal(allOf(body, byClass('cs-settings-row')).length, 8, '基础设置八项：语言、空闲阈值、周起始、子代理、侧栏状态、状态点显示、状态点位置、侧栏时长')
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
  assert.equal(formatDuration(ms), '2h 48m', '缺省使用紧凑单位')
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
  assert.equal(formatDuration(ms, 'unknown'), '2h 48m', '非法格式回落紧凑单位')
  assert.equal(normalizeDurationFormat('zh'), 'zh')
  assert.equal(normalizeDurationFormat('bogus'), 'short')
})

test('客户端：设置草稿包含数字格式，五档紧凑选项条与预览可用，预览事件广播并支持退订', async () => {
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
  assert.equal(settingsDraft(null).durationFormat, 'short')
  assert.equal(settingsDraft({ durationFormat: 'invalid' }).durationFormat, 'short')

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
  assert.equal(allOf(section, byClass('cs-format-divider')).length, 5, '每张格式卡在数字与中文说明之间都有竖线分隔')
  assert.equal(allOf(checked[0], byClass('cs-format-divider')).length, 1, '选中卡片同样保留竖线')
  assert.match(textOf(allOf(section, byClass('cs-format-preview'))[0]), /预览 · 2:48:16 显示为\s*2 小时 48 分/, '预览行跟随当前草稿')
  assert.equal(allOf(section, byClass('cs-format-preview-value'))[0].props['data-format'], 'zh', '预览时间标记当前格式，切换时重新播放换字动画')
  optionButtons[0].props.onClick()
  assert.deepEqual(picked, ['hms'], '点击卡片把对应格式交给选择回调')

  const received = []
  const unsubscribe = subscribeDurationFormatPreview((value) => received.push(value))
  notifyDurationFormatPreview('short')
  notifyDurationFormatPreview('bogus')
  assert.deepEqual(received, ['short', 'short'], '预览事件携带归一化后的格式')
  unsubscribe()
  notifyDurationFormatPreview('sec')
  assert.deepEqual(received, ['short', 'short'], '退订后不再收到预览')
})

test('客户端：数字格式选项用竖线分隔数字与中文说明', async () => {
  const css = await loadSettingsCss()
  const divider = declarationsFor(css, '.cs-format-divider')
  assert.match(divider, /width:\s*1px/, '竖线只有 1px 宽')
  assert.match(divider, /height:\s*11px/, '竖线高度与选项文字匹配')
  assert.match(divider, /background:\s*color-mix\(in srgb,\s*var\(--dsw-alias-label-secondary\)/, '竖线使用次级文字色淡化')
})

test('客户端：初始化设置按钮先进入二次确认，再回调恢复', async () => {
  const { renderResetSettingsBody } = await loadClientFunctions()
  const labels = {
    settingsResetTitle: '初始化设置',
    settingsResetHint: '恢复首次安装的默认值，不删除统计数据。',
    settingsResetButton: '恢复初始设置',
    settingsResetConfirmTitle: '恢复初始设置？',
    settingsResetConfirmHint: '名称、数字格式与外观都会回到默认值。',
    settingsResetConfirm: '确认恢复',
    settingsResetCancel: '取消',
    loading: '正在恢复…',
  }
  const t = (key) => labels[key] ?? key
  const calls = []
  const idle = renderResetSettingsBody(t, { onRequest: () => calls.push('request') })
  const requestButton = findAll(idle, (node) => node.type === 'button' && /恢复初始设置/.test(textOf(node)))[0]
  assert.ok(requestButton, '默认状态提供恢复初始设置按钮')
  assert.match(requestButton.props.className, /is-icon/, '按钮使用带图标的横向布局')
  const icon = findAll(requestButton, (node) => node.type === 'svg' && /cs-reset-icon/.test(String(node.props?.className ?? '')))[0]
  assert.ok(icon, '按钮左侧是复位图标')
  const iconGroup = icon.children[0]
  assert.equal(iconGroup?.type, 'g', '图标按 24 画布写好路径后整体缩放，描边宽度不被压扁')
  assert.equal(iconGroup.props?.transform, 'translate(0 -0.6) scale(0.667)', '缩放后仍在 16 viewBox 内居中')
  assert.equal(iconGroup.children.length, 2, '复位图标由箭头短腿与圆环两段路径组成')
  assert.equal(icon.props['aria-hidden'], true, '图标不参与朗读，按钮文字已说明动作')
  assert.equal(textOf(requestButton).trim(), '恢复初始设置', '图标不改变按钮可读文字')
  requestButton.props.onClick()
  assert.deepEqual(calls, ['request'], '第一次点击只请求展开确认，不直接恢复')
  assert.equal(findAll(idle, (node) => node.props?.role === 'alertdialog').length, 0, '确认前没有弹窗')

  const confirming = renderResetSettingsBody(t, {
    resetStep: true,
    onReset: () => calls.push('reset'),
    onCancel: () => calls.push('cancel'),
  })
  const dialog = findAll(confirming, (node) => node.props?.role === 'alertdialog')[0]
  assert.ok(dialog, '确认态展示恢复确认框')
  assert.match(textOf(dialog), /名称、数字格式与外观都会回到默认值/, '确认框说明恢复范围')
  const cancel = findAll(dialog, (node) => node.type === 'button' && /取消/.test(textOf(node)))[0]
  const confirm = findAll(dialog, (node) => node.type === 'button' && /确认恢复/.test(textOf(node)))[0]
  cancel.props.onClick()
  confirm.props.onClick()
  assert.deepEqual(calls, ['request', 'cancel', 'reset'], '取消与确认分别回调，确认才真正恢复')
})

test('客户端：初始化设置卡与左侧外观卡底边齐平，按钮图标与文字同一行居中', async () => {
  const css = await loadSettingsCss()
  assert.match(
    declarationsFor(css, '.cs-settings-board .cs-settings-reset-card'),
    /align-self:\s*stretch/,
    '初始化设置卡撑满整行，底边与左侧外观卡齐平',
  )
  assert.match(
    css,
    /\.cs-settings-board \.cs-settings-reset-card > :last-child \{ margin-top: auto; \}/,
    '按钮组沉到卡片底部，留白留在说明与按钮之间',
  )
  assert.match(declarationsFor(css, '.cs-btn.is-icon'), /display:\s*inline-flex/, '带图标的按钮横向排布')
  assert.match(declarationsFor(css, '.cs-btn.is-icon'), /gap:\s*6px/, '图标与文字间距固定 6px')
  assert.match(declarationsFor(css, '.cs-btn.is-icon'), /align-items:\s*center/, '图标与文字垂直居中')
  assert.match(declarationsFor(css, '.cs-reset-icon'), /flex:\s*none/, '图标不参与拉伸，始终保持 15×15')
})

test('客户端：设置页预览时间换字使用纯透明度淡入', async () => {
  const css = await loadSettingsCss()
  assert.match(declarationsFor(css, '.cs-format-preview-value'), /animation:\s*cs-format-time-swap 160ms ease-out/, '预览时间仍会在格式切换时播放短促淡入')
  const start = css.indexOf('@keyframes cs-format-time-swap')
  assert.ok(start >= 0, '设置预览换字关键帧存在')
  const frames = css.slice(start, css.indexOf('@media', start))
  assert.doesNotMatch(frames, /translate|scale\(|blur\(/, '不再使用位移、回弹缩放或模糊')
  assert.match(frames, /from\s*\{\s*opacity:\s*0/, '从透明淡入')
  assert.match(frames, /to\s*\{\s*opacity:\s*1/, '以完全不透明收尾')
})

test('客户端：图表、排行与明细的渲染调用点使用传入格式', async () => {
  const { renderTrendChart, buildTrendTip, renderWorkspaceRanking, renderWorkspaceRow, renderSessionRow } = await loadClientFunctions()
  const labels = {
    activeLabel: '活跃', taskLabel: '任务', shareLabel: '占比', durationLabel: '时长',
    unknownSession: '未命名会话', notBroken: '未拆分', taskCountUnit: '个任务', compositionTitle: '任务时长构成',
  }
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
  assert.match(workspaceText, /工作区一/)
  assert.doesNotMatch(workspaceText, /1h 0m|30m 0s/, '工作区标题不再重复会话时长')
  const sessionText = textOf(renderSessionRow({
    sessionId: 's-format', sessionTitle: '格式会话', activeMs: 3_600_000, taskMs: 1_800_000,
    taskCount: 2, lastActivityAt: 0, modelMs: 0, toolMs: 0, waitMs: 0, otherMs: 0,
  }, t, 0, [], 'short'))
  assert.match(sessionText, /1h 0m/, '会话活跃时长使用当前格式')
  assert.match(sessionText, /30m 0s/, '会话任务时长使用当前格式')
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
    tabOverview: '概览', tabTrend: '趋势', tabDetails: '会话', tabSettings: '设置',
    tabsLabel: 'dsh-timespan 页面',
  }
  const t = (key) => labels[key] ?? key
  const picked = []
  const tree = React.render(TabNav, { view: 'trend', t, onChange: (value) => picked.push(value) })

  const nav = findAll(tree, (node) => node.props?.role === 'tablist')[0]
  assert.ok(nav, '导航以 tablist 呈现')
  assert.equal(nav.props['aria-label'], 'dsh-timespan 页面')
  const tabs = findAll(tree, (node) => node.props?.role === 'tab')
  assert.equal(tabs.length, 4, '四个同级 tab')
  assert.deepEqual(tabs.map((tab) => textOf(tab).trim()), ['概览', '趋势', '会话', '设置'])
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
    compositionTitle: '任务时长构成', compositionInfo: '按会话累计',
    noTaskComposition: '暂无任务', accumulated: '累计工时', workspaceRanking: '工作区任务排行',
    sumFoot: '明细按会话逐条累加', unassigned: '未归属', colShare: '任务占比',
    trendDay: '今日 24 小时', trendWeek: '本周每日', trendMonth: '本月每日', trendInfo: '活跃与任务独立统计',
    emptyDashboard: '暂无记录', recentSessions: '最近会话', recentSessionsHint: '按最近活动排序',
    unknownSession: '未命名会话', justNow: '刚刚', minutesAgo: '{n} 分钟前', hoursAgo: '{n} 小时前', daysAgo: '{n} 天前',
    trendSummary: '本周期概览', dailyAverageActive: '日均活跃', dailyAverageTask: '日均任务',
    taskCountShort: '任务次数', peakActive: '峰值活跃', activeShare: '活跃占比', searchPlaceholder: '搜索工作区或会话',
    trendBreakdownTitle: '时段分布', trendBreakdownHint: '按活跃与任务合计排序', trendBreakdownEmpty: '暂无时段数据',
    trendInsightsTitle: '趋势洞察', trendInsightsHint: '本周期峰值与集中度', trendInsightPeak: '峰值时段',
    trendInsightCoverage: '活跃覆盖', trendInsightConcentration: '前三集中度', trendInsightTaskRatio: '任务/在线',
    trendInsightNote: '前三集中度按活跃时长最高的三个时段计算。',
    workspaceTitle: '工作区明细', workspaceHint: '展开查看会话', colActive: '活跃', colTask: '任务',
    detailsSessionsTitle: '会话记录', detailsSessionsCaption: '按工作区分组，按最近活动排序',
    colLast: '最近活动', sessionsUnit: '个会话', expand: '展开会话', collapse: '收起会话',
    detailsEmpty: '没有匹配的工作区或会话', emptyWorkspace: '这个工作区还没有会话记录',
    rangeLabel: '统计范围', trendHint: '活跃与任务时长',
    subagentDetail: '子代理任务', subagentDetailHint: '共 {count} 条，合计 {duration}（不计入总计）',
  }
  const t = (key) => labels[key] ?? key
  const data = sampleDashboardData()
  const hoverTip = { tip: null, show() {}, hide() {} }
  const now = Date.now()

  const openedSessions = []
  const overview = renderOverviewView({
    data, t, isZh: true, period: 'day', onSelectPeriod() {}, durationFormat: 'hms',
    hoverTip, nowMs: now, onOpenSession: (session) => openedSessions.push(session),
  })
  assert.equal(allOf(overview, byClass('cs-cycle')).length, 3, '概览保留今日/本周/本月周期卡')
  assert.equal(allOf(overview, byClass('cs-section-head')).length, 0, '概览不再保留「周期概览」整行标题')
  assert.doesNotMatch(textOf(overview), /周期概览/, '标题文案不再出现在内容里')
  assert.ok(allOf(overview, byClass('cs-trend-card')).length >= 1, '概览含趋势卡')
  assert.ok(allOf(overview, byClass('cs-composition')).length >= 1, '概览含任务构成')
  assert.ok(allOf(overview, byClass('cs-ranking')).length >= 1, '概览含工作区排行')
  const recentRows = allOf(overview, byClass('cs-recent-row'))
  assert.equal(recentRows.length, 1, '最近会话从工作区扁平化出真实行')
  assert.match(textOf(recentRows[0]), /会话一/)
  recentRows[0].props.onClick()
  assert.equal(openedSessions[0]?.sessionId, 's-1', '点击最近会话把会话对象交给明细跳转')

  const trend = renderTrendView({
    data, t, isZh: true, period: 'day', onSelectPeriod() {}, durationFormat: 'hms', hoverTip,
    nowMs: now,
  })
  assert.equal(allOf(trend, byClass('cs-cycle')).length, 3, '趋势同样能切换日/周/月比较')
  assert.equal(allOf(trend, byClass('cs-section-head')).length, 0, '趋势页不再保留整行标题')
  assert.equal(allOf(trend, byClass('cs-cycle-tail')).length, 3, '每张周期卡都有贴底分组')
  assert.equal(allOf(trend, byClass('cs-cycle-share')).length, 3, '活跃占比文字仍在')
  assert.match(textOf(allOf(trend, byClass('cs-cycle-tail'))[0]), /活跃占比 \d+%/, '占比文字下沉到横条上方')
  assert.doesNotMatch(textOf(allOf(trend, byClass('cs-cycle-head'))[0]), /活跃占比/, '标题行不再放占比文字')
  assert.equal(allOf(trend, byClass('cs-cycle-ring')).length, 0, '窄窗不再使用会被裁切的占比环')
  assert.equal(allOf(trend, byClass('cs-cycle-foot')).length, 0, '周期卡不再补充底部小字')
  assert.equal(allOf(trend, byClass('cs-cycle-track')).length, 3, '周期卡保留整宽占比横条并贴底')
  assert.ok(allOf(trend, byClass('cs-trend-card')).length >= 1, '趋势含趋势图卡')
  const summaryText = textOf(allOf(trend, byClass('cs-trend-summary'))[0])
  assert.match(summaryText, /日均活跃/)
  assert.match(summaryText, /日均任务/)
  assert.match(summaryText, /任务次数/)
  assert.equal(allOf(trend, byClass('cs-trend-bottom')).length, 1, '趋势页底部补时段分布与趋势洞察')
  assert.equal(allOf(trend, byClass('cs-distribution-cell')).length, 2, '色阶保留实际时间桶')
  assert.match(allOf(trend, byClass('cs-distribution-cell'))[0].props['aria-label'], /11:00|10:00/, '每个时间桶可读出时段和数值')
  assert.equal(allOf(trend, byClass('cs-trend-insight-row')).length, 2, '洞察保留峰值和集中度，覆盖率位于分布卡')
  assert.match(textOf(allOf(trend, byClass('cs-trend-insights'))[0]), /峰值时段/, '趋势洞察包含峰值时段')

  const details = renderDetailsView({
    data, t, query: '', onQueryChange() {}, durationFormat: 'hms', expanded: {}, onToggleRow() {},
    nowMs: now, subagentByParent: {},
  })
  const highlightedDetails = renderDetailsView({
    data, t, query: '', onQueryChange() {}, durationFormat: 'hms', expanded: { 'ws-1': true },
    onToggleRow() {}, nowMs: now, subagentByParent: {}, highlightSessionId: 's-1',
  })
  const highlightedSession = allOf(highlightedDetails, byClass('cs-session'))[0]
  assert.match(highlightedSession?.props?.className ?? '', /is-highlighted/, '目标会话行获得定位高亮')
  const detailsWithSubagents = renderDetailsView({
    data: {
      ...data,
      subagentTasks: [{ sessionId: 'a-1', sessionTitle: '子任务一', parentSessionId: 's-1', durationMs: 60_000, start: now - 120_000 }],
    },
    t, query: '', onQueryChange() {}, durationFormat: 'hms', expanded: { 'ws-1': true },
    onToggleRow() {}, nowMs: now, highlightSessionId: 's-1',
  })
  const detailsSubagent = allOf(detailsWithSubagents, (node) =>
    hasClass(node, 'cs-session-tool') && String(node.props['aria-label']).includes('子代理任务'))[0]
  assert.ok(detailsSubagent, '明细会话使用同一份明细数据里的子代理任务，切到更早范围也不会丢图标')
  const search = findAll(details, (node) => node.type === 'input' && node.props?.type === 'search')[0]
  assert.ok(search, '明细含搜索框')
  assert.equal(search.props['aria-label'], '搜索工作区或会话')
  const workspaceRow = allOf(details, byClass('cs-summary'))[0]
  assert.ok(workspaceRow, '明细含工作区行')
  assert.match(textOf(workspaceRow), /工作区一/)
  assert.ok(allOf(details, byClass('cs-session')).length >= 1, '首次进入默认展开工作区，会话内容立即可见')
  assert.equal(allOf(details, byClass('cs-detail-stat')).length, 4, '明细顶部四项摘要保持一行')
  assert.equal(allOf(details, byClass('cs-details-side')).length, 0, '不再保留重复的最近会话侧栏')
  assert.ok(allOf(details, byClass('cs-sessions-card')).length === 1, '会话列表独占整宽')
  const sessionsCard = allOf(details, byClass('cs-sessions-card'))[0]
  assert.equal(allOf(sessionsCard, byClass('cs-sessions-caption')).length, 0, '会话记录标题右侧不再保留说明文字')
  assert.equal(allOf(sessionsCard, byClass('cs-info')).length, 0, '会话记录标题右侧不再保留信息图标')
  assert.match(textOf(allOf(details, byClass('cs-sessions-count'))[0]), /个会话/, '卡片头显示会话总数')
  assert.equal(allOf(details, byClass('cs-details-layout')).length, 1, '明细保持单一内容容器')

  const searched = renderDetailsView({
    data, t, query: '会话一', onQueryChange() {}, durationFormat: 'hms', expanded: {}, onToggleRow() {},
    nowMs: now, subagentByParent: {},
  })
  assert.ok(allOf(searched, byClass('cs-session')).length >= 1, '搜索命中时自动展开分组，不把结果藏在折叠工作区里')
  const filtered = renderDetailsView({
    data, t, query: '不存在的关键词', onQueryChange() {}, durationFormat: 'hms', expanded: {}, onToggleRow() {},
    nowMs: now, subagentByParent: {},
  })
  assert.match(textOf(filtered), /没有匹配的工作区或会话/, '本地过滤无结果时给出空状态')
})

test('客户端：明细统计范围预设解析为本地自然日，并覆盖今天到全部', async () => {
  const {
    normalizeDetailsRange, detailsRangeForPeriod, resolveDetailsRange,
    renderDetailsRangePicker, DETAILS_RANGE_OPTIONS, DETAILS_SESSION_INITIAL, DETAILS_SESSION_STEP,
  } = await loadClientFunctions()
  assert.deepEqual(Array.from(DETAILS_RANGE_OPTIONS, (option) => option.value), ['today', '3d', '7d', '30d', 'all'])
  assert.equal(DETAILS_SESSION_INITIAL, 8)
  assert.equal(DETAILS_SESSION_STEP, 8)
  assert.equal(normalizeDetailsRange('7d'), '7d')
  for (const invalid of ['', 'week', null, undefined, 7]) {
    assert.equal(normalizeDetailsRange(invalid), 'today', `非法范围 ${JSON.stringify(invalid)} 回落到今天`)
  }
  assert.equal(detailsRangeForPeriod('day'), 'today')
  assert.equal(detailsRangeForPeriod('week'), '7d')
  assert.equal(detailsRangeForPeriod('month'), '30d')
  assert.equal(detailsRangeForPeriod('unknown'), 'today')

  const now = new Date(2026, 10, 9, 12, 34, 56).getTime()
  assert.deepEqual({ ...resolveDetailsRange('today', now) }, {
    value: 'today', from: new Date(2026, 10, 9, 0, 0, 0, 0).getTime(),
  })
  assert.deepEqual({ ...resolveDetailsRange('3d', now) }, {
    value: '3d', from: new Date(2026, 10, 7, 0, 0, 0, 0).getTime(),
  }, '近 3 天含今天与之前两天')
  assert.deepEqual({ ...resolveDetailsRange('7d', now) }, {
    value: '7d', from: new Date(2026, 10, 3, 0, 0, 0, 0).getTime(),
  })
  assert.deepEqual({ ...resolveDetailsRange('30d', now) }, {
    value: '30d', from: new Date(2026, 9, 11, 0, 0, 0, 0).getTime(),
  })
  assert.deepEqual({ ...resolveDetailsRange('all', now) }, { value: 'all', from: 0 }, '全部从最早记录查询')

  const labels = {
    rangeLabel: '统计范围', detailsRangeLabel: '明细统计范围', detailsRangeToday: '今天',
    detailsRange3d: '近3天', detailsRange7d: '最近一周', detailsRange30d: '近30天', detailsRangeAll: '全部',
  }
  const t = (key) => labels[key] ?? key
  const picked = []
  const picker = renderDetailsRangePicker({ value: '7d', t, onSelect: (value) => picked.push(value) })
  const select = allOf(picker, (node) => typeof node.type === 'function' && node.props?.options?.length === 5)[0]
  assert.ok(select, '明细范围使用统一的自定义下拉')
  assert.equal(select.props.value, '7d')
  assert.deepEqual(Array.from(select.props.options, (option) => option.label), ['今天', '近3天', '最近一周', '近30天', '全部'])
  assert.equal(textOf(picker).trim(), '统计范围', '下拉左侧保留统计范围标签')
  select.props.onChange('all')
  assert.deepEqual(picked, ['all'])
})

test('客户端：明细「全部」范围按批次渐进展开会话', async () => {
  const { renderDetailsView } = await loadClientFunctions()
  const labels = {
    workspaceTitle: '工作区明细', sumFoot: '明细按会话逐条累加', colWorkspace: '工作区', colActive: '活跃',
    colTask: '任务', colShare: '任务占比', colLast: '最近活动', sessionsUnit: '个会话', activeShare: '活跃占比',
    rangeLabel: '统计范围', detailsRangeLabel: '明细统计范围', detailsRangeToday: '今天', detailsRange3d: '近3天',
    detailsRange7d: '最近一周', detailsRange30d: '近30天', detailsRangeAll: '全部',
    detailsShowMore: '再显示 {count} 个会话', detailsShownCount: '已显示 {shown}/{total}',
    recentSessions: '最近会话', recentSessionsHint: '按最近活动排序',
    unknownSession: '未命名会话', unassigned: '未归属', justNow: '刚刚',
    minutesAgo: '{n} 分钟前', hoursAgo: '{n} 小时前', daysAgo: '{n} 天前',
    activeLabel: '活跃', taskLabel: '任务', taskCountUnit: '次任务', compositionTitle: '任务时长构成',
    subagentDetail: '含子代理任务', approximateHint: '近似', emptyWorkspace: '这个工作区还没有会话记录',
    detailsEmpty: '没有匹配的工作区或会话', emptyDashboard: '暂无数据',
  }
  const t = (key) => labels[key] ?? key
  const now = Date.now()
  const sessions = Array.from({ length: 20 }, (_, index) => ({
    sessionId: `many-${index}`,
    sessionTitle: `会话${index + 1}`,
    activeMs: 60_000,
    taskMs: 30_000,
    taskCount: 1,
    taskRunning: false,
    approximate: false,
    hasBreakdown: false,
    modelMs: 0,
    toolMs: 0,
    waitMs: 0,
    otherMs: 0,
    lastActivityAt: now - index * 60_000,
  }))
  const data = sampleDashboardData()
  data.workspaces = [{
    ...data.workspaces[0],
    key: 'ws-many',
    workspaceTitle: '大工作区',
    sessions,
  }]
  const common = {
    data, t, query: '', onQueryChange() {}, durationFormat: 'hms', expanded: { 'ws-many': true },
    onToggleRow() {}, nowMs: now, subagentByParent: {}, detailsRange: 'all',
    progressiveSessions: true, onSelectDetailsRange() {},
  }
  const clicked = []
  const first = renderDetailsView({
    ...common,
    visibleSessionCounts: {},
    onShowMoreSessions: (key, total) => clicked.push([key, total]),
  })
  const searchWrap = allOf(first, byClass('cs-search-wrap'))[0]
  assert.ok(searchWrap, '明细搜索框外层容器存在')
  assert.ok(allOf(searchWrap, byClass('cs-search-icon'))[0], '搜索框内部左侧显示搜索图标')
  assert.equal(allOf(searchWrap, byClass('cs-search'))[0]?.props?.type, 'search', '搜索图标包裹真实搜索输入框')
  assert.equal(allOf(first, byClass('cs-session')).length, 8, '首批只渲染 8 个会话')
  const more = allOf(first, byClass('cs-sessions-more'))[0]
  assert.ok(more, '还有更多会话时显示二次展开入口')
  assert.match(textOf(more), /再显示 8 个会话/)
  assert.match(textOf(more), /已显示 8\/20/)
  findAll(more, (node) => node.type === 'button' && /再显示/.test(textOf(node)))[0].props.onClick()
  assert.deepEqual(clicked, [['ws-many', 20]], '点二次展开时把工作区与总数交给页面累加')

  const second = renderDetailsView({ ...common, visibleSessionCounts: { 'ws-many': 16 } })
  assert.equal(allOf(second, byClass('cs-session')).length, 16, '再次展开后累计到 16 个')
  assert.match(textOf(allOf(second, byClass('cs-sessions-more'))[0]), /再显示 4 个会话/)
  assert.match(textOf(allOf(second, byClass('cs-sessions-more'))[0]), /已显示 16\/20/)

  const done = renderDetailsView({ ...common, visibleSessionCounts: { 'ws-many': 24 } })
  assert.equal(allOf(done, byClass('cs-session')).length, 20, '累计超过总数时显示全部')
  assert.equal(allOf(done, byClass('cs-sessions-more')).length, 0, '全部显示后不再出现展开入口')

  const fixedRange = renderDetailsView({ ...common, detailsRange: '7d', progressiveSessions: false })
  assert.equal(allOf(fixedRange, byClass('cs-session')).length, 20, '非「全部」范围一次显示全部会话')
  assert.equal(allOf(fixedRange, byClass('cs-sessions-more')).length, 0, '非「全部」范围不做渐进展开')

  const fallback = renderDetailsView({
    ...common, expanded: { '旧分组': true }, selection: { sessionId: 'many-12' },
    highlightSessionId: 'many-12', onSelectSession() {},
    onShowMoreSessions: (key, total) => clicked.push([key, total]),
  })
  const highlighted = allOf(fallback, byClass('is-highlighted'))[0]
  assert.equal(highlighted?.props['data-session-id'], 'many-12', '回退目标位于后续批次时仍可定位')
  assert.equal(allOf(fallback, byClass('cs-session')).length, 9, '回退只额外展示目标会话')
  const nextBatch = allOf(fallback, byClass('cs-sessions-more'))[0]
  assert.match(textOf(nextBatch), /再显示 7 个会话/)
  allOf(nextBatch, (node) => node.type === 'button')[0].props.onClick()
  assert.deepEqual(clicked[1], ['ws-many', 20])

  const withSelection = renderDetailsView({
    ...common, selection: { workspaceKey: '之前的分组', sessionId: 'many-19' }, onSelectSession() {},
  })
  assert.equal(allOf(withSelection, byClass('cs-session')).length, 9, '普通选中项排序到后面时，仍只保留首批和选中项')
  assert.equal(allOf(withSelection, byClass('is-selected'))[0]?.props['data-session-id'], 'many-19')
})

test('客户端：概览最近会话将工作区名放在标题下方，并标出运行中状态', async () => {
  const { renderRecentSessions } = await loadClientFunctions()
  const labels = {
    recentSessions: '最近会话', recentSessionsHint: '按最近活动排序', recentSessionsEmpty: '暂无会话',
    unknownSession: '未命名会话', unassigned: '未归属', runningTag: '运行中',
    justNow: '刚刚', minutesAgo: '{n} 分钟前', hoursAgo: '{n} 小时前', daysAgo: '{n} 天前',
  }
  const t = (key) => labels[key] ?? key
  const data = sampleDashboardData()
  data.workspaces[0].sessions[0].taskRunning = true
  const tree = renderRecentSessions(data, t, Date.now(), () => {}, 'hms')
  const status = allOf(tree, byClass('cs-recent-status'))[0]
  assert.ok(status, '运行中的会话显示圆点')
  assert.equal(status.props['aria-label'], '运行中')
  const row = allOf(tree, byClass('cs-recent-row'))[0]
  const name = row.children[0]
  assert.equal(name.children[0], status, '状态圆点位于标题左侧')
  assert.ok(hasClass(name.children[1], 'cs-recent-title'))
  assert.ok(hasClass(name.children[2], 'cs-recent-workspace'))
})

test('客户端：最近会话条数按底部行高动态限制在 3–6 条', async () => {
  const { recentLimitForRow, renderRecentSessions } = await loadClientFunctions()
  assert.equal(recentLimitForRow({ rowHeight: 275 }), 5, '275px 行高对应 5 条')
  assert.equal(recentLimitForRow({ rowHeight: 316 }), 6, '更高行优先多展示，最多 6 条')
  assert.equal(recentLimitForRow({ rowHeight: 170 }), 3, '更矮行少展示，最少 3 条')
  assert.equal(recentLimitForRow({ rowHeight: 420 }), 6, '极高楼也不超过 6 条')
  assert.equal(recentLimitForRow({ rowHeight: 80 }), 3, '极矮楼也不低于 3 条')
  assert.equal(recentLimitForRow({ rowHeight: Number.NaN }), 5, '测量失败回落默认 5 条')
  assert.equal(recentLimitForRow({}), 5, '无测量值回落默认 5 条')

  const labels = {
    recentSessions: '最近会话', recentSessionsEmpty: '暂无会话', unknownSession: '未命名会话',
    unassigned: '未归属', justNow: '刚刚', minutesAgo: '{n} 分钟前', hoursAgo: '{n} 小时前', daysAgo: '{n} 天前',
  }
  const t = (key) => labels[key] ?? key
  const data = sampleDashboardData()
  const sessions = Array.from({ length: 10 }, (_, index) => ({
    sessionId: `session-${index}`, hasSessionId: true, sessionTitle: `会话 ${index}`,
    taskRunning: false, approximate: false, activeMs: 60_000, taskMs: 30_000, taskCount: 1,
    lastActivityAt: Date.now() - index * 60_000,
  }))
  data.workspaces = [{ ...data.workspaces[0], key: 'ws-many', workspaceTitle: '大工作区', sessions }]
  assert.equal(allOf(renderRecentSessions(data, t, Date.now(), () => {}, 'hms'), byClass('cs-recent-row')).length, 5, '默认显示 5 条')
  assert.equal(allOf(renderRecentSessions(data, t, Date.now(), () => {}, 'hms', 3), byClass('cs-recent-row')).length, 3, '可缩到 3 条')
  assert.equal(allOf(renderRecentSessions(data, t, Date.now(), () => {}, 'hms', 6), byClass('cs-recent-row')).length, 6, '可扩到 6 条')
  const tree = renderRecentSessions(data, t, Date.now(), () => {}, 'hms', 6)
  assert.equal(textOf(allOf(tree, byClass('cs-tag'))[0]), '6', '标题右侧显示当前展示的会话数')
  assert.equal(allOf(renderRecentSessions({ workspaces: [] }, t, Date.now()), byClass('cs-tag')).length, 0, '空列表省略数量徽标')
})

test('客户端：Dashboard 设置页包含格式、外观、统计、通知、导出与二次确认清空', async () => {
  const { renderSettingsView, normalizeBackfill, settingsDraft, React } = await loadClientFunctions()
  const settingsCss = await loadSettingsCss()
  assert.equal(typeof renderSettingsView, 'function')
  const labels = {
    settingsPageTitle: '仪表盘设置', settingsPageHint: '设置保存在本机',
    settingsSectionFormat: '数字格式', settingsFormatHint: '选择后立即预览',
    settingsFormatShared: '侧栏、概览、趋势、会话与导出共用这一格式',
    formatHintHms: '时:分:秒', formatHintShort: '紧凑单位', formatHintZh: '中文单位',
    formatHintSec: '纯秒', formatHintPadded: '补零时钟', formatPreviewLabel: '预览 · 2:48:16 显示为',
    settingsSectionAppearance: '外观与配色', appearanceLabel: '外观',
    appearanceLight: '浅色', appearanceDark: '深色', appearanceSystem: '跟随系统',
    appearanceToggle: '外观：{mode}，点击切换', paletteLabel: '配色',
    paletteToggle: '配色：{name}，点击循环 {order}',
    paletteBlue: '蓝', paletteStone: '石墨', paletteClay: '赤陶',
    settingsSectionGeneral: '统计口径', settingsSectionBasics: '统计与显示',
    settingsBasicsHint: '统计口径、明细展示与侧栏入口',
    settingsIdleLabel: '活跃判定阈值', settingsIdleHint: '空闲多久后不计入',
    settingsIdleUnit: '分钟', settingsIdleRange: '可选 1–15 分钟', settingsWeekLabel: '每周起始',
    settingsWeekHint: '决定本周边界', settingsWeekMonday: '周一', settingsWeekSunday: '周日',
    settingsSectionDisplay: '明细展示', settingsSubagentLabel: '显示子代理明细', settingsSubagentHint: '开关子代理',
    settingsSubagentOn: '显示', settingsSubagentOff: '隐藏', settingsSidebarNameLabel: '侧栏显示状态',
    settingsSidebarNameHint: '侧栏状态文字开关', settingsSidebarNameOn: '显示状态', settingsSidebarNameOff: '隐藏状态',
    settingsSidebarDotLabel: '侧栏状态点', settingsSidebarDotHint: '状态点显隐开关', settingsSidebarDotOn: '显示', settingsSidebarDotOff: '隐藏',
    settingsSidebarDotPositionLabel: '状态点位置', settingsSidebarDotPositionHint: '贴右或跟随时长',
    settingsSidebarDotPositionEnd: '最右侧', settingsSidebarDotPositionInline: '跟随时长',
    settingsSidebarDurationLabel: '侧栏显示时长', settingsSidebarDurationHint: '选择侧栏常驻时长',
    sidebarDurationOnline: '在线时长', sidebarDurationActive: '活跃时长', sidebarDurationTask: '任务时长',
    settingsResetTitle: '初始化设置', settingsResetHint: '恢复首次安装默认值，不删除统计数据。',
    settingsResetButton: '恢复初始设置', settingsResetConfirmTitle: '恢复初始设置？',
    settingsResetConfirmHint: '名称、数字格式与外观回到默认值。', settingsResetConfirm: '确认恢复',
    settingsResetCancel: '取消', settingsResetDone: '已恢复初始设置',
    settingsSectionNotices: '通知记录', settingsNoticesHint: '保留每次历史任务回填记录，可重新扫描。', backfillNoticeCount: '累计回填 {tasks} 条',
    backfillNoticeRead: '已读', backfillNoticeUnread: '待确认', backfillNoticeKindInitial: '首次回填',
    backfillNoticeEmpty: '暂无通知记录', backfillNoticeUnavailable: '暂时无法读取通知记录',
    settingsRecheck: '重新扫描历史任务', settingsRechecking: '正在扫描…',
    dataTitle: '数据管理', dataHint: '导出与清空', exportJson: '导出 JSON', exportCsv: '导出 CSV',
    exporting: '正在导出…', clearData: '清空全部数据', clearStepTitle: '确认清空？',
    clearStepHint: '此操作不可撤销', clearConfirm: '确认清空', clearCancel: '取消', clearing: '正在清空…',
    settingsSave: '保存设置', settingsSaving: '正在保存…', settingsSaved: '已保存',
    settingsLoadError: '无法读取设置', settingsRetry: '重试', settingsSaveError: '保存失败',
    savedBadge: '已保存', importData: '选择备份文件导入', importFileHint: '未选择文件',
    importFilePicked: '已选择：', importHint: '按 ID 去重合并，已有记录不会被覆盖。',
    importPreviewTitle: '待导入文件', importConfirm: '确认导入',
    approximateShowAgain: '重新显示「近似记录」说明', approximateShowAgainHint: '只在存在近似记录时出现，可在这里恢复。',
    backfillNoticeKindRetry: '手动重试', backfillDone: '历史任务回填完成',
  }
  const t = (key) => labels[key] ?? key
  const draft = settingsDraft({ idleThresholdMinutes: 7, weekStartsOn: 7, showSubagents: false, sidebarShowName: false, durationFormat: 'short' })
  const backfill = normalizeBackfill({
    status: 'done',
    notices: [{ eventId: 'n1', kind: 'initial', tasksWritten: 130, completedAt: Date.now(), readAt: Date.now() }],
  })
  const calls = []
  const appearanceCalls = []
  const settingsProps = {
    t, draft, phase: 'ready', message: '', noticeState: { status: 'ready', data: backfill },
    appearance: 'system', palette: 'clay', dataBusy: '', dataMessage: null, clearStep: false,
    retrying: false, retryError: null,
    onPatch: () => {}, onSelectFormat: (value) => calls.push(['format', value]),
    onSave: () => calls.push(['save']), onRetryLoad: () => {}, onExport: (value) => calls.push(['export', value]),
    onRequestClear: () => calls.push(['clear-request']), onCancelClear: () => {}, onClear: () => {},
    onRecheckBackfill: () => {}, onCycleAppearance: () => {},
    onSelectAppearance: (value) => appearanceCalls.push(value), onChangePalette: () => {},
  }
  const tree = renderSettingsView(settingsProps)
  const text = textOf(tree)
  assert.doesNotMatch(text, /仪表盘设置|设置保存在本机/, 'Dashboard 设置页不再显示顶部标题与说明两行')
  assert.equal(allOf(tree, byClass('cs-settings-sections')).length, 1, '统计和侧栏设置独立分组')
  assert.equal(allOf(tree, byClass('cs-format-sidebar')).length, 1, '数字格式提供真实侧栏组件预览')
  assert.match(text, /侧栏、概览、趋势、会话与导出共用这一格式/, '数字格式卡底部说明共用范围')
  for (const expected of ['统计与显示', '数字格式', '外观与配色', '初始化设置', '活跃判定阈值', '每周起始', '显示子代理明细', '侧栏显示状态', '侧栏状态点', '状态点位置', '侧栏显示时长', '通知记录', '导出 JSON', '导出 CSV', '选择备份文件导入', '重新显示「近似记录」说明', '清空全部数据']) {
    assert.match(text, new RegExp(expected), `设置页包含「${expected}」`)
  }
  assert.match(text, /未选择文件/, '未选择文件时常显导入状态')
  assert.match(text, /按 ID 去重合并/, '导入说明常显在按钮旁，不再藏进预览')
  assert.match(text, /恢复初始设置/, '设置页提供恢复初始设置入口')
  assert.doesNotMatch(text, /保存设置/, '即点即存后不再有「保存设置」按钮')
  assert.equal(allOf(tree, byClass('cs-format-opt')).length, 5, '五个数字格式选项')
  const checkboxes = findAll(tree, (node) => node.type === 'input' && node.props?.type === 'checkbox')
  assert.equal(checkboxes.length, 3, '子代理、侧栏状态与状态点三个开关')
  const sidebarNameCheckbox = checkboxes.find((node) => node.props?.['aria-label'] === '侧栏显示状态')
  assert.equal(sidebarNameCheckbox?.props?.checked, false, '侧栏状态默认不勾选')
  const sidebarDotCheckbox = checkboxes.find((node) => node.props?.['aria-label'] === '侧栏状态点')
  assert.equal(sidebarDotCheckbox?.props?.checked, true, '侧栏状态点默认显示')
  const selectLabels = findAll(tree, (node) => typeof node.props?.ariaLabel === 'string')
    .map((node) => node.props.ariaLabel)
  assert.ok(selectLabels.includes('活跃判定阈值'), '空闲阈值下拉可用')
  assert.ok(selectLabels.includes('每周起始'), '每周起始下拉可用')
  assert.ok(selectLabels.includes('状态点位置'), '状态点位置下拉可用')
  assert.ok(selectLabels.includes('侧栏显示时长'), '侧栏显示时长下拉可用')
  const dotPositionSelect = findAll(tree, (node) => node.props?.ariaLabel === '状态点位置')[0]
  assert.equal(dotPositionSelect?.props?.value, 'inline', '状态点默认跟随时长')
  assert.equal(dotPositionSelect?.props?.options?.length, 2, '状态点位置提供两种选项')
  const durationSelect = findAll(tree, (node) => node.props?.ariaLabel === '侧栏显示时长')[0]
  assert.equal(durationSelect?.props?.value, 'online', '侧栏显示时长默认在线时长')
  assert.equal(durationSelect?.props?.options?.length, 3, '侧栏显示时长提供三种口径')
  assert.equal(allOf(tree, byClass('cs-palette-opt')).length, 3, '配色区保留三枚可预览色板')
  const appearanceOptions = allOf(tree, byClass('cs-appearance-opt'))
  assert.equal(appearanceOptions.length, 3, '外观区提供浅色、深色、跟随系统三个入口')
  assert.equal(appearanceOptions.find((node) => node.props['aria-pressed'] === true)?.props['aria-label'], '跟随系统', '当前外观有按下态')
  appearanceOptions[0].props.onClick()
  assert.deepEqual(appearanceCalls, ['light'], '外观卡直接选择具体模式')
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

  const previewTree = renderSettingsView({
    ...settingsProps,
    importPreview: { filename: 'backup.json', payload: { format: 'dsh-timespan-export', version: 1, intervals: [], tasks: [] } },
    importRestoreSettings: false,
    onPickImportFile: () => {}, onCancelImport: () => {},
    onImport: () => calls.push(['import']), onToggleImportSettings: () => {},
    onShowApproximate: () => {},
  })
  const previewText = textOf(previewTree)
  assert.match(previewText, /已选择：backup\.json/, '选中文件后常显文件名')
  assert.match(previewText, /待导入文件/, '预览标题以「导入」为主语')
  assert.match(previewText, /确认导入/, '确认按钮文案改为导入')
  const confirmImport = findAll(previewTree, (node) => node.type === 'button' && /确认导入/.test(textOf(node)))[0]
  confirmImport.props.onClick()
  assert.deepEqual(calls, [['export', 'json'], ['clear-request'], ['import']], '确认按钮触发导入')
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
  assert.equal(FOCUS_KEY, 'dsh-timespan.focus')

  const calls = []
  const fake = {
    getItem: (key) => { calls.push(['get', key]); return 'hero' },
    setItem: (key, value) => calls.push(['set', key, value]),
    removeItem: (key) => calls.push(['remove', key]),
  }
  assert.equal(readStoredFocus(fake), 'hero')
  assert.deepEqual(calls, [['get', 'dsh-timespan.focus']], '读取使用同一个存储键')

  assert.equal(readStoredFocus({ getItem: () => 'bogus' }), null, '非法旧值回落普通概览')
  assert.equal(readStoredFocus({ getItem: () => null }), null)
  assert.equal(readStoredFocus({ getItem: () => { throw new Error('denied') } }), null, '隐私模式读取失败不崩溃')
  assert.equal(readStoredFocus(null), null)

  writeStoredFocus(fake, 'trend')
  assert.deepEqual(calls.at(-1), ['set', 'dsh-timespan.focus', 'trend'])
  writeStoredFocus(fake, null)
  assert.deepEqual(calls.at(-1), ['remove', 'dsh-timespan.focus'], '缩回时删除持久化值')
  writeStoredFocus(fake, undefined)
  assert.deepEqual(calls.at(-1), ['remove', 'dsh-timespan.focus'])
  assert.doesNotThrow(() => writeStoredFocus({
    setItem() { throw new Error('quota') },
    removeItem() { throw new Error('quota') },
  }, 'hero'), '写入失败不影响页面')

  assert.equal(focusTransitionMs(false), 240)
  assert.equal(focusTransitionMs(true), 0, 'prefers-reduced-motion 下直接到位')
})

test('客户端：周期按钮切换下方统计，首排保留所选主指标及占比横条', async () => {
  const { renderOverviewMetrics } = await loadClientFunctions()
  const t = (key) => ({
    focusTodayActive: '今日活跃', todayOnline: '今日在线时长', todayTask: '今日任务时长',
    cycleWeek: '本周', cycleMonth: '本月', activeShare: '活跃占比',
    periodDay: '日', rangeLabel: '范围',
    focusSet: '设为首屏', focusUnset: '退出首屏',
  })[key] ?? key
  const selections = []
  const zooms = []
  const data = heroSampleData()
  const to = new Date(2026, 10, 13, 12).getTime()
  Object.assign(data.cycles.week, { from: new Date(2026, 10, 9).getTime(), to })
  Object.assign(data.cycles.month, { from: new Date(2026, 10, 1).getTime(), to })
  const common = {
    data, t, isZh: true, nowMs: new Date(2026, 10, 13).getTime(), format: 'hms',
    onSelectPeriod: (value) => selections.push(value),
    onToggleFocus: (value) => zooms.push(value),
  }
  for (const [index, period] of ['day', 'week', 'month'].entries()) {
    const metrics = renderOverviewMetrics({ ...common, period })
    assert.equal(textOf(allOf(metrics, byClass('cs-hero-num'))[0]), '2:48:16', '切换周期时主数字仍是今日活跃')
    assert.match(textOf(metrics), /今日在线时长\s*5:58:08/)
    assert.match(textOf(metrics), /今日任务时长\s*1:37:14/)
    assert.equal(allOf(metrics, (node) => node.type === 'time')[0].props.dateTime, '2026-11-13')
    const buttons = allOf(metrics, byClass('cs-cycle'))
    assert.equal(buttons.length, 3)
    assert.deepEqual(buttons.map((button) => button.props['aria-pressed']), [0, 1, 2].map((i) => i === index))
    assert.equal(allOf(metrics, byClass('cs-cycle-track')).length, 3)
    const visualDates = allOf(metrics, byClass('cs-cycle-date'))
    assert.deepEqual(visualDates.map(textOf), ['11.09–11.13', '11.01–11.13'], '水印保留真实日期范围')
    assert.ok(visualDates.every((node) => node.props['aria-hidden'] === true), '简写日期不重复参与朗读')
    assert.deepEqual(allOf(metrics, byClass('cs-sr-only')).map(textOf), ['11月9日 – 11月13日', '11月1日 – 11月13日'], '为辅助技术保留完整本地化日期')
    buttons[index].props.onClick()
  }
  assert.deepEqual(selections, ['day', 'week', 'month'])
  const button = allOf(renderOverviewMetrics({ ...common, period: 'day' }), byClass('cs-zoom-btn'))[0]
  assert.equal(button.props['aria-label'], '设为首屏')
  assert.equal(button.props['aria-pressed'], false)
  assert.equal(allOf(button, (node) => node.type === 'svg').length, 1)
  button.props.onClick()
  assert.deepEqual(zooms, ['hero'])
})

test('客户端：首屏放大页重新排版为大数字、多项统计与活跃占比圆环', async () => {
  const { renderHeroFocusPage } = await loadClientFunctions()
  const labels = {
    todayActive: '今日活跃时长', actualOccupied: '实际占用', focusSummary: '首屏概览',
    focusSet: '设为首屏', focusUnset: '退出首屏', todayOnline: '今日在线时长',
    onlineLabel: '在线时长', todayTask: '任务时长', activeShare: '活跃占比', activeLabel: '活跃',
    taskShare: '任务占比', weekActiveShare: '本周活跃占比', monthActiveShare: '本月活跃占比',
    taskLabel: '任务', weekOnline: '本周在线', weekTask: '本周任务',
    monthOnline: '本月在线', monthTask: '本月任务',
    taskCountShort: '任务次数', focusTodayActive: '今日活跃', focusWeekActive: '本周活跃',
    focusMonthActive: '本月活跃',
  }
  const t = (key) => labels[key] ?? key
  const calls = []
  const page = renderHeroFocusPage({
    data: heroSampleData(), t, format: 'hms', onToggleFocus: (value) => calls.push(value),
  })
  assert.equal(allOf(page, byClass('cs-hero-focus')).length, 1, '放大态是独立首屏页')
  assert.doesNotMatch(textOf(page), /首屏概览/, '放大页标题右侧不再显示「首屏概览」小字')
  assert.equal(textOf(allOf(page, byClass('cs-hero-num'))[0]).trim(), '2:48:16', '大数字沿用统一格式')
  const panelText = textOf(allOf(page, byClass('cs-focus-panel'))[0])
  for (const expected of ['在线时长', '任务时长', '今日活跃', '本周活跃', '本月活跃']) {
    assert.match(panelText, new RegExp(expected), `放大页统计面板含「${expected}」`)
  }
  assert.doesNotMatch(panelText, /活跃占比|任务次数/, '不可点的两项不再混在按钮面板里')
  assert.match(textOf(allOf(page, byClass('cs-hero-meta'))[0]), /任务次数/, '任务次数移到只读文字行')
  assert.equal(allOf(page, byClass('cs-share-block')).length, 0, '大数字下方不再保留重复占比块')
  assert.equal(allOf(page, byClass('cs-focus-bar')).length, 0, '圆环已表达占比，不再渲染横条')
  assert.match(panelText, /5:58:08/, '在线时长')
  assert.match(panelText, /1:37:14/, '任务时长')
  assert.match(panelText, /5:51:01/, '本周活跃')
  assert.match(panelText, /14:14:00/, '本月活跃')
  const ring = allOf(page, byClass('cs-hero-ring'))[0]
  assert.ok(ring, '首屏右栏使用圆环')
  assert.equal(ring.props['aria-label'], '活跃占比 47%', '圆环有无障碍读数')
  const ringValue = allOf(ring, byClass('cs-hero-ring-value'))[0]
  assert.equal(ringValue.props.strokeDasharray, '47 53', '圆环弧长按活跃占比分配')
  const ringLegend = textOf(allOf(page, byClass('cs-hero-ring-legend'))[0])
  assert.match(ringLegend, /活跃\s*2:48:16/, '圆环图例给出活跃时长')
  assert.match(ringLegend, /在线时长\s*5:58:08/, '圆环图例给出在线时长')
  assert.equal(allOf(page, byClass('cs-chart')).length, 0, '首屏右栏不再渲染条状图')
  const button = allOf(page, byClass('cs-zoom-btn'))[0]
  assert.equal(button.props['aria-label'], '退出首屏')
  button.props.onClick()
  assert.deepEqual(calls, ['hero'], '再次点击缩回普通概览')

  const noOnline = renderHeroFocusPage({
    data: { ...heroSampleData(), cycles: { ...heroSampleData().cycles, day: { ...heroSampleData().cycles.day, onlineMs: 0 } } },
    t, format: 'hms', onToggleFocus: () => {},
  })
  assert.equal(allOf(noOnline, byClass('cs-hero-ring-value'))[0].props.strokeDasharray, '0 100', '圆环在线为 0 时也归零')

  const taskPage = renderHeroFocusPage({
    data: heroSampleData(), t, format: 'hms', onToggleFocus: () => {}, heroMetric: 'task',
  })
  const taskRing = allOf(taskPage, byClass('cs-hero-ring'))[0]
  assert.match(taskRing.props.className, /is-task/, '任务占比圆环使用任务紫语义')
  assert.equal(taskRing.props['aria-label'], '任务占比 27%', '任务占比以任务时长为分子')
  assert.equal(allOf(taskPage, byClass('cs-hero-ring-value'))[0].props.strokeDasharray, '27 73')
  assert.match(textOf(allOf(taskPage, byClass('cs-hero-ring-legend'))[0]), /任务\s*1:37:14/, '任务图例给任务时长')
  assert.match(textOf(allOf(taskPage, byClass('cs-hero-meta'))[0]), /任务次数 4/, '任务主指标仍显示今日任务次数')

  const weekPage = renderHeroFocusPage({
    data: heroSampleData(), t, format: 'hms', onToggleFocus: () => {}, heroMetric: 'week',
  })
  const weekRing = allOf(weekPage, byClass('cs-hero-ring'))[0]
  assert.equal(weekRing.props['aria-label'], '本周活跃占比 84%', '周活跃占比使用本周活跃÷本周在线')
  assert.match(textOf(allOf(weekPage, byClass('cs-hero-ring-legend'))[0]), /活跃\s*5:51:01/, '周圆环图例给本周活跃')
  assert.match(textOf(allOf(weekPage, byClass('cs-hero-ring-legend'))[0]), /在线时长\s*6:56:40/, '周圆环图例给本周在线')
  assert.match(textOf(allOf(weekPage, byClass('cs-hero-meta'))[0]), /本周在线 6:56:40/, '周指标副信息跟周期')

  const monthPage = renderHeroFocusPage({
    data: heroSampleData(), t, format: 'hms', onToggleFocus: () => {}, heroMetric: 'month',
  })
  assert.equal(allOf(monthPage, byClass('cs-hero-ring'))[0].props['aria-label'], '本月活跃占比 85%', '月活跃占比使用本月活跃÷本月在线')

  const reduced = await loadClientFunctions({ matchMedia: () => ({ matches: true }) })
  const reducedPage = reduced.renderHeroFocusPage({ data: heroSampleData(), t, format: 'hms', onToggleFocus: () => {} })
  assert.equal(reducedPage.props.style['--cs-focus-ms'], '0ms', '减少动效偏好下直接到位')
})

test('客户端：首屏主指标五个时长项可点切换，非法持久化值回落今日活跃时长', async () => {
  const {
    renderHeroFocusPage, renderOverviewView, normalizeHeroMetric, readStoredHeroMetric, writeStoredHeroMetric,
    HERO_METRIC_KEY,
  } = await loadClientFunctions()
  assert.equal(HERO_METRIC_KEY, 'dsh-timespan.heroMetric')
  assert.equal(normalizeHeroMetric('week'), 'week')
  for (const value of ['', 'Active', 'other', null, undefined, 0, {}, []]) {
    assert.equal(normalizeHeroMetric(value), 'active', `非法值 ${JSON.stringify(value)} 归一为今日活跃`)
  }
  const calls = []
  const fake = { getItem: () => 'month', setItem: (key, value) => calls.push([key, value]) }
  assert.equal(readStoredHeroMetric(fake), 'month')
  assert.equal(readStoredHeroMetric({ getItem: () => 'bogus' }), 'active')
  assert.equal(readStoredHeroMetric({ getItem: () => { throw new Error('denied') } }), 'active')
  assert.equal(readStoredHeroMetric(null), 'active')
  writeStoredHeroMetric(fake, 'task')
  assert.deepEqual(calls.at(-1), ['dsh-timespan.heroMetric', 'task'])
  writeStoredHeroMetric(fake, 'bogus')
  assert.deepEqual(calls.at(-1), ['dsh-timespan.heroMetric', 'active'], '写入前归一化')
  assert.doesNotThrow(() => writeStoredHeroMetric({ setItem() { throw new Error('quota') } }, 'week'))

  const labels = {
    todayActive: '今日活跃时长', todayOnline: '今日在线时长', todayTask: '今日任务时长',
    heroMetricWeekTitle: '本周活跃', heroMetricMonthTitle: '本月活跃',
    focusSummary: '首屏概览', actualOccupied: '实际占用', focusSet: '设为首屏',
    focusUnset: '退出首屏', onlineLabel: '在线时长', activeShare: '活跃占比',
    taskCountShort: '任务次数', focusTodayActive: '今日活跃', focusWeekActive: '本周活跃',
    focusMonthActive: '本月活跃', activeLabel: '活跃', heroMetricGroup: '首屏主指标',
  }
  const t = (key) => labels[key] ?? key
  const selected = []
  const base = {
    data: heroSampleData(), t, format: 'hms', onToggleFocus() {},
    onSelectHeroMetric: (value) => selected.push(value),
  }
  const expected = {
    active: '2:48:16', online: '5:58:08', task: '1:37:14', week: '5:51:01', month: '14:14:00',
  }
  for (const [metric, value] of Object.entries(expected)) {
    const page = renderHeroFocusPage({ ...base, heroMetric: metric })
    assert.equal(textOf(allOf(page, byClass('cs-hero-num'))[0]).trim(), value, `${metric} 成为大数字`)
    assert.equal(allOf(page, (node) => hasClass(node, 'is-current')).length, 1, `${metric} 只有一项高亮`)
    const overview = renderOverviewView({ ...base, period: 'day', focus: null, heroMetric: metric })
    const main = allOf(overview, byClass('cs-cycle-today'))[0]
    const mainValue = findByClass(main, 'cs-hero-num')
    assert.equal(textOf(mainValue), value, `缩回概览仍显示 ${metric} 的数值`)
    assert.equal(hasClass(mainValue, 'is-today-online'), metric === 'online')
    const secondary = findByClass(overview, 'cs-overview-metric-pair')
    assert.equal(allOf(secondary, byClass('is-today-online')).length, Number(metric === 'active' || metric === 'task'))
    const focusTitle = textOf(allOf(page, (node) => node.type === 'h2')[0]).trim()
    assert.equal(textOf(findByClass(main, 'cs-cycle-title')), metric === 'active' ? '今日活跃' : focusTitle)
    const ring = findByClass(page, 'cs-hero-ring')
    assert.equal(textOf(findByClass(main, 'cs-cycle-share')), ring.props['aria-label'], '概览横条与放大页圆环的比例一致')
    assert.equal(main.props['aria-pressed'], true, '主指标的切换保留原有的下方统计周期')
  }
  const page = renderHeroFocusPage({ ...base, heroMetric: 'week' })
  assert.equal(textOf(allOf(page, (node) => node.type === 'h2')[0]).trim(), '本周活跃', '标题跟随主指标')
  const buttons = allOf(page, byClass('cs-fs-button'))
  assert.equal(buttons.length, 5, '五个时长项是可点按钮')
  assert.ok(buttons.every((button) => button.type === 'button'))
  assert.equal(allOf(page, byClass('cs-fs-item')).length - buttons.length, 0, '统计面板里不再混入不可点的只读项')
  const panel = allOf(page, byClass('cs-focus-panel'))[0]
  assert.equal(allOf(panel, byClass('cs-fs-item')).length, 5, '面板内每项都可点，不误导用户')
  assert.doesNotMatch(textOf(panel), /活跃占比/, '活跃占比不再在按钮面板里重复')
  assert.match(textOf(allOf(page, byClass('cs-hero-meta'))[0]), /任务次数/, '任务次数移到大数字下方只读文字行')
  const weekButton = buttons.filter((button) => textOf(button).includes('本周活跃'))[0]
  weekButton.props.onClick()
  assert.deepEqual(selected, ['week'], '点击请求切换主指标')

  const defaultPage = renderHeroFocusPage(base)
  assert.equal(textOf(allOf(defaultPage, byClass('cs-hero-num'))[0]).trim(), '2:48:16', '缺省回落今日活跃')
  assert.equal(allOf(defaultPage, byClass('cs-share-head')).length, 0, '大数字下方不再重复活跃占比数值')
  assert.equal(allOf(defaultPage, byClass('cs-share-foot')).length, 0, '圆环图例已给出分子分母，不再重复脚注')
  assert.equal(allOf(defaultPage, byClass('cs-hero-focus-body')).length, 1, '方案 B 左右两栏')
  assert.equal(allOf(renderHeroFocusPage({ ...base, data: sampleDashboardData() }), byClass('cs-chart')).length, 0,
    '右侧不再复用趋势柱图')
  assert.equal(allOf(renderHeroFocusPage({ ...base, data: sampleDashboardData() }), byClass('cs-hero-ring')).length, 1,
    '右侧固定渲染活跃占比圆环')
})

test('客户端：概览在首屏状态只渲染放大页，普通状态同时有首屏卡片与周期卡', async () => {
  const { renderOverviewView } = await loadClientFunctions()
  const t = (key) => ({
    overviewTitle: '周期概览', actualOccupied: '实际占用', cycleToday: '今日', cycleWeek: '本周', cycleMonth: '本月',
    taskCountUnit: '次任务', activeLabel: '活跃', taskLabel: '任务', selectedPeriod: '当前',
    compositionTitle: '任务时长构成', compositionInfo: '按会话累计',
    noTaskComposition: '暂无任务', accumulated: '累计工时', workspaceRanking: '工作区任务排行',
    sumFoot: '明细按会话逐条累加', unassigned: '未归属', colShare: '任务占比',
    trendDay: '今日 24 小时', trendWeek: '本周每日', trendMonth: '本月每日', trendInfo: '活跃与任务独立统计',
    emptyDashboard: '暂无记录', recentSessions: '最近会话', recentSessionsHint: '按最近活动排序',
    recentSessionsEmpty: '暂无会话', unknownSession: '未命名会话',
    justNow: '刚刚', minutesAgo: '{n} 分钟前', hoursAgo: '{n} 小时前', daysAgo: '{n} 天前',
    todayActive: '今日活跃时长', focusSet: '设为首屏', focusUnset: '退出首屏',
    focusSummary: '首屏概览', todayOnline: '今日在线时长', todayTask: '今日任务时长',
    onlineLabel: '在线时长', activeShare: '活跃占比', taskCountShort: '任务次数',
    focusTodayActive: '今日活跃', focusWeekActive: '本周活跃', focusMonthActive: '本月活跃',
    peakActive: '峰值活跃', peakPeriod: '最活跃时段', trendFocusTitle: '活跃与任务趋势',
  })[key] ?? key
  const data = sampleDashboardData()
  const hoverTip = { tip: null, show() {}, hide() {} }
  const common = {
    data, t, isZh: true, period: 'day', onSelectPeriod() {}, durationFormat: 'hms',
    hoverTip, nowMs: Date.now(), onOpenWorkspace() {}, onToggleFocus() {},
  }

  const normal = renderOverviewView({ ...common, focus: null })
  const overviewHeading = allOf(normal, byClass('cs-overview-heading'))[0]
  assert.doesNotMatch(textOf(overviewHeading), /实际占用/, '周期概览标题右侧不再显示「实际占用」标签')
  assert.equal(allOf(normal, byClass('cs-overview-metrics')).length, 1, '普通概览含首排统计卡片')
  assert.equal(allOf(normal, byClass('cs-cycle')).length, 3, '普通概览保留日/周/月周期卡')
  assert.ok(allOf(normal, byClass('cs-trend-card')).length >= 1)
  assert.equal(allOf(normal, byClass('cs-trend-foot')).length, 1, '普通概览趋势卡底部有三项统计带')
  const trendFoot = allOf(normal, byClass('cs-trend-foot'))[0]
  assert.equal(allOf(trendFoot, byClass('cs-trend-foot-item')).length, 3, '底部统计带只保留三项')
  assert.match(textOf(trendFoot), /峰值活跃/, '趋势底部统计含峰值活跃')
  assert.match(textOf(trendFoot), /最活跃时段/, '趋势底部统计含最活跃时段')
  assert.match(textOf(trendFoot), /任务/, '趋势底部统计含任务时长')
  assert.doesNotMatch(textOf(trendFoot), /活跃占比/, '趋势底部不再重复活跃占比')
  assert.ok(allOf(normal, byClass('cs-composition')).length >= 1)
  const composition = allOf(normal, byClass('cs-composition'))[0]
  assert.equal(allOf(composition, byClass('cs-tag')).length, 0, '任务构成标题右侧不再显示「累计工时」标签')
  assert.equal(allOf(normal, byClass('cs-ranking-share')).length, 0, '工作区排行不再单列可见的占比数字列')
  assert.equal(allOf(normal, byClass('cs-card-icon')).length, 5, '首屏、趋势、构成、排行、最近会话五个标题左侧各有图标')
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
  for (const expected of ['活跃与任务趋势', '峰值活跃', '最活跃时段', '活跃占比', '75%']) {
    assert.match(trendText, new RegExp(expected), `趋势首屏包含「${expected}」`)
  }
  assert.doesNotMatch(trendText, /首屏概览|条状图首屏/, '趋势首屏不再显示「首屏概览」或字面 UI 标签')

  const heatmapFocus = renderOverviewView({ ...common, focus: 'heatmap' })
  assert.equal(allOf(heatmapFocus, byClass('cs-heatmap-focus-page')).length, 1, '热力图首屏只留独立页')
  assert.equal(allOf(heatmapFocus, byClass('cs-heatmap-focus')).length, 1, '热力图卡片进入首屏排版')
  assert.equal(allOf(heatmapFocus, byClass('cs-hero-focus')).length, 0, '与 hero 首屏互斥')
  assert.equal(allOf(heatmapFocus, byClass('cs-trend-focus')).length, 0, '与趋势首屏互斥')
  assert.equal(allOf(heatmapFocus, byClass('cs-cycle')).length, 0, '热力图首屏不渲染周期卡')
  assert.equal(allOf(heatmapFocus, byClass('cs-composition')).length, 0, '热力图首屏不渲染构成卡')
})

test('客户端：普通概览按参考稿分三行，全年热力图独占底部一行', async () => {
  const { renderOverviewView } = await loadClientFunctions()
  const common = {
    data: sampleDashboardData(), t: (key) => key, isZh: true, period: 'day', durationFormat: 'hms',
    hoverTip: { tip: null, show() {}, hide() {} }, nowMs: Date.now(), onToggleFocus() {},
  }
  const grid = allOf(renderOverviewView(common), byClass('cs-overview-grid'))[0]
  assert.equal(grid.children.length, 3)
  assert.ok(hasClass(grid.children[0], 'cs-overview-metrics'))
  const analysis = grid.children[1]
  assert.ok(hasClass(analysis, 'cs-overview-analysis'))
  assert.ok(hasClass(analysis.children[0], 'cs-trend-card'))
  assert.ok(hasClass(analysis.children[1], 'cs-composition'))
  const bottom = grid.children[2]
  assert.ok(hasClass(bottom, 'cs-overview-bottom'))
  assert.ok(hasClass(bottom.children[0], 'cs-heatmap-card'))
  assert.ok(hasClass(bottom.children[1], 'cs-ranking'))
  assert.ok(hasClass(bottom.children[2], 'cs-recent'))
  assert.equal(allOf(bottom, byClass('is-short')).length, 1, '只有一条排行时靠上对齐')

  const year = allOf(renderOverviewView({ ...common, heatRangeValue: 'year' }), byClass('cs-overview-grid'))[0]
  assert.ok(hasClass(year.children[2], 'is-year'))
  assert.equal(year.children[2].children.length, 2)
  assert.ok(hasClass(year.children[3], 'cs-heatmap-card'))
  assert.equal(year.children[3].props['data-range'], 'year')

  for (const focus of ['hero', 'trend', 'heatmap']) {
    const page = renderOverviewView({ ...common, focus })
    assert.equal(allOf(page, byClass('cs-overview-grid')).length, 0, `${focus} 首屏单独渲染`)
  }
})

test('客户端：概览按内容宽度从并排切换到堆叠布局', async () => {
  const css = await loadClientCss()
  assert.match(declarationsFor(css, '.cs-overview-grid'), /grid-template-rows:\s*auto\s+auto\s+auto/)
  assert.match(declarationsFor(css, '.cs-overview-analysis'), /grid-template-columns:\s*minmax\(0, 1\.8fr\) minmax\(0, 1fr\)/)
  assert.match(declarationsFor(css, '.cs-overview-bottom'), /grid-template-columns:\s*minmax\(0, 1\.08fr\) minmax\(0, \.87fr\) minmax\(0, 1\.3fr\)/)
  assert.match(css, /@container cs-overview \(max-width: 850px\)[\s\S]*?\.cs-overview-bottom \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /@container cs-overview \(max-width: 560px\)[\s\S]*?\{ grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(declarationsFor(css, '.cs-ranking-list.is-short'), /margin-block:\s*4px auto/)
  assert.match(declarationsFor(css, '.cs-trend-foot'), /grid-template-columns:\s*repeat\(3,/)
  assert.match(declarationsFor(css, '.cs-card-title'), /display:\s*inline-flex/)
  assert.match(declarationsFor(css, '.cs-card-icon'), /color:\s*var\(--dsw-alias-label-secondary\)/)
})

test('客户端：首屏缩放按钮、圆环与无边框样式，并尊重减少动效', async () => {
  const css = await loadClientCss()
  const { zoomIcon } = await loadClientFunctions()
  const expandIcon = zoomIcon(false)
  const restoreIcon = zoomIcon(true)
  assert.equal((expandIcon.children[0].props.d.match(/M/g) || []).length, 2, '普通态只有左上与右下两个尖角')
  assert.equal((restoreIcon.children[0].props.d.match(/M/g) || []).length, 2, '首屏态同样只有两个尖角')
  assert.notEqual(expandIcon.children[0].props.d, restoreIcon.children[0].props.d, '放大与缩回图形可区分')
  const zoom = declarationsFor(css, '.cs-zoom-btn')
  assert.match(zoom, /position:\s*absolute/, '按钮固定在卡片右上角')
  assert.match(zoom, /background:\s*transparent/, '无填充')
  assert.match(zoom, /border:\s*0/, '无边框')
  assert.match(declarationsFor(css, '.cs-zoom-btn:hover'), /scale\(1\.15\)/, '悬浮放大')
  assert.match(declarationsFor(css, '.cs-zoom-btn svg'), /stroke:\s*var\(--cs-ink-2\)/, '图标用次级文字色')
  const number = declarationsFor(css, '.cs-hero-focus .cs-hero-num')
  assert.match(number, /font-size:[^;]+cqw[^;]+svh/, '首屏主数字同时受内容宽度和窗口高度约束')
  assert.match(number, /overflow-wrap:\s*anywhere/, '长时长可以在窄窗换行')
  assert.doesNotMatch(css, /\.cs-focus-bar/, '大数字下方不再保留占比横条')
  assert.doesNotMatch(css, /\.cs-share-block/, '不再保留重复占比块的样式')
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cs-hero-focus/, '减少动效下首屏直接到位')
})

test('客户端：周期卡选中态的占比横条与纯色背景保持可分辨', async () => {
  const css = await loadClientCss()
  assert.match(declarationsFor(css, '.cs-cycle.is-current'), /background:\s*var\(--cs-selection\)/, '趋势周期卡使用选中底色')
  assert.match(declarationsFor(css, '.cs-overview-metrics > .cs-cycle.is-current'), /background:\s*var\(--cs-selection\)/, '概览周期卡与趋势共用选中底色')
  assert.match(declarationsFor(css, '.cs-page'), /--cs-selection:\s*var\(--cs-chart-active\)/, '选中底色跟随活跃柱')
  assert.match(declarationsFor(css, '.cs-page.cs-palette-blue:not(.cs-appearance-dark)'), /--cs-on-selection:\s*var\(--cs-signal-deep\)/, '浅蓝选中底色配深色文字')
  assert.match(declarationsFor(css, '.cs-appearance-light .cs-overview-metrics > .cs-cycle.is-current:focus-visible'), /outline-color:\s*var\(--cs-on-selection\)/, '已选卡片仍能看到键盘焦点')
  const track = declarationsFor(css, '.cs-cycle.is-current .cs-cycle-track')
  assert.match(track, /--cs-on-selection/, '轨道用同一文字色半透明')
  const fill = declarationsFor(css, '.cs-cycle.is-current .cs-cycle-track i')
  assert.match(fill, /background:\s*var\(--cs-on-selection\)/, '填充使用与背景不同的颜色')
  assert.match(declarationsFor(css, '.cs-cycle'), /justify-content:\s*flex-start/, '标题与主数字从顶部排布')
  assert.match(declarationsFor(css, '.cs-cycle-tail'), /margin-top:\s*auto/, '占比与横条压到卡片底部')
  assert.match(declarationsFor(css, '.cs-cycle-share'), /font-size:\s*10px/, '占比文字缩小并贴到横条上方')
  assert.doesNotMatch(css, /\.cs-cycle-foot/, '周期卡不再保留底部小字样式')
  assert.match(declarationsFor(css, '.cs-cycle-value'), /clamp\(30px,\s*3vw,\s*40px\)/, '周期卡主数字放大，填满卡片视觉重心')
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
    heatmapTitle: '每日活跃', heatmapFocusTitle: '每日活跃热力图',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    rangeOnline: '范围在线', rangeActive: '范围活跃', rangeTask: '范围任务',
    peakDay: '最活跃日', activeDaysLabel: '活跃天数', dailyAverageActive: '日均活跃',
    heatmapLoading: '正在加载每日活跃…', heatmapEmpty: '暂无每日记录',
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
    heatmapTitle: '每日活跃', heatmapFocusTitle: '每日活跃热力图',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', monthBars: '月度活跃', periodDay: '日',
    onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务', noRecord: '无记录',
    heatDayTitle: '{month}月{day}日',
    rangeOnline: '范围在线', rangeActive: '范围活跃', rangeTask: '范围任务',
    peakDay: '最活跃日', activeDaysLabel: '活跃天数', dailyAverageActive: '日均活跃',
    focusSet: '设为首屏', focusUnset: '退出首屏', focusSummary: '首屏概览',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日活跃…', heatmapEmpty: '暂无每日记录',
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
  assert.match(textOf(page), /每日活跃热力图/, '首屏页使用描述图表含义的标题')
  assert.doesNotMatch(textOf(page), /首屏概览|热力图首屏/, '热力图首屏不显示「首屏概览」或字面 UI 标签')
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
  const monthRow = allOf(page, byClass('heat-months'))[0]
  assert.match(monthRow.props.className, /is-grid/, '3m 首屏月份刻度走网格定位')
  assert.match(monthRow.props.className, /is-focus/, '3m 首屏月份刻度带首屏标记')
  assert.match(monthRow.props.style.gridTemplateColumns, /var\(--cs-heat-cell\)/, '3m 首屏月份刻度与固定像素周网格同列宽')
  assert.equal(allOf(page, byClass('heat-month-bar')).length, 12, '正文下方保留 12 个月度条')
  assert.equal(allOf(page, byClass('heat-month-bar'))[0].props['data-month'], '1月', '首屏月度条月份名使用中文')
  assert.equal(allOf(page, byClass('heat-focus-bars')).length, 1, '月度条区包成可拉伸的独立区块')
  assert.match(textOf(allOf(page, byClass('heat-focus-bars-head'))[0]), /月度活跃/, '月度条区给出可见标题')
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

test('客户端：热力图卡片含月份刻度、星期标签与色带浮层', async () => {
  const { renderDailyHeatmap, renderOverviewView, Info } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日活跃', heatLegendLabel: '活跃程度图例', heatLegendLow: '低', heatLegendHigh: '高',
    periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日活跃…', heatmapEmpty: '暂无每日记录',
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
  assert.equal(allOf(tree, byClass('heat-legend')).length, 0, '没有旧版深浅图例')
  assert.equal(allOf(tree, byClass('heat-detail')).length, 0, '没有下方重复的单日明细')
  const legendInfo = findAll(tree, (node) => node.type === Info)
    .find((node) => findByClass(node.props?.content, 'cs-heat-legend'))
  assert.ok(legendInfo, 'ⓘ 悬浮层改为热力色带')
  assert.equal(legendInfo.props.message, '活跃程度图例', '无障碍名称描述图例按钮的用途')
  assert.equal(findAllByClass(legendInfo.props.content, 'cs-heat-legend-swatch').length, 6, '色带覆盖六个热力等级')
  assert.doesNotMatch(textOf(legendInfo.props.content), /每格代表一天|说明/, '悬浮层不再显示说明文字')

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
  assert.match(textOf(loading), /正在加载每日活跃/)
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
  for (const color of ['#eef5fc', '#dbe9f7', '#b8d4ef', '#1b4c87']) {
    assert.match(css, new RegExp(color, 'i'), `默认蓝热力色阶包含 ${color}`)
  }
  assert.match(declarationsFor(css, '.heat-cell.is-empty'), /background:\s*var\(--cs-heat-0\)/, '无记录格使用最浅雾蓝而不是灰块')
  assert.doesNotMatch(declarationsFor(css, '.heat-cell'), /border:\s*1px/, '热力格只保留纯色块，不再描边')
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
    trendFocusTitle: '活跃与任务趋势', focusSummary: '首屏概览', trendInfo: '活跃与任务独立统计',
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
    trendDay: '今日 24 小时', trendWeek: '本周每日', trendMonth: '本月每日',
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

test('客户端：趋势页图表与右侧摘要同排，摘要保持两列', async () => {
  const { dshTimespanCss } = await loadClientFunctions()
  const css = dshTimespanCss()
  assert.match(declarationsFor(css, '.cs-trend-layout > .cs-trend-card'), /grid-column:\s*1/, '图表卡固定在左栏')
  assert.match(declarationsFor(css, '.cs-trend-layout > .cs-trend-summary'), /grid-column:\s*2/, '摘要卡固定在右栏，不再被全局概览网格规则挤到下一行')
  const grid = declarationsFor(css, '.cs-trend-summary .cs-stat-grid')
  assert.match(grid, /grid-template-columns:\s*repeat\(2,/, '摘要四项排成两列')
  assert.match(declarationsFor(css, '.cs-trend-summary .cs-stat-box'), /background:\s*transparent/, '摘要使用共享表面')
})

test('客户端：条状图首屏按可用高度铺开、悬停分组放大并尊重减少动效', async () => {
  const css = await loadClientCss()
  const focused = declarationsFor(css, '.cs-page.is-overview-focused')
  assert.match(focused, /display:\s*flex/, '放大态以宿主内容区作为纵向布局容器')
  assert.match(css, /\.is-overview-focused > \.cs-shell,\s*\.is-overview-focused \.cs-views,\s*\.is-overview-focused #cs-view-overview,\s*#cs-view-overview > :is\(\.cs-hero-focus, \.cs-trend-focus, \.cs-heatmap-focus-page\)\s*\{\s*flex:\s*1 0 auto/, '三个放大页共享剩余高度并保留内容的自然高度')
  const chart = declarationsFor(css, '.cs-trend-focus .cs-chart')
  assert.match(chart, /flex:\s*1 0 auto/, '图表容器分配卡片的剩余高度')
  assert.match(declarationsFor(css, '.cs-trend-focus .cs-plot'), /flex:\s*1/, '绘图区弹性填满容器')
  assert.match(declarationsFor(css, '.cs-trend-focus .cs-chart svg'), /flex:\s*1 0 auto/, 'SVG 填满绘图区')
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
    heatmapTitle: '每日活跃', yearHeatTitle: '全年每日活跃',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    monthBars: '月度活跃', periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日活跃…', heatmapEmpty: '暂无每日记录',
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
  assert.match(textOf(card), /全年每日活跃/, '全年视图使用全年标题')

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
    heatmapTitle: '每日活跃', monthHeatTitle: '{month}每日活跃',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日活跃…', heatmapEmpty: '暂无每日记录',
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
  assert.match(textOf(card), /8月每日活跃/, '单月标题的 {month} 占位替换成中文月份')
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

test('客户端：范围菜单上方空间不足时自动翻到下方并夹取视口', async () => {
  const { clampTipPosition } = await loadClientFunctions()
  const size = { width: 224, height: 300 }
  const viewport = { width: 1200, height: 800 }
  const high = clampTipPosition(
    { left: 100, top: 100, width: 88, height: 28 }, size, viewport,
    { gap: 6, prefer: 'top' })
  assert.equal(high.placement, 'bottom', '上方只剩 100px 时翻到下方，首屏边缘不再被裁')
  assert.equal(high.top, 134, '触发器底边 + 6px')
  const low = clampTipPosition(
    { left: 100, top: 600, width: 88, height: 28 }, size, viewport,
    { gap: 6, prefer: 'top' })
  assert.equal(low.placement, 'top', '下方不足时回到上方')
  assert.equal(low.top, 294)
  const edge = clampTipPosition(
    { left: 1180, top: 600, width: 88, height: 28 }, size, viewport,
    { gap: 6, prefer: 'top' })
  assert.ok(edge.left <= 1200 - 224 - 8, '右边缘按视口夹取')
})

test('客户端：热力图范围复用统一自定义下拉并一次展示 15 项', async () => {
  const { renderDailyHeatmap, Select, React } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日活跃',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日活跃…', heatmapEmpty: '暂无每日记录',
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
  const menuNode = findByClass(rendered, 'cs-select-menu')
  assert.equal(typeof menuNode.props.style.left, 'string', '菜单用内联 left 定位')
  assert.equal(typeof menuNode.props.style.top, 'string', '菜单用内联 top 定位（视口夹取）')
  const options = allOf(rendered, byClass('cs-opt'))
  assert.equal(options.length, 15, '一次渲染全部 15 项，不做滚动裁切')
  assert.equal(options.filter((option) => hasClass(option, 'is-span-2')).length, 0, '15 项统一三列，不再让跨度选项横跨整行')
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

test('客户端：热力图范围复用统一下拉的向上三列菜单与自适应网格', async () => {
  const { dshTimespanCss } = await loadClientFunctions()
  const css = dshTimespanCss()
  const menu = declarationsFor(css, '.cs-select-menu.is-grid')
  assert.match(menu, /display:\s*grid/)
  assert.match(menu, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, '基础网格两列')
  assert.match(menu, /max-height:\s*none/, '不限制高度，15 项一次可见')
  assert.match(menu, /overflow:\s*visible/, '菜单不被裁切')
  const rangeMenu = declarationsFor(css, '.heat-range-select .cs-select-menu.is-grid')
  assert.match(rangeMenu, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, '热力图范围菜单收紧为三列')
  assert.match(rangeMenu, /min-width:\s*178px/, '菜单宽度不再占满卡片')
  const settingsTrigger = declarationsFor(css, '.cs-settings-select .cs-select-btn')
  assert.match(settingsTrigger, /min-width:\s*72px/, '统计口径下拉收窄到 72px')
  assert.match(settingsTrigger, /min-height:\s*30px/, '统计口径下拉保持可点击高度')
  const fixed = declarationsFor(css, '.cs-select-menu')
  assert.match(fixed, /position:\s*fixed/, '菜单固定到视口，脱离 .cs-page 与卡片的裁切')
  assert.match(fixed, /z-index:\s*90/, '菜单与说明/图表浮层统一层级')
  assert.match(fixed, /width:\s*max-content/, '菜单宽度按选项内容决定')
  assert.doesNotMatch(fixed, /min-width:\s*100%/, 'fixed 菜单不再按视口铺满整页')
  assert.match(fixed, /max-width:\s*min\(360px,\s*calc\(100vw\s*-\s*16px\)\)/, '窄屏下菜单仍有可读边界')
  const upward = declarationsFor(css, '.cs-select.is-top .cs-select-menu')
  assert.match(upward, /animation-name:\s*cs-menu-in-top/, '向上偏好只决定入场动画方向')
  assert.doesNotMatch(css, /bottom:\s*calc\(100%\s*\+\s*6px\)/, '不再用 CSS 偏移向上，位置交给视口夹取')
  assert.doesNotMatch(css, /top:\s*calc\(100%\s*\+\s*6px\)/, '不再用 CSS 偏移向下')
  assert.match(declarationsFor(css, '.cs-select'), /position:\s*relative/)
  assert.match(declarationsFor(css, '.cs-heatmap-card'), /overflow:\s*visible/)
  const card = declarationsFor(css, '.cs-heatmap-card')
  assert.match(card, /--cs-heat-cell:\s*clamp\(/, '周网格格子尺寸随可用宽度自适应')
  // 全年已改为 7 行周网格，容器带 is-year：列宽等比分配，格子随宽度缩放保持正方形。
  const yearBody = declarationsFor(css, '.heatmap-body.is-year')
  assert.match(yearBody, /--cs-heat-gap:\s*clamp\(1px,\s*\.2vw,\s*3px\)/, '全年网格间隙随宽度收紧')
  assert.match(declarationsFor(css, '.heatmap-body.is-year .heat-weekgrid'), /grid-auto-columns:\s*minmax\(0,\s*1fr\)/, '全年 53 列等比缩放')
  assert.match(declarationsFor(css, '.heatmap-body.is-year .heat-plot'), /gap:\s*4px/, '全年月份刻度与网格之间留间距')
  assert.match(declarationsFor(css, '.heatmap-body.is-year .heat-weekdays-spacer'), /display:\s*none/, '全年去掉星期标签上方空行，七行刻度与格子严格对齐')
  const monthGrid = declarationsFor(css, '.heat-month-grid')
  assert.match(monthGrid, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/, '单月日历 7 列')
  assert.match(declarationsFor(css, '.heat-month .heat-cell'), /aspect-ratio:\s*1/, '单月格子随列宽保持正方形')
  assert.match(declarationsFor(css, '.heat-month-bars'), /grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/, '12 个月度条铺满宽度')
})

test('客户端：任务时长构成行的时长不撑出卡片边框', async () => {
  const { dshTimespanCss } = await loadClientFunctions()
  const css = dshTimespanCss()
  const row = declarationsFor(css, '.cs-composition-row')
  assert.match(row, /grid-template-columns:\s*10px minmax\(min-content, 1fr\) max-content minmax\(0, max-content\)/, '名称和百分比保留内容宽度')
  assert.match(row, /min-width:\s*0/, '构成行本身允许收缩')
  assert.match(declarationsFor(css, '.cs-composition-label'), /min-width:\s*max-content/, '图例名称完整显示')
  assert.match(declarationsFor(css, '.cs-composition-time, .cs-ranking-time'), /text-overflow:\s*ellipsis/, '过长时长省略而不溢出边框')
  assert.match(declarationsFor(css, '.cs-composition-body'), /gap:\s*16px/, '给列表留出更多宽度')
  assert.match(declarationsFor(css, '.cs-donut'), /width:\s*clamp\(118px/, '圆环最小宽度回到 118px')
  assert.doesNotMatch(css, /\.cs-donut\s*\{[^}]*width:\s*clamp\(88px/, '不再缩到 88px 导致中心数字拥挤')
  assert.match(css, /@container cs-composition \(max-width: 310px\)[\s\S]*?flex-direction:\s*column/, '卡片较窄时图例放到圆环下方')
  assert.match(declarationsFor(css, '.cs-composition-time'), /overflow-wrap:\s*anywhere/, '长时长允许换行')
  const donutNumber = declarationsFor(css, '.cs-donut-center strong')
  assert.match(donutNumber, /font-size:\s*clamp\(14px/, '中心数字随圆环尺寸缩放')
  assert.match(donutNumber, /text-overflow:\s*ellipsis/, '极窄时数字省略而不压出圆环')
  assert.match(donutNumber, /white-space:\s*nowrap/, '中心数字保持单行')
  assert.match(mediaBlocks(css, 1100), /\.cs-donut\s*\{[^}]*width:\s*132px/, '中等窗口圆环固定 132px')
  assert.match(mediaBlocks(css, 520), /\.cs-donut\s*\{[^}]*width:\s*118px/, '窄窗圆环回落到 118px')
})

test('客户端：热力图首屏上半区整幅热力图、下半区统计与月度条分层', async () => {
  const css = await loadClientCss()
  assert.match(declarationsFor(css, '.cs-heatmap-focus'), /flex:\s*1 0 auto/, '热力图卡片随放大页填充剩余高度')
  const layout = declarationsFor(css, '.heat-focus-layout')
  assert.match(layout, /display:\s*flex/, '首屏纵向分层')
  assert.match(layout, /flex-direction:\s*column/, '上半区热力图、下半区统计与月度条')
  assert.match(layout, /gap:\s*16px/)
  const main = declarationsFor(css, '.heat-focus-main')
  assert.match(main, /min-width:\s*0/)
  assert.match(main, /flex:\s*1 0 auto/, '热力图区使用剩余高度并容纳网格')
  const body = declarationsFor(css, '.cs-heatmap-focus .heatmap-body')
  assert.match(body, /width:\s*100%/, '周网格容器铺满宽度')
  assert.match(body, /flex:\s*0 1 auto/, '周网格按内容高度排，不拉伸变形')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heatmap-body.is-year'), /overflow:\s*visible/, '全年布局取消横向裁切')
  assert.match(body, /overflow-x:\s*auto/, '3m/6m 保留横向滚动')
  const weekgrid = declarationsFor(css, '.cs-heatmap-focus .heat-weekgrid')
  assert.match(weekgrid, /width:\s*100%/, '全年周网格随卡片铺满')
  assert.match(weekgrid, /grid-auto-columns:\s*minmax\(0,\s*1fr\)/, '周网格列宽等比分配')
  assert.match(weekgrid, /grid-template-rows:\s*repeat\(7,\s*auto\)/, '七行随格子正方形高度自适应')
  const focusCell = declarationsFor(css, '.cs-heatmap-focus .heat-weekgrid .heat-cell')
  assert.match(focusCell, /aspect-ratio:\s*1/, '格子在放大态保持正方形')
  assert.doesNotMatch(focusCell, /height:\s*100%/, '同一块不给确定行高，否则 aspect-ratio 被忽略变竖条')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heat-months'), /display:\s*grid/, '放大态月份刻度随周网格等比铺开')
  const weekBody = declarationsFor(css, '.cs-heatmap-focus .heatmap-body:not(.is-year)')
  assert.match(weekBody, /width:\s*fit-content/, '3m/6m 首屏把星期刻度与网格作为整体居中')
  assert.match(weekBody, /--cs-heat-cell:[^;]+--cs-heat-cell-limit[^;]+cqw[^;]+--cs-heat-columns/, '周网格根据高度上限、内容宽度和实际周数计算格子大小')
  assert.match(declarationsFor(css, '.cs-heatmap-focus'), /--cs-heat-cell-limit:[^;]+svh/, '格子尺寸上限随窗高调整')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heatmap-body:not(.is-year) .heat-plot'), /width:\s*max-content/, '3m/6m 首屏绘制区按网格实际宽度收缩')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heat-months.is-grid:not(.is-year)'), /width:\s*max-content/, '3m/6m 首屏月份刻度与网格同宽')
  const month = declarationsFor(css, '.cs-heatmap-focus[data-layout="month"] .heat-month')
  assert.match(month, /width:[^;]+svh/, '单月日历随窗高调整')
  assert.match(month, /margin:\s*0 auto/, '单月居中')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heat-month-grid'), /width:\s*100%/, '单月 7 列网格铺满')
  const bottom = declarationsFor(css, '.heat-focus-bottom')
  assert.match(bottom, /display:\s*grid/, '下半区统计与月度条左右分栏')
  assert.match(bottom, /grid-template-columns:\s*minmax\(0,\s*1\.05fr\)\s+minmax\(0,\s*1fr\)/, '左侧统计、右侧月度条')
  assert.match(bottom, /border-top:\s*1px\s+solid\s+var\(--cs-line\)/, '上下区域用分隔线分层')
  const panel = declarationsFor(css, '.heat-focus-panel')
  assert.match(panel, /display:\s*grid/)
  assert.match(panel, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, '六项统计三列两行')
  assert.match(declarationsFor(css, '.heat-focus-panel .cs-fs-item'), /border-left:\s*1px/, '统计项之间用细竖线分隔')
  assert.match(declarationsFor(css, '.heat-focus-bars'), /min-height:\s*96px/, '月度条区保持完整高度')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heat-month-bars'), /height:[^;]+svh/, '月度条随窗高调整')
  assert.match(declarationsFor(css, '.heat-focus-layout.is-year .heat-focus-bars'), /height:[^;]+svh/, '全年格子按宽度定高，月度条随窗高放大')
  assert.match(css, /@container cs-overview \(max-width: 680px\)\s*\{[\s\S]*?\.heat-focus-bottom\s*\{[^}]*grid-template-columns:\s*1fr/, '内容区较窄时下半区回落单列')
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cs-heatmap-focus-page/, '减少动效下首屏直接到位')
  assert.match(declarationsFor(css, '.cs-hero-ring'), /aspect-ratio:\s*1/, 'hero 右栏圆环保持正圆')
  assert.match(declarationsFor(css, '.cs-hero-ring-value'), /stroke:\s*var\(--cs-signal\)/, '圆环使用当前重点色')
  assert.match(declarationsFor(css, '.cs-hero-ring-legend'), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, '圆环图例双列排布')
  assert.doesNotMatch(css, /\.cs-hero-mini-chart/, '首屏右栏不再保留旧条状图样式')
  const yearBody = declarationsFor(css, '.heatmap-body.is-year')
  assert.match(yearBody, /display:\s*grid/, '全年热力图改用自适应网格')
  assert.match(yearBody, /overflow:\s*visible/, '全年热力图不再出现横向滚动条')
  const yearGrid = declarationsFor(css, '.heatmap-body.is-year .heat-weekgrid')
  assert.match(yearGrid, /width:\s*100%/, '全年周网格随卡片宽度缩放')
  assert.match(yearGrid, /grid-auto-columns:\s*minmax\(0,\s*1fr\)/, '53 列等比压缩，不撑出容器')
  const yearCell = declarationsFor(css, '.heatmap-body.is-year .heat-weekgrid .heat-cell')
  assert.match(yearCell, /aspect-ratio:\s*1/, '缩放后仍保持正方形')
  assert.match(declarationsFor(css, '.heat-months.is-grid'), /display:\s*grid/, '月份刻度与缩放后的周列严格对齐')
  assert.match(declarationsFor(css, '.cs-share-text'), /font-size:\s*11px/, '明细任务占比文字降一档')
  assert.match(declarationsFor(css, '.cs-share-track'), /max-width:\s*68px/, '明细任务占比进度条收短')
  assert.match(declarationsFor(css, '.cs-share-track'), /height:\s*3px/, '明细任务占比进度条变细')
  const focusInStart = css.indexOf('@keyframes cs-focus-in')
  assert.ok(focusInStart >= 0, '首屏入场动画存在')
  assert.doesNotMatch(css.slice(focusInStart, css.indexOf('.cs-focus-panel', focusInStart)), /transform/, '首屏入场只动 opacity，避免 fixed 浮层被包含块裁切')
})

test('客户端：概览把范围值与切换回调透传给每日热力图', async () => {
  const { renderOverviewView, Select } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日活跃', yearHeatTitle: '全年每日活跃',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', monthBars: '月度活跃', periodDay: '日', onlineLabel: '在线时长',
    activeLabel: '活跃', taskLabel: '任务', noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
    heatmapLoading: '正在加载每日活跃…', heatmapEmpty: '暂无每日记录',
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
  const monthRow = allOf(card, byClass('heat-months'))[0]
  assert.match(monthRow.props.className, /is-grid/, '全年月份刻度随缩放后的周网格走等比列')
  const monthLabels = allOf(monthRow, (node) => node.type === 'span')
  assert.equal(monthLabels.length, 12, '全年仍有 12 个月份标签')
  assert.ok(monthLabels.every((node) => node.props.style.gridColumnStart >= 1), '月份标签按网格列定位')
  const picker = allOf(card, (node) => node.type === Select)[0]
  assert.ok(picker, '概览里的热力图复用统一选择器')
  assert.ok(picker.props.options.some((option) => option.value === 11), '概览里的选择器有 11 月选项')
  picker.props.onChange(11)
  assert.deepEqual(picked, [11], '切换范围回调从概览透传到页面状态')
})

test('客户端：英文界面仍显示英文月份/星期与 3 months/6 months/Year', async () => {
  const { renderDailyHeatmap, heatRangeLabel, Select, React } = await loadClientFunctions()
  const en = {
    heatmapTitle: 'Daily time',
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
  assert.match(rangeTrigger, /width:\s*78px/, '范围触发器收窄到 78px')
  assert.match(rangeTrigger, /min-width:\s*78px/, '范围触发器最小宽度 78px')
  assert.match(rangeTrigger, /max-width:\s*78px/, '范围触发器最大宽度 78px')
  assert.match(rangeTrigger, /min-height:\s*28px/, '范围触发器最小高度 28px')
  assert.match(rangeTrigger, /padding:\s*4px 7px/, '范围触发器内边距 4px 7px')
  assert.match(declarationsFor(css, '.cs-overview-grid > .cs-heatmap-card'), /grid-column:\s*1\s*\/\s*-1/, '全年热力图跨满整行')
  assert.match(declarationsFor(css, '.cs-overview-bottom.is-year'), /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.5fr\)/, '全年模式给最近会话留出更多空间')
  // 品牌图标与名称回到左对齐；顶栏右侧拆成两个 group 加一条分隔线，配色改成单枚循环图标按钮。
  assert.match(declarationsFor(css, '.cs-topbar'), /justify-content:\s*space-between/, '品牌与右侧控制分列两端，品牌左对齐')
  assert.doesNotMatch(css, /\.cs-brand\s*\{[^}]*justify-self:\s*center/, '品牌不再居中')
  assert.doesNotMatch(css, /\.cs-sub\s*\{/, '标题下方的 DSH 时长统计副标题已移除')
  assert.match(css, /\.cs-live\.is-live\.is-active \.cs-dot::before,[^{]*\{[^}]*animation:\s*cs-status-dot-pulse/, '顶栏活跃状态点复用向外扩散效果')
  assert.match(css, /\.cs-live\.is-live\.is-task \.cs-dot::before\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--cs-task\) 58%, transparent\)/, '顶栏任务态扩散环使用紫色')
  assert.match(declarationsFor(css, '.cs-topbar-group'), /display:\s*inline-flex/, '顶栏右侧两个 cs-topbar-group')
  assert.match(declarationsFor(css, '.cs-topbar-divider'), /width:\s*1px/, '顶栏两组之间有 1px 分隔线')
  assert.match(css, /\.cs-icon-toggle\s*\{/, '配色与外观共用单枚循环图标按钮样式')
  assert.doesNotMatch(css, /\.cs-period-display/, '顶栏不再保留当前周期圆角徽标样式')
  assert.doesNotMatch(css, /\.cs-palette-label/, '顶栏不再有配色下拉的标签')
  assert.doesNotMatch(css, /\.cs-palette-name/, '取消常显配色名，名称与循环顺序收进 tooltip')
  assert.match(css, /\.cs-palette-toggle svg \.cs-palette-signal/, '循环图标用当前套信号色圆点表当前值')
  assert.match(css, /\.cs-palette-toggle svg \.cs-palette-ring/, '循环图标外围是白色圆环')
  assert.match(css, /\.cs-palette-ring[^}]*stroke:\s*#fff/, '白色圆环不随配色变化')
  assert.doesNotMatch(css, /\.cs-palette-dot/, '不再用三枚小色点编码当前套')
})


test('客户端：会话筛选和排序不修改快照，累计摘要只统计当前结果', async () => {
  const { selectDetailsWorkspaces, summarizeDetailSessions, selectedDetailSession } = await loadClientFunctions()
  const workspaces = [
    { key: 'main', workspaceTitle: '主工作区', sessions: [
      { sessionId: 'one', sessionTitle: '查日志', activeMs: 20, taskMs: 90, taskCount: 2, lastActivityAt: 100, taskRunning: false },
      { sessionId: 'two', sessionTitle: '修设置', activeMs: 50, taskMs: 10, taskCount: 1, lastActivityAt: 200, taskRunning: true },
    ] },
    { key: 'lab', workspaceTitle: '实验区', sessions: [
      { sessionId: 'one', sessionTitle: '另一条日志', activeMs: 30, taskMs: 40, taskCount: 3, lastActivityAt: 300, taskRunning: false },
    ] },
  ]
  const original = JSON.stringify(workspaces)
  const taskSorted = selectDetailsWorkspaces(workspaces, '', 'all', 'task')
  assert.equal(taskSorted[0].sessions[0].sessionId, 'one')
  assert.equal(selectDetailsWorkspaces(workspaces, '', 'all', 'recent')[0].sessions[0].sessionId, 'two')
  const running = selectDetailsWorkspaces(workspaces, '', 'running', 'active')
  assert.equal(running.length, 1)
  assert.equal(running[0].sessions[0].sessionId, 'two')
  assert.deepEqual(JSON.parse(JSON.stringify(summarizeDetailSessions(running))), { sessionCount: 1, activeMs: 50, taskMs: 10, taskCount: 1, runningCount: 1 })
  assert.equal(selectDetailsWorkspaces(workspaces, '主工作区')[0].sessions.length, 2)
  assert.equal(selectDetailsWorkspaces(workspaces, '不存在').length, 0)
  assert.equal(JSON.stringify(workspaces), original)
  assert.equal(selectedDetailSession(taskSorted, { workspaceKey: 'lab', sessionId: 'one' }).sessionTitle, '另一条日志')
  assert.equal(selectedDetailSession(running, { workspaceKey: 'main', sessionId: 'one' }), null, '隐藏选择不暗中替换成另一会话')
  assert.equal(selectedDetailSession([], null), null)
})

test('客户端：列表只切换统计，右侧打开会话，收起一组保留其余展开状态', async () => {
  const { renderDetailsView, translate } = await loadClientFunctions()
  const selected = [], opened = [], toggled = []
  const session = { sessionId: 'real-one', hasSessionId: true, sessionTitle: '真实会话', activeMs: 60_000, taskMs: 120_000, taskCount: 1, modelMs: 60_000, toolMs: 30_000, waitMs: 0, otherMs: 0, lastActivityAt: 10 }
  const data = { workspaces: [{ key: 'one', workspaceTitle: '工作区一', sessions: [session] }, { key: 'two', workspaceTitle: '工作区二', sessions: [{ ...session, sessionId: 'real-two' }] }], range: { from: 1, to: 100 } }
  const tree = renderDetailsView({ data, t: translate, isZh: true, expanded: {}, durationFormat: 'short', onSelectSession: value => selected.push(value), onOpenSession: value => opened.push(value), onToggleRow: (...args) => toggled.push(args) })
  const inspect = allOf(tree, byClass('cs-session-inspect'))[0]
  let stopped = 0
  inspect.props.onClick({ stopPropagation() { stopped++ } })
  assert.equal(selected[0].workspaceKey, 'one')
  assert.equal(opened.length, 0)
  const row = allOf(tree, byClass('cs-session'))[0]
  assert.equal(allOf(row, byClass('cs-session-title'))[0].props.onClick, undefined)
  row.props.onClick()
  assert.equal(selected.length, 2, '标题点击冒泡到行后仍只切换统计')
  assert.equal(opened.length, 0)
  allOf(tree, byClass('cs-inspector-open'))[0].props.onClick()
  assert.equal(opened[0].sessionId, 'real-one')
  assert.equal(opened[0].workspaceKey, 'one', '宿主失败回退时保留所属工作区')
  assert.equal(stopped, 1)
  allOf(tree, byClass('cs-workspace-head'))[0].props.onClick()
  assert.equal(toggled[0][2].two, true)
  assert.match(textOf(allOf(tree, byClass('cs-session-inspector'))[0]), /未拆分/, '已知构成与历史未拆分时长同时可见')
})

test('客户端：会话范围加载和失败状态不会展示上一范围的记录', async () => {
  const { renderDetailsView, translate } = await loadClientFunctions()
  const base = { data: { workspaces: [{ key: 'old', sessions: [{ sessionId: 'old', sessionTitle: '上一范围的会话', taskRunning: true }] }] }, t: translate }
  let retried = false
  for (const status of ['loading', 'error']) {
    const tree = renderDetailsView({ ...base, loadStatus: status, onRetry() { retried = true } })
    assert.doesNotMatch(textOf(tree), /上一范围的会话/)
    assert.equal(allOf(tree, byClass('cs-record-columns')).length, 0)
    const filter = allOf(tree, byClass('cs-details-filter'))[0]
    assert.equal(textOf(allOf(filter, (node) => node.type === 'button')[1]), translate('detailsRunning'))
    if (status === 'error') allOf(tree, node => node.type === 'button' && textOf(node) === translate('settingsRetry'))[0].props.onClick()
  }
  assert.equal(retried, true)
  const ready = renderDetailsView(base)
  const filter = allOf(ready, byClass('cs-details-filter'))[0]
  assert.equal(textOf(allOf(filter, (node) => node.type === 'button')[1]), `${translate('detailsRunning')} 1`)
})

test('客户端：切换会话范围的首帧和请求失败时清除旧快照', async (testContext) => {
  const { React, useDashboard } = await loadClientFunctions()
  const requests = []
  const connection = { rpc: { call(_path, _name, { payload }) {
    return new Promise((resolve) => requests.push({ payload, resolve }))
  } } }
  const ctx = { get: () => connection }
  const first = { from: 0 }
  const second = { from: 0, to: 3600000 }
  const render = (range, enabled = true) => React.render(() =>
    useDashboard(ctx, 'day', 60000, 0, { view: 'details', range, enabled }))
  testContext.after(() => { render(first, false); React.flushEffects() })

  render(first)
  React.flushEffects()
  requests[0].resolve({ ok: true, value: {} })
  await new Promise(setImmediate)
  assert.equal(render(first).status, 'ready')

  const switching = render(second)
  assert.equal(switching.status, 'loading')
  assert.equal(switching.data, null)
  React.flushEffects()
  assert.equal(requests[1].payload.to, second.to)
  requests[1].resolve({ ok: false })
  await new Promise(setImmediate)
  const failed = render(second)
  assert.equal(failed.status, 'error')
  assert.equal(failed.data, null)
})

test('客户端：趋势峰值跳转带完整边界，小时范围和整日范围显示准确', async () => {
  const { renderTrendView, translate, formatSelectedRange } = await loadClientFunctions()
  const from = new Date(2026, 10, 13, 14).getTime(), to = from + 3600000
  const ranges = []
  const tree = renderTrendView({ data: { period: 'day', trend: [{ key: 'peak', from, to, activeMs: 120000, taskMs: 60000 }] }, t: translate, isZh: true, period: 'day', durationFormat: 'short', onOpenRange: range => ranges.push(range) })
  allOf(tree, byClass('cs-peak-sessions'))[0].props.onClick()
  assert.equal(ranges[0].from, from)
  assert.equal(ranges[0].to, to)
  assert.match(formatSelectedRange({ from, to }, translate, true), /14:00 – 15:00/)
  const midnight = new Date(2026, 10, 13).getTime()
  const wholeDay = formatSelectedRange({ from: midnight, to: midnight + 86400000 }, translate, true)
  assert.match(wholeDay, /11月13日/)
  assert.doesNotMatch(wholeDay, /14日/)
  assert.match(formatSelectedRange({ from: midnight, to: midnight + 30_000 }, translate, true), /00:00 – 00:00/)
})

test('客户端：导入反馈汇总 Host 分开的区间与任务数量', async () => {
  const { importResultText, translate } = await loadClientFunctions()
  assert.match(importResultText({ imported: { intervals: 48, tasks: 36 }, skipped: { intervals: 2, tasks: 3 } }, translate), /新增 84 条.*跳过重复 5 条/)
  assert.match(importResultText({ imported: 4, skipped: 1 }, translate), /新增 4 条.*跳过重复 1 条/)
})
