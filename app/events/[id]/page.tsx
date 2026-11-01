'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient, type User } from '@supabase/supabase-js';
import Navbar from '@/components/Navbar';
import RichText from '@/components/RichText';
import { useTr } from '@/components/I18nProvider';

// 英文文案：键为中文原文，缺失时回退中文。
const EN: Record<string, string> = {
  // —— 通用 / 状态 ——
  '未命名活动': 'Untitled event',
  '操作失败，请稍后重试': 'Something went wrong. Please try again later.',
  '已发布': 'Published',
  '已取消': 'Cancelled',
  '草稿': 'Draft',
  '未知状态': 'Unknown status',
  // —— 加载 / 错误 / 未找到 ——
  '正在获取活动详情…': 'Loading event details…',
  '活动不存在或未发布': 'Event not found or not published',
  '该活动可能已被删除，或尚未对公众发布。':
    'This event may have been deleted or not yet published to the public.',
  '返回活动列表': 'Back to events',
  '加载失败，请稍后重试': 'Failed to load. Please try again later.',
  '暂时无法获取活动详情，请检查网络后重试。':
    'Unable to load event details. Check your connection and try again.',
  '重新加载': 'Reload',
  // —— 报名操作 ——
  '报名失败，请稍后重试': 'Registration failed. Please try again later.',
  '报名成功，期待在活动中见到你！': 'You are registered. See you at the event!',
  '取消报名失败，请稍后重试': 'Failed to cancel registration. Please try again later.',
  '已取消报名。': 'Registration cancelled.',
  '{count} 人': '{count}',
  '处理中…': 'Processing…',
  '取消报名': 'Cancel registration',
  '活动已取消': 'Event cancelled',
  '活动未发布': 'Event not published',
  '报名已截止': 'Registration closed',
  '名额已满': 'Capacity reached',
  '登录后报名': 'Sign in to register',
  '提交中…': 'Submitting…',
  '立即报名': 'Register now',
  // —— 活动详情 ——
  '← 返回活动列表': '← Back to events',
  '{title} 封面': '{title} cover',
  '已开始': 'Started',
  '报名中': 'Registration open',
  '已报名': 'Registered',
  '开始时间': 'Start time',
  '结束时间': 'End time',
  '地点': 'Location',
  '地点待定': 'Location TBD',
  '服务器': 'Server',
  '未指定服务器': 'Server TBD',
  '报名人数': 'Registrations',
  '活动介绍': 'About this event',
  '暂无活动详情。': 'No event details yet.',
  // —— 报名区 ——
  '报名': 'Registration',
  '当前人数': 'Current registrations',
  '报名需要登录账号并已完成 Steam 正版验证；名额有限，活动开始前均可取消报名。':
    'You must sign in and complete Steam verification to register. Seats are limited, and you can cancel any time before the event starts.',
  '备注（选填）': 'Note (optional)',
  '例如：我会带朋友一起参加 / 可能晚到 10 分钟':
    'e.g. I will bring a friend / I may be 10 minutes late',
  '登录后即可报名参加活动。': 'Sign in to register for this event.',
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface EventRow {
  id: number;
  title: string | null;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  server_id: string | null;
  capacity: number | null;
  image_url: string | null;
  status: string | null;
}

type RegistrationStatus = 'registered' | 'cancelled' | null;

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

interface RpcOutcome {
  ok?: boolean;
  status?: string;
}

function countOf(value: unknown): number {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
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

function normalizeRegistration(value: unknown): RegistrationStatus {
  if (value === 'registered') return 'registered';
  if (value === 'cancelled') return 'cancelled';
  return null;
}

function parseRpcOutcome(value: unknown): RpcOutcome {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const outcome: RpcOutcome = {};
  if (typeof record.ok === 'boolean') outcome.ok = record.ok;
  if (typeof record.status === 'string') outcome.status = record.status;
  return outcome;
}

function errorMessage(error: unknown, tr: (zh: string) => string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return tr('操作失败，请稍后重试');
}

function eventStatusBadge(
  status: string | null,
  tr: (zh: string) => string
): { label: string; className: string } {
  if (status === 'published') {
    return {
      label: tr('已发布'),
      className: 'border-green-500/40 bg-green-500/15 text-green-300',
    };
  }
  if (status === 'cancelled') {
    return { label: tr('已取消'), className: 'border-red-500/40 bg-red-500/15 text-red-300' };
  }
  if (status === 'draft') {
    return { label: tr('草稿'), className: 'border-gray-600 bg-[#232428] text-gray-300' };
  }
  return { label: tr('未知状态'), className: 'border-gray-600 bg-[#232428] text-gray-400' };
}

function LoadingState() {
  const tr = useTr(EN);
  return (
    <div className="rounded-xl border border-gray-700 bg-[#2c2d31] p-10 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
      <p className="mt-4 text-sm text-gray-400">{tr('正在获取活动详情…')}</p>
    </div>
  );
}

function NotFoundState() {
  const tr = useTr(EN);
  return (
    <div className="rounded-xl border border-dashed border-gray-700 bg-[#2c2d31]/60 p-10 text-center md:p-14">
      <p className="text-lg font-bold text-white">{tr('活动不存在或未发布')}</p>
      <p className="mt-2 text-sm text-gray-500">{tr('该活动可能已被删除，或尚未对公众发布。')}</p>
      <Link
        href="/events"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
      >
        {tr('返回活动列表')}
      </Link>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const tr = useTr(EN);
  return (
    <div className="rounded-xl border border-red-900/60 bg-[#2c2d31] p-8 text-center md:p-10">
      <p className="text-lg font-bold text-white">{tr('加载失败，请稍后重试')}</p>
      <p className="mt-2 text-sm text-gray-500">
        {tr('暂时无法获取活动详情，请检查网络后重试。')}
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

export default function EventDetailPage() {
  const tr = useTr(EN);
  const params = useParams<{ id: string }>();
  const rawId = params?.id;
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [event, setEvent] = useState<EventRow | null>(null);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [registration, setRegistration] = useState<RegistrationStatus>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [now, setNow] = useState(0);
  const [note, setNote] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setFailed(false);
      setNotice(null);

      const numericId = Number(eventId);
      if (!eventId || !Number.isFinite(numericId)) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const [eventResult, countsResult] = await Promise.all([
          supabase.from('events').select('*').eq('id', numericId).maybeSingle(),
          supabase
            .from('event_registration_counts')
            .select('registered_count')
            .eq('event_id', numericId)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        if (eventResult.error) {
          console.error('加载活动详情失败:', eventResult.error);
          setFailed(true);
          return;
        }
        if (!eventResult.data) {
          setNotFound(true);
          return;
        }

        setEvent(eventResult.data as EventRow);
        setRegisteredCount(countOf(countsResult.data?.registered_count));
        setNow(Date.now());

        let currentUser: User | null = null;
        try {
          const { data } = await supabase.auth.getUser();
          currentUser = data.user;
        } catch (authError) {
          console.error('加载当前用户信息失败:', authError);
        }

        if (cancelled) return;
        setUser(currentUser);

        if (currentUser) {
          const { data: registrationData } = await supabase
            .from('event_registrations')
            .select('status')
            .eq('event_id', numericId)
            .eq('user_id', currentUser.id)
            .maybeSingle();
          if (cancelled) return;
          setRegistration(normalizeRegistration(registrationData?.status));
        } else {
          setRegistration(null);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('加载活动详情失败:', error);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [eventId, reloadToken]);

  const refreshEnrollment = useCallback(async () => {
    const numericId = Number(eventId);
    if (!Number.isFinite(numericId)) return;

    const { data: countData, error: countError } = await supabase
      .from('event_registration_counts')
      .select('registered_count')
      .eq('event_id', numericId)
      .maybeSingle();
    if (!countError) setRegisteredCount(countOf(countData?.registered_count));

    if (!user) {
      setRegistration(null);
      return;
    }

    const { data: registrationData, error: registrationError } = await supabase
      .from('event_registrations')
      .select('status')
      .eq('event_id', numericId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!registrationError) setRegistration(normalizeRegistration(registrationData?.status));
  }, [eventId, user]);

  const handleRegister = async () => {
    if (actionBusy || !event || !user) return;
    const numericId = Number(eventId);
    if (!Number.isFinite(numericId)) return;

    setActionBusy(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.rpc('rct_event_register', {
        p_event_id: numericId,
        p_note: note.trim(),
      });

      if (error) {
        setNotice({ kind: 'error', text: errorMessage(error, tr) });
        return;
      }

      const outcome = parseRpcOutcome(data);
      if (outcome.ok === false) {
        setNotice({
          kind: 'error',
          text: outcome.status?.trim() || tr('报名失败，请稍后重试'),
        });
        return;
      }

      setNotice({ kind: 'success', text: tr('报名成功，期待在活动中见到你！') });
      setNote('');
      await refreshEnrollment();
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error, tr) });
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (actionBusy || !event || !user) return;
    const numericId = Number(eventId);
    if (!Number.isFinite(numericId)) return;

    setActionBusy(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.rpc('rct_event_cancel', {
        p_event_id: numericId,
      });

      if (error) {
        setNotice({ kind: 'error', text: errorMessage(error, tr) });
        return;
      }

      const outcome = parseRpcOutcome(data);
      if (outcome.ok === false) {
        setNotice({
          kind: 'error',
          text: outcome.status?.trim() || tr('取消报名失败，请稍后重试'),
        });
        return;
      }

      setNotice({ kind: 'success', text: tr('已取消报名。') });
      await refreshEnrollment();
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error, tr) });
    } finally {
      setActionBusy(false);
    }
  };

  const title = event ? titleOf(event, tr) : '';
  const startTime = event?.start_at ? new Date(event.start_at).getTime() : NaN;
  const started = Number.isFinite(startTime) ? startTime <= now : false;
  const capacity = event?.capacity ?? null;
  const isFull = capacity !== null && registeredCount >= capacity;
  const isPublished = event?.status === 'published';
  const isRegistered = registration === 'registered';
  const statusBadge = eventStatusBadge(event?.status ?? null, tr);

  const countText =
    capacity !== null ? `${registeredCount} / ${capacity}` : tr('{count} 人', { count: registeredCount });

  let actionArea: ReactNode = null;
  if (event) {
    if (isRegistered) {
      actionArea = (
        <button
          type="button"
          onClick={handleCancel}
          disabled={actionBusy}
          className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-300 transition hover:border-red-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {actionBusy ? tr('处理中…') : tr('取消报名')}
        </button>
      );
    } else if (!isPublished) {
      actionArea = (
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-lg bg-gray-700 px-5 py-3 text-sm font-bold text-gray-400 sm:w-auto"
        >
          {event.status === 'cancelled' ? tr('活动已取消') : tr('活动未发布')}
        </button>
      );
    } else if (started) {
      actionArea = (
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-lg bg-gray-700 px-5 py-3 text-sm font-bold text-gray-400 sm:w-auto"
        >
          {tr('报名已截止')}
        </button>
      );
    } else if (isFull) {
      actionArea = (
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-lg bg-gray-700 px-5 py-3 text-sm font-bold text-gray-400 sm:w-auto"
        >
          {tr('名额已满')}
        </button>
      );
    } else if (!user) {
      actionArea = (
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:w-auto"
        >
          {tr('登录后报名')}
        </Link>
      );
    } else {
      actionArea = (
        <button
          type="button"
          onClick={handleRegister}
          disabled={actionBusy}
          className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {actionBusy ? tr('提交中…') : tr('立即报名')}
        </button>
      );
    }
  }

  const showNoteInput =
    Boolean(user) && isPublished && !started && !isFull && !isRegistered;

  return (
    <main className="flex min-h-screen flex-col bg-[#18191c] font-sans text-gray-300">
      <Navbar />

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mb-5">
          <Link href="/events" className="text-sm text-blue-400 transition hover:text-blue-300">
            {tr('← 返回活动列表')}
          </Link>
        </div>

        {loading ? (
          <LoadingState />
        ) : notFound ? (
          <NotFoundState />
        ) : failed ? (
          <ErrorState onRetry={() => setReloadToken((value) => value + 1)} />
        ) : event ? (
          <>
            <article className="overflow-hidden rounded-2xl border border-gray-700 bg-[#2c2d31] shadow-2xl shadow-black/30">
              {event.image_url ? (
                <img
                  src={event.image_url}
                  alt={tr('{title} 封面', { title })}
                  className="h-60 w-full object-cover md:h-80"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center bg-gradient-to-br from-[#232428] via-[#2c2d31] to-[#1b1c20] md:h-60">
                  <span className="text-3xl font-black tracking-widest text-gray-600">
                    RCT MP EVENTS
                  </span>
                </div>
              )}

              <div className="p-6 md:p-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded border px-2.5 py-0.5 text-[11px] font-bold ${statusBadge.className}`}
                  >
                    {statusBadge.label}
                  </span>
                  {isPublished ? (
                    <span
                      className={`inline-flex items-center rounded border px-2.5 py-0.5 text-[11px] font-bold ${
                        started
                          ? 'border-gray-600 bg-[#232428] text-gray-400'
                          : 'border-orange-500/40 bg-orange-500/15 text-orange-300'
                      }`}
                    >
                      {started ? tr('已开始') : tr('报名中')}
                    </span>
                  ) : null}
                  {isRegistered ? (
                    <span className="inline-flex items-center rounded border border-blue-500/40 bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-bold text-blue-300">
                      {tr('已报名')}
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-4 text-3xl font-black leading-tight text-white md:text-4xl">
                  {title}
                </h1>

                <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-gray-700 pt-5 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-bold text-gray-500">{tr('开始时间')}</dt>
                    <dd className="mt-1 text-gray-200">{formatDateTime(event.start_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-gray-500">{tr('结束时间')}</dt>
                    <dd className="mt-1 text-gray-200">{formatDateTime(event.end_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-gray-500">{tr('地点')}</dt>
                    <dd className="mt-1 text-gray-200">
                      {event.location?.trim() || tr('地点待定')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-gray-500">{tr('服务器')}</dt>
                    <dd className="mt-1 text-gray-200">
                      {event.server_id?.trim() || tr('未指定服务器')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-gray-500">{tr('报名人数')}</dt>
                    <dd className="mt-1 font-mono font-bold text-blue-300">{countText}</dd>
                  </div>
                </dl>

                <div className="mt-6 border-t border-gray-700 pt-5">
                  <h2 className="text-sm font-bold text-gray-400">{tr('活动介绍')}</h2>
                  {event.description?.trim() ? (
                    <RichText
                      text={event.description}
                      className="mt-3 text-base leading-7 text-gray-300"
                    />
                  ) : (
                    <p className="mt-3 text-base leading-7 text-gray-300">{tr('暂无活动详情。')}</p>
                  )}
                </div>
              </div>
            </article>

            <section className="mt-6 rounded-2xl border border-gray-700 bg-[#2c2d31] p-6 shadow-xl shadow-black/20 md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-white">{tr('报名')}</h2>
                <span className="text-sm text-gray-400">
                  {tr('当前人数')}{' '}
                  <span className="font-mono font-bold text-blue-300">{countText}</span>
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-gray-500">
                {tr('报名需要登录账号并已完成 Steam 正版验证；名额有限，活动开始前均可取消报名。')}
              </p>

              {notice ? (
                <p
                  role="alert"
                  className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                    notice.kind === 'success'
                      ? 'border-green-500/40 bg-green-500/10 text-green-300'
                      : 'border-red-500/40 bg-red-500/10 text-red-300'
                  }`}
                >
                  {notice.text}
                </p>
              ) : null}

              {showNoteInput ? (
                <div className="mt-4">
                  <label htmlFor="event-note" className="mb-1 block text-sm text-gray-400">
                    {tr('备注（选填）')}
                  </label>
                  <textarea
                    id="event-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder={tr('例如：我会带朋友一起参加 / 可能晚到 10 分钟')}
                    className="w-full rounded border border-gray-600 bg-[#18191c] p-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-right text-[11px] text-gray-500">{note.length} / 500</p>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {actionArea}
                {!user && isPublished && !started && !isFull ? (
                  <span className="text-xs text-gray-500">{tr('登录后即可报名参加活动。')}</span>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
