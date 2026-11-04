// 升级检查：父进程同步读缓存并提示，缓存不新鲜时派生分离子进程联网刷新（参考 update-notifier 的成熟设计）
// 设计原则：父进程零网络、不阻塞进程退出；任何失败（离线/内网/超时）静默忽略并记负缓存；默认开启且可关闭
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawn } from "node:child_process"
import { fetchLatestVersion, versionGt } from "./version"
import { getConfigSection, getHomeDir } from "./config"
import { readTextFile } from "./read-text"
import { writeFileAtomic } from "./write-atomic"

// 成功检查有效期：24 小时内不重复请求 registry
const CHECK_TTL = 24 * 60 * 60 * 1000
// 失败重试间隔：查询失败后 1 小时内不重试，避免离线环境每条命令都联网
const FAIL_TTL = 60 * 60 * 1000
// 每日 / 每周提示窗口
const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY

// 环境变量名：设为任意「真值」即关闭检查（CI/离线环境可显式关闭）
export const UPDATE_CHECK_ENV = "FX_NO_UPDATE_CHECK"
// 内部 worker 参数：子进程以 `cli.js <该参数>` 启动，只刷新缓存、不执行用户命令
export const UPDATE_CHECK_WORKER_ARG = "--fxri-update-check-worker"

// 展示频率：always 每条命令都提示；daily / weekly 按窗口限频；off 不展示但仍可刷新缓存
export type NotifyFrequency = "always" | "daily" | "weekly" | "off"
// 提示通道：CLI 本体 / 本包内置技能 / 第三方来源技能
export type UpdateChannel = "cli" | "builtin" | "external"

// registry 来源：用于状态展示，避免用户只看到地址却不知道来自哪一层
export type RegistrySource = "config" | "npm_config_registry" | "npmrc-project" | "npmrc-home" | "default"

// registry 解析结果：value 为有效地址，source 为来源层
export interface RegistryInfo {
  value: string
  source: RegistrySource
}

// 缓存记录：lastCheckedAt 为最近一次成功检查；lastFailedAt 为最近一次失败；notifiedAt 按通道 / 来源记录展示时间
interface UpdateCache {
  latest: string
  lastCheckedAt?: number
  lastFailedAt?: number
  notifiedAt: Record<string, number>
}

// 是否为普通对象：配置段读取共用的窄化判据
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

// tmp 缓存文件路径：{tmpdir}/.toolkit-update-check.json（按用户级缓存，跨项目共享）
function cacheFile(): string {
  return join(tmpdir(), ".toolkit-update-check.json")
}

// 旧缓存结构：兼容读取 { ts, ok, latest } 并静默迁移
function parseCache(raw: unknown): UpdateCache | null {
  if (!isRecord(raw)) return null
  const latest = typeof raw.latest === "string" ? raw.latest : ""
  const ts = typeof raw.ts === "number" ? raw.ts : undefined
  const lastCheckedAt =
    typeof raw.lastCheckedAt === "number" ? raw.lastCheckedAt : raw.ok === true && ts !== undefined ? ts : undefined
  const lastFailedAt =
    typeof raw.lastFailedAt === "number" ? raw.lastFailedAt : raw.ok === false && ts !== undefined ? ts : undefined
  const notifiedAt = isRecord(raw.notifiedAt)
    ? Object.fromEntries(Object.entries(raw.notifiedAt).filter(([, value]) => typeof value === "number")) as Record<string, number>
    : {}
  if (!latest && lastCheckedAt === undefined && lastFailedAt === undefined) return null
  return { latest, lastCheckedAt, lastFailedAt, notifiedAt }
}

// 读取缓存：损坏或不存在一律按无缓存处理，不阻塞主流程
function readCache(): UpdateCache | null {
  const file = cacheFile()
  try {
    if (!existsSync(file)) return null
    // 与 config.ts / skills.ts 同口径：走 readTextFile 剥 BOM，避免带 BOM 缓存被误判为损坏
    return parseCache(JSON.parse(readTextFile(file)))
  } catch {
    return null
  }
}

// 写入缓存：失败静默（只读文件系统等场景不影响主流程）
function writeCache(cache: UpdateCache): void {
  try {
    mkdirSync(tmpdir(), { recursive: true })
    writeFileAtomic(cacheFile(), JSON.stringify(cache))
  } catch {
    // 缓存写入失败忽略
  }
}

// 是否需要后台刷新：成功检查过期且没有新鲜失败记录时刷新
function needsRefresh(cache: UpdateCache | null): boolean {
  if (!cache) return true
  const now = Date.now()
  if (cache.lastFailedAt !== undefined && now - cache.lastFailedAt < FAIL_TTL) return false
  if (cache.lastCheckedAt !== undefined && now - cache.lastCheckedAt < CHECK_TTL) return false
  return true
}

// 关闭判定：FX_NO_UPDATE_CHECK 环境变量为真值，或配置文件 updateCheck.enabled === false
function isDisabled(): boolean {
  const v = process.env[UPDATE_CHECK_ENV]
  if (v !== undefined && v !== "") {
    // 与 soft-switch 同口径：0/false/off/no 视为「未关闭」，其余视为关闭
    return !["0", "false", "off", "no"].includes(v.trim().toLowerCase())
  }
  const section = getConfigSection("updateCheck")
  return section?.enabled === false
}

// 版本检查是否启用：供 skills status 展示「已关闭」状态
export function isUpdateCheckEnabled(): boolean {
  return !isDisabled()
}

// CI 判定：0/false/off/no 视为非 CI，与软开关口径一致；供升级提示与 skills.autoLink 共用
export function isCiEnv(): boolean {
  const v = process.env.CI
  if (v === undefined || v === "") return false
  return !["0", "false", "off", "no"].includes(v.trim().toLowerCase())
}

// 频率取值归一：非法值告警并回落上一级默认
function normalizeNotify(value: unknown, fallback: NotifyFrequency, label: string): NotifyFrequency {
  if (value === undefined) return fallback
  if (value === "always" || value === "daily" || value === "weekly" || value === "off") return value
  console.warn(`⚠️ ${label} 取值「${String(value)}」不支持，仅支持 always / daily / weekly / off，已回落 ${fallback}`)
  return fallback
}

// 读取指定通道的展示频率：来源 > 通道 > 全局默认
export function resolveNotify(channel: UpdateChannel, source?: string): NotifyFrequency {
  const section = getConfigSection("updateCheck")
  const global = normalizeNotify(section?.notify, "always", "updateCheck.notify")
  const channels = isRecord(section?.channels) ? section.channels : {}
  if (channel === "external" && source) {
    const sources = isRecord(section?.sources) ? section.sources : {}
    const sourceEntry = isRecord(sources[source]) ? sources[source] : undefined
    if (sourceEntry?.notify !== undefined) return normalizeNotify(sourceEntry.notify, global, `updateCheck.sources.${source}.notify`)
  }
  const key = channel === "cli" ? "cli" : channel === "builtin" ? "builtinSkills" : "externalSkills"
  const channelEntry = isRecord(channels[key]) ? channels[key] : undefined
  if (channelEntry?.notify !== undefined) {
    // builtinSkills 的 inherit 表示继承全局频率，是否提示另由 shouldShowUpdateHint 判断
    if (channelEntry.notify === "inherit") return global
    return normalizeNotify(channelEntry.notify, global, `updateCheck.channels.${key}.notify`)
  }
  return global
}

// builtinSkills 是否使用 inherit（默认）：CLI 已落后时由 CLI 提示覆盖，避免重复
function builtinInherit(): boolean {
  const section = getConfigSection("updateCheck")
  const channels = isRecord(section?.channels) ? section.channels : {}
  const entry = isRecord(channels.builtinSkills) ? channels.builtinSkills : undefined
  return entry?.notify === undefined || entry.notify === "inherit"
}

// 读取 .npmrc 的 registry= 行：不存在或非法返回 undefined
function readNpmrcRegistry(file: string): string | undefined {
  try {
    if (!existsSync(file)) return undefined
    for (const line of readTextFile(file).split(/\r?\n/)) {
      const match = line.match(/^\s*registry\s*=\s*(.+?)\s*$/)
      if (match?.[1]) return match[1].replace(/^["']|["']$/g, "")
    }
  } catch {
    // .npmrc 不可读按未命中处理
  }
  return undefined
}

// 读取 .npmrc 中与 registry host 匹配的 _authToken
function readNpmrcToken(file: string, host: string): string | undefined {
  try {
    if (!existsSync(file)) return undefined
    for (const line of readTextFile(file).split(/\r?\n/)) {
      const match = line.match(/^\s*\/\/([^/]+)\/:_authToken\s*=\s*(.+?)\s*$/)
      if (match?.[1] === host && match[2]) return match[2].replace(/^["']|["']$/g, "")
    }
  } catch {
    // .npmrc 不可读按未命中处理
  }
  return undefined
}

// 是否为合法 http(s) 地址
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

// 剥离 URL 中的账号密码：命中时告警，返回清理后的地址
function stripUserinfo(value: string, label: string): string | null {
  try {
    const url = new URL(value)
    if (url.username || url.password) {
      console.warn(`⚠️ ${label} 含账号密码，已忽略并使用匿名地址`)
      url.username = ""
      url.password = ""
    }
    return url.toString()
  } catch {
    return null
  }
}

// 规范化 registry 地址：保证末尾有斜杠，便于拼接包路径
function normalizeRegistry(value: string): string {
  return value.endsWith("/") ? value : `${value}/`
}

// 解析有效 registry：配置 > npm_config_registry > 项目 .npmrc > 家目录 .npmrc > 默认
export function resolveRegistry(): RegistryInfo {
  const configured = getConfigSection("updateCheck")?.registry
  if (typeof configured === "string" && configured.trim()) {
    const cleaned = stripUserinfo(configured.trim(), "updateCheck.registry")
    if (cleaned && isHttpUrl(cleaned)) return { value: normalizeRegistry(cleaned), source: "config" }
    console.warn(`⚠️ updateCheck.registry 取值「${configured}」不是合法 http(s) 地址，已回落下一级`)
  }
  const envRegistry = process.env.npm_config_registry
  if (envRegistry) {
    const cleaned = stripUserinfo(envRegistry, "npm_config_registry")
    if (cleaned && isHttpUrl(cleaned)) return { value: normalizeRegistry(cleaned), source: "npm_config_registry" }
  }
  const project = readNpmrcRegistry(join(process.cwd(), ".npmrc"))
  if (project && isHttpUrl(project)) return { value: normalizeRegistry(project), source: "npmrc-project" }
  const home = readNpmrcRegistry(join(getHomeDir(), ".npmrc"))
  if (home && isHttpUrl(home)) return { value: normalizeRegistry(home), source: "npmrc-home" }
  return { value: "https://registry.npmjs.org/", source: "default" }
}

// 构造 registry 的 latest 查询地址：支持带路径前缀的私有 registry
export function buildRegistryUrl(registry: string): string {
  return new URL("@fxri%2Ftoolkit/latest", normalizeRegistry(registry)).toString()
}

// 解析认证 token：NPM_TOKEN 优先，其次项目 / 家目录 .npmrc 中与 host 匹配的 _authToken
function resolveAuthToken(registry: string): string | undefined {
  if (process.env.NPM_TOKEN) return process.env.NPM_TOKEN
  try {
    const host = new URL(registry).host
    return readNpmrcToken(join(process.cwd(), ".npmrc"), host) ?? readNpmrcToken(join(getHomeDir(), ".npmrc"), host)
  } catch {
    return undefined
  }
}

// 读取缓存中的最新版本：零网络，含过期但成功的历史值
export function readCachedLatest(): string | null {
  if (isDisabled()) return null
  const latest = readCache()?.latest
  return latest ? latest : null
}

// 内置技能提示频率展示：默认 / 显式 inherit 时返回 inherit，便于 status 如实展示
export function resolveBuiltinNotifyLabel(): string {
  const section = getConfigSection("updateCheck")
  const channels = isRecord(section?.channels) ? section.channels : {}
  const entry = isRecord(channels.builtinSkills) ? channels.builtinSkills : undefined
  if (entry?.notify === undefined || entry.notify === "inherit") return "inherit"
  return resolveNotify("builtin")
}

// 提示频率来源：供 versionStatus 区分「来源覆盖 / 通道 / 全局默认」
export function resolveNotifySource(channel: UpdateChannel, source?: string): "source" | "channel" | "global" {
  const section = getConfigSection("updateCheck")
  const channels = isRecord(section?.channels) ? section.channels : {}
  if (channel === "external" && source) {
    const sources = isRecord(section?.sources) ? section.sources : {}
    const sourceEntry = isRecord(sources[source]) ? sources[source] : undefined
    if (sourceEntry?.notify !== undefined) return "source"
  }
  const key = channel === "cli" ? "cli" : channel === "builtin" ? "builtinSkills" : "externalSkills"
  const channelEntry = isRecord(channels[key]) ? channels[key] : undefined
  return channelEntry?.notify !== undefined && channelEntry.notify !== "inherit" ? "channel" : "global"
}

// 提示闸门：关闭、真实 CI、npm script、通道频率未到、内置技能 inherit 且 CLI 已落后，任一命中即不提示
export function shouldShowUpdateHint(channel: UpdateChannel, currentVersion: string, source?: string, cliVersion = currentVersion): boolean {
  if (isDisabled()) return false
  if (isCiEnv()) return false
  if (process.env.npm_lifecycle_event) return false
  const latest = readCachedLatest()
  if (!latest) return false
  if (channel === "builtin" && builtinInherit() && versionGt(latest, cliVersion)) return false
  const frequency = resolveNotify(channel, source)
  if (frequency === "off") return false
  if (frequency === "always") return true
  const key = channel === "external" && source ? `source:${source}` : channel
  const last = readCache()?.notifiedAt[key] ?? 0
  return Date.now() - last >= (frequency === "daily" ? DAY : WEEK)
}

// 记录本次展示时间：always 不写盘，daily / weekly 才需要节流
export function markNotified(channel: UpdateChannel, source?: string): void {
  const frequency = resolveNotify(channel, source)
  if (frequency === "always" || frequency === "off") return
  const cache = readCache()
  if (!cache) return
  cache.notifiedAt[channel === "external" && source ? `source:${source}` : channel] = Date.now()
  writeCache(cache)
}

// 统一提示文案：一句话，不输出 JSON
export function formatUpdateHint(latest: string, current: string): string {
  return `提示：toolkit ${latest} 可用（当前 ${current}），运行 pnpm add -g @fxri/toolkit 升级后请开新会话。`
}

// 派生后台 worker：detached + stdio ignore + unref，父进程照常退出、子进程独立完成刷新
function spawnUpdateCheckWorker(): void {
  const entry = process.argv[1]
  if (!entry) return
  try {
    const child = spawn(process.execPath, [entry, UPDATE_CHECK_WORKER_ARG], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    })
    child.unref()
  } catch {
    // 派生失败忽略：升级检查不阻塞主流程
  }
}

// 缓存不新鲜时派生后台刷新；父进程不联网
function refreshCacheIfNeeded(): void {
  if (isDisabled()) return
  if (needsRefresh(readCache())) spawnUpdateCheckWorker()
}

// 后台 worker：联网拉取最新版本并写缓存；失败保留上次成功版本，只更新失败时间
export async function runUpdateCheckWorker(): Promise<void> {
  const cached = readCache()
  const registry = resolveRegistry()
  const fetched = await fetchLatestVersion(buildRegistryUrl(registry.value), resolveAuthToken(registry.value)).catch(() => null)
  writeCache({
    latest: fetched ?? cached?.latest ?? "",
    lastCheckedAt: fetched ? Date.now() : cached?.lastCheckedAt,
    lastFailedAt: fetched ? cached?.lastFailedAt : Date.now(),
    notifiedAt: cached?.notifiedAt ?? {},
  })
}

// 判断当前命令是否跳过文本提示：帮助 / 裸命令 / skills path / skills status / changelog 透传 / JSON 输出
function shouldSkipHint(argv: string[]): boolean {
  if (argv.length === 0) return true
  if (argv.includes("-h") || argv.includes("--help")) return true
  if (argv[0] === "help") return true
  if (argv[0] === "skills" && argv[1] === "path") return true
  if (argv[0] === "skills" && argv[1] === "status") return true
  if (argv[0] === "changelog" && !["version", "format", "doc"].includes(argv[1] ?? "")) return true
  return hasJsonFormat(argv)
}

// 是否显式要求 JSON 输出：`--format json` 或 `--format=json`
function hasJsonFormat(argv: string[]): boolean {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--format=json") return true
    if (argv[i] === "--format" && argv[i + 1] === "json") return true
  }
  return false
}

// 技能更新提示：由 CLI 侧从状态文件算出，交给统一提示器合并成一行
export interface SkillAlert {
  channel: "builtin" | "external"
  source?: string
  name: string
  current: string
  latest: string
}

// 合并 CLI 与技能提示：固定一句话，来源超过 3 个折叠
function formatCombinedHint(current: string, cliLatest: string | null, alerts: SkillAlert[]): string {
  const facts: string[] = []
  if (cliLatest) facts.push(`toolkit ${cliLatest} 可用（当前 ${current}）`)
  if (alerts.length > 0) {
    const names = alerts.slice(0, 3).map((alert) => `${alert.name} ${alert.current ? `${alert.current} → ` : ""}${alert.latest}`)
    facts.push(`技能 ${names.join("、")}${alerts.length > 3 ? ` 等 ${alerts.length} 个技能` : ""} 可更新`)
  }
  const actions: string[] = []
  if (cliLatest) actions.push("运行 pnpm add -g @fxri/toolkit 升级后请开新会话")
  if (alerts.length > 0) actions.push("运行 toolkit skills install 更新后请开新会话")
  return `提示：${facts.join("；")}，${actions.join("；")}。`
}

// 命令收口提示：只在成功时输出；帮助 / 裸命令 / JSON / 透传跳过；TTY 走 stderr，非 TTY 走 stdout
export function emitVersionHint(currentVersion: string, options: { argv: string[]; exitCode: number; skillAlerts?: SkillAlert[] }): void {
  refreshCacheIfNeeded()
  if (options.exitCode !== 0) return
  if (shouldSkipHint(options.argv)) return
  const latest = readCachedLatest()
  const cliOutdated = latest !== null && versionGt(latest, currentVersion) && shouldShowUpdateHint("cli", currentVersion)
  const alerts = (options.skillAlerts ?? []).filter((alert) =>
    shouldShowUpdateHint(alert.channel, alert.current, alert.source, currentVersion),
  )
  if (!cliOutdated && alerts.length === 0) return
  const line = formatCombinedHint(currentVersion, cliOutdated ? latest : null, alerts)
  const stderrOnly =
    options.argv.includes("--version") ||
    options.argv.includes("-v") ||
    options.argv.includes("--check") ||
    options.argv.includes("--export")
  if (stderrOnly || process.stdout.isTTY) console.error(line)
  else console.log(line)
  if (cliOutdated) markNotified("cli")
  for (const alert of alerts) markNotified(alert.channel, alert.source)
}

// 兼容旧入口：父进程同步读缓存并在 stderr 提示 CLI 更新，同时刷新缓存
export function startUpdateCheck(currentVersion: string): void {
  refreshCacheIfNeeded()
  const latest = readCachedLatest()
  if (latest && versionGt(latest, currentVersion) && shouldShowUpdateHint("cli", currentVersion)) {
    console.error(formatUpdateHint(latest, currentVersion))
    markNotified("cli")
  }
}
