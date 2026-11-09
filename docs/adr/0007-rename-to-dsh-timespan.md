# 0007 项目改名为 dsh-timespan

状态：已接受（2026-11-09）

## 背景

项目原名 `chrono-scope`，仓库、npm 包、bundle 行、Client 模块 id、RPC 通道与 Agent 工具都使用这个名字。改名要同时处理三类东西：

- 对外身份：仓库、包名、bundle/插件 id、页面品牌、文档与 README 素材；
- 运行契约：Client 模块 id 必须与 `package.json` 的 name 一致，RPC 通道必须 Host/Client 成对；
- 持久化契约：存储域、备份格式与浏览器偏好一旦落盘，就不能靠改字符串完成迁移。

## 决策

1. 对外统一使用 `dsh-timespan`：仓库 `qwayo/dsh-timespan`、包名 `@local/dsh-timespan`、bundle 行 `dsh-timespan`、Client 模块 id `@local/dsh-timespan`、RPC 通道 `dsh-timespan` 与路径 `/api/dsh-timespan`。
2. Agent 工具改名为 `timespan_stats`；不长期保留 `chrono_stats` 双注册，避免每步都多一份工具 schema。
3. 存储域永久保留 `chrono_scope`。storageDomain 没有 rename/migrate，目录 `~/.dsh/storages/chrono_scope` 里已有真实数据；改名会新建空域，让旧统计与设置失联。
4. JSON 导出改用 `dsh-timespan-export`；导入同时接受旧版 `chronoscope-export`，历史备份仍可恢复。
5. 浏览器偏好键改用 `dsh-timespan.*`；这是一次性的界面偏好重置，不影响统计与设置数据。
6. 已有 profile 必须先移除旧的 `@local/chrono-scope`，再安装新包；否则旧模块 id 与包名不匹配，Client 半会加载失败，或出现双入口/工具重名。

## 后果

- 升级用户需要重新安装一次 bundle；存储域不变，历史数据继续可读。
- 旧备份文件仍可导入；新导出的文件不能再被旧版本识别。
- 旧工具名 `chrono_stats` 不再注册；README 与提示词统一改用 `timespan_stats`。
- `.scratch/` 与 `.agents/` 中的历史票和截图保留旧名，作为当时的记录。
