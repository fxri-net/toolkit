# 乱码与字节异常速查

> 本文件是 `fxri-text-encoding` 的明细附表；触发判据与乱码三问以 `SKILL.md` 为准。

## 表现 → 类别 → 可逆性

判据不是字符长什么样，而是与原文 / 声明编码比对后，字符是否还在、能否反向还原。

| 表现（示例，非穷举） | 类别 | 可逆性 | 处置 |
| --- | --- | --- | --- |
| `涓枃` / `ä¸æ–‡` / `ÖÐÎÄ` / `锟斤拷` | 错误解码（mojibake） | 可逆 | 按错误链路反向转码 |
| `?` / `�` / `\uFFFD` / `&#65533;` / 空白 / 空串 / 截断 / 每字一个占位 | 有损编码（目标字符集无法表示） | 不可逆 | 回源重取，修写入通道 |
| `\u4e2d\u6587` / `%E4%B8%AD` / `&#20013;` / Base64 | 表示形式（转义 / 编码） | 可逆 | 目标端接受就不动，按对应格式解码 |
| 开头 `ï»¿`、BOM 被当成正文 | 形态错位 | 可修 | 去 BOM |
| `烫烫烫` / `屯屯屯` | 非编码问题（未初始化内存 / 调试填充） | — | 查代码，不是编码 |

反误伤：

- 非 ASCII 本身不是故障；UTF-8 下正常的日文、韩文、emoji、重音字符保持原样，不改写。
- 合法的表示形式（JSON 转义、URL 百分号编码、HTML 实体、Base64）按目标端约定处理，不擅自解码成原文。
- 孤立 `?` 可能只是正文内容，只有与原文比对确认成片替换后才判有损。
- 4 字节字符（emoji 等）写入 `utf8`（非 `utf8mb4`）或旧字符集时会被替换或截断，属字符集不支持，应换编码而非用 `?` 顶替。

## 文件字节类

| 现象 | 根因 | 处置 |
| --- | --- | --- |
| `powershell.exe` 报 `Missing closing '}'` / `Unexpected token`，文件看着没问题 | `.ps1` 无 BOM，非 ASCII 被按 ANSI 解码 | 转 UTF-8 with BOM，逻辑不变 |
| `.bat` / `.cmd` 首行就报命令不存在 | 文件带 BOM | 去 BOM，非 ASCII 改由 `.ps1` 承担 |
| Linux 侧 `.sh` 报 `$'\r': command not found` | CRLF | 转 LF，`.gitattributes` 用 `eol=lf` 固化 |
| 仓库里是 LF，检出后 `.sh` 变 CRLF；已配 `eol=lf` 但 CI 仍报 `$'\r'` | `core.autocrlf=true` 在检出时转换；属性只约束后续写入，不回溯已提交内容 | `.gitattributes` 写 `eol=lf` 覆盖本机设置；存量执行 `git add --renormalize .` 后提交 |
| Excel 打开 CSV 乱码，或另存出的 CSV 进程序后乱码 | 打开侧无 BOM 按 ANSI 解码；另存侧 Excel 按系统 ANSI 写 | 打开侧加 BOM（Python 写用 `utf-8-sig`）；导出选「CSV UTF-8（逗号分隔）」或入库前转 UTF-8 |
| `JSON.parse` 报 `Unexpected token` 但内容正常 | 首字节 `EF BB BF` | 去 BOM |
| XML 报声明与实际编码不符 | `encoding=` 写 GBK 而实际 UTF-8 | 统一实际字节为 UTF-8，别只改声明 |
| 同一文件同事机器正常、本机乱码 | 那台机器开了「Beta: 使用 Unicode UTF-8 提供全球语言支持」，系统 ANSI 已变 UTF-8 | 别依赖该设置，仍按基线写 BOM |
| PHP 页面 `headers already sent` | `<?php` 前有 BOM 并被输出 | 去 BOM，文件保持 UTF-8 无 BOM + LF |

## 内容类

| 现象 | 根因 | 处置 |
| --- | --- | --- |
| 编译报「非法字符 / unexpected character」但该行看不见异常 | 不可见字符：NBSP `U+00A0`、全角空格 `U+3000`、零宽空格 `U+200B`、中段 BOM `U+FEFF`、双向控制 `U+200E/200F` | 定位后替换，见下方命令 |
| 代码报语法错，字符看着像英文标点 | 全角标点 `“”（）：，；－` | 全文替换为半角，检查输入法全角态 |
| Python 输出 `\u4e2d\u6587`、git 把中文路径显示成 `\346\226\207` | `json.dump` 默认 `ensure_ascii=True`；`core.quotepath` 默认开启 | 分别传 `ensure_ascii=False`、`git -c core.quotepath=false`，都不是乱码 |

定位不可见字符：GNU grep `grep -nP '[\x{00A0}\x{200B}\x{3000}\x{FEFF}\x{200E}\x{200F}]' f`；`powershell.exe` `Select-String -Path f -Pattern '[\u00A0\u200B\u3000\uFEFF\u200E\u200F]'`。
