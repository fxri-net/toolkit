// 目录遍历范围判据：决定哪些目录不属于本仓自身的包，供 CHANGELOG 收集与文档页收集共用
// 判据与 git 跟踪状态解耦：把依赖目录提交进版本库的项目同样不参与遍历
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { gitIgnoredDirs, toPosix } from "./git-ignore"

// 依赖安装目录：目录内容来自外部包，无论是否被提交到版本库都不属于本仓自己的包
const DEPENDENCY_DIRS = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "vendor",
  "vendor-prefixed",
  ".venv",
  "venv",
  "site-packages",
  "__pypackages__",
])

// 构建产物与缓存目录：内容由构建或运行生成，不承载本仓的任何文档与日志
const ARTIFACT_DIRS = new Set(["dist", "build", "out", "target", "coverage", ".cache", ".next", ".nuxt", ".output", ".svelte-kit"])

// 版本库元数据目录：不是工作区内容
const VCS_DIRS = new Set([".git"])

// 内置跳过名单：依赖、产物与版本库元数据，按目录名在任意层级命中
const BUILTIN_SKIP = new Set([...DEPENDENCY_DIRS, ...ARTIFACT_DIRS, ...VCS_DIRS])

// 遍历范围选项：exclude 追加跳过目录，include 强制放行（覆盖内置名单与 gitignore 判定）
export interface ScopeOptions {
  exclude?: string[]
  include?: string[]
}

// 目录跳过判据：入参为目录名、仓库相对路径与绝对路径，命中即整棵不进入
export type DirSkipper = (name: string, rel: string, abs: string) => boolean

// 读取 composer 自定义依赖目录：config.vendor-dir 可改名，改名后内置的 vendor 判据需相应跟随
function composerVendorDir(root: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "composer.json"), "utf8")) as { config?: { "vendor-dir"?: unknown } }
    const value = parsed.config?.["vendor-dir"]
    if (typeof value !== "string" || value.trim() === "") return []
    // 归一为仓库相对路径，供前缀比对；绝对路径与 ../ 越界写法不作判据
    const rel = toPosix(value.trim()).replace(/^\.\//, "").replace(/\/+$/, "")
    if (rel === "" || rel.startsWith("/") || rel.split("/").includes("..")) return []
    return [rel.toLowerCase()]
  } catch {
    return []
  }
}

// 归一用户传入的目录清单：小写、去空白，便于与目录名和相对路径同时比对
function normalizeList(items?: string[]): Set<string> {
  return new Set((items ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))
}

// 构造目录跳过判据：include 优先于任何跳过来源，避免显式声明要处理的目录被静默跳过
export function createDirSkipper(root: string, options: ScopeOptions = {}): DirSkipper {
  const include = normalizeList(options.include)
  const exclude = normalizeList(options.exclude)
  const vendorDirs = composerVendorDir(root)
  const ignored = gitIgnoredDirs(root)
  return (name, rel, abs) => {
    const lowerName = name.toLowerCase()
    const lowerRel = rel.toLowerCase()
    if (include.has(lowerName) || include.has(lowerRel)) return false
    if (exclude.has(lowerName) || exclude.has(lowerRel)) return true
    if (BUILTIN_SKIP.has(name)) return true
    if (vendorDirs.some((item) => lowerRel === item || lowerRel.startsWith(`${item}/`))) return true
    return ignored.has(toPosix(resolve(abs)))
  }
}

// 递归收集满足文件名的路径：目录命中跳过判据即整棵不进入，起始目录本身不参与判定
export function walkFiles(root: string, match: (fileName: string) => boolean, options: ScopeOptions = {}): string[] {
  const base = resolve(root)
  const results: string[] = []
  const skip = createDirSkipper(base, options)
  const walk = (current: string, rel: string) => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        const abs = join(current, entry.name)
        if (skip(entry.name, childRel, abs)) continue
        walk(abs, childRel)
      } else if (match(entry.name)) {
        results.push(join(current, entry.name))
      }
    }
  }
  walk(base, "")
  return results
}
