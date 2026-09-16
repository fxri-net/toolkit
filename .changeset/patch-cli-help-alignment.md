---
"@fxri/toolkit": patch
---

优化：CLI 帮助清单条目与子命令自身 Usage 行对齐

- 帮助清单条目统一为「命令名 + 该命令自身 Usage 行」，消除同一命令两套渲染规则：无自有选项但有子命令的域（如 `skills`）不再只剩光杆名字，现与 `skills --help` 的 Usage 行同形（`skills [options] [command]`）
- 帮助选项与隐式帮助子命令的描述由 commander 英文默认值改为中文：`-h, --help` 与 `help [command]` 均为「显示帮助」，与 `-v, --version 显示版本号` 及 `docs/cli.md` 既有表述对齐
