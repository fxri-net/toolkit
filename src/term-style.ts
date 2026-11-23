// 终端样式基建：CLI 内所有着色必须经此模块，禁止各命令自行拼 ANSI 转义（eslint 已设禁令）
// 启用判定一次性收敛在此：显式开关 > FORCE_COLOR > NO_COLOR > 流是否 TTY，调用方不再各自判断

// SGR 颜色序列：Node 18.17 尚无 util.styleText，内置常量避免引入第三方依赖
const SGR = {
  reset: "\u001b[0m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
} as const

// 显式开关的覆盖值：--no-color 等启动参数落定后优先于环境判定；undefined 表示未覆盖
let overrideEnabled: boolean | undefined

// 供 CLI 启动时按 --no-color 关闭；传 undefined 恢复按环境判定（测试复位用）
export function setStyleEnabled(value: boolean | undefined): void {
  overrideEnabled = value
}

// 是否启用样式：FORCE_COLOR 非空且非 0 即开启，其后再看 NO_COLOR 与终端能力
export function isStyleEnabled(): boolean {
  if (overrideEnabled !== undefined) return overrideEnabled
  const env = process.env
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0"
  if (env.NO_COLOR) return false
  // dumb 终端不认 ANSI，开启只会打印转义原文
  if (env.TERM === "dumb") return false
  // 输出被重定向（两个流都非 TTY）时关闭：管道与 CI 日志不需要颜色
  if (!process.stdout.isTTY && !process.stderr.isTTY) return false
  // 旧 conhost 对 ANSI 支持不完整：Windows 仅在已知现代终端下开启
  if (process.platform === "win32") return Boolean(env.WT_SESSION || env.TERM_PROGRAM)
  return true
}

// 上色：关闭时原样返回，调用方无需分支
function paint(code: string, text: string): string {
  return isStyleEnabled() ? `${code}${text}${SGR.reset}` : text
}

// 行首语义符号对应的颜色：统一输出出口据此兜底，命令层不必逐条判断
const LINE_STYLES: ReadonlyArray<readonly [string, string]> = [
  ["✔", SGR.green],
  ["⚠️", SGR.yellow],
  ["✖", SGR.red],
  ["·", SGR.dim],
]

// 按行首语义符号着色：保留缩进与符号，只给其后文本上色
// 已含 ANSI 的文本（调用方显式用过 style.*）原样放行，避免二次上色；只处理首行，多行正文不逐行改写
export function decorate(text: string): string {
  if (!isStyleEnabled() || text.includes("\u001b")) return text
  const newline = text.indexOf("\n")
  const first = newline === -1 ? text : text.slice(0, newline)
  // 预演行只给标记上色：报告类行与说明行统一识别，不必逐处接线
  const previewAt = first.indexOf("[预演]")
  if (previewAt !== -1 && first.slice(0, previewAt).trim() === "") {
    const colored = `${first.slice(0, previewAt)}${paint(SGR.cyan, "[预演]")}${first.slice(previewAt + "[预演]".length)}`
    return newline === -1 ? colored : `${colored}${text.slice(newline)}`
  }
  for (const [symbol, code] of LINE_STYLES) {
    const at = first.indexOf(symbol)
    // 只认行首缩进后的符号：正文中间出现的符号不参与
    if (at === -1 || first.slice(0, at).trim() !== "") continue
    const rest = first.slice(at + symbol.length).replace(/^\s+/, "")
    if (rest === "") return text
    const colored = `${first.slice(0, at)}${symbol} ${code}${rest}${SGR.reset}`
    return newline === -1 ? colored : `${colored}${text.slice(newline)}`
  }
  return text
}

// 统一输出出口：包装 console 三个写入方法，按行首符号兜底着色
// 幂等：重复调用只包一层，避免多次进入 CLI 或测试时叠加包装
let consoleStyled = false
export function installConsoleStyle(): void {
  if (consoleStyled) return
  consoleStyled = true
  for (const method of ["log", "warn", "error"] as const) {
    const original = console[method]
    console[method] = ((...args: unknown[]) =>
      original.apply(console, args.map((arg) => (typeof arg === "string" ? decorate(arg) : arg)))) as typeof console[typeof method]
  }
}

// 行级模板：符号固定、只给其后的文本上色；关闭颜色时符号保留、文本原样
// 存量带 ⚠️ 的告警由 decorate 兜底，这里只承载需要补符号或拆分文案的提示
export const line = {
  // 成功：✔ + 绿色
  ok: (text: string): string => `✔ ${paint(SGR.green, text)}`,
  // 失败：✖ + 红色
  error: (text: string): string => `✖ ${paint(SGR.red, text)}`,
  // 取消 / 中性收尾：整体暗色，不加成功符号
  hint: (text: string): string => paint(SGR.dim, text),
}

// 语义色唯一入口：成功 / 告警 / 失败 / 次要说明 / 行内强调
// ⚠️ 只传文本、不传 emoji：emoji 宽度按 2 计，与文本一起上色在部分终端会错位
export const style = {
  // 成功：绿色
  ok: (text: string): string => paint(SGR.green, text),
  // 告警：黄色
  warn: (text: string): string => paint(SGR.yellow, text),
  // 失败：红色
  error: (text: string): string => paint(SGR.red, text),
  // 次要说明：暗色
  hint: (text: string): string => paint(SGR.dim, text),
  // 行内路径 / 命令名：青色
  accent: (text: string): string => paint(SGR.cyan, text),
}

// 枚举人读文案：文本层只给中文，机器键只进 JSON；新增枚举先在此登记
export const scopeModeText: Record<string, string> = {
  all: "全部生效",
  allowlist: "仅名单内生效",
  denylist: "全部生效（兼容读取 denylist）",
}

export const policyEffectText: Record<string, string> = {
  allow: "允许",
  deny: "拒绝",
}

export const policyLayerText: Record<string, string> = {
  global: "全局层",
  project: "项目层",
  local: "本地层",
}

export const usageChannelText: Record<string, string> = {
  rule: "全局规则上报（rule）",
  hook: "Agent Hook（hook）",
}

export const usageSkillsModeText: Record<string, string> = {
  all: "全部采集（all）",
  include: "仅名单（include）",
  exclude: "排除名单（exclude）",
  none: "不采集（none）",
}

export const usageRotationText: Record<string, string> = {
  monthly: "按月（monthly）",
  size: "按大小（size）",
  none: "不轮转（none）",
}

export const notifyFrequencyText: Record<string, string> = {
  always: "每次（always）",
  daily: "每天（daily）",
  weekly: "每周（weekly）",
  off: "关闭（off）",
}

// 查表：未知取值原样返回，避免把写错的配置悄悄吞掉
export function termText(map: Record<string, string>, value: string): string {
  return map[value] ?? value
}
