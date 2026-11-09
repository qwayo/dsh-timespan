## Agent 技能

### 议题跟踪器

议题与规格都存放在本仓库的 GitHub Issues 中，所有操作通过 `gh` CLI 完成。详见 `docs/agents/issue-tracker.md`。

### 分诊标签

五个规范分诊角色沿用默认标签字符串（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）。详见 `docs/agents/triage-labels.md`。

### 领域文档

单上下文（single-context）：仓库根目录共用一份 `GLOSSARY.md`，架构决策放在 `docs/adr/`。详见 `docs/agents/domain.md`。

### README 双语

`README.md` 是默认中文版，`README.en.md` 是英文版，两版小节顺序一一对应；顶部用 `<kbd>` 标当前语言、另一个做成链接。配图同样分两套，四张都有英文版：中文用 `assets/readme/*.svg`，英文用 `assets/readme/*.en.svg`（hero、仪表盘、运行机制、结构树）；改内容时两版同步更新，仪表盘示意图的英文版按英文文案重排过胶囊与表头宽度。

### 工作树

当需要创建Worktree时，在项目根目录下的.agents\worktrees创建
