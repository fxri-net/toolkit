// 破坏性删除门禁：src 下除 safe-remove 与测试外，禁止裸递归 rmSync / fs.rm
// 允许的缓存 / 临时目录单列白名单，避免把自身派生数据也纳入用户可见产物的约束
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const SCAN_ROOT = join(root, "src")
const SAFE_MODULE = "src/safe-remove.ts"
const ALLOW = new Map([
  ["src/cache.ts", "用户级缓存目录，删除的是可重建派生数据"],
  ["src/rules/clipboard.ts", "临时剪贴板目录"],
  ["src/skills/source/remote.ts", "技能来源缓存 / 临时克隆目录"],
])

// 只匹配带 recursive: true 的递归删除；单文件 rmSync 走 safeRemoveFile 或自身固定缓存不在本门禁范围
const PATTERNS = [/rmSync\s*\([^)]*recursive\s*:\s*true/, /\.rm\s*\([^)]*recursive\s*:\s*true/]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = relative(root, full).split("\\").join("/")
    if (entry === "__tests__" || rel.startsWith("src/__tests__/")) continue
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith(".ts")) out.push(rel)
  }
  return out
}

function scanText(text) {
  const hits = []
  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.source, "g")
    let match
    while ((match = re.exec(text)) !== null) {
      hits.push(text.slice(0, match.index).split("\n").length)
    }
  }
  return hits
}

function scanFiles(files) {
  const errors = []
  for (const file of files) {
    if (file === SAFE_MODULE || ALLOW.has(file)) continue
    const lines = scanText(readFileSync(join(root, file), "utf8"))
    for (const line of lines) errors.push(`${file}:${line}`)
  }
  return errors
}

function selfTest() {
  const cases = [
    { text: 'rmSync(dir, { recursive: true, force: true })', expect: 1 },
    { text: 'fs.rm(dir, { recursive: true })', expect: 1 },
    { text: 'rmSync(file, { force: true })', expect: 0 },
    { text: 'rmdirSync(dir)', expect: 0 },
  ]
  for (const item of cases) {
    const got = scanText(item.text).length
    if (got !== item.expect) {
      console.error(`✖ 自检失败：期望 ${item.expect} 处，实际 ${got} 处：${item.text}`)
      process.exit(1)
    }
  }
  console.log("✔ 破坏性删除检查自检通过")
}

if (process.argv.includes("--self-test")) {
  selfTest()
  process.exit(0)
}

const files = walk(SCAN_ROOT)
const errors = scanFiles(files)
if (errors.length > 0) {
  console.error("✖ 发现未收敛的递归删除（请改用 src/safe-remove.ts，或在脚本白名单说明理由）：")
  for (const item of errors) console.error(`  ${item}`)
  process.exit(1)
}
console.log(`✔ 破坏性删除检查通过（扫描 ${files.length} 个源文件，允许 ${ALLOW.size} 个缓存 / 临时目录）`)
