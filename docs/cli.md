# CLI 参考

> 目标读者：需要查命令、参数、默认值、退出码的用户。命令与参数口径取自 `toolkit --help` 与各子命令 `--help`（两者冲突时以 `--help` 为准）。

本篇是命令总览与全局约定；每个域的完整参数、边界行为与示例见对应分页。

## 命令总览

| 命令 | 用途 | 常用子命令 | 分页 |
| --- | --- | --- | --- |
| `toolkit status` | 整体状态：只读聚合任务区 / 技能现场 / 配置层 / 文档站 / 版本与弃用项 | — | [整体状态](./cli/status) |
| `toolkit init` | 初始化任务区：目录骨架、规范载体、技能入口壳、忽略片段 | — | [项目初始化](./cli/init) |
| `toolkit task` | 任务管理：总览、建档、更新、归档、校验、归一、统计、导入导出 | `add` / `update` / `archive` / `check` / `normalize` / `stats` / `export` / `import` | [任务管理](./cli/tasks) |
| `toolkit convention` | 规范载体：结构升级、表格与索引单元格归一、只读体检 | `upgrade` / `status` / `format` | [规范载体](./cli/conventions) |
| `toolkit release` | 多语言 CHANGELOG 与发版（封装 changesets，默认 `status`） | `status` / `bump` / `changelog` / `mirror` / `publish` / `audit` / `changeset` | [发版与更新日志](./cli/changelog) |
| `toolkit skill` | AI 技能分发：安装、分发计划、状态、卸载、来源与版本 | `install` / `plan` / `status` / `uninstall` / `source` / `bump` / `lint` | [技能分发](./cli/skills) |
| `toolkit usage` | 技能使用情况：开关、统计、导出与诊断（默认关闭） | `show` / `data` / `config` / `setup` / `record` | [技能使用情况](./cli/usage) |
| `toolkit rule` | 全局规则：列出模块、组合输出、锚点校验与缓存管理 | `list` / `compose` / `reset` / `check` | [全局规则](./cli/rules) |
| `toolkit scope` | 作用域：按项目 / 目录判定技能与规则是否生效（默认全域生效） | `status` / `list` / `policy` / `skills` / `wizard` / `guard`（`list` 组含 add / exclude / remove / default / reset，详见 scope 页） | [作用域](./cli/scope) |
| `toolkit config` | 配置唯一写入口（键清单 + 分层写入）与只读体检 | `list` / `get` / `set` / `unset` / `status` | [配置体检](./cli/config) |
| `toolkit docs` | 文档站全量校验（默认）、主题写入与分项校验 | `check` / `theme` / `nav` / `dist` | [文档站主题](./cli/docs-theme) · [文档站校验](./cli/docs-check) |
| `toolkit help` | 显示帮助 | — | — |

## 按场景找命令

| 你在做什么 | 用什么 |
| --- | --- |
| 新项目接入 | `toolkit init` → `toolkit skill install` → `toolkit config status` |
| 整体自查 | `toolkit status` 一次看全貌（`--check` 有 error 时退出 1；`--format json` 供脚本） |
| 日常任务 | `toolkit task` 看板 → `toolkit task check` 校验 → `toolkit task archive` 归档 |
| 新会话恢复 | `toolkit status`（或 `toolkit task --view all` + `toolkit convention status`） |
| 发版 | `toolkit release bump` → `pnpm verify` → 打标签发布 |
| 技能升级 / 换装 | `toolkit skill status` → `toolkit skill install`（外部来源见 `skills source`） |
| 看分发形态会怎么落 | `toolkit skill plan`（只读预览；`install --dry-run` 同义） |
| 看技能用了多少次 | `toolkit usage show stats`（`--by session` / `--by trigger` / `--limit`） |
| 复制全局规则 | `toolkit rule compose`（按需 `--preset` / `--module`，`--copy` 直接进剪贴板） |
| 规范沉淀 | `toolkit convention status` → `toolkit convention upgrade` / `format` |
| 排查配置 | `toolkit config status`（不打印配置值）→ `toolkit config get <key> --explain`（看来源层与覆盖链） |
| 改配置 | `toolkit config set <key> <value>`（`--layer` 选层；非交互加 `--yes`），删除用 `config unset` |
| 文档站主题漂移 | `toolkit docs theme check` |
| 文档站导航或产物不合规 | `toolkit docs nav check` / `toolkit docs dist check` |

## 裸命令入口

| 域 | 裸命令（TTY） | 非 TTY | 显式向导入口 | 机器可读 |
| --- | --- | --- | --- | --- |
| `toolkit task` | 打印任务总览（默认视图） | 同左，退出 0 | 无 | `--format json` / `export` |
| `toolkit skill` | 打印本域帮助 | 同左，退出 0 | 无（`mount` 等子命令参数化） | 各子命令 `--format json` |
| `toolkit rule` | 打印本域帮助 | 同左，退出 0 | 无 | `list` / `compose --format json` |
| `toolkit config` | 打印本域帮助 | 同左，退出 0 | 无 | `list` / `get` / `status --format json` |
| `toolkit convention` | 打印本域帮助 | 同左，退出 0 | 无 | `status` / `format` / `upgrade --format json` |
| `toolkit docs` | 打印本域帮助 | 同左，退出 0 | 无 | `nav` / `dist --format json` |
| `toolkit scope` | 状态优先向导 | 输出状态摘要与子命令提示，退出 0 | `scope wizard`（需要交互但无终端时退出 2） | `status` / `list --format json` |
| `toolkit usage` | 交互向导 | 输出 `show` 摘要与子命令提示，退出 0 | `usage setup wizard`（需要交互但无终端时退出 2） | `show` / `show stats` / `data doctor` 等 `--format json` |
| `toolkit release` | 默认 `status` 只读概览 | 同左，退出 0 | 无 | `status` / `changeset list` 等 `--format json` |

规则：查询型域给默认视图，配置 / 分发型域给帮助，向导型域给摘要 + `wizard` 入口提示；
裸命令在非 TTY 一律退出 `0`，显式 `wizard` 子命令需要交互时退出 `2`。

## 术语表

| 术语 | 含义 | 出现位置 |
| --- | --- | --- |
| 层 | 配置文件层级：global 全局 / project 项目 / local 本地 | `--layer`（scope 写命令；`source notify` 的 `--layer` 是它的别名） |
| 面 | 技能安装面：全局面 global / 项目面 project | `skills install --scope`、`skills status` / `uninstall` |
| 名单 | 作用域白名单（include）与黑名单（exclude） | `scope` 菜单与写命令、`scope list` |
| 策略 | 作用域规则条目：条件 + 技能维度 + allow / deny；按层与具体度取唯一命中 | `scope policy`、`scope status --skills` |
| 档案 | 可复用的技能名单，供策略 `skills.profiles` 引用 | `scope skills profile`、`skillProfiles` 配置段 |
| 预演 | `--dry-run`：只打印将执行的动作，不写文件 / 剪贴板 / 缓存 | 全部写命令 |
| 确认 | 写前展示预览并交互确认；`--yes` 跳过确认 | `scope` / `usage` / `skills` 写命令 |
| 来源 | 技能来源：内置 `toolkit` 源与 `--source` 外部来源 | `skills`、`skills source` |
| 目标 | 技能安装目标：agent 全局目录 / 项目薄壳目录 | `skills install`、`skills status` |
| 范围 | 按上下文区分：作用域命中范围（scope）或技能统计范围（usage） | `scope` / `usage config scope` |

## 全局约定

**调用方式**：下文示例统一用 `toolkit <command>` 直调（已全局安装）或 `pnpm exec toolkit <command>`（项目 devDependency，npm 用户 `npx toolkit`）。

不安装临时执行用 `pnpm dlx @fxri/toolkit <command>`。

顶层命令支持的开关（`-h` 全局与子命令均可用）：

| 参数 | 说明 |
| --- | --- |
| `-h, --help` | 显示帮助（全局或子命令） |
| `-v, --version` | 显示版本号 |
| `--no-color` | 关闭终端颜色输出（优先于 `NO_COLOR` / `FORCE_COLOR`，可写在任意位置） |
| `--cwd <path>` | 在指定目录执行命令（等价先切换工作目录；非法路径按 `1` 退出，不回落当前目录） |

`--redact` / `--warn` 为**域级开关**：仅 `tasks` 与 `changelog` 两个域支持。

`init` / `skills` / `conventions` / `config` / `docs` / `usage` / `rules` 域不提供，清单见各域的选项表。

**批量参数**：目标集合是命令主语时省略参数即全部（如 `skills source refresh`）。

否则须显式 `--all`（如 `usage data purge --all`、`skills install --all`、`skills bump --all`）。

开关为**双向三档**，优先级从高到低：CLI 参数 > 环境变量 > 配置文件 > 默认开启。

对应环境变量：`FX_TOOLKIT_REDACT`、`FX_TOOLKIT_CHECK_WARN`（认 `0/1`、`true/false`、`on/off`、`yes/no`）；配置项见[配置参考](./config)。

本工具自身的环境变量只认 `FX_TOOLKIT_` 前缀。旧名（如 `FX_REDACT`、`TOOLKIT_USAGE_DIR`）不再读取：
命中时只在 stderr 提示一次，取值按新名或默认值处理。

另有独立环境变量 `FX_TOOLKIT_NO_UPDATE_CHECK`：设为真值时关闭升级检查提示。

升级检查自 1.7.0 引入；变量名随前缀统一为 `FX_TOOLKIT_`，行为详见[配置参考 · 升级检查](./config)。

**升级提示收口**：命令成功（退出码 0）时，按 `updateCheck.notify`（默认 `always`）在输出结尾给出一句话提示；TTY 下走 stderr，非 TTY 走 stdout。

已尝试修复（执行过 `skills install`）的同一版本不再重复提示。哪些子命令不输出、版本比较口径、关闭方式见[配置参考 · 升级检查](./config/update)。

## 输出约定

颜色**仅在交互终端启用**：输出被重定向到文件或管道、`TERM=dumb`、
旧版 Windows 控制台（无 Windows Terminal / VS Code 终端标记）时自动关闭。
`NO_COLOR` 非空或 `--no-color` 可关闭，`FORCE_COLOR` 非 `0` 可强制开启。

成功结论（`✔`）绿色、告警（`⚠️`）黄色、失败（`✖`）红色、次要说明与操作指引（`·`）暗色，
`[预演]` 标记青色，路径与命令名等强调文本青色。关闭颜色时符号保留、文案不变。

机器可读输出不着色：`--format json`、`--out` 写入文件、`scope guard` 技能正文等数据通道恒为纯文本。

报告类 `--format json` 统一为信封 `{ schemaVersion, command, ok, data, issues }`：`command` 为实际命令路径，
`ok` 为报告结论（check 类按是否存在 error，只有告警时仍为 `true`），`data` 承载域载荷，
`issues` 汇总问题（`level` / `scope` / `message`）。数据流输出不套信封：`usage data export`、`task export <path>`
与 `release changeset` 透传保持原格式；业务错误仍写 stderr 并保留原退出码，不在 stdout 输出半截 JSON。

文本表格、报告数据行与规则正文同样不着色，便于复制与日志比对；交互菜单由组件库自行渲染，不在本约定内。

## 交互约定

交互提示统一走同一套基座（`rules` / `scope` / `usage` / `skills` 已接入，其余域按同一口径演进）：

- 有上级步骤时按 ESC 返回上一级；顶层按 ESC 或 Ctrl+C 取消整个命令（退出码 `130`）。
- 写操作先展示预览再确认；`--yes` 跳过确认，`--dry-run` 只预览、不写文件 / 剪贴板 / 缓存。
- 非法取值统一在 stderr 报错并以 `1` 退出；`--format` 只接受 `json`，不再回落文本。

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功（含 check 通过、归档跳过、裸命令输出摘要等正常路径） |
| `1` | 操作失败或校验存在 error 级问题（check 有 error、参数冲突、非法子命令、文件/目录异常等） |
| `2` | 需要交互但当前环境不支持（`scope wizard` / `usage setup wizard` 及 `usage setup init` / `usage setup uninstall` / `usage config upload setup` / `usage setup hooks` 写命令等；stderr 给出非交互替代） |
| `3` | `scope guard <技能名>` 判定当前目录未激活（stdout 为空，原因写 stderr） |
| `130` | 用户在交互提示中按 Ctrl+C 中断（不写任何文件） |

软告警（warn 级）不影响退出码。解析错误的提示格式与 `changelog` 透传差异见[退出码与解析错误](./cli/exit-codes)。

**诊断类命令语义**：

- `status` / `usage show` 只汇总现状，退出码恒 0；`toolkit status --check` 例外——存在 error 级问题时退出 1
- `usage data doctor` 输出问题与修复建议，退出码恒 0
- `check`（`tasks check`、`docs theme check`、`docs nav check`、`docs dist check`）发现问题时退出 1，可直接作为门禁步骤

## 相关页面

- 参考：[配置参考](./config) · [API 参考](./api) · [退出码](./cli/exit-codes)
