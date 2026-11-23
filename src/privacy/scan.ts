// 隐私扫描：按项目档位检查本机绝对路径；.tasks / .changeset 为 error，文档与技能为 warn
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { findLocalPaths, normalizeLocalPaths, resolveLocalPathLevel, type LocalPathLevel } from "./paths"

// 扫描范围：目录递归 + 单文件；路径均相对仓库根
const SCAN_DIRS = [".tasks", ".changeset", "docs", "skills", "templates/rules"]
const SCAN_FILES = ["README.md", "SPEC.md", "AGENTS.md"]
// 只扫文本文件，避免把二进制当路径源
const TEXT_EXT = new Set([".md", ".json", ".jsonl", ".txt", ".yml", ".yaml"])

// 单条命中：line 为 1 基行号
export interface PrivacyHit {
  file: string
  line: number
  kind: "windows" | "posix-home"
  level: "error" | "warn"
  text: string
}

export interface PrivacyScanReport {
  level: LocalPathLevel
  skipped: boolean
  scannedFiles: number
  hits: PrivacyHit[]
  errors: number
  warnings: number
}

// 严重级：任务归档 / 规范载体与变更集阻断，其余只提示
function levelOf(rel: string): "error" | "warn" {
  const parts = rel.split("/")
  if (parts[0] === ".changeset") return "error"
  if (parts.includes("active")) return "warn"
  if (parts.includes("archive") || parts.includes("conventions")) return "error"
  return "warn"
}

// 递归收集文本文件：跳过 node_modules / dist / .git
function collectFiles(root: string, rel: string, out: string[]): void {
  const abs = join(root, rel)
  if (!existsSync(abs)) return
  const info = statSync(abs)
  if (info.isFile()) {
    if (TEXT_EXT.has(extOf(rel))) out.push(rel)
    return
  }
  if (!info.isDirectory()) return
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue
    const child = `${rel}/${entry.name}`
    if (entry.isDirectory()) collectFiles(root, child, out)
    else if (TEXT_EXT.has(extOf(entry.name))) out.push(child)
  }
}

function extOf(file: string): string {
  const index = file.lastIndexOf(".")
  return index < 0 ? "" : file.slice(index).toLowerCase()
}

// 扫描指定根（缺省为仓库根）：档位 off 时跳过全部检查
export function scanPrivacy(root = process.cwd(), options: { roots?: string[] } = {}): PrivacyScanReport {
  const level = resolveLocalPathLevel()
  if (level === "off") return { level, skipped: true, scannedFiles: 0, hits: [], errors: 0, warnings: 0 }
  const files: string[] = []
  const roots = options.roots ?? [...SCAN_DIRS, ...SCAN_FILES]
  for (const rel of roots) collectFiles(root, rel.split(sep).join("/"), files)
  const hits: PrivacyHit[] = []
  for (const rel of files) {
    let text = ""
    try {
      text = readFileSync(join(root, rel), "utf8")
    } catch {
      continue
    }
    const hitLevel = levelOf(rel)
    text.split(/\r?\n/).forEach((line, index) => {
      for (const hit of findLocalPaths(line)) {
        hits.push({ file: rel, line: index + 1, kind: hit.kind, level: hitLevel, text: hit.value })
      }
    })
  }
  return {
    level,
    skipped: false,
    scannedFiles: files.length,
    hits,
    errors: hits.filter((hit) => hit.level === "error").length,
    warnings: hits.filter((hit) => hit.level === "warn").length,
  }
}

export interface PrivacyFixResult {
  files: string[]
  normalized: number
}

// 自动归一：只改任务区（含归档与规范载体），文档与技能只报告不擅改
export function fixPrivacyPaths(root = process.cwd()): PrivacyFixResult {
  const files: string[] = []
  const targets = [".tasks/active", ".tasks/archive", ".tasks/conventions"]
  const collected: string[] = []
  for (const rel of targets) collectFiles(root, rel, collected)
  let normalized = 0
  for (const rel of collected) {
    const abs = join(root, rel)
    let text = ""
    try {
      text = readFileSync(abs, "utf8")
    } catch {
      continue
    }
    const result = normalizeLocalPaths(text)
    if (result.count === 0) continue
    writeFileSync(abs, result.text, "utf8")
    files.push(relative(root, abs).split(sep).join("/"))
    normalized += result.count
  }
  return { files, normalized }
}
