'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // 获取 Steam 回调带回来的参数
  const steamIdParam = searchParams.get('steamid');
  const verifiedParam = searchParams.get('verified');
  const errorParam = searchParams.get('error');

  // 视图状态：login(登录) | guide(注册门槛提示) | register_form(填表)
  const [viewState, setViewState] = useState<'login' | 'guide' | 'register_form'>('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // 监听 URL 参数，决定显示哪个页面
    // 监听 URL 参数，决定显示哪个页面
  useEffect(() => {
    if (steamIdParam && verifiedParam === 'true') {
      setViewState('register_form');
      // 🌟 核心修复：读取完参数后，立刻把网址里的参数清空！
      window.history.replaceState({}, '', '/login');
      
    } else if (errorParam === 'no_ets2') {
      setMessage('❌ Steam 验证失败：您必须拥有正版 ETS2 且游玩时长超过 2 小时！');
      setViewState('guide');
      window.history.replaceState({}, '', '/login');
      
    } else if (errorParam === 'steam_auth_failed' || errorParam === 'steam_callback_failed') {
      setMessage('❌ 无法连接 Steam 服务器，请检查您的网络代理设置或稍后再试。');
      setViewState('guide');
      window.history.replaceState({}, '', '/login');
      
    } else if (errorParam) {
      setMessage(`❌ 验证失败：${errorParam}`);
      setViewState('guide');
      window.history.replaceState({}, '', '/login');
    }
  }, [steamIdParam, verifiedParam, errorParam]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (viewState === 'register_form' && password !== confirmPassword) {
      setMessage('两次输入的密码不一致，请检查！');
      setLoading(false);
      return;
    }

    try {
      if (viewState === 'register_form') {
        // 🌟 注册：把 steamid 塞进 metadata 中，数据库触发器会自动处理
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: nickname,
              steam_id: steamIdParam,
              steam_verified: true
            }
          }
        });
        if (error) throw error;
        setMessage('🎉 注册成功！请去邮箱点击验证链接，然后回来登录。');
        
      } else if (viewState === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage('登录成功！即将跳转...');
        setTimeout(() => { window.location.href = '/'; }, 1000);
      }
    } catch (error: any) {
      setMessage(`操作失败：${error.message}`);
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
              onClick={() => window.location.href = '/api/auth/steam/verify?source=register'}
              className="w-full bg-[#171a21] hover:bg-[#2a475e] text-white font-bold py-3 px-4 rounded transition border border-gray-600 flex justify-center items-center gap-2"
            >
              <span className="text-xl">🎮</span> 通过 Steam 验证并继续
            </button>
            
            <div className="mt-6 text-center">
              <button onClick={() => { setViewState('login'); setMessage(''); }} className="text-sm text-blue-400 hover:underline">已有账号？去登录</button>
            </div>
          </>
        )}

        {/* 视图三：填表注册（Steam 验证通过后显示） */}
        {viewState === 'register_form' && (
          <>
            <div className="bg-green-900/30 border border-green-700 text-green-400 p-3 rounded mb-6 text-center text-sm">
              ✅ Steam 账号验证通过！请完善您的社区信息。
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
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">确认密码</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="w-full px-4 py-2 bg-[#18191c] border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded transition mt-4">
                {loading ? '提交中...' : '完成注册'}
              </button>
            </form>
          </>
        )}

        {message && (
          <p className={`mt-4 text-center text-sm font-bold ${message.includes('失败') || message.includes('不一致') || message.includes('❌') ? 'text-red-400' : 'text-green-400'}`}>{message}</p>
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