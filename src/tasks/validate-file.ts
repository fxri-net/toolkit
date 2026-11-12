// 单任务文件校验：frontmatter、完成时间、命名与正文卫生，自 validate.ts 拆分
import { existsSync, readFileSync } from "node:fs"
import { join, basename } from "node:path"
import { readTextFile, stripBom } from "../read-text"
import { parseFrontmatterRaw, stripFrontmatter, bodyWithoutTitle, titleOf, FRONTMATTER_RE } from "./parse"
import { briefMatchesTitle, briefNameIssues, parseTaskName } from "./name"
import { getConfigSection } from "../config"
import { isBeyondTzFuture, MAX_UTC_OFFSET_HOURS } from "../date"
import { CONVENTIONS_DIR, ENDPOINT_ANCHOR_HEADER, INDEX_FILE, findTable } from "../conventions/format"
import { ALL_STATUSES, DONE_STATUSES, FRONTMATTER_KEYS } from "./types"
import type { TaskFrontmatter, TaskStatus } from "./types"
import type { CheckIssue } from "./validate"


// 词标记：仅认行首子项形态（列表项或「标记词：」开头），句中引用与标题不算
const PENDING_WORDS_SRC = "待办|待实施|待核对|待确认|待开始|待评估|待排期|待做|TODO"
const PENDING_LINE_RE = new RegExp(`^\\s*(?:(?:[-*+]|\\d+\\.)\\s+(${PENDING_WORDS_SRC})|(${PENDING_WORDS_SRC})\\s*[：:])`)

// 词标记命中：跳过 H1、fenced code block 与引用行，只在行首子项形态里找；返回 1 基行号与原词
function findPendingHit(lines: string[], fmEnd: number): { line: number; word: string } | null {
  let fence: string | null = null
  let skippedTitle = false
  for (let i = fmEnd; i < lines.length; i += 1) {
    const line = lines[i] ?? ""
    const fenceHit = /^\s*(```+|~~~+)/.exec(line)
    if (fenceHit) {
      const marker = (fenceHit[1] ?? "").startsWith("`") ? "`" : "~"
      fence = fence === null ? marker : fence === marker ? null : fence
      continue
    }
    if (fence !== null) continue
    if (!skippedTitle && /^# /.test(line)) {
      skippedTitle = true
      continue
    }
    if (/^\s*>/.test(line)) continue
    const hit = PENDING_LINE_RE.exec(line)
    if (hit) return { line: i + 1, word: hit[1] ?? hit[2] ?? "" }
  }
  return null
}

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

// 端清单：只读 conventions/index.md 的「端名」列；载体或表格缺失返回 null（跳过校验，避免误报）
export function readDeclaredEndpoints(tasksDir: string): Set<string> | null {
  const file = join(tasksDir, CONVENTIONS_DIR, INDEX_FILE)
  if (!existsSync(file)) return null
  const table = findTable(readTextFile(file).split(/\r?\n/), ENDPOINT_ANCHOR_HEADER)
  const idx = table ? table.header.indexOf(ENDPOINT_ANCHOR_HEADER) : -1
  if (!table || idx < 0) return null
  const names = new Set<string>()
  for (const row of table.rows) {
    const name = (row[idx] ?? "").trim()
    if (name) names.add(name)
  }
  // 端清单为空表视为未声明端名（单端项目常见），跳过校验而不是把所有 scope 判为非法
  return names.size > 0 ? names : null
}

// 校验单个任务文件，返回问题列表
export function validateTaskFile(file: string, endpoints: Set<string> | null = null): CheckIssue[] {
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

  // 文件名三段各对真源负责：日期↔created（上一条）、用户名↔owner、简述↔正文标题；
  // 判据只看是否源出标题，不限制语种——中文项目自然得中文名，英文项目自然得英文名
  const parsedName = parseTaskName(name)
  if (parsedName) {
    const title = titleOf(content)
    if (title && !briefMatchesTitle(parsedName.brief, title)) {
      issues.push({
        level: "warn",
        file: name,
        message: `文件名简述「${parsedName.brief}」与正文标题「${title}」不同源，简述应取自标题（不翻译、不音译、不缩写）`,
      })
    }
    const formIssues = briefNameIssues(parsedName.brief)
    if (formIssues.length > 0) {
      issues.push({ level: "warn", file: name, message: `文件名简述存在跨平台问题：${formIssues.join("；")}` })
    }
    if (fm.owner && parsedName.owner.trim() !== fm.owner.trim()) {
      issues.push({ level: "warn", file: name, message: `文件名用户名「${parsedName.owner}」与 owner「${fm.owner}」不一致` })
    }
  }

  // 范围字段形态软告警：scope 为分类短词，多值以半角加号分隔，端名不含路径分隔符；
  // 顿号/逗号疑似多值分隔误写、斜杠疑似分隔符误用、括号疑似注释污染，均按高置信项提示
  if (fm.scope) {
    const s = fm.scope.trim()
    const line = fmKeyLine(lines, fmEnd, "scope")
    if (/[、，,]/.test(s)) {
      issues.push({ level: "warn", file: name, line, message: `scope「${fm.scope}」含顿号/逗号疑似多值分隔，多值请改用半角加号连接（如 scope: web+server）` })
    }
    if (/[/\\]/.test(s)) {
      issues.push({ level: "warn", file: name, line, message: `scope「${fm.scope}」含路径分隔符，多值请改用半角加号连接（如 scope: web+server），端名本身不得含分隔符` })
    }
    if (/[()（）]/.test(s)) {
      issues.push({ level: "warn", file: name, line, message: `scope「${fm.scope}」含括号疑似注释性文字，说明请移入正文` })
    }
    if (/\s/.test(s)) {
      issues.push({ level: "warn", file: name, line, message: `scope「${fm.scope}」含空格，端名与分类标签不得含空格（多值请改用半角加号连接，如 scope: web+server）` })
    }
  }
  // scope 取值须在端清单内或为保留归属 common；载体缺失时跳过校验
  if (endpoints && fm.scope) {
    const invalid = fm.scope
      .split("+")
      .map((v) => v.trim())
      .filter((v) => v !== "" && v !== "common" && !endpoints.has(v))
    if (invalid.length > 0) {
      issues.push({
        level: "warn",
        file: name,
        line: fmKeyLine(lines, fmEnd, "scope"),
        message: `scope「${fm.scope}」含不在端清单内的取值：${invalid.join("、")}（请登记端名或改用 common）`,
      })
    }
  }

  // 方案正文子项未闭合扫描（软告警，不阻断；check.pendingMarkers=false 可关闭词标记扫描）
  // 只认行首子项形态，并跳过 H1 / 代码块 / 引用块，避免正文里的正常引用被误判
  const body = bodyWithoutTitle(stripFrontmatter(content))
  const pendingOn = getConfigSection("check")?.pendingMarkers !== false
  const pending = pendingOn ? findPendingHit(lines, fmEnd) : null
  if (pending) {
    issues.push({
      level: "warn",
      file: name,
      line: pending.line,
      message: `正文含未闭合待办标记「${pending.word}」，建议拆分为独立 active 任务或明确闭环`,
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

