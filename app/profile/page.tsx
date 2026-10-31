'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null); // 存放扩展资料
  const [loading, setLoading] = useState(true);
  const router = useRouter();

    useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // 去 profiles 表里读取扩展资料
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (profileData) {
        // 🌟 核心逻辑：如果玩家没有专属 ID，自动生成一个 6 位随机数并保存
        if (!profileData.random_id) {
          const randId = Math.floor(100000 + Math.random() * 900000).toString();
          
          await supabase
            .from('profiles')
            .update({ random_id: randId }) // 存到 random_id
            .eq('id', user.id);
            
          profileData.random_id = randId; // 更新前端状态
        }
        setProfile(profileData);
      } else {
        // 如果没有资料（新用户），初始化并生成随机 ID
        const randId = Math.floor(100000 + Math.random() * 900000).toString();
        const newProfile = { 
          id: user.id, 
          display_name: user.email?.split('@')[0],
          random_id: randId // 存到 random_id
        };
        await supabase.from('profiles').insert(newProfile);
        setProfile(newProfile);
      }
      setLoading(false);
    };
    loadData();
  }, [router]);

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载中...</div>;

  // 优先显示自定义昵称，如果没有则显示邮箱前缀
  const displayName = profile?.display_name || user?.email?.split('@')[0] || '玩家';
  const avatarUrl = profile?.avatar_url; // 自定义头像
  const joinDate = user?.created_at ? new Date(user.created_at).toLocaleDateString() : '未知';
    // 🌟 定义角色权重表
  const ROLE_WEIGHTS: any = {
    developer: 100,
    director: 80,
    manager: 60,
    staff: 40,
    member: 10
  };

  const ROLE_LABELS: any = {
    developer: '开发者',
    director: '论坛总经理',
    manager: '社区经理',
    staff: '工作人员',
    member: '注册司机'
  };

  const userRole = profile?.role || 'member';
  
  // 🌟 核心判断：只要权重等于或高于 staff（40），或者邮箱是开发者本人，就可以看到后台入口
  const canAccessAdmin = ROLE_WEIGHTS[userRole] >= ROLE_WEIGHTS['staff'] || user?.email === '420075623@qq.com';

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* 左侧边栏 */}
          <div className="space-y-4">
            {/* 头像卡 */}
            <div className="bg-[#2c2d31] rounded-md overflow-hidden border border-gray-700 shadow-lg">
              <div 
                className="h-32 bg-cover bg-center" 
                style={{ backgroundImage: `url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=600&auto=format&fit=crop')` }}
              ></div>
              <div className="p-4 relative">
                {/* 头像圆圈：优先显示上传的图片 */}
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white border-4 border-[#2c2d31] absolute -top-8 shadow-md overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="mt-8">
                  <h2 className="text-white font-bold text-lg">{displayName}</h2>
                  <p className="text-xs text-gray-500">{ROLE_LABELS[userRole]}</p>
                </div>
              </div>
            </div>

            {/* 侧边导航 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-2 shadow-lg">
              <ul className="text-sm space-y-1">
                <li>
                  <Link href="/profile" className="flex items-center text-green-500 bg-[#3a3b40] px-3 py-2 rounded-md font-bold">
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

                        {/* 🌟 管理员特权（只有 staff 及以上才能看到） */}
            {canAccessAdmin && (
              <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-4 shadow-lg">
                <h3 className="text-xs text-gray-500 font-bold mb-3 uppercase tracking-wider">管理员特权</h3>
                <Link href="/admin" className="bg-blue-600 hover:bg-blue-700 text-white text-center w-full block py-2 rounded-md text-sm font-bold transition shadow">
                  进入发布后台
                </Link>
              </div>
            )}
          </div>

          {/* 右侧主内容区 */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* 基础信息面板 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                <span className="text-sm font-bold text-gray-400">Player Info</span>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="mb-4 flex items-center gap-3">
  <h1 className="text-2xl text-green-500 font-bold">{displayName}</h1>
  
  {/* 专属 6 位 ID 标签 */}
   <span className="bg-[#1e1f23] text-gray-400 text-xs px-2 py-1 rounded border border-gray-700 font-mono">
    ID: {profile?.custom_id || profile?.random_id || '分配中...'}
  </span>
</div>
                                  <div className="text-sm space-y-3">
                    <p><span className="text-gray-500 inline-block w-28">Languages:</span> <span className="text-white">English, Chinese (Simplified)</span></p>
                    <p><span className="text-gray-500 inline-block w-28">Steam ID:</span> <span className="text-white">{profile?.steam_id || '未绑定'}</span></p>
                    <span className={userRole !== 'member' ? 'text-red-400 font-bold' : 'text-green-400'}>
  {ROLE_LABELS[userRole]}
</span>
                    <p><span className="text-gray-500 inline-block w-28">Active bans:</span> <span className="text-white">0</span></p>
                    <p><span className="text-gray-500 inline-block w-28">Linked games:</span> <span className="text-white">Euro Truck Simulator 2</span></p>
                    <p><span className="text-gray-500 inline-block w-28">In-game status:</span> <span className="text-gray-500">Offline</span></p>

                    {/* 自我介绍保留在下面 */}
                    {profile?.bio && (
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
                  <div className="bg-[#232428] p-3 rounded-md border border-gray-700">
                     <h4 className="text-xs text-gray-400 mb-2">Social Information</h4>
                     <p className="text-sm text-gray-400 flex justify-between">
                       <span>Discord:</span> 
                       <span className="text-white">{profile?.discord_id || '未绑定'}</span>
                     </p>
                     <p className="text-sm text-gray-400 flex justify-between mt-1">
                       <span>Steam:</span> 
                       <span className="text-white">{profile?.steam_id || '未绑定'}</span>
                     </p>
                  </div>
                </div>
              </div>
            </div>

            {/* VTC 信息面板 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" /></svg>
                <span className="text-sm font-bold text-gray-400">VTC Info (车队信息)</span>
              </div>
              <div className="p-6">
                <div className="text-center text-gray-500 text-sm py-8 bg-[#232428] rounded-md border border-dashed border-gray-700">
                  你目前尚未加入任何车队 (You are not currently a member of any VTC).
                </div>
              </div>
            </div>

            {/* 驾驶记录面板 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                <span className="text-sm font-bold text-gray-400">Deliveries (运输记录)</span>
              </div>
              <div className="p-6">
                <div className="text-center text-gray-500 text-sm py-8 bg-[#232428] rounded-md border border-dashed border-gray-700">
                  暂无运输记录 (No deliveries found).
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}