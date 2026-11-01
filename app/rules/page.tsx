// app/rules/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Link from 'next/link';
import { canEditRules, levelOf } from '@/lib/permissions';
import { useLocale, useTr } from '@/components/I18nProvider';
import type { Locale } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// 英文文案：key 为中文原文，value 为英文译文；英文缺失时自动回退中文。
// 规则章节名 / 条款正文来自数据库，不在翻译范围内。
// ---------------------------------------------------------------------------
const EN: Record<string, string> = {
  // 加载 / 空状态
  '加载规则中...': 'Loading rules…',
  '暂时没有发布任何规则。': 'No rules have been published yet.',

  // 页面头部
  '社区规则': 'Community Rules',
  '编辑规则': 'Edit rules',
  '最后更新时间：{time}': 'Last updated: {time}',
  '暂无更新': 'No updates yet',

  // 侧边目录
  '目录索引': 'Index',

  // 条款处罚标签
  '⚠️ 处罚：{penalty}': '⚠️ Penalty: {penalty}',
};

/** 数据库中的中文章节名 → 英文标题；未匹配的章节回退原文。 */
const SECTION_EN: Record<string, string> = {
  '1. 社区总则': '1. Community Guidelines',
  '2. 游戏与联运': '2. Gameplay & Convoys',
  '3. 论坛与交流': '3. Forum & Communication',
  '4. 违规与处罚': '4. Violations & Penalties',
};

/** 英文模式优先英文，英文为空（或仅空白）时回退中文。 */
function localizedText(
  zh: string | null | undefined,
  en: string | null | undefined,
  locale: Locale
): string {
  if (locale === 'en' && en && en.trim() !== '') return en;
  return zh ?? '';
}

/** 英文模式下映射章节名；未匹配时保留数据库原文。 */
function localizedSection(section: string, locale: Locale): string {
  if (locale !== 'en') return section;
  return SECTION_EN[section] ?? section;
}

/** rules_articles 表中本页用到的字段（仅做类型标注，数据读取逻辑不变）。 */
type RuleArticle = {
  id: string | number;
  section: string;
  article_number: string | number;
  title: string;
  title_en: string | null;
  content: string;
  content_en: string | null;
  penalty: string | null;
  penalty_en: string | null;
  status: string;
  updated_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function RulesPage() {
  const tr = useTr(EN);
  const locale = useLocale();
  const [articles, setArticles] = useState<RuleArticle[]>([]);
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
        .select('id, section, article_number, title, title_en, content, content_en, penalty, penalty_en, status, updated_at')
        .eq('status', 'published')
        .order('section', { ascending: true })
        .order('article_number', { ascending: true });
      
      if (data) setArticles(data as RuleArticle[]);
      setLoading(false);
    };
    fetchRules();
  }, []);

  if (loading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">{tr('加载规则中...')}</div>;

  // 按章节 (section) 将条款分组
  const groupedArticles = articles.reduce<Record<string, RuleArticle[]>>((acc, article) => {
    if (!acc[article.section]) acc[article.section] = [];
    acc[article.section].push(article);
    return acc;
  }, {});

  // 最后更新时间来自数据库；未取到任何条款时展示占位文案。
  const updatedLabel =
    articles.length > 0
      ? new Date(articles[0].updated_at).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')
      : tr('暂无更新');

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />
      
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8">
        {/* 页面头部 */}
        <div className="mb-8 border-b border-gray-700 pb-4 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{tr('社区规则')}</h1>
            <p className="text-gray-500 text-sm">
              {tr('最后更新时间：{time}', { time: updatedLabel })}
            </p>
          </div>
          
          {/* 🌟 核心逻辑：只有高级社区经理 (Lv.90) 及以上才能看到编辑入口 */}
          {canEditRules(currentUserLevel) && (
            <Link 
              href="/admin/rules" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold transition shadow-lg flex items-center gap-2 text-sm whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              {tr('编辑规则')}
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* 左侧目录导航 (仅在桌面端显示) */}
          <div className="lg:col-span-1 hidden lg:block">
            <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-4 sticky top-8 shadow-lg">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">{tr('目录索引')}</h3>
              <ul className="space-y-2 text-sm">
                {Object.keys(groupedArticles).map(section => (
                  <li key={section}>
                    <a 
                      href={`#${section.replace(/\s+/g, '-')}`} 
                      className="block text-gray-400 hover:text-blue-400 hover:bg-[#3a3b40] px-2 py-1.5 rounded transition"
                    >
                      {localizedSection(section, locale)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 右侧具体规则内容 */}
          <div className="lg:col-span-3 space-y-8">
            {Object.entries(groupedArticles).map(([section, sectionArticles]) => (
              <div 
                key={section} 
                id={section.replace(/\s+/g, '-')} 
                className="bg-[#2c2d31] rounded-md border border-gray-700 shadow-lg overflow-hidden scroll-mt-24"
              >
                {/* 章节标题 */}
                <div className="bg-[#232428] px-6 py-3 border-b border-gray-700">
                  <h2 className="text-xl font-bold text-white">{localizedSection(section, locale)}</h2>
                </div>
                
                {/* 章节内的具体条款 */}
                <div className="p-6 space-y-6">
                  {sectionArticles.map((article) => {
                    const penaltyText = localizedText(article.penalty, article.penalty_en, locale);
                    return (
                      <div key={article.id} className="border-b border-gray-700/50 pb-5 last:border-0 last:pb-0">
                        <h3 className="text-lg font-bold text-blue-400 mb-2">
                          {article.article_number} - {localizedText(article.title, article.title_en, locale)}
                        </h3>
                        <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap mb-3">
                          {localizedText(article.content, article.content_en, locale)}
                        </p>
                        {/* 如果有处罚说明，则显示红色标签 */}
                        {penaltyText && (
                          <div className="bg-red-900/20 border border-red-900/50 text-red-400 text-xs px-3 py-1.5 rounded inline-block font-bold">
                            {tr('⚠️ 处罚：{penalty}', { penalty: penaltyText })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            
            {/* 如果没有任何规则 */}
            {articles.length === 0 && (
              <div className="bg-[#2c2d31] rounded-md border border-gray-700 p-10 text-center shadow-lg">
                <p className="text-gray-500">{tr('暂时没有发布任何规则。')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}