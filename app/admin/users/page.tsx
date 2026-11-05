// app/admin/users/page.tsx
'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTr } from '@/components/I18nProvider';
import {
  ROLE_LABELS,
  ROLE_LEVEL,
  canManageUsers,
  levelOf,
  roleColor,
  roleLabel,
  roleLabelEn,
} from '@/lib/permissions';

/** 静态 UI 文案：中文原文 -> 英文。英文缺失时 useTr 自动回退中文。 */
const EN: Record<string, string> = {
  // ---------- 加载 / 权限 / 错误 ----------
  '加载权限数据中...': 'Loading permission data...',
  '无法验证权限：{msg}': 'Cannot verify permissions: {msg}',
  '操作失败，请稍后重试': 'Action failed. Please try again later.',
  '🚫 权限不足：只有经理 (Lv.70) 及以上级别才能访问人员管理。':
    '🚫 Insufficient permissions: only managers (Lv.70) and above can access people management.',
  '加载失败': 'Failed to load',
  '重试': 'Retry',

  // ---------- 页面头部 ----------
  '👑 人员与职位管理': '👑 People & Role Management',
  '当前登录身份：': 'Signed in as: ',
  '返回控制台': 'Back to console',

  // ---------- 列表工具栏 ----------
  '👥 成员列表': '👥 Members',
  '共 {total} 人 · 第 {currentPage} / {totalPages} 页':
    '{total} members · Page {currentPage} / {totalPages}',
  '昵称 / 专属 ID / Steam ID': 'Nickname / Custom ID / Steam ID',
  '搜索成员': 'Search members',
  '按职位筛选': 'Filter by role',
  '全部职位': 'All roles',
  '{name}（Lv.{level}）': '{name} (Lv.{level})',
  '搜索': 'Search',
  '加载中...': 'Loading...',
  '刷新': 'Refresh',
  '清除筛选': 'Clear filters',
  '每页 {size} 条；数字关键词匹配专属 ID / Steam ID，文字匹配昵称。':
    'Up to {size} per page; numeric keywords match Custom ID / Steam ID, text matches nicknames.',
  '当前搜索：': 'Current search: ',

  // ---------- 空状态 ----------
  '没有符合当前筛选条件的成员': 'No members match the current filters',
  '暂无成员数据': 'No member data yet',

  // ---------- 表格 ----------
  '成员名称': 'Member',
  '原始 ID': 'Original ID',
  '专属靓号': 'Custom ID',
  '当前职位': 'Roles',
  '操作': 'Actions',
  '未命名': 'Unnamed',
  '未分配': 'Unassigned',
  '留空撤回': 'Leave blank to clear',

  // ---------- 编辑职位（多选，最多 MAX_ROLES 个） ----------
  '职位': 'Roles',
  '已选 {count}/{max}': 'Selected {count}/{max}',
  '最多选择 {max} 个职位，至少保留 1 个':
    'Select up to {max} roles; at least one is required.',
  '最多选择 {max} 个职位': 'You can select up to {max} roles.',
  '至少保留 1 个职位': 'At least one role is required.',
  '该职位等级不低于你，无法授予': 'You cannot grant a role at or above your level.',
  '不能修改自己的职位（可改靓号）':
    'You cannot change your own roles (the custom ID is still editable)',
  '搜索职位...': 'Search roles...',
  '搜索职位': 'Search roles',
  '无匹配职位 (请检查 Supabase 数据库)': 'No matching roles (check the Supabase database)',
  '保存中...': 'Saving...',
  '保存': 'Save',
  '取消': 'Cancel',
  '编辑': 'Edit',
  '不可操作': 'Not editable',

  // ---------- 分页 ----------
  '上一页': 'Previous',
  '下一页': 'Next',

  // ---------- 操作提示 / 确认框 ----------
  '靓号必须是 4-8 位数字': 'The custom ID must be 4-8 digits.',
  '❌ 至少保留 1 个职位': '❌ At least one role is required.',
  '❌ 一个账号最多只能拥有 4 个职位': '❌ An account can have at most 4 roles.',
  '❌ 职位列表未加载或该职位不存在，暂时无法修改职位，请刷新页面后重试。':
    '❌ The role list is not loaded or this role does not exist, so the role cannot be changed. Refresh the page and try again.',
  '❌ 权限不足：你不能修改同级或上级的职位！':
    '❌ Insufficient permissions: you cannot change the role of someone at your level or above.',
  '❌ 权限不足：你不能授予别人同级或更高的职位！':
    '❌ Insufficient permissions: you cannot grant a role at your level or above.',
  '⚠️ 你正在降级另一位开发者，确定继续吗？此操作可能影响社区最高管理权限。':
    '⚠️ You are about to demote another developer. Continue? This may affect the highest admin access in the community.',
  '保存失败: {msg}': 'Failed to save: {msg}',
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAGE_SIZE = 50;
// 页码窗口：当前页前后各 2 页，首尾页始终显示
const PAGE_WINDOW = 2;
// 一个用户最多拥有的职位数：与数据库 profile_roles 的 trg_profile_roles_max 保持一致
const MAX_ROLES = 4;

const ROLE_COLUMNS = 'name,display_name,level,color';

/** profiles.role / profiles.role_level 是「最高职位」，profile_roles 保存全部职位。 */
interface UserRole {
  role: string;
  level: number;
}

interface UserRow {
  id: string;
  display_name: string | null;
  random_id: string | null;
  custom_id: string | null;
  role: string | null;
  role_level: number;
  /** 全部职位（level 降序）；无 profile_roles 时回退为 profiles.role。 */
  roles: UserRole[];
}

interface RoleRow {
  name: string;
  display_name: string;
  level: number;
  color: string | null;
}

interface ProfileRoleRow {
  user_id: string;
  role: string;
  level: number;
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
    roles: [],
  };
}

function toUserRows(data: unknown): UserRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(toUserRow).filter((row): row is UserRow => row !== null);
}

/** profile_roles 查询结果（仅取展示需要的字段）。 */
function toProfileRoleRow(raw: unknown): ProfileRoleRow | null {
  if (!isRecord(raw)) return null;

  const userId = asText(raw.user_id);
  const role = asText(raw.role);
  if (!userId || !role) return null;

  return { user_id: userId, role, level: asLevel(raw.level) };
}

function toProfileRoleRows(data: unknown): ProfileRoleRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .map(toProfileRoleRow)
    .filter((row): row is ProfileRoleRow => row !== null);
}

/** 没有 profile_roles 记录时的回退：profiles.role 即最高职位。 */
function primaryRolesOf(user: UserRow): UserRole[] {
  return user.role ? [{ role: user.role, level: user.role_level }] : [];
}

/** 职位按等级降序；同等级按名称排序，保证展示顺序稳定。 */
function sortRolesDesc(items: UserRole[]): UserRole[] {
  return items
    .slice()
    .sort((left, right) => right.level - left.level || left.role.localeCompare(right.role));
}

function toRoleRow(raw: unknown): RoleRow | null {
  if (!isRecord(raw)) return null;

  const name = asText(raw.name);
  if (!name) return null;

  return {
    name,
    display_name: asText(raw.display_name) ?? name,
    level: asLevel(raw.level),
    color: asText(raw.color),
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
  const tr = useTr(EN);
  const locale = useLocale();

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
  // 多职位编辑：只保存职位名数组，等级一律由 roles.level 决定
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editCustomId, setEditCustomId] = useState('');
  const [saving, setSaving] = useState(false);

  const [roleSearch, setRoleSearch] = useState('');
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
          alert(tr('无法验证权限：{msg}', { msg: profileError.message }));
          router.push('/admin');
          return;
        }

        // 人员管理要求经理 (Lv.70) 及以上；判权只依据 role_level，不再用邮箱或 role 字符串提权
        const myLevel = levelOf(profile?.role_level);

        if (!canManageUsers(myLevel)) {
          alert(tr('🚫 权限不足：只有经理 (Lv.70) 及以上级别才能访问人员管理。'));
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
        alert(tr('无法验证权限：{msg}', { msg: tr(errorMessage(error)) }));
        router.push('/admin');
      }
    };

    void checkAuth();

    return () => {
      active = false;
    };
  }, [router]);

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

        // 第二次查询聚合全部职位：不依赖 PostgREST embed 的关系名，
        // 避免 profiles / profile_roles 的关系推断在环境间不一致。
        const rolesByUser = new Map<string, UserRole[]>();
        if (rows.length > 0) {
          const { data: roleData, error: roleError } = await supabase
            .from('profile_roles')
            .select('user_id,role,level')
            .in(
              'user_id',
              rows.map((row) => row.id)
            );

          if (cancelled) return;

          if (roleError) {
            // 多职位查询失败时降级为 profiles.role，至少保证列表可用
            console.error(
              '拉取用户职位失败，将回退到 profiles.role：',
              roleError.message
            );
          } else {
            for (const item of toProfileRoleRows(roleData)) {
              const list = rolesByUser.get(item.user_id) ?? [];
              list.push({ role: item.role, level: item.level });
              rolesByUser.set(item.user_id, list);
            }
          }
        }

        if (cancelled) return;

        const enrichedRows = rows.map((row) => {
          const profileRoles = rolesByUser.get(row.id);
          return {
            ...row,
            roles:
              profileRoles && profileRoles.length > 0
                ? sortRolesDesc(profileRoles)
                : primaryRolesOf(row),
          };
        });

        const nextTotal = typeof count === 'number' ? count : from + rows.length;
        setUsers(enrichedRows);
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
    // 回填当前全部职位；历史数据没有 profile_roles 时回退 profiles.role
    const currentRoles = user.roles.length > 0 ? user.roles.map((item) => item.role) : [];
    setEditRoles(currentRoles.length > 0 ? currentRoles : [user.role || 'member']);
    setEditCustomId(user.custom_id || '');
    setRoleSearch('');
  };

  /** 勾选/取消职位：最多 MAX_ROLES 个，至少保留 1 个。 */
  const toggleEditRole = (name: string) => {
    setEditRoles((previous) => {
      if (previous.includes(name)) {
        if (previous.length <= 1) return previous;
        return previous.filter((item) => item !== name);
      }
      if (previous.length >= MAX_ROLES) return previous;
      return [...previous, name];
    });
  };

  const handleSave = async (targetUser: UserRow) => {
    if (saving) return;

    // 0) 靓号格式校验：非空时必须是 4-8 位数字（与数据库 profiles_custom_id_format 约束一致）
    const trimmedCustomId = editCustomId.trim();
    if (trimmedCustomId !== '' && !/^[0-9]{4,8}$/.test(trimmedCustomId)) {
      alert(tr('靓号必须是 4-8 位数字'));
      return;
    }

    const myLevel = levelOf(currentUser?.role_level);
    const targetLevel = levelOf(targetUser.role_level);
    const isSelf = targetUser.id === currentUser?.id;
    // 开发者 (Lv.100) 可操作除自己以外的所有人
    const isDeveloper = myLevel >= ROLE_LEVEL.DEVELOPER;
    const nextCustomId = trimmedCustomId === '' ? null : trimmedCustomId;
    const customIdChanged = (targetUser.custom_id ?? null) !== nextCustomId;

    setSaving(true);

    try {
      // 1) 自己的记录只允许改靓号：职位始终不写，避免误操作让自己失去管理权限。
      //    开发者权限转移请由另一位开发者操作。
      if (isSelf) {
        if (!customIdChanged) {
          setEditingId(null);
          return;
        }

        const { error } = await supabase
          .from('profiles')
          .update({ custom_id: nextCustomId })
          .eq('id', targetUser.id);

        if (error) {
          alert(tr('保存失败: {msg}', { msg: error.message }));
          return;
        }

        setEditingId(null);
        setReloadToken((value) => value + 1);
        return;
      }

      // 2) 至少 1 个、最多 4 个职位（数据库触发器同样会兜底拦截 > 4）
      if (editRoles.length === 0) {
        alert(tr('❌ 至少保留 1 个职位'));
        return;
      }
      if (editRoles.length > MAX_ROLES) {
        alert(tr('❌ 一个账号最多只能拥有 4 个职位'));
        return;
      }

      // 3) 职位必须存在于 roles 表，等级以 roles.level 为准，禁止写入任意 role 字符串
      const roleDefs = editRoles
        .map((name) => roles.find((role) => role.name === name))
        .filter((role): role is RoleRow => role !== undefined);
      if (roleDefs.length !== editRoles.length) {
        alert(tr('❌ 职位列表未加载或该职位不存在，暂时无法修改职位，请刷新页面后重试。'));
        return;
      }
      const nextLevel = roleDefs.reduce(
        (max, role) => Math.max(max, levelOf(role.level)),
        0
      );

      // 4) 不能修改同级或上级；开发者除外
      if (!isDeveloper && targetLevel >= myLevel) {
        alert(tr('❌ 权限不足：你不能修改同级或上级的职位！'));
        return;
      }

      // 5) 不能授予同级或更高职位；开发者除外
      if (!isDeveloper && nextLevel >= myLevel) {
        alert(tr('❌ 权限不足：你不能授予别人同级或更高的职位！'));
        return;
      }

      // 6) 降级另一位开发者属于高危操作，要求二次确认
      if (targetLevel >= ROLE_LEVEL.DEVELOPER && nextLevel < targetLevel) {
        if (!confirm(tr('⚠️ 你正在降级另一位开发者，确定继续吗？此操作可能影响社区最高管理权限。'))) {
          return;
        }
      }

      // 7) 职位有变化时调用 RPC：由数据库写 profile_roles 并同步 profiles 的最高职位，
      //    不再直接 update profiles.role / role_level（避免 role 与 role_level 不一致）。
      const currentRoles = targetUser.roles.map((item) => item.role);
      const rolesChanged =
        currentRoles.length !== editRoles.length ||
        editRoles.some((name) => !currentRoles.includes(name));

      if (rolesChanged) {
        const { error } = await supabase.rpc('rct_set_user_roles', {
          p_user: targetUser.id,
          p_roles: editRoles,
        });

        if (error) {
          alert(tr('保存失败: {msg}', { msg: error.message }));
          return;
        }
      }

      // 8) 靓号单独更新，不触碰 role / role_level
      if (customIdChanged) {
        const { error } = await supabase
          .from('profiles')
          .update({ custom_id: nextCustomId })
          .eq('id', targetUser.id);

        if (error) {
          alert(tr('保存失败: {msg}', { msg: error.message }));
          // 职位已写入成功，刷新列表让界面与数据库保持一致
          setReloadToken((value) => value + 1);
          return;
        }
      }

      setEditingId(null);
      // 保存后刷新当前页（保持页码与筛选条件）
      setReloadToken((value) => value + 1);
    } catch (error) {
      alert(tr('保存失败: {msg}', { msg: tr(errorMessage(error)) }));
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#18191c] text-white">
        {tr('加载权限数据中...')}
      </div>
    );
  }

  const myLevel = levelOf(currentUser?.role_level);
  const isDeveloper = myLevel >= ROLE_LEVEL.DEVELOPER;

  // 展示用职位名：中文优先 ROLE_LABELS 标准名，其次 roles 表的 display_name，
  // 最后回退原始 role / 等级标签；英文统一用 roleLabelEn。
  const labelForRole = (role: string | null | undefined, level: number | null | undefined) => {
    if (locale === 'en') {
      return roleLabelEn(role, level === null || level === undefined ? 0 : levelOf(level));
    }
    return (
      (role ? ROLE_LABELS[role] : undefined) ||
      roles.find((item) => item.name === role)?.display_name ||
      roleLabel(role, level)
    );
  };

  // 编辑职位 / 职位筛选里的职位名（英文同样用 roleLabelEn）。
  const labelForRoleOption = (name: string, level: number) => {
    if (locale === 'en') return roleLabelEn(name, levelOf(level));
    return ROLE_LABELS[name] || roles.find((item) => item.name === name)?.display_name || name;
  };

  // 职位颜色：优先 roles.color（与 Discord 身份组一致），缺失时按标准角色/等级回退。
  const colorForRole = (name: string, level: number): string => {
    const roleDef = roles.find((item) => item.name === name);
    return roleDef?.color?.trim() || roleColor(name, level);
  };

  // 多选面板展示全部职位（按 level 降序）；等级不满足授予条件的职位禁用而不是隐藏。
  const roleSearchTerm = roleSearch.trim().toLowerCase();
  const filteredRoles = roles
    .filter(
      (role) =>
        roleSearchTerm === '' ||
        labelForRoleOption(role.name, role.level).toLowerCase().includes(roleSearchTerm) ||
        (ROLE_LABELS[role.name] || role.display_name || '').toLowerCase().includes(roleSearchTerm) ||
        role.name.toLowerCase().includes(roleSearchTerm)
    )
    .sort((left, right) => right.level - left.level || left.name.localeCompare(right.name));

  return (
    <main className="min-h-screen bg-[#18191c] p-4 font-sans text-gray-300 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{tr('👑 人员与职位管理')}</h1>
            <p className="mt-1 text-xs text-gray-500">
              {tr('当前登录身份：')}
              <span className="font-bold text-blue-400">{labelForRole(currentUser?.role, myLevel)}</span>
            </p>
          </div>
          <Link href="/admin" className="text-sm text-blue-400 transition hover:text-blue-300">
            {tr('返回控制台')}
          </Link>
        </div>

        <section
          ref={listTopRef}
          className="rounded-md border border-gray-700 bg-[#2c2d31] shadow-lg"
        >
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white">{tr('👥 成员列表')}</h2>
              <span className="text-xs text-gray-500">
                {tr('共 {total} 人 · 第 {currentPage} / {totalPages} 页', {
                  total,
                  currentPage,
                  totalPages,
                })}
              </span>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2 md:flex-row">
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={tr('昵称 / 专属 ID / Steam ID')}
                maxLength={64}
                aria-label={tr('搜索成员')}
                className="flex-1 rounded border border-gray-600 bg-[#18191c] p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
              <select
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value);
                  setPage(1);
                }}
                aria-label={tr('按职位筛选')}
                className="rounded border border-gray-600 bg-[#18191c] p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none md:w-48"
              >
                <option value="all">{tr('全部职位')}</option>
                {roles.map((role) => (
                  <option key={role.name} value={role.name}>
                    {tr('{name}（Lv.{level}）', {
                      name: labelForRoleOption(role.name, role.level),
                      level: levelOf(role.level),
                    })}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={listLoading}
                  className="rounded bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {listLoading ? tr('加载中...') : tr('搜索')}
                </button>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={listLoading}
                  className="rounded border border-gray-600 px-4 py-2.5 text-sm text-gray-300 transition hover:border-blue-500 hover:text-white disabled:opacity-50"
                >
                  {tr('刷新')}
                </button>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded border border-gray-600 px-4 py-2.5 text-sm text-gray-300 transition hover:border-blue-500 hover:text-white"
                  >
                    {tr('清除筛选')}
                  </button>
                )}
              </div>
            </form>

            <p className="text-xs text-gray-500">
              {tr('每页 {size} 条；数字关键词匹配专属 ID / Steam ID，文字匹配昵称。', {
                size: PAGE_SIZE,
              })}
              {query && (
                <>
                  {' '}
                  {tr('当前搜索：')}<span className="text-gray-300">“{query}”</span>
                </>
              )}
            </p>
          </div>

          {listError ? (
            <div className="border-t border-gray-700 p-6 text-center">
              <p className="text-sm font-bold text-red-400">{tr('加载失败')}</p>
              <p className="mt-1 break-all text-xs text-red-300/80">{tr(listError)}</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="mt-3 rounded bg-red-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-600"
              >
                {tr('重试')}
              </button>
            </div>
          ) : (
            <>
              <div className="hidden border-t border-gray-700 bg-[#232428] px-4 py-3 text-xs font-bold text-gray-400 lg:grid lg:grid-cols-[minmax(0,1.3fr)_8rem_10rem_minmax(0,1fr)_11rem] lg:gap-4">
                <span>{tr('成员名称')}</span>
                <span>{tr('原始 ID')}</span>
                <span>{tr('专属靓号')}</span>
                <span>{tr('当前职位')}</span>
                <span>{tr('操作')}</span>
              </div>

              <div className="divide-y divide-gray-700/60 border-t border-gray-700 lg:border-t-0">
                {listLoading ? (
                  <p className="px-4 py-10 text-center text-sm text-gray-500">{tr('加载中...')}</p>
                ) : users.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-sm text-gray-400">
                      {hasFilters ? tr('没有符合当前筛选条件的成员') : tr('暂无成员数据')}
                    </p>
                    {hasFilters && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="mt-3 text-xs font-bold text-blue-400 transition hover:text-blue-300"
                      >
                        {tr('清除筛选')}
                      </button>
                    )}
                  </div>
                ) : (
                  users.map((user) => {
                    const rowLevel = levelOf(user.role_level);
                    const isSelfRow = user.id === currentUser?.id;
                    const isEditingRow = editingId === user.id;
                    const canEditRow = isSelfRow || isDeveloper || myLevel > rowLevel;
                    // 主职位 = profiles.role（由触发器维护为最高职位）；数据不一致时取列表第一个
                    const primaryRoleName =
                      user.role && user.roles.some((item) => item.role === user.role)
                        ? user.role
                        : user.roles[0]?.role;

                    return (
                      <article
                        key={user.id}
                        className="grid grid-cols-1 gap-3 px-4 py-4 transition hover:bg-[#33343a]/60 lg:grid-cols-[minmax(0,1.3fr)_8rem_10rem_minmax(0,1fr)_11rem] lg:items-center lg:gap-4"
                      >
                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            {tr('成员名称')}
                          </span>
                          <span className="min-w-0 truncate font-bold text-white">
                            {user.display_name || tr('未命名')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            {tr('原始 ID')}
                          </span>
                          <span className="font-mono text-xs text-gray-500">
                            {user.random_id || '-'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            {tr('专属靓号')}
                          </span>
                          {isEditingRow ? (
                            <input
                              type="text"
                              value={editCustomId}
                              onChange={(event) =>
                                setEditCustomId(event.target.value.replace(/\D/g, ''))
                              }
                              maxLength={8}
                              aria-label={tr('专属靓号')}
                              className="w-24 rounded border border-blue-500 bg-[#18191c] px-2 py-1 text-sm text-white"
                              placeholder={tr('留空撤回')}
                            />
                          ) : user.custom_id ? (
                            <span className="rounded border border-blue-700/50 bg-blue-900/30 px-2 py-1 font-mono text-xs text-blue-400">
                              {user.custom_id}
                            </span>
                          ) : (
                            <span className="text-xs italic text-gray-600">{tr('未分配')}</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            {tr('当前职位')}
                          </span>
                          {isEditingRow && !isSelfRow ? (
                            <div className="w-full space-y-2 rounded border border-blue-500/60 bg-[#18191c] p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                                  {tr('职位')}
                                </span>
                                <span
                                  className={`font-mono text-[10px] ${
                                    editRoles.length >= MAX_ROLES
                                      ? 'text-yellow-400'
                                      : 'text-gray-400'
                                  }`}
                                >
                                  {tr('已选 {count}/{max}', {
                                    count: editRoles.length,
                                    max: MAX_ROLES,
                                  })}
                                </span>
                              </div>

                              <input
                                type="text"
                                value={roleSearch}
                                onChange={(event) => setRoleSearch(event.target.value)}
                                placeholder={tr('搜索职位...')}
                                aria-label={tr('搜索职位')}
                                className="w-full rounded border border-gray-600 bg-[#111] p-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                              />

                              <div className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
                                {filteredRoles.length === 0 ? (
                                  <p className="py-2 text-center text-xs text-gray-500">
                                    {tr('无匹配职位 (请检查 Supabase 数据库)')}
                                  </p>
                                ) : (
                                  filteredRoles.map((role) => {
                                    const roleLevel = levelOf(role.level);
                                    const selected = editRoles.includes(role.name);
                                    const grantable = isDeveloper || roleLevel < myLevel;
                                    const cannotUnselect = selected && editRoles.length <= 1;
                                    const cannotSelect =
                                      !selected &&
                                      (!grantable || editRoles.length >= MAX_ROLES);
                                    const disabled = cannotUnselect || cannotSelect;
                                    const dotColor = colorForRole(role.name, roleLevel);

                                    let hint: string | undefined;
                                    if (cannotUnselect) {
                                      hint = tr('至少保留 1 个职位');
                                    } else if (cannotSelect && !grantable) {
                                      hint = tr('该职位等级不低于你，无法授予');
                                    } else if (cannotSelect) {
                                      hint = tr('最多选择 {max} 个职位', { max: MAX_ROLES });
                                    }

                                    return (
                                      <label
                                        key={role.name}
                                        title={hint}
                                        className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition ${
                                          selected
                                            ? 'bg-blue-900/30 text-white'
                                            : 'text-gray-300'
                                        } ${
                                          disabled
                                            ? 'cursor-not-allowed opacity-50'
                                            : 'cursor-pointer hover:bg-[#2a2b2f]'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selected}
                                          disabled={disabled}
                                          onChange={() => toggleEditRole(role.name)}
                                          className="h-3.5 w-3.5 shrink-0 accent-blue-500"
                                        />
                                        <span
                                          className="h-2 w-2 shrink-0 rounded-full"
                                          style={{ backgroundColor: dotColor }}
                                        />
                                        <span className="min-w-0 flex-1 truncate">
                                          {labelForRoleOption(role.name, role.level)}
                                        </span>
                                        <span className="shrink-0 font-mono text-[10px] text-gray-500">
                                          Lv.{roleLevel}
                                        </span>
                                      </label>
                                    );
                                  })
                                )}
                              </div>

                              <p className="text-[10px] leading-relaxed text-gray-500">
                                {tr('最多选择 {max} 个职位，至少保留 1 个', {
                                  max: MAX_ROLES,
                                })}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex flex-wrap gap-1">
                                {user.roles.length > 0 ? (
                                  user.roles.map((item) => {
                                    const itemLevel = levelOf(item.level);
                                    const dotColor = colorForRole(item.role, itemLevel);
                                    const isPrimary = item.role === primaryRoleName;

                                    return (
                                      <span
                                        key={item.role}
                                        title={tr('{name}（Lv.{level}）', {
                                          name: labelForRole(item.role, itemLevel),
                                          level: itemLevel,
                                        })}
                                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                                          isPrimary ? 'bg-white/10 font-bold' : 'bg-white/5'
                                        }`}
                                        style={{ borderColor: dotColor, color: dotColor }}
                                      >
                                        <span
                                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                                          style={{ backgroundColor: dotColor }}
                                        />
                                        {labelForRole(item.role, itemLevel)}
                                      </span>
                                    );
                                  })
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
                              {isEditingRow && isSelfRow && (
                                <p className="text-[10px] text-yellow-500/80">
                                  {tr('不能修改自己的职位（可改靓号）')}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:justify-start">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
                            {tr('操作')}
                          </span>
                          {isEditingRow ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleSave(user)}
                                disabled={saving}
                                className="rounded bg-green-600 px-3 py-1 text-sm text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {saving ? tr('保存中...') : tr('保存')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                disabled={saving}
                                className="text-sm text-gray-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {tr('取消')}
                              </button>
                            </div>
                          ) : canEditRow ? (
                            <button
                              type="button"
                              onClick={() => handleEditClick(user)}
                              className="text-sm font-bold text-blue-400 transition hover:text-blue-300"
                            >
                              {tr('编辑')}
                            </button>
                          ) : (
                            <span className="text-sm text-gray-600">{tr('不可操作')}</span>
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
                {tr('共 {total} 人 · 第 {currentPage} / {totalPages} 页', {
                  total,
                  currentPage,
                  totalPages,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => gotoPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {tr('上一页')}
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
