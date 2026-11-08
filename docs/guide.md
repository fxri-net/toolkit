# 完整攻略

> 目标读者：已在项目中装好本工具、想了解完整工作流与进阶用法的用户。
>
> 本篇讲**原理与完整工作流**：每个能力的机制、边界与取舍。第一次安装、日常按场景该怎么说怎么做，分别见
> [快速开始](./getting-started)与[操作手册](./handbook)；命令参数统一查 [CLI 参考](./cli)。

## 解决什么问题

快速开始只覆盖最短路径；本篇回答日常使用的全部问题：任务从哪来、哪些文件进 git、怎么让 AI 只在某些项目激活、会话上下文怎么跨会话保留、CHANGELOG 怎么维护多语言、文档站怎么部署。

## 工作流总览

```
方案确认 → 落盘建档(.tasks/active/) → tasks check 校验 → 执行开发
        → 任务完成：标记 status/completed → tasks archive 归档
        → 规范沉淀(.tasks/conventions/，能力终点)
```

后续动作（项目自主，非必经步骤，是否执行取决于全局 / 个人 / 项目规则约定）：

```
提交代码（先归档与沉淀、后 git commit，同一提交） → changelog 建变更集 → changelog version → tag → publish
```

人可以直接执行命令；AI 侧装了技能包后，上述每一步都有对应的技能流程（见 [AI 技能包](#ai-技能包-skills)）。

## 任务文件规范

> 完整规范以仓库根 [SPEC.md](https://github.com/fxri-net/toolkit/blob/main/SPEC.md) 为单一事实源，
> 命令与校验细则见 [tasks 命令](./cli/tasks)；此处只列日常速查。

### 目录结构

```
.tasks/
├── active/{YYYYMM}/{YYYYMMDD}-{用户名}-{任务简述}.md   # 实时任务，按月分目录
├── archive/{YYYYMM}/{YYYYMMDD}.md                     # 已归档，按完成日期聚合、块降序
└── conventions/                                       # 项目协作规范载体（可选）
    ├── index.md      # 唯一入口与唯一权威（常驻读）：首行形态标记、索引表首列稳定 ID
    ├── history.md    # 规范语义演进记录（只追加、不改旧行；归档面、按需读）
    ├── retired.md    # 退休台账：已作废规范的冻结语义（按需创建；归档面、按需读）
    ├── common.md     # 全端通用条文（按需创建）
    └── <端名>.md / <分类标签>.md   # 端分册 / 按 scope 标签命中加载的分册（按需创建）
```

`conventions/` 不是任务文件：tasks 子命令不读其内容、check 不因**条文内容**告警，只对载体形态、入口壳与表格填充态软告警（细则见 [conventions 命令](./cli/conventions)）。

### frontmatter 字段

| 字段 | 说明 |
| --- | --- |
| `owner` | 负责人（git 用户名） |
| `status` | `待办` / `进行中` / `阻塞` / `已完成` / `已放弃`（后两者为可归档终结态） |
| `created` | 创建日 `YYYYMMDD`，必须等于文件名日期前缀 |
| `updated` | 更新日 `YYYYMMDD` |
| `completed` | 完成时间 `YYYY-MM-DD HH:mm`，终结态必填；按四级时间源取证（见[会话沉淀](#会话沉淀、恢复与历史修正)） |
| `depends_on` | 依赖任务文件名数组 |
| `scope` | 影响范围；只标本仓内的端 / 面，多值以半角加号分隔（如 `web+server`），顿号 / 逗号列表属误写会触发 check 软告警 |

### 归档规则要点

- 只有 `已完成` / `已放弃` 且带 `completed` 可归档；归档是人工 / 事件驱动，若提交代码须早于 `git commit`
- 归档块是终结记录，不追加新工作内容（延续走新任务并标注来源链）；唯一例外是**事实更正**——在正文末尾追加「修订记录」，保留原结论、附更正时刻与依据，唯一键 / 完成时间 / 状态 / 负责人仍冻结
- 文件按完成日期聚合、块按完成时间降序，**块间的 `---` 是唯一权威边界**；`toolkit tasks archive` 自动完成并加排他锁（并发时跳过并告警，残留锁自动接管）
- `toolkit tasks normalize` 检查元数据、日期漂移、排序与时间异常（完成时间晚于当前系统时间超过 14 小时、或恰为零点整），`--fix` 自动修复
  但时间异常需人工确认；多人同天归档产生的 git 冲突标记按并集去重 + 降序**确定性**解决

## 方案落盘工作流

任务文件的来源是**已确认的实施方案**，不是临时想法：

1. **动手前置建档评估（先查后写）**：动手改仓库文件前先 `toolkit tasks` 查 active、核对 archive——active 有同主题更新原文件；
   archive 有同主题时看**本次是否产生仓库文件改动**：无改动不重复建档，有改动重新建档并标注来源链；均无则建档后再动手。
   改动口径 = 需写入版本控制的工作区文件的增 / 改 / 删（纯读取、纯执行、纯汇报不计入）。归档块不可变，延续需求走新任务；
   **跨仓库改动各自归档**：任务档只记本仓的改动与动机。
2. **建档**：在 `active/{YYYYMM}/` 按命名规范创建任务文件（AI 用户直接说「把方案落盘为任务」）。
   **多任务 / 多仓方案**先出一张纯展示计划表（序号 | 仓库 | 任务 | 前置，不落档），再逐仓逐任务建档，全部建档后才改第一处文件；只读参与的仓库不建档。
   方案已确认时收到推进授权（如「开始 / 按计划执行」）就**一次建完全部任务档**并跑 `tasks check`（error 与 warn 均为 0），不再逐个补建。
   每档须自包含（背景 / 方案 / 影响范围 / 验证 + 计划位置 / 前置 / 后继），执行到任一任务只读该档即可恢复细节。
3. **过程更新**：状态沿 待办 → 进行中 → 阻塞 →（已完成 | 已放弃）流转；方案里的「待实施 / 待核对」子项拆为独立任务（`check` 会扫描游离待办）。
4. **按序交付**：按计划表顺序推进，前置未完成或阻塞未解除时下游不开工；每个任务完成即走完本仓「归档 → 验收 → 提交」再进入下一个，不跨任务攒批。
5. **收口**：终结态补 `completed`，归档后做任务级规范沉淀检查，归档 + 沉淀即流程终点；提交、发版、推送由规则约定。
   ⚠️ **动作不算、改动才算**：收尾动作本身及其固有产物（版本号、更新日志、标签）不构成任务；过程中若出现需改仓库文件才能修复的缺陷，该修复按普通任务建档。

## Git 纳管范围

| 路径 | 是否入库 | 原因 |
| --- | --- | --- |
| `.tasks/`（active + archive + conventions/） | ✅ 必须 | 任务记录是团队共享的工作记忆 |
| `.agents/skills/` 等技能目录（真源 + 别名薄壳） | ✅ 必须 | 队友 clone 即用、无需逐台重装 |
| `.toolkit/state.json` | ✅ 必须 | 项目态技能归属账，供刷新与清理定位 |
| `.toolkitrc.json` | ✅ 建议 | 团队统一脱敏、告警、语言配置 |
| `.toolkitrc.local.json` | ❌ 忽略 | 个人本地配置，默认不入库、不随 git 分发 |
| `.archive.lock` | ❌ 忽略 | 运行时排他锁，无共享价值 |
| 导出产物（`tasks.csv` 等） | 按需 | 一般为临时分析产物，默认忽略 |

`toolkit init` 会生成 `.tasks/` 骨架、项目级技能入口壳与 `.gitignore` 片段；
项目本地依赖含 `@fxri/toolkit` 时还会写入 `prepare` 刷新钩子（`toolkit skills install --scope project`，`--no-hooks` 可关）。

⚠️ 发布型包注意：技能产物（`.agents/skills/`、各候选目录薄壳、`.toolkit/`）与内置任务区都不在 `.gitignore` 忽略列表，
`npm` 无 `.npmignore` 时可能被打进包——请加入 `files` 白名单或 `.npmignore`（`init` 会提示、不代改）。

⚠️ 活跃任务不提交是常见反模式：换机器 / 工作区被清理后任务记录即丢失，且 `check` / 归档依赖的上下文无从恢复。

**任务区放项目外**：可配置 `"tasks": { "dir": "../my-tasks-repo" }` 指向独立文档仓库，
`.toolkitrc.json` 仍在项目内提交并声明外置路径；个人可仅在本地层覆盖 `tasks.dir`（⚠️ 相对路径基准为 `process.cwd()`，非配置文件所在目录）。

## 会话沉淀、恢复与历史修正

**核心边界**：AI 的新会话读不到其他会话的内部上下文，对话记录本身不可作为跨会话记忆。本工具的解法是把记忆**沉淀进仓库文件**（`.tasks/`），完整流程由 `fxri-session-recap` 技能承载。

### 四级时间源

「会话当时的真实时间」不可凭空估算，任何时间字段按以下优先级取证：

| 级 | 时间源 | 取证 |
| --- | --- | --- |
| 0 | 任务完成当场打点（首选） | 完成时立即执行命令取时间 |
| 1 | 聊天记录准确时间戳 | 用户贴过的日志 / 终端输出时间戳、用户口述的确定时刻 |
| 2 | 任务改动 git 提交时间 | `git log --format="%h %ci"` |
| 3 | 系统当前时间兜底 | 当场取时 + 正文标注「时间为收尾补记」 |

### 统一收尾链路（能力终点 = 沉淀）

```
任务终结 → 归档 → 规范沉淀（.tasks/conventions/，硬终点） → 提交/发版/推送（默认需确认；当次指令已含授权则直接执行）
```

### 会话沉淀（收尾执行）

全量回放本会话 → **事前核对清单交用户确认无遗漏** → 逐条落盘 / 更新任务文件 → 归档 → 会话级规范沉淀 → 回报清单。决策及其理由必须记，未尽事项拆独立任务。提示词示例：「会话要结束了，把本次结论归档」。

### 恢复上下文（新会话开场）

**三层恢复**：L0 全量索引（一行一条 + 统计）→ L1 active 全文精读 → L2 近窗归档精读
（只精读从最新归档向前连续活跃的一段，被 ≥1 年空洞隔断的旧档只入 L0）。active 任务 `updated` 距今 >1 年标注「疑似搁置」；
规范现场按 `index.md` → 命中端分册 / 分类标签分册 + `common.md` 加载，全程只读。

### 批量修正历史任务时间

对照 git log 与聊天记录**取证** → 清单交用户确认 → 改归档块完成时间 → `toolkit tasks normalize --fix` 自动迁移到正确日期文件 → 只读核验。

### conventions/：规范沉淀地

从任务与会话中提炼的项目协作规范写入 `.tasks/conventions/`，每条带来源任务与日期，写入前需用户确认；一次性决策留在任务正文，不升格为规范。

**三分区（按读面）**：Z1 常驻 `index.md`（只含活跃条目的指针，成本与条数线性）；Z2 按需 `common.md` / 端分册 / 分类标签分册（只含活跃条文）；
Z3 归档 `history.md` / `retired.md`（仅审计 / 恢复时读）。不变量：同一条目不同时出现在活跃面与归档面、条文只存一处、ID 永不回收复用。

**端名与读写分层**：端名与任务 `scope` 取值逐字一致（`scope: web+server` → 加载 `web.md` + `server.md` 并恒叠加 `common.md`）；
端清单由 `index.md` 顶部显式声明，是端的唯一权威（不扫目录）；`scope` 中既不在端清单、又非保留字的值视为分类标签，存在同名分册才加载、否则静默跳过。
写入先问「是否所有端都适用」，是则归 `common`，否则逐端各记一条——`common` 是「所有端」而非「不确定归哪端」的暂存区。

**内容修订**：语义变更先在 `history.md` 追加留痕、再更新索引行当前语义；规则**作废**走「迁出 + 三层清理」——
索引行从 `index.md` 删除并迁入 `retired.md`（冻结退休时语义、记后继与条文去向），
同时物理删除分册内该条小节、同步删改外部单一事实源，不留「已废弃」占位。

**表格形态**：任务区 md 表格以**紧凑形态**（`| a | b |`）为规范形态；prettier 等格式化器填充出的列对齐空白属偏离。
`toolkit init` 幂等托管 `.prettierignore`（任务区不参与格式化），`toolkit conventions format` 把存量表格压回紧凑形态
（只动空白层、跳过 fenced code block、幂等）。

### 存量规范载体迁移

旧单文件 `.tasks/conventions.md` 说一句「把 conventions.md 迁到新形态」即可，AI 走三段式（**可中断、中途停下不丢内容**）：
① 建 `conventions/`，旧文件**整体**搬为 `index.md`（原文一字不丢）并删旧文件；② AI 逐条给出「`common` / 某端」建议与理由；
③ 用户逐条确认后写索引行、拆条文入分册，未确认条目保持原样留在 `index.md`。

**v1 / v2 → v3 升级**：优先 `toolkit conventions upgrade`（`--dry-run` 预演、幂等、先判后写，异常形态拒绝写盘；v1 链式升到 v3），
升级内容为 v3 三分区（索引表删「状态」「确立来源任务」两列、`history.md` 表头首格归一为 `ID`、废弃条目迁入 `retired.md`）。
迁移期间兼容读：先找 `conventions/index.md`，不存在再看旧单文件；两者并存以目录形态为准。

## AI 技能包 skills

零依赖 Agent Skills（纯 Markdown），遵循 [Agent Skills 开放标准](https://agentskills.io)，
可被 Claude Code、Cursor、Codex、Gemini CLI、Trae、DeepSeek Harness 等兼容 agent 按需加载。

| 技能 | 版本 | 用途 | 层级 |
| --- | --- | --- | --- |
| `fxri-plan-to-task` | 1.10.3 | 方案落盘：任务分解与纯展示计划表 → 逐仓逐任务建档 → 校验 → 归档 → 任务级规范沉淀（能力终点）；规范载体迁移与升级 | core |
| `fxri-release-changelog` | 1.3.4 | changesets 发版与多语言 CHANGELOG 维护 | optional |
| `fxri-session-recap` | 1.6.11 | 会话收尾全量沉淀 + 规范沉淀 / 新会话三层恢复 / 历史任务时间批量修正 | core |
| `fxri-plan-review` | 1.0.8 | 复核已落档任务拆分：输出新增疏漏、建议与修订计划表，按 `直接落档` / `需要确认` / `仅作提示` 标记后续是否落档 | core |
| `fxri-text-encoding` | 1.2.4 | 文本编码：写脚本 / 配置 / 数据交换文本与跨进程 / 跨机器传递前按「生产者 × 消费者」定字节形态（临时任务同样适用），含非 ASCII 丢失 / 变形、乱码反查与首行报错 | optional |

版本号取自各 SKILL.md 的 frontmatter `metadata.version`（`toolkit skills status` 打印的真源版本），
层级取自 `metadata.tier`（`core` 必装、`optional` 可选）。

**安装**（两种方式选一）：

```bash
# 方式一：装了 CLI 一键分发（推荐，技能随包分发，与 CLI 同一发布批次）
toolkit skills install     # 默认软链真源，失败自动降级副本；先按 tier 选技能、再选目标
                           # --scope <project|global|all> 指定作用域；--prune 清理未选择的旧产物
                           # --from <path|url> 临时外部来源，加 --save [name] 登记永久来源
toolkit skills status      # 查现场与版本；toolkit skills uninstall 卸载；toolkit skills path 输出包根

# 方式二：上游安装器（技能走 GitHub 拉取，与 CLI 是两条供应链）
pnpm dlx skills add fxri-net/toolkit --global
```

**全局面分发目标三层**：主目标 `~/.agents/skills/` → 内置表中「已安装」的各 agent 全局技能目录 → `--dir` 兜底。未安装的 agent 只报告、不凭空造目录。

- **主目标**：由多家 agent 共读，共读清单与判定口径见 [skills 命令 · 作用域](./cli/skills#作用域)
- **`--dir`**：自定义目录只在当次写入，技能增删后需带相同 `--dir` 重跑
- **历史落点**：升级前的 Codex / Pi 落点若仍有登记，`status` 会单列「历史落点残留」提示清理（只提示、不自动删除）

默认**软链**（Windows 用 junction）。⚠️ 软链落点是**写入穿透**形态：改落点文件即改真源，要改技能内容请改真源。

**项目面分发（`--scope project`）**：真源落 `<仓库根>/.agents/skills/`（完整副本），其余已存在的候选目录各放每个技能一份**入口薄壳**指向真源，避免多目录重复；
归属账写 `<仓库根>/.toolkit/state.json`，`prepare` 钩子在 `pnpm install` 时自动刷新，队友 clone 即用。
候选目录清单、逐技能现场状态与卸载口径见 [skills 命令](./cli/skills)。

**与 CLI 的关系**：skills 是规范与流程（独立可用），CLI 是自动校验 / 归档 / 发版的加速器；技能末尾的「可选加速」节列出了对应命令，装了就用、没装技能流程照跑。
安装与共存、命名规范、发布核对清单见 [skills/README.md](https://github.com/fxri-net/toolkit/blob/main/skills/README.md)；
国内网络受限时见 [常见问题](./faq#国内网络优先走哪条渠道)。

## 项目级激活模板

需求：**只在公司项目激活 toolkit 技能，个人项目不被插入**（全局安装 skills 会污染所有项目）。做法二选一：

**路径一 · 项目面分发（推荐，clone 即用）**：项目里以 devDependency 装 CLI，执行 `toolkit skills install --scope project`——
技能真源与入口薄壳一并入库，队友 `pnpm install` 即补齐；个人项目不装 CLI 即不受影响。
`--scope` 缺省时按 CLI 安装位置自动判定（项目内装的走项目面，全局装的走全局面）。

**路径二 · 全局面 + rules 选择性引用**（仓库根放引用文件并提交）：

```markdown
<!-- AGENTS.md（Claude Code / Codex 等通用）或各 agent 的项目 rules 文件 -->
# 本项目协作约定

- 本项目启用 @fxri/toolkit 任务工作流，技能已分发到全局技能目录
- 方案确认后必须落盘为 .tasks 任务文件；确认后收到推进授权即一次建完全部任务档并校验，再按表顺序逐个任务交付提交；多任务 / 多仓方案先出纯展示计划表
```

**个人项目**：不放上述文件即可（兼容 agent 仍可能按 `description` 自动触发）；若希望**稳定**启用，仍建议在项目 rules 中显式声明。
团队项目推荐把上游安装器的 `skills-lock.json` 一并提交，用内置 `toolkit skills install` 时则随包同批分发、无需额外锁文件。

## 隐私脱敏

落盘记录自由文本（任务正文 / 标题、CHANGELOG 条目）时默认脱敏，`owner` 等结构化字段不脱敏；作用范围是**终端展示、导出文件与归档落盘**，`.tasks/active/` 源文件保持原样。

内置规则：`内网URL`（含端口）、`邮箱`、`JWT`、`AWS密钥`、`GitHub密钥`、`GitHub细粒度密钥`、`OpenAI密钥`、`OpenAI项目密钥`、
`Slack密钥`、`Slack应用令牌`、`手机号`、`身份证`、`IPv4`。密钥类规则带长度门槛，避免误伤正常文本。

开关为双向三档（CLI `--redact/--no-redact` > 环境变量 `FX_REDACT` > 配置 `redact.enabled` > 默认开启）。
自定义规则与本地层「整段替换非追加」的合并语义见[配置参考 · redact](./config/redact)。

## 多语言 CHANGELOG

封装 changesets，内置 `zh` / `en`，任意语言可配置扩展（差异只在语言表，结构为 `groups` / `replacements` / `deps` / `released` 四段，
见[配置参考 · changelog](./config/changelog)）。

```bash
pnpm exec toolkit changelog add                # 创建变更集（等价 changeset）
pnpm exec toolkit changelog version            # 发版 + 自动语义分组归类与组标题格式化（默认中文）
pnpm exec toolkit changelog format --lang ja   # 指定语言仅格式化
pnpm exec toolkit changelog format --history   # 连带追溯改写历史版本块
pnpm exec toolkit changelog doc                # 生成/更新文档站更新日志镜像
```

`changelog version` 成功后自动同步镜像页（`--no-sync-doc` 关闭）；镜像页由根 `CHANGELOG.md` 剥离 H1 后拼固定页头生成，
路径等可用 `changelog doc` 的 `--from` / `--to` / `--title` / `--outline` 或 `changelogDoc` 配置段覆盖。

**分组语义**：`version` 消费变更集后按条目自带的 `类型：` 前缀归类——**前缀是唯一归类信号**，无 `###` 分组的版本块同样按前缀生成规范分组并剥离前缀，
已分组块内与所属组不符的条目按前缀纠正；无前缀条目按源组标题兜底、无源组时归入其他变更。默认只处理最新一块（`--history` 处理全部）。
语言未声明 `groups` 时不改分组、只剥离可识别前缀；变更集条目缺前缀时软告警。前缀只作归类信号，归类后不再保留。

⚠️ `changelog` 的选项写在各自子命令之后（`format --history`、`version --lang en`）。
⚠️ 跨语言边界：语言在**首次归组时确定**，换语言重跑不会重新归组既有块；确需改语言只能用 `replacements` 写死「源标题 → 目标标题」映射。

## 文档站部署

文档站（VitePress）固定部署在 GitHub Pages，push main 自动构建发布：

| 平台 | 站点 | 方式 |
| --- | --- | --- |
| GitHub Pages | https://fxri-net.github.io/toolkit/ | `deploy-docs.yml` workflow，push main 自动构建部署（`VITEPRESS_BASE=/toolkit/`） |

构建统一为 `pnpm docs:build`，站点根路径由 `VITEPRESS_BASE` 适配；
默认「在 GitHub 上编辑此页」与 sitemap / og 回链 GitHub 主仓库，值经 `SITE_URL` / `REPO_URL` 环境变量注入，不写进仓库源码。

## 升级与版本兼容

- 环境要求 Node.js >= 20.19.0（22 线为 >= 22.12.0）；Node 18 与 20.0–20.18 可安装，
  但 `changelog` 依赖 changesets 的子命令不可用（上游 `human-id` ESM-only 限制）
- 升级：`pnpm add -g @fxri/toolkit`——默认软链模式下技能随 CLI 自动更新；副本形式需重跑 `toolkit skills install`；
  项目面由 `prepare` 钩子自动刷新；**升级后开新会话**使 AI 侧技能与 CLI 版本对齐
- 1.7.0 起 CLI 内置升级检查提示；1.15.0 起收敛为统一提示：命令成功时按 `updateCheck.notify`（默认 `always`）在结尾给出一句话，
  TTY 走 stderr、非 TTY 走 stdout，帮助 / 版本 / JSON / 透传子命令不输出（见[配置参考 · updateCheck](./config/update)）
- 不希望发起请求时设 `FX_NO_UPDATE_CHECK=1` 或配置 `updateCheck.enabled: false`

## 相关页面

- 参考：[快速开始](./getting-started) · [配置参考](./config) · [常见问题](./faq)
