'use client';

import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [latestTopics, setLatestTopics] = useState<any[]>([]);

  // 🌟 改为获取论坛里“官方公告”板块的最新帖子（假设 category_id 为 1）
  useEffect(() => {
    const fetchLatestTopics = async () => {
      const { data } = await supabase
        .from('forum_topics')
        .select(`
          id,
          title,
          category_id,
          created_at,
          replies_count,
          profiles:author_id (display_name)
        `)
        .eq('category_id', 1) // 只拉取官方公告板块
        .order('created_at', { ascending: false })
        .limit(4); // 拿最新的 4 条
      
      if (data) setLatestTopics(data);
    };
    fetchLatestTopics();
  }, []);

  return (
    <main className="min-h-screen bg-black text-white flex flex-col font-sans">
      <Navbar />
      
      {/* 首屏大图区 (保持不变) */}
      <div className="h-[60vh] flex flex-col items-center justify-center bg-[url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center relative">
        <div className="absolute inset-0 bg-black/60 z-0"></div>
        <div className="relative z-10 text-center flex flex-col items-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 drop-shadow-lg text-white">公路游轮运输 MP</h1>
          <p className="text-xl text-gray-300 mb-8 drop-shadow">欢迎来到属于卡友的公路世界</p>
          
          <div className="flex">
            <Link href="/login" className="bg-blue-600 hover:bg-blue-700 px-10 py-3 rounded-lg text-white font-bold text-lg transition shadow-xl hover:scale-105 transform duration-200">
              加入 Road Cruise Transport MP
            </Link>
          </div>
        </div>
      </div>

      {/* 🌟 论坛官方新闻同步区 */}
      <div className="flex-1 max-w-6xl mx-auto w-full p-10 pt-12">
        <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-4">
          <h2 className="text-3xl font-bold text-white">官方最新动态</h2>
          <Link href="/forum/1" className="text-sm text-gray-500 hover:text-blue-400 transition">
            前往论坛查看全部 →
          </Link>
        </div>
        
        {latestTopics.length === 0 ? (
          <p className="text-gray-500 text-center py-10">暂无官方公告，请前往论坛发布。</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {latestTopics.map((item) => (
              <Link 
                key={item.id}
                href={`/forum/${item.category_id}/${item.id}`}
                className="bg-[#111111] border border-gray-800 p-6 rounded-xl hover:border-blue-500 hover:bg-[#1a1a1a] transition group shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="bg-blue-900/30 text-blue-400 text-xs px-2 py-1 rounded border border-blue-900/50">官方发布</span>
                    <span className="text-xs text-gray-500">{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                  <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition line-clamp-2 mb-4">
                    {item.title}
                  </h3>
                </div>
                <div className="flex justify-between text-sm text-gray-500 border-t border-gray-800/50 pt-4">
                  <span>发布者: {item.profiles?.display_name || '管理员'}</span>
                  <span>💬 {item.replies_count || 0} 评论</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}