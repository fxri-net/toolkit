---
"@fxri/toolkit": patch
---

- 优化：`tasks` 与 `changelog` 命令的注册与报告打印迁入 `src/commands/` 独立模块，命令顺序、选项与输出逐字不变
- 优化：软告警开关与语言合并两个跨域配置读取收敛到命令层共用模块
