// 阈值单源守卫：文档引用的数字与代码常量必须一致，改动任一侧都会在此失败
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { MAX_UTC_OFFSET_HOURS } from "../date"
import { LIST_PAGE_SIZE } from "../prompts"
import { HELD_TERMINATE_DAYS, HELD_WARN_DAYS } from "../tasks/list"
import { CHECK_TTL, FAIL_TTL } from "../update-check"
import { DEFAULT_USAGE_CONFIG } from "../usage/config"

// 文档原文：用于断言文档复述的阈值与代码常量一致，避免任一侧改动后静默漂移
function doc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8")
}

describe("阈值常量", () => {
  it("搁置警示与终结阈值保持 90 天 / 1 年", () => {
    expect(HELD_WARN_DAYS).toBe(90)
    expect(HELD_TERMINATE_DAYS).toBe(365)
    expect(HELD_WARN_DAYS).toBeLessThan(HELD_TERMINATE_DAYS)
  })

  it("更新检查成功间隔 24 小时、失败重试 1 小时", () => {
    expect(CHECK_TTL).toBe(24 * 60 * 60 * 1000)
    expect(FAIL_TTL).toBe(60 * 60 * 1000)
    expect(FAIL_TTL).toBeLessThan(CHECK_TTL)
  })

  it("跨时区容差与列表分页保持既有口径", () => {
    expect(MAX_UTC_OFFSET_HOURS).toBe(14)
    expect(LIST_PAGE_SIZE).toBe(15)
  })
})

describe("文档引用的阈值与代码常量一致", () => {
  const heldWarn = `超 ${HELD_WARN_DAYS} 天`
  const heldTerminate = `超 ${Math.round(HELD_TERMINATE_DAYS / 365)} 年`
  const tzHours = `${MAX_UTC_OFFSET_HOURS} 小时`
  const retention = `${DEFAULT_USAGE_CONFIG.storage.retentionDays} 天`
  const successTtl = `${CHECK_TTL / 3_600_000} 小时`
  const failTtl = `${FAIL_TTL / 3_600_000} 小时`

  it("搁置阈值：任务文档与技能台账", () => {
    expect(doc("docs/cli/task.md")).toContain(heldWarn)
    expect(doc("docs/cli/task.md")).toContain(heldTerminate)
    expect(doc("docs/handbook.md")).toContain(heldWarn)
    expect(doc("skills/fxri-plan-task/SKILL.md")).toContain(heldWarn)
    expect(doc("skills/fxri-plan-recap/references/mode-2-recovery.md")).toContain(heldWarn)
  })

  it("跨时区容差：任务文档、攻略与技能", () => {
    expect(doc("docs/cli/task.md")).toContain(`超过 ${tzHours}`)
    expect(doc("docs/guide.md")).toContain(`超过 ${tzHours}`)
    expect(doc("skills/fxri-plan-recap/SKILL.md")).toContain(tzHours)
    expect(doc("skills/fxri-plan-task/references/task-spec.md")).toContain(`UTC+${MAX_UTC_OFFSET_HOURS}`)
  })

  it("更新检查间隔与使用数据保留期", () => {
    expect(doc("docs/config/update.md")).toContain(`成功结果 ${successTtl}内`)
    expect(doc("docs/config/update.md")).toContain(`失败结果 ${failTtl}内`)
    expect(doc("docs/usage/configuration.md")).toContain(`\`${DEFAULT_USAGE_CONFIG.storage.retentionDays}\``)
    expect(doc("docs/usage/index.md")).toContain(`保留 ${retention}`)
    expect(doc("docs/usage/privacy.md")).toContain(`保留 ${retention}`)
  })
})
