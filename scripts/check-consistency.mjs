// 仓库自检：技能版本四点一致、技能表用途列不残留旧术语、SKILL 引用的 references 存在、active 任务登记的触达路径真实存在
// 只服务本仓库（不属产品能力）：用 node 直跑，由 scripts/verify.mjs 统一挂载
// 另提供 --diff [base]：归档前比对「登记了触达却没改 / 改了触达面却没登记」，仅告警不阻断
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const errors = []
const warns = []

// --diff [base]：默认基线 HEAD；不传该参数则跳过比对（verify 在归档后执行，此时 active 已空，跑了也是空转）
const diffIndex = process.argv.indexOf("--diff")
const diffNext = process.argv[diffIndex + 1]
const diffBase = diffIndex < 0 ? null : diffNext && !diffNext.startsWith("-") ? diffNext : "HEAD"

// 触达面：文档与技能都会被使用者读到，改动后须在任务「影响范围」登记
const TOUCH_PREFIXES = ["docs/", "skills/"]
const TOUCH_FILES = new Set(["README.md"])

// 读文本并归一换行：Windows 检出会把文本转为 CRLF，逐字节比对会误判
function read(rel) {
  return readFileSync(join(root, rel), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
}

// 技能目录名集合（含 SKILL.md 的目录）
const skillsDir = join(root, "skills")
const skillNames = readdirSync(skillsDir)
  .filter((name) => existsSync(join(skillsDir, name, "SKILL.md")))
  .sort()

// 小工具：取 frontmatter 缩进键
function frontmatterValue(text, key) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!frontmatter) return ""
  const matched = new RegExp(`^[ \\t]+${key}:[ \\t]*"?([^"\\n]+?)"?[ \\t]*$`, "m").exec(frontmatter[1])
  return matched?.[1]?.trim() ?? ""
}

// 技能真源：版本双写位与层级
const skillMeta = new Map()
for (const name of skillNames) {
  const text = read(`skills/${name}/SKILL.md`)
  const version = frontmatterValue(text, "version")
  const body = /^> 本技能版本 ([^\s（(]+)/m.exec(text)?.[1] ?? ""
  const tier = frontmatterValue(text, "tier")
  skillMeta.set(name, { version, tier, text })
  if (version !== body) {
    errors.push(`skills/${name}/SKILL.md 版本双写位不一致：frontmatter ${version || "无"} / 正文 ${body || "无"}`)
  }
  if (!version) errors.push(`skills/${name}/SKILL.md 未声明 metadata.version`)
}

// 解析技能表：表头以「技能」开头，跳过隔离行，读到非表格行为止
function skillTableRows(file) {
  const lines = read(file).split("\n")
  const rows = []
  let state = "seek"
  for (const line of lines) {
    if (state === "seek") {
      if (/^\|\s*技能\s*\|/.test(line)) state = "split"
      continue
    }
    if (state === "split") {
      state = "rows"
      continue
    }
    if (!line.startsWith("|")) break
    rows.push(line.split("|").slice(1, -1).map((cell) => cell.trim()))
  }
  return rows
}

// 两张技能表：名称集合、版本、层级、用途列行内代码必须与真源一致
const tableFiles = ["skills/README.md", "docs/guide.md"]
for (const file of tableFiles) {
  const rows = skillTableRows(file)
  if (rows.length === 0) {
    errors.push(`${file} 未找到技能表`)
    continue
  }
  const listed = new Set()
  for (const cells of rows) {
    const cellName = cells[0] ?? ""
    const name = /(fxri-[a-z0-9-]+)/.exec(cellName)?.[1] ?? ""
    if (!name) continue
    listed.add(name)
    const meta = skillMeta.get(name)
    if (!meta) {
      errors.push(`${file} 列出的 ${name} 在 skills/ 下不存在`)
      continue
    }
    const version = cells[1] ?? ""
    if (version !== meta.version) errors.push(`${file} 的 ${name} 版本 ${version} ≠ frontmatter ${meta.version}`)
    const tier = cells[3] ?? ""
    if (tier && meta.tier && tier !== meta.tier) errors.push(`${file} 的 ${name} 层级 ${tier} ≠ frontmatter ${meta.tier}`)
    // 用途列的行内代码片段必须仍存在于对应 SKILL：旧标签、已删参数名就藏在这里
    const usage = cells[2] ?? ""
    for (const match of usage.matchAll(/`([^`]+)`/g)) {
      const snippet = match[1]
      if (!meta.text.includes(snippet)) errors.push(`${file} 的 ${name} 用途列引用 \`${snippet}\`，该片段在 SKILL.md 中不存在`)
    }
  }
  for (const name of skillNames) {
    if (!listed.has(name)) errors.push(`${file} 缺少技能 ${name} 的行`)
  }
}

// 技能内 references 引用：SKILL.md 与 references 里指向 `references/xxx.md` 的写法必须可解析，
// 防止拆档、改名后引用悬空；用户项目文件名（index.md / common.md 等）与兄弟技能的裸文件名不在检查面内
function skillMarkdowns(dir) {
  const files = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) files.push(...skillMarkdowns(rel))
    else if (entry.name.endsWith(".md")) files.push(rel)
  }
  return files
}

// 提取 .md 引用：内联代码与相对链接两种写法
function markdownRefs(text) {
  const refs = new Set()
  for (const matched of text.matchAll(/`([^`\n]+?\.md)`/g)) refs.add(matched[1])
  for (const matched of text.matchAll(/\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/g)) refs.add(matched[1])
  return refs
}

for (const name of skillNames) {
  const skillRoot = `skills/${name}`
  for (const file of skillMarkdowns(skillRoot)) {
    const fileDir = file.slice(0, file.lastIndexOf("/"))
    for (const ref of markdownRefs(read(file))) {
      const base = ref.split("#")[0]
      // 只看 references 目录：外链、占位符、用户项目文件与兄弟技能裸名均不参与解析
      if (!/(^|\/)references\//.test(base) || /^[a-z]+:\/\//i.test(base) || base.includes("<")) continue
      // 依次按「引用所在文件目录」「skills/ 根（兄弟技能路径）」「技能根」解析
      const candidates = [join(fileDir, base), join("skills", base), join(skillRoot, base)]
      if (!candidates.some((candidate) => existsSync(join(root, candidate)))) {
        errors.push(`${file} 引用的 ${ref} 不存在`)
      }
    }
  }
}

// 站点导航锚点：site-nav.json 不在 docs-consistency 的 markdown 链接校验面内，锚点写错或标题改名会让深链静默失效
const NAV_FILE = "docs/site-nav.json"

// 归一口径：去空白、去标点与符号、转小写。只抓「锚点写错 / 标题被改名」，不复刻 VitePress 的 slugify 细节
function normalizeHeading(text) {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "")
}

// 站内路径 → 页面文件：/ 映射 docs/index.md，/cli 兼容 docs/cli.md 与 docs/cli/index.md
function resolveDocPage(pathname) {
  const trimmed = pathname.replace(/\/+$/, "")
  const candidates = trimmed === "" ? ["docs/index.md"] : [`docs${trimmed}.md`, `docs${trimmed}/index.md`]
  return candidates.find((candidate) => existsSync(join(root, candidate)))
}

// 取文件里的真实标题：跳过 fenced code block，避免把代码注释里的 # 当成标题
function headingTexts(file) {
  const headings = []
  let fenced = false
  for (const line of read(file).split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const matched = /^#{1,6}\s+(.+?)\s*#*$/.exec(line)
    if (matched) headings.push(matched[1])
  }
  return headings
}

if (existsSync(join(root, NAV_FILE))) {
  const nav = JSON.parse(read(NAV_FILE))
  const links = []
  // 通用遍历：nav / sidebar / locales.<语言> 三种形状都含 link 与 items 嵌套，逐层收集即可覆盖
  const collectLinks = (node) => {
    if (Array.isArray(node)) {
      node.forEach(collectLinks)
      return
    }
    if (!node || typeof node !== "object") return
    if (typeof node.link === "string") links.push(node.link)
    Object.values(node).forEach(collectLinks)
  }
  collectLinks(nav)
  for (const link of links) {
    const [pathname, anchor] = link.split("#")
    if (!anchor || !pathname.startsWith("/")) continue
    const page = resolveDocPage(pathname)
    if (!page) {
      errors.push(`${NAV_FILE} 的 ${link} 指向不存在的页面 ${pathname}`)
      continue
    }
    const headings = headingTexts(page)
    const target = normalizeHeading(anchor)
    // 判据取等值：包含关系会把近似标题当命中（如锚点「安装」放过「安装与环境」）
    const matched = headings.some((heading) => normalizeHeading(heading) === target)
    if (!matched) {
      errors.push(`${NAV_FILE} 的 ${link} 在 ${page} 中找不到对应标题（可用：${headings.slice(0, 12).join(" / ")}）`)
    }
  }
}

// active 任务「影响范围」里登记的触达路径（`- 文档触达：a、b`，可选）
function activeTaskFiles(dir) {
  if (!existsSync(dir)) return []
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...activeTaskFiles(full))
    else if (entry.name.endsWith(".md")) files.push(full)
  }
  return files
}

// 读取单个任务文件里的触达登记
function readTouches(file) {
  const paths = []
  for (const line of readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n")) {
    const matched = /^\s*-\s*文档触达：(.+)$/.exec(line)
    if (!matched) continue
    for (const item of matched[1].split(/[、,，]/)) {
      const rel = item.trim()
      if (rel) paths.push(rel)
    }
  }
  return paths
}

// 登记路径 → 登记它的任务文件（多人共用任务档时同一路径可能出现多次，只用于告警定位）
const touchesByPath = new Map()
for (const file of activeTaskFiles(join(root, ".tasks", "active"))) {
  const label = relative(root, file).split("\\").join("/")
  for (const rel of readTouches(file)) {
    if (!existsSync(join(root, rel))) {
      errors.push(`${label} 的文档触达指向不存在的路径：${rel}`)
      continue
    }
    const owners = touchesByPath.get(rel) ?? []
    owners.push(label)
    touchesByPath.set(rel, owners)
  }
}

// 改动比对：登记了触达却未改动 / 改动了触达面却没登记，均只告警
function changedPaths(base) {
  if (spawnSync("git", ["rev-parse", "--verify", "--quiet", base], { cwd: root, encoding: "utf8" }).status !== 0) return null
  const diff = spawnSync("git", ["diff", "--name-only", base], { cwd: root, encoding: "utf8" })
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  if (diff.status !== 0 || untracked.status !== 0) return null
  const paths = new Set()
  for (const raw of `${diff.stdout}\n${untracked.stdout}`.split("\n")) {
    const rel = raw.trim().split("\\").join("/")
    if (rel) paths.add(rel)
  }
  return paths
}

let diffRan = false
if (diffBase) {
  const changed = changedPaths(diffBase)
  if (changed === null) {
    console.log(`改动比对：跳过（基线 ${diffBase} 不存在或当前目录不是 git 仓库）`)
  } else {
    diffRan = true
    for (const [rel, owners] of touchesByPath) {
      if (!changed.has(rel)) warns.push(`登记了触达但本次未改动：${rel}（登记于 ${owners.join("、")}）`)
    }
    for (const rel of changed) {
      if (touchesByPath.has(rel)) continue
      if (TOUCH_FILES.has(rel) || TOUCH_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
        warns.push(`改动了触达面但未登记：${rel}（在对应任务的「影响范围」补一行 - 文档触达：…）`)
      }
    }
  }
}

// 规则模块体量棘轮：全局规则是用户手动复制的快照，细节应进 skills（AGENTS 质量门 5）。
// 上限取收敛后实测值约 1.1 倍；调高须在同一提交说明理由，否则棘轮会被随手抬高而失效
// env 上限 220：需容纳「pnpm / npm / bun / yarn 四种管理器写法」的半句说明（实测 198，取 1.1 倍）
// personal 额度按偏好条目增长预留（实测 60）：误用由「只收覆写项」判据拦截，不靠体量收紧
const RULE_BUDGETS = { "workflow.md": 770, "core.md": 580, "personal.md": 270, "env.md": 220, "usage.md": 595, "output.md": 170, "commit.md": 1040 }
for (const [file, budget] of Object.entries(RULE_BUDGETS)) {
  const rel = `templates/rules/${file}`
  // 假现场 / 裁剪仓库可能没有规则模块：缺失即跳过，不把 ENOENT 当违规抛出
  if (!existsSync(join(root, rel))) continue
  const size = read(rel).length
  if (size > budget) {
    errors.push(`${rel} 达 ${size} 字符，超过上限 ${budget}：把流程细节移回 skills，或说明理由后调整上限`)
  }
}

// 规则块内只放业务文本：解释性说明（模块归属、升级入口、读者定位）留在规则页围栏外，页面可见但不进上下文
// 扫描模块正文与规则页围栏块，均跳过首行的更新时间锚点——锚点随快照复制走，属业务参照物
// 「本文」需排除「文本文件 / 文档」等正常业务词，故用前瞻断言而非纯子串
const READER_PATTERNS = [
  { label: "本模块", re: /本模块/ },
  { label: "本页", re: /本页/ },
  { label: "本文", re: /本文(?![件档章])/ },
  { label: "文档站", re: /文档站/ },
  { label: "重新复制", re: /重新复制/ },
  { label: "目标读者", re: /目标读者/ },
  { label: "可裁剪", re: /可裁剪/ },
  { label: "按需增删", re: /按需增删/ },
]
const ruleTexts = []
const rulesDir = join(root, "templates", "rules")
if (existsSync(rulesDir)) {
  for (const name of readdirSync(rulesDir)) {
    if (name.endsWith(".md")) ruleTexts.push({ rel: `templates/rules/${name}`, text: read(`templates/rules/${name}`) })
  }
}
const docsRulesDir = join(root, "docs", "rules")
if (existsSync(docsRulesDir)) {
  for (const name of readdirSync(docsRulesDir)) {
    if (!name.endsWith(".md")) continue
    const rel = `docs/rules/${name}`
    const fenced = /^````markdown\n([\s\S]*?)^````/m.exec(read(rel))
    if (fenced) ruleTexts.push({ rel, text: fenced[1] })
  }
}
for (const { rel, text } of ruleTexts) {
  const body = text.split("\n").slice(1).join("\n")
  for (const { label, re } of READER_PATTERNS) {
    if (re.test(body)) errors.push(`${rel} 的可复制正文出现读者向措辞「${label}」：移到规则页围栏外并保持页面可见`)
  }
}

// CLI 入口矩阵、术语表与退出码总览：docs/cli.md 是新增命令的默认口径，缺块即视为文档与实现开始漂移
// 假现场（只含技能表的最小仓库）没有 docs/cli.md：跳过，不把缺失当违规
if (existsSync(join(root, "docs", "cli.md"))) {
  const cliDoc = read("docs/cli.md")
  const entrySection = /## 裸命令入口\n([\s\S]*?)\n## /.exec(cliDoc)?.[1] ?? ""
  if (!entrySection) errors.push("docs/cli.md 缺少「裸命令入口」小节：入口行为须与实现逐域核对")
  for (const domain of ["task", "skill", "rule", "config", "convention", "docs", "scope", "usage"]) {
    if (entrySection && !entrySection.includes(`\`toolkit ${domain}\``)) {
      errors.push(`docs/cli.md 的裸命令入口缺少 \`toolkit ${domain}\``)
    }
  }
  const termsSection = /## 术语表\n([\s\S]*?)\n## /.exec(cliDoc)?.[1] ?? ""
  if (!termsSection) errors.push("docs/cli.md 缺少「术语表」小节：层 / 面 / 名单 / 预演等术语须有单一出处")
  for (const term of ["层", "面", "名单", "预演", "确认", "来源", "目标", "范围"]) {
    if (termsSection && !termsSection.includes(`| ${term} |`)) errors.push(`docs/cli.md 术语表缺少「${term}」`)
  }
  // 退出码数值表以 docs/cli/exit-codes.md 为单一真源：cli.md 只引用，不重复维护表格
  if (!cliDoc.includes("./cli/exit-codes")) errors.push("docs/cli.md 未引用退出码单一真源（./cli/exit-codes）")
  const exitDocPath = join(root, "docs", "cli", "exit-codes.md")
  if (existsSync(exitDocPath)) {
    const exitDoc = read("docs/cli/exit-codes.md")
    if (!exitDoc.includes("<!-- toolkit:exit-codes:start -->") || !exitDoc.includes("<!-- toolkit:exit-codes:end -->")) {
      errors.push("docs/cli/exit-codes.md 缺少生成标记：数值表须由 src/exit-codes.ts 生成")
    }
  } else {
    errors.push("缺少 docs/cli/exit-codes.md：退出码必须有单一真源页")
  }
}

// 页面命名：声明了 frontmatter title 的页面须与首个 H1 逐字一致；配置分页索引文案须等于目标页标题
// 只比对原文，不模拟 VitePress 的标题推导（未声明 title 的页面以 H1 为准，不强制补 frontmatter）
function docPages(dir) {
  const files = []
  const skip = new Set(["node_modules", "cache", "public", ".vitepress"])
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) files.push(...docPages(rel))
    else if (entry.name.endsWith(".md")) files.push(rel)
  }
  return files
}

// 首个一级标题：跳过 frontmatter 与 fenced 代码块，剥掉行内 HTML 锚点
function firstH1(file) {
  const lines = read(file).split("\n")
  // frontmatter 里允许以 # 开头的注释行（如首页说明），不参与标题识别
  let start = 0
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1)
    if (end > 0) start = end + 1
  }
  let fenced = false
  for (const line of lines.slice(start)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const matched = /^#\s+(.+?)\s*#*$/.exec(line)
    if (matched) return matched[1].replace(/<[^>]+>/g, "").trim()
  }
  return ""
}

// 页面顶层 frontmatter 文本值：与技能 metadata 的缩进键不同，页面用顶层键
function pageFrontmatterValue(text, key) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!frontmatter) return ""
  const matched = new RegExp(`^${key}:[ \\t]*"?([^"\\n]+?)"?[ \\t]*$`, "m").exec(frontmatter[1])
  return matched?.[1]?.trim() ?? ""
}

// 页面标题：已声明 title 取 frontmatter，否则取首个 H1
function pageTitle(file) {
  return pageFrontmatterValue(read(file), "title") || firstH1(file)
}

if (existsSync(join(root, "docs"))) {
  for (const file of docPages("docs")) {
    const text = read(file)
    const declared = pageFrontmatterValue(text, "title")
    if (!declared) continue
    // 首页用 layout: home，没有正文 H1，title 由 frontmatter 单独承载
    if (pageFrontmatterValue(text, "layout") === "home") continue
    const h1 = firstH1(file)
    if (!h1) errors.push(`${file} 声明了 frontmatter title 但缺少一级标题`)
    else if (declared !== h1) errors.push(`${file} 的 title「${declared}」与一级标题「${h1}」不一致`)
  }

  // 配置分页索引属目录表：链接文案承载完整标题，与行内引用（用显示名）区分
  if (existsSync(join(root, "docs", "config.md"))) {
    const section = /## 配置分页\n([\s\S]*?)\n## /.exec(read("docs/config.md"))?.[1] ?? ""
    if (!section) errors.push("docs/config.md 缺少「配置分页」小节")
    for (const matched of section.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
      const label = matched[1]
      const href = matched[2]
      const page = resolveDocPage(href.split("#")[0].replace(/^\./, ""))
      if (!page) {
        errors.push(`docs/config.md 的索引 ${href} 指向不存在的页面`)
        continue
      }
      const title = pageTitle(page)
      if (label !== title) errors.push(`docs/config.md 的索引文案「${label}」≠ 目标页标题「${title}」（${page}）`)
    }
  }
}

// 事实注册表（C-48）：只校验结构，不解析散文路径——与本条「生成器不得正则解析源码结构」同口径
const CONVENTIONS_COMMON = ".tasks/conventions/common.md"
if (existsSync(join(root, CONVENTIONS_COMMON))) {
  const section = /## C-48\.[^\n]*\n([\s\S]*)$/.exec(read(CONVENTIONS_COMMON))?.[1]
  if (!section) {
    errors.push(`${CONVENTIONS_COMMON} 缺少 C-48「单一真源与事实注册表」小节`)
  } else {
    const factRows = []
    for (const line of section.split("\n")) {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim())
      if (cells.length === 6 && /^F-\d+$/.test(cells[0])) factRows.push(cells)
    }
    if (factRows.length === 0) {
      errors.push(`${CONVENTIONS_COMMON} 的 C-48 缺少事实行（| F-<n> | … |，六列）`)
    } else {
      const ids = factRows.map((cells) => Number(cells[0].slice(2)))
      if (new Set(ids).size !== ids.length) errors.push(`${CONVENTIONS_COMMON} 的事实注册表 ID 有重复`)
      for (const [index, id] of ids.entries()) {
        if (id !== index + 1) {
          errors.push(`${CONVENTIONS_COMMON} 的事实注册表 ID 须从 F-1 连续递增：第 ${index + 1} 行为 F-${id}`)
          break
        }
      }
      for (const cells of factRows) {
        if (cells[5] !== "—" && !/^B[0-3]/.test(cells[5])) {
          errors.push(`${CONVENTIONS_COMMON} 的 ${cells[0]} 批次须以 B0–B3 开头或记「—」：${cells[5]}`)
        }
      }
    }
  }
}

// 输出：error 阻断，warn 只提示
if (warns.length > 0) {
  console.log("规范一致性检查：")
  for (const warn of warns) console.log(`【warn】${warn}`)
}
if (errors.length > 0) {
  console.error("规范一致性检查：")
  for (const error of errors) console.error(`【error】${error}`)
  process.exit(1)
}
console.log(
  `规范一致性检查：${skillNames.length} 个技能版本与用途列一致，references 引用可解析，active 任务触达路径均存在${diffRan ? "；改动比对已执行" : ""}`,
)
