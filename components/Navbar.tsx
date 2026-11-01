'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { attemptSteamBind } from '../lib/steam-bind-client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** 在线人数轮询间隔：30 秒，页面隐藏时暂停。 */
const PLAYERS_POLL_INTERVAL_MS = 30_000;

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
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  
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
          .select('role, display_name, steam_verified')
          .eq('id', user.id)
          .single();

        setUserRole(profile?.role || 'member');
        setDisplayName(profile?.display_name || user.email?.split('@')[0] || '玩家');

        // 已登录但还未绑定 Steam 的账号：如果浏览器持有服务端签名的验证凭证，
        // 自动完成绑定（覆盖“邮箱确认后直接落到任意页面”的情况）。
        if (profile && profile.steam_verified === false) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            void attemptSteamBind(session.access_token);
          }
        }

        // 获取未读通知
        fetchNotifications(user.id);
      }
    };
    getUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (session?.user) fetchNotifications(session.user.id);
    });

    // 2. 点击页面其他地方，自动关闭下拉菜单和通知
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

  // 从站内代理获取游戏服务器在线人数（不再直连 TruckersMP API）。
  // 每 30 秒轮询一次；页面隐藏时暂停，切回前台立即刷新并恢复轮询；失败静默。
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const loadPlayers = async () => {
      try {
        const res = await fetch('/api/servers/status', { cache: 'no-store' });
        if (!res.ok) return;
        const data: {
          servers?: { online?: number | null }[];
          configured?: boolean;
        } = await res.json();
        if (cancelled) return;

        const list = Array.isArray(data?.servers) ? data.servers : [];
        if (data?.configured === false || list.length === 0) {
          setPlayers(null);
          return;
        }

        setPlayers(
          list.reduce(
            (sum, server) =>
              sum + (typeof server?.online === 'number' && Number.isFinite(server.online)
                ? server.online
                : 0),
            0
          )
        );
      } catch {
        // 静默失败：保留上一次的在线人数，不打扰用户。
      }
    };

    const stopTimer = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const startTimer = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        void loadPlayers();
      }, PLAYERS_POLL_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadPlayers();
        startTimer();
      } else {
        stopTimer();
      }
    };

    void loadPlayers();
    if (document.visibilityState === 'visible') startTimer();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      stopTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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

          {/* 游戏服务器在线人数（来自站内代理 /api/servers/status） */}
          {players !== null && (
            <span className="hidden md:flex items-center space-x-1.5 border-r border-gray-700 pr-4">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
              <span>在线 <span className="text-green-400 font-mono">{players}</span></span>
            </span>
          )}

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
                    <div className="px-4 py-2 border-b border-gray-700 mb-1">
                      <p className="text-gray-300 font-bold truncate">{displayName}</p>
                      <p className="text-gray-500 text-[10px] truncate">{user.email}</p>
                    </div>
                    <Link href={`/profile/${user.id}`} className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>个人中心 (Profile)</Link>
                    <Link href="/profile" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>我的车队 (My VTC)</Link>
                    <Link href="/settings" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>账号设置 (Settings)</Link>
                    <Link href="/forum/3" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>帮助与支持 (Support)</Link>
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

      {/* 🌟 第二层：主导航栏 */}
      <div className="flex justify-between items-center px-6 py-3">
        <Link 
          href="/" 
          className="text-xl md:text-2xl font-black italic tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-red-200 to-red-500 hover:opacity-80 transition whitespace-nowrap pr-2 pb-1 inline-block"
        >
          Road Cruise Transport MP
        </Link>

        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium text-gray-300">
          
          {/* 语言切换 */}
          <div className="relative">
            <button 
              onClick={() => setIsLangOpen(!isLangOpen)}
              title="多语言切换开发中"
              className="flex items-center space-x-1 hover:text-white transition focus:outline-none"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="text-xs ml-1">{currentLang}</span>
            </button>
            {isLangOpen && (
              <div className="absolute right-0 top-full mt-4 w-44 bg-[#222222] border border-gray-700 rounded shadow-2xl py-1 z-50">
                <button onClick={() => { setCurrentLang('简中'); setIsLangOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition">简体中文（当前）</button>
                <button disabled title="多语言切换开发中" className="block w-full text-left px-4 py-2 text-sm text-gray-500 cursor-not-allowed opacity-60">English（开发中）</button>
              </div>
            )}
          </div>

          <Link href="/forum" className="hover:text-white transition">论坛 (Forum)</Link>
          
          {/* 活动下拉 */}
          <div className="relative group">
            <button className="flex items-center space-x-1 hover:text-white transition py-2 focus:outline-none">
              <span>活动 (Events)</span>
              <svg className="w-3 h-3 text-gray-500 group-hover:text-white transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className="absolute top-full left-0 mt-1 w-48 bg-[#222222] border border-gray-700 rounded shadow-2xl py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <span className="block px-4 py-2 text-sm text-gray-500 cursor-default select-none">暂无活动（敬请期待）</span>
            </div>
          </div>
          
          <Link href="/map" className="hover:text-white transition flex items-center gap-1">实时地图</Link>
          <Link href="/servers" className="hover:text-white transition">服务器列表</Link>
          <Link href="/vtc" className="hover:text-white transition">车队 (VTC)</Link>
          <Link href="/rules" className="hover:text-white transition">社区规则</Link>
          <Link href="/forum/3" className="hover:text-white transition">帮助与支持</Link>

          {/* 🌟 全局搜索框 (带分类下拉) */}
          <form onSubmit={handleSearch} className="relative ml-4 flex items-center bg-[#232428] border border-gray-700 rounded-full focus-within:border-blue-500 transition-all focus-within:w-80 w-64 h-8">
            <select 
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              className="bg-transparent text-xs text-gray-400 border-none outline-none pl-3 pr-1 cursor-pointer appearance-none hover:text-white"
            >
              <option value="all" className="bg-[#232428]">全部</option>
              <option value="topics" className="bg-[#232428]">帖子/新闻</option>
              <option value="members" className="bg-[#232428]">玩家</option>
            </select>
            <div className="h-3 w-px bg-gray-600 mx-1"></div>
            <input 
              type="text" 
              placeholder="搜索..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-white outline-none w-full h-full px-2"
            />
            <button type="submit" className="text-gray-400 hover:text-white pr-3 pl-1 h-full flex items-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}