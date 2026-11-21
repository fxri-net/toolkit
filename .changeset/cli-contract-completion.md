---
"@fxri/toolkit": minor
---

- 新增：`task add` / `task update`，按模板建档与改字段，非交互写入须 `--yes`
- 新增：`rule check` 校验规则模块与规则页的更新锚点是否同源
- 修改：`docs` 裸命令改为默认全量校验（theme / nav / dist），并新增等价的 `docs check`
- 新增：根级 `--cwd <path>`，所有命令共用同一工作目录入口，非法路径按 1 退出
