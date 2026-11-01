// app/profile/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter, useParams } from 'next/navigation';
import Navbar from '../../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const targetId = params?.id as string;

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // 🌟 新增：动态存储职位名称和等级
  const [roleDisplayName, setRoleDisplayName] = useState('注册司机');
  const [roleLevel, setRoleLevel] = useState(10);

  const [myTopics, setMyTopics] = useState<any[]>([]);
  const [myRepliesCount, setMyRepliesCount] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      const viewId = targetId || user?.id;
      
      if (!viewId) {
        router.push('/login');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', viewId)
        .single();
        
      if (profileData) {
        let vtcInfo = null;
        if (profileData.vtc_id) {
          const { data: vtcData, error: vtcError } = await supabase
            .from('vtcs')
            .select('name, tag, logo_url')
            .eq('id', profileData.vtc_id)
            .single();

          if (vtcError) {
            console.error('获取车队信息失败:', vtcError);
          } else {
            vtcInfo = vtcData;
          }
        }

        setProfile({ ...profileData, vtc_info: vtcInfo });
        setRoleLevel(profileData.role_level || 10); // 🌟 同步等级

        // 🌟 核心修改 1：去 roles 表里查中文名字，替代死代码
        if (profileData.role) {
          const { data: roleData } = await supabase
            .from('roles')
            .select('display_name')
            .eq('name', profileData.role)
            .single();
          if (roleData) setRoleDisplayName(roleData.display_name);
          else setRoleDisplayName(profileData.role); // 兜底
        }
      } else {
        router.push('/forum');
        return;
      }

      const { data: topicsData } = await supabase
        .from('forum_topics')
        .select('id, title, category_id, created_at, replies_count')
        .eq('author_id', viewId)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (topicsData) setMyTopics(topicsData);

      const { count } = await supabase
        .from('forum_replies')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', viewId);
      
      if (count) setMyRepliesCount(count);

      setLoading(false);
    };
    loadData();
  }, [targetId, router]);

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载中...</div>;
  if (!profile) return null;

  const displayName = profile.display_name || '玩家';
  const avatarUrl = profile.avatar_url;
  
  const isOwnProfile = currentUser?.id === profile.id;
  
  // 🌟 核心修改 2：用动态等级来判断能不能看后台入口（大于等于 40 级即可）
  const canAccessAdmin = (roleLevel >= 40 || currentUser?.email === '420075623@qq.com') && isOwnProfile;

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* 左侧边栏 */}
          <div className="space-y-4">
            <div className="bg-[#2c2d31] rounded-md overflow-hidden border border-gray-700 shadow-lg">
              <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=600&auto=format&fit=crop')` }}></div>
              <div className="p-4 relative">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white border-4 border-[#2c2d31] absolute -top-8 shadow-md overflow-hidden">
                  {avatarUrl ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" /> : displayName.charAt(0).toUpperCase()}
                </div>
                <div className="mt-8">
                  <h2 className="text-white font-bold text-lg">{displayName}</h2>
                  {/* 🌟 替换：动态职位 */}
                  <p className="text-xs text-gray-500">{roleDisplayName}</p>
                </div>
              </div>
            </div>

            {isOwnProfile && (
              <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-2 shadow-lg">
                <ul className="text-sm space-y-1">
                  <li>
                    <Link href={`/profile/${profile.id}`} className="flex items-center text-green-500 bg-[#3a3b40] px-3 py-2 rounded-md font-bold">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                      个人资料
                    </Link>
                  </li>
                  <li>
                    <Link href="/settings" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
                      账号设置
                    </Link>
                  </li>
                </ul>
              </div>
            )}

            {canAccessAdmin && (
              <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-4 shadow-lg">
                <h3 className="text-xs text-gray-500 font-bold mb-3 uppercase tracking-wider">管理员特权</h3>
                <Link href="/admin" className="bg-blue-600 hover:bg-blue-700 text-white text-center w-full block py-2 rounded-md text-sm font-bold transition shadow">
                  进入管理后台
                </Link>
              </div>
            )}
          </div>

          {/* 右侧主内容区 */}
          <div className="lg:col-span-3 space-y-6">
            
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                <span className="text-sm font-bold text-gray-400">Player Info</span>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="mb-4 flex items-center gap-3">
                    <h1 className="text-2xl text-green-500 font-bold">{displayName}</h1>
                    <span className="bg-[#1e1f23] text-gray-400 text-xs px-2 py-1 rounded border border-gray-700 font-mono">
                      ID: {profile.custom_id || profile.random_id || '分配中...'}
                    </span>
                  </div>
                  
                  <div className="text-sm space-y-3">
                    <p><span className="text-gray-500 inline-block w-28">Languages:</span> <span className="text-white">{profile.languages || 'Chinese (Simplified)'}</span></p>
                    <p><span className="text-gray-500 inline-block w-28">Steam ID:</span> <span className="text-white">{profile.steam_id || '未绑定'}</span></p>
                    {/* 🌟 替换：动态职位 */}
                    <p><span className="text-gray-500 inline-block w-28">Role:</span> <span className={roleLevel >= 60 ? 'text-red-400 font-bold' : 'text-green-400'}>{roleDisplayName}</span></p>
                    <p><span className="text-gray-500 inline-block w-28">Active bans:</span> <span className="text-white">0</span></p>
                    <p><span className="text-gray-500 inline-block w-28">Linked games:</span> <span className="text-white">Euro Truck Simulator 2</span></p>
                    <p><span className="text-gray-500 inline-block w-28">In-game status:</span> <span className="text-gray-500">Offline</span></p>
                    
                    {profile.bio && (
                      <div className="mt-4 p-3 bg-[#232428] rounded border border-gray-700">
                        <p className="text-gray-400 text-xs mb-1">关于我 (Bio)</p>
                        <p className="text-white text-sm">{profile.bio}</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-[#232428] p-3 rounded-md border border-gray-700">
                     <h4 className="text-xs text-gray-400 mb-1">Account Status</h4>
                     <p className="text-green-500 font-bold text-sm">Active (正常)</p>
                  </div>
                  
                  <div className="bg-[#232428] p-4 rounded-md border border-gray-700">
                     <h4 className="text-xs text-gray-400 mb-3 font-bold">Social Information</h4>
                     <div className="space-y-2 text-sm">
                        <p className="text-gray-400 flex justify-between"><span>Discord:</span> <span className="text-white">{profile.discord_id || '未绑定'}</span></p>
                        <p className="text-gray-400 flex justify-between"><span>Steam:</span> <span className="text-white">{profile.steam_id || '未绑定'}</span></p>
                        
                        {profile.twitch_url && <p className="text-gray-400 flex justify-between"><span>Twitch:</span> <a href={profile.twitch_url} target="_blank" className="text-purple-400 hover:underline">前往频道</a></p>}
                        {profile.twitter_url && <p className="text-gray-400 flex justify-between"><span>Twitter:</span> <a href={profile.twitter_url} target="_blank" className="text-blue-400 hover:underline">前往主页</a></p>}
                        {profile.youtube_url && <p className="text-gray-400 flex justify-between"><span>YouTube:</span> <a href={profile.youtube_url} target="_blank" className="text-red-400 hover:underline">前往频道</a></p>}
                        {profile.wot_url && <p className="text-gray-400 flex justify-between"><span>World of Trucks:</span> <a href={profile.wot_url} target="_blank" className="text-orange-400 hover:underline">前往资料</a></p>}
                     </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" /></svg>
                <span className="text-sm font-bold text-gray-400">VTC Info (车队信息)</span>
              </div>
              <div className="p-6">
                {profile.vtc_info ? (
                  <Link href={`/vtc/${profile.vtc_id}`} className="flex items-center gap-4 bg-[#232428] p-4 rounded-lg border border-gray-700 hover:border-blue-500 transition group">
                    <div className="w-16 h-16 bg-[#18191c] rounded-lg overflow-hidden border border-gray-600 flex items-center justify-center shrink-0">
                      {profile.vtc_info.logo_url ? (
                        <img src={profile.vtc_info.logo_url} alt={profile.vtc_info.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">🏢</span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition">{profile.vtc_info.name}</h3>
                      {profile.vtc_info.tag && <span className="text-xs text-blue-400 font-mono">[{profile.vtc_info.tag}]</span>}
                    </div>
                  </Link>
                ) : (
                  <div className="text-center text-gray-500 text-sm py-8 bg-[#232428] rounded-md border border-dashed border-gray-700">
                    你目前尚未加入任何车队 (You are not currently a member of any VTC).
                  </div>
                )}
              </div>
            </div>

            {/* 遥测面板 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg overflow-hidden">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                  <span className="text-sm font-bold text-gray-400">In-Game Telemetry (游戏遥测)</span>
                </div>
                <span className="text-xs text-green-500 font-bold animate-pulse">● 数据接入中</span>
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#18191c] p-4 rounded-lg border border-gray-600 text-center">
                  <p className="text-xs text-gray-500 mb-1">当前速度</p>
                  <p className="text-2xl font-mono font-bold text-blue-400">0 <span className="text-xs text-gray-500">km/h</span></p>
                </div>
                <div className="bg-[#18191c] p-4 rounded-lg border border-gray-600 text-center">
                  <p className="text-xs text-gray-500 mb-1">档位</p>
                  <p className="text-2xl font-mono font-bold text-white">N</p>
                </div>
                <div className="bg-[#18191c] p-4 rounded-lg border border-gray-600 text-center">
                  <p className="text-xs text-gray-500 mb-1">油量</p>
                  <div className="w-full bg-gray-700 h-2 mt-3 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full w-[85%]"></div>
                  </div>
                </div>
                <div className="bg-[#18191c] p-4 rounded-lg border border-gray-600 text-center">
                  <p className="text-xs text-gray-500 mb-1">引擎状态</p>
                  <p className="text-sm font-bold text-red-500 mt-1">关闭</p>
                </div>
              </div>
            </div>

            {/* 社区动态 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                  <span className="text-sm font-bold text-gray-400">社区动态</span>
                </div>
                <span className="text-xs text-gray-500">共发布 {myTopics.length} 个话题，回复 {myRepliesCount} 次</span>
              </div>
              
              <div className="p-4 space-y-2">
                {myTopics.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">该用户还没有在论坛发布过帖子。</p>
                ) : (
                  myTopics.map(topic => (
                    <Link 
                      key={topic.id}
                      href={`/forum/${topic.category_id}/${topic.id}`}
                      className="block bg-[#18191c] p-3 rounded-md border border-gray-700 hover:border-blue-500 transition"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold text-sm truncate pr-4">{topic.title}</span>
                        <span className="text-xs text-gray-500 whitespace-nowrap">{new Date(topic.created_at).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}