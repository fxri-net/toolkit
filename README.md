# @fxri/toolkit

开发工程化工具集：任务管理 + 多语言 CHANGELOG 发布。

## ✨ 特性

- 📋 **任务管理** - 扫描、总览、按完成时间归档 Markdown 任务文件（语言无关，见 [SPEC.md](./SPEC.md)）
- 🌍 **多语言 CHANGELOG** - 封装 changesets，标题中文化/英文，语言通过 `--lang` 选择，可扩展
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
npx toolkit tasks               # 任务总览
npx toolkit tasks archive       # 归档已完成任务
npx toolkit tasks --dir <path>  # 指定任务目录（默认 .tasks）
```

### CHANGELOG（changelog）

```bash
npx toolkit changelog                     # 创建变更集（等价 changeset）
npx toolkit changelog version             # 发版 + 格式化（默认中文）
npx toolkit changelog version --lang en   # 指定语言（当前 zh / en）
npx toolkit changelog format              # 仅格式化已有 CHANGELOG
npx toolkit changelog status / publish    # 其余 changeset 子命令透传
```

### 通用选项

```bash
-h, --help      显示帮助（全局或子命令）
-v, --version   显示版本号
--no-redact     关闭隐私脱敏（tasks / changelog 均可用）
```

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
- **校验与归档**：写入方案文件后执行 `toolkit tasks` 校验总览；任务完成后执行 `toolkit tasks archive` 归档
- **版本管理**：涉及发版时先 `toolkit changelog` 创建变更集，再 `toolkit changelog version` 发版并格式化 CHANGELOG

## 📚 库 API

```typescript
import {
  listTasks, printTasks, archiveTasks, parseFrontmatter,
  languages, DEFAULT_LANG, localDate, formatChangelogs, redactText,
} from "@fxri/toolkit"

// 任务管理
const tasks = listTasks(".tasks")
printTasks(".tasks")
const result = archiveTasks(".tasks")

// CHANGELOG 格式化（默认中文）
formatChangelogs(".", localDate(), languages[DEFAULT_LANG])
formatChangelogs(".", localDate(), languages.en)

// 隐私脱敏（printTasks/archiveTasks/formatChangelog(s) 的第 2/4 个参数 redact 默认 true）
const masked = redactText("联系 tqy@fxri.net", true) // → "联系 t***@***.net"
```

`printTasks` / `archiveTasks` / `formatChangelog` / `formatChangelogs` 均提供可选 `redact` 参数（默认 `true`），传 `false` 可关闭本次脱敏。

### 语言扩展

新增语言只需在 `languages` 里追加一个映射项：

```typescript
export const languages = {
  zh: { replacements: { "### Major Changes": "### 🚨 重大变更", ... }, deps: "- 更新依赖", released: "发布" },
  en: { replacements: {}, deps: "- Updated dependencies", released: "released" },
  // 未来：ja / ko / ...
}
```

## 🔒 隐私脱敏

落盘记录自由文本（任务正文/标题、CHANGELOG 条目）时默认脱敏敏感信息，`owner` 等结构化 frontmatter 字段不脱敏。

- **内置规则**：邮箱、手机号、身份证、IPv4、AWS/GitHub/OpenAI/Slack 密钥、JWT、含端口内网 URL
- **关闭开关**（默认开启，优先级从高到低）：
  - CLI 参数 `--no-redact`
  - 环境变量 `FX_REDACT=0`
  - 配置文件 `redact.enabled: false`
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
