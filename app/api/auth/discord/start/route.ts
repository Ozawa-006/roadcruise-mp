import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getRequestAuth } from '@/lib/request-auth';
import { buildDiscordAuthorizeUrl, discordOAuthConfigured } from '@/lib/discord-oauth';

export const runtime = 'nodejs';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** POST /api/auth/discord/start — 生成 Discord OAuth 授权地址并保存一次性 state。 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!discordOAuthConfigured()) {
    return NextResponse.json({ ok: false, error: 'discord_not_configured' }, { status: 503 });
  }

  const auth = await getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 500 });
  }

  let nextPath = '/settings';
  try {
    const body = (await request.json()) as { nextPath?: unknown };
    if (typeof body.nextPath === 'string' && body.nextPath.startsWith('/')) {
      nextPath = body.nextPath;
    }
  } catch {
    /* 允许空 body */
  }

  const state = randomBytes(24).toString('hex');
  const { error } = await supabase.from('discord_oauth_states').insert({
    state,
    user_id: auth.user.id,
    next_path: nextPath,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: 'state_create_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: buildDiscordAuthorizeUrl(state) });
}
