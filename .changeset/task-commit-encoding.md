---
"@fxri/toolkit": patch
---

- 修改：`fxri-text-encoding` 补提交信息 / tag 注释的编码通道口径——非 ASCII 元数据优先走 UTF-8 无 BOM 文件（`git commit -F` / `git tag -F`）或 stdin 并回读核对，`-m` 仅用于纯 ASCII 或已验证通道；同时明确「提交信息的内容风格」与「编码通道」的归属边界
