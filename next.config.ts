import type { NextConfig } from 'next';

// 全局安全响应头。
// 注意：不添加 CSP，避免误伤 Supabase 请求与站外图片资源。
const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

// HSTS 只在生产环境下发，避免本地 http:// 开发环境被浏览器强制升级到 https。
if (process.env.NODE_ENV === 'production') {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  });
}

const nextConfig: NextConfig = {
  // 保持为空，或者保留你原来关于 allowedDevOrigins 的配置
  async headers() {
    return [
      {
        // 匹配所有路径，为全站响应统一加上安全头。
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
