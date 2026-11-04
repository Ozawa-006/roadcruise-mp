import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendDiscordWebhook } from '@/lib/discord-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = (process.env.NEXTAUTH_URL ?? 'https://www.roadcruise-mp.com')
  .replace(/\/+$/, '')
  .replace('https://roadcruise-mp.com', 'https://www.roadcruise-mp.com');

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

/** 活动开始前 1 小时推送到 Discord（由 pg_cron 每小时调用，已发送的去重）。 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 500 });
  }

  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, description, start_at, end_at, location, status, discord_reminder_sent_at')
    .eq('status', 'published')
    .gte('start_at', now.toISOString())
    .lte('start_at', inOneHour.toISOString())
    .is('discord_reminder_sent_at', null)
    .order('start_at', { ascending: true })
    .limit(10);

  if (error) {
    return NextResponse.json({ ok: false, error: 'query_failed' }, { status: 500 });
  }

  let sent = 0;
  for (const event of events ?? []) {
    const start = event.start_at ? new Date(event.start_at as string) : null;
    const timeText = start
      ? start.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
      : '时间待定';
    const description = [
      `⏰ 开始时间：${timeText}（北京时间）`,
      event.location ? `📍 地点：${event.location}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const ok = await sendDiscordWebhook({
      username: 'RCT MP',
      embeds: [
        {
          title: `活动 1 小时后开始：${event.title ?? '未命名活动'}`,
          url: `${SITE_URL}/events/${event.id}`,
          description,
          color: 0xf97316,
          footer: { text: 'RCT MP · 活动提醒' },
          timestamp: new Date().toISOString(),
        },
      ],
    });

    if (ok) {
      await supabase
        .from('events')
        .update({ discord_reminder_sent_at: new Date().toISOString() })
        .eq('id', event.id);
      sent += 1;
    }
  }

  return NextResponse.json({ ok: true, sent });
}

/** pg_net 用 POST 调用，Vercel Cron 用 GET；两者行为一致。 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
