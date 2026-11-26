// 作用域配置文件读写：全局 / 项目 / 本地三层，读-合并-原子写
import { existsSync } from "node:fs"
import { join } from "node:path"
import { getHomeDir } from "../config"
import { readTextFile } from "../read-text"
import { findProjectRoot, isProjectRoot } from "./paths"
import { writeFileAtomic } from "../write-atomic"

// 配置层：全局跨项目、项目层随仓库共享、本地层不入库
export type ConfigLayer = "global" | "project" | "local"

export interface LayerConfigTarget {
  layer: ConfigLayer
  file: string
  // 项目层 / 本地层的项目根；全局层为 null
  root: string | null
  // 是否可写入：项目层 / 本地层需要当前目录位于仓库（.git 或 .tasks）内
  available: boolean
  reason: string
}

// 全局配置文件路径
export function globalConfigPath(): string {
  return join(getHomeDir(), ".toolkitrc.json")
}

// 解析目标层对应的文件与可用性
export function layerConfigTarget(layer: ConfigLayer, startDir = process.cwd()): LayerConfigTarget {
  if (layer === "global") return { layer, file: globalConfigPath(), root: null, available: true, reason: "" }
  const root = findProjectRoot(startDir)
  const usable = isProjectRoot(root)
  const file = join(root, layer === "project" ? ".toolkitrc.json" : ".toolkitrc.local.json")
  return {
    layer,
    file,
    root,
    available: usable,
    reason: usable ? "" : "当前目录不在任何项目内，无法定位项目根",
  }
}

// 读取指定层配置：缺失返回空对象；解析失败抛错，由调用方中止（不静默覆盖）
export function readLayerConfig(layer: ConfigLayer, startDir = process.cwd()): Record<string, unknown> {
  const { file } = layerConfigTarget(layer, startDir)
  if (!existsSync(file)) return {}
  const parsed = JSON.parse(readTextFile(file)) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file} 不是合法的 JSON 对象，请先手动修正`)
  }
  return parsed as Record<string, unknown>
}

// 原子写回指定层：保留其它段，只覆盖本次变更
export function writeLayerConfig(layer: ConfigLayer, config: Record<string, unknown>, startDir = process.cwd()): string {
  const { file } = layerConfigTarget(layer, startDir)
  writeFileAtomic(file, `${JSON.stringify(config, null, 2)}\n`)
  return file
}

// 兼容旧引用：全局层读写
export function readGlobalConfig(): Record<string, unknown> {
  return readLayerConfig("global")
}

export function writeGlobalConfig(config: Record<string, unknown>): void {
  writeLayerConfig("global", config)
}
