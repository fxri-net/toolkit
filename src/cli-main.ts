// 常规 CLI：命令注册、解析与统一收口；由入口按需加载，避免 guard 快速路径承担完整命令集的启动成本
export async function runCli(version: string): Promise<void> {
  // 重度模块按需动态加载：命令模块与交互组件只为常规命令付出加载成本
  const [
    { Command, CommanderError },
    { INIT_LINKS },
    { registerUsageCommands, setToolkitVersion },
    { autoLinkSkills },
    { emitVersionHint, runUpdateCheckWorker, UPDATE_CHECK_WORKER_ARG },
    { collectSkillVersionUpdates },
    { setupHelp },
    { formatCommanderError },
    { DESCRIPTION },
    { registerInitCommands },
    { registerSkillsCommands },
    { registerTasksCommands },
    { registerChangelogCommands },
    { registerConventionsCommands },
    { registerConfigCommands },
    { registerDocsCommands },
    { registerRulesCommands },
    { registerScopeCommands },
  ] = await Promise.all([
    import("commander"),
    import("./init"),
    import("./usage"),
    import("./skills"),
    import("./update-check"),
    import("./skills/version-status"),
    import("./help"),
    import("./errors"),
    import("./about"),
    import("./commands/init"),
    import("./commands/skills"),
    import("./commands/tasks"),
    import("./commands/changelog"),
    import("./commands/conventions"),
    import("./commands/config"),
    import("./commands/docs"),
    import("./commands/rules"),
    import("./commands/scope"),
  ])

  // 使用情况事件记录当前 toolkit 版本：库形态不依赖包路径，由入口统一注入
  setToolkitVersion(version)

  // 内部升级检查 worker：仅联网刷新缓存后退出，不执行命令、不做技能自愈（参数由版本提示器派生时注入）
  if (process.argv[2] === UPDATE_CHECK_WORKER_ARG) {
    await runUpdateCheckWorker()
    return
  }

  const program = new Command()

  // commander 解析失败时会自行把英文错误写到 stderr 后才抛异常，此处先缓存：
  // 命中中文映射时丢弃原文案改由 main 统一输出，未命中（帮助/版本/未收录 code）则原样放行
  let commanderErrBuffer = ""

  program
    .name("toolkit")
    .description(DESCRIPTION)
    .version(version, "-v, --version", "显示版本号")
    .enablePositionalOptions(true)
    // 交回解析错误的控制权（否则 commander 自行 process.exit，异常捕不到）
    // ⚠️ 须在声明任何子命令之前调用：_exitCallback 只在 .command() 建子命令时按引用复制，之后再设不回溯
    .exitOverride()
    .configureOutput({ writeErr: (str) => { commanderErrBuffer += str } })

  // help footer：指向文档站，降低新用户查找成本
  program.addHelpText(
    "after",
    [
      "",
      "文档站：",
      `  快速开始 ${INIT_LINKS.gettingStarted}`,
      `  完整攻略 ${INIT_LINKS.guide}`,
      `  全部文档 ${INIT_LINKS.site}`,
    ].join("\n"),
  )

  // init 与 skills 域：命令注册与打印移入 ./commands 下的独立模块
  registerInitCommands(program)
  registerSkillsCommands(program)
  registerConventionsCommands(program)
  registerConfigCommands(program)
  registerDocsCommands(program)

  // tasks 与 changelog 域：命令注册与打印移入 ./commands 下的独立模块
  registerTasksCommands(program)
  registerChangelogCommands(program)

  registerRulesCommands(program)
  registerScopeCommands(program)

  // 使用情况域：技能使用统计（默认关闭，本地存储）
  registerUsageCommands(program)

  // 帮助口径统一：命令声明完毕后递归换中文帮助文案并对齐父级清单
  // ⚠️ 顺序：须先 setupHelp 再 helpCommand——help 子命令自带 helpOption(false)，反过来会把它的 Usage 撑成 [options] [command]
  setupHelp(program)
  program.helpCommand("help [command]", "显示帮助")

  // 链接自愈先于命令执行：升级后旧链接悬空时本次命令即复位（开关 skills.autoLink，CI 环境自动跳过）
  const repaired = autoLinkSkills()
  // 提示走 stderr：stdout 为机器可读输出（--format json）的专用通道，不得混入诊断信息
  if (repaired > 0) console.error(`已自动修复 ${repaired} 个技能链接（如不需要可配置 .toolkitrc.json 的 skills.autoLink: false 关闭）`)
  try {
    await program.parseAsync(process.argv)
  } catch (err) {
    // exitOverride 后 commander 把「解析失败」与「已输出帮助/版本」统一改为抛异常，均经此收口
    if (!(err instanceof CommanderError)) throw err
    const zh = formatCommanderError(err)
    // 命中映射：丢弃 commander 英文原文，改输出中文提示；未命中（帮助/版本等）：原样放行
    if (zh) console.error(zh)
    else process.stderr.write(commanderErrBuffer)
    process.exitCode = err.exitCode
  } finally {
    // 所有路径统一收口：成功命令按通道输出一行提示；帮助 / 版本 / JSON / 透传在函数内跳过。
    // 技能取证按需触发：不可提示的命令不读技能文件
    const skillAlerts = () => {
      const updates = collectSkillVersionUpdates()
      return [
        ...updates.builtin.map((item) => ({ channel: "builtin" as const, name: item.name, current: item.installed, latest: item.latest })),
        ...updates.external.map((item) => ({ channel: "external" as const, source: item.source, name: item.name, current: item.installed, latest: item.latest })),
      ]
    }
    emitVersionHint(version, {
      argv: process.argv.slice(2),
      exitCode: typeof process.exitCode === "number" ? process.exitCode : 0,
      skillAlerts,
    })
  }
}
