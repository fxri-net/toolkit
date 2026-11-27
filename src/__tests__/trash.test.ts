// 项目内回收站：移动、查看、恢复、按策略清理与统计
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getHomeDir, setHomeDirForTest } from "../config"
import { removeArtifact } from "../skills/source"
import {
  listTrash,
  pruneTrash,
  restoreTrash,
  setTrashContext,
  statsTrash,
  trashAwareRemove,
  type TrashManifest,
} from "../trash/store"
import { tempDir } from "./helpers"

// 跨卷分支的可控故障开关：默认透传真实 fs，仅在用例内切换
const fsFailure = vi.hoisted(() => ({ rename: false, copy: false }))
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return {
    ...actual,
    renameSync: ((from: string, to: string) => {
      if (fsFailure.rename) {
        const error = new Error("EXDEV: cross-device link not permitted") as NodeJS.ErrnoException
        error.code = "EXDEV"
        throw error
      }
      return actual.renameSync(from, to)
    }) as typeof actual.renameSync,
    cpSync: ((...args: Parameters<typeof actual.cpSync>) => {
      if (fsFailure.copy) throw new Error("复制失败")
      return actual.cpSync(...args)
    }) as typeof actual.cpSync,
  }
})

const fixtures: string[] = []

function tmpRoot(prefix: string): string {
  const dir = tempDir(prefix)
  fixtures.push(dir)
  return dir
}

function makeProject(): string {
  const root = tmpRoot("fxts-tk-trash-")
  mkdirSync(join(root, ".git"), { recursive: true })
  mkdirSync(join(root, ".agents", "skills", "demo"), { recursive: true })
  writeFileSync(join(root, ".agents", "skills", "demo", "SKILL.md"), "demo", "utf8")
  return root
}

function setContext(root: string): void {
  setTrashContext({ command: "skill uninstall", scope: "all", cwd: root })
}

beforeEach(() => {
  setHomeDirForTest(tmpRoot("fxts-tk-trash-home-"))
})

afterEach(() => {
  fsFailure.rename = false
  fsFailure.copy = false
  setTrashContext(null)
  setHomeDirForTest(undefined)
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("项目内回收站", () => {
  it("删除进入回收站、可恢复到原路径、恢复后条目消失", () => {
    const root = makeProject()
    const target = join(root, ".agents", "skills", "demo")
    setContext(root)
    trashAwareRemove(target, root)
    expect(existsSync(target)).toBe(false)
    const entries = listTrash(root, "all")
    expect(entries).toHaveLength(1)
    expect(entries[0]!.command).toBe("skill uninstall")
    const result = restoreTrash(root, "latest", { scope: "all" })
    expect(result.restored).toEqual([target])
    expect(existsSync(join(target, "SKILL.md"))).toBe(true)
    expect(listTrash(root, "all")).toHaveLength(0)
  })

  it("restore --to 保留条目内相对结构", () => {
    const root = makeProject()
    const target = join(root, ".agents", "skills", "demo")
    const to = tmpRoot("fxts-tk-trash-to-")
    setContext(root)
    trashAwareRemove(target, root)
    const result = restoreTrash(root, "latest", { scope: "all", to })
    expect(result.restored).toEqual([join(to, ".agents", "skills", "demo")])
    expect(existsSync(join(to, ".agents", "skills", "demo", "SKILL.md"))).toBe(true)
  })

  it("prune --keep 保留最近条目，stats 统计条数与占用", () => {
    const root = makeProject()
    setContext(root)
    trashAwareRemove(join(root, ".agents", "skills", "demo"), root)
    mkdirSync(join(root, ".agents", "skills", "demo2"), { recursive: true })
    writeFileSync(join(root, ".agents", "skills", "demo2", "SKILL.md"), "demo2", "utf8")
    trashAwareRemove(join(root, ".agents", "skills", "demo2"), root)
    expect(statsTrash(root, "all").entries).toBe(2)
    const kept = pruneTrash(root, { scope: "all", keep: 1, dryRun: true })
    expect(kept.removed).toHaveLength(1)
    expect(listTrash(root, "all")).toHaveLength(2)
    const removed = pruneTrash(root, { scope: "all", keep: 1 })
    expect(removed.removed).toHaveLength(1)
    expect(listTrash(root, "all")).toHaveLength(1)
  })

  it("技能产物删除在有上下文时进回收站，无上下文时永久删除", () => {
    const root = makeProject()
    const target = join(root, ".agents", "skills", "demo")
    setContext(root)
    removeArtifact(target, root)
    expect(existsSync(target)).toBe(false)
    expect(listTrash(root, "all")).toHaveLength(1)

    const other = join(root, ".agents", "skills", "demo2")
    mkdirSync(other, { recursive: true })
    writeFileSync(join(other, "SKILL.md"), "demo2", "utf8")
    setTrashContext(null)
    removeArtifact(other, root)
    expect(existsSync(other)).toBe(false)
    expect(listTrash(root, "all")).toHaveLength(1)
  })

  it("无活动上下文时保持永久删除", () => {
    const root = makeProject()
    const target = join(root, ".agents", "skills", "demo")
    trashAwareRemove(target, root)
    expect(existsSync(target)).toBe(false)
    expect(listTrash(root, "all")).toHaveLength(0)
  })

  it("符号链接只摘链、恢复时重建链接而不到搬目标内容", () => {
    const root = makeProject()
    const real = join(root, "real")
    const link = join(root, "link")
    mkdirSync(real, { recursive: true })
    writeFileSync(join(real, "keep.txt"), "keep", "utf8")
    symlinkSync(real, link, process.platform === "win32" ? "junction" : "dir")
    setContext(root)
    trashAwareRemove(link, root)
    expect(existsSync(link)).toBe(false)
    expect(existsSync(join(real, "keep.txt"))).toBe(true)
    const result = restoreTrash(root, "latest", { scope: "all" })
    expect(result.restored).toEqual([link])
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(link, "keep.txt"), "utf8")).toBe("keep")
  })

  it("目标已存在时默认跳过，--overwrite 才覆盖并把现值再收进回收站", () => {
    const root = makeProject()
    const target = join(root, ".agents", "skills", "demo")
    setContext(root)
    trashAwareRemove(target, root)
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, "SKILL.md"), "replacement", "utf8")

    const skipped = restoreTrash(root, "latest", { scope: "all" })
    expect(skipped.skipped).toEqual([target])
    expect(skipped.removedEntry).toBe(false)
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toBe("replacement")
    expect(listTrash(root, "all")).toHaveLength(1)

    const overwritten = restoreTrash(root, "latest", { scope: "all", overwrite: true })
    expect(overwritten.restored).toEqual([target])
    expect(overwritten.removedEntry).toBe(true)
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toBe("demo")
    // 被覆盖的现值留在回收站，可再次恢复
    expect(listTrash(root, "all")).toHaveLength(1)
  })

  it("恢复预演只报告目标，不改动现场", () => {
    const root = makeProject()
    const target = join(root, ".agents", "skills", "demo")
    setContext(root)
    trashAwareRemove(target, root)
    const result = restoreTrash(root, "latest", { scope: "all", dryRun: true })
    expect(result.restored).toEqual([target])
    expect(result.removedEntry).toBe(false)
    expect(existsSync(target)).toBe(false)
    expect(listTrash(root, "all")).toHaveLength(1)
  })

  it("清单里的路径逃出允许根时跳过并保留条目", () => {
    const root = makeProject()
    const target = join(root, ".agents", "skills", "demo")
    setContext(root)
    trashAwareRemove(target, root)
    const entry = listTrash(root, "all")[0]!
    const manifest = JSON.parse(readFileSync(join(entry.dir, "manifest.json"), "utf8")) as TrashManifest
    const outside = join(tmpRoot("fxts-tk-trash-outside-"), "escape.txt")
    writeFileSync(outside, "escape", "utf8")
    manifest.entries[0]!.original = outside
    writeFileSync(join(entry.dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")

    const result = restoreTrash(root, "latest", { scope: "all" })
    expect(result.restored).toEqual([])
    expect(result.skipped).toEqual([outside])
    expect(result.removedEntry).toBe(false)
    expect(listTrash(root, "all")).toHaveLength(1)
    expect(existsSync(outside)).toBe(true)
  })

  it("清单损坏的条目不出现在列表里，恢复时报未找到", () => {
    const root = makeProject()
    setContext(root)
    trashAwareRemove(join(root, ".agents", "skills", "demo"), root)
    const entry = listTrash(root, "all")[0]!
    writeFileSync(join(entry.dir, "manifest.json"), "{broken", "utf8")
    expect(listTrash(root, "all")).toHaveLength(0)
    expect(() => restoreTrash(root, "latest", { scope: "all" })).toThrow(/未找到回收站条目/)
    expect(() => restoreTrash(root, "no-such-id", { scope: "all" })).toThrow(/未找到回收站条目/)
  })

  it("删除目标越出允许根时拒绝并抛错", () => {
    const root = makeProject()
    const other = tmpRoot("fxts-tk-trash-other-")
    writeFileSync(join(other, "keep.txt"), "keep", "utf8")
    setContext(root)
    expect(() => trashAwareRemove(join(other, "keep.txt"), root)).toThrow()
    expect(existsSync(join(other, "keep.txt"))).toBe(true)
  })

  it("项目根外的目标进入全局回收站，scope 过滤互不串台", () => {
    const root = makeProject()
    const target = join(getHomeDir(), "artifacts", "pkg")
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, "a.txt"), "a", "utf8")
    setContext(root)
    trashAwareRemove(target, getHomeDir())
    expect(listTrash(root, "project")).toHaveLength(0)
    expect(listTrash(root, "global")).toHaveLength(1)
    expect(listTrash(root, "global")[0]!.scope).toBe("global")
  })

  it("prune --older-than 只清理早于截止日的条目，--all 清空当前作用域", () => {
    const root = makeProject()
    setContext(root)
    trashAwareRemove(join(root, ".agents", "skills", "demo"), root)
    const oldEntry = listTrash(root, "all")[0]!
    const manifest = JSON.parse(readFileSync(join(oldEntry.dir, "manifest.json"), "utf8")) as TrashManifest
    manifest.createdAt = "2020-01-01T00:00:00.000Z"
    writeFileSync(join(oldEntry.dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")

    mkdirSync(join(root, ".agents", "skills", "fresh"), { recursive: true })
    writeFileSync(join(root, ".agents", "skills", "fresh", "SKILL.md"), "fresh", "utf8")
    trashAwareRemove(join(root, ".agents", "skills", "fresh"), root)

    const byAge = pruneTrash(root, { scope: "all", olderThan: 1, dryRun: true })
    expect(byAge.removed).toHaveLength(1)
    expect(byAge.kept).toHaveLength(1)
    expect(pruneTrash(root, { scope: "all", olderThan: 1 }).removed).toHaveLength(1)
    expect(listTrash(root, "all")).toHaveLength(1)

    const cleared = pruneTrash(root, { scope: "all", all: true })
    expect(cleared.removed).toHaveLength(1)
    expect(listTrash(root, "all")).toHaveLength(0)
  })

  it("prune --keep 按每个回收站根分别计数，两面互不挤占", () => {
    const root = makeProject()
    setContext(root)
    trashAwareRemove(join(root, ".agents", "skills", "demo"), root)
    const globalTarget = join(getHomeDir(), "artifacts", "pkg")
    mkdirSync(globalTarget, { recursive: true })
    writeFileSync(join(globalTarget, "a.txt"), "a", "utf8")
    trashAwareRemove(globalTarget, getHomeDir())
    expect(listTrash(root, "all")).toHaveLength(2)

    const result = pruneTrash(root, { scope: "all", keep: 1 })
    expect(result.removed).toHaveLength(0)
    expect(result.kept).toHaveLength(2)
  })

  it("悬空链接恢复时跳过，不重建链接", () => {
    const root = makeProject()
    const real = join(root, "real")
    const link = join(root, "link")
    mkdirSync(real, { recursive: true })
    symlinkSync(real, link, process.platform === "win32" ? "junction" : "dir")
    setContext(root)
    trashAwareRemove(link, root)
    rmSync(real, { recursive: true, force: true })

    const result = restoreTrash(root, "latest", { scope: "all" })
    expect(result.restored).toEqual([])
    expect(result.skipped).toEqual([link])
    expect(result.failed).toEqual([])
    expect(existsSync(link)).toBe(false)
    expect(listTrash(root, "all")).toHaveLength(1)
  })

  it("部分恢复失败时继续其余条目，保留条目并标记 partial，修复后可重试", () => {
    const root = makeProject()
    const id = "20260101-000000-partial"
    const dir = join(root, ".toolkit", "trash", id)
    const okPath = join(root, "ok.txt")
    const badPath = join(root, "bad.txt")
    mkdirSync(join(dir, "items", "0"), { recursive: true })
    writeFileSync(join(dir, "items", "0", "ok.txt"), "ok", "utf8")
    const manifest: TrashManifest = {
      schemaVersion: 1,
      id,
      createdAt: new Date().toISOString(),
      command: "test",
      scope: "project",
      root,
      entries: [
        { original: okPath, stored: join(dir, "items", "0", "ok.txt"), kind: "file", size: 2 },
        { original: badPath, stored: join(dir, "items", "1", "bad.txt"), kind: "file", size: 3 },
      ],
      status: "complete",
    }
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")

    const first = restoreTrash(root, "latest", { scope: "all" })
    expect(first.restored).toEqual([okPath])
    expect(first.failed).toHaveLength(1)
    expect(first.failed[0]!.path).toBe(badPath)
    expect(first.removedEntry).toBe(false)
    expect(readFileSync(okPath, "utf8")).toBe("ok")
    expect(listTrash(root, "all")[0]!.status).toBe("partial")

    rmSync(okPath, { force: true })
    mkdirSync(join(dir, "items", "1"), { recursive: true })
    writeFileSync(join(dir, "items", "1", "bad.txt"), "bad", "utf8")
    const second = restoreTrash(root, "latest", { scope: "all" })
    expect(second.restored.sort()).toEqual([badPath, okPath].sort())
    expect(second.failed).toEqual([])
    expect(second.removedEntry).toBe(true)
    expect(listTrash(root, "all")).toHaveLength(0)
  })

  it("跨卷移动：rename 抛 EXDEV 时复制到回收站并删除源", () => {
    const root = makeProject()
    const target = join(root, ".agents", "skills", "demo")
    setContext(root)
    fsFailure.rename = true
    trashAwareRemove(target, root)
    fsFailure.rename = false

    expect(existsSync(target)).toBe(false)
    const entry = listTrash(root, "all")[0]!
    const manifest = JSON.parse(readFileSync(join(entry.dir, "manifest.json"), "utf8")) as TrashManifest
    expect(manifest.entries[0]!.kind).toBe("dir")
    expect(readFileSync(join(manifest.entries[0]!.stored, "SKILL.md"), "utf8")).toBe("demo")
  })

  it("跨卷复制失败时保留源文件并留下 partial 条目", () => {
    const root = makeProject()
    const target = join(root, ".agents", "skills", "demo")
    setContext(root)
    fsFailure.rename = true
    fsFailure.copy = true

    expect(() => trashAwareRemove(target, root)).toThrow()
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toBe("demo")
    expect(listTrash(root, "all")[0]!.status).toBe("partial")
  })

  it("stats 汇总条数、占用与按来源命令分布", () => {
    const root = makeProject()
    setContext(root)
    trashAwareRemove(join(root, ".agents", "skills", "demo"), root)
    mkdirSync(join(root, ".agents", "skills", "demo2"), { recursive: true })
    writeFileSync(join(root, ".agents", "skills", "demo2", "SKILL.md"), "demo2", "utf8")
    setTrashContext({ command: "upgrade --prune-backups", scope: "all", cwd: root })
    trashAwareRemove(join(root, ".agents", "skills", "demo2"), root)

    const stats = statsTrash(root, "all")
    expect(stats.entries).toBe(2)
    expect(stats.bytes).toBeGreaterThan(0)
    expect(stats.byCommand).toEqual({ "skill uninstall": 1, "upgrade --prune-backups": 1 })
    expect(stats.oldest).not.toBeNull()
    expect(stats.newest).not.toBeNull()
    expect(statsTrash(root, "global").entries).toBe(0)
  })
})
