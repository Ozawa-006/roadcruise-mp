// app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../components/Navbar';
import Link from 'next/link';
import { plainTextExcerpt } from '@/lib/rich-text';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** 首页轮播读取的「官方公告」字段（announcements 表） */
type Announcement = {
  id: number | string;
  title: string | null;
  content: string | null;
  type: string | null;
  image_url: string | null;
  link_url: string | null;
  created_at: string | null;
};

/** 轮播摘要长度：保持 2 行以内 */
const ANNOUNCEMENT_SUMMARY_LENGTH = 100;

/** 公告创建时间统一按中文环境展示 */
function formatAnnouncementTime(value: string | null): string {
  if (!value) return '时间待定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待定';
  return date.toLocaleString('zh-CN');
}

/** 首页「VTC Events」卡片使用的最小活动字段（含报名人数） */
type UpcomingEvent = {
  id: number;
  title: string;
  start_at: string;
  location: string | null;
  server_id: string | null;
  capacity: number | null;
  registered_count: number;
};

export default function Home() {
  const [latestAnnouncements, setLatestAnnouncements] = useState<Announcement[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [stats, setStats] = useState({ users: 0, vtc: 0, events: 0, team: 0 });
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      // 1. 获取最新官方公告（与 /news、后台 /admin/news 使用同一数据源）
      const { data: announcementData, error: announcementError } = await supabase
        .from('announcements')
        .select('id,title,content,type,image_url,link_url,created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      if (!announcementError && announcementData) {
        setLatestAnnouncements(announcementData as Announcement[]);
      }

      // 2. 获取统计数据
      const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: teamCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('role_level', 40);
      const { count: vtcCount } = await supabase.from('vtcs').select('*', { count: 'exact', head: true });
      const { count: eventCount } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'published');
      
      setStats({
        users: userCount || 0,
        vtc: vtcCount || 0, 
        events: eventCount || 0, 
        team: teamCount || 0
      });
    };
    fetchData();
  }, []);

  // 首页活动区块：已发布且尚未开始的最近 3 场活动 + 公开报名人数。
  // 失败时静默保留空数组，由 UI 显示占位文案，不白屏。
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('id, title, start_at, location, server_id, capacity')
          .eq('status', 'published')
          .gte('start_at', new Date().toISOString())
          .order('start_at', { ascending: true })
          .limit(3);

        if (eventsError || !eventsData || eventsData.length === 0) return;

        const eventIds = eventsData.map((event: any) => event.id);
        const { data: countsData } = await supabase
          .from('event_registration_counts')
          .select('event_id, registered_count')
          .in('event_id', eventIds);

        const countMap = new Map<string, number>();
        for (const row of countsData ?? []) {
          countMap.set(String(row.event_id), Number(row.registered_count) || 0);
        }

        setUpcomingEvents(
          eventsData.map((event: any) => ({
            id: Number(event.id),
            title: event.title,
            start_at: event.start_at,
            location: event.location ?? null,
            server_id: event.server_id ?? null,
            capacity: event.capacity ?? null,
            registered_count: countMap.get(String(event.id)) ?? 0,
          }))
        );
      } catch {
        // 静默失败：保留空数组
      }
    };
    fetchEvents();
  }, []);

  // 🌟 5秒自动轮播
  useEffect(() => {
    if (latestAnnouncements.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % latestAnnouncements.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [latestAnnouncements.length]);

  const nextSlide = () => {
    if (latestAnnouncements.length > 0) setCurrentIndex((prev) => (prev + 1) % latestAnnouncements.length);
  };
  const prevSlide = () => {
    if (latestAnnouncements.length > 0) setCurrentIndex((prev) => (prev - 1 + latestAnnouncements.length) % latestAnnouncements.length);
  };

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      {/* 🌟 第一区块：完美融合TMP风格的大屏幕轮播图 */}
      <section className="relative w-full h-[65vh] md:h-[75vh] bg-black overflow-hidden group">
        
        {latestAnnouncements.length === 0 ? (
          // 兜底：没有新闻的时候
          <div className="absolute inset-0 flex items-center justify-center">
            <img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover -z-20" alt="Background" />
            <div className="absolute inset-0 bg-black/60 -z-10"></div>
            <div className="text-center flex flex-col items-center z-10 px-4">
              <h1 className="text-4xl md:text-6xl font-black text-white mb-6 drop-shadow-lg">Road Cruise Transport MP</h1>
              <Link href="/login" className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-3 rounded-lg font-bold text-lg transition shadow-xl">Join today!</Link>
            </div>
          </div>
        ) : (
          // 有新闻数据时，渲染轮播
          <>
            {/* 背景图层 */}
            {latestAnnouncements.map((item, index) => (
              <div
                key={`bg-${item.id}`}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  index === currentIndex ? 'opacity-100 z-0' : 'opacity-0 z-0'
                }`}
              >
                <img 
                  src={item.image_url || 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop'} 
                  className="w-full h-full object-cover"
                  alt={item.title?.trim() || '官方公告配图'}
                />
                <div className="absolute inset-0 bg-black/60"></div>
              </div>
            ))}

            {/* 内容区：左右分栏 */}
            <div className="relative z-10 w-full h-full max-w-7xl mx-auto px-6 md:px-10 flex flex-col md:flex-row items-center justify-between pointer-events-none">
              
              {/* 左侧：固定的卖点列表 */}
              <div className="w-full md:w-1/2 text-white space-y-4 mb-10 md:mb-0 pointer-events-auto">
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

              {/* 右侧：动态轮播的官方公告 */}
              <div className="w-full md:w-1/2 flex flex-col items-center md:items-start justify-center text-center md:text-left h-64 md:h-[21rem] relative pointer-events-auto">
                {latestAnnouncements.map((item, index) => {
                  const typeLabel = item.type?.trim() || '公告';
                  const title = item.title?.trim() || '未命名公告';
                  const summary = item.content
                    ? plainTextExcerpt(item.content, ANNOUNCEMENT_SUMMARY_LENGTH)
                    : '';
                  const publishedAt = formatAnnouncementTime(item.created_at);

                  return (
                    <div
                      key={`content-${item.id}`}
                      className={`absolute inset-0 flex flex-col justify-center transition-all duration-1000 ease-in-out ${
                        index === currentIndex ? 'opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-4 z-0 pointer-events-none'
                      }`}
                    >
                      <div className="mb-2 md:mb-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                        <span className="text-blue-500 font-bold tracking-widest uppercase text-sm">Road Cruise News</span>
                        <span className="rounded border border-blue-500/40 bg-blue-500/15 px-2.5 py-0.5 text-xs font-bold text-blue-300">
                          {typeLabel}
                        </span>
                      </div>
                      <h1 className="text-xl md:text-3xl lg:text-4xl font-black text-white mb-2 md:mb-3 drop-shadow-lg leading-tight line-clamp-2">
                        <Link href={`/news/${item.id}`} className="transition hover:text-blue-200">
                          {title}
                        </Link>
                      </h1>
                      {summary && (
                        <p className="mb-2 md:mb-3 max-w-xl text-sm md:text-base text-gray-300 leading-5 md:leading-6 line-clamp-2">
                          {summary}
                        </p>
                      )}
                      <p className="mb-2 md:mb-4 text-xs text-gray-400">发布于 {publishedAt}</p>
                      <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                        <Link
                          href={`/news/${item.id}`}
                          className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-6 md:px-8 py-2 md:py-3 rounded-md font-bold text-sm md:text-base transition shadow-lg transform hover:scale-105"
                        >
                          阅读全文
                        </Link>
                        <Link
                          href="/news"
                          className="text-sm font-bold text-gray-300 hover:text-white transition"
                        >
                          查看更多公告 →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* 🌟 TMP风格的左右切换大箭头 */}
            {latestAnnouncements.length > 1 && (
              <>
                <button 
                  onClick={prevSlide}
                  className="absolute left-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-r from-black/50 to-transparent hover:from-black/80 text-white flex items-center justify-start pl-4 z-20 transition-all duration-300 opacity-60 hover:opacity-100"
                >
                  <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button 
                  onClick={nextSlide}
                  className="absolute right-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-l from-black/50 to-transparent hover:from-black/80 text-white flex items-center justify-end pr-4 z-20 transition-all duration-300 opacity-60 hover:opacity-100"
                >
                  <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>

                {/* 底部小圆点指示器 */}
                <div className="absolute bottom-8 left-0 right-0 flex justify-center space-x-3 z-20">
                  {latestAnnouncements.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentIndex(index)}
                      className={`w-3 h-3 rounded-full transition-all duration-300 ${
                        index === currentIndex ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* 第二区块：VTC Events */}
      <section className="py-16 bg-[#111111] border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="w-1.5 h-6 bg-blue-500 block"></span>
              VTC Events
            </h2>
            <Link href="/events" className="text-sm text-blue-400 hover:text-blue-300 transition">
              查看全部活动 →
            </Link>
          </div>
          
          {upcomingEvents.length === 0 ? (
            <div className="bg-[#2c2d31] border border-gray-700 rounded-lg p-8 text-center shadow-lg">
              <Link href="/events" className="text-sm text-gray-400 hover:text-blue-400 transition">
                暂无即将开始的活动，去活动页看看 →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {upcomingEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="bg-[#2c2d31] border border-gray-700 p-5 rounded-lg hover:border-blue-500 transition shadow-lg flex flex-col justify-between"
                >
                  <div>
                    <h3 className="text-lg font-bold text-white mb-3 line-clamp-2">{event.title}</h3>
                    <div className="space-y-2 text-sm text-gray-400">
                      <p className="flex items-start gap-2">
                        <span className="text-blue-400">🕒</span>
                        <span>{new Date(event.start_at).toLocaleString('zh-CN')}</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-blue-400">📍</span>
                        <span>{event.location || '地点待定'}</span>
                      </p>
                      {event.server_id && (
                        <p className="flex items-start gap-2">
                          <span className="text-blue-400">🖥️</span>
                          <span>服务器：{event.server_id}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-4 pt-4 border-t border-gray-700/50">
                    <span>报名</span>
                    <span className="text-orange-400 font-mono">
                      {event.capacity
                        ? `${event.registered_count} / ${event.capacity}`
                        : `${event.registered_count} 人`}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
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
              <li><Link href="/news" className="hover:text-blue-400">新闻公告</Link></li>
              <li><Link href="/team" className="hover:text-blue-400">团队成员</Link></li>
              <li><Link href="/changelog" className="hover:text-blue-400">更新日志</Link></li>
              <li><Link href="/rules" className="hover:text-blue-400">社区规则</Link></li>
              <li><Link href="/map" className="hover:text-blue-400">实时地图</Link></li>
              <li><Link href="/reports" className="hover:text-blue-400">举报与申诉</Link></li>
              <li><Link href="/support" className="hover:text-blue-400">帮助中心</Link></li>
              <li><Link href="/download" className="hover:text-blue-400">客户端下载</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">条款与政策</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/privacy" className="hover:text-blue-400">隐私政策 (Privacy)</Link></li>
              <li><Link href="/terms" className="hover:text-blue-400">服务条款 (Terms of Service)</Link></li>
              <li><Link href="/code-of-conduct" className="hover:text-blue-400">行为准则 (Code of Conduct)</Link></li>
              <li><Link href="/servers" className="hover:text-blue-400">服务器状态 (Status)</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">支持我们</h4>
            <p className="text-sm text-gray-400 mb-4">
              如果您喜欢我们的工作，并希望支持服务器的日常维护，欢迎联系我们。
            </p>
            <Link
              href="/forum/3"
              className="inline-block bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-bold text-sm transition"
            >
              联系我们
            </Link>
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