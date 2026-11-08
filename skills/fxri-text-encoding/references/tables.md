# 编码与字节形态明细表

> 本文件是 `fxri-text-encoding` 的明细附表，由 `SKILL.md`「读取地图」按场景引用；触发判据与乱码三问以 `SKILL.md` 为准。

## 读取方默认解码（无 BOM 时）

| 读取方 | 默认解码 |
| --- | --- |
| `powershell.exe`、Excel、`cmd` 与多数 Windows 老工具 | 系统 ANSI 或 OEM 代码页（简体中文均为 936） |
| 记事本 | Win10 1903 起先试 UTF-8、失败回落 ANSI，「打开正常」不能当编码证据 |
| `pwsh`、Node、Python 3、Go、Rust | UTF-8 |
| bash / sh / 各语言 `open()` | 按 locale，`LANG=C` 时为 ASCII |

## 文件类型基线（示例，非白名单）

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

新语言 / 新格式按三件事推导——读取方默认解码、是否要求或禁止 BOM、行尾是否敏感。即便只在 `pwsh` 下跑也统一带 BOM——脚本常在别人机器上跑；`.psm1` / `.psd1` 同理。

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

## 判字节与批量巡检

- 判首三字节：`powershell.exe` `[IO.File]::ReadAllBytes($p)[0..2] -join ','`（`239,187,191` 即有 BOM）、
   Node `fs.readFileSync(p).subarray(0,3).toString("hex")`（`efbbbf`）、bash `head -c 3 f | xxd -p`
- 行尾：`file f` 报 `with CRLF, LF line terminators` 即混用；末尾缺换行 `tail -c 1 f | xxd -p` 非 `0a` 即缺
- 补 BOM（内容已是 UTF-8）：
   `[IO.File]::WriteAllText($p, [IO.File]::ReadAllText($p), [Text.UTF8Encoding]::new($true))`；
   Node 读回后前置 `"\uFEFF"`
- Node `readFileSync(p, "utf8")` 会保留 `\uFEFF`，解析前 `s.replace(/^\uFEFF/, "")`
- 全仓巡检：`git ls-files` 后按基线表筛出敏感类型逐个判首三字节；行尾混用一次性捞全 `git ls-files -z | xargs -0 file | grep CRLF`。人眼抽查只用于验证产线，别当门禁
