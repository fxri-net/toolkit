# API 参考

> 目标读者：把本工具作为库引入 Node 项目（自动化脚本、内部平台）的开发者。导出清单与 `src/index.ts` 实际导出同源。

## 解决什么问题

CLI 面向人与 AI 交互；库形态让你把任务管理、归档、校验、CHANGELOG 格式化、脱敏嵌入到自己的脚本或平台里。

## 安装与引入

```bash
pnpm add @fxri/toolkit   # 库使用时作为正式依赖
```

```typescript
import { listTasks, archiveTasks } from "@fxri/toolkit"
```

ESM 与 CJS 双形态入口（`import` / `require` 均可）；类型随函数返回值推断，无需单独引入。

## 任务读取

| 函数 | 说明 |
| --- | --- |
| `listTasks(dir?)` | 读 active 任务为 `Task[]`（含 frontmatter 与正文），默认目录 `.tasks` |
| `listActiveTasks(dir?)` / `listArchivedTasks(dir?)` | 读为统一 `TaskRow[]`（active / archived 视图） |
| `parseArchiveTasks(file)` | 解析单个归档文件为块列表 `{ block, completed }[]` |
| `parseFrontmatter(content)` / `stripFrontmatter(content)` | frontmatter 解析 / 剥离 |
| `listTaskFiles(dir)` / `dateFromFileName(file)` | 目录扫描（一层年月子目录）/ 从文件名提取日期 |

## 查询与展示

| 函数 | 说明 |
| --- | --- |
| `queryTasks(dir?, view?, filter?)` | 过滤 + 排序 + 汇总，返回 `{ rows, summary }`；`view`: `active`/`archived`/`all` |
| `orderRows(rows)` / `buildSummary(rows)` | 统一排序 / 汇总统计（`{ total, byStatus, byOwner }`） |
| `printTasks(dir?, redact?)` | 终端总览 |
| `printTaskBoard(dir?, view?, filter?, redact?)` | 终端分组视图（按状态分组） |

`TaskFilter` 支持 `owner`/`scope`/`status`（数组多值）与 `date`/`since`/`until`（日期区间，互斥约束由调用方保证）。

## 归档与校验

| 函数 | 说明 |
| --- | --- |
| `archiveTasks(dir?, redact?, options?)` | 任务级归档；`options.dryRun` 预演、`options.warn` 软告警开关；内部含排他锁 |
| `validateTaskFile(file)` / `validateTasks(dir?)` | active 校验，返回 `CheckResult`（`errorCount`/`warnCount`/`issues[]`） |
| `checkArchive(dir?)` / `fixArchive(dir?)` | 归档归一化检查 / 修复（检查含时间异常：完成时间晚于当前系统时间或恰为零点整（疑似只填日期被补零）仅报告，不自动改值） |
| `normalizeCompleted(completed)` | 完成时间定宽化 `YYYY-MM-DD HH:mm` |

## 导入导出

| 函数 | 说明 |
| --- | --- |
| `exportTasks(file, rows, summary, redact?)` | 按扩展名导出 `.csv` / `.xlsx` / `.json` |
| `toCSV(rows, redact?)` / `toJSON(rows, summary, redact?)` | 直接取文本（`.xlsx` 无纯文本形态） |
| `importTasks(file, dir?, opts?)` | 回读三种格式生成任务；`opts.target`: `active`/`archive`，`opts.importColumns` 自定义列映射，`opts.dryRun` 预演 |

JSON 结构：`{ schemaVersion: 1, summary, items }`；`items` 为英文 key 完整字段（`view/title/status/owner/scope/created/updated/completed/depends[]/file`）。

## CHANGELOG

| 函数 | 说明 |
| --- | --- |
| `collectChangelogs(dir)` | 收集 CHANGELOG 文件 |
| `formatChangelog(file, today, lang, redact?)` | 格式化单个文件 |
| `formatChangelogs(dir, today, lang, redact?)` | 格式化目录下全部 |
| `localDate()` / `languages` / `DEFAULT_LANG` | 本地日期 / 语言表 / 默认语言键（`zh`） |

```typescript
// 发版后把分组标题转为中文
formatChangelogs(".", localDate(), languages[DEFAULT_LANG])
// 自定义语言直接挂到 languages 对象
languages.ja = { replacements: { "### Major Changes": "### 🚨 重大変更" }, deps: "- 依存関係を更新", released: "リリース" }
```

`ChangelogLanguage` 三段结构：`replacements`（标题替换映射）/ `deps`（依赖更新条目文案）/ `released`（发布日期后缀）。

## 隐私脱敏与开关

| 函数 | 说明 |
| --- | --- |
| `redactText(text, enabled)` | 按内置 + 自定义规则掩码自由文本 |
| `parseBool(value, fallback)` | 布尔解析（认 `0/1`、`true/false`、`on/off`） |
| `resolveEnabled(cli, envKey, config, fallback)` | 三档开关合并：CLI 参数 > 环境变量 > 配置 > 默认 |

## 配置

| 函数 | 说明 |
| --- | --- |
| `loadToolkitConfig()` | 从 `process.cwd()` 向上查找最近 `.toolkitrc.json` 并缓存 |
| `getConfigSection(key)` | 取某能力域配置段（对象），不存在返回 `undefined` |
| `resetToolkitConfigCache()` | 失效缓存（长驻进程 / 测试中改配置后调用） |

配置字段枚举见[配置参考](./config)。

## 最小示例

```typescript
import { queryTasks, exportTasks, archiveTasks, redactText } from "@fxri/toolkit"

// 查全部已归档中某负责人的任务并导出 Excel
const { rows, summary } = queryTasks(".tasks", "all", { owner: ["张三"] })
await exportTasks("tasks.xlsx", rows, summary)

// 归档前预演
archiveTasks(".tasks", true, { dryRun: true })

// 脱敏
redactText("联系 someone@example.com", true) // → "联系 s*****@*****.com"
```

## 相关页面

- [CLI 参考](./cli)：命令行形态
- [任务文件规范](./guide#任务文件规范)：`Task` 数据的文件格式约定
