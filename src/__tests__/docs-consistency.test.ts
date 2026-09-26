// 文档一致性：代码内的能力清单/结构须与 docs 列举严格一致，防文档漂移
import { describe, it, expect } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import { createMarkdownRenderer } from "vitepress"
import { listBuiltinRuleNames } from "../privacy/redact"
import { DESCRIPTION } from "../about"
import { buildPage } from "../../scripts/sync-changelog-doc.mjs"

// 提取文档「内置规则：」行的规则名（名称以反引号包裹，括号内为补充说明）
function docRuleNames(file: string): string[] {
  const line = readFileSync(join(process.cwd(), file), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("内置规则："))
  expect(line, `${file} 缺少「内置规则：」清单行`).toBeTruthy()
  return [...(line as string).matchAll(/`([^`]+)`/g)].map((m) => m[1] as string)
}

describe("文档一致性：脱敏内置规则清单", () => {
  it("docs/config.md 列举的规则集合与代码内置规则一致", () => {
    expect(docRuleNames("docs/config.md").sort()).toEqual([...listBuiltinRuleNames()].sort())
  })

  it("docs/guide.md 列举的规则集合与代码内置规则一致", () => {
    expect(docRuleNames("docs/guide.md").sort()).toEqual([...listBuiltinRuleNames()].sort())
  })
})

// 读取文档并归一换行：Windows 检出（core.autocrlf）会把文本文件转为 CRLF，直接逐字节比对会误判为未同步
function readDoc(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
}

// 站点更新日志镜像页的期望内容：直接调用镜像脚本的转换函数，不在测试内复刻同一份逻辑
// （复刻会让脚本缺陷被同样的错误实现掩盖，CRLF 误报即由此漏过）
describe("文档一致性：更新日志镜像", () => {
  it("docs/changelog.md 与根 CHANGELOG.md 同步（漏跑同步脚本或手改镜像页即失败）", () => {
    expect(readDoc("docs/changelog.md")).toBe(buildPage(readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8")))
  })
})

// 递归收集目录下的 md 文件，返回以仓库根为基准的 posix 路径（锚点比对需要稳定的键）
function collectMarkdown(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) collectMarkdown(rel, found)
    else if (entry.name.endsWith(".md")) found.push(rel)
  }
  return found
}

// 站内链接目标归一：VitePress 允许省略 .md、或写目录（视作 index.md），按三种写法在受检页集合内回退匹配
function resolvePage(page: string, anchorsOf: Map<string, Set<string>>): string | null {
  for (const candidate of [page, `${page}.md`, `${page}/index.md`]) {
    const norm = normalize(candidate).replace(/\\/g, "/")
    if (anchorsOf.has(norm)) return norm
  }
  return null
}

describe("文档一致性：站内链接目标与锚点可解析", () => {
  it("README / docs / skills 里的链接目标页都存在、#锚点都能在目标页标题中找到（路径打错、页面被删或锚点写错即失败）", async () => {
    const docsDir = join(process.cwd(), "docs")
    // 用 VitePress 自身的 markdown 渲染器产锚点：与站点实际 slugify 规则同源，不复刻规则
    const md = await createMarkdownRenderer(docsDir)
    // 受检范围：仓库根 md（README 等入口页指向 docs 的外链锚点）、docs 全量、skills 全量
    const files = [
      ...readdirSync(process.cwd()).filter((f) => f.endsWith(".md")),
      ...collectMarkdown("docs", []),
      ...collectMarkdown("skills", []),
    ]
    const anchorsOf = new Map<string, Set<string>>()
    const htmlOf = new Map<string, string>()
    for (const file of files) {
      const html = md.render(readFileSync(join(process.cwd(), file), "utf8"))
      htmlOf.set(file, html)
      anchorsOf.set(file, new Set([...html.matchAll(/<h[1-6][^>]*\sid="([^"]*)"/g)].map((m) => m[1] as string)))
    }
    const problems: string[] = []
    for (const file of files) {
      for (const matched of (htmlOf.get(file) as string).matchAll(/href="([^"]*)"/g)) {
        // markdown-it 会把链接里的非 ASCII 百分号编码，先还原再比对
        let href = ""
        try {
          href = decodeURIComponent(matched[1] as string)
        } catch {
          continue
        }
        // 跳过外链（含协议或协议相对）
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) continue
        const [rawTarget, anchor] = href.split("#")
        // 渲染器把站内链接统一改写为 .html（原 .md 与无扩展名资源皆然），去掉查询串后剥离 .html 还原原写法
        const target = (rawTarget as string).split("?")[0] as string
        const cleanTarget = target.replace(/\.html$/i, "")
        // 纯锚点链接的目标页即当前页；相对链接按所在文件目录解析（README 写 ./docs/x.md、docs 内写 ./x.md、
        // skills 子目录同理）；以 / 开头的站内绝对链接按站点根解析——本站 srcDir 即 docs/，故落到 docs/ 下
        const toRepoPath = (p: string) => normalize(p.startsWith("/") ? join("docs", p.slice(1)) : join(dirname(file), p)).replace(/\\/g, "/")
        const page = cleanTarget === "" ? file : toRepoPath(cleanTarget)
        const resolved = resolvePage(page, anchorsOf)
        if (!resolved) {
          // 非 md 资源（LICENSE / 图片等）随磁盘存在性放行；真正断链（路径打错或页面被删）即失败
          if (existsSync(join(process.cwd(), page)) || existsSync(join(process.cwd(), `${page}.html`))) continue
          problems.push(`${file}：链接「${href}」指向的页面 ${page} 不存在`)
          continue
        }
        if (anchor && !anchorsOf.get(resolved)!.has(anchor)) {
          problems.push(`${file}：链接「${href}」的锚点在 ${resolved} 中不存在`)
        }
      }
      // 资源引用（markdown 图片与原始 HTML <img src>）不在 VitePress 死链检查范围，按磁盘存在性校验；
      // 外链与 data: 内联资源由协议正则一并跳过
      for (const matched of (htmlOf.get(file) as string).matchAll(/src="([^"]*)"/g)) {
        let src = ""
        try {
          src = decodeURIComponent(matched[1] as string)
        } catch {
          continue
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")) continue
        const cleanSrc = (src.split("#")[0] as string).split("?")[0] as string
        if (cleanSrc === "") continue
        // 以 / 开头的资源按站点根解析（docs/ 下），其余按所在文件目录解析
        const resolved = cleanSrc.startsWith("/") ? join("docs", cleanSrc.slice(1)) : join(dirname(file), cleanSrc)
        if (!existsSync(join(process.cwd(), resolved))) {
          problems.push(`${file}：资源引用「${src}」指向的文件 ${normalize(resolved).replace(/\\/g, "/")} 不存在`)
        }
      }
    }
    expect(problems).toEqual([])
  })
})

// 站点导航/侧边栏链接不在 VitePress 死链检查范围内（实测改坏 nav 后 build 仍成功），
// 故从配置里提取引号包裹的站内 link，落到 docs/ 下做存在性校验
describe("文档一致性：站点导航与侧边栏链接目标存在", () => {
  it("docs/.vitepress/config.mts 的 nav / sidebar 站内链接都指向存在的文档页（路径打错或页面被删即失败）", () => {
    // 只取引号包裹的 '/...' 写法：天然排除 socialLinks 的变量写法与 editLink.pattern 的 :path 模板
    const pages = new Map<string, Set<string>>(collectMarkdown("docs", []).map((p) => [p, new Set<string>()]))
    const problems: string[] = []
    for (const matched of readDoc("docs/.vitepress/config.mts").matchAll(/link:\s*'(\/[^']*)'/g)) {
      const href = matched[1] as string
      const clean = (href.split("#")[0] as string).replace(/^\/+/, "")
      // 站点根链接（'/'）视作首页 docs/index.md
      const page = normalize(join("docs", clean === "" ? "index.md" : clean)).replace(/\\/g, "/")
      if (!resolvePage(page, pages)) {
        problems.push(`docs/.vitepress/config.mts：导航链接「${href}」指向的页面 ${page} 不存在`)
      }
    }
    expect(problems).toEqual([])
  })
})

// 站点静态资源引用同样不在 VitePress 检查范围内（实测移除 docs/public/logo.png 后 build 仍成功）：
// themeConfig.logo 与 head 的 favicon / og:image 指向 docs/public/ 下的文件，缺失时构建全绿、图标静默失效
describe("文档一致性：站点配置引用的静态资源存在", () => {
  it("config.mts 的 logo / favicon / og:image 都指向 docs/public 下存在的文件（改名或删除即失败）", () => {
    const config = readDoc("docs/.vitepress/config.mts")
    // 三种写法分别取值：logo 为引号路径；favicon / og:image 为 `${base}` / `${siteUrl}` 模板前缀 + 文件名
    const refs = [
      /logo:\s*'\/([^']+)'/.exec(config)?.[1],
      /rel:\s*'icon',\s*href:\s*`\$\{base\}([^`]+)`/.exec(config)?.[1],
      /property:\s*'og:image',\s*content:\s*`\$\{siteUrl\}([^`]+)`/.exec(config)?.[1],
    ]
    expect(refs.every(Boolean), "config.mts 未取到 logo / favicon / og:image 三处引用").toBe(true)
    for (const ref of refs) {
      const target = join("docs", "public", ref as string)
      expect(existsSync(join(process.cwd(), target)), `config.mts 引用的静态资源 ${target} 不存在`).toBe(true)
    }
  })
})

// 提交信息规则在两处并存：.trae/rules/git-commit-message.md（本仓库自用真源）与 docs/commit-rules.md
// 的可复制围栏块（用户侧投影）。两者正文须逐字一致（规范 C-16），此前无任何检测入口
describe("文档一致性：提交信息规则两处真源镜像", () => {
  it("docs/commit-rules.md 围栏块正文与 .trae/rules/git-commit-message.md 逐字一致（只改一处即失败）", () => {
    const fenced = /^````markdown\n([\s\S]*?)^````/m.exec(readDoc("docs/commit-rules.md"))?.[1]
    expect(fenced, "docs/commit-rules.md 缺少 ````markdown 规则全文围栏块").toBeTruthy()
    // 围栏块首行是只存在于用户侧投影的更新时间锚点（C-15），比对时剔除；
    // 先断言其存在再剥离——锚点缺失时该正则静默不匹配，比对照样通过
    expect(fenced as string, "docs/commit-rules.md 围栏块首行缺少规则更新时间锚点").toMatch(/^> 规则更新时间 [^\n]*\n/)
    const projection = (fenced as string).replace(/^> 规则更新时间 [^\n]*\n/, "").trim()
    // 真源文件的 frontmatter 是 agent 规则元数据，不进用户侧投影，比对时剔除
    const source = readDoc(".trae/rules/git-commit-message.md").replace(/^---\n[\s\S]*?\n---\n/, "").trim()
    expect(projection).toBe(source)
  })
})

// 规则层三处更新锚点（C-15）此前无任何检测入口：锚点行是用户侧规则快照的自查依据，
// 整行被删或格式走样都会让快照失同步无从识别
describe("文档一致性：规则层更新锚点", () => {
  // 两个规则页的锚点位于 4 反引号 markdown 规则全文围栏块的首行
  const fenceAnchor = (file: string) => {
    const fenced = /^````markdown\n([^\n]*)/m.exec(readDoc(file))
    expect(fenced, `${file} 缺少 4 反引号 markdown 规则全文围栏块`).toBeTruthy()
    return fenced?.[1] as string
  }

  it("docs/commit-rules.md 与 docs/ai-rules.md 的规则全文首行为合法更新时间锚点", () => {
    for (const file of ["docs/commit-rules.md", "docs/ai-rules.md"]) {
      expect(fenceAnchor(file), `${file} 的规则全文首行不是合法更新时间锚点`).toMatch(/^> 规则更新时间 \d{4}-\d{2}-\d{2} \d{2}:\d{2}。/)
    }
  })

  it("SPEC.md 正文首行为合法规范更新时间锚点", () => {
    // 无围栏包裹，整篇即快照：标题行之后的首个非空行即锚点
    const body = readDoc("SPEC.md")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"))
    expect(body[0], "SPEC.md 正文首行不是合法规范更新时间锚点").toMatch(/^> 规范更新时间 \d{4}-\d{2}-\d{2} \d{2}:\d{2}。/)
  })
})

// 根描述多处以手写形式出现，易随改动漂移：源码侧统一引用 src/about.ts 的 DESCRIPTION，
// 无法 import 的触达面（package.json / README / 首页 tagline）在此锁死，改一处漏改其余即失败
describe("文档一致性：根描述文案单一真源", () => {
  // 首页 tagline 在前半句后自行展开，故只锁各触达面共用的主句前缀（从 DESCRIPTION 取「：」之前）
  const sharedPrefix = DESCRIPTION.split("：")[0] as string

  it("package.json 的 description 与 DESCRIPTION 字面一致", () => {
    const pkg = JSON.parse(readDoc("package.json")) as { description?: string }
    expect(pkg.description).toBe(DESCRIPTION)
  })

  it("README 首段描述与 DESCRIPTION 一致（剔除加粗标记后比对）", () => {
    // README 用加粗强调描述中的协作定位，比对前去掉 ** 标记，其余须与真源逐字一致
    const lines = readDoc("README.md")
      .split("\n")
      .map((l) => l.replace(/\*\*/g, ""))
    expect(lines).toContain(DESCRIPTION)
  })

  it("docs/index.md 的 tagline 以 DESCRIPTION 主句开头", () => {
    const tagline = /^ {2}tagline: (.*)$/m.exec(readDoc("docs/index.md"))?.[1]
    expect(tagline?.startsWith(sharedPrefix)).toBe(true)
  })
})
