import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  discordOAuthConfigured,
  exchangeDiscordCode,
  fetchDiscordMemberForUser,
  fetchDiscordUser,
} from '@/lib/discord-oauth';
import { syncUserDiscordRoles } from '@/lib/discord-sync';

export const runtime = 'nodejs';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function siteUrl(): string {
  return (process.env.NEXTAUTH_URL ?? 'https://www.roadcruise-mp.com').replace(/\/+$/, '');
}

function redirectTo(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, siteUrl()));
}

/** GET /api/auth/discord/callback — Discord 授权回调，绑定 Discord 账号。 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!discordOAuthConfigured()) {
    return redirectTo('/settings?discord=not_configured');
  }

  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (error || !code || !state) {
    return redirectTo('/settings?discord=error');
  }

  const supabase = serviceClient();
  if (!supabase) return redirectTo('/settings?discord=error');

  const { data: stateRow } = await supabase
    .from('discord_oauth_states')
    .select('state, user_id, next_path, expires_at')
    .eq('state', state)
    .maybeSingle();

  if (!stateRow) return redirectTo('/settings?discord=invalid_state');

  await supabase.from('discord_oauth_states').delete().eq('state', state);

  const expiresAt = new Date(stateRow.expires_at as string).getTime();
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    return redirectTo('/settings?discord=state_expired');
  }

  try {
    const token = await exchangeDiscordCode(code);
    const user = await fetchDiscordUser(token.access_token);
    const member = await fetchDiscordMemberForUser(token.access_token);

    const { error: upsertError } = await supabase.from('discord_accounts').upsert(
      {
        user_id: stateRow.user_id,
        discord_id: user.id,
        username: user.username,
        global_name: user.global_name ?? null,
        avatar_hash: user.avatar ?? null,
        guild_member: Boolean(member),
        guild_roles: member?.roles ?? [],
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) {
      console.warn('[discord-oauth] upsert failed', upsertError.code);
      return redirectTo('/settings?discord=save_failed');
    }

    if (member) {
      // 绑定成功后按映射同步一次身份组（失败不影响绑定）
      try {
        await syncUserDiscordRoles(stateRow.user_id as string);
      } catch {
        /* 忽略同步失败 */
      }
    }

    const nextPath =
      typeof stateRow.next_path === 'string' && stateRow.next_path.startsWith('/')
        ? stateRow.next_path
        : '/settings';
    return redirectTo(`${nextPath}?discord=linked`);
  } catch (callbackError) {
    console.warn(
      '[discord-oauth] callback failed',
      callbackError instanceof Error ? callbackError.message : 'unknown'
    );
    return redirectTo('/settings?discord=error');
  }
}
