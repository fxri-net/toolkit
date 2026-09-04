---
name: fxri-release-changelog
description: 基于 changesets 的发版与多语言 CHANGELOG 维护流程：创建变更集、消费发版、把分组标题与条目转为项目语言风格、清理变更集、打标签发布；无 changesets 的项目提供同格式手工模式。当用户提到创建变更集、changeset、发版、version、整理或格式化 CHANGELOG 时使用。不用于日常 commit message 撰写或与发版无关的文档修改。
license: MIT
metadata:
  version: "1.0.2"
  author: fxri
  source: https://github.com/fxri-net/toolkit
---

# 发版与 CHANGELOG

## 何时使用

- 记录变更（创建变更集）、消费变更集发版、格式化 CHANGELOG
- 触发词：changeset / 变更集 / 发版 / version / CHANGELOG 格式化

**何时不使用**：日常 commit message 撰写、与发版无关的文档修改。

## 前置检查

- 项目根存在 `.changeset/` 目录 → 走「changesets 流程」
- 不存在 → 走「手工模式」（规范见 `references/changelog-format.md`）

## changesets 流程

1. 记录变更：`npx changeset`（或项目包管理器等价脚本），按影响选 patch / minor / major 并写变更描述
2. 消费发版：`npx changeset version`——自动写版本号与 CHANGELOG
3. 格式化：按 `references/changelog-format.md` 转换分组标题、润色条目为项目语言风格（中文示例：`### Patch Changes` → `### 🐛 补丁修复`）
4. 清理：删除已消费的 `.changeset/*.md`
5. 发布：提交版本与 CHANGELOG 改动 → 打 `vX.Y.Z` 标签 → 按项目渠道发布（如 `npm publish`）

⚠️ 自动生成的条目必须人工核对润色，与仓库既有 CHANGELOG 风格保持一致。

## 手工模式（无 changesets 项目）

版本号与 CHANGELOG 全部手工维护：版本标题、发布日期行、分组标题与条目格式见 `references/changelog-format.md`；多语言三段结构（标题替换映射 / 依赖更新文案 / 发布日期后缀）同文件。

## 失败模式

| 症状 | 处置 |
| --- | --- |
| version 后 CHANGELOG 分组标题仍是英文 | 按 references 的映射表补一次格式化 |
| 条目与仓库既有风格不一致 | 人工润色为项目语言与句式，勿保留机器直译 |
| 变更集遗漏（发版后才发现功能未记录） | 补建变更集随下次发版；本次在发布说明中人工补充 |

## 可选加速（不构成依赖）

⚠️ 工具探测顺序（先项目内、后全局）：先 `pnpm exec toolkit --help`（项目 devDependency，npm 项目等价 `npx toolkit`），失败再 `toolkit --help`（全局安装）；两者都不可用即工具未安装，按各步手工继续，**不安装、不阻塞**。探测成功后用对应前缀执行下列命令：

- `toolkit changelog`：创建变更集（等价 changeset）
- `toolkit changelog version`：发版并自动做中文分组标题格式化
- `toolkit changelog format`：仅格式化既有 CHANGELOG
- `toolkit changelog --lang <语言> …`：切换输出语言（内置 zh / en，其余可配置扩展）
