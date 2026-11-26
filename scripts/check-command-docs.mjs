// 命令总览对照：docs/cli.md「命令总览」表引用的命令 / 子命令必须存在于命令注册表
// 只做子集校验：表头列名为「常用子命令」，允许不列全；隐藏命令（如 skill mount）也不要求出现在表里
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const REGISTRY = join(root, "src", "command-registry.ts")
const DOC = join(root, "docs", "cli.md")
const TABLE_HEADER = "## 命令总览"
// 内建命令不在注册表内，单独放行
const BUILTIN = new Set(["help"])

/**
 * 从命令注册表源码提取当前可用路径集合；planned 条目尚未落地，不计入。
 * @param {string} text 注册表源码
 * @return {Set<string>}
 */
export function registryPaths(text) {
  const paths = new Set()
  for (const line of text.split(/\r?\n/)) {
    const hit = /path:\s*"([^"]+)"/.exec(line)
    if (!hit) continue
    if (/stage:\s*"planned"/.test(line)) continue
    paths.add(hit[1])
  }
  return paths
}

/**
 * 解析命令总览表：返回顶层命令与子命令的登记项（含行号）。
 * @param {string} text docs/cli.md 内容
 * @return {{line: number, path: string}[] | null} 未找到表时返回 null
 */
export function docsCommands(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === TABLE_HEADER)
  if (start === -1) return null
  const listed = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (/^##\s/.test(line)) break
    if (!line.startsWith("|")) continue
    const cells = line.split("|").map((cell) => cell.trim())
    const domain = /`toolkit ([a-z][a-z0-9-]*)`/.exec(cells[1] ?? "")
    if (!domain) continue
    const top = domain[1]
    listed.push({ line: i + 1, path: top })
    for (const token of (cells[3] ?? "").matchAll(/`([^`]+)`/g)) {
      const sub = token[1]
      // 只认裸子命令名；带参数、选项或空格组合的写法不在此表校验范围
      if (!/^[a-z][a-z0-9-]*$/.test(sub)) continue
      listed.push({ line: i + 1, path: `${top} ${sub}` })
    }
  }
  return listed
}

/**
 * 对照注册表与命令总览。
 * @param {string} registryText 注册表源码
 * @param {string} docsText docs/cli.md 内容
 * @return {{ok: boolean, errors: string[], count: number}}
 */
export function check(registryText, docsText) {
  const registry = registryPaths(registryText)
  const listed = docsCommands(docsText)
  if (!listed) return { ok: false, errors: [`docs/cli.md 未找到「${TABLE_HEADER}」表`], count: 0 }
  const errors = []
  for (const entry of listed) {
    if (BUILTIN.has(entry.path)) continue
    if (!registry.has(entry.path)) errors.push(`docs/cli.md:${entry.line} 命令总览引用了未注册的命令「${entry.path}」`)
  }
  return { ok: errors.length === 0, errors, count: listed.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = check(readFileSync(REGISTRY, "utf8"), readFileSync(DOC, "utf8"))
  if (!result.ok) {
    for (const error of result.errors) console.error(error)
    console.error(`命令总览对照失败：${result.errors.length} 处`)
    process.exitCode = 1
  } else {
    console.log(`命令总览与注册表一致：${result.count} 条命令引用`)
  }
}
