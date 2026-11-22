// 交互列表分组渲染：多组时插入来源分隔标题，单组保持扁平；skills 模式仍自动补 core
import { beforeEach, describe, expect, it, vi } from "vitest"

const { askCheckbox } = vi.hoisted(() => ({ askCheckbox: vi.fn() }))

// 只替换多选交互，保留 cli-ui 其余导出
vi.mock("../cli-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cli-ui")>()
  return { ...actual, askCheckbox }
})

import { promptSkillSelection, promptTargetSelection, type PromptSkill } from "../skills/prompt"

// 分组渲染行：技能项取 name / value / disabled，分隔行取 type / separator
interface RenderRow {
  name?: string
  value?: string
  disabled?: boolean | string
  type?: string
  separator?: string
}

function skill(name: string, tier: "core" | "optional", source?: string): PromptSkill {
  return { name, dir: `/tmp/${name}`, version: "1.0.0", tier, requires: [], previousNames: [], source }
}

const mixed = [skill("core-b", "core"), skill("opt-a", "optional"), skill("core-a", "core"), skill("ext-x", "optional", "playbook")]

beforeEach(() => {
  askCheckbox.mockReset()
})

describe("promptSkillSelection 分组标题", () => {
  it("多组时按组插入分隔行，标题与顺序同分组", async () => {
    askCheckbox.mockResolvedValue(["opt-a"])
    await promptSkillSelection(mixed, [], "skills")
    const rows = askCheckbox.mock.calls[0]?.[0].choices as RenderRow[]
    expect(rows.filter((row) => row.type === "separator").map((row) => row.separator)).toEqual([
      "── 包内 · 必装 ──",
      "── 包内 · 可选 ──",
      "── playbook ──",
    ])
    expect(rows.filter((row) => row.value).map((row) => row.value)).toEqual(["core-a", "core-b", "opt-a", "ext-x"])
    // 分组标题已标明必装，条目不再叠「（core）」后缀，只保留禁用原因
    expect(rows.some((row) => row.name?.includes("（core）"))).toBe(false)
    const coreRows = rows.filter((row) => row.value === "core-a" || row.value === "core-b")
    expect(coreRows.map((row) => row.name)).toEqual(["core-a", "core-b"])
    expect(coreRows.every((row) => row.disabled === "必装，不可取消")).toBe(true)
  })

  it("单组时不插入分隔行，列表保持扁平", async () => {
    askCheckbox.mockResolvedValue([])
    await promptSkillSelection([skill("opt-a", "optional")], [], "skills")
    const rows = askCheckbox.mock.calls[0]?.[0].choices as RenderRow[]
    expect(rows.some((row) => row.type === "separator")).toBe(false)
    expect(rows.map((row) => row.name)).toEqual(["opt-a"])
  })

  it("skills 模式选中结果仍自动补 core", async () => {
    askCheckbox.mockResolvedValue(["opt-a"])
    const picked = await promptSkillSelection(mixed, [], "skills")
    // withCore 按入参顺序收敛，core 全含
    expect(picked).toEqual(["core-b", "opt-a", "core-a"])
  })
})

describe("promptTargetSelection 分组标题", () => {
  const targets = [
    { value: "canonical", group: "主目标", label: "canonical（多家 agent 共读）", checked: true },
    { value: "claude-code", group: "agent", label: "Claude Code", checked: true },
    { value: "extra", group: "自定义（一次性）", label: "extra", checked: true, disabled: "一次性 --dir，本次固定写入、不保存为长期选择" },
  ]

  it("多组时按组插入分隔行，标签不再带「类型｜」前缀", async () => {
    askCheckbox.mockResolvedValue(["canonical"])
    await promptTargetSelection(targets, "选择目标")
    const rows = askCheckbox.mock.calls[0]?.[0].choices as RenderRow[]
    expect(rows.filter((row) => row.type === "separator").map((row) => row.separator)).toEqual([
      "── 主目标 ──",
      "── agent ──",
      "── 自定义（一次性） ──",
    ])
    expect(rows.filter((row) => row.value).map((row) => row.name)).toEqual(["canonical（多家 agent 共读）", "Claude Code", "extra"])
  })

  it("单组时不插入分隔行", async () => {
    askCheckbox.mockResolvedValue([])
    await promptTargetSelection([targets[0]!], "选择目标")
    const rows = askCheckbox.mock.calls[0]?.[0].choices as RenderRow[]
    expect(rows.some((row) => row.type === "separator")).toBe(false)
  })
})
