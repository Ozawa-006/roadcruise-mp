'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NewsDetailPage() {
  const { id } = useParams(); // 从网址里获取公告的 ID
  const router = useRouter();
  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArticle = async () => {
      if (!id) return;
      
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        alert('找不到这篇公告，可能已被删除。');
        router.push('/'); // 找不到就退回主页
      } else {
        setArticle(data);
      }
      setLoading(false);
    };

    fetchArticle();
  }, [id, router]);

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex justify-center items-center">加载中...</div>;
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col pb-20">
      <Navbar />
      
      {/* 顶部大图背景 */}
      <div 
        className="w-full h-[40vh] md:h-[50vh] relative bg-cover bg-center"
        style={{ 
          backgroundImage: `url(${article.image_url || 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop'})` 
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>
        
        <div className="absolute bottom-0 left-0 w-full max-w-4xl mx-auto p-6 md:p-10">
          <span className="inline-block bg-blue-600 text-xs font-bold px-3 py-1 rounded mb-4 shadow">
            {article.type}
          </span>
          <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight drop-shadow-lg">
            {article.title}
          </h1>
          <div className="flex items-center text-gray-400 text-sm">
            <span>发布于：{new Date(article.created_at).toLocaleDateString()}</span>
            <span className="mx-3">•</span>
            <span>CRT MP 社区管理组</span>
          </div>
        </div>
      </div>

      {/* 正文内容区 */}
      <div className="max-w-4xl mx-auto w-full px-6 md:px-10 py-12">
        <div className="bg-[#111111] border border-gray-800 rounded-2xl p-6 md:p-10 shadow-2xl">
          {/* 使用 whitespace-pre-wrap 保留玩家输入的换行符 */}
          <p className="text-gray-300 text-lg leading-loose whitespace-pre-wrap">
            {article.content}
          </p>
        </div>

        {/* 底部返回按钮 */}
        <div className="mt-10 flex justify-center">
          <Link href="/" className="bg-gray-800 hover:bg-gray-700 text-white px-8 py-3 rounded-full font-bold transition flex items-center space-x-2">
            <span>❮</span>
            <span>返回主页查看更多</span>
          </Link>
        </div>
      </div>
    </main>
  );
}