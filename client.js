/**
 * ChronoScope 的 Client 半。
 *
 * 四件事：在侧边栏注册常驻入口并显示今日活跃时长；在 frame-wide overlay 上
 * 挂载 presence 心跳（每 15 秒上报页面可见性、窗口聚焦、前台会话与最近操作）；
 * 在 main 的 chrono-scope 键下渲染日/周/月仪表盘（含导出与二次确认清空）；
 * 在 settings.section 下渲染统计与侧栏显示设置。页面只负责渲染与交互，
 * 周期边界、跨午夜裁剪、并发并集、会话求和、设置归一化与文件序列化全部由
 * Host 领域服务计算；Client 不缓存业务状态，刷新后所有数字都重新从 Host 读取。
 *
 * 视觉基座：页面容器用 cs-palette-* 与 cs-appearance-* 切换 CSS 变量；
 * 三档蓝 --cs-signal-deep/--cs-signal/--cs-signal-soft 派生 --cs-live、--cs-task、
 * --cs-tone-* 与 --cs-heat-*，灰色只用于表面、边框、轨道与次级文字。
 * 外观 helper（normalizePalette/normalizeAppearance/cycleAppearance/resolveAppearance）
 * 与 Info 组件供后续票据复用。
 */

window.__ModuleLoader__.load({
  id: '@local/chrono-scope',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'chrono-scope'
    /** 三套配色；blue 为默认。旧值（mono/green/warm）一律回落到 blue。 */
    const PALETTES = ['blue', 'stone', 'clay']
    /** 外观三态按用户确认的顺序循环：浅色 → 深色 → 跟随系统。 */
    const APPEARANCE_ORDER = ['light', 'dark', 'system']
    /** 数字格式五档；顺序与原型 FORMATS 一致，也是设置页卡片的展示顺序。 */
    const DURATION_FORMAT_ORDER = ['hms', 'short', 'zh', 'sec', 'padded']
    /** 设置页卡片与预览行统一用原型里的 2:48:16 作为示例值。 */
    const DURATION_FORMAT_SAMPLE_MS = 2 * 3_600_000 + 48 * 60_000 + 16_000
    const PRESENCE_HEARTBEAT_MS = 15_000
    const SIDEBAR_REFRESH_MS = 5_000
    const PAGE_REFRESH_MS = 10_000
    /** 回填进行时加快轮询，让进度与完成后的数字尽快出现，无需刷新页面。 */
    const BACKFILL_REFRESH_MS = 2_000
    /** 四个同级视图；tab 顺序即键盘左右方向键的顺序。 */
    const VIEWS = ['overview', 'trend', 'details', 'settings']
    /** 视图入场 300ms、退场 180ms（进入的 60%）；减少动效时直接到位。 */
    const VIEW_ENTER_MS = 300
    const VIEW_EXIT_MS = 180

    const zh = {
      title: 'ChronoScope',
      subtitle: 'DSH 时长统计',
      todayActive: '今日活跃时长',
      todayOnline: '今日在线时长',
      todayTask: '今日任务时长',
      live: '活跃中',
      idle: '空闲',
      onlineLive: '正在记录',
      onlinePaused: '已暂停',
      taskRunning: '任务进行中',
      taskIdle: '无运行任务',
      taskCountLabel: '任务数',
      actualOccupied: '实际占用',
      sessionTasks: '会话任务',
      accumulated: '累计工时',
      noTasks: '今天还没有任务记录',
      unknownSession: '未命名会话',
      unassigned: '未归属',
      runningTag: '运行中',
      approximateTag: '近似',
      approximateHint: '记录按最后心跳/最后事件时间近似收口，时长可能偏短',
      approximateNotice: '存在按最后心跳或最后事件时间近似收口的记录（异常结束、重载、长时间无心跳或时钟跳变），相关时长可能偏短。',
      notBroken: '未拆分',
      breakdownModel: '模型',
      breakdownTool: '工具',
      breakdownWait: '等待',
      breakdownOther: '其他',
      loading: '读取中…',
      error: '暂时无法读取时长统计，正在自动重试',
      sinceBoot: '活跃按页面可见、窗口聚焦与键鼠操作判定',
      localOnly: '数据仅保存在本机',
      navTooltip: 'ChronoScope · 今日在线、活跃与任务时长',
      sidebarRingTitle: '今日时长构成',
      periodDay: '日',
      periodWeek: '周',
      periodMonth: '月',
      periodLabel: '统计周期',
      paletteLabel: '配色',
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
      tabsLabel: 'ChronoScope 页面',
      recentSessions: '最近会话',
      recentSessionsHint: '按最近活动排序',
      recentSessionsEmpty: '当前周期还没有会话记录',
      trendSummary: '本周期概览',
      peakActive: '峰值活跃',
      searchPlaceholder: '搜索工作区或会话',
      detailsEmpty: '没有匹配的工作区或会话',
      settingsPageTitle: '仪表盘设置',
      settingsPageHint: '设置只保存在本机，保存后立即影响后续统计，重启后仍然生效。',
      settingsSectionAppearance: '外观与配色',
      settingsRecheck: '重新检查回填',
      settingsRechecking: '正在检查…',
      settingsRecheckDone: '已重新检查回填状态',
      settingsRecheckError: '重新检查失败，请重试',
      periodLoading: '正在更新，暂时显示',
      periodLoadFailed: '更新失败，暂时显示',
      trendInfo: '活跃与任务时长分别统计，可能重叠；悬停柱形可查看具体时长。',
      compositionInfo: '按会话累计的任务构成；缺少构成记录的历史任务计入未拆分。并发会话时长会分别相加。',
      periodHint: '选择周期查看明细',
      compositionTitle: '任务时长构成',
      compositionHint: '按会话累计',
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
      recordSinceBoot: '在线/活跃从插件启用时开始记录；历史只回填任务时长',
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
      unionTag: '实际占用 · 并集',
      sumTag: '累计工时 · 会话求和',
      trendDay: '今日逐小时',
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
      expand: '展开会话',
      collapse: '收起会话',
      unionFoot: '实际占用：多会话重叠时段只计一次',
      sumFoot: '累计工时：明细按会话逐条累加',
      onlineFoot: '在线时长包含挂机时间',
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
      subagentDetail: '含子代理任务',
      subagentDetailHint: '{count} 条 · {duration}（不计入总计）',
      settingsNav: 'ChronoScope',
      settingsTitle: 'ChronoScope 设置',
      settingsHint: '设置只保存在本机，保存后立即影响后续统计，重启后仍然生效。',
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
      settingsSidebarNameLabel: '侧栏显示名称',
      settingsSidebarNameHint: '关闭后侧栏入口只保留时长、状态点与今日构成环，仍保持单行紧凑。',
      settingsSidebarNameOn: '显示名称',
      settingsSidebarNameOff: '隐藏名称',
      settingsSave: '保存设置',
      settingsSaving: '正在保存…',
      settingsSaved: '已保存，统计已按新设置更新',
      settingsLoadError: '无法读取设置，请重试',
      settingsRetry: '重试',
      settingsSaveError: '设置保存失败，请重试',
      settingsSectionGeneral: '统计口径',
      settingsSectionDisplay: '明细展示',
      settingsSectionFormat: '数字格式',
      settingsFormatHint: '选择后整页立即预览；点「保存设置」才写入 Host，刷新后仍使用已保存的格式。',
      formatHintHms: '时:分:秒',
      formatHintShort: '紧凑单位',
      formatHintZh: '中文单位',
      formatHintSec: '纯秒',
      formatHintPadded: '补零时钟',
      formatPreviewLabel: '预览 · 2:48:16 显示为',
      settingsSectionNotices: '通知记录',
      dataTitle: '数据管理',
      dataHint: '导出包含原始区间、任务与设置；清空只删除 ChronoScope 统计记录，不影响会话日志。',
      exportJson: '导出 JSON',
      exportCsv: '导出 CSV',
      exporting: '正在导出…',
      exportDone: '导出文件已开始下载',
      exportTruncated: '导出文件已开始下载；数据跨度超过上限，仅包含最近的部分',
      exportError: '导出失败，请重试',
      clearData: '清空全部数据',
      clearStepTitle: '确认清空？',
      clearStepHint: '这会删除本机全部 ChronoScope 在线、活跃与任务记录，且无法撤销；会话日志不受影响，设置会保留。',
      clearConfirm: '确认清空',
      clearCancel: '取消',
      clearing: '正在清空…',
      clearError: '清空失败，请重试',
      cleared: '已清空，统计已重置',
    }

    const en = {
      title: 'ChronoScope',
      subtitle: 'DSH time tracking',
      todayActive: 'Active today',
      todayOnline: 'Online today',
      todayTask: 'Task time today',
      live: 'Active',
      idle: 'Idle',
      onlineLive: 'Recording',
      onlinePaused: 'Paused',
      taskRunning: 'Task running',
      taskIdle: 'No running task',
      taskCountLabel: 'Tasks',
      actualOccupied: 'Actual occupied',
      sessionTasks: 'Session tasks',
      accumulated: 'Accumulated',
      noTasks: 'No tasks recorded today',
      unknownSession: 'Untitled session',
      unassigned: 'Unassigned',
      runningTag: 'Running',
      approximateTag: 'Approx.',
      approximateHint: 'Closed at the last heartbeat or event; duration may be short',
      approximateNotice: 'Some records were approximated at their last heartbeat or last event (abnormal end, reload, long silence or clock change); the affected durations may be short.',
      notBroken: 'Not broken down',
      breakdownModel: 'Model',
      breakdownTool: 'Tools',
      breakdownWait: 'Waiting',
      breakdownOther: 'Other',
      loading: 'Loading…',
      error: 'Unable to read time statistics. Retrying automatically.',
      sinceBoot: 'Active time follows page visibility, window focus and input',
      localOnly: 'Data stays on this device',
      navTooltip: 'ChronoScope · online, active and task time today',
      sidebarRingTitle: 'Time breakdown today',
      periodDay: 'Day',
      periodWeek: 'Week',
      periodMonth: 'Month',
      periodLabel: 'Period',
      paletteLabel: 'Colors',
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
      tabsLabel: 'ChronoScope pages',
      recentSessions: 'Recent sessions',
      recentSessionsHint: 'Ordered by recent activity',
      recentSessionsEmpty: 'No sessions in this period yet',
      trendSummary: 'Period summary',
      peakActive: 'Peak active',
      searchPlaceholder: 'Search workspaces or sessions',
      detailsEmpty: 'No matching workspaces or sessions',
      settingsPageTitle: 'Dashboard settings',
      settingsPageHint: 'Settings stay on this device, apply to later statistics immediately and survive restarts.',
      settingsSectionAppearance: 'Appearance and colors',
      settingsRecheck: 'Recheck backfill',
      settingsRechecking: 'Checking…',
      settingsRecheckDone: 'Backfill status rechecked',
      settingsRecheckError: 'Recheck failed; please retry',
      periodLoading: 'Updating; still showing',
      periodLoadFailed: 'Update failed; still showing',
      trendInfo: 'Active and task time are measured independently and may overlap. Hover a bar for its value.',
      compositionInfo: 'Task time summed across sessions. Historical tasks without a breakdown are listed as not broken down.',
      periodHint: 'Select a period for details',
      compositionTitle: 'Task time breakdown',
      compositionHint: 'Summed across sessions',
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
      recordSinceBoot: 'Online/active time is recorded from plugin enablement; history only backfills task time',
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
      unionTag: 'Actual occupied · union',
      sumTag: 'Accumulated · per session',
      trendDay: 'Hourly today',
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
      expand: 'Expand sessions',
      collapse: 'Collapse sessions',
      unionFoot: 'Actual occupied: overlapping sessions count once',
      sumFoot: 'Accumulated: detail rows add up per session',
      onlineFoot: 'Online time includes idle time',
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
      subagentDetail: 'Includes subagent tasks',
      subagentDetailHint: '{count} · {duration} (excluded from totals)',
      settingsNav: 'ChronoScope',
      settingsTitle: 'ChronoScope settings',
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
      settingsSidebarNameLabel: 'Show sidebar name',
      settingsSidebarNameHint: 'When off, the sidebar entry keeps the duration, status dot and today ring, staying on one compact line.',
      settingsSidebarNameOn: 'Show name',
      settingsSidebarNameOff: 'Hide name',
      settingsSave: 'Save settings',
      settingsSaving: 'Saving…',
      settingsSaved: 'Saved; statistics now use the new settings',
      settingsLoadError: 'Unable to read settings; please retry',
      settingsRetry: 'Retry',
      settingsSaveError: 'Could not save settings; please retry',
      settingsSectionGeneral: 'Counting rules',
      settingsSectionDisplay: 'Detail display',
      settingsSectionFormat: 'Number format',
      settingsFormatHint: 'The whole page previews immediately; only “Save settings” writes to the Host, and the saved format survives refresh.',
      formatHintHms: 'Hours:minutes:seconds',
      formatHintShort: 'Compact units',
      formatHintZh: 'Chinese units',
      formatHintSec: 'Total seconds',
      formatHintPadded: 'Padded clock',
      formatPreviewLabel: 'Preview · 2:48:16 shows as',
      settingsSectionNotices: 'Notifications',
      dataTitle: 'Data',
      dataHint: 'Exports include raw intervals, tasks and settings; clearing removes only ChronoScope records, not session logs.',
      exportJson: 'Export JSON',
      exportCsv: 'Export CSV',
      exporting: 'Exporting…',
      exportDone: 'Download started',
      exportTruncated: 'Download started; the range exceeds the limit and only the most recent part is included',
      exportError: 'Export failed; please retry',
      clearData: 'Clear all data',
      clearStepTitle: 'Clear everything?',
      clearStepHint: 'This deletes all local ChronoScope online, active and task records and cannot be undone. Session logs are untouched and settings are kept.',
      clearConfirm: 'Confirm clear',
      clearCancel: 'Cancel',
      clearing: 'Clearing…',
      clearError: 'Clear failed; please retry',
      cleared: 'Cleared; statistics have been reset',
    }

    /** 每个页面实例一个 Client 标识；刷新后旧区间按最后心跳收口。 */
    const CLIENT_ID = createClientId()

    function createClientId() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `client_${crypto.randomUUID()}`
      }
      return `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
    }

    function ChronoIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 16
      return h('svg', {
        className: 'chronoscope-nav-icon', width: size, height: size,
        viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
      },
      h('circle', { cx: 12, cy: 12, r: 8.5, stroke: 'currentColor', strokeWidth: 2.2,
        strokeLinecap: 'round', strokeDasharray: '11 3 7 3 5 3', transform: 'rotate(-90 12 12)' }),
      h('path', { d: 'M12 12l4-4', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }),
      h('circle', { cx: 12, cy: 12, r: 1.8, fill: 'currentColor' }))
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

    function appearanceLabelKey(mode) {
      if (mode === 'dark') return 'appearanceDark'
      if (mode === 'system') return 'appearanceSystem'
      return 'appearanceLight'
    }

    function formatDuration(ms, format = 'hms') {
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

    /** 数字格式只认五种预设；旧响应、脏草稿与非法值一律回落 hms。 */
    function normalizeDurationFormat(value) {
      return typeof value === 'string' && DURATION_FORMAT_ORDER.includes(value) ? value : 'hms'
    }

    function durationFormatHintKey(format) {
      if (format === 'short') return 'formatHintShort'
      if (format === 'zh') return 'formatHintZh'
      if (format === 'sec') return 'formatHintSec'
      if (format === 'padded') return 'formatHintPadded'
      return 'formatHintHms'
    }

    /** 配色只认 blue / stone / clay；旧 localStorage 里的 mono/green/warm 等值回落到默认蓝。 */
    function normalizePalette(value) {
      return PALETTES.includes(value) ? value : 'blue'
    }

    /** 外观只认 light / dark / system；旧值或非法值按浅色处理，不让旧存储破坏页面。 */
    function normalizeAppearance(value) {
      return APPEARANCE_ORDER.includes(value) ? value : 'light'
    }

    /** 点击循环：浅色 → 深色 → 跟随系统 → 浅色。非法值先归一到浅色。 */
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

    /** 侧栏入口在宿主侧栏里，读取与仪表盘同一份浏览器本地主题偏好。 */
    function readStoredTheme() {
      let palette = 'blue'
      let appearance = 'light'
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          palette = normalizePalette(window.localStorage.getItem('chrono-scope.palette'))
          appearance = normalizeAppearance(window.localStorage.getItem('chrono-scope.appearance'))
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
      const result = await connection.rpc.call('/api', 'chrono-scope', { method, payload })
      if (result !== null && typeof result === 'object' && result.ok === true) return result.value
      const message = result?.error?.message ? String(result.error.message) : 'RPC 调用失败'
      throw new Error(message)
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
      anchor.download = file?.filename ?? `chronoscope.${file?.format ?? 'json'}`
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
        sidebarShowName: value?.sidebarShowName !== false,
      }
    }

    /** 设置页保存载荷：只提交可编辑字段，布尔值按 Host 契约收敛。 */
    function settingsPayload(draft) {
      return {
        idleThresholdMinutes: Number(draft.idleThresholdMinutes),
        weekStartsOn: Number(draft.weekStartsOn),
        showSubagents: draft.showSubagents === true,
        durationFormat: normalizeDurationFormat(draft.durationFormat),
        sidebarShowName: draft.sidebarShowName !== false,
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
        durationFormat: 'hms',
      })

      React.useEffect(() => {
        let active = true
        const load = async () => {
          try {
            const value = await callHost(ctx, 'queryStats', { period: 'day' })
            if (!active) return
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

    /** 活跃时长随心跳实时增长；其余两项仍来自同一份 Host 快照。 */
    function sidebarLiveElapsed(stats) {
      return stats?.activeRunning ? Math.max(0, Date.now() - finite(stats.receivedAt)) : 0
    }

    function sidebarDisplayMs(stats) {
      return finite(stats?.activeMs) + sidebarLiveElapsed(stats)
    }

    /** 悬停 / 聚焦浮层：三项具体数值。 */
    function buildSidebarTip(stats, t, format = 'hms') {
      return {
        kind: 'sidebar',
        key: 'today',
        title: t('sidebarRingTitle'),
        rows: [
          { key: 'online', label: t('onlineLabel'), value: formatDuration(finite(stats?.onlineMs), format) },
          { key: 'active', label: t('activeLabel'), value: formatDuration(sidebarDisplayMs(stats), format) },
          { key: 'task', label: t('taskLabel'), value: formatDuration(finite(stats?.taskMs), format) },
        ],
      }
    }

    /**
     * 侧栏入口的纯渲染层：主题、名称显隐与三项数值都可从外部注入，
     * 便于在隔离上下文断言结构；真实组件只负责轮询与订阅。
     */
    function renderSidebarEntry({ stats, theme, showName = true, t, hover, size, format = 'hms' }) {
      const wide = typeof size !== 'number' || size !== 18
      const themeClass = sidebarThemeClass(theme?.palette, theme?.appearance, theme?.systemDark === true)
      const segments = sidebarRingSegments(stats)
      const tip = buildSidebarTip(stats, t, format)
      const activeMs = sidebarDisplayMs(stats)
      const value = stats?.status === 'loading' ? '–:––:––' : formatDuration(activeMs, format)
      const summary = `${t('navTooltip')}：${t('onlineLabel')} ${formatDuration(finite(stats?.onlineMs), format)} · ${t('activeLabel')} ${formatDuration(activeMs, format)} · ${t('taskLabel')} ${formatDuration(finite(stats?.taskMs), format)}`
      const handlers = {
        onMouseEnter: (event) => hover?.show?.(tip, event),
        onFocus: (event) => hover?.show?.(tip, event),
        onMouseLeave: () => hover?.hide?.(),
        onBlur: () => hover?.hide?.(),
        onKeyDown: (event) => {
          if (event?.key === 'Escape') hover?.hide?.()
        },
      }
      return h('span', {
        className: `chronoscope-nav-entry ${themeClass}`,
        tabIndex: 0,
        'aria-label': summary,
        ...handlers,
      },
      h('style', null, CHRONOSCOPE_SIDEBAR_CSS),
      h('span', {
        className: 'chronoscope-nav-ring',
        style: { background: sidebarRingGradient(segments) },
        'aria-hidden': true,
      }),
      wide
        ? h('span', {
            className: `chronoscope-nav-time${stats?.activeRunning ? ' is-live' : ''}`,
          }, value)
        : null,
      wide && showName
        ? h('span', { className: 'chronoscope-nav-name' }, t('title'))
        : null,
      wide
        ? h('span', {
            className: `chronoscope-nav-dot${stats?.activeRunning ? ' is-live' : ''}`,
            role: 'img',
            'aria-label': stats?.activeRunning ? t('live') : t('idle'),
          })
        : null,
      hover?.tip ? h(HoverTip, { tip: hover.tip, id: 'chronoscope-sidebar-tip' }) : null)
    }

    /** 侧边栏常驻入口：今日构成环 + 活跃时长 + 可隐藏名称 + 状态点。 */
    function createSidebarEntry(ctx, t) {
      return function ChronoScopeSidebarEntry(props) {
        const [previewFormat, setPreviewFormat] = React.useState(null)
        const [refreshNonce, setRefreshNonce] = React.useState(0)
        const stats = useTodayStats(ctx, SIDEBAR_REFRESH_MS, refreshNonce)
        const [theme, setTheme] = React.useState(readStoredTheme)
        const [systemDark, setSystemDark] = React.useState(systemPrefersDark)
        const [showName, setShowName] = React.useState(true)
        const hover = useHoverTip()

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

        // 名称显隐是 Host 设置；设置页保存后按同一事件重读，不缓存第二份业务状态。
        React.useEffect(() => {
          let active = true
          const load = () => {
            callHost(ctx, 'getSettings', {})
              .then((value) => {
                if (!active) return
                setShowName(value?.sidebarShowName !== false)
              })
              .catch(() => {
                // 读不到设置时保留默认显示，不拿默认值覆盖 Host。
              })
          }
          load()
          const unsubscribe = subscribeSettingsChanged(load)
          return () => {
            active = false
            unsubscribe()
          }
        }, [ctx])

        return renderSidebarEntry({
          stats,
          theme: { ...theme, systemDark },
          showName,
          t,
          hover,
          size: props?.size,
          format: normalizeDurationFormat(previewFormat ?? stats.durationFormat),
        })
      }
    }

    /**
     * presence 心跳挂在 frame-wide overlay 上而不是侧边栏入口里：侧边栏入口
     * 被取消固定或折叠时组件可能卸载，但活跃采集必须随页面一直存在。
     */
    function createPresenceReporter(ctx) {
      return function ChronoScopePresenceReporter(props) {
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

    function renderApproximateNotice(t, visible) {
      if (!visible) return null
      return h('div', { className: 'cs-backfill cs-approx', role: 'status' },
        h('span', { className: 'cs-approx-label' }, t('approximateTag')),
        h('span', null, t('approximateNotice')))
    }

    /**
     * 页面按周期重新取数。切换时保留周期卡，明细在新周期返回前显示加载状态，
     * 避免误把旧数据当成新周期。刷新间隔或 refreshNonce 变化只重建定时器并立即取一次，
     * 不会把已渲染的仪表盘闪回 loading。回填进行时缩短间隔，完成后由
     * refreshNonce 立刻补一次，数字因此无需刷新页面就能出现。
     */
    function useDashboard(ctx, period, refreshMs, refreshNonce) {
      const [state, setState] = React.useState({ status: 'loading', data: null, receivedAt: 0 })
      const loadRef = React.useRef(null)
      React.useEffect(() => {
        let active = true
        setState((previous) => ({ ...previous, status: 'loading' }))
        const load = async () => {
          try {
            const value = await callHost(ctx, 'queryStats', { period, view: 'dashboard' })
            if (!active) return
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
      }, [ctx, period])
      React.useEffect(() => {
        if (typeof loadRef.current !== 'function') return undefined
        loadRef.current()
        const timer = setInterval(() => {
          if (typeof loadRef.current === 'function') loadRef.current()
        }, refreshMs)
        return () => clearInterval(timer)
      }, [ctx, period, refreshMs, refreshNonce])
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

    /** 统一浮层定位：优先放在锚点上方，空间不足翻到下方，左右按视口夹取。 */
    function clampTipPosition(anchor, size, viewport, options = {}) {
      const gap = finite(options.gap) || 10
      const margin = finite(options.margin) || 8
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
      if (above >= margin) return { left: Math.round(left), top: Math.round(above), placement: 'top' }
      const top = Math.max(margin, Math.min(anchorTop + anchorHeight + gap, maxTop))
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
    function HoverTip({ tip, id = 'chrono-scope-hover-tip' }) {
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
      const height = 140
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

    /** 概览提示：说明起算点；周/月视图额外给出按日历日折算的日均值。 */
    function overviewHint(data, t, format = 'hms') {
      const parts = [t('periodHint')]
      if (data?.period !== 'day' && data?.range) {
        parts.push(`${t('dailyAverageActive')} ${formatDuration(averageMsPerDay(data, 'activeMs'), format)}`)
        parts.push(`${t('dailyAverageTask')} ${formatDuration(averageMsPerDay(data, 'taskMs'), format)}`)
      }
      parts.push(t('recordSinceBoot'))
      return parts.join(' · ')
    }

    /** 概览口径全部收进 ⓘ：周期提示、实际占用、活跃判定与在线包含挂机。 */
    function overviewInfoMessages(data, t, format = 'hms') {
      return [overviewHint(data, t, format), t('unionFoot'), t('sinceBoot'), t('onlineFoot')].filter(Boolean)
    }

    /** 页脚只留数据摘要；本机存储与近似记录说明收进 ⓘ。 */
    function footerInfoMessages(t, hasApproximate) {
      return [t('localOnly'), hasApproximate === true ? t('approximateHint') : null].filter(Boolean)
    }

    function renderCycleCard(t, period, cycle, isCurrent, onSelect, format = 'hms') {
      const titleKey = period === 'day' ? 'cycleToday' : period === 'week' ? 'cycleWeek' : 'cycleMonth'
      return h('button', { key: period, type: 'button', className: `cs-cycle${isCurrent ? ' is-current' : ''}`, 'aria-pressed': isCurrent, onClick: onSelect },
        h('div', { className: 'cs-cycle-head' },
          h('span', { className: 'cs-cycle-title' }, t(titleKey)),
          isCurrent ? h('span', { className: 'cs-current-badge' }, t('selectedPeriod')) : null,
          h('span', { className: 'cs-cycle-count' }, `${cycle.taskCount} ${t('taskCountUnit')}`)),
        h('div', { className: 'cs-cycle-metric' },
          h('span', { className: 'cs-metric-label' }, t('activeLabel')),
          h('span', { className: 'cs-metric-value' }, formatDuration(cycle.activeMs, format))),
        h('div', { className: 'cs-cycle-metric is-secondary' },
          h('span', { className: 'cs-metric-label' }, t('taskLabel')),
          h('span', { className: 'cs-metric-value' }, formatDuration(cycle.taskMs, format))))
    }

    /** 口径信息可悬浮、聚焦或点击查看；Escape 关闭，文字留在无障碍名称中。 */
    function Info({ message }) {
      const [open, setOpen] = React.useState(false)
      const [dismissed, setDismissed] = React.useState(false)
      return h('span', { className: `cs-info${open ? ' is-open' : ''}${dismissed ? ' is-dismissed' : ''}` },
        h('button', {
          type: 'button', 'aria-label': message, 'aria-expanded': open,
          onClick: () => {
            if (open) {
              setOpen(false)
              setDismissed(true)
            } else {
              setDismissed(false)
              setOpen(true)
            }
          },
          onFocus: () => { setDismissed(false); setOpen(true) },
          onBlur: () => { setOpen(false); setDismissed(false) },
          onMouseLeave: () => setDismissed(false),
          onKeyDown: (event) => {
            if (event.key !== 'Escape') return
            setOpen(false)
            setDismissed(true)
          },
        },
          h('svg', { viewBox: '0 0 20 20', width: 16, height: 16, fill: 'none', 'aria-hidden': true },
            h('circle', { cx: 10, cy: 10, r: 7.5, stroke: 'currentColor', strokeWidth: 1.4 }),
            h('path', { d: 'M10 9v4M10 6.5h.01', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }))),
        h('span', { className: 'cs-info-tip', role: 'tooltip' }, message))
    }

    function renderInfo(message) {
      return h(Info, { message })
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
            renderInfo([t('compositionInfo'), t('compositionHint')].join('；'))),
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
    function renderWorkspaceRanking(data, t, format = 'hms') {
      const rows = [...data.workspaces].filter((row) => row.taskMs > 0).sort((a, b) => b.taskMs - a.taskMs).slice(0, 5)
      return h('section', { className: 'cs-card cs-ranking' },
        h('div', { className: 'cs-card-head' }, h('div', { className: 'cs-card-heading' },
          h('h2', null, t('workspaceRanking')),
          renderInfo([t('sumFoot'), t('accumulated')].join('；')))),
        rows.length === 0 ? h('div', { className: 'cs-empty' }, t('noTaskComposition'))
          : h('div', { className: 'cs-ranking-list' }, rows.map((row, index) =>
              h('div', { className: 'cs-ranking-row', key: row.key, title: `${row.workspaceTitle ?? t('unassigned')} · ${t('taskLabel')} ${formatDuration(row.taskMs, format)} · ${t('colShare')} ${formatPercent(row.share)}` },
                h('span', { className: 'cs-rank-index' }, String(index + 1).padStart(2, '0')),
                h('span', { className: 'cs-ranking-name', title: row.workspaceTitle ?? t('unassigned') }, row.workspaceTitle ?? t('unassigned')),
                h('span', { className: 'cs-ranking-bar', 'aria-hidden': true },
                  h('i', { style: { width: formatPercent(row.share) } })),
                h('span', { className: 'cs-ranking-time' }, formatDuration(row.taskMs, format)),
                h('span', { className: 'cs-ranking-share' }, formatPercent(row.share))))))
    }

    /** 恢复票 03 的任务构成展示：四部分之和等于任务时长，历史任务显示「未拆分」。 */
    function renderSessionBreakdown(session, t, format = 'hms') {
      const values = [session.modelMs, session.toolMs, session.waitMs, session.otherMs]
      const labels = ['breakdownModel', 'breakdownTool', 'breakdownWait', 'breakdownOther']
      let remaining = Math.max(0, session.taskMs)
      const parts = values.map((value, index) => {
        const amount = Math.min(remaining, Math.max(0, value))
        remaining -= amount
        return amount > 0 ? `${t(labels[index])} ${formatDuration(amount, format)}` : null
      }).filter(Boolean)
      if (remaining > 0) parts.push(`${t('notBroken')} ${formatDuration(remaining, format)}`)
      return h('span', { className: 'cs-session-breakdown' }, parts.join(' · ') || t('notBroken'))
    }

    function renderSessionRow(session, t, nowMs, subagentRows, format = 'hms') {
      const subagents = subagentRows.length
      const subagentDuration = formatDuration(
        subagentRows.reduce((sum, row) => sum + row.durationMs, 0),
        format,
      )
      const sessionTitle = session.sessionTitle ?? t('unknownSession')
      return h('div', { className: 'cs-session', key: session.sessionId },
        h('span', { className: 'cs-session-title', title: sessionTitle }, sessionTitle),
        session.taskRunning ? h('span', { className: 'cs-chip is-live' }, t('runningTag')) : null,
        session.approximate ? h('span', { className: 'cs-chip', title: t('approximateHint') }, t('approximateTag')) : null,
        h('span', { className: 'cs-session-stat', 'data-label': t('activeLabel') }, `${t('activeLabel')} ${formatDuration(session.activeMs, format)}`),
        h('span', { className: 'cs-session-stat', 'data-label': t('taskLabel') }, `${t('taskLabel')} ${formatDuration(session.taskMs, format)}`),
        h('span', { className: 'cs-session-stat' }, `${session.taskCount} ${t('taskCountUnit')}`),
        h('span', { className: 'cs-session-last' }, formatRelativeTime(session.lastActivityAt, t, nowMs)),
        session.taskCount > 0 ? renderSessionBreakdown(session, t, format) : null,
        // 子代理任务只在父会话明细里露出，不参与上面的任务时长与次数。
        subagents > 0
          ? h('span', {
            className: 'cs-session-subagents',
            title: subagentRows.map((row) => row.sessionTitle ?? row.sessionId).join('、'),
          }, `${t('subagentDetail')} · ${t('subagentDetailHint')
            .replace('{count}', String(subagents))
            .replace('{duration}', subagentDuration)}`)
          : null)
    }

    function renderWorkspaceRow(row, isOpen, onToggle, t, nowMs, subagentByParent, format = 'hms') {
      const workspaceTitle = row.workspaceTitle ?? t('unassigned')
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
            h('span', { className: 'cs-name-text', title: workspaceTitle }, workspaceTitle),
            h('span', { className: 'cs-name-sub' }, `${row.sessions.length} ${t('sessionsUnit')}`)),
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
          ? h('div', { className: 'cs-sessions' }, row.sessions.length === 0
              ? h('div', { className: 'cs-empty is-small' }, t('emptyWorkspace'))
              : row.sessions.map((session) =>
                renderSessionRow(session, t, nowMs, subagentByParent[session.sessionId] ?? [], format)))
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
          className: `cs-select-menu${props.menuVariant === 'grid' ? ' is-grid' : ''}`,
          role: 'listbox',
          'aria-label': props.ariaLabel,
          hidden: !open,
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
     * 数字格式选择区：五张卡片同时给出样例，底部预览行按当前草稿实时变化。
     * 抽成纯函数便于组成测试直接断言五档输出与选中态，不依赖设置页的数据加载。
     */
    function renderDurationFormatSection(t, draftFormat, options = {}) {
      const current = normalizeDurationFormat(draftFormat)
      const disabled = options.disabled === true
      return h('section', { className: 'cs-settings-group' },
        h('h3', null, t('settingsSectionFormat')),
        h('p', { className: 'cs-settings-row-hint' }, t('settingsFormatHint')),
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
            className: `cs-format-opt${selected ? ' is-on' : ''}`,
            disabled,
            onClick: () => options.onSelect?.(format),
          },
          h('b', null, formatDuration(DURATION_FORMAT_SAMPLE_MS, format)),
          h('span', null, t(durationFormatHintKey(format))))
        })),
        h('div', { className: 'cs-format-preview' },
          h('span', null, t('formatPreviewLabel')),
          h('b', null, formatDuration(DURATION_FORMAT_SAMPLE_MS, current))))
    }

    /**
     * settings.section 设置页。表单草稿只是瞬时 UI 状态：初始值从 Host 读取，
     * 保存后以 Host 返回值为准，不写 localStorage、不缓存任何业务状态。
     */
    function createSettingsSection(ctx) {
      return function ChronoScopeSettingsSection(props) {
        const t = props?.t ?? ((key) => key)
        const [draft, setDraft] = React.useState(null)
        const [phase, setPhase] = React.useState('loading')
        const [message, setMessage] = React.useState('')
        const [loadNonce, setLoadNonce] = React.useState(0)
        const [noticeState, setNoticeState] = React.useState({ status: 'loading', data: null })

        React.useEffect(() => {
          let active = true
          setPhase('loading')
          callHost(ctx, 'getSettings', {})
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

        const patch = (key, value) =>
          setDraft((previous) => ({ ...(previous ?? settingsDraft(null)), [key]: value }))

        // 选择格式只动草稿并广播即时预览；真正写 Host 仍要等「保存设置」。
        const selectDurationFormat = (value) => {
          const format = normalizeDurationFormat(value)
          patch('durationFormat', format)
          notifyDurationFormatPreview(format)
        }

        const onSave = async () => {
          // 只有成功读到 Host 设置后才允许写入，避免用草稿覆盖未读到的真实值。
          if (draft === null || phase === 'load-error') return
          setPhase('saving')
          setMessage('')
          try {
            const saved = await callHost(ctx, 'setSettings', settingsPayload(draft))
            setDraft(settingsDraft(saved))
            setMessage(t('settingsSaved'))
            setPhase('saved')
            // 只广播「变了」，具体值由仪表盘重新向 Host 取。
            notifySettingsChanged()
          } catch {
            setMessage(t('settingsSaveError'))
            setPhase('error')
          }
        }

        const idleOptions = Array.from({ length: 15 }, (_, index) => String(index + 1))
        const loadFailed = phase === 'load-error'
        const busy = phase === 'saving' || draft === null || loadFailed
        const statusClass = `cs-settings-status${phase === 'error' || loadFailed ? ' is-error' : ''}`

        return h('div', { className: 'cs-settings' },
          h('style', null, CHRONOSCOPE_SETTINGS_CSS),
          h('div', { className: 'cs-settings-inner' },
            h('header', null,
              h('h2', { className: 'cs-settings-title' }, t('settingsTitle')),
              h('p', { className: 'cs-settings-hint' }, t('settingsHint'))),
            h('section', { className: 'cs-settings-group' },
              h('h3', null, t('settingsSectionGeneral')),
              settingsRow(t, 'settingsIdleLabel', 'settingsIdleHint',
                h(Select, {
                  value: draft?.idleThresholdMinutes ?? '5',
                  options: idleOptions,
                  disabled: busy,
                  ariaLabel: t('settingsIdleLabel'),
                  onChange: (value) => patch('idleThresholdMinutes', value),
                }),
                h('span', { className: 'cs-settings-unit' }, t('settingsIdleUnit')),
                h('span', { className: 'cs-settings-unit' }, t('settingsIdleRange'))),
              settingsRow(t, 'settingsWeekLabel', 'settingsWeekHint',
                h(Select, {
                  value: draft?.weekStartsOn ?? '1',
                  options: [
                    { value: '1', label: t('settingsWeekMonday') },
                    { value: '7', label: t('settingsWeekSunday') },
                  ],
                  disabled: busy,
                  ariaLabel: t('settingsWeekLabel'),
                  onChange: (value) => patch('weekStartsOn', value === '7' ? '7' : '1'),
                }))),
            h('section', { className: 'cs-settings-group' },
              h('h3', null, t('settingsSectionDisplay')),
              settingsRow(t, 'settingsSubagentLabel', 'settingsSubagentHint',
                h('label', { className: 'cs-settings-switch' },
                  h('input', {
                    type: 'checkbox',
                    checked: draft?.showSubagents !== false,
                    disabled: busy,
                    onChange: (event) => patch('showSubagents', event?.target?.checked === true),
                  }),
                  h('span', null, draft?.showSubagents === false ? t('settingsSubagentOff') : t('settingsSubagentOn')))),
              settingsRow(t, 'settingsSidebarNameLabel', 'settingsSidebarNameHint',
                h('label', { className: 'cs-settings-switch' },
                  h('input', {
                    type: 'checkbox',
                    'aria-label': t('settingsSidebarNameLabel'),
                    checked: draft?.sidebarShowName !== false,
                    disabled: busy,
                    onChange: (event) => patch('sidebarShowName', event?.target?.checked === true),
                  }),
                  h('span', null, draft?.sidebarShowName === false ? t('settingsSidebarNameOff') : t('settingsSidebarNameOn'))))),
            renderDurationFormatSection(t, draft?.durationFormat, {
              disabled: busy,
              onSelect: selectDurationFormat,
            }),
            h('section', { className: 'cs-settings-group' },
              h('h3', null, t('settingsSectionNotices')),
              noticeState.status === 'error'
                ? h('p', { className: 'cs-notice-empty' }, t('backfillNoticeUnavailable'))
                : noticeState.data === null
                  ? h('p', { className: 'cs-notice-empty' }, t('loading'))
                  : renderBackfillNotices(noticeState.data, t)),
            h('div', { className: 'cs-settings-footer' },
              h('button', {
                type: 'button', className: 'cs-btn', disabled: busy, onClick: onSave,
              }, phase === 'saving' ? t('settingsSaving') : t('settingsSave')),
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

    /* ============================ 次级导航与四视图 ============================ */

    /** 视图名只认四个同级视图；任何非法值（含旧 sessionStorage 脏值）回落概览。 */
    function normalizeView(value) {
      return VIEWS.includes(value) ? value : 'overview'
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

    function renderCycles(data, t, period, onSelect, format = 'hms') {
      return h('div', { className: 'cs-cycles' },
        ['day', 'week', 'month'].map((item) =>
          renderCycleCard(t, item, data?.cycles?.[item] ?? { activeMs: 0, taskMs: 0, taskCount: 0 }, item === period, () => onSelect?.(item), format)))
    }

    function renderTrendCard(data, t, isZh, hoverTip, format, shownPeriod) {
      const isEmpty = !Array.isArray(data?.workspaces) || data.workspaces.length === 0
      const trendTitleKey = shownPeriod === 'day' ? 'trendDay' : shownPeriod === 'week' ? 'trendWeek' : 'trendMonth'
      return h('section', { className: 'cs-card cs-trend-card' },
        h('div', { className: 'cs-card-head' },
          h('div', { className: 'cs-card-heading' },
            h('h2', null, t(trendTitleKey)),
            renderInfo(t('trendInfo'))),
          h('div', { className: 'cs-legend' },
            h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-active' }), t('activeLabel')),
            h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-task' }), t('taskLabel')))),
        isEmpty
          ? h('div', { className: 'cs-empty' }, t('emptyDashboard'))
          : renderTrendChart(data.trend, shownPeriod, t, isZh, hoverTip?.tip,
              { onHover: hoverTip?.show, onLeave: hoverTip?.hide }, format))
    }

    function renderStatBox(label, value) {
      return h('div', { className: 'cs-stat-box' }, h('span', null, label), h('b', null, value))
    }

    /** 概览：周期卡、趋势卡、任务构成、工作区排行与最近会话。 */
    function renderOverviewView(props) {
      const { data, t, isZh, period, onSelectPeriod, durationFormat, hoverTip, nowMs, onOpenWorkspace } = props
      const shownPeriod = data?.period ?? period
      return [
        h('div', { className: 'cs-section-head' },
          h('div', { className: 'cs-overview-heading' },
            h('span', { className: 'cs-section-title' }, t('overviewTitle')),
            h('span', { className: 'cs-tag' }, t('actualOccupied')),
            renderInfo(overviewInfoMessages(data, t, durationFormat).join('；')))),
        renderCycles(data, t, period, onSelectPeriod, durationFormat),
        h('div', { className: 'cs-analysis-grid' },
          renderComposition(data, t, hoverTip?.tip, { onHover: hoverTip?.show, onLeave: hoverTip?.hide }, durationFormat),
          renderWorkspaceRanking(data, t, durationFormat)),
        renderTrendCard(data, t, isZh, hoverTip, durationFormat, shownPeriod),
        renderRecentSessions(data, t, nowMs, onOpenWorkspace, durationFormat),
      ]
    }

    /** 最近会话卡：点击工作区级别行切到明细并展开该工作区。 */
    function renderRecentSessions(data, t, nowMs, onOpenWorkspace, format = 'hms') {
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
                onClick: () => onOpenWorkspace?.(session.workspaceKey),
              },
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
      return [
        h('div', { className: 'cs-section-head' },
          h('div', { className: 'cs-overview-heading' },
            h('span', { className: 'cs-section-title' }, t('tabTrend')),
            h('span', { className: 'cs-tag' }, t('actualOccupied')),
            renderInfo(t('trendInfo')))),
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
                : `${formatDuration(finite(peak.bucket.activeMs), durationFormat)} · ${peak.label}`)))),
      ]
    }

    /** 明细：本地搜索、工作区行与渐进展开会话，空状态区分「无匹配」与「无数据」。 */
    function renderDetailsView(props) {
      const {
        data, t, isZh, query, onQueryChange, durationFormat,
        expanded, onToggleRow, nowMs, subagentByParent,
      } = props
      const rows = filterWorkspaces(data?.workspaces, query)
      const hasQuery = String(query ?? '').trim() !== ''
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
          h('span', { className: 'cs-range' }, formatRangeLabel(data?.range, data?.period ?? 'day', t, isZh))),
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
                  t, nowMs, subagentByParent ?? {}, durationFormat)))),
      ]
    }

    /**
     * Dashboard 内设置页：表单值来自 Host 草稿，外观/配色来自页面本地主题状态。
     * 纯渲染函数便于组成测试断言控件结构，数据加载与保存逻辑留在 createPage。
     */
    function renderSettingsView(props) {
      const {
        t, draft, phase, message, noticeState, appearance, palette,
        dataBusy = '', dataMessage = null, clearStep = false, retrying = false, retryError = null,
        onPatch, onSelectFormat, onSave, onRetryLoad, onExport, onRequestClear, onCancelClear, onClear,
        onRecheckBackfill, onCycleAppearance, onChangePalette,
      } = props
      const loadFailed = phase === 'load-error'
      const busy = phase === 'saving' || draft === null || loadFailed
      const idleOptions = Array.from({ length: 15 }, (_, index) => String(index + 1))
      const appearanceMode = normalizeAppearance(appearance)
      return [h('div', { className: 'cs-settings cs-settings-board' },
        h('header', { className: 'cs-settings-hero' },
          h('h2', { className: 'cs-settings-title' }, t('settingsPageTitle')),
          h('p', { className: 'cs-settings-hint' }, t('settingsPageHint'))),
        h('div', { className: 'cs-settings-grid' },
          h('section', { className: 'cs-settings-card cs-settings-wide' },
            renderDurationFormatSection(t, draft?.durationFormat, {
              disabled: busy,
              onSelect: onSelectFormat,
            })),
          h('section', { className: 'cs-settings-card' },
            h('h3', null, t('settingsSectionAppearance')),
            h('div', { className: 'cs-settings-row' },
              h('div', null, h('div', { className: 'cs-settings-label' }, t('appearanceLabel'))),
              h('div', { className: 'cs-settings-control' },
                h('button', {
                  type: 'button',
                  className: 'cs-icon-toggle',
                  'aria-label': t('appearanceToggle').replace('{mode}', t(appearanceLabelKey(appearanceMode))),
                  onClick: () => onCycleAppearance?.(),
                }, h(AppearanceIcon, { mode: appearanceMode })),
                h('span', { className: 'cs-settings-unit' }, t(appearanceLabelKey(appearanceMode))))),
            h('div', { className: 'cs-settings-row' },
              h('div', null, h('div', { className: 'cs-settings-label' }, t('paletteLabel'))),
              h('div', { className: 'cs-settings-control' },
                h(Select, {
                  value: palette,
                  options: [
                    { value: 'blue', label: t('paletteBlue') },
                    { value: 'stone', label: t('paletteStone') },
                    { value: 'clay', label: t('paletteClay') },
                  ],
                  ariaLabel: t('paletteLabel'),
                  onChange: onChangePalette,
                })))),
          h('section', { className: 'cs-settings-card' },
            h('h3', null, t('settingsSectionGeneral')),
            settingsRow(t, 'settingsIdleLabel', 'settingsIdleHint',
              h(Select, {
                value: draft?.idleThresholdMinutes ?? '5',
                options: idleOptions,
                disabled: busy,
                ariaLabel: t('settingsIdleLabel'),
                onChange: (value) => onPatch?.('idleThresholdMinutes', value),
              }),
              h('span', { className: 'cs-settings-unit' }, t('settingsIdleUnit')),
              h('span', { className: 'cs-settings-unit' }, t('settingsIdleRange'))),
            settingsRow(t, 'settingsWeekLabel', 'settingsWeekHint',
              h(Select, {
                value: draft?.weekStartsOn ?? '1',
                options: [
                  { value: '1', label: t('settingsWeekMonday') },
                  { value: '7', label: t('settingsWeekSunday') },
                ],
                disabled: busy,
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
                  checked: draft?.sidebarShowName !== false,
                  disabled: busy,
                  onChange: (event) => onPatch?.('sidebarShowName', event?.target?.checked === true),
                }),
                h('span', null, draft?.sidebarShowName === false ? t('settingsSidebarNameOff') : t('settingsSidebarNameOn'))))),
          h('section', { className: 'cs-settings-card cs-settings-wide' },
            h('h3', null, t('settingsSectionNotices')),
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
              retryError ? h('span', { className: 'cs-data-status is-error' }, String(retryError)) : null)),
          h('section', { className: 'cs-settings-card cs-settings-wide' },
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
              h('span', { className: 'cs-data-spacer' }),
              h('button', {
                type: 'button', className: 'cs-btn is-danger', disabled: dataBusy !== '',
                onClick: () => onRequestClear?.(),
              }, t('clearData'))),
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
          h('button', {
            type: 'button', className: 'cs-btn is-primary', disabled: busy, onClick: () => onSave?.(),
          }, phase === 'saving' ? t('settingsSaving') : t('settingsSave')),
          loadFailed
            ? h('button', { type: 'button', className: 'cs-btn', onClick: () => onRetryLoad?.() }, t('settingsRetry'))
            : null,
          message ? h('span', {
            className: `cs-settings-status${phase === 'error' || loadFailed ? ' is-error' : ''}`,
            role: 'status',
          }, message) : null))]
    }

    function createPage(ctx) {
      return function ChronoPage(props) {
        const t = props?.t ?? ((key) => key)
        const isZh = t('periodDay') === '日'
        const [period, setPeriod] = React.useState(() => {
          try { const value = window.sessionStorage.getItem('chrono-scope.period'); return ['day', 'week', 'month'].includes(value) ? value : 'day' }
          catch { return 'day' }
        })
        const [view, setView] = React.useState(() => {
          try { return normalizeView(window.sessionStorage.getItem('chrono-scope.view')) }
          catch { return 'overview' }
        })
        const [switchingView, setSwitchingView] = React.useState(false)
        const switchingTimerRef = React.useRef(null)
        const viewsRef = React.useRef(null)
        const [palette, setPalette] = React.useState(() => {
          try { return normalizePalette(window.localStorage.getItem('chrono-scope.palette')) }
          catch { return 'blue' }
        })
        const [appearance, setAppearance] = React.useState(() => {
          try { return normalizeAppearance(window.localStorage.getItem('chrono-scope.appearance')) }
          catch { return 'light' }
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
        const cycleAppearanceMode = () => {
          const next = cycleAppearance(appearance)
          setAppearance(next)
          try { window.localStorage.setItem('chrono-scope.appearance', next); setPaletteSaveError(false) }
          catch { setPaletteSaveError(true) }
          notifyThemeChanged()
        }
        const changePalette = (value) => {
          const normalized = normalizePalette(value)
          setPalette(normalized)
          try { window.localStorage.setItem('chrono-scope.palette', normalized); setPaletteSaveError(false) }
          catch { setPaletteSaveError(true) }
          notifyThemeChanged()
        }
        const [expanded, setExpanded] = React.useState(() => {
          try {
            const value = JSON.parse(window.sessionStorage.getItem('chrono-scope.expanded') || '{}')
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
          } catch { return {} }
        })
        const [detailsQuery, setDetailsQuery] = React.useState('')
        React.useEffect(() => { try { window.sessionStorage.setItem('chrono-scope.period', period) } catch {} }, [period])
        React.useEffect(() => { try { window.sessionStorage.setItem('chrono-scope.view', view) } catch {} }, [view])
        React.useEffect(() => { try { window.sessionStorage.setItem('chrono-scope.expanded', JSON.stringify(expanded)) } catch {} }, [expanded])
        const [pollMs, setPollMs] = React.useState(PAGE_REFRESH_MS)
        const [refreshNonce, setRefreshNonce] = React.useState(0)
        // 设置页选择格式后的即时预览；保存/取消后清空，回到 Host 的已保存值。
        const [previewFormat, setPreviewFormat] = React.useState(null)
        const [readBackfillId, setReadBackfillId] = React.useState('')
        const [dismissingBackfill, setDismissingBackfill] = React.useState(false)
        const [dismissError, setDismissError] = React.useState(null)
        const [retrying, setRetrying] = React.useState(false)
        const [retryError, setRetryError] = React.useState(null)
        // Dashboard 内设置页的独立草稿：进入视图时从 Host getSettings 拉取。
        const [settingsForm, setSettingsForm] = React.useState(null)
        const [settingsPhase, setSettingsPhase] = React.useState('idle')
        const [settingsMessage, setSettingsMessage] = React.useState('')
        const [settingsLoadNonce, setSettingsLoadNonce] = React.useState(0)
        // 保存成功后 notifySettingsChanged 会触发一次重取；保留「已保存」反馈，
        // 不把设置页闪回加载态。重新进入设置页时再恢复正常加载态。
        const settingsSavedRef = React.useRef(false)
        const [noticeState, setNoticeState] = React.useState({ status: 'idle', data: null })
        const [noticeNonce, setNoticeNonce] = React.useState(0)
        const state = useDashboard(ctx, period, pollMs, refreshNonce)
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
        const subagentByParent = {}
        for (const row of data?.subagentTasks ?? []) {
          if (subagentByParent[row.parentSessionId] === undefined) subagentByParent[row.parentSessionId] = []
          subagentByParent[row.parentSessionId].push(row)
        }
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
        }, [])
        React.useEffect(() => {
          const node = viewsRef.current
          if (node && typeof node.scrollTop === 'number') node.scrollTop = 0
        }, [view])

        // 打开设置页时读取 Host 权威设置与通知记录；关闭时丢弃未保存草稿。
        const settingsOpen = view === 'settings'
        React.useEffect(() => {
          if (!settingsOpen) return undefined
          let active = true
          const keepSaved = settingsSavedRef.current === true
          settingsSavedRef.current = false
          if (!keepSaved) {
            setSettingsPhase('loading')
            setSettingsMessage('')
          }
          callHost(ctx, 'getSettings', {}).then((value) => {
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

        const patchSetting = (key, value) => {
          setSettingsForm((previous) => previous === null ? previous : { ...previous, [key]: value })
          setSettingsMessage('')
        }
        const onSelectSettingsFormat = (value) => {
          const format = normalizeDurationFormat(value)
          setSettingsForm((previous) => previous === null ? previous : { ...previous, durationFormat: format })
          setSettingsMessage('')
          notifyDurationFormatPreview(format)
        }
        const onSaveSettings = async () => {
          if (settingsForm === null || settingsPhase === 'saving') return
          setSettingsPhase('saving')
          setSettingsMessage('')
          try {
            const saved = await callHost(ctx, 'setSettings', settingsPayload(settingsForm))
            setSettingsForm(settingsDraft(saved))
            setSettingsPhase('saved')
            setSettingsMessage(t('settingsSaved'))
            settingsSavedRef.current = true
            notifySettingsChanged()
          } catch {
            setSettingsPhase('error')
            setSettingsMessage(t('settingsSaveError'))
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
          try {
            await callHost(ctx, 'retryBackfill', {})
            setRefreshNonce((value) => value + 1)
            setNoticeNonce((value) => value + 1)
          } catch (error) {
            setRetryError(String(error?.message ?? error))
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
        const openWorkspaceInDetails = (workspaceKey) => {
          if (workspaceKey !== undefined && workspaceKey !== null) {
            setExpanded((previous) => ({ ...previous, [workspaceKey]: true }))
          }
          goToView('details')
        }
        const onToggleRow = (key) => setExpanded((previous) => ({ ...previous, [key]: !previous[key] }))
        const nowMs = Date.now()
        if (state.status === 'loading' && data === null) {
          return h('div', { className: pageClassName },
            h('style', null, CHRONOSCOPE_CSS),
            h('div', { className: 'cs-shell' },
              h('div', { className: 'cs-loading' },
                h('span', { className: 'cs-spinner' }),
                h('strong', null, t('loadingTitle')),
                h('span', null, t('loading')))))
        }
        if (state.status === 'error' && data === null) {
          return h('div', { className: pageClassName },
            h('style', null, CHRONOSCOPE_CSS),
            h('div', { className: 'cs-shell' },
              h('div', { className: 'cs-loading is-error' },
                h('strong', null, t('errorTitle')),
                h('span', null, t('retryHint')))))
        }

        const hasApproximate = approximateNoticeVisible(data)
        const renderView = () => {
          if (view === 'trend') {
            return renderTrendView({
              data, t, isZh, period, onSelectPeriod: setPeriod, durationFormat, hoverTip, nowMs,
            })
          }
          if (view === 'details') {
            return renderDetailsView({
              data, t, isZh, query: detailsQuery, onQueryChange: setDetailsQuery,
              durationFormat, expanded, onToggleRow, nowMs, subagentByParent,
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
              onPatch: patchSetting,
              onSelectFormat: onSelectSettingsFormat,
              onSave: onSaveSettings,
              onRetryLoad: () => setSettingsLoadNonce((value) => value + 1),
              onExport,
              onRequestClear: () => { setClearStep(true); setDataMessage(null) },
              onCancelClear: () => setClearStep(false),
              onClear,
              onRecheckBackfill: onRetryBackfill,
              onCycleAppearance: cycleAppearanceMode,
              onChangePalette: changePalette,
            })
          }
          return renderOverviewView({
            data, t, isZh, period, onSelectPeriod: setPeriod, durationFormat, hoverTip, nowMs,
            onOpenWorkspace: openWorkspaceInDetails,
          })
        }

        return h('div', { className: pageClassName },
          h('style', null, CHRONOSCOPE_CSS),
          h('div', { className: 'cs-shell' },
            h('header', { className: 'cs-topbar' },
              h('div', { className: 'cs-brand' },
                h('span', { className: 'cs-mark' }, h(ChronoIcon, { size: 20, active: true })),
                h('div', { className: 'cs-brand-text' },
                  h('h1', null, t('title')),
                  h('span', { className: 'cs-sub' }, t('subtitle')))),
              h('div', { className: 'cs-topbar-right' },
                h('button', {
                  type: 'button',
                  className: 'cs-icon-toggle',
                  title: appearanceToggleLabel,
                  'aria-label': appearanceToggleLabel,
                  onClick: cycleAppearanceMode,
                }, h(AppearanceIcon, { mode: appearance })),
                h('span', { className: 'cs-palette-label' }, t('paletteLabel'),
                  h(Select, {
                    value: palette,
                    options: [
                      { value: 'blue', label: t('paletteBlue') },
                      { value: 'stone', label: t('paletteStone') },
                      { value: 'clay', label: t('paletteClay') },
                    ],
                    ariaLabel: t('paletteLabel'),
                    onChange: changePalette,
                  })),
                h('span', { className: `cs-live${data.activeRunning ? ' is-live' : ''}` },
                  h('span', { className: 'cs-dot' }), t(data.activeRunning ? 'live' : 'idle')),
                h('span', { className: `cs-live${data.taskRunning ? ' is-live' : ''}` },
                  t(data.taskRunning ? 'taskRunning' : 'taskIdle')),
                h('span', { className: 'cs-period-display' },
                  h('span', null, t('currentPeriod')),
                  h('strong', null, t(period === 'day' ? 'cycleToday' : period === 'week' ? 'cycleWeek' : 'cycleMonth'))))),
            paletteSaveError ? h('div', { className: 'cs-alert', role: 'status' }, t('paletteSaveError')) : null,
            renderApproximateNotice(t, hasApproximate),
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
                view === 'settings' ? h('style', null, CHRONOSCOPE_SETTINGS_CSS) : null,
                ...renderView())),
            h('footer', { className: 'cs-foot' },
              h('span', null, `${t('todayActive')} ${formatDuration(data.cycles.day.activeMs, durationFormat)} · ${t('todayOnline')} ${formatDuration(data.cycles.day.onlineMs, durationFormat)}`),
              renderInfo(footerInfoMessages(t, hasApproximate).join('；'))),
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
        position: absolute; z-index: 60; top: calc(100% + 6px); right: 0;
        min-width: 100%; max-height: 260px; overflow-y: auto;
        padding: 4px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1);
        box-shadow: 0 14px 34px rgba(0, 0, 0, .16);
        animation: cs-menu-in 180ms ease both;
      }
      .cs-select-menu[hidden] { display: none !important; }
      .cs-select.is-top .cs-select-menu { top: auto; bottom: calc(100% + 6px); animation-name: cs-menu-in-top; }
      .cs-select-menu.is-grid {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px;
        min-width: 224px; max-height: none; overflow: visible; padding: 6px;
      }
      @keyframes cs-menu-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes cs-menu-in-top { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      .cs-opt {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        width: 100%; text-align: left; white-space: nowrap;
        padding: 7px 10px; border: 0; border-radius: 5px; background: transparent;
        font: inherit; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary);
        cursor: pointer; transition: background-color 160ms ease, color 160ms ease;
      }
      .cs-opt:hover:not(:disabled), .cs-opt.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); }
      .cs-opt:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
      .cs-opt.is-on { color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .cs-opt-check { flex: 0 0 auto; margin-left: 12px; font-size: 11px; }
      .cs-select-menu.is-grid .cs-opt { justify-content: center; text-align: center; padding: 6px 8px; }
      .cs-select-menu.is-grid .cs-opt.is-span-2 { grid-column: 1 / -1; justify-content: space-between; text-align: left; }
      .cs-select-menu.is-grid .cs-opt.is-on:not(.is-span-2) { justify-content: center; gap: 6px; }
    `

    /**
     * 侧栏入口的独立主题作用域。入口落在宿主侧栏，拿不到 .cs-page 的变量，
     * 因此在这里按 cs-palette-* / cs-appearance-* 重新声明三档蓝并派生
     * --cs-live / --cs-task；不使用宿主的 success 绿。
     */
    const CHRONOSCOPE_SIDEBAR_CSS = `
      .chronoscope-nav-entry {
        --cs-signal-deep: #133463;
        --cs-signal: #1F4E94;
        --cs-signal-soft: #79B3F9;
        --cs-live: var(--cs-signal);
        --cs-task: color-mix(in srgb, var(--cs-signal) 55%, var(--cs-signal-soft));
        --cs-ring-track: color-mix(in srgb, currentColor 16%, transparent);
        --cs-entry-muted: color-mix(in srgb, currentColor 62%, transparent);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        max-width: 100%;
        flex-wrap: nowrap;
        white-space: nowrap;
        line-height: 16px;
        font-variant-numeric: tabular-nums;
        border-radius: 6px;
        outline: none;
      }
      .chronoscope-nav-entry.cs-palette-blue {
        --cs-signal-deep: #133463; --cs-signal: #1F4E94; --cs-signal-soft: #79B3F9;
      }
      .chronoscope-nav-entry.cs-palette-stone {
        --cs-signal-deep: #2b3033; --cs-signal: #4a5155; --cs-signal-soft: #aeb6b9;
      }
      .chronoscope-nav-entry.cs-palette-clay {
        --cs-signal-deep: #6b3b26; --cs-signal: #a35a37; --cs-signal-soft: #e2ac86;
      }
      .chronoscope-nav-entry.cs-appearance-dark {
        --cs-signal-deep: #a9cffa; --cs-signal: #79B3F9; --cs-signal-soft: #3f6ba8;
      }
      .chronoscope-nav-entry.cs-appearance-dark.cs-palette-stone {
        --cs-signal-deep: #d9dee0; --cs-signal: #aeb6b9; --cs-signal-soft: #6c7477;
      }
      .chronoscope-nav-entry.cs-appearance-dark.cs-palette-clay {
        --cs-signal-deep: #f0c0a4; --cs-signal: #e2ac86; --cs-signal-soft: #8a5a40;
      }
      .chronoscope-nav-ring {
        width: 14px; height: 14px; border-radius: 50%; flex: 0 0 14px;
        background: conic-gradient(var(--cs-ring-track) 0% 100%);
        -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3.5px));
        mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3.5px));
      }
      .chronoscope-nav-time {
        font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 11px; line-height: 16px; color: var(--cs-entry-muted);
        letter-spacing: -0.02em; white-space: nowrap; flex: 0 0 auto;
      }
      .chronoscope-nav-time.is-live { color: var(--cs-live); }
      .chronoscope-nav-name {
        font-size: 11px; line-height: 16px; color: var(--cs-entry-muted);
        min-width: 0; max-width: 132px; flex: 0 1 auto;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .chronoscope-nav-dot {
        width: 6px; height: 6px; border-radius: 50%; flex: 0 0 6px;
        background: var(--cs-entry-muted);
      }
      .chronoscope-nav-dot.is-live {
        background: var(--cs-live);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--cs-live) 18%, transparent);
      }
      .chronoscope-nav-entry:focus-visible { outline: 2px solid var(--cs-signal); outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) {
        .chronoscope-nav-entry, .chronoscope-nav-entry * { transition-duration: 0s; animation-duration: 0s; }
      }
    `

    const CHRONOSCOPE_CSS = `
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
        gap: 12px;
        min-width: 0;
      }
      .cs-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 44px; }
      .cs-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .cs-mark {
        width: 34px; height: 34px; border-radius: 10px; flex: none;
        display: inline-flex; align-items: center; justify-content: center;
        color: var(--dsw-alias-brand-primary);
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-border-l1);
      }
      .cs-brand-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .cs-brand-text h1 { margin: 0; font-size: 17px; line-height: 22px; font-weight: 650; letter-spacing: -0.01em; }
      .cs-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 16px; }
      .cs-topbar-right { display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap; }
      .cs-live { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 16px; white-space: nowrap; }
      .cs-live.is-live { color: var(--dsw-alias-state-success-primary); }
      .cs-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
      .cs-live.is-live .cs-dot { background: var(--dsw-alias-state-success-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent); }
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
      .cs-approx {
        border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, var(--dsw-alias-border-l1));
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, var(--dsw-alias-bg-layer-1));
      }
      .cs-approx-label { font-weight: 650; color: var(--dsw-alias-brand-primary); }
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
      .cs-cycle { display: flex; flex-direction: column; gap: 5px; min-width: 0; padding: 11px 16px 13px; border-radius: 14px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
      .cs-cycle.is-current {
        border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1));
        background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, var(--dsw-alias-bg-layer-1)), var(--dsw-alias-bg-layer-1));
      }
      .cs-cycle-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .cs-cycle-title { font-size: 13px; line-height: 18px; font-weight: 600; }
      .cs-cycle-count { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .cs-cycle-metric { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .cs-metric-label { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-metric-value {
        font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1;
        font-size: 21px; line-height: 26px; font-weight: 600; letter-spacing: -0.035em;
      }
      .cs-cycle-metric.is-secondary .cs-metric-value { font-size: 16px; line-height: 22px; font-weight: 560; color: var(--dsw-alias-label-secondary); }
      .cs-card { min-width: 0; border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); padding: 13px 16px; }
      .cs-trend-card { display: flex; flex-direction: column; gap: 8px; }
      .cs-table-card { display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; }
      .cs-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .cs-card-heading { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
      .cs-card-heading h2 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 620; }
      .cs-card-hint { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-legend { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .cs-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-swatch { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
      .cs-swatch.is-active { background: var(--cs-live); }
      .cs-swatch.is-task { background: var(--cs-task); }
      .cs-session-breakdown { flex: 1 1 100%; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; font-variant-numeric: tabular-nums; }
      .cs-session-subagents { flex: 1 1 100%; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; font-variant-numeric: tabular-nums; }
      .cs-session-subagents::before { content: '↳ '; }
      .cs-chart { position: relative; width: 100%; min-width: 0; }
      .cs-chart svg { display: block; width: 100%; height: 138px; }
      .cs-axis { position: relative; height: 16px; margin-top: 2px; }
      .cs-axis span { position: absolute; top: 0; transform: translateX(-50%); font-size: 10px; line-height: 16px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .cs-table-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .cs-range { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
      .cs-row {
        display: grid;
        grid-template-columns: minmax(0, 2.2fr) 96px 96px 108px 112px 24px;
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
      .cs-name-sub { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-secondary); }
      .cs-active { grid-area: active; }
      .cs-task { grid-area: task; }
      .cs-share { grid-area: share; display: flex; flex-direction: column; gap: 4px; }
      .cs-last { grid-area: last; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cs-toggle { grid-area: toggle; display: flex; justify-content: flex-end; }
      .cs-num { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; font-size: 12px; line-height: 18px; white-space: nowrap; }
      .cs-share-text { font-size: 12px; line-height: 16px; font-variant-numeric: tabular-nums; }
      .cs-share-track { display: block; height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
      .cs-share-fill { display: block; height: 100%; border-radius: 999px; background: var(--dsw-alias-brand-primary); }
      .cs-chevron { width: 7px; height: 7px; border-right: 1.5px solid var(--dsw-alias-label-secondary); border-bottom: 1.5px solid var(--dsw-alias-label-secondary); transform: rotate(45deg); transition: transform 0.15s ease; }
      .cs-chevron.is-open { transform: rotate(-135deg); }
      .cs-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
      .cs-sessions { display: flex; flex-direction: column; padding: 4px 0 8px 18px; border-bottom: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-base) 45%, transparent); }
      .cs-session { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 7px 0; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-session + .cs-session { border-top: 1px dashed var(--dsw-alias-border-l1); }
      .cs-session-title { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 540; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
      .cs-session-stat { font-variant-numeric: tabular-nums; white-space: nowrap; }
      .cs-session-last { margin-left: auto; white-space: nowrap; }
      .cs-chip { padding: 1px 6px; border-radius: 999px; font-size: 10px; line-height: 15px; background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent); color: var(--dsw-alias-label-secondary); }
      .cs-chip.is-live { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); color: var(--dsw-alias-state-success-primary); }
      .cs-empty { padding: 22px 12px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
      .cs-empty.is-small { padding: 10px; }
      .cs-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; }
      .cs-loading { min-height: 340px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 1px dashed var(--dsw-alias-border-l1); border-radius: 14px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cs-loading strong { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 600; }
      .cs-loading.is-error strong { color: var(--dsw-alias-state-error-primary); }
      .cs-spinner { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l1); border-top-color: var(--dsw-alias-brand-primary); animation: cs-spin 0.8s linear infinite; }
      @keyframes cs-spin { to { transform: rotate(360deg); } }
      @media (max-width: 1080px) {
        .cs-row { grid-template-columns: minmax(0, 2fr) 88px 88px 96px 100px 24px; }
      }
      @media (max-width: 860px) {
        .cs-topbar { flex-wrap: wrap; }
        .cs-topbar-right { width: 100%; justify-content: space-between; }
        .cs-cycles { grid-template-columns: 1fr; gap: 10px; }
        .cs-cycle { padding: 10px 14px; }
        .cs-table-head { display: none; }
        .cs-table-body { max-height: none; }
        .cs-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 12px; padding: 10px 0; }
        .cs-name { flex: 1 1 calc(100% - 36px); order: 0; }
        .cs-toggle { order: 1; }
        .cs-task { order: 2; }
        .cs-share { order: 3; flex: 1 1 90px; flex-direction: row; align-items: center; gap: 8px; }
        .cs-share-track { flex: 1; min-width: 40px; }
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
        .cs-metric-value { font-size: 19px; }
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
        --cs-task: color-mix(in srgb, var(--cs-signal) 60%, var(--cs-surface));
        --cs-tone-faint: color-mix(in srgb, var(--cs-signal-soft) 18%, var(--cs-surface));
        --cs-tone-soft: color-mix(in srgb, var(--cs-signal-soft) 38%, var(--cs-surface));
        --cs-tone-other: color-mix(in srgb, var(--cs-signal) 42%, var(--cs-surface));
        --cs-heat-0: var(--cs-tone-faint);
        --cs-heat-1: var(--cs-tone-soft);
        --cs-heat-2: var(--cs-signal-soft);
        --cs-heat-3: color-mix(in srgb, var(--cs-signal-soft) 72%, var(--cs-signal));
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
      .cs-shell { max-width: 1440px; gap: 18px; }
      .cs-topbar { min-height: 54px; margin-bottom: 4px; }
      .cs-mark { width: 42px; height: 42px; border-radius: 13px; background: var(--dsw-alias-brand-primary); color: white; border: 0; }
      .cs-brand-text h1 { font-size: 20px; line-height: 26px; }
      .cs-sub { font-size: 12px; }
      .cs-palette-label { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .cs-palette-label .cs-select-btn { min-height: 34px; font-size: 12px; }
      .cs-icon-toggle {
        appearance: none; display: inline-flex; align-items: center; justify-content: center;
        width: 34px; height: 34px; padding: 0; border-radius: 8px; cursor: pointer;
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
      .cs-cycles { gap: 16px; }
      .cs-cycle { padding: 19px 20px; gap: 12px; border-radius: 12px; }
      .cs-cycle.is-current { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
      .cs-cycle.is-current .cs-cycle-count, .cs-cycle.is-current .cs-metric-label, .cs-cycle.is-current .cs-cycle-metric.is-secondary .cs-metric-value { color: #e1e3e2; }
      .cs-metric-value { font-size: 25px; line-height: 30px; }
      .cs-card { padding: 20px; border-radius: 12px; }
      .cs-card-heading h2 { font-size: 16px; line-height: 24px; }
      .cs-trend-card { gap: 16px; }
      .cs-chart svg { height: 180px; }
      .cs-table-card { gap: 14px; }
      .cs-summary { padding: 13px 4px; }
      .cs-table-body { max-height: 400px; }
      .cs-session { padding: 10px 0; }
      .cs-page button:focus-visible, .cs-summary:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; }
      @media (max-width: 860px) { .cs-page { padding: 18px 16px 28px; } .cs-cycles { grid-template-columns: repeat(3, minmax(0, 1fr)); } .cs-cycle { padding: 14px; } }
      @media (max-width: 600px) { .cs-cycles { grid-template-columns: 1fr; } .cs-chart svg { height: 130px; } .cs-topbar-right { justify-content: flex-start; } }

      /* 趋势与真实周期摘要并排；窄窗口保持阅读与操作空间。 */
      .cs-overview-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; }
      .cs-insights { display: grid; grid-template-columns: minmax(0, 2.2fr) minmax(240px, 1fr); gap: 16px; align-items: stretch; }
      .cs-period-summary { display: flex; flex-direction: column; gap: 12px; }
      .cs-summary-heading { display: flex; flex-direction: column; gap: 4px; }
      .cs-summary-heading h2 { font-size: 16px; line-height: 24px; margin: 0; }
      .cs-summary-feature { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 9px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cs-summary-feature strong { color: var(--dsw-alias-label-primary); font-size: 26px; line-height: 32px; font-variant-numeric: tabular-nums; }
      .cs-summary-feature small { font-size: 11px; }
      .cs-summary-item { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 9px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cs-summary-item:last-child { border-bottom: 0; padding-bottom: 0; }
      .cs-summary-item strong { color: var(--dsw-alias-label-primary); font-size: 14px; font-variant-numeric: tabular-nums; }
      .cs-card, .cs-cycle, .cs-segment, .cs-palette-label .cs-select-btn { transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease; }
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
        --cs-error: #f09691;
      }
      .cs-page.cs-appearance-dark.cs-palette-stone {
        --cs-signal-deep: #d9dee0; --cs-signal: #aeb6b9; --cs-signal-soft: #6c7477;
      }
      .cs-page.cs-appearance-dark.cs-palette-clay {
        --cs-signal-deep: #f0c0a4; --cs-signal: #e2ac86; --cs-signal-soft: #8a5a40;
      }
      .cs-mark, .cs-segment.is-active, .cs-cycle.is-current { color: var(--cs-on-accent); }
      .cs-appearance-dark .cs-cycle.is-current .cs-cycle-count, .cs-appearance-dark .cs-cycle.is-current .cs-metric-label, .cs-appearance-dark .cs-cycle.is-current .cs-cycle-metric.is-secondary .cs-metric-value { color: color-mix(in srgb, var(--cs-on-accent) 72%, var(--cs-surface)); }
      .cs-appearance-dark .cs-segment.is-active { color: var(--cs-on-accent); }
      @media (max-width: 900px) { .cs-insights { grid-template-columns: 1fr; } }
      @media (prefers-reduced-motion: reduce) { .cs-page.cs-page *, .cs-page.cs-page *::before, .cs-page.cs-page *::after { transition-duration: 0s; animation-duration: 0s; } }

      /* 周期卡即入口，右上角只呈现当前选择。 */
      .cs-cycle { appearance: none; font: inherit; color: inherit; text-align: left; cursor: pointer; width: 100%; }
      .cs-cycle:not(.is-current):hover { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, var(--dsw-alias-bg-layer-1)); }
      .cs-cycle:active { transform: translateY(1px); }
      .cs-cycle-head { align-items: center; }
      .cs-cycle-count { margin-left: auto; }
      .cs-current-badge { font-size: 11px; padding: 2px 7px; border-radius: 5px; background: color-mix(in srgb, var(--cs-on-accent) 12%, transparent); }
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
      .cs-cycle { min-height: 132px; }
      .cs-cycle-title { font-size: 14px; }
      .cs-cycle-metric { align-items: center; }
      .cs-metric-label { font-size: 12px; }
      .cs-metric-value { font-size: 24px; letter-spacing: -0.025em; }
      .cs-cycle-metric.is-secondary .cs-metric-value { font-size: 16px; font-weight: 500; }
      .cs-cycle.is-current .cs-metric-value { font-weight: 700; }
      .cs-cycle.is-current .cs-cycle-metric.is-secondary .cs-metric-value { font-weight: 500; }
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
      @media (max-width: 600px) { .cs-cycle { min-height: 108px; } .cs-summary { padding: 12px 10px; } .cs-sessions { padding-left: 12px; } }

      /* 构成圆环与工作区排行均来自当前周期的真实会话累计数据；色阶全部由三档蓝派生。 */
      .cs-page {
        --cs-series-model: var(--cs-signal-deep);
        --cs-series-tool: color-mix(in srgb, var(--cs-signal) 72%, var(--cs-surface));
        --cs-series-wait: color-mix(in srgb, var(--cs-signal) 50%, var(--cs-surface));
        --cs-series-other: color-mix(in srgb, var(--cs-signal) 32%, var(--cs-surface));
        --cs-series-unknown: color-mix(in srgb, var(--cs-signal) 17%, var(--cs-surface));
      }
      .cs-analysis-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
      .cs-composition, .cs-ranking { min-height: 250px; display: flex; flex-direction: column; gap: 20px; }
      .cs-composition-body { display: flex; align-items: center; gap: 22px; flex: 1; }
      .cs-donut { position: relative; width: clamp(130px, 14vw, 190px); aspect-ratio: 1; flex: none; }
      .cs-donut svg { display: block; width: 100%; height: 100%; }
      .cs-donut-center { position: absolute; inset: 22%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
      .cs-donut-center strong { font-size: 19px; font-variant-numeric: tabular-nums; letter-spacing: -.025em; }
      .cs-donut-center span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cs-composition-list, .cs-ranking-list { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 12px; }
      .cs-composition-row { display: grid; grid-template-columns: 10px minmax(36px,1fr) 42px auto; align-items: center; gap: 8px; font-size: 12px; }
      .cs-series-swatch { width: 9px; height: 9px; border-radius: 2px; }
      .cs-series-swatch.is-model { background: var(--cs-series-model); }
      .cs-series-swatch.is-tool { background: var(--cs-series-tool); }
      .cs-series-swatch.is-wait { background: var(--cs-series-wait); }
      .cs-series-swatch.is-other { background: var(--cs-series-other); }
      .cs-series-swatch.is-unknown { background: var(--cs-series-unknown); }
      .cs-composition-percent, .cs-composition-time, .cs-ranking-time, .cs-ranking-share { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
      .cs-composition-percent, .cs-ranking-share, .cs-rank-index { color: var(--dsw-alias-label-secondary); }
      .cs-composition-time, .cs-ranking-time { font-weight: 600; }
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

      /* 解释性信息按需展开；聚焦和点击与悬浮同样可用。 */
      .cs-data-panels { display: flex; flex-direction: column; gap: 16px; }
      .cs-period-notice { padding: 8px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .cs-info { position: relative; display: inline-flex; align-items: center; flex: none; }
      .cs-info button { appearance: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; background: transparent; border-radius: 6px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
      .cs-info button:hover, .cs-info.is-open button, .cs-info button:focus-visible { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
      .cs-info button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-info-tip { visibility: hidden; opacity: 0; transform: translateY(-2px); pointer-events: none; position: absolute; z-index: 10; top: calc(100% + 5px); left: 0; width: max-content; max-width: min(260px, 65vw); padding: 9px 11px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 5px 18px #0002; font-size: 12px; font-weight: 400; line-height: 1.5; white-space: normal; transition: opacity var(--cs-dur-tap) var(--cs-ease), transform var(--cs-dur-tap) var(--cs-ease), visibility var(--cs-dur-tap) var(--cs-ease); }
      .cs-info:hover .cs-info-tip, .cs-info:focus-within .cs-info-tip, .cs-info.is-open .cs-info-tip { visibility: visible; opacity: 1; transform: translateY(0); }
      .cs-info.is-dismissed .cs-info-tip { visibility: hidden; opacity: 0; }
      .cs-section-head > .cs-info .cs-info-tip { left: auto; right: 0; }
      .cs-overview-heading > .cs-info .cs-info-tip, .cs-foot > .cs-info .cs-info-tip { left: auto; right: 0; }
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
      @media (max-width: 520px) { .cs-composition-body { flex-direction: column; align-items: center; } .cs-composition-list { width: 100%; } .cs-card-heading .cs-info-tip { left: -80px; width: 190px; max-width: calc(100vw - 100px); } }

      /* 数据管理：导出与清空。按钮沿用卡片体系，危险操作单独着色。 */
      .cs-data-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .cs-data-spacer { flex: 1 1 auto; min-width: 8px; }
      .cs-btn {
        appearance: none; font: inherit; font-size: 12px; line-height: 18px;
        padding: 6px 12px; border-radius: 8px; cursor: pointer;
        color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1);
      }
      .cs-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1)); }
      .cs-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-btn:disabled { opacity: .55; cursor: default; }
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
      .cs-session-stat { display: inline-flex; align-items: baseline; gap: 4px; }
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
        .cs-sessions { padding: 4px 12px 8px; }
        .cs-session { gap: 6px 10px; padding: 10px 0; }
        .cs-session-title { flex: 1 1 100%; max-width: 100%; }
        .cs-session-stat {
          display: inline-flex; align-items: baseline; gap: 4px;
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
      .cs-views { position: relative; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
      .cs-view { display: flex; flex-direction: column; gap: 12px; animation: viewIn var(--cs-dur-view) cubic-bezier(.2, .8, .2, 1) both; }
      .cs-view.is-leaving { animation: viewOut var(--cs-dur-exit) ease both; }
      .cs-curtain {
        position: absolute; inset: 0; z-index: 20; border-radius: 12px;
        background: var(--dsw-alias-bg-base); opacity: 0; pointer-events: none;
        transition: opacity var(--cs-dur-exit) ease;
      }
      .cs-curtain.is-on { opacity: .84; pointer-events: auto; }
      @keyframes viewIn { from { opacity: .45; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes viewOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-4px); } }

      .cs-recent-list { display: flex; flex-direction: column; }
      .cs-recent-row {
        display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto auto;
        align-items: center; gap: 12px; padding: 9px 2px; border: 0;
        border-top: 1px solid var(--dsw-alias-border-l1); background: transparent;
        font: inherit; color: inherit; text-align: left; cursor: pointer;
      }
      .cs-recent-row:first-child { border-top: 0; }
      .cs-recent-row:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); }
      .cs-recent-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
      .cs-recent-workspace { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cs-recent-time { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; font-size: 11px; }
      .cs-recent-last { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; text-align: right; }
      .cs-trend-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 12px; align-items: start; }
      .cs-trend-summary { display: flex; flex-direction: column; gap: 10px; }
      .cs-stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .cs-stat-box { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2); min-width: 0; }
      .cs-stat-box span { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
      .cs-stat-box b { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; font-size: 15px; line-height: 22px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
      .cs-details-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .cs-search {
        flex: 1 1 260px; min-width: 180px; appearance: none; font: inherit; font-size: 12px;
        padding: 7px 12px; border-radius: 9px; color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
      }
      .cs-search:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .cs-settings-board { display: flex; flex-direction: column; gap: 14px; }
      .cs-settings-hero { display: flex; flex-direction: column; gap: 2px; }
      .cs-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
      .cs-settings-card { min-width: 0; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
      .cs-settings-card > h3 { margin: 0 0 4px; font-size: 13px; line-height: 20px; font-weight: 650; }
      .cs-settings-wide { grid-column: 1 / -1; }
      .cs-settings-recheck { margin-top: 8px; justify-content: flex-start; }
      .cs-btn.is-primary { color: #fff; background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
      .cs-btn.is-primary:hover:not(:disabled) { filter: brightness(1.05); }
      @media (max-width: 860px) {
        .cs-trend-layout, .cs-settings-grid { grid-template-columns: 1fr; }
        .cs-recent-row { grid-template-columns: minmax(0, 1fr) auto; }
        .cs-recent-workspace { grid-column: 1 / -1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .cs-view, .cs-view.is-leaving, .cs-curtain, .cs-tab-thumb { animation: none !important; transition: none !important; }
      }
    `

    /** 设置页独立挂载在 settings.section，样式自成一套，不依赖仪表盘根节点。 */
    const CHRONOSCOPE_SETTINGS_CSS = `
      ${CS_SELECT_CSS}
      .cs-settings { box-sizing: border-box; color: var(--dsw-alias-label-primary); font-family: inherit; }
      .cs-settings *, .cs-settings *::before, .cs-settings *::after { box-sizing: border-box; }
      .cs-settings-inner { display: flex; flex-direction: column; gap: 18px; max-width: 720px; }
      .cs-settings-title { margin: 0; font-size: 18px; line-height: 24px; font-weight: 650; }
      .cs-settings-hint { margin: 4px 0 0; font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
      .cs-settings-group { display: flex; flex-direction: column; gap: 2px; }
      .cs-settings-group > h3 { margin: 0 0 6px; font-size: 12px; font-weight: 650; letter-spacing: .04em; color: var(--dsw-alias-label-secondary); }
      .cs-settings-row {
        display: grid; grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
        gap: 12px; align-items: start; padding: 12px 0;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
      }
      .cs-settings-label { font-size: 13px; line-height: 20px; font-weight: 600; }
      .cs-settings-row-hint { margin: 3px 0 0; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
      .cs-settings-control { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .cs-settings-control input[type="number"] {
        appearance: none; font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 8px;
        color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1); min-width: 96px;
      }
      .cs-settings-control input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-settings-control .cs-select-btn { min-width: 96px; font-size: 13px; }
      .cs-settings-unit { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .cs-settings-switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
      .cs-settings-switch input { width: 16px; height: 16px; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
      /* 数字格式：五张卡片始终可见，原生 button 支持 Tab/Enter/Space 操作。 */
      .cs-format-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; padding-top: 6px; }
      .cs-format-opt {
        padding: 10px 8px; text-align: center; border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px; background: transparent; color: inherit; font: inherit; cursor: pointer;
        transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
      }
      .cs-format-opt:hover:not(:disabled) { border-color: var(--dsw-alias-label-secondary); }
      .cs-format-opt:active:not(:disabled) { transform: scale(.97); }
      .cs-format-opt:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-format-opt.is-on { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-2); }
      .cs-format-opt:disabled { opacity: .55; cursor: default; }
      .cs-format-opt b { display: block; font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; }
      .cs-format-opt span { display: block; margin-top: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cs-format-preview {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        margin-top: 10px; padding: 10px 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2);
      }
      .cs-format-preview span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .cs-format-preview b { font-family: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-variant-numeric: tabular-nums; font-size: 14px; }
      @media (max-width: 620px) { .cs-format-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      .cs-settings-footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
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
      @media (max-width: 620px) { .cs-settings-row { grid-template-columns: 1fr; gap: 6px; } }
      @media (prefers-reduced-motion: reduce) {
        .cs-settings *, .cs-settings *::before, .cs-settings *::after { transition-duration: 0s; animation-duration: 0s; }
      }
    `

    /** 测试出口：主页面样式串，后续票据复用同一份设计 token。 */
    function chronoscopeCss() {
      return CHRONOSCOPE_CSS
    }

    /** 测试出口：侧栏入口的独立主题作用域样式串。 */
    function chronoscopeSidebarCss() {
      return CHRONOSCOPE_SIDEBAR_CSS
    }

    return {
      inject: ['connection', 'slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'chrono-scope: dictionaries')
        const t = ctx.locale.bind(NS)

        // 活跃采集不依赖侧边栏入口是否固定；放在始终挂载的 frame-wide overlay。
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'chrono-scope-presence',
            },
            createPresenceReporter(ctx),
          ),
        )

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'chrono-scope',
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
              key: 'chrono-scope',
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
              id: 'chrono-scope',
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
