# 常见问题

> 目标读者：遇到疑问来查答案的用户（含不熟悉 AI 生态的）。按主题分组，先答结论再给细节。

## 解决什么问题

快速开始讲最短路径、完整攻略讲全流程，但真实使用中的疑问是碎片化的——本篇按「问题 → 答案」直给。同一事实只在真源页维护一次，本篇只给结论与该问题特有的差异，细节指回真源。没找到答案可去 [GitHub Issues](https://github.com/fxri-net/toolkit/issues) 或 [Gitee Issues](https://gitee.com/fxri/toolkit/issues) 提问。

## 安装与环境

### 工具和 skills 都得装吗？

不是都得装。**skills 独立可用，工具是可选加速**：

- 只装 skills：AI 照着技能里的规范纯手工跑通建档、校验、归档全流程（零依赖，纯 Markdown）
- 只装工具：人可以用 CLI，但 AI 侧没有规范指引
- 都装：AI 自动校验、自动归档，体验最完整（推荐）

一句话：skills 教 AI 怎么做，CLI 帮人（和 AI）做得快。

### 个人用，全局装还是每个项目里装？

个人多项目使用推荐**双全局**，一次配置所有项目直接可用：工具用 `pnpm i -g @fxri/toolkit` 全局装、skills 用 `toolkit skills install` 全局分发（命令与三种安装方式见[快速开始 · 安装](./getting-started#安装)）。

升级一条命令：`pnpm add -g @fxri/toolkit`（软链模式下技能随包自动更新；副本形式需重跑 `toolkit skills install`），skills 升级后开新会话，见「升级后要注意什么」。诚实代价：全局装的版本**不随项目锁定**，团队里会出现「各装各的」版本漂移——所以团队项目推荐工具走项目 devDependency、技能装进项目（`--scope project`），也可用上游安装器项目级安装并把 `skills-lock.json` 提交进仓库锁版本；只想在公司项目生效见下文「只在公司项目激活」。

### 我只想当技能包管理器，不想装自带技能？

用 `toolkit skills install --mode package` 切换到纯包管理器模式：`core` 也不再强制，可以一个都不选；之后按 `--from <path|url> --skills <names>` 只装外部来源技能。只想本次零装、不改长期模式时用 `--no-skills`（与 `--skills` / `--all` / `--no-optional` / `--mode` 互斥）。

### 项目内装的技能放在哪、队友 clone 后要重装吗？

项目面分发（`toolkit skills install --scope project`，`--scope` 缺省时项目内装的 CLI 会自动走此面）只保留**一份唯一真源**：`<仓库根>/.agents/skills/`（完整技能内容）；其余**已存在**的候选目录各放**每个技能一个** `SKILL.md` 薄壳——description 从真源派生、正文指明真源路径与版本标记，不重复承载内容；某个候选目录不存在就不凭空创建，候选目录清单见 [skills 命令 · 作用域](./cli/skills#作用域)。

真源、薄壳与归属账（`<仓库根>/.toolkit/state.json`）都要**入库**。队友 clone 后**不必逐台手动重装**：`prepare` 刷新钩子在 `pnpm install` 时自动补齐/刷新（仅当本地依赖含 `@fxri/toolkit`），也可手动重跑 install；现场用 `toolkit skills status --scope project` 查，清理用 `toolkit skills uninstall --scope project`（只摘本包登记的产物）。

⚠️ 发布型包要把这些产物加入 `files` 白名单或 `.npmignore`，否则 `npm` 无 `.npmignore` 时可能被打进包（`toolkit init` 会提示、不代改）——完整说明见[完整攻略 · Git 纳管范围](./guide#git-纳管范围)。

### skills 是什么？和插件、脚本有什么区别？

skills 是给 AI 编程助手看的「岗位说明书」：一份 Markdown 文件，写清楚某类工作（比如方案落盘、发版）的流程和规范。agent 遇到对应任务时自动读取并照着执行。

与插件/脚本的区别：**它不是可执行代码**，没有安装依赖、没有版本运行环境问题，任何兼容 Agent Skills 标准的 AI 工具（Trae、Claude Code、Cursor、Codex 等）都能直接读。缺点也来自这里：它依赖 AI 去执行，所以配套 CLI 做自动校验兜底。

### 我不用 AI，这个工具对我有用吗？

有用。任务管理（建档、校验、归档、导出报表）和 CHANGELOG 格式化都是纯 CLI 能力，不涉及 AI；AI 相关的 skills 部分不装即可。

### 除了开发，产品经理、项目经理这类非开发角色能用吗？

能用。任务管理半边对所有角色开放：产品经理把需求清单整理成 Excel/CSV（列名用「任务名/负责人/截止日期」等常见叫法即可），让 AI 执行导入（`toolkit tasks import 需求.xlsx`）转成规范任务文件，内置中文列名映射，非标准列可用配置自定义；项目经理按负责人/状态过滤总览、导出 XLSX 汇报；测试、运维同样适用。CHANGELOG 半边面向有发版需求的软件项目。角色速查表与边界说明见[快速开始 · 谁适合用](./getting-started#谁适合用)。

### 配好全局规则后，我就完全不用管了？AI 能全程自主吗？

日常可以做到**零操作**：建档、校验、归档与规范沉淀全部由 AI 按全局规则自主完成，你只说自然语言；AI 完成后会回报清单请你确认——这是防写错仓库文件的安全设计，不是操作负担。三个时刻仍需你出手：首次安装（AI 规则明确不自行全局安装）、升级后开新会话、工具不可用时手动保存兜底方案。详见[快速开始 · AI 用户](./getting-started#ai-用户-让-ai-替你操作)。

### AI 沉淀会话时，记什么不记什么？

只沉淀**工作产出**：功能改动、结论、以及对话中产生的**决策及其理由**（「为什么选方案 B 不选 A」——决策散落在对话里，会话一关就丢）。与产出无关的闲聊不记录；你明确要求记录的内容 AI 照记。

### skills 需要额外的仓库参考文件吗？

不需要。技能是**自包含**的：SKILL.md 主干 + 规范细节（references/）+ 模板资产（assets/）都在技能目录内，装好即完整，AI 拿到就能按规范执行。唯一例外：只装 skills、未装 CLI，且项目里没有仓库根 SPEC.md 时，建档格式需按[任务文件规范](https://github.com/fxri-net/toolkit/blob/main/SPEC.md)参照——装齐 CLI 或放一份 SPEC.md 即可消除。

### 用 nvm 切了 Node 版本，全局装的 toolkit 不见了？

全局包绑定在安装时的 Node 版本上，切版本后各版本的 `node_modules` 相互独立，这是 nvm 类工具的机制，不是本工具的问题。处理：新版本下重新安装（`pnpm i -g @fxri/toolkit` 或 `npm i -g @fxri/toolkit`）；改用 pnpm 全局安装可规避（pnpm 全局目录独立于 Node 版本）；团队项目建议改用项目 devDependency 方式（见[快速开始 · 安装](./getting-started#安装)），不受切版本影响。

### Node 18 能用吗？

能安装、能跑 tasks 总览/归档和 CHANGELOG 格式化；但 `changelog` 走 changesets 的子命令（add/version/publish）不可用——上游依赖 `human-id` 仅支持 ESM，需宿主 Node 默认开启 `require(esm)`（Node ≥ 20.19.0 / 22 线 ≥ 22.12.0），属 changesets 生态限制。正式支持 Node >= 20.19.0。

### 内网或离线环境怎么装？

先判断你的网络卡在哪一档：

- **只卡 GitHub（npm registry 可达，最常见）**：CLI 照常用 `pnpm add -g @fxri/toolkit` 装；skills 随包分发、不走 GitHub，直接一键分发：
  ```bash
  toolkit skills install   # npm 用户先 npm i -g @fxri/toolkit
  ```
  若仍想用上游安装器，也可把已装 CLI 包目录当本地源（`pnpm dlx skills add "$(pnpm root -g)/@fxri/toolkit" --global`，npm 用户 `npx skills add "$(npm root -g)/@fxri/toolkit" --global`）。
- **registry 也不可达（完全离线）**：换一台能联网的机器执行 `pnpm pack @fxri/toolkit`（npm 用户 `npm pack`），把打出的 tgz 拷进内网后 `pnpm add -g <tgz 路径>` 离线装 CLI，再 `toolkit skills install`——技能随包分发，全程不碰 GitHub。
- **GitHub 有代理或镜像**：`pnpm dlx skills add fxri-net/toolkit --global` 直连即可，与正常安装无异。

### 国内网络优先走哪条渠道？

[Gitee 镜像](https://gitee.com/fxri/toolkit) 与 GitHub 同源同步，国内访问最省心：

- **源码浏览 / 克隆**：`https://gitee.com/fxri/toolkit`
- **skills 安装**：装了 CLI（走 npm registry）后直接 `toolkit skills install`，技能随包分发、不碰 GitHub，国内网络最省心；若要用上游安装器（只认 GitHub 源与本地路径），GitHub 不稳时先 clone 镜像、再对本地目录安装：
  ```bash
  git clone https://gitee.com/fxri/toolkit fxri-toolkit
  pnpm dlx skills add fxri-toolkit --global    # npm 用户把 pnpm dlx 换成 npx
  ```
- **CLI 本体**：走 npm registry，与镜像无关；npm 源提速可 `pnpm config set registry https://registry.npmmirror.com`（npm 用户把 `pnpm config` 换成 `npm config`）
- **问题反馈**：[Gitee Issues](https://gitee.com/fxri/toolkit/issues)

### 之前用 `npx skills` 装过，改用内置命令提示同名冲突怎么办？

上游安装器把技能落成 `~/.agents/skills/` 下的**实体副本**，且不在本包状态文件 `~/.agents/.toolkit-skills.json` 的登记内，内置命令因此把它判为「同名非本包产物」并报成「同名冲突」。一条命令接管：

```bash
toolkit skills install --force   # 把各目标下的同名旧副本重建为软链（无权限建链时降级为副本）
```

`--force` 只解除「同名非本包产物」的跳过判定，按默认形态重建这些未登记的目录；本包自己以 `--copy` 装出、且已在状态文件登记的副本不受影响，仍保持副本。

⚠️ 迁移后两条路径不要混用：再跑 `pnpm dlx skills update -g`（npm 用户 `npx skills update -g`）会把该目录重写回实体副本，冲突复发。迁移后 `skills-lock.json` 不再被任何一方维护，可删除，避免与内置命令的真实状态不一致。

### 卸载工具时 skills 怎么办？

**先清技能、再卸工具**：`toolkit skills uninstall` → `pnpm remove -g @fxri/toolkit`。⚠️ 顺序别反：`skills uninstall` 要靠 CLI 与包内真源定位产物，CLI 卸了就没工具可用（重装一次再清即可）；软链会随 CLI 卸载悬空，`remove` 会一并摘除，漏摘时手工删 `~/.agents/skills/` 与各 agent 全局技能目录下的 `fxri-*` 链接。项目面产物用 `remove --scope project` 单独清（实体副本不随 CLI 卸载悬空）。完整步骤见[操作手册 · 升级与卸载](./handbook#七、升级与卸载)。

### `.tasks/` 要提交到 git 吗？哪些文件该提交？

`.tasks/` 整体（active + archive）必须入库——任务记录是团队共享的工作记忆。`.toolkitrc.json` 建议提交，`.toolkitrc.local.json` 应忽略（`toolkit init` 自动写忽略行，存量项目重跑 `init` 幂等补写），`.archive.lock` 为运行时锁、默认忽略。完整纳管表见[完整攻略 · Git 纳管范围](./guide#git-纳管范围)。

### 我一个人用，还有必要提交任务记录吗？

建议提交。除多人协作外，任务记录还是**跨会话的上下文载体**：AI 的新会话读不到旧会话的对话内容，但能读仓库里的任务文件——这正是「新会话恢复上下文」能力的基石（见下文「AI 换了个会话就不记得之前聊的了」）。

### AI 换了个会话就不记得之前聊的了，怎么办？

这是所有 agent 的共性约束：新会话读不到其他会话的内部上下文。解法是把记忆**沉淀进仓库文件**（`.tasks/`）：会话结束前说「今天先到这 / 收个尾」，AI 全量回放本会话、清单经你核对后落盘归档并做规范沉淀；新会话开头说「恢复上下文 / 上次做到哪了」，AI 读 active 全部与近窗归档接上现场。完整流程见[完整攻略 · 会话沉淀、恢复与历史修正](./guide#会话沉淀、恢复与历史修正)。

### 为什么 AI 建的档 check 不过？

常见原因：文件放错层级（必须在 `active/{YYYYMM}/` 下，漏掉月份目录会软告警且不被读取）、`created` 与文件名日期前缀不一致、终结态缺 `completed`。跑 `pnpm exec toolkit tasks check`，按输出逐条修即可；建档交给 AI 时说「按 fxri-plan-to-task 技能建档」可从源头避免。

### 归档提示「本次无可归档任务」？

任务文件的 frontmatter 里 `status` 仍是 `待办`/`进行中`/`阻塞`（这三态不归档），或终结态但缺 `completed` 完成时间（会明确提示跳过）。先打开任务文件确认 frontmatter 状态。

### 归档后发现敏感信息没脱敏？

脱敏只作用于**终端展示、导出文件与归档落盘**，`.tasks/active/` 源文件按原样保存（设计如此，不改动原始正文）。若某类信息未被掩码，可能未命中内置规则——**团队规则**加到 `.toolkitrc.json`、**个人规则**加到 `.toolkitrc.local.json`（仅本人可见、默认不入库），见[配置参考 · redact](./config/redact)。

### 技能次数正常，但触发词 / 参数 / 结果是空的？

这是规则通道的预期表现：规则只上报技能名与次数，触发词、参数、结果与耗时靠工具反查会话记录补齐。读不到记录时字段留空，计数不受影响。常见原因有三种：该 Agent 的会话正文不落可读文件（Trae）、会话格式尚未适配（dsh 为 v4 事件流）、或会话记录已过期被清理。

补救两种：`toolkit usage log --skill <名称> --session <id> --prompt "…" --args "…" --outcome success` 手工补录；或改用 Hook 通道（`toolkit usage channel hook`）。两种方式只对之后的事件生效。完整说明见 [Agent 接入 · 拿不到明细时的补救](./usage/agents#拿不到明细时的补救)。⚠️ 升级 Node 或安装 zstd 不会让 dsh 明细出现——它的会话格式尚未适配。

## 协作与流程

### 只在公司项目激活，个人项目不被插入怎么做？

全局装 skills 后，在公司项目根的 AGENTS.md / 项目 rules 中显式引用 fxri 技能并提交；个人项目不放引用文件即可——兼容 agent 仍可能按 `description` 匹配自动触发，若需要稳定启用（而非碰运气触发），同样建议显式声明。模板见[完整攻略 · 项目级激活模板](./guide#项目级激活模板)。

### 任务做完必须马上归档吗？能不能攒一批？

工具不强制，但**强烈建议随完成随归档**：若提交代码，先归档与沉淀、后提交，归档文件与代码变更落同一 git 提交是本工作流的核心纪律——滞留 active 的任务会丢失「完成时间→提交」的对应关系，攒批归档则把这个缺口拉大。团队可在 CI 或 code review 中检查。

### 多人同一天归档，`pull` 时归档文件冲突了怎么办？

归档文件按完成日期聚合成单一文件（`archive/{YYYYMM}/{YYYYMMDD}.md`），多人同天归档、各自先提交后拉取时，git 会在同一文件上留下冲突标记。**不用手工逐块合并**：跑 `toolkit tasks normalize --fix` 即可——工具取冲突两侧的任务块并集、按标题去重、按完成时间降序重排，丢弃 diff3 的 `|||||||` base 段与全部标记行，得到无标记的规范归档文件（`normalize` 只读检查与 `tasks check` 也会先把这类文件报出来）。若由 AI 代为推送与拉取，可让其冲突后直接执行该命令收敛。

### 任务做完必须提交、发版、推送吗？

都不必须。任务工作流的**强制约束到沉淀为止**：任务置终结态（`已完成`/`已放弃` + `completed`）并归档，再做任务级规范沉淀，归档 + 沉淀即流程终点。提交、发版、推送由你的规则约定，也可在当次指令里直接授权。⚠️ 唯一保留的顺序约束：**若提交代码，必须先归档与沉淀、再跑项目验收命令、后提交**（验收须晚于归档），归档文件、规范变更与代码变更落在同一 git 提交。完整口径见[完整攻略 · 方案落盘工作流](./guide#方案落盘工作流)。

### 提交信息有格式要求吗？

本工具只管任务文件与 CHANGELOG，不强制 commit 格式；AI 侧按团队规范执行即可。

### 项目里已有历史的 `.tasks/conventions.md`，怎么升级到新形态？

说一句「把项目里的 conventions.md 迁到新形态」即可，AI 按三段式执行且**中途停下也不丢内容**（旧文件整体搬为 `index.md` 后即原文快照）。步骤与可中断说明见[操作手册 · 规范载体迁移](./handbook#四、规范载体迁移)。

### 载体已经是 `conventions/` 目录了，还要升级什么？

目录形态另有**结构版本**：最新为 **v3** 三分区（常驻 `index.md`、按需分册、归档面 `history.md` / `retired.md`，索引表首列为稳定 ID `C-<n>`），v2 有标记与稳定 ID 但无归档面，v1 连标记都没有。说一句「把规范载体升到 v3」或跑 `toolkit conventions upgrade`（`--dry-run` 预演、幂等、异常形态拒绝写盘，v1 / v2 链式升级）。各版本差异见[完整攻略 · 存量规范载体迁移](./guide#存量规范载体迁移)。

### 载体表格里为什么有大量空格？怎么去掉？

那是宿主格式化器（prettier）对 GFM 表格做**列对齐填充**的结果，预览不显示、纯文本阅读时干扰。两种处置：`toolkit init` 在检测到 prettier 时幂等托管 `.prettierignore` 把任务区排除；已存在的填充用 `toolkit conventions format` 归一回紧凑形态（幂等、跳过 fenced code block）。详见[完整攻略 · 表格形态](./guide#conventions-规范沉淀地)。

### `toolkit init` 生成的「规范入口壳」是什么？必须留着吗？

它是在**已存在的**项目级技能目录（如 `.agents/skills/toolkit-conventions/SKILL.md`；多个候选目录并存时每处各写一份，一个都不存在则回落 `.agents/skills/`）生成的一个**只作入口、不承载条文**的小技能壳，让 AI 在项目里能按需发现 `.tasks/conventions/` 载体，正文指回 `index.md`。它属侵入性写入，`init` 会逐项报告实际动作；落点被 `.gitignore` 覆盖时报告会提示（**不代改 `.gitignore`**），因为那样壳不会随 git 分发。不需要可直接删除，重跑 `init` 会补回；壳标记落后于当前 toolkit 时重跑 `init` 会就地更新为当前版本。

⚠️ 若只是某条旧规范过时（不换形态），走内容修订而非迁移：语义变更先在 `history.md` 留痕、再更新索引行；作废则迁入 `retired.md` 并删分册条文。口径见[完整攻略 · conventions/](./guide#conventions-规范沉淀地)；场景说法见[操作手册 · 规范载体迁移](./handbook#四、规范载体迁移)。

## 发版与升级

### 升级后要注意什么？

技能**默认自动跟随** CLI 升级（软链锚在 pnpm 稳定入口）；用了 `--copy` 或建链失败降级为副本的，需重跑 `toolkit skills install`；项目面由 `prepare` 钩子自动刷新。三种情形都要**开新会话**才读到新技能。升级命令与三步检查见[操作手册 · 升级](./handbook#升级)；Node 版本兼容见[完整攻略 · 升级与版本兼容](./guide#升级与版本兼容)。

### fork 本仓库怎么部署文档站？

文档站固定部署 GitHub Pages，fork 后调整 `VITEPRESS_BASE` 即可自动构建发布，详见[完整攻略 · 文档站部署](./guide#文档站部署)。

## 相关页面

- 参考：[快速开始](./getting-started) · [操作手册](./handbook) · [完整攻略](./guide) · [CLI 参考](./cli)
