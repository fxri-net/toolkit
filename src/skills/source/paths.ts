// 技能真源与现场（paths）：自 source.ts 按职责拆分，逻辑逐字未改
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs"
import type { Dirent } from "node:fs"
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path"
import { normalizePathForCompare } from "../../git-ignore"


export function pathKey(p: string): string {
  return normalizePathForCompare(resolve(p))
}

// 剥离尾部分隔符：Windows junction 的 readlink 结果形如 C:\x\target\，直接比较会因尾部分隔符导致路径判定失配
export function stripTailSep(p: string): string {
  const n = normalize(p)
  if (/^[a-zA-Z]:[\\/]$/.test(n)) return n
  return n.replace(/[\\/]+$/, "") || n
}

// 分类现场产物：不存在 / 链接且指向真源或同内容目录 / 链接但指向其他版本 / 悬空链接 / 实体目录 / 普通文件

export function pathPresent(p: string): boolean {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

// 残留判定：条目是本工具形态的链接（含悬空 / junction），且指向技能源缓存或本包技能目录
// 只用于报告，不用于删除：它无法证明归属，清理仍须用户显式点名
export function isToolkitArtifactLink(dest: string): boolean {
  let stat
  try {
    stat = lstatSync(dest)
  } catch {
    return false
  }
  if (!stat.isSymbolicLink()) return false
  let target = ""
  try {
    target = readlinkSync(dest)
  } catch {
    return false
  }
  const abs = stripTailSep(isAbsolute(target) ? target : resolve(dirname(dest), target))
  const normalized = abs.split("\\").join("/")
  if (normalized.includes("/.toolkit/cache/skill-sources/")) return true
  return /\/node_modules\/@fxri\/toolkit\/skills\//.test(normalized)
}

// 目录是否存在且为空（不存在 / 不可读按「非空」处理，避免误删有内容的目录）
export function isEmptyDir(dir: string): boolean {
  try {
    return readdirSync(dir).length === 0
  } catch {
    return false
  }
}

// 两目录内容是否逐字一致（任一侧缺失即按不一致处理）
export function sameDirContent(a: string, b: string): boolean {
  return existsSync(a) && existsSync(b) && dirsEqual(a, b)
}

// 递归比对两个目录内容是否一致（用于副本幂等判断与漂移检测），任何读取失败按「不一致」处理
export function dirsEqual(a: string, b: string): boolean {
  let aNames: string[]
  let bNames: string[]
  try {
    aNames = readdirSync(a).sort()
    bNames = readdirSync(b).sort()
  } catch {
    return false
  }
  if (aNames.length !== bNames.length || aNames.some((n, i) => n !== bNames[i])) return false
  for (const name of aNames) {
    const pa = join(a, name)
    const pb = join(b, name)
    let sa
    let sb
    try {
      sa = statSync(pa)
      sb = statSync(pb)
    } catch {
      return false
    }
    if (sa.isDirectory() !== sb.isDirectory()) return false
    if (sa.isDirectory()) {
      if (!dirsEqual(pa, pb)) return false
    } else {
      try {
        if (!readFileSync(pa).equals(readFileSync(pb))) return false
      } catch {
        return false
      }
    }
  }
  return true
}


export function realPath(p: string): string {
  try {
    return realpathSync.native(p)
  } catch {
    return resolve(p)
  }
}

// 判 sub 是否落在 root 之内（不含 root 自身）：比较时补正斜杠，避免 /a/bc 被误判为 /a/b 之下
export function isInside(sub: string, root: string): boolean {
  const sk = pathKey(stripTailSep(sub))
  const rk = pathKey(stripTailSep(root))
  return sk !== rk && sk.startsWith(`${rk}/`)
}

// 作用域判定：自 cwd 逐级向上，任一层含 package.json 且 CLI 包根落在其下 → 项目面（兼容 monorepo 子目录内执行）
// 源仓库（包根即项目根）恒走全局面：维护者靠全局技能自举，不把自身 skills/ 复制进自身仓库

// 仓库相对路径归一为 posix：写进归属账与报告，跨机器（Windows / POSIX）稳定
export function toRepoRel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/")
}

// 目录条目列表：供自愈与状态判定复用
export function listDirEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}
