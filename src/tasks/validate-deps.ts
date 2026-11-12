// 归档依赖与游离文件校验：depends_on 闭环、游离任务文件，自 validate.ts 拆分
import { statSync, readdirSync, existsSync } from "node:fs"
import { join, basename } from "node:path"
import { readTextFile } from "../read-text"
import { listTaskFiles } from "./scan"
import { parseFrontmatterRaw } from "./parse"
import { parseArchiveBlocks } from "./archive-block"
import { parseDepends } from "./depends"
import { displayRel } from "./paths"
import type { CheckIssue } from "./validate"


// 游离任务文件扫描：active/archive 之外、带 {YYYYMMDD}- 日期前缀的 .md 视为疑似任务
// 这类文件不被 tasks/check/archive 任何命令读取，典型成因是建档时漏掉 active/{YYYYMM}/ 层级
export function strayTaskFiles(tasksDir: string): string[] {
  const results: string[] = []
  if (!existsSync(tasksDir)) return results
  for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
    if (entry.name === "active" || entry.name === "archive") continue
    if (entry.isFile()) {
      // 日期前缀启发式：README 等说明文档不带日期前缀，不误报
      if (entry.name.endsWith(".md") && /^\d{8}-/.test(entry.name)) results.push(entry.name)
    } else if (entry.isDirectory()) {
      // 只扫一层，覆盖漏建 active 层的 .tasks/202609/xxx.md（口径与 listTaskFiles 一致）
      for (const sub of readdirSync(join(tasksDir, entry.name))) {
        if (sub.endsWith(".md") && /^\d{8}-/.test(sub)) results.push(`${entry.name}/${sub}`)
      }
    }
  }
  return results
}


// 已归档索引缓存：键为归档文件路径，值为 { mtimeMs, titles }；
// 同一进程内多次 check（库调用 / 连续触发）复用未变更文件的解析结果，避免重复读盘（N2）
const archivedIndexCache = new Map<string, { mtimeMs: number; titles: string[] }>()

// 读单个归档文件的任务块标题集（mtime 感知缓存；文件损坏时按空集处理，仅影响去向提示精确度）
function archivedTitles(file: string): string[] {
  const st = statSync(file)
  const hit = archivedIndexCache.get(file)
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.titles
  const titles: string[] = []
  const seen = new Set<string>()
  try {
    for (const b of parseArchiveBlocks(readTextFile(file)).blocks) {
      if (b.title && !seen.has(b.title)) {
        seen.add(b.title)
        titles.push(b.title)
      }
    }
  } catch {
    // 忽略损坏文件
  }
  archivedIndexCache.set(file, { mtimeMs: st.mtimeMs, titles })
  return titles
}

// 校验 depends_on 依赖：目标存在性 + 成环检测（引用带 .md 扩展名时自动归一化比对；已归档给出精确去向）
export function validateDependencies(files: string[], tasksDir: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  const nameSet = new Set(files.map((f) => basename(f, ".md")))
  const depsMap = new Map<string, string[]>()
  // 引用名归一化：去空白与 .md 后缀，统一为任务文件 basename（不含扩展名）
  const normDep = (d: string) => d.trim().replace(/\.md$/, "").trim()

  for (const file of files) {
    const name = basename(file, ".md")
    const content = readTextFile(file)
    const fm = parseFrontmatterRaw(content)
    depsMap.set(name, parseDepends(fm.depends_on).map(normDep))
  }

  // 全库无任何依赖声明时无需成环检测与归档索引（建索引须扫遍 archive，惰性化避免空转）
  if (![...depsMap.values()].some((d) => d.length > 0)) return issues

  // 已归档索引：任务块标题 → 相对归档文件路径，仅在确有依赖缺失时构建（供缺失依赖精确提示去向，M3）
  let archivedAt: Map<string, string> | null = null
  const archivedLocation = (title: string): string | undefined => {
    if (!archivedAt) {
      archivedAt = new Map<string, string>()
      for (const af of listTaskFiles(join(tasksDir, "archive"))) {
        for (const t of archivedTitles(af)) {
          if (!archivedAt.has(t)) archivedAt.set(t, displayRel(tasksDir, af))
        }
      }
    }
    return archivedAt.get(title)
  }

  for (const [name, deps] of depsMap) {
    for (const d of deps) {
      if (!nameSet.has(d)) {
        const where = archivedLocation(d)
        issues.push({
          level: "warn",
          file: name,
          message: where
            ? `依赖的任务「${d}」不在 active 中（已归档于 ${where}，无需再依赖）`
            : `依赖的任务「${d}」不在 active 中（可能已归档或文件名拼写错误）`,
        })
      }
    }
  }

  // 成环检测：DFS 沿依赖边遍历，命中灰色节点即为环
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  const visit = (node: string, path: string[]): string[] | null => {
    color.set(node, GRAY)
    for (const dep of depsMap.get(node) ?? []) {
      if (!nameSet.has(dep)) continue
      const c = color.get(dep) ?? WHITE
      if (c === GRAY) return [...path, dep]
      if (c === WHITE) {
        const loop = visit(dep, [...path, dep])
        if (loop) return loop
      }
    }
    color.set(node, BLACK)
    return null
  }
  for (const name of depsMap.keys()) {
    if ((color.get(name) ?? WHITE) === WHITE) {
      const loop = visit(name, [name])
      if (loop) {
        issues.push({ level: "warn", file: name, message: `depends_on 存在循环依赖：${loop.join(" → ")}` })
        break
      }
    }
  }

  return issues
}
