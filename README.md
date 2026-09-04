# @fxri/toolkit

[![CI](https://github.com/fxri-net/toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/fxri-net/toolkit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@fxri/toolkit)](https://www.npmjs.com/package/@fxri/toolkit)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](./docs/getting-started.md#安装)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

专为**多人 + AI 跨项目协作**打造：任务管理 + 多语言 CHANGELOG。

AI 参与开发后，方案与决策散落在对话记录里，会话一关什么都不剩；任务记录零散，谁在做、做到哪，无从查起；发版 CHANGELOG 还要人肉维护多语言。本工具把这条链路沉淀为**仓库内可检索、可校验、可归档的文件**——人离开会话，记忆留在仓库里。

- **零依赖 AI 技能包（skills）**：方案落盘、发版 CHANGELOG 两套工作流沉淀为 Agent Skills，不绑定任何 AI 工具；skills 可以独立工作，CLI 是可选加速——推荐都装，体验最完整（[什么关系？](./docs/faq.md#工具和-skills-都得装吗)）
- **不懂 AI 也能用**：任务管理与 CHANGELOG 是纯 CLI 能力；术语都说了人话（[先看术语表](./docs/getting-started.md#几个术语先说人话)）

## 🚀 30 秒上手

```bash
# 1. 项目内安装（推荐，团队共享版本）
pnpm add -D @fxri/toolkit

# 2. 初始化任务区（生成 .tasks/ 骨架，1.7.0 新增）
pnpm exec toolkit init

# 3. 查看任务总览
pnpm exec toolkit tasks
```

之后：方案确认后登记为 `.tasks/` 任务文件 → `pnpm exec toolkit tasks check` 校验 → 完成后 `pnpm exec toolkit tasks archive` 归档。完整步骤见 [新手指南](./docs/getting-started.md)。

## ✨ 能力矩阵

| 能力 | 适用场景 | 文档 |
| --- | --- | --- |
| 任务管理（tasks） | 方案落盘、总览过滤、校验归档、导入导出 CSV / XLSX / JSON | [CLI 参考](./docs/cli.md) · [任务文件规范](./docs/guide.md#任务文件规范) |
| 多语言 CHANGELOG（changelog） | 封装 changesets 发版、分组标题本地化 | [CLI 参考](./docs/cli.md#changelog-changelog) |
| Node API | 把上述能力嵌进脚本或平台 | [API 参考](./docs/api.md) |
| 隐私脱敏 | 落盘前自动掩码邮箱、手机号、密钥等 | [配置参考](./docs/config.md) |
| AI 技能包（skills） | 不装本工具也能让 AI 按同一套规范干活 | [完整攻略](./docs/guide.md#ai-技能包-skills) · [FAQ](./docs/faq.md#工具和-skills-都得装吗) |
| 配置文件 | 按项目定制脱敏、告警、导入列映射、语言表 | [配置参考](./docs/config.md) |

## 📚 文档

| 文档 | 适合谁 |
| --- | --- |
| [新手指南](./docs/getting-started.md) | 第一次接触，想 30 秒跑起来（含零基础术语表） |
| [完整攻略](./docs/guide.md) | 日常使用：工作流、Git 纳管、项目级激活、多语言 CHANGELOG |
| [CLI 参考](./docs/cli.md) | 查命令、参数、默认值、退出码 |
| [API 参考](./docs/api.md) | 作为库引入 Node 项目 |
| [配置参考](./docs/config.md) | 查 `.toolkitrc.json` 字段 |
| [FAQ](./docs/faq.md) | 遇到问题先来这里找 |
| [推荐 AI 全局规则](./docs/ai-rules.md) | 想让 AI 助手按本工具的最佳实践协作 |
| [完整文档站](https://fxri-net.github.io/toolkit/) | 在线阅读体验 |

## 🧩 AI 技能包（skills）

```bash
pnpm dlx skills add fxri-net/toolkit   # npm 用户：npx skills add fxri-net/toolkit
```

- [fxri-plan-to-task](./skills/fxri-plan-to-task/SKILL.md)：方案确认后落盘为任务文件（先查后写、check、归档与提交同批）
- [fxri-release-changelog](./skills/fxri-release-changelog/SKILL.md)：发版时创建变更集、格式化多语言 CHANGELOG
- [fxri-session-recap](./skills/fxri-session-recap/SKILL.md)：会话结束前归档结论，新会话开头恢复上下文（1.7.0）

skills 与工具的关系、只在公司项目激活等说明见 [FAQ](./docs/faq.md) 与 [完整攻略](./docs/guide.md#ai-技能包-skills)。

## 📦 安装

```bash
pnpm add -D @fxri/toolkit        # 项目 devDependency（团队项目推荐，版本随仓库锁定）
pnpm i -g @fxri/toolkit          # 全局（个人多项目推荐；pnpm 不受 nvm 切版本影响）
pnpm dlx @fxri/toolkit tasks     # 不安装临时执行
```

npm / yarn / bun 用户与各方式对比见 [新手指南 · 安装](./docs/getting-started.md#安装)。

## 🔒 隐私脱敏

落盘记录默认脱敏敏感信息：内置邮箱、手机号、身份证、IPv4、内网 URL、JWT、AWS / GitHub / OpenAI / Slack 密钥等 13 类规则，支持自定义规则与禁用。开关三档（CLI 参数 > 环境变量 > 配置文件），详见 [配置参考](./docs/config.md)。

## ⚙️ 环境要求

- Node.js >= 20（Node 18 可安装，changesets 相关子命令不可用，见 [FAQ](./docs/faq.md#node-18-能用吗)）

## 📄 版权信息

作者：唐启云 <tqy@fxri.net>

出品：方弦研究所

版权：Copyright © 2026 唐启云. All rights reserved.

网站：[方弦研究信息网](https://fxri.net:444/)

协议：[MIT License](./LICENSE)

商标："方弦®"为第42类注册商标（注册号89648411），本开源许可不授予商标使用权，详见 [TRADEMARK.md](./TRADEMARK.md)

> 方弦研究所为唐启云个人项目品牌与出品方，非独立法人实体；本软件著作权归唐启云所有。
