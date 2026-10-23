---
name: fxri-text-encoding
description: 新建、改写、生成、转码 `.ps1`、`.bat`、`.cmd`、`.sh`、`.properties`、给 Excel 的 `.csv` 等文本文件之前，先按读取方定字符集、BOM 与行尾；AI 自己用文件写入 / 编辑工具落盘后立即自查首三字节（这类工具默认不写 BOM）。也用于乱码归属：终端或命令输出中文变问号、重定向出的文件后续解析失败、`Get-Content` 读 UTF-8 文件乱码、管道传给原生命令变 `?`、编译报看不见的非法字符——含编码、字符集、BOM、乱码、转码、换行、CRLF、LF、UTF-8 BOM、chcp、locale、stdout 编码等说法及口语近义表达（中文变问号、脚本跑不起来、打开是乱码、补了 BOM 又丢了）。事后定位同样用它：脚本中文乱码、PowerShell 报 Missing closing、脚本首行命令报错、Excel 打开 CSV 乱码、JSON 带 BOM 解析失败、跨平台分发脚本打不开。不用于 Base64 / URL 编码、排序与字符计数、文件名规范化、CSV 语法、路径分隔符、时区，也不用于 git 提交信息、任务建档或代码风格。
license: MIT
metadata:
  version: "1.3.0"
  author: fxri
  source: https://github.com/fxri-net/toolkit
---

# 文本编码与字节形态

> 本技能版本 1.3.0（随 @fxri/toolkit 同批分发）。被问版本时即报此值（不读磁盘、不跑 CLI）；与 `toolkit skills status` 的磁盘值不一致即说明会话上下文已过期，开新会话即可。

## 何时使用

- **写之前（首要）**：任何会被别的程序读取的文本文件，先定字符集、BOM、行尾三件套，再动笔
- **写之后**：AI 自己用写入 / 编辑工具落盘，立刻判首三字节（见「写盘」）
- **出错之后**：先走「乱码三问」定归属，文件侧看「组合速查」，运行期看「跑起来乱码」
- **不适用**：Base64 / URL 编码、排序与字符计数、文件名规范化、CSV 语法、路径分隔符、时区、提交信息、任务建档、代码风格

## 先分归属（乱码三问）

故障永远是「写入方产出的字节」×「读取方默认的解码方式」，与操作系统无关。看到乱码先走这三问，别凭感觉改文件：

1. **是谁的字节？** 把输出重定向到文件后看首字节：字节对但显示乱 → 终端或管线解码错（见「跑起来乱码」）；字节本身就错 → 生产者编码错（见「写盘」）
2. **还能救吗？** 出现 `�`（U+FFFD）说明解码已失败、原字节丢失，**不可逆**，别试图转回去；无 `�` 的乱码多为 mojibake，可反向转码
3. **错在第几跳？** `涓枃` = UTF-8 被当 GBK 读；`ä¸æ–‡` = UTF-8 被当 Latin-1 读；`ÖÐÎÄ` = GBK 被当 Latin-1 读。认出哪一跳，只修那一跳，别整条链重来

消费者默认怎么解码（无 BOM 时）：

| 消费者 | 默认解码 |
| --- | --- |
| Windows PowerShell 5.1 | 系统 ANSI（简体中文为 GBK） |
| PowerShell 7 / Node / Python 3 / Go / Rust | UTF-8 |
| cmd.exe 与多数 Windows 老工具 | OEM 代码页（936 / 437） |
| Excel / 记事本 | 系统 ANSI |
| bash / sh / 各语言 `open()` | 按 locale，`LANG=C` 时为 ASCII |

## 基线决策（按文件类型）

| 文件类型 | 字符集 | BOM | 行尾 | 理由 |
| --- | --- | --- | --- | --- |
| `.ps1` | UTF-8 | 有 | 均可 | 5.1 无 BOM 即按 ANSI 解码，中文必炸 |
| `.bat` / `.cmd` | ASCII 优先；必须中文时用系统 ANSI | 无 | CRLF | BOM 会让首条命令报错 |
| `.sh` / `Makefile` / 带 shebang 的脚本 | UTF-8 | 无 | LF | BOM 会污染 shebang |
| `.md` / `.ts` / `.js` / `.json` / `.yml` / `.toml` | UTF-8 | 无 | LF | 工具链默认；JSON 带 BOM 多数解析器直接失败 |
| `.xml` | UTF-8 | 无 | LF | 声明与实际不符时按声明解码，改字节而非只改声明 |
| `.properties` | Latin-1 + `\uXXXX`，或 `load(Reader)` 显式 UTF-8 | 无 | LF | `load(InputStream)` 固定按 ISO-8859-1 读 |
| C / C++ / Java 源文件 | UTF-8 | 有；或加 `/utf-8` / `-encoding UTF-8` | LF | MSVC 按系统代码页读源文件，无 BOM 中文报 C4819 |
| 交给 Excel 的 `.csv` | UTF-8 | 有 | 遵循目标平台 | 无 BOM 时 Excel 按 ANSI 解码 |

`.ps1` 只在 PowerShell 7 下执行可不带 BOM，但脚本往往在别人机器上跑，统一带 BOM 才稳。

## 写盘：谁在悄悄改字节

| 写法 | BOM / 编码行为 |
| --- | --- |
| AI 文件写入 / 编辑工具；编辑器「保存为 UTF-8」 | 不写 BOM，须写完补或写入时前置 `\uFEFF` |
| PS 5.1 `Set-Content -Encoding UTF8` | 写 BOM |
| PS 7 `Set-Content` / `Out-File` | 默认 `utf8NoBOM`，要 BOM 显式 `utf8BOM` |
| `[IO.File]::WriteAllText(path, text)` | 不写，须传 `[Text.UTF8Encoding]::new($true)` |
| .NET Core 起 `File.WriteAllText` | 不写 |
| Node `fs.writeFileSync(p, s, "utf8")` | 不写，须手动前置 `"\uFEFF"` |
| Python `open(p, "w", encoding="utf-8-sig")` | 写 BOM；`"utf-8"` 不写；不传 `encoding` 走 locale |
| `.editorconfig` `charset = utf-8-bom` | 编辑器保存时按此写，命令行工具不认 |
| git `.gitattributes` | `eol=` 管行尾、`working-tree-encoding=` 管编码，**都不补 BOM** |

写完立刻自查——AI 工具的写入产线默认无 BOM，是这类故障最常见的来源：

1. 新建或改写 `.ps1` 后判首三字节，不是 `EF BB BF` 当场补，别等运行时报错
2. 批量生成、打包、格式化钩子跑完后抽查一个产物
3. 改完生成脚本本身要回跑一次——只补产物不修产线，下次还会丢
4. 只走内联 `-Command`、不落盘的没有文件侧问题，但运行期仍可能乱码

判工具：PowerShell `[IO.File]::ReadAllBytes($p)[0..2] -join ','`（`239,187,191` 即有 BOM）；Node `fs.readFileSync(p).subarray(0,3).toString("hex")`（`efbbbf`）；bash `head -c 3 f | xxd -p`。行尾看 `file f`（报 `with CRLF, LF line terminators` 即混用）；末尾缺换行用 `tail -c 1 f | xxd -p`，非 `0a` 即缺。

补 BOM（前提：内容本身已是 UTF-8）：PowerShell `[IO.File]::WriteAllText($p, [IO.File]::ReadAllText($p), [Text.UTF8Encoding]::new($true))`；Node 读回字符串后前置 `"\uFEFF"`。

## 组合速查（字节 × 消费者）

| 现象 | 根因 | 处置 |
| --- | --- | --- |
| PS 报 `Missing closing '}'` / `Unexpected token`，文件看着没问题 | `.ps1` 无 BOM，5.1 按 ANSI 解码中文 | 转 UTF-8 with BOM，逻辑不变 |
| `.bat` / `.cmd` 首行就报命令不存在 | 文件带 BOM | 去 BOM，中文改由 `.ps1` 承担 |
| Linux 侧 `.sh` 报 `$'\r': command not found` | CRLF | 转 LF，`.gitattributes` 用 `eol=lf` 固化 |
| Excel 打开 CSV 中文乱码 | 无 BOM | 加 BOM；Python 写用 `utf-8-sig` |
| `JSON.parse` 报 `Unexpected token` 但内容正常 | 首字节 `EF BB BF` | 去 BOM |
| XML 报声明与实际编码不符 | `encoding=` 写 GBK 而实际 UTF-8 | 统一实际字节为 UTF-8，别只改声明 |
| 编译报「非法字符 / unexpected character」但该行看不见异常 | 不可见字符：NBSP `U+00A0`、全角空格 `U+3000`、零宽空格 `U+200B`、中段 BOM `U+FEFF`、双向控制 `U+200E/200F` | 定位后替换，见下方命令 |
| 代码报语法错，字符看着像英文标点 | 全角标点 `“”（）：，；－` | 全文替换为半角，检查输入法全角态 |
| 文本里偶见 `�` | 多字节字符被按字节截断或某次解码丢失 | 回源重取，**不可逆** |
| 转码后比转码前更乱 | 对已是 UTF-8 的文件又按 GBK 转了一次 | 转前确认原始编码，只转一次 |
| 补好 BOM 后重新打包又丢了 | 生成环节的写盘 API 默认不写 BOM | 改生成脚本并加机器校验，别只补产物 |
| Python 输出 `\u4e2d\u6587` 而非汉字 | `json.dump` 默认 `ensure_ascii=True` | 传 `ensure_ascii=False`，不是乱码 |

定位不可见字符：GNU grep `grep -nP '[\x{00A0}\x{200B}\x{3000}\x{FEFF}\x{200E}\x{200F}]' f`；PowerShell `Select-String -Path f -Pattern '[\u00A0\u200B\u3000\uFEFF\u200E\u200F]'`。

## 跑起来乱码（不落盘）

AI 在上下文里执行命令时遇到乱码，源文件可能完全正常，错在进程管线。先按「乱码三问」第 1 问判归属，再查下表。

| 断点 | 现象 | 处置 |
| --- | --- | --- |
| 控制台代码页（简体默认 936） | 原生命令输出 UTF-8 中文显示乱码 | `chcp 65001` + `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()` |
| PS 5.1 `$OutputEncoding` 默认 ASCII | PS 管道把中文传给原生命令后变 `?` | 先设 `$OutputEncoding = [Text.UTF8Encoding]::new()` |
| PS 5.1 `>` / `Out-File` 默认 UTF-16LE | 重定向出的 `.json` / `.csv` 后续解析失败 | 显式 `-Encoding utf8`（要 BOM 用 `utf8BOM`） |
| PS 5.1 `Get-Content` 对无 BOM 文件按 ANSI | 读 UTF-8 文件得乱码，误判文件损坏 | 显式 `-Encoding utf8`；PS 7 默认 UTF-8 |
| Node 输出被 PS 5.1 读 | 控制台走 UTF-16 显示正常，写文件是 UTF-8，再被读就乱 | 读侧显式编码，别改 Node 侧 |
| Python 用 locale 编码 | 非 ASCII 报 `UnicodeEncodeError` 或输出 `?` | `PYTHONUTF8=1` 或 `PYTHONIOENCODING=utf-8` |
| 容器 / CI `LANG=C`、`LC_ALL=C` | 本地正常，线上同上报错 | 设 `LANG=C.UTF-8`，或注入 `PYTHONIOENCODING=utf-8` |
| Java 运行期 `file.encoding`（JDK8 Windows 为 GBK） | 读写出乱码，JDK18+ 才默认 UTF-8 | `-Dfile.encoding=UTF-8` |
| git `core.quotepath` 默认开启 | 中文路径显示 `\346\226\207`，被误读成乱码 | `git -c core.quotepath=false` |

⚠️ 别因 stdout 乱码就回头改源文件——文件侧按「写盘」自查单独判。`file -i` 与 chardet 对短文本误判率高，只作参考。

## 修复纪律

1. **消灭组合条件**：能不带 BOM 的格式就别带；必须带的统一基线，让生成脚本一次写对
2. **机器校验**：生成后或 CI 断言首三字节与行尾，不靠人眼
3. **约定固化**：`.gitattributes` 定 `eol` 与 `working-tree-encoding`，`.editorconfig` 定 `charset`，基线写进项目文档
4. **只转一次**：转码前确认原始编码；`�` 出现即不可逆，回源重取
5. **不只补产物**：BOM 反复丢失一定有一处在重写文件，先定位那次写入再补
