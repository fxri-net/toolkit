// 配置键读写：config list / get / set / unset 的落盘与取数实现
// 读：按三层加载结果取合并值与来源层；写：按层定位配置文件、只改目标叶子、写前备份、写后重置缓存
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  CONFIG_ENV_OVERRIDES,
  CONFIG_LOCAL_FILE,
  CONFIG_PROJECT_FILE,
  getHomeDir,
  inspectConfigLayers,
  isGlobalConfigPath,
  resetToolkitConfigCache,
  type ConfigLayers,
} from "./config"
import { readTextFile } from "./read-text"
import { findProjectRoot, isHomeDirectory, isProjectRoot } from "./scope/paths"
import { writeFileAtomic } from "./write-atomic"
import type { ConfigKeyLayer } from "./config-keys"

// 单键现场：value 为合并后的生效值（未写入为 undefined），source 为离生效值最近的显式写出层
export interface ConfigKeyState {
  key: string
  value: unknown
  source: ConfigKeyLayer | null
  // 各层文件里显式写出的值（未写为 undefined）
  layers: Record<ConfigKeyLayer, unknown>
  // 命中该键的环境变量名（未命中为 undefined）
  env?: string
}

// 写入结果：file 为实际落盘文件，previous 为同键旧值（未写为 undefined）
export interface ConfigWriteResult {
  file: string
  previous: unknown
}

// 普通对象判定：数组与 null 不算配置段 / 字段对象
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 按点分路径读取叶子：路径上出现非对象即视为未写
function readAtPath(config: Record<string, unknown> | null, path: string[]): unknown {
  let current: unknown = config
  for (const segment of path) {
    if (!isPlainObject(current)) return undefined
    current = current[segment]
  }
  return current === null ? undefined : current
}

// 显式写出判定：null 与 undefined 均按未写处理，与配置加载的叶子有效性口径一致
function writtenAt(config: Record<string, unknown> | null, path: string[]): unknown {
  const value = readAtPath(config, path)
  return value === undefined ? undefined : value
}

// 取单键现场：生效值来自三层合并结果，来源层按「本地层 → 项目层 → 全局层」就近归属
export function readConfigKey(key: string, cwd = process.cwd()): ConfigKeyState {
  return readConfigKeyFromLayers(key, inspectConfigLayers(cwd))
}

// 取单键现场（已加载三层时使用）：批量读取只加载一次配置，避免逐键重复读盘
export function readConfigKeyFromLayers(key: string, layers: ConfigLayers): ConfigKeyState {
  const path = key.split(".")
  const local = writtenAt(layers.local.config, path)
  const project = writtenAt(layers.project.config, path)
  const global = writtenAt(layers.global.config, path)
  const merged = readAtPath(layers.merged, path)
  let source: ConfigKeyLayer | null = null
  if (merged !== undefined) {
    if (local !== undefined) source = "local"
    else if (project !== undefined) source = "project"
    else if (global !== undefined) source = "global"
  }
  const env = CONFIG_ENV_OVERRIDES.find((item) => item.key === key)?.env
  return {
    key,
    value: merged,
    source,
    layers: { global, project, local },
    env: env !== undefined && (process.env[env] ?? "") !== "" ? env : undefined,
  }
}

// 批量取键现场：loader 可注入以便测试断言只加载一次
export function readConfigKeys(
  keys: string[],
  cwd = process.cwd(),
  loader: (startDir: string) => ConfigLayers = inspectConfigLayers,
): Record<string, ConfigKeyState> {
  const layers = loader(cwd)
  const out: Record<string, ConfigKeyState> = {}
  for (const key of keys) out[key] = readConfigKeyFromLayers(key, layers)
  return out
}

// 判断项目根是否具备项目标志（git / 项目配置 / 项目产物）：供写入项目层 / 本地层前提示
export function configLayerInRepo(cwd = process.cwd()): boolean {
  return isProjectRoot(findProjectRoot(cwd))
}

// 定位某层的配置文件：已命中的就近文件优先，否则落到该层默认位置
export function configFileForLayer(layer: ConfigKeyLayer, cwd = process.cwd()): string {
  if (layer === "global") return join(getHomeDir(), ".toolkitrc.json")
  const layers = inspectConfigLayers(cwd)
  const hit = layer === "project" ? layers.project.file : layers.local.file
  if (hit) return hit
  const file = layer === "project" ? CONFIG_PROJECT_FILE : CONFIG_LOCAL_FILE
  return join(findProjectRoot(cwd), file)
}

// 非全局层写入守卫：家目录不作为项目根，且项目 / 本地层不得落到全局文件（避免把全局配置当项目配置改写）
export function assertConfigLayerWritable(layer: ConfigKeyLayer, cwd = process.cwd()): void {
  if (layer === "global") return
  const label = layer === "project" ? "项目层" : "本地层"
  if (isHomeDirectory(cwd)) {
    throw new Error(`家目录不作为项目根，不能写入${label}配置：请进入项目目录，或改用 --layer global`)
  }
  const file = configFileForLayer(layer, cwd)
  if (isGlobalConfigPath(file)) {
    throw new Error(`${label}配置不能写入全局文件 ${file}：请进入项目目录，或改用 --layer global`)
  }
}

// 读取配置文件根对象：不存在返回空对象；解析失败或顶层非对象直接报错（不覆盖用户配置）
function readConfigRoot(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(readTextFile(file))
  } catch {
    throw new Error(`配置文件 JSON 解析失败，未写入：${file}`)
  }
  if (!isPlainObject(parsed)) throw new Error(`配置文件顶层须为对象，未写入：${file}`)
  return parsed
}

// 落盘：写前备份同目录 .bak，原子写入，写后重置配置缓存使后续读取立即生效
function persist(file: string, root: Record<string, unknown>): void {
  if (existsSync(file)) copyFileSync(file, `${file}.bak`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileAtomic(file, `${JSON.stringify(root, null, 2)}\n`)
  resetToolkitConfigCache()
}

// 写单键：路径上中间层非对象时报错而非静默覆盖，其余段与字段原样保留
export function writeConfigKey(layer: ConfigKeyLayer, key: string, value: unknown, cwd = process.cwd()): ConfigWriteResult {
  assertConfigLayerWritable(layer, cwd)
  const file = configFileForLayer(layer, cwd)
  const root = readConfigRoot(file)
  const path = key.split(".")
  const previous = readAtPath(root, path)
  let current: Record<string, unknown> = root
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index] as string
    const next = current[segment]
    if (next === undefined) {
      const created: Record<string, unknown> = {}
      current[segment] = created
      current = created
      continue
    }
    if (!isPlainObject(next)) {
      throw new Error(`配置段「${path.slice(0, index + 1).join(".")}」不是对象，无法写入；请先手工修正 ${file}`)
    }
    current = next
  }
  current[path[path.length - 1] as string] = value
  persist(file, root)
  return { file, previous }
}

// 删单键：删除后逐级回收空对象与空段，避免留下 {} 残壳；键本就不存在时不写盘
export function unsetConfigKey(layer: ConfigKeyLayer, key: string, cwd = process.cwd()): ConfigWriteResult & { removed: boolean } {
  assertConfigLayerWritable(layer, cwd)
  const file = configFileForLayer(layer, cwd)
  if (!existsSync(file)) return { file, previous: undefined, removed: false }
  const root = readConfigRoot(file)
  const path = key.split(".")
  const previous = readAtPath(root, path)
  if (previous === undefined) return { file, previous: undefined, removed: false }
  const chain: Array<Record<string, unknown>> = [root]
  let current: Record<string, unknown> = root
  for (let index = 0; index < path.length - 1; index += 1) {
    const next = current[path[index] as string]
    if (!isPlainObject(next)) break
    current = next
    chain.push(current)
  }
  delete current[path[path.length - 1] as string]
  // 自底向上回收空对象：只删本次路径上的空壳，不动其它段
  for (let index = chain.length - 1; index > 0; index -= 1) {
    if (Object.keys(chain[index] as Record<string, unknown>).length > 0) break
    delete (chain[index - 1] as Record<string, unknown>)[path[index - 1] as string]
  }
  persist(file, root)
  return { file, previous, removed: true }
}
