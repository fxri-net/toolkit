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
