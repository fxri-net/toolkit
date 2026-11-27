import { existsSync, lstatSync, readdirSync } from "node:fs"
import { join, basename, extname } from "node:path"

// 年月目录白名单（YYYYMM 定宽闭区间）：传入时跳过范围外的年月子目录，避免全量读盘后内存过滤；
// 非年月命名目录不受白名单约束（历史布局兜底，宁可多读不漏读）
export interface MonthRange {
  /** 起始月份（含），YYYYMM */
  since?: string
  /** 结束月份（含），YYYYMM */
  until?: string
}

// 列出目录下所有 .md 文件（仅一层年月子目录）；months 为月份目录白名单，缺省表示全量
export function listTaskFiles(dir: string, months?: MonthRange): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  const inRange = (month: string): boolean => {
    if (!months) return true
    if (!/^\d{6}$/.test(month)) return true
    if (months.since && month < months.since) return false
    if (months.until && month > months.until) return false
    return true
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // 链接（含 Windows junction）一律跳过：跟随会读写到任务区外的同名文件
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Dirent 对 junction 的类型判定跨平台不一致，目录再按 lstat 确认一次
      try {
        if (lstatSync(full).isSymbolicLink()) continue
      } catch {
        continue
      }
      if (!inRange(entry.name)) continue
      for (const sub of readdirSync(full)) {
        if (sub.endsWith(".md")) files.push(join(full, sub))
      }
    } else if (entry.name.endsWith(".md")) {
      files.push(full)
    }
  }
  return files
}

// 列出目录下被跳过的月份链接目录：供上层给出「已跳过扫描」的软告警，避免任务静默消失
export function listLinkedMonthDirs(dir: string): string[] {
  if (!existsSync(dir)) return []
  const names: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!/^\d{6}$/.test(entry.name)) continue
    try {
      if (lstatSync(join(dir, entry.name)).isSymbolicLink()) names.push(entry.name)
    } catch {
      // 读取失败按不存在处理
    }
  }
  return names.sort()
}

// 从文件名提取日期前缀（YYYYMMDD）
export function dateFromFileName(file: string): string {
  const name = basename(file, extname(file))
  const match = name.match(/^(\d{8})/)
  return match?.[1] ?? ""
}
