'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import RichTextEditor from '@/components/RichTextEditor';
import { canAccessAdmin, levelOf } from '@/lib/permissions';

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

interface RegistrationProfile {
  display_name: string | null;
  custom_id: string | null;
  steam_verified: boolean | null;
}

interface RegistrationRow {
  id: number;
  user_id: string;
  status: string | null;
  note: string | null;
  created_at: string | null;
  profiles: RegistrationProfile | RegistrationProfile[] | null;
}

interface RegistrationEntry {
  id: number;
  userId: string;
  displayName: string;
  customId: string | null;
  steamVerified: boolean;
  note: string | null;
  createdAt: string | null;
}

type EventStatus = 'draft' | 'published';

interface EventFormState {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  serverId: string;
  capacity: string;
  imageUrl: string;
  status: EventStatus;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

function emptyEventForm(): EventFormState {
  return {
    title: '',
    description: '',
    startAt: '',
    endAt: '',
    location: '',
    serverId: '',
    capacity: '',
    imageUrl: '',
    status: 'draft',
  };
}

function countOf(value: unknown): number {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function countMapFrom(rows: unknown): Record<number, number> {
  const map: Record<number, number> = {};
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const id = typeof record.event_id === 'number' ? record.event_id : Number(record.event_id);
    if (!Number.isFinite(id)) continue;
    map[id] = countOf(record.registered_count);
  }
  return map;
}

function pickProfile(
  value: RegistrationRow['profiles'] | undefined
): RegistrationProfile | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toRegistrationEntries(
  rows: unknown,
  fallbackProfiles?: Map<string, RegistrationProfile>
): RegistrationEntry[] {
  if (!Array.isArray(rows)) return [];

  const entries: RegistrationEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const id = Number(record.id);
    const userId = typeof record.user_id === 'string' ? record.user_id : '';
    if (!Number.isFinite(id) || !userId) continue;

    const joined = record.profiles as RegistrationRow['profiles'];
    const profile = pickProfile(joined) ?? fallbackProfiles?.get(userId) ?? null;
    const createdAt = typeof record.created_at === 'string' ? record.created_at : null;
    const note = typeof record.note === 'string' && record.note.trim() ? record.note.trim() : null;

    entries.push({
      id,
      userId,
      displayName: profile?.display_name?.trim() || '未命名玩家',
      customId: profile?.custom_id?.trim() || null,
      steamVerified: profile?.steam_verified === true,
      note,
      createdAt,
    });
  }

  // 按报名时间升序（created_at 缺失的排在最后）
  entries.sort((a, b) => {
    const left = a.createdAt ? new Date(a.createdAt).getTime() : Number.POSITIVE_INFINITY;
    const right = b.createdAt ? new Date(b.createdAt).getTime() : Number.POSITIVE_INFINITY;
    return left - right;
  });

  return entries;
}

function formatDateTime(value: string | null): string {
  if (!value) return '——';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '——';
  return date.toLocaleString('zh-CN');
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function titleOf(event: EventRow): string {
  return event.title?.trim() || '未命名活动';
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '操作失败，请稍后重试';
}

function statusBadge(status: string | null): { label: string; className: string } {
  if (status === 'published') {
    return { label: '已发布', className: 'border-green-500/40 bg-green-500/15 text-green-300' };
  }
  if (status === 'cancelled') {
    return { label: '已取消', className: 'border-red-500/40 bg-red-500/15 text-red-300' };
  }
  if (status === 'draft') {
    return { label: '草稿', className: 'border-gray-600 bg-[#232428] text-gray-300' };
  }
  return { label: '未知', className: 'border-gray-600 bg-[#232428] text-gray-400' };
}

const inputClass =
  'w-full rounded border border-gray-600 bg-[#18191c] p-3 text-white focus:border-blue-500 focus:outline-none';
const labelClass = 'mb-1 block text-sm text-gray-400';

export default function AdminEventsPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [roleLevel, setRoleLevel] = useState(0);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EventFormState>(emptyEventForm);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [openRegistrationIds, setOpenRegistrationIds] = useState<number[]>([]);
  const [registrations, setRegistrations] = useState<Record<number, RegistrationEntry[]>>({});
  const [registrationsLoading, setRegistrationsLoading] = useState<Record<number, boolean>>({});
  const [registrationsError, setRegistrationsError] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
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

        const myLevel = levelOf(profile?.role_level);
        if (!canAccessAdmin(myLevel)) {
          alert('🚫 权限不足：只有工作人员 (Lv.40) 及以上级别才能管理活动。');
          router.push('/admin');
          return;
        }

        setUserId(user.id);
        setRoleLevel(myLevel);
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

  useEffect(() => {
    if (checking) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .order('start_at', { ascending: false });

        if (cancelled) return;

        if (error) {
          setLoadError(errorMessage(error));
          setEvents([]);
          setCounts({});
          return;
        }

        setEvents((data ?? []) as EventRow[]);

        const { data: countData, error: countError } = await supabase
          .from('event_registration_counts')
          .select('event_id,registered_count');
        if (cancelled) return;

        if (countError) {
          console.error('加载报名人数失败:', countError);
          setCounts({});
        } else {
          setCounts(countMapFrom(countData));
        }
      } catch (error) {
        if (cancelled) return;
        setLoadError(errorMessage(error));
        setEvents([]);
        setCounts({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [checking, reloadToken]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyEventForm());
    setFormOpen(true);
    setNotice(null);
  };

  const openEdit = (event: EventRow) => {
    setEditingId(event.id);
    setForm({
      title: event.title ?? '',
      description: event.description ?? '',
      startAt: toDateTimeLocal(event.start_at),
      endAt: toDateTimeLocal(event.end_at),
      location: event.location ?? '',
      serverId: event.server_id ?? '',
      capacity: event.capacity === null ? '' : String(event.capacity),
      imageUrl: event.image_url ?? '',
      status: event.status === 'published' ? 'published' : 'draft',
    });
    setFormOpen(true);
    setNotice(null);
  };

  const closeForm = () => {
    if (submitting) return;
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyEventForm());
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || !userId) return;

    const title = form.title.trim();
    if (!title) {
      setNotice({ kind: 'error', text: '请填写活动标题。' });
      return;
    }

    const startDate = new Date(form.startAt);
    if (!form.startAt || Number.isNaN(startDate.getTime())) {
      setNotice({ kind: 'error', text: '请填写有效的开始时间。' });
      return;
    }

    let endDate: Date | null = null;
    if (form.endAt) {
      endDate = new Date(form.endAt);
      if (Number.isNaN(endDate.getTime())) {
        setNotice({ kind: 'error', text: '结束时间格式无效。' });
        return;
      }
      if (endDate.getTime() < startDate.getTime()) {
        setNotice({ kind: 'error', text: '结束时间不能早于开始时间。' });
        return;
      }
    }

    let capacity: number | null = null;
    if (form.capacity.trim()) {
      const parsed = Number(form.capacity);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setNotice({ kind: 'error', text: '容量必须是大于 0 的整数，或留空表示不限。' });
        return;
      }
      capacity = parsed;
    }

    const payload = {
      title,
      description: form.description.trim(),
      start_at: startDate.toISOString(),
      end_at: endDate ? endDate.toISOString() : null,
      location: form.location.trim() || null,
      server_id: form.serverId.trim() || null,
      capacity,
      image_url: form.imageUrl.trim() || null,
      status: form.status,
    };

    setSubmitting(true);
    setNotice(null);

    try {
      if (editingId === null) {
        const { error } = await supabase
          .from('events')
          .insert({ ...payload, created_by: userId });
        if (error) {
          setNotice({ kind: 'error', text: errorMessage(error) });
          return;
        }
        setNotice({ kind: 'success', text: '🎉 活动已创建。' });
      } else {
        const { error } = await supabase.from('events').update(payload).eq('id', editingId);
        if (error) {
          setNotice({ kind: 'error', text: errorMessage(error) });
          return;
        }
        setNotice({ kind: 'success', text: '活动已更新。' });
      }

      setForm(emptyEventForm());
      setEditingId(null);
      setFormOpen(false);
      setReloadToken((value) => value + 1);
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (event: EventRow, nextStatus: EventStatus) => {
    if (busyId !== null) return;
    setBusyId(event.id);
    setNotice(null);

    try {
      const { error } = await supabase
        .from('events')
        .update({ status: nextStatus })
        .eq('id', event.id);
      if (error) {
        setNotice({ kind: 'error', text: errorMessage(error) });
        return;
      }

      setEvents((previous) =>
        previous.map((item) => (item.id === event.id ? { ...item, status: nextStatus } : item))
      );
      setNotice({
        kind: 'success',
        text:
          nextStatus === 'published'
            ? `已发布「${titleOf(event)}」。`
            : `已取消发布「${titleOf(event)}」（状态改为草稿）。`,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (event: EventRow) => {
    if (busyId !== null) return;
    const title = titleOf(event);
    if (!window.confirm(`确定删除活动「${title}」吗？删除后无法恢复，相关报名记录可能一并删除。`)) {
      return;
    }

    setBusyId(event.id);
    setNotice(null);

    try {
      const { error } = await supabase.from('events').delete().eq('id', event.id);
      if (error) {
        setNotice({ kind: 'error', text: errorMessage(error) });
        return;
      }

      setEvents((previous) => previous.filter((item) => item.id !== event.id));
      setNotice({ kind: 'success', text: `已删除「${title}」。` });
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const loadRegistrations = async (eventId: number) => {
    setRegistrationsLoading((previous) => ({ ...previous, [eventId]: true }));
    setRegistrationsError((previous) => {
      if (!(eventId in previous)) return previous;
      const next = { ...previous };
      delete next[eventId];
      return next;
    });

    try {
      const { data, error } = await supabase
        .from('event_registrations')
        .select(
          'id, user_id, status, note, created_at, profiles!user_id(display_name, custom_id, steam_verified)'
        )
        .eq('event_id', eventId)
        .eq('status', 'registered')
        .order('created_at', { ascending: true })
        .limit(200);

      let entries: RegistrationEntry[] | null = null;

      if (!error) {
        entries = toRegistrationEntries(data);
      } else {
        // embed 关系解析失败时回退：先取报名记录，再按 user_id 批量查 profiles
        const fallback = await supabase
          .from('event_registrations')
          .select('id, user_id, status, note, created_at')
          .eq('event_id', eventId)
          .eq('status', 'registered')
          .order('created_at', { ascending: true })
          .limit(200);

        if (fallback.error) {
          setRegistrationsError((previous) => ({
            ...previous,
            [eventId]: fallback.error.message,
          }));
          return;
        }

        const fallbackRows = (fallback.data ?? []) as RegistrationRow[];
        const userIds = Array.from(
          new Set(fallbackRows.map((row) => row.user_id).filter((id) => id.length > 0))
        );
        const profileMap = new Map<string, RegistrationProfile>();

        if (userIds.length > 0) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, display_name, custom_id, steam_verified')
            .in('id', userIds);

          if (profileError) {
            setRegistrationsError((previous) => ({
              ...previous,
              [eventId]: profileError.message,
            }));
            return;
          }

          for (const row of (profileData ?? []) as (RegistrationProfile & { id: string })[]) {
            profileMap.set(row.id, row);
          }
        }

        entries = toRegistrationEntries(fallbackRows, profileMap);
      }

      const { data: countData, error: countError } = await supabase
        .from('event_registration_counts')
        .select('registered_count')
        .eq('event_id', eventId)
        .maybeSingle();
      if (!countError) {
        const nextCount = countOf(countData?.registered_count);
        setCounts((previous) => ({ ...previous, [eventId]: nextCount }));
      }

      setRegistrations((previous) => ({ ...previous, [eventId]: entries ?? [] }));
    } catch (error) {
      setRegistrationsError((previous) => ({ ...previous, [eventId]: errorMessage(error) }));
    } finally {
      setRegistrationsLoading((previous) => {
        const next = { ...previous };
        delete next[eventId];
        return next;
      });
    }
  };

  const toggleRegistrations = (eventId: number) => {
    const isOpen = openRegistrationIds.includes(eventId);
    setOpenRegistrationIds((previous) =>
      isOpen ? previous.filter((id) => id !== eventId) : [...previous, eventId]
    );
    if (!isOpen && !(eventId in registrations) && !registrationsLoading[eventId]) {
      void loadRegistrations(eventId);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#18191c] text-white">
        验证权限中...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#18191c] p-6 font-sans text-gray-300 md:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-blue-400 md:text-3xl">🗓️ 活动管理</h1>
            <p className="mt-1 text-sm text-gray-500">
              发布活动、管理报名 · 当前身份 Lv.{roleLevel}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/events" className="text-blue-400 transition hover:text-white">
              查看活动页 →
            </Link>
            <Link href="/admin" className="text-gray-400 transition hover:text-white">
              ← 返回控制台
            </Link>
          </div>
        </div>

        {notice ? (
          <p
            role="alert"
            className={`mb-5 rounded-lg border px-3 py-2 text-sm ${
              notice.kind === 'success'
                ? 'border-green-500/40 bg-green-500/10 text-green-300'
                : 'border-red-500/40 bg-red-500/10 text-red-300'
            }`}
          >
            {notice.text}
          </p>
        ) : null}

        {formOpen ? (
          <section className="mb-8 rounded-xl border border-gray-700 bg-[#2c2d31] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between border-b border-gray-700 pb-3">
              <h2 className="text-lg font-bold text-white">
                {editingId === null ? '新建活动' : `编辑活动 #${editingId}`}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                disabled={submitting}
                className="text-sm text-gray-400 transition hover:text-white disabled:opacity-60"
              >
                关闭
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="event-title" className={labelClass}>
                  活动标题 <span className="text-red-400">*</span>
                </label>
                <input
                  id="event-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((previous) => ({ ...previous, title: e.target.value }))}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <RichTextEditor
                  label="活动描述"
                  value={form.description}
                  onChange={(value) =>
                    setForm((previous) => ({ ...previous, description: value }))
                  }
                  rows={4}
                  placeholder="支持 **加粗**、*斜体*、`代码`、[链接](https://...)、![图片](https://...)、> 引用、- 列表、## 标题；普通换行会保留。"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="event-start" className={labelClass}>
                    开始时间 <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="event-start"
                    type="datetime-local"
                    value={form.startAt}
                    onChange={(e) =>
                      setForm((previous) => ({ ...previous, startAt: e.target.value }))
                    }
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="event-end" className={labelClass}>
                    结束时间（可选）
                  </label>
                  <input
                    id="event-end"
                    type="datetime-local"
                    value={form.endAt}
                    onChange={(e) =>
                      setForm((previous) => ({ ...previous, endAt: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="event-location" className={labelClass}>
                    地点
                  </label>
                  <input
                    id="event-location"
                    type="text"
                    value={form.location}
                    onChange={(e) =>
                      setForm((previous) => ({ ...previous, location: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="例如：杜伊斯堡 / 加来"
                  />
                </div>
                <div>
                  <label htmlFor="event-server" className={labelClass}>
                    服务器
                  </label>
                  <input
                    id="event-server"
                    type="text"
                    value={form.serverId}
                    onChange={(e) =>
                      setForm((previous) => ({ ...previous, serverId: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="例如：EU Simulation 1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="event-capacity" className={labelClass}>
                    容量（可选，留空表示不限）
                  </label>
                  <input
                    id="event-capacity"
                    type="number"
                    min={1}
                    step={1}
                    value={form.capacity}
                    onChange={(e) =>
                      setForm((previous) => ({ ...previous, capacity: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="例如：40"
                  />
                </div>
                <div>
                  <label htmlFor="event-image" className={labelClass}>
                    封面图片 URL
                  </label>
                  <input
                    id="event-image"
                    type="url"
                    value={form.imageUrl}
                    onChange={(e) =>
                      setForm((previous) => ({ ...previous, imageUrl: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="https://i.imgur.com/xxxxx.jpg"
                  />
                </div>
              </div>

              <div className="md:w-1/2 md:pr-2">
                <label htmlFor="event-status" className={labelClass}>
                  状态
                </label>
                <select
                  id="event-status"
                  value={form.status}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      status: e.target.value === 'published' ? 'published' : 'draft',
                    }))
                  }
                  className={inputClass}
                >
                  <option value="draft">草稿（不在活动页展示）</option>
                  <option value="published">已发布（所有访客可见）</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-gray-700 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting
                    ? '保存中...'
                    : editingId === null
                      ? '创建活动'
                      : '保存修改'}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={submitting}
                  className="rounded-lg border border-gray-600 px-5 py-2.5 text-sm text-gray-300 transition hover:border-gray-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  取消
                </button>
              </div>
            </form>
          </section>
        ) : (
          <div className="mb-6">
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              + 新建活动
            </button>
          </div>
        )}

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">全部活动</h2>
            {!loading && !loadError ? (
              <span className="text-xs text-gray-500">共 {events.length} 个</span>
            ) : null}
          </div>

          {loading ? (
            <div className="rounded-xl border border-gray-700 bg-[#2c2d31] p-10 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
              <p className="mt-4 text-sm text-gray-400">正在获取活动列表…</p>
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-red-900/60 bg-[#2c2d31] p-8 text-center">
              <p className="text-lg font-bold text-white">加载失败</p>
              <p className="mt-2 text-sm text-red-300">{loadError}</p>
              <button
                type="button"
                onClick={() => setReloadToken((value) => value + 1)}
                className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
              >
                重新加载
              </button>
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 bg-[#2c2d31]/60 p-10 text-center">
              <p className="text-base font-bold text-white">暂无活动</p>
              <p className="mt-2 text-sm text-gray-500">
                点击上方「新建活动」创建第一场活动。
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-700 bg-[#2c2d31] shadow-xl shadow-black/20">
              {events.map((event, index) => {
                const badge = statusBadge(event.status);
                const registered = counts[event.id] ?? 0;
                const isBusy = busyId === event.id;
                const isOpen = openRegistrationIds.includes(event.id);
                const isLoadingRegistrations = registrationsLoading[event.id] === true;
                const registrationEntries = registrations[event.id];
                const registrationError = registrationsError[event.id];
                const countText =
                  event.capacity !== null
                    ? `${registered} / ${event.capacity}`
                    : `${registered} 人`;

                return (
                  <div
                    key={event.id}
                    className={`p-4 md:p-5 ${index > 0 ? 'border-t border-gray-700' : ''}`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-bold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          <Link
                            href={`/events/${event.id}`}
                            className="truncate text-base font-bold text-white transition hover:text-blue-400"
                          >
                            {titleOf(event)}
                          </Link>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
                          <span>
                            🕒 {formatDateTime(event.start_at)}
                            {event.end_at ? ` → ${formatDateTime(event.end_at)}` : ''}
                          </span>
                          <span>📍 {event.location?.trim() || '地点待定'}</span>
                          <span>🖥️ {event.server_id?.trim() || '未指定服务器'}</span>
                          <span>
                            👥 报名{' '}
                            <span className="font-mono font-bold text-blue-300">{countText}</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleRegistrations(event.id)}
                          aria-expanded={isOpen}
                          className="rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-300 transition hover:border-blue-400 hover:text-white"
                        >
                          {isOpen ? '收起名单' : '报名名单'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(event)}
                          disabled={busyId !== null || submitting}
                          className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-bold text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          编辑
                        </button>
                        {event.status === 'published' ? (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(event, 'draft')}
                            disabled={busyId !== null || submitting}
                            className="rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-300 transition hover:border-orange-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isBusy ? '处理中…' : '取消发布'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(event, 'published')}
                            disabled={busyId !== null || submitting}
                            className="rounded-lg border border-green-500/50 bg-green-500/10 px-3 py-1.5 text-xs font-bold text-green-300 transition hover:border-green-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isBusy ? '处理中…' : '发布'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(event)}
                          disabled={busyId !== null || submitting}
                          className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:border-red-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? '处理中…' : '删除'}
                        </button>
                      </div>
                    </div>

                    {isOpen ? (
                      <div className="mt-4 rounded-lg border border-gray-700 bg-[#232428] p-3 md:p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-700 pb-2">
                          <span className="text-sm font-bold text-white">报名名单</span>
                          <span className="text-xs text-gray-500">
                            已报名{' '}
                            <span className="font-mono font-bold text-blue-300">{registered}</span>{' '}
                            人
                            {registrationEntries && registrationEntries.length !== registered
                              ? `（已加载 ${registrationEntries.length} 条）`
                              : ''}
                          </span>
                          {isLoadingRegistrations ? (
                            <span className="text-xs text-gray-400">加载中…</span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void loadRegistrations(event.id)}
                            disabled={isLoadingRegistrations}
                            className="ml-auto rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            刷新名单
                          </button>
                        </div>

                        {registrationError ? (
                          <p className="rounded border border-red-900/60 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                            {registrationError}
                          </p>
                        ) : isLoadingRegistrations && !registrationEntries ? (
                          <p className="py-4 text-center text-xs text-gray-500">
                            正在加载报名名单…
                          </p>
                        ) : !registrationEntries || registrationEntries.length === 0 ? (
                          <p className="py-4 text-center text-xs text-gray-500">暂无报名</p>
                        ) : (
                          <ul className="text-sm">
                            {registrationEntries.map((entry) => (
                              <li
                                key={entry.id}
                                className="flex flex-col gap-1 border-t border-gray-700/60 py-2 first:border-t-0 md:flex-row md:items-center md:gap-4"
                              >
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                  <span className="truncate font-bold text-white">
                                    {entry.displayName}
                                  </span>
                                  {entry.steamVerified ? (
                                    <span className="rounded border border-green-500/40 bg-green-500/15 px-1.5 py-0.5 text-[11px] font-bold text-green-300">
                                      Steam 已验证
                                    </span>
                                  ) : null}
                                  <span className="font-mono text-xs text-blue-400">
                                    ID: {entry.customId || '无'}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                                  <span>📝 {entry.note || '无备注'}</span>
                                  <span>🕒 {formatDateTime(entry.createdAt)}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
