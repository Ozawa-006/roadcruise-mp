import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/request-auth';
import {
  DISCORD_GUILD_ID,
  createDiscordRole,
  discordBotConfigured,
  discordOAuthConfigured,
  fetchDiscordGuildRoles,
} from '@/lib/discord-oauth';
import { syncUserDiscordRoles } from '@/lib/discord-sync';

export const runtime = 'nodejs';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** GET /api/discord/admin — Bot 状态、Discord 角色、映射与已绑定账号（Lv.90+）。 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireStaff(request, 90);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 500 });
  }

  let roles: Array<{ id: string; name: string; color: number; position: number }> = [];
  let botError: string | null = null;
  if (discordBotConfigured()) {
    try {
      roles = (await fetchDiscordGuildRoles()).map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
      }));
    } catch (error) {
      botError = error instanceof Error ? error.message : 'bot_error';
    }
  }

  const [{ data: mappings }, { data: accounts }, { data: siteRoles }, { data: settings }] =
    await Promise.all([
      supabase.from('discord_role_mappings').select('*').order('site_role'),
      supabase
        .from('discord_accounts')
        .select('user_id, discord_id, username, global_name, guild_member, guild_roles, linked_at, profiles:user_id (display_name, role, role_level)')
        .order('linked_at', { ascending: false })
        .limit(100),
      supabase.from('roles').select('name, display_name, level').order('level', { ascending: false }),
      supabase.from('discord_settings').select('key, value'),
    ]);

  return NextResponse.json({
    ok: true,
    oauthConfigured: discordOAuthConfigured(),
    botConfigured: discordBotConfigured(),
    botError,
    guildId: DISCORD_GUILD_ID,
    roles,
    mappings: mappings ?? [],
    accounts: accounts ?? [],
    siteRoles: siteRoles ?? [],
    settings: settings ?? [],
  });
}

/** POST /api/discord/admin — 保存映射 / 删除映射 / 同步身份组（Lv.90+）。 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireStaff(request, 90);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const action = body.action;

  if (action === 'save_mapping') {
    const siteRole = typeof body.siteRole === 'string' ? body.siteRole.trim() : '';
    const discordRoleId = typeof body.discordRoleId === 'string' ? body.discordRoleId.trim() : '';
    const discordRoleName =
      typeof body.discordRoleName === 'string' ? body.discordRoleName.trim() : null;
    const enabled = body.enabled !== false;
    if (!siteRole || !discordRoleId) {
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    }
    const { error } = await supabase.from('discord_role_mappings').upsert(
      {
        site_role: siteRole,
        discord_role_id: discordRoleId,
        discord_role_name: discordRoleName,
        enabled,
        updated_by: auth.user.id,
      },
      { onConflict: 'site_role' }
    );
    if (error) return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete_mapping') {
    const siteRole = typeof body.siteRole === 'string' ? body.siteRole.trim() : '';
    if (!siteRole) {
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    }
    const { error } = await supabase
      .from('discord_role_mappings')
      .delete()
      .eq('site_role', siteRole);
    if (error) return NextResponse.json({ ok: false, error: 'delete_failed' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'create_role') {
    if (!discordBotConfigured()) {
      return NextResponse.json({ ok: false, error: 'bot_not_configured' }, { status: 503 });
    }
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    if (!name) {
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    }
    try {
      const roleId = await createDiscordRole({ name });
      return NextResponse.json({ ok: true, roleId, name });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : 'create_failed' },
        { status: 502 }
      );
    }
  }

  if (action === 'save_settings') {
    const verifiedRoleId =
      typeof body.verifiedRoleId === 'string' ? body.verifiedRoleId.trim() : '';
    const { error } = await supabase.from('discord_settings').upsert(
      {
        key: 'verified_role_id',
        value: verifiedRoleId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
    if (error) return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'create_roles') {
    if (!discordBotConfigured()) {
      return NextResponse.json({ ok: false, error: 'bot_not_configured' }, { status: 503 });
    }

    const siteRoleNames = Array.isArray(body.siteRoles)
      ? body.siteRoles.filter((item): item is string => typeof item === 'string').slice(0, 60)
      : [];
    if (siteRoleNames.length === 0) {
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    }

    const [{ data: siteRoles }, existingRoles] = await Promise.all([
      supabase.from('roles').select('name, display_name').in('name', siteRoleNames),
      fetchDiscordGuildRoles(),
    ]);

    const existingNames = new Set(existingRoles.map((role) => role.name));
    const created: Array<{ siteRole: string; name: string; roleId: string }> = [];
    const skipped: Array<{ siteRole: string; name: string; reason: string }> = [];
    const failed: Array<{ siteRole: string; name: string; error: string }> = [];

    for (const row of siteRoles ?? []) {
      const siteRole = row.name as string;
      const name = ((row.display_name as string | null) ?? siteRole).slice(0, 100);
      if (existingNames.has(name)) {
        skipped.push({ siteRole, name, reason: 'exists' });
        continue;
      }
      try {
        const roleId = await createDiscordRole({ name });
        existingNames.add(name);
        created.push({ siteRole, name, roleId });
      } catch (error) {
        failed.push({
          siteRole,
          name,
          error: error instanceof Error ? error.message : 'create_failed',
        });
      }
    }

    return NextResponse.json({ ok: true, created, skipped, failed });
  }

  if (action === 'sync_all' || action === 'sync_user') {
    if (!discordBotConfigured()) {
      return NextResponse.json({ ok: false, error: 'bot_not_configured' }, { status: 503 });
    }

    let userIds: string[] = [];
    if (action === 'sync_user') {
      const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
      if (!userId) {
        return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
      }
      userIds = [userId];
    } else {
      const { data } = await supabase
        .from('discord_accounts')
        .select('user_id')
        .order('linked_at', { ascending: false })
        .limit(100);
      userIds = (data ?? []).map((row) => row.user_id as string);
    }

    const results = [];
    for (const userId of userIds) {
      results.push(await syncUserDiscordRoles(userId));
    }

    return NextResponse.json({
      ok: true,
      total: results.length,
      synced: results.filter((item) => item.ok).length,
      results,
    });
  }

  return NextResponse.json({ ok: false, error: 'unknown_action' }, { status: 400 });
}
