// 文档导入解析：vue-tsc 不检查 Markdown 内脚本，这里兜住 .md 与 .vue 的相对导入目标存在性
import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

const docsRoot = join(process.cwd(), "docs")

// 递归收集指定后缀的文件；跳过依赖与构建产物
function walk(dir: string, suffix: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "cache" || entry.name === "dist") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full, suffix))
    else if (entry.name.endsWith(suffix)) files.push(full)
  }
  return files
}

// 只取 <script setup> 块，避免把正文代码示例当成真导入
function scriptBlocks(file: string): string[] {
  const text = readFileSync(file, "utf8")
  return [...text.matchAll(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? "")
}

function importSpecifiers(script: string): string[] {
  const specs: string[] = []
  for (const pattern of [/from\s+["']([^"']+)["']/g, /import\s+["']([^"']+)["']/g]) {
    for (const match of script.matchAll(pattern)) {
      const spec = match[1]
      if (spec) specs.push(spec)
    }
  }
  return specs
}

function label(file: string): string {
  return relative(process.cwd(), file).replace(/\\/g, "/")
}

describe("文档导入解析", () => {
  it("Markdown 的 <script setup> 相对 import 目标存在", () => {
    const problems: string[] = []
    for (const file of walk(docsRoot, ".md")) {
      for (const block of scriptBlocks(file)) {
        for (const spec of importSpecifiers(block)) {
          if (!spec.startsWith(".")) continue
          if (!existsSync(resolve(dirname(file), spec))) problems.push(`${label(file)} → ${spec}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it("Vue 组件的 ?raw / JSON 相对导入目标存在", () => {
    const problems: string[] = []
    for (const file of walk(docsRoot, ".vue")) {
      for (const block of scriptBlocks(file)) {
        for (const spec of importSpecifiers(block)) {
          if (!spec.startsWith(".")) continue
          const clean = spec.replace(/\?raw$/, "")
          if (!clean.endsWith(".md") && !clean.endsWith(".json")) continue
          if (!existsSync(resolve(dirname(file), clean))) problems.push(`${label(file)} → ${spec}`)
        }
      }
    }
    expect(problems).toEqual([])
  })
})
