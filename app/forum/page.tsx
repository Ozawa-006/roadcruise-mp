// app/forum/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ForumHome() {
  const [categories, setCategories] = useState<any[]>([]);
  const [latestTopics, setLatestTopics] = useState<any[]>([]);
  const [hotTopics, setHotTopics] = useState<any[]>([]);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForumData = async () => {
      // 1. 获取版块
      const { data: catData } = await supabase.from('forum_categories').select('*').order('id');
      if (catData) setCategories(catData);

      // 2. 获取最新动态（全站最新5条帖子）
      const { data: latest } = await supabase
        .from('forum_topics')
        .select(`
          id, title, created_at, category_id,
          profiles:author_id (display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      if (latest) setLatestTopics(latest);

      // 3. 获取热门主题（按回复数最多排序前5条）
      const { data: hot } = await supabase
        .from('forum_topics')
        .select(`
          id, title, replies_count, category_id,
          profiles:author_id (display_name)
        `)
        .order('replies_count', { ascending: false })
        .limit(5);
      if (hot) setHotTopics(hot);

            // 4. 获取“在线”成员（用最近活跃的 8 位用户代替）
      const { data: users } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role')
        .order('updated_at', { ascending: false }) // ✅ 改成 updated_at
        .limit(8);
      if (users) setRecentUsers(users);

      setLoading(false);
    };
    fetchForumData();
  }, []);

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载论坛数据中...</div>;

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* ================= 左侧栏 (导航) ================= */}
          <div className="lg:col-span-2 space-y-6 hidden lg:block">
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-2 shadow-lg">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 mb-2 mt-1">导航</h3>
              <ul className="text-sm space-y-1">
                <li>
                  <Link href="/forum" className="flex items-center text-green-500 bg-[#3a3b40] px-3 py-2 rounded-md font-bold">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>
                    论坛首页
                  </Link>
                </li>
                <li>
                  <Link href="/map" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd" /></svg>
                    实时地图
                  </Link>
                </li>
                <li>
                  <Link href="/rules" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                    社区规则
                  </Link>
                </li>
                <li>
                  <Link href="/forum/3" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
                    招募 (Recruitment)
                  </Link>
                </li>
                <li>
                  <Link href="/forum/4" className="flex items-center hover:bg-[#3a3b40] px-3 py-2 rounded-md transition">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" /></svg>
                    VTC System
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* ================= 中间栏 (版块与在线成员) ================= */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* 版块列表 */}
            <div>
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-white mb-1">CRT MP 论坛</h1>
                  <p className="text-gray-500 text-xs">加入讨论，分享你的卡车生活。</p>
                </div>
                <Link href="/forum/1/new" className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded text-sm font-bold transition shadow-lg flex items-center gap-2">
                  <span>+</span> 发布新帖
                </Link>
              </div>

              <div className="space-y-3">
                {categories.map((cat) => (
                  <Link 
                    key={cat.id} 
                    href={`/forum/${cat.id}`} 
                    className="block bg-[#2c2d31] border border-gray-700 rounded-lg overflow-hidden hover:border-blue-500 transition group shadow-lg"
                  >
                    <div className="flex items-center p-5">
                      <div className="w-12 h-12 bg-[#1e1f23] rounded-full flex items-center justify-center text-2xl mr-5 text-blue-500 group-hover:scale-110 transition shadow-inner">
                        {cat.icon === 'megaphone' ? '📢' : cat.icon === 'help' ? '🆘' : '💬'}
                      </div>
                      <div className="flex-1">
                        <h2 className="text-lg font-bold text-white group-hover:text-blue-400 transition">{cat.name}</h2>
                        <p className="text-gray-400 text-xs mt-1">{cat.description}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* 当前在线成员 (用最近注册代替) */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-sm font-bold text-gray-400">当前在线成员</span>
              </div>
              <div className="p-4 grid grid-cols-4 md:grid-cols-8 gap-4">
                {recentUsers.map(u => (
                  <div key={u.id} className="flex flex-col items-center group cursor-pointer">
                    <div className="w-12 h-12 rounded bg-[#18191c] border border-gray-600 overflow-hidden group-hover:border-blue-500 transition shadow">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-500">
                          {u.display_name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 mt-2 text-center truncate w-full group-hover:text-white transition">
                      {u.display_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* ================= 右侧栏 (最新动态、热门主题) ================= */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* 最新动态 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                <span className="text-sm font-bold text-gray-400">最新动态</span>
              </div>
              <div className="p-2">
                {latestTopics.length === 0 ? (
                  <p className="text-center text-xs text-gray-500 py-4">暂无动态</p>
                ) : (
                  latestTopics.map(topic => (
                    <Link key={topic.id} href={`/forum/${topic.category_id}/${topic.id}`} className="block p-2 hover:bg-[#3a3b40] rounded transition border-b border-gray-700/50 last:border-0 group">
                      <p className="text-xs text-white group-hover:text-blue-400 font-bold truncate">{topic.title}</p>
                      <p className="text-[10px] text-gray-500 mt-1 flex justify-between">
                        <span>{topic.profiles?.display_name || '未知'}</span>
                        <span>{new Date(topic.created_at).toLocaleDateString()}</span>
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* 热门主题 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" /></svg>
                <span className="text-sm font-bold text-gray-400">热门主题</span>
              </div>
              <div className="p-2">
                {hotTopics.length === 0 ? (
                  <p className="text-center text-xs text-gray-500 py-4">暂无热门</p>
                ) : (
                  hotTopics.map((topic, index) => (
                    <Link key={topic.id} href={`/forum/${topic.category_id}/${topic.id}`} className="flex items-start gap-3 p-2 hover:bg-[#3a3b40] rounded transition border-b border-gray-700/50 last:border-0 group">
                      <span className={`text-lg font-black italic ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : index === 2 ? 'text-orange-600' : 'text-gray-700'}`}>
                        #{index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white group-hover:text-blue-400 font-bold truncate">{topic.title}</p>
                        <p className="text-[10px] text-gray-500 mt-1 flex justify-between">
                          <span>{topic.profiles?.display_name || '未知'}</span>
                          <span>{topic.replies_count || 0} 回复</span>
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* 最近注册成员 */}
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg">
              <div className="bg-[#232428] px-4 py-2 border-b border-gray-700 flex items-center gap-2 rounded-t-md">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" /></svg>
                <span className="text-sm font-bold text-gray-400">最近注册成员</span>
              </div>
              <div className="p-2">
                {recentUsers.slice(0, 5).map(u => (
                  <div key={u.id} className="flex items-center gap-3 p-2 hover:bg-[#3a3b40] rounded transition border-b border-gray-700/50 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-[#18191c] border border-gray-600 overflow-hidden">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-500">
                          {u.display_name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-300 truncate">{u.display_name}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>
    </main>
  );
}