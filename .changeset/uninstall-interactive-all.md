---
"@fxri/toolkit": patch
---

- 修改：`skills uninstall` 裸命令改为交互多选（全局 / 项目 / 疑似残留分组，默认全不选），非交互直接报错给用法，不再默认全量删除
- 新增：`skills uninstall --all`（全量卸载已登记产物与疑似残留，非交互须 `--yes`）与 `--yes`

⚠️ 依赖裸命令全量卸载的脚本需改用 `--all --yes`
