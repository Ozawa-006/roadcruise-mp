import type { MetadataRoute } from 'next';

// 站点静态名称/主题色：manifest 是静态路由，无法读取 rct_locale Cookie，
// 因此名称与描述沿用站点默认（简体中文）文案。
const SITE_NAME = 'Road Cruise Transport MP';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: 'RCT MP',
    description: '欢迎来到属于卡友的公路世界！加入我们，体验最真实的欧卡2联运。',
    start_url: '/',
    display: 'standalone',
    background_color: '#18191c',
    theme_color: '#111111',
    lang: 'zh-CN',
    // public/ 没有位图图标，唯一真实存在的是 app/favicon.ico（对外路径 /favicon.ico）。
    // 注意：该文件实际是 1248×1248 JPEG，只是扩展名为 .ico，因此不写死 type，交给浏览器嗅探。
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
      },
    ],
  };
}
