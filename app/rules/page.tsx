// app/rules/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Link from 'next/link';
import { canEditRules, levelOf } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function RulesPage() {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 🌟 新增：用于存储当前用户的权限等级
  const [currentUserLevel, setCurrentUserLevel] = useState<number>(0);

  useEffect(() => {
    const fetchRules = async () => {
      // 0. 获取当前用户权限（用于控制编辑按钮显示，只依据 role_level）
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role_level').eq('id', user.id).single();
        setCurrentUserLevel(levelOf(profile?.role_level));
      }

      // 1. 拉取已发布的条款
      const { data } = await supabase
        .from('rules_articles')
        .select('*')
        .eq('status', 'published')
        .order('section', { ascending: true })
        .order('article_number', { ascending: true });
      
      if (data) setArticles(data);
      setLoading(false);
    };
    fetchRules();
  }, []);

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">加载规则中...</div>;

  // 按章节 (section) 将条款分组
  const groupedArticles = articles.reduce((acc: Record<string, any[]>, article: any) => {
    if (!acc[article.section]) acc[article.section] = [];
    acc[article.section].push(article);
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8">
        {/* 页面头部 */}
        <div className="mb-8 border-b border-gray-700 pb-4 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">社区规则</h1>
            <p className="text-gray-500 text-sm">
              最后更新时间：{articles.length > 0 ? new Date(articles[0].updated_at).toLocaleString() : '暂无更新'}
            </p>
          </div>
          
          {/* 🌟 核心逻辑：只有高级社区经理 (Lv.90) 及以上才能看到编辑入口 */}
          {canEditRules(currentUserLevel) && (
            <Link 
              href="/admin/rules" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold transition shadow-lg flex items-center gap-2 text-sm whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              编辑规则
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* 左侧目录导航 (仅在桌面端显示) */}
          <div className="lg:col-span-1 hidden lg:block">
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-4 sticky top-8 shadow-lg">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">目录索引</h3>
              <ul className="space-y-2 text-sm">
                {Object.keys(groupedArticles).map(section => (
                  <li key={section}>
                    <a 
                      href={`#${section.replace(/\s+/g, '-')}`} 
                      className="block text-gray-400 hover:text-blue-400 hover:bg-[#3a3b40] px-2 py-1.5 rounded transition"
                    >
                      {section}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 右侧具体规则内容 */}
          <div className="lg:col-span-3 space-y-8">
            {Object.entries(groupedArticles).map(([section, sectionArticles]: [string, any[]]) => (
              <div 
                key={section} 
                id={section.replace(/\s+/g, '-')} 
                className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg overflow-hidden scroll-mt-24"
              >
                {/* 章节标题 */}
                <div className="bg-[#232428] px-6 py-3 border-b border-gray-700">
                  <h2 className="text-xl font-bold text-white">{section}</h2>
                </div>
                
                {/* 章节内的具体条款 */}
                <div className="p-6 space-y-6">
                  {sectionArticles.map((article: any) => (
                    <div key={article.id} className="border-b border-gray-700/50 pb-5 last:border-0 last:pb-0">
                      <h3 className="text-lg font-bold text-blue-400 mb-2">
                        {article.article_number} - {article.title}
                      </h3>
                      <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap mb-3">
                        {article.content}
                      </p>
                      {/* 如果有处罚说明，则显示红色标签 */}
                      {article.penalty && (
                        <div className="bg-red-900/20 border border-red-900/50 text-red-400 text-xs px-3 py-1.5 rounded inline-block font-bold">
                          ⚠️ 处罚：{article.penalty}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* 如果没有任何规则 */}
            {articles.length === 0 && (
              <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-10 text-center shadow-lg">
                <p className="text-gray-500">暂时没有发布任何规则。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}