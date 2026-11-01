'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import Navbar from '@/components/Navbar';
import { canAccessAdmin, levelOf } from '@/lib/permissions';
import { useTr } from '@/components/I18nProvider';

// 英文文案：键为中文原文，缺失时回退中文。
const EN: Record<string, string> = {
  // —— 页面头部 ——
  '活动': 'Events',
  '/ Events': '',
  '📅 日历视图 →': '📅 Calendar view →',
  '活动管理 →': 'Manage events →',
  '查看 RCT MP 车队即将开始与已经结束的官方活动，登录并完成 Steam 验证后即可报名。':
    'Browse upcoming and past official Road Cruise Transport MP events. Sign in and complete Steam verification to register.',
  '共 {count} 个活动 · 即将开始 {upcoming} 个': '{count} events · {upcoming} upcoming',
  // —— 分区标题与计数 ——
  '即将开始': 'Upcoming',
  '已结束的活动': 'Past events',
  '{count} 个': '{count}',
  // —— 加载 / 错误 / 空状态 ——
  '正在获取活动列表…': 'Loading events…',
  '加载失败，请稍后重试': 'Failed to load. Please try again later.',
  '暂时无法获取活动列表，请检查网络后重试。':
    'Unable to load the event list. Check your connection and try again.',
  '重新加载': 'Reload',
  '暂无活动': 'No events yet',
  '新的车队活动会在这里发布，请稍后再来查看。':
    'New fleet events will be posted here. Check back soon.',
  '暂无即将开始的活动，可以看看下方已结束的活动。':
    'No upcoming events. Take a look at the past events below.',
  '暂无已结束的活动。': 'No past events.',
  '收起已结束活动': 'Hide past events',
  '展开已结束活动': 'Show past events',
  '已结束活动已折叠，点击「展开已结束活动」查看。':
    'Past events are collapsed. Click "Show past events" to view them.',
  // —— 活动卡片 ——
  '未命名活动': 'Untitled event',
  '{title} 封面': '{title} cover',
  '已结束': 'Ended',
  '报名中': 'Registration open',
  '地点待定': 'Location TBD',
  '未指定服务器': 'Server TBD',
  '报名': 'Registered',
  '{count} 人': '{count}',
  '查看详情 →': 'View details →',
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface EventRow {
  id: number;
  title: string | null;
  start_at: string | null;
  location: string | null;
  server_id: string | null;
  capacity: number | null;
  image_url: string | null;
  status: string | null;
}

interface CountRow {
  event_id: number;
  registered_count: number | null;
}

function countOf(value: unknown): number {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function timeOf(value: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatDateTime(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '——';
  return date.toLocaleString('zh-CN');
}

function titleOf(event: EventRow, tr: (zh: string) => string): string {
  return event.title?.trim() || tr('未命名活动');
}

function countMapFrom(rows: CountRow[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const row of rows) {
    const id = typeof row.event_id === 'number' ? row.event_id : Number(row.event_id);
    if (!Number.isFinite(id)) continue;
    map[id] = countOf(row.registered_count);
  }
  return map;
}

function LoadingState() {
  const tr = useTr(EN);
  return (
    <div className="rounded-xl border border-gray-700 bg-[#2c2d31] p-10 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
      <p className="mt-4 text-sm text-gray-400">{tr('正在获取活动列表…')}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const tr = useTr(EN);
  return (
    <div className="rounded-xl border border-red-900/60 bg-[#2c2d31] p-8 text-center md:p-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 font-mono text-lg font-bold text-red-300">
        !
      </div>
      <p className="mt-4 text-lg font-bold text-white">{tr('加载失败，请稍后重试')}</p>
      <p className="mt-2 text-sm text-gray-500">
        {tr('暂时无法获取活动列表，请检查网络后重试。')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {tr('重新加载')}
      </button>
    </div>
  );
}

function EmptyState() {
  const tr = useTr(EN);
  return (
    <div className="rounded-xl border border-dashed border-gray-700 bg-[#2c2d31]/60 p-10 text-center md:p-14">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-700 bg-[#232428] text-2xl">
        🗓️
      </div>
      <p className="mt-4 text-base font-bold text-white">{tr('暂无活动')}</p>
      <p className="mt-2 text-sm text-gray-500">
        {tr('新的车队活动会在这里发布，请稍后再来查看。')}
      </p>
    </div>
  );
}

function EventCard({
  event,
  registeredCount,
  ended,
}: {
  event: EventRow;
  registeredCount: number;
  ended: boolean;
}) {
  const tr = useTr(EN);
  const title = titleOf(event, tr);
  const capacity = event.capacity;
  const countText =
    capacity !== null ? `${registeredCount} / ${capacity}` : tr('{count} 人', { count: registeredCount });

  return (
    <Link
      href={`/events/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-700 bg-[#2c2d31] shadow-lg shadow-black/20 transition hover:border-blue-500/60 hover:bg-[#313237]"
    >
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-[#232428] via-[#2c2d31] to-[#1b1c20]">
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={tr('{title} 封面', { title })}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-2xl font-black tracking-widest text-gray-600">RCT MP</span>
          </div>
        )}
        <span
          className={`absolute left-3 top-3 inline-flex items-center rounded border px-2.5 py-0.5 text-[11px] font-bold ${
            ended
              ? 'border-gray-600 bg-[#18191c]/85 text-gray-400'
              : 'border-green-500/40 bg-green-500/15 text-green-300'
          }`}
        >
          {ended ? tr('已结束') : tr('报名中')}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-lg font-bold text-white transition group-hover:text-blue-400">
          {title}
        </h3>

        <dl className="mt-3 space-y-1.5 text-sm text-gray-400">
          <div className="flex items-start gap-2">
            <dt aria-hidden="true">🕒</dt>
            <dd>{formatDateTime(event.start_at)}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt aria-hidden="true">📍</dt>
            <dd>{event.location?.trim() || tr('地点待定')}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt aria-hidden="true">🖥️</dt>
            <dd>{event.server_id?.trim() || tr('未指定服务器')}</dd>
          </div>
        </dl>

        <div className="mt-4 flex items-center justify-between border-t border-gray-700 pt-3">
          <span className="text-sm text-gray-400">
            {tr('报名')} <span className="font-mono font-bold text-blue-300">{countText}</span>
          </span>
          <span className="text-xs font-bold text-blue-400 transition group-hover:text-blue-300">
            {tr('查看详情 →')}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function EventsListPage() {
  const tr = useTr(EN);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [roleLevel, setRoleLevel] = useState(0);
  const [now, setNow] = useState(0);
  const [showPast, setShowPast] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setFailed(false);

      try {
        const [eventsResult, countsResult] = await Promise.all([
          supabase
            .from('events')
            .select('id,title,start_at,location,server_id,capacity,image_url,status')
            .eq('status', 'published')
            .order('start_at', { ascending: true }),
          supabase.from('event_registration_counts').select('event_id,registered_count'),
        ]);

        if (cancelled) return;

        if (eventsResult.error) {
          console.error('加载活动列表失败:', eventsResult.error);
          setEvents([]);
          setCounts({});
          setFailed(true);
          return;
        }

        setEvents((eventsResult.data ?? []) as EventRow[]);
        setCounts(countMapFrom((countsResult.data ?? []) as CountRow[]));
        setNow(Date.now());

        // 权限信息只影响「活动管理」入口，失败时不影响活动列表本身。
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (cancelled) return;
          if (!user) {
            setRoleLevel(0);
            return;
          }

          const { data: profile } = await supabase
            .from('profiles')
            .select('role_level')
            .eq('id', user.id)
            .maybeSingle();
          if (!cancelled) setRoleLevel(levelOf(profile?.role_level));
        } catch (authError) {
          console.error('加载当前用户权限失败:', authError);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('加载活动列表失败:', error);
        setEvents([]);
        setCounts({});
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const { upcoming, past } = useMemo(() => {
    const upcomingItems: EventRow[] = [];
    const pastItems: EventRow[] = [];
    for (const event of events) {
      if (timeOf(event.start_at) >= now) {
        upcomingItems.push(event);
      } else {
        pastItems.push(event);
      }
    }
    pastItems.sort((a, b) => timeOf(b.start_at) - timeOf(a.start_at));
    return { upcoming: upcomingItems, past: pastItems };
  }, [events, now]);

  const retry = () => setReloadToken((value) => value + 1);
  const canManage = canAccessAdmin(roleLevel);

  return (
    <main className="flex min-h-screen flex-col bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 border-b border-gray-700 pb-5 md:mb-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-3xl font-black tracking-wide text-white md:text-4xl">
                {tr('活动')}
              </h1>
              <span className="text-lg font-bold text-gray-500 md:text-xl">{tr('/ Events')}</span>
            </div>
            <Link
              href="/events/calendar"
              className="inline-flex items-center rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-300 transition hover:border-orange-400 hover:text-white"
            >
              {tr('📅 日历视图 →')}
            </Link>
            {canManage ? (
              <Link
                href="/admin/events"
                className="inline-flex items-center rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-300 transition hover:border-blue-400 hover:text-white"
              >
                {tr('活动管理 →')}
              </Link>
            ) : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            {tr('查看 RCT MP 车队即将开始与已经结束的官方活动，登录并完成 Steam 验证后即可报名。')}
          </p>
          {!loading && !failed && events.length > 0 ? (
            <p className="mt-2 text-xs text-gray-600">
              {tr('共 {count} 个活动 · 即将开始 {upcoming} 个', {
                count: events.length,
                upcoming: upcoming.length,
              })}
            </p>
          ) : null}
        </div>

        {loading ? (
          <LoadingState />
        ) : failed ? (
          <ErrorState onRetry={retry} />
        ) : events.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-10">
            <section aria-labelledby="events-upcoming-heading">
              <div className="mb-4 flex items-baseline gap-3">
                <h2
                  id="events-upcoming-heading"
                  className="text-xl font-bold text-white md:text-2xl"
                >
                  {tr('即将开始')}
                </h2>
                <span className="text-sm text-gray-500">
                  {tr('{count} 个', { count: upcoming.length })}
                </span>
              </div>
              {upcoming.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-700 bg-[#2c2d31]/50 p-6 text-center text-sm text-gray-500">
                  {tr('暂无即将开始的活动，可以看看下方已结束的活动。')}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {upcoming.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      registeredCount={counts[event.id] ?? 0}
                      ended={false}
                    />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="events-past-heading">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <h2 id="events-past-heading" className="text-xl font-bold text-white md:text-2xl">
                    {tr('已结束的活动')}
                  </h2>
                  <span className="text-sm text-gray-500">
                    {tr('{count} 个', { count: past.length })}
                  </span>
                </div>
                {past.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowPast((value) => !value)}
                    aria-expanded={showPast}
                    className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-bold text-gray-300 transition hover:border-blue-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    {showPast ? tr('收起已结束活动') : tr('展开已结束活动')}
                  </button>
                ) : null}
              </div>
              {past.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-700 bg-[#2c2d31]/50 p-6 text-center text-sm text-gray-500">
                  {tr('暂无已结束的活动。')}
                </p>
              ) : showPast ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {past.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      registeredCount={counts[event.id] ?? 0}
                      ended
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-gray-700 bg-[#2c2d31]/50 p-6 text-center text-sm text-gray-500">
                  {tr('已结束活动已折叠，点击「展开已结束活动」查看。')}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
