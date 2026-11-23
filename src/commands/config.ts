// config 命令：三层配置的唯一写入口（list / get / set / unset）与只读体检（status）
import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"
import type { Command } from "commander"
import { configStatus, foldHome, type ConfigStatusReport } from "../config-status"
import type { LocalConfigIgnoreState } from "../git-ignore"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { readConfigKey, readConfigKeys, configFileForLayer, configLayerInRepo, unsetConfigKey, writeConfigKey } from "../config-edit"
import {
  CONFIG_KEYS,
  CONFIG_LAYER_LABELS,
  configKeyTypeLabel,
  getConfigKey,
  isConfigLayer,
  parseConfigValue,
  suggestConfigKeys,
  type ConfigKeyLayer,
  type ConfigKeySpec,
} from "../config-keys"
import { INTERACTIVE_EXIT } from "../prompts"
import { printJson } from "./shared"
import { line } from "../term-style"

// 文本模式的取值渲染：数组用顿号连接，敏感值打码，未写给出「未配置（默认 X）」
function renderScalar(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? "[]" : value.join("、")
  return String(value)
}

// 取值文案：reveal 为真时敏感值输出原文；未写时展示元数据里的默认值
function renderValue(spec: ConfigKeySpec, value: unknown, reveal = false): string {
  if (value === undefined) {
    return spec.default === undefined ? "未配置" : `未配置（默认 ${renderScalar(spec.default)}）`
  }
  if (spec.sensitive && !reveal) return "***（敏感值，加 --reveal 输出原文）"
  return renderScalar(value)
}

// JSON 取值：敏感值默认同样打码，避免 --format json 把带 token 的端点写进 CI 日志
function jsonValue(spec: ConfigKeySpec, value: unknown, reveal: boolean): unknown {
  if (spec.sensitive && !reveal && value !== undefined) return "***"
  return value
}

// 来源层展示：未写为「默认值」
function renderSource(layer: ConfigKeyLayer | null): string {
  return layer === null ? "默认值" : CONFIG_LAYER_LABELS[layer]
}

// 层参数解析：未传返回 undefined；非法取值告警并置退出码，返回 null 由调用方中止
function resolveLayerOption(options: { layer?: string }): ConfigKeyLayer | undefined | null {
  if (options.layer === undefined) return undefined
  if (!isConfigLayer(options.layer)) {
    console.error(`⚠️ --layer 取值须为 global / project / local（实际：${options.layer}）`)
    process.exitCode = 1
    return null
  }
  return options.layer
}

// 查找起点解析：未传返回 undefined（各函数回落运行目录）；非法路径报错并返回 null，不静默回落
function resolveCwdOption(options: { cwd?: string }): string | undefined | null {
  if (options.cwd === undefined) return undefined
  const cwd = resolve(options.cwd)
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    console.error(`⚠️ --cwd 指向的路径不存在或非目录：${options.cwd}`)
    process.exitCode = 1
    return null
  }
  return cwd
}

// 非仓库目录写入提示：不阻断脚本，但要让人知道文件会落到当前目录
function warnOutsideRepo(layer: ConfigKeyLayer, cwd: string | undefined): void {
  if (layer === "global" || configLayerInRepo(cwd)) return
  const file = configFileForLayer(layer, cwd)
  console.warn(`⚠️ 当前目录不在任何仓库内（缺少 .git / .tasks），${CONFIG_LAYER_LABELS[layer]}配置将写入 ${foldHome(file)}`)
}

// 未知键告警：附最接近的候选，便于直接改正拼写
function rejectUnknownKey(key: string): void {
  const suggestions = suggestConfigKeys(key)
  const hint = suggestions.length > 0 ? `，是否想用 ${suggestions.join(" / ")}` : "，可用 toolkit config list 查看可写键"
  console.error(`⚠️ 未知配置键「${key}」${hint}`)
  process.exitCode = 1
}

// 写操作确认：非 TTY 下必须显式 --yes，避免脚本 / CI 里意外落盘（与其它写确认命令同退 2）
function needsYes(options: { yes?: boolean }): boolean {
  if (options.yes) return false
  if (process.stdin.isTTY) return false
  console.error("⚠️ 非交互环境写入配置须显式加 --yes（或先用 --dry-run 预览）")
  process.exitCode = INTERACTIVE_EXIT
  return true
}

// 注册 config 命令：装配点只负责按序调用
export function registerConfigCommands(program: Command): void {
  // 本地配置文件忽略状态的文本态文案（键集合与 src/git-ignore.ts 的 LocalConfigIgnoreState 对齐）
  const CONFIG_IGNORE_LABEL: Record<LocalConfigIgnoreState, string> = {
    ignored: "已忽略",
    tracked: "已跟踪（需 git rm --cached）",
    "not-ignored": "未忽略",
    "not-a-repo": "不适用（非 git 仓库）",
    "outside-repo": "不适用（位于仓库工作树之外）",
    unavailable: "忽略判定不可用",
  }

  // 打印配置分层报告：先给一句话结论，再列三层现场 / 展示键来源 / 环境变量层 / 能力旁路 / 其余已配置段 / 待处理项
  // 一律不打印配置值（redact 段含个人脱敏规则、skills 段含本机路径，落到终端 / CI 日志即外泄）
  // 路径一律走 foldHome / foldHomeInText 折叠为 ~（层级路径与待处理项文案内嵌的路径同等处理），避免共享日志泄露本机目录结构
  function printConfigStatus(report: ConfigStatusReport): void {
    console.log(report.summary)
    console.log(`查找起点：${foldHome(report.cwd)}`)
    console.log("")
    console.log("层级：")
    for (const level of report.levels) {
      const file = level.file === null ? "无" : foldHome(level.file)
      const ignore = level.ignored === null ? "" : `，${CONFIG_IGNORE_LABEL[level.ignored.state]}`
      console.log(`  ${level.layer}：${file}${ignore}`)
    }
    console.log("")
    console.log("展示键来源：")
    for (const item of report.displayKeys) console.log(`  ${item.key}：${item.source ?? "默认值"}`)
    console.log("")
    const pairs = (hits: Array<{ env: string; key: string }>) => (hits.length > 0 ? hits.map((h) => `${h.env} → ${h.key}`).join("、") : "无")
    console.log(`环境变量层：${pairs(report.env)}`)
    console.log(`能力旁路：${pairs(report.bypass)}`)
    console.log("")
    const groups = report.levels.filter((level) => level.otherSections.length > 0)
    if (groups.length === 0) {
      console.log("其余已配置段：无")
    } else {
      console.log("其余已配置段：")
      for (const level of groups) console.log(`  ${level.layer}：${level.otherSections.join("、")}`)
    }
    console.log("")
    if (report.items.length === 0) {
      console.log(line.ok("无待处理项"))
      return
    }
    for (const item of report.items) console.log(`${item.level === "warn" ? "⚠️" : "·"} [${item.scope}] ${item.message}`)
  }

  // config 域：唯一配置写入口 + 三层只读体检（载体细则见 docs/config.md）
  const configCmd = program
    .command("config")
    .description("配置：list / get / set / unset 唯一写入口，另有 status 只读体检三层配置文件")

  // 枚举可写键：默认给三层合并后的生效值与来源层；--layer 只看该层可写的键与该层写入值
  configCmd
    .command("list")
    .description("列出可写配置键：生效值与来源层（--layer 只看该层可写键）")
    .option("--layer <layer>", "只看指定层：global / project / local")
    .option("--cwd <path>", "查找起点（缺省当前工作目录）")
    .option("--reveal", "输出敏感值原文（默认打码）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { layer?: string; cwd?: string; reveal?: boolean; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const layer = resolveLayerOption(options)
      if (layer === null) return
      const cwd = resolveCwdOption(options)
      if (cwd === null) return
      const reveal = Boolean(options.reveal)
      // 指定层时只列该层可写的键，避免列出写入必然报错的键
      const specs = CONFIG_KEYS.filter((spec) => layer === undefined || spec.writableLayers.includes(layer))
      const states = readConfigKeys(
        specs.map((spec) => spec.key),
        cwd,
      )
      const rows = specs.map((spec) => {
        const state = states[spec.key]!
        const value = layer === undefined ? state.value : state.layers[layer]
        const source = layer === undefined ? state.source : value === undefined ? null : layer
        return { spec, key: spec.key, type: spec.type, summary: spec.summary, value, source }
      })
      if (options.format === "json") {
        printJson(
          jsonEnvelope({
            command: "config list",
            data: {
              layer: layer ?? null,
              keys: rows.map((row) => ({
                key: row.key,
                type: row.type,
                summary: row.summary,
                value: jsonValue(row.spec, row.value, reveal),
                source: row.source,
              })),
            },
          }),
        )
        return
      }
      for (const row of rows) {
        // 指定层时只关心该层写没写；默认模式给出生效值与来源层，未写时只给默认值，避免「未配置（默认 X）（默认值）」重复
        const text =
          layer === undefined
            ? row.value === undefined
              ? renderValue(row.spec, undefined)
              : `${renderValue(row.spec, row.value, reveal)}（${renderSource(row.source)}）`
            : row.value === undefined
              ? "未写"
              : renderValue(row.spec, row.value, reveal)
        console.log(`  ${row.key}：${text}`)
      }
      const label = layer === undefined ? "可写" : `${CONFIG_LAYER_LABELS[layer]}可写`
      console.log(line.hint(`共 ${rows.length} 个${label}键；写入用 toolkit config set <key> <value>`))
    })

  // 单键取值：--explain 展示类型、可写层与三层覆盖链，排查「为什么没生效」
  configCmd
    .command("get <key>")
    .description("读取单个配置键（--explain 展示类型、可写层与三层覆盖链）")
    .option("--explain", "展示键元数据与三层覆盖链")
    .option("--cwd <path>", "查找起点（缺省当前工作目录）")
    .option("--reveal", "输出敏感值原文（默认打码）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((key: string, options: { explain?: boolean; cwd?: string; reveal?: boolean; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const spec = getConfigKey(key)
      if (!spec) {
        rejectUnknownKey(key)
        return
      }
      const cwd = resolveCwdOption(options)
      if (cwd === null) return
      const reveal = Boolean(options.reveal)
      const state = readConfigKey(key, cwd)
      if (options.format === "json") {
        printJson(
          jsonEnvelope({
            command: "config get",
            data: {
              key,
              type: spec.type,
              summary: spec.summary,
              value: jsonValue(spec, state.value, reveal),
              source: state.source,
              layers: {
                global: jsonValue(spec, state.layers.global, reveal),
                project: jsonValue(spec, state.layers.project, reveal),
                local: jsonValue(spec, state.layers.local, reveal),
              },
              env: state.env ?? null,
            },
          }),
        )
        return
      }
      if (!options.explain) {
        console.log(renderValue(spec, state.value, reveal))
        return
      }
      console.log(`键：${spec.key}`)
      console.log(`类型：${configKeyTypeLabel(spec)}`)
      console.log(`默认写入层：${CONFIG_LAYER_LABELS[spec.defaultLayer]}；可写层：${spec.writableLayers.map((item) => CONFIG_LAYER_LABELS[item]).join(" / ")}`)
      console.log(`说明：${spec.summary}`)
      console.log(`生效值：${renderValue(spec, state.value, reveal)}（来源：${renderSource(state.source)}）`)
      console.log("覆盖链：")
      for (const item of ["local", "project", "global"] as const) {
        // 各层只看「写没写」，默认值只属于生效值，不能拿来填充每层
        const layerValue = state.layers[item]
        console.log(`  ${CONFIG_LAYER_LABELS[item]}：${layerValue === undefined ? "未写" : renderValue(spec, layerValue, reveal)}`)
      }
      if (state.env) console.log(line.hint(`环境变量 ${state.env} 已设置：运行期以此为准，文件取值仅作记录`))
    })

  // 写单键：默认落该键的默认层，--layer 切换；类型、枚举、可写层不合法一律报错
  configCmd
    .command("set <key> <value>")
    .description("写入单个配置键（默认落该键的默认层；非交互环境须加 --yes）")
    .option("--layer <layer>", "写入层：global / project / local")
    .option("--cwd <path>", "查找起点（缺省当前工作目录）")
    .option("--dry-run", "只预览将写入的内容，不落盘")
    .option("--yes", "非交互环境确认写入")
    .option("--reveal", "输出敏感值原文（默认打码）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((key: string, raw: string, options: { layer?: string; cwd?: string; dryRun?: boolean; yes?: boolean; reveal?: boolean; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const spec = getConfigKey(key)
      if (!spec) {
        rejectUnknownKey(key)
        return
      }
      const layer = resolveLayerOption(options)
      if (layer === null) return
      const cwd = resolveCwdOption(options)
      if (cwd === null) return
      const reveal = Boolean(options.reveal)
      const target = layer ?? spec.defaultLayer
      if (!spec.writableLayers.includes(target)) {
        console.error(
          `⚠️ 配置键「${key}」不可写入${CONFIG_LAYER_LABELS[target]}：仅支持 ${spec.writableLayers.map((item) => CONFIG_LAYER_LABELS[item]).join(" / ")}`,
        )
        process.exitCode = 1
        return
      }
      const parsed = parseConfigValue(spec, raw)
      if (parsed.error) {
        console.error(`⚠️ 配置键「${key}」取值非法：${parsed.error}（实际：${raw}）`)
        process.exitCode = 1
        return
      }
      if (!options.dryRun && needsYes(options)) return
      if (options.dryRun) {
        if (options.format === "json") {
          printJson(
            jsonEnvelope({
              command: "config set",
              data: {
                key,
                layer: target,
                value: jsonValue(spec, parsed.value, reveal),
                valueText: renderValue(spec, parsed.value, reveal),
                dryRun: true,
                file: null,
              },
            }),
          )
        } else {
          console.log(line.hint(`将写入${CONFIG_LAYER_LABELS[target]}：${key} = ${renderValue(spec, parsed.value, reveal)}（--dry-run，未落盘）`))
        }
        return
      }
      warnOutsideRepo(target, cwd)
      try {
        const result = writeConfigKey(target, key, parsed.value, cwd)
        // 影响技能形态的配置键：低层写入口只提示漂移，不自动联动产物
        if (key.startsWith("skillDelivery.") || key.startsWith("activation.")) {
          console.error("⚠️ 该配置影响技能分发形态，产物未自动收敛；可运行 toolkit skill reconcile")
        }
        if (options.format === "json") {
          printJson(
            jsonEnvelope({
              command: "config set",
              data: {
                key,
                layer: target,
                value: jsonValue(spec, parsed.value, reveal),
                valueText: renderValue(spec, parsed.value, reveal),
                dryRun: false,
                file: foldHome(result.file),
              },
            }),
          )
          return
        }
        const replaced = result.previous === undefined ? "" : `（原值：${renderValue(spec, result.previous, reveal)}）`
        console.log(line.ok(`已写入${CONFIG_LAYER_LABELS[target]}：${key} = ${renderValue(spec, parsed.value, reveal)}${replaced}`))
        console.log(line.hint(`文件：${foldHome(result.file)}`))
      } catch (e) {
        console.error(`⚠️ 写入失败：${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  // 删单键：只删目标层文件里的该键，删后回收空段；未写时按成功退出并说明无需删除
  configCmd
    .command("unset <key>")
    .description("删除单个配置键（默认删该键的默认层；非交互环境须加 --yes）")
    .option("--layer <layer>", "删除层：global / project / local")
    .option("--cwd <path>", "查找起点（缺省当前工作目录）")
    .option("--dry-run", "只预览将删除的键，不落盘")
    .option("--yes", "非交互环境确认删除")
    .option("--reveal", "输出敏感值原文（默认打码）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((key: string, options: { layer?: string; cwd?: string; dryRun?: boolean; yes?: boolean; reveal?: boolean; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const spec = getConfigKey(key)
      if (!spec) {
        rejectUnknownKey(key)
        return
      }
      const layer = resolveLayerOption(options)
      if (layer === null) return
      const cwd = resolveCwdOption(options)
      if (cwd === null) return
      const reveal = Boolean(options.reveal)
      const target = layer ?? spec.defaultLayer
      if (!spec.writableLayers.includes(target)) {
        console.error(
          `⚠️ 配置键「${key}」不在${CONFIG_LAYER_LABELS[target]}：仅支持 ${spec.writableLayers.map((item) => CONFIG_LAYER_LABELS[item]).join(" / ")}`,
        )
        process.exitCode = 1
        return
      }
      if (options.dryRun) {
        if (options.format === "json") printJson(jsonEnvelope({ command: "config unset", data: { key, layer: target, dryRun: true, removed: null } }))
        else console.log(line.hint(`将从${CONFIG_LAYER_LABELS[target]}删除：${key}（--dry-run，未落盘）`))
        return
      }
      if (needsYes(options)) return
      warnOutsideRepo(target, cwd)
      try {
        const result = unsetConfigKey(target, key, cwd)
        // 删除后回落到的层：让用户看到删完实际生效值来自哪一层
        const effective = readConfigKey(key, cwd)
        if (options.format === "json") {
          printJson(
            jsonEnvelope({
              command: "config unset",
              data: {
                key,
                layer: target,
                dryRun: false,
                removed: result.removed,
                previous: jsonValue(spec, result.previous, reveal),
                file: foldHome(result.file),
                effective: { value: jsonValue(spec, effective.value, reveal), source: effective.source },
              },
            }),
          )
          return
        }
        if (!result.removed) {
          console.log(line.hint(`${CONFIG_LAYER_LABELS[target]}未写该键，无需删除`))
          return
        }
        console.log(line.ok(`已从${CONFIG_LAYER_LABELS[target]}删除：${key}（原值：${renderValue(spec, result.previous, reveal)}）`))
        console.log(line.hint(`当前生效值：${renderValue(spec, effective.value, reveal)}（来源：${renderSource(effective.source)}）`))
      } catch (e) {
        console.error(`⚠️ 删除失败：${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  // 状态：只读体检，只报不改（不给 --fix）；体检本身不阻断、退出码恒 0，仅 --format 非法与 --cwd 非法时按参数错误报错退出
  configCmd
    .command("status")
    .description("配置分层只读体检：三层命中、来源层与环境变量层（只读，退出码恒 0）")
    .option("--cwd <path>", "向上查找的起始目录（缺省当前工作目录）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { cwd?: string; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        const cwd = options.cwd === undefined ? process.cwd() : resolve(options.cwd)
        // 降级不静默：--cwd 非法时不回落 process.cwd()（回落会给出起点错误的报告，比报错更危险）
        if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
          console.error(`⚠️ --cwd 指向的路径不存在或非目录：${options.cwd}`)
          process.exitCode = 1
          return
        }
        const report = configStatus(cwd)
        if (options.format === "json") {
          printJson(
            jsonEnvelope({
              command: "config status",
              data: report,
              issues: report.items.map((item) => ({ level: item.level, scope: item.scope, message: item.message })),
            }),
          )
        } else printConfigStatus(report)
      } catch (e) {
        // 体检失败不置退出码：与 conventions status 对齐，「只读体检不阻断」是本命令的设计意图
        console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
      }
    })

  // 裸 `toolkit config`：打印本域帮助，子命令数按实际注册数给出
  configCmd.action(() => {
    configCmd.help()
  })
}
