// active 任务校验：frontmatter 合法性、完成时间格式、重名、方案正文子项未闭合
// 供 tasks check 使用，输出问题清单；error 为硬性错误，warn 为软告警（默认开启可关）
import { statSync, readdirSync, existsSync, readFileSync } from "node:fs"
import { join, basename, dirname } from "node:path"
import { readTextFile, stripBom } from "../read-text"
import { listTaskFiles } from "./scan"
import { parseFrontmatterRaw, stripFrontmatter, bodyWithoutTitle, FRONTMATTER_RE } from "./parse"
import { parseArchiveBlocks } from "./archive-block"
import { checkArchive } from "./normalize"
import { getConfigSection, resolveLocalConfigPath } from "../config"
import { isBeyondTzFuture, MAX_UTC_OFFSET_HOURS } from "../date"
import {
  CARRIER_VERSION,
  ENTRY_VERSION,
  HISTORY_FILE,
  ID_HEADER,
  INDEX_FILE,
  LEGACY_FILE,
  readCarrier,
} from "../conventions/format"
import { findEntryShells, ignoredShellAlert, mismatchedShellAlert } from "../conventions/entry"
import { filledTableLines, listMarkdownFiles } from "../conventions/compact"
import { gitIgnoredSet, inspectLocalConfigIgnore } from "../git-ignore"
import { ALL_STATUSES, DONE_STATUSES, FRONTMATTER_KEYS } from "./types"
import { parseDepends } from "./depends"
import { displayRel } from "./paths"
import type { TaskFrontmatter, TaskStatus } from "./types"

// 问题级别：error 硬性错误 / warn 软告警
export type IssueLevel = "error" | "warn"

// 单条校验问题；line 为文件内 1 基行号（文件级问题如重名、游离文件无对应行，故可选）
export interface CheckIssue {
  level: IssueLevel
  file: string
  line?: number
  message: string
}

// 校验结果
export interface CheckResult {
  issues: CheckIssue[]
  errorCount: number
  warnCount: number
}

// 合法任务状态与可归档状态直接复用 types.ts 单一事实源（ALL_STATUSES / DONE_STATUSES），避免别名漂移

// 未闭合待办标记：方案正文里出现这些词说明有游离的待办子项未拆成独立任务
const PENDING_MARKERS = /待办|待实施|待核对|待确认|待开始|待评估|待排期|待做|TODO/

// 未勾选的 Markdown 任务复选框：正文级探测（行首标志，尾随空白可跨行）
const CHECKBOX_RE = /^[-*]\s*\[ \]\s/m
// 复选框行定位：逐行匹配时不带尾随空白要求，便于定位到具体行号
const CHECKBOX_LINE_RE = /^[-*]\s*\[ \]/

// completed 合法格式：YYYY-M-D（时分秒可选，非定宽也接受）
const COMPLETED_RE = /^\d{4}-\d{1,2}-\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?$/
// completed 完整时间格式：日期 + 时分（可带秒/T 分隔）
const COMPLETED_FULL_RE = /^\d{4}-\d{1,2}-\d{1,2}[T\s]\d{1,2}:\d{2}(?::\d{2})?$/
// active 文件名规范：{YYYYMMDD}-{负责人}-{简述}.md
const ACTIVE_NAME_RE = /^\d{8}-[^-]+-.+\.md$/

// 校验 YYYY-MM-DD / YYYYMMDD（允许非补零月日）是否为真实存在日期
function isRealDate(ymd: string): boolean {
  const m = ymd.match(/^(\d{4})-?(\d{1,2})-?(\d{1,2})/)
  if (!m) return false
  const [, y, mo, d] = m
  if (!y || !mo || !d) return false
  const yy = +y
  const mm = +mo
  const dd = +d
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false
  const dt = new Date(Date.UTC(yy, mm - 1, dd))
  return dt.getUTCFullYear() === yy && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd
}

// frontmatter 键所在行号（1 基）；键缺失时回落到起始行，保证问题总能指向文件头
function fmKeyLine(lines: string[], fmEnd: number, key: string): number {
  for (let i = 0; i < fmEnd; i++) {
    if ((lines[i] ?? "").trimStart().startsWith(`${key}:`)) return i + 1
  }
  return 1
}

// 正文中首个命中行的行号（1 基）；跳过首个 H1 标题行（与 PENDING_MARKERS 扫描口径一致，避免标题含关键词被误报）
function bodyLine(lines: string[], fmEnd: number, re: RegExp): number {
  let skippedTitle = false
  for (let i = fmEnd; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (!skippedTitle && /^# /.test(line)) {
      skippedTitle = true
      continue
    }
    if (re.test(line)) return i + 1
  }
  return fmEnd + 1
}

// 文件卫生软告警：BOM / 行尾空白 / 换行符混用（统一软告警，不阻断）
// 说明：readTextFile 已剥 BOM，故卫生检查须在原始文本上判定；换行混用指同文件同时含 CRLF 与 LF——
// 统一 CRLF 是 Windows（core.autocrlf=true）检出常态、且各处按 /\r?\n/ 容错读取，故不告警以免跨平台误报
function hygieneIssues(name: string, raw: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  if (raw.startsWith("\uFEFF")) {
    issues.push({ level: "warn", file: name, line: 1, message: "文件含 UTF-8 BOM，建议去除（部分解析工具会异常）" })
  }
  const rawLines = raw.split(/\r?\n/)
  const twIdx = rawLines.findIndex((l) => /[ \t]+$/.test(l))
  if (twIdx >= 0) {
    issues.push({ level: "warn", file: name, line: twIdx + 1, message: "行尾有多余空白（空格或制表符），建议去除" })
  }
  // 定位首个孤立 LF（其前一字符非 CR）：存在即有混用
  let loneAt = -1
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\n" && (i === 0 || raw[i - 1] !== "\r")) {
      loneAt = i
      break
    }
  }
  if (loneAt >= 0 && raw.includes("\r\n")) {
    issues.push({ level: "warn", file: name, line: raw.slice(0, loneAt).split("\n").length, message: "换行符混用（同文件同时含 CRLF 与 LF），建议统一为 LF" })
  }
  return issues
}

// 校验单个任务文件，返回问题列表
export function validateTaskFile(file: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  const name = basename(file)
  // 卫生检查在原始文本上判定（stripBom 后的文本无从发现 BOM），且须早于 frontmatter 早退：无 frontmatter 也要报
  const raw = readFileSync(file, "utf8")
  issues.push(...hygieneIssues(name, raw))
  const content = stripBom(raw)
  const lines = content.split(/\r?\n/)
  // frontmatter 块占用的行数：正则匹配不含收尾换行，故该值即正文首行的 0 基行号
  const fmEnd = FRONTMATTER_RE.exec(content)?.[0].split(/\r?\n/).length ?? 0
  const hasFrontmatter = FRONTMATTER_RE.test(content)

  if (!hasFrontmatter) {
    issues.push({ level: "error", file: name, line: 1, message: "缺少 frontmatter" })
    return issues
  }

  const fm = parseFrontmatterRaw(content) as Partial<TaskFrontmatter>

  // 自定义扩展字段软告警：本工具只按已知字段读取，归档与归一化不保留其余字段，提示人工自行维护
  for (const key of Object.keys(fm)) {
    if ((FRONTMATTER_KEYS as readonly string[]).includes(key)) continue
    issues.push({
      level: "warn",
      file: name,
      line: fmKeyLine(lines, fmEnd, key),
      message: `frontmatter 含未知字段「${key}」，本工具不读取（归档与归一化不会保留，请自行维护）`,
    })
  }

  if (!fm.status) {
    issues.push({ level: "error", file: name, line: fmKeyLine(lines, fmEnd, "status"), message: "frontmatter 缺少 status 字段" })
  } else if (!ALL_STATUSES.includes(fm.status as TaskStatus)) {
    issues.push({ level: "error", file: name, line: fmKeyLine(lines, fmEnd, "status"), message: `status 非法值「${fm.status}」，应为 ${ALL_STATUSES.join(" / ")}` })
  }

  if (DONE_STATUSES.includes(fm.status as TaskStatus) && !fm.completed) {
    issues.push({ level: "error", file: name, line: fmKeyLine(lines, fmEnd, "completed"), message: `status 为「${fm.status}」但缺少 completed 完成时间` })
  }

  if (fm.completed) {
    const c = fm.completed.trim()
    const line = fmKeyLine(lines, fmEnd, "completed")
    if (!COMPLETED_RE.test(c)) {
      issues.push({ level: "warn", file: name, line, message: `completed「${fm.completed}」格式非法，应为 YYYY-MM-DD HH:mm` })
    } else {
      const datePart = c.match(/^\d{4}-\d{1,2}-\d{1,2}/)?.[0] ?? c
      if (!isRealDate(datePart)) {
        issues.push({ level: "warn", file: name, line, message: `completed「${fm.completed}」日期不存在，请核对` })
      } else if (!COMPLETED_FULL_RE.test(c)) {
        issues.push({ level: "warn", file: name, line, message: `completed「${fm.completed}」建议补全为完整时间 YYYY-MM-DD HH:mm` })
      } else if (isBeyondTzFuture(c)) {
        // 未来时间检测：写入时刻晚于系统时间说明时间源有误；留跨时区容差（详见 src/date.ts）避免 UTC 运行环境误报
        issues.push({ level: "warn", file: name, line, message: `completed「${fm.completed}」晚于当前系统时间 ${MAX_UTC_OFFSET_HOURS} 小时以上，疑似时间源错误，请当场取系统时间核实` })
      } else if (/(?:[T\s]00:00(?::00)?)$/.test(c)) {
        // 零点整检测：恰为 00:00 通常是只填日期被自动补零的特征（真实午夜收工属少量误报，warn 级可接受）
        issues.push({ level: "warn", file: name, line, message: `completed「${fm.completed}」恰为零点整，疑似只填了日期被补零，请核实实际完成时间` })
      }
    }
  }

  // 元数据完整性（软告警）：负责人 / 创建日期 / 文件命名规范
  if (!fm.owner) {
    issues.push({ level: "warn", file: name, line: fmKeyLine(lines, fmEnd, "owner"), message: "缺少 owner 负责人字段" })
  }
  if (!fm.created) {
    issues.push({ level: "warn", file: name, line: fmKeyLine(lines, fmEnd, "created"), message: "缺少 created 创建日期字段" })
  } else if (!/^\d{8}$/.test(fm.created.trim())) {
    issues.push({ level: "warn", file: name, line: fmKeyLine(lines, fmEnd, "created"), message: `created「${fm.created}」格式非法，应为 YYYYMMDD` })
  } else if (!isRealDate(fm.created.trim())) {
    issues.push({ level: "warn", file: name, line: fmKeyLine(lines, fmEnd, "created"), message: `created「${fm.created}」日期不存在，请核对` })
  }
  // 更新日早于创建日：时间线自相矛盾（两者均为合法 YYYYMMDD 时才可比对），属硬性错误
  if (fm.updated && fm.created && /^\d{8}$/.test(fm.updated.trim()) && /^\d{8}$/.test(fm.created.trim()) && fm.updated.trim() < fm.created.trim()) {
    issues.push({
      level: "error",
      file: name,
      line: fmKeyLine(lines, fmEnd, "updated"),
      message: `updated ${fm.updated.trim()} 早于 created ${fm.created.trim()}，时间线矛盾`,
    })
  }
  const nameMatch = name.match(/^(\d{8})-/)
  if (!ACTIVE_NAME_RE.test(name)) {
    issues.push({ level: "warn", file: name, message: "文件名不符合规范 {YYYYMMDD}-{负责人}-{简述}.md" })
  } else if (fm.created && /^\d{8}$/.test(fm.created.trim()) && nameMatch && fm.created.trim() !== nameMatch[1]) {
    issues.push({ level: "warn", file: name, message: `文件名日期 ${nameMatch[1]} 与 created ${fm.created.trim()} 不一致` })
  }

  // 范围字段形态软告警：scope 为分类短词，多值以半角加号分隔；
  // 顿号/逗号疑似多值分隔误写、括号疑似注释污染，均给出修复指引（高置信项才提示，斜杠/空格不纳入避免噪音）
  if (fm.scope) {
    const s = fm.scope.trim()
    const line = fmKeyLine(lines, fmEnd, "scope")
    if (/[、，,]/.test(s)) {
      issues.push({ level: "warn", file: name, line, message: `scope「${fm.scope}」含顿号/逗号疑似多值分隔，多值请改用半角加号连接（如 scope: web+server）` })
    }
    if (/[()（）]/.test(s)) {
      issues.push({ level: "warn", file: name, line, message: `scope「${fm.scope}」含括号疑似注释性文字，说明请移入正文` })
    }
  }

  // 方案正文子项未闭合扫描（软告警，不阻断；check.pendingMarkers=false 可关闭词标记扫描）
  // 跳过 H1 标题，避免标题含「待办」等词被误报（去标题逻辑与展示层收口于 parse.ts）
  const body = bodyWithoutTitle(stripFrontmatter(content))
  const pendingOn = getConfigSection("check")?.pendingMarkers !== false
  const pending = pendingOn ? body.match(PENDING_MARKERS) : null
  if (pending) {
    issues.push({
      level: "warn",
      file: name,
      line: bodyLine(lines, fmEnd, PENDING_MARKERS),
      message: `正文含未闭合待办标记「${pending[0]}」，建议拆分为独立 active 任务或明确闭环`,
    })
  }

  // 未勾选的 Markdown 任务复选框（软告警，默认开；.toolkitrc.json 的 check.includeCheckbox=false 可关）
  const includeCheckbox = getConfigSection("check")?.includeCheckbox !== false
  if (includeCheckbox && CHECKBOX_RE.test(body)) {
    issues.push({
      level: "warn",
      file: name,
      line: bodyLine(lines, fmEnd, CHECKBOX_LINE_RE),
      message: "正文含未勾选待办项「- [ ]」，建议拆分为独立 active 任务或勾选完成",
    })
  }

  return issues
}

// 游离任务文件扫描：active/archive 之外、带 {YYYYMMDD}- 日期前缀的 .md 视为疑似任务
// 这类文件不被 tasks/check/archive 任何命令读取，典型成因是建档时漏掉 active/{YYYYMM}/ 层级
function strayTaskFiles(tasksDir: string): string[] {
  const results: string[] = []
  if (!existsSync(tasksDir)) return results
  for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
    if (entry.name === "active" || entry.name === "archive") continue
    if (entry.isFile()) {
      // 日期前缀启发式：README 等说明文档不带日期前缀，不误报
      if (entry.name.endsWith(".md") && /^\d{8}-/.test(entry.name)) results.push(entry.name)
    } else if (entry.isDirectory()) {
      // 只扫一层，覆盖漏建 active 层的 .tasks/202609/xxx.md（口径与 listTaskFiles 一致）
      for (const sub of readdirSync(join(tasksDir, entry.name))) {
        if (sub.endsWith(".md") && /^\d{8}-/.test(sub)) results.push(`${entry.name}/${sub}`)
      }
    }
  }
  return results
}

// 本地配置文件忽略体检：存在但未被忽略时软告警（warn 级，不改 error 阈值）
// 定位与判定同源：路径取自 resolveLocalConfigPath(cwd)，与 config status 共用同一来源，避免两处各查一套导致漂移
// 展示用相对 cwd 的路径（文件可能命中上层目录，故不能只取 basename），与 config status 的绝对路径形成互补
// 非 git 仓库 / 位于仓库工作树之外均属「忽略判定不适用」，不发告警（无从处置的告警等于噪声）；已跟踪态单列（疑似历史 git add -f）
function localConfigIssues(cwd: string): CheckIssue[] {
  const file = resolveLocalConfigPath(cwd)
  if (!file) return []
  const rel = displayRel(cwd, file)
  const ignore = inspectLocalConfigIgnore(file, cwd)
  if (ignore.state === "not-a-repo" || ignore.state === "outside-repo") return []
  if (ignore.state === "unavailable") {
    return [{ level: "warn", file: rel, message: `本地配置文件忽略判定不可用（${ignore.detail ?? "未知原因"}），请核实 git 环境` }]
  }
  if (ignore.state === "tracked") {
    return [
      {
        level: "warn",
        file: rel,
        message: `本地配置文件已被忽略规则覆盖但仍被 git 跟踪（疑似历史 git add -f）：执行 git rm --cached ${rel} 后才会真正不入库`,
      },
    ]
  }
  if (ignore.state === "ignored") return []
  return [{ level: "warn", file: rel, message: "本地配置文件未被 gitignore 覆盖，可能随 git 提交泄露个人配置：重跑 toolkit init 可自动补写忽略行" }]
}

// 规范载体形态检查（软告警，不读内容）：只读首行标记与文件存在性，形态判据走 format.ts 的单一实现
// 三态：v1（有 index.md、无 history.md、无标记）为合法存量不告警；形态异常（标记 / history.md / 首列 ID 三者不一致）告警
// 入口层：壳标记与当前 toolkit 不一致、壳被 gitignore 覆盖各合并为一条（多落点内联路径，不按壳重复）；无壳时不探测（避免无壳项目的进程开销）
// 载体细则见 skills/fxri-plan-to-task/references/conventions-spec.md
function validateConventions(tasksDir: string, cwd: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  const state = readCarrier(tasksDir)
  if (state.hasLegacy) {
    issues.push({
      level: "warn",
      file: LEGACY_FILE,
      message: state.hasDir
        ? "旧单文件规范载体已被 conventions/ 目录形态取代，建议清理（两者并存时以目录形态为准）"
        : "旧单文件规范载体，建议迁移为 conventions/ 目录形态（index.md 作唯一入口 + common.md / 端分册按需创建）",
    })
  }
  if (state.hasDir && !state.hasIndex) {
    issues.push({ level: "warn", file: `conventions/${INDEX_FILE}`, message: "规范载体缺 index.md（唯一入口与唯一权威），请补齐" })
  }
  if (state.form === "abnormal") {
    issues.push({
      level: "warn",
      file: `conventions/${INDEX_FILE}`,
      message:
        state.markerVersion === CARRIER_VERSION
          ? `规范载体标为 v${CARRIER_VERSION} 但缺 ${HISTORY_FILE} 或索引表首列非 ${ID_HEADER}，请补齐或执行 toolkit conventions upgrade`
          : `规范载体存在 ${HISTORY_FILE} 但索引表首列仍非 ${ID_HEADER}（形态异常），请人工确认`,
    })
  }
  const shells = findEntryShells(cwd)
  // 一次批量判定全部落点的 gitignore 状态，避免逐壳各起一个 git 子进程
  const ignored = gitIgnoredSet(cwd, shells.map((s) => s.file))
  const alerts = [
    mismatchedShellAlert(shells.filter((s) => s.version !== ENTRY_VERSION)),
    ignoredShellAlert(shells.filter((s) => ignored.has(s.file))),
  ]
  for (const alert of alerts) {
    if (alert) issues.push({ level: "warn", file: alert.file, message: alert.message })
  }
  issues.push(...localConfigIssues(cwd))
  return issues
}

// 表格形态软告警：检出被格式化器填充（列对齐空白）的表格行，指向 conventions format 归一
// 只报不改：归一由 conventions format 统一负责（--fix 只管归档块，不代改空白层）
const TABLE_FORM_PREVIEW = 6
function validateTableForm(tasksDir: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  for (const file of listMarkdownFiles(tasksDir)) {
    const lines = filledTableLines(readTextFile(file))
    if (lines.length === 0) continue
    const shown = lines.slice(0, TABLE_FORM_PREVIEW).join("、")
    issues.push({
      level: "warn",
      file: displayRel(tasksDir, file),
      line: lines[0],
      message: `表格存在列对齐填充（偏离紧凑形态）${lines.length} 行（第 ${shown}${lines.length > TABLE_FORM_PREVIEW ? " …" : ""} 行）：执行 toolkit conventions format 归一`,
    })
  }
  return issues
}

// 校验 active 目录全部任务（含跨文件重名检测）
export function validateTasks(tasksDir = ".tasks", cwd = process.cwd()): CheckResult {
  const activeDir = join(tasksDir, "active")
  const files = listTaskFiles(activeDir)
  const issues: CheckIssue[] = []
  for (const f of files) {
    issues.push(...validateTaskFile(f))
    // 按规范 active 任务应放在 {YYYYMM}/ 月份子目录，直放 active 根目录给出软告警
    if (dirname(f) === activeDir) {
      issues.push({ level: "warn", file: basename(f), message: "active 任务应放入 {YYYYMM} 月份子目录（当前直放 active 根目录）" })
    }
  }

  // 游离于 active/ 之外的任务文件对 check/archive 均不可见，单独提示其修正位置
  for (const s of strayTaskFiles(tasksDir)) {
    issues.push({ level: "warn", file: s, message: "任务文件游离于 active/ 之外，tasks/check/archive 均不会读取，应移入 active/{YYYYMM}/ 月份子目录" })
  }

  // 规范载体形态：仅查形态不读内容，故不影响任务校验的语义判断
  issues.push(...validateConventions(tasksDir, cwd))

  // 表格形态：检出被格式化器填充的表格行，指向 conventions format 归一
  issues.push(...validateTableForm(tasksDir))

  // 归档块检查：复用 normalize 的单一实现（月份目录归属、元数据完整性、完成时间漂移/异常、排序、疑似任务块），
  // 避免 validate 与 normalize 各写一套导致判据漂移；归档问题一律 warn 级（明细与修复走 tasks normalize / normalize --fix）
  for (const i of checkArchive(tasksDir)) {
    issues.push({ level: "warn", file: i.file, message: i.message })
  }

  // 跨文件重名检测：同名任务文件疑似重复建档
  const seen = new Map<string, string[]>()
  for (const f of files) {
    const name = basename(f, ".md")
    const list = seen.get(name)
    if (list) list.push(f)
    else seen.set(name, [f])
  }
  for (const [name, list] of seen) {
    if (list.length > 1) {
      issues.push({ level: "warn", file: name, message: `存在 ${list.length} 个同名任务文件，疑似重复建档` })
    }
  }

  // depends_on 依赖闭环校验
  issues.push(...validateDependencies(files, tasksDir))

  const errorCount = issues.filter((i) => i.level === "error").length
  const warnCount = issues.length - errorCount
  return { issues, errorCount, warnCount }
}

// 已归档索引缓存：键为归档文件路径，值为 { mtimeMs, titles }；
// 同一进程内多次 check（库调用 / 连续触发）复用未变更文件的解析结果，避免重复读盘（N2）
const archivedIndexCache = new Map<string, { mtimeMs: number; titles: string[] }>()

// 读单个归档文件的任务块标题集（mtime 感知缓存；文件损坏时按空集处理，仅影响去向提示精确度）
function archivedTitles(file: string): string[] {
  const st = statSync(file)
  const hit = archivedIndexCache.get(file)
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.titles
  const titles: string[] = []
  const seen = new Set<string>()
  try {
    for (const b of parseArchiveBlocks(readTextFile(file)).blocks) {
      if (b.title && !seen.has(b.title)) {
        seen.add(b.title)
        titles.push(b.title)
      }
    }
  } catch {
    // 忽略损坏文件
  }
  archivedIndexCache.set(file, { mtimeMs: st.mtimeMs, titles })
  return titles
}

// 校验 depends_on 依赖：目标存在性 + 成环检测（引用带 .md 扩展名时自动归一化比对；已归档给出精确去向）
function validateDependencies(files: string[], tasksDir: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  const nameSet = new Set(files.map((f) => basename(f, ".md")))
  const depsMap = new Map<string, string[]>()
  // 引用名归一化：去空白与 .md 后缀，统一为任务文件 basename（不含扩展名）
  const normDep = (d: string) => d.trim().replace(/\.md$/, "").trim()

  for (const file of files) {
    const name = basename(file, ".md")
    const content = readTextFile(file)
    const fm = parseFrontmatterRaw(content)
    depsMap.set(name, parseDepends(fm.depends_on).map(normDep))
  }

  // 全库无任何依赖声明时无需成环检测与归档索引（建索引须扫遍 archive，惰性化避免空转）
  if (![...depsMap.values()].some((d) => d.length > 0)) return issues

  // 已归档索引：任务块标题 → 相对归档文件路径，仅在确有依赖缺失时构建（供缺失依赖精确提示去向，M3）
  let archivedAt: Map<string, string> | null = null
  const archivedLocation = (title: string): string | undefined => {
    if (!archivedAt) {
      archivedAt = new Map<string, string>()
      for (const af of listTaskFiles(join(tasksDir, "archive"))) {
        for (const t of archivedTitles(af)) {
          if (!archivedAt.has(t)) archivedAt.set(t, displayRel(tasksDir, af))
        }
      }
    }
    return archivedAt.get(title)
  }

  for (const [name, deps] of depsMap) {
    for (const d of deps) {
      if (!nameSet.has(d)) {
        const where = archivedLocation(d)
        issues.push({
          level: "warn",
          file: name,
          message: where
            ? `依赖的任务「${d}」不在 active 中（已归档于 ${where}，无需再依赖）`
            : `依赖的任务「${d}」不在 active 中（可能已归档或文件名拼写错误）`,
        })
      }
    }
  }

  // 成环检测：DFS 沿依赖边遍历，命中灰色节点即为环
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  const visit = (node: string, path: string[]): string[] | null => {
    color.set(node, GRAY)
    for (const dep of depsMap.get(node) ?? []) {
      if (!nameSet.has(dep)) continue
      const c = color.get(dep) ?? WHITE
      if (c === GRAY) return [...path, dep]
      if (c === WHITE) {
        const loop = visit(dep, [...path, dep])
        if (loop) return loop
      }
    }
    color.set(node, BLACK)
    return null
  }
  for (const name of depsMap.keys()) {
    if ((color.get(name) ?? WHITE) === WHITE) {
      const loop = visit(name, [name])
      if (loop) {
        issues.push({ level: "warn", file: name, message: `depends_on 存在循环依赖：${loop.join(" → ")}` })
        break
      }
    }
  }

  return issues
}
