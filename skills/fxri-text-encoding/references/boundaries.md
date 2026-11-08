# 跨边界传递：命令行、环境变量、请求体、模板与远端元数据

> 本文件是 `fxri-text-encoding` 的明细附表；触发判据与乱码三问以 `SKILL.md` 为准。

## 通用判据

非 ASCII 文本每跨一次边界，就重新按目标端的默认解码检查一次：

1. **构造侧**：用 UTF-8 构造字节，不经过 ASCII / ANSI 默认的控制台、管道或字符串拼接。
2. **传输侧**：显式声明 UTF-8（请求头、文件编码、模板输出编码），不依赖工具默认值。
3. **落地侧**：写完从目标端读回，与原文逐字比对；本地字符串正常不代表远端落对。
4. **有损即回源**：出现字符缺失、替换、截断、空串时原字节已丢，不能反向修复，只能回源重取并修构造 / 传输通道。

## 边界与处置

| 边界 | 典型场景 | 风险 | 处置 |
| --- | --- | --- | --- |
| 命令行参数 | 原生程序、CLI 工具、`git` 参数 | Windows 原生程序可能按 ANSI / OEM 转换；旧程序只取单字节 | 非 ASCII 优先走文件或 stdin；必须走参数时先小样验证读回 |
| 环境变量 | CI 变量、启动脚本注入 | 子进程按自身默认编码读取，跨 shell 后失真 | 在 UTF-8 shell / `pwsh` 中设置；`powershell.exe` 下非 ASCII 变量优先落文件再读 |
| HTTP / RPC 请求体 | 项目描述、release、issue / PR 正文、Webhook | 客户端按 ASCII / ANSI 编码请求体；服务端或数据库再次转换、截断 | 请求体以 UTF-8 字节发送并声明 charset；写后 GET 读回比对 |
| 模板渲染 | 仓库模板、占位符替换、`sed` / `envsubst` / 程序内 replace | 模板源正常，产物由最后写入者决定 | 读写两端都显式 UTF-8；产物读回比对；不靠控制台默认编码 |
| git / 远端元数据 | tag 注释、项目描述、仓库设置 | CLI / API 默认编码不一致，远端二次处理 | 与请求体同法；提交信息的内容风格另见提交信息规则 |

## 构造示例

- `curl`：请求体先落 UTF-8 文件，
   再 `curl -sS -X PUT -H "Content-Type: application/json; charset=utf-8" --data-binary @body.json "$URL"`。
- `powershell.exe`：`$bytes = [Text.Encoding]::UTF8.GetBytes($json)`，
   `Invoke-RestMethod -Body $bytes -ContentType 'application/json; charset=utf-8'`；不要依赖字符串 `-Body` 的默认编码。
- Node：`Buffer.from(JSON.stringify(body), "utf8")` 作为 `fetch` 的 body；读回用同一编码解析。
- Python：`json.dumps(obj, ensure_ascii=False).encode("utf-8")` 作为请求体；不要省略 `ensure_ascii` 后又按字面量当正文。
- 模板：模板与产物都用 UTF-8 读写；替换后立即读回，确认占位符位置与原文一致。

## 读回校验

- 文件：判首三字节与行尾，再按 UTF-8 读取并与原文比对长度、字符。
- API / 远端：GET 回读，逐字比对；不要只判断“非空”或“包含关键字”。
- 服务端二次转换：数据库 `utf8`（非 `utf8mb4`）会截断 emoji，平台可能做规范化；读回时同时核对长度与码点。

## 不要误修

`\uXXXX`、百分号编码、HTML 实体、Base64 是合法表示形式，目标端接受就不动；只有目标端明确要求原文时才解码。孤立 `?` 是合法字符，不能作为有损编码的证据。
