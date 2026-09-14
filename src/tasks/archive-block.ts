// 归档块统一解析与渲染：归档合并（archive.ts）与归一化检查/修复（normalize.ts）共用同一实现，
// 保证对同一归档文件解析出的任务块集合一致。
// 任务块边界：块间 `---` 分隔符为唯一权威边界；`## 标题` 与 `> 元数据` 行降为校验项（缺失时仍解析为块，交由 normalize 报告），
// 正文内部的 `## ` 小节因此不会被误判为任务边界。
import { stripBom } from "../read-text"
import { parseMetaSegments } from "./meta"

// 归档块结构
export interface ArchiveBlockInfo {
  title: string
  metaLine: string | null
  completed: string
  body: string
}

// 统一完成时间为 YYYY-MM-DD HH:mm 定宽格式（年月日时分不足两位补零；纯日期补 00:00），解析失败返回原值
export function normalizeCompleted(completed: string): string {
  const t = completed.trim()
  const m =
    t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{2})(?::\d{2})?$/) ??
    t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return t
  const pad = (s: string | undefined) => s?.padStart(2, "0") ?? ""
  const date = `${m[1] ?? ""}-${pad(m[2])}-${pad(m[3])}`
  if (m.length === 4) return `${date} 00:00`
  return `${date} ${pad(m[4])}:${pad(m[5])}`
}

// 从块标题提取负责人：形如 `20260903-唐启云-xxx` 取中段，否则返回空
function ownerFromTitle(title: string): string {
  const m = title.match(/^\d{8}-(.+?)-/)
  return m?.[1] ?? ""
}

// 生成规范的元数据行
export function buildMetaLine(title: string, completed: string): string {
  const owner = ownerFromTitle(title) || "未标注"
  return `> 负责人：${owner}　状态：已完成　范围：-　完成时间：${normalizeCompleted(completed)}`
}

// 补齐元数据行：保留原行已有的 负责人/状态/范围 段，仅补缺失项，避免整行重写改错状态（如 已放弃→已完成）
export function completeMetaLine(title: string, completed: string, metaLine: string | null): string {
  const seg = parseMetaSegments(metaLine)
  const owner = seg.owner || ownerFromTitle(title) || "未标注"
  const status = seg.status || "已完成"
  const scope = seg.scope || "-"
  return `> 负责人：${owner}　状态：${status}　范围：${scope}　完成时间：${normalizeCompleted(completed)}`
}

// 解析归档文件，返回文件头（首块之前的内容，末尾无空行）与任务块列表
export function parseArchiveBlocks(content: string): { header: string; blocks: ArchiveBlockInfo[] } {
  // 先剥 BOM：否则首个 `## ` 标题行与元数据行会因前导字节序识别失败
  content = stripBom(content)
  // 剥掉行尾孤立 `\r`（历史污染的 `\r\r\n` 按 `\r?\n` 切分后残留），避免渲染写回时再次产生双重 CR
  const lines = content.split(/\r?\n/).map((l) => l.replace(/\r$/, ""))
  // 以块间 `---` 分隔符为唯一权威边界切段：标题行与元数据行不再参与边界判定，正文内部的 `## ` 小节不会被误切
  const chunks: string[][] = []
  let cur: string[] = []
  for (const line of lines) {
    if (/^-{3,}$/.test(line.trim())) {
      chunks.push(cur)
      cur = []
    } else {
      cur.push(line)
    }
  }
  chunks.push(cur)

  const blocks: ArchiveBlockInfo[] = []
  // 首段含文件头与首块，以第一个 `## ` 标题行分界，其前内容为文件头
  const first = trimBlankLines(chunks[0] ?? [])
  const firstTitle = first.findIndex((l) => /^## .+/.test(l))
  if (firstTitle >= 0) blocks.push(toBlock(first.slice(firstTitle)))
  // 其余各段各为一个任务块；段首无标题行时并入前一块正文，避免历史数据被静默丢弃
  for (let i = 1; i < chunks.length; i++) {
    const chunk = trimBlankLines(chunks[i] ?? [])
    if (chunk.length === 0) continue
    if (/^## .+/.test(chunk[0] ?? "")) blocks.push(toBlock(chunk))
    else appendToLastBody(blocks, chunk.join("\n").trim())
  }
  if (blocks.length === 0) return { header: content, blocks: [] }
  const headerEnd = firstTitle >= 0 ? firstTitle : first.length
  return { header: first.slice(0, headerEnd).join("\n").trimEnd(), blocks }
}

// 去除行段首尾的空行（段内空行保留，用于块正文）
function trimBlankLines(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && (lines[start] ?? "").trim() === "") start++
  while (end > start && (lines[end - 1] ?? "").trim() === "") end--
  return lines.slice(start, end)
}

// 行段 → 任务块：首行为标题，其后首个含「完成时间」的 `> ` 行为元数据行，余下为正文
function toBlock(lines: string[]): ArchiveBlockInfo {
  const title = (lines[0] ?? "").replace(/^## /, "").trim()
  let metaLine: string | null = null
  let completed = ""
  let bodyStart = 1
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i] ?? ""
    const t = raw.trim()
    if (t.startsWith("> ") && t.includes("完成时间")) {
      metaLine = raw
      const m = t.match(/完成时间：(.+)$/)
      if (m) completed = (m[1] ?? "").trim()
      bodyStart = i + 1
      break
    }
  }
  return { title, metaLine, completed, body: lines.slice(bodyStart).join("\n").trim() }
}

// 段首无任务标题时并入前一块正文（历史数据兜底，避免内容丢失）
function appendToLastBody(blocks: ArchiveBlockInfo[], text: string): void {
  const last = blocks[blocks.length - 1]
  if (!last || !text) return
  last.body = last.body ? `${last.body}\n\n${text}` : text
}

// 疑似任务块扫描：正文内部出现形如 `## {YYYYMMDD}-{负责人}-{简述}` 的标题，说明该块缺少块间 `---` 分隔符，
// 已被归入前一块正文，需要人工确认（不自动修复，避免误判正文小节）
export function scanOrphanBlocks(content: string): string[] {
  const orphans: string[] = []
  for (const b of parseArchiveBlocks(content).blocks) {
    for (const m of b.body.matchAll(/^## (\d{8}-[^-]+-.+)$/gm)) {
      if (m[1]) orphans.push(m[1])
    }
  }
  return orphans
}

// 组装块文本（无元数据行且无完成时间时，保持无元数据行的原始结构）
export function renderBlock(b: ArchiveBlockInfo): string {
  const meta = b.metaLine ?? (b.completed ? buildMetaLine(b.title, b.completed) : null)
  return meta ? `## ${b.title}\n\n${meta}\n\n${b.body}` : `## ${b.title}\n\n${b.body}`
}

// 块集合写盘前的规范化：按块标题去重（同一日期文件内标题唯一，同标题以最后写入者为准，
// 保证重复归档/重复导入幂等），再按完成时间降序排列（不可解析完成时间的块保持原相对顺序落到末尾）
export function orderBlocks(blocks: ArchiveBlockInfo[]): ArchiveBlockInfo[] {
  const byTitle = new Map<string, ArchiveBlockInfo>()
  for (const b of blocks) byTitle.set(b.title, b)
  const unique = [...byTitle.values()]
  const dated = unique.filter((b) => normalizeCompleted(b.completed))
  const undated = unique.filter((b) => !normalizeCompleted(b.completed))
  dated.sort((a, b) => normalizeCompleted(b.completed).localeCompare(normalizeCompleted(a.completed)))
  return [...dated, ...undated]
}

// 组装归档文件全文：header + 规范化块集合（去重 + 降序 + 块间 `---` 分隔），统一换行风格；
// 归档、归一化、导入三处写盘共用，避免各自拼接导致块集合不变量漂移
export function renderArchiveFile(header: string, blocks: ArchiveBlockInfo[], eol = "\n"): string {
  const body = orderBlocks(blocks).map(renderBlock).join("\n\n---\n\n")
  const text = header ? `${header}\n\n${body}\n` : `${body}\n`
  return text.replace(/\n/g, eol)
}
