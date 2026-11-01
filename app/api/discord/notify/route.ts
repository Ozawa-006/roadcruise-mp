import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendDiscordWebhook } from '@/lib/discord-webhook';

export const runtime = 'nodejs';

const SITE_URL = (process.env.NEXTAUTH_URL ?? 'https://www.roadcruise-mp.com').replace(/\/+$/, '');

const ALLOWED_TYPES = ['announcement', 'event', 'recruitment', 'test'] as const;
type NotifyType = (typeof ALLOWED_TYPES)[number];

const TYPE_META: Record<NotifyType, { label: string; color: number }> = {
  announcement: { label: '网站公告', color: 0x3b82f6 },
  event: { label: '活动通知', color: 0xf97316 },
  recruitment: { label: '招募开放', color: 0x22c55e },
  test: { label: '连通性测试', color: 0x5865f2 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function safePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path;
}

/**
 * 工作人员推送 Discord 消息。
 * 需要 Authorization: Bearer <Supabase access token>，且 profiles.role_level >= 40。
 * body: { type, title, path?, description?, time? }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role_level, display_name')
    .eq('id', user.id)
    .maybeSingle();

  const roleLevel = typeof profile?.role_level === 'number' ? profile.role_level : 0;
  if (roleLevel < 40) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
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

  const type = ALLOWED_TYPES.includes(body.type as NotifyType)
    ? (body.type as NotifyType)
    : null;
  const title = asText(body.title, 200);
  if (!type || !title) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  const path = safePath(body.path);
  const description = asText(body.description, 800);
  const time = asText(body.time, 120);
  const meta = TYPE_META[type];

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  if (time) fields.push({ name: '时间 / Time', value: time, inline: false });
  fields.push({
    name: '发布人 / By',
    value: `${profile?.display_name ?? user.email ?? 'RCT MP'} (Lv.${roleLevel})`,
    inline: true,
  });

  const ok = await sendDiscordWebhook({
    username: 'RCT MP',
    embeds: [
      {
        title,
        url: path ? `${SITE_URL}${path}` : SITE_URL,
        description: description ?? undefined,
        color: meta.color,
        fields,
        footer: { text: `RCT MP · ${meta.label}` },
        timestamp: new Date().toISOString(),
      },
    ],
  });

  if (!ok) {
    return NextResponse.json({ ok: false, error: 'webhook_failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
