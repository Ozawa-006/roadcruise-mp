'use client';

import { useEffect, useState } from 'react';

// 根布局兜底：此时全局 CSS / I18nProvider 可能都不可用，因此使用内联样式 + Cookie 判断语言。
function detectLocale(): 'zh-CN' | 'en' {
  if (typeof document === 'undefined') return 'zh-CN';
  const match = document.cookie.match(/(?:^|;\s*)rct_locale=(en|zh-CN)/);
  return match?.[1] === 'en' ? 'en' : 'zh-CN';
}

const COPY = {
  zh: {
    title: '站点暂时不可用 | Road Cruise Transport MP',
    heading: '站点暂时不可用',
    body: '页面遇到了严重错误，请刷新重试。如果问题持续出现，请稍后再访问。',
    reload: '刷新页面',
  },
  en: {
    title: 'Site temporarily unavailable | Road Cruise Transport MP',
    heading: 'Site temporarily unavailable',
    body: 'Something went seriously wrong. Please reload the page. If the problem persists, come back later.',
    reload: 'Reload page',
  },
} as const;

export default function GlobalError({ error }: { error: unknown }) {
  const [locale, setLocale] = useState<'zh-CN' | 'en'>('zh-CN');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    setLocale(detectLocale());
    setMounted(true);
  }, []);

  const copy = locale === 'en' ? COPY.en : COPY.zh;

  return (
    <html lang={mounted ? locale : 'zh-CN'}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          backgroundColor: '#18191c',
          color: '#d1d5db',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", Arial, sans-serif',
          colorScheme: 'dark',
        }}
      >
        <title>{copy.title}</title>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              backgroundColor: '#2c2d31',
              border: '1px solid #374151',
              borderRadius: '8px',
              padding: '40px 32px',
              textAlign: 'center',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
            }}
          >
            <p
              style={{
                margin: '0 0 12px',
                color: '#60a5fa',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
              }}
            >
              Road Cruise Transport MP
            </p>
            <h1 style={{ margin: '0 0 12px', color: '#ffffff', fontSize: '26px', fontWeight: 900 }}>
              {copy.heading}
            </h1>
            <p style={{ margin: '0 0 28px', color: '#9ca3af', fontSize: '14px', lineHeight: 1.7 }}>
              {copy.body}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                padding: '12px 24px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {copy.reload}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
