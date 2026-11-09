# Agent 查询工具：timespan_stats 复用统计领域操作

状态：accepted
日期：2026-11-05

票 07 需要在对话里回答「我今天用了多久」。`timespan_stats` 不另写一套统计管线：它把工具参数归一化成 `queryStats` 的查询选项，再把同一份结果投影成稳定的 JSON 与中文文本。页面、侧边栏和工具都从 `src/domain/dsh-timespan-domain.js` 的 `queryStats` 取数，因此「页面与工具数字一致」不是靠两边对账，而是结构上只有一份计算。

查询窗口：显式 `from`/`to` 优先于 `period`，两者都按 Host 本地时区的自然日解释；`from` 含当天零点，`to` 含当天，内部用次日零点作为排他上界。只给一端时，另一端分别是「现在」或「最早记录」。`period` 在显式范围下仍保留为展示标签，并决定仪表盘趋势桶的粒度。

口径：`totals.activeMs` / `totals.taskMs` 是时间并集的实际占用，`totals.activeSumMs` / `totals.taskSumMs` 是工作区与会话明细的累计工时；两者都原样来自 `queryStats`。`groupBy=workspace|session` 的每行数字与仪表盘对应明细行完全同源，不重新聚合。子代理任务仍按 ADR-0002 的顶层过滤不进入总计。

筛选：`workspace` / `session` 先按精确 ID、再按大小写不敏感的完整标题匹配。重名视为 ambiguous 并提示改用 ID；不存在时返回结构化错误而不是静默当作无筛选。按工作区或会话筛选时，应用级「在线时长」不归属到任何工作区，工具返回 `onlineMs: 0` 并在文本中省略，避免把全应用在线时间冒充成筛选范围的时间。

工具只读：`execute` 只调用 `queryStats`，不写区间、任务、设置或回填状态；参数错误、未知筛选与空数据都以 `{ok:false,error}` 或全零成功结果返回，不向模型抛未处理异常。工具注册使用 `ctx.tools.register`，随插件 fiber 自动注销；正常卸载不会留下同名注册。
