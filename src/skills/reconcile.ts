// 产物收敛：按当前配置与现场重算形态，只重写不一致的技能；不改选择集、不新增技能
import { deliveryModeLabel } from "./delivery"
import { installSkills } from "./install/global"
import { installProjectSkills } from "./install/project"
import { planProjectSkills, planSkills, type CurrentForm, type DeliveryAction, type SkillPlanItem } from "./plan"

// 收敛口径：changed 已重写 / failed 仍未收敛 / pending 仅预演
export interface ReconcileItem {
  name: string
  status: "changed" | "failed" | "pending"
  message: string
}

export interface ReconcileResult {
  scope: "global" | "project"
  items: ReconcileItem[]
  changed: number
  failed: number
}

export interface ReconcileOptions {
  scope: "global" | "project"
  startDir?: string
  // 只收敛指定技能；省略时按现场全部已登记技能
  skills?: string[]
  dryRun?: boolean
}

// 现场形态人读：与 install --dry-run 的列口径一致
export function currentFormLabel(form: CurrentForm): string {
  if (form === "none") return "未安装"
  if (form === "full") return "全文安装"
  if (form === "gated") return "入口壳"
  return "异常产物"
}

// 动作人读
function actionLabel(action: DeliveryAction): string {
  if (action === "shell") return "写入口壳"
  if (action === "full") return "写全文"
  if (action === "clean") return "清理残留"
  return "保持"
}

// 待收敛条目：同一技能可能有多个目标，按名字去重后取第一条差异说明
function pendingItems(items: SkillPlanItem[]): ReconcileItem[] {
  const byName = new Map<string, ReconcileItem>()
  for (const item of items) {
    if (item.action === "keep" || byName.has(item.name)) continue
    byName.set(item.name, {
      name: item.name,
      status: "pending",
      message: `${currentFormLabel(item.current)} → ${deliveryModeLabel(item.target)}（${actionLabel(item.action)}）`,
    })
  }
  return [...byName.values()]
}

// 计划：与 install 共用来源与目标解析，只列有差异的条目
function planFor(options: ReconcileOptions): { items: ReconcileItem[] } {
  const plan =
    options.scope === "global"
      ? planSkills({ skills: options.skills })
      : planProjectSkills({ cwd: options.startDir, skills: options.skills, refreshOnly: true })
  return { items: pendingItems(plan.targets.flatMap((target) => target.items)) }
}

// 收敛：先算差异，再按面重写产物，最后复核仍待收敛的条目
export function reconcileSkills(options: ReconcileOptions): ReconcileResult {
  const startDir = options.startDir ?? process.cwd()
  const before = planFor({ ...options, startDir })
  if (before.items.length === 0 || options.dryRun) {
    return { scope: options.scope, items: before.items, changed: 0, failed: 0 }
  }
  const names = before.items.map((item) => item.name)
  if (options.scope === "global") {
    installSkills({ skills: names, saveSelection: false, saveTargets: false })
  } else {
    installProjectSkills({ cwd: startDir, skills: names, refresh: true })
  }
  const after = planFor({ ...options, startDir, skills: names })
  const remaining = new Set(after.items.map((item) => item.name))
  const items = before.items.map((item) => ({
    ...item,
    status: remaining.has(item.name) ? ("failed" as const) : ("changed" as const),
  }))
  return {
    scope: options.scope,
    items,
    changed: items.filter((item) => item.status === "changed").length,
    failed: items.filter((item) => item.status === "failed").length,
  }
}
