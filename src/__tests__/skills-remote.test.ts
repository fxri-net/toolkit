// 远程技能来源：地址解析、file:// 克隆与项目面状态不落本机缓存路径
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { installProjectSkills, parseRemoteSpec, resolveSource } from "../skills"

let home = ""

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-remote-home-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
})

afterEach(() => {
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  rmSync(home, { recursive: true, force: true })
})

// 建最小 git 仓库作为远程来源：skills.json + 单技能 + v1.0.0 标签
function makeRepo(): string {
  const dir = mkdtempSync(join(home, "tk-remote-repo-"))
  mkdirSync(join(dir, "skills", "demo"), { recursive: true })
  writeFileSync(
    join(dir, "skills", "demo", "SKILL.md"),
    "---\nname: demo\ndescription: demo\nmetadata:\n  version: \"0.1.0\"\n  tier: optional\n---\n\n# demo\n",
    "utf8",
  )
  writeFileSync(
    join(dir, "skills.json"),
    JSON.stringify({ formatVersion: 1, name: "remote-demo", version: "0.1.0", skills: [{ name: "demo", path: "skills/demo" }] }),
    "utf8",
  )
  const git = (args: string[]): void => {
    execFileSync("git", args, { cwd: dir, stdio: "ignore" })
  }
  git(["init", "-q"])
  git(["add", "."])
  git(["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "init"])
  git(["tag", "v1.0.0"])
  return dir
}

describe("parseRemoteSpec：远程地址解析", () => {
  it("github 简写展开并拆出 ref", () => {
    expect(parseRemoteSpec("github:fxri-net/playbook#v0.1.0")).toEqual({
      url: "https://github.com/fxri-net/playbook",
      ref: "v0.1.0",
    })
  })

  it("去末尾斜杠与 .git 后缀", () => {
    expect(parseRemoteSpec("https://github.com/fxri-net/playbook.git/")).toEqual({
      url: "https://github.com/fxri-net/playbook",
      ref: undefined,
    })
  })
})

describe("resolveSource：远程克隆与项目面状态", () => {
  it("file:// 地址按 ref 克隆并解析技能", () => {
    const repo = makeRepo()
    const url = pathToFileURL(repo).href
    const source = resolveSource(`${url}#v1.0.0`, { name: "remote-demo", temporary: false })
    expect(source.name).toBe("remote-demo")
    expect(source.url).toBe(url)
    expect(source.ref).toBe("v1.0.0")
    expect(source.skills.map((skill) => skill.name)).toEqual(["demo"])
  })

  it("项目面状态不写缓存绝对路径，只记地址与 ref", () => {
    const repo = makeRepo()
    const url = pathToFileURL(repo).href
    const project = join(home, "project")
    mkdirSync(project, { recursive: true })
    installProjectSkills({ cwd: project, externalSources: [{ path: `${url}#v1.0.0`, name: "remote-demo", temporary: false }], skills: ["demo"] })
    const state = JSON.parse(readFileSync(join(project, ".toolkit", "state.json"), "utf8")) as {
      sources: Record<string, { root: string; url?: string; ref?: string }>
    }
    expect(state.sources["remote-demo"]).toMatchObject({ root: "", url, ref: "v1.0.0" })
  })
})
