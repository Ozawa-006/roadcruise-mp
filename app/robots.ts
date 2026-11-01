import type { MetadataRoute } from 'next';

// 站点公开地址：优先使用环境变量，去掉末尾斜杠避免拼出 "//"。
const BASE_URL = (process.env.NEXTAUTH_URL ?? 'https://www.roadcruise-mp.com').replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api', '/settings', '/profile'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
