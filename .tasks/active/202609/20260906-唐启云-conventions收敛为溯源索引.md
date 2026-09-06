---
owner: 唐启云
status: 进行中
created: 20260906
updated: 20260906
completed: ''
depends_on: []
scope: toolkit
---

# conventions 收敛为溯源索引

## 背景

conventions.md 现有 8 条多与 AGENTS / ai-rules / skills 三层载体语义重复且出现表述漂移（「能力终点=沉淀」未随全局规则「收尾自动提交」更新）。按方案 B 收敛为「溯源簿」：每条只保留一句话语义 + 确立来源任务 + 单一事实源位置，不再复制条文。

## 实施步骤

1. 重写 .tasks/conventions.md 为溯源索引表（8 条映射：task-spec / ai-rules / AGENTS / skills 四类单一事实源），修正「能力终点=沉淀+自动提交」漂移；标注映射到 AGENTS 的行属「本仓库治理」
2. AGENTS.md 质量门时点约束补 conventions 同步：源头（AGENTS/ai-rules/skills）变更时同步检查 conventions 对应行
3. docs/guide.md「conventions.md：规范沉淀地」节补两种形态说明（条文式 / 溯源索引式），供其他用户参考
4. 门禁：tasks check 0/0、grep 措辞落地、docs:build 通过
5. 收尾：归档 → conventions 沉淀 → 自动提交

## 影响范围 · 文档触达核对

| 文档 | 触达 | 处理 |
| --- | --- | --- |
| README.md | 无触达 | 未描述 conventions 内容形态 |
| getting-started.md | 无触达 | 未描述 conventions |
| handbook.md | 无触达 | 会话边界节提规范沉淀不涉形态 |
| guide.md | ✅ | conventions 沉淀地节补两种形态说明 |
| faq.md | 无触达 | 无 conventions 问答 |
| cli.md / api.md / config.md | 无触达 | 无 CLI/API 变更 |
| ai-rules.md | 无触达 | 薄壳引用文件名不变 |
| AGENTS.md | ✅ | 质量门时点约束补 conventions 同步 |
| skills/ 三件套 | 无触达 | 措辞形态中性，不动（不发版） |
| SPEC.md / task-spec.md | 无触达 | 通用机制保留条文式能力，不改 |

## 验证与回滚

- tasks check 0/0、grep 确认索引表与 AGENTS 同步句落地、docs:build 通过
- 回滚：git revert
