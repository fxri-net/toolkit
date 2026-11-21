---
"@fxri/toolkit": patch
---

- 新增：`toolkit status` 只读聚合命令，一条命令汇总任务区 / 技能现场 / 配置层 / 文档站 / 版本与弃用项
- 新增：`status --check` 存在 error 级问题时退出 1，可作日常自查门禁；`--format json` 输出统一信封
- 优化：JSON 信封构造抽到 `src/json-output.ts`（command / ok / data / issues），后续域共用同一实现
