// init 命令实现：生成任务区骨架、规范载体与技能入口壳，补齐 .gitignore 片段
// 重复执行幂等：业务文件已存在一律保持不覆盖；仅入口壳按标记版本分流（落后或无标记就地更新为当前版本）
import { existsSync, readFileSync, mkdirSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import { writeFileAtomic } from "./write-atomic"
import { readTextFile } from "./read-text"
import {
  CARRIER_MARKER,
  CONVENTIONS_DIR,
  ENTRY_VERSION,
  HISTORY_FILE,
  HISTORY_SKELETON,
  INDEX_FILE,
  INDEX_TITLE,
  LEGACY_FILE,
  readCarrier,
  readEntryVersion,
} from "./conventions/format"
import {
  AGENTS_POINTER_START,
  ENTRY_SHELL_NAME,
  SKILL_ENTRY,
  buildAgentsPointer,
  buildEntryShell,
  isToolkitSourceRepo,
  resolveProjectSkillDirs,
} from "./conventions/entry"
import { checkIgnore, gitIgnoredSet, probeRepo } from "./git-ignore"
import { todayCompact } from "./date"
import { hasGlobalSkillsInstalled, PKG_NAME } from "./skills"

// init 时输出的后续步骤提示（getting-started / guide 链接与文档站同源）
export const INIT_LINKS = {
  site: "https://fxri-net.github.io/toolkit/",
  gettingStarted: "https://fxri-net.github.io/toolkit/getting-started",
  guide: "https://fxri-net.github.io/toolkit/guide",
}

// .gitignore 片段稳定标识：认领本工具写入的注释行，重跑 init 时据此改写旧文案、不留双注释
const GITIGNORE_MARKER = "# @fxri/toolkit"
// 片段标题：概括该片段守护的忽略项（运行时文件与个人本地配置均不入库）
const GITIGNORE_COMMENT = `${GITIGNORE_MARKER} 忽略片段（运行时文件与个人本地配置，不入库）`
// 片段出口指引：另起一行注释（不以 marker 开头，避免被误认领为第二条认领行），告知不想改团队 .gitignore 者的退路
const GITIGNORE_EXIT_HINT = "# 不想改团队 .gitignore 者，可把这些忽略行写进 .git/info/exclude（本地排除、不进版本控制）"
// 片段行清单与各行等价写法：git 可用时按真实忽略判定、否则按等价写法命中即视为该行已覆盖，不再追加，尊重用户手写习惯
const GITIGNORE_ROWS: ReadonlyArray<{ row: string; patterns: RegExp[] }> = [
  { row: ".archive.lock", patterns: [/^\/?\.archive\.lock$/] },
  {
    row: ".toolkitrc.local.json",
    patterns: [/^\/?\.toolkitrc\.local\.json$/, /^\*\.local\.json$/, /^\.toolkitrc\.\*$/],
  },
]

// prepare 钩子脚本：刷新项目侧技能（真源副本 + 各候选目录薄壳），幂等；挂在本地依赖 @fxri/toolkit 时才有意义
const PREPARE_SCRIPT = "toolkit skills install --scope project"
// prepare 钩子的等价写法白名单：带 --scope project 的显式写法，与不带作用域的裸写法（在仓库内执行时自动判定为项目面）
const PREPARE_EQUIVALENTS = [PREPARE_SCRIPT, "toolkit skills install"]

// 规范载体索引骨架：三节结构与 skills/fxri-plan-to-task/references/conventions-spec.md 一致
const CONVENTIONS_INDEX = `${CARRIER_MARKER}
${INDEX_TITLE}

> 唯一入口与唯一权威：端清单在此声明、每条规范在此留一行指针；分册（\`common.md\` / \`<端名>.md\`）按需创建。
> 端名与任务 frontmatter 的 \`scope\` 取值共用同一套词表、逐字一致；保留字 \`index\` / \`common\` 不得作端名。
> 演进记录见 \`history.md\`；超长条目升级见分册。

## 一、端清单

| 端名 | 说明 |
| --- | --- |

## 二、索引

| ID | 规则 | 当前语义 | 归属 | 状态 | 确立来源任务 | 单一事实源 |
| --- | --- | --- | --- | --- | --- | --- |

## 三、用法说明

（在此写明本项目采用溯源索引式还是条文式、读写判定要点、规则层源头变更时的同步纪律）
`

// init 实际动作：新建 / 更新 / 保持 / 追加 / 跳过（跳过必带原因）
export type InitAction = "created" | "updated" | "kept" | "appended" | "skipped"

// 单条初始化产物：target 为展示用路径或区块名，detail 说明做了什么或为何没做，hint 提示后续可选操作
export interface InitProduct {
  target: string
  action: InitAction
  detail?: string
  hint?: string
}

// init 报告：任务目录 + 逐项产物动作 + 全局技能安装态（供「下一步」按需提示 skills install）
export interface InitReport {
  tasksDir: string
  products: InitProduct[]
  skillsInstalled: boolean
  // 发布型包误打包提醒：判据与 prepare 钩子是否写入无关，故独立于 products（风险不是一种产物动作）
  publishRiskHint?: string
}

// 展示用路径归一为 / 分隔，保证报告与测试跨平台一致
function posix(p: string): string {
  return p.replace(/\\/g, "/")
}

// init 选项：hooks 控制是否写入 package.json 的 prepare 刷新钩子（对应 CLI --no-hooks）
export interface InitOptions {
  hooks?: boolean
}

// 初始化项目任务区：任务区骨架 → 规范载体 → .gitignore 片段 → 技能入口层 → prepare 刷新钩子
// dir 为任务目录（默认 .tasks，支持绝对路径或 ../ 相对路径指向项目外），cwd 为仓库根（.gitignore 与 AGENTS.md 所在目录）
export function initWorkspace(dir = ".tasks", cwd = process.cwd(), options: InitOptions = {}): InitReport {
  const month = todayCompact().slice(0, 6)
  // resolve：dir 为绝对路径（项目外独立仓库）时直接使用，相对路径时基于 cwd 解析
  const root = resolve(cwd, dir)
  const rootExisted = existsSync(root)
  mkdirSync(join(root, "active", month), { recursive: true })
  mkdirSync(join(root, "archive"), { recursive: true })
  const products: InitProduct[] = [
    {
      target: `${posix(dir)}/active/${month}/、${posix(dir)}/archive/`,
      action: rootExisted ? "kept" : "created",
      detail: rootExisted ? "任务区已存在，保持不变" : "已创建",
    },
    ...scaffoldConventions(root, dir),
    ...appendGitignore(cwd),
    ...scaffoldEntryLayer(cwd),
    ...(options.hooks === false ? [{ target: "package.json", action: "skipped" as const, detail: "--no-hooks：跳过 prepare 刷新钩子写入" }] : scaffoldPrepareHook(cwd)),
  ]
  const report: InitReport = { tasksDir: dir, products, skillsInstalled: hasGlobalSkillsInstalled() }
  const publishRiskHint = detectPublishRisk(cwd, root)
  if (publishRiskHint) report.publishRiskHint = publishRiskHint
  return report
}

// 生成规范载体骨架（index.md + history.md）；已存在索引、或存在待迁移的旧单文件 conventions.md 时不动
// 旧文件在时不建空骨架：否则空骨架会抢占目录形态的优先地位，旧内容形同被吞
function scaffoldConventions(root: string, display: string): InitProduct[] {
  const dir = join(root, CONVENTIONS_DIR)
  const index = join(dir, INDEX_FILE)
  const target = `${posix(display)}/${CONVENTIONS_DIR}/${INDEX_FILE}`
  if (existsSync(index)) {
    const product: InitProduct = { target, action: "kept", detail: "已存在，保持不变" }
    if (readCarrier(root).form === "v1") product.hint = "当前为 v1 形态，可执行 toolkit conventions upgrade 升为 v2"
    return [product]
  }
  if (existsSync(join(root, LEGACY_FILE))) {
    return [
      {
        target,
        action: "skipped",
        detail: `存在待迁移的旧单文件 ${posix(display)}/${LEGACY_FILE}，不建空骨架`,
      },
    ]
  }
  mkdirSync(dir, { recursive: true })
  writeFileAtomic(index, CONVENTIONS_INDEX)
  writeFileAtomic(join(dir, HISTORY_FILE), HISTORY_SKELETON)
  return [
    { target, action: "created", detail: "已创建（端清单 / 索引 / 用法说明三节）" },
    { target: `${posix(display)}/${CONVENTIONS_DIR}/${HISTORY_FILE}`, action: "created", detail: "已创建（规范演进记录）" },
  ]
}

// 本工具认领的片段行：认领注释行 + 出口指引行，重跑时就地校正、不留陈迹
function isOwnedLine(line: string): boolean {
  return line.startsWith(GITIGNORE_MARKER) || line === GITIGNORE_EXIT_HINT
}

// 判某忽略行是否已被覆盖：优先用 git check-ignore 真实判定（含 .git/info/exclude、上层 .gitignore 等全部来源，能识破 *.lock 等通配）
// 非 git 仓库或判定不可用时退回等价写法白名单；两条路径都让用户手写的等价写法原样保留、不再追加
function isRowCovered(item: { row: string; patterns: RegExp[] }, cwd: string, lines: string[], inRepo: boolean): boolean {
  if (inRepo && checkIgnore(join(cwd, item.row)).state === "ignored") return true
  return lines.some((line) => item.patterns.some((re) => re.test(line.trim())))
}

// 向 .gitignore 追加忽略片段：逐行判定覆盖情况、只补缺失行，重复执行不改动，用户手写的等价忽略写法原样保留
export function appendGitignore(cwd: string): InitProduct[] {
  const file = join(cwd, ".gitignore")
  const cover = `覆盖 ${GITIGNORE_ROWS.map((item) => item.row).join(" / ")}`
  const head = [GITIGNORE_COMMENT, GITIGNORE_EXIT_HINT]
  if (!existsSync(file)) {
    // 无 .gitignore：直接创建并写入完整片段
    writeFileAtomic(file, `${head.join("\n")}\n${GITIGNORE_ROWS.map((item) => item.row).join("\n")}\n`)
    return [{ target: ".gitignore", action: "created", detail: `已创建并写入 ${GITIGNORE_MARKER} 忽略片段（${cover}）` }]
  }
  const raw = readFileSync(file, "utf8")
  // 保留原换行风格；统一为 LF 后逐行判定，任一等价写法命中即该行已覆盖
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  const lines = raw.replace(/\r\n/g, "\n").split("\n")
  const markerAt = lines.findIndex((line) => line.startsWith(GITIGNORE_MARKER))
  const inRepo = probeRepo(cwd).kind === "repo"
  const missing = GITIGNORE_ROWS.filter((item) => !isRowCovered(item, cwd, lines, inRepo))
  if (missing.length === 0) {
    // 各行均已覆盖：无本工具认领片段则整文件保持不动（尊重用户手写）；片段头陈旧或缺出口指引时就地校正
    if (markerAt === -1 || (lines[markerAt] === GITIGNORE_COMMENT && lines[markerAt + 1] === GITIGNORE_EXIT_HINT)) {
      return [{ target: ".gitignore", action: "kept", detail: `已含 ${GITIGNORE_MARKER} 忽略片段（${cover}）` }]
    }
    const tail = lines.slice(markerAt + 1).filter((line) => !isOwnedLine(line))
    writeFileAtomic(file, [...lines.slice(0, markerAt), ...head, ...tail].join(eol))
    return [{ target: ".gitignore", action: "updated", detail: `已就地把 ${GITIGNORE_MARKER} 片段头更新为当前文案（${cover}）` }]
  }
  // 摘除本工具认领的旧片段行后重建，避免旧文案 / 旧指引残留
  const body = lines.filter((line) => !isOwnedLine(line))
  while (body.length > 0 && body[body.length - 1] === "") body.pop()
  const block = [...head, ...missing.map((item) => item.row)]
  const next = body.length > 0 ? `${body.join(eol)}${eol}${eol}${block.join(eol)}${eol}` : `${block.join(eol)}${eol}`
  writeFileAtomic(file, next)
  return [{ target: ".gitignore", action: "appended", detail: `已追加 ${GITIGNORE_MARKER} 忽略片段（${cover}）` }]
}

// 技能入口层：生成项目级入口壳 + 在已存在的 AGENTS.md 中幂等追加指针块
// 源仓库靠 fxri-* 技能自举，不生成自己的入口壳（内部判定，不暴露 CLI 参数）
function scaffoldEntryLayer(cwd: string): InitProduct[] {
  if (isToolkitSourceRepo(cwd)) {
    return [
      {
        target: "技能入口层",
        action: "skipped",
        detail: "@fxri/toolkit 源仓库靠 fxri-* 技能自举，不生成入口壳与 AGENTS.md 指针块",
      },
    ]
  }
  const skillDirs = resolveProjectSkillDirs(cwd)
  const products: InitProduct[] = []
  // 一次批量判定全部落点的 gitignore 状态，避免逐壳各起一个 git 子进程
  const ignored = gitIgnoredSet(cwd, skillDirs.map((skillDir) => `${skillDir}/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}`))
  const gitHint = "该路径被 .gitignore 覆盖，团队无法共享；需要共享时自行补否定规则（如 !.agents/skills/），toolkit 不代改 .gitignore"
  for (const skillDir of skillDirs) {
    const dir = join(cwd, skillDir, ENTRY_SHELL_NAME)
    const file = join(dir, SKILL_ENTRY)
    const rel = `${skillDir}/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}`
    const ignoredHere = ignored.has(rel)
    if (existsSync(file)) {
      const version = readEntryVersion(readTextFile(file))
      // 标记不旧于当前版本：保持不动（标记超前说明壳由更新版 toolkit 生成，本版不降级覆盖）
      if (version !== null && version >= ENTRY_VERSION) {
        const product: InitProduct = {
          target: rel,
          action: "kept",
          detail: version === ENTRY_VERSION ? "已存在，标记版本一致，保持不变" : `已存在，标记 v${version} 较当前 v${ENTRY_VERSION} 更新，保持不变（不降级覆盖）`,
        }
        if (ignoredHere) product.hint = gitHint
        products.push(product)
        continue
      }
      // 标记缺失或落后：就地重写为当前版本壳，兑现「重跑 toolkit init 即可补齐」
      mkdirSync(dir, { recursive: true })
      writeFileAtomic(file, buildEntryShell())
      const product: InitProduct = {
        target: rel,
        action: "updated",
        detail: version === null ? `无标记，已就地更新为 v${ENTRY_VERSION}` : `标记 v${version} 落后，已就地更新为 v${ENTRY_VERSION}`,
      }
      if (ignoredHere) product.hint = gitHint
      products.push(product)
      continue
    }
    mkdirSync(dir, { recursive: true })
    writeFileAtomic(file, buildEntryShell())
    const product: InitProduct = { target: rel, action: "created", detail: "已创建（只作入口，不承载条文）" }
    if (ignoredHere) product.hint = gitHint
    products.push(product)
  }
  // 指针块只指入口壳形态、不写死落点；多候选目录并存时每份壳内容逐字等价
  products.push(...upsertAgentsPointer(cwd))
  return products
}

// AGENTS.md 指针块：仅当文件已存在时幂等追加，不存在不新建（不替用户决定是否引入 AGENTS.md）
function upsertAgentsPointer(cwd: string): InitProduct[] {
  const file = join(cwd, "AGENTS.md")
  if (!existsSync(file)) {
    return [
      {
        target: "AGENTS.md",
        action: "skipped",
        detail: "文件不存在；不新建，需要时手工添加或先建文件再重跑 toolkit init",
        hint: "无该指针块不影响规范可用：本项目规范仍可经全局技能 fxri-plan-to-task 触达（其工作流第一步即读 conventions/index.md）",
      },
    ]
  }
  const raw = readTextFile(file)
  if (raw.includes(AGENTS_POINTER_START)) {
    return [{ target: "AGENTS.md", action: "kept", detail: "已含规范入口指针块，保持不动" }]
  }
  // 保留原换行风格；块前补空行与正文分隔，块尾补换行避免与后续内容粘连
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  const base = raw.endsWith("\n") || raw === "" ? raw : raw + eol
  const sep = /(\r?\n){2}$/.test(base) ? "" : eol
  writeFileAtomic(file, `${base}${sep}${buildAgentsPointer().replace(/\n/g, eol)}${eol}`)
  return [{ target: "AGENTS.md", action: "appended", detail: "已追加规范入口指针块（幂等，重复执行不重复追加）" }]
}

// 本地依赖判定：四种依赖字段任一声明本包即算「装在本项目」，prepare 钩子才有意义
function hasLocalDependency(pkg: Record<string, unknown>): boolean {
  return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some((field) => {
    const deps = pkg[field]
    return typeof deps === "object" && deps !== null && PKG_NAME in (deps as Record<string, unknown>)
  })
}

// 发布型包误打包判据：未标 private 且无 files 白名单时，npm pack 会把非忽略产物一并打包
// 该风险与 prepare 钩子是否写入无关——项目面真源副本设计上随 git 入库，无钩子同样会被打包
function isPublishRisk(pkg: Record<string, unknown>): boolean {
  return pkg.private !== true && !Array.isArray(pkg.files)
}

// 发布型包的打包面产物清单：技能真源副本恒定落仓库根、项目态归属账恒定，入口薄壳按 init 实际写入的候选目录逐项列出
// 薄壳落到哪些候选目录取决于现场（已存在者各一份，全缺失时回落 .agents/skills），故清单须动态拼接、不能写死
function collectPackArtifacts(cwd: string): string[] {
  const dirs = new Set([".agents/skills", ...resolveProjectSkillDirs(cwd)].map((dir) => `${dir}/`))
  dirs.add(".toolkit/")
  return [...dirs]
}

// 检测发布型包误打包风险：无风险返回 null；产物清单按是否进打包面拼接——任务区落在仓库外时不进打包面
function detectPublishRisk(cwd: string, tasksRoot: string): string | null {
  const file = join(cwd, "package.json")
  if (!existsSync(file)) return null
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(readTextFile(file)) as Record<string, unknown>
  } catch {
    return null
  }
  if (!isPublishRisk(pkg)) return null
  const artifacts = collectPackArtifacts(cwd)
  const rel = relative(cwd, tasksRoot)
  if (rel && rel !== "." && !rel.startsWith("..") && !isAbsolute(rel)) artifacts.push(`${posix(rel)}/`)
  return `⚠️ 本项目未标 private 且无 files 白名单——npm pack 会把下列非忽略产物打进包：${artifacts.join("、")}；发布型包请把它们加入 files 白名单或 .npmignore（已用 .npmignore 排除可忽略）`
}

// 在对象首个条目位插入一段文本：空对象不带尾随逗号（否则 JSON 非法），缩进沿用对象内既有条目的写法
function insertFirstEntry(raw: string, open: number, entry: string): string | null {
  const close = raw.indexOf("}", open)
  if (close === -1) return null
  const empty = raw.slice(open + 1, close).trim() === ""
  const matched = raw.slice(open + 1).match(/^[ \t\r\n]*?\r?\n([ \t]*)"/)
  const indent = matched ? matched[1] : "  "
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  return `${raw.slice(0, open + 1)}${eol}${indent}${entry}${empty ? "" : ","}${raw.slice(open + 1)}`
}

// 最小文本插入 prepare：只补 scripts.prepare 一处，不改动其余字段的排版（用户既有格式与缩进原样保留）
// 无 scripts 字段时补建该字段；定位不到插入点时返回 null，由调用方按「跳过 + 提示」处理（不静默）
function insertPrepareScript(raw: string): string | null {
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  const entry = `"prepare": ${JSON.stringify(PREPARE_SCRIPT)}`
  const scriptsAt = raw.search(/"scripts"\s*:\s*\{/)
  if (scriptsAt !== -1) return insertFirstEntry(raw, raw.indexOf("{", scriptsAt), entry)
  const rootOpen = raw.indexOf("{")
  if (rootOpen === -1) return null
  return insertFirstEntry(raw, rootOpen, `"scripts": {${eol}    ${entry}${eol}  }`)
}

// prepare 刷新钩子：项目本地依赖含 @fxri/toolkit 时才写入（依赖装在本项目，钩子才跑得起来）
// 已存在等价钩子保持不动；存在非等价 prepare 时告警不改写（降级不静默，不擅自破坏用户既有流水线）
function scaffoldPrepareHook(cwd: string): InitProduct[] {
  const target = "package.json"
  const file = join(cwd, target)
  if (isToolkitSourceRepo(cwd)) {
    return [{ target, action: "skipped", detail: `本仓库即 ${PKG_NAME} 源仓库，不写入 prepare 钩子` }]
  }
  if (!existsSync(file)) {
    return [{ target, action: "skipped", detail: "package.json 不存在，跳过 prepare 钩子写入" }]
  }
  const raw = readTextFile(file)
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(raw) as Record<string, unknown>
  } catch (e) {
    return [{ target, action: "skipped", detail: `package.json 解析失败（${(e as Error).message}），跳过 prepare 钩子写入` }]
  }
  if (!hasLocalDependency(pkg)) {
    return [
      {
        target,
        action: "skipped",
        detail: `本地依赖未声明 ${PKG_NAME}，不写入 prepare 钩子`,
        hint: `技能副本随 git 分发即可 clone 即用；依赖装在本项目后需要时手工加 "prepare": "${PREPARE_SCRIPT}" 以在安装依赖后自动刷新`,
      },
    ]
  }
  const scripts = pkg.scripts
  const existing = typeof scripts === "object" && scripts !== null ? (scripts as Record<string, unknown>).prepare : undefined
  if (typeof existing === "string") {
    if (PREPARE_EQUIVALENTS.includes(existing.replace(/\s+/g, " ").trim())) {
      const product: InitProduct = { target, action: "kept", detail: `已有等价的 prepare 钩子（${existing}），保持不变` }
      return [product]
    }
    return [
      {
        target,
        action: "skipped",
        detail: `已有 prepare 钩子「${existing}」，非本包等价写法，不覆盖`,
        hint: `建议自行并入 ${PREPARE_SCRIPT}，以在安装依赖后自动刷新项目侧技能`,
      },
    ]
  }
  const next = insertPrepareScript(raw)
  if (next === null) {
    return [{ target, action: "skipped", detail: "未能定位 scripts 字段，跳过 prepare 钩子写入", hint: `可手工加 "prepare": "${PREPARE_SCRIPT}"` }]
  }
  // 文本插入后回校一次：结果非法或未落地 prepare 即不写盘，退回「跳过 + 提示」
  try {
    const check = JSON.parse(next) as { scripts?: Record<string, unknown> }
    if (check.scripts?.prepare !== PREPARE_SCRIPT) throw new Error("插入结果校验未通过")
  } catch {
    return [{ target, action: "skipped", detail: "自动插入 prepare 失败（原文件格式特殊），未改写", hint: `可手工加 "prepare": "${PREPARE_SCRIPT}"` }]
  }
  writeFileAtomic(file, next)
  const product: InitProduct = { target, action: "updated", detail: `已写入 prepare 钩子（${PREPARE_SCRIPT}），安装依赖后自动刷新项目侧技能` }
  return [product]
}
