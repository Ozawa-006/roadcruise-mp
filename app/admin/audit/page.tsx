// app/admin/audit/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTr } from '@/components/I18nProvider';
import { formatMessage, tr as trFor, type Locale } from '@/lib/i18n';
import { canEditRules, levelOf, roleLabelEn, roleLabelFromLevel } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 服务端分页：每次只取当前页的 50 条（select + count: 'exact' + range），
// 表/动作筛选全部下推到 PostgREST，不再依赖一次性大 limit 兜底。
const PAGE_SIZE = 50;

/** 静态 UI 文案：中文原文 -> 英文；英文缺失时 useTr 回退中文。 */
const EN: Record<string, string> = {
  // 表格筛选与动作
  '全部': 'All',
  'profiles（用户/权限）': 'profiles (users / permissions)',
  'vtcs（车队）': 'vtcs (VTCs)',
  'events（活动）': 'events (events)',
  'vtc_news（车队新闻）': 'vtc_news (VTC news)',
  'rules_articles（规则）': 'rules_articles (rules)',
  'announcements（公告）': 'announcements (announcements)',
  '新增': 'Insert',
  '修改': 'Update',
  '删除': 'Delete',
  '未知': 'Unknown',
  '用户资料': 'User profiles',
  '车队': 'VTCs',
  '活动': 'Events',
  '车队新闻': 'VTC news',
  '社区规则': 'Community rules',
  '公告': 'Announcements',
  // detail 摘要
  '无详情': 'No details',
  '字段无变化': 'No field changes',
  '新增记录': 'Record created',
  '删除记录': 'Record deleted',
  '；': '; ',
  '，': ', ',
  '；等 {count} 项': '; {count} more',
  '新增：{items}': 'New: {items}',
  '删除：{items}': 'Deleted: {items}',
  ' 等 {count} 项': ' and {count} more',
  '无法序列化 detail': 'Unable to serialize detail',
  // 页头与权限
  '操作审计': 'Audit Log',
  '记录权限、车队、活动、规则等关键变更':
    'Tracks key changes to permissions, VTCs, events, rules and more',
  '当前身份：': 'Signed in as: ',
  '只读 · 触发器写入': 'Read-only · written by triggers',
  '← 返回控制台': '← Back to console',
  '未分配': 'Unassigned',
  '验证权限中...': 'Checking permissions...',
  '无权限访问': 'Access denied',
  '操作审计仅对高级社区经理 (Lv.90) 及以上级别开放。':
    'The audit log is available to Senior Community Managers (Lv.90) and above only.',
  '🚫 权限不足：只有高级社区经理 (Lv.90) 及以上级别才能查看操作审计日志。':
    '🚫 Insufficient permissions: only Senior Community Managers (Lv.90) and above can view the audit log.',
  // 筛选栏
  '按表筛选': 'Filter by table',
  '按动作筛选': 'Filter by action',
  '刷新中...': 'Refreshing...',
  '刷新': 'Refresh',
  '共 {count} 条 · 第 {page} / {total} 页': '{count} records · page {page} / {total}',
  '每页 {size} 条': '{size} per page',
  '服务端分页 · 仅请求当前页': 'Server-side pagination · current page only',
  '清除筛选': 'Clear filters',
  // 加载 / 空态
  '加载失败': 'Failed to load',
  '重试': 'Retry',
  '加载审计日志中...': 'Loading audit log...',
  '没有符合当前筛选条件的记录': 'No records match the current filters',
  '暂无审计记录': 'No audit records yet',
  '数据库触发器会在关键变更发生后自动写入日志。':
    'Database triggers automatically write a log entry after every key change.',
  // 表格与分页
  '时间': 'Time',
  '动作': 'Action',
  '目标': 'Target',
  '操作者': 'Actor',
  '详情': 'Details',
  '后台/系统': 'Backend / system',
  '查看变更 JSON': 'View change JSON',
  '审计日志分页': 'Audit log pagination',
  '上一页': 'Previous',
  '下一页': 'Next',
  '共 {count} 条 · 第 {page} / {total} 页（每页 {size} 条）':
    '{count} records · page {page} / {total} ({size} per page)',
};

/** 翻译函数签名：模块级工具函数按需注入。 */
type Translate = (zh: string, vars?: Record<string, string | number>) => string;

/**
 * effect / 事件回调里构造文案：tr 每次渲染都会重建，不适合放进依赖数组，
 * 这里按当前 locale 直接取词条。
 */
function translateFor(
  locale: Locale,
  zh: string,
  vars?: Record<string, string | number>
): string {
  return formatMessage(trFor(locale, EN, zh), vars);
}

/** 等级 -> roles.name 键，供 roleLabelEn 生成英文职位名。 */
function roleKeyFromLevel(level: number): string | null {
  if (level >= 100) return 'developer';
  if (level >= 90) return 'senior_manager';
  if (level >= 70) return 'manager';
  if (level >= 40) return 'staff';
  if (level >= 10) return 'member';
  return null;
}

const TABLE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'profiles', label: 'profiles（用户/权限）' },
  { value: 'vtcs', label: 'vtcs（车队）' },
  { value: 'events', label: 'events（活动）' },
  { value: 'vtc_news', label: 'vtc_news（车队新闻）' },
  { value: 'rules_articles', label: 'rules_articles（规则）' },
  { value: 'announcements', label: 'announcements（公告）' },
] as const;

type TableFilter = (typeof TABLE_OPTIONS)[number]['value'];
type ActionFilter = 'all' | 'insert' | 'update' | 'delete';

const ACTION_OPTIONS: ReadonlyArray<{ value: ActionFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'insert', label: '新增' },
  { value: 'update', label: '修改' },
  { value: 'delete', label: '删除' },
];

const TABLE_LABELS: Record<string, string> = {
  profiles: '用户资料',
  vtcs: '车队',
  events: '活动',
  vtc_news: '车队新闻',
  rules_articles: '社区规则',
  announcements: '公告',
};

interface AuditLogRow {
  id: string;
  actorLabel: string | null;
  actorRole: number | null;
  action: string;
  tableName: string;
  targetId: string | null;
  detail: unknown;
  createdAt: string;
}

interface AuditPageResult {
  rows: AuditLogRow[];
  totalCount: number;
  error: string | null;
}

type PageItem = number | 'ellipsis';

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

function toText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** 把 Supabase 返回的宽松 JSON 行收敛成页面需要的强类型结构，顺带过滤脏数据。 */
function normalizeAuditRow(raw: unknown): AuditLogRow | null {
  if (!isRecord(raw)) return null;

  const id = toText(raw.id);
  const createdAt = typeof raw.created_at === 'string' ? raw.created_at : '';
  if (!id || !createdAt) return null;

  return {
    id,
    actorLabel:
      typeof raw.actor_label === 'string' && raw.actor_label.trim() ? raw.actor_label : null,
    actorRole:
      typeof raw.actor_role === 'number' && Number.isFinite(raw.actor_role)
        ? raw.actor_role
        : null,
    action: typeof raw.action === 'string' ? raw.action : '',
    tableName: typeof raw.table_name === 'string' ? raw.table_name : '',
    targetId: toText(raw.target_id),
    detail: raw.detail,
    createdAt,
  };
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN');
}

function truncate(text: string, max = 48): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function formatDetailValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const serialized = JSON.stringify(value);
  return serialized ?? '—';
}

/** 生成列表里的 detail 摘要：只列有变化的字段，避免把整段 JSON 塞进界面。 */
function summarizeDetail(detail: unknown, t: Translate): string {
  if (!isRecord(detail)) return t('无详情');

  const oldData = isRecord(detail.old) ? detail.old : null;
  const newData = isRecord(detail.new) ? detail.new : null;

  if (oldData && newData) {
    const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
    const changedKeys = keys.filter((key) => {
      try {
        return JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]);
      } catch {
        return true;
      }
    });

    if (changedKeys.length === 0) return t('字段无变化');
    const parts = changedKeys
      .slice(0, 3)
      .map(
        (key) =>
          `${key}: ${truncate(formatDetailValue(oldData[key]), 24)} → ${truncate(
            formatDetailValue(newData[key]),
            24
          )}`
      );
    const separator = t('；');
    const suffix = changedKeys.length > 3 ? t('；等 {count} 项', { count: changedKeys.length }) : '';
    return `${parts.join(separator)}${suffix}`;
  }

  if (newData) {
    const keys = Object.keys(newData);
    if (keys.length === 0) return t('新增记录');
    const parts = keys
      .slice(0, 4)
      .map((key) => `${key}=${truncate(formatDetailValue(newData[key]), 24)}`);
    const suffix = keys.length > 4 ? t(' 等 {count} 项', { count: keys.length }) : '';
    return t('新增：{items}', { items: `${parts.join(t('，'))}${suffix}` });
  }

  if (oldData) {
    const keys = Object.keys(oldData);
    if (keys.length === 0) return t('删除记录');
    const parts = keys
      .slice(0, 4)
      .map((key) => `${key}=${truncate(formatDetailValue(oldData[key]), 24)}`);
    const suffix = keys.length > 4 ? t(' 等 {count} 项', { count: keys.length }) : '';
    return t('删除：{items}', { items: `${parts.join(t('，'))}${suffix}` });
  }

  return truncate(formatDetailValue(detail), 80);
}

function detailJson(detail: unknown, t: Translate): string {
  try {
    return JSON.stringify(detail, null, 2) ?? 'null';
  } catch {
    return t('无法序列化 detail');
  }
}

function actionMeta(action: string, t: Translate): { label: string; className: string } {
  switch (action) {
    case 'insert':
      return {
        label: t('新增'),
        className: 'bg-green-900/30 text-green-400 border-green-700/60',
      };
    case 'update':
      return {
        label: t('修改'),
        className: 'bg-blue-900/30 text-blue-400 border-blue-700/60',
      };
    case 'delete':
      return {
        label: t('删除'),
        className: 'bg-red-900/30 text-red-400 border-red-700/60',
      };
    default:
      return {
        label: action || t('未知'),
        className: 'bg-gray-800 text-gray-400 border-gray-600',
      };
  }
}

function tableLabel(tableName: string, t: Translate): string {
  const localized = TABLE_LABELS[tableName];
  return localized ? t(localized) : tableName;
}

/**
 * 只取指定页：count 与筛选条件共用同一条查询，range 决定实际返回的行。
 * 注意：range(from, to) 的 from/to 从 0 开始且包含端点。
 */
async function fetchAuditLogs(
  page: number,
  tableFilter: TableFilter,
  actionFilter: ActionFilter
): Promise<AuditPageResult> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (tableFilter !== 'all') query = query.eq('table_name', tableFilter);
  if (actionFilter !== 'all') query = query.eq('action', actionFilter);

  const { data, count, error } = await query;

  if (error) return { rows: [], totalCount: 0, error: error.message };

  const rows = (data ?? [])
    .map((raw) => normalizeAuditRow(raw))
    .filter((row): row is AuditLogRow => row !== null);

  // count 由 Content-Range 解析而来；缺失时至少保证当前页可用，避免误判为 0 条。
  const totalCount = typeof count === 'number' ? count : (page - 1) * PAGE_SIZE + rows.length;
  return { rows, totalCount, error: null };
}

export default function AdminAuditPage() {
  const [checking, setChecking] = useState(true);
  const [denied, setDenied] = useState(false);
  const [granted, setGranted] = useState(false);
  const [userLevel, setUserLevel] = useState(0);
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<TableFilter>('all');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const listTopRef = useRef<HTMLDivElement | null>(null);
  const scrollToTopPendingRef = useRef(false);
  const router = useRouter();
  const locale = useLocale();
  const tr = useTr(EN);
  /** 稳定的翻译函数（只随 locale 变化），供 effect 与事件回调使用。 */
  const t = useCallback(
    (zh: string, vars?: Record<string, string | number>) => translateFor(locale, zh, vars),
    [locale]
  );

  // 1. 权限门禁：未登录 -> /login；低于 Lv.90 -> alert + /admin
  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!active) return;
      // 未登录时 getUser() 会返回 AuthSessionMissingError，先按“未登录”处理，避免误显示错误页。
      if (!user) {
        router.push('/login');
        return;
      }
      if (authError) {
        setError(authError.message);
        setLoading(false);
        setChecking(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role_level')
        .eq('id', user.id)
        .single();

      if (!active) return;
      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        setChecking(false);
        return;
      }

      // 审计日志权限与数据库 RLS 一致：只看 profiles.role_level，Lv.90 及以上。
      const level = levelOf(profile?.role_level);
      if (!canEditRules(level)) {
        setDenied(true);
        setChecking(false);
        alert(t('🚫 权限不足：只有高级社区经理 (Lv.90) 及以上级别才能查看操作审计日志。'));
        router.push('/admin');
        return;
      }

      setUserLevel(level);
      setGranted(true);
      setChecking(false);
    };

    void checkAuth();
    return () => {
      active = false;
    };
  }, [router, t]);

  // 2. 服务端分页：页号 / 筛选条件 / 刷新令牌任一变化都只重新请求当前页。
  useEffect(() => {
    if (!granted) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const result = await fetchAuditLogs(page, tableFilter, actionFilter);
      if (cancelled) return;

      if (result.error) {
        // 保留现有数据，只提示错误 + 提供重试。
        setError(result.error);
        setLoading(false);
        return;
      }

      const lastPage = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));
      setTotalCount(result.totalCount);

      // 越界保护（数据被删除后总页数变小）：回到最后一页重新请求，期间保持 loading。
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }

      setRows(result.rows);
      setLoading(false);

      if (scrollToTopPendingRef.current) {
        scrollToTopPendingRef.current = false;
        listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [granted, page, tableFilter, actionFilter, reloadToken]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const hasFilters = tableFilter !== 'all' || actionFilter !== 'all';
  const pageItems = buildPageItems(currentPage, totalPages);

  const goToPage = (target: number) => {
    if (loading) return;
    const next = Math.min(Math.max(1, Math.trunc(target)), totalPages);
    if (next === page) return;
    scrollToTopPendingRef.current = true;
    setPage(next);
  };

  const handleRefresh = () => {
    setReloadToken((value) => value + 1);
  };

  const handleTableChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = TABLE_OPTIONS.find((option) => option.value === event.target.value);
    if (next) {
      setTableFilter(next.value);
      // 改变筛选条件后回到第 1 页，避免停留在不存在的页码上。
      setPage(1);
    }
  };

  const handleActionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = ACTION_OPTIONS.find((option) => option.value === event.target.value);
    if (next) {
      setActionFilter(next.value);
      setPage(1);
    }
  };

  const resetFilters = () => {
    setTableFilter('all');
    setActionFilter('all');
    setPage(1);
  };

  // 当前身份：英文模式用 roleLabelEn，中文模式用 roleLabelFromLevel。
  const roleName =
    locale === 'en'
      ? roleKeyFromLevel(userLevel)
        ? roleLabelEn(roleKeyFromLevel(userLevel), userLevel)
        : tr('未分配')
      : roleLabelFromLevel(userLevel);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#18191c] text-white">
        {tr('验证权限中...')}
      </div>
    );
  }

  if (denied) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#18191c] p-6 font-sans text-gray-300">
        <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#2c2d31] p-8 text-center shadow-2xl">
          <div className="mb-3 text-4xl">🚫</div>
          <h1 className="mb-2 text-xl font-bold text-white">{tr('无权限访问')}</h1>
          <p className="mb-6 text-sm text-gray-400">
            {tr('操作审计仅对高级社区经理 (Lv.90) 及以上级别开放。')}
          </p>
          <Link href="/admin" className="text-sm text-blue-400 transition hover:text-blue-300">
            {tr('← 返回控制台')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#18191c] p-4 font-sans text-gray-300 sm:p-6 lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-gray-700 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              {tr('操作审计')}{' '}
              {locale === 'en' ? null : (
                <span className="text-lg font-normal text-gray-500 sm:text-xl">/ Audit Log</span>
              )}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {tr('记录权限、车队、活动、规则等关键变更')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span>
              {tr('当前身份：')}
              <span className="font-bold text-blue-400">
                {roleName} (Lv.{userLevel})
              </span>
            </span>
            <span className="rounded border border-orange-700/50 bg-orange-900/20 px-2 py-1 text-orange-400">
              {tr('只读 · 触发器写入')}
            </span>
            <Link href="/admin" className="text-blue-400 transition hover:text-blue-300">
              {tr('← 返回控制台')}
            </Link>
          </div>
        </header>

        <section className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-gray-400">{tr('按表筛选')}</span>
              <select
                value={tableFilter}
                onChange={handleTableChange}
                className="w-full rounded border border-gray-600 bg-[#18191c] p-2 text-sm text-white focus:border-blue-500 focus:outline-none lg:w-56"
              >
                {TABLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {tr(option.label)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-gray-400">
                {tr('按动作筛选')}
              </span>
              <select
                value={actionFilter}
                onChange={handleActionChange}
                className="w-full rounded border border-gray-600 bg-[#18191c] p-2 text-sm text-white focus:border-blue-500 focus:outline-none lg:w-40"
              >
                {ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {tr(option.label)}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? tr('刷新中...') : tr('刷新')}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>
              {tr('共 {count} 条 · 第 {page} / {total} 页', {
                count: totalCount,
                page: currentPage,
                total: totalPages,
              })}
            </span>
            <span>{tr('每页 {size} 条', { size: PAGE_SIZE })}</span>
            <span>{tr('服务端分页 · 仅请求当前页')}</span>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-blue-400 transition hover:text-blue-300"
              >
                {tr('清除筛选')}
              </button>
            )}
          </div>
        </section>

        <div ref={listTopRef} className="scroll-mt-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-700/60 bg-red-900/20 p-5 shadow-lg"
            >
              <p className="text-sm font-bold text-red-400">{tr('加载失败')}</p>
              <p className="mt-1 break-all text-xs text-red-300/80">{error}</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="mt-3 rounded bg-red-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-600"
              >
                {tr('重试')}
              </button>
            </div>
          )}

          {loading && rows.length === 0 ? (
            <div
              aria-busy="true"
              aria-live="polite"
              className="space-y-3 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg"
            >
              <p className="text-xs text-gray-500">{tr('加载审计日志中...')}</p>
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded border border-gray-700/40 bg-[#232428]"
                />
              ))}
            </div>
          ) : null}

          {!loading && !error && rows.length === 0 ? (
            <div className="rounded-lg border border-gray-700 bg-[#2c2d31] p-10 text-center shadow-lg">
              {hasFilters ? (
                <>
                  <p className="text-sm text-gray-400">{tr('没有符合当前筛选条件的记录')}</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-3 text-xs font-bold text-blue-400 transition hover:text-blue-300"
                  >
                    {tr('清除筛选')}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400">{tr('暂无审计记录')}</p>
                  <p className="mt-1 text-xs text-gray-600">
                    {tr('数据库触发器会在关键变更发生后自动写入日志。')}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {rows.length > 0 ? (
            <>
              <section
                aria-busy={loading}
                className={`overflow-hidden rounded-lg border border-gray-700 bg-[#2c2d31] shadow-lg transition-opacity ${
                  loading ? 'opacity-60' : ''
                }`}
              >
                <div className="hidden grid-cols-[9.5rem_4.5rem_11rem_9rem_minmax(0,1fr)] gap-4 border-b border-gray-700 bg-[#232428] px-4 py-3 text-xs font-bold text-gray-500 lg:grid">
                  <span>{tr('时间')}</span>
                  <span>{tr('动作')}</span>
                  <span>{tr('目标')}</span>
                  <span>{tr('操作者')}</span>
                  <span>{tr('详情')}</span>
                </div>

                <div className="divide-y divide-gray-700/60">
                  {rows.map((row) => {
                    const meta = actionMeta(row.action, tr);
                    return (
                      <article
                        key={row.id}
                        className="grid grid-cols-1 gap-3 px-4 py-4 transition hover:bg-[#33343a]/60 lg:grid-cols-[9.5rem_4.5rem_11rem_9rem_minmax(0,1fr)] lg:items-start lg:gap-4"
                      >
                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            {tr('时间')}
                          </span>
                          <time dateTime={row.createdAt} className="text-xs text-gray-400">
                            {formatTime(row.createdAt)}
                          </time>
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            {tr('动作')}
                          </span>
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${meta.className}`}
                          >
                            {meta.label}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            {tr('目标')}
                          </span>
                          <div className="min-w-0 text-right lg:text-left">
                            <p className="text-sm font-medium text-white">
                              {tableLabel(row.tableName, tr)}
                            </p>
                            <p className="break-all font-mono text-xs text-gray-500">
                              {row.tableName}
                              {row.targetId ? ` · #${row.targetId}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            {tr('操作者')}
                          </span>
                          <div className="min-w-0 text-right lg:text-left">
                            <p className="break-all text-sm text-gray-300">
                              {row.actorLabel || tr('后台/系统')}
                            </p>
                            <p className="text-xs text-gray-500">
                              {row.actorRole !== null ? `Lv.${row.actorRole}` : 'Lv.—'}
                            </p>
                          </div>
                        </div>

                        <div className="min-w-0 border-t border-gray-700/60 pt-3 lg:border-0 lg:pt-0">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            {tr('详情')}
                          </span>
                          <p className="text-xs leading-relaxed text-gray-400">
                            {summarizeDetail(row.detail, tr)}
                          </p>
                          <details className="mt-2">
                            <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-xs text-blue-400 transition hover:text-blue-300">
                              {tr('查看变更 JSON')}
                              <span aria-hidden="true">▾</span>
                            </summary>
                            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded border border-gray-700 bg-[#18191c] p-3 text-[11px] leading-relaxed text-gray-300">
                              {detailJson(row.detail, tr)}
                            </pre>
                          </details>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <div className="flex flex-col items-center justify-between gap-3 rounded-lg border border-gray-700 bg-[#2c2d31] px-4 py-3 shadow-lg sm:flex-row">
                <p className="text-xs text-gray-500">
                  {tr('共 {count} 条 · 第 {page} / {total} 页（每页 {size} 条）', {
                    count: totalCount,
                    page: currentPage,
                    total: totalPages,
                    size: PAGE_SIZE,
                  })}
                </p>
                <nav
                  aria-label={tr('审计日志分页')}
                  className="flex flex-wrap items-center gap-1"
                >
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
