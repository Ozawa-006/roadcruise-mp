import { NextRequest, NextResponse } from 'next/server';
import { getRequestAuth } from '@/lib/request-auth';
import {
  DISCORD_GUILD_ID,
  discordBotConfigured,
  discordOAuthConfigured,
} from '@/lib/discord-oauth';
import { DISCORD_INVITE_URL } from '@/lib/discord';

export const runtime = 'nodejs';

/** GET /api/discord/me — 当前账号的 Discord 绑定状态。 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { data: account } = await auth.supabase
    .from('discord_accounts')
    .select('discord_id, username, global_name, avatar_hash, guild_member, guild_roles, linked_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    oauthConfigured: discordOAuthConfigured(),
    botConfigured: discordBotConfigured(),
    guildId: DISCORD_GUILD_ID,
    inviteUrl: DISCORD_INVITE_URL,
    linked: Boolean(account),
    account: account ?? null,
  });
}
