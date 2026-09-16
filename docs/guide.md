# 完整攻略

> 目标读者：已在项目中装好本工具、想了解完整工作流与进阶用法的用户。

## 解决什么问题

新手指南只覆盖最短路径；本篇回答日常使用的全部问题：任务从哪来、哪些文件进 git、怎么让 AI 只在某些项目激活、会话上下文怎么跨会话保留、CHANGELOG 怎么维护多语言、文档站怎么部署。

## 工作流总览

```
方案确认 → 落盘建档(.tasks/active/) → 执行开发 → tasks check 校验
        → 任务完成：标记 status/completed → tasks archive 归档
        → 规范沉淀(.tasks/conventions/，能力终点)
```

后续动作（项目自主，非必经步骤，是否执行取决于全局 / 个人 / 项目规则约定）：

```
提交代码（先归档与沉淀、后 git commit，同一提交） → changelog 建变更集 → changelog version → tag → publish
```

人可以直接执行命令；AI 侧装了技能包后，上述每一步都有对应的技能流程（见 [AI 技能包](#ai-技能包-skills)）。

## 任务文件规范

> 完整规范以仓库根 [SPEC.md](https://github.com/fxri-net/toolkit/blob/main/SPEC.md) 为单一事实源，此处为日常速查。

### 目录结构

```
.tasks/
├── active/                    # 实时任务（未完成）
│   └── {YYYYMM}/              # 按月分目录，如 202609
│       └── {YYYYMMDD}-{用户名}-{任务简述}.md
├── archive/                   # 已归档任务
│   └── {YYYYMM}/
│       └── {YYYYMMDD}.md      # 按完成日期聚合，任务块降序
└── conventions/               # 项目协作规范载体（可选）：从任务提炼的规范沉淀地
    ├── index.md               # 唯一入口与唯一权威：端清单 + 每条规范一行指针（常驻读）
    ├── common.md              # 全端通用条文（按需创建）
    └── <端名>.md              # 各端专有条文，端名 = 任务 scope 取值（按需创建）
```

`conventions/` 不是任务文件：tasks 各子命令不读其内容、check 不因内容告警；它只作 AI 协作时的规范源，由 fxri-plan-to-task 归档时与 fxri-session-recap 收尾时维护，写入前需用户确认。

### frontmatter 字段

| 字段 | 说明 |
| --- | --- |
| `owner` | 负责人（git 用户名） |
| `status` | `待办` / `进行中` / `阻塞` / `已完成` / `已放弃`（后两者为可归档终结态） |
| `created` | 创建日 `YYYYMMDD`，必须等于文件名日期前缀 |
| `updated` | 更新日 `YYYYMMDD` |
| `completed` | 完成时间 `YYYY-MM-DD HH:mm`，终结态必填；按四级时间源取证（当场打点 / 聊天记录时间戳 / git 提交时间 / 系统当前时间兜底并标注「收尾补记」） |
| `depends_on` | 依赖任务文件名数组 |
| `scope` | 影响范围；多值以半角加号分隔（如 `toolkit+lxgl-web`），顿号/逗号列表属误写会触发 check 软告警 |

### 归档规则要点

- 归档触发是人工/事件驱动（若提交代码，须在 git 提交前），`已完成`/`已放弃` 且带 `completed` 才可归档
- 归档块是终结记录：不追加新的工作内容（延续 / 扩展走新任务并标注来源链）；唯一例外是**事实更正**——后续核实推翻原块结论时，在其正文末尾追加「修订记录」（保留原结论、不动元数据行、附更正时刻与依据）
- 归档文件按完成日期聚合、任务块按完成时间降序；**块间的 `---` 是任务块的唯一权威边界**（块标题行与元数据行均为校验项，不承担分块职责），`toolkit tasks archive` 自动完成并加排他锁防并发（检测到并发时跳过并告警；持有进程已退出或锁龄超上限的残留锁自动接管，不会永久阻塞）
- 归档块完成时间可以早于归档动作时间（补档 / 历史修正场景），`toolkit tasks normalize --fix` 会把漂移块自动迁移到与完成时间一致的归档文件
- `toolkit tasks normalize` 检查归档块元数据、日期漂移、排序、时间异常（完成时间晚于当前系统时间或恰为零点整），`--fix` 自动修复（时间异常需人工确认，不自动改值）

## 方案落盘工作流

任务文件的来源是**已确认的实施方案**，不是临时想法：

1. **动手前置建档评估（先查后写）**：动手改仓库文件前先 `toolkit tasks` 查 active 总览、核对 archive——active 有同主题更新原文件；archive 有同主题时看**本次是否产生仓库文件改动**：无改动（重复提议 / 重复执行）不重复建档，有改动（延续 / 扩展 / 重新实现）重新建档并标注来源链；均无则建档后再动手。改动口径 = 需写入版本控制的工作区文件的增 / 改 / 删（纯读取、纯执行、纯汇报不计入）。归档块不可变，延续需求走新任务；唯一例外是**事实更正**——后续核实推翻原块结论时，在其正文末尾追加「修订记录」（保留原结论、不动元数据行、附更正时刻与依据）
2. **建档**：在 `active/{YYYYMM}/` 下按命名规范创建任务文件，frontmatter 用模板填空（AI 用户直接说「把方案落盘为任务」）
3. **过程更新**：状态沿 待办 → 进行中 → 阻塞 →（已完成 | 已放弃）流转；方案里的「待实施/待核对」子项拆为独立任务，不留游离待办（`check` 会扫描）
4. **收口**：终结态补 `completed`（按四级时间源取证），归档即工作流中间步骤；归档后做任务级规范沉淀检查，归档 + 沉淀即流程终点；提交、发版、推送不是必经步骤，由全局 / 个人 / 项目规则约定决定。⚠️ **动作不算、改动才算**：收尾动作（提交、发版、推送、部署）本身及其固有产物（版本号、更新日志、标签）不构成任务、不单独建档；这些动作过程中若出现需改仓库文件才能修复的缺陷，该修复按普通任务建档

## Git 纳管范围

| 路径 | 是否入库 | 原因 |
| --- | --- | --- |
| `.tasks/`（active + archive + conventions/） | ✅ 必须 | 任务记录是团队共享的工作记忆，离了 git 就失去多人协作意义 |
| `.toolkitrc.json` | ✅ 建议 | 团队统一脱敏、告警、语言配置 |
| `.archive.lock` | ❌ 忽略 | 运行时排他锁，无共享价值 |
| 导出产物（`tasks.csv` 等） | 按需 | 一般为临时分析产物，默认忽略 |

`toolkit init` 会生成 `.tasks/` 骨架并追加 `.gitignore` 片段（含 `.archive.lock`）。

⚠️ 活跃任务不提交（长期只在本机）是常见反模式：换机器/工作区被 git 清理后任务记录即丢失（同机同目录换会话不受影响——恢复读磁盘 `.tasks/` 文件而非 git），且 `check`/归档流程依赖的上下文无从恢复。

**任务区放项目外**：不想把 `.tasks/` 放在项目里的团队，可配置 `"tasks": { "dir": "../my-tasks-repo" }`（1.7.0 新增）把任务区指向独立文档仓库（支持绝对路径或 `../` 相对路径）；任务记录提交到该独立仓库，`.toolkitrc.json` 仍在项目内提交并声明外置路径。

## 项目级激活模板

需求：**只在公司项目激活 toolkit 技能，个人项目不被插入**（全局安装 skills 会污染所有项目）。

做法：技能全局装一次，项目内用 rules/AGENTS 文件选择性引用。

**公司项目**（仓库根放引用文件并提交）：

```markdown
<!-- AGENTS.md（Claude Code / Codex 等通用）或各 agent 的项目 rules 文件 -->
# 本项目协作约定

- 本项目启用 @fxri/toolkit 任务工作流，技能已由 `toolkit skills install` 分发到全局技能目录（`toolkit skills path --format json` 可查包根、真源目录与技能清单）
- 方案确认后必须落盘为 .tasks/ 任务文件；若提交代码：先归档与沉淀、后提交，归档文件与代码变更同一提交
```

**个人项目**：不放上述文件即可，全局技能目录里的 fxri 技能不会被引用（agent 按 description 按需加载，未在项目 rules 中声明的技能不会自动介入）。

团队项目推荐把上游安装器（`pnpm dlx skills add fxri-net/toolkit`）生成的 `skills-lock.json` 一并提交，保证成员与 AI 侧技能版本一致；用内置 `toolkit skills install` 分发时技能随包同一发布批次分发（技能内容版本独立编号），无需额外锁文件。

## AI 技能包 skills

零依赖 Agent Skills（纯 Markdown），遵循 [Agent Skills 开放标准](https://agentskills.io)，可被 Claude Code、Cursor、Codex、Gemini CLI、Trae 等兼容 agent 按需加载。

| 技能 | 版本 | 用途 |
| --- | --- | --- |
| `fxri-plan-to-task` | 1.3.2 | 方案落盘：建档评估（先查后写）→ 建档 → 校验 → 归档 → 任务级规范沉淀（能力终点）；规范载体迁移 |
| `fxri-release-changelog` | 1.1.1 | changesets 发版与多语言 CHANGELOG 维护 |
| `fxri-session-recap` | 1.2.2 | 会话收尾全量沉淀 + 规范沉淀 / 新会话三层恢复 / 历史任务时间批量修正 |

版本号取自各 SKILL.md 的 frontmatter `metadata.version`（`toolkit skills status` 打印的真源版本），随技能内容变更递增；`fxri-session-recap` 为 1.7.0 新增

**安装**（两种方式，选一）：

```bash
# 方式一：装了 CLI 一键分发（推荐，技能随包分发，与 CLI 同一发布批次）
toolkit skills install     # 默认软链真源，链接创建失败自动降级副本；--copy 强制副本、--dry-run 预演
toolkit skills status      # 查现场；toolkit skills remove 卸载；toolkit skills path 输出包根

# 方式二：上游安装器（技能走 GitHub 拉取，与 CLI 是两条供应链）
pnpm dlx skills add fxri-net/toolkit --global
```

分发目标三层：主目标 `~/.agents/skills/`（多家 agent 共读）→ 内置表中「已安装」的各 agent 全局技能目录 → `--dir` 兜底；未安装的 agent 只报告、不凭空造目录。默认软链（Windows 用 junction，免管理员、免开发者模式），可被各 agent 直接读取。

**与 CLI 的关系**：skills 是规范与流程（独立可用），CLI 是自动校验/归档/发版的加速器。技能文件末尾的「可选加速」节列出了对应 CLI 命令——装了就用，没装技能流程照跑。

安装与共存、命名规范、发布核对清单见 [skills/README.md](https://github.com/fxri-net/toolkit/blob/main/skills/README.md)；GitHub 拉取受限（国内网络/内网）时见 [FAQ · 国内网络优先走哪条渠道](./faq#国内网络优先走哪条渠道)。

## 会话沉淀、恢复与历史修正

**核心边界**：AI 的新会话读不到其他会话的内部上下文（所有 agent 的共性约束），对话记录本身不可作为跨会话记忆。本工具的解法是把记忆**沉淀进仓库文件**（`.tasks/`），由 `fxri-session-recap` 技能承载完整流程。

### 四级时间源

「会话当时的真实时间」不可凭空估算。任何时间字段按以下优先级取证：

| 级 | 时间源 | 取证 |
| --- | --- | --- |
| 0 | 任务完成当场打点（首选） | 完成时立即执行命令取时间 |
| 1 | 聊天记录准确时间戳 | 用户贴过的日志/终端输出时间戳、用户口述的确定时刻 |
| 2 | 任务改动 git 提交时间 | `git log --format="%h %ci"` |
| 3 | 系统当前时间兜底 | 当场取时 + 正文标注「时间为收尾补记」 |

### 统一收尾链路（能力终点 = 沉淀）

```
任务终结 → 归档 → 规范沉淀（.tasks/conventions/，硬终点） → 提交/发版/推送（可选，需用户确认）
```

### 会话沉淀（收尾执行）

- **全量回放**本会话 → **事前核对清单交用户确认无遗漏**（防切会话漏档）→ 逐条落盘/更新任务文件 → 归档 → 会话级规范沉淀 → 回报清单
- 决策及其理由必须记；未尽事项拆独立任务
- 提示词示例：「会话要结束了，把本次结论归档」「今天先到这，收个尾」

### 恢复上下文（新会话开场）

- **三层恢复**：L0 全量索引（active + archived 全部，一行一条 + 统计）→ L1 active 全文精读 → L2 近窗归档精读
- **近窗按时间连续性判定**：只精读从最新归档向前连续活跃的一段（月份 ≤6 或块 ≤200）；被 ≥1 年空洞隔断的旧归档只入 L0 索引、不精读、不列为「最近完成」
- **搁置识别**：active 任务 `updated` 距今 >1 年标注「疑似搁置」，不当进行中呈现
- 更早历史按需拉取；读 conventions 载体（常驻只读 `index.md`，再按任务 `scope` 命中加载分册与 `common.md`）纳入「规范现场」；全程只读
- 提示词示例：「新会话开始，恢复上下文」「上次做到哪了」

### 批量修正历史任务时间

- 对照 git log 与聊天记录时间戳**取证** → 清单交用户确认 → 改归档块完成时间 → `toolkit tasks normalize --fix` 自动迁移到正确日期文件 → 只读核验
- 提示词示例：「修正历史任务时间」「历史归档时间不对」

### conventions/：规范沉淀地

从任务与会话中提炼的项目协作规范写入 `.tasks/conventions/`（非任务文件，tasks 命令不读其内容、check 不因内容告警；每条带来源任务与日期，写入前需用户确认）。一次性决策留在任务正文，不升格为规范。

```
.tasks/conventions/
├── index.md      # 唯一入口与唯一权威（常驻读）：端清单 + 每条规范一行指针
├── common.md     # 全端通用条文（按需创建）
└── <端名>.md     # 各端专有条文（按需创建）
```

**端名与端清单**：端名与任务 frontmatter 的 `scope` 取值**逐字一致**（任务写 `scope: web+server` → 加载 `web.md` + `server.md`），故不设全局词表，风格随项目既有 `scope` 写法；保留字 `index` / `common` 不作端名。端由 `index.md` 顶部「端清单」节显式声明，是端的**唯一权威**（不扫目录——扫目录会漏掉暂时无条目的端，也会把临时文件误判成端）。分册**按需创建**，判据是「该归属下有无需独立承载的条文」，不设条数阈值——溯源索引式项目可能始终只有 `index.md`。

**读写分层**：读取常驻只读 `index.md`（端清单 + 索引），再按当前任务 `scope` 命中加载对应分册并叠加 `common.md`（`scope` 中的非端值视为分类标签静默跳过，空 `scope` 只加载 `common.md`）；写入先问「是否**所有端都适用**」，是则归 `common`，否则逐端确认后入命中的端分册——禁止跨端合并归属（真全端升 `common`，只适用几端则各端各记一条），`common` 是「所有端」而非「不确定归哪端」的暂存区。索引表「归属」列取值必须落在 `common` 或端清单内，否则为悬空指针。

**两种形态**（差异在分册是否存在与「单一事实源」列取值，不是结构二选一，同项目可混用）：
- **条文式**（无其他规则文件的项目）：条文全文写入对应归属分册，本载体即项目唯一规范载体
- **溯源索引式**（已用 AGENTS / 全局规则的项目）：不复制条文，只记「确立了什么、谁确立的、条文去哪看」，内容以各单一事实源（skills / AGENTS / 全局规则）最新版为准

**内容修订**：语义变更先在 `index.md` 的「演进记录」留痕、再更新索引行当前语义；规则作废把索引行状态改 `已废弃`，不删行、不删分册条目。

### 存量规范载体迁移

存量项目若已有旧单文件 `.tasks/conventions.md`，说一句「把项目里的 conventions.md 迁到新形态」即可，AI 走三段式（**可中断，中途停下不丢内容**）：

1. **机器搬骨架**：建 `conventions/` 目录，旧文件**整体**搬为 `index.md`（原文一字不丢），删旧文件——此刻 `index.md` 是原文快照，功能上与旧文件等价
2. **AI 提归属建议**：读原有条目，逐条给出「`common` / 某端」建议与理由（旧文件无端信息，语义分流无法机械完成），形成待确认清单
3. **用户逐条确认**：确认后写索引行、把条文全文拆入对应分册；**未确认的条目保持原样留在 `index.md`**，不强推

迁移期间新旧兼容读：先找 `conventions/index.md`，不存在再看旧单文件 `conventions.md`（存在则提示可迁移）；两者并存时以目录形态为准并提示清理旧文件。`toolkit tasks check` 在旧单文件残留或 `conventions/` 缺 `index.md` 时给软告警，即为迁移入口；`toolkit init` 在无旧单文件时预先生成 `index.md` 骨架。

## 隐私脱敏

落盘记录自由文本（任务正文/标题、CHANGELOG 条目）时默认脱敏敏感信息，`owner` 等结构化字段不脱敏。作用范围：**终端展示、导出文件与归档落盘**；`.tasks/active/` 源文件保持原样。

内置规则：`内网URL`（含端口）、`邮箱`、`JWT`、`AWS密钥`、`GitHub密钥`、`GitHub细粒度密钥`、`OpenAI密钥`、`OpenAI项目密钥`、`Slack密钥`、`Slack应用令牌`、`手机号`、`身份证`、`IPv4`。密钥类规则带长度门槛，避免误伤正常文本。

```json
// .toolkitrc.json：追加自定义规则（优先于内置）或按 name 禁用内置规则
{
  "redact": {
    "enabled": true,
    "disable": ["手机号"],
    "rules": [
      { "name": "自定义码", "pattern": "cod-[0-9]{6}", "flags": "i", "replacement": "cod-******" }
    ]
  }
}
```

开关为双向三档（CLI `--redact/--no-redact` > 环境变量 `FX_REDACT` > 配置 `redact.enabled` > 默认开启）。字段级说明见[配置参考](./config)。

## 多语言 CHANGELOG

封装 changesets，内置 `zh` / `en`，任意语言可配置扩展：

```json
{
  "changelog": {
    "languages": {
      "ja": {
        "groups": [
          { "slot": "breaking", "title": "### 🚨 重大変更" },
          { "slot": "added", "title": "### ✨ 新規機能" },
          { "slot": "fixed", "title": "### 🐛 不具合修正" },
          { "slot": "other", "title": "### 📦 その他" }
        ],
        "replacements": { "### Major Changes": "### 🚨 重大変更" },
        "deps": "- 依存関係を更新",
        "released": "リリース"
      }
    }
  }
}
```

```bash
pnpm exec toolkit changelog                    # 创建变更集（等价 changeset）
pnpm exec toolkit changelog version            # 发版 + 自动语义分组归类与组标题格式化（默认中文）
pnpm exec toolkit changelog --lang ja format   # 指定语言仅格式化
pnpm exec toolkit changelog --history format   # 连带追溯改写历史版本块
```

每个语言为四段结构：`groups`（语义分组表，可选）/ `replacements`（兜底替换映射）/ `deps`（依赖更新条目文案）/ `released`（发布日期后缀）。`version` 消费变更集后按条目自带的 `类型：` 前缀做语义分组（如 `- 修复：xxx` → `### 🐛 问题修复`），无前缀条目按所属源组标题兜底；分组维度与版本号维度正交，分组标题集合随版本演进、历史版本块默认不追溯改写（加 `--history` 可把历史块一并追溯重排为当前口径）；变更条目建议人工再润色，与仓库既有风格一致。前缀只作归类信号、分组后不再保留——归类完成即剥离条目的 `类型：` 前缀（类型由分组标题承接），未识别前缀与依赖源条目原样保留；变更集条目缺 `类型：` 前缀时软告警提示。

⚠️ `changelog` 域开了选项透传，自有选项须写在子命令**之前**（`toolkit changelog --history format` 生效，`toolkit changelog format --history` 会被静默忽略）。

⚠️ 跨语言边界：语言在**首次归组时确定**——标题→槽位的反查只认目标语言自己的 `groups[].title` 与历史组标题表（无跨语言别名），故换语言重跑时，既有块的组标题不会被重新归组，识别不到的分组原样保留（`--history` 追溯同理）。确需把既有块标题改成另一种语言，只能在 `replacements` 里写死「源标题 → 目标标题」的原文映射（纯文本替换，不参与语义归组）。

## 文档站部署

文档站（VitePress）固定部署在 GitHub Pages，push main 自动构建发布：

| 平台 | 站点 | 方式 |
| --- | --- | --- |
| GitHub Pages | https://fxri-net.github.io/toolkit/ | `deploy-docs.yml` workflow，push main 自动构建部署（`VITEPRESS_BASE=/toolkit/`） |

构建统一为 `pnpm docs:build`，站点根路径由 `VITEPRESS_BASE` 环境变量适配子路径要求。

**站点回链**：默认「在 GitHub 上编辑此页」与 sitemap/og 回链 GitHub 主仓库，值经 `SITE_URL` / `REPO_URL` 环境变量注入，不写进仓库源码。

## 升级与版本兼容

- 环境要求 Node.js >= 20
- Node 18 可安装，但 `changelog` 依赖 changesets 的子命令不可用（上游 `human-id` ESM-only 限制）
- 升级：`pnpm add -g @fxri/toolkit`（npm 用户换成 `npm i -g @fxri/toolkit`）——默认软链模式下技能指向包内真源，随 CLI 自动更新；副本形式需重跑 `toolkit skills install`；**升级后开新会话**使 AI 侧技能与 CLI 版本对齐
- 1.7.0 起 CLI 内置升级检查提示（同步读本地缓存提示，缓存不新鲜时由分离的后台子进程静默刷新 registry，不阻塞命令、静默失败不打扰）；不希望发起请求时设 `FX_NO_UPDATE_CHECK=1` 或配置 `updateCheck.enabled: false`（见[配置参考](./config#updatecheck-升级检查提示-1-7-0-新增)）
