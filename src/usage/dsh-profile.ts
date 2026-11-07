// DeepSeek Harness（dsh）profile 补丁维护：在 cordis.patch.yml 写入官方 CC 桥接插件条目
// 补丁文件是顶层 YAML 数组，本包只维护标记块内的一个列表项，其余内容原样保留
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, isAbsolute, join } from "node:path"
import { getHomeDir } from "../config"
import { writeFileAtomic } from "../write-atomic"

// 默认桥接插件：官方版 peer 依赖停在 0.0.1，与 dsh 0.2.x 不兼容，默认用社区实现
export const DSH_BRIDGE_PLUGIN = "@dsh-cc/hooks-claude-code"
// 已知桥接插件：按顺序取第一个已安装的，官方版恢复兼容后可自动切回
export const DSH_BRIDGE_PLUGINS = ["@deepseek-ai/dsh-hooks-claude-code", DSH_BRIDGE_PLUGIN]
// 标记块边界：注释行不参与 YAML 结构，便于精确定位与删除
export const DSH_BLOCK_START = "# >>> toolkit usage hooks（由 toolkit 维护，勿手改）"
export const DSH_BLOCK_END = "# <<< toolkit usage hooks"
// 插件条目 id：与用户自建的同名插件条目区分，互不覆盖
const DSH_BLOCK_ID = "toolkit-usage-hooks"
// UTF-8 BOM：写回时按原文件形态保留
const BOM = "\uFEFF"

// dsh 家目录：DSH_HOME 可为绝对路径或相对 home 的目录名
export function dshHome(): string {
  const env = process.env.DSH_HOME
  if (env) return isAbsolute(env) ? env : join(getHomeDir(), env)
  return join(getHomeDir(), ".dsh")
}

// 本包写入的 Hook 文件：桥接插件的 configPath 指向此处
export function dshHooksFile(): string {
  return join(dshHome(), "hooks.json")
}

// 已存在的 profile 目录：只认带 cordis.patch.yml 的目录，避免凭空创建
export function listDshProfiles(): string[] {
  const root = join(dshHome(), "profiles")
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "cordis.patch.yml")))
    .map((entry) => join(root, entry.name))
    .sort()
}

// 行尾形态：按原文件保留，避免整文件 diff
function detectEol(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n"
}

// 拆行：先归一换行，末尾换行保留为空串元素
function toLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n")
}

// 标记块内容：新增插件须用 insert 列表，否则补丁只覆盖已存在的 id、不会插入
// 路径统一正斜杠并用单引号包裹，避免 Windows 反斜杠触发 YAML 转义
function renderBlock(configPath: string, plugin: string): string[] {
  const value = configPath.replace(/\\/g, "/").replace(/'/g, "''")
  return [
    DSH_BLOCK_START,
    "- insert:",
    `    - id: ${DSH_BLOCK_ID}`,
    `      name: "${plugin}"`,
    "      config:",
    `        configPath: '${value}'`,
    DSH_BLOCK_END,
  ]
}

// 从指定行起找下一个顶层列表项或空数组标记：标记块损坏时据此划定替换边界
function nextTopLevelItem(lines: string[], from: number): number {
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    if (/^-\s/.test(line) || line.trim() === "[]") return index
  }
  return -1
}

// 是否已写入本包标记块
export function hasToolkitBlock(text: string): boolean {
  return text.includes(DSH_BLOCK_START)
}

// 插入或更新标记块：已存在则原位替换，文件内只有 [] 时替换空数组，否则追加到末尾
export function upsertToolkitBlock(text: string, configPath: string, plugin = DSH_BRIDGE_PLUGIN): string {
  const eol = detectEol(text)
  const lines = toLines(text)
  const block = renderBlock(configPath, plugin)
  const start = lines.indexOf(DSH_BLOCK_START)
  if (start >= 0) {
    const end = lines.indexOf(DSH_BLOCK_END, start)
    if (end > start) return [...lines.slice(0, start), ...block, ...lines.slice(end + 1)].join(eol)
    const nextItem = nextTopLevelItem(lines, start + 1)
    return [...lines.slice(0, start), ...block, ...(nextItem < 0 ? [] : lines.slice(nextItem))].join(eol)
  }
  const emptyArray = lines.findIndex((line) => line.trim() === "[]")
  if (emptyArray >= 0) return [...lines.slice(0, emptyArray), ...block, ...lines.slice(emptyArray + 1)].join(eol)
  while (lines.length > 0 && (lines[lines.length - 1] ?? "").trim() === "") lines.pop()
  const separator = lines.length > 0 ? [""] : []
  return [...lines, ...separator, ...block, ""].join(eol)
}

// 删除标记块：块后若已无列表项则补回 []，保证补丁文件仍是合法的 YAML 数组
export function removeToolkitBlock(text: string): string {
  const eol = detectEol(text)
  const lines = toLines(text)
  const start = lines.indexOf(DSH_BLOCK_START)
  if (start < 0) return text
  const end = lines.indexOf(DSH_BLOCK_END, start)
  const nextItem = end > start ? end + 1 : nextTopLevelItem(lines, start + 1)
  const stop = nextItem < 0 ? lines.length : nextItem
  const rest = [...lines.slice(0, start), ...lines.slice(stop)]
  const hasItem = rest.some((line) => /^-\s/.test(line) || line.trim() === "[]")
  if (!hasItem) {
    while (rest.length > 0 && (rest[rest.length - 1] ?? "").trim() === "") rest.pop()
    rest.push("[]", "")
  }
  return rest.join(eol)
}

// 读补丁文件：保留 BOM 形态，供写回时还原
function readPatchFile(file: string): { text: string; bom: boolean } {
  const raw = readFileSync(file, "utf8")
  return { text: raw.startsWith(BOM) ? raw.slice(1) : raw, bom: raw.startsWith(BOM) }
}

// 写入补丁文件：内容未变化时不落盘，按原 BOM 形态还原
function writePatchFile(file: string, text: string, bom: boolean): boolean {
  const current = readPatchFile(file)
  const next = `${bom ? BOM : ""}${text}`
  if (next === `${current.bom ? BOM : ""}${current.text}`) return false
  writeFileAtomic(file, next)
  return true
}

// 补丁文本是否为顶层数组：跳过空行与注释后，首条有效行须为列表项或空数组标记
function isTopLevelArrayText(text: string): boolean {
  for (const line of toLines(text)) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue
    return trimmed === "[]" || trimmed.startsWith("- ")
  }
  return true
}

// 读取 profile 的补丁文件内容：文件不存在按空串
export function readProfilePatch(profileDir: string): string {
  const file = join(profileDir, "cordis.patch.yml")
  if (!existsSync(file)) return ""
  return readPatchFile(file).text
}

// 补丁文件是否为顶层数组：dsh 只接受数组形态，其它结构下追加列表项会写出非法 YAML
export function profilePatchIsArray(profileDir: string): boolean {
  const file = join(profileDir, "cordis.patch.yml")
  if (!existsSync(file)) return false
  return isTopLevelArrayText(readPatchFile(file).text)
}

// 是否已写入本包标记块
export function profileHasToolkitBlock(profileDir: string): boolean {
  return hasToolkitBlock(readProfilePatch(profileDir))
}

// 写入或更新标记块：返回是否真的改动文件；dryRun 只计算不落盘
export function writeToolkitBlock(profileDir: string, configPath: string, dryRun = false, plugin = DSH_BRIDGE_PLUGIN): boolean {
  const file = join(profileDir, "cordis.patch.yml")
  if (!existsSync(file)) return false
  const { text, bom } = readPatchFile(file)
  // 非顶层数组结构直接跳过，避免把用户文件写成非法 YAML
  if (!isTopLevelArrayText(text)) return false
  const next = upsertToolkitBlock(text, configPath, plugin)
  if (next === text) return false
  if (!dryRun) writePatchFile(file, next, bom)
  return true
}

// 删除标记块：返回是否真的改动文件
export function removeToolkitBlockFromProfile(profileDir: string): boolean {
  const file = join(profileDir, "cordis.patch.yml")
  if (!existsSync(file)) return false
  const { text, bom } = readPatchFile(file)
  const next = removeToolkitBlock(text)
  if (next === text) return false
  writePatchFile(file, next, bom)
  return true
}

// profile 已安装的桥接插件：按已知清单顺序取第一个，缺省返回 undefined
export function profileBridgePlugin(profileDir: string): string | undefined {
  const file = join(profileDir, "package.json")
  if (!existsSync(file)) return undefined
  try {
    const data = JSON.parse(readFileSync(file, "utf8").replace(BOM, "")) as { dependencies?: Record<string, unknown> }
    const dependencies = data.dependencies ?? {}
    return DSH_BRIDGE_PLUGINS.find((name) => Object.prototype.hasOwnProperty.call(dependencies, name))
  } catch {
    return undefined
  }
}

// profile 是否已安装桥接插件
export function profileHasBridgePlugin(profileDir: string): boolean {
  return profileBridgePlugin(profileDir) !== undefined
}

// profile 名：告警里用短名，命令提示才方便复制
export function profileName(profileDir: string): string {
  return basename(profileDir)
}
