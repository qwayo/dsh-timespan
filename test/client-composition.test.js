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
async function loadClientFunctions() {
  let source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const anchor = '    const CHRONOSCOPE_CSS = `'
  assert.ok(source.includes(anchor), '客户端测试入口不存在')
  source = source.replace(anchor,
    `    window.__testFunctions = {
      renderComposition, renderSessionBreakdown, renderSessionRow, renderWorkspaceRow,
      normalizeBackfill, normalizeDashboard, approximateNoticeVisible, renderApproximateNotice,
      localDayCount, averageMsPerDay, overviewHint, clampTipPosition, renderHoverTip,
      buildTrendTip, buildCompositionTip, renderTrendChart, HoverTip, useHoverTip,
      Select, isSelectOutside, createSelectOutsideHandler,
      renderWorkspaceRanking, Info, renderInfo,
      overviewInfoMessages: typeof overviewInfoMessages === 'function' ? overviewInfoMessages : undefined,
      footerInfoMessages: typeof footerInfoMessages === 'function' ? footerInfoMessages : undefined,
      normalizePalette: typeof normalizePalette === 'function' ? normalizePalette : undefined,
      normalizeAppearance: typeof normalizeAppearance === 'function' ? normalizeAppearance : undefined,
      cycleAppearance: typeof cycleAppearance === 'function' ? cycleAppearance : undefined,
      resolveAppearance: typeof resolveAppearance === 'function' ? resolveAppearance : undefined,
      chronoscopeCss: typeof chronoscopeCss === 'function' ? chronoscopeCss : undefined,
    };\n${anchor}`)
  const React = createTestReact()
  const window = { __ModuleLoader__: { load: ({ factory }) => factory(() => React) } }
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
