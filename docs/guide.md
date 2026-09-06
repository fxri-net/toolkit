# 完整攻略

> 目标读者：已在项目中装好本工具、想了解完整工作流与进阶用法的用户。

## 解决什么问题

新手指南只覆盖最短路径；本篇回答日常使用的全部问题：任务从哪来、哪些文件进 git、怎么让 AI 只在某些项目激活、会话上下文怎么跨会话保留、CHANGELOG 怎么维护多语言、文档站怎么部署。

## 工作流总览

```
方案确认 → 落盘建档(.tasks/active/) → 执行开发 → tasks check 校验
        → 任务完成：标记 status/completed → tasks archive 归档
        → 规范沉淀(.tasks/conventions.md，能力终点)
```

后续动作（项目自主，非必经步骤，是否执行取决于全局 / 个人 / 项目规则约定）：

```
提交代码（先归档与沉淀、后 git commit，同一提交） → changelog 建变更集 → changelog version → tag → publish
```

人可以直接执行命令；AI 侧装了技能包后，上述每一步都有对应的技能流程（见 [AI 技能包](#ai-技能包)）。

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
└── conventions.md             # 项目协作规范（可选）：从任务提炼的规范沉淀地，
                               # 由 fxri-plan-to-task 归档时与 fxri-session-recap 收尾时维护
```

`conventions.md` 不是任务文件：tasks 各子命令不读取它、check 不因它告警；它只作 AI 协作时的规范源，写入前需用户确认。

### frontmatter 字段

| 字段 | 说明 |
| --- | --- |
| `owner` | 负责人（git 用户名） |
| `status` | `待办` / `进行中` / `阻塞` / `已完成` / `已放弃`（后两者为可归档终结态） |
| `created` | 创建日 `YYYYMMDD`，必须等于文件名日期前缀 |
| `updated` | 更新日 `YYYYMMDD` |
| `completed` | 完成时间 `YYYY-MM-DD HH:mm`，终结态必填；按四级时间源取证（当场打点 / 聊天记录时间戳 / git 提交时间 / 系统当前时间兜底并标注「收尾补记」） |
| `depends_on` | 依赖任务文件名数组 |

### 归档规则要点

- 归档触发是人工/事件驱动（若提交代码，须在 git 提交前），`已完成`/`已放弃` 且带 `completed` 才可归档
- 归档文件按完成日期聚合、任务块按完成时间降序；`toolkit tasks archive` 自动完成并加排他锁防并发
- 归档块完成时间可以早于归档动作时间（补档 / 历史修正场景），`toolkit tasks normalize --fix` 会把漂移块自动迁移到与完成时间一致的归档文件
- `toolkit tasks normalize` 检查归档块元数据、日期漂移、排序、时间异常（完成时间晚于当前系统时间或恰为零点整），`--fix` 自动修复（时间异常需人工确认，不自动改值）

## 方案落盘工作流

任务文件的来源是**已确认的实施方案**，不是临时想法：

1. **先查后写**：新建任务前先 `toolkit tasks` 查 active 总览、核对 archive，同一需求共用一个任务文件，禁止重复建档
2. **建档**：在 `active/{YYYYMM}/` 下按命名规范创建任务文件，frontmatter 用模板填空（AI 用户直接说「把方案落盘为任务」）
3. **过程更新**：状态沿 待办 → 进行中 → 阻塞 →（已完成 | 已放弃）流转；方案里的「待实施/待核对」子项拆为独立任务，不留游离待办（`check` 会扫描）
4. **收口**：终结态补 `completed`（按四级时间源取证），归档即工作流中间步骤；归档后做任务级规范沉淀检查，归档 + 沉淀即流程终点；提交、发版、推送不是必经步骤，由全局 / 个人 / 项目规则约定决定

## Git 纳管范围

| 路径 | 是否入库 | 原因 |
| --- | --- | --- |
| `.tasks/`（active + archive + conventions.md） | ✅ 必须 | 任务记录是团队共享的工作记忆，离了 git 就失去多人协作意义 |
| `.toolkitrc.json` | ✅ 建议 | 团队统一脱敏、告警、语言配置 |
| `.archive.lock` | ❌ 忽略 | 运行时排他锁，无共享价值 |
| 导出产物（`tasks.csv` 等） | 按需 | 一般为临时分析产物，默认忽略 |

`toolkit init` 会生成 `.tasks/` 骨架并追加 `.gitignore` 片段（含 `.archive.lock`）。

⚠️ 活跃任务不提交（长期只在本机）是常见反模式：换机器/换会话后任务记录即丢失，且 `check`/归档流程依赖的上下文无从恢复。

**任务区放项目外**：不想把 `.tasks/` 放在项目里的团队，可配置 `"tasks": { "dir": "../my-tasks-repo" }`（1.7.0 新增）把任务区指向独立文档仓库（支持绝对路径或 `../` 相对路径）；任务记录提交到该独立仓库，`.toolkitrc.json` 仍在项目内提交并声明外置路径。

## 项目级激活模板

需求：**只在公司项目激活 toolkit 技能，个人项目不被插入**（全局安装 skills 会污染所有项目）。

做法：技能全局装一次，项目内用 rules/AGENTS 文件选择性引用。

**公司项目**（仓库根放引用文件并提交）：

```markdown
<!-- AGENTS.md（Claude Code / Codex 等通用）或各 agent 的项目 rules 文件 -->
# 本项目协作约定

- 本项目启用 @fxri/toolkit 任务工作流，技能清单见 .agents/skills/（pnpm dlx skills add fxri-net/toolkit 安装后生成，npm 用户的等价命令是 npx skills add）
- 方案确认后必须落盘为 .tasks/ 任务文件；若提交代码：先归档与沉淀、后提交，归档文件与代码变更同一提交
```

**个人项目**：不放上述文件即可，全局技能目录里的 fxri 技能不会被引用（agent 按 description 按需加载，未在项目 rules 中声明的技能不会自动介入）。

团队项目推荐把 `pnpm dlx skills add fxri-net/toolkit` 生成的 `skills-lock.json` 一并提交，保证成员与 AI 侧技能版本一致。

## AI 技能包 skills

零依赖 Agent Skills（纯 Markdown），遵循 [Agent Skills 开放标准](https://agentskills.io)，可被 Claude Code、Cursor、Codex、Gemini CLI、Trae 等兼容 agent 按需加载。

| 技能 | 用途 |
| --- | --- |
| `fxri-plan-to-task` | 方案落盘：先查后写 → 建档 → 校验 → 归档 → 任务级规范沉淀（能力终点） |
| `fxri-release-changelog` | changesets 发版与多语言 CHANGELOG 维护 |
| `fxri-session-recap`（1.7.0 新增，1.8.0 扩展） | 会话收尾全量沉淀 + 规范沉淀 / 新会话三层恢复 / 历史任务时间批量修正 |

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
任务终结 → 归档 → 规范沉淀（.tasks/conventions.md，硬终点） → 提交/发版/推送（可选，需用户确认）
```

### 会话沉淀（收尾执行）

- **全量回放**本会话 → **事前核对清单交用户确认无遗漏**（防切会话漏档）→ 逐条落盘/更新任务文件 → 归档 → 会话级规范沉淀 → 回报清单
- 决策及其理由必须记；未尽事项拆独立任务
- 提示词示例：「会话要结束了，把本次结论归档」「今天先到这，收个尾」

### 恢复上下文（新会话开场）

- **三层恢复**：L0 全量索引（active + archived 全部，一行一条 + 统计）→ L1 active 全文精读 → L2 近窗归档精读
- **近窗按时间连续性判定**：只精读从最新归档向前连续活跃的一段（月份 ≤6 或块 ≤200）；被 ≥1 年空洞隔断的旧归档只入 L0 索引、不精读、不列为「最近完成」
- **搁置识别**：active 任务 `updated` 距今 >1 年标注「疑似搁置」，不当进行中呈现
- 更早历史按需拉取；读 conventions.md 纳入「规范现场」；全程只读
- 提示词示例：「新会话开始，恢复上下文」「上次做到哪了」

### 批量修正历史任务时间

- 对照 git log 与聊天记录时间戳**取证** → 清单交用户确认 → 改归档块完成时间 → `toolkit tasks normalize --fix` 自动迁移到正确日期文件 → 只读核验
- 提示词示例：「修正历史任务时间」「历史归档时间不对」

### conventions.md：规范沉淀地

从任务与会话中提炼的项目协作规范写入 `.tasks/conventions.md`（非任务文件，tasks 命令不读取、check 不告警；每条带来源任务与日期，写入前需用户确认）。一次性决策留在任务正文，不升格为规范。

## 隐私脱敏

落盘记录自由文本（任务正文/标题、CHANGELOG 条目）时默认脱敏敏感信息，`owner` 等结构化字段不脱敏。作用范围：**终端展示、导出文件与归档落盘**；`.tasks/active/` 源文件保持原样。

内置规则：邮箱、手机号、身份证、IPv4、含端口内网 URL、JWT、GitHub Token（经典与细粒度）、OpenAI API Key（经典与项目级）、Slack Token。密钥类规则带长度门槛，避免误伤正常文本。

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
pnpm exec toolkit changelog version            # 发版 + 自动分组标题格式化（默认中文）
pnpm exec toolkit changelog --lang ja format   # 指定语言仅格式化
```

每个语言的三段结构：`replacements`（标题替换映射）、`deps`（依赖更新条目文案）、`released`（发布日期后缀）。`version` 消费变更集后自动转换分组标题（如 `### Patch Changes` → `### 🐛 补丁修复`）并补发布日期；变更条目建议人工再润色，与仓库既有风格一致。

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
- 升级：`pnpm i -g @fxri/toolkit && pnpm dlx skills update --global`（npm 用户把 `pnpm i -g` 换成 `npm i -g`、`pnpm dlx` 换成 `npx` 即可），**升级后开新会话**使 AI 侧技能与 CLI 版本对齐
- 1.7.0 起 CLI 内置升级检查提示（命令末尾异步查询 registry，静默失败不打扰）；不希望发起请求时设 `FX_NO_UPDATE_CHECK=1` 或配置 `updateCheck.enabled: false`（见[配置参考](./config#updatecheck升级检查提示-170-新增)）
