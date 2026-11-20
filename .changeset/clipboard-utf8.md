---
"@fxri/toolkit": patch
---

- 修复：`toolkit rules compose` 复制的内容在中文 Windows 上粘贴后乱码——文本改为经 UTF-8 临时文件交给 PowerShell 读取，并移除走 ANSI 通道的 `clip` 兜底
