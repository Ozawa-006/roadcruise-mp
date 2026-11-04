/** 启动器账号：读取用户资料/封禁状态并签发 JWT。 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  launcherJwtConfigured,
  signLauncherToken,
  type LauncherJwtUser,
} from '@/lib/launcher-jwt';

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface LauncherProfile {
  id: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
  banned: boolean;
  steamVerified: boolean;
}

/** 检查用户是否有生效中的封禁（action 含 ban）。 */
async function isUserBanned(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('moderation_actions')
    .select('action, expires_at, revoked_at')
    .eq('user_id', userId)
    .is('revoked_at', null);

  const now = Date.now();
  return (data ?? []).some((action) => {
    const name = typeof action.action === 'string' ? action.action.toLowerCase() : '';
    if (!name.includes('ban')) return false;
    if (!action.expires_at) return true;
    const expires = new Date(action.expires_at as string).getTime();
    return Number.isFinite(expires) && expires > now;
  });
}

export async function getLauncherProfile(userId: string): Promise<LauncherProfile | null> {
  const supabase = serviceClient();
  if (!supabase) return null;

  const [{ data: profile }, banned] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url, steam_verified')
      .eq('id', userId)
      .maybeSingle(),
    isUserBanned(supabase, userId),
  ]);

  if (!profile) return null;

  const displayName =
    typeof profile.display_name === 'string' && profile.display_name.trim()
      ? profile.display_name.trim()
      : 'Driver';

  return {
    id: userId,
    name: displayName,
    displayName,
    avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
    banned,
    steamVerified: profile.steam_verified === true,
  };
}

export interface LauncherTokenResult {
  accessToken: string;
  expiresIn: number;
  expiresAt: number;
  user: {
    id: string;
    name: string;
    displayName: string;
    avatarUrl: string | null;
    banned: boolean;
  };
}

export async function issueLauncherToken(
  profile: LauncherProfile
): Promise<LauncherTokenResult> {
  if (!launcherJwtConfigured()) {
    throw new Error('launcher_jwt_not_configured');
  }

  const user: LauncherJwtUser = {
    id: profile.id,
    name: profile.name,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    banned: profile.banned,
    steamVerified: profile.steamVerified,
  };
  const signed = await signLauncherToken(user);

  return {
    accessToken: signed.token,
    expiresIn: signed.expiresIn,
    expiresAt: signed.expiresAt,
    user: {
      id: profile.id,
      name: profile.name,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      banned: profile.banned,
    },
  };
}

export function errorBody(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}
