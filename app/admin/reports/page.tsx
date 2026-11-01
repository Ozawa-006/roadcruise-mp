// app/admin/reports/page.tsx
// 后台：举报处理（Lv.40+）。
// 数据库侧约束：
//   · SELECT 全部举报、UPDATE 状态要求 rct_role_level() >= 40；
//   · 触发器 trg_reports_touch_handled 自动补 handled_at / handled_by；
//   · 触发器 trg_reports_notify 在状态变化时给举报人写 notifications（type='report'）；
//   · notify_stage / last_notified_at 由数据库侧超时升级通知维护，本页只读展示超时徽章。
// 列表为服务端分页：每次只取当前页 50 条（select + count + range），筛选下推到 PostgREST。
'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canAccessAdmin, levelOf } from '@/lib/permissions';
import { useLocale, useTr } from '@/components/I18nProvider';
import { formatMessage, type Locale } from '@/lib/i18n';

// 英文文案：键为中文原文，缺失时回退中文；举报原因/详情、昵称、日期、ID、URL 不翻译。
const EN: Record<string, string> = {
  // 加载 / 权限 / 错误
  '验证权限中...': 'Verifying permissions…',
  '🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能处理举报。':
    '🚫 Insufficient permissions: only Staff (Lv.40) and above can handle reports.',
  '无法验证权限：{msg}': 'Unable to verify permissions: {msg}',
  '操作失败，请稍后重试': 'The operation failed. Please try again later.',
  '加载失败：{msg}': 'Failed to load: {msg}',
  '重试': 'Retry',
  '加载中...': 'Loading…',
  '没有符合当前筛选条件的举报。': 'No reports match the current filters.',
  '暂无举报记录。': 'No reports yet.',

  // 页面头部
  '🚩 举报处理': '🚩 Report Handling',
  '处理玩家举报与申诉；状态变更后系统会自动通知举报人。':
    'Handle player reports and appeals; the reporter is notified automatically when the status changes.',
  '← 返回控制台': '← Back to dashboard',

  // 超时提示
  '超过 24 小时未处理的举报会自动升级提醒':
    'Reports left unhandled for more than 24 hours trigger an automatic escalation notice',
  '超时未处理（>24h）': 'Overdue (>24h)',

  // 筛选
  '状态': 'Status',
  '类型': 'Type',
  '全部状态': 'All statuses',
  '待处理': 'Open',
  '处理中': 'Reviewing',
  '已处理': 'Resolved',
  '未通过': 'Rejected',
  '全部类型': 'All types',
  '帖子': 'Post',
  '回复': 'Reply',
  '用户': 'User',
  '车队': 'VTC',
  '活动': 'Event',
  '其他': 'Other',
  '刷新中...': 'Refreshing…',
  '刷新': 'Refresh',
  '共 {count} 条 · 第 {page} / {total} 页（每页 {size} 条）':
    '{count} total · Page {page} of {total} ({size} per page)',
  '共 {count} 条 · 第 {page} / {total} 页': '{count} total · Page {page} of {total}',
  '（每页 {size} 条）': '({size} per page)',

  // 列表
  '原因：{reason}': 'Reason: {reason}',
  '未填写原因': 'No reason provided',
  '{name}（{id}）': '{name} ({id})',
  '对象：{type}{id}': 'Target: {type}{id}',
  '（未提供 ID）': ' (no ID provided)',
  '查看目标 ↗': 'View target ↗',
  '链接：{url}': 'Link: {url}',
  '举报人：{name}': 'Reporter: {name}',
  '处理人：{name}': 'Handled by: {name}',
  '处理时间：{time}': 'Handled at: {time}',
  '处理备注：{note}': 'Handling note: {note}',
  '未知用户': 'Unknown user',
  '未命名用户': 'Unnamed user',

  // 审核动作
  '将举报 #{id} 标记为「{status}」': 'Mark report #{id} as “{status}”',
  '请填写处理备注（必填），会展示给举报人。':
    'Enter a handling note (required). It will be shown to the reporter.',
  '请填写处理备注。': 'Please enter a handling note.',
  '提交中...': 'Submitting…',
  '确认提交': 'Confirm',
  '取消': 'Cancel',
  '处理中...': 'Processing…',
  '开始处理': 'Start reviewing',
  '标记已处理': 'Mark resolved',
  '驳回': 'Reject',
  '没有找到该举报，或当前账号无权处理。':
    'Report not found, or your account is not allowed to handle it.',
  '更新失败：{msg}': 'Update failed: {msg}',
  '举报 #{id} 已更新为「{status}」。': 'Report #{id} updated to “{status}”.',

  // 分页
  '举报列表分页': 'Report list pagination',
  '上一页': 'Previous',
  '下一页': 'Next',
};

/** effect 内使用的稳定翻译器（useTr 每次渲染都会重建，不能放进依赖数组）。 */
function translate(locale: Locale, zh: string, vars?: Record<string, string | number>): string {
  return formatMessage(locale === 'en' ? EN[zh] ?? zh : zh, vars);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAGE_SIZE = 50;
/** 超过 24 小时仍未处理的 open 举报视为超时（数据库侧会同时触发升级通知）。 */
const OVERDUE_MS = 24 * 60 * 60 * 1000;

const TARGET_TYPES = [
  { value: 'topic', label: '帖子' },
  { value: 'reply', label: '回复' },
  { value: 'profile', label: '用户' },
  { value: 'vtc', label: '车队' },
  { value: 'event', label: '活动' },
  { value: 'other', label: '其他' },
] as const;

type TargetType = (typeof TARGET_TYPES)[number]['value'];
type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'rejected';
type StatusFilter = 'all' | ReportStatus;
type TypeFilter = 'all' | TargetType;
type PendingActionStatus = 'resolved' | 'rejected';

type PageItem = number | 'ellipsis';

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'open', label: '待处理' },
  { value: 'reviewing', label: '处理中' },
  { value: 'resolved', label: '已处理' },
  { value: 'rejected', label: '未通过' },
];

const TYPE_OPTIONS: ReadonlyArray<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '全部类型' },
  ...TARGET_TYPES,
];

const STATUS_META: Record<ReportStatus, { label: string; className: string }> = {
  open: { label: '待处理', className: 'border-orange-500/40 bg-orange-500/15 text-orange-300' },
  reviewing: { label: '处理中', className: 'border-blue-500/40 bg-blue-500/15 text-blue-300' },
  resolved: { label: '已处理', className: 'border-green-500/40 bg-green-500/15 text-green-300' },
  rejected: { label: '未通过', className: 'border-gray-600 bg-[#232428] text-gray-400' },
};

const inputClass =
  'w-full rounded border border-gray-600 bg-[#18191c] p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none';
const labelClass = 'mb-1 block text-xs text-gray-400';

interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: TargetType;
  target_id: string | null;
  target_url: string | null;
  reason: string;
  detail: string | null;
  status: ReportStatus;
  handled_by: string | null;
  handled_at: string | null;
  handle_note: string | null;
  created_at: string;
}

interface ProfileInfo {
  display_name: string | null;
  custom_id: string | null;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

interface PendingAction {
  reportId: string;
  next: PendingActionStatus;
  note: string;
  error: string | null;
}

/** 生成页码按钮：当前页前后各 2 页 + 首尾页，中间用省略号连接。 */
function buildPageItems(currentPage: number, totalPages: number): PageItem[] {
  const visible = new Set<number>();
  visible.add(1);
  visible.add(totalPages);
  for (let candidate = currentPage - 2; candidate <= currentPage + 2; candidate += 1) {
    if (candidate >= 1 && candidate <= totalPages) visible.add(candidate);
  }

  const sorted = Array.from(visible).sort((left, right) => left - right);
  const items: PageItem[] = [];
  let previous = 0;
  for (const pageNumber of sorted) {
    if (previous !== 0 && pageNumber - previous > 1) items.push('ellipsis');
    items.push(pageNumber);
    previous = pageNumber;
  }
  return items;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function isTargetType(value: string): value is TargetType {
  return TARGET_TYPES.some((type) => type.value === value);
}

function isReportStatus(value: unknown): value is ReportStatus {
  return value === 'open' || value === 'reviewing' || value === 'resolved' || value === 'rejected';
}

/** 只把站内路径渲染成可点击链接，避免把外部/协议相对地址当成站内 Link。 */
function isInternalPath(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('\\') &&
    !/\s/.test(trimmed)
  );
}

function targetTypeLabel(value: string): string {
  const found = TARGET_TYPES.find((type) => type.value === value);
  return found ? found.label : '其他';
}

function formatTime(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '操作失败，请稍后重试';
}

/** 仅 open 且创建超过 24 小时未处理的举报标记为超时。 */
function isOverdue(report: ReportRow, now: number): boolean {
  if (report.status !== 'open' || now <= 0) return false;
  const createdAt = new Date(report.created_at).getTime();
  return Number.isFinite(createdAt) && now - createdAt > OVERDUE_MS;
}

function toReportRow(raw: unknown): ReportRow | null {
  if (!isRecord(raw)) return null;

  const id = asText(raw.id);
  const reporterId = asText(raw.reporter_id);
  const createdAt = asText(raw.created_at);
  if (!id || !reporterId || !createdAt) return null;

  const targetType = asText(raw.target_type);

  return {
    id,
    reporter_id: reporterId,
    target_type: targetType && isTargetType(targetType) ? targetType : 'other',
    target_id: asText(raw.target_id),
    target_url: asText(raw.target_url),
    reason: asText(raw.reason) ?? '',
    detail: typeof raw.detail === 'string' && raw.detail.trim() ? raw.detail : null,
    status: isReportStatus(raw.status) ? raw.status : 'open',
    handled_by: asText(raw.handled_by),
    handled_at: asText(raw.handled_at),
    handle_note:
      typeof raw.handle_note === 'string' && raw.handle_note.trim() ? raw.handle_note : null,
    created_at: createdAt,
  };
}

function toReportRows(data: unknown): ReportRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(toReportRow).filter((row): row is ReportRow => row !== null);
}

function toProfileMap(data: unknown): Record<string, ProfileInfo> {
  const map: Record<string, ProfileInfo> = {};
  if (!Array.isArray(data)) return map;

  for (const item of data) {
    if (!isRecord(item)) continue;
    const id = asText(item.id);
    if (!id) continue;
    map[id] = {
      display_name: typeof item.display_name === 'string' ? item.display_name : null,
      custom_id: typeof item.custom_id === 'string' ? item.custom_id : null,
    };
  }

  return map;
}

const SELECT_COLUMNS =
  'id,reporter_id,target_type,target_id,target_url,reason,detail,status,handled_by,handled_at,handle_note,created_at';

export default function AdminReportsPage() {
  const tr = useTr(EN);
  const locale = useLocale();
  const router = useRouter();
  const listTopRef = useRef<HTMLDivElement | null>(null);
  const scrollToTopPendingRef = useRef(false);

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // 列表加载完成时记录当前时间，用于判断 24 小时超时（不在渲染期间读取时钟）。
  const [now, setNow] = useState(0);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [page, setPage] = useState(1);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // 1. 权限：未登录 -> /login；非 Lv.40+ -> alert + /admin
  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          router.push('/login');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role_level')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;

        if (!canAccessAdmin(levelOf(profile?.role_level))) {
          alert(translate(locale, '🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能处理举报。'));
          router.push('/admin');
          return;
        }

        setUserId(user.id);
        setChecking(false);
      } catch (error) {
        if (cancelled) return;
        alert(
          translate(locale, '无法验证权限：{msg}', {
            msg: translate(locale, errorMessage(error)),
          })
        );
        router.push('/admin');
      }
    };

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router, locale]);

  // 2. 列表：服务端分页，只取当前页（status/type 条件同时作用于 count 与 range）；再二次查询本页举报人/处理人资料
  useEffect(() => {
    if (checking || !userId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const finishLoading = () => {
        setLoading(false);
        if (scrollToTopPendingRef.current) {
          scrollToTopPendingRef.current = false;
          listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };

      try {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
          .from('reports')
          .select(SELECT_COLUMNS, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (typeFilter !== 'all') query = query.eq('target_type', typeFilter);

        const { data, count, error } = await query;
        if (cancelled) return;

        if (error) {
          // 出错时保留现有列表，只提示错误并提供重试。
          setLoadError(error.message);
          setLoading(false);
          return;
        }

        const rows = toReportRows(data);
        // count 由 Content-Range 解析而来；缺失时至少保证当前页可用，避免误判为 0 条。
        const nextTotal =
          typeof count === 'number' ? count : (page - 1) * PAGE_SIZE + rows.length;
        const lastPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        setTotalCount(nextTotal);

        // 越界保护：处理/删除后总页数变小，回退到最后一页重新请求（期间保持 loading）。
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }

        setReports(rows);
        setNow(Date.now());

        const profileIds = Array.from(
          new Set([
            // 把自己也算进去：处理后就地更新时能直接显示处理人名称。
            userId,
            ...rows
              .flatMap((row) => [row.reporter_id, row.handled_by])
              .filter((value): value is string => typeof value === 'string' && value.length > 0),
          ])
        );

        if (profileIds.length === 0) {
          setProfiles({});
          finishLoading();
          return;
        }

        // 分块查询，避免把多行 UUID 的 PostgREST URL 拉得过长。
        const mergedProfiles: Record<string, ProfileInfo> = {};
        const PROFILE_CHUNK_SIZE = 100;
        for (let index = 0; index < profileIds.length; index += PROFILE_CHUNK_SIZE) {
          const chunk = profileIds.slice(index, index + PROFILE_CHUNK_SIZE);
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id,display_name,custom_id')
            .in('id', chunk);
          if (cancelled) return;

          if (profileError) {
            console.error('加载举报人资料失败:', profileError.message);
            continue;
          }

          Object.assign(mergedProfiles, toProfileMap(profileData));
        }

        setProfiles(mergedProfiles);
        finishLoading();
      } catch (error) {
        if (cancelled) return;
        setLoadError(translate(locale, errorMessage(error)));
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [checking, userId, statusFilter, typeFilter, page, reloadToken, locale]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const hasFilters = statusFilter !== 'all' || typeFilter !== 'all';
  const pageItems = buildPageItems(currentPage, totalPages);

  const goToPage = (target: number) => {
    if (loading) return;
    const next = Math.min(Math.max(1, Math.trunc(target)), totalPages);
    if (next === page) return;
    scrollToTopPendingRef.current = true;
    setPage(next);
  };

  const reloadCurrentPage = () => {
    setReloadToken((value) => value + 1);
  };

  const profileName = (id: string | null): string => {
    if (!id) return '——';
    const profile = profiles[id];
    if (!profile) return tr('未知用户');
    const name = profile.display_name?.trim() || tr('未命名用户');
    return profile.custom_id ? tr('{name}（{id}）', { name, id: profile.custom_id }) : name;
  };

  const startAction = (reportId: string, next: PendingActionStatus) => {
    setNotice(null);
    setAction({ reportId, next, note: '', error: null });
  };

  const cancelAction = () => setAction(null);

  const applyUpdate = async (report: ReportRow, next: ReportStatus, note = '') => {
    if (busyId !== null || !userId) return;

    const trimmedNote = note.trim();
    if ((next === 'resolved' || next === 'rejected') && !trimmedNote) {
      setAction((previous) =>
        previous && previous.reportId === report.id
          ? { ...previous, error: tr('请填写处理备注。') }
          : previous
      );
      return;
    }

    setBusyId(report.id);
    setNotice(null);

    try {
      const payload: { status: ReportStatus; handled_by: string; handle_note?: string } = {
        status: next,
        handled_by: userId,
      };
      if (next === 'resolved' || next === 'rejected') {
        payload.handle_note = trimmedNote;
      }

      const { data, error } = await supabase
        .from('reports')
        .update(payload)
        .eq('id', report.id)
        .select(SELECT_COLUMNS)
        .single();

      if (error) {
        const text =
          error.code === 'PGRST116'
            ? tr('没有找到该举报，或当前账号无权处理。')
            : tr('更新失败：{msg}', { msg: error.message });
        setNotice({ kind: 'error', text });
        return;
      }

      const updated = toReportRow(data);
      setAction(null);

      if (updated) {
        const matchesStatus = statusFilter === 'all' || statusFilter === updated.status;
        const matchesType = typeFilter === 'all' || typeFilter === updated.target_type;
        if (matchesStatus && matchesType) {
          // 就地替换当前页中的这一条，不必整页重查。
          setReports((previous) =>
            previous.map((row) => (row.id === updated.id ? updated : row))
          );
        } else {
          // 状态变化后不再符合当前筛选：重新拉取当前页（页码越界会由加载逻辑自动回退）。
          reloadCurrentPage();
        }
      } else {
        reloadCurrentPage();
      }

      setNotice({
        kind: 'success',
        text: tr('举报 #{id} 已更新为「{status}」。', {
          id: report.id,
          status: tr(STATUS_META[next].label),
        }),
      });
    } catch (error) {
      setNotice({ kind: 'error', text: tr('更新失败：{msg}', { msg: tr(errorMessage(error)) }) });
    } finally {
      setBusyId(null);
    }
  };

  const handleActionSubmit = async (report: ReportRow) => {
    if (!action || action.reportId !== report.id) return;
    await applyUpdate(report, action.next, action.note);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#18191c] text-white">
        {tr('验证权限中...')}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#18191c] p-4 font-sans text-gray-300 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">{tr('🚩 举报处理')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {tr('处理玩家举报与申诉；状态变更后系统会自动通知举报人。')}
            </p>
          </div>
          <Link href="/admin" className="text-sm text-gray-400 transition hover:text-white">
            {tr('← 返回控制台')}
          </Link>
        </div>

        <p className="mb-4 rounded border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
          {tr('超过 24 小时未处理的举报会自动升级提醒')}
        </p>

        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 md:flex-row md:items-end">
          <div className="w-full md:w-48">
            <label htmlFor="report-status-filter" className={labelClass}>
              {tr('状态')}
            </label>
            <select
              id="report-status-filter"
              value={statusFilter}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'all' || isReportStatus(value)) {
                  setStatusFilter(value);
                  // 改变筛选条件后回到第 1 页。
                  setPage(1);
                }
                setAction(null);
              }}
              disabled={loading}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {tr(option.label)}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-48">
            <label htmlFor="report-type-filter" className={labelClass}>
              {tr('类型')}
            </label>
            <select
              id="report-type-filter"
              value={typeFilter}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'all' || isTargetType(value)) {
                  setTypeFilter(value);
                  setPage(1);
                }
                setAction(null);
              }}
              disabled={loading}
              className={inputClass}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {tr(option.label)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:ml-auto">
            <button
              type="button"
              onClick={reloadCurrentPage}
              disabled={loading}
              className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-blue-500 hover:text-white disabled:opacity-50"
            >
              {loading ? tr('刷新中...') : tr('刷新')}
            </button>
            <span className="text-xs text-gray-500">
              {tr('共 {count} 条 · 第 {page} / {total} 页（每页 {size} 条）', {
                count: totalCount,
                page: currentPage,
                total: totalPages,
                size: PAGE_SIZE,
              })}
            </span>
          </div>
        </div>

        {loadError && (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-2 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="break-all">
              {tr('加载失败：{msg}', { msg: loadError })}
            </span>
            <button
              type="button"
              onClick={reloadCurrentPage}
              disabled={loading}
              className="shrink-0 rounded bg-red-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              {tr('重试')}
            </button>
          </div>
        )}

        {notice && (
          <p
            className={`mb-4 rounded border px-4 py-3 text-sm ${
              notice.kind === 'success'
                ? 'border-green-500/40 bg-green-500/10 text-green-300'
                : 'border-red-500/40 bg-red-500/10 text-red-300'
            }`}
          >
            {notice.text}
          </p>
        )}

        <div ref={listTopRef} className="scroll-mt-6">
          {loading && reports.length === 0 ? (
            <div
              aria-busy="true"
              aria-live="polite"
              className="space-y-4"
            >
              <p className="text-center text-sm text-gray-500">{tr('加载中...')}</p>
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-lg border border-gray-700/40 bg-[#232428]"
                />
              ))}
            </div>
          ) : null}

          {!loading && !loadError && reports.length === 0 ? (
            <p className="rounded border border-gray-700 bg-[#2c2d31] px-4 py-12 text-center text-sm text-gray-500">
              {hasFilters ? tr('没有符合当前筛选条件的举报。') : tr('暂无举报记录。')}
            </p>
          ) : null}

          {reports.length > 0 ? (
            <>
              <ul
                aria-busy={loading}
                className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}
              >
                {reports.map((report) => {
                  const meta = STATUS_META[report.status];
                  const busy = busyId === report.id;
                  const activeAction =
                    action !== null && action.reportId === report.id ? action : null;
                  const overdue = isOverdue(report, now);

                  return (
                    <li
                      key={report.id}
                      className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${meta.className}`}
                        >
                          {tr(meta.label)}
                        </span>
                        {overdue ? (
                          <span className="inline-flex items-center rounded border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-300">
                            {tr('超时未处理（>24h）')}
                          </span>
                        ) : null}
                        <span className="rounded border border-gray-600 bg-[#232428] px-2 py-0.5 text-xs text-gray-300">
                          {tr(targetTypeLabel(report.target_type))}
                        </span>
                        <span className="text-xs text-gray-500">#{report.id}</span>
                        <span className="text-xs text-gray-500">{formatTime(report.created_at)}</span>
                      </div>

                      <p className="mt-3 text-sm font-bold text-white">
                        {tr('原因：{reason}', { reason: report.reason || tr('未填写原因') })}
                      </p>
                      {report.detail && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-300">
                          {report.detail}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                        <span>
                          {tr('对象：{type}{id}', {
                            type: tr(targetTypeLabel(report.target_type)),
                            id: report.target_id
                              ? ` #${report.target_id}`
                              : tr('（未提供 ID）'),
                          })}
                        </span>
                        {report.target_url && isInternalPath(report.target_url) ? (
                          <Link
                            href={report.target_url}
                            className="text-blue-400 transition hover:text-blue-300"
                          >
                            {tr('查看目标 ↗')}
                          </Link>
                        ) : report.target_url ? (
                          <span className="break-all">
                            {tr('链接：{url}', { url: report.target_url })}
                          </span>
                        ) : null}
                        <span>
                          {tr('举报人：{name}', { name: profileName(report.reporter_id) })}
                        </span>
                      </div>

                      <div className="mt-3 border-t border-gray-700/60 pt-3 text-xs text-gray-400">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            {tr('处理人：{name}', {
                              name: report.handled_by ? profileName(report.handled_by) : '——',
                            })}
                          </span>
                          <span>
                            {tr('处理时间：{time}', {
                              time: report.handled_at ? formatTime(report.handled_at) : '——',
                            })}
                          </span>
                        </div>
                        {report.handle_note && (
                          <p className="mt-2 whitespace-pre-wrap break-words text-gray-300">
                            {tr('处理备注：{note}', { note: report.handle_note })}
                          </p>
                        )}
                      </div>

                      {report.status === 'open' || report.status === 'reviewing' ? (
                        <div className="mt-4">
                          {activeAction ? (
                            <div className="rounded border border-orange-500/40 bg-[#232428] p-3">
                              <p className="mb-2 text-sm text-white">
                                {tr('将举报 #{id} 标记为「{status}」', {
                                  id: report.id,
                                  status: tr(STATUS_META[activeAction.next].label),
                                })}
                              </p>
                              <textarea
                                value={activeAction.note}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setAction((previous) =>
                                    previous && previous.reportId === report.id
                                      ? { ...previous, note: value, error: null }
                                      : previous
                                  );
                                }}
                                rows={3}
                                maxLength={1000}
                                placeholder={tr('请填写处理备注（必填），会展示给举报人。')}
                                className={`${inputClass} resize-y`}
                              />
                              {activeAction.error && (
                                <p className="mt-1 text-xs text-red-400">{activeAction.error}</p>
                              )}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleActionSubmit(report)}
                                  disabled={busy || activeAction.note.trim() === ''}
                                  className="rounded bg-orange-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {busy ? tr('提交中...') : tr('确认提交')}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelAction}
                                  disabled={busy}
                                  className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:text-white disabled:opacity-50"
                                >
                                  {tr('取消')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {report.status === 'open' && (
                                <button
                                  type="button"
                                  onClick={() => void applyUpdate(report, 'reviewing')}
                                  disabled={busyId !== null}
                                  className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {busy ? tr('处理中...') : tr('开始处理')}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => startAction(report.id, 'resolved')}
                                disabled={busyId !== null}
                                className="rounded bg-green-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {tr('标记已处理')}
                              </button>
                              <button
                                type="button"
                                onClick={() => startAction(report.id, 'rejected')}
                                disabled={busyId !== null}
                                className="rounded border border-gray-600 bg-[#232428] px-4 py-2 text-sm text-gray-300 transition hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {tr('驳回')}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-lg border border-gray-700 bg-[#2c2d31] px-4 py-3 shadow-lg sm:flex-row">
                <p className="text-xs text-gray-500">
                  {tr('共 {count} 条 · 第 {page} / {total} 页', {
                    count: totalCount,
                    page: currentPage,
                    total: totalPages,
                  })}
                  <span className="ml-2 text-gray-600">
                    {tr('（每页 {size} 条）', { size: PAGE_SIZE })}
                  </span>
                </p>
                <nav aria-label={tr('举报列表分页')} className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={loading || currentPage <= 1}
                    className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {tr('上一页')}
                  </button>

                  {pageItems.map((item, index) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${index}`} className="px-1 text-xs text-gray-600">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => goToPage(item)}
                        disabled={loading}
                        aria-current={item === currentPage ? 'page' : undefined}
                        className={`min-w-8 rounded border px-2.5 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          item === currentPage
                            ? 'border-blue-500 bg-blue-600 font-bold text-white'
                            : 'border-gray-600 text-gray-300 hover:border-blue-500 hover:text-white'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={loading || currentPage >= totalPages}
                    className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {tr('下一页')}
                  </button>
                </nav>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
