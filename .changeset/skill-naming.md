---
"@fxri/toolkit": major
---

- 修改：技能名收敛为 `fxri-<族>-<主题>`：`plan-to-task → plan-task`、`session-recap → plan-recap`、`skill-authoring → writing-skill`、`docs-writing → writing-docs`、`text-encoding → code-encoding`
- 新增：`skills/namespaces.json` 族表，`skill lint` 校验族归属、主题与 `metadata.type/scope/triggers`
- 优化：旧技能名写入 `metadata.previousNames`，已保存选择集、安装迁移与状态提示自动跟随新名
