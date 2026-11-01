// app/admin/reports/page.tsx
// 后台：举报处理（Lv.40+）。
// 数据库侧约束：
//   · SELECT 全部举报、UPDATE 状态要求 rct_role_level() >= 40；
//   · 触发器 trg_reports_touch_handled 自动补 handled_at / handled_by；
//   · 触发器 trg_reports_notify 在状态变化时给举报人写 notifications（type='report'）。
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canAccessAdmin, levelOf } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_ROWS = 200;

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
    reason: asText(raw.reason) ?? '未填写原因',
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
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

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
          alert('🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能处理举报。');
          router.push('/admin');
          return;
        }

        setUserId(user.id);
        setChecking(false);
      } catch (error) {
        if (cancelled) return;
        alert(`无法验证权限：${errorMessage(error)}`);
        router.push('/admin');
      }
    };

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // 2. 列表：状态 + 类型筛选，created_at desc，最多最近 200 条；再二次查询举报人/处理人资料
  useEffect(() => {
    if (checking || !userId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        let query = supabase
          .from('reports')
          .select(SELECT_COLUMNS)
          .order('created_at', { ascending: false })
          .limit(MAX_ROWS);

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (typeFilter !== 'all') query = query.eq('target_type', typeFilter);

        const { data, error } = await query;
        if (cancelled) return;

        if (error) {
          setLoadError(error.message);
          setReports([]);
          setProfiles({});
          return;
        }

        const rows = toReportRows(data);
        setReports(rows);

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
          return;
        }

        // 分块查询，避免 200 条举报的 UUID 把 PostgREST 的 URL 拉得过长。
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
      } catch (error) {
        if (!cancelled) {
          setLoadError(errorMessage(error));
          setReports([]);
          setProfiles({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [checking, userId, statusFilter, typeFilter, reloadToken]);

  const profileName = (id: string | null): string => {
    if (!id) return '——';
    const profile = profiles[id];
    if (!profile) return '未知用户';
    const name = profile.display_name?.trim() || '未命名用户';
    return profile.custom_id ? `${name}（${profile.custom_id}）` : name;
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
          ? { ...previous, error: '请填写处理备注。' }
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
            ? '没有找到该举报，或当前账号无权处理。'
            : `更新失败：${error.message}`;
        setNotice({ kind: 'error', text });
        return;
      }

      const updated = toReportRow(data);
      setAction(null);

      if (updated) {
        setReports((previous) => {
          const matchesStatus = statusFilter === 'all' || statusFilter === updated.status;
          const matchesType = typeFilter === 'all' || typeFilter === updated.target_type;
          if (!matchesStatus || !matchesType) {
            return previous.filter((row) => row.id !== updated.id);
          }
          return previous.map((row) => (row.id === updated.id ? updated : row));
        });
      } else {
        setReloadToken((value) => value + 1);
      }

      setNotice({
        kind: 'success',
        text: `举报 #${report.id} 已更新为「${STATUS_META[next].label}」。`,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: `更新失败：${errorMessage(error)}` });
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
        验证权限中...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#18191c] p-4 font-sans text-gray-300 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">🚩 举报处理</h1>
            <p className="mt-1 text-sm text-gray-500">
              处理玩家举报与申诉；状态变更后系统会自动通知举报人。
            </p>
          </div>
          <Link href="/admin" className="text-sm text-gray-400 transition hover:text-white">
            ← 返回控制台
          </Link>
        </div>

        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 md:flex-row md:items-end">
          <div className="w-full md:w-48">
            <label htmlFor="report-status-filter" className={labelClass}>
              状态
            </label>
            <select
              id="report-status-filter"
              value={statusFilter}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'all' || isReportStatus(value)) setStatusFilter(value);
                setAction(null);
              }}
              disabled={loading}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-48">
            <label htmlFor="report-type-filter" className={labelClass}>
              类型
            </label>
            <select
              id="report-type-filter"
              value={typeFilter}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'all' || isTargetType(value)) setTypeFilter(value);
                setAction(null);
              }}
              disabled={loading}
              className={inputClass}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 md:ml-auto">
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              disabled={loading}
              className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-blue-500 hover:text-white disabled:opacity-50"
            >
              {loading ? '刷新中...' : '刷新'}
            </button>
            <span className="text-xs text-gray-500">
              共 {reports.length} 条（最多最近 {MAX_ROWS} 条）
            </span>
          </div>
        </div>

        {loadError && (
          <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            加载失败：{loadError}
          </p>
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

        {loading ? (
          <p className="py-12 text-center text-sm text-gray-500">加载中...</p>
        ) : loadError ? null : reports.length === 0 ? (
          <p className="rounded border border-gray-700 bg-[#2c2d31] px-4 py-12 text-center text-sm text-gray-500">
            没有符合条件的举报。
          </p>
        ) : (
          <ul className="space-y-4">
            {reports.map((report) => {
              const meta = STATUS_META[report.status];
              const busy = busyId === report.id;
              const activeAction =
                action !== null && action.reportId === report.id ? action : null;

              return (
                <li
                  key={report.id}
                  className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                    <span className="rounded border border-gray-600 bg-[#232428] px-2 py-0.5 text-xs text-gray-300">
                      {targetTypeLabel(report.target_type)}
                    </span>
                    <span className="text-xs text-gray-500">#{report.id}</span>
                    <span className="text-xs text-gray-500">{formatTime(report.created_at)}</span>
                  </div>

                  <p className="mt-3 text-sm font-bold text-white">原因：{report.reason}</p>
                  {report.detail && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-300">
                      {report.detail}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span>
                      对象：{targetTypeLabel(report.target_type)}
                      {report.target_id ? ` #${report.target_id}` : '（未提供 ID）'}
                    </span>
                    {report.target_url && isInternalPath(report.target_url) ? (
                      <Link
                        href={report.target_url}
                        className="text-blue-400 transition hover:text-blue-300"
                      >
                        查看目标 ↗
                      </Link>
                    ) : report.target_url ? (
                      <span className="break-all">链接：{report.target_url}</span>
                    ) : null}
                    <span>举报人：{profileName(report.reporter_id)}</span>
                  </div>

                  <div className="mt-3 border-t border-gray-700/60 pt-3 text-xs text-gray-400">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        处理人：{report.handled_by ? profileName(report.handled_by) : '——'}
                      </span>
                      <span>
                        处理时间：{report.handled_at ? formatTime(report.handled_at) : '——'}
                      </span>
                    </div>
                    {report.handle_note && (
                      <p className="mt-2 whitespace-pre-wrap break-words text-gray-300">
                        处理备注：{report.handle_note}
                      </p>
                    )}
                  </div>

                  {report.status === 'open' || report.status === 'reviewing' ? (
                    <div className="mt-4">
                      {activeAction ? (
                        <div className="rounded border border-orange-500/40 bg-[#232428] p-3">
                          <p className="mb-2 text-sm text-white">
                            将举报 #{report.id} 标记为「{STATUS_META[activeAction.next].label}」
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
                            placeholder="请填写处理备注（必填），会展示给举报人。"
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
                              {busy ? '提交中...' : '确认提交'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelAction}
                              disabled={busy}
                              className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:text-white disabled:opacity-50"
                            >
                              取消
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
                              {busy ? '处理中...' : '开始处理'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => startAction(report.id, 'resolved')}
                            disabled={busyId !== null}
                            className="rounded bg-green-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            标记已处理
                          </button>
                          <button
                            type="button"
                            onClick={() => startAction(report.id, 'rejected')}
                            disabled={busyId !== null}
                            className="rounded border border-gray-600 bg-[#232428] px-4 py-2 text-sm text-gray-300 transition hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            驳回
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
