import type { MetadataRoute } from 'next';

// 固定生产域名：robots.txt 会被构造成静态文件，不能让本地 .env.local 的
// NEXTAUTH_URL=http://localhost:3000 写进线上文件。
const SITE_URL = 'https://www.roadcruise-mp.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /profile 为需登录的私有页，原有限制保留。
      disallow: ['/admin', '/api', '/settings', '/reset-password', '/profile'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
