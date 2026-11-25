---
name: fxri-writing-skill
description: 编写或修改 AI 技能（SKILL.md 与 references）时加载：按统一骨架组织入口、判断何时拆 references、写清触发与不做，并复用 toolkit 的机械校验与版本递增。新建技能、调整技能结构、评审技能文案或把其他仓库的规范迁入技能时适用。不用于任务建档、发版流程或普通项目文档写作。
license: MIT
metadata:
  version: "1.0.5"
  tier: optional
  previousNames: ["fxri-skill-authoring"]
  type: practice
  scope: skills
  triggers: [新建技能, 技能结构, references 拆分, 技能文案评审]
  author: fxri
  source: https://github.com/fxri-net/toolkit
---

# 技能编写规范

> 本技能版本 1.0.5（随 @fxri/toolkit 同批分发）。被问版本时即报此值（不读磁盘、不跑 CLI）；与 `toolkit skill status` 的磁盘值不一致即说明会话上下文已过期，开新会话即可。

## 何时使用

- 新建技能，或调整现有技能的目录结构、入口篇幅与 references 拆分。
- 修改 SKILL.md 或 references 正文（含单条规则、校验口径）同样适用；仅改错别字可只跑收尾三项（`skill lint`、版本递增、变更集）。
- 评审技能文案：触发面是否清楚、入口是否只放判断与流程、细节是否已下沉。
- 把散落在仓库脚本或文档里的规范迁入技能，需要判断哪些可机械校验、哪些只能靠文字。
- 其他工具仓要写自己的技能，需要对齐命名、frontmatter、版本与安全边界。

不适用：普通项目文档写作、任务建档与归档、发版与更新日志；这些各有对应技能。

## 工作流

1. **先定判断，再写入口**：先写清「何时加载、先做什么、什么不做」，再决定需要哪些细节文件。
   入口只保留判断链与最短步骤；示例、长清单、平台差异等细节下沉到 references 目录。
2. **命名与目录**：技能名为 `fxri-<族>-<主题>`、目录与 name 一致；族先在 `namespaces.json` 登记，主题非空且不与族重名。
   一个目录一个技能，入口文件固定为 `SKILL.md`，避免安装后状态与产物对不上。
3. **frontmatter 与版本行**：补齐 `name` / `description` / `license` / `metadata.version` / `metadata.tier` /
   `metadata.author` / `metadata.source`，以及 `metadata.type`（`profile` / `practice` / `template`）、`metadata.scope` 与
   `metadata.triggers`；正文首部写一行「本技能版本 x.y.z」，与 frontmatter 保持同值。
4. **拆分 references**：入口接近体量上限、或某类读者只需其中一段时再拆；拆出的文件必须在入口或同技能文档内被引用，
   引用用相对路径，不指向技能目录之外。不为「以后可能用到」提前拆档。
5. **把可机械检出的规则交给工具**：命名族与元数据、字段、两处版本一致、篇幅、references 可达性、敏感信息与版本递增，
   统一由 `toolkit skill lint` 判定；技能正文只写判断口径，不复制阈值、正则或字段清单的判定实现。
6. **版本独立递增**：技能内容变更时用 `toolkit skill bump` 同时改写两处版本声明；技能版本不跟随产品包版本，
   内容没变就不递增。两处版本不一致时先跑 lint 定位，再用 `--from` 显式选择源头。
7. **收尾**：先跑 `toolkit skill lint skills/`；版本递增用 `toolkit skill bump`，可加 `--sync-tables` 同步技能表版本列（快照仍由测试 `-u` 生成）；
   最后补 patch 变更集，技能表里的版本与层级必须与真源一致。

## 不做

- 不把 lint 已覆盖的阈值、正则、字段判定再抄一遍到技能正文，避免两处漂移。
- 不写密钥、令牌、机器绝对路径或本机用户名；示例一律用占位符。
- 不复制其他仓库的规范条文；需要跨仓共享时，把规范放进 toolkit 技能，其他仓只加载或调用命令。
- 不在产品仓维护技能规范的副本；产品仓门禁只调用 `toolkit skill lint` / `toolkit skill bump`。
- 不为了凑篇幅拆 references，也不把长流程硬塞进入口。

## 参考

- 逐项自查清单：`references/checklist.md`
- 机械校验：`toolkit skill lint`；版本递增：`toolkit skill bump`
