<p align="center">
  <img src="./docs/public/logo.png" width="128" alt="方弦工具集">
</p>

# 方弦工具集

[![CI](https://github.com/fxri-net/toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/fxri-net/toolkit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@fxri/toolkit)](https://www.npmjs.com/package/@fxri/toolkit)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.17-brightgreen)](./docs/getting-started.md#完整安装)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![文档站](https://img.shields.io/badge/docs-fxri--net.github.io%2Ftoolkit-blueviolet)](https://fxri-net.github.io/toolkit/)

> 国内网络建议优先 [Gitee 镜像](https://gitee.com/fxri/toolkit)（与 GitHub 同源同步，仓库/文档/issues/skills 全渠道可用）。
> 问题反馈走 [GitHub Issues](https://github.com/fxri-net/toolkit/issues)，
> 或 [Gitee Issues](https://gitee.com/fxri/toolkit/issues)。

专为**多人 + AI 跨项目协作**打造：把对话里的方案与交付，沉淀为仓库内可校验、可分发、可迁移的工程资产。

AI 参与开发后，方案与决策散落在对话记录里，会话一关什么都不剩；任务记录零散，谁在做、做到哪，无从查起；
发版 CHANGELOG 还要人肉维护多语言。本工具把这条链路沉淀为**仓库内可检索、可校验、可归档的文件**——人离开会话，记忆留在仓库里。

三层能力覆盖全链路：**协作过程可校验**（任务、规范载体、整体状态）、**能力可分发**（技能包、全局规则、作用域、使用统计）、
**交付可治理**（多语言 CHANGELOG、文档站校验、隐私脱敏、升级迁移）。落到命令域：协作侧 `task` / `convention` / `status`，
分发侧 `skill` / `rule` / `scope` / `usage` / `concept`，交付侧 `release` / `docs`，隐私脱敏与版本迁移贯穿其中。

- **零依赖 AI 技能包（skills）**：方案落盘、会话收尾、发版 CHANGELOG 等工作流沉淀为 Agent Skills，不绑定任何 AI 工具；skills 可以独立工作，
  CLI 是可选加速——推荐都装，体验最完整（[什么关系？](./docs/faq.md#工具和-skills-都得装吗)）
- **不懂 AI 也能用**：任务管理与多语言 CHANGELOG 是纯 CLI 能力；术语都说了人话（[先看术语表](./docs/getting-started.md#几个术语-先说人话)）

## 🚀 30 秒上手

```bash
# 1. 全局安装 CLI（npm 用户 npm add -g @fxri/toolkit）
pnpm add -g @fxri/toolkit

# 2. 本机接入：装技能、配规则、设生效范围（交互向导，可在任意目录执行）
toolkit setup
```

进入项目后，对 AI 说「初始化任务区」即可（AI 执行 `toolkit task init` 并完成建档与校验）。

> 团队项目改用 devDependency 锁定版本：`pnpm add -D @fxri/toolkit` + `toolkit skill install --scope project`；
> 项目内执行命令用 `pnpm exec toolkit`。

之后：方案确认后由 AI 登记为 `.tasks/` 任务文件 → `toolkit task check` 校验 →
完成后 `toolkit task archive` 归档并做规范沉淀。
多任务 / 多仓方案先出纯展示计划表，确认后说「开始」即一次建完全部任务档并校验，再按序逐个交付提交。
完整步骤见 [快速开始](./docs/getting-started.md)。按场景选路径见 [适用场景](./docs/scenarios.md)，整体结构见 [一图看懂](./docs/concepts.md)。

## ✨ 能力矩阵

| 能力 | 适用场景 | 文档 |
| --- | --- | --- |
| 任务管理（task） | 方案落盘、总览过滤、校验归档、导入导出 CSV / XLSX / JSON | [CLI 参考](./docs/cli.md) · [任务文件规范](./docs/guide.md#任务文件规范) |
| 规范载体（convention） | 把任务里提炼的规范收进 `.tasks/conventions/`，成为可检索、可校验的项目规范源；支持结构升级、表格与索引单元格形态归一、只读体检 | [CLI 参考](./docs/cli.md) · [完整攻略](./docs/guide.md#conventions-规范沉淀地) |
| 整体状态（status） | 一条命令汇总任务区 / 技能现场 / 配置层 / 文档站 / 版本与弃用项；`--check` 存在 error 时退出 1，可作自查门禁 | [CLI 参考](./docs/cli/status.md) |
| 技能分发（skill） | 不装本工具也能让 AI 按同一套规范干活；装了可一键分发技能（`--scope project` 随仓库入库、队友 clone 即用） | [完整攻略](./docs/guide.md#ai-技能包-skills) · [常见问题](./docs/faq.md#工具和-skills-都得装吗) |
| 全局规则（rule） | 按模块组合、排序与复制 AI 全局规则（含提交信息、技能使用情况等模块），预设与缓存随包分发 | [CLI 参考](./docs/cli/rule.md) |
| 作用域（scope） | 按项目 / 目录决定技能是否生效：策略规则、白名单 / 黑名单、标记与 git 远端；默认全域；技能矩阵与内容闸门联动 | [CLI 参考](./docs/cli/scope.md) · [配置参考](./docs/config/activation.md) |
| 技能使用情况（usage） | 统计技能调用次数、触发词与结果；默认关闭、不联网、数据只留本机 | [CLI 参考](./docs/cli/usage.md) · [技能使用情况概览](./docs/usage/index.md) |
| 发版与更新日志（release） | 封装 changesets 发版、分组标题本地化 | [CLI 参考](./docs/cli/release.md) |
| 文档站校验（docs） | 校验主题一致性、导航结构与构建产物，规则随包分发、跨仓样式漂移可发现 | [CLI 参考](./docs/cli/docs-theme.md) · [docs 校验](./docs/cli/docs-check.md) |
| 概念目录（concept） | 按场景查看可引入的工程概念与采纳步骤，JSON 输出供 AI 读取 | [CLI 参考](./docs/cli/concept.md) |
| 隐私脱敏 | 落盘前自动掩码邮箱、手机号、密钥等 | [配置参考](./docs/config.md) |
| 配置体检（config） | 三层（全局 / 项目 / 本地）定制脱敏、告警、导入列映射、语言表；`toolkit config status` 只读查看生效情况与来源 | [CLI 参考](./docs/cli/config.md) · [配置参考](./docs/config.md) |
| 升级迁移（upgrade） | v1 工程一键迁移：三层配置、工程脚本、技能旧名与规范载体；支持预演、复检、备份恢复 | [升级迁移](./docs/cli/upgrade.md) |
| Node API | 把上述能力嵌进脚本或平台 | [API 参考](./docs/api.md) |

## 📚 文档

| 文档 | 适合谁 |
| --- | --- |
| [快速开始](./docs/getting-started.md) | 第一次接触，想 30 秒跑起来（含零基础术语表） |
| [推荐技能包](./docs/packages.md) | 按场景选择技能源（含 playbook 等外部来源） |
| [一图看懂](./docs/concepts.md) | 一张图看懂五件套的组成、关系与配合 |
| [适用场景](./docs/scenarios.md) | 按个人 / 团队 / 组织 / 沉淀者 / 维护者 / 存量迁移对号入座 |
| [内部推广](./docs/adoption.md) | 组织内推广：一句话介绍、讲稿、试点方案与决策者问答 |
| [操作手册](./docs/handbook.md) | 日常照着做：每个场景该说什么、做什么 |
| [完整攻略](./docs/guide.md) | 日常使用：工作流、Git 纳管、项目级激活、多语言 CHANGELOG |
| [CLI 参考](./docs/cli.md) | 查命令、参数、默认值、退出码 |
| [配置参考](./docs/config.md) | 查配置文件字段（全局 / 项目 / 本地三层） |
| [API 参考](./docs/api.md) | 作为库引入 Node 项目 |
| [全局规则](./docs/rules/index.md) | 规则组合器：模块自由勾选、排序与一键复制 |
| [AI 全局规则](./docs/rules/ai.md) | 想让 AI 助手按本工具的最佳实践协作 |
| [提交信息规则](./docs/rules/commit.md) | 想让 AI 按统一格式写 git 提交信息 |
| [技能使用情况规则](./docs/rules/usage.md) | 启用本机使用统计后，约束 AI 不重复补记、不外传数据 |
| [技能使用情况概览](./docs/usage/index.md) | 启用后可查技能调用次数、触发词与采集边界 |
| [v1 → v2 升级](./docs/upgrade-v2.md) | 从 1.x 迁移：一键迁移与手工兜底 |
| [常见问题](./docs/faq.md) | 遇到问题先来这里找 |
| [更新日志](./docs/changelog.md) | 查各版本变更内容 |
| [完整文档站](https://fxri-net.github.io/toolkit/) | 在线阅读体验 |

## 🧩 AI 技能包（skills）

安装步骤见上文「30 秒上手」（全局装 CLI 后跑 `toolkit setup`）；下面是分面与开关细节。

```bash
pnpm add -g @fxri/toolkit && toolkit skill install  # 装了 CLI 一键分发（npm 用户：npm add -g @fxri/toolkit）
toolkit skill install --scope project               # 项目面分发：真源与项目面薄壳随仓库入库、队友 clone 即用
pnpm dlx skills add fxri-net/toolkit                # 也可用上游安装器（npm 用户：npx skills add fxri-net/toolkit）
```

技能随包分发（真源为包内 `skills/`），与 CLI 同一发布批次（技能内容版本独立编号）。

- **默认形态**：`toolkit skill install` 默认软链，链接创建失败自动降级副本；`toolkit skill status` 查现场，`toolkit skill uninstall` 卸载
- **交互两步**：先按 `metadata.tier` 选技能，再选目标（`canonical` 主目标 + 已检测 agent；项目面为候选薄壳目录）
  - `core`：`fxri-plan-task`、`fxri-plan-recap`、`fxri-plan-review`，`skills` 模式必装、`package` 模式可选
  - `optional`：`fxri-release-changelog`、`fxri-base-encoding`、`fxri-writing-skill`、`fxri-writing-docs`、
    `fxri-test-tty`、`fxri-base-adoption`
- **跳过交互**：`--skills` / `--all` / `--no-optional` / `--agent` / `--all-agents` / `--yes`
  首次按模式默认（`skills` 装 `core`、`package` 零装）与全部可用目标，`--no-save-agents` 只影响本次
- **模式**：`--mode package` 切纯包管理器模式（core 也可不装、允许零选），`--no-skills` 仅本次零装
  选择集分别写入 `~/.toolkitrc.json` 的 `skillInstall` 与项目层 `.toolkitrc.json` 的 `projectSkill`；
  旧段名 `skillsInstall` / `projectSkills` 仍可读，`toolkit task init` 会自动重写
- **外部来源**：`--source <name|path>` 临时纳入（已登记来源名、目录或 Git 地址；副本、只写本次），
  加 `--save [name]` 登记为永久来源（默认软链）；`toolkit skill source` 查看 / 注销来源
- **作用域**：`--scope project` 换项目面——真源落 `<仓库根>/.agents/skills/`、其余候选目录落项目面薄壳，
  随 git 入库后队友 clone 靠 `toolkit task init` 写入的 `prepare` 钩子自动刷新已有产物（不新增技能）

- [fxri-plan-task](./skills/fxri-plan-task/SKILL.md)：方案确认后落盘为任务文件（任务分解与纯展示计划表、一次建完全部任务档、check、归档 + 任务级规范沉淀为强制终点）
- [fxri-release-changelog](./skills/fxri-release-changelog/SKILL.md)：发版时创建变更集、格式化多语言 CHANGELOG
- [fxri-plan-recap](./skills/fxri-plan-recap/SKILL.md)：会话收尾全量沉淀、新会话三层恢复、历史任务时间批量修正（1.7.0 新增技能）
- [fxri-plan-review](./skills/fxri-plan-review/SKILL.md)：复核已落档任务拆分，输出新增疏漏与建议，按后续是否落档标记
- [fxri-base-encoding](./skills/fxri-base-encoding/SKILL.md)：文本字节形态基线（文件、管道、命令行、API 请求体，含临时脚本与一次性命令），
  非 ASCII 文本丢失 / 乱码与首行报错的定位与修复
- [fxri-writing-docs](./skills/fxri-writing-docs/SKILL.md)：文档站写作规范（分类骨架、页面标题「显示名（标识）」、索引与引用口径、导航短别名、顶栏与 404、代码块注释对齐）
- [fxri-writing-skill](./skills/fxri-writing-skill/SKILL.md)：技能编写规范（统一骨架、references 拆分、安全边界，机械校验交给 lint 与 bump）
- [fxri-test-tty](./skills/fxri-test-tty/SKILL.md)：交互路径真终端测试（PTY 驱动按键序列，断言退出码、落盘产物与沙箱隔离）
- [fxri-base-adoption](./skills/fxri-base-adoption/SKILL.md)：概念目录与能力采纳（读取概念清单，按场景给候选与成本 / 风险，用户选择后逐步引入）

skills 与工具的关系、只在公司项目激活等说明见 [常见问题](./docs/faq.md) 与 [完整攻略](./docs/guide.md#ai-技能包-skills)。

## 📦 安装

```bash
pnpm add -g @fxri/toolkit    # 全局（个人多项目默认；pnpm 不受 nvm 切版本影响）
pnpm add -D @fxri/toolkit    # 项目 devDependency（团队项目推荐，版本随仓库锁定）
pnpm dlx @fxri/toolkit task  # 不安装临时执行
```

npm / yarn / bun 用户与各方式对比见 [快速开始 · 完整安装](./docs/getting-started.md#完整安装)。

## 🔒 隐私脱敏

落盘记录默认按内置规则脱敏（敏感信息不落盘），支持自定义规则与禁用，规则清单见[配置参考 · 隐私脱敏](./docs/config/redact.md)。
开关三档（CLI 参数 > 环境变量 > 配置文件），详见 [配置参考](./docs/config.md)。

## ⚙️ 环境要求

- 运行环境 Node.js >= 18.17.0（Node 18 已 EOL，仅保证可运行，见 [常见问题](./docs/faq.md#node-18-能用吗)）
- 开发本仓库 Node.js >= 20.19（以 `.node-version` 为准）

## 📄 版权信息

作者：唐启云 <tqy@fxri.net>

出品：方弦研究所

版权：Copyright © 2026 唐启云. All rights reserved.

网站：[方弦研究信息网](https://fxri.net:444/)

协议：[MIT License](./LICENSE)

商标："方弦®"为第42类注册商标（注册号89648411），本开源许可不授予商标使用权，详见 [TRADEMARK.md](./TRADEMARK.md)

> 方弦研究所为唐启云个人项目品牌与出品方，非独立法人实体；本软件著作权归唐启云所有。
