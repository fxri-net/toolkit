// init 命令：任务区初始化的注册入口与报告打印
import type { Command } from "commander"
import { resolveTasksDir } from "../config"
import { INIT_LINKS, initWorkspace, type InitAction, type InitReport } from "../init"

// 注册 init 命令：装配点只负责按序调用
export function registerInitCommands(program: Command): void {
  // init 动作标签：逐项如实报告实际动作，替代只讲「会做什么」的固定话术
  const INIT_ACTION_LABEL: Record<InitAction, string> = {
    created: "新建",
    updated: "更新",
    kept: "保持",
    appended: "追加",
    skipped: "跳过",
  }

  // 打印 init 报告：逐项列出实际动作与原因，hint 另起一行提示后续可选操作
  function printInitReport(report: InitReport): void {
    console.log(`任务区：${report.tasksDir}`)
    for (const p of report.products) {
      console.log(`  ${INIT_ACTION_LABEL[p.action]} ${p.target}${p.detail ? `（${p.detail}）` : ""}`)
      if (p.hint) console.log(`    提示：${p.hint}`)
    }
    // 发布型包误打包提醒独立于产物列表：判据与 prepare 钩子是否写入无关（风险不是一种产物动作）
    if (report.publishRiskHint) console.log(`提示：${report.publishRiskHint}`)
    console.log("")
    console.log("下一步：")
    // 规范触达第一层是全局技能（不依赖项目内任何文件）；未安装时补一行安装指引，已装不重复打扰
    if (!report.skillsInstalled) {
      console.log("  全局技能：未安装，执行 toolkit skills install 启用（规范触达第一层，不依赖项目内文件；toolkit skills status 可查现场）")
    }
    console.log(`  快速开始：${INIT_LINKS.gettingStarted}`)
    console.log(`  完整攻略：${INIT_LINKS.guide}`)
  }

  // init：初始化项目任务区（生成任务区骨架、规范载体与技能入口壳，幂等可重复执行）
  program
    .command("init")
    .description("初始化项目任务区（生成 .tasks/ 骨架、规范载体与技能入口壳，补齐 .gitignore 片段与 prepare 刷新钩子）")
    .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
    .option("--no-hooks", "不写入 package.json 的 prepare 刷新钩子（默认写入，仅当本地依赖含 @xfri/toolkit）")
    .action((options: { dir?: string; hooks?: boolean }) => {
      try {
        // 与 tasks 命令同口径：初始化时也尊重配置中已声明的外置任务目录
        printInitReport(initWorkspace(resolveTasksDir(options.dir), process.cwd(), { hooks: options.hooks }))
      } catch (e) {
        console.error(`⚠️ 初始化失败：${(e as Error).message}`)
        process.exitCode = 1
      }
    })
}
