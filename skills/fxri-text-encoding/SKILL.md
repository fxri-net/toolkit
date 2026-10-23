---
name: fxri-text-encoding
description: 新建、改写、生成、转码 `.ps1`、`.bat`、`.cmd`、`.sh`、给 Excel 的 `.csv` 等文本文件之前，先按读取方定字符集、BOM 与行尾；AI 自己用文件写入 / 编辑工具落盘脚本后立即自查首三字节（这类工具默认不写 BOM）。事后定位也用它：脚本中文乱码、PowerShell 报 Missing closing、脚本首行命令报错、Excel 打开 CSV 乱码、JSON 带 BOM 解析失败、跨平台分发脚本打不开——含编码、字符集、BOM、乱码、转码、换行、CRLF、LF、UTF-8 BOM 等说法及口语近义表达（中文变问号、脚本跑不起来、打开是乱码、补了 BOM 又丢了）。不用于路径分隔符、文件名大小写、时区与区域设置，也不用于 git 提交信息、任务建档或代码风格。
license: MIT
metadata:
  version: "1.1.0"
  author: fxri
  source: https://github.com/fxri-net/toolkit
---

# 文本编码与字节形态

> 本技能版本 1.1.0（随 @fxri/toolkit 同批分发）。被问版本时即报此值（不读磁盘、不跑 CLI）；与 `toolkit skills status` 的磁盘值不一致即说明会话上下文已过期，开新会话即可。

## 何时使用

写盘之前（首要）：

- 新建、改写、生成、转码任何**会被别的程序读取**的文本文件前，先定下字符集、BOM、行尾三件套
- AI 自己用文件写入 / 编辑工具落盘脚本时，写完立刻判首三字节（见「写完就查」）

出错之后：

- 出现乱码、语法错、首行报错、打开异常，判断落在编码 / BOM / 行尾哪一层

排除项：路径分隔符、文件名大小写、时区、区域设置、git 提交信息、任务建档、代码风格

## 核心模型：生产者 × 消费者

故障出在「写入方产出的字节」与「读取方默认解码方式」的组合，与操作系统无关——修的是消费侧契约，不是给某个系统打补丁：

| 文件字节 | 消费者 | 结果 |
| --- | --- | --- |
| UTF-8 无 BOM | Windows PowerShell 5.1 | 按系统 ANSI（中文 GBK）解码，中文乱码并触发语法错 |
| UTF-8 无 BOM | PowerShell 7 / Node 读 `"utf8"` | 默认 UTF-8，正常 |
| UTF-8 有 BOM | bash / sh 脚本 | BOM 粘在首行，shebang 失效或首条命令找不到 |
| UTF-8 无 BOM | Excel 打开 `.csv` | 按 ANSI 解码，中文乱码 |
| LF 行尾 | Windows 记事本 / 部分老工具 | 整篇挤成一行 |
| CRLF 行尾 | Linux 上的 `.sh` | `\r` 混进命令，报 `$'\r': command not found` |

## 基线决策（按文件类型）

| 文件类型 | 字符集 | BOM | 行尾 | 理由 |
| --- | --- | --- | --- | --- |
| `.ps1` | UTF-8 | 有 | 均可 | PS 5.1 无 BOM 即按 ANSI 解码，中文必炸 |
| `.bat` / `.cmd` | ASCII 优先；必须中文时用系统 ANSI | 无 | CRLF | BOM 会让首条命令报错 |
| `.sh` / `Makefile` / 带 shebang 的脚本 | UTF-8 | 无 | LF | BOM 会污染 shebang |
| `.md` / `.ts` / `.js` / `.json` / `.yml` | UTF-8 | 无 | LF | 工具链默认；JSON 带 BOM 多数解析器直接失败 |
| 交给 Excel 的 `.csv` | UTF-8 | 有 | 遵循目标平台 | 无 BOM 时 Excel 按 ANSI 解码 |

`.ps1` 只在 PowerShell 7 下执行可不带 BOM，但脚本往往在别人机器上跑，统一带 BOM 才稳。

## 写完就查（写盘后立刻做）

写盘的人是谁都要查——AI 自己的文件写入与编辑工具默认产出 UTF-8 无 BOM，是这类故障最常见的产线：

1. 新建或改写 `.ps1` 后立即判首三字节，不是 `EF BB BF` 就当场补，别等运行时报错
2. 批量生成、打包、格式化钩子跑完后抽查一个产物
3. 改完生成脚本本身要回跑一次，确认产线写出的文件合规——只补产物不修产线，下次还会丢
4. 临时脚本一旦落盘同样适用；只走内联 `-Command`、不落盘的才不涉及

判首三字节：

- PowerShell：`[IO.File]::ReadAllBytes($p)[0..2] -join ','`，`239,187,191` 即有 BOM
- Node：`fs.readFileSync(p).subarray(0, 3).toString("hex")`，`efbbbf` 即有 BOM
- bash：`head -c 3 f | xxd -p` 看 `efbbbf`；行尾用 `file f` 看是否含 `CRLF`

补 BOM 的一次性写法（前提：内容本身已是 UTF-8）：

- PowerShell：`[IO.File]::WriteAllText($p, [IO.File]::ReadAllText($p), [Text.UTF8Encoding]::new($true))`
- Node：读回字符串，写入时前置 `"\uFEFF"`

## 写盘行为对照（谁在悄悄改字节）

| 写法 | 是否写 BOM |
| --- | --- |
| AI 编程助手的文件写入 / 编辑工具；多数编辑器「保存为 UTF-8」 | 不写，须写完补或写入时前置 `\uFEFF` |
| PowerShell 5.1 `Set-Content -Encoding UTF8` | 写 |
| PowerShell 7 `Set-Content` / `Out-File` | 默认 `utf8NoBOM` 不写，须显式 `-Encoding utf8BOM` |
| PowerShell `[IO.File]::WriteAllText(path, text)` | 不写，须传 `[Text.UTF8Encoding]::new($true)` |
| Node `fs.writeFileSync(p, s, "utf8")` | 不写，须手动前置 `"\uFEFF"` |
| .NET `File.WriteAllText` | 不写（.NET Core 起） |
| git `.gitattributes` | 只管行尾（`eol=lf` / `eol=crlf`），**不管 BOM** |

## 症状 → 根因 → 处置

| 症状 | 根因 | 处置 |
| --- | --- | --- |
| PowerShell 报 `Missing closing '}'` / `Unexpected token`，文件看着没问题 | `.ps1` 无 BOM，5.1 按 ANSI 解码中文 | 转 UTF-8 with BOM，逻辑不变 |
| `.bat` / `.cmd` 首行就报命令不存在 | 文件带 BOM | 去掉 BOM |
| Linux 侧 `.sh` 报 `$'\r': command not found` | CRLF | 转 LF，并用 `.gitattributes` 固化 |
| Excel 打开 CSV 中文乱码 | 无 BOM | 加 BOM |
| `JSON.parse` 报 `Unexpected token` 但内容正常 | 首字节 `EF BB BF` | 去 BOM |
| 补好 BOM 后重新打包又丢了 | 生成环节的写盘 API 默认不写 BOM | 改生成脚本并加机器校验，别只补产物 |

## 修复优先级

1. **消灭组合条件**：能不带 BOM 的格式就别带；必须带的统一基线，让生成脚本一次写对
2. **机器校验**：生成后或 CI 里断言首三字节与行尾，不靠人眼
3. **约定固化**：`.gitattributes` 定行尾，文件类型与基线写进项目文档
4. **文档提醒**：最后才靠注释与说明

⚠️ 只补产物不修产线：BOM 反复丢失必然有一步在重写文件，先定位那次写入再补。

## 失败模式

| 症状 | 处置 |
| --- | --- |
| 用写入工具建完 `.ps1` 直接跑，报语法错 | 工具默认无 BOM，按「写完就查」补 BOM 后再跑 |
| 补完 BOM 又丢 | 找重写文件的那条命令（生成脚本 / 打包 / 格式化钩子），改其写盘 API |
| 加了 `.gitattributes` 仍报 CRLF | 它只管行尾；BOM 另行校验，已入库文件需重新规范化后提交 |
| 用 PowerShell 7 验过就以为没问题 | 消费方可能是 5.1 或 Excel，按消费方定基线 |
| 往 `.bat` 里写中文并加 BOM | 去 BOM，中文改由 `.ps1` 承担或输出改 ASCII |
