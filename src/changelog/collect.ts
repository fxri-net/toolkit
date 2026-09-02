import { readdirSync } from "node:fs"
import { join } from "node:path"

// 递归收集目录下所有 CHANGELOG.md（排除 node_modules / .git / dist）
export function collectChangelogs(dir: string): string[] {
  const results: string[] = []
  const exclude = new Set(["node_modules", ".git", "dist"])
  const walk = (current: string) => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (exclude.has(entry.name)) continue
        walk(join(current, entry.name))
      } else if (entry.name === "CHANGELOG.md") {
        results.push(join(current, entry.name))
      }
    }
  }
  walk(dir)
  return results
}
