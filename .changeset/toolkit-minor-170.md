---
"@fxri/toolkit": minor
---

- 新增 `toolkit init` 命令，一键初始化 .tasks 任务区
- 新增 `tasks stats` 任务周期统计视图
- 新增完成时间检测：晚于当前系统时间与恰为零点整（疑似只填日期被补零），check/normalize/archive 三道关口告警
- 新增 fxri-session-recap 会话归档技能
- 修复：任务文件解析兼容 UTF-8 BOM（Windows PowerShell 写盘不再误报缺少 frontmatter）
- 依赖：commander 降级至 Node 20 兼容版本
- 文档：新增 VitePress 文档站点与 docs 八篇文档体系，README 重构为入口页
