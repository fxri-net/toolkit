---
layout: home
# 首页无正文 h1，显式给 title 避免浏览器标签出现「方弦工具集 - 方弦工具集」重复
title: 任务管理 + 多语言 CHANGELOG

hero:
  name: 方弦工具集
  text: 任务管理 + 多语言 CHANGELOG
  tagline: 专为多人 + AI 跨项目协作打造。把方案确认、任务校验、归档链路沉淀为仓库内可检索、可校验的文件，顺手解决发版 CHANGELOG 的多语言维护问题。
  actions:
    - theme: brand
      text: 30 秒上手
      link: ./getting-started
    - theme: alt
      text: 完整攻略
      link: ./guide
    - theme: alt
      text: GitHub
      link: https://github.com/fxri-net/toolkit

features:
  - icon: ✅
    title: 方案落盘即约束
    details: 方案确认完就丢、AI 会话一关什么都不剩？任务文件落在仓库 .tasks/，toolkit tasks check 校验、tasks archive 归档，强制约束到归档为止。
  - icon: 🔒
    title: 多人协作不互踩
    details: 任务唯一键 + 先查后写约定 + 归档排他锁，多人（含多个 AI）同时维护任务不会互相覆盖。
  - icon: 📊
    title: 全目录总览与统计
    details: 一条命令扫 .tasks/ 全目录，按状态/负责人/范围/日期过滤，可导出 CSV / XLSX / JSON。
  - icon: 🌍
    title: 多语言 CHANGELOG
    details: 封装 changesets，内置中文格式化，分组标题不再被英文格式头绑架，任意语言可配置扩展。
  - icon: 🛡️
    title: 隐私脱敏
    details: 任务正文与 CHANGELOG 落盘前自动掩码邮箱、手机号、密钥等敏感信息，多人协作不泄密。
  - icon: 🧩
    title: AI 技能包
    details: 不装本工具，也能让 AI 按同一套规范干活——零依赖 Agent Skills，各 agent 全局技能目录通用。
---

## 30 秒上手

按你的包管理器选一条安装，随后查看当前任务：

::: code-group

```sh [pnpm]
pnpm add -D @fxri/toolkit
```

```sh [npm]
npm install -D @fxri/toolkit
```

```sh [yarn]
yarn add -D @fxri/toolkit
```

```sh [bun]
bun add -D @fxri/toolkit
```

:::

```sh
# 查看当前任务
pnpm exec toolkit tasks
```

详细步骤见[新手指南](./getting-started)。

## 解决什么痛点

| 痛点 | 本工具的做法 |
| --- | --- |
| 方案确认完就丢，AI 会话一关什么都不剩 | 方案落盘为标准任务文件，`toolkit tasks check` 校验、`toolkit tasks archive` 归档，强制约束到归档为止 |
| 多人（含多个 AI）同时维护任务，互相覆盖 | 任务唯一键 + 「先查后写」约定 + 归档排他锁 |
| 任务散落各处，总览、过滤、统计靠人肉 | 一条命令扫 `.tasks/` 全目录，按状态/负责人/范围/日期过滤，可导出 CSV / XLSX / JSON |
| 发版 CHANGELOG 分组标题是英文，多语言项目要人肉翻译 | 封装 changesets，内置中文格式化，任意语言可配置扩展 |

## 文档索引

| 文档 | 适合谁 |
| --- | --- |
| [新手指南](./getting-started) | 第一次接触，想 30 秒跑起来 |
| [完整攻略](./guide) | 日常使用：工作流、Git 纳管范围、项目级激活、多语言 CHANGELOG |
| [CLI 参考](./cli) | 查命令、参数、默认值、退出码 |
| [API 参考](./api) | 作为库引入 Node 项目，写脚本或二次开发 |
| [配置参考](./config) | 查 `.toolkitrc.json` 字段 |
| [FAQ](./faq) | 遇到问题先来这里找 |
| [推荐 AI 全局规则](./ai-rules) | 想让 AI 助手按本工具的最佳实践协作 |

## 环境要求

- Node.js >= 20

## 相关仓库文件

- [任务文件规范 SPEC.md](https://github.com/fxri-net/toolkit/blob/main/SPEC.md)：任务文件格式的单一事实源
- [AI 技能包 skills/](https://github.com/fxri-net/toolkit/tree/main/skills)：零依赖 Agent Skills
