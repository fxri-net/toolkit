---
"@fxri/toolkit": patch
---

- 修改：`fxri-text-encoding` 的读取方默认解码表加通道限定——本表只作文件读取基线，参数通道按 console 代码页与 `$OutputEncoding` 现场判定，不套用本表
- 修改：`references/boundaries.md` 补「已验证通道」的失效判据——机器、宿主、CI 任一变化即视为未验证，先小样往返读回再批量执行
