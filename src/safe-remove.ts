// 安全删除：所有用户可见产物的递归删除统一走这里，先校验目标必须位于调用方给定的允许根内
import { existsSync, lstatSync, rmSync, rmdirSync, unlinkSync } from "node:fs"
import { parse, resolve, dirname } from "node:path"
import { getHomeDir } from "./config"
import { isHomeDirectory } from "./scope/paths"
import { isEmptyDir, isInside, pathKey } from "./skills/source/paths"

// 技能名 / 状态条目名：必须是单段名，避免 join 后越出目标目录
export function isSingleSegmentName(name: string): boolean {
  return name.length > 0 && name !== "." && name !== ".." && !/[\\/:*?"<>|]/.test(name) && !name.includes("\0")
}

// 受保护根：这些目录本身不得作为删除目标；其子目录仍按允许根判断
function protectedRoots(): string[] {
  return [
    parse(resolve(process.cwd())).root,
    getHomeDir(),
    process.env.APPDATA,
    process.env.LOCALAPPDATA,
    process.env.ProgramData,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.WINDIR,
  ].filter((value): value is string => Boolean(value))
}

// 目标本身是否就是受保护根（根目录 / 用户主目录 / AppData / Windows / Program Files 等）
export function isProtectedTarget(target: string): boolean {
  const key = pathKey(target)
  if (isHomeDirectory(target)) return true
  return protectedRoots().some((root) => pathKey(root) === key)
}

// 删除目标必须严格位于允许根内，且不能是受保护根本身；越界直接抛错，由调用方转为跳过/人工项
export function assertWithinRoot(target: string, root: string, label = "删除"): void {
  const abs = resolve(target)
  const base = resolve(root)
  if (pathKey(abs) === pathKey(base)) throw new Error(`${label}目标不能是允许根本身：${abs}`)
  if (!isInside(abs, base)) throw new Error(`${label}目标不在允许根内：${abs}（根：${base}）`)
  if (isProtectedTarget(abs)) throw new Error(`${label}目标受保护：${abs}`)
}

// 越界拒绝时统一告警；调用方仍需处理异常（标记 skipped / manual）
function reject(label: string, target: string, error: unknown): never {
  console.warn(`⚠️ ${label}已跳过：${target}（${error instanceof Error ? error.message : String(error)}）`)
  throw error instanceof Error ? error : new Error(String(error))
}

// 删除技能产物：链接只摘链，目录 / 文件递归删除；允许根由调用方按目标面传入
export function safeRemoveArtifact(target: string, root: string, label = "删除"): void {
  try {
    assertWithinRoot(target, root, label)
  } catch (error) {
    reject(label, target, error)
  }
  let isLink = false
  try {
    isLink = lstatSync(target).isSymbolicLink()
  } catch {
    // 不存在或无法判型时按普通路径处理，rmSync 的 force 会兜底
  }
  if (isLink) {
    unlinkSync(target)
    return
  }
  rmSync(target, { recursive: true, force: true })
}

// 删除文件：仅限单文件；目标必须在允许根内
export function safeRemoveFile(target: string, root: string, label = "删除"): void {
  try {
    assertWithinRoot(target, root, label)
  } catch (error) {
    reject(label, target, error)
  }
  rmSync(target, { force: true })
}

// 回收空目录：仅当目录为空才 rmdir，非空或不可读一律跳过，避免误删内容
export function safeRemoveEmptyDir(target: string, root: string, label = "回收空目录"): boolean {
  try {
    assertWithinRoot(target, root, label)
  } catch (error) {
    reject(label, target, error)
  }
  if (!existsSync(target) || !isEmptyDir(target)) return false
  rmdirSync(target)
  return true
}

// 目标落在哪个允许根内：供恢复清单等需要多根判断的场景复用
export function rootForPath(target: string, roots: readonly string[]): string | null {
  const abs = resolve(target)
  for (const root of roots) {
    const base = resolve(root)
    if (pathKey(abs) === pathKey(base) || isInside(abs, base)) return base
  }
  return null
}

// 文件父目录（供调用方把“删除某个子项”的允许根限定在父目录）
export function parentOf(target: string): string {
  return dirname(resolve(target))
}
