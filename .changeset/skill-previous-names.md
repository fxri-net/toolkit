---
"@fxri/toolkit": patch
---

- 新增：外部技能来源支持 `previousNames` 曾用名声明（`skills.json` 条目或 `SKILL.md` frontmatter 的 `metadata.previousNames`），安装时按别名迁移选择集与状态并清理旧名产物
- 修改：`skills install` 的 JSON 报告在各目标下新增 `migrated`（旧名 → 新名），文本模式回显「已改名迁移」
- 修改：曾用名与现用名或其他别名冲突、或声明格式非法时整源报错，不静默剔除
