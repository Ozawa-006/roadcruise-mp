// app/admin/moderation/page.tsx
// 后台：警告 / 禁言 / 封禁（Lv.40+）。
// 数据库侧约束：
//   · moderation_actions：本人可读自己的记录，Lv.40+ 可读全部、可 INSERT / UPDATE，无 DELETE；
//   · 生效判定：revoked_at is null and created_at <= now() and (expires_at is null or expires_at > now())；
//   · 新建记录由数据库触发器给目标用户写站内通知（type='moderation'），前端不重复发送。
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTr } from '@/components/I18nProvider';
import { formatMessage, tr as trFor, type Locale } from '@/lib/i18n';
import { canAccessAdmin, levelOf, roleLabel, roleLabelEn } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAGE_SIZE = 50;
// 页码窗口：当前页前后各 2 页，首尾页始终显示
const PAGE_WINDOW = 2;
const MAX_USER_RECORDS = 100;
const PROFILE_CHUNK_SIZE = 100;
const MAX_REASON_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;

const ACTIONS = ['warning', 'mute', 'ban'] as const;
type ModerationAction = (typeof ACTIONS)[number];

const DURATIONS = ['1d', '7d', '30d', 'permanent'] as const;
type Duration = (typeof DURATIONS)[number];

const ACTION_META: Record<
  ModerationAction,
  { label: string; badgeClass: string; description: string }
> = {
  warning: {
    label: '警告',
    badgeClass: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
    description: '仅记录，不限制发布',
  },
  mute: {
    label: '禁言',
    badgeClass: 'border-blue-500/40 bg-blue-500/15 text-blue-300',
    description: '到期前禁止发帖、回帖与报名',
  },
  ban: {
    label: '封禁',
    badgeClass: 'border-red-500/40 bg-red-500/15 text-red-300',
    description: '到期前禁止发帖、回帖与报名',
  },
};

const DURATION_OPTIONS: ReadonlyArray<{ value: Duration; label: string; days: number | null }> = [
  { value: '1d', label: '1 天', days: 1 },
  { value: '7d', label: '7 天', days: 7 },
  { value: '30d', label: '30 天', days: 30 },
  { value: 'permanent', label: '永久', days: null },
];

type ActionStatus = 'active' | 'expired' | 'revoked';

const STATUS_META: Record<
  ActionStatus,
  { label: string; className: string }
> = {
  active: {
    label: '生效中',
    className: 'border-green-500/40 bg-green-500/15 text-green-300',
  },
  expired: {
    label: '已过期',
    className: 'border-gray-600 bg-[#232428] text-gray-400',
  },
  revoked: {
    label: '已撤销',
    className: 'border-gray-600 bg-[#232428] text-gray-500',
  },
};

type RecentActionFilter = 'all' | ModerationAction;
type RecentStatusFilter = 'all' | ActionStatus;

const RECENT_ACTION_OPTIONS: ReadonlyArray<{ value: RecentActionFilter; label: string }> = [
  { value: 'all', label: '全部动作' },
  { value: 'warning', label: '警告' },
  { value: 'mute', label: '禁言' },
  { value: 'ban', label: '封禁' },
];

const RECENT_STATUS_OPTIONS: ReadonlyArray<{ value: RecentStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '生效中' },
  { value: 'expired', label: '已过期' },
  { value: 'revoked', label: '已撤销' },
];

const MODERATION_COLUMNS =
  'id,user_id,action,reason,note,expires_at,created_by,created_at,revoked_at,revoked_by';
const PROFILE_COLUMNS = 'id,display_name,custom_id';
const SEARCH_PROFILE_COLUMNS =
  'id,display_name,custom_id,steam_id,steam_verified,avatar_url,role,role_level';

const inputClass =
  'w-full rounded border border-gray-600 bg-[#18191c] p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'mb-1 block text-xs text-gray-400';

/** 静态 UI 文案：中文原文 -> 英文；英文缺失时 useTr 回退中文。 */
const EN: Record<string, string> = {
  // 动作 / 时长 / 状态
  '警告': 'Warning',
  '禁言': 'Mute',
  '封禁': 'Ban',
  '仅记录，不限制发布': 'recorded only, posting is not restricted',
  '到期前禁止发帖、回帖与报名': 'blocks posts, replies and sign-ups until it expires',
  '1 天': '1 day',
  '7 天': '7 days',
  '30 天': '30 days',
  '永久': 'Permanent',
  '生效中': 'Active',
  '已过期': 'Expired',
  '已撤销': 'Revoked',
  '全部动作': 'All actions',
  '全部状态': 'All statuses',
  '操作失败，请稍后重试': 'Operation failed, please try again later',
  '未填写原因': 'No reason provided',
  // 权限
  '验证权限中...': 'Checking permissions...',
  '无法验证权限：{message}': 'Unable to verify permissions: {message}',
  '🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能管理处罚。':
    '🚫 Insufficient permissions: only staff (Lv.40) and above can manage moderation actions.',
  // 查找用户
  '⚖️ 处罚管理 / Moderation': '⚖️ Moderation',
  '警告不限制发布；禁言/封禁会在到期前阻止发帖与报名':
    'Warnings do not restrict posting; mutes and bans block posting and sign-ups until they expire',
  '← 返回控制台': '← Back to console',
  '查找用户': 'Find user',
  '昵称 / 专属 ID / Steam ID': 'Display name / custom ID / Steam ID',
  '搜索用户': 'Search users',
  '搜索中...': 'Searching...',
  '搜索': 'Search',
  '搜索失败：{message}': 'Search failed: {message}',
  '{name} 的头像': 'Avatar of {name}',
  '用户': 'User',
  '玩': 'U',
  '专属 ID：': 'Custom ID: ',
  '未分配': 'Not assigned',
  ' · Steam 已验证': ' · Steam verified',
  ' · Steam 未验证': ' · Steam unverified',
  '已选中': 'Selected',
  '未找到匹配用户（最多显示 10 条）。': 'No matching users found (up to 10 results).',
  // 新建处罚
  '新建处罚': 'New moderation action',
  '请先在上方搜索并选择一个用户。': 'Search and select a user above first.',
  '角色：': 'Role: ',
  'Steam：': 'Steam: ',
  '已验证': 'Verified',
  '未验证': 'Unverified',
  '（{id}）': ' ({id})',
  '（未绑定）': ' (not linked)',
  '查看资料 ↗': 'View profile ↗',
  '处罚动作': 'Action',
  '时长': 'Duration',
  '（{description}）': ' ({description})',
  '永久处罚的到期时间为空；警告也会记录到期时间，但不限制发布。':
    'Permanent actions have no expiry time; warnings also record an expiry but do not restrict posting.',
  '原因（必填，最多 {count} 字）': 'Reason (required, up to {count} characters)',
  '例如：多次恶意碰撞': 'e.g. repeated deliberate collisions',
  '备注（可选，仅后台可见）': 'Note (optional, visible to staff only)',
  '补充证据链接、处理经过等': 'Evidence links, how it was handled, etc.',
  '创建失败：{message}': 'Failed to create: {message}',
  '提交中...': 'Submitting...',
  '创建{action}': 'Create {action}',
  '提交后系统会自动给该用户发送站内通知。':
    'The user automatically receives an in-site notification after submission.',
  // 当前处罚 / 历史
  '当前处罚': 'Current actions',
  '{name} · {count} 条生效中': '{name} · {count} active',
  '刷新中...': 'Refreshing...',
  '刷新': 'Refresh',
  '选择用户后显示其处罚记录。': 'Select a user to see their moderation records.',
  '加载失败：{message}': 'Failed to load: {message}',
  '加载中...': 'Loading...',
  '该用户当前没有生效中的处罚。': 'This user has no active moderation actions.',
  '创建：': 'Created: ',
  '到期：': 'Expires: ',
  '原因：': 'Reason: ',
  '备注：': 'Note: ',
  '处理人：': 'Handled by: ',
  '撤销中...': 'Revoking...',
  '撤销': 'Revoke',
  '历史记录（已结束，最多最近 {count} 条）':
    'History (finished, latest {count} records at most)',
  '暂无历史记录。': 'No history yet.',
  '撤销人：': 'Revoked by: ',
  '撤销时间：': 'Revoked at: ',
  // 最近处罚
  '最近处罚记录': 'Recent moderation records',
  '全站 {count} 条 · 第 {page} / {total} 页 · 每页 {size} 条':
    '{count} records site-wide · page {page} / {total} · {size} per page',
  '按处罚动作筛选': 'Filter by action',
  '按处罚状态筛选': 'Filter by status',
  '清除筛选': 'Clear filters',
  '没有符合当前筛选条件的处罚记录。': 'No moderation records match the current filters.',
  '暂无处罚记录。': 'No moderation records yet.',
  '目标：': 'Target: ',
  '共 {count} 条 · 第 {page} / {total} 页': '{count} records · page {page} / {total}',
  '上一页': 'Previous',
  '下一页': 'Next',
  // 结果提示
  '已对 {name} 创建{action}。': 'Created a {action} for {name}.',
  '撤销失败：{message}': 'Failed to revoke: {message}',
  '已撤销 #{id} 的{action}。': 'Revoked the {action} #{id}.',
  '{name}（{id}）': '{name} ({id})',
  '未命名用户': 'Unnamed user',
  '未知用户': 'Unknown user',
  '该用户': 'this user',
  '请输入昵称、专属 ID 或 Steam ID。': 'Enter a display name, custom ID or Steam ID.',
  '请填写处罚原因。': 'Please fill in the reason for the action.',
  '原因不能超过 {count} 字。': 'The reason must be at most {count} characters.',
  '重试': 'Retry',
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

interface ModerationRow {
  id: number;
  user_id: string;
  action: ModerationAction;
  reason: string;
  note: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
}

interface TargetUser {
  id: string;
  display_name: string | null;
  custom_id: string | null;
  steam_id: string | null;
  steam_verified: boolean;
  avatar_url: string | null;
  role: string | null;
  role_level: number;
}

interface ProfileInfo {
  display_name: string | null;
  custom_id: string | null;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function asLevel(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed);
  }
  return 0;
}

function asAction(value: unknown): ModerationAction | null {
  return value === 'warning' || value === 'mute' || value === 'ban' ? value : null;
}

function isDuration(value: string): value is Duration {
  return DURATIONS.some((duration) => duration === value);
}

function errorMessage(error: unknown, t: Translate): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return t('操作失败，请稍后重试');
}

/** 生成页码：首尾页 + 当前页前后各 PAGE_WINDOW 页，中间用省略号。 */
function buildPageItems(current: number, total: number): Array<number | '…'> {
  const pages = new Set<number>([1, total]);

  for (let page = current - PAGE_WINDOW; page <= current + PAGE_WINDOW; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }

  const sorted = Array.from(pages).sort((left, right) => left - right);
  const items: Array<number | '…'> = [];

  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (index > 0 && previous !== undefined && page - previous > 1) items.push('…');
    items.push(page);
  });

  return items;
}

function formatTime(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

function toModerationRow(raw: unknown, t: Translate): ModerationRow | null {
  if (!isRecord(raw)) return null;

  const id = asId(raw.id);
  const userId = asText(raw.user_id);
  const action = asAction(raw.action);
  const createdAt = asText(raw.created_at);
  if (id === null || !userId || !action || !createdAt) return null;

  return {
    id,
    user_id: userId,
    action,
    reason: asText(raw.reason) ?? t('未填写原因'),
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note : null,
    expires_at: asText(raw.expires_at),
    created_by: asText(raw.created_by),
    created_at: createdAt,
    revoked_at: asText(raw.revoked_at),
    revoked_by: asText(raw.revoked_by),
  };
}

function toModerationRows(data: unknown, t: Translate): ModerationRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((raw) => toModerationRow(raw, t)).filter((row): row is ModerationRow => row !== null);
}

function toTargetUser(raw: unknown): TargetUser | null {
  if (!isRecord(raw)) return null;

  const id = asText(raw.id);
  if (!id) return null;

  return {
    id,
    display_name: asText(raw.display_name),
    custom_id: asText(raw.custom_id),
    steam_id: asText(raw.steam_id),
    steam_verified: raw.steam_verified === true,
    avatar_url: asText(raw.avatar_url),
    role: asText(raw.role),
    role_level: asLevel(raw.role_level),
  };
}

function toTargetUsers(data: unknown): TargetUser[] {
  if (!Array.isArray(data)) return [];
  return data.map(toTargetUser).filter((user): user is TargetUser => user !== null);
}

function toProfileMap(data: unknown): Record<string, ProfileInfo> {
  const map: Record<string, ProfileInfo> = {};
  if (!Array.isArray(data)) return map;

  for (const item of data) {
    if (!isRecord(item)) continue;
    const id = asText(item.id);
    if (!id) continue;
    map[id] = {
      display_name: asText(item.display_name),
      custom_id: asText(item.custom_id),
    };
  }

  return map;
}

/** 清洗搜索词：避免用户输入的 PostgREST 过滤器语法字符破坏 .or() 查询。 */
function normalizeSearch(value: string): string {
  return value
    .trim()
    .slice(0, 64)
    .replace(/[,()"'\\\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEffective(row: ModerationRow, now: number): boolean {
  if (row.revoked_at) return false;

  const createdAt = Date.parse(row.created_at);
  if (Number.isNaN(createdAt) || createdAt > now) return false;

  if (row.expires_at) {
    const expiresAt = Date.parse(row.expires_at);
    if (!Number.isNaN(expiresAt) && expiresAt <= now) return false;
  }

  return true;
}

function statusOf(row: ModerationRow, now: number): ActionStatus {
  if (row.revoked_at) return 'revoked';
  if (row.expires_at) {
    const expiresAt = Date.parse(row.expires_at);
    if (!Number.isNaN(expiresAt) && expiresAt <= now) return 'expired';
  }
  return isEffective(row, now) ? 'active' : 'expired';
}

async function fetchProfiles(ids: string[]): Promise<Record<string, ProfileInfo>> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => id.length > 0)));
  const merged: Record<string, ProfileInfo> = {};

  for (let index = 0; index < uniqueIds.length; index += PROFILE_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + PROFILE_CHUNK_SIZE);
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .in('id', chunk);

    if (error) {
      console.error('加载用户资料失败:', error.message);
      continue;
    }

    Object.assign(merged, toProfileMap(data));
  }

  return merged;
}

export default function AdminModerationPage() {
  const router = useRouter();
  const locale = useLocale();
  const tr = useTr(EN);
  /** 稳定的翻译函数（只随 locale 变化），供 effect 与事件回调使用。 */
  const t = useCallback(
    (zh: string, vars?: Record<string, string | number>) => translateFor(locale, zh, vars),
    [locale]
  );

  const [checking, setChecking] = useState(true);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [dataToken, setDataToken] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  const [results, setResults] = useState<TargetUser[]>([]);
  const [selected, setSelected] = useState<TargetUser | null>(null);

  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});

  const [records, setRecords] = useState<ModerationRow[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  const [recent, setRecent] = useState<ModerationRow[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [recentPage, setRecentPage] = useState(1);
  const [recentAction, setRecentAction] = useState<RecentActionFilter>('all');
  const [recentStatus, setRecentStatus] = useState<RecentStatusFilter>('all');
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const recentTopRef = useRef<HTMLElement>(null);

  const [action, setAction] = useState<ModerationAction>('warning');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [duration, setDuration] = useState<Duration>('7d');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
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

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role_level')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;

        if (profileError) {
          alert(t('无法验证权限：{message}', { message: profileError.message }));
          router.push('/admin');
          return;
        }

        if (!canAccessAdmin(levelOf(profile?.role_level))) {
          alert(t('🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能管理处罚。'));
          router.push('/admin');
          return;
        }

        setStaffId(user.id);
        setChecking(false);
      } catch (error) {
        if (cancelled) return;
        alert(t('无法验证权限：{message}', { message: errorMessage(error, t) }));
        router.push('/admin');
      }
    };

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router, t]);

  // 每分钟刷新一次“当前时间”，让生效/过期状态自动更新（不写入数据库）。
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  // 2. 全站最近处罚：服务端分页（每页 50 条）+ 精确总数；只对当前页的用户/处理人二次查询昵称
  useEffect(() => {
    if (checking || !staffId) return;

    let cancelled = false;

    const load = async () => {
      setRecentLoading(true);
      setRecentError(null);

      try {
        let request = supabase
          .from('moderation_actions')
          .select(MODERATION_COLUMNS, { count: 'exact' });

        if (recentAction !== 'all') {
          request = request.eq('action', recentAction);
        }

        // 状态筛选只拼接服务端生成的时间，绝不拼接用户输入
        const nowIso = new Date().toISOString();
        if (recentStatus === 'active') {
          request = request
            .is('revoked_at', null)
            .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
        } else if (recentStatus === 'expired') {
          request = request
            .is('revoked_at', null)
            .not('expires_at', 'is', null)
            .lte('expires_at', nowIso);
        } else if (recentStatus === 'revoked') {
          request = request.not('revoked_at', 'is', null);
        }

        const from = (recentPage - 1) * PAGE_SIZE;
        const { data, error, count } = await request
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (cancelled) return;

        if (error) {
          setRecentError(error.message);
          setRecent([]);
          setRecentTotal(0);
          return;
        }

        const rows = toModerationRows(data, t);
        const nextTotal = typeof count === 'number' ? count : from + rows.length;
        setRecent(rows);
        setRecentTotal(nextTotal);
        setNow(Date.now());

        // 越界回退：总数变少时回到最后一页
        const lastPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        if (recentPage > lastPage) {
          setRecentPage(lastPage);
          return;
        }

        // 只为当前页出现的用户/处理人查询昵称，避免全表扫描
        const profileIds = rows
          .flatMap((row) => [row.user_id, row.created_by, row.revoked_by])
          .filter((value): value is string => typeof value === 'string' && value.length > 0);

        const map = await fetchProfiles(profileIds);
        if (cancelled) return;
        setProfiles((previous) => ({ ...previous, ...map }));
      } catch (error) {
        if (cancelled) return;
        setRecentError(errorMessage(error, t));
        setRecent([]);
        setRecentTotal(0);
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [checking, staffId, dataToken, recentPage, recentAction, recentStatus, t]);

  // 3. 选中用户的处罚记录（当前处罚 + 历史记录）
  useEffect(() => {
    if (checking || !staffId || !selected) return;

    let cancelled = false;

    const load = async () => {
      setRecordsLoading(true);
      setRecordsError(null);

      try {
        const { data, error } = await supabase
          .from('moderation_actions')
          .select(MODERATION_COLUMNS)
          .eq('user_id', selected.id)
          .order('created_at', { ascending: false })
          .limit(MAX_USER_RECORDS);
        if (cancelled) return;

        if (error) {
          setRecordsError(error.message);
          setRecords([]);
          return;
        }

        const rows = toModerationRows(data, t);
        setRecords(rows);
        setNow(Date.now());

        const profileIds = rows
          .flatMap((row) => [row.created_by, row.revoked_by])
          .filter((value): value is string => typeof value === 'string' && value.length > 0);

        const map = await fetchProfiles(profileIds);
        if (cancelled) return;
        setProfiles((previous) => ({ ...previous, ...map }));
      } catch (error) {
        if (cancelled) return;
        setRecordsError(errorMessage(error, t));
        setRecords([]);
      } finally {
        if (!cancelled) setRecordsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [checking, staffId, selected, dataToken, t]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (searching) return;

    const term = normalizeSearch(searchInput);
    setSearchError(null);
    setNotice(null);

    if (!term) {
      setResults([]);
      setSearchDone(false);
      setSearchError(tr('请输入昵称、专属 ID 或 Steam ID。'));
      return;
    }

    setSearching(true);
    try {
      const pattern = `%${term}%`;
      const { data, error } = await supabase
        .from('profiles')
        .select(SEARCH_PROFILE_COLUMNS)
        .or(
          `display_name.ilike.${pattern},custom_id.ilike.${pattern},steam_id.ilike.${pattern}`
        )
        .limit(10);

      if (error) {
        setSearchError(error.message);
        setResults([]);
        return;
      }

      setResults(toTargetUsers(data));
      setSearchDone(true);
    } catch (error) {
      setSearchError(errorMessage(error, tr));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (user: TargetUser) => {
    setSelected(user);
    setRecords([]);
    setRecordsError(null);
    setFormError(null);
    setNotice(null);
    setReason('');
    setNote('');
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !staffId || submitting) return;

    const trimmedReason = reason.trim();
    const trimmedNote = note.trim();

    if (!trimmedReason) {
      setFormError(tr('请填写处罚原因。'));
      return;
    }
    if (trimmedReason.length > MAX_REASON_LENGTH) {
      setFormError(tr('原因不能超过 {count} 字。', { count: MAX_REASON_LENGTH }));
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setNotice(null);

    try {
      const option = DURATION_OPTIONS.find((item) => item.value === duration);
      const expiresAt =
        option && option.days !== null
          ? new Date(Date.now() + option.days * 24 * 60 * 60 * 1000).toISOString()
          : null;

      const { error } = await supabase.from('moderation_actions').insert({
        user_id: selected.id,
        action,
        reason: trimmedReason,
        note: trimmedNote ? trimmedNote : null,
        expires_at: expiresAt,
        created_by: staffId,
      });

      if (error) {
        setFormError(error.message);
        return;
      }

      setReason('');
      setNote('');
      setNotice({
        kind: 'success',
        text: tr('已对 {name} 创建{action}。', {
          name: selected.display_name?.trim() || tr('该用户'),
          action: tr(ACTION_META[action].label),
        }),
      });
      setDataToken((value) => value + 1);
    } catch (error) {
      setFormError(errorMessage(error, tr));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (row: ModerationRow) => {
    if (!staffId || revokingId !== null) return;

    setRevokingId(row.id);
    setNotice(null);

    try {
      const { error } = await supabase
        .from('moderation_actions')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: staffId,
        })
        .eq('id', row.id)
        .is('revoked_at', null);

      if (error) {
        setNotice({ kind: 'error', text: tr('撤销失败：{message}', { message: error.message }) });
        return;
      }

      setNotice({
        kind: 'success',
        text: tr('已撤销 #{id} 的{action}。', {
          id: row.id,
          action: tr(ACTION_META[row.action].label),
        }),
      });
      setDataToken((value) => value + 1);
    } catch (error) {
      setNotice({
        kind: 'error',
        text: tr('撤销失败：{message}', { message: errorMessage(error, tr) }),
      });
    } finally {
      setRevokingId(null);
    }
  };

  const profileName = (id: string | null): string => {
    if (!id) return '——';
    const profile = profiles[id];
    if (!profile) return tr('未知用户');
    const name = profile.display_name?.trim() || tr('未命名用户');
    return profile.custom_id ? tr('{name}（{id}）', { name, id: profile.custom_id }) : name;
  };

  const activeRecords = records.filter((row) => isEffective(row, now));
  const historyRecords = records.filter((row) => !isEffective(row, now));
  const selectedDisplayName = selected?.display_name?.trim() || tr('未命名用户');

  const recentTotalPages = Math.max(1, Math.ceil(recentTotal / PAGE_SIZE));
  const currentRecentPage = Math.min(recentPage, recentTotalPages);
  const recentPageItems = buildPageItems(currentRecentPage, recentTotalPages);
  const hasRecentFilters = recentAction !== 'all' || recentStatus !== 'all';

  const gotoRecentPage = (next: number) => {
    const target = Math.min(Math.max(1, next), recentTotalPages);
    if (target === recentPage) return;

    setRecentPage(target);
    // 翻页后滚动到列表顶部，避免停留在页脚
    window.requestAnimationFrame(() => {
      recentTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const resetRecentFilters = () => {
    setRecentAction('all');
    setRecentStatus('all');
    setRecentPage(1);
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
            <h1 className="text-2xl font-bold text-white md:text-3xl">
              {tr('⚖️ 处罚管理 / Moderation')}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {tr('警告不限制发布；禁言/封禁会在到期前阻止发帖与报名')}
            </p>
          </div>
          <Link href="/admin" className="text-sm text-gray-400 transition hover:text-white">
            {tr('← 返回控制台')}
          </Link>
        </div>

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

        {/* 查找用户 */}
        <section className="mb-6 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5">
          <h2 className="mb-3 text-lg font-bold text-white">{tr('查找用户')}</h2>
          <form onSubmit={handleSearch} className="flex flex-col gap-2 md:flex-row">
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={tr('昵称 / 专属 ID / Steam ID')}
              maxLength={64}
              disabled={searching}
              aria-label={tr('搜索用户')}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={searching}
              className="shrink-0 rounded bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searching ? tr('搜索中...') : tr('搜索')}
            </button>
          </form>

          {searchError && (
            <p className="mt-2 text-sm text-red-400">
              {tr('搜索失败：{message}', { message: searchError })}
            </p>
          )}

          {results.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-700 rounded border border-gray-700 bg-[#18191c]">
              {results.map((user) => {
                const isSelected = selected?.id === user.id;
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(user)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                        isSelected ? 'bg-blue-600/15' : 'hover:bg-[#232428]'
                      }`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-sm font-bold text-white">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={tr('{name} 的头像', { name: user.display_name ?? tr('用户') })}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          (user.display_name?.trim() || tr('玩')).charAt(0).toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-white">
                          {user.display_name?.trim() || tr('未命名用户')}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {tr('专属 ID：')}
                          {user.custom_id || tr('未分配')} · Lv.{levelOf(user.role_level)}
                          {user.steam_verified ? tr(' · Steam 已验证') : tr(' · Steam 未验证')}
                        </span>
                      </span>
                      {isSelected && (
                        <span className="text-xs text-blue-300">{tr('已选中')}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {searchDone && results.length === 0 && !searchError && (
            <p className="mt-3 rounded border border-dashed border-gray-700 px-3 py-6 text-center text-sm text-gray-500">
              {tr('未找到匹配用户（最多显示 10 条）。')}
            </p>
          )}
        </section>

        {/* 选中用户 + 新建处罚 */}
        <section className="mb-6 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5">
          <h2 className="mb-3 text-lg font-bold text-white">{tr('新建处罚')}</h2>

          {!selected ? (
            <p className="rounded border border-dashed border-gray-700 px-3 py-8 text-center text-sm text-gray-500">
              {tr('请先在上方搜索并选择一个用户。')}
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-gray-700 bg-[#232428] p-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-lg font-bold text-white">
                  {selected.avatar_url ? (
                    <img
                      src={selected.avatar_url}
                      alt={tr('{name} 的头像', { name: selectedDisplayName })}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    selectedDisplayName.charAt(0).toUpperCase()
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">{selectedDisplayName}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {tr('专属 ID：')}
                    {selected.custom_id || tr('未分配')} · {tr('角色：')}
                    {locale === 'en'
                      ? roleLabelEn(selected.role, levelOf(selected.role_level))
                      : roleLabel(selected.role, selected.role_level)}{' '}
                    · Lv.
                    {levelOf(selected.role_level)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {tr('Steam：')}
                    {selected.steam_verified ? tr('已验证') : tr('未验证')}
                    {selected.steam_id
                      ? tr('（{id}）', { id: selected.steam_id })
                      : tr('（未绑定）')}
                  </p>
                </div>
                <Link
                  href={`/profile/${selected.id}`}
                  className="ml-auto text-xs text-blue-400 transition hover:text-blue-300"
                >
                  {tr('查看资料 ↗')}
                </Link>
              </div>

              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label htmlFor="moderation-action" className={labelClass}>
                      {tr('处罚动作')}
                    </label>
                    <select
                      id="moderation-action"
                      value={action}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === 'warning' || value === 'mute' || value === 'ban') {
                          setAction(value);
                        }
                      }}
                      disabled={submitting}
                      className={inputClass}
                    >
                      {ACTIONS.map((value) => (
                        <option key={value} value={value}>
                          {tr(ACTION_META[value].label)}
                          {tr('（{description}）', {
                            description: tr(ACTION_META[value].description),
                          })}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="moderation-duration" className={labelClass}>
                      {tr('时长')}
                    </label>
                    <select
                      id="moderation-duration"
                      value={duration}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (isDuration(value)) setDuration(value);
                      }}
                      disabled={submitting}
                      className={inputClass}
                    >
                      {DURATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {tr(option.label)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {tr('永久处罚的到期时间为空；警告也会记录到期时间，但不限制发布。')}
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="moderation-reason" className={labelClass}>
                    {tr('原因（必填，最多 {count} 字）', { count: MAX_REASON_LENGTH })}
                  </label>
                  <input
                    id="moderation-reason"
                    type="text"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={MAX_REASON_LENGTH}
                    disabled={submitting}
                    placeholder={tr('例如：多次恶意碰撞')}
                    className={inputClass}
                  />
                  <p className="mt-1 text-right text-[11px] text-gray-500">
                    {reason.length}/{MAX_REASON_LENGTH}
                  </p>
                </div>

                <div>
                  <label htmlFor="moderation-note" className={labelClass}>
                    {tr('备注（可选，仅后台可见）')}
                  </label>
                  <textarea
                    id="moderation-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={MAX_NOTE_LENGTH}
                    rows={3}
                    disabled={submitting}
                    placeholder={tr('补充证据链接、处理经过等')}
                    className={`${inputClass} resize-y`}
                  />
                </div>

                {formError && (
                  <p className="text-sm text-red-400">
                    {tr('创建失败：{message}', { message: formError })}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting || !reason.trim()}
                    className="rounded bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting
                      ? tr('提交中...')
                      : tr('创建{action}', { action: tr(ACTION_META[action].label) })}
                  </button>
                  <span className="text-xs text-gray-500">
                    {tr('提交后系统会自动给该用户发送站内通知。')}
                  </span>
                </div>
              </form>
            </>
          )}
        </section>

        {/* 当前处罚 + 历史记录 */}
        <section className="mb-6 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">
              {tr('当前处罚')}
              {selected && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {tr('{name} · {count} 条生效中', {
                    name: selectedDisplayName,
                    count: activeRecords.length,
                  })}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={() => setDataToken((value) => value + 1)}
              disabled={recordsLoading}
              className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:opacity-50"
            >
              {recordsLoading ? tr('刷新中...') : tr('刷新')}
            </button>
          </div>

          {!selected ? (
            <p className="text-sm text-gray-500">{tr('选择用户后显示其处罚记录。')}</p>
          ) : recordsError ? (
            <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {tr('加载失败：{message}', { message: recordsError })}
            </p>
          ) : recordsLoading ? (
            <p className="py-6 text-center text-sm text-gray-500">{tr('加载中...')}</p>
          ) : activeRecords.length === 0 ? (
            <p className="rounded border border-dashed border-gray-700 px-3 py-6 text-center text-sm text-gray-500">
              {tr('该用户当前没有生效中的处罚。')}
            </p>
          ) : (
            <ul className="space-y-2">
              {activeRecords.map((row) => {
                const meta = ACTION_META[row.action];
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 rounded border border-gray-700 bg-[#232428] p-3 md:flex-row md:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${meta.badgeClass}`}
                        >
                          {tr(meta.label)}
                        </span>
                        <span className="text-xs text-gray-500">#{row.id}</span>
                        <span className="text-xs text-gray-500">
                          {tr('创建：')}
                          {formatTime(row.created_at)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {tr('到期：')}
                          {row.expires_at ? formatTime(row.expires_at) : tr('永久')}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-sm text-white">
                        {tr('原因：')}
                        {row.reason}
                      </p>
                      {row.note && (
                        <p className="mt-1 break-words text-xs text-gray-400">
                          {tr('备注：')}
                          {row.note}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        {tr('处理人：')}
                        {row.created_by ? profileName(row.created_by) : '——'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRevoke(row)}
                      disabled={revokingId !== null}
                      className="shrink-0 rounded border border-red-500/50 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {revokingId === row.id ? tr('撤销中...') : tr('撤销')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selected && !recordsLoading && !recordsError && (
            <div className="mt-5 border-t border-gray-700 pt-4">
              <h3 className="mb-2 text-sm font-bold text-gray-400">
                {tr('历史记录（已结束，最多最近 {count} 条）', { count: MAX_USER_RECORDS })}
              </h3>
              {historyRecords.length === 0 ? (
                <p className="text-sm text-gray-500">{tr('暂无历史记录。')}</p>
              ) : (
                <ul className="space-y-2">
                  {historyRecords.map((row) => {
                    const meta = ACTION_META[row.action];
                    const status = STATUS_META[statusOf(row, now)];
                    return (
                      <li
                        key={row.id}
                        className="rounded border border-gray-700 bg-[#18191c] p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${meta.badgeClass}`}
                          >
                            {tr(meta.label)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${status.className}`}
                          >
                            {tr(status.label)}
                          </span>
                          <span className="text-xs text-gray-500">#{row.id}</span>
                          <span className="text-xs text-gray-500">{formatTime(row.created_at)}</span>
                        </div>
                        <p className="mt-1 break-words text-white">
                          {tr('原因：')}
                          {row.reason}
                        </p>
                        {row.note && (
                          <p className="mt-1 break-words text-xs text-gray-400">
                            {tr('备注：')}
                            {row.note}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                          {tr('到期：')}
                          {row.expires_at ? formatTime(row.expires_at) : tr('永久')}
                          {' · '}
                          {tr('处理人：')}
                          {row.created_by ? profileName(row.created_by) : '——'}
                          {row.revoked_at && (
                            <>
                              {' · '}
                              {tr('撤销人：')}
                              {row.revoked_by ? profileName(row.revoked_by) : '——'}
                              {' · '}
                              {tr('撤销时间：')}
                              {formatTime(row.revoked_at)}
                            </>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* 最近处罚记录：服务端分页 + 动作/状态筛选 */}
        <section
          ref={recentTopRef}
          className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5"
        >
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">{tr('最近处罚记录')}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {tr('全站 {count} 条 · 第 {page} / {total} 页 · 每页 {size} 条', {
                  count: recentTotal,
                  page: currentRecentPage,
                  total: recentTotalPages,
                  size: PAGE_SIZE,
                })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={recentAction}
                onChange={(event) => {
                  const value = event.target.value;
                  const option = RECENT_ACTION_OPTIONS.find((item) => item.value === value);
                  if (option) {
                    setRecentAction(option.value);
                    setRecentPage(1);
                  }
                }}
                aria-label={tr('按处罚动作筛选')}
                className="rounded border border-gray-600 bg-[#18191c] px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                {RECENT_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {tr(option.label)}
                  </option>
                ))}
              </select>
              <select
                value={recentStatus}
                onChange={(event) => {
                  const value = event.target.value;
                  const option = RECENT_STATUS_OPTIONS.find((item) => item.value === value);
                  if (option) {
                    setRecentStatus(option.value);
                    setRecentPage(1);
                  }
                }}
                aria-label={tr('按处罚状态筛选')}
                className="rounded border border-gray-600 bg-[#18191c] px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                {RECENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {tr(option.label)}
                  </option>
                ))}
              </select>
              {hasRecentFilters && (
                <button
                  type="button"
                  onClick={resetRecentFilters}
                  className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white"
                >
                  {tr('清除筛选')}
                </button>
              )}
            </div>
          </div>

          {recentError ? (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
              <p className="text-sm text-red-300">
                {tr('加载失败：{message}', { message: recentError })}
              </p>
              <button
                type="button"
                onClick={() => setDataToken((value) => value + 1)}
                className="mt-2 rounded bg-red-700 px-3 py-1 text-xs font-bold text-white transition hover:bg-red-600"
              >
                {tr('重试')}
              </button>
            </div>
          ) : recentLoading ? (
            <p className="py-6 text-center text-sm text-gray-500">{tr('加载中...')}</p>
          ) : recent.length === 0 ? (
            <div className="rounded border border-dashed border-gray-700 px-3 py-8 text-center">
              <p className="text-sm text-gray-500">
                {hasRecentFilters
                  ? tr('没有符合当前筛选条件的处罚记录。')
                  : tr('暂无处罚记录。')}
              </p>
              {hasRecentFilters && (
                <button
                  type="button"
                  onClick={resetRecentFilters}
                  className="mt-3 text-xs font-bold text-blue-400 transition hover:text-blue-300"
                >
                  {tr('清除筛选')}
                </button>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {recent.map((row) => {
                const meta = ACTION_META[row.action];
                const status = STATUS_META[statusOf(row, now)];
                return (
                  <li
                    key={row.id}
                    className="rounded border border-gray-700 bg-[#18191c] p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${meta.badgeClass}`}
                      >
                        {tr(meta.label)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${status.className}`}
                      >
                        {tr(status.label)}
                      </span>
                      <span className="text-xs text-gray-500">{formatTime(row.created_at)}</span>
                      <span className="text-xs text-gray-500">#{row.id}</span>
                    </div>
                    <p className="mt-1 break-words text-white">
                      {tr('目标：')}
                      <Link
                        href={`/profile/${row.user_id}`}
                        className="text-blue-400 transition hover:text-blue-300"
                      >
                        {profileName(row.user_id)}
                      </Link>
                    </p>
                    <p className="mt-1 break-words">
                      {tr('原因：')}
                      {row.reason}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {tr('到期：')}
                      {row.expires_at ? formatTime(row.expires_at) : tr('永久')}
                      {' · '}
                      {tr('处理人：')}
                      {row.created_by ? profileName(row.created_by) : '——'}
                      {row.revoked_at && (
                        <>
                          {' · '}
                          {tr('撤销人：')}
                          {row.revoked_by ? profileName(row.revoked_by) : '——'}
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {!recentError && recentTotal > 0 && (
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-gray-700 pt-3 sm:flex-row">
              <p className="text-xs text-gray-500">
                {tr('共 {count} 条 · 第 {page} / {total} 页', {
                  count: recentTotal,
                  page: currentRecentPage,
                  total: recentTotalPages,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => gotoRecentPage(currentRecentPage - 1)}
                  disabled={currentRecentPage <= 1}
                  className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {tr('上一页')}
                </button>
                {recentPageItems.map((item, index) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      onClick={() => gotoRecentPage(item)}
                      aria-current={item === currentRecentPage ? 'page' : undefined}
                      className={`min-w-8 rounded border px-2 py-1.5 text-xs transition ${
                        item === currentRecentPage
                          ? 'border-blue-500 bg-blue-600 text-white'
                          : 'border-gray-600 text-gray-300 hover:border-blue-500 hover:text-white'
                      }`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={`gap-${index}`} className="px-1 text-xs text-gray-600">
                      {item}
                    </span>
                  )
                )}
                <button
                  type="button"
                  onClick={() => gotoRecentPage(currentRecentPage + 1)}
                  disabled={currentRecentPage >= recentTotalPages}
                  className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {tr('下一页')}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
