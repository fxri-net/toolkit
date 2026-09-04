---
"@fxri/toolkit": patch
---

- 修复：任务文件解析兼容 UTF-8 BOM（Windows PowerShell 写盘不再误报缺少 frontmatter）
- 修正版权主体与版权符号
- 依赖：commander 降级至 Node 20 兼容版本
- 文档：新增 VitePress 文档站点与 docs 八篇文档体系，README 重构为入口页，全文档统一 pnpm 命令
- skills：补充多包管理器下 pnpm 置前的探测顺序，收尾边界口径与文档同步
