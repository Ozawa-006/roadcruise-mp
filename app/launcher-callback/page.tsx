'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ChromeWebView {
  postMessage: (message: unknown) => void;
}

declare global {
  interface Window {
    chrome?: { webview?: ChromeWebView };
  }
}

type Status = 'loading' | 'success' | 'error';

interface LauncherTokenPayload {
  accessToken?: string;
  expiresIn?: number;
  refreshToken?: string | null;
  user?: unknown;
  error?: { code?: string; message?: string };
}

/** 启动器 WebView2 登录回调：把 JWT 通过 postMessage 回传给启动器。 */
export default function LauncherCallbackPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('正在完成登录…');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) {
          setStatus('error');
          setMessage('未检测到登录状态，请返回启动器重新登录。');
        }
        return;
      }

      try {
        const response = await fetch('/api/auth/launcher/token', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const payload = (await response.json()) as LauncherTokenPayload;
        if (!response.ok || !payload.accessToken) {
          throw new Error(payload.error?.code ?? `http_${response.status}`);
        }

        if (cancelled) return;
        setToken(payload.accessToken);
        setStatus('success');
        setMessage('登录成功，正在返回启动器…');

        window.chrome?.webview?.postMessage({
          type: 'rctmp-auth',
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken ?? null,
          user: payload.user,
          expiresIn: payload.expiresIn,
        });
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setMessage(
          error instanceof Error ? `登录失败：${error.message}` : '登录失败，请返回启动器重试。'
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#18191c] p-8 font-sans text-gray-200">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-[#2c2d31] p-8 text-center shadow-2xl">
        <h1 className="text-xl font-black text-white">RCTMP Launcher</h1>

        <div
          className={`mt-5 text-sm ${
            status === 'success'
              ? 'text-green-400'
              : status === 'error'
                ? 'text-red-400'
                : 'text-gray-400'
          }`}
        >
          {message}
        </div>

        {status === 'success' && (
          <p className="mt-3 text-xs text-gray-500">
            如果启动器没有反应，请关闭此窗口，在启动器里点击「重新登录」。
          </p>
        )}

        {token && (
          <textarea
            readOnly
            value={token}
            className="mt-5 h-32 w-full resize-none rounded border border-gray-700 bg-[#18191c] p-2 font-mono text-[10px] text-gray-400"
          />
        )}
      </div>
    </main>
  );
}
