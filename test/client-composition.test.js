import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// 轻量 React 替身：只记录元素树，并为组件测试提供最小的状态/引用 hook 运行环境。
function createTestReact() {
  let cursor = 0
  const hooks = []
  const effects = []
  let nextId = 0
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
    // 绘制时序由真实浏览器逐帧验证；此替身只驱动 hook 状态与清理。
    useLayoutEffect(effect, deps) { this.useEffect(effect, deps) },
    flushEffects() {
      for (const effect of effects.splice(0)) effect()
    },
    unmount() {
      for (const hook of hooks) hook?.cleanup?.()
      hooks.length = 0
      effects.length = 0
      cursor = 0
    },
    useId() {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = 'test-id-' + ++nextId
      return hooks[index]
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
async function loadClientFunctions(windowExtras = {}, globals = {}) {
  let source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const anchor = '    const DSH_TIMESPAN_CSS = `'
  assert.ok(source.includes(anchor), '客户端测试入口不存在')
  source = source.replace(anchor,
    `    window.__testFunctions = {
      renderComposition, renderSessionBreakdown, renderSessionRow, renderWorkspaceRow,
      useSessionBrowser, importResultText, formatSelectedRange,
      openSessionInHost, sessionIsOpenable, recentLimitForRow, heroRingModel, heroMetaItems,
      normalizeBackfill, normalizeDashboard, useDashboard, approximateNoticeVisible,
      buildTopbarNotices, renderTopbarNotices, renderTopbarNoticeChip, DetailGlyph,
      localDayCount, averageMsPerDay, clampTipPosition, renderHoverTip,
      buildTrendTip, buildCompositionTip, renderTrendChart, barOutline, reviewTrendSlotCount, HoverTip, useHoverTip, hoverTipProps,
      renderBackfillNotices, isBackfillUnread,
      Select, isSelectOutside, createSelectOutsideHandler,
      renderWorkspaceRanking, Info, renderInfo, DshTimespanIcon: typeof DshTimespanIcon === 'function' ? DshTimespanIcon : undefined,
      overviewInfoMessages: typeof overviewInfoMessages === 'function' ? overviewInfoMessages : undefined,
      footerInfoMessages: typeof footerInfoMessages === 'function' ? footerInfoMessages : undefined,
      normalizePalette: typeof normalizePalette === 'function' ? normalizePalette : undefined,
      normalizeAppearance: typeof normalizeAppearance === 'function' ? normalizeAppearance : undefined,
      cycleAppearance: typeof cycleAppearance === 'function' ? cycleAppearance : undefined,
      resolveAppearance: typeof resolveAppearance === 'function' ? resolveAppearance : undefined,
      formatDuration: typeof formatDuration === 'function' ? formatDuration : undefined,
      renderDurationDigits: typeof renderDurationDigits === 'function' ? renderDurationDigits : undefined,
      DurationTween: typeof DurationTween === 'function' ? DurationTween : undefined,
      tweenDurationMs: typeof tweenDurationMs === 'function' ? tweenDurationMs : undefined,
      DURATION_TWEEN_MS: typeof DURATION_TWEEN_MS === 'number' ? DURATION_TWEEN_MS : undefined,
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
      createPage, useSettingsEditor, subscribeSettingsChanged, notifySettingsChanged,
      countdownDuration, projectTimer, timerDigits, createTimerClient, TimerPopover, TimerControls, TimerHistory, ClockDial, TimerReadout,
      analysisGenerateGlyph: typeof analysisGenerateGlyph === 'function' ? analysisGenerateGlyph : undefined,
      AnalysisPage, AnalysisReport, TimeToolsSettings, CountdownPresetField,
      AnalysisModelSettings: typeof AnalysisModelSettings === 'function' ? AnalysisModelSettings : undefined,
      FloatingTimerSettings: typeof FloatingTimerSettings === 'function' ? FloatingTimerSettings : undefined,
      registerTimespanCommandUi, createPresenceReporter, CommandNotice, useRunningTask, FloatingTimer, TimerOverlay, floatingRect, floatingEdge, moveFloatingPosition, normalizeFloatingPosition, floatingDockStyle, floatingConversationAnchor,
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
      HERO_METRIC_LEGACY_KEY: typeof HERO_METRIC_LEGACY_KEY === 'string' ? HERO_METRIC_LEGACY_KEY : undefined,
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
      renderMonthBars: typeof renderMonthBars === 'function' ? renderMonthBars : undefined,
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
      ChartReveal: typeof ChartReveal === 'function' ? ChartReveal : undefined,
      TextFade: typeof TextFade === 'function' ? TextFade : undefined,
      trendFocusStats: typeof trendFocusStats === 'function' ? trendFocusStats : undefined,
      renderTrendFocusPage: typeof renderTrendFocusPage === 'function' ? renderTrendFocusPage : undefined,
      TREND_FOCUS_HEIGHT: typeof TREND_FOCUS_HEIGHT === 'number' ? TREND_FOCUS_HEIGHT : undefined,
      SIDEBAR_TIP_DELAY_MS: typeof SIDEBAR_TIP_DELAY_MS === 'number' ? SIDEBAR_TIP_DELAY_MS : undefined,
    };\n${anchor}`)
  const React = createTestReact()
  const window = { __ModuleLoader__: { load: ({ factory }) => factory(() => React) }, ...windowExtras }
  vm.runInNewContext(source, { window, setInterval, clearInterval, crypto: { randomUUID: () => 'test-client' }, ...globals })
  return { ...window.__testFunctions, React }
}

/** 用真实浏览模块和 RPC 信封推动交互；范围响应与定位计时可单独完成。 */
async function createSessionBrowserHarness(testContext, savedExpanded = {}) {
  const requests = []
  const timers = new Map()
  const stored = new Map([['dsh-timespan.expanded', JSON.stringify(savedExpanded)]])
  let nextTimer = 0
  const functions = await loadClientFunctions({
    sessionStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id },
    clearTimeout(id) { timers.delete(id) },
  })
  const connection = { rpc: { call(_path, _channel, { method, payload }) {
    assert.equal(method, 'queryStats')
    return new Promise((resolve) => requests.push({ payload, resolve }))
  } } }
  const ctx = { get: () => connection }
  let options = { period: 'day', enabled: true, refreshMs: 60000, refreshNonce: 0 }
  const render = () => {
    const browser = functions.React.render(() => functions.useSessionBrowser(ctx, options))
    functions.React.flushEffects()
    return browser
  }
  testContext.after(() => functions.React.unmount())
  render()
  return {
    ...functions, requests, timers, stored, render,
    setOptions(next) { options = { ...options, ...next }; return render() },
    view(props = {}) {
      return functions.renderDetailsView({ browser: render(), t: functions.translate, isZh: true,
        durationFormat: 'hms', nowMs: Date.now(), ...props })
    },
    async respond(index, data) {
      // 视图样例的 key 对应 Host 响应中的 workspaceId。
      const value = { ...data, workspaces: data?.workspaces?.map((row) => ({ ...row, workspaceId: row.workspaceId ?? row.key })) }
      requests[index].resolve({ ok: true, value })
      await new Promise(setImmediate)
      return render()
    },
    async ready(data) { return this.respond(requests.length - 1, data) },
    async fail() {
      requests.at(-1).resolve({ ok: false })
      await new Promise(setImmediate)
      return render()
    },
    async refresh(data) {
      this.setOptions({ refreshNonce: options.refreshNonce + 1 })
      return this.ready(data)
    },
  }
}

/** 沿真实 RPC 入口控制响应顺序；计时器只推进保存反馈，不模拟 React 或宿主调度。 */
async function createSettingsEditorHarness(testContext) {
  const requests = []
  const timers = new Map()
  const stored = new Map([['dsh-timespan.palette', 'cyan'], ['dsh-timespan.appearance', 'dark']])
  let nextTimer = 0
  const functions = await loadClientFunctions({
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id },
    clearTimeout(id) { timers.delete(id) },
    localStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) },
  })
  const connection = { rpc: { call(_path, _channel, { method, payload }) {
    return new Promise((resolve) => requests.push({
      method, payload,
      succeed: (value) => resolve({ ok: true, value }),
      fail: () => resolve({ ok: false, error: { message: '隔离的 RPC 失败' } }),
    }))
  } } }
  const ctx = { get: () => connection }
  const previews = []
  const themes = []
  let changes = 0
  let enabled = true
  const stopPreview = functions.subscribeDurationFormatPreview((value) => previews.push(value))
  const stopChanges = functions.subscribeSettingsChanged(() => { changes++ })
  const render = () => {
    const result = functions.React.render(() => functions.useSettingsEditor(ctx, enabled, (saved) => themes.push(saved)))
    functions.React.flushEffects()
    return result
  }
  testContext.after(() => { functions.React.unmount(); stopPreview(); stopChanges() })
  render()
  return {
    ...functions, requests, timers, stored, previews, themes, render,
    changes: () => changes,
    setEnabled(value) { enabled = value; return render() },
    async ready(value = { language: 'zh', durationFormat: 'short', sidebarDotPosition: 'inline' }) {
      requests[0].succeed(value)
      await new Promise(setImmediate)
      return render()
    },
  }
}

test('客户端设置编辑：读取失败时禁止写入，重试只使用 Host 返回的设置', async (t) => {
  const harness = await createSettingsEditorHarness(t)
  harness.requests[0].fail()
  await new Promise(setImmediate)
  const failed = harness.render()
  assert.equal(failed.phase, 'load-error')
  assert.equal(failed.draft, null)
  assert.equal(failed.busy, true)
  assert.equal(await failed.patch('language', 'en'), false)
  failed.requestReset()
  assert.equal(await harness.render().reset(), false)
  assert.equal(harness.requests.length, 1, '读取失败不能用默认值覆盖 Host')

  const reloading = failed.reload()
  harness.requests[1].succeed({ idleThresholdMinutes: 12, language: 'en', durationFormat: 'hms' })
  await reloading
  const ready = harness.render()
  assert.equal(ready.phase, 'ready')
  assert.equal(ready.draft.idleThresholdMinutes, '12')
  assert.equal(ready.draft.durationFormat, 'hms')
  assert.equal(harness.currentLanguage(), 'en')
})

test('客户端设置编辑：预设倒计时需主进程确认，其他设置不能覆盖旧草稿中的预设', async (t) => {
  const harness = await createSettingsEditorHarness(t)
  const editor = await harness.ready({ timerPresetMinutes: 25, timerSound: true })
  const saving = editor.patch('timerPresetMinutes', 40)
  harness.requests[1].succeed({ timerPresetMinutes: 25, timerSound: true })
  assert.equal(await saving, false, '没有收到新值时不能报告保存成功')
  assert.equal(harness.render().draft.timerPresetMinutes, 40, '失败保留输入以便重试')
  assert.deepEqual({ ...harness.requests[1].payload }, { timerPresetMinutes: 40 })
  const retrying = harness.render().retrySave()
  assert.deepEqual({ ...harness.requests[2].payload }, { timerPresetMinutes: 40 })
  harness.requests[2].succeed({ timerPresetMinutes: 40, timerSound: true })
  assert.equal(await retrying, true)
  const sound = harness.render().patch('timerSound', false)
  assert.equal(Object.hasOwn(harness.requests[3].payload, 'timerPresetMinutes'), false, '另一处设置的旧草稿不回写预设')
  harness.requests[3].succeed({ timerPresetMinutes: 50, timerSound: false })
  assert.equal(await sound, true)
  assert.equal(harness.render().draft.timerPresetMinutes, 50)
})

test('客户端设置编辑：默认倒计时合并连续输入并自动保存最后一个有效值', async (t) => {
  const timers = new Map()
  let nextTimer = 0
  const { React, CountdownPresetField, translate } = await loadClientFunctions({
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id },
    clearTimeout(id) { timers.delete(id) },
  })
  t.after(() => React.unmount())
  const patches = []
  let value = 25
  let busy = false
  const render = () => {
    const tree = React.render(CountdownPresetField, { t: translate, value, busy,
      onPatch: async (key, minutes) => { patches.push([key, minutes]); value = minutes; return true },
    })
    React.flushEffects()
    return tree
  }
  const input = () => findAll(render(), (node) => node.type === 'input')[0]
  const change = (text) => input().props.onChange({ currentTarget: { value: text } })
  assert.equal(findAll(render(), (node) => node.type === 'button').length, 0)

  change('4')
  assert.equal(input().props.value, '4')
  const first = nextTimer
  change('45')
  assert.equal(input().props.value, '45')
  assert.equal(timers.has(first), false)
  assert.deepEqual(patches, [])
  busy = true
  assert.equal(input().props.readOnly, true)
  assert.equal(timers.size, 0)
  busy = false
  assert.equal(input().props.value, '45')
  timers.get(nextTimer)()
  await new Promise(setImmediate)
  assert.deepEqual(patches, [['timerPresetMinutes', 45]])

  change('0')
  assert.equal(input().props['aria-invalid'], true)
  assert.equal(timers.size, 0)
  change('60')
  input().props.onBlur({ relatedTarget: { closest: () => null } })
  await new Promise(setImmediate)
  assert.equal(timers.size, 0, '离开表单时立即提交并撤销延时保存')
  assert.deepEqual(patches, [['timerPresetMinutes', 45], ['timerPresetMinutes', 60]])
})

test('客户端设置编辑：自动保存期间互斥，返回值权威且自发刷新保留反馈', async (t) => {
  const harness = await createSettingsEditorHarness(t)
  const editor = await harness.ready()
  const saving = editor.patch('durationFormat', 'sec')
  assert.equal(harness.render().phase, 'saving')
  assert.equal(harness.render().busy, true)
  assert.equal(await editor.patch('language', 'en'), false, '同一帧的旧回调也不能重复保存')
  editor.requestReset()
  assert.equal(harness.render().resetStep, false)
  assert.deepEqual(harness.previews, ['sec'])
  harness.requests[1].succeed({ ...harness.requests[1].payload, durationFormat: 'hms', language: 'en' })
  assert.equal(await saving, true)
  const saved = harness.render()
  assert.equal(saved.draft.durationFormat, 'hms')
  assert.equal(saved.phase, 'saved')
  assert.equal(saved.messageKey, 'savedBadge')
  assert.equal(harness.requests.length, 2, '自己的变更广播不再重复取设置或闪回加载态')
  assert.equal(harness.changes(), 1)
  assert.deepEqual(harness.previews, ['sec', null])
  assert.equal(harness.timers.size, 1)

  const nextSave = saved.patch('language', 'zh')
  assert.equal(harness.timers.size, 0, '下一次保存前清理上一条反馈的计时器')
  harness.requests[2].fail()
  await nextSave
  assert.equal(harness.render().messageKey, 'settingsSaveError')
  assert.equal(harness.timers.size, 0, '旧计时器不能擦掉新的失败提示')
})

test('客户端设置编辑：切换 Provider 与清除原模型原子保存，失败后可重试', async (t) => {
  const harness = await createSettingsEditorHarness(t)
  const editor = await harness.ready({ analysisProvider: 'old-provider', analysisModel: 'old-model', timerSound: false })
  const saving = editor.patch('analysisProvider', 'new-provider')
  assert.equal(harness.requests[1].method, 'setSettings')
  assert.equal(harness.requests[1].payload.analysisProvider, 'new-provider')
  assert.equal(harness.requests[1].payload.analysisModel, '')
  assert.equal(harness.requests[1].payload.timerSound, false)
  assert.equal(await editor.patch('analysisModel', 'old-model'), false)
  harness.requests[1].fail()
  assert.equal(await saving, false)
  assert.equal(harness.render().draft.analysisProvider, 'new-provider')
  const retry = harness.render().retrySave()
  assert.deepEqual(harness.requests[2].payload, harness.requests[1].payload)
  harness.requests[2].succeed(harness.requests[2].payload)
  assert.equal(await retry, true)
  const selectingModel = harness.render().patch('analysisModel', 'new-model')
  assert.equal(harness.requests[3].payload.analysisProvider, 'new-provider')
  assert.equal(harness.requests[3].payload.analysisModel, 'new-model')
  harness.requests[3].succeed(harness.requests[3].payload)
  assert.equal(await selectingModel, true)
  assert.equal(harness.render().draft.timerSound, false)
})

test('客户端设置编辑：格式保存失败撤销全局预览，保留草稿供重试', async (t) => {
  const harness = await createSettingsEditorHarness(t)
  const editor = await harness.ready()
  const saving = editor.patch('durationFormat', 'sec')
  harness.requests[1].fail()
  assert.equal(await saving, false)
  const failed = harness.render()
  assert.equal(failed.phase, 'error')
  assert.equal(failed.draft.durationFormat, 'sec')
  assert.equal(failed.busy, false)
  assert.deepEqual(harness.previews, ['sec', null], '侧栏与仪表盘回到 Host 已保存的格式')
  assert.equal(harness.changes(), 0)
  const retry = failed.patch('durationFormat', 'padded')
  harness.requests[2].succeed(harness.requests[2].payload)
  await retry
  assert.equal(harness.render().draft.durationFormat, 'padded')
  assert.equal(harness.render().phase, 'saved')
})

test('客户端设置编辑：迟到的读取不能覆盖新保存的草稿、语言与反馈', async (t) => {
  const harness = await createSettingsEditorHarness(t)
  const reloading = harness.render().reload()
  harness.requests[1].succeed({ language: 'en', durationFormat: 'short' })
  await reloading
  const saving = harness.render().patch('durationFormat', 'padded')
  harness.requests[2].succeed(harness.requests[2].payload)
  await saving
  harness.requests[0].succeed({ language: 'zh', durationFormat: 'sec' })
  await new Promise(setImmediate)
  const result = harness.render()
  assert.equal(result.draft.durationFormat, 'padded')
  assert.equal(result.phase, 'saved')
  assert.equal(result.messageKey, 'savedBadge')
  assert.equal(harness.currentLanguage(), 'en')
})

test('客户端设置编辑：保存期间的外部变更延后读取，导入后的设置重新生效', async (t) => {
  const harness = await createSettingsEditorHarness(t)
  const editor = await harness.ready()
  const saving = editor.patch('language', 'en')
  harness.notifySettingsChanged()
  assert.equal(harness.requests.length, 2, '写入期间不读取可能过时的设置')
  harness.requests[1].succeed(harness.requests[1].payload)
  await saving
  assert.equal(harness.requests[2].method, 'getSettings')
  assert.equal(harness.render().messageKey, 'savedBadge')
  assert.equal(harness.render().busy, true, '补读期间保留提示，但不能继续编辑旧草稿')
  assert.equal(await harness.render().patch('showSubagents', false), false)
  assert.equal(harness.requests.length, 3, '补读前不允许把旧的每周起始写回 Host')
  harness.requests[2].succeed({ language: 'zh', durationFormat: 'sec', weekStartsOn: 7 })
  await new Promise(setImmediate)
  const refreshed = harness.render()
  assert.equal(refreshed.draft.weekStartsOn, '7')
  assert.equal(refreshed.draft.durationFormat, 'sec')
  assert.equal(harness.currentLanguage(), 'zh')
  assert.equal(refreshed.messageKey, 'savedBadge')
  const nextSave = refreshed.patch('showSubagents', false)
  assert.equal(harness.requests[3].payload.weekStartsOn, 7, '后续编辑必须基于刚读回的导入设置')
  harness.requests[3].succeed(harness.requests[3].payload)
  await nextSave
})

test('客户端设置编辑：确认后恢复默认，兼容旧 Host 并统一重置浏览器外观', async (t) => {
  const harness = await createSettingsEditorHarness(t)
  const editor = await harness.ready({ language: 'en', durationFormat: 'sec' })
  assert.equal(await editor.reset(), false, '没有确认步骤不能直接重置')
  editor.requestReset()
  const resetting = harness.render().reset()
  assert.equal(harness.render().busy, true)
  assert.equal(harness.render().resetting, true)
  harness.requests[1].succeed({ language: 'zh', durationFormat: 'short', sidebarDotPosition: 'end' })
  await new Promise(setImmediate)
  assert.equal(harness.requests[2].method, 'setSettings')
  assert.equal(JSON.stringify(harness.requests[2].payload), JSON.stringify({ sidebarDotPosition: 'inline' }))
  harness.requests[2].succeed({ language: 'zh', durationFormat: 'short', sidebarDotPosition: 'inline' })
  assert.equal(await resetting, true)
  const result = harness.render()
  assert.equal(result.resetStep, false)
  assert.equal(result.resetting, false)
  assert.equal(result.messageKey, 'settingsResetDone')
  assert.equal(result.draft.sidebarDotPosition, 'inline')
  assert.equal(harness.stored.get('dsh-timespan.palette'), 'blue')
  assert.equal(harness.stored.get('dsh-timespan.appearance'), 'system')
  assert.deepEqual(harness.themes, [true])
  assert.equal(harness.changes(), 1)
  assert.equal([...harness.timers.values()][0].delay, 1800)
  harness.React.unmount()
  assert.equal(harness.timers.size, 0, '卸载时清理保存反馈计时器')
})

test('客户端设置编辑：重置失败保留确认步骤与外观，允许取消', async (t) => {
  const harness = await createSettingsEditorHarness(t)
  const editor = await harness.ready()
  editor.requestReset()
  const resetting = harness.render().reset()
  harness.requests[1].fail()
  await resetting
  const result = harness.render()
  assert.equal(result.phase, 'error')
  assert.equal(result.messageKey, 'settingsResetError')
  assert.equal(result.resetStep, true)
  assert.equal(result.resetting, false)
  assert.equal(harness.stored.get('dsh-timespan.palette'), 'cyan')
  assert.deepEqual(harness.themes, [])
  result.cancelReset()
  assert.equal(harness.render().resetStep, false)
})

test('客户端设置编辑：离开后写入仍广播，重新进入时读取权威值且卸载后不再订阅', async (t) => {
  const harness = await createSettingsEditorHarness(t)
  const editor = await harness.ready()
  const saving = editor.patch('durationFormat', 'sec')
  harness.setEnabled(false)
  assert.deepEqual(harness.previews, ['sec', null])
  harness.setEnabled(true)
  harness.requests[1].succeed(harness.requests[1].payload)
  await saving
  assert.equal(harness.changes(), 1, '离开页面不能吞掉已完成写入的变更通知')
  assert.equal(harness.timers.size, 0, '旧生命周期的成功不能留下反馈计时器')
  assert.equal(harness.requests[2].method, 'getSettings')
  harness.requests[2].succeed({ language: 'en', durationFormat: 'sec' })
  await new Promise(setImmediate)
  assert.equal(harness.render().phase, 'ready')
  assert.equal(harness.render().draft.durationFormat, 'sec')
  harness.React.unmount()
  const count = harness.requests.length
  harness.notifySettingsChanged()
  assert.equal(harness.requests.length, count)
})

test('客户端设置入口：宿主面板与仪表盘共用保存、重置流程，导入后表单同步', async (t) => {
  for (const entrance of ['宿主面板', '仪表盘']) {
    await t.test(entrance, async (testContext) => {
      const stored = new Map([['dsh-timespan.palette', 'cyan'], ['dsh-timespan.appearance', 'dark']])
      const session = new Map([['dsh-timespan.view', 'settings']])
      const storage = (values) => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) })
      const functions = await loadClientFunctions({
        setTimeout, clearTimeout,
        localStorage: storage(stored), sessionStorage: storage(session),
        matchMedia: (query) => ({ matches: query === '(prefers-color-scheme: dark)' || query === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} }),
      }, { FileReader: class {
        readAsText(file) { this.result = file.content; this.onload() }
      } })
      const { React, translate, Select } = functions
      testContext.after(() => React.unmount())
      let settings = { language: 'zh', durationFormat: 'short', sidebarDotPosition: 'inline' }
      const pending = []
      let deferReset = false
      const connection = { rpc: { async call(_path, _channel, { method, payload }) {
        if (method === 'setSettings' && Object.keys(payload).length > 1) {
          return new Promise((resolve) => pending.push(() => {
            settings = { ...settings, ...payload }
            resolve({ ok: true, value: { ...settings } })
          }))
        }
        if (method === 'resetSettings') {
          const reset = () => { settings = { language: 'zh', durationFormat: 'short', sidebarDotPosition: 'inline' }; return { ok: true, value: settings } }
          if (deferReset) return new Promise((resolve) => pending.push(() => resolve(reset())))
          return reset()
        }
        if (method === 'importData' && payload.restoreSettings) settings = { ...settings, ...payload.settings }
        if (method === 'setSettings') settings = { ...settings, ...payload }
        if (method === 'getSettings' || method === 'setSettings' || method === 'resetSettings') return { ok: true, value: { ...settings } }
        if (method === 'queryStats') return { ok: true, value: { ...settings, period: 'day' } }
        if (method === 'getBackfillStatus') return { ok: true, value: { status: 'done' } }
        if (method === 'importData') return { ok: true, value: { imported: { intervals: 0, tasks: 0 }, skipped: { intervals: 0, tasks: 0 } } }
        throw new Error(`未预期的测试调用：${method}`)
      } } }
      const ctx = { get: () => connection }
      const Entry = entrance === '仪表盘' ? functions.createPage(ctx) : functions.createSettingsSection(ctx)
      const render = () => {
        const tree = React.render(Entry, { t: translate })
        React.flushEffects()
        return tree
      }
      const settle = async () => {
        for (let i = 0; i < 3; i++) { render(); await new Promise(setImmediate) }
        return render()
      }
      const languageControl = (tree) => findAll(tree, (node) => node.type === Select && node.props.ariaLabel === translate('settingsLanguageLabel'))[0]
      const button = (tree, label) => findAll(tree, (node) => node.type === 'button' && textOf(node).trim() === translate(label))[0]
      let tree = await settle()
      assert.equal(languageControl(tree).props.disabled, false)
      languageControl(tree).props.onChange('en')
      tree = render()
      assert.equal(languageControl(tree).props.disabled, true, '两个入口在保存期间都禁用表单')
      assert.equal(button(tree, 'settingsResetButton').props.disabled, true)
      pending.shift()()
      tree = await settle()
      assert.equal(languageControl(tree).props.value, 'en')
      assert.equal(textOf(findAll(tree, (node) => hasClass(node, 'cs-settings-status'))), translate('savedBadge'))

      button(tree, 'settingsResetButton').props.onClick()
      tree = render()
      assert.ok(button(tree, 'settingsResetConfirm'))
      await button(tree, 'settingsResetConfirm').props.onClick()
      tree = await settle()
      assert.equal(languageControl(tree).props.value, 'zh')
      assert.equal(textOf(findAll(tree, (node) => hasClass(node, 'cs-settings-status'))), translate('settingsResetDone'))
      assert.equal(stored.get('dsh-timespan.palette'), 'blue')
      assert.equal(stored.get('dsh-timespan.appearance'), 'system')

      if (entrance === '仪表盘') {
        assert.ok(hasClass(tree, 'cs-palette-blue'))
        assert.ok(hasClass(tree, 'cs-appearance-dark'), '恢复为跟随系统后采用系统深色外观')
        const input = findAll(tree, (node) => node.type === 'input' && node.props.type === 'file')[0]
        input.props.onChange({ target: { files: [{ name: '备份.json', content: JSON.stringify({
          format: 'dsh-timespan-export', version: 1, intervals: [], tasks: [],
          settings: { language: 'en', durationFormat: 'sec' },
        }) }] } })
        tree = render()
        const preview = findAll(tree, (node) => hasClass(node, 'cs-import-preview'))[0]
        findAll(preview, (node) => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } })
        tree = render()
        await button(tree, 'importConfirm').props.onClick()
        tree = await settle()
        assert.equal(languageControl(tree).props.value, 'en', '恢复备份中的设置后，当前编辑入口重新读取 Host')
        const selectedFormat = findAll(tree, (node) => hasClass(node, 'cs-format-opt') && node.props['aria-checked'] === true)[0]
        assert.match(textOf(selectedFormat), /10096/)
        assert.equal(settings.approximateNoticeDismissed, false)

        button(tree, 'paletteCyan').props.onClick()
        findAll(tree, (node) => hasClass(node, 'cs-appearance-opt-light'))[0].props.onClick()
        tree = render()
        assert.ok(hasClass(tree, 'cs-palette-cyan'))
        assert.ok(hasClass(tree, 'cs-appearance-light'))
        button(tree, 'settingsResetButton').props.onClick()
        tree = render()
        deferReset = true
        const resetting = button(tree, 'settingsResetConfirm').props.onClick()
        findAll(tree, (node) => node.type === functions.TabNav)[0].props.onChange('trend')
        render()
        pending.shift()()
        await resetting
        tree = await settle()
        assert.equal(findAll(tree, (node) => hasClass(node, 'cs-view'))[0].props['data-view'], 'trend')
        assert.ok(hasClass(tree, 'cs-palette-blue'), '离开设置页后完成的重置仍更新仪表盘配色')
        assert.ok(hasClass(tree, 'cs-appearance-dark'), '离开设置页后完成的重置仍恢复跟随系统')
      }
    })
  }
})

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
  // 函数组件的文案有时只放在 props.text（如 TextFade），渲染树未展开时也要读到。
  const ownText = typeof node.type === 'function' && typeof node.props?.text === 'string' ? node.props.text : ''
  const childText = textOf(node.children)
  return [ownText, childText].filter(Boolean).join(' ')
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
  assert.ok(end > start, '客户端样式结束标记不存在')
  return source.slice(start, end)
}

async function loadAnalysisCss() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('const CS_ANALYSIS_CSS = `')
  assert.ok(start >= 0, '回顾样式入口不存在')
  const end = source.indexOf('\n    `', start)
  assert.ok(end > start, '回顾样式结束标记不存在')
  return source.slice(start, end)
}

async function loadClientTimerCss() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('const CS_TIMER_CSS = `')
  assert.ok(start >= 0, '计时样式入口不存在')
  const end = source.indexOf('\n    `', start)
  assert.ok(end > start, '计时样式结束标记不存在')
  return source.slice(start, end)
}

/** 汇总同一选择器在样式表中的全部声明，避免被后写的覆盖块漏检。 */
function declarationsFor(css, selector) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g')
  return [...css.matchAll(pattern)].map((match) => match[1]).join('\n')
}

function scriptedClientRpc() {
  const requests = []
  const connection = { rpc: { call(_path, _channel, { method, payload }) {
    return new Promise((resolve) => requests.push({ method, payload,
      success: (value) => resolve({ ok: true, value }),
      fail: (code) => resolve({ ok: false, error: { code } }),
    }))
  } } }
  return {
    ctx: { get: () => connection }, requests,
    take(method) {
      const request = requests.shift()
      assert.equal(request?.method, method)
      return request
    },
  }
}

function clientTimerView(status, fields = {}) {
  return { status, now: Date.now(), id: null, mode: null, durationMs: null, elapsedMs: 0, remainingMs: null, lastResult: null, notification: null, ...fields }
}

test('客户端 Slash 菜单随计时状态更新，回执覆盖已有消息的会话，回顾只定位发起会话', async () => {
  const { registerTimespanCommandUi, translate } = await loadClientFunctions()
  const host = scriptedClientRpc()
  const navigation = { pending: null, revision: 0 }
  let menu
  let executed
  let blank = true
  const opened = []
  const submissions = []
  const feedback = []
  const ctx = {
    ...host.ctx,
    commandUi: { decorate(value) { menu = value } },
    effect(fn) { fn() },
    on(name, fn) { assert.equal(name, 'command/executed'); executed = fn },
    sessions: { binding() { return { session: { getSnapshot: () => ({ blank }) } } } },
    layout: { selectPanel(panel) { opened.push(panel) } },
    remote: { commands: { async execute(sessionId, line) {
      submissions.push({ sessionId, line })
      return { ok: true, value: { result: { kind: 'success', text: '计时反馈' } } }
    } } },
  }
  let synchronized = 0
  let prepared = 0
  registerTimespanCommandUi(ctx, { prepareSound() { prepared += 1 }, refreshAfterCommand() { synchronized += 1 } }, navigation, translate, (reply) => feedback.push(reply))
  const session = { sessionId: 'suite-session' }
  const options = menu.ui.options(session, new AbortController().signal)
  host.take('getTimer').success(clientTimerView('paused'))
  const rows = Array.from(await options, (row) => row.id)
  assert.deepEqual(rows, ['stats session', 'stats today', 'timer resume', 'timer stop', 'review'])
  await menu.ui.onSelect({ id: 'timer stop' }, session)
  assert.deepEqual(submissions, [{ sessionId: 'suite-session', line: '/timespan timer stop' }])
  assert.equal(synchronized, 1)
  assert.deepEqual({ ...feedback[0] }, { sessionId: 'suite-session', text: '计时反馈', autoDismiss: true })

  executed('suite-session', 'timespan', { kind: 'success', text: '本会话\n暂无时长记录' })
  executed('suite-session', 'timespan', { kind: 'error', text: '计时状态已变化，请重试。' })
  assert.deepEqual(feedback.map((reply) => reply.autoDismiss), [true, false, false])
  assert.deepEqual(opened, [])
  executed('suite-session', 'timespan', { kind: 'success', text: translate('commandReviewResult') })
  assert.deepEqual(opened, ['dsh-timespan'])
  assert.equal(navigation.pending.sessionId, 'suite-session')
  assert.equal(navigation.pending.blank, true)

  blank = false
  const timerResults = ['正计时 · 已用 00:00:00', '正计时 · 已暂停 · 已用 00:00:01', '正计时 · 已用 00:00:01', '已结束 · 已用 00:00:02']
  for (const text of timerResults) executed(session.sessionId, 'timespan', { kind: 'success', text })
  assert.deepEqual(feedback.slice(3).map((reply) => [reply.text, reply.autoDismiss]), timerResults.map((text) => [text, true]))
  await menu.ui.onSelect({ id: 'timer resume' }, session)
  assert.deepEqual({ ...feedback.at(-1) }, { sessionId: 'suite-session', text: '计时反馈', autoDismiss: true })
  executed(session.sessionId, 'timespan', { kind: 'success', text: '本会话\n暂无时长记录' })
  assert.equal(feedback.length, 8)

  for (const [preset, minutes] of [[undefined, 25], [35, 35]]) {
    const idleOptions = menu.ui.options(session, new AbortController().signal)
    host.take('getTimer').success(clientTimerView('idle', { timerPresetMinutes: preset }))
    const countdown = (await idleOptions).find((option) => option.id === `timer ${minutes}m`)
    assert.equal(countdown?.label, `开始 ${minutes} 分钟倒计时`)
    await menu.ui.onSelect(countdown, session)
    assert.equal(submissions.at(-1).line, `/timespan timer ${minutes}m`)
  }
  assert.equal(prepared, 3, '继续和预设倒计时都准备提示音')
})

test('客户端 Slash 回执：成功提示自动关闭，旧回调不会清除新提示', async (t) => {
  const scheduled = new Map()
  let nextId = 0
  const { React, createPresenceReporter } = await loadClientFunctions({
    addEventListener() {}, removeEventListener() {}, setInterval() {}, clearInterval() {},
  }, {
    document: { visibilityState: 'visible', hasFocus: () => true, addEventListener() {}, removeEventListener() {} },
    setTimeout(callback, delay) {
      assert.equal(delay, 4_000)
      scheduled.set(++nextId, callback)
      return nextId
    },
    clearTimeout: (id) => scheduled.delete(id),
  })
  React.useCallback = (callback) => React.useRef(callback).current
  t.after(() => React.unmount())

  const commandFeedback = { publish: null }
  const Reporter = createPresenceReporter({}, {}, commandFeedback)
  const render = (sessionId = 'session') => {
    const result = React.render(Reporter, {
      useSessions: (select) => select({ ids: [sessionId], byId: { [sessionId]: { id: sessionId, retainedBy: { mainView: 1 } } } }),
      usePanelInfo: (select) => select({ activePanelId: null }),
    })
    React.flushEffects()
    return result.props
  }
  const started = { sessionId: 'session', text: '正计时', autoDismiss: true }
  const paused = { ...started, text: '正计时 · 已暂停' }
  render()
  commandFeedback.publish(started)
  assert.equal(render().commandResult, started)
  const oldTimeout = scheduled.get(nextId)
  commandFeedback.publish(paused)
  assert.equal(render().commandResult, paused)
  assert.equal(scheduled.size, 1)
  oldTimeout()
  assert.equal(render().commandResult, paused)
  scheduled.get(nextId)()
  assert.equal(render().commandResult, null)
  assert.equal(scheduled.size, 0)

  commandFeedback.publish(started)
  render().onDismissCommand()
  assert.equal(render().commandResult, null)
  assert.equal(scheduled.size, 0)

  commandFeedback.publish(started)
  assert.equal(render().commandResult, started)
  assert.equal(render('other').commandResult, null)
  assert.equal(scheduled.size, 0)
  const error = { sessionId: 'other', text: '计时操作失败', autoDismiss: false }
  commandFeedback.publish(error)
  commandFeedback.publish(paused)
  assert.equal(render('other').commandResult, error)
  assert.equal(scheduled.size, 0)
  assert.equal(render().commandResult, null)
})

test('客户端 Slash 回执：渐隐后卸载，减少动效时直接关闭', async (t) => {
  let reducedMotion = false
  const animations = []
  const surface = {
    animate(keyframes, { duration }) {
      const animation = {
        opacity: Array.from(keyframes, (frame) => frame.opacity), duration, playState: 'running',
        cancel() { this.playState = 'idle' },
      }
      animations.push(animation)
      return animation
    },
  }
  const { React, CommandNotice, translate } = await loadClientFunctions({
    getComputedStyle: () => ({ opacity: '1' }), matchMedia: () => ({ matches: reducedMotion }),
  })
  t.after(() => React.unmount())
  const render = (result) => {
    const tree = React.render(CommandNotice, { result, t: translate })
    if (tree) tree.props.ref.current = surface
    React.flushEffects()
    return tree
  }
  const result = { text: '正计时 · 已暂停' }
  assert.equal(textOf(render(result)).trim(), result.text)
  animations[0].onfinish()
  const leaving = render(null)
  assert.equal(textOf(leaving).trim(), result.text)
  assert.equal(leaving.props.inert, '')
  assert.equal(leaving.props['aria-hidden'], true)
  const fade = animations.at(-1)
  assert.deepEqual(fade.opacity, [1, 0])
  assert.equal(fade.duration, 120)
  fade.playState = 'finished'
  fade.onfinish()
  assert.equal(render(null), null)

  reducedMotion = true
  assert.ok(render(result))
  assert.equal(render(null), null)
  assert.equal(animations.length, 2)
})

test('客户端悬浮窗：任务显示可信等待状态，手动计时优先且展开仍可见任务', async (t) => {
  const { React, FloatingTimer, DetailGlyph, translate } = await loadClientFunctions({
    innerWidth: 900, innerHeight: 650, addEventListener() {}, removeEventListener() {},
  }, { document: { activeElement: null } })
  t.after(() => React.unmount())
  const receivedAt = Date.now()
  const render = (timer, pendingInteraction) => React.render(FloatingTimer, {
    t: translate, client: {}, snapshot: { timer, receivedAt },
    runningTask: { elapsedMs: 150_000, receivedAt }, pendingInteraction,
  })
  let tree = render(clientTimerView('idle'), 'approval')
  assert.match(textOf(findByClass(tree, 'cs-floating-entry')), /等你确认.*02:30/)

  tree = render(clientTimerView('running', { mode: 'stopwatch', elapsedMs: 5_000 }), 'approval')
  const running = findByClass(tree, 'cs-floating-entry')
  assert.match(textOf(running).trim(), /^\d{2}:\d{2}$/)
  assert.match(running.props['aria-label'], /计时中/)

  const timer = clientTimerView('paused', { mode: 'countdown', remainingMs: 1_115_000 })
  tree = render(timer, 'approval')
  const entry = findByClass(tree, 'cs-floating-entry')
  assert.equal(textOf(entry).trim(), '18:35')
  assert.match(entry.props['aria-label'], /已暂停.*18:35/)
  assert.equal(findAll(entry, (node) => node.type === DetailGlyph)[0]?.props.name, 'resume')
  entry.props.onClick({ detail: 1 })
  tree = render(timer, 'approval')
  assert.match(textOf(findByClass(tree, 'cs-floating-task')), /等你确认.*02:30/)
})

test('客户端悬浮窗：切换会话后丢弃上一个任务的迟到读数', async (t) => {
  const { React, useRunningTask } = await loadClientFunctions()
  const host = scriptedClientRpc()
  t.after(() => React.unmount())
  const render = (id) => {
    const value = React.render(() => useRunningTask(host.ctx, id))
    React.flushEffects()
    return value
  }
  assert.equal(render('previous'), null)
  const previous = host.take('getRunningTask')
  assert.equal(render('current'), null)
  const current = host.take('getRunningTask')
  assert.equal(current.payload.sessionId, 'current')
  previous.success({ elapsedMs: 123_000 })
  await new Promise(setImmediate)
  assert.equal(render('current'), null)
  current.success({ elapsedMs: 4_000 })
  await new Promise(setImmediate)
  assert.equal(render('current')?.elapsedMs, 4_000)
  assert.equal(render(null), null)
})

test('客户端配色：顶栏在四套配色间循环，珊瑚实底和任务紫分别保留', async () => {
  const storage = new Map()
  const { createPage, React, translate, dshTimespanCss, dshTimespanSidebarCss } = await loadClientFunctions({
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  })
  const Page = createPage({})
  const render = () => React.render(Page, { t: translate })
  let tree = render()
  const paletteNames = { stone: '石墨灰', cyan: '松石青', coral: '珊瑚橙', blue: '晴空蓝' }
  for (const palette of ['stone', 'cyan', 'coral', 'blue']) {
    findByClass(tree, 'cs-palette-toggle').props.onClick()
    tree = render()
    assert.ok(hasClass(tree, `cs-palette-${palette}`))
    assert.equal(storage.get('dsh-timespan.palette'), palette)
    const paletteLabel = findByClass(tree, 'cs-palette-toggle').props['aria-label']
    assert.equal(paletteLabel, `配色：${paletteNames[palette]}`, '配色说明只保留当前配色名')
    assert.doesNotMatch(paletteLabel, /→|点击循环/, '不再把所有配色顺序塞进说明')
    assert.equal(findByClass(tree, 'cs-palette-toggle').props.title, undefined, '循环说明改走即时浮层，不再用原生 title')
  }
  const css = dshTimespanCss()
  assert.match(declarationsFor(css, '.cs-page.cs-palette-coral'), /--cs-palette-primary:\s*#FF5B3B/)
  assert.match(declarationsFor(css, '.cs-page.cs-palette-coral'), /--cs-on-selection:\s*var\(--cs-solid-ink\)/)
  assert.doesNotMatch(declarationsFor(css, '.cs-page.cs-appearance-dark.cs-palette-coral'), /--cs-task:/)
  assert.match(declarationsFor(dshTimespanSidebarCss(), '.dsh-timespan-nav-entry.cs-appearance-dark.cs-palette-coral'), /#FF5B3B/)
  assert.match(css, /\.cs-page\.cs-palette-stone:not\(\.cs-appearance-dark\)[\s\S]*?--cs-chart-active:\s*var\(--cs-signal-soft\)/, '浅色石墨活跃柱使用浅石色')
  assert.match(css, /\.cs-page\.cs-palette-cyan:not\(\.cs-appearance-dark\)[\s\S]*?--cs-chart-active:\s*var\(--cs-signal-soft\)/, '浅色青色活跃柱使用浅青色')
  const blueLight = declarationsFor(css, '.cs-page.cs-palette-blue:not(.cs-appearance-dark)')
  assert.match(blueLight, /--cs-series-model:\s*color-mix\(in srgb, var\(--cs-signal-soft\) 50%, var\(--cs-signal\)\)/, '浅色晴空蓝任务构成的模型段取中浅蓝')
  assert.match(css, /\.cs-page\.cs-palette-stone:not\(\.cs-appearance-dark\)[\s\S]*?--cs-series-model:\s*color-mix\(in srgb, var\(--cs-signal-soft\) 50%, var\(--cs-signal\)\)/, '浅色石墨任务构成的模型段取中浅灰')
  assert.match(css, /\.cs-page\.cs-palette-cyan:not\(\.cs-appearance-dark\)[\s\S]*?--cs-series-model:\s*color-mix\(in srgb, var\(--cs-signal-soft\) 50%, var\(--cs-signal\)\)/, '浅色青色任务构成的模型段取中浅青')
  const coralLight = declarationsFor(css, '.cs-page.cs-palette-coral:not(.cs-appearance-dark)')
  assert.match(coralLight, /--cs-series-model:\s*color-mix\(in srgb, var\(--cs-signal-soft\) 50%, var\(--cs-signal-deep\)\)/, '浅色珊瑚任务构成的模型段取中浅暖红')
  assert.match(declarationsFor(css, '.cs-page.cs-appearance-dark.cs-palette-blue'), /--cs-chart-active:\s*#4F9BFF/, '深色晴空蓝活跃项用强蓝，与在线浅蓝拉开')
  const stoneDark = declarationsFor(css, '.cs-page.cs-appearance-dark.cs-palette-stone')
  assert.match(stoneDark, /--cs-signal-deep:\s*#8F9A9E/, '深色石墨在线时长降到中阶灰')
  assert.match(stoneDark, /--cs-chart-active:\s*#E6EDEF/, '深色石墨活跃项取整套配色里最亮的灰阶')
  assert.match(stoneDark, /--cs-heat-5:\s*#D9DEE0/, '深色石墨热力最高档保持原有浅灰，不随在线色变暗')
  assert.match(stoneDark, /--cs-series-model:\s*#D9DEE0/, '深色石墨任务构成的模型色保持浅灰')
  assert.match(declarationsFor(css, '.cs-page.cs-appearance-dark.cs-palette-cyan'), /--cs-chart-active:\s*#22D3EE/, '深色青色活跃项用强青色')
  assert.doesNotMatch(css, /\.cs-palette-clay/, '赤陶配色已从页面样式中移除')
  assert.doesNotMatch(css, /#E07B4B/i, '旧赤陶色值不得残留')
  const paletteIcon = findAll(tree, (node) => String(node.type?.name) === 'PaletteIcon')[0]
  const paletteSvg = paletteIcon.type(paletteIcon.props)
  assert.equal(paletteSvg.children.find((child) => child.props?.className === 'cs-palette-signal').props.fill,
    'var(--cs-chart-active, var(--cs-palette-primary, var(--cs-signal)))', '配色按钮圆点跟随活跃状态点色')
  const sidebarCss = dshTimespanSidebarCss()
  assert.match(sidebarCss, /\.dsh-timespan-nav-entry\.cs-palette-stone\.cs-appearance-light\s*\{\s*--cs-active-dot:\s*#aeb6b9/, '浅色石墨状态点')
  assert.match(sidebarCss, /\.dsh-timespan-nav-entry\.cs-palette-cyan\.cs-appearance-light\s*\{\s*--cs-active-dot:\s*#67E8F9/, '浅色青色状态点')
  assert.match(sidebarCss, /\.dsh-timespan-nav-entry\.cs-appearance-dark\.cs-palette-blue\s*\{\s*--cs-active-dot:\s*#4F9BFF/, '深色晴空蓝状态点')
  assert.match(sidebarCss, /\.dsh-timespan-nav-entry\.cs-appearance-dark\.cs-palette-stone\s*\{[\s\S]*?--cs-active-dot:\s*#E6EDEF/, '深色石墨状态点用最亮灰阶')
  assert.match(sidebarCss, /\.dsh-timespan-nav-entry\.cs-appearance-dark\.cs-palette-cyan\s*\{[\s\S]*?--cs-active-dot:\s*#22D3EE/, '深色青色状态点')
  assert.doesNotMatch(sidebarCss, /\.cs-palette-clay/, '赤陶配色已从侧栏样式中移除')
})

test('客户端计时：使用 Host 快照同步两个入口，运行投影与失败安全重试', async () => {
  let poll, cleared = 0
  const functions = await loadClientFunctions({}, {
    setInterval(callback) { poll = callback; return 1 },
    clearInterval() { cleared += 1 },
    setTimeout() { return 1 }, clearTimeout() {},
  })
  const { countdownDuration, createTimerClient, projectTimer, timerDigits } = functions
  const host = scriptedClientRpc()
  const audio = { unlock: async () => true, play: () => true, close() {} }
  const client = createTimerClient(host.ctx, audio)
  const overlay = [], dashboard = []
  const stopOverlay = client.subscribe((snapshot) => overlay.push(snapshot))
  const stopDashboard = client.subscribe((snapshot) => dashboard.push(snapshot))
  assert.equal(host.requests.length, 1, '两个入口只轮询一次')
  host.take('getTimer').success(clientTimerView('idle'))
  await new Promise(setImmediate)
  assert.equal(overlay.at(-1), dashboard.at(-1))
  assert.equal(countdownDuration('0', '1'), 1000)
  assert.equal(countdownDuration('1', '60'), null)
  assert.equal(countdownDuration('10080', '1'), null)

  void poll()
  const stale = host.take('getTimer')
  const running = clientTimerView('running', { id: 'new', mode: 'countdown', durationMs: 5000, elapsedMs: 500, remainingMs: 4500 })
  const started = client.control({ action: 'start', id: null, mode: 'countdown', durationMs: 5000 })
  assert.equal(client.snapshot().busy, true)
  host.take('controlTimer').success(running)
  await started
  stale.success(clientTimerView('idle'))
  await new Promise(setImmediate)
  assert.equal(overlay.at(-1), dashboard.at(-1))
  assert.equal(client.snapshot().timer, running, '写入前启动的旧轮询不会覆盖运行态')
  const projected = projectTimer(running, 1000, 2260)
  assert.equal(projected.elapsedMs, 1760)
  assert.equal(timerDigits(projected.remainingMs, true), '00:00:04')
  assert.equal(projectTimer(running, 1000, 6500).remainingMs, 0)
  assert.equal(client.snapshot().timer.status, 'running', '本地归零只投影显示')
  const pausing = client.control({ action: 'pause', id: 'new' })
  host.take('controlTimer').fail('stale-timer')
  await pausing
  const reread = host.take('getTimer')
  assert.equal(client.snapshot().actionError, 'timerChanged')
  assert.equal(client.snapshot().timer, running)
  const retry = client.retry()
  const paused = clientTimerView('paused', { ...running, status: 'paused', elapsedMs: 2000, remainingMs: 3000 })
  reread.success(paused)
  await retry
  assert.equal(client.snapshot().actionError, '')
  assert.equal(projectTimer(paused, 1000, 5000).elapsedMs, 2000)
  stopDashboard()
  assert.equal(cleared, 0)
  stopOverlay()
  assert.equal(cleared, 1)
})

test('客户端计时：隐藏页面不认领，到期仅认领一次，未解锁声音明确等待用户播放', async () => {
  const listeners = new Map()
  const document = { visibilityState: 'visible', addEventListener: (event, listener) => listeners.set(event, listener),
    removeEventListener: (event) => listeners.delete(event) }
  let poll, sounds = 0, unlocked = false
  const { createTimerClient } = await loadClientFunctions({}, { document,
    setInterval(callback) { poll = callback; return 1 }, clearInterval() {},
    setTimeout() { return 1 }, clearTimeout() {},
  })
  const host = scriptedClientRpc()
  const client = createTimerClient(host.ctx, {
    unlock: async () => { unlocked = true; return true },
    play: () => { if (!unlocked) return false; sounds += 1; return true }, close() {},
  })
  const unsubscribe = client.subscribe(() => {})
  const finished = clientTimerView('completed', { id: 'c', mode: 'countdown', durationMs: 1000, elapsedMs: 1000,
    remainingMs: 0, lastResult: { id: 'c', reason: 'expired' }, notification: { id: 'c' } })
  document.visibilityState = 'hidden'
  host.take('getTimer').success(finished)
  await new Promise(setImmediate)
  assert.equal(host.requests.length, 0)
  assert.equal(client.snapshot().notice, null)

  document.visibilityState = 'visible'
  listeners.get('visibilitychange')()
  host.take('getTimer').success(finished)
  await new Promise(setImmediate)
  const claim = host.take('claimTimerNotification')
  assert.equal(claim.payload.id, 'c')
  assert.equal(claim.payload.clientId, 'client_test-client')
  claim.success({ claimed: true, sound: true })
  await new Promise(setImmediate)
  assert.equal(client.snapshot().notice.blocked, true)
  assert.equal(sounds, 0)
  await client.playNotice()
  assert.equal(sounds, 1)
  assert.equal(client.snapshot().notice, null)
  const refresh = poll()
  host.take('getTimer').success(finished)
  await refresh
  assert.equal(host.requests.length, 0, '即使收到旧快照也不重复认领')
  unsubscribe()
  assert.equal(listeners.size, 0)
})

test('客户端删除记录使用完成结果 ID，两个入口同步且失败保留原记录', async (t) => {
  const host = scriptedClientRpc()
  const { createTimerClient } = await loadClientFunctions({}, {
    setInterval() { return 1 }, clearInterval() {}, setTimeout() { return 1 }, clearTimeout() {},
  })
  const client = createTimerClient(host.ctx, { unlock: async () => true, play: () => true, close() {} })
  const other = []
  t.after(client.subscribe(() => {}))
  t.after(client.subscribe((state) => other.push(state)))
  const lastResult = { id: 'previous', mode: 'stopwatch', elapsedMs: 1_000 }
  const older = { id: 'older', mode: 'countdown', elapsedMs: 30_000 }
  const running = clientTimerView('running', { id: 'current', mode: 'stopwatch', elapsedMs: 2_000,
    lastResult, history: [lastResult, older] })
  host.take('getTimer').success(running)
  await new Promise(setImmediate)
  const failed = client.control({ action: 'clear-result', id: 'older' })
  const deletion = host.take('controlTimer')
  assert.equal(deletion.payload.id, 'older')
  deletion.fail('storage-error')
  await failed
  assert.deepEqual(client.snapshot().timer.history, [lastResult, older])
  host.take('getTimer').success(running)
  await new Promise(setImmediate)
  const retry = client.control({ action: 'clear-result', id: 'older' })
  host.take('controlTimer').success({ ...running, history: [lastResult] })
  await retry
  assert.equal(client.snapshot().timer.id, 'current')
  assert.equal(client.snapshot().timer.status, 'running')
  assert.equal(client.snapshot().timer.lastResult, lastResult)
  assert.deepEqual(client.snapshot().timer.history, [lastResult])
  assert.equal(other.at(-1), client.snapshot())
})

test('客户端计时：兼容单条结果时明确提示重启，以免把旧快照当成完整历史', async (t) => {
  const { React, TimerControls, TimerHistory, translate } = await loadClientFunctions()
  t.after(() => React.unmount())
  const run = { id: 'legacy', completedAt: Date.now(), mode: 'stopwatch', elapsedMs: 5_000 }
  const snapshot = { timer: clientTimerView('idle', { lastResult: run }), receivedAt: Date.now() }
  const render = () => {
    const panel = React.render(TimerControls, { client: {}, snapshot, at: Date.now(), t: translate })
    const { props } = findAll(panel, (node) => node.type === TimerHistory)[0]
    React.unmount()
    const history = React.render(TimerHistory, props)
    React.unmount()
    return history
  }
  assert.match(textOf(render()), /完整退出并重开 DSH/)
  snapshot.timer = { ...snapshot.timer, history: [run], timerPresetMinutes: 25 }
  assert.doesNotMatch(textOf(render()), /完整退出并重开 DSH/)
  snapshot.timer.history = Array.from({ length: 4 }, (_, index) => ({ ...run, id: `run-${index}` }))
  const tree = render()
  const list = findByClass(tree, 'cs-timer-history-list')
  const movement = []
  list.props.ref.current = { clientHeight: 84, scrollBy: ({ top }) => movement.push(top) }
  const buttons = findAll(findByClass(tree, 'cs-timer-history-scroll'), (node) => node.type === 'button')
  for (const button of buttons) button.props.onClick()
  assert.deepEqual(movement, [-84, 84], '上下两个入口各滚动一组记录')
})

test('客户端计时：快速保存无临时提示行，慢保存沿用状态位置且操作结束清理提示', async (t) => {
  const timers = new Map()
  let nextTimer = 0
  const { React, TimerControls, translate } = await loadClientFunctions({}, {
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id },
    clearTimeout(id) { timers.delete(id) },
  })
  t.after(() => React.unmount())
  const snapshot = { timer: clientTimerView('idle'), receivedAt: 0, busy: false, syncError: false }
  const render = () => { const tree = React.render(TimerControls, { client: {}, snapshot, at: 0, t: translate }); React.flushEffects(); return tree }
  const modeIdentity = findByClass(render(), 'cs-timer-readout').props.identity
  snapshot.busy = true
  let tree = render()
  assert.doesNotMatch(textOf(tree), /正在保存计时状态/)
  assert.equal(findByClass(tree, 'cs-timer-feedback'), undefined)
  assert.ok(findAllByClass(tree, 'cs-timer-button').every((button) => button.props.disabled))
  snapshot.busy = false
  render()
  assert.equal(timers.size, 0, '快速保存完成取消延迟提示')
  snapshot.timer = clientTimerView('running', { mode: 'stopwatch' })
  snapshot.busy = true
  render()
  const [id, timeout] = [...timers][0]
  assert.equal(timeout.delay, 240)
  timers.delete(id); timeout.callback()
  tree = render()
  assert.match(textOf(findByClass(tree, 'cs-timer-state')), /正在保存计时状态/)
  assert.equal(findByClass(tree, 'cs-timer-feedback'), undefined, '慢保存也不插入新行')
  assert.equal(findByClass(tree, 'cs-timer-readout').props.identity, modeIdentity, '开始与暂停等状态不重播数字入场')
  snapshot.busy = false
  render()
  tree = render()
  assert.doesNotMatch(textOf(tree), /正在保存计时状态/)
  assert.match(textOf(findByClass(tree, 'cs-timer-state')), /计时中/)
})

test('客户端计时：正倒计时切换由读数缓动承接，不再整块淡出重播', async () => {
  const { React, TimerControls, TimerReadout, translate } = await loadClientFunctions()
  const snapshot = { timer: clientTimerView('idle'), receivedAt: 0, busy: false, syncError: false }
  const tree = React.render(TimerControls, { client: {}, snapshot, at: 0, t: translate })
  assert.equal(findByClass(tree, 'cs-timer-readout').type, TimerReadout, '读数交给数值缓动组件')
  React.unmount()
  const countdown = React.render(TimerReadout, { identity: 'countdown', value: 1_500_000, roundUp: true, className: 'cs-timer-readout' })
  assert.equal(textOf(countdown).trim(), '00:25:00', '倒计时初始读数显示设定时长')
  React.unmount()
  const stopwatch = React.render(TimerReadout, { identity: 'stopwatch', value: 0, roundUp: false, className: 'cs-timer-readout' })
  assert.equal(textOf(stopwatch).trim(), '00:00:00', '正计时初始读数从零开始')
})

test('客户端计时：读数缺失时保留占位，不把未知值画成零', async () => {
  const { React, TimerReadout } = await loadClientFunctions()
  const tree = React.render(TimerReadout, { identity: 'stopwatch', value: null, className: 'cs-timer-readout' })
  assert.equal(textOf(tree).trim(), '––:––:––')
})

test('客户端悬浮窗：四边判定、越界拖动及窄窗重排都保留可达位置', async () => {
  const { floatingRect, floatingEdge, moveFloatingPosition, normalizeFloatingPosition, floatingDockStyle } = await loadClientFunctions()
  const viewport = { width: 1440, height: 900 }
  const size = { width: 224, height: 300 }
  assert.equal(JSON.stringify(normalizeFloatingPosition({ x: NaN, y: 100 })), JSON.stringify({ x: .97, y: 1 }))
  for (const [position, edge] of [[{ x: 0, y: .5 }, 'left'], [{ x: 1, y: .5 }, 'right'], [{ x: .5, y: 0 }, 'top'], [{ x: .5, y: 1 }, 'bottom']]) {
    const rect = floatingRect(position, size, viewport)
    assert.equal(floatingEdge(rect, viewport), edge)
    const dock = floatingDockStyle(edge, rect, viewport)
    assert.ok(dock.left >= 0 && dock.top >= 0 && dock.left + dock.width <= 1440 && dock.top + dock.height <= 900)
  }
  assert.equal(floatingEdge(floatingRect({ x: .5, y: .5 }, size, viewport), viewport), null)
  const moved = moveFloatingPosition({ x: .5, y: .5 }, size, viewport, 100_000, -100_000)
  assert.equal(JSON.stringify(moved), JSON.stringify({ x: 1, y: 0 }))
  const narrow = floatingRect(moved, size, { width: 180, height: 200 })
  assert.ok(narrow.left >= 0 && narrow.top >= 0 && narrow.left + narrow.width <= 180 && narrow.top + narrow.height <= 200)
})

test('客户端悬浮窗：默认位置贴会话区右上角，左右留同一内边距', async () => {
  const rects = {
    'conversation.header': { left: 100, right: 1000, top: 50, bottom: 80, width: 900, height: 30 },
    'main.conversation': { left: 100, right: 1000, top: 50, bottom: 800, width: 900, height: 750 },
  }
  const { floatingConversationAnchor, floatingRect, moveFloatingPosition } = await loadClientFunctions({ innerWidth: 1200 }, {
    document: {
      querySelectorAll(selector) {
        const name = selector.match(/data-slot="([^"]+)"/)?.[1]
        const rect = rects[name]
        return rect ? [{ firstElementChild: null, getBoundingClientRect: () => rect }] : []
      },
    },
  })
  const anchor = floatingConversationAnchor()
  assert.equal(anchor.right, 988, '右锚点按会话区右边缘减一个安全边距')
  const viewport = { width: 1200, height: 900 }
  const size = { width: 224, height: 220 }
  const position = moveFloatingPosition({ x: 0, y: 0 }, size, viewport,
    anchor.right - size.width - 12, anchor.top - 12)
  const rect = floatingRect(position, size, viewport)
  assert.equal(Math.round(rect.left + rect.width), 988, '默认右边缘与左侧一样留 12px')
})

test('客户端悬浮窗：默认无钟、闲置贴边、靠近恢复，拖动与键盘焦点不会被收起', async (t) => {
  const timers = new Map()
  const stored = new Map([['dsh-timespan.floatingPosition', JSON.stringify({ x: 1, y: .5 })]])
  let nextTimer = 0
  const document = { activeElement: null }
  const { React, FloatingTimer, ClockDial, translate } = await loadClientFunctions({
    innerWidth: 1440, innerHeight: 900, addEventListener() {}, removeEventListener() {},
    localStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) },
  }, { document,
    setTimeout(callback, delay) { assert.equal(delay, 3000); const id = ++nextTimer; timers.set(id, callback); return id },
    clearTimeout(id) { timers.delete(id) },
  })
  t.after(() => React.unmount())
  const snapshot = { timer: clientTimerView('idle'), busy: false, syncError: false, actionError: '', receivedAt: Date.now() }
  const props = { client: {}, snapshot, t: translate }
  const render = () => {
    const tree = React.render(FloatingTimer, props)
    tree.props.ref.current = { contains: () => false }
    findByClass(tree, 'cs-floating-content').props.ref.current = { getBoundingClientRect: () => ({ width: 224, height: 220 }) }
    React.flushEffects()
    return tree
  }
  render()
  let tree = render()
  assert.equal(timers.size, 1)
  ;[...timers.values()][0]()
  tree = render()
  assert.equal(tree.props['data-dock'], 'right')
  tree.props.onPointerEnter({ pointerType: 'mouse' })
  tree = render()
  assert.equal(tree.props['data-dock'], 'none')
  assert.ok(findByClass(tree, 'cs-floating-panel'))
  assert.equal(findAll(tree, (node) => node.type === ClockDial).length, 0, '默认仅显示计时')
  assert.equal(timers.size, 0, '悬浮窗有鼠标时不收起')
  props.showClock = true
  tree = render()
  assert.equal(findAll(tree, (node) => node.type === ClockDial).length, 1)
  tree.props.onPointerLeave()
  tree = render()
  assert.equal(timers.size, 1)
  tree.props.onFocus({ target: { matches: () => true, tagName: 'BUTTON' } })
  tree = render()
  assert.equal(timers.size, 0, '键盘操作时不收起')
  tree.props.onPointerDownCapture({ target: { tagName: 'BUTTON' } })
  tree = render()
  assert.equal(timers.size, 1, '切回鼠标后可恢复闲置贴边')
  tree.props.onKeyDown({ key: ' ' })
  tree = render()
  assert.equal(timers.size, 0, '按钮已被鼠标聚焦后改用键盘，即使没有新 focus 事件也不收起')
  const target = { setPointerCapture() {}, hasPointerCapture: () => false }
  const pointer = { button: 0, pointerId: 1, clientX: 1000, clientY: 300, currentTarget: target, preventDefault() {} }
  findByClass(tree, 'cs-floating-grip').props.onPointerDown(pointer)
  tree = render()
  const startLeft = tree.props.style.left
  findByClass(tree, 'cs-floating-grip').props.onPointerMove({ ...pointer, clientX: 650, clientY: 400 })
  tree = render()
  assert.ok(tree.props.style.left < startLeft)
  assert.equal(timers.size, 0, '拖动中不收起')
  findByClass(tree, 'cs-floating-grip').props.onPointerUp(pointer)
  tree = render()
  assert.ok(JSON.parse(stored.get('dsh-timespan.floatingPosition')).x < 1, '松手保存布局位置')
  findByClass(tree, 'cs-floating-grip').props.onPointerDown(pointer)
  tree = render()
  const originalLeft = tree.props.style.left
  findByClass(tree, 'cs-floating-grip').props.onPointerMove({ ...pointer, clientX: 500 })
  tree = render()
  findByClass(tree, 'cs-floating-grip').props.onPointerCancel(pointer)
  tree = render()
  assert.equal(tree.props.style.left, originalLeft, '取消拖动恢复原位')
  tree.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
  render() // 退出 effect 完成后才卸载面板；替身没有动画 API，直接进入下一次渲染。
  tree = render()
  assert.ok(findByClass(tree, 'cs-floating-entry'))
  assert.equal(findByClass(tree, 'cs-floating-panel'), undefined)
})

test('客户端悬浮窗：其他窗口改时钟设置后聚焦重读，迟到响应和卸载不残留', async (t) => {
  const host = scriptedClientRpc()
  const windowListeners = new Map()
  const documentListeners = new Map()
  const document = { visibilityState: 'visible',
    addEventListener: (name, fn) => documentListeners.set(name, fn),
    removeEventListener: (name) => documentListeners.delete(name),
  }
  const { React, TimerOverlay, FloatingTimer } = await loadClientFunctions({
    addEventListener: (name, fn) => windowListeners.set(name, fn),
    removeEventListener: (name) => windowListeners.delete(name),
  }, { document })
  t.after(() => React.unmount())
  const props = { ctx: host.ctx, conversation: true, client: { snapshot: () => ({ notice: null }), subscribe: () => () => {} } }
  const render = () => { const tree = React.render(TimerOverlay, props); React.flushEffects(); return tree }
  const shown = () => findAll(render(), (node) => node.type === FloatingTimer)[0].props.showClock
  render()
  host.take('getSettings').success({ floatingShowClock: true })
  await new Promise(setImmediate)
  assert.equal(shown(), true)
  windowListeners.get('focus')()
  const older = host.take('getSettings')
  documentListeners.get('visibilitychange')()
  host.take('getSettings').success({ floatingShowClock: false })
  await new Promise(setImmediate)
  older.success({ floatingShowClock: true })
  await new Promise(setImmediate)
  assert.equal(shown(), false, '新的 Host 偏好优先，迟到读取不能恢复旧值')
  React.unmount()
  assert.equal(windowListeners.size, 0)
  assert.equal(documentListeners.size, 0)
})

test('客户端悬浮窗：关闭偏好无首帧闪现，退出失败可重试，迟到读取不能重新打开', async (t) => {
  const host = scriptedClientRpc()
  const listeners = new Map()
  const { React, TimerOverlay, FloatingTimer } = await loadClientFunctions({
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name),
  }, { document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } })
  t.after(() => React.unmount())
  const props = { ctx: host.ctx, conversation: true, client: {
    snapshot: () => ({ notice: { blocked: false } }), subscribe: () => () => {},
    control() { assert.fail('退出浮窗不得控制计时状态') },
  } }
  const render = () => { const tree = React.render(TimerOverlay, props); React.flushEffects(); return tree }
  const floating = (tree) => findAll(tree, (node) => node.type === FloatingTimer)[0]
  assert.equal(floating(render()), undefined, '读取关闭偏好前不闪出浮窗')
  host.take('getSettings').success({ floatingEnabled: false })
  await new Promise(setImmediate)
  assert.equal(floating(render()), undefined)
  assert.ok(findByClass(render(), 'cs-timer-notice'), '隐藏浮窗不隐藏到期提醒')
  listeners.get('focus')()
  host.take('getSettings').success({ floatingEnabled: true, floatingShowClock: true })
  await new Promise(setImmediate)
  assert.equal(floating(render()).props.showClock, true)
  const firstExit = floating(render()).props.onExit()
  const failed = host.take('setSettings')
  assert.deepEqual(JSON.parse(JSON.stringify(failed.payload)), { floatingEnabled: false })
  failed.fail('storage-error')
  await firstExit
  assert.equal(floating(render()).props.exitError, true, '保存失败保留浮窗和重试入口')
  listeners.get('focus')()
  const stale = host.take('getSettings')
  const retry = floating(render()).props.onExit()
  host.take('setSettings').success({ floatingEnabled: false, floatingShowClock: true })
  await retry
  stale.success({ floatingEnabled: true })
  await new Promise(setImmediate)
  assert.equal(floating(render()), undefined, '退出成功后忽略先前读取')
  assert.ok(findByClass(render(), 'cs-timer-notice'))
})

test('客户端悬浮窗：异步退出期间离开并返回会话，完成后读回关闭偏好', async (t) => {
  const host = scriptedClientRpc()
  const { React, TimerOverlay, FloatingTimer } = await loadClientFunctions({
    addEventListener() {}, removeEventListener() {},
  }, { document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } })
  t.after(() => React.unmount())
  const props = { ctx: host.ctx, conversation: true, client: {
    snapshot: () => ({ notice: { blocked: false } }), subscribe: () => () => {},
    control() { assert.fail('关闭显示不得停止计时') },
  } }
  const render = () => { const tree = React.render(TimerOverlay, props); React.flushEffects(); return tree }
  const floating = (tree) => findAll(tree, (node) => node.type === FloatingTimer)[0]
  render()
  host.take('getSettings').success({ floatingEnabled: true })
  await new Promise(setImmediate)
  const exiting = floating(render()).props.onExit()
  const write = host.take('setSettings')
  props.conversation = false
  render()
  props.conversation = true
  render()
  write.success({ floatingEnabled: false })
  await exiting
  host.take('getSettings').success({ floatingEnabled: false })
  await new Promise(setImmediate)
  assert.equal(floating(render()), undefined, '不等待下一次聚焦即可反映已保存的关闭状态')
  assert.ok(findByClass(render(), 'cs-timer-notice'), '关闭不影响到期提醒')
})

test('客户端模型设置：读取原生目录，失效选择保留并可刷新', async (t) => {
  const host = scriptedClientRpc()
  const { React, AnalysisModelSettings, FloatingTimerSettings, translate, Select } = await loadClientFunctions()
  t.after(() => React.unmount())
  const changes = []
  const props = { ctx: host.ctx, t: translate, busy: false,
    draft: { analysisProvider: 'legacy', analysisModel: 'legacy-model', timerSound: false },
    onPatch: (key, value) => changes.push([key, value]),
  }
  const render = () => { const tree = React.render(AnalysisModelSettings, props); React.flushEffects(); return tree }
  render()
  const models = [{ id: 'new', name: 'New provider', models: [{ id: 'm', name: 'Model M' }] }]
  host.take('getAnalysisModels').success({ groups: models, failures: [{ id: 'legacy', name: 'Legacy Provider' }] })
  await new Promise(setImmediate)
  let tree = render()
  const controls = findAll(tree, (node) => node.type === Select)
  assert.equal(controls[0].props.value, 'legacy')
  assert.equal(controls[1].props.value, 'legacy-model')
  assert.equal(controls[1].props.disabled, true)
  assert.match(textOf(tree), /当前 Provider 暂不可用.*Legacy Provider/)
  assert.deepEqual(changes, [], '检测失效不自动改设置')
  findByClass(tree, 'cs-model-catalog-refresh').props.onClick()
  render()
  host.take('getAnalysisModels').success({ groups: [...models, { id: 'legacy', models: [{ id: 'legacy-model' }] }], failures: [] })
  await new Promise(setImmediate)
  tree = render()
  assert.equal(findAll(tree, (node) => node.type === Select)[1].props.disabled, false)
  const toggles = findAll(React.render(FloatingTimerSettings, props), (node) => node.props?.type === 'checkbox')
  assert.equal(toggles[0].props.checked, true)
  assert.equal(toggles[1].props.checked, false)
  toggles[0].props.onChange({ target: { checked: false } })
  assert.deepEqual(changes.at(-1), ['floatingEnabled', false])
  assert.doesNotMatch(textOf(tree), /当前 Provider 暂不可用/)
})

function analysisPageWithSlots(tree) {
  const header = findAll(tree, node => node.type?.name === 'AnalysisReportHeader')[0]
  return { ...tree, children: [...tree.children, header?.props.context, header?.props.messages, header?.props.notices, header?.props.generationControl] }
}

test('客户端 AI 分析：固定请求范围，切周期可取消，在失败后保留对应周期的旧报告', async (t) => {
  const host = scriptedClientRpc()
  const { React, AnalysisPage, AnalysisReport, translate, Select } = await loadClientFunctions()
  t.after(() => React.unmount())
  const from = Date.now() - 1000 * 60 * 60
  const source = { sessionId: 's1', sessionTitle: '写重构', workspaceId: 'w1' }
  const report = { id: 'old', period: 'day', summary: '上一份分析', from, to: from + 500,
    provider: 'p', model: 'm', generatedAt: from + 1000, content: { work: [{ text: '读取工作记录', sourceIds: ['s1'] }] },
    sources: [source], coverage: { totalSessions: 1, readSessions: 1, includedSessions: 1 } }
  const reports = { day: report, week: null, month: null }
  const workspaces = [{ key: 'w1', workspaceTitle: '项目甲', sessions: [source] }]
  const scopeData = { period: 'day', range: { from, to: from + 1500 },
    workspaces: [{ workspaceId: 'w1', workspaceTitle: '项目甲', sessions: [source] }] }
  let refreshedModels = 0
  let reportedNotices = []
  const props = { ctx: host.ctx, t: translate, period: 'day', modelChoice: { provider: 'p', model: 'm' },
    data: { period: 'day', range: { from }, workspaces }, onOpenSettings() {}, onOpenSource: () => true,
    onNoticesChange(notices) { reportedNotices = notices },
    onRetryModel() { refreshedModels += 1; props.modelChoice = { provider: 'new-p', model: 'new-m' } },
    onSelectPeriod(period) { props.period = period; props.data = { ...props.data, period } },
  }
  const render = () => { const tree = analysisPageWithSlots(React.render(AnalysisPage, props)); React.flushEffects(); return tree }
  const settle = async () => { await new Promise(setImmediate); return render() }
  const select = (tree, label) => findAll(tree, (node) => node.type === Select && node.props.ariaLabel === translate(label))[0]
  const button = (tree, label) => findAll(tree, (node) => node.props.label === translate(label) || node.type === 'button' && textOf(node) === translate(label))[0]
  const loadingIdentity = findByClass(render(), 'cs-review-content').props.identity
  host.take('getAnalysisState').success({ phase: 'idle', request: null, reports })
  host.take('queryStats').success(scopeData)
  let tree = await settle()
  assert.equal(findByClass(tree, 'cs-review-content').props.identity, loadingIdentity, '异步读取成功不会触发正文重复入场')
  assert.equal(findAll(tree, (node) => node.type === AnalysisReport)[0].props.report.summary, '上一份分析')
  select(tree, 'analysisWorkspace').props.onChange('w1')
  tree = render()
  select(tree, 'analysisSession').props.onChange('s1')
  tree = render()
  assert.equal(reportedNotices.length, 1, '范围变化提示上报到顶栏通知区')
  assert.equal(reportedNotices[0].label, translate('analysisReportScopeMismatchShort'), '胶囊只显示短标签')
  assert.match(reportedNotices[0].message, /以下为上一份报告，使用它生成时的实际范围。/, '完整说明由浮层承载')
  assert.equal(findByClass(tree, 'cs-review-notices'), undefined, '回顾正文不再保留旧提示条')
  button(tree, 'analysisRegenerate').props.onClick()
  const started = host.take('generateAnalysis')
  assert.equal(JSON.stringify(started.payload), JSON.stringify({ period: 'day', workspaceId: 'w1', sessionId: 's1', expectedProvider: 'p', expectedModel: 'm' }))
  const request = { ...started.payload, from, to: from + 1500, provider: 'p', model: 'm' }
  started.success({ phase: 'collecting', request, progress: { read: 1, total: 2 }, reports })
  tree = await settle()
  assert.equal(select(tree, 'analysisWorkspace').props.disabled, true)
  assert.match(textOf(findByClass(tree, 'cs-analysis-status')), /1\/2.*项目甲 \/ 写重构/)
  button(tree, 'cycleWeek').props.onClick()
  tree = render()
  assert.notEqual(findByClass(tree, 'cs-review-content').props.identity, loadingIdentity, '用户切换周期仍触发内容转场')
  assert.match(textOf(findByClass(tree, 'cs-analysis-status')), /本次分析范围 · 今日/)
  assert.equal(findAll(tree, (node) => node.type === AnalysisReport).length, 0, '其它周期不显示今日报告')
  button(tree, 'analysisCancel').props.onClick()
  host.take('cancelAnalysis').success({ phase: 'cancelled', request, reports })
  tree = await settle()
  host.take('getAnalysisState').success({ phase: 'cancelled', request, reports })
  tree = await settle()
  button(tree, 'cycleToday').props.onClick()
  tree = render()
  host.take('queryStats').success(scopeData)
  tree = await settle()
  button(tree, 'analysisRegenerate').props.onClick()
  host.take('generateAnalysis').success({ phase: 'failed', request, reports, error: { code: 'generation-failed' } })
  tree = await settle()
  assert.match(textOf(tree), /报告生成失败/)
  assert.equal(findAll(tree, (node) => node.type === AnalysisReport)[0].props.report.id, 'old')
  button(tree, 'analysisRetryGenerate').props.onClick()
  host.take('generateAnalysis').fail('analysis-model-changed')
  tree = await settle()
  host.take('getAnalysisState').success({ phase: 'failed', request, reports, error: { code: 'generation-failed' } })
  tree = await settle()
  assert.equal(refreshedModels, 1)
  assert.match(textOf(tree), /分析模型已更新/)
  assert.equal(host.requests.length, 0, '显示新模型后由用户再次启动')
  assert.equal(findAll(tree, (node) => node.type === AnalysisReport)[0].props.report.id, 'old')
})

test('客户端回顾：切周期沿用上一份范围选项，不闪同步提示', async (t) => {
  const host = scriptedClientRpc()
  const { React, AnalysisPage, translate, Select } = await loadClientFunctions()
  t.after(() => React.unmount())
  const now = Date.now()
  const dayFrom = now - 60 * 60 * 1000
  const weekFrom = now - 7 * 24 * 60 * 60 * 1000
  const monthFrom = now - 30 * 24 * 60 * 60 * 1000
  const dayScope = { period: 'day', range: { from: dayFrom },
    workspaces: [{ workspaceId: 'w1', workspaceTitle: '项目甲', sessions: [{ sessionId: 's1', sessionTitle: '会话一', workspaceId: 'w1' }] }] }
  const weekScope = { period: 'week', range: { from: weekFrom },
    workspaces: [{ workspaceId: 'w2', workspaceTitle: '项目乙', sessions: [] }] }
  const props = { ctx: host.ctx, t: translate, period: 'day', modelChoice: { provider: 'p', model: 'm' },
    data: { period: 'day', range: { from: dayFrom },
      cycles: { day: { from: dayFrom }, week: { from: weekFrom }, month: { from: monthFrom } } },
    onOpenSettings() {}, onOpenSource: () => true,
  }
  const render = () => { const tree = analysisPageWithSlots(React.render(AnalysisPage, props)); React.flushEffects(); return tree }
  const settle = async () => { await new Promise(setImmediate); return render() }
  const workspaceSelect = (tree) => findAll(tree, (node) => node.type === Select && node.props.ariaLabel === translate('analysisWorkspace'))[0]
  const options = (tree) => workspaceSelect(tree).props.options.map((row) => row.value).filter(Boolean)
  const button = (tree, label) => findAll(tree, (node) => node.props.label === translate(label) || node.type === 'button' && textOf(node) === translate(label))[0]

  let tree = render()
  assert.match(textOf(tree), /正在同步该周期的范围选项/, '首次仍等待范围选项')
  host.take('getAnalysisState').success({ phase: 'idle', request: null, reports: { day: null, week: null, month: null } })
  host.take('queryStats').success(dayScope)
  tree = await settle()
  assert.doesNotMatch(textOf(tree), /正在同步该周期的范围选项/)
  assert.equal(JSON.stringify(options(tree)), JSON.stringify(['w1']))

  button(tree, 'cycleWeek').props.onClick()
  tree = render()
  assert.doesNotMatch(textOf(tree), /正在同步该周期的范围选项/, '周期切换不闪同步提示')
  assert.equal(JSON.stringify(options(tree)), JSON.stringify(['w1']), '新周期数据到达前沿用上一份选项')
  assert.equal(workspaceSelect(tree).props.disabled, false, '切换期间筛选不闪禁用态')

  host.take('queryStats').success(weekScope)
  tree = await settle()
  assert.equal(JSON.stringify(options(tree)), JSON.stringify(['w2']), '新周期数据到达后替换选项')
})

test('客户端回顾：首次生成用文档加笔，重新生成与失败重试沿用重置箭头', async () => {
  const { analysisGenerateGlyph } = await loadClientFunctions()
  assert.equal(analysisGenerateGlyph(false, false), 'generate', '首次生成报告用书写图标')
  assert.equal(analysisGenerateGlyph(true, false), 'refresh', '已有报告重新生成保留重置箭头')
  assert.equal(analysisGenerateGlyph(false, true), 'refresh', '失败重试也保留重置箭头')
})

test('客户端 AI 报告：模型内容按文本展示，只能打开 Host 声明过的来源会话', async () => {
  const { AnalysisReport, translate } = await loadClientFunctions()
  const source = { sessionId: 'source', sessionTitle: '会话 $&' }
  const opened = []
  const time = Date.now()
  const text = '<img src=x onerror=alert(1)>'
  const report = { summary: text, from: time - 1000, to: time, provider: 'p', model: 'm', generatedAt: time,
    content: { statistics: text, work: [{ text, sourceIds: ['unknown', 'source'] }], suggestions: text },
    coverage: { totalSessions: 2, readSessions: 1, includedSessions: 1, failedSessions: 1, truncated: true }, sources: [source] }
  const tree = AnalysisReport({ report, scopeChanged: true, t: translate, onOpenSource: (value) => opened.push(value) })
  assert.ok(textOf(tree).includes(text))
  assert.equal(findAll(tree, (node) => node.type === 'img' || 'dangerouslySetInnerHTML' in node.props).length, 0)
  assert.match(textOf(tree), /1 个会话读取失败.*部分内容已截取/)
  assert.match(textOf(findByClass(tree, 'cs-analysis-failures')), /这份报告仅保存了失败数量/)
  const citations = findAllByClass(tree, 'cs-analysis-source')
  assert.equal(citations.length, 2, '正文引用和来源列表均指向同一个合法会话')
  assert.equal(citations[0].props['aria-label'], '打开来源会话 会话 $&')
  citations[0].props.onClick()
  assert.deepEqual(opened, [source])
  const emptySuggestions = AnalysisReport({ report: { ...report, content: { ...report.content, suggestions: '' } }, t: translate })
  assert.doesNotMatch(textOf(emptySuggestions), /变化线索与建议/)
})

test('客户端 AI 报告：失败详情显示会话和原因，选择后返回范围筛选并等待手动生成', async (t) => {
  const host = scriptedClientRpc()
  const { React, AnalysisPage, AnalysisReport, translate, Select } = await loadClientFunctions()
  t.after(() => React.unmount())
  const from = Date.now() - 30_000
  const failedSessions = [
    { sessionId: 's1', sessionTitle: '正在调试', workspaceId: 'w1', workspaceTitle: '项目甲', reason: 'invalid-record' },
    { sessionId: 's2', sessionTitle: '历史归档', workspaceId: 'w2', workspaceTitle: '项目乙', reason: 'missing' },
    { sessionId: 's3', sessionTitle: '临时不可读', reason: 'unavailable' },
    { sessionId: 's4', sessionTitle: '未知异常', reason: 'other' },
  ]
  const report = { id: 'last', period: 'day', summary: '已有报告', from, to: from + 1000, provider: 'p', model: 'm',
    generatedAt: from + 1500, coverage: { failedSessions: 5, failedSources: failedSessions } }
  const reports = { day: report, week: null, month: null }
  const props = { ctx: host.ctx, t: translate, period: 'day', modelChoice: { provider: 'p', model: 'm' },
    data: { period: 'day', range: { from }, workspaces: [{ key: 'w1', workspaceTitle: '项目甲', sessions: [failedSessions[0]] }] },
    onOpenSource(source) { opened.push(source); return false },
    onNoticesChange(notices) { reportedNotices = notices },
  }
  const scopeData = { period: 'day', range: { from, to: from + 1000 },
    workspaces: [{ workspaceId: 'w1', workspaceTitle: '项目甲', sessions: [failedSessions[0]] }] }
  const opened = []
  let focused = 0
  let scrolled = 0
  let reportedNotices = []
  const render = () => {
    const tree = analysisPageWithSlots(React.render(AnalysisPage, props))
    const toolbar = findByClass(tree, 'cs-analysis-toolbar')
    if (toolbar) toolbar.props.ref.current = { focus() { focused += 1 }, scrollIntoView() { scrolled += 1 } }
    React.flushEffects()
    return tree
  }
  const viewReport = (tree) => AnalysisReport(findAll(tree, (node) => node.type === AnalysisReport)[0].props)
  const valueFor = (tree, label) => findAll(tree, (node) => node.type === Select && node.props.ariaLabel === translate(label))[0].props.value
  render()
  host.take('getAnalysisState').success({ phase: 'succeeded', request: null, reports })
  host.take('queryStats').success(scopeData)
  await new Promise(setImmediate)
  let tree = render()
  const details = findByClass(viewReport(tree), 'cs-analysis-failures')
  assert.equal(details.type, 'details')
  assert.match(textOf(details.children[0]), /5 个会话读取失败/)
  const rows = findAllByClass(details, 'cs-analysis-failure-item')
  assert.equal(rows.length, 4)
  assert.match(textOf(rows[0]), /正在调试.*项目甲 · 记录格式异常/)
  assert.match(textOf(rows[1]), /历史归档.*未找到记录.*当前周期的筛选项中没有该会话/)
  assert.match(textOf(rows[2]), /暂时无法读取/)
  assert.match(textOf(rows[3]), /读取失败的原因未记录/)
  assert.match(textOf(details), /另外 1 个失败会话未列出/)
  assert.equal(findAllByClass(rows[1], 'cs-analysis-failure-select').length, 0)
  findByClass(rows[1], 'cs-analysis-failure-open').props.onClick()
  assert.deepEqual(opened, [failedSessions[1]])
  assert.match(textOf(viewReport(render())), /暂时无法打开来源会话 历史归档/)

  findByClass(rows[0], 'cs-analysis-failure-select').props.onClick()
  tree = render()
  assert.equal(valueFor(tree, 'analysisWorkspace'), 'w1')
  assert.equal(valueFor(tree, 'analysisSession'), 's1')
  assert.ok(focused >= 1)
  assert.equal(scrolled, 1)
  assert.equal(host.requests.length, 0, '切换范围不会自动开始分析')
  assert.match(reportedNotices.map((item) => item.message).join('|'), /以下为上一份报告，使用它生成时的实际范围。/, '范围变化提示改由顶栏通知区承载')
  assert.match(textOf(viewReport(tree)), /已有报告/)
  const button = findAll(tree, (node) => node.props.label === translate('analysisRegenerate'))[0]
  button.props.onClick()
  const generate = host.take('generateAnalysis')
  assert.equal(generate.payload.sessionId, 's1')
  assert.equal(generate.payload.workspaceId, 'w1')
  assert.equal(findByClass(viewReport(render()), 'cs-analysis-failure-select').props.disabled, true)
})

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
  const { renderTrendChart, barOutline, ChartReveal, React } = await loadClientFunctions()
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
  const reveal = React.render(ChartReveal, { className: 'cs-chart' })
  assert.equal(reveal.props['data-chart-settled'], undefined, '图表不永久关闭入场动画')
  assert.match(reveal.props['data-chart-reveal'], /^(visible|pending)$/)
  for (const { props } of bars) {
    assert.equal(props.d?.startsWith('M '), true, '柱形用路径绘制，顶部与柱脚可以分开设置圆角')
  }
  const outline = barOutline(0, 0, 10, 30)
  const arcs = [...outline.matchAll(/A ([\d.]+) ([\d.]+) 0 0 1/g)]
    .map(([, rx, ry]) => ({ rx: Number(rx), ry: Number(ry) }))
  assert.equal(arcs.length, 4, '轮廓由四个圆角弧线组成')
  assert.deepEqual(arcs[0], { rx: 4.2, ry: 3.2 }, '顶部圆头保持原来的半径')
  assert.deepEqual(arcs[1], { rx: 2.6, ry: 1.8 }, '柱脚圆角收小，落成短平脚')
  assert.ok(arcs[1].rx < arcs[0].rx && arcs[1].ry < arcs[0].ry, '柱脚不再和顶部一样尖')
  const wideChart = renderTrendChart(trend, 'week', t, false, null, { barRatio: 0.26, barMax: 24 })
  const wideBars = allOf(wideChart, byClass('cs-bar'))
  assert.equal(wideBars[0].props['data-bar-width'], 24, '回顾图柱宽保持克制，不铺满半个槽位')
  const scarceChart = renderTrendChart(trend, 'week', t, false, null, { barRatio: 0.26, barMax: 24, slotCount: 7 })
  const scarceBars = allOf(scarceChart, byClass('cs-bar'))
  assert.equal(scarceBars[0].props['data-bar-width'], 24, '本周只进行到四天时柱宽仍按完整一周计算，不会突然变粗')
  const scarceGap = scarceBars[1].props['data-bar-x']
    - (scarceBars[0].props['data-bar-x'] + scarceBars[0].props['data-bar-width'])
  assert.ok(Math.abs(scarceGap - (1000 / 7) * 0.05) < 0.01, '成对柱的间距同样按完整周期槽位计算，不被拉散')
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

test('客户端：回顾图按完整周期的槽位数计算柱宽', async () => {
  const { reviewTrendSlotCount } = await loadClientFunctions()
  assert.equal(reviewTrendSlotCount('week', [{ from: new Date(2026, 10, 16).getTime() }]), 7, '一周固定七个槽位')
  assert.equal(reviewTrendSlotCount('day', [{ from: new Date(2026, 10, 16, 9).getTime() }]), 24, '一天固定二十四小时槽位')
  assert.equal(reviewTrendSlotCount('month', [{ from: new Date(2026, 10, 2).getTime() }]), 30, '单月按当月天数计算槽位')
  assert.equal(reviewTrendSlotCount('month', [{ from: new Date(2026, 1, 2).getTime() }]), 28, '二月按实际天数计算')
  assert.equal(reviewTrendSlotCount('week', []), 7, '缺少桶时仍按周期给出完整槽位')
})

test('客户端：周期标题旧文字单行收住，避免切换时把末尾字挤到下一帧', async () => {
  const { dshTimespanCss } = await loadClientFunctions()
  const css = dshTimespanCss()
  assert.match(css, /\.cs-text-fade-prev \{[^}]*white-space:\s*nowrap/, '旧标题不换行')
  assert.match(css, /\.cs-text-fade-prev \{[^}]*overflow:\s*hidden/, '旧标题超出当前宽度时裁掉')
})

test('客户端：圆环扇区与右侧列表双向联动并浮出占比与时长', async () => {
  const { renderComposition } = await loadClientFunctions()
  const labels = {
    breakdownModel: '模型', breakdownTool: '工具', breakdownWait: '等待',
    breakdownOther: '其他', unknownBreakdown: '未拆分', notBroken: '未拆分',
    shareLabel: '占比', durationLabel: '时长',
  }
  const t = (key) => labels[key] ?? key
  const data = { period: 'day', workspaces: [{ sessions: [{ taskMs: 120000, modelMs: 60000, toolMs: 60000, waitMs: 0, otherMs: 0, hasBreakdown: true }] }] }
  const events = []
  const tree = renderComposition(data, t, { kind: 'composition', key: 'model' }, {
    onHover: (tip, event) => events.push({ tip, event }),
    onLeave: () => events.push({ leave: true }),
  })
  const donut = allOf(tree, byClass('cs-donut'))[0]
  assert.match(donut.props.className, /has-hot/, '有高亮段时其它段淡出')
  const segments = allOf(tree, byClass('cs-donut-seg'))
  assert.equal(segments.length, 2)
  assert.deepEqual(segments.map((segment) => segment.props.key), ['day-model', 'day-tool'], '周期切换时扇区按新周期重新挂载')
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

  const weekSegments = allOf(renderComposition({ ...data, period: 'week' }, t), byClass('cs-donut-seg'))
  assert.deepEqual(weekSegments.map((segment) => segment.props.key), ['week-model', 'week-tool'], '换周期后的扇区是新节点，入场动画重新播放')
})

test('客户端：统一浮层按视口夹取位置并渲染标题与数值', async () => {
  const { clampTipPosition, buildTrendTip, renderHoverTip, hoverTipProps } = await loadClientFunctions()
  const anchor = { left: 780, top: 10, width: 20, height: 20, right: 800, bottom: 30 }
  const position = clampTipPosition(anchor, { width: 200, height: 60 }, { width: 800, height: 600 })
  assert.equal(position.left, 592, '右侧贴边的浮层向左夹取')
  assert.equal(position.top, 40, '顶部空间不足时翻到锚点下方')
  const leftEdge = clampTipPosition({ left: 2, top: 300, width: 20, height: 20, right: 22, bottom: 320 }, { width: 200, height: 60 }, { width: 800, height: 600 })
  assert.equal(leftEdge.left, 8, '左侧贴边的浮层向右夹取')
  assert.equal(leftEdge.top, 230, '顶部空间充足时浮在锚点上方')
  const belowPreferred = clampTipPosition({ left: 520, top: 20, width: 30, height: 30, right: 550, bottom: 50 }, { width: 180, height: 44 }, { width: 800, height: 600 }, { prefer: 'bottom' })
  assert.equal(belowPreferred.top, 60, '顶栏图标说明优先向下展开，避开窗口按钮')
  assert.equal(belowPreferred.placement, 'bottom')
  let shown = null
  const tipProps = hoverTipProps({ show: (content) => { shown = content }, hide: () => {} }, '配色：晴空蓝', [], { prefer: 'bottom' })
  tipProps.onMouseEnter({ currentTarget: { getBoundingClientRect: () => ({ left: 740, top: 20, right: 770, bottom: 50, width: 30, height: 30 }) } })
  assert.equal(shown.prefer, 'bottom', '顶栏按钮把向下展开偏好传给浮层')
  assert.equal(shown.title, '配色：晴空蓝', '配色说明只留当前配色名')
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
  const { normalizeDashboard, approximateNoticeVisible, buildTopbarNotices, renderTopbarNotices } = await loadClientFunctions()
  assert.equal(normalizeDashboard({ approximate: true }).approximate, true)
  assert.equal(normalizeDashboard({ approximate: false }).approximate, false)
  assert.equal(approximateNoticeVisible({ approximate: true, workspaces: [] }), true)
  assert.equal(approximateNoticeVisible({ approximate: false, workspaces: [{ approximate: true }] }), true)
  assert.equal(approximateNoticeVisible({ approximate: false, workspaces: [{ approximate: false }] }), false)
  const labels = {
    approximateChipLabel: '近似记录', approximateDismiss: '不再显示', noticeDismiss: '关闭通知',
    approximateNotice: '有些记录只能按最后心跳或最后事件时间结束，相关时长可能偏短',
    topbarNoticesLabel: '通知',
  }
  const t = (key) => labels[key] ?? key
  const notices = buildTopbarNotices({ t, backfill: null, hasApproximate: true, onDismissApproximate: () => {} })
  assert.equal(notices.length, 1, '近似说明收成一条顶栏通知')
  assert.equal(notices[0].label, '近似记录', '胶囊只显示短标签')
  assert.match(notices[0].detail, /按最后心跳或最后事件时间结束/, '完整说明放进浮层')
  const rail = renderTopbarNotices(notices, null, t)
  assert.equal(findByClass(rail, 'cs-topbar-notices').props['aria-label'], '通知')
  assert.ok(findByClass(rail, 'cs-notice-chip-close'), '胶囊保留关闭按钮')
  assert.equal(buildTopbarNotices({ t, backfill: null, hasApproximate: false }).length, 0)
})

test('客户端：顶栏通知排在设置导航之后、状态点之前', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const nav = source.indexOf('h(TabNav,')
  const rightStart = source.indexOf("className: 'cs-topbar-right'")
  assert.ok(nav > 0 && rightStart > nav, '右侧分组位于五视图导航之后')
  const right = source.slice(rightStart, source.indexOf("className: 'cs-views'", rightStart))
  const notices = right.indexOf('renderTopbarNotices(topbarNotices')
  const status = right.indexOf('cs-live cs-live-status')
  const timer = right.indexOf('DashboardTimer')
  const palette = right.indexOf('cs-palette-toggle')
  assert.ok(notices > 0 && status > notices, '通知胶囊先于状态点渲染，位于状态点左侧')
  assert.ok(timer > status && palette > timer, '计时、外观与配色仍收在状态点右侧的操作组')
  assert.ok(notices < timer, '通知不再排在最右侧的循环按钮之后')
  assert.equal(right.indexOf('renderTopbarNotices(topbarNotices', notices + 1), -1, '通知只渲染一处')
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

test('客户端：自定义下拉首次展开按最终最小宽度定位，不从右偏移', async () => {
  const { Select, React } = await loadClientFunctions({
    innerWidth: 1200, innerHeight: 900, addEventListener() {}, removeEventListener() {},
  })
  const props = {
    value: 'a',
    options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    ariaLabel: '范围',
    onChange: () => {},
  }
  let tree = React.render(Select, props)
  findByClass(tree, 'cs-select-btn').props.ref.current = {
    getBoundingClientRect: () => ({ left: 500, top: 100, width: 300, height: 32 }),
  }
  findByClass(tree, 'cs-select-btn').props.onClick()
  tree = React.render(Select, props)
  findByClass(tree, 'cs-select-menu').props.ref.current = { offsetWidth: 100, offsetHeight: 180 }
  React.flushEffects()
  tree = React.render(Select, props)
  const style = findByClass(tree, 'cs-select-menu').props.style
  assert.equal(style.minWidth, '300px', '首次定位使用触发器宽度作为最终宽度')
  assert.equal(style.left, '500px', '以最终宽度居中，不按未套用 minWidth 的窄菜单偏移')
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

test('客户端：品牌标识使用镜像括号、分段斜线及随配色切换的独立渐变', async () => {
  const { DshTimespanIcon } = await loadClientFunctions()
  const icon = DshTimespanIcon({ size: 16 })
  const second = DshTimespanIcon({ size: 36 })
  const [gradient] = findAll(icon, (node) => node.type === 'linearGradient')
  const [otherGradient] = findAll(second, (node) => node.type === 'linearGradient')
  assert.notEqual(gradient.props.id, otherGradient.props.id)
  assert.equal(gradient.props.colorInterpolation, 'linearRGB')
  assert.equal(icon.props.width, 16)
  const [start, finish, span, last] = findAll(icon, (node) => node.type === 'path')
  assert.equal(start.props.d, finish.props.d)
  assert.equal(finish.props.transform, 'translate(24) scale(-1 1)')
  assert.notEqual(span.props.d, last.props.d)
  assert.equal(span.props.fill, 'var(--cs-logo-ink, #30302b)')
  assert.equal(finish.props.fill, 'url(#' + gradient.props.id + ')')
  assert.equal(last.props.fill, finish.props.fill)
  assert.match(gradient.children[0].props.stopColor, /--cs-logo-top/)
  assert.match(gradient.children[1].props.stopColor, /--cs-logo-bottom/)
  const css = await loadClientCss()
  for (const [appearance, violet] of [['', '#996bf3'], ['.cs-appearance-dark', '#c5a4ff']]) {
    assert.match(declarationsFor(css, `.cs-page${appearance}`), new RegExp(`--cs-logo-bottom:\\s*${violet};`))
    const startColors = ['blue', 'stone', 'cyan', 'coral'].map((palette) => {
      const rules = declarationsFor(css, `.cs-page${appearance}.cs-palette-${palette}`)
      const top = rules.match(/--cs-logo-top:\s*([^;]+);/)?.[1]
      assert.ok(top && top !== violet, `${palette}${appearance} 有独立的渐变起色`)
      assert.doesNotMatch(rules, /--cs-logo-bottom:/, '配色共享当前外观的紫色终点')
      return top
    })
    assert.equal(new Set(startColors).size, 4)
  }
})

test('客户端：配色归一化为 blue/stone/cyan，旧赤陶迁移青色、其余旧值回落默认蓝', async () => {
  const { normalizePalette } = await loadClientFunctions()
  assert.equal(typeof normalizePalette, 'function')
  assert.equal(normalizePalette('blue'), 'blue')
  assert.equal(normalizePalette('stone'), 'stone')
  assert.equal(normalizePalette('cyan'), 'cyan')
  assert.equal(normalizePalette('clay'), 'cyan', '旧赤陶存储值迁移到新青色')
  for (const legacy of ['mono', 'green', 'warm', '', null, undefined, 'unknown']) {
    assert.equal(normalizePalette(legacy), 'blue', `旧配色 ${String(legacy)} 必须落回默认蓝`)
  }
})

test('客户端：视觉基座导出三档蓝 token、四套配色与派生色阶', async () => {
  const { dshTimespanCss } = await loadClientFunctions()
  assert.equal(typeof dshTimespanCss, 'function')
  const css = dshTimespanCss()
  assert.match(css, /--cs-signal-deep\s*:\s*#133463/i)
  assert.match(css, /--cs-signal\s*:\s*#1F4E94/i)
  assert.match(css, /--cs-signal-soft\s*:\s*#79B3F9/i)
  assert.match(css, /--cs-accent\s*:\s*var\(--cs-signal/)
  assert.match(css, /--cs-live\s*:\s*var\(--cs-signal\)/)
  assert.match(css, /--cs-task\s*:\s*#C29BE8/i, '任务系列使用与活跃蓝分开的紫罗兰辅助色')
  assert.doesNotMatch(css, /#7A5AA6|#5f418a/i, '浅色与深色外观使用同一个任务紫')
  assert.match(css, /--cs-logo-ink\s*:\s*#efe8db/i)
  assert.match(css, /--cs-ring-track\s*:\s*color-mix\(/, '主页面也导出圆环轨道色')
  assert.match(css, /--cs-tone-faint\s*:/)
  assert.match(css, /--cs-tone-soft\s*:/)
  assert.match(css, /--cs-tone-other\s*:/)
  for (let step = 0; step <= 5; step += 1) assert.match(css, new RegExp(`--cs-heat-${step}\\s*:`))
  assert.match(css, /\.cs-page\.cs-palette-stone\s*\{/)
  assert.match(css, /\.cs-page\.cs-palette-cyan\s*\{/)
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
  assert.doesNotMatch(declarationsFor(css, '.cs-view'), /\btransform:/, '视图不创建额外的 fixed 浮层定位参照')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /--cs-dur-tap\s*:\s*160ms/)
  assert.doesNotMatch(css, /#315878|#285642|#78947c|#96543f|#7492a8|#73797b/i, '旧的灰绿配色值不得残留')
})

test('客户端：概览整页滚轮滚动，子模块不出现内部竖滚', async () => {
  const { dshTimespanCss } = await loadClientFunctions()
  const css = dshTimespanCss()
  const settingsCss = await loadSettingsCss()
  assert.doesNotMatch(declarationsFor(css, '.cs-page'), /100dvh/, '根容器不固定视口高度')
  assert.match(declarationsFor(css, '.cs-page'), /overflow:\s*auto/, '整页由 .cs-page 自己滚动')
  assert.doesNotMatch(declarationsFor(css, '.cs-overview-grid'), /grid-auto-rows:/, '概览隐式行按内容自然撑高，全年跨行不被压成 1fr')
  assert.match(declarationsFor(css, '.cs-shell'), /gap:\s*8px/, '顶栏与标签间距收到 8px')
  assert.doesNotMatch(declarationsFor(css, '.cs-shell'), /min-height:\s*0/, '不再用 flex 链压高度')
  assert.doesNotMatch(declarationsFor(css, '.cs-view'), /flex:\s*1 1 auto/, '视图不吃满固定剩余高度')
  assert.match(declarationsFor(css, '.cs-overview-grid'), /grid-template-rows:\s*auto\s+auto\s+auto/, '三行按内容自然高度')
  assert.match(declarationsFor(css, '.cs-overview-grid'), /align-content:\s*start/, 'Bento 从顶部排，不留底部空白')
  assert.match(declarationsFor(css, '.cs-chart svg'), /height:\s*clamp\(/, '图表高度随视口收缩')
  assert.match(declarationsFor(css, '.cs-trend-layout .cs-trend-card .cs-plot svg'), /flex:\s*1 1 auto/, '今日 24 小时图表吃满卡片剩余高度，柱图整体下沉')
  assert.match(declarationsFor(css, '.cs-table-body'), /overflow:\s*visible/, '明细表不设内部竖滚，交给整页')
  assert.doesNotMatch(css, /\.cs-table-body\s*\{[^}]*flex:\s*1 1 auto/, '明细表不再被 flex 拉进固定高度')
  assert.match(declarationsFor(css, '.cs-settings-card'), /align-self:\s*stretch/, '设置卡片撑满行高')
  assert.ok(
    settingsCss.includes('.cs-settings-list.is-split {') &&
      settingsCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    '统计与显示在宽卡内用双列填满右半区')
  assert.match(declarationsFor(settingsCss, '.cs-settings-board .cs-settings-grid'), /align-items:\s*stretch/, '设置板同一排卡片等高，底边齐平')
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
  const fills = findNodes(tree, (node) => node.type === 'path' && String(node.props.className ?? '').split(/\s+/).includes('cs-bar')).map((node) => node.props.fill)
  assert.ok(fills.includes('var(--cs-chart-active)'), '活跃柱使用图形专用 --cs-chart-active，独立于状态文字颜色')
  assert.ok(fills.includes('var(--cs-task)'), '任务柱使用 --cs-task')
  assert.ok(fills.every((fill) => typeof fill === 'string' && fill.startsWith('var(--cs-')), '图表只使用设计 token 着色')
})

test('客户端：ⓘ 悬停、聚焦与点击显示，说明保留完整语义且不带句末句号', async () => {
  const { Info, React, clampTipPosition } = await loadClientFunctions()
  const message = '实际占用：多会话重叠时段只计一次；在线时长包含挂机时间。'
  const tree = React.render(Info, { message })
  const button = findAll(tree, (node) => node.type === 'button')[0]
  assert.equal(findByClass(tree, 'cs-info').type, 'span')
  assert.equal(button.type, 'button')
  assert.equal(button.props.type, 'button')
  assert.equal(button.props['aria-label'], message.slice(0, -1), 'aria 名称与显示内容都去掉句末句号')
  assert.equal(typeof button.props.onMouseEnter, 'function', '悬停触发')
  assert.equal(typeof button.props.onMouseLeave, 'function', '移出收起')
  assert.equal(typeof button.props.onFocus, 'function', '键盘聚焦触发')
  assert.equal(typeof button.props.onBlur, 'function', '失焦收起')
  assert.equal(typeof button.props.onClick, 'function', '点击也能查看说明，不切换为固定浮层')
  assert.equal(typeof button.props.onMouseDown, 'function', '鼠标按下会拦住默认聚焦')
  let prevented = 0
  button.props.onMouseDown({ button: 0, preventDefault() { prevented += 1 } })
  assert.equal(prevented, 1, '左键点击不抢焦点，避免点击后留下焦点色块')
  button.props.onMouseDown({ button: 2, preventDefault() { prevented += 1 } })
  assert.equal(prevented, 1, '只拦左键')
  assert.equal(button.props.onKeyDown, undefined, 'Esc 收起由文档级监听处理')
  assert.equal(button.props['aria-expanded'], undefined, '悬浮浮层不再冒充可展开控件')
  const tip = findByClass(tree, 'cs-info-tip')
  assert.equal(tip.props.role, 'tooltip')
  assert.equal(textOf(tip), message.slice(0, -1))
  assert.equal(typeof tip.props.style.left, 'string', '浮层用内联 left 定位')
  assert.equal(typeof tip.props.style.top, 'string', '浮层用内联 top 定位（clampTipPosition 计算）')
  assert.equal(tip.props['data-placement'], 'bottom', '默认紧贴图标下方')

  const withLegend = React.render(Info, {
    message,
    content: React.createElement('span', { className: 'cs-heat-legend' }, '低 → 高'),
  })
  const legendTip = findByClass(withLegend, 'cs-info-tip')
  assert.equal(textOf(legendTip), '低 → 高', '有图例时浮层仅显示图例')
  assert.equal(findAll(withLegend, (node) => node.type === 'button')[0].props['aria-label'], message.slice(0, -1))

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

test('客户端：模块标题图标提供延迟简介，不再常驻说明图标', async () => {
  const {
    renderComposition, renderWorkspaceRanking, renderTrendCard, renderRecentSessions, Info, TextFade,
  } = await loadClientFunctions()
  const labels = {
    compositionTitle: '任务时长构成', noTaskComposition: '暂无任务', accumulated: '累计工时',
    workspaceRanking: '工作区任务排行', unassigned: '未归属', taskLabel: '任务', colShare: '任务占比',
    trendDay: '今日 24 小时', activeLabel: '活跃', emptyDashboard: '暂无记录',
    recentSessions: '最近会话', recentSessionsEmpty: '暂无会话',
    moduleTipComposition: '任务构成简介', moduleTipRanking: '排行简介',
    moduleTipTrend: '趋势简介', moduleTipRecent: '会话简介',
  }
  const t = (key) => labels[key] ?? key
  const moduleInfos = (tree) => findNodes(tree, (node) => node.type === Info)
  const check = (tree, tip, name) => {
    const infos = moduleInfos(tree)
    assert.equal(infos.length, 1, `${name}标题图标是唯一的说明入口`)
    assert.equal(infos[0].props.delay, 600, `${name}说明需要停留后才显示`)
    assert.equal(infos[0].props.message, tip)
  }
  check(renderComposition({ workspaces: [] }, t), '任务构成简介', '任务时长构成')
  check(renderWorkspaceRanking({ workspaces: [] }, t), '排行简介', '工作区任务排行')
  const trend = renderTrendCard({ workspaces: [], trend: [] }, t, true, { tip: null, show() {}, hide() {} }, 'hms', 'day', {})
  check(trend, '趋势简介', '今日 24 小时')
  assert.equal(findAll(trend, (node) => node.type === TextFade).length, 1, '周期标题用独立文字渐变层，不重载整个模块')
  check(renderRecentSessions({ workspaces: [] }, t, Date.now(), () => {}, 'hms'), '会话简介', '最近会话')
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
  assert.match(mobile, /\.cs-details-stats\s*\{[^}]*grid-template-columns:\s*repeat\(2/, '窄屏统计带分成两列，保留标题图标与完整时长的阅读空间')
  assert.match(mobile, /\.cs-session-meta\s*\{[^}]*gap:/, '窄屏会话指标收紧间距')
  assert.match(mobile, /\.cs-sessions-card-head\s*\{[^}]*flex-direction:\s*column/, '窄屏卡片头改为纵向排布')
})

test('客户端：回填状态收进顶栏通知，完成事件仍未读时才提示', async () => {
  const { buildTopbarNotices, renderTopbarNotices, normalizeBackfill, isBackfillUnread } = await loadClientFunctions()
  const labels = {
    backfillChipRunning: '回填中', backfillChipDone: '回填完成', backfillChipFailed: '回填失败',
    backfillDoneHint: '已累计回填 {tasks} 条历史任务，仪表盘数据已更新',
    backfillDismiss: '知道了', backfillRetry: '重试', noticeDismiss: '关闭通知', topbarNoticesLabel: '通知',
    backfillProgress: '已扫描 {done}/{total} 个会话，累计回填 {tasks} 条任务',
  }
  const t = (key) => labels[key] ?? key

  const unread = normalizeBackfill({
    status: 'done', eventId: 'backfill_1_v1', readEventId: '', tasksWritten: 130,
  })
  assert.equal(isBackfillUnread(unread), true)
  let notices = buildTopbarNotices({ t, backfill: unread, hasApproximate: false, onDismissBackfill: () => {} })
  assert.equal(notices.length, 1, '未读完成事件显示一条通知')
  assert.equal(notices[0].label, '回填完成')
  assert.match(notices[0].detail, /已累计回填 130 条历史任务/)
  assert.doesNotMatch(notices[0].detail, /已补入 130 条历史任务/)
  assert.ok(findByClass(renderTopbarNotices(notices, null, t), 'cs-notice-chip-close'), '完成后可关闭')

  // 同一事件已读：组件重挂载/刷新后不显示。
  const read = normalizeBackfill({
    status: 'done', eventId: 'backfill_1_v1', readEventId: 'backfill_1_v1', tasksWritten: 130,
  })
  assert.equal(isBackfillUnread(read), false)
  assert.equal(buildTopbarNotices({ t, backfill: read, hasApproximate: false }).length, 0)

  // 新一代事件即使旧事件已读，也要再提示一次。
  const next = normalizeBackfill({
    status: 'done', eventId: 'backfill_2_v1', readEventId: 'backfill_1_v1', tasksWritten: 130,
  })
  assert.equal(isBackfillUnread(next), true)
  assert.equal(buildTopbarNotices({ t, backfill: next, hasApproximate: false }).length, 1)

  // 进行中只显示进度，不提供关闭；失败时提供重试。
  const running = normalizeBackfill({ status: 'running', scanned: 3, total: 4, tasksWritten: 5 })
  notices = buildTopbarNotices({ t, backfill: running, hasApproximate: false })
  assert.equal(notices[0].label, '回填中')
  assert.equal(notices[0].progress, 75)
  assert.equal(notices[0].onDismiss, undefined, '进行中不能被关掉')
  const failed = normalizeBackfill({ status: 'failed', error: 'boom' })
  notices = buildTopbarNotices({ t, backfill: failed, hasApproximate: false, onRetryBackfill: () => {} })
  assert.equal(notices[0].label, '回填失败')
  assert.equal(notices[0].actionLabel, '重试')
  assert.match(notices[0].detail, /boom/)

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
  assert.match(css, /--cs-task\s*:\s*#C29BE8/i, '侧栏任务构成段使用独立紫罗兰辅助色')
  assert.doesNotMatch(css, /#7A5AA6|#5f418a/i, '侧栏浅色与深色外观使用同一个任务紫')
  assert.match(css, /\.dsh-timespan-nav-entry\.cs-palette-blue/)
  assert.match(css, /\.dsh-timespan-nav-entry\.cs-palette-stone/)
  assert.match(css, /\.dsh-timespan-nav-entry\.cs-palette-cyan/)
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
  assert.match(entry, /--cs-ring-online:\s*var\(--cs-signal-soft\)/, '深色默认在线段使用柔和信号色')
  assert.match(css, /\.dsh-timespan-nav-entry\.cs-appearance-light\s*\{[^}]*--cs-ring-online:\s*color-mix\(in srgb, var\(--cs-signal-soft\) 50%, var\(--cs-signal\)\)/, '浅色在线段改用中阶信号色，避开活跃状态点')
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
  assert.match(declarationsFor(css, '.dsh-timespan-nav-dot.is-live'), /background:\s*var\(--cs-active-dot\)/, '活跃状态点使用 --cs-active-dot')
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
  assert.equal(segments.map((segment) => segment.color).join(','), '--cs-ring-online,--cs-active-dot,--cs-task', '活跃段与状态点共用活跃色，在线段使用环专用色')
  const gradient = sidebarRingGradient(segments)
  assert.match(gradient, /^conic-gradient\(/)
  assert.match(gradient, /var\(--cs-ring-online\)\s+0%\s+50%/)
  assert.match(gradient, /var\(--cs-active-dot\)\s+50%\s+87\.5%/)
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
  assert.equal(JSON.stringify(readStoredTheme()), JSON.stringify({ palette: 'cyan', appearance: 'system' }), '旧赤陶存储值读成青色')
  assert.equal(sidebarThemeClass('blue', 'light', false), 'cs-palette-blue cs-appearance-light')
  assert.equal(sidebarThemeClass('blue', 'system', true), 'cs-palette-blue cs-appearance-dark', 'system 在深色系统下解析为 dark')
  assert.equal(sidebarThemeClass('stone', 'system', false), 'cs-palette-stone cs-appearance-light')
  assert.equal(sidebarThemeClass('cyan', 'dark', false), 'cs-palette-cyan cs-appearance-dark')
  assert.equal(sidebarThemeClass('clay', 'dark', false), 'cs-palette-cyan cs-appearance-dark', '旧赤陶直接传值也迁移到青色')
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
  const ringSegments = findAll(tree, (node) => hasClass(node, 'dsh-timespan-nav-ring-seg'))
  assert.equal(ringSegments.length, 3, '标准圆环由三段 SVG 弧组成')
  assert.equal(ringSegments.map((segment) => segment.props.stroke).join(','),
    'var(--cs-ring-online),var(--cs-active-dot),var(--cs-task)', '活跃段颜色与状态点活跃色一致')
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
  assert.equal(shown[0].tip.rows[1].color, '--cs-active-dot', '浮层活跃色与状态点活跃色一致')
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
    timerPresetMinutes: 40,
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
    analysisProvider: '',
    analysisModel: '',
    timerPresetMinutes: 40,
    timerSound: true,
    floatingEnabled: true,
    floatingShowClock: false,
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

test('客户端设置：DSH 设置模块右上角提供 GitHub、Issue 与 Star 入口', async () => {
  const { createSettingsSection, React, translate, DetailGlyph } = await loadClientFunctions()
  const css = await loadSettingsCss()
  const tree = React.render(createSettingsSection({}), { t: translate })
  assert.ok(findByClass(tree, 'cs-settings-header'), '入口放在模块标题右上角')
  const links = findAll(tree, (node) => node.type === 'a' && hasClass(node, 'cs-settings-link'))
  assert.equal(links.length, 3, '项目页、Issue 与 Star 三个入口')
  assert.deepEqual(links.map((node) => node.props.href), [
    'https://github.com/qwayo/dsh-timespan',
    'https://github.com/qwayo/dsh-timespan/issues',
    'https://github.com/qwayo/dsh-timespan',
  ])
  assert.ok(links.every((node) => node.props.target === '_blank' && /noreferrer/.test(node.props.rel)), '在宿主外的新窗口打开')
  assert.equal(links[0].props['aria-label'], '打开 GitHub 项目页')
  assert.equal(links[1].props['aria-label'], '提交或查看 Issue')
  assert.match(links[2].props['aria-label'], /Star/)
  assert.ok(links.every((node) => node.props.title === undefined), '不再用原生 title 的慢速提示')
  assert.ok(links.every((node) => typeof node.props.onMouseEnter === 'function' && typeof node.props.onFocus === 'function'),
    '悬停与聚焦都走即时浮层')
  assert.ok(hasClass(links[0], 'is-github') && hasClass(links[1], 'is-issue') && hasClass(links[2], 'is-star'),
    '三个入口各自带悬停动作类')
  assert.match(declarationsFor(css, '.cs-settings-link.is-star'), /color:\s*#e9a200/, 'Star 使用实心金黄色')
  assert.match(css, /\.cs-settings-link\.is-star:hover[^{]*\{[^}]*color:\s*#f2b21c/, '悬浮保留金色')
  assert.match(css, /\.cs-settings-link\.is-github:hover[^{]*\.cs-detail-glyph[^{]*\{[^}]*rotate\(-8deg\)/,
    'GitHub 图标悬停轻摆')
  assert.match(css, /\.cs-settings-link\.is-issue:hover[^{]*\.cs-issue-dot-a[^{]*\{[^}]*animation:/,
    'Issue 气泡里的点在悬停时跳动')
  assert.match(css, /\.cs-settings-link\.is-star:hover[^{]*\.cs-detail-glyph[^{]*\{[^}]*scale\(1\.2\)/,
    'Star 悬停旋起放大')
  assert.match(css, /\.cs-settings-link\.is-star:hover::before[^{]*\{[^}]*opacity:\s*1/, 'Star 悬停带金色光晕')
  const issue = DetailGlyph({ name: 'issue', size: 17 })
  assert.equal(findAll(issue, (node) => hasClass(node, 'cs-issue-dot')).length, 2, 'Issue 是带两个点的聊天气泡')
  const star = DetailGlyph({ name: 'star', size: 17 })
  assert.equal(findAll(star, (node) => node.type === 'path' && String(node.props.fill).startsWith('url(#cs-star-gold')).length, 1,
    'Star 使用金色渐变填充')
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

test('客户端：统一 formatDuration 输出六档，非法值与负数安全回落', async () => {
  const { formatDuration, normalizeDurationFormat } = await loadClientFunctions()
  const ms = 2 * 3_600_000 + 48 * 60_000 + 16_000
  assert.equal(formatDuration(ms), '2h 48m', '缺省使用紧凑单位')
  assert.equal(formatDuration(ms, 'hms'), '2:48:16')
  assert.equal(formatDuration(ms, 'short'), '2h 48m')
  assert.equal(formatDuration(ms, 'zh'), '2 小时 48 分')
  assert.equal(formatDuration(ms, 'sec'), '10096 秒')
  assert.equal(formatDuration(ms, 'padded'), '02:48:16')
  assert.equal(formatDuration(ms, 'decimal'), '2.80 h')
  assert.equal(formatDuration(18_000, 'decimal'), '0.01 h')
  assert.equal(formatDuration(-1, 'decimal'), '0.00 h')
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

test('客户端：时长只把数字段标成强调色，单位与符号保持正文色', async () => {
  const { formatDuration, renderDurationDigits } = await loadClientFunctions()
  const msec = 2 * 3_600_000 + 48 * 60_000 + 16_000
  const parts = (ms, format) => renderDurationDigits(formatDuration(ms, format))
    .map((part) => [textOf(part), part.props.className])
  assert.equal(JSON.stringify(parts(msec, 'short')), JSON.stringify([
    ['2', 'cs-duration-number'], ['h ', 'cs-duration-unit'],
    ['48', 'cs-duration-number'], ['m', 'cs-duration-unit'],
  ]), '紧凑格式区分数字与 h/m')
  assert.equal(JSON.stringify(parts(msec, 'zh')), JSON.stringify([
    ['2', 'cs-duration-number'], [' 小时 ', 'cs-duration-unit'],
    ['48', 'cs-duration-number'], [' 分', 'cs-duration-unit'],
  ]), '中文格式区分数字与中文单位')
  assert.equal(JSON.stringify(parts(msec, 'padded')), JSON.stringify([
    ['02', 'cs-duration-number'], [':', 'cs-duration-unit'],
    ['48', 'cs-duration-number'], [':', 'cs-duration-unit'],
    ['16', 'cs-duration-number'],
  ]), '补零格式的数字成组，冒号留给正文色')
  assert.equal(JSON.stringify(parts(msec, 'decimal')), JSON.stringify([
    ['2', 'cs-duration-number'], ['.', 'cs-duration-unit'],
    ['80', 'cs-duration-number'], [' h', 'cs-duration-unit'],
  ]), '小数格式的小数点与单位留在正文色')
})

test('客户端：设置草稿包含数字格式，六档紧凑选项条与预览可用，预览事件广播并支持退订', async () => {
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
    formatHintPadded: '补零时钟', formatHintDecimal: '小数小时',
    formatPreviewLabel: '预览 · 2:48:16 显示为',
  }
  const t = (key) => labels[key] ?? key
  const picked = []
  const section = renderDurationFormatSection(t, 'zh', { onSelect: (value) => picked.push(value) })
  const optionButtons = allOf(section, byClass('cs-format-opt'))
  assert.equal(optionButtons.length, 6, '六档格式始终同时可见')
  const checked = optionButtons.filter((button) => button.props['aria-checked'] === true)
  assert.equal(checked.length, 1, '只有一个格式处于选中态')
  assert.match(textOf(checked[0]), /2 小时 48 分/, '中文单位卡片给出真实样例')
  assert.equal(allOf(section, byClass('cs-format-divider')).length, 6, '每张格式卡在数字与中文说明之间都有竖线分隔')
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

test('客户端：初始化设置与外观卡同高，按钮图标保持紧凑', async () => {
  const css = await loadSettingsCss()
  assert.match(
    declarationsFor(css, '.cs-settings-board .cs-settings-reset-card'),
    /align-self:\s*stretch/,
    '初始化设置撑满行高，与左侧外观卡底边齐平',
  )
  assert.match(
    declarationsFor(css, '.cs-settings-board .cs-settings-reset-card > :last-child'),
    /margin-top:\s*auto/,
    '按钮组沉到卡片底部，空白留在内容之间',
  )
  assert.doesNotMatch(css, /\.cs-reset-chip \{/, '不再插入额外的恢复范围标签')
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

test('客户端：视图名归一化只接受五视图，非法值回落概览', async () => {
  const { normalizeView } = await loadClientFunctions()
  assert.equal(typeof normalizeView, 'function')
  for (const value of ['overview', 'trend', 'details', 'settings', 'analysis']) {
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
  assert.equal(nextTabIndex(4, 'ArrowRight'), 0, '右方向键从最后一项循环到第一项')
  assert.equal(nextTabIndex(0, 'ArrowLeft'), 4, '左方向键从第一项循环到最后一项')
  assert.equal(nextTabIndex(2, 'ArrowLeft'), 1)
  assert.equal(nextTabIndex(2, 'Home'), 0)
  assert.equal(nextTabIndex(1, 'End'), 4)
  assert.equal(nextTabIndex(2, 'Enter'), 2, '其它按键保持当前项')
})

test('客户端：分段导航渲染五个 tab、移动滑块与 roving tabindex', async () => {
  const { TabNav, React } = await loadClientFunctions()
  assert.equal(typeof TabNav, 'function')
  const labels = {
    tabOverview: '概览', tabTrend: '趋势', tabDetails: '会话', tabSettings: '设置', tabAnalysis: '回顾',
    tabsLabel: 'dsh-timespan 页面',
  }
  const t = (key) => labels[key] ?? key
  const picked = []
  const tree = React.render(TabNav, { view: 'trend', t, onChange: (value) => picked.push(value) })

  const nav = findAll(tree, (node) => node.props?.role === 'tablist')[0]
  assert.ok(nav, '导航以 tablist 呈现')
  assert.equal(nav.props['aria-label'], 'dsh-timespan 页面')
  const tabs = findAll(tree, (node) => node.props?.role === 'tab')
  assert.equal(tabs.length, 5, '五个同级 tab')
  assert.deepEqual(tabs.map((tab) => textOf(tab).trim()), ['概览', '趋势', '会话', '回顾', '设置'])
  assert.deepEqual(tabs.map((tab) => tab.props['aria-selected']), [false, true, false, false, false])
  assert.deepEqual(tabs.map((tab) => tab.props.tabIndex), [-1, 0, -1, -1, -1], '激活项 0，其余 -1')
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

test('客户端：视图退出短于进入，减少动效直接到位', async () => {
  const { viewTransitionDelay, VIEW_ENTER_MS, VIEW_EXIT_MS } = await loadClientFunctions()
  assert.equal(VIEW_ENTER_MS, 180)
  assert.equal(VIEW_EXIT_MS, 120)
  assert.ok(VIEW_EXIT_MS < VIEW_ENTER_MS, '退出更快，不拖延下一次操作')
  assert.equal(viewTransitionDelay(false), 120)
  assert.equal(viewTransitionDelay(true), 0, 'prefers-reduced-motion 下直接切换')

  const css = await loadClientCss()
  assert.doesNotMatch(declarationsFor(css, '.cs-view'), /transform:/, '保持固定浮层的视口坐标')
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

test('客户端：概览、趋势、明细三个视图各有真实内容', async (testContext) => {
  const harness = await createSessionBrowserHarness(testContext)
  const { renderOverviewView, renderTrendView } = harness
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
    trendDistributionHint: '颜色越深，活跃越久',
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
  const trendInfos = allOf(trend, (node) => node.type === harness.Info)
    .filter((node) => node.props.buttonClassName === 'cs-card-icon-btn')
  assert.equal(trendInfos.length, 4, '趋势页四个模块标题都由左侧图标承载说明')
  const infoFor = (message) => trendInfos.find((node) => node.props.message === message)
  assert.equal(infoFor(labels.trendInfo)?.props.icon.props.name, 'summary', '本周期概览用概览仪表图标')
  assert.equal(infoFor(labels.trendDistributionHint)?.props.icon.props.name, 'clock', '时段分布沿用时钟图标')
  assert.equal(infoFor(labels.trendInsightsHint)?.props.icon.props.name, 'insight', '趋势洞察使用放大镜折线图标')
  assert.ok(trendInfos.every((node) => node.props.delay === 600), '停留片刻才浮出说明，避免扫过时闪动')
  assert.equal(allOf(allOf(trend, byClass('cs-distribution-grain'))[0], (node) => node.type === harness.Info).length, 0, '时段分布右侧不再保留感叹号')
  const summaryGlyph = harness.DetailGlyph({ name: 'summary', size: 15 })
  assert.equal(summaryGlyph.children[0].props.d, 'M2.6 10.8a5.4 5.4 0 0 1 10.8 0', '本周期概览用半圆仪表图标')
  const statsGlyph = harness.DetailGlyph({ name: 'stats', size: 15 })
  assert.equal(statsGlyph.children[0].type, 'rect', '会话统计用带框柱状图标')

  await harness.ready(data)
  const details = harness.view({ t })
  harness.render().actions.revealSession({ sessionId: 's-1' })
  const highlightedDetails = harness.view({ t })
  const highlightedSession = allOf(highlightedDetails, byClass('cs-session'))[0]
  assert.match(highlightedSession?.props?.className ?? '', /is-highlighted/, '目标会话行获得定位高亮')
  await harness.refresh({
    ...data,
    subagentTasks: [{ sessionId: 'a-1', sessionTitle: '子任务一', parentSessionId: 's-1', durationMs: 60_000, start: now - 120_000 }],
  })
  const detailsWithSubagents = harness.view({ t })
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

  search.props.onChange({ target: { value: '会话一' } })
  const searched = harness.view({ t })
  assert.ok(allOf(searched, byClass('cs-session')).length >= 1, '搜索命中时自动展开分组，不把结果藏在折叠工作区里')
  search.props.onChange({ target: { value: '不存在的关键词' } })
  const filtered = harness.view({ t })
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

test('客户端：明细「全部」范围按批次渐进展开会话', async (testContext) => {
  const harness = await createSessionBrowserHarness(testContext, { '旧分组': true })
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
  harness.render().actions.selectRange('all')
  harness.render()
  await harness.ready(data)
  const first = harness.view({ t })
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
  const second = harness.view({ t })
  assert.equal(allOf(second, byClass('cs-session')).length, 16, '再次展开后累计到 16 个')
  assert.match(textOf(allOf(second, byClass('cs-sessions-more'))[0]), /再显示 4 个会话/)
  assert.match(textOf(allOf(second, byClass('cs-sessions-more'))[0]), /已显示 16\/20/)

  allOf(second, byClass('cs-sessions-more'))[0].children[0].props.onClick()
  const done = harness.view({ t })
  assert.equal(allOf(done, byClass('cs-session')).length, 20, '累计超过总数时显示全部')
  assert.equal(allOf(done, byClass('cs-sessions-more')).length, 0, '全部显示后不再出现展开入口')

  harness.render().actions.selectRange('7d')
  harness.render()
  await harness.ready(data)
  const fixedRange = harness.view({ t })
  assert.equal(allOf(fixedRange, byClass('cs-session')).length, 20, '非「全部」范围一次显示全部会话')
  assert.equal(allOf(fixedRange, byClass('cs-sessions-more')).length, 0, '非「全部」范围不做渐进展开')

  harness.render().actions.selectRange('all')
  harness.render()
  await harness.ready(data)
  harness.render().actions.revealSession({ sessionId: 'many-12', workspaceKey: '旧分组' })
  const fallback = harness.view({ t })
  const highlighted = allOf(fallback, byClass('is-highlighted'))[0]
  assert.equal(highlighted?.props['data-session-id'], 'many-12', '回退目标位于后续批次时仍可定位')
  assert.equal(allOf(fallback, byClass('cs-session')).length, 9, '回退只额外展示目标会话')
  const nextBatch = allOf(fallback, byClass('cs-sessions-more'))[0]
  assert.match(textOf(nextBatch), /再显示 7 个会话/)
  allOf(nextBatch, (node) => node.type === 'button')[0].props.onClick()
  assert.equal(allOf(harness.view({ t }), byClass('cs-session')).length, 16, '下一批包含已选会话时不重复渲染')
  harness.render().actions.selectRange('all')
  harness.render().actions.selectSession({ workspaceKey: '之前的分组', sessionId: 'many-19' })
  const withSelection = harness.view({ t })
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
    formatHintSec: '纯秒', formatHintPadded: '补零时钟', formatHintDecimal: '小数小时', formatPreviewLabel: '预览 · 2:48:16 显示为',
    settingsSectionAppearance: '外观与配色', appearanceLabel: '外观',
    appearanceLight: '浅色', appearanceDark: '深色', appearanceSystem: '跟随系统',
    appearanceToggle: '外观：{mode}，点击切换', paletteLabel: '配色',
    paletteToggle: '配色：{name}',
    paletteBlue: '蓝', paletteStone: '石墨灰', paletteCyan: '松石青', paletteCoral: '珊瑚橙',
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
    appearance: 'system', palette: 'cyan', dataBusy: '', dataMessage: null, clearStep: false,
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
  const formatCard = findByClass(tree, 'cs-format-card')
  assert.equal(findByClass(formatCard, 'cs-format-shared'), undefined, '数字格式说明不再占底部一行')
  const formatInfo = findByClass(formatCard, 'cs-row-info')
  assert.ok(findAll(formatInfo, (node) => node.props?.lines?.some((line) => line.includes('侧栏、概览、趋势、会话与导出共用这一格式'))).length)
  for (const cardClass of ['cs-appearance-card', 'cs-notices-card', 'cs-data-card']) {
    const card = findByClass(tree, cardClass)
    assert.ok(hasClass(card, 'cs-settings-info-region'))
    assert.ok(findByClass(card, 'cs-settings-heading-with-info'))
  }
  for (const expected of ['统计与显示', '数字格式', '外观与配色', '初始化设置', '活跃判定阈值', '每周起始', '显示子代理明细', '侧栏显示状态', '侧栏状态点', '状态点位置', '侧栏显示时长', '通知记录', '导出 JSON', '导出 CSV', '选择备份文件导入', '重新显示「近似记录」说明', '清空全部数据']) {
    assert.match(text, new RegExp(expected), `设置页包含「${expected}」`)
  }
  assert.match(text, /未选择文件/, '未选择文件时常显导入状态')
  assert.match(text, /按 ID 去重合并/, '导入说明常显在按钮旁，不再藏进预览')
  assert.match(text, /恢复初始设置/, '设置页提供恢复初始设置入口')
  assert.doesNotMatch(text, /保存设置/, '即点即存后不再有「保存设置」按钮')
  assert.equal(allOf(tree, byClass('cs-format-opt')).length, 6, '六个数字格式选项')
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
  const palettes = allOf(tree, byClass('cs-palette-opt'))
  assert.equal(palettes.length, 4, '配色区可预览四套色板')
  assert.ok(palettes.some((node) => hasClass(node, 'cs-palette-cyan')), '可直接选择青色')
  assert.ok(palettes.some((node) => hasClass(node, 'cs-palette-coral')), '可直接选择珊瑚橙')
  assert.ok(!palettes.some((node) => hasClass(node, 'cs-palette-clay')), '赤陶选项已移除')
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
    const mainMetric = allOf(metrics, byClass('cs-hero-num'))[0]
    assert.equal(textOf(mainMetric).replace(/\s+/g, ''), '5:58:08', '切换周期时主数字缺省为今日在线')
    assert.ok(allOf(mainMetric, byClass('cs-duration-number')).length > 0, '主数字的数值段落带强调色')
    const metricText = textOf(metrics).replace(/\s+/g, '')
    assert.match(metricText, /今日在线时长5:58:08/)
    assert.match(metricText, /今日任务时长1:37:14/)
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
  const heroBody = allOf(page, byClass('cs-hero-focus-body'))[0]
  assert.equal(heroBody.props.retain, undefined, '首屏主体保持挂载，圆环可直接过渡而不是整块重播')
  assert.equal(allOf(heroBody, byClass('cs-hero-num-value')).length, 1, '大数字使用独立的数字渐变层')
  assert.doesNotMatch(textOf(page), /首屏概览/, '放大页标题右侧不再显示「首屏概览」小字')
  assert.equal(textOf(allOf(page, byClass('cs-hero-num'))[0]).trim(), '5:58:08', '大数字缺省显示今日在线')
  const panelText = textOf(allOf(page, byClass('cs-focus-panel'))[0])
  const panelValues = panelText.replace(/\s+/g, '')
  for (const expected of ['在线时长', '任务时长', '今日活跃', '本周活跃', '本月活跃']) {
    assert.match(panelText, new RegExp(expected), `放大页统计面板含「${expected}」`)
  }
  assert.doesNotMatch(panelText, /活跃占比|任务次数/, '不可点的两项不再混在按钮面板里')
  assert.match(textOf(allOf(page, byClass('cs-hero-meta'))[0]), /任务次数/, '任务次数移到只读文字行')
  assert.equal(allOf(page, byClass('cs-share-block')).length, 0, '大数字下方不再保留重复占比块')
  assert.equal(allOf(page, byClass('cs-focus-bar')).length, 0, '圆环已表达占比，不再渲染横条')
  assert.match(panelValues, /5:58:08/, '在线时长')
  assert.match(panelValues, /1:37:14/, '任务时长')
  assert.match(panelValues, /5:51:01/, '本周活跃')
  assert.match(panelValues, /14:14:00/, '本月活跃')
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
  assert.match(textOf(allOf(weekPage, byClass('cs-hero-meta'))[0]).replace(/\s+/g, ''), /本周在线6:56:40/, '周指标副信息跟周期')

  const monthPage = renderHeroFocusPage({
    data: heroSampleData(), t, format: 'hms', onToggleFocus: () => {}, heroMetric: 'month',
  })
  assert.equal(allOf(monthPage, byClass('cs-hero-ring'))[0].props['aria-label'], '本月活跃占比 85%', '月活跃占比使用本月活跃÷本月在线')

  const reduced = await loadClientFunctions({ matchMedia: () => ({ matches: true }) })
  const reducedPage = reduced.renderHeroFocusPage({ data: heroSampleData(), t, format: 'hms', onToggleFocus: () => {} })
  assert.equal(reducedPage.props.style['--cs-focus-ms'], '0ms', '减少动效偏好下直接到位')
})

test('客户端：首屏主指标五个时长项可点切换，非法持久化值回落今日在线时长', async () => {
  const {
    renderHeroFocusPage, renderOverviewView, normalizeHeroMetric, readStoredHeroMetric, writeStoredHeroMetric,
    HERO_METRIC_KEY, HERO_METRIC_LEGACY_KEY,
  } = await loadClientFunctions()
  assert.equal(HERO_METRIC_KEY, 'dsh-timespan.heroMetric.v2')
  assert.equal(HERO_METRIC_LEGACY_KEY, 'dsh-timespan.heroMetric')
  assert.equal(normalizeHeroMetric('week'), 'week')
  for (const value of ['', 'Active', 'other', null, undefined, 0, {}, []]) {
    assert.equal(normalizeHeroMetric(value), 'online', `非法值 ${JSON.stringify(value)} 归一为今日在线`)
  }
  const calls = []
  const fake = { getItem: () => 'month', setItem: (key, value) => calls.push([key, value]) }
  assert.equal(readStoredHeroMetric(fake), 'month')
  assert.equal(readStoredHeroMetric({ getItem: () => 'bogus' }), 'online')
  assert.equal(readStoredHeroMetric({ getItem: () => { throw new Error('denied') } }), 'online')
  assert.equal(readStoredHeroMetric(null), 'online')
  const legacy = (values) => ({ getItem: (key) => values[key] ?? null })
  assert.equal(readStoredHeroMetric(legacy({ 'dsh-timespan.heroMetric': 'active' })), 'online',
    '旧默认「今日活跃」迁移为「今日在线」')
  assert.equal(readStoredHeroMetric(legacy({ 'dsh-timespan.heroMetric': 'task' })), 'task',
    '旧键里的显式选择仍然保留')
  assert.equal(readStoredHeroMetric(legacy({
    'dsh-timespan.heroMetric': 'task', 'dsh-timespan.heroMetric.v2': 'week',
  })), 'week', '新键优先于旧键')
  writeStoredHeroMetric(fake, 'task')
  assert.deepEqual(calls.at(-1), ['dsh-timespan.heroMetric.v2', 'task'])
  writeStoredHeroMetric(fake, 'bogus')
  assert.deepEqual(calls.at(-1), ['dsh-timespan.heroMetric.v2', 'online'], '写入前归一化')
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
    assert.equal(textOf(mainValue).replace(/\s+/g, ''), value, `缩回概览仍显示 ${metric} 的数值`)
    assert.equal(hasClass(mainValue, `is-metric-${metric === 'online' ? 'online' : metric === 'task' ? 'task' : 'active'}`), true, '概览主数字按口径带语义色')
    const mainGlyph = allOf(main, (node) => String(node.type?.name) === 'DetailGlyph')[0]
    assert.equal(mainGlyph?.props?.name, {
      online: 'online', task: 'task', active: 'active', week: 'active-week', month: 'active-month',
    }[metric], '概览主卡图标按周期区分')
    const secondary = findByClass(overview, 'cs-overview-metric-pair')
    assert.equal(allOf(secondary, byClass('is-metric-online')).length, metric === 'online' ? 0 : 1, '副指标按在线/活跃/任务分别带语义色')
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
  assert.deepEqual(
    buttons.map((button) => ['online', 'task', 'active'].find((tone) => hasClass(button, `is-metric-${tone}`))),
    ['online', 'task', 'active', 'active', 'active'],
    '五项读数分别按在线、任务与活跃口径着色',
  )
  const glyphNodes = buttons.map((button) => allOf(button, (node) => String(node.type?.name) === 'DetailGlyph')[0])
  assert.deepEqual(glyphNodes.map((node) => node?.props?.name), ['online', 'task', 'active', 'active-week', 'active-month'],
    '五项读数各有可区分的语义图标')
  const glyphShapes = glyphNodes.map((node) => {
    const svg = node.type(node.props)
    return svg.children.map((shape) => shape.props.d
      ?? `${shape.type}:${shape.props.x},${shape.props.y},${shape.props.width},${shape.props.height}`).join('|')
  })
  assert.equal(new Set(glyphShapes.slice(2)).size, 3, '今日、本周、本月活跃的图标形状互不相同')
  const weekGlyph = glyphNodes[3].type(glyphNodes[3].props)
  assert.equal(weekGlyph.children.length, 1, '本周图标改成单一图形，不再叠加数字 7')
  assert.equal((weekGlyph.children[0].props.d.match(/M/g) || []).length, 7, '本周图标用七根日柱表达一周七天')
  assert.match(glyphShapes[3], /^M1\.3 12\.7V9\.3/, '本周活跃用七根日柱表达')
  assert.doesNotMatch(glyphShapes[3], /h3\.6l-2\.3 5\.3/, '不再在脉冲线上叠加数字 7')
  assert.equal(allOf(page, byClass('cs-fs-item')).length - buttons.length, 0, '统计面板里不再混入不可点的只读项')
  const panel = allOf(page, byClass('cs-focus-panel'))[0]
  assert.equal(allOf(panel, byClass('cs-fs-item')).length, 5, '面板内每项都可点，不误导用户')
  assert.doesNotMatch(textOf(panel), /活跃占比/, '活跃占比不再在按钮面板里重复')
  assert.match(textOf(allOf(page, byClass('cs-hero-meta'))[0]), /任务次数/, '任务次数移到大数字下方只读文字行')
  const weekButton = buttons.filter((button) => textOf(button).includes('本周活跃'))[0]
  weekButton.props.onClick()
  assert.deepEqual(selected, ['week'], '点击请求切换主指标')

  const defaultPage = renderHeroFocusPage(base)
  assert.equal(textOf(allOf(defaultPage, byClass('cs-hero-num'))[0]).trim(), '5:58:08', '缺省回落今日在线')
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
  assert.equal(allOf(normal, byClass('cs-card-icon')).length, 6, '首屏、趋势、构成、热力图、排行、最近会话六个标题左侧各有图标')
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
  assert.match(textOf(focused), /4:00:00/, '放大页主数字缺省来自今日在线')

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
  assert.match(declarationsFor(css, '.cs-card-title'), /gap:\s*4px/, '标题与左侧模块图标收紧间距')
  assert.match(declarationsFor(css, '.cs-card-icon'), /color:\s*var\(--dsw-alias-label-secondary\)/)
})

test('客户端：首屏缩放按钮、圆环与无边框样式，并尊重减少动效', async () => {
  const css = await loadClientCss()
  const { zoomIcon } = await loadClientFunctions()
  const expandIcon = zoomIcon(false)
  const restoreIcon = zoomIcon(true)
  assert.equal((expandIcon.children[0].props.d.match(/M/g) || []).length, 2, '普通态只有两只外角')
  assert.equal((restoreIcon.children[0].props.d.match(/M/g) || []).length, 2, '首屏态沿用两只对角括号，不另加箭头')
  assert.equal(expandIcon.children[0].props.d, 'M9 2h5v5M7 14H2V9', '普通态两只外角指向画布四角')
  assert.equal(restoreIcon.children[0].props.d, 'M10 2v4h4M6 14v-4H2', '首屏态同一对角的括号内收反扣，角指向中心')
  assert.notEqual(expandIcon.children[0].props.d, restoreIcon.children[0].props.d, '放大与缩回图形可区分')
  const zoom = declarationsFor(css, '.cs-zoom-btn')
  assert.match(zoom, /position:\s*absolute/, '按钮固定在卡片右上角')
  assert.match(zoom, /background:\s*transparent/, '无填充')
  assert.match(zoom, /border:\s*0/, '无边框')
  assert.match(declarationsFor(css, '.cs-zoom-btn:hover'), /opacity:\s*1/, '悬浮时按钮完全显现')
  assert.match(declarationsFor(css, '.cs-zoom-btn:hover'), /color:\s*var\(--cs-signal\)/, '悬浮时角标转向信号色')
  assert.match(declarationsFor(css, '.cs-zoom-btn svg'), /stroke:\s*currentColor/, '图标跟随按钮的语义色')
  assert.match(css, /\.cs-zoom-btn:hover svg[^{]*\{[^}]*animation:\s*cs-zoom-open/, '悬浮时四只角括号向外弹开')
  assert.match(css, /@keyframes cs-zoom-open/, '角括号弹开有独立的短促关键帧')
  const number = declarationsFor(css, '.cs-hero-focus .cs-hero-num')
  assert.match(number, /font-size:[^;]+cqw[^;]+svh/, '首屏主数字同时受内容宽度和窗口高度约束')
  assert.match(number, /white-space:\s*nowrap/, '首屏主数字始终单行横排，两位数小时和分钟也不换行')
  assert.doesNotMatch(number, /overflow-wrap:\s*anywhere/, '主数字不再允许在字符间折行')
  assert.doesNotMatch(css, /\.cs-focus-bar/, '大数字下方不再保留占比横条')
  assert.doesNotMatch(css, /\.cs-share-block/, '不再保留重复占比块的样式')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-focus-panel'), /grid-auto-flow:\s*column/, '首屏五项主指标固定横排，不因本月数值变长而竖排')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-focus-panel'), /grid-auto-columns:\s*minmax\(0,\s*1fr\)/, '五项等宽分满一行')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-fs-item b'), /font-size:\s*17px/, '首屏底部五项读数略微缩小，给横排留出余量')
  assert.match(number, /color:\s*var\(--cs-metric-color\)/, '首屏大数字整段使用当前口径色')
  assert.match(number, /transition:\s*color\s+var\(--cs-hero-color-ms,\s*900ms\)[^;]+cubic-bezier/, '切换口径时颜色随读数一起渐变，不瞬间跳色')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-hero-num .cs-duration-number'), /color:\s*inherit/, '首屏大数字的符号与单位跟随数字颜色')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-hero-num.is-metric-online'), /--cs-metric-color:\s*var\(--cs-signal-deep\)/, '在线口径使用信号深阶')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-hero-num.is-metric-active'), /--cs-metric-color:\s*var\(--cs-chart-active\)/, '活跃口径使用活跃状态点色')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-hero-num.is-metric-task'), /--cs-metric-color:\s*var\(--cs-task\)/, '任务口径使用任务紫')
  assert.match(declarationsFor(css, '.cs-cycle-today .cs-hero-num'), /font-size:[^;]+50px/, '概览今日主数字略微放大')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-hero-num.is-long'), /font-size:[^;]+13cqw/, '八字符读数收一档字号')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-hero-num.is-extra-long'), /font-size:[^;]+11\.5cqw/, '更长读数再收一档字号')
  assert.match(declarationsFor(css, '.cs-fs-button b'), /color:\s*var\(--cs-metric-color\)/, '五项小模块读数整段使用各自口径色')
  assert.match(declarationsFor(css, '.cs-fs-item b'), /color:\s*var\(--cs-metric-color, var\(--cs-ink\)\)/, '五项小模块符号与单位跟随数字颜色')
  assert.match(declarationsFor(css, '.cs-fs-button.is-metric-online'), /--cs-metric-color:\s*var\(--cs-signal-deep\)/, '在线小模块使用信号深阶')
  assert.match(declarationsFor(css, '.cs-fs-button.is-metric-active'), /--cs-metric-color:\s*var\(--cs-chart-active\)/, '活跃小模块使用活跃状态点色')
  assert.match(declarationsFor(css, '.cs-fs-button.is-metric-task'), /--cs-metric-color:\s*var\(--cs-task\)/, '任务小模块使用任务紫')
  assert.match(declarationsFor(css, '.cs-fs-button .cs-detail-glyph'), /color:\s*var\(--cs-metric-color\)/, '五项小模块图标与数值同色')
  assert.match(declarationsFor(css, '.cs-overview-metric.is-online'), /--cs-metric-color:\s*var\(--cs-signal-deep\)/, '今日在线副指标使用信号深阶')
  assert.match(declarationsFor(css, '.cs-overview-metric.is-active'), /--cs-metric-color:\s*var\(--cs-chart-active\)/, '今日活跃副指标使用活跃状态点色')
  assert.match(declarationsFor(css, '.cs-overview-metric.is-task'), /--cs-metric-color:\s*var\(--cs-task\)/, '今日任务副指标使用任务紫')
  assert.match(declarationsFor(css, '.cs-overview-metric strong'), /color:\s*var\(--cs-metric-color/, '副指标读数整段使用口径色')
  assert.match(declarationsFor(css, '.cs-overview-metric .cs-detail-glyph'), /color:\s*var\(--cs-metric-color/, '副指标图标与数值使用同一口径色')
  assert.match(declarationsFor(css, '.cs-cycle-today .cs-card-icon'), /color:\s*var\(--cs-metric-color\)/, '概览主卡图标跟随主指标色')
  assert.match(declarationsFor(css, '.cs-hero-focus .cs-focus-panel .cs-fs-item:last-child:nth-child(odd)'), /grid-column:\s*auto/, '窄窗也不让第五项跨列换行')
  assert.doesNotMatch(css, /\.cs-cycle-today\.is-current \.cs-hero-num[^}]*::before/, '概览主数字不再带会随主指标忽隐忽现的左侧装饰线')
  assert.doesNotMatch(declarationsFor(css, '.cs-overview-metric-pair'), /border-left/, '概览副指标区不再和主卡之间拉一条竖线')
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cs-hero-focus/, '减少动效下首屏直接到位')
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.cs-hero-focus \.cs-hero-num[^{]*\{[^}]*transition:\s*none/, '减少动效下颜色也不做渐变')
})

test('客户端：仪表盘图标按钮按语义播放悬停动效', async () => {
  const css = await loadClientCss()
  const timerCss = await loadClientTimerCss()
  // 顶栏外观：太阳转半格、月亮侧倾、系统屏轻抬。
  assert.match(css, /\.cs-appearance-toggle\[data-appearance="light"\]:hover svg[^{]*\{[^}]*rotate\(45deg\)/, '浅色太阳旋转半格')
  assert.match(css, /\.cs-appearance-toggle\[data-appearance="dark"\]:hover svg[^{]*\{[^}]*rotate\(-18deg\)/, '深色月亮侧倾')
  assert.match(css, /\.cs-appearance-toggle\[data-appearance="system"\]:hover svg[^{]*\{[^}]*scale\(1\.12\)/, '跟随系统轻抬放大')
  // 配色按钮：中心色点弹出，外环形成回声。
  assert.match(css, /\.cs-palette-toggle:hover \.cs-palette-signal[^{]*\{[^}]*scale\(1\.24\)/, '配色中心点向外轻弹')
  assert.match(css, /\.cs-palette-toggle::after\s*\{[^}]*inset:\s*2px[^}]*border-radius:\s*6px/, '回声环与按钮同心同圆角')
  assert.match(css, /\.cs-palette-toggle:hover::after[^{]*\{[^}]*scale\(1\)/, '回声环停在边框内侧，不与边框相交')
  // 说明与操作按钮：图标轻抬侧倾；会话检查与打开入口各有方向性动作。
  assert.match(css, /\.cs-info button:hover > svg[^{]*\{[^}]*rotate\(-5deg\)/, '说明图标悬停轻抬侧倾')
  assert.match(css, /\.cs-session-inspect:hover \.cs-detail-glyph[^{]*\{[^}]*scale\(1\.16\)/, '会话预览图标弹起')
  assert.match(css, /\.cs-session-open:hover \.cs-detail-glyph[^{]*\{[^}]*translate\(2px, -2px\)/, '打开会话箭头向右上滑出')
  assert.match(css, /\.cs-inspector-open:hover \.cs-detail-glyph[^{]*\{[^}]*translate\(2px, -2px\)/, '打开会话箭头向右上滑出')
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /\.cs-review-icon\.is-copy:hover > svg rect[^{]*\{[^}]*translate\(1\.4px, -1\.4px\)/, '复制图标抽出前层纸片')
  assert.match(source, /\.cs-review-icon\.is-export:hover > svg[^{]*\{[^}]*translateY\(2px\)/, '导出箭头向下轻点')
  assert.match(source, /cs-review-icon is-copy/, '复制按钮带独立手势标记')
  assert.match(source, /cs-review-icon is-export/, '导出按钮带独立手势标记')
  // 计时入口：指针钟只摆一格。
  assert.match(timerCss, /\.cs-timer-trigger:hover \.cs-detail-glyph[^{]*\{[^}]*animation:\s*cs-clock-tick/, '悬停时指针钟轻摆')
  assert.match(timerCss, /@keyframes cs-clock-tick/, '指针钟摆动使用独立关键帧')
  assert.match(declarationsFor(timerCss, '.cs-timer-trigger:hover:not(.is-pinned)'), /translateY\(-1px\)/, '计时按钮悬停轻抬')
  // 减少动效时全部静止。
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cs-icon-toggle svg/, '减少动效覆盖顶栏图标')
  assert.match(timerCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cs-timer-trigger \.cs-detail-glyph/, '减少动效覆盖计时图标')
})

test('客户端：首屏大数字用数值渐变而不是旧值淡出', async () => {
  const { renderHeroFocusPage, DurationTween, tweenDurationMs, DURATION_TWEEN_MS } = await loadClientFunctions()
  assert.equal(DURATION_TWEEN_MS, 900, '数字渐变用 900ms，慢—快—慢的节奏更明显')
  assert.equal(tweenDurationMs(0, 1_000, 0), 0, '起点保持旧值')
  assert.equal(tweenDurationMs(0, 1_000, 1), 1_000, '终点落到新值')
  assert.equal(tweenDurationMs(0, 1_000, 0.5), 500, '中点平滑经过一半')
  assert.ok(tweenDurationMs(0, 1_000, 0.25) < 100, '五次缓入让起步更慢')
  assert.ok(tweenDurationMs(0, 1_000, 0.75) > 900, '五次缓出让收尾更稳')
  const labels = {
    todayActive: '今日活跃时长', actualOccupied: '实际占用', focusSet: '设为首屏', focusUnset: '退出首屏',
    todayOnline: '今日在线时长', todayTask: '任务时长', taskLabel: '任务', taskCountShort: '任务次数',
    focusTodayActive: '今日活跃', onlineLabel: '在线时长', activeShare: '活跃占比', activeLabel: '活跃',
    taskShare: '任务占比', weekOnline: '本周在线', weekTask: '本周任务', monthOnline: '本月在线', monthTask: '本月任务',
  }
  const t = (key) => labels[key] ?? key
  const page = renderHeroFocusPage({ data: heroSampleData(), t, format: 'hms', heroMetric: 'task', onToggleFocus() {} })
  assert.equal(page.props.style['--cs-hero-color-ms'], '900ms', '大数字颜色渐变与 DurationTween 共用同一时长')
  const number = allOf(page, byClass('cs-hero-num-value'))[0]
  assert.equal(number.type, DurationTween, '大数字交给数字渐变组件')
  assert.equal(number.props.identity, 'task')
  assert.equal(number.props.value, 5_834_000)
  assert.equal(number.props.format, 'hms')
  assert.equal(textOf(number).trim(), '1:37:14', '首帧仍显示目标读数，测试替身不跑逐帧动画')
  assert.equal(String(allOf(page, byClass('cs-hero-num'))[0].props.className), 'cs-hero-num is-metric-task', '七字符读数保持基础字号并带任务色类')
  const onlinePage = renderHeroFocusPage({ data: heroSampleData(), t, format: 'hms', heroMetric: 'online', onToggleFocus() {} })
  assert.equal(String(allOf(onlinePage, byClass('cs-hero-num'))[0].props.className), 'cs-hero-num is-metric-online', '在线指标使用自己的语义色类')
  const monthPage = renderHeroFocusPage({ data: heroSampleData(), t, format: 'hms', heroMetric: 'month', onToggleFocus() {} })
  assert.match(String(allOf(monthPage, byClass('cs-hero-num'))[0].props.className), /is-long/, '八字符读数按长读数收字号')
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
  const { renderDailyHeatmap, renderHeatmapFocusPage, Info } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日活跃', heatmapFocusTitle: '每日活跃热力图',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '累计活跃 {active} · {activeDays}/{observedDays} 天有活跃',
    rangeOnline: '累计在线', rangeActive: '累计活跃', rangeTask: '累计任务',
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
  const fullInfo = allOf(full, (node) => node.type === Info)[0]
  const fullSummary = findByClass(fullInfo.props.content, 'cs-heat-legend-summary')
  const fullSummaryText = textOf(fullSummary)
  assert.match(fullSummaryText, /活跃天数/)
  assert.match(fullSummaryText, /7\/9/, '整段查询直接使用 Host 的 activeDays/observedDays')
  assert.match(fullSummaryText, /累计活跃/)
  assert.match(fullSummaryText, /24:00:00/, '整段查询直接使用 Host 的 activeMs')
  assert.match(fullSummary.props['aria-label'], /累计活跃 24:00:00/, '说明文字仍保留完整口径')
  assert.match(fullSummary.props['aria-label'], /7\/9 天有活跃/, '覆盖度徽标的可读名称包含有活跃天数')
  assert.equal(allOf(full, byClass('heat-summary')).length, 0, '页面内不再出现独立汇总行')

  const focus = renderHeatmapFocusPage(common)
  const panel = textOf(findByClass(focus, 'heat-focus-panel'))
  assert.match(panel, /累计活跃 24:00:00/, '首屏范围活跃复用 Host summary')
  assert.match(panel, /7\/9/, '首屏活跃天数复用 Host summary')
  assert.match(panel, /2月1日 · 24:00:00/, 'Host 峰值映射为 peakDay 并显示对应日期')
  assert.equal(allOf(focus, (node) => node.type === Info).some((node) => findByClass(node.props.content, 'cs-heat-legend-summary')), false, '首屏不重复普通范围汇总')

  const filtered = renderDailyHeatmap({ ...common, rangeValue: 2 })
  const filteredSummary = textOf(findByClass(
    allOf(filtered, (node) => node.type === Info)[0].props.content, 'cs-heat-legend-summary'))
  assert.match(filteredSummary, /累计活跃/)
  assert.match(filteredSummary, /2:00:00/, '单月过滤后按 scopedDays 客户端求和')
  assert.match(filteredSummary, /1\/1/)
  assert.doesNotMatch(filteredSummary, /24:00:00/, '过滤范围不复用整段 Host summary')
})

test('客户端热力图：离开后返回同一范围保留已显示数据，刷新失败也不闪回空态', async (t) => {
  const requests = []
  const { React, useDailySeries } = await loadClientFunctions({}, { setInterval: () => 1, clearInterval() {} })
  const ctx = { get: () => ({ rpc: { call(_path, _channel, request) {
    assert.equal(request.method, 'queryDailySeries')
    return new Promise((resolve) => requests.push(resolve))
  } } }) }
  let enabled = true
  let nonce = 0
  const range = { from: 1000, to: 2000 }
  const snapshot = { range, days: [{ dateKey: '2026-11-16', activeMs: 100 }] }
  const render = () => {
    const state = React.render(() => useDailySeries(ctx, range, 10000, nonce, enabled))
    React.flushEffects()
    return state
  }
  t.after(() => React.unmount())
  render()
  requests[0]({ ok: true, value: snapshot })
  await new Promise(setImmediate)
  assert.equal(render().data, snapshot)
  enabled = false
  render()
  enabled = true
  assert.equal(render().data, snapshot, '返回概览的首帧保留同范围快照')
  assert.equal(render().data, snapshot, '恢复取数后也不清空热力格')
  assert.equal(requests.length, 2, '返回后仍然请求最新数据')
  requests[1]({ ok: false })
  await new Promise(setImmediate)
  const failed = render()
  assert.equal(failed.status, 'error')
  assert.equal(failed.data, snapshot, '刷新失败保留已有内容')
  nonce++
  assert.equal(render().data, snapshot)
  const nextSnapshot = { ...snapshot, days: [{ ...snapshot.days[0], activeMs: 200 }] }
  requests[2]({ ok: true, value: nextSnapshot })
  await new Promise(setImmediate)
  assert.equal(render().data, nextSnapshot, '成功刷新更新实际数值')
})

test('客户端热力图：更换范围的首帧不呈现旧数据，迟到响应不会覆盖新范围', async (t) => {
  const requests = []
  const { React, useDailySeries } = await loadClientFunctions({}, { setInterval: () => 1, clearInterval() {} })
  const ctx = { get: () => ({ rpc: { call(_path, _channel, request) {
    return new Promise((resolve) => requests.push({ range: request.payload, resolve }))
  } } }) }
  let range = { from: 1000, to: 2000 }
  const render = () => {
    const state = React.render(() => useDailySeries(ctx, range, 10000, 0, true))
    React.flushEffects()
    return state
  }
  t.after(() => React.unmount())
  render()
  requests[0].resolve({ ok: true, value: { range, days: [] } })
  await new Promise(setImmediate)
  assert.equal(render().status, 'ready')
  range = { from: 2000, to: 3000 }
  assert.equal(render().data, null, '更换范围的首次渲染即隐藏旧序列')
  range = { from: 3000, to: 4000 }
  render()
  requests[1].resolve({ ok: true, value: { range: requests[1].range, days: [] } })
  await new Promise(setImmediate)
  assert.equal(render().data, null, '上一范围的迟到响应不再生效')
  const snapshot = { range, days: [] }
  requests[2].resolve({ ok: true, value: snapshot })
  await new Promise(setImmediate)
  assert.equal(render().data, snapshot)
})

test('客户端：热力图首屏独立页给出六项范围统计、12 个月度条与退出按钮', async () => {
  const { renderHeatmapFocusPage, Select } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日活跃', heatmapFocusTitle: '每日活跃热力图',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', monthBars: '月度活跃', periodDay: '日',
    onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务', noRecord: '无记录',
    heatDayTitle: '{month}月{day}日',
    rangeOnline: '累计在线', rangeActive: '累计活跃', rangeTask: '累计任务',
    peakDay: '最活跃日', activeDaysLabel: '活跃天数', dailyAverageActive: '日均活跃',
    focusSet: '设为首屏', focusUnset: '退出首屏', focusSummary: '首屏概览',
    heatSummary: '累计活跃 {active} · {activeDays}/{observedDays} 天有活跃',
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
  for (const expected of ['累计在线', '累计活跃', '累计任务', '最活跃日', '活跃天数', '日均活跃']) {
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

test('客户端：首屏月度条沿用热力图色阶并按峰值分级生长', async () => {
  const { renderMonthBars, ChartReveal, React } = await loadClientFunctions()
  const t = (key) => ({ monthBars: '月度活跃', activeLabel: '活跃' })[key] ?? key
  const bars = [
    { month: 0, abbr: '1月', activeMs: 10 * 3_600_000 },
    { month: 1, abbr: '2月', activeMs: 8 * 3_600_000 },
    { month: 2, abbr: '3月', activeMs: 2 * 3_600_000 },
    { month: 3, abbr: '4月', activeMs: 0 },
  ]
  const tree = renderMonthBars(bars, t, 'hms', 'heat-month-bars heat-focus-month-bars')
  assert.equal(tree.type, ChartReveal, '整组月度条走统一入场容器')
  assert.equal(tree.props.threshold, .4, '下半区露出足够多再触发生长')
  assert.equal(tree.props.className, 'heat-month-bars heat-focus-month-bars')
  assert.equal(tree.props.role, 'group')
  assert.equal(tree.props['aria-label'], '月度活跃')
  const rows = allOf(tree, byClass('heat-month-bar'))
  assert.deepEqual(rows.map((row) => row.props.className), [
    'heat-month-bar is-level-5',
    'heat-month-bar is-level-4',
    'heat-month-bar is-level-1',
    'heat-month-bar is-level-0',
  ], '峰值月用最深一级，其余月份按 0–5 级热力色阶分级')
  assert.deepEqual(rows.map((row) => row.props.style.height), ['100%', '80%', '20%', '0%'], '高度仍按峰值比例')
  assert.deepEqual(
    rows.map((row) => row.props.style['--cs-chart-delay']),
    ['0ms', '60ms', '120ms', '180ms'],
    '月度条按顺序错开生长')
  for (const row of rows) {
    const fill = row.children.filter(Boolean)[0]
    assert.match(fill.props.className, /\bcs-reveal-y\b/, '填充条使用与其他柱状图相同的向上生长动画')
  }
  const rendered = React.render(ChartReveal, { ...tree.props })
  assert.match(rendered.props['data-chart-reveal'], /^(visible|pending)$/)
  const css = await loadClientCss()
  for (let level = 0; level <= 5; level += 1) {
    assert.match(
      declarationsFor(css, `.heat-month-bar.is-level-${level} .cs-month-fill`),
      new RegExp(`background:\\s*var\\(--cs-heat-${level}\\)`),
      `第 ${level} 级月度条与每日热力图共用 --cs-heat-${level}`)
  }
  assert.match(
    declarationsFor(css, '.cs-heatmap-focus .heat-month-bars .cs-reveal-y'),
    /animation-delay:\s*calc\(200ms \+ var\(--cs-chart-delay, 0ms\)\)/,
    '首屏淡入结束后再开始逐月生长，避免入场被转场盖住')
})

test('客户端：热力图卡片含月份刻度、星期标签与色带浮层', async () => {
  const { renderDailyHeatmap, renderOverviewView, Info } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日活跃', heatLegendLabel: '活跃程度图例', heatLegendLow: '低', heatLegendHigh: '高',
    periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '累计活跃 {active} · {activeDays}/{observedDays} 天有活跃',
    rangeActive: '累计活跃', activeDaysLabel: '活跃天数',
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
  const titleInfos = findAll(tree, (node) => node.type === Info)
  assert.equal(titleInfos.length, 1, '标题只保留左侧一个说明入口，右侧感叹号已移除')
  const titleInfo = titleInfos[0]
  assert.equal(titleInfo.props.message, '活跃程度图例', '悬停入口改为活跃程度图例')
  assert.equal(titleInfo.props.icon.props?.name, 'heat', '左侧仍是热力图模块图标')
  assert.equal(titleInfo.props.delay, 600, '停留片刻才浮出，避免扫过时闪动')
  assert.ok(findByClass(titleInfo.props.content, 'cs-heat-legend'), '浮层内容为原感叹号里的浅→深色带')
  assert.equal(findAllByClass(titleInfo.props.content, 'cs-heat-legend-swatch').length, 6, '色带覆盖六个热力等级')

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

  const summary = findByClass(titleInfo.props.content, 'cs-heat-legend-summary')
  assert.ok(summary, '范围汇总收进模块图标的说明浮层')
  assert.equal(allOf(tree, byClass('heat-summary')).length, 0, '页面内不再单独占据一行')
  assert.ok(findByClass(titleInfo.props.content, 'cs-heat-legend-row'), '浮层同时保留低→高色带')
  const summaryText = textOf(summary)
  assert.match(summaryText, /活跃天数/)
  assert.match(summaryText, /21\/21/)
  assert.match(summaryText, /累计活跃/)
  assert.match(summaryText, /21:00:00/)
  assert.doesNotMatch(summaryText, /天有活跃$/, '浮层内也不用句读式的整行文案')
  const summaryRing = findByClass(summary, 'cs-heat-legend-ring')
  assert.ok(summaryRing, '覆盖度读数包含圆环')
  assert.equal(summaryRing.props.style['--cs-heat-coverage'], '360deg', '21/21 天有活跃时圆环完整')
  assert.match(summary.props['aria-label'], /累计活跃 21:00:00 · 21\/21 天有活跃/, '浮层汇总仍给出完整口径')

  const noObservations = renderDailyHeatmap({
    ...{ series: { range, days: [{ ...series.days[0], activeMs: 0, hasObservations: false }] }, status: 'ready', t, format: 'hms', nowMs: range.from, hoverTip },
    rangeValue: '3m',
  })
  const noObservationsInfo = allOf(noObservations, (node) => node.type === Info)[0]
  assert.equal(findByClass(noObservationsInfo.props.content, 'cs-heat-legend-summary'), undefined, '没有观测日时浮层不显示 0/0 汇总')

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
  const normalCard = declarationsFor(css, '.cs-heatmap-card:not(.cs-heatmap-focus)')
  assert.match(normalCard, /container-type:\s*inline-size/, '普通概览热力卡按自身宽度计算格子')
  assert.match(normalCard, /--cs-heat-cell:[^;]+100cqw[^;]+14/, '普通概览以近 3 个月的 14 周为基准统一格子尺寸')
  assert.match(declarationsFor(css, '.heat-month'), /width:\s*calc\(7 \* var\(--cs-heat-cell\)/, '单月日历按同一格子尺寸收窄，不再撑满卡宽')
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

test('客户端：近半年滚动时星期列固定在左侧，单月按卡宽铺成正方形', async () => {
  const css = await loadClientCss()
  const body = declarationsFor(css, '.heatmap-body:not(.is-year)')
  assert.match(body, /gap:\s*0/, '星期列的间距并入固定列，滚动宽度保持不变')
  const sticky = declarationsFor(css, '.heatmap-body:not(.is-year) .heat-weekdays')
  assert.match(sticky, /position:\s*sticky/, '星期刻度钉在横向滚动视口内')
  assert.match(sticky, /left:\s*0/, '星期刻度固定在左缘')
  assert.match(sticky, /padding-right:\s*8px/, '固定列自带与网格的间距')
  assert.match(sticky, /background:\s*var\(--dsw-alias-bg-layer-1\)/, '固定列用卡片底色遮住滑过的格子')

  const month = declarationsFor(css, '.cs-heatmap-card[data-layout="month"]:not(.cs-heatmap-focus) .heat-month')
  assert.match(month, /width:\s*100%/, '普通概览的单月铺满卡片宽度')
  assert.match(month, /max-width:\s*260px/, '单月留出可读上限，六行正方形日历仍落在首屏内')
  const monthGrid = declarationsFor(css, '.cs-heatmap-card[data-layout="month"]:not(.cs-heatmap-focus) .heat-month-grid')
  assert.match(monthGrid, /grid-auto-rows:\s*auto/, '单月行高由正方形格子决定，不再压成横条')
  assert.doesNotMatch(monthGrid, /height:\s*calc/, '单月网格不再固定成周网格的总高')
  const monthCell = declarationsFor(css, '.cs-heatmap-card[data-layout="month"]:not(.cs-heatmap-focus) .heat-month .heat-cell')
  assert.match(monthCell, /aspect-ratio:\s*1/, '单月格子保持正方形')
  assert.doesNotMatch(monthCell, /aspect-ratio:\s*auto/)

  const legend = declarationsFor(css, '.cs-heat-legend')
  assert.match(legend, /flex-direction:\s*column/, '带汇总时浮层纵排：色带在上、读数在下')
  const legendRow = declarationsFor(css, '.cs-heat-legend-row')
  assert.match(legendRow, /display:\s*inline-flex/, '色带仍按一行横排')
  const summary = declarationsFor(css, '.cs-heat-legend-summary')
  assert.doesNotMatch(summary, /flex:\s*1 0 100%/, '浮层汇总不再占据页面整行')
  assert.match(summary, /padding-top:\s*8px/, '色带与读数之间留出间距')
  assert.match(summary, /border-top:\s*1px/, '读数与色带之间用细线分隔')
  const ring = declarationsFor(css, '.cs-heat-legend-ring')
  assert.match(ring, /conic-gradient\(var\(--cs-chart-active\)/, '圆环用活跃色表示有活跃天数占比')
  assert.match(ring, /mask:\s*radial-gradient/, '圆环中心镂空')
  const stat = declarationsFor(css, '.cs-heat-legend-stat')
  assert.match(stat, /flex-direction:\s*column/, '每份读数按标签在上、数值在下排列')
})

test('客户端：热力图汇总改用累计口径', async () => {
  const { translate } = await loadClientFunctions()
  assert.equal(translate('rangeOnline'), '累计在线')
  assert.equal(translate('rangeActive'), '累计活跃')
  assert.equal(translate('rangeTask'), '累计任务')
  assert.match(translate('heatSummary'), /^累计活跃 \{active\} · \{activeDays\}\/\{observedDays\} 天有活跃$/)
  assert.doesNotMatch(translate('heatSummary'), /范围活跃/, '不再使用含义不清的「范围活跃」')
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
  const tallest = Math.max(...bars.map((bar) => bar.props['data-bar-height']))
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

test('客户端：投入节奏按实际高度绘制，概览补足窗口底部留白', async () => {
  const css = await loadClientCss()
  const analysisCss = await loadAnalysisCss()
  assert.match(declarationsFor(analysisCss, '.cs-review-chart-fit'), /flex:\s*1 1 auto/, '回顾图表容器跟随卡片高度')
  assert.match(
    css,
    /--cs-overview-room:\s*clamp\(0px, calc\(\(100vh - 694px\) \* 1\.2\), 200px\)/,
    '概览把窗口剩余高度分配给图表与行距')
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
    heatSummary: '累计活跃 {active} · {activeDays}/{observedDays} 天有活跃',
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
  const { renderDailyHeatmap, Info } = await loadClientFunctions()
  const labels = {
    heatmapTitle: '每日活跃', monthHeatTitle: '{month}每日活跃',
    heatRangeLabel: '统计范围', heatRange3m: '近3个月', heatRange6m: '近半年', heatRangeYear: '全年',
    heatRangeMonth: '{month}', periodDay: '日', onlineLabel: '在线时长', activeLabel: '活跃', taskLabel: '任务',
    noRecord: '无记录', heatDayTitle: '{month}月{day}日',
    heatSummary: '累计活跃 {active} · {activeDays}/{observedDays} 天有活跃',
    rangeActive: '累计活跃', activeDaysLabel: '活跃天数',
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
  const summary = findByClass(allOf(tree, (node) => node.type === Info)[0].props.content, 'cs-heat-legend-summary')
  assert.ok(summary, '模块图标浮层里有覆盖度读数')
  const summaryText = textOf(summary)
  assert.match(summaryText, /活跃天数/)
  assert.match(summaryText, /21\/21/)
  assert.match(summaryText, /累计活跃/)
  assert.match(summaryText, /21:00:00/, '汇总只累加本月有观测的 21 天，不含相邻月份')
  assert.doesNotMatch(summaryText, /100:00:00/, '相邻月份的大数值不混入本月汇总')
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
    heatSummary: '累计活跃 {active} · {activeDays}/{observedDays} 天有活跃',
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
  assert.match(css, /\.cs-fs-item\.is-current \+ \.cs-fs-item\s*\{[^}]*border-left-color:\s*transparent/, '选中项右侧邻项的竖线也隐藏')
  assert.match(declarationsFor(css, '.heat-focus-bars'), /min-height:\s*96px/, '月度条区保持完整高度')
  assert.match(declarationsFor(css, '.cs-heatmap-focus .heat-month-bars'), /height:[^;]+svh/, '月度条随窗高调整')
  assert.match(declarationsFor(css, '.heat-focus-layout.is-year .heat-focus-bars'), /height:[^;]+svh/, '全年格子按宽度定高，月度条随窗高放大')
  assert.match(css, /@container cs-overview \(max-width: 680px\)\s*\{[\s\S]*?\.heat-focus-bottom\s*\{[^}]*grid-template-columns:\s*1fr/, '内容区较窄时下半区回落单列')
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.cs-heatmap-focus-page/, '减少动效下首屏直接到位')
  assert.match(declarationsFor(css, '.cs-hero-ring'), /aspect-ratio:\s*1/, 'hero 右栏圆环保持正圆')
  assert.match(declarationsFor(css, '.cs-hero-ring-value'), /stroke:\s*var\(--cs-chart-active\)/, '圆环与活跃状态点共用同一图形色')
  assert.match(declarationsFor(css, '.cs-hero-ring-legend'), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, '圆环图例双列排布')
  assert.match(declarationsFor(css, '.cs-hero-ring-legend-item i'), /background:\s*var\(--cs-chart-active\)/, '图例色块与圆环共用活跃状态色')
  assert.match(declarationsFor(css, '.cs-live.is-live.is-active .cs-dot'), /background:\s*var\(--cs-chart-active\)/, '首屏圆环与顶栏活跃状态点使用同一 token')
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
    heatSummary: '累计活跃 {active} · {activeDays}/{observedDays} 天有活跃',
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
    heatSummary: 'Total active {active} · Active on {activeDays}/{observedDays} days',
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
  assert.match(css, /\.cs-palette-toggle svg \.cs-palette-signal/, '循环图标用当前配色的活跃状态点色圆点表当前值')
  assert.match(css, /\.cs-palette-toggle svg \.cs-palette-ring/, '循环图标外围是白色圆环')
  assert.match(css, /\.cs-palette-ring[^}]*stroke:\s*#fff/, '白色圆环不随配色变化')
  assert.doesNotMatch(css, /\.cs-palette-dot/, '不再用三枚小色点编码当前套')
  const timerCss = await loadClientTimerCss()
  assert.match(declarationsFor(timerCss, '.cs-timer-trigger .cs-detail-glyph path'),
    /stroke:\s*var\(--cs-chart-active,\s*var\(--timer-text-accent\)\)/, '时钟指针跟随当前配色的活跃状态点')
})


test('客户端：会话浏览的筛选、排序与选择始终基于同一份快照', async (testContext) => {
  const harness = await createSessionBrowserHarness(testContext)
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
  let browser = await harness.ready({ workspaces })
  assert.equal(browser.model.session.sessionId, 'two', '没有显式选择时预览第一条')
  browser.actions.sort('task')
  browser = harness.render()
  assert.equal(browser.model.rows[0].sessions[0].sessionId, 'one')
  browser.actions.selectSession({ workspaceKey: 'lab', sessionId: 'one' })
  assert.equal(harness.render().model.session.sessionTitle, '另一条日志', '同 ID 优先采用指定工作区')
  browser.actions.filter('running')
  browser = harness.render()
  assert.equal(browser.model.rows.length, 1)
  assert.equal(browser.model.rows[0].sessions[0].sessionId, 'two')
  assert.deepEqual(JSON.parse(JSON.stringify(browser.model.summary)), { sessionCount: 1, activeMs: 50, taskMs: 10, taskCount: 1, runningCount: 1 })
  assert.equal(browser.model.session, null, '显式选择被筛选隐藏时不自动改选')
  assert.match(textOf(harness.view()), /所选会话不在当前筛选结果中/)
  browser.actions.filter('all')
  browser.actions.search('主工作区')
  assert.equal(harness.render().model.rows[0].sessions.length, 2)
  browser.actions.search('不存在')
  assert.equal(harness.render().model.rows.length, 0)
  browser.actions.search('')
  assert.equal(harness.render().model.session.workspaceKey, 'lab', '撤销筛选后恢复显式选择')
  browser.actions.sort('active')
  assert.equal(harness.render().model.rows[0].sessions[0].sessionId, 'two')
  assert.equal(harness.render().model.session.workspaceKey, 'lab', '排序保留显式选择')
  assert.equal(JSON.stringify(workspaces), original)
})

test('客户端：列表只切换统计，右侧打开会话，收起一组保留其余展开状态', async (testContext) => {
  const harness = await createSessionBrowserHarness(testContext)
  const opened = []
  const session = { sessionId: 'real-one', hasSessionId: true, sessionTitle: '真实会话', activeMs: 60_000, taskMs: 120_000, taskCount: 1, modelMs: 60_000, toolMs: 30_000, waitMs: 0, otherMs: 0, lastActivityAt: 10 }
  const data = { workspaces: [{ key: 'one', workspaceTitle: '工作区一', sessions: [session] }, { key: 'two', workspaceTitle: '工作区二', sessions: [{ ...session, sessionId: 'real-two' }] }], range: { from: 1, to: 100 } }
  await harness.ready(data)
  let inspected = 0
  const tree = harness.view({ durationFormat: 'short', onOpenSession: value => opened.push(value), onInspectSession: () => inspected++ })
  const openButton = allOf(tree, byClass('cs-session-open'))[0]
  assert.ok(openButton, '行尾改为打开宿主会话入口')
  assert.equal(openButton.props['aria-label'], `${harness.translate('openSession')}：真实会话`)
  assert.equal(allOf(openButton, (node) => node.type === harness.DetailGlyph)[0].props.name, 'open', '打开入口使用斜向箭头')
  assert.equal(harness.render().model.selection, null, '打开入口不切换统计选择')
  let stopped = 0
  openButton.props.onClick({ stopPropagation() { stopped++ } })
  assert.equal(opened[0].sessionId, 'real-one')
  assert.equal(stopped, 1)
  const row = allOf(tree, byClass('cs-session'))[0]
  assert.equal(allOf(row, byClass('cs-session-title'))[0].props.onClick, undefined)
  row.props.onClick()
  assert.equal(harness.render().model.selection.workspaceKey, 'one')
  assert.equal(inspected, 1, '标题点击冒泡到行后仍只切换统计')
  assert.equal(opened.length, 1)
  allOf(tree, byClass('cs-inspector-open'))[0].props.onClick()
  assert.equal(opened[1].sessionId, 'real-one')
  assert.equal(opened[1].workspaceKey, 'one', '宿主失败回退时保留所属工作区')
  allOf(tree, byClass('cs-workspace-head'))[0].props.onClick()
  assert.equal(harness.render().model.expanded.one, false)
  assert.equal(harness.render().model.expanded.two, true)
  allOf(tree, byClass('cs-workspace-head'))[1].props.onClick()
  assert.equal(harness.render().model.expanded.one, false, '同一帧连续收起时不覆盖前一次操作')
  assert.equal(harness.render().model.expanded.two, false)
  harness.render().actions.toggleAll()
  assert.equal(harness.render().model.allOpen, true)
  harness.render().actions.toggleAll()
  assert.equal(allOf(harness.view(), byClass('cs-session')).length, 0, '全 false 是明确收起，不退回默认展开')
  assert.match(textOf(allOf(tree, byClass('cs-session-inspector'))[0]), /未拆分/, '已知构成与历史未拆分时长同时可见')
  const inspector = allOf(tree, byClass('cs-session-inspector'))[0]
  const inspectorInfo = allOf(inspector, (node) => node.type === harness.Info)[0]
  assert.ok(inspectorInfo, '会话统计的说明入口保留')
  assert.equal(inspectorInfo.props.message, harness.translate('compositionInfo'), '说明内容与原感叹号一致')
  assert.equal(inspectorInfo.props.icon.props.name, 'stats', '会话统计使用统计柱图标')
  assert.equal(inspectorInfo.props.delay, 600)
  assert.equal(inspectorInfo.props.buttonClassName, 'cs-card-icon-btn', '沿用模块图标的悬停动效与说明底板')
  const inspectorLabel = allOf(inspector, byClass('cs-inspector-label'))[0]
  assert.equal(allOf(inspectorLabel, (node) => node.type === harness.Info).length, 1, '标题右侧不再单独放感叹号')
  const inspectorIcon = allOf(inspectorLabel, byClass('cs-card-icon'))[0]
  assert.equal(allOf(inspectorIcon, (node) => node.type === harness.Info)[0], inspectorInfo, '说明入口位于标题左侧图标')
})

test('客户端：会话范围加载、失败与重试不展示上一范围的记录', async (testContext) => {
  const harness = await createSessionBrowserHarness(testContext)
  const { translate } = harness
  const data = { workspaces: [{ key: 'old', sessions: [{ sessionId: 'old', sessionTitle: '上一范围的会话', taskRunning: true }] }] }
  await harness.ready(data)
  const filter = allOf(harness.view(), byClass('cs-details-filter'))[0]
  assert.equal(textOf(allOf(filter, (node) => node.type === 'button')[1]), `${translate('detailsRunning')} 1`)
  harness.render().actions.selectRange('7d')
  for (const status of ['loading', 'error']) {
    if (status === 'error') await harness.fail()
    assert.equal(harness.render().model.loadStatus, status)
    const tree = harness.view()
    assert.doesNotMatch(textOf(tree), /上一范围的会话/)
    assert.equal(allOf(tree, byClass('cs-record-columns')).length, 0)
    const filter = allOf(tree, byClass('cs-details-filter'))[0]
    assert.equal(textOf(allOf(filter, (node) => node.type === 'button')[1]), translate('detailsRunning'))
    if (status === 'error') {
      const before = harness.requests.length
      allOf(tree, node => node.type === 'button' && textOf(node) === translate('settingsRetry'))[0].props.onClick()
      harness.render()
      assert.equal(harness.requests.length, before + 1, '重试从真实入口重新读取当前范围')
    }
  }
  await harness.ready({ workspaces: [] })
  assert.equal(harness.render().model.loadStatus, 'ready')
})

test('客户端：会话范围与顶部周期在首帧同步，旧范围迟到响应无效', async (testContext) => {
  const harness = await createSessionBrowserHarness(testContext)
  const data = sampleDashboardData()
  await harness.ready(data)
  const original = harness.render().actions
  original.selectRange('all')
  harness.render()
  const allRequest = harness.requests.length - 1
  await harness.ready(data)
  harness.render().actions.showMore('ws-1')
  harness.render().actions.selectSession({ workspaceKey: 'ws-1', sessionId: 's-1' })
  assert.equal(harness.render().actions.openRange({ from: 0, to: 3600000 }), true)
  let browser = harness.render()
  const customRequest = harness.requests.length - 1
  assert.equal(harness.requests[customRequest].payload.from, 0)
  assert.equal(harness.requests[customRequest].payload.to, 3600000)
  assert.equal(browser.model.selection, null)
  assert.equal(Object.keys(browser.model.visibleSessionCounts).length, 0)
  browser.actions.search('保留查询')
  browser.actions.sort('active')
  const before = harness.requests.length
  browser = harness.setOptions({ period: 'week' })
  assert.equal(browser.model.loadStatus, 'loading')
  assert.equal(browser.model.rows.length, 0)
  assert.equal(browser.model.customRange, null)
  assert.equal(browser.model.detailsRange, '7d')
  assert.equal(browser.model.query, '保留查询')
  assert.equal(browser.model.sort, 'active')
  assert.equal(harness.requests.length, before + 1, '周期变化只发新预设请求，不先补发旧临时时段')
  assert.equal(harness.requests.at(-1).payload.from, harness.resolveDetailsRange('7d', Date.now()).from)
  assert.equal('to' in harness.requests.at(-1).payload, false, '预设终点由 Host 决定')
  await harness.ready({ workspaces: [{ key: 'week', workspaceTitle: '保留查询', sessions: [{ sessionId: 'new', sessionTitle: '本周响应' }] }] })
  await harness.respond(customRequest, data)
  assert.equal(harness.render().model.rows[0].key, 'week', '上一范围晚到不会覆盖本周结果')
  assert.equal(harness.requests[allRequest].payload.from, 0)
  assert.equal('to' in harness.requests[allRequest].payload, false)
  assert.equal(harness.render().actions.openRange({ from: 10, to: 10 }), false)
  browser.actions.selectRange('30d')
  browser = harness.render()
  assert.equal(browser.model.customRange, null)
  assert.equal(browser.model.detailsRange, '30d')
})

test('客户端：会话筛选展开命中分组，明确收起与存储失败均不丢失浏览状态', async (testContext) => {
  const harness = await createSessionBrowserHarness(testContext, { 已删除分组: true })
  const workspaces = ['甲', '乙', '丙'].map((name) => ({ key: name, workspaceTitle: name, sessions: [
    { sessionId: name, sessionTitle: `命中${name}`, taskRunning: true },
  ] }))
  let browser = await harness.ready({ workspaces })
  assert.deepEqual(Object.keys(browser.model.expanded), ['甲', '乙'], '失效的旧分组不会挡住默认展开')
  browser.actions.search('命中')
  browser = harness.render()
  assert.equal(browser.model.allOpen, true)
  browser.actions.toggleWorkspace('乙')
  browser = harness.render()
  assert.equal(browser.model.expanded.乙, false)
  assert.equal(browser.model.expanded.丙, true)
  assert.equal(JSON.parse(harness.stored.get('dsh-timespan.expanded')).乙, false)
  browser.actions.filter('running')
  assert.equal(harness.render().model.expanded.乙, true, '筛选变化重新展开命中结果')
  harness.stored.set = () => { throw new Error('存储不可写') }
  harness.render().actions.toggleWorkspace('甲')
  assert.equal(harness.render().model.expanded.甲, false, '持久化失败不回滚本次浏览操作')
})

test('客户端：会话选择随真实 ID 换组，占位会话不会跨组匹配', async (testContext) => {
  const harness = await createSessionBrowserHarness(testContext)
  let browser = await harness.ready({ workspaces: [
    { key: 'old', sessions: [{ sessionId: 'real', sessionTitle: '真实会话' }] },
    { key: 'placeholder-a', sessions: [{ sessionTitle: '未归属甲' }] },
    { key: 'placeholder-b', sessions: [{ sessionTitle: '未归属乙' }] },
  ] })
  browser.actions.selectSession({ workspaceKey: 'old', sessionId: 'real' })
  browser = await harness.refresh({ workspaces: [
    { key: 'new', sessions: [{ sessionId: 'real', sessionTitle: '新归属' }] },
    { key: 'placeholder-a', sessions: [{ sessionTitle: '未归属甲' }] },
    { key: 'placeholder-b', sessions: [{ sessionTitle: '未归属乙' }] },
  ] })
  assert.equal(browser.model.session.workspaceKey, 'new')
  browser.actions.selectSession({ workspaceKey: 'placeholder-a', sessionId: '__unassigned_active_0' })
  browser = harness.render()
  assert.equal(browser.model.session.sessionTitle, '未归属甲')
  assert.equal(browser.actions.revealSession(browser.model.session), false)
  assert.equal(allOf(harness.view(), byClass('cs-inspector-open')).length, 0, '占位会话只能预览统计')
  await harness.refresh({ workspaces: [{ key: 'placeholder-b', sessions: [{ sessionTitle: '未归属乙' }] }] })
  assert.equal(harness.render().model.session, null, '同名占位 ID 不会误选另一个工作区的会话')
})

test('客户端：会话定位确认后才计时，旧确认与计时器不会干扰新选择', async (testContext) => {
  const harness = await createSessionBrowserHarness(testContext, { actual: false })
  const data = { workspaces: [{ key: 'actual', sessions: [{ sessionId: 'target', sessionTitle: '目标' }] }] }
  harness.render().actions.revealSession({ sessionId: 'target', workspaceKey: 'old' })
  assert.equal(harness.timers.size, 0, '加载期间不消耗定位提示时长')
  let browser = await harness.ready({ workspaces: [] })
  assert.equal(browser.model.highlight, null)
  browser = await harness.refresh(data)
  assert.equal(browser.model.highlight.workspaceKey, 'actual', '后续同范围快照出现目标后可以继续定位')
  assert.equal(browser.model.expanded.actual, true)
  assert.equal(harness.timers.size, 0)
  const oldConfirmation = browser.actions.markLocated
  browser.actions.markLocated()
  browser = harness.render()
  assert.equal(browser.model.highlight.located, true)
  assert.equal(JSON.parse(harness.stored.get('dsh-timespan.expanded')).actual, true)
  assert.equal(harness.timers.size, 1)
  const oldTimeout = [...harness.timers.values()][0]
  browser.actions.revealSession({ sessionId: 'target' })
  browser = harness.render()
  oldConfirmation()
  oldTimeout()
  assert.equal(harness.render().model.highlight.located, false, '重复定位相同 ID 时，旧确认和旧计时失效')
  assert.equal(harness.timers.size, 0)
  harness.render().actions.markLocated()
  harness.render()
  const currentTimeout = [...harness.timers.values()][0]
  currentTimeout()
  browser = harness.render()
  assert.equal(browser.model.highlight, null)
  assert.equal(browser.model.expanded.actual, true, '提示到期后仍保留实际工作区展开')
  browser.actions.revealSession({ sessionId: 'target' })
  browser = harness.render()
  const pendingConfirmation = browser.actions.markLocated
  browser.actions.toggleWorkspace('actual')
  pendingConfirmation()
  browser = harness.render()
  assert.equal(browser.model.highlight, null)
  assert.equal(browser.model.expanded.actual, false, '手动收起不会被高亮逻辑重新展开')
  browser.actions.revealSession({ sessionId: 'target' })
  browser = harness.render()
  browser.actions.selectRange('all')
  browser.actions.markLocated()
  assert.equal(harness.render().model.highlight, null, '切范围后旧定位确认不能重建高亮')
  harness.React.unmount()
  assert.equal(harness.timers.size, 0)
})

test('客户端：离开会话范围后忽略迟到响应，重新进入仍读取权威快照', async (testContext) => {
  const harness = await createSessionBrowserHarness(testContext)
  const first = harness.requests.length - 1
  harness.setOptions({ enabled: false })
  await harness.respond(first, sampleDashboardData())
  assert.equal(harness.render().model.rows.length, 0)
  harness.render().actions.search('旧查询')
  harness.render().actions.filter('running')
  harness.render().actions.openRange({ from: 10, to: 20 })
  harness.render().actions.revealSession({ sessionId: 's-1' })
  let browser = harness.setOptions({ enabled: true })
  assert.equal(browser.model.detailsRange, 'all', '其他视图回退时查询全部记录')
  assert.equal(browser.model.customRange, null)
  assert.equal(browser.model.query, '')
  assert.equal(browser.model.statusFilter, 'all')
  assert.equal(harness.requests.at(-1).payload.from, 0)
  assert.equal(harness.timers.size, 0)
  browser = await harness.ready(sampleDashboardData())
  browser.actions.markLocated()
  harness.render()
  assert.equal(harness.timers.size, 1)
  harness.React.unmount()
  assert.equal(harness.timers.size, 0, '卸载清理定位计时器')
})

test('客户端：仪表盘真实入口串联趋势范围、宿主失败定位和窄窗预览', async (testContext) => {
  const session = new Map([['dsh-timespan.view', 'trend']])
  const storage = { getItem: (key) => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) }
  let inspectorScrolls = 0
  const { React, createPage, translate, TabNav, Select } = await loadClientFunctions({
    sessionStorage: storage, localStorage: { getItem: () => null, setItem() {} },
    setTimeout, clearTimeout, innerWidth: 800,
    requestAnimationFrame: (callback) => { callback(); return 1 }, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  }, { document: { getElementById: () => ({ scrollIntoView() { inspectorScrolls++ } }) } })
  testContext.after(() => React.unmount())
  const requests = [], opened = [], located = []
  const data = sampleDashboardData()
  const raw = { ...data, workspaces: data.workspaces.map((row) => ({ ...row, workspaceId: row.key })) }
  const connection = { rpc: { async call(_path, _channel, { method, payload }) {
    if (method === 'getSettings') return { ok: true, value: { language: 'zh' } }
    if (method === 'queryStats' && payload.view === 'details') {
      return new Promise((resolve) => requests.push({ payload, resolve }))
    }
    if (method === 'queryStats') return { ok: true, value: raw }
    if (method === 'queryDailySeries') return { ok: true, value: { days: [] } }
    throw new Error(`未预期的测试调用：${method}`)
  } } }
  const ctx = { get: (name) => name === 'connection' ? connection : name === 'uiWorkspace' ? {
    openSession(id) { opened.push(id); throw new Error('会话已归档') },
  } : undefined }
  const Page = createPage(ctx)
  const render = () => {
    const tree = React.render(Page, { t: translate })
    const views = allOf(tree, byClass('cs-views'))[0]
    if (views) views.props.ref.current = {
      closest: () => ({ scrollTop: 0 }),
      querySelectorAll: (selector) => selector === '.cs-session[data-session-id]'
        ? allOf(tree, byClass('cs-group')).flatMap((group) => allOf(group, byClass('cs-session')).map((row) => ({
          getAttribute: (key) => row.props[key],
          closest: () => ({ getAttribute: (key) => group.props[key] }),
          scrollIntoView() { located.push([group.props['data-workspace-key'], row.props['data-session-id']]) },
        }))) : [],
    }
    React.flushEffects()
    return tree
  }
  const settle = async () => {
    for (let i = 0; i < 3; i++) { render(); await new Promise(setImmediate) }
    return render()
  }
  const rangeControl = (tree) => allOf(tree, (node) => node.type === Select && node.props.ariaLabel === translate('detailsRangeLabel'))[0]
  let tree = await settle()
  allOf(tree, byClass('cs-peak-sessions'))[0].props.onClick()
  tree = render()
  assert.equal(allOf(tree, byClass('cs-view'))[0].props['data-view'], 'details')
  assert.equal(requests.at(-1).payload.from, data.trend[1].from)
  assert.equal(requests.at(-1).payload.to, data.trend[1].to)
  assert.equal(rangeControl(tree).props.value, 'selected')
  requests.at(-1).resolve({ ok: true, value: raw })
  tree = await settle()
  const count = requests.length
  allOf(tree, byClass('cs-inspector-open'))[0].props.onClick()
  tree = await settle()
  assert.equal(rangeControl(tree).props.value, 'selected', '当前会话页打开失败保留临时时段')
  assert.equal(requests.length, count)
  assert.deepEqual(located, [['ws-1', 's-1']])
  allOf(tree, byClass('cs-search'))[0].props.onChange({ target: { value: '无匹配' } })
  tree = render()
  allOf(tree, (node) => node.type === TabNav)[0].props.onChange('overview')
  tree = await settle()
  allOf(tree, byClass('cs-recent-row'))[0].props.onClick()
  tree = render()
  assert.equal(requests.at(-1).payload.from, 0, '从概览回退改用全部范围')
  assert.equal('to' in requests.at(-1).payload, false)
  assert.equal(allOf(tree, byClass('cs-search'))[0].props.value, '')
  requests.at(-1).resolve({ ok: true, value: { ...raw,
    workspaces: [{ ...raw.workspaces[0], workspaceId: 'moved' }],
  } })
  tree = await settle()
  assert.equal(rangeControl(tree).props.value, 'all')
  assert.deepEqual(opened, ['s-1', 's-1'])
  assert.deepEqual(located, [['ws-1', 's-1'], ['moved', 's-1']], '按当前快照定位，重复渲染不重复滚动')
  assert.equal(JSON.parse(session.get('dsh-timespan.expanded')).moved, true)
  let prevented = 0
  allOf(tree, byClass('cs-workspace-head'))[0].props.onKeyDown({ key: ' ', preventDefault() { prevented++ } })
  tree = render()
  assert.equal(prevented, 1)
  assert.equal(allOf(tree, byClass('cs-session')).length, 0, '键盘收起后高亮不会强制重新展开')
  allOf(tree, byClass('cs-workspace-head'))[0].props.onClick()
  tree = render()
  allOf(tree, byClass('cs-session'))[0].props.onClick()
  tree = render()
  assert.equal(inspectorScrolls, 1, '窄窗选择后滚到统计预览')
  assert.match(textOf(allOf(tree, byClass('cs-session-inspector'))[0]), /会话一/)
  assert.equal(opened.length, 2, '选择统计不会再调用宿主入口')
  assert.equal(allOf(tree, byClass('cs-details-notice')).length, 0)
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

async function loadAnalysisExportFunctions(globals = {}) {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const anchor = '    const DSH_TIMESPAN_CSS = `'
  const React = createTestReact()
  const window = { __ModuleLoader__: { load: ({ factory }) => factory(() => React) } }
  vm.runInNewContext(source.replace(anchor, `
    window.analysisExport = { AnalysisReportHeader, AnalysisReport, AnimatedCollapse, reviewSnapshotView, reviewTextItems, renderReviewPoints, analysisReportMarkdown, analysisReportFilename, formatNoticeTime, translate, applyLanguage };
${anchor}`), { window, setTimeout, clearTimeout, ...globals })
  return { ...window.analysisExport, React }
}

function analysisExportFixture() {
  const generatedAt = Date.UTC(2026, 10, 16, 3, 22, 10, 42)
  return {
    id: 'sample', period: 'week', from: generatedAt - 2_000, to: generatedAt - 1_000, generatedAt,
    workspaceTitle: '项目 / 跨域', sessionTitle: '回顾 🗓️', provider: 'provider', model: '模型',
    summary: '交付 🚀\r\n# 标题仍是正文',
    content: { statistics: '整理 3 项记录。',
      work: [{ text: '完成互操作。\n复核快照。', sourceIds: ['one', 'unlisted'] }],
      suggestions: '安排下一次复核。' },
    sources: [{ sessionId: 'one', sessionTitle: '[会话一]', workspaceTitle: '项目甲' }],
    coverage: {
      totalSessions: 5, readSessions: 2, includedSessions: 1, failedSessions: 2, omittedSessions: 2,
      truncated: true, relatedSessionsUnavailable: true,
      failedSources: [{ sessionId: 'two', sessionTitle: '会话二', workspaceTitle: '项目乙', reason: 'missing' }],
    },
    privateRequest: 'private-request-secret',
    credentials: 'credential-secret',
  }
}

test('回顾阅读：长文可展开、其余观察保留完整，标题与正文只作为文本', async () => {
  const { renderReviewPoints, translate, reviewTextItems } = await loadAnalysisExportFunctions()
  const long = `背景：${'长内容与依据。'.repeat(24)}`
  const input = `${long}\n下一条：保留重点。\n<script>恶意标签</script>\n第四条：不丢失。\n最后一条：也保留。`
  const tree = renderReviewPoints(input, translate)
  assert.ok(findAll(tree, byClass('cs-review-more')).length > 0)
  const text = textOf(tree)
  for (const item of reviewTextItems(input)) {
    for (const part of item.split('：')) assert.ok(text.includes(part), '标题与正文仍可读')
  }
  assert.equal(findAll(tree, (node) => node.type === 'script').length, 0)
  const oneLong = '长标题：' + '无句号的长段文字'.repeat(30)
  assert.equal(findAll(renderReviewPoints(oneLong, translate), byClass('cs-review-long')).length, 1)
})

test('回顾图表与 Markdown 共用历史快照，时区标签不依赖当前统计，零值不虚构占比', async () => {
  const { reviewSnapshotView, analysisReportMarkdown, translate, AnalysisReport } = await loadAnalysisExportFunctions()
  const report = { ...analysisExportFixture(), period: 'day', snapshot: {
    timeZone: 'Asia/Shanghai', onlineMs: null, activeMs: 0, taskMs: 0, activeSumMs: 0, taskSumMs: 0, taskCount: 0,
    trend: [{ from: Date.UTC(2026, 10, 16, 1), to: Date.UTC(2026, 10, 16, 2), activeMs: 0, taskMs: 0 }],
    workspaces: [], omittedWorkspaces: 0, omittedTrendBuckets: 0,
  } }
  const snapshot = reviewSnapshotView(report, translate)
  assert.equal(snapshot.trend[0].label, '09:00')
  assert.equal(snapshot.workspaceTotal, 0)
  assert.equal(snapshot.ranked.length, 0)
  const tree = AnalysisReport({ report, t: translate, onOpenSource() {} })
  assert.match(textOf(tree), /在线不适用于筛选范围/)
  assert.match(textOf(tree), /尚无活跃或任务记录/)
  const markdown = analysisReportMarkdown(report, translate)
  assert.match(markdown, /在线时长：—/)
  assert.match(markdown, /09:00/)
  assert.doesNotMatch(markdown, /NaN|Infinity/)
  assert.equal(reviewSnapshotView({ ...report, snapshot: undefined }, translate), null)
})

test('回顾跨时区读取：标题范围、生成时间与 Markdown 使用报告快照时区', async () => {
  const { AnalysisReport, analysisReportMarkdown, translate } = await loadAnalysisExportFunctions()
  const report = { ...analysisExportFixture(), period: 'day',
    from: Date.UTC(2026, 10, 15, 16), to: Date.UTC(2026, 10, 16, 2), generatedAt: Date.UTC(2026, 10, 16, 2, 1, 2),
    snapshot: { onlineMs: 0, activeMs: 0, taskMs: 0, activeSumMs: 0, taskSumMs: 0, taskCount: 0,
      trend: [], workspaces: [], omittedWorkspaces: 0, omittedTrendBuckets: 0 },
  }
  for (const [timeZone, dates, generatedAt] of [
    ['Asia/Shanghai', '2026-11-16 00:00:00 – 2026-11-16 10:00:00', '2026-11-16 10:01:02'],
    ['Pacific/Honolulu', '2026-11-15 06:00:00 – 2026-11-15 16:00:00', '2026-11-15 16:01:02'],
  ]) {
    report.snapshot.timeZone = timeZone
    const tree = AnalysisReport({ report, t: translate, onOpenSource() {} })
    const header = findAll(tree, (node) => node.type?.name === 'AnalysisReportHeader')[0]
    assert.equal(header.props.dates, dates)
    assert.equal(header.props.generatedAt, generatedAt)
    const markdown = analysisReportMarkdown(report, translate)
    assert.ok(markdown.includes(dates))
    assert.ok(markdown.includes(`**生成时间** ${generatedAt}`))
  }
})

test('客户端 AI 导出：Markdown 保留报告正文、实际范围、出处和缺失覆盖，文件名安全稳定', async () => {
  const { analysisReportMarkdown, analysisReportFilename, formatNoticeTime, translate, applyLanguage } = await loadAnalysisExportFunctions()
  const report = analysisExportFixture()
  const markdown = analysisReportMarkdown(report, translate)
  const { from, to, generatedAt } = report
  const timestamp = (value) => formatNoticeTime(value, true)
  assert.ok(markdown.startsWith('# 一周回顾\n'))
  assert.ok(markdown.includes(`项目 / 跨域 / 回顾 🗓️ · ${timestamp(from)} – ${timestamp(to)}`))
  assert.ok(markdown.includes(`**生成时间** ${timestamp(generatedAt)}`))
  assert.match(markdown, /模型\*\* provider \/ 模型/)
  assert.match(markdown, /## 摘要\n\n交付 🚀\n\\# 标题仍是正文/)
  assert.match(markdown, /## 时间观察\n\n- 整理 3 项记录。/)
  assert.match(markdown, /完成互操作。\n {2}复核快照。\n {2}- \*\*来源\*\* \\\[会话一\\\] · 项目甲/)
  assert.match(markdown, /## 下一步\n\n- 安排下一次复核。/)
  assert.match(markdown, /## 来源会话 · 1\n\n- \\\[会话一\\\] · 项目甲/)
  assert.match(markdown, /涉及 5 个会话 · 已读 2 · 纳入 1/)
  assert.match(markdown, /2 个会话未纳入[\s\S]*部分内容已截取[\s\S]*关联子代理会话目录暂不可用/)
  assert.match(markdown, /2 个会话读取失败\n {2}- 会话二 · 项目乙 · 未找到记录\n {2}- 另外 1 个失败会话未列出。/)
  assert.doesNotMatch(markdown, /private-request-secret|credential-secret|unlisted/)
  assert.equal(analysisReportFilename(report), 'dsh-timespan-ai-week-2026-11-16T03-22-10-042Z.md')
  assert.equal(analysisReportFilename({ period: '../不受信任:*', generatedAt: Infinity }), 'dsh-timespan-ai-report.md')

  applyLanguage('en')
  const legacy = analysisReportMarkdown({ ...report, summary: '<img src=x>\n&copy;',
    content: { ...report.content, suggestions: '', work: [] },
    coverage: { ...report.coverage, failedSources: undefined },
  }, translate)
  assert.match(legacy, /^# Weekly review/)
  assert.match(legacy, /&lt;img src=x&gt;\n&amp;copy;/)
  assert.match(legacy, /This report saved only the number of failures/)
  assert.doesNotMatch(legacy, /\bChanges and suggestions\b|<img/)
})

test('客户端 AI 导出：剪贴板失败后提供可选取的 Markdown，恢复权限后可再次复制', async (testContext) => {
  let clipboardAllowed = false
  const copied = []
  const clipboard = { async writeText(text) {
    if (!clipboardAllowed) throw new Error('clipboard denied')
    copied.push(text)
  } }
  const { AnalysisReportHeader, React, translate, analysisReportMarkdown } = await loadAnalysisExportFunctions({ navigator: { clipboard } })
  testContext.after(React.unmount)
  const report = analysisExportFixture()
  const markdown = analysisReportMarkdown(report, translate)
  let fieldFocuses = 0
  let fieldSelections = 0
  let copyFocuses = 0
  const button = (tree, key) => findAll(tree, (node) => node.props.label === translate(key) || node.type === 'button' && textOf(node) === translate(key))[0]
  const render = () => {
    const header = React.render(AnalysisReportHeader, { report, t: translate, dates: '', generatedAt: '' })
    const field = findAll(header, (node) => node.type === 'textarea')[0]
    if (field) field.props.ref.current = { focus() { fieldFocuses += 1 }, select() { fieldSelections += 1 } }
    button(header, 'reportCopy').props.buttonRef.current = { focus() { copyFocuses += 1 } }
    React.flushEffects()
    return { header, field }
  }

  await button(render().header, 'reportCopy').props.onClick()
  const fallback = render()
  assert.match(textOf(fallback.header), /请手动复制下方文本/)
  assert.equal(fallback.field.props.readOnly, true)
  assert.equal(fallback.field.props.value, markdown)
  assert.equal(fieldFocuses, 1)
  assert.equal(fieldSelections, 1)
  button(fallback.header, 'reportCloseCopy').props.onClick()
  assert.equal(render().field, undefined)
  assert.equal(copyFocuses, 1)

  clipboardAllowed = true
  await button(render().header, 'reportCopy').props.onClick()
  const success = render()
  assert.match(textOf(success.header), /已复制 Markdown/)
  assert.equal(success.field, undefined)
  assert.deepEqual(copied, [markdown])
})

test('客户端 AI 导出：报告变化时立即隐藏旧手动复制反馈，空报告不会崩溃', async (testContext) => {
  const { AnalysisReportHeader, React, translate, analysisReportMarkdown } = await loadAnalysisExportFunctions({
    navigator: { clipboard: { async writeText() { throw new Error('clipboard denied') } } },
  })
  testContext.after(React.unmount)
  const collapse = await loadAnalysisExportFunctions()
  testContext.after(collapse.React.unmount)
  let previousKey = Symbol('未挂载')
  const visibleCopyText = (header) => {
    const element = findAll(header, (node) => node.type?.name === 'AnimatedCollapse')[0]
    if (element.props.key !== previousKey) {
      collapse.React.unmount()
      previousKey = element.props.key
    }
    const tree = collapse.React.render(collapse.AnimatedCollapse, { ...element.props, children: element.children })
    tree.props.ref.current = { getAnimations: () => [{ finished: new Promise(() => {}) }] }
    collapse.React.flushEffects()
    return textOf(tree)
  }
  const report = analysisExportFixture()
  const props = { report, period: 'week', t: translate, dates: '', generatedAt: '' }
  const render = () => { const tree = React.render(AnalysisReportHeader, props); React.flushEffects(); return tree }
  const copy = async () => findAll(render(), (node) => node.props.label === translate('reportCopy'))[0].props.onClick()
  await copy()
  assert.equal(findAll(render(), (node) => node.type === 'textarea')[0].props.value, analysisReportMarkdown(report, translate))
  assert.match(visibleCopyText(render()), /请手动复制下方文本/)

  props.report = undefined
  props.period = 'day'
  let tree
  assert.doesNotThrow(() => { tree = React.render(AnalysisReportHeader, props) }, '清理 effect 执行前也能渲染空报告')
  assert.equal(findAll(tree, (node) => node.type === 'textarea').length, 0)
  assert.doesNotMatch(textOf(tree), /请手动复制下方文本/)
  assert.doesNotMatch(visibleCopyText(tree), /请手动复制下方文本/, '嵌套折叠层也不能保留旧报告内容')
  React.flushEffects()

  props.report = report
  props.period = 'week'
  await copy()
  assert.equal(findAll(render(), (node) => node.type === 'textarea').length, 1)
  assert.match(visibleCopyText(render()), /请手动复制下方文本/)
  findAll(render(), (node) => node.type === 'button' && textOf(node) === translate('reportCloseCopy'))[0].props.onClick()
  assert.match(visibleCopyText(render()), /请手动复制下方文本/, '同一报告主动收起仍保留退出动效')
  props.report = { ...report, id: 'new-report', summary: '新报告' }
  tree = React.render(AnalysisReportHeader, props)
  assert.equal(findAll(tree, (node) => node.type === 'textarea').length, 0, '旧报告反馈不借用新报告正文')
  assert.doesNotMatch(visibleCopyText(tree), /请手动复制下方文本/, '换报告时不把旧内容继续淡出到新报告上')
  React.flushEffects()
  await copy()
  assert.equal(findAll(render(), (node) => node.type === 'textarea')[0].props.value, analysisReportMarkdown(props.report, translate))
})

test('客户端 AI 导出：下载 UTF-8 .md，浏览器拒绝下载时提示可复制', async (testContext) => {
  const downloads = []
  const timers = []
  const revoked = []
  let blob
  let removed = false
  const document = {
    body: { appendChild() {} },
    createElement(tag) {
      assert.equal(tag, 'a')
      return { style: {}, click() { downloads.push({ href: this.href, filename: this.download }) }, remove() { removed = true } }
    },
  }
  const URL = {
    createObjectURL(value) { blob = value; return 'blob:report' },
    revokeObjectURL(value) { revoked.push(value) },
  }
  const { AnalysisReportHeader, React, translate, analysisReportMarkdown, analysisReportFilename } = await loadAnalysisExportFunctions({
    Blob, URL, document, setTimeout(callback) { timers.push(callback) },
  })
  testContext.after(React.unmount)
  const report = analysisExportFixture()
  const render = () => React.render(AnalysisReportHeader, { report, t: translate, dates: '', generatedAt: '' })
  const download = () => findAll(render(), (node) => node.props.label === translate('reportExport'))[0].props.onClick()

  download()
  assert.deepEqual(downloads, [{ href: 'blob:report', filename: analysisReportFilename(report) }])
  assert.equal(blob.type, 'text/markdown;charset=utf-8')
  assert.equal(await blob.text(), analysisReportMarkdown(report, translate))
  assert.equal(removed, true)
  assert.equal(timers.length, 1)
  timers[0]()
  assert.deepEqual(revoked, ['blob:report'])
  assert.match(textOf(render()), /Markdown 下载/)

  URL.createObjectURL = undefined
  download()
  assert.match(textOf(render()), /无法下载报告.*复制 Markdown/)
  assert.equal(downloads.length, 1)
})
