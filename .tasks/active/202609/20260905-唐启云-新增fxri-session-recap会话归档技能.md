---
owner: 唐启云
status: 待办
created: 20260905
updated: 20260905
completed: ''
depends_on: ["20260905-唐启云-降级commander至Node20兼容版本"]
scope: toolkit
---

# 新增 fxri-session-recap 会话归档技能

## 背景

用户会话结束后上下文散失，跨会话无法延续。按已确认的场景 A 设计：全工具通用、零依赖。

## 实施方案

- `skills/fxri-session-recap/SKILL.md`：
  - 「归档本次会话」：沉淀当前会话 → 结论/决策写进任务文件（建档或更新）→ 未完事项拆独立任务 → 走 fxri-plan-to-task 归档流程
  - 「恢复上下文」：读 active 任务 + 最新归档 → 重建现场
  - 何时使用/不使用；跨会话能力边界说明（其他会话全文不可直读，依赖归档习惯；Claude Code 可直读转录为高级路径）
  - 主干 200 行内，细节下沉 references/
- `skills/README.md` 索引更新

## 影响范围

- 仅 skills/ 下文档（随 npm 包分发）

## 验证方式

- 与 fxri-plan-to-task 流程衔接一致（引用 task-spec.md 不重复定义）
- frontmatter 合规：name fxri- 前缀、description 含触发词与反向排除

## 完成说明

（完成后填写）
