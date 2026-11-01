import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestAuth } from '@/lib/request-auth';
import {
  discordBotConfigured,
  removeDiscordRole,
} from '@/lib/discord-oauth';

export const runtime = 'nodejs';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** POST /api/auth/discord/unlink — 解除当前账号的 Discord 绑定（尽力移除已映射身份组）。 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 500 });
  }

  const { data: account } = await supabase
    .from('discord_accounts')
    .select('discord_id, guild_roles')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (account && discordBotConfigured()) {
    const { data: mappings } = await supabase
      .from('discord_role_mappings')
      .select('discord_role_id');
    const mapped = new Set((mappings ?? []).map((item) => item.discord_role_id));
    const roles: string[] = Array.isArray(account.guild_roles) ? account.guild_roles : [];
    for (const roleId of roles) {
      if (!mapped.has(roleId)) continue;
      try {
        await removeDiscordRole(account.discord_id, roleId);
      } catch {
        /* 忽略单个角色失败 */
      }
    }
  }

  const { error } = await supabase
    .from('discord_accounts')
    .delete()
    .eq('user_id', auth.user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: 'unlink_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
