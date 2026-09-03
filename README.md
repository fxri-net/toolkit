# @fxri/toolkit

专为多人 + AI 跨项目协作打造：任务管理 + 多语言 CHANGELOG。

[![CI](https://github.com/fxri-net/toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/fxri-net/toolkit/actions/workflows/ci.yml)

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
npx toolkit tasks check               # 校验 active（frontmatter/命名规范/重名/依赖闭环/未闭合待办与 - [ ]）
npx toolkit tasks normalize           # 检查归档块（元数据/疑似任务块/日期漂移/排序/月份目录）
npx toolkit tasks normalize --check   # 只读检查（normalize 默认行为，可显式声明；与 --fix 互斥）
npx toolkit tasks normalize --fix     # 修复：补元数据 + 漂移块/错月文件迁移 + 降序重排 + 分隔清理
npx toolkit tasks --dir <path>        # 指定任务目录（默认 .tasks）
npx toolkit tasks check --strict      # 任务目录不存在时报错退出（默认容错为空结果）
```

视图过滤（待完成看创建/更新，已归档看完成时间）：

```bash
npx toolkit tasks --view all --owner 唐启云
npx toolkit tasks --view archived --status 已完成,已放弃
npx toolkit tasks --scope 工程化 --since 2026-09-01 --until 2026-09-03
npx toolkit tasks --date 2026-09-03       # 单日（与 --since/--until 互斥）
```

⚠️ **过滤与视图**：`--owner/--scope/--status/--date/--since/--until` 只作用于所选视图，不指定 `--view` 时默认只查待完成（active）。想看归档需显式 `--view archived` 或 `--view all`；过滤落在空视图时会提示「无匹配任务」，并附 `--view` 引导提示。`--owner/--scope/--status` 均支持逗号多值；`--status` 的非法值会告警并忽略。

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
- 文件名冲突自动追加序号（`-1`、`-2`…），不覆盖已有任务；标题过长导致文件名截断时会告警
- 导出目标目录不存在时自动创建（`.csv` / `.xlsx` / `.json` 均适用）

### 任务视图与导出结构

统一字段全集（各视图/格式按下表取子集，空字段留空）：

| 字段 | 含义 | 待完成（active） | 已归档（archived） |
| --- | --- | --- | --- |
| `view` 视图 | 来源 | 待完成 | 已归档 |
| `title` 任务名 | `# 标题`（回退文件名）/ 块标题 | ✅ | ✅ |
| `status` 状态 | 待办/进行中/阻塞/已完成/已放弃 | ✅ | ✅（已完成/已放弃） |
| `owner` 负责人 | — | ✅ | ✅ |
| `scope` 范围 | — | ✅ | ✅ |
| `created` 创建日期 | — | ✅ | ❌ |
| `updated` 更新日期 | — | ✅ | ❌ |
| `completed` 完成时间 | — | ✅（可空） | ✅ |
| `depends` 依赖 | 数组 | ✅ | ❌ |
| `file` 来源文件 | 相对 `.tasks` 路径 | ✅ | ✅ |

- **终端分组视图**（`toolkit tasks`）：按状态分组（待办→进行中→阻塞→已完成→已放弃→未标注），行显示 `日期 | 视图来源(all 时) | 负责人 | 任务名（范围）`，末尾输出按状态/负责人汇总；日期 = 待完成创建日 / 已归档完成时间；`STATUS_ORDER` 之外的未知状态（如笔误）会以兜底分组展示并在汇总计入「其他」
- **CSV**（`.csv`，UTF-8 BOM，超集列，一次一视图）：`视图, 任务名, 状态, 负责人, 范围, 创建日期, 更新日期, 完成时间, 依赖, 来源文件`
- **XLSX**（`.xlsx`，固定三 sheet）：
  - `待完成` sheet：任务名/状态/负责人/范围/创建日期/更新日期/完成时间/依赖/来源文件
  - `已归档` sheet：任务名/状态/负责人/范围/完成时间/来源文件
  - `汇总` sheet：顶部统计（任务总数 / 按状态 / 按负责人）+ 公共列明细（同 CSV 超集列）
- **JSON**（`.json` 或 `--format json`）：`{ schemaVersion: 1, summary: { total, byStatus, byOwner }, items: [...] }`；`items` 每项为英文 key 完整字段：`view("active"|"archived") / title / status / owner / scope / created / updated / completed / depends[] / file`；导入端读到更高 `schemaVersion` 会告警（仍尽力按当前字段映射解析）
- 排序统一：按状态分组顺序平铺、组内时间倒序（导出与终端一致）；视图/过滤后无匹配时导出仅表头（JSON 空 items），不报错
- 日期口径与过滤一致：待完成看创建/更新，已归档看完成时间；CSV/JSON 中 `created` 按 `YYYY-MM-DD` 输出

### 任务状态（单一事实源）

`status` 取值固定为五种：`待办` / `进行中` / `已完成` / `阻塞` / `已放弃`，其中 `已完成` / `已放弃` 为可归档（终结）状态。校验（`tasks check`）、导入非法值兜底、`--status` 过滤、归档判定统一引用 `src/tasks/types.ts` 的 `ALL_STATUSES` / `DONE_STATUSES` 常量——各域禁止再自建枚举副本，避免取值漂移（1.5.6 起已收口）。终端分组展示顺序（含展示用 `未标注`）另由 `STATUS_ORDER` 控制；未知状态不会静默丢弃，以兜底分组展示并计入汇总「其他」。

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
| `completed` 完成时间 | 完成时间 / 完成日期 / 截止时间 / 截止日期 / 结束时间；completed / done / finished / completedAt / due |
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

消费变更集后 `changelog version` 会自动把分组标题转为中文（如 `### Patch Changes` → `### 🐛 补丁修复`）并补发布日期；变更条目本身建议**再润色为中文**，与仓库既有 CHANGELOG 风格一致：

```markdown
## 1.5.3
> 2026-09-03 发布

### 🐛 补丁修复

- 修复 xxx：……（中文描述，可含多个条目）
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

隐私脱敏同理，环境变量 `FX_REDACT`（`0` 关 / `1` 开）、配置 `redact.enabled`。`toolkit tasks check` 默认把正文未勾选的 `- [ ]` 当作未闭合待办扫描，可用 `{ "check": { "includeCheckbox": false } }` 关闭；词标记扫描（待办/待实施/…）可用 `{ "check": { "pendingMarkers": false } }` 关闭。

> `.toolkitrc.json` 目前不设强制 schema/版本字段：未知字段会被忽略，配置项变更随主版本记录于 CHANGELOG，读取行为保持向后兼容。

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
- **校验**：`toolkit tasks check` 校验 active（frontmatter 合法性、owner/created/文件命名规范、重名、depends_on 闭环与引用归一——缺失依赖若已归档会给出精确归档位置；未闭合待办与 `- [ ]`，词标记不扫标题，复选框/词标记均可配置关闭）；`toolkit tasks normalize` 检查归档块（元数据完整性/疑似任务块/漂移/排序/月份目录），`--fix` 补齐元数据、把漂移块迁移到对应日期文件、并把放错月份目录的归档文件移动到正确月份目录
- **归档**：任务完成后执行 `toolkit tasks archive`（可 `--dry-run` 预演）；归档采用排他锁防并发覆盖。归档完成后若 `.changeset`（相对当前目录）无待发布变更集会有提示，仅为提醒，不影响归档
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

公共导出函数（`@fxri/toolkit` 入口）按领域：

| 领域 | 函数 | 说明 |
| --- | --- | --- |
| 任务读取 | `listTasks(dir?)` | 读 active 为 `Task[]`（含 frontmatter/正文） |
| | `listActiveTasks(dir?)` / `listArchivedTasks(dir?)` | 读为统一 `TaskRow[]` |
| | `parseArchiveTasks(file)` | 解析归档文件为块列表 |
| | `parseFrontmatter(content)` / `stripFrontmatter(content)` | frontmatter 解析/剥离 |
| | `listTaskFiles(dir)` / `dateFromFileName(file)` | 目录扫描 / 文件名日期提取 |
| 查询/展示 | `queryTasks(dir?, view?, filter?)` | 过滤 + 排序 + 汇总 |
| | `orderRows(rows)` / `buildSummary(rows)` | 排序 / 汇总统计 |
| | `printTasks(dir?, redact?)` / `printTaskBoard(dir?, view?, filter?, redact?)` | 终端分组总览 |
| 归档/校验 | `archiveTasks(dir?, redact?, options?)` | 任务级归档（`dryRun`/`warn` 可配） |
| | `validateTaskFile(file)` / `validateTasks(dir?)` | active 校验，返回 `CheckResult` |
| | `checkArchive(dir?)` / `fixArchive(dir?)` | 归档归一化检查 / 修复 |
| | `normalizeCompleted(completed)` | 完成时间定宽化 `YYYY-MM-DD HH:mm` |
| 导入导出 | `exportTasks(file, rows, summary, redact?)` | 按扩展名导出 `.csv` / `.xlsx` / `.json` |
| | `toCSV(rows, redact?)` / `toJSON(rows, summary, redact?)` | 直接取文本（`.xlsx` 无纯文本形态） |
| | `importTasks(file, dir?, opts?)` | 回读三种格式生成任务 |
| CHANGELOG | `collectChangelogs(dir)` / `formatChangelog(file, today, lang, redact?)` / `formatChangelogs(dir, today, lang, redact?)` | 收集/格式化 |
| | `localDate()` / `languages` / `DEFAULT_LANG` | 本地日期 / 语言表 / 默认语言键 |
| 其他 | `redactText(text, enabled)` | 隐私脱敏 |
| | `parseBool(value, fallback)` / `resolveEnabled(cli, envKey, config, fallback)` | 布尔与三档开关解析 |
| | `loadToolkitConfig(dir?)` / `getConfigSection(key)` / `resetToolkitConfigCache()` | 配置加载（带向上查找与缓存失效） |

类型（`Task` / `TaskRow` / `TaskFilter` / `TaskSummary` / `CheckIssue` 等）由同名模块导出，随函数返回值推断即可，无需单独引入。

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

## 🧭 维护者发版（本仓库自举 changesets）

本仓库（toolkit 自身）与对外用法一致，用 changesets 驱动发版，配合中文格式转换：

1. 记录变更：`pnpm changeset`（或 `pnpm build && node ./dist/cli.js changelog`），选择版本类型并填写变更描述
2. 消费变更集：`pnpm build && node ./dist/cli.js changelog version`——changesets 写版本号与英文 CHANGELOG 后，工具自动做中文标题格式化
3. 微调：将变更条目润色为中文说明（与既有 CHANGELOG 风格一致），删除已消费的 `.changeset/*.md`
4. 提交：代码与 CHANGELOG/版本改动分两次提交（如「修复：…」「文档：发布 vX.Y.Z」）
5. 标签与发布：`git tag vX.Y.Z` 并推送各 remote，再执行 `pnpm publish`（`pnpm release` = build + publish）

## 🔒 隐私脱敏

落盘记录自由文本（任务正文/标题、CHANGELOG 条目）时默认脱敏敏感信息，`owner` 等结构化 frontmatter 字段不脱敏。

> 作用范围：脱敏应用于**终端展示、导出文件与归档落盘**；`.tasks/active` 下的源任务文件按原样保存，不改动原始正文与标题。`.toolkitrc.json` 从当前目录向上查找最近一份，支持在 monorepo 子目录运行。

- **内置规则**：邮箱、手机号、身份证、IPv4、含端口内网 URL、JWT（eyJ 三段）、AWS 访问密钥（AKIA/ASIA）、GitHub Token（ghp/gho/ghu/ghs/ghr 经典与 github_pat_ 细粒度）、OpenAI API Key（sk- 经典与 sk-proj- 项目）、Slack Token（xox 系与 xapp app 级）
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
| GitHub 细粒度 Token（内置） | `github_pat_11AABB22CCDD33EE_FFGG…（长串）` | `github_pat_****` |
| OpenAI 项目 Key（内置） | `sk-proj-AAAAAAAA…（长串）` | `sk-proj-****` |
| 自定义码（自定义，flags i） | `COD-123456` | `cod-******` |

密钥类规则带长度门槛（如经典 ghp_ 需 ≥40 字符、github_pat_ 需 ≥92 字符、sk- 需 ≥23 字符、sk-proj- 需 ≥48 字符），避免误伤正常文本。

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
