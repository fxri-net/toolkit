---
layout: home
# 首页无正文 h1，显式给 title 避免浏览器标签出现「方弦工具集 - 方弦工具集」重复
title: 把 AI 协作沉淀为工程资产

hero:
  name: 方弦工具集
  text: 把 AI 协作沉淀为工程资产
  tagline: 专为多人 + AI 跨项目协作打造。方案与交付离开对话、进入仓库：可校验、可分发、可迁移。
  actions:
    - theme: brand
      text: 30 秒上手
      link: ./getting-started
    - theme: alt
      text: 一图看懂
      link: ./concepts
    - theme: alt
      text: 完整攻略
      link: ./guide

features:
  - icon: ✅
    title: 协作 · 方案落盘即约束
    details: 方案确认完就丢、AI 会话一关什么都不剩？任务文件落在仓库 .tasks/，格式自动校验、完成后自动归档，决策不再随会话消失。
  - icon: 📐
    title: 协作 · 规范载体可校验
    details: 任务里提炼的规范收进 .tasks/conventions/：v3 三分区、稳定 ID 索引、结构升级与表格 / 索引单元格归一，规范可检索也可体检。
  - icon: 🔒
    title: 协作 · 多人协作不互踩
    details: 任务唯一键 + 先查后写约定 + 归档排他锁，多人（含多个 AI）同时维护任务不会互相覆盖。
  - icon: 📊
    title: 协作 · 全目录总览与统计
    details: 一条命令扫 .tasks/ 全目录，按状态/负责人/范围/日期过滤，可导出 CSV / XLSX / JSON。
  - icon: 🧩
    title: 分发 · AI 技能包
    details: 不装本工具，也能让 AI 按同一套规范干活——零依赖 Agent Skills，各 agent 全局技能目录通用。装了 CLI 后一条命令分发到各 agent，与 CLI 同一发布批次。
  - icon: 🧭
    title: 分发 · 全局规则可组合
    details: 按模块组合、排序与复制 AI 全局规则（角色、输出、工作流、提交、使用统计等），预设与缓存随包分发，升级后重新组合即同步。
  - icon: 🎯
    title: 分发 · 作用域按目录生效
    details: 默认全域生效；只想在公司项目生效、个人项目不被插入时，按目录、标记、git 远端或技能矩阵设定生效范围，必要时做项目面安装。
  - icon: 📈
    title: 分发 · 技能使用有据可查
    details: 统计技能在哪些会话、被哪句话触发、用了多少次；默认关闭、不联网、数据只留本机。
  - icon: 🌍
    title: 治理 · 多语言 CHANGELOG
    details: 封装 changesets，条目按变更类型（新增/修复/优化…）语义分组，分组标题不再被英文格式头绑架，任意语言可配置扩展。
  - icon: 🛡️
    title: 治理 · 隐私脱敏
    details: 任务正文与 CHANGELOG 落盘前自动掩码邮箱、手机号、密钥等敏感信息，多人协作不泄密。
  - icon: 🌐
    title: 治理 · 文档站工程化
    details: 主题、导航与构建产物按随包规则校验，多仓文档站样式与导航漂移一条命令发现。
---

## 按场景进入

| 你是… | 从这里开始 |
| --- | --- |
| 个人 AI 重度用户 | [适用场景 · 个人](./scenarios#个人-ai-重度用户)：跨会话不丢上下文 |
| 团队 AI 协作开发 | [适用场景 · 团队](./scenarios#团队-ai-协作开发)：多人多 AI 不互相覆盖 |
| 公司 / 组织内部统一 | [适用场景 · 组织](./scenarios#公司-组织内部统一)：统一规范、按目录生效 |
| 想把工具推给团队 | [内部推广](./adoption)：一句话介绍、试点方案与决策者问答 |

## 30 秒上手

官方推荐路径：全局装 CLI → `toolkit setup` 一步完成技能、规则与生效范围。按你的包管理器选一条安装：

::: code-group

```sh [pnpm]
pnpm add -g @fxri/toolkit
```

```sh [npm]
npm add -g @fxri/toolkit
```

```sh [yarn]
yarn global add @fxri/toolkit
```

```sh [bun]
bun add -g @fxri/toolkit
```

:::

```sh
toolkit setup  # 装技能、配规则、设生效范围（交互向导，可在任意目录执行）
```

任务区初始化交给 AI：进入项目后说「初始化任务区」即可（技能执行 `toolkit task init`）。团队项目改用 `pnpm add -D @fxri/toolkit` +
`toolkit skill install --scope project` 锁定版本，项目内执行命令用 `pnpm exec toolkit`。

详细步骤见[快速开始](./getting-started)。

## 文档索引

| 文档 | 适合谁 |
| --- | --- |
| [快速开始](./getting-started) | 第一次接触，想 30 秒跑起来 |
| [推荐技能包](./packages) | 按场景选择技能源（含外部来源） |
| [一图看懂](./concepts) | 一张图看懂五件套的组成、关系与配合 |
| [适用场景](./scenarios) | 按个人 / 团队 / 组织 / 沉淀者 / 维护者 / 存量迁移对号入座 |
| [内部推广](./adoption) | 组织内推广：一句话介绍、讲稿、试点方案与决策者问答 |
| [操作手册](./handbook) | 日常照着做：每个场景该说什么、做什么 |
| [完整攻略](./guide) | 日常使用：工作流、Git 纳管范围、项目级激活、多语言 CHANGELOG |
| [CLI 参考](./cli) | 查命令、参数、默认值、退出码 |
| [配置参考](./config) | 查 `.toolkitrc.json` 字段 |
| [API 参考](./api) | 作为库引入 Node 项目，写脚本或二次开发 |
| [全局规则](./rules/) | 规则组合器：模块自由勾选、排序与一键复制 |
| [AI 全局规则](./rules/ai) | 想让 AI 助手按本工具的最佳实践协作 |
| [提交信息规则](./rules/commit) | 想让 AI 按统一格式写 git 提交信息 |
| [技能使用情况规则](./rules/usage) | 启用本机使用统计后，约束 AI 不重复补记、不外传数据 |
| [技能使用情况概览](./usage/) | 启用后查技能调用次数、触发词与采集边界 |
| [v1 → v2 升级](./upgrade-v2) | 从 1.x 迁移：一键迁移与手工兜底 |
| [常见问题](./faq) | 遇到问题先来这里找 |
| [更新日志](./changelog) | 查各版本变更内容 |

## 环境要求

- Node.js >= 18.17.0（Node 18 已 EOL，仅保证可运行）

## 相关仓库文件

- [任务文件规范 SPEC.md](https://github.com/fxri-net/toolkit/blob/main/SPEC.md)：任务文件格式的单一事实源
- [AI 技能包 skills/](https://github.com/fxri-net/toolkit/tree/main/skills)：零依赖 Agent Skills，
   可用 `toolkit skill install` 分发到各 agent 全局技能目录

## 相关页面

- 参考：[推荐技能包](./packages) · [完整攻略](./guide) · [常见问题](./faq)
