'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const AVATAR_EXTENSION_BY_MIME: Partial<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const SUPABASE_AVATAR_PUBLIC_PREFIX = '/storage/v1/object/public/avatars/';

function isAllowedAvatarType(type: string): boolean {
  return (ALLOWED_AVATAR_TYPES as readonly string[]).includes(type);
}

function getAvatarExtension(mimeType: string): string | null {
  return AVATAR_EXTENSION_BY_MIME[mimeType] ?? null;
}

// 仅识别“本站 Supabase Storage 的 avatars 公开 URL”，且只允许删除当前用户自己的
// avatar-<uid>-* 文件。外链、他人文件、经过伪装或带路径穿越的 URL 一律返回 null。
function getOwnedAvatarObjectPath(url: string, userId: string): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !supabaseUrl) return null;

  try {
    const target = new URL(url);
    if (target.origin !== new URL(supabaseUrl).origin) return null;
    if (!target.pathname.startsWith(SUPABASE_AVATAR_PUBLIC_PREFIX)) return null;

    const objectPath = decodeURIComponent(
      target.pathname.slice(SUPABASE_AVATAR_PUBLIC_PREFIX.length)
    );
    if (!objectPath.startsWith(`avatar-${userId}-`)) return null;
    if (objectPath.includes('/') || objectPath.includes('..')) return null;
    return objectPath;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }

  return '未知错误';
}

function SettingsForm() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [msg, setMsg] = useState('');
  
  // 表单状态
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  // avatarUrl 是 UI 当前展示的头像；originalAvatarUrl 是数据库里已保存的头像，
  // 用于保存时判断是否需要清理旧文件，以及“移除头像”时定位旧文件。
  const [avatarUrl, setAvatarUrl] = useState('');
  const [originalAvatarUrl, setOriginalAvatarUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const success = searchParams.get('success');
    const errorCode = searchParams.get('error');
    let steamNotice = '';

    if (success === 'steam_verified') {
      steamNotice = '🎉 Steam 账号验证成功！';
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
      steamNotice = errorMessages[errorCode] ?? '❌ Steam 绑定失败，请稍后重试。';
      window.history.replaceState({}, '', '/settings');
    }

    // 放到微任务里提示，避免在 effect 内同步 setState 造成级联渲染。
    if (steamNotice) {
      queueMicrotask(() => setMsg(steamNotice));
    }

    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      setUser(user);

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

      if (profile) {
        const savedAvatarUrl = profile.avatar_url || '';
        setDisplayName(profile.display_name || '');
        setBio(profile.bio || '');
        setAvatarUrl(savedAvatarUrl);
        setOriginalAvatarUrl(savedAvatarUrl);
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

  // 本地预览 URL 的生命周期：替换时 revoke 旧 URL，组件卸载时兜底 revoke。
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const replacePreview = (selected: File | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    if (!selected) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selected);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
  };

  const clearSelectedFile = () => {
    replacePreview(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setMsg('');

    if (!selected) {
      clearSelectedFile();
      return;
    }

    if (!isAllowedAvatarType(selected.type)) {
      setMsg('❌ 头像上传失败：仅支持 JPG/PNG/WebP 格式的图片。');
      clearSelectedFile();
      return;
    }

    if (selected.size > MAX_AVATAR_SIZE) {
      setMsg('❌ 头像上传失败：图片不能超过 2MB。');
      clearSelectedFile();
      return;
    }

    replacePreview(selected);
    setFile(selected);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setMsg('保存失败：登录状态已失效，请重新登录。');
      return;
    }

    setSaving(true);
    setMsg('');

    let uploadedFileName: string | null = null;
    let saved = false;

    try {
      // 社交链接只允许 http(s)：防止写入 data:/javascript:/vbscript: 等协议。
      // 放在上传之前校验，避免链接不合法时留下无用的新头像文件。
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

      const updates: {
        display_name: string;
        bio: string;
        languages: string;
        twitch_url: string;
        twitter_url: string;
        youtube_url: string;
        wot_url: string;
        avatar_url?: string;
      } = {
        display_name: displayName,
        bio: bio,
        languages: languages,
        twitch_url: twitchUrl,
        twitter_url: twitterUrl,
        youtube_url: youtubeUrl,
        wot_url: wotUrl,
      };

      if (file) {
        const extension = getAvatarExtension(file.type);
        if (!extension) {
          setMsg('保存失败：仅支持 JPG/PNG/WebP 格式的图片。');
          return;
        }

        // 保持 avatar-<uid>-<随机>.<ext> 的路径规则，Storage 策略只放行自己的文件。
        const fileName = `avatar-${user.id}-${Math.random()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
        if (uploadError) throw uploadError;
        uploadedFileName = fileName;

        updates.avatar_url = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName)
          .data.publicUrl;
      }

      // 没有选择新文件时不写 avatar_url，避免用空值覆盖已有头像（含外链头像）。
      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;
      saved = true;

      if (updates.avatar_url) {
        const finalAvatarUrl = updates.avatar_url;
        setAvatarUrl(finalAvatarUrl);
        setOriginalAvatarUrl(finalAvatarUrl);

        // 旧头像是本站 avatars 且与新的不同才清理；外部 URL 一律不删。
        if (uploadedFileName && originalAvatarUrl !== finalAvatarUrl) {
          const oldObjectPath = getOwnedAvatarObjectPath(originalAvatarUrl, user.id);
          if (oldObjectPath) {
            // 清理失败只记录警告，不影响资料保存结果。
            try {
              const { error: removeOldError } = await supabase.storage
                .from('avatars')
                .remove([oldObjectPath]);
              if (removeOldError) {
                console.warn('旧头像清理失败：', removeOldError.message);
              }
            } catch (cleanupError: unknown) {
              console.warn('旧头像清理失败：', getErrorMessage(cleanupError));
            }
          }
        }
      }

      clearSelectedFile();
      setMsg('🎉 个人资料已保存！');
    } catch (error: unknown) {
      // 新文件已上传但资料写入失败时，尽力删除这份孤儿文件。
      if (uploadedFileName && !saved) {
        try {
          const { error: cleanupError } = await supabase.storage
            .from('avatars')
            .remove([uploadedFileName]);
          if (cleanupError) {
            console.warn('新头像文件回滚失败：', cleanupError.message);
          }
        } catch (cleanupError: unknown) {
          console.warn('新头像文件回滚失败：', getErrorMessage(cleanupError));
        }
      }
      setMsg(`保存失败：${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) {
      setMsg('移除头像失败：登录状态已失效，请重新登录。');
      return;
    }

    if (!originalAvatarUrl) {
      setMsg('当前没有可移除的头像。');
      return;
    }

    if (!window.confirm('确定要移除当前头像吗？未保存的新头像选择也会被取消。')) {
      return;
    }

    setRemoving(true);
    setMsg('');

    try {
      // 只更新 avatar_url，不触碰其它资料字段。
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: '' })
        .eq('id', user.id);
      if (error) throw error;

      clearSelectedFile();
      setAvatarUrl('');
      setOriginalAvatarUrl('');

      // 仅尝试删除本站 avatars 中属于当前用户的旧文件；外链不动。
      const oldObjectPath = getOwnedAvatarObjectPath(originalAvatarUrl, user.id);
      if (oldObjectPath) {
        try {
          const { error: removeError } = await supabase.storage
            .from('avatars')
            .remove([oldObjectPath]);
          if (removeError) {
            console.warn('移除头像文件失败：', removeError.message);
          }
        } catch (cleanupError: unknown) {
          console.warn('移除头像文件失败：', getErrorMessage(cleanupError));
        }
      }

      setMsg('✅ 头像已移除。');
    } catch (error: unknown) {
      setMsg(`移除头像失败：${getErrorMessage(error)}`);
    } finally {
      setRemoving(false);
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

  // 选好文件后优先展示本地预览，保存前不写数据库。
  const displayedAvatarUrl = previewUrl ?? avatarUrl;

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载中...</div>;

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-6 flex flex-col md:flex-row gap-6">
      
      {/* 左侧边栏保持不变 */}
      <div className="w-full md:w-64 space-y-4 shrink-0">
        <div className="bg-[#2c2d31] rounded-md overflow-hidden border border-gray-700 shadow-lg">
          <div className="h-32 bg-[url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=600&auto=format&fit=crop')] bg-cover bg-center"></div>
          <div className="p-4 relative">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white border-4 border-[#2c2d31] absolute -top-8 shadow-md overflow-hidden">
              {displayedAvatarUrl ? <img src={displayedAvatarUrl} alt="avatar" className="w-full h-full object-cover" /> : displayName.charAt(0).toUpperCase()}
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
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center overflow-hidden shrink-0">
                  {displayedAvatarUrl ? <img src={displayedAvatarUrl} alt="头像预览" className="w-full h-full object-cover" /> : <span className="text-2xl">👤</span>}
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="border border-gray-600 rounded bg-[#232428] px-4 py-2 cursor-pointer relative hover:bg-gray-800 transition">
                    <span className="text-sm block max-w-[180px] truncate">{file ? file.name : '选择图片...'}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarChange}
                      disabled={saving || removing}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="text-xs text-gray-500">支持 JPG/PNG/WebP，最大 2MB</span>
                  <div className="flex items-center gap-3 flex-wrap">
                    {file && <span className="text-xs font-bold text-amber-400">新头像待保存</span>}
                    {file && (
                      <button
                        type="button"
                        onClick={clearSelectedFile}
                        disabled={saving || removing}
                        className="text-xs text-gray-400 underline hover:text-white disabled:opacity-50"
                      >
                        取消选择
                      </button>
                    )}
                    {originalAvatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        disabled={saving || removing}
                        className="text-xs text-red-400 underline hover:text-red-300 disabled:opacity-50"
                      >
                        {removing ? '移除中...' : '移除头像'}
                      </button>
                    )}
                  </div>
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
            <button type="submit" disabled={saving || removing} className="bg-green-600 hover:bg-green-700 text-white px-8 py-2 rounded font-bold transition disabled:opacity-50">
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