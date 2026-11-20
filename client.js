/**
 * dsh-timespan 的 Client 半。
 *
 * 四件事：在侧边栏注册常驻入口并显示所选时长；在 frame-wide overlay 上
 * 挂载 presence 心跳（每 15 秒上报页面可见性、窗口聚焦、前台会话与最近操作）；
 * 在 main 的 dsh-timespan 键下渲染日/周/月仪表盘（含导出与二次确认清空）；
 * 在 settings.section 下渲染统计与侧栏显示设置。页面只负责渲染与交互，
 * 周期边界、跨午夜裁剪、并发并集、会话求和、设置归一化与文件序列化全部由
 * Host 领域服务计算；Client 不缓存业务状态，刷新后所有数字都重新从 Host 读取。
 *
 * 界面语言：中文（默认）与英文两档，是插件自己的设置项（language），与宿主
 * locale 解耦。文案统一走 translate，切语言只改这一处状态，由订阅广播让侧栏
 * 入口、仪表盘与设置页各自重渲染。
 *
 * 视觉基座：页面容器用 cs-palette-* 与 cs-appearance-* 切换 CSS 变量；
 * 三档蓝 --cs-signal-deep/--cs-signal/--cs-signal-soft 派生 --cs-live、--cs-tone-*
 * 与 --cs-heat-*；--cs-task 使用独立的紫罗兰辅助色，保证活跃与任务两组柱分明。
 * 灰色只用于表面、边框、轨道与次级文字。
 * 外观 helper（normalizePalette/normalizeAppearance/cycleAppearance/resolveAppearance）
 * 与 Info 组件供后续票据复用。
 */

window.__ModuleLoader__.load({
  id: '@qwayo/dsh-timespan',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-timespan'
    /** 新导出格式；旧版 chronoscope-export 仍允许导入。 */
    const EXPORT_FORMAT = 'dsh-timespan-export'
    const LEGACY_EXPORT_FORMAT = 'chronoscope-export'
    /** 四套配色；blue（晴空蓝）为默认。旧值（mono/green/warm）一律回落到 blue，旧赤陶 clay 迁移为 cyan。 */
    const PALETTES = ['blue', 'stone', 'cyan', 'coral']
    const PALETTE_LABELS = { blue: 'paletteBlue', stone: 'paletteStone', cyan: 'paletteCyan', coral: 'paletteCoral' }
    /** 外观三态按用户确认的顺序循环：浅色 → 深色 → 跟随系统。 */
    const APPEARANCE_ORDER = ['light', 'dark', 'system']
    /** 数字格式五档；顺序与原型 FORMATS 一致，也是设置页卡片的展示顺序。 */
    const DURATION_FORMAT_ORDER = ['hms', 'short', 'zh', 'sec', 'padded', 'decimal']
    /** 首次安装与恢复初始设置使用紧凑单位；非法值也回落到这里。 */
    const DEFAULT_DURATION_FORMAT = 'short'
    /** 设置页卡片与预览行统一用原型里的 2:48:16 作为示例值。 */
    const DURATION_FORMAT_SAMPLE_MS = 2 * 3_600_000 + 48 * 60_000 + 16_000
    const PRESENCE_HEARTBEAT_MS = 15_000
    const SIDEBAR_REFRESH_MS = 5_000
    /** 侧栏悬浮说明的等待时长；比常规 tooltip 更快，避免用户以为没有说明。 */
    const SIDEBAR_TIP_DELAY_MS = 200
    /** 侧栏入口可常驻展示的时长类型；与 Host 设置同名同序。 */
    const SIDEBAR_DURATION_VALUES = ['online', 'active', 'task']
    const SIDEBAR_DURATION_DEFAULT = 'online'
    /** 侧栏状态点位置：默认贴到行最右侧，也可切回跟随时长的 inline。 */
    const SIDEBAR_DOT_POSITION_VALUES = ['end', 'inline']
    const SIDEBAR_DOT_POSITION_DEFAULT = 'inline'
    const PAGE_REFRESH_MS = 10_000
    const TIMER_REFRESH_MS = 2_000
    /** DSH 设置页右上角的项目入口：项目页与 Issue 列表，Star 入口复用项目页。 */
    const PROJECT_REPOSITORY_URL = 'https://github.com/qwayo/dsh-timespan'
    const PROJECT_ISSUES_URL = `${PROJECT_REPOSITORY_URL}/issues`
    const ANALYSIS_REFRESH_MS = 1_250
    const COUNTDOWN_MAX_MINUTES = 7 * 24 * 60
    const FLOATING_POSITION_KEY = 'dsh-timespan.floatingPosition'
    const FLOATING_GAP = 12
    const FLOATING_DOCK_DELAY = 3_000
    const FLOATING_EDGE_DISTANCE = 36
    /** 每日活跃热力图的默认范围：最近 3 个本地日历月；#13 再扩展范围切换。 */
    const HEAT_DEFAULT_RANGE = '3m'
    /** 月份刻度：中文界面用「1月…12月」，英文界面沿用英文缩写。 */
    const HEAT_MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const HEAT_MONTH_LABELS_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    /** 星期刻度：中文界面用单字「一…日」，英文界面用 Mon…Sun，均与七行一一对应。 */
    const HEAT_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const HEAT_WEEKDAY_LABELS_ZH = ['一', '二', '三', '四', '五', '六', '日']
    /**
     * 热力图范围菜单：最近 3 个月、近半年、全年，再按 1–12 月选单月。
     * 月份值用数字 1–12；label 只作英文回退，展示文案由 heatRangeOptionLabel 按界面语言生成。
     */
    const HEAT_RANGE_OPTIONS = [
      { value: '3m', label: '3m' },
      { value: '6m', label: '6m' },
      { value: 'year', label: 'year' },
      ...HEAT_MONTH_ABBR.map((abbr, index) => ({ value: index + 1, label: abbr })),
    ]
    /** 明细统计范围：今天、近 3 天、最近一周、近 30 天与全部历史。 */
    const DETAILS_RANGE_OPTIONS = [
      { value: 'today', labelKey: 'detailsRangeToday', days: 1 },
      { value: '3d', labelKey: 'detailsRange3d', days: 3 },
      { value: '7d', labelKey: 'detailsRange7d', days: 7 },
      { value: '30d', labelKey: 'detailsRange30d', days: 30 },
      { value: 'all', labelKey: 'detailsRangeAll', days: null },
    ]
    const DETAILS_RANGE_DEFAULT = 'today'
    /** 「全部」下每个工作区首批展开的会话数与每次追加数。 */
    const DETAILS_SESSION_INITIAL = 8
    const DETAILS_SESSION_STEP = 8
    /** 概览「最近会话」动态条数：默认 5，按底部行高在 3–6 之间取值。 */
    const RECENT_SESSIONS_DEFAULT = 5
    const RECENT_SESSIONS_MIN = 3
    const RECENT_SESSIONS_MAX = 6
    const RECENT_ROW_FALLBACK_PX = 41
    const RECENT_CHROME_FALLBACK_PX = 66
    const RECENT_FIT_GAP_PX = 4
    /** 回填进行时加快轮询，让进度与完成后的数字尽快出现，无需刷新页面。 */
    const BACKFILL_REFRESH_MS = 2_000
    /** 五个同级视图；tab 顺序即键盘左右方向键的顺序。 */
    const VIEWS = ['overview', 'trend', 'details', 'analysis', 'settings']
    /** 视图入场 180ms、退场 120ms；减少动效时直接到位。 */
    const VIEW_ENTER_MS = 180
    const VIEW_EXIT_MS = 120
    /** 首屏大数字在五个主指标之间做数字渐变；900ms 的五次缓入缓出读数变化更从容。 */
    const DURATION_TWEEN_MS = 900
    /** 首屏放大态：只认三种区块，状态持久化在浏览器本地设置，供 #14/#15 共用。 */
    const FOCUS_KEY = 'dsh-timespan.focus'
    const FOCUS_VALUES = ['hero', 'trend', 'heatmap']
    const FOCUS_TRANSITION_MS = 240
    /** 条状图首屏的 SVG 视图高度；柱高与网格按它重新计算，而不是拉伸普通卡片。 */
    const TREND_FOCUS_HEIGHT = 360
    /** 首屏主指标：五个可切换的时长项，持久化在浏览器本地设置；非法值回落今日在线时长。 */
    const HERO_METRIC_KEY = 'dsh-timespan.heroMetric.v2'
    /** 旧键只读不写：迁移旧默认「今日活跃」到新的「今日在线」。 */
    const HERO_METRIC_LEGACY_KEY = 'dsh-timespan.heroMetric'
    const HERO_METRIC_VALUES = ['active', 'online', 'task', 'week', 'month']
    const HERO_METRIC_DEFAULT = 'online'
    /**
     * 插件界面语言：两档，默认中文，设置页可切到英文。
     * 这是插件自己的设置项（存在 Host 权威设置里），刻意不跟随宿主 locale：
     * 宿主界面语言属于另一个产品面，改它会影响整个 DSH，超出这个插件的职责。
     */
    const LANGUAGE_VALUES = ['zh', 'en']
    const DEFAULT_LANGUAGE = 'zh'
    /** 语言选项用各自的语言书写：界面已经在英文时，「中文」仍然认得出来。 */
    const LANGUAGE_OPTIONS = Object.freeze([
      { value: 'zh', label: '中文' },
      { value: 'en', label: 'English' },
    ])

    const zh = {
      title: 'TimeSpan',

      todayActive: '今日活跃时长',
      todayOnline: '今日在线时长',
      todayTask: '今日任务时长',
      weekOnline: '本周在线',
      weekTask: '本周任务',
      monthOnline: '本月在线',
      monthTask: '本月任务',
      openSession: '打开会话',
      live: '活跃中',
      idle: '空闲',
      onlineLive: '正在记录',
      onlinePaused: '已暂停',
      taskRunning: '任务中',
      taskIdle: '无运行任务',
      taskCountLabel: '任务数',
      actualOccupied: '实际占用',
      focusSet: '设为首屏',
      focusUnset: '退出首屏',
      settingsLinksLabel: '项目链接',
      settingsRepoAction: '打开 GitHub 项目页',
      settingsIssueAction: '提交或查看 Issue',
      settingsStarAction: '为这个项目点个 Star 吧',
      activeShare: '活跃占比',
      taskShare: '任务占比',
      weekActiveShare: '本周活跃占比',
      monthActiveShare: '本月活跃占比',
      focusSummary: '首屏概览',
      focusTodayActive: '今日活跃',
      focusWeekActive: '本周活跃',
      focusMonthActive: '本月活跃',
      heroMetricWeekTitle: '本周活跃',
      heroMetricMonthTitle: '本月活跃',
      heroMetricGroup: '首屏主指标',
      sessionTasks: '会话任务',
      accumulated: '累计工时',
      noTasks: '今天还没有任务记录',
      unknownSession: '未命名会话',
      unassigned: '未归属',
      runningTag: '运行中',
      approximateTag: '近似',
      approximateHint: '部分记录按最后心跳或最后事件时间结束，时长可能偏短',
      approximateNotice: '有些记录只能按最后心跳或最后事件时间结束（异常结束、重载、长时间无心跳或时钟跳变），相关时长可能偏短。',
      notBroken: '未拆分',
      breakdownModel: '模型',
      breakdownTool: '工具',
      breakdownWait: '等待',
      breakdownOther: '其他',
      loading: '读取中…',
      error: '暂时无法读取时长统计，正在自动重试',
      sinceBoot: '活跃：页面可见、窗口聚焦且有键鼠操作时计入。',
      localOnly: '数据仅保存在本机',
      navTooltip: 'TimeSpan · 在线、活跃与任务时长',
      periodDay: '日',
      periodWeek: '周',
      periodMonth: '月',
      periodLabel: '统计周期',
      paletteLabel: '配色',
      paletteToggle: '配色：{name}',
      appearanceLabel: '外观',
      appearanceLight: '浅色',
      appearanceDark: '深色',
      appearanceSystem: '跟随系统',
      appearanceToggle: '外观：{mode}，点击切换',
      selectedPeriod: '当前',
      tabOverview: '概览',
      tabTrend: '趋势',
      tabDetails: '会话',
      tabSettings: '设置',
      tabAnalysis: '回顾',
      tabsLabel: 'TimeSpan 页面',
      recentSessions: '最近会话',
      recentSessionsHint: '按最近活动时间排序',
      recentSessionsEmpty: '当前周期还没有会话记录',
      trendSummary: '本周期概览',
      peakActive: '峰值活跃',
      peakPeriod: '最活跃时段',
      trendBreakdownTitle: '时段分布',
      trendBreakdownHint: '按活跃与任务合计排序，展示最忙的 7 个时段',
      trendBreakdownEmpty: '暂无时段数据',
      trendInsightsTitle: '趋势洞察',
      trendInsightsHint: '查看活跃峰值，以及最活跃的三个时段占比',
      trendInsightPeak: '峰值时段',
      trendInsightCoverage: '活跃覆盖',
      trendInsightConcentration: '前三集中度',
      trendInsightTaskRatio: '任务/在线',
      trendInsightNote: '前三集中度：最活跃的三个时段占本周期活跃时长的比例',
      trendFocusTitle: '活跃与任务趋势',
      heatmapFocusTitle: '每日活跃热力图',
      moduleTipTrend: '按小时或按天查看活跃与任务时长；右上角可放大',
      moduleTipComposition: '模型、工具、等待与其他四段的耗时占比',
      moduleTipRanking: '按活跃时长比较各工作区；悬停可看任务占比',
      moduleTipRecent: '按最后活动时间列出会话，点按可打开',
      rangeOnline: '累计在线',
      rangeActive: '累计活跃',
      rangeTask: '累计任务',
      peakDay: '最活跃日',
      activeDaysLabel: '活跃天数',
      searchPlaceholder: '搜索工作区或会话',
      detailsEmpty: '没有匹配的工作区或会话',
      settingsPageTitle: '仪表盘设置',
      settingsPageHint: '改动即存本机并立即生效，重启后仍然生效。',
      settingsSectionAppearance: '外观与配色',
      settingsAppearanceHint: '只影响本机显示，不写入统计设置；切换后立即生效。',
      settingsAppearanceLocal: '仅本机',
      settingsRecheck: '重新扫描历史任务',
      settingsRechecking: '正在扫描…',
      settingsRecheckDone: '已重新扫描历史任务，通知记录已更新',
      settingsRecheckError: '扫描失败，请稍后重试',
      periodLoading: '正在更新，暂时显示',
      periodLoadFailed: '更新失败，暂时显示',
      trendInfo: '活跃与任务分别计时，可能重叠；悬停或聚焦柱形查看时长',
      heatmapTitle: '每日活跃',
      heatLegendLabel: '活跃程度图例',
      heatLegendLow: '低',
      heatLegendHigh: '高',
      heatDayTitle: '{month}月{day}日',
      noRecord: '无记录',
      heatSummary: '累计活跃 {active} · {activeDays}/{observedDays} 天有活跃',
      heatmapLoading: '正在加载每日活跃…',
      heatmapEmpty: '暂无每日记录',
      heatmapError: '暂时无法读取每日活跃',
      heatRangeLabel: '统计范围',
      heatRange3m: '近3个月',
      heatRange6m: '近半年',
      heatRangeYear: '全年',
      heatRangeMonth: '{month}',
      yearHeatTitle: '全年每日活跃',
      monthHeatTitle: '{month}每日活跃',
      monthBars: '月度活跃',
      compositionInfo: '任务时长按会话累加；历史任务缺少构成记录的部分计入「未拆分」',
      compositionTitle: '任务时长构成',
      shareLabel: '占比',
      durationLabel: '时长',
      workspaceRanking: '工作区任务排行',
      noTaskComposition: '当前周期暂无任务时长',
      unknownBreakdown: '未拆分',
      onlineLabel: '在线时长',
      currentSummary: '周期摘要',
      taskCountShort: '任务次数',
      dailyAverageActive: '日均活跃',
      dailyAverageTask: '日均任务',
      dailyAverageHint: '日均按自然日计算',
      recordSinceBoot: '在线和活跃从插件启用时开始记录，历史数据只回填任务时长。',
      paletteBlue: '晴空蓝',
      paletteStone: '石墨灰',
      paletteCyan: '松石青',
      paletteCoral: '珊瑚橙',
      paletteSaveError: '外观设置未能保存，刷新后可能恢复默认',
      timerTitle: '手动计时',
      timerClock: '本地时间',
      timerStopwatch: '正计时',
      timerCountdown: '倒计时',
      timerIdle: '待开始',
      timerRunning: '计时中',
      timerPaused: '已暂停',
      timerCompleted: '已完成',
      timerExpired: '倒计时已结束',
      timerSyncing: '正在同步计时',
      timerSyncError: '计时状态同步失败',
      timerActionError: '计时操作失败，请同步后重试',
      timerChanged: '计时状态已在另一处更新，请同步后重试',
      timerSaving: '正在保存计时状态',
      timerRefresh: '同步计时',
      timerStart: '开始',
      timerPause: '暂停',
      timerResume: '继续',
      timerComplete: '结束',
      timerReset: '重置',
      timerDuration: '倒计时时长',
      timerMinutes: '分',
      timerSeconds: '秒',
      timerDurationInvalid: '请输入 1 秒至 7 天的时长，秒数为 0–59。',
      timerLastResult: '上次完成',
      timerDeleteResult: '删除这条计时记录',
      timerResultElapsed: '累计 {time}',
      timerSoundBlocked: '当前页面需要交互才能播放声音。',
      timerPlaySound: '播放提示音',
      timerSoundFailed: '提示音播放失败，可再次尝试。',
      floatingTitle: '悬浮计时',
      floatingOpen: '展开悬浮计时',
      floatingMinimize: '收起悬浮计时',
      floatingMove: '拖动悬浮窗；方向键微调，Shift 加速，Home 复位',
      floatingWake: '展开贴边悬浮窗',
      floatingMenu: '悬浮窗菜单',
      floatingExit: '退出悬浮窗',
      floatingExitHint: '计时继续，可在设置中重新开启',
      floatingExitError: '未能关闭悬浮窗，请重试',
      settingsFloatingTitle: '悬浮窗显示',
      settingsFloatingEnabled: '显示会话悬浮窗',
      settingsFloatingEnabledHint: '关闭只隐藏悬浮窗，计时和到期提醒继续运行。',
      settingsFloatingClock: '增加指针时钟',
      settingsFloatingHint: '默认位于会话左上角、标题栏下方。靠边后移开鼠标 3 秒收起，靠近展开；右键可退出。',
      timerNoticeError: '到期提醒未能同步，请重试。',
      timerClose: '关闭',
      settingsTimerTitle: '到期提醒',
      settingsTimerSound: '播放提示音',
      settingsTimerSoundHint: '倒计时结束时播放短提示音。',
      settingsAnalysisTitle: '分析模型',
      settingsAnalysisHint: '使用 DSH 已配置的模型，独立于会话模型。',
      analysisProvider: 'Provider',
      analysisModel: '模型',
      analysisChooseProvider: '选择 Provider',
      analysisChooseModel: '选择模型',
      analysisCatalogRefresh: '刷新模型目录',
      analysisCatalogLoading: '正在读取模型目录',
      analysisCatalogError: '模型目录读取失败，请刷新重试。',
      analysisCatalogPartial: '无法读取这些 Provider 的模型目录：{providers}',
      analysisCatalogEmpty: 'DSH 暂无可用的模型。',
      analysisSavedProviderMissing: '当前 Provider 暂不可用，已保留选择。',
      analysisSavedModelMissing: '当前模型暂不可用，已保留选择。',
      analysisTitle: '时间回顾',
      analysisEmpty: '生成报告，查看这个周期的时间分配和会话进展。',
      analysisLoading: '正在读取分析报告',
      analysisReadError: '分析状态读取失败，已保留加载到的报告。',
      analysisReadEmptyError: '分析状态读取失败，请重试。',
      analysisGenerate: '生成报告',
      analysisRegenerate: '重新生成',
      analysisRetryGenerate: '重试生成',
      analysisCancel: '取消生成',
      analysisStarting: '正在启动分析',
      analysisStartError: '分析启动响应失败，请查看同步后的进度或重试。',
      analysisCancelling: '正在取消分析',
      analysisCancelled: '本次分析已取消。',
      analysisCollecting: '正在读取会话',
      analysisGenerating: '正在生成报告',
      analysisSaving: '正在保存报告',
      analysisRangeLoading: '正在同步该周期的范围选项。',
      analysisPeriod: '统计周期',
      analysisWorkspace: '工作区',
      analysisSession: '会话',
      analysisAllWorkspaces: '全部工作区',
      analysisAllSessions: '全部会话',
      analysisNoScopeSessions: '该范围内暂无会话记录。',
      analysisStatistics: '时间观察',
      analysisWork: '工作进展',
      analysisSuggestions: '下一步',
      analysisNoWork: '已读取的会话中暂无可总结的工作。',
      analysisSources: '来源会话 · {count}',
      analysisOpenSource: '打开来源会话 {name}',
      analysisSourceError: '暂时无法打开来源会话 {name}。',
      analysisReportRange: '报告范围',
      analysisGeneratedAt: '生成时间',
      analysisRunRange: '本次分析范围',
      analysisReportScopeMismatch: '以下为上一份报告，使用它生成时的实际范围。',
      analysisReportScopeMismatchShort: '上一份报告',
      analysisModelRequiredShort: '分析模型未配置',
      analysisCoverage: '涉及 {total} 个会话 · 已读 {read} · 纳入 {included}',
      analysisCoverageFailed: '{count} 个会话读取失败',
      analysisFailureDetails: '失败详情',
      analysisFailureMissing: '未找到记录',
      analysisFailureInvalid: '记录格式异常',
      analysisFailureUnavailable: '暂时无法读取',
      analysisFailureUnknown: '读取失败的原因未记录',
      analysisFailureNotListed: '另外 {count} 个失败会话未列出。',
      analysisFailureNoDetails: '这份报告仅保存了失败数量。可调整范围并重新生成，查看新的读取结果。',
      analysisFailureOutsideScope: '当前周期的筛选项中没有该会话。',
      analysisFailureSelect: '选择此会话',
      analysisFailureSelectNamed: '选择会话 {name} 作为分析范围',
      analysisFailureOpen: '打开会话 {name}',
      analysisRangeFilters: '分析范围筛选',
      analysisReturnToRange: '返回范围筛选',
      analysisNoticeDismiss: '关闭提示',
      analysisCoverageOmitted: '{count} 个会话未纳入',
      analysisCoverageTruncated: '部分内容已截取',
      analysisCoverageRelatedUnavailable: '关联子代理会话目录暂不可用',
      analysisGoToSettings: '设置分析模型',
      analysisModelUse: '将所选范围的统计与会话内容交给 {route} 分析。',
      analysisModelLoading: '正在读取已选分析模型。',
      analysisModelReadError: '无法读取已选分析模型，请重试。',
      analysisModelChanged: '分析模型已更新，请核对当前模型后重试。',
      analysisModelRequired: '先在设置中选择分析模型。',
      analysisModelUnavailable: '已选分析模型暂不可用，请检查模型设置。',
      analysisCatalogUnavailable: '暂时无法读取模型目录，请重试。',
      analysisInputUnavailable: '暂时无法读取分析材料，请重试。',
      analysisScopeUnavailable: '所选工作区或会话已不在统计范围内，请重新选择。',
      analysisHostUnavailable: '当前 DSH 无法生成分析报告。',
      analysisNoData: '该范围内暂无可分析的记录。',
      analysisGenerationError: '报告生成失败，请重试。',
      analysisInvalidOutput: '模型返回的报告格式不完整，请重试。',
      analysisSaveError: '报告保存失败，请重试。',
      analysisCancelError: '取消分析失败，请重试。',
      reportTitle: '时间回顾',
      reviewDay: '时间回顾',
      reviewWeek: '一周回顾',
      reviewMonth: '月度回顾',
      reviewMetrics: '时间概况',
      reviewRhythm: '投入节奏',
      reviewRhythmHint: '按本周期的时间桶查看活跃与任务；柱越高，投入越集中',
      reviewWorkspaces: '工作区分布',
      reviewWorkspacesHint: '按累计活跃比较工作区并标出占比；只列前四名和其余合计',
      reviewObservationsHint: '本周期的时间事实：边界、口径与关键读数',
      reviewWorkHint: '从纳入会话整理出的进展；展开可回到来源会话',
      reviewNextHint: '基于本周期进展给出的下一步建议，可展开全部',
      reviewWorkspaceBasis: '累计活跃 · 按会话相加',
      reviewBasis: '统计口径',
      reviewActualTime: '实际占用 · 重叠只计一次',
      reviewOnlineNA: '在线不适用于筛选范围',
      reviewTasks: '{count} 次任务',
      reviewEvidence: '纳入会话',
      reviewReadCount: '已读 {read} / 共 {total}',
      reviewEvidenceHint: '计算 · 实际交给模型的同期正文来源',
      reviewEvidenceEmpty: '为零 · 已读会话在此周期内没有正文',
      reviewEvidenceNone: '为零 · 此周期暂无会话记录',
      reviewEvidenceUnavailable: '为零 · 正文读取或内容范围受限',
      reviewEvidenceScope: '范围 · 消息、必要工具结果与子代理结论',
      reviewEvidenceNext: '增加 · 选含消息的周期，或聊天后重新生成',
      reviewEvidenceCheck: '检查 · 在「范围与依据」核对后重新生成',
      reviewEvidenceRefresh: '更新 · 改选范围后需重新生成',
      reviewFilters: '范围',
      reviewAllScope: '全部工作区与会话',
      reviewLess: '收起更多',
      reviewSnapshotMissing: '这份旧报告未保留统计快照。重新生成后可查看图表，原有正文仍完整保留。',
      reviewSnapshotPartial: '图表仅显示模型实际收到的统计片段',
      reviewMore: '展开其余 {count} 条',
      reviewExpand: '展开全文',
      reviewCollapse: '收起全文',
      reviewPoint: '观察 {count}',
      reviewAction: '建议 {count}',
      reviewWorkItem: '进展 {count}',
      reviewNoActivity: '这一范围尚无活跃或任务记录',
      reviewNoWorkspaces: '这一范围尚无工作区活跃记录',
      reviewOtherWorkspaces: '其余工作区',
      reviewEvidenceTitle: '范围与依据',
      reportAbstract: '摘要',
      reportDetails: '报告信息',
      reportCoverage: '内容覆盖',
      reportWorkSources: '来源',
      reportActions: '报告操作',
      reportCopy: '复制 Markdown',
      reportExport: '导出 .md',
      reportCopied: '已复制 Markdown。',
      reportExportStarted: '已发起 Markdown 下载。',
      reportExportError: '无法下载报告，请重试或复制 Markdown。',
      reportCopyManual: '无法写入剪贴板，请手动复制下方文本。',
      reportMarkdownContent: '报告 Markdown 文本',
      reportCloseCopy: '收起文本',
      reportPending: '报告保存后会在这里显示。',
      cycleToday: '今日',
      cycleWeek: '本周',
      cycleMonth: '本月',
      activeLabel: '活跃',
      taskLabel: '任务',
      overviewTitle: '周期概览',
      unionTag: '实际占用 · 重叠只计一次',
      sumTag: '累计工时 · 按会话相加',
      trendDay: '今日 24 小时',
      trendWeek: '本周每日',
      trendMonth: '本月每日',
      trendHint: '活跃与任务时长',
      workspaceTitle: '工作区明细',
      workspaceHint: '展开查看会话',
      detailsAll: '全部',
      detailsSessionCount: '会话数',
      detailsRunning: '运行中',
      detailsSortLabel: '会话排序',
      detailsSortRecent: '最近活动',
      detailsSortTask: '任务时长',
      detailsSortActive: '活跃时长',
      detailsInspect: '查看统计',
      detailsInspector: '会话统计',
      detailsInspectorEmpty: '选择一个会话，查看时长与任务构成',
      detailsSelectionHidden: '所选会话不在当前筛选结果中',
      detailsExpandAll: '展开全部',
      detailsCollapseAll: '收起全部',
      detailsFiltered: '当前结果：{workspaces} 个工作区 · {sessions} 个会话',
      detailsTaskScope: '任务时长 · 累计工时',
      detailsIndependent: '活跃与任务分别计时，任务可在空闲时继续运行',
      detailsRangeSelected: '选定时段',
      detailsLoading: '正在读取所选范围的会话…',
      detailsLoadError: '暂时无法读取所选范围的会话',
      detailsOpenFallback: '原会话暂时无法打开，可在此查看统计。',
      trendOpenSessions: '查看该时段会话',
      trendPeakSessions: '查看 {range} 会话',
      trendNotStarted: '尚未开始',
      trendFutureHint: '虚线表示尚未开始',
      trendDistributionHour: '按小时 · 活跃时长',
      trendDistributionDay: '按天 · 活跃时长',
      trendDistributionHint: '颜色越深，活跃越久；空白表示无活跃，虚线表示尚未开始',
      settingsSidebarPreview: '侧栏效果',
      settingsAutoSave: '更改后自动保存',
      settingsRulesGroup: '统计规则',
      settingsSidebarGroup: '侧栏入口',
      detailsSessionsTitle: '会话记录',
      detailsSessionsCaption: '按工作区分组，按最近活动排序',
      colWorkspace: '工作区',
      colActive: '活跃',
      colTask: '任务',
      colShare: '任务占比',
      colLast: '最近活动',
      sessionsUnit: '个会话',
      taskCountUnit: '次任务',
      noData: '暂无数据',
      emptyDashboard: '当前周期还没有使用记录，开始使用 DSH 后会自动出现',
      emptyWorkspace: '这个工作区还没有会话记录',
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      hoursAgo: '{n} 小时前',
      daysAgo: '{n} 天前',
      rangeLabel: '统计范围',
      detailsRangeLabel: '明细统计范围',
      detailsRangeToday: '今天',
      detailsRange3d: '近3天',
      detailsRange7d: '最近一周',
      detailsRange30d: '近30天',
      detailsRangeAll: '全部',
      detailsShowMore: '再显示 {count} 个会话',
      detailsShownCount: '已显示 {shown}/{total}',
      expand: '展开会话',
      collapse: '收起会话',
      unionFoot: '实际占用：多会话重叠的时段只计一次。',
      sumFoot: '多会话同时进行时，任务时长按会话分别累计。',
      onlineFoot: '在线：页面打开时长，包含挂机。',
      loadingTitle: '正在读取时长统计',
      errorTitle: '暂时无法读取时长统计',
      retryHint: '正在自动重试，稍后会自动恢复',
      backfillIdle: '历史任务回填尚未开始，统计可能不完整',
      backfillUnavailable: '无法读取历史回填状态，请重新加载插件或重启 DSH',
      backfillRunning: '正在回填历史任务',
      backfillProgress: '已扫描 {done}/{total} 个会话，累计回填 {tasks} 条任务',
      backfillDone: '历史任务回填完成',
      backfillDoneHint: '已累计回填 {tasks} 条历史任务，仪表盘数据已更新',
      backfillFailed: '历史任务回填失败',
      backfillRetry: '重试',
      backfillRetrying: '正在重新回填…',
      backfillDismiss: '知道了',
      backfillChipRunning: '回填中',
      backfillChipDone: '回填完成',
      backfillChipFailed: '回填失败',
      backfillChipUnavailable: '回填状态不可用',
      topbarNoticesLabel: '通知',
      noticeDismiss: '关闭通知',
      approximateChipLabel: '近似记录',
      backfillNoticeCount: '累计回填 {tasks} 条',
      backfillNoticeRead: '已读',
      backfillNoticeUnread: '待确认',
      backfillNoticeKindInitial: '首次回填',
      backfillNoticeKindVersion: '版本升级重扫',
      backfillNoticeKindRetry: '手动重试',
      backfillNoticeKindClear: '清空后重新回填',
      backfillNoticeEmpty: '暂无通知记录',
      backfillNoticeUnavailable: '暂时无法读取通知记录',
      subagentDetail: '子代理任务',
      subagentDetailHint: '共 {count} 条，合计 {duration}（不计入总计）',
      settingsNav: 'TimeSpan',
      settingsTitle: 'TimeSpan 设置',
      settingsHint: '改动即存本机并立即生效，重启后仍然生效。',
      settingsIdleLabel: '空闲阈值',
      settingsIdleHint: '页面可见且聚焦时，无操作超过阈值便停止累计活跃时长',
      settingsIdleUnit: '分钟',
      settingsIdleRange: '可选 1–15 分钟',
      settingsWeekLabel: '每周起始',
      settingsWeekHint: '设置「本周」统计从周一或周日开始',
      settingsWeekMonday: '周一',
      settingsWeekSunday: '周日',
      settingsSubagentLabel: '显示子代理明细',
      settingsSubagentHint: '显示父会话下的子代理任务，不影响总计',
      settingsSubagentOn: '显示',
      settingsSubagentOff: '隐藏',
      settingsSidebarNameLabel: '侧栏显示状态',
      settingsSidebarNameHint: '在时长旁显示「空闲」「活跃中」或「任务中」',
      settingsSidebarNameOn: '显示状态',
      settingsSidebarNameOff: '隐藏状态',
      settingsSidebarDotLabel: '侧栏状态点',
      settingsSidebarDotHint: '用圆点颜色区分空闲、活跃中和任务中',
      settingsSidebarDotOn: '显示',
      settingsSidebarDotOff: '隐藏',
      settingsSidebarDotPositionLabel: '状态点位置',
      settingsSidebarDotPositionHint: '跟随时长：紧靠数字；最右侧：贴住侧栏行末',
      settingsSidebarDotPositionEnd: '最右侧',
      settingsSidebarDotPositionInline: '跟随时长',
      settingsSidebarDurationLabel: '侧栏显示时长',
      settingsSidebarDurationHint: '选择侧栏显示的时长，今日构成环保持不变',
      sidebarDurationOnline: '在线时长',
      sidebarDurationActive: '活跃时长',
      sidebarDurationTask: '任务时长',
      settingsLanguageLabel: '界面语言',
      settingsLanguageHint: '仅切换 TimeSpan 的语言，不影响 DSH',
      settingsSave: '保存设置',
      settingsSaving: '正在保存…',
      settingsSaved: '已保存，统计已按新设置更新',
      settingsLoadError: '无法读取设置，请重试',
      settingsRetry: '重试',
      settingsSaveError: '设置保存失败，请重试',
      settingsSectionGeneral: '统计口径',
      settingsSectionDisplay: '明细展示',
      settingsSectionBasics: '统计与显示',
      settingsBasicsHint: '统计规则与侧栏显示，修改后立即生效',
      settingsSectionFormat: '数字格式',
      settingsFormatHint: '选择后整页立即预览并自动保存，刷新后沿用已保存的格式。',
      settingsFormatShared: '侧栏、概览、趋势、会话与导出共用这一格式。',
      formatHintHms: '时:分:秒',
      formatHintShort: '紧凑单位',
      formatHintZh: '中文单位',
      formatHintSec: '纯秒',
      formatHintPadded: '补零时钟',
      formatHintDecimal: '小数小时',
      formatDecimalDetail: '小数小时 · 四舍五入至两位小数',
      formatPreviewLabel: '预览 · 2:48:16 显示为',
      settingsResetTitle: '初始化设置',
      settingsResetHint: '将界面、统计、分析模型与提示音设置恢复为默认值。统计、计时和报告会保留。',
      settingsResetButton: '恢复初始设置',
      settingsResetConfirmTitle: '恢复初始设置？',
      settingsResetConfirmHint: '恢复默认界面和统计偏好，清除分析模型选择并开启倒计时提示音。现有统计、计时和报告会保留。',
      settingsResetConfirm: '确认恢复',
      settingsResetCancel: '取消',
      settingsResetDone: '已恢复初始设置',
      settingsResetError: '恢复初始设置失败，请重试',
      settingsSectionNotices: '通知记录',
      settingsNoticesHint: '这里保留每次历史任务回填的完成记录；如果旧会话任务没有出现，可重新扫描一次。',
      dataTitle: '数据管理',
      dataHint: 'JSON 备份包含统计原始记录、设置、最近计时结果和 AI 报告。CSV 导出每日统计。',
      exportJson: '导出 JSON',
      exportCsv: '导出 CSV',
      exporting: '正在导出…',
      exportDone: '导出文件已开始下载',
      exportTruncated: '导出文件已开始下载；数据跨度超过上限，仅包含最近的部分',
      exportError: '导出失败，请重试',
      clearData: '清空全部数据',
      clearStepTitle: '确认清空？',
      clearStepHint: '清空会停止当前计时，删除本机的统计、最近计时结果和 AI 报告。设置与 DSH 会话日志会保留。此操作无法撤销。',
      clearConfirm: '确认清空',
      clearCancel: '取消',
      clearing: '正在清空…',
      clearError: '清空失败，请重试',
      cleared: '已清空统计、计时和报告',
      approximateDismiss: '不再显示',
      approximateShowAgain: '重新显示「近似记录」说明',
      approximateShowAgainHint: '该说明只在存在近似记录时出现；之前关掉后，可用这里恢复显示。',
      approximateShowRestored: '已重新开启近似记录说明',
      approximateShowNoData: '已重新开启；当前没有近似记录，所以提示条暂时不会出现',
      approximateShowError: '操作失败，请稍后重试',
      savedBadge: '已保存',
      importData: '选择备份文件导入',
      importHint: '导入 TimeSpan 的 JSON 备份。按 ID 合并统计，计时结果与各周期报告只填补本机空缺。当前计时保持原状态。',
      importInvalid: '这不是有效的 dsh-timespan 备份（需要 format 为 dsh-timespan-export 或 chronoscope-export 且 version 为 1）。',
      importPreviewTitle: '待导入文件',
      importIntervals: '时间区间',
      importTasks: '任务',
      importReports: 'AI 报告',
      importTimerResult: '含最近计时结果',
      importRestoreSettings: '一并导入文件中的设置',
      importConfirm: '确认导入',
      importCancel: '取消',
      importSuccess: '导入完成',
      importResult: '新增 {imported} 条，跳过重复 {skipped} 条',
      importReadFailed: '读取文件失败',
      importFileHint: '未选择文件',
      importFilePicked: '已选择：',
    }

    const en = {
      title: 'TimeSpan',

      todayActive: 'Active today',
      todayOnline: 'Online today',
      todayTask: 'Task time today',
      weekOnline: 'Online this week',
      weekTask: 'Task time this week',
      monthOnline: 'Online this month',
      monthTask: 'Task time this month',
      openSession: 'Open session',
      live: 'Active',
      idle: 'Idle',
      onlineLive: 'Recording',
      onlinePaused: 'Paused',
      taskRunning: 'In task',
      taskIdle: 'No running task',
      taskCountLabel: 'Tasks',
      actualOccupied: 'Actual occupied',
      focusSet: 'Set as focus view',
      focusUnset: 'Exit focus view',
      settingsLinksLabel: 'Project links',
      settingsRepoAction: 'Open the GitHub project page',
      settingsIssueAction: 'Submit or view an issue',
      settingsStarAction: 'Star this project on GitHub',
      activeShare: 'Active share',
      taskShare: 'Task share',
      weekActiveShare: 'Active share this week',
      monthActiveShare: 'Active share this month',
      focusSummary: 'Focus overview',
      focusTodayActive: 'Active today',
      focusWeekActive: 'Active this week',
      focusMonthActive: 'Active this month',
      heroMetricWeekTitle: 'Active this week',
      heroMetricMonthTitle: 'Active this month',
      heroMetricGroup: 'Focus metric',
      sessionTasks: 'Session tasks',
      accumulated: 'Accumulated',
      noTasks: 'No tasks recorded today',
      unknownSession: 'Untitled session',
      unassigned: 'Unassigned',
      runningTag: 'Running',
      approximateTag: 'Approx.',
      approximateHint: 'Some records end at the last heartbeat or event; duration may be short',
      approximateNotice: 'Some records end at the last heartbeat or last event (abnormal end, reload, long silence or clock change), so their duration may be short.',
      notBroken: 'Not broken down',
      breakdownModel: 'Model',
      breakdownTool: 'Tools',
      breakdownWait: 'Waiting',
      breakdownOther: 'Other',
      loading: 'Loading…',
      error: 'Unable to read time statistics. Retrying automatically.',
      sinceBoot: 'Active: counted while the page is visible, the window is focused and there is input.',
      localOnly: 'Data stays on this device',
      navTooltip: 'TimeSpan · online, active and task time',
      periodDay: 'Day',
      periodWeek: 'Week',
      periodMonth: 'Month',
      periodLabel: 'Period',
      paletteLabel: 'Colors',
      paletteToggle: 'Colors: {name}',
      appearanceLabel: 'Appearance',
      appearanceLight: 'Light',
      appearanceDark: 'Dark',
      appearanceSystem: 'System',
      appearanceToggle: 'Appearance: {mode}; click to cycle',
      selectedPeriod: 'Current',
      tabOverview: 'Overview',
      tabTrend: 'Trend',
      tabDetails: 'Sessions',
      tabSettings: 'Settings',
      tabAnalysis: 'Review',
      tabsLabel: 'TimeSpan pages',
      recentSessions: 'Recent sessions',
      recentSessionsHint: 'Ordered by last activity',
      recentSessionsEmpty: 'No sessions in this period yet',
      trendSummary: 'Period summary',
      peakActive: 'Peak active',
      peakPeriod: 'Most active period',
      trendBreakdownTitle: 'Time distribution',
      trendBreakdownHint: 'Top 7 busiest buckets by combined active and task time.',
      trendBreakdownEmpty: 'No time-bucket data',
      trendInsightsTitle: 'Trend insights',
      trendInsightsHint: 'Active peak and the share of time in the three busiest periods',
      trendInsightPeak: 'Peak period',
      trendInsightCoverage: 'Active coverage',
      trendInsightConcentration: 'Top-3 concentration',
      trendInsightTaskRatio: 'Task / online',
      trendInsightNote: 'Top-3 concentration: the three busiest periods as a share of total active time',
      trendFocusTitle: 'Active and task trend',
      heatmapFocusTitle: 'Daily activity heatmap',
      moduleTipTrend: 'Active and task time by hour or day; enlarge from the corner',
      moduleTipComposition: 'Share of model, tool, wait and other task time',
      moduleTipRanking: 'Compare workspaces by active time; hover for task share',
      moduleTipRecent: 'Sessions by last activity; click to open',
      rangeOnline: 'Online total',
      rangeActive: 'Active total',
      rangeTask: 'Task total',
      peakDay: 'Peak day',
      activeDaysLabel: 'Active days',
      searchPlaceholder: 'Search workspaces or sessions',
      detailsEmpty: 'No matching workspaces or sessions',
      settingsPageTitle: 'Dashboard settings',
      settingsPageHint: 'Settings stay on this device, apply to later statistics immediately and survive restarts.',
      settingsSectionAppearance: 'Appearance and colors',
      settingsAppearanceHint: 'Affects this browser only and never changes statistics. Applies immediately.',
      settingsAppearanceLocal: 'This device',
      settingsRecheck: 'Rescan history tasks',
      settingsRechecking: 'Scanning…',
      settingsRecheckDone: 'History tasks rescanned; notification records updated',
      settingsRecheckError: 'Scan failed; please retry later',
      periodLoading: 'Updating; still showing',
      periodLoadFailed: 'Update failed; still showing',
      trendInfo: 'Active and task time may overlap; hover or focus a bar for durations',
      heatmapTitle: 'Daily active time',
      heatLegendLabel: 'Activity level legend',
      heatLegendLow: 'Less',
      heatLegendHigh: 'More',
      heatDayTitle: '{month} {day}',
      noRecord: 'No record',
      heatSummary: 'Total active {active} · Active on {activeDays}/{observedDays} days',
      heatmapLoading: 'Loading daily active time…',
      heatmapEmpty: 'No daily records yet',
      heatmapError: 'Unable to read daily active time',
      heatRangeLabel: 'Range',
      heatRange3m: '3 months',
      heatRange6m: '6 months',
      heatRangeYear: 'Year',
      heatRangeMonth: '{month}',
      yearHeatTitle: 'Daily active time · year',
      monthHeatTitle: 'Daily active time · {month}',
      monthBars: 'Monthly active',
      compositionInfo: 'Task time is summed across sessions; missing historical breakdowns appear as unclassified',
      compositionTitle: 'Task time breakdown',
      shareLabel: 'Share',
      durationLabel: 'Duration',
      workspaceRanking: 'Workspace task ranking',
      noTaskComposition: 'No task time in this period',
      unknownBreakdown: 'Not broken down',
      onlineLabel: 'Online time',
      currentSummary: 'Period summary',
      taskCountShort: 'Tasks',
      dailyAverageActive: 'Daily active',
      dailyAverageTask: 'Daily task',
      dailyAverageHint: 'Daily averages use calendar days',
      recordSinceBoot: 'Online and active time are recorded from plugin enablement; history only backfills task time.',
      paletteBlue: 'Sky Blue',
      paletteStone: 'Graphite',
      paletteCyan: 'Cyan',
      paletteCoral: 'Coral',
      paletteSaveError: 'Appearance preference could not be saved',
      timerTitle: 'Manual timer',
      timerClock: 'Local time',
      timerStopwatch: 'Stopwatch',
      timerCountdown: 'Countdown',
      timerIdle: 'Ready',
      timerRunning: 'Running',
      timerPaused: 'Paused',
      timerCompleted: 'Completed',
      timerExpired: 'Countdown finished',
      timerSyncing: 'Syncing timer',
      timerSyncError: 'Could not sync the timer',
      timerActionError: 'Timer action failed. Sync and try again.',
      timerChanged: 'The timer changed elsewhere. Sync and try again.',
      timerSaving: 'Saving timer state',
      timerRefresh: 'Sync timer',
      timerStart: 'Start',
      timerPause: 'Pause',
      timerResume: 'Resume',
      timerComplete: 'Finish',
      timerReset: 'Reset',
      timerDuration: 'Countdown duration',
      timerMinutes: 'min',
      timerSeconds: 'sec',
      timerDurationInvalid: 'Enter a duration from 1 second to 7 days, with seconds between 0 and 59.',
      timerLastResult: 'Last completed',
      timerDeleteResult: 'Delete this timer result',
      timerResultElapsed: '{time} elapsed',
      timerSoundBlocked: 'Interact with this page to play the chime.',
      timerPlaySound: 'Play chime',
      timerSoundFailed: 'Could not play the chime. You can try again.',
      floatingTitle: 'Floating timer',
      floatingOpen: 'Open floating timer',
      floatingMinimize: 'Minimize floating timer',
      floatingMove: 'Drag to move; arrow keys to adjust, Shift for larger steps, Home to reset',
      floatingWake: 'Restore docked timer',
      floatingMenu: 'Floating timer menu',
      floatingExit: 'Exit floating timer',
      floatingExitHint: 'Timing continues; enable it again in Settings',
      floatingExitError: 'Could not close the floating timer. Try again',
      settingsFloatingTitle: 'Floating window',
      settingsFloatingEnabled: 'Show conversation timer',
      settingsFloatingEnabledHint: 'Hiding the window keeps timing and completion reminders running.',
      settingsFloatingClock: 'Include analog clock',
      settingsFloatingHint: 'Starts at the top left below the conversation header. Docks after 3 seconds near an edge; hover to restore, or right-click to exit.',
      timerNoticeError: 'Could not sync the countdown reminder. Try again.',
      timerClose: 'Close',
      settingsTimerTitle: 'Countdown reminder',
      settingsTimerSound: 'Play chime',
      settingsTimerSoundHint: 'Play a short sound when a countdown finishes.',
      settingsAnalysisTitle: 'Analysis model',
      settingsAnalysisHint: 'Use a model configured in DSH, independently of your session model.',
      analysisProvider: 'Provider',
      analysisModel: 'Model',
      analysisChooseProvider: 'Select a provider',
      analysisChooseModel: 'Select a model',
      analysisCatalogRefresh: 'Refresh model catalog',
      analysisCatalogLoading: 'Reading model catalog',
      analysisCatalogError: 'Could not read the model catalog. Refresh to try again.',
      analysisCatalogPartial: 'Model catalogs unavailable for {providers}',
      analysisCatalogEmpty: 'No models are currently available in DSH.',
      analysisSavedProviderMissing: 'The selected provider is unavailable. Your selection was kept.',
      analysisSavedModelMissing: 'The selected model is unavailable. Your selection was kept.',
      analysisTitle: 'Time review',
      analysisEmpty: 'Generate a report on time allocation and session progress for this period.',
      analysisLoading: 'Reading analysis reports',
      analysisReadError: 'Could not refresh the analysis. The loaded report is still shown.',
      analysisReadEmptyError: 'Could not read the analysis status. Try again.',
      analysisGenerate: 'Generate report',
      analysisRegenerate: 'Regenerate report',
      analysisRetryGenerate: 'Retry generation',
      analysisCancel: 'Cancel generation',
      analysisStarting: 'Starting analysis',
      analysisStartError: 'Could not confirm that analysis started. Check the refreshed status or try again.',
      analysisCancelling: 'Cancelling analysis',
      analysisCancelled: 'This analysis was cancelled.',
      analysisCollecting: 'Reading sessions',
      analysisGenerating: 'Generating report',
      analysisSaving: 'Saving report',
      analysisRangeLoading: 'Loading scope options for this period.',
      analysisPeriod: 'Period',
      analysisWorkspace: 'Workspace',
      analysisSession: 'Session',
      analysisAllWorkspaces: 'All workspaces',
      analysisAllSessions: 'All sessions',
      analysisNoScopeSessions: 'There are no recorded sessions in this scope.',
      analysisStatistics: 'Time observations',
      analysisWork: 'Work progress',
      analysisSuggestions: 'Next steps',
      analysisNoWork: 'The sessions read contain no work to summarize.',
      analysisSources: 'Source sessions · {count}',
      analysisOpenSource: 'Open source session {name}',
      analysisSourceError: 'Could not open source session {name}.',
      analysisReportRange: 'Report scope',
      analysisGeneratedAt: 'Generated',
      analysisRunRange: 'Analysis scope',
      analysisReportScopeMismatch: 'The last report is shown with the scope it used when generated.',
      analysisReportScopeMismatchShort: 'Previous report',
      analysisModelRequiredShort: 'Analysis model not set',
      analysisCoverage: '{total} sessions in scope · {read} read · {included} included',
      analysisCoverageFailed: '{count} sessions could not be read',
      analysisFailureDetails: 'Failure details',
      analysisFailureMissing: 'Record not found',
      analysisFailureInvalid: 'Invalid record format',
      analysisFailureUnavailable: 'Record temporarily unavailable',
      analysisFailureUnknown: 'The reason was not recorded',
      analysisFailureNotListed: '{count} more sessions with read failures are not listed.',
      analysisFailureNoDetails: 'This report saved only the number of failures. Adjust the scope and regenerate to see the new read results.',
      analysisFailureOutsideScope: 'This session is absent from the current period’s filters.',
      analysisFailureSelect: 'Select this session',
      analysisFailureSelectNamed: 'Select session {name} for analysis',
      analysisFailureOpen: 'Open session {name}',
      analysisRangeFilters: 'Analysis scope filters',
      analysisReturnToRange: 'Back to scope filters',
      analysisNoticeDismiss: 'Dismiss notice',
      analysisCoverageOmitted: '{count} sessions omitted',
      analysisCoverageTruncated: 'Some content was excerpted',
      analysisCoverageRelatedUnavailable: 'The related subagent session catalog was unavailable',
      analysisGoToSettings: 'Configure analysis model',
      analysisModelUse: 'Send statistics and session content in this scope to {route} for analysis.',
      analysisModelLoading: 'Reading the selected analysis model.',
      analysisModelReadError: 'Could not read the selected analysis model. Try again.',
      analysisModelChanged: 'The analysis model changed. Check the current model and try again.',
      analysisModelRequired: 'Select an analysis model in settings.',
      analysisModelUnavailable: 'The selected model is unavailable. Check your model settings.',
      analysisCatalogUnavailable: 'Could not read the model catalog. Try again.',
      analysisInputUnavailable: 'Could not read the input for analysis. Try again.',
      analysisScopeUnavailable: 'The selected workspace or session is outside the recorded scope. Select a new scope.',
      analysisHostUnavailable: 'This DSH instance cannot generate analysis reports.',
      analysisNoData: 'There are no records to analyze in this scope.',
      analysisGenerationError: 'Report generation failed. Try again.',
      analysisInvalidOutput: 'The model returned an incomplete report. Try again.',
      analysisSaveError: 'Could not save the report. Try again.',
      analysisCancelError: 'Could not cancel the analysis. Try again.',
      reportTitle: 'Time review',
      reviewDay: 'Daily review',
      reviewWeek: 'Weekly review',
      reviewMonth: 'Monthly review',
      reviewMetrics: 'Time at a glance',
      reviewRhythm: 'Activity rhythm',
      reviewRhythmHint: 'Active and task time by bucket in this period; taller bars mean more focused time',
      reviewWorkspaces: 'Across workspaces',
      reviewWorkspacesHint: 'Compare workspaces by accumulated active time and show each share; top four plus the rest',
      reviewObservationsHint: 'Time facts for this period: boundaries, definitions and key readings',
      reviewWorkHint: 'Progress drawn from included sessions; expand to open the sources',
      reviewNextHint: 'Suggested next steps based on this period; expand to read them all',
      reviewWorkspaceBasis: 'Accumulated active time · per session',
      reviewBasis: 'Measurement basis',
      reviewActualTime: 'Actual occupied time · overlaps counted once',
      reviewOnlineNA: 'Online time does not apply to this filter',
      reviewTasks: '{count} tasks',
      reviewEvidence: 'Sessions included',
      reviewReadCount: '{read} read / {total} in scope',
      reviewEvidenceHint: 'Count · Sources whose in-period text reached the model',
      reviewEvidenceEmpty: 'Zero · The sessions read have no text in this period',
      reviewEvidenceNone: 'Zero · No sessions were recorded in this period',
      reviewEvidenceUnavailable: 'Zero · Reading or content limits excluded the text',
      reviewEvidenceScope: 'Scope · Messages, relevant tool results and subagent conclusions',
      reviewEvidenceNext: 'Include · Choose a period with messages, or chat and regenerate',
      reviewEvidenceCheck: 'Check · Review Scope and sources, then regenerate',
      reviewEvidenceRefresh: 'Update · Regenerate after changing the scope',
      reviewFilters: 'Scope',
      reviewAllScope: 'All workspaces and sessions',
      reviewLess: 'Show less',
      reviewSnapshotMissing: 'This older report has no statistics snapshot. Regenerate for charts; its original text is still available.',
      reviewSnapshotPartial: 'Charts show only the statistics provided to the model',
      reviewMore: 'Show {count} more',
      reviewExpand: 'Read in full',
      reviewCollapse: 'Show less',
      reviewPoint: 'Observation {count}',
      reviewAction: 'Suggestion {count}',
      reviewWorkItem: 'Progress {count}',
      reviewNoActivity: 'No active or task time recorded in this scope',
      reviewNoWorkspaces: 'No workspace activity recorded in this scope',
      reviewOtherWorkspaces: 'Other workspaces',
      reviewEvidenceTitle: 'Scope and evidence',
      reportAbstract: 'Summary',
      reportDetails: 'Report details',
      reportCoverage: 'Content coverage',
      reportWorkSources: 'Sources',
      reportActions: 'Report actions',
      reportCopy: 'Copy Markdown',
      reportExport: 'Export .md',
      reportCopied: 'Copied Markdown.',
      reportExportStarted: 'Markdown download requested.',
      reportExportError: 'Could not download the report. Try again or copy the Markdown.',
      reportCopyManual: 'Could not write to the clipboard. Copy the text below.',
      reportMarkdownContent: 'Report Markdown text',
      reportCloseCopy: 'Hide text',
      reportPending: 'The report will appear here once saved.',
      cycleToday: 'Today',
      cycleWeek: 'This week',
      cycleMonth: 'This month',
      activeLabel: 'Active',
      taskLabel: 'Task',
      overviewTitle: 'Period overview',
      unionTag: 'Actual occupied · overlaps once',
      sumTag: 'Accumulated · per session',
      trendDay: '24 hours today',
      trendWeek: 'Daily this week',
      trendMonth: 'Daily this month',
      trendHint: 'Active and task time',
      workspaceTitle: 'Workspace breakdown',
      workspaceHint: 'Expand to see sessions',
      detailsAll: 'All',
      detailsSessionCount: 'Sessions',
      detailsRunning: 'Running',
      detailsSortLabel: 'Sort sessions',
      detailsSortRecent: 'Recent activity',
      detailsSortTask: 'Task time',
      detailsSortActive: 'Active time',
      detailsInspect: 'View statistics',
      detailsInspector: 'Session statistics',
      detailsInspectorEmpty: 'Select a session to inspect its time and task breakdown',
      detailsSelectionHidden: 'The selected session is outside the current results',
      detailsExpandAll: 'Expand all',
      detailsCollapseAll: 'Collapse all',
      detailsFiltered: 'Results: {workspaces} workspaces · {sessions} sessions',
      detailsTaskScope: 'Task time · Accumulated',
      detailsIndependent: 'Active and task time are independent; tasks can continue while idle',
      detailsRangeSelected: 'Selected interval',
      detailsLoading: 'Loading sessions for the selected range…',
      detailsLoadError: 'Could not load sessions for this range',
      detailsOpenFallback: 'The original session could not be opened. Its statistics are available here.',
      trendOpenSessions: 'View sessions in this interval',
      trendPeakSessions: 'Sessions · {range}',
      trendNotStarted: 'Not started',
      trendFutureHint: 'Dashed cells have not started',
      trendDistributionHour: 'Hourly · Active time',
      trendDistributionDay: 'Daily · Active time',
      trendDistributionHint: 'Darker means more active time; empty means inactive, dashed means not yet started',
      settingsSidebarPreview: 'Sidebar preview',
      settingsAutoSave: 'Changes save automatically',
      settingsRulesGroup: 'Statistics',
      settingsSidebarGroup: 'Sidebar',
      detailsSessionsTitle: 'Sessions',
      detailsSessionsCaption: 'Grouped by workspace, latest activity first',
      colWorkspace: 'Workspace',
      colActive: 'Active',
      colTask: 'Task',
      colShare: 'Task share',
      colLast: 'Last activity',
      sessionsUnit: ' sessions',
      taskCountUnit: ' tasks',
      noData: 'No data',
      emptyDashboard: 'No usage in this period yet. It appears automatically as you use DSH.',
      emptyWorkspace: 'No sessions in this workspace yet',
      justNow: 'Just now',
      minutesAgo: '{n} min ago',
      hoursAgo: '{n} h ago',
      daysAgo: '{n} d ago',
      rangeLabel: 'Range',
      detailsRangeLabel: 'Details range',
      detailsRangeToday: 'Today',
      detailsRange3d: 'Last 3 days',
      detailsRange7d: 'Last week',
      detailsRange30d: 'Last 30 days',
      detailsRangeAll: 'All time',
      detailsShowMore: 'Show {count} more sessions',
      detailsShownCount: '{shown}/{total} shown',
      expand: 'Expand sessions',
      collapse: 'Collapse sessions',
      unionFoot: 'Actual occupied: overlapping time across sessions counts once.',
      sumFoot: 'When sessions run in parallel, task time is summed per session.',
      onlineFoot: 'Online: time the page is open, including idle time.',
      loadingTitle: 'Loading time statistics',
      errorTitle: 'Unable to read time statistics',
      retryHint: 'Retrying automatically',
      backfillIdle: 'Historical backfill has not started; statistics may be incomplete',
      backfillUnavailable: 'Cannot read historical backfill status. Reload the plugin or restart DSH.',
      backfillRunning: 'Backfilling historical tasks',
      backfillProgress: 'Scanned {done}/{total} sessions; cumulative total {tasks} tasks',
      backfillDone: 'Historical backfill complete',
      backfillDoneHint: 'Cumulative total: {tasks} historical tasks backfilled; dashboard is up to date',
      backfillFailed: 'Historical backfill failed',
      backfillRetry: 'Retry',
      backfillRetrying: 'Restarting backfill…',
      backfillDismiss: 'Got it',
      backfillChipRunning: 'Backfilling',
      backfillChipDone: 'Backfill done',
      backfillChipFailed: 'Backfill failed',
      backfillChipUnavailable: 'Backfill unavailable',
      topbarNoticesLabel: 'Notifications',
      noticeDismiss: 'Dismiss notification',
      approximateChipLabel: 'Approximate records',
      backfillNoticeCount: 'Cumulative total: {tasks} tasks',
      backfillNoticeRead: 'Read',
      backfillNoticeUnread: 'Unread',
      backfillNoticeKindInitial: 'Initial backfill',
      backfillNoticeKindVersion: 'Version rescan',
      backfillNoticeKindRetry: 'Manual retry',
      backfillNoticeKindClear: 'Backfill after clearing data',
      backfillNoticeEmpty: 'No notifications yet',
      backfillNoticeUnavailable: 'Notification records are temporarily unavailable',
      subagentDetail: 'Subagent tasks',
      subagentDetailHint: '{count} tasks · {duration} total (excluded from totals)',
      settingsNav: 'TimeSpan',
      settingsTitle: 'TimeSpan settings',
      settingsHint: 'Settings stay on this device, apply to later statistics immediately and survive restarts.',
      settingsIdleLabel: 'Idle threshold',
      settingsIdleHint: 'While the page is visible and focused, active time stops after this long without input',
      settingsIdleUnit: 'min',
      settingsIdleRange: '1–15 minutes',
      settingsWeekLabel: 'Week starts on',
      settingsWeekHint: 'Start this week’s statistics on Monday or Sunday',
      settingsWeekMonday: 'Monday',
      settingsWeekSunday: 'Sunday',
      settingsSubagentLabel: 'Show subagent detail',
      settingsSubagentHint: 'Show subagent tasks under parent sessions without changing totals',
      settingsSubagentOn: 'Shown',
      settingsSubagentOff: 'Hidden',
      settingsSidebarNameLabel: 'Show sidebar status',
      settingsSidebarNameHint: 'Show Idle, Active or In task next to the duration',
      settingsSidebarNameOn: 'Show status',
      settingsSidebarNameOff: 'Hide status',
      settingsSidebarDotLabel: 'Sidebar status dot',
      settingsSidebarDotHint: 'Use a colored dot to indicate idle, active or in task',
      settingsSidebarDotOn: 'Shown',
      settingsSidebarDotOff: 'Hidden',
      settingsSidebarDotPositionLabel: 'Status dot position',
      settingsSidebarDotPositionHint: 'Place the dot after the duration or at the far right of the sidebar row',
      settingsSidebarDotPositionEnd: 'Far right',
      settingsSidebarDotPositionInline: 'After duration',
      settingsSidebarDurationLabel: 'Sidebar duration',
      settingsSidebarDurationHint: 'Choose the sidebar duration; the today ring stays unchanged',
      sidebarDurationOnline: 'Online',
      sidebarDurationActive: 'Active',
      sidebarDurationTask: 'Task',
      settingsLanguageLabel: 'Interface language',
      settingsLanguageHint: 'Change TimeSpan’s language without changing DSH',
      settingsSave: 'Save settings',
      settingsSaving: 'Saving…',
      settingsSaved: 'Saved; statistics now use the new settings',
      settingsLoadError: 'Unable to read settings; please retry',
      settingsRetry: 'Retry',
      settingsSaveError: 'Could not save settings; please retry',
      settingsSectionGeneral: 'Counting rules',
      settingsSectionDisplay: 'Detail display',
      settingsSectionBasics: 'Counting and display',
      settingsBasicsHint: 'Counting rules and sidebar display; changes apply immediately',
      settingsSectionFormat: 'Number format',
      settingsFormatHint: 'The whole page previews immediately and the choice is saved automatically; the saved format survives refresh.',
      settingsFormatShared: 'The sidebar, overview, trend, sessions and exports all use this format.',
      formatHintHms: 'Hours:minutes:seconds',
      formatHintShort: 'Compact units',
      formatHintZh: 'Chinese units',
      formatHintSec: 'Total seconds',
      formatHintPadded: 'Padded clock',
      formatHintDecimal: 'Decimal hours',
      formatDecimalDetail: 'Decimal hours · rounded to two decimal places',
      formatPreviewLabel: 'Preview · 2:48:16 shows as',
      settingsResetTitle: 'Initial settings',
      settingsResetHint: 'Restore the interface, tracking, analysis model and chime settings to their defaults. Statistics, timers and reports are kept.',
      settingsResetButton: 'Restore initial settings',
      settingsResetConfirmTitle: 'Restore initial settings?',
      settingsResetConfirmHint: 'Restore the default interface and tracking preferences, clear the analysis model choice and turn the countdown chime on. Existing statistics, timers and reports are kept.',
      settingsResetConfirm: 'Restore',
      settingsResetCancel: 'Cancel',
      settingsResetDone: 'Initial settings restored',
      settingsResetError: 'Could not restore initial settings; please retry',
      settingsSectionNotices: 'Notifications',
      settingsNoticesHint: 'Keeps a record of each history-task backfill. If old session tasks are missing, rescan once.',
      dataTitle: 'Data',
      dataHint: 'JSON backs up raw statistics, settings, the last timer result and AI reports. CSV exports daily totals.',
      exportJson: 'Export JSON',
      exportCsv: 'Export CSV',
      exporting: 'Exporting…',
      exportDone: 'Download started',
      exportTruncated: 'Download started; the range exceeds the limit and only the most recent part is included',
      exportError: 'Export failed; please retry',
      clearData: 'Clear all data',
      clearStepTitle: 'Clear everything?',
      clearStepHint: 'This stops the current timer and deletes local statistics, the last timer result and AI reports. Settings and DSH session logs are kept. This cannot be undone.',
      clearConfirm: 'Confirm clear',
      clearCancel: 'Cancel',
      clearing: 'Clearing…',
      clearError: 'Clear failed; please retry',
      cleared: 'Statistics, timers and reports cleared',
      approximateDismiss: 'Dismiss',
      approximateShowAgain: 'Show the “approximate records” note again',
      approximateShowAgainHint: 'The note only appears when approximate records exist; restore it here after dismissing.',
      approximateShowRestored: 'The approximate-record note is enabled again',
      approximateShowNoData: 'Enabled again; there are no approximate records, so the banner will not appear yet',
      approximateShowError: 'Could not update the setting; please retry',
      savedBadge: 'Saved',
      importData: 'Choose backup file to import',
      importHint: 'Import a TimeSpan JSON backup. Statistics merge by ID. Timer results and reports fill empty slots. The current timer keeps its state.',
      importInvalid: 'This is not a valid dsh-timespan backup (format must be dsh-timespan-export or chronoscope-export and version must be 1).',
      importPreviewTitle: 'File to import',
      importIntervals: 'Intervals',
      importTasks: 'Tasks',
      importReports: 'AI reports',
      importTimerResult: 'Includes the last timer result',
      importRestoreSettings: 'Also import settings from the file',
      importConfirm: 'Import',
      importCancel: 'Cancel',
      importSuccess: 'Import complete',
      importResult: 'Added {imported}, skipped {skipped} duplicates',
      importReadFailed: 'Could not read file',
      importFileHint: 'No file selected',
      importFilePicked: 'Selected: ',
    }

    /**
     * 当前界面语言。宿主设置是唯一权威副本：这里只是「已经读到的那个值」，
     * 由 callSettings 在每次读写设置时写入，页面刷新后重新从 Host 落回来。
     */
    let activeLanguage = DEFAULT_LANGUAGE
    /** 语言变化事件：切换后通知侧栏入口、仪表盘与设置页各自重渲染。 */
    const languageListeners = new Set()

    /** 语言只认 zh / en；脏值回落默认中文，与 Host 侧的归一化规则一致。 */
    function normalizeLanguage(value) {
      return LANGUAGE_VALUES.includes(value) ? value : DEFAULT_LANGUAGE
    }

    function currentLanguage() {
      return activeLanguage
    }

    function subscribeLanguage(listener) {
      languageListeners.add(listener)
      return () => languageListeners.delete(listener)
    }

    /**
     * 把 Host 读回的语言落到本地并广播。值没变时什么也不做：统计与设置
     * 每次轮询都带回语言，不去重会让三个点位每秒空转重渲染。
     */
    function applyLanguage(value) {
      const next = normalizeLanguage(value)
      if (next === activeLanguage) return next
      activeLanguage = next
      for (const listener of [...languageListeners]) {
        try {
          listener(next)
        } catch {
          // 单个监听器失败不影响其它点位换文案。
        }
      }
      return next
    }

    /**
     * 翻译：按当前语言查插件自己的字典，查不到时回落到默认中文，再查不到
     * 就原样返回键名。函数引用恒定，可以安全地随 inject 传给各个点位。
     */
    function translate(key) {
      const primary = activeLanguage === 'en' ? en : zh
      const text = primary[key] ?? zh[key]
      return typeof text === 'string' ? text : key
    }

    /**
     * 语言变化时强制所在组件重渲染：文案由 translate 现读，组件自己不存语言
     * 副本，因此一个 revision 计数就够。
     */
    function useLanguageRevision() {
      const [, setRevision] = React.useState(0)
      React.useEffect(() => subscribeLanguage(() => setRevision((value) => value + 1)), [])
    }

    /** 每个页面实例一个 Client 标识；刷新后旧区间按最后心跳收口。 */
    const CLIENT_ID = createClientId()

    function createClientId() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `client_${crypto.randomUUID()}`
      }
      return `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
    }

    function DshTimespanIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 16
      return h('svg', {
        className: 'dsh-timespan-nav-icon', width: size, height: size,
        viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
      },
      h('path', { d: 'M3.69 10.23 A8.5 8.5 0 0 1 20.31 10.23', stroke: 'var(--cs-brand-ring-high, currentColor)',
        strokeWidth: 2.2, strokeLinecap: 'round', fill: 'none' }),
      // 圆环一共三段：上半段与左下段随主题对调明暗，右下段固定任务紫；每处留 24° 圆心角空档，
      // 两端半圆端帽占去一部分后仍有约 1.36 个画布单位的可见空隙。指针在浅色主题改用深色，避免白针落在白底上。
      h('path', { d: 'M20.31 13.77 A8.5 8.5 0 0 1 13.77 20.31', stroke: 'var(--cs-task, #C29BE8)',
        strokeWidth: 2.2, strokeLinecap: 'round', fill: 'none' }),
      h('path', { d: 'M10.23 20.31 A8.5 8.5 0 0 1 3.69 13.77', stroke: 'var(--cs-brand-ring-low, #133463)',
        strokeWidth: 2.2, strokeLinecap: 'round', fill: 'none' }),
      h('path', { d: 'M12 12l4-4', stroke: 'var(--cs-brand-hand, #ffffff)', strokeWidth: 2, strokeLinecap: 'round' }),
      h('circle', { cx: 12, cy: 12, r: 1.8, fill: 'var(--cs-brand-hand, #ffffff)' }))
    }

    const APPEARANCE_ICONS = {
      light: () => h('svg', { viewBox: '0 0 16 16', width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', 'aria-hidden': true },
        h('circle', { cx: 8, cy: 8, r: 3 }),
        h('path', { d: 'M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1' })),
      dark: () => h('svg', { viewBox: '0 0 16 16', width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8 5.7 5.7 0 1 0 13.2 9.6Z' })),
      system: () => h('svg', { viewBox: '0 0 16 16', width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('rect', { x: 1.6, y: 2.4, width: 12.8, height: 9, rx: 1.2 }),
        h('path', { d: 'M6 14h4M8 11.4V14' })),
    }

    function AppearanceIcon({ mode }) {
      return APPEARANCE_ICONS[normalizeAppearance(mode)]()
    }

    /** 顶栏配色图标：外围白色圆环、中心当前配色的活跃状态点色圆点，像一枚小巧的色卡。 */
    function PaletteIcon() {
      return h('svg', {
        viewBox: '0 0 16 16', width: 15, height: 15, fill: 'none',
        'aria-hidden': true,
      },
        h('circle', {
          className: 'cs-palette-ring',
          cx: 8, cy: 8, r: 6.1,
          fill: 'none', stroke: '#fff', strokeWidth: 1.4,
        }),
        h('circle', {
          className: 'cs-palette-signal',
          cx: 8, cy: 8, r: 3.7,
          fill: 'var(--cs-chart-active, var(--cs-palette-primary, var(--cs-signal)))', stroke: 'none',
        }))
    }

    function appearanceLabelKey(mode) {
      if (mode === 'dark') return 'appearanceDark'
      if (mode === 'system') return 'appearanceSystem'
      return 'appearanceLight'
    }

    /** 明细行的轻量图标语言：用形状替代重复文字，具体数值与解释由统一 HoverTip 承载。 */
    function DetailGlyph({ name, size = 15 }) {
      const common = {
        className: 'cs-detail-glyph', viewBox: '0 0 16 16', width: size, height: size,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.45,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      }
      if (name === 'active') {
        return h('svg', common, h('path', { d: 'M1.5 8h3l2-4.5 3 9 2-4.5h3' }))
      }
      // 本周用七根日柱表达一周七天；今日保持脉冲线，本月用日历框，三种周期一眼可分。
      if (name === 'active-week') {
        return h('svg', common,
          h('path', {
            strokeWidth: 1.2,
            d: 'M1.3 12.7V9.3M3.5 12.7V6.1M5.7 12.7V8.1M7.9 12.7V3.6M10.1 12.7V7M12.3 12.7V5.2M14.5 12.7V9.8',
          }))
      }
      if (name === 'active-month') {
        return h('svg', common,
          h('rect', { x: 1.8, y: 2.8, width: 12.4, height: 10.4, rx: 1.8 }),
          h('path', { d: 'M1.8 6.1h12.4M5.2 1.5v1.7M10.8 1.5v1.7' }),
          h('path', { d: 'M3.4 9.9h1.6l1.2-2.3 1.9 4.6 1.2-2.3h2.3' }))
      }
      if (name === 'summary') {
        // 本周期概览：半圆仪表、指针与两端刻度，表达一眼看全本期关键读数。
        return h('svg', common,
          h('path', { d: 'M2.6 10.8a5.4 5.4 0 0 1 10.8 0' }),
          h('path', { d: 'M2.6 10.8v1.5M13.4 10.8v1.5' }),
          h('path', { d: 'M8 10.8 10.5 7.5' }),
          h('circle', { cx: 8, cy: 10.8, r: .85, fill: 'currentColor', stroke: 'none' }))
      }
      if (name === 'online') {
        return h('svg', common,
          h('rect', { x: 2, y: 2.5, width: 12, height: 8, rx: 1.8 }),
          h('path', { d: 'M8 10.5v3M5.5 13.5h5' }))
      }
      if (name === 'task') {
        // 任务时长：秒表表冠 + 表盘内对勾，表示「一次任务从开始到完成」的计时。
        return h('svg', common,
          h('circle', { cx: 8, cy: 8.9, r: 4.55 }),
          h('path', { d: 'M6.5 2.1h3M8 2.1v1.9' }),
          h('path', { d: 'M11.8 5.2l1.1-1.1' }),
          h('path', { d: 'M5.9 9.1l1.5 1.5 3-3.2' }))
      }
      if (name === 'heat') {
        // 每日活跃：九宫格热力块，用明暗表达一天的热度，和正式热力图同一语言。
        return h('svg', { ...common, fill: 'currentColor', stroke: 'none' },
          ...[[2.1, 2.1, .9], [6.3, 2.1, .4], [10.5, 2.1, .65],
            [2.1, 6.3, .5], [6.3, 6.3, 1], [10.5, 6.3, .3],
            [2.1, 10.5, .75], [6.3, 10.5, .45], [10.5, 10.5, .85]].map(([x, y, opacity], index) =>
            h('rect', { key: index, x, y, width: 3.4, height: 3.4, rx: 1, opacity })))
      }
      if (name === 'count') {
        return h('svg', common,
          h('path', { d: 'M3 5.2h10M3 8h10M3 10.8h6.4' }),
          h('circle', { cx: 12.2, cy: 10.8, r: 1.1, fill: 'currentColor', stroke: 'none' }))
      }
      if (name === 'stats') {
        // 会话统计：卡片框内三根小柱，与趋势图区分，表达单项会话的分项统计。
        return h('svg', common,
          h('rect', { x: 2.3, y: 2.6, width: 11.4, height: 10.8, rx: 2.2 }),
          h('path', { d: 'M5.4 10.6V8.4M8 10.6V5.9M10.6 10.6V7.2' }))
      }
      if (name === 'clock') {
        return h('svg', common,
          h('circle', { cx: 8, cy: 8, r: 5.5 }),
          h('path', { d: 'M8 4.7V8l2.2 1.4' }))
      }
      if (name === 'report') {
        return h('svg', common,
          h('path', { d: 'M10 2.3H4.1A1.4 1.4 0 0 0 2.7 3.7v8.6a1.4 1.4 0 0 0 1.4 1.4h7.3a1.4 1.4 0 0 0 1.4-1.4V5.2zM10 2.3v2.9h2.8M5.4 8h4.5M5.4 10.8h3.2' }))
      }
      // 首次生成报告：文档加笔；重新生成与失败重试继续沿用 refresh 重置箭头。
      if (name === 'generate') {
        return h('svg', common,
          h('path', { d: 'M9.8 2.2H4.1A1.4 1.4 0 0 0 2.7 3.6v8.6a1.4 1.4 0 0 0 1.4 1.4h7.3a1.4 1.4 0 0 0 1.4-1.4V6.9M12.3 2.1l1.6 1.6-4.6 4.6-2.1.5.5-2.1z' }))
      }
      // 设置页项目入口：GitHub 标记用实心，Issue 用聊天气泡，Star 用实心金色星标。
      if (name === 'github') {
        return h('svg', {
          className: 'cs-detail-glyph', viewBox: '0 0 16 16', width: size, height: size,
          fill: 'currentColor', 'aria-hidden': true,
        }, h('path', { d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z' }))
      }
      if (name === 'issue') {
        return h('svg', common,
          h('path', { d: 'M3 3.1h10a1.5 1.5 0 0 1 1.5 1.5v5.2a1.5 1.5 0 0 1-1.5 1.5H7.4l-2.6 2.3v-2.3H3a1.5 1.5 0 0 1-1.5-1.5V4.6A1.5 1.5 0 0 1 3 3.1z' }),
          h('circle', { className: 'cs-issue-dot cs-issue-dot-a', cx: 5.9, cy: 7.2, r: .72, fill: 'currentColor', stroke: 'none' }),
          h('circle', { className: 'cs-issue-dot cs-issue-dot-b', cx: 10.1, cy: 7.2, r: .72, fill: 'currentColor', stroke: 'none' }))
      }
      if (name === 'star') {
        return h('svg', {
          className: 'cs-detail-glyph', viewBox: '0 0 16 16', width: size, height: size,
          'aria-hidden': true,
        },
        h('defs', null,
          h('linearGradient', { id: 'cs-star-gold', x1: '4', y1: '2', x2: '12.4', y2: '14', gradientUnits: 'userSpaceOnUse' },
            h('stop', { offset: '0', stopColor: '#FFD76A' }),
            h('stop', { offset: '.55', stopColor: '#F2B21C' }),
            h('stop', { offset: '1', stopColor: '#E39A00' }))),
        h('path', { fill: 'url(#cs-star-gold)', d: 'M8 1.7l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.5l-3.8 2 .7-4.3-3.1-3 4.3-.6z' }))
      }
      if (name === 'info') {
        return h('svg', common,
          h('circle', { cx: 8, cy: 8, r: 5.5 }),
          h('path', { d: 'M8 7.2v3.4' }),
          h('circle', { cx: 8, cy: 4.9, r: .7, fill: 'currentColor', stroke: 'none' }))
      }
      if (name === 'alert') {
        return h('svg', common,
          h('path', { d: 'M8 2.2 14 13H2z' }),
          h('path', { d: 'M8 6.2v3.2' }),
          h('circle', { cx: 8, cy: 11.2, r: .7, fill: 'currentColor', stroke: 'none' }))
      }
      if (name === 'close') return h('svg', common, h('path', { d: 'M4 4l8 8M12 4l-8 8' }))
      if (name === 'delete') return h('svg', common, h('path', { d: 'M2.5 4h11M6 4V2.5h4V4M4 4l.6 9.5h6.8L12 4M6.5 6.5v4.5M9.5 6.5v4.5' }))
      if (name === 'copy') return h('svg', common,
        h('rect', { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5 }), h('path', { d: 'M10.5 5.5V3.8a1.3 1.3 0 0 0-1.3-1.3H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3h1.7' }))
      if (name === 'download') return h('svg', common, h('path', { d: 'M8 2v7m-3-3 3 3 3-3M3 10v3h10v-3' }))
      if (name === 'check') return h('svg', common, h('path', { d: 'M3.2 8.2 6.4 11.4 12.8 4.8' }))
      if (name === 'refresh') return h('svg', common, h('path', { d: 'M12.9 6A5.2 5.2 0 1 0 13 10M13 2.5V6H9.5' }))
      if (name === 'filter') return h('svg', common, h('path', { d: 'M2.5 4h11M4.5 8h7M6.5 12h3' }))
      if (name === 'breakdown') {
        return h('svg', common,
          h('circle', { cx: 8, cy: 8, r: 5.5 }),
          h('path', { d: 'M8 2.5V8h5.5' }))
      }
      if (name === 'subagent') {
        return h('svg', common,
          h('circle', { cx: 3.4, cy: 8, r: 1.6 }),
          h('circle', { cx: 12.6, cy: 4, r: 1.6 }),
          h('circle', { cx: 12.6, cy: 12, r: 1.6 }),
          h('path', { d: 'M5 8h2.1M8 8V4.7h3M8 8v3.3h3' }))
      }
      if (name === 'trend') {
        return h('svg', common,
          h('path', { d: 'M2.4 13.2h11.2' }),
          h('path', { d: 'M4 13V9.4M7.2 13V5.8M10.4 13V7.6M13.6 13V3.2' }))
      }
      // 趋势洞察：放大镜里画一条上行折线，表达「从趋势里读出结论」；手柄收短，让圆镜仍是主体。
      if (name === 'insight') {
        return h('svg', common,
          h('circle', { cx: 6.8, cy: 6.8, r: 4.4 }),
          h('path', { d: 'M4.4 8.4 6.1 6.5l1.2 1.1 1.9-2.3' }),
          h('path', { d: 'M10.1 10.1l2.4 2.4' }))
      }
      // 下一步：两枚向右箭头，表达继续推进，与「打开会话」的斜向箭头区分。
      if (name === 'next') {
        return h('svg', common,
          h('path', { d: 'M4.5 3.6 8.9 8l-4.4 4.4' }),
          h('path', { d: 'M9.4 3.6 13.8 8l-4.4 4.4' }))
      }
      if (name === 'ranking') {
        return h('svg', common,
          h('path', { d: 'M3 4.2h9.4M3 8h6.4M3 11.8h3.4' }),
          h('path', { d: 'M13 10.2v3.2' }))
      }
      if (name === 'sessions') {
        return h('svg', common,
          h('rect', { x: 2.2, y: 3.2, width: 9.6, height: 7, rx: 1.6 }),
          h('path', { d: 'M4.8 12.2h6.9a1.6 1.6 0 0 0 1.6-1.6V6.2' }))
      }
      if (name === 'approx') {
        return h('svg', common,
          h('path', { d: 'M8 2.4l5.6 9.8H2.4z' }),
          h('path', { d: 'M8 6.3v2.5' }),
          h('circle', { cx: 8, cy: 10.7, r: 0.7, fill: 'currentColor', stroke: 'none' }))
      }
      if (name === 'running') {
        return h('svg', common,
          h('circle', { cx: 8, cy: 8, r: 5.4 }),
          h('circle', { cx: 8, cy: 8, r: 2.1, fill: 'currentColor', stroke: 'none' }))
      }
      if (name === 'open') {
        return h('svg', common,
          h('path', { d: 'M4.7 11.3 11.3 4.7' }),
          h('path', { d: 'M5.9 4.7h5.4v5.4' }))
      }
      return h('svg', common,
        h('rect', { x: 2.2, y: 3, width: 11.6, height: 8.1, rx: 2.1 }),
        h('path', { d: 'M5.4 11.1L4.1 13.2' }))
    }

    /** 只显示图标和值的小单元；标签、单位与解释统一放进悬浮说明。 */
    function renderDetailMeta(props) {
      const { className, icon, label, value, tipTitle, tipRows, hoverTip, tone = '' } = props
      return h('span', {
        className: `cs-detail-meta${tone ? ` is-${tone}` : ''}${className ? ` ${className}` : ''}`,
        role: 'img',
        tabIndex: 0,
        'aria-label': label,
        onClick: (event) => event.stopPropagation(),
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
          }
        },
        ...hoverTipProps(hoverTip, tipTitle ?? label, tipRows ?? []),
      },
        h(DetailGlyph, { name: icon }),
        value == null ? null : h('span', { className: 'cs-detail-meta-value' }, value))
    }

    /** 数字渐变只改变读数本身：五次缓入缓出把加速段压在中段，形成慢—快—慢的节奏。 */
    function tweenDurationMs(from, to, progress) {
      const start = Math.max(0, finite(from))
      const end = Math.max(0, finite(to))
      const ratio = Math.min(1, Math.max(0, finite(progress)))
      const eased = ratio < 0.5
        ? 16 * ratio ** 5
        : 1 - ((-2 * ratio + 2) ** 5) / 2
      return Math.round(start + (end - start) * eased)
    }

    function formatDuration(ms, format = DEFAULT_DURATION_FORMAT) {
      const preset = normalizeDurationFormat(format)
      const numeric = Number(ms)
      const totalSeconds = Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric / 1000) : 0
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      const pad2 = (value) => String(value).padStart(2, '0')
      switch (preset) {
        case 'short':
          return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`
        case 'zh':
          return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分 ${seconds} 秒`
        case 'sec':
          return `${totalSeconds} 秒`
        case 'padded':
          return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
        case 'decimal':
          return `${(totalSeconds / 3600).toFixed(2)} h`
        case 'hms':
        default:
          return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
      }
    }

    /** 时长文本只给数字段上强调色；h/m、中文单位和冒号继续沿用正文色。 */
    function renderDurationDigits(value) {
      return String(value).split(/(\d+)/).filter(Boolean).map((part, index) => h('span', {
        key: `${index}-${part}`,
        className: /^\d+$/.test(part) ? 'cs-duration-number' : 'cs-duration-unit',
      }, part))
    }

    /** 数字格式只认六种预设；旧响应、脏草稿与非法值一律回落紧凑单位。 */
    function normalizeDurationFormat(value) {
      return typeof value === 'string' && DURATION_FORMAT_ORDER.includes(value) ? value : DEFAULT_DURATION_FORMAT
    }

    function durationFormatHintKey(format) {
      if (format === 'short') return 'formatHintShort'
      if (format === 'zh') return 'formatHintZh'
      if (format === 'sec') return 'formatHintSec'
      if (format === 'padded') return 'formatHintPadded'
      if (format === 'decimal') return 'formatHintDecimal'
      return 'formatHintHms'
    }

    /** 侧栏时长只认三个预设；缺省与脏数据回落到在线时长。 */
    function normalizeSidebarDuration(value) {
      return SIDEBAR_DURATION_VALUES.includes(value) ? value : SIDEBAR_DURATION_DEFAULT
    }

    /** 状态点位置只认 end / inline；缺省与脏数据默认跟随时长。 */
    function normalizeSidebarDotPosition(value) {
      return SIDEBAR_DOT_POSITION_VALUES.includes(value) ? value : SIDEBAR_DOT_POSITION_DEFAULT
    }

    /** 本地日历月回退：保留日号，目标月没有该日时收敛到月末（如 5/31 回退到 2/28）。 */
    function subtractCalendarMonths(ms, months) {
      const at = new Date(ms)
      if (Number.isNaN(at.getTime())) return ms
      const count = Math.trunc(Number(months))
      if (!Number.isFinite(count) || count === 0) return at.getTime()
      const target = new Date(
        at.getFullYear(), at.getMonth() - count, 1,
        at.getHours(), at.getMinutes(), at.getSeconds(), at.getMilliseconds())
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
      target.setDate(Math.min(at.getDate(), lastDay))
      return target.getTime()
    }

    /** 默认范围：本地今天 00:00 往前三个日历月，到今天 24:00（次日零点开区间）。 */
    function defaultHeatRange(nowMs) {
      const numeric = Number(nowMs)
      const at = new Date(Number.isFinite(numeric) ? numeric : Date.now())
      const todayStart = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
      return {
        from: subtractCalendarMonths(todayStart, 3),
        to: new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime(),
      }
    }

    /**
     * 范围值规范化：3m / 6m / year 保持字符串，单月统一成数字 1–12。
     * 兼容 #11 之后可能残留的字符串月份；其它值（0、13、空串、脏存储）回落 3m。
     */
    function normalizeHeatRangeValue(value) {
      if (value === '3m' || value === '6m' || value === 'year') return value
      if (typeof value !== 'string' && typeof value !== 'number') return HEAT_DEFAULT_RANGE
      const numeric = Number(value)
      return Number.isInteger(numeric) && numeric >= 1 && numeric <= 12 ? numeric : HEAT_DEFAULT_RANGE
    }

    /**
     * 把范围值解析成 Host 可直接查询的本地日历区间。
     * 3m/6m 从今天往前 N 个日历月的零点到今天 24:00；全年与单月按本地自然月取整。
     */
    function resolveHeatRange(value, nowMs) {
      const normalized = normalizeHeatRangeValue(value)
      const numeric = Number(nowMs)
      const at = new Date(Number.isFinite(numeric) ? numeric : Date.now())
      const year = at.getFullYear()
      const todayStart = new Date(year, at.getMonth(), at.getDate()).getTime()
      const tomorrow = new Date(year, at.getMonth(), at.getDate() + 1).getTime()
      if (normalized === '3m' || normalized === '6m') {
        return {
          value: normalized,
          from: subtractCalendarMonths(todayStart, normalized === '3m' ? 3 : 6),
          to: tomorrow,
        }
      }
      if (normalized === 'year') {
        return {
          value: normalized,
          from: new Date(year, 0, 1).getTime(),
          to: new Date(year + 1, 0, 1).getTime(),
        }
      }
      const month = normalized - 1
      return {
        value: normalized,
        month,
        from: new Date(year, month, 1).getTime(),
        to: new Date(year, month + 1, 1).getTime(),
      }
    }

    /** 界面语言判断：与 buildHeatTip 同口径，不额外注入依赖。 */
    function isZhLocale(t) {
      return typeof t === 'function' && t('periodDay') === '日'
    }

    /** 月份刻度按界面语言取文案：中文「1月」，英文 Jan。 */
    function heatMonthLabels(t) {
      return isZhLocale(t) ? HEAT_MONTH_LABELS_ZH : HEAT_MONTH_ABBR
    }

    /** 星期刻度按界面语言取文案：中文单字，英文 Mon…Sun。 */
    function heatWeekdayLabels(t) {
      return isZhLocale(t) ? HEAT_WEEKDAY_LABELS_ZH : HEAT_WEEKDAY_LABELS
    }

    /** 范围缩写：3m/6m/year 原样返回，单月按界面语言返回月份名；无效值按 3m 显示。 */
    function heatRangeLabel(value, t) {
      const normalized = normalizeHeatRangeValue(value)
      if (normalized === '3m' || normalized === '6m' || normalized === 'year') return normalized
      return heatMonthLabels(t)[normalized - 1]
    }

    /** 布局类型：全年与 3m/6m 共用周网格（data-layout 仍区分 year），单月用 7 列日历。 */
    function heatLayoutFor(value) {
      const normalized = normalizeHeatRangeValue(value)
      if (normalized === 'year') return 'year'
      if (typeof normalized === 'number') return 'month'
      return 'weeks'
    }

    /** 缺失日期的空日对象，与 Host 的日桶结构一致；保证格子仍可聚焦并显示「无记录」。 */
    function emptyHeatDay(dateKey, at) {
      return {
        dateKey,
        from: at.getTime(),
        to: new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime(),
        onlineMs: 0,
        activeMs: 0,
        taskMs: 0,
        hasObservations: false,
      }
    }

    function heatDayMap(days) {
      const byKey = new Map()
      if (!Array.isArray(days)) return byKey
      for (const day of days) {
        if (day && typeof day.dateKey === 'string') byKey.set(day.dateKey, day)
      }
      return byKey
    }

    /**
     * 单月 7 列日历：周一开头，前后补齐为 null，只允许 range 所在月份进入格子。
     * 即使调用方传入相邻月份的 days，也只会按 dateKey 匹配本月日期。
     */
    function buildMonthGrid(days, range, weekdayLabels = HEAT_WEEKDAY_LABELS_ZH) {
      const from = Number(range?.from)
      const to = Number(range?.to)
      const result = {
        weeks: [],
        weekdayLabels: weekdayLabels.slice(),
        daysInMonth: 0,
        year: null,
        month: null,
      }
      if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return result
      const anchor = new Date(from)
      const year = anchor.getFullYear()
      const month = anchor.getMonth()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const byKey = heatDayMap(days)
      const lead = (new Date(year, month, 1).getDay() + 6) % 7
      const weeks = []
      let week = new Array(lead).fill(null)
      for (let day = 1; day <= daysInMonth; day += 1) {
        const at = new Date(year, month, day)
        const dateKey = localDateKey(at)
        week.push({ dateKey, day: byKey.get(dateKey) ?? emptyHeatDay(dateKey, at), inRange: true })
        if (week.length === 7) {
          weeks.push(week)
          week = []
        }
      }
      if (week.length > 0) {
        while (week.length < 7) week.push(null)
        weeks.push(week)
      }
      result.weeks = weeks
      result.daysInMonth = daysInMonth
      result.year = year
      result.month = month
      return result
    }

    /**
     * 全年月度条数据：每月只累加 hasObservations 为 true 的日期。
     * 主视图已改为 7 行 × 53 列周网格，这里只供首屏补充数值面板使用。
     */
    function buildYearMatrix(days, year, monthLabels = HEAT_MONTH_LABELS_ZH) {
      const numeric = Number(year)
      const targetYear = Number.isFinite(numeric) && numeric > 0
        ? Math.trunc(numeric)
        : new Date().getFullYear()
      const byKey = heatDayMap(days)
      const months = monthLabels.map((abbr, month) => {
        const daysInMonth = new Date(targetYear, month + 1, 0).getDate()
        const cells = []
        for (let day = 1; day <= 31; day += 1) {
          if (day > daysInMonth) {
            cells.push(null)
            continue
          }
          const at = new Date(targetYear, month, day)
          const dateKey = localDateKey(at)
          cells.push({ dateKey, day: byKey.get(dateKey) ?? emptyHeatDay(dateKey, at), inRange: true })
        }
        return { month, abbr, days: cells }
      })
      const bars = months.map((entry) => ({
        month: entry.month,
        abbr: entry.abbr,
        activeMs: entry.days.reduce((total, cell) => (
          cell !== null && cell.day.hasObservations === true
            ? total + finite(cell.day.activeMs)
            : total
        ), 0),
      }))
      return { year: targetYear, months, bars }
    }

    /** 菜单选项文案：跨度与月份都按界面语言生成；中文「近3个月/全年/1月…12月」，英文沿用原缩写。 */
    function heatRangeOptionLabel(option, t) {
      if (typeof option.value === 'number') {
        return heatMonthLabels(t)[option.value - 1] ?? option.label
      }
      const key = option.value === '3m'
        ? 'heatRange3m'
        : option.value === '6m'
          ? 'heatRange6m'
          : option.value === 'year'
            ? 'heatRangeYear'
            : null
      if (key === null) return option.label
      const label = typeof t === 'function' ? t(key) : ''
      return typeof label === 'string' && label !== '' && label !== key ? label : option.label
    }

    /**
     * 热力图范围选择器：复用页面统一的自定义下拉，向上弹出紧凑三列网格。
     * 3 个跨度 + 12 个月份共 15 项，五排铺开，触发器与菜单都不占过多宽度。
     */
    function renderHeatRangePicker({ value, t, onSelectRange } = {}) {
      const normalized = normalizeHeatRangeValue(value)
      const options = HEAT_RANGE_OPTIONS.map((option) => ({
        value: option.value,
        label: heatRangeOptionLabel(option, t),
        key: `heat-range-${option.value}`,
      }))
      return h(Select, {
        value: normalized,
        options,
        placement: 'top',
        menuVariant: 'grid',
        className: 'heat-range-select',
        ariaLabel: t('heatRangeLabel'),
        onChange: (next) => onSelectRange?.(next),
      })
    }

    /** 热力等级：0 表示无活跃，其余按峰值比例向上取整并钳制在 1–5。 */
    function heatLevel(activeMs, maxActiveMs) {
      const active = Number(activeMs)
      const max = Number(maxActiveMs)
      if (!Number.isFinite(active) || active <= 0) return 0
      if (!Number.isFinite(max) || max <= 0) return 1
      return Math.max(1, Math.min(5, Math.ceil((active / max) * 5)))
    }

    /** 本地日期键，与 Host 的 `dateKey` 同口径（YYYY-MM-DD，本地自然日）。 */
    function localDateKey(at) {
      const date = at instanceof Date ? at : new Date(at)
      const pad2 = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    }

    /**
     * 按周一对齐的每日网格。列是周，行是周一…周日；范围外补齐格为 null。
     * 月份刻度记录在当月 1 日（范围首月记在首日）所在的列，因此刻度与格子严格对齐。
     * 月份与星期文案按界面语言注入：中文显示「1月…12月」与「一…日」，英文沿用缩写。
     */
    function buildHeatGrid(days, range, monthLabels = HEAT_MONTH_LABELS_ZH, weekdayLabels = HEAT_WEEKDAY_LABELS_ZH) {
      const list = Array.isArray(days) ? days : []
      const from = Number(range?.from)
      const to = Number(range?.to)
      const result = { weeks: [], months: [], weekdayLabels: weekdayLabels.slice() }
      if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return result

      const byKey = new Map()
      for (const day of list) {
        if (day && typeof day.dateKey === 'string') byKey.set(day.dateKey, day)
      }

      const first = new Date(from)
      const start = new Date(first.getFullYear(), first.getMonth(), first.getDate())
      const lastAt = new Date(to - 1)
      const endDay = new Date(lastAt.getFullYear(), lastAt.getMonth(), lastAt.getDate())
      const mondayOf = (date) => {
        const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
        day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
        return day
      }
      const gridStart = mondayOf(start)
      const gridEnd = mondayOf(endDay)
      gridEnd.setDate(gridEnd.getDate() + 6)

      const weeks = []
      const months = []
      let week = []
      let firstInRange = true
      for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
        const at = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
        const inRange = at.getTime() >= start.getTime() && at.getTime() <= endDay.getTime()
        if (inRange) {
          const dateKey = localDateKey(at)
          const day = byKey.get(dateKey) ?? {
            dateKey,
            from: at.getTime(),
            to: new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime(),
            onlineMs: 0,
            activeMs: 0,
            taskMs: 0,
            hasObservations: false,
          }
          week.push({ dateKey, day, inRange: true })
          const column = weeks.length
          const isFirst = firstInRange
          firstInRange = false
          if (at.getDate() === 1 || isFirst) {
            const marker = { abbr: monthLabels[at.getMonth()], column }
            const existing = months.findIndex((month) => month.column === column)
            if (existing >= 0) months[existing] = marker
            else months.push(marker)
          }
        } else {
          week.push(null)
        }
        if (week.length === 7) {
          weeks.push(week)
          week = []
        }
      }
      if (week.length > 0) weeks.push(week)
      result.weeks = weeks
      result.months = months
      return result
    }

    /** Host summary 只有在六项汇总都是有限数字时才可直接复用，坏数据继续走客户端求和。 */
    function isHeatHostSummary(value) {
      return value !== null && typeof value === 'object'
        && Number.isFinite(value.onlineMs)
        && Number.isFinite(value.activeMs)
        && Number.isFinite(value.taskMs)
        && Number.isFinite(value.activeDays)
        && Number.isFinite(value.observedDays)
        && Number.isFinite(value.dailyAverageActiveMs)
    }

    /** 范围汇总：只对 hasObservations 的日期求和，无观测日期不进入分母。 */
    function summarizeHeatDays(days, hostSummary) {
      const { onlineMs, activeMs, taskMs, activeDays, observedDays, dailyAverageActiveMs } = summarizeHeatFocus(days, hostSummary)
      return { onlineMs, activeMs, taskMs, activeDays, observedDays, dailyAverageActiveMs }
    }

    /**
     * 热力图首屏的范围统计：只对 hasObservations 的日期求和；
     * 峰值日取 activeMs 最大的观测日，无观测时返回 null，避免把补零格当成真实记录。
     * 传入有效的 Host summary 时直接复用其六项汇总与峰值，避免客户端重复遍历整段查询。
     */
    function summarizeHeatFocus(days, hostSummary) {
      if (isHeatHostSummary(hostSummary)) {
        const { onlineMs, activeMs, taskMs, activeDays, observedDays, dailyAverageActiveMs } = hostSummary
        return {
          onlineMs,
          activeMs,
          taskMs,
          activeDays,
          observedDays,
          dailyAverageActiveMs,
          peakDay: hostSummary.peak !== null && typeof hostSummary.peak === 'object' && typeof hostSummary.peak.dateKey === 'string'
            ? { dateKey: hostSummary.peak.dateKey, activeMs: finite(hostSummary.peak.activeMs) }
            : null,
        }
      }
      const list = Array.isArray(days) ? days : []
      let onlineMs = 0
      let activeMs = 0
      let taskMs = 0
      let activeDays = 0
      let observedDays = 0
      let peakDay = null
      for (const day of list) {
        if (day?.hasObservations !== true) continue
        observedDays += 1
        const dayActive = finite(day.activeMs)
        onlineMs += finite(day.onlineMs)
        activeMs += dayActive
        taskMs += finite(day.taskMs)
        if (dayActive > 0) activeDays += 1
        if (peakDay === null || dayActive > peakDay.activeMs) {
          peakDay = { dateKey: day.dateKey, activeMs: dayActive }
        }
      }
      return {
        onlineMs,
        activeMs,
        taskMs,
        activeDays,
        observedDays,
        dailyAverageActiveMs: observedDays > 0 ? Math.round(activeMs / observedDays) : 0,
        peakDay,
      }
    }

    /** 配色只认 blue / stone / cyan / coral；旧赤陶 clay 迁移到松石青，其余旧值回落到默认晴空蓝。 */
    function normalizePalette(value) {
      if (value === 'clay') return 'cyan'
      return PALETTES.includes(value) ? value : 'blue'
    }

    /** 外观只认 light / dark / system；旧值或非法值按跟随系统处理，不让旧存储破坏页面。 */
    function normalizeAppearance(value) {
      return APPEARANCE_ORDER.includes(value) ? value : 'system'
    }

    /** 点击循环：浅色 → 深色 → 跟随系统 → 浅色。非法值先归一到跟随系统。 */
    function cycleAppearance(value) {
      const current = normalizeAppearance(value)
      return APPEARANCE_ORDER[(APPEARANCE_ORDER.indexOf(current) + 1) % APPEARANCE_ORDER.length]
    }

    /** 把三态解析成实际渲染的明暗：system 时跟随系统配色。 */
    function resolveAppearance(value, prefersDark) {
      const mode = normalizeAppearance(value)
      if (mode === 'system') return prefersDark === true ? 'dark' : 'light'
      return mode
    }

    /** 读取系统深色偏好；无 matchMedia 的测试环境按浅色处理。 */
    function systemPrefersDark() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
      return window.matchMedia('(prefers-color-scheme: dark)').matches === true
    }

    /**
     * 配色 / 外观切换后广播「主题变了」。侧栏入口落在仪表盘 .cs-page 作用域
     * 之外，靠这条事件重读同一份浏览器本地偏好；事件不携带值，不形成第二份状态。
     */
    const themeListeners = new Set()
    function subscribeThemeChanged(listener) {
      themeListeners.add(listener)
      return () => themeListeners.delete(listener)
    }
    function notifyThemeChanged() {
      for (const listener of [...themeListeners]) {
        try {
          listener()
        } catch {
          // 单个已卸载入口的监听器不该阻断其它入口刷新。
        }
      }
    }

    /** 恢复初始外观：配色回到蓝色、外观回到跟随系统，只写本机浏览器存储。 */
    function resetStoredTheme() {
      let saved = false
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('dsh-timespan.palette', 'blue')
          window.localStorage.setItem('dsh-timespan.appearance', 'system')
          saved = true
        }
      } catch {
        // 隐私模式下写不进去时仍广播，让当前页面按内存值回到默认视觉。
      }
      notifyThemeChanged()
      return saved
    }

    /** 侧栏入口在宿主侧栏里，读取与仪表盘同一份浏览器本地主题偏好。 */
    function readStoredTheme() {
      let palette = 'blue'
      let appearance = 'system'
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          palette = normalizePalette(window.localStorage.getItem('dsh-timespan.palette'))
          appearance = normalizeAppearance(window.localStorage.getItem('dsh-timespan.appearance'))
        }
      } catch {
        // 隐私模式或禁用存储时回落默认主题，入口仍可渲染。
      }
      return { palette, appearance }
    }

    function useStoredTheme() {
      const [theme, setTheme] = React.useState(readStoredTheme)
      const [systemDark, setSystemDark] = React.useState(systemPrefersDark)
      React.useEffect(() => {
        const sync = () => setTheme(readStoredTheme())
        const unsubscribe = subscribeThemeChanged(sync)
        const media = window.matchMedia?.('(prefers-color-scheme: dark)')
        const onChange = () => setSystemDark(systemPrefersDark())
        if (media?.addEventListener) media.addEventListener('change', onChange)
        else media?.addListener?.(onChange)
        return () => {
          unsubscribe()
          if (media?.removeEventListener) media.removeEventListener('change', onChange)
          else media?.removeListener?.(onChange)
        }
      }, [])
      return { ...theme, systemDark }
    }

    /** 入口根节点的 cs-palette-* / cs-appearance-* 类；system 按当前系统偏好解析。 */
    function sidebarThemeClass(palette, appearance, prefersDark) {
      return `cs-palette-${normalizePalette(palette)} cs-appearance-${resolveAppearance(appearance, prefersDark)}`
    }

    async function callHost(ctx, method, payload) {
      const connection = ctx && typeof ctx.get === 'function' ? ctx.get('connection') : undefined
      if (connection === undefined || connection === null || !connection.rpc || typeof connection.rpc.call !== 'function') {
        throw new Error('connection 服务不可用')
      }
      const result = await connection.rpc.call('/api', 'dsh-timespan', { method, payload })
      if (result !== null && typeof result === 'object' && result.ok === true) return result.value
      const message = result?.error?.message ? String(result.error.message) : 'RPC 调用失败'
      const error = new Error(message)
      error.code = result?.error?.code
      throw error
    }

    /**
     * 设置读写统一走这里：getSettings / setSettings / resetSettings 都会回
     * 完整设置对象，顺手把界面语言落到本地（语言是 Host 设置的一部分）。
     * 这样每个点位只管自己关心的字段，语言不会漏掉某一个入口。
     */
    function callSettings(ctx, method, payload) {
      return callHost(ctx, method, payload).then((value) => {
        applyLanguage(value?.language)
        return value
      })
    }

    /**
     * 恢复默认设置：Host 热更新后可能仍使用旧版默认值（例如状态点位置为 end），
     * 因此 resetSettings 返回后若位置不是当前默认的跟随时长，再显式补写一次。
     * 这样「恢复初始设置」在当前进程和重启后的行为一致。
     */
    async function resetSettingsToDefaults(ctx) {
      const saved = await callSettings(ctx, 'resetSettings', {})
      if (settingsDraft(saved).sidebarDotPosition === SIDEBAR_DOT_POSITION_DEFAULT) return saved
      return callSettings(ctx, 'setSettings', { sidebarDotPosition: SIDEBAR_DOT_POSITION_DEFAULT })
    }

    /**
     * 设置保存 / 数据清空后让仪表盘立刻重新取数。这里只广播「发生了变更」，
     * 不携带任何设置值，页面始终从 Host 重新读，不形成第二份业务状态。
     */
    const settingsListeners = new Set()
    function subscribeSettingsChanged(listener) {
      settingsListeners.add(listener)
      return () => settingsListeners.delete(listener)
    }
    function notifySettingsChanged() {
      for (const listener of [...settingsListeners]) {
        try {
          listener()
        } catch {
          // 单个页面卸载留下的监听器不该阻断其它页面刷新。
        }
      }
    }

    /**
     * 宿主侧栏的 panelTitle 由注册时的 label 单独渲染，插件改不了它的文字；
     * 这里用根元素上的开关让注入样式隐藏那一行，label 本身保持不变，
     * 折叠态的可访问名与 tooltip 也照常留在宿主按钮上。
     */
    function applySidebarHostNameVisibility(visible) {
      if (typeof document === 'undefined' || !document.documentElement) return
      const root = document.documentElement
      if (visible === false) root.setAttribute('data-dsh-timespan-hide-name', '')
      else root.removeAttribute('data-dsh-timespan-hide-name')
    }

    /**
     * 数字格式即时预览事件：设置页选择卡片时只广播草稿值，不写 Host。
     * 页面与侧栏订阅后立即用同一格式重渲染；保存时 notifySettingsChanged
     * 让它们清掉预览、重新向 Host 取权威设置；null 用于撤销失败或离页时的预览。
     */
    const durationFormatPreviewListeners = new Set()
    function subscribeDurationFormatPreview(listener) {
      durationFormatPreviewListeners.add(listener)
      return () => durationFormatPreviewListeners.delete(listener)
    }
    function notifyDurationFormatPreview(value) {
      const format = value === null ? null : normalizeDurationFormat(value)
      for (const listener of [...durationFormatPreviewListeners]) {
        try {
          listener(format)
        } catch {
          // 同 settings 变更：单个监听器失败不影响其它页面即时预览。
        }
      }
    }

    /** 下载 Host 已序列化的文件；Client 不解析内容、不重新编码业务数据。 */
    function downloadExport(file) {
      if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        throw new Error('当前环境不支持文件下载')
      }
      const blob = new Blob([file?.content ?? ''], { type: file?.mimeType ?? 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file?.filename ?? `dsh-timespan.${file?.format ?? 'json'}`
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      // 立即回收会让部分浏览器来不及启动下载。
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    function settingsDraft(value) {
      const minutes = Number(value?.idleThresholdMinutes)
      const week = Number(value?.weekStartsOn)
      return {
        idleThresholdMinutes: Number.isFinite(minutes) ? String(Math.min(15, Math.max(1, Math.round(minutes)))) : '5',
        weekStartsOn: week === 7 ? '7' : '1',
        showSubagents: value?.showSubagents !== false,
        durationFormat: normalizeDurationFormat(value?.durationFormat),
        sidebarShowName: value?.sidebarShowName === true,
        sidebarDuration: normalizeSidebarDuration(value?.sidebarDuration),
        sidebarDotVisible: value?.sidebarDotVisible !== false,
        sidebarDotPosition: normalizeSidebarDotPosition(value?.sidebarDotPosition),
        language: normalizeLanguage(value?.language),
        approximateNoticeDismissed: value?.approximateNoticeDismissed === true,
        analysisProvider: typeof value?.analysisProvider === 'string' ? value.analysisProvider : '',
        analysisModel: typeof value?.analysisModel === 'string' ? value.analysisModel : '',
        timerSound: value?.timerSound !== false,
        floatingEnabled: value?.floatingEnabled !== false,
        floatingShowClock: value?.floatingShowClock === true,
      }
    }

    /** 设置页保存载荷：只提交可编辑字段，布尔值按 Host 契约收敛。 */
    function settingsPayload(draft) {
      return {
        idleThresholdMinutes: Number(draft.idleThresholdMinutes),
        weekStartsOn: Number(draft.weekStartsOn),
        showSubagents: draft.showSubagents === true,
        durationFormat: normalizeDurationFormat(draft.durationFormat),
        sidebarShowName: draft.sidebarShowName === true,
        sidebarDuration: normalizeSidebarDuration(draft.sidebarDuration),
        sidebarDotVisible: draft.sidebarDotVisible !== false,
        sidebarDotPosition: normalizeSidebarDotPosition(draft.sidebarDotPosition),
        language: normalizeLanguage(draft.language),
        approximateNoticeDismissed: draft.approximateNoticeDismissed === true,
        analysisProvider: draft.analysisProvider ?? '',
        analysisModel: draft.analysisModel ?? '',
        timerSound: draft.timerSound !== false,
        floatingEnabled: draft.floatingEnabled !== false,
        floatingShowClock: draft.floatingShowClock === true,
      }
    }

    /**
     * 两个设置入口共用的编辑流程。草稿、保存反馈和确认步骤只在当前视图存活，
     * 设置值始终以 Host 为准；通知记录与备份文件操作仍由各自页面负责。
     * 读取可以作废，已提交的写入仍会完成并广播；调用方不用协调这些先后关系。
     */
    function useSettingsEditor(ctx, enabled = true, onThemeReset) {
      const [state, setState] = React.useState({
        draft: null, phase: 'loading', messageKey: '', resetStep: false, resetting: false,
      })
      const runtimeRef = React.useRef({
        state, mounted: false, active: false, lifecycle: 0, readId: 0, writing: false,
        refreshPending: false, publishing: false, preview: false, timer: null,
      })
      const runtime = runtimeRef.current
      runtime.onThemeReset = onThemeReset

      function update(patch) {
        runtime.state = { ...runtime.state, ...patch }
        setState(runtime.state)
      }

      function clearFeedbackTimer() {
        if (runtime.timer !== null) window.clearTimeout(runtime.timer)
        runtime.timer = null
      }

      function clearPreview() {
        if (!runtime.preview) return
        runtime.preview = false
        notifyDurationFormatPreview(null)
      }

      async function reload(keepFeedback = false) {
        if (!runtime.active) return
        if (runtime.writing) {
          runtime.refreshPending = true
          return
        }
        const readId = ++runtime.readId
        const nextPhase = keepFeedback ? runtime.state.phase : 'ready'
        if (!keepFeedback) {
          clearFeedbackTimer()
          update({ draft: null, phase: 'loading', messageKey: '', resetStep: false })
        } else {
          // 保留成功提示，但补读完成前不能用旧草稿覆盖刚导入或外部保存的设置。
          update({ phase: 'loading' })
        }
        try {
          // 先确认读取仍有效，再应用语言；旧响应不能把新保存的语言切回去。
          const value = await callHost(ctx, 'getSettings', {})
          if (!runtime.active || readId !== runtime.readId) return
          applyLanguage(value?.language)
          update({ draft: settingsDraft(value), phase: nextPhase })
        } catch {
          if (!runtime.active || readId !== runtime.readId) return
          clearFeedbackTimer()
          update({ draft: null, phase: 'load-error', messageKey: 'settingsLoadError' })
        }
      }

      function canEdit() {
        return runtime.active && !runtime.writing && runtime.state.draft !== null &&
          runtime.state.phase !== 'loading' && runtime.state.phase !== 'load-error'
      }

      async function save(next, resetting = false) {
        if (!canEdit()) return false
        const lifecycle = runtime.lifecycle
        const isCurrent = () => runtime.active && lifecycle === runtime.lifecycle
        runtime.writing = true
        runtime.readId += 1
        clearFeedbackTimer()
        update({ draft: next, phase: 'saving', messageKey: resetting ? '' : 'settingsSaving', resetting })
        try {
          const saved = resetting
            ? await resetSettingsToDefaults(ctx)
            : await callSettings(ctx, 'setSettings', settingsPayload(next))
          if (resetting) {
            const themeSaved = resetStoredTheme()
            if (runtime.mounted) runtime.onThemeReset?.(themeSaved)
          }
          clearPreview()
          if (isCurrent()) {
            update({
              draft: settingsDraft(saved), phase: 'saved', resetting: false, resetStep: false,
              messageKey: resetting ? 'settingsResetDone' : 'savedBadge',
            })
            runtime.timer = window.setTimeout(() => {
              runtime.timer = null
              update({ messageKey: '' })
            }, resetting ? 1800 : 1000)
          }
          // 自己已持有写入返回的权威值；其它入口重新读取，当前入口保留保存反馈。
          runtime.publishing = true
          try { notifySettingsChanged() } finally { runtime.publishing = false }
          return true
        } catch {
          clearPreview()
          if (isCurrent()) {
            update({ phase: 'error', resetting: false, messageKey: resetting ? 'settingsResetError' : 'settingsSaveError' })
          }
          return false
        } finally {
          runtime.writing = false
          // 导入或其它入口可能在保存期间改变设置；等写入结束再读取最新值。
          if (runtime.active && (runtime.refreshPending || !isCurrent())) {
            runtime.refreshPending = false
            void reload(isCurrent() && runtime.state.phase === 'saved')
          }
        }
      }

      function patch(key, value) {
        if (!canEdit()) return Promise.resolve(false)
        const next = { ...runtime.state.draft, [key]: value }
        if (key === 'analysisProvider' && value !== runtime.state.draft.analysisProvider) next.analysisModel = ''
        if (key === 'durationFormat') {
          next.durationFormat = normalizeDurationFormat(value)
          runtime.preview = true
          notifyDurationFormatPreview(next.durationFormat)
        }
        return save(next)
      }

      // 切到其它视图只关闭编辑流程；仍挂载的仪表盘需要接收已提交重置的主题结果。
      React.useEffect(() => {
        runtime.mounted = true
        return () => { runtime.mounted = false }
      }, [])

      React.useEffect(() => {
        runtime.lifecycle += 1
        runtime.active = enabled
        if (!enabled) {
          update({ draft: null, phase: 'idle', messageKey: '', resetStep: false, resetting: false })
          return undefined
        }
        void reload()
        const unsubscribe = subscribeSettingsChanged(() => {
          if (!runtime.publishing) void reload()
        })
        return () => {
          runtime.active = false
          runtime.readId += 1
          unsubscribe()
          clearFeedbackTimer()
          clearPreview()
        }
      }, [ctx, enabled])

      return {
        ...state,
        busy: !enabled || state.draft === null || state.phase === 'loading' || state.phase === 'load-error' || state.phase === 'saving',
        patch,
        reload: () => reload(),
        retrySave: () => runtime.state.messageKey === 'settingsSaveError' ? save(runtime.state.draft) : Promise.resolve(false),
        requestReset: () => { if (canEdit()) update({ resetStep: true }) },
        cancelReset: () => { if (!runtime.writing) update({ resetStep: false }) },
        reset: () => runtime.state.resetStep ? save(runtime.state.draft, true) : Promise.resolve(false),
      }
    }

    /** 读取 Host 的今日统计；侧边栏与页面各按自己的节奏轮询，Client 不缓存业务状态。 */
    function useTodayStats(ctx, refreshMs, refreshNonce = 0) {
      const [state, setState] = React.useState({
        status: 'loading',
        onlineMs: 0,
        activeMs: 0,
        taskMs: 0,
        taskCount: 0,
        taskRunning: false,
        sessions: [],
        receivedAt: 0,
        running: false,
        activeRunning: false,
        durationFormat: DEFAULT_DURATION_FORMAT,
      })

      React.useEffect(() => {
        let active = true
        const load = async () => {
          try {
            const value = await callHost(ctx, 'queryStats', { period: 'day' })
            if (!active) return
            // 语言随统计一起带回：侧栏首屏就能落到用户选择的语言。
            applyLanguage(value?.language)
            setState({
              status: 'ready',
              onlineMs: Number.isFinite(value?.onlineMs) ? value.onlineMs : 0,
              activeMs: Number.isFinite(value?.activeMs) ? value.activeMs : 0,
              taskMs: Number.isFinite(value?.taskMs) ? value.taskMs : 0,
              taskCount: Number.isFinite(value?.taskCount) ? value.taskCount : 0,
              taskRunning: value?.taskRunning === true,
              sessions: normalizeSessions(value?.sessions),
              receivedAt: Date.now(),
              running: value?.running === true,
              activeRunning: value?.activeRunning === true,
              durationFormat: normalizeDurationFormat(value?.durationFormat),
            })
          } catch {
            if (!active) return
            setState((previous) => {
              if (previous.receivedAt > 0) {
                return { ...previous, status: 'error', running: false, activeRunning: false, taskRunning: false }
              }
              return {
                status: 'error',
                onlineMs: 0,
                activeMs: 0,
                taskMs: 0,
                taskCount: 0,
                taskRunning: false,
                sessions: [],
                receivedAt: Date.now(),
                running: false,
                activeRunning: false,
                durationFormat: 'hms',
              }
            })
          }
        }
        load()
        const timer = setInterval(load, refreshMs)
        return () => {
          active = false
          clearInterval(timer)
        }
      }, [ctx, refreshMs, refreshNonce])

      return state
    }

    /** Host 的会话任务行；缺字段时按零值兜底，避免旧版本 RPC 让页面崩溃。 */
    function normalizeSessions(value) {
      if (!Array.isArray(value)) return []
      return value
        .filter((session) => session !== null && typeof session === 'object' && typeof session.sessionId === 'string')
        .map((session) => ({
          sessionId: session.sessionId,
          sessionTitle: typeof session.sessionTitle === 'string' ? session.sessionTitle : null,
          workspaceTitle: typeof session.workspaceTitle === 'string' ? session.workspaceTitle : null,
          taskMs: Number.isFinite(session.taskMs) ? session.taskMs : 0,
          taskCount: Number.isFinite(session.taskCount) ? session.taskCount : 0,
          taskRunning: session.taskRunning === true,
          approximate: session.approximate === true,
          modelMs: Number.isFinite(session.modelMs) ? session.modelMs : 0,
          toolMs: Number.isFinite(session.toolMs) ? session.toolMs : 0,
          waitMs: Number.isFinite(session.waitMs) ? session.waitMs : 0,
          otherMs: Number.isFinite(session.otherMs) ? session.otherMs : 0,
          hasBreakdown: session.hasBreakdown !== false,
        }))
    }

    function readWindowState() {
      if (typeof document === 'undefined') return { visible: true, focused: true }
      const visible = document.visibilityState === 'visible'
      const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true
      return { visible, focused }
    }

    function countdownDuration(minutes, seconds) {
      const min = Number(minutes)
      const sec = Number(seconds)
      const total = min * 60 + sec
      if (!Number.isInteger(min) || min < 0 || !Number.isInteger(sec) || sec < 0 || sec > 59 || total < 1 || total > COUNTDOWN_MAX_MINUTES * 60) return null
      return total * 1000
    }

    function projectTimer(timer, receivedAt, at) {
      const passed = timer.status === 'running' ? Math.max(0, at - receivedAt) : 0
      const elapsedMs = timer.elapsedMs + passed
      if (timer.mode !== 'countdown') return { elapsedMs, remainingMs: null }
      return { elapsedMs: Math.min(elapsedMs, timer.durationMs), remainingMs: Math.max(0, timer.remainingMs - passed) }
    }

    function timerDigits(ms, roundUp = false) {
      const whole = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000))
      const parts = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
      return parts.map((part) => String(part).padStart(2, '0')).join(':')
    }

    function createTimerAudio() {
      let context = null
      return {
        async unlock() {
          try {
            const Audio = window.AudioContext ?? window.webkitAudioContext
            if (!Audio) return false
            context ??= new Audio()
            if (context.state !== 'running') await context.resume()
            return context?.state === 'running'
          } catch { return false }
        },
        play() {
          if (context?.state !== 'running') return false
          try {
            for (const [frequency, delay] of [[660, 0], [880, .15]]) {
              const oscillator = context.createOscillator()
              const volume = context.createGain()
              const start = context.currentTime + delay
              oscillator.frequency.value = frequency
              volume.gain.setValueAtTime(.0001, start)
              volume.gain.exponentialRampToValueAtTime(.085, start + .018)
              volume.gain.exponentialRampToValueAtTime(.0001, start + .29)
              oscillator.connect(volume)
              volume.connect(context.destination)
              oscillator.start(start)
              oscillator.stop(start + .3)
              oscillator.onended = () => { oscillator.disconnect(); volume.disconnect() }
            }
            return true
          } catch { return false }
        },
        close() {
          if (context) void context.close().catch(() => {})
          context = null
        },
      }
    }

    /** 两个计时入口共用 Host 快照及请求队列，页面可见时才认领提醒。 */
    function createTimerClient(ctx, audio = createTimerAudio()) {
      const listeners = new Set()
      let state = { timer: null, receivedAt: 0, busy: false, syncError: false, actionError: '', notice: null, noticeError: false }
      let revision = 0
      let reading = null
      let poll = null
      let deadline = null
      let noticeTimeout = null
      let unsubscribeSettings = null
      let claiming = false
      let handledNotice = null
      let waitingNotice = null

      function update(patch) {
        state = { ...state, ...patch }
        for (const listener of listeners) listener(state)
      }

      function dismissNotice() {
        clearTimeout(noticeTimeout)
        update({ notice: null })
      }

      function showNotice() {
        if (!waitingNotice || !listeners.size || !readWindowState().visible) return
        const { id, sound } = waitingNotice
        waitingNotice = null
        const blocked = sound && !audio.play()
        clearTimeout(noticeTimeout)
        update({ notice: { id, blocked, failed: false } })
        if (!blocked) noticeTimeout = setTimeout(dismissNotice, 7_000)
      }

      async function claimNotice(id) {
        if (typeof id !== 'string' || id === handledNotice || claiming || !listeners.size || !readWindowState().visible) return
        claiming = true
        try {
          const response = await callHost(ctx, 'claimTimerNotification', { id, clientId: CLIENT_ID })
          handledNotice = id
          if (state.noticeError) update({ noticeError: false })
          if (response?.claimed === true && listeners.size && state.timer?.lastResult?.id === id) {
            waitingNotice = { id, sound: response.sound === true }
            showNotice()
          }
        } catch {
          // 轮询重试认领。到期状态仍以 getTimer 返回的快照为准。
          if (listeners.size && state.timer?.notification?.id === id) update({ noticeError: true })
        } finally {
          claiming = false
        }
      }

      function accept(timer, patch = {}) {
        if (!['idle', 'running', 'paused', 'completed'].includes(timer?.status) || !Number.isFinite(timer.elapsedMs)) {
          throw new Error('计时快照无效')
        }
        if (waitingNotice?.id !== timer.lastResult?.id) waitingNotice = null
        const notice = state.notice?.id === timer.lastResult?.id ? state.notice : null
        if (!notice) clearTimeout(noticeTimeout)
        update({ timer, receivedAt: Date.now(), syncError: false, notice,
          noticeError: state.noticeError && timer.notification?.id === state.timer?.notification?.id,
          ...patch,
        })
        clearTimeout(deadline)
        if (timer.status === 'running' && timer.mode === 'countdown' && timer.remainingMs > 0) {
          deadline = setTimeout(refresh, timer.remainingMs)
        }
        void claimNotice(timer.notification?.id)
      }

      function refresh() {
        if (!listeners.size || state.busy || !readWindowState().visible) return Promise.resolve(false)
        if (reading) return reading
        const ticket = revision
        const request = callHost(ctx, 'getTimer', {}).then((timer) => {
          if (ticket !== revision || !listeners.size) return false
          accept(timer)
          return true
        }).catch(() => {
          if (ticket === revision && listeners.size) update({ syncError: true })
          return false
        }).finally(() => { if (reading === request) reading = null })
        reading = request
        return request
      }

      function syncVisibility() {
        showNotice()
        void refresh()
      }

      return {
        snapshot: () => state,
        subscribe(listener) {
          listeners.add(listener)
          listener(state)
          if (listeners.size === 1) {
            window.addEventListener?.('focus', syncVisibility)
            if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', syncVisibility)
            unsubscribeSettings = subscribeSettingsChanged(syncVisibility)
            poll = setInterval(refresh, TIMER_REFRESH_MS)
            syncVisibility()
          }
          return () => {
            listeners.delete(listener)
            if (listeners.size) return
            window.removeEventListener?.('focus', syncVisibility)
            if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', syncVisibility)
            unsubscribeSettings?.()
            clearInterval(poll)
            clearTimeout(deadline)
            clearTimeout(noticeTimeout)
            revision += 1
            reading = null
            waitingNotice = null
            audio.close()
          }
        },
        async retry() {
          if (await refresh()) update({ actionError: '' })
        },
        async control(command) {
          if (state.busy || state.syncError || !state.timer) return
          const targetId = command.action === 'clear-result' ? state.timer.lastResult?.id : state.timer.id
          if (command.id !== targetId) {
            update({ actionError: 'timerChanged' })
            void refresh()
            return
          }
          if (command.action === 'start' && command.mode === 'countdown' || command.action === 'resume' && state.timer.mode === 'countdown') {
            void audio.unlock()
          }
          const ticket = ++revision
          reading = null
          update({ busy: true, actionError: '' })
          try {
            const timer = await callHost(ctx, 'controlTimer', command)
            if (ticket === revision && listeners.size) accept(timer)
          } catch (error) {
            if (ticket === revision && listeners.size) {
              update({ actionError: error?.code === 'stale-timer' ? 'timerChanged' : 'timerActionError' })
            }
          } finally {
            update({ busy: false })
            if (state.actionError || ticket !== revision) void refresh()
          }
        },
        dismissNotice,
        async playNotice() {
          const notice = state.notice
          if (!notice?.blocked) return
          const unlocked = await audio.unlock()
          if (state.notice !== notice || !readWindowState().visible) return
          if (unlocked && audio.play()) dismissNotice()
          else update({ notice: { ...notice, failed: true } })
        },
      }
    }

    function useTimerClient(client) {
      const [snapshot, setSnapshot] = React.useState(client.snapshot)
      React.useEffect(() => client.subscribe(setSnapshot), [client])
      return snapshot
    }

    function useClockTick(enabled) {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        if (!enabled) return undefined
        const timer = setInterval(() => setTick((value) => value + 1), 1000)
        return () => clearInterval(timer)
      }, [enabled])
      return Date.now()
    }

    /** 标准属性里的 hook 只在 sidebar 入口的渲染环境存在；缺省时给出安全的静态值。 */
    function useStandardValue(useHook, selector, fallback) {
      if (typeof useHook === 'function') return useHook(selector)
      return fallback
    }

    function sessionOf(state) {
      if (state === null || typeof state !== 'object' || !Array.isArray(state.ids) || state.byId === null || typeof state.byId !== 'object') {
        return null
      }
      for (const id of state.ids) {
        const row = state.byId[id]
        if (row !== null && typeof row === 'object' && (row.retainedBy?.mainView ?? 0) > 0) return row
      }
      return null
    }

    function workspaceOf(state, sessionId) {
      if (sessionId === null) return null
      const items = Array.isArray(state?.items) ? state.items : []
      return items.find((item) => Array.isArray(item?.sessionIds) && item.sessionIds.includes(sessionId)) ?? null
    }

    /**
     * 组装 presence 心跳：前台会话/工作区都从 DSH 的公开 Client 状态推导，
     * 页面切到全局面板（例如本插件自己的页面）时视为没有前台会话。
     */
    function usePresenceReporter(props, ctx) {
      const [windowState, setWindowState] = React.useState(readWindowState)
      const lastInteractionRef = React.useRef(Date.now())
      const factsRef = React.useRef(null)

      const foregroundId = useStandardValue(props?.useSessions, (state) => sessionOf(state)?.id ?? null, null)
      const sessionTitle = useStandardValue(
        props?.useSessions,
        (state) => {
          const row = sessionOf(state)
          return row === null ? null : (row.title ?? row.displayTitle ?? null)
        },
        null,
      )
      const activePanelId = useStandardValue(props?.usePanelInfo, (info) => info?.activePanelId, undefined)
      const panelActive = activePanelId !== null && activePanelId !== undefined
      const effectiveSessionId = panelActive ? null : foregroundId
      const workspaceId = useStandardValue(
        props?.useWorkspaces,
        (state) => workspaceOf(state, effectiveSessionId)?.workspaceId ?? null,
        null,
      )
      const workspaceTitle = useStandardValue(
        props?.useWorkspaces,
        (state) => {
          const workspace = workspaceOf(state, effectiveSessionId)
          return workspace?.title ?? workspace?.path ?? null
        },
        null,
      )
      const foregroundRunning = useStandardValue(
        props?.useSessionStatus,
        (statuses) => {
          if (effectiveSessionId === null || statuses === null || typeof statuses?.get !== 'function') return false
          return statuses.get(effectiveSessionId)?.running === true
        },
        false,
      )

      const facts = {
        visible: windowState.visible,
        focused: windowState.focused,
        sessionId: effectiveSessionId,
        sessionTitle: panelActive ? null : sessionTitle,
        workspaceId: panelActive ? null : workspaceId,
        workspaceTitle: panelActive ? null : workspaceTitle,
        foregroundRunning: panelActive ? false : foregroundRunning,
      }
      factsRef.current = facts

      const send = React.useCallback(() => {
        const current = factsRef.current
        if (current === null) return
        callHost(ctx, 'presence', {
          clientId: CLIENT_ID,
          ...current,
          lastInteractionAt: lastInteractionRef.current,
        }).catch(() => {})
      }, [ctx])

      // 键鼠操作只更新本地时间戳，不发请求；由 15 秒心跳统一上报。
      React.useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const touch = () => {
          lastInteractionRef.current = Date.now()
        }
        const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']
        for (const event of events) window.addEventListener(event, touch, { capture: true, passive: true })

        const updateWindowState = () => setWindowState(readWindowState())
        document.addEventListener('visibilitychange', updateWindowState)
        window.addEventListener('focus', updateWindowState)
        window.addEventListener('blur', updateWindowState)

        if (document.visibilityState === 'visible' && document.hasFocus()) {
          lastInteractionRef.current = Date.now()
        }
        const timer = window.setInterval(send, PRESENCE_HEARTBEAT_MS)
        return () => {
          window.clearInterval(timer)
          for (const event of events) window.removeEventListener(event, touch, { capture: true })
          document.removeEventListener('visibilitychange', updateWindowState)
          window.removeEventListener('focus', updateWindowState)
          window.removeEventListener('blur', updateWindowState)
        }
      }, [send])

      // 可见性、聚焦、前台会话或运行状态变化时立即补报，不等下一个 15 秒。
      React.useEffect(() => {
        send()
      }, [
        send,
        facts.visible,
        facts.focused,
        facts.sessionId,
        facts.sessionTitle,
        facts.workspaceId,
        facts.workspaceTitle,
        facts.foregroundRunning,
      ])
      return activePanelId === null && foregroundId !== null
    }

    /**
     * 今日三项时长的迷你构成环：按在线、活跃、任务三项之和归一化。
     * 颜色全部来自入口自己的插件主题变量；活跃段与状态点共用 --cs-active-dot。
     */
    function sidebarRingSegments(stats) {
      const values = [
        { key: 'online', color: '--cs-ring-online', ms: Math.max(0, finite(stats?.onlineMs)) },
        { key: 'active', color: '--cs-active-dot', ms: Math.max(0, finite(stats?.activeMs)) },
        { key: 'task', color: '--cs-task', ms: Math.max(0, finite(stats?.taskMs)) },
      ]
      const total = values.reduce((sum, item) => sum + item.ms, 0)
      let cursor = 0
      return values.map((item) => {
        const share = total > 0 ? item.ms / total : 0
        const from = cursor
        cursor += share
        return { ...item, share, from, to: cursor }
      })
    }

    function roundRingPercent(value) {
      return Math.round(value * 1000) / 1000
    }

    /** 把三段毫秒值拼成 conic-gradient；全零时只画一圈轨道。 */
    function sidebarRingGradient(segments) {
      const total = segments.reduce((sum, segment) => sum + segment.ms, 0)
      if (total <= 0) return 'conic-gradient(var(--cs-ring-track) 0% 100%)'
      const stops = segments.map((segment) =>
        `var(${segment.color}) ${roundRingPercent(segment.from * 100)}% ${roundRingPercent(segment.to * 100)}%`)
      return `conic-gradient(${stops.join(', ')})`
    }

    /** 所选时长随心跳实时增长；Host 快照之间不再等下一次轮询才跳数。 */
    function sidebarLiveElapsed(stats, metric = 'online') {
      const running = metric === 'active'
        ? stats?.activeRunning === true
        : metric === 'task'
          ? stats?.taskRunning === true
          : stats?.running === true
      return running ? Math.max(0, Date.now() - finite(stats.receivedAt)) : 0
    }

    function sidebarMetricBaseMs(stats, metric = 'online') {
      if (metric === 'active') return finite(stats?.activeMs)
      if (metric === 'task') return finite(stats?.taskMs)
      return finite(stats?.onlineMs)
    }

    function sidebarDisplayMs(stats, metric = 'online') {
      return sidebarMetricBaseMs(stats, metric) + sidebarLiveElapsed(stats, metric)
    }

    /** 悬停 / 聚焦浮层：三项具体数值、颜色与环上占比。 */
    function buildSidebarTip(stats, t, format = 'hms') {
      const segments = sidebarRingSegments(stats)
      const rows = [
        { key: 'online', label: t('onlineLabel'), value: formatDuration(sidebarDisplayMs(stats, 'online'), format) },
        { key: 'active', label: t('activeLabel'), value: formatDuration(sidebarDisplayMs(stats, 'active'), format) },
        { key: 'task', label: t('taskLabel'), value: formatDuration(sidebarDisplayMs(stats, 'task'), format) },
      ]
      return {
        kind: 'sidebar',
        key: 'today',
        rows: rows.map((row, index) => ({
          ...row,
          color: segments[index]?.color,
          share: formatPercent(segments[index]?.share ?? 0),
        })),
      }
    }

    /** 首次进入可视区才播放；同 key 的刷新数值、悬停和滚动返回保留已显示状态，周期切换的新节点重新入场。 */
    function ChartReveal({ as = 'div', children, threshold = .08, ...props }) {
      const ref = React.useRef(null)
      const [visible, setVisible] = React.useState(() => prefersReducedMotion()
        || typeof window.IntersectionObserver !== 'function')
      React.useEffect(() => {
        if (visible || !ref.current) return undefined
        const observer = new window.IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisible(true)
            observer.disconnect()
          }
        }, { threshold })
        observer.observe(ref.current)
        return () => observer.disconnect()
      }, [visible, threshold])
      // 首帧仍由可视区触发；之后切换周期时，新的柱子/格子是新的 DOM 节点，
      // 会各自播放入场动画，已有同 key 节点的轮询更新则不重播。
      return h(as, {
        ...props, ref,
        'data-chart-reveal': visible ? 'visible' : 'pending',
      }, children)
    }

    /** 顺序展开最多错开 180ms，长序列也在 600ms 内完成。 */
    function chartStagger(index, count) {
      return { '--cs-chart-delay': `${Math.round(index / Math.max(1, count - 1) * 180)}ms` }
    }

    /** 用 SVG 画标准圆环；pathLength=100 让三段弧长直接按百分比分配。 */
    function renderSidebarRing(segments) {
      const visible = segments.filter((segment) => segment.ms > 0)
      const gap = visible.length > 1 ? 1.4 : 0
      return h(ChartReveal, { as: 'span', className: 'dsh-timespan-nav-ring', 'aria-hidden': true },
        h('svg', { viewBox: '0 0 20 20', width: 18, height: 18, role: 'presentation', focusable: 'false' },
          h('circle', {
            className: 'dsh-timespan-nav-ring-track',
            cx: 10, cy: 10, r: 8, pathLength: 100, fill: 'none',
          }),
          visible.map((segment, index) => {
            const dash = Math.max(0, segment.share * 100 - gap)
            const offset = -(segment.from * 100 + (index === 0 ? 0 : gap / 2))
            return h('circle', {
              key: segment.key,
              className: `dsh-timespan-nav-ring-seg cs-reveal-ring is-${segment.key}`,
              style: chartStagger(index, visible.length),
              cx: 10, cy: 10, r: 8, pathLength: 100, fill: 'none',
              stroke: `var(${segment.color})`,
              strokeDasharray: `${roundRingPercent(dash)} ${roundRingPercent(100 - dash)}`,
              strokeDashoffset: roundRingPercent(offset),
            })
          })))
    }

    /** 纯渲染层：侧栏时长浮层。沿用 fixed 定位与视口夹取，内容与位置均可注入。 */
    function renderSidebarTip(tip, position, ref) {
      if (!tip) return null
      const style = position
        ? { left: `${position.left}px`, top: `${position.top}px` }
        : { left: '0px', top: '0px', visibility: 'hidden' }
      return h('span', {
        ref,
        id: 'dsh-timespan-sidebar-tip',
        className: 'dsh-timespan-nav-tip',
        role: 'tooltip',
        style,
        'data-placement': position?.placement ?? 'top',
      },
      h('span', { className: 'dsh-timespan-nav-tip-rows' }, (tip.rows || []).map((row) => h('span', {
        className: 'dsh-timespan-nav-tip-row', key: row.key ?? row.label,
      },
      h('i', { className: 'dsh-timespan-nav-tip-swatch', style: { background: `var(${row.color})` }, 'aria-hidden': true }),
      h('span', { className: 'dsh-timespan-nav-tip-label' }, row.label),
      h('span', { className: 'dsh-timespan-nav-tip-value' }, row.value),
      h('span', { className: 'dsh-timespan-nav-tip-share' }, row.share)))))
    }

    /** 量一次浮层尺寸再定位，保证贴边时也完整可读。 */
    function SidebarTip({ tip }) {
      const ref = React.useRef(null)
      const [position, setPosition] = React.useState(null)
      React.useEffect(() => {
        if (!tip) {
          setPosition(null)
          return
        }
        const node = ref.current
        if (!node) return
        setPosition(clampTipPosition(tip.anchor, {
          width: typeof node.offsetWidth === 'number' ? node.offsetWidth : 232,
          height: typeof node.offsetHeight === 'number' ? node.offsetHeight : 104,
        }, {
          width: typeof window !== 'undefined' ? window.innerWidth : 0,
          height: typeof window !== 'undefined' ? window.innerHeight : 0,
        }, { gap: 8, margin: 8 }))
      }, [tip])
      return renderSidebarTip(tip, position, ref)
    }

    /** 侧栏专属悬停状态：移入后延迟出现，聚焦立即出现；移出、失焦或 Esc 立即收起。 */
    function useDelayedSidebarTip(delay = SIDEBAR_TIP_DELAY_MS) {
      const [tip, setTip] = React.useState(null)
      const timerRef = React.useRef(null)
      const clear = () => {
        if (timerRef.current !== null) {
          globalThis.clearTimeout(timerRef.current)
          timerRef.current = null
        }
      }
      const show = (content, event, immediate = false) => {
        const node = event?.currentTarget
        if (!node || typeof node.getBoundingClientRect !== 'function') return
        clear()
        const rect = node.getBoundingClientRect()
        const open = () => setTip({
          ...content,
          anchor: {
            left: finite(rect.left), top: finite(rect.top),
            right: finite(rect.right), bottom: finite(rect.bottom),
            width: finite(rect.width), height: finite(rect.height),
          },
        })
        if (immediate) open()
        else timerRef.current = globalThis.setTimeout(open, delay)
      }
      const hide = () => {
        clear()
        setTip(null)
      }
      React.useEffect(() => () => clear(), [])
      return { tip, show, hide }
    }

    /**
     * 侧栏入口的纯渲染层：主题、状态显隐与三项数值都可从外部注入，
     * 便于在隔离上下文断言结构；真实组件只负责轮询与订阅。
     */
    function renderSidebarEntry({ stats, theme, showName = true, showDot = true, dotPosition = SIDEBAR_DOT_POSITION_DEFAULT, t, size, format = DEFAULT_DURATION_FORMAT, sidebarMetric = SIDEBAR_DURATION_DEFAULT, hover = null }) {
      const wide = typeof size !== 'number' || size !== 18
      const themeClass = sidebarThemeClass(theme?.palette, theme?.appearance, theme?.systemDark === true)
      const segments = sidebarRingSegments(stats)
      const selectedMetric = normalizeSidebarDuration(sidebarMetric)
      const normalizedDotPosition = normalizeSidebarDotPosition(dotPosition)
      const value = stats?.status === 'loading' ? '–:––:––' : formatDuration(sidebarDisplayMs(stats, selectedMetric), format)
      const active = stats?.activeRunning === true
      const task = stats?.taskRunning === true
      const selectedLive = selectedMetric === 'active'
        ? active
        : selectedMetric === 'task'
          ? task
          : stats?.running === true
      // 任务中优先于活跃中：只要任务在跑，状态点与文字都固定为紫色任务态。
      const statusLabel = task ? t('taskRunning') : active ? t('live') : t('idle')
      const statusClass = task ? ' is-task' : active ? ' is-active' : ' is-idle'
      const summary = `${t('navTooltip')}：${t('onlineLabel')} ${formatDuration(sidebarDisplayMs(stats, 'online'), format)} · ${t('activeLabel')} ${formatDuration(sidebarDisplayMs(stats, 'active'), format)} · ${t('taskLabel')} ${formatDuration(sidebarDisplayMs(stats, 'task'), format)} · ${statusLabel}`
      // 去掉名称后时间居中并放大一档；环与状态点在两端。
      const nameless = wide && showName === false
      const tipContent = buildSidebarTip(stats, t, format)
      const hoverProps = hover === null ? {} : {
        onMouseEnter: (event) => hover.show?.(tipContent, event, false),
        onMouseLeave: () => hover.hide?.(),
        onFocus: (event) => hover.show?.(tipContent, event, true),
        onBlur: () => hover.hide?.(),
        onKeyDown: (event) => { if (event?.key === 'Escape') hover.hide?.() },
      }
      return h('span', {
        className: `dsh-timespan-nav-entry ${themeClass}${nameless ? ' is-nameless' : ''}${normalizedDotPosition === 'end' ? ' is-dot-end' : ' is-dot-inline'}`,
        tabIndex: 0,
        'aria-label': summary,
        ...(hover?.tip ? { 'aria-describedby': 'dsh-timespan-sidebar-tip' } : {}),
        ...hoverProps,
      },
      h('style', null, DSH_TIMESPAN_SIDEBAR_CSS),
      renderSidebarRing(segments),
      wide
        ? h('span', {
            key: `nav-time-${format}`,
            className: `dsh-timespan-nav-time${selectedLive ? ' is-live' : ''}`,
            'data-format': format,
            'data-metric': selectedMetric,
          }, value)
        : null,
      wide && showName
        ? h('span', { className: `dsh-timespan-nav-status${statusClass}` }, statusLabel)
        : null,
      wide && showDot
        ? h('span', {
            className: `dsh-timespan-nav-dot${active || task ? ' is-live' : ''}${active ? ' is-active' : ''}${task ? ' is-task' : ''}`,
            role: 'img',
            'aria-label': statusLabel,
          })
        : null,
      hover === null ? null : h(SidebarTip, { tip: hover.tip }))
    }

    /** 侧边栏常驻入口：今日构成环 + 所选时长 + 可隐藏状态文字 + 状态点。 */
    function createSidebarEntry(ctx, t) {
      return function DshTimespanSidebarEntry(props) {
        // 设置页切换语言后，侧栏入口立刻用新字典重渲染。
        useLanguageRevision()
        const [previewFormat, setPreviewFormat] = React.useState(null)
        const [refreshNonce, setRefreshNonce] = React.useState(0)
        const stats = useTodayStats(ctx, SIDEBAR_REFRESH_MS, refreshNonce)
        const hover = useDelayedSidebarTip(SIDEBAR_TIP_DELAY_MS)
        const theme = useStoredTheme()
        // 首次安装默认隐藏状态文字；设置读取完成前也保持隐藏，避免先闪出一行状态。
        const [showName, setShowName] = React.useState(false)
        // 侧栏显示哪种时长；Host 设置读回前先按默认在线时长渲染，避免布局闪动。
        const [sidebarDuration, setSidebarDuration] = React.useState(SIDEBAR_DURATION_DEFAULT)
        // 状态点显隐与位置也是 Host 设置；读回前按默认跟随时长显示，避免入口先闪回贴右布局。
        const [showDot, setShowDot] = React.useState(true)
        const [dotPosition, setDotPosition] = React.useState(SIDEBAR_DOT_POSITION_DEFAULT)

        // 设置页选择格式时侧栏也立即预览；保存或取消后回到 Host 的已保存值。
        React.useEffect(() => subscribeDurationFormatPreview((value) => setPreviewFormat(value)), [])
        React.useEffect(() => subscribeSettingsChanged(() => {
          setPreviewFormat(null)
          setRefreshNonce((value) => value + 1)
        }), [])

        // 状态文字显隐是 Host 设置；设置页保存后按同一事件重读，不缓存第二份业务状态。
        React.useEffect(() => {
          let active = true
          const load = () => {
            callSettings(ctx, 'getSettings', {})
              .then((value) => {
                if (!active) return
                const visible = value?.sidebarShowName === true
                setShowName(visible)
                setSidebarDuration(normalizeSidebarDuration(value?.sidebarDuration))
                setShowDot(value?.sidebarDotVisible !== false)
                setDotPosition(normalizeSidebarDotPosition(value?.sidebarDotPosition))
                // 入口内已渲染时长（以及可选的状态文字），宿主 panelTitle 始终隐藏，避免多出插件名。
                applySidebarHostNameVisibility(false)
              })
              .catch(() => {
                // 读不到设置时保持默认隐藏，不拿默认值覆盖 Host。
              })
          }
          load()
          const unsubscribe = subscribeSettingsChanged(load)
          return () => {
            active = false
            unsubscribe()
            applySidebarHostNameVisibility(true)
          }
        }, [ctx])

        return renderSidebarEntry({
          stats,
          theme,
          showName,
          showDot,
          dotPosition,
          t,
          size: props?.size,
          format: normalizeDurationFormat(previewFormat ?? stats.durationFormat),
          sidebarMetric: sidebarDuration,
          hover,
        })
      }
    }

    function ClockDial({ at, t }) {
      const date = new Date(at)
      const seconds = date.getSeconds()
      const minutes = date.getMinutes()
      const hours = date.getHours()
      const time = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
      return h('div', { className: 'cs-clock-face' },
        h('svg', { viewBox: '0 0 128 128', fill: 'none', 'aria-hidden': true },
          h('circle', { className: 'cs-clock-rim', cx: 64, cy: 64, r: 61 }),
          Array.from({ length: 12 }, (_, index) => h('line', {
            key: index, className: `cs-clock-tick${index % 3 === 0 ? ' is-quarter' : ''}`,
            x1: 64, y1: 11, x2: 64, y2: index % 3 === 0 ? 18 : 15,
            transform: `rotate(${index * 30} 64 64)`,
          })),
          h('line', { className: 'cs-clock-hour', x1: 64, y1: 64, x2: 64, y2: 38, transform: `rotate(${30 * hours + minutes / 2} 64 64)` }),
          h('line', { className: 'cs-clock-minute', x1: 64, y1: 64, x2: 64, y2: 25, transform: `rotate(${6 * minutes + seconds / 10} 64 64)` }),
          h('line', { className: 'cs-clock-second', x1: 64, y1: 75, x2: 64, y2: 17, transform: `rotate(${6 * seconds} 64 64)` }),
          h('circle', { className: 'cs-clock-pivot', cx: 64, cy: 64, r: 3.1 })),
        h('div', { className: 'cs-clock-caption' }, t('timerClock'), h('time', { dateTime: time }, time)))
    }

    function timerStatusKey(timer) {
      return timer?.status === 'running' ? 'timerRunning'
        : timer?.status === 'paused' ? 'timerPaused'
          : timer?.status === 'completed' ? (timer.lastResult?.reason === 'expired' ? 'timerExpired' : 'timerCompleted')
            : 'timerIdle'
    }

    /** 同组选择共用一块底板；重排或切入/离开 snapValue 时直接定位。 */
    function SelectionGroup({ as = 'div', value, snapValue, className = '', children, ...props }) {
      const rootRef = React.useRef(null)
      const previous = React.useRef(value)
      React.useLayoutEffect(() => {
        const root = rootRef.current
        if (!root?.querySelector) return undefined
        const place = (animate = false) => {
          const active = root.querySelector('[aria-pressed="true"], [aria-selected="true"], [aria-checked="true"]')
          if (!active) { delete root.dataset.selectionReady; return }
          const outer = root.getBoundingClientRect()
          const rect = active.getBoundingClientRect()
          if (!rect.width || !rect.height) return
          root.dataset.selectionMotion = String(animate && !prefersReducedMotion())
          root.style.setProperty('--cs-indicator-x', `${rect.left - outer.left - root.clientLeft + root.scrollLeft}px`)
          root.style.setProperty('--cs-indicator-y', `${rect.top - outer.top - root.clientTop + root.scrollTop}px`)
          root.style.setProperty('--cs-indicator-width', `${rect.width}px`)
          root.style.setProperty('--cs-indicator-height', `${rect.height}px`)
          root.dataset.selectionReady = 'true'
        }
        place(previous.current !== value && previous.current !== snapValue && value !== snapValue)
        previous.current = value
        const sizeOf = () => [root, ...root.querySelectorAll('button')].map((item) => `${item.offsetWidth}:${item.offsetHeight}`).join('|')
        let sizes = sizeOf()
        const resize = () => { sizes = sizeOf(); place(false) }
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
          if (sizeOf() !== sizes) resize()
        }) : null
        observer?.observe(root)
        for (const item of root.querySelectorAll('button')) observer?.observe(item)
        window.addEventListener?.('resize', resize)
        let active = true
        document.fonts?.ready.then(() => { if (active && sizeOf() !== sizes) resize() })
        return () => { active = false; observer?.disconnect(); window.removeEventListener?.('resize', resize) }
      }, [value, snapValue])
      return h(as, { ...props, ref: rootRef, className: `cs-selection-group ${className}`, 'data-selection': value },
        h('span', { className: 'cs-selection-thumb', 'aria-hidden': true }), children)
    }

    /** 新内容就绪才入场；轮询和实时数字更新不重播。 */
    function ContentTransition({ as = 'div', identity, busy = false, retain = false, className = '', children, ...props }) {
      const rootRef = React.useRef(null)
      const interrupted = React.useRef(null)
      const previousContent = React.useRef(children)
      const enterFromZero = React.useRef(false)
      const [shown, setShown] = React.useState(identity)
      const changing = retain && shown !== identity
      if (!changing) previousContent.current = children
      React.useEffect(() => {
        const root = rootRef.current
        if (!root?.animate || prefersReducedMotion()) {
          if (changing) setShown(identity)
          return undefined
        }
        const exit = busy || changing
        const animation = root.animate([{ opacity: interrupted.current ?? (enterFromZero.current ? 0 : exit ? 1 : .25) }, { opacity: changing ? 0 : busy ? .15 : 1 }], {
          duration: exit ? VIEW_EXIT_MS : VIEW_ENTER_MS, easing: 'cubic-bezier(.2,.7,.2,1)', fill: exit ? 'forwards' : 'none',
        })
        interrupted.current = null
        enterFromZero.current = false
        animation.onfinish = () => { if (changing) { enterFromZero.current = true; setShown(identity) } }
        return () => {
          interrupted.current = animation.playState === 'running' ? Number(window.getComputedStyle(root).opacity) : null
          animation.onfinish = null
          animation.cancel()
        }
      }, [identity, busy, changing])
      return h(as, { ...props, className, ref: rootRef, inert: busy || changing ? '' : undefined, 'aria-busy': busy || changing || undefined }, changing ? previousContent.current : children)
    }

    /**
     * 时长数字渐变：切换主指标时让旧读数平滑过渡到新读数，而不是旧值淡出、新值淡入。
     * 同一指标内的轮询更新直接落到新值，避免每隔十秒都重播数字动画。
     */
    function DurationTween({ identity, value, format = DEFAULT_DURATION_FORMAT, className = '', children, ...props }) {
      const target = Math.max(0, finite(value))
      const [shownMs, setShownMs] = React.useState(target)
      const shownRef = React.useRef(target)
      const identityRef = React.useRef(identity)
      React.useEffect(() => {
        const from = shownRef.current
        const switching = identityRef.current !== identity
        identityRef.current = identity
        const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame.bind(window)
          : null
        const cancel = typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
          ? window.cancelAnimationFrame.bind(window)
          : null
        if (!switching || from === target || prefersReducedMotion() || !raf) {
          shownRef.current = target
          setShownMs(target)
          return undefined
        }
        const startedAt = Date.now()
        let frame = 0
        const step = () => {
          const progress = Math.min(1, (Date.now() - startedAt) / DURATION_TWEEN_MS)
          const next = tweenDurationMs(from, target, progress)
          shownRef.current = next
          setShownMs(next)
          if (progress < 1) frame = raf(step)
        }
        frame = raf(step)
        return () => { if (cancel) cancel(frame) }
      }, [identity, target])
      return h('span', { ...props, className }, renderDurationDigits(formatDuration(shownMs, format)))
    }

    /**
     * 手动计时读数：正／倒计时切换时从当前读数缓动到目标读数，避免整块数字淡出再淡入；
     * 同一模式下的实时走秒与同步更新仍直接落值，不拖慢每秒读数。
     */
    function TimerReadout({ identity, value, roundUp = false, className = '', ...props }) {
      const target = Number.isFinite(value) ? Math.max(0, value) : null
      const [shownMs, setShownMs] = React.useState(target)
      const shownRef = React.useRef(target)
      const identityRef = React.useRef(identity)
      React.useEffect(() => {
        const from = shownRef.current
        const switching = identityRef.current !== identity
        identityRef.current = identity
        if (target === null) {
          shownRef.current = null
          setShownMs(null)
          return undefined
        }
        const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame.bind(window)
          : null
        const cancel = typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
          ? window.cancelAnimationFrame.bind(window)
          : null
        if (!switching || from === null || from === target || prefersReducedMotion() || !raf) {
          shownRef.current = target
          setShownMs(target)
          return undefined
        }
        const startedAt = Date.now()
        let frame = 0
        const step = () => {
          const progress = Math.min(1, (Date.now() - startedAt) / DURATION_TWEEN_MS)
          const next = tweenDurationMs(from, target, progress)
          shownRef.current = next
          setShownMs(next)
          if (progress < 1) frame = raf(step)
        }
        frame = raf(step)
        return () => { if (cancel) cancel(frame) }
      }, [identity, target])
      return h('div', { ...props, className }, shownMs === null ? '––:––:––' : timerDigits(shownMs, roundUp))
    }

    /** 折叠结束再卸载内容；首次关闭的分组不提前渲染全部会话。 */
    function AnimatedCollapse({ open, className = '', children }) {
      const retained = React.useRef(null)
      const rootRef = React.useRef(null)
      const [, redraw] = React.useState(0)
      if (open) retained.current = children
      const content = open ? children : prefersReducedMotion() ? null : retained.current
      React.useEffect(() => {
        if (open) return undefined
        let disposed = false
        const finish = () => {
          if (!disposed && retained.current !== null) { retained.current = null; redraw((value) => value + 1) }
        }
        // 快速反向可能没有产生 transitionend；等待实际动画结束，无动画时直接释放。
        const animations = rootRef.current?.getAnimations?.() ?? []
        if (prefersReducedMotion() || animations.length === 0) finish()
        else Promise.allSettled(animations.map((animation) => animation.finished)).then(finish)
        return () => { disposed = true }
      }, [open])
      return h('div', {
        ref: rootRef,
        className: `cs-collapse ${className}${open ? ' is-open' : ''}`, inert: open ? undefined : '', 'aria-hidden': !open,
        onTransitionEnd: (event) => {
          if (!open && event.target === event.currentTarget && event.propertyName === 'grid-template-rows') {
            retained.current = null
            redraw((value) => value + 1)
          }
        },
      }, h('div', { className: 'cs-collapse-body' }, content))
    }

    function TimerControls({ client, snapshot, at, t }) {
      const [mode, setMode] = React.useState('stopwatch')
      const [minutes, setMinutes] = React.useState('25')
      const [seconds, setSeconds] = React.useState('0')
      const { timer, receivedAt, busy, syncError, actionError, noticeError } = snapshot
      const [savingDelayed, setSavingDelayed] = React.useState(false)
      React.useEffect(() => {
        if (!busy) { setSavingDelayed(false); return undefined }
        const timeout = setTimeout(() => setSavingDelayed(true), 240)
        return () => clearTimeout(timeout)
      }, [busy])
      const status = timer?.status
      const isIdle = status === 'idle'
      const countdown = (isIdle ? mode : timer?.mode) === 'countdown'
      const durationMs = countdownDuration(minutes, seconds)
      const invalid = isIdle && countdown && durationMs === null
      const projection = timer ? projectTimer(timer, receivedAt, at) : null
      const value = isIdle && countdown ? durationMs : countdown ? projection?.remainingMs : projection?.elapsedMs
      const result = timer?.lastResult
      const disabled = busy || syncError || !timer
      const action = (name, key, primary = false, extra = {}) => h('button', {
        type: 'button', className: `cs-timer-button${primary ? ' is-primary' : ''}`,
        disabled: disabled || (name === 'start' && invalid),
        onClick: () => client.control({ action: name, id: timer.id, ...extra }),
      }, t(key))
      const durationInput = (unit, current, change, max) => h('label', { className: 'cs-timer-unit' },
        h('input', {
          type: 'number', inputMode: 'numeric', min: 0, max, step: 1,
          value: current, disabled, 'aria-label': t(unit), 'aria-invalid': invalid || undefined,
          onChange: (event) => change(event.target.value),
        }), t(unit))

      return h('div', { className: 'cs-timer-controls', 'aria-busy': busy || undefined },
        h('div', { className: 'cs-timer-heading' },
          h('strong', null, t('timerTitle')),
          timer ? h('span', { className: `cs-timer-state is-${status}`, role: 'status' }, t(busy && savingDelayed ? 'timerSaving' : timerStatusKey(timer))) : null),
        h('div', { className: 'cs-timer-mode-slot' }, isIdle ? h(SelectionGroup, { value: mode, className: 'cs-timer-modes', role: 'group', 'aria-label': t('timerTitle') },
          [['stopwatch', 'timerStopwatch'], ['countdown', 'timerCountdown']].map(([option, label]) => h('button', {
            key: option, type: 'button', 'aria-pressed': mode === option, disabled,
            onClick: () => setMode(option),
          }, t(label)))) : timer ? h('span', { className: 'cs-timer-mode' }, t(countdown ? 'timerCountdown' : 'timerStopwatch')) : null),
        h(TimerReadout, { identity: isIdle ? mode : timer?.mode, value, roundUp: countdown, className: 'cs-timer-readout', role: 'timer', 'aria-live': 'off' }),
        h(AnimatedCollapse, { open: countdown && !isIdle && timer?.durationMs > 0 }, countdown && timer?.durationMs > 0 ? h('progress', {
          className: 'cs-timer-progress', max: timer.durationMs, value: projection.elapsedMs, 'aria-label': t('timerCountdown'),
        }) : null),
        h(AnimatedCollapse, { open: isIdle && countdown }, h('fieldset', { className: 'cs-timer-duration' },
          h('legend', null, t('timerDuration')),
          durationInput('timerMinutes', minutes, setMinutes, COUNTDOWN_MAX_MINUTES),
          durationInput('timerSeconds', seconds, setSeconds, 59),
          invalid ? h('p', { className: 'cs-timer-feedback is-error' }, t('timerDurationInvalid')) : null)),
        h('div', { className: 'cs-timer-actions' },
          isIdle ? action('start', 'timerStart', true, { mode, ...(countdown ? { durationMs } : {}) }) : null,
          status === 'running' ? action('pause', 'timerPause', true) : null,
          status === 'paused' ? action('resume', 'timerResume', true) : null,
          status === 'running' || status === 'paused' ? action('complete', 'timerComplete') : null,
          status === 'paused' || status === 'completed' ? action('reset', 'timerReset') : null),
        syncError || actionError || noticeError ? h('div', { className: 'cs-timer-feedback is-error', role: 'status' },
          t(syncError ? 'timerSyncError' : actionError || 'timerNoticeError'), h('button', {
            className: 'cs-timer-button', type: 'button', disabled: busy, onClick: client.retry,
          }, t('timerRefresh'))) : null,
        !timer && !syncError ? h('div', { className: 'cs-timer-feedback', role: 'status' }, t('timerSyncing')) : null,
        h(AnimatedCollapse, { open: Boolean(result), className: 'cs-result-collapse' }, result ? h('div', { className: 'cs-timer-result' },
          h('div', { className: 'cs-timer-result-copy' },
            h('span', null, `${t('timerLastResult')} · ${t(result.mode === 'countdown' ? 'timerCountdown' : 'timerStopwatch')}`),
            h('span', null, `${t('timerResultElapsed').replace('{time}', timerDigits(result.elapsedMs))} · ${formatNoticeTime(result.completedAt)}`)),
          h('button', { type: 'button', className: 'cs-timer-result-delete', disabled,
            title: t('timerDeleteResult'), 'aria-label': t('timerDeleteResult'),
            onClick: () => client.control({ action: 'clear-result', id: result.id }),
          }, h('span', { className: 'cs-delete-dot', 'aria-hidden': true }),
          h(DetailGlyph, { name: 'delete', size: 15 }))) : null))
    }

    /** 退出后才隐藏表面；只在表面本身改变透明度，避免祖先图层隔断磨砂背景。 */
    function useSurfaceFade(open, surfaceRef) {
      const [retained, setRetained] = React.useState(open)
      const interruptedOpacity = React.useRef(null)
      // 新表面必须在首帧绘制前设置透明度，避免先完整显示一帧再退回入场起点。
      React.useLayoutEffect(() => {
        const surface = surfaceRef.current
        if (open) setRetained(true)
        if (!surface || typeof surface.animate !== 'function' || prefersReducedMotion()) {
          interruptedOpacity.current = null
          if (!open) setRetained(false)
          return undefined
        }
        const opacity = interruptedOpacity.current ?? (open ? 0 : Number(window.getComputedStyle(surface).opacity))
        interruptedOpacity.current = null
        const animation = surface.animate([{ opacity }, { opacity: open ? 1 : 0 }], {
          duration: open ? VIEW_ENTER_MS : VIEW_EXIT_MS, easing: open ? 'ease-out' : 'ease-in', fill: 'forwards',
        })
        animation.onfinish = () => {
          if (open) animation.cancel()
          else setRetained(false)
        }
        return () => {
          interruptedOpacity.current = animation.playState === 'running' ? Number(window.getComputedStyle(surface).opacity) : null
          animation.onfinish = null
          animation.cancel()
        }
      }, [open])
      return open || (retained && !prefersReducedMotion())
    }

    /** 悬浮位置是本机布局偏好，以可移动区域的比例保存，不保存计时业务状态。 */
    function normalizeFloatingPosition(value) {
      const unit = (number, fallback) => typeof number === 'number' && Number.isFinite(number)
        ? Math.min(1, Math.max(0, number)) : fallback
      return { x: unit(value?.x, .97), y: unit(value?.y, .23) }
    }

    function floatingRect(position, size, viewport) {
      const point = normalizeFloatingPosition(position)
      const width = Math.min(Math.max(1, size.width), Math.max(1, viewport.width - FLOATING_GAP * 2))
      const height = Math.min(Math.max(1, size.height), Math.max(1, viewport.height - FLOATING_GAP * 2))
      const gapX = Math.min(FLOATING_GAP, Math.max(0, (viewport.width - width) / 2))
      const gapY = Math.min(FLOATING_GAP, Math.max(0, (viewport.height - height) / 2))
      return {
        left: gapX + point.x * Math.max(0, viewport.width - width - gapX * 2),
        top: gapY + point.y * Math.max(0, viewport.height - height - gapY * 2), width, height,
      }
    }

    function moveFloatingPosition(position, size, viewport, dx, dy) {
      const rect = floatingRect(position, size, viewport)
      const spanX = Math.max(0, viewport.width - rect.width - FLOATING_GAP * 2)
      const spanY = Math.max(0, viewport.height - rect.height - FLOATING_GAP * 2)
      return normalizeFloatingPosition({ x: spanX ? (rect.left - FLOATING_GAP + dx) / spanX : 0,
        y: spanY ? (rect.top - FLOATING_GAP + dy) / spanY : 0 })
    }

    function floatingEdge(rect, viewport) {
      const edges = [
        ['left', rect.left], ['right', viewport.width - rect.left - rect.width],
        ['top', rect.top], ['bottom', viewport.height - rect.top - rect.height],
      ].sort((a, b) => a[1] - b[1])
      return edges[0][1] <= FLOATING_EDGE_DISTANCE ? edges[0][0] : null
    }

    function floatingDockStyle(edge, rect, viewport) {
      const vertical = edge === 'left' || edge === 'right'
      const width = vertical ? 28 : 64
      const height = vertical ? 64 : 28
      return {
        left: edge === 'left' ? 0 : edge === 'right' ? Math.max(0, viewport.width - width)
          : Math.max(0, Math.min(viewport.width - width, rect.left + rect.width / 2 - width / 2)),
        top: edge === 'top' ? 0 : edge === 'bottom' ? Math.max(0, viewport.height - height)
          : Math.max(0, Math.min(viewport.height - height, rect.top + rect.height / 2 - height / 2)),
        width, height,
      }
    }

    function readFloatingPosition() {
      try {
        const stored = JSON.parse(window.localStorage.getItem(FLOATING_POSITION_KEY))
        return Number.isFinite(stored?.x) && Number.isFinite(stored?.y) ? normalizeFloatingPosition(stored) : null
      } catch { return null }
    }

    function saveFloatingPosition(position) {
      try { window.localStorage.setItem(FLOATING_POSITION_KEY, JSON.stringify(position === null ? null : normalizeFloatingPosition(position))) }
      catch { /* 禁用本地存储时仍可在当前页面拖动。 */ }
    }

    /** 使用宿主 slot 标记定位标题栏，不依赖构建后变化的 CSS 类名。 */
    function floatingConversationAnchor() {
      const boxes = (name) => Array.from(document.querySelectorAll?.(`[data-slot="${name}"]`) ?? [])
        .map((slot) => (slot.firstElementChild ?? slot).getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
      const header = boxes('conversation.header')[0]
      const main = boxes('main.conversation')[0]
      return {
        left: (main?.left ?? header?.left ?? 0) + FLOATING_GAP,
        right: (main?.right ?? header?.right ?? window.innerWidth ?? 0) - FLOATING_GAP,
        top: (header?.bottom ?? main?.top ?? 40) + FLOATING_GAP,
      }
    }

    function FloatingTimerMenu({ point, onClose, onExit, busy, error, t }) {
      const menuRef = React.useRef(null)
      const visible = useSurfaceFade(Boolean(point), menuRef)
      React.useLayoutEffect(() => {
        const menu = menuRef.current
        if (!point || !menu) return undefined
        const position = clampTipPosition({ left: point.x, right: point.x, top: point.y, bottom: point.y },
          { width: menu.offsetWidth, height: menu.offsetHeight }, { width: window.innerWidth, height: window.innerHeight })
        menu.style.left = `${position.left}px`
        menu.style.top = `${position.top}px`
        menu.querySelector('button')?.focus()
        const outside = (event) => { if (!menu.contains(event.target)) onClose(false) }
        const key = (event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true) }
          else if (event.key === 'Tab') onClose(false)
        }
        const resize = () => onClose(false)
        document.addEventListener('pointerdown', outside, true)
        document.addEventListener('keydown', key, true)
        window.addEventListener('resize', resize)
        return () => {
          document.removeEventListener('pointerdown', outside, true)
          document.removeEventListener('keydown', key, true)
          window.removeEventListener('resize', resize)
        }
      }, [point, error])
      return h('div', { ref: menuRef, className: 'cs-floating-menu', role: 'menu', 'aria-label': t('floatingMenu'),
        hidden: !visible, inert: !point ? '' : undefined, 'aria-hidden': !point },
        h('button', { type: 'button', role: 'menuitem', disabled: busy, onClick: onExit },
          h(DetailGlyph, { name: 'close', size: 15 }), t('floatingExit')),
        h('p', { className: error ? 'is-error' : undefined, role: error ? 'status' : undefined }, t(error ? 'floatingExitError' : 'floatingExitHint')))
    }

    function FloatingTimer({ client, snapshot, showClock = false, onExit, exitBusy = false, exitError = false, t }) {
      const [position, setPosition] = React.useState(readFloatingPosition)
      const [viewport, setViewport] = React.useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
      const [size, setSize] = React.useState({ width: 40, height: 40 })
      const [anchor, setAnchor] = React.useState(floatingConversationAnchor)
      const [menuPoint, setMenuPoint] = React.useState(null)
      // 默认贴在会话区右上角：与左侧锚点同一上边距、同一右边距；手动拖动后沿用保存的位置。
      const effectivePosition = position ?? moveFloatingPosition(
        { x: 0, y: 0 }, size, viewport,
        anchor.right - size.width - FLOATING_GAP, anchor.top - FLOATING_GAP,
      )
      const [expanded, setExpanded] = React.useState(false)
      const [docked, setDocked] = React.useState(null)
      const [hovered, setHovered] = React.useState(false)
      const [focused, setFocused] = React.useState(false)
      const [dragging, setDragging] = React.useState(false)
      const rootRef = React.useRef(null)
      const contentRef = React.useRef(null)
      const entryRef = React.useRef(null)
      const moveRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const dragRef = React.useRef(null)
      const pointRef = React.useRef(effectivePosition)
      pointRef.current = effectivePosition
      const ignoreClickRef = React.useRef(false)
      const focusAfterWakeRef = React.useRef(false)
      const panelVisible = useSurfaceFade(expanded && !docked, panelRef)
      const visibleDock = panelVisible ? null : docked
      const timer = snapshot.timer
      const at = useClockTick(expanded && !docked || timer?.status === 'running')
      const rect = floatingRect(effectivePosition, size, viewport)
      const projection = timer ? projectTimer(timer, snapshot.receivedAt, at) : null
      const digits = timer && timer.status !== 'idle'
        ? timerDigits(projection.remainingMs ?? projection.elapsedMs, timer.mode === 'countdown') : ''
      const error = snapshot.syncError ? 'timerSyncError' : snapshot.actionError || (snapshot.noticeError ? 'timerNoticeError' : '')

      function place(next) {
        pointRef.current = next
        setPosition(next)
      }

      function wake(keyboard = false) {
        focusAfterWakeRef.current = keyboard
        setDocked(null)
        setExpanded(true)
      }

      function minimize() {
        setExpanded(false)
        setDocked(null)
        if (rootRef.current?.contains(document.activeElement) && document.activeElement?.matches(':focus-visible')) focusAfterWakeRef.current = true
        setFocused(false)
      }

      React.useEffect(() => {
        const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
        window.addEventListener('resize', resize)
        return () => window.removeEventListener('resize', resize)
      }, [])

      React.useLayoutEffect(() => {
        if (position !== null) return undefined
        const measure = () => {
          const next = floatingConversationAnchor()
          setAnchor((previous) => previous.left === next.left && previous.right === next.right && previous.top === next.top ? previous : next)
        }
        measure()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
        for (const slot of document.querySelectorAll?.('[data-slot="main.conversation"], [data-slot="conversation.header"]') ?? []) {
          observer?.observe(slot.firstElementChild ?? slot)
        }
        window.addEventListener('resize', measure)
        return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
      }, [position === null])

      React.useEffect(() => {
        const content = contentRef.current
        if (!content || visibleDock) return undefined
        const measure = () => {
          const bounds = content.getBoundingClientRect()
          if (bounds.width && bounds.height) setSize((previous) => previous.width === bounds.width && previous.height === bounds.height
            ? previous : { width: bounds.width, height: bounds.height })
        }
        measure()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
        observer?.observe(content)
        return () => observer?.disconnect()
      }, [expanded, visibleDock, showClock, panelVisible])

      React.useEffect(() => {
        if (!focusAfterWakeRef.current || docked || !expanded && panelVisible) return
        focusAfterWakeRef.current = false
        if (expanded) moveRef.current?.focus()
        else entryRef.current?.focus()
      }, [docked, expanded, panelVisible])

      React.useEffect(() => {
        // 用户仍在悬浮窗里阅读、拖动、用键盘或编辑倒计时，均不自动收起。
        if (docked || hovered || focused || dragging || menuPoint) return undefined
        const edge = floatingEdge(rect, viewport)
        if (!edge) return undefined
        const timeout = setTimeout(() => setDocked(edge), FLOATING_DOCK_DELAY)
        return () => clearTimeout(timeout)
      }, [docked, hovered, focused, dragging, menuPoint, position, anchor, size, viewport])

      function startDrag(event) {
        if (event.button !== 0 || event.isPrimary === false) return
        event.preventDefault()
        if (rootRef.current?.contains(document.activeElement)) document.activeElement.blur?.()
        setFocused(false)
        event.currentTarget.setPointerCapture(event.pointerId)
        ignoreClickRef.current = false
        setMenuPoint(null)
        dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, position: pointRef.current, savedPosition: position, size, viewport, moved: false }
        setDragging(true)
      }

      function moveDrag(event) {
        const drag = dragRef.current
        if (!drag || drag.id !== event.pointerId) return
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (!drag.moved && Math.hypot(dx, dy) < 4) return
        drag.moved = true
        place(moveFloatingPosition(drag.position, drag.size, drag.viewport, dx, dy))
      }

      function endDrag(event, cancelled = false) {
        const drag = dragRef.current
        if (!drag || drag.id !== event.pointerId) return
        dragRef.current = null
        ignoreClickRef.current = drag.moved
        if (cancelled) place(drag.savedPosition)
        else if (drag.moved) saveFloatingPosition(pointRef.current)
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        setDragging(false)
      }

      function moveByKey(event) {
        const delta = event.shiftKey ? 40 : 8
        const steps = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }
        if (!steps[event.key] && event.key !== 'Home') return
        event.preventDefault()
        const next = event.key === 'Home' ? null
          : moveFloatingPosition(pointRef.current, size, viewport, ...steps[event.key])
        place(next)
        saveFloatingPosition(next)
      }

      const dragProps = {
        onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: (event) => endDrag(event),
        onPointerCancel: (event) => endDrag(event, true), onLostPointerCapture: (event) => endDrag(event), onKeyDown: moveByKey,
      }
      const closeMenu = (restoreFocus) => {
        setMenuPoint(null)
        if (restoreFocus) (expanded ? moveRef : entryRef).current?.focus()
      }
      const openMenu = (event) => {
        if (!onExit) return
        event.preventDefault()
        event.stopPropagation()
        const bounds = event.currentTarget.getBoundingClientRect()
        setMenuPoint({ x: event.clientX || bounds.left + 20, y: event.clientY || bounds.top + 20 })
      }
      return h('div', {
        ref: rootRef, className: `cs-timer-popover cs-floating-window${expanded ? ' is-expanded' : ''}${dragging ? ' is-dragging' : ''}${visibleDock ? ` is-docked dock-${visibleDock}` : ''}`,
        style: visibleDock ? floatingDockStyle(visibleDock, rect, viewport) : { left: rect.left, top: rect.top },
        'data-dock': visibleDock ?? 'none',
        onContextMenu: openMenu,
        onPointerEnter: (event) => { if (event.pointerType !== 'touch') { setHovered(true); if (docked) wake() } },
        onPointerLeave: () => setHovered(false),
        onPointerDownCapture: (event) => setFocused(['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)),
        onFocus: (event) => setFocused(event.target.matches?.(':focus-visible') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)),
        onBlur: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) },
        onKeyDown: (event) => {
          setFocused(true)
          if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { openMenu(event); return }
          if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); minimize() }
        },
      },
        h(FloatingTimerMenu, { point: menuPoint, onClose: closeMenu, onExit, busy: exitBusy, error: exitError, t }),
        visibleDock ? h('button', { type: 'button', className: 'cs-floating-dock', 'aria-label': t('floatingWake'),
          onFocus: () => wake(true), onClick: () => wake(true) }, h('span', { 'aria-hidden': true })) : null,
        h('div', { ref: contentRef, className: 'cs-floating-content', hidden: !!visibleDock },
          !expanded && !panelVisible ? h('button', { ...dragProps, ref: entryRef, type: 'button',
            className: `cs-floating-entry${timer?.status === 'running' ? ' is-running' : ''}${error ? ' has-error' : ''}`,
            'aria-label': `${t('floatingOpen')}${error ? ` · ${t(error)}` : ''}`, 'aria-expanded': false,
            title: t('floatingMove'), onClick: (event) => {
              if (ignoreClickRef.current) { ignoreClickRef.current = false; return }
              focusAfterWakeRef.current = event.detail === 0
              setExpanded(true)
            },
          }, h(DetailGlyph, { name: 'clock', size: 22 }), digits ? h('span', { className: 'cs-timer-compact-digits' }, digits) : null)
          : h('section', { ref: panelRef, className: 'cs-floating-panel', 'aria-label': t('floatingTitle'),
            inert: !expanded || docked ? '' : undefined, 'aria-hidden': !expanded || !!docked },
            h('div', { className: 'cs-floating-bar' },
              h('button', { ...dragProps, ref: moveRef, type: 'button', className: 'cs-floating-grip', title: t('floatingMove'), 'aria-label': t('floatingMove') },
                h('svg', { width: 22, height: 12, viewBox: '0 0 22 12', 'aria-hidden': true },
                  [5, 11, 17].flatMap((x) => [3, 9].map((y) => h('circle', { key: `${x}-${y}`, cx: x, cy: y, r: 1, fill: 'currentColor' }))))),
              h('button', { type: 'button', className: 'cs-floating-minimize', 'aria-label': t('floatingMinimize'), onClick: minimize },
                h(DetailGlyph, { name: 'close', size: 15 }))),
            showClock ? h(ClockDial, { at, t }) : null,
            h(TimerControls, { client, snapshot, at, t })) ))
    }

    function TimerPopover({ client, snapshot, t, hoverTip = null }) {
      const [pinned, setPinned] = React.useState(false)
      const [position, setPosition] = React.useState(null)
      const rootRef = React.useRef(null)
      const anchorRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const panelId = 'cs-dashboard-timer'
      const expanded = pinned
      const panelVisible = useSurfaceFade(expanded, panelRef)
      const timer = snapshot.timer
      const at = useClockTick(timer?.status === 'running')

      function close(restoreFocus = false) {
        setPinned(false)
        if (restoreFocus) anchorRef.current?.focus()
      }

      React.useEffect(() => {
        if (!expanded || typeof document === 'undefined') return undefined
        const keyDown = (event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return
          const restore = rootRef.current?.contains(document.activeElement)
          if (restore) event.preventDefault()
          close(restore)
        }
        const pointerDown = (event) => { if (!rootRef.current?.contains(event.target)) close() }
        document.addEventListener('keydown', keyDown)
        document.addEventListener('pointerdown', pointerDown, true)
        return () => {
          document.removeEventListener('keydown', keyDown)
          document.removeEventListener('pointerdown', pointerDown, true)
        }
      }, [expanded])

      React.useEffect(() => {
        if (!expanded || !anchorRef.current || !panelRef.current) return undefined
        const place = () => {
          const anchor = anchorRef.current.getBoundingClientRect()
          if (anchor.bottom < 0 || anchor.top >= window.innerHeight) {
            close()
            return
          }
          const panel = panelRef.current
          setPosition(clampTipPosition(anchor, { width: panel.offsetWidth, height: panel.offsetHeight }, {
            width: window.innerWidth, height: window.innerHeight,
          }))
        }
        place()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null
        observer?.observe(panelRef.current)
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          observer?.disconnect()
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [expanded])

      const visibleDigits = timer && timer.status !== 'idle'
      const projection = visibleDigits ? projectTimer(timer, snapshot.receivedAt, at) : null
      const digits = visibleDigits ? timerDigits(projection.remainingMs ?? projection.elapsedMs, timer.mode === 'countdown') : null
      const label = t('timerTitle')
      const error = snapshot.syncError ? 'timerSyncError' : snapshot.actionError || (snapshot.noticeError ? 'timerNoticeError' : '')
      const triggerLabel = [label, digits, error ? t(error) : ''].filter(Boolean).join(' · ')

      return h('div', {
        className: 'cs-timer-popover cs-timer-topbar',
        ref: rootRef,
      },
        h('button', {
          className: `cs-timer-trigger${pinned ? ' is-pinned' : ''}${timer?.status === 'running' ? ' is-running' : ''}${error ? ' has-error' : ''}`,
          type: 'button', ref: anchorRef, 'aria-label': triggerLabel, 'aria-expanded': expanded,
          'aria-controls': expanded ? panelId : undefined,
          ...hoverTipProps(hoverTip, triggerLabel, [], { prefer: 'bottom' }),
          onClick: () => {
            if (pinned) close()
            else setPinned(true)
          },
        }, h(DetailGlyph, { name: 'clock', size: 16 })),
        h('div', {
          className: 'cs-timer-flyout', hidden: !panelVisible, inert: !expanded ? '' : undefined, 'aria-hidden': !expanded,
          style: position ? { left: position.left, top: position.top } : { visibility: 'hidden' },
        }, h('section', { className: 'cs-timer-panel', id: panelId, ref: panelRef, 'aria-label': label },
          h(TimerControls, { client, snapshot, at, t }))))
    }

    function DashboardTimer({ client, t, hoverTip = null }) {
      const snapshot = useTimerClient(client)
      return h(TimerPopover, { client, snapshot, t, hoverTip })
    }

    function TimerOverlay({ ctx, client, conversation }) {
      useLanguageRevision()
      const theme = useStoredTheme()
      const snapshot = useTimerClient(client)
      const [display, setDisplay] = React.useState(null)
      const [exitBusy, setExitBusy] = React.useState(false)
      const [exitError, setExitError] = React.useState(false)
      const settingsRuntime = React.useRef({ active: false, revision: 0, writing: false }).current
      React.useEffect(() => {
        settingsRuntime.active = true
        const load = () => {
          if (settingsRuntime.writing) return
          const ticket = ++settingsRuntime.revision
          callSettings(ctx, 'getSettings', {}).then((settings) => {
            if (settingsRuntime.active && ticket === settingsRuntime.revision) setDisplay({ enabled: settings?.floatingEnabled !== false, showClock: settings?.floatingShowClock === true })
          }).catch(() => { /* 保留最后一次读取到的显示偏好，计时状态仍由独立通道报告错误。 */ })
        }
        load()
        const unsubscribe = subscribeSettingsChanged(load)
        const visible = () => { if (document.visibilityState !== 'hidden') load() }
        window.addEventListener('focus', load)
        document.addEventListener('visibilitychange', visible)
        return () => {
          settingsRuntime.active = false
          settingsRuntime.revision += 1
          unsubscribe()
          window.removeEventListener('focus', load)
          document.removeEventListener('visibilitychange', visible)
        }
      }, [ctx, conversation])
      const exitFloating = async () => {
        if (!settingsRuntime.active || settingsRuntime.writing) return
        const ticket = ++settingsRuntime.revision
        settingsRuntime.writing = true
        setExitBusy(true)
        setExitError(false)
        try {
          const settings = await callSettings(ctx, 'setSettings', { floatingEnabled: false })
          if (settings.floatingEnabled !== false) throw new Error('悬浮窗设置未生效')
          if (settingsRuntime.active && ticket === settingsRuntime.revision) setDisplay({ enabled: false, showClock: settings.floatingShowClock === true })
        } catch {
          if (settingsRuntime.active && ticket === settingsRuntime.revision) setExitError(true)
          return
        } finally {
          settingsRuntime.writing = false
          if (settingsRuntime.active) setExitBusy(false)
        }
        // 保存期间可能切换了会话；解除写入保护后再通知，新的订阅才能读回状态。
        notifySettingsChanged()
      }
      const { notice } = snapshot
      const t = translate
      if (!conversation && !notice) return null
      return h('div', { className: `cs-timer-overlay ${sidebarThemeClass(theme.palette, theme.appearance, theme.systemDark)}` },
        h('style', null, CS_TIMER_CSS),
        conversation && display?.enabled ? h(FloatingTimer, { client, snapshot, showClock: display.showClock,
          onExit: exitFloating, exitBusy, exitError, t }) : null,
        notice ? h('div', { className: 'cs-timer-notice' },
          h(DetailGlyph, { name: 'clock', size: 18 }),
          h('div', { className: 'cs-timer-notice-message' },
            h('strong', { role: 'status' }, t('timerExpired')),
            notice.blocked ? h('span', { role: 'status' }, t(notice.failed ? 'timerSoundFailed' : 'timerSoundBlocked')) : null,
            notice.blocked ? h('button', { className: 'cs-timer-button', type: 'button', onClick: client.playNotice }, t('timerPlaySound')) : null),
          h('button', { className: 'cs-timer-notice-close', type: 'button', 'aria-label': t('timerClose'), onClick: client.dismissNotice },
            h(DetailGlyph, { name: 'close', size: 16 }))) : null)
    }

    /** 心跳与计时提醒随整个宿主界面存在。 */
    function createPresenceReporter(ctx, timerClient) {
      return function DshTimespanPresenceReporter(props) {
        const conversation = usePresenceReporter(props, ctx)
        return h(TimerOverlay, { ctx, client: timerClient, conversation })
      }
    }

    /** 数字兜底：旧版本 RPC 缺字段时页面不崩溃。 */
    function finite(value) {
      return Number.isFinite(value) ? value : 0
    }

    function normalizeCycles(value) {
      const cycles = {}
      for (const period of ['day', 'week', 'month']) {
        const row = value?.[period]
        cycles[period] = {
          from: finite(row?.from),
          to: finite(row?.to),
          activeMs: finite(row?.activeMs),
          taskMs: finite(row?.taskMs),
          taskCount: finite(row?.taskCount),
          onlineMs: finite(row?.onlineMs),
        }
      }
      return cycles
    }

    function normalizeWorkspaceSessions(value) {
      if (!Array.isArray(value)) return []
      return value
        .filter((row) => row !== null && typeof row === 'object')
        .map((row, index) => ({
          // 只有活跃、没有任务的区间没有会话 id。给它一个稳定的行内标识，
          // 否则这行会被丢掉，而工作区活跃时长仍计入它，明细与汇总对不上。
          sessionId: typeof row.sessionId === 'string' && row.sessionId
            ? row.sessionId
            : `__unassigned_active_${index}`,
          hasSessionId: typeof row.sessionId === 'string' && row.sessionId !== '',
          sessionTitle: typeof row.sessionTitle === 'string' ? row.sessionTitle : null,
          activeMs: finite(row.activeMs),
          taskMs: finite(row.taskMs),
          taskCount: finite(row.taskCount),
          taskRunning: row.taskRunning === true,
          approximate: row.approximate === true,
          hasBreakdown: row.hasBreakdown !== false,
          modelMs: finite(row.modelMs),
          toolMs: finite(row.toolMs),
          waitMs: finite(row.waitMs),
          otherMs: finite(row.otherMs),
          lastActivityAt: finite(row.lastActivityAt),
        }))
    }

    function normalizeWorkspaces(value) {
      if (!Array.isArray(value)) return []
      return value
        .filter((row) => row !== null && typeof row === 'object')
        .map((row, index) => ({
          key: typeof row.workspaceId === 'string' && row.workspaceId ? row.workspaceId : `__unassigned_${index}`,
          workspaceTitle: typeof row.workspaceTitle === 'string' && row.workspaceTitle ? row.workspaceTitle : null,
          activeMs: finite(row.activeMs),
          taskMs: finite(row.taskMs),
          taskCount: finite(row.taskCount),
          taskRunning: row.taskRunning === true,
          approximate: row.approximate === true,
          share: finite(row.share),
          lastActivityAt: finite(row.lastActivityAt),
          sessions: normalizeWorkspaceSessions(row.sessions),
        }))
    }

    /** 只有真实会话 id 才能打开宿主会话页；`__unassigned_active_*` 是明细行占位 id。 */
    function isRealSessionId(sessionId) {
      return typeof sessionId === 'string' && sessionId !== '' && !sessionId.startsWith('__unassigned_active_')
    }

    function sessionIsOpenable(session) {
      return session?.hasSessionId !== false && isRealSessionId(session?.sessionId)
    }

    /**
     * 尝试打开宿主会话页；服务缺失、会话归档/未知或宿主动作抛错时返回 false，
     * 由调用方回落到插件内的「切明细并高亮」。
     */
    function openSessionInHost(ctx, session) {
      if (!sessionIsOpenable(session)) return false
      const uiWorkspace = typeof ctx?.get === 'function' ? ctx.get('uiWorkspace') : undefined
      if (!uiWorkspace || typeof uiWorkspace.openSession !== 'function') return false
      try {
        uiWorkspace.openSession(session.sessionId)
        return true
      } catch {
        return false
      }
    }

    function normalizeTrend(value) {
      if (!Array.isArray(value)) return []
      return value
        .filter((row) => row !== null && typeof row === 'object' && Number.isFinite(row.from) && Number.isFinite(row.to))
        .map((row, index) => ({
          key: typeof row.key === 'string' ? row.key : `bucket_${index}`,
          from: row.from,
          to: row.to,
          future: row.future === true,
          activeMs: finite(row.activeMs),
          taskMs: finite(row.taskMs),
        }))
    }

    const BACKFILL_STATUSES = new Set(['idle', 'running', 'done', 'failed'])
    const BACKFILL_EVENT_KINDS = new Set(['initial', 'version', 'retry', 'clear'])

    function normalizeBackfill(value) {
      const status = BACKFILL_STATUSES.has(value?.status) ? value.status : 'unavailable'
      return {
        status,
        version: finite(value?.version),
        scanned: finite(value?.scanned),
        total: finite(value?.total),
        tasksWritten: finite(value?.tasksWritten),
        error: typeof value?.error === 'string' && value.error ? value.error : null,
        updatedAt: finite(value?.updatedAt),
        // 回填完成事件是「已读」判定的锚：旧响应缺字段时保持空串，页面不崩。
        eventId: typeof value?.eventId === 'string' ? value.eventId : '',
        eventKind: BACKFILL_EVENT_KINDS.has(value?.eventKind) ? value.eventKind : '',
        eventAt: finite(value?.eventAt),
        eventSeq: finite(value?.eventSeq),
        readEventId: typeof value?.readEventId === 'string' ? value.readEventId : '',
        readAt: finite(value?.readAt),
        clearedAt: finite(value?.clearedAt),
        notices: normalizeBackfillNotices(value?.notices),
      }
    }

    /** 通知记录：已读后仍可回看的完成事件；脏记录直接丢弃。 */
    function normalizeBackfillNotices(value) {
      if (!Array.isArray(value)) return []
      return value
        .filter((row) => row !== null && typeof row === 'object' && typeof row.eventId === 'string' && row.eventId.length > 0)
        .map((row) => ({
          eventId: row.eventId,
          kind: BACKFILL_EVENT_KINDS.has(row.kind) ? row.kind : '',
          version: finite(row.version),
          total: finite(row.total),
          tasksWritten: finite(row.tasksWritten),
          completedAt: finite(row.completedAt),
          readAt: finite(row.readAt),
        }))
    }

    /** 横幅只在「完成事件尚未被已读」时出现；旧响应没有事件 id 时没有可读锚点。 */
    function isBackfillUnread(backfill) {
      return backfill?.status === 'done' &&
        typeof backfill.eventId === 'string' && backfill.eventId.length > 0 &&
        backfill.eventId !== backfill.readEventId
    }

    /**
     * 顶栏通知：页面里会打断内容的可关闭提示统一收进顶栏右侧，
     * 胶囊只留一句短标签，完整解释交给统一 HoverTip；顺序按是否需要处理排列。
     */
    function buildTopbarNotices(props) {
      const {
        t, backfill, hasApproximate, paletteSaveError = false, stateError = false, analysisNotices = [],
        onDismissApproximate, onDismissBackfill, onRetryBackfill,
        dismissingBackfill = false, retryingBackfill = false, dismissError = null, retryError = null,
      } = props
      const notices = []
      if (paletteSaveError) {
        notices.push({
          key: 'palette', tone: 'error', icon: 'alert',
          label: t('paletteSaveError'), detail: t('paletteSaveError'),
        })
      }
      if (stateError) {
        notices.push({
          key: 'state', tone: 'error', icon: 'alert',
          label: t('errorTitle'), detail: t('retryHint'),
        })
      }
      if (backfill?.status === 'running') {
        const total = Math.max(0, Math.round(finite(backfill.total)))
        const scanned = Math.max(0, Math.round(finite(backfill.scanned)))
        notices.push({
          key: 'backfill', tone: 'info', spinner: true,
          label: t('backfillChipRunning'),
          detail: t('backfillProgress')
            .replace('{done}', String(scanned))
            .replace('{total}', String(total))
            .replace('{tasks}', String(finite(backfill.tasksWritten))),
          progress: total > 0 ? Math.max(0, Math.min(100, Math.round((scanned / total) * 100))) : 0,
        })
      } else if (backfill?.status === 'failed') {
        notices.push({
          key: 'backfill', tone: 'error', icon: 'alert',
          label: t('backfillChipFailed'),
          detail: retryError || backfill.error || t('backfillFailed'),
          actionLabel: retryingBackfill ? t('backfillRetrying') : t('backfillRetry'),
          onAction: onRetryBackfill, actionDisabled: retryingBackfill,
        })
      } else if (isBackfillUnread(backfill)) {
        notices.push({
          key: 'backfill', tone: dismissError ? 'error' : 'success', icon: dismissError ? 'alert' : 'check',
          label: t('backfillChipDone'),
          detail: dismissError || t('backfillDoneHint').replace('{tasks}', String(backfill.tasksWritten)),
          dismissLabel: t('backfillDismiss'), onDismiss: onDismissBackfill,
          dismissDisabled: dismissingBackfill,
        })
      } else if (backfill?.status === 'unavailable') {
        notices.push({
          key: 'backfill', tone: 'error', icon: 'alert',
          label: t('backfillChipUnavailable'), detail: t('backfillUnavailable'),
        })
      }
      for (const notice of Array.isArray(analysisNotices) ? analysisNotices : []) {
        notices.push({
          key: `analysis-${notice.key}`, tone: 'info', icon: 'report',
          label: notice.label, detail: notice.message,
          dismissLabel: t('analysisNoticeDismiss'), onDismiss: notice.onDismiss,
        })
      }
      if (hasApproximate) {
        notices.push({
          key: 'approximate', tone: 'info', icon: 'info',
          label: t('approximateChipLabel'), detail: t('approximateNotice'),
          dismissLabel: t('approximateDismiss'), onDismiss: onDismissApproximate,
        })
      }
      return notices
    }

    function renderTopbarNoticeChip(notice, hoverTip, t) {
      const detail = notice.detail || notice.label
      return h('div', {
        key: notice.key,
        className: `cs-notice-chip is-${notice.tone || 'info'}`,
        role: 'status',
        'aria-label': detail === notice.label ? notice.label : `${notice.label}：${detail}`,
        ...hoverTipProps(hoverTip, detail, [], { prefer: 'bottom' }),
      },
      notice.spinner
        ? h('span', { className: 'cs-spinner is-notice', 'aria-hidden': true })
        : h(DetailGlyph, { name: notice.icon || 'info', size: 13 }),
      h('span', { className: 'cs-notice-chip-label' }, notice.label),
      notice.actionLabel
        ? h('button', {
            type: 'button', className: 'cs-notice-chip-action',
            disabled: notice.actionDisabled === true,
            onClick: () => { hoverTip?.hide?.(); notice.onAction?.() },
          }, notice.actionLabel)
        : null,
      notice.onDismiss
        ? h('button', {
            type: 'button', className: 'cs-notice-chip-close',
            'aria-label': notice.dismissLabel || t('noticeDismiss'),
            disabled: notice.dismissDisabled === true,
            onClick: () => { hoverTip?.hide?.(); notice.onDismiss?.() },
          }, '×')
        : null,
      notice.progress === undefined
        ? null
        : h('span', { className: 'cs-notice-chip-progress', 'aria-hidden': true },
            h('i', { style: { width: `${notice.progress}%` } })))
    }

    function renderTopbarNotices(notices, hoverTip, t) {
      if (!Array.isArray(notices) || notices.length === 0) return null
      return h('div', { className: 'cs-topbar-notices', role: 'group', 'aria-label': t('topbarNoticesLabel') },
        notices.map((notice) => renderTopbarNoticeChip(notice, hoverTip, t)))
    }

    function normalizeSubagentTasks(value) {
      if (!Array.isArray(value)) return []
      return value.map((row) => ({
        sessionId: typeof row?.sessionId === 'string' ? row.sessionId : '',
        sessionTitle: typeof row?.sessionTitle === 'string' ? row.sessionTitle : null,
        parentSessionId: typeof row?.parentSessionId === 'string' ? row.parentSessionId : '',
        durationMs: finite(row?.durationMs),
        start: finite(row?.start),
      })).filter((row) => row.parentSessionId.length > 0)
    }

    /** 子代理任务按父会话分组，供会话行的子代理图标读取。 */
    function groupSubagentTasks(rows) {
      const grouped = {}
      for (const row of Array.isArray(rows) ? rows : []) {
        if (grouped[row.parentSessionId] === undefined) grouped[row.parentSessionId] = []
        grouped[row.parentSessionId].push(row)
      }
      return grouped
    }

    function normalizeDashboard(value) {
      return {
        period: value?.period === 'week' || value?.period === 'month' ? value.period : 'day',
        range: value?.range && Number.isFinite(value.range.from) && Number.isFinite(value.range.to)
          ? { from: value.range.from, to: value.range.to }
          : null,
        onlineMs: finite(value?.onlineMs),
        activeMs: finite(value?.activeMs),
        activeSumMs: finite(value?.activeSumMs),
        taskMs: finite(value?.taskMs),
        taskSumMs: finite(value?.taskSumMs),
        taskCount: finite(value?.taskCount),
        taskRunning: value?.taskRunning === true,
        activeRunning: value?.activeRunning === true,
        running: value?.running === true,
        approximate: value?.approximate === true,
        cycles: normalizeCycles(value?.cycles),
        workspaces: normalizeWorkspaces(value?.workspaces),
        // 子代理任务只在父会话明细里出现，绝不参与上面的总计与会话列表。
        subagentTasks: normalizeSubagentTasks(value?.subagentTasks),
        trend: normalizeTrend(value?.trend),
        backfill: normalizeBackfill(value?.backfill),
        // Host 设置里的当前数字格式；页面据此渲染，不在 Client 另存副本。
        durationFormat: normalizeDurationFormat(value?.durationFormat),
      }
    }

    /** 近似记录既可能是整份统计（在线/活跃），也可能只在某个工作区明细里。 */
    function approximateNoticeVisible(data) {
      return data?.approximate === true ||
        (Array.isArray(data?.workspaces) && data.workspaces.some((row) => row.approximate === true))
    }

    const DASHBOARD_LOADING = { status: 'loading', data: null, receivedAt: 0, rangeKey: null }

    /**
     * 页面按周期重新取数。切换时保留周期卡，明细在新周期返回前显示加载状态，
     * 避免误把旧数据当成新周期。刷新间隔或 refreshNonce 变化只重建定时器并立即取一次，
     * 不会把已渲染的仪表盘闪回 loading。回填进行时缩短间隔，完成后由
     * refreshNonce 立刻补一次，数字因此无需刷新页面就能出现。
     */
    function useDashboard(ctx, period, refreshMs, refreshNonce, options = {}) {
      const enabled = options.enabled !== false
      const view = options.view === 'details' ? 'details' : 'dashboard'
      const rangeFrom = Number(options.range?.from)
      const from = Number.isFinite(rangeFrom) ? rangeFrom : null
      const rangeTo = Number(options.range?.to)
      const to = Number.isFinite(rangeTo) ? rangeTo : null
      const rangeKey = view === 'details' ? `${from}:${to}` : null
      const [state, setState] = React.useState(DASHBOARD_LOADING)
      const loadRef = React.useRef(null)
      React.useEffect(() => {
        if (rangeKey !== null) setState(DASHBOARD_LOADING)
        if (!enabled) return undefined
        let active = true
        if (rangeKey === null) setState((previous) => ({ ...previous, status: 'loading' }))
        const load = async () => {
          try {
            const payload = { period, view }
            // 明细预设范围只传起点，终点由 Host 取当前时刻；「全部」的起点是 0。
            if (from !== null) payload.from = from
            if (to !== null) payload.to = to
            const value = await callHost(ctx, 'queryStats', payload)
            if (!active) return
            // 语言随统计一起带回：仪表盘首屏不必等设置读接口。
            applyLanguage(value?.language)
            setState({ status: 'ready', data: normalizeDashboard(value), receivedAt: Date.now(), rangeKey })
          } catch {
            if (!active) return
            setState((previous) => ({ ...(rangeKey === null ? previous : DASHBOARD_LOADING), status: 'error', rangeKey }))
          }
        }
        loadRef.current = load
        return () => {
          active = false
          loadRef.current = null
        }
      }, [ctx, period, view, from, to, rangeKey, enabled])
      React.useEffect(() => {
        if (!enabled || typeof loadRef.current !== 'function') return undefined
        loadRef.current()
        const timer = setInterval(() => {
          if (typeof loadRef.current === 'function') loadRef.current()
        }, refreshMs)
        return () => clearInterval(timer)
      }, [ctx, period, view, from, to, refreshMs, refreshNonce, enabled])
      return state.rangeKey === rangeKey ? state : DASHBOARD_LOADING
    }

    const DAILY_SERIES_LOADING = { status: 'loading', data: null, rangeKey: null }

    /**
     * 每日热力图取数：范围由页面按本地日历计算，这里只调用 Host 的 queryDailySeries，
     * 不在客户端伪造任何日序列。切到其它视图时暂停；返回同范围时保留快照并刷新。
     */
    function useDailySeries(ctx, range, refreshMs, refreshNonce, enabled = true) {
      const [state, setState] = React.useState(DAILY_SERIES_LOADING)
      const loadRef = React.useRef(null)
      const from = Number(range?.from)
      const to = Number(range?.to)
      const rangeKey = `${from}:${to}`
      React.useEffect(() => {
        if (!enabled) return undefined
        let active = true
        // 只有实际范围变化才清空；重新启用查询不能让已显示的热力格反复卸载入场。
        setState((previous) => previous.rangeKey === rangeKey ? previous : { ...DAILY_SERIES_LOADING, rangeKey })
        const load = async () => {
          try {
            const value = await callHost(ctx, 'queryDailySeries', { from, to })
            if (!active) return
            if (value === null || typeof value !== 'object' || !Array.isArray(value.days)) {
              throw new Error('queryDailySeries 返回结构非法')
            }
            setState({ status: 'ready', data: value, rangeKey })
          } catch {
            if (!active) return
            setState((previous) => ({ ...previous, status: 'error', rangeKey }))
          }
        }
        loadRef.current = load
        return () => {
          active = false
          loadRef.current = null
        }
      }, [ctx, from, to, rangeKey, enabled])
      React.useEffect(() => {
        if (!enabled || typeof loadRef.current !== 'function') return undefined
        loadRef.current()
        const timer = setInterval(() => {
          if (typeof loadRef.current === 'function') loadRef.current()
        }, refreshMs)
        return () => clearInterval(timer)
      }, [ctx, from, to, refreshMs, refreshNonce, enabled])
      // 新范围首次绘制即隐藏旧序列，不等 effect 才纠正月份和日格。
      return state.rangeKey === rangeKey ? state : DAILY_SERIES_LOADING
    }

    function formatPercent(share) {
      return `${Math.round(Math.max(0, Math.min(1, finite(share))) * 100)}%`
    }

    function formatRelativeTime(timestamp, t, nowMs) {
      if (!Number.isFinite(timestamp) || timestamp <= 0) return t('noData')
      const diff = Math.max(0, nowMs - timestamp)
      if (diff < 60_000) return t('justNow')
      if (diff < 60 * 60_000) return t('minutesAgo').replace('{n}', String(Math.floor(diff / 60_000)))
      if (diff < 24 * 60 * 60_000) return t('hoursAgo').replace('{n}', String(Math.floor(diff / (60 * 60_000))))
      if (diff < 7 * 24 * 60 * 60_000) return t('daysAgo').replace('{n}', String(Math.floor(diff / (24 * 60 * 60_000))))
      const at = new Date(timestamp)
      return `${at.getMonth() + 1}/${at.getDate()} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    }

    function formatRangeLabel(range, period, t, isZh) {
      if (range === null || range === undefined) return ''
      const day = (value) => {
        const at = new Date(value)
        return isZh ? `${at.getMonth() + 1}月${at.getDate()}日` : `${at.getMonth() + 1}/${at.getDate()}`
      }
      const prefix = `${t('rangeLabel')} `
      return period === 'day' ? prefix + day(range.from) : `${prefix}${day(range.from)} – ${day(range.to)}`
    }

    /** 趋势桶采用左闭右开范围；小时桶保留时间，整日桶不把次日零点算进日期标签。 */
    function formatSelectedRange(range, t, isZh) {
      const from = new Date(range.from), to = new Date(range.to)
      const date = (value) => isZh ? `${value.getMonth() + 1}月${value.getDate()}日` : `${value.getMonth() + 1}/${value.getDate()}`
      const time = (value) => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
      const isMidnight = (value) => value.getTime() === new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
      const wholeDays = isMidnight(from) && isMidnight(to)
      if (wholeDays) {
        const end = new Date(range.to - 1)
        return `${t('detailsRangeSelected')} · ${date(from)}${localDateKey(from) === localDateKey(end) ? '' : ` – ${date(end)}`}`
      }
      return `${date(from)} ${time(from)} – ${localDateKey(from) === localDateKey(to) ? '' : `${date(to)} `}${time(to)}`
    }

    /** 明细范围值归一化；未知值一律回到「今天」。 */
    function normalizeDetailsRange(value) {
      return DETAILS_RANGE_OPTIONS.some((option) => option.value === value)
        ? value
        : DETAILS_RANGE_DEFAULT
    }

    /** 顶部周期切到日/周/月时，明细跟随到语义相近的预设范围。 */
    function detailsRangeForPeriod(period) {
      if (period === 'week') return '7d'
      if (period === 'month') return '30d'
      return 'today'
    }

    /**
     * 明细预设范围的起点：按本地自然日回溯，终点不传，交给 Host 一直算到当前时刻。
     * 「全部」从 0 开始，复用领域服务的从最早记录至今语义。
     */
    function resolveDetailsRange(value, nowMs) {
      const normalized = normalizeDetailsRange(value)
      if (normalized === 'all') return { value: normalized, from: 0 }
      const numeric = Number(nowMs)
      const at = new Date(Number.isFinite(numeric) ? numeric : Date.now())
      const option = DETAILS_RANGE_OPTIONS.find((item) => item.value === normalized)
      const days = option?.days ?? 1
      return {
        value: normalized,
        from: new Date(at.getFullYear(), at.getMonth(), at.getDate() - (days - 1)).getTime(),
      }
    }

    function bucketLabel(bucket, period, isZh) {
      if (typeof bucket.label === 'string') return bucket.label
      const at = new Date(bucket.from)
      if (period === 'day') return `${String(at.getHours()).padStart(2, '0')}:00`
      if (period === 'week') {
        const index = at.getDay() === 0 ? 6 : at.getDay() - 1
        return (isZh
          ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
          : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])[index]
      }
      return `${at.getMonth() + 1}/${at.getDate()}`
    }

    function axisIndices(count, period) {
      if (count === 0) return []
      if (period === 'week') return Array.from({ length: count }, (_, index) => index)
      const step = period === 'day' ? 4 : count > 20 ? 6 : 4
      const indices = []
      for (let index = 0; index < count; index += step) indices.push(index)
      if (indices[indices.length - 1] !== count - 1) indices.push(count - 1)
      return indices
    }

    /** 统一浮层定位：默认优先锚点上方；prefer:'bottom' 时紧贴图标下方，空间不足才翻到上方。 */
    function clampTipPosition(anchor, size, viewport, options = {}) {
      const gap = finite(options.gap) || 10
      const margin = finite(options.margin) || 8
      const preferBottom = options.prefer === 'bottom'
      const width = Math.max(0, finite(size?.width))
      const height = Math.max(0, finite(size?.height))
      const viewportWidth = Math.max(0, finite(viewport?.width))
      const viewportHeight = Math.max(0, finite(viewport?.height))
      const anchorLeft = finite(anchor?.left)
      const anchorTop = finite(anchor?.top)
      const anchorWidth = Math.max(0, finite(anchor?.width))
      const anchorHeight = Math.max(0, finite(anchor?.height))
      const maxLeft = Math.max(margin, viewportWidth - width - margin)
      const maxTop = Math.max(margin, viewportHeight - height - margin)
      const left = Math.max(margin, Math.min(anchorLeft + anchorWidth / 2 - width / 2, maxLeft))
      const above = anchorTop - height - gap
      const below = anchorTop + anchorHeight + gap
      const canTop = above >= margin
      const canBottom = below + height <= viewportHeight - margin
      if (!preferBottom && canTop) return { left: Math.round(left), top: Math.round(above), placement: 'top' }
      if (preferBottom && canBottom) return { left: Math.round(left), top: Math.round(below), placement: 'bottom' }
      // 底部贴边时优先翻到图标上方；上下都放不下才在视口内夹取，保证说明文字读得全。
      if (preferBottom && canTop) return { left: Math.round(left), top: Math.round(above), placement: 'top' }
      const top = Math.max(margin, Math.min(below, maxTop))
      return { left: Math.round(left), top: Math.round(top), placement: 'bottom' }
    }

    /** 纯渲染层：浮层内容与位置都可从外部注入，供图表与后续热力图复用。 */
    function renderHoverTip(tip, position, extraProps = {}) {
      if (!tip) return null
      const style = position
        ? { left: `${position.left}px`, top: `${position.top}px` }
        : { left: '0px', top: '0px', visibility: 'hidden' }
      return h('div', {
        ...extraProps,
        className: 'cs-hover-tip',
        role: 'tooltip',
        style,
        'data-placement': position?.placement ?? 'top',
      },
        h('strong', { className: 'cs-hover-tip-title' }, tip.title),
        (tip.rows || []).map((row) => h('div', { className: 'cs-hover-tip-row', key: row.key ?? row.label },
          h('span', { className: 'cs-hover-tip-label' }, row.label),
          h('span', { className: 'cs-hover-tip-value' }, row.value))))
    }

    /** 挂载后量一次浮层尺寸再定位，避免贴边溢出；减少动效由 CSS 媒体查询处理。 */
    function HoverTip({ tip, id = 'dsh-timespan-hover-tip' }) {
      const ref = React.useRef(null)
      const [position, setPosition] = React.useState(null)
      React.useEffect(() => {
        if (!tip) {
          setPosition(null)
          return
        }
        const node = ref.current
        if (!node) return
        setPosition(clampTipPosition(tip.anchor, {
          width: typeof node.offsetWidth === 'number' ? node.offsetWidth : 0,
          height: typeof node.offsetHeight === 'number' ? node.offsetHeight : 0,
        }, {
          width: typeof window !== 'undefined' ? window.innerWidth : 0,
          height: typeof window !== 'undefined' ? window.innerHeight : 0,
        }, { prefer: tip.prefer }))
      }, [tip])
      if (!tip) return null
      return renderHoverTip(tip, position, { id, ref })
    }

    /** 图表共用的悬停状态：内容由调用方构建，锚点取自事件目标。 */
    function useHoverTip() {
      const [tip, setTip] = React.useState(null)
      const show = (content, event) => {
        const node = event?.currentTarget
        if (!node || typeof node.getBoundingClientRect !== 'function') return
        const rect = node.getBoundingClientRect()
        setTip({
          ...content,
          anchor: {
            left: finite(rect.left), top: finite(rect.top),
            right: finite(rect.right), bottom: finite(rect.bottom),
            width: finite(rect.width), height: finite(rect.height),
          },
        })
      }
      const hide = () => setTip(null)
      return { tip, show, hide }
    }

    /**
     * 行内说明一律走统一 HoverTip（fixed 定位 + 视口夹取），不再使用原生 title 属性，
     * 避免小字被容器裁切；同时保留键盘聚焦时的同等呈现。
     */
    function hoverTipProps(hoverTip, title, rows = [], options = {}) {
      if (!hoverTip || !title) return {}
      const content = { title, rows, prefer: options.prefer }
      return {
        onMouseEnter: (event) => hoverTip.show?.(content, event),
        onMouseLeave: () => hoverTip.hide?.(),
        onFocus: (event) => hoverTip.show?.(content, event),
        onBlur: () => hoverTip.hide?.(),
      }
    }

    function buildTrendTip(bucket, period, t, isZh, format = 'hms') {
      return {
        kind: 'bucket',
        key: bucket.key,
        title: bucketLabel(bucket, period, isZh),
        rows: bucket.future ? [{ key: 'future', label: t('trendNotStarted'), value: '—' }] : [
          { key: 'active', label: t('activeLabel'), value: formatDuration(bucket.activeMs, format) },
          { key: 'task', label: t('taskLabel'), value: formatDuration(bucket.taskMs, format) },
        ],
      }
    }

    function buildCompositionTip(item, total, t, format = 'hms') {
      return {
        kind: 'composition',
        key: item.key,
        title: item.label,
        rows: [
          { key: 'share', label: t('shareLabel'), value: formatPercent(total > 0 ? item.ms / total : 0) },
          { key: 'duration', label: t('durationLabel'), value: formatDuration(item.ms, format) },
        ],
      }
    }

    /** 热力图浮层：有观测给出在线/活跃/任务三项；无观测只标「无记录」，绝不显示 0。 */
    function buildHeatTip(day, t, format = 'hms') {
      const at = new Date(Number(day?.from))
      const valid = !Number.isNaN(at.getTime())
      const month = valid ? at.getMonth() + 1 : 1
      const date = valid ? at.getDate() : 1
      const isZh = t('periodDay') === '日'
      const monthLabel = isZh ? String(month) : HEAT_MONTH_ABBR[month - 1]
      const title = t('heatDayTitle').replace('{month}', monthLabel).replace('{day}', String(date))
      const hasObservations = day?.hasObservations === true
      const rows = hasObservations
        ? [
            { key: 'online', label: t('onlineLabel'), value: formatDuration(day.onlineMs, format) },
            { key: 'active', label: t('activeLabel'), value: formatDuration(day.activeMs, format) },
            { key: 'task', label: t('taskLabel'), value: formatDuration(day.taskMs, format) },
          ]
        : [{ key: 'empty', label: t('noRecord'), value: '' }]
      return { kind: 'heat', key: day?.dateKey ?? localDateKey(at), title, rows }
    }

    /** 方向键/Home/End 在同类可聚焦元素之间移动；返回 true 表示已处理。 */
    function moveFocusByKey(event, selector) {
      const key = event?.key
      if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') return false
      if (typeof event.preventDefault === 'function') event.preventDefault()
      const current = event.currentTarget
      const groups = current?.parentElement?.querySelectorAll?.(selector)
      if (!groups || groups.length === 0) return true
      const index = Array.prototype.indexOf.call(groups, current)
      let next = index
      if (key === 'Home') next = 0
      else if (key === 'End') next = groups.length - 1
      else next = (index + (key === 'ArrowRight' ? 1 : -1) + groups.length) % groups.length
      const target = groups[next]
      if (target && typeof target.focus === 'function') target.focus()
      return true
    }

    function isActivationKey(event) {
      return event?.key === 'Enter' || event?.key === ' ' || event?.key === 'Spacebar'
    }

    /** 原生 SVG 双系列柱状图；每个时段分组带透明命中区，悬浮或聚焦时整体放大并浮出数值。 */
    function renderTrendChart(trend, period, t, isZh, hover, actions = {}, format = 'hms') {
      const width = 1000
      // 首屏页可传入更大的 viewBox 高度，柱高、基线、网格与纵轴标签全部按它重算。
      const height = Math.max(60, finite(actions?.height) || 140)
      const baseline = height - 3
      const usable = height - 12
      const count = trend.length
      const peak = Math.max(1, ...trend.map((bucket) => Math.max(bucket.activeMs, bucket.taskMs)))
      const slot = width / Math.max(1, count)
      // 回顾卡只拿到已发生的桶（例如本周前四天）：柱宽和成对间距都按完整周期的槽位数计算，
      // 避免几个桶平分整幅图宽后柱子突然变粗、配对也被拉开；概览沿用实际桶数。
      const nominal = Math.max(count, finite(actions?.slotCount) || 0)
      const barSlot = width / Math.max(1, nominal)
      // 回顾卡的图较窄，周/月场景需要按槽位放宽柱宽；概览沿用原来的固定上限。
      const barRatio = finite(actions?.barRatio) || 0.32
      const barMax = finite(actions?.barMax) || 16
      const barWidth = Math.max(1.5, Math.min(slot * barRatio, barSlot * barRatio, barMax))
      const gap = Math.max(1, barSlot * 0.05)
      const renderBar = (key, x, duration, fill, index) => {
        const barHeight = Math.max(1.5, (duration / peak) * usable)
        return h('rect', {
          key,
          className: 'cs-bar cs-reveal-y',
          style: chartStagger(index, count),
          x,
          y: baseline - barHeight,
          width: barWidth,
          height: barHeight,
          rx: barWidth * 0.42,
          ry: Math.min(barWidth * 0.32, barHeight / 2),
          fill,
        })
      }
      const groups = []
      trend.forEach((bucket, index) => {
        const left = index * slot + (slot - barWidth * 2 - gap) / 2
        const label = bucketLabel(bucket, period, isZh)
        const tip = buildTrendTip(bucket, period, t, isZh, format)
        const hot = hover?.kind === 'bucket' && hover.key === bucket.key
        const bars = []
        if (bucket.activeMs > 0) {
          bars.push(renderBar(`active-${bucket.key}`, left, bucket.activeMs, 'var(--cs-chart-active)', index))
        }
        if (bucket.taskMs > 0) {
          bars.push(renderBar(`task-${bucket.key}`, left + barWidth + gap, bucket.taskMs, 'var(--cs-task)', index))
        }
        const groupProps = {
          key: bucket.key,
          className: `cs-bar-group${hot ? ' is-hot' : ''}`,
          tabIndex: 0,
          role: 'button',
          'aria-label': bucket.future ? `${label} · ${t('trendNotStarted')}` : `${label} · ${t('activeLabel')} ${formatDuration(bucket.activeMs, format)} · ${t('taskLabel')} ${formatDuration(bucket.taskMs, format)}`,
          onKeyDown: (event) => {
            if (moveFocusByKey(event, '.cs-bar-group')) return
            if (isActivationKey(event) && actions.onHover) {
              if (typeof event.preventDefault === 'function') event.preventDefault()
              actions.onHover(tip, event)
            }
          },
        }
        if (actions.onHover) {
          groupProps.onMouseEnter = (event) => actions.onHover(tip, event)
          groupProps.onFocus = (event) => actions.onHover(tip, event)
        }
        if (actions.onLeave) {
          groupProps.onMouseLeave = () => actions.onLeave()
          groupProps.onBlur = () => actions.onLeave()
        }
        groups.push(h('g', groupProps,
          h('rect', {
            key: `hit-${bucket.key}`, className: 'cs-bar-hit',
            x: index * slot, y: 0, width: slot, height,
            fill: 'transparent', 'aria-hidden': true,
          }),
          h('g', { key: `pair-${bucket.key}`, className: 'cs-bar-pair' }, ...bars)))
      })
      const grid = [0.25, 0.5, 0.75, 1].map((ratio) => h('line', {
        key: `grid-${ratio}`,
        x1: 0,
        x2: width,
        y1: baseline - usable * ratio,
        y2: baseline - usable * ratio,
        stroke: 'var(--dsw-alias-border-l1)',
        strokeWidth: 1,
        strokeDasharray: '4 6',
        vectorEffect: 'non-scaling-stroke',
      }))
      const axis = axisIndices(count, period).map((index) => h('span', {
        key: `axis-${index}`,
        style: { left: `${((index + 0.5) / count) * 100}%` },
      }, bucketLabel(trend[index], period, isZh), actions.showFuture && trend[index]?.future ? h('small', { className: 'cs-axis-future' }, t('trendNotStarted')) : null))
      return h(ChartReveal, { className: 'cs-chart' },
        h('div', { className: 'cs-plot' },
        h('div', { className: 'cs-y-axis', 'aria-hidden': true }, [1, 0.5, 0].map((ratio) =>
          h('span', { key: ratio, style: { top: `${((baseline - usable * ratio) / height) * 100}%` } }, formatDuration(peak * ratio, format)))),
        h('svg', {
          viewBox: `0 0 ${width} ${height}`,
          preserveAspectRatio: 'none',
          role: 'group',
          'aria-label': t('trendHint'),
        },
          ...grid,
          h('line', {
            x1: 0, x2: width, y1: baseline, y2: baseline,
            stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke',
          }),
          ...groups)),
        h('div', { className: `cs-axis${actions.showFuture && trend.some((bucket) => bucket.future) ? ' has-future' : ''}` }, ...axis))
    }

    /** 当前统计范围包含的本地日历日数；跨夏令时也按日历日而不是固定 24 小时计算。 */
    function localDayCount(range) {
      if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) return 1
      const from = new Date(range.from)
      const to = new Date(range.to)
      const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
      const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
      return Math.max(1, Math.round((end - start) / 86_400_000) + 1)
    }

    function averageMsPerDay(data, field) {
      return finite(data?.[field]) / localDayCount(data?.range)
    }

    /** 概览口径收进 ⓘ：按在线、活跃、实际占用与历史数据逐条说明，避免挤成一整段。 */
    function overviewInfoMessages(data, t) {
      return [
        t('onlineFoot'),
        t('sinceBoot'),
        t('unionFoot'),
        data?.period && data.period !== 'day' ? t('dailyAverageHint') : null,
        t('recordSinceBoot'),
      ].filter(Boolean)
    }

    /** 页脚数据摘要之外的通用说明（本机存储、近似记录）收进页面唯一的 ⓘ。 */
    function footerInfoMessages(t, hasApproximate) {
      return [t('localOnly'), hasApproximate === true ? t('approximateHint') : null].filter(Boolean)
    }

    /**
     * 周期迷你卡：标题、主数字与贴底的活跃占比线。
     * 占比文字下沉到横条上方并缩小字号，让数字与标题更紧凑。
     */
    function renderCycleCard(t, period, cycle, isCurrent, onSelect, format = 'hms', dateStyle = 'inline') {
      const titleKey = period === 'day' ? 'cycleToday' : period === 'week' ? 'cycleWeek' : 'cycleMonth'
      const hasRange = cycle.from > 0 && cycle.to > cycle.from
      const dateLabel = hasRange ? formatRangeLabel(cycle, period, t, t('periodDay') === '日').replace(`${t('rangeLabel')} `, '') : ''
      const watermark = hasRange && dateStyle === 'watermark'
      const shortDate = (value) => {
        const date = new Date(value)
        return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
      }
      return h('button', { key: period, type: 'button', className: `cs-cycle${isCurrent ? ' is-current' : ''}${watermark ? ' has-date-watermark' : ''}`, 'aria-pressed': isCurrent, onClick: onSelect },
        h('span', { className: 'cs-cycle-head' },
          h('span', { className: 'cs-cycle-title' }, t(titleKey)),
          hasRange ? h('span', { className: 'cs-cycle-date', 'aria-hidden': watermark || undefined },
            watermark ? `${shortDate(cycle.from)}–${shortDate(cycle.to)}` : dateLabel) : null,
          watermark ? h('span', { className: 'cs-sr-only' }, dateLabel) : null),
        h('span', { className: 'cs-cycle-value' }, formatDuration(cycle.activeMs, format)),
        renderCycleShare(cycle, t))
    }

    function renderCycleShare(cycle, t) {
      const share = activeSharePercent(cycle.activeMs, cycle.onlineMs)
      return renderShareTrack(t('activeShare'), share)
    }

    function renderShareTrack(label, share, tone = 'active') {
      return h('span', { className: 'cs-cycle-tail' },
        h('span', { className: 'cs-cycle-share' }, `${label} ${share}%`),
        h(ChartReveal, { as: 'span', className: `cs-cycle-track${tone === 'task' ? ' is-task' : ''}`, 'aria-hidden': true },
          h('i', { className: 'cs-reveal-x', style: { width: `${share}%` } })))
    }

    /**
     * 热力图图例：当前主题的六档热力色从左到右排成低→高色带。
     * 普通概览把范围汇总也收进同一浮层：色带下方给出覆盖度圆环与两份读数，
     * 不再单独占据卡片标题下方的一行。
     */
    function renderHeatLegend(t, format = 'hms', summary = null) {
      const hasSummary = summary !== null && summary.observedDays > 0
      return h('span', { className: `cs-heat-legend${hasSummary ? ' has-summary' : ''}` },
        h('span', { className: 'cs-heat-legend-row' },
          h('span', { className: 'cs-heat-legend-label' }, t('heatLegendLow')),
          h('span', { className: 'cs-heat-legend-scale', 'aria-hidden': true },
            ...[0, 1, 2, 3, 4, 5].map((level) => h('i', {
              key: level,
              className: 'cs-heat-legend-swatch',
              style: { background: `var(--cs-heat-${level})` },
            }))),
          h('span', { className: 'cs-heat-legend-label' }, t('heatLegendHigh'))),
        hasSummary
          ? h('span', {
              className: 'cs-heat-legend-summary',
              role: 'group',
              'aria-label': summary.label,
            },
              h('span', {
                className: 'cs-heat-legend-ring',
                style: { '--cs-heat-coverage': `${Math.round((summary.activeDays / summary.observedDays) * 360)}deg` },
                'aria-hidden': true,
              }),
              h('span', { className: 'cs-heat-legend-stat' },
                h('span', null, t('activeDaysLabel')),
                h('b', null, h(TextFade, { text: `${summary.activeDays}/${summary.observedDays}` }))),
              h('span', { className: 'cs-heat-legend-divider', 'aria-hidden': true }),
              h('span', { className: 'cs-heat-legend-stat' },
                h('span', null, t('rangeActive')),
                h('b', null, h(TextFade, { text: formatDuration(summary.activeMs, format) }))))
          : null)
    }

    /** 只规范说明浮层的标点，正文、模型原文及小数保持原样。 */
    function infoText(value) {
      return typeof value === 'string' ? value.replace(/。\s*/gu, '；').replace(/\.(?=\s|$)/gu, ';').replace(/[；;]\s*$/u, '').trim() : value
    }

    /** 口径说明：悬停、聚焦或点击显示；delay > 0 时悬停先停留一段时间，聚焦仍立即显示。 */
    function Info({ message, content = null, lines = null, icon = null, onClick, buttonRef, label = message, buttonClassName = '', disabled = false, ariaDisabled = false, delay = 0 }) {
      const [position, setPosition] = React.useState(null)
      const [escaped, setEscaped] = React.useState(false)
      const localRef = React.useRef(null)
      const anchorRef = buttonRef ?? localRef
      const tipRef = React.useRef(null)
      const timerRef = React.useRef(null)
      const clearPending = () => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
      }
      const place = () => {
        const anchor = anchorRef.current
        const node = tipRef.current
        if (!anchor || !node || typeof window === 'undefined') return
        if (typeof anchor.getBoundingClientRect !== 'function') return
        const rect = anchor.getBoundingClientRect()
        setPosition(clampTipPosition(
          { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          { width: node.offsetWidth ?? 0, height: node.offsetHeight ?? 0 },
          { width: window.innerWidth ?? 0, height: window.innerHeight ?? 0 },
          { gap: 4, prefer: 'bottom' },
        ))
      }
      const show = () => {
        clearPending()
        setEscaped(false)
        place()
      }
      const showOnHover = () => {
        if (!(delay > 0)) {
          show()
          return
        }
        clearPending()
        const wait = Number(delay)
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          setEscaped(false)
          place()
        }, Number.isFinite(wait) ? wait : 0)
      }
      const hide = () => {
        clearPending()
        setEscaped(true)
      }
      React.useEffect(() => { if (position) place() }, [message])
      React.useEffect(() => () => clearPending(), [])
      React.useEffect(() => {
        // Esc 仍可收起当前这次悬浮/聚焦；移出或失焦后重新进入即可再看。
        const onKey = (event) => { if (event?.key === 'Escape') setEscaped(true) }
        if (typeof document !== 'undefined') document.addEventListener('keydown', onKey)
        if (typeof window.addEventListener === 'function') window.addEventListener('resize', place)
        return () => {
          if (typeof document !== 'undefined') document.removeEventListener('keydown', onKey)
          if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', place)
        }
      }, [])
      return h('span', { className: `cs-info${escaped ? ' is-escaped' : ''}` },
        h('button', {
          ref: anchorRef,
          type: 'button', 'aria-label': infoText(label), 'aria-description': label !== message ? infoText(message) : undefined,
          'aria-disabled': ariaDisabled ? 'true' : undefined, className: buttonClassName,
          onClick: onClick ?? show, disabled,
          // 鼠标点击不抢焦点：否则 :focus-within 的色块和浮层会一直留到点击别处；键盘聚焦不变。
          onMouseDown: (event) => { if (event?.button === 0) event.preventDefault() },
          onMouseEnter: showOnHover, onMouseLeave: hide, onFocus: show, onBlur: hide,
        },
          icon ?? h('svg', { viewBox: '0 0 20 20', width: 16, height: 16, fill: 'none', 'aria-hidden': true },
            h('circle', { cx: 10, cy: 10, r: 7.5, stroke: 'currentColor', strokeWidth: 1.4 }),
            h('path', { d: 'M10 9v4M10 6.5h.01', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }))),
        h('span', {
          ref: tipRef,
          className: `cs-info-tip${lines === null ? '' : ' cs-info-tip-lines'}`,
          role: 'tooltip',
          'data-placement': position?.placement ?? 'bottom',
          // 位置尚未量出时内联 hidden 压住 CSS 显示，避免在 (0,0) 闪一下。
          style: position
            ? { left: `${position.left}px`, top: `${position.top}px` }
            : { left: '0px', top: '0px', visibility: 'hidden' },
        }, lines === null
          ? content ?? infoText(message)
          : h('span', { className: 'cs-info-lines' },
              lines.map((line, index) => h('span', { className: 'cs-info-line', key: index }, infoText(line))))))
    }

    function renderInfo(message, content = null, lines = null) {
      return h(Info, { message, content, lines })
    }

    /** 按会话累计任务构成；扇区与右侧列表共享悬停/聚焦状态，历史缺失拆分计入未拆分。 */
    function renderComposition(data, t, hover, actions = {}, format = 'hms') {
      const parts = [
        { key: 'model', label: t('breakdownModel'), ms: 0 },
        { key: 'tool', label: t('breakdownTool'), ms: 0 },
        { key: 'wait', label: t('breakdownWait'), ms: 0 },
        { key: 'other', label: t('breakdownOther'), ms: 0 },
        { key: 'unknown', label: t('unknownBreakdown'), ms: 0 },
      ]
      for (const workspace of data.workspaces) {
        for (const session of workspace.sessions) {
          let remaining = Math.max(0, session.taskMs)
          // hasBreakdown=false 表示并非所有任务都有拆分；同一会话中仍可能
          // 存在其他任务的有效拆分，不能把这些已知时长全部归为未拆分。
          for (const [index, value] of [session.modelMs, session.toolMs, session.waitMs, session.otherMs].entries()) {
            const amount = Math.min(remaining, Math.max(0, value))
            parts[index].ms += amount
            remaining -= amount
          }
          parts[4].ms += remaining
        }
      }
      const total = parts.reduce((sum, item) => sum + item.ms, 0)
      const visibleParts = parts.filter((item) => item.ms > 0)
      const hotKey = hover?.kind === 'composition' ? hover.key : null
      let offset = 0
      const radius = 42
      const circumference = 2 * Math.PI * radius
      const segments = visibleParts.map((item, index) => {
        const fraction = item.ms / total
        const length = fraction * circumference
        // 两侧各留半个间隙；极小扇区最多扣掉四分之一，单一类别仍显示完整圆环。
        const gap = visibleParts.length > 1 ? Math.min(1.8, length * .25) : 0
        const tip = buildCompositionTip(item, total, t, format)
        const props = {
          // 周期切换时类别键相同，但数值与弧长来自新周期；把周期带进 key，
          // 让扇区作为新节点重新播放入场，避免沿用旧节点导致动画不重播。
          key: `${data?.period ?? 'composition'}-${item.key}`,
          className: `cs-donut-seg cs-reveal-ring is-${item.key}${hotKey === item.key ? ' is-hot' : ''}`,
          style: { ...chartStagger(index, visibleParts.length), '--cs-ring-length': circumference },
          cx: 50, cy: 50, r: radius,
          fill: 'none', stroke: `var(--cs-series-${item.key})`, strokeWidth: 11,
          strokeDasharray: `${length - gap} ${circumference}`,
          strokeDashoffset: -(offset * circumference + gap / 2),
          strokeLinecap: 'butt',
          tabIndex: 0,
          role: 'button',
          'aria-label': `${item.label} · ${t('shareLabel')} ${formatPercent(fraction)} · ${t('durationLabel')} ${formatDuration(item.ms, format)}`,
          onKeyDown: (event) => {
            if (moveFocusByKey(event, '.cs-donut-seg')) return
            if (isActivationKey(event) && actions.onHover) {
              if (typeof event.preventDefault === 'function') event.preventDefault()
              actions.onHover(tip, event)
            }
          },
        }
        if (actions.onHover) {
          props.onMouseEnter = (event) => actions.onHover(tip, event)
          props.onFocus = (event) => actions.onHover(tip, event)
        }
        if (actions.onLeave) {
          props.onMouseLeave = () => actions.onLeave()
          props.onBlur = () => actions.onLeave()
        }
        offset += fraction
        return h('circle', props)
      })
      return h('section', { className: `cs-card cs-composition${hotKey ? ' has-hot' : ''}` },
        h('div', { className: 'cs-card-head' },
          renderCardTitle(t('compositionTitle'), 'breakdown', null, t('moduleTipComposition'))),
        total === 0 ? h('div', { className: 'cs-empty' }, t('noTaskComposition'))
          : h('div', { className: 'cs-composition-body' },
              h(ChartReveal, {
                className: `cs-donut${hotKey ? ' has-hot' : ''}`,
                role: 'group',
                'aria-label': `${t('compositionTitle')} · ${t('accumulated')} ${formatDuration(total, format)}`,
              },
                h('svg', { viewBox: '0 0 100 100' },
                  h('circle', { cx: 50, cy: 50, r: radius, fill: 'none', stroke: 'var(--dsw-alias-bg-layer-1)', strokeWidth: 11 }),
                  h('g', { transform: 'rotate(-90 50 50)' }, ...segments)),
                h('div', { className: 'cs-donut-center' }, h('strong', null, formatDuration(total, format)), h('span', null, t('accumulated')))),
              h('div', { className: 'cs-composition-list' }, visibleParts.map((item) => {
                const tip = buildCompositionTip(item, total, t, format)
                const props = {
                  key: item.key,
                  className: `cs-composition-row${hotKey === item.key ? ' is-hot' : ''}`,
                  tabIndex: 0,
                  role: 'button',
                  'aria-label': `${item.label} · ${t('shareLabel')} ${formatPercent(item.ms / total)} · ${t('durationLabel')} ${formatDuration(item.ms, format)}`,
                  onKeyDown: (event) => {
                    if (moveFocusByKey(event, '.cs-composition-row')) return
                    if (isActivationKey(event) && actions.onHover) {
                      if (typeof event.preventDefault === 'function') event.preventDefault()
                      actions.onHover(tip, event)
                    }
                  },
                }
                if (actions.onHover) {
                  props.onMouseEnter = (event) => actions.onHover(tip, event)
                  props.onFocus = (event) => actions.onHover(tip, event)
                }
                if (actions.onLeave) {
                  props.onMouseLeave = () => actions.onLeave()
                  props.onBlur = () => actions.onLeave()
                }
                return h('div', props,
                  h('span', { className: `cs-series-swatch is-${item.key}`, 'aria-hidden': true }),
                  h('span', { className: 'cs-composition-label' }, item.label),
                  h('span', { className: 'cs-composition-percent' }, formatPercent(item.ms / total)),
                  h('span', { className: 'cs-composition-time' }, formatDuration(item.ms, format)))
              }))))
    }

    /** 排名与占比沿用 Host 的工作区累计工时，不把并发任务相加当作实际占用。 */
    function renderWorkspaceRanking(data, t, format = 'hms', hoverTip = null) {
      const rows = [...data.workspaces].filter((row) => row.taskMs > 0).sort((a, b) => b.taskMs - a.taskMs).slice(0, 5)
      return h('section', { className: 'cs-card cs-ranking' },
        h('div', { className: 'cs-card-head' }, renderCardTitle(t('workspaceRanking'), 'ranking', null, t('moduleTipRanking'))),
        rows.length === 0 ? h('div', { className: 'cs-empty' }, t('noTaskComposition'))
          : h('div', { className: `cs-ranking-list${rows.length <= 2 ? ' is-short' : ''}` }, rows.map((row, index) => {
              const name = row.workspaceTitle ?? t('unassigned')
              return h('div', {
                className: 'cs-ranking-row',
                key: row.key,
                ...hoverTipProps(hoverTip, name, [
                  { key: 'task', label: t('taskLabel'), value: formatDuration(row.taskMs, format) },
                  { key: 'share', label: t('colShare'), value: formatPercent(row.share) },
                ]),
              },
                h('span', { className: 'cs-rank-index' }, String(index + 1).padStart(2, '0')),
                h('span', { className: 'cs-ranking-name' }, name),
                h(ChartReveal, { as: 'span', className: 'cs-ranking-bar', 'aria-hidden': true },
                  h('i', { className: 'cs-reveal-x', style: { width: formatPercent(row.share), ...chartStagger(index, rows.length) } })),
                h('span', { className: 'cs-ranking-time' }, formatDuration(row.taskMs, format)))
            })))
    }

    /** 恢复票 03 的任务构成展示：四部分之和等于任务时长，历史任务显示「未拆分」。 */
    function sessionBreakdownRows(session, t, format = 'hms') {
      const values = [session.modelMs, session.toolMs, session.waitMs, session.otherMs]
      const labels = ['breakdownModel', 'breakdownTool', 'breakdownWait', 'breakdownOther']
      let remaining = Math.max(0, session.taskMs)
      const rows = []
      values.forEach((value, index) => {
        const amount = Math.min(remaining, Math.max(0, value))
        remaining -= amount
        if (amount > 0) rows.push({ key: labels[index], label: t(labels[index]), value: formatDuration(amount, format), ms: amount })
      })
      if (remaining > 0) rows.push({ key: 'notBroken', label: t('notBroken'), value: formatDuration(remaining, format), ms: remaining })
      return rows
    }

    function renderSessionBreakdown(session, t, format = 'hms') {
      const rows = sessionBreakdownRows(session, t, format)
      return h('span', { className: 'cs-session-breakdown' },
        rows.length > 0 ? rows.map((row) => `${row.label} ${row.value}`).join(' · ') : t('notBroken'))
    }

    function renderSessionRow(session, t, nowMs, subagentRows, format = 'hms', hoverTip = null, highlighted = false, preview = null) {
      const subagents = subagentRows.length
      const subagentDuration = formatDuration(
        subagentRows.reduce((sum, row) => sum + row.durationMs, 0),
        format,
      )
      const sessionTitle = session.sessionTitle ?? t('unknownSession')
      const lastText = formatRelativeTime(session.lastActivityAt, t, nowMs)
      const breakdownRows = session.taskCount > 0 ? sessionBreakdownRows(session, t, format) : []
      const breakdownSummary = breakdownRows.length > 0
        ? breakdownRows.map((row) => `${row.label} ${row.value}`).join(' · ')
        : t('notBroken')
      const subagentSummary = t('subagentDetailHint')
        .replace('{count}', String(subagents))
        .replace('{duration}', subagentDuration)
      const subagentLabel = `${t('subagentDetail')}：${subagentSummary}`
      const subagentTipRows = subagentRows.map((row) => ({
        key: row.sessionId,
        label: row.sessionTitle ?? row.sessionId,
        value: formatDuration(row.durationMs, format),
      }))
      const rowProps = {
        className: `cs-session${preview?.selected ? ' is-selected' : ''}${preview?.onSelect ? ' is-selectable' : ''}${session.taskRunning ? ' is-running' : ''}${highlighted ? ' is-highlighted' : ''}`,
        key: session.sessionId,
        'data-session-id': session.sessionId,
      }
      if (typeof preview?.onSelect === 'function') rowProps.onClick = () => preview.onSelect(session)
      return h('div', rowProps,
        h('span', { className: 'cs-session-body' },
          h('span', { className: 'cs-session-headline' },
            h('span', {
              className: `cs-session-dot${session.taskRunning ? ' is-running' : ''}`,
              'aria-hidden': true,
            }),
            h('span', { className: 'cs-session-title', ...hoverTipProps(hoverTip, sessionTitle) }, sessionTitle),
            session.taskRunning
              ? renderDetailMeta({
                className: 'cs-session-status',
                icon: 'running',
                label: t('runningTag'),
                tipTitle: t('runningTag'),
                hoverTip,
                tone: 'running',
              })
              : null),
          h('span', { className: 'cs-session-meta' },
            renderDetailMeta({
              className: 'cs-session-stat',
              icon: 'active',
              label: `${t('activeLabel')} ${formatDuration(session.activeMs, format)}`,
              value: formatDuration(session.activeMs, format),
              tipTitle: `${t('activeLabel')} ${formatDuration(session.activeMs, format)}`,
              hoverTip,
              tone: 'active',
            }),
            renderDetailMeta({
              className: 'cs-session-stat',
              icon: 'task',
              label: `${t('taskLabel')} ${formatDuration(session.taskMs, format)}`,
              value: formatDuration(session.taskMs, format),
              tipTitle: `${t('taskLabel')} ${formatDuration(session.taskMs, format)}`,
              hoverTip,
              tone: 'task',
            }),
            renderDetailMeta({
              className: 'cs-session-stat',
              icon: 'count',
              label: `${session.taskCount} ${t('taskCountUnit')}`,
              value: String(session.taskCount),
              tipTitle: `${session.taskCount} ${t('taskCountUnit')}`,
              hoverTip,
            }),
            session.taskCount > 0
              ? renderDetailMeta({
                className: 'cs-session-tool',
                icon: 'breakdown',
                label: `${t('compositionTitle')}：${breakdownSummary}`,
                tipTitle: t('compositionTitle'),
                tipRows: breakdownRows,
                hoverTip,
              })
              : null,
            // 子代理任务只在父会话明细里露出，不参与上面的任务时长与次数。
            subagents > 0
              ? renderDetailMeta({
                className: 'cs-session-tool is-subagent',
                icon: 'subagent',
                label: subagentLabel,
                tipTitle: t('subagentDetail'),
                tipRows: subagentTipRows,
                hoverTip,
              })
              : null)),
        h('span', { className: 'cs-session-tail' },
          renderDetailMeta({
            className: 'cs-session-last',
            icon: 'clock',
            label: `${t('colLast')} ${lastText}`,
            value: lastText,
            tipTitle: `${t('colLast')} ${lastText}`,
            hoverTip,
          }),
          // 点整行已经会在右侧预览统计，这一格改成宿主会话入口；占位会话没有可打开的宿主页，留空。
          sessionIsOpenable(session) && typeof preview?.openSession === 'function'
            ? h('button', {
                type: 'button', className: 'cs-session-inspect cs-session-open',
                'aria-label': `${t('openSession')}：${sessionTitle}`,
                ...hoverTipProps(hoverTip, t('openSession')),
                onClick: (event) => { event.stopPropagation(); preview.openSession(session) },
              }, h(DetailGlyph, { name: 'open', size: 16 }))
            : null))
    }

    function renderWorkspaceRow(row, isOpen, onToggle, t, nowMs, subagentByParent, format = 'hms', hoverTip = null, highlightSessionId = null, sessionPaging = null, preview = null) {
      const workspaceTitle = row.workspaceTitle ?? t('unassigned')
      const sessions = Array.isArray(row.sessions) ? row.sessions : []
      const paging = sessionPaging?.enabled === true
      const visibleCount = Math.max(
        DETAILS_SESSION_INITIAL,
        Math.min(sessions.length, Math.floor(finite(sessionPaging?.visibleCount ?? DETAILS_SESSION_INITIAL))),
      )
      const shownSessions = paging ? sessions.slice(0, visibleCount) : sessions
      const selectedIndex = paging && preview?.sessionId
        ? sessions.findIndex((session) => session.sessionId === preview.sessionId) : -1
      // 排序或回退后继续展示已选会话，列表其余会话仍按批次加载。
      if (selectedIndex >= visibleCount) shownSessions.push(sessions[selectedIndex])
      const hiddenCount = Math.max(0, sessions.length - shownSessions.length)
      const nextEnd = Math.min(sessions.length, visibleCount + DETAILS_SESSION_STEP)
      const nextCount = nextEnd - visibleCount - Number(selectedIndex >= visibleCount && selectedIndex < nextEnd)
      return h('div', { className: `cs-group${isOpen ? ' is-open' : ''}`, key: row.key, 'data-workspace-key': row.key },
        h('div', {
          className: 'cs-summary cs-workspace-head',
          role: 'button',
          tabIndex: 0,
          'aria-expanded': isOpen,
          'aria-label': `${workspaceTitle} · ${sessions.length} ${t('sessionsUnit')} · ${t(isOpen ? 'collapse' : 'expand')}`,
          onClick: onToggle,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onToggle()
            }
          },
        },
          h('span', { className: 'cs-workspace-chevron', 'aria-hidden': true },
            h('span', { className: `cs-triangle${isOpen ? ' is-open' : ''}` })),
          h('span', { className: 'cs-workspace-name' }, workspaceTitle),
          h('span', {
            className: 'cs-workspace-count',
            'aria-label': `${sessions.length} ${t('sessionsUnit')}`,
          }, String(sessions.length))),
        h(AnimatedCollapse, { open: isOpen, className: 'cs-session-collapse' }, isOpen
          ? h('div', { className: 'cs-sessions' }, sessions.length === 0
              ? h('div', { className: 'cs-empty is-small' }, t('emptyWorkspace'))
              : [
                  ...shownSessions.map((session) =>
                    renderSessionRow(
                      session, t, nowMs, subagentByParent[session.sessionId] ?? [], format, hoverTip,
                      session.sessionId === highlightSessionId,
                      preview ? {
                        selected: preview.sessionId === session.sessionId,
                        onSelect: (value) => preview.onSelect?.({ ...value, workspaceKey: row.key, workspaceTitle }),
                        openSession: preview.openSession,
                      } : null,
                    )),
                  paging && hiddenCount > 0
                    ? h('div', { className: 'cs-sessions-more', key: 'show-more' },
                        h('button', {
                          type: 'button',
                          className: 'cs-text-link',
                          onClick: () => sessionPaging?.onShowMore?.(),
                        }, t('detailsShowMore').replace('{count}', String(nextCount))),
                        h('span', { className: 'cs-sessions-count' },
                          t('detailsShownCount')
                            .replace('{shown}', String(shownSessions.length))
                            .replace('{total}', String(sessions.length))))
                    : null,
                ])
          : null))
    }

    /**
     * 设置页通知记录。复用 queryStats/getBackfillStatus 的同一份 backfill
     * 数据：完成事件、累计回填条数、事件类型、时间与已读状态都可回看，
     * 不因为点了「知道了」而丢失。
     */
    function renderBackfillNotices(backfill, t) {
      const notices = Array.isArray(backfill?.notices) ? backfill.notices : []
      if (notices.length === 0) return h('p', { className: 'cs-notice-empty' }, t('backfillNoticeEmpty'))
      const kindKeys = {
        initial: 'backfillNoticeKindInitial',
        version: 'backfillNoticeKindVersion',
        retry: 'backfillNoticeKindRetry',
        clear: 'backfillNoticeKindClear',
      }
      return h('div', { className: 'cs-notice-list', role: 'list' },
        notices.slice().reverse().map((notice) => {
          const parts = [
            t('backfillNoticeCount').replace('{tasks}', String(notice.tasksWritten)),
            notice.kind && kindKeys[notice.kind] ? t(kindKeys[notice.kind]) : null,
            formatNoticeTime(notice.completedAt),
          ].filter((part) => part !== null && part !== '')
          return h('div', { className: 'cs-notice-item', role: 'listitem', key: notice.eventId },
            h('span', { className: 'cs-notice-dot', 'aria-hidden': true }),
            h('div', { className: 'cs-notice-body' },
              h('div', { className: 'cs-notice-title' }, t('backfillDone')),
              h('p', { className: 'cs-notice-desc' }, parts.join(' · '))),
            h('span', { className: `cs-notice-tag${notice.readAt > 0 ? ' is-read' : ' is-unread'}` },
              t(notice.readAt > 0 ? 'backfillNoticeRead' : 'backfillNoticeUnread')))
        }))
    }

    /** 通知记录时间按 Host 本地时区显示为 YYYY-MM-DD HH:mm。 */
    function formatNoticeTime(value, showSeconds = false) {
      const time = Number(value)
      if (!Number.isFinite(time) || time <= 0) return '—'
      const date = new Date(time)
      const pad = (part) => String(part).padStart(2, '0')
      const minute = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
      return showSeconds ? `${minute}:${pad(date.getSeconds())}` : minute
    }

    /**
     * 通用自定义下拉：开合、选中与键盘焦点都由组件自身状态驱动。
     * 外部只读写 value，并通过 onChange(value) 复用原有业务处理，不再依赖原生事件。
     * menuVariant='grid' 时用两列网格一次展示全部选项；placement='top' 时向上弹出，
     * 为热力图等选项较多的范围菜单预留同一套接口。
     */
    function normalizeSelectOptions(options) {
      if (!Array.isArray(options)) return []
      return options.map((option, index) => {
        if (option !== null && typeof option === 'object') {
          return {
            value: option.value,
            label: option.label === undefined || option.label === null ? String(option.value) : String(option.label),
            disabled: option.disabled === true,
            span: option.span === 2 ? 2 : 1,
            key: option.key === undefined ? index : option.key,
          }
        }
        return { value: option, label: String(option), disabled: false, span: 1, key: index }
      })
    }

    function selectOptionIndex(options, value) {
      return options.findIndex((option) => String(option.value) === String(value))
    }

    function selectLabelOf(options, value) {
      const index = selectOptionIndex(options, value)
      return index >= 0 ? options[index].label : ''
    }

    function nextSelectIndex(options, index, step) {
      const count = options.length
      if (count === 0) return -1
      let cursor = index >= 0 ? index : step > 0 ? -1 : 0
      for (let hop = 0; hop < count; hop += 1) {
        cursor = (cursor + step + count) % count
        if (!options[cursor].disabled) return cursor
      }
      return -1
    }

    function edgeSelectIndex(options, edge) {
      if (edge === 'last') {
        for (let index = options.length - 1; index >= 0; index -= 1) {
          if (!options[index].disabled) return index
        }
        return -1
      }
      return options.findIndex((option) => !option.disabled)
    }

    function isSelectOutside(root, target) {
      if (root === null || root === undefined || typeof root.contains !== 'function') return true
      if (target === null || target === undefined) return true
      return !root.contains(target)
    }

    function createSelectOutsideHandler(rootRef, close) {
      return (event) => {
        if (isSelectOutside(rootRef?.current ?? null, event?.target ?? null)) close()
      }
    }

    let selectIdSequence = 0

    function Select(props) {
      const options = normalizeSelectOptions(props.options)
      const selectedIndex = selectOptionIndex(options, props.value)
      const [open, setOpen] = React.useState(false)
      const [activeIndex, setActiveIndex] = React.useState(selectedIndex >= 0 ? selectedIndex : edgeSelectIndex(options, 'first'))
      const rootRef = React.useRef(null)
      const triggerRef = React.useRef(null)
      const menuRef = React.useRef(null)
      const menuVisible = useSurfaceFade(open, menuRef)
      const [position, setPosition] = React.useState(null)
      const idRef = React.useRef(null)
      if (idRef.current === null) idRef.current = `cs-select-${++selectIdSequence}`
      const menuId = `${idRef.current}-menu`
      const optionId = (index) => `${idRef.current}-option-${index}`

      React.useEffect(() => {
        if (!open || typeof document === 'undefined') return undefined
        const handle = createSelectOutsideHandler(rootRef, () => setOpen(false))
        document.addEventListener('pointerdown', handle, true)
        return () => document.removeEventListener('pointerdown', handle, true)
      }, [open])

      // 菜单固定到视口：打开后量一次尺寸，按触发器位置夹取；上方空间不足时自动翻到下方。
      React.useEffect(() => {
        if (!open || typeof window === 'undefined') return undefined
        const trigger = triggerRef.current
        const menu = menuRef.current
        if (!trigger || !menu || typeof trigger.getBoundingClientRect !== 'function') return undefined
        const place = () => {
          const rect = trigger.getBoundingClientRect()
          // fixed 定位下百分比宽度会按视口计算；先算出菜单最终最小宽度，再用它
          // 参与夹取。否则首次展开会按未套用 minWidth 的自然宽度居中，视觉上偏右。
          const gridWidth = String(props.className ?? '').includes('heat-range-select') ? 178 : 224
          const minWidth = props.menuVariant === 'grid'
            ? Math.max(gridWidth, Math.round(rect.width))
            : Math.max(0, Math.round(rect.width))
          const next = clampTipPosition(
            { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            { width: Math.max(menu.offsetWidth ?? 0, minWidth), height: menu.offsetHeight ?? 0 },
            { width: window.innerWidth ?? 0, height: window.innerHeight ?? 0 },
            { gap: 6, prefer: props.placement === 'top' ? 'top' : 'bottom' },
          )
          setPosition({ ...next, minWidth })
        }
        place()
        if (typeof window.addEventListener === 'function') window.addEventListener('resize', place)
        return () => {
          if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', place)
        }
      }, [open, props.placement])

      const openMenu = () => {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : edgeSelectIndex(options, 'first'))
        setOpen(true)
      }
      const closeMenu = () => setOpen(false)
      const choose = (option) => {
        setOpen(false)
        if (String(option.value) !== String(props.value)) props.onChange?.(option.value)
        if (triggerRef.current && typeof triggerRef.current.focus === 'function') triggerRef.current.focus()
      }
      const onKeyDown = (event) => {
        if (props.disabled === true) return
        const key = event.key
        if (key === 'Escape') {
          if (open) {
            event.preventDefault()
            closeMenu()
          }
          return
        }
        if (key === 'Tab') {
          if (open) setOpen(false)
          return
        }
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          event.preventDefault()
          if (!open) openMenu()
          else setActiveIndex((index) => nextSelectIndex(options, index, key === 'ArrowDown' ? 1 : -1))
          return
        }
        if (key === 'Home' || key === 'End') {
          if (!open) return
          event.preventDefault()
          setActiveIndex(edgeSelectIndex(options, key === 'Home' ? 'first' : 'last'))
          return
        }
        if (key === 'Enter' || key === ' ') {
          event.preventDefault()
          if (!open) openMenu()
          else if (activeIndex >= 0 && options[activeIndex] && !options[activeIndex].disabled) choose(options[activeIndex])
        }
      }

      return h('div', {
        className: `cs-select${props.placement === 'top' ? ' is-top' : ''}${props.menuVariant === 'grid' ? ' is-grid' : ''}${props.className ? ` ${props.className}` : ''}`,
        ref: rootRef,
      },
        h('button', {
          type: 'button',
          ref: triggerRef,
          className: 'cs-select-btn',
          disabled: props.disabled === true,
          'aria-label': props.ariaLabel,
          'aria-haspopup': 'listbox',
          'aria-expanded': open,
          'aria-controls': menuId,
          'aria-activedescendant': open && activeIndex >= 0 ? optionId(activeIndex) : undefined,
          onClick: () => {
            if (props.disabled === true) return
            if (open) closeMenu()
            else openMenu()
          },
          onKeyDown,
        },
        h('span', { className: 'cs-select-val' }, selectLabelOf(options, props.value)),
        h('span', { className: 'cs-chev', 'aria-hidden': true })),
        h('div', {
          id: menuId,
          ref: menuRef,
          className: `cs-select-menu${props.menuVariant === 'grid' ? ' is-grid' : ''}`,
          role: 'listbox',
          'aria-label': props.ariaLabel,
          'data-placement': position?.placement ?? (props.placement === 'top' ? 'top' : 'bottom'),
          hidden: !menuVisible,
          inert: open ? undefined : '',
          'aria-hidden': !open,
          // 位置未量出时压住显示，避免菜单在 (0,0) 闪一下。
          style: position
            ? { left: `${position.left}px`, top: `${position.top}px`, minWidth: `${position.minWidth}px` }
            : { left: '0px', top: '0px', visibility: 'hidden' },
        }, options.map((option, index) => h('button', {
          key: option.key,
          id: optionId(index),
          type: 'button',
          role: 'option',
          tabIndex: -1,
          disabled: option.disabled,
          className: `cs-opt${String(option.value) === String(props.value) ? ' is-on' : ''}${index === activeIndex ? ' is-active' : ''}${props.menuVariant === 'grid' && option.span === 2 ? ' is-span-2' : ''}`,
          'aria-selected': String(option.value) === String(props.value),
          onMouseEnter: () => { if (!option.disabled) setActiveIndex(index) },
          onClick: () => choose(option),
        },
        h('span', { className: 'cs-opt-label' }, option.label),
        String(option.value) === String(props.value)
          ? h('span', { className: 'cs-opt-check', 'aria-hidden': true }, '✓')
          : null))))
    }

    /**
     * 数字格式选择区：六种格式共用两列布局，说明与示例就近呈现。
     */
    function renderDurationFormatSection(t, draftFormat, options = {}) {
      const current = normalizeDurationFormat(draftFormat)
      const disabled = options.disabled === true
      return h('section', { className: 'cs-settings-group cs-format-section' },
        h('div', { className: 'cs-format-head' },
          h('div', { className: 'cs-format-heading' },
            h('h3', null, t('settingsSectionFormat')),
            h('p', { className: 'cs-settings-row-hint' }, t('settingsFormatHint'))),
          !options.sidebarPreview ? h('div', { className: 'cs-format-preview', 'aria-live': 'polite' },
            h('span', null, t('formatPreviewLabel')),
            h('b', { key: current, className: 'cs-format-preview-value', 'data-format': current }, formatDuration(DURATION_FORMAT_SAMPLE_MS, current))) : null),
        h('div', {
          className: 'cs-format-grid',
          role: 'radiogroup',
          'aria-label': t('settingsSectionFormat'),
        }, DURATION_FORMAT_ORDER.map((format) => {
          const selected = current === format
          return h('button', {
            key: format,
            type: 'button',
            role: 'radio',
            'aria-checked': selected,
            title: t(format === 'decimal' ? 'formatDecimalDetail' : durationFormatHintKey(format)),
            className: `cs-format-opt${selected ? ' is-on' : ''}`,
            disabled,
            onClick: () => options.onSelect?.(format),
          },
          h('b', null, formatDuration(DURATION_FORMAT_SAMPLE_MS, format)),
          h('i', { className: 'cs-format-divider', 'aria-hidden': true }),
          h('span', null, t(durationFormatHintKey(format))))
        })),
        options.sidebarPreview ? h('div', { className: 'cs-format-live' },
          h('div', { className: 'cs-format-live-value', 'aria-live': 'polite' }, h('span', null, t('formatPreviewLabel')),
            h('b', { key: current, className: 'cs-format-preview-value' }, formatDuration(DURATION_FORMAT_SAMPLE_MS, current))),
          h('div', { className: 'cs-format-sidebar' }, h('span', null, t('settingsSidebarPreview')), options.sidebarPreview)) : null,
        h('p', { className: 'cs-format-shared' }, t('settingsFormatShared')))
    }

    /**
     * settings.section 设置页。表单草稿只是瞬时 UI 状态：初始值从 Host 读取，
     * 保存后以 Host 返回值为准，不写 localStorage、不缓存任何业务状态。
     */
    function createSettingsSection(ctx) {
      return function DshTimespanSettingsSection(props) {
        const t = props?.t ?? ((key) => key)
        // 语言切换后这一页自己也要重渲染：标题、标签与提示都来自字典。
        useLanguageRevision()
        const editor = useSettingsEditor(ctx)
        const { draft, phase, busy, resetting, resetStep } = editor
        const message = editor.messageKey ? t(editor.messageKey) : ''
        const hoverTip = useHoverTip()
        const [loadNonce, setLoadNonce] = React.useState(0)
        const [noticeState, setNoticeState] = React.useState({ status: 'loading', data: null })
        React.useEffect(() => subscribeSettingsChanged(() => setLoadNonce((value) => value + 1)), [])

        // 通知记录与设置分开加载：旧 Host 没有这个读方法时，设置表单仍可使用。
        React.useEffect(() => {
          let active = true
          setNoticeState((previous) => ({ ...previous, status: 'loading' }))
          callHost(ctx, 'getBackfillStatus', {})
            .then((value) => {
              if (!active) return
              setNoticeState({ status: 'ready', data: normalizeBackfill(value) })
            })
            .catch(() => {
              if (!active) return
              setNoticeState({ status: 'error', data: null })
            })
          return () => { active = false }
        }, [ctx, loadNonce])

        const loadFailed = phase === 'load-error'
        const statusClass = `cs-settings-status${phase === 'error' || loadFailed ? ' is-error' : ''}`

        return h('div', { className: 'cs-settings' },
          h('style', null, DSH_TIMESPAN_SETTINGS_CSS),
          h('div', { className: 'cs-settings-inner' },
            h('header', { className: 'cs-settings-header' },
              h('div', { className: 'cs-settings-heading' },
                h('h2', { className: 'cs-settings-title' }, t('settingsTitle')),
                h('p', { className: 'cs-settings-hint' }, t('settingsHint'))),
              h('nav', { className: 'cs-settings-links', 'aria-label': t('settingsLinksLabel') },
                [
                  ['github', PROJECT_REPOSITORY_URL, 'settingsRepoAction'],
                  ['issue', PROJECT_ISSUES_URL, 'settingsIssueAction'],
                  ['star', PROJECT_REPOSITORY_URL, 'settingsStarAction'],
                ].map(([icon, href, labelKey]) => h('a', {
                  key: icon, className: `cs-settings-link is-${icon}`, href, target: '_blank',
                  rel: 'noreferrer noopener', 'aria-label': t(labelKey),
                  ...hoverTipProps(hoverTip, t(labelKey)),
                }, h(DetailGlyph, { name: icon, size: 17 }))))),
            h('section', { className: 'cs-settings-group' },
              ...renderBasicSettingsBody(t, draft, busy, editor.patch)),
            renderDurationFormatSection(t, draft?.durationFormat, {
              disabled: busy,
              onSelect: (value) => editor.patch('durationFormat', value),
            }),
            h(TimeToolsSettings, { ctx, t, draft, busy, onPatch: editor.patch }),
            h('section', { className: 'cs-settings-group cs-settings-reset-group' },
              ...renderResetSettingsBody(t, {
                disabled: busy,
                resetting,
                resetStep,
                onRequest: editor.requestReset,
                onCancel: editor.cancelReset,
                onReset: editor.reset,
              })),
            h('section', { className: 'cs-settings-group' },
              h('h3', null, t('settingsSectionNotices')),
              noticeState.status === 'error'
                ? h('p', { className: 'cs-notice-empty' }, t('backfillNoticeUnavailable'))
                : noticeState.data === null
                  ? h('p', { className: 'cs-notice-empty' }, t('loading'))
                  : renderBackfillNotices(noticeState.data, t)),
            h('div', { className: 'cs-settings-footer' },
              loadFailed || editor.messageKey === 'settingsSaveError'
                ? h('button', {
                    type: 'button', className: 'cs-btn', onClick: loadFailed ? () => { void editor.reload(); setLoadNonce((value) => value + 1) } : editor.retrySave,
                  }, t('settingsRetry'))
                : null,
              message ? h('span', { className: statusClass, role: 'status' }, message) : null)),
            h(HoverTip, { tip: hoverTip.tip, id: 'dsh-timespan-settings-hover-tip' }))
      }
    }

    function modelCatalogOptions(catalog, draft, t) {
      const providers = Array.isArray(catalog?.groups) ? catalog.groups.filter((row) => typeof row?.id === 'string') : []
      const failures = Array.isArray(catalog?.failures) ? catalog.failures : []
      const provider = draft?.analysisProvider ?? ''
      const model = draft?.analysisModel ?? ''
      const selected = providers.find((row) => row.id === provider)
      const models = Array.isArray(selected?.models) ? selected.models.filter((row) => typeof row?.id === 'string') : []
      function options(rows, current, placeholder) {
        return [
          { value: '', label: t(placeholder) },
          ...rows.map((row) => ({ value: row.id, label: row.name || row.id })),
          ...(current && !rows.some((row) => row.id === current) ? [{ value: current, label: current, disabled: true }] : []),
        ]
      }
      return {
        provider, model, providers, models, failures,
        providerOptions: options(providers, provider, 'analysisChooseProvider'),
        modelOptions: options(models, model, 'analysisChooseModel'),
        providerMissing: Boolean(provider && !selected),
        modelMissing: Boolean(selected && model && !models.some((row) => row.id === model)),
      }
    }

    /** 分析模型：先选 Provider 再选模型，目录可独立刷新。 */
    function AnalysisModelSettings({ ctx, t, draft, busy, onPatch }) {
      const [catalog, setCatalog] = React.useState({ status: 'loading', value: null })
      const [revision, setRevision] = React.useState(0)
      React.useEffect(() => {
        let active = true
        setCatalog((previous) => ({ ...previous, status: 'loading' }))
        callHost(ctx, 'getAnalysisModels', {}).then((value) => {
          if (!Array.isArray(value?.groups)) throw new Error('模型目录无效')
          if (active) setCatalog({ status: 'ready', value })
        }).catch(() => {
          if (active) setCatalog((previous) => ({ ...previous, status: 'error' }))
        })
        return () => { active = false }
      }, [ctx, revision])
      const {
        provider, model, providers, models, failures, providerOptions, modelOptions, providerMissing, modelMissing,
      } = modelCatalogOptions(catalog.value, draft, t)
      const ready = catalog.status === 'ready'
      const selectedError = providerMissing ? 'analysisSavedProviderMissing' : modelMissing ? 'analysisSavedModelMissing' : ''
      const field = (label, value, options, disabled, onChange) => h('div', { className: 'cs-analysis-field' },
        h('span', null, t(label)), h(Select, { value, options, disabled, ariaLabel: t(label), onChange }))
      return h('section', { className: 'cs-analysis-model-settings' },
        h('div', { className: 'cs-tools-settings-head' },
          h('div', null, h('h3', null, t('settingsAnalysisTitle')), h('p', { className: 'cs-settings-row-hint' }, t('settingsAnalysisHint'))),
          h('button', {
            type: 'button', className: 'cs-btn cs-model-catalog-refresh', disabled: catalog.status === 'loading',
            onClick: () => setRevision((value) => value + 1),
          }, t('analysisCatalogRefresh'))),
        h('div', { className: 'cs-analysis-model-fields' },
          field('analysisProvider', provider, providerOptions, busy || !ready || !providers.length, (value) => onPatch('analysisProvider', value)),
          field('analysisModel', model, modelOptions, busy || !ready || !models.length, (value) => onPatch('analysisModel', value))),
        !ready ? h('p', { className: `cs-settings-status${catalog.status === 'error' ? ' is-error' : ''}`, role: 'status' },
          t(catalog.status === 'error' ? 'analysisCatalogError' : 'analysisCatalogLoading')) : null,
        ready && selectedError ? h('p', { className: 'cs-settings-status is-error', role: 'status' }, t(selectedError)) : null,
        ready && failures.length ? h('p', { className: 'cs-settings-row-hint' },
          t('analysisCatalogPartial').replace('{providers}', failures.map((row) => row.name || row.id).join(' · '))) : null,
        ready && !providers.length && !failures.length ? h('p', { className: 'cs-settings-row-hint' }, t('analysisCatalogEmpty')) : null)
    }

    /** 悬浮窗与到期提醒：开关与说明按「显示 / 提醒」上下排列，设置板内与模型选择并排。 */
    function FloatingTimerSettings({ t, draft, busy, onPatch }) {
      return h('section', { className: 'cs-timer-reminder-settings' },
        h('h3', null, t('settingsFloatingTitle')),
        h('label', { className: 'cs-settings-switch' },
          h('input', { type: 'checkbox', disabled: busy, checked: draft?.floatingEnabled !== false,
            onChange: (event) => onPatch('floatingEnabled', event.target.checked),
          }), t('settingsFloatingEnabled')),
        h('p', { className: 'cs-settings-row-hint' }, t('settingsFloatingEnabledHint')),
        h('label', { className: 'cs-settings-switch' },
          h('input', { type: 'checkbox', disabled: busy, checked: draft?.floatingShowClock === true,
            onChange: (event) => onPatch('floatingShowClock', event.target.checked),
          }), t('settingsFloatingClock')),
        h('p', { className: 'cs-settings-row-hint' }, t('settingsFloatingHint')),
        h('h3', null, t('settingsTimerTitle')),
        h('label', { className: 'cs-settings-switch' },
          h('input', { type: 'checkbox', disabled: busy, checked: draft?.timerSound !== false,
            onChange: (event) => onPatch('timerSound', event.target.checked),
          }), t('settingsTimerSound')),
        h('p', { className: 'cs-settings-row-hint' }, t('settingsTimerSoundHint')))
    }

    /** 分析模型与提醒上下排在同一组里；设置板中由外层卡片横向分成两栏。 */
    function TimeToolsSettings(props) {
      return h('div', { className: 'cs-time-tools-settings' },
        h(AnalysisModelSettings, props),
        h(FloatingTimerSettings, props))
    }

    function settingsRow(t, labelKey, hintKey, ...controls) {
      return h('div', { className: 'cs-settings-row' },
        h('div', null,
          h('div', { className: 'cs-settings-label' }, t(labelKey)),
          h('p', { className: 'cs-settings-row-hint' }, t(hintKey))),
        h('div', { className: 'cs-settings-control' }, ...controls))
    }

    /**
     * 统计口径、明细展示与侧栏入口合并成一张紧凑列表：每项一行、标签与控件
     * 对齐，避免 2×2 大卡把四个小开关撑成整页最重的区块。两套设置界面共用。
     */
    function renderBasicSettingsBody(t, draft, busy, onPatch, options = {}) {
      const idleOptions = Array.from({ length: 15 }, (_, index) => ({
        value: String(index + 1), label: `${index + 1} ${t('settingsIdleUnit')}`,
      }))
      // DSH 设置页与插件自己的设置面板共用同一套紧凑下拉，避免默认样式在宽容器里被拉满。
      const selectClass = options.selectClass ?? 'cs-settings-select'
      const row = (t, labelKey, hintKey, ...controls) => options.split
        ? h('div', { className: 'cs-settings-row' },
            h('div', { className: 'cs-settings-label' }, t(labelKey),
              h('span', { className: 'cs-row-info' }, renderInfo(t(hintKey)))),
            h('div', { className: 'cs-settings-control' }, ...controls))
        : settingsRow(t, labelKey, hintKey, ...controls)
      const rows = [
        // 语言放第一行：它决定这一页所有文案用哪套字典，先选语言再看其余项最顺。
        row(t, 'settingsLanguageLabel', 'settingsLanguageHint',
          h(Select, {
            value: normalizeLanguage(draft?.language),
            options: LANGUAGE_OPTIONS,
            disabled: busy,
            className: selectClass,
            ariaLabel: t('settingsLanguageLabel'),
            onChange: (value) => onPatch?.('language', normalizeLanguage(value)),
          })),
        row(t, 'settingsIdleLabel', 'settingsIdleHint',
          h(Select, {
            value: draft?.idleThresholdMinutes ?? '5',
            options: idleOptions,
            disabled: busy,
            className: selectClass,
            ariaLabel: t('settingsIdleLabel'),
            onChange: (value) => onPatch?.('idleThresholdMinutes', value),
          })),
        row(t, 'settingsWeekLabel', 'settingsWeekHint',
          h(Select, {
            value: draft?.weekStartsOn ?? '1',
            options: [
              { value: '1', label: t('settingsWeekMonday') },
              { value: '7', label: t('settingsWeekSunday') },
            ],
            disabled: busy,
            className: selectClass,
            ariaLabel: t('settingsWeekLabel'),
            onChange: (value) => onPatch?.('weekStartsOn', value === '7' ? '7' : '1'),
          })),
        row(t, 'settingsSubagentLabel', 'settingsSubagentHint',
          h('label', { className: 'cs-settings-switch' },
            h('input', {
              type: 'checkbox',
              'aria-label': t('settingsSubagentLabel'),
              checked: draft?.showSubagents !== false,
              disabled: busy,
              onChange: (event) => onPatch?.('showSubagents', event?.target?.checked === true),
            }),
            h('span', null, draft?.showSubagents === false ? t('settingsSubagentOff') : t('settingsSubagentOn')))),
        row(t, 'settingsSidebarNameLabel', 'settingsSidebarNameHint',
          h('label', { className: 'cs-settings-switch' },
            h('input', {
              type: 'checkbox',
              'aria-label': t('settingsSidebarNameLabel'),
              checked: draft?.sidebarShowName === true,
              disabled: busy,
              onChange: (event) => onPatch?.('sidebarShowName', event?.target?.checked === true),
            }),
            h('span', null, draft?.sidebarShowName === true ? t('settingsSidebarNameOn') : t('settingsSidebarNameOff')))),
        row(t, 'settingsSidebarDotLabel', 'settingsSidebarDotHint',
          h('label', { className: 'cs-settings-switch' },
            h('input', {
              type: 'checkbox',
              'aria-label': t('settingsSidebarDotLabel'),
              checked: draft?.sidebarDotVisible !== false,
              disabled: busy,
              onChange: (event) => onPatch?.('sidebarDotVisible', event?.target?.checked === true),
            }),
            h('span', null, draft?.sidebarDotVisible === false ? t('settingsSidebarDotOff') : t('settingsSidebarDotOn')))),
        row(t, 'settingsSidebarDotPositionLabel', 'settingsSidebarDotPositionHint',
          h(Select, {
            value: normalizeSidebarDotPosition(draft?.sidebarDotPosition),
            options: [
              { value: 'inline', label: t('settingsSidebarDotPositionInline') },
              { value: 'end', label: t('settingsSidebarDotPositionEnd') },
            ],
            disabled: busy,
            className: selectClass,
            ariaLabel: t('settingsSidebarDotPositionLabel'),
            onChange: (value) => onPatch?.('sidebarDotPosition', normalizeSidebarDotPosition(value)),
          })),
        row(t, 'settingsSidebarDurationLabel', 'settingsSidebarDurationHint',
          h(Select, {
            value: normalizeSidebarDuration(draft?.sidebarDuration),
            options: [
              { value: 'online', label: t('sidebarDurationOnline') },
              { value: 'active', label: t('sidebarDurationActive') },
              { value: 'task', label: t('sidebarDurationTask') },
            ],
            disabled: busy,
            className: selectClass,
            ariaLabel: t('settingsSidebarDurationLabel'),
            onChange: (value) => onPatch?.('sidebarDuration', normalizeSidebarDuration(value)),
          })),
      ]
      return [
        h('div', { className: 'cs-settings-card-head' },
          h('div', null,
            h('h3', null, t('settingsSectionBasics')),
            h('p', { className: 'cs-settings-card-sub' }, t('settingsBasicsHint'))),
          options.status ?? null),
        options.split ? h('div', { className: 'cs-settings-sections' },
          h('div', { className: 'cs-settings-list' }, h('h4', null, t('settingsRulesGroup')), ...rows.slice(0, 4)),
          h('div', { className: 'cs-settings-list' }, h('h4', null, t('settingsSidebarGroup')), ...[7, 5, 6, 4].map((index) => rows[index])))
          : h('div', { className: 'cs-settings-list' }, ...rows),
      ]
    }

    /**
     * 复位图标：逆时针圆环箭头，用在「恢复初始设置」按钮左侧。
     * 路径按 24 画布的通用形状写好，再整体缩放进 16 viewBox：这样描边宽度与
     * 其它图标一致（约 1.45），端点圆角不会被压扁。颜色跟随按钮文字。
     */
    function resetIcon() {
      return h('svg', {
        className: 'cs-reset-icon', viewBox: '0 0 16 16', width: 15, height: 15,
        fill: 'none', stroke: 'currentColor', 'aria-hidden': true,
      },
      h('g', { transform: 'translate(0 -0.6) scale(0.667)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M3 2v6h6' }),
        h('path', { d: 'M3.51 15a9 9 0 1 0 2.13-9.36L3 8' })))
    }

    /**
     * 初始化设置：恢复 Host 预设与浏览器本地外观。按钮先展开二次确认，
     * 不用浏览器原生 confirm，保持两套设置界面的视觉与键盘行为一致。
     */
    function renderResetSettingsBody(t, options = {}) {
      const disabled = options.disabled === true || options.resetting === true
      return [
        h('h3', null, t('settingsResetTitle')),
        h('p', { className: 'cs-settings-row-hint' }, t('settingsResetHint')),
        h(ContentTransition, { identity: options.resetStep === true, retain: true }, options.resetStep === true
          ? h('div', {
              className: 'cs-settings-reset-confirm',
              role: 'alertdialog',
              'aria-label': t('settingsResetConfirmTitle'),
            },
            h('strong', null, t('settingsResetConfirmTitle')),
            h('p', null, t('settingsResetConfirmHint')),
            h('div', { className: 'cs-settings-reset-actions' },
              h('button', {
                type: 'button', className: 'cs-btn', disabled,
                onClick: () => options.onCancel?.(),
              }, t('settingsResetCancel')),
              h('button', {
                type: 'button', className: 'cs-btn is-danger is-solid', disabled,
                onClick: () => options.onReset?.(),
              }, options.resetting === true ? t('loading') : t('settingsResetConfirm'))))
          : h('div', { className: 'cs-settings-reset-actions' },
              h('button', {
                type: 'button', className: 'cs-btn is-icon', disabled,
                onClick: () => options.onRequest?.(),
              }, resetIcon(), h('span', null, t('settingsResetButton'))))),
      ]
    }

    /* ============================ 次级导航与五视图 ============================ */

    /** 非法视图名（含旧 sessionStorage 脏值）回落概览。 */
    function normalizeView(value) {
      return VIEWS.includes(value) ? value : 'overview'
    }

    /** 首屏只认 hero / trend / heatmap；其它（含旧脏值、大小写错误）一律回落普通概览。 */
    function normalizeFocus(value) {
      return FOCUS_VALUES.includes(value) ? value : null
    }

    /** 默认存储：浏览器本地设置；隐私模式下取不到时按无存储处理。 */
    function defaultFocusStorage() {
      try {
        return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
      } catch {
        return null
      }
    }

    /** 读取首屏状态；storage 缺省用 window.localStorage，测试可注入假存储。 */
    function readStoredFocus(storage) {
      const store = storage === undefined ? defaultFocusStorage() : storage
      if (store === null || store === undefined || typeof store.getItem !== 'function') return null
      try {
        return normalizeFocus(store.getItem(FOCUS_KEY))
      } catch {
        return null
      }
    }

    /** 写回首屏状态；null / undefined / 非法值删除存储，异常静默忽略。 */
    function writeStoredFocus(storage, focus) {
      const store = storage === undefined ? defaultFocusStorage() : storage
      if (store === null || store === undefined) return
      try {
        const next = normalizeFocus(focus)
        if (next === null) {
          if (typeof store.removeItem === 'function') store.removeItem(FOCUS_KEY)
          return
        }
        if (typeof store.setItem === 'function') store.setItem(FOCUS_KEY, next)
      } catch {
        // 隐私模式或配额不足时只放弃持久化，页面内状态仍然生效。
      }
    }

    /** 首屏放大转场：正常 240ms，减少动效偏好下 0（直接到位）。 */
    function focusTransitionMs(reduced) {
      return reduced === true ? 0 : FOCUS_TRANSITION_MS
    }

    /** 首屏主指标只认五个时长项；非法旧值、脏值一律回落今日在线时长。 */
    function normalizeHeroMetric(value) {
      return HERO_METRIC_VALUES.includes(value) ? value : HERO_METRIC_DEFAULT
    }

    /**
     * 读取首屏主指标；storage 缺省用 window.localStorage，测试可注入假存储。
     * 旧版本默认「今日活跃」，升级到「今日在线」后用 v2 键存储；旧键里的
     * active 视作旧默认迁移为 online，其余显式选择（任务/周/月）仍然保留。
     */
    function readStoredHeroMetric(storage) {
      const store = storage === undefined ? defaultFocusStorage() : storage
      if (store === null || store === undefined || typeof store.getItem !== 'function') return HERO_METRIC_DEFAULT
      try {
        const current = store.getItem(HERO_METRIC_KEY)
        if (HERO_METRIC_VALUES.includes(current)) return current
        const legacy = store.getItem(HERO_METRIC_LEGACY_KEY)
        if (legacy === 'active') return HERO_METRIC_DEFAULT
        return normalizeHeroMetric(legacy)
      } catch {
        return HERO_METRIC_DEFAULT
      }
    }

    /** 写回首屏主指标；写入失败只放弃持久化，页面内切换仍然生效。 */
    function writeStoredHeroMetric(storage, value) {
      const store = storage === undefined ? defaultFocusStorage() : storage
      if (store === null || store === undefined) return
      try {
        if (typeof store.setItem === 'function') store.setItem(HERO_METRIC_KEY, normalizeHeroMetric(value))
      } catch {
        // 隐私模式或配额不足时静默放弃。
      }
    }

    /** ArrowLeft/Right 循环，Home/End 跳到首尾；其它按键保持当前索引。 */
    function nextTabIndex(currentIndex, key, count = VIEWS.length) {
      const size = Number.isInteger(count) && count > 0 ? count : VIEWS.length
      const index = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < size ? currentIndex : 0
      if (key === 'ArrowRight') return (index + 1) % size
      if (key === 'ArrowLeft') return (index + size - 1) % size
      if (key === 'Home') return 0
      if (key === 'End') return size - 1
      return index
    }

    /** tab 文案统一从语言包取，顺序与 VIEWS 一致。 */
    function viewLabels(t) {
      return [
        { value: 'overview', label: t('tabOverview') },
        { value: 'trend', label: t('tabTrend') },
        { value: 'details', label: t('tabDetails') },
        { value: 'analysis', label: t('tabAnalysis') },
        { value: 'settings', label: t('tabSettings') },
      ]
    }

    function prefersReducedMotion() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
    }

    /** 退出延时：与表面渐隐共用节奏，减少动效时直接到位。 */
    function viewTransitionDelay(reduced) {
      return reduced === true ? 0 : VIEW_EXIT_MS
    }

    /**
     * 分段导航：移动滑块由当前 tab 的 offsetLeft / offsetWidth 测量，
     * 在 view、语言或窗口尺寸变化时重算；键盘采用 roving tabindex。
     */
    function TabNav(props) {
      const t = props?.t ?? ((key) => key)
      const tabs = viewLabels(t)
      const current = normalizeView(props?.view)
      const tabRefs = React.useRef([])
      const thumbRef = React.useRef(null)
      const priorSelection = React.useRef(current)
      const [thumb, setThumb] = React.useState({ left: 0, width: 0 })

      const measure = (animate = false) => {
        const index = tabs.findIndex((tab) => tab.value === current)
        const node = tabRefs.current?.[index]
        if (!node) return
        const left = typeof node.offsetLeft === 'number' ? node.offsetLeft : 0
        const width = typeof node.offsetWidth === 'number' ? node.offsetWidth : 0
        if (thumbRef.current?.style) thumbRef.current.style.transition = animate ? '' : 'none'
        setThumb((previous) => previous.left === left && previous.width === width
          ? previous
          : { left, width })
      }

      React.useEffect(() => {
        measure(priorSelection.current !== current)
        priorSelection.current = current
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        const resize = () => measure(false)
        window.addEventListener('resize', resize)
        return () => window.removeEventListener('resize', resize)
      }, [current, props?.locale])

      const select = (value) => {
        if (value !== current) props?.onChange?.(value)
      }
      const handleKeyDown = (event, index) => {
        const key = event?.key
        if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') return
        if (typeof event.preventDefault === 'function') event.preventDefault()
        const next = nextTabIndex(index, key)
        select(tabs[next].value)
        const node = tabRefs.current?.[next]
        if (node && typeof node.focus === 'function') node.focus()
      }

      return h('nav', { className: 'cs-tabs', role: 'tablist', 'aria-label': t('tabsLabel') },
        h('span', {
          className: 'cs-tab-thumb',
          ref: thumbRef,
          'aria-hidden': true,
          style: { width: `${thumb.width}px`, transform: `translateX(${thumb.left}px)` },
        }),
        tabs.map((tab, index) => h('button', {
          key: tab.value,
          type: 'button',
          role: 'tab',
          id: `cs-tab-${tab.value}`,
          'aria-selected': tab.value === current,
          'aria-controls': `cs-view-${tab.value}`,
          tabIndex: tab.value === current ? 0 : -1,
          className: `cs-tab${tab.value === current ? ' is-active' : ''}`,
          ref: (node) => { tabRefs.current[index] = node },
          onClick: () => select(tab.value),
          onKeyDown: (event) => handleKeyDown(event, index),
        }, tab.label)))
    }

    /**
     * 最近会话条数公式：用同排行高减去卡片头/内边距与一行安全余量，再按单行高度取整。
     * 测量不可用时回落默认 5，避免首帧闪成其他条数。
     */
    function recentLimitForRow(options = {}) {
      const {
        rowHeight,
        rowPx = RECENT_ROW_FALLBACK_PX,
        chromePx = RECENT_CHROME_FALLBACK_PX,
        min = RECENT_SESSIONS_MIN,
        max = RECENT_SESSIONS_MAX,
        fallback = RECENT_SESSIONS_DEFAULT,
      } = options
      const height = Number(rowHeight)
      const row = Number(rowPx)
      const chrome = Number(chromePx)
      if (!Number.isFinite(height) || !Number.isFinite(row) || !Number.isFinite(chrome) ||
          height <= 0 || row <= 0 || chrome < 0) return fallback
      return Math.max(min, Math.min(max, Math.floor((height - chrome - RECENT_FIT_GAP_PX) / row)))
    }

    /** 从工作区明细扁平化会话，按最近活动取若干条（默认 5）。 */
    function flattenRecentSessions(data, limit = 5) {
      const rows = []
      for (const workspace of data?.workspaces ?? []) {
        for (const session of workspace?.sessions ?? []) {
          rows.push({ ...session, workspaceKey: workspace.key, workspaceTitle: workspace.workspaceTitle })
        }
      }
      rows.sort((left, right) => finite(right.lastActivityAt) - finite(left.lastActivityAt))
      return rows.slice(0, Math.max(0, Number.isFinite(limit) ? limit : 5))
    }

    /** 明细本地过滤：工作区名命中则整行保留；否则只保留会话名命中的会话。 */
    function filterWorkspaces(workspaces, query) {
      const list = Array.isArray(workspaces) ? workspaces : []
      const needle = String(query ?? '').trim().toLowerCase()
      if (needle === '') return list
      const matched = []
      for (const workspace of list) {
        if (String(workspace?.workspaceTitle ?? '').toLowerCase().includes(needle)) {
          matched.push(workspace)
          continue
        }
        const sessions = (workspace?.sessions ?? []).filter((session) =>
          String(session?.sessionTitle ?? '').toLowerCase().includes(needle))
        if (sessions.length > 0) matched.push({ ...workspace, sessions })
      }
      return matched
    }

    /** 搜索、状态与排序都从原始快照推导，不修改 Host 响应或另存排序后的列表。 */
    function selectDetailsWorkspaces(workspaces, query, status = 'all', sort = 'recent') {
      const metric = sort === 'task' ? 'taskMs' : sort === 'active' ? 'activeMs' : 'lastActivityAt'
      return filterWorkspaces(workspaces, query).map((workspace) => ({
        ...workspace,
        sessions: (workspace.sessions ?? [])
          .filter((session) => status !== 'running' || session.taskRunning === true)
          .sort((left, right) => finite(right[metric]) - finite(left[metric]) ||
            finite(right.lastActivityAt) - finite(left.lastActivityAt) ||
            String(left.sessionId).localeCompare(String(right.sessionId))),
      })).filter((workspace) => workspace.sessions.length > 0)
    }

    /** 累计明细与筛选结果同源；并发会话不会被误作时间并集。 */
    function summarizeDetailSessions(rows) {
      const result = { sessionCount: 0, activeMs: 0, taskMs: 0, taskCount: 0, runningCount: 0 }
      for (const row of rows) for (const session of row.sessions ?? []) {
        result.sessionCount += 1
        result.activeMs += Math.max(0, finite(session.activeMs))
        result.taskMs += Math.max(0, finite(session.taskMs))
        result.taskCount += Math.max(0, finite(session.taskCount))
        if (session.taskRunning === true) result.runningCount += 1
      }
      return result
    }

    function selectedDetailSession(rows, selection) {
      if (selection) {
        const exactWorkspace = rows.find((row) => row.key === selection.workspaceKey &&
          row.sessions.some((session) => session.sessionId === selection.sessionId))
        const workspace = exactWorkspace ?? (isRealSessionId(selection.sessionId)
          ? rows.find((row) => row.sessions.some((session) => session.sessionId === selection.sessionId)) : null)
        if (!workspace) return null
        const session = workspace.sessions.find((row) => row.sessionId === selection.sessionId)
        return { ...session, workspaceKey: workspace.key, workspaceTitle: workspace.workspaceTitle }
      }
      const workspace = rows.find((row) => row.sessions.length > 0)
      return workspace ? { ...workspace.sessions[0], workspaceKey: workspace.key, workspaceTitle: workspace.workspaceTitle } : null
    }

    /** 浏览状态只保存用户意图；列表、累计摘要、选择与展开都由当前范围快照派生。 */
    function sessionBrowserModel(browser, snapshot) {
      const data = snapshot.status === 'ready' ? snapshot.data : null
      const rows = selectDetailsWorkspaces(data?.workspaces, browser.query, browser.statusFilter, browser.sort)
      const session = selectedDetailSession(rows, browser.selection)
      const filtered = browser.query.trim() !== '' || browser.statusFilter === 'running'
      const saved = rows.some((row) => Object.hasOwn(browser.expanded, row.key))
      let expanded = saved ? browser.expanded
        : Object.fromEntries((filtered ? rows : rows.slice(0, 2)).map((row) => [row.key, true]))
      const target = browser.highlight ? selectedDetailSession(rows, browser.highlight) : null
      const highlight = target ? { ...browser.highlight, workspaceKey: target.workspaceKey } : null
      if (highlight) expanded = { ...expanded, [highlight.workspaceKey]: true }
      return {
        query: browser.query, statusFilter: browser.statusFilter, sort: browser.sort,
        detailsRange: browser.range, customRange: browser.customRange,
        selection: browser.selection, session, highlight, expanded,
        rows, summary: summarizeDetailSessions(rows), filtered,
        allOpen: rows.length > 0 && rows.every((row) => expanded[row.key] === true),
        runningCount: summarizeDetailSessions(data?.workspaces ?? []).runningCount,
        subagentByParent: groupSubagentTasks(data?.subagentTasks),
        range: data?.range, loadStatus: snapshot.status,
        openMessageKey: browser.openFallback ? 'detailsOpenFallback' : '',
        progressiveSessions: browser.range === 'all' && browser.customRange === null,
        visibleSessionCounts: browser.visibleCounts,
      }
    }

    /** 会话浏览统一管理范围取数和联动；界面只提交动作，不拼接展开表或批次数。 */
    function useSessionBrowser(ctx, { period, enabled, refreshMs, refreshNonce }) {
      const [stored, setBrowser] = React.useState(() => {
        let expanded = {}
        try {
          const value = JSON.parse(window.sessionStorage.getItem('dsh-timespan.expanded') || '{}')
          if (value && typeof value === 'object' && !Array.isArray(value)) expanded = value
        } catch {}
        return {
          period, range: detailsRangeForPeriod(period), customRange: null,
          query: '', statusFilter: 'all', sort: 'recent', selection: null,
          expanded, visibleCounts: {}, highlight: null, openFallback: false,
        }
      })
      // 周期变化的首帧就使用新范围，避免先以旧临时时段发起请求。
      let browser = stored
      if (browser.period !== period) {
        browser = { ...browser, period, range: detailsRangeForPeriod(period), customRange: null,
          selection: null, visibleCounts: {}, highlight: null, openFallback: false }
        setBrowser(browser)
      }
      const [retryNonce, setRetryNonce] = React.useState(0)
      const snapshot = useDashboard(ctx, 'day', refreshMs, `${refreshNonce}:${retryNonce}`, {
        view: 'details', enabled,
        range: browser.customRange ?? resolveDetailsRange(browser.range, Date.now()),
      })
      const model = sessionBrowserModel(browser, snapshot)
      React.useEffect(() => {
        try { window.sessionStorage.setItem('dsh-timespan.expanded', JSON.stringify(browser.expanded)) } catch {}
      }, [browser.expanded])
      React.useEffect(() => {
        const highlight = browser.highlight
        if (!enabled || !highlight?.located) return undefined
        const timer = window.setTimeout(() => setBrowser((previous) => previous.highlight === highlight
          ? { ...previous, highlight: null } : previous), 3000)
        return () => window.clearTimeout(timer)
      }, [enabled, browser.highlight])
      const actions = {
        search(query) {
          setBrowser((previous) => ({ ...previous, query, expanded: {}, highlight: null, openFallback: false }))
        },
        filter(statusFilter) {
          setBrowser((previous) => ({ ...previous, statusFilter, expanded: {}, highlight: null, openFallback: false }))
        },
        sort(sort) { setBrowser((previous) => ({ ...previous, sort })) },
        selectRange(value) {
          setBrowser((previous) => ({ ...previous, range: normalizeDetailsRange(value), customRange: null,
            selection: null, visibleCounts: {}, highlight: null, openFallback: false }))
        },
        openRange(range) {
          if (!Number.isFinite(range?.from) || !Number.isFinite(range?.to) || range.from >= range.to) return false
          setBrowser((previous) => ({ ...previous, customRange: { from: range.from, to: range.to },
            query: '', statusFilter: 'all', selection: null, visibleCounts: {}, highlight: null, openFallback: false }))
          return true
        },
        selectSession(session) {
          setBrowser((previous) => ({ ...previous,
            selection: { workspaceKey: session.workspaceKey, sessionId: session.sessionId },
            highlight: null, openFallback: false }))
        },
        revealSession(session) {
          if (!sessionIsOpenable(session)) return false
          setBrowser((previous) => ({ ...previous,
            ...(!enabled ? { query: '', statusFilter: 'all', customRange: null, range: 'all', visibleCounts: {} } : {}),
            // 入口可能来自旧快照；按真实会话 ID 在当前快照中重新确定工作区。
            selection: { sessionId: session.sessionId }, highlight: { sessionId: session.sessionId, located: false },
            openFallback: true }))
          return true
        },
        toggleWorkspace(key) {
          setBrowser((previous) => {
            const current = sessionBrowserModel(previous, snapshot)
            return { ...previous, expanded: { ...current.expanded, [key]: current.expanded[key] !== true }, highlight: null }
          })
        },
        toggleAll() {
          setBrowser((previous) => {
            const current = sessionBrowserModel(previous, snapshot)
            return { ...previous, expanded: Object.fromEntries(current.rows.map((row) => [row.key, !current.allOpen])), highlight: null }
          })
        },
        showMore(key) {
          setBrowser((previous) => {
            const row = sessionBrowserModel(previous, snapshot).rows.find((row) => row.key === key)
            if (!row) return previous
            const count = Number.isFinite(previous.visibleCounts[key]) ? previous.visibleCounts[key] : DETAILS_SESSION_INITIAL
            return { ...previous, visibleCounts: { ...previous.visibleCounts, [key]: Math.min(row.sessions.length, count + DETAILS_SESSION_STEP) } }
          })
        },
        markLocated() {
          setBrowser((previous) => {
            if (previous.highlight !== browser.highlight) return previous
            const current = sessionBrowserModel(previous, snapshot)
            if (!current.highlight || previous.highlight.located) return previous
            return { ...previous, expanded: current.expanded, highlight: { ...current.highlight, located: true } }
          })
        },
        clearHighlight() { setBrowser((previous) => previous.highlight ? { ...previous, highlight: null } : previous) },
        retry() { setRetryNonce((value) => value + 1) },
      }
      return { model, actions }
    }

    function renderSessionInspector(session, t, format, onOpenSession, selection, hoverTip) {
      if (!session) return h('aside', { id: 'cs-session-inspector', className: 'cs-session-inspector is-empty', 'aria-label': t('detailsInspector') },
        h(DetailGlyph, { name: 'sessions', size: 24 }),
        h('p', { role: 'status' }, t(selection ? 'detailsSelectionHidden' : 'detailsInspectorEmpty')))
      const rows = sessionBreakdownRows(session, t, format)
      const series = { breakdownModel: 'model', breakdownTool: 'tool', breakdownWait: 'wait', breakdownOther: 'other', notBroken: 'unknown' }
      const swatchClass = (row) => `cs-inspector-series is-${series[row.key]}`
      return h('aside', { id: 'cs-session-inspector', className: 'cs-session-inspector', 'aria-label': t('detailsInspector') },
        h('div', { className: 'cs-inspector-label' },
          h('span', { className: 'cs-card-icon has-tip' }, h(Info, {
            message: t('compositionInfo'), delay: 600, label: t('compositionInfo'),
            icon: h(DetailGlyph, { name: 'stats', size: 14 }), buttonClassName: 'cs-card-icon-btn',
          })),
          t('detailsInspector')),
        h('h3', null, session.sessionTitle ?? t('unknownSession')),
        h('div', { className: 'cs-inspector-workspace' }, session.workspaceTitle ?? t('unassigned'),
          session.taskRunning ? h('span', { className: 'cs-inspector-running' }, t('runningTag')) : null),
        h('strong', { className: 'cs-inspector-total' }, formatDuration(session.taskMs, format)),
        h('span', { className: 'cs-inspector-label' }, t('detailsTaskScope')),
        h(ChartReveal, { key: `${session.workspaceKey}:${session.sessionId}`, className: 'cs-inspector-breakdown', 'aria-hidden': true }, rows.map((row, index) =>
          h('i', { key: row.key, className: `${swatchClass(row)} cs-reveal-x`, style: { width: `${session.taskMs > 0 ? row.ms / session.taskMs * 100 : 0}%`, ...chartStagger(index, rows.length) } }))),
        h('dl', { className: 'cs-inspector-rows' }, rows.length > 0 ? rows.map((row) =>
          h('div', { key: row.key }, h('dt', null, h('i', { className: swatchClass(row), 'aria-hidden': true }), row.label), h('dd', null, row.value)))
          : h('div', null, h('dt', null, t('noTaskComposition')))),
        h('div', { className: 'cs-inspector-active' }, t('activeLabel'), h('b', null, formatDuration(session.activeMs, format))),
        sessionIsOpenable(session) && typeof onOpenSession === 'function'
          ? h('button', { type: 'button', className: 'cs-btn cs-inspector-open', onClick: () => onOpenSession(session) },
              t('openSession'), h(DetailGlyph, { name: 'open', size: 14 })) : null)
    }

    function trendPeak(trend, period, isZh) {
      if (!Array.isArray(trend) || trend.length === 0) return null
      let best = trend[0]
      for (const bucket of trend) {
        if (finite(bucket?.activeMs) > finite(best?.activeMs)) best = bucket
      }
      return { bucket: best, label: bucketLabel(best, period, isZh) }
    }

    /** 条状图首屏统计：峰值活跃、最活跃时段、活跃占比与任务时长。 */
    function trendFocusStats(data, period, isZh, format = 'hms') {
      const peak = trendPeak(data?.trend, period, isZh)
      return {
        peakMs: peak === null ? 0 : finite(peak.bucket.activeMs),
        peakLabel: peak === null ? '—' : peak.label,
        activeSharePct: activeSharePercent(data?.activeMs, data?.onlineMs),
        taskMs: finite(data?.taskMs),
      }
    }

    function renderCycles(data, t, period, onSelect, format = 'hms') {
      return h(SelectionGroup, { value: period, className: 'cs-cycles' },
        ['day', 'week', 'month'].map((item) =>
          renderCycleCard(t, item, data?.cycles?.[item] ?? { activeMs: 0, taskMs: 0, taskCount: 0 }, item === period, () => onSelect?.(item), format)))
    }

    /** 概览趋势卡底部的一条紧凑统计带，填住图表与卡片底边之间的空白。 */
    function renderTrendFoot(data, t, isZh, shownPeriod, format) {
      const stats = trendFocusStats(data, shownPeriod, isZh, format)
      const items = [
        { key: 'peak', label: t('peakActive'), value: formatDuration(stats.peakMs, format) },
        { key: 'period', label: t('peakPeriod'), value: stats.peakLabel },
        { key: 'task', label: t('taskLabel'), value: formatDuration(stats.taskMs, format) },
      ]
      return h('div', { className: 'cs-trend-foot' }, items.map((item) =>
        h('div', { className: 'cs-trend-foot-item', key: item.key },
          h('span', null, item.label),
          h('b', null, item.value))))
    }

    /** 趋势页右下的文字洞察：峰值、覆盖、集中度与任务占在线比。 */
    function trendInsightRows(data, t, isZh, shownPeriod, format) {
      const trend = Array.isArray(data?.trend) ? data.trend : []
      const observed = trend.filter((bucket) => bucket?.future !== true)
      const buckets = observed.length > 0 ? observed : trend
      const activeMs = buckets.reduce((sum, bucket) => sum + Math.max(0, finite(bucket?.activeMs)), 0)
      const activeBucketCount = buckets.filter((bucket) => finite(bucket?.activeMs) > 0).length
      const topThreeMs = buckets
        .map((bucket) => Math.max(0, finite(bucket?.activeMs)))
        .sort((left, right) => right - left)
        .slice(0, 3)
        .reduce((sum, value) => sum + value, 0)
      const concentration = activeMs > 0 ? Math.round((topThreeMs / activeMs) * 100) : 0
      const hasBuckets = buckets.length > 0
      const taskRatio = finite(data?.onlineMs) > 0
        ? Math.round((finite(data?.taskMs) / finite(data?.onlineMs)) * 100)
        : null
      const peak = trendPeak(trend, shownPeriod, isZh)
      return [
        {
          key: 'peak',
          label: t('trendInsightPeak'),
          value: peak === null || finite(peak.bucket.activeMs) <= 0
            ? '—'
            : `${peak.label} · ${formatDuration(peak.bucket.activeMs, format)}`,
        },
        {
          key: 'coverage',
          label: t('trendInsightCoverage'),
          value: hasBuckets ? `${activeBucketCount} / ${buckets.length}` : '—',
        },
        {
          key: 'concentration',
          label: t('trendInsightConcentration'),
          value: activeMs > 0 ? `${concentration}%` : '—',
        },
        {
          key: 'taskRatio',
          label: t('trendInsightTaskRatio'),
          value: taskRatio === null ? '—' : `${taskRatio}%`,
        },
      ]
    }

    function renderTrendBottom(data, t, isZh, shownPeriod, format, hoverTip, onOpenRange) {
      const buckets = Array.isArray(data?.trend) ? data.trend : []
      const max = Math.max(1, ...buckets.filter((bucket) => !bucket.future).map((bucket) => finite(bucket.activeMs)))
      const peak = trendPeak(buckets.filter((bucket) => !bucket.future), shownPeriod, isZh)
      const insights = trendInsightRows(data, t, isZh, shownPeriod, format)
      return h('div', { className: 'cs-trend-bottom' },
        h('section', { className: 'cs-card cs-trend-breakdown' },
          h('div', { className: 'cs-card-head' },
            renderCardTitle(t('trendBreakdownTitle'), 'clock',
              h('span', { className: 'cs-distribution-grain' }, t(shownPeriod === 'day' ? 'trendDistributionHour' : 'trendDistributionDay')),
              t('trendDistributionHint'))),
          buckets.length === 0 ? h('div', { className: 'cs-empty' }, t('trendBreakdownEmpty'))
            : h('div', { className: 'cs-distribution' },
                h(ChartReveal, { className: 'cs-distribution-strip', role: 'group', 'aria-label': t('trendBreakdownTitle') }, buckets.map((bucket, index) => {
                  const level = bucket.future || finite(bucket.activeMs) <= 0 ? 0 : Math.max(1, Math.ceil(finite(bucket.activeMs) / max * 5))
                  const tip = buildTrendTip(bucket, shownPeriod, t, isZh, format)
                  return h('span', { key: bucket.key, tabIndex: 0,
                    className: `cs-distribution-cell is-level-${level}${bucket.future ? ' is-future' : ''}`,
                    style: chartStagger(index, buckets.length),
                    onKeyDown: (event) => moveFocusByKey(event, '.cs-distribution-cell'),
                    'aria-label': `${tip.title} · ${tip.rows.map((row) => `${row.label} ${row.value}`).join(' · ')}`,
                    ...hoverTipProps(hoverTip, tip.title, tip.rows) },
                    h('i', { className: 'cs-distribution-fill cs-reveal-y', 'aria-hidden': true }))
                })),
                h('div', { className: 'cs-distribution-axis', 'aria-hidden': true },
                  [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1].map((index) =>
                    h('span', { key: index }, bucketLabel(buckets[index], shownPeriod, isZh))))),
          h('div', { className: 'cs-distribution-summary' }, h('span', null, t('trendInsightCoverage')), h('b', null, insights[1].value)),
          buckets.some((bucket) => bucket.future) ? h('span', { className: 'cs-distribution-future' }, t('trendFutureHint')) : null),
        h('section', { className: 'cs-card cs-trend-insights' },
          h('div', { className: 'cs-card-head' }, renderCardTitle(t('trendInsightsTitle'), 'insight', null, t('trendInsightsHint'))),
          h('div', { className: 'cs-trend-insight-list' }, [insights[0], insights[2]].map((item) =>
            h('div', { className: 'cs-trend-insight-row', key: item.key },
              h('span', { className: 'cs-insight-icon' }, h(DetailGlyph, { name: item.key === 'peak' ? 'clock' : 'trend', size: 16 })),
              h('div', null, h('span', null, item.label), h('b', null, item.value))))),
          peak && finite(peak.bucket.activeMs) > 0 && typeof onOpenRange === 'function'
            ? h('div', { className: 'cs-trend-insight-footer' },
                h('button', { type: 'button', className: 'cs-text-link cs-peak-sessions', onClick: () => onOpenRange({ from: peak.bucket.from, to: peak.bucket.to }) },
                  t('trendPeakSessions').replace('{range}', formatSelectedRange(peak.bucket, t, isZh).replace(`${t('detailsRangeSelected')} · `, '')), h(DetailGlyph, { name: 'open', size: 13 }))) : null))
    }

    function renderTrendCard(data, t, isZh, hoverTip, format, shownPeriod, options = {}) {
      const { focus = null, onToggleFocus } = options ?? {}
      const zoomable = typeof onToggleFocus === 'function'
      const isEmpty = !Array.isArray(data?.workspaces) || data.workspaces.length === 0
      const trendTitleKey = shownPeriod === 'day' ? 'trendDay' : shownPeriod === 'week' ? 'trendWeek' : 'trendMonth'
      return h('section', { className: `cs-card cs-trend-card${zoomable ? ' has-zoom' : ''}`, 'data-focus': 'trend' },
        h('div', { className: 'cs-card-head' },
          renderCardTitle(t(trendTitleKey), 'trend', null, t('moduleTipTrend')),
          h('div', { className: 'cs-legend' },
            h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-active' }), t('activeLabel')),
            h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-task' }), t('taskLabel'))),
          zoomable ? renderZoomButton({ t, focus, onToggleFocus, value: 'trend' }) : null),
        isEmpty
          ? h('div', { className: 'cs-empty' }, t('emptyDashboard'))
          : renderTrendChart(data.trend, shownPeriod, t, isZh, hoverTip?.tip,
              { onHover: hoverTip?.show, onLeave: hoverTip?.hide, showFuture: options.showFoot === true }, format),
        (zoomable || options.showFoot) && !isEmpty ? renderTrendFoot(data, t, isZh, shownPeriod, format) : null)
    }

    function renderStatBox(label, value) {
      return h('div', { className: 'cs-stat-box' }, h('span', null, label), h('b', null, value))
    }

    /** 标题换字时只交叉渐隐渐显，卡片框架、图例和图表实例保持挂载。 */
    function TextFade({ text }) {
      const [state, setState] = React.useState({ value: text, previous: null, key: 0 })
      React.useEffect(() => {
        if (text === state.value) return
        setState((current) => ({ value: text, previous: current.value, key: current.key + 1 }))
      }, [text, state.value])
      return h('span', { className: `cs-text-fade${state.previous === null ? '' : ' is-changing'}` },
        state.previous === null ? null : h('span', { key: `prev-${state.key}`, className: 'cs-text-fade-prev', 'aria-hidden': true }, state.previous),
        h('span', { key: `current-${state.key}`, className: 'cs-text-fade-current' }, state.value))
    }

    /**
     * 概览卡片标题：15px 线性图标只做识别锚点，不进入标题的可读文字。
     * 传 moduleTip 时图标变成悬停说明入口：停留片刻后浮出简短功能介绍，图标同时轻动。
     */
    function renderCardTitle(label, iconName, extra = null, moduleTip = null) {
      const glyph = h(DetailGlyph, { name: iconName, size: 15 })
      return h('div', { className: 'cs-card-heading' },
        h('h2', { className: 'cs-card-title' },
          h('span', { className: `cs-card-icon${moduleTip ? ' has-tip' : ''}` },
            moduleTip
              ? h(Info, {
                  message: moduleTip,
                  delay: 600,
                  icon: glyph,
                  label: moduleTip,
                  buttonClassName: 'cs-card-icon-btn',
                })
              : glyph),
          h(TextFade, { text: label })),
        extra)
    }

    /** 对角缩放图标：普通态两只外角朝外提示放大，首屏态同一对角的两只括号内收反扣，提示缩回。 */
    function zoomIcon(expanded) {
      const path = expanded
        ? 'M10 2v4h4M6 14v-4H2'
        : 'M9 2h5v5M7 14H2V9'
      return h('svg', {
        viewBox: '0 0 16 16',
        width: 16,
        height: 16,
        fill: 'none',
        'aria-hidden': true,
        focusable: 'false',
      }, h('path', {
        d: path,
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    /** 卡片右上角的纯图标按钮：点击把该区块设为首屏，再点缩回普通概览。 */
    function renderZoomButton(props) {
      const { t, focus, onToggleFocus, value = 'hero' } = props
      const active = focus === value
      return h('button', {
        type: 'button',
        className: `cs-zoom-btn${active ? ' is-on' : ''}`,
        'aria-label': active ? t('focusUnset') : t('focusSet'),
        'aria-pressed': active,
        onClick: () => onToggleFocus?.(value),
      }, zoomIcon(active))
    }

    /** 普通概览与放大页共用五种主指标的取值表。 */
    function heroMetricTable(data, t) {
      const day = data?.cycles?.day ?? {}
      const week = data?.cycles?.week ?? {}
      const month = data?.cycles?.month ?? {}
      return {
        active: { title: t('todayActive'), value: finite(day.activeMs ?? data?.activeMs) },
        online: { title: t('todayOnline'), value: finite(day.onlineMs ?? data?.onlineMs) },
        task: { title: t('todayTask'), value: finite(day.taskMs ?? data?.taskMs) },
        week: { title: t('heroMetricWeekTitle'), value: finite(week.activeMs) },
        month: { title: t('heroMetricMonthTitle'), value: finite(month.activeMs) },
      }
    }

    /** 五类时长归并为三种语义色：在线用信号深阶、任务用任务紫、其余活跃累计用活跃状态点色。 */
    function heroMetricTone(metric) {
      if (metric === 'online') return 'online'
      if (metric === 'task') return 'task'
      return 'active'
    }

    /** 活跃口径内再按周期细分图标：今日用脉冲线，本周在脉冲线右上叠数字 7，本月加日历框。 */
    function heroMetricGlyph(metric) {
      if (metric === 'week') return 'active-week'
      if (metric === 'month') return 'active-month'
      return heroMetricTone(metric)
    }

    /** 首屏主指标标签只补充口径信息；标题已说明今日、本周或本月时不再重复。 */
    function heroMetricTag(t, metric) {
      if (metric === 'active' || metric === 'task') return t('actualOccupied')
      return null
    }

    /** 主指标所属周期；周/月主指标的副信息必须同周期，避免和今日口径打架。 */
    function heroMetricCycle(data, metric) {
      if (metric === 'week') return data?.cycles?.week ?? {}
      if (metric === 'month') return data?.cycles?.month ?? {}
      return data?.cycles?.day ?? {}
    }

    /** 大数字下方两条只读副信息；今日主指标给另外两项今日数据，周/月给该周期在线与任务。 */
    function heroMetaItems(data, metric) {
      const day = data?.cycles?.day ?? {}
      if (metric === 'week') {
        return [['weekOnline', finite(data?.cycles?.week?.onlineMs)], ['weekTask', finite(data?.cycles?.week?.taskMs)]]
      }
      if (metric === 'month') {
        return [['monthOnline', finite(data?.cycles?.month?.onlineMs)], ['monthTask', finite(data?.cycles?.month?.taskMs)]]
      }
      const activeMs = finite(day.activeMs ?? data?.activeMs)
      const onlineMs = finite(day.onlineMs ?? data?.onlineMs)
      const taskMs = finite(day.taskMs ?? data?.taskMs)
      if (metric === 'active') return [['todayOnline', onlineMs], ['todayTask', taskMs]]
      if (metric === 'online') return [['todayActive', activeMs], ['todayTask', taskMs]]
      return [['todayOnline', onlineMs], ['todayActive', activeMs]]
    }

    /** 首屏主指标的任务次数同样跟随周期。 */
    function heroTaskCount(data, metric) {
      return finite(heroMetricCycle(data, metric)?.taskCount ?? data?.taskCount)
    }

    /**
     * 首屏占比圆环：在线与今日活跃读活跃÷在线，今日任务读任务÷在线，
     * 本周/本月活跃读该周期活跃÷该周期在线；任务口径使用任务紫。
     */
    function heroRingModel(data, t, metric) {
      const day = data?.cycles?.day ?? {}
      const week = data?.cycles?.week ?? {}
      const month = data?.cycles?.month ?? {}
      if (metric === 'task') {
        const taskMs = finite(day.taskMs ?? data?.taskMs)
        const onlineMs = finite(day.onlineMs ?? data?.onlineMs)
        return {
          percent: activeSharePercent(taskMs, onlineMs),
          label: t('taskShare'),
          numeratorLabel: t('taskLabel'),
          denominatorLabel: t('onlineLabel'),
          numeratorMs: taskMs,
          denominatorMs: onlineMs,
          tone: 'task',
        }
      }
      if (metric === 'week' || metric === 'month') {
        const cycle = metric === 'week' ? week : month
        const activeMs = finite(cycle.activeMs)
        const onlineMs = finite(cycle.onlineMs)
        return {
          percent: activeSharePercent(activeMs, onlineMs),
          label: metric === 'week' ? t('weekActiveShare') : t('monthActiveShare'),
          numeratorLabel: t('activeLabel'),
          denominatorLabel: t('onlineLabel'),
          numeratorMs: activeMs,
          denominatorMs: onlineMs,
          tone: 'active',
        }
      }
      const activeMs = finite(day.activeMs ?? data?.activeMs)
      const onlineMs = finite(day.onlineMs ?? data?.onlineMs)
      return {
        percent: activeSharePercent(activeMs, onlineMs),
        label: t('activeShare'),
        numeratorLabel: t('activeLabel'),
        denominatorLabel: t('onlineLabel'),
        numeratorMs: activeMs,
        denominatorMs: onlineMs,
        tone: 'active',
      }
    }

    /** 概览主指标跟随放大页；三个周期按钮切换下方的统计范围。 */
    function renderOverviewMetrics(props) {
      const { data, t, isZh, nowMs, period, onSelectPeriod, format = 'hms', focus, onToggleFocus, heroMetric } = props
      const metric = normalizeHeroMetric(heroMetric)
      const tone = heroMetricTone(metric)
      const current = heroMetricTable(data, t)[metric]
      const value = formatDuration(current.value, format)
      const share = heroRingModel(data, t, metric)
      const isLongRange = metric === 'week' || metric === 'month'
      const date = new Date(nowMs ?? Date.now())
      const locale = isZh ? 'zh-CN' : 'en'
      const dateLabel = date.toLocaleDateString(locale, { month: 'short', day: 'numeric', weekday: 'short' })
      return h(SelectionGroup, {
        as: 'section', value: period, snapValue: 'day',
        className: 'cs-card cs-overview-metrics',
        lang: isZh ? 'zh-CN' : 'en',
        'data-focus': 'hero',
      },
        h('div', { className: 'cs-overview-today' },
          h('button', {
            type: 'button',
            className: `cs-cycle cs-cycle-today is-metric-${tone}${period === 'day' ? ' is-current' : ''}`,
            'aria-label': `${t('cycleToday')} · ${current.title} ${value}`,
            'aria-pressed': period === 'day',
            onClick: () => onSelectPeriod?.('day'),
          },
            h('span', { className: 'cs-cycle-head' },
              h('span', { className: 'cs-card-icon' }, h(DetailGlyph, { name: heroMetricGlyph(metric), size: 16 })),
              h('span', { className: 'cs-cycle-title' }, metric === 'active' ? t('focusTodayActive') : current.title),
              isLongRange ? h('span', { className: 'cs-cycle-period' }, t('cycleToday')) : null),
            h('strong', { className: `cs-hero-num is-metric-${tone}` }, renderDurationDigits(value)),
            h('time', { dateTime: localDateKey(date) }, dateLabel),
            renderShareTrack(share.label, share.percent, share.tone)),
          renderZoomButton({ t, focus, onToggleFocus })),
        h('div', { className: 'cs-overview-metric-pair' },
          heroMetaItems(data, metric).map(([label, value]) => {
            const glyph = label.endsWith('Task') ? 'task' : label.endsWith('Active') ? 'active' : 'online'
            return h('div', { key: label, className: `cs-overview-metric is-${glyph}` },
              h('span', null, h(DetailGlyph, { name: glyph, size: 14 }), t(label)),
              h('strong', { className: `is-metric-${glyph}` }, renderDurationDigits(formatDuration(value, format))))
          })),
        ['week', 'month'].map((item) => renderCycleCard(
          t, item, data?.cycles?.[item] ?? {}, item === period, () => onSelectPeriod?.(item), format, 'watermark')))
    }

    /** 活跃占比：在线为 0 时按 0% 处理，结果夹在 0–100 之间。 */
    function activeSharePercent(activeMs, onlineMs) {
      const online = finite(onlineMs)
      if (online <= 0) return 0
      const ratio = finite(activeMs) / online
      return Math.max(0, Math.min(100, Math.round(ratio * 100)))
    }

    function renderFocusStat(label, value) {
      return h('div', { className: 'cs-fs-item' }, h('span', null, label), h('b', null, value))
    }

    /**
     * 条状图首屏页：不是把概览卡片拉宽，而是整页重排为按可用高度铺开的图表，
     * 下方给出峰值活跃、最活跃时段、活跃占比与任务时长四项统计。
     */
    function renderTrendFocusPage(props) {
      const { data, t, isZh, period, format = 'hms', hoverTip, focus = 'trend', onToggleFocus } = props
      const shownPeriod = data?.period ?? period
      const stats = trendFocusStats(data, shownPeriod, isZh, format)
      const hasTrend = Array.isArray(data?.trend) && data.trend.length > 0
      return h('section', {
        className: 'cs-card cs-trend-focus',
        'data-focus': 'trend',
        style: { '--cs-focus-ms': `${focusTransitionMs(prefersReducedMotion())}ms` },
      },
        h('div', { className: 'cs-card-head' },
          renderCardTitle(t('trendFocusTitle'), 'trend', null, t('trendInfo')),
          h('div', { className: 'cs-legend' },
            h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-active' }), t('activeLabel')),
            h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-task' }), t('taskLabel'))),
          renderZoomButton({ t, focus, onToggleFocus, value: 'trend' })),
        hasTrend
          ? renderTrendChart(data.trend, shownPeriod, t, isZh, hoverTip?.tip,
              { onHover: hoverTip?.show, onLeave: hoverTip?.hide, height: TREND_FOCUS_HEIGHT }, format)
          : h('div', { className: 'cs-empty' }, t('emptyDashboard')),
        h('div', { className: 'cs-focus-panel cs-trend-focus-stats' },
          renderFocusStat(t('peakActive'), formatDuration(stats.peakMs, format)),
          renderFocusStat(t('peakPeriod'), stats.peakLabel),
          renderFocusStat(t('activeShare'), `${stats.activeSharePct}%`),
          renderFocusStat(t('taskLabel'), formatDuration(stats.taskMs, format))))
    }

    /**
     * 首屏放大页：重新排版成左右两栏——左侧大数字与只读信息，
     * 右侧活跃占比圆环；底部五项时长统计可点，点击切换大数字的主指标。
     */
    function renderHeroFocusPage(props) {
      const {
        data, t, format = 'hms', focus = 'hero', onToggleFocus, heroMetric, onSelectHeroMetric,
      } = props
      const metric = normalizeHeroMetric(heroMetric)
      const metricTable = heroMetricTable(data, t)
      const current = metricTable[metric]
      const meta = heroMetaItems(data, metric)
      const ring = heroRingModel(data, t, metric)
      const heroNumber = formatDuration(current.value, format)
      const heroNumberClass = `cs-hero-num${heroNumber.length >= 9 ? ' is-extra-long' : heroNumber.length === 8 ? ' is-long' : ''} is-metric-${heroMetricTone(metric)}`
      const metricButton = (key, label, value) => h('button', {
        type: 'button',
        className: `cs-fs-item cs-fs-button is-metric-${heroMetricTone(key)}${key === metric ? ' is-current' : ''}`,
        'aria-pressed': key === metric,
        onClick: () => onSelectHeroMetric?.(key),
      }, h('span', null, h(DetailGlyph, { name: heroMetricGlyph(key), size: 12 }), label), h('b', null, renderDurationDigits(value)))
      return h('section', {
        className: 'cs-card cs-hero cs-hero-focus',
        'data-focus': 'hero',
        'data-metric': metric,
        style: {
          '--cs-focus-ms': `${focusTransitionMs(prefersReducedMotion())}ms`,
          // 颜色渐变与读数共用同一个时长，避免两套 900ms 常量各自漂移。
          '--cs-hero-color-ms': `${DURATION_TWEEN_MS}ms`,
        },
      },
        h('div', { className: 'cs-card-head' },
          h('div', { className: 'cs-card-heading' },
            h('h2', null, h(ContentTransition, { as: 'span', identity: metric, retain: true }, current.title)),
            heroMetricTag(t, metric) === null ? null : h('span', { className: 'cs-tag' }, heroMetricTag(t, metric))),
          renderZoomButton({ t, focus, onToggleFocus })),
        h('div', { className: 'cs-hero-focus-body' },
          h('div', { className: 'cs-hero-focus-primary' },
            h('div', { className: heroNumberClass },
              h(DurationTween, {
                identity: metric, value: current.value, format, className: 'cs-hero-num-value',
              }, heroNumber)),
            h('div', { className: 'cs-hero-meta' },
              meta.map(([labelKey, value]) => {
                const tone = labelKey.endsWith('Task') ? 'task' : labelKey.endsWith('Active') ? 'active' : 'online'
                return h('span', { key: labelKey, className: `cs-hero-meta-item is-${tone}` },
                  h(DetailGlyph, { name: tone, size: 13 }),
                  h('span', { className: 'cs-hero-meta-label' }, t(labelKey)),
                  h('b', { className: 'cs-hero-meta-value' }, renderDurationDigits(formatDuration(value, format))))
              }),
              h('span', { className: 'cs-hero-meta-item is-count' },
                h(DetailGlyph, { name: 'count', size: 13 }),
                h('span', { className: 'cs-hero-meta-label' }, t('taskCountShort')),
                h('b', { className: 'cs-hero-meta-value' }, String(heroTaskCount(data, metric)))))),
          h('div', { className: 'cs-hero-focus-aside' },
            h(ChartReveal, {
              className: `cs-hero-ring${ring.tone === 'task' ? ' is-task' : ''}`,
              role: 'img',
              'aria-label': `${ring.label} ${ring.percent}%`,
            },
              h('svg', { viewBox: '0 0 160 160', 'aria-hidden': true },
                h('circle', { className: 'cs-hero-ring-track', cx: 80, cy: 80, r: 68, fill: 'none', strokeWidth: 9 }),
                h('circle', {
                  className: 'cs-hero-ring-value cs-reveal-ring', cx: 80, cy: 80, r: 68, fill: 'none', strokeWidth: 9,
                  pathLength: 100, strokeLinecap: ring.percent > 0 ? 'round' : 'butt',
                  strokeDasharray: `${ring.percent} ${100 - ring.percent}`, transform: 'rotate(-90 80 80)',
                })),
              h('div', { className: 'cs-hero-ring-center' },
                h('b', null, h(ContentTransition, { as: 'span', identity: metric, retain: true }, `${ring.percent}%`)),
                h('span', null, h(ContentTransition, { as: 'span', identity: metric, retain: true }, ring.label)))),
            h('div', { className: 'cs-hero-ring-legend' },
              h('div', { className: `cs-hero-ring-legend-item is-active${ring.tone === 'task' ? ' is-task' : ''}` },
                h('span', null, h('i', { 'aria-hidden': true }), ring.numeratorLabel),
                h('b', null, formatDuration(ring.numeratorMs, format))),
              h('div', { className: 'cs-hero-ring-legend-item is-online' },
                h('span', null, h('i', { 'aria-hidden': true }), ring.denominatorLabel),
                h('b', null, formatDuration(ring.denominatorMs, format)))))),
        h(SelectionGroup, { value: metric, className: 'cs-focus-panel', role: 'group', 'aria-label': t('heroMetricGroup') },
          metricButton('online', t('onlineLabel'), formatDuration(metricTable.online.value, format)),
          metricButton('task', t('todayTask'), formatDuration(metricTable.task.value, format)),
          metricButton('active', t('focusTodayActive'), formatDuration(metricTable.active.value, format)),
          metricButton('week', t('focusWeekActive'), formatDuration(metricTable.week.value, format)),
          metricButton('month', t('focusMonthActive'), formatDuration(metricTable.month.value, format))))
    }

    /** 首屏下半区的月度条：高度按峰值比例，颜色沿用热力图 0–5 级色阶，并与柱状图共用向上生长入场。 */
    function renderMonthBars(bars, t, format = 'hms', className = 'heat-month-bars') {
      const list = Array.isArray(bars) ? bars : []
      const maxBar = Math.max(0, ...list.map((bar) => finite(bar.activeMs)))
      return h(ChartReveal, {
        className,
        role: 'group',
        'aria-label': t('monthBars'),
        // 首屏下半区的月度条要等区块露出足够多再生长，避免只在底边露头时就在视野外放完。
        threshold: .4,
      }, list.map((bar, index) => {
        const activeMs = finite(bar.activeMs)
        const ratio = maxBar > 0 ? activeMs / maxBar : 0
        const height = activeMs > 0 ? Math.max(4, Math.round(ratio * 100)) : 0
        // 与每日热力图同口径：按当月活跃相对峰值取 0–5 级，最高月用最深一级、最低有记录月用最浅一级。
        const level = heatLevel(activeMs, maxBar)
        return h('div', {
          key: `bar-${bar.month}`,
          className: `heat-month-bar is-level-${level}`,
          style: { height: `${height}%`, ...chartStagger(index, list.length) },
          'data-month': bar.abbr,
          'data-active-ms': activeMs,
          'aria-label': `${bar.abbr} · ${t('activeLabel')} ${formatDuration(activeMs, format)}`,
        }, h('i', { className: 'cs-month-fill cs-reveal-y', 'aria-hidden': true }))
      }))
    }

    /**
     * 每日活跃热力图：每格一天，颜色只表示当天活跃时长深浅。
     * 全年、3m/6m 共用 7 行周网格，单月是 7 列日历；全年把月份刻度放在网格下方。
     * 三种布局共用同一套格子浮层，无观测格只显示「无记录」。
     * focusPage 为真时重排为首屏：左侧自适应网格 + 右侧六项范围统计 + 下方 12 个月度条。
     */
    function renderDailyHeatmap(props) {
      const {
        series, status, t, format = 'hms', nowMs, hoverTip,
        rangeValue = HEAT_DEFAULT_RANGE, onSelectRange,
        focus = null, onToggleFocus, focusPage = false,
      } = props
      // 月份与星期文案按界面语言生成：中文全中文，英文界面沿用缩写。
      const monthLabels = heatMonthLabels(t)
      const weekdayLabels = heatWeekdayLabels(t)
      // 组件测试可能只传 series（范围在 series.range 里）；显式传了 rangeValue 才以它为准。
      const hasRangeValue = props.rangeValue !== undefined && props.rangeValue !== null
      const layout = heatLayoutFor(rangeValue)
      const resolved = resolveHeatRange(rangeValue, nowMs)
      const normalizedValue = resolved.value
      const anchor = new Date(resolved.from)
      const year = anchor.getFullYear()
      const month = anchor.getMonth()
      const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`
      const yearPrefix = `${year}-`
      const titleKey = focusPage ? 'heatmapFocusTitle' : layout === 'year' ? 'yearHeatTitle' : layout === 'month' ? 'monthHeatTitle' : 'heatmapTitle'
      const fallbackTitle = t('heatmapTitle')
      const rawTitle = t(titleKey)
      const titleText = rawTitle === titleKey || rawTitle === ''
        ? fallbackTitle
        : layout === 'month' && !focusPage
          ? rawTitle.replace('{month}', monthLabels[month])
          : rawTitle
      const hasSeries = series !== null && series !== undefined && Array.isArray(series.days)
      const allDays = hasSeries ? series.days : []
      // 单月/全年只统计本范围内的日期；相邻月份即使混进序列也不进入汇总与分母。
      const scopedDays = layout === 'month'
        ? allDays.filter((day) => typeof day?.dateKey === 'string' && day.dateKey.startsWith(monthPrefix))
        : layout === 'year'
          ? allDays.filter((day) => typeof day?.dateKey === 'string' && day.dateKey.startsWith(yearPrefix))
          : allDays
      // Host summary 对应整个查询范围；只有未发生单月/全年过滤时才可整段复用。
      const hostSummary = scopedDays.length === allDays.length && series?.summary !== null && typeof series?.summary === 'object'
        ? series.summary
        : null
      const focusSummary = focusPage ? summarizeHeatFocus(scopedDays, hostSummary) : null
      const zoomable = typeof onToggleFocus === 'function'
      const phase = status ?? (hasSeries ? 'ready' : 'loading')
      // 范围汇总收进标题左侧模块图标的浮层：与六档色带同处一个说明，不占卡片版面。
      const summary = !focusPage && hasSeries && allDays.length > 0
        ? summarizeHeatDays(scopedDays, hostSummary)
        : null
      const summaryText = summary
        ? t('heatSummary')
          .replace('{active}', formatDuration(summary.activeMs, format))
          .replace('{activeDays}', String(summary.activeDays))
          .replace('{observedDays}', String(summary.observedDays))
        : ''
      const legendSummary = summary && summary.observedDays > 0
        ? { ...summary, label: summaryText }
        : null
      const head = h('div', { className: 'cs-card-head' },
        h('div', { className: 'cs-card-heading' },
          h('h2', { className: 'cs-card-title' },
            h('span', { className: 'cs-card-icon has-tip' }, h(Info, {
              message: t('heatLegendLabel'), content: renderHeatLegend(t, format, legendSummary),
              delay: 600, label: t('heatLegendLabel'),
              icon: h(DetailGlyph, { name: 'heat', size: 15 }), buttonClassName: 'cs-card-icon-btn',
            })),
            h(TextFade, { text: titleText }))),
        h('div', { className: 'heat-card-actions' },
          renderHeatRangePicker({ value: normalizedValue, t, onSelectRange }),
          zoomable ? renderZoomButton({ t, focus, onToggleFocus, value: 'heatmap' }) : null))
      let body
      if (!hasSeries) {
        const emptyKey = phase === 'loading' ? 'heatmapLoading' : phase === 'error' ? 'heatmapError' : 'heatmapEmpty'
        body = h('div', { className: 'cs-empty' }, t(emptyKey))
      } else if (allDays.length === 0) {
        body = h('div', { className: 'cs-empty' }, t('heatmapEmpty'))
      } else {
        let maxActive = 0
        for (const day of scopedDays) {
          if (day?.hasObservations === true) maxActive = Math.max(maxActive, finite(day.activeMs))
        }

        const renderPad = (key) => h('span', {
          key,
          className: 'heat-cell is-pad',
          'aria-hidden': true,
        })
        const renderCell = (cell, key, index, count) => {
          const day = cell.day
          const empty = day.hasObservations !== true
          const level = empty ? 0 : heatLevel(day.activeMs, maxActive)
          const tip = buildHeatTip(day, t, format)
          const ariaLabel = empty
            ? `${tip.title} · ${t('noRecord')}`
            : `${tip.title} · ${t('activeLabel')} ${formatDuration(day.activeMs, format)}`
          return h('span', {
            key,
            className: `heat-cell cs-reveal-cell l${level}${empty ? ' is-empty' : ''}`,
            style: chartStagger(index, count),
            tabIndex: 0,
            role: 'button',
            'aria-label': ariaLabel,
            'data-date': cell.dateKey,
            onMouseEnter: (event) => hoverTip?.show(tip, event),
            onFocus: (event) => hoverTip?.show(tip, event),
            onMouseLeave: () => hoverTip?.hide(),
            onBlur: () => hoverTip?.hide(),
            onKeyDown: (event) => { if (isActivationKey(event)) hoverTip?.show(tip, event) },
          })
        }
        const renderWeekCells = (grid) => {
          const cells = []
          for (const week of grid.weeks) {
            for (const cell of week) {
              if (cell === null) {
                cells.push(renderPad(`pad-${cells.length}`))
                continue
              }
              cells.push(renderCell(cell, cell.dateKey, cells.length, grid.weeks.length * 7))
            }
          }
          return cells
        }
        const renderWeekLabels = (grid) => {
          // 全年与首屏网格宽度不固定：月份刻度改用与格子相同的列宽。
          // 全年按 1fr 等比压缩；首屏 3m/6m 保持与固定像素格子一致的列宽，避免刻度跑偏。
          const gridMonths = focusPage || layout === 'year'
          const fixedMonthColumns = focusPage && layout !== 'year'
          return {
            monthRow: h('div', {
              className: `heat-months${gridMonths ? ' is-grid' : ''}${focusPage ? ' is-focus' : ''}${layout === 'year' ? ' is-year' : ''}`,
              style: gridMonths
                ? { gridTemplateColumns: `repeat(${grid.weeks.length}, ${fixedMonthColumns ? 'var(--cs-heat-cell)' : 'minmax(0, 1fr)'})` }
                : undefined,
            }, grid.months.map((entry) =>
              h('span', {
                key: `${entry.abbr}-${entry.column}`,
                'data-column': entry.column,
                style: gridMonths
                  ? { gridColumnStart: String(entry.column + 1) }
                  : { left: `calc(${entry.column} * (var(--cs-heat-cell) + var(--cs-heat-gap)))` },
              }, entry.abbr))),
            weekdayRow: h('div', { className: 'heat-weekdays' },
              h('span', { className: 'heat-weekdays-spacer', 'aria-hidden': true }),
              h('div', { className: 'heat-weekday-list' }, weekdayLabels.map((label) =>
                h('span', { key: label }, label)))),
          }
        }

        if (layout === 'month') {
          const grid = buildMonthGrid(scopedDays, resolved, weekdayLabels)
          const cells = grid.weeks.flat().map((cell, index) => (
            cell === null ? renderPad(`pad-${index}`) : renderCell(cell, cell.dateKey, index, grid.weeks.length * 7)
          ))
          body = [
            h('div', { className: 'heat-month' },
              h('div', { className: 'heat-month-weekdays' }, weekdayLabels.map((label) =>
                h('span', { key: label }, label))),
              h(ChartReveal, { className: 'heat-month-grid' }, cells)),
          ]
        } else {
          // 全年与 3m/6m 共用 7 行周网格；全年把月份刻度移到网格下方，贴近参考图的扁宽比例。
          const isYear = layout === 'year'
          const range = hasRangeValue ? resolved : (series.range ?? resolved)
          const grid = buildHeatGrid(scopedDays, range, monthLabels, weekdayLabels)
          const cells = renderWeekCells(grid)
          const { monthRow, weekdayRow } = renderWeekLabels(grid)
          // 3m/6m 网格比卡片宽，初始横向滚动要停在当前月（最右列），而不是范围起点；
          // 用 dataset 记住已对齐的范围，切换范围时重新对齐，同一范围内重渲染不打断用户手动滚动。
          const heatScrollKey = String(normalizedValue)
          const alignHeatScroll = isYear ? undefined : (node) => {
            if (!node || typeof node.scrollLeft !== 'number') return
            if (node.dataset?.csScrollKey === heatScrollKey) return
            if (node.dataset) node.dataset.csScrollKey = heatScrollKey
            const align = () => {
              node.scrollLeft = Math.max(0, node.scrollWidth - node.clientWidth)
            }
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(align)
            else align()
          }
          body = [
            h('div', {
              className: `heatmap-body${isYear ? ' is-year' : ''}`,
              style: focusPage && !isYear ? { '--cs-heat-columns': grid.weeks.length } : undefined,
              ref: alignHeatScroll,
            },
              weekdayRow,
              h('div', { className: 'heat-plot' },
                isYear ? null : monthRow,
                h(ChartReveal, { className: 'heat-weekgrid' }, cells),
                isYear ? monthRow : null)),
          ]
        }
      }
      let content = body
      if (focusPage) {
        const main = Array.isArray(body) ? body.slice() : [body]
        // 上半区整块留给热力图；统计与月度条全部沉到下半区。
        const matrix = buildYearMatrix(scopedDays, year, monthLabels)
        const peakBar = matrix.bars.reduce((best, bar) =>
          finite(bar.activeMs) > finite(best?.activeMs) ? bar : best, matrix.bars[0] ?? null)
        const peakActiveMs = finite(peakBar?.activeMs)
        const peakDay = focusSummary.peakDay
        const peakDaySource = peakDay === null ? null : scopedDays.find((day) => day?.dateKey === peakDay.dateKey)
        const peakDayText = peakDay === null
          ? '—'
          : `${peakDaySource ? buildHeatTip(peakDaySource, t, format).title : peakDay.dateKey} · ${formatDuration(peakDay.activeMs, format)}`
        const activeDaysText = focusSummary.observedDays > 0
          ? `${focusSummary.activeDays}/${focusSummary.observedDays}`
          : String(focusSummary.activeDays)
        content = h('div', { className: `heat-focus-layout${layout === 'year' ? ' is-year' : ''}` },
          h('div', { className: 'heat-focus-main' },
            h('div', { className: 'heat-focus-visual' }, ...main)),
          h('div', { className: 'heat-focus-bottom' },
            h('aside', { className: 'heat-focus-panel' },
              renderFocusStat(t('rangeOnline'), formatDuration(focusSummary.onlineMs, format)),
              renderFocusStat(t('rangeActive'), formatDuration(focusSummary.activeMs, format)),
              renderFocusStat(t('rangeTask'), formatDuration(focusSummary.taskMs, format)),
              renderFocusStat(t('peakDay'), peakDayText),
              renderFocusStat(t('activeDaysLabel'), activeDaysText),
              renderFocusStat(t('dailyAverageActive'), formatDuration(focusSummary.dailyAverageActiveMs, format))),
            h('div', { className: 'heat-focus-bars' },
              h('div', { className: 'heat-focus-bars-head' },
                h('span', null, t('monthBars')),
                h('span', null, peakActiveMs > 0 && peakBar
                  ? `${peakBar.abbr} · ${t('activeLabel')} ${formatDuration(peakActiveMs, format)}`
                  : t('noRecord'))),
              renderMonthBars(matrix.bars, t, format, 'heat-month-bars heat-focus-month-bars'))))
      }
      return h('section', {
        className: `cs-card cs-heatmap-card${focusPage ? ' cs-heatmap-focus' : ''}${zoomable ? ' has-zoom' : ''}`,
        'data-focus': 'heatmap',
        'data-range': normalizedValue,
        'data-layout': layout,
      }, head, content)
    }

    /**
     * 热力图首屏独立页：外层负责首屏语义与转场，内部卡片按 focusPage 重排为
     * 上半区整幅热力图、下半区左侧六项范围统计与右侧 12 个月度条。
     */
    function renderHeatmapFocusPage(props) {
      const {
        series, status, t, format = 'hms', nowMs, hoverTip,
        rangeValue = HEAT_DEFAULT_RANGE, onSelectRange, focus = 'heatmap', onToggleFocus,
      } = props
      return h('section', {
        className: 'cs-heatmap-focus-page',
        'data-focus': 'heatmap',
        style: { '--cs-focus-ms': `${focusTransitionMs(prefersReducedMotion())}ms` },
      }, renderDailyHeatmap({
        series, status, t, format, nowMs, hoverTip, rangeValue, onSelectRange,
        focus, onToggleFocus, focusPage: true,
      }))
    }

    const ANALYSIS_PERIOD_LABELS = {
      day: 'cycleToday', week: 'cycleWeek', month: 'cycleMonth',
    }
    const ANALYSIS_NOTICE_DISMISSED = { scopeMismatch: false, modelRequired: false }
    const ANALYSIS_PHASE_LABELS = { collecting: 'analysisCollecting', generating: 'analysisGenerating', saving: 'analysisSaving' }
    const ANALYSIS_ERROR_LABELS = {
      'model-not-selected': 'analysisModelRequired',
      'model-unavailable': 'analysisModelUnavailable',
      'analysis-model-changed': 'analysisModelChanged',
      'catalog-unavailable': 'analysisCatalogUnavailable',
      'input-unavailable': 'analysisInputUnavailable',
      'scope-unavailable': 'analysisScopeUnavailable',
      'host-unavailable': 'analysisHostUnavailable',
      'no-data': 'analysisNoData',
      'invalid-output': 'analysisInvalidOutput',
      'save-failed': 'analysisSaveError',
    }

    function useAnalysisState(ctx, onModelChanged) {
      const [remote, setRemote] = React.useState({ state: null, error: false })
      const [operation, setOperation] = React.useState({ method: '', error: '' })
      const runtime = React.useRef({ active: false, reading: false, writing: false, sequence: 0 }).current
      const running = Boolean(ANALYSIS_PHASE_LABELS[remote.state?.phase])

      function accept(state) {
        if (!state?.reports || typeof state.phase !== 'string') throw new Error('分析状态无效')
        setRemote({ state, error: false })
      }

      async function reload() {
        if (!runtime.active || runtime.reading || runtime.writing || !readWindowState().visible) return
        const sequence = ++runtime.sequence
        runtime.reading = true
        try {
          const value = await callHost(ctx, 'getAnalysisState', {})
          if (sequence === runtime.sequence) accept(value)
        } catch {
          if (sequence === runtime.sequence) setRemote((previous) => ({ ...previous, error: true }))
        } finally {
          if (sequence === runtime.sequence) runtime.reading = false
        }
      }

      async function submit(method, payload) {
        if (!runtime.active || runtime.writing) return
        const sequence = ++runtime.sequence
        runtime.writing = true
        runtime.reading = false
        setOperation({ method, error: '' })
        let reloadAfter = method === 'cancelAnalysis'
        try {
          const value = await callHost(ctx, method, payload)
          if (sequence === runtime.sequence) {
            accept(value)
            setOperation({ method: '', error: '' })
          }
        } catch (error) {
          if (sequence === runtime.sequence) {
            reloadAfter = true
            if (error?.code === 'analysis-model-changed') onModelChanged?.()
            setOperation({ method: '', error: ANALYSIS_ERROR_LABELS[error?.code] ??
              (method === 'cancelAnalysis' ? 'analysisCancelError' : 'analysisStartError') })
          }
        } finally {
          if (sequence === runtime.sequence) {
            runtime.writing = false
            if (reloadAfter) void reload()
          }
        }
      }

      React.useEffect(() => {
        runtime.active = true
        void reload()
        const unsubscribe = subscribeSettingsChanged(reload)
        if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', reload)
        return () => {
          unsubscribe()
          if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', reload)
          runtime.active = false
          runtime.sequence += 1
          runtime.reading = false
          runtime.writing = false
        }
      }, [ctx])
      React.useEffect(() => {
        const id = setInterval(reload, running ? ANALYSIS_REFRESH_MS : PAGE_REFRESH_MS)
        return () => clearInterval(id)
      }, [ctx, running])
      return { ...remote, operation, running, reload, submit }
    }

    function analysisScopeOptions(workspaces, workspaceId, t) {
      const available = new Map()
      const workspaceOptions = []
      for (const workspace of workspaces) {
        const real = !workspace.key.startsWith('__unassigned_')
        const title = workspace.workspaceTitle ?? (real ? workspace.key : t('unassigned'))
        if (real) workspaceOptions.push({ value: workspace.key, label: title })
        if (workspaceId && workspace.key !== workspaceId) continue
        for (const session of workspace.sessions) {
          if (!sessionIsOpenable(session) || available.has(session.sessionId)) continue
          const sessionTitle = session.sessionTitle ?? session.sessionId
          available.set(session.sessionId, { value: session.sessionId, label: workspaceId ? sessionTitle : `${sessionTitle} · ${title}` })
        }
      }
      return { workspaceOptions, sessionOptions: [...available.values()] }
    }

    function analysisScopeLabel(range, t) {
      const workspace = range.workspaceTitle || range.workspaceId
      const session = range.sessionTitle || range.sessionId
      return [workspace, session].filter(Boolean).join(' / ') || t('analysisAllWorkspaces')
    }

    /** 已保存报告的日期与图轴共用快照时区；旧报告沿用本地显示。 */
    function formatAnalysisTime(value, timeZone) {
      const time = Number(value)
      if (!timeZone || !Number.isFinite(time) || time <= 0) return formatNoticeTime(value, true)
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(time).map(({ type, value }) => [type, value]))
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
    }

    function analysisDateRange(range) {
      return `${formatAnalysisTime(range.from, range.snapshot?.timeZone)} – ${formatAnalysisTime(range.to, range.snapshot?.timeZone)}`
    }

    const ANALYSIS_FAILURE_REASONS = {
      missing: 'analysisFailureMissing',
      'invalid-record': 'analysisFailureInvalid',
      unavailable: 'analysisFailureUnavailable',
    }

    function analysisFailureContext(source, t) {
      const reason = Object.hasOwn(ANALYSIS_FAILURE_REASONS, source.reason)
        ? ANALYSIS_FAILURE_REASONS[source.reason] : 'analysisFailureUnknown'
      return [source.workspaceTitle || source.workspaceId, t(reason)].filter(Boolean).join(' · ')
    }

    function analysisSourceLabel(source) {
      return [source.sessionTitle || source.sessionId, source.workspaceTitle || source.workspaceId].filter(Boolean).join(' · ')
    }

    /** 首次生成报告用文档加笔；已有报告、失败重试与重新生成继续沿用重置箭头。 */
    function analysisGenerateGlyph(report, retrying) {
      return report || retrying ? 'refresh' : 'generate'
    }

    function analysisReportDetails(report, t) {
      const coverage = report.coverage ?? {}
      const sources = Array.isArray(report.sources) ? report.sources.filter(sessionIsOpenable) : []
      const sourceById = new Map(sources.map((source) => [source.sessionId, source]))
      const work = (report.content?.work ?? []).map((item) => ({
        text: item.text,
        sources: [...new Set(item.sourceIds)].map((id) => sourceById.get(id)).filter(Boolean),
      }))
      const failedCount = coverage.failedSessions ?? 0
      const failedSources = (coverage.failedSources ?? []).filter(sessionIsOpenable)
      const hiddenCount = Math.max(0, failedCount - failedSources.length)
      const missingFailures = hiddenCount > 0
        ? (failedSources.length ? t('analysisFailureNotListed').replace('{count}', hiddenCount) : t('analysisFailureNoDetails'))
        : ''
      return {
        dates: analysisDateRange(report),
        scope: analysisScopeLabel(report, t),
        generatedAt: formatAnalysisTime(report.generatedAt, report.snapshot?.timeZone),
        model: `${report.provider} / ${report.model}`,
        summary: report.summary,
        statistics: report.content?.statistics,
        work,
        suggestions: report.content?.suggestions,
        sources,
        coverageSummary: t('analysisCoverage').replace('{total}', coverage.totalSessions ?? 0)
          .replace('{read}', coverage.readSessions ?? 0).replace('{included}', coverage.includedSessions ?? 0),
        coverageNotes: [
          coverage.omittedSessions > 0 ? t('analysisCoverageOmitted').replace('{count}', coverage.omittedSessions) : '',
          coverage.truncated ? t('analysisCoverageTruncated') : '',
          coverage.relatedSessionsUnavailable ? t('analysisCoverageRelatedUnavailable') : '',
        ].filter(Boolean),
        failureLabel: failedCount > 0 ? t('analysisCoverageFailed').replace('{count}', failedCount) : '',
        failedSources,
        missingFailures,
      }
    }

    function analysisMarkdownText(value) {
      return String(value ?? '').replace(/\r\n?/g, '\n')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/[\\`*_\[\]|~]/g, '\\$&')
        .replace(/^([ \t]*)([#=+-]|[0-9]{1,9}[.)](?=[ \t]))/gm, (_, indent, marker) =>
          `${indent}${marker.slice(0, -1)}\\${marker.slice(-1)}`)
    }

    function analysisReportMarkdown(report, t) {
      const details = analysisReportDetails(report, t)
      const inline = (value) => analysisMarkdownText(value).replace(/\s*\n\s*/g, ' ')
      const work = details.work.map((item) => {
        const text = analysisMarkdownText(item.text).replace(/\n/g, '\n  ')
        const sources = item.sources.map((source) => inline(analysisSourceLabel(source))).join(' / ')
        return sources ? `- ${text}\n  - **${t('reportWorkSources')}** ${sources}` : `- ${text}`
      })
      const coverage = [details.coverageSummary, ...details.coverageNotes].map((note) => `- ${note}`)
      if (details.failureLabel) {
        coverage.push(`- ${details.failureLabel}`)
        for (const source of details.failedSources) {
          const label = source.sessionTitle || source.sessionId
          coverage.push(`  - ${inline(`${label} · ${analysisFailureContext(source, t)}`)}`)
        }
        if (details.missingFailures) coverage.push(`  - ${details.missingFailures}`)
      }
      const sections = [
        `# ${reviewTitle(report, t)}`,
        [
          `- **${t('analysisReportRange')}** ${inline(details.scope)} · ${details.dates}`,
          `- **${t('analysisGeneratedAt')}** ${details.generatedAt}`,
          `- **${t('analysisModel')}** ${inline(details.model)}`,
        ].join('\n'),
        `## ${t('reportAbstract')}\n\n${analysisMarkdownText(details.summary)}`,
        ...reviewSnapshotMarkdown(report, t),
        `## ${t('analysisStatistics')}\n\n${reviewMarkdownPoints(details.statistics)}`,
        `## ${t('analysisWork')}\n\n${work.length ? work.join('\n') : t('analysisNoWork')}`,
      ]
      if (details.suggestions) sections.push(`## ${t('analysisSuggestions')}\n\n${reviewMarkdownPoints(details.suggestions)}`)
      sections.push(`## ${t('reportCoverage')}\n\n${coverage.join('\n')}`)
      if (details.sources.length) {
        const heading = t('analysisSources').replace('{count}', details.sources.length)
        const sources = details.sources.map((source) => `- ${inline(analysisSourceLabel(source))}`)
        sections.push(`## ${heading}\n\n${sources.join('\n')}`)
      }
      return `${sections.join('\n\n')}\n`
    }

    function reviewMarkdownPoints(value) {
      return reviewTextItems(value).map((item) => {
        const { title, body } = reviewPointParts(item, '')
        return title ? `- **${analysisMarkdownText(title)}**：${analysisMarkdownText(body)}` : `- ${analysisMarkdownText(body)}`
      }).join('\n')
    }

    function reviewSnapshotMarkdown(report, t) {
      const snapshot = reviewSnapshotView(report, t)
      if (!snapshot) return []
      const text = (value) => analysisMarkdownText(value).replace(/\s*\n\s*/g, ' ')
      const duration = (value) => value === null ? '—' : formatDuration(value, snapshot.isZh ? 'zh' : 'short')
      const metrics = [
        `- ${t('onlineLabel')}：${duration(snapshot.onlineMs)}`,
        `- ${t('activeLabel')}：${duration(snapshot.activeMs)}`,
        `- ${t('taskLabel')}：${duration(snapshot.taskMs)} · ${t('reviewTasks').replace('{count}', snapshot.taskCount)}`,
      ]
      const sections = [`## ${t('reviewMetrics')}\n\n${metrics.join('\n')}\n\n${t('reviewActualTime')}`]
      if (snapshot.ranked.length) sections.push(`### ${t('reviewWorkspaces')}\n\n${t('reviewWorkspaceBasis')}\n\n` +
        snapshot.ranked.map((row) => `- ${text(row.workspaceTitle || t('unassigned'))}：${duration(row.activeMs)} · ${formatPercent(row.activeMs / snapshot.workspaceTotal)}`).join('\n'))
      if (snapshot.trend.length) sections.push(`### ${t('reviewRhythm')}\n\n${text(snapshot.timeZone)}\n\n` +
        `| ${t('analysisPeriod')} | ${t('activeLabel')} | ${t('taskLabel')} |\n| --- | ---: | ---: |\n` +
        snapshot.trend.map((row) => `| ${text(row.label)} | ${duration(row.activeMs)} | ${duration(row.taskMs)} |`).join('\n'))
      if (snapshot.omittedTrendBuckets > 0 || snapshot.omittedWorkspaces > 0) sections.push(t('reviewSnapshotPartial'))
      return sections
    }

    function analysisReportFilename(report) {
      const period = Object.hasOwn(ANALYSIS_PERIOD_LABELS, report.period) ? report.period : 'report'
      const date = new Date(report.generatedAt)
      const timestamp = Number.isFinite(date.getTime()) ? `-${date.toISOString().replace(/[:.]/g, '-')}` : ''
      return `dsh-timespan-ai-${period}${timestamp}.md`
    }

    function renderAnalysisFailures(details, t, { scopeForSource, scopeLocked, onSelectScope, onReviewScope, onOpenSource, openErrorId }) {
      const { failureLabel, failedSources: sources, missingFailures } = details
      if (!failureLabel) return null
      return h('details', { className: 'cs-analysis-failures cs-disclosure' },
        h('summary', { onClick: toggleReviewDetails }, h('strong', null, failureLabel),
          h('span', { className: 'cs-analysis-failure-details-label' }, t('analysisFailureDetails'))),
        sources.length ? h('ul', { className: 'cs-analysis-failure-list' }, sources.map((source) => {
          const name = source.sessionTitle || source.sessionId
          const scope = scopeForSource?.(source)
          return h('li', { className: 'cs-analysis-failure-item', key: source.sessionId },
            h('div', { className: 'cs-analysis-failure-identity' },
              h('strong', null, name),
              h('span', null, analysisFailureContext(source, t)),
              !scope && !scopeLocked ? h('span', null, t('analysisFailureOutsideScope')) : null,
              openErrorId === source.sessionId ? h('span', { className: 'cs-analysis-state is-error', role: 'status' },
                t('analysisSourceError').replace('{name}', () => name)) : null),
            h('div', { className: 'cs-analysis-failure-actions' },
              scope ? h('button', {
                type: 'button', className: 'cs-btn cs-analysis-failure-select', disabled: scopeLocked,
                'aria-label': t('analysisFailureSelectNamed').replace('{name}', () => name), onClick: () => onSelectScope(scope),
              }, t('analysisFailureSelect')) : null,
              h('button', { type: 'button', className: 'cs-btn cs-analysis-failure-open',
                'aria-label': t('analysisFailureOpen').replace('{name}', () => name), onClick: () => onOpenSource(source, true),
              }, t('openSession'))))
        })) : null,
        missingFailures ? h('div', { className: 'cs-analysis-failure-note' },
          h('span', null, missingFailures),
          onReviewScope ? h('button', { type: 'button', className: 'cs-btn cs-analysis-failure-review', onClick: onReviewScope }, t('analysisReturnToRange')) : null) : null)
    }

    function AnalysisReportHeader({ report, dates, generatedAt, t, period = 'day', generationControl = null, context = null, messages = null }) {
      const [feedbackState, setFeedback] = React.useState(null)
      const reportKey = JSON.stringify([period, report?.id, report?.generatedAt])
      // 报告变化时在渲染阶段隔离旧反馈，不等待 effect 清理才隐藏手动复制框。
      const feedback = report && feedbackState?.reportKey === reportKey ? feedbackState : null
      const attemptRef = React.useRef(0)
      const copyButtonRef = React.useRef(null)
      const copyFieldRef = React.useRef(null)
      const manual = feedback?.key === 'reportCopyManual'

      React.useEffect(() => {
        attemptRef.current += 1
        setFeedback(null)
        return () => { attemptRef.current += 1 }
      }, [report?.id, report?.generatedAt, period])

      React.useEffect(() => {
        if (!manual) return
        copyFieldRef.current?.focus()
        copyFieldRef.current?.select()
      }, [feedback])
      React.useEffect(() => {
        if (!['reportCopied', 'reportExportStarted'].includes(feedback?.key)) return
        const timer = setTimeout(() => setFeedback(null), 1800)
        return () => clearTimeout(timer)
      }, [feedback])

      async function copy() {
        const attempt = ++attemptRef.current
        let key = 'reportCopied'
        try {
          await navigator.clipboard.writeText(analysisReportMarkdown(report, t))
        } catch {
          key = 'reportCopyManual'
        }
        if (attempt === attemptRef.current) setFeedback({ key, reportKey })
      }

      function download() {
        attemptRef.current += 1
        try {
          downloadExport({
            filename: analysisReportFilename(report),
            mimeType: 'text/markdown;charset=utf-8',
            content: analysisReportMarkdown(report, t),
          })
          setFeedback({ key: 'reportExportStarted', reportKey })
        } catch {
          setFeedback({ key: 'reportExportError', reportKey })
        }
      }

      function hideText() {
        attemptRef.current += 1
        setFeedback(null)
        copyButtonRef.current?.focus()
      }

      return h('header', { className: 'cs-analysis-report-header' },
        h('div', { className: 'cs-analysis-report-heading' },
          h('div', { className: 'cs-analysis-report-identity' },
            h('div', { className: 'cs-review-title' }, h('h2', null, reviewTitle(report ?? { period }, t)),
              report ? h(Info, { message: `${t('analysisGeneratedAt')} · ${generatedAt}`, label: t('analysisGeneratedAt'),
                buttonClassName: 'cs-review-icon cs-review-generated', icon: h(DetailGlyph, { name: 'clock', size: 16 }) }) : null),
            dates ? h('p', { className: 'cs-analysis-report-dates' }, dates) : null),
          h('div', { className: 'cs-analysis-report-actions', role: 'group', 'aria-label': t('reportActions') },
            report ? h(Info, { message: t(feedback?.key === 'reportCopied' ? 'reportCopied' : 'reportCopy'), label: t('reportCopy'),
              icon: h(DetailGlyph, { name: feedback?.key === 'reportCopied' ? 'check' : 'copy', size: 17 }),
              buttonClassName: `cs-review-icon is-copy${feedback?.key === 'reportCopied' ? ' is-done' : ''}`, onClick: copy, buttonRef: copyButtonRef }) : null,
            report ? h(Info, { message: t(['reportExportStarted', 'reportExportError'].includes(feedback?.key) ? feedback.key : 'reportExport'), label: t('reportExport'),
              icon: h(DetailGlyph, { name: feedback?.key === 'reportExportStarted' ? 'check' : feedback?.key === 'reportExportError' ? 'approx' : 'download', size: 17 }),
              buttonClassName: `cs-review-icon is-export${feedback?.key === 'reportExportStarted' ? ' is-done' : ''}${feedback?.key === 'reportExportError' ? ' is-error' : ''}`, onClick: download }) : null,
            generationControl)),
        h('span', { className: 'cs-sr-only cs-analysis-action-status', role: 'status' }, feedback ? t(feedback.key) : null),
        context,
        messages,
        h(AnimatedCollapse, { key: reportKey, open: manual }, manual ? h('div', { className: 'cs-analysis-copy-field' },
          h('p', { className: 'cs-analysis-state' }, t('reportCopyManual')),
          h('textarea', { ref: copyFieldRef, readOnly: true, spellCheck: false, rows: 6,
            'aria-label': t('reportMarkdownContent'), value: analysisReportMarkdown(report, t) }),
          h('button', { type: 'button', className: 'cs-btn', onClick: hideText }, t('reportCloseCopy'))) : null))
    }

    function reviewTitle(report, t) {
      return t(({
        day: 'reviewDay', week: 'reviewWeek', month: 'reviewMonth',
      })[report.period] ?? 'reportTitle')
    }

    /** 回顾筛选项按所选周期取数：日/周/月沿用对应周期的起点。 */
    function reviewScopeRange(period, data) {
      const from = data?.cycles?.[period]?.from
        ?? (data?.period === period ? data?.range?.from : undefined)
      return Number.isFinite(from) && from > 0 ? { from } : null
    }

    /** 旧报告按原句分段；只折叠显示，不删除或重新解释原文。 */
    function reviewTextItems(value) {
      const lines = String(value ?? '').split(/\n+/u).map((line) => line.trim()).filter(Boolean)
      return lines.flatMap((line) => line.length > 180
        ? line.split(/(?<=[。！？；])\s*|(?<=[.!?;])\s+(?=[A-Z\u4e00-\u9fff])/u).filter(Boolean) : [line])
    }

    function reviewPointParts(text, fallback) {
      const match = /^([^：:\n]{2,32})[：:]\s*([\s\S]+)$/u.exec(text)
      return match && /\p{L}/u.test(match[1]) ? { title: match[1], body: match[2] } : { title: fallback, body: text }
    }

    function renderReviewPoint(text, label, t) {
      const { title, body } = reviewPointParts(text, label)
      const heading = title ? h('strong', { className: 'cs-review-point-title' }, title, ' · ') : null
      if (body.length <= 140) return h('div', { className: 'cs-review-point' }, h('p', null, heading, body))
      return h('details', { className: 'cs-review-point cs-review-long' },
        h('summary', { onClick: toggleReviewDetails },
          h('span', { className: 'cs-review-excerpt' }, heading, `${body.slice(0, 120).replace(/[\uD800-\uDBFF]$/u, '').trimEnd()}…`),
          h('span', { className: 'cs-review-expand' }, t('reviewExpand')),
          h('span', { className: 'cs-review-collapse' }, t('reviewCollapse'))),
        h('div', { className: 'cs-review-fold-body' }, h('p', null, heading, body)))
    }

    function renderReviewPoints(value, t, labelKey = 'reviewPoint') {
      const points = reviewTextItems(value)
      const limit = labelKey === 'reviewPoint' ? 4 : 3
      const list = (items) => h('ul', { className: 'cs-review-points' }, items.map((item, index) =>
        h('li', { key: index }, renderReviewPoint(item, '', t))))
      return h(React.Fragment, null, list(points.slice(0, limit)), points.length > limit
        ? h('details', { className: 'cs-review-more cs-disclosure' }, reviewMoreSummary(points.length - limit, t),
          h('div', { className: 'cs-review-fold-body' }, list(points.slice(limit)))) : null)
    }

    function reviewMoreSummary(count, t) {
      return h('summary', { onClick: toggleReviewDetails },
        h('span', null, t('reviewMore').replace('{count}', count)))
    }

    const reviewDetailAnimations = new WeakMap()
    /** 保留原生 details 的键盘与折叠语义；高度从当前画面接续，快速反向也不会跳变。 */
    function toggleReviewDetails(event) {
      const summary = event.currentTarget
      const details = summary.parentElement
      if (!details || typeof details.animate !== 'function') return
      const prior = reviewDetailAnimations.get(details)
      const expanded = prior ? !prior.expanded : !details.open
      for (const child of details.children) if (child !== summary) child.inert = !expanded
      if (prefersReducedMotion()) {
        if (prior) {
          event.preventDefault()
          prior.animation.onfinish = null
          prior.animation.cancel()
          details.open = expanded
          delete details.dataset.reviewExpanded
          details.style.overflow = ''
          reviewDetailAnimations.delete(details)
        }
        return
      }
      event.preventDefault()
      const start = details.getBoundingClientRect().height
      if (prior) { prior.animation.onfinish = null; prior.animation.cancel() }
      // 长段收起后会重新显示摘要，目标高度须按关闭状态测量，不能只取「收起全文」那一行。
      details.open = expanded
      const end = details.getBoundingClientRect().height
      details.open = true
      details.dataset.reviewExpanded = String(expanded)
      details.style.overflow = 'hidden'
      const animation = details.animate([{ height: `${start}px` }, { height: `${end}px` }], {
        duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)',
      })
      reviewDetailAnimations.set(details, { animation, expanded })
      animation.onfinish = () => {
        details.open = expanded
        delete details.dataset.reviewExpanded
        details.style.overflow = ''
        reviewDetailAnimations.delete(details)
      }
    }

    function reviewSnapshotView(report, t) {
      const snapshot = report.snapshot
      if (!snapshot) return null
      const isZh = t('periodDay') === '日'
      const formatter = new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en', { timeZone: snapshot.timeZone,
        ...(report.period === 'day' ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
          : { month: 'numeric', day: 'numeric' }) })
      const trend = snapshot.trend.map((row) => ({ ...row, key: String(row.from), label: formatter.format(row.from) }))
      const workspaces = [...snapshot.workspaces].filter((row) => row.activeMs > 0).sort((left, right) => right.activeMs - left.activeMs)
      const total = Math.max(snapshot.activeSumMs, workspaces.reduce((sum, row) => sum + row.activeMs, 0))
      const ranked = workspaces.slice(0, 4)
      const remainder = Math.max(0, total - ranked.reduce((sum, row) => sum + row.activeMs, 0))
      if (remainder > 0) ranked.push({ workspaceTitle: t('reviewOtherWorkspaces'), activeMs: remainder })
      return { ...snapshot, trend, ranked, workspaceTotal: total, isZh }
    }

    function renderReviewMetrics(report, t, format = DEFAULT_DURATION_FORMAT) {
      const snapshot = report.snapshot
      const coverage = report.coverage ?? {}
      const included = coverage.includedSessions ?? 0
      const total = coverage.totalSessions ?? 0
      const read = coverage.readSessions ?? 0
      const emptyReason = included === 0 ? total === 0 ? 'reviewEvidenceNone'
        : read > 0 && !coverage.failedSessions && !coverage.omittedSessions ? 'reviewEvidenceEmpty' : 'reviewEvidenceUnavailable' : null
      const evidenceLines = [t('reviewEvidenceHint'), t(emptyReason ?? 'reviewEvidenceScope'),
        t(emptyReason === 'reviewEvidenceUnavailable' ? 'reviewEvidenceCheck' : emptyReason ? 'reviewEvidenceNext' : 'reviewEvidenceRefresh')]
      const ratio = total > 0 ? Math.min(1, included / total) : 0
      const metric = (label, icon, value, note = '') => h('div', { className: `cs-review-metric is-${icon}` },
        h('span', { className: 'cs-review-metric-label' }, h(DetailGlyph, { name: icon }), t(label)),
        h('strong', null, value === null ? '—' : formatDuration(value, format)), note ? h('small', null, note) : null)
      return h('section', { className: 'cs-review-metrics', 'aria-label': t('reviewMetrics') },
        snapshot ? h(React.Fragment, null,
          metric('activeLabel', 'active', snapshot.activeMs),
          metric('onlineLabel', 'online', snapshot.onlineMs, snapshot.onlineMs === null ? t('reviewOnlineNA') : ''),
          metric('taskLabel', 'task', snapshot.taskMs)) : null,
        h('div', { className: 'cs-review-coverage-meter', 'aria-label': t('analysisCoverage').replace('{total}', total).replace('{read}', read).replace('{included}', included) },
          h('svg', { viewBox: '0 0 48 48', width: 48, height: 48, 'aria-hidden': true },
            h('circle', { cx: 24, cy: 24, r: 19, fill: 'none', stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 4 }),
            h('circle', { cx: 24, cy: 24, r: 19, fill: 'none', stroke: 'var(--cs-chart-active)', strokeWidth: 4,
              strokeDasharray: `${ratio * 119.38} 119.38`, transform: 'rotate(-90 24 24)' })),
          h('div', null, h('span', { className: 'cs-review-metric-label' }, t('reviewEvidence'), renderInfo(evidenceLines.join('；'), null, evidenceLines)), h('strong', null, `${included}`, h('small', null, ` / ${total}`)),
            h('small', null, t('reviewReadCount').replace('{read}', read).replace('{total}', total)))))
    }

    /**
     * 回顾条状图按卡片实际高度重算 viewBox：工作区列表把卡片拉高时，
     * 柱顶圆角仍按像素绘制，不会被纵向拉伸成尖角。
     */
    function ReviewTrendChart({ trend, period, t, isZh, hover, actions, format }) {
      const hostRef = React.useRef(null)
      const [height, setHeight] = React.useState(0)
      const measure = () => {
        const node = hostRef.current
        if (!node) return
        const svg = node.querySelector('.cs-plot svg')
        const next = Math.round(svg?.getBoundingClientRect?.().height ?? 0)
        if (next > 0) setHeight((previous) => (Math.abs(previous - next) > 0.5 ? next : previous))
      }
      // 每次提交都在绘制前核对一次：切周期时卡片先变高，viewBox 要在同一帧跟上。
      React.useLayoutEffect(() => { measure() })
      React.useEffect(() => {
        const node = hostRef.current
        if (!node || typeof window === 'undefined') return undefined
        measure()
        let observer = null
        if (typeof window.ResizeObserver === 'function') {
          observer = new window.ResizeObserver(measure)
          observer.observe(node)
        }
        if (typeof window.addEventListener === 'function') window.addEventListener('resize', measure)
        return () => {
          if (observer) observer.disconnect()
          if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', measure)
        }
      }, [])
      return h('div', { ref: hostRef, className: 'cs-review-chart-fit' },
        renderTrendChart(trend, period, t, isZh, hover, { ...actions, height: height || 130 }, format))
    }

    /** 回顾图的完整周期槽位数：报告只截取已发生的桶，柱宽仍按整日/整周/整月计算。 */
    function reviewTrendSlotCount(period, trend) {
      const list = Array.isArray(trend) ? trend : []
      if (period === 'week') return 7
      if (period === 'day') return 24
      if (period === 'month') {
        const anchor = new Date(finite(list[0]?.from) || Date.now())
        return new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
      }
      return list.length
    }

    function renderReviewCharts(report, t, hoverTip) {
      const snapshot = reviewSnapshotView(report, t)
      if (!snapshot) return h('p', { className: 'cs-analysis-state cs-review-snapshot-note' }, t('reviewSnapshotMissing'))
      const { trend, ranked, workspaceTotal, isZh } = snapshot
      const hasActivity = trend.some((row) => row.activeMs > 0 || row.taskMs > 0)
      return h('div', { className: 'cs-review-visuals' },
        h('section', { className: 'cs-card cs-review-trend' },
          h('div', { className: 'cs-card-head' }, renderCardTitle(t('reviewRhythm'), 'trend', null, t('reviewRhythmHint')),
            h('div', { className: 'cs-legend' },
              h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-active' }), t('activeLabel')),
              h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-task' }), t('taskLabel')))),
          hasActivity ? h(ReviewTrendChart, {
            trend, period: report.period, t, isZh, hover: hoverTip?.tip, format: 'short',
            actions: {
              onHover: hoverTip?.show, onLeave: hoverTip?.hide, barRatio: 0.26, barMax: 24,
              slotCount: reviewTrendSlotCount(report.period, trend),
            },
          }) : h('p', { className: 'cs-review-empty-chart' }, t('reviewNoActivity')),
          snapshot.omittedTrendBuckets > 0 ? h('p', { className: 'cs-analysis-state cs-review-chart-note' }, t('reviewSnapshotPartial')) : null),
        h('section', { className: 'cs-card cs-review-workspaces' },
          h('div', { className: 'cs-card-head' }, renderCardTitle(t('reviewWorkspaces'), 'ranking', null, t('reviewWorkspacesHint'))),
          ranked.length ? h(ChartReveal, { as: 'ol', className: 'cs-review-ranks' }, ranked.map((row, index) => h('li', { key: index },
            h('div', null, h('span', null, row.workspaceTitle || t('unassigned')), h('b', null, formatDuration(row.activeMs, 'short'))),
            h('div', { className: 'cs-review-rank-bottom' },
              h('span', { className: 'cs-review-track', 'aria-hidden': true }, h('i', { className: 'cs-reveal-x', style: { width: `${row.activeMs / workspaceTotal * 100}%`, ...chartStagger(index, ranked.length) } })),
              h('small', null, formatPercent(row.activeMs / workspaceTotal)))))) : h('p', { className: 'cs-review-empty-chart' }, t('reviewNoWorkspaces'))))
    }

    function AnalysisReport({ report, t, onOpenSource, scopeForSource, scopeLocked, onSelectScope, onReviewScope, openErrorId, hoverTip, durationFormat, showHeader = true, footerActions = null }) {
      const details = analysisReportDetails(report, t)
      const { dates, scope, generatedAt, model, summary, statistics, work, suggestions, sources, coverageSummary, coverageNotes } = details
      const open = (source, showWorkspace = false) => {
        const label = source.sessionTitle || source.sessionId
        const display = showWorkspace ? analysisSourceLabel(source) : label
        return h('button', {
          key: source.sessionId, className: 'cs-btn cs-analysis-source', type: 'button',
          'aria-label': t('analysisOpenSource').replace('{name}', () => display), onClick: () => onOpenSource(source),
        }, h('span', null, display), h(DetailGlyph, { name: 'open', size: 13 }))
      }
      const workList = (items, offset = 0) => h('ul', { className: 'cs-analysis-work' }, items.map((item, index) => h('li', { key: index },
        renderReviewPoint(item.text, '', t),
        item.sources.length ? h('div', { className: 'cs-analysis-sources' }, item.sources.map((source) => open(source))) : null)))
      const notes = [details.failureLabel, ...coverageNotes, report.snapshot?.approximate ? t('approximateHint') : ''].filter(Boolean)
      return h('article', { className: 'cs-analysis-report' },
        showHeader ? h(AnalysisReportHeader, { key: `${report.id}:${report.generatedAt}`, report, dates, generatedAt, t }) : null,
        renderReviewMetrics(report, t, durationFormat),
        h('section', { className: 'cs-analysis-abstract' }, h('h3', null, t('reportAbstract')), h('p', null, summary)),
        notes.length ? h('p', { className: 'cs-analysis-state cs-review-coverage-note' }, h(DetailGlyph, { name: 'approx' }), notes.join(' · ')) : null,
        renderReviewCharts(report, t, hoverTip),
        h('section', { className: 'cs-card cs-review-observations' },
          h('div', { className: 'cs-card-head' }, renderCardTitle(t('analysisStatistics'), 'active', null, t('reviewObservationsHint'))),
          renderReviewPoints(statistics, t)),
        h('div', { className: `cs-review-next${suggestions ? '' : ' is-single'}` },
          h('section', { className: 'cs-card cs-review-work' },
            h('div', { className: 'cs-card-head' }, renderCardTitle(t('analysisWork'), 'task', h('span', { className: 'cs-review-count' }, work.length), t('reviewWorkHint'))),
            work.length ? h(React.Fragment, null, workList(work.slice(0, 3)), work.length > 3
              ? h('details', { className: 'cs-review-more cs-disclosure' }, reviewMoreSummary(work.length - 3, t), h('div', { className: 'cs-review-fold-body' }, workList(work.slice(3), 3))) : null)
              : h('p', { className: 'cs-analysis-state' }, t('analysisNoWork'))),
          suggestions ? h('section', { className: 'cs-card cs-review-actions' },
            h('div', { className: 'cs-card-head' }, renderCardTitle(t('analysisSuggestions'), 'next', null, t('reviewNextHint'))),
            renderReviewPoints(suggestions, t, 'reviewAction')) : null),
        h('footer', { className: 'cs-review-evidence', 'aria-label': t('reportDetails') },
          h('details', { className: 'cs-review-evidence-details cs-disclosure' }, h('summary', { onClick: toggleReviewDetails }, t('reviewEvidenceTitle'), h('span', null, coverageSummary)),
          h('div', { className: 'cs-analysis-sidebar' },
            h('dl', { className: 'cs-analysis-meta' },
              h('div', null, h('dt', null, t('analysisReportRange')), h('dd', null, scope)),
              h('div', null, h('dt', null, t('analysisModel')), h('dd', null, model)),
              report.snapshot ? h('div', null, h('dt', null, t('reviewBasis')),
                h('dd', null, t('reviewActualTime'), '；', t('reviewWorkspaceBasis'), ` · ${report.snapshot.timeZone}`)) : null),
            h('section', { className: 'cs-analysis-coverage' },
              h('h3', null, t('reportCoverage')),
              h('p', null, coverageSummary),
              renderAnalysisFailures(details, t, { scopeForSource, scopeLocked, onSelectScope, onReviewScope, onOpenSource, openErrorId }),
              coverageNotes.length ? h('ul', { className: 'cs-analysis-coverage-notes' },
                coverageNotes.map((note) => h('li', { key: note }, note))) : null),
            sources.length ? h('details', { className: 'cs-analysis-source-list cs-disclosure' },
              h('summary', { onClick: toggleReviewDetails }, t('analysisSources').replace('{count}', sources.length)),
              h('div', { className: 'cs-analysis-sources' }, sources.map((source) => open(source, true)))) : null))),
        footerActions ? h('div', { className: 'cs-review-footer-actions' }, footerActions) : null)
    }

    function AnalysisPage({ ctx, t, period, data, modelChoice, onRetryModel, onOpenSettings, onOpenSource, hoverTip, durationFormat, onNoticesChange = null, onReadyChange = null }) {
      const analysis = useAnalysisState(ctx, onRetryModel)
      const [selected, setSelected] = React.useState({ period, workspaceId: '', sessionId: '' })
      const [sourceFailure, setSourceFailure] = React.useState(null)
      const [, setNoticeVersion] = React.useState(0)
      const toolbarRef = React.useRef(null)
      const [filtersOpen, setFiltersOpen] = React.useState(false)
      React.useEffect(() => {
        if (filtersOpen) toolbarRef.current?.focus({ preventScroll: true })
      }, [filtersOpen])
      const reviewPeriod = selected.period
      const { workspaceId, sessionId } = selected
      const { state, error: loadError, running, operation } = analysis
      // 首次读取完成（或失败）后正文高度才稳定；此时再让页脚出现。
      React.useEffect(() => {
        onReadyChange?.(state !== null || Boolean(loadError))
      }, [state, loadError, onReadyChange])
      const request = state?.request
      const reviewRange = reviewScopeRange(reviewPeriod, data)
      // 回顾的筛选范围跟随回顾自己的时间范围，不再借用仪表盘当前周期的明细。
      const scopeState = useDashboard(ctx, 'day', PAGE_REFRESH_MS, 0, {
        enabled: reviewRange !== null,
        view: 'details',
        range: reviewRange,
      })
      // 周期切换会让范围查询短暂回到 loading；保住上一份范围数据，避免筛选区清空后
      // 闪一下「正在同步该周期的范围选项」。新数据到达后立即替换。
      const lastScopeRef = React.useRef(null)
      React.useEffect(() => {
        if (scopeState.status === 'ready' && scopeState.data) lastScopeRef.current = scopeState.data
      }, [scopeState.status, scopeState.data])
      const scopeData = scopeState.status === 'ready'
        ? scopeState.data
        : reviewRange === null ? null : lastScopeRef.current
      const coordinatesFresh = scopeState.status === 'ready'
      const coordinatesReady = scopeData !== null
      const workspaces = scopeData?.workspaces ?? []
      const requestWorkspace = request?.workspaceId ? workspaces.find((row) => row.key === request.workspaceId) : null
      const requestSession = request?.sessionId ? workspaces.flatMap((row) => row.sessions).find((row) => row.sessionId === request.sessionId) : null
      const requestScope = request ? analysisScopeLabel({ ...request, workspaceTitle: requestWorkspace?.workspaceTitle, sessionTitle: requestSession?.sessionTitle }, t) : ''
      const report = state?.reports?.[reviewPeriod]
      const phase = state?.phase
      const failed = phase === 'failed'
      const reportError = failed && request?.period === reviewPeriod
      const errorKey = operation.error || (failed ? ANALYSIS_ERROR_LABELS[state?.error?.code] ?? 'analysisGenerationError' : '')
      const scopeChanged = Boolean(report && ((report.workspaceId || '') !== workspaceId || (report.sessionId || '') !== sessionId ||
        coordinatesFresh && reviewRange !== null && report.from !== reviewRange.from))
      const modelConfigured = Boolean(modelChoice?.provider && modelChoice?.model)
      const needsModel = Boolean(modelChoice && !modelConfigured)
      const modelError = errorKey === 'analysisModelRequired' || errorKey === 'analysisModelUnavailable'
      const { workspaceOptions, sessionOptions } = analysisScopeOptions(workspaces, workspaceId, t)
      const unavailableScope = Boolean(coordinatesFresh && (workspaceId && !workspaceOptions.some((row) => row.value === workspaceId) ||
        sessionId && !sessionOptions.some((row) => row.value === sessionId)))
      const scopeLocked = running || Boolean(operation.method) || !coordinatesReady
      const stage = operation.method ? (operation.method === 'generateAnalysis' ? 'analysisStarting' : 'analysisCancelling') : ANALYSIS_PHASE_LABELS[phase]
      const cancelled = phase === 'cancelled'
      const readFailure = loadError ? h('div', { className: 'cs-analysis-state is-error', role: 'status' },
        t(report ? 'analysisReadError' : 'analysisReadEmptyError'),
        h('button', { type: 'button', className: 'cs-btn', onClick: analysis.reload }, t('settingsRetry'))) : null
      const selectField = (label, value, options, onChange, disabled = false) => h('div', { className: 'cs-analysis-field' },
        h('span', null, t(label)), h(Select, { disabled, value, options, onChange, ariaLabel: t(label) }))
      const resolvedScope = (options, current, all) => [{ value: '', label: t(all) }, ...options,
        ...(current && !options.some((row) => row.value === current) ? [{ value: current, label: current, disabled: true }] : [])]
      const open = (source, fromFailureList = false) => {
        const opened = onOpenSource(source)
        setSourceFailure(opened ? null : { reportId: report.id, source, fromFailureList })
      }
      const openFailure = sourceFailure?.reportId === report?.id ? sourceFailure : null
      const scopeForSource = (source) => {
        if (!coordinatesReady) return null
        const matching = workspaces.filter((row) => row.sessions.some((session) =>
          session.sessionId === source.sessionId && sessionIsOpenable(session)))
        if (!matching.length) return null
        const exactWorkspace = matching.find((row) => row.key === source.workspaceId && !row.key.startsWith('__unassigned_'))
        return { workspaceId: exactWorkspace?.key ?? '', sessionId: source.sessionId }
      }
      const reviewScope = () => {
        setFiltersOpen(true)
        toolbarRef.current?.focus({ preventScroll: true })
        toolbarRef.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
      }
      const selectScope = (target) => {
        if (scopeLocked) return
        setSelected({ period: reviewPeriod, ...target })
        reviewScope()
      }
      const dismissNotice = (key) => {
        ANALYSIS_NOTICE_DISMISSED[key] = true
        setNoticeVersion((value) => value + 1)
      }
      React.useEffect(() => {
        if (!scopeChanged) ANALYSIS_NOTICE_DISMISSED.scopeMismatch = false
      }, [scopeChanged])
      React.useEffect(() => {
        if (!needsModel) ANALYSIS_NOTICE_DISMISSED.modelRequired = false
      }, [needsModel])

      const generateLabel = t(reportError || operation.error ? 'analysisRetryGenerate' : report ? 'analysisRegenerate' : 'analysisGenerate')
      const generateGlyph = analysisGenerateGlyph(Boolean(report), Boolean(reportError || operation.error))
      const selectionLabel = sessionOptions.find((row) => row.value === sessionId)?.label
        || workspaceOptions.find((row) => row.value === workspaceId)?.label || t('reviewAllScope')
      const canGenerate = Boolean(state) && !scopeLocked && !unavailableScope && modelConfigured && !loadError
      const generationActions = () => running ? h('button', { type: 'button', className: 'cs-btn cs-review-generate',
        disabled: phase === 'saving' || Boolean(operation.method), onClick: () => analysis.submit('cancelAnalysis', {}),
      }, t('analysisCancel')) : h(React.Fragment, null,
        h(Info, { label: generateLabel,
          message: modelConfigured
            ? t('analysisModelUse').replace('{route}', () => modelChoice.provider + ' / ' + modelChoice.model) + ' · ' + t(ANALYSIS_PERIOD_LABELS[reviewPeriod]) + ' · ' + selectionLabel
            : modelChoice === false ? t('analysisModelReadError') : !modelChoice ? t('analysisModelLoading') : t('analysisModelRequired'),
          buttonClassName: `cs-btn cs-review-generate${canGenerate ? ' is-primary' : ' is-disabled'}`,
          icon: h(React.Fragment, null, h(DetailGlyph, { name: generateGlyph, size: 15 }), generateLabel),
          ariaDisabled: !canGenerate,
          onClick: () => {
            if (!canGenerate) return
            analysis.submit('generateAnalysis', {
              period: reviewPeriod, ...(workspaceId ? { workspaceId } : {}), ...(sessionId ? { sessionId } : {}),
              expectedProvider: modelChoice.provider, expectedModel: modelChoice.model,
            })
          },
        }),
        needsModel ? h('button', { type: 'button', className: 'cs-btn is-primary cs-review-generate', onClick: onOpenSettings }, t('analysisGoToSettings')) : null)
      // 回顾页的提示登记到顶栏通知区；离开回顾页时撤销，不把上下文提示带到别的视图。
      const noticeItems = []
      if (scopeChanged && !ANALYSIS_NOTICE_DISMISSED.scopeMismatch) {
        noticeItems.push({
          key: 'scopeMismatch', label: t('analysisReportScopeMismatchShort'),
          message: t('analysisReportScopeMismatch'), onDismiss: () => dismissNotice('scopeMismatch'),
        })
      }
      if (needsModel && !errorKey && !running && !ANALYSIS_NOTICE_DISMISSED.modelRequired) {
        noticeItems.push({
          key: 'modelRequired', label: t('analysisModelRequiredShort'),
          message: t('analysisModelRequired'), onDismiss: () => dismissNotice('modelRequired'),
        })
      }
      const noticeSignature = noticeItems.map((item) => `${item.key}:${item.label}:${item.message}`).join('|')
      const noticeItemsRef = React.useRef(noticeItems)
      noticeItemsRef.current = noticeItems
      React.useEffect(() => {
        onNoticesChange?.(noticeItemsRef.current)
      }, [noticeSignature, onNoticesChange])
      React.useEffect(() => () => { onNoticesChange?.([]) }, [onNoticesChange])
      const context = h(React.Fragment, null,
        h('div', { className: 'cs-review-context' },
          h(SelectionGroup, { value: reviewPeriod, className: 'cs-review-periods', role: 'group', 'aria-label': t('analysisPeriod') },
            Object.entries(ANALYSIS_PERIOD_LABELS).map(([value, key]) => h('button', {
              key: value, type: 'button', 'aria-pressed': value === reviewPeriod, className: value === reviewPeriod ? 'is-current' : '',
              onClick: () => setSelected({ period: value, workspaceId: '', sessionId: '' }),
            }, t(key)))),
          h('button', { type: 'button', className: 'cs-review-filter-toggle', 'aria-expanded': filtersOpen,
            'aria-controls': 'cs-review-filters', onClick: () => setFiltersOpen((value) => !value),
          }, h(DetailGlyph, { name: 'filter' }), h('span', null, t('reviewFilters'), ' · ', selectionLabel),
            h('span', { className: 'cs-triangle cs-review-filter-chevron', 'aria-hidden': true }))),
        h('div', { className: 'cs-review-filter-region' + (filtersOpen ? ' is-open' : ''), id: 'cs-review-filters', inert: !filtersOpen ? '' : undefined },
          h('div', { className: 'cs-review-filter-content' },
            h('div', { className: 'cs-analysis-toolbar', role: 'group', 'aria-label': t('analysisRangeFilters'), tabIndex: -1, ref: toolbarRef },
              selectField('analysisWorkspace', workspaceId, resolvedScope(workspaceOptions, workspaceId, 'analysisAllWorkspaces'),
                (value) => setSelected({ period: reviewPeriod, workspaceId: value, sessionId: '' }), scopeLocked || !workspaceOptions.length && !workspaceId),
              selectField('analysisSession', sessionId, resolvedScope(sessionOptions, sessionId, 'analysisAllSessions'),
                (value) => setSelected({ ...selected, sessionId: value }), scopeLocked || !sessionOptions.length && !sessionId)))))
      const messages = h('div', { className: 'cs-review-messages' },
          !coordinatesReady ? h('p', { className: 'cs-analysis-state', role: 'status' }, t('analysisRangeLoading')) : null,
          !modelChoice && !running ? h('div', { className: `cs-analysis-state${modelChoice === false ? ' is-error' : ''}`, role: 'status' },
            t(modelChoice === false ? 'analysisModelReadError' : 'analysisModelLoading'),
            modelChoice === false ? h('button', { type: 'button', className: 'cs-btn', onClick: onRetryModel }, t('settingsRetry')) : null) : null,
          coordinatesFresh && !sessionOptions.length && !running && !sessionId ? h('p', { className: 'cs-analysis-state' }, t('analysisNoScopeSessions')) : null,
          unavailableScope ? h('p', { className: 'cs-analysis-state is-error' }, t('analysisScopeUnavailable')) : null,
          stage ? h('div', { className: 'cs-analysis-status', role: 'status' },
            h('strong', null, t(stage), phase === 'collecting' && state.progress ? ` · ${state.progress.read}/${state.progress.total}` : ''),
            request ? h('span', null, `${t('analysisRunRange')} · ${t(ANALYSIS_PERIOD_LABELS[request.period])} · ${requestScope} · ${analysisDateRange(request)} · ${request.provider} / ${request.model}`) : null,
            phase === 'collecting' && state.progress?.total > 0 ? h('progress', {
              max: state.progress.total, value: state.progress.read, 'aria-label': t('analysisCollecting'),
            }) : null) : null,
          cancelled ? h('p', { className: 'cs-analysis-state', role: 'status' }, t('analysisCancelled'),
            request && request.period !== reviewPeriod ? ` · ${t(ANALYSIS_PERIOD_LABELS[request.period])}` : null) : null,
          errorKey ? h('div', { className: 'cs-analysis-state is-error', role: 'status' }, t(errorKey),
            failed && request ? h('span', null, ` · ${t(ANALYSIS_PERIOD_LABELS[request.period])} · ${requestScope}`,
              Number.isFinite(request.from) && Number.isFinite(request.to) ? ` · ${analysisDateRange(request)}` : null) : null,
            modelError && !needsModel ? h('button', { type: 'button', className: 'cs-btn', onClick: onOpenSettings }, t('analysisGoToSettings')) : null) : null,
          report ? readFailure : null,
          openFailure && !openFailure.fromFailureList ? h('p', { className: 'cs-analysis-state is-error', role: 'status' },
            t('analysisSourceError').replace('{name}', () => openFailure.source.sessionTitle || openFailure.source.sessionId)) : null)
      const details = report ? analysisReportDetails(report, t) : null
      return h('section', { className: 'cs-analysis-page' },
        h(AnalysisReportHeader, { report, period: reviewPeriod, t,
          dates: details?.dates, generatedAt: details?.generatedAt,
          generationControl: generationActions(), context, messages }),
        // 只随用户切换范围转场；异步读取/轮询到报告时不再把整块正文重置为入场透明度。
        h(ContentTransition, { identity: reviewPeriod, className: 'cs-review-content' },
        report ? h(AnalysisReport, { report, t, onOpenSource: open, hoverTip, durationFormat, showHeader: false,
          scopeForSource, scopeLocked, onSelectScope: selectScope, onReviewScope: reviewScope,
          openErrorId: openFailure?.fromFailureList ? openFailure.source.sessionId : null,
          footerActions: generationActions(),
        }) : h('section', { className: 'cs-analysis-empty' },
          h('span', { className: 'cs-analysis-empty-icon' }, h(DetailGlyph, { name: 'report', size: 24 })),
          readFailure ?? h('p', { className: 'cs-analysis-state', role: state ? undefined : 'status' },
            t(stage ? 'reportPending' : state ? 'analysisEmpty' : 'analysisLoading')))))
    }

    /** 概览：首屏大数字、周期卡、趋势卡、每日热力图、任务构成、工作区排行与最近会话。 */
    function renderOverviewView(props) {
      const {
        data, t, isZh, period, onSelectPeriod, durationFormat, hoverTip, nowMs, onOpenSession,
        focus = null, onToggleFocus, heatSeries, heatStatus,
        heatRangeValue = HEAT_DEFAULT_RANGE, onSelectHeatRange,
        heroMetric, onSelectHeroMetric, recentLimit = RECENT_SESSIONS_DEFAULT,
      } = props
      // 首屏态占据整个内容区：只保留重新排版后的独立页，其余概览卡片不渲染。
      if (focus === 'hero') {
        return [renderHeroFocusPage({
          data, t, isZh, period, format: durationFormat, hoverTip, focus, onToggleFocus,
          heroMetric, onSelectHeroMetric,
        })]
      }
      if (focus === 'trend') {
        return [renderTrendFocusPage({
          data, t, isZh, period, format: durationFormat, hoverTip, focus, onToggleFocus,
        })]
      }
      if (focus === 'heatmap') {
        return [renderHeatmapFocusPage({
          series: heatSeries, status: heatStatus, t, format: durationFormat, nowMs, hoverTip,
          rangeValue: heatRangeValue, onSelectRange: onSelectHeatRange, focus, onToggleFocus,
        })]
      }
      const shownPeriod = data?.period ?? period
      const heatmap = renderDailyHeatmap({
        series: heatSeries, status: heatStatus, t, format: durationFormat, nowMs, hoverTip,
        rangeValue: heatRangeValue, onSelectRange: onSelectHeatRange, focus, onToggleFocus,
      })
      const showYear = heatLayoutFor(heatRangeValue) === 'year'
      return [
        h('div', { className: 'cs-overview-grid' },
          renderOverviewMetrics({ data, t, isZh, nowMs, period, onSelectPeriod, format: durationFormat, focus, onToggleFocus, heroMetric }),
          h('div', { className: 'cs-overview-analysis' },
            renderTrendCard(data, t, isZh, hoverTip, durationFormat, shownPeriod, { focus, onToggleFocus }),
            renderComposition(data, t, hoverTip?.tip, { onHover: hoverTip?.show, onLeave: hoverTip?.hide }, durationFormat)),
          h('div', { className: `cs-overview-bottom${showYear ? ' is-year' : ''}` },
            ...(showYear ? [] : [heatmap]),
            renderWorkspaceRanking(data, t, durationFormat, hoverTip),
            renderRecentSessions(data, t, nowMs, onOpenSession, durationFormat, recentLimit, hoverTip)),
          ...(showYear ? [heatmap] : [])),
      ]
    }

    /** 最近会话卡：真实会话优先打开宿主会话页，失败回落明细定位；条数按概览底部行高动态取 3–6 条。 */
    function renderRecentSessions(data, t, nowMs, onOpenSession, format = 'hms', limit = RECENT_SESSIONS_DEFAULT, hoverTip = null) {
      const rows = flattenRecentSessions(data, limit)
      return h('section', { className: 'cs-card cs-recent' },
        h('div', { className: 'cs-card-head' },
          renderCardTitle(t('recentSessions'), 'sessions',
            rows.length > 0 ? h('span', { className: 'cs-tag' }, String(rows.length)) : null, t('moduleTipRecent'))),
        rows.length === 0
          ? h('div', { className: 'cs-empty' }, t('recentSessionsEmpty'))
          : h('div', { className: 'cs-recent-list' }, rows.map((session) => {
              const openable = sessionIsOpenable(session) && typeof onOpenSession === 'function'
              const sessionTitle = session.sessionTitle ?? t('unknownSession')
              // 悬停直接给一份与会话统计预览同源的关键读数，避免为了看时长先跳进会话页。
              const tipRows = [
                { key: 'workspace', label: t('colWorkspace'), value: session.workspaceTitle ?? t('unassigned') },
                { key: 'active', label: t('activeLabel'), value: formatDuration(session.activeMs, format) },
                { key: 'task', label: t('taskLabel'), value: formatDuration(session.taskMs, format) },
                { key: 'count', label: t('taskCountShort'), value: String(finite(session.taskCount)) },
                { key: 'last', label: t('colLast'), value: formatRelativeTime(session.lastActivityAt, t, nowMs) },
              ]
              return h(openable ? 'button' : 'div', {
                key: `${session.workspaceKey}:${session.sessionId}`,
                ...(openable ? {
                  type: 'button',
                  onClick: () => onOpenSession(session),
                } : {}),
                className: `cs-recent-row${openable ? '' : ' is-static'}`,
                ...hoverTipProps(hoverTip, sessionTitle, tipRows),
              },
                h('span', { className: 'cs-recent-name' },
                  session.taskRunning === true ? h('span', {
                    className: 'cs-recent-status', role: 'img', 'aria-label': t('runningTag'), title: t('runningTag'),
                  }) : null,
                  h('span', { className: 'cs-recent-title' }, sessionTitle),
                  h('span', { className: 'cs-recent-workspace' }, session.workspaceTitle ?? t('unassigned'))),
                h('span', { className: 'cs-recent-time' }, formatDuration(session.taskMs, format)),
                h('span', { className: 'cs-recent-last' }, formatRelativeTime(session.lastActivityAt, t, nowMs)))
            })))
    }

    /** 趋势：周期卡 + 趋势图 + 日均/任务次数/峰值摘要，日周月可比较。 */
    function renderTrendView(props) {
      const { data, t, isZh, period, onSelectPeriod, durationFormat, hoverTip, onOpenRange } = props
      const shownPeriod = data?.period ?? period
      const peak = trendPeak(data?.trend, shownPeriod, isZh)
      const share = activeSharePercent(data?.activeMs, data?.onlineMs)
      return [
        renderCycles(data, t, period, onSelectPeriod, durationFormat),
        h('div', { className: 'cs-trend-layout' },
          renderTrendCard(data, t, isZh, hoverTip, durationFormat, shownPeriod, { showFoot: true }),
          h('section', { className: 'cs-card cs-trend-summary' },
            h('div', { className: 'cs-card-head' },
              renderCardTitle(t('trendSummary'), 'summary', null, t('trendInfo'))),
            h('div', { className: 'cs-stat-grid' },
              renderStatBox(t('dailyAverageActive'), formatDuration(averageMsPerDay(data, 'activeMs'), durationFormat)),
              renderStatBox(t('dailyAverageTask'), formatDuration(averageMsPerDay(data, 'taskMs'), durationFormat)),
              renderStatBox(t('taskCountShort'), String(finite(data?.taskCount))),
              renderStatBox(t('peakActive'), peak === null
                ? '—'
                : formatDuration(finite(peak.bucket.activeMs), durationFormat))),
            h('div', { className: 'cs-trend-summary-foot' },
              h('div', { className: 'cs-trend-share-head' },
                h('span', null, t('activeShare')),
                h('b', null, `${share}%`)),
              h(ChartReveal, { className: 'cs-trend-share-track', 'aria-hidden': true },
                h('i', { className: 'cs-reveal-x', style: { width: `${share}%` } })),
              h('div', { className: 'cs-trend-share-caption' },
                `${t('activeLabel')} ${formatDuration(data?.activeMs, durationFormat)} · ${t('onlineLabel')} ${formatDuration(data?.onlineMs, durationFormat)}`)))),
        h('div', { className: 'cs-trend-content' },
          renderTrendBottom(data, t, isZh, shownPeriod, durationFormat, hoverTip, onOpenRange)),
      ]
    }

    /** 明细右上角的统计范围下拉：预设范围直接映射成本地自然日区间。 */
    function renderDetailsRangePicker({ value, t, onSelect, customRange = null, isZh = true }) {
      const options = DETAILS_RANGE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey), key: option.value }))
      if (customRange) options.unshift({ value: 'selected', label: formatSelectedRange(customRange, t, isZh), key: 'selected' })
      return h('div', { className: 'cs-details-range' },
        h('span', { className: 'cs-range' }, t('rangeLabel')),
        h(Select, {
          value: customRange ? 'selected' : normalizeDetailsRange(value), options,
          ariaLabel: t('detailsRangeLabel'), className: 'cs-details-range-select',
          onChange: (next) => { if (next !== 'selected') onSelect?.(next) },
        }))
    }

    /** 会话 B：筛选、累计摘要、分组列表与就地统计共用同一份当前范围快照。 */
    function renderDetailsView(props) {
      const {
        browser: { model, actions }, t, isZh, durationFormat, nowMs,
        hoverTip = null, onOpenSession = null, onInspectSession = null,
      } = props
      const {
        query, statusFilter, sort, detailsRange, customRange, loadStatus,
        rows, summary, session, selection, expanded, allOpen, filtered,
        highlight, progressiveSessions, visibleSessionCounts, subagentByParent, range, openMessageKey,
      } = model
      const selectSession = (value) => { actions.selectSession(value); onInspectSession?.() }
      const runningLabel = t('detailsRunning')
      const runningFilter = loadStatus === 'ready'
        ? `${runningLabel} ${model.runningCount}` : runningLabel
      const toolbar = h('div', { className: 'cs-details-toolbar' },
        h('div', { className: 'cs-search-wrap' },
          h('svg', { className: 'cs-search-icon', viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true },
            h('circle', { cx: 7, cy: 7, r: 4.2 }), h('path', { d: 'M10.1 10.1 13.5 13.5' })),
          h('input', { className: 'cs-search', type: 'search', value: query, placeholder: t('searchPlaceholder'), 'aria-label': t('searchPlaceholder'), onChange: (event) => actions.search(event.target.value) })),
        h('div', { className: 'cs-details-filter', 'data-status': statusFilter, role: 'group', 'aria-label': runningLabel }, ['all', 'running'].map((value) =>
          h('button', { key: value, type: 'button', 'aria-pressed': statusFilter === value, className: statusFilter === value ? 'is-on' : '', onClick: () => actions.filter(value) },
            value === 'all' ? t('detailsAll') : runningFilter))),
        h(Select, { value: sort, ariaLabel: t('detailsSortLabel'), className: 'cs-details-sort', onChange: actions.sort,
          options: [{ value: 'recent', label: t('detailsSortRecent') }, { value: 'task', label: t('detailsSortTask') }, { value: 'active', label: t('detailsSortActive') }] }),
        renderDetailsRangePicker({ value: detailsRange, t, onSelect: actions.selectRange, customRange, isZh }))
      if (loadStatus !== 'ready') return [toolbar,
        h('div', { className: 'cs-card cs-details-loading', role: 'status' },
          h('p', null, t(loadStatus === 'error' ? 'detailsLoadError' : 'detailsLoading')),
          loadStatus === 'error' ? h('button', { type: 'button', className: 'cs-btn', onClick: actions.retry }, t('settingsRetry')) : null)]
      const detailStats = [
        [t('detailsSessionCount'), String(summary.sessionCount), 'sessions'],
        [t('colActive'), formatDuration(summary.activeMs, durationFormat), 'active'],
        [t('colTask'), formatDuration(summary.taskMs, durationFormat), 'task'],
        [t('taskCountShort'), String(summary.taskCount), 'count'],
      ]
      return [toolbar,
        openMessageKey ? h('div', { className: 'cs-details-notice', role: 'status' }, t(openMessageKey)) : null,
        h('div', { className: 'cs-details-stats' }, detailStats.map(([label, value, glyph]) =>
          h('div', { className: `cs-detail-stat is-${glyph}`, key: glyph },
            h('span', { className: 'cs-detail-stat-label' }, h(DetailGlyph, { name: glyph, size: 14 }), label),
            h('b', { className: 'cs-detail-stat-value' }, value)))),
        h('div', { className: 'cs-details-layout' }, h('section', { className: 'cs-card cs-sessions-card' },
          h('div', { className: 'cs-card-head cs-sessions-card-head' },
            h('div', { className: 'cs-card-heading cs-sessions-heading' }, h('div', { className: 'cs-sessions-title-line' },
              h('h2', null, t('detailsSessionsTitle')), h('span', { className: 'cs-sessions-count' }, `${summary.sessionCount} ${t('sessionsUnit')}`))),
            h('div', { className: 'cs-sessions-tools' },
              !filtered && rows.length > 0 ? h('button', { type: 'button', className: 'cs-text-link', onClick: actions.toggleAll }, t(allOpen ? 'detailsCollapseAll' : 'detailsExpandAll')) : null)),
          h('div', { className: 'cs-record-columns' },
            rows.length === 0 ? h('div', { className: 'cs-empty' }, t(filtered ? 'detailsEmpty' : 'emptyDashboard'))
              : h('div', { className: 'cs-workspace-list' }, rows.map((row) => renderWorkspaceRow(
                  row, expanded[row.key] === true, () => actions.toggleWorkspace(row.key),
                  t, nowMs, subagentByParent, durationFormat, hoverTip, highlight?.workspaceKey === row.key ? highlight.sessionId : null,
                  progressiveSessions ? { enabled: true, visibleCount: visibleSessionCounts[row.key] ?? DETAILS_SESSION_INITIAL, onShowMore: () => actions.showMore(row.key) } : null,
                  { sessionId: session?.workspaceKey === row.key ? session.sessionId : null, onSelect: selectSession, openSession: onOpenSession },
                ))),
            renderSessionInspector(session, t, durationFormat, onOpenSession, selection, hoverTip)),
          h('div', { className: 'cs-record-footer' },
            h('span', null, customRange ? formatSelectedRange(customRange, t, isZh) : formatRangeLabel(range, 'month', t, isZh)),
            h('span', null, t('detailsFiltered').replace('{workspaces}', String(rows.length)).replace('{sessions}', String(summary.sessionCount)))))),
      ]
    }

    /**
     * Dashboard 内设置页：表单值来自 Host 草稿，外观/配色来自页面本地主题状态。
     * 纯渲染函数便于组成测试断言控件结构，数据加载与保存逻辑留在 createPage。
     */
    /** Host 分别统计区间和任务，页面用两者合计回报实际导入数量。 */
    function importResultText(result, t) {
      const count = (value) => value && typeof value === 'object'
        ? finite(value.intervals) + finite(value.tasks) : finite(value)
      return t('importResult').replace('{imported}', String(count(result?.imported))).replace('{skipped}', String(count(result?.skipped)))
    }

    /** 从备份记录里取最早/最晚观测时刻，给导入预览一行时间范围；无有效时刻时返回空串。 */
    function importPreviewRange(payload) {
      let min = Infinity
      let max = -Infinity
      for (const record of [...(payload?.intervals ?? []), ...(payload?.tasks ?? [])]) {
        if (record === null || typeof record !== 'object') continue
        const start = Number(record.start)
        const end = Number(record.end ?? record.lastHeartbeat ?? record.lastEventAt ?? start)
        if (Number.isFinite(start)) { min = Math.min(min, start); max = Math.max(max, start) }
        if (Number.isFinite(end)) { min = Math.min(min, end); max = Math.max(max, end) }
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) return ''
      const day = (ms) => {
        const date = new Date(ms)
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      }
      return `${day(min)} — ${day(max)}`
    }

    function renderSettingsView(props) {
      const {
        t, draft, phase, message, noticeState, appearance, palette, sidebarStats = null, systemDark = false,
        dataBusy = '', dataMessage = null, clearStep = false, retrying = false, retryError = null,
        recheckMessage = null, approximateMessage = null,
        importPreview = null, importRestoreSettings = false, importError = '',
        resetStep = false, resetting = false,
        onPatch, onSelectFormat, onRetryLoad, onRetrySave, onExport, onRequestClear, onCancelClear, onClear,
        onPickImportFile, onCancelImport, onImport, onToggleImportSettings, onShowApproximate,
        onRecheckBackfill, onCycleAppearance, onSelectAppearance, onChangePalette,
        onRequestReset, onCancelReset, onResetSettings,
      } = props
      const loadFailed = phase === 'load-error'
      const busy = props.busy ?? (phase === 'loading' || phase === 'saving' || draft === null || loadFailed)
      const appearanceMode = normalizeAppearance(appearance)
      const importRange = importPreview ? importPreviewRange(importPreview.payload) : ''
      const importReportCount = Object.keys(ANALYSIS_PERIOD_LABELS).filter((period) => importPreview?.payload?.reports?.[period]).length
      const saveStatus = h('div', { className: 'cs-settings-feedback' },
        h('span', { className: `cs-settings-status${phase === 'error' || loadFailed ? ' is-error' : ''}`, role: 'status' }, message || t('settingsAutoSave')),
        loadFailed || onRetrySave ? h('button', { type: 'button', className: 'cs-btn', onClick: loadFailed ? onRetryLoad : onRetrySave }, t('settingsRetry')) : null)
      return [h('div', { className: 'cs-settings cs-settings-board' },
        h('div', { className: 'cs-settings-grid' },
          h('section', { className: 'cs-settings-card cs-settings-main cs-settings-basics-card' },
            ...renderBasicSettingsBody(t, draft, busy, onPatch, { selectClass: 'cs-settings-select', split: true, status: saveStatus })),
          h('section', { className: 'cs-settings-card cs-settings-side cs-format-card' },
            renderDurationFormatSection(t, draft?.durationFormat, {
              disabled: busy,
              onSelect: onSelectFormat,
              sidebarPreview: renderSidebarEntry({ stats: sidebarStats, theme: { palette, appearance, systemDark }, t,
                showName: draft?.sidebarShowName === true, showDot: draft?.sidebarDotVisible !== false,
                dotPosition: draft?.sidebarDotPosition, sidebarMetric: draft?.sidebarDuration, format: draft?.durationFormat }),
            })),
          h('section', { className: 'cs-settings-card cs-settings-main cs-appearance-card' },
            h('div', { className: 'cs-settings-card-head' },
              h('div', null,
                h('h3', null, t('settingsSectionAppearance')),
                h('p', { className: 'cs-settings-row-hint' }, t('settingsAppearanceHint'))),
              h('span', { className: 'cs-settings-scope' }, t('settingsAppearanceLocal'))),
            h('div', { className: 'cs-appearance-panel' },
              h('div', { className: 'cs-appearance-group' },
                h('div', { className: 'cs-settings-label' }, t('appearanceLabel')),
                h('div', { className: 'cs-appearance-options' },
                  ['light', 'dark', 'system'].map((mode) => {
                    const active = appearanceMode === mode
                    const label = t(appearanceLabelKey(mode))
                    return h('button', {
                      key: mode, type: 'button',
                      className: `cs-appearance-opt cs-appearance-opt-${mode}${active ? ' is-on' : ''}`,
                      'aria-label': label,
                      'aria-pressed': active,
                      onClick: () => onSelectAppearance?.(mode),
                    },
                    h('span', { className: 'cs-appearance-preview', 'aria-hidden': true },
                      h('i', { className: 'cs-appearance-preview-side' }),
                      h('span', { className: 'cs-appearance-preview-body' },
                        h('i', null), h('i', null))),
                    h('span', { className: 'cs-appearance-opt-name' }, label),
                    active ? h('span', { className: 'cs-appearance-check', 'aria-hidden': true }, '✓') : null)
                  }))),
              h('div', { className: 'cs-appearance-group' },
                h('div', { className: 'cs-settings-label' }, t('paletteLabel')),
                h('div', { className: 'cs-palette-options' },
                  PALETTES.map((value) => {
                    const labelKey = PALETTE_LABELS[value]
                    const active = palette === value
                    return h('button', {
                      key: value, type: 'button',
                      className: `cs-palette-opt cs-palette-${value}${active ? ' is-on' : ''}`,
                      'aria-label': t(labelKey),
                      'aria-pressed': active,
                      onClick: () => onChangePalette?.(value),
                    },
                    h('span', { className: 'cs-palette-preview', 'aria-hidden': true },
                      h('i', null), h('i', null), h('i', null)),
                    h('span', { className: 'cs-palette-opt-name' }, t(labelKey)),
                    active ? h('span', { className: 'cs-appearance-check', 'aria-hidden': true }, '✓') : null)
                  }))))),
          h('section', { className: 'cs-settings-card cs-settings-side cs-settings-reset-card' },
            ...renderResetSettingsBody(t, {
              disabled: busy,
              resetting,
              resetStep,
              onRequest: onRequestReset,
              onCancel: onCancelReset,
              onReset: onResetSettings,
            })),
          ...(props.timeTools ? [h('div', { className: 'cs-settings-card cs-settings-tools-card' }, props.timeTools)] : []),
          h('section', { className: 'cs-settings-card cs-settings-main cs-notices-card' },
            h('h3', null, t('settingsSectionNotices')),
            h('p', { className: 'cs-settings-row-hint' }, t('settingsNoticesHint')),
            noticeState?.status === 'error'
              ? h('p', { className: 'cs-notice-empty' }, t('backfillNoticeUnavailable'))
              : noticeState?.data === null || noticeState?.data === undefined
                ? h('p', { className: 'cs-notice-empty' }, t('loading'))
                : renderBackfillNotices(noticeState.data, t),
            h('div', { className: 'cs-data-actions cs-settings-recheck' },
              h('button', {
                type: 'button',
                className: 'cs-btn',
                disabled: retrying === true,
                onClick: () => onRecheckBackfill?.(),
              }, retrying === true ? t('settingsRechecking') : t('settingsRecheck')),
              recheckMessage
                ? h('span', { className: `cs-data-status${recheckMessage.error ? ' is-error' : ''}`, role: 'status' }, recheckMessage.text)
                : retryError
                  ? h('span', { className: 'cs-data-status is-error', role: 'status' }, String(retryError))
                  : null)),
          h('section', { className: 'cs-settings-card cs-settings-side cs-data-card' },
            h('h3', null, t('dataTitle')),
            h('p', { className: 'cs-settings-row-hint' }, t('dataHint')),
            h('div', { className: 'cs-data-actions' },
              h('button', {
                type: 'button', className: 'cs-btn', disabled: dataBusy !== '',
                onClick: () => onExport?.('json'),
              }, dataBusy === 'json' ? t('exporting') : t('exportJson')),
              h('button', {
                type: 'button', className: 'cs-btn', disabled: dataBusy !== '',
                onClick: () => onExport?.('csv'),
              }, dataBusy === 'csv' ? t('exporting') : t('exportCsv')),
              h('label', { className: 'cs-btn cs-btn-file' },
                t('importData'),
                h('input', {
                  type: 'file', accept: '.json,application/json', className: 'cs-file-input',
                  'aria-label': t('importData'), disabled: dataBusy !== '',
                  onChange: (event) => onPickImportFile?.(event),
                }))),
            h('div', { className: 'cs-import-hint' },
              h('span', null, t('importHint')),
              h('span', { className: 'cs-import-file-state', role: 'status' },
                importPreview
                  ? `${t('importFilePicked')}${String(importPreview.filename ?? '')}`
                  : t('importFileHint'))),
            h(AnimatedCollapse, { open: Boolean(importPreview) }, importPreview
              ? h('div', { className: 'cs-import-preview' },
                  h('strong', null, t('importPreviewTitle')),
                  h('span', null, `${String(importPreview.filename ?? '')} · ${t('importIntervals')} ${importPreview.payload?.intervals?.length ?? 0} · ${t('importTasks')} ${importPreview.payload?.tasks?.length ?? 0}`),
                  importReportCount || importPreview.payload?.lastTimerResult ? h('span', null, [
                    importReportCount ? `${t('importReports')} ${importReportCount}` : '',
                    importPreview.payload?.lastTimerResult ? t('importTimerResult') : '',
                  ].filter(Boolean).join(' · ')) : null,
                  importRange ? h('span', { className: 'cs-settings-row-hint' }, importRange) : null,
                  h('label', { className: 'cs-settings-switch' },
                    h('input', {
                      type: 'checkbox', checked: importRestoreSettings === true,
                      disabled: dataBusy !== '',
                      onChange: (event) => onToggleImportSettings?.(event?.target?.checked === true),
                    }),
                    h('span', null, t('importRestoreSettings'))),
                  h('div', { className: 'cs-clear-buttons' },
                    h('button', {
                      type: 'button', className: 'cs-btn', onClick: () => onCancelImport?.(),
                    }, t('importCancel')),
                    h('button', {
                      type: 'button', className: 'cs-btn is-primary', disabled: dataBusy !== '',
                      onClick: () => onImport?.(),
                    }, dataBusy === 'import' ? t('loading') : t('importConfirm'))))
              : null),
            importError
              ? h('div', { className: 'cs-data-status is-error', role: 'status' }, String(importError))
              : null,
            h('div', { className: 'cs-approx-reveal' },
              h('span', { className: 'cs-settings-row-hint' }, t('approximateShowAgainHint')),
              h('button', {
                type: 'button', className: 'cs-text-link', onClick: () => onShowApproximate?.(),
              }, t('approximateShowAgain')),
              approximateMessage
                ? h('span', { className: `cs-data-status${approximateMessage.error ? ' is-error' : ''}`, role: 'status' }, approximateMessage.text)
                : null),
            h('div', { className: 'cs-data-danger' }, h('button', {
              type: 'button', className: 'cs-btn is-danger', disabled: dataBusy !== '',
              onClick: () => onRequestClear?.(),
            }, t('clearData'))),
            h(AnimatedCollapse, { open: clearStep }, clearStep
              ? h('div', { className: 'cs-clear-confirm', role: 'alertdialog', 'aria-label': t('clearStepTitle') },
                  h('strong', null, t('clearStepTitle')),
                  h('p', null, t('clearStepHint')),
                  h('div', { className: 'cs-clear-buttons' },
                    h('button', {
                      type: 'button', className: 'cs-btn', disabled: dataBusy !== '',
                      onClick: () => onCancelClear?.(),
                    }, t('clearCancel')),
                    h('button', {
                      type: 'button', className: 'cs-btn is-danger is-solid', disabled: dataBusy !== '',
                      onClick: () => onClear?.(),
                    }, dataBusy === 'clear' ? t('clearing') : t('clearConfirm'))))
              : null),
            dataMessage
              ? h('div', {
                  className: `cs-data-status${dataMessage.error ? ' is-error' : ''}`,
                  role: 'status',
                }, dataMessage.text)
              : null)))]
    }

    function createPage(ctx, timerClient = createTimerClient(ctx)) {
      return function DshTimespanPage(props) {
        const t = props?.t ?? ((key) => key)
        // 语言切换后仪表盘整页换文案；isZh 仍在渲染时从 t 现读，不缓存。
        useLanguageRevision()
        const isZh = t('periodDay') === '日'
        const [period, setPeriod] = React.useState(() => {
          try { const value = window.sessionStorage.getItem('dsh-timespan.period'); return ['day', 'week', 'month'].includes(value) ? value : 'day' }
          catch { return 'day' }
        })
        const [view, setView] = React.useState(() => {
          try { return normalizeView(window.sessionStorage.getItem('dsh-timespan.view')) }
          catch { return 'overview' }
        })
        // 首屏放大态持久化在浏览器本地设置：退出页面再进入仍保持，非法旧值回落普通概览。
        const [focus, setFocus] = React.useState(() => readStoredFocus())
        // 首屏主指标同样持久化：五个时长项切换后刷新、切视图、缩回再放大都保持。
        const [heroMetric, setHeroMetric] = React.useState(() => readStoredHeroMetric())
        // 热力图范围只影响概览取数：3m/6m/year 或数字月份 1–12。
        const [heatRangeValue, setHeatRangeValue] = React.useState(HEAT_DEFAULT_RANGE)
        // 最近会话条数按概览底部行高动态测量，默认 5 条，限制在 3–6 条。
        const [recentLimit, setRecentLimit] = React.useState(RECENT_SESSIONS_DEFAULT)
        const [switchingView, setSwitchingView] = React.useState(false)
        const [pendingView, setPendingView] = React.useState(null)
        // 回顾页异步读取报告状态：正文未就绪前不渲染页脚，避免页脚在页面变高时闪一下。
        const [analysisReady, setAnalysisReady] = React.useState(false)
        // 回顾页的上下文提示由页面上报到顶栏，离开回顾页即撤销，不跨视图残留。
        const [analysisNotices, setAnalysisNotices] = React.useState([])
        const switchingTimerRef = React.useRef(null)
        const viewsRef = React.useRef(null)
        const viewSurfaceRef = React.useRef(null)
        useSurfaceFade(!switchingView, viewSurfaceRef)
        const [palette, setPalette] = React.useState(() => {
          try { return normalizePalette(window.localStorage.getItem('dsh-timespan.palette')) }
          catch { return 'blue' }
        })
        const [appearance, setAppearance] = React.useState(() => {
          try { return normalizeAppearance(window.localStorage.getItem('dsh-timespan.appearance')) }
          catch { return 'system' }
        })
        const [systemDark, setSystemDark] = React.useState(systemPrefersDark)
        const [paletteSaveError, setPaletteSaveError] = React.useState(false)
        // system 外观随系统配色变化；light/dark 不受影响。
        React.useEffect(() => {
          if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
          const media = window.matchMedia('(prefers-color-scheme: dark)')
          const onChange = (event) => {
            setSystemDark(event?.matches === true)
            notifyThemeChanged()
          }
          if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange)
          else if (typeof media.addListener === 'function') media.addListener(onChange)
          return () => {
            if (typeof media.removeEventListener === 'function') media.removeEventListener('change', onChange)
            else if (typeof media.removeListener === 'function') media.removeListener(onChange)
          }
        }, [])
        const resolvedAppearance = resolveAppearance(appearance, systemDark)
        const pageClassName = `cs-page cs-palette-${palette} cs-appearance-${resolvedAppearance}`
        const appearanceToggleLabel = t('appearanceToggle').replace('{mode}', t(appearanceLabelKey(appearance)))
        const applyAppearance = (value) => {
          const next = normalizeAppearance(value)
          setAppearance(next)
          try { window.localStorage.setItem('dsh-timespan.appearance', next); setPaletteSaveError(false) }
          catch { setPaletteSaveError(true) }
          notifyThemeChanged()
        }
        const cycleAppearanceMode = () => applyAppearance(cycleAppearance(appearance))
        const changePalette = (value) => {
          const normalized = normalizePalette(value)
          setPalette(normalized)
          try { window.localStorage.setItem('dsh-timespan.palette', normalized); setPaletteSaveError(false) }
          catch { setPaletteSaveError(true) }
          notifyThemeChanged()
        }
        // 配色与外观一样是单枚循环图标；只读 localStorage，不写 Host 统计设置。
        const cyclePalette = () => {
          const index = PALETTES.indexOf(normalizePalette(palette))
          changePalette(PALETTES[(index + 1) % PALETTES.length])
        }
        const paletteNameKey = PALETTE_LABELS[palette]
        const paletteToggleLabel = t('paletteToggle').replace('{name}', t(paletteNameKey))
        React.useEffect(() => { try { window.sessionStorage.setItem('dsh-timespan.period', period) } catch {} }, [period])
        React.useEffect(() => { try { window.sessionStorage.setItem('dsh-timespan.view', view) } catch {} }, [view])
        const [pollMs, setPollMs] = React.useState(PAGE_REFRESH_MS)
        const [refreshNonce, setRefreshNonce] = React.useState(0)
        // 设置页选择格式后的即时预览；保存/取消后清空，回到 Host 的已保存值。
        const [previewFormat, setPreviewFormat] = React.useState(null)
        const [readBackfillId, setReadBackfillId] = React.useState('')
        const [dismissingBackfill, setDismissingBackfill] = React.useState(false)
        const [dismissError, setDismissError] = React.useState(null)
        const [retrying, setRetrying] = React.useState(false)
        const [retryError, setRetryError] = React.useState(null)
        // 设置页「重新扫描历史任务」的可见结果；与概览页回填横幅的 retryError 分开，避免点了没反馈。
        const [recheckMessage, setRecheckMessage] = React.useState(null)
        const settingsOpen = view === 'settings'
        const settingsEditor = useSettingsEditor(ctx, settingsOpen, (themeSaved) => {
          setAppearance('system')
          setPalette('blue')
          setPaletteSaveError(!themeSaved)
        })
        // 数据变更后重读近似说明；设置表单的刷新由共用编辑流程处理。
        const [settingsLoadNonce, setSettingsLoadNonce] = React.useState(0)
        // 近似说明的关闭状态只存 Host；清空/恢复数据后自动重置为未关闭。
        const [approxDismissed, setApproxDismissed] = React.useState(false)
        const [modelChoice, setModelChoice] = React.useState(null)
        React.useEffect(() => {
          let active = true
          setModelChoice(null)
          callHost(ctx, 'getSettings', {}).then((value) => {
            if (!active) return
            setApproxDismissed(value?.approximateNoticeDismissed === true)
            setModelChoice({ provider: value?.analysisProvider, model: value?.analysisModel })
          }).catch(() => { if (active) setModelChoice(false) })
          return () => { active = false }
        }, [ctx, settingsLoadNonce])
        React.useEffect(() => {
          const refresh = () => setSettingsLoadNonce((value) => value + 1)
          window.addEventListener?.('focus', refresh)
          return () => window.removeEventListener?.('focus', refresh)
        }, [])
        const [noticeState, setNoticeState] = React.useState({ status: 'idle', data: null })
        const [noticeNonce, setNoticeNonce] = React.useState(0)
        const state = useDashboard(ctx, period, pollMs, refreshNonce)
        const sessionBrowser = useSessionBrowser(ctx, {
          period, refreshMs: pollMs, refreshNonce,
          enabled: view === 'details',
        })
        const hoverTip = useHoverTip()
        React.useEffect(() => { hoverTip.hide() }, [period])
        const [, setTick] = React.useState(0)

        // 相对时间（最近活动）每秒重算；数字本身仍来自同一份 Host 快照。
        React.useEffect(() => {
          const timer = setInterval(() => setTick((value) => value + 1), 1000)
          return () => clearInterval(timer)
        }, [])

        const data = state.data
        const durationFormat = normalizeDurationFormat(previewFormat ?? data?.durationFormat)
        const backfill = data?.backfill ?? normalizeBackfill(null)
        // 本地点「知道了」后立即收起当前事件；新事件换代后不能复用旧覆盖值。
        const effectiveBackfill = readBackfillId !== '' && readBackfillId === backfill.eventId
          ? { ...backfill, readEventId: readBackfillId }
          : backfill
        const [showPeriodWait, setShowPeriodWait] = React.useState(false)
        const switchingPeriod = data !== null && data.period !== period
        React.useEffect(() => {
          setShowPeriodWait(false)
          if (!switchingPeriod) return undefined
          const timer = window.setTimeout(() => setShowPeriodWait(true), 300)
          return () => window.clearTimeout(timer)
        }, [switchingPeriod, period])
        // 回填进行时加快轮询；状态翻转（running → done / 重试后 running）
        // 会让 useDashboard 立刻再取一次，数字无需刷新页面即可出现。
        React.useEffect(() => {
          setPollMs(backfill.status === 'running' ? BACKFILL_REFRESH_MS : PAGE_REFRESH_MS)
        }, [backfill.status])

        // 设置在另一个面板保存、或数据被清空时，立刻重新取数展示新口径/空状态。
        React.useEffect(() => subscribeSettingsChanged(() => {
          setPreviewFormat(null)
          setRefreshNonce((value) => value + 1)
          setSettingsLoadNonce((value) => value + 1)
          setNoticeNonce((value) => value + 1)
        }), [])
        // 设置页选择数字格式时只广播草稿值：整页立即预览，不写 Host。
        React.useEffect(() => subscribeDurationFormatPreview((value) => setPreviewFormat(value)), [])

        const [clearStep, setClearStep] = React.useState(false)
        const [dataBusy, setDataBusy] = React.useState('')
        const [dataMessage, setDataMessage] = React.useState(null)
        // 数据管理里「重新显示近似记录说明」的可见结果：无论当前有没有近似记录，都要给出明确回复。
        const [approximateMessage, setApproximateMessage] = React.useState(null)
        // 备份恢复：Client 只负责读文件与前置校验，预览确认后交给 Host importData 写库。
        const [importPreview, setImportPreview] = React.useState(null)
        const [importRestoreSettings, setImportRestoreSettings] = React.useState(false)
        const [importError, setImportError] = React.useState('')
        const rejectImport = (message) => {
          setImportPreview(null)
          setImportError(message)
        }
        const onPickImportFile = (event) => {
          const file = event?.target?.files?.[0]
          if (!file) return
          setImportError('')
          setDataMessage(null)
          if (typeof FileReader === 'undefined') { rejectImport(t('importReadFailed')); return }
          const reader = new FileReader()
          reader.onload = () => {
            let payload = null
            try { payload = JSON.parse(String(reader.result ?? '')) } catch { rejectImport(t('importReadFailed')); return }
            if ((payload?.format !== EXPORT_FORMAT && payload?.format !== LEGACY_EXPORT_FORMAT) || payload?.version !== 1 ||
                !Array.isArray(payload.intervals) || !Array.isArray(payload.tasks)) {
              rejectImport(t('importInvalid'))
              return
            }
            setImportPreview({ payload, filename: String(file.name ?? '') })
            setImportRestoreSettings(false)
          }
          reader.onerror = () => rejectImport(t('importReadFailed'))
          try { reader.readAsText(file) } catch { rejectImport(t('importReadFailed')) }
          // 允许连续选择同一个文件也重新触发 onChange。
          if (event?.target) event.target.value = ''
        }
        const onCancelImport = () => { setImportPreview(null); setImportError('') }
        const onImport = async () => {
          if (importPreview === null || dataBusy !== '') return
          setDataBusy('import')
          setImportError('')
          setDataMessage(null)
          try {
            const result = await callHost(ctx, 'importData', {
              ...importPreview.payload,
              restoreSettings: importRestoreSettings === true,
            })
            const resultText = importResultText(result, t)
            setImportPreview(null)
            setDataMessage({ text: `${t('importSuccess')} · ${resultText}`, error: false })
            // 导入产生了新的数据代次，近似说明重新显示。
            setApproxDismissed(false)
            await callSettings(ctx, 'setSettings', { approximateNoticeDismissed: false }).catch(() => {})
            notifySettingsChanged()
          } catch (error) {
            setImportError(String(error?.message ?? t('importReadFailed')))
          } finally {
            setDataBusy('')
          }
        }

        // 导航立即响应，旧内容短暂退出；连续点击替换目的地，不吞掉后续操作。
        const goToView = (target) => {
          const next = normalizeView(target)
          if (next === (pendingView ?? view)) return
          if (switchingTimerRef.current !== null) {
            window.clearTimeout(switchingTimerRef.current)
            switchingTimerRef.current = null
          }
          if (next === view) { setPendingView(null); setSwitchingView(false); return }
          if (view === 'details') sessionBrowser.actions.clearHighlight()
          if (previewFormat !== null) {
            setPreviewFormat(null)
            notifySettingsChanged()
          }
          if (prefersReducedMotion()) {
            setPendingView(null)
            setSwitchingView(false)
            if (next === 'analysis') setAnalysisReady(false)
            setView(next)
            return
          }
          setPendingView(next)
          setSwitchingView(true)
          if (next === 'analysis') setAnalysisReady(false)
          switchingTimerRef.current = window.setTimeout(() => {
            switchingTimerRef.current = null
            setView(next)
            setPendingView(null)
            setSwitchingView(false)
          }, viewTransitionDelay(false))
        }
        React.useEffect(() => () => {
          if (switchingTimerRef.current !== null) window.clearTimeout(switchingTimerRef.current)
        }, [])
        // 切换视图或放大态时重置实际承接滚动的页面。
        React.useEffect(() => {
          const page = viewsRef.current?.closest('.cs-page')
          if (page) page.scrollTop = 0
        }, [view, focus])
        const detailHighlight = sessionBrowser.model.highlight
        React.useEffect(() => {
          if (view !== 'details' || !detailHighlight || detailHighlight.located) return
          const target = Array.from(viewsRef.current?.querySelectorAll('.cs-session[data-session-id]') ?? [])
            .find((row) => row.getAttribute('data-session-id') === detailHighlight.sessionId &&
              row.closest('[data-workspace-key]')?.getAttribute('data-workspace-key') === detailHighlight.workspaceKey)
          if (!target) return
          target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
          sessionBrowser.actions.markLocated()
        }, [view, detailHighlight])
        // 每次进入概览都回到近 3 个月，不记住上一次的范围选择。
        React.useEffect(() => {
          if (view === 'overview' && focus === null) setHeatRangeValue(HEAT_DEFAULT_RANGE)
        }, [view, focus])
        // 用同排行卡、热力图卡的自然内容高度估算最近会话条数，避免网格拉伸后的高度反过来受会话条数影响。
        React.useEffect(() => {
          if (view !== 'overview' || focus !== null) {
            setRecentLimit(RECENT_SESSIONS_DEFAULT)
            return undefined
          }
          if (typeof window === 'undefined') return undefined
          let frame = null
          const measure = () => {
            const root = viewsRef.current
            const grid = root?.querySelector?.('.cs-overview-grid')
            const card = grid?.querySelector?.('.cs-recent')
            if (!card) {
              setRecentLimit(RECENT_SESSIONS_DEFAULT)
              return
            }
            const cardRect = card.getBoundingClientRect()
            const rowHeight = Math.max(0, ...Array.from(grid.querySelectorAll('.cs-overview-bottom > .cs-card')).map((anchor) => {
              if (anchor === card || Math.abs(anchor.getBoundingClientRect().top - cardRect.top) > 1) return 0
              const style = window.getComputedStyle(anchor)
              const contentHeight = Array.from(anchor.children).reduce((height, child) => height + child.getBoundingClientRect().height, 0)
              return Math.max(parseFloat(style.minHeight) || 0, contentHeight +
                (parseFloat(style.rowGap) || 0) * Math.max(0, anchor.children.length - 1) +
                ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0))
            }))
            if (rowHeight <= 0) {
              setRecentLimit(RECENT_SESSIONS_DEFAULT)
              return
            }
            const head = card.querySelector('.cs-card-head')
            const style = window.getComputedStyle(card)
            const chrome = (head?.getBoundingClientRect().height ?? 24) +
              (head ? parseFloat(window.getComputedStyle(head).marginBottom) || 0 : 0) +
              parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0') +
              parseFloat(style.borderTopWidth || '0') + parseFloat(style.borderBottomWidth || '0')
            const row = card.querySelector('.cs-recent-row')
            const rowPx = row?.getBoundingClientRect().height || RECENT_ROW_FALLBACK_PX
            const next = recentLimitForRow({ rowHeight, rowPx, chromePx: chrome })
            setRecentLimit((previous) => previous === next ? previous : next)
          }
          const schedule = () => {
            if (frame !== null) return
            if (typeof window.requestAnimationFrame === 'function') {
              frame = window.requestAnimationFrame(() => { frame = null; measure() })
            } else {
              frame = window.setTimeout(() => { frame = null; measure() }, 0)
            }
          }
          measure()
          let observer = null
          const anchors = viewsRef.current?.querySelectorAll?.('.cs-overview-bottom > .cs-ranking, .cs-overview-bottom > .cs-heatmap-card')
          if (anchors?.length && typeof window.ResizeObserver === 'function') {
            observer = new window.ResizeObserver(schedule)
            for (const anchor of anchors) {
              observer.observe(anchor)
              for (const child of anchor.children) observer.observe(child)
            }
          }
          if (typeof window.addEventListener === 'function') window.addEventListener('resize', schedule)
          return () => {
            if (observer) observer.disconnect()
            if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', schedule)
            if (frame !== null) {
              if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
              else window.clearTimeout(frame)
            }
          }
        }, [view, focus, heatRangeValue, state.status, isZh, period])

        // 通知记录独立加载；旧 Host 缺少通知方法不影响设置编辑。
        React.useEffect(() => {
          if (!settingsOpen) return undefined
          let active = true
          setNoticeState({ status: 'loading', data: null })
          callHost(ctx, 'getBackfillStatus', {}).then((value) => {
            if (!active) return
            setNoticeState({ status: 'ready', data: normalizeBackfill(value) })
          }).catch(() => {
            if (!active) return
            setNoticeState({ status: 'error', data: null })
          })
          return () => { active = false }
        }, [ctx, settingsOpen, noticeNonce])

        const onExport = async (format) => {
          if (dataBusy !== '') return
          setDataBusy(format)
          setDataMessage(null)
          try {
            const file = await callHost(ctx, 'exportData', { format })
            downloadExport(file)
            setDataMessage({
              text: file?.truncated === true ? t('exportTruncated') : t('exportDone'),
              error: false,
            })
          } catch {
            setDataMessage({ text: t('exportError'), error: true })
          } finally {
            setDataBusy('')
          }
        }

        const onClear = async () => {
          if (dataBusy !== '') return
          setDataBusy('clear')
          setDataMessage(null)
          try {
            await callHost(ctx, 'clearData', {})
            setClearStep(false)
            setDataMessage({ text: t('cleared'), error: false })
            // 清空数据同样是新的数据代次，近似说明重新显示。
            setApproxDismissed(false)
            await callSettings(ctx, 'setSettings', { approximateNoticeDismissed: false }).catch(() => {})
            // 广播而不把空状态写进本地：下一次取数由 Host 给出真实结果。
            notifySettingsChanged()
          } catch {
            setDataMessage({ text: t('clearError'), error: true })
          } finally {
            setDataBusy('')
          }
        }

        const onRetryBackfill = async () => {
          if (retrying) return
          setRetrying(true)
          setRetryError(null)
          setRecheckMessage(null)
          try {
            await callHost(ctx, 'retryBackfill', {})
            setRefreshNonce((value) => value + 1)
            setNoticeNonce((value) => value + 1)
            setRecheckMessage({ text: t('settingsRecheckDone'), error: false })
          } catch (error) {
            setRetryError(String(error?.message ?? error))
            setRecheckMessage({ text: t('settingsRecheckError'), error: true })
          } finally {
            setRetrying(false)
          }
        }

        // 「知道了」写入 Host 的已读锚点：组件重挂载、切视图与刷新后由同一份
        // 状态决定不再显示；只写 meta，不在页面里用 localStorage 记已读。
        const onDismissBackfill = async () => {
          if (dismissingBackfill || backfill.eventId === '') return
          setDismissingBackfill(true)
          setDismissError(null)
          try {
            await callHost(ctx, 'markBackfillRead', { eventId: backfill.eventId })
            setReadBackfillId(backfill.eventId)
          } catch (error) {
            setDismissError(String(error?.message ?? error))
          } finally {
            setDismissingBackfill(false)
          }
        }
        // 优先打开宿主会话页；服务缺失、归档或未知会话时回落到插件内的定位高亮。
        const openSessionFromPage = (session) => {
          if (!sessionIsOpenable(session)) return
          if (openSessionInHost(ctx, session)) return
          if (sessionBrowser.actions.revealSession(session)) goToView('details')
        }
        const openTrendSessions = (range) => {
          if (sessionBrowser.actions.openRange(range)) goToView('details')
        }
        // 同一个首屏值再次点击即缩回；写入失败只放弃持久化，页面内状态照常切换。
        const toggleFocus = (value) => {
          setFocus((previous) => {
            const next = previous === value ? null : value
            writeStoredFocus(undefined, next)
            return next
          })
        }
        // 点击统计面板里的时长项即切换首屏主指标；写入失败只放弃持久化。
        const selectHeroMetric = (value) => {
          const next = normalizeHeroMetric(value)
          setHeroMetric(next)
          writeStoredHeroMetric(undefined, next)
        }
        const nowMs = Date.now()
        // 范围由页面状态解析成本地日历区间；跨午夜时 from/to 自然前移，页面无需额外状态。
        const heatRange = resolveHeatRange(heatRangeValue, nowMs)
        const heatState = useDailySeries(ctx, heatRange, PAGE_REFRESH_MS, refreshNonce, view === 'overview')
        const approximateAvailable = approximateNoticeVisible(data)
        const hasApproximate = approximateAvailable && !approxDismissed
        const onDismissApproximate = async () => {
          setApproxDismissed(true)
          setApproximateMessage(null)
          try {
            await callSettings(ctx, 'setSettings', { approximateNoticeDismissed: true })
            notifySettingsChanged()
          } catch {
            setApproxDismissed(false)
          }
        }
        const onShowApproximate = async () => {
          setApproximateMessage(null)
          setApproxDismissed(false)
          try {
            await callSettings(ctx, 'setSettings', { approximateNoticeDismissed: false })
            notifySettingsChanged()
            // 没有近似记录时提示条本来就不会出现；这里明确说明，避免再次出现「点了没反应」。
            setApproximateMessage({
              text: approximateAvailable ? t('approximateShowRestored') : t('approximateShowNoData'),
              error: false,
            })
          } catch {
            setApproxDismissed(true)
            setApproximateMessage({ text: t('approximateShowError'), error: true })
          }
        }
        const renderView = () => {
          if (data === null && view !== 'settings') {
            const failed = state.status === 'error'
            return [h('div', { className: `cs-loading${failed ? ' is-error' : ''}` },
              failed ? null : h('span', { className: 'cs-spinner' }),
              h('strong', null, t(failed ? 'errorTitle' : 'loadingTitle')),
              h('span', null, t(failed ? 'retryHint' : 'loading')))]
          }
          if (view === 'trend') {
            return renderTrendView({
              data, t, isZh, period, onSelectPeriod: setPeriod, durationFormat, hoverTip, nowMs, onOpenRange: openTrendSessions,
            })
          }
          if (view === 'details') {
            return renderDetailsView({
              browser: sessionBrowser, t, isZh, durationFormat, nowMs, hoverTip,
              onOpenSession: openSessionFromPage,
              onInspectSession: () => {
                if (window.innerWidth <= 900) window.requestAnimationFrame(() =>
                  document.getElementById('cs-session-inspector')?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'instant' : 'smooth' }))
              },
            })
          }
          if (view === 'analysis') {
            return [h(AnalysisPage, {
              ctx, t, data, period, modelChoice, hoverTip, durationFormat,
              onRetryModel: () => setSettingsLoadNonce((value) => value + 1),
              onOpenSettings: () => goToView('settings'),
              onOpenSource: (source) => openSessionInHost(ctx, source),
              onNoticesChange: setAnalysisNotices,
              onReadyChange: setAnalysisReady,
            })]
          }
          if (view === 'settings') {
            return renderSettingsView({
              t,
              draft: settingsEditor.draft,
              phase: settingsEditor.phase,
              busy: settingsEditor.busy,
              message: settingsEditor.messageKey ? t(settingsEditor.messageKey) : '',
              noticeState,
              sidebarStats: { ...data?.cycles?.day, receivedAt: state.receivedAt, activeRunning: data?.activeRunning, taskRunning: data?.taskRunning, running: data?.running },
              systemDark,
              appearance,
              palette,
              dataBusy,
              dataMessage,
              clearStep,
              retrying,
              retryError,
              recheckMessage,
              approximateMessage,
              resetStep: settingsEditor.resetStep,
              resetting: settingsEditor.resetting,
              onPatch: settingsEditor.patch,
              onSelectFormat: (value) => settingsEditor.patch('durationFormat', value),
              onRequestReset: settingsEditor.requestReset,
              onCancelReset: settingsEditor.cancelReset,
              onResetSettings: settingsEditor.reset,
              onRetryLoad: settingsEditor.reload,
              onRetrySave: settingsEditor.messageKey === 'settingsSaveError' ? settingsEditor.retrySave : undefined,
              timeTools: h(TimeToolsSettings, {
                ctx, t, draft: settingsEditor.draft, busy: settingsEditor.busy, onPatch: settingsEditor.patch,
              }),
              onExport,
              importPreview,
              importRestoreSettings,
              importError,
              onPickImportFile,
              onCancelImport,
              onImport,
              onToggleImportSettings: setImportRestoreSettings,
              onShowApproximate,
              onRequestClear: () => { setClearStep(true); setDataMessage(null) },
              onCancelClear: () => setClearStep(false),
              onClear,
              onRecheckBackfill: onRetryBackfill,
              onCycleAppearance: cycleAppearanceMode,
              onSelectAppearance: applyAppearance,
              onChangePalette: changePalette,
            })
          }
          return renderOverviewView({
            data, t, isZh, period, onSelectPeriod: setPeriod, durationFormat, hoverTip, nowMs,
            onOpenSession: openSessionFromPage,
            focus, onToggleFocus: toggleFocus,
            heroMetric, onSelectHeroMetric: selectHeroMetric,
            recentLimit,
            heatSeries: heatState.data, heatStatus: heatState.status,
            heatRangeValue, onSelectHeatRange: setHeatRangeValue,
          })
        }

        // 页脚说明按当前视图合并：顶部标题行的口径说明都收进这一枚 ⓘ，避免同一页出现两处。
        const footerLines = [...footerInfoMessages(t, hasApproximate)]
        if (view === 'overview') footerLines.push(...overviewInfoMessages(data, t))
        else if (view === 'trend') footerLines.push(t('trendInfo'))

        const topbarNotices = buildTopbarNotices({
          t, backfill: data === null ? null : effectiveBackfill, hasApproximate, paletteSaveError,
          stateError: state.status === 'error' && data !== null,
          analysisNotices,
          onDismissApproximate, onDismissBackfill, onRetryBackfill,
          dismissingBackfill, retryingBackfill: retrying, dismissError, retryError,
        })
        // 通知集合变化（关闭、回填结束、离开回顾）时收起可能已失去锚点的浮层。
        const topbarNoticeSignature = topbarNotices.map((notice) => notice.key).join('|')
        React.useEffect(() => { hoverTip.hide() }, [topbarNoticeSignature])
        // 回顾与会话的正文都是异步取数：高度稳定前不渲染页脚，避免它在页面上缘闪一下。
        const footerReady = !switchingView &&
          (view !== 'analysis' || analysisReady) &&
          (view !== 'details' || sessionBrowser.model.loadStatus !== 'loading')

        return h('div', { className: view === 'overview' && focus !== null ? `${pageClassName} is-overview-focused` : pageClassName },
          h('style', null, DSH_TIMESPAN_CSS),
          h('div', { className: 'cs-shell' },
            h('header', { className: 'cs-topbar' },
              h('div', { className: 'cs-brand' },
                h('span', { className: 'cs-mark' }, h(DshTimespanIcon, { size: 36, active: true })),
                h('div', { className: 'cs-brand-text' },
                  h('h1', null, t('title')))),
              h('span', { className: 'cs-topbar-divider', 'aria-hidden': true }),
              h(TabNav, { view: pendingView ?? view, t, locale: isZh ? 'zh' : 'en', onChange: goToView }),
              h('div', { className: 'cs-topbar-right' },
                // 通知夹在导航末端的「设置」与状态点之间：既贴近操作区，也不挤占最右侧的循环按钮。
                renderTopbarNotices(topbarNotices, hoverTip, t),
                data ? h('div', { className: 'cs-topbar-group' },
                  h('span', {
                    className: `cs-live cs-live-status${data.taskRunning ? ' is-live is-task' : data.activeRunning ? ' is-live is-active' : ' is-idle'}`,
                  },
                    h('span', { className: 'cs-dot' }),
                    t(data.taskRunning ? 'taskRunning' : data.activeRunning ? 'live' : 'idle'))) : null,
                data ? h('span', { className: 'cs-topbar-divider', 'aria-hidden': true }) : null,
                h('div', { className: 'cs-topbar-group' },
                  h(DashboardTimer, { client: timerClient, t, hoverTip }),
                  h('button', {
                    type: 'button',
                    className: 'cs-icon-toggle cs-appearance-toggle',
                    'data-appearance': appearance,
                    'aria-label': appearanceToggleLabel,
                    ...hoverTipProps(hoverTip, appearanceToggleLabel, [], { prefer: 'bottom' }),
                    onClick: cycleAppearanceMode,
                  }, h(AppearanceIcon, { mode: appearance })),
                  h('button', {
                    type: 'button',
                    className: 'cs-icon-toggle cs-palette-toggle',
                    'aria-label': paletteToggleLabel,
                    ...hoverTipProps(hoverTip, paletteToggleLabel, [], { prefer: 'bottom' }),
                    onClick: cyclePalette,
                  }, h(PaletteIcon))))),
            h('div', { className: 'cs-views', ref: viewsRef },
              h('div', { className: `cs-curtain${switchingView ? ' is-on' : ''}`, 'aria-hidden': true }),
              h('section', {
                key: view,
                ref: viewSurfaceRef,
                id: `cs-view-${view}`,
                className: `cs-view${switchingView ? ' is-leaving' : ''}`,
                inert: switchingView ? '' : undefined,
                role: 'tabpanel',
                'aria-labelledby': `cs-tab-${view}`,
                'data-view': view,
              },
                view === 'settings' ? h('style', null, DSH_TIMESPAN_SETTINGS_CSS) : null,
                ...renderView())),
            data && footerReady
              ? h('footer', { className: 'cs-foot' },
                renderInfo(footerLines.join('；'), null, footerLines)) : null,
            h(HoverTip, { key: 'hover-tip', tip: hoverTip.tip })))
      }
    }

    /** 页面与设置页共用同一套自定义下拉外观；颜色跟随所在页面作用域的主题变量。 */
    const CS_INTERACTION_CSS = `
      .cs-selection-group { position: relative; isolation: isolate; }
      .cs-selection-group > :not(.cs-selection-thumb) { position: relative; z-index: 1; }
      .cs-selection-thumb { position: absolute; z-index: 0; pointer-events: none; top: 0; left: 0;
        width: var(--cs-indicator-width, 0px); height: var(--cs-indicator-height, 0px);
        transform: translate(var(--cs-indicator-x, 0px), var(--cs-indicator-y, 0px));
        border-radius: var(--cs-indicator-radius, 6px); background: var(--cs-indicator-color, var(--dsw-alias-bg-layer-2));
        visibility: hidden; transition: none; }
      .cs-selection-group[data-selection-ready] > .cs-selection-thumb { visibility: visible; }
      .cs-selection-group[data-selection-motion="true"] > .cs-selection-thumb {
        transition: transform 240ms cubic-bezier(.2,.7,.2,1), width 240ms cubic-bezier(.2,.7,.2,1), height 240ms cubic-bezier(.2,.7,.2,1), background-color 240ms ease; }
      .cs-collapse { display: grid; grid-template-rows: 0fr; visibility: hidden; opacity: 0;
        transition: grid-template-rows 240ms cubic-bezier(.2,.7,.2,1), opacity 120ms ease, visibility 240ms; }
      .cs-collapse.is-open { grid-template-rows: 1fr; visibility: visible; opacity: 1; }
      .cs-collapse-body { min-height: 0; overflow: hidden; }
      .cs-triangle, .cs-disclosure > summary::before { display: inline-block; content: ''; flex: none; width: 0; height: 0;
        border-block: 4px solid transparent; border-inline-start: 6px solid currentColor; transform-origin: 2px center;
        transition: transform 180ms cubic-bezier(.2,.7,.2,1); }
      .cs-disclosure > summary { display: flex; align-items: center; gap: 7px; list-style: none; cursor: pointer; }
      .cs-disclosure > summary::-webkit-details-marker { display: none; }
      .cs-disclosure[open]:not([data-review-expanded="false"]) > summary::before,
      .cs-disclosure[data-review-expanded="true"] > summary::before { transform: rotate(90deg); }
      @media (prefers-reduced-motion: reduce) {
        .cs-selection-group > .cs-selection-thumb, .cs-collapse, .cs-triangle, .cs-disclosure > summary::before { transition: none; }
      }
    `

    const CS_SELECT_CSS = `
      .cs-select { position: relative; display: inline-flex; vertical-align: middle; min-width: 0; }
      .cs-select-btn {
        display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;
        min-width: 104px; min-height: 34px; padding: 6px 10px;
        font: inherit; font-size: 12px; line-height: 18px;
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-1);
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px; cursor: pointer;
        transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
      }
      .cs-select-btn:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1));
        background: var(--dsw-alias-bg-layer-2);
      }
      .cs-select-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-select-btn[aria-expanded="true"] {
        border-color: var(--dsw-alias-brand-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
      }
      .cs-select-btn:disabled { opacity: .55; cursor: default; }
      .cs-select-val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cs-chev {
        width: 7px; height: 7px; flex: 0 0 7px;
        border-right: 1.5px solid var(--dsw-alias-label-secondary);
        border-bottom: 1.5px solid var(--dsw-alias-label-secondary);
        transform: rotate(45deg) translateY(-2px);
        transition: transform 160ms ease;
      }
      .cs-select-btn[aria-expanded="true"] .cs-chev { transform: rotate(-135deg) translateY(-2px); }
      .cs-select-menu {
        /* 固定到视口并交给 clampTipPosition 定位，不再受 .cs-page / 卡片的 overflow 裁切。
           宽度由触发按钮的最小宽度加选项内容共同决定，避免 fixed 下按视口铺满整页。 */
        position: fixed; z-index: 90; left: 0; top: 0;
        width: max-content; max-width: min(360px, calc(100vw - 16px));
        max-height: 260px; overflow-y: auto; overflow-x: hidden;
        padding: 4px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1);
        box-shadow: 0 14px 34px rgba(0, 0, 0, .16);
      }
      .cs-select-menu[hidden] { display: none !important; }
      .cs-select-menu.is-grid {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px;
        min-width: 224px; max-height: none; overflow: visible; padding: 6px;
      }
      .cs-opt {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        width: 100%; min-width: 0; text-align: left; white-space: nowrap;
        padding: 7px 10px; border: 0; border-radius: 5px; background: transparent;
        font: inherit; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary);
        cursor: pointer; transition: background-color 160ms ease, color 160ms ease;
      }
      .cs-opt-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .cs-opt:hover:not(:disabled), .cs-opt.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); }
      .cs-opt:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
      .cs-opt.is-on { color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .cs-opt-check { flex: 0 0 auto; margin-left: 12px; font-size: 11px; }
      .cs-select-menu.is-grid .cs-opt { justify-content: center; text-align: center; padding: 6px 8px; }
      .cs-select-menu.is-grid .cs-opt.is-span-2 { grid-column: 1 / -1; justify-content: space-between; text-align: left; }
      .cs-select-menu.is-grid .cs-opt.is-on:not(.is-span-2) { justify-content: center; gap: 6px; }
      /* 热力图范围：15 项统一三列，菜单宽度只占触发器附近一小块。 */
      .heat-range-select .cs-select-menu.is-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        min-width: 178px; gap: 1px; padding: 4px;
      }
      .heat-range-select .cs-select-menu.is-grid .cs-opt {
        padding: 4px 5px; font-size: 11.5px; line-height: 16px; border-radius: 4px;
      }
      /* 统计口径两个下拉统一收窄，不再撑大设置行。 */
      .cs-settings-select .cs-select-btn {
        min-width: 72px; min-height: 30px; padding: 4px 8px;
        gap: 6px; font-size: 12px; line-height: 18px; border-radius: 7px;
      }
      .cs-settings-select .cs-select-menu { min-width: 78px; max-height: 220px; padding: 3px; border-radius: 8px; }
      .cs-settings-select .cs-opt { padding: 5px 9px; font-size: 12px; line-height: 17px; }
    `

    /**
     * 侧栏入口的独立主题作用域。入口落在宿主侧栏，拿不到 .cs-page 的变量，
     * 因此在这里按 cs-palette-* / cs-appearance-* 声明信号色阶，并给任务段
     * 指定与活跃段明显区分的紫罗兰辅助色；不使用宿主的 success 绿。
     */
    const CS_CHART_MOTION_CSS = `
      /* 绘入与悬停分别作用于内外层，避免入场过程覆盖交互缩放。 */
      .cs-reveal-ring, .cs-reveal-x, .cs-reveal-y, .cs-reveal-cell {
        animation-duration: var(--cs-dur-enter, 420ms);
        animation-delay: var(--cs-chart-delay, 0ms);
        animation-timing-function: var(--cs-ease, cubic-bezier(.22,.7,.24,1));
        animation-fill-mode: backwards;
      }
      .cs-reveal-ring { animation-name: cs-ring-draw; }
      .cs-reveal-x { transform-origin: left center; animation-name: cs-bar-draw-x; }
      .cs-reveal-y { transform-box: fill-box; transform-origin: center bottom; animation-name: cs-bar-draw-y; }
      .cs-reveal-cell { animation-name: cs-heat-appear; }
      [data-chart-reveal="pending"] :is(.cs-reveal-ring, .cs-reveal-x, .cs-reveal-y, .cs-reveal-cell) { animation-play-state: paused; }
      @keyframes cs-heat-appear { from { opacity: 0; } }
      @keyframes cs-ring-draw { from { stroke-dasharray: 0 var(--cs-ring-length, 100); } }
      @keyframes cs-bar-draw-x { from { transform: scaleX(0); } }
      @keyframes cs-bar-draw-y { from { transform: scaleY(0); } }
      @media (prefers-reduced-motion: reduce) {
        .cs-reveal-ring, .cs-reveal-x, .cs-reveal-y, .cs-reveal-cell { animation: none; }
      }
    `

    const CS_CORAL_LIGHT = `
      --cs-palette-primary: #FF5B3B;
      --cs-signal-deep: #7E291F;
      --cs-signal: #A63D28;
      --cs-signal-soft: #FFBAA7;
    `
    const CS_CORAL_DARK = `
      --cs-palette-primary: #FF5B3B;
      --cs-signal-deep: #FFCBBE;
      --cs-signal: #FF8B73;
      --cs-signal-soft: #9C493B;
    `

    const DSH_TIMESPAN_SIDEBAR_CSS = `
      ${CS_CHART_MOTION_CSS}
      .dsh-timespan-nav-entry {
        --cs-signal-deep: #133463;
        --cs-signal: #1F4E94;
        --cs-signal-soft: #79B3F9;
        --cs-live: var(--cs-signal);
        --cs-active-dot: var(--cs-live);
        --cs-ring-online: var(--cs-signal-soft);
        --cs-task: #C29BE8;
        --cs-ring-track: color-mix(in srgb, currentColor 18%, transparent);
        --cs-entry-muted: color-mix(in srgb, currentColor 62%, transparent);
        --cs-entry-ink: color-mix(in srgb, currentColor 94%, transparent);
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        max-width: 100%;
        flex-wrap: nowrap;
        white-space: nowrap;
        line-height: 20px;
        font-variant-numeric: tabular-nums;
        border-radius: 6px;
        outline: none;
      }
      /* 「更多」复用侧栏图标，但宿主把它装在 16px 的盒子里。为时长腾出实际宽度，菜单行仍由宿主管理。 */
      [role="menuitem"] > span:has(.dsh-timespan-nav-entry),
      [role="menuitem"] span:has(> [data-slot="sidebar.panellist"] > .dsh-timespan-nav-entry) {
        width: auto; min-width: 0; flex: 0 1 auto;
      }
      [role="menuitem"] .dsh-timespan-nav-entry { width: auto; gap: 5px; }
      [role="menuitem"] .dsh-timespan-nav-entry .dsh-timespan-nav-time {
        flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 12px;
      }
      [role="menuitem"] .dsh-timespan-nav-status,
      [role="menuitem"] .dsh-timespan-nav-dot,
      [role="menuitem"] .dsh-timespan-nav-tip { display: none; }
      /* 状态点贴右：入口撑满宿主行，圆点用 auto 外边距推到行末；inline 保持原来的内容簇布局。 */
      .dsh-timespan-nav-entry.is-dot-end { width: 100%; }
      .dsh-timespan-nav-entry.is-dot-end .dsh-timespan-nav-dot { margin-left: auto; margin-right: 3px; }
      /* 宿主把插槽包在一枚定宽 icon 容器里，插件入口要靠 :has 反向撑满整行，否则圆点只能停在文字后。 */
      html[data-dsh-timespan-hide-name] button[aria-label="TimeSpan"] > span:has(.dsh-timespan-nav-entry.is-dot-end) {
        flex: 1 1 auto;
        min-width: 0;
        justify-content: flex-start;
      }
      .dsh-timespan-nav-entry.cs-palette-blue {
        --cs-signal-deep: #133463; --cs-signal: #1F4E94; --cs-signal-soft: #79B3F9;
      }
      .dsh-timespan-nav-entry.cs-palette-stone {
        --cs-signal-deep: #2b3033; --cs-signal: #4a5155; --cs-signal-soft: #aeb6b9;
      }
      .dsh-timespan-nav-entry.cs-palette-cyan {
        --cs-signal-deep: #0C4A52; --cs-signal: #0E7490; --cs-signal-soft: #67E8F9;
      }
      .dsh-timespan-nav-entry.cs-palette-coral { ${CS_CORAL_LIGHT} --cs-active-dot: var(--cs-palette-primary); }
      .dsh-timespan-nav-entry.cs-palette-blue.cs-appearance-light {
        --cs-active-dot: var(--cs-signal-soft);
      }
      .dsh-timespan-nav-entry.cs-palette-stone.cs-appearance-light { --cs-active-dot: #aeb6b9; }
      .dsh-timespan-nav-entry.cs-palette-cyan.cs-appearance-light { --cs-active-dot: #67E8F9; }
      /* 浅色下在线段取略深的中阶信号色，避免与同为浅信号色的活跃状态点重合。 */
      .dsh-timespan-nav-entry.cs-appearance-light {
        --cs-ring-online: color-mix(in srgb, var(--cs-signal-soft) 50%, var(--cs-signal));
      }
      .dsh-timespan-nav-entry.cs-appearance-dark {
        --cs-signal-deep: #a9cffa; --cs-signal: #79B3F9; --cs-signal-soft: #3f6ba8;
        --cs-task: #C29BE8;
      }
      .dsh-timespan-nav-entry.cs-appearance-dark.cs-palette-blue { --cs-active-dot: #4F9BFF; }
      .dsh-timespan-nav-entry.cs-appearance-dark.cs-palette-stone {
        --cs-signal-deep: #8F9A9E; --cs-signal: #AEB6B9; --cs-signal-soft: #6C7477;
        --cs-active-dot: #E6EDEF;
      }
      .dsh-timespan-nav-entry.cs-appearance-dark.cs-palette-cyan {
        --cs-signal-deep: #A5F3FC; --cs-signal: #22D3EE; --cs-signal-soft: #155E75;
        --cs-active-dot: #22D3EE;
      }
      .dsh-timespan-nav-entry.cs-appearance-dark.cs-palette-coral { ${CS_CORAL_DARK} }
      .dsh-timespan-nav-ring {
        width: 18px; height: 18px; flex: 0 0 18px;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .dsh-timespan-nav-ring svg { display: block; width: 18px; height: 18px; transform: rotate(-90deg); overflow: visible; }
      .dsh-timespan-nav-ring-track { stroke: var(--cs-ring-track); stroke-width: 2.9; }
      .dsh-timespan-nav-ring-seg { stroke-width: 2.9; }
      .dsh-timespan-nav-time {
        font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 14px; line-height: 20px; font-weight: 650; color: var(--cs-entry-ink);
        letter-spacing: -0.015em; white-space: nowrap; flex: 0 0 auto;
        display: inline-block;
        animation: dsh-timespan-time-swap 160ms ease-out both;
      }
      .dsh-timespan-nav-time.is-live { color: var(--cs-entry-ink); }
      /* 纯透明度淡入：不做模糊、位移和缩放，切换数字格式时安静利落。 */
      @keyframes dsh-timespan-time-swap {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .dsh-timespan-nav-time { animation: none !important; }
      }
      .dsh-timespan-nav-status {
        font-size: 11px; line-height: 18px; font-weight: 600; color: var(--cs-entry-muted);
        flex: 0 0 auto; white-space: nowrap;
      }
      .dsh-timespan-nav-status.is-active { color: var(--cs-live); }
      .dsh-timespan-nav-status.is-task { color: var(--cs-task); }
      .dsh-timespan-nav-dot {
        position: relative; display: block; width: 8px; height: 8px;
        border-radius: 999px !important; flex: 0 0 8px;
        margin-left: 2px;
        background: var(--cs-entry-muted); opacity: .55;
        transition: background-color 180ms ease, opacity 180ms ease;
      }
      .dsh-timespan-nav-dot.is-live {
        background: var(--cs-active-dot); opacity: 1;
        /* 核心点保持干净的实心色；不再叠加静态 box-shadow，避免被误看成第二个内环。 */
      }
      /* 任务中优先：同一时刻即使也在活跃，点与扩散环都使用紫色。 */
      .dsh-timespan-nav-dot.is-task {
        background: var(--cs-task); opacity: 1;
      }
      /*
       * 只保留一个扩散环：3.6s 一轮，约 2s 扩散到 2.15 倍并完全淡出，剩余
       * 时间保持不可见；下一轮从中心出现时，上一轮已经彻底消失。活跃或任务
       * 进行中都会脉冲，鼠标移开也不会留下静态光环。
       */
      .dsh-timespan-nav-dot.is-live::before {
        content: ''; position: absolute; inset: -2px; border-radius: 50%;
        border: 1.5px solid color-mix(in srgb, var(--cs-active-dot) 58%, transparent);
        animation: dsh-timespan-dot-pulse 3.6s cubic-bezier(.2, .55, .25, 1) infinite;
        will-change: transform, opacity;
      }
      .dsh-timespan-nav-dot.is-task::before {
        border-color: color-mix(in srgb, var(--cs-task) 58%, transparent);
      }
      @keyframes dsh-timespan-dot-pulse {
        0% { transform: scale(.48); opacity: .58; }
        52%, 100% { transform: scale(2.15); opacity: 0; }
      }
      /* 悬浮 / 聚焦一段时间后出现的今日构成浮层；固定定位，避免被侧栏滚动容器裁切。 */
      .dsh-timespan-nav-tip {
        --cs-tip-bg: var(--dsw-alias-bg-layer-1, #26272b);
        position: fixed; z-index: 95; display: flex; flex-direction: column;
        min-width: 214px; max-width: 276px; padding: 10px 12px;
        border-radius: 11px; border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .14));
        background: var(--cs-tip-bg); color: var(--dsw-alias-label-primary, currentColor);
        box-shadow: 0 12px 32px rgba(0, 0, 0, .28), 0 2px 8px rgba(0, 0, 0, .16);
        pointer-events: none; backdrop-filter: blur(12px);
        animation: dsh-timespan-tip-in 160ms ease both;
      }
      .dsh-timespan-nav-tip::after {
        content: ''; position: absolute; left: calc(50% - 5px); bottom: -5px;
        width: 9px; height: 9px; background: var(--cs-tip-bg);
        border-right: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .14));
        border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .14));
        transform: rotate(45deg);
      }
      .dsh-timespan-nav-tip[data-placement="bottom"]::after {
        top: -5px; bottom: auto;
        border: 0; border-left: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .14));
        border-top: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, .14));
      }
      @keyframes dsh-timespan-tip-in { from { opacity: 0; } to { opacity: 1; } }
      .dsh-timespan-nav-tip-rows {
        display: flex; flex-direction: column; gap: 5px;
      }
      .dsh-timespan-nav-tip-row {
        display: grid; grid-template-columns: 7px minmax(0, 1fr) auto auto; gap: 7px;
        align-items: center; font-size: 12px; line-height: 17px;
      }
      .dsh-timespan-nav-tip-swatch { display: block; width: 7px; height: 7px; border-radius: 50%; }
      .dsh-timespan-nav-tip-label { color: var(--cs-entry-muted); }
      .dsh-timespan-nav-tip-value {
        color: var(--cs-entry-ink); font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-variant-numeric: tabular-nums; font-weight: 650;
      }
      .dsh-timespan-nav-tip-share { min-width: 32px; text-align: right; color: var(--cs-entry-muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
      .dsh-timespan-nav-entry:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: 2px; }
      /* 关闭「显示名称」时连宿主 panelTitle 一起隐藏：只隐藏第二个 span，
         折叠态只剩 panelGlyph 一个 span，不会被误隐藏；label 保留可访问名与 tooltip。 */
      html[data-dsh-timespan-hide-name] button[aria-label="TimeSpan"]:not([role="menuitem"]) { gap: 0; }
      html[data-dsh-timespan-hide-name] button[aria-label="TimeSpan"]:not([role="menuitem"]) > span + span { display: none; }
      /* 名称去掉后，时间独占剩余空间并居中，字号再放大一档。 */
      .dsh-timespan-nav-entry.is-nameless { justify-content: center; }
      .dsh-timespan-nav-entry.is-nameless .dsh-timespan-nav-time {
        flex: 1 1 auto; text-align: center; font-size: 15px; letter-spacing: 0;
      }
      /* 状态点贴右时，时间仍紧跟构成环；否则整行会被时间撑成居中标题，视觉上离图标太远。 */
      .dsh-timespan-nav-entry.is-nameless.is-dot-end { justify-content: flex-start; }
      .dsh-timespan-nav-entry.is-nameless.is-dot-end .dsh-timespan-nav-time { flex: 0 0 auto; text-align: left; }
      /* 默认跟随时长：无名称时状态点紧贴时长，不再把时间撑满整行；隐藏状态点时仍保持原居中。 */
      .dsh-timespan-nav-entry.is-nameless.is-dot-inline:has(.dsh-timespan-nav-dot) { justify-content: flex-start; }
      .dsh-timespan-nav-entry.is-nameless.is-dot-inline:has(.dsh-timespan-nav-dot) .dsh-timespan-nav-time { flex: 0 0 auto; text-align: left; }
      @media (prefers-reduced-motion: reduce) {
        .dsh-timespan-nav-entry, .dsh-timespan-nav-entry * { transition-duration: 0s; animation-duration: 0s; }
        .dsh-timespan-nav-dot.is-live::before {
          animation: none; opacity: .35; transform: scale(1.55);
        }
        .dsh-timespan-nav-tip { animation: none; }
      }
    `

    const CS_TIMER_CSS = `
      ${CS_INTERACTION_CSS}
      .cs-timer-overlay {
        --cs-signal: #1F4E94; --cs-signal-soft: #79B3F9;
        --cs-timer-surface: #fdfefe; --cs-timer-raised: #eff3f6;
        --cs-timer-ink: #232a2d; --cs-timer-muted: #525d63; --cs-timer-line: #dfe5e9;
        --cs-timer-error: #a63437; --cs-timer-on-accent: #fff;
        display: contents;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        color-scheme: light;
      }
      .cs-timer-overlay.cs-palette-stone {
        --cs-signal: #4a5155; --cs-signal-soft: #aeb6b9;
        --cs-palette-primary: #aeb6b9; --cs-timer-on-accent: #2b3033;
      }
      .cs-timer-overlay.cs-palette-cyan {
        --cs-signal: #0E7490; --cs-signal-soft: #67E8F9;
        --cs-palette-primary: #67E8F9; --cs-timer-on-accent: #0C4A52;
      }
      .cs-timer-overlay.cs-palette-coral { ${CS_CORAL_LIGHT} --cs-timer-on-accent: #30150e; }
      .cs-timer-overlay.cs-appearance-dark {
        --cs-signal: #79B3F9; --cs-signal-soft: #3f6ba8;
        --cs-timer-surface: #202324; --cs-timer-raised: #303435;
        --cs-timer-ink: #f1f2f1; --cs-timer-muted: #b1b6b5; --cs-timer-line: #414647;
        --cs-timer-error: #f09691; --cs-timer-on-accent: #171a19;
        color-scheme: dark;
      }
      .cs-timer-overlay.cs-appearance-dark.cs-palette-stone { --cs-signal: #AEB6B9; --cs-signal-soft: #6C7477; }
      .cs-timer-overlay.cs-appearance-dark.cs-palette-cyan { --cs-signal: #22D3EE; --cs-signal-soft: #155E75; }
      .cs-timer-overlay.cs-appearance-dark.cs-palette-coral { ${CS_CORAL_DARK} }
      .cs-floating-menu { position: fixed; z-index: 110; width: min(218px, calc(100vw - 24px));
        padding: 5px; border: 1px solid var(--cs-timer-line); border-radius: 10px;
        background: var(--cs-timer-surface); color: var(--cs-timer-ink); box-shadow: 0 10px 30px #0002; pointer-events: auto; }
      .cs-floating-menu[hidden] { display: none; }
      .cs-floating-menu > button { display: flex; align-items: center; gap: 8px; width: 100%;
        border: 0; border-radius: 6px; padding: 8px; background: transparent; color: inherit; font: inherit; font-size: 13px;
        text-align: left; cursor: pointer; transition: background-color 160ms ease; }
      .cs-floating-menu > button:hover { background: var(--cs-timer-raised); }
      .cs-floating-menu > button:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: -2px; }
      .cs-floating-menu > button:disabled { cursor: wait; opacity: .6; }
      .cs-floating-menu > p { margin: 4px 8px 7px; color: var(--cs-timer-muted); font-size: 11px; line-height: 1.6; }
      .cs-floating-menu > p.is-error { color: var(--cs-timer-error); }
      .cs-timer-popover, .cs-timer-notice {
        --timer-paper: var(--cs-timer-surface, var(--dsw-alias-bg-layer-1));
        --timer-rail: var(--cs-timer-raised, var(--dsw-alias-bg-layer-2));
        --timer-ink: var(--cs-timer-ink, var(--dsw-alias-label-primary));
        --timer-muted: var(--cs-timer-muted, var(--dsw-alias-label-secondary));
        --timer-rule: var(--cs-timer-line, var(--dsw-alias-border-l1));
        --timer-accent: var(--cs-palette-primary, var(--cs-signal));
        --timer-control: var(--cs-palette-primary, var(--dsw-alias-brand-primary));
        --timer-text-accent: var(--cs-signal);
        --timer-button-ink: var(--cs-timer-on-accent, var(--cs-solid-ink, var(--cs-on-accent, #fff)));
        --timer-mono: var(--cs-mono, "Cascadia Mono", Consolas, "Liberation Mono", monospace);
        box-sizing: border-box;
        color: var(--timer-ink);
        font-family: inherit; font-size: 12px; line-height: 1.5;
      }
      .cs-timer-popover *, .cs-timer-notice * { box-sizing: border-box; }
      .cs-timer-topbar { position: relative; }
      .cs-timer-trigger, .cs-timer-button, .cs-timer-notice-close {
        appearance: none; font: inherit; font-size: 12px; line-height: 18px; cursor: pointer;
        border: 1px solid var(--timer-rule); border-radius: 8px; background: var(--timer-paper); color: var(--timer-ink);
      }
      .cs-timer-trigger {
        position: relative; display: inline-flex; min-width: 30px; min-height: 30px; align-items: center; justify-content: center; padding: 6px;
        color: var(--timer-muted);
        transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease,
          transform 220ms cubic-bezier(.34, 1.56, .64, 1), box-shadow 220ms ease;
      }
      .cs-timer-trigger.is-pinned {
        color: var(--timer-text-accent);
        border-color: color-mix(in srgb, var(--timer-accent) 50%, var(--timer-rule));
      }
      .cs-timer-trigger.is-pinned { background: color-mix(in srgb, var(--timer-accent) 11%, var(--timer-paper)); }
      .cs-timer-trigger:hover:not(.is-pinned) {
        background: var(--timer-rail); transform: translateY(-1px);
        box-shadow: 0 4px 12px color-mix(in srgb, var(--timer-accent) 14%, transparent);
      }
      .cs-timer-trigger:active { transform: translateY(0) scale(.93); transition-duration: 80ms; }
      .cs-timer-trigger .cs-detail-glyph { color: var(--timer-ink); }
      .cs-timer-trigger .cs-detail-glyph path { stroke: var(--cs-chart-active, var(--timer-text-accent)); }
      /* 悬停时指针钟轻摆一格，呼应正在走的时钟。 */
      .cs-timer-trigger:hover .cs-detail-glyph, .cs-timer-trigger:focus-visible .cs-detail-glyph { animation: cs-clock-tick 560ms cubic-bezier(.34, 1.3, .4, 1); }
      @keyframes cs-clock-tick {
        0% { transform: rotate(0); }
        28% { transform: rotate(-14deg); }
        58% { transform: rotate(5deg); }
        100% { transform: rotate(0); }
      }
      .cs-timer-popover .cs-timer-trigger.has-error { color: var(--cs-timer-error, var(--dsw-alias-state-error-primary)); }
      .cs-timer-trigger.has-error .cs-detail-glyph path { stroke: var(--cs-timer-error, var(--dsw-alias-state-error-primary)); }
      .cs-timer-compact-digits { font: 600 11px/18px var(--timer-mono); font-variant-numeric: tabular-nums; }
      .cs-timer-popover :is(button, input):focus-visible, .cs-timer-notice button:focus-visible {
        outline: 2px solid var(--timer-text-accent); outline-offset: 2px;
      }
      .cs-timer-flyout[hidden] { display: none; }
      .cs-timer-flyout {
        z-index: 61; position: fixed; width: min(280px, calc(100vw - 20px));
      }
      .cs-timer-panel {
        max-height: min(555px, calc(100dvh - 20px)); padding: 14px; overflow: auto;
        border: 1px solid var(--timer-rule); border-radius: 13px; background: var(--timer-paper);
        box-shadow: 0 12px 42px #0003, 0 3px 10px #0001;
      }
      .cs-clock-face { display: grid; justify-items: center; gap: 5px; margin: 0 0 10px; }
      .cs-clock-face svg { display: block; width: 132px; max-width: 100%; }
      .cs-clock-rim { fill: none; stroke: var(--timer-rule); }
      .cs-clock-tick { stroke: var(--timer-rule); stroke-width: 1.65; stroke-linecap: round; }
      .cs-clock-tick.is-quarter { stroke: var(--timer-muted); stroke-width: 2.05; }
      .cs-clock-hour, .cs-clock-minute { stroke: var(--timer-ink); stroke-linecap: round; }
      .cs-clock-hour { stroke-width: 4.8; }
      .cs-clock-minute { stroke-width: 2.6; }
      .cs-clock-second { stroke: var(--timer-accent); stroke-width: 1.45; stroke-linecap: round; }
      .cs-clock-pivot { fill: var(--timer-accent); stroke: var(--timer-paper); stroke-width: .85; }
      .cs-clock-caption { display: flex; align-items: baseline; gap: 7px; font-size: 11px; color: var(--timer-muted); }
      .cs-clock-caption time { font-family: var(--timer-mono); font-variant-numeric: tabular-nums; }
      .cs-timer-controls { display: grid; gap: 8px; font-size: 12px; }
      .cs-timer-controls > .cs-collapse { margin-block: -4px; transition: grid-template-rows 240ms cubic-bezier(.2,.7,.2,1), opacity 120ms ease, visibility 240ms, margin 240ms ease; }
      .cs-timer-controls > .cs-collapse.is-open { margin-block: 0; }
      .cs-timer-heading { display: flex; gap: 8px; justify-content: space-between; align-items: baseline; }
      .cs-timer-heading strong { font-size: 13px; font-weight: 650; }
      .cs-timer-state, .cs-timer-mode { color: var(--timer-muted); font-size: 11px; }
      .cs-timer-mode-slot { display: flex; align-items: center; min-height: 30px; }
      .cs-timer-state:is(.is-running, .is-completed) { color: var(--timer-text-accent); }
      .cs-timer-readout {
        font-family: var(--timer-mono); font-size: clamp(23px, 3.35vw, 30px); font-weight: 650; line-height: 1.25; letter-spacing: -.055em;
        font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
      }
      .cs-timer-modes, .cs-timer-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
      .cs-timer-modes { --cs-indicator-color: var(--timer-paper); width: fit-content; padding: 2px; border-radius: 7px; background: var(--timer-rail); }
      .cs-timer-modes button { padding: 4px 7px; font: inherit; color: var(--timer-muted); border: 0; border-radius: 5px; background: none; cursor: pointer; }
      .cs-timer-modes button[aria-pressed="true"] { background: var(--timer-paper); color: var(--timer-ink); box-shadow: 0 1px 2px #0002; }
      .cs-timer-modes[data-selection-ready] button[aria-pressed="true"] { background: transparent; box-shadow: none; }
      .cs-timer-button { min-height: 30px; padding: 4px 8px; transition: background-color 160ms ease, color 160ms ease, transform 80ms ease; }
      .cs-timer-button:hover:not(:disabled) { background: color-mix(in srgb, var(--timer-accent) 14%, var(--timer-paper)); }
      .cs-timer-button:active:not(:disabled) { transform: scale(.97); }
      .cs-timer-button.is-primary { border-color: var(--timer-control); background: var(--timer-control); color: var(--timer-button-ink); font-weight: 650; }
      .cs-timer-button.is-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--timer-control) 88%, var(--timer-ink)); }
      .cs-timer-popover button:disabled { opacity: .57; cursor: default; }
      .cs-timer-duration {
        min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin: 0; padding: 0; border: 0;
      }
      .cs-timer-duration legend { padding: 0 0 3px; color: var(--timer-muted); font-size: 11px; }
      .cs-timer-unit { display: inline-flex; align-items: center; gap: 4px; color: var(--timer-muted); }
      .cs-timer-unit input {
        width: 68px; min-height: 29px; padding: 4px 6px; border: 1px solid var(--timer-rule); border-radius: 6px;
        background: var(--timer-paper); color: var(--timer-ink); font: 12px/18px var(--timer-mono);
      }
      .cs-timer-progress { display: block; width: 100%; height: 5px; accent-color: var(--timer-accent); }
      .cs-timer-feedback { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px; margin: 0; font-size: 11px; color: var(--timer-muted); }
      .cs-timer-feedback.is-error { color: var(--cs-timer-error, var(--dsw-alias-state-error-primary)); }
      .cs-timer-result { display: flex; align-items: center; gap: 7px; padding-top: 7px; border-top: 1px solid var(--timer-rule); color: var(--timer-muted); font-size: 11px; }
      .cs-timer-result-copy { display: grid; gap: 1px; flex: 1; min-width: 0; }
      .cs-timer-result-delete { position: relative; display: grid; place-items: center; flex: none; width: 28px; height: 28px; padding: 0; color: var(--timer-muted); background: none; border: 0; border-radius: 6px; cursor: pointer; transition: color 150ms ease, background-color 150ms ease; }
      .cs-timer-result-delete:hover:not(:disabled) { color: var(--cs-timer-error, var(--dsw-alias-state-error-primary)); background: color-mix(in srgb, currentColor 8%, transparent); }
      .cs-delete-dot { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: currentColor; transition: opacity 140ms ease, transform 140ms ease; }
      .cs-timer-result-delete > svg { opacity: 0; transform: scale(.75); transition: opacity 140ms ease, transform 140ms ease; }
      .cs-timer-result-delete:is(:hover, :focus-visible) .cs-delete-dot { opacity: 0; transform: scale(.5); }
      .cs-timer-result-delete:is(:hover, :focus-visible) > svg { opacity: 1; transform: scale(1); }
      @media (hover: none) { .cs-delete-dot { display: none; } .cs-timer-result-delete > svg { opacity: 1; transform: none; } }
      .cs-floating-window {
        position: fixed; z-index: 26; width: max-content; max-width: calc(100vw - 24px); pointer-events: auto;
        background: transparent; border: 0; box-shadow: none;
        --timer-ink: var(--dsw-alias-label-primary);
        --timer-muted: var(--dsw-alias-label-secondary);
        --timer-paper: var(--dsw-alias-bg-base);
        --timer-rule: var(--dsw-alias-border-l1);
        --timer-text-accent: color-mix(in srgb, var(--timer-ink) 65%, var(--timer-accent));
        --floating-halo: color-mix(in srgb, var(--timer-accent) 24%, transparent);
        text-shadow: 0 1px 2px var(--timer-paper), 0 0 10px var(--floating-halo);
      }
      /* 玻璃表面的祖先不保留 opacity 动画，否则会隔断 backdrop 的取样范围。 */
      .cs-floating-entry { animation: cs-tools-in 180ms ease-out; }
      .cs-floating-content[hidden] { display: none; }
      .cs-floating-panel {
        width: min(246px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto;
        padding: 9px 14px 14px; scrollbar-width: thin; border-radius: 18px;
        background: color-mix(in srgb, var(--timer-paper) 94%, transparent);
        border: 1px solid color-mix(in srgb, var(--timer-ink) 14%, transparent);
        box-shadow: 0 12px 32px #00000020, inset 0 1px 0 color-mix(in srgb, var(--timer-ink) 7%, transparent);
      }
      .cs-floating-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
      .cs-floating-entry, .cs-floating-grip, .cs-floating-minimize, .cs-floating-dock {
        display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0;
        color: var(--timer-ink); background: none; border: 0; font: inherit; text-shadow: inherit; cursor: pointer;
      }
      .cs-floating-entry { min-width: 40px; min-height: 40px; padding: 4px 6px; border-radius: 50%; touch-action: none; cursor: grab;
        background: color-mix(in srgb, var(--timer-paper) 94%, transparent); border: 1px solid color-mix(in srgb, var(--timer-ink) 12%, transparent); }
      @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
        .cs-floating-panel, .cs-floating-entry {
          background: color-mix(in srgb, var(--timer-paper) 72%, transparent);
          -webkit-backdrop-filter: blur(20px) saturate(1.15); backdrop-filter: blur(20px) saturate(1.15);
        }
      }
      .cs-floating-entry svg { filter: drop-shadow(0 0 5px var(--floating-halo)); }
      .cs-floating-entry.is-running { color: var(--timer-text-accent); }
      .cs-floating-entry.has-error { color: var(--cs-timer-error); }
      .cs-floating-grip { flex: 1; min-height: 26px; justify-content: flex-start; touch-action: none; cursor: grab; color: var(--timer-muted); }
      .cs-floating-minimize { min-width: 28px; min-height: 28px; color: var(--timer-muted); }
      .cs-floating-window.is-dragging, .cs-floating-window.is-dragging * { cursor: grabbing; user-select: none; }
      .cs-floating-window :is(.cs-floating-grip, .cs-floating-minimize, .cs-floating-entry):hover { color: var(--timer-text-accent); }
      .cs-floating-window .cs-clock-face { margin: 0 0 12px; }
      .cs-floating-window .cs-clock-rim { fill: none; stroke: color-mix(in srgb, var(--timer-text-accent) 24%, transparent); }
      .cs-floating-window .cs-clock-face svg { filter: drop-shadow(0 0 5px var(--floating-halo)); }
      .cs-floating-window .cs-clock-pivot { stroke: none; }
      .cs-floating-window .cs-timer-readout { font-size: 34px; font-weight: 600; letter-spacing: -.045em; text-shadow: 0 0 16px var(--floating-halo); }
      .cs-floating-window .cs-timer-modes { --cs-indicator-color: color-mix(in srgb, var(--timer-accent) 12%, transparent); background: none; }
      .cs-floating-window .cs-timer-modes button { text-shadow: inherit; }
      .cs-floating-window .cs-timer-modes button[aria-pressed="true"] { color: var(--timer-text-accent); box-shadow: none; }
      .cs-floating-window .cs-timer-button { background: transparent; border-color: transparent; border-radius: 6px; padding-inline: 10px; text-shadow: inherit; }
      .cs-floating-window .cs-timer-button.is-primary { background: color-mix(in srgb, var(--timer-accent) 8%, transparent); color: var(--timer-text-accent); font-weight: 650; }
      .cs-floating-window .cs-timer-button:hover:not(:disabled) { background: color-mix(in srgb, var(--timer-accent) 18%, transparent); }
      .cs-floating-window .cs-timer-unit input { width: 64px; background: none; border: 0; border-radius: 0; border-bottom: 1px solid var(--timer-rule); text-shadow: inherit; }
      .cs-floating-window .cs-timer-result { border: 0; padding-top: 4px; }
      .cs-floating-window .cs-timer-heading strong { font-size: 12px; }
      .cs-floating-window .cs-timer-progress { height: 3px; }
      .cs-floating-dock { width: 100%; height: 100%; }
      .cs-floating-dock span { display: block; width: 4px; height: 36px; border-radius: 9px; background: var(--timer-text-accent); box-shadow: 0 0 8px var(--floating-halo); opacity: .65; }
      .cs-floating-window:is(.dock-top, .dock-bottom) .cs-floating-dock span { width: 36px; height: 4px; }
      .cs-floating-window.is-docked { max-width: none; }
      .cs-timer-notice {
        position: fixed; z-index: 65; right: max(12px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom));
        width: min(292px, calc(100vw - 24px)); display: grid; grid-template-columns: auto 1fr auto; align-items: start; gap: 9px;
        padding: 12px; border: 1px solid var(--timer-rule); border-radius: 11px; pointer-events: auto;
        background: var(--timer-paper); box-shadow: 0 8px 26px #0003; animation: cs-tools-in 150ms ease-out both;
      }
      .cs-timer-notice > svg { color: var(--timer-text-accent); }
      .cs-timer-notice-message { display: grid; gap: 4px; font-size: 12px; }
      .cs-timer-notice-message span { color: var(--timer-muted); }
      .cs-timer-notice-message button { justify-self: start; }
      .cs-timer-notice-close { display: grid; place-items: center; width: 25px; height: 25px; padding: 0; background: transparent; color: var(--timer-muted); }
      @media (max-height: 540px) { .cs-clock-face svg { width: 105px; } }
      @media (prefers-reduced-motion: reduce) { .cs-timer-notice, .cs-floating-entry { animation: none; }
        .cs-timer-controls > .cs-collapse, .cs-selection-group[data-selection-motion="true"] > .cs-selection-thumb,
        .cs-timer-trigger, .cs-timer-result-delete, .cs-timer-button, .cs-delete-dot, .cs-timer-result-delete > svg { transition: none; }
        .cs-timer-trigger .cs-detail-glyph { animation: none !important; } }
      @keyframes cs-tools-in { from { opacity: 0; } to { opacity: 1; } }
    `

    const CS_ANALYSIS_CSS = `
      .cs-analysis-page {
        --cs-analysis-padding: clamp(14px, 2cqi, 22px);
        --cs-chart-label-size: 11px;
        display: grid; align-content: start; gap: 16px; width: min(100%, 1160px); min-width: 0; margin-inline: auto;
      }
      .cs-analysis-empty {
        min-width: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--cs-surface);
      }
      .cs-analysis-toolbar {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: end; gap: 12px; min-width: 0; padding: 12px 2px 8px;
      }
      .cs-analysis-toolbar:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: 4px; }
      .cs-analysis-field { display: grid; gap: 4px; min-width: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cs-analysis-field .cs-select-btn { min-width: 0; width: 100%; }
      .cs-analysis-state { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
      .cs-analysis-state.is-error { color: var(--dsw-alias-state-error-primary); }
      .cs-analysis-state > button { margin-inline-start: 8px; }
      .cs-analysis-status {
        display: grid; gap: 4px; padding: 8px 10px; border-radius: 7px; line-height: 1.55; font-size: 12px;
        background: var(--dsw-alias-bg-layer-2); overflow-wrap: anywhere;
      }
      .cs-analysis-status > span { color: var(--dsw-alias-label-secondary); }
      .cs-analysis-status progress { width: min(185px, 100%); height: 6px; accent-color: var(--cs-signal); }
      .cs-analysis-empty { display: flex; align-items: center; gap: 14px; padding: var(--cs-analysis-padding); }
      .cs-analysis-empty-icon {
        display: grid; flex: none; place-items: center; width: 42px; height: 42px; border-radius: 10px;
        color: var(--cs-signal); background: color-mix(in srgb, var(--cs-signal) 10%, var(--cs-surface));
      }
      .cs-analysis-empty h2 { margin: 0 0 5px; font-size: 17px; line-height: 1.3; }
      .cs-analysis-report { display: grid; gap: 16px; min-width: 0; }
      .cs-analysis-report p { margin: 0; }
      .cs-analysis-report-header { padding: 5px 1px 0; min-width: 0; }
      .cs-analysis-report-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px 20px; }
      .cs-analysis-report-identity { flex: 1 1 290px; min-width: 0; }
      .cs-review-title { display: flex; align-items: center; gap: 6px; }
      .cs-review-title h2 { margin: 0; font-size: 24px; font-weight: 650; line-height: 1.3; }
      .cs-analysis-report-dates { margin: 5px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .cs-analysis-report-actions { display: flex; align-items: center; gap: 5px; }
      .cs-analysis-page .cs-info > button.cs-review-icon { width: 34px; height: 34px; border: 1px solid transparent; border-radius: 8px; }
      .cs-analysis-page .cs-info > button.cs-review-generated { width: 28px; height: 28px; }
      .cs-analysis-page .cs-info > button.cs-review-icon:hover { border-color: var(--dsw-alias-border-l1); }
      /* 复制像抽出一张纸，导出箭头向下轻点：两枚报告操作各有可读的悬停手势。 */
      .cs-review-icon.is-copy > svg rect, .cs-review-icon.is-copy > svg path {
        transition: transform 230ms cubic-bezier(.34, 1.56, .64, 1);
      }
      .cs-review-icon.is-copy:hover > svg rect { transform: translate(1.4px, -1.4px); }
      .cs-review-icon.is-copy:hover > svg path { transform: translate(-.9px, .9px); }
      .cs-review-icon.is-export > svg { transition: transform 230ms cubic-bezier(.34, 1.56, .64, 1); }
      .cs-review-icon.is-export:hover > svg { transform: translateY(2px); }
      .cs-analysis-page .cs-info > button.is-done { color: var(--cs-signal); }
      .cs-analysis-page .cs-info > button.is-error { color: var(--dsw-alias-state-error-primary); }
      .cs-analysis-page .cs-review-generate { display: inline-flex; align-items: center; gap: 6px; width: auto; height: 34px; margin-inline-start: 7px; padding: 6px 12px; white-space: nowrap; font: inherit; font-size: 12px; font-weight: 550; }
      .cs-analysis-page .cs-info > button.cs-review-generate { width: auto; height: 34px; gap: 6px; padding: 6px 12px; border: 1px solid var(--dsw-alias-border-l1); }
      .cs-analysis-page .cs-info > button.cs-review-generate.is-primary { background: var(--cs-palette-primary, var(--cs-signal)); border-color: var(--cs-palette-primary, var(--cs-signal)); color: var(--cs-solid-ink, var(--cs-on-accent, #fff)); font: inherit; font-size: 12px; font-weight: 600; }
      .cs-analysis-page .cs-info > button.cs-review-generate:disabled,
      .cs-analysis-page .cs-info > button.cs-review-generate.is-disabled { cursor: default; opacity: .5; }
      .cs-review-footer-actions { display: flex; justify-content: flex-end; align-items: center; gap: 7px; padding-top: 2px; }
      .cs-review-footer-actions .cs-info > button.cs-review-generate { margin-inline-start: 0; }
      .cs-review-context { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; margin-top: 16px; }
      .cs-review-periods { display: flex; gap: 3px; padding: 3px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; }
      .cs-review-periods button { border: 0; border-radius: 5px; padding: 5px 13px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; transition: background-color 140ms ease, color 140ms ease; }
      .cs-review-periods button.is-current { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 600; }
      .cs-review-periods[data-selection-ready] button.is-current { background: transparent; }
      .cs-review-periods button:hover { color: var(--dsw-alias-label-primary); }
      .cs-review-filter-toggle { display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; padding: 6px 7px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
      .cs-review-filter-toggle > span:not(.cs-review-filter-chevron) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cs-review-filter-toggle svg { flex: none; }
      .cs-review-filter-toggle:hover, .cs-review-filter-toggle[aria-expanded=true] { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
      .cs-review-filter-toggle[aria-expanded=true] .cs-review-filter-chevron { transform: rotate(90deg); }
      .cs-review-periods button:focus-visible, .cs-review-filter-toggle:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: 2px; }
      .cs-review-filter-region { display: grid; grid-template-rows: 0fr; visibility: hidden; transition: grid-template-rows 240ms cubic-bezier(.2,.7,.2,1), visibility 240ms; }
      .cs-review-filter-region.is-open { grid-template-rows: 1fr; visibility: visible; }
      .cs-review-filter-content { min-height: 0; overflow: hidden; }
      .cs-review-filter-content .cs-analysis-route { padding: 0 2px 6px; }
      .cs-review-messages { display: grid; gap: 8px; }
      .cs-review-messages:not(:empty) { margin-top: 10px; }
      .cs-analysis-copy-field { display: grid; justify-items: start; gap: 6px; margin-top: 6px; }
      .cs-analysis-copy-field textarea {
        width: 100%; padding: 8px 10px; resize: vertical; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); font: 12px/1.55 ui-monospace, monospace;
      }
      .cs-analysis-copy-field textarea:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: 2px; }
      .cs-analysis-past-scope {
        padding: 8px 10px; border-radius: 7px; background: var(--dsw-alias-bg-layer-2);
      }
      .cs-analysis-abstract {
        padding: 13px 18px; border-inline-start: 3px solid var(--cs-signal);
        border-start-end-radius: 8px; border-end-end-radius: 8px;
        background: color-mix(in srgb, var(--cs-signal) 6%, var(--cs-surface));
      }
      .cs-analysis-abstract h3 { margin: 0 0 5px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
      .cs-analysis-abstract p { font-size: 15px; font-weight: 550; line-height: 1.7; max-width: 100ch; overflow-wrap: anywhere; white-space: pre-wrap; }
      .cs-review-metrics { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; min-width: 0;
        background: var(--cs-surface); border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; }
      .cs-review-metric { display: grid; gap: 5px; min-width: 0; padding: 15px var(--cs-analysis-padding); }
      .cs-review-metric + .cs-review-metric, .cs-review-coverage-meter { border-inline-start: 1px solid var(--dsw-alias-border-l1); }
      .cs-review-metric-label { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .cs-review-metric strong { font: 600 clamp(23px, 2.7cqi, 30px)/1.2 var(--cs-mono); letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
      .cs-review-metric.is-active { background: color-mix(in srgb, var(--cs-chart-active) 7%, transparent); border-radius: 12px 0 0 12px; }
      .cs-review-metric.is-active strong, .cs-review-metric.is-active .cs-detail-glyph { color: var(--cs-signal); }
      .cs-review-metric.is-task strong, .cs-review-metric.is-task .cs-detail-glyph { color: var(--cs-task); }
      .cs-review-metric small, .cs-review-coverage-meter small { font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
      .cs-review-metric > small { min-height: 1.5em; }
      .cs-review-coverage-meter { display: flex; align-items: center; gap: 10px; padding: 15px 18px; min-width: 0; }
      .cs-review-coverage-meter svg { flex: none; }
      .cs-review-coverage-meter > div { display: grid; gap: 3px; }
      .cs-review-coverage-meter strong { font: 600 25px/1.25 ui-monospace, monospace; }
      .cs-review-coverage-meter strong small { font: 500 16px/1.25 ui-monospace, monospace; }
      .cs-review-coverage-meter:only-child { border: 0; grid-column: 1 / -1; }
      .cs-review-visuals, .cs-review-next { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
      .cs-review-next.is-single { grid-template-columns: minmax(0, 1fr); }
      .cs-analysis-report .cs-card { padding: 16px var(--cs-analysis-padding); min-width: 0; }
      /* 投入节奏与右侧工作区分布同高：图表吃掉卡片剩余高度，工作区较多时不再在底部留出空白。 */
      .cs-review-trend { display: flex; flex-direction: column; }
      .cs-review-chart-fit { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
      .cs-review-trend .cs-chart { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; margin-top: 12px; }
      .cs-review-trend .cs-plot { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 118px; }
      .cs-review-trend .cs-chart svg { flex: 1 1 auto; height: 100%; min-height: 118px; }
      .cs-review-trend .cs-review-empty-chart { flex: 1 1 auto; }
      .cs-analysis-report .cs-review-chart-note { margin-top: 12px; font-size: 11px; }
      .cs-review-empty-chart { display: flex; align-items: center; justify-content: center; min-height: 110px; font-size: 13px; color: var(--dsw-alias-label-secondary); }
      .cs-review-ranks { display: grid; gap: 14px; padding: 0; margin: 14px 0 0; list-style: none; }
      .cs-review-ranks li > div:first-child { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 13px; }
      .cs-review-ranks li > div:first-child > span { min-width: 0; overflow-wrap: anywhere; }
      .cs-review-ranks b { white-space: nowrap; font: 550 12px/1.5 ui-monospace, monospace; }
      .cs-review-rank-bottom { display: flex; align-items: center; gap: 9px; margin-top: 5px; }
      .cs-review-rank-bottom small { width: 34px; text-align: end; color: var(--dsw-alias-label-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }
      .cs-review-track { display: block; height: 5px; flex: 1; border-radius: 3px; overflow: hidden; background: var(--dsw-alias-border-l1); }
      .cs-review-track i { display: block; height: 100%; border-radius: inherit; background: var(--cs-chart-active); }
      .cs-review-points { display: grid; gap: 10px; list-style: none; margin: 12px 0 0; padding: 0; }
      .cs-review-points > li { min-width: 0; padding-inline-start: 11px; border-inline-start: 2px solid color-mix(in srgb, var(--cs-signal) 28%, var(--dsw-alias-border-l1)); }
      .cs-review-observations .cs-review-points { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 24px; }
      .cs-review-point { min-width: 0; }
      .cs-review-point-title { font-weight: 650; color: var(--dsw-alias-label-primary); }
      .cs-review-point p, .cs-review-excerpt { font-size: 13px; line-height: 1.7; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
      .cs-review-long > summary { cursor: pointer; list-style: none; }
      .cs-review-long > summary::-webkit-details-marker { display: none; }
      .cs-review-excerpt { display: block; }
      .cs-review-expand, .cs-review-collapse { color: var(--cs-signal); font-size: 12px; line-height: 1.8; }
      .cs-review-collapse { display: none; }
      .cs-review-long[open] > summary .cs-review-collapse { display: inline; }
      .cs-review-long[open] > summary .cs-review-expand, .cs-review-long[open] > summary .cs-review-excerpt { display: none; }
      .cs-review-fold-body { display: flow-root; }
      .cs-review-more { margin-top: 12px; font-size: 12px; color: var(--cs-signal); }
      .cs-review-more > summary { display: flex; align-items: center; gap: 7px; width: fit-content; line-height: 1.8; cursor: pointer; list-style: none; }
      .cs-review-more .cs-review-point { color: var(--dsw-alias-label-primary); }
      .cs-review-long > summary:focus-visible, .cs-review-more > summary:focus-visible, .cs-review-evidence-details > summary:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: 4px; border-radius: 3px; }
      .cs-analysis-work { display: grid; gap: 16px; list-style: none; padding: 0; margin: 14px 0 0; }
      .cs-analysis-work > li:not(:first-child) { padding-top: 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .cs-review-count { color: var(--dsw-alias-label-secondary); font: 500 12px/1.4 ui-monospace, monospace; }
      .cs-review-snapshot-note { padding: 12px 15px; border: 1px dashed var(--dsw-alias-border-l1); border-radius: 8px; }
      .cs-review-coverage-note { display: flex; align-items: baseline; gap: 7px; }
      .cs-review-coverage-note svg { flex: none; align-self: center; }
      .cs-review-evidence { padding: 12px 2px 3px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .cs-review-evidence-details > summary { cursor: pointer; font-size: 12px; font-weight: 600; }
      .cs-review-evidence-details > summary > span { display: inline-block; margin-inline-start: 7px; font-weight: 400; color: var(--dsw-alias-label-secondary); line-height: 1.7; }
      .cs-analysis-sources { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 6px; }
      .cs-analysis-source {
        display: inline-flex; align-items: center; gap: 5px; min-width: 0; max-width: 100%; text-align: start;
      }
      .cs-analysis-source > span { min-width: 0; overflow-wrap: anywhere; }
      .cs-analysis-source > svg { flex: none; }
      .cs-analysis-sidebar {
        display: grid; grid-template-columns: 1fr 1fr; gap: 16px; min-width: 0; margin-top: 14px;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px; line-height: 1.6; overflow-wrap: anywhere;
      }
      .cs-analysis-sidebar h3 { margin: 0; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 650; }
      .cs-analysis-meta { display: grid; gap: 11px; margin: 0; }
      .cs-analysis-meta dt { margin-bottom: 2px; }
      .cs-analysis-meta dd { margin: 0; color: var(--dsw-alias-label-primary); font-weight: 600; }
      .cs-analysis-coverage { display: grid; gap: 5px; }
      .cs-analysis-coverage-notes { margin: 0; padding-inline-start: 17px; }
      .cs-analysis-failures {
        margin: 4px 0; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 42%, var(--dsw-alias-border-l1));
        border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 5%, var(--dsw-alias-bg-layer-1));
        font-size: 12px; line-height: 1.5;
      }
      .cs-analysis-failures summary { padding: 7px 9px; border-radius: inherit; color: var(--dsw-alias-state-error-primary); cursor: pointer; }
      .cs-analysis-failures summary:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: 2px; }
      .cs-analysis-failure-details-label { margin-inline-start: 8px; color: var(--dsw-alias-label-secondary); }
      .cs-analysis-failure-list { display: grid; gap: 0; margin: 0; padding: 0 9px; list-style: none; }
      .cs-analysis-failure-item, .cs-analysis-failure-note {
        display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px;
        padding: 7px 0; border-top: 1px solid var(--dsw-alias-border-l1);
      }
      .cs-analysis-failure-identity { display: grid; gap: 2px; min-width: 0; flex: 1 1 170px; overflow-wrap: anywhere; }
      .cs-analysis-failure-identity strong { color: var(--dsw-alias-label-primary); font-weight: 650; }
      .cs-analysis-failure-actions { display: flex; flex-wrap: wrap; gap: 4px; }
      .cs-analysis-failure-actions .cs-btn, .cs-analysis-failure-note .cs-btn { padding-inline: 8px; }
      .cs-analysis-failure-note { margin: 0 9px; }
      .cs-analysis-source-list summary { width: fit-content; color: var(--cs-signal); font-weight: 600; cursor: pointer; }
      .cs-analysis-source-list summary:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: 3px; }
      @container cs-shell (max-width: 760px) {
        .cs-review-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .cs-review-metric.is-task { border-inline-start: 0; border-top: 1px solid var(--dsw-alias-border-l1); }
        .cs-review-coverage-meter { border-top: 1px solid var(--dsw-alias-border-l1); }
        .cs-review-visuals, .cs-review-next { grid-template-columns: minmax(0, 1fr); }
        .cs-analysis-sidebar { grid-template-columns: minmax(0, 1fr); }
      }
      @container cs-shell (max-width: 620px) {
        .cs-review-observations .cs-review-points { grid-template-columns: minmax(0, 1fr); }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-review-periods button, .cs-review-filter-region, .cs-review-filter-chevron { transition: none; }
      }
    `

    const DSH_TIMESPAN_CSS = `
      ${CS_CHART_MOTION_CSS}
      ${CS_SELECT_CSS}
      ${CS_TIMER_CSS}
      ${CS_ANALYSIS_CSS}
      .cs-page {
        box-sizing: border-box;
        min-height: 100%;
        padding: 20px 24px 24px;
        background: var(--dsw-alias-bg-base);
        color: var(--dsw-alias-label-primary);
        font-family: inherit;
        overflow: auto;
      }
      .cs-page *,
      .cs-page *::before,
      .cs-page *::after { box-sizing: border-box; }
      .cs-shell {
        container: cs-shell / inline-size;
        width: 100%;
        max-width: 1320px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }
      .cs-topbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; min-height: 44px; }
      .cs-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .cs-mark {
        width: 42px; height: 42px; border-radius: 0; flex: none;
        display: inline-flex; align-items: center; justify-content: center;
        color: var(--cs-signal);
        background: transparent;
        border: 0; overflow: visible;
      }
      .cs-brand-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .cs-brand-text h1 { margin: 0; font-size: 17px; line-height: 22px; font-weight: 650; letter-spacing: -0.01em; }
      .cs-topbar-right { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; row-gap: 6px; min-width: 0; }
      .cs-topbar-group { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
      /* 顶栏通知：统一胶囊高度与字号，长说明留给 HoverTip，不再用整行横幅挤占内容。 */
      .cs-topbar-notices { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; min-width: 0; }
      .cs-notice-chip {
        position: relative; display: inline-flex; align-items: center; gap: 5px;
        max-width: 240px; min-width: 0; height: 26px; padding: 0 5px 0 8px;
        border-radius: 999px; font-size: 11px; line-height: 1; white-space: nowrap;
        color: var(--cs-signal-deep);
        border: 1px solid color-mix(in srgb, currentColor 28%, var(--dsw-alias-border-l1));
        background: color-mix(in srgb, currentColor 7%, var(--dsw-alias-bg-layer-1));
        animation: cs-notice-chip-in 180ms cubic-bezier(.2, .8, .2, 1) both;
      }
      .cs-notice-chip.is-success { color: var(--dsw-alias-state-success-primary); }
      .cs-notice-chip.is-error { color: var(--dsw-alias-state-error-primary); }
      .cs-notice-chip > .cs-detail-glyph { flex: none; }
      .cs-notice-chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
      .cs-notice-chip-action {
        appearance: none; flex: none; padding: 2px 7px; border: 0; border-radius: 999px;
        background: color-mix(in srgb, currentColor 13%, transparent); color: inherit;
        font: inherit; font-size: 10px; line-height: 1.4; cursor: pointer;
      }
      .cs-notice-chip-action:hover { background: color-mix(in srgb, currentColor 22%, transparent); }
      .cs-notice-chip-action:disabled { opacity: .55; cursor: default; }
      .cs-notice-chip-close {
        appearance: none; flex: none; width: 18px; height: 18px; padding: 0; margin-left: 1px;
        display: inline-grid; place-items: center; border: 0; border-radius: 50%;
        background: transparent; color: inherit; opacity: .62;
        font: inherit; font-size: 13px; line-height: 1; cursor: pointer;
      }
      .cs-notice-chip-close:hover { opacity: 1; background: color-mix(in srgb, currentColor 14%, transparent); }
      .cs-notice-chip-close:focus-visible,
      .cs-notice-chip-action:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .cs-notice-chip-progress {
        position: absolute; left: 9px; right: 9px; bottom: 2px; height: 2px;
        border-radius: 999px; overflow: hidden; background: color-mix(in srgb, currentColor 18%, transparent);
      }
      .cs-notice-chip-progress i { display: block; height: 100%; border-radius: inherit; background: currentColor; transition: width .25s ease; }
      .cs-spinner.is-notice { width: 11px; height: 11px; border-width: 1.5px; flex: none; }
      @keyframes cs-notice-chip-in {
        from { opacity: 0; transform: translateY(-3px) scale(.96); }
        to { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-notice-chip { animation: none; }
        .cs-notice-chip-progress i { transition: none; }
      }
      .cs-topbar-divider { flex: none; width: 1px; height: 20px; background: var(--dsw-alias-border-l1); }
      /* 顶栏两枚循环图标成对：外观保持线描；配色图标改成白色外环包住当前套信号色圆心。 */
      .cs-palette-toggle svg .cs-palette-ring {
        stroke: #fff;
        filter: drop-shadow(0 0 1px rgba(0, 0, 0, .45));
      }
      .cs-palette-toggle svg .cs-palette-signal { transition: fill 160ms ease; }
      .cs-live { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 16px; white-space: nowrap; }
      /* 顶栏与侧栏共用同一套状态语义：活跃中蓝色、任务中紫色；任务中优先。 */
      .cs-live.is-live.is-active { color: var(--cs-live); }
      .cs-live.is-live.is-task { color: var(--cs-task); }
      .cs-dot { position: relative; display: inline-block; width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
      .cs-live.is-live.is-active .cs-dot { background: var(--cs-chart-active); }
      .cs-live.is-live.is-task .cs-dot { background: var(--cs-task); }
      /* 与侧栏入口一致：活跃/任务进行中时只做一圈向外扩散的呼吸环。 */
      .cs-live.is-live.is-active .cs-dot::before,
      .cs-live.is-live.is-task .cs-dot::before {
        content: ''; position: absolute; inset: -2px; border-radius: 50%;
        border: 1.5px solid color-mix(in srgb, var(--cs-chart-active) 58%, transparent);
        animation: cs-status-dot-pulse 3.6s cubic-bezier(.2, .55, .25, 1) infinite;
        will-change: transform, opacity;
      }
      .cs-live.is-live.is-task .cs-dot::before {
        border-color: color-mix(in srgb, var(--cs-task) 58%, transparent);
      }
      @keyframes cs-status-dot-pulse {
        0% { transform: scale(.48); opacity: .58; }
        52%, 100% { transform: scale(2.15); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-live.is-live .cs-dot::before { animation: none; }
      }
      .cs-segmented { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 9px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
      .cs-segment { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; line-height: 18px; padding: 4px 12px; border-radius: 6px; cursor: pointer; }
      .cs-segment.is-active {
        color: var(--dsw-alias-brand-primary); font-weight: 650;
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent);
      }
      .cs-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .cs-section-title { font-size: 13px; line-height: 18px; font-weight: 600; }
      .cs-tag { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); padding: 2px 9px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); white-space: nowrap; }
      .cs-cycles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .cs-cycle {
        display: flex; flex-direction: column; justify-content: flex-start; gap: 0; min-width: 0;
        padding: 15px 18px 16px; border-radius: 14px;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
        color: inherit; font: inherit; text-align: left; cursor: pointer;
      }
      .cs-cycle-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .cs-cycle-date { margin-left: auto; font-size: 12px; line-height: 18px; color: var(--cs-ink-2); font-weight: 500; }
      .cs-cycle-title { font-size: 13px; line-height: 18px; font-weight: 620; letter-spacing: .01em; }
      .cs-cycle-value {
        margin-top: 5px;
        font-family: var(--cs-mono); font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1;
        font-size: clamp(30px, 3vw, 40px); line-height: 1.06; font-weight: 650; letter-spacing: -0.045em;
      }
      .cs-cycle-tail { display: flex; flex-direction: column; gap: 5px; margin-top: auto; padding-top: 10px; }
      .cs-cycle-share {
        font-size: 10px; line-height: 14px; color: var(--dsw-alias-label-secondary);
        font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right;
      }
      .cs-cycle-track {
        display: block; height: 4px; border-radius: 999px; overflow: hidden;
        background: var(--cs-tone-faint);
      }
      .cs-cycle-track i { display: block; height: 100%; border-radius: inherit; background: var(--cs-chart-active); }
      .cs-cycle.is-current {
        border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, var(--dsw-alias-border-l1));
        background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1)), var(--dsw-alias-bg-layer-1));
      }
      .cs-cycle.is-current .cs-cycle-track { background: color-mix(in srgb, var(--cs-on-selection) 28%, transparent); }
      .cs-cycle.is-current .cs-cycle-track i { background: var(--cs-on-selection); }
      .cs-card { min-width: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); padding: 13px 16px; }
      .cs-trend-card { display: flex; flex-direction: column; gap: 8px; }
      .cs-table-card { display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; }
      .cs-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      /* 只把概览/趋势区块的标题文字与说明整体上提 4px；卡片头保持静态，
         避免成为右上角缩放按钮的定位参照，放大按钮始终贴卡片右上角。 */
      .cs-overview-grid .cs-card-heading,
      .cs-trend-layout .cs-card-heading,
      .cs-trend-bottom .cs-card-heading { position: relative; top: -4px; }
      .cs-card-heading { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
      .cs-heatmap-card .cs-card-heading { align-items: center; }
      .cs-card-heading h2 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 620; }
      .cs-card-title { display: inline-flex; align-items: center; gap: 4px; }
      .cs-text-fade { position: relative; display: inline-block; max-width: 100%; }
      .cs-text-fade > span { display: block; min-width: 0; }
      .cs-text-fade-prev { position: absolute; inset: 0; white-space: nowrap; overflow: hidden; }
      .cs-text-fade.is-changing .cs-text-fade-prev { animation: cs-text-fade-out 100ms ease-in both; }
      .cs-text-fade.is-changing .cs-text-fade-current { animation: cs-text-fade-in 140ms ease-out both; }
      @keyframes cs-text-fade-out { from { opacity: 1; } to { opacity: 0; } }
      @keyframes cs-text-fade-in { from { opacity: 0; } to { opacity: 1; } }
      .cs-card-icon { display: inline-flex; color: var(--dsw-alias-label-secondary); }
      .cs-card-icon.has-tip { color: var(--dsw-alias-label-secondary); }
      /* 模块图标可作为说明入口：停留片刻浮出简介，图标轻弹一下；动作短促且只播一次。 */
      .cs-card-icon-btn {
        appearance: none; position: relative; display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; margin: -4px 0 -4px -4px; padding: 0; border: 0; border-radius: 7px;
        background: transparent; color: inherit; cursor: help;
      }
      .cs-card-icon-btn::before {
        content: ""; position: absolute; inset: 0; border-radius: 7px; pointer-events: none;
        background: color-mix(in srgb, currentColor 12%, transparent);
        opacity: 0; transform: scale(.72);
        transition: opacity 140ms ease, transform 220ms cubic-bezier(.34, 1.56, .64, 1);
      }
      .cs-card-icon-btn:hover::before, .cs-card-icon-btn:focus-visible::before { opacity: 1; transform: scale(1); }
      .cs-card-icon-btn:hover .cs-detail-glyph, .cs-card-icon-btn:focus-visible .cs-detail-glyph {
        animation: cs-card-glyph-pop 460ms cubic-bezier(.34, 1.56, .64, 1) both;
      }
      .cs-card-icon-btn:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: 1px; }
      @keyframes cs-card-glyph-pop {
        0% { transform: scale(1) rotate(0); }
        35% { transform: translateY(-1px) scale(1.2) rotate(-7deg); }
        68% { transform: translateY(0) scale(1.06) rotate(3deg); }
        100% { transform: scale(1.08) rotate(0); }
      }
      .cs-card-hint { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-legend { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .cs-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-swatch { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
      .cs-swatch.is-active { background: var(--cs-chart-active); }
      .cs-swatch.is-task { background: var(--cs-task); }
      .cs-detail-glyph { display: block; flex: 0 0 auto; }
      .cs-detail-meta {
        display: inline-flex; align-items: center; gap: 4px; min-width: 0;
        color: var(--dsw-alias-label-secondary); cursor: help; border-radius: 5px;
      }
      .cs-detail-meta:hover { color: var(--dsw-alias-label-primary); }
      .cs-detail-meta:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-detail-meta-value { font-variant-numeric: tabular-nums; white-space: nowrap; }
      .cs-detail-meta.is-active .cs-detail-glyph { color: var(--cs-live); }
      .cs-detail-meta.is-task .cs-detail-glyph { color: var(--cs-task); }
      .cs-detail-meta.is-running .cs-detail-glyph { color: var(--cs-task); }
      .cs-detail-meta.is-warning .cs-detail-glyph { color: var(--dsw-alias-state-error-primary); }
      .cs-chart { position: relative; width: 100%; min-width: 0; }
      .cs-chart svg { display: block; width: 100%; height: 138px; }
      .cs-axis { position: relative; height: 16px; margin-top: 2px; }
      .cs-axis span { position: absolute; top: 0; transform: translateX(-50%); font-size: var(--cs-chart-label-size, 10px); line-height: 16px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .cs-table-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .cs-range { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
      .cs-row {
        display: grid;
        grid-template-columns: minmax(0, 2.2fr) 96px 96px 84px 112px 24px;
        grid-template-areas: "name active task share last toggle";
        align-items: center;
        gap: 10px;
      }
      .cs-table-head { padding: 5px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .cs-table-head .cs-cell { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-table-body { max-height: 264px; overflow-y: auto; }
      .cs-summary { padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); cursor: pointer; }
      .cs-summary:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, transparent); }
      .cs-cell { min-width: 0; }
      .cs-name { grid-area: name; display: flex; flex-direction: column; gap: 1px; }
      .cs-name-text { font-size: 13px; line-height: 18px; font-weight: 560; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cs-name-sub { display: inline-flex; align-items: center; gap: 3px; width: max-content; font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-secondary); }
      .cs-name-sub .cs-detail-glyph { width: 11px; height: 11px; }
      .cs-name-sub .cs-detail-meta-value { font-size: 10.5px; line-height: 14px; }
      .cs-active { grid-area: active; }
      .cs-task { grid-area: task; }
      .cs-share { grid-area: share; display: flex; flex-direction: column; gap: 3px; }
      .cs-last { grid-area: last; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cs-toggle { grid-area: toggle; display: flex; justify-content: flex-end; }
      .cs-num { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; font-size: 12px; line-height: 18px; white-space: nowrap; }
      .cs-share-text { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
      .cs-share-track { display: block; width: 100%; max-width: 68px; height: 3px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
      .cs-share-fill { display: block; height: 100%; border-radius: 999px; background: var(--dsw-alias-brand-primary); }
      .cs-chevron { width: 7px; height: 7px; border-right: 1.5px solid var(--dsw-alias-label-secondary); border-bottom: 1.5px solid var(--dsw-alias-label-secondary); transform: rotate(45deg); transition: transform 0.15s ease; }
      .cs-chevron.is-open { transform: rotate(-135deg); }
      .cs-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
      /* 会话明细改用同色系表面：整块圆角、左侧引导线，缩进与汇总行一致。 */
      .cs-sessions { display: flex; flex-direction: column; padding: 10px 24px; border-radius: 10px; border-left: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
      .cs-sessions-more {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        margin-top: 2px; padding: 9px 0 2px; border-top: 1px dashed var(--dsw-alias-border-l1);
      }
      .cs-sessions-more .cs-text-link { margin-top: 0; font-size: 11.5px; }
      .cs-sessions-count { font-size: 10.5px; line-height: 16px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .cs-session {
        position: relative; display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap;
        padding: 8px 12px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary);
        border-radius: 8px;
      }
      .cs-session + .cs-session { border-top: 1px dashed var(--dsw-alias-border-l1); }
      /* 从最近会话跳转过来时给目标行留一段可见的定位高亮，随后自然淡出。
         高亮层比会话行左右各收 8px，不贴住内容两侧。 */
      .cs-session.is-highlighted { scroll-margin-block: 28vh; }
      .cs-session.is-highlighted::before {
        content: '';
        position: absolute;
        inset: 1px 8px;
        border-radius: 8px;
        pointer-events: none;
        animation: cs-session-locate 3s ease-out both;
      }
      .cs-session.is-highlighted > * { position: relative; z-index: 1; }
      @keyframes cs-session-locate {
        0% {
          background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, transparent);
        }
        68% {
          background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent);
        }
        100% { background: transparent; box-shadow: inset 0 0 0 1px transparent; }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-session.is-highlighted::before { animation-duration: .01ms; }
      }
      .cs-session-title { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 540; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }
      .cs-session-status { width: 18px; height: 18px; justify-content: center; }
      .cs-session-status:hover { background: var(--dsw-alias-bg-layer-2); }
      .cs-session-metrics { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; }
      .cs-session-stat { padding: 2px 6px; background: var(--dsw-alias-bg-layer-2); }
      .cs-session-stat .cs-detail-meta-value { font-size: 10.5px; }
      .cs-session-tool { width: 18px; height: 18px; justify-content: center; }
      .cs-session-tool:hover { background: var(--dsw-alias-bg-layer-2); }
      .cs-session-last { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; white-space: nowrap; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cs-session-last:hover { color: var(--dsw-alias-label-primary); }
      .cs-empty { padding: 22px 12px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
      .cs-empty.is-small { padding: 10px; }
      .cs-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; }
      .cs-loading { min-height: 340px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 1px dashed var(--dsw-alias-border-l1); border-radius: 14px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cs-loading strong { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 600; }
      .cs-loading.is-error strong { color: var(--dsw-alias-state-error-primary); }
      .cs-spinner { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l1); border-top-color: var(--dsw-alias-brand-primary); animation: cs-spin 0.8s linear infinite; }
      @keyframes cs-spin { to { transform: rotate(360deg); } }
      @media (max-width: 1080px) {
        .cs-row { grid-template-columns: minmax(0, 2fr) 88px 88px 78px 100px 24px; }
      }
      @media (max-width: 860px) {
        .cs-topbar { display: flex; flex-wrap: wrap; justify-content: flex-start; }
        .cs-brand { width: 100%; justify-content: flex-start; }
        .cs-topbar-right { width: 100%; justify-content: flex-start; flex-wrap: wrap; }
        .cs-cycles { grid-template-columns: 1fr; gap: 10px; }
        .cs-cycle { padding: 10px 14px; }
        .cs-table-head { display: none; }
        .cs-table-body { max-height: none; }
        .cs-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 12px; padding: 10px 0; }
        .cs-name { flex: 1 1 calc(100% - 36px); order: 0; }
        .cs-toggle { order: 1; }
        .cs-task { order: 2; }
        .cs-share { order: 3; flex: 1 1 76px; flex-direction: row; align-items: center; gap: 7px; }
        .cs-share-track { flex: 0 1 64px; min-width: 32px; max-width: 64px; }
        .cs-active { order: 4; }
        .cs-last { order: 5; margin-left: auto; }
        .cs-session-last { margin-left: 0; }
      }
      @media (max-width: 520px) {
        .cs-page { padding: 14px 12px 20px; }
        .cs-shell { gap: 10px; }
        .cs-card { padding: 12px; border-radius: 12px; }
        .cs-table-card { padding-bottom: 6px; }
        .cs-chart svg { height: 120px; }
        .cs-legend { gap: 8px; }
        .cs-brand-text h1 { font-size: 16px; }
        .cs-segment { padding: 4px 10px; }
        .cs-foot { line-height: 18px; }
      }

      /* 视觉基座：焦点与活跃使用当前配色的信号色阶，任务总量使用独立任务紫；普通灰用于表面、边框、轨道与次级文字。 */
      .cs-page {
        --cs-bg: #f3f3f2;
        --cs-surface: #ffffff;
        --cs-surface-2: #ececeb;
        --cs-ink: #181a1c;
        --cs-ink-2: #606568;
        --cs-ink-3: #6f7476;
        --cs-line: #dedfdd;
        --cs-focus: #292d30;
        /* 用户指定的焦点信息三档蓝，由深到浅；浅色外观下深是其强调色。 */
        --cs-signal-deep: #133463;
        --cs-signal: #1F4E94;
        --cs-signal-soft: #79B3F9;
        /* 浅色外观：上半段深、左下段浅、指针深，和深色外观正好对调。 */
        --cs-brand-ring-high: var(--cs-signal);
        --cs-brand-ring-low: var(--cs-signal-soft);
        --cs-brand-hand: var(--cs-signal-deep);
        --cs-accent: var(--cs-signal-deep);
        --cs-on-accent: #ffffff;
        --cs-live: var(--cs-signal);
        --cs-task: #C29BE8;
        --cs-ring-track: color-mix(in srgb, var(--cs-signal) 20%, var(--cs-surface));
        --cs-tone-faint: color-mix(in srgb, var(--cs-signal-soft) 18%, var(--cs-surface));
        --cs-tone-soft: color-mix(in srgb, var(--cs-signal-soft) 38%, var(--cs-surface));
        --cs-tone-other: color-mix(in srgb, var(--cs-signal) 42%, var(--cs-surface));
        /* 热力图从极浅的信号色平滑过渡到深信号色；0 级是“有记录但活跃很低”，不是灰色。 */
        --cs-heat-0: color-mix(in srgb, var(--cs-signal-soft) 13%, transparent);
        --cs-heat-1: color-mix(in srgb, var(--cs-signal-soft) 30%, var(--cs-surface));
        --cs-heat-2: color-mix(in srgb, var(--cs-signal-soft) 56%, var(--cs-surface));
        --cs-heat-3: color-mix(in srgb, var(--cs-signal-soft) 78%, var(--cs-signal));
        --cs-heat-4: var(--cs-signal);
        --cs-heat-5: var(--cs-signal-deep);
        --cs-error: #ad3e3e;
        --cs-sp-1: 4px; --cs-sp-2: 8px; --cs-sp-3: 12px; --cs-sp-4: 20px; --cs-sp-5: 32px;
        --cs-radius: 10px; --cs-radius-sm: 6px;
        --cs-num-lg: 46px; --cs-num-md: 20px; --cs-num-sm: 14px;
        --cs-dur-tap: 160ms; --cs-dur-exit: 120ms; --cs-dur-view: 240ms; --cs-dur-enter: 420ms;
        --cs-ease: cubic-bezier(.22,.7,.24,1);
        --cs-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        --cs-mono: ui-monospace, "Cascadia Mono", Consolas, "SF Mono", monospace;
        --dsw-alias-bg-base: var(--cs-bg);
        --dsw-alias-bg-layer-1: var(--cs-surface);
        --dsw-alias-bg-layer-2: var(--cs-surface-2);
        --dsw-alias-label-primary: var(--cs-ink);
        --dsw-alias-label-secondary: var(--cs-ink-2);
        --dsw-alias-border-l1: var(--cs-line);
        --dsw-alias-brand-primary: var(--cs-accent);
        --dsw-alias-state-success-primary: var(--cs-live);
        --dsw-alias-state-idle-primary: var(--cs-ink-3);
        --dsw-alias-state-error-primary: var(--cs-error);
        color-scheme: light;
        padding: 28px 32px 36px;
      }
      .cs-page.cs-palette-blue {
        --cs-signal-deep: #133463; --cs-signal: #1F4E94; --cs-signal-soft: #79B3F9;
      }
      .cs-page.cs-palette-stone {
        --cs-signal-deep: #2b3033; --cs-signal: #4a5155; --cs-signal-soft: #aeb6b9;
      }
      .cs-page.cs-palette-cyan {
        --cs-signal-deep: #0C4A52; --cs-signal: #0E7490; --cs-signal-soft: #67E8F9;
      }
      .cs-page.cs-palette-stone:not(.cs-appearance-dark),
      .cs-page.cs-palette-cyan:not(.cs-appearance-dark) {
        --cs-chart-active: var(--cs-signal-soft);
        --cs-on-selection: var(--cs-signal-deep);
        --cs-series-model: color-mix(in srgb, var(--cs-signal-soft) 50%, var(--cs-signal));
        --cs-series-tool: var(--cs-signal-soft);
        --cs-series-wait: color-mix(in srgb, var(--cs-signal-soft) 58%, var(--cs-surface));
        --cs-series-other: color-mix(in srgb, var(--cs-signal-soft) 28%, var(--cs-surface));
        --cs-series-unknown: color-mix(in srgb, var(--cs-signal-soft) 15%, var(--cs-surface));
      }
      .cs-page.cs-palette-coral {
        ${CS_CORAL_LIGHT}
        --cs-brand-ring-high: var(--cs-palette-primary);
        --cs-solid-ink: #30150E;
        --cs-heat-0: #fff1ed; --cs-heat-1: #ffddd1; --cs-heat-2: #ffb9a5;
        --cs-heat-3: #ff9077; --cs-heat-4: #FF5B3B; --cs-heat-5: #952f20;
      }
      /* 热力图蓝色阶梯：浅色由雾蓝到深海蓝共六档，色相连续、明度均匀递进。 */
      .cs-page.cs-palette-blue.cs-appearance-light {
        --cs-heat-0: #eef5fc;
        --cs-heat-1: #dbe9f7;
        --cs-heat-2: #b8d4ef;
        --cs-heat-3: #86b0dd;
        --cs-heat-4: #4f80bd;
        --cs-heat-5: #1b4c87;
      }
      .cs-page.cs-palette-blue.cs-appearance-dark {
        --cs-heat-0: rgba(121, 179, 249, .13);
        --cs-heat-1: #233a53;
        --cs-heat-2: #315a83;
        --cs-heat-3: #4d82b7;
        --cs-heat-4: #79b3f9;
        --cs-heat-5: #b8d9fb;
      }
      .cs-shell { max-width: 1440px; gap: 18px; }
      .cs-topbar { min-height: 54px; margin-bottom: 4px; }
      .cs-mark { width: 44px; height: 44px; border-radius: 0; background: transparent; color: var(--cs-signal); border: 0; }
      .cs-brand-text h1 { font-size: 20px; line-height: 26px; }
      .cs-icon-toggle {
        appearance: none; position: relative; display: inline-flex; align-items: center; justify-content: center;
        width: 30px; height: 30px; padding: 0; border-radius: 8px; cursor: pointer;
        color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1);
        border: 1px solid var(--dsw-alias-border-l1);
        transition: color var(--cs-dur-tap) var(--cs-ease), border-color var(--cs-dur-tap) var(--cs-ease),
          background-color var(--cs-dur-tap) var(--cs-ease), transform 220ms cubic-bezier(.34, 1.56, .64, 1),
          box-shadow 220ms var(--cs-ease);
      }
      /* 悬停时先浮起一层柔和色晕，再让图标按各自语义做一次短促动作。 */
      .cs-icon-toggle::before {
        content: ""; position: absolute; inset: -4px; border-radius: 11px; pointer-events: none;
        background: radial-gradient(circle at 50% 52%, color-mix(in srgb, var(--cs-accent) 20%, transparent), transparent 70%);
        opacity: 0; transform: scale(.78);
        transition: opacity 160ms ease, transform 260ms cubic-bezier(.34, 1.56, .64, 1);
      }
      .cs-icon-toggle:hover {
        color: var(--dsw-alias-label-primary);
        border-color: color-mix(in srgb, var(--cs-accent) 45%, var(--dsw-alias-border-l1));
        transform: translateY(-1px);
        box-shadow: 0 4px 12px color-mix(in srgb, var(--cs-accent) 13%, transparent);
      }
      .cs-icon-toggle:hover::before, .cs-icon-toggle:focus-visible::before { opacity: 1; transform: scale(1); }
      .cs-icon-toggle:active { transform: translateY(0) scale(.93); transition-duration: 80ms; }
      .cs-icon-toggle:focus-visible { outline: 2px solid var(--cs-accent); outline-offset: 2px; }
      .cs-icon-toggle svg { display: block; transform-origin: 50% 50%; transition: transform 260ms cubic-bezier(.34, 1.56, .64, 1), filter 260ms var(--cs-ease); }
      .cs-icon-toggle:hover svg { filter: drop-shadow(0 2px 4px color-mix(in srgb, var(--cs-accent) 26%, transparent)); }
      /* 太阳转半格、月亮侧倾、系统屏轻抬：三种外观状态各自可辨。 */
      .cs-appearance-toggle[data-appearance="light"]:hover svg,
      .cs-appearance-toggle[data-appearance="light"]:focus-visible svg { transform: rotate(45deg) scale(1.08); }
      .cs-appearance-toggle[data-appearance="dark"]:hover svg,
      .cs-appearance-toggle[data-appearance="dark"]:focus-visible svg { transform: translateY(-1px) rotate(-18deg) scale(1.08); }
      .cs-appearance-toggle[data-appearance="system"]:hover svg,
      .cs-appearance-toggle[data-appearance="system"]:focus-visible svg { transform: translateY(-1px) scale(1.12); }
      /* 配色按钮：中心色点向外轻弹，白色外环泛起一圈回声。 */
      .cs-palette-signal, .cs-palette-ring { transform-box: fill-box; transform-origin: center; transition: transform 260ms cubic-bezier(.34, 1.56, .64, 1); }
      .cs-palette-toggle:hover .cs-palette-signal, .cs-palette-toggle:focus-visible .cs-palette-signal { transform: scale(1.24); }
      .cs-palette-toggle:hover .cs-palette-ring, .cs-palette-toggle:focus-visible .cs-palette-ring { transform: scale(1.04); }
      .cs-palette-toggle::after {
        content: ""; position: absolute; inset: 2px; border-radius: 6px; pointer-events: none;
        border: 1px solid color-mix(in srgb, var(--cs-chart-active, var(--cs-signal)) 55%, transparent);
        opacity: 0; transform: scale(.55);
        transition: opacity 150ms ease, transform 280ms cubic-bezier(.34, 1.56, .64, 1);
      }
      /* 回声环与按钮同心同圆角，停在边框内侧，不再与边框相交或留下角部空隙。 */
      .cs-palette-toggle:hover::after, .cs-palette-toggle:focus-visible::after { opacity: .95; transform: scale(1); }
      .cs-segmented { background: var(--dsw-alias-bg-layer-1); }
      .cs-segment { padding: 7px 16px; }
      .cs-segment.is-active { background: var(--dsw-alias-brand-primary); color: #fff; box-shadow: none; }
      .cs-section-title { font-size: 17px; line-height: 24px; }
      .cs-cycles { gap: 14px; }
      .cs-cycle { padding: 16px 18px 17px; gap: 0; border-radius: 12px; }
      .cs-cycle.is-current { background: var(--cs-selection); border-color: var(--cs-selection); }
      .cs-cycle.is-current .cs-cycle-share { color: #e1e3e2; }
      .cs-card { padding: 20px; border-radius: 12px; }
      .cs-card-heading h2 { font-size: 16px; line-height: 24px; }
      .cs-trend-card { gap: 16px; }
      .cs-chart svg { height: 180px; }
      .cs-table-card { gap: 14px; }
      .cs-summary { padding: 13px 4px; }
      .cs-table-body { max-height: 400px; }
      .cs-session { padding: 10px 12px; }
      .cs-page button:focus-visible, .cs-summary:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; }
      @media (max-width: 860px) { .cs-page { padding: 18px 16px 28px; } .cs-cycles { grid-template-columns: repeat(3, minmax(0, 1fr)); } .cs-cycle { padding: 14px; } }
      @media (max-width: 600px) { .cs-cycles { grid-template-columns: 1fr; } .cs-chart svg { height: 130px; } .cs-topbar-right { justify-content: flex-start; flex-wrap: wrap; } }

      /* 周期概览标题行可换行；右侧指标网格随卡片高度铺满。 */
      .cs-overview-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; }
      .cs-summary-heading { display: flex; flex-direction: column; gap: 4px; }
      .cs-summary-heading h2 { font-size: 16px; line-height: 24px; margin: 0; }
      .cs-summary-feature { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 9px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cs-summary-feature strong { color: var(--dsw-alias-label-primary); font-size: 26px; line-height: 32px; font-variant-numeric: tabular-nums; }
      .cs-summary-feature small { font-size: 11px; }
      .cs-summary-item { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 9px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cs-summary-item:last-child { border-bottom: 0; padding-bottom: 0; }
      .cs-summary-item strong { color: var(--dsw-alias-label-primary); font-size: 14px; font-variant-numeric: tabular-nums; }
      .cs-card, .cs-cycle, .cs-segment { transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease; }
      .cs-page { --cs-on-accent: #fff; }
      /* 深色外观：三档蓝按视觉深到浅翻转为浅/中/深，低值热力格仍可见。 */
      .cs-page.cs-appearance-dark {
        color-scheme: dark;
        --cs-bg: #151718;
        --cs-surface: #202324;
        --cs-surface-2: #303435;
        --cs-ink: #f1f2f1;
        --cs-ink-2: #b1b6b5;
        --cs-ink-3: #8a9090;
        --cs-line: #414647;
        --cs-focus: #e4e7e5;
        --cs-signal-deep: #a9cffa;
        --cs-signal: #79B3F9;
        --cs-signal-soft: #3f6ba8;
        /* 深色外观：上半段浅、左下段深、指针白，与浅色外观镜像。 */
        --cs-brand-ring-high: var(--cs-signal);
        --cs-brand-ring-low: var(--cs-signal-soft);
        --cs-brand-hand: #ffffff;
        --cs-accent: var(--cs-signal);
        --cs-on-accent: #171a19;
        --cs-task: #C29BE8;
        --cs-error: #f09691;
      }
      /* 深色外观沿用珊瑚橙的做法：活跃项用各自的强主色，和发白的在线时长色拉开第一眼差异。 */
      .cs-page.cs-appearance-dark.cs-palette-blue {
        --cs-chart-active: #4F9BFF;
      }
      /* 深色石墨灰：活跃项取整套配色里最亮的浅灰，在线降到中阶，热力最高档与任务模型保留原浅灰。 */
      .cs-page.cs-appearance-dark.cs-palette-stone {
        --cs-signal-deep: #8F9A9E; --cs-signal: #AEB6B9; --cs-signal-soft: #6C7477;
        --cs-chart-active: #E6EDEF;
        --cs-heat-5: #D9DEE0;
        --cs-series-model: #D9DEE0;
      }
      .cs-page.cs-appearance-dark.cs-palette-cyan {
        --cs-signal-deep: #A5F3FC; --cs-signal: #22D3EE; --cs-signal-soft: #155E75;
        --cs-chart-active: #22D3EE;
      }
      .cs-page.cs-appearance-dark.cs-palette-coral {
        ${CS_CORAL_DARK}
        --cs-brand-ring-high: var(--cs-palette-primary);
        --cs-heat-0: #352320; --cs-heat-1: #583027; --cs-heat-2: #853f31;
        --cs-heat-3: #bc5340; --cs-heat-4: #FF5B3B; --cs-heat-5: #ffad99;
      }
      .cs-segment.is-active { color: var(--cs-on-accent); }
      .cs-appearance-dark .cs-cycle.is-current .cs-cycle-share { color: color-mix(in srgb, var(--cs-on-accent) 72%, var(--cs-surface)); }
      .cs-appearance-dark .cs-segment.is-active { color: var(--cs-on-accent); }
      @media (prefers-reduced-motion: reduce) { .cs-page.cs-page *, .cs-page.cs-page *::before, .cs-page.cs-page *::after { transition-duration: 0s; animation-duration: 0s; } }

      /* 周期卡即入口，右上角只呈现当前选择。 */
      .cs-cycle { appearance: none; font: inherit; color: inherit; text-align: left; cursor: pointer; width: 100%; }
      .cs-cycle:not(.is-current):hover { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, var(--dsw-alias-bg-layer-1)); }
      .cs-cycle:active { transform: translateY(1px); }
      .cs-cycle-head { align-items: center; }
      .cs-cycle-share { margin-left: auto; }
      .cs-period-loading { min-height: 180px; }
      .cs-table-body { max-height: none; overflow: visible; }
      .cs-summary { border-radius: 7px; }
      .cs-summary .cs-cell::before { display: none; }
      @media (max-width: 860px) {
        .cs-summary .cs-active::before, .cs-summary .cs-task::before, .cs-summary .cs-share::before, .cs-summary .cs-last::before { display: inline; content: attr(data-label) ' '; color: var(--dsw-alias-label-secondary); font-family: inherit; font-size: 11px; }
        .cs-summary .cs-share::before { white-space: nowrap; }
        .cs-summary { gap: 10px 14px; }
      }

      /* 数字、对齐与明细交互：主指标优先，展开箭头留出稳定空间。 */
      .cs-cycle { min-height: 112px; }
      .cs-cycle-title { font-size: 14px; }
      .cs-cycle.is-current .cs-cycle-value { font-weight: 700; }
      .cs-row { grid-template-columns: minmax(0, 2.2fr) 96px 96px 108px 112px 40px; }
      .cs-table-head { padding: 7px 12px; }
      .cs-summary { min-height: 64px; padding: 10px 12px; }
      .cs-toggle { width: 40px; height: 40px; justify-content: center; align-items: center; }
      .cs-chevron { width: 8px; height: 8px; }
      .cs-summary:hover .cs-toggle, .cs-summary:focus-visible .cs-toggle { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); border-radius: 8px; }
      .cs-name-text { font-size: 13px; font-weight: 650; }
      .cs-num, .cs-share-text { font-size: 13px; font-weight: 550; }
      .cs-session { line-height: 19px; }
      .cs-session-title { max-width: min(100%, 340px); }
      .cs-page { scrollbar-gutter: stable; }
      @media (max-width: 1080px) and (min-width: 861px) { .cs-row { grid-template-columns: minmax(0, 2fr) 88px 88px 96px 100px 40px; } }
      @media (max-width: 860px) { .cs-summary { padding: 10px 12px; } .cs-toggle { margin: -5px -5px -5px 0; } }
      @media (max-width: 600px) { .cs-cycle { min-height: 96px; } .cs-summary { padding: 12px 10px; } .cs-sessions { padding-left: 16px; } }

      /* 构成圆环与工作区排行均来自当前周期的真实会话累计数据；类别色阶由当前配色派生。 */
      .cs-page {
        --cs-chart-active: var(--cs-live);
        --cs-selection: var(--cs-chart-active);
        --cs-on-selection: var(--cs-on-accent);
        --cs-series-model: var(--cs-signal-deep);
        --cs-series-tool: color-mix(in srgb, var(--cs-signal) 72%, var(--cs-surface));
        --cs-series-wait: color-mix(in srgb, var(--cs-signal) 50%, var(--cs-surface));
        --cs-series-other: color-mix(in srgb, var(--cs-signal) 32%, var(--cs-surface));
        --cs-series-unknown: color-mix(in srgb, var(--cs-signal) 17%, var(--cs-surface));
      }
      /* 浅色蓝方案以浅蓝为主；模型用中浅蓝拉开类别差异，其余构成逐级变浅。 */
      .cs-page.cs-palette-blue:not(.cs-appearance-dark) {
        --cs-chart-active: var(--cs-signal-soft);
        --cs-on-selection: var(--cs-signal-deep);
        --cs-series-model: color-mix(in srgb, var(--cs-signal-soft) 50%, var(--cs-signal));
        --cs-series-tool: var(--cs-signal-soft);
        --cs-series-wait: color-mix(in srgb, var(--cs-signal-soft) 58%, var(--cs-surface));
        --cs-series-other: color-mix(in srgb, var(--cs-signal-soft) 28%, var(--cs-surface));
        --cs-series-unknown: color-mix(in srgb, var(--cs-signal-soft) 15%, var(--cs-surface));
      }
      .cs-page.cs-palette-coral {
        --cs-chart-active: var(--cs-palette-primary);
        --cs-on-selection: var(--cs-solid-ink);
        --cs-series-tool: var(--cs-palette-primary);
        --cs-series-wait: color-mix(in srgb, var(--cs-signal-soft) 74%, var(--cs-surface));
        --cs-series-other: color-mix(in srgb, var(--cs-signal-soft) 45%, var(--cs-surface));
        --cs-series-unknown: color-mix(in srgb, var(--cs-signal-soft) 22%, var(--cs-surface));
      }
      /* 浅色珊瑚：模型取中浅暖红，保持比工具色更深，但不再压暗整个构成环。 */
      .cs-page.cs-palette-coral:not(.cs-appearance-dark) {
        --cs-series-model: color-mix(in srgb, var(--cs-signal-soft) 50%, var(--cs-signal-deep));
      }
      .cs-page.cs-palette-coral :is(.cs-segment.is-active, .cs-btn.is-primary, .cs-appearance-check) {
        color: var(--cs-solid-ink); background: var(--cs-palette-primary); border-color: var(--cs-palette-primary);
      }
      .cs-cycle.is-current { color: var(--cs-on-selection); }
      .cs-appearance-light .cs-cycle.is-current .cs-cycle-share { color: inherit; }
      /* 概览各行使用独立列宽：趋势与构成同排，底部给热力图与会话列表留出更多空间。 */
      .cs-overview-grid {
        display: grid; grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto auto auto; gap: 10px; align-content: start;
      }
      .cs-overview-analysis, .cs-overview-bottom { display: grid; min-width: 0; gap: 10px; }
      .cs-overview-analysis { grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr); }
      .cs-overview-bottom { grid-template-columns: minmax(0, 1.08fr) minmax(0, .87fr) minmax(0, 1.3fr); }
      .cs-overview-bottom.is-year { grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); }
      .cs-overview-grid > .cs-heatmap-card { grid-column: 1 / -1; }
      #cs-view-overview { container: cs-overview / inline-size; }
      @container cs-overview (max-width: 850px) {
        /* 英文周期名称较长，提前分成两列，避免日期换行挤压时长。 */
        .cs-overview-metrics:lang(en) { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 8px; }
        .cs-overview-analysis { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); }
        .cs-overview-bottom { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .cs-overview-bottom:not(.is-year) > .cs-recent { grid-column: 1 / -1; }
      }
      @container cs-overview (max-width: 560px) {
        .cs-overview-analysis, .cs-overview-bottom, .cs-overview-bottom.is-year { grid-template-columns: minmax(0, 1fr); }
      }
      .cs-analysis-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
      .cs-composition, .cs-ranking { min-height: 250px; display: flex; flex-direction: column; gap: 20px; }
      .cs-composition { container: cs-composition / inline-size; }
      .cs-composition-body { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
      .cs-donut { position: relative; width: clamp(118px, 12vw, 168px); aspect-ratio: 1; flex: none; }
      .cs-donut svg { display: block; width: 100%; height: 100%; }
      .cs-donut-center {
        position: absolute; inset: 18%; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 2px; min-width: 0; text-align: center;
      }
      .cs-donut-center strong {
        max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-size: clamp(14px, 1.3vw, 19px); line-height: 1.12; font-variant-numeric: tabular-nums; letter-spacing: -.025em;
      }
      .cs-donut-center span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 1.15; color: var(--dsw-alias-label-secondary); }
      .cs-composition-list, .cs-ranking-list { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 12px; }
      .cs-ranking-list { flex: 0 0 auto; margin-block: auto; }
      .cs-ranking-list.is-short { margin-block: 4px auto; }
      /* 给图例名称和百分比留足空间，过长的时长可在数字列内换行。 */
      .cs-composition-row { display: grid; grid-template-columns: 10px minmax(min-content, 1fr) max-content minmax(0, max-content); align-items: center; gap: 6px; font-size: 12px; min-width: 0; }
      .cs-composition-label { min-width: max-content; }
      .cs-series-swatch { width: 9px; height: 9px; border-radius: 2px; }
      .cs-series-swatch.is-model { background: var(--cs-series-model); }
      .cs-series-swatch.is-tool { background: var(--cs-series-tool); }
      .cs-series-swatch.is-wait { background: var(--cs-series-wait); }
      .cs-series-swatch.is-other { background: var(--cs-series-other); }
      .cs-series-swatch.is-unknown { background: var(--cs-series-unknown); }
      .cs-composition-percent, .cs-composition-time, .cs-ranking-time { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; min-width: 0; }
      .cs-composition-percent, .cs-rank-index { color: var(--dsw-alias-label-secondary); }
      .cs-composition-time, .cs-ranking-time { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
      .cs-composition-time { white-space: normal; overflow-wrap: anywhere; }
      @container cs-composition (max-width: 310px) {
        .cs-composition-body { flex-direction: column; justify-content: center; gap: 12px; }
        .cs-composition-list { flex: 0 0 auto; width: 100%; }
      }
      .cs-ranking-row { display: grid; grid-template-columns: 23px minmax(65px, 1fr) minmax(45px, 1fr) auto; align-items: center; gap: 10px; font-size: 12px; min-height: 26px; }
      .cs-ranking-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
      .cs-ranking-bar { height: 8px; border-radius: 5px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
      .cs-ranking-bar i { display: block; height: 100%; background: var(--dsw-alias-brand-primary); border-radius: inherit; }
      .cs-page:is(.cs-palette-blue, .cs-palette-stone, .cs-palette-cyan):not(.cs-appearance-dark) .cs-ranking-bar i,
      .cs-page.cs-palette-coral .cs-ranking-bar i { background: var(--cs-chart-active); }
      @media (max-width: 1000px) { .cs-analysis-grid { grid-template-columns: 1fr; } }
      @media (max-width: 520px) { .cs-composition-body { gap: 14px; } .cs-donut { width: 118px; } .cs-donut-center strong { font-size: 14px; } .cs-ranking-row { grid-template-columns: 20px minmax(55px, 1fr) minmax(30px, .7fr) auto; gap: 7px; } }

      .cs-plot { position: relative; padding-left: 58px; }
      .cs-y-axis { position: absolute; left: 0; top: 0; bottom: 0; width: 50px; color: var(--dsw-alias-label-secondary); font-size: var(--cs-chart-label-size, 10px); font-variant-numeric: tabular-nums; }
      .cs-y-axis span { position: absolute; right: 0; transform: translateY(-50%); white-space: nowrap; }
      .cs-axis { margin-left: 58px; }
      .cs-axis.has-future { height: 31px; }
      .cs-axis .cs-axis-future { display: block; position: static; font-size: 10px; line-height: 15px; font-weight: 400; transform: none; }
      @media (max-width: 520px) { .cs-plot { padding-left: 50px; } .cs-y-axis { width: 43px; font-size: var(--cs-chart-label-size, 9px); } .cs-axis { margin-left: 50px; } }

      /* 解释性信息改为悬浮/聚焦即显示：位置由 JS 按视口夹取，fixed 定位不被卡片裁切。 */
      .cs-data-panels { display: flex; flex-direction: column; gap: 16px; }
      .cs-period-notice { padding: 8px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cs-info { position: relative; display: inline-flex; align-items: center; flex: none; }
      .cs-info button { appearance: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; background: transparent; border-radius: 6px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
      .cs-info button:hover, .cs-info:hover button, .cs-info:focus-within button, .cs-info button:focus-visible { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
      /* 说明与报告操作按钮：图标在悬停时轻抬并侧倾，提示这一下可以点。 */
      .cs-info button > svg { transition: transform 240ms cubic-bezier(.34, 1.56, .64, 1); }
      .cs-info button:hover > svg, .cs-info button:focus-visible > svg { transform: translateY(-1px) rotate(-5deg) scale(1.08); }
      .cs-info button:active > svg { transform: scale(.94); transition-duration: 80ms; }
      .cs-info button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-info-tip { visibility: hidden; opacity: 0; transform: translateY(-2px); pointer-events: none; position: fixed; z-index: 90; width: max-content; max-width: min(280px, 68vw); padding: 9px 11px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 30px #0003; font-size: 13px; font-weight: 400; line-height: 1.65; white-space: normal; transition: opacity 120ms var(--cs-ease), transform 120ms var(--cs-ease), visibility 0s 120ms; }
      .cs-info:hover .cs-info-tip,
      .cs-info:focus-within .cs-info-tip { visibility: visible; opacity: 1; transform: translateY(0); transition-delay: 0s; }
      .cs-info.is-escaped .cs-info-tip { visibility: hidden; opacity: 0; transform: translateY(-2px); transition-delay: 0s, 0s, 120ms; }
      .cs-info-tip.cs-info-tip-lines { max-width: min(320px, 74vw); padding: 10px 12px; }
      .cs-info-lines { display: flex; flex-direction: column; gap: 6px; }
      .cs-info-line { position: relative; display: block; padding-left: 11px; }
      .cs-info-line::before { content: ""; position: absolute; left: 1px; top: .68em; width: 3px; height: 3px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
      /* 热力图说明只展示低→高六档色带，颜色直接取自当前主题变量；入口在标题左侧图标。
         带汇总时浮层纵排：第一行色带，第二行覆盖度与读数。 */
      .cs-heat-legend { display: inline-flex; flex-direction: column; gap: 8px; white-space: nowrap; }
      .cs-heat-legend-row { display: inline-flex; align-items: center; gap: 7px; }
      .cs-heat-legend-label { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-heat-legend-scale { display: inline-flex; align-items: center; gap: 2px; }
      .cs-heat-legend-swatch {
        display: block; width: 15px; height: 10px; border-radius: 2.5px;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cs-ink) 8%, transparent);
      }
      .cs-card { transition: border-color 160ms ease, box-shadow 160ms ease; }
      .cs-card:hover { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, var(--dsw-alias-border-l1)); }
      .cs-ranking-row { border-radius: 6px; transition: background-color 160ms ease; }
      .cs-composition-row { cursor: pointer; border-radius: 6px; transition: background-color 160ms ease, opacity 160ms ease; }
      .cs-ranking-row:hover, .cs-composition-row:hover, .cs-composition-row.is-hot { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent); }
      .cs-composition.has-hot .cs-composition-row:not(.is-hot) { opacity: .45; }

      /* 柱图：每个时段一条透明命中区，悬浮或键盘聚焦时两根柱整体放大。 */
      .cs-bar-group { cursor: pointer; outline: none; }
      .cs-bar-group .cs-bar-pair { transform-box: fill-box; transform-origin: center bottom; transition: transform 160ms ease, filter 160ms ease; }
      .cs-bar-group.is-hot .cs-bar-pair { transform: scale(1.18, 1.04); filter: brightness(1.12); }
      .cs-bar-group:focus-visible .cs-bar-pair { filter: brightness(1.18); }
      .cs-bar-hit { fill: transparent; pointer-events: all; }
      .cs-bar-group:focus-visible .cs-bar-hit { fill: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent); }

      /* 圆环：扇区与右侧列表共享同一高亮状态。 */
      .cs-donut-seg { cursor: pointer; outline: none; transition: stroke-width 160ms ease, opacity 160ms ease, filter 160ms ease, stroke-dasharray 420ms var(--cs-ease); }
      .cs-donut-seg.is-hot, .cs-donut-seg:focus-visible { stroke-width: 15; filter: brightness(1.1); }
      /* 极浅分段只加粗，避免悬浮或聚焦时增亮至纯白而融入卡片背景。 */
      .cs-page.cs-palette-blue:not(.cs-appearance-dark) .cs-donut-seg:is(.is-hot, :focus-visible) { filter: none; }
      .cs-donut.has-hot .cs-donut-seg:not(.is-hot) { opacity: .38; }

      /* 统一悬停浮层：固定定位后由 JS 按视口夹取，后续热力图可直接复用。 */
      .cs-hover-tip {
        position: fixed; left: 0; top: 0; z-index: 90;
        min-width: 132px; max-width: 264px; padding: 8px 10px; border-radius: 8px;
        background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-1);
        box-shadow: 0 12px 30px rgba(0, 0, 0, .24); pointer-events: none;
        font-size: 11px; line-height: 1.7; font-variant-numeric: tabular-nums;
        animation: cs-tip-in 160ms ease both;
      }
      .cs-hover-tip-title { display: block; margin-bottom: 2px; font-size: 11px; font-weight: 650; }
      .cs-hover-tip-row { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; white-space: nowrap; }
      .cs-hover-tip-label { color: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 72%, transparent); }
      .cs-hover-tip-value { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-weight: 600; }
      @keyframes cs-tip-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      @media (prefers-reduced-motion: reduce) {
        .cs-hover-tip { animation: none; transition: none; }
        .cs-bar-group .cs-bar-pair, .cs-donut-seg, .cs-composition-row { transition: none; }
      }
      .cs-foot { font-size: 12px; line-height: 1.6; }

      /* 数据管理：导出与清空。按钮沿用卡片体系，危险操作单独着色。 */
      .cs-data-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: auto; padding-top: 12px; }
      .cs-btn-file { position: relative; display: inline-flex; align-items: center; cursor: pointer; }
      .cs-settings-swatches { display: flex; gap: 8px; flex-wrap: wrap; }
      .cs-swatch-preview { appearance: none; display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 5px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
      .cs-swatch-preview.is-on { border-color: var(--cs-signal); box-shadow: 0 0 0 1px var(--cs-signal); }
      .cs-swatch-preview:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: 2px; }
      .cs-swatch-dot { width: 10px; height: 10px; border-radius: 50%; }
      .cs-swatch-blue .cs-swatch-dot { background: #1F4E94; }
      .cs-swatch-stone .cs-swatch-dot { background: #6B7280; }
      .cs-swatch-cyan .cs-swatch-dot { background: #0E7490; }
      .cs-file-input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
      .cs-import-preview { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); font-size: 12px; }
      .cs-import-preview strong { font-size: 13px; }
      .cs-import-preview .cs-settings-switch { align-self: flex-start; }
      .cs-text-link { appearance: none; align-self: flex-start; margin-top: 10px; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-brand-primary); font: inherit; font-size: 12px; cursor: pointer; }
      .cs-text-link:hover { text-decoration: underline; }
      .cs-text-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      /* 数据管理底部的说明恢复区：与危险操作、导入区隔开，点击后有明确的结果反馈。 */
      .cs-approx-reveal { display: flex; flex-direction: column; gap: 2px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .cs-approx-reveal .cs-text-link { margin-top: 2px; }
      .cs-approx-reveal .cs-data-status { margin-top: 4px; }
      .cs-data-spacer { flex: 1 1 auto; min-width: 8px; }
      .cs-btn {
        appearance: none; font: inherit; font-size: 12px; line-height: 18px;
        min-height: 30px; padding: 5px 12px; border-radius: 8px; cursor: pointer;
        color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1);
      }
      .cs-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1)); }
      .cs-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-btn:disabled { opacity: .55; cursor: default; }
      /* 带图标的按钮：图标与文字同色，垂直居中，间距按 6px 收。 */
      .cs-btn.is-icon { display: inline-flex; align-items: center; gap: 6px; }
      .cs-reset-icon { flex: none; display: block; }
      .cs-btn.is-danger { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1)); }
      .cs-btn.is-solid { color: #fff; background: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
      .cs-clear-confirm {
        margin-top: 10px; padding: 12px 14px; border-radius: 9px; font-size: 12px; line-height: 1.6;
        border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1));
        background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, var(--dsw-alias-bg-layer-1));
      }
      .cs-clear-confirm strong { display: block; margin-bottom: 4px; font-size: 13px; }
      .cs-clear-confirm p { margin: 0 0 10px; color: var(--dsw-alias-label-secondary); }
      .cs-clear-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
      .cs-data-status { margin-top: 8px; font-size: 12px; color: var(--dsw-alias-state-success-primary); }
      .cs-data-status.is-error { color: var(--dsw-alias-state-error-primary); }

      /* 票 04：明细右侧留白、相对时间固定槽位，以及 390px 下的行内信息分层。 */
      .cs-table-card { padding-right: 24px; }
      .cs-table-head { padding-right: 24px; }
      .cs-summary { padding-right: 18px; }
      .cs-last { text-align: right; padding-right: 10px; }
      .cs-sessions { padding-right: 24px; }
      .cs-name-text { display: block; min-width: 0; max-width: 100%; }
      .cs-session-title { flex: 0 1 auto; min-width: 0; max-width: min(100%, 340px); }
      .cs-session-stat { display: inline-flex; align-items: center; gap: 4px; }
      @media (max-width: 600px) {
        .cs-table-card { padding: 12px; }
        .cs-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 12px 10px; }
        .cs-name { flex: 1 1 calc(100% - 46px); order: 0; min-width: 0; }
        .cs-toggle { order: 1; width: 32px; height: 32px; margin: -4px -4px -4px 0; }
        .cs-active { order: 2; }
        .cs-task { order: 3; }
        .cs-share { order: 4; flex: 1 1 96px; flex-direction: row; align-items: center; gap: 8px; }
        .cs-last { order: 5; margin-left: auto; padding-right: 2px; text-align: right; }
        .cs-summary .cs-active, .cs-summary .cs-task {
          display: inline-flex; align-items: baseline; gap: 3px;
          padding: 1px 6px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2);
        }
        .cs-summary .cs-active::before, .cs-summary .cs-task::before {
          display: inline; content: attr(data-label) ' '; margin-right: 2px;
          color: var(--dsw-alias-label-secondary); font-family: inherit; font-size: 11px; font-weight: 400;
        }
        .cs-summary .cs-share::before, .cs-summary .cs-last::before { display: none; }
        .cs-sessions { padding: 8px 16px; }
        .cs-session { gap: 6px 10px; padding: 10px 2px; }
        .cs-session.is-highlighted::before { inset: 1px 0; }
        .cs-session-title { flex: 1 1 100%; max-width: 100%; }
        .cs-session-stat {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 1px 6px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2);
        }
        .cs-session-last { margin-left: auto; padding-right: 2px; }
      }

      /* 次级导航与五视图骨架。 */
      .cs-tabs {
        position: relative; display: flex; align-items: center; gap: 2px;
        min-height: 40px; border-bottom: 1px solid var(--dsw-alias-border-l1);
        overflow-x: auto; scrollbar-width: none;
      }
      .cs-tab-thumb {
        position: absolute; left: 0; bottom: -1px; height: 2px; border-radius: 2px;
        background: var(--dsw-alias-brand-primary);
        transition: transform var(--cs-dur-view) cubic-bezier(.2, .8, .2, 1), width var(--cs-dur-view) cubic-bezier(.2, .8, .2, 1);
        will-change: transform, width;
      }
      .cs-tab {
        appearance: none; border: 0; background: transparent; font: inherit;
        font-size: 12px; line-height: 18px; padding: 10px 14px; cursor: pointer;
        color: var(--dsw-alias-label-secondary); white-space: nowrap;
        transition: color var(--cs-dur-tap) ease;
      }
      .cs-tab:hover { color: var(--dsw-alias-label-primary); }
      .cs-tab:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; border-radius: 6px; }
      .cs-tab.is-active { color: var(--dsw-alias-label-primary); font-weight: 650; }
      /* 五个同级视图紧随品牌标题，状态与外观控制保持靠右；窄窗导航独立换行。 */
      .cs-topbar > .cs-brand { flex: none; width: auto; }
      .cs-topbar > .cs-topbar-divider { height: 24px; }
      .cs-topbar > .cs-tabs { flex: 1 1 240px; min-width: 0; margin: 0; border-bottom: 0; }
      .cs-topbar .cs-tab-thumb { bottom: 0; }
      .cs-topbar > .cs-topbar-right { flex: none; width: auto; margin-left: auto; }
      @container cs-shell (max-width: 620px) {
        .cs-topbar { gap: 6px 12px; }
        .cs-topbar > .cs-topbar-divider { display: none; }
        .cs-topbar > .cs-tabs { order: 3; flex-basis: 100%; }
        .cs-topbar > .cs-topbar-right { justify-content: flex-end; }
      }
      .cs-views { position: relative; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
      .cs-view { display: flex; flex-direction: column; gap: 10px; }
      .cs-curtain {
        position: absolute; inset: 0; z-index: 20; border-radius: 12px;
        background: var(--dsw-alias-bg-base); opacity: 0; pointer-events: none;
        transition: opacity var(--cs-dur-exit) ease;
      }
      .cs-curtain.is-on { opacity: .84; pointer-events: auto; }
      /* 只动 opacity：保留 transform 会让 .cs-view 成为 fixed 浮层的包含块，导致定位错乱。 */

      .cs-recent-list { display: flex; flex-direction: column; }
      .cs-recent-row {
        display: grid; grid-template-columns: minmax(0, 1fr) minmax(48px, max-content) minmax(52px, max-content);
        align-items: center; gap: 8px; padding: 4px 0; border: 0;
        border-top: 1px solid var(--dsw-alias-border-l1);
        background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer;
      }
      .cs-recent-row:not(.is-static):hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); }
      .cs-recent-row.is-static { cursor: default; }
      .cs-recent .cs-card-head { margin-bottom: 6px; }
      .cs-recent .cs-card-heading { width: 100%; align-items: center; justify-content: space-between; }
      .cs-recent .cs-tag { min-width: 24px; padding: 1px 7px; text-align: center; font-variant-numeric: tabular-nums; }
      .cs-recent-name { position: relative; display: grid; min-width: 0; padding-left: 12px; gap: 4px; }
      .cs-recent-status {
        position: absolute; left: 0; top: 6px; width: 6px; height: 6px;
        border-radius: 50%; background: var(--cs-task);
      }
      .cs-recent-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 17px; font-weight: 600; }
      .cs-recent-workspace { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-secondary); }
      .cs-recent-time { max-width: 11ch; text-align: right; overflow-wrap: anywhere; font-family: var(--cs-mono); font-variant-numeric: tabular-nums; font-size: 12px; }
      .cs-recent-last { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; text-align: right; }
      .cs-view[data-view="trend"] .cs-cycle-value { font-size: clamp(24px, 2.2vw, 30px); line-height: 1.2; color: var(--cs-signal); margin-top: 10px; }
      .cs-view[data-view="trend"] .cs-cycle.is-current :is(.cs-cycle-value, .cs-cycle-date) { color: inherit; }
      .cs-trend-layout { display: grid; grid-template-columns: minmax(0, 2.6fr) minmax(260px, 1fr); gap: 14px; align-items: stretch; min-height: 335px; }
      .cs-trend-layout > .cs-trend-card { grid-column: 1; grid-row: 1; }
      .cs-trend-layout > .cs-trend-summary { grid-column: 2; grid-row: 1; }
      .cs-trend-summary { display: flex; flex-direction: column; gap: 10px; align-self: stretch; }
      .cs-trend-summary .cs-stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 14px; align-content: center; padding: 12px 0 18px; }
      .cs-trend-summary .cs-stat-box { padding: 0; border: 0; border-radius: 0; background: transparent; gap: 9px; }
      .cs-trend-summary .cs-stat-box span { font-size: 12px; }
      .cs-trend-summary .cs-stat-box b { font-size: 20px; line-height: 28px; overflow-wrap: anywhere; }
      .cs-trend-summary .cs-stat-box:nth-child(1) b, .cs-trend-summary .cs-stat-box:nth-child(4) b { color: var(--cs-signal); }
      .cs-trend-summary .cs-stat-box:nth-child(2) b { color: var(--cs-task); }
      /* 右栏底部补一条活跃占比可视化，填满原来空旷的下半区。 */
      .cs-trend-summary-foot {
        display: flex; flex-direction: column; gap: 7px;
        margin-top: auto; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1);
      }
      .cs-trend-share-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .cs-trend-share-head b { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; font-size: 22px; line-height: 26px; color: var(--dsw-alias-label-primary); }
      .cs-trend-share-track { height: 6px; border-radius: 999px; overflow: hidden; background: var(--cs-tone-faint); }
      .cs-trend-share-track i { display: block; height: 100%; border-radius: inherit; background: var(--cs-signal); }
      .cs-trend-share-caption { font-size: 10.5px; line-height: 15px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
      .cs-stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; flex: 1 1 auto; height: 100%; min-height: 0; align-content: space-between; }
      .cs-stat-box { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2); min-width: 0; }
      .cs-stat-box span { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-stat-box b { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; font-size: 15px; line-height: 22px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
      /* 概览趋势卡底部的三项统计带：贴着卡片底边，填住图表下方原本的空白。 */
      .cs-trend-foot {
        display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-top: auto; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1);
      }
      .cs-trend-foot-item {
        display: flex; flex-direction: column; gap: 2px; min-width: 0;
        padding: 0 12px; border-left: 1px solid var(--dsw-alias-border-l1);
      }
      .cs-trend-foot-item:first-child { padding-left: 0; border-left: 0; }
      .cs-trend-foot-item:last-child { padding-right: 0; }
      .cs-trend-foot-item span { font-size: 10.5px; line-height: 15px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cs-trend-foot-item b {
        font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-variant-numeric: tabular-nums; font-size: 14px; line-height: 20px; font-weight: 650;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      @media (max-width: 760px) {
        .cs-trend-foot { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px 0; }
      }
      /* 均衡趋势页：时段色阶与事实洞察并排，所有桶遵守实际聚合粒度。 */
      .cs-trend-bottom { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: stretch; }
      .cs-trend-breakdown, .cs-trend-insights { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
      .cs-distribution-grain { display: inline-flex; align-items: center; gap: 5px; color: var(--cs-ink-2); font-size: 11px; }
      .cs-distribution { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
      .cs-distribution-strip { display: flex; gap: 4px; min-height: 42px; }
      .cs-distribution-cell {
        --cs-distribution-color: var(--cs-tone-faint);
        position: relative; flex: 1 1 0; min-width: 0; border-radius: 4px; cursor: pointer;
        transition: transform var(--cs-dur-tap) var(--cs-ease);
      }
      .cs-distribution-fill { position: absolute; inset: 0; border-radius: inherit; background: var(--cs-distribution-color); }
      .cs-distribution-cell.is-level-1 { --cs-distribution-color: var(--cs-heat-1); }
      .cs-distribution-cell.is-level-2 { --cs-distribution-color: var(--cs-heat-2); }
      .cs-distribution-cell.is-level-3 { --cs-distribution-color: var(--cs-heat-3); }
      .cs-distribution-cell.is-level-4 { --cs-distribution-color: var(--cs-heat-4); }
      .cs-distribution-cell.is-level-5 { --cs-distribution-color: var(--cs-heat-5); }
      .cs-distribution-cell.is-future { --cs-distribution-color: transparent; }
      .cs-distribution-cell.is-future .cs-distribution-fill { border: 1px dashed var(--cs-line); }
      .cs-distribution-cell:is(:hover, :focus-visible) { z-index: 1; transform: translateY(-2px) scale(1.12, 1.08); }
      .cs-distribution-cell:focus-visible { outline: 2px solid var(--cs-focus); outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) {
        .cs-distribution-cell:is(:hover, :focus-visible) { transform: none; }
      }
      .cs-distribution-axis, .cs-distribution-summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--cs-ink-2); font-size: 11px; }
      .cs-distribution-summary { border-top: 1px solid var(--cs-line); padding-top: 14px; margin-top: auto; }
      .cs-distribution-summary b { color: var(--cs-ink); font-weight: 500; font-variant-numeric: tabular-nums; }
      .cs-distribution-future { margin-top: -10px; font-size: 11px; color: var(--cs-ink-2); }
      .cs-trend-insight-list { display: flex; flex-direction: column; gap: 16px; }
      .cs-trend-insight-row { display: flex; align-items: center; gap: 10px; }
      .cs-insight-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 7px; background: var(--cs-tone-faint); color: var(--cs-signal); flex: none; }
      .cs-trend-insight-row > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .cs-trend-insight-row span { font-size: 12px; }
      .cs-trend-insight-row b { font-size: 12px; line-height: 18px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--cs-ink-2); }
      .cs-trend-insight-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; border-top: 1px solid var(--cs-line); padding-top: 14px; margin-top: auto; color: var(--cs-ink-2); font-size: 11px; }
      .cs-text-link { display: inline-flex; align-items: center; gap: 6px; border: 0; padding: 3px 0; color: var(--cs-signal); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }
      .cs-text-link:hover { text-decoration: underline; }
      .cs-text-link:focus-visible { outline: 2px solid var(--cs-focus); outline-offset: 3px; border-radius: 2px; }
      @media (max-width: 900px) { .cs-trend-bottom { grid-template-columns: 1fr; } }
      .cs-details-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .cs-details-range { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; }
      .cs-details-range .cs-select-btn {
        min-width: 100px; min-height: 30px; padding: 4px 9px;
        font-size: 11.5px; line-height: 17px; border-radius: 7px;
      }
      .cs-details-range .cs-select-menu { min-width: 116px; padding: 3px; }
      .cs-details-range .cs-opt { padding: 5px 9px; font-size: 11.5px; line-height: 17px; }
      .cs-search-wrap {
        position: relative; display: flex; align-items: center;
        flex: 1 1 260px; min-width: 180px;
      }
      .cs-search-icon {
        position: absolute; left: 11px; width: 14px; height: 14px;
        color: var(--dsw-alias-label-secondary); pointer-events: none;
      }
      .cs-search {
        flex: 1 1 auto; width: 100%; min-width: 0; appearance: none; font: inherit; font-size: 12px;
        padding: 7px 12px 7px 31px; border-radius: 9px; color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
      }
      .cs-search:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .cs-details-stats {
        display: grid; grid-template-columns: minmax(0, .8fr) repeat(2, minmax(0, 1.2fr)) minmax(0, .8fr);
        gap: 0; padding: 14px 18px; border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 12px; background: var(--dsw-alias-bg-layer-1);
      }
      .cs-detail-stat {
        display: flex; flex-direction: column; justify-content: flex-start; gap: 5px; min-width: 0;
        padding: 2px 18px; border: 0; border-left: 1px solid var(--dsw-alias-border-l1);
        border-radius: 0; background: transparent;
      }
      .cs-detail-stat:first-child { border-left: 0; padding-left: 0; }
      .cs-detail-stat-label { display: flex; align-items: center; justify-content: flex-start; gap: 6px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
      .cs-detail-stat-label .cs-detail-glyph { flex: 0 0 14px; width: 14px; height: 14px; }
      .cs-detail-stat-value {
        font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-variant-numeric: tabular-nums; font-size: clamp(20px, 2vw, 26px); line-height: 1.25; font-weight: 600;
        letter-spacing: -0.02em; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere;
      }
      .cs-detail-stat-hint { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-settings-board { display: flex; flex-direction: column; gap: 14px; }
      .cs-settings-hero { display: flex; flex-direction: column; gap: 2px; }
      .cs-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
      .cs-settings-card { min-width: 0; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); align-self: stretch; display: flex; flex-direction: column; }
      .cs-settings-card > h3 { margin: 0 0 4px; font-size: 13px; line-height: 20px; font-weight: 650; }
      /* 卡片内容与高度一起铺开：外观卡片的两行均分多余留白。 */
      .cs-settings-card > .cs-settings-row { flex: 1 1 auto; }
      .cs-settings-wide { grid-column: 1 / -1; }
      .cs-settings-recheck { margin-top: auto; justify-content: flex-start; }
      .cs-btn.is-primary { color: var(--cs-on-accent, #fff); background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
      .cs-btn.is-primary:hover:not(:disabled) { filter: brightness(1.05); }
      @media (max-width: 860px) {
        .cs-trend-layout, .cs-settings-grid { grid-template-columns: 1fr; }
        .cs-trend-layout > .cs-trend-card, .cs-trend-layout > .cs-trend-summary { grid-column: 1; grid-row: auto; }
      }
      /* 首屏放大：右上角纯图标按钮；放大态重新排版为整页统计，而不是把卡片简单拉大。 */
      .cs-hero { position: relative; display: flex; flex-direction: column; gap: 8px; }
      .cs-hero .cs-card-head { padding-right: 30px; }
      .cs-hero-num {
        font-family: var(--cs-mono);
        font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1;
        font-size: clamp(34px, 4.8vw, 54px); line-height: 1.06; font-weight: 650;
        letter-spacing: -0.04em; color: var(--cs-ink);
      }
      .cs-hero-meta {
        display: flex; flex-wrap: wrap; align-items: center; gap: 7px 18px;
        font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary);
        font-variant-numeric: tabular-nums;
      }
      /* 大数字下方的只读信息：图标、标签与数值分成三档，数值按在线/活跃/任务口径着色。 */
      .cs-hero-meta-item { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
      .cs-hero-meta-item .cs-detail-glyph { flex: none; color: var(--cs-metric-color, var(--cs-signal)); }
      .cs-hero-meta-item.is-online { --cs-metric-color: var(--cs-signal-deep); }
      .cs-hero-meta-item.is-active { --cs-metric-color: var(--cs-chart-active); }
      .cs-hero-meta-item.is-task { --cs-metric-color: var(--cs-task); }
      .cs-hero-meta-item.is-count { --cs-metric-color: var(--cs-ink-2); }
      .cs-hero-meta-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .cs-hero-meta-value {
        font-family: var(--cs-mono); font-size: 13.5px; line-height: 18px; font-weight: 650;
        color: var(--cs-metric-color);
      }
      .cs-hero-meta-item.is-count .cs-hero-meta-value { color: var(--cs-ink); }
      .cs-zoom-btn {
        position: absolute; top: 8px; right: 8px; z-index: 2;
        display: grid; place-items: center; width: 24px; height: 24px; padding: 0;
        border: 0; border-radius: 50%; background: transparent; color: var(--cs-ink-2);
        cursor: pointer; opacity: .55;
        transition: opacity var(--cs-dur-tap) var(--cs-ease), color var(--cs-dur-tap) var(--cs-ease);
      }
      .cs-zoom-btn::before {
        content: ""; position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
        background: color-mix(in srgb, var(--cs-ink-2) 10%, transparent);
        opacity: 0; transform: scale(.55);
        transition: opacity 150ms ease, transform 240ms cubic-bezier(.34, 1.56, .64, 1);
      }
      .cs-zoom-btn:hover { opacity: 1; color: var(--cs-signal); }
      .cs-zoom-btn:hover::before, .cs-zoom-btn:focus-visible::before { opacity: 1; transform: scale(1); }
      .cs-zoom-btn:focus-visible { opacity: 1; outline: 2px solid var(--cs-signal); outline-offset: 2px; }
      .cs-zoom-btn svg {
        position: relative; width: 15px; height: 15px; stroke: currentColor; fill: none;
        stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;
        transform-origin: 50% 50%; transition: stroke 160ms ease;
      }
      /* 悬停时四只角括号向外弹开，像把卡片撑到首屏。 */
      .cs-zoom-btn:hover svg, .cs-zoom-btn:focus-visible svg { animation: cs-zoom-open 360ms cubic-bezier(.3, .8, .3, 1) both; }
      @keyframes cs-zoom-open {
        0% { transform: scale(.82); }
        55% { transform: scale(1.26); }
        100% { transform: scale(1.16); }
      }
      .cs-overview-metrics {
        --cs-indicator-color: var(--cs-chart-active); --cs-indicator-radius: 9px;
        display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(0, 1.1fr) repeat(2, minmax(0, 1fr));
        align-items: stretch; min-height: 142px; padding: 12px 14px; gap: 4px;
      }
      .cs-overview-today { position: relative; min-width: 0; }
      .cs-overview-metrics[data-selection="day"] { --cs-indicator-color: transparent; }
      .cs-overview-metrics[data-selection-ready] > .cs-cycle.is-current { background: transparent; }
      .cs-cycles { --cs-indicator-color: var(--cs-chart-active); --cs-indicator-radius: 12px; }
      .cs-cycles[data-selection-ready] > .cs-cycle { background: transparent; }
      .cs-cycles[data-selection-ready] > .cs-cycle.is-current { border-color: transparent; }
      .cs-overview-today .cs-cycle { height: 100%; }
      .cs-overview-today .cs-zoom-btn { top: 2px; right: 5px; }
      .cs-overview-metric-pair {
        display: grid; align-content: center; padding: 7px 14px; min-width: 0;
      }
      .cs-overview-metric {
        display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2px 6px;
        padding-block: 6px; min-width: 0;
        color: var(--dsw-alias-label-secondary); font-size: 12px;
      }
      .cs-overview-metric + .cs-overview-metric { border-top: 1px solid var(--cs-line); }
      .cs-overview-metric > span { display: inline-flex; align-items: center; gap: 5px; }
      .cs-overview-metric.is-online { --cs-metric-color: var(--cs-signal-deep); }
      .cs-overview-metric.is-active { --cs-metric-color: var(--cs-chart-active); }
      .cs-overview-metric.is-task { --cs-metric-color: var(--cs-task); }
      .cs-overview-metric .cs-detail-glyph { flex: none; color: var(--cs-metric-color, var(--cs-signal)); }
      .cs-overview-metric strong { color: var(--cs-metric-color, var(--cs-ink)); font-family: var(--cs-mono); font-size: 16px; overflow-wrap: anywhere; transition: color 160ms var(--cs-ease); }
      .cs-overview-metric strong .cs-duration-number { color: inherit; }
      .cs-overview-metrics .cs-cycle {
        color: var(--cs-ink); background: transparent; border: 0; border-radius: 9px;
        min-height: 0; padding: 8px 14px; gap: 4px; justify-content: center;
      }
      .cs-overview-metrics > .cs-cycle:not(.is-current):hover {
        background: color-mix(in srgb, var(--cs-signal) 6%, transparent);
      }
      .cs-overview-metrics .cs-cycle-today:hover { background: transparent; }
      .cs-overview-metrics > .cs-cycle.is-current {
        color: var(--cs-on-selection); background: var(--cs-selection);
      }
      .cs-overview-metrics .cs-cycle:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: -2px; }
      .cs-appearance-light .cs-overview-metrics > .cs-cycle.is-current:focus-visible { outline-color: var(--cs-on-selection); }
      .cs-overview-metrics .cs-cycle-title {
        padding: 2px 6px; border-radius: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary);
        background: var(--dsw-alias-bg-layer-2);
      }
      .cs-overview-metrics > .cs-cycle.is-current .cs-cycle-title {
        color: inherit; background: transparent;
      }
      .cs-overview-metrics > .cs-cycle .cs-cycle-head { flex-wrap: wrap; row-gap: 3px; }
      /* 小号粗体日期与周期名称同排，保留淡水印质感，不增加顶部留白或挤压主数字。 */
      .cs-cycle.has-date-watermark .cs-cycle-head { column-gap: 4px; }
      .cs-cycle.has-date-watermark .cs-cycle-date {
        margin-left: auto;
        font-family: var(--cs-mono); font-size: clamp(11px, 1.15cqw, 13px); line-height: 1;
        font-weight: 800; letter-spacing: -.045em; white-space: nowrap;
        color: color-mix(in srgb, var(--cs-signal-deep) 56%, transparent); pointer-events: none;
      }
      .cs-cycle.has-date-watermark.is-current .cs-cycle-date {
        color: color-mix(in srgb, currentColor 60%, transparent);
      }
      .cs-appearance-light .cs-cycle.has-date-watermark.is-current .cs-cycle-date {
        color: color-mix(in srgb, currentColor 90%, transparent);
      }
      .cs-overview-metrics .cs-cycle-value { font-size: clamp(18px, 2.5cqw, 26px); color: var(--cs-signal-deep); overflow-wrap: anywhere; }
      .cs-overview-metrics > .cs-cycle:not(.cs-cycle-today):not(.is-current) .cs-cycle-value { color: var(--cs-chart-active); }
      .cs-overview-metrics .cs-cycle-tail { padding-top: 2px; margin-top: 0; gap: 3px; }
      .cs-overview-metrics .cs-cycle .cs-cycle-share {
        margin-left: 0; text-align: right; color: var(--dsw-alias-label-secondary); white-space: normal;
      }
      .cs-overview-metrics .cs-cycle-today { padding-right: 30px; }
      .cs-cycle-today .cs-cycle-head { flex-wrap: wrap; gap: 4px 6px; }
      .cs-cycle-today .cs-cycle-period { color: var(--cs-ink-2); font-size: 11px; }
      .cs-cycle-today.is-metric-online { --cs-metric-color: var(--cs-signal-deep); }
      .cs-cycle-today.is-metric-active { --cs-metric-color: var(--cs-chart-active); }
      .cs-cycle-today.is-metric-task { --cs-metric-color: var(--cs-task); }
      .cs-cycle-today .cs-hero-num { position: relative; color: var(--cs-metric-color); font-size: clamp(32px, 5.4cqw, 50px); overflow-wrap: anywhere; transition: color 160ms var(--cs-ease); }
      .cs-cycle-today .cs-hero-num .cs-duration-number { color: inherit; }
      .cs-cycle-today .cs-card-icon { color: var(--cs-metric-color); }
      .cs-cycle-today time { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; font-weight: 500; }
      .cs-overview-metrics > .cs-cycle.is-current :is(.cs-cycle-share, .cs-cycle-value) { color: inherit; }
      .cs-cycle-today.is-current .cs-cycle-title { color: var(--cs-signal-deep); background: transparent; padding-inline: 0; }
      .cs-overview-metrics .cs-cycle-today.is-current .cs-cycle-share { color: var(--dsw-alias-label-secondary); }
      .cs-cycle-today.is-current .cs-cycle-track { background: var(--cs-tone-faint); }
      .cs-cycle-today.is-current .cs-cycle-track i { background: var(--cs-chart-active); }
      .cs-cycle-today .cs-cycle-track.is-task i { background: var(--cs-task); }
      @container cs-overview (max-width: 680px) {
        .cs-overview-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 8px; }
      }
      @container cs-overview (max-width: 330px) {
        .cs-overview-metrics { padding-inline: 6px; }
        .cs-overview-metrics .cs-cycle, .cs-overview-metric-pair { padding-inline: 8px; }
        .cs-overview-metrics .cs-cycle-today { padding-right: 27px; }
      }
      /* 放大页填满宿主内容区扣除顶栏、提示与页脚后的空间，矮窗仍由整页滚动。 */
      .cs-page.is-overview-focused { display: flex; flex-direction: column; }
      .is-overview-focused > .cs-shell,
      .is-overview-focused .cs-views,
      .is-overview-focused #cs-view-overview,
      #cs-view-overview > :is(.cs-hero-focus, .cs-trend-focus, .cs-heatmap-focus-page) { flex: 1 0 auto; }
      .cs-hero-focus {
        --cs-hero-ring-size: clamp(145px, min(30cqw, 36svh), 362px);
        padding: clamp(14px, 3svh, 28px) clamp(16px, 3cqw, 32px);
        gap: 18px;
        display: flex; flex-direction: column;
        background:
          radial-gradient(110% 90% at 4% 0%, color-mix(in srgb, var(--cs-signal-soft) 12%, transparent), transparent 58%),
          var(--dsw-alias-bg-layer-1);
        animation: cs-focus-in var(--cs-focus-ms, 240ms) var(--cs-ease) both;
      }
      .cs-hero-focus .cs-hero-num.is-metric-online { --cs-metric-color: var(--cs-signal-deep); }
      .cs-hero-focus .cs-hero-num.is-metric-active { --cs-metric-color: var(--cs-chart-active); }
      .cs-hero-focus .cs-hero-num.is-metric-task { --cs-metric-color: var(--cs-task); }
      .cs-hero-focus .cs-hero-num {
        font-size: clamp(44px, min(15cqw, 22svh), 220px); line-height: .96; margin-top: 0;
        letter-spacing: -0.065em; font-weight: 640; color: var(--cs-metric-color);
        white-space: nowrap; overflow-wrap: normal;
        /* 颜色与读数同一节奏：时长来自 DurationTween，五次缓动近似慢—快—慢，切换口径时随数字一起变色。 */
        transition: color var(--cs-hero-color-ms, 900ms) cubic-bezier(.86, 0, .07, 1);
      }
      .cs-hero-focus .cs-hero-num .cs-duration-number { color: inherit; }
      /* 读数变长时按字符数收一档字号，保证始终单行横排而不压到圆环。 */
      .cs-hero-focus .cs-hero-num.is-long {
        font-size: clamp(40px, min(13cqw, 22svh), 220px);
      }
      .cs-hero-focus .cs-hero-num.is-extra-long {
        font-size: clamp(38px, min(11.5cqw, 22svh), 220px);
      }
      .cs-hero-focus .cs-tag { font-size: 10.5px; padding: 1px 8px; }
      .cs-hero-focus-body {
        display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, .75fr);
        gap: clamp(14px, 3.2cqw, 36px); flex: 1 0 auto; align-items: center;
      }
      .cs-hero-focus-primary {
        display: flex; flex-direction: column; justify-content: center;
        gap: 18px; min-width: 0; min-height: 0;
      }
      .cs-hero-focus .cs-hero-meta {
        flex-direction: row; flex-wrap: wrap; gap: 4px 16px;
        font-size: 12.5px; line-height: 18px;
      }
      .cs-hero-focus .cs-hero-meta span { white-space: nowrap; }
      .cs-hero-focus-aside {
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
        min-width: 0; min-height: 0; padding-left: 28px;
        border-left: 1px solid color-mix(in srgb, var(--cs-line) 75%, transparent);
      }
      /* 圆环替代柱状图：中心读占比，外圈颜色只表示活跃在在线时长中的份额。 */
      .cs-hero-ring {
        position: relative; width: min(100%, var(--cs-hero-ring-size)); aspect-ratio: 1;
        display: grid; place-items: center; flex: 0 1 auto;
      }
      .cs-hero-ring svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      .cs-hero-ring-track { stroke: var(--cs-ring-track); }
      .cs-hero-ring-value {
        stroke: var(--cs-chart-active);
        transition: stroke-dasharray 420ms var(--cs-ease), stroke 180ms var(--cs-ease);
      }
      /* 任务占比只换数据语义色：弧线与图例色块用任务紫，中心文字保持正文色。 */
      .cs-hero-ring.is-task .cs-hero-ring-value { stroke: var(--cs-task); }
      .cs-hero-ring-center {
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px;
        text-align: center;
      }
      .cs-hero-ring-center b {
        font-family: var(--cs-mono); font-variant-numeric: tabular-nums;
        font-size: clamp(30px, min(6cqw, 8svh), 76px); line-height: .95; font-weight: 660;
        letter-spacing: -.06em; color: var(--cs-ink);
      }
      .cs-hero-ring-center > span { font-size: 12px; line-height: 16px; color: var(--cs-ink-3); }
      .cs-hero-ring-legend {
        width: min(100%, var(--cs-hero-ring-size)); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px; padding-top: 13px; border-top: 1px solid var(--cs-line);
      }
      .cs-hero-ring-legend-item { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .cs-hero-ring-legend-item span {
        display: flex; align-items: center; gap: 6px;
        font-size: 11px; line-height: 16px; color: var(--cs-ink-3);
      }
      .cs-hero-ring-legend-item i {
        width: 8px; height: 8px; border-radius: 2px; flex: 0 0 8px; background: var(--cs-chart-active);
        transition: background-color 180ms var(--cs-ease);
      }
      .cs-hero-ring-legend-item.is-task i { background: var(--cs-task); }
      .cs-hero-ring-legend-item.is-online i { background: var(--cs-ring-track); }
      .cs-hero-ring-legend-item b {
        font-family: var(--cs-mono); font-variant-numeric: tabular-nums;
        font-size: 15px; line-height: 21px; font-weight: 600; color: var(--cs-ink);
        overflow-wrap: anywhere;
      }
      /* 首屏五项主指标始终排成一行；本月数值最长，也不能把其余项挤成竖排。 */
      .cs-hero-focus .cs-focus-panel {
        margin-top: 0; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); grid-template-columns: none;
      }
      .cs-hero-focus .cs-fs-item { padding-inline: clamp(6px, 1.1cqw, 18px); }
      .cs-hero-focus .cs-fs-item b { font-size: 17px; line-height: 23px; white-space: nowrap; }
      @container cs-overview (max-width: 600px) {
        .cs-hero-focus .cs-focus-panel .cs-fs-item { padding: 6px 7px; }
        .cs-hero-focus .cs-focus-panel .cs-fs-item b { font-size: 16px; line-height: 21px; }
        .cs-hero-focus .cs-focus-panel .cs-fs-item:nth-child(2n + 1) {
          border-left: 1px solid color-mix(in srgb, var(--cs-line) 80%, transparent); padding-left: 7px;
        }
        .cs-hero-focus .cs-focus-panel .cs-fs-item:first-child { border-left: 0; padding-left: 0; }
        .cs-hero-focus .cs-focus-panel .cs-fs-item:last-child:nth-child(odd) {
          grid-column: auto; margin-top: 0; padding-top: 6px; border-top: 0;
        }
        .cs-hero-focus .cs-focus-panel .cs-fs-item.is-current + .cs-fs-item { border-left-color: transparent; }
      }
      .cs-fs-button {
        cursor: pointer; text-align: left; font: inherit; color: inherit;
        transition: border-color var(--cs-focus-ms, 240ms) var(--cs-ease),
          background var(--cs-focus-ms, 240ms) var(--cs-ease);
      }
      .cs-fs-button:hover { background: color-mix(in srgb, var(--cs-signal) 5%, transparent); }
      .cs-fs-button:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: -2px; }
      .cs-fs-button.is-current { background: transparent; border-color: transparent; }
      .cs-fs-button.is-metric-online { --cs-metric-color: var(--cs-signal-deep); }
      .cs-fs-button.is-metric-active { --cs-metric-color: var(--cs-chart-active); }
      .cs-fs-button.is-metric-task { --cs-metric-color: var(--cs-task); }
      .cs-fs-button > span { display: inline-flex; align-items: center; gap: 5px; }
      .cs-fs-button b { color: var(--cs-metric-color); }
      .cs-fs-button b .cs-duration-number { color: inherit; }
      .cs-fs-button .cs-detail-glyph { color: var(--cs-metric-color); }

      @container cs-overview (max-width: 660px) {
        .cs-hero-focus { --cs-hero-ring-size: clamp(132px, min(35cqw, 24svh), 205px); }
        .cs-hero-focus-body { grid-template-columns: 1fr; gap: 20px; }
        .cs-hero-focus-aside {
          min-height: 0; padding-left: 0; border-left: 0; border-top: 1px solid var(--cs-line);
          padding-top: 16px; flex-direction: row; gap: 28px;
        }
        .cs-hero-ring-legend {
          grid-template-columns: 1fr; gap: 9px;
          padding-top: 0; border-top: 0;
        }
        .cs-hero-focus .cs-hero-num { font-size: clamp(40px, min(15cqw, 18svh), 128px); }
      }
      @container cs-overview (max-width: 430px) {
        .cs-hero-focus { --cs-hero-ring-size: clamp(116px, min(42cqw, 23svh), 168px); }
        .cs-hero-focus-aside { flex-direction: column; gap: 14px; }
        .cs-hero-ring-legend {
          width: min(100%, 248px); grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px; padding-top: 11px; border-top: 1px solid var(--cs-line);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-fs-button { transition: none !important; }
        .cs-hero-focus .cs-hero-num { transition: none !important; }
      }
      /* 条状图首屏：整页重排为按可用高度铺开的图表，再点右上角缩回。 */
      .cs-trend-card.has-zoom { position: relative; }
      .cs-trend-card.has-zoom .cs-card-head { padding-right: 30px; }
      .cs-trend-focus {
        position: relative; display: flex; flex-direction: column; gap: 16px;
        padding: clamp(14px, 3svh, 26px) clamp(16px, 3cqw, 30px);
        animation: cs-focus-in var(--cs-focus-ms, 240ms) var(--cs-ease) both;
      }
      .cs-trend-focus .cs-card-head { padding-right: 30px; }
      .cs-trend-focus .cs-chart {
        display: flex; flex-direction: column; flex: 1 0 auto;
      }
      .cs-trend-focus .cs-plot { display: flex; flex-direction: column; flex: 1 0 auto; }
      .cs-trend-focus .cs-chart svg { flex: 1 0 auto; height: clamp(144px, 26svh, 220px); }
      .cs-trend-focus > .cs-empty { flex: 1 0 auto; display: grid; place-items: center; }
      .cs-trend-focus .cs-focus-panel { margin-top: auto; }
      .cs-trend-focus .cs-bar-group .cs-bar-pair { transition: transform 160ms ease, filter 160ms ease; }
      .cs-trend-focus .cs-bar-group:hover .cs-bar-pair {
        transform: scale(1.3, 1.06); filter: brightness(1.12);
      }
      .cs-trend-focus .cs-bar-group:focus-visible .cs-bar-pair {
        transform: scale(1.3, 1.06); filter: brightness(1.12);
      }
      /* 只动 opacity：首屏入场时保留 transform 会让页内 position:fixed 的浮层相对首屏定位。 */
      @keyframes cs-focus-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .cs-focus-panel {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 0; margin-top: 4px; padding-top: 12px;
        border-top: 1px solid var(--cs-line);
      }
      .cs-fs-item {
        flex: 0 0 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px;
        padding: 4px 18px; border: 0; border-left: 1px solid color-mix(in srgb, var(--cs-line) 80%, transparent);
        border-radius: 0; background: transparent;
      }
      .cs-fs-item:first-child { border-left: 0; padding-left: 0; }
      /* 选中块右侧的邻项不再露出竖分隔线，和左侧选中态一起收干净。 */
      .cs-fs-item.is-current + .cs-fs-item { border-left-color: transparent; }
      .cs-fs-item span { font-size: 10.5px; line-height: 16px; color: var(--cs-ink-3); }
      .cs-fs-item b {
        font-family: var(--cs-mono); font-variant-numeric: tabular-nums;
        font-size: 20px; line-height: 26px; font-weight: 620; color: var(--cs-metric-color, var(--cs-ink));
        letter-spacing: -.02em; overflow-wrap: anywhere;
      }
      @container cs-overview (max-width: 600px) {
        .cs-focus-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .cs-fs-item { padding: 6px 12px; }
        .cs-fs-item:nth-child(2n + 1) { border-left: 0; padding-left: 0; }
        .cs-fs-item:last-child:nth-child(odd) { grid-column: 1 / -1; margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--cs-line); }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-view, .cs-view.is-leaving, .cs-curtain, .cs-tab-thumb,
        .cs-hero-focus, .cs-trend-focus, .cs-zoom-btn, .cs-zoom-btn::before,
        .cs-zoom-btn svg, .cs-icon-toggle, .cs-icon-toggle::before, .cs-icon-toggle svg,
        .cs-palette-signal, .cs-palette-ring, .cs-palette-toggle::after,
        .cs-info button > svg, .cs-session-inspect .cs-detail-glyph,
        .cs-inspector-open .cs-detail-glyph, .cs-review-icon.is-copy > svg rect,
        .cs-review-icon.is-copy > svg path, .cs-review-icon.is-export > svg,
        .cs-card-icon-btn, .cs-card-icon-btn::before, .cs-card-icon-btn .cs-detail-glyph
          { animation: none !important; transition: none !important; }
        .cs-trend-focus .cs-bar-group .cs-bar-pair { transition: none !important; }
      }

      /* 每日活跃热力图：全年、3m/6m 共用 7 行周网格，单月是 7 列日历。 */
      .cs-heatmap-card {
        --cs-heat-cell: clamp(10px, 1.2vw, 18px); --cs-heat-gap: 3px;
        position: relative; overflow: visible;
        display: flex; flex-direction: column; gap: 12px;
      }
      /* 普通概览的周网格以近 3 个月的 14 周贴合卡宽为基准，近半年沿用同一格子尺寸；
         单月改用卡片宽度均分列宽，全年保持通栏等比布局。 */
      .cs-heatmap-card:not(.cs-heatmap-focus) {
        container-type: inline-size;
        --cs-heat-gap: 2px;
        --cs-heat-cell: clamp(9px, calc((100cqw - 30px - 13 * var(--cs-heat-gap)) / 14), 16px);
      }
      /* 范围选择器只收窄触发器；弹出的三列 15 项菜单保持完整，避免选项被裁切。 */
      .heat-range-select .cs-select-btn {
        width: 78px; min-width: 78px; max-width: 78px;
        min-height: 28px; padding: 4px 7px; gap: 5px;
      }
      .heat-range-select .cs-select-val { font-size: 11.5px; }
      .heat-card-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
      /* 范围汇总收进模块图标的说明浮层：色带下方用细线隔开覆盖度圆环与两份读数。 */
      .cs-heat-legend-summary {
        display: flex; align-items: center; gap: 10px;
        padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1);
        color: var(--dsw-alias-label-secondary);
      }
      .cs-heat-legend-ring {
        width: 22px; height: 22px; border-radius: 50%; flex: none;
        background: conic-gradient(var(--cs-chart-active) var(--cs-heat-coverage, 0deg), var(--cs-ring-track) 0);
        -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px));
        mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px));
      }
      .cs-heat-legend-stat { display: inline-flex; flex-direction: column; gap: 1px; min-width: 0; line-height: 1; }
      .cs-heat-legend-stat > span { font-size: 10px; line-height: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .cs-heat-legend-stat > b { font-size: 11.5px; line-height: 14px; font-weight: 620; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .cs-heat-legend-divider { width: 1px; height: 18px; flex: none; background: var(--dsw-alias-border-l1); }
      .heatmap-body { display: flex; align-items: flex-start; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
      /* 近半年网格会横向滚动：星期刻度钉在滚动视口左缘，不再随网格滑走。 */
      .heatmap-body:not(.is-year) { gap: 0; }
      .heatmap-body:not(.is-year) .heat-weekdays {
        position: sticky; left: 0; z-index: 4;
        padding-right: 8px;
        background: var(--dsw-alias-bg-layer-1);
      }
      /* 全年 53 列压进卡片可用宽度：列宽等比分配、格子用 aspect-ratio 保持正方形，
         不再靠固定像素宽度撑出横向滚动条；月份刻度也走同一套等比列。 */
      .heatmap-body.is-year {
        --cs-heat-gap: clamp(1px, .2vw, 3px);
        display: grid; grid-template-columns: auto minmax(0, 1fr);
        align-items: stretch; justify-content: normal; gap: 4px;
        width: 100%; overflow: visible; padding-bottom: 0;
      }
      .heatmap-body.is-year .heat-plot { flex: 1 1 auto; width: 100%; min-width: 0; gap: 4px; }
      .heatmap-body.is-year .heat-weekgrid {
        width: 100%; grid-auto-columns: minmax(0, 1fr);
        grid-template-rows: repeat(7, auto);
      }
      .heatmap-body.is-year .heat-weekgrid .heat-cell {
        width: auto; height: auto; min-width: 0; aspect-ratio: 1;
      }
      .heatmap-body.is-year .heat-weekdays { align-self: stretch; padding-bottom: 20px; }
      .heatmap-body.is-year .heat-weekday-list {
        flex: 1 1 auto; grid-template-rows: repeat(7, minmax(0, 1fr));
      }
      .heatmap-body.is-year .heat-weekday-list span {
        display: flex; align-items: center; justify-content: flex-end; line-height: 1;
      }
      .heatmap-body.is-year .heat-months { height: 16px; }
      .heatmap-body.is-year .heat-months span { font-size: 10px; line-height: 16px; }
      /* 窄卡片里 53 列会让月份标签互相重叠，按可用宽度降为隔月、再降为每季度显示。 */
      @media (max-width: 1180px) {
        .heatmap-body.is-year .heat-months span:nth-child(even) { display: none; }
      }
      @media (max-width: 820px) {
        .heatmap-body.is-year .heat-months span { display: none; font-size: 9px; }
        .heatmap-body.is-year .heat-months span:nth-child(3n + 1) { display: block; }
      }
      /* 全年月份刻度在网格下方，星期标签不再预留上方空行，否则会与 7 行格子错开 20px。 */
      .heatmap-body.is-year .heat-weekdays-spacer { display: none; }
      .heat-weekdays { display: flex; flex-direction: column; flex: 0 0 auto; }
      .heat-weekdays-spacer { display: block; height: 14px; margin-bottom: 6px; }
      .heat-weekday-list { display: grid; grid-template-rows: repeat(7, var(--cs-heat-cell)); row-gap: var(--cs-heat-gap); }
      .heat-weekday-list span { font-size: 10px; line-height: var(--cs-heat-cell); color: var(--dsw-alias-label-secondary); }
      .heat-plot { display: inline-flex; flex-direction: column; gap: 6px; flex: 0 0 auto; }
      .heat-months { position: relative; height: 14px; }
      .heat-months.is-grid { display: grid; }
      .heat-months.is-grid span { position: static; justify-self: start; }
      .heat-months span { position: absolute; top: 0; font-size: 10px; line-height: 14px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .heat-weekgrid {
        display: grid; grid-auto-flow: column; width: max-content;
        grid-template-rows: repeat(7, var(--cs-heat-cell));
        grid-auto-columns: var(--cs-heat-cell);
        gap: var(--cs-heat-gap);
      }
      .heat-cell {
        display: block; width: var(--cs-heat-cell); height: var(--cs-heat-cell);
        border: 0; border-radius: 4px; background: var(--cs-heat-0); user-select: none;
      }
      .heat-cell.l0 { background: var(--cs-heat-0); }
      .heat-cell.l1 { background: var(--cs-heat-1); }
      .heat-cell.l2 { background: var(--cs-heat-2); }
      .heat-cell.l3 { background: var(--cs-heat-3); }
      .heat-cell.l4 { background: var(--cs-heat-4); }
      .heat-cell.l5 { background: var(--cs-heat-5); }
      /* 无记录落在最浅一档雾蓝，而不是灰块；日历补位才真正留空。 */
      .heat-cell.is-empty {
        background: var(--cs-heat-0);
        box-shadow: none;
        border: 0;
      }
      .heat-cell.is-pad {
        background: transparent;
        box-shadow: none;
        border: 0;
      }
      .heat-cell[role="button"] {
        position: relative; cursor: pointer;
        transition: transform 120ms ease, filter 120ms ease;
      }
      .heat-cell[role="button"]:hover {
        transform: scale(1.35); filter: brightness(1.12); z-index: 3;
      }
      .heat-cell[role="button"]:focus-visible {
        transform: scale(1.35); filter: brightness(1.12); z-index: 3;
      }
      .heat-cell:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }

      /* 全年：左侧月份刻度与 31 列格子共用同一张网格，保证逐行严格对齐。 */
      .heat-year { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      .heat-year-grid {
        display: grid; grid-template-columns: 48px repeat(31, minmax(0, 1fr));
        column-gap: 3px; row-gap: 2px; align-items: center; min-width: 0;
      }
      .heat-year-row { display: contents; }
      .heat-year-label {
        font-size: 10px; line-height: 12px; text-align: right; padding-right: 6px;
        color: var(--dsw-alias-label-secondary); white-space: nowrap;
      }
      .heat-year .heat-cell {
        width: auto; height: auto; min-width: 0; aspect-ratio: 1;
        border-radius: 4px;
      }
      .heat-month-bars {
        display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 6px;
        align-items: end; height: 104px; padding-bottom: 18px; min-width: 0;
      }
      .heat-month-bar {
        position: relative; width: 100%; min-height: 2px; align-self: end;
        border-radius: 3px 3px 0 0;
        transition: height 200ms var(--cs-ease);
      }
      .cs-month-fill { position: absolute; inset: 0; border-radius: inherit; background: var(--cs-heat-3); }
      /* 月度条沿用每日热力图的 0–5 级色阶：最高月用最深一级，最低有记录月用最浅一级。 */
      .heat-month-bar.is-level-0 .cs-month-fill { background: var(--cs-heat-0); }
      .heat-month-bar.is-level-1 .cs-month-fill { background: var(--cs-heat-1); }
      .heat-month-bar.is-level-2 .cs-month-fill { background: var(--cs-heat-2); }
      .heat-month-bar.is-level-3 .cs-month-fill { background: var(--cs-heat-3); }
      .heat-month-bar.is-level-4 .cs-month-fill { background: var(--cs-heat-4); }
      .heat-month-bar.is-level-5 .cs-month-fill { background: var(--cs-heat-5); }
      .heat-month-bar::after {
        content: attr(data-month); position: absolute; top: calc(100% + 4px); left: 50%;
        transform: translateX(-50%); font-size: 10px; line-height: 12px;
        color: var(--dsw-alias-label-secondary); white-space: nowrap;
      }

      /* 单月：7 列日历与周网格共用同一格子尺寸，不再把日历撑到整张卡宽。 */
      .heat-month {
        display: flex; flex-direction: column; gap: var(--cs-heat-gap);
        width: calc(7 * var(--cs-heat-cell) + 6 * var(--cs-heat-gap));
        max-width: 100%; min-width: 0; margin-inline: auto;
      }
      /* 普通概览的单月按卡宽铺满：列宽均分，格子保持正方形；260px 上限让 6 行日历仍落在首屏内。 */
      .cs-heatmap-card[data-layout="month"]:not(.cs-heatmap-focus) .heat-month {
        width: 100%; max-width: 260px;
      }
      .cs-heatmap-card[data-layout="month"]:not(.cs-heatmap-focus) .heat-month-grid {
        grid-auto-rows: auto;
      }
      .cs-heatmap-card[data-layout="month"]:not(.cs-heatmap-focus) .heat-month .heat-cell {
        width: auto; height: auto; aspect-ratio: 1; border-radius: 5px;
      }
      .heat-month-weekdays {
        display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--cs-heat-gap);
        font-size: 10px; line-height: 12px; text-align: center;
        color: var(--dsw-alias-label-secondary);
      }
      .heat-month-grid {
        display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--cs-heat-gap);
        min-width: 0;
      }
      .heat-month .heat-cell {
        width: auto; height: auto; min-width: 0; aspect-ratio: 1;
        border-radius: 5px;
      }
      @media (max-width: 600px) {
        .cs-heatmap-card { --cs-heat-cell: clamp(9px, 3vw, 13px); --cs-heat-gap: 2px; }
        .heat-year-grid { grid-template-columns: 32px repeat(31, minmax(0, 1fr)); column-gap: 2px; }
        .heat-year-label { font-size: 9px; padding-right: 4px; }
        .heat-month-bars { height: 84px; }
      }

      /* 热力图首屏：上方是当前范围，下方是范围统计与月度活跃。 */
      .cs-heatmap-focus-page {
        display: flex; flex-direction: column;
        animation: cs-focus-in var(--cs-focus-ms, 240ms) var(--cs-ease) both;
      }
      .cs-heatmap-focus {
        --cs-heat-cell-limit: 4.6svh; --cs-heat-gap: 4px;
        flex: 1 0 auto; gap: 16px;
        padding: clamp(14px, 2.5svh, 24px) clamp(14px, 2.5cqw, 24px);
      }
      .cs-heatmap-card.has-zoom .cs-card-head { padding-right: 30px; }
      .heat-focus-layout {
        display: flex; flex-direction: column; gap: 16px;
        flex: 1 0 auto;
      }
      .heat-focus-main {
        min-width: 0; display: flex; align-items: center; justify-content: center;
        flex: 1 0 auto;
      }
      .heat-focus-visual { container-type: inline-size; width: 100%; display: flex; flex-direction: column; gap: 8px; }
      .cs-heatmap-focus .heatmap-body {
        width: 100%; align-items: center; justify-content: center;
        flex: 0 1 auto; min-height: 0; overflow-x: auto; overflow-y: visible;
      }
      .cs-heatmap-focus .heat-plot { flex: 1 1 auto; width: 100%; min-width: 0; }
      /* 3m/6m 首屏：星期刻度与固定像素周网格作为一个整体居中，月份刻度与网格同宽。 */
      .cs-heatmap-focus .heatmap-body:not(.is-year) {
        --cs-heat-cell: clamp(12px, min(var(--cs-heat-cell-limit), calc(
          (100cqw - 34px - (var(--cs-heat-columns) - 1) * var(--cs-heat-gap)) / var(--cs-heat-columns)
        )), 52px);
        width: fit-content; max-width: 100%; margin: 0 auto;
        justify-content: flex-start;
      }
      .cs-heatmap-focus .heatmap-body:not(.is-year) .heat-plot {
        flex: 0 0 auto; width: max-content;
      }
      .cs-heatmap-focus .heat-months.is-grid:not(.is-year) {
        width: max-content; max-width: 100%; margin: 0 auto;
      }
      /* 全年列铺满整行，其余范围在可用宽高内保持正方形。 */
      .cs-heatmap-focus .heat-weekgrid {
        width: 100%; grid-auto-columns: minmax(0, 1fr); grid-template-rows: repeat(7, auto);
        gap: var(--cs-heat-gap);
      }
      .cs-heatmap-focus .heatmap-body:not(.is-year) .heat-weekgrid {
        width: max-content; margin: 0 auto; grid-auto-columns: var(--cs-heat-cell);
      }
      .cs-heatmap-focus .heat-weekgrid .heat-cell {
        width: auto; height: auto; min-width: 0; aspect-ratio: 1;
      }
      .cs-heatmap-focus .heatmap-body.is-year {
        --cs-heat-cell: clamp(15px, 1.3vw, 22px);
        display: grid; align-items: stretch; justify-content: normal; overflow: visible;
      }
      .cs-heatmap-focus .heat-weekdays { align-self: stretch; }
      .cs-heatmap-focus .heat-weekday-list {
        grid-template-rows: repeat(7, minmax(0, 1fr)); flex: 1 1 auto;
      }
      .cs-heatmap-focus .heat-months { display: grid; gap: var(--cs-heat-gap); }
      .cs-heatmap-focus .heat-months span { position: static; }
      .cs-heatmap-focus .heat-year { flex: 1 1 auto; }
      .cs-heatmap-focus .heat-year-grid { width: 100%; }
      .cs-heatmap-focus[data-layout="month"] .heat-month { width: min(100%, clamp(220px, 60svh, 620px)); margin: 0 auto; }
      .cs-heatmap-focus .heat-month-grid { width: 100%; }
      .heat-focus-bottom {
        display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
        gap: 26px; align-items: end; flex: 0 0 auto;
        padding-top: 14px; border-top: 1px solid var(--cs-line);
      }
      .heat-focus-panel {
        display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px 0; min-width: 0;
      }
      .heat-focus-panel .cs-fs-item {
        flex: 0 0 auto; min-width: 0; padding: 2px 14px;
        border: 0; border-left: 1px solid color-mix(in srgb, var(--cs-line) 80%, transparent);
        border-radius: 0; background: transparent;
      }
      .heat-focus-panel .cs-fs-item:nth-child(3n + 1) { border-left: 0; padding-left: 0; }
      .heat-focus-bars { min-height: 96px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .heat-focus-bars-head {
        display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
        font-size: 11px; line-height: 16px; color: var(--cs-ink-3); font-variant-numeric: tabular-nums;
      }
      .cs-heatmap-focus .heat-month-bars { height: clamp(76px, 16svh, 184px); padding-bottom: 16px; }
      /* 月度条与趋势柱同一套生长入场；起点错到首屏淡入之后，让逐月生长清楚可见。 */
      .cs-heatmap-focus .heat-month-bars .cs-reveal-y {
        animation-delay: calc(200ms + var(--cs-chart-delay, 0ms));
      }
      /* 全年网格的格高受宽度限制，余量优先交给下方图表，统计项维持紧凑。 */
      .heat-focus-layout.is-year { display: grid; grid-template-rows: 1fr auto; }
      .heat-focus-layout.is-year .heat-focus-bottom { align-items: center; }
      .heat-focus-layout.is-year .heat-focus-bars { height: clamp(96px, 36svh, 440px); }
      .heat-focus-layout.is-year .heat-month-bars { flex: 1 0 0; }
      @container cs-overview (max-width: 680px) {
        .cs-heatmap-focus { --cs-heat-cell-limit: 3.2svh; --cs-heat-gap: 3px; }
        .heat-focus-layout { gap: 12px; }
        .heat-focus-bottom { grid-template-columns: 1fr; gap: 12px; align-items: stretch; padding-top: 10px; }
        .heat-focus-panel { gap: 8px 0; }
        .heat-focus-panel .cs-fs-item b { font-size: 18px; line-height: 23px; }
        .cs-heatmap-focus .heat-month-bars { height: clamp(76px, 12svh, 120px); }
        .heat-focus-layout.is-year .heat-focus-bars { height: clamp(96px, 24svh, 230px); }
        .cs-heatmap-focus[data-layout="month"] .heat-month { width: min(100%, clamp(220px, 46svh, 420px)); }
      }
      @container cs-overview (max-width: 450px) {
        .heat-focus-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .heat-focus-panel .cs-fs-item:nth-child(3n + 1) { border-left: 1px solid color-mix(in srgb, var(--cs-line) 80%, transparent); padding-left: 14px; }
        .heat-focus-panel .cs-fs-item:nth-child(2n + 1) { border-left: 0; padding-left: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-heatmap-focus-page, .cs-heatmap-focus, .cs-heatmap-focus .heat-month-bar {
          animation: none !important; transition: none !important;
        }
      }

      /* 整页滚轮滚动：根容器与 Bento 都按内容自然高度，不固定视口高度；
         子模块不设内部竖滚，切全年时隐式第 4 行自然撑高，由整页滚动承载。 */
      .cs-shell { gap: 8px; }
      .cs-topbar { margin-bottom: 0; min-height: 46px; }
      .cs-tabs { margin-bottom: 4px; min-height: 36px; }
      .cs-composition, .cs-ranking { gap: 12px; }
      .cs-donut { width: clamp(118px, 10vw, 150px); }
      @media (max-width: 1100px) {
        .cs-donut { width: 132px; }
        .cs-donut-center { inset: 17%; }
        .cs-donut-center strong { font-size: 16px; }
      }
      @media (max-width: 520px) {
        .cs-donut { width: 118px; }
        .cs-donut-center { inset: 18%; }
        .cs-donut-center strong { font-size: 14px; }
      }
      .cs-chart svg { height: clamp(90px, 13vh, 160px); }
      /* 今日 24 小时条状图：图表区吃满卡片剩余高度，柱图整体下沉，不在统计带上方留大块空白。 */
      .cs-trend-layout .cs-trend-card .cs-chart { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
      .cs-trend-layout .cs-trend-card .cs-plot { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
      .cs-trend-layout .cs-trend-card .cs-plot svg { flex: 1 1 auto; height: 100%; min-height: 120px; }
      .cs-summary { padding: 8px 12px; }
      .cs-trend-card, .cs-table-card { gap: 10px; }
      /* 矮窗各视图共用顶栏和导航间距，概览图表按剩余高度调整尺寸。 */
      @media (max-height: 850px) {
        .cs-page { padding-block: 12px; }
        .cs-shell { gap: 6px; }
        .cs-tabs { margin-bottom: 0; }
        .cs-overview-grid, .cs-overview-analysis, .cs-overview-bottom { gap: 8px; }
        .cs-overview-grid { --cs-overview-room: 0px; }
        .cs-overview-grid .cs-card { padding: calc(10px + var(--cs-overview-room) * .04) 12px; }
        .cs-overview-grid .cs-card-heading { top: 0; }
        .cs-overview-grid .cs-overview-metrics { min-height: 0; }
        .cs-overview-metrics .cs-cycle { padding-block: 5px; gap: 2px; }
        .cs-cycle-today .cs-hero-num { font-size: clamp(28px, 4.5cqw, calc(38px + var(--cs-overview-room) * .07)); }
        .cs-overview-analysis .cs-trend-card { gap: 6px; }
        .cs-overview-analysis .cs-chart svg { height: calc(clamp(72px, 11vh, 100px) + var(--cs-overview-room) * .5); }
        .cs-overview-analysis .cs-trend-foot { padding-block: 6px; }
        .cs-overview-analysis .cs-composition, .cs-overview-bottom .cs-ranking { min-height: 0; gap: 8px; }
        .cs-overview-analysis .cs-donut { width: clamp(96px, calc(9cqw + var(--cs-overview-room) * .28), 148px); }
        .cs-overview-analysis .cs-donut-center strong { font-size: 14px; }
        .cs-overview-analysis .cs-composition-list, .cs-overview-bottom .cs-ranking-list { gap: 5px; }
        .cs-overview-bottom .cs-ranking-row { min-height: 24px; grid-template-columns: 17px minmax(0, 1fr) minmax(22px, .8fr) auto; gap: 7px; }
        .cs-overview-bottom .cs-heatmap-card {
          gap: 6px;
        }
        .cs-overview-bottom .cs-recent-row { min-height: calc(38px + var(--cs-overview-room) * .065); padding-block: 3px; }
        @container cs-overview (min-width: 850px) {
          /* 概览按可用高度补足留白：到窗口底部的余量全部换成图表、热力格与会话行的呼吸空间。 */
          .cs-overview-grid { --cs-overview-room: clamp(0px, calc((100vh - 694px) * 1.2), 200px); }
        }
        @container cs-composition (min-width: 230px) and (max-width: 310px) {
          .cs-overview-analysis .cs-composition-body { flex-direction: row; gap: 8px; }
          .cs-overview-analysis .cs-composition-list { flex: 1; width: auto; }
        }
        @container cs-overview (min-width: 650px) and (max-width: 850px) {
          .cs-overview-bottom:not(.is-year) { grid-template-columns: minmax(0, 1fr) minmax(0, .85fr) minmax(0, 1.2fr); }
          .cs-overview-bottom:not(.is-year) > .cs-recent { grid-column: auto; }
        }
        @container cs-overview (min-width: 650px) and (max-width: 680px) {
          .cs-overview-metrics { grid-template-columns: minmax(0, 1.65fr) minmax(0, 1.1fr) repeat(2, minmax(0, 1fr)); }
          .cs-overview-metrics .cs-cycle, .cs-overview-metric-pair { padding-inline: 8px; }
          .cs-overview-metrics .cs-cycle-today { padding-right: 27px; }
        }
      }
      @media (max-height: 720px) {
        .cs-overview-grid { gap: 6px; }
        .cs-overview-grid .cs-card { padding-block: 8px; }
        .cs-overview-bottom .cs-recent .cs-card-head { margin-bottom: 4px; }
        .cs-overview-bottom .cs-recent-row { min-height: 0; padding-block: 2px; }
      }
      /* 设置页留白：卡片按自然高度排，不再把两行卡强行拉到四行卡的高度。 */
      .cs-settings-grid { gap: 10px; align-content: start; }
      .cs-settings-card { align-self: start; }
      .cs-settings-card > .cs-settings-row { flex: 0 0 auto; }
      .cs-import-hint { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 14px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-import-file-state { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }

      /* ===== 会话模块重塑：工作区退为轻量分组标题，会话行成为列表主体。 ===== */
      .cs-details-toolbar { gap: 12px; }
      .cs-details-toolbar .cs-search-wrap { flex: 1 1 240px; max-width: none; }
      .cs-details-toolbar .cs-details-range { margin-left: auto; }
      .cs-details-filter { position: relative; isolation: isolate; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px; padding: 3px; background: var(--cs-surface); border: 1px solid var(--cs-line); border-radius: 8px; }
      .cs-details-filter::before {
        content: ''; position: absolute; z-index: -1; left: 3px; top: 3px; bottom: 3px;
        width: calc((100% - 8px) / 2); border-radius: 5px; background: var(--cs-tone-faint);
        transform: translateX(0); transition: transform var(--cs-dur-view) var(--cs-ease);
      }
      .cs-details-filter[data-status="running"]::before { transform: translateX(calc(100% + 2px)); }
      .cs-details-filter button { position: relative; border: 0; padding: 5px 10px; border-radius: 5px; background: transparent; color: var(--cs-ink-2); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; transition: color var(--cs-dur-tap) var(--cs-ease); }
      .cs-details-filter button.is-on { color: var(--cs-signal); }
      .cs-details-filter button:focus-visible, .cs-session-inspect:focus-visible { outline: 2px solid var(--cs-focus); outline-offset: 2px; }
      .cs-details-sort .cs-select-btn { min-height: 34px; font-size: 12px; }
      .cs-record-columns { display: grid; grid-template-columns: minmax(0, 1fr) 285px; margin-top: 12px; border-top: 1px solid var(--cs-line); }
      .cs-record-columns .cs-workspace-list { min-width: 0; padding-right: 18px; }
      .cs-sessions-tools { display: flex; align-items: center; gap: 18px; }
      .cs-record-footer { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-top: 1px solid var(--cs-line); margin-top: 12px; padding: 12px 0 4px; font-size: 11px; color: var(--cs-ink-2); }
      .cs-session-inspector { display: flex; flex-direction: column; gap: 15px; align-self: start; min-width: 0; padding: 20px 0 20px 20px; border-left: 1px solid var(--cs-line); position: sticky; top: 12px; }
      .cs-inspector-label { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--cs-ink-2); }
      .cs-session-inspector h3 { margin: 0; font-size: 15px; line-height: 23px; font-weight: 600; overflow-wrap: anywhere; }
      .cs-inspector-workspace { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--cs-ink-2); }
      .cs-inspector-running { color: var(--cs-task); }
      .cs-inspector-total { font: 650 27px/1.3 ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; color: var(--cs-task); overflow-wrap: anywhere; }
      .cs-inspector-breakdown { display: flex; gap: 3px; height: 9px; border-radius: 3px; overflow: hidden; background: var(--cs-tone-faint); }
      .cs-inspector-series.is-model { background: var(--cs-signal-deep); }
      .cs-inspector-series.is-tool { background: var(--cs-signal-soft); }
      .cs-inspector-series.is-wait { background: #bd934e; }
      .cs-palette-coral .cs-inspector-series.is-wait { background: #6099b8; }
      .cs-inspector-series.is-other { background: var(--cs-tone-other); }
      .cs-inspector-series.is-unknown { background: var(--cs-tone-faint); }
      /* 浅色明细保留当前配色，暖色等待和中性未拆分便于识别相邻小段。 */
      .cs-appearance-light .cs-inspector-series.is-wait { background: #a87522; }
      .cs-appearance-light.cs-palette-coral .cs-inspector-series.is-wait { background: #417b9b; }
      .cs-appearance-light .cs-inspector-series.is-other { background: color-mix(in srgb, var(--cs-signal-soft) 24%, var(--cs-surface)); }
      .cs-inspector-series.is-other { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cs-signal) 30%, transparent); }
      .cs-appearance-light .cs-inspector-series.is-unknown { background: repeating-linear-gradient(135deg, #7f868b 0 2px, #edf0f2 2px 4px); }
      .cs-inspector-rows { display: flex; flex-direction: column; gap: 12px; margin: 0; padding-bottom: 16px; border-bottom: 1px solid var(--cs-line); }
      .cs-inspector-rows > div, .cs-inspector-active { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
      .cs-inspector-rows dt { display: flex; align-items: center; gap: 7px; color: var(--cs-ink-2); }
      .cs-inspector-rows dt i { width: 10px; height: 10px; flex: 0 0 10px; border-radius: 3px; }
      .cs-inspector-rows dd { margin: 0; font-variant-numeric: tabular-nums; }
      .cs-inspector-active { color: var(--cs-ink-2); }
      .cs-inspector-active b { color: var(--cs-signal); font-weight: 500; }
      .cs-inspector-open { display: inline-flex; align-items: center; gap: 8px; justify-content: center; width: 100%; }
      .cs-inspector-open .cs-detail-glyph { transition: transform 220ms cubic-bezier(.34, 1.56, .64, 1); }
      .cs-inspector-open:hover .cs-detail-glyph, .cs-inspector-open:focus-visible .cs-detail-glyph { transform: translate(2px, -2px); }
      .cs-inspector-note, .cs-session-inspector.is-empty p { margin: 0; font-size: 11px; line-height: 1.8; color: var(--cs-ink-2); }
      .cs-session-inspector.is-empty { align-items: center; padding-top: 50px; text-align: center; }
      .cs-session-inspect { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 30px; height: 30px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--cs-ink-2); cursor: pointer;
        transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease; }
      .cs-session-inspect:hover, .cs-session-inspect[aria-pressed="true"] { color: var(--cs-signal); background: var(--cs-tone-faint); }
      .cs-session-inspect:hover { border-color: color-mix(in srgb, var(--cs-signal) 26%, transparent); }
      .cs-session-inspect .cs-detail-glyph { transition: transform 240ms cubic-bezier(.34, 1.56, .64, 1); }
      .cs-session-inspect:hover .cs-detail-glyph, .cs-session-inspect:focus-visible .cs-detail-glyph { transform: scale(1.16) rotate(-6deg); }
      /* 打开宿主会话：沿用详情抽屉入口的斜向位移，和「预览统计」的放大旋转区分。 */
      .cs-session-open:hover .cs-detail-glyph, .cs-session-open:focus-visible .cs-detail-glyph { transform: translate(2px, -2px); }
      .cs-page .cs-session.is-selected { background: var(--cs-tone-faint); }
      .cs-page .cs-session.is-selected::before { content: ''; position: absolute; top: 0; right: auto; bottom: 0; left: -1px; width: 2px; border-radius: 0; background: var(--cs-signal); box-shadow: none; animation: none; pointer-events: none; }
      .cs-page .cs-session.is-selectable { cursor: pointer; transition: background var(--cs-dur-tap) var(--cs-ease); }
      .cs-page .cs-session.is-selectable:not(.is-selected):hover { background: color-mix(in srgb, var(--cs-signal) 4%, transparent); }
      .cs-detail-stat.is-task .cs-detail-stat-value { color: var(--cs-task); }
      .cs-detail-stat.is-active .cs-detail-stat-value { color: var(--cs-signal); }
      .cs-details-loading { padding: 32px; text-align: center; }
      .cs-details-notice { padding: 10px 12px; border: 1px solid var(--cs-line); border-radius: 8px; background: var(--cs-tone-faint); color: var(--cs-ink); font-size: 12px; line-height: 18px; }
      @media (max-width: 1100px) {
        .cs-record-columns { grid-template-columns: minmax(0, 1fr) 240px; }
        .cs-record-columns .cs-workspace-list { padding-right: 10px; }
        .cs-session-inspector { padding-left: 14px; }
      }
      @media (max-width: 900px) {
        .cs-record-columns { grid-template-columns: 1fr; }
        .cs-record-columns .cs-workspace-list { padding-right: 0; }
        .cs-session-inspector { border-left: 0; border-top: 1px solid var(--cs-line); padding: 20px 0 8px; position: static; }
      }
      .cs-sessions-card { padding: 16px 18px 10px; gap: 0; }
      .cs-sessions-card-head { align-items: flex-start; margin-bottom: 2px; }
      .cs-sessions-heading { gap: 0; min-width: 0; }
      .cs-sessions-title-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .cs-sessions-title-line h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 650; }
      .cs-sessions-count { flex: none; padding: 1px 7px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 17px; font-variant-numeric: tabular-nums; }
      .cs-sessions-scope { margin-left: auto; padding-top: 3px; font-size: 10.5px; line-height: 16px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .cs-workspace-list { display: flex; flex-direction: column; margin-top: 8px; }
      .cs-page .cs-group { border-top: 1px solid var(--dsw-alias-border-l1); }
      .cs-page .cs-group:first-child { border-top: 0; }
      .cs-page .cs-summary.cs-workspace-head { display: flex; align-items: center; flex-wrap: nowrap; gap: 8px; min-height: 46px; padding: 7px 8px; border: 0; border-radius: 8px; cursor: pointer; transition: background var(--cs-dur-tap) var(--cs-ease); }
      .cs-page .cs-summary.cs-workspace-head:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, transparent); }
      .cs-workspace-chevron { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex: none; color: var(--dsw-alias-label-secondary); }
      .cs-workspace-chevron .cs-triangle.is-open { transform: rotate(90deg); }
      .cs-workspace-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; line-height: 19px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
      .cs-group.is-open .cs-workspace-name { color: var(--dsw-alias-label-primary); }
      .cs-workspace-count { display: inline-flex; align-items: center; justify-content: center; min-width: 19px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 18px; font-variant-numeric: tabular-nums; }
      .cs-page .cs-sessions { margin: 0 0 8px 28px; padding: 2px 0; border-left: 1px solid var(--dsw-alias-border-l1); border-radius: 0; background: transparent; }
      .cs-page .cs-session { position: relative; display: flex; align-items: center; flex-wrap: nowrap; gap: 16px; padding: 11px 10px 11px 18px; border-top: 0; border-radius: 0 7px 7px 0; }
      /* 选中底色和分隔线贴合分组竖线，选中标记覆盖竖线，文字保留原有缩进。 */
      .cs-page .cs-session + .cs-session::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: color-mix(in srgb, var(--dsw-alias-border-l1) 72%, transparent); pointer-events: none; }
      .cs-session-body { display: flex; flex-direction: column; gap: 4px; flex: 1 1 auto; min-width: 0; }
      .cs-session-headline { display: flex; align-items: center; gap: 7px; min-width: 0; }
      .cs-session-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--dsw-alias-border-l2, var(--dsw-alias-border-l1)); }
      .cs-session-dot.is-running { background: var(--cs-task); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cs-task) 14%, transparent); }
      .cs-page .cs-session-title { flex: 0 1 auto; min-width: 0; max-width: 100%; color: var(--cs-ink); font-size: 14px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cs-session-headline .cs-session-status { color: var(--dsw-alias-label-secondary); }
      .cs-session-headline .cs-session-status.is-running { color: var(--cs-task); }
      .cs-session-headline .cs-session-status.is-warning { color: var(--cs-error); }
      .cs-session-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-height: 18px; padding-left: 13px; }
      .cs-session-meta .cs-session-stat { display: inline-flex; align-items: center; gap: 4px; padding: 0; border-radius: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; }
      .cs-session-meta .cs-session-stat .cs-detail-meta-value { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
      .cs-session-meta .cs-session-stat .cs-detail-glyph { width: 14px; height: 14px; vertical-align: middle; opacity: .75; }
      .cs-session-meta .cs-session-tool { display: inline-flex; align-items: center; justify-content: center; width: 17px; height: 17px; color: var(--dsw-alias-label-secondary); opacity: .72; }
      .cs-session-meta .cs-session-tool:hover { opacity: 1; color: var(--cs-signal); }
      .cs-session-tail { display: flex; align-items: center; gap: 5px; flex: none; margin-left: auto; }
      .cs-session-tail .cs-session-last { display: inline-flex; align-items: center; gap: 4px; padding: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; white-space: nowrap; }
      .cs-session-tail .cs-session-last .cs-detail-glyph { width: 13px; height: 13px; vertical-align: middle; opacity: .7; }
      .cs-page .cs-session.is-highlighted { background: color-mix(in srgb, var(--cs-signal) 8%, transparent); }
      .cs-appearance-light .cs-details-filter::before { background: var(--cs-selection); }
      .cs-appearance-light .cs-details-filter button.is-on { color: var(--cs-on-selection); }
      .cs-appearance-light .cs-session-inspect[aria-pressed="true"] {
        background: var(--cs-selection); color: var(--cs-on-selection);
      }
      .cs-page.cs-appearance-light .cs-session.is-selected {
        background: color-mix(in srgb, var(--cs-selection) 18%, var(--cs-surface));
      }
      .cs-page.cs-appearance-light .cs-session.is-selected::before { background: var(--cs-selection); }
      .cs-page.cs-appearance-light .cs-session.is-highlighted { background: color-mix(in srgb, var(--cs-selection) 32%, var(--cs-surface)); }
      .cs-appearance-light .cs-session:is(.is-selected, .is-highlighted) {
        --dsw-alias-label-secondary: #41484c;
        --cs-task: #C29BE8;
      }
      .cs-appearance-light .cs-session-meta .cs-session-stat.is-active .cs-detail-meta-value { color: var(--cs-signal-deep); }
      .cs-appearance-light .cs-session-meta .cs-session-stat.is-task .cs-detail-meta-value { color: var(--cs-task); }
      @media (max-width: 760px) {
        .cs-details-toolbar .cs-search-wrap { flex-basis: 100%; max-width: none; }
        .cs-details-toolbar .cs-details-range { margin-left: 0; }
        .cs-details-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 4px 14px; }
        .cs-detail-stat { padding: 12px 14px; border-top: 0; }
        .cs-detail-stat:nth-child(2n+1) { border-left: 0; padding-left: 0; }
        .cs-detail-stat:nth-child(2n) { padding-right: 0; }
        .cs-detail-stat:nth-child(n+3) { border-top: 1px solid var(--cs-line); }
        .cs-detail-stat-label { font-size: 12px; line-height: 18px; }
        .cs-detail-stat-value { font-size: clamp(18px, 3.2vw, 24px); line-height: 1.3; }
        .cs-detail-stat-hint { font-size: 11px; line-height: 16px; }
        .cs-sessions-card { padding: 12px 10px 6px; }
        .cs-sessions-card-head { flex-direction: column; gap: 2px; }
        .cs-sessions-heading { flex-direction: column; align-items: flex-start; }
        .cs-sessions-title-line h2 { font-size: 15px; line-height: 22px; white-space: nowrap; }
        .cs-sessions-scope { display: none; }
        .cs-workspace-list { margin-top: 4px; }
        .cs-page .cs-summary.cs-workspace-head { min-height: 42px; padding: 4px 4px; }
        .cs-page .cs-sessions { margin-left: 22px; }
        .cs-page .cs-session { gap: 10px; padding: 8px 4px 8px 8px; }
        .cs-page .cs-session-headline { align-items: flex-start; gap: 6px; }
        .cs-page .cs-session-dot { margin-top: 6px; }
        .cs-page .cs-session-title { display: -webkit-box; overflow: hidden; white-space: normal; text-overflow: clip; line-height: 18px; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .cs-session-meta { gap: 4px 6px; }
        .cs-session-meta .cs-session-tool { width: 15px; height: 15px; }
        .cs-session-tail { align-self: flex-start; padding-top: 1px; }
        .cs-session-tail .cs-session-last { font-size: 10.5px; }
      }
      @media (max-width: 430px) {
      }
    `

    /** 设置页独立挂载在 settings.section，样式自成一套，不依赖仪表盘根节点。 */
    const DSH_TIMESPAN_SETTINGS_CSS = `
      ${CS_SELECT_CSS}
      .cs-settings { box-sizing: border-box; color: var(--dsw-alias-label-primary); font-family: inherit; }
      .cs-settings *, .cs-settings *::before, .cs-settings *::after { box-sizing: border-box; }
      .cs-settings-inner { display: flex; flex-direction: column; gap: 18px; max-width: 720px; }
      .cs-settings-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .cs-settings-heading { min-width: 0; }
      .cs-settings-links { display: flex; align-items: center; gap: 2px; margin: -3px 0 0 auto; flex: none; }
      .cs-settings-link {
        position: relative; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px;
        color: var(--dsw-alias-label-secondary); text-decoration: none;
        transition: background 160ms ease, color 160ms ease;
      }
      .cs-settings-link:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .cs-settings-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-settings-link .cs-detail-glyph { display: block; }
      /* 三个入口各自有可识别的悬停动作：GitHub 轻摆、Issue 气泡打字、Star 旋起金星光晕。 */
      .cs-settings-link .cs-detail-glyph {
        transition: transform 240ms cubic-bezier(.22, .8, .26, 1.2), filter 240ms ease;
        transform-origin: 50% 55%;
      }
      .cs-settings-link.is-github:hover .cs-detail-glyph,
      .cs-settings-link.is-github:focus-visible .cs-detail-glyph { transform: translateY(-1px) rotate(-8deg) scale(1.1); }
      .cs-settings-link.is-issue:hover .cs-detail-glyph,
      .cs-settings-link.is-issue:focus-visible .cs-detail-glyph { transform: translateY(-1px) scale(1.12); }
      .cs-settings-link.is-star:hover .cs-detail-glyph,
      .cs-settings-link.is-star:focus-visible .cs-detail-glyph {
        transform: rotate(-12deg) scale(1.2);
        filter: brightness(1.06) drop-shadow(0 1px 4px rgba(233, 162, 0, .55));
      }
      .cs-settings-link:active .cs-detail-glyph { transform: scale(.94); transition-duration: 80ms; }
      .cs-issue-dot { transform-box: fill-box; transform-origin: center; }
      @keyframes cs-issue-dot-bounce {
        0%, 100% { transform: translateY(0); opacity: .82; }
        40% { transform: translateY(-1.5px); opacity: 1; }
      }
      .cs-settings-link.is-issue:hover .cs-issue-dot-a,
      .cs-settings-link.is-issue:focus-visible .cs-issue-dot-a { animation: cs-issue-dot-bounce .52s ease-in-out infinite; }
      .cs-settings-link.is-issue:hover .cs-issue-dot-b,
      .cs-settings-link.is-issue:focus-visible .cs-issue-dot-b { animation: cs-issue-dot-bounce .52s ease-in-out .13s infinite; }
      /* Star 保持金色实心，悬浮只换底色，不跟着其他入口变成正文色。 */
      .cs-settings-link.is-star { color: #e9a200; }
      .cs-settings-link.is-star:hover, .cs-settings-link.is-star:focus-visible { color: #f2b21c; }
      .cs-settings-link.is-star::before {
        content: ''; position: absolute; inset: 3px; border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 196, 60, .3), transparent 68%);
        opacity: 0; transform: scale(.55); pointer-events: none;
        transition: opacity 220ms ease, transform 260ms cubic-bezier(.22, .8, .26, 1.2);
      }
      .cs-settings-link.is-star:hover::before,
      .cs-settings-link.is-star:focus-visible::before { opacity: 1; transform: scale(1); }
      @media (prefers-reduced-motion: reduce) {
        .cs-settings-link .cs-detail-glyph { transition: none; }
        .cs-settings-link:hover .cs-detail-glyph,
        .cs-settings-link:focus-visible .cs-detail-glyph,
        .cs-settings-link:active .cs-detail-glyph { transform: none; }
        .cs-settings-link.is-issue:hover .cs-issue-dot,
        .cs-settings-link.is-issue:focus-visible .cs-issue-dot { animation: none; }
        .cs-settings-link.is-star::before { transition: none; }
      }
      /* 设置页独立挂载，悬停浮层样式随模块一起加载，不等同页面的图表浮层。 */
      .cs-hover-tip {
        position: fixed; left: 0; top: 0; z-index: 90;
        min-width: 132px; max-width: 264px; padding: 8px 10px; border-radius: 8px;
        background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-1);
        box-shadow: 0 12px 30px rgba(0, 0, 0, .24); pointer-events: none;
        font-size: 11px; line-height: 1.7; font-variant-numeric: tabular-nums;
        animation: cs-tip-in 160ms ease both;
      }
      .cs-hover-tip-title { display: block; margin-bottom: 2px; font-size: 11px; font-weight: 650; }
      .cs-hover-tip-row { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; white-space: nowrap; }
      .cs-hover-tip-label { color: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 72%, transparent); }
      .cs-hover-tip-value { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-weight: 600; }
      @keyframes cs-tip-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      @media (prefers-reduced-motion: reduce) {
        .cs-hover-tip { animation: none; transition: none; }
      }
      .cs-settings-title { margin: 0; font-size: 18px; line-height: 24px; font-weight: 650; }
      .cs-settings-hint { margin: 4px 0 0; font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
      .cs-settings-group { display: flex; flex-direction: column; gap: 2px; }
      .cs-settings-group > h3 { margin: 0 0 6px; font-size: 12px; font-weight: 650; letter-spacing: .04em; color: var(--dsw-alias-label-secondary); }
      .cs-settings-row {
        display: grid; grid-template-columns: minmax(150px, 235px) minmax(0, 1fr);
        gap: 14px; align-items: center; padding: 8px 0;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
      }
      .cs-settings-label { font-size: 12.5px; line-height: 18px; font-weight: 600; }
      .cs-settings-row-hint { margin: 2px 0 0; font-size: 11.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
      .cs-settings-control { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .cs-settings-control input[type="number"] {
        appearance: none; font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 8px;
        color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1); min-width: 96px;
      }
      .cs-settings-control input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-settings-control .cs-settings-select .cs-select-btn { min-width: 72px; font-size: 12px; }
      .cs-settings-switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
      .cs-settings-switch input { width: 16px; height: 16px; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
      .cs-time-tools-settings { display: grid; gap: 12px 20px; }
      .cs-settings-tools-card { grid-column: 1 / -1; }
      .cs-settings-board .cs-time-tools-settings { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
      .cs-time-tools-settings section { min-width: 0; }
      .cs-time-tools-settings h3 { margin: 0 0 2px; font-size: 13px; font-weight: 650; }
      .cs-tools-settings-head { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 7px; }
      .cs-model-catalog-refresh {
        appearance: none; padding: 4px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
        background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer;
      }
      .cs-model-catalog-refresh:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); }
      .cs-model-catalog-refresh:disabled { opacity: .6; cursor: default; }
      .cs-model-catalog-refresh:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-analysis-model-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
      .cs-analysis-model-fields .cs-analysis-field { display: grid; gap: 4px; min-width: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cs-analysis-model-fields .cs-select-btn { min-width: 0; width: 100%; }
      .cs-analysis-model-settings .cs-settings-status { margin: 6px 0 0; overflow-wrap: anywhere; }
      .cs-analysis-model-settings .cs-settings-row-hint { overflow-wrap: anywhere; }
      .cs-timer-reminder-settings { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 12px; }
      .cs-settings-board .cs-timer-reminder-settings { border-top: 0; border-inline-start: 1px solid var(--dsw-alias-border-l1); padding: 0 0 0 16px; }
      .cs-timer-reminder-settings .cs-settings-switch { margin: 5px 0 2px; }
      @media (max-width: 620px) {
        .cs-settings-board .cs-time-tools-settings { grid-template-columns: minmax(0, 1fr); }
        .cs-settings-board .cs-timer-reminder-settings { border: 0; border-top: 1px solid var(--dsw-alias-border-l1); padding: 12px 0 0; }
      }
      /* Dashboard 设置：12 列双栏板。统计与数字格式在上，外观/初始化/通知/数据交错排布，
         宽屏利用横向空间，窄屏自动回到单列；同一排的卡片撑满行高，底边与侧边保持齐平。 */
      .cs-settings-board .cs-settings-grid {
        grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; align-items: stretch;
      }
      .cs-settings-board .cs-settings-card { padding: 17px 18px; align-self: stretch; }
      .cs-settings-main { grid-column: span 7; }
      .cs-settings-side { grid-column: span 5; }
      .cs-settings-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
      .cs-settings-card-head h3 { margin: 0; font-size: 13px; line-height: 19px; font-weight: 650; }
      .cs-settings-card-sub { margin: 2px 0 0; font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-settings-feedback { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; max-width: 45%; text-align: right; }
      .cs-settings-feedback .cs-settings-status { font-size: 11px; }
      .cs-settings-scope {
        flex: none; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1);
        color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; letter-spacing: .02em;
      }
      .cs-settings-list { display: flex; flex-direction: column; margin-top: 6px; }
      .cs-settings-list .cs-settings-row:last-child { border-bottom: 0; padding-bottom: 1px; }
      .cs-settings-sections { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
      .cs-settings-sections h4 { margin: 0 0 5px; font-size: 11px; line-height: 18px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
      .cs-settings-sections .cs-settings-row { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; min-height: 42px; padding: 5px 0; }
      .cs-settings-sections .cs-settings-label { display: flex; align-items: center; gap: 5px; font-size: 12px; }
      .cs-settings-sections .cs-info-tip { font-size: 13px; line-height: 1.65; }
      .cs-settings-sections .cs-settings-control { justify-content: flex-end; gap: 4px; }
      .cs-settings-sections .cs-settings-select .cs-select-btn { min-width: 88px; }
      .cs-settings-sections .cs-settings-switch { font-size: 11px; gap: 5px; }
      .cs-settings-sections .cs-settings-row:last-child { border-bottom: 0; }
      .cs-settings-board .cs-format-card { align-self: stretch; }
      /* 统计与显示：说明入口默认收起，悬停或键盘聚焦该行才出现，避免一排重复的感叹号。 */
      .cs-row-info {
        display: inline-flex; margin-left: 5px; vertical-align: middle;
        opacity: 0; transition: opacity 140ms ease;
      }
      /* 缩放只放在按钮上：包装层一旦有 transform，固定定位的提示会以它为包含块而跳位。 */
      .cs-row-info .cs-info > button { transform: translateY(1px) scale(.92); transition: transform 140ms ease; }
      .cs-settings-row:hover .cs-row-info,
      .cs-settings-row:focus-within .cs-row-info { opacity: 1; }
      .cs-settings-row:hover .cs-row-info .cs-info > button,
      .cs-settings-row:focus-within .cs-row-info .cs-info > button { transform: none; }
      @media (hover: none) { .cs-row-info { opacity: 1; } .cs-row-info .cs-info > button { transform: none; } }
      /* 分析模型在设置板里不再拉满整行：两个下拉各自封顶，和上方统计行保持同一密度。 */
      .cs-settings-board .cs-analysis-model-fields { grid-template-columns: repeat(2, minmax(0, 230px)); justify-content: start; }
      .cs-settings-board .cs-format-card .cs-format-section {
        display: flex; flex: 1 1 auto; flex-direction: column; height: 100%;
      }
      /* 与左侧统计卡同高时，六档排成两列三行，竖向居中。 */
      @media (min-width: 1101px) {
        .cs-settings-board .cs-format-grid {
          display: grid; flex: 1 1 auto; grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px; align-content: center;
        }
        .cs-settings-board .cs-format-opt {
          flex: none; min-height: 32px; justify-content: flex-start; padding: 5px 9px;
        }
      }
      .cs-format-live { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: 10px; padding: 10px 0; border-top: 1px solid var(--dsw-alias-border-l1); margin-top: 10px; }
      .cs-data-danger { padding-top: 12px; margin-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .cs-format-live-value, .cs-format-sidebar { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; min-width: 0; }
      .cs-format-sidebar { align-items: flex-end; }
      .cs-format-live-value > span, .cs-format-sidebar > span:first-child { font-size: 11px; color: var(--dsw-alias-label-secondary); flex: none; }
      .cs-format-live-value b { font: 600 20px/1.4 ui-monospace, Consolas, monospace; }
      .cs-format-sidebar > .dsh-timespan-nav-entry { width: auto; min-width: 120px; max-width: 220px; padding: 4px 8px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); }
      .cs-format-shared {
        margin: auto 0 0; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1);
        font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary);
      }
      /* 最底一排两张卡共享行高，底边保持齐平；内容多的数据管理决定这一排的高度。 */
      .cs-settings-board .cs-notices-card,
      .cs-settings-board .cs-data-card { align-self: stretch; }
      /* 初始化设置与左侧外观卡同高：卡片撑满整行，按钮组沉到卡片底部。 */
      .cs-settings-board .cs-settings-reset-card { align-self: stretch; }
      .cs-settings-board .cs-settings-reset-card > :last-child { margin-top: auto; }
      .cs-appearance-panel {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;
        padding-top: 8px;
      }
      .cs-appearance-group { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .cs-appearance-options, .cs-palette-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
      .cs-appearance-group:has(.cs-palette-options) { container: cs-palette-options / inline-size; }
      .cs-palette-options { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      @container cs-palette-options (max-width: 280px) { .cs-palette-options { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      .cs-appearance-opt, .cs-palette-opt {
        position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 5px;
        padding: 7px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px;
        background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
        transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
      }
      .cs-appearance-opt:hover, .cs-palette-opt:hover { border-color: var(--dsw-alias-label-secondary); }
      .cs-appearance-opt:active, .cs-palette-opt:active { transform: scale(.985); }
      .cs-appearance-opt:focus-visible, .cs-palette-opt:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-appearance-opt.is-on, .cs-palette-opt.is-on {
        border-color: var(--dsw-alias-brand-primary);
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent);
      }
      .cs-appearance-preview {
        display: flex; gap: 4px; width: 100%; height: 28px; padding: 4px; border-radius: 6px;
        border: 1px solid var(--dsw-alias-border-l1); background: #f4f6f8; color: #48525c; overflow: hidden;
      }
      .cs-appearance-preview-side { display: block; width: 12px; height: 100%; border-radius: 3px; background: currentColor; opacity: .18; flex: none; }
      .cs-appearance-preview-body { display: flex; flex: 1 1 auto; flex-direction: column; justify-content: center; gap: 4px; min-width: 0; }
      .cs-appearance-preview-body i { display: block; width: 72%; height: 3px; border-radius: 2px; background: currentColor; opacity: .58; }
      .cs-appearance-preview-body i:last-child { width: 46%; opacity: .3; }
      .cs-appearance-opt-dark .cs-appearance-preview { background: #1b1c1f; color: #c7cdd4; border-color: #34363a; }
      .cs-appearance-opt-system .cs-appearance-preview { background: linear-gradient(135deg, #f4f6f8 0 49.5%, #1b1c1f 50% 100%); color: #7e8791; }
      .cs-appearance-opt-name, .cs-palette-opt-name { font-size: 11.5px; line-height: 16px; font-weight: 600; }
      .cs-appearance-check {
        position: absolute; top: 6px; right: 7px; display: grid; place-items: center;
        width: 14px; height: 14px; border-radius: 50%; background: var(--dsw-alias-brand-primary);
        color: #fff; font-size: 9px; line-height: 1;
      }
      .cs-palette-preview { display: flex; gap: 4px; width: 100%; }
      .cs-palette-preview i { display: block; flex: 1 1 0; height: 28px; border-radius: 5px; background: var(--cs-swatch-1); }
      .cs-palette-preview i:nth-child(2) { background: var(--cs-swatch-2); }
      .cs-palette-preview i:nth-child(3) { background: var(--cs-swatch-3); }
      .cs-palette-opt.cs-palette-blue { --cs-swatch-1: #133463; --cs-swatch-2: #1F4E94; --cs-swatch-3: #79B3F9; }
      .cs-palette-opt.cs-palette-stone { --cs-swatch-1: #2b3033; --cs-swatch-2: #4a5155; --cs-swatch-3: #aeb6b9; }
      .cs-palette-opt.cs-palette-cyan { --cs-swatch-1: #0C4A52; --cs-swatch-2: #0E7490; --cs-swatch-3: #67E8F9; }
      .cs-palette-opt.cs-palette-coral { --cs-swatch-1: #7E291F; --cs-swatch-2: #FF5B3B; --cs-swatch-3: #FFBAA7; }
      @media (max-width: 1100px) {
        .cs-settings-board .cs-settings-grid { grid-template-columns: minmax(0, 1fr); }
        .cs-settings-main, .cs-settings-side { grid-column: 1 / -1; }
      }
      @media (max-width: 760px) {
        .cs-appearance-panel, .cs-settings-sections { grid-template-columns: 1fr; }
      }
      /* 数字格式：五档压成一条横向选项条，标题右侧只留一枚实时预览。 */
      .cs-format-section { gap: 0; }
      .cs-format-head {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 8px 10px; flex-wrap: wrap; margin-bottom: 7px;
      }
      .cs-format-heading { min-width: 0; }
      .cs-format-heading > h3 {
        margin: 0 0 2px; font-size: 13px; line-height: 19px; font-weight: 650;
        color: var(--dsw-alias-label-primary);
      }
      .cs-format-preview {
        display: inline-flex; align-items: baseline; gap: 6px; flex: none;
        padding: 2px 8px; border-radius: 999px;
        background: var(--dsw-alias-bg-layer-2);
      }
      .cs-format-preview span { font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .cs-format-preview b {
        font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-variant-numeric: tabular-nums; font-size: 11.5px; line-height: 17px;
      }
      .cs-format-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      .cs-format-opt {
        display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        min-width: 0; min-height: 34px; padding: 5px 7px; flex-wrap: wrap;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
        background: transparent; color: inherit; font: inherit; cursor: pointer;
        transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
      }
      .cs-format-opt:hover:not(:disabled) { border-color: var(--dsw-alias-label-secondary); }
      .cs-format-opt:active:not(:disabled) { transform: scale(.97); }
      .cs-format-opt:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-format-opt.is-on { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-2); }
      .cs-format-opt:disabled { opacity: .55; cursor: default; }
      .cs-format-opt b {
        font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-variant-numeric: tabular-nums; font-size: 11px; font-weight: 600; white-space: nowrap;
      }
      .cs-format-divider {
        display: block; width: 1px; height: 11px; flex: 0 0 1px;
        background: color-mix(in srgb, var(--dsw-alias-label-secondary) 42%, transparent);
      }
      .cs-format-opt span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cs-format-preview-value { display: inline-block; animation: cs-format-time-swap 160ms ease-out both; }
      @keyframes cs-format-time-swap {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-format-preview-value { animation: none !important; }
      }
      @media (max-width: 620px) {
        .cs-format-head { align-items: flex-start; flex-direction: column; gap: 6px; }
        .cs-format-opt { flex-basis: calc(50% - 3px); }
      }
      /* 初始化设置：默认状态只用文案说明，展开后才出现二次确认。 */
      .cs-settings-reset-group { gap: 6px; }
      .cs-settings-reset-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
      .cs-settings-reset-confirm {
        margin-top: 8px; padding: 12px 14px; border-radius: 9px;
        border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1));
        background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, var(--dsw-alias-bg-layer-1));
      }
      .cs-settings-reset-confirm strong { display: block; margin-bottom: 4px; font-size: 13px; }
      .cs-settings-reset-confirm p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
      /* 保存按钮组与上方内容拉开留白；独立挂载的设置页也统一 30–32px 按钮高度。 */
      .cs-settings-footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 12px; }
      .cs-btn { min-height: 30px; padding: 5px 12px; }
      .cs-btn.is-icon { display: inline-flex; align-items: center; gap: 6px; }
      .cs-reset-icon { flex: none; display: block; }
      .cs-settings-status { font-size: 12px; color: var(--dsw-alias-brand-primary); }
      .cs-settings-status.is-error { color: var(--dsw-alias-state-error-primary); }
      /* 通知记录：已读后仍可回看；样式只做最小列表，不改变设置页版式。 */
      .cs-notice-list { display: flex; flex-direction: column; }
      .cs-notice-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .cs-notice-item:last-child { border-bottom: 0; }
      .cs-notice-dot { width: 7px; height: 7px; margin-top: 7px; border-radius: 50%; background: var(--dsw-alias-brand-primary); flex: none; }
      .cs-notice-body { min-width: 0; flex: 1 1 auto; }
      .cs-notice-title { font-size: 13px; font-weight: 600; }
      .cs-notice-desc { margin: 2px 0 0; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
      .cs-notice-tag { flex: none; font-size: 11px; line-height: 18px; padding: 0 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
      .cs-notice-tag.is-unread { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, var(--dsw-alias-border-l1)); }
      .cs-notice-empty { margin: 0; padding: 10px 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
      @media (max-width: 620px) {
        .cs-settings-row { grid-template-columns: 1fr; gap: 6px; }
        .cs-settings-list.is-split { grid-template-columns: 1fr; }
        .cs-settings-list.is-split .cs-settings-row:last-child { grid-column: auto; }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-settings *, .cs-settings *::before, .cs-settings *::after { transition-duration: 0s; animation-duration: 0s; }
        .cs-page .cs-bar-group:is(.is-hot, :hover, :focus-visible) .cs-bar-pair { transform: none; }
      }
    `

    /** 测试出口：主页面样式串，后续票据复用同一份设计 token。 */
    function dshTimespanCss() {
      return DSH_TIMESPAN_CSS
    }

    /** 测试出口：侧栏入口的独立主题作用域样式串。 */
    function dshTimespanSidebarCss() {
      return DSH_TIMESPAN_SIDEBAR_CSS
    }

    return {
      inject: ['connection', 'slots', 'locale'],
      apply(ctx) {
        // 两套字典仍登记到宿主 locale 命名空间：点位上的 locale: NS 指向它，
        // 宿主侧任何按命名空间取文案的入口都拿得到同一份字符串。
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-timespan: dictionaries')
        // 插件界面语言由自己的设置项决定（默认中文），不跟随宿主 locale：
        // 这里用本地的 translate，切换后由 languageListeners 通知各点位重渲染。
        const t = translate

        // 活跃采集不依赖侧边栏入口是否固定；放在始终挂载的 frame-wide overlay。
        const timerClient = createTimerClient(ctx)
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-timespan-presence',
            },
            createPresenceReporter(ctx, timerClient),
          ),
        )

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'dsh-timespan',
              order: 20,
              label: () => t('title'),
              locale: NS,
            },
            createSidebarEntry(ctx, t),
          ),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'dsh-timespan',
              locale: NS,
              inject: () => ({ t }),
            },
            createPage(ctx, timerClient),
          ),
        )

        // 设置页挂在 DSH 的 settings.section 上：设置只经 Host 公共操作
        // getSettings / setSettings 读写，页面不落任何业务状态副本。
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'dsh-timespan',
              order: 40,
              label: () => t('settingsNav'),
              locale: NS,
              inject: () => ({ t }),
            },
            createSettingsSection(ctx),
          ),
        )
      },
    }
  },
})
