// 作用域写盘的统一出口：预览 → 确认 → 落盘 → 结果块，命令与向导共用
import { confirmWrite, reportWrite } from "../cli-ui"
import { isInteractive } from "../prompts"
import { line } from "../term-style"
import { applyPlan, describePlan, modeLabel, type ScopeEditPlan } from "./edit"

export async function applyScopePlan(title: string, plan: ScopeEditPlan, options: { dryRun?: boolean; yes?: boolean } = {}): Promise<void> {
  if (!plan.changed) {
    for (const text of describePlan(plan)) console.log(line.hint(text))
    return
  }
  const confirmed = await confirmWrite({
    title,
    lines: describePlan(plan),
    yes: Boolean(options.yes) || !isInteractive(),
    dryRun: Boolean(options.dryRun),
  })
  if (options.dryRun) return
  if (!confirmed) {
    console.error(line.hint("已取消，未写入任何文件"))
    return
  }
  applyPlan(plan)
  reportWrite({ file: plan.target.file, notes: plan.changes, mode: modeLabel(plan.nextMode) })
}
