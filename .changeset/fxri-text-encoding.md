---
"@fxri/toolkit": minor
---

- 新增：`fxri-text-encoding` 技能——按「生产者 × 消费者」定文本文件的 UTF-8 / BOM / 行尾基线，覆盖 PowerShell 脚本中文乱码与首行报错、Excel 打开 CSV 乱码、JSON 带 BOM 解析失败等场景，含写盘行为对照与首三字节自检
- 修改：`docs/ai-rules.md` 代码规范补脚本字节形态铁律（`.ps1` UTF-8 with BOM、`.sh` 无 BOM + LF、`.bat` / `.cmd` 不带 BOM + CRLF），指向该技能
- 修改：技能改为预防优先——`description` 前置写盘前触发词，新增「写完就查」动作节（写完即判首三字节、批量生成后抽查、改完生成脚本回跑一次），写盘行为对照补「AI 文件写入 / 编辑工具默认不写 BOM」，症状与失败模式表降为事后后备
- 修改：补运行期（不落盘）场景——新增「跑起来乱码」节，覆盖控制台代码页 936、PS 5.1 `$OutputEncoding` 与 `>` 重定向、`Get-Content` 解码、Python locale 编码、git `core.quotepath` 六个管线断点，并给出重定向看首字节的归属判定法，`description` 同步补终端与重定向乱码触发词
