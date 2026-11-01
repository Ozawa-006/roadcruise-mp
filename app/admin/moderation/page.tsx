// app/admin/moderation/page.tsx
// 后台：警告 / 禁言 / 封禁（Lv.40+）。
// 数据库侧约束：
//   · moderation_actions：本人可读自己的记录，Lv.40+ 可读全部、可 INSERT / UPDATE，无 DELETE；
//   · 生效判定：revoked_at is null and created_at <= now() and (expires_at is null or expires_at > now())；
//   · 新建记录由数据库触发器给目标用户写站内通知（type='moderation'），前端不重复发送。
'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canAccessAdmin, levelOf, roleLabel } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_RECENT = 200;
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

const MODERATION_COLUMNS =
  'id,user_id,action,reason,note,expires_at,created_by,created_at,revoked_at,revoked_by';
const PROFILE_COLUMNS = 'id,display_name,custom_id';
const SEARCH_PROFILE_COLUMNS =
  'id,display_name,custom_id,steam_id,steam_verified,avatar_url,role,role_level';

const inputClass =
  'w-full rounded border border-gray-600 bg-[#18191c] p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'mb-1 block text-xs text-gray-400';

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

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '操作失败，请稍后重试';
}

function formatTime(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

function toModerationRow(raw: unknown): ModerationRow | null {
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
    reason: asText(raw.reason) ?? '未填写原因',
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note : null,
    expires_at: asText(raw.expires_at),
    created_by: asText(raw.created_by),
    created_at: createdAt,
    revoked_at: asText(raw.revoked_at),
    revoked_by: asText(raw.revoked_by),
  };
}

function toModerationRows(data: unknown): ModerationRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(toModerationRow).filter((row): row is ModerationRow => row !== null);
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
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

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
          alert(`无法验证权限：${profileError.message}`);
          router.push('/admin');
          return;
        }

        if (!canAccessAdmin(levelOf(profile?.role_level))) {
          alert('🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能管理处罚。');
          router.push('/admin');
          return;
        }

        setStaffId(user.id);
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

  // 每分钟刷新一次“当前时间”，让生效/过期状态自动更新（不写入数据库）。
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  // 2. 全站最近处罚：created_at desc，最多 200 条；再分块二次查询用户昵称与处理人昵称
  useEffect(() => {
    if (checking || !staffId) return;

    let cancelled = false;

    const load = async () => {
      setRecentLoading(true);
      setRecentError(null);

      try {
        const { data, error } = await supabase
          .from('moderation_actions')
          .select(MODERATION_COLUMNS)
          .order('created_at', { ascending: false })
          .limit(MAX_RECENT);
        if (cancelled) return;

        if (error) {
          setRecentError(error.message);
          setRecent([]);
          return;
        }

        const rows = toModerationRows(data);
        setRecent(rows);
        setNow(Date.now());

        const profileIds = rows
          .flatMap((row) => [row.user_id, row.created_by, row.revoked_by])
          .filter((value): value is string => typeof value === 'string' && value.length > 0);

        const map = await fetchProfiles(profileIds);
        if (cancelled) return;
        setProfiles((previous) => ({ ...previous, ...map }));
      } catch (error) {
        if (cancelled) return;
        setRecentError(errorMessage(error));
        setRecent([]);
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [checking, staffId, dataToken]);

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

        const rows = toModerationRows(data);
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
        setRecordsError(errorMessage(error));
        setRecords([]);
      } finally {
        if (!cancelled) setRecordsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [checking, staffId, selected, dataToken]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (searching) return;

    const term = normalizeSearch(searchInput);
    setSearchError(null);
    setNotice(null);

    if (!term) {
      setResults([]);
      setSearchDone(false);
      setSearchError('请输入昵称、专属 ID 或 Steam ID。');
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
      setSearchError(errorMessage(error));
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
      setFormError('请填写处罚原因。');
      return;
    }
    if (trimmedReason.length > MAX_REASON_LENGTH) {
      setFormError(`原因不能超过 ${MAX_REASON_LENGTH} 字。`);
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
        text: `已对 ${selected.display_name?.trim() || '该用户'} 创建${ACTION_META[action].label}。`,
      });
      setDataToken((value) => value + 1);
    } catch (error) {
      setFormError(errorMessage(error));
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
        setNotice({ kind: 'error', text: `撤销失败：${error.message}` });
        return;
      }

      setNotice({
        kind: 'success',
        text: `已撤销 #${row.id} 的${ACTION_META[row.action].label}。`,
      });
      setDataToken((value) => value + 1);
    } catch (error) {
      setNotice({ kind: 'error', text: `撤销失败：${errorMessage(error)}` });
    } finally {
      setRevokingId(null);
    }
  };

  const profileName = (id: string | null): string => {
    if (!id) return '——';
    const profile = profiles[id];
    if (!profile) return '未知用户';
    const name = profile.display_name?.trim() || '未命名用户';
    return profile.custom_id ? `${name}（${profile.custom_id}）` : name;
  };

  const activeRecords = records.filter((row) => isEffective(row, now));
  const historyRecords = records.filter((row) => !isEffective(row, now));
  const selectedDisplayName = selected?.display_name?.trim() || '未命名用户';

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
            <h1 className="text-2xl font-bold text-white md:text-3xl">⚖️ 处罚管理 / Moderation</h1>
            <p className="mt-1 text-sm text-gray-500">
              警告不限制发布；禁言 / 封禁会在到期前阻止发帖与报名。
            </p>
          </div>
          <Link href="/admin" className="text-sm text-gray-400 transition hover:text-white">
            ← 返回控制台
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
          <h2 className="mb-3 text-lg font-bold text-white">查找用户</h2>
          <form onSubmit={handleSearch} className="flex flex-col gap-2 md:flex-row">
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="昵称 / 专属 ID / Steam ID"
              maxLength={64}
              disabled={searching}
              aria-label="搜索用户"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={searching}
              className="shrink-0 rounded bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searching ? '搜索中...' : '搜索'}
            </button>
          </form>

          {searchError && <p className="mt-2 text-sm text-red-400">搜索失败：{searchError}</p>}

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
                            alt={`${user.display_name ?? '用户'} 的头像`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          (user.display_name?.trim() || '玩').charAt(0).toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-white">
                          {user.display_name?.trim() || '未命名用户'}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          专属 ID：{user.custom_id || '未分配'} · Lv.{levelOf(user.role_level)}
                          {user.steam_verified ? ' · Steam 已验证' : ' · Steam 未验证'}
                        </span>
                      </span>
                      {isSelected && <span className="text-xs text-blue-300">已选中</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {searchDone && results.length === 0 && !searchError && (
            <p className="mt-3 rounded border border-dashed border-gray-700 px-3 py-6 text-center text-sm text-gray-500">
              未找到匹配用户（最多显示 10 条）。
            </p>
          )}
        </section>

        {/* 选中用户 + 新建处罚 */}
        <section className="mb-6 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5">
          <h2 className="mb-3 text-lg font-bold text-white">新建处罚</h2>

          {!selected ? (
            <p className="rounded border border-dashed border-gray-700 px-3 py-8 text-center text-sm text-gray-500">
              请先在上方搜索并选择一个用户。
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-gray-700 bg-[#232428] p-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-lg font-bold text-white">
                  {selected.avatar_url ? (
                    <img
                      src={selected.avatar_url}
                      alt={`${selectedDisplayName} 的头像`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    selectedDisplayName.charAt(0).toUpperCase()
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">{selectedDisplayName}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    专属 ID：{selected.custom_id || '未分配'} · 角色：
                    {roleLabel(selected.role, selected.role_level)} · Lv.
                    {levelOf(selected.role_level)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Steam：{selected.steam_verified ? '已验证' : '未验证'}
                    {selected.steam_id ? `（${selected.steam_id}）` : '（未绑定）'}
                  </p>
                </div>
                <Link
                  href={`/profile/${selected.id}`}
                  className="ml-auto text-xs text-blue-400 transition hover:text-blue-300"
                >
                  查看资料 ↗
                </Link>
              </div>

              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label htmlFor="moderation-action" className={labelClass}>
                      处罚动作
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
                          {ACTION_META[value].label}（{ACTION_META[value].description}）
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="moderation-duration" className={labelClass}>
                      时长
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
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-gray-500">
                      永久处罚的到期时间为空；警告也会记录到期时间，但不限制发布。
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="moderation-reason" className={labelClass}>
                    原因（必填，最多 {MAX_REASON_LENGTH} 字）
                  </label>
                  <input
                    id="moderation-reason"
                    type="text"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={MAX_REASON_LENGTH}
                    disabled={submitting}
                    placeholder="例如：多次恶意碰撞"
                    className={inputClass}
                  />
                  <p className="mt-1 text-right text-[11px] text-gray-500">
                    {reason.length}/{MAX_REASON_LENGTH}
                  </p>
                </div>

                <div>
                  <label htmlFor="moderation-note" className={labelClass}>
                    备注（可选，仅后台可见）
                  </label>
                  <textarea
                    id="moderation-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={MAX_NOTE_LENGTH}
                    rows={3}
                    disabled={submitting}
                    placeholder="补充证据链接、处理经过等"
                    className={`${inputClass} resize-y`}
                  />
                </div>

                {formError && <p className="text-sm text-red-400">创建失败：{formError}</p>}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting || !reason.trim()}
                    className="rounded bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? '提交中...' : `创建${ACTION_META[action].label}`}
                  </button>
                  <span className="text-xs text-gray-500">
                    提交后系统会自动给该用户发送站内通知。
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
              当前处罚
              {selected && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {selectedDisplayName} · {activeRecords.length} 条生效中
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={() => setDataToken((value) => value + 1)}
              disabled={recordsLoading}
              className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:opacity-50"
            >
              {recordsLoading ? '刷新中...' : '刷新'}
            </button>
          </div>

          {!selected ? (
            <p className="text-sm text-gray-500">选择用户后显示其处罚记录。</p>
          ) : recordsError ? (
            <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              加载失败：{recordsError}
            </p>
          ) : recordsLoading ? (
            <p className="py-6 text-center text-sm text-gray-500">加载中...</p>
          ) : activeRecords.length === 0 ? (
            <p className="rounded border border-dashed border-gray-700 px-3 py-6 text-center text-sm text-gray-500">
              该用户当前没有生效中的处罚。
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
                          {meta.label}
                        </span>
                        <span className="text-xs text-gray-500">#{row.id}</span>
                        <span className="text-xs text-gray-500">
                          创建：{formatTime(row.created_at)}
                        </span>
                        <span className="text-xs text-gray-500">
                          到期：{row.expires_at ? formatTime(row.expires_at) : '永久'}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-sm text-white">原因：{row.reason}</p>
                      {row.note && (
                        <p className="mt-1 break-words text-xs text-gray-400">备注：{row.note}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        处理人：{row.created_by ? profileName(row.created_by) : '——'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRevoke(row)}
                      disabled={revokingId !== null}
                      className="shrink-0 rounded border border-red-500/50 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {revokingId === row.id ? '撤销中...' : '撤销'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selected && !recordsLoading && !recordsError && (
            <div className="mt-5 border-t border-gray-700 pt-4">
              <h3 className="mb-2 text-sm font-bold text-gray-400">
                历史记录（已结束，最多最近 {MAX_USER_RECORDS} 条）
              </h3>
              {historyRecords.length === 0 ? (
                <p className="text-sm text-gray-500">暂无历史记录。</p>
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
                            {meta.label}
                          </span>
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${status.className}`}
                          >
                            {status.label}
                          </span>
                          <span className="text-xs text-gray-500">#{row.id}</span>
                          <span className="text-xs text-gray-500">{formatTime(row.created_at)}</span>
                        </div>
                        <p className="mt-1 break-words text-white">原因：{row.reason}</p>
                        {row.note && (
                          <p className="mt-1 break-words text-xs text-gray-400">备注：{row.note}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                          到期：{row.expires_at ? formatTime(row.expires_at) : '永久'}
                          {' · '}处理人：{row.created_by ? profileName(row.created_by) : '——'}
                          {row.revoked_at && (
                            <>
                              {' · '}撤销人：{row.revoked_by ? profileName(row.revoked_by) : '——'}
                              {' · '}撤销时间：{formatTime(row.revoked_at)}
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

        {/* 最近处罚记录 */}
        <section className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">最近处罚记录</h2>
            <span className="text-xs text-gray-500">
              全站 {recent.length} 条（最多最近 {MAX_RECENT} 条）
            </span>
          </div>

          {recentError ? (
            <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              加载失败：{recentError}
            </p>
          ) : recentLoading ? (
            <p className="py-6 text-center text-sm text-gray-500">加载中...</p>
          ) : recent.length === 0 ? (
            <p className="rounded border border-dashed border-gray-700 px-3 py-8 text-center text-sm text-gray-500">
              暂无处罚记录。
            </p>
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
                        {meta.label}
                      </span>
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${status.className}`}
                      >
                        {status.label}
                      </span>
                      <span className="text-xs text-gray-500">{formatTime(row.created_at)}</span>
                      <span className="text-xs text-gray-500">#{row.id}</span>
                    </div>
                    <p className="mt-1 break-words text-white">
                      目标：
                      <Link
                        href={`/profile/${row.user_id}`}
                        className="text-blue-400 transition hover:text-blue-300"
                      >
                        {profileName(row.user_id)}
                      </Link>
                    </p>
                    <p className="mt-1 break-words">原因：{row.reason}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      到期：{row.expires_at ? formatTime(row.expires_at) : '永久'}
                      {' · '}处理人：{row.created_by ? profileName(row.created_by) : '——'}
                      {row.revoked_at && (
                        <>
                          {' · '}撤销人：{row.revoked_by ? profileName(row.revoked_by) : '——'}
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
