// app/forum/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Navbar from '../../../components/Navbar';
import Link from 'next/link';
import { canManageAnnouncements, levelOf } from '@/lib/permissions';
import { useLocale, useTr } from '@/components/I18nProvider';
import { plainTextExcerpt } from '@/lib/rich-text';
import type { Locale } from '@/lib/i18n';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAGE_SIZE = 10;

/** 官方公告版块固定只读展示最近 20 条 announcements。 */
const OFFICIAL_CATEGORY_ID = '1';
const ANNOUNCEMENT_LIMIT = 20;
const ANNOUNCEMENT_SUMMARY_LENGTH = 120;

/** 双语字段取值：英文界面且英文字段非空时用英文，否则回退中文。 */
function localizedText(
  locale: Locale,
  en: string | null | undefined,
  zh: string | null | undefined
): string {
  const english = en?.trim();
  if (locale === 'en' && english) return english;
  return zh ?? '';
}

/** 版块行（forum_categories）；name_en / description_en 为空时回退中文。 */
interface CategoryRow {
  id: number;
  name: string | null;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
}

/** PostgREST 多对一嵌入既可能返回对象也可能返回数组。 */
type TopicProfiles =
  | { display_name: string | null }
  | { display_name: string | null }[]
  | null;

/** 统一取嵌入作者昵称：数组取第一条，缺失返回 null。 */
function topicAuthorName(profiles: TopicProfiles | undefined): string | null {
  if (!profiles) return null;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return profile?.display_name ?? null;
}

/** 帖子列表行（forum_topics + profiles 嵌入）；title_en 为空时回退中文标题。 */
interface TopicRow {
  id: number;
  title: string;
  title_en: string | null;
  created_at: string;
  replies_count: number | null;
  profiles?: TopicProfiles;
}

/** 公告列表行（announcements）；title_en / content_en 为空时回退中文。 */
interface AnnouncementRow {
  id: number;
  title: string | null;
  title_en: string | null;
  content: string | null;
  content_en: string | null;
  type: string | null;
  created_at: string | null;
}

/** 公告类型徽章配色（与 /news 列表保持一致）。 */
function announcementBadgeClass(type: string): string {
  if (type === '新闻') {
    return 'border-orange-500/40 bg-orange-500/15 text-orange-300';
  }
  if (type === '更新') {
    return 'border-purple-500/40 bg-purple-500/15 text-purple-300';
  }
  if (type === '活动') {
    return 'border-green-500/40 bg-green-500/15 text-green-300';
  }
  if (type === '公告') {
    return 'border-blue-500/40 bg-blue-500/15 text-blue-300';
  }
  return 'border-gray-600 bg-gray-500/10 text-gray-300';
}

/** 公告发布时间：非法或缺失时显示占位符。 */
function formatDateTime(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '——';
  return date.toLocaleString();
}

/** 英文文案表（中文原文为 key）：只覆盖静态 UI，版块名/简介与昵称不翻译。 */
const EN: Record<string, string> = {
  // ---- 页面状态 ----
  '加载中...': 'Loading...',
  '版块不存在': 'Board not found',

  // ---- 面包屑与页头 ----
  'CRT MP 论坛': 'CRT MP Forum',
  '发布新帖': 'New Post',

  // ---- 空状态 ----
  '这个版块还没有帖子，快来抢沙发吧！': 'No posts in this board yet. Be the first to post!',

  // ---- 帖子列表 ----
  '由': 'By',
  '发表于': 'on',
  '未知玩家': 'Unknown player',
  '{n} 回复': '{n} replies',

  // ---- 分页 ----
  '上一页': 'Previous',
  '下一页': 'Next',
  '第 {n} / {total} 页': 'Page {n} / {total}',

  // ---- 官方公告版块（category_id = 1，只读展示 announcements） ----
  '官方公告由后台发布': 'Official announcements are published from the admin console',
  '全部新闻': 'All news',
  '查看更多新闻': 'More news',
  '发布公告': 'Publish announcement',
  '暂无官方公告': 'No official announcements yet',
  '官方公告发布后会显示在这里。':
    'Official announcements will appear here once they are published.',
  '内容加载失败，请稍后重试': 'Failed to load. Please try again later.',
  '重新加载': 'Reload',
  '未命名公告': 'Untitled announcement',
  '暂无正文内容。': 'No content yet.',
  '公告': 'Announcement',
  '更新': 'Update',
  '新闻': 'News',
  '活动': 'Event',
};

export default function CategoryPage() {
  const tr = useTr(EN);
  const locale = useLocale();
  const { id } = useParams();
  const categoryId = Array.isArray(id) ? id[0] : id;
  const isOfficialBoard = String(categoryId) === OFFICIAL_CATEGORY_ID;

  const [category, setCategory] = useState<CategoryRow | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listFailed, setListFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // 🌟 新增：用于存储当前用户的权限等级
  const [currentUserLevel, setCurrentUserLevel] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setListLoading(true);
      setListFailed(false);

      // 0. 获取当前登录用户的权限等级（只依据 profile.role_level）
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role_level').eq('id', user.id).single();
        if (cancelled) return;
        setCurrentUserLevel(levelOf(profile?.role_level));
      } else {
        setCurrentUserLevel(0);
      }

      // 1. 获取版块信息（含英文字段，英文界面优先显示）
      const { data: catData } = await supabase
        .from('forum_categories')
        .select('id, name, name_en, description, description_en')
        .eq('id', categoryId)
        .single();
      if (cancelled) return;
      setCategory((catData ?? null) as CategoryRow | null);
      setCategoryLoading(false);

      if (isOfficialBoard) {
        // 2a. 官方公告版块：只读展示 announcements，不再查询 forum_topics。
        const { data, error } = await supabase
          .from('announcements')
          .select('id,title,title_en,content,content_en,type,created_at')
          .order('created_at', { ascending: false })
          .limit(ANNOUNCEMENT_LIMIT);
        if (cancelled) return;

        if (error) {
          console.error('加载官方公告失败:', error);
          setAnnouncements([]);
          setListFailed(true);
        } else {
          setAnnouncements((data ?? []) as AnnouncementRow[]);
        }
      } else {
        // 2b. 其它版块：保持原有 forum_topics 逻辑（计数 + 分页）。
        const { count } = await supabase
          .from('forum_topics')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', categoryId);
        if (cancelled) return;
        setTotalCount(count ?? 0);

        const from = (currentPage - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from('forum_topics')
          .select(`id, title, title_en, created_at, replies_count, profiles:author_id (display_name)`)
          .eq('category_id', categoryId)
          .order('created_at', { ascending: false })
          .range(from, to);
        if (cancelled) return;

        if (error) {
          console.error('加载版块帖子失败:', error);
          setTopics([]);
          setListFailed(true);
        } else {
          setTopics((data ?? []) as TopicRow[]);
        }
      }

      if (!cancelled) setListLoading(false);
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [categoryId, isOfficialBoard, currentPage, reloadToken]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (categoryLoading) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">{tr('加载中...')}</div>;
  if (!category) return <div className="min-h-screen bg-[#18191c] text-white flex justify-center items-center">{tr('版块不存在')}</div>;

  // 版块名称 / 简介：英文界面优先英文字段，缺失回退中文。
  const categoryName = localizedText(locale, category.name_en, category.name);
  const categoryDescription = localizedText(locale, category.description_en, category.description);
  const canPublishAnnouncement = canManageAnnouncements(currentUserLevel);
  const retry = () => setReloadToken((value) => value + 1);

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />

      <div className="w-full h-40 relative bg-[url('https://images.unsplash.com/photo-1592838064575-70ed626d3a0e?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-transparent"></div>
        <div className="absolute inset-0 flex flex-col justify-center max-w-5xl mx-auto w-full px-4 md:px-8">
          <div className="text-sm text-gray-400 mb-2">
            <Link href="/forum" className="hover:text-white transition">{tr('CRT MP 论坛')}</Link>
            <span className="mx-2">/</span>
            <span className="text-white font-bold">{categoryName}</span>
          </div>
          <h1 className="text-4xl font-black text-white drop-shadow-lg">{categoryName}</h1>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
        <div className="flex flex-col justify-between gap-3 mb-6 bg-[#2c2d31] p-4 rounded-lg border border-gray-700 shadow-lg md:flex-row md:items-center">
          <p className="text-gray-400 text-sm">{categoryDescription}</p>

          {isOfficialBoard ? (
            // 🌟 官方公告版块只读：公告由后台 /admin/news 发布，不再提供版块发帖入口。
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <span className="text-xs text-gray-500">{tr('官方公告由后台发布')}</span>
              <Link
                href="/news"
                className="bg-[#232428] hover:bg-[#3a3b40] border border-gray-600 text-gray-200 px-4 py-2 rounded text-sm font-bold transition"
              >
                {tr('全部新闻')}
              </Link>
              {canPublishAnnouncement && (
                <Link
                  href="/admin/news"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-bold transition shadow-lg flex items-center gap-2"
                >
                  <span>+</span> {tr('发布公告')}
                </Link>
              )}
            </div>
          ) : (
            <Link href={`/forum/${categoryId}/new`} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-bold transition shadow-lg flex items-center gap-2 shrink-0">
              <span>+</span> {tr('发布新帖')}
            </Link>
          )}
        </div>

        <div className="space-y-2">
          {listLoading ? (
            <div className="text-center text-gray-500 py-10 bg-[#2c2d31] rounded border border-gray-700">
              {tr('加载中...')}
            </div>
          ) : listFailed ? (
            <div className="text-center py-10 bg-[#2c2d31] rounded border border-red-900/60">
              <p className="text-sm font-bold text-white">{tr('内容加载失败，请稍后重试')}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-3 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold transition"
              >
                {tr('重新加载')}
              </button>
            </div>
          ) : isOfficialBoard ? (
            announcements.length === 0 ? (
              <div className="text-center py-10 bg-[#2c2d31] rounded border border-gray-700">
                <p className="text-gray-400">{tr('暂无官方公告')}</p>
                <p className="mt-1 text-xs text-gray-500">{tr('官方公告发布后会显示在这里。')}</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {announcements.map((item) => {
                    const isEnglish = locale === 'en';
                    const type = item.type?.trim() || '公告';
                    const title = isEnglish
                      ? item.title_en?.trim() || item.title?.trim() || tr('未命名公告')
                      : item.title?.trim() || tr('未命名公告');
                    // 英文界面优先英文正文；缺失时回退中文正文，仍按纯文本摘要展示。
                    const contentSource = isEnglish
                      ? item.content_en?.trim() || item.content
                      : item.content;
                    const summary = contentSource
                      ? plainTextExcerpt(contentSource, ANNOUNCEMENT_SUMMARY_LENGTH)
                      : '';

                    return (
                      <Link
                        key={item.id}
                        href={`/news/${item.id}`}
                        className="group flex items-start justify-between gap-4 bg-[#2c2d31] border border-gray-700 p-4 rounded-md hover:border-blue-500 hover:bg-[#323338] transition shadow-sm"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-bold ${announcementBadgeClass(type)}`}>
                              {tr(type)}
                            </span>
                            <time className="text-xs text-gray-500" dateTime={item.created_at ?? undefined}>
                              {formatDateTime(item.created_at)}
                            </time>
                          </div>
                          <h3 className="mt-2 text-lg font-bold text-white group-hover:text-blue-400 transition">{title}</h3>
                          <p className="mt-1 text-sm leading-6 text-gray-400 line-clamp-2">
                            {summary || tr('暂无正文内容。')}
                          </p>
                        </div>
                        <span className="mt-1 shrink-0 text-sm text-gray-600 group-hover:text-blue-400 transition" aria-hidden="true">
                          →
                        </span>
                      </Link>
                    );
                  })}
                </div>

                <div className="pt-4 text-center">
                  <Link
                    href="/news"
                    className="inline-flex items-center gap-1 text-sm font-bold text-blue-400 hover:text-blue-300 transition"
                  >
                    {tr('查看更多新闻')} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </>
            )
          ) : topics.length === 0 ? (
            <div className="text-center text-gray-500 py-10 bg-[#2c2d31] rounded border border-gray-700">
              {tr('这个版块还没有帖子，快来抢沙发吧！')}
            </div>
          ) : (
            topics.map((topic) => (
              <Link
                key={topic.id}
                href={`/forum/${id}/${topic.id}`}
                className="flex items-center justify-between bg-[#2c2d31] border border-gray-700 p-4 rounded-md hover:border-blue-500 hover:bg-[#323338] transition group shadow-sm"
              >
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition">{localizedText(locale, topic.title_en, topic.title)}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {tr('由')} <span className="text-gray-300 font-bold">{topicAuthorName(topic.profiles) || tr('未知玩家')}</span> {tr('发表于')} {new Date(topic.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right text-sm text-gray-400">
                  <p>{tr('{n} 回复', { n: topic.replies_count || 0 })}</p>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* 分页仅用于 forum_topics 版块；官方公告版块固定最多 20 条。 */}
        {!isOfficialBoard && totalPages > 1 && (
          <div className="flex justify-center items-center mt-8 space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-[#2c2d31] border border-gray-700 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition"
            >
              {tr('上一页')}
            </button>
            <span className="text-gray-400 text-sm">
              {tr('第 {n} / {total} 页', { n: currentPage, total: totalPages })}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-[#2c2d31] border border-gray-700 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition"
            >
              {tr('下一页')}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
