// 文档无损检查：以最近版本 tag 为基线，按「去空白整句比对」列出基线有、当前找不到的句子
// 只服务本仓库（不属产品能力）：只告警不阻断，用于发现「为压行数删掉事实」这类有损压缩
// 基线取 tag 而非 HEAD：verify 在归档后执行，用 HEAD 会把本任务自己的改动当成基线，永远无差异
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MIN_SENTENCE = 20
const MAX_SEGMENT = 200
const MAX_PER_FILE = 5
const EXCLUDED = new Set(["docs/changelog.md"])
const TARGET_FILES = ["README.md", "AGENTS.md", "SPEC.md"]
const TARGET_PREFIXES = ["docs/", "skills/"]

/** 执行 git 命令，失败返回 null（无 tag / 非 git 仓库 / 浅克隆都按跳过处理） */
function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return null
  }
}

const tag = git(["describe", "--tags", "--abbrev=0", "--match", "v*"])?.trim()
if (!tag) {
  console.log("文档无损检查：跳过（未找到版本 tag，仅在有发布标签的完整检出时比对）")
  process.exit(0)
}

const listed = git(["ls-tree", "-r", "--name-only", tag])
if (!listed) {
  console.log(`文档无损检查：跳过（无法读取基线 ${tag} 的文件清单）`)
  process.exit(0)
}

const files = listed
  .split(/\r?\n/)
  .filter((file) => file.endsWith(".md") && !EXCLUDED.has(file))
  .filter((file) => TARGET_FILES.includes(file) || TARGET_PREFIXES.some((prefix) => file.startsWith(prefix)))

// 归一：只留中英文与数字，去掉空白与标点——断句、标点替换不算改动
const normalize = (text) => text.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "")
const COVERAGE_MIN = 0.5

// 切出待比对的正文句：跳过代码块、表格行与 frontmatter 分隔行，再按句读切分
function segments(text) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n")
  const prose = []
  let inFence = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("```")) {
      inFence = !inFence
      continue
    }
    if (inFence || trimmed.startsWith("|") || trimmed.startsWith("---")) continue
    prose.push(trimmed)
  }
  return prose
    .join("\n")
    .split(/[。；！？]/)
    .map(normalize)
    .filter((sentence) => sentence.length >= MIN_SENTENCE && sentence.length <= MAX_SEGMENT)
}

// 双字覆盖率：容忍改写措辞，抓整句消失（删除句覆盖率接近 0，改写句通常 >0.8）
function bigrams(text) {
  const grams = new Set()
  for (let i = 0; i < text.length - 1; i += 1) grams.add(text.slice(i, i + 2))
  return grams
}

function coverage(sentence, currentGrams) {
  const grams = bigrams(sentence)
  if (grams.size === 0) return 1
  let hit = 0
  for (const gram of grams) if (currentGrams.has(gram)) hit += 1
  return hit / grams.size
}

let total = 0
let compared = 0

// 全仓语料：内容在文件间迁移（拆页、下沉）不算丢失，只有整仓都找不到才算疑似丢失
const corpus = files
  .filter((file) => existsSync(join(process.cwd(), file)))
  .map((file) => normalize(readFileSync(join(process.cwd(), file), "utf8")))
  .join("")
const corpusGrams = bigrams(corpus)

for (const file of files) {
  const old = git(["show", `${tag}:${file}`])
  if (old === null) continue
  const exists = existsSync(join(process.cwd(), file))
  const missing = segments(old)
    .map((sentence) => ({ sentence, ratio: coverage(sentence, corpusGrams) }))
    .filter((item) => item.ratio < COVERAGE_MIN)
    .sort((a, b) => a.ratio - b.ratio)
  compared += 1
  if (missing.length === 0) continue
  total += missing.length
  console.log(`[doc-loss] ${file}${exists ? "" : "（文件已删除或改名）"}：疑似丢失 ${missing.length} 句`)
  for (const item of missing.slice(0, MAX_PER_FILE)) {
    console.log(`  - ${item.sentence.slice(0, 100)}（覆盖率 ${(item.ratio * 100).toFixed(0)}%）`)
  }
  if (missing.length > MAX_PER_FILE) console.log(`  - …另有 ${missing.length - MAX_PER_FILE} 句`)
}

if (total === 0) {
  console.log(`文档无损检查：与 ${tag} 相比，${compared} 个文件未发现整句丢失`)
} else {
  console.log(`文档无损检查：与 ${tag} 相比疑似丢失 ${total} 句（仅为提示，改写与迁移请人工确认）`)
}
// 只告警不阻断：正常改写会让整句变化，硬失败会逼人绕过检查
process.exit(0)
