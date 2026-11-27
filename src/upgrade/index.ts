// 升级迁移编排：检测 → 计划 → 应用 → 复检，供命令层与测试共用
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"
import { packageVersion } from "../skills/source"
import { detectUpgradeItems, countAutoResidue, ALL_LAYERS, tasksDirFor } from "./detect"
import { applyUpgrade } from "./apply"
import type { UpgradeApplyResult, UpgradeItem, UpgradeLayer, UpgradePlan } from "./types"

// 计划过滤：--only / --skip 都按稳定 id 匹配；不传即全选
export function buildUpgradePlan(
  cwd: string,
  options: { layers?: readonly UpgradeLayer[]; only?: string[]; skip?: string[]; pruneLegacy?: boolean; skipEvents?: boolean } = {},
): UpgradePlan {
  const layers = options.layers ?? ALL_LAYERS
  const only = options.only && options.only.length > 0 ? new Set(options.only) : null
  const skip = new Set(options.skip ?? [])
  const items = detectUpgradeItems(cwd, layers, { pruneLegacy: options.pruneLegacy, skipEvents: options.skipEvents }).filter(
    (item) => (only ? only.has(item.id) : true) && !skip.has(item.id),
  )
  return {
    items,
    autoResidue: countAutoResidue(items),
    manual: items.filter((item) => item.status === "manual").length,
  }
}

// 复检：迁移完成后仍有可自动处理的残留即视为未完成
export function verifyUpgrade(
  cwd: string,
  layers: readonly UpgradeLayer[] = ALL_LAYERS,
  options: { pruneLegacy?: boolean; skipEvents?: boolean } = {},
): UpgradeItem[] {
  return detectUpgradeItems(cwd, layers, options)
}

// 版本门禁：项目依赖仍低于目标 major 时拒绝迁移（v1 CLI 读不懂 v2 配置）
// 只迁移全局面时不涉及项目依赖，直接放行——否则在家目录或非项目目录会被无关的 package.json 拦下
export interface VersionGate {
  ok: boolean
  detail: string
  blocking: boolean
}

export function checkVersionGate(cwd: string, items: readonly UpgradeItem[] = []): VersionGate {
  const touchesProject = items.some((item) => item.layers.includes("project") || item.layers.includes("local"))
  if (items.length > 0 && !touchesProject) {
    return { ok: true, detail: "本次仅迁移全局面，跳过版本门禁", blocking: false }
  }
  const file = join(cwd, "package.json")
  if (!existsSync(file)) return { ok: true, detail: "项目无 package.json，跳过版本门禁", blocking: false }
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(readTextFile(file)) as Record<string, unknown>
  } catch {
    return { ok: true, detail: "package.json 解析失败，跳过版本门禁", blocking: false }
  }
  const dep = ["dependencies", "devDependencies"]
    .map((field) => (pkg[field] && typeof pkg[field] === "object" ? (pkg[field] as Record<string, unknown>)["@fxri/toolkit"] : undefined))
    .find((value) => typeof value === "string")
  if (typeof dep !== "string") return { ok: true, detail: "项目未声明 @fxri/toolkit，跳过版本门禁", blocking: false }
  const matched = /^[~^]?(\d+)\./.exec(dep)
  if (!matched) return { ok: true, detail: `依赖写法「${dep}」不是 semver，跳过版本门禁`, blocking: false }
  const installed = Number(matched[1])
  const target = Number(packageVersion().split(".")[0])
  if (installed < target) {
    return {
      ok: false,
      blocking: true,
      detail: `项目依赖仍为 ${dep}，低于当前 ${packageVersion()}：请先升级依赖再迁移（v1 CLI 读不懂 v2 配置）`,
    }
  }
  return { ok: true, detail: `依赖版本 ${dep} 与当前 ${packageVersion()} 匹配`, blocking: false }
}

// 执行迁移：应用选中项并复检，返回结果与剩余残留
export interface UpgradeRunResult extends UpgradeApplyResult {
  residue: UpgradeItem[]
  tasksDir: string
}

export function runUpgrade(
  cwd: string,
  items: UpgradeItem[],
  options: { layers?: readonly UpgradeLayer[]; pruneLegacy?: boolean; skipEvents?: boolean } = {},
): UpgradeRunResult {
  const tasksDir = tasksDirFor(cwd)
  const scope = options.layers && options.layers.length === 1 && options.layers[0] === "global" ? "global" : "project"
  const applied = applyUpgrade(items, { cwd, tasksDir, scope, pruneLegacy: options.pruneLegacy })
  const residue = verifyUpgrade(cwd, options.layers, { pruneLegacy: options.pruneLegacy, skipEvents: options.skipEvents }).filter(
    (item) => item.status === "planned",
  )
  return { ...applied, residue, tasksDir }
}
