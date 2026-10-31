'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Navbar() {
  const [user, setUser] = useState<any>(null);
  const [players, setPlayers] = useState<number | null>(null); 
  const [userRole, setUserRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('玩家');
  const [mounted, setMounted] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState('简中');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeZone, setTimeZone] = useState('');
  
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  
  // 菜单与通知状态
  const [isMenuOpen, setIsMenuOpen] = useState(false); 
  const [isNotifOpen, setIsNotifOpen] = useState(false); // 通知面板开关
  const [notifications, setNotifications] = useState<any[]>([]); // 通知列表
  
  const menuRef = useRef<HTMLDivElement>(null); 
  const notifRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    
    // 1. 获取用户登录状态
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, display_name') 
          .eq('id', user.id)
          .single();
          
        setUserRole(profile?.role || 'member');
        setDisplayName(profile?.display_name || user.email?.split('@')[0] || '玩家');
        
        // 获取未读通知
        fetchNotifications(user.id);
      }
    };
    getUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (session?.user) fetchNotifications(session.user.id);
    });

    // 2. 获取实时在线人数
    fetch('https://api.truckersmp.com/v2/servers')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.response) {
          const ets2Servers = data.response.filter((s: any) => s.game === 'ETS2');
          const total = ets2Servers.reduce((sum: number, server: any) => sum + (server.players || 0), 0);
          setPlayers(total);
        }
      })
      .catch(() => {});

    // 3. 点击页面其他地方，自动关闭下拉菜单和通知
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      authListener.subscription.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 获取通知的函数
  const fetchNotifications = async (userId: string) => {
    const { data } = await supabase
      .from('notifications')
      .select(`*, actor:actor_id (display_name)`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setNotifications(data);
  };

  // 标记通知为已读
  const markAsRead = async (id: number, link: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setIsNotifOpen(false);
    if (link) router.push(link);
  };

  // 时间更新
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}&type=${searchType}`);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <header className="w-full bg-[#111111] border-b border-gray-800 flex flex-col font-sans relative z-50">
      
      {/* 🌟 第一层：极简顶栏 */}
      <div className="bg-[#1a1a1a] text-xs text-gray-400 py-1.5 px-6 flex justify-between items-center border-b border-gray-800/50">
        <div>
          <span className="text-gray-400 font-bold tracking-widest uppercase">Welcome to Road Cruise Transport MP</span>
        </div>
        
        <div className="flex items-center space-x-4 relative">
          
          {/* 时间和时区 */}
          <div className="hidden lg:flex items-center space-x-3 text-[11px] text-gray-400 border-r border-gray-700 pr-4 mr-2">
            <span>UTC: <span className="text-gray-300 font-mono">{currentTime.toISOString().substring(11, 19)}</span></span>
            <span>|</span>
            <span>{timeZone}: <span className="text-gray-300 font-mono">{currentTime.toLocaleTimeString('en-GB')}</span></span>
          </div>

          {user && (
            <div className="flex items-center space-x-4 border-r border-gray-700 pr-4">
              {/* 🌟 通知铃铛 */}
              <div className="relative" ref={notifRef}>
                <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="relative hover:text-white transition focus:outline-none flex items-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {isNotifOpen && (
                  <div className="absolute right-0 top-full mt-3 w-72 bg-[#222222] border border-gray-700 rounded shadow-2xl py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-700 flex justify-between items-center">
                      <p className="text-gray-300 font-bold text-sm">通知中心</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="text-center text-xs text-gray-500 py-4">暂无通知</p>
                      ) : (
                        notifications.map(n => (
                          <div 
                            key={n.id} 
                            onClick={() => markAsRead(n.id, n.link)}
                            className={`px-4 py-3 border-b border-gray-700/50 hover:bg-[#333333] cursor-pointer transition ${!n.is_read ? 'bg-[#2c2d31]' : ''}`}
                          >
                            <p className="text-xs text-gray-200 mb-1">{n.content}</p>
                            <p className="text-[10px] text-gray-500">{new Date(n.created_at).toLocaleString()}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* 用户名下拉 */}
              <div className="relative" ref={menuRef}>
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center space-x-1 hover:text-white transition focus:outline-none">
                  <span className="font-bold text-gray-200">{displayName}</span>
                  <span className="text-[10px] ml-1">▼</span>
                </button>
                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[#222222] border border-gray-700 rounded shadow-2xl py-1 z-50">
                    <Link href={`/profile/${user.id}`} className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>个人中心 (Profile)</Link>
                    <Link href="/settings" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>账号设置 (Settings)</Link>
                    <div className="border-t border-gray-700 my-1"></div>
                    <button onClick={handleLogout} className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-[#333333] transition">退出登录 (Logout)</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {!user && (
            <>
              <Link href="/login" className="hover:text-white transition">注册</Link>
              <span className="text-gray-600">|</span>
              <Link href="/login" className="hover:text-white transition">登录</Link>
            </>
          )}
        </div>
      </div>

      {/* 🌟 第二层：主导航栏 (保持你原有的结构) */}
      <div className="flex justify-between items-center px-6 py-3">
        <Link href="/" className="text-xl md:text-2xl font-black italic tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-red-200 to-red-500 hover:opacity-80 transition whitespace-nowrap pr-2 pb-1 inline-block">
          Road Cruise Transport MP
        </Link>

        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium text-gray-300">
          <Link href="/forum" className="hover:text-white transition">论坛 (Forum)</Link>
          <Link href="/map" className="hover:text-white transition">实时地图</Link>
          <Link href="/rules" className="hover:text-white transition">社区规则</Link>

          {/* 搜索框 */}
          <form onSubmit={handleSearch} className="relative ml-4 flex items-center bg-[#232428] border border-gray-700 rounded-full focus-within:border-blue-500 transition-all focus-within:w-80 w-64 h-8">
            <select value={searchType} onChange={(e) => setSearchType(e.target.value)} className="bg-transparent text-xs text-gray-400 border-none outline-none pl-3 pr-1 cursor-pointer appearance-none">
              <option value="all" className="bg-[#232428]">全部</option>
              <option value="topics" className="bg-[#232428]">帖子</option>
              <option value="members" className="bg-[#232428]">玩家</option>
            </select>
            <div className="h-3 w-px bg-gray-600 mx-1"></div>
            <input type="text" placeholder="搜索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent text-xs text-white outline-none w-full h-full px-2" />
            <button type="submit" className="text-gray-400 hover:text-white pr-3 pl-1 h-full flex items-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}