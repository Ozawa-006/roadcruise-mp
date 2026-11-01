'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import { useTr } from '@/components/I18nProvider';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** 前端分页大小（通知总量很小，一次性取最近 100 条后本地分页）。 */
const PAGE_SIZE = 20;
/** 单次最多拉取的通知条数。 */
const FETCH_LIMIT = 100;

interface NotificationRow {
  id: number;
  type: string | null;
  content: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface BadgeStyle {
  label: string;
  className: string;
}

/** 页面文案：中文原文为 key，英文缺失时回退中文。 */
const EN: Record<string, string> = {
  // 标题与统计
  '通知中心': 'Notifications',
  '/ Notifications': '',
  '共 {total} 条通知，其中': '{total} notifications total, of which',
  '条未读（最多展示最近 {limit} 条）。': 'unread (showing the latest {limit}).',
  '处理中...': 'Processing...',
  '全部标为已读': 'Mark all as read',

  // 登录状态
  '登录状态确认中...': 'Checking sign-in status...',
  '请先登录': 'Please sign in',
  '登录后即可查看你的论坛回复与车队通知。':
    'Sign in to view your forum reply and VTC notifications.',
  '前往登录 →': 'Sign in →',

  // 列表、筛选与分页
  '只看未读': 'Unread only',
  '第 {page} / {total} 页': 'Page {page} / {total}',
  '通知加载中...': 'Loading notifications...',
  '暂无通知': 'No notifications',
  '未读': 'Unread',
  '（无内容）': '(No content)',
  '上一页': 'Previous',
  '下一页': 'Next',

  // 通知类型徽章
  '回复': 'Reply',
  '车队': 'VTC',
  '其它': 'Other',
};

/** 通知类型徽章：reply=回复/蓝，vtc=车队/橙，其它=灰。 */
function badgeOf(type: string | null): BadgeStyle {
  if (type === 'reply') {
    return {
      label: '回复',
      className: 'border-blue-500/40 bg-blue-500/15 text-blue-400',
    };
  }
  if (type === 'vtc') {
    return {
      label: '车队',
      className: 'border-orange-500/40 bg-orange-500/15 text-orange-400',
    };
  }
  return {
    label: '其它',
    className: 'border-gray-600 bg-gray-600/20 text-gray-400',
  };
}

/** 只接受站内相对路径，避免把 link 当成外部跳转目标。 */
function isInternalLink(link: string | null): link is string {
  return typeof link === 'string' && link.startsWith('/');
}

function StatusCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-[#2c2d31] px-6 py-10 text-center text-sm text-gray-400">
      {children}
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const tr = useTr(EN);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [page, setPage] = useState(1);
  const [markingAll, setMarkingAll] = useState(false);

  // 登录态 + 首次加载通知列表
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      setUser(currentUser);
      setAuthLoading(false);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('id, type, content, link, is_read, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT);

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setNotifications((data ?? []) as NotificationRow[]);
      }
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // 前端「只看未读」筛选
  const filtered = useMemo(
    () => (onlyUnread ? notifications.filter((n) => !n.is_read) : notifications),
    [notifications, onlyUnread]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  // 批量标记当前用户全部未读为已读
  const markAllAsRead = async () => {
    if (!user || markingAll || unreadCount === 0) return;

    setMarkingAll(true);
    setError('');

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setMarkingAll(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNotifications((prev) => prev.map((n) => (n.is_read ? n : { ...n, is_read: true })));
    setPage(1);
  };

  // 点击一条：先标记已读，再跳转 link（link 为空则只标记已读）
  const openNotification = async (n: NotificationRow) => {
    setError('');

    if (!n.is_read) {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', n.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item)));
    }

    if (isInternalLink(n.link)) {
      router.push(n.link);
    }
  };

  return (
    <main className="min-h-screen bg-[#18191c] text-gray-300 flex flex-col font-sans">
      <Navbar />

      <div className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8">
        {/* 标题区 */}
        <div className="mb-6 flex flex-col gap-4 border-b border-gray-700 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {tr('通知中心')}{' '}
              <span className="text-base font-normal text-gray-500">{tr('/ Notifications')}</span>
            </h1>
            {user && (
              <p className="mt-2 text-xs text-gray-500">
                {tr('共 {total} 条通知，其中', { total: notifications.length })}{' '}
                <span className="text-blue-400">{unreadCount}</span>{' '}
                {tr('条未读（最多展示最近 {limit} 条）。', { limit: FETCH_LIMIT })}
              </p>
            )}
          </div>

          {user && (
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              disabled={markingAll || unreadCount === 0}
              className="self-start rounded border border-blue-500/50 bg-blue-500/10 px-4 py-2 text-xs font-bold text-blue-400 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-transparent disabled:text-gray-600 md:self-auto"
            >
              {markingAll ? tr('处理中...') : tr('全部标为已读')}
            </button>
          )}
        </div>

        {authLoading && <StatusCard>{tr('登录状态确认中...')}</StatusCard>}

        {/* 未登录 */}
        {!authLoading && !user && (
          <div className="rounded-lg border border-gray-700 bg-[#2c2d31] px-6 py-12 text-center">
            <p className="text-4xl mb-4">🔔</p>
            <p className="text-sm text-gray-300">{tr('请先登录')}</p>
            <p className="mt-2 text-xs text-gray-500">{tr('登录后即可查看你的论坛回复与车队通知。')}</p>
            <Link
              href="/login"
              className="mt-5 inline-block rounded border border-blue-500/50 bg-blue-500/10 px-5 py-2 text-xs font-bold text-blue-400 transition hover:bg-blue-500/20"
            >
              {tr('前往登录 →')}
            </Link>
          </div>
        )}

        {/* 已登录 */}
        {!authLoading && user && (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={onlyUnread}
                  onChange={(e) => {
                    setOnlyUnread(e.target.checked);
                    setPage(1);
                  }}
                  className="h-3.5 w-3.5 accent-blue-500"
                />
                {tr('只看未读')}
              </label>
              <span className="text-[11px] text-gray-500">
                {tr('第 {page} / {total} 页', { page: currentPage, total: totalPages })}
              </span>
            </div>

            {error && (
              <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                {error}
              </div>
            )}

            {loading ? (
              <StatusCard>{tr('通知加载中...')}</StatusCard>
            ) : pageItems.length === 0 ? (
              <StatusCard>{tr('暂无通知')}</StatusCard>
            ) : (
              <ul className="space-y-2">
                {pageItems.map((n) => {
                  const badge = badgeOf(n.type);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void openNotification(n)}
                        className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                          n.is_read
                            ? 'border-gray-700 bg-[#2c2d31] hover:border-gray-600'
                            : 'border-blue-500/40 bg-[#2c2d31] hover:border-blue-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1.5 flex items-center gap-2">
                              {!n.is_read && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label={tr('未读')} />
                              )}
                              <span
                                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}
                              >
                                {tr(badge.label)}
                              </span>
                            </div>
                            <p className={`text-sm leading-relaxed ${n.is_read ? 'text-gray-400' : 'text-gray-100'}`}>
                              {n.content || tr('（无内容）')}
                            </p>
                          </div>
                          <time
                            dateTime={n.created_at}
                            className="shrink-0 whitespace-nowrap text-[10px] text-gray-500"
                          >
                            {new Date(n.created_at).toLocaleString('zh-CN')}
                          </time>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="rounded border border-gray-700 bg-[#2c2d31] px-3 py-1.5 text-xs text-gray-300 transition hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:text-gray-600"
                >
                  {tr('上一页')}
                </button>
                <span className="text-xs text-gray-400">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="rounded border border-gray-700 bg-[#2c2d31] px-3 py-1.5 text-xs text-gray-300 transition hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:text-gray-600"
                >
                  {tr('下一页')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
