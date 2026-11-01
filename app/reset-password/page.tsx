'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 在 supabase-js 消费 URL hash 之前捕获（模块加载时执行），用于判断这是不是重置密码链接。
const INITIAL_RECOVERY_HASH =
  typeof window !== 'undefined' ? window.location.hash : '';

type PageState = 'checking' | 'ready' | 'invalid' | 'done';

export default function ResetPasswordPage() {
  const [state, setState] = useState<PageState>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    // 在 supabase-js 消费 URL hash 之前读取，判断这是不是“重置密码”链接。
    const initialHash = INITIAL_RECOVERY_HASH;
    const looksLikeRecovery =
      /type=recovery/.test(initialHash) || /type%3Drecovery/i.test(initialHash);
    let sawRecoveryEvent = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') {
        sawRecoveryEvent = true;
        setState('ready');
      }
    });

    const check = async (attempt = 0) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;

      if (session && (looksLikeRecovery || sawRecoveryEvent)) {
        setState('ready');
        // 清理 hash 里的 token，避免刷新页面重复使用
        window.history.replaceState({}, '', '/reset-password');
        return;
      }

      if (attempt < 10) {
        window.setTimeout(() => void check(attempt + 1), 300);
        return;
      }

      setState('invalid');
    };

    const timer = window.setTimeout(() => void check(), 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (password.length < 8) {
      setMessage('❌ 新密码至少需要 8 个字符。');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('❌ 两次输入的密码不一致。');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();
      setState('done');
    } catch (error: unknown) {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : '';
      setMessage(`❌ 重置失败：${msg || '链接可能已过期，请重新申请重置邮件。'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#18191c] text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-[#2c2d31] p-8 shadow-2xl">
        {state === 'checking' && (
          <p className="py-10 text-center text-sm text-gray-400">正在验证重置链接...</p>
        )}

        {state === 'invalid' && (
          <>
            <h1 className="mb-3 text-center text-2xl font-bold">链接无效或已过期</h1>
            <p className="mb-6 text-center text-sm leading-relaxed text-gray-400">
              重置密码链接只能使用一次，且有效期有限。请回到登录页重新申请一封重置邮件。
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/login"
                className="rounded bg-blue-600 px-4 py-3 text-center font-bold text-white transition hover:bg-blue-700"
              >
                返回登录并重新申请
              </Link>
              <Link
                href="/support"
                className="rounded border border-gray-600 px-4 py-2 text-center text-sm text-gray-300 transition hover:border-gray-400 hover:text-white"
              >
                需要帮助？
              </Link>
            </div>
          </>
        )}

        {state === 'ready' && (
          <>
            <h1 className="mb-2 text-center text-2xl font-bold">设置新密码</h1>
            <p className="mb-6 text-center text-sm text-gray-400">
              请设置一个新的登录密码（至少 8 位）。
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-400">新密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded border border-gray-600 bg-[#18191c] px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-400">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded border border-gray-600 bg-[#18191c] px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded bg-green-600 px-4 py-3 font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
              >
                {busy ? '保存中...' : '保存新密码'}
              </button>
            </form>
            {message && (
              <p className="mt-4 text-center text-sm font-bold text-red-400">{message}</p>
            )}
          </>
        )}

        {state === 'done' && (
          <>
            <h1 className="mb-3 text-center text-2xl font-bold">✅ 密码已重置</h1>
            <p className="mb-6 text-center text-sm text-gray-400">
              请使用新密码重新登录。为了安全，所有旧会话已退出。
            </p>
            <Link
              href="/login"
              className="block rounded bg-blue-600 px-4 py-3 text-center font-bold text-white transition hover:bg-blue-700"
            >
              去登录
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
