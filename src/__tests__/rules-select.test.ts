// 规则组合交互计划：预设选项与自定义选择的归一
import { describe, expect, it } from "vitest"
import { buildPresetChoices, CUSTOM_PRESET, normalizePickedModules } from "../rules/select"

describe("buildPresetChoices", () => {
  it("每个预设一项且末尾为自定义", () => {
    const choices = buildPresetChoices({
      minimal: { label: "极简", summary: "只含工作流", modules: ["core"] },
      recommended: { label: "推荐", summary: "常规组合", modules: ["core", "output"] },
    })
    expect(choices.map((item) => item.value)).toEqual(["minimal", "recommended", CUSTOM_PRESET])
    // 选项行 = 预设显示名 + 模块清单 + 单行说明
    expect(choices[1]?.name).toContain("推荐（core → output）")
    expect(choices[1]?.name).toContain("常规组合")
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
