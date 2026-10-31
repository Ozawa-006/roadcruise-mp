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
  const [discordId, setDiscordId] = useState('');
  
  // Steam 状态
  const [steamId, setSteamId] = useState('');
  const [steamVerified, setSteamVerified] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const success = searchParams.get('success');
    if (success === 'steam_verified') {
      setMsg('🎉 Steam 账号验证成功！');
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
        setDiscordId(profile.discord_id || '');
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

      // 🌟 关键：这里只更新资料，绝对不动 steam_id
      const { error } = await supabase.from('profiles').update({
        display_name: displayName,
        bio: bio,
        avatar_url: finalAvatarUrl,
        discord_id: discordId,
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

  const handleSteamBind = () => {
    if (!user) return;
    window.location.href = `/api/auth/steam/verify?source=settings&userId=${user.id}`;
  };

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载中...</div>;

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-6 flex flex-col md:flex-row gap-6">
      
      {/* 左侧边栏 */}
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
            <li>
              <Link href="/profile" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                个人资料
              </Link>
            </li>
            <li>
              <Link href="/settings" className="flex items-center text-green-500 bg-[#3a3b40] px-3 py-2 rounded-md font-bold">
                账号设置
              </Link>
            </li>
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
          <span className="text-xs text-gray-600">(账号唯一凭证)</span>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          
          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">头像 (Avatar)</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center overflow-hidden shrink-0">
                {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" /> : <span className="text-2xl">👤</span>}
              </div>
              <div className="border border-gray-600 rounded bg-[#232428] px-4 py-2 cursor-pointer relative hover:bg-gray-800 transition">
                <span className="text-sm">{file ? file.name : '选择图片...'}</span>
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">昵称 (Display Name)</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500" required />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">关于我 (Bio)</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white h-32 focus:outline-none focus:border-blue-500" placeholder="简单介绍一下你自己..."></textarea>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">Discord ID</label>
              <input type="text" value={discordId} onChange={(e) => setDiscordId(e.target.value)} className="w-full bg-[#18191c] border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500" placeholder="例如: xiaoze#1234" />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">Steam 账号验证</label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between bg-[#18191c] border border-gray-600 rounded p-3">
                  <div className="flex flex-col">
                    <span className="text-white text-sm font-bold">
                      {steamVerified ? '✅ 已验证' : '❌ 未绑定'}
                    </span>
                    {/* 🌟 直接显示 ID */}
                    {steamVerified && steamId && (
                      <span className="text-xs text-gray-500 font-mono mt-1">ID: {steamId}</span>
                    )}
                  </div>
                  <button type="button" onClick={handleSteamBind} className={`px-4 py-1.5 rounded text-sm font-bold transition ${steamVerified ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-[#171a21] hover:bg-[#2a475e] text-white border border-gray-500'}`}>
                    {steamVerified ? '重新验证' : '前往 Steam 验证'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700 flex items-center gap-4">
            <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 text-white px-8 py-2 rounded font-bold transition disabled:opacity-50">
              {saving ? '保存中...' : '保存更改'}
            </button>
            {msg && <span className={`text-sm font-bold ${msg.includes('失败') || msg.includes('❌') ? 'text-red-400' : 'text-green-400'}`}>{msg}</span>}
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