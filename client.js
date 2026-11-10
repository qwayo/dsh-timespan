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
    /** 三套配色；blue 为默认。旧值（mono/green/warm）一律回落到 blue。 */
    const PALETTES = ['blue', 'stone', 'clay']
    /** 外观三态按用户确认的顺序循环：浅色 → 深色 → 跟随系统。 */
    const APPEARANCE_ORDER = ['light', 'dark', 'system']
    /** 数字格式五档；顺序与原型 FORMATS 一致，也是设置页卡片的展示顺序。 */
    const DURATION_FORMAT_ORDER = ['hms', 'short', 'zh', 'sec', 'padded']
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
    /** 回填进行时加快轮询，让进度与完成后的数字尽快出现，无需刷新页面。 */
    const BACKFILL_REFRESH_MS = 2_000
    /** 四个同级视图；tab 顺序即键盘左右方向键的顺序。 */
    const VIEWS = ['overview', 'trend', 'details', 'settings']
    /** 视图入场 300ms、退场 180ms（进入的 60%）；减少动效时直接到位。 */
    const VIEW_ENTER_MS = 300
    const VIEW_EXIT_MS = 180
    /** 首屏放大态：只认三种区块，状态持久化在浏览器本地设置，供 #14/#15 共用。 */
    const FOCUS_KEY = 'dsh-timespan.focus'
    const FOCUS_VALUES = ['hero', 'trend', 'heatmap']
    const FOCUS_TRANSITION_MS = 240
    /** 条状图首屏的 SVG 视图高度；柱高与网格按它重新计算，而不是拉伸普通卡片。 */
    const TREND_FOCUS_HEIGHT = 360
    /** 首屏主指标：五个可切换的时长项，持久化在浏览器本地设置；非法值回落今日活跃时长。 */
    const HERO_METRIC_KEY = 'dsh-timespan.heroMetric'
    const HERO_METRIC_VALUES = ['active', 'online', 'task', 'week', 'month']
    const HERO_METRIC_DEFAULT = 'active'
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
      activeShare: '活跃占比',
      focusSummary: '首屏概览',
      focusTodayActive: '今日活跃',
      focusWeekActive: '本周活跃',
      focusMonthActive: '本月活跃',
      heroMetricWeekTitle: '本周活跃时长',
      heroMetricMonthTitle: '本月活跃时长',
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
      paletteToggle: '配色：{name}，点击循环 {order}',
      appearanceLabel: '外观',
      appearanceLight: '浅色',
      appearanceDark: '深色',
      appearanceSystem: '跟随系统',
      appearanceToggle: '外观：{mode}，点击切换',
      currentPeriod: '当前周期',
      selectedPeriod: '当前',
      tabOverview: '概览',
      tabTrend: '趋势',
      tabDetails: '明细',
      tabSettings: '设置',
      tabsLabel: 'TimeSpan 页面',
      recentSessions: '最近会话',
      recentSessionsHint: '按最近活动时间排序',
      recentSessionsEmpty: '当前周期还没有会话记录',
      trendSummary: '本周期概览',
      peakActive: '峰值活跃',
      peakPeriod: '最活跃时段',
      trendBreakdownTitle: '时段分布',
      trendBreakdownHint: '按活跃与任务合计排序，只展示最忙的 7 个时段。',
      trendBreakdownEmpty: '暂无时段数据',
      trendInsightsTitle: '趋势洞察',
      trendInsightsHint: '本周期峰值、活跃覆盖和前三集中度。',
      trendInsightPeak: '峰值时段',
      trendInsightCoverage: '活跃覆盖',
      trendInsightConcentration: '前三集中度',
      trendInsightTaskRatio: '任务/在线',
      trendInsightNote: '前三集中度按活跃时长最高的三个时段计算。',
      trendFocusTitle: '活跃与任务趋势',
      heatmapFocusTitle: '每日活跃热力图',
      rangeOnline: '范围在线',
      rangeActive: '范围活跃',
      rangeTask: '范围任务',
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
      trendInfo: '活跃时长和任务时长分别统计，可能重叠；悬停柱形可查看数值。',
      heatmapTitle: '每日活跃',
      heatmapInfo: '每格一天，颜色越深活跃越长；悬停可看当天在线、活跃与任务时长。',
      heatLegendLow: '低',
      heatLegendHigh: '高',
      heatDayTitle: '{month}月{day}日',
      noRecord: '无记录',
      heatSummary: '范围活跃 {active} · 活跃天数 {activeDays}/{observedDays}',
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
      compositionInfo: '任务时长按会话累计；缺少构成记录的历史任务计入「未拆分」。',
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
      dailyAverageHint: '日均：按自然日折算。',
      recordSinceBoot: '在线和活跃从插件启用时开始记录，历史数据只回填任务时长。',
      paletteBlue: '蓝',
      paletteStone: '石墨',
      paletteClay: '赤陶',
      paletteSaveError: '外观设置未能保存，刷新后可能恢复默认',
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
      settingsIdleHint: '页面可见且聚焦时，最后一次操作超过这个时长就不再计入活跃时长。',
      settingsIdleUnit: '分钟',
      settingsIdleRange: '可选 1–15 分钟',
      settingsWeekLabel: '每周起始',
      settingsWeekHint: '决定「本周」与周趋势桶的起止边界。',
      settingsWeekMonday: '周一',
      settingsWeekSunday: '周日',
      settingsSubagentLabel: '显示子代理明细',
      settingsSubagentHint: '关闭后父会话下不再列出子代理任务；总计口径不受影响。',
      settingsSubagentOn: '显示',
      settingsSubagentOff: '隐藏',
      settingsSidebarNameLabel: '侧栏显示状态',
      settingsSidebarNameHint: '开启后侧栏入口在时长旁显示状态文字：空闲、活跃中或任务中；关闭后只保留时长、状态点与今日构成环。',
      settingsSidebarNameOn: '显示状态',
      settingsSidebarNameOff: '隐藏状态',
      settingsSidebarDotLabel: '侧栏状态点',
      settingsSidebarDotHint: '控制侧栏入口右侧的小圆点是否显示；它用颜色表示空闲、活跃中或任务中。',
      settingsSidebarDotOn: '显示',
      settingsSidebarDotOff: '隐藏',
      settingsSidebarDotPositionLabel: '状态点位置',
      settingsSidebarDotPositionHint: '默认「跟随时长」；选择「最右侧」会贴住侧栏行末。',
      settingsSidebarDotPositionEnd: '最右侧',
      settingsSidebarDotPositionInline: '跟随时长',
      settingsSidebarDurationLabel: '侧栏显示时长',
      settingsSidebarDurationHint: '选择侧栏入口常驻展示的时长类型；今日构成环仍按在线、活跃、任务三项显示。',
      sidebarDurationOnline: '在线时长',
      sidebarDurationActive: '活跃时长',
      sidebarDurationTask: '任务时长',
      settingsLanguageLabel: '界面语言',
      settingsLanguageHint: '只影响 TimeSpan 自己的文案，不改变 DSH 界面语言；默认中文。',
      settingsSave: '保存设置',
      settingsSaving: '正在保存…',
      settingsSaved: '已保存，统计已按新设置更新',
      settingsLoadError: '无法读取设置，请重试',
      settingsRetry: '重试',
      settingsSaveError: '设置保存失败，请重试',
      settingsSectionGeneral: '统计口径',
      settingsSectionDisplay: '明细展示',
      settingsSectionBasics: '统计与显示',
      settingsBasicsHint: '统计口径、明细展示与侧栏入口，改动会立即生效。',
      settingsSectionFormat: '数字格式',
      settingsFormatHint: '选择后整页立即预览并自动保存，刷新后沿用已保存的格式。',
      settingsFormatShared: '侧栏、概览、趋势、明细与导出共用这一格式。',
      formatHintHms: '时:分:秒',
      formatHintShort: '紧凑单位',
      formatHintZh: '中文单位',
      formatHintSec: '纯秒',
      formatHintPadded: '补零时钟',
      formatPreviewLabel: '预览 · 2:48:16 显示为',
      settingsResetTitle: '初始化设置',
      settingsResetHint: '把界面语言、侧栏状态显示、状态点显示与位置、显示时长、数字格式、外观配色与统计偏好恢复为首次安装时的默认值；不会删除任何统计数据。',
      settingsResetButton: '恢复初始设置',
      settingsResetConfirmTitle: '恢复初始设置？',
      settingsResetConfirmHint: '界面语言、侧栏状态显示、状态点显示与位置、侧栏显示时长、数字格式、外观配色、空闲阈值、周起始与子代理显示都会回到默认值；统计记录不受影响。',
      settingsResetConfirm: '确认恢复',
      settingsResetCancel: '取消',
      settingsResetDone: '已恢复初始设置',
      settingsResetError: '恢复初始设置失败，请重试',
      settingsSectionNotices: '通知记录',
      settingsNoticesHint: '这里保留每次历史任务回填的完成记录；如果旧会话任务没有出现，可重新扫描一次。',
      dataTitle: '数据管理',
      dataHint: '导出包含原始区间、任务与设置；清空只删除 dsh-timespan 统计记录，不影响会话日志。',
      exportJson: '导出 JSON',
      exportCsv: '导出 CSV',
      exporting: '正在导出…',
      exportDone: '导出文件已开始下载',
      exportTruncated: '导出文件已开始下载；数据跨度超过上限，仅包含最近的部分',
      exportError: '导出失败，请重试',
      clearData: '清空全部数据',
      clearStepTitle: '确认清空？',
      clearStepHint: '这会删除本机全部 dsh-timespan 在线、活跃与任务记录，且无法撤销；会话日志不受影响，设置会保留。',
      clearConfirm: '确认清空',
      clearCancel: '取消',
      clearing: '正在清空…',
      clearError: '清空失败，请重试',
      cleared: '已清空，统计已重置',
      approximateDismiss: '不再显示',
      approximateShowAgain: '重新显示「近似记录」说明',
      approximateShowAgainHint: '该说明只在存在近似记录时出现；之前关掉后，可用这里恢复显示。',
      approximateShowRestored: '已重新开启近似记录说明',
      approximateShowNoData: '已重新开启；当前没有近似记录，所以提示条暂时不会出现',
      approximateShowError: '操作失败，请稍后重试',
      savedBadge: '已保存',
      importData: '选择备份文件导入',
      importHint: '仅支持此前导出的 JSON 备份；按 ID 去重合并，已有记录不会被覆盖。',
      importInvalid: '这不是有效的 dsh-timespan 备份（需要 format 为 dsh-timespan-export 或 chronoscope-export 且 version 为 1）。',
      importPreviewTitle: '待导入文件',
      importIntervals: '时间区间',
      importTasks: '任务',
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
      activeShare: 'Active share',
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
      paletteToggle: 'Colors: {name}; click to cycle {order}',
      appearanceLabel: 'Appearance',
      appearanceLight: 'Light',
      appearanceDark: 'Dark',
      appearanceSystem: 'System',
      appearanceToggle: 'Appearance: {mode}; click to cycle',
      currentPeriod: 'Current period',
      selectedPeriod: 'Current',
      tabOverview: 'Overview',
      tabTrend: 'Trend',
      tabDetails: 'Details',
      tabSettings: 'Settings',
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
      trendInsightsHint: 'Peak, active coverage and top-3 concentration for this period.',
      trendInsightPeak: 'Peak period',
      trendInsightCoverage: 'Active coverage',
      trendInsightConcentration: 'Top-3 concentration',
      trendInsightTaskRatio: 'Task / online',
      trendInsightNote: 'Top-3 concentration is computed from the three buckets with the most active time.',
      trendFocusTitle: 'Active and task trend',
      heatmapFocusTitle: 'Daily activity heatmap',
      rangeOnline: 'Online in range',
      rangeActive: 'Active in range',
      rangeTask: 'Task in range',
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
      trendInfo: 'Active and task time are measured separately and may overlap. Hover a bar for its value.',
      heatmapTitle: 'Daily active time',
      heatmapInfo: 'One cell per day; darker means more active time. Hover for that day’s details.',
      heatLegendLow: 'Less',
      heatLegendHigh: 'More',
      heatDayTitle: '{month} {day}',
      noRecord: 'No record',
      heatSummary: 'Active in range {active} · Active days {activeDays}/{observedDays}',
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
      compositionInfo: 'Task time is summed across sessions. Historical tasks without a breakdown are counted as not broken down.',
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
      dailyAverageHint: 'Daily average: calculated across calendar days.',
      recordSinceBoot: 'Online and active time are recorded from plugin enablement; history only backfills task time.',
      paletteBlue: 'Blue',
      paletteStone: 'Graphite',
      paletteClay: 'Terracotta',
      paletteSaveError: 'Appearance preference could not be saved',
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
      settingsIdleHint: 'While visible and focused, activity stops counting once the last input is older than this.',
      settingsIdleUnit: 'min',
      settingsIdleRange: '1–15 minutes',
      settingsWeekLabel: 'Week starts on',
      settingsWeekHint: 'Sets the boundary of "this week" and its trend buckets.',
      settingsWeekMonday: 'Monday',
      settingsWeekSunday: 'Sunday',
      settingsSubagentLabel: 'Show subagent detail',
      settingsSubagentHint: 'Hides subagent tasks under parent sessions when off; totals are unaffected.',
      settingsSubagentOn: 'Shown',
      settingsSubagentOff: 'Hidden',
      settingsSidebarNameLabel: 'Show sidebar status',
      settingsSidebarNameHint: 'When on, the sidebar entry shows the current status next to the duration: Idle, Active or In task; when off, it keeps only the duration, status dot and today ring.',
      settingsSidebarNameOn: 'Show status',
      settingsSidebarNameOff: 'Hide status',
      settingsSidebarDotLabel: 'Sidebar status dot',
      settingsSidebarDotHint: 'Shows or hides the small dot at the end of the sidebar entry; its color means idle, active or in task.',
      settingsSidebarDotOn: 'Shown',
      settingsSidebarDotOff: 'Hidden',
      settingsSidebarDotPositionLabel: 'Status dot position',
      settingsSidebarDotPositionHint: 'Defaults to "After duration"; choose "Far right" to pin it to the row end.',
      settingsSidebarDotPositionEnd: 'Far right',
      settingsSidebarDotPositionInline: 'After duration',
      settingsSidebarDurationLabel: 'Sidebar duration',
      settingsSidebarDurationHint: 'Choose which duration the sidebar entry shows. The today ring still shows online, active and task.',
      sidebarDurationOnline: 'Online',
      sidebarDurationActive: 'Active',
      sidebarDurationTask: 'Task',
      settingsLanguageLabel: 'Interface language',
      settingsLanguageHint: 'Changes TimeSpan wording only; the DSH interface language is untouched. Defaults to Chinese.',
      settingsSave: 'Save settings',
      settingsSaving: 'Saving…',
      settingsSaved: 'Saved; statistics now use the new settings',
      settingsLoadError: 'Unable to read settings; please retry',
      settingsRetry: 'Retry',
      settingsSaveError: 'Could not save settings; please retry',
      settingsSectionGeneral: 'Counting rules',
      settingsSectionDisplay: 'Detail display',
      settingsSectionBasics: 'Counting and display',
      settingsBasicsHint: 'Counting rules, detail display and the sidebar entry; changes apply immediately.',
      settingsSectionFormat: 'Number format',
      settingsFormatHint: 'The whole page previews immediately and the choice is saved automatically; the saved format survives refresh.',
      settingsFormatShared: 'The sidebar, overview, trend, details and exports all use this format.',
      formatHintHms: 'Hours:minutes:seconds',
      formatHintShort: 'Compact units',
      formatHintZh: 'Chinese units',
      formatHintSec: 'Total seconds',
      formatHintPadded: 'Padded clock',
      formatPreviewLabel: 'Preview · 2:48:16 shows as',
      settingsResetTitle: 'Initial settings',
      settingsResetHint: 'Restore interface language, the sidebar status display, status dot visibility and position, duration, number format, colors and counting preferences to their first-install defaults. Statistics are never deleted.',
      settingsResetButton: 'Restore initial settings',
      settingsResetConfirmTitle: 'Restore initial settings?',
      settingsResetConfirmHint: 'Interface language, sidebar status display, status dot visibility and position, sidebar duration, number format, colors, idle threshold, week start and subagent display return to defaults. Statistics are unaffected.',
      settingsResetConfirm: 'Restore',
      settingsResetCancel: 'Cancel',
      settingsResetDone: 'Initial settings restored',
      settingsResetError: 'Could not restore initial settings; please retry',
      settingsSectionNotices: 'Notifications',
      settingsNoticesHint: 'Keeps a record of each history-task backfill. If old session tasks are missing, rescan once.',
      dataTitle: 'Data',
      dataHint: 'Exports include raw intervals, tasks and settings; clearing removes only dsh-timespan records, not session logs.',
      exportJson: 'Export JSON',
      exportCsv: 'Export CSV',
      exporting: 'Exporting…',
      exportDone: 'Download started',
      exportTruncated: 'Download started; the range exceeds the limit and only the most recent part is included',
      exportError: 'Export failed; please retry',
      clearData: 'Clear all data',
      clearStepTitle: 'Clear everything?',
      clearStepHint: 'This deletes all local dsh-timespan online, active and task records and cannot be undone. Session logs are untouched and settings are kept.',
      clearConfirm: 'Confirm clear',
      clearCancel: 'Cancel',
      clearing: 'Clearing…',
      clearError: 'Clear failed; please retry',
      cleared: 'Cleared; statistics have been reset',
      approximateDismiss: 'Dismiss',
      approximateShowAgain: 'Show the “approximate records” note again',
      approximateShowAgainHint: 'The note only appears when approximate records exist; restore it here after dismissing.',
      approximateShowRestored: 'The approximate-record note is enabled again',
      approximateShowNoData: 'Enabled again; there are no approximate records, so the banner will not appear yet',
      approximateShowError: 'Could not update the setting; please retry',
      savedBadge: 'Saved',
      importData: 'Choose backup file to import',
      importHint: 'Only JSON backups exported earlier; merged by ID, existing records are never overwritten.',
      importInvalid: 'This is not a valid dsh-timespan backup (format must be dsh-timespan-export or chronoscope-export and version must be 1).',
      importPreviewTitle: 'File to import',
      importIntervals: 'Intervals',
      importTasks: 'Tasks',
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
      h('circle', { cx: 12, cy: 12, r: 8.5, stroke: 'currentColor', strokeWidth: 2.2,
        strokeLinecap: 'round', strokeDasharray: '11 3 7 3 5 3', transform: 'rotate(-90 12 12)' }),
      // 圆环底部那一小段是任务紫；指针与轴心保持白色，避免把轴心误当成独立的状态点。
      h('path', { d: 'M14.66 20.07 A8.5 8.5 0 0 1 9.73 20.19', stroke: 'var(--cs-task, #7A5AA6)',
        strokeWidth: 2.2, strokeLinecap: 'round', fill: 'none' }),
      h('path', { d: 'M12 12l4-4', stroke: '#ffffff', strokeWidth: 2, strokeLinecap: 'round' }),
      h('circle', { cx: 12, cy: 12, r: 1.8, fill: '#ffffff' }))
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

    /** 顶栏配色图标：外围白色圆环、中心当前套信号色圆点，像一枚小巧的色卡。 */
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
          fill: 'var(--cs-signal)', stroke: 'none',
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
        return h('svg', common, h('circle', { cx: 8, cy: 8, r: 3.3, fill: 'currentColor', stroke: 'none' }))
      }
      if (name === 'task') {
        return h('svg', common,
          h('rect', { x: 2.3, y: 2.3, width: 11.4, height: 11.4, rx: 2.6 }),
          h('path', { d: 'M5.2 8.2l1.8 1.8 3.8-4' }))
      }
      if (name === 'count') {
        return h('svg', common,
          h('path', { d: 'M3 5.2h10M3 8h10M3 10.8h6.4' }),
          h('circle', { cx: 12.2, cy: 10.8, r: 1.1, fill: 'currentColor', stroke: 'none' }))
      }
      if (name === 'clock') {
        return h('svg', common,
          h('circle', { cx: 8, cy: 8, r: 5.5 }),
          h('path', { d: 'M8 4.7V8l2.2 1.4' }))
      }
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
        case 'hms':
        default:
          return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
      }
    }

    /** 数字格式只认五种预设；旧响应、脏草稿与非法值一律回落紧凑单位。 */
    function normalizeDurationFormat(value) {
      return typeof value === 'string' && DURATION_FORMAT_ORDER.includes(value) ? value : DEFAULT_DURATION_FORMAT
    }

    function durationFormatHintKey(format) {
      if (format === 'short') return 'formatHintShort'
      if (format === 'zh') return 'formatHintZh'
      if (format === 'sec') return 'formatHintSec'
      if (format === 'padded') return 'formatHintPadded'
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

    /** 配色只认 blue / stone / clay；旧 localStorage 里的 mono/green/warm 等值回落到默认蓝。 */
    function normalizePalette(value) {
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
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('dsh-timespan.palette', 'blue')
          window.localStorage.setItem('dsh-timespan.appearance', 'system')
        }
      } catch {
        // 隐私模式下写不进去时仍广播，让当前页面按内存值回到默认视觉。
      }
      notifyThemeChanged()
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
      throw new Error(message)
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
     * 让它们清掉预览、重新向 Host 取权威设置。
     */
    const durationFormatPreviewListeners = new Set()
    function subscribeDurationFormatPreview(listener) {
      durationFormatPreviewListeners.add(listener)
      return () => durationFormatPreviewListeners.delete(listener)
    }
    function notifyDurationFormatPreview(value) {
      const format = normalizeDurationFormat(value)
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
      const panelActive = useStandardValue(
        props?.usePanelInfo,
        (info) => info !== null && typeof info === 'object' && info.activePanelId !== null && info.activePanelId !== undefined,
        false,
      )
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
    }

    /**
     * 今日三项时长的迷你构成环：按在线、活跃、任务三项之和归一化。
     * 颜色全部来自入口自己的插件主题变量，不使用任务构成色。
     */
    function sidebarRingSegments(stats) {
      const values = [
        { key: 'online', color: '--cs-signal-soft', ms: Math.max(0, finite(stats?.onlineMs)) },
        { key: 'active', color: '--cs-live', ms: Math.max(0, finite(stats?.activeMs)) },
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

    /** 用 SVG 画标准圆环；pathLength=100 让三段弧长直接按百分比分配。 */
    function renderSidebarRing(segments) {
      const visible = segments.filter((segment) => segment.ms > 0)
      const gap = visible.length > 1 ? 1.4 : 0
      return h('span', { className: 'dsh-timespan-nav-ring', 'aria-hidden': true },
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
              className: `dsh-timespan-nav-ring-seg is-${segment.key}`,
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
        const [theme, setTheme] = React.useState(readStoredTheme)
        const [systemDark, setSystemDark] = React.useState(systemPrefersDark)
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

        // 仪表盘切换配色/外观、系统深浅变化时，入口重读同一份 localStorage。
        React.useEffect(() => {
          const sync = () => setTheme(readStoredTheme())
          const unsubscribe = subscribeThemeChanged(sync)
          let media = null
          const onSystemChange = () => {
            setSystemDark(systemPrefersDark())
            sync()
          }
          if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
            media = window.matchMedia('(prefers-color-scheme: dark)')
            if (typeof media.addEventListener === 'function') media.addEventListener('change', onSystemChange)
            else if (typeof media.addListener === 'function') media.addListener(onSystemChange)
          }
          return () => {
            unsubscribe()
            if (media === null) return
            if (typeof media.removeEventListener === 'function') media.removeEventListener('change', onSystemChange)
            else if (typeof media.removeListener === 'function') media.removeListener(onSystemChange)
          }
        }, [])

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
          theme: { ...theme, systemDark },
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

    /**
     * presence 心跳挂在 frame-wide overlay 上而不是侧边栏入口里：侧边栏入口
     * 被取消固定或折叠时组件可能卸载，但活跃采集必须随页面一直存在。
     */
    function createPresenceReporter(ctx) {
      return function DshTimespanPresenceReporter(props) {
        usePresenceReporter(props, ctx)
        return null
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

    function renderApproximateNotice(t, visible, { onDismiss } = {}) {
      if (!visible) return null
      return h('div', { className: 'cs-backfill cs-approx', role: 'status' },
        h('span', { className: 'cs-approx-label' }, t('approximateTag')),
        h('span', null, t('approximateNotice')),
        h('button', { type: 'button', className: 'cs-approx-dismiss', 'aria-label': t('approximateDismiss'), onClick: onDismiss }, '×'))
    }

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
      const [state, setState] = React.useState({ status: 'loading', data: null, receivedAt: 0 })
      const loadRef = React.useRef(null)
      React.useEffect(() => {
        if (!enabled) return undefined
        let active = true
        setState((previous) => ({ ...previous, status: 'loading' }))
        const load = async () => {
          try {
            const payload = { period, view }
            // 明细预设范围只传起点，终点由 Host 取当前时刻；「全部」的起点是 0。
            if (from !== null) payload.from = from
            const value = await callHost(ctx, 'queryStats', payload)
            if (!active) return
            // 语言随统计一起带回：仪表盘首屏不必等设置读接口。
            applyLanguage(value?.language)
            setState({ status: 'ready', data: normalizeDashboard(value), receivedAt: Date.now() })
          } catch {
            if (!active) return
            setState((previous) => previous.data !== null
              ? { ...previous, status: 'error' }
              : { status: 'error', data: null, receivedAt: 0 })
          }
        }
        loadRef.current = load
        return () => {
          active = false
          loadRef.current = null
        }
      }, [ctx, period, view, from, enabled])
      React.useEffect(() => {
        if (!enabled || typeof loadRef.current !== 'function') return undefined
        loadRef.current()
        const timer = setInterval(() => {
          if (typeof loadRef.current === 'function') loadRef.current()
        }, refreshMs)
        return () => clearInterval(timer)
      }, [ctx, period, view, from, refreshMs, refreshNonce, enabled])
      return state
    }

    /**
     * 每日热力图取数：范围由页面按本地日历计算，这里只调用 Host 的 queryDailySeries，
     * 不在客户端伪造任何日序列。刷新节拍复用页面轮询，切到其它视图时暂停。
     */
    function useDailySeries(ctx, range, refreshMs, refreshNonce, enabled = true) {
      const [state, setState] = React.useState({ status: 'loading', data: null })
      const loadRef = React.useRef(null)
      const from = Number(range?.from)
      const to = Number(range?.to)
      React.useEffect(() => {
        if (!enabled) return undefined
        let active = true
        // 范围切换时清空旧序列：新布局不能先套旧数据，否则月份/全年矩阵会短暂错位。
        setState({ status: 'loading', data: null })
        const load = async () => {
          try {
            const value = await callHost(ctx, 'queryDailySeries', { from, to })
            if (!active) return
            if (value === null || typeof value !== 'object' || !Array.isArray(value.days)) {
              throw new Error('queryDailySeries 返回结构非法')
            }
            setState({ status: 'ready', data: value })
          } catch {
            if (!active) return
            setState((previous) => previous.data !== null
              ? { ...previous, status: 'error' }
              : { status: 'error', data: null })
          }
        }
        loadRef.current = load
        return () => {
          active = false
          loadRef.current = null
        }
      }, [ctx, from, to, enabled])
      React.useEffect(() => {
        if (!enabled || typeof loadRef.current !== 'function') return undefined
        loadRef.current()
        const timer = setInterval(() => {
          if (typeof loadRef.current === 'function') loadRef.current()
        }, refreshMs)
        return () => clearInterval(timer)
      }, [ctx, from, to, refreshMs, refreshNonce, enabled])
      return state
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
        }))
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
    function hoverTipProps(hoverTip, title, rows = []) {
      if (!hoverTip || !title) return {}
      const content = { title, rows }
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
        rows: [
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
      const barWidth = Math.max(1.5, Math.min(slot * 0.32, 16))
      const gap = Math.max(1, slot * 0.05)
      const groups = []
      trend.forEach((bucket, index) => {
        const left = index * slot + (slot - barWidth * 2 - gap) / 2
        const label = bucketLabel(bucket, period, isZh)
        const tip = buildTrendTip(bucket, period, t, isZh, format)
        const hot = hover?.kind === 'bucket' && hover.key === bucket.key
        const bars = []
        if (bucket.activeMs > 0) {
          const barHeight = Math.max(1.5, (bucket.activeMs / peak) * usable)
          bars.push(h('rect', {
            key: `active-${bucket.key}`,
            className: 'cs-bar',
            x: left,
            y: baseline - barHeight,
            width: barWidth,
            height: barHeight,
            rx: 1.5,
            fill: 'var(--cs-live)',
          }))
        }
        if (bucket.taskMs > 0) {
          const barHeight = Math.max(1.5, (bucket.taskMs / peak) * usable)
          bars.push(h('rect', {
            key: `task-${bucket.key}`,
            className: 'cs-bar',
            x: left + barWidth + gap,
            y: baseline - barHeight,
            width: barWidth,
            height: barHeight,
            rx: 1.5,
            fill: 'var(--cs-task)',
          }))
        }
        const groupProps = {
          key: bucket.key,
          className: `cs-bar-group${hot ? ' is-hot' : ''}`,
          tabIndex: 0,
          role: 'button',
          'aria-label': `${label} · ${t('activeLabel')} ${formatDuration(bucket.activeMs, format)} · ${t('taskLabel')} ${formatDuration(bucket.taskMs, format)}`,
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
      }, bucketLabel(trend[index], period, isZh)))
      return h('div', { className: 'cs-chart' },
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
        h('div', { className: 'cs-axis' }, ...axis))
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
    function renderCycleCard(t, period, cycle, isCurrent, onSelect, format = 'hms') {
      const titleKey = period === 'day' ? 'cycleToday' : period === 'week' ? 'cycleWeek' : 'cycleMonth'
      const share = activeSharePercent(cycle.activeMs, cycle.onlineMs)
      return h('button', { key: period, type: 'button', className: `cs-cycle${isCurrent ? ' is-current' : ''}`, 'aria-pressed': isCurrent, onClick: onSelect },
        h('span', { className: 'cs-cycle-head' },
          h('span', { className: 'cs-cycle-title' }, t(titleKey))),
        h('span', { className: 'cs-cycle-value' }, formatDuration(cycle.activeMs, format)),
        h('span', { className: 'cs-cycle-tail' },
          h('span', { className: 'cs-cycle-share' }, `${t('activeShare')} ${share}%`),
          h('span', { className: 'cs-cycle-track', 'aria-hidden': true },
            h('i', { style: { width: `${share}%` } }))))
    }

    /** 热力图图例：只用当前主题的六档热力色从左到右排成低→高色带，不再重复解释文字。 */
    function renderHeatLegend(t) {
      return h('span', { className: 'cs-heat-legend' },
        h('span', { className: 'cs-heat-legend-label' }, t('heatLegendLow')),
        h('span', { className: 'cs-heat-legend-scale', 'aria-hidden': true },
          ...[0, 1, 2, 3, 4, 5].map((level) => h('i', {
            key: level,
            className: 'cs-heat-legend-swatch',
            style: { background: `var(--cs-heat-${level})` },
          }))),
        h('span', { className: 'cs-heat-legend-label' }, t('heatLegendHigh')))
    }

    /** 口径说明：鼠标悬浮或键盘聚焦即显示，紧贴图标下方；与 HoverTip 共用 fixed 定位与视口夹取。 */
    function Info({ message, content = null, lines = null }) {
      const [position, setPosition] = React.useState(null)
      const [escaped, setEscaped] = React.useState(false)
      const anchorRef = React.useRef(null)
      const tipRef = React.useRef(null)
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
      const show = () => { setEscaped(false); place() }
      const hide = () => { setPosition(null); setEscaped(false) }
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
          type: 'button', 'aria-label': message,
          onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide,
        },
          h('svg', { viewBox: '0 0 20 20', width: 16, height: 16, fill: 'none', 'aria-hidden': true },
            h('circle', { cx: 10, cy: 10, r: 7.5, stroke: 'currentColor', strokeWidth: 1.4 }),
            h('path', { d: 'M10 9v4M10 6.5h.01', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }))),
        h('span', {
          ref: tipRef,
          className: `cs-info-tip${content === null && lines === null ? '' : ' cs-info-tip-legend'}${lines === null ? '' : ' cs-info-tip-lines'}`,
          role: 'tooltip',
          'data-placement': position?.placement ?? 'bottom',
          // 位置尚未量出时内联 hidden 压住 CSS 显示，避免在 (0,0) 闪一下。
          style: position
            ? { left: `${position.left}px`, top: `${position.top}px` }
            : { left: '0px', top: '0px', visibility: 'hidden' },
        }, lines === null
          ? (content === null
              ? message
              : h('span', { className: 'cs-info-content' },
                  h('span', { className: 'cs-info-copy' }, message),
                  h('span', { className: 'cs-info-legend' }, content)))
          : h('span', { className: 'cs-info-lines' },
              lines.map((line, index) => h('span', { className: 'cs-info-line', key: index }, line)))))
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
      const segments = visibleParts.map((item) => {
        const fraction = item.ms / total
        const tip = buildCompositionTip(item, total, t, format)
        const props = {
          key: item.key,
          className: `cs-donut-seg is-${item.key}${hotKey === item.key ? ' is-hot' : ''}`,
          cx: 50, cy: 50, r: radius,
          fill: 'none', stroke: `var(--cs-series-${item.key})`, strokeWidth: 11,
          strokeDasharray: `${fraction * circumference} ${circumference}`,
          strokeDashoffset: -offset * circumference,
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
          h('div', { className: 'cs-card-heading' },
            h('h2', null, t('compositionTitle')),
            renderInfo(t('compositionInfo'))),
          h('span', { className: 'cs-tag' }, t('accumulated'))),
        total === 0 ? h('div', { className: 'cs-empty' }, t('noTaskComposition'))
          : h('div', { className: 'cs-composition-body' },
              h('div', {
                className: `cs-donut${hotKey ? ' has-hot' : ''}`,
                role: 'group',
                'aria-label': `${t('compositionTitle')} · ${t('accumulated')} ${formatDuration(total, format)}`,
              },
                h('svg', { viewBox: '0 0 100 100' },
                  h('circle', { cx: 50, cy: 50, r: radius, fill: 'none', stroke: 'var(--dsw-alias-bg-layer-2)', strokeWidth: 11 }),
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
        h('div', { className: 'cs-card-head' }, h('div', { className: 'cs-card-heading' },
          h('h2', null, t('workspaceRanking')),
          renderInfo(t('sumFoot')))),
        rows.length === 0 ? h('div', { className: 'cs-empty' }, t('noTaskComposition'))
          : h('div', { className: 'cs-ranking-list' }, rows.map((row, index) => {
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
                h('span', { className: 'cs-ranking-bar', 'aria-hidden': true },
                  h('i', { style: { width: formatPercent(row.share) } })),
                h('span', { className: 'cs-ranking-time' }, formatDuration(row.taskMs, format)),
                h('span', { className: 'cs-ranking-share' }, formatPercent(row.share)))
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
        if (amount > 0) rows.push({ key: labels[index], label: t(labels[index]), value: formatDuration(amount, format) })
      })
      if (remaining > 0) rows.push({ key: 'notBroken', label: t('notBroken'), value: formatDuration(remaining, format) })
      return rows
    }

    function renderSessionBreakdown(session, t, format = 'hms') {
      const rows = sessionBreakdownRows(session, t, format)
      return h('span', { className: 'cs-session-breakdown' },
        rows.length > 0 ? rows.map((row) => `${row.label} ${row.value}`).join(' · ') : t('notBroken'))
    }

    function renderSessionRow(session, t, nowMs, subagentRows, format = 'hms', hoverTip = null, highlighted = false) {
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
      return h('div', {
        className: `cs-session${highlighted ? ' is-highlighted' : ''}`,
        key: session.sessionId,
        'data-session-id': session.sessionId,
      },
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
          : null,
        session.approximate
          ? renderDetailMeta({
            className: 'cs-session-status',
            icon: 'approx',
            label: t('approximateHint'),
            tipTitle: t('approximateHint'),
            hoverTip,
            tone: 'warning',
          })
          : null,
        h('span', { className: 'cs-session-metrics' },
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
          })),
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
          : null,
        renderDetailMeta({
          className: 'cs-session-last',
          icon: 'clock',
          label: `${t('colLast')} ${lastText}`,
          value: lastText,
          tipTitle: `${t('colLast')} ${lastText}`,
          hoverTip,
        }))
    }

    function renderWorkspaceRow(row, isOpen, onToggle, t, nowMs, subagentByParent, format = 'hms', hoverTip = null, highlightSessionId = null, sessionPaging = null) {
      const workspaceTitle = row.workspaceTitle ?? t('unassigned')
      const sessions = Array.isArray(row.sessions) ? row.sessions : []
      const paging = sessionPaging?.enabled === true
      const visibleCount = Math.max(
        DETAILS_SESSION_INITIAL,
        Math.min(sessions.length, Math.floor(finite(sessionPaging?.visibleCount ?? DETAILS_SESSION_INITIAL))),
      )
      const shownSessions = paging ? sessions.slice(0, visibleCount) : sessions
      const hiddenCount = Math.max(0, sessions.length - shownSessions.length)
      return h('div', { className: 'cs-group', key: row.key },
        h('div', {
          className: 'cs-row cs-summary',
          role: 'button',
          tabIndex: 0,
          'aria-expanded': isOpen,
          'aria-label': `${workspaceTitle} · ${t(isOpen ? 'collapse' : 'expand')}`,
          onClick: onToggle,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onToggle()
            }
          },
        },
          h('div', { className: 'cs-cell cs-name' },
            h('span', { className: 'cs-name-text', ...hoverTipProps(hoverTip, workspaceTitle) }, workspaceTitle),
            renderDetailMeta({
              className: 'cs-name-sub',
              icon: 'sessions',
              label: `${row.sessions.length} ${t('sessionsUnit')}`,
              value: String(row.sessions.length),
              tipTitle: `${row.sessions.length} ${t('sessionsUnit')}`,
              hoverTip,
            })),
          h('div', { className: 'cs-cell cs-active cs-num', 'data-label': t('colActive') }, formatDuration(row.activeMs, format)),
          h('div', { className: 'cs-cell cs-task cs-num', 'data-label': t('colTask') }, formatDuration(row.taskMs, format)),
          h('div', { className: 'cs-cell cs-share', 'data-label': t('colShare') },
            h('span', { className: 'cs-share-text' }, formatPercent(row.share)),
            h('span', { className: 'cs-share-track' },
              h('span', { className: 'cs-share-fill', style: { width: formatPercent(row.share) } }))),
          h('div', { className: 'cs-cell cs-last', 'data-label': t('colLast') }, formatRelativeTime(row.lastActivityAt, t, nowMs)),
          h('div', { className: 'cs-cell cs-toggle' },
            h('span', { className: `cs-chevron${isOpen ? ' is-open' : ''}`, 'aria-hidden': true }))),
        isOpen
          ? h('div', { className: 'cs-sessions' }, sessions.length === 0
              ? h('div', { className: 'cs-empty is-small' }, t('emptyWorkspace'))
              : [
                  ...shownSessions.map((session) =>
                    renderSessionRow(
                      session, t, nowMs, subagentByParent[session.sessionId] ?? [], format, hoverTip,
                      session.sessionId === highlightSessionId,
                    )),
                  paging && hiddenCount > 0
                    ? h('div', { className: 'cs-sessions-more', key: 'show-more' },
                        h('button', {
                          type: 'button',
                          className: 'cs-text-link',
                          onClick: () => sessionPaging?.onShowMore?.(),
                        }, t('detailsShowMore').replace('{count}', String(Math.min(DETAILS_SESSION_STEP, hiddenCount)))),
                        h('span', { className: 'cs-sessions-count' },
                          t('detailsShownCount')
                            .replace('{shown}', String(shownSessions.length))
                            .replace('{total}', String(sessions.length))))
                    : null,
                ])
          : null)
    }

    /** 「回填中 / 已完成 / 失败可重试」三态与进度；完成后可收起提示。 */
    function renderBackfillBanner(backfill, handlers, t) {
      if (backfill.status === 'unavailable') {
        return h('div', { className: 'cs-backfill cs-backfill-waiting', role: 'status' }, t('backfillUnavailable'))
      }
      if (backfill.status === 'idle') {
        return h('div', { className: 'cs-backfill cs-backfill-waiting', role: 'status' }, t('backfillIdle'))
      }
      if (backfill.status === 'done') {
        if (handlers.dismissed === true || !isBackfillUnread(backfill)) return null
        return h('div', { className: 'cs-backfill is-done' },
          h('span', { className: 'cs-backfill-icon' }, '✓'),
          h('span', { className: 'cs-backfill-label' }, t('backfillDone')),
          h('span', { className: 'cs-backfill-hint' },
            t('backfillDoneHint').replace('{tasks}', String(backfill.tasksWritten))),
          h('button', {
            type: 'button',
            className: 'cs-backfill-dismiss',
            disabled: handlers.dismissing === true,
            onClick: handlers.onDismiss,
          }, t('backfillDismiss')),
          handlers.dismissError
            ? h('span', { className: 'cs-backfill-hint' }, handlers.dismissError)
            : null)
      }
      if (backfill.status === 'failed') {
        return h('div', { className: 'cs-backfill is-failed' },
          h('span', { className: 'cs-backfill-icon' }, '!'),
          h('span', { className: 'cs-backfill-label' }, t('backfillFailed')),
          h('span', { className: 'cs-backfill-hint' }, backfill.error ?? ''),
          h('button', {
            type: 'button',
            className: 'cs-backfill-retry',
            disabled: handlers.retrying === true,
            onClick: handlers.onRetry,
          }, handlers.retrying ? t('backfillRetrying') : t('backfillRetry')),
          handlers.retryError === null
            ? null
            : h('span', { className: 'cs-backfill-hint' }, handlers.retryError))
      }
      const percent = backfill.total > 0
        ? Math.max(0, Math.min(100, Math.round((backfill.scanned / backfill.total) * 100)))
        : 0
      return h('div', { className: 'cs-backfill is-running' },
        h('span', { className: 'cs-spinner is-small' }),
        h('span', { className: 'cs-backfill-label' },
          backfill.status === 'running' ? t('backfillRunning') : t('backfillIdle')),
        h('span', { className: 'cs-backfill-hint' },
          t('backfillProgress')
            .replace('{done}', String(backfill.scanned))
            .replace('{total}', String(backfill.total))
            .replace('{tasks}', String(backfill.tasksWritten))),
        h('div', {
          className: 'cs-backfill-bar',
          role: 'progressbar',
          'aria-valuenow': percent,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
        }, h('i', { style: { width: `${percent}%` } })))
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
    function formatNoticeTime(value) {
      const time = Number(value)
      if (!Number.isFinite(time) || time <= 0) return '—'
      const date = new Date(time)
      const pad = (part) => String(part).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
        setPosition(null)
        if (!open || typeof window === 'undefined') return undefined
        const trigger = triggerRef.current
        const menu = menuRef.current
        if (!trigger || !menu || typeof trigger.getBoundingClientRect !== 'function') return undefined
        const place = () => {
          const rect = trigger.getBoundingClientRect()
          const next = clampTipPosition(
            { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            { width: menu.offsetWidth ?? 0, height: menu.offsetHeight ?? 0 },
            { width: window.innerWidth ?? 0, height: window.innerHeight ?? 0 },
            { gap: 6, prefer: props.placement === 'top' ? 'top' : 'bottom' },
          )
          // fixed 定位下百分比宽度会按视口计算；把菜单最小宽度显式锚回触发按钮。
          const gridWidth = String(props.className ?? '').includes('heat-range-select') ? 178 : 224
          const minWidth = props.menuVariant === 'grid'
            ? Math.max(gridWidth, Math.round(rect.width))
            : Math.max(0, Math.round(rect.width))
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
          hidden: !open,
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
     * 数字格式选择区：五档压成一条紧凑选项条，标题右侧只保留一枚实时预览。
     * 原来的五张大卡片与单独预览行会把一个轻量设置撑成页面最重的一块，这里
     * 不再重复展开说明；完整提示留给 title 与 aria-label，五档仍可键盘操作。
     */
    function renderDurationFormatSection(t, draftFormat, options = {}) {
      const current = normalizeDurationFormat(draftFormat)
      const disabled = options.disabled === true
      return h('section', { className: 'cs-settings-group cs-format-section' },
        h('div', { className: 'cs-format-head' },
          h('div', { className: 'cs-format-heading' },
            h('h3', null, t('settingsSectionFormat')),
            h('p', { className: 'cs-settings-row-hint' }, t('settingsFormatHint'))),
          h('div', { className: 'cs-format-preview', 'aria-live': 'polite' },
            h('span', null, t('formatPreviewLabel')),
            h('b', { key: current, className: 'cs-format-preview-value', 'data-format': current }, formatDuration(DURATION_FORMAT_SAMPLE_MS, current)))),
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
            title: t(durationFormatHintKey(format)),
            className: `cs-format-opt${selected ? ' is-on' : ''}`,
            disabled,
            onClick: () => options.onSelect?.(format),
          },
          h('b', null, formatDuration(DURATION_FORMAT_SAMPLE_MS, format)),
          h('i', { className: 'cs-format-divider', 'aria-hidden': true }),
          h('span', null, t(durationFormatHintKey(format))))
        })),
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
        const [draft, setDraft] = React.useState(null)
        const [phase, setPhase] = React.useState('loading')
        const [message, setMessage] = React.useState('')
        const [loadNonce, setLoadNonce] = React.useState(0)
        const [noticeState, setNoticeState] = React.useState({ status: 'loading', data: null })
        const [resetStep, setResetStep] = React.useState(false)
        const [resetting, setResetting] = React.useState(false)

        React.useEffect(() => {
          let active = true
          setPhase('loading')
          callSettings(ctx, 'getSettings', {})
            .then((value) => {
              if (!active) return
              setDraft(settingsDraft(value))
              setMessage('')
              setPhase('ready')
            })
            .catch(() => {
              if (!active) return
              // 读失败时表单留空并锁死保存：绝不能拿默认值覆盖 Host 的真实设置。
              setDraft(null)
              setMessage(t('settingsLoadError'))
              setPhase('load-error')
            })
          return () => { active = false }
        }, [ctx, loadNonce])

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

        // 即点即存：与 Dashboard 设置页同一套行为，改动立刻写 Host。
        const savedBadgeTimerRef = React.useRef(null)
        const showSavedBadge = () => {
          setMessage(t('savedBadge'))
          setPhase('saved')
          if (savedBadgeTimerRef.current !== null) window.clearTimeout(savedBadgeTimerRef.current)
          savedBadgeTimerRef.current = window.setTimeout(() => {
            savedBadgeTimerRef.current = null
            setMessage('')
          }, 1000)
        }
        const autoSave = async (next) => {
          try {
            const saved = await callSettings(ctx, 'setSettings', settingsPayload(next))
            setDraft(settingsDraft(saved))
            showSavedBadge()
            // 只广播「变了」，具体值由仪表盘重新向 Host 取。
            notifySettingsChanged()
          } catch {
            setMessage(t('settingsSaveError'))
            setPhase('error')
          }
        }
        const patch = (key, value) => {
          if (draft === null || phase === 'load-error') return
          const next = { ...draft, [key]: value }
          setDraft(next)
          setMessage('')
          void autoSave(next)
        }
        const selectDurationFormat = (value) => {
          const format = normalizeDurationFormat(value)
          if (draft === null || phase === 'load-error') return
          const next = { ...draft, durationFormat: format }
          setDraft(next)
          setMessage('')
          notifyDurationFormatPreview(format)
          void autoSave(next)
        }
        const resetInitialSettings = async () => {
          if (resetting || draft === null || phase === 'load-error') return
          setResetting(true)
          setMessage('')
          try {
            const saved = await callSettings(ctx, 'resetSettings', {})
            setDraft(settingsDraft(saved))
            resetStoredTheme()
            setResetStep(false)
            setPhase('saved')
            setMessage(t('settingsResetDone'))
            notifySettingsChanged()
          } catch {
            setMessage(t('settingsResetError'))
            setPhase('error')
          } finally {
            setResetting(false)
          }
        }

        const loadFailed = phase === 'load-error'
        const busy = phase === 'saving' || draft === null || loadFailed
        const statusClass = `cs-settings-status${phase === 'error' || loadFailed ? ' is-error' : ''}`

        return h('div', { className: 'cs-settings' },
          h('style', null, DSH_TIMESPAN_SETTINGS_CSS),
          h('div', { className: 'cs-settings-inner' },
            h('header', null,
              h('h2', { className: 'cs-settings-title' }, t('settingsTitle')),
              h('p', { className: 'cs-settings-hint' }, t('settingsHint'))),
            h('section', { className: 'cs-settings-group' },
              ...renderBasicSettingsBody(t, draft, busy, patch)),
            renderDurationFormatSection(t, draft?.durationFormat, {
              disabled: busy,
              onSelect: selectDurationFormat,
            }),
            h('section', { className: 'cs-settings-group cs-settings-reset-group' },
              ...renderResetSettingsBody(t, {
                disabled: busy,
                resetting,
                resetStep,
                onRequest: () => setResetStep(true),
                onCancel: () => setResetStep(false),
                onReset: resetInitialSettings,
              })),
            h('section', { className: 'cs-settings-group' },
              h('h3', null, t('settingsSectionNotices')),
              noticeState.status === 'error'
                ? h('p', { className: 'cs-notice-empty' }, t('backfillNoticeUnavailable'))
                : noticeState.data === null
                  ? h('p', { className: 'cs-notice-empty' }, t('loading'))
                  : renderBackfillNotices(noticeState.data, t)),
            h('div', { className: 'cs-settings-footer' },
              loadFailed
                ? h('button', {
                    type: 'button', className: 'cs-btn', onClick: () => setLoadNonce((value) => value + 1),
                  }, t('settingsRetry'))
                : null,
              message ? h('span', { className: statusClass, role: 'status' }, message) : null)))
      }
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
      const idleOptions = Array.from({ length: 15 }, (_, index) => String(index + 1))
      // DSH 设置页与插件自己的设置面板共用同一套紧凑下拉，避免默认样式在宽容器里被拉满。
      const selectClass = options.selectClass ?? 'cs-settings-select'
      const rows = [
        // 语言放第一行：它决定这一页所有文案用哪套字典，先选语言再看其余项最顺。
        settingsRow(t, 'settingsLanguageLabel', 'settingsLanguageHint',
          h(Select, {
            value: normalizeLanguage(draft?.language),
            options: LANGUAGE_OPTIONS,
            disabled: busy,
            className: selectClass,
            ariaLabel: t('settingsLanguageLabel'),
            onChange: (value) => onPatch?.('language', normalizeLanguage(value)),
          })),
        settingsRow(t, 'settingsIdleLabel', 'settingsIdleHint',
          h(Select, {
            value: draft?.idleThresholdMinutes ?? '5',
            options: idleOptions,
            disabled: busy,
            className: selectClass,
            ariaLabel: t('settingsIdleLabel'),
            onChange: (value) => onPatch?.('idleThresholdMinutes', value),
          }),
          h('span', { className: 'cs-settings-unit' }, t('settingsIdleUnit'))),
        settingsRow(t, 'settingsWeekLabel', 'settingsWeekHint',
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
        settingsRow(t, 'settingsSubagentLabel', 'settingsSubagentHint',
          h('label', { className: 'cs-settings-switch' },
            h('input', {
              type: 'checkbox',
              'aria-label': t('settingsSubagentLabel'),
              checked: draft?.showSubagents !== false,
              disabled: busy,
              onChange: (event) => onPatch?.('showSubagents', event?.target?.checked === true),
            }),
            h('span', null, draft?.showSubagents === false ? t('settingsSubagentOff') : t('settingsSubagentOn')))),
        settingsRow(t, 'settingsSidebarNameLabel', 'settingsSidebarNameHint',
          h('label', { className: 'cs-settings-switch' },
            h('input', {
              type: 'checkbox',
              'aria-label': t('settingsSidebarNameLabel'),
              checked: draft?.sidebarShowName === true,
              disabled: busy,
              onChange: (event) => onPatch?.('sidebarShowName', event?.target?.checked === true),
            }),
            h('span', null, draft?.sidebarShowName === true ? t('settingsSidebarNameOn') : t('settingsSidebarNameOff')))),
        settingsRow(t, 'settingsSidebarDotLabel', 'settingsSidebarDotHint',
          h('label', { className: 'cs-settings-switch' },
            h('input', {
              type: 'checkbox',
              'aria-label': t('settingsSidebarDotLabel'),
              checked: draft?.sidebarDotVisible !== false,
              disabled: busy,
              onChange: (event) => onPatch?.('sidebarDotVisible', event?.target?.checked === true),
            }),
            h('span', null, draft?.sidebarDotVisible === false ? t('settingsSidebarDotOff') : t('settingsSidebarDotOn')))),
        settingsRow(t, 'settingsSidebarDotPositionLabel', 'settingsSidebarDotPositionHint',
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
        settingsRow(t, 'settingsSidebarDurationLabel', 'settingsSidebarDurationHint',
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
      // 宽卡按两列排：行数为奇数时最后一行独占整行，偶数时正好填满两列，不留空格。
      const splitClass = options.split === true
        ? ` is-split${rows.length % 2 === 0 ? ' is-even' : ''}`
        : ''
      return [
        h('div', { className: 'cs-settings-card-head' },
          h('div', null,
            h('h3', null, t('settingsSectionBasics')),
            h('p', { className: 'cs-settings-card-sub' }, t('settingsBasicsHint')))),
        h('div', { className: `cs-settings-list${splitClass}` }, ...rows),
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
        options.resetStep === true
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
              }, resetIcon(), h('span', null, t('settingsResetButton')))),
      ]
    }

    /* ============================ 次级导航与四视图 ============================ */

    /** 视图名只认四个同级视图；任何非法值（含旧 sessionStorage 脏值）回落概览。 */
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

    /** 首屏主指标只认五个时长项；非法旧值、脏值一律回落今日活跃时长。 */
    function normalizeHeroMetric(value) {
      return HERO_METRIC_VALUES.includes(value) ? value : HERO_METRIC_DEFAULT
    }

    /** 读取首屏主指标；storage 缺省用 window.localStorage，测试可注入假存储。 */
    function readStoredHeroMetric(storage) {
      const store = storage === undefined ? defaultFocusStorage() : storage
      if (store === null || store === undefined || typeof store.getItem !== 'function') return HERO_METRIC_DEFAULT
      try {
        return normalizeHeroMetric(store.getItem(HERO_METRIC_KEY))
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
        { value: 'settings', label: t('tabSettings') },
      ]
    }

    function prefersReducedMotion() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
    }

    /** 退出延时：正常 180ms，减少动效时 0（直接到位）。 */
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
      const [thumb, setThumb] = React.useState({ left: 0, width: 0 })

      const measure = () => {
        const index = tabs.findIndex((tab) => tab.value === current)
        const node = tabRefs.current?.[index]
        if (!node) return
        const left = typeof node.offsetLeft === 'number' ? node.offsetLeft : 0
        const width = typeof node.offsetWidth === 'number' ? node.offsetWidth : 0
        setThumb((previous) => previous.left === left && previous.width === width
          ? previous
          : { left, width })
      }

      React.useEffect(() => {
        measure()
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
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
      return h('div', { className: 'cs-cycles' },
        ['day', 'week', 'month'].map((item) =>
          renderCycleCard(t, item, data?.cycles?.[item] ?? { activeMs: 0, taskMs: 0, taskCount: 0 }, item === period, () => onSelect?.(item), format)))
    }

    /** 概览趋势卡底部的一条紧凑统计带，填住图表与卡片底边之间的空白。 */
    function renderTrendFoot(data, t, isZh, shownPeriod, format) {
      const stats = trendFocusStats(data, shownPeriod, isZh, format)
      const items = [
        { key: 'peak', label: t('peakActive'), value: formatDuration(stats.peakMs, format) },
        { key: 'period', label: t('peakPeriod'), value: stats.peakLabel },
        { key: 'share', label: t('activeShare'), value: `${stats.activeSharePct}%` },
        { key: 'task', label: t('taskLabel'), value: formatDuration(stats.taskMs, format) },
      ]
      return h('div', { className: 'cs-trend-foot' }, items.map((item) =>
        h('div', { className: 'cs-trend-foot-item', key: item.key },
          h('span', null, item.label),
          h('b', null, item.value))))
    }

    /** 趋势页底部的时段分布：按活跃与任务合计取最忙的几个桶。 */
    function trendDistributionRows(data, isZh, shownPeriod) {
      const trend = Array.isArray(data?.trend) ? data.trend : []
      return trend
        .map((bucket) => {
          const activeMs = Math.max(0, finite(bucket?.activeMs))
          const taskMs = Math.max(0, finite(bucket?.taskMs))
          return {
            key: bucket?.key ?? `${bucket?.from}`,
            label: bucketLabel(bucket, shownPeriod, isZh),
            activeMs,
            taskMs,
            totalMs: activeMs + taskMs,
          }
        })
        .filter((row) => row.totalMs > 0)
        .sort((left, right) => right.totalMs - left.totalMs)
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

    function renderTrendBottom(data, t, isZh, shownPeriod, format) {
      const rows = trendDistributionRows(data, isZh, shownPeriod)
      const shownRows = rows.slice(0, 7)
      const maxTotal = shownRows.reduce((max, row) => Math.max(max, row.totalMs), 0)
      const percentOfMax = (value) => maxTotal > 0 ? Math.max(0, Math.min(100, (value / maxTotal) * 100)) : 0
      const insights = trendInsightRows(data, t, isZh, shownPeriod, format)
      return h('div', { className: 'cs-trend-bottom' },
        h('section', { className: 'cs-card cs-trend-breakdown' },
          h('div', { className: 'cs-card-head' },
            h('div', { className: 'cs-card-heading' },
              h('h2', null, t('trendBreakdownTitle')),
              renderInfo(t('trendBreakdownHint'))),
            h('div', { className: 'cs-legend' },
              h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-active' }), t('activeLabel')),
              h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-task' }), t('taskLabel')))),
          shownRows.length === 0
            ? h('div', { className: 'cs-empty' }, t('trendBreakdownEmpty'))
            : h('div', { className: 'cs-breakdown-list' }, shownRows.map((row) =>
                h('div', {
                  className: 'cs-breakdown-row',
                  key: row.key,
                  role: 'group',
                  'aria-label': `${row.label} · ${t('activeLabel')} ${formatDuration(row.activeMs, format)} · ${t('taskLabel')} ${formatDuration(row.taskMs, format)}`,
                },
                  h('span', { className: 'cs-breakdown-label' }, row.label),
                  h('span', { className: 'cs-breakdown-track', 'aria-hidden': true },
                    h('i', { className: 'cs-breakdown-active', style: { width: `${percentOfMax(row.activeMs)}%` } }),
                    h('i', { className: 'cs-breakdown-task', style: { width: `${percentOfMax(row.taskMs)}%` } })),
                  h('span', { className: 'cs-breakdown-value' }, formatDuration(row.totalMs, format)))))),
        h('section', { className: 'cs-card cs-trend-insights' },
          h('div', { className: 'cs-card-head' },
            h('div', { className: 'cs-card-heading' },
              h('h2', null, t('trendInsightsTitle')),
              renderInfo(t('trendInsightsHint')))),
          h('div', { className: 'cs-trend-insight-list' }, insights.map((item) =>
            h('div', { className: 'cs-trend-insight-row', key: item.key },
              h('span', null, item.label),
              h('b', null, item.value)))),
          h('p', { className: 'cs-trend-insight-note' }, t('trendInsightNote'))))
    }

    function renderTrendCard(data, t, isZh, hoverTip, format, shownPeriod, options = {}) {
      const { focus = null, onToggleFocus } = options ?? {}
      const zoomable = typeof onToggleFocus === 'function'
      const isEmpty = !Array.isArray(data?.workspaces) || data.workspaces.length === 0
      const trendTitleKey = shownPeriod === 'day' ? 'trendDay' : shownPeriod === 'week' ? 'trendWeek' : 'trendMonth'
      return h('section', { className: `cs-card cs-trend-card${zoomable ? ' has-zoom' : ''}`, 'data-focus': 'trend' },
        h('div', { className: 'cs-card-head' },
          h('div', { className: 'cs-card-heading' },
            h('h2', null, t(trendTitleKey)),
            renderInfo(t('trendInfo'))),
          h('div', { className: 'cs-legend' },
            h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-active' }), t('activeLabel')),
            h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-task' }), t('taskLabel'))),
          zoomable ? renderZoomButton({ t, focus, onToggleFocus, value: 'trend' }) : null),
        isEmpty
          ? h('div', { className: 'cs-empty' }, t('emptyDashboard'))
          : renderTrendChart(data.trend, shownPeriod, t, isZh, hoverTip?.tip,
              { onHover: hoverTip?.show, onLeave: hoverTip?.hide }, format),
        zoomable && !isEmpty ? renderTrendFoot(data, t, isZh, shownPeriod, format) : null)
    }

    function renderStatBox(label, value) {
      return h('div', { className: 'cs-stat-box' }, h('span', null, label), h('b', null, value))
    }

    /** 对角双尖角图标：普通态右上+左下，首屏态左上+右下；两种状态方向相反，提示可放大/缩回。 */
    function zoomIcon(expanded) {
      const path = expanded
        ? 'M7 2H2v5M9 14h5V9'
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

    /** 首屏主指标的统一取值表：普通 hero 卡与放大页共用，避免两处口径漂移。 */
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

    /** 首屏主指标标签只补充口径信息；标题已说明今日、本周或本月时不再重复。 */
    function heroMetricTag(t, metric) {
      if (metric === 'active' || metric === 'task') return t('actualOccupied')
      return null
    }

    /** 今日大数字卡片：普通概览里位于周期卡之前，右上角可放大为首屏。 */
    function renderHeroCard(props) {
      const { data, t, format = 'hms', focus = null, onToggleFocus, heroMetric } = props
      const day = data?.cycles?.day ?? {}
      const activeMs = finite(day.activeMs ?? data?.activeMs)
      const onlineMs = finite(day.onlineMs ?? data?.onlineMs)
      const taskMs = finite(day.taskMs ?? data?.taskMs)
      const metric = normalizeHeroMetric(heroMetric)
      const current = heroMetricTable(data, t)[metric]
      // 选中哪一项，另外两项今日数据作为副信息；周/月主指标仍用今日在线与任务托底。
      const meta = metric === 'active'
        ? [['todayOnline', onlineMs], ['todayTask', taskMs]]
        : metric === 'online'
          ? [['todayActive', activeMs], ['todayTask', taskMs]]
          : metric === 'task'
            ? [['todayOnline', onlineMs], ['todayActive', activeMs]]
            : [['todayActive', activeMs], ['todayTask', taskMs]]
      return h('section', {
        className: 'cs-card cs-hero',
        'data-focus': 'hero',
        'data-metric': metric,
      },
        h('div', { className: 'cs-card-head' },
          h('div', { className: 'cs-card-heading' },
            h('h2', null, current.title),
            heroMetricTag(t, metric) === null ? null : h('span', { className: 'cs-tag' }, heroMetricTag(t, metric))),
          renderZoomButton({ t, focus, onToggleFocus })),
        h('div', { className: 'cs-hero-num' }, formatDuration(current.value, format)),
        h('div', { className: 'cs-hero-meta' }, meta.map(([labelKey, value]) =>
          h('span', { key: labelKey }, `${t(labelKey)} ${formatDuration(value, format)}`))))
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
          h('div', { className: 'cs-card-heading' },
            h('h2', null, t('trendFocusTitle')),
            renderInfo(t('trendInfo'))),
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
      const day = data?.cycles?.day ?? {}
      const activeMs = finite(day.activeMs ?? data?.activeMs)
      const onlineMs = finite(day.onlineMs ?? data?.onlineMs)
      const taskMs = finite(day.taskMs ?? data?.taskMs)
      const share = activeSharePercent(activeMs, onlineMs)
      const metric = normalizeHeroMetric(heroMetric)
      const metricTable = heroMetricTable(data, t)
      const current = metricTable[metric]
      const metricButton = (key, label, value) => h('button', {
        type: 'button',
        className: `cs-fs-item cs-fs-button${key === metric ? ' is-current' : ''}`,
        'aria-pressed': key === metric,
        onClick: () => onSelectHeroMetric?.(key),
      }, h('span', null, label), h('b', null, value))
      return h('section', {
        className: 'cs-card cs-hero cs-hero-focus',
        'data-focus': 'hero',
        style: { '--cs-focus-ms': `${focusTransitionMs(prefersReducedMotion())}ms` },
      },
        h('div', { className: 'cs-card-head' },
          h('div', { className: 'cs-card-heading' },
            h('h2', null, current.title),
            heroMetricTag(t, metric) === null ? null : h('span', { className: 'cs-tag' }, heroMetricTag(t, metric))),
          renderZoomButton({ t, focus, onToggleFocus })),
        h('div', { className: 'cs-hero-focus-body' },
          h('div', { className: 'cs-hero-focus-primary' },
            h('div', { className: 'cs-hero-num' }, formatDuration(current.value, format)),
            h('div', { className: 'cs-hero-meta' },
              h('span', null, `${t('todayOnline')} ${formatDuration(onlineMs, format)}`),
              h('span', null, `${t('todayTask')} ${formatDuration(taskMs, format)}`),
              h('span', null, `${t('taskCountShort')} ${String(finite(day.taskCount ?? data?.taskCount))}`))),
          h('div', { className: 'cs-hero-focus-aside' },
            h('div', {
              className: 'cs-hero-ring',
              role: 'img',
              'aria-label': `${t('activeShare')} ${share}%`,
            },
              h('svg', { viewBox: '0 0 160 160', 'aria-hidden': true },
                h('circle', { className: 'cs-hero-ring-track', cx: 80, cy: 80, r: 68, fill: 'none', strokeWidth: 9 }),
                h('circle', {
                  className: 'cs-hero-ring-value', cx: 80, cy: 80, r: 68, fill: 'none', strokeWidth: 9,
                  pathLength: 100, strokeLinecap: share > 0 ? 'round' : 'butt',
                  strokeDasharray: `${share} ${100 - share}`, transform: 'rotate(-90 80 80)',
                })),
              h('div', { className: 'cs-hero-ring-center' },
                h('b', null, `${share}%`),
                h('span', null, t('activeShare')))),
            h('div', { className: 'cs-hero-ring-legend' },
              h('div', { className: 'cs-hero-ring-legend-item is-active' },
                h('span', null, h('i', { 'aria-hidden': true }), t('activeLabel')),
                h('b', null, formatDuration(activeMs, format))),
              h('div', { className: 'cs-hero-ring-legend-item is-online' },
                h('span', null, h('i', { 'aria-hidden': true }), t('onlineLabel')),
                h('b', null, formatDuration(onlineMs, format)))))),
        h('div', { className: 'cs-focus-panel', role: 'group', 'aria-label': t('heroMetricGroup') },
          metricButton('online', t('onlineLabel'), formatDuration(metricTable.online.value, format)),
          metricButton('task', t('todayTask'), formatDuration(metricTable.task.value, format)),
          metricButton('active', t('focusTodayActive'), formatDuration(metricTable.active.value, format)),
          metricButton('week', t('focusWeekActive'), formatDuration(metricTable.week.value, format)),
          metricButton('month', t('focusMonthActive'), formatDuration(metricTable.month.value, format))))
    }

    /** 月度条：12 个月共用同一套高度比例；普通全年视图与首屏下方的填充条复用。 */
    function renderMonthBars(bars, t, format = 'hms', className = 'heat-month-bars') {
      const list = Array.isArray(bars) ? bars : []
      const maxBar = Math.max(0, ...list.map((bar) => finite(bar.activeMs)))
      return h('div', {
        className,
        role: 'group',
        'aria-label': t('monthBars'),
      }, list.map((bar) => {
        const activeMs = finite(bar.activeMs)
        const ratio = maxBar > 0 ? activeMs / maxBar : 0
        const height = activeMs > 0 ? Math.max(4, Math.round(ratio * 100)) : 0
        return h('div', {
          key: `bar-${bar.month}`,
          className: 'heat-month-bar',
          style: { height: `${height}%` },
          'data-month': bar.abbr,
          'data-active-ms': activeMs,
          'aria-label': `${bar.abbr} · ${t('activeLabel')} ${formatDuration(activeMs, format)}`,
        })
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
      const head = h('div', { className: 'cs-card-head' },
        h('div', { className: 'cs-card-heading' },
          h('h2', null, titleText),
          renderInfo(t('heatmapInfo'), renderHeatLegend(t))),
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
        const summary = summarizeHeatDays(scopedDays, hostSummary)
        let maxActive = 0
        for (const day of scopedDays) {
          if (day?.hasObservations === true) maxActive = Math.max(maxActive, finite(day.activeMs))
        }

        const renderPad = (key) => h('span', {
          key,
          className: 'heat-cell is-pad',
          'aria-hidden': true,
        })
        const renderCell = (cell, key) => {
          const day = cell.day
          const empty = day.hasObservations !== true
          const level = empty ? 0 : heatLevel(day.activeMs, maxActive)
          const tip = buildHeatTip(day, t, format)
          const ariaLabel = empty
            ? `${tip.title} · ${t('noRecord')}`
            : `${tip.title} · ${t('activeLabel')} ${formatDuration(day.activeMs, format)}`
          return h('span', {
            key,
            className: `heat-cell l${level}${empty ? ' is-empty' : ''}`,
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
        const summaryText = t('heatSummary')
          .replace('{active}', formatDuration(summary.activeMs, format))
          .replace('{activeDays}', String(summary.activeDays))
          .replace('{observedDays}', String(summary.observedDays))
        const summaryNode = h('div', { className: 'heat-summary' }, summaryText)

        const renderWeekCells = (grid) => {
          const cells = []
          for (const week of grid.weeks) {
            for (const cell of week) {
              if (cell === null) {
                cells.push(renderPad(`pad-${cells.length}`))
                continue
              }
              cells.push(renderCell(cell, cell.dateKey))
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
            cell === null ? renderPad(`pad-${index}`) : renderCell(cell, cell.dateKey)
          ))
          body = [
            h('div', { className: 'heat-month' },
              h('div', { className: 'heat-month-weekdays' }, weekdayLabels.map((label) =>
                h('span', { key: label }, label))),
              h('div', { className: 'heat-month-grid' }, cells)),
            ...(focusPage ? [] : [summaryNode]),
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
              ref: alignHeatScroll,
            },
              weekdayRow,
              h('div', { className: 'heat-plot' },
                isYear ? null : monthRow,
                h('div', { className: 'heat-weekgrid' }, cells),
                isYear ? monthRow : null)),
            ...(focusPage ? [] : [summaryNode]),
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
        content = h('div', { className: 'heat-focus-layout' },
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

    /** 概览：首屏大数字、周期卡、趋势卡、每日热力图、任务构成、工作区排行与最近会话。 */
    function renderOverviewView(props) {
      const {
        data, t, isZh, period, onSelectPeriod, durationFormat, hoverTip, nowMs, onOpenSession,
        focus = null, onToggleFocus, heatSeries, heatStatus,
        heatRangeValue = HEAT_DEFAULT_RANGE, onSelectHeatRange,
        heroMetric, onSelectHeroMetric,
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
      return [
        h('div', { className: 'cs-overview-grid' },
          renderHeroCard({ data, t, format: durationFormat, focus, onToggleFocus, heroMetric }),
          renderCycles(data, t, period, onSelectPeriod, durationFormat),
          renderTrendCard(data, t, isZh, hoverTip, durationFormat, shownPeriod, { focus, onToggleFocus }),
          renderComposition(data, t, hoverTip?.tip, { onHover: hoverTip?.show, onLeave: hoverTip?.hide }, durationFormat),
          renderWorkspaceRanking(data, t, durationFormat, hoverTip),
          renderRecentSessions(data, t, nowMs, onOpenSession, durationFormat),
          renderDailyHeatmap({
            series: heatSeries, status: heatStatus, t, format: durationFormat, nowMs, hoverTip,
            rangeValue: heatRangeValue, onSelectRange: onSelectHeatRange, focus, onToggleFocus,
          })),
      ]
    }

    /** 最近会话卡：点击某条会话切到明细、展开所在工作区并高亮该会话。 */
    function renderRecentSessions(data, t, nowMs, onOpenSession, format = 'hms') {
      const rows = flattenRecentSessions(data, 5)
      return h('section', { className: 'cs-card cs-recent' },
        h('div', { className: 'cs-card-head' },
          h('div', { className: 'cs-card-heading' },
            h('h2', null, t('recentSessions')),
            renderInfo(t('recentSessionsHint'))),
          h('span', { className: 'cs-tag' }, '5')),
        rows.length === 0
          ? h('div', { className: 'cs-empty' }, t('recentSessionsEmpty'))
          : h('div', { className: 'cs-recent-list' }, rows.map((session) =>
              h('button', {
                key: `${session.workspaceKey}:${session.sessionId}`,
                type: 'button',
                className: 'cs-recent-row',
                onClick: () => onOpenSession?.(session),
              },
                h('span', {
                  className: `cs-recent-status${session.taskRunning === true ? ' is-running' : ''}`,
                  ...(session.taskRunning === true
                    ? { role: 'img', 'aria-label': t('runningTag'), title: t('runningTag') }
                    : { 'aria-hidden': true }),
                }, session.taskRunning === true ? h(DetailGlyph, { name: 'running', size: 13 }) : null),
                h('span', { className: 'cs-recent-title' }, session.sessionTitle ?? t('unknownSession')),
                h('span', { className: 'cs-recent-workspace' }, session.workspaceTitle ?? t('unassigned')),
                h('span', { className: 'cs-recent-time' }, formatDuration(session.taskMs, format)),
                h('span', { className: 'cs-recent-last' }, formatRelativeTime(session.lastActivityAt, t, nowMs))))))
    }

    /** 趋势：周期卡 + 趋势图 + 日均/任务次数/峰值摘要，日周月可比较。 */
    function renderTrendView(props) {
      const { data, t, isZh, period, onSelectPeriod, durationFormat, hoverTip } = props
      const shownPeriod = data?.period ?? period
      const peak = trendPeak(data?.trend, shownPeriod, isZh)
      const share = activeSharePercent(data?.activeMs, data?.onlineMs)
      return [
        renderCycles(data, t, period, onSelectPeriod, durationFormat),
        h('div', { className: 'cs-trend-layout' },
          renderTrendCard(data, t, isZh, hoverTip, durationFormat, shownPeriod),
          h('section', { className: 'cs-card cs-trend-summary' },
            h('div', { className: 'cs-card-head' },
              h('div', { className: 'cs-card-heading' },
                h('h2', null, t('trendSummary')),
                renderInfo(t('trendInfo')))),
            h('div', { className: 'cs-stat-grid' },
              renderStatBox(t('dailyAverageActive'), formatDuration(averageMsPerDay(data, 'activeMs'), durationFormat)),
              renderStatBox(t('dailyAverageTask'), formatDuration(averageMsPerDay(data, 'taskMs'), durationFormat)),
              renderStatBox(t('taskCountShort'), String(finite(data?.taskCount))),
              renderStatBox(t('peakActive'), peak === null
                ? '—'
                : `${formatDuration(finite(peak.bucket.activeMs), durationFormat)} · ${peak.label}`)),
            h('div', { className: 'cs-trend-summary-foot' },
              h('div', { className: 'cs-trend-share-head' },
                h('span', null, t('activeShare')),
                h('b', null, `${share}%`)),
              h('div', { className: 'cs-trend-share-track', 'aria-hidden': true },
                h('i', { style: { width: `${share}%` } })),
              h('div', { className: 'cs-trend-share-caption' },
                `${t('activeLabel')} ${formatDuration(data?.activeMs, durationFormat)} · ${t('onlineLabel')} ${formatDuration(data?.onlineMs, durationFormat)}`)))),
        renderTrendBottom(data, t, isZh, shownPeriod, durationFormat),
      ]
    }

    /** 明细右上角的统计范围下拉：预设范围直接映射成本地自然日区间。 */
    function renderDetailsRangePicker({ value, t, onSelect }) {
      const options = DETAILS_RANGE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
        key: `details-range-${option.value}`,
      }))
      return h('div', { className: 'cs-details-range' },
        h('span', { className: 'cs-range' }, t('rangeLabel')),
        h(Select, {
          value: normalizeDetailsRange(value),
          options,
          ariaLabel: t('detailsRangeLabel'),
          className: 'cs-details-range-select',
          onChange: onSelect,
        }))
    }

    /** 明细：本地搜索、工作区行与渐进展开会话，空状态区分「无匹配」与「无数据」。 */
    function renderDetailsView(props) {
      const {
        data, t, isZh, query, onQueryChange, durationFormat,
        expanded, onToggleRow, nowMs, hoverTip = null,
        highlightSessionId = null,
        detailsRange = DETAILS_RANGE_DEFAULT, onSelectDetailsRange = null,
        progressiveSessions = false, visibleSessionCounts = {}, onShowMoreSessions = null,
      } = props
      const rows = filterWorkspaces(data?.workspaces, query)
      // 子代理任务与当前明细数据同源，避免切到更早范围后仍读取基础周期的空快照。
      const sessionSubagentByParent = groupSubagentTasks(data?.subagentTasks)
      const hasQuery = String(query ?? '').trim() !== ''
      const sessionCount = rows.reduce((sum, row) => sum + (Array.isArray(row.sessions) ? row.sessions.length : 0), 0)
      const detailStats = [
        [t('colWorkspace'), String(rows.length), `${sessionCount} ${t('sessionsUnit')}`],
        [t('colActive'), formatDuration(data?.activeMs, durationFormat), ''],
        [t('colTask'), formatDuration(data?.taskMs, durationFormat), ''],
        [t('activeShare'), `${activeSharePercent(data?.activeMs, data?.onlineMs)}%`, ''],
      ]
      const recent = []
      for (const row of rows) {
        for (const session of row.sessions ?? []) recent.push({ ...session, workspaceTitle: row.workspaceTitle })
      }
      recent.sort((left, right) => finite(right.lastActivityAt) - finite(left.lastActivityAt))
      return [
        h('div', { className: 'cs-details-toolbar' },
          h('input', {
            className: 'cs-search',
            type: 'search',
            value: query ?? '',
            placeholder: t('searchPlaceholder'),
            'aria-label': t('searchPlaceholder'),
            onChange: (event) => onQueryChange?.(event?.target?.value ?? ''),
          }),
          h('span', { className: 'cs-tag' }, t('sumTag')),
          renderDetailsRangePicker({ value: detailsRange, t, onSelect: onSelectDetailsRange })),
        h('div', { className: 'cs-details-stats' }, detailStats.map(([label, value, hint]) =>
          h('div', { className: 'cs-detail-stat', key: label },
            h('span', { className: 'cs-detail-stat-label' }, label),
            h('b', { className: 'cs-detail-stat-value' }, value),
            hint === '' ? null : h('span', { className: 'cs-detail-stat-hint' }, hint)))),
        h('div', { className: 'cs-details-layout' },
          h('section', { className: 'cs-card cs-table-card' },
            h('div', { className: 'cs-card-head' },
              h('div', { className: 'cs-card-heading' },
                h('h2', null, t('workspaceTitle')),
                renderInfo(t('sumFoot')))),
            h('div', { className: 'cs-table-head cs-row' },
              h('div', { className: 'cs-cell cs-name' }, t('colWorkspace')),
              h('div', { className: 'cs-cell cs-active' }, t('colActive')),
              h('div', { className: 'cs-cell cs-task' }, t('colTask')),
              h('div', { className: 'cs-cell cs-share' }, t('colShare')),
              h('div', { className: 'cs-cell cs-last' }, t('colLast')),
              h('div', { className: 'cs-cell cs-toggle' })),
            rows.length === 0
              ? h('div', { className: 'cs-empty' }, t(hasQuery ? 'detailsEmpty' : 'emptyDashboard'))
              : h('div', { className: 'cs-table-body' }, rows.map((row) =>
                  renderWorkspaceRow(row, expanded?.[row.key] === true, () => onToggleRow?.(row.key),
                    t, nowMs, sessionSubagentByParent, durationFormat, hoverTip, highlightSessionId,
                    progressiveSessions
                      ? {
                          enabled: true,
                          visibleCount: visibleSessionCounts?.[row.key] ?? DETAILS_SESSION_INITIAL,
                          onShowMore: () => onShowMoreSessions?.(row.key, Array.isArray(row.sessions) ? row.sessions.length : 0),
                        }
                      : null)))),
          h('aside', { className: 'cs-details-side' },
            h('section', { className: 'cs-card cs-details-side-card' },
              h('div', { className: 'cs-card-head' },
                h('div', { className: 'cs-card-heading' },
                  h('h2', null, t('recentSessions')),
                  renderInfo(t('recentSessionsHint')))),
              recent.length === 0
                ? h('div', { className: 'cs-empty is-small' }, t('recentSessionsEmpty'))
                : h('div', { className: 'cs-detail-session-list' }, recent.slice(0, 6).map((session) =>
                    h('div', { className: 'cs-detail-session', key: session.sessionId },
                      h('span', { className: 'cs-detail-session-title' }, session.sessionTitle ?? t('unknownSession')),
                      h('span', { className: 'cs-detail-session-time' }, formatDuration(session.taskMs, durationFormat)),
                      h('span', { className: 'cs-detail-session-workspace' }, session.workspaceTitle ?? t('unassigned')),
                      h('span', { className: 'cs-detail-session-last' }, formatRelativeTime(session.lastActivityAt, t, nowMs)))))),
          )),
      ]
    }

    /**
     * Dashboard 内设置页：表单值来自 Host 草稿，外观/配色来自页面本地主题状态。
     * 纯渲染函数便于组成测试断言控件结构，数据加载与保存逻辑留在 createPage。
     */
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
        t, draft, phase, message, noticeState, appearance, palette,
        dataBusy = '', dataMessage = null, clearStep = false, retrying = false, retryError = null,
        recheckMessage = null, approximateMessage = null,
        importPreview = null, importRestoreSettings = false, importError = '',
        resetStep = false, resetting = false,
        onPatch, onSelectFormat, onRetryLoad, onExport, onRequestClear, onCancelClear, onClear,
        onPickImportFile, onCancelImport, onImport, onToggleImportSettings, onShowApproximate,
        onRecheckBackfill, onCycleAppearance, onSelectAppearance, onChangePalette,
        onRequestReset, onCancelReset, onResetSettings,
      } = props
      const loadFailed = phase === 'load-error'
      const busy = phase === 'saving' || draft === null || loadFailed
      const appearanceMode = normalizeAppearance(appearance)
      const importRange = importPreview ? importPreviewRange(importPreview.payload) : ''
      return [h('div', { className: 'cs-settings cs-settings-board' },
        h('header', { className: 'cs-settings-hero' },
          h('h2', { className: 'cs-settings-title' }, t('settingsPageTitle')),
          h('p', { className: 'cs-settings-hint' }, t('settingsPageHint'))),
        h('div', { className: 'cs-settings-grid' },
          h('section', { className: 'cs-settings-card cs-settings-main cs-settings-basics-card' },
            ...renderBasicSettingsBody(t, draft, busy, onPatch, { selectClass: 'cs-settings-select', split: true })),
          h('section', { className: 'cs-settings-card cs-settings-side cs-format-card' },
            renderDurationFormatSection(t, draft?.durationFormat, {
              disabled: busy,
              onSelect: onSelectFormat,
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
                  ['blue', 'stone', 'clay'].map((value) => {
                    const labelKey = value === 'blue' ? 'paletteBlue' : value === 'stone' ? 'paletteStone' : 'paletteClay'
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
          h('section', { className: 'cs-settings-card cs-settings-side cs-notices-card' },
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
          h('section', { className: 'cs-settings-card cs-settings-main cs-data-card' },
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
                })),
              h('span', { className: 'cs-data-spacer' }),
              h('button', {
                type: 'button', className: 'cs-btn is-danger', disabled: dataBusy !== '',
                onClick: () => onRequestClear?.(),
              }, t('clearData'))),
            h('div', { className: 'cs-import-hint' },
              h('span', null, t('importHint')),
              h('span', { className: 'cs-import-file-state', role: 'status' },
                importPreview
                  ? `${t('importFilePicked')}${String(importPreview.filename ?? '')}`
                  : t('importFileHint'))),
            importPreview
              ? h('div', { className: 'cs-import-preview' },
                  h('strong', null, t('importPreviewTitle')),
                  h('span', null, `${String(importPreview.filename ?? '')} · ${t('importIntervals')} ${importPreview.payload?.intervals?.length ?? 0} · ${t('importTasks')} ${importPreview.payload?.tasks?.length ?? 0}`),
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
              : null,
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
            clearStep
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
              : null,
            dataMessage
              ? h('div', {
                  className: `cs-data-status${dataMessage.error ? ' is-error' : ''}`,
                  role: 'status',
                }, dataMessage.text)
              : null)),
        h('div', { className: 'cs-settings-footer' },
          loadFailed
            ? h('button', { type: 'button', className: 'cs-btn', onClick: () => onRetryLoad?.() }, t('settingsRetry'))
            : null,
          message ? h('span', {
            className: `cs-settings-status${phase === 'error' || loadFailed ? ' is-error' : ''}`,
            role: 'status',
          }, message) : null))]
    }

    function createPage(ctx) {
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
        const [switchingView, setSwitchingView] = React.useState(false)
        const switchingTimerRef = React.useRef(null)
        const viewsRef = React.useRef(null)
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
        const paletteNameKey = palette === 'stone' ? 'paletteStone' : palette === 'clay' ? 'paletteClay' : 'paletteBlue'
        const paletteOrder = PALETTES.map((key) => t(key === 'stone' ? 'paletteStone' : key === 'clay' ? 'paletteClay' : 'paletteBlue')).join(' → ')
        const paletteToggleLabel = t('paletteToggle').replace('{name}', t(paletteNameKey)).replace('{order}', paletteOrder)
        const [expanded, setExpanded] = React.useState(() => {
          try {
            const value = JSON.parse(window.sessionStorage.getItem('dsh-timespan.expanded') || '{}')
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
          } catch { return {} }
        })
        const [detailsQuery, setDetailsQuery] = React.useState('')
        const [detailsRange, setDetailsRange] = React.useState(() => detailsRangeForPeriod(period))
        const [detailsVisibleCounts, setDetailsVisibleCounts] = React.useState({})
        const [detailHighlight, setDetailHighlight] = React.useState(null)
        const detailHighlightTimerRef = React.useRef(null)
        // 顶部周期变化时把明细范围同步到语义相近的预设；手动选择后保持到下次周期切换。
        React.useEffect(() => { setDetailsRange(detailsRangeForPeriod(period)) }, [period])
        React.useEffect(() => { setDetailsVisibleCounts({}) }, [detailsRange])
        React.useEffect(() => { try { window.sessionStorage.setItem('dsh-timespan.period', period) } catch {} }, [period])
        React.useEffect(() => { try { window.sessionStorage.setItem('dsh-timespan.view', view) } catch {} }, [view])
        React.useEffect(() => { try { window.sessionStorage.setItem('dsh-timespan.expanded', JSON.stringify(expanded)) } catch {} }, [expanded])
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
        // Dashboard 内设置页的独立草稿：进入视图时从 Host getSettings 拉取。
        const [settingsForm, setSettingsForm] = React.useState(null)
        const [settingsPhase, setSettingsPhase] = React.useState('idle')
        const [settingsMessage, setSettingsMessage] = React.useState('')
        const [settingsLoadNonce, setSettingsLoadNonce] = React.useState(0)
        const [settingsResetStep, setSettingsResetStep] = React.useState(false)
        const [settingsResetting, setSettingsResetting] = React.useState(false)
        // 保存成功后 notifySettingsChanged 会触发一次重取；保留「已保存」反馈，
        // 不把设置页闪回加载态。重新进入设置页时再恢复正常加载态。
        const settingsSavedRef = React.useRef(false)
        // 近似说明的关闭状态只存 Host；清空/恢复数据后自动重置为未关闭。
        const [approxDismissed, setApproxDismissed] = React.useState(false)
        React.useEffect(() => {
          let active = true
          callSettings(ctx, 'getSettings', {}).then((value) => {
            if (active) setApproxDismissed(value?.approximateNoticeDismissed === true)
          }).catch(() => {})
          return () => { active = false }
        }, [ctx, settingsLoadNonce])
        const [noticeState, setNoticeState] = React.useState({ status: 'idle', data: null })
        const [noticeNonce, setNoticeNonce] = React.useState(0)
        const state = useDashboard(ctx, period, pollMs, refreshNonce)
        const detailsRangeBounds = resolveDetailsRange(detailsRange, Date.now())
        const detailsState = useDashboard(ctx, 'day', pollMs, refreshNonce, {
          view: 'details',
          range: detailsRangeBounds,
          enabled: view === 'details',
        })
        const showMoreDetailsSessions = (workspaceKey, total) => {
          setDetailsVisibleCounts((previous) => {
            const current = Number.isFinite(previous[workspaceKey])
              ? previous[workspaceKey]
              : DETAILS_SESSION_INITIAL
            return { ...previous, [workspaceKey]: Math.min(total, current + DETAILS_SESSION_STEP) }
          })
        }
        const hoverTip = useHoverTip()
        React.useEffect(() => { hoverTip.hide() }, [period])
        const [, setTick] = React.useState(0)

        // 相对时间（最近活动）每秒重算；数字本身仍来自同一份 Host 快照。
        React.useEffect(() => {
          const timer = setInterval(() => setTick((value) => value + 1), 1000)
          return () => clearInterval(timer)
        }, [])

        const data = state.data
        const detailsData = detailsState.data ?? data
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
            const resultText = t('importResult')
              .replace('{imported}', String(finite(result?.imported)))
              .replace('{skipped}', String(finite(result?.skipped)))
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

        // 视图转场：旧视图先播 180ms viewOut，再换 view 播 300ms viewIn。
        // 减少动效偏好下直接到位；卸载时清掉未完成的计时器。
        const goToView = (target) => {
          const next = normalizeView(target)
          if (next === view || switchingView) return
          if (previewFormat !== null) {
            setPreviewFormat(null)
            notifySettingsChanged()
          }
          if (prefersReducedMotion()) {
            setView(next)
            return
          }
          setSwitchingView(true)
          if (switchingTimerRef.current !== null) window.clearTimeout(switchingTimerRef.current)
          switchingTimerRef.current = window.setTimeout(() => {
            switchingTimerRef.current = null
            setView(next)
            setSwitchingView(false)
          }, viewTransitionDelay(false))
        }
        React.useEffect(() => () => {
          if (switchingTimerRef.current !== null) window.clearTimeout(switchingTimerRef.current)
          if (detailHighlightTimerRef.current !== null) window.clearTimeout(detailHighlightTimerRef.current)
        }, [])
        React.useEffect(() => {
          const node = viewsRef.current
          if (node && typeof node.scrollTop === 'number') node.scrollTop = 0
        }, [view])
        React.useEffect(() => {
          if (view !== 'details' || detailHighlight === null) return undefined
          const sessionId = detailHighlight.sessionId
          const timer = window.setTimeout(() => {
            if (typeof document === 'undefined') return
            const target = [...document.querySelectorAll('.cs-session[data-session-id]')]
              .find((row) => row.getAttribute('data-session-id') === sessionId)
            if (target && typeof target.scrollIntoView === 'function') {
              target.scrollIntoView({
                block: 'center',
                behavior: prefersReducedMotion() ? 'auto' : 'smooth',
              })
            }
          }, 320)
          return () => window.clearTimeout(timer)
        }, [view, detailHighlight, expanded])
        // 放大/缩回时回到内容区顶部，避免继承普通概览的滚动位置。
        React.useEffect(() => {
          const node = viewsRef.current
          if (node && typeof node.scrollTop === 'number') node.scrollTop = 0
        }, [focus])

        // 打开设置页时读取 Host 权威设置与通知记录；关闭时丢弃未保存草稿。
        const settingsOpen = view === 'settings'
        React.useEffect(() => {
          if (!settingsOpen) {
            setSettingsResetStep(false)
            return undefined
          }
          let active = true
          const keepSaved = settingsSavedRef.current === true
          settingsSavedRef.current = false
          if (!keepSaved) {
            setSettingsPhase('loading')
            setSettingsMessage('')
          }
          callSettings(ctx, 'getSettings', {}).then((value) => {
            if (!active) return
            setSettingsForm(settingsDraft(value))
            setSettingsPhase(keepSaved ? 'saved' : 'ready')
          }).catch(() => {
            if (!active) return
            setSettingsPhase('load-error')
            setSettingsMessage(t('settingsLoadError'))
          })
          return () => { active = false }
        }, [ctx, settingsOpen, settingsLoadNonce])
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

        // 即点即存：任何设置控件改动都立刻写 Host，只给约 1 秒的轻量「已保存」角标。
        const savedBadgeTimerRef = React.useRef(null)
        const showSavedBadge = () => {
          setSettingsMessage(t('savedBadge'))
          setSettingsPhase('saved')
          settingsSavedRef.current = true
          if (savedBadgeTimerRef.current !== null) window.clearTimeout(savedBadgeTimerRef.current)
          savedBadgeTimerRef.current = window.setTimeout(() => {
            savedBadgeTimerRef.current = null
            setSettingsMessage('')
          }, 1000)
        }
        const autoSaveSettings = async (next) => {
          try {
            const saved = await callSettings(ctx, 'setSettings', settingsPayload(next))
            setSettingsForm(settingsDraft(saved))
            showSavedBadge()
            notifySettingsChanged()
          } catch {
            setSettingsPhase('error')
            setSettingsMessage(t('settingsSaveError'))
          }
        }
        const patchSetting = (key, value) => {
          if (settingsForm === null || settingsPhase === 'load-error') return
          const next = { ...settingsForm, [key]: value }
          setSettingsForm(next)
          setSettingsMessage('')
          void autoSaveSettings(next)
        }
        const onSelectSettingsFormat = (value) => {
          const format = normalizeDurationFormat(value)
          if (settingsForm === null || settingsPhase === 'load-error') return
          const next = { ...settingsForm, durationFormat: format }
          setSettingsForm(next)
          setSettingsMessage('')
          notifyDurationFormatPreview(format)
          void autoSaveSettings(next)
        }
        const resetInitialSettings = async () => {
          if (settingsResetting || settingsForm === null || settingsPhase === 'load-error') return
          setSettingsResetting(true)
          setSettingsMessage('')
          try {
            const saved = await callSettings(ctx, 'resetSettings', {})
            setSettingsForm(settingsDraft(saved))
            setPreviewFormat(null)
            applyAppearance('system')
            changePalette('blue')
            setSettingsResetStep(false)
            setSettingsPhase('saved')
            settingsSavedRef.current = true
            setSettingsMessage(t('settingsResetDone'))
            if (savedBadgeTimerRef.current !== null) window.clearTimeout(savedBadgeTimerRef.current)
            savedBadgeTimerRef.current = window.setTimeout(() => {
              savedBadgeTimerRef.current = null
              setSettingsMessage('')
            }, 1800)
            notifySettingsChanged()
          } catch {
            setSettingsPhase('error')
            setSettingsMessage(t('settingsResetError'))
          } finally {
            setSettingsResetting(false)
          }
        }

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
        const openSessionInDetails = (session) => {
          const sessionId = typeof session?.sessionId === 'string' ? session.sessionId : ''
          if (sessionId === '') return
          const workspaceKey = session?.workspaceKey
          if (workspaceKey !== undefined && workspaceKey !== null) {
            setExpanded((previous) => ({ ...previous, [workspaceKey]: true }))
          }
          setDetailsQuery('')
          setDetailHighlight({ sessionId, token: Date.now() })
          if (detailHighlightTimerRef.current !== null) window.clearTimeout(detailHighlightTimerRef.current)
          detailHighlightTimerRef.current = window.setTimeout(() => {
            detailHighlightTimerRef.current = null
            setDetailHighlight(null)
          }, 3000)
          goToView('details')
        }
        const onToggleRow = (key) => setExpanded((previous) => ({ ...previous, [key]: !previous[key] }))
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
        if (state.status === 'loading' && data === null) {
          return h('div', { className: pageClassName },
            h('style', null, DSH_TIMESPAN_CSS),
            h('div', { className: 'cs-shell' },
              h('div', { className: 'cs-loading' },
                h('span', { className: 'cs-spinner' }),
                h('strong', null, t('loadingTitle')),
                h('span', null, t('loading')))))
        }
        if (state.status === 'error' && data === null) {
          return h('div', { className: pageClassName },
            h('style', null, DSH_TIMESPAN_CSS),
            h('div', { className: 'cs-shell' },
              h('div', { className: 'cs-loading is-error' },
                h('strong', null, t('errorTitle')),
                h('span', null, t('retryHint')))))
        }

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
          if (view === 'trend') {
            return renderTrendView({
              data, t, isZh, period, onSelectPeriod: setPeriod, durationFormat, hoverTip, nowMs,
            })
          }
          if (view === 'details') {
            return renderDetailsView({
              data: detailsData, t, isZh, query: detailsQuery, onQueryChange: setDetailsQuery,
              durationFormat, expanded, onToggleRow, nowMs, hoverTip,
              highlightSessionId: detailHighlight?.sessionId ?? null,
              detailsRange, onSelectDetailsRange: setDetailsRange,
              progressiveSessions: detailsRange === 'all',
              visibleSessionCounts: detailsVisibleCounts,
              onShowMoreSessions: showMoreDetailsSessions,
            })
          }
          if (view === 'settings') {
            return renderSettingsView({
              t,
              draft: settingsForm,
              phase: settingsPhase,
              message: settingsMessage,
              noticeState,
              appearance,
              palette,
              dataBusy,
              dataMessage,
              clearStep,
              retrying,
              retryError,
              recheckMessage,
              approximateMessage,
              resetStep: settingsResetStep,
              resetting: settingsResetting,
              onPatch: patchSetting,
              onSelectFormat: onSelectSettingsFormat,
              onRequestReset: () => setSettingsResetStep(true),
              onCancelReset: () => setSettingsResetStep(false),
              onResetSettings: resetInitialSettings,
              onRetryLoad: () => setSettingsLoadNonce((value) => value + 1),
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
            onOpenSession: openSessionInDetails,
            focus, onToggleFocus: toggleFocus,
            heroMetric, onSelectHeroMetric: selectHeroMetric,
            heatSeries: heatState.data, heatStatus: heatState.status,
            heatRangeValue, onSelectHeatRange: setHeatRangeValue,
          })
        }

        // 页脚说明按当前视图合并：顶部标题行的口径说明都收进这一枚 ⓘ，避免同一页出现两处。
        const footerLines = [...footerInfoMessages(t, hasApproximate)]
        if (view === 'overview') footerLines.push(...overviewInfoMessages(data, t))
        else if (view === 'trend') footerLines.push(t('trendInfo'))

        return h('div', { className: pageClassName },
          h('style', null, DSH_TIMESPAN_CSS),
          h('div', { className: 'cs-shell' },
            h('header', { className: 'cs-topbar' },
              h('div', { className: 'cs-brand' },
                h('span', { className: 'cs-mark' }, h(DshTimespanIcon, { size: 36, active: true })),
                h('div', { className: 'cs-brand-text' },
                  h('h1', null, t('title')))),
              h('div', { className: 'cs-topbar-right' },
                h('div', { className: 'cs-topbar-group' },
                  h('span', {
                    className: `cs-live cs-live-status${data.taskRunning ? ' is-live is-task' : data.activeRunning ? ' is-live is-active' : ' is-idle'}`,
                  },
                    h('span', { className: 'cs-dot' }),
                    t(data.taskRunning ? 'taskRunning' : data.activeRunning ? 'live' : 'idle')),
                  h('span', { className: 'cs-period-display' },
                    h('span', null, t('currentPeriod')),
                    h('strong', null, t(period === 'day' ? 'cycleToday' : period === 'week' ? 'cycleWeek' : 'cycleMonth')))),
                h('span', { className: 'cs-topbar-divider', 'aria-hidden': true }),
                h('div', { className: 'cs-topbar-group' },
                  h('button', {
                    type: 'button',
                    className: 'cs-icon-toggle',
                    title: appearanceToggleLabel,
                    'aria-label': appearanceToggleLabel,
                    onClick: cycleAppearanceMode,
                  }, h(AppearanceIcon, { mode: appearance })),
                  h('button', {
                    type: 'button',
                    className: 'cs-icon-toggle cs-palette-toggle',
                    title: paletteToggleLabel,
                    'aria-label': paletteToggleLabel,
                    onClick: cyclePalette,
                  }, h(PaletteIcon))))),
            paletteSaveError ? h('div', { className: 'cs-alert', role: 'status' }, t('paletteSaveError')) : null,
            renderApproximateNotice(t, hasApproximate, { onDismiss: onDismissApproximate }),
            state.status === 'error'
              ? h('div', { className: 'cs-alert' }, h('strong', null, t('errorTitle')), ` · ${t('retryHint')}`)
              : null,
            renderBackfillBanner(effectiveBackfill, {
              dismissing: dismissingBackfill,
              dismissError,
              onDismiss: onDismissBackfill,
              retrying,
              retryError,
              onRetry: onRetryBackfill,
            }, t),
            h(TabNav, { view, t, locale: isZh ? 'zh' : 'en', onChange: goToView }),
            h('div', { className: 'cs-views', ref: viewsRef },
              h('div', { className: `cs-curtain${switchingView ? ' is-on' : ''}`, 'aria-hidden': true }),
              h('section', {
                key: view,
                id: `cs-view-${view}`,
                className: `cs-view${switchingView ? ' is-leaving' : ''}`,
                role: 'tabpanel',
                'aria-labelledby': `cs-tab-${view}`,
                'data-view': view,
              },
                view === 'settings' ? h('style', null, DSH_TIMESPAN_SETTINGS_CSS) : null,
                ...renderView())),
            h('footer', { className: 'cs-foot' },
              h('span', null, `${t('todayActive')} ${formatDuration(data.cycles.day.activeMs, durationFormat)} · ${t('todayOnline')} ${formatDuration(data.cycles.day.onlineMs, durationFormat)}`),
              renderInfo(footerLines.join('；'), null, footerLines)),
            h(HoverTip, { key: 'hover-tip', tip: hoverTip.tip })))
      }
    }

    /** 页面与设置页共用同一套自定义下拉外观；颜色跟随所在页面作用域的主题变量。 */
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
        animation: cs-menu-in 180ms ease both;
      }
      .cs-select-menu[hidden] { display: none !important; }
      /* 向上偏好只决定入场动画方向；实际上下由视口空间夹取决定。 */
      .cs-select.is-top .cs-select-menu { animation-name: cs-menu-in-top; }
      .cs-select-menu.is-grid {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px;
        min-width: 224px; max-height: none; overflow: visible; padding: 6px;
      }
      @keyframes cs-menu-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes cs-menu-in-top { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
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
     * 因此在这里按 cs-palette-* / cs-appearance-* 重新声明三档蓝，并给任务段
     * 指定与活跃段明显区分的紫罗兰辅助色；不使用宿主的 success 绿。
     */
    const DSH_TIMESPAN_SIDEBAR_CSS = `
      .dsh-timespan-nav-entry {
        --cs-signal-deep: #133463;
        --cs-signal: #1F4E94;
        --cs-signal-soft: #79B3F9;
        --cs-live: var(--cs-signal);
        --cs-task: #7A5AA6;
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
      /* 状态点贴右：入口撑满宿主行，圆点用 auto 外边距推到行末；inline 保持原来的内容簇布局。 */
      .dsh-timespan-nav-entry.is-dot-end { width: 100%; }
      .dsh-timespan-nav-entry.is-dot-end .dsh-timespan-nav-dot { margin-left: auto; }
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
      .dsh-timespan-nav-entry.cs-palette-clay {
        --cs-signal-deep: #6b3b26; --cs-signal: #a35a37; --cs-signal-soft: #e2ac86;
      }
      .dsh-timespan-nav-entry.cs-appearance-dark {
        --cs-signal-deep: #a9cffa; --cs-signal: #79B3F9; --cs-signal-soft: #3f6ba8;
        --cs-task: #C29BE8;
      }
      .dsh-timespan-nav-entry.cs-appearance-dark.cs-palette-stone {
        --cs-signal-deep: #d9dee0; --cs-signal: #aeb6b9; --cs-signal-soft: #6c7477;
      }
      .dsh-timespan-nav-entry.cs-appearance-dark.cs-palette-clay {
        --cs-signal-deep: #f0c0a4; --cs-signal: #e2ac86; --cs-signal-soft: #8a5a40;
      }
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
        background: var(--cs-live); opacity: 1;
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
        border: 1.5px solid color-mix(in srgb, var(--cs-live) 58%, transparent);
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
      html[data-dsh-timespan-hide-name] button[aria-label="TimeSpan"] { gap: 0; }
      html[data-dsh-timespan-hide-name] button[aria-label="TimeSpan"] > span + span { display: none; }
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

    const DSH_TIMESPAN_CSS = `
      ${CS_SELECT_CSS}
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
        width: 100%;
        max-width: 1320px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }
      .cs-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 44px; }
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
      .cs-topbar-right { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: nowrap; min-width: 0; }
      .cs-topbar-group { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
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
      .cs-live.is-live.is-active .cs-dot { background: var(--cs-live); }
      .cs-live.is-live.is-task .cs-dot { background: var(--cs-task); }
      /* 与侧栏入口一致：活跃/任务进行中时只做一圈向外扩散的呼吸环。 */
      .cs-live.is-live.is-active .cs-dot::before,
      .cs-live.is-live.is-task .cs-dot::before {
        content: ''; position: absolute; inset: -2px; border-radius: 50%;
        border: 1.5px solid color-mix(in srgb, var(--cs-live) 58%, transparent);
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
      .cs-alert {
        padding: 7px 12px; border-radius: 9px; font-size: 12px; line-height: 18px;
        color: var(--dsw-alias-state-error-primary);
        border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent);
        background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
      }
      .cs-backfill {
        display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
        padding: 7px 12px; border-radius: 9px; font-size: 12px; line-height: 18px;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
      }
      .cs-backfill.is-running { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, var(--dsw-alias-border-l1)); }
      /* 近似说明压成一行，长文案省略；关闭按钮只在悬停/聚焦时显色。 */
      .cs-backfill.cs-approx {
        display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, var(--dsw-alias-border-l1));
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, var(--dsw-alias-bg-layer-1));
      }
      .cs-approx-label { flex: none; font-weight: 650; color: var(--dsw-alias-brand-primary); }
      .cs-approx .cs-approx-label + span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .cs-approx-dismiss {
        appearance: none; flex: none; width: 22px; height: 22px; padding: 0;
        display: inline-flex; align-items: center; justify-content: center;
        margin-left: auto; border: 0; border-radius: 6px; background: transparent;
        color: var(--dsw-alias-label-secondary); font: inherit; font-size: 15px; line-height: 1;
        cursor: pointer; opacity: .5;
      }
      .cs-approx-dismiss:hover { opacity: 1; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent); }
      .cs-approx-dismiss:focus-visible { opacity: 1; outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-backfill.is-done {
        border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 30%, var(--dsw-alias-border-l1));
        background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 7%, var(--dsw-alias-bg-layer-1));
      }
      .cs-backfill.is-failed {
        color: var(--dsw-alias-state-error-primary);
        border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent);
        background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
      }
      .cs-backfill-icon {
        display: inline-flex; align-items: center; justify-content: center;
        width: 16px; height: 16px; border-radius: 50%; flex: 0 0 auto;
        font-size: 11px; font-weight: 700; color: var(--dsw-alias-bg-base);
        background: var(--dsw-alias-state-success-primary);
      }
      .cs-backfill.is-failed .cs-backfill-icon { background: var(--dsw-alias-state-error-primary); }
      .cs-backfill-label { font-weight: 600; color: var(--dsw-alias-label-primary); }
      .cs-backfill.is-failed .cs-backfill-label { color: var(--dsw-alias-state-error-primary); }
      .cs-backfill-hint { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; min-width: 0; word-break: break-word; }
      .cs-spinner.is-small { width: 14px; height: 14px; border-width: 2px; flex: 0 0 auto; }
      .cs-backfill-bar {
        flex: 1 1 140px; min-width: 90px; height: 5px; border-radius: 999px; overflow: hidden;
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, var(--dsw-alias-border-l1));
      }
      .cs-backfill-bar i {
        display: block; height: 100%; border-radius: 999px;
        background: var(--dsw-alias-brand-primary); transition: width 0.25s ease;
      }
      .cs-backfill-dismiss, .cs-backfill-retry {
        appearance: none; margin-left: auto; flex: 0 0 auto;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px;
        background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
        font: inherit; font-size: 11px; line-height: 16px; padding: 2px 10px; cursor: pointer;
      }
      .cs-backfill-retry { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
      .cs-backfill-retry:disabled { opacity: 0.55; cursor: default; }
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
      .cs-cycle-track i { display: block; height: 100%; border-radius: inherit; background: var(--cs-signal); }
      .cs-cycle.is-current {
        border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, var(--dsw-alias-border-l1));
        background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1)), var(--dsw-alias-bg-layer-1));
      }
      .cs-cycle.is-current .cs-cycle-track { background: color-mix(in srgb, var(--cs-on-accent) 28%, transparent); }
      .cs-cycle.is-current .cs-cycle-track i { background: var(--cs-on-accent); }
      .cs-card { min-width: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); padding: 13px 16px; }
      .cs-trend-card { display: flex; flex-direction: column; gap: 8px; }
      .cs-table-card { display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; }
      .cs-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      /* 只把概览/趋势区块的标题行整体上提 4px，不动卡片内其它元素与间距。 */
      .cs-overview-grid .cs-card-head,
      .cs-trend-layout .cs-card-head,
      .cs-trend-bottom .cs-card-head { position: relative; top: -4px; }
      .cs-card-heading { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
      .cs-card-heading h2 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 620; }
      .cs-card-hint { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-legend { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .cs-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-swatch { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
      .cs-swatch.is-active { background: var(--cs-live); }
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
      .cs-axis span { position: absolute; top: 0; transform: translateX(-50%); font-size: 10px; line-height: 16px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
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
        .cs-topbar-right { width: 100%; justify-content: space-between; flex-wrap: wrap; }
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

      /* 视觉基座：三档蓝是焦点信息与全部数据状态的唯一来源；灰只做表面、边框、轨道与次级文字。 */
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
        --cs-accent: var(--cs-signal-deep);
        --cs-on-accent: #ffffff;
        --cs-live: var(--cs-signal);
        --cs-task: #7A5AA6;
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
        --cs-dur-tap: 160ms; --cs-dur-exit: 180ms; --cs-dur-view: 300ms; --cs-dur-enter: 420ms;
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
      .cs-page.cs-palette-clay {
        --cs-signal-deep: #6b3b26; --cs-signal: #a35a37; --cs-signal-soft: #e2ac86;
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
        appearance: none; display: inline-flex; align-items: center; justify-content: center;
        width: 30px; height: 30px; padding: 0; border-radius: 8px; cursor: pointer;
        color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1);
        border: 1px solid var(--dsw-alias-border-l1);
        transition: color var(--cs-dur-tap) var(--cs-ease), border-color var(--cs-dur-tap) var(--cs-ease), background-color var(--cs-dur-tap) var(--cs-ease);
      }
      .cs-icon-toggle:hover { color: var(--dsw-alias-label-primary); border-color: color-mix(in srgb, var(--cs-accent) 45%, var(--dsw-alias-border-l1)); }
      .cs-icon-toggle:focus-visible { outline: 2px solid var(--cs-accent); outline-offset: 2px; }
      .cs-icon-toggle svg { display: block; }
      .cs-segmented { background: var(--dsw-alias-bg-layer-1); }
      .cs-segment { padding: 7px 16px; }
      .cs-segment.is-active { background: var(--dsw-alias-brand-primary); color: #fff; box-shadow: none; }
      .cs-section-title { font-size: 17px; line-height: 24px; }
      .cs-cycles { gap: 14px; }
      .cs-cycle { padding: 16px 18px 17px; gap: 0; border-radius: 12px; }
      .cs-cycle.is-current { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
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
        --cs-accent: var(--cs-signal);
        --cs-on-accent: #171a19;
        --cs-task: #C29BE8;
        --cs-error: #f09691;
      }
      .cs-page.cs-appearance-dark.cs-palette-stone {
        --cs-signal-deep: #d9dee0; --cs-signal: #aeb6b9; --cs-signal-soft: #6c7477;
      }
      .cs-page.cs-appearance-dark.cs-palette-clay {
        --cs-signal-deep: #f0c0a4; --cs-signal: #e2ac86; --cs-signal-soft: #8a5a40;
      }
      .cs-segment.is-active, .cs-cycle.is-current { color: var(--cs-on-accent); }
      .cs-appearance-dark .cs-cycle.is-current .cs-cycle-share { color: color-mix(in srgb, var(--cs-on-accent) 72%, var(--cs-surface)); }
      .cs-appearance-dark .cs-segment.is-active { color: var(--cs-on-accent); }
      @media (prefers-reduced-motion: reduce) { .cs-page.cs-page *, .cs-page.cs-page *::before, .cs-page.cs-page *::after { transition-duration: 0s; animation-duration: 0s; } }

      /* 周期卡即入口，右上角只呈现当前选择。 */
      .cs-cycle { appearance: none; font: inherit; color: inherit; text-align: left; cursor: pointer; width: 100%; }
      .cs-cycle:not(.is-current):hover { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, var(--dsw-alias-bg-layer-1)); }
      .cs-cycle:active { transform: translateY(1px); }
      .cs-cycle-head { align-items: center; }
      .cs-cycle-share { margin-left: auto; }
      .cs-period-display { display: inline-flex; align-items: center; gap: 8px; padding: 7px 11px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; white-space: nowrap; }
      .cs-period-display strong { color: var(--dsw-alias-label-primary); font-weight: 600; }
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

      /* 构成圆环与工作区排行均来自当前周期的真实会话累计数据；色阶全部由三档蓝派生。 */
      .cs-page {
        --cs-series-model: var(--cs-signal-deep);
        --cs-series-tool: color-mix(in srgb, var(--cs-signal) 72%, var(--cs-surface));
        --cs-series-wait: color-mix(in srgb, var(--cs-signal) 50%, var(--cs-surface));
        --cs-series-other: color-mix(in srgb, var(--cs-signal) 32%, var(--cs-surface));
        --cs-series-unknown: color-mix(in srgb, var(--cs-signal) 17%, var(--cs-surface));
      }
      /* 普通概览按原型三行 Bento：hero 与周期卡并排，趋势横跨前两列，构成在右，底部三卡并列。 */
      .cs-overview-grid {
        display: grid; grid-template-columns: 1.05fr 1fr 1fr;
        grid-template-rows: auto auto auto; gap: 10px; align-content: start;
      }
      .cs-hero { grid-column: 1; grid-row: 1; }
      .cs-cycles { grid-column: 2 / 4; grid-row: 1; }
      .cs-trend-card { grid-column: 1 / 3; grid-row: 2; }
      .cs-composition { grid-column: 3; grid-row: 2; }
      .cs-ranking { grid-column: 1; grid-row: 3; }
      .cs-recent { grid-column: 2; grid-row: 3; }
      .cs-heatmap-card { grid-column: 3; grid-row: 3; }
      /* 全年 7 行 × 53 列周网格需要整行宽度；最近会话顺势拉宽填满第 3 行，不留空列。 */
      .cs-overview-grid > .cs-heatmap-card[data-range="year"] { grid-column: 1 / -1; grid-row: 4; }
      .cs-overview-grid:has(> .cs-heatmap-card[data-range="year"]) > .cs-recent { grid-column: 2 / 4; }
      @media (max-width: 900px) {
        .cs-overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        /* 窗口收窄时周期卡独占整行，避免三张卡挤在右半列里把内容压扁。 */
        .cs-hero { grid-column: 1 / -1; grid-row: 1; }
        .cs-cycles { grid-column: 1 / -1; grid-row: 2; }
        .cs-trend-card { grid-column: 1 / -1; grid-row: 3; }
        .cs-composition { grid-column: 1; grid-row: 4; }
        .cs-ranking { grid-column: 2; grid-row: 4; }
        .cs-recent { grid-column: 1; grid-row: 5; }
        .cs-heatmap-card { grid-column: 2; grid-row: 5; }
        .cs-overview-grid > .cs-heatmap-card[data-range="year"] { grid-column: 1 / -1; grid-row: 6; }
        .cs-overview-grid:has(> .cs-heatmap-card[data-range="year"]) > .cs-recent { grid-column: 1 / -1; grid-row: 5; }
      }
      @media (max-width: 600px) {
        .cs-overview-grid { grid-template-columns: 1fr; }
        .cs-hero, .cs-cycles, .cs-trend-card, .cs-composition, .cs-ranking, .cs-recent, .cs-heatmap-card {
          grid-column: 1; grid-row: auto;
        }
        .cs-overview-grid > .cs-heatmap-card[data-range="year"] { grid-column: 1; grid-row: auto; }
        .cs-overview-grid:has(> .cs-heatmap-card[data-range="year"]) > .cs-recent { grid-column: 1; grid-row: auto; }
      }
      .cs-analysis-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
      .cs-composition, .cs-ranking { min-height: 250px; display: flex; flex-direction: column; gap: 20px; }
      .cs-composition-body { display: flex; align-items: center; gap: 16px; flex: 1; }
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
      /* 时长可长可短（中文格式「2 小时 48 分」最宽）：标签列吸收收缩，时长列按内容但允许省略，绝不撑出卡片。 */
      .cs-composition-row { display: grid; grid-template-columns: 10px minmax(0,1fr) 38px minmax(0,max-content); align-items: center; gap: 6px; font-size: 12px; min-width: 0; }
      .cs-composition-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cs-series-swatch { width: 9px; height: 9px; border-radius: 2px; }
      .cs-series-swatch.is-model { background: var(--cs-series-model); }
      .cs-series-swatch.is-tool { background: var(--cs-series-tool); }
      .cs-series-swatch.is-wait { background: var(--cs-series-wait); }
      .cs-series-swatch.is-other { background: var(--cs-series-other); }
      .cs-series-swatch.is-unknown { background: var(--cs-series-unknown); }
      .cs-composition-percent, .cs-composition-time, .cs-ranking-time, .cs-ranking-share { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; min-width: 0; }
      .cs-composition-percent, .cs-ranking-share, .cs-rank-index { color: var(--dsw-alias-label-secondary); }
      .cs-composition-time, .cs-ranking-time { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
      .cs-ranking-row { display: grid; grid-template-columns: 23px minmax(65px, 1fr) minmax(45px, 1fr) auto 38px; align-items: center; gap: 10px; font-size: 12px; min-height: 26px; }
      .cs-ranking-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
      .cs-ranking-bar { height: 8px; border-radius: 5px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
      .cs-ranking-bar i { display: block; height: 100%; background: var(--dsw-alias-brand-primary); border-radius: inherit; }
      @media (max-width: 1000px) { .cs-analysis-grid { grid-template-columns: 1fr; } }
      @media (max-width: 520px) { .cs-composition-body { gap: 14px; } .cs-donut { width: 118px; } .cs-donut-center strong { font-size: 14px; } .cs-ranking-row { grid-template-columns: 20px minmax(55px, 1fr) minmax(30px, .7fr) auto; gap: 7px; } .cs-ranking-share { display: none; } }

      .cs-backfill-waiting { color: var(--dsw-alias-label-secondary); }
      .cs-plot { position: relative; padding-left: 58px; }
      .cs-y-axis { position: absolute; left: 0; top: 0; bottom: 0; width: 50px; color: var(--dsw-alias-label-secondary); font-size: 10px; font-variant-numeric: tabular-nums; }
      .cs-y-axis span { position: absolute; right: 0; transform: translateY(-50%); white-space: nowrap; }
      .cs-axis { margin-left: 58px; }
      @media (max-width: 520px) { .cs-plot { padding-left: 50px; } .cs-y-axis { width: 43px; font-size: 9px; } .cs-axis { margin-left: 50px; } }

      /* 解释性信息改为悬浮/聚焦即显示：位置由 JS 按视口夹取，fixed 定位不被卡片裁切。 */
      .cs-data-panels { display: flex; flex-direction: column; gap: 16px; }
      .cs-period-notice { padding: 8px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cs-info { position: relative; display: inline-flex; align-items: center; flex: none; }
      .cs-info button { appearance: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; background: transparent; border-radius: 6px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
      .cs-info button:hover, .cs-info:hover button, .cs-info:focus-within button, .cs-info button:focus-visible { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
      .cs-info button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-info-tip { visibility: hidden; opacity: 0; transform: translateY(-2px); pointer-events: none; position: fixed; z-index: 90; width: max-content; max-width: min(280px, 68vw); padding: 9px 11px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 30px #0003; font-size: 12px; font-weight: 400; line-height: 1.55; white-space: normal; transition: opacity 120ms var(--cs-ease), transform 120ms var(--cs-ease); }
      .cs-info:hover .cs-info-tip,
      .cs-info:focus-within .cs-info-tip { visibility: visible; opacity: 1; transform: translateY(0); }
      .cs-info.is-escaped .cs-info-tip { visibility: hidden !important; opacity: 0 !important; }
      .cs-info-tip.cs-info-tip-legend { padding: 9px 11px; }
      .cs-info-tip.cs-info-tip-lines { max-width: min(320px, 74vw); padding: 10px 12px; }
      .cs-info-content { display: flex; flex-direction: column; gap: 7px; }
      .cs-info-copy { display: block; }
      .cs-info-legend { display: block; }
      .cs-info-lines { display: flex; flex-direction: column; gap: 6px; }
      .cs-info-line { position: relative; display: block; padding-left: 11px; }
      .cs-info-line::before { content: ""; position: absolute; left: 1px; top: .68em; width: 3px; height: 3px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
      /* 热力图说明只展示低→高六档色带，颜色直接取自当前主题变量。 */
      .cs-heat-legend { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
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
      .cs-donut-seg { cursor: pointer; outline: none; transition: stroke-width 160ms ease, opacity 160ms ease, filter 160ms ease; }
      .cs-donut-seg.is-hot, .cs-donut-seg:focus-visible { stroke-width: 15; filter: brightness(1.1); }
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
      @media (max-width: 520px) { .cs-composition-body { flex-direction: column; align-items: center; } .cs-composition-list { width: 100%; } }

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
      .cs-swatch-clay .cs-swatch-dot { background: #B45309; }
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

      /* 票 10：次级导航与四视图骨架。 */
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
      .cs-views { position: relative; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
      .cs-view { display: flex; flex-direction: column; gap: 10px; animation: viewIn var(--cs-dur-view) cubic-bezier(.2, .8, .2, 1) both; }
      .cs-view.is-leaving { animation: viewOut var(--cs-dur-exit) ease both; }
      .cs-curtain {
        position: absolute; inset: 0; z-index: 20; border-radius: 12px;
        background: var(--dsw-alias-bg-base); opacity: 0; pointer-events: none;
        transition: opacity var(--cs-dur-exit) ease;
      }
      .cs-curtain.is-on { opacity: .84; pointer-events: auto; }
      /* 只动 opacity：保留 transform 会让 .cs-view 成为 fixed 浮层的包含块，导致定位错乱。 */
      @keyframes viewIn { from { opacity: .45; } to { opacity: 1; } }
      @keyframes viewOut { from { opacity: 1; } to { opacity: 0; } }

      .cs-recent-list { display: flex; flex-direction: column; }
      .cs-recent-row {
        position: relative; display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto auto;
        align-items: center; gap: 10px; padding: 9px 2px; border: 0;
        background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer;
      }
      /* 分隔线从标题左缘开始；运行中图标收进卡片内边距里，标题不再为它空出 18px 缩进。 */
      .cs-recent-row + .cs-recent-row::before {
        content: ""; position: absolute; left: 0; right: 2px; top: 0;
        border-top: 1px solid var(--dsw-alias-border-l1); pointer-events: none;
      }
      .cs-recent-row:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); }
      .cs-recent-status {
        position: absolute; left: -14px; top: 50%; transform: translateY(-50%);
        display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px;
        color: var(--cs-task);
      }
      .cs-recent-status.is-running .cs-detail-glyph { color: var(--cs-task); }
      .cs-recent-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
      .cs-recent-workspace { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cs-recent-time { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; font-size: 11px; }
      .cs-recent-last { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; text-align: right; }
      .cs-trend-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 10px; align-items: stretch; }
      .cs-trend-layout > .cs-trend-card { grid-column: 1; grid-row: 1; }
      .cs-trend-layout > .cs-trend-summary { grid-column: 2; grid-row: 1; }
      .cs-trend-summary { display: flex; flex-direction: column; gap: 10px; align-self: stretch; }
      .cs-trend-summary .cs-stat-grid {
        display: flex; flex-direction: column; gap: 0; flex: 1 1 auto; min-height: 0;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden;
      }
      .cs-trend-summary .cs-stat-box {
        display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 12px;
        flex: 1 1 0; min-height: 0; padding: 10px 12px;
        border-radius: 0; border: 0; border-top: 1px solid var(--dsw-alias-border-l1); background: transparent;
      }
      .cs-trend-summary .cs-stat-box:first-child {
        border-top: 0;
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, var(--dsw-alias-bg-layer-1));
        box-shadow: inset 3px 0 0 var(--dsw-alias-brand-primary);
      }
      .cs-trend-summary .cs-stat-box:first-child span { color: var(--dsw-alias-label-primary); font-weight: 600; }
      .cs-trend-summary .cs-stat-box span { font-size: 12px; }
      .cs-trend-summary .cs-stat-box b { font-size: 18px; line-height: 24px; }
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
      /* 概览趋势卡底部的四项统计带：贴着卡片底边，填住图表下方原本的空白。 */
      .cs-trend-foot {
        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
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
        .cs-trend-foot { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 0; }
        .cs-trend-foot-item:nth-child(3) { padding-left: 0; border-left: 0; }
      }
      /* 趋势页下半区：时段分布 + 趋势洞察，填满图表下方的留白。 */
      .cs-trend-bottom {
        display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
        gap: 10px; align-items: stretch;
      }
      .cs-trend-breakdown, .cs-trend-insights { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
      .cs-breakdown-list { display: flex; flex-direction: column; justify-content: space-around; gap: 9px; flex: 1 1 auto; min-height: 0; }
      .cs-breakdown-row { display: grid; grid-template-columns: 54px minmax(0, 1fr) 78px; align-items: center; gap: 12px; min-width: 0; }
      .cs-breakdown-label { font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
      .cs-breakdown-track {
        display: flex; align-items: stretch; height: 8px; min-width: 0;
        border-radius: 999px; overflow: hidden; background: var(--cs-tone-faint);
      }
      .cs-breakdown-active { display: block; height: 100%; flex: 0 0 auto; background: var(--cs-live); }
      .cs-breakdown-task { display: block; height: 100%; flex: 0 0 auto; background: var(--cs-task); }
      .cs-breakdown-value {
        font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-variant-numeric: tabular-nums; font-size: 11.5px; line-height: 16px;
        text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .cs-trend-insight-list {
        display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden;
      }
      .cs-trend-insight-row {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        flex: 1 1 0; min-height: 0; padding: 9px 12px;
        border-top: 1px solid var(--dsw-alias-border-l1);
      }
      .cs-trend-insight-row:first-child { border-top: 0; }
      .cs-trend-insight-row span { font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-trend-insight-row b {
        font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-variant-numeric: tabular-nums; font-size: 14px; line-height: 20px; font-weight: 650;
        text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .cs-trend-insight-note { margin: 0; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      @media (max-width: 900px) {
        .cs-trend-bottom { grid-template-columns: 1fr; }
      }
      @media (max-width: 760px) {
        .cs-breakdown-row { grid-template-columns: 46px minmax(0, 1fr) 68px; gap: 8px; }
        .cs-trend-insight-row { padding: 9px 10px; }
      }
      .cs-details-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .cs-details-range { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; }
      .cs-details-range .cs-select-btn {
        min-width: 100px; min-height: 30px; padding: 4px 9px;
        font-size: 11.5px; line-height: 17px; border-radius: 7px;
      }
      .cs-details-range .cs-select-menu { min-width: 116px; padding: 3px; }
      .cs-details-range .cs-opt { padding: 5px 9px; font-size: 11.5px; line-height: 17px; }
      .cs-search {
        flex: 1 1 260px; min-width: 180px; appearance: none; font: inherit; font-size: 12px;
        padding: 7px 12px; border-radius: 9px; color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
      }
      .cs-search:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .cs-details-stats {
        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0; padding: 9px 16px; border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 12px; background: var(--dsw-alias-bg-layer-1);
      }
      .cs-detail-stat {
        display: flex; flex-direction: column; gap: 2px; min-width: 0;
        padding: 3px 16px; border: 0; border-left: 1px solid var(--dsw-alias-border-l1);
        border-radius: 0; background: transparent;
      }
      .cs-detail-stat:first-child { border-left: 0; padding-left: 0; }
      .cs-detail-stat-label { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-detail-stat-value {
        font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-variant-numeric: tabular-nums; font-size: 20px; line-height: 26px; font-weight: 650;
        letter-spacing: -0.03em; color: var(--dsw-alias-label-primary);
      }
      .cs-detail-stat-hint { font-size: 10px; line-height: 14px; color: var(--dsw-alias-label-secondary); }
      .cs-details-layout { display: grid; grid-template-columns: minmax(0, 2.15fr) minmax(280px, .85fr); gap: 12px; align-items: start; }
      .cs-details-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .cs-details-side-card { display: flex; flex-direction: column; gap: 8px; }
      .cs-detail-session-list { display: flex; flex-direction: column; }
      .cs-detail-session {
        display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 10px;
        padding: 9px 0; border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent);
      }
      .cs-detail-session:first-child { border-top: 0; padding-top: 2px; }
      .cs-detail-session-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
      .cs-detail-session-time { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; font-size: 11px; }
      .cs-detail-session-workspace { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
      .cs-detail-session-last { font-size: 10.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; text-align: right; }
      @media (max-width: 1080px) {
        .cs-details-layout { grid-template-columns: minmax(0, 1fr); }
        .cs-details-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .cs-detail-stat:nth-child(3) { border-left: 0; padding-left: 0; }
      }
      @media (max-width: 620px) {
        .cs-details-stats { grid-template-columns: minmax(0, 1fr); padding: 6px 14px; }
        .cs-detail-stat { border-left: 0; border-top: 1px solid var(--dsw-alias-border-l1); padding: 8px 0; }
        .cs-detail-stat:first-child { border-top: 0; }
      }
      .cs-settings-board { display: flex; flex-direction: column; gap: 14px; }
      .cs-settings-hero { display: flex; flex-direction: column; gap: 2px; }
      .cs-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
      .cs-settings-card { min-width: 0; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); align-self: stretch; display: flex; flex-direction: column; }
      .cs-settings-card > h3 { margin: 0 0 4px; font-size: 13px; line-height: 20px; font-weight: 650; }
      /* 卡片内容与高度一起铺开：外观卡片的两行均分多余留白。 */
      .cs-settings-card > .cs-settings-row { flex: 1 1 auto; }
      .cs-settings-wide { grid-column: 1 / -1; }
      .cs-settings-recheck { margin-top: auto; justify-content: flex-start; }
      .cs-btn.is-primary { color: #fff; background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
      .cs-btn.is-primary:hover:not(:disabled) { filter: brightness(1.05); }
      @media (max-width: 860px) {
        .cs-trend-layout, .cs-settings-grid { grid-template-columns: 1fr; }
        .cs-trend-layout > .cs-trend-card, .cs-trend-layout > .cs-trend-summary { grid-column: 1; grid-row: auto; }
        .cs-recent-row { grid-template-columns: minmax(0, 1fr) auto; }
        .cs-recent-workspace { grid-column: 1 / -1; }
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
        display: flex; flex-wrap: wrap; gap: 4px 16px;
        font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary);
        font-variant-numeric: tabular-nums;
      }
      .cs-zoom-btn {
        position: absolute; top: 8px; right: 8px; z-index: 2;
        display: grid; place-items: center; width: 24px; height: 24px; padding: 0;
        border: 0; border-radius: 0; background: transparent; color: var(--cs-ink-2);
        cursor: pointer; opacity: .55;
        transition: opacity var(--cs-dur-tap) var(--cs-ease), transform var(--cs-dur-tap) var(--cs-ease);
      }
      .cs-zoom-btn:hover { opacity: 1; transform: scale(1.15); }
      .cs-zoom-btn:focus-visible { opacity: 1; outline: 2px solid var(--cs-signal); outline-offset: 2px; }
      .cs-zoom-btn svg {
        width: 15px; height: 15px; stroke: var(--cs-ink-2); fill: none;
        stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;
      }
      .cs-hero-focus {
        min-height: calc(100vh - 260px); padding: 28px 32px 24px; gap: 18px;
        display: flex; flex-direction: column;
        background:
          radial-gradient(110% 90% at 4% 0%, color-mix(in srgb, var(--cs-signal-soft) 12%, transparent), transparent 58%),
          var(--dsw-alias-bg-layer-1);
        animation: cs-focus-in var(--cs-focus-ms, 240ms) var(--cs-ease) both;
      }
      /* 主数字是整个首屏唯一的主角：字号拉到接近满高，其他指标退成辅助信息。 */
      .cs-hero-focus .cs-hero-num {
        font-size: clamp(88px, 11.2vw, 156px); line-height: .9; margin-top: 0;
        letter-spacing: -0.065em; font-weight: 640;
      }
      .cs-hero-focus .cs-tag { font-size: 10.5px; padding: 1px 8px; }
      .cs-hero-focus-body {
        display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(250px, .65fr);
        gap: 36px; flex: 1 1 auto; min-height: 0; align-items: center;
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
        position: relative; width: min(100%, 248px); aspect-ratio: 1;
        display: grid; place-items: center; flex: 0 1 auto;
      }
      .cs-hero-ring svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      .cs-hero-ring-track { stroke: var(--cs-ring-track); }
      .cs-hero-ring-value {
        stroke: var(--cs-signal); stroke-linecap: round;
        transition: stroke-dasharray 420ms var(--cs-ease);
      }
      .cs-hero-ring-center {
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px;
        text-align: center;
      }
      .cs-hero-ring-center b {
        font-family: var(--cs-mono); font-variant-numeric: tabular-nums;
        font-size: clamp(42px, 4.2vw, 64px); line-height: .95; font-weight: 660;
        letter-spacing: -.06em; color: var(--cs-ink);
      }
      .cs-hero-ring-center span { font-size: 12px; line-height: 16px; color: var(--cs-ink-3); }
      .cs-hero-ring-legend {
        width: min(100%, 248px); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px; padding-top: 13px; border-top: 1px solid var(--cs-line);
      }
      .cs-hero-ring-legend-item { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .cs-hero-ring-legend-item span {
        display: flex; align-items: center; gap: 6px;
        font-size: 11px; line-height: 16px; color: var(--cs-ink-3); white-space: nowrap;
      }
      .cs-hero-ring-legend-item i { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 8px; background: var(--cs-signal); }
      .cs-hero-ring-legend-item.is-online i { background: var(--cs-ring-track); }
      .cs-hero-ring-legend-item b {
        font-family: var(--cs-mono); font-variant-numeric: tabular-nums;
        font-size: 15px; line-height: 21px; font-weight: 600; color: var(--cs-ink);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .cs-hero-focus .cs-focus-panel { margin-top: 0; }
      .cs-fs-button {
        cursor: pointer; text-align: left; font: inherit; color: inherit;
        transition: border-color var(--cs-focus-ms, 240ms) var(--cs-ease),
          background var(--cs-focus-ms, 240ms) var(--cs-ease);
      }
      .cs-fs-button:hover { background: color-mix(in srgb, var(--cs-signal) 5%, transparent); }
      .cs-fs-button:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: -2px; }
      .cs-fs-button.is-current { background: transparent; border-color: transparent; }
      .cs-fs-button.is-current b { color: var(--cs-signal); }
      @media (max-width: 900px) {
        .cs-hero-focus-body { grid-template-columns: 1fr; gap: 20px; }
        .cs-hero-focus-aside {
          min-height: 0; padding-left: 0; border-left: 0; border-top: 1px solid var(--cs-line);
          padding-top: 16px; flex-direction: row; gap: 28px;
        }
        .cs-hero-ring { width: 190px; }
        .cs-hero-ring-legend {
          width: 190px; grid-template-columns: 1fr; gap: 9px;
          padding-top: 0; border-top: 0;
        }
        .cs-hero-focus .cs-hero-num { font-size: clamp(64px, 16vw, 112px); }
      }
      @media (max-width: 520px) {
        .cs-hero-focus-aside { flex-direction: column; gap: 14px; }
        .cs-hero-ring { width: 168px; }
        .cs-hero-ring-legend {
          width: min(100%, 248px); grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px; padding-top: 11px; border-top: 1px solid var(--cs-line);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-fs-button { transition: none !important; }
      }
      /* 条状图首屏：整页重排为按可用高度铺开的图表，再点右上角缩回。 */
      .cs-trend-card.has-zoom { position: relative; }
      .cs-trend-card.has-zoom .cs-card-head { padding-right: 30px; }
      .cs-trend-focus {
        position: relative; display: flex; flex-direction: column; gap: 16px;
        min-height: calc(100vh - 260px); padding: 26px 30px;
        animation: cs-focus-in var(--cs-focus-ms, 240ms) var(--cs-ease) both;
      }
      .cs-trend-focus .cs-card-head { padding-right: 30px; }
      .cs-trend-focus .cs-chart {
        display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
        height: calc(100vh - 420px);
      }
      .cs-trend-focus .cs-plot { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 280px; }
      .cs-trend-focus .cs-chart svg { flex: 1 1 auto; height: 100%; min-height: 280px; }
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
      .cs-fs-item span { font-size: 10.5px; line-height: 16px; color: var(--cs-ink-3); }
      .cs-fs-item b {
        font-family: var(--cs-mono); font-variant-numeric: tabular-nums;
        font-size: 20px; line-height: 26px; font-weight: 620; color: var(--cs-ink);
        letter-spacing: -.02em;
      }
      @media (max-width: 620px) {
        .cs-focus-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .cs-fs-item { padding: 6px 12px; }
        .cs-fs-item:nth-child(2n + 1) { border-left: 0; padding-left: 0; }
        .cs-fs-item:last-child:nth-child(odd) { grid-column: 1 / -1; margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--cs-line); }
      }
      @media (max-width: 600px) {
        .cs-hero-focus { min-height: calc(100vh - 320px); padding: 18px 16px; }
        .cs-trend-focus { min-height: calc(100vh - 320px); padding: 18px 16px; }
        .cs-trend-focus .cs-chart { height: calc(100vh - 480px); }
        .cs-fs-item { flex-basis: 120px; min-width: 108px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-view, .cs-view.is-leaving, .cs-curtain, .cs-tab-thumb,
        .cs-hero-focus, .cs-trend-focus, .cs-zoom-btn { animation: none !important; transition: none !important; }
        .cs-trend-focus .cs-bar-group .cs-bar-pair { transition: none !important; }
      }

      /* 每日活跃热力图：全年、3m/6m 共用 7 行周网格，单月是 7 列日历。 */
      .cs-heatmap-card {
        --cs-heat-cell: clamp(10px, 1.2vw, 18px); --cs-heat-gap: 3px;
        position: relative; overflow: visible;
        display: flex; flex-direction: column; gap: 12px;
      }
      /* 范围选择器只收窄触发器；弹出的三列 15 项菜单保持完整，避免选项被裁切。 */
      .heat-range-select .cs-select-btn {
        width: 78px; min-width: 78px; max-width: 78px;
        min-height: 28px; padding: 4px 7px; gap: 5px;
      }
      .heat-range-select .cs-select-val { font-size: 11.5px; }
      .heat-card-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
      .heatmap-body { display: flex; align-items: flex-start; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
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
      .heat-summary { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }

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
        border-radius: 3px 3px 0 0; background: var(--cs-heat-3);
        transition: height 200ms var(--cs-ease);
      }
      .heat-month-bar::after {
        content: attr(data-month); position: absolute; top: calc(100% + 4px); left: 50%;
        transform: translateX(-50%); font-size: 10px; line-height: 12px;
        color: var(--dsw-alias-label-secondary); white-space: nowrap;
      }

      /* 单月：7 列日历，星期刻度与格子共用同一列宽，保证严格对齐。 */
      .heat-month { display: flex; flex-direction: column; gap: 4px; width: min(100%, 460px); min-width: 0; }
      .heat-month-weekdays {
        display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px;
        font-size: 10px; line-height: 12px; text-align: center;
        color: var(--dsw-alias-label-secondary);
      }
      .heat-month-grid {
        display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px;
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

      /* 热力图首屏：上半区整幅全年热力图，下半区左侧统计、右侧月度活跃。 */
      .cs-heatmap-focus-page {
        min-height: calc(100vh - 260px); display: flex; flex-direction: column;
        animation: cs-focus-in var(--cs-focus-ms, 240ms) var(--cs-ease) both;
      }
      .cs-heatmap-focus-page > .cs-heatmap-card { flex: 1 1 auto; min-height: 0; }
      .cs-heatmap-focus {
        --cs-heat-cell: clamp(16px, 1.6vw, 28px); --cs-heat-gap: 4px;
        flex: 1 1 auto; min-height: 0; gap: 16px; padding: 20px 24px 20px;
      }
      .cs-heatmap-card.has-zoom .cs-card-head { padding-right: 30px; }
      .heat-focus-layout {
        display: flex; flex-direction: column; gap: 16px;
        min-height: 0; flex: 1 1 auto;
      }
      .heat-focus-main {
        min-width: 0; display: flex; align-items: center; justify-content: center;
        flex: 1 1 auto; min-height: clamp(200px, 32vh, 360px);
      }
      .heat-focus-visual { width: 100%; display: flex; flex-direction: column; gap: 8px; }
      .cs-heatmap-focus .heatmap-body {
        width: 100%; align-items: center; justify-content: center;
        flex: 0 1 auto; min-height: 0; overflow-x: auto; overflow-y: visible;
      }
      .cs-heatmap-focus .heat-plot { flex: 1 1 auto; width: 100%; min-width: 0; }
      /* 3m/6m 首屏：星期刻度与固定像素周网格作为一个整体居中，月份刻度与网格同宽。 */
      .cs-heatmap-focus:not([data-layout="year"]) .heatmap-body {
        width: fit-content; max-width: 100%; margin: 0 auto;
        justify-content: flex-start;
      }
      .cs-heatmap-focus:not([data-layout="year"]) .heat-plot {
        flex: 0 0 auto; width: max-content;
      }
      .cs-heatmap-focus:not([data-layout="year"]) .heat-months.is-grid {
        width: max-content; max-width: 100%; margin: 0 auto;
      }
      /* 全年 53 列铺满整行；其它范围保持大小适中的正方形，居中而不无限放大。 */
      .cs-heatmap-focus .heat-weekgrid {
        width: 100%; grid-auto-columns: minmax(0, 1fr); grid-template-rows: repeat(7, auto);
        gap: var(--cs-heat-gap);
      }
      .cs-heatmap-focus:not([data-layout="year"]) .heat-weekgrid {
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
      .cs-heatmap-focus[data-layout="month"] .heat-month { width: min(100%, 560px); max-width: 560px; margin: 0 auto; }
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
      .cs-heatmap-focus .heat-month-bars { height: 92px; min-height: 0; padding-bottom: 16px; }
      @media (max-width: 900px) {
        .heat-focus-layout { gap: 14px; }
        .heat-focus-bottom { grid-template-columns: 1fr; gap: 16px; align-items: stretch; }
      }
      @media (max-width: 600px) {
        .cs-heatmap-focus { padding: 16px 14px; --cs-heat-cell: clamp(13px, 4.5vw, 20px); }
        .heat-focus-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .heat-focus-panel .cs-fs-item:nth-child(3n + 1) { border-left: 1px solid color-mix(in srgb, var(--cs-line) 80%, transparent); padding-left: 14px; }
        .heat-focus-panel .cs-fs-item:nth-child(2n + 1) { border-left: 0; padding-left: 0; }
        .cs-heatmap-focus .heatmap-body.is-year { --cs-heat-cell: 14px; }
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
      .cs-summary { padding: 8px 12px; }
      .cs-trend-card, .cs-table-card { gap: 10px; }
      /* 设置页留白：卡片按自然高度排，不再把两行卡强行拉到四行卡的高度。 */
      .cs-settings-grid { gap: 10px; align-content: start; }
      .cs-settings-card { align-self: start; }
      .cs-settings-card > .cs-settings-row { flex: 0 0 auto; }
      .cs-import-hint { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 14px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-import-file-state { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
    `

    /** 设置页独立挂载在 settings.section，样式自成一套，不依赖仪表盘根节点。 */
    const DSH_TIMESPAN_SETTINGS_CSS = `
      ${CS_SELECT_CSS}
      .cs-settings { box-sizing: border-box; color: var(--dsw-alias-label-primary); font-family: inherit; }
      .cs-settings *, .cs-settings *::before, .cs-settings *::after { box-sizing: border-box; }
      .cs-settings-inner { display: flex; flex-direction: column; gap: 18px; max-width: 720px; }
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
      .cs-settings-unit { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .cs-settings-switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
      .cs-settings-switch input { width: 16px; height: 16px; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
      /* Dashboard 设置：12 列双栏板。统计与数字格式在上，外观/初始化/通知/数据交错排布，
         宽屏利用横向空间，窄屏自动回到单列；每张卡只占内容需要的高度。 */
      .cs-settings-board .cs-settings-grid {
        grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; align-items: start;
      }
      .cs-settings-board .cs-settings-card { padding: 13px 15px; align-self: start; }
      .cs-settings-main { grid-column: span 7; }
      .cs-settings-side { grid-column: span 5; }
      .cs-settings-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
      .cs-settings-card-head h3 { margin: 0; font-size: 13px; line-height: 19px; font-weight: 650; }
      .cs-settings-card-sub { margin: 2px 0 0; font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-settings-scope {
        flex: none; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1);
        color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 16px; letter-spacing: .02em;
      }
      .cs-settings-list { display: flex; flex-direction: column; margin-top: 6px; }
      .cs-settings-list .cs-settings-row:last-child { border-bottom: 0; padding-bottom: 1px; }
      /* 仪表盘宽卡：统计项排成两列；行数为奇数时最后一行独占整行，避免右半张卡空着。 */
      .cs-settings-list.is-split {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 18px; row-gap: 0;
      }
      .cs-settings-list.is-split .cs-settings-row {
        grid-template-columns: minmax(0, 1fr) auto; gap: 10px;
      }
      .cs-settings-list.is-split .cs-settings-row:last-child { grid-column: 1 / -1; }
      /* 行数为偶数时（含界面语言后的六项）两列正好填满，最后一行不再独占整行。 */
      .cs-settings-list.is-split.is-even .cs-settings-row:last-child { grid-column: auto; }
      .cs-settings-list.is-split .cs-settings-row > div:first-child { min-width: 0; }
      .cs-settings-list.is-split .cs-settings-control { justify-content: flex-end; }
      .cs-settings-board .cs-format-card { align-self: stretch; }
      .cs-settings-board .cs-format-card .cs-format-section {
        display: flex; flex: 1 1 auto; flex-direction: column; height: 100%;
      }
      /* 与左侧统计卡同高时，把五档排成两列三行，竖向填满而不是堆在顶部。 */
      @media (min-width: 1101px) {
        .cs-settings-board .cs-format-grid {
          display: grid; flex: 1 1 auto; grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px; align-content: center;
        }
        .cs-settings-board .cs-format-opt {
          flex: none; min-height: 40px; justify-content: flex-start; padding: 5px 9px;
        }
        .cs-settings-board .cs-format-opt:last-child { grid-column: 1 / -1; }
      }
      .cs-format-shared {
        margin: auto 0 0; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1);
        font-size: 10.5px; line-height: 16px; color: var(--dsw-alias-label-secondary);
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
      .cs-palette-opt.cs-palette-clay { --cs-swatch-1: #6b3b26; --cs-swatch-2: #a35a37; --cs-swatch-3: #e2ac86; }
      @media (max-width: 1100px) {
        .cs-settings-board .cs-settings-grid { grid-template-columns: minmax(0, 1fr); }
        .cs-settings-main, .cs-settings-side { grid-column: 1 / -1; }
      }
      @media (max-width: 760px) {
        .cs-appearance-panel { grid-template-columns: 1fr; }
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
      .cs-format-grid { display: flex; flex-wrap: wrap; gap: 5px; }
      .cs-format-opt {
        display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        flex: 1 1 80px; min-height: 30px; padding: 4px 7px;
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
      .cs-format-opt span { font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
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
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-timespan-presence',
            },
            createPresenceReporter(ctx),
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
            createPage(ctx),
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
