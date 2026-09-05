import { defineConfig } from 'vitepress'

// 站点基础路径：默认按 GitHub Pages 子路径 /toolkit/，其他部署场景经 VITEPRESS_BASE 环境变量覆盖
const base = process.env.VITEPRESS_BASE || '/toolkit/'

// GitHub 主仓库：社交链接与默认回链共用（对外主品牌渠道，不随部署平台变）
const githubRepo = 'https://github.com/fxri-net/toolkit'

// 站点规范地址（sitemap hostname 与 og:image 用）与编辑回链仓库：默认 GitHub Pages / GitHub 主站，
// 其他部署场景经 SITE_URL / REPO_URL 环境变量注入（值由对应 CI/CD 变量提供，只出现在该站构建产物，
// 不进仓库源码）
const siteUrl = process.env.SITE_URL || 'https://fxri-net.github.io' + base
const repo = process.env.REPO_URL || githubRepo

export default defineConfig({
  lang: 'zh-CN',
  // title 同时控制浏览器标签页与导航栏品牌名（logo 旁显示）
  title: '方弦工具集',
  // 内页标签统一为「当前页 - 方弦工具集」
  titleTemplate: ':title - 方弦工具集',
  description: '专为多人 + AI 跨项目协作打造：任务管理 + 多语言 CHANGELOG。',
  base,
  // 顶级开关：按 git 提交时间生成「最后更新于」（themeConfig.lastUpdated 仅控制文案）
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: `${base}logo.png` }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: '方弦工具集' }],
    ['meta', { property: 'og:title', content: '方弦工具集' }],
    ['meta', { property: 'og:description', content: '专为多人 + AI 跨项目协作打造：任务管理 + 多语言 CHANGELOG。' }],
    // og:image 必须为绝对地址，社交平台据此抓取分享卡片
    ['meta', { property: 'og:image', content: `${siteUrl}og-image.png` }],
    ['meta', { property: 'og:url', content: siteUrl }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],
  // 生成 sitemap.xml；hostname 带 base 子路径，保证各页 URL 拼接正确
  sitemap: { hostname: siteUrl },
  themeConfig: {
    // 导航栏 logo（字符串路径由 VitePress 自动拼接 base 前缀）
    logo: '/logo.png',
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
      { text: '更新日志', link: '/changelog' },
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
          { text: '更新日志', link: '/changelog' },
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
    // 页脚「在 GitHub 上编辑此页」跳转目标
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: '在 GitHub 上编辑此页',
    },
    // 全站页脚
    footer: {
      message: 'MIT 开源协议',
      copyright: 'Copyright © 2026 方弦工具集',
    },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    socialLinks: [{ icon: 'github', link: githubRepo }],
  },
})
