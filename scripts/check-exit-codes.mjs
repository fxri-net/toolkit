// 退出码单一真源守卫：src 下除 exit-codes.ts 外不得出现「除 0 / 1 以外」的退出码字面量，避免绕过 EXIT 常量
// 禁用集合从 src/exit-codes.ts 派生（EXIT 常量与 EXIT_CODE_TABLE 双解析互校），新增退出码自动纳入
// 用法：node scripts/check-exit-codes.mjs [--self-test]
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const SOURCE = join(root, "src", "exit-codes.ts")
const ALLOW = new Set(["src/exit-codes.ts"])
// 0 与 1 属通用语义（成功 / 失败），允许直接书写；其余码必须走 EXIT 常量
const ALLOWED_LITERALS = new Set(["0", "1"])

/**
 * 从真源派生禁用退出码集合。
 * 解析两处结构并要求数值集合一致：任一处格式变化导致解析为空或不等，即报错而非静默放行。
 * @param {string} text src/exit-codes.ts 内容
 * @return {Set<string>} 除 0 / 1 外的退出码
 */
export function bannedCodes(text) {
  const exitBlock = /export const EXIT = \{([\s\S]*?)\}\s*as const/.exec(text)?.[1] ?? ""
  const fromExit = [...exitBlock.matchAll(/^\s*[A-Z_]+:\s*(\d+)\s*,?$/gm)].map((match) => match[1])
  const fromTable = [...text.matchAll(/\{\s*code:\s*(\d+)\s*,/g)].map((match) => match[1])
  if (fromExit.length === 0 || fromTable.length === 0) {
    throw new Error("无法从 src/exit-codes.ts 解析退出码：EXIT 常量或 EXIT_CODE_TABLE 结构已变化")
  }
  const exitSet = new Set(fromExit)
  const tableSet = new Set(fromTable)
  if (exitSet.size !== tableSet.size || [...exitSet].some((code) => !tableSet.has(code))) {
    throw new Error("EXIT 常量与 EXIT_CODE_TABLE 的数值集合不一致，无法确定禁用码")
  }
  return new Set([...exitSet].filter((code) => !ALLOWED_LITERALS.has(code)))
}

/**
 * 扫描源码文本中的禁用退出码字面量。
 * @param {string} text 源码文本
 * @param {Set<string>} banned 禁用码集合
 * @return {{line: number, code: string, snippet: string}[]} 命中列表
 */
export function scanSource(text, banned) {
  const hits = []
  const patterns = [/process\.exitCode\s*=\s*(\d+)/g, /process\.exit\(\s*(\d+)\s*\)/g]
  text.split(/\r?\n/).forEach((line, index) => {
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      for (const match of line.matchAll(pattern)) {
        const code = match[1]
        if (!banned.has(code)) continue
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

// 假现场：禁用集合从假源码派生；命中必须报出、EXIT 常量与 0 / 1 放行
function selfTest() {
  const fakeSource = [
    "export const EXIT = {",
    "  OK: 0,",
    "  FAIL: 1,",
    "  CANCEL: 7,",
    "} as const",
    "",
    "export const EXIT_CODE_TABLE = [",
    '  { code: 0, name: "OK", meaning: "", scene: "" },',
    '  { code: 1, name: "FAIL", meaning: "", scene: "" },',
    '  { code: 7, name: "CANCEL", meaning: "", scene: "" },',
    "]",
  ].join("\n")
  const banned = bannedCodes(fakeSource)
  const hit = scanSource("process.exitCode = 7\nprocess.exit(9)\n", banned)
  const clean = scanSource("process.exitCode = EXIT.CANCEL\nprocess.exitCode = 0\nprocess.exitCode = 1\n", banned)
  const driftedSource = fakeSource.replace('  { code: 7, name: "CANCEL", meaning: "", scene: "" },\n', "")
  const driftedDetected = (() => {
    try {
      bannedCodes(driftedSource)
      return false
    } catch {
      return true
    }
  })()
  if (banned.size !== 1 || !banned.has("7") || hit.length !== 1 || clean.length !== 0 || !driftedDetected) {
    console.error(
      `⚠️ 退出码守卫自检失败：禁用集合 ${[...banned].join(",")}（期望 7），命中 ${hit.length}（期望 1），放行 ${clean.length}（期望 0），漂移检出 ${driftedDetected}`,
    )
    process.exit(1)
  }
  console.log("退出码守卫自检通过：禁用集合从真源派生，常量与 0 / 1 放行，双解析不一致时报错")
}

if (process.argv.includes("--self-test")) {
  selfTest()
  process.exit(0)
}

let banned
try {
  banned = bannedCodes(readFileSync(SOURCE, "utf8"))
} catch (error) {
  console.error(`⚠️ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const files = walk(join(root, "src"), [])
const problems = []
for (const file of files) {
  const rel = relative(root, file).replace(/\\/g, "/")
  if (ALLOW.has(rel)) continue
  for (const hit of scanSource(readFileSync(file, "utf8"), banned)) {
    problems.push({ file: rel, line: hit.line, code: hit.code, snippet: hit.snippet })
  }
}

if (problems.length > 0) {
  console.error(`⚠️ 发现 ${problems.length} 处退出码字面量，须改用 src/exit-codes.ts 的 EXIT 常量：`)
  for (const item of problems) console.error(`  ${item.file}:${item.line}  ${item.snippet}`)
  process.exit(1)
}
console.log(`退出码单一真源检查：src 下无 ${[...banned].join(" / ")} 字面量`)
