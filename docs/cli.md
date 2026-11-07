# CLI 参考

> 目标读者：需要查命令、参数、默认值、退出码的用户。命令与参数口径取自 `toolkit --help` 与各子命令 `--help`（两者冲突时以 `--help` 为准）。

本篇是命令总览与全局约定；每个域的完整参数、边界行为与示例见对应分页。

## 命令总览

| 命令 | 用途 | 常用子命令 | 分页 |
| --- | --- | --- | --- |
| `toolkit init` | 初始化任务区：目录骨架、规范载体、技能入口壳、忽略片段 | — | [init](./cli/init) |
| `toolkit tasks` | 任务管理：总览、归档、校验、归一、统计、导入导出 | `archive` / `check` / `normalize` / `stats` / `export` / `import` | [tasks](./cli/tasks) |
| `toolkit conventions` | 规范载体：结构升级、表格归一、只读体检 | `upgrade` / `status` / `format` | [conventions](./cli/conventions) |
| `toolkit changelog` | 多语言 CHANGELOG（封装 changesets） | `version` / `format` / `doc` / `audit` | [changelog](./cli/changelog) |
| `toolkit skills` | AI 技能分发：安装、状态、卸载、来源与版本 | `install` / `status` / `uninstall` / `sources` / `bump` | [skills](./cli/skills) |
| `toolkit usage` | 技能使用情况：开关、统计、导出与诊断（默认关闭） | `info` / `stats` / `export` / `doctor` | [usage](./cli/usage) |
| `toolkit rules` | 全局规则：列出模块、组合输出与缓存管理 | `list` / `compose` / `reset` | [rules](./cli/rules) |
| `toolkit config` | 配置分层只读体检 | `status` | [config](./cli/config) |
| `toolkit docs` | 文档站主题校验与写入 | `theme` | [docs theme](./cli/docs-theme) |
| `toolkit help` | 显示帮助 | — | — |

## 按场景找命令

| 你在做什么 | 用什么 |
| --- | --- |
| 新项目接入 | `toolkit init` → `toolkit skills install` → `toolkit config status` |
| 日常任务 | `toolkit tasks` 看板 → `toolkit tasks check` 校验 → `toolkit tasks archive` 归档 |
| 新会话恢复 | `toolkit tasks --view all` + `toolkit conventions status` |
| 发版 | `toolkit changelog version` → `pnpm verify` → 打标签发布 |
| 技能升级 / 换装 | `toolkit skills status` → `toolkit skills install`（外部来源见 `skills sources`） |
| 看技能用了多少次 | `toolkit usage stats`（`--by session` / `--by trigger` / `--limit`） |
| 复制全局规则 | `toolkit rules compose`（按需 `--preset` / `--module`，`--copy` 直接进剪贴板） |
| 规范沉淀 | `toolkit conventions status` → `toolkit conventions upgrade` / `format` |
| 排查配置 | `toolkit config status`（不打印配置值） |
| 文档站主题漂移 | `toolkit docs theme check` |

## 全局约定

**调用方式**：下文示例统一用 `toolkit <command>` 直调（已全局安装）或 `pnpm exec toolkit <command>`（项目 devDependency，npm 用户 `npx toolkit`）；不安装临时执行用 `pnpm dlx @fxri/toolkit <command>`。

顶层命令支持的开关（`-h` 全局与子命令均可用）：

| 参数 | 说明 |
| --- | --- |
| `-h, --help` | 显示帮助（全局或子命令） |
| `-v, --version` | 显示版本号 |

`--redact` / `--warn` 为**域级开关**：仅 `tasks` 与 `changelog` 两个域支持（`init` / `skills` / `conventions` / `config` / `docs` / `usage` / `rules` 域不提供），清单见各域的选项表。

**批量参数**：目标集合是命令主语时省略参数即全部（如 `skills sources refresh`）；否则须显式 `--all`（如 `usage purge --all`、`skills install --all`、`skills bump --all`）。

开关为**双向三档**，优先级从高到低：CLI 参数 > 环境变量 > 配置文件 > 默认开启。对应环境变量：`FX_REDACT`、`FX_CHECK_WARN`（认 `0/1`、`true/false`、`on/off`、`yes/no`）；配置项见[配置参考](./config)。

另有一个独立环境变量 `FX_NO_UPDATE_CHECK`：设为真值时关闭升级检查提示（1.7.0 起支持，行为详见[配置参考 · updateCheck](./config)）。

**升级提示收口**：命令成功（退出码 0）时，按 `updateCheck.notify`（默认 `always`）在输出结尾给出一句话提示；TTY 下走 stderr，非 TTY 走 stdout。技能提示会给出「当前 → 最新」；版本比较按数字段补零、预发布低于同号正式版、忽略构建元数据，任一侧无法解析为版本时静默不提示。已尝试修复（执行过 `skills install`）的同一版本不再重复提示，来源版本变化或 CLI 升级后自动恢复；`skills status` 会展示上次检查时间与下次可提示时间。`--help`、`help` 子命令、裸 `toolkit`、`skills path`、`skills status`、`changelog` 透传子命令与 `--format json` 不输出文本提示；`--version`、`--check`、`--export` 的提示只走 stderr。脚本需要稳定输出时请用 `--format json` 或设 `FX_NO_UPDATE_CHECK=1`。

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功（含 check 通过、归档跳过等正常路径） |
| `1` | 操作失败或校验存在 error 级问题（check 有 error、参数冲突、非法子命令、文件/目录异常等） |

软告警（warn 级）不影响退出码。解析错误的提示格式与 `changelog` 透传差异见[退出码与解析错误](./cli/exit-codes)。

**诊断类命令语义**：`status` / `info` 只汇总现状，退出码恒 0；`doctor` 输出问题与修复建议，退出码恒 0；`check`（`tasks check`、`docs theme check`）发现问题时退出 1，可直接作为门禁步骤。

## 相关页面

- 参考：[配置参考](./config) · [API 参考](./api) · [退出码](./cli/exit-codes)
