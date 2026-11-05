import { createClient } from '@supabase/supabase-js';
import {
  addDiscordRole,
  fetchDiscordGuildMember,
  removeDiscordRole,
} from '@/lib/discord-oauth';

export interface DiscordSyncResult {
  ok: boolean;
  userId: string;
  assigned: string[];
  removed: string[];
  error?: string;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase_service_not_configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * 按 discord_role_mappings 把站点角色同步为 Discord 身份组。
 * - 分配当前站点角色对应的 Discord 角色
 * - 移除其它已映射角色（不碰未映射的手动角色）
 */
export async function syncUserDiscordRoles(userId: string): Promise<DiscordSyncResult> {
  const result: DiscordSyncResult = { ok: false, userId, assigned: [], removed: [] };

  try {
    const supabase = serviceClient();

    const [
      { data: account },
      { data: profile },
      { data: mappings },
      { data: setting },
      { data: profileRoles },
    ] = await Promise.all([
      supabase
        .from('discord_accounts')
        .select('user_id, discord_id, guild_member, guild_roles')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase.from('profiles').select('id, role, role_level').eq('id', userId).maybeSingle(),
      supabase.from('discord_role_mappings').select('site_role, discord_role_id, enabled'),
      supabase.from('discord_settings').select('value').eq('key', 'verified_role_id').maybeSingle(),
      supabase.from('profile_roles').select('role').eq('user_id', userId),
    ]);

    if (!account?.discord_id) {
      return { ...result, error: 'discord_not_linked' };
    }
    if (!profile) {
      return { ...result, error: 'profile_not_found' };
    }

    const member = await fetchDiscordGuildMember(account.discord_id);
    if (!member) {
      await supabase
        .from('discord_accounts')
        .update({ guild_member: false, guild_roles: [] })
        .eq('user_id', userId);
      return { ...result, error: 'not_guild_member' };
    }

    const currentRoles = new Set(member.roles);
    const enabledMappings = (mappings ?? []).filter((item) => item.enabled);
    const mappedRoleIds = new Set(enabledMappings.map((item) => item.discord_role_id));

    const siteRoles = new Set<string>(
      (profileRoles ?? [])
        .map((item) => item.role as string)
        .filter((role): role is string => Boolean(role))
    );
    if (siteRoles.size === 0 && profile.role) {
      siteRoles.add(profile.role);
    }

    const targetRoleIds = new Set<string>();
    for (const mapping of enabledMappings) {
      if (siteRoles.has(mapping.site_role)) {
        targetRoleIds.add(mapping.discord_role_id);
      }
    }

    // 已验证身份组（绑定后自动分配）
    const verifiedRoleId = setting?.value?.trim();
    if (verifiedRoleId && !currentRoles.has(verifiedRoleId)) {
      try {
        await addDiscordRole(account.discord_id, verifiedRoleId);
        currentRoles.add(verifiedRoleId);
        result.assigned.push(verifiedRoleId);
      } catch {
        /* 验证角色分配失败不阻塞站点角色同步 */
      }
    }

    // 分配全部目标角色（多职位）
    for (const roleId of targetRoleIds) {
      if (currentRoles.has(roleId)) continue;
      try {
        await addDiscordRole(account.discord_id, roleId);
        currentRoles.add(roleId);
        result.assigned.push(roleId);
      } catch (error) {
        return {
          ...result,
          error: error instanceof Error ? error.message : 'assign_failed',
        };
      }
    }

    // 移除其它已映射但不是当前站点的角色
    for (const roleId of Array.from(currentRoles)) {
      if (!mappedRoleIds.has(roleId)) continue;
      if (targetRoleIds.has(roleId)) continue;
      try {
        await removeDiscordRole(account.discord_id, roleId);
        currentRoles.delete(roleId);
        result.removed.push(roleId);
      } catch {
        /* 单个角色移除失败不阻塞其它 */
      }
    }

    await supabase
      .from('discord_accounts')
      .update({
        guild_member: true,
        guild_roles: Array.from(currentRoles),
      })
      .eq('user_id', userId);

    return { ...result, ok: true };
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}
