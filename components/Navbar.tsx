'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { attemptSteamBind } from '../lib/steam-bind-client';
import { ROLE_LEVEL, levelOf } from '../lib/permissions';
import { DISCORD_INVITE_URL } from '../lib/discord';
import LanguageSwitcher from './LanguageSwitcher';
import { useTr } from './I18nProvider';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** 在线人数轮询间隔：30 秒，页面隐藏时暂停。 */
const PLAYERS_POLL_INTERVAL_MS = 30_000;

/** 通知轮询间隔：30 秒（页面重新可见或窗口重新聚焦时额外立即刷新）。 */
const NOTIFICATIONS_POLL_INTERVAL_MS = 30_000;

/** 移动端主导航项（桌面端仍使用下方完整导航，含活动下拉）。 */
type MobileNavItem = {
  href: string;
  label: string;
  /** 站外链接（如 Discord 邀请）：用 <a> 新标签页打开。 */
  external?: boolean;
};

const MOBILE_NAV_ITEMS: readonly MobileNavItem[] = [
  { href: '/forum', label: '论坛 (Forum)' },
  { href: '/events', label: '活动 (Events)' },
  { href: '/map', label: '实时地图' },
  { href: '/servers', label: '服务器列表' },
  { href: '/vtc', label: '车队 (VTC)' },
  { href: '/team', label: '团队' },
  { href: '/rules', label: '社区规则' },
  { href: '/support', label: '帮助与支持' },
  { href: DISCORD_INVITE_URL, label: 'Discord', external: true },
];

/**
 * 导航栏界面文案（以中文原文为 key，英文缺失时回退中文）。
 * 只收录 UI 文案：用户名、通知内容、角色名等数据不翻译。
 */
const EN = {
  // 顶栏状态
  '在线': 'Online',
  '注册': 'Sign up',
  '登录': 'Sign in',
  '通知中心': 'Notifications',
  '全部已读': 'Mark all as read',
  '暂无通知': 'No notifications',
  '查看全部通知 →': 'View all notifications →',

  // 账号下拉
  '个人中心 (Profile)': 'Profile',
  '我的车队 (My VTC)': 'My VTC',
  '账号设置 (Settings)': 'Settings',
  '帮助与支持 (Support)': 'Support',
  '退出登录 (Logout)': 'Log out',

  // 主导航 / 活动下拉
  '论坛 (Forum)': 'Forum',
  '活动 (Events)': 'Events',
  '活动列表': 'Event list',
  '创建活动': 'Create event',
  '实时地图': 'Live map',
  '服务器列表': 'Server list',
  '车队 (VTC)': 'VTC',
  '团队': 'Team',
  '社区规则': 'Community rules',
  '帮助与支持': 'Help & support',

  // 搜索框
  '全部': 'All',
  '帖子/新闻': 'Posts / News',
  '玩家': 'Player',
  '搜索...': 'Search...',

  // 移动端
  '打开导航菜单': 'Open navigation menu',
  '关闭导航菜单': 'Close navigation menu',
  '移动端主导航': 'Mobile main navigation',
} satisfies Record<string, string>;

/** 通知下拉渲染所需的最小字段（数据来自 notifications 表，不翻译）。 */
type NavNotification = {
  id: number;
  content: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export default function Navbar() {
  const tr = useTr(EN);
  const [user, setUser] = useState<User | null>(null);
  const [players, setPlayers] = useState<number | null>(null); 
  const [userLevel, setUserLevel] = useState(0);
  const [displayName, setDisplayName] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeZone, setTimeZone] = useState('');
  
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  
  // 菜单与通知状态
  const [isMenuOpen, setIsMenuOpen] = useState(false); 
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [notifications, setNotifications] = useState<NavNotification[]>([]);
  
  const menuRef = useRef<HTMLDivElement>(null); 
  const notifRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 通知请求序号：只接受最后一次请求的结果，避免轮询与手动刷新并发时旧响应覆盖新数据。
  const notificationsRequestRef = useRef(0);

  // 获取通知；cancelled 由调用方提供，用于组件卸载/登出后丢弃在途响应。
  const fetchNotifications = useCallback(
    async (userId: string, cancelled?: () => boolean) => {
      const requestId = ++notificationsRequestRef.current;
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select(`*, actor:actor_id (display_name)`)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (cancelled?.() || requestId !== notificationsRequestRef.current) return;
        if (error) {
          console.warn('获取通知失败:', error.message);
          return;
        }
        if (data) setNotifications(data);
      } catch (err) {
        if (cancelled?.() || requestId !== notificationsRequestRef.current) return;
        console.warn('获取通知失败:', err instanceof Error ? err.message : err);
      }
    },
    []
  );

  useEffect(() => {
    // 1. 获取用户登录状态
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, role_level, display_name, steam_verified')
          .eq('id', user.id)
          .single();

        setUserLevel(levelOf(profile?.role_level));
        setDisplayName(profile?.display_name || user.email?.split('@')[0] || '');

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

        // 通知由下方“登录后自动刷新”effect 统一加载。
      }
    };
    getUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user || null;
      setUser(nextUser);
      // 登出时清空本地通知，避免切换账号瞬间看到上一个账号的内容。
      if (!nextUser) setNotifications([]);
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

  // 登录后每 30 秒自动刷新通知列表与未读数；页面重新可见或窗口重新聚焦时立即刷新。
  // 登出/卸载时清理定时器与监听，cancelled 守卫丢弃在途响应，避免旧数据覆盖新状态。
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const refresh = () => {
      if (cancelled) return;
      void fetchNotifications(userId, () => cancelled);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    const timer = setInterval(refresh, NOTIFICATIONS_POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refresh);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refresh);
    };
  }, [userId, fetchNotifications]);

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

  // 标记通知为已读
  const markAsRead = async (id: number, link: string | null) => {
    // 使在途的通知列表请求失效，避免旧响应把本次本地标记覆盖回未读。
    notificationsRequestRef.current += 1;
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    // 写入完成后再失效一次，覆盖“更新期间新发起、但读到旧数据”的请求。
    notificationsRequestRef.current += 1;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setIsNotifOpen(false);
    if (link) router.push(link);
  };

  // 下拉内的「全部已读」：把当前用户的未读通知批量置为已读并刷新本地列表
  const markAllAsRead = async () => {
    if (!user) return;
    // 同上：丢弃可能仍在途的旧列表响应。
    notificationsRequestRef.current += 1;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (error) {
      console.error('标记全部通知已读失败:', error.message);
      return;
    }
    // 写入完成后再失效一次，避免窗口期内发起的请求用旧数据覆盖“全部已读”。
    notificationsRequestRef.current += 1;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  // 时间更新：时区只能在客户端读取，首帧同步一次，随后每秒刷新时间。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 时区依赖浏览器环境，无法在渲染期稳定读取
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
  const displayNameText = displayName || tr('玩家');

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
              <span>{tr('在线')} <span className="text-green-400 font-mono">{players}</span></span>
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
                      <p className="text-gray-300 font-bold text-sm">{tr('通知中心')}</p>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void markAllAsRead()}
                          className="text-[10px] text-blue-400 hover:text-blue-300 transition"
                        >
                          {tr('全部已读')}
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="text-center text-xs text-gray-500 py-4">{tr('暂无通知')}</p>
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
                    <Link
                      href="/notifications"
                      onClick={() => setIsNotifOpen(false)}
                      className="block px-4 py-2 text-center text-xs text-blue-400 hover:text-blue-300 hover:bg-[#333333] border-t border-gray-700 transition"
                    >
                      {tr('查看全部通知 →')}
                    </Link>
                  </div>
                )}
              </div>
              
              {/* 用户名下拉 */}
              <div className="relative" ref={menuRef}>
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center space-x-1 hover:text-white transition focus:outline-none">
                  <span className="font-bold text-gray-200">{displayNameText}</span>
                  <span className="text-[10px] ml-1">▼</span>
                </button>
                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[#222222] border border-gray-700 rounded shadow-2xl py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-700 mb-1">
                      <p className="text-gray-300 font-bold truncate">{displayNameText}</p>
                      <p className="text-gray-500 text-[10px] truncate">{user.email}</p>
                    </div>
                    <Link href={`/profile/${user.id}`} className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>{tr('个人中心 (Profile)')}</Link>
                    <Link href="/profile" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>{tr('我的车队 (My VTC)')}</Link>
                    <Link href="/settings" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>{tr('账号设置 (Settings)')}</Link>
                    <Link href="/forum/3" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>{tr('帮助与支持 (Support)')}</Link>
                    <div className="border-t border-gray-700 my-1"></div>
                    <button onClick={handleLogout} className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-[#333333] transition">{tr('退出登录 (Logout)')}</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {!user && (
            <>
              <Link href="/login" className="hover:text-white transition">{tr('注册')}</Link>
              <span className="text-gray-600">|</span>
              <Link href="/login" className="hover:text-white transition">{tr('登录')}</Link>
            </>
          )}
        </div>
      </div>

      {/* 🌟 第二层：主导航栏 */}
      <div className="flex justify-between items-center px-6 py-3">
        <Link 
          href="/" 
          className="text-lg sm:text-xl md:text-2xl font-black italic tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-red-200 to-red-500 hover:opacity-80 transition whitespace-nowrap pr-2 pb-1 inline-block"
        >
          Road Cruise Transport MP
        </Link>

        {/* 📱 移动端菜单开关（桌面端隐藏） */}
        <button
          type="button"
          onClick={() => setIsMobileNavOpen((open) => !open)}
          aria-expanded={isMobileNavOpen}
          aria-controls="mobile-nav"
          aria-label={isMobileNavOpen ? tr('关闭导航菜单') : tr('打开导航菜单')}
          className="md:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-700 bg-[#232428] text-gray-300 transition hover:border-gray-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {isMobileNavOpen ? (
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>

        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium text-gray-300">
          
          {/* 语言切换（简体中文 / English） */}
          <LanguageSwitcher />

          <Link href="/forum" className="hover:text-white transition">{tr('论坛 (Forum)')}</Link>
          
          {/* 活动下拉 */}
          <div className="relative group">
            <button className="flex items-center space-x-1 hover:text-white transition py-2 focus:outline-none">
              <span>{tr('活动 (Events)')}</span>
              <svg className="w-3 h-3 text-gray-500 group-hover:text-white transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className="absolute top-full left-0 mt-1 w-48 bg-[#222222] border border-gray-700 rounded shadow-2xl py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <Link href="/events" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition">
                {tr('活动列表')}
              </Link>
              {user && userLevel >= ROLE_LEVEL.STAFF && (
                <Link href="/admin/events" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition">
                  {tr('创建活动')}
                </Link>
              )}
            </div>
          </div>
          
          <Link href="/map" className="hover:text-white transition flex items-center gap-1">{tr('实时地图')}</Link>
          <Link href="/servers" className="hover:text-white transition">{tr('服务器列表')}</Link>
          <Link href="/vtc" className="hover:text-white transition">{tr('车队 (VTC)')}</Link>
          <Link href="/team" className="hover:text-white transition">{tr('团队')}</Link>
          <Link href="/rules" className="hover:text-white transition">{tr('社区规则')}</Link>
          <Link href="/support" className="hover:text-white transition">{tr('帮助与支持')}</Link>

          {/* Discord 社区外链（新标签页打开） */}
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition inline-flex items-center gap-1"
          >
            <span aria-hidden="true">💬</span>
            Discord
          </a>

          {/* 🌟 全局搜索框 (带分类下拉) */}
          <form onSubmit={handleSearch} className="relative ml-4 flex items-center bg-[#232428] border border-gray-700 rounded-full focus-within:border-blue-500 transition-all focus-within:w-80 w-64 h-8">
            <select 
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              className="bg-transparent text-xs text-gray-400 border-none outline-none pl-3 pr-1 cursor-pointer appearance-none hover:text-white"
            >
              <option value="all" className="bg-[#232428]">{tr('全部')}</option>
              <option value="topics" className="bg-[#232428]">{tr('帖子/新闻')}</option>
              <option value="members" className="bg-[#232428]">{tr('玩家')}</option>
            </select>
            <div className="h-3 w-px bg-gray-600 mx-1"></div>
            <input 
              type="text" 
              placeholder={tr('搜索...')}
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

      {/* 📱 移动端主导航（仅小屏显示，链接与桌面端保持一致） */}
      {isMobileNavOpen && (
        <nav
          id="mobile-nav"
          aria-label={tr('移动端主导航')}
          className="md:hidden border-t border-gray-800 bg-[#1a1a1a] px-4 py-3"
        >
          <div className="grid grid-cols-2 gap-2 text-sm">
            {MOBILE_NAV_ITEMS.map((item) =>
              item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileNavOpen(false)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-800 bg-[#232428] px-3 py-2.5 text-gray-300 transition hover:border-blue-500/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <span aria-hidden="true">💬</span>
                  {tr(item.label)}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileNavOpen(false)}
                  className="rounded-lg border border-gray-800 bg-[#232428] px-3 py-2.5 text-gray-300 transition hover:border-blue-500/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {tr(item.label)}
                </Link>
              )
            )}
          </div>
        </nav>
      )}
    </header>
  );
}