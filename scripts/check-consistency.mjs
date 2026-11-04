// 仓库自检：技能版本四点一致、技能表用途列不残留旧术语、active 任务登记的触达路径真实存在
// 只服务本仓库（不属产品能力）：用 node 直跑，由 scripts/verify.mjs 统一挂载
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const errors = []
const warns = []

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

// active 任务「影响范围」里登记的触达路径（`- 文档触达：a、b`，可选）必须真实存在
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

for (const file of activeTaskFiles(join(root, ".tasks", "active"))) {
  const lines = readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n")
  for (const line of lines) {
    const matched = /^\s*-\s*文档触达：(.+)$/.exec(line)
    if (!matched) continue
    const paths = matched[1]
      .split(/[、,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
    for (const rel of paths) {
      if (!existsSync(join(root, rel))) errors.push(`${relative(root, file).split("\\").join("/")} 的文档触达指向不存在的路径：${rel}`)
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
console.log(`规范一致性检查：${skillNames.length} 个技能版本与用途列一致，active 任务触达路径均存在`)
