# 0010 包名改为 @qwayo/dsh-timespan

状态：已接受（2026-11-09）

## 背景

仓库准备从私有转为公开，并按计划发布到 npm。原来的包名 `@local/dsh-timespan` 带着两个问题：

- `@local` 不是本项目的 npm scope，这个包名**发不出去**；
- 公开仓库里挂着一个 `@local/` 前缀，读起来像"仅供本机使用"，与对外发布的意图矛盾。

查过 npm：`dsh-timespan`、`dsh-timespan-plugin`、`dsh-plugin-timespan` 都未被占用，`@qwayo/*` 也可用。

## 决策

1. 包名统一为 `@qwayo/dsh-timespan`。选带 scope 的版本，是为了和仓库 `qwayo/dsh-timespan` 视觉一致，并且 scope 不会被他人抢注。
2. 身份字符串仍然成套修改，规则与 ADR-0007 相同：`package.json` 的 `name`、`cordis.patch.yml` 的 `name`、`client.js` 的模块 id 三处必须同时改；README 与 `assets/readme/structure*.svg` 里出现的包名一并跟上。
3. 先保持 `"private": true`。包名已经就位，但在正式发布之前仍然禁止 npm publish，作为误发布的保险。首次发布时改为 `"private": false`（2026-11-09 执行）。
4. 存储域继续保留 `chrono_scope`，不随包名变化——里面是用户的真实统计与设置，`storageDomain` 没有 rename/migrate。

## 后果

- 已经以 `@local/dsh-timespan`（`link:` 或 git spec）装过的 profile，**必须先移除旧包再按新名安装**，否则模块 id 与依赖名不匹配，Client 半加载失败或出现双入口。
- 历史统计与设置不受影响：存储域没变，备份格式没变。
- `tools/ci-audit.mjs` 的「身份字符串三处一致」会拦住任何只改了一半的改名——这条规则正是为 ADR-0007 与本次改名写的。
