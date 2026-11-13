import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { gitIgnoredDirs, toPosix } from "../git-ignore"

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

// 构建产物与缓存目录：内容由构建或运行生成，不承载本仓的更新日志
const ARTIFACT_DIRS = new Set(["dist", "build", "out", "target", "coverage", ".cache", ".next", ".nuxt", ".output", ".svelte-kit"])

// 版本库元数据目录：不是工作区内容
const VCS_DIRS = new Set([".git"])

// 内置跳过名单：依赖、产物与版本库元数据，按目录名在任意层级命中
const BUILTIN_SKIP = new Set([...DEPENDENCY_DIRS, ...ARTIFACT_DIRS, ...VCS_DIRS])

// 收集选项：exclude 追加跳过目录，include 强制放行（覆盖内置名单与 gitignore 判定）
export interface CollectOptions {
  exclude?: string[]
  include?: string[]
}

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

// 判目录是否被排除：include 优先放行，其后依次比内置名单、composer 依赖目录、gitignore
function makeSkipper(root: string, options: CollectOptions): (name: string, rel: string, abs: string) => boolean {
  const include = new Set((options.include ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))
  const exclude = new Set((options.exclude ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))
  const vendorDirs = composerVendorDir(root)
  const ignored = gitIgnoredDirs(root)
  return (name, rel, abs) => {
    const lowerName = name.toLowerCase()
    const lowerRel = rel.toLowerCase()
    // 放行优先于任何跳过判据：显式声明要处理的目录不应被静默跳过
    if (include.has(lowerName) || include.has(lowerRel)) return false
    if (exclude.has(lowerName) || exclude.has(lowerRel)) return true
    if (BUILTIN_SKIP.has(name)) return true
    if (vendorDirs.some((item) => lowerRel === item || lowerRel.startsWith(`${item}/`))) return true
    return ignored.has(toPosix(resolve(abs)))
  }
}

// 递归收集目录下属于本仓自身的 CHANGELOG.md：
// 跳过依赖安装目录、构建产物、版本库元数据，以及 gitignore 覆盖的目录；
// 判据不看文件是否被 git 跟踪——把 vendor 提交进版本库的项目同样不应改写第三方包的日志
export function collectChangelogs(dir: string, options: CollectOptions = {}): string[] {
  const root = resolve(dir)
  const results: string[] = []
  const skip = makeSkipper(root, options)
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
      } else if (entry.name === "CHANGELOG.md") {
        results.push(join(current, entry.name))
      }
    }
  }
  // 起始目录本身不参与跳过判定（如直接对 vendor/pkg 执行时仍应处理），只约束其子目录
  walk(root, "")
  return results
}
