---
"@fxri/toolkit": patch
---

- 修复：`conventions status --dir` 跨仓体检时入口壳与检测入口按 cwd 扫描、报「入口壳 0 个」的问题——改为按任务目录所属仓库（父目录含 package.json / .git）推导扫描根，无标记时回落 cwd
