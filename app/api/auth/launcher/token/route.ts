import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  errorBody,
  getLauncherProfile,
  issueLauncherToken,
} from '@/lib/launcher-auth';
import { launcherJwtConfigured } from '@/lib/launcher-jwt';

export const runtime = 'nodejs';

/** POST /api/auth/launcher/token — 用网站登录态换启动器 JWT（WebView2 回调用）。 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!launcherJwtConfigured()) {
    return NextResponse.json(errorBody('server_not_configured', '启动器登录暂未开放'), {
      status: 503,
    });
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json(errorBody('unauthorized', '未登录'), { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json(errorBody('server_not_configured', '服务端未配置'), { status: 500 });
  }

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json(errorBody('unauthorized', '登录态已失效'), { status: 401 });
  }

  const profile = await getLauncherProfile(user.id);
  if (!profile) {
    return NextResponse.json(errorBody('user_not_found', '账号资料不存在'), { status: 401 });
  }
  if (profile.banned) {
    return NextResponse.json(errorBody('banned', '该账号已被封禁'), { status: 403 });
  }

  try {
    const result = await issueLauncherToken(profile);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(errorBody('token_failed', '登录令牌签发失败'), { status: 500 });
  }
}
