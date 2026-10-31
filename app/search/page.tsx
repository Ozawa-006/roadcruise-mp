'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams } from 'next/navigation';
import Navbar from '../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const [topics, setTopics] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      if (!query) {
        setLoading(false);
        return;
      }
      setLoading(true);

      // 1. 搜索相关帖子（模糊匹配标题和内容）
      const { data: topicData } = await supabase
        .from('forum_topics')
        .select(`
          id, title, category_id, created_at,
          profiles:author_id (display_name)
        `)
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (topicData) setTopics(topicData);

      // 2. 搜索相关玩家（模糊匹配昵称）
      const { data: userData } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role, custom_id')
        .ilike('display_name', `%${query}%`)
        .limit(10);
        
      if (userData) setUsers(userData);

      setLoading(false);
    };

    fetchResults();
  }, [query]);

  if (loading) return <div className="text-center text-white mt-20">搜索中...</div>;

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
      <div className="mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-2xl font-bold text-white">
          搜索结果：<span className="text-blue-400">"{query}"</span>
        </h1>
        <p className="text-xs text-gray-500 mt-2">找到 {topics.length} 个相关帖子，{users.length} 位相关玩家。</p>
      </div>

      {/* 玩家结果 */}
      {users.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
            👥 相关玩家
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {users.map(u => (
              <div key={u.id} className="bg-[#2c2d31] border border-gray-700 p-4 rounded-lg flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#18191c] overflow-hidden border border-gray-600">
                  {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl font-bold text-gray-500">{u.display_name?.charAt(0).toUpperCase()}</div>}
                </div>
                <div>
                  <p className="text-white font-bold">{u.display_name}</p>
                  <p className="text-xs text-blue-400">ID: {u.custom_id || '无'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 帖子结果 */}
      <div>
        <h2 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
          📝 相关帖子
        </h2>
        <div className="space-y-3">
          {topics.length === 0 ? (
            <p className="text-gray-500 text-sm">没有找到相关帖子。</p>
          ) : (
            topics.map(topic => (
              <Link 
                key={topic.id} 
                href={`/forum/${topic.category_id}/${topic.id}`}
                className="block bg-[#2c2d31] border border-gray-700 p-4 rounded-lg hover:border-blue-500 transition group"
              >
                <h3 className="text-white font-bold text-base group-hover:text-blue-400 transition">{topic.title}</h3>
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>作者：{topic.profiles?.display_name || '未知'}</span>
                  <span>{new Date(topic.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      <Suspense fallback={<div className="text-center text-white mt-20">加载中...</div>}>
        <SearchResults />
      </Suspense>
    </main>
  );
}