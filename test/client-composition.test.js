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
    `    window.__testFunctions = { renderComposition, renderSessionBreakdown, renderSessionRow, renderWorkspaceRow, normalizeBackfill, normalizeDashboard, approximateNoticeVisible, renderApproximateNotice, localDayCount, averageMsPerDay, overviewHint };\n${anchor}`)
  const React = { createElement: (type, props, ...children) => ({ type, props, children }) }
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
