# CLI 参考

> 目标读者：需要查命令、参数、默认值、退出码的用户。命令与参数口径取自 `toolkit --help` 与各子命令 `--help`（两者冲突时以 `--help` 为准）。

本篇是命令总览与全局约定；每个域的完整参数、边界行为与示例见对应分页。

## 命令总览

| 命令 | 用途 | 常用子命令 | 分页 |
| --- | --- | --- | --- |
| `toolkit setup` | 本机接入向导：安装 AI 技能、配置全局规则、设置生效范围（不初始化任务区） | — | [本机接入](./cli/setup) |
| `toolkit task` | 任务管理：初始化、总览、建档、更新、归档、校验、归一、统计、导入导出 | `init` / `add` / `update` / `archive` / `check` / `normalize` / `stats` / `export` / `import` | [任务管理](./cli/task) |
| `toolkit status` | 整体状态：只读聚合任务区 / 技能现场 / 配置层 / 文档站 / 版本与弃用项 | — | [整体状态](./cli/status) |
| `toolkit rule` | 全局规则：列出模块、组合输出、锚点校验与缓存管理 | `list` / `compose` / `reset` / `check` | [全局规则](./cli/rule) |
| `toolkit scope` | 作用域：按项目 / 目录判定技能是否生效（默认全域生效） | `status` / `allow` / `deny` / `remove` / `default` / `reset` / `profile` / `guard`（裸命令进交互，详见 scope 页） | [作用域](./cli/scope) |
| `toolkit skill` | AI 技能分发：安装、分发预览、状态、卸载、来源与版本 | `install` / `status` / `uninstall` / `source` / `bump` / `lint` | [技能分发](./cli/skill) · [技能校验](./cli/skill-lint) · [技能版本](./cli/skill-bump) · [技能来源](./cli/skill-sources) |
| `toolkit usage` | 技能使用情况：开关、统计、导出与诊断（默认关闭） | `show` / `data` / `config` / `setup` / `record` | [技能使用情况](./cli/usage) |
| `toolkit convention` | 规范载体：结构升级、表格与索引单元格归一、只读体检 | `upgrade` / `status` / `format` | [规范载体](./cli/convention) |
| `toolkit release` | 多语言 CHANGELOG 与发版（封装 changesets，默认 `status`） | `status` / `bump` / `changelog` / `mirror` / `publish` / `audit` / `changeset` | [发版与更新日志](./cli/release) |
| `toolkit upgrade` | v1 工程一键迁移：配置段名、工程脚本、技能旧名、规范载体，含预演、复检与恢复 | — | [升级迁移](./cli/upgrade) |
| `toolkit config` | 配置唯一写入口（键清单 + 分层写入）与只读体检 | `list` / `get` / `set` / `unset` / `status` | [配置体检](./cli/config) |
| `toolkit privacy` | 隐私体检：本机绝对路径扫描与归一（按项目档位） | `scan` | [隐私体检](./cli/privacy) |
| `toolkit docs` | 文档站全量校验（默认）、主题写入与分项校验 | `check` / `theme` / `nav` / `dist` | [文档站主题](./cli/docs-theme) · [文档站校验](./cli/docs-check) |
| `toolkit help` | 显示帮助 | — | — |

## 按场景找命令

| 你在做什么 | 用什么 |
| --- | --- |
| 新项目接入 | `toolkit setup` → `toolkit config status`（任务区由技能在项目内调 `toolkit task init`） |
| 日常任务 | `toolkit task` 看板 → `toolkit task check` 校验 → `toolkit task archive` 归档 |
| 整体自查 | `toolkit status` 一次看全貌（`--check` 有 error 时退出 1；`--format json` 供脚本） |
| 新会话恢复 | `toolkit status`（或 `toolkit task --view all` + `toolkit convention status`） |
| 技能升级 / 换装 | `toolkit skill status` → `toolkit skill install`（外部来源见 `skill source`） |
| 看分发形态会怎么落 | `toolkit skill install --dry-run`（只读预览，不写文件） |
| 复制全局规则 | `toolkit rule compose`（按需 `--preset` / `--module`，`--copy` 直接进剪贴板） |
| 规范沉淀 | `toolkit convention status` → `toolkit convention upgrade` / `format` |
| 排查配置 | `toolkit config status`（不打印配置值）→ `toolkit config get <key> --explain`（看来源层与覆盖链） |
| 改配置 | `toolkit config set <key> <value>`（`--layer` 选层；非交互加 `--yes`），删除用 `config unset` |
| 从 1.x 升级 | `toolkit status` 出现迁移提示 → `toolkit upgrade --dry-run` 看清单 → `toolkit upgrade` 执行 → 复检残留 |
| 发版 | `toolkit release bump` → `pnpm verify` → 打标签发布 |
| 看技能用了多少次 | `toolkit usage show stats`（`--by session` / `--by trigger` / `--limit`） |
| 文档站主题漂移 | `toolkit docs theme check` |
| 文档站导航或产物不合规 | `toolkit docs nav check` / `toolkit docs dist check` |

## 裸命令入口

| 域 | 裸命令（TTY） | 非 TTY | 强制交互 | 机器可读 |
| --- | --- | --- | --- | --- |
| `toolkit setup` | 本机接入向导 | 提示改用 `--yes`，按无交互退出码结束 | 无 | 无 |
| `toolkit task` | 打印任务总览（默认视图） | 同左，退出 0 | 无 | `list` / `stats --format json`、`export` |
| `toolkit rule` | 打印本域帮助 | 同左，退出 0 | 无 | `list` / `compose --format json` |
| `toolkit scope` | 状态优先向导 | 输出状态摘要与子命令提示，退出 0 | `--interactive`（无终端时按无交互退出码结束，见[退出码](./cli/exit-codes)） | `status` / `list --format json` |
| `toolkit skill` | 打印本域帮助 | 同左，退出 0 | `skill mount` 需交互（非 TTY 退 2） | 多数子命令 `--format json`（`mount` 等除外） |
| `toolkit usage` | 交互菜单 | 输出 `show` 摘要与子命令提示，退出 0 | `usage setup --interactive`（无终端时按无交互退出码结束，见[退出码](./cli/exit-codes)） | `show` / `show stats` / `data doctor` 等 `--format json` |
| `toolkit convention` | 打印本域帮助 | 同左，退出 0 | 无 | `status` / `format` / `upgrade --format json` |
| `toolkit release` | 默认 `status` 只读概览 | 同左，退出 0 | 无 | `status` / `changeset list` 等 `--format json` |
| `toolkit config` | 打印本域帮助 | 同左，退出 0 | 无 | `list` / `get` / `status --format json` |
| `toolkit privacy` | 打印本域帮助 | 同左，退出 0 | 无 | `scan --format json` |
| `toolkit docs` | 默认全量校验（theme / nav / dist） | 同左 | 无 | `nav` / `dist --format json` |

规则：查询型域给默认视图，配置 / 分发型域给帮助，交互型域给摘要与子命令提示；
查询 / 分发型裸命令在非 TTY 退出 `0`；校验型裸命令（`toolkit docs`）按校验结论退出，存在 error 时为 `1`，
未检测到 `docs/` 目录时跳过并退出 `0`；
需要强制交互时用 `--interactive`（无终端时按无交互退出码结束）。

## 术语表

| 术语 | 含义 | 出现位置 |
| --- | --- | --- |
| 层 | 配置文件层级：global 全局 / project 项目 / local 本地 | `--layer`（scope 写命令；`source notify` 的 `--layer` 是它的别名） |
| 面 | 技能安装面：全局面 global / 项目面 project | `skill install --scope`、`skill status` / `uninstall` |
| 名单 | 作用域白名单（include）与黑名单（exclude） | `scope` 菜单与写命令、`scope status --lists` |
| 策略 | 作用域规则条目：条件 + 技能维度 + allow / deny；按层与具体度取唯一命中 | `scope allow` / `deny`（带条件选项时）、`scope status --policies` |
| 档案 | 可复用的技能名单，供策略 `skills.profiles` 引用 | `scope profile`、`skillProfiles` 配置段 |
| 预演 | `--dry-run`：只打印将执行的动作，不写文件 / 剪贴板 / 缓存 | 全部写命令 |
| 确认 | 写前展示预览并交互确认；`--yes` 跳过确认 | `usage` / `skill` / `config` 写命令；`scope` 写命令在非 TTY 带显式参数直接执行 |
| 来源 | 技能来源：内置 `toolkit` 源与 `--source` 外部来源 | `skill`、`skill source` |
| 目标 | 技能安装目标：agent 全局目录 / 项目薄壳目录 | `skill install`、`skill status` |
| 范围 | 按上下文区分：作用域命中范围（scope）或技能统计范围（usage） | `scope` / `usage config scope` |
| 名单模式 | 作用域的缺省判定：全部生效（all）/ 仅名单内生效（allowlist）/ 全部生效（denylist 兼容读取） | `scope status` / `status --lists` / `default` |
| 命中策略 | 当前目录最终命中的那条作用域策略；名单配置生成的规则显示中文名，新策略保留 `policy:<id>` | `scope status`、`scope status --policies` |
| 判定目录 | 判定所依据的目录：优先 git 根，其次含 `.tasks` 的根，都没有则当前目录 | `scope status` |
| 入口壳 | 内容闸门产物：只保留名称与描述，正文由 `scope guard` 按作用域下发 | `skill status`、`skillDelivery` |
| 项目面薄壳 | 项目面安装时指向真源的别名壳；历史文档中的「入口薄壳」「薄壳」均指它 | `skill install --scope project`、`task init` |
| 内容闸门 | 按目录控制技能正文是否可读的机制，不是产物名 | `scope guard`、`skillDelivery` |
| 全文安装 | 技能正文直接落盘，不经过内容闸门 | `skillDelivery.default=full` |
| 技能统计 | usage 域：采集通道、技能模式、轮转、更新提示频率 | `usage` |
| 错误级 | 文档中的「error 级」指 JSON `level: error`；文本输出显示为「错误」 | `status --check`、`task check` |

## 文案约定

- 文本层只给人读中文；`policy:<id>`、`allowlist`、`gated` 等机器键只进 `--format json` 与调试输出。
- 同一概念只用一个词：作用域里「策略」指 `policy`，「规则」只指全局 `rule`；入口壳是内容闸门产物，项目面薄壳是安装别名，二者不混用。
- 报告行写「对象 + 结论 + 依据 / 下一步」，不把裸问句或内部术语当标签。
- 枚举默认只写中文；用户需要手写配置时才写「中文（原值）」。
- 交互菜单标题写「选择…」，选项描述结果而不是实现；只有组件支持默认值时才标「（默认）」。
- 交互列表的辅助说明（技能简介、禁用原因）单行、暗色，按终端列数与前后缀宽度截断；提交后的答案行只显示选项名，不夹带辅助说明，超过 6 项折叠为「前 5 个 等 N 项」。
- 中文句子用全角标点，命令 / 键 / 路径用反引号，强调用「」；中英之间留一个空格。
- 结果与机器可读内容走 stdout，提示、告警与进度走 stderr。
- help 文案写「做什么 + 何时用」，取值列中文并在需要时括注原值，不写内部排序算法。
- 未知枚举值原样回退并告警，不静默吞掉。

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

`--redact` / `--warn` 为**域级开关**：仅 `task` 与 `release` 两个域支持。

`init` / `skill` / `convention` / `config` / `docs` / `usage` / `rule` 域不提供，清单见各域的选项表。

**批量参数**：目标集合是命令主语时省略参数即全部（如 `skill source refresh`）。

否则须显式 `--all`（如 `usage data purge --all`、`skill install --all`、`skill bump --all`）。

开关为**双向三档**，优先级从高到低：CLI 参数 > 环境变量 > 配置文件 > 默认开启。

对应环境变量：`FX_TOOLKIT_REDACT`、`FX_TOOLKIT_CHECK_WARN`（认 `0/1`、`true/false`、`on/off`、`yes/no`）；配置项见[配置参考](./config)。

<!-- toolkit:env-vars:start -->
本工具自身的环境变量只认 `FX_TOOLKIT_` 前缀，当前清单：

| 环境变量 | 环境变量 | 环境变量 |
| --- | --- | --- |
| `FX_TOOLKIT_REDACT` | `FX_TOOLKIT_NO_UPDATE_CHECK` | `FX_TOOLKIT_CHECK_WARN` |
| `FX_TOOLKIT_DEBUG_UPDATE_CHECK` | `FX_TOOLKIT_USAGE_DIR` | `FX_TOOLKIT_USAGE_AGENT` |
| `FX_TOOLKIT_USAGE_SESSION` | `FX_TOOLKIT_USAGE_NO_WORKER` |  |
<!-- toolkit:env-vars:end -->

旧名（如 `FX_REDACT`、`TOOLKIT_USAGE_DIR`）不再读取：命中时只在 stderr 提示一次，取值按新名或默认值处理。

另有独立环境变量 `FX_TOOLKIT_NO_UPDATE_CHECK`：设为真值时关闭升级检查提示。

升级检查自 1.7.0 引入；变量名随前缀统一为 `FX_TOOLKIT_`，行为详见[配置参考 · 升级检查](./config)。

**升级提示收口**：命令成功（退出码 0）时，按 `updateCheck.notify`（默认 `always`）在输出结尾给出一句话提示；TTY 下走 stderr，非 TTY 走 stdout。

已尝试修复（执行过 `skill install`）的同一版本不再重复提示。哪些子命令不输出、版本比较口径、关闭方式见[配置参考 · 升级检查](./config/update)。

## 输出约定

颜色**仅在交互终端启用**：输出被重定向到文件或管道、`TERM=dumb`、
旧版 Windows 控制台（无 Windows Terminal / VS Code 终端标记）时自动关闭。
`NO_COLOR` 非空或 `--no-color` 可关闭，`FORCE_COLOR` 非 `0` 可强制开启。

成功结论（`✔`）绿色、告警（`⚠️`）黄色、失败（`✖`）红色、次要说明与操作指引（`·`）暗色，
`[预演]` 标记青色，路径与命令名等强调文本青色。关闭颜色时符号保留、文案不变。
符号集固定为这四种，不再使用 `✓` / `ℹ️` 等同义符号。

机器可读输出不着色：`--format json`、`--out` 写入文件、`scope guard` 技能正文等数据通道恒为纯文本。

报告类 `--format json` 统一为八键信封，字段定义与缺省取值只在本页维护：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | number | 信封结构版本，固定 `1` |
| `command` | string | 实际命令路径 |
| `code` | number | 业务结论：缺省成功 `200`、报告含 error `422`；冲突 / 内部错误由调用点显式给 `409` / `500` |
| `message` | string | 结论文案：缺省 `成功` / `成功（N 项提示）` / 首条 error 的 message |
| `data` | object | 域载荷 |
| `extend` | object | 扩展位，恒为对象；`exitCode` 为进程退出码，不允许被同名扩展键覆盖 |
| `debug` | object | 调试信息，缺省 `{}` |
| `issues` | array | 聚合问题（`level` / `scope` / `message`），缺省 `[]` |

`code` 与 `extend.exitCode` 分离：`code` 只表达报告结论，`extend.exitCode` 才是进程退出码。
例如 `status` 不带 `--check` 时报告含 error，仍为 `code=422`、`extend.exitCode=0`。

数据流输出不套信封：`usage data export`、`task export <path>` 与 `release changeset` 透传保持原格式；
业务错误仍写 stderr 并保留原退出码，不在 stdout 输出半截 JSON。

文本表格、报告数据行与规则正文同样不着色，便于复制与日志比对；交互菜单由组件库自行渲染，不在本约定内。

## 交互约定

交互提示统一走同一套基座（`rule` / `scope` / `usage` / `skill` 已接入，其余域按同一口径演进）：

- 有上级步骤时按 ESC 返回上一级；首步或顶层按 ESC、选中末位「退出」都属正常取消，按 `0` 结束；强行中断用 Ctrl+C（取消退出码见[退出码](./cli/exit-codes)）。
- 写操作先展示预览再确认；`--yes` 跳过确认，`--dry-run` 只预览、不写文件 / 剪贴板 / 缓存。
- 非法取值统一在 stderr 报错并以 `1` 退出；`--format` 只接受 `json`，不再回落文本。

## 退出码

退出码的数值、含义与场景以[退出码与解析错误](./cli/exit-codes)为单一真源，本页不再重复。

软告警（warn 级）不影响退出码。解析错误的提示格式与 `release` 透传差异见[退出码与解析错误](./cli/exit-codes)。

**诊断类命令语义**：

- `status` / `usage show` 只汇总现状，退出码恒 0；`toolkit status --check` 例外——存在 error 级问题时退出 1
- `usage data doctor` 输出问题与修复建议，退出码恒 0
- `check`（`task check`、`docs theme check`、`docs nav check`、`docs dist check`）发现问题时退出 1，可直接作为门禁步骤

## 相关页面

- 参考：[配置参考](./config) · [API 参考](./api) · [退出码](./cli/exit-codes)
