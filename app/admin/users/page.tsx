// app/admin/users/page.tsx
'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ROLE_LABELS,
  ROLE_LEVEL,
  canManageUsers,
  levelOf,
  roleLabel,
} from '@/lib/permissions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAGE_SIZE = 50;
// 页码窗口：当前页前后各 2 页，首尾页始终显示
const PAGE_WINDOW = 2;

const ROLE_COLUMNS = 'name,display_name,level,department';

interface UserRow {
  id: string;
  display_name: string | null;
  random_id: string | null;
  custom_id: string | null;
  role: string | null;
  role_level: number;
}

interface RoleRow {
  name: string;
  display_name: string;
  level: number;
  department: string | null;
}

interface CurrentProfile {
  id: string;
  role: string | null;
  role_level: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
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

function toUserRow(raw: unknown): UserRow | null {
  if (!isRecord(raw)) return null;

  const id = asText(raw.id);
  if (!id) return null;

  return {
    id,
    display_name: asText(raw.display_name),
    random_id: asText(raw.random_id),
    custom_id: asText(raw.custom_id),
    role: asText(raw.role),
    role_level: asLevel(raw.role_level),
  };
}

function toUserRows(data: unknown): UserRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(toUserRow).filter((row): row is UserRow => row !== null);
}

function toRoleRow(raw: unknown): RoleRow | null {
  if (!isRecord(raw)) return null;

  const name = asText(raw.name);
  if (!name) return null;

  return {
    name,
    display_name: asText(raw.display_name) ?? name,
    level: asLevel(raw.level),
    department: asText(raw.department),
  };
}

function toRoleRows(data: unknown): RoleRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(toRoleRow).filter((role): role is RoleRow => role !== null);
}

/**
 * 清洗搜索词：去掉 PostgREST 过滤器语法字符与 ilike 通配符，
 * 避免用户输入破坏 .or() 语法或把 % / _ 当成通配符。
 */
function normalizeSearch(value: string): string {
  return value
    .trim()
    .slice(0, 64)
    .replace(/[%_,()"'\\\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '操作失败，请稍后重试';
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

export default function UserManagementPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentProfile | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);

  // 列表：服务端分页 + 搜索 + 职位筛选
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editLevel, setEditLevel] = useState(10);
  const [editCustomId, setEditCustomId] = useState('');

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listTopRef = useRef<HTMLElement>(null);

  // 权限门禁：未登录 -> /login；低于 Lv.70 -> alert + /admin
  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!active) return;
        if (!user) {
          router.push('/login');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, role_level')
          .eq('id', user.id)
          .single();
        if (!active) return;

        if (profileError) {
          alert(`无法验证权限：${profileError.message}`);
          router.push('/admin');
          return;
        }

        // 人员管理要求经理 (Lv.70) 及以上；判权只依据 role_level，不再用邮箱或 role 字符串提权
        const myLevel = levelOf(profile?.role_level);

        if (!canManageUsers(myLevel)) {
          alert('🚫 权限不足：只有经理 (Lv.70) 及以上级别才能访问人员管理。');
          router.push('/admin');
          return;
        }

        setCurrentUser({
          id: user.id,
          role: asText(profile?.role),
          role_level: asLevel(profile?.role_level),
        });

        // 拉取职位库（编辑下拉 + 筛选共用）
        const { data: rolesData, error: rolesError } = await supabase
          .from('roles')
          .select(ROLE_COLUMNS)
          .order('level', { ascending: false });

        if (!active) return;
        if (rolesError) {
          console.error(
            '拉取职位失败，请检查 Supabase roles 表是否创建并开放权限：',
            rolesError.message
          );
        } else {
          setRoles(toRoleRows(rolesData));
        }

        setChecking(false);
      } catch (error) {
        if (!active) return;
        alert(`无法验证权限：${errorMessage(error)}`);
        router.push('/admin');
      }
    };

    void checkAuth();

    return () => {
      active = false;
    };
  }, [router]);

  // 点击外部关闭职位下拉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 服务端分页：只取当前页（50 条）+ 精确总数
  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;

    const loadUsers = async () => {
      setListLoading(true);
      setListError(null);

      try {
        const term = normalizeSearch(query);
        let request = supabase
          .from('profiles')
          .select('*', { count: 'exact' });

        if (roleFilter !== 'all') {
          request = request.eq('role', roleFilter);
        }

        if (term) {
          if (/^\d+$/.test(term)) {
            // 数字关键词：同时匹配专属 ID / Steam ID（term 已限制为纯数字）
            request = request.or(`custom_id.eq.${term},steam_id.eq.${term}`);
          } else {
            request = request.ilike('display_name', `%${term}%`);
          }
        }

        const from = (page - 1) * PAGE_SIZE;
        const { data, error, count } = await request
          .order('role_level', { ascending: false })
          .order('display_name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (cancelled) return;

        if (error) {
          setListError(error.message);
          setUsers([]);
          setTotal(0);
          return;
        }

        const rows = toUserRows(data);
        const nextTotal = typeof count === 'number' ? count : from + rows.length;
        setUsers(rows);
        setTotal(nextTotal);

        // 越界回退：删除/筛选导致总数变少时回到最后一页
        const lastPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
        }
      } catch (error) {
        if (cancelled) return;
        setListError(errorMessage(error));
        setUsers([]);
        setTotal(0);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    };

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, [currentUser, page, query, roleFilter, reloadToken]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = buildPageItems(currentPage, totalPages);
  const hasFilters = query !== '' || roleFilter !== 'all';

  const gotoPage = (next: number) => {
    const target = Math.min(Math.max(1, next), totalPages);
    if (target === page) return;

    setPage(target);
    // 翻页后滚动到列表顶部，避免停留在页脚
    window.requestAnimationFrame(() => {
      listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery(normalizeSearch(searchInput));
    setPage(1);
    setReloadToken((value) => value + 1);
  };

  const handleRefresh = () => {
    setReloadToken((value) => value + 1);
  };

  const resetFilters = () => {
    setSearchInput('');
    setQuery('');
    setRoleFilter('all');
    setPage(1);
    setReloadToken((value) => value + 1);
  };

  const handleEditClick = (user: UserRow) => {
    setEditingId(user.id);
    setEditRole(user.role || 'member');
    setEditLevel(levelOf(user.role_level));
    setEditCustomId(user.custom_id || '');
    setRoleSearch('');
  };

  const handleSave = async (targetUser: UserRow) => {
    // 0) 靓号格式校验：非空时必须是 4-8 位数字（与数据库 profiles_custom_id_format 约束一致）
    const trimmedCustomId = editCustomId.trim();
    if (trimmedCustomId !== '' && !/^[0-9]{4,8}$/.test(trimmedCustomId)) {
      alert('靓号必须是 4-8 位数字');
      return;
    }

    const myLevel = levelOf(currentUser?.role_level);
    const targetLevel = levelOf(targetUser.role_level);
    const isSelf = targetUser.id === currentUser?.id;
    // 开发者 (Lv.100) 可操作除自己以外的所有人
    const isDeveloper = myLevel >= ROLE_LEVEL.DEVELOPER;

    // 1) 禁止修改自己的职位/等级：
    //    把自己从 100 降级会直接让社区失去最高管理员（且无法再改回来），属于不可逆误操作。
    //    这里仍允许改自己的靓号，但 role / role_level 必须保持不变；开发者权限转移请由另一位开发者操作。
    if (isSelf && (editRole !== (targetUser.role || 'member') || editLevel !== targetLevel)) {
      alert('❌ 不能修改自己的职位或等级（防止误操作导致失去管理权限）。如需变更请联系其他开发者。');
      return;
    }

    // 2) role 与 role_level 必须保持一致：改职位/等级时以 roles 表的 level 为准，
    //    避免出现 role=developer 但 role_level=40 这类「显示开发者、实际无权限」的组合。
    const currentRole = targetUser.role || 'member';
    const roleChanged = editRole !== currentRole;
    const levelChanged = editLevel !== targetLevel;
    const roleDef = roles.find((role) => role.name === editRole);

    // roles 表未加载或该职位不存在时，禁止改职位（避免写入任意 role 字符串造成脏数据）
    if (!roleDef && roleChanged) {
      alert('❌ 职位列表未加载或该职位不存在，暂时无法修改职位，请刷新页面后重试。');
      return;
    }

    // 只改靓号（职位与等级都没变）时保持原等级不动，避免误改历史数据；
    // 只要动过职位或等级，role_level 就跟随 roles.level。
    const nextRole = roleDef ? roleDef.name : currentRole;
    const nextLevel = roleDef && (roleChanged || levelChanged) ? levelOf(roleDef.level) : targetLevel;

    if (!isSelf) {
      // 3) 不能修改同级或上级；开发者除外
      if (!isDeveloper && targetLevel >= myLevel) {
        alert('❌ 权限不足：你不能修改同级或上级的职位！');
        return;
      }

      // 4) 不能授予同级或更高职位；开发者除外
      if (!isDeveloper && nextLevel >= myLevel) {
        alert('❌ 权限不足：你不能授予别人同级或更高的职位！');
        return;
      }

      // 5) 降级另一位开发者属于高危操作，要求二次确认
      if (targetLevel >= ROLE_LEVEL.DEVELOPER && nextLevel < targetLevel) {
        if (!confirm('⚠️ 你正在降级另一位开发者，确定继续吗？此操作可能影响社区最高管理权限。')) {
          return;
        }
      }
    }

    // 自己的记录只更新靓号，绝不回写 role / role_level：
    // 即使 roles 表中的等级与历史脏数据不一致，也不会因为改靓号而意外改变自己的权限。
    const customId = editCustomId.trim() === '' ? null : editCustomId.trim();
    const updatePayload = isSelf
      ? { custom_id: customId }
      : { role: nextRole, role_level: nextLevel, custom_id: customId };

    const { error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', targetUser.id);

    if (error) {
      alert('保存失败: ' + error.message);
    } else {
      setEditingId(null);
      // 保存后刷新当前页（保持页码与筛选条件）
      setReloadToken((value) => value + 1);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#18191c] text-white">
        加载权限数据中...
      </div>
    );
  }

  const myLevel = levelOf(currentUser?.role_level);
  const isDeveloper = myLevel >= ROLE_LEVEL.DEVELOPER;

  // 展示用职位名：优先 ROLE_LABELS 标准中文名，其次 roles 表的 display_name，最后回退原始 role / 等级标签
  const labelForRole = (role: string | null | undefined, level: number | null | undefined) =>
    (role ? ROLE_LABELS[role] : undefined) ||
    roles.find((item) => item.name === role)?.display_name ||
    roleLabel(role, level);

  // 非开发者最多只能授予「严格低于自己」的职位，避免越级提拔
  const allowedRoles = roles.filter((role) => isDeveloper || levelOf(role.level) < myLevel);
  const filteredRoles = allowedRoles.filter(
    (role) =>
      (ROLE_LABELS[role.name] || role.display_name || '')
        .toLowerCase()
        .includes(roleSearch.toLowerCase()) ||
      role.name.toLowerCase().includes(roleSearch.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-[#18191c] p-4 font-sans text-gray-300 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">👑 人员与职位管理</h1>
            <p className="mt-1 text-xs text-gray-500">
              当前登录身份：
              <span className="font-bold text-blue-400">{labelForRole(currentUser?.role, myLevel)}</span>
            </p>
          </div>
          <Link href="/admin" className="text-sm text-blue-400 transition hover:text-blue-300">
            返回控制台
          </Link>
        </div>

        <section
          ref={listTopRef}
          className="rounded-md border border-gray-700 bg-[#2c2d31] shadow-lg"
        >
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white">👥 成员列表</h2>
              <span className="text-xs text-gray-500">
                共 {total} 人 · 第 {currentPage} / {totalPages} 页
              </span>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2 md:flex-row">
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="昵称 / 专属 ID / Steam ID"
                maxLength={64}
                aria-label="搜索成员"
                className="flex-1 rounded border border-gray-600 bg-[#18191c] p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
              <select
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value);
                  setPage(1);
                }}
                aria-label="按职位筛选"
                className="rounded border border-gray-600 bg-[#18191c] p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none md:w-48"
              >
                <option value="all">全部职位</option>
                {roles.map((role) => (
                  <option key={role.name} value={role.name}>
                    {ROLE_LABELS[role.name] || role.display_name}（Lv.{levelOf(role.level)}）
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={listLoading}
                  className="rounded bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {listLoading ? '加载中...' : '搜索'}
                </button>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={listLoading}
                  className="rounded border border-gray-600 px-4 py-2.5 text-sm text-gray-300 transition hover:border-blue-500 hover:text-white disabled:opacity-50"
                >
                  刷新
                </button>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded border border-gray-600 px-4 py-2.5 text-sm text-gray-300 transition hover:border-blue-500 hover:text-white"
                  >
                    清除筛选
                  </button>
                )}
              </div>
            </form>

            <p className="text-xs text-gray-500">
              每页 {PAGE_SIZE} 条；数字关键词匹配专属 ID / Steam ID，文字匹配昵称。
              {query && (
                <>
                  {' '}
                  当前搜索：<span className="text-gray-300">“{query}”</span>
                </>
              )}
            </p>
          </div>

          {listError ? (
            <div className="border-t border-gray-700 p-6 text-center">
              <p className="text-sm font-bold text-red-400">加载失败</p>
              <p className="mt-1 break-all text-xs text-red-300/80">{listError}</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="mt-3 rounded bg-red-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-600"
              >
                重试
              </button>
            </div>
          ) : (
            <>
              <div className="hidden border-t border-gray-700 bg-[#232428] px-4 py-3 text-xs font-bold text-gray-400 lg:grid lg:grid-cols-[minmax(0,1.3fr)_8rem_10rem_minmax(0,1fr)_11rem] lg:gap-4">
                <span>成员名称</span>
                <span>原始 ID</span>
                <span>专属靓号</span>
                <span>当前职位</span>
                <span>操作</span>
              </div>

              <div className="divide-y divide-gray-700/60 border-t border-gray-700 lg:border-t-0">
                {listLoading ? (
                  <p className="px-4 py-10 text-center text-sm text-gray-500">加载中...</p>
                ) : users.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-sm text-gray-400">
                      {hasFilters ? '没有符合当前筛选条件的成员' : '暂无成员数据'}
                    </p>
                    {hasFilters && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="mt-3 text-xs font-bold text-blue-400 transition hover:text-blue-300"
                      >
                        清除筛选
                      </button>
                    )}
                  </div>
                ) : (
                  users.map((user) => {
                    const rowLevel = levelOf(user.role_level);
                    const isSelfRow = user.id === currentUser?.id;
                    const isEditingRow = editingId === user.id;
                    const canEditRow = isSelfRow || isDeveloper || myLevel > rowLevel;

                    return (
                      <article
                        key={user.id}
                        className="grid grid-cols-1 gap-3 px-4 py-4 transition hover:bg-[#33343a]/60 lg:grid-cols-[minmax(0,1.3fr)_8rem_10rem_minmax(0,1fr)_11rem] lg:items-center lg:gap-4"
                      >
                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            成员名称
                          </span>
                          <span className="min-w-0 truncate font-bold text-white">
                            {user.display_name || '未命名'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            原始 ID
                          </span>
                          <span className="font-mono text-xs text-gray-500">
                            {user.random_id || '-'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            专属靓号
                          </span>
                          {isEditingRow ? (
                            <input
                              type="text"
                              value={editCustomId}
                              onChange={(event) =>
                                setEditCustomId(event.target.value.replace(/\D/g, ''))
                              }
                              maxLength={8}
                              aria-label="专属靓号"
                              className="w-24 rounded border border-blue-500 bg-[#18191c] px-2 py-1 text-sm text-white"
                              placeholder="留空撤回"
                            />
                          ) : user.custom_id ? (
                            <span className="rounded border border-blue-700/50 bg-blue-900/30 px-2 py-1 font-mono text-xs text-blue-400">
                              {user.custom_id}
                            </span>
                          ) : (
                            <span className="text-xs italic text-gray-600">未分配</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            当前职位
                          </span>
                          {isEditingRow ? (
                            <div className="relative w-full lg:w-48" ref={dropdownRef}>
                              <button
                                type="button"
                                onClick={() =>
                                  !isSelfRow && setIsRoleDropdownOpen(!isRoleDropdownOpen)
                                }
                                disabled={isSelfRow}
                                title={isSelfRow ? '不能修改自己的职位/等级' : undefined}
                                className={`flex w-full items-center justify-between gap-2 rounded border border-blue-500 bg-[#18191c] px-3 py-1.5 text-left text-sm text-white ${
                                  isSelfRow ? 'cursor-not-allowed opacity-60' : ''
                                }`}
                              >
                                <span className="truncate">
                                  {(editRole ? ROLE_LABELS[editRole] : undefined) ||
                                    roles.find((role) => role.name === editRole)?.display_name ||
                                    editRole ||
                                    '选择职位...'}
                                </span>
                                <span className="text-xs text-gray-500">▼</span>
                              </button>
                              {isSelfRow && (
                                <p className="mt-1 text-[10px] text-yellow-500/80">
                                  不能修改自己的职位/等级（可改靓号）
                                </p>
                              )}

                              {isRoleDropdownOpen && !isSelfRow && (
                                <div className="absolute right-0 top-full z-50 mt-1 flex w-64 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded border border-gray-600 bg-[#222] shadow-2xl lg:left-0 lg:right-auto">
                                  <div className="border-b border-gray-700 p-2">
                                    <input
                                      type="text"
                                      value={roleSearch}
                                      onChange={(event) => setRoleSearch(event.target.value)}
                                      placeholder="搜索职位..."
                                      aria-label="搜索职位"
                                      className="w-full rounded border border-gray-600 bg-[#111] p-1.5 text-xs text-white focus:outline-none"
                                      autoFocus
                                    />
                                  </div>
                                  <div className="max-h-60 overflow-y-auto">
                                    {filteredRoles.length === 0 ? (
                                      <p className="py-2 text-center text-xs text-gray-500">
                                        无匹配职位 (请检查 Supabase 数据库)
                                      </p>
                                    ) : (
                                      filteredRoles.map((role) => (
                                        <div
                                          key={role.name}
                                          onClick={() => {
                                            setEditRole(role.name);
                                            // role_level 直接取 roles.level，保证 role 与 role_level 一致
                                            setEditLevel(levelOf(role.level));
                                            setIsRoleDropdownOpen(false);
                                          }}
                                          className={`cursor-pointer px-3 py-2 text-sm transition hover:bg-blue-600 hover:text-white ${
                                            editRole === role.name
                                              ? 'bg-[#333] font-bold text-blue-400'
                                              : 'text-gray-300'
                                          }`}
                                        >
                                          <div className="flex justify-between">
                                            <span>{ROLE_LABELS[role.name] || role.display_name}</span>
                                            <span className="text-xs opacity-50">
                                              Lv.{levelOf(role.level)}
                                            </span>
                                          </div>
                                          <span className="text-[10px] opacity-40">
                                            {role.department}
                                          </span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span
                              className={`inline-flex items-center rounded border px-2 py-1 text-xs ${
                                rowLevel >= ROLE_LEVEL.SENIOR_MANAGER
                                  ? 'border-red-700 bg-red-900/30 text-red-500'
                                  : rowLevel >= ROLE_LEVEL.MANAGER
                                    ? 'border-purple-700 bg-purple-900/30 text-purple-400'
                                    : rowLevel >= ROLE_LEVEL.STAFF
                                      ? 'border-yellow-700 bg-yellow-900/30 text-yellow-400'
                                      : rowLevel >= ROLE_LEVEL.MEMBER
                                        ? 'border-blue-700 bg-blue-900/30 text-blue-400'
                                        : 'border-gray-600 bg-gray-800 text-gray-400'
                              }`}
                            >
                              {labelForRole(user.role, rowLevel)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:justify-start">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            操作
                          </span>
                          {isEditingRow ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleSave(user)}
                                className="rounded bg-green-600 px-3 py-1 text-sm text-white transition hover:bg-green-500"
                              >
                                保存
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="text-sm text-gray-400 transition hover:text-white"
                              >
                                取消
                              </button>
                            </div>
                          ) : canEditRow ? (
                            <button
                              type="button"
                              onClick={() => handleEditClick(user)}
                              className="text-sm font-bold text-blue-400 transition hover:text-blue-300"
                            >
                              编辑
                            </button>
                          ) : (
                            <span className="text-sm text-gray-600">不可操作</span>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </>
          )}

          {!listError && total > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-700 px-4 py-3 sm:flex-row">
              <p className="text-xs text-gray-500">
                共 {total} 人 · 第 {currentPage} / {totalPages} 页
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => gotoPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  上一页
                </button>
                {pageItems.map((item, index) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      onClick={() => gotoPage(item)}
                      aria-current={item === currentPage ? 'page' : undefined}
                      className={`min-w-8 rounded border px-2 py-1.5 text-xs transition ${
                        item === currentPage
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
                  onClick={() => gotoPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
