// 纯包管理器模式：零选择合法、core 不再强制、交互默认全不选
import { describe, it, expect } from "vitest"
import { buildSkillChoices, planSkillSelection } from "../skills/prompt"
import type { PackageSkill } from "../skills/types"

const skills: PackageSkill[] = [
  { name: "core-a", dir: "/a", version: "1.0.0", tier: "core", requires: [], previousNames: [] },
  { name: "opt-b", dir: "/b", version: "1.0.0", tier: "optional", requires: [], previousNames: [] },
]

describe("package 模式技能选择", () => {
  it("无保存选择时本次零装", () => {
    expect(planSkillSelection({ skills, mode: "package", interactive: false, yes: true }).names).toEqual([])
  })

  it("已保存为空数组时保持零装（与未保存区分）", () => {
    expect(planSkillSelection({ skills, saved: [], mode: "package", interactive: false, yes: true }).names).toEqual([])
  })

  it("显式指定技能时不自动补 core", () => {
    expect(planSkillSelection({ skills, explicit: ["opt-b"], mode: "package", interactive: false, yes: true }).names).toEqual(["opt-b"])
  })

  it("skills 模式仍自动补 core", () => {
    expect(planSkillSelection({ skills, explicit: ["opt-b"], mode: "skills", interactive: false, yes: true }).names).toEqual(["core-a", "opt-b"])
  })

  it("交互选项在 package 下 core 不默认选中", () => {
    expect(buildSkillChoices(skills, undefined, "package").map((choice) => choice.selected)).toEqual([false, false])
  })
})
