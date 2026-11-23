---
"@fxri/toolkit": patch
---

- 新增：作用域写命令（`scope list *` / `policy *` / `skills *` 与向导）写入后按矩阵自动收敛技能产物，写前预览形态变更、写后逐技能报告
- 新增：`toolkit skill reconcile`，手工改配置或队友 pull 后一键对齐已装产物形态（不改选择集、不新增技能）
- 优化：`--no-link` 只写配置并在 stderr 提示；`--dry-run` 预演包含技能形态变更；收敛失败退出码非 0
