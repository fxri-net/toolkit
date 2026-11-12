// 技能真源与现场（package）：自 source.ts 按职责拆分，逻辑逐字未改
import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readTextFile } from "../../read-text"
import { PKG_NAME } from "../types"
import { pathKey } from "./paths"


// 包根定位结果缓存（一次进程内不变）
let cachedRoot: string | undefined
// 链接锚点缓存：与包根同批解析，一次进程内不变
let cachedLinkRoot: string | undefined
// 包版本缓存：状态文件里记录内置来源版本
let cachedVersion: string | undefined

// 从当前模块位置逐级向上找 name 为 @fxri/toolkit 的 package.json，得到包根绝对路径
export function resolvePackageRoot(): string {
  if (cachedRoot) return cachedRoot
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const pkgFile = join(dir, "package.json")
    if (existsSync(pkgFile)) {
      try {
        const data = JSON.parse(readTextFile(pkgFile)) as { name?: unknown }
        if (data.name === PKG_NAME) {
          cachedRoot = dir
          return dir
        }
      } catch {
        // 非法 JSON 视为非目标包，继续向上
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`未能从模块位置向上定位 ${PKG_NAME} 的包根目录`)
}

// 重置包根、链接锚点与版本缓存（测试用：不改变结果，仅保证跨用例干净）
export function resetSkillsRootCache(): void {
  cachedRoot = undefined
  cachedLinkRoot = undefined
  cachedVersion = undefined
}

// 仅测试用：注入包根，使真源与链接锚点解析落在临时目录上
export function setPackageRootForTest(dir: string): void {
  cachedRoot = dir
  cachedLinkRoot = undefined
  cachedVersion = undefined
}

// 真源目录：包内 skills/
export function skillsSourceDir(): string {
  return join(resolvePackageRoot(), "skills")
}

// 包根目录（供 skills path 输出，便于委托上游安装器：pnpm dlx skills add "$(toolkit skills path)" -g）
export function skillsPackageDir(): string {
  return resolvePackageRoot()
}

// 包版本：状态文件记录来源版本，供后续判断来源是否升级
export function packageVersion(): string {
  if (cachedVersion) return cachedVersion
  try {
    const data = JSON.parse(readTextFile(join(resolvePackageRoot(), "package.json"))) as { version?: unknown }
    cachedVersion = typeof data.version === "string" ? data.version : ""
  } catch {
    cachedVersion = ""
  }
  return cachedVersion
}

// pnpm 稳定入口：从包根推出不随版本段漂移的入口目录
// pnpm 把包实体放在 <模块目录>/.pnpm/<包目录>/node_modules/<包名>，并在 <模块目录>/<包名> 建指向它的入口，
// 升级时只重写该入口；软链锚在入口上即跨版本存活。非 pnpm 布局（包实体即真实目录）返回空串
// 模块目录（.pnpm 所在层）随安装方式变化：项目内即 <项目>/node_modules，全局安装为 <pnpm 全局>/<global 段>（.pnpm 与 node_modules 并列），故按目录名判定并补 node_modules 层
export function pnpmStableEntry(pkgRoot: string): string {
  let dir = resolve(pkgRoot)
  for (;;) {
    const parent = dirname(dir)
    if (parent === dir) return ""
    if (basename(parent) === ".pnpm") {
      const container = dirname(parent)
      const moduleDir = basename(container) === "node_modules" ? container : join(container, "node_modules")
      return join(moduleDir, PKG_NAME)
    }
    dir = parent
  }
}

// 链接锚点：优先 pnpm 稳定入口，不可用则回落包根真源
// 必须校验候选的真实路径与包根一致——锚到别的版本或别的包上不会当场报错，只会在升级后断链
function resolveLinkRoot(): string {
  if (cachedLinkRoot) return cachedLinkRoot
  const root = resolvePackageRoot()
  let anchor = ""
  try {
    const candidate = pnpmStableEntry(root)
    if (candidate && existsSync(candidate) && pathKey(realpathSync(candidate)) === pathKey(realpathSync(root))) anchor = candidate
  } catch {
    // 探活失败（权限、竞态删除等）不作为锚点，静默回落真源
  }
  cachedLinkRoot = anchor || root
  return cachedLinkRoot
}

// 链接锚点目录：期望写进软链的目标（pnpm 布局下为稳定入口的 skills/，其余布局下即真源）
export function skillsLinkDir(): string {
  return join(resolveLinkRoot(), "skills")
}

// 读取技能真源版本：SKILL.md frontmatter 内 metadata.version（缩进键）；文件缺失、无 frontmatter 或未声明版本一律返回空串，不抛错
