import { defineConfig } from "tsup"

export default defineConfig({
  // 入口文件：与生产构建同构，cli 仅做路由，guard / 常规 CLI 各自按需加载
  entry: ["src/cli.ts", "src/cli-main.ts", "src/guard-cli.ts"],
  outDir: "dist", // 输出目录
  splitting: false, // 是否开启代码分割
  clean: true, // 是否清理dist目录
  dts: false, // 是否生成.d.ts类型文件
  format: ["esm"], // 输出ESM格式
  external: ["@changesets/cli", "commander", "./cli-main.js", "./guard-cli.js"], // 分包入口不打包，保持按需加载
  minify: process.env.NODE_ENV === "production",
  target: "node18" // Node.js 运行时下限（与 package.json engines 对齐）
})
