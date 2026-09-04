# @fxri/toolkit

专为**多人 + AI 跨项目协作**打造：任务管理 + 多语言 CHANGELOG。

AI 参与开发后，产出与决策散落在对话记录里，会话结束即消失，换个人（或换个会话）接手无从查起。本工具把这条链路沉淀为**仓库内可检索、可校验、可归档的文件**，并顺手解决发版 CHANGELOG 的多语言维护问题。

## 解决什么痛点

| 痛点 | 本工具的做法 |
| --- | --- |
| 方案确认完就丢，AI 会话一关什么都不剩 | 方案落盘为标准任务文件，`toolkit tasks check` 校验、`toolkit tasks archive` 归档，与代码变更同一提交 |
| 多人（含多个 AI）同时维护任务，互相覆盖 | 任务唯一键 + 「先查后写」约定 + 归档排他锁 |
| 任务散落各处，总览、过滤、统计靠人肉 | 一条命令扫 `.tasks/` 全目录，按状态/负责人/范围/日期过滤，可导出 CSV / XLSX / JSON |
| 发版 CHANGELOG 分组标题是英文，多语言项目要人肉翻译 | 封装 changesets，内置中文格式化，任意语言可配置扩展 |

## 能力矩阵

| 能力 | 适用场景 | 文档 |
| --- | --- | --- |
| 任务管理（tasks） | 方案落盘、总览过滤、校验归档、导入导出 | [CLI 参考](./cli) · [任务文件规范](./guide#任务文件规范) |
| 多语言 CHANGELOG（changelog） | changesets 发版、分组标题本地化 | [CLI 参考](./cli#changelog-changelog) |
| Node API | 把上述能力嵌进脚本或平台 | [API 参考](./api) |
| 隐私脱敏 | 任务正文/CHANGELOG 落盘前自动掩码邮箱、手机号、密钥等 | [配置参考](./config#redact) · [完整攻略](./guide#隐私脱敏) |
| AI 技能包（skills） | 不装本工具也能让 AI 按同一套规范干活 | [完整攻略](./guide#ai-技能包-skills) · [FAQ](./faq#工具和-skills-都得装吗) |
| 配置文件 | 按项目定制脱敏、告警、导入列映射、语言表 | [配置参考](./config) |

## 30 秒上手

```bash
# 项目内安装（推荐）
pnpm add -D @fxri/toolkit

# 查看当前任务
pnpm exec toolkit tasks
```

详细步骤见[新手指南](./getting-started)。

## 文档索引

| 文档 | 适合谁 |
| --- | --- |
| [新手指南](./getting-started) | 第一次接触，想 30 秒跑起来 |
| [完整攻略](./guide) | 日常使用：工作流、Git 纳管范围、项目级激活、多语言 CHANGELOG |
| [CLI 参考](./cli) | 查命令、参数、默认值、退出码 |
| [API 参考](./api) | 作为库引入 Node 项目 |
| [配置参考](./config) | 查 `.toolkitrc.json` 字段 |
| [FAQ](./faq) | 遇到问题先来这里找 |
| [推荐 AI 全局规则](./ai-rules) | 想让 AI 助手按本工具的最佳实践协作 |

## 环境要求

- Node.js >= 20

## 相关仓库文件

- [任务文件规范 SPEC.md](https://github.com/fxri-net/toolkit/blob/main/SPEC.md)：任务文件格式的单一事实源
- [AI 技能包 skills/](https://github.com/fxri-net/toolkit/tree/main/skills)：零依赖 Agent Skills
