// 配置单一入口：键元数据、三层写入往返、旧段名迁移与命令注册表不变量
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { inspectConfigLayers, resetToolkitConfigCache, rewriteLegacySections, setHomeDirForTest } from "../config"
import { configKeyNames, getConfigKey, isConfigLayer, parseConfigValue, suggestConfigKeys } from "../config-keys"
import { configFileForLayer, configLayerInRepo, readConfigKey, readConfigKeys, unsetConfigKey, writeConfigKey } from "../config-edit"
import { writeProjectSkillsConfig, writeUpdateCheckSourceNotify } from "../skills/config"
import { COMMAND_REGISTRY, commandMigrationRows, removedCommandHint } from "../command-registry"
import { tempDir } from "./helpers"

// 临时 home 与项目目录：三层配置都只落在临时路径
let home = ""
let project = ""
const originalCwd = process.cwd()

beforeEach(() => {
  home = tempDir("fxts-tk-cfg-entry-home-")
  project = tempDir("fxts-tk-cfg-entry-proj-")
  // 项目根判定依赖 .git 或 .tasks，这里放一个空 .git 目录
  mkdirSync(join(project, ".git"), { recursive: true })
  setHomeDirForTest(home)
  process.chdir(project)
  resetToolkitConfigCache()
})

afterEach(() => {
  process.chdir(originalCwd)
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
})

describe("配置键元数据", () => {
  it("键路径唯一，且默认层落在可写层内", () => {
    const names = configKeyNames()
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      const spec = getConfigKey(name)
      expect(spec?.writableLayers).toContain(spec?.defaultLayer)
    }
  })

  it("层级约束：usage 仅全局层、projectSkill 仅项目层", () => {
    expect(getConfigKey("usage.enabled")?.writableLayers).toEqual(["global"])
    expect(getConfigKey("projectSkill.mode")?.writableLayers).toEqual(["project"])
    expect(getConfigKey("skillInstall.mode")?.writableLayers).toEqual(["global"])
  })

  it("用户主目录不作为项目根：项目层 / 本地层写入被拒绝", () => {
    process.chdir(home)
    expect(() => writeConfigKey("project", "task.dir", "home-tasks")).toThrow(/用户主目录不作为项目根/)
    expect(() => writeConfigKey("local", "redact.enabled", true)).toThrow(/用户主目录不作为项目根/)
    expect(() => unsetConfigKey("project", "task.dir")).toThrow(/用户主目录不作为项目根/)
  })

  it("取值解析：布尔 / 整数 / 枚举 / 字符串数组", () => {
    expect(parseConfigValue(getConfigKey("check.warnings")!, "false").value).toBe(false)
    expect(parseConfigValue(getConfigKey("usage.storage.retentionDays")!, "30").value).toBe(30)
    expect(parseConfigValue(getConfigKey("usage.storage.retentionDays")!, "0").error).toContain("不小于")
    expect(parseConfigValue(getConfigKey("usage.storage.retentionDays")!, "0x10").error).toContain("整数")
    expect(parseConfigValue(getConfigKey("usage.storage.retentionDays")!, "1e3").error).toContain("整数")
    expect(parseConfigValue(getConfigKey("usage.storage.retentionDays")!, "1.5").error).toContain("整数")
    expect(parseConfigValue(getConfigKey("skillDelivery.default")!, "gated").value).toBe("gated")
    expect(parseConfigValue(getConfigKey("skillDelivery.default")!, "half").error).toContain("full / gated / off")
    expect(parseConfigValue(getConfigKey("redact.disable")!, "手机号，邮箱").value).toEqual(["手机号", "邮箱"])
    expect(parseConfigValue(getConfigKey("redact.disable")!, "").value).toEqual([])
  })

  it("默认值元数据与展示口径一致", () => {
    expect(getConfigKey("task.dir")?.default).toBe(".tasks")
    expect(getConfigKey("check.warnings")?.default).toBe(true)
    expect(getConfigKey("usage.storage.maxFileBytes")?.default).toBe(8 * 1024 * 1024)
    // 没有简单默认值的键不登记 default，展示回落「未配置」
    expect(getConfigKey("skillInstall.targets")?.default).toBeUndefined()
  })

  it("未知键给最接近的候选", () => {
    expect(suggestConfigKeys("check.warning")).toContain("check.warnings")
    expect(suggestConfigKeys("usage.storage.rotaton")).toContain("usage.storage.rotation")
    expect(suggestConfigKeys("zzz")).toEqual([])
  })

  it("层参数只认三层名称", () => {
    expect(isConfigLayer("global")).toBe(true)
    expect(isConfigLayer("workspace")).toBe(false)
    expect(isConfigLayer(undefined)).toBe(false)
  })
})

describe("三层写入往返", () => {
  it("set / get / unset：来源层随写入位置变化", () => {
    writeConfigKey("global", "check.warnings", false)
    expect(readConfigKey("check.warnings").value).toBe(false)
    expect(readConfigKey("check.warnings").source).toBe("global")

    writeConfigKey("project", "task.dir", "team-tasks")
    const projectState = readConfigKey("task.dir")
    expect(projectState.value).toBe("team-tasks")
    expect(projectState.source).toBe("project")

    writeConfigKey("local", "task.dir", "mine")
    expect(readConfigKey("task.dir").source).toBe("local")

    expect(unsetConfigKey("local", "task.dir").removed).toBe(true)
    expect(readConfigKey("task.dir").value).toBe("team-tasks")
    // 未写时删除不改文件
    expect(unsetConfigKey("local", "task.dir").removed).toBe(false)
  })

  it("嵌套键只改目标叶子，保留同段其它字段", () => {
    writeConfigKey("global", "usage.enabled", true)
    writeConfigKey("global", "usage.storage.dir", "~/usage-data")
    const raw = JSON.parse(readFileSync(configFileForLayer("global"), "utf8")) as Record<string, Record<string, unknown>>
    expect(raw.usage?.enabled).toBe(true)
    expect((raw.usage?.storage as Record<string, unknown>).dir).toBe("~/usage-data")
  })

  it("删除后回收空对象与空段，不留空壳", () => {
    writeConfigKey("global", "usage.storage.dir", "/tmp/x")
    unsetConfigKey("global", "usage.storage.dir")
    const raw = JSON.parse(readFileSync(configFileForLayer("global"), "utf8")) as Record<string, unknown>
    expect(raw.usage).toBeUndefined()
  })

  it("项目层与本地层落到项目根，全局层落到 home", () => {
    writeConfigKey("project", "task.dir", "team")
    writeConfigKey("local", "redact.enabled", false)
    expect(existsSync(join(project, ".toolkitrc.json"))).toBe(true)
    expect(existsSync(join(project, ".toolkitrc.local.json"))).toBe(true)
    writeConfigKey("global", "check.warnings", true)
    expect(existsSync(join(home, ".toolkitrc.json"))).toBe(true)
  })
})

describe("查找起点与批量读取", () => {
  it("传入目录参数时读写落在该目录", () => {
    const other = tempDir("fxts-tk-cfg-other-")
    try {
      mkdirSync(join(other, ".git"), { recursive: true })
      writeConfigKey("project", "task.dir", "other-tasks", other)
      expect(readConfigKey("task.dir", other).value).toBe("other-tasks")
      expect(configFileForLayer("project", other)).toBe(join(other, ".toolkitrc.json"))
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  it("批量读取只加载一次三层配置", () => {
    let calls = 0
    const loader = (dir: string) => {
      calls += 1
      return inspectConfigLayers(dir)
    }
    const states = readConfigKeys(["task.dir", "check.warnings"], project, loader)
    expect(calls).toBe(1)
    expect(Object.keys(states)).toEqual(["task.dir", "check.warnings"])
  })

  it("项目根判定：有项目标志为真，都没有为假", () => {
    expect(configLayerInRepo(project)).toBe(true)
    const plain = tempDir("fxts-tk-cfg-plain-")
    try {
      expect(configLayerInRepo(plain)).toBe(false)
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})

describe("旧段名迁移", () => {
  it("读取时按新段名生效并提示，init 重写把文件改成新段名", () => {
    const file = join(project, ".toolkitrc.json")
    writeFileSync(file, `${JSON.stringify({ tasks: { dir: "legacy-tasks" }, skillsInstall: { mode: "package" } }, null, 2)}\n`, "utf8")
    const layers = inspectConfigLayers(project)
    expect((layers.merged?.task as Record<string, unknown>).dir).toBe("legacy-tasks")
    expect((layers.merged?.skillInstall as Record<string, unknown>).mode).toBe("package")
    expect(layers.merged?.tasks).toBeUndefined()

    expect(rewriteLegacySections(file).renamed.sort()).toEqual(["skillsInstall", "tasks"])
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
    expect(raw.tasks).toBeUndefined()
    expect(raw.skillsInstall).toBeUndefined()
    expect((raw.task as Record<string, unknown>).dir).toBe("legacy-tasks")
    expect((raw.skillInstall as Record<string, unknown>).mode).toBe("package")
    // 写前备份保留原文件
    expect(existsSync(`${file}.bak`)).toBe(true)
  })

  it("新旧段并存时以新段名为准，旧段不再生效", () => {
    writeFileSync(
      join(project, ".toolkitrc.json"),
      `${JSON.stringify({ task: { dir: "new-tasks" }, tasks: { dir: "old-tasks" } })}\n`,
      "utf8",
    )
    const merged = inspectConfigLayers(project).merged
    expect((merged?.task as Record<string, unknown>).dir).toBe("new-tasks")
    expect(merged?.tasks).toBeUndefined()
  })

  it("JSON 非法时标记 invalid，不改写文件", () => {
    const file = join(project, ".toolkitrc.json")
    writeFileSync(file, "{ 非法", "utf8")
    const result = rewriteLegacySections(file)
    expect(result.renamed).toEqual([])
    expect(result.invalid).toBe(true)
    expect(readFileSync(file, "utf8")).toBe("{ 非法")
  })
})

describe("旧段名迁移提示", () => {
  it("全局层提示手动改名，不给 init 指引", () => {
    writeFileSync(join(home, ".toolkitrc.json"), `${JSON.stringify({ skillsInstall: { mode: "package" } })}\n`, "utf8")
    resetToolkitConfigCache()
    const warns: string[] = []
    const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warns.push(args.map(String).join(" "))
    })
    try {
      inspectConfigLayers(project)
    } finally {
      spy.mockRestore()
    }
    const text = warns.join("\n")
    expect(text).toContain("skillsInstall")
    expect(text).toContain("toolkit upgrade --layers global")
    expect(text).not.toContain("运行 toolkit task init")
  })

  it("项目层提示运行 init 重写", () => {
    writeFileSync(join(project, ".toolkitrc.json"), `${JSON.stringify({ tasks: { dir: "legacy" } })}\n`, "utf8")
    resetToolkitConfigCache()
    const warns: string[] = []
    const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warns.push(args.map(String).join(" "))
    })
    try {
      inspectConfigLayers(project)
    } finally {
      spy.mockRestore()
    }
    expect(warns.join("\n")).toContain("运行 toolkit task init 可自动重写")
  })

  it("同一文件同一旧段名只提示一次", () => {
    writeFileSync(join(project, ".toolkitrc.json"), `${JSON.stringify({ tasks: { dir: "legacy" } })}\n`, "utf8")
    resetToolkitConfigCache()
    const warns: string[] = []
    const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warns.push(args.map(String).join(" "))
    })
    try {
      inspectConfigLayers(project)
      inspectConfigLayers(project)
    } finally {
      spy.mockRestore()
    }
    expect(warns.filter((text) => text.includes("已更名为"))).toHaveLength(1)
  })
})

describe("命令注册表", () => {
  it("路径唯一，阶段合法，弃用目标非空", () => {
    const paths = COMMAND_REGISTRY.map((entry) => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const entry of COMMAND_REGISTRY) {
      expect(["current", "planned"]).toContain(entry.stage)
      if (entry.deprecatesTo) expect(entry.deprecatesTo.trim()).not.toBe("")
    }
  })

  it("迁移对照表由注册表派生，且每条都带目标", () => {
    const rows = commandMigrationRows()
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.from).not.toBe("")
      expect(row.to).not.toBe("")
    }
    expect(rows.some((row) => row.from === "tasks" && row.to === "task")).toBe(true)
  })

  it("已移除命令给替代写法，未命中不误报", () => {
    expect(removedCommandHint(["usage", "rule"])).toContain("rule compose --module usage")
    expect(removedCommandHint(["usage", "rule", "--format", "json"])).toContain("rule compose")
    expect(removedCommandHint(["usage", "stats"])).toBeNull()
    expect(removedCommandHint(["tasks"])).toBeNull()
  })
})

describe("项目层更新提示写入", () => {
  it("无 git 的项目目录按项目配置定位，不再要求 git 根", () => {
    const plain = tempDir("fxts-tk-update-notify-")
    try {
      const file = writeUpdateCheckSourceNotify("play", "daily", "project", plain)
      expect(file).toBe(join(plain, ".toolkitrc.json"))
      expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ updateCheck: { sources: { play: { notify: "daily" } } } })
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })

  it("用户主目录拒绝写入项目层提示", () => {
    expect(() => writeUpdateCheckSourceNotify("play", "daily", "project", home)).toThrow(/用户主目录不作为项目根/)
  })

  it("用户主目录拒绝写入项目面技能配置", () => {
    expect(() => writeProjectSkillsConfig({}, home)).toThrow(/用户主目录不作为项目根/)
  })
})
