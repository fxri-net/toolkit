---
"@fxri/toolkit": minor
---

- 新增：`fxri-text-encoding` 技能——按「生产者 × 消费者」定文本文件的 UTF-8 / BOM / 行尾基线，覆盖 PowerShell 脚本中文乱码与首行报错、Excel 打开 CSV 乱码、JSON 带 BOM 解析失败等场景，含写盘行为对照与首三字节自检
- 修改：`docs/ai-rules.md` 代码规范补脚本字节形态铁律（`.ps1` UTF-8 with BOM、`.sh` 无 BOM + LF、`.bat` / `.cmd` 不带 BOM + CRLF），指向该技能
