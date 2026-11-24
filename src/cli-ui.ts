// 交互基座：菜单、返回、确认与结果块的唯一入口，各域只接线不重写提示
// 约定：有上级步骤时 ESC 返回上一级，顶层 ESC / Ctrl+C 取消整个命令（130）
import { BACK_CHOICE, EXIT_CHOICE, askWithBack, loadPrompts } from "./prompts"
import { line, style } from "./term-style"

// 菜单项：disabled 为 true 或原因字符串时置灰
export interface MenuChoice<T extends string> {
  name: string
  value: T
  disabled?: boolean | string
}

// 多选项：checked 控制默认勾选；short 为答案行展示值（缺省取 name），checkedName 为勾选后的行内文案
export interface MultiChoice<T extends string> extends MenuChoice<T> {
  checked?: boolean
  short?: string
  checkedName?: string
}

// 分组标题行：Separator 实例由调用方在交互组件加载后构造，这里只做类型透传
type SeparatorChoice = InstanceType<typeof import("@inquirer/prompts").Separator>

// 菜单：back=true 时末位为「← 返回」、ESC 返回 "back"；否则末位为「退出」、ESC 返回 "exit"
export async function runMenu<T extends string>(options: {
  message: string
  choices: Array<MenuChoice<T>>
  back?: boolean
  pageSize?: number
}): Promise<T | "back" | "exit"> {
  const { select } = await loadPrompts()
  const footer = options.back ? BACK_CHOICE : EXIT_CHOICE
  const answer = await askWithBack(() =>
    select<T | "back" | "exit">({
      message: options.message,
      choices: [...options.choices, footer],
      pageSize: options.pageSize,
    }),
  )
  if ("back" in answer) return options.back ? "back" : "exit"
  return answer.value
}

// 单选：ESC 返回 null，由调用方决定回到上一步还是取消
export async function askSelect<T extends string>(options: {
  message: string
  choices: Array<MenuChoice<T>>
  default?: T
  pageSize?: number
}): Promise<T | null> {
  const { select } = await loadPrompts()
  const answer = await askWithBack(() =>
    select<T>({
      message: options.message,
      choices: options.choices,
      default: options.default,
      pageSize: options.pageSize,
    }),
  )
  return "back" in answer ? null : answer.value
}

// 首步单选：末位补「退出」，选中或 ESC 都返回 null（取消整条命令）
export async function askSelectOrExit<T extends string>(options: {
  message: string
  choices: Array<MenuChoice<T>>
  default?: T
  pageSize?: number
}): Promise<T | null> {
  const { select } = await loadPrompts()
  const answer = await askWithBack(() =>
    select<T | "exit">({
      message: options.message,
      choices: [...options.choices, EXIT_CHOICE],
      default: options.default,
      pageSize: options.pageSize,
    }),
  )
  if ("back" in answer || answer.value === "exit") return null
  return answer.value
}

// 子流程单选：末位补「← 返回」，选中或 ESC 都返回 null（回上一步）
export async function askSelectBack<T extends string>(options: {
  message: string
  choices: Array<MenuChoice<T>>
  default?: T
  pageSize?: number
}): Promise<T | null> {
  const { select } = await loadPrompts()
  const answer = await askWithBack(() =>
    select<T | "back">({
      message: options.message,
      choices: [...options.choices, BACK_CHOICE],
      default: options.default,
      pageSize: options.pageSize,
    }),
  )
  if ("back" in answer || answer.value === "back") return null
  return answer.value
}

// 答案行折叠：多选过多时只列前几项，避免提交后的答案铺满屏幕
export const ANSWER_COLLAPSE_LIMIT = 6
export const ANSWER_COLLAPSE_SHOW = 5

// 答案摘要：优先取 short（不含辅助说明），超过上限折叠为「前 N 个 等 M 项」
export function renderSelectedChoices(selected: ReadonlyArray<{ short?: string; name: string }>): string {
  const names = selected.map((choice) => choice.short ?? choice.name)
  if (names.length <= ANSWER_COLLAPSE_LIMIT) return names.join(", ")
  return `${names.slice(0, ANSWER_COLLAPSE_SHOW).join(", ")} 等 ${names.length} 项`
}

// 多选：ESC 返回 null，其余返回选中值（允许空选）；choices 可混入 Separator 做分组标题
// 操作提示由基座补齐，避免各调用方一半带一半不带
export async function askCheckbox<T extends string>(options: {
  message: string
  choices: Array<MultiChoice<T> | SeparatorChoice>
  pageSize?: number
}): Promise<T[] | null> {
  const { checkbox } = await loadPrompts()
  const answer = await askWithBack(() =>
    checkbox<T>({
      message: withCheckboxHint(options.message),
      choices: options.choices,
      pageSize: options.pageSize,
      required: false,
      theme: { style: { renderSelectedChoices } },
    }),
  )
  return "back" in answer ? null : answer.value
}

// 首步多选：末位补「退出」，勾选退出或 ESC 都返回 null（取消整条命令）
export async function askCheckboxOrExit<T extends string>(options: {
  message: string
  choices: Array<MultiChoice<T> | SeparatorChoice>
  pageSize?: number
}): Promise<T[] | null> {
  const { checkbox } = await loadPrompts()
  const answer = await askWithBack(() =>
    checkbox<T | "exit">({
      message: withCheckboxHint(options.message),
      choices: [...options.choices, EXIT_CHOICE],
      pageSize: options.pageSize,
      required: false,
      theme: { style: { renderSelectedChoices } },
    }),
  )
  if ("back" in answer) return null
  if (answer.value.includes("exit")) return null
  return answer.value.filter((value): value is T => value !== "exit")
}

// 多选操作提示：文案里已有「空格切换」就不再重复
function withCheckboxHint(message: string): string {
  return message.includes("空格切换") ? message : `${message}（空格切换，回车确认）`
}

// 子流程多选：末位补「← 返回」，选中或 ESC 都返回 null（回上一步）
export async function askCheckboxBack<T extends string>(options: {
  message: string
  choices: Array<MultiChoice<T> | SeparatorChoice>
  pageSize?: number
}): Promise<T[] | null> {
  const { checkbox } = await loadPrompts()
  const answer = await askWithBack(() =>
    checkbox<T | "back">({
      message: withCheckboxHint(options.message),
      choices: [...options.choices, BACK_CHOICE],
      pageSize: options.pageSize,
      required: false,
      theme: { style: { renderSelectedChoices } },
    }),
  )
  if ("back" in answer) return null
  if (answer.value.includes("back")) return null
  return answer.value.filter((value): value is T => value !== "back")
}

// 文本输入：ESC 返回 null
export async function askInput(options: { message: string; default?: string }): Promise<string | null> {
  const { input } = await loadPrompts()
  const answer = await askWithBack(() => input({ message: options.message, default: options.default }))
  return "back" in answer ? null : answer.value
}

// 是否确认：ESC 返回 null
export async function askConfirm(options: { message: string; default?: boolean }): Promise<boolean | null> {
  const { confirm } = await loadPrompts()
  const answer = await askWithBack(() => confirm({ message: options.message, default: options.default }))
  return "back" in answer ? null : answer.value
}

// 写前确认：先打印预览；--dry-run 只预览，--yes 跳过确认
// verb 按动作定制问句（写入 / 卸载 / 移除），缺省为写入
export async function confirmWrite(options: {
  title: string
  lines: string[]
  default?: boolean
  yes?: boolean
  dryRun?: boolean
  verb?: string
}): Promise<boolean> {
  console.log("")
  console.log(options.title)
  for (const item of options.lines) console.log(`  ${item}`)
  if (options.dryRun) {
    console.log(line.hint("[预演] 未写入任何文件"))
    return false
  }
  if (options.yes) return true
  const ok = await askConfirm({ message: options.verb ?? "继续写入？", default: options.default ?? true })
  return ok === true
}

// 写后结果块：统一「写入文件 + 变更条目 + 当前模式」；诊断走 stderr，stdout 留给数据
export function reportWrite(options: { file: string; added?: string[]; removed?: string[]; notes?: string[]; mode?: string }): void {
  console.error(line.ok(`已写入 ${style.accent(options.file)}`))
  if (options.added && options.added.length > 0) console.error(`  新增：${options.added.join("、")}`)
  if (options.removed && options.removed.length > 0) console.error(`  移除：${options.removed.join("、")}`)
  for (const note of options.notes ?? []) console.error(`  ${note}`)
  if (options.mode) console.error(`  当前：${options.mode}`)
}

// 统一失败出口：诊断走 stderr，置退出码 1，调用方直接 return
export function fail(message: string): void {
  console.error(`⚠️ ${message}`)
  process.exitCode = 1
}

// 取值校验：未传视为通过；非法值统一报错（suffix 用于补充「未执行安装」等收尾语）
export function assertChoice(value: string | undefined, allowed: readonly string[], label: string, suffix = ""): boolean {
  if (value === undefined || allowed.includes(value)) return true
  fail(`${label} 取值须为 ${allowed.join(" / ")}${suffix}`)
  return false
}
