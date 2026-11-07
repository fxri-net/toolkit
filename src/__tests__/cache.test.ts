// 用户级缓存目录单测：路径约定与惰性迁移（文件 / 目录 / 新路径已存在）
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { setHomeDirForTest } from "../config"
import { cachePath, resolveCacheEntry, userCacheDir } from "../cache"

let home = ""

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-cache-"))
  setHomeDirForTest(home)
})

afterEach(() => {
  setHomeDirForTest(undefined)
  rmSync(home, { recursive: true, force: true })
})

describe("用户级缓存目录", () => {
  it("缓存根目录为 ~/.toolkit/cache", () => {
    expect(userCacheDir()).toBe(join(home, ".toolkit", "cache"))
    expect(cachePath("a", "b.json")).toBe(join(home, ".toolkit", "cache", "a", "b.json"))
  })

  it("旧文件惰性迁移到新路径并删除旧文件", () => {
    const legacy = join(home, "legacy.json")
    writeFileSync(legacy, "cached", "utf8")
    const next = resolveCacheEntry("update-check.json", legacy)
    expect(next).toBe(cachePath("update-check.json"))
    expect(readFileSync(next, "utf8")).toBe("cached")
    expect(existsSync(legacy)).toBe(false)
  })

  it("旧目录惰性迁移保留内容", () => {
    const legacy = join(home, "legacy-src")
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, "SKILL.md"), "skill", "utf8")
    const next = resolveCacheEntry(join("skill-sources", "abc"), legacy, "dir")
    expect(readFileSync(join(next, "SKILL.md"), "utf8")).toBe("skill")
    expect(existsSync(legacy)).toBe(false)
  })

  it("新路径已存在时不迁移旧路径，避免覆盖新缓存", () => {
    const legacy = join(home, "legacy.json")
    writeFileSync(legacy, "old", "utf8")
    const next = cachePath("update-check.json")
    mkdirSync(dirname(next), { recursive: true })
    writeFileSync(next, "new", "utf8")
    expect(resolveCacheEntry("update-check.json", legacy)).toBe(next)
    expect(readFileSync(next, "utf8")).toBe("new")
    expect(existsSync(legacy)).toBe(true)
  })

  it("新旧路径都不存在时返回新路径，供调用方创建", () => {
    const next = resolveCacheEntry("update-check.json", join(home, "absent.json"))
    expect(next).toBe(cachePath("update-check.json"))
    expect(existsSync(next)).toBe(false)
  })
})
