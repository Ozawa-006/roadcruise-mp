'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { roleLabel } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RESULT_LIMIT = 20;
const MEMBER_LIMIT = 10;
const SECTION_LIMIT = 5;

const TYPE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'topics', label: '帖子' },
  { value: 'members', label: '玩家' },
  { value: 'events', label: '活动' },
  { value: 'news', label: '新闻' },
  { value: 'vtcs', label: '车队' },
] as const;

type SearchType = (typeof TYPE_OPTIONS)[number]['value'];

interface EmbeddedProfile {
  display_name?: string | null;
}

interface TopicRow {
  id: number;
  title: string | null;
  category_id: number | null;
  created_at: string | null;
  profiles: EmbeddedProfile | EmbeddedProfile[] | null;
}

interface MemberRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  custom_id: string | null;
  random_id: string | null;
}

interface EventRow {
  id: number;
  title: string | null;
  start_at: string | null;
  capacity: number | null;
}

interface EventHit extends EventRow {
  registered: number;
}

interface NewsRow {
  id: number;
  title: string | null;
  created_at: string | null;
  type: string | null;
}

interface VtcRow {
  id: number;
  name: string | null;
  tag: string | null;
  description: string | null;
  is_recruiting: boolean | null;
}

function labelOf(type: SearchType): string {
  const found = TYPE_OPTIONS.find((option) => option.value === type);
  return found ? found.label : '全部';
}

function normalizeType(raw: string | null): SearchType {
  if (raw === 'vtc' || raw === 'vtcs') return 'vtcs';
  if (raw === 'announcement' || raw === 'announcements' || raw === 'news') return 'news';
  const found = TYPE_OPTIONS.find((option) => option.value === raw);
  return found ? found.value : 'all';
}

function typeHref(keyword: string, type: SearchType): string {
  const params = new URLSearchParams();
  const trimmed = keyword.trim();
  if (trimmed) params.set('q', trimmed);
  if (type !== 'all') params.set('type', type);
  const search = params.toString();
  return search ? `/search?${search}` : '/search';
}

function formatDate(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '——';
  return date.toLocaleDateString('zh-CN');
}

function formatDateTime(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '——';
  return date.toLocaleString('zh-CN');
}

function countOf(value: unknown): number {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function toCountMap(rows: unknown): Record<number, number> {
  const map: Record<number, number> = {};
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const id = Number(record.event_id);
    if (!Number.isFinite(id)) continue;
    map[id] = countOf(record.registered_count);
  }
  return map;
}

function authorName(profiles: TopicRow['profiles']): string {
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  const name = profile?.display_name?.trim();
  return name || '未知';
}

function SectionHeading({
  icon,
  title,
  accent,
  total,
  moreHref,
}: {
  icon: string;
  title: string;
  accent: string;
  total: number;
  moreHref?: string;
}) {
  return (
    <div className={`mb-4 flex flex-wrap items-center gap-2 border-l-4 pl-3 ${accent}`}>
      <h2 className="text-lg font-bold text-gray-300">
        {icon} {title}
      </h2>
      <span className="text-xs text-gray-500">共 {total} 条</span>
      {moreHref ? (
        <Link
          href={moreHref}
          className="ml-auto text-xs font-bold text-blue-400 transition hover:text-white"
        >
          查看更多 →
        </Link>
      ) : null}
    </div>
  );
}

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = searchParams.get('q') || '';
  const type = normalizeType(searchParams.get('type'));

  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [events, setEvents] = useState<EventHit[]>([]);
  const [news, setNews] = useState<NewsRow[]>([]);
  const [vtcs, setVtcs] = useState<VtcRow[]>([]);
  const [loading, setLoading] = useState(query.trim().length > 0);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const keyword = query.trim();

    const run = async () => {
      if (!keyword) {
        setTopics([]);
        setMembers([]);
        setEvents([]);
        setNews([]);
        setVtcs([]);
        setError(null);
        setLoading(false);
        return;
      }

      // 防止把用户输入直接拼进 PostgREST 的 .or() 过滤器语法（逗号/括号/通配符会改变表达式）
      const safeQuery = keyword.replace(/[%_,()]/g, ' ').trim();
      if (!safeQuery) {
        setTopics([]);
        setMembers([]);
        setEvents([]);
        setNews([]);
        setVtcs([]);
        setError('关键词只包含无效字符（% _ , ( )），请换一个关键词。');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const wantsTopics = type === 'all' || type === 'topics';
      const wantsMembers = type === 'all' || type === 'members';
      const wantsEvents = type === 'all' || type === 'events';
      const wantsNews = type === 'all' || type === 'news';
      const wantsVtcs = type === 'all' || type === 'vtcs';

      // 纯数字输入可能是 6 位专属 ID / 随机 ID
      const isNumeric = /^\d+$/.test(safeQuery);

      try {
        const topicsRequest = wantsTopics
          ? supabase
              .from('forum_topics')
              .select(
                `
                id, title, category_id, created_at,
                profiles:author_id (display_name)
              `
              )
              .or(`title.ilike.%${safeQuery}%,content.ilike.%${safeQuery}%`)
              .order('created_at', { ascending: false })
              .limit(RESULT_LIMIT)
          : null;

        const memberBase = supabase
          .from('profiles')
          .select('id, display_name, avatar_url, role, custom_id, random_id');

        const membersRequest = wantsMembers
          ? (isNumeric
              ? memberBase.or(
                  `display_name.ilike.%${safeQuery}%,custom_id.eq.${safeQuery},random_id.eq.${safeQuery}`
                )
              : memberBase.ilike('display_name', `%${safeQuery}%`)
            ).limit(MEMBER_LIMIT)
          : null;

        const eventsRequest = wantsEvents
          ? supabase
              .from('events')
              .select('id, title, start_at, capacity')
              .eq('status', 'published')
              .or(`title.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`)
              .order('start_at', { ascending: true })
              .limit(RESULT_LIMIT)
          : null;

        const newsRequest = wantsNews
          ? supabase
              .from('announcements')
              .select('id, title, type, created_at')
              .or(`title.ilike.%${safeQuery}%,content.ilike.%${safeQuery}%`)
              .order('created_at', { ascending: false })
              .limit(RESULT_LIMIT)
          : null;

        const vtcsRequest = wantsVtcs
          ? supabase
              .from('vtcs')
              .select('id, name, tag, description, is_recruiting')
              .or(
                `name.ilike.%${safeQuery}%,tag.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`
              )
              .limit(RESULT_LIMIT)
          : null;

        const [topicsResponse, membersResponse, eventsResponse, newsResponse, vtcsResponse] =
          await Promise.all([
            topicsRequest ?? Promise.resolve(null),
            membersRequest ?? Promise.resolve(null),
            eventsRequest ?? Promise.resolve(null),
            newsRequest ?? Promise.resolve(null),
            vtcsRequest ?? Promise.resolve(null),
          ]);

        if (cancelled) return;

        const errors: string[] = [];
        if (topicsResponse?.error) errors.push(`帖子：${topicsResponse.error.message}`);
        if (membersResponse?.error) errors.push(`玩家：${membersResponse.error.message}`);
        if (eventsResponse?.error) errors.push(`活动：${eventsResponse.error.message}`);
        if (newsResponse?.error) errors.push(`新闻：${newsResponse.error.message}`);
        if (vtcsResponse?.error) errors.push(`车队：${vtcsResponse.error.message}`);

        const topicRows = (topicsResponse?.data ?? []) as TopicRow[];
        const memberRows = (membersResponse?.data ?? []) as MemberRow[];
        const eventRows = (eventsResponse?.data ?? []) as EventRow[];
        const newsRows = (newsResponse?.data ?? []) as NewsRow[];
        const vtcRows = (vtcsResponse?.data ?? []) as VtcRow[];

        let countMap: Record<number, number> = {};
        if (eventRows.length > 0) {
          const { data: countData } = await supabase
            .from('event_registration_counts')
            .select('event_id,registered_count')
            .in(
              'event_id',
              eventRows.map((row) => Number(row.id))
            );
          if (cancelled) return;
          countMap = toCountMap(countData);
        }

        if (cancelled) return;

        setTopics(topicRows);
        setMembers(memberRows);
        setEvents(
          eventRows.map((row) => ({ ...row, registered: countMap[Number(row.id)] ?? 0 }))
        );
        setNews(newsRows);
        setVtcs(vtcRows);
        setError(errors.length > 0 ? errors.join('；') : null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('搜索失败:', err);
        setTopics([]);
        setMembers([]);
        setEvents([]);
        setNews([]);
        setVtcs([]);
        setError(err instanceof Error ? err.message : '搜索请求失败，请稍后重试。');
        setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [query, type, reloadToken]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const keyword = String(formData.get('keyword') ?? '').trim();
    if (!keyword) {
      router.push('/search');
      return;
    }
    router.push(typeHref(keyword, type));
  };

  const hasQuery = query.trim().length > 0;
  const showTopics = type === 'all' || type === 'topics';
  const showMembers = type === 'all' || type === 'members';
  const showEvents = type === 'all' || type === 'events';
  const showNews = type === 'all' || type === 'news';
  const showVtcs = type === 'all' || type === 'vtcs';

  const summary: string[] = [];
  if (showTopics) summary.push(`帖子 ${topics.length}`);
  if (showMembers) summary.push(`玩家 ${members.length}`);
  if (showEvents) summary.push(`活动 ${events.length}`);
  if (showNews) summary.push(`新闻 ${news.length}`);
  if (showVtcs) summary.push(`车队 ${vtcs.length}`);
  const total = topics.length + members.length + events.length + news.length + vtcs.length;

  const visibleTopics = type === 'all' ? topics.slice(0, SECTION_LIMIT) : topics;
  const visibleMembers = type === 'all' ? members.slice(0, SECTION_LIMIT) : members;
  const visibleEvents = type === 'all' ? events.slice(0, SECTION_LIMIT) : events;
  const visibleNews = type === 'all' ? news.slice(0, SECTION_LIMIT) : news;
  const visibleVtcs = type === 'all' ? vtcs.slice(0, SECTION_LIMIT) : vtcs;

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
      <div className="mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-2xl font-bold text-white">
          {hasQuery ? (
            <>
              搜索结果：<span className="text-blue-400">&quot;{query.trim()}&quot;</span>
            </>
          ) : (
            '全站搜索'
          )}
        </h1>
        <p className="text-xs text-gray-500 mt-2">
          {hasQuery
            ? `范围：${labelOf(type)} | 找到 ${summary.join(' · ')}`
            : '支持搜索帖子、玩家、活动、新闻与车队。'}
        </p>
      </div>

      {/* 搜索框：与导航栏保持同一深色胶囊风格，移动端也可直接改词 */}
      <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-3 md:flex-row">
        <div className="flex h-10 flex-1 items-center rounded-full border border-gray-700 bg-[#232428] px-4 transition focus-within:border-blue-500">
          <span className="text-sm text-gray-500">🔍</span>
          <input
            key={`${query}|${type}`}
            type="search"
            name="keyword"
            defaultValue={query}
            placeholder="搜索帖子、玩家、活动、新闻、车队…"
            className="h-full w-full bg-transparent px-2 text-sm text-white outline-none placeholder:text-gray-500"
            aria-label="搜索关键词"
          />
        </div>
        <button
          type="submit"
          className="rounded-full bg-blue-600 px-6 py-2 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          搜索
        </button>
      </form>

      {/* 类型切换：同步到 URL 的 ?type= */}
      <div className="mb-8 flex flex-wrap gap-2">
        {TYPE_OPTIONS.map((option) => {
          const active = option.value === type;
          return (
            <Link
              key={option.value}
              href={typeHref(query, option.value)}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full border px-4 py-1.5 text-xs font-bold transition ${
                active
                  ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                  : 'border-gray-700 bg-[#232428] text-gray-400 hover:border-gray-500 hover:text-white'
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      {!hasQuery ? (
        <div className="text-center py-20 bg-[#2c2d31] border border-gray-700 rounded-lg">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-gray-400">输入关键词开始搜索：帖子和新闻按标题/正文匹配，玩家支持昵称与专属 ID。</p>
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-gray-700 bg-[#2c2d31] p-10 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
          <p className="mt-4 text-sm text-gray-400">搜索中…</p>
        </div>
      ) : (
        <>
          {error ? (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-red-900/60 bg-[#2c2d31] px-4 py-3">
              <p className="text-sm text-red-300">{error}</p>
              <button
                type="button"
                onClick={() => setReloadToken((value) => value + 1)}
                className="ml-auto rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-bold text-gray-300 transition hover:border-blue-500 hover:text-white"
              >
                重试
              </button>
            </div>
          ) : null}

          {/* 帖子 */}
          {showTopics && visibleTopics.length > 0 ? (
            <div className="mb-10">
              <SectionHeading
                icon="📝"
                title="相关帖子"
                accent="border-blue-500"
                total={topics.length}
                moreHref={type === 'all' ? typeHref(query, 'topics') : undefined}
              />
              <div className="space-y-3">
                {visibleTopics.map((topic) => (
                  <Link
                    key={topic.id}
                    href={
                      topic.category_id
                        ? `/forum/${topic.category_id}/${topic.id}`
                        : '/forum'
                    }
                    className="block bg-[#2c2d31] border border-gray-700 p-4 rounded-lg hover:border-blue-500 transition group"
                  >
                    <h3 className="text-white font-bold text-base group-hover:text-blue-400 transition">
                      {topic.title || '（无标题）'}
                    </h3>
                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-gray-500">
                      <span>
                        版块 #{topic.category_id ?? '未知'} · 作者：{authorName(topic.profiles)}
                      </span>
                      <span>{formatDate(topic.created_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* 玩家 */}
          {showMembers && visibleMembers.length > 0 ? (
            <div className="mb-10">
              <SectionHeading
                icon="👥"
                title="相关玩家"
                accent="border-green-500"
                total={members.length}
                moreHref={type === 'all' ? typeHref(query, 'members') : undefined}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleMembers.map((member) => (
                  <Link
                    key={member.id}
                    href={`/profile/${member.id}`}
                    className="bg-[#2c2d31] border border-gray-700 p-4 rounded-lg flex items-center gap-4 hover:border-green-500 transition group"
                  >
                    <div className="w-12 h-12 shrink-0 rounded-full bg-[#18191c] overflow-hidden border border-gray-600">
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url}
                          alt={member.display_name || '玩家头像'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl font-bold text-gray-500">
                          {(member.display_name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-white font-bold group-hover:text-green-400 transition">
                        {member.display_name || '未命名玩家'}
                      </p>
                      <p className="text-xs text-blue-400">
                        ID: {member.custom_id || member.random_id || '无'}
                      </p>
                      {member.role ? (
                        <p className="mt-1 inline-flex rounded border border-gray-600 bg-[#232428] px-1.5 py-0.5 text-[11px] text-gray-400">
                          {roleLabel(member.role, null)}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* 活动 */}
          {showEvents && visibleEvents.length > 0 ? (
            <div className="mb-10">
              <SectionHeading
                icon="🗓️"
                title="相关活动"
                accent="border-orange-500"
                total={events.length}
                moreHref={type === 'all' ? typeHref(query, 'events') : undefined}
              />
              <div className="space-y-3">
                {visibleEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="block bg-[#2c2d31] border border-gray-700 p-4 rounded-lg hover:border-orange-500 transition group"
                  >
                    <h3 className="text-white font-bold text-base group-hover:text-orange-400 transition">
                      {event.title || '（无标题活动）'}
                    </h3>
                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-gray-500">
                      <span>🕒 {formatDateTime(event.start_at)}</span>
                      <span className="font-mono text-blue-300">
                        报名 {event.registered}
                        {event.capacity !== null ? ` / ${event.capacity}` : ' 人'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* 新闻 */}
          {showNews && visibleNews.length > 0 ? (
            <div className="mb-10">
              <SectionHeading
                icon="📢"
                title="相关新闻"
                accent="border-yellow-500"
                total={news.length}
                moreHref={type === 'all' ? typeHref(query, 'news') : undefined}
              />
              <div className="space-y-3">
                {visibleNews.map((item) => (
                  <Link
                    key={item.id}
                    href={`/news/${item.id}`}
                    className="block bg-[#2c2d31] border border-gray-700 p-4 rounded-lg hover:border-yellow-500 transition group"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {item.type ? (
                        <span className="rounded border border-gray-600 bg-[#232428] px-1.5 py-0.5 text-[11px] text-gray-400">
                          {item.type}
                        </span>
                      ) : null}
                      <h3 className="min-w-0 flex-1 truncate text-white font-bold text-base group-hover:text-yellow-400 transition">
                        {item.title || '（无标题公告）'}
                      </h3>
                    </div>
                    <p className="mt-2 text-right text-xs text-gray-500">
                      {formatDate(item.created_at)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* 车队 */}
          {showVtcs && visibleVtcs.length > 0 ? (
            <div className="mb-10">
              <SectionHeading
                icon="🚚"
                title="相关车队"
                accent="border-purple-500"
                total={vtcs.length}
                moreHref={type === 'all' ? typeHref(query, 'vtcs') : undefined}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleVtcs.map((vtc) => (
                  <Link
                    key={vtc.id}
                    href={`/vtc/${vtc.id}`}
                    className="block bg-[#2c2d31] border border-gray-700 p-4 rounded-lg hover:border-purple-500 transition group"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-white font-bold group-hover:text-purple-400 transition">
                        {vtc.name || '未命名车队'}
                      </span>
                      {vtc.tag ? (
                        <span className="rounded border border-gray-600 bg-[#232428] px-1.5 py-0.5 text-[11px] text-gray-400">
                          [{vtc.tag}]
                        </span>
                      ) : null}
                      <span
                        className={`ml-auto rounded border px-1.5 py-0.5 text-[11px] font-bold ${
                          vtc.is_recruiting
                            ? 'border-green-500/40 bg-green-500/15 text-green-300'
                            : 'border-gray-600 bg-[#232428] text-gray-400'
                        }`}
                      >
                        {vtc.is_recruiting ? '招募中' : '暂停招募'}
                      </span>
                    </div>
                    {vtc.description ? (
                      <p className="mt-2 line-clamp-2 text-xs text-gray-500">{vtc.description}</p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* 空结果提示 */}
          {!error && total === 0 ? (
            <div className="text-center py-20 bg-[#2c2d31] border border-gray-700 rounded-lg">
              <p className="text-4xl mb-4">🔍</p>
              <p className="text-gray-400">
                没有找到与 &quot;{query.trim()}&quot; 相关的内容，请尝试其他关键词或 ID。
              </p>
            </div>
          ) : null}
        </>
      )}
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
