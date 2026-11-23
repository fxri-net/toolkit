// 交互选项排版：名称 + 暗色单行辅助说明，按终端列数与前后缀占用算预算
// 各交互面只传参数，不自行拼 ANSI、不自行截断，保证「永不换行」与主次一致
import { style } from "./term-style"
import { displayWidth, firstSentence, stripMarkdownInline, truncateDisplay, truncateMiddle } from "./text-line"

// 无 TTY 列数时与 inquirer 同口径回落（inquirer 默认 80）
export const DEFAULT_COLUMNS = 80
// 名称与辅助说明之间的间隔
export const CHOICE_GAP = "  "
// 预算低于该值就不展示说明，只保留名称
export const CHOICE_MIN_SUMMARY = 8

// 当前终端列数：过窄或取不到时回落默认值
export function terminalColumns(): number {
  const columns = process.stdout.columns
  return columns && columns > 20 ? columns : DEFAULT_COLUMNS
}

// 选项行：reserved 为光标 / 勾选符 / 分隔符与禁用原因等占用的列数
// path 为真时名称按中段省略，保留末段辨识度
export function formatChoiceLine(options: {
  name: string
  description?: string
  reserved?: number
  columns?: number
  path?: boolean
}): string {
  const columns = options.columns ?? terminalColumns()
  const reserved = options.reserved ?? 5
  const name = options.path ? truncateMiddle(options.name, Math.max(8, columns - reserved)) : options.name
  const description = options.description ? firstSentence(stripMarkdownInline(options.description)) : ""
  const budget = columns - reserved - displayWidth(name) - CHOICE_GAP.length
  if (!description || budget < CHOICE_MIN_SUMMARY) return name
  return `${name}${CHOICE_GAP}${style.hint(truncateDisplay(description, budget))}`
}
