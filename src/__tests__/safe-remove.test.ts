// 安全删除与状态路径约束：越界目标必须拒绝，正常临时目录可清理
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  assertWithinRoot,
  isSingleSegmentName,
  safeRemoveArtifact,
  safeRemoveEmptyDir,
  safeRemoveFile,
} from "../safe-remove"
import { readProjectState } from "../skills/state"
import { STATE_FORMAT, STATE_SCHEMA_VERSION } from "../skills/types"

const fixtures: string[] = []

function tmpRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  fixtures.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("安全删除：根约束", () => {
  it("允许根内删除，拒绝根自身与根外路径", () => {
    const root = tmpRoot("fxts-tk-safe-")
    const inside = join(root, "skill")
    mkdirSync(inside, { recursive: true })
    writeFileSync(join(inside, "SKILL.md"), "x", "utf8")
    expect(() => assertWithinRoot(inside, root)).not.toThrow()
    expect(() => assertWithinRoot(root, root)).toThrow()
    expect(() => assertWithinRoot(tmpRoot("fxts-tk-safe-out-"), root)).toThrow()
    safeRemoveArtifact(inside, root)
    expect(existsSync(inside)).toBe(false)
  })

  it("越界删除拒绝且不触碰目标", () => {
    const root = tmpRoot("fxts-tk-safe-root-")
    const outside = tmpRoot("fxts-tk-safe-outside-")
    writeFileSync(join(outside, "keep.txt"), "keep", "utf8")
    expect(() => safeRemoveArtifact(outside, root)).toThrow()
    expect(() => safeRemoveFile(join(outside, "keep.txt"), root)).toThrow()
    expect(existsSync(join(outside, "keep.txt"))).toBe(true)
  })

  it("空目录才回收，非空目录保留", () => {
    const root = tmpRoot("fxts-tk-safe-empty-")
    const empty = join(root, "empty")
    const full = join(root, "full")
    mkdirSync(empty, { recursive: true })
    mkdirSync(full, { recursive: true })
    writeFileSync(join(full, "keep.txt"), "keep", "utf8")
    expect(safeRemoveEmptyDir(empty, root)).toBe(true)
    expect(safeRemoveEmptyDir(full, root)).toBe(false)
    expect(existsSync(empty)).toBe(false)
    expect(existsSync(join(full, "keep.txt"))).toBe(true)
  })
})

describe("安全删除：技能名", () => {
  it("只接受单段名", () => {
    expect(isSingleSegmentName("fxri-plan-task")).toBe(true)
    expect(isSingleSegmentName("..")).toBe(false)
    expect(isSingleSegmentName("../.ssh")).toBe(false)
    expect(isSingleSegmentName("a/b")).toBe(false)
    expect(isSingleSegmentName("a\\b")).toBe(false)
    expect(isSingleSegmentName("")).toBe(false)
  })
})

describe("状态读取：越界目标与非法名字被剔除", () => {
  it("项目态 target.dir 越界、entry.name 含路径时都不进入状态", () => {
    const root = tmpRoot("fxts-tk-state-")
    mkdirSync(join(root, ".toolkit"), { recursive: true })
    const state = {
      format: STATE_FORMAT,
      schemaVersion: STATE_SCHEMA_VERSION,
      updatedAt: "2026-11-26T00:00:00.000Z",
      sources: {
        toolkit: {
          kind: "builtin",
          version: "test",
          targets: [
            { id: "bad-dir", dir: "../../outside", label: "bad", kind: "source", entries: [{ name: "ok", version: "", mode: "copy" }] },
            { id: "bad-name", dir: ".agents/skills", label: "bad", kind: "source", entries: [{ name: "../escape", version: "", mode: "copy" }] },
            { id: "good", dir: ".agents/skills", label: "good", kind: "source", entries: [{ name: "fxri-plan-task", version: "", mode: "copy" }] },
          ],
        },
      },
    }
    writeFileSync(join(root, ".toolkit/state.json"), JSON.stringify(state), "utf8")
    const read = readProjectState(root)
    const targets = read?.sources.toolkit?.targets ?? []
    expect(targets.some((target) => target.dir === "../../outside")).toBe(false)
    expect(targets.flatMap((target) => target.entries).some((entry) => entry.name === "../escape")).toBe(false)
    expect(targets.flatMap((target) => target.entries).some((entry) => entry.name === "fxri-plan-task")).toBe(true)
  })
})
