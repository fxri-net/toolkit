# CLI 参考

> 目标读者：需要查命令、参数、默认值、退出码的用户。命令与参数口径取自 `toolkit --help` 与各子命令 `--help`（两者冲突时以 `--help` 为准）。

## 解决什么问题

README 只给最常用示例；本篇是完整的命令字典，覆盖全部参数与边界行为。

## 全局

**调用方式**：下文示例统一用 `toolkit <command>` 直调（已全局安装）或 `pnpm exec toolkit <command>`（项目 devDependency，npm 用户 `npx toolkit`）；不安装临时执行用 `pnpm dlx @fxri/toolkit <command>`。

```text
toolkit <command> [options]

命令：
  toolkit init          初始化项目任务区（生成 .tasks/ 骨架、规范载体与技能入口壳，补齐 .gitignore 片段）
  toolkit skills        AI 技能包分发：安装 / 状态 / 卸载 / 路径（包内 skills/ 为唯一真源）
  toolkit conventions   项目协作规范载体：结构升级（v1 → v2）与只读体检（形态 / 索引 / 入口层）
  toolkit tasks         任务管理
  toolkit changelog     多语言 CHANGELOG（封装 changesets）
  toolkit help          显示帮助
```

顶层命令支持的开关（`-h` 全局与子命令均可用）：

| 参数 | 说明 |
| --- | --- |
| `-h, --help` | 显示帮助（全局或子命令） |
| `-v, --version` | 显示版本号 |

`--redact` / `--warn` 为**域级开关**：仅 `tasks` 与 `changelog` 两个域支持（`init` / `skills` / `conventions` 域不提供），清单见下方各域的选项表。

开关为**双向三档**，优先级从高到低：CLI 参数 > 环境变量 > 配置文件 > 默认开启。对应环境变量：`FX_REDACT`、`FX_CHECK_WARN`（认 `0/1`、`true/false`、`on/off`、`yes/no`）；配置项见[配置参考](./config)。

另有一个独立环境变量 `FX_NO_UPDATE_CHECK`：设为真值时关闭升级检查提示（1.7.0 新增，行为详见[配置参考 · updateCheck](./config#updatecheck-升级检查提示-1-7-0-新增)）。

## tasks

```bash
toolkit tasks                     # 待完成总览（默认）
toolkit tasks --view archived     # 仅已归档
toolkit tasks --view all          # 待完成 + 已归档（状态分组，来源可辨）
toolkit tasks archive             # 归档已完成任务
toolkit tasks archive --dry-run   # 归档预演（只预览，不落盘）
toolkit tasks check               # 校验 active 与变更集前缀
toolkit tasks normalize           # 检查归档块（默认只读）
toolkit tasks normalize --fix     # 修复归档问题
toolkit tasks stats               # 周期统计：完成周期 / 滞留 / 吞吐
toolkit tasks stats --format json # 统计结果 JSON 输出
toolkit tasks --dir <path>        # 指定任务目录（CLI 参数 > 配置 tasks.dir > 默认 .tasks）
toolkit tasks check --strict      # 任务目录不存在时报错退出（默认容错为空结果）
```

### 任务域选项

| 选项 | 说明 |
| --- | --- |
| `--dir <path>` | 任务目录（优先级：CLI 参数 > 配置 `tasks.dir` > 默认 `.tasks`） |
| `--redact` / `--no-redact` | 开启/关闭隐私脱敏（默认开启） |
| `--warn` / `--no-warn` | 开启/关闭软告警（默认开启；作用于 `tasks check` 的 warn 输出、归档时的变更集提醒） |
| `--dry-run` | 预演：`archive` 归档 / `import` 导入只预览，不落盘 |
| `--fix` | 归一化修复（仅 `normalize` 有效） |
| `--check` | 归一化只读检查（`normalize` 默认行为，可显式声明；不能与 `--fix` 同用） |
| `--strict` | 任务目录不存在时报错退出（默认容错为空结果） |

### 子命令

| 子命令 | 行为 |
| --- | --- |
| `archive` | 将 `status` 为 `已完成`/`已放弃` 且带 `completed` 的任务按完成日期聚合归档；排他锁防并发；缺 `completed` 的终结态任务跳过并提示；完成时间晚于当前系统时间超过 14 小时（跨时区容差）或恰为零点整（疑似只填日期被补零）时软告警 |
| `check` | 校验 active：frontmatter 合法性、owner/created/命名规范、重名、`updated` 早于 `created`（error 级，时间线矛盾）、`depends_on` 闭环、未闭合待办与 `- [ ]`；completed 晚于当前系统时间超过 14 小时（跨时区容差）或恰为零点整（疑似只填日期被补零）软告警；范围字段形态软告警（顿号/逗号疑似多值分隔请改半角加号、括号疑似注释请移入正文）；游离于 `active/` 层级外的日期前缀文件软告警；规范载体形态软告警（旧单文件 `conventions.md` 残留待迁移、`conventions/` 缺 `index.md`、v2 标记与 `history.md` / 索引表首列 ID 三者不一致）；技能入口壳软告警（壳标记版本与当前 toolkit 不一致、或被 gitignore 覆盖不会随 git 分发，多落点并存时各合并为一条并内联落点路径）；变更集缺类型前缀软告警（扫 `.changeset` 下待发布变更集顶层条目，缺前缀文件各转一条并内联条数，提示按「类型：描述」撰写；前缀识别取全局表与各配置语言自有前缀的并集，缩进续行随父条目迁属不参与）；归档块软告警（复用 `tasks normalize` 的同一检查实现：月份目录归属、元数据行缺失/不完整、范围字段形态、完成时间不可识别/漂移/超前/零点整、降序排序、疑似任务块）；文件卫生软告警（含 UTF-8 BOM、行尾多余空白、换行符 CRLF/LF 混用，统一软告警不阻断）；只看形态不读条文内容 |
| `normalize` | 检查归档块：元数据四字段完整性、疑似任务块、完成时间与归档日期漂移、完成时间晚于当前系统时间超过 14 小时（跨时区容差）或恰为零点整（仅报告，不自动改值）、降序排序、月份目录归属、范围字段形态（顿号/逗号分隔可 `--fix` 归一为半角加号，括号疑似注释仅提示人工）；`--fix` 自动补齐/迁移/重排/范围归一；`--fix` 与 `--check` 互斥 |
| `stats` | 周期统计（仅人用视图，不落盘）：完成周期与分布（仅「已完成」，已归档任务创建日期从块标题恢复，缺失者跳过并计数）、未完成任务滞留时长、按完成月/负责人/范围吞吐汇总；`--format json` 输出 JSON（顶层携带 `schemaVersion: 1` 锚点，与 `tasks --export` 及各域 `--format json` 同口径），过滤选项与视图查询一致（`--view` 默认 `all`，含归档） |

`check` / `normalize` 的问题清单逐条输出为 `文件:行号: 描述`（有行号时便于编辑器跳转）；文件级问题（如重名、游离文件、归档块问题）无对应行，省略行号段，输出为 `文件: 描述`。

### 视图与过滤选项

| 选项 | 说明 |
| --- | --- |
| `--view <view>` | `active`（默认）/ `archived` / `all` |
| `--owner <name>` | 按负责人过滤，逗号分隔多值 |
| `--scope <scope>` | 按范围过滤，逗号分隔多值；任务文件内范围多值以半角加号存储（如 `toolkit+lxgl-web`），过滤值命中任一段即中 |
| `--status <status>` | 按状态过滤，逗号分隔多值；部分取值非法时 stderr 告警并剔除（能继续执行），全部取值非法时报错退出（退出码 1） |
| `--date <date>` | 单日过滤（`YYYY-MM-DD`），与 `--since`/`--until` 互斥 |
| `--since <date>` | 起始日期（含当天） |
| `--until <date>` | 结束日期（含当天） |

⚠️ 过滤只作用于所选视图；不指定 `--view` 时默认只查待完成，过滤落空会附 `--view` 引导提示。日期口径：待完成看创建/更新，已归档看完成时间。

### 导入导出选项

| 选项 | 说明 |
| --- | --- |
| `--export <path>` | 导出到文件（**仅任务总览 `toolkit tasks` 消费**；`archive`/`check`/`normalize`/`stats` 传入时 stderr 告警忽略、命令继续），按扩展名驱动：`.csv`（UTF-8 BOM 超集列）/ `.xlsx`（三 sheet）/ `.json`（`{ schemaVersion: 1, summary, items }`）；目录不存在自动创建 |
| `--format json` | JSON 输出到 stdout（**任务总览与 `stats` 消费**；`archive`/`check`/`normalize` 传入时 stderr 告警忽略、命令继续）；诊断与提示信息（升级提示、链接自愈提示）一律走 stderr，不干扰机器解析；与 `--export` 互斥（仅任务总览下判定） |
| `--import <file>` | 从 `.csv`/`.xlsx`/`.json` 导入；独立模式，不能与子命令、`--export`、`--format` 同用；`--owner`/`--scope` 可同用，作为导入行缺失字段的默认值 |
| `--target <target>` | 导入目标 `active`（默认，生成任务文件）/ `archive`（直接写归档块） |

导入细节：兼容本工具三种导出产物（JSON 另兼容裸数组格式）；XLSX 自动跳过名为「汇总」的 sheet、支持表头不在首行；表头自动识别中英文别名（不区分大小写），`.toolkitrc.json` 的 `tasks.importColumns` 自定义映射优先级最高；文件名冲突自动追加序号不覆盖；带完成时间的行状态非终结态时自动置「已完成」并告警；范围列含顿号/逗号/括号时提示按单值写入、多值请用半角加号（只提示不自动转换）。

`--target archive` 的归档契约：按块标题去重——同名任务以**本次导入的内容覆盖**同名块，重复导入同一份文件不会产生重复块（幂等）；块内元数据状态**取自数据**（如源行状态为「已放弃」则写「已放弃」，不强制改写为「已完成」）；缺完成时间的行无法直接归档，跳过并提示改用 `active` 目标。

## changelog

```bash
toolkit changelog                       # 创建变更集（等价 changeset）
toolkit changelog version               # 发版 + 格式化（默认中文）
toolkit changelog --lang en version     # 指定语言
toolkit changelog format                # 仅格式化已有 CHANGELOG
toolkit changelog --history format      # 连带追溯改写历史版本块
toolkit changelog status / publish      # 其余 changeset 子命令透传
```

⚠️ `changelog` 域开了选项透传（`passThroughOptions`），自有选项必须放在子命令**之前**：写 `toolkit changelog --history format` 生效，写成 `toolkit changelog format --history` 会把 `--history` 当作 changesets 的参数静默忽略。

⚠️ 帮助标志为例外：`-h` / `--help` 紧跟 `version` / `format` 时打印 changelog 本域帮助并退出，不落入透传（其余子命令的帮助标志仍透传给 changesets 输出其自身帮助）。

| 选项 | 说明 |
| --- | --- |
| `--lang <lang>` | 输出语言，默认 `zh`；内置 `zh`/`en`，其余经配置扩展；传入未定义语言时 stderr 告警并回落默认语言 |
| `--redact` / `--no-redact` | 开启/关闭隐私脱敏（默认开启；作用于 CHANGELOG 终端展示与落盘） |
| `--warn` / `--no-warn` | 开启/关闭软告警（默认开启；作用于发版前未归档任务提醒与无类型前缀条目计数告警） |
| `--history` | 追溯改写历史版本块（默认保留其当时口径） |

行为细节：

- `version`：先透传 changesets 消费变更集，再对 CHANGELOG 做语义分组归类（条目按 `类型：` 前缀归入「新增功能 / 问题修复 / …」等分组，无前缀条目按所属源组标题兜底）、清理变更集条目双前缀伪影（以 `- ` 开头的条目会被 changesets 二次加前缀为 `- - 条目` 并缩进续行，格式化时还原为顶层条目）并补发布日期；分组标题集合随版本演进，块内无法归入任何语义分组的其它分组连同标题原样附于块末、不丢弃；历史版本块默认保留当时口径、不追溯改写（加 `--history` 追溯：历史块内条目按其类型前缀归位、无前缀条目按既有组标题归位，组标题转写为当前语言口径，无法识别的分组连同标题原样保留、不臆造归属）；归类前后做条目数自检（归类只应搬移条目、不应减少，减少即 stderr 告警提示人工核对，相邻重复条目合并发生在自检之后不触发）；存在未归档 active 任务时软告警，变更集条目缺 `类型：` 前缀时计数软告警
- `format`：仅对既有 CHANGELOG 做同样的语义分组归类与格式化（历史版本块默认不追溯改写，加 `--history` 可追溯）；变更集条目缺类型前缀时同样计数软告警
- 类型前缀只作归类信号：归类后条目已识别的 `类型：` 前缀被剥离（`- 修复：xxx` → `- xxx`），类型由分组标题承接，避免重复；未识别的前缀（如正文里的 `说明：`）与依赖源条目 `- Updated dependencies`（续行承载包版本）原样保留
- 其余子命令（`add`/`status`/`publish`/…）原样透传给 changesets
- ⚠️ Node 18 与 Node 20.0–20.18 下依赖 changesets 的子命令不可用（上游 ESM-only 限制需宿主默认开启 `require(esm)`，即 Node ≥ 20.19.0、22 线 ≥ 22.12.0），`format` 等纯格式化不受影响

## init（1.7.0 新增）

```bash
toolkit init
toolkit init --dir ../my-tasks-repo   # 任务区放项目外（独立仓库管理）
```

在当前目录初始化任务区，逐项如实报告实际动作（新建 / 更新 / 保持 / 追加 / 跳过）：

- 创建 `<任务目录>/active/{YYYYMM}/`、`<任务目录>/archive/` 目录骨架（默认 `.tasks`，优先级与 `tasks` 同口径：CLI 参数 > 配置 `tasks.dir` > 默认 `.tasks`）
- 创建规范载体骨架 `<任务目录>/conventions/index.md`（v2 三节：端清单 / 索引 / 用法说明）与 `<任务目录>/conventions/history.md`（演进记录）；已存在 `index.md` 时保持不动（v1 形态另给升级提示）；存在待迁移的旧单文件 `<任务目录>/conventions.md` 时不建空骨架
- 在**已存在的**项目级技能目录各生成一份规范入口壳（如 `.agents/skills/toolkit-conventions/SKILL.md`，目录名与 frontmatter `name` 同名；只作入口、不承载条文）——多 agent 混用团队多个候选目录并存时每处各写一份、互不覆盖，一个都不存在时回落 `.agents/skills/`，不为未安装的 agent 凭空建目录；壳已存在时按标记版本分流——标记不旧于当前版本保持不变、落后或无标记就地更新为当前版本（报告为「更新」）；并在**已存在的** `AGENTS.md` 内幂等追加规范入口指针块（`AGENTS.md` 不存在时不新建，仅在报告中提示规范仍可经全局技能触达）
- 向 `.gitignore` 追加忽略片段（含 `.archive.lock`；已有则跳过）
- 输出后续步骤与文档站链接；检测到尚未安装全局技能时，后续步骤中补一行 `toolkit skills install` 指引（规范触达第一层，不依赖项目内文件；已安装则不重复提示）

⚠️ 入口壳写入项目级技能目录（`.agents/skills/`、`.trae/skills/` 等）属**侵入性行为**，`init` 在报告中逐项列出实际写入的路径与动作（存在几个候选目录就各写一份）；落点被 `.gitignore` 覆盖时报告给出否定规则提示（**不代改 `.gitignore`**）。入口壳可安全删除，重跑 `init` 会补回；标记落后于当前版本时重跑 `init` 会就地更新为当前版本。

⚠️ 重复执行安全：业务文件已存在一律保持不覆盖、不报错（逐项报告为「保持」）；唯一例外是**入口壳按标记版本分流**——标记不旧于当前版本时保持不变，标记落后或无标记时就地更新为当前版本（报告为「更新」）。

⚠️ 任务区放项目外（独立文档仓库）：配置 `"tasks": { "dir": "../my-tasks-repo" }` 后，`init` 与全部 `tasks` 子命令都作用于该目录，一次配置永久生效；`.gitignore` 片段仍写入当前项目。

## skills（1.9.0 新增）

```bash
toolkit skills install              # 安装包内技能到各全局技能目录（默认软链真源）
toolkit skills install --copy       # 强制副本形式（不建软链）
toolkit skills install --dry-run    # 预演：只预览将执行的动作，不写文件
toolkit skills install --force      # 覆盖同名非本包产物（默认跳过，避免破坏用户自装技能；不改本包已登记副本的形态）
toolkit skills install --dir <path> # 额外目标目录（可多次指定，兜底内置表未收录的 agent）
toolkit skills install --format json # JSON 输出：技能源、包内技能、各目标新建/更新/跳过/冲突/降级/失败
toolkit skills status               # 查看各全局技能目录的现场状态与包内技能真源版本
toolkit skills status --format json # JSON 输出：技能源目录、技能真源版本、状态文件、技能清单、各目标逐技能状态
toolkit skills remove               # 卸载本包安装的技能产物（目标目录清空后一并回收）
toolkit skills remove --dry-run     # 卸载预演（只预览将移除的条目）
toolkit skills remove --format json # JSON 输出：状态文件、各目标已移除/已不存在/跳过项、目标目录是否回收
toolkit skills path                 # 输出包根路径（内含 skills/）
toolkit skills path --format json   # JSON 输出：包根、技能源目录、技能清单
```

裸 `toolkit skills` 打印本域帮助（列出 4 个子命令）。

| 子命令 | 行为 |
| --- | --- |
| `install` | 以包内 `skills/`（含 `SKILL.md` 者计为技能）为唯一真源分发：逐技能幂等——指向正确跳过（含锚在 pnpm 稳定入口、内容与真源一致的异地软链）、指向其他版本（内容与真源不一致）或悬空重建、同名实体目录 / 普通文件默认跳过（`--force` 覆盖）；**落点形态沿用既有登记**——本包以副本形式登记过的技能，裸 `install` 与 `--force` 都保持副本（`--force` 只解除冲突判定，不把副本翻回软链），未登记的同名实体目录被 `--force` 接管时才按默认形态重建为软链；未安装的 agent 只报告、不凭空造目录；`--format json` 输出机器可读安装报告到 stdout（含 `dryRun` 标记） |
| `status` | 先打印包内各技能真源版本清单（供与会话上下文中已加载的技能内容对照，判断上下文是否过期），再逐目标报告 7 态：软链正常 / 软链悬空 / 软链指向其他版本 / 副本已同步 / 副本已漂移（本包登记副本与真源不一致）/ 缺失 / 同名冲突（同名非本包产物）；**健康目标折叠为一行**（`<目标>：<目录>　N 项正常`），仅含问题项的目标逐条展开，末尾汇总需处理条目并按型给出指引：缺失 / 悬空 / 指向其他版本 / 副本漂移用 `install` 补齐，同名冲突用 `install --force` 覆盖；**目标纳入口径**：主目标恒报告，内置表内的 agent 与自定义目标仅在已有本包记录或目录非空时展开（卸载后的空壳目录不占版面），状态文件登记但本次未解析到的目标（如 `--dir` 安装后不再传参、agent 目录已被移除）也补报、不静默丢弃；存在软链落点时报告末尾另提示「写入将穿透至技能真源目录，改内容请改真源」；`--format json` 输出机器可读报告到 stdout（含 `skillVersions`，折叠不丢信息、替代人读版，无末尾汇总行） |
| `remove` | 只清理状态文件 `~/.agents/.toolkit-skills.json` 记载的本包产物：链接（含悬空）摘除、副本内容与真源一致才删，其余交人工确认；清理后目标目录若已空则**一并回收**（`--dry-run` 只预览、不动现场；目录非空或不可读时不回收）；清理干净后删除状态文件；`--format json` 输出机器可读卸载报告到 stdout（含各目标 `dirReclaimed` 回收标记与 `dryRun` 标记） |
| `path` | 输出包根（内含 `skills/`），便于委托上游安装器安装到内置表未收录的 agent；`--format json` 输出包根、技能源目录与技能清单 |

四个子命令的 `--format json` 输出统一携带 `schemaVersion: 1` 锚点（与 `tasks --export` 同口径）；`status` 报告另含 `skillVersions`（各技能真源版本，用于与会话上下文中已加载的技能内容对照），`install` / `remove` 的报告另带 `dryRun` 字段，供消费方区分预演与实跑。

**分发目标三层**（按顺序去重）：

1. 主目标 `~/.agents/skills/`（上游 canonical 目录，多家 agent 共读）
2. 内置表中「已安装」的各 agent 全局技能目录（判据：agent 配置目录存在或探测路径命中）
3. `--dir <path>` 指定的兜底目录

**行为细节**：

- 产物形态默认**软链**（Windows 用 `junction`，免管理员、免开发者模式）；软链锚在 pnpm 稳定入口（`<node_modules>/@fxri/toolkit`，升级时由 pnpm 重写），不随版本段失效；链接创建失败**自动降级副本**并在报告里标注 ⚠️，不静默跳过
- 卸载链接时**只摘链、不碰真源**（包内原始文件完好）
- 软链落点是**写入穿透**形态：在落点目录里编辑文件等于编辑技能真源，且该真源随包升级整体换新——`status` 在存在软链落点时于报告末尾提示「写入将穿透至技能真源目录，改内容请改真源」，避免用户误在落点上编辑
- 配置 `skills.autoLink`（默认 `true`）：命令启动时对状态文件记载的**链接**做补链与修链；只重建悬空或**指向其他版本（内容与真源不一致）**的链接——内容与真源一致的异地软链（如锚在别的安装）不视为错误、不重指；现场被替换为同名实体目录 / 普通文件时默认清理重建为软链，置 `skills.autoLinkReplaceForeign: false` 可改为一律不动（**不含首次安装、不含副本升级**；`CI` 环境自动跳过。见[配置参考 · skills](./config#skills-技能分发-1-9-0-新增)）
- 状态文件为**用户级**（`~/.agents/.toolkit-skills.json`），与上游安装器的 `skills-lock.json` 相互独立

## conventions（1.11.0 新增）

```bash
toolkit conventions upgrade               # 把 v1 规范载体升级为 v2（幂等，先判后写）
toolkit conventions upgrade --dry-run     # 预演：只预览将执行的动作，不写文件
toolkit conventions upgrade --format json # JSON 输出：ID 映射、内部引用改写、结构动作清单
toolkit conventions status                # 只读体检：形态 / 索引 / 入口层三块（只报不改，体检不阻断、退出码恒 0；仅 --format 传非法值时按参数错误退出）
toolkit conventions status --format json  # JSON 输出：形态、条目数、入口壳现场与逐条体检项
```

裸 `toolkit conventions` 打印本域帮助（列出 2 个子命令）。

| 子命令 | 行为 |
| --- | --- |
| `upgrade` | 把 v1 载体升为 v2：首行补形态标记、标题归一、「演进记录」节抽为独立 `history.md`、索引表首列 `#` → `ID`（序号 → 稳定 ID `C-<n>`）、节号重编、内部引用改写为稳定 ID（裸「第 N 条」且 N ≤ 索引表最大序号；带外部文档限定词前缀的引用不动）。**幂等**——已是 v2 返回 `already-v2`、不改动；未初始化（缺 `index.md`）或形态异常（标记 / `history.md` / 索引表首列三者不一致）在**写盘前**拒绝执行并给非 0 退出码，不写任何文件。`--dry-run` 只报告不改动；`--format json` 输出 `status`、`idMap`、`refs`、`changes`（ID 映射只随报告输出、不落盘） |
| `status` | 只读体检、只报不修（无 `--fix`）：**形态**（v1 提示可升级、形态异常、旧单文件与目录并存）、**索引**（ID 形态与重复、归属不在端清单内、分册小节在索引表无对应条目）、**入口层**（壳标记与当前 toolkit 不一致、壳被 gitignore 覆盖，多落点并存时各合并为一条并内联全部落点路径；标记不一致可重跑 `toolkit init` 就地更新为当前版本；无壳仅提示，本包源仓库除外——其不生成入口壳）三块，逐条按 `[形态]` / `[索引]` / `[入口层]` 前缀输出；一句话结论为 `载体 <形态>，<n> 条规范，入口壳 <m> 个，无待处理项 / <k> 项待处理`；未初始化只回单条结论。**体检不阻断、退出码恒 0**（异常不阻断，便于当 CI 信息源；仅 `--format` 传非法值时按参数错误报错退出） |

⚠️ `upgrade` 只做机械结构升级，不改条文语义；升级过程可中断、重复执行安全。

载体结构（v1 / v2 形态、稳定 ID、`history.md`）与读写细则见[完整攻略 · conventions/：规范沉淀地](./guide#conventions-规范沉淀地)。

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功（含 check 通过、归档跳过等正常路径） |
| `1` | 操作失败或校验存在 error 级问题（check 有 error、参数冲突、非法子命令、文件/目录异常等） |

软告警（warn 级）不影响退出码。

未知命令、未知选项、参数个数不符等解析错误统一输出 `⚠️` 开头的中文提示，并附一行 `运行 toolkit --help 查看可用命令` 指引（退出码 `1`），不再混出 commander 的英文原文。`changelog` 透传给 changesets 的英文输出不在其列——那属第三方 CLI 自身的报错通道。

## 相关页面

- [完整攻略](./guide)：工作流与任务文件规范
- [配置参考](./config)：`.toolkitrc.json` 全部字段
- [API 参考](./api)：以上能力的库形态
