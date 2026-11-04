// app/admin/discord/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTr } from '@/components/I18nProvider';
import type { Locale } from '@/lib/i18n';
import { canEditRules, levelOf, roleLabel, roleLabelEn } from '@/lib/permissions';

/**
 * Discord 集成管理页（Lv.90+）。
 *
 * - 所有读写都走 /api/discord/admin：页面只带 Supabase access_token，
 *   Bot token / client secret 永远不下发到浏览器；
 * - 权限只看 profiles.role_level（与接口侧 requireStaff(..., 90) 一致）；
 * - 静态文案统一 useTr(EN)，角色名 / Discord 用户名等动态内容保持原样。
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DISCORD_REDIRECT_URI = 'https://www.roadcruise-mp.com/api/auth/discord/callback';

/** 静态 UI 文案：中文原文 -> 英文；英文缺失时 useTr 自动回退中文。 */
const EN: Record<string, string> = {
  // ---------- 页面外壳 ----------
  '验证权限中...': 'Checking permissions...',
  '加载中...': 'Loading...',
  '加载失败': 'Failed to load',
  '重试': 'Retry',
  '无法读取权限信息。': 'Unable to read permission information.',
  '无权限访问': 'Access denied',
  'Discord 集成仅对高级社区经理 (Lv.90) 及以上级别开放。':
    'Discord integration is available to Senior Community Managers (Lv.90) and above only.',
  '💬 Discord 集成': '💬 Discord Integration',
  '绑定账号、身份组映射与身份组同步':
    'Linked accounts, role mappings, and role sync',
  '← 返回后台': '← Back to admin',

  // ---------- 连接状态 ----------
  '连接状态': 'Connection status',
  'OAuth 已配置': 'OAuth configured',
  'Bot 已配置': 'Bot configured',
  'Guild ID': 'Guild ID',
  '已配置': 'Configured',
  '未配置': 'Not configured',
  'Bot 错误：': 'Bot error: ',
  '配置说明': 'Setup instructions',
  'OAuth 或 Bot 未配置时，绑定与同步功能不可用。':
    'Account linking and sync are unavailable until OAuth and the bot are configured.',
  'Redirect URI': 'Redirect URI',
  '环境变量': 'Environment variables',
  'Bot 权限与设置': 'Bot permissions & settings',
  'Bot 需要「管理身份组」权限，且 Bot 的角色层级高于要分配的身份组；同时开启 Server Members Intent。':
    'The bot needs the "Manage Roles" permission and its role must sit above the roles it assigns; enable Server Members Intent as well.',

  // ---------- 批量创建身份组 ----------
  '批量创建身份组': 'Bulk create roles',
  'Discord 没有原生批量创建，此功能用 Bot API 按站点职位一键创建；已存在同名角色自动跳过。':
    'Discord has no native bulk role creation. This uses the Bot API to create roles from site positions in one go; roles with existing names are skipped automatically.',
  '待创建 {count} 个': '{count} to create',
  '单次最多创建 60 个，超出部分会被服务器忽略。':
    'Up to 60 roles per request; any extras are ignored by the server.',
  '所有站点职位都已在 Discord 中存在，无需创建。':
    'Every site role already exists on Discord. Nothing to create.',
  '全选': 'Select all',
  '全不选': 'Clear all',
  '已选 {selected} / {total}': '{selected} of {total} selected',
  '默认不勾选，请选择要创建的职位。':
    'Nothing is selected by default. Choose the positions you want to create.',
  '将创建 {count} 个身份组。': 'Will create {count} role(s).',
  '创建选中身份组': 'Create selected roles',
  '创建中...': 'Creating...',
  '确定要创建 {count} 个 Discord 身份组吗？此操作会调用 Discord Bot API。':
    'Create {count} Discord role(s)? This calls the Discord Bot API.',
  '创建 {created} 个、跳过 {skipped} 个、失败 {failed} 个':
    'Created {created}, skipped {skipped}, failed {failed}',
  '创建身份组失败：': 'Failed to create roles: ',
  'Bot 未配置，无法创建身份组。': 'The bot is not configured, so roles cannot be created.',

  // ---------- 验证设置 ----------
  '验证设置': 'Verification settings',
  '绑定 Discord 后自动给该身份组（类似 TruckersMP 的 Verified），解绑自动移除；频道权限需在 Discord 中把「已验证」角色设为可见。':
    'Members automatically get this role when they link Discord (like TruckersMP’s Verified) and lose it when they unlink. Channel permissions must make the “Verified” role visible in Discord.',
  '当前已验证角色': 'Current verified role',
  '未设置': 'Not set',
  '不设置': 'None',
  '未匹配到的身份组': 'role not in the list',
  '保存验证设置': 'Save verification settings',
  '验证设置已保存。': 'Verification settings saved.',
  '创建「已验证」角色': 'Create “Verified” role',
  '创建角色中...': 'Creating role...',
  '创建已验证角色失败：': 'Failed to create the verified role: ',
  '已验证角色已创建并保存。': 'Verified role created and saved.',
  '已验证角色已创建，但保存失败，请重新选择后保存。':
    'The verified role was created but could not be saved. Please select it and save again.',
  '没有找到「已验证」角色，可一键创建。':
    'No “Verified” role found. You can create one in a single click.',
  '有未保存的更改': 'Unsaved changes',

  // ---------- 身份组映射 ----------
  '身份组映射': 'Role mappings',
  '把站点角色映射到 Discord 身份组，同步时按映射分配或移除身份组。':
    'Map site roles to Discord roles; sync assigns or removes roles based on these mappings.',
  '{count} 条映射': '{count} mappings',
  '站点角色': 'Site role',
  'Discord 角色': 'Discord role',
  '启用': 'Enabled',
  '停用': 'Disabled',
  '操作': 'Actions',
  '保存': 'Save',
  '保存中...': 'Saving...',
  '删除': 'Delete',
  '删除中...': 'Deleting...',
  '还没有映射，请在下方新增一行。': 'No mappings yet. Add one below.',
  '新增映射': 'Add mapping',
  '选择站点角色': 'Select a site role',
  '选择 Discord 角色': 'Select a Discord role',
  '所有站点角色都已映射。': 'All site roles are already mapped.',
  '未读取到站点角色。': 'No site roles found.',
  'Bot 未配置，无法读取 Discord 角色。':
    'The bot is not configured, so Discord roles cannot be loaded.',
  '没有可用的 Discord 角色。': 'No Discord roles available.',
  '不在角色列表中': 'not in the role list',
  '无法读取身份组列表': 'role list unavailable',

  // ---------- 已绑定账号与同步 ----------
  '已绑定账号': 'Linked accounts',
  '同步会按当前映射更新这些成员的 Discord 身份组。':
    'Sync updates these members’ Discord roles according to the current mappings.',
  '同步全部': 'Sync all',
  '同步中...': 'Syncing...',
  '成功 {synced} / 总数 {total}': '{synced} succeeded / {total} total',
  '同步完成。': 'Sync complete.',
  '部分用户同步失败，请检查 Bot 权限与角色层级。':
    'Some users failed to sync. Check the bot permissions and role hierarchy.',
  '该用户身份组已同步。': 'Roles synced for this user.',
  '暂无已绑定账号。': 'No linked accounts yet.',
  '用户': 'User',
  'Discord 用户名': 'Discord username',
  '在服务器': 'In server',
  '绑定时间': 'Linked at',
  '是': 'Yes',
  '否': 'No',
  '同步': 'Sync',
  '未命名用户': 'Unnamed user',
  '未分配': 'Unassigned',

  // ---------- 操作反馈 / 错误 ----------
  '映射已保存。': 'Mapping saved.',
  '映射已删除。': 'Mapping removed.',
  '登录状态已失效，请重新登录。': 'Your session has expired. Please sign in again.',
  '网络请求失败，请稍后重试。': 'Network request failed. Please try again.',
  '请求参数无效。': 'Invalid request.',
  '服务端未配置 Supabase Service Role。':
    'The server is missing the Supabase service role configuration.',
  'Discord Bot 未配置（DISCORD_BOT_TOKEN）。':
    'The Discord bot is not configured (DISCORD_BOT_TOKEN).',
  '无权访问（需要 Lv.90 及以上）。': 'Access denied (Lv.90+ required).',
  '保存映射失败。': 'Failed to save the mapping.',
  '删除映射失败。': 'Failed to remove the mapping.',
  '未知操作。': 'Unknown action.',
  '服务端返回了无效数据。': 'The server returned invalid data.',
  '用户不在 Discord 服务器中。': 'The user is not a member of the Discord server.',
  '用户尚未绑定 Discord。': 'The user has not linked Discord.',
  '找不到站点资料。': 'Site profile not found.',
  '未知错误：{code}': 'Unknown error: {code}',
};

type Translate = (zh: string, vars?: Record<string, string | number>) => string;

/* ------------------------------ 接口类型 ------------------------------ */

interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
}

interface DiscordRoleMapping {
  site_role: string;
  discord_role_id: string;
  discord_role_name: string | null;
  enabled: boolean;
}

/** discord_settings 表的一行；value 为空表示「不设置」。 */
interface DiscordSetting {
  key: string;
  value: string | null;
}

/** 验证身份组的设置项 key（与接口 save_settings 保持一致）。 */
const VERIFIED_ROLE_SETTING_KEY = 'verified_role_id';

/** 一键创建时使用的 Discord 角色名。 */
const VERIFIED_ROLE_NAME = '已验证';

interface SiteRole {
  name: string;
  display_name: string | null;
  level: number;
}

interface AccountProfile {
  display_name: string | null;
  role: string | null;
  role_level: number | null;
}

interface DiscordAccount {
  user_id: string;
  discord_id: string;
  username: string;
  global_name: string | null;
  guild_member: boolean;
  guild_roles: string[];
  linked_at: string;
  profiles: AccountProfile | null;
}

interface DiscordAdminData {
  oauthConfigured: boolean;
  botConfigured: boolean;
  botError: string | null;
  guildId: string | null;
  roles: DiscordRole[];
  mappings: DiscordRoleMapping[];
  accounts: DiscordAccount[];
  siteRoles: SiteRole[];
  settings: DiscordSetting[];
}

type LoadResult = { ok: true; data: DiscordAdminData } | { ok: false; error: string };

interface PostResult {
  ok: boolean;
  error: string | null;
  total: number;
  synced: number;
  firstResultError: string | null;
}

interface CreatedDiscordRole {
  siteRole: string;
  name: string;
  roleId: string;
}

interface SkippedDiscordRole {
  siteRole: string;
  name: string;
  reason: string;
}

interface FailedDiscordRole {
  siteRole: string;
  name: string;
  error: string;
}

interface CreateRolesData {
  created: CreatedDiscordRole[];
  skipped: SkippedDiscordRole[];
  failed: FailedDiscordRole[];
}

type CreateRolesResult = { ok: true; data: CreateRolesData } | { ok: false; error: string };

type CreateRoleResult = { ok: true; roleId: string; name: string } | { ok: false; error: string };

interface CreateRolesOutcome {
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
}

type Notice = { tone: 'success' | 'error'; text: string };

type Phase = 'checking' | 'ready' | 'denied' | 'error';

/* --------------------------- 运行时数据收敛 --------------------------- */

/** 接口返回的是宽松 JSON，逐字段收敛，避免把脏数据带进渲染。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Array.isArray 会把 unknown 收窄成 any[]；先落成 unknown[]，后续 map 参数才是 unknown。 */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  const items: unknown[] = asArray(value);
  return items.filter((item): item is string => typeof item === 'string');
}

function readErrorCode(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return asString(payload.error);
}

function normalizeRole(raw: unknown): DiscordRole | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    color: asNumber(raw.color) ?? 0,
    position: asNumber(raw.position) ?? 0,
  };
}

function normalizeMapping(raw: unknown): DiscordRoleMapping | null {
  if (!isRecord(raw)) return null;
  const siteRole = asString(raw.site_role);
  const discordRoleId = asString(raw.discord_role_id);
  if (!siteRole || !discordRoleId) return null;
  return {
    site_role: siteRole,
    discord_role_id: discordRoleId,
    discord_role_name: asString(raw.discord_role_name),
    enabled: raw.enabled !== false,
  };
}

function normalizeSiteRole(raw: unknown): SiteRole | null {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name);
  if (!name) return null;
  return {
    name,
    display_name: asString(raw.display_name),
    level: asNumber(raw.level) ?? 0,
  };
}

/** discord_settings：key 必须非空；value 允许为空（= 不设置），空白字符串收敛成 null。 */
function normalizeSetting(raw: unknown): DiscordSetting | null {
  if (!isRecord(raw)) return null;
  const key = asString(raw.key);
  if (!key) return null;
  return { key, value: asString(raw.value) };
}

/** 从 settings 里取已验证身份组 ID；缺失或为空时返回空串。 */
function readVerifiedRoleId(settings: DiscordSetting[]): string {
  return settings.find((setting) => setting.key === VERIFIED_ROLE_SETTING_KEY)?.value ?? '';
}

/** Supabase 的嵌套关系可能返回对象或单元素数组，两种都接受。 */
function normalizeAccountProfile(raw: unknown): AccountProfile | null {
  const record: unknown = Array.isArray(raw) ? raw[0] : raw;
  if (!isRecord(record)) return null;
  return {
    display_name: asString(record.display_name),
    role: asString(record.role),
    role_level: asNumber(record.role_level),
  };
}

function normalizeAccount(raw: unknown): DiscordAccount | null {
  if (!isRecord(raw)) return null;
  const userId = asString(raw.user_id);
  const discordId = asString(raw.discord_id);
  const username = asString(raw.username);
  if (!userId || !discordId || !username) return null;
  return {
    user_id: userId,
    discord_id: discordId,
    username,
    global_name: asString(raw.global_name),
    guild_member: raw.guild_member === true,
    guild_roles: asStringArray(raw.guild_roles),
    linked_at: asString(raw.linked_at) ?? '',
    profiles: normalizeAccountProfile(raw.profiles),
  };
}

function normalizeAdminData(payload: unknown): DiscordAdminData | null {
  if (!isRecord(payload) || payload.ok !== true) return null;

  const roles = asArray(payload.roles)
    .map((raw) => normalizeRole(raw))
    .filter((role): role is DiscordRole => role !== null)
    // 高层级身份组排在前面，与 Discord 的角色顺序一致。
    .sort((left, right) => right.position - left.position);

  const mappings = asArray(payload.mappings)
    .map((raw) => normalizeMapping(raw))
    .filter((mapping): mapping is DiscordRoleMapping => mapping !== null);

  const accounts = asArray(payload.accounts)
    .map((raw) => normalizeAccount(raw))
    .filter((account): account is DiscordAccount => account !== null);

  const siteRoles = asArray(payload.siteRoles)
    .map((raw) => normalizeSiteRole(raw))
    .filter((role): role is SiteRole => role !== null);

  const settings = asArray(payload.settings)
    .map((raw) => normalizeSetting(raw))
    .filter((setting): setting is DiscordSetting => setting !== null);

  return {
    oauthConfigured: payload.oauthConfigured === true,
    botConfigured: payload.botConfigured === true,
    botError: asString(payload.botError),
    guildId: asString(payload.guildId),
    roles,
    mappings,
    accounts,
    siteRoles,
    settings,
  };
}

function normalizeCreatedRole(raw: unknown): CreatedDiscordRole | null {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name);
  const roleId = asString(raw.roleId);
  if (!name || !roleId) return null;
  return { siteRole: asString(raw.siteRole) ?? '', name, roleId };
}

function normalizeSkippedRole(raw: unknown): SkippedDiscordRole | null {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name);
  if (!name) return null;
  return {
    siteRole: asString(raw.siteRole) ?? '',
    name,
    reason: asString(raw.reason) ?? 'exists',
  };
}

function normalizeFailedRole(raw: unknown): FailedDiscordRole | null {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name);
  if (!name) return null;
  return {
    siteRole: asString(raw.siteRole) ?? '',
    name,
    error: asString(raw.error) ?? 'create_failed',
  };
}

function normalizeCreateRolesData(payload: unknown): CreateRolesData | null {
  if (!isRecord(payload) || payload.ok !== true) return null;
  return {
    created: asArray(payload.created)
      .map(normalizeCreatedRole)
      .filter((role): role is CreatedDiscordRole => role !== null),
    skipped: asArray(payload.skipped)
      .map(normalizeSkippedRole)
      .filter((role): role is SkippedDiscordRole => role !== null),
    failed: asArray(payload.failed)
      .map(normalizeFailedRole)
      .filter((role): role is FailedDiscordRole => role !== null),
  };
}

/** 同步接口的 results 里取第一条失败原因，用于单用户同步的提示。 */
function firstSyncError(raw: unknown): string | null {
  for (const item of asArray(raw)) {
    if (!isRecord(item)) continue;
    if (item.ok === true) continue;
    const error = asString(item.error);
    if (error) return error;
  }
  return null;
}

/* ------------------------------ 接口调用 ------------------------------ */

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function fetchAdminData(): Promise<LoadResult> {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: 'no_session' };

    const response = await fetch('/api/discord/admin', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, error: readErrorCode(payload) ?? `http_${response.status}` };
    }

    const data = normalizeAdminData(payload);
    if (!data) return { ok: false, error: 'invalid_response' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

async function postAdminAction(body: Record<string, unknown>): Promise<PostResult> {
  const failed = (error: string): PostResult => ({
    ok: false,
    error,
    total: 0,
    synced: 0,
    firstResultError: null,
  });

  try {
    const token = await getAccessToken();
    if (!token) return failed('no_session');

    const response = await fetch('/api/discord/admin', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return failed(readErrorCode(payload) ?? `http_${response.status}`);
    }
    if (!isRecord(payload) || payload.ok !== true) {
      return failed(readErrorCode(payload) ?? 'invalid_response');
    }

    return {
      ok: true,
      error: null,
      total: asNumber(payload.total) ?? 0,
      synced: asNumber(payload.synced) ?? 0,
      firstResultError: firstSyncError(payload.results),
    };
  } catch {
    return failed('network_error');
  }
}

async function postCreateRoles(siteRoles: string[]): Promise<CreateRolesResult> {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: 'no_session' };

    const response = await fetch('/api/discord/admin', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'create_roles', siteRoles }),
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, error: readErrorCode(payload) ?? `http_${response.status}` };
    }

    const data = normalizeCreateRolesData(payload);
    if (!data) return { ok: false, error: readErrorCode(payload) ?? 'invalid_response' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

/** create_role 只创建单个角色（用于「已验证」），返回新角色 ID。 */
async function postCreateRole(name: string): Promise<CreateRoleResult> {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: 'no_session' };

    const response = await fetch('/api/discord/admin', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'create_role', name }),
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, error: readErrorCode(payload) ?? `http_${response.status}` };
    }
    if (!isRecord(payload) || payload.ok !== true) {
      return { ok: false, error: readErrorCode(payload) ?? 'invalid_response' };
    }

    const roleId = asString(payload.roleId);
    if (!roleId) return { ok: false, error: 'invalid_response' };
    return { ok: true, roleId, name: asString(payload.name) ?? name };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

/* ------------------------------ 展示工具 ------------------------------ */

/** 接口错误码 -> 双语提示；未知错误保留原文，便于排查 Discord API 返回。 */
const ERROR_MESSAGES: Record<string, string> = {
  no_session: '登录状态已失效，请重新登录。',
  network_error: '网络请求失败，请稍后重试。',
  invalid_json: '请求参数无效。',
  invalid_body: '请求参数无效。',
  invalid_payload: '请求参数无效。',
  invalid_response: '服务端返回了无效数据。',
  supabase_not_configured: '服务端未配置 Supabase Service Role。',
  bot_not_configured: 'Discord Bot 未配置（DISCORD_BOT_TOKEN）。',
  forbidden: '无权访问（需要 Lv.90 及以上）。',
  save_failed: '保存映射失败。',
  delete_failed: '删除映射失败。',
  unknown_action: '未知操作。',
  discord_not_linked: '用户尚未绑定 Discord。',
  profile_not_found: '找不到站点资料。',
  not_guild_member: '用户不在 Discord 服务器中。',
};

function describeError(code: string | null, tr: Translate): string {
  if (!code) return tr('未知错误：{code}', { code: '—' });
  const message = ERROR_MESSAGES[code];
  if (message) return tr(message);
  return tr('未知错误：{code}', { code });
}

/** 站点角色展示：数据库 display_name + lib/permissions 的英文名。 */
function siteRoleDisplay(role: SiteRole): string {
  const display = role.display_name ?? role.name;
  const english = roleLabelEn(role.name, role.level);
  return display === english ? display : `${display} · ${english}`;
}

/** 与接口 create_roles 保持一致：优先 display_name，截断到 Discord 角色名 100 字符上限。 */
function createRoleName(role: SiteRole): string {
  return (role.display_name ?? role.name).slice(0, 100);
}

function formatLinkedAt(iso: string, locale: Locale): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN');
}

/* ------------------------------ 子组件 ------------------------------ */

function StatusCard({
  label,
  ok,
  okText,
  badText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
}) {
  return (
    <div className="rounded border border-gray-700 bg-[#232428] p-3">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-bold ${ok ? 'text-green-400' : 'text-red-400'}`}>
        <span aria-hidden="true">{ok ? '✓' : '✗'}</span> {ok ? okText : badText}
      </p>
    </div>
  );
}

function MappingRow({
  mapping,
  roles,
  siteRole,
  busy,
  tr,
  onSave,
  onDelete,
}: {
  mapping: DiscordRoleMapping;
  roles: DiscordRole[];
  siteRole: SiteRole | null;
  busy: string | null;
  tr: Translate;
  onSave: (siteRole: string, roleId: string, roleName: string | null, enabled: boolean) => void;
  onDelete: (siteRole: string) => void;
}) {
  const [roleId, setRoleId] = useState(mapping.discord_role_id);
  const [enabled, setEnabled] = useState(mapping.enabled);

  const saving = busy === `save:${mapping.site_role}`;
  const deleting = busy === `delete:${mapping.site_role}`;
  const disabled = busy !== null;
  const knownRole = roles.some((role) => role.id === roleId);
  const selectedRoleName = roles.find((role) => role.id === roleId)?.name ?? null;

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_5.5rem_9rem] lg:items-center lg:gap-4">
      <div className="min-w-0">
        {/* site_role 是映射主键：已有行只读展示，改站点角色请删除后按新角色新增。 */}
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
          {tr('站点角色')}
        </span>
        <p className="truncate text-sm font-medium text-white">
          {siteRole ? siteRoleDisplay(siteRole) : mapping.site_role}
        </p>
        {siteRole && <p className="text-xs text-gray-500">Lv.{siteRole.level}</p>}
      </div>

      <label className="block min-w-0">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
          {tr('Discord 角色')}
        </span>
        <select
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
          disabled={disabled || roles.length === 0}
          aria-label={tr('Discord 角色')}
          className="w-full rounded border border-gray-600 bg-[#18191c] p-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {!knownRole && (
            <option value={roleId}>
              {mapping.discord_role_name ?? mapping.discord_role_id} —{' '}
              {roles.length > 0 ? tr('不在角色列表中') : tr('无法读取身份组列表')}
            </option>
          )}
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              @{role.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
          {tr('启用')}
        </span>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={disabled}
            className="h-4 w-4 accent-blue-500 disabled:cursor-not-allowed"
          />
          <span className={`text-xs ${enabled ? 'text-green-400' : 'text-gray-500'}`}>
            {enabled ? tr('启用') : tr('停用')}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <button
          type="button"
          onClick={() =>
            onSave(mapping.site_role, roleId, selectedRoleName ?? mapping.discord_role_name, enabled)
          }
          disabled={disabled || !roleId}
          className="rounded bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? tr('保存中...') : tr('保存')}
        </button>
        <button
          type="button"
          onClick={() => onDelete(mapping.site_role)}
          disabled={disabled}
          className="rounded border border-red-700/60 bg-red-900/20 px-3 py-2 text-xs font-bold text-red-400 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? tr('删除中...') : tr('删除')}
        </button>
      </div>
    </div>
  );
}

function AccountRow({
  account,
  locale,
  busy,
  loading,
  botConfigured,
  tr,
  onSync,
}: {
  account: DiscordAccount;
  locale: Locale;
  busy: string | null;
  loading: boolean;
  botConfigured: boolean;
  tr: Translate;
  onSync: (userId: string) => void;
}) {
  const profile = account.profiles;
  const level = levelOf(profile?.role_level);
  const roleName = profile
    ? locale === 'en'
      ? roleLabelEn(profile.role, level)
      : roleLabel(profile.role, level)
    : tr('未分配');
  const displayName = profile?.display_name ?? tr('未命名用户');
  const syncing = busy === `sync:${account.user_id}`;
  const disabled = busy !== null || loading || !botConfigured;

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6rem_10rem_6rem] lg:items-center lg:gap-4">
      <div className="min-w-0">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
          {tr('用户')}
        </span>
        <p className="truncate text-sm font-medium text-white">{displayName}</p>
        <p className="truncate text-xs text-gray-500">
          {roleName}
          {profile ? ` · Lv.${level}` : ''}
        </p>
      </div>

      <div className="min-w-0">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
          {tr('Discord 用户名')}
        </span>
        <p className="truncate text-sm text-gray-200">@{account.username}</p>
        <p className="truncate font-mono text-xs text-gray-500">
          {account.global_name ?? account.discord_id}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
          {tr('在服务器')}
        </span>
        <span
          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${
            account.guild_member
              ? 'border-green-700/60 bg-green-900/20 text-green-400'
              : 'border-gray-600 bg-gray-800 text-gray-400'
          }`}
        >
          {account.guild_member ? tr('是') : tr('否')}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 lg:block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 lg:hidden">
          {tr('绑定时间')}
        </span>
        <time dateTime={account.linked_at || undefined} className="text-xs text-gray-400">
          {formatLinkedAt(account.linked_at, locale)}
        </time>
      </div>

      <div className="lg:text-right">
        <button
          type="button"
          onClick={() => onSync(account.user_id)}
          disabled={disabled}
          className="w-full rounded border border-blue-700/60 bg-blue-900/20 px-3 py-2 text-xs font-bold text-blue-300 transition hover:bg-blue-900/40 disabled:cursor-not-allowed disabled:opacity-40 lg:w-auto"
        >
          {syncing ? tr('同步中...') : tr('同步')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ 页面 ------------------------------ */

export default function AdminDiscordPage() {
  const tr = useTr(EN);
  const locale = useLocale();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [userLevel, setUserLevel] = useState(0);

  const [data, setData] = useState<DiscordAdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<{ total: number; synced: number } | null>(null);

  const [createSelection, setCreateSelection] = useState<string[]>([]);
  const [createOutcome, setCreateOutcome] = useState<CreateRolesOutcome | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [newSiteRole, setNewSiteRole] = useState('');
  const [newDiscordRoleId, setNewDiscordRoleId] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);

  // 验证设置：选择值先落成草稿，null 表示「跟随服务端」，避免异步加载覆盖用户选择。
  const [verifiedDraft, setVerifiedDraft] = useState<string | null>(null);
  const [verifiedBusy, setVerifiedBusy] = useState<'save' | 'create' | null>(null);
  const [verifiedNotice, setVerifiedNotice] = useState<Notice | null>(null);
  // 新建角色后、reload 完成前用它补上角色名，避免下拉里短暂出现「未匹配」。
  const [verifiedCreatedName, setVerifiedCreatedName] = useState<string | null>(null);

  // 1. 权限门禁：未登录 -> /login；低于 Lv.90 -> 页面内展示无权限卡片（不跳走、不弹窗）。
  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role_level')
        .eq('id', user.id)
        .maybeSingle();
      if (!active) return;

      if (error) {
        setAuthError(error.message);
        setPhase('error');
        return;
      }

      const level = levelOf(profile?.role_level);
      setUserLevel(level);
      setPhase(canEditRules(level) ? 'ready' : 'denied');
    };

    void checkAuth();
    return () => {
      active = false;
    };
  }, [router, authAttempt]);

  // 2. 权限通过后加载数据；保存 / 删除 / 同步后通过 reloadToken 重新拉取。
  useEffect(() => {
    if (phase !== 'ready') return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const result = await fetchAdminData();
      if (cancelled) return;

      if (!result.ok) {
        // 已有数据时只提示错误并保留旧数据，避免整页闪空。
        setLoadError(result.error);
        setLoading(false);
        return;
      }

      setData(result.data);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [phase, reloadToken]);

  const retryAuth = () => {
    setAuthError(null);
    setPhase('checking');
    setAuthAttempt((value) => value + 1);
  };

  const reload = () => {
    setReloadToken((value) => value + 1);
  };

  const saveMapping = async (
    siteRole: string,
    roleId: string,
    roleName: string | null,
    enabled: boolean,
    busyKey: string
  ): Promise<boolean> => {
    setBusy(busyKey);
    setNotice(null);

    const result = await postAdminAction({
      action: 'save_mapping',
      siteRole,
      discordRoleId: roleId,
      discordRoleName: roleName,
      enabled,
    });
    setBusy(null);

    if (!result.ok) {
      setNotice({ tone: 'error', text: describeError(result.error, tr) });
      return false;
    }

    setNotice({ tone: 'success', text: tr('映射已保存。') });
    reload();
    return true;
  };

  const deleteMapping = async (siteRole: string) => {
    setBusy(`delete:${siteRole}`);
    setNotice(null);

    const result = await postAdminAction({ action: 'delete_mapping', siteRole });
    setBusy(null);

    if (!result.ok) {
      setNotice({ tone: 'error', text: describeError(result.error, tr) });
      return;
    }

    setNotice({ tone: 'success', text: tr('映射已删除。') });
    reload();
  };

  const syncUser = async (userId: string) => {
    setBusy(`sync:${userId}`);
    setNotice(null);

    const result = await postAdminAction({ action: 'sync_user', userId });
    setBusy(null);

    if (!result.ok) {
      setNotice({ tone: 'error', text: describeError(result.error, tr) });
      return;
    }

    if (result.synced > 0) {
      setNotice({ tone: 'success', text: tr('该用户身份组已同步。') });
    } else {
      setNotice({ tone: 'error', text: describeError(result.firstResultError, tr) });
    }
    reload();
  };

  const handleSyncAll = async () => {
    setBusy('sync_all');
    setNotice(null);

    const result = await postAdminAction({ action: 'sync_all' });
    setBusy(null);

    if (!result.ok) {
      setSyncSummary(null);
      setNotice({ tone: 'error', text: describeError(result.error, tr) });
      return;
    }

    setSyncSummary({ total: result.total, synced: result.synced });
    if (result.synced === result.total) {
      setNotice({ tone: 'success', text: tr('同步完成。') });
    } else {
      setNotice({ tone: 'error', text: tr('部分用户同步失败，请检查 Bot 权限与角色层级。') });
    }
    reload();
  };

  const handleAddMapping = async () => {
    if (!data || !newSiteRole || !newDiscordRoleId) return;
    const roleName = data.roles.find((role) => role.id === newDiscordRoleId)?.name ?? null;
    const saved = await saveMapping(newSiteRole, newDiscordRoleId, roleName, newEnabled, 'save:new');
    if (saved) {
      setNewSiteRole('');
      setNewDiscordRoleId('');
      setNewEnabled(true);
    }
  };

  const saveVerifiedRole = async (roleId: string) => {
    setVerifiedBusy('save');
    setVerifiedNotice(null);

    const result = await postAdminAction({ action: 'save_settings', verifiedRoleId: roleId });
    setVerifiedBusy(null);

    if (!result.ok) {
      setVerifiedNotice({ tone: 'error', text: describeError(result.error, tr) });
      return;
    }

    setVerifiedDraft(roleId);
    setVerifiedNotice({ tone: 'success', text: tr('验证设置已保存。') });
    reload();
  };

  const createVerifiedRole = async () => {
    setVerifiedBusy('create');
    setVerifiedNotice(null);

    const created = await postCreateRole(VERIFIED_ROLE_NAME);
    if (!created.ok) {
      setVerifiedBusy(null);
      // create_role 的失败码可能是 Discord 原始报错，已知码才翻译，其余原样展示。
      const known = ERROR_MESSAGES[created.error];
      setVerifiedNotice({
        tone: 'error',
        text: tr('创建已验证角色失败：') + (known ? tr(known) : created.error),
      });
      return;
    }

    setVerifiedCreatedName(created.name);
    setVerifiedDraft(created.roleId);

    // 创建成功后直接落库，省掉用户再点一次保存；失败时保留草稿供手动保存。
    const saved = await postAdminAction({
      action: 'save_settings',
      verifiedRoleId: created.roleId,
    });
    setVerifiedBusy(null);

    if (!saved.ok) {
      setVerifiedNotice({
        tone: 'error',
        text: tr('已验证角色已创建，但保存失败，请重新选择后保存。'),
      });
      reload();
      return;
    }

    setVerifiedNotice({ tone: 'success', text: tr('已验证角色已创建并保存。') });
    reload();
  };

  if (phase === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#18191c] text-white">
        {tr('验证权限中...')}
      </div>
    );
  }

  if (phase === 'denied') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#18191c] p-6 font-sans text-gray-300">
        <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#2c2d31] p-8 text-center shadow-2xl">
          <div className="mb-3 text-4xl" aria-hidden="true">
            🚫
          </div>
          <h1 className="mb-2 text-xl font-bold text-white">{tr('无权限访问')}</h1>
          <p className="mb-6 text-sm text-gray-400">
            {tr('Discord 集成仅对高级社区经理 (Lv.90) 及以上级别开放。')}
          </p>
          <Link href="/admin" className="text-sm text-blue-400 transition hover:text-blue-300">
            {tr('← 返回后台')}
          </Link>
        </div>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#18191c] p-6 font-sans text-gray-300">
        <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#2c2d31] p-8 text-center shadow-2xl">
          <h1 className="mb-2 text-xl font-bold text-white">{tr('加载失败')}</h1>
          <p className="mb-2 text-sm text-gray-400">{tr('无法读取权限信息。')}</p>
          {authError && <p className="mb-6 break-all text-xs text-red-400">{authError}</p>}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={retryAuth}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              {tr('重试')}
            </button>
            <Link href="/admin" className="text-sm text-blue-400 transition hover:text-blue-300">
              {tr('← 返回后台')}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 验证设置：草稿优先，未编辑时跟随服务端返回值。
  const savedVerifiedRoleId = data ? readVerifiedRoleId(data.settings) : '';
  const verifiedRoleId = verifiedDraft ?? savedVerifiedRoleId;
  const verifiedRoleName = verifiedRoleId
    ? (data?.roles.find((role) => role.id === verifiedRoleId)?.name ??
      verifiedCreatedName ??
      tr('未匹配到的身份组'))
    : tr('未设置');
  const verifiedRoleExists = (data?.roles ?? []).some((role) => role.name === VERIFIED_ROLE_NAME);
  const verifiedDirty = verifiedRoleId !== savedVerifiedRoleId;

  const mappedSiteRoles = new Set((data?.mappings ?? []).map((mapping) => mapping.site_role));
  const availableSiteRoles = data
    ? data.siteRoles.filter((role) => !mappedSiteRoles.has(role.name))
    : [];

  // 批量创建：只列出 Discord 中尚不存在同名角色（按 display_name）的站点职位。
  const discordRoleNames = new Set((data?.roles ?? []).map((role) => role.name));
  const missingCreateRoles = (data?.siteRoles ?? []).filter(
    (role) => !discordRoleNames.has(createRoleName(role))
  );
  const missingCreateRoleNames = new Set(missingCreateRoles.map((role) => role.name));
  // reload 后已创建的角色会从待选列表消失，这里再过滤一次，避免勾选状态指向旧数据。
  const selectedCreateRoleNames = createSelection.filter((name) =>
    missingCreateRoleNames.has(name)
  );
  const allCreateRolesSelected =
    missingCreateRoles.length > 0 && selectedCreateRoleNames.length === missingCreateRoles.length;

  const toggleCreateRole = (name: string, checked: boolean) => {
    setCreateError(null);
    setCreateOutcome(null);
    setCreateSelection((current) => {
      if (checked) return current.includes(name) ? current : [...current, name];
      return current.filter((item) => item !== name);
    });
  };

  const toggleAllCreateRoles = (checked: boolean) => {
    setCreateError(null);
    setCreateOutcome(null);
    setCreateSelection(checked ? missingCreateRoles.map((role) => role.name) : []);
  };

  const handleCreateRoles = async () => {
    if (selectedCreateRoleNames.length === 0) return;
    const count = selectedCreateRoleNames.length;
    const confirmed = window.confirm(
      tr('确定要创建 {count} 个 Discord 身份组吗？此操作会调用 Discord Bot API。', { count })
    );
    if (!confirmed) return;

    setBusy('create_roles');
    setCreateError(null);
    setCreateOutcome(null);

    const result = await postCreateRoles(selectedCreateRoleNames);
    setBusy(null);

    if (!result.ok) {
      setCreateError(describeError(result.error, tr));
      return;
    }

    setCreateOutcome({
      created: result.data.created.length,
      skipped: result.data.skipped.length,
      failed: result.data.failed.length,
      errors: result.data.failed.map((item) => `${item.name}: ${item.error}`),
    });
    // 清空勾选并重新 GET，让新建的角色出现在映射下拉中。
    setCreateSelection([]);
    reload();
  };

  return (
    <main className="min-h-screen bg-[#18191c] p-4 font-sans text-gray-300 sm:p-6 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 border-b border-gray-700 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              {tr('💬 Discord 集成')}{' '}
              {locale === 'en' ? null : (
                <span className="text-lg font-normal text-gray-500 sm:text-xl">
                  / Discord Integration
                </span>
              )}
            </h1>
            <p className="mt-2 text-sm text-gray-500">{tr('绑定账号、身份组映射与身份组同步')}</p>
          </div>
          <Link href="/admin" className="text-sm text-blue-400 transition hover:text-blue-300">
            {tr('← 返回后台')}
          </Link>
        </header>

        {notice && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-lg border p-3 text-sm ${
              notice.tone === 'success'
                ? 'border-green-700/60 bg-green-900/20 text-green-400'
                : 'border-red-700/60 bg-red-900/20 text-red-400'
            }`}
          >
            {notice.text}
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-lg border border-red-700/60 bg-red-900/20 p-4 text-sm text-red-400 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="break-all">
              <span className="font-bold">
                {tr('加载失败')}
                {locale === 'en' ? ': ' : '：'}
              </span>
              {describeError(loadError, tr)}
            </p>
            <button
              type="button"
              onClick={reload}
              className="self-start rounded bg-red-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-600 sm:self-auto"
            >
              {tr('重试')}
            </button>
          </div>
        )}

        {!data ? (
          loadError ? null : (
            <div
              aria-busy="true"
              aria-live="polite"
              className="rounded-lg border border-gray-700 bg-[#2c2d31] p-8 text-center text-sm text-gray-500 shadow-lg"
            >
              {tr('加载中...')}
            </div>
          )
        ) : (
          <div className={`space-y-6 transition-opacity ${loading ? 'opacity-70' : ''}`}>
            {/* ------------------------- 连接状态 ------------------------- */}
            <section
              aria-labelledby="discord-status-heading"
              className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg sm:p-6"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2
                  id="discord-status-heading"
                  className="text-xs font-bold uppercase tracking-widest text-gray-500"
                >
                  {tr('连接状态')}
                </h2>
                <span className="text-xs text-gray-500">Lv.{userLevel}</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatusCard
                  label={tr('OAuth 已配置')}
                  ok={data.oauthConfigured}
                  okText={tr('已配置')}
                  badText={tr('未配置')}
                />
                <StatusCard
                  label={tr('Bot 已配置')}
                  ok={data.botConfigured}
                  okText={tr('已配置')}
                  badText={tr('未配置')}
                />
                <div className="rounded border border-gray-700 bg-[#232428] p-3">
                  <p className="text-[11px] text-gray-500">{tr('Guild ID')}</p>
                  <p className="mt-1 break-all font-mono text-sm text-white">{data.guildId ?? '—'}</p>
                </div>
              </div>

              {data.botError && (
                <p className="mt-3 break-all rounded border border-red-700/60 bg-red-900/20 p-3 text-xs text-red-300">
                  <span className="font-bold text-red-400">{tr('Bot 错误：')}</span>
                  {data.botError}
                </p>
              )}

              {(!data.oauthConfigured || !data.botConfigured) && (
                <div className="mt-4 rounded border border-orange-700/50 bg-orange-900/10 p-4">
                  <p className="text-xs font-bold text-orange-300">{tr('配置说明')}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {tr('OAuth 或 Bot 未配置时，绑定与同步功能不可用。')}
                  </p>
                  <dl className="mt-3 space-y-3 text-xs">
                    <div>
                      <dt className="text-gray-500">{tr('Redirect URI')}</dt>
                      <dd className="mt-0.5 break-all font-mono text-[11px] text-blue-300">
                        {DISCORD_REDIRECT_URI}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{tr('环境变量')}</dt>
                      <dd className="mt-0.5 break-all font-mono text-[11px] text-gray-300">
                        DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / DISCORD_BOT_TOKEN
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{tr('Bot 权限与设置')}</dt>
                      <dd className="mt-0.5 leading-relaxed text-gray-400">
                        {tr(
                          'Bot 需要「管理身份组」权限，且 Bot 的角色层级高于要分配的身份组；同时开启 Server Members Intent。'
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </section>

            {/* ------------------------- 批量创建身份组 ------------------------- */}
            <section
              aria-labelledby="discord-create-roles-heading"
              className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg sm:p-6"
            >
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2
                    id="discord-create-roles-heading"
                    className="text-lg font-bold text-white"
                  >
                    {tr('批量创建身份组')}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {tr(
                      'Discord 没有原生批量创建，此功能用 Bot API 按站点职位一键创建；已存在同名角色自动跳过。'
                    )}
                  </p>
                </div>
                <span className="text-xs text-gray-500">
                  {tr('待创建 {count} 个', { count: missingCreateRoles.length })}
                </span>
              </div>

              {createError && (
                <p
                  role="alert"
                  className="mb-3 break-all rounded border border-red-700/60 bg-red-900/20 p-3 text-xs text-red-400"
                >
                  <span className="font-bold">{tr('创建身份组失败：')}</span>
                  {createError}
                </p>
              )}

              {createOutcome && (
                <div
                  aria-live="polite"
                  className={`mb-3 rounded border p-3 text-xs ${
                    createOutcome.failed > 0
                      ? 'border-red-700/60 bg-red-900/20 text-red-400'
                      : createOutcome.created === 0
                        ? 'border-gray-600 bg-gray-800 text-gray-300'
                        : 'border-green-700/60 bg-green-900/20 text-green-400'
                  }`}
                >
                  <p className="font-bold">
                    {tr('创建 {created} 个、跳过 {skipped} 个、失败 {failed} 个', {
                      created: createOutcome.created,
                      skipped: createOutcome.skipped,
                      failed: createOutcome.failed,
                    })}
                  </p>
                  {createOutcome.errors.length > 0 && (
                    <ul className="mt-2 list-inside list-disc space-y-1 break-all text-red-300">
                      {createOutcome.errors.map((message, index) => (
                        <li key={`${index}:${message}`}>{message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {missingCreateRoles.length === 0 ? (
                <p className="rounded border border-gray-700/60 bg-[#232428] px-4 py-6 text-center text-sm text-gray-500">
                  {tr('所有站点职位都已在 Discord 中存在，无需创建。')}
                </p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                      <input
                        type="checkbox"
                        checked={allCreateRolesSelected}
                        onChange={(event) => toggleAllCreateRoles(event.target.checked)}
                        disabled={busy !== null || loading}
                        className="h-4 w-4 accent-blue-500 disabled:cursor-not-allowed"
                      />
                      {tr('全选')}
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleAllCreateRoles(false)}
                      disabled={busy !== null || loading || selectedCreateRoleNames.length === 0}
                      className="text-xs text-blue-400 transition hover:text-blue-300 disabled:cursor-not-allowed disabled:text-gray-600"
                    >
                      {tr('全不选')}
                    </button>
                    <span className="text-xs text-gray-500">
                      {tr('已选 {selected} / {total}', {
                        selected: selectedCreateRoleNames.length,
                        total: missingCreateRoles.length,
                      })}
                    </span>
                    <span className="text-xs text-gray-600 sm:ml-auto">
                      {tr('单次最多创建 60 个，超出部分会被服务器忽略。')}
                    </span>
                  </div>

                  <div className="max-h-80 overflow-y-auto rounded border border-gray-700/60 bg-[#232428]">
                    {missingCreateRoles.map((role) => {
                      const checked = selectedCreateRoleNames.includes(role.name);
                      return (
                        <label
                          key={role.name}
                          className="flex cursor-pointer items-center gap-3 border-b border-gray-700/40 px-3 py-2 last:border-b-0 hover:bg-[#2c2d31]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => toggleCreateRole(role.name, event.target.checked)}
                            disabled={busy !== null || loading}
                            className="h-4 w-4 shrink-0 accent-blue-500 disabled:cursor-not-allowed"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-white">
                              {createRoleName(role)}
                            </span>
                            <span className="block truncate text-xs text-gray-500">
                              {role.name} · Lv.{role.level}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p
                      className={`text-xs ${
                        data.botConfigured ? 'text-gray-500' : 'text-red-400'
                      }`}
                    >
                      {data.botConfigured
                        ? selectedCreateRoleNames.length === 0
                          ? tr('默认不勾选，请选择要创建的职位。')
                          : tr('将创建 {count} 个身份组。', {
                              count: selectedCreateRoleNames.length,
                            })
                        : tr('Bot 未配置，无法创建身份组。')}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCreateRoles();
                      }}
                      disabled={
                        busy !== null ||
                        loading ||
                        !data.botConfigured ||
                        selectedCreateRoleNames.length === 0
                      }
                      className="rounded bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === 'create_roles' ? tr('创建中...') : tr('创建选中身份组')}
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* ------------------------- 验证设置 ------------------------- */}
            <section
              aria-labelledby="discord-verified-heading"
              className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg sm:p-6"
            >
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="discord-verified-heading" className="text-lg font-bold text-white">
                    {tr('验证设置')}
                  </h2>
                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
                    {tr(
                      '绑定 Discord 后自动给该身份组（类似 TruckersMP 的 Verified），解绑自动移除；频道权限需在 Discord 中把「已验证」角色设为可见。'
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <span className="text-gray-500">{tr('当前已验证角色')}</span>
                  <span
                    className={`rounded border px-2 py-0.5 font-bold ${
                      verifiedRoleId
                        ? 'border-green-700/60 bg-green-900/20 text-green-400'
                        : 'border-gray-600 bg-gray-800 text-gray-400'
                    }`}
                  >
                    {verifiedRoleId ? `@${verifiedRoleName}` : tr('未设置')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="block min-w-0">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    {tr('Discord 角色')}
                  </span>
                  <select
                    value={verifiedRoleId}
                    onChange={(event) => {
                      setVerifiedDraft(event.target.value);
                      setVerifiedCreatedName(null);
                      setVerifiedNotice(null);
                    }}
                    disabled={verifiedBusy !== null || loading}
                    className="w-full rounded border border-gray-600 bg-[#18191c] p-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">{tr('不设置')}</option>
                    {verifiedRoleId !== '' &&
                      !data.roles.some((role) => role.id === verifiedRoleId) && (
                        <option value={verifiedRoleId}>{`@${verifiedRoleName}`}</option>
                      )}
                    {data.roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        @{role.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  {verifiedDirty && (
                    <span className="text-xs text-orange-300">{tr('有未保存的更改')}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void saveVerifiedRole(verifiedRoleId);
                    }}
                    disabled={verifiedBusy !== null || loading}
                    className="rounded bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {verifiedBusy === 'save' ? tr('保存中...') : tr('保存验证设置')}
                  </button>
                  {!verifiedRoleExists && (
                    <button
                      type="button"
                      onClick={() => {
                        void createVerifiedRole();
                      }}
                      disabled={verifiedBusy !== null || loading || !data.botConfigured}
                      title={
                        data.botConfigured
                          ? undefined
                          : tr('Discord Bot 未配置（DISCORD_BOT_TOKEN）。')
                      }
                      className="rounded border border-blue-700/60 bg-blue-900/20 px-4 py-2 text-xs font-bold text-blue-300 transition hover:bg-blue-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {verifiedBusy === 'create' ? tr('创建角色中...') : tr('创建「已验证」角色')}
                    </button>
                  )}
                </div>
              </div>

              {!verifiedRoleExists && (
                <p
                  className={`mt-2 text-xs ${data.botConfigured ? 'text-gray-500' : 'text-red-400'}`}
                >
                  {data.botConfigured
                    ? tr('没有找到「已验证」角色，可一键创建。')
                    : tr('Bot 未配置，无法创建身份组。')}
                </p>
              )}

              {verifiedNotice && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-3 break-all rounded border p-3 text-xs ${
                    verifiedNotice.tone === 'success'
                      ? 'border-green-700/60 bg-green-900/20 text-green-400'
                      : 'border-red-700/60 bg-red-900/20 text-red-400'
                  }`}
                >
                  {verifiedNotice.text}
                </p>
              )}
            </section>

            {/* ------------------------- 身份组映射 ------------------------- */}
            <section
              aria-labelledby="discord-mappings-heading"
              className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg sm:p-6"
            >
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="discord-mappings-heading" className="text-lg font-bold text-white">
                    {tr('身份组映射')}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {tr('把站点角色映射到 Discord 身份组，同步时按映射分配或移除身份组。')}
                  </p>
                </div>
                <span className="text-xs text-gray-500">
                  {tr('{count} 条映射', { count: data.mappings.length })}
                </span>
              </div>

              <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_5.5rem_9rem] gap-4 border-b border-gray-700 bg-[#232428] px-4 py-2 text-[11px] font-bold text-gray-500 lg:grid">
                <span>{tr('站点角色')}</span>
                <span>{tr('Discord 角色')}</span>
                <span>{tr('启用')}</span>
                <span className="text-right">{tr('操作')}</span>
              </div>

              {data.mappings.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-500">
                  {tr('还没有映射，请在下方新增一行。')}
                </p>
              ) : (
                <div className="divide-y divide-gray-700/60">
                  {data.mappings.map((mapping) => (
                    <MappingRow
                      key={`${mapping.site_role}:${mapping.discord_role_id}:${
                        mapping.enabled ? 'on' : 'off'
                      }`}
                      mapping={mapping}
                      roles={data.roles}
                      siteRole={
                        data.siteRoles.find((role) => role.name === mapping.site_role) ?? null
                      }
                      busy={busy}
                      tr={tr}
                      onSave={(siteRole, roleId, roleName, enabled) => {
                        void saveMapping(siteRole, roleId, roleName, enabled, `save:${siteRole}`);
                      }}
                      onDelete={(siteRole) => {
                        void deleteMapping(siteRole);
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 border-t border-gray-700 pt-4">
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-500">
                  {tr('新增映射')}
                </h3>

                {availableSiteRoles.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    {data.siteRoles.length === 0
                      ? tr('未读取到站点角色。')
                      : tr('所有站点角色都已映射。')}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_5.5rem_9rem] lg:items-end">
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {tr('站点角色')}
                      </span>
                      <select
                        value={newSiteRole}
                        onChange={(event) => setNewSiteRole(event.target.value)}
                        disabled={busy !== null}
                        className="w-full rounded border border-gray-600 bg-[#18191c] p-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">{tr('选择站点角色')}</option>
                        {availableSiteRoles.map((role) => (
                          <option key={role.name} value={role.name}>
                            {siteRoleDisplay(role)} (Lv.{role.level})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block min-w-0">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {tr('Discord 角色')}
                      </span>
                      <select
                        value={newDiscordRoleId}
                        onChange={(event) => setNewDiscordRoleId(event.target.value)}
                        disabled={busy !== null || data.roles.length === 0}
                        className="w-full rounded border border-gray-600 bg-[#18191c] p-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">{tr('选择 Discord 角色')}</option>
                        {data.roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            @{role.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div>
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {tr('启用')}
                      </span>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newEnabled}
                          onChange={(event) => setNewEnabled(event.target.checked)}
                          disabled={busy !== null}
                          className="h-4 w-4 accent-blue-500 disabled:cursor-not-allowed"
                        />
                        <span className={`text-xs ${newEnabled ? 'text-green-400' : 'text-gray-500'}`}>
                          {newEnabled ? tr('启用') : tr('停用')}
                        </span>
                      </label>
                    </div>

                    <div className="lg:text-right">
                      <button
                        type="button"
                        onClick={() => {
                          void handleAddMapping();
                        }}
                        disabled={busy !== null || !newSiteRole || !newDiscordRoleId}
                        className="w-full rounded bg-green-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
                      >
                        {busy === 'save:new' ? tr('保存中...') : tr('保存')}
                      </button>
                    </div>
                  </div>
                )}

                {data.roles.length === 0 && availableSiteRoles.length > 0 && (
                  <p className="mt-2 text-xs text-red-400">
                    {data.botConfigured
                      ? tr('没有可用的 Discord 角色。')
                      : tr('Bot 未配置，无法读取 Discord 角色。')}
                  </p>
                )}
              </div>
            </section>

            {/* ------------------------- 已绑定账号 ------------------------- */}
            <section
              aria-labelledby="discord-accounts-heading"
              className="rounded-lg border border-gray-700 bg-[#2c2d31] p-4 shadow-lg sm:p-6"
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="discord-accounts-heading" className="text-lg font-bold text-white">
                    {tr('已绑定账号')}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {tr('同步会按当前映射更新这些成员的 Discord 身份组。')}
                  </p>
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                  {syncSummary && (
                    <p
                      className={`text-xs font-bold ${
                        syncSummary.synced === syncSummary.total
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}
                    >
                      {tr('成功 {synced} / 总数 {total}', {
                        synced: syncSummary.synced,
                        total: syncSummary.total,
                      })}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void handleSyncAll();
                    }}
                    disabled={busy !== null || loading || !data.botConfigured}
                    title={
                      data.botConfigured ? undefined : tr('Discord Bot 未配置（DISCORD_BOT_TOKEN）。')
                    }
                    className="rounded bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'sync_all' ? tr('同步中...') : tr('同步全部')}
                  </button>
                </div>
              </div>

              {data.accounts.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-500">
                  {tr('暂无已绑定账号。')}
                </p>
              ) : (
                <>
                  <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6rem_10rem_6rem] gap-4 border-b border-gray-700 bg-[#232428] px-4 py-2 text-[11px] font-bold text-gray-500 lg:grid">
                    <span>{tr('用户')}</span>
                    <span>{tr('Discord 用户名')}</span>
                    <span>{tr('在服务器')}</span>
                    <span>{tr('绑定时间')}</span>
                    <span className="text-right">{tr('操作')}</span>
                  </div>
                  <div className="divide-y divide-gray-700/60">
                    {data.accounts.map((account) => (
                      <AccountRow
                        key={account.user_id}
                        account={account}
                        locale={locale}
                        busy={busy}
                        loading={loading}
                        botConfigured={data.botConfigured}
                        tr={tr}
                        onSync={(userId) => {
                          void syncUser(userId);
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
