import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// 站点更新日志镜像：把根 CHANGELOG.md 全量历史同步进 docs/changelog.md。
// 幂等纯字符串转换，发版润色 CHANGELOG 后执行一次即可；本文件不入 npm 包（files 白名单不含 scripts）
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8").replace(/^\uFEFF/, "")

// 首行必须是 H1 标题：剥离规则失效时镜像页会把标题带进去，故直接失败而非静默产出错页
const titleLine = changelog.split(/\r?\n/, 1)[0] ?? ""
if (!/^#\s+\S/.test(titleLine)) {
  console.error(`⚠️ CHANGELOG.md 首行不是 H1 标题，无法安全剥离：${JSON.stringify(titleLine)}`)
  process.exit(1)
}

// 丢弃源文件标题行（# 方弦工具集），保留首个版本块起的全部历史
const body = changelog.replace(/^#\s+[^\n]*\n+/, "").trimEnd() + "\n"

// 版本块存在性校验：镜像页至少含一个「## x.y.z」版本块，否则说明 CHANGELOG 结构异常
if (!/^##\s+\d+\.\d+\.\d+/.test(body)) {
  console.error("⚠️ CHANGELOG.md 未发现「## x.y.z」版本块，镜像已中止")
  process.exit(1)
}

const page =
  "---\n" +
  "outline: false\n" +
  "---\n\n" +
  "# 更新日志\n\n" +
  "> 完整变更历史以随包发布的 CHANGELOG.md 为准，本页由 `pnpm sync:changelog-doc` 从根 CHANGELOG.md 自动同步，请勿手改。\n\n" +
  body

writeFileSync(join(root, "docs", "changelog.md"), page)
