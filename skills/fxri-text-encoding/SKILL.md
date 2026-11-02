---
name: fxri-text-encoding
description: 在写脚本、配置、数据交换类文本文件之前，或用 shell 重定向、程序生成 / 导出、转码产出文本文件之前，或把非 ASCII 文本传给命令行参数、环境变量、API 请求体、模板渲染与远端元数据之前——不论临时、一次性、不入库、仓库内外——先加载本技能。判据只看读取方与字节形态：其默认解码不是 UTF-8（`powershell.exe` / `cmd` / Excel / MSVC / 未指定 `-encoding` 的 javac 等按系统代码页，bash / CI 按 locale），或格式要求 / 禁止 BOM、对行尾敏感，或写入经生成 / 转码通道。不按语言 / 扩展名白名单判断，Java / PHP 等按各自编译器与运行时默认解码推导。非 ASCII 内容与原文不一致（丢失、替换、截断、变形、mojibake）时立即用；`?` / `�` 只是表现之一，合法非 ASCII 与 `\uXXXX` / 百分号编码等表示形式不算故障。AI 写入工具默认不写 BOM，落盘后自查首三字节并读回比对。不用于 Base64 / URL 编码、排序计数、文件名规范化、CSV 语法、路径分隔符、时区、提交信息内容风格、任务建档、代码风格。
license: MIT
metadata:
  version: "1.2.1"
  tier: optional
  author: fxri
  source: https://github.com/fxri-net/toolkit
---

# 文本编码与字节形态

> 本技能版本 1.2.1（随 @fxri/toolkit 同批分发）。被问版本时即报此值（不读磁盘、不跑 CLI）；与 `toolkit skills status` 的磁盘值不一致即说明会话上下文已过期，开新会话即可。

## 触发判据（按读取方默认解码与字节形态判断，不按语言 / 扩展名白名单）

满足任一即加载：

1. **读取方编码**：即将写入或传输非 ASCII 文本，且读取方默认解码不是 UTF-8——`powershell.exe` / `cmd` / Excel / MSVC / 未指定 `-encoding` 的 javac 按系统代码页，bash / CI 按 locale。
2. **字节形态敏感**：可执行脚本与 shebang 文件（BOM / CRLF 会直接执行失败）、要求 BOM 的格式（`.ps1` 等）、禁止 BOM 且本次写入可能引入或移除 BOM 的格式（`.bat`、JSON、PHP 源文件等）。
3. **生成通道**：写入由 `>` / `>>`、`Set-Content` / `Out-File` / `Export-Csv`、模板渲染 / 占位符替换、程序生成或导出、`iconv` 转码完成——不论扩展名、临时与否、仓库内外。
4. **跨边界通道**：非 ASCII 文本传给命令行参数、环境变量、HTTP / RPC 请求体（项目描述、release、issue / PR 正文）、git / 远端元数据。
5. **执行通道**：PS 管道喂原生命令、重定向落盘、`Get-Content` 读无 BOM 文件、`chcp` / `iconv`、locale 默认编码、运行脚本。
6. **症状**：非 ASCII 内容与原文不一致——字符缺失、被替换、截断、长度异常、变形或 mojibake。

不加载：写入方与读取方都按 UTF-8（或按字节原样）处理，本次写入既不新增 / 移除 BOM、也不改行尾，且不经过生成 / 转码 / 跨边界通道；纯 ASCII 命令；纯展示输出且无异常。非 ASCII 本身不是故障，合法的日文、韩文、emoji、重音字符与 `\uXXXX`、百分号编码、HTML 实体、Base64 均按正常内容处理。临时、一次性、不入库、不提交、仓库外 temp 目录**均不豁免**——读取方可能在别的机器、Excel、CI 或远端平台，错误不会回到本会话。

只命中执行 / 跨边界通道时，直接跳「跑起来乱码」或「跨边界」节，不读文件侧基线。写盘前先定字符集、BOM、行尾三件套；AI 写入工具落盘后立刻判首三字节并读回比对（见「写盘」）；出错先走乱码三问，文件侧查 `references/troubleshooting.md`，运行期查「跑起来乱码」。

## 先分归属（乱码三问）

故障是「写入方字节」×「读取方默认解码」；看到异常先走三问，不按字符外观定性：

1. **是谁的字节？** 先与预期原文或文件声明编码比对：字符都在、只是排列错 → 解码链问题；字符缺失 / 被替换 / 截断 / 空串 → 生产者编码失败。再重定向到文件看首字节，区分落点字节坏与终端 / 管线显示坏。
2. **还能救吗？** 能用已知错误解码链反向还原的是 mojibake（`涓枃` = UTF-8 被当 GBK 读，`ä¸æ–‡` = UTF-8 被当 Latin-1 读，`ÖÐÎÄ` = GBK 被当 Latin-1 读，`锟斤拷` = GBK / UTF-8 反复转）；出现替代符、字符缺失、截断、空串的是有损编码，原字节已丢，**不可逆**。替代符不限于 `?`，也可能是 `�`、`\uFFFD`、`&#65533;`、空白或空串。
3. **错在第几跳？** 只修认出的那一跳。`\u4e2d\u6587`、`%E4%B8%AD`、`&#20013;`、Base64 是表示形式，目标端接受就不动；`?` 是合法字符，孤立出现不判乱码。

第 2、3 问的处置——按特征串选反向转码（先备份原件，转完核对本意）：

- `涓枃` 类 `iconv -f GBK -t UTF-8`；`ä¸æ–‡` 类 `-f ISO-8859-1`
- 无 iconv 时：`[Text.Encoding]::UTF8.GetString([Text.Encoding]::GetEncoding(936).GetBytes($s))`，Latin-1 把 936 换 28591

读取方无 BOM 时的默认解码：

| 读取方 | 默认解码 |
| --- | --- |
| `powershell.exe`、Excel、`cmd` 与多数 Windows 老工具 | 系统 ANSI 或 OEM 代码页（简体中文均为 936） |
| 记事本 | Win10 1903 起先试 UTF-8、失败回落 ANSI，「打开正常」不能当编码证据 |
| `pwsh`、Node、Python 3、Go、Rust | UTF-8 |
| bash / sh / 各语言 `open()` | 按 locale，`LANG=C` 时为 ASCII |

## 基线决策（按读取方推导，示例非白名单）

| 文件类型 | 字符集 | BOM | 行尾 | 理由 |
| --- | --- | --- | --- | --- |
| `.ps1` / `.psm1` / `.psd1` | UTF-8 | 有 | 均可 | `powershell.exe` 无 BOM 即按 ANSI 解码，非 ASCII 必炸 |
| `.bat` / `.cmd` | ASCII 优先；必须非 ASCII 时用系统 ANSI | 无 | CRLF | BOM 会让首条命令报错 |
| `.sh` / `Makefile` / 带 shebang 的脚本 | UTF-8 | 无 | LF | BOM 会污染 shebang |
| 常规源码 / 文档（`.md` / `.ts` / `.js` / `.yml` / `.toml` 等） | UTF-8 | 无 | LF | 工具链默认；本机同工具链内无特殊约束 |
| JSON / XML | UTF-8 | 无 | LF | JSON 带 BOM 多解析失败；XML 改字节而非只改声明 |
| `.properties` | Latin-1 + `\uXXXX`，或 `load(Reader)` 显式 UTF-8 | 无 | LF | `load(InputStream)` 固定按 ISO-8859-1 读 |
| C / C++ / Java 等按平台编码编译的源文件 | UTF-8 | 有；或加 `/utf-8` / `-encoding UTF-8` | LF | MSVC 与未指定 `-encoding` 的 javac 按系统代码页读源文件 |
| PHP 源文件 | UTF-8 | 无 | LF | `<?php` 前的 BOM 会被输出，触发 `headers already sent` |
| 交给 Excel 的 `.csv` | UTF-8 | 有 | 遵循目标平台 | 无 BOM 时 Excel 按 ANSI 解码 |

表是常见读取方的示例，不是可触发范围的白名单：新语言 / 新格式按三件事推导——读取方默认解码、是否要求或禁止 BOM、行尾是否敏感。

即便只在 `pwsh` 下跑也统一带 BOM——脚本常在别人机器上跑；`.psm1` / `.psd1` 同理。

## 写盘：谁在悄悄改字节

| 写法 | 实际行为 |
| --- | --- |
| AI 文件写入 / 编辑工具；编辑器「保存为 UTF-8」 | 不写 BOM，须写完补或写入时前置 `\uFEFF` |
| `powershell.exe` `Set-Content` / `Add-Content` | 省略 `-Encoding` 按系统 ANSI 写，UTF-8 非 ASCII 落盘即坏；`-Encoding UTF8` 写 BOM |
| `powershell.exe` `Export-Csv` 省略 `-Encoding` | 写 ASCII，非 ASCII 直接变 `?`；加 `-Append` 时编码又与新建不同 |
| `pwsh` `Set-Content` / `Out-File` / `>` | 默认 `utf8NoBOM`，要 BOM 显式 `utf8BOM` |
| .NET `[IO.File]::WriteAllText` / Node `fs.writeFileSync` | 均不写 BOM，须分别传 `[Text.UTF8Encoding]::new($true)`、前置 `"\uFEFF"` |
| Python `open(p, "w", encoding="utf-8-sig")` | 写 BOM；`"utf-8"` 不写；省略 `encoding` 走 locale |
| 模板引擎 / `sed` / `envsubst` / 程序内 replace | 产物编码由最后写入者决定，模板源正常不代表产物正常 |
| `.editorconfig` `charset` / git `.gitattributes` | 前者只在编辑器保存时生效；后者 `eol=` 管行尾、`working-tree-encoding=` 管编码，**都不补 BOM** |

⚠️ 两者同名不同义：要在两种 shell 下都跑，用 `[Text.UTF8Encoding]::new($true)` 显式指定；`utf8BOM` 只有 `pwsh` 认。

写完立刻自查（AI 写入工具默认无 BOM，是本类故障最常见来源）：

1. 新建或改写需要 BOM 的文件（如 `.ps1`）后判首三字节，不是 `EF BB BF` 当场补，别等运行时报错
2. 批量生成、打包、模板渲染、格式化钩子跑完后抽查产物并读回与原文比对，再回跑一次生成脚本——只补产物不修产线，下次还会丢
3. 不落盘的内联命令没有文件侧问题，运行期查「跑起来乱码」或「跨边界」

判工具：`powershell.exe` `[IO.File]::ReadAllBytes($p)[0..2] -join ','`（`239,187,191` 即有 BOM）、Node `fs.readFileSync(p).subarray(0,3).toString("hex")`（`efbbbf`）、bash `head -c 3 f | xxd -p`；行尾 `file f` 报 `with CRLF, LF line terminators` 即混用；末尾缺换行 `tail -c 1 f | xxd -p` 非 `0a` 即缺。

Node `readFileSync(p, "utf8")` 会保留 `\uFEFF`，解析前 `s.replace(/^\uFEFF/, "")`；补 BOM（内容已是 UTF-8）用 `[IO.File]::WriteAllText($p, [IO.File]::ReadAllText($p), [Text.UTF8Encoding]::new($true))`，Node 读回后前置 `"\uFEFF"`。

全仓巡检：`git ls-files` 后按基线表筛出项目用到的敏感类型（如 `.ps1` / `.sh` / `.bat` / `.csv` / `.properties` / 按平台编码编译的源码）逐个判首三字节；行尾混用一次性捞全 `git ls-files -z | xargs -0 file | grep CRLF`。人眼抽查只用于验证产线，别当门禁。

## 组合速查

高频三条，其余见 `references/troubleshooting.md`：

| 现象 | 根因 | 处置 |
| --- | --- | --- |
| `powershell.exe` 报 `Missing closing '}'` / `Unexpected token`，文件看着没问题 | `.ps1` 无 BOM，非 ASCII 被按 ANSI 解码 | 转 UTF-8 with BOM，逻辑不变 |
| `.bat` / `.cmd` 首行就报命令不存在 | 文件带 BOM | 去 BOM，非 ASCII 改由 `.ps1` 承担 |
| Excel 打开 CSV 乱码 | 打开侧无 BOM 按 ANSI 解码 | 加 BOM（Python 写用 `utf-8-sig`）或导出选「CSV UTF-8」 |

## 跑起来乱码（不落盘）

命令执行中乱码多为管线问题，源文件可能正常：先按第 1 问判归属，再查下表。

| 断点 | 现象 | 处置 |
| --- | --- | --- |
| 控制台代码页（简体默认 936） | 原生命令输出 UTF-8 非 ASCII 字符显示乱码 | `chcp 65001` + `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()` |
| `powershell.exe` `$OutputEncoding` 默认 ASCII | PS 管道把非 ASCII 传给原生命令后变 `?` | 先设 `$OutputEncoding = [Text.UTF8Encoding]::new()` |
| `powershell.exe` `>` / `Out-File` 默认 UTF-16LE | 重定向出的 `.json` / `.csv` 后续解析失败 | 改 `-Encoding utf8` 或 `[IO.File]::WriteAllText`；`pwsh` 默认 UTF-8 无 BOM |
| `powershell.exe` `Get-Content` 对无 BOM 文件按 ANSI | 读 UTF-8 文件得乱码，误判文件损坏 | 显式 `-Encoding utf8`；`pwsh` 默认 UTF-8 |
| Node 输出被 `powershell.exe` 读 | 控制台 UTF-16 显示正常，落文件是 UTF-8，再读就乱 | 读侧显式编码，别改 Node 侧 |
| Python 用 locale 编码 | 非 ASCII 报 `UnicodeEncodeError` 或输出 `?` | `PYTHONUTF8=1` 或 `PYTHONIOENCODING=utf-8` |
| 容器 / CI `LANG=C`、`LC_ALL=C` | 本地正常，线上同上报错 | 设 `LANG=C.UTF-8`，或注入 `PYTHONIOENCODING=utf-8` |
| Java 运行期 `file.encoding` | JDK 18 前在 Windows 默认 GBK，读写出乱码 | `-Dfile.encoding=UTF-8` |

⚠️ 别因 stdout 乱码就回头改源文件；`file -i` 与 chardet 对短文本误判率高，只作参考。

## 跨边界（不落盘、不出本机）

非 ASCII 文本跨进程 / 跨机器传递时，边界同样按读取方默认解码判断；请求体、命令行参数、环境变量、模板产物都可能被 ASCII / ANSI 默认编码吃掉。写完后从目标端读回与原文比对，本地字符串正常不代表远端落对。构造方式、逐项处置与读回校验见 `references/boundaries.md`。

## 修复纪律

1. **消灭组合条件并固化**：能不带 BOM 的格式就别带；必须带的统一基线，写进 `.gitattributes`（`eol` / `working-tree-encoding`）、`.editorconfig`（`charset`）与项目文档
2. **机器校验**：生成后或 CI 断言首三字节与行尾，不靠人眼
3. **只转一次、不只补产物**：转码前确认原始编码（有损不可逆，回源重取）；BOM 反复丢失一定有一处在重写文件，先定位那次写入再补
