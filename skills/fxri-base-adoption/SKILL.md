---
name: fxri-base-adoption
description: 当用户询问本工具能提供哪些工程概念、想把某个概念引入自己的项目，或在讨论门禁、多面一致（三方一致）、脱敏、安全删除、agent 适配等能力的取舍时加载：先读取概念目录，按场景给出候选与成本/风险，再由用户选择并逐步采纳。不用于直接编写业务代码、任务建档与发版流程。
license: MIT
metadata:
  version: "0.1.1"
  tier: optional
  type: practice
  scope: general
  triggers: [概念目录, 能力采纳, 引入门禁, 多面一致, 三方一致, 脱敏, agent 适配]
  author: fxri
  source: https://github.com/fxri-net/toolkit
---

# 概念目录与能力采纳

> 本技能版本 0.1.1（随 @fxri/toolkit 同批分发）。被问版本时即报此值（不读磁盘、不跑 CLI）；与 `toolkit skill status` 的磁盘值不一致即说明会话上下文已过期，开新会话即可。

## 何时使用

- 用户问「这个工具有哪些概念 / 能给我的项目加什么」。
- 用户想引入门禁、多面一致、隐私脱敏、安全删除、agent 适配等能力，但不确定选哪个。
- 用户需要在多个概念之间比较成本、风险与可逆性。
- 不用于直接写业务代码、任务建档、发版与提交信息。

## 工作流

1. **取目录**：执行 `toolkit concept list --format json`；没有 CLI 时读包内 `concepts/catalog.json`。
2. **筛选**：按 `signals`、别名与当前项目特征缩小候选，不要一次抛出全部 28 项。
3. **给选项**：列 2-4 个候选，逐项写清解决什么问题、要改哪些文件、成本与风险、是否可逆。
4. **等选择**：由用户拍板，不替用户决定是否引入。
5. **取步骤**：执行 `toolkit concept show <id> --format json`，按 `adoption.steps` 逐步落地。
6. **先预览后写入**：涉及写入 / 删除 / 覆盖时先列出目标并披露不可恢复部分；用户确认后再执行。
7. **验收**：跑项目自己的门禁；失败按步骤回滚。

## 不做

- 不在用户未选择时直接改项目。
- 不把概念目录当成任务清单，跳过确认批量执行。
- 不复制概念正文到项目里；项目需要的是采纳结果，不是目录副本。

## 参考

- 概念数据：包内 `concepts/catalog.json`（随包分发，不依赖外网）。
- 命令：`toolkit concept list`、`toolkit concept show <id>`。
