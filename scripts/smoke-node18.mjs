// Node 18 运行下限冒烟：验证已发布形态的 CLI 在该版本上可加载交互组件、关键命令可用、changesets 透传可跑
// CI 由 node18 作业调用；本地验证可传 --cli dist/cli.js 直接跑构建产物（不依赖全局安装）
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

const args = process.argv.slice(2)
const cliFlagIndex = args.indexOf("--cli")
const cliPath = cliFlagIndex >= 0 ? resolve(args[cliFlagIndex + 1] ?? "") : null

// 统一失败出口：打印实际执行的命令与退出码，便于 CI 定位
function fail(command, code) {
  console.error(`⚠️ 冒烟失败：${command}（退出码 ${code}）`)
  process.exit(1)
}

// 运行目标 CLI：--cli 模式走当前 node 直调产物，否则走 PATH 上的全局 toolkit
function runCli(cliArgs, cwd) {
  const command = cliPath ? process.execPath : "toolkit"
  const finalArgs = cliPath ? [cliPath, ...cliArgs] : cliArgs
  const result = spawnSync(command, finalArgs, {
    cwd,
    stdio: "inherit",
    // Windows 下全局命令是 .cmd 包装，需要 shell 才可执行
    shell: !cliPath && process.platform === "win32",
  })
  if (result.status !== 0) fail([command, ...finalArgs].join(" "), result.status)
}

// 解析包根：交互组件从已安装包内解析，避免误命中仓库或无关的 node_modules
function resolvePackageRoot() {
  if (cliPath) return dirname(dirname(cliPath))
  const result = spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: process.platform === "win32" })
  if (result.status !== 0) fail("npm root -g", result.status)
  return join((result.stdout ?? "").trim(), "@fxri", "toolkit")
}

// 探测交互组件能否加载：本次故障的原始形态就是加载期抛 ESM 导出错误
function probePrompts(root) {
  const code = "await import('@inquirer/prompts'); console.log('交互组件加载通过')"
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: root, stdio: "inherit" })
  if (result.status !== 0) fail(`import('@inquirer/prompts')（cwd=${root}）`, result.status)
}

// 运行 git 命令：changesets status 需要与基准分支比较，临时目录要有一个最小仓库
function runGit(gitArgs, cwd) {
  const result = spawnSync("git", gitArgs, { cwd, stdio: "ignore" })
  if (result.status !== 0) fail(`git ${gitArgs.join(" ")}`, result.status)
}

console.log(`Node 18 冒烟：node ${process.versions.node}`)
// 先自证运行版本达到下限，避免在更低版本上跑出「假阳性」
const [major = 0, minor = 0] = process.versions.node.split(".").map((part) => Number(part))
if (major < 18 || (major === 18 && minor < 17)) fail(`node ${process.versions.node} 低于 18.17.0`, 1)
runCli(["--version"], process.cwd())
probePrompts(resolvePackageRoot())

const work = mkdtempSync(join(tmpdir(), "toolkit-node18-"))
try {
  runCli(["tasks", "list"], work)
  runCli(["skills", "install", "--scope", "global", "--dry-run", "--yes"], work)
  // changesets 透传：真正加载 changesets 的是动作子命令，--help 会被 commander 短路
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "smoke-pkg", version: "1.0.0" }, null, 2))
  runCli(["changelog", "init"], work)
  writeFileSync(join(work, ".changeset", "smoke-fix.md"), '---\n"smoke-pkg": patch\n---\n\n- 修复：冒烟\n')
  // status 需要与基准分支比较：建一个只有初始提交的最小 git 仓库
  runGit(["init", "-q", "-b", "main"], work)
  runGit(["-c", "user.email=smoke@example.com", "-c", "user.name=smoke", "add", "-A"], work)
  runGit(["-c", "user.email=smoke@example.com", "-c", "user.name=smoke", "commit", "-qm", "init"], work)
  runCli(["changelog", "status"], work)
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log("Node 18 冒烟通过")
