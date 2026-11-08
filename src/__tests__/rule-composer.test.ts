// @vitest-environment happy-dom
// RuleComposer 交互：默认选择、预设、排序、复制与 localStorage 恢复
import { beforeEach, describe, expect, it, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import RuleComposer from "../../docs/.vitepress/theme/components/RuleComposer.vue"

const STORAGE_KEY = "fxri-toolkit:rules:v1"

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

function checkedStates(wrapper: ReturnType<typeof mount>): boolean[] {
  return wrapper.findAll('input[type="checkbox"]').map((item) => (item.element as HTMLInputElement).checked)
}

describe("RuleComposer 交互", () => {
  it("默认选中推荐集（core / output / workflow）", () => {
    const wrapper = mount(RuleComposer)
    expect(checkedStates(wrapper)).toEqual([true, true, true, false, false, false])
    expect(wrapper.text()).toContain("AI 全篇")
  })

  it("点击 AI 全篇预设后追加 env", async () => {
    const wrapper = mount(RuleComposer)
    const button = wrapper.findAll(".rc-presets button").find((item) => item.text() === "AI 全篇")
    expect(button).toBeTruthy()
    await button!.trigger("click")
    expect(checkedStates(wrapper)).toEqual([true, true, true, true, false, false])
    expect(wrapper.find(".rc-preview pre").text()).toContain("环境与版本")
  })

  it("上移按钮改变组合顺序", async () => {
    const wrapper = mount(RuleComposer)
    const second = wrapper.findAll(".rc-order li")[1]
    await second!.find("button").trigger("click")
    expect(wrapper.findAll(".rc-order li")[0]!.text()).toContain("输出要求")
  })

  it("拖拽排序与上移结果一致", async () => {
    const wrapper = mount(RuleComposer)
    const items = wrapper.findAll(".rc-order li")
    await items[0]!.trigger("dragstart")
    await items[1]!.trigger("drop")
    expect(wrapper.findAll(".rc-order li")[0]!.text()).toContain("输出要求")
  })

  it("复制调用剪贴板并写入 localStorage", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const wrapper = mount(RuleComposer)
    await wrapper.find(".rc-primary").trigger("click")
    await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]?.[0]).toContain("## 代码规范")
    expect(wrapper.find(".rc-primary").text()).toBe("已复制")
  })

  it("重新挂载后从 localStorage 恢复选择", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, modules: ["usage", "core"] }))
    const wrapper = mount(RuleComposer)
    await flushPromises()
    const order = wrapper.findAll(".rc-order li").map((item) => item.text())
    expect(order[0]).toContain("技能使用情况")
    expect(order[1]).toContain("角色定位与代码规范")
  })

  it("本地存储被禁用时仍可用", async () => {
    const blocked = () => {
      throw new Error("blocked")
    }
    vi.spyOn(localStorage, "getItem").mockImplementation(blocked)
    vi.spyOn(localStorage, "setItem").mockImplementation(blocked)
    vi.spyOn(localStorage, "removeItem").mockImplementation(blocked)
    const wrapper = mount(RuleComposer)
    await flushPromises()
    expect(wrapper.text()).toContain("当前浏览器不可用本地存储")
    await wrapper.findAll('input[type="checkbox"]')[0]!.setValue(false)
    expect(checkedStates(wrapper)[0]).toBe(false)
  })

  it("复制失败时显示复制失败，不误报已复制", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })
    const execCommand = vi.fn(() => {
      throw new Error("copy failed")
    })
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true })
    const wrapper = mount(RuleComposer)
    await wrapper.find(".rc-primary").trigger("click")
    await flushPromises()
    expect(execCommand).toHaveBeenCalledWith("copy")
    expect(wrapper.find(".rc-primary").text()).toBe("复制失败")
    // execCommand 抛错时临时 textarea 也必须清理
    expect(document.querySelectorAll("textarea")).toHaveLength(0)
    const resetButton = wrapper.findAll(".rc-toolbar button").find((item) => item.text().includes("恢复默认"))
    await resetButton!.trigger("click")
    expect(wrapper.find(".rc-primary").text()).toBe("一键复制")
  })
})
