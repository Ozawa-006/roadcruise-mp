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
  const [news, setNews] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0); // 当前轮播到第几张

  // 获取公告数据
  useEffect(() => {
    const fetchNews = async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5); // 最多取5条用来轮播

      if (!error && data) {
        setNews(data);
      }
    };
    fetchNews();
  }, []);

  // 自动轮播逻辑（每 5 秒切换一次）
  useEffect(() => {
    if (news.length <= 1) return; // 如果只有1条或没有，就不自动轮播了

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % news.length);
    }, 5000);

    return () => clearInterval(timer); // 组件卸载时清理定时器
  }, [news.length]);

  // 手动切换
  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % news.length);
  };
  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + news.length) % news.length);
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      
      {/* 首屏大图区 */}
      <div className="h-[60vh] flex flex-col items-center justify-center bg-[url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center relative">
        <div className="absolute inset-0 bg-black/60 z-0"></div>
        <div className="relative z-10 text-center flex flex-col items-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 drop-shadow-lg">公路游轮运输 MP</h1>
          <p className="text-xl text-gray-300 mb-8 drop-shadow">欢迎来到属于卡友的公路世界</p>
          <div className="flex space-x-4">
            <button className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded text-white font-bold transition shadow-lg">申请加入车队</button>
            <a href="#" className="bg-gray-700 hover:bg-gray-600 px-8 py-3 rounded text-white font-bold transition shadow-lg">加入 Discord</a>
          </div>
        </div>
      </div>

      {/* 📢 轮播图区域 */}
      <div className="flex-1 max-w-6xl mx-auto w-full p-10">
        <div className="flex justify-between items-end mb-6 border-b border-gray-800 pb-4">
          <h2 className="text-3xl font-bold">社区最新动态</h2>
        </div>

        {news.length === 0 ? (
          <p className="text-gray-500 text-center py-20">暂无公告，请管理员前往后台发布。</p>
        ) : (
          <div className="relative w-full h-[400px] rounded-2xl overflow-hidden group border border-gray-800 bg-gray-900">
            
            {/* 轮播内容 */}
                                    {news.map((item, index) => (
              <div
                key={item.id}
                className={`absolute inset-0 transition-opacity duration-700 ease-in-out flex flex-col justify-end p-8 md:p-12 bg-gradient-to-t from-black via-black/70 to-transparent ${
                  index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
              >
                {/* ... 保持图片背景部分不变 ... */}
                {item.image_url ? (
                  <div 
                    className="absolute inset-0 bg-cover bg-center -z-10 opacity-60"
                    style={{ backgroundImage: `url(${item.image_url})` }}
                  ></div>
                ) : (
                  <div className="absolute inset-0 bg-gray-900 -z-10"></div>
                )}
                
                {/* 👇 修改下面这部分，包住文字内容 👇 */}
                <Link href={`/news/${item.id}`} className="max-w-3xl relative z-10 block group-hover:opacity-90 transition">
                  <span className="inline-block bg-blue-600 text-xs font-bold px-3 py-1 rounded mb-4 shadow">{item.type}</span>
                  <h3 className="text-3xl md:text-5xl font-black mb-4 leading-tight group-hover:text-blue-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-gray-300 text-lg md:text-xl leading-relaxed mb-6 line-clamp-3">{item.content}</p>
                  <div className="mt-4 inline-flex items-center text-blue-400 font-bold text-sm">
                    阅读全文 <span className="ml-2">➔</span>
                  </div>
                </Link>
                {/* 👆 修改结束 👆 */}

              </div>
            ))}

            {/* 左右切换按钮 */}
            {news.length > 1 && (
              <>
                <button 
                  onClick={prevSlide}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300"
                >
                  ❮
                </button>
                <button 
                  onClick={nextSlide}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300"
                >
                  ❯
                </button>
              </>
            )}

            {/* 底部小圆点指示器 */}
            {news.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex space-x-2">
                {news.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`w-3 h-3 rounded-full transition-all duration-300 ${
                      index === currentIndex ? 'bg-blue-500 w-8' : 'bg-gray-500 hover:bg-gray-400'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}