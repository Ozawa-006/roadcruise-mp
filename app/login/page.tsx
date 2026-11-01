'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams } from 'next/navigation';
import { attemptSteamBind } from '../../lib/steam-bind-client';
import { useTr } from '../../components/I18nProvider';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * 静态 UI 文案：中文原文 -> 英文。英文缺失时 useTr 自动回退中文。
 * 按区块分组：页面外壳 / 登录 / 找回密码 / 注册须知 / 注册表单 / 提示语。
 * 注意：ERROR_MESSAGES 的中文文案同样以原文为键收录在「提示语」区块，
 * 提示语统一以中文原文存放在 state 中，渲染时再经 tr() 翻译。
 */
const EN: Record<string, string> = {
  // ---------- 页面外壳 ----------
  '加载中...': 'Loading...',

  // ---------- 视图一：登录 ----------
  '登录 RCT MP 社区': 'Sign in to RCT MP Community',
  '邮箱地址': 'Email address',
  '密码': 'Password',
  '登录中...': 'Signing in...',
  '登 录': 'Sign in',
  '没有账号？去注册': 'No account? Register',
  '忘记密码？': 'Forgot password?',

  // ---------- 视图四：找回密码 ----------
  '找回密码': 'Reset password',
  '输入注册时使用的邮箱，我们会发送一封重置密码邮件。':
    'Enter the email you registered with and we will send you a password reset email.',
  '发送中...': 'Sending...',
  '发送重置邮件': 'Send reset email',
  '返回登录': 'Back to sign in',

  // ---------- 视图二：注册须知 ----------
  '欢迎来到 RCT MP!': 'Welcome to RCT MP!',
  '为了注册，请确保您满足以下条件：':
    'To register, please make sure you meet the following requirements:',
  '✅ 您拥有正版《欧洲卡车模拟2》(ETS2)。':
    '✅ You own a legitimate copy of Euro Truck Simulator 2 (ETS2).',
  '✅ 您的 ETS2 游戏时长必须**大于 2 小时**。':
    '✅ Your ETS2 playtime must be **more than 2 hours**.',
  '✅ 您的 Steam 个人资料和游戏详情必须设为**公开**。':
    '✅ Your Steam profile and game details must be set to **public**.',
  '通过 Steam 验证并继续': 'Verify with Steam and continue',
  '已有账号？去登录': 'Already have an account? Sign in',

  // ---------- 视图三：注册表单 ----------
  '✅ Steam 账号验证通过': '✅ Steam account verified',
  '（SteamID: {id}）': ' (SteamID: {id})',
  '，请完善您的社区信息。': ', please complete your community profile.',
  '创建您的社区账户': 'Create your community account',
  '社区昵称': 'Community nickname',
  '您在论坛显示的名字': 'The name shown on the forum',
  '确认密码': 'Confirm password',
  '提交中...': 'Submitting...',
  '完成注册': 'Complete registration',

  // ---------- 提示语（含 ERROR_MESSAGES） ----------
  '❌ Steam 验证失败：您必须拥有正版 ETS2 且游玩时长超过 2 小时！':
    '❌ Steam verification failed: you must own an official copy of ETS2 with more than 2 hours of playtime!',
  '❌ 无法读取您的 Steam 游戏库，请把「个人资料」和「游戏详情」设为公开后重试。':
    '❌ We cannot read your Steam library. Set your profile and game details to public, then try again.',
  '❌ Steam 接口暂时不可用，请稍后再试。':
    '❌ The Steam API is temporarily unavailable. Please try again later.',
  '❌ 无法连接 Steam 服务器，请检查网络代理后重试。':
    '❌ Cannot reach the Steam servers. Check your network proxy and try again.',
  '❌ Steam 返回的验证信息无效，请重新发起验证。':
    '❌ The verification data returned by Steam is invalid. Please start the verification again.',
  '❌ 验证会话已过期或无效，请重新发起 Steam 验证。':
    '❌ The verification session has expired or is invalid. Please start the Steam verification again.',
  '❌ 服务器未配置 Steam API Key，请联系管理员。':
    '❌ The server has no Steam API Key configured. Please contact an administrator.',
  '❌ 该 Steam 账号已被其他社区账号绑定。':
    '❌ This Steam account is already bound to another community account.',
  '❌ Steam 绑定失败，请稍后重试或联系管理员。':
    '❌ Steam binding failed. Please try again later or contact an administrator.',
  '❌ 验证失败，请重试。': '❌ Verification failed. Please try again.',
  '✅ Steam 正版验证完成，账号已绑定。':
    '✅ Steam verification complete, your account is now bound.',
  '⚠️ 账号尚未完成 Steam 正版验证，请到「账号设置 → 绑定 Steam」完成绑定。':
    '⚠️ This account is not Steam-verified yet. Go to Account settings → Bind Steam to finish binding.',
  '⚠️ Steam 绑定未完成，请稍后重试。': '⚠️ Steam binding is incomplete. Please try again later.',
  '✅ Steam 验证通过！请完成注册。':
    '✅ Steam verification passed! Please complete your registration.',
  '✅ Steam 验证通过，正在绑定到当前账号...':
    '✅ Steam verified, binding to the current account...',
  '请输入注册时使用的邮箱。': 'Please enter the email you registered with.',
  '📧 如果该邮箱已注册，重置密码邮件已发送，请在 1 小时内点击邮件中的链接。':
    '📧 If this email is registered, a password reset email has been sent. Click the link in it within 1 hour.',
  '两次输入的密码不一致，请检查！': 'The two passwords do not match. Please check them.',
  '密码至少需要 6 个字符。': 'The password must be at least 6 characters.',
  '❌ 请先完成 Steam 正版验证，再填写注册信息。':
    '❌ Please complete Steam verification before filling in the registration form.',
  '🎉 注册成功！请去邮箱点击验证链接，然后回来登录；登录后系统会自动完成 Steam 绑定。':
    '🎉 Registration successful! Click the verification link in your email, then come back to sign in; Steam binding is completed automatically after sign-in.',
  '登录成功！正在检查 Steam 绑定...': 'Signed in! Checking Steam binding...',
  '✅ 登录成功，Steam 绑定已完成！即将跳转...':
    '✅ Signed in and Steam binding complete! Redirecting...',
  '发送失败：{message}': 'Failed to send: {message}',
  '操作失败：{message}': 'Action failed: {message}',
  '未知错误': 'unknown error',
};

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
  const tr = useTr(EN);

  // 视图状态：login(登录) | guide(注册门槛提示) | register_form(填表) | forgot(找回密码)
  const [viewState, setViewState] = useState<'login' | 'guide' | 'register_form' | 'forgot'>('login');

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

    // 找回密码：只发送重置邮件，不校验密码输入
    if (viewState === 'forgot') {
      if (!email.trim()) {
        setMessage('请输入注册时使用的邮箱。');
        setLoading(false);
        return;
      }
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;

        // 不暴露“邮箱是否存在”，统一提示
        setMessage('📧 如果该邮箱已注册，重置密码邮件已发送，请在 1 小时内点击邮件中的链接。');
      } catch (error) {
        const err = error as { message?: string };
        setMessage(tr('发送失败：{message}', { message: err.message || tr('未知错误') }));
      } finally {
        setLoading(false);
      }
      return;
    }

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
      setMessage(tr('操作失败：{message}', { message: err.message || tr('未知错误') }));
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
            <h1 className="text-3xl font-bold mb-6 text-center">{tr('登录 RCT MP 社区')}</h1>
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">{tr('邮箱地址')}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">{tr('密码')}</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition mt-2">
                {loading ? tr('登录中...') : tr('登 录')}
              </button>
            </form>
            <div className="mt-6 text-center space-y-2">
              <button onClick={() => { setViewState('guide'); setMessage(''); }} className="text-sm text-blue-400 hover:underline block mx-auto">{tr('没有账号？去注册')}</button>
              <button onClick={() => { setViewState('forgot'); setMessage(''); }} className="text-sm text-gray-400 hover:text-white hover:underline block mx-auto">{tr('忘记密码？')}</button>
            </div>
          </>
        )}

        {/* 视图四：找回密码（发送重置邮件） */}
        {viewState === 'forgot' && (
          <>
            <h1 className="text-2xl font-bold mb-2 text-center">{tr('找回密码')}</h1>
            <p className="text-center text-sm text-gray-400 mb-6">
              {tr('输入注册时使用的邮箱，我们会发送一封重置密码邮件。')}
            </p>
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">{tr('邮箱地址')}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" placeholder="you@example.com" />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition mt-2 disabled:opacity-50">
                {loading ? tr('发送中...') : tr('发送重置邮件')}
              </button>
            </form>
            <div className="mt-6 text-center">
              <button onClick={() => { setViewState('login'); setMessage(''); }} className="text-sm text-blue-400 hover:underline">{tr('返回登录')}</button>
            </div>
          </>
        )}

        {/* 视图二：注册前置条件（类似 TMP 的欢迎页） */}
        {viewState === 'guide' && (
          <>
            <h1 className="text-2xl font-bold mb-2 text-center">{tr('欢迎来到 RCT MP!')}</h1>
            <p className="text-center text-sm text-gray-400 mb-6">{tr('为了注册，请确保您满足以下条件：')}</p>

            <ul className="space-y-3 text-sm text-gray-300 mb-8 bg-[#18191c] p-5 rounded border border-gray-700">
              <li>{tr('✅ 您拥有正版《欧洲卡车模拟2》(ETS2)。')}</li>
              <li>{tr('✅ 您的 ETS2 游戏时长必须**大于 2 小时**。')}</li>
              <li>{tr('✅ 您的 Steam 个人资料和游戏详情必须设为**公开**。')}</li>
            </ul>

            <button
              onClick={() => { window.location.href = '/api/auth/steam/verify?source=register'; }}
              className="w-full bg-[#171a21] hover:bg-[#2a475e] text-white font-bold py-3 px-4 rounded transition border border-gray-600 flex justify-center items-center gap-2"
            >
              <span className="text-xl">🎮</span> {tr('通过 Steam 验证并继续')}
            </button>

            <div className="mt-6 text-center">
              <button onClick={() => { setViewState('login'); setMessage(''); }} className="text-sm text-blue-400 hover:underline">{tr('已有账号？去登录')}</button>
            </div>
          </>
        )}

        {/* 视图三：填表注册（服务端确认 Steam 验证通过后才显示） */}
        {viewState === 'register_form' && (
          <>
            <div className="bg-green-900/30 border border-green-700 text-green-400 p-3 rounded mb-6 text-center text-sm">
              {tr('✅ Steam 账号验证通过')}
              {steamPending?.steamIdMasked
                ? tr('（SteamID: {id}）', { id: steamPending.steamIdMasked })
                : ''}
              {tr('，请完善您的社区信息。')}
            </div>

            <h1 className="text-2xl font-bold mb-6 text-center">{tr('创建您的社区账户')}</h1>
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">{tr('社区昵称')}</label>
                <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" placeholder={tr('您在论坛显示的名字')} />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">{tr('邮箱地址')}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">{tr('密码')}</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">{tr('确认密码')}</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded transition mt-4">
                {loading ? tr('提交中...') : tr('完成注册')}
              </button>
            </form>
          </>
        )}

        {message && (
          <p className={`mt-4 text-center text-sm font-bold ${message.includes('失败') || message.includes('不一致') || message.includes('❌') || message.includes('⚠️') ? 'text-red-400' : 'text-green-400'}`}>{tr(message)}</p>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  const tr = useTr(EN);

  return (
    <Suspense fallback={<div className="text-white text-center mt-20">{tr('加载中...')}</div>}>
      <LoginForm />
    </Suspense>
  );
}
