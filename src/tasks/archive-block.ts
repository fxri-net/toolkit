// 归档块统一解析与渲染：归档合并（archive.ts）与归一化检查/修复（normalize.ts）共用同一实现，
// 保证对同一归档文件解析出的任务块集合一致。
// 任务块判定：`## 标题` 后首个非空行为含「完成时间」的元数据行；正文内部的 `## ` 小节（后无元数据行）归属前一块正文，避免误判为任务边界。

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
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return t
  const date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
  if (m.length === 4) return `${date} 00:00`
  return `${date} ${m[4].padStart(2, "0")}:${m[5]}`
}

// 从块标题提取负责人：形如 `20260903-唐启云-xxx` 取中段，否则返回空
function ownerFromTitle(title: string): string {
  const m = title.match(/^\d{8}-(.+?)-/)
  return m ? m[1] : ""
}

// 生成规范的元数据行
export function buildMetaLine(title: string, completed: string): string {
  const owner = ownerFromTitle(title) || "未标注"
  return `> 负责人：${owner}　状态：已完成　范围：-　完成时间：${normalizeCompleted(completed)}`
}

// 解析归档文件，返回文件头（首块之前的内容，末尾无空行）与任务块列表
export function parseArchiveBlocks(content: string): { header: string; blocks: ArchiveBlockInfo[] } {
  const lines = content.split(/\r?\n/)
  // 定位任务块标题行：跳过其后空行，首个非空行需为含「完成时间」的元数据行
  const blockStarts: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^## .+/.test(lines[i])) continue
    let j = i + 1
    while (j < lines.length && lines[j].trim() === "") j++
    const first = lines[j]?.trim() ?? ""
    if (first.startsWith("> ") && first.includes("完成时间")) blockStarts.push(i)
  }
  if (blockStarts.length === 0) return { header: content, blocks: [] }
  const header = lines.slice(0, blockStarts[0]).join("\n").trimEnd()
  const blocks: ArchiveBlockInfo[] = []
  for (let k = 0; k < blockStarts.length; k++) {
    const start = blockStarts[k]
    const end = k + 1 < blockStarts.length ? blockStarts[k + 1] : lines.length
    const chunkLines = lines.slice(start, end).join("\n").trim().split("\n")
    const title = chunkLines[0].replace(/^## /, "")
    let metaLine: string | null = null
    let completed = ""
    let bodyStart = 1
    for (let i = 1; i < chunkLines.length; i++) {
      const t = chunkLines[i].trim()
      if (t.startsWith("> ") && t.includes("完成时间")) {
        metaLine = chunkLines[i]
        const m = t.match(/完成时间：(.+)$/)
        if (m) completed = m[1].trim()
        bodyStart = i + 1
        break
      }
    }
    blocks.push({ title, metaLine, completed, body: trimBlockBody(chunkLines.slice(bodyStart)) })
  }
  return { header, blocks }
}

// 清理块正文：去掉块尾作为任务分隔符的 `---` 及其前后空行（可能残留多段），避免重复归档时分隔符累加
function trimBlockBody(lines: string[]): string {
  const out = [...lines]
  for (;;) {
    while (out.length > 0 && out[out.length - 1].trim() === "") out.pop()
    if (out.length > 0 && /^---+\s*$/.test(out[out.length - 1].trim())) out.pop()
    else break
  }
  return out.join("\n").trim()
}

// 疑似任务块扫描：形如 `## {YYYYMMDD}-{负责人}-{简述}` 的标题，其后首个非空行为 `> ` 元数据但缺「完成时间」，
// 说明该块可能因元数据不完整被解析器归入前一块正文，需要人工确认（不自动修复，避免误判正文小节）
export function scanOrphanBlocks(content: string): string[] {
  const lines = content.split(/\r?\n/)
  const orphans: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const title = lines[i].match(/^## (\d{8}-[^-]+-.+)$/)?.[1]
    if (!title) continue
    let j = i + 1
    while (j < lines.length && lines[j].trim() === "") j++
    const first = lines[j]?.trim() ?? ""
    if (first.startsWith("> ") && !first.includes("完成时间")) orphans.push(title)
  }
  return orphans
}

// 组装块文本（无元数据行且无完成时间时，保持无元数据行的原始结构）
export function renderBlock(b: ArchiveBlockInfo): string {
  const meta = b.metaLine ?? (b.completed ? buildMetaLine(b.title, b.completed) : null)
  return meta ? `## ${b.title}\n\n${meta}\n\n${b.body}` : `## ${b.title}\n\n${b.body}`
}
