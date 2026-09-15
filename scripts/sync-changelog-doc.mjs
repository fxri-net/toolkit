import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// 站点更新日志镜像：把根 CHANGELOG.md 全量历史同步进 docs/changelog.md。
// 幂等纯字符串转换，发版润色 CHANGELOG 后执行一次即可；本文件不入 npm 包（files 白名单不含 scripts）
const root = dirname(dirname(fileURLToPath(import.meta.url)))

// 镜像页固定页头：三行 frontmatter + H1 + 来源说明，正文全部由根 CHANGELOG.md 派生
const PAGE_HEADER =
  "---\n" +
  "outline: false\n" +
  "---\n\n" +
  "# 更新日志\n\n" +
  "> 完整变更历史以随包发布的 CHANGELOG.md 为准，本页由 `pnpm sync:changelog-doc` 从根 CHANGELOG.md 自动同步，请勿手改。\n\n"

/**
 * 由根 CHANGELOG.md 原文构造镜像页内容。
 * @param {string} changelog 根 CHANGELOG.md 原文
 * @return {string} 镜像页完整内容
 */
export function buildPage(changelog) {
  // 换行先归一为 LF：Windows 检出（core.autocrlf）下源文件为 CRLF，不归一会让首行剥离与版本块校验双双失效
  const text = changelog.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")

  // 首行必须是 H1 标题：剥离规则失效时镜像页会把标题带进去，故直接失败而非静默产出错页
  const titleLine = text.split("\n", 1)[0] ?? ""
  if (!/^#\s+\S/.test(titleLine)) {
    throw new Error(`⚠️ CHANGELOG.md 首行不是 H1 标题，无法安全剥离：${JSON.stringify(titleLine)}`)
  }

  // 丢弃源文件标题行（# 方弦工具集），保留首个版本块起的全部历史
  const body = text.replace(/^#\s+[^\n]*\n+/, "").trimEnd() + "\n"

  // 版本块存在性校验：镜像页至少含一个「## x.y.z」版本块，否则说明 CHANGELOG 结构异常
  if (!/^##\s+\d+\.\d+\.\d+/.test(body)) {
    throw new Error("⚠️ CHANGELOG.md 未发现「## x.y.z」版本块，镜像已中止")
  }

  return PAGE_HEADER + body
}

// 仅直接执行时落盘；被测试导入时不产生副作用
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    writeFileSync(join(root, "docs", "changelog.md"), buildPage(readFileSync(join(root, "CHANGELOG.md"), "utf8")))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
