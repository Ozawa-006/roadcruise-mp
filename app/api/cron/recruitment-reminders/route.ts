import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 每日 Cron：检查实习期即将到期（3 天内）的招募申请，提醒管理层与本人。
 *
 * 安全：只接受 Vercel Cron 携带的 `Authorization: Bearer <CRON_SECRET>`。
 * 调用数据库 SECURITY DEFINER RPC，使用 service_role key，不暴露给浏览器。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET 未配置' }, { status: 500 });
  }

  const authorization = request.headers.get('authorization') ?? '';
  if (authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'Supabase 环境变量未配置' }, { status: 500 });
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/rct_recruitment_send_trainee_reminders`,
      {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: `提醒 RPC 失败（${response.status}）`, detail: text.slice(0, 500) },
        { status: 500 }
      );
    }

    const data = (await response.json().catch(() => null)) as { reminded?: number } | null;
    return NextResponse.json({ ok: true, reminded: data?.reminded ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
