// ESLint 扁平配置：@eslint/js 推荐 + typescript-eslint 推荐
import js from "@eslint/js"
import tseslint from "typescript-eslint"

// 运行时基线：package.json 的 engines 为 Node >=18.17.0，禁用仅更高版本才稳定的内置 API
const NODE_BASELINE_BANS = [
  ["CallExpression[callee.object.name='Array'][callee.property.name='fromAsync']", "Array.fromAsync"],
  ["CallExpression[callee.object.name='Object'][callee.property.name='groupBy']", "Object.groupBy"],
  ["CallExpression[callee.object.name='Map'][callee.property.name='groupBy']", "Map.groupBy"],
  ["CallExpression[callee.object.name='Promise'][callee.property.name='withResolvers']", "Promise.withResolvers"],
  ["CallExpression[callee.property.name=/^(toSorted|toReversed|toSpliced|with)$/]", "数组的 toSorted / toReversed / toSpliced / with"],
  ["CallExpression[callee.property.name='isWellFormed']", "String.prototype.isWellFormed"],
  ["CallExpression[callee.property.name='toWellFormed']", "String.prototype.toWellFormed"],
]

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "local/**", ".toolkit-verify/**", "docs/.vitepress/dist/**", "docs/.vitepress/cache/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // scripts/ 下的 Node 脚本（非 TS 源码）直接跑在 Node 环境，未引入 globals 包故按需声明
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    rules: {
      // exceljs 为 CJS namespace 类型，跨模块 interop 需 any 兜底（import.ts / export.ts 已注释说明用途）
      "@typescript-eslint/no-explicit-any": "off",
      // 元数据行（负责人/状态/范围/完成时间）需用全角空格分隔，模板字符串中属有意书写
      "no-irregular-whitespace": "off",
      // 归档/修复的排他锁：openSync 返回值仅作 fd 占用标记，读与否不影响语义
      "no-useless-assignment": "off",
    },
  },
  {
    // 最低版本兼容：新 API 须先在 engines 下限验证，不得只为省事使用高版本内置
    files: ["src/**/*.ts", "scripts/**/*.mjs"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...NODE_BASELINE_BANS.map(([selector, api]) => ({
          selector,
          message: `${api} 需要 Node 20+；本项目 engines 基线为 18.17.0，请改用兼容写法`,
        })),
      ],
    },
  },
  {
    // 交互入口单一：所有交互都走 src/prompts.ts，禁止各命令直接依赖 inquirer
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@inquirer/prompts", message: "交互一律走 src/prompts.ts 的统一层，不要直接引入 inquirer" }],
        },
      ],
    },
  },
  {
    // 统一交互层自身是唯一合法引入点
    files: ["src/prompts.ts"],
    rules: { "no-restricted-imports": "off" },
  },
)
