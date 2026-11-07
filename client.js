/**
 * ChronoScope 的 Client 半。
 *
 * 四件事：在侧边栏注册常驻入口并显示今日活跃时长；在 frame-wide overlay 上
 * 挂载 presence 心跳（每 15 秒上报页面可见性、窗口聚焦、前台会话与最近操作）；
 * 在 main 的 chrono-scope 键下渲染日/周/月仪表盘（含导出与二次确认清空）；
 * 在 settings.section 下渲染三项设置。页面只负责渲染与交互，
 * 周期边界、跨午夜裁剪、并发并集、会话求和、设置归一化与文件序列化全部由
 * Host 领域服务计算；Client 不缓存业务状态，刷新后所有数字都重新从 Host 读取。
 */

window.__ModuleLoader__.load({
  id: '@local/chrono-scope',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'chrono-scope'
    const PRESENCE_HEARTBEAT_MS = 15_000
    const SIDEBAR_REFRESH_MS = 5_000
    const PAGE_REFRESH_MS = 10_000
    /** 回填进行时加快轮询，让进度与完成后的数字尽快出现，无需刷新页面。 */
    const BACKFILL_REFRESH_MS = 2_000

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
      navTooltip: 'ChronoScope · 今日活跃时长',
      periodDay: '日',
      periodWeek: '周',
      periodMonth: '月',
      periodLabel: '统计周期',
      paletteLabel: '配色',
      appearanceLabel: '外观',
      appearanceLight: '浅色',
      appearanceDark: '深色',
      currentPeriod: '当前周期',
      selectedPeriod: '当前',
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
      paletteMono: '黑白灰',
      paletteBlue: '雾蓝',
      paletteGreen: '森林绿',
      paletteWarm: '暖陶',
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
      backfillProgress: '已扫描 {done}/{total} 个会话，补入 {tasks} 条任务',
      backfillDone: '历史任务回填完成',
      backfillDoneHint: '已补入 {tasks} 条历史任务，仪表盘数据已更新',
      backfillFailed: '历史任务回填失败',
      backfillRetry: '重试',
      backfillRetrying: '正在重新回填…',
      backfillDismiss: '知道了',
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
      settingsSave: '保存设置',
      settingsSaving: '正在保存…',
      settingsSaved: '已保存，统计已按新设置更新',
      settingsLoadError: '无法读取设置，请重试',
      settingsRetry: '重试',
      settingsSaveError: '设置保存失败，请重试',
      settingsSectionGeneral: '统计口径',
      settingsSectionDisplay: '明细展示',
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
      clearStepHint: '这会删除本机全部 ChronoScope 在线、活跃与任务记录，且无法撤销；会话日志不受影响，三项设置会保留。',
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
      navTooltip: 'ChronoScope · active today',
      periodDay: 'Day',
      periodWeek: 'Week',
      periodMonth: 'Month',
      periodLabel: 'Period',
      paletteLabel: 'Colors',
      appearanceLabel: 'Appearance',
      appearanceLight: 'Light',
      appearanceDark: 'Dark',
      currentPeriod: 'Current period',
      selectedPeriod: 'Current',
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
      paletteMono: 'Monochrome',
      paletteBlue: 'Mist blue',
      paletteGreen: 'Forest',
      paletteWarm: 'Terracotta',
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
      backfillProgress: 'Scanned {done}/{total} sessions, added {tasks} tasks',
      backfillDone: 'Historical backfill complete',
      backfillDoneHint: 'Added {tasks} historical tasks; dashboard is up to date',
      backfillFailed: 'Historical backfill failed',
      backfillRetry: 'Retry',
      backfillRetrying: 'Restarting backfill…',
      backfillDismiss: 'Got it',
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
      settingsSave: 'Save settings',
      settingsSaving: 'Saving…',
      settingsSaved: 'Saved; statistics now use the new settings',
      settingsLoadError: 'Unable to read settings; please retry',
      settingsRetry: 'Retry',
      settingsSaveError: 'Could not save settings; please retry',
      settingsSectionGeneral: 'Counting rules',
      settingsSectionDisplay: 'Detail display',
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
      clearStepHint: 'This deletes all local ChronoScope online, active and task records and cannot be undone. Session logs are untouched and the three settings are kept.',
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

    function formatDuration(ms) {
      const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000) || 0)
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
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
      }
    }

    /** 读取 Host 的今日统计；侧边栏与页面各按自己的节奏轮询，Client 不缓存业务状态。 */
    function useTodayStats(ctx, refreshMs) {
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
      }, [ctx, refreshMs])

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

    /** 侧边栏常驻入口：图标 + 今日活跃时长；收起态只保留图标。 */
    function createSidebarEntry(ctx, t) {
      return function ChronoScopeSidebarEntry(props) {
        const stats = useTodayStats(ctx, SIDEBAR_REFRESH_MS)
        const liveElapsed = stats.activeRunning ? Math.max(0, Date.now() - stats.receivedAt) : 0
        const displayMs = stats.receivedAt > 0 ? stats.activeMs + liveElapsed : 0
        const value = stats.status === 'loading' ? '–:––:––' : formatDuration(displayMs)
        const wide = typeof props?.size !== 'number' || props.size !== 18
        return h(
          'span',
          {
            className: 'chronoscope-nav-entry',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              minWidth: 0,
            },
            title: t('navTooltip'),
          },
          h(ChronoIcon, { size: props?.size, active: props?.active }),
          wide
            ? h(
                'span',
                {
                  className: `chronoscope-nav-time${stats.activeRunning ? ' is-live' : ''}`,
                  style: {
                    color: stats.activeRunning ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)',
                    fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace',
                    fontSize: '11px',
                    lineHeight: '16px',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap',
                  },
                  'aria-hidden': true,
                },
                value,
              )
            : null,
        )
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
      }
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
      if (range === null) return ''
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
      React.useLayoutEffect(() => {
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

    function buildTrendTip(bucket, period, t, isZh) {
      return {
        kind: 'bucket',
        key: bucket.key,
        title: bucketLabel(bucket, period, isZh),
        rows: [
          { key: 'active', label: t('activeLabel'), value: formatDuration(bucket.activeMs) },
          { key: 'task', label: t('taskLabel'), value: formatDuration(bucket.taskMs) },
        ],
      }
    }

    function buildCompositionTip(item, total, t) {
      return {
        kind: 'composition',
        key: item.key,
        title: item.label,
        rows: [
          { key: 'share', label: t('shareLabel'), value: formatPercent(total > 0 ? item.ms / total : 0) },
          { key: 'duration', label: t('durationLabel'), value: formatDuration(item.ms) },
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
    function renderTrendChart(trend, period, t, isZh, hover, actions = {}) {
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
        const tip = buildTrendTip(bucket, period, t, isZh)
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
            fill: 'var(--dsw-alias-brand-primary)',
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
            fill: 'var(--dsw-alias-state-success-primary)',
          }))
        }
        const groupProps = {
          key: bucket.key,
          className: `cs-bar-group${hot ? ' is-hot' : ''}`,
          tabIndex: 0,
          role: 'button',
          'aria-label': `${label} · ${t('activeLabel')} ${formatDuration(bucket.activeMs)} · ${t('taskLabel')} ${formatDuration(bucket.taskMs)}`,
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
          h('span', { key: ratio, style: { top: `${((baseline - usable * ratio) / height) * 100}%` } }, formatDuration(peak * ratio)))),
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
    function overviewHint(data, t) {
      const parts = [t('periodHint')]
      if (data?.period !== 'day' && data?.range) {
        parts.push(`${t('dailyAverageActive')} ${formatDuration(averageMsPerDay(data, 'activeMs'))}`)
        parts.push(`${t('dailyAverageTask')} ${formatDuration(averageMsPerDay(data, 'taskMs'))}`)
      }
      parts.push(t('recordSinceBoot'))
      return parts.join(' · ')
    }

    function renderCycleCard(t, period, cycle, isCurrent, onSelect) {
      const titleKey = period === 'day' ? 'cycleToday' : period === 'week' ? 'cycleWeek' : 'cycleMonth'
      return h('button', { key: period, type: 'button', className: `cs-cycle${isCurrent ? ' is-current' : ''}`, 'aria-pressed': isCurrent, onClick: onSelect },
        h('div', { className: 'cs-cycle-head' },
          h('span', { className: 'cs-cycle-title' }, t(titleKey)),
          isCurrent ? h('span', { className: 'cs-current-badge' }, t('selectedPeriod')) : null,
          h('span', { className: 'cs-cycle-count' }, `${cycle.taskCount} ${t('taskCountUnit')}`)),
        h('div', { className: 'cs-cycle-metric' },
          h('span', { className: 'cs-metric-label' }, t('activeLabel')),
          h('span', { className: 'cs-metric-value' }, formatDuration(cycle.activeMs))),
        h('div', { className: 'cs-cycle-metric is-secondary' },
          h('span', { className: 'cs-metric-label' }, t('taskLabel')),
          h('span', { className: 'cs-metric-value' }, formatDuration(cycle.taskMs))))
    }

    /** 口径信息可悬浮、聚焦或点击查看；文字留在无障碍名称中。 */
    function Info({ message }) {
      const [open, setOpen] = React.useState(false)
      return h('span', { className: `cs-info${open ? ' is-open' : ''}` },
        h('button', {
          type: 'button', 'aria-label': message, 'aria-expanded': open,
          onClick: () => setOpen((value) => !value),
          onBlur: () => setOpen(false),
          onKeyDown: (event) => { if (event.key === 'Escape') setOpen(false) },
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
    function renderComposition(data, t, hover, actions = {}) {
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
        const tip = buildCompositionTip(item, total, t)
        const props = {
          key: item.key,
          className: `cs-donut-seg is-${item.key}${hotKey === item.key ? ' is-hot' : ''}`,
          cx: 50, cy: 50, r: radius,
          fill: 'none', stroke: `var(--cs-series-${item.key})`, strokeWidth: 11,
          strokeDasharray: `${fraction * circumference} ${circumference}`,
          strokeDashoffset: -offset * circumference,
          tabIndex: 0,
          role: 'button',
          'aria-label': `${item.label} · ${t('shareLabel')} ${formatPercent(fraction)} · ${t('durationLabel')} ${formatDuration(item.ms)}`,
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
          h('div', { className: 'cs-card-heading' }, h('h2', null, t('compositionTitle')), renderInfo(t('compositionInfo'))),
          h('span', { className: 'cs-card-hint' }, t('compositionHint'))),
        total === 0 ? h('div', { className: 'cs-empty' }, t('noTaskComposition'))
          : h('div', { className: 'cs-composition-body' },
              h('div', {
                className: `cs-donut${hotKey ? ' has-hot' : ''}`,
                role: 'group',
                'aria-label': `${t('compositionTitle')} · ${t('accumulated')} ${formatDuration(total)}`,
              },
                h('svg', { viewBox: '0 0 100 100' },
                  h('circle', { cx: 50, cy: 50, r: radius, fill: 'none', stroke: 'var(--dsw-alias-bg-layer-2)', strokeWidth: 11 }),
                  h('g', { transform: 'rotate(-90 50 50)' }, ...segments)),
                h('div', { className: 'cs-donut-center' }, h('strong', null, formatDuration(total)), h('span', null, t('accumulated')))),
              h('div', { className: 'cs-composition-list' }, visibleParts.map((item) => {
                const tip = buildCompositionTip(item, total, t)
                const props = {
                  key: item.key,
                  className: `cs-composition-row${hotKey === item.key ? ' is-hot' : ''}`,
                  tabIndex: 0,
                  role: 'button',
                  'aria-label': `${item.label} · ${t('shareLabel')} ${formatPercent(item.ms / total)} · ${t('durationLabel')} ${formatDuration(item.ms)}`,
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
                  h('span', { className: 'cs-composition-time' }, formatDuration(item.ms)))
              }))))
    }

    /** 排名与占比沿用 Host 的工作区累计工时，不把并发任务相加当作实际占用。 */
    function renderWorkspaceRanking(data, t) {
      const rows = [...data.workspaces].filter((row) => row.taskMs > 0).sort((a, b) => b.taskMs - a.taskMs).slice(0, 5)
      return h('section', { className: 'cs-card cs-ranking' },
        h('div', { className: 'cs-card-head' }, h('div', { className: 'cs-card-heading' },
          h('h2', null, t('workspaceRanking')), renderInfo(t('sumFoot'))), h('span', { className: 'cs-card-hint' }, t('accumulated'))),
        rows.length === 0 ? h('div', { className: 'cs-empty' }, t('noTaskComposition'))
          : h('div', { className: 'cs-ranking-list' }, rows.map((row, index) =>
              h('div', { className: 'cs-ranking-row', key: row.key, title: `${row.workspaceTitle ?? t('unassigned')} · ${t('taskLabel')} ${formatDuration(row.taskMs)} · ${t('colShare')} ${formatPercent(row.share)}` },
                h('span', { className: 'cs-rank-index' }, String(index + 1).padStart(2, '0')),
                h('span', { className: 'cs-ranking-name', title: row.workspaceTitle ?? t('unassigned') }, row.workspaceTitle ?? t('unassigned')),
                h('span', { className: 'cs-ranking-bar', 'aria-hidden': true },
                  h('i', { style: { width: formatPercent(row.share) } })),
                h('span', { className: 'cs-ranking-time' }, formatDuration(row.taskMs)),
                h('span', { className: 'cs-ranking-share' }, formatPercent(row.share))))))
    }

    /** 恢复票 03 的任务构成展示：四部分之和等于任务时长，历史任务显示「未拆分」。 */
    function renderSessionBreakdown(session, t) {
      const values = [session.modelMs, session.toolMs, session.waitMs, session.otherMs]
      const labels = ['breakdownModel', 'breakdownTool', 'breakdownWait', 'breakdownOther']
      let remaining = Math.max(0, session.taskMs)
      const parts = values.map((value, index) => {
        const amount = Math.min(remaining, Math.max(0, value))
        remaining -= amount
        return amount > 0 ? `${t(labels[index])} ${formatDuration(amount)}` : null
      }).filter(Boolean)
      if (remaining > 0) parts.push(`${t('notBroken')} ${formatDuration(remaining)}`)
      return h('span', { className: 'cs-session-breakdown' }, parts.join(' · ') || t('notBroken'))
    }

    function renderSessionRow(session, t, nowMs, subagentRows) {
      const subagents = subagentRows.length
      return h('div', { className: 'cs-session', key: session.sessionId },
        h('span', { className: 'cs-session-title' }, session.sessionTitle ?? t('unknownSession')),
        session.taskRunning ? h('span', { className: 'cs-chip is-live' }, t('runningTag')) : null,
        session.approximate ? h('span', { className: 'cs-chip', title: t('approximateHint') }, t('approximateTag')) : null,
        h('span', { className: 'cs-session-stat' }, `${t('activeLabel')} ${formatDuration(session.activeMs)}`),
        h('span', { className: 'cs-session-stat' }, `${t('taskLabel')} ${formatDuration(session.taskMs)}`),
        h('span', { className: 'cs-session-stat' }, `${session.taskCount} ${t('taskCountUnit')}`),
        h('span', { className: 'cs-session-last' }, formatRelativeTime(session.lastActivityAt, t, nowMs)),
        session.taskCount > 0 ? renderSessionBreakdown(session, t) : null,
        // 子代理任务只在父会话明细里露出，不参与上面的任务时长与次数。
        subagents > 0
          ? h('span', {
            className: 'cs-session-subagents',
            title: subagentRows.map((row) => row.sessionTitle ?? row.sessionId).join('、'),
          }, `${t('subagentDetail')} · ${t('subagentDetailHint')
            .replace('{count}', String(subagents))
            .replace('{duration}', formatDuration(subagentRows.reduce((sum, row) => sum + row.durationMs, 0)))}`)
          : null)
    }

    function renderWorkspaceRow(row, isOpen, onToggle, t, nowMs, subagentByParent) {
      return h('div', { className: 'cs-group', key: row.key },
        h('div', {
          className: 'cs-row cs-summary',
          role: 'button',
          tabIndex: 0,
          'aria-expanded': isOpen,
          'aria-label': `${row.workspaceTitle ?? t('unassigned')} · ${t(isOpen ? 'collapse' : 'expand')}`,
          onClick: onToggle,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onToggle()
            }
          },
        },
          h('div', { className: 'cs-cell cs-name' },
            h('span', { className: 'cs-name-text' }, row.workspaceTitle ?? t('unassigned')),
            h('span', { className: 'cs-name-sub' }, `${row.sessions.length} ${t('sessionsUnit')}`)),
          h('div', { className: 'cs-cell cs-active cs-num', 'data-label': t('colActive') }, formatDuration(row.activeMs)),
          h('div', { className: 'cs-cell cs-task cs-num', 'data-label': t('colTask') }, formatDuration(row.taskMs)),
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
                renderSessionRow(session, t, nowMs, subagentByParent[session.sessionId] ?? [])))
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
        if (handlers.dismissed) return null
        return h('div', { className: 'cs-backfill is-done' },
          h('span', { className: 'cs-backfill-icon' }, '✓'),
          h('span', { className: 'cs-backfill-label' }, t('backfillDone')),
          h('span', { className: 'cs-backfill-hint' },
            t('backfillDoneHint').replace('{tasks}', String(backfill.tasksWritten))),
          h('button', { type: 'button', className: 'cs-backfill-dismiss', onClick: handlers.onDismiss },
            t('backfillDismiss')))
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

        const patch = (key, value) =>
          setDraft((previous) => ({ ...(previous ?? settingsDraft(null)), [key]: value }))

        const onSave = async () => {
          // 只有成功读到 Host 设置后才允许写入，避免用草稿覆盖未读到的真实值。
          if (draft === null || phase === 'load-error') return
          setPhase('saving')
          setMessage('')
          try {
            const saved = await callHost(ctx, 'setSettings', {
              idleThresholdMinutes: Number(draft.idleThresholdMinutes),
              weekStartsOn: Number(draft.weekStartsOn),
              showSubagents: draft.showSubagents === true,
            })
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
                h('select', {
                  value: draft?.idleThresholdMinutes ?? '5',
                  disabled: busy,
                  'aria-label': t('settingsIdleLabel'),
                  onChange: (event) => patch('idleThresholdMinutes', event?.target?.value ?? '5'),
                }, idleOptions.map((value) => h('option', { key: value, value }, value))),
                h('span', { className: 'cs-settings-unit' }, t('settingsIdleUnit')),
                h('span', { className: 'cs-settings-unit' }, t('settingsIdleRange'))),
              settingsRow(t, 'settingsWeekLabel', 'settingsWeekHint',
                h('select', {
                  value: draft?.weekStartsOn ?? '1',
                  disabled: busy,
                  'aria-label': t('settingsWeekLabel'),
                  onChange: (event) => patch('weekStartsOn', event?.target?.value === '7' ? '7' : '1'),
                },
                  h('option', { value: '1' }, t('settingsWeekMonday')),
                  h('option', { value: '7' }, t('settingsWeekSunday'))))),
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
                  h('span', null, draft?.showSubagents === false ? t('settingsSubagentOff') : t('settingsSubagentOn'))))),
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

    function createPage(ctx) {
      return function ChronoPage(props) {
        const t = props?.t ?? ((key) => key)
        const isZh = t('periodDay') === '日'
        const [period, setPeriod] = React.useState(() => {
          try { const value = window.sessionStorage.getItem('chrono-scope.period'); return ['day', 'week', 'month'].includes(value) ? value : 'day' }
          catch { return 'day' }
        })
        const [palette, setPalette] = React.useState(() => {
          try {
            const saved = window.localStorage.getItem('chrono-scope.palette')
            return ['mono', 'blue', 'green', 'warm'].includes(saved) ? saved : 'mono'
          } catch { return 'mono' }
        })
        const [appearance, setAppearance] = React.useState(() => {
          try { return window.localStorage.getItem('chrono-scope.appearance') === 'dark' ? 'dark' : 'light' }
          catch { return 'light' }
        })
        const [paletteSaveError, setPaletteSaveError] = React.useState(false)
        const changeAppearance = (event) => {
          const value = event.target.value
          setAppearance(value)
          try { window.localStorage.setItem('chrono-scope.appearance', value); setPaletteSaveError(false) }
          catch { setPaletteSaveError(true) }
        }
        const changePalette = (event) => {
          const value = event.target.value
          setPalette(value)
          try { window.localStorage.setItem('chrono-scope.palette', value); setPaletteSaveError(false) }
          catch { setPaletteSaveError(true) }
        }
        const [expanded, setExpanded] = React.useState(() => {
          try {
            const value = JSON.parse(window.sessionStorage.getItem('chrono-scope.expanded') || '{}')
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
          } catch { return {} }
        })
        React.useEffect(() => { try { window.sessionStorage.setItem('chrono-scope.period', period) } catch {} }, [period])
        React.useEffect(() => { try { window.sessionStorage.setItem('chrono-scope.expanded', JSON.stringify(expanded)) } catch {} }, [expanded])
        const [pollMs, setPollMs] = React.useState(PAGE_REFRESH_MS)
        const [refreshNonce, setRefreshNonce] = React.useState(0)
        const [dismissedBackfill, setDismissedBackfill] = React.useState(false)
        const [retrying, setRetrying] = React.useState(false)
        const [retryError, setRetryError] = React.useState(null)
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
        const backfill = data?.backfill ?? normalizeBackfill(null)
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
        React.useEffect(() => subscribeSettingsChanged(() => setRefreshNonce((value) => value + 1)), [])

        const [clearStep, setClearStep] = React.useState(false)
        const [dataBusy, setDataBusy] = React.useState('')
        const [dataMessage, setDataMessage] = React.useState(null)

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
            setDismissedBackfill(false)
            setRefreshNonce((value) => value + 1)
          } catch (error) {
            setRetryError(String(error?.message ?? error))
          } finally {
            setRetrying(false)
          }
        }
        const nowMs = Date.now()
        if (state.status === 'loading' && data === null) {
          return h('div', { className: `cs-page cs-palette-${palette} cs-appearance-${appearance}` },
            h('style', null, CHRONOSCOPE_CSS),
            h('div', { className: 'cs-shell' },
              h('div', { className: 'cs-loading' },
                h('span', { className: 'cs-spinner' }),
                h('strong', null, t('loadingTitle')),
                h('span', null, t('loading')))))
        }
        if (state.status === 'error' && data === null) {
          return h('div', { className: `cs-page cs-palette-${palette} cs-appearance-${appearance}` },
            h('style', null, CHRONOSCOPE_CSS),
            h('div', { className: 'cs-shell' },
              h('div', { className: 'cs-loading is-error' },
                h('strong', null, t('errorTitle')),
                h('span', null, t('retryHint')))))
        }

        const isEmpty = data.workspaces.length === 0
        const hasApproximate = approximateNoticeVisible(data)
        const shownPeriod = data.period
        const trendTitleKey = shownPeriod === 'day' ? 'trendDay' : shownPeriod === 'week' ? 'trendWeek' : 'trendMonth'
        const toggleRow = (key) => setExpanded((previous) => ({ ...previous, [key]: !previous[key] }))

        return h('div', { className: `cs-page cs-palette-${palette} cs-appearance-${appearance}` },
          h('style', null, CHRONOSCOPE_CSS),
          h('div', { className: 'cs-shell' },
            h('header', { className: 'cs-topbar' },
              h('div', { className: 'cs-brand' },
                h('span', { className: 'cs-mark' }, h(ChronoIcon, { size: 20, active: true })),
                h('div', { className: 'cs-brand-text' },
                  h('h1', null, t('title')),
                  h('span', { className: 'cs-sub' }, t('subtitle')))),
              h('div', { className: 'cs-topbar-right' },
                h('label', { className: 'cs-palette-label' }, t('appearanceLabel'),
                  h('select', { value: appearance, onChange: changeAppearance, 'aria-label': t('appearanceLabel') },
                    h('option', { value: 'light' }, t('appearanceLight')),
                    h('option', { value: 'dark' }, t('appearanceDark')))),
                h('label', { className: 'cs-palette-label' }, t('paletteLabel'),
                  h('select', { value: palette, onChange: changePalette, 'aria-label': t('paletteLabel') },
                    h('option', { value: 'mono' }, t('paletteMono')),
                    h('option', { value: 'blue' }, t('paletteBlue')),
                    h('option', { value: 'green' }, t('paletteGreen')),
                    h('option', { value: 'warm' }, t('paletteWarm')))),
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
            renderBackfillBanner(backfill, {
              dismissed: dismissedBackfill,
              onDismiss: () => setDismissedBackfill(true),
              retrying,
              retryError,
              onRetry: onRetryBackfill,
            }, t),
            h('div', { className: 'cs-section-head' },
              h('div', { className: 'cs-overview-heading' },
                h('span', { className: 'cs-section-title' }, t('overviewTitle')),
                h('span', { className: 'cs-card-hint' }, overviewHint(data, t))),
              renderInfo(t('unionFoot'))),
            h('div', { className: 'cs-cycles' },
              ['day', 'week', 'month'].map((item) => renderCycleCard(t, item, data.cycles[item], item === period, () => setPeriod(item)))),
            h('div', { className: 'cs-data-panels', 'aria-busy': switchingPeriod },
            switchingPeriod && (showPeriodWait || state.status === 'error')
              ? h('div', { className: 'cs-period-notice', role: 'status' },
                  `${t(state.status === 'error' ? 'periodLoadFailed' : 'periodLoading')} · ${t(shownPeriod === 'day' ? 'cycleToday' : shownPeriod === 'week' ? 'cycleWeek' : 'cycleMonth')}`)
              : null,
            h('div', { className: 'cs-analysis-grid' },
              renderComposition(data, t, hoverTip.tip, { onHover: hoverTip.show, onLeave: hoverTip.hide }),
              renderWorkspaceRanking(data, t)),
            h('section', { className: 'cs-card cs-trend-card' },
              h('div', { className: 'cs-card-head' },
                h('div', { className: 'cs-card-heading' },
                  h('h2', null, t(trendTitleKey)),
                  renderInfo(t('trendInfo'))),
                h('div', { className: 'cs-legend' },
                  h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-active' }), t('activeLabel')),
                  h('span', { className: 'cs-legend-item' }, h('i', { className: 'cs-swatch is-task' }), t('taskLabel')))),
              isEmpty
                ? h('div', { className: 'cs-empty' }, t('emptyDashboard'))
                : renderTrendChart(data.trend, shownPeriod, t, isZh, hoverTip.tip, { onHover: hoverTip.show, onLeave: hoverTip.hide })),
            h('section', { className: 'cs-card cs-table-card' },
              h('div', { className: 'cs-card-head' },
                h('div', { className: 'cs-card-heading' },
                  h('h2', null, t('workspaceTitle')),
                  renderInfo(t('sumFoot'))),
                h('div', { className: 'cs-table-meta' },
                  h('span', { className: 'cs-range' }, formatRangeLabel(data.range, shownPeriod, t, isZh)))),
              h('div', { className: 'cs-table-head cs-row' },
                h('div', { className: 'cs-cell cs-name' }, t('colWorkspace')),
                h('div', { className: 'cs-cell cs-active' }, t('colActive')),
                h('div', { className: 'cs-cell cs-task' }, t('colTask')),
                h('div', { className: 'cs-cell cs-share' }, t('colShare')),
                h('div', { className: 'cs-cell cs-last' }, t('colLast')),
                h('div', { className: 'cs-cell cs-toggle' })),
              isEmpty
                ? h('div', { className: 'cs-empty' }, t('emptyDashboard'))
                : h('div', { className: 'cs-table-body' },
                    data.workspaces.map((row) =>
                      renderWorkspaceRow(row, expanded[row.key] === true, () => toggleRow(row.key),
                        t, nowMs, subagentByParent))))),
            h('section', { className: 'cs-card cs-data-card' },
              h('div', { className: 'cs-card-head' },
                h('div', { className: 'cs-card-heading' },
                  h('h2', null, t('dataTitle')),
                  renderInfo(t('dataHint')))),
              h('div', { className: 'cs-data-actions' },
                h('button', {
                  type: 'button', className: 'cs-btn', disabled: dataBusy !== '',
                  onClick: () => onExport('json'),
                }, dataBusy === 'json' ? t('exporting') : t('exportJson')),
                h('button', {
                  type: 'button', className: 'cs-btn', disabled: dataBusy !== '',
                  onClick: () => onExport('csv'),
                }, dataBusy === 'csv' ? t('exporting') : t('exportCsv')),
                h('span', { className: 'cs-data-spacer' }),
                h('button', {
                  type: 'button', className: 'cs-btn is-danger', disabled: dataBusy !== '',
                  onClick: () => { setClearStep(true); setDataMessage(null) },
                }, t('clearData'))),
              clearStep
                ? h('div', { className: 'cs-clear-confirm', role: 'alertdialog', 'aria-label': t('clearStepTitle') },
                    h('strong', null, t('clearStepTitle')),
                    h('p', null, t('clearStepHint')),
                    h('div', { className: 'cs-clear-buttons' },
                      h('button', {
                        type: 'button', className: 'cs-btn', disabled: dataBusy !== '',
                        onClick: () => setClearStep(false),
                      }, t('clearCancel')),
                      h('button', {
                        type: 'button', className: 'cs-btn is-danger is-solid', disabled: dataBusy !== '',
                        onClick: onClear,
                      }, dataBusy === 'clear' ? t('clearing') : t('clearConfirm'))))
                : null,
              dataMessage
                ? h('div', {
                    className: `cs-data-status${dataMessage.error ? ' is-error' : ''}`,
                    role: 'status',
                  }, dataMessage.text)
                : null),
            h('footer', { className: 'cs-foot' },
              [
                `${t('todayActive')} ${formatDuration(data.cycles.day.activeMs)} · ${t('todayOnline')} ${formatDuration(data.cycles.day.onlineMs)}`,
                t('localOnly'),
                hasApproximate ? t('approximateHint') : null,
              ].filter(Boolean).join(' · ')),
            h(HoverTip, { key: 'hover-tip', tip: hoverTip.tip })))
      }
    }

    const CHRONOSCOPE_CSS = `
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
      .cs-swatch.is-active { background: var(--dsw-alias-brand-primary); }
      .cs-swatch.is-task { background: var(--dsw-alias-state-success-primary); }
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
      .cs-foot { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 16px; }
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

      /* 配色与布局只作用于插件页面，不覆盖宿主界面。 */
      .cs-page {
        --dsw-alias-bg-base: #f3f3f2;
        --dsw-alias-bg-layer-1: #ffffff;
        --dsw-alias-bg-layer-2: #ececeb;
        --dsw-alias-label-primary: #181a1c;
        --dsw-alias-label-secondary: #606568;
        --dsw-alias-border-l1: #dedfdd;
        --dsw-alias-brand-primary: #292d30;
        --dsw-alias-state-success-primary: #73797b;
        --dsw-alias-state-idle-primary: #8a8e90;
        --dsw-alias-state-error-primary: #ad3e3e;
        color-scheme: light;
        padding: 28px 32px 36px;
      }
      .cs-palette-blue { --dsw-alias-brand-primary: #315878; --dsw-alias-state-success-primary: #7492a8; --dsw-alias-bg-base: #f0f4f6; }
      .cs-palette-green { --dsw-alias-brand-primary: #285642; --dsw-alias-state-success-primary: #78947c; --dsw-alias-bg-base: #f1f5f0; }
      .cs-palette-warm { --dsw-alias-brand-primary: #96543f; --dsw-alias-state-success-primary: #c8957d; --dsw-alias-bg-base: #f7f2ee; }
      .cs-shell { max-width: 1440px; gap: 18px; }
      .cs-topbar { min-height: 54px; margin-bottom: 4px; }
      .cs-mark { width: 42px; height: 42px; border-radius: 13px; background: var(--dsw-alias-brand-primary); color: white; border: 0; }
      .cs-brand-text h1 { font-size: 20px; line-height: 26px; }
      .cs-sub { font-size: 12px; }
      .cs-palette-label { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .cs-palette-label select { font: inherit; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; min-height: 34px; padding: 0 28px 0 10px; cursor: pointer; }
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
      .cs-page button:focus-visible, .cs-page select:focus-visible, .cs-summary:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; }
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
      .cs-card, .cs-cycle, .cs-segment, .cs-palette-label select { transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease; }
      .cs-page { --cs-on-accent: #fff; }
      .cs-appearance-dark {
        color-scheme: dark;
        --dsw-alias-bg-base: #151718;
        --dsw-alias-bg-layer-1: #202324;
        --dsw-alias-bg-layer-2: #303435;
        --dsw-alias-label-primary: #f1f2f1;
        --dsw-alias-label-secondary: #b1b6b5;
        --dsw-alias-border-l1: #414647;
        --dsw-alias-brand-primary: #e4e7e5;
        --dsw-alias-state-success-primary: #969d9a;
        --dsw-alias-state-idle-primary: #a8aeac;
        --dsw-alias-state-error-primary: #f09691;
        --cs-on-accent: #171a19;
      }
      .cs-appearance-dark.cs-palette-blue { --dsw-alias-bg-base: #151c21; --dsw-alias-brand-primary: #a9cbe0; --dsw-alias-state-success-primary: #6f8ca0; }
      .cs-appearance-dark.cs-palette-green { --dsw-alias-bg-base: #151d19; --dsw-alias-brand-primary: #afcfb4; --dsw-alias-state-success-primary: #779681; }
      .cs-appearance-dark.cs-palette-warm { --dsw-alias-bg-base: #201a18; --dsw-alias-brand-primary: #e5b5a0; --dsw-alias-state-success-primary: #ac806e; }
      .cs-mark, .cs-segment.is-active, .cs-cycle.is-current { color: var(--cs-on-accent); }
      .cs-appearance-dark .cs-cycle.is-current .cs-cycle-count, .cs-appearance-dark .cs-cycle.is-current .cs-metric-label, .cs-appearance-dark .cs-cycle.is-current .cs-cycle-metric.is-secondary .cs-metric-value { color: #38413d; }
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

      /* 构成圆环与工作区排行均来自当前周期的真实会话累计数据。 */
      .cs-page {
        --cs-series-model: var(--dsw-alias-brand-primary);
        --cs-series-tool: color-mix(in srgb, var(--dsw-alias-brand-primary) 72%, var(--dsw-alias-bg-layer-1));
        --cs-series-wait: color-mix(in srgb, var(--dsw-alias-brand-primary) 50%, var(--dsw-alias-bg-layer-1));
        --cs-series-other: color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, var(--dsw-alias-bg-layer-1));
        --cs-series-unknown: color-mix(in srgb, var(--dsw-alias-brand-primary) 17%, var(--dsw-alias-bg-layer-1));
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
      .cs-info-tip { display: none; position: absolute; z-index: 10; top: calc(100% + 5px); left: 0; width: max-content; max-width: min(260px, 65vw); padding: 9px 11px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 5px 18px #0002; font-size: 12px; font-weight: 400; line-height: 1.5; white-space: normal; }
      .cs-info:hover .cs-info-tip, .cs-info:focus-within .cs-info-tip, .cs-info.is-open .cs-info-tip { display: block; }
      .cs-section-head > .cs-info .cs-info-tip { left: auto; right: 0; }
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
    `

    /** 设置页独立挂载在 settings.section，样式自成一套，不依赖仪表盘根节点。 */
    const CHRONOSCOPE_SETTINGS_CSS = `
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
      .cs-settings-control select, .cs-settings-control input[type="number"] {
        appearance: none; font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 8px;
        color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1); min-width: 96px;
      }
      .cs-settings-control select:focus-visible, .cs-settings-control input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .cs-settings-unit { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .cs-settings-switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
      .cs-settings-switch input { width: 16px; height: 16px; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
      .cs-settings-footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .cs-settings-status { font-size: 12px; color: var(--dsw-alias-state-success-primary); }
      .cs-settings-status.is-error { color: var(--dsw-alias-state-error-primary); }
      @media (max-width: 620px) { .cs-settings-row { grid-template-columns: 1fr; gap: 6px; } }
    `

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

        // 设置页挂在 DSH 的 settings.section 上：三项设置只经 Host 公共操作
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
