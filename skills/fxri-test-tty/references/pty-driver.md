# PTY 驱动模板与平台差异

> 本文件是 `fxri-test-tty` 的明细附表；流程与坑位以 `SKILL.md` 为准。

## 驱动模板

把 `<CLI>` 换成 CLI 入口脚本的绝对路径（如包内 `dist/cli.js`），`<CASE>` 换成用例名。
模板不依赖测试框架，可直接放进一次性脚本，也可包成 vitest 用例。

```ts
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node-pty"

// 按键序列：ConPTY 与 ANSI 终端对这些控制码一致，按键名只作可读别名
export const KEYS = {
  up: "\x1b[A",
  down: "\x1b[B",
  space: " ",
  enter: "\r",
  esc: "\x1b",
  yes: "y\r",
  no: "n\r",
  interrupt: "\x03",
} as const

// 清洗输出：去掉 ANSI / OSC 序列、ConPTY 退出噪声与回车覆盖，只留可断言的文本
export function clean(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "") // CSI：颜色、光标移动、清屏
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "") // OSC：窗口标题等
    .replace(/^.*AttachConsole failed.*\r?\n?/gm, "") // Windows ConPTY 退出噪声
    .replace(/\r\n?/g, "\n") // 回车覆盖按换行处理，便于按行匹配
    .replace(/\n{3,}/g, "\n\n")
}

export interface Sandbox {
  root: string
  home: string
  work: string
  env: NodeJS.ProcessEnv
}

// 沙箱：home 是 work 的祖先，配置从 cwd 向上查找时停在沙箱内
export function createSandbox(name: string): Sandbox {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "<cli>-e2e-")))
  const home = join(root, "home")
  const work = join(home, "work", name)
  mkdirSync(work, { recursive: true })
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
  }
  return { root, home, work, env }
}

export function disposeSandbox(sandbox: Sandbox): void {
  rmSync(sandbox.root, { recursive: true, force: true })
}

export interface Step {
  // 出现该提示后再发按键；纯等待型步骤可省略 keys
  expect: RegExp
  keys?: string
  // 单步等待上限
  timeoutMs?: number
}

export interface RunOptions {
  // CLI 入口脚本（如 dist/cli.js）
  cli: string
  args?: string[]
  sandbox: Sandbox
  steps: Step[]
  // 整体超时：从启动到退出
  timeoutMs?: number
}

export interface RunResult {
  exitCode: number
  raw: string
  view: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 超时包装：超时即拒绝，由调用方 kill 子进程
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    sleep(ms).then(() => {
      throw new Error(`超时：${label}`)
    }),
  ])
}

// 启动真 TTY、按用例表驱动按键，返回退出码与清洗后的输出
export async function runTty(options: RunOptions): Promise<RunResult> {
  const isWindows = process.platform === "win32"
  const child = spawn(process.execPath, [options.cli, ...(options.args ?? [])], {
    name: "xterm-color",
    cols: 120,
    rows: 40,
    cwd: options.sandbox.work,
    env: options.sandbox.env,
    // ConPTY 提供与 Windows Terminal 接近的行为；POSIX 走 forkpty，无需该选项
    ...(isWindows ? { useConpty: true } : {}),
  })

  let raw = ""
  let consumed = 0 // 已消费的清洗后长度：只看新增输出，避免历史提示重复命中
  let exited = false
  child.onData((chunk) => {
    raw += chunk
  })
  const exit = new Promise<number>((resolve) => {
    child.onExit(({ exitCode }) => {
      exited = true
      resolve(exitCode)
    })
  })

  // 等提示出现：按新增输出匹配，命中后推进消费位置
  const waitFor = async (pattern: RegExp, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const view = clean(raw)
      const fresh = view.slice(consumed)
      const matched = fresh.match(pattern)
      if (matched) {
        consumed += (matched.index ?? 0) + matched[0].length
        return
      }
      if (Date.now() > deadline) {
        throw new Error(`等待提示超时：${pattern}（最近输出：${view.slice(-400)}）`)
      }
      await sleep(50)
    }
  }

  try {
    for (const step of options.steps) {
      await waitFor(step.expect, step.timeoutMs ?? 8_000)
      if (step.keys) child.write(step.keys)
    }
    const exitCode = await withTimeout(exit, options.timeoutMs ?? 30_000, "进程退出")
    return { exitCode, raw, view: clean(raw) }
  } finally {
    // 退出后再 kill 会抛错；未退出时先正常终止，POSIX 下残留则补强
    if (!exited) {
      child.kill()
      if (!isWindows) {
        await sleep(500)
        if (!exited) child.kill("SIGKILL")
      }
    }
  }
}
```

## 读取与解码

- `onData` 返回已解码的字符串（node-pty 按 UTF-8 处理），不要再按 Buffer 二次解码。
- Windows 旧代码页下中文可能乱码；断言优先匹配 ASCII 稳定的提示片段或选项序号，并在失败信息里保留原始片段。
- 输出是流式片段，一次 `onData` 不保证是完整一屏；按累计文本匹配，不按单次回调断言。

## 用例写法

一条用例就是「等提示 → 发键」的序列，最后统一断言退出码与落盘：

```ts
const sandbox = createSandbox("<CASE>")
try {
  const result = await runTty({
    cli: "<CLI>",
    args: ["<子命令>", "<参数>"],
    sandbox,
    steps: [
      { expect: /Select skills/i, keys: KEYS.down }, // 等待列表出现再移动
      { expect: /Select skills/i, keys: KEYS.space }, // 多选：空格切换当前项
      { expect: /Select skills/i, keys: KEYS.enter }, // 回车提交
      { expect: /Proceed\? \(y\/N\)/i, keys: KEYS.yes }, // 确认框显式回答
    ],
  })
  // 断言口径见 references/assertions.md
} finally {
  disposeSandbox(sandbox)
}
```

- **多选列表会重复重绘同一提示**：等同一段文案可以多次命中，但每次只消费新增输出；不稳定时改用选项文本作为 `expect`。
- **不要用固定 sleep 代替等待**：慢机器上会误判；等待超时要报出最近 400 字符输出，便于定位。
- **args 里不要带 shell 引号**：直接传数组，跨平台转义交给进程参数层。

## Windows 与 POSIX 差异

| 维度 | Windows | POSIX |
| --- | --- | --- |
| 终端实现 | ConPTY（Win10 1809+），旧环境回退 winpty | forkpty |
| 噪声 | 退出时可能输出 `AttachConsole failed`；conhost 短暂残留 | 一般无附加行；重绘仍会产生 CSI 序列 |
| 中断键 | `\x03` 被当作控制台事件，可能直接终止进程 | `\x03` 投递给前台进程组，SIGINT 可捕获 |
| 终止 | `kill()` 结束 pty 进程 | `kill()` 后可能残留子进程，需补 `SIGKILL` |
| 家目录变量 | `USERPROFILE`、`APPDATA`、`LOCALAPPDATA` | `HOME`、`XDG_CONFIG_HOME` |
| 临时目录 | `os.tmpdir()` 无软链 | macOS 的 `/var` 指向 `/private/var`，必须 `realpath` |
| 颜色 | 由 ConPTY 决定是否启用 | 依赖 `TERM`，未设置时先设 `TERM=xterm-256color` |

## home 沙箱隔离

目录层级必须是：

```
<sandbox>/
└── home/                 ← HOME / USERPROFILE
    ├── work/
    │   └── <case>/       ← cwd
    └── .config/          ← XDG_CONFIG_HOME（按被测 CLI 实际读取的变量补）
```

- **为什么必须嵌套**：CLI 查找配置的常见做法是从 cwd 逐级向上。home 与 work 平级时，向上链是
  `<case> → work → <sandbox> → 系统临时目录 → …`；Windows 的系统临时目录本身就在真实用户目录
  （`%USERPROFILE%\AppData\Local\Temp`）之下，继续向上就会经过真实用户目录并可能读到那里的配置。
  把 home 设为 work 的祖先，向上查找会先撞到沙箱 home 而停止。
- **环境变量要成套覆写**：只改 `HOME` 时，Windows 侧仍可能读 `USERPROFILE`；只改 `USERPROFILE` 时，POSIX 侧仍读 `HOME`。
  四个平台变量一起改，并按被测 CLI 的实际读取面补 `XDG_CONFIG_HOME` 等。
- **路径归一**：`mkdtempSync` 后再 `realpathSync`，避免 macOS 软链导致「同一目录两个路径」的断言误判。
- **收尾核验**：跑完检查真实用户目录无新增文件；沙箱内应出现预期的配置 / 状态文件。两者任一不符都按失败处理。
- **不继承可疑变量**：若宿主环境有指向真实用户目录的自定义配置变量，先显式覆盖或删除，再启动被测进程。
