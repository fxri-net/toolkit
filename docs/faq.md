# FAQ

> 目标读者：遇到疑问来查答案的用户（含不熟悉 AI 生态的）。按主题分组，先答结论再给细节。

## 解决什么问题

新手指南讲最短路径、完整攻略讲全流程，但真实使用中的疑问是碎片化的——本篇按「问题 → 答案」直给。没找到答案可去 [GitHub Issues](https://github.com/fxri-net/toolkit/issues) 或 [Gitee Issues](https://gitee.com/fxri/toolkit/issues) 提问。

## 安装与环境

### 工具和 skills 都得装吗？

不是都得装。**skills 独立可用，工具是可选加速**：

- 只装 skills：AI 照着技能里的规范纯手工跑通建档、校验、归档全流程（零依赖，纯 Markdown）
- 只装工具：人可以用 CLI，但 AI 侧没有规范指引
- 都装：AI 自动校验、自动归档，体验最完整（推荐）

一句话：skills 教 AI 怎么做，CLI 帮人（和 AI）做得快。

### 个人用，全局装还是每个项目里装？

个人多项目使用推荐**双全局**，一次配置所有项目直接可用：

```bash
pnpm i -g @fxri/toolkit                        # 工具全局
pnpm dlx skills add fxri-net/toolkit --global  # skills 全局
```

升级也各一条命令（skills 升级后开新会话，见「升级后要注意什么」）。诚实代价：全局装的版本**不随项目锁定**，团队里会出现「各装各的」版本漂移——所以团队项目推荐工具走项目 devDependency（版本随仓库锁定，成员与 CI 自动一致）；skills 可全局装，也可项目级装并把 `skills-lock.json` 提交进仓库锁版本；只想在公司项目生效见下文「只在公司项目激活」。

### skills 是什么？和插件、脚本有什么区别？

skills 是给 AI 编程助手看的「岗位说明书」：一份 Markdown 文件，写清楚某类工作（比如方案落盘、发版）的流程和规范。agent 遇到对应任务时自动读取并照着执行。

与插件/脚本的区别：**它不是可执行代码**，没有安装依赖、没有版本运行环境问题，任何兼容 Agent Skills 标准的 AI 工具（Trae、Claude Code、Cursor、Codex 等）都能直接读。缺点也来自这里：它依赖 AI 去执行，所以配套 CLI 做自动校验兜底。

### 我不用 AI，这个工具对我有用吗？

有用。任务管理（建档、校验、归档、导出报表）和 CHANGELOG 格式化都是纯 CLI 能力，不涉及 AI；AI 相关的 skills 部分不装即可。

### 除了开发，产品经理、项目经理这类非开发角色能用吗？

能用。任务管理半边对所有角色开放：产品经理把需求清单整理成 Excel/CSV（列名用「任务名/负责人/截止日期」等常见叫法即可），让 AI 执行导入（`toolkit tasks --import 需求.xlsx`）转成规范任务文件，内置中文列名映射，非标准列可用配置自定义；项目经理按负责人/状态过滤总览、导出 XLSX 汇报；测试、运维同样适用。CHANGELOG 半边面向有发版需求的软件项目。角色速查表与边界说明见[新手指南 · 谁适合用](./getting-started#谁适合用)。

### 配好全局规则后，我就完全不用管了？AI 能全程自主吗？

日常可以做到**零操作**：建档、校验、归档全部由 AI 按全局规则自主完成，你只说自然语言；AI 完成后会回报清单请你确认——这是防写错仓库文件的安全设计，不是操作负担。三个时刻仍需你出手：首次安装（AI 规则明确不自行全局安装）、升级后开新会话、工具不可用时手动保存兜底方案。详见[新手指南 · AI 用户](./getting-started#ai-用户让-ai-替你操作)。

### AI 归档会话时，记什么不记什么？

只沉淀**工作产出**：功能改动、结论、以及对话中产生的**决策及其理由**（「为什么选方案 B 不选 A」——决策散落在对话里，会话一关就丢）。与产出无关的闲聊不记录；你明确要求记录的内容 AI 照记。

### skills 需要额外的仓库参考文件吗？

不需要。技能是**自包含**的：SKILL.md 主干 + 规范细节（references/）+ 模板资产（assets/）都在技能目录内，装好即完整，AI 拿到就能按规范执行。唯一例外：只装 skills、未装 CLI，且项目里没有仓库根 SPEC.md 时，建档格式需按[任务文件规范](https://github.com/fxri-net/toolkit/blob/main/SPEC.md)参照——装齐 CLI 或放一份 SPEC.md 即可消除。

### 用 nvm 切了 Node 版本，全局装的 toolkit 不见了？

全局包绑定在安装时的 Node 版本上，切版本后各版本的 `node_modules` 相互独立，这是 nvm 类工具的机制，不是本工具的问题。处理：新版本下重新安装（`pnpm i -g @fxri/toolkit` 或 `npm i -g @fxri/toolkit`）；改用 pnpm 全局安装可规避（pnpm 全局目录独立于 Node 版本）；团队项目建议改用项目 devDependency 方式（见[新手指南 · 安装](./getting-started#安装)），不受切版本影响。

### Node 18 能用吗？

能安装、能跑 tasks 总览/归档和 CHANGELOG 格式化；但 `changelog` 走 changesets 的子命令（add/version/publish）不可用——上游依赖 `human-id` 仅支持 ESM，属 changesets 生态限制。正式支持 Node >= 20。

### 内网或离线环境怎么装？

先判断你的网络卡在哪一档：

- **只卡 GitHub（npm registry 可达，最常见）**：CLI 照常用 `pnpm add -g @fxri/toolkit` 装；skills 不从 GitHub 拉，直接以已装 CLI 包的本地目录为源（skills 随包分发在 `skills/`）：
  ```bash
  pnpm dlx skills add "$(pnpm root -g)/@fxri/toolkit" --global
  ```
  `pnpm root -g` 取全局包根目录，skills 安装器会识别本地路径直接拷贝（已实测验证）。npm 用户对应写法：`npm i -g @fxri/toolkit && npx skills add "$(npm root -g)/@fxri/toolkit" --global`。
- **registry 也不可达（完全离线）**：换一台能联网的机器执行 `pnpm pack @fxri/toolkit`（npm 用户 `npm pack`），把打出的 tgz 拷进内网后 `pnpm add -g <tgz 路径>` 离线装 CLI；skills 再从装好的包目录走上面那条本地路径命令。
- **GitHub 有代理或镜像**：`pnpm dlx skills add fxri-net/toolkit --global` 直连即可，与正常安装无异。

### 国内网络优先走哪条渠道？

[Gitee 镜像](https://gitee.com/fxri/toolkit) 与 GitHub 同源同步，国内访问最省心：

- **源码浏览 / 克隆**：`https://gitee.com/fxri/toolkit`
- **skills 安装**：skills 安装器只认 GitHub 源与本地路径，GitHub 不稳时先 clone 镜像、再对本地目录安装：
  ```bash
  git clone https://gitee.com/fxri/toolkit fxri-toolkit
  pnpm dlx skills add fxri-toolkit --global    # npm 用户把 pnpm dlx 换成 npx
  ```
- **CLI 本体**：走 npm registry，与镜像无关；npm 源提速可 `pnpm config set registry https://registry.npmmirror.com`（npm 用户把 `pnpm config` 换成 `npm config`）
- **问题反馈**：[Gitee Issues](https://gitee.com/fxri/toolkit/issues)
- **文档站**：https://fxri.gitee.io/toolkit/（Gitee Pages，与 GitHub Pages 同源部署）

## 任务管理

### `.tasks/` 要提交到 git 吗？哪些文件该提交？

`.tasks/` 整体（active + archive）必须入库——任务记录是团队共享的工作记忆，不入库就失去多人/多会话协作意义。`.toolkitrc.json` 建议提交（团队统一配置）；`.archive.lock` 是运行时排他锁，加入 `.gitignore`（`toolkit init` 会自动处理）。

### 我一个人用，还有必要提交任务记录吗？

建议提交。除多人协作外，任务记录还是**跨会话的上下文载体**：AI 的新会话读不到旧会话的对话内容，但能读仓库里的任务文件——这正是「新会话恢复上下文」能力的基石（见下文「AI 换了个会话就不记得之前聊的了」）。

### AI 换了个会话就不记得之前聊的了，怎么办？

这是所有 agent 的共性约束：新会话读不到其他会话的内部上下文。解法是把记忆**沉淀进仓库文件**：

1. 会话结束前，让 AI「把本次结论归档」——结论写入对应任务文件
2. 新会话开头，让 AI「读任务区和最近归档，恢复上下文」

1.7.0 起有专门技能 `fxri-session-recap` 承载这两步（见[完整攻略 · 会话归档](./guide#会话归档)）。

### 为什么 AI 建的档 check 不过？

常见原因：文件放错层级（必须在 `active/{YYYYMM}/` 下，漏掉月份目录会软告警且不被读取）、`created` 与文件名日期前缀不一致、终结态缺 `completed`。跑 `pnpm exec toolkit tasks check`，按输出逐条修即可；建档交给 AI 时说「按 fxri-plan-to-task 技能建档」可从源头避免。

### 归档提示「本次无可归档任务」？

任务文件的 frontmatter 里 `status` 仍是 `待办`/`进行中`/`阻塞`（这三态不归档），或终结态但缺 `completed` 完成时间（会明确提示跳过）。先打开任务文件确认 frontmatter 状态。

### 归档后发现敏感信息没脱敏？

脱敏只作用于**终端展示、导出文件与归档落盘**，`.tasks/active/` 源文件按原样保存（设计如此，不改动原始正文）。若某类信息未被掩码，可能未命中内置规则——在 `.toolkitrc.json` 加自定义规则（见[配置参考 · redact](./config#redact隐私脱敏)）。

## 协作与流程

### 只在公司项目激活，个人项目不被插入怎么做？

全局装 skills 后，在公司项目根的 AGENTS.md / 项目 rules 中显式引用 fxri 技能并提交；个人项目不放引用文件。agent 按需加载技能，未声明的不会自动介入。模板见[完整攻略 · 项目级激活模板](./guide#项目级激活模板)。

### 任务做完必须马上归档吗？能不能攒一批？

工具不强制，但**强烈建议随完成随归档**：若提交代码，先归档、后提交，归档文件与代码变更落同一 git 提交是本工作流的核心纪律——滞留 active 的任务会丢失「完成时间→提交」的对应关系，攒批归档则把这个缺口拉大。团队可在 CI 或 code review 中检查。

### 任务做完必须提交、发版、推送吗？

都不必须。任务工作流的**强制约束到归档为止**：任务置终结态（`已完成`/`已放弃` + `completed`）并归档即流程终点。提交、发版、推送是项目自主决定的后续动作，可通过你的全局 / 个人 / 项目规则约定给 AI。⚠️ 唯一保留的顺序约束：**若提交代码，必须先归档、后提交**，归档文件与代码变更落在同一 git 提交，避免任务完成却滞留 active，或归档单独成一条提交。

### 提交信息有格式要求吗？

本工具只管任务文件与 CHANGELOG，不强制 commit 格式；但技能流程推荐中文提交信息（如「修复：修复金额计算精度丢失」），AI 侧按团队规范执行即可。

## 发版与升级

### 升级后要注意什么？

CLI 升级后 skills 也要同步升级（`pnpm dlx skills update`），并且**开新会话**——旧会话加载的技能内容还是旧版，新会话才会读到新技能。1.7.0 起 CLI 会在检测到新版本时提示。按安装方式选择升级命令：项目 devDep 在项目内 `pnpm up @fxri/toolkit`（或对应包管理器）；全局 `pnpm i -g` / `npm i -g` 重装最新版；yarn v2+ 全局安装受限，建议迁移到 pnpm。

### fork 本仓库怎么部署文档站？

三种平台方案（GitHub Pages 自动部署 / GitLab Pages CI / Gitee 手动构建）见[完整攻略 · 文档站部署三平台](./guide#文档站部署三平台)。

## 相关页面

- [新手指南](./getting-started)：术语科普与最短路径
- [完整攻略](./guide)：全流程细节
- [CLI 参考](./cli)：命令字典
