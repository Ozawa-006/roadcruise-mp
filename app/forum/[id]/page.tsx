// app/forum/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../components/Navbar';
import Link from 'next/link';
import { canPostOfficialTopic, levelOf } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAGE_SIZE = 10;

export default function CategoryPage() {
  const { id } = useParams();
  const [category, setCategory] = useState<any>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 🌟 新增：用于存储当前用户的权限等级
  const [currentUserLevel, setCurrentUserLevel] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // 0. 获取当前登录用户的权限等级（只依据 profile.role_level）
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role_level').eq('id', user.id).single();
        setCurrentUserLevel(levelOf(profile?.role_level));
      }

      // 1. 获取版块信息
      const { data: catData } = await supabase.from('forum_categories').select('*').eq('id', id).single();
      if (catData) setCategory(catData);

      // 2. 获取帖子数量
      const { count } = await supabase
        .from('forum_topics')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', id);
      
      if (count !== null) setTotalCount(count);

      // 3. 分页获取帖子列表
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: topicData } = await supabase
        .from('forum_topics')
        .select(`*, profiles:author_id (display_name)`)
        .eq('category_id', id)
        .order('created_at', { ascending: false })
        .range(from, to);
      
      if (topicData) setTopics(topicData);
      setLoading(false);
    };
    fetchData();
  }, [id, currentPage]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (loading && !category) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载中...</div>;
  if (!category) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">版块不存在</div>;

  // 🌟 核心逻辑：判断当前用户是否有权限在这个版块发帖
  // 规则：官方公告版块（category_id 为 1，兼容数字和字符串）需要经理 Lv.70 及以上；其他版块不限制。
  const categoryId = Array.isArray(id) ? id[0] : id;
  const isOfficialBoard = String(categoryId) === '1';
  const canPost = !isOfficialBoard || canPostOfficialTopic(currentUserLevel);

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="w-full h-40 relative bg-[url('https://images.unsplash.com/photo-1592838064575-70ed626d3a0e?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-transparent"></div>
        <div className="absolute inset-0 flex flex-col justify-center max-w-5xl mx-auto w-full px-4 md:px-8">
          <div className="text-sm text-gray-400 mb-2">
            <Link href="/forum" className="hover:text-white transition">CRT MP 论坛</Link>
            <span className="mx-2">/</span>
            <span className="text-white font-bold">{category.name}</span>
          </div>
          <h1 className="text-4xl font-black text-white drop-shadow-lg">{category.name}</h1>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
        <div className="flex justify-between items-center mb-6 bg-[#2c2d31] p-4 rounded-lg border border-gray-700 shadow-lg">
          <p className="text-gray-400 text-sm">{category.description}</p>
          
          {/* 🌟 权限控制：只有 canPost 为 true 时才显示发布按钮 */}
          {canPost && (
            <Link href={`/forum/${id}/new`} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-bold transition shadow-lg flex items-center gap-2">
              <span>+</span> 发布新帖
            </Link>
          )}
        </div>

        <div className="space-y-2">
          {topics.length === 0 ? (
            <div className="text-center text-gray-500 py-10 bg-[#2c2d31] rounded border border-gray-700">
              这个版块还没有帖子，快来抢沙发吧！
            </div>
          ) : (
            topics.map((topic) => (
              <Link 
                key={topic.id} 
                href={`/forum/${id}/${topic.id}`}
                className="flex items-center justify-between bg-[#2c2d31] border border-gray-700 p-4 rounded-md hover:border-blue-500 hover:bg-[#323338] transition group shadow-sm"
              >
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition">{topic.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    由 <span className="text-gray-300 font-bold">{topic.profiles?.display_name || '未知玩家'}</span> 发表于 {new Date(topic.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right text-sm text-gray-400">
                  <p>{topic.replies_count || 0} 回复</p>
                </div>
              </Link>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center mt-8 space-x-2">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-[#2c2d31] border border-gray-700 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition"
            >
              上一页
            </button>
            <span className="text-gray-400 text-sm">
              第 {currentPage} / {totalPages} 页
            </span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-[#2c2d31] border border-gray-700 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </main>
  );
}