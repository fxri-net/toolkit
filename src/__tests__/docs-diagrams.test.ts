// 一图看懂页的机检：图示链接可解析、能力全景覆盖全部命令域
// 现有 docs-consistency 只扫 markdown 渲染出的 href，看不到组件内部链接，故单列本用例
import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join, normalize } from "node:path"
import { createMarkdownRenderer } from "vitepress"
import { COMMAND_REGISTRY } from "../command-registry"
import { JOURNEY_LINKS, MODEL_LINKS, PIPELINE_LAYERS } from "../../docs/.vitepress/theme/components/diagrams/links"

// 图示节点合集：三层结构 + 任务旅程 + 五件套
const DIAGRAM_LINKS = [...PIPELINE_LAYERS.flatMap((layer) => layer.nodes), ...JOURNEY_LINKS, ...MODEL_LINKS]

// 站内路径转文档文件：/cli/task → docs/cli/task.md；无扩展名时优先 .md，再退目录 index.md
function resolveDocFile(target: string): string | null {
  const base = normalize(join("docs", target.replace(/^\/+/, ""))).replace(/\\/g, "/")
  for (const candidate of [`${base}.md`, `${base}/index.md`]) {
    if (existsSync(join(process.cwd(), candidate))) return candidate
  }
  return null
}

describe("一图看懂页：图示与能力全景", () => {
  it("图内每个跳转都指向存在的文档页，带锚点时锚点存在", async () => {
    const md = await createMarkdownRenderer(join(process.cwd(), "docs"))
    const problems: string[] = []
    for (const link of DIAGRAM_LINKS) {
      const [rawTarget, anchor] = link.to.split("#")
      const file = resolveDocFile(rawTarget as string)
      if (!file) {
        problems.push(`${link.label} 指向的页面 ${rawTarget} 不存在`)
        continue
      }
      if (!anchor) continue
      const html = md.render(readFileSync(join(process.cwd(), file), "utf8"))
      const ids = new Set([...html.matchAll(/<h[1-6][^>]*id="([^"]*)"/g)].map((m) => m[1] as string))
      if (!ids.has(anchor)) problems.push(`${link.label} 的锚点 #${anchor} 在 ${file} 中不存在`)
    }
    expect(problems).toEqual([])
  })

  it("能力全景表覆盖命令注册表的全部顶层域（新增命令漏登记即失败）", () => {
    const page = readFileSync(join(process.cwd(), "docs/overview.md"), "utf8")
    const listed = new Set([...page.matchAll(/^\| `toolkit ([a-z-]+)`/gm)].map((m) => m[1] as string))
    const domains = COMMAND_REGISTRY.filter(
      (entry) => entry.stage === "current" && !entry.deprecatesTo && !entry.path.includes(" ") && entry.path !== "help",
    ).map((entry) => entry.path)
    expect([...listed].sort()).toEqual([...domains].sort())
  })
})
