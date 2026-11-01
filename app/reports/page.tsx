// app/reports/page.tsx
// 玩家侧：提交举报 + 查看「我的举报」。
// 数据库侧约束（不要在前端自行查询 rct_is_steam_verified）：
//   · INSERT 要求 reporter_id = auth.uid() 且账号已完成 Steam 验证；
//   · SELECT 只能看到自己的举报（Lv.40+ 可看全部）；
//   · 状态变更由触发器自动写 notifications 并补 handled_at / handled_by。
'use client';

import { Suspense, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Navbar from '../../components/Navbar';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TARGET_TYPES = [
  { value: 'topic', label: '帖子' },
  { value: 'reply', label: '回复' },
  { value: 'profile', label: '用户' },
  { value: 'vtc', label: '车队' },
  { value: 'event', label: '活动' },
  { value: 'other', label: '其他' },
] as const;

type TargetType = (typeof TARGET_TYPES)[number]['value'];

const REASONS = ['垃圾广告', '人身攻击', '色情或违法', '冒充官方', '作弊', '其他'] as const;

const MAX_DETAIL = 1000;
const MAX_REPORTS = 20;

type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'rejected';

interface ReportRow {
  id: string;
  target_type: string;
  target_id: string | null;
  target_url: string | null;
  reason: string;
  detail: string | null;
  status: ReportStatus;
  handle_note: string | null;
  created_at: string;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

const STATUS_META: Record<ReportStatus, { label: string; className: string }> = {
  open: { label: '待处理', className: 'border-orange-500/40 bg-orange-500/15 text-orange-300' },
  reviewing: { label: '处理中', className: 'border-blue-500/40 bg-blue-500/15 text-blue-300' },
  resolved: { label: '已处理', className: 'border-green-500/40 bg-green-500/15 text-green-300' },
  rejected: { label: '未通过', className: 'border-gray-600 bg-[#232428] text-gray-400' },
};

const inputClass =
  'w-full rounded border border-gray-600 bg-[#18191c] p-3 text-white focus:border-blue-500 focus:outline-none';
const labelClass = 'mb-1 block text-sm text-gray-400';

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

function targetTypeLabel(value: string): string {
  const found = TARGET_TYPES.find((type) => type.value === value);
  return found ? found.label : '其他';
}

/**
 * 目标链接只允许站内路径：
 * 必须以单个 / 开头（排除 //host 协议相对地址），且不含反斜杠或空白字符。
 */
function isInternalPath(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('\\') &&
    !/\s/.test(trimmed)
  );
}

function toReportRow(raw: unknown): ReportRow | null {
  if (!isRecord(raw)) return null;

  const id = asText(raw.id);
  const createdAt = asText(raw.created_at);
  if (!id || !createdAt) return null;

  const targetType = asText(raw.target_type);

  return {
    id,
    target_type: targetType && isTargetType(targetType) ? targetType : 'other',
    target_id: asText(raw.target_id),
    target_url: asText(raw.target_url),
    reason: asText(raw.reason) ?? '未填写原因',
    detail: typeof raw.detail === 'string' && raw.detail.trim() ? raw.detail : null,
    status: isReportStatus(raw.status) ? raw.status : 'open',
    handle_note:
      typeof raw.handle_note === 'string' && raw.handle_note.trim() ? raw.handle_note : null,
    created_at: createdAt,
  };
}

function toReportRows(data: unknown): ReportRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(toReportRow).filter((row): row is ReportRow => row !== null);
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

/** INSERT 被 RLS 拒绝时，最常见的原因是账号尚未完成 Steam 验证，给出可操作提示。 */
function submitErrorMessage(message: string): string {
  const text = message.trim() || '提交失败，请稍后重试。';
  if (/row-level security|policy|permission|not authorized/i.test(text)) {
    return `提交被数据库拒绝：请确认账号已完成 Steam 验证，并重新登录后再试。\n（原始信息：${text}）`;
  }
  return `提交失败：${text}`;
}

function ReportsContent() {
  const searchParams = useSearchParams();

  // URL 预填：?type=topic&id=2&url=/forum/1/2
  // 用惰性初始化而不是 effect，避免挂载后多一次渲染（也避开 set-state-in-effect 规则）。
  const initialType = searchParams.get('type');
  const initialId = searchParams.get('id');
  const initialUrl = searchParams.get('url');

  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [targetType, setTargetType] = useState<TargetType>(
    initialType && isTargetType(initialType) ? initialType : 'topic'
  );
  const [targetId, setTargetId] = useState(initialId ?? '');
  const [targetUrl, setTargetUrl] = useState(
    initialUrl && isInternalPath(initialUrl) ? initialUrl : ''
  );
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // 1. 登录状态（举报必须登录；Steam 验证交给数据库策略兜底，避免前端重复查询）
  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        setUserId(user?.id ?? null);
      } catch {
        if (!cancelled) setUserId(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. 我的举报（最多最近 20 条）
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const load = async () => {
      setReportsLoading(true);
      setReportsError(null);

      try {
        const { data, error } = await supabase
          .from('reports')
          .select(
            'id,target_type,target_id,target_url,reason,detail,status,handle_note,created_at'
          )
          .eq('reporter_id', userId)
          .order('created_at', { ascending: false })
          .limit(MAX_REPORTS);

        if (cancelled) return;

        if (error) {
          setReportsError(error.message);
          setReports([]);
          return;
        }

        setReports(toReportRows(data));
      } catch (error) {
        if (!cancelled) {
          setReportsError(errorMessage(error));
          setReports([]);
        }
      } finally {
        if (!cancelled) setReportsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, reloadToken]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (!userId) {
      setNotice({ kind: 'error', text: '登录状态已失效，请重新登录后再提交。' });
      return;
    }

    const trimmedReason = reason.trim();
    const trimmedDetail = detail.trim();
    const trimmedUrl = targetUrl.trim();

    if (!trimmedReason) {
      setNotice({ kind: 'error', text: '请选择举报原因。' });
      return;
    }
    if (!trimmedDetail) {
      setNotice({ kind: 'error', text: '请填写详细说明。' });
      return;
    }
    if (trimmedDetail.length > MAX_DETAIL) {
      setNotice({ kind: 'error', text: `详细说明不能超过 ${MAX_DETAIL} 字。` });
      return;
    }
    if (trimmedUrl && !isInternalPath(trimmedUrl)) {
      setNotice({ kind: 'error', text: '目标链接只能填写以 / 开头的站内路径。' });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      const { error } = await supabase.from('reports').insert({
        reporter_id: userId,
        target_type: targetType,
        target_id: targetId.trim() || null,
        target_url: trimmedUrl || null,
        reason: trimmedReason,
        detail: trimmedDetail,
      });

      if (error) {
        setNotice({ kind: 'error', text: submitErrorMessage(error.message) });
        return;
      }

      setTargetType('topic');
      setTargetId('');
      setTargetUrl('');
      setReason('');
      setDetail('');
      setNotice({
        kind: 'success',
        text: '✅ 举报已提交，我们会尽快处理。你可以在下方「我的举报」中查看进度。',
      });
      setReloadToken((value) => value + 1);
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-20 text-center text-gray-500 md:px-6">
        正在验证登录状态...
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16 md:px-6">
        <div className="rounded-xl border border-gray-700 bg-[#2c2d31] p-8 text-center shadow-lg">
          <div className="text-4xl">🚩</div>
          <h1 className="mt-3 text-2xl font-bold text-white">举报与申诉</h1>
          <p className="mt-3 text-sm text-gray-400">
            提交举报需要先登录社区账号；提交时账号还需完成 Steam 正版验证。
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded bg-blue-600 px-6 py-2.5 font-bold text-white transition hover:bg-blue-700"
          >
            前往登录
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <div className="mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-3xl font-bold text-white">🚩 举报与申诉</h1>
        <p className="mt-2 text-sm text-gray-500">
          发现违规内容或行为？请填写下方表单，处理进度会通过站内通知告知。
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border border-gray-700 bg-[#2c2d31] p-5 shadow-lg md:p-6"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="report-type" className={labelClass}>
              举报类型 <span className="text-red-400">*</span>
            </label>
            <select
              id="report-type"
              value={targetType}
              onChange={(event) => {
                const value = event.target.value;
                if (isTargetType(value)) setTargetType(value);
              }}
              className={inputClass}
            >
              {TARGET_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="report-target-id" className={labelClass}>
              目标 ID（选填）
            </label>
            <input
              id="report-target-id"
              type="text"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className={inputClass}
              placeholder="例如 2"
            />
          </div>
        </div>

        <div>
          <label htmlFor="report-target-url" className={labelClass}>
            目标链接（选填，仅支持以 / 开头的站内路径）
          </label>
          <input
            id="report-target-url"
            type="text"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            className={inputClass}
            placeholder="/forum/1/2"
          />
          {targetUrl.trim() !== '' && !isInternalPath(targetUrl) && (
            <p className="mt-1 text-xs text-red-400">
              链接必须以 / 开头，且不能指向外部站点。
            </p>
          )}
        </div>

        <div>
          <label htmlFor="report-reason" className={labelClass}>
            举报原因 <span className="text-red-400">*</span>
          </label>
          <select
            id="report-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={inputClass}
            required
          >
            <option value="">请选择举报原因</option>
            {REASONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="report-detail" className={labelClass}>
            详细说明 <span className="text-red-400">*</span>
          </label>
          <textarea
            id="report-detail"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            className={`${inputClass} min-h-[120px] resize-y`}
            rows={5}
            maxLength={MAX_DETAIL}
            required
            placeholder="请说明发生了什么、发生时间，以及涉及的玩家或内容，便于我们核实。"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
            <span>请尽量提供可核实的信息。</span>
            <span className={detail.length >= MAX_DETAIL ? 'text-orange-400' : ''}>
              {detail.length}/{MAX_DETAIL}
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? '提交中...' : '提交举报'}
        </button>

        {notice && (
          <p
            className={`whitespace-pre-line rounded border px-4 py-3 text-sm ${
              notice.kind === 'success'
                ? 'border-green-500/40 bg-green-500/10 text-green-300'
                : 'border-red-500/40 bg-red-500/10 text-red-300'
            }`}
          >
            {notice.text}
          </p>
        )}
      </form>

      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-white">我的举报</h2>
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            disabled={reportsLoading}
            className="text-sm text-blue-400 transition hover:text-blue-300 disabled:opacity-50"
          >
            {reportsLoading ? '刷新中...' : '刷新'}
          </button>
        </div>

        {reportsError && (
          <p className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            加载失败：{reportsError}
          </p>
        )}

        {reportsLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">加载中...</p>
        ) : reports.length === 0 ? (
          <p className="rounded border border-gray-700 bg-[#232428] px-4 py-8 text-center text-sm text-gray-500">
            还没有提交过举报。
          </p>
        ) : (
          <ul className="space-y-4">
            {reports.map((report) => {
              const meta = STATUS_META[report.status];
              return (
                <li
                  key={report.id}
                  className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg"
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
                    <span className="text-xs text-gray-500">{formatTime(report.created_at)}</span>
                  </div>

                  <p className="mt-3 text-sm font-bold text-white">原因：{report.reason}</p>

                  {report.detail && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-300">
                      {report.detail}
                    </p>
                  )}

                  {(report.target_id || report.target_url) && (
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                      <span>
                        举报对象：
                        {targetTypeLabel(report.target_type)}
                        {report.target_id ? ` #${report.target_id}` : ''}
                      </span>
                      {report.target_url && isInternalPath(report.target_url) && (
                        <Link
                          href={report.target_url}
                          className="text-blue-400 transition hover:text-blue-300"
                        >
                          查看目标 ↗
                        </Link>
                      )}
                    </p>
                  )}

                  {report.handle_note && (
                    <p className="mt-3 whitespace-pre-wrap break-words rounded border border-gray-700 bg-[#232428] px-3 py-2 text-xs text-gray-300">
                      处理备注：{report.handle_note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {reports.length >= MAX_REPORTS && (
          <p className="mt-3 text-center text-xs text-gray-500">仅显示最近 {MAX_REPORTS} 条举报。</p>
        )}
      </section>
    </main>
  );
}

export default function ReportsPage() {
  return (
    <div className="min-h-screen bg-[#18191c] font-sans text-gray-300">
      <Navbar />
      <Suspense fallback={<div className="px-6 py-20 text-center text-gray-500">加载中...</div>}>
        <ReportsContent />
      </Suspense>
    </div>
  );
}
