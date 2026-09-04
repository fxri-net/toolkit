# 新手指南

> 目标读者：第一次接触本工具的用户（人或 AI）。读完能跑通「安装 → 初始化 → 建档 → 归档」最短路径，并知道去哪查更细的内容。

## 解决什么问题

你刚接手（或刚让 AI 接手）一个项目，方案确认完、代码改完，但：

- 决策过程只存在于 AI 对话里，会话关掉就没了
- 任务记录零散，谁在做、做到哪、为什么这么做，无从查起
- 发版 CHANGELOG 要人肉维护多语言

本工具用一套**纯 Markdown 任务文件 + 一条 CLI** 解决前三点，第四点见[完整攻略 · 多语言 CHANGELOG](./guide#多语言-changelog)。

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

## 安装

三种方式按场景选一，**推荐方式一**（团队项目标准做法）：

### 方式一：项目 devDependency（推荐）

```bash
pnpm add -D @fxri/toolkit
```

- 任务记录、校验、归档随仓库走，团队成员与 AI 会话内 `pnpm exec toolkit`（npm 用户 `npx toolkit`）即可用
- 版本随项目锁定，升级由项目统一决定

### 方式二：全局安装

```bash
pnpm i -g @fxri/toolkit   # pnpm（bin 落在 pnpm home，不受 nvm 切版本影响）
npm i -g @fxri/toolkit    # npm（bin 硬链在 Node 目录，切版本需重装）
yarn global add @fxri/toolkit   # 仅 yarn 1.x；v2+ 默认禁用 global，建议改用 pnpm
bun i -g @fxri/toolkit    # bun
```

适合个人在多个项目间快速使用。⚠️ 使用 nvm/fnm 等切换 Node 版本的工具时，npm 的全局包**绑定在安装时的 Node 版本上**，切版本后会「消失」——重新执行安装命令即可（pnpm 全局目录独立于 Node 版本，或用方式三规避）。

### 方式三：不安装、临时执行

```bash
npx @fxri/toolkit tasks       # npm / yarn
pnpm dlx @fxri/toolkit tasks  # pnpm
bunx @fxri/toolkit tasks      # bun
```

零安装先体验。⚠️ 首次执行有下载耗时，且每次都解析最新版本，不适合高频使用。

### 安装方式对比

| | 方式一 devDep | 方式二 全局 | 方式三 临时执行 |
| --- | --- | --- | --- |
| 团队共享版本 | ✅ 锁定 | ❌ 各装各的 | ❌ 总是最新 |
| 离线可用 | ✅ | ✅ | ❌ |
| nvm 切版本影响 | 无 | npm ⚠️ 需重装；pnpm ✅ 不受影响 | 无 |
| 推荐包管理器 | pnpm | pnpm | pnpm dlx |
| 适合场景 | 团队/长期项目 | 个人多项目 | 快速试用 |

### 关于 AI 技能包（skills）

本工具的完整工作流已沉淀为零依赖的 Agent Skills（纯 Markdown 规范），**skills 可以独立工作，不装 CLI 也能让 AI 按同一套规范建档、校验、归档**；CLI 提供的是自动校验、自动归档等加速。

- 推荐两者都装，体验最完整
- 只装 skills：AI 仍能跑通全流程（手工执行规范步骤）
- 只装 CLI：人可以用，但 AI 侧没有规范指引

安装 skills：`pnpm dlx skills add fxri-net/toolkit`（npm 用户 `npx skills add fxri-net/toolkit`，详见[完整攻略 · AI 技能包](./guide#ai-技能包-skills)）。

## 30 秒上手

```bash
# 1. 初始化任务区（生成 .tasks/ 骨架与 .gitignore 片段）
pnpm exec toolkit init

# 2. 查看任务总览（当前为空）
pnpm exec toolkit tasks

# 3. 方案确认后，把方案登记为任务文件（.tasks/active/202609/ 下）
#    文件名：{年月日}-{用户名}-{任务简述}.md
#    手工建档模板见「完整攻略」；装了 AI 技能包可直接让 AI 建档

# 4. 校验
pnpm exec toolkit tasks check

# 5. 任务完成后：frontmatter 标记 status: 已完成 + completed 时间，然后归档
pnpm exec toolkit tasks archive
```

⚠️ `toolkit init` 为 1.7.0 新增；旧版本请手工建 `.tasks/active/{YYYYMM}/` 目录结构。

## AI 用户（让 AI 替你操作）

不需要懂命令，直接对 AI 说：

- 「把刚才确认的方案落盘为任务」→ AI 会在 `.tasks/active/` 下建档
- 「任务做完了，归档并提交」→ AI 会归档后与代码变更同一提交
- 「现在有哪些没做完的任务」→ AI 会跑总览给你

前提是 AI 侧已装 skills（见上文）。术语对照：AI 说「建档」= 创建任务文件；「归档」= 移入 `.tasks/archive/`；「check」= 语法与规范校验。

## 下一步

- 日常完整工作流 → [完整攻略](./guide)
- 查命令参数 → [CLI 参考](./cli)
- 配置脱敏、告警等 → [配置参考](./config)
- 遇到问题 → [FAQ](./faq)
