---
"@fxri/toolkit": minor
---

- 新增：`fxri-text-encoding` 技能按「乱码三问」定归属（谁的字节 / 还能救吗 / 错在第几跳），附读取方默认解码对照与按 mojibake 特征串选 `iconv` 方向的反向转码命令
- 新增：技能给出 `.ps1` / `.psm1` / `.psd1` / `.bat` / `.sh` / `.xml` / `.properties` / C 系与 Java 源文件及 Excel CSV 的 UTF-8、BOM 与行尾基线
- 新增：技能对照 AI 写入工具与 `powershell.exe` / `pwsh` / .NET / Node / Python / `.editorconfig` / `.gitattributes` 的写盘 BOM 与默认编码行为，含 `-Encoding UTF8` 在两种 shell 下同名不同义、`Export-Csv` 省略 `-Encoding` 写 ASCII、Node 读侧残留 `\uFEFF`
- 新增：技能提供落盘后首三字节自查与 `git ls-files` 全仓巡检，改完即可验
- 新增：技能覆盖运行期管线断点——控制台代码页、`$OutputEncoding` 与 `>` 重定向、`Get-Content` 解码、Python locale、容器 CI `LANG=C`、Java `file.encoding`
- 新增：技能记录 `core.autocrlf` 检出转换与 `eol=lf` 不回溯已提交内容、Windows「Beta: 使用 Unicode UTF-8 提供全球语言支持」造成的同文件异机差异、Excel 另存 CSV 的编码走向、不可见字符、全角标点、`�` 不可逆、二次转码等场景
- 修改：`docs/ai-rules.md` 代码规范补脚本字节形态铁律（`.ps1` UTF-8 with BOM、`.sh` 无 BOM + LF、`.bat` / `.cmd` 不带 BOM + CRLF），以系统内置的 `powershell.exe` 指代该 shell，指向该技能
