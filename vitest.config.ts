// vitest 配置：默认不启用 coverage，通过 pnpm test:coverage 生成覆盖率报告
import { defineConfig } from "vitest/config"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  // 组件测试需要编译 .vue（RuleComposer）
  plugins: [vue()],
  test: {
    // 覆盖率插桩与并行加载会把重用例推过默认 5 秒阈值；门禁并发重步骤时进一步拉长，留足余量避免随机红
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/cli.ts", "src/index.ts"],
      // 覆盖率门槛：低于阈值时 pnpm test:coverage 直接失败（CI 已接入，防回归）
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 80,
        lines: 82,
      },
    },
  },
})
