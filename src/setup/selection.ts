// 勾选记忆：记录上次确认的四项勾选，下次进入接入向导时作为初始勾选
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { cachePath } from "../cache"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import type { StepId } from "./steps"

const SELECTION_FILE = "setup-selection.json"

// 四项勾选：缺项表示未记录，由代码默认值兜底
export type SetupSelection = Partial<Record<StepId, boolean>>

const STEP_IDS: readonly StepId[] = ["skills", "rules", "scope", "usage"]

export function setupSelectionPath(): string {
  return cachePath(SELECTION_FILE)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

// 读取记忆：文件缺失或结构不兼容返回 null；逐项只采纳布尔值，其余回落默认
export function readSetupSelection(): SetupSelection | null {
  const file = setupSelectionPath()
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readTextFile(file)) as unknown
    if (!isRecord(parsed) || parsed.schema !== 1 || !isRecord(parsed.selected)) throw new Error("结构不兼容")
    const selection: SetupSelection = {}
    for (const id of STEP_IDS) {
      const value = parsed.selected[id]
      if (typeof value === "boolean") selection[id] = value
    }
    return Object.keys(selection).length > 0 ? selection : null
  } catch (error) {
    console.warn(`⚠️ 忽略 setup 勾选记忆 ${file}：${(error as Error).message}`)
    return null
  }
}

// 写入记忆：四项全写，未勾选记为 false，使「上次取消勾选」下次仍保持未勾
export function writeSetupSelection(picked: readonly StepId[]): void {
  const file = setupSelectionPath()
  mkdirSync(dirname(file), { recursive: true })
  const selected = Object.fromEntries(STEP_IDS.map((id) => [id, picked.includes(id)]))
  writeFileAtomic(file, `${JSON.stringify({ schema: 1, selected }, null, 2)}\n`)
}
