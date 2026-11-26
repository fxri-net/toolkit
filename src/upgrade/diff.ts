// 升级差异预览：把「将要写入的内容」与当前文件逐行比对，供 upgrade --diff 展示
import { existsSync } from "node:fs"
import { createTwoFilesPatch } from "diff"
import { readTextFile } from "../read-text"
import { planConfigContent } from "./config-plan"
import { planPackageContent } from "./apply"
import type { UpgradeItem } from "./types"

// 单个文件的差异条目：file 为原路径，patch 为 unified diff 文本
export interface UpgradeDiff {
  file: string
  patch: string
}

// 取单项的文本改写预览：只有配置与 package.json 会产生行级差异，其余面由计划清单承载
function previewOf(item: UpgradeItem, options: { pruneLegacy?: boolean }): Array<{ file: string; changed: boolean; content?: string }> {
  if (item.surface === "config") {
    return item.files.map((file) => ({ file, ...planConfigContent(file, { pruneLegacy: options.pruneLegacy, layer: item.layers[0] }) }))
  }
  if (item.id === "project:package") return item.files.map((file) => ({ file, ...planPackageContent(file) }))
  return []
}

// 汇总整份计划的差异：需人工项不参与预览，无变化或文件缺失时跳过
export function planUpgradeDiffs(items: UpgradeItem[], options: { pruneLegacy?: boolean } = {}): UpgradeDiff[] {
  const diffs: UpgradeDiff[] = []
  for (const item of items) {
    if (item.status === "manual") continue
    for (const preview of previewOf(item, options)) {
      if (!preview.changed || preview.content === undefined || !existsSync(preview.file)) continue
      const before = readTextFile(preview.file)
      if (before === preview.content) continue
      diffs.push({
        file: preview.file,
        patch: createTwoFilesPatch(preview.file, preview.file, before, preview.content, "", "", { context: 3 }),
      })
    }
  }
  return diffs
}
