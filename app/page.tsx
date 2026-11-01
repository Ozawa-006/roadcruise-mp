// app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../components/Navbar';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [latestTopics, setLatestTopics] = useState<any[]>([]);
  const [stats, setStats] = useState({ users: 0, vtc: 0, events: 0, team: 0 });
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      // 1. 获取最新官方公告
      const { data: topics } = await supabase
        .from('forum_topics')
        .select(`
          id, title, category_id, created_at, replies_count, image_url,
          profiles:author_id (display_name)
        `)
        .eq('category_id', 1)
        .order('created_at', { ascending: false })
        .limit(5);
      if (topics) setLatestTopics(topics);

      // 2. 获取统计数据
      const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: teamCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('role_level', 40);
      
      setStats({
        users: userCount || 0,
        vtc: 0, 
        events: 0, 
        team: teamCount || 0
      });
    };
    fetchData();
  }, []);

  // 自动轮播
  useEffect(() => {
    if (latestTopics.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % latestTopics.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [latestTopics.length]);

  const nextSlide = () => {
    if (latestTopics.length > 0) setCurrentIndex((prev) => (prev + 1) % latestTopics.length);
  };
  const prevSlide = () => {
    if (latestTopics.length > 0) setCurrentIndex((prev) => (prev - 1 + latestTopics.length) % latestTopics.length);
  };

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      {/* 🌟 第一区块：TMP风格主页首屏 */}
      <section className="relative w-full h-[65vh] md:h-[75vh] bg-black overflow-hidden">
        
        {/* 1. 底层背景图（防止拉伸，统一使用高清图） */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop')` }}
        ></div>
        {/* 遮罩层，让文字清晰 */}
        <div className="absolute inset-0 bg-black/60 z-0"></div>

        {/* 2. 主体内容区（左右分栏） */}
        <div className="relative z-10 w-full h-full max-w-7xl mx-auto px-6 md:px-10 flex flex-col md:flex-row items-center justify-between">
          
          {/* 左侧：固定的卖点列表 */}
          <div className="w-full md:w-1/2 text-white space-y-4 mb-10 md:mb-0">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-500 inline-block"></span> 
              Why join us?
            </h2>
            <ul className="space-y-3 text-base md:text-lg text-gray-200">
              <li className="flex items-center gap-3"><span className="text-blue-400">✔</span> Thousands of players</li>
              <li className="flex items-center gap-3"><span className="text-blue-400">✔</span> Strong and Fair Game Moderation Team</li>
              <li className="flex items-center gap-3"><span className="text-blue-400">✔</span> Dedicated Servers</li>
              <li className="flex items-center gap-3"><span className="text-blue-400">✔</span> Great Community</li>
              <li className="flex items-center gap-3"><span className="text-blue-400">✔</span> All that is missing is you!</li>
            </ul>
          </div>

          {/* 右侧：新闻轮播内容 */}
          <div className="w-full md:w-1/2 flex flex-col items-center md:items-start justify-center text-center md:text-left h-64 relative">
            {latestTopics.length === 0 ? (
              // 没有新闻时的兜底展示
              <>
                <h1 className="text-4xl md:text-5xl font-black text-white mb-6 drop-shadow-lg leading-tight">
                  Road Cruise Transport MP
                </h1>
                <Link href="/login" className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-3 rounded font-bold text-lg transition shadow-lg">
                  Join today!
                </Link>
              </>
            ) : (
              // 有新闻时的轮播展示
              <div className="relative w-full h-full flex flex-col justify-center">
                {latestTopics.map((item, index) => (
                  <div
                    key={item.id}
                    className={`absolute inset-0 transition-opacity duration-1000 ease-in-out flex flex-col justify-center ${
                      index === currentIndex ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
                    }`}
                  >
                    <span className="text-blue-500 font-bold tracking-widest uppercase mb-2 text-sm">Road Cruise News</span>
                    <h1 className="text-2xl md:text-4xl font-black text-white mb-6 drop-shadow-lg leading-tight line-clamp-3">
                      {item.title}
                    </h1>
                    <div>
                      <Link 
                        href={`/forum/${item.category_id}/${item.id}`} 
                        className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-md font-bold text-base transition shadow-lg"
                      >
                        Read More (阅读更多)
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 右侧轮播控制按钮与指示器 (绝对定位在右侧区域内) */}
            {latestTopics.length > 1 && (
              <div className="absolute -bottom-8 md:bottom-0 right-0 md:-right-8 flex items-center gap-4">
                <button onClick={prevSlide} className="text-white/50 hover:text-white transition p-2">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex space-x-2">
                  {latestTopics.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentIndex(i)}
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                        i === currentIndex ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>
                <button onClick={nextSlide} className="text-white/50 hover:text-white transition p-2">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
          </div>

        </div>
      </section>

      {/* 第二区块：VTC Events */}
      <section className="py-16 bg-[#111111] border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="w-1.5 h-6 bg-blue-500 block"></span>
              VTC Events
            </h2>
            <Link href="/forum" className="text-sm text-blue-400 hover:text-blue-300 transition">
              前往论坛查看全部 →
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((item) => (
              <div key={item} className="bg-[#2c2d31] border border-gray-700 p-5 rounded-lg hover:border-blue-500 transition shadow-lg flex flex-col justify-between">
                <div>
                   <div className="h-32 bg-[#1e1f23] rounded-md mb-4 flex items-center justify-center text-gray-500">
                      <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                   </div>
                   <h3 className="text-lg font-bold text-white mb-2">VTC 联动活动即将上线</h3>
                   <p className="text-sm text-gray-400 line-clamp-2">敬请期待我们与各大车队联合举办的精彩联运活动，系统正在开发中...</p>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-4 pt-4 border-t border-gray-700/50">
                  <span>Road Cruise Official</span>
                  <span className="text-orange-400">即将发布</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 第三区块：我们的服务 */}
      <section className="py-16 max-w-7xl mx-auto px-6">
        <h2 className="text-2xl font-bold text-white text-center mb-10">
          <span className="border-b-2 border-blue-500 pb-2">我们的服务</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 shadow-lg">
            <h3 className="text-lg font-bold text-white mb-2">模拟</h3>
            <p className="text-sm text-gray-400">我们非常重视模拟体验，致力于为卡友提供最真实的驾驶环境。</p>
          </div>
          <div className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 shadow-lg">
            <h3 className="text-lg font-bold text-white mb-2">VTC 系统</h3>
            <p className="text-sm text-gray-400">完整的虚拟车队管理系统正在开发中，敬请期待。</p>
          </div>
          <div className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 shadow-lg">
            <h3 className="text-lg font-bold text-white mb-2">调解</h3>
            <p className="text-sm text-gray-400">我们的管理团队全年无休，随时处理违规举报，维护社区公平。</p>
          </div>
          <div className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 shadow-lg">
            <h3 className="text-lg font-bold text-white mb-2">支持</h3>
            <p className="text-sm text-gray-400">遇到技术问题或社区疑问？我们的支持团队会尽快为您解答。</p>
          </div>
          <div className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 shadow-lg">
            <h3 className="text-lg font-bold text-white mb-2">社区互动</h3>
            <p className="text-sm text-gray-400">通过 Discord、论坛等多种渠道，与全球玩家分享你的卡车生活。</p>
          </div>
          <div className="bg-[#2c2d31] p-6 rounded-lg border border-gray-700 shadow-lg">
            <h3 className="text-lg font-bold text-white mb-2">创建您自己的活动</h3>
            <p className="text-sm text-gray-400">想自己办联运？我们有专门的预约系统帮您安排。</p>
          </div>
        </div>
      </section>

      {/* 第四区块：数据统计 */}
      <section className="bg-[#111111] py-12 border-y border-gray-800">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <p className="text-4xl font-black text-white">{stats.users.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-2">注册用户</p>
          </div>
          <div>
            <p className="text-4xl font-black text-white">{stats.events}</p>
            <p className="text-sm text-gray-500 mt-2">发布的活动</p>
          </div>
          <div>
            <p className="text-4xl font-black text-white">{stats.team}</p>
            <p className="text-sm text-gray-500 mt-2">团队成员</p>
          </div>
          <div>
            <p className="text-4xl font-black text-white">{stats.vtc}</p>
            <p className="text-sm text-gray-500 mt-2">认证车队 (VTC)</p>
          </div>
        </div>
      </section>

      {/* 第五区块：终极页脚 */}
      <footer className="bg-[#0a0a0a] pt-16 pb-8 mt-auto">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="text-xl lg:text-2xl font-black italic tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-red-500 inline-block mb-4">
              Road Cruise Transport MP
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed">
              我们是一个充满热情的 ETS2 社区，致力于提供真实的联运体验和难忘的旅程。
            </p>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">有用链接</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/forum" className="hover:text-blue-400">论坛首页</Link></li>
              <li><Link href="/rules" className="hover:text-blue-400">社区规则</Link></li>
              <li><Link href="/map" className="hover:text-blue-400">实时地图</Link></li>
              <li><Link href="/login" className="hover:text-blue-400">下载客户端 (即将推出)</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">条款与政策</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/privacy" className="hover:text-blue-400">隐私政策 (Privacy)</Link></li>
              <li><Link href="/terms" className="hover:text-blue-400">服务条款 (Terms of Service)</Link></li>
              <li><Link href="/code-of-conduct" className="hover:text-blue-400">行为准则 (Code of Conduct)</Link></li>
              <li><Link href="#" className="hover:text-blue-400">平台状态 (Status)</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">支持我们</h4>
            <p className="text-sm text-gray-400 mb-4">
              如果您喜欢我们的工作，并希望支持服务器的日常维护，请考虑成为赞助人。
            </p>
            <button className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-bold text-sm transition">
              成为赞助人
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 border-t border-gray-800/50 pt-6 flex flex-col md:flex-row justify-between items-center text-xs text-gray-600">
          <p>© {new Date().getFullYear()} Road Cruise Transport MP. 版权所有.</p>
          <div className="flex space-x-4 mt-4 md:mt-0">
            <Link href="/privacy" className="hover:text-gray-300">隐私政策</Link>
            <span>|</span>
            <Link href="/terms" className="hover:text-gray-300">服务条款</Link>
            <span>|</span>
            <Link href="/code-of-conduct" className="hover:text-gray-300">行为准则</Link>
            <span>|</span>
            <Link href="/rules" className="hover:text-gray-300">社区规则</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}