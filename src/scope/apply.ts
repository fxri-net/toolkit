// 作用域写盘的统一出口：预览 → 确认 → 落盘 → 结果块 → 产物联动，命令与向导共用
import { confirmWrite, reportWrite } from "../cli-ui"
import { isInteractive } from "../prompts"
import { line } from "../term-style"
import { applyArtifactLinkage, describeShapeChanges, previewShapeChanges } from "./artifact-linkage"
import { applyPlan, describePlan, modeLabel, type ScopeEditPlan } from "./edit"
import { mergeActivation } from "./plan"

export async function applyScopePlan(
  title: string,
  plan: ScopeEditPlan,
  options: { dryRun?: boolean; yes?: boolean; noLink?: boolean } = {},
): Promise<void> {
  if (!plan.changed) {
    for (const text of describePlan(plan)) console.log(line.hint(text))
    return
  }
  // 写前预演：配置变更与技能形态变更同屏展示，确认前即可看到产物影响
  const projected = mergeActivation(plan.config, { mode: plan.nextMode, include: plan.nextInclude, exclude: plan.nextExclude })
  const changes = options.noLink ? [] : previewShapeChanges(plan.layer, projected, plan.startDir)
  const lines = [...describePlan(plan), ...(options.noLink ? [] : describeShapeChanges(changes))]
  const confirmed = await confirmWrite({
    title,
    lines,
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
  if (options.noLink) {
    console.error(line.hint("已只写配置，产物未联动，可重跑 toolkit skill reconcile"))
    return
  }
  const outcome = applyArtifactLinkage(changes, plan.startDir)
  for (const text of outcome.lines) console.log(line.hint(text))
  if (outcome.failed > 0) {
    console.error(`⚠️ 配置已写入，产物未完全收敛（${outcome.failed} 项），可重跑 toolkit skill reconcile`)
    process.exitCode = 1
  }
}
