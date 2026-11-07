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

// 锚点格式：YYYY-MM-DD HH:mm，固定宽度可直接按字符串比较新旧
export function isRuleAnchor(value: string): boolean {
  return ANCHOR_PATTERN.test(value)
}

// 组合输出首行：与三篇规则页现有措辞保持一致，避免拆分后出现无谓 diff
export function ruleAnchorLine(time: string): string {
  return `> 规则更新时间 ${time}。本规则内容变更时以变更时刻更新此值；快照与本规则当前值不一致即说明已失同步，重新复制本规则即可。`
}

// 按传入顺序组合：重复 id 保留首次位置；锚点取所选模块最大值，与顺序无关
export function composeModules(modules: RuleModule[], ids: string[], options: ComposeOptions = {}): string {
  if (ids.length === 0) throw new Error("至少选择一个规则模块")
  const byId = new Map(modules.map((mod) => [mod.id, mod]))
  const ordered: RuleModule[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) continue
    const mod = byId.get(id)
    if (!mod) throw new Error(`未知规则模块「${id}」，可选：${modules.map((item) => item.id).join(" / ")}`)
    if (!isRuleAnchor(mod.anchor)) throw new Error(`规则模块「${id}」的更新时间格式不合法：${mod.anchor}`)
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
