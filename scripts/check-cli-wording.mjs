// CLI 文案中英混用检查：中文提示里的枚举原值必须包在反引号或括注里，或属于 --flag value 片段
// 规则来源：docs/cli.md「文案约定」——文本层只给人读中文，原值只在需要手写时括注
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"

const ROOT = process.cwd()
const ENUM_TOKENS = ["global", "project", "local", "off", "warn", "error"]
const CJK = /[\u3400-\u9fff]/

// 允许的原值形态：反引号包裹、括注（中文（原值））、命令行片段 --flag value、占位符 <...>
export function stripAllowed(text) {
  return text
    .replace(/`[^`]*`/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/--[a-z-]+(?:\s+[a-z0-9-]+)?/g, "")
}

// 单段文案扫描：只检查含中文的片段，返回命中项
export function scanText(text, file = "", line = 1) {
  if (!CJK.test(text)) return []
  const stripped = stripAllowed(text)
  const hits = []
  for (const token of ENUM_TOKENS) {
    // 排除 dotted 标识（privacy.localPaths）与连字符词（off-site）中的误命中
    if (new RegExp(`(?<![.\\w-])${token}(?![.\\w-])`).test(stripped)) hits.push({ file, line, token, text: text.trim() })
  }
  return hits
}

// 源码扫描：字符串字面量与模板字面量各段都参与，注释天然不参与
export function scanSource(source, file = "") {
  const sf = ts.createSourceFile(file || "fixture.ts", source, ts.ScriptTarget.Latest, true)
  const hits = []
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
      hits.push(...scanText(node.text, file, line))
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

// 递归收集 src 下的源文件，测试目录不参与（测试里的中文断言与现场数据不算用户文案）
function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (entry.name.endsWith(".ts")) out.push(full)
  }
  return out
}

function main() {
  const hits = sourceFiles(join(ROOT, "src")).flatMap((file) =>
    scanSource(readFileSync(file, "utf8"), relative(ROOT, file).replace(/\\/g, "/")),
  )
  if (hits.length === 0) {
    console.log("CLI 文案检查：中文提示中的枚举原值均按「中文（原值）」或命令片段书写")
    return
  }
  console.error("CLI 文案检查：")
  for (const hit of hits) console.error(`  ${hit.file}:${hit.line}  裸枚举 ${hit.token}  ${hit.text}`)
  console.error(`共 ${hits.length} 处；文本层只写中文，需要手写或执行时再写「中文（原值）」或 --flag value`)
  process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
