'use client';

import { useEffect } from 'react';

// 根布局兜底：此时全局 CSS 可能未加载，因此全部使用内联样式。
export default function GlobalError({ error }: { error: unknown }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-CN">
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
        <title>站点暂时不可用 | Road Cruise Transport MP</title>
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
              站点暂时不可用
            </h1>
            <p style={{ margin: '0 0 28px', color: '#9ca3af', fontSize: '14px', lineHeight: 1.7 }}>
              页面遇到了严重错误，请刷新重试。如果问题持续出现，请稍后再访问。
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
              刷新页面
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
