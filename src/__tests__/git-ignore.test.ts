// git 探测单测：路径归一、工作树归属、仓库探针、忽略判定、已跟踪判定与六态归因
// 真 git 用例走 execSync("git init")；归因分支（exit 128 的 stderr 细分）用 spawnSync 桩构造，避免依赖 git 的具体报错文案
import { describe, it, expect, afterAll, vi } from "vitest"
import { execSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  checkIgnore,
  gitIgnoredSet,
  inspectLocalConfigIgnore,
  isInsideWorktree,
  isTracked,
  normalizePathForCompare,
  probeRepo,
  toPosix,
} from "../git-ignore"

// 各用例独立建临时目录，结束后统一清理
const dirs: string[] = []
function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

// 建真 git 仓库（stdio 忽略，避免 init 提示污染测试输出）
function makeRepo(prefix: string): string {
  const dir = makeDir(prefix)
  execSync("git init -q", { cwd: dir, stdio: "ignore" })
  return dir
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe("路径归一", () => {
  it("toPosix 只做分隔符归一，不改变大小写", () => {
    expect(toPosix("a\\b\\c")).toBe("a/b/c")
    expect(toPosix("A/B")).toBe("A/B")
  })

  it("normalizePathForCompare 统一分隔符、去尾斜杠、折叠大小写", () => {
    expect(normalizePathForCompare("C:\\Repo\\Sub\\")).toBe("c:/repo/sub")
    expect(normalizePathForCompare("/repo/sub/")).toBe(normalizePathForCompare("/Repo/Sub"))
  })
})

describe("isInsideWorktree 工作树归属", () => {
  it("根目录本身与其下路径均算命中", () => {
    expect(isInsideWorktree("/repo/a/.toolkitrc.local.json", "/repo")).toBe(true)
    expect(isInsideWorktree("/repo", "/repo")).toBe(true)
  })

  it("同前缀的兄弟目录不误命中（/repo 不吞 /repo2）", () => {
    expect(isInsideWorktree("/repo2/a", "/repo")).toBe(false)
  })

  it("Windows 盘符大小写与分隔符差异不影响判定", () => {
    expect(isInsideWorktree("D:\\Repo\\sub\\x", "d:/repo")).toBe(true)
  })

  it("同一目录的两种书写形态均判为命中（Windows 8.3 短名 / 软链形态）", () => {
    const repo = makeRepo("tk-gi-form-")
    // 取磁盘真实形态：Windows CI 下 tmpdir 为 8.3 短名、git rev-parse 返回长名，两者形态不同但指向同一目录
    const canonical = realpathSync.native(repo)
    expect(isInsideWorktree(join(canonical, "a.txt"), repo)).toBe(true)
    expect(isInsideWorktree(join(repo, "a.txt"), canonical)).toBe(true)
  })
})

describe("probeRepo 仓库探针", () => {
  it("真仓库：根路径能涵盖仓库内文件", () => {
    const repo = makeRepo("tk-gi-repo-")
    const probe = probeRepo(repo)
    expect(probe.kind).toBe("repo")
    // 不直接比对根路径字符串（macOS 下 tmpdir 可能是软链），改用归属判定验证根有效
    if (probe.kind === "repo") expect(isInsideWorktree(join(repo, "a.txt"), probe.root)).toBe(true)
  })

  it("非仓库归 not-a-repo", () => {
    expect(probeRepo(makeDir("tk-gi-norepo-")).kind).toBe("not-a-repo")
  })
})

describe("checkIgnore 单文件忽略判定", () => {
  it("仓库内无规则时未忽略", () => {
    const repo = makeRepo("tk-gi-ign1-")
    writeFileSync(join(repo, "foo.txt"), "x", "utf8")
    expect(checkIgnore(join(repo, "foo.txt"))).toEqual({ state: "not-ignored" })
  })

  it("仓库内命中规则时已忽略", () => {
    const repo = makeRepo("tk-gi-ign2-")
    writeFileSync(join(repo, ".gitignore"), "foo.txt\n", "utf8")
    writeFileSync(join(repo, "foo.txt"), "x", "utf8")
    expect(checkIgnore(join(repo, "foo.txt"))).toEqual({ state: "ignored" })
  })

  it("非仓库归 not-a-repo", () => {
    const dir = makeDir("tk-gi-ign3-")
    expect(checkIgnore(join(dir, "foo.txt"))).toEqual({ state: "not-a-repo" })
  })
})

describe("isTracked 已跟踪判定", () => {
  it("未跟踪文件为 false", () => {
    const repo = makeRepo("tk-gi-tr1-")
    writeFileSync(join(repo, "a.txt"), "x", "utf8")
    expect(isTracked(join(repo, "a.txt"))).toBe(false)
  })

  it("git add -f 后为 true", () => {
    const repo = makeRepo("tk-gi-tr2-")
    writeFileSync(join(repo, ".gitignore"), "a.txt\n", "utf8")
    writeFileSync(join(repo, "a.txt"), "x", "utf8")
    execSync("git add -f a.txt", { cwd: repo, stdio: "ignore" })
    expect(isTracked(join(repo, "a.txt"))).toBe(true)
  })
})

describe("gitIgnoredSet 批量忽略判定", () => {
  it("空入参直接返回空集，不起子进程", () => {
    expect(gitIgnoredSet(makeDir("tk-gi-set0-"), []).size).toBe(0)
  })

  it("只回填命中的相对路径", () => {
    const repo = makeRepo("tk-gi-set1-")
    writeFileSync(join(repo, ".gitignore"), "a.txt\n", "utf8")
    const ignored = gitIgnoredSet(repo, ["a.txt", "b.txt"])
    expect(ignored.has("a.txt")).toBe(true)
    expect(ignored.has("b.txt")).toBe(false)
  })
})

describe("inspectLocalConfigIgnore 六态归因", () => {
  it("已忽略：命中忽略规则且未被跟踪", () => {
    const repo = makeRepo("tk-gi-st1-")
    writeFileSync(join(repo, ".gitignore"), ".toolkitrc.local.json\n", "utf8")
    const file = join(repo, ".toolkitrc.local.json")
    writeFileSync(file, "{}", "utf8")
    expect(inspectLocalConfigIgnore(file, repo)).toEqual({ state: "ignored" })
  })

  it("未忽略：无忽略规则", () => {
    const repo = makeRepo("tk-gi-st2-")
    const file = join(repo, ".toolkitrc.local.json")
    writeFileSync(file, "{}", "utf8")
    expect(inspectLocalConfigIgnore(file, repo)).toEqual({ state: "not-ignored" })
  })

  it("已跟踪：规则已覆盖但历史 git add -f 过，先于忽略判定识别", () => {
    const repo = makeRepo("tk-gi-st3-")
    writeFileSync(join(repo, ".gitignore"), ".toolkitrc.local.json\n", "utf8")
    writeFileSync(join(repo, ".toolkitrc.local.json"), "{}", "utf8")
    execSync("git add -f .toolkitrc.local.json", { cwd: repo, stdio: "ignore" })
    expect(inspectLocalConfigIgnore(join(repo, ".toolkitrc.local.json"), repo)).toEqual({ state: "tracked" })
  })

  it("非仓库归 not-a-repo", () => {
    const dir = makeDir("tk-gi-st4-")
    const file = join(dir, ".toolkitrc.local.json")
    writeFileSync(file, "{}", "utf8")
    expect(inspectLocalConfigIgnore(file, dir)).toEqual({ state: "not-a-repo" })
  })

  it("位于仓库工作树之外归 outside-repo", () => {
    const repo = makeRepo("tk-gi-st5-")
    const outside = makeDir("tk-gi-st5-out-")
    const file = join(outside, ".toolkitrc.local.json")
    writeFileSync(file, "{}", "utf8")
    expect(inspectLocalConfigIgnore(file, repo)).toEqual({ state: "outside-repo" })
  })
})

// spawnSync 桩：按调用参数分派结果，用于构造真 git 难以稳定复现的归因分支
async function withSpawnSync(
  impl: (args: string[]) => { status: number; stdout?: string; stderr?: string },
  fn: (mod: typeof import("../git-ignore")) => void,
): Promise<void> {
  vi.resetModules()
  vi.doMock("node:child_process", () => ({
    spawnSync: (_cmd: string, args: string[]) => impl(args),
  }))
  try {
    fn(await import("../git-ignore"))
  } finally {
    vi.doUnmock("node:child_process")
    vi.resetModules()
  }
}

describe("git 归因：exit 128 的 stderr 细分（spawnSync 桩）", () => {
  it("probeRepo：stderr 提示非仓库归 not-a-repo", async () => {
    await withSpawnSync(
      () => ({ status: 128, stderr: "fatal: not a git repository (or any of the parent directories): .git" }),
      (mod) => expect(mod.probeRepo("x").kind).toBe("not-a-repo"),
    )
  })

  it("probeRepo：其余错误与空根路径归 unavailable 并带诊断", async () => {
    await withSpawnSync(() => ({ status: 128, stderr: "fatal: 某个真实故障" }), (mod) => {
      const probe = mod.probeRepo("x")
      expect(probe.kind).toBe("unavailable")
      if (probe.kind === "unavailable") expect(probe.detail).toContain("某个真实故障")
    })
    await withSpawnSync(() => ({ status: 0, stdout: "" }), (mod) => {
      const probe = mod.probeRepo("x")
      expect(probe.kind).toBe("unavailable")
      if (probe.kind === "unavailable") expect(probe.detail).toBe("git rev-parse 未返回仓库根路径")
    })
  })

  it("checkIgnore：outside repository 归 outside-repo，其余错误带退出码诊断", async () => {
    await withSpawnSync(() => ({ status: 128, stderr: "fatal: 'x' is outside repository" }), (mod) => {
      expect(mod.checkIgnore("/x/.toolkitrc.local.json").state).toBe("outside-repo")
    })
    await withSpawnSync(() => ({ status: 2 }), (mod) => {
      const probe = mod.checkIgnore("/x/.toolkitrc.local.json")
      expect(probe.state).toBe("unavailable")
      if (probe.state === "unavailable") expect(probe.detail).toBe("git check-ignore 退出码 2")
    })
  })

  it("inspectLocalConfigIgnore：仓库可定位但跟踪判定失败归 unavailable", async () => {
    await withSpawnSync(
      (args) =>
        args.includes("rev-parse") ? { status: 0, stdout: "/repo" } : { status: 2, stderr: "" },
      (mod) => {
        expect(mod.inspectLocalConfigIgnore("/repo/.toolkitrc.local.json", "/repo")).toEqual({
          state: "unavailable",
          detail: "git ls-files 执行失败",
        })
      },
    )
  })
})
