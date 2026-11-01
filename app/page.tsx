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

  useEffect(() => {
    const fetchData = async () => {
      // 1. 获取最新官方公告
      const { data: topics } = await supabase
        .from('forum_topics')
        .select(`
          id, title, category_id, created_at, replies_count,
          profiles:author_id (display_name)
        `)
        .eq('category_id', 1)
        .order('created_at', { ascending: false })
        .limit(3);
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

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      {/* 🌟 第一区块：首屏大图与卖点 */}
      <section className="relative h-[70vh] flex items-center bg-[url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
        <div className="absolute inset-0 bg-black/60 z-0"></div>
        
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 md:px-10 flex flex-col md:flex-row items-center justify-between">
          {/* 左侧卖点列表 */}
          <div className="text-white space-y-4 mb-10 md:mb-0">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="w-2 h-6 bg-blue-500 inline-block"></span> 
              为什么加入我们？
            </h2>
            <ul className="space-y-3 text-lg">
              <li className="flex items-center gap-3"><span className="text-blue-500">✔</span> 成千上万的活跃玩家</li>
              <li className="flex items-center gap-3"><span className="text-blue-500">✔</span> 强力公平的游戏审核团队</li>
              <li className="flex items-center gap-3"><span className="text-blue-500">✔</span> 专属且稳定的服务器体验</li>
              <li className="flex items-center gap-3"><span className="text-blue-500">✔</span> 伟大且友好的社区氛围</li>
              <li className="flex items-center gap-3"><span className="text-blue-500">✔</span> 现在，只差你了！</li>
            </ul>
          </div>

          {/* 右侧 CTA 按钮 */}
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-black text-white mb-6 drop-shadow-lg">
              Road Cruise Transport MP
            </h1>
            <Link 
              href="/login" 
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-lg font-bold text-xl transition shadow-xl hover:scale-105"
            >
              今天就加入吧！
            </Link>
          </div>
        </div>
      </section>

      {/* 🌟 第二区块：最新消息 (按要求提前) */}
      <section className="py-16 bg-[#111111] border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-4">
            <h2 className="text-2xl font-bold text-white">最新消息</h2>
            <Link href="/forum/1" className="text-sm text-blue-400 hover:text-blue-300 transition">
              前往论坛查看全部 →
            </Link>
          </div>
          
          {latestTopics.length === 0 ? (
            <p className="text-gray-500 text-center py-6">暂无官方动态。</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {latestTopics.map((item) => (
                <Link 
                  key={item.id}
                  href={`/forum/${item.category_id}/${item.id}`}
                  className="bg-[#2c2d31] border border-gray-700 p-5 rounded-lg hover:border-blue-500 hover:bg-[#3a3b40] transition group shadow-lg"
                >
                  <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition line-clamp-2 mb-3">
                    {item.title}
                  </h3>
                  <div className="flex justify-between text-xs text-gray-500 mt-4">
                    <span>{item.profiles?.display_name || '官方'}</span>
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 🌟 第三区块：我们的服务 (按要求第二位) */}
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

      {/* 🌟 第四区块：数据统计 (按要求第三位) */}
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

      {/* 🌟 第五区块：终极页脚 */}
      <footer className="bg-[#0a0a0a] pt-16 pb-8 mt-auto">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          
          {/* Logo 与 简介 */}
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="text-2xl font-black italic bg-clip-text text-transparent bg-gradient-to-r from-white to-red-500 inline-block mb-4">
              Road Cruise Transport MP
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed">
              我们是一个充满热情的 ETS2 社区，致力于提供真实的联运体验和难忘的旅程。
            </p>
          </div>

          {/* 有用链接 */}
          <div>
            <h4 className="text-white font-bold mb-4">有用链接</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/forum" className="hover:text-blue-400">论坛首页</Link></li>
              <li><Link href="/rules" className="hover:text-blue-400">社区规则</Link></li>
              <li><Link href="/map" className="hover:text-blue-400">实时地图</Link></li>
              <li><Link href="/login" className="hover:text-blue-400">下载客户端 (即将推出)</Link></li>
            </ul>
          </div>

          {/* 法律与隐私 */}
          <div>
            <h4 className="text-white font-bold mb-4">条款与政策</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/privacy" className="hover:text-blue-400">隐私政策 (Privacy)</Link></li>
              <li><Link href="/terms" className="hover:text-blue-400">服务条款 (Terms of Service)</Link></li>
              <li><Link href="/code-of-conduct" className="hover:text-blue-400">行为准则 (Code of Conduct)</Link></li>
              <li><Link href="#" className="hover:text-blue-400">平台状态 (Status)</Link></li>
            </ul>
          </div>

          {/* 支持与赞助 */}
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

        {/* 底部版权栏 */}
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