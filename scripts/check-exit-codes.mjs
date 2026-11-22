// 退出码单一真源守卫：src 下除 exit-codes.ts 外不得出现 2 / 3 / 130 的退出码字面量，避免绕过 EXIT 常量
// 用法：node scripts/check-exit-codes.mjs [--self-test]
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const BANNED = new Set(["2", "3", "130"])
const ALLOW = new Set(["src/exit-codes.ts"])

/**
 * 扫描源码文本中的禁用退出码字面量。
 * @param {string} text 源码文本
 * @return {{line: number, code: string, snippet: string}[]} 命中列表
 */
export function scanSource(text) {
  const hits = []
  const patterns = [/process\.exitCode\s*=\s*(\d+)/g, /process\.exit\(\s*(\d+)\s*\)/g]
  text.split(/\r?\n/).forEach((line, index) => {
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      for (const match of line.matchAll(pattern)) {
        const code = match[1]
        if (!BANNED.has(code)) continue
        hits.push({ line: index + 1, code, snippet: line.trim().slice(0, 120) })
      }
    }
  })
  return hits
}

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue
      walk(full, acc)
    } else if (name.endsWith(".ts")) acc.push(full)
  }
  return acc
}

// 假现场：命中必须报出、常量写法必须放行
function selfTest() {
  const hit = scanSource("process.exitCode = 2\nprocess.exit(130)\n")
  const clean = scanSource("process.exitCode = EXIT.INTERACTIVE\nprocess.exitCode = 0\nprocess.exitCode = 1\n")
  if (hit.length !== 2 || clean.length !== 0) {
    console.error(`⚠️ 退出码守卫自检失败：命中 ${hit.length}（期望 2），放行 ${clean.length}（期望 0）`)
    process.exit(1)
  }
  console.log("退出码守卫自检通过：2 / 130 命中，EXIT 常量与 0 / 1 放行")
}

if (process.argv.includes("--self-test")) {
  selfTest()
  process.exit(0)
}

const files = walk(join(root, "src"), [])
const problems = []
for (const file of files) {
  const rel = relative(root, file).replace(/\\/g, "/")
  if (ALLOW.has(rel)) continue
  for (const hit of scanSource(readFileSync(file, "utf8"))) {
    problems.push({ file: rel, line: hit.line, code: hit.code, snippet: hit.snippet })
  }
}

if (problems.length > 0) {
  console.error(`⚠️ 发现 ${problems.length} 处退出码字面量，须改用 src/exit-codes.ts 的 EXIT 常量：`)
  for (const item of problems) console.error(`  ${item.file}:${item.line}  ${item.snippet}`)
  process.exit(1)
}
console.log("退出码单一真源检查：src 下无 2 / 3 / 130 字面量")
