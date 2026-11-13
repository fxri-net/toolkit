---
"@fxri/toolkit": patch
---

- 修复：`toolkit init` 在技能目录路径被同名文件占用时只抛 ENOENT，改为给出占位路径与处置方式
