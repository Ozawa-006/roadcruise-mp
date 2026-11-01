'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams } from 'next/navigation';
import { attemptSteamBind } from '../../lib/steam-bind-client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** 服务端回跳时可能带上的错误码 -> 中文提示 */
const ERROR_MESSAGES: Record<string, string> = {
  no_ets2: '❌ Steam 验证失败：您必须拥有正版 ETS2 且游玩时长超过 2 小时！',
  steam_private: '❌ 无法读取您的 Steam 游戏库，请把「个人资料」和「游戏详情」设为公开后重试。',
  steam_api_failed: '❌ Steam 接口暂时不可用，请稍后再试。',
  steam_auth_failed: '❌ 无法连接 Steam 服务器，请检查网络代理后重试。',
  steam_signature_invalid: '❌ Steam 返回的验证信息无效，请重新发起验证。',
  steam_state_invalid: '❌ 验证会话已过期或无效，请重新发起 Steam 验证。',
  steam_service_misconfigured: '❌ 服务器未配置 Steam API Key，请联系管理员。',
  steam_in_use: '❌ 该 Steam 账号已被其他社区账号绑定。',
  steam_bind_failed: '❌ Steam 绑定失败，请稍后重试或联系管理员。',
};

interface PendingState {
  verified: boolean;
  steamIdMasked?: string;
}

function LoginForm() {
  const searchParams = useSearchParams();

  // 视图状态：login(登录) | guide(注册门槛提示) | register_form(填表)
  const [viewState, setViewState] = useState<'login' | 'guide' | 'register_form'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // 服务端签名的 Steam 验证凭证状态（不是 URL 参数）
  const [steamPending, setSteamPending] = useState<PendingState | null>(null);

  /** 登录后若账号尚未绑定 Steam，用签名 Cookie + 会话 token 自动完成绑定 */
  const tryBindSteam = useCallback(async (): Promise<boolean> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return false;

      const { data: profile } = await supabase
        .from('profiles')
        .select('steam_verified')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!profile || profile.steam_verified) return false;

      const data = await attemptSteamBind(session.access_token);

      if (data.ok) {
        setMessage('✅ Steam 正版验证完成，账号已绑定。');
        return true;
      }
      if (data.code === 'no_pending') {
        setMessage('⚠️ 账号尚未完成 Steam 正版验证，请到「账号设置 → 绑定 Steam」完成绑定。');
        return false;
      }
      setMessage(`⚠️ ${data.message || 'Steam 绑定未完成，请稍后重试。'}`);
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const error = searchParams.get('error');
      if (error) {
        setMessage(ERROR_MESSAGES[error] ?? '❌ 验证失败，请重试。');
      }
      if (searchParams.get('steam_verified') === '1') {
        setMessage('✅ Steam 验证通过！请完成注册。');
      }

      // 1) 先确认是否已登录：已登录账号只走“绑定”，绝不显示注册表单
      let user = null;
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();
        user = currentUser;
      } catch {
        // 忽略：按未登录处理
      }

      // 2) 唯一可信的注册闸门：服务端校验签名的 HttpOnly Cookie
      let pending: PendingState | null = null;
      try {
        const res = await fetch('/api/auth/steam/pending', { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as PendingState;
          if (data?.verified) {
            pending = { verified: true, steamIdMasked: data.steamIdMasked };
          }
        }
      } catch {
        // 网络失败时保持登录视图，不影响正常登录
      }

      if (cancelled) return;

      if (user) {
        // 已登录：只尝试把当前浏览器持有的 Steam 凭证绑定到自己的账号
        if (pending) {
          setMessage('✅ Steam 验证通过，正在绑定到当前账号...');
        }
        await tryBindSteam();
        return;
      }

      if (pending) {
        setSteamPending(pending);
        setViewState('register_form');
        if (!error && searchParams.get('steam_verified') !== '1') {
          setMessage('✅ Steam 验证通过！请完成注册。');
        }
      }
    };

    void init();

    if (searchParams.toString()) {
      window.history.replaceState({}, '', '/login');
    }

    return () => {
      cancelled = true;
    };
  }, [searchParams, tryBindSteam]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (viewState === 'register_form' && password !== confirmPassword) {
      setMessage('两次输入的密码不一致，请检查！');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setMessage('密码至少需要 6 个字符。');
      setLoading(false);
      return;
    }

    try {
      if (viewState === 'register_form') {
        if (!steamPending?.verified) {
          setMessage('❌ 请先完成 Steam 正版验证，再填写注册信息。');
          return;
        }

        // 注意：不再把 steam_id / steam_verified 写进 metadata（那是客户端可伪造的），
        // 绑定会在首次登录后由服务端用签名 Cookie + service_role 完成。
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: nickname,
            },
          },
        });
        if (error) throw error;

        setMessage('🎉 注册成功！请去邮箱点击验证链接，然后回来登录；登录后系统会自动完成 Steam 绑定。');
        setViewState('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        setMessage('登录成功！正在检查 Steam 绑定...');
        const bound = await tryBindSteam();
        if (bound) {
          setMessage('✅ 登录成功，Steam 绑定已完成！即将跳转...');
        }
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
    } catch (error) {
      const err = error as { message?: string };
      setMessage(`操作失败：${err.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#18191c] text-white flex flex-col items-center justify-center p-10 font-sans">
      <div className="bg-[#2c2d31] p-8 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700">

        {/* 视图一：登录 */}
        {viewState === 'login' && (
          <>
            <h1 className="text-3xl font-bold mb-6 text-center">登录 RCT MP 社区</h1>
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">邮箱地址</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">密码</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition mt-2">
                {loading ? '登录中...' : '登 录'}
              </button>
            </form>
            <div className="mt-6 text-center">
              <button onClick={() => { setViewState('guide'); setMessage(''); }} className="text-sm text-blue-400 hover:underline">没有账号？去注册</button>
            </div>
          </>
        )}

        {/* 视图二：注册前置条件（类似 TMP 的欢迎页） */}
        {viewState === 'guide' && (
          <>
            <h1 className="text-2xl font-bold mb-2 text-center">欢迎来到 RCT MP!</h1>
            <p className="text-center text-sm text-gray-400 mb-6">为了注册，请确保您满足以下条件：</p>

            <ul className="space-y-3 text-sm text-gray-300 mb-8 bg-[#18191c] p-5 rounded border border-gray-700">
              <li>✅ 您拥有正版《欧洲卡车模拟2》(ETS2)。</li>
              <li>✅ 您的 ETS2 游戏时长必须**大于 2 小时**。</li>
              <li>✅ 您的 Steam 个人资料和游戏详情必须设为**公开**。</li>
            </ul>

            <button
              onClick={() => { window.location.href = '/api/auth/steam/verify?source=register'; }}
              className="w-full bg-[#171a21] hover:bg-[#2a475e] text-white font-bold py-3 px-4 rounded transition border border-gray-600 flex justify-center items-center gap-2"
            >
              <span className="text-xl">🎮</span> 通过 Steam 验证并继续
            </button>

            <div className="mt-6 text-center">
              <button onClick={() => { setViewState('login'); setMessage(''); }} className="text-sm text-blue-400 hover:underline">已有账号？去登录</button>
            </div>
          </>
        )}

        {/* 视图三：填表注册（服务端确认 Steam 验证通过后才显示） */}
        {viewState === 'register_form' && (
          <>
            <div className="bg-green-900/30 border border-green-700 text-green-400 p-3 rounded mb-6 text-center text-sm">
              ✅ Steam 账号验证通过
              {steamPending?.steamIdMasked ? `（SteamID: ${steamPending.steamIdMasked}）` : ''}
              ，请完善您的社区信息。
            </div>

            <h1 className="text-2xl font-bold mb-6 text-center">创建您的社区账户</h1>
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">社区昵称</label>
                <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" placeholder="您在论坛显示的名字" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">邮箱地址</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">密码</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">确认密码</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded transition mt-4">
                {loading ? '提交中...' : '完成注册'}
              </button>
            </form>
          </>
        )}

        {message && (
          <p className={`mt-4 text-center text-sm font-bold ${message.includes('失败') || message.includes('不一致') || message.includes('❌') || message.includes('⚠️') ? 'text-red-400' : 'text-green-400'}`}>{message}</p>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-white text-center mt-20">加载中...</div>}>
      <LoginForm />
    </Suspense>
  );
}
