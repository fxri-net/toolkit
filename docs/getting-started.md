# 快速开始

> 目标读者：第一次接触本工具的用户（人或 AI）。读完能跑通「安装 → 接入 → 建档 → 归档」最短路径，并知道去哪查更细的内容。
> 不确定自己属于哪类？先看[适用场景](./scenarios)对号入座，再回来按本节操作。

本工具用一套**纯 Markdown 任务文件 + 一条 CLI**，把方案、决策与规范留在仓库里，而不是随会话消失；
发版 CHANGELOG 的写法见[完整攻略 · 多语言 CHANGELOG](./guide#多语言-changelog)。

## 30 秒上手

```bash
pnpm add -g @fxri/toolkit  # 首次安装；npm / yarn / bun 与内网装法见下文「完整安装」
toolkit setup              # 接入本机：装技能、配规则、设生效范围（交互向导，任意目录可执行）
```

**接好之后不必再记命令。** 进项目首次用到时，技能会自行初始化任务区与规范载体；
建档、格式校验、归档与规范沉淀随你的工作自动完成，你照常说需求、确认方案即可。

想看一眼进度时问一句「现在有哪些没做完的任务」。确实需要手工兜底时，等价命令是
`toolkit task init`（初始化）、`toolkit task check`（校验）、`toolkit task archive`（归档），
文件名与 frontmatter 规范见[完整攻略 · 任务文件规范](./guide#任务文件规范)。

> 项目内安装（devDependency）时把 `toolkit` 换成 `pnpm exec toolkit`（npm 用户 `npx toolkit`）。

⚠️ `toolkit task init` 为 1.7.0 新增；旧版本请手工建 `.tasks/active/{YYYYMM}/` 目录结构。

> 不想把 `.tasks/` 放项目里？配置 `"task": { "dir": "../my-tasks-repo" }` 指向独立仓库（或每次用 `--dir` 传参）。
> 详见[配置参考 · 校验与任务区](./config/check-tasks)。

## 完整安装

> 环境要求：Node.js >= 18.17.0（Node 18 已 EOL，仅保证可运行）。

三种方式按场景选一：**个人多项目默认方式一「双全局」**——工具全局装 + skills 全局装（见下文 skills 安装），
所有项目开箱即用、升级各一条命令；**团队项目推荐方式二 devDependency**（版本随仓库锁定，成员与 CI 自动一致）。

### 方式一：全局安装（个人多项目默认）

```bash
pnpm add -g @fxri/toolkit      # pnpm（bin 落在 pnpm home，不受 nvm 切版本影响）
npm add -g @fxri/toolkit       # npm（bin 硬链在 Node 目录，切版本需重装）
yarn global add @fxri/toolkit  # yarn 1.x；2+ 无全局安装，改用 yarn dlx
bun add -g @fxri/toolkit       # bun
```

升级用同一条安装命令即可。各管理器的全局安装语法并不同一（yarn 1.x 是 `global add`、2+ 没有全局安装），上表按管理器列出可直接复制的形式。

配合全局技能分发（`toolkit skill install`）与全局规则组合（`toolkit rule compose`），一次配置所有项目直接可用。

适合个人在多个项目间快速使用。

⚠️ 使用 nvm/fnm 等切换 Node 版本的工具时，npm 的全局包**绑定在安装时的 Node 版本上**，切版本后会「消失」。
重新执行安装命令即可（pnpm 全局目录独立于 Node 版本，或用方式三规避）。

### 方式二：项目 devDependency（团队推荐）

```bash
pnpm add -D @fxri/toolkit
```

- 任务记录、校验、归档随仓库走，团队成员与 AI 会话内 `pnpm exec toolkit`（npm 用户 `npx toolkit`）即可用
- 版本随项目锁定，升级由项目统一决定

没有全局安装的包管理器（yarn 2+ 等）：把 CLI 装成项目 devDependency（`yarn add -D @fxri/toolkit`），
再跑 `yarn toolkit skill install --scope project`——技能真源落 `<仓库根>/.agents/skills/`，随仓库入库、队友 clone 即用；
临时执行可用 `yarn dlx @fxri/toolkit <命令>`。技能落点与包管理器的「全局」概念无关，换管理器不影响技能位置。

### 方式三：不安装、临时执行

```bash
pnpm dlx @fxri/toolkit task  # pnpm
npx @fxri/toolkit task       # npm / yarn
bunx @fxri/toolkit task      # bun
```

零安装先体验。⚠️ 首次执行有下载耗时，且每次都解析最新版本，不适合高频使用。

### 安装方式对比

| | 方式一 全局 | 方式二 devDep | 方式三 临时执行 |
| --- | --- | --- | --- |
| 团队共享版本 | ❌ 各装各的 | ✅ 锁定 | ❌ 总是最新 |
| 离线可用 | ✅ | ✅ | ❌ |
| nvm 切版本影响 | npm ⚠️ 需重装；pnpm ✅ 不受影响 | 无 | 无 |
| 推荐包管理器 | pnpm | pnpm | pnpm dlx |
| 适合场景 | 个人多项目 | 团队/长期项目 | 快速试用 |

### 关于 AI 技能包（skills）

本工具的完整工作流已沉淀为零依赖的 Agent Skills（纯 Markdown 规范），**skills 可以独立工作，不装 CLI 也能让 AI 按同一套规范建档、校验、归档**；CLI 提供的是自动校验、自动归档等加速。

- 推荐两者都装，体验最完整
- 只装 skills：AI 仍能跑通全流程（手工执行规范步骤）
- 只装 CLI：人可以用，但 AI 侧没有规范指引

安装 skills（一条命令，随 CLI 同批分发）：

> 快速接入用 `toolkit setup` 一步完成技能与规则；下面是分面与开关的进阶用法。

```bash
toolkit skill install                  # 全局分发（推荐；技能随包分发，与 CLI 同一发布批次）
toolkit skill install --scope project  # 项目面分发（团队推荐，技能随仓库入库、队友 clone 即用）
```

- **默认**：软链真源，链接创建失败自动降级副本；`--yes` 跳过交互
- **分面与开关**：`status` 查现场、`uninstall` 卸载；`--mode package` 纯包管理器模式、`--no-skills` 仅本次零装
- **外部来源**：`--source <name|path>` 临时纳入（已登记来源名、目录或 Git 地址），`--save` 登记为永久来源

也可用上游安装器（技能走 GitHub 拉取，与 CLI 两条供应链，易版本漂移）：`pnpm dlx skills add fxri-net/toolkit --global`。
完整选项与现场体检见[完整攻略 · AI 技能包](./guide#ai-技能包-skills)，命令契约见 [技能分发](./cli/skill)。

GitHub 拉不下来？国内网络走 [Gitee 镜像渠道](./faq#国内网络优先走哪条渠道)，内网 / 离线安装见 [FAQ · 内网或离线环境怎么装](./faq#内网或离线环境怎么装)。

## 几个术语，先说人话

如果你还没深入研究过 AI 编程生态，先看这张表再看正文（都懂可直接跳过）：

| 术语 | 说人话 |
| --- | --- |
| AI 编程助手 | 装在编辑器里能帮你写代码的工具，如 Trae、Claude Code、Cursor |
| agent | 能自己读文件、跑命令、多步干活的 AI 助手（不是一问一答的聊天机器人） |
| skills（技能） | 给 agent 看的「岗位说明书」：一份 Markdown 文件，写清楚某类工作该怎么做。agent 遇到对应任务时自动照着执行 |
| MCP | agent 连接外部工具的通用插口（本工具不依赖它，知道有这回事即可） |
| CLI | 命令行工具，就是本文的 `toolkit` 命令 |
| 归档 | 把已完成的任务文件从「进行中」目录挪进「已归档」目录，像账本结账 |

一句话关系：**skills 教 AI 怎么做，CLI 帮人（和 AI）做得快**。

## 只想在部分项目生效

默认全域生效：装了全局技能后，所有项目都会命中。需要收窄时用 `toolkit scope`：

```bash
toolkit scope status               # 先看当前目录是否生效、命中的规则与来源
toolkit scope                      # 交互菜单：设范围、管目录、切换配置层
toolkit scope allow ~/work --tree  # 覆盖 ~/work 及其下所有项目（切到 allowlist 模式）
toolkit scope allow --paths ~/work --skill fxri-plan-review --delivery gated # 按策略规则收口
toolkit scope deny --paths ~/work --skill fxri-code-encoding # 排除指定技能
toolkit skill mount ~/work         # 在父目录下的项目里做项目面安装（技能物理落在仓库内）
```

- 旧 `activation` 字段的判定顺序：排除规则 → 排除标记 → 启用标记 → git 远端 → 白名单；不配置即全域生效
- 策略规则（条件 + 技能维度）按层 → 具体度 → `deny` > `allow` → 后写覆盖取唯一命中；旧字段编译为同层策略后一并比较
- 需要「技能壳还在、正文只在激活项目加载」时，用 `skillDelivery` 规则或 `skill install --gate`；矩阵限制的技能会自动如此。要绝对干净则用 `skill mount`
- 命令契约见[作用域](./cli/scope)，配置字段见[作用域配置](./config/activation)

## 配置全局规则

> 快速接入已由 `toolkit setup` 覆盖；本节是单独组合、手动粘贴的进阶用法。

全局规则会整段进入 Agent 上下文，按需组合、只留当前需要的模块：

```bash
toolkit rule compose   # 交互式选择预设或自定义模块，选完自动尝试复制到剪贴板
```

- 预设：`minimal`（极简）/ `recommended`（推荐，默认）/ `full`（全量）；也可选「自定义」逐项勾选
- 非交互环境（脚本 / CI）用 `--preset` 或 `--module`；`toolkit rule list` 查看模块与当前选择
- 组合只输出文本，**需粘贴到所用 Agent 的全局规则入口**（如 Trae 的规则设置、Claude Code 的 `CLAUDE.md`、
  Cursor 的全局 Rules）；入口随工具版本变化，以各工具官方文档为准
- 也可在文档站[规则组合器](./rules/)里勾选模块后一键复制

## AI 用户（让 AI 替你操作）

不需要懂命令，直接对 AI 说：

- 「新项目，先初始化任务区」→ AI 跑 `toolkit task init` 建 `.tasks/` 骨架、`conventions/` 规范载体与技能入口壳，并补齐 `.gitignore` 片段
  - 宿主疑似用 prettier 时另托管 `.prettierignore` 排除任务区，避免格式化器把表格填充出大量空白层
  - 项目本地依赖含 `@fxri/toolkit` 时写入 `prepare` 刷新钩子
  - 逐项报告实际动作
- 「把刚才确认的方案落盘为任务」→ AI 会在 `.tasks/active/` 下建档；方案涉及多个任务或多个仓库时，AI 先出一张纯展示计划表，确认后说「开始」即一次建完全部任务档并校验，再按表顺序逐个交付、逐个提交
- 「任务做完了，归档」→ AI 归档任务并做任务级规范沉淀（终点；提交、发版、推送不是必经步骤，默认按你的规则约定，当次指令已含授权则直接执行）
- 「任务做完了，归档并提交」→ AI 先归档与沉淀、后提交，归档文件与代码变更同一 git 提交
- 「现在有哪些没做完的任务」→ AI 会跑总览给你
- 会话收尾说「会话要结束了，把结论记下来 / 今天先到这」→ AI 全量回放本会话 → 先给你核对任务清单 → 逐条落盘归档 + 规范沉淀（1.7.0 新增技能）
- 新会话开头说「恢复上下文 / 上次做到哪了」→ AI 读 active 全部与近期归档，接上上次现场（1.7.0 新增技能）
- 发现历史任务时间不准时说「修正历史任务时间」→ AI 取证给你逐条确认后修正（1.8.0 新增）

**配好之后要管多少？** 日常零操作：建档、校验、归档与规范沉淀全部由 AI 按全局规则自主完成，AI 干完会回报清单请你确认（防写错仓库文件的安全设计，不是操作负担）。仅三个时刻需要你出手：

1. **首次安装**：安装命令由你执行（AI 规则明确不自行全局安装）
2. **升级**：看到版本提示后执行升级命令并开新会话；从 1.x 升到 2.x 时再跑一次 `toolkit upgrade` 完成工程侧迁移
3. **工具不可用兜底**：AI 会把方案完整输出到对话，由你手动保存

**记录范围**：只沉淀工作产出（功能改动、结论、**决策及理由**——决策散在对话里会话一关就丢）；与产出无关的闲聊不记录；你明确说「把这句记下来」时 AI 照记。

前提是 AI 侧已装 skills（见上文）。术语对照：AI 说「建档」= 创建任务文件；「归档」= 移入 `.tasks/archive/`；「check」= 语法与规范校验。

## 相关页面

- 参考：[适用场景](./scenarios) · [操作手册](./handbook) · [完整攻略](./guide) · [CLI 参考](./cli) · [配置参考](./config) · [常见问题](./faq)
