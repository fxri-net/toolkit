// 文档站产物校验：标准来源 playbook fxri-docs-profile 0.1.3
// 规则：404 页不进站点地图、不进站内搜索索引；在 docs:build 之后执行，只读 dist 产物，不改文件
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, "docs", ".vitepress", "dist")
const problems = []

if (!existsSync(dist)) {
  // 产物不存在时无从断言，交由调用方确认是否漏跑 docs:build
  console.error(`文档站产物校验跳过：未找到 ${relative(root, dist)}（需先执行 docs:build）`)
  process.exit(0)
}

const sitemapFile = join(dist, "sitemap.xml")
if (!existsSync(sitemapFile)) {
  problems.push("缺少 sitemap.xml 产物")
} else {
  // 兼容 cleanUrls 与默认 .html 两种写法：URL 可能是绝对地址、带前导斜杠或裸路径
  const hits = [...readFileSync(sitemapFile, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((matched) => matched[1].replace(/^https?:\/\/[^/]+/, ""))
    .filter((url) => /(^|\/)404(\.html)?$/.test(url))
  if (hits.length > 0) problems.push(`sitemap.xml 含 404 页：${hits.join("、")}`)
}

// 本地搜索索引按页分块，文件名形如 @localSearchIndexroot.<hash>.js
// 404 页标题从源文件读取：页面改名后断言跟随，避免硬编码标题导致检查空转
const notFoundSource = join(root, "docs", "404.md")
const notFoundTitle = !existsSync(notFoundSource)
  ? ""
  : (/^#\s+(.+)$/m.exec(readFileSync(notFoundSource, "utf8").replace(/\r\n/g, "\n"))?.[1] ?? "").trim()
const chunksDir = join(dist, "assets", "chunks")
const indexFiles = existsSync(chunksDir) ? readdirSync(chunksDir).filter((name) => name.includes("localSearchIndex")) : []
if (!notFoundTitle) {
  problems.push("docs/404.md 缺失或没有一级标题，无法断言搜索索引")
} else if (indexFiles.length === 0) {
  // 未启用本地搜索时该断言不适用，只提示不阻断
  console.warn("[docs] 未找到站内搜索索引分块，跳过 404 索引断言")
} else {
  for (const name of indexFiles) {
    if (readFileSync(join(chunksDir, name), "utf8").includes(notFoundTitle)) {
      problems.push(`搜索索引 ${name} 含 404 页内容（${notFoundTitle}）`)
    }
  }
}

if (problems.length > 0) {
  console.error(`文档站产物校验失败：${problems.length} 项`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`文档站产物校验通过：sitemap 不含 404、搜索索引不含 404 页`)
