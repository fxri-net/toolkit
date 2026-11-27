// vitest 配置：默认不启用 coverage，通过 pnpm test:coverage 生成覆盖率报告
import { defineConfig } from "vitest/config"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  // 组件测试需要编译 .vue（RuleComposer）
  plugins: [vue()],
  test: {
    // 临时目录兜底：文件结束与进程退出时删净登记项，漏写清理的用例也不在 %TEMP% 留残留
    setupFiles: ["./src/__tests__/setup-temp.ts"],
    // 测试收集面限定在 src/__tests__，避免测试文件落在临时目录守卫的扫描范围之外
    include: ["src/__tests__/**/*.test.ts"],
    // 覆盖率插桩与并行加载会把重用例推过默认 5 秒阈值；门禁并发重步骤时进一步拉长，留足余量避免随机红
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      // json / json-summary 供 scripts/check-coverage.mjs 做双轨判定；阈值唯一真源在脚本内，这里不再配置。
      // 默认不输出 text 表格（通过即静默）；需要逐文件明细时显式加 --coverage.reporter=text 或看 HTML 报告
      reporter: ["json", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/index.ts"],
    },
  },
})
