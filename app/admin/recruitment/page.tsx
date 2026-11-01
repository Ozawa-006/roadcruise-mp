'use client';
// app/admin/recruitment/page.tsx
// 后台：招募管理（Lv.40+）。
//
// 数据库侧事实（supabase/recruitment.sql，已上线，前端不改 SQL）：
//   · recruitment_settings 单行 id=1：is_open / title / intro / requirements / positions /
//     updated_by / updated_at；匿名可读，Lv.40+ 可 UPDATE。
//   · recruitment_applications：status ∈ pending|reviewing|accepted|rejected；
//     Lv.40+ 可 SELECT 全部、UPDATE；状态变化由触发器自动通知申请人并补 handled_by；
//     同一用户同时只能有一条 pending/reviewing 申请（本页只审核，不新建申请）。
//   · updated_at 由触发器 rct_touch_updated_at() 自动维护，前端不写。
//
// 本页只做两件事：① 编辑/开关招募设置；② 服务端分页审核申请。
// 申请列表每页 20 条，count 与 range 同源，筛选条件下推到 PostgREST。

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canAccessAdmin, levelOf } from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAGE_SIZE = 20;
const MESSAGE_PREVIEW_LEN = 120;
const PROFILE_CHUNK_SIZE = 100;

type RecruitmentStatus = 'pending' | 'reviewing' | 'accepted' | 'rejected';
type StatusFilter = 'all' | RecruitmentStatus;
type DecisionStatus = 'accepted' | 'rejected';
type PageItem = number | 'ellipsis';

interface RecruitmentSettings {
  is_open: boolean;
  title: string;
  intro: string;
  requirements: string;
  positions: string;
  updated_at: string | null;
}

interface SettingsForm {
  title: string;
  intro: string;
  requirements: string;
  positions: string;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  position: string;
  contact: string | null;
  message: string;
  status: RecruitmentStatus;
  handled_by: string | null;
  handle_note: string | null;
  created_at: string;
  updated_at: string | null;
}

interface ProfileInfo {
  display_name: string | null;
  custom_id: string | null;
  steam_verified: boolean;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

interface PendingAction {
  applicationId: string;
  next: DecisionStatus;
  note: string;
}

const STATUS_META: Record<RecruitmentStatus, { label: string; className: string }> = {
  pending: {
    label: '待审核',
    className: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  },
  reviewing: {
    label: '审核中',
    className: 'border-blue-500/40 bg-blue-500/15 text-blue-300',
  },
  accepted: {
    label: '已通过',
    className: 'border-green-500/40 bg-green-500/15 text-green-300',
  },
  rejected: {
    label: '未通过',
    className: 'border-red-500/40 bg-red-500/15 text-red-300',
  },
};

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'reviewing', label: '审核中' },
  { value: 'accepted', label: '已通过' },
  { value: 'rejected', label: '未通过' },
];

const inputClass =
  'w-full rounded border border-gray-600 bg-[#18191c] p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none';
const labelClass = 'mb-1 block text-xs text-gray-400';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function isRecruitmentStatus(value: unknown): value is RecruitmentStatus {
  return (
    value === 'pending' ||
    value === 'reviewing' ||
    value === 'accepted' ||
    value === 'rejected'
  );
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

function toSettings(raw: unknown): RecruitmentSettings | null {
  if (!isRecord(raw)) return null;
  return {
    is_open: raw.is_open === true,
    title: typeof raw.title === 'string' ? raw.title : '',
    intro: typeof raw.intro === 'string' ? raw.intro : '',
    requirements: typeof raw.requirements === 'string' ? raw.requirements : '',
    positions: typeof raw.positions === 'string' ? raw.positions : '',
    updated_at: asText(raw.updated_at),
  };
}

function toApplicationRow(raw: unknown): ApplicationRow | null {
  if (!isRecord(raw)) return null;

  const id = asText(raw.id);
  const userId = asText(raw.user_id);
  const createdAt = asText(raw.created_at);
  if (!id || !userId || !createdAt) return null;

  return {
    id,
    user_id: userId,
    position: typeof raw.position === 'string' && raw.position.trim() ? raw.position : '未填写职位',
    contact: typeof raw.contact === 'string' && raw.contact.trim() ? raw.contact : null,
    message: typeof raw.message === 'string' ? raw.message : '',
    status: isRecruitmentStatus(raw.status) ? raw.status : 'pending',
    handled_by: asText(raw.handled_by),
    handle_note:
      typeof raw.handle_note === 'string' && raw.handle_note.trim() ? raw.handle_note : null,
    created_at: createdAt,
    updated_at: asText(raw.updated_at),
  };
}

function toApplicationRows(data: unknown): ApplicationRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(toApplicationRow).filter((row): row is ApplicationRow => row !== null);
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
      steam_verified: item.steam_verified === true,
    };
  }

  return map;
}

export default function AdminRecruitmentPage() {
  const router = useRouter();
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // —— 招募设置 ——
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsReloadToken, setSettingsReloadToken] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<SettingsForm>({
    title: '',
    intro: '',
    requirements: '',
    positions: '',
  });
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<Notice | null>(null);

  // —— 申请列表 ——
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [listNotice, setListNotice] = useState<Notice | null>(null);

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

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role_level')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;

        if (error) {
          alert(`无法验证权限：${error.message}`);
          router.push('/admin');
          return;
        }

        if (!canAccessAdmin(levelOf(profile?.role_level))) {
          alert('🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能管理招募。');
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

  // 2. 招募设置：读取单行 id=1（匿名可读）
  useEffect(() => {
    if (checking || !userId) return;

    let cancelled = false;

    const loadSettings = async () => {
      setSettingsLoading(true);
      setSettingsError(null);
      setSettingsReady(false);

      try {
        const { data, error } = await supabase
          .from('recruitment_settings')
          .select('*')
          .eq('id', 1)
          .maybeSingle();
        if (cancelled) return;

        if (error) {
          setSettingsError(error.message);
          return;
        }

        const parsed = toSettings(data);
        if (!parsed) {
          setSettingsError('未找到招募设置（id=1），请检查数据库初始化。');
          return;
        }

        setIsOpen(parsed.is_open);
        setForm({
          title: parsed.title,
          intro: parsed.intro,
          requirements: parsed.requirements,
          positions: parsed.positions,
        });
        setSettingsUpdatedAt(parsed.updated_at);
        setSettingsReady(true);
      } catch (error) {
        if (!cancelled) setSettingsError(errorMessage(error));
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [checking, userId, settingsReloadToken]);

  // 3. 申请列表：服务端分页，只取当前页（status 条件同时作用于 count 与 range）；
  //    再按当前页的 user_id / handled_by 分块二次查询 profiles。
  useEffect(() => {
    if (checking || !userId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
          .from('recruitment_applications')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);

        const { data, count, error } = await query;
        if (cancelled) return;

        if (error) {
          // 出错时保留现有列表，只提示错误并提供重试。
          setLoadError(error.message);
          setLoading(false);
          return;
        }

        const rows = toApplicationRows(data);
        // count 由 Content-Range 解析而来；缺失时至少保证当前页可用，避免误判为 0 条。
        const nextTotal =
          typeof count === 'number' ? count : (page - 1) * PAGE_SIZE + rows.length;
        const lastPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        setTotalCount(nextTotal);

        // 越界保护：处理完最后一页最后一条后总页数变小，回退到最后一页重新请求。
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }

        setApplications(rows);

        const profileIds = Array.from(
          new Set([
            // 把自己也算进去：处理后就地展示处理人名称。
            userId,
            ...rows
              .flatMap((row) => [row.user_id, row.handled_by])
              .filter((value): value is string => typeof value === 'string' && value.length > 0),
          ])
        );

        if (profileIds.length === 0) {
          setProfiles({});
          setLoading(false);
          return;
        }

        // 分块查询，避免把多行 UUID 的 PostgREST URL 拉得过长。
        const mergedProfiles: Record<string, ProfileInfo> = {};
        for (let index = 0; index < profileIds.length; index += PROFILE_CHUNK_SIZE) {
          const chunk = profileIds.slice(index, index + PROFILE_CHUNK_SIZE);
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id,display_name,custom_id,steam_verified')
            .in('id', chunk);
          if (cancelled) return;

          if (profileError) {
            // 资料查询失败不阻塞审核，只是显示为“未知用户”。
            console.error('加载申请人资料失败:', profileError.message);
            continue;
          }

          Object.assign(mergedProfiles, toProfileMap(profileData));
        }

        setProfiles(mergedProfiles);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        setLoadError(errorMessage(error));
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [checking, userId, statusFilter, page, reloadToken]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = buildPageItems(currentPage, totalPages);
  const hasFilter = statusFilter !== 'all';

  const reloadCurrentPage = () => {
    setReloadToken((value) => value + 1);
  };

  const goToPage = (target: number) => {
    if (loading) return;
    const next = Math.min(Math.max(1, Math.trunc(target)), totalPages);
    if (next === page) return;
    setAction(null);
    setPage(next);
    setListNotice(null);
    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const updateField = (field: keyof SettingsForm, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setSettingsNotice(null);
  };

  // 4. 开关：切换即保存；失败回滚开关并优先显示 error.message。
  const toggleRecruitment = async () => {
    if (!userId || toggleBusy || saveBusy || settingsLoading || !settingsReady) return;

    const previous = isOpen;
    const next = !previous;

    setToggleBusy(true);
    setSettingsNotice(null);
    setIsOpen(next);

    try {
      const { data, error } = await supabase
        .from('recruitment_settings')
        .update({ is_open: next, updated_by: userId })
        .eq('id', 1)
        .select('id')
        .maybeSingle();

      if (error) {
        setIsOpen(previous);
        setSettingsNotice({ kind: 'error', text: `保存失败：${error.message}` });
        return;
      }

      if (!data) {
        setIsOpen(previous);
        setSettingsNotice({
          kind: 'error',
          text: '保存失败：没有找到招募设置行（id=1），或当前账号无权修改。',
        });
        return;
      }

      setSettingsNotice({
        kind: 'success',
        text: next
          ? '✅ 已开启招募，网站 /recruitment 现在可以提交申请。'
          : '⏸️ 已关闭招募，网站 /recruitment 将不再显示申请表单。',
      });
    } catch (error) {
      setIsOpen(previous);
      setSettingsNotice({ kind: 'error', text: `保存失败：${errorMessage(error)}` });
    } finally {
      setToggleBusy(false);
    }
  };

  // 5. 保存设置：标题 / 介绍 / 要求 / 职位列表（不包含 is_open，开关单独即时保存）
  const saveSettings = async () => {
    if (!userId || saveBusy || toggleBusy || settingsLoading || !settingsReady) return;

    setSaveBusy(true);
    setSettingsNotice(null);

    try {
      const payload = {
        title: form.title.trim(),
        intro: form.intro.trim(),
        requirements: form.requirements.trim(),
        positions: form.positions.trim(),
        updated_by: userId,
      };

      const { data, error } = await supabase
        .from('recruitment_settings')
        .update(payload)
        .eq('id', 1)
        .select('*')
        .maybeSingle();

      if (error) {
        setSettingsNotice({ kind: 'error', text: `保存失败：${error.message}` });
        return;
      }

      if (!data) {
        setSettingsNotice({
          kind: 'error',
          text: '保存失败：没有找到招募设置行（id=1），或当前账号无权修改。',
        });
        return;
      }

      const saved = toSettings(data);
      if (saved) {
        setForm({
          title: saved.title,
          intro: saved.intro,
          requirements: saved.requirements,
          positions: saved.positions,
        });
        setIsOpen(saved.is_open);
        setSettingsUpdatedAt(saved.updated_at);
      }

      setSettingsNotice({ kind: 'success', text: '🎉 招募设置已保存。' });
    } catch (error) {
      setSettingsNotice({ kind: 'error', text: `保存失败：${errorMessage(error)}` });
    } finally {
      setSaveBusy(false);
    }
  };

  const profileOf = (id: string | null): ProfileInfo | null => {
    if (!id) return null;
    return profiles[id] ?? null;
  };

  const displayName = (id: string | null): string => {
    if (!id) return '——';
    const profile = profiles[id];
    if (!profile) return '未知用户';
    return profile.display_name?.trim() || '未命名用户';
  };

  const startAction = (applicationId: string, next: DecisionStatus) => {
    setListNotice(null);
    setAction({ applicationId, next, note: '' });
  };

  // 6. 审核：更新 { status, handled_by: 当前 uid, handle_note }；成功后刷新当前页。
  //    备注可选：通过/拒绝时写入（空则存 null）；开始审核不动 handle_note。
  const applyUpdate = async (
    application: ApplicationRow,
    next: RecruitmentStatus,
    note = ''
  ) => {
    if (!userId || busyId !== null) return;

    setBusyId(application.id);
    setListNotice(null);

    try {
      const trimmedNote = note.trim();
      const payload: {
        status: RecruitmentStatus;
        handled_by: string;
        handle_note?: string | null;
      } = { status: next, handled_by: userId };

      if (next === 'accepted' || next === 'rejected') {
        payload.handle_note = trimmedNote === '' ? null : trimmedNote;
      }

      const { data, error } = await supabase
        .from('recruitment_applications')
        .update(payload)
        .eq('id', application.id)
        .select('id')
        .maybeSingle();

      if (error) {
        setListNotice({ kind: 'error', text: `更新失败：${error.message}` });
        return;
      }

      if (!data) {
        setListNotice({
          kind: 'error',
          text: '更新失败：没有找到该申请，或当前账号无权处理。',
        });
        return;
      }

      setAction(null);
      setListNotice({
        kind: 'success',
        text: `申请 #${application.id} 已更新为「${STATUS_META[next].label}」，系统会自动通知申请人。`,
      });
      reloadCurrentPage();
    } catch (error) {
      setListNotice({ kind: 'error', text: `更新失败：${errorMessage(error)}` });
    } finally {
      setBusyId(null);
    }
  };

  const submitAction = async (application: ApplicationRow) => {
    if (!action || action.applicationId !== application.id) return;
    await applyUpdate(application, action.next, action.note);
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
            <h1 className="text-2xl font-bold text-white md:text-3xl">📢 招募管理</h1>
            <p className="mt-1 text-sm text-gray-500">
              开启/关闭招募、编辑招募文案、审核玩家申请；状态变更后系统会自动通知申请人。
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/recruitment" className="text-blue-400 transition hover:text-white">
              查看招募页 →
            </Link>
            <Link href="/admin" className="text-gray-400 transition hover:text-white">
              ← 返回控制台
            </Link>
          </div>
        </div>

        {/* ================= 招募设置 ================= */}
        <section className="mb-6 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-700/70 pb-3">
            <div>
              <h2 className="text-lg font-bold text-white">⚙️ 招募设置</h2>
              <p className="mt-1 text-xs text-gray-500">
                关闭后网站 /recruitment 将不再显示申请表单；已提交的申请仍可继续审核。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">
                招募状态：
                <span className={isOpen ? 'font-bold text-green-400' : 'font-bold text-gray-300'}>
                  {isOpen ? '已开启' : '已关闭'}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isOpen}
                aria-label="开启招募"
                onClick={() => void toggleRecruitment()}
                disabled={toggleBusy || saveBusy || settingsLoading || !settingsReady}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isOpen ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    isOpen ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              {toggleBusy && <span className="text-xs text-gray-400">保存中...</span>}
            </div>
          </div>

          {settingsError && (
            <div
              role="alert"
              className="mt-3 flex flex-col gap-2 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="break-all">加载失败：{settingsError}</span>
              <button
                type="button"
                onClick={() => setSettingsReloadToken((value) => value + 1)}
                disabled={settingsLoading}
                className="shrink-0 rounded bg-red-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                重试
              </button>
            </div>
          )}

          {settingsNotice && (
            <p
              aria-live="polite"
              className={`mt-3 rounded border px-4 py-2.5 text-sm ${
                settingsNotice.kind === 'success'
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-300'
              }`}
            >
              {settingsNotice.text}
            </p>
          )}

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="recruitment-title" className={labelClass}>
                标题
              </label>
              <input
                id="recruitment-title"
                type="text"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                maxLength={120}
                placeholder="加入 RCT MP 团队"
                disabled={settingsLoading}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="recruitment-intro" className={labelClass}>
                介绍
              </label>
              <textarea
                id="recruitment-intro"
                value={form.intro}
                onChange={(event) => updateField('intro', event.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="向玩家介绍社区团队与招募背景（支持多行）。"
                disabled={settingsLoading}
                className={`${inputClass} resize-y`}
              />
            </div>

            <div>
              <label htmlFor="recruitment-requirements" className={labelClass}>
                要求
              </label>
              <textarea
                id="recruitment-requirements"
                value={form.requirements}
                onChange={(event) => updateField('requirements', event.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="逐条列出申请条件（支持多行）。"
                disabled={settingsLoading}
                className={`${inputClass} resize-y`}
              />
            </div>

            <div>
              <label htmlFor="recruitment-positions" className={labelClass}>
                职位列表
              </label>
              <textarea
                id="recruitment-positions"
                value={form.positions}
                onChange={(event) => updateField('positions', event.target.value)}
                rows={6}
                maxLength={4000}
                placeholder={'社区版主 | 社区线 | 负责论坛与 Discord 版务\n活动策划 | 活动线 | 规划联运路线、组织官方活动'}
                disabled={settingsLoading}
                className={`${inputClass} resize-y font-mono text-xs`}
              />
              <p className="mt-1 text-xs text-gray-500">
                每行一个职位，格式：职位 | 部门 | 说明。
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-700/70 pt-4">
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={saveBusy || toggleBusy || settingsLoading || !settingsReady}
              className="rounded bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveBusy ? '保存中...' : '保存设置'}
            </button>
            <span className="text-xs text-gray-500">
              最后更新：{formatTime(settingsUpdatedAt)}
            </span>
          </div>
        </section>

        {/* ================= 申请列表 ================= */}
        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-gray-700 bg-[#2c2d31] p-4 md:flex-row md:items-end">
          <div className="w-full md:w-48">
            <label htmlFor="recruitment-status-filter" className={labelClass}>
              状态筛选
            </label>
            <select
              id="recruitment-status-filter"
              value={statusFilter}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'all' || isRecruitmentStatus(value)) {
                  setStatusFilter(value);
                  // 改变筛选条件后回到第 1 页。
                  setPage(1);
                  setAction(null);
                  setExpanded({});
                  setListNotice(null);
                }
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

          <div className="flex flex-wrap items-center gap-3 md:ml-auto">
            <button
              type="button"
              onClick={reloadCurrentPage}
              disabled={loading}
              className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:border-blue-500 hover:text-white disabled:opacity-50"
            >
              {loading ? '刷新中...' : '刷新'}
            </button>
            <span className="text-xs text-gray-500">
              共 {totalCount} 条 · 第 {currentPage} / {totalPages} 页（每页 {PAGE_SIZE} 条）
            </span>
          </div>
        </div>

        {loadError && (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-2 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="break-all">加载失败：{loadError}</span>
            <button
              type="button"
              onClick={reloadCurrentPage}
              disabled={loading}
              className="shrink-0 rounded bg-red-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              重试
            </button>
          </div>
        )}

        {listNotice && (
          <p
            aria-live="polite"
            className={`mb-4 rounded border px-4 py-3 text-sm ${
              listNotice.kind === 'success'
                ? 'border-green-500/40 bg-green-500/10 text-green-300'
                : 'border-red-500/40 bg-red-500/10 text-red-300'
            }`}
          >
            {listNotice.text}
          </p>
        )}

        <div ref={listTopRef} className="scroll-mt-6">
          {loading && applications.length === 0 ? (
            <div aria-busy="true" aria-live="polite" className="space-y-4">
              <p className="text-center text-sm text-gray-500">加载中...</p>
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-32 animate-pulse rounded-lg border border-gray-700/40 bg-[#232428]"
                />
              ))}
            </div>
          ) : null}

          {!loading && !loadError && applications.length === 0 ? (
            <p className="rounded border border-gray-700 bg-[#2c2d31] px-4 py-12 text-center text-sm text-gray-500">
              {hasFilter ? '没有符合当前筛选条件的申请。' : '暂无招募申请。'}
            </p>
          ) : null}

          {applications.length > 0 ? (
            <>
              <ul
                aria-busy={loading}
                className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}
              >
                {applications.map((application) => {
                  const meta = STATUS_META[application.status];
                  const busy = busyId === application.id;
                  const applicant = profileOf(application.user_id);
                  const activeAction =
                    action !== null && action.applicationId === application.id ? action : null;
                  const isLong = application.message.length > MESSAGE_PREVIEW_LEN;
                  const isExpanded = expanded[application.id] === true;
                  const messageText = isLong && !isExpanded
                    ? `${application.message.slice(0, MESSAGE_PREVIEW_LEN)}…`
                    : application.message;

                  return (
                    <li
                      key={application.id}
                      className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg md:p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                        <span className="rounded border border-gray-600 bg-[#232428] px-2 py-0.5 text-xs text-white">
                          {application.position}
                        </span>
                        <span className="text-xs text-gray-500">#{application.id}</span>
                        <span className="text-xs text-gray-500">
                          {formatTime(application.created_at)}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                        <span>申请人：</span>
                        <Link
                          href={`/profile/${application.user_id}`}
                          className="text-blue-400 transition hover:text-blue-300"
                        >
                          {displayName(application.user_id)}
                        </Link>
                        {applicant?.custom_id && (
                          <span className="text-gray-500">（{applicant.custom_id}）</span>
                        )}
                        {applicant?.steam_verified && (
                          <span className="rounded border border-green-500/40 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-300">
                            Steam 已验证
                          </span>
                        )}
                      </div>

                      <p className="mt-1 break-all text-xs text-gray-400">
                        联系方式：
                        <span className="text-gray-300">{application.contact ?? '——'}</span>
                      </p>

                      {application.message.trim() ? (
                        <div className="mt-2">
                          <p className="whitespace-pre-wrap break-words text-sm text-gray-300">
                            {messageText}
                          </p>
                          {isLong && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((previous) => ({
                                  ...previous,
                                  [application.id]: !previous[application.id],
                                }))
                              }
                              className="mt-1 text-xs text-blue-400 transition hover:text-blue-300"
                            >
                              {isExpanded ? '收起' : '展开全文'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm italic text-gray-500">（未填写申请说明）</p>
                      )}

                      <div className="mt-3 border-t border-gray-700/60 pt-3 text-xs text-gray-400">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            处理人：
                            {application.handled_by
                              ? displayName(application.handled_by)
                              : '——'}
                          </span>
                          <span>更新时间：{formatTime(application.updated_at)}</span>
                        </div>
                        {application.handle_note && (
                          <p className="mt-2 whitespace-pre-wrap break-words text-gray-300">
                            处理备注：{application.handle_note}
                          </p>
                        )}
                      </div>

                      {application.status === 'pending' || application.status === 'reviewing' ? (
                        <div className="mt-4">
                          {activeAction ? (
                            <div className="rounded border border-blue-500/40 bg-[#232428] p-3">
                              <p className="mb-2 text-sm text-white">
                                将申请 #{application.id} 标记为「
                                {STATUS_META[activeAction.next].label}」
                              </p>
                              <textarea
                                value={activeAction.note}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setAction((previous) =>
                                    previous && previous.applicationId === application.id
                                      ? { ...previous, note: value }
                                      : previous
                                  );
                                }}
                                rows={3}
                                maxLength={1000}
                                placeholder="处理备注（可选），会展示给申请人并随通知发送。"
                                className={`${inputClass} resize-y`}
                              />
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void submitAction(application)}
                                  disabled={busy || busyId !== null}
                                  className={`rounded px-4 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                    activeAction.next === 'accepted'
                                      ? 'bg-green-600 hover:bg-green-700'
                                      : 'bg-red-600 hover:bg-red-700'
                                  }`}
                                >
                                  {busy
                                    ? '提交中...'
                                    : activeAction.next === 'accepted'
                                      ? '确认通过'
                                      : '确认拒绝'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAction(null)}
                                  disabled={busy}
                                  className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition hover:text-white disabled:opacity-50"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {application.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => void applyUpdate(application, 'reviewing')}
                                  disabled={busyId !== null}
                                  className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {busy ? '提交中...' : '开始审核'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => startAction(application.id, 'accepted')}
                                disabled={busyId !== null}
                                className="rounded bg-green-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                通过
                              </button>
                              <button
                                type="button"
                                onClick={() => startAction(application.id, 'rejected')}
                                disabled={busyId !== null}
                                className="rounded border border-gray-600 bg-[#232428] px-4 py-2 text-sm text-gray-300 transition hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                拒绝
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
                  共 {totalCount} 条 · 第 {currentPage} / {totalPages} 页
                  <span className="ml-2 text-gray-600">（每页 {PAGE_SIZE} 条）</span>
                </p>
                <nav aria-label="招募申请分页" className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={loading || currentPage <= 1}
                    className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
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
                    下一页
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
