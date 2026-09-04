import { defineConfig } from 'vitepress'

// 站点基础路径：默认按 GitHub Pages 子路径 /toolkit/，GitLab/Gitee 等平台经 VITEPRESS_BASE 环境变量覆盖
const base = process.env.VITEPRESS_BASE || '/toolkit/'

export default defineConfig({
  lang: 'zh-CN',
  title: '@fxri/toolkit',
  description: '专为多人 + AI 跨项目协作打造：任务管理 + 多语言 CHANGELOG。',
  base,
  themeConfig: {
    nav: [
      { text: '指南', link: '/getting-started' },
      {
        text: '参考',
        items: [
          { text: 'CLI 参考', link: '/cli' },
          { text: 'API 参考', link: '/api' },
          { text: '配置参考', link: '/config' },
        ],
      },
      { text: 'FAQ', link: '/faq' },
      { text: 'AI 全局规则', link: '/ai-rules' },
    ],
    sidebar: [
      {
        text: '开始',
        items: [
          { text: '首页', link: '/' },
          { text: '新手指南', link: '/getting-started' },
          { text: '完整攻略', link: '/guide' },
        ],
      },
      {
        text: '参考',
        items: [
          { text: 'CLI 参考', link: '/cli' },
          { text: 'API 参考', link: '/api' },
          { text: '配置参考', link: '/config' },
        ],
      },
      {
        text: '答疑',
        items: [
          { text: 'FAQ', link: '/faq' },
          { text: 'AI 全局规则', link: '/ai-rules' },
        ],
      },
    ],
    // 本地搜索 + 中文界面文案
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '未找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新于' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    socialLinks: [{ icon: 'github', link: 'https://github.com/fxri-net/toolkit' }],
  },
})
