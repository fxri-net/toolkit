---
name: fxri-release-changelog
description: 基于 changesets 的发版与多语言 CHANGELOG 维护流程：创建变更集、消费发版、把分组标题与条目转为项目语言风格、清理变更集、打标签发布；无 changesets 的项目提供同格式手工模式。当用户表达发版或记录变更意图——含创建变更集、changeset、发版、version、CHANGELOG 格式化等说法及其口语近义表达（如发一版、出个版本、记一下这次改动、生成更新日志）时使用。⚠️ 注意区分：用户说「提交个版本 / 先提交一版 / commit」通常指 git 提交当前改动（走任务收尾后提交），**不是发版**。不用于日常 commit message 撰写、git 提交操作或与发版无关的文档修改。
license: MIT
metadata:
  version: "1.0.11"
  author: fxri
  source: https://github.com/fxri-net/toolkit
---

# 发版与 CHANGELOG

> 本技能版本 1.0.11（随 @fxri/toolkit 同批分发）。被问版本时即报此值——不读磁盘、不跑 CLI：报出的值就是本会话上下文里已加载内容的版本，可与 `toolkit skills status` 打印的磁盘基准值对照，不一致即说明会话上下文已过期，开新会话即可。

## 何时使用

- 记录变更（创建变更集）、消费变更集发版、格式化 CHANGELOG（语义触发，不要求字面一致）：changeset / 变更集 / 发版 / version / CHANGELOG 格式化 / 发一版 / 出个版本 / 记一下这次改动 / 生成更新日志
- 触发前置条件：**用户明确表达发版或记录变更意图**。⚠️ **git 提交 ≠ 发版**：用户说「提交个版本 / 先提交一版 / 提交一下 / commit 这版」通常指把当前改动 git 提交（涉及任务时先走 fxri-plan-to-task / fxri-session-recap 收尾再提交），**不触发本技能**；纯日常对话出现「版本」字样也不触发
- 拿不准用户意图时向用户确认，不猜

**何时不使用**：日常 commit message 撰写、git 提交操作、与发版无关的文档修改。

## 前置检查

- ⚠️ 发版不是必经步骤：仅在用户明确要求，或用户全局 / 个人 / 项目规则约定时才进入本技能，不主动发版
- `.tasks/active/` 存在未归档任务 → 先完成归档再发版（任务归档是发版的前置顺序）
- 项目根存在 `.changeset/` 目录 → 走「changesets 流程」
- 不存在 → 走「手工模式」（规范见 `references/changelog-format.md`）

## changesets 流程

1. 记录变更：`npx changeset`（或项目包管理器等价脚本）——**变更描述一律以 `类型：` 前缀开头**（如 `新增：` / `修复：` / `优化：`），并按类型选影响级别（重大→major、新增/修改→minor、优化/修复/清理/文档→patch，完整对照见 `references/changelog-format.md`）
2. 消费发版：`npx changeset version`——自动写版本号与 CHANGELOG
3. 格式化：按 `references/changelog-format.md` 的语义分组规则归类条目、转换分组标题、润色为项目语言风格（中文示例：`### Patch Changes` 下的 `- 修复：xxx` → `### 🐛 问题修复` 下的 `- xxx`——归类后类型前缀被剥离，类型由分组标题承接）；分组维度与 bump 维度正交，条目归组只看类型前缀
4. 清理：删除已消费的 `.changeset/*.md`
5. 发布：提交版本与 CHANGELOG 改动 → 打 `vX.Y.Z` 标签 → 按项目渠道发布（如 `npm publish`）

⚠️ 自动生成的条目必须人工核对润色，与仓库既有 CHANGELOG 风格保持一致。

## 手工模式（无 changesets 项目）

版本号与 CHANGELOG 全部手工维护：版本标题、发布日期行、分组标题与条目格式见 `references/changelog-format.md`；多语言四段结构（语义分组 / 标题替换映射 / 依赖更新文案 / 发布日期后缀）同文件。

## 失败模式

| 症状 | 处置 |
| --- | --- |
| version 后 CHANGELOG 分组标题仍是英文 | 按 references 的映射表补一次格式化 |
| CHANGELOG 出现「- - 条目」双前缀伪影（变更集条目以 `- ` 开头） | `toolkit changelog version/format` 已自动还原为顶层条目；手工模式按 references 规则手动清理 |
| 条目与仓库既有风格不一致 | 人工润色为项目语言与句式，勿保留机器直译 |
| 变更集遗漏（发版后才发现功能未记录） | 补建变更集随下次发版；本次在发布说明中人工补充 |

## 可选加速（不构成依赖）

⚠️ 工具探测顺序（先项目内、后全局）：先 `pnpm exec toolkit --help`（项目 devDependency，npm 项目等价 `npx toolkit`），失败再 `toolkit --help`（全局安装）；两者都不可用即工具未安装，按各步手工继续，**不安装、不阻塞**。探测成功后用对应前缀执行下列命令：

- `toolkit changelog`：创建变更集（等价 changeset）
- `toolkit changelog version`：发版并自动做中文分组标题格式化
- `toolkit changelog format`：仅格式化既有 CHANGELOG
- `toolkit changelog --history format`：连带追溯改写历史版本块（用户主动要求修正历史块时才加，默认不动）
- `toolkit changelog --lang <语言> …`：切换输出语言（内置 zh / en，其余可配置扩展）
- ⚠️ `changelog` 域开了选项透传，自有选项（`--lang` / `--history` / `--redact` / `--warn`）必须写在子命令**之前**：`toolkit changelog --history format` 生效，写成 `toolkit changelog format --history` 会被 changesets 静默忽略（表现为「无 CHANGELOG 需要更新」）
- `toolkit skills install` / `toolkit skills status`：把本包 fxri-* 技能分发到各 agent 全局技能目录 / 查看链接与副本现场（技能随包同源分发，与 CLI 同一发布批次；技能内容版本独立编号，`skills status` 会打印各技能真源版本）
