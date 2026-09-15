import { readFileSync, writeFileSync } from "node:fs"
import { collectChangelogs } from "./collect"
import { redactText } from "../privacy/redact"
import { todayDash } from "../date"
import {
  LEGACY_TITLE_SLOTS,
  SLOT_PREFIXES,
  languages,
  type ChangelogLanguage,
  type LanguageGroup,
  type SemanticSlot,
} from "./languages"

// 版本标题行，用于切分版本块（归类以「同一版本块」为边界）
const VERSION_HEADER = /^## \d+\.\d+\.\d+/
// 英文源组标题 → 该组无前缀条目的兜底槽位；同时是「changesets 本次新写入块」的唯一判据
const SOURCE_GROUP_SLOTS: Record<string, SemanticSlot> = {
  "### Major Changes": "breaking",
  "### Minor Changes": "added",
  "### Patch Changes": "other",
  "### Dependent Changes": "deps",
}
// 依赖条目的语言无关源文本（归类先于多语言替换，此时尚未本地化）
const DEPS_SOURCE = "- Updated dependencies"
// 内置语言的发布日期后缀：识别时一并接受，使内置语言互跑（如 zh 日志跑 --lang en）时不重复追加日期行
const BUILTIN_RELEASED = Object.values(languages).map((item) => item.released)

// 版本块内的一个分组
interface Section {
  // 组标题行
  title: string
  // 组内正文行（不含标题）
  body: string[]
}

// 一个版本块
interface Block {
  // 块的原始行：未改写时原样输出，保证历史块零 churn
  lines: string[]
  // 版本标题与日期行
  header: string[]
  // 各分组
  sections: Section[]
}

// 本地当天日期 YYYY-MM-DD（实现收口于 ../date，避免 tasks/changelog 双份时区逻辑漂移）
export function localDate(): string {
  return todayDash()
}

// 格式化单个 CHANGELOG 文件，返回是否有改动；history=true 时追溯改写历史版本块（默认保留）
export function formatChangelog(
  file: string,
  today: string,
  lang: ChangelogLanguage,
  redact = true,
  history = false,
): boolean {
  const raw = readFileSync(file, "utf8")
  // 记录原换行符（LF/CRLF），统一按 LF 处理后原样还原，避免 Windows 下出现混合换行
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  // 归一化后的原始内容作为「是否有净改动」的判定基线
  const baseline = raw.replace(/\r\n/g, "\n")
  // 先归一再归类：归类须前置于多语言替换，替换后英文源组标题即不可辨、历史块会被误重排
  let content = regroupSemantic(normalize(baseline), lang, history)
  // 标题替换（多语言兜底）
  for (const [from, to] of Object.entries(lang.replacements)) {
    content = content.replaceAll(from, to)
  }
  // 合并连续重复的「依赖更新」
  while (content.includes(`${lang.deps}\n${lang.deps}`)) {
    content = content.replace(`${lang.deps}\n${lang.deps}`, lang.deps)
  }
  // 合并任意位置连续完全相同的条目（/m 使 ^、$ 按行生效）
  while (true) {
    const merged = content.replace(/^- (.+)\n- \1$/gm, "- $1")
    if (merged === content) break
    content = merged
  }
  // 版本标题下补发布日期：标题与日期行之间始终保留一个空行；
  // 已有日期行保留（缺空行时补齐），缺失时才补今日日期
  const lines = content.split("\n")
  const result: string[] = []
  // 日期行识别与写入共用同一后缀集合：当前语言值（自定义语言如日文「リリース」）+ 内置语言值
  // （内置 zh / en 互跑时既有日期行仍被识别）
  const suffixes = [lang.released, ...BUILTIN_RELEASED].map(escapeRegExp)
  const dateLine = new RegExp(`^> \\d{4}-\\d{2}-\\d{2} (?:${suffixes.join("|")})$`)
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (VERSION_HEADER.test(line)) {
      // 跳过标题后的连续空行，定位首个非空行判断是否已带日期标记
      let j = i + 1
      while (j < lines.length && (lines[j] ?? "").trim() === "") j++
      const next = lines[j] ?? ""
      const isDate = next.startsWith("> ") && dateLine.test(next.trim())
      if (isDate) {
        // 已带日期：标题与日期行间补空行分隔
        result.push(line, "", next)
        i = j + 1
        continue
      }
      // 缺发布日期：标题后补空行 + 日期 + 空行，日期与后续分类标题间亦留空行
      result.push(line, "", `> ${today} ${lang.released}`, "")
      i = j
      continue
    }
    result.push(line)
    i++
  }
  const next = result.join("\n")
  // 写回前对变更条目等自由文本脱敏（redact=false 时原样返回）
  const output = redactText(next, redact)
  if (output !== baseline) {
    writeFileSync(file, output.replace(/\n/g, eol), "utf8")
    return true
  }
  return false
}

// 格式化目录下所有 CHANGELOG.md
export function formatChangelogs(
  dir: string,
  today: string,
  lang: ChangelogLanguage,
  redact = true,
  history = false,
): string[] {
  const changed: string[] = []
  for (const file of collectChangelogs(dir)) {
    if (formatChangelog(file, today, lang, redact, history)) changed.push(file)
  }
  if (changed.length === 0) {
    console.log("无 CHANGELOG 需要更新")
  } else {
    for (const file of changed) console.log(`changelog 已更新：${file}`)
  }
  return changed
}

// 统计英文源组块内缺类型前缀的条目数（cli 软告警预扫用，属内部工具、不对外导出）：
// 归类完成即前缀缺失信息丢失，故须在归类前取数；历史版本块不参与计数
export function countUntypedEntries(dir: string, lang: ChangelogLanguage): number {
  const extra = extraPrefixes(lang.groups ?? [])
  let count = 0
  for (const file of collectChangelogs(dir)) {
    const { blocks } = parseBlocks(normalize(readFileSync(file, "utf8")).split("\n"))
    for (const block of blocks) {
      for (const section of block.sections) {
        if (SOURCE_GROUP_SLOTS[section.title] === undefined) continue
        if (hasLeadingProse(section.body)) continue
        for (const item of splitItems(section.body)) {
          if (explicitSlot(item[0] ?? "", extra) === null) count++
        }
      }
    }
  }
  return count
}

// 转义正则元字符，供按语言的发布日期后缀构造识别正则
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// 汇总各语言自有前缀（可选），与全局槽位前缀表取并集后参与识别
function extraPrefixes(groups: LanguageGroup[]): [SemanticSlot, string][] {
  const extra: [SemanticSlot, string][] = []
  for (const group of groups) {
    for (const prefix of group.prefixes ?? []) extra.push([group.slot, prefix])
  }
  return extra
}

// 条目首行的类型前缀匹配：返回命中槽位与前缀文本，未命中返回 null；归类与剥离共用，避免两处匹配逻辑漂移
function matchSlotPrefix(head: string, extra: [SemanticSlot, string][]): [SemanticSlot, string] | null {
  const text = head.slice(2)
  for (const [slot, prefixes] of Object.entries(SLOT_PREFIXES) as [SemanticSlot, string[]][]) {
    const hit = prefixes.find((prefix) => text.startsWith(prefix))
    if (hit) return [slot, hit]
  }
  for (const [slot, prefix] of extra) {
    if (text.startsWith(prefix)) return [slot, prefix]
  }
  return null
}

// 条目的显式归类信号：依赖条目源文本 → deps；类型前缀命中 → 对应槽位；两者皆无 → null
function explicitSlot(head: string, extra: [SemanticSlot, string][]): SemanticSlot | null {
  if (head.startsWith(DEPS_SOURCE)) return "deps"
  return matchSlotPrefix(head, extra)?.[0] ?? null
}

// 剥离条目已识别的类型前缀：类型已由分组标题承接，明细再带前缀属冗余。
// 只剥离显式命中的前缀，未识别前缀与依赖源条目（其续行承载包版本）原样保留
function stripSlotPrefix(item: string[], extra: [SemanticSlot, string][]): string[] {
  const hit = matchSlotPrefix(item[0] ?? "", extra)
  if (!hit) return item
  const rest = (item[0] ?? "").slice(2 + hit[1].length).trim()
  // 剥离后只剩空白说明该行本就无正文，不改变原样
  if (rest === "") return item
  return [`- ${rest}`, ...item.slice(1)]
}

// 源组标题下若在首个条目之前出现非空行，则「纯条目块」判据不成立，归类时整块保持原样以免丢内容
function hasLeadingProse(body: string[]): boolean {
  for (const line of body) {
    if (line.startsWith("- ")) return false
    if (line.trim() !== "") return true
  }
  return false
}

// 归类前的公共归一：统一换行 → 剥 commit hash 前缀 → 清理双前缀伪影
function normalize(raw: string): string {
  let content = raw.replace(/\r\n/g, "\n")
  // 去掉 changesets 默认 changelog-git 写入的 commit hash 前缀（如「800a1cf: 」），保持条目纯文案
  content = content.replace(/^- [0-9a-f]{7}: /gm, "- ")
  // 清理 changesets 对以「- 」开头的变更集条目二次加前缀产生的伪影：
  // 首行「- - x」还原为「- x」，紧跟的连续「  - 」缩进续行还原为顶层条目；
  // 首行非该形态的缩进列表（正常嵌套）不受影响
  const flat = content.split("\n")
  for (let i = 0; i < flat.length; i++) {
    if (!/^- - .+/.test(flat[i] ?? "")) continue
    flat[i] = (flat[i] ?? "").replace(/^- - /, "- ")
    for (let j = i + 1; j < flat.length && /^ {2}- /.test(flat[j] ?? ""); j++) {
      flat[j] = (flat[j] ?? "").slice(2)
    }
  }
  return flat.join("\n")
}

// 把内容切成「文件头 + 版本块序列」
function parseBlocks(lines: string[]): { lead: string[]; blocks: Block[] } {
  const lead: string[] = []
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length && !VERSION_HEADER.test(lines[i] ?? "")) lead.push(lines[i++] ?? "")
  while (i < lines.length) {
    const start = i
    const header: string[] = []
    // 首行必为版本标题；其后遇到下一个版本标题即换块，避免无分组的块吞掉下一版本标题
    while (
      i < lines.length &&
      !(lines[i] ?? "").startsWith("### ") &&
      !(header.length > 0 && VERSION_HEADER.test(lines[i] ?? ""))
    ) {
      header.push(lines[i++] ?? "")
    }
    const sections: Section[] = []
    while (i < lines.length && (lines[i] ?? "").startsWith("### ")) {
      const title = lines[i++] ?? ""
      const body: string[] = []
      while (i < lines.length && !(lines[i] ?? "").startsWith("### ") && !VERSION_HEADER.test(lines[i] ?? "")) {
        body.push(lines[i++] ?? "")
      }
      // 分组尾部的空行属分组间分隔，不随正文迁移
      while (body.length > 0 && (body[body.length - 1] ?? "").trim() === "") body.pop()
      sections.push({ title, body })
    }
    blocks.push({ lines: lines.slice(start, i), header, sections })
  }
  return { lead, blocks }
}

// 归类单个版本块：默认仅英文源组块参与（即本轮发版新写入的块）；
// history=true 时块内全部分组一并追溯归类，历史分组标题按其槽位反查后以当前语言 canonical 标题输出
function regroupBlock(block: Block, groups: LanguageGroup[], history: boolean): string[] {
  const source = block.sections.filter((section) => SOURCE_GROUP_SLOTS[section.title] !== undefined)
  // 无英文源组块即历史版本块，默认原样输出、不追溯改写
  if (!history && source.length === 0) return block.lines
  const candidates = history ? block.sections : source
  if (candidates.length === 0) return block.lines
  // 待归类分组含顶层正文时判据不成立，整块保持原样以免丢内容
  if (candidates.some((section) => hasLeadingProse(section.body))) return block.lines
  // 本语言未声明所需槽位时放弃归类，避免条目丢失
  const slots = new Set<SemanticSlot>(groups.map((group) => group.slot))
  const extra = extraPrefixes(groups)
  // 当前语言组标题 → 槽位，供追溯历史块时按既有组标题归位
  const titleSlots = new Map<string, SemanticSlot>(groups.map((group): [string, SemanticSlot] => [group.title, group.slot]))
  // 按分组原出现顺序收集条目：同槽位合并为一组，组内保持原序
  const buckets = new Map<SemanticSlot, string[][]>()
  // 标题无法识别为任何槽位的分组（非源组、非当前语言组、非历史组）：不臆造归属，原样附后
  const kept: Section[] = []
  for (const section of candidates) {
    const fallback = sectionSlot(section.title, titleSlots)
    if (fallback === null) {
      kept.push(section)
      continue
    }
    for (const item of splitItems(section.body)) {
      const slot = explicitSlot(item[0] ?? "", extra) ?? fallback
      const entry = stripSlotPrefix(item, extra)
      const bucket = buckets.get(slot)
      if (bucket) bucket.push(entry)
      else buckets.set(slot, [entry])
    }
  }
  for (const slot of buckets.keys()) {
    if (!slots.has(slot)) return block.lines
  }
  const header = [...block.header]
  while (header.length > 0 && (header[header.length - 1] ?? "").trim() === "") header.pop()
  const lines = [...header, ""]
  for (const group of groups) {
    const items = buckets.get(group.slot)
    if (!items) continue
    lines.push(...renderSection({ title: group.title, body: renderItems(items) }))
  }
  for (const section of kept) lines.push(...renderSection(section))
  return lines
}

// 组标题 → 槽位：当前语言组标题优先，其次历史组标题，最后英文源组标题（追溯历史块时三者都需认）
function sectionSlot(title: string, titleSlots: Map<string, SemanticSlot>): SemanticSlot | null {
  return titleSlots.get(title) ?? LEGACY_TITLE_SLOTS[title] ?? SOURCE_GROUP_SLOTS[title] ?? null
}

// 归类全文件的英文源组块；语言未声明 groups 时退化为纯替换（即既有行为）
function regroupSemantic(content: string, lang: ChangelogLanguage, history: boolean): string {
  const groups = lang.groups
  if (!groups || groups.length === 0) return content
  const { lead, blocks } = parseBlocks(content.split("\n"))
  const lines = [...lead]
  for (const block of blocks) lines.push(...regroupBlock(block, groups, history))
  return lines.join("\n")
}

// 条目逐行相邻输出（单行条目之间不留空行，与仓库既有版式一致）；
// 条目自身的空行与缩进续行随属同一条目，故多段条目的内部版式原样保留。
// 相邻输出同时保证后续「合并连续重复条目 / 合并依赖更新」两道工序仍能命中
function renderItems(items: string[][]): string[] {
  const body: string[] = []
  for (const item of items) body.push(...item)
  return body
}

// 渲染一个分组：标题 + 空行 + 正文 + 尾空行（尾空行即与下一分组的间隔）
function renderSection(section: Section): string[] {
  return [section.title, "", ...section.body, ""]
}

// 把一个分组的正文切成顶层条目，条目随后的空行与缩进续行随属同一条目
function splitItems(body: string[]): string[][] {
  const items: string[][] = []
  for (const line of body) {
    if (line.startsWith("- ")) {
      items.push([line])
      continue
    }
    items[items.length - 1]?.push(line)
  }
  // 条目尾部的空行属条目间分隔，不随条目迁移
  for (const item of items) {
    while (item.length > 1 && (item[item.length - 1] ?? "").trim() === "") item.pop()
  }
  return items
}
