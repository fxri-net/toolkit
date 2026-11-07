---
name: fxri-text-encoding
description: 在写脚本、配置、数据交换类文本，或用 shell 重定向、程序生成 / 转码产出文本，或把非 ASCII 文本传给命令行 / 环境变量 / API 请求体 / 远端元数据之前加载：按读取方默认解码与字节形态判断，不按语言或扩展名猜。读取方不是 UTF-8、格式对 BOM / 行尾敏感、经过生成 / 转码通道，或已出现乱码、非 ASCII 与原文不一致时适用。不用于 Base64 / URL 编码、排序计数、CSV 语法、路径、时区、提交信息风格、任务建档与代码风格。
license: MIT
metadata:
  version: "1.2.4"
  tier: optional
  author: fxri
  source: https://github.com/fxri-net/toolkit
---

# 文本编码与字节形态

> 本技能版本 1.2.4（随 @fxri/toolkit 同批分发）。被问版本时即报此值（不读磁盘、不跑 CLI）；与 `toolkit skills status` 的磁盘值不一致即说明会话上下文已过期，开新会话即可。

## 读取地图

| 你在做什么 | 必读 | 可跳过 |
| --- | --- | --- |
| 写脚本 / 配置 / 数据文件 | 本文件 + `references/tables.md`（基线、写盘行为、判字节命令） | troubleshooting、boundaries |
| 命令行 / 管线里出现乱码、重定向落盘 | 本文件乱码三问 + `references/troubleshooting.md`「运行期乱码」 | tables、boundaries |
| 非 ASCII 跨进程 / 跨机器传递 | 本文件乱码三问 + `references/boundaries.md` | tables |
| 已出故障、要按表现反查 | `references/troubleshooting.md` | 其余 |

## 触发判据（按读取方默认解码与字节形态判断，不按语言 / 扩展名白名单）

满足任一即加载：

1. **读取方编码**：即将写入或传输非 ASCII 文本，且读取方默认解码不是 UTF-8——`powershell.exe` / `cmd` / Excel / MSVC / 未指定 `-encoding` 的 javac 按系统代码页，bash / CI 按 locale。
2. **字节形态敏感**：可执行脚本与 shebang 文件（BOM / CRLF 会直接执行失败）、要求 BOM 的格式（`.ps1` 等）、禁止 BOM 且本次写入可能引入或移除 BOM 的格式（`.bat`、JSON、PHP 源文件等）。
3. **生成或跨边界通道**：写入由 `>` / `>>`、`Set-Content` / `Out-File` / `Export-Csv`、模板渲染 / 占位符替换、程序生成或导出、`iconv` 转码完成；或非 ASCII 文本传给命令行参数、环境变量、HTTP / RPC 请求体（项目描述、release、issue / PR 正文）、git / 远端元数据。
4. **执行通道与症状**：PS 管道喂原生命令、重定向落盘、`Get-Content` 读无 BOM 文件、`chcp` / `iconv`、locale 默认编码、运行脚本；或出现乱码，或非 ASCII 内容与原文不一致（字符缺失、被替换、截断、长度异常、变形或 mojibake）。

不加载：写入方与读取方都按 UTF-8（或按字节原样）处理，本次写入既不新增 / 移除 BOM、也不改行尾，且不经过生成 / 转码 / 跨边界通道；纯 ASCII 命令；纯展示输出且无异常。非 ASCII 本身不是故障，合法的日文、韩文、emoji、重音字符与 `\uXXXX`、百分号编码、HTML 实体、Base64 均按正常内容处理。临时、一次性、不入库、不提交、仓库外 temp 目录**均不豁免**——读取方可能在别的机器、Excel、CI 或远端平台，错误不会回到本会话。

## 先分归属（乱码三问）

故障是「写入方字节」×「读取方默认解码」；看到异常先走三问，不按字符外观定性：

1. **是谁的字节？** 先与预期原文或文件声明编码比对：字符都在、只是排列错 → 解码链问题；字符缺失 / 被替换 / 截断 / 空串 → 生产者编码失败。再重定向到文件看首字节，区分落点字节坏与终端 / 管线显示坏。
2. **还能救吗？** 能用已知错误解码链反向还原的是 mojibake（`涓枃` = UTF-8 被当 GBK 读，`ä¸æ–‡` = UTF-8 被当 Latin-1 读，`ÖÐÎÄ` = GBK 被当 Latin-1 读，`锟斤拷` = GBK / UTF-8 反复转）；出现替代符、字符缺失、截断、空串的是有损编码，原字节已丢，**不可逆**。替代符不限于 `?`，也可能是 `�`、`\uFFFD`、`&#65533;`、空白或空串。
3. **错在第几跳？** 只修认出的那一跳。`\u4e2d\u6587`、`%E4%B8%AD`、`&#20013;`、Base64 是表示形式，目标端接受就不动；`?` 是合法字符，孤立出现不判乱码。

第 2、3 问的处置——按特征串选反向转码（先备份原件，转完核对本意）：

- `涓枃` 类 `iconv -f GBK -t UTF-8`；`ä¸æ–‡` 类 `-f ISO-8859-1`
- 无 iconv 时：`[Text.Encoding]::UTF8.GetString([Text.Encoding]::GetEncoding(936).GetBytes($s))`，Latin-1 把 936 换 28591
- 各读取方无 BOM 时的默认解码见 `references/tables.md`

## 基线决策（按读取方推导）

写盘前先定**字符集、BOM、行尾**三件套，按三件事推导而非套扩展名白名单：读取方默认解码、是否要求或禁止 BOM、行尾是否敏感。常见类型的基线与各写入工具的实际行为见 `references/tables.md`。

## 写盘：谁在悄悄改字节

AI 写入工具默认不写 BOM，是本类故障最常见来源。写完立刻自查：

1. 新建或改写需要 BOM 的文件（如 `.ps1`）后判首三字节，不是 `EF BB BF` 当场补，别等运行时报错
2. 批量生成、打包、模板渲染、格式化钩子跑完后抽查产物并读回与原文比对，再回跑一次生成脚本——只补产物不修产线，下次还会丢
3. 不落盘的内联命令没有文件侧问题，转「运行期乱码」

判首三字节、补 BOM、Node 读回剥 `\uFEFF`、全仓巡检命令见 `references/tables.md`。

⚠️ 两者同名不同义：要在两种 shell 下都跑，用 `[Text.UTF8Encoding]::new($true)` 显式指定；`utf8BOM` 只有 `pwsh` 认。

## 跨边界（不落盘、不出本机）

非 ASCII 文本跨进程 / 跨机器传递时，边界同样按读取方默认解码判断；请求体、命令行参数、环境变量、模板产物都可能被 ASCII / ANSI 默认编码吃掉。写完后从目标端读回与原文比对，本地字符串正常不代表远端落对。构造方式与逐项处置见 `references/boundaries.md`。

## 修复纪律

1. **消灭组合条件并固化**：能不带 BOM 的格式就别带；必须带的统一基线，写进 `.gitattributes`（`eol` / `working-tree-encoding`）、`.editorconfig`（`charset`）与项目文档
2. **机器校验**：生成后或 CI 断言首三字节与行尾，不靠人眼
3. **只转一次、不只补产物**：转码前确认原始编码（有损不可逆，回源重取）；BOM 反复丢失一定有一处在重写文件，先定位那次写入再补
