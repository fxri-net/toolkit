import { existsSync, readdirSync, statSync } from "node:fs"
import { join, basename, extname } from "node:path"

// 列出目录下所有 .md 文件（仅一层年月子目录）
export function listTaskFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      for (const sub of readdirSync(full)) {
        if (sub.endsWith(".md")) files.push(join(full, sub))
      }
    } else if (entry.endsWith(".md")) {
      files.push(full)
    }
  }
  return files
}

// 从文件名提取日期前缀（YYYYMMDD）
export function dateFromFileName(file: string): string {
  const name = basename(file, extname(file))
  const match = name.match(/^(\d{8})/)
  return match ? match[1] : ""
}
