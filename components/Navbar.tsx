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
  const [isMenuOpen, setIsMenuOpen] = useState(false); // 控制下拉菜单
  const menuRef = useRef<HTMLDivElement>(null); // 用于点击外部关闭菜单
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
          console.log("查到的个人资料:", profile);
          
        setUserRole(profile?.role || 'member');
        
        // 🌟 就是这里，把 displayName 改成 setDisplayName
        if (profile?.display_name) {
          setDisplayName(profile.display_name);
        } else {
          setDisplayName(user.email?.split('@')[0] || '玩家');
        }
      }
    };
    getUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
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
          .catch(() => {
      // 忽略网络错误，防止控制台红字刷屏
    });

    // 3. 点击页面其他地方，自动关闭下拉菜单
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      authListener.subscription.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <header className="w-full bg-[#111111] border-b border-gray-800 flex flex-col font-sans relative z-50">
      
      {/* 🌟 第一层：极简顶栏 */}
      <div className="bg-[#1a1a1a] text-xs text-gray-400 py-1.5 px-6 flex justify-between items-center border-b border-gray-800/50">
        <div>
          <span className="text-gray-400 font-bold tracking-widest uppercase">Welcome to Road Cruise Transport MP</span>
        </div>
        
        <div className="flex items-center space-x-4 relative">
          {user ? (
            // 登录后的用户下拉菜单区
            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center space-x-1 hover:text-white transition focus:outline-none"
              >
                <span className="font-bold text-gray-200">{displayName}</span>
                <span className="text-[10px] ml-1">▼</span>
              </button>

              {/* 下拉菜单面板 */}
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#222222] border border-gray-700 rounded shadow-2xl py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-700 mb-1">
                    <p className="text-gray-300 font-bold truncate">{displayName}</p>
                    <p className="text-gray-500 text-[10px] truncate">{user.email}</p>
                  </div>
                  
                  {/* 菜单项 */}
                  <Link href="/profile" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>个人中心 (Profile)</Link>
                  <Link href="/my-vtc" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>我的车队 (My VTC)</Link>
                  <Link href="/settings" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>账号设置 (Settings)</Link>
                  <Link href="/support" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>帮助与支持 (Support)</Link>
                  <Link href="/reports" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition" onClick={() => setIsMenuOpen(false)}>违规举报 (Reports)</Link>
                  
                  <div className="border-t border-gray-700 my-1"></div>
                  
                  <button 
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-[#333333] hover:text-red-300 transition"
                  >
                    退出登录 (Logout)
                  </button>
                </div>
              )}
            </div>
          ) : (
            // 未登录状态
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
                {/* 🌟 使用 bg-clip-text 实现文字渐变 */}
        <Link 
          href="/" 
          className="text-xl md:text-2xl font-black italic tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-red-600 hover:opacity-80 transition whitespace-nowrap"
        >
          Road Cruise Transport MP
        </Link>

        <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-gray-300">
          
          {/* 🌐 语言切换组件 */}
          <div className="relative">
            <button 
              onClick={() => setIsLangOpen(!isLangOpen)}
              className="flex items-center space-x-1 hover:text-white transition focus:outline-none"
            >
              {/* 地球 SVG 图标 */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="text-xs ml-1">{currentLang}</span>
            </button>

            {/* 语言下拉菜单 */}
            {isLangOpen && (
              <div className="absolute right-0 top-full mt-4 w-32 bg-[#222222] border border-gray-700 rounded shadow-2xl py-1 z-50">
                <button 
                  onClick={() => { setCurrentLang('简中'); setIsLangOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition"
                >
                  简体中文
                </button>
                <button 
                  onClick={() => { setCurrentLang('EN'); setIsLangOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition"
                >
                  English
                </button>
              </div>
            )}
          </div>

          {/* 原有的导航链接 */}
          <Link href="/forum" className="hover:text-white transition">论坛 (Forum)</Link>
                    {/* 🌟 活动 下拉菜单 */}
          <div className="relative group">
            <button className="flex items-center space-x-1 hover:text-white transition py-2 focus:outline-none">
              <span>活动 (Events)</span>
              <svg className="w-3 h-3 text-gray-500 group-hover:text-white transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            
            {/* 下拉面板：默认隐藏，鼠标悬停显示 */}
            <div className="absolute top-full left-0 mt-1 w-48 bg-[#222222] border border-gray-700 rounded shadow-2xl py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <Link href="#" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[#333333] hover:text-white transition">
                暂无活动
              </Link>
              {/* 以后有活动了，就在这里加 Link */}
            </div>
          </div>
          <Link href="#" className="hover:text-white transition">车队 (VTC)</Link>
          <Link href="#" className="hover:text-white transition">帮助与支持</Link>
        </nav>
      </div>
      
    </header>
  );
}