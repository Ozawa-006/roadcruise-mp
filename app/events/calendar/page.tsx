'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import Navbar from '@/components/Navbar';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface EventRow {
  id: number;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  server_id: string | null;
  capacity: number | null;
  status: string | null;
}

interface MonthCursor {
  year: number;
  month: number;
}

interface CalendarCell {
  key: string;
  date: Date;
  inMonth: boolean;
  events: EventRow[];
}

type LoadStatus = 'loading' | 'ready' | 'error';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const;

interface TodayInfo {
  year: number;
  month: number;
  key: string;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

// "今天"只在浏览器端可用。useSyncExternalStore 让服务端预渲染使用 null 快照，
// 水合后再读取真实本地日期，避免时区差异导致的 hydration 不一致。
let todaySnapshot: TodayInfo | null = null;

function readToday(): TodayInfo {
  if (!todaySnapshot) {
    const now = new Date();
    todaySnapshot = {
      year: now.getFullYear(),
      month: now.getMonth(),
      key: dateKey(now.getFullYear(), now.getMonth(), now.getDate()),
    };
  }
  return todaySnapshot;
}

function getServerToday(): null {
  return null;
}

function subscribeToday(): () => void {
  return () => {};
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: string | null): string {
  const date = parseDate(value);
  if (!date) return '时间待定';
  return date.toLocaleString('zh-CN');
}

function titleOf(event: EventRow): string {
  return event.title?.trim() || '未命名活动';
}

function locationOf(event: EventRow): string {
  return event.location?.trim() || '地点待定';
}

/** 按本地日期把活动分桶，键与月历格子保持一致。 */
function groupEventsByDay(events: EventRow[]): Record<string, EventRow[]> {
  const grouped: Record<string, EventRow[]> = {};
  for (const event of events) {
    const date = parseDate(event.start_at);
    if (!date) continue;
    const key = dateKey(date.getFullYear(), date.getMonth(), date.getDate());
    const bucket = grouped[key];
    if (bucket) {
      bucket.push(event);
    } else {
      grouped[key] = [event];
    }
  }
  return grouped;
}

/** 生成周一开头、固定整周的月历格子（含相邻月份的补位日期）。 */
function buildCalendarCells(
  view: MonthCursor,
  grouped: Record<string, EventRow[]>
): CalendarCell[] {
  const firstDay = new Date(view.year, view.month, 1);
  const leading = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const cells: CalendarCell[] = [];
  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - leading + 1;
    const date = new Date(view.year, view.month, dayNumber);
    const key = dateKey(date.getFullYear(), date.getMonth(), date.getDate());
    cells.push({
      key,
      date,
      inMonth: dayNumber >= 1 && dayNumber <= daysInMonth,
      events: grouped[key] ?? [],
    });
  }
  return cells;
}

function LoadingState() {
  return (
    <div className="rounded-2xl border border-gray-700 bg-[#2c2d31] p-10 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
      <p className="mt-4 text-sm text-gray-400">正在获取活动日历…</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-900/60 bg-[#2c2d31] p-8 text-center md:p-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 font-mono text-lg font-bold text-red-300">
        !
      </div>
      <p className="mt-4 text-lg font-bold text-white">加载失败，请稍后重试</p>
      <p className="mt-2 text-sm text-gray-500">暂时无法获取活动日历，请检查网络后重试。</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        重新加载
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-gray-700 bg-[#2c2d31]/60 p-10 text-center md:p-14">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-700 bg-[#232428] text-2xl">
        📅
      </div>
      <p className="mt-4 text-lg font-bold text-white">暂无已发布的活动</p>
      <p className="mt-2 text-sm text-gray-500">
        官方发布新活动后，这里会自动显示对应的日期与活动安排。
      </p>
      <Link
        href="/events"
        className="mt-5 inline-flex items-center justify-center rounded-lg border border-gray-600 px-4 py-2 text-sm font-bold text-gray-300 transition hover:border-blue-500 hover:text-white"
      >
        返回活动列表
      </Link>
    </div>
  );
}

function CalendarEventLink({ event }: { event: EventRow }) {
  const server = event.server_id?.trim();

  return (
    <Link
      href={`/events/${event.id}`}
      className="block rounded-lg border border-gray-700 bg-[#232428] p-3 transition hover:border-blue-500/60 hover:bg-[#2f3035]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 min-w-0 break-words font-bold text-white">
          {titleOf(event)}
        </p>
        <span className="shrink-0 text-xs font-bold text-blue-400">详情 →</span>
      </div>
      <p className="mt-1 text-xs text-gray-400">🕒 {formatDateTime(event.start_at)}</p>
      {event.end_at ? (
        <p className="mt-0.5 text-xs text-gray-500">🏁 {formatDateTime(event.end_at)}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
        <span>📍 {locationOf(event)}</span>
        {server ? <span>🖥️ {server}</span> : null}
      </div>
    </Link>
  );
}

function CalendarDayCell({
  cell,
  todayKey,
  selectedKey,
  onSelect,
}: {
  cell: CalendarCell;
  todayKey: string | null;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const isToday = cell.inMonth && cell.key === todayKey;
  const isSelected = cell.inMonth && cell.key === selectedKey;
  const showsEvents = cell.inMonth && cell.events.length > 0;
  const visibleEvents = cell.events.slice(0, 2);
  const hiddenCount = cell.events.length - visibleEvents.length;

  const cellClassName = [
    'relative flex min-h-[72px] flex-col rounded-lg border p-1.5 text-left transition sm:min-h-[108px] sm:p-2',
    isSelected
      ? 'border-orange-500/70 bg-orange-500/10 ring-1 ring-orange-500/40'
      : isToday
        ? 'border-blue-500/70 bg-blue-500/10'
        : cell.inMonth
          ? 'border-gray-700 bg-[#232428]'
          : 'border-gray-800 bg-[#1b1c20]',
    showsEvents ? 'cursor-pointer' : '',
    showsEvents && !isSelected ? 'hover:border-blue-500/60' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const dateClassName = [
    'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold',
    isToday
      ? 'bg-blue-600 text-white'
      : isSelected
        ? 'bg-orange-500 text-white'
        : cell.inMonth
          ? 'text-gray-300'
          : 'text-gray-600',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cellClassName}
      onClick={showsEvents ? () => onSelect(cell.key) : undefined}
    >
      {showsEvents ? (
        <>
          <span
            className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-orange-400"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(cell.key);
            }}
            aria-expanded={isSelected}
            aria-label={`${cell.date.getMonth() + 1}月${cell.date.getDate()}日，${cell.events.length} 个活动，查看当日列表`}
            className={`${dateClassName} transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              isToday
                ? 'hover:bg-blue-500'
                : isSelected
                  ? 'hover:bg-orange-400'
                  : 'hover:bg-blue-500/30'
            }`}
          >
            {cell.date.getDate()}
          </button>
        </>
      ) : (
        <span className={dateClassName}>{cell.date.getDate()}</span>
      )}

      <div className="mt-1 hidden min-w-0 flex-col gap-0.5 sm:flex">
        {showsEvents
          ? visibleEvents.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                title={titleOf(event)}
                onClick={(clickEvent) => clickEvent.stopPropagation()}
                className="truncate rounded bg-[#18191c]/80 px-1.5 py-0.5 text-[11px] font-medium text-blue-200 transition hover:bg-blue-500/25 hover:text-white"
              >
                {titleOf(event)}
              </Link>
            ))
          : null}
        {showsEvents && hiddenCount > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(cell.key);
            }}
            aria-label={`查看${cell.date.getMonth() + 1}月${cell.date.getDate()}日全部${cell.events.length}个活动`}
            className="mt-0.5 self-start rounded px-1 text-[11px] font-bold text-orange-300 transition hover:text-orange-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            +{hiddenCount}
          </button>
        ) : null}
      </div>

      {showsEvents ? (
        <div className="mt-auto flex items-center gap-1 pt-1 sm:hidden" aria-hidden="true">
          {cell.events.slice(0, 3).map((event, index) => (
            <span
              key={event.id}
              className={`h-1.5 w-1.5 rounded-full ${
                index % 2 === 0 ? 'bg-blue-400' : 'bg-orange-400'
              }`}
            />
          ))}
          {cell.events.length > 3 ? (
            <span className="text-[10px] font-bold text-gray-400">+{cell.events.length - 3}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DayPanel({ cell, onClose }: { cell: CalendarCell; onClose: () => void }) {
  return (
    <section
      aria-label="当日活动列表"
      className="mt-4 rounded-2xl border border-orange-500/40 bg-[#2c2d31] p-4 shadow-xl shadow-black/20 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">
          {cell.date.getMonth() + 1}月{cell.date.getDate()}日 活动
          <span className="ml-2 text-xs font-normal text-gray-500">{cell.events.length} 个</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-600 px-3 py-1 text-xs font-bold text-gray-300 transition hover:border-orange-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          收起
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {cell.events.map((event) => (
          <li key={event.id}>
            <CalendarEventLink event={event} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function EventCalendarPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [viewOverride, setViewOverride] = useState<MonthCursor | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const today = useSyncExternalStore(subscribeToday, readToday, getServerToday);
  const defaultView = useMemo(
    () => (today ? { year: today.year, month: today.month } : null),
    [today]
  );
  const view = viewOverride ?? defaultView;
  const todayKey = today?.key ?? null;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStatus('loading');
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id,title,start_at,end_at,location,server_id,capacity,status')
          .eq('status', 'published')
          .order('start_at', { ascending: true });

        if (cancelled) return;

        if (error) {
          console.error('加载活动日历失败:', error);
          setEvents([]);
          setStatus('error');
          return;
        }

        setEvents((data ?? []) as EventRow[]);
        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        console.error('加载活动日历失败:', error);
        setEvents([]);
        setStatus('error');
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const groupedEvents = useMemo(() => groupEventsByDay(events), [events]);

  const cells = useMemo(
    () => (view ? buildCalendarCells(view, groupedEvents) : []),
    [view, groupedEvents]
  );

  const monthEvents = useMemo(() => {
    if (!view) return [];
    return events.filter((event) => {
      const date = parseDate(event.start_at);
      if (!date) return false;
      return date.getFullYear() === view.year && date.getMonth() === view.month;
    });
  }, [events, view]);

  const selectedCell = useMemo(
    () => (selectedKey ? (cells.find((cell) => cell.key === selectedKey) ?? null) : null),
    [cells, selectedKey]
  );

  const shiftMonth = (offset: number) => {
    if (!view) return;
    const next = new Date(view.year, view.month + offset, 1);
    setViewOverride({ year: next.getFullYear(), month: next.getMonth() });
    setSelectedKey(null);
  };

  const goToday = () => {
    const now = new Date();
    const key = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
    setViewOverride({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedKey(groupedEvents[key] ? key : null);
  };

  const retry = () => {
    setSelectedKey(null);
    setReloadToken((value) => value + 1);
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-gray-700 pb-5 md:mb-8">
          <div>
            <Link href="/events" className="text-sm text-blue-400 transition hover:text-blue-300">
              ← 活动列表
            </Link>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-3xl font-black tracking-wide text-white md:text-4xl">活动日历</h1>
              <span className="text-lg font-bold text-gray-500 md:text-xl">/ Calendar</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              按月份浏览 RCT MP 官方活动，点击有活动的日期即可查看当天全部安排。
            </p>
            {status === 'ready' && view && events.length > 0 ? (
              <p className="mt-2 text-xs text-gray-600">
                共 {events.length} 个已发布活动 · 当月 {monthEvents.length} 个
              </p>
            ) : null}
          </div>

          <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-gray-700 bg-[#232428] p-0.5 text-xs font-bold">
            <span
              aria-current="page"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-white"
            >
              月历
            </span>
            <Link
              href="/events"
              className="rounded-md px-3 py-1.5 text-gray-400 transition hover:text-white"
            >
              列表
            </Link>
          </div>
        </div>

        {status === 'loading' ? (
          <LoadingState />
        ) : status === 'error' ? (
          <ErrorState onRetry={retry} />
        ) : !view ? (
          <LoadingState />
        ) : events.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <section
              aria-label="活动月历"
              className="rounded-2xl border border-gray-700 bg-[#2c2d31] p-3 shadow-xl shadow-black/20 sm:p-5"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black text-white md:text-2xl">
                  {view.year}年{view.month + 1}月
                </h2>
                <div className="flex items-center gap-1.5 text-xs font-bold sm:gap-2">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    className="rounded-lg border border-gray-600 px-2.5 py-1.5 text-gray-300 transition hover:border-blue-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:px-3"
                  >
                    ‹ 上一月
                  </button>
                  <button
                    type="button"
                    onClick={goToday}
                    className="rounded-lg border border-blue-500/50 bg-blue-500/10 px-2.5 py-1.5 text-blue-300 transition hover:border-blue-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:px-3"
                  >
                    今天
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    className="rounded-lg border border-gray-600 px-2.5 py-1.5 text-gray-300 transition hover:border-blue-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:px-3"
                  >
                    下一月 ›
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 border-b border-gray-700 pb-1.5 text-center text-xs font-bold text-gray-500 sm:gap-1.5">
                {WEEKDAYS.map((day, index) => (
                  <span key={day} className={index >= 5 ? 'text-orange-300/80' : undefined}>
                    {day}
                  </span>
                ))}
              </div>

              <div className="mt-1.5 grid grid-cols-7 gap-1 sm:gap-1.5">
                {cells.map((cell) => (
                  <CalendarDayCell
                    key={cell.key}
                    cell={cell}
                    todayKey={todayKey}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                  />
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
                  今天
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-orange-400" aria-hidden="true" />
                  有活动
                </span>
                <span>每日最多显示 2 个活动，点击日期查看全部</span>
              </div>
            </section>

            {monthEvents.length === 0 ? (
              <p className="mt-3 hidden rounded-xl border border-dashed border-gray-700 bg-[#2c2d31]/60 px-4 py-3 text-center text-sm text-gray-500 sm:block">
                当月暂无活动，可以切换月份查看。
              </p>
            ) : null}

            {selectedCell ? (
              <DayPanel cell={selectedCell} onClose={() => setSelectedKey(null)} />
            ) : null}

            <section aria-labelledby="calendar-month-events" className="mt-4 sm:hidden">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 id="calendar-month-events" className="text-lg font-bold text-white">
                  当月活动
                </h2>
                <span className="text-xs text-gray-500">{monthEvents.length} 个</span>
              </div>
              {monthEvents.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-700 bg-[#2c2d31]/60 p-5 text-center text-sm text-gray-500">
                  当月暂无活动，可以切换月份查看。
                </p>
              ) : (
                <ul className="space-y-2">
                  {monthEvents.map((event) => (
                    <li key={event.id}>
                      <CalendarEventLink event={event} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
