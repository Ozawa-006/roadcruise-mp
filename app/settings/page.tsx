'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function SettingsForm() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  
  // 表单状态
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // 新增：语言和社交媒体状态
  const [languages, setLanguages] = useState('Chinese (Simplified), English');
  const [twitchUrl, setTwitchUrl] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [wotUrl, setWotUrl] = useState('');
  
  // Steam 状态
  const [steamId, setSteamId] = useState('');
  const [steamVerified, setSteamVerified] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const success = searchParams.get('success');
    const errorCode = searchParams.get('error');
    if (success === 'steam_verified') {
      setMsg('🎉 Steam 账号验证成功！');
      window.history.replaceState({}, '', '/settings');
    }
    if (errorCode) {
      const errorMessages: Record<string, string> = {
        steam_already_bound: '❌ 该账号已绑定其它 Steam 账号，如需换绑请联系管理员。',
        steam_in_use: '❌ 该 Steam 账号已被其它社区账号绑定。',
        steam_bind_failed: '❌ Steam 绑定失败，请稍后重试或联系管理员。',
        steam_state_invalid: '❌ 验证会话已过期或无效，请重新发起 Steam 验证。',
        steam_api_failed: '❌ Steam 接口暂时不可用，请稍后再试。',
        no_ets2: '❌ 该 Steam 账号不满足正版 ETS2 / 2 小时门槛。',
        steam_private: '❌ 无法读取 Steam 游戏库，请把个人资料与游戏详情设为公开。',
      };
      setMsg(errorMessages[errorCode] ?? '❌ Steam 绑定失败，请稍后重试。');
      window.history.replaceState({}, '', '/settings');
    }

    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      setUser(user);

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

      if (profile) {
        setDisplayName(profile.display_name || '');
        setBio(profile.bio || '');
        setAvatarUrl(profile.avatar_url || '');
        setLanguages(profile.languages || 'Chinese (Simplified), English');
        setTwitchUrl(profile.twitch_url || '');
        setTwitterUrl(profile.twitter_url || '');
        setYoutubeUrl(profile.youtube_url || '');
        setWotUrl(profile.wot_url || '');
        setSteamId(profile.steam_id || '');
        setSteamVerified(profile.steam_verified || false);
      }
      setLoading(false);
    };
    loadData();
  }, [router, searchParams]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    try {
      let finalAvatarUrl = avatarUrl;

      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `avatar-${user.id}-${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
        if (uploadError) throw uploadError;
        finalAvatarUrl = supabase.storage.from('avatars').getPublicUrl(fileName).data.publicUrl;
        setAvatarUrl(finalAvatarUrl);
      }

      // 社交链接只允许 http(s)：防止写入 data:/javascript:/vbscript: 等协议
      const socialLinks: Array<[string, string]> = [
        ['Twitch', twitchUrl],
        ['Twitter', twitterUrl],
        ['YouTube', youtubeUrl],
        ['World of Trucks', wotUrl],
      ];
      for (const [label, value] of socialLinks) {
        const trimmed = value.trim();
        if (trimmed && !/^https?:\/\/[^\s]+$/i.test(trimmed)) {
          setMsg(`保存失败：${label} 链接必须以 http:// 或 https:// 开头。`);
          return;
        }
      }

      // 更新所有字段
      const { error } = await supabase.from('profiles').update({
        display_name: displayName,
        bio: bio,
        avatar_url: finalAvatarUrl,
        languages: languages,
        twitch_url: twitchUrl,
        twitter_url: twitterUrl,
        youtube_url: youtubeUrl,
        wot_url: wotUrl,
      }).eq('id', user.id);

      if (error) throw error;
      setMsg('🎉 个人资料已保存！');
      setFile(null);
      
    } catch (error: any) {
      setMsg(`保存失败: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSteamBind = async () => {
    if (!user) return;
    setMsg('正在跳转 Steam 验证...');
    try {
      // 必须先用会话 token 向服务端证明“我是谁”，服务端会把 userId 写进签名 state Cookie，
      // 回调时不再信任 URL 里的 userId（旧实现存在越权绑定风险）。
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setMsg('登录状态已失效，请重新登录后再绑定 Steam。');
        return;
      }

      const res = await fetch('/api/auth/steam/verify?source=settings', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => null)) as
        | { redirectUrl?: string; message?: string }
        | null;

      if (!res.ok || !data?.redirectUrl) {
        setMsg(data?.message || '无法发起 Steam 验证，请稍后重试。');
        return;
      }

      window.location.href = data.redirectUrl;
    } catch {
      setMsg('网络错误，无法发起 Steam 验证，请稍后重试。');
    }
  };

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载中...</div>;

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-6 flex flex-col md:flex-row gap-6">
      
      {/* 左侧边栏保持不变 */}
      <div className="w-full md:w-64 space-y-4 shrink-0">
        <div className="bg-[#2c2d31] rounded-md overflow-hidden border border-gray-700 shadow-lg">
          <div className="h-32 bg-[url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=600&auto=format&fit=crop')] bg-cover bg-center"></div>
          <div className="p-4 relative">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white border-4 border-[#2c2d31] absolute -top-8 shadow-md overflow-hidden">
              {avatarUrl ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" /> : displayName.charAt(0).toUpperCase()}
            </div>
            <div className="mt-8">
              <h2 className="text-white font-bold text-lg">{displayName || '玩家'}</h2>
            </div>
          </div>
        </div>

        <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-2 shadow-lg">
          <ul className="text-sm space-y-1">
            <li><Link href="/profile" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">个人资料</Link></li>
            <li><Link href="/settings" className="flex items-center text-green-500 bg-[#3a3b40] px-3 py-2 rounded-md font-bold">账号设置</Link></li>
          </ul>
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="flex-1 bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg p-6">
        <h1 className="text-xl font-bold text-white mb-6 border-b border-gray-700 pb-3">编辑个人资料</h1>
        
        <div className="mb-6 bg-[#18191c] border border-gray-600 rounded p-3 text-gray-400 text-sm flex justify-between items-center">
          <div>
            <span>登录邮箱 (Email)：</span>
            <span className="text-white font-mono ml-2">{user?.email}</span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          
          {/* 头像与语言 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">头像 (Avatar)</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center overflow-hidden shrink-0">
                  {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" /> : <span className="text-2xl">👤</span>}
                </div>
                <div className="border border-gray-600 rounded bg-[#232428] px-4 py-2 cursor-pointer relative hover:bg-gray-800 transition">
                  <span className="text-sm">{file ? file.name : '选择图片...'}</span>
                  <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">语言 (Languages)</label>
              <select 
                value={languages} 
                onChange={(e) => setLanguages(e.target.value)}
                className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Chinese (Simplified)">简体中文</option>
                <option value="Chinese (Simplified), English">简体中文 + English</option>
                <option value="English">English</option>
                <option value="Chinese (Simplified), English, Russian">简中 + 英语 + 俄语</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">昵称 (Display Name)</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500" required />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">关于我 (Bio)</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white h-24 focus:outline-none focus:border-blue-500" placeholder="简单介绍一下你自己..."></textarea>
          </div>

          {/* 🌟 新增：社交媒体链接 */}
          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-md font-bold text-white mb-4">社交媒体 (Social Information)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Twitch 链接</label>
                <input type="url" value={twitchUrl} onChange={(e) => setTwitchUrl(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white" placeholder="https://twitch.tv/..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Twitter (X) 链接</label>
                <input type="url" value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white" placeholder="https://twitter.com/..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">YouTube 频道</label>
                <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white" placeholder="https://youtube.com/..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">World of Trucks 链接</label>
                <input type="url" value={wotUrl} onChange={(e) => setWotUrl(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-2 text-sm text-white" placeholder="https://worldoftrucks.com/..." />
              </div>
            </div>
          </div>

          {/* Steam 验证区域保持不变 */}
          <div className="border-t border-gray-700 pt-4">
            <label className="block text-sm font-bold text-gray-400 mb-2">Steam 账号验证</label>
            <div className="flex items-center justify-between bg-[#18191c] border border-gray-600 rounded p-3">
              <div className="flex flex-col">
                <span className="text-white text-sm font-bold">{steamVerified ? '✅ 已验证' : '❌ 未绑定'}</span>
                {steamVerified && steamId && <span className="text-xs text-gray-500 font-mono mt-1">ID: {steamId}</span>}
              </div>
              <button type="button" onClick={handleSteamBind} className="px-4 py-1.5 rounded text-sm font-bold bg-[#171a21] border border-gray-500 text-white">
                {steamVerified ? '重新验证' : '前往验证'}
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700 flex items-center gap-4">
            <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 text-white px-8 py-2 rounded font-bold transition disabled:opacity-50">
              {saving ? '保存中...' : '保存更改'}
            </button>
            {msg && <span className={`text-sm font-bold ${msg.includes('失败') ? 'text-red-400' : 'text-green-400'}`}>{msg}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      <Suspense fallback={<div className="text-center text-white mt-20">加载配置中...</div>}>
        <SettingsForm />
      </Suspense>
    </main>
  );
}