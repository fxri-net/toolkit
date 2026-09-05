import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// 站点更新日志镜像：把根 CHANGELOG.md 全量历史同步进 docs/changelog.md。
// 幂等纯字符串转换，发版润色 CHANGELOG 后执行一次即可；本文件不入 npm 包（files 白名单不含 scripts）
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8").replace(/^\uFEFF/, "")

// 丢弃源文件标题行（# @fxri/toolkit），保留首个版本块起的全部历史
const body = changelog.replace(/^#\s+[^\n]*\n+/, "").trimEnd() + "\n"

const page =
  "---\n" +
  "outline: false\n" +
  "---\n\n" +
  "# 更新日志\n\n" +
  "> 完整变更历史以随包发布的 CHANGELOG.md 为准，本页由 `pnpm sync:changelog-doc` 从根 CHANGELOG.md 自动同步，请勿手改。\n\n" +
  body

writeFileSync(join(root, "docs", "changelog.md"), page)
