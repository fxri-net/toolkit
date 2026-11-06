---
"@fxri/toolkit": patch
---

- 修改：`tasks` 的 `archive` / `check` / `normalize` / `stats` 改为真子命令，各自拥有独立帮助与选项
- 新增：`tasks export <path>` 与 `tasks import <file>` 子命令，替代域级 `--export` / `--import`
- 修改：移除域级 `--check` / `--fix` / `--target`，分别下沉到 `tasks normalize` 与 `tasks import`
- 修改：`tasks --export <path>` 改为 `tasks export <path>`，`tasks --import <file>` 改为 `tasks import <file>`
