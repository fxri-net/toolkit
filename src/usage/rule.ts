// 全局规则文案：与文档站可复制块同源，由 `toolkit usage rule print` 输出
// 不自动改写用户全局规则文件，避免替用户做授权决定
export const USAGE_GLOBAL_RULE = `## Skill usage（技能使用情况，可选）
- 技能使用统计由 toolkit 的本地 Hook 自动记录；开启后无需手工补记，避免重复计数。
- 记录默认只保存在本机，不会上传网络；上传需用户显式开启并配置端点。
- 查看统计使用 \`toolkit usage stats\`；状态异常先运行 \`toolkit usage doctor\`。
- 不要自行修改使用情况数据文件或把导出内容上传到未授权地址。`
