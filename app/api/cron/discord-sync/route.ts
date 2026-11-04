import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncUserDiscordRoles } from '@/lib/discord-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return bearer === secret;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** 每 12 小时全量同步已绑定账号的 Discord 身份组（由 pg_cron 调用）。 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 500 });
  }

  const { data: accounts, error } = await supabase
    .from('discord_accounts')
    .select('user_id')
    .order('linked_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ ok: false, error: 'query_failed' }, { status: 500 });
  }

  const results = [];
  for (const account of accounts ?? []) {
    results.push(await syncUserDiscordRoles(account.user_id as string));
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    synced: results.filter((item) => item.ok).length,
    results,
  });
}
