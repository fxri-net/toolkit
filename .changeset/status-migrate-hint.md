---
"@fxri/toolkit": patch
---

- 新增：`toolkit status` 在检测到 v1 旧形态时追加「迁移」区块，提示运行 `toolkit upgrade --check`，只提示不自动修复
- 新增：迁移区块只查项目层与本地层，不进入 `issues`，不影响 `--check` 退出码
