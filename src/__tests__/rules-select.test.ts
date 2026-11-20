// 规则组合交互计划：预设选项与自定义选择的归一
import { describe, expect, it } from "vitest"
import { buildPresetChoices, CUSTOM_PRESET, normalizePickedModules } from "../rules/select"

describe("buildPresetChoices", () => {
  it("每个预设一项且末尾为自定义", () => {
    const choices = buildPresetChoices({ minimal: ["core"], recommended: ["core", "output"] })
    expect(choices.map((item) => item.value)).toEqual(["minimal", "recommended", CUSTOM_PRESET])
    expect(choices[1]?.name).toContain("core → output")
  })

  it("无预设时只有自定义项", () => {
    expect(buildPresetChoices({})).toEqual([{ name: "自定义…", value: CUSTOM_PRESET }])
  })
})

describe("normalizePickedModules", () => {
  it("按清单顺序输出，忽略未知与重复", () => {
    expect(normalizePickedModules(["core", "output", "workflow"], ["workflow", "absent", "core", "core"])).toEqual([
      "core",
      "workflow",
    ])
  })

  it("空选择返回空数组", () => {
    expect(normalizePickedModules(["core"], [])).toEqual([])
  })
})
