# ChronoScope

ChronoScope 是一个同时包含 Host 与 Client 两半的 DSH bundle，用来记录和展示 DSH 的在线时长、活跃时长与任务时长。

- 在线：DSH 进程从启动到退出之间的墙钟时间。
- 活跃：页面可见、窗口聚焦，且在空闲阈值内有操作，或前台会话正在运行任务的时间。
- 任务：一次任务从 `turn/start` 到 `turn/end` 的墙钟时间，并拆分为模型请求、工具执行、等待用户和其他四部分。

数据只保存在本机 DSH 的存储域中，不上传。

## 功能概览

- 侧边栏常驻入口，实时显示今日活跃时长。
- 日/周/月仪表盘：周期概览、任务构成、工作区任务排行、活跃/任务双系列趋势。
- 工作区 → 会话明细：活跃时长、任务时长、最近活动、当前计时状态，可展开查看会话。
- 设置：空闲阈值（1–15 分钟）、周起始（周一/周日）、是否显示子代理明细。
- 导出 JSON / CSV，以及二次确认后清空全部统计。
- Agent 只读工具 `chrono_stats`：可在对话中按日/周/月或自定义日期查询，结果与仪表盘共用同一份 Host 统计。
- 首次启用自动回填已有历史会话的任务时长；回填只补任务，不伪造在线/活跃历史。

## 安装

### 前置条件

- DSH Desktop 或带 Web profile 的 DSH 环境。
- 本仓库使用 Node.js 24.16.0 开发和测试；插件运行时没有第三方依赖，也没有构建步骤。

### 推荐安装方式：通过 DSH Plugin Manager 安装本地 bundle

1. 将本仓库放在一个固定的本地路径。下文用 `<仓库本地路径>` 指代它，例如 Windows 上的 `C:\path\to\chrono-scope`。

2. 在当前 DSH profile 的会话中，让 Agent 调用 `plugin_manager`，把 `target` 换成你自己的路径：

   ```text
   action: install_bundle
   target: <仓库本地路径>
   ```

   也可以直接对 Agent 说：

   > 用 plugin_manager 把 `<仓库本地路径>` 安装为当前 profile 的 bundle。

3. 读取 `plugin_manager` 的返回值：
   - `application: applied`：插件已激活，可以直接使用。
   - `restart-required` 或提示需要重启：重启 DSH 后再打开页面。
   - 如果返回 `failed`，保留错误信息继续排查，不要手动改写 profile 的 `package.json` 或 `cordis.patch.yml`。

4. 验证安装：
   - 左侧栏出现 **ChronoScope** 入口，并显示今日活跃时长。
   - 设置页出现 **ChronoScope** 分区。
   - 对 Agent 说“用 chrono_stats 查一下今天的时长”，应能返回统计结果。
   - 用 `plugin_manager` 的 `list_bundles` 能看到 `@local/chrono-scope`，`list_plugins` 能看到 `chrono-scope` 行处于启用状态。

> 本地目录安装会以 `link:` 方式接入当前 profile。修改插件源码后，通常需要重启 DSH 或重新加载插件以加载新的 JavaScript 模块。

### 安装后核对

安装成功后，当前 profile 里应能看到：

- bundle：`@local/chrono-scope`
- 来源：`link:<仓库本地路径>`
- 插件行：`chrono-scope`

用 `plugin_manager` 的 `list_bundles` / `list_plugins` 可以核对 bundle 与插件行是否处于启用状态。如果只是修改了本仓库源码，不需要重新安装；重启 DSH 后验证页面即可。

## 目录结构

```text
chrono-scope/
├─ package.json                  # npm 包与 DSH bundle 清单
├─ cordis.patch.yml              # bundle 的 Loader patch：插入 chrono-scope 行
├─ index.js                      # Host 入口：存储域、心跳、会话事件、RPC、工具
├─ client.js                     # Client 入口：侧边栏、页面、presence、设置页
├─ icon.svg                      # 插件图标
├─ DESIGN.md                     # 页面设计规范
├─ GLOSSARY.md                   # 领域术语
├─ locale/
│  ├─ zh.json                    # 中文展示元数据
│  └─ en.json                    # 英文展示元数据
├─ src/
│  ├─ domain/                    # 领域层：不依赖 DSH 运行时，可用假时钟测试
│  │  ├─ domain-spec.js          # storageDomain 的 chrono_scope v1 结构
│  │  ├─ chrono-scope-domain.js  # 在线/活跃/任务记录与查询的核心服务
│  │  ├─ periods.js              # 本地日/周/月边界与趋势桶
│  │  ├─ settings.js             # 设置默认值与归一化
│  │  ├─ export.js               # JSON/CSV 序列化
│  │  └─ backfill.js             # 历史会话回填规划
│  └─ host/                      # Host 适配层
│     ├─ rpc.js                  # /api/chrono-scope 包内私有 RPC
│     └─ tool.js                 # chrono_stats Agent 工具
├─ test/                         # Node 内置 test runner 测试
│  ├─ domain.test.js
│  ├─ dashboard.test.js
│  ├─ backfill.test.js
│  ├─ backfill-rpc.test.js
│  ├─ client-composition.test.js
│  ├─ restart-recovery.test.js
│  ├─ settings-export-clear.test.js
│  └─ chrono-stats-tool.test.js
├─ docs/adr/                     # 架构决策记录
└─ .scratch/                     # 历史票证存档，不随插件发布
```

## 关键文件说明

| 文件 | 作用 |
| --- | --- |
| `package.json` | 声明包名、版本、`exports`、发布文件列表；`dsh.bundle.patch` 指向 `cordis.patch.yml`，`dsh.client` 声明 Web 客户端加载方式。 |
| `cordis.patch.yml` | 只做一件事：向 Loader 插入 id 为 `chrono-scope` 的插件行，模块名 `@local/chrono-scope`。 |
| `index.js` | Host 半入口。打开 `ctx.storageDomain` 的 `chrono_scope` v1 域，启动领域服务，注册 30 秒心跳、`session/event` 监听、包内 RPC 和 `chrono_stats` 工具。 |
| `client.js` | Client 半入口。在 `sidebar.panellist` 注册入口，在 `shell.overlay` 挂载 15 秒 presence 心跳，在 `main` 注册仪表盘，在 `settings.section` 注册设置页。 |
| `src/domain/chrono-scope-domain.js` | 全部业务规则的核心：在线/活跃/任务区间、任务四段构成、归属、并集/求和、查询与数据操作。 |
| `src/domain/domain-spec.js` | 存储域声明：`chrono_scope` v1，`intervals`、`tasks` 两张表，以及设置/回填进度所在的 `meta`。 |
| `src/domain/periods.js` | 按 Host 本地时区构造日/周/月边界与趋势桶，处理跨午夜、跨周、跨月。 |
| `src/domain/settings.js` | 设置默认值和归一化：空闲阈值 1–15 分钟、周起始、显示子代理。 |
| `src/domain/export.js` | JSON/CSV 文本生成和文件名/MIME 类型，不负责统计。 |
| `src/domain/backfill.js` | 把已持久化会话的事件流规划成回填任务；跳过 fork 继承前缀；归一化回填状态、完成事件代次与通知记录。 |
| `src/host/rpc.js` | Client 与 Host 的私有通道：`presence`、`queryStats`、`getSettings`、`setSettings`、`exportData`、`clearData`、`getBackfillStatus`、`markBackfillRead`、`retryBackfill`。 |
| `src/host/tool.js` | 注册只读工具 `chrono_stats`，把参数转为 `queryStats` 查询，不另算一套数字。 |
| `locale/zh.json`、`locale/en.json` | 插件管理器和设置页读取的标题与描述。 |
| `icon.svg` | 插件图标。 |
| `DESIGN.md` | 页面视觉与交互规范。 |
| `GLOSSARY.md` | 在线、活跃、任务、实际占用、累计工时等领域术语。 |
| `docs/adr/` | 记录录制架构、周期裁剪与并发、历史回填、Agent 工具等架构决策。 |
| `test/` | 领域、仪表盘、回填、重启恢复、设置/导出/清空、客户端组合和工具测试。 |
| `.scratch/` | 改用 GitHub Issues 之前留下的本地规格、实施票与验收证据存档；不进入 npm 包，也不是运行时文件。 |

## 运行时结构

```text
DSH Host
  ├─ ctx.storageDomain.open(chrono_scope v1)
  ├─ 30 秒在线心跳
  ├─ session/event → 任务区间与构成
  ├─ /api/chrono-scope 私有 RPC
  └─ chrono_stats 工具
        ↑
        │ 查询 / presence / 设置 / 导出 / 清空
        ↓
DSH Web Client
  ├─ shell.overlay：15 秒 presence 心跳
  ├─ sidebar.panellist：今日活跃入口
  ├─ main / chrono-scope：仪表盘
  └─ settings.section：ChronoScope 设置
```

Client 只负责渲染和上报事实；周期边界、活跃判定、统计口径、设置归一化与导出内容都由 Host 领域服务计算。数据统一保存在 `ctx.storageDomain` 的 `chrono_scope` 域中，页面刷新后会重新从 Host 读取。

## 开发与测试

```bash
npm test
npm run check
```

`npm test` 使用 Node 内置的 `node:test`，不依赖外部测试框架。测试覆盖领域统计、日/周/月裁剪、并发并集/求和、历史回填、重启恢复、设置/导出/清空、客户端渲染组合和 `chrono_stats` 工具。

## 相关文档

- [DESIGN.md](DESIGN.md)：页面设计规范。
- [GLOSSARY.md](GLOSSARY.md)：领域术语。
- [docs/adr/0001-usage-recording-architecture.md](docs/adr/0001-usage-recording-architecture.md)：在线/活跃/任务录制架构。
- [docs/adr/0002-dashboard-period-clipping-and-concurrency.md](docs/adr/0002-dashboard-period-clipping-and-concurrency.md)：周期裁剪与并发口径。
- [docs/adr/0003-historical-backfill.md](docs/adr/0003-historical-backfill.md)：历史任务回填。
- [docs/adr/0004-agent-stats-tool.md](docs/adr/0004-agent-stats-tool.md)：`chrono_stats` Agent 工具。
