# @fxri/toolkit

专为多人 + AI 跨项目协作打造：任务管理 + 多语言 CHANGELOG。

## ✨ 特性

- 📋 **任务管理** - 扫描、总览、按完成时间归档 Markdown 任务文件；支持待完成 / 已归档 / 合并视图与过滤汇总，任务可导入导出 CSV / XLSX / JSON（全语言支持，见 [SPEC.md](./SPEC.md)）
- 🌍 **全语言 CHANGELOG** - 封装 changesets，内置 zh/en，任意语言通过配置扩展或覆盖
- 🚀 **CLI + 库 API 双形态** - 可命令行使用，也可作为库引入

## 📦 安装

```bash
# 项目依赖
pnpm add -D @fxri/toolkit
```

```bash
# 全局安装
pnpm install -g @fxri/toolkit
```

## 🔧 CLI 命令

### 任务管理（tasks）

```bash
npx toolkit tasks                     # 待完成总览（默认）
npx toolkit tasks --view archived     # 仅已归档
npx toolkit tasks --view all          # 待完成 + 已归档（状态分组，来源可辨）
npx toolkit tasks archive             # 归档已完成任务
npx toolkit tasks archive --dry-run   # 归档预演（只预览，不落盘）
npx toolkit tasks check               # 校验 active（frontmatter/重名/依赖闭环/未闭合待办）
npx toolkit tasks normalize           # 检查归档块（元数据/日期漂移/排序）
npx toolkit tasks normalize --fix     # 补齐元数据 + 降序重排
npx toolkit tasks --dir <path>        # 指定任务目录（默认 .tasks）
```

视图过滤（待完成看创建/更新，已归档看完成时间）：

```bash
npx toolkit tasks --view all --owner 唐启云
npx toolkit tasks --view archived --status 已完成,已放弃
npx toolkit tasks --scope 工程化 --since 2026-09-01 --until 2026-09-03
npx toolkit tasks --date 2026-09-03       # 单日（与 --since/--until 互斥）
```

导入导出（扩展名驱动，均受过滤与脱敏开关影响）：

```bash
npx toolkit tasks --view all --export tasks.csv    # UTF-8 BOM CSV（超集列）
npx toolkit tasks --view all --export tasks.xlsx   # Excel 三 sheet（待完成/已归档/汇总）
npx toolkit tasks --view all --export tasks.json   # { summary, items } 完整字段
npx toolkit tasks --view all --format json         # JSON 输出到 stdout
npx toolkit tasks --import tasks.csv --dry-run     # 导入预演（不落盘）
npx toolkit tasks --import tasks.xlsx              # 导入，默认生成待完成任务
npx toolkit tasks --import tasks.json --target archive   # 直接写归档
```

- 导入兼容本工具三种导出产物；表头自动识别（中文/英文别名），`.toolkitrc.json` 的 `tasks.importColumns` 可自定义列映射，优先级高于内置
- 文件名冲突自动追加序号，不覆盖已有任务

### 任务导入列别名（内置表）

导入时表头自动映射到任务字段，内置别名表如下（**列名不区分大小写**，中文列原文匹配；`custom` 段示例见下方）。自定义映射在 `.toolkitrc.json` 的 `tasks.importColumns` 配置，键为实际表头列名，值为标准字段：

```json
{
  "tasks": {
    "importColumns": { "我的标题": "title", "Deadline": "completed" }
  }
}
```

| 标准字段 | 内置别名（含导出表头） |
| --- | --- |
| `title` 任务名（必填） | 任务名 / 标题 / 事项 / 任务 / 任务标题 / 事项名称；title / name / task / subject / summary |
| `status` 状态 | 状态；status / state（非法值导入时归为「待办」） |
| `owner` 负责人 | 负责人 / 经办人 / 处理人 / 执行人 / 指派给；owner / assignee / handler |
| `scope` 范围 | 范围 / 项目 / 模块；scope / project |
| `created` 创建日期 | 创建日期 / 创建时间；created / created_at / createdAt |
| `updated` 更新日期 | 更新日期 / 更新时间；updated / updated_at / updatedAt |
| `completed` 完成时间 | 完成时间 / 完成日期 / 截止时间 / 截止日期 / 结束时间；completed / done / finished / due |
| `depends` 依赖 | 依赖 / 依赖任务；depends / depends_on / dependency / dependencies |
| `body` 正文 | 备注 / 描述 / 正文 / 说明；description / body / note / notes |
| 忽略列（元信息） | 视图 / 来源文件 / 文件；view / file / path |

带完成时间的行若状态非「已完成/已放弃」，导入时自动置为「已完成」并告警；`--target active`（默认）生成待完成任务文件，`--target archive` 直接写归档块。

### CHANGELOG（changelog）

```bash
npx toolkit changelog                       # 创建变更集（等价 changeset）
npx toolkit changelog version               # 发版 + 格式化（默认中文）
npx toolkit changelog --lang en version     # 指定语言
npx toolkit changelog format                # 仅格式化已有 CHANGELOG
npx toolkit changelog status / publish      # 其余 changeset 子命令透传
```

### 通用选项

```bash
-h, --help      显示帮助（全局或子命令）
-v, --version   显示版本号
--redact / --no-redact   开启/关闭隐私脱敏（默认开启）
--warn  / --no-warn      开启/关闭软告警（默认开启）
```

开关为**双向三档**，优先级从高到低：CLI 参数 > 环境变量 > 配置文件 > 默认开启。例如关闭软告警可任选其一：

- 本次命令：`toolkit tasks archive --no-warn`
- 环境变量：`FX_CHECK_WARN=0`
- 配置文件：`.toolkitrc.json` 写 `{ "check": { "warnings": false } }`

隐私脱敏同理，环境变量 `FX_REDACT`（`0` 关 / `1` 开）、配置 `redact.enabled`。

### 接入 package.json

```json
{
  "devDependencies": { "@fxri/toolkit": "^1.0.0" },
  "scripts": {
    "tasks": "toolkit tasks",
    "tasks:archive": "toolkit tasks archive",
    "changeset": "toolkit changelog",
    "version": "toolkit changelog version"
  }
}
```

## 📋 方案落盘（任务区）

把已确认的实施/修复方案登记为 `.tasks/` 下的任务文件，由 toolkit 统一校验与归档，配合 AI 工作流在任意语言项目落地：

- **调用优先级**：`npx toolkit`（项目本地依赖）→ `toolkit`（全局安装）；两者均不可用时直接以 Markdown 输出方案，不阻塞执行
- **规范来源**：优先读取项目根 `SPEC.md`，缺失时读取包内 `SPEC.md`（目录结构、文件命名与 frontmatter 字段均以该规范为准）
- **多人协作（先查后写）**：`.tasks/` 是多写者共享区，新建/更新任务前先 `toolkit tasks` 查 active 总览并核对 archive，避免重复建档；同一需求共用一个任务文件
- **校验**：`toolkit tasks check` 校验 active（frontmatter 合法性、重名、depends_on 闭环、未闭合待办）；`toolkit tasks normalize` 检查归档块（元数据/漂移/排序），`--fix` 补齐
- **归档**：任务完成后执行 `toolkit tasks archive`（可 `--dry-run` 预演）；归档采用排他锁防并发覆盖
- **版本管理**：涉及发版时先 `toolkit changelog` 创建变更集，再 `toolkit changelog version` 发版并格式化 CHANGELOG

### 归档与提交约束

项目内任务（含 AI 工作流）完成后，遵循**先归档、后提交**的顺序，保证任务记录与代码变更落在**同一个 git 提交**：

1. 任务完成后，在任务文件 frontmatter 标记 `status: 已完成` 并填写 `completed` 完成时间
2. 执行 `toolkit tasks archive` 归档，任务从 `active/` 移入 `archive/`
3. 归档后再将代码变更与归档文件一起 `git commit`

避免两种情形：任务完成但文件长期滞留 `active/` 未归档；或代码已提交、归档又单独形成一条提交记录。

## 📚 库 API

```typescript
import {
  listTasks, printTasks, printTaskBoard, archiveTasks, parseFrontmatter,
  listArchivedTasks, queryTasks, exportTasks, importTasks,
  validateTasks, checkArchive, fixArchive, normalizeCompleted,
  resolveEnabled, parseBool, loadToolkitConfig,
  languages, DEFAULT_LANG, localDate, formatChangelogs, redactText,
} from "@fxri/toolkit"

// 任务管理
const tasks = listTasks(".tasks")
printTasks(".tasks")
const result = archiveTasks(".tasks")
const check = validateTasks(".tasks")            // 校验 active
const issues = checkArchive(".tasks")            // 检查归档
const fixed = fixArchive(".tasks")               // 归一化修复

// 查询 / 导入导出（1.4.0）
const { rows, summary } = queryTasks(".tasks", "all", { owner: "唐启云", since: "2026-08-01" })
printTaskBoard(".tasks", "all")                  // 终端分组视图（待完成/已归档/all）
await exportTasks("tasks.xlsx", rows, summary)   // .csv / .xlsx / .json
const imported = await importTasks("tasks.csv", ".tasks", { target: "active" })

// CHANGELOG 格式化（默认中文）
formatChangelogs(".", localDate(), languages[DEFAULT_LANG])
formatChangelogs(".", localDate(), languages.en)

// 隐私脱敏（printTasks/archiveTasks/formatChangelog(s) 的第 2/4 个参数 redact 默认 true）
const masked = redactText("联系 tqy@fxri.net", true) // → "联系 t***@***.net"
```

`printTasks` / `archiveTasks` / `formatChangelog` / `formatChangelogs` 均提供可选 `redact` 参数（默认 `true`），传 `false` 可关闭本次脱敏。

### 全语言支持

内置 `zh` / `en`，其余任意语言通过 `.toolkitrc.json` 的 `changelog.languages` 配置扩展，配置的同名 key 覆盖内置：

```json
{
  "changelog": {
    "languages": {
      "ja": {
        "replacements": { "### Major Changes": "### 🚨 重大変更" },
        "deps": "- 依存関係を更新",
        "released": "リリース"
      }
    }
  }
}
```

使用 `--lang ja` 指定（选项前置）：`toolkit changelog --lang ja format`。

每个语言的 `ChangelogLanguage` 结构：`replacements`（标题替换映射，源标题 → 目标标题）、`deps`（依赖更新条目文案）、`released`（发布日期后缀）。库 API 侧也可直接操作 `languages` 对象追加语言。

## 🔒 隐私脱敏

落盘记录自由文本（任务正文/标题、CHANGELOG 条目）时默认脱敏敏感信息，`owner` 等结构化 frontmatter 字段不脱敏。

- **内置规则**：邮箱、手机号、身份证、IPv4、AWS/GitHub/OpenAI/Slack 密钥、JWT、含端口内网 URL
- **开关**（双向三档，默认开启，优先级从高到低）：
  - CLI 参数 `--redact` / `--no-redact`
  - 环境变量 `FX_REDACT=1`（开）/ `FX_REDACT=0`（关，也认 true/on、false/off）
  - 配置文件 `redact.enabled: true` / `false`
- **自定义规则**：项目根 `.toolkitrc.json`，追加规则（优先于内置）或按 `name` 禁用内置规则：

```json
{
  "redact": {
    "enabled": true,
    "disable": ["手机号"],
    "rules": [
      { "name": "自定义码", "pattern": "cod-[0-9]{6}", "flags": "i", "replacement": "cod-******" }
    ]
  }
}
```

**效果示例**：以上配置下，任务正文 `联系 tqy@fxri.net，电话 13812345678，验证码 COD-123456` 归档后：

| 类型 | 原文 | 归档后 |
| --- | --- | --- |
| 邮箱（内置） | `tqy@fxri.net` | `t***@***.net` |
| 手机号（已禁用） | `13812345678` | `13812345678` |
| 自定义码（自定义，flags i） | `COD-123456` | `cod-******` |

## ⚙️ 环境要求

- Node.js >= 20（正式支持）

### 版本兼容性实测

| 能力 | Node 20 | Node 18 |
| --- | --- | --- |
| 安装 | ✅ | ✅（npm 报 EBADENGINE 警告） |
| 帮助 / 版本（--help / --version） | ✅ | ✅ |
| tasks（总览 / 归档） | ✅ | ✅ |
| 隐私脱敏（含 --no-redact 开关） | ✅ | ✅ |
| changelog format（纯格式化） | ✅ | ✅ |
| changelog init/add/version/publish | ✅ | ❌ |

⚠️ Node 18 下依赖 changesets 的 changelog 子命令因上游 `human-id@4`（ESM-only）无法被 `require()`，报 `ERR_REQUIRE_ESM`；属 changesets 生态限制，非本工具代码问题。

## 📄 版权信息

作者：唐启云 <tqy@fxri.net>

版权：Copyright © 2026 方弦研究所. All rights reserved.

网站：[方弦研究信息网](https://fxri.net:444/)

协议：[MIT License](./LICENSE)

商标："方弦™"为第 42 类商标（注册号 89648411），本开源许可不授予商标使用权，详见 [TRADEMARK.md](./TRADEMARK.md)
