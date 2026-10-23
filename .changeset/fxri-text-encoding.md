---
"@fxri/toolkit": minor
---

- 新增：`fxri-text-encoding` 技能——按「乱码三问」定归属（谁的字节 / 还能救吗 / 错在第几跳，含按 mojibake 特征串选 `iconv` 方向的反向转码命令），文件侧覆盖 `.ps1` / `.psm1` / `.psd1` / `.bat` / `.sh` / `.xml` / `.properties` / C 系与 Java 源文件及 Excel CSV 的 UTF-8 / BOM / 行尾基线、写盘工具 BOM 与默认编码行为对照（含 PS 5.1 `Export-Csv` 默认写 ASCII、`Set-Content` / `Add-Content` 省略 `-Encoding` 按系统 ANSI）、落盘后首三字节自查与 `git ls-files` 全仓巡检，运行期覆盖控制台代码页、PS 5.1 `$OutputEncoding` 与 `>` 重定向、`Get-Content` 解码、Python locale、容器 CI `LANG=C`、Java `file.encoding` 等管线断点，并含不可见字符、全角标点、`�` 不可逆、二次转码、`eol=lf` 不回溯已提交内容等场景
- 修改：`docs/ai-rules.md` 代码规范补脚本字节形态铁律（`.ps1` UTF-8 with BOM、`.sh` 无 BOM + LF、`.bat` / `.cmd` 不带 BOM + CRLF），指向该技能
