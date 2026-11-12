// docs 命令：文档站主题、导航与产物校验的注册入口与打印
import { resolve } from "node:path"
import type { Command } from "commander"
import { checkDocsTheme, writeDocsTheme } from "../docs/theme"
import { checkDocsDist, DIST_RULES_VERSION } from "../docs/dist"
import { checkDocsNav, NAV_RULES_VERSION } from "../docs/nav"
import type { DocsProblem } from "../docs/types"
import { assertJsonFormat, toJsonText } from "../json-output"

// 注册 docs 命令：装配点只负责按序调用
export function registerDocsCommands(program: Command): void {
  // docs 域：文档站工具，提供主题、导航与构建产物的校验与写入
  const docsCmd = program.command("docs").description("文档站工具：主题、导航与产物的校验与写入")

  // 默认主题目录：VitePress 约定的 docs/.vitepress/theme
  const THEME_DIR = "docs/.vitepress/theme"

  const themeCmd = docsCmd.command("theme").description("统一文档站主题：校验或写入（公共规则随包分发，品牌段由各站自留）")
  themeCmd.action(() => {
    themeCmd.help()
  })

  themeCmd
    .command("check")
    .description("校验主题与模板是否一致（默认动作）")
    .option("--dir <path>", `主题目录（默认 ${THEME_DIR}）`)
    .action((options: { dir?: string }) => {
      const themeDir = resolve(options.dir ?? THEME_DIR)
      try {
        const result = checkDocsTheme(themeDir)
        if (result.ok) {
          console.log(`主题一致：${themeDir}`)
          return
        }
        console.error(`⚠️ 主题与模板不一致（${result.problems.length} 项）`)
        for (const problem of result.problems) console.error(`  - ${problem}`)
        process.exitCode = 1
      } catch (e) {
        console.error(`⚠️ ${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  themeCmd
    .command("write")
    .description("写入或刷新模板，保留既有品牌段")
    .option("--dir <path>", `主题目录（默认 ${THEME_DIR}）`)
    .option("--force", "缺少品牌标记也覆盖")
    .action((options: { dir?: string; force?: boolean }) => {
      const themeDir = resolve(options.dir ?? THEME_DIR)
      try {
        const result = writeDocsTheme(themeDir, { force: options.force })
        for (const file of result.written) console.log(`写入：${file}`)
        for (const file of result.kept) console.log(`保留品牌段：${file}`)
      } catch (e) {
        console.error(`⚠️ ${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  // 默认文档目录：VitePress 约定的 docs
  const DOCS_DIR = "docs"

  // 文档站校验问题输出：warn 用 ⚠️、error 用 ✖，附规则 id 便于对照文档
  function printDocsProblems(problems: DocsProblem[]): void {
    for (const problem of problems) {
      const mark = problem.level === "warn" ? "⚠️" : "✖"
      console.error(`  ${mark} [${problem.id}] ${problem.message}（${problem.file}）`)
    }
  }

  const navCmd = docsCmd.command("nav").description("文档站导航：按 site-nav.json 校验顶栏、侧栏、命名与页面体量")
  navCmd.action(() => {
    navCmd.help()
  })

  navCmd
    .command("check")
    .description("校验 docs/site-nav.json 的结构与导航规则（数据单一真源，不解析站点配置）")
    .option("--dir <path>", `文档目录（默认 ${DOCS_DIR}）`)
    .option("--format <format>", "输出格式（json）")
    .action((options: { dir?: string; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const result = checkDocsNav(resolve(options.dir ?? DOCS_DIR))
      if (options.format === "json") {
        console.log(toJsonText({ command: "docs nav check", ruleVersion: NAV_RULES_VERSION, ok: result.ok, problems: result.problems }))
      } else if (result.ok) {
        console.log(`导航校验通过：顶栏 ${result.navCount} 项、侧栏 ${result.sidebarCount} 组`)
      } else {
        console.error(`⚠️ 导航校验失败（${result.problems.filter((problem) => problem.level === "error").length} 项）`)
      }
      if (options.format !== "json") printDocsProblems(result.problems)
      if (!result.ok) process.exitCode = 1
    })

  const distCmd = docsCmd.command("dist").description("文档站产物：校验 404 不进站点地图与站内搜索索引（需先构建）")
  distCmd.action(() => {
    distCmd.help()
  })

  distCmd
    .command("check")
    .description("校验构建产物：404 页不进 sitemap 与站内搜索索引（产物缺失时跳过）")
    .option("--dir <path>", `文档目录（默认 ${DOCS_DIR}）`)
    .option("--format <format>", "输出格式（json）")
    .action((options: { dir?: string; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const result = checkDocsDist(resolve(options.dir ?? DOCS_DIR))
      if (options.format === "json") {
        console.log(
          toJsonText({ command: "docs dist check", ruleVersion: DIST_RULES_VERSION, ok: result.ok, skipped: result.skipped, problems: result.problems }),
        )
      } else if (result.skipped) {
        console.log("跳过文档站产物校验：未找到 .vitepress/dist（需先执行文档站构建）")
      } else if (result.ok) {
        console.log("文档站产物校验通过：sitemap 不含 404、搜索索引不含 404 页")
      } else {
        console.error(`⚠️ 文档站产物校验失败（${result.problems.filter((problem) => problem.level === "error").length} 项）`)
      }
      if (options.format !== "json") printDocsProblems(result.problems)
      if (!result.ok) process.exitCode = 1
    })

  // 裸 `toolkit docs`：打印本域帮助
  docsCmd.action(() => {
    docsCmd.help()
  })
}
