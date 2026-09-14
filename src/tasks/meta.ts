// 归档元数据行解析单一实现：query 展示与 archive-block 补全复用，避免双实现漂移
// 行示例：`> 负责人：唐启云　状态：已完成　范围：全局　完成时间：2026-09-03 10:00`
// 仅以全角 `　` 分段（半角空格不切分，会被并入前一段的值）、全角/半角冒号均可识别

export interface MetaSegments {
  owner?: string
  status?: string
  scope?: string
  completed?: string
}

export function parseMetaSegments(metaLine: string | null): MetaSegments {
  const out: MetaSegments = {}
  if (!metaLine) return out
  for (const part of metaLine.replace(/^>\s*/, "").split(/[　]+/).map((s) => s.trim()).filter(Boolean)) {
    const idx = part.search(/[：:]/)
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    if (!key || !val) continue
    if (key.includes("负责人")) out.owner = val
    else if (key.includes("状态")) out.status = val
    else if (key.includes("范围")) out.scope = val
    else if (key.includes("完成时间")) out.completed = val
  }
  return out
}
