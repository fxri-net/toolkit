// 接入向导编排：检查环境 → 选择要配置的内容 → 串行执行 → 汇总
import { INIT_LINKS } from "../links"
import { EXIT } from "../exit-codes"
import { formatChoiceLine } from "../prompt-line"
import { isInteractive, reportCancelled, runInteractive } from "../prompts"
import { askCheckbox } from "../cli-ui"
import { line } from "../term-style"
import { inspectSetupSteps, runSetupStep, type StepId, type SetupStep } from "./steps"

export interface SetupOptions {
  yes?: boolean
  dryRun?: boolean
  rules?: string
  skills?: string
  scope?: boolean
  usage?: boolean
}

type StepOutcome = { status: "done" } | { status: "failed"; error: string }

// 体检结果只作状态展示，不替用户决定交互步骤
function reportEnvironment(steps: SetupStep[]): void {
  console.log("检查环境")
  for (const step of steps) {
    if (!step.readiness) continue
    console.log(line.hint(`  ${step.label}：${step.ready ? "已就绪" : "未配置"}`))
  }
  console.log("")
}

// 汇总：逐项结论 + 失败重试命令 + 结束指引
function reportOutcome(steps: SetupStep[], outcomes: Map<string, StepOutcome>): void {
  console.log("")
  console.log("配置完成")
  for (const step of steps) {
    const outcome = outcomes.get(step.id)
    if (!outcome) {
      console.log(line.hint(`  · ${step.label}（未选择）`))
    } else if (outcome.status === "done") {
      console.log(`  ✔ ${step.label}`)
    } else {
      console.log(`  ✖ ${step.label}（重试：${step.retry}）`)
    }
  }
  console.log("")
  console.log(line.hint("下一步："))
  console.log(line.hint("  把规则粘贴到所用 Agent 的全局规则入口（Trae 设置 → 规则 / Claude Code 的 CLAUDE.md / Cursor 的 User Rules）"))
  console.log(line.hint("  进入项目后对 AI 说「初始化任务区」，由技能执行 toolkit task init"))
  console.log(line.hint(`  快速开始（在线，可选）：${INIT_LINKS.gettingStarted}`))
}

export async function runSetupWizard(options: SetupOptions): Promise<void> {
  const preset = options.rules ?? "recommended"
  const steps = inspectSetupSteps(preset, options.rules !== undefined)
  const pick = (id: StepId) => steps.find((step) => step.id === id)

  // 显式参数即视为勾选，避免未进交互时漏做
  if (options.skills) {
    const step = pick("skills")
    if (step) {
      step.selected = true
      step.argv = ["skill", "install", "--scope", options.skills]
      step.argvYes = ["skill", "install", "--scope", options.skills, "--yes"]
    }
  }
  if (options.scope === false) {
    const step = pick("scope")
    if (step) step.selected = false
  }
  if (options.usage === false) {
    const step = pick("usage")
    if (step) step.selected = false
  }

  reportEnvironment(steps)

  if (options.yes) {
    // 零交互：有默认参数的步骤按默认值执行；范围与统计不替用户做决定
    for (const step of steps) {
      if (step.argvYes) step.argv = step.argvYes
      else step.selected = false
    }
  } else if (!isInteractive()) {
    console.error("⚠️ 当前环境无法交互，请加 --yes 以默认值执行")
    process.exitCode = EXIT.INTERACTIVE
    return
  } else {
    await runInteractive(async () => {
      const picked = await askCheckbox<StepId>({
        message: "要配置哪些内容",
        escape: "cancel",
        choices: steps.map((step) => ({
          name: formatChoiceLine({ name: step.label, description: step.summary }),
          value: step.id,
          checked: step.selected,
        })),
      })
      for (const step of steps) step.selected = picked?.includes(step.id) ?? false
    })
  }

  const chosen = steps.filter((step) => step.selected)
  if (chosen.length === 0) {
    reportCancelled()
    return
  }

  if (options.dryRun) {
    console.log(line.hint("将执行："))
    for (const step of chosen) console.log(line.hint(`  ${step.label} → toolkit ${step.argv.join(" ")}`))
    return
  }

  const outcomes = new Map<string, StepOutcome>()
  for (const step of chosen) {
    console.log(`▶ ${step.label}`)
    try {
      await runSetupStep(step.argv)
      outcomes.set(step.id, { status: "done" })
    } catch (e) {
      const error = (e as Error).message
      outcomes.set(step.id, { status: "failed", error })
      console.error(`⚠️ ${step.label}失败：${error}`)
    }
  }

  reportOutcome(steps, outcomes)
  if ([...outcomes.values()].every((outcome) => outcome.status === "failed")) process.exitCode = EXIT.FAIL
}
