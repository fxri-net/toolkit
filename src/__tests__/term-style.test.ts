// 终端样式基建：启用判定矩阵、五种语义色转义、关闭时原样返回、显式开关优先于环境
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  decorate,
  isStyleEnabled,
  line,
  notifyFrequencyText,
  policyEffectText,
  policyLayerText,
  scopeModeText,
  setStyleEnabled,
  style,
  termText,
  usageChannelText,
  usageRotationText,
  usageSkillsModeText,
} from "../term-style"

// 仿 TTY：分别控制 stdout / stderr，还原时删掉自建属性
function setTty(stdout: boolean, stderr: boolean): void {
  Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true })
  Object.defineProperty(process.stderr, "isTTY", { value: stderr, configurable: true })
}

// 仿平台：Windows 分支须在任意宿主上都能覆盖
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
}

// 影响判定的环境变量：逐例清空后还原，避免宿主环境干扰
const ENV_KEYS = ["NO_COLOR", "FORCE_COLOR", "TERM", "WT_SESSION", "TERM_PROGRAM"] as const
const envBackup = new Map<string, string | undefined>()
const originalPlatform = process.platform

beforeEach(() => {
  for (const key of ENV_KEYS) {
    envBackup.set(key, process.env[key])
    delete process.env[key]
  }
  // 默认按非 Windows、非 TTY 的宿主判定，各例只改动自己关心的维度
  setPlatform("linux")
  setTty(false, false)
  setStyleEnabled(undefined)
})

afterEach(() => {
  setStyleEnabled(undefined)
  delete (process.stdout as { isTTY?: boolean }).isTTY
  delete (process.stderr as { isTTY?: boolean }).isTTY
  setPlatform(originalPlatform)
  for (const key of ENV_KEYS) {
    const value = envBackup.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  envBackup.clear()
})

describe("启用判定", () => {
  it("两个流都不是 TTY 时关闭", () => {
    expect(isStyleEnabled()).toBe(false)
  })

  it("任一流是 TTY 即开启", () => {
    setTty(false, true)
    expect(isStyleEnabled()).toBe(true)
    setTty(true, false)
    expect(isStyleEnabled()).toBe(true)
  })

  it("TERM=dumb 时关闭", () => {
    setTty(true, true)
    process.env.TERM = "dumb"
    expect(isStyleEnabled()).toBe(false)
  })

  it("NO_COLOR 非空时关闭，空串视为未设置", () => {
    setTty(true, true)
    process.env.NO_COLOR = "1"
    expect(isStyleEnabled()).toBe(false)
    process.env.NO_COLOR = ""
    expect(isStyleEnabled()).toBe(true)
  })

  it("FORCE_COLOR 非 0 时即使非 TTY 也开启", () => {
    process.env.FORCE_COLOR = "1"
    expect(isStyleEnabled()).toBe(true)
    process.env.FORCE_COLOR = ""
    expect(isStyleEnabled()).toBe(true)
  })

  it("FORCE_COLOR=0 时关闭", () => {
    setTty(true, true)
    process.env.FORCE_COLOR = "0"
    expect(isStyleEnabled()).toBe(false)
  })

  it("FORCE_COLOR 优先于 NO_COLOR", () => {
    process.env.FORCE_COLOR = "1"
    process.env.NO_COLOR = "1"
    expect(isStyleEnabled()).toBe(true)
  })

  it("Windows 无现代终端标记时关闭", () => {
    setTty(true, true)
    setPlatform("win32")
    expect(isStyleEnabled()).toBe(false)
  })

  it("Windows 在 WT_SESSION 或 TERM_PROGRAM 存在时开启", () => {
    setTty(true, true)
    setPlatform("win32")
    process.env.WT_SESSION = "{session}"
    expect(isStyleEnabled()).toBe(true)
    delete process.env.WT_SESSION
    process.env.TERM_PROGRAM = "vscode"
    expect(isStyleEnabled()).toBe(true)
  })

  it("显式开关优先于环境判定，传 undefined 后恢复", () => {
    process.env.FORCE_COLOR = "1"
    setStyleEnabled(false)
    expect(isStyleEnabled()).toBe(false)
    setStyleEnabled(true)
    expect(isStyleEnabled()).toBe(true)
    setStyleEnabled(undefined)
    expect(isStyleEnabled()).toBe(true)
  })
})

describe("语义色", () => {
  it("启用时五种语义色各自输出对应转义序列", () => {
    setStyleEnabled(true)
    expect(style.ok("完成")).toBe("\u001b[32m完成\u001b[0m")
    expect(style.warn("注意")).toBe("\u001b[33m注意\u001b[0m")
    expect(style.error("失败")).toBe("\u001b[31m失败\u001b[0m")
    expect(style.hint("说明")).toBe("\u001b[2m说明\u001b[0m")
    expect(style.accent("toolkit task")).toBe("\u001b[36mtoolkit task\u001b[0m")
  })

  it("关闭时原样返回文本", () => {
    setStyleEnabled(false)
    expect(style.ok("完成")).toBe("完成")
    expect(style.warn("注意")).toBe("注意")
    expect(style.error("失败")).toBe("失败")
    expect(style.hint("说明")).toBe("说明")
    expect(style.accent("toolkit task")).toBe("toolkit task")
  })
})

describe("输出出口装饰", () => {
  beforeEach(() => {
    setStyleEnabled(true)
  })

  it("按行首语义符号着色，符号本身不参与着色", () => {
    expect(decorate("✔ 完成")).toBe("✔ \u001b[32m完成\u001b[0m")
    expect(decorate("⚠️ 注意")).toBe("⚠️ \u001b[33m注意\u001b[0m")
    expect(decorate("✖ 失败")).toBe("✖ \u001b[31m失败\u001b[0m")
    expect(decorate("· 说明")).toBe("· \u001b[2m说明\u001b[0m")
  })

  it("预演行只给标记上色", () => {
    expect(decorate("[预演] 未写入任何文件")).toBe("\u001b[36m[预演]\u001b[0m 未写入任何文件")
    expect(decorate("  [预演] 将归档 1 个任务")).toBe("  \u001b[36m[预演]\u001b[0m 将归档 1 个任务")
  })

  it("保留行首缩进", () => {
    expect(decorate("  ⚠️ 提示")).toBe("  ⚠️ \u001b[33m提示\u001b[0m")
  })

  it("只处理首行，多行正文不被改写", () => {
    expect(decorate("⚠️ 第一行\n第二行")).toBe("⚠️ \u001b[33m第一行\u001b[0m\n第二行")
  })

  it("符号不在行首或无符号时原样返回", () => {
    expect(decorate("操作失败 ⚠️ 说明")).toBe("操作失败 ⚠️ 说明")
    expect(decorate("已导出 3 个任务")).toBe("已导出 3 个任务")
  })

  it("已含 ANSI 的文本原样放行，避免二次上色", () => {
    const styled = "✔ \u001b[32m已上色\u001b[0m"
    expect(decorate(styled)).toBe(styled)
  })

  it("关闭颜色时原样返回", () => {
    setStyleEnabled(false)
    expect(decorate("⚠️ 注意")).toBe("⚠️ 注意")
    expect(decorate("[预演] 未写入任何文件")).toBe("[预演] 未写入任何文件")
  })
})

describe("术语映射", () => {
  it("名单模式、效果与层都有中文文案", () => {
    expect(scopeModeText.all).toBe("全部生效")
    expect(scopeModeText.allowlist).toBe("仅名单内生效")
    expect(policyEffectText).toEqual({ allow: "允许", deny: "拒绝" })
    expect(policyLayerText).toEqual({ global: "全局层", project: "项目层", local: "本地层" })
  })

  it("未知取值原样返回，不悄悄吞掉", () => {
    expect(termText(scopeModeText, "custom")).toBe("custom")
  })

  it("人读文案不直接复用机器键（兼容提示除外）", () => {
    expect(scopeModeText.all).not.toBe("all")
    expect(scopeModeText.allowlist).not.toBe("allowlist")
  })

  it("技能统计的通道、模式、轮转与频率都有中文文案", () => {
    expect(termText(usageChannelText, "hook")).toContain("Agent Hook")
    expect(termText(usageSkillsModeText, "none")).toBe("不采集（none）")
    expect(termText(usageRotationText, "monthly")).toBe("按月（monthly）")
    expect(termText(notifyFrequencyText, "off")).toBe("关闭（off）")
  })
})

describe("行级模板", () => {
  it("启用时补符号并只给符号后的文本上色", () => {
    setStyleEnabled(true)
    expect(line.ok("已导出 3 个任务")).toBe("✔ \u001b[32m已导出 3 个任务\u001b[0m")
    expect(line.hint("建议随后执行 format")).toBe("\u001b[2m建议随后执行 format\u001b[0m")
  })

  it("关闭时符号保留、文本原样", () => {
    setStyleEnabled(false)
    expect(line.ok("已导出 3 个任务")).toBe("✔ 已导出 3 个任务")
    expect(line.hint("建议随后执行 format")).toBe("建议随后执行 format")
  })
})
