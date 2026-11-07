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
  const fills = findNodes(tree, (node) => node.type === 'rect' && String(node.props.className ?? '').split(/\s+/).includes('cs-bar')).map((node) => node.props.fill)
  assert.ok(fills.includes('var(--cs-live)'), '活跃柱使用 --cs-live')
  assert.ok(fills.includes('var(--cs-task)'), '任务柱使用 --cs-task')
  assert.ok(fills.every((fill) => typeof fill === 'string' && fill.startsWith('var(--cs-')), '图表只使用设计 token 着色')
})

test('客户端：ⓘ 按钮以完整说明作为 aria 名称，浮层含同一说明', async () => {
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
  assert.equal(typeof button.props.onKeyDown, 'function', '键盘可操作')
  assert.equal(typeof button.props.onFocus, 'function', '键盘聚焦可显示说明')

  button.props.onFocus()
  tree = React.render(Info, { message })
  button = buttonOf(tree)
  assert.equal(button.props['aria-expanded'], true, '键盘聚焦显示说明')
  assert.match(findByClass(tree, 'cs-info').props.className, /is-open/)

  button.props.onKeyDown({ key: 'Escape' })
  tree = React.render(Info, { message })
  assert.match(findByClass(tree, 'cs-info').props.className, /is-dismissed/, 'Escape 关闭说明')
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

test('客户端：明细标题保留完整文本并以省略方式呈现', async () => {
  const { renderWorkspaceRow, renderSessionRow } = await loadClientFunctions()
  const labels = {
    unassigned: '未归属', sessionsUnit: '个会话', expand: '展开', collapse: '收起',
    unknownSession: '未命名会话', notBroken: '未拆分',
  }
  const t = (key) => labels[key] ?? key
  const now = new Date(2026, 10, 7, 12, 0, 0).getTime()
  const longWorkspace = '这是一个特别长的工作区名称，长到必须省略而不是把卡片撑破'
  const workspace = renderWorkspaceRow({
    key: 'workspace-1',
    workspaceTitle: longWorkspace,
    activeMs: 3_600_000,
    taskMs: 600_000,
    share: 0.5,
    lastActivityAt: now - 60_000,
    sessions: [],
  }, false, () => {}, t, now, {})
  const workspaceTitle = findAll(workspace, (node) => hasClass(node, 'cs-name-text'))[0]
  assert.ok(workspaceTitle, '工作区标题节点存在')
  assert.equal(workspaceTitle.props.title, longWorkspace, '工作区标题保留悬停可见的完整文本')
  assert.equal(textOf(workspaceTitle), longWorkspace, '工作区标题文本未被截断')

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
  }, t, now, [])
  const sessionTitle = findAll(session, (node) => hasClass(node, 'cs-session-title'))[0]
  assert.ok(sessionTitle, '会话标题节点存在')
  assert.equal(sessionTitle.props.title, longSession, '会话标题保留悬停可见的完整文本')
  assert.equal(textOf(sessionTitle), longSession, '会话标题文本未被截断')
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

test('客户端：侧栏入口隐藏名称后仍保留时长与状态点，悬停/聚焦浮出三项数值', async () => {
  const { renderSidebarEntry } = await loadClientFunctions()
  const labels = {
    title: 'ChronoScope',
    onlineLabel: '在线时长',
    activeLabel: '活跃',
    taskLabel: '任务',
    live: '活跃中',
    idle: '空闲',
    sidebarRingTitle: '今日时长构成',
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

  tree.props.onMouseEnter(fakeEvent())
  assert.equal(shown.length, 1, '悬停触发浮层')
  assert.equal(shown[0].tip.title, '今日时长构成')
  assert.equal(
    JSON.stringify(shown[0].tip.rows.map((row) => [row.label, row.value])),
    JSON.stringify([['在线时长', '4:00:00'], ['活跃', '3:00:00'], ['任务', '1:00:00']]),
    '浮层给出三项具体数值',
  )
  tree.props.onFocus(fakeEvent())
  assert.equal(shown.length, 2, '键盘聚焦同样触发浮层')
  tree.props.onKeyDown({ key: 'Escape' })
  assert.equal(hidden.length, 1, 'Escape 收起浮层')

  const named = renderSidebarEntry({
    stats: { ...stats, activeRunning: false },
    theme: { palette: 'stone', appearance: 'dark' },
    showName: true,
    t,
    hover,
  })
  assert.equal(textOf(findByClass(named, 'chronoscope-nav-name')), 'ChronoScope', '显示名称时使用插件名称')
  assert.doesNotMatch(findByClass(named, 'chronoscope-nav-dot').props.className, /is-live/, '空闲状态点不点亮')
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
  for (const expected of ['数字格式', '外观与配色', '活跃判定阈值', '每周起始', '显示子代理明细', '侧栏显示名称', '通知记录', '导出 JSON', '导出 CSV', '清空全部数据', '保存设置']) {
    assert.match(text, new RegExp(expected), `设置页包含「${expected}」`)
  }
  assert.equal(allOf(tree, byClass('cs-format-opt')).length, 5, '五张数字格式卡片')
  const checkboxes = findAll(tree, (node) => node.type === 'input' && node.props?.type === 'checkbox')
  assert.equal(checkboxes.length, 2, '子代理与侧栏名称两个开关')
  const selectLabels = findAll(tree, (node) => typeof node.props?.ariaLabel === 'string')
    .map((node) => node.props.ariaLabel)
  assert.ok(selectLabels.includes('活跃判定阈值'), '空闲阈值下拉可用')
  assert.ok(selectLabels.includes('每周起始'), '每周起始下拉可用')
  assert.ok(selectLabels.includes('配色'), '配色下拉可用')
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

  const focused = renderOverviewView({ ...common, focus: 'hero' })
  assert.equal(allOf(focused, byClass('cs-hero-focus')).length, 1, '首屏态只留放大页')
  assert.equal(allOf(focused, byClass('cs-cycle')).length, 0, '首屏态不渲染周期卡')
  assert.equal(allOf(focused, byClass('cs-trend-card')).length, 0, '首屏态不渲染趋势卡')
  assert.equal(allOf(focused, byClass('cs-composition')).length, 0, '首屏态不渲染构成卡')
  assert.match(textOf(focused), /3:00:00/, '放大页主数字来自今日活跃')

  const futureFocus = renderOverviewView({ ...common, focus: 'trend' })
  assert.equal(allOf(futureFocus, byClass('cs-cycle')).length, 3, '尚未实现的 trend 首屏不崩溃，回落普通概览')
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