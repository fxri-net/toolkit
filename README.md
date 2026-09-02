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

## 📚 库 API

```typescript
import {
  listTasks, printTasks, archiveTasks, parseFrontmatter,
  languages, DEFAULT_LANG, localDate, formatChangelogs,
} from "@fxri/toolkit"

// 任务管理
const tasks = listTasks(".tasks")
printTasks(".tasks")
const result = archiveTasks(".tasks")

// CHANGELOG 格式化（默认中文）
formatChangelogs(".", localDate(), languages[DEFAULT_LANG])
formatChangelogs(".", localDate(), languages.en)
```

### 语言扩展

新增语言只需在 `languages` 里追加一个映射项：

```typescript
export const languages = {
  zh: { replacements: { "### Major Changes": "### 🚨 重大变更", ... }, deps: "- 更新依赖" },
  en: { replacements: {}, deps: "- Updated dependencies" },
  // 未来：ja / ko / ...
}
```

## ⚙️ 环境要求

- Node.js >= 20

## 📄 版权信息

作者：唐启云 <tqy@fxri.net>

版权：Copyright © 2026 方弦研究所. All rights reserved.

网站：[方弦研究信息网](https://fxri.net:444/)

协议：[MIT License](./LICENSE)

商标："方弦™"为第 42 类商标（注册号 89648411），本开源许可不授予商标使用权，详见 [TRADEMARK.md](./TRADEMARK.md)
