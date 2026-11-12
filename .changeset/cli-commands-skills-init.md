---
"@fxri/toolkit": patch
---

- 优化：`skills` 与 `init` 命令的注册与报告打印迁入 `src/commands/` 独立模块，命令顺序、选项与输出逐字不变
- 优化：多值解析、`--dir` 收集与 JSON 输出收敛为命令层共用小工具，供后续命令域复用
