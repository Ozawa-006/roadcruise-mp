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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase.from('forum_categories').select('*').order('id');
      if (data) setCategories(data);
      setLoading(false);
    };
    fetchCategories();
  }, []);

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载论坛中...</div>;

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
        
        <div className="flex justify-between items-end mb-8 border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">RCT MP 论坛</h1>
            <p className="text-gray-500 text-sm">加入讨论，分享你的卡车生活。</p>
          </div>
          <Link href="/forum/1/new" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-bold transition shadow-lg flex items-center gap-2">
            <span>+</span> 发布新帖
          </Link>
        </div>

        <div className="space-y-4">
          {categories.map((cat) => (
            <Link 
              key={cat.id} 
              href={`/forum/${cat.id}`} 
              className="block bg-[#2c2d31] border border-gray-700 rounded-lg overflow-hidden hover:border-blue-500 transition group shadow-lg"
            >
              <div className="flex items-center p-5">
                <div className="w-12 h-12 bg-[#1e1f23] rounded-full flex items-center justify-center text-2xl mr-5 text-blue-500 group-hover:scale-110 transition">
                  {cat.icon === 'megaphone' ? '📢' : cat.icon === 'help' ? '🆘' : '💬'}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-white group-hover:text-blue-400 transition">{cat.name}</h2>
                  <p className="text-gray-400 text-sm mt-1">{cat.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </main>
  );
}