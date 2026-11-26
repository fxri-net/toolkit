// 规则组合核心：纯函数，不读写文件，CLI 与文档站共用
export interface RuleModule {
  id: string
  anchor: string
  body: string
}

export interface ComposeOptions {
  // false 时不输出首行锚点，便于嵌进其它文档
  anchor?: boolean
}

const ANCHOR_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/

// 旧模块 id 迁移：practices 已更名为 preferences，命令行与旧缓存仍可沿用旧名
export const RULE_MODULE_ALIASES: Readonly<Record<string, string>> = { practices: "preferences" }

// 归一模块 id：命中别名时返回新 id，未命中原样返回
export function normalizeRuleModuleId(id: string): string {
  return RULE_MODULE_ALIASES[id] ?? id
}

// 锚点格式：YYYY-MM-DD HH:mm，固定宽度可直接按字符串比较新旧
export function isRuleAnchor(value: string): boolean {
  return ANCHOR_PATTERN.test(value)
}

// 组合输出首行只留时间戳：它是随规则复制走的快照自查参照物，
// 而「快照不一致就重新复制」的说明属于规则页读者，留在页面正文，不进块内
export function ruleAnchorLine(time: string): string {
  return `> 规则更新时间 ${time}`
}

// 按传入顺序组合：重复 id 保留首次位置；锚点取所选模块最大值，与顺序无关
export function composeModules(modules: RuleModule[], ids: string[], options: ComposeOptions = {}): string {
  if (ids.length === 0) throw new Error("至少选择一个规则模块")
  const byId = new Map(modules.map((mod) => [mod.id, mod]))
  const ordered: RuleModule[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = normalizeRuleModuleId(raw)
    if (seen.has(id)) continue
    const mod = byId.get(id)
    if (!mod) throw new Error(`未知规则模块「${raw}」，可选：${modules.map((item) => item.id).join(" / ")}`)
    if (!isRuleAnchor(mod.anchor)) throw new Error(`规则模块「${raw}」的更新时间格式不合法：${mod.anchor}`)
    seen.add(id)
    ordered.push(mod)
  }
  const body = ordered.map((mod) => mod.body.trim()).join("\n\n")
  if (options.anchor === false) return body
  const latest = ordered
    .map((mod) => mod.anchor)
    .sort()
    .pop() as string
  return `${ruleAnchorLine(latest)}\n\n${body}`
}
