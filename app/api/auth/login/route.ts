import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  errorBody,
  getLauncherProfile,
  issueLauncherToken,
} from '@/lib/launcher-auth';
import { launcherJwtConfigured } from '@/lib/launcher-jwt';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 启动器原生登录：POST /api/auth/login
 * body: { username | email, password, client?: 'rctmp-launcher' }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!launcherJwtConfigured()) {
    return NextResponse.json(errorBody('server_not_configured', '启动器登录暂未开放'), {
      status: 503,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorBody('invalid_request', '请求格式错误'), { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json(errorBody('invalid_request', '请求格式错误'), { status: 400 });
  }

  const email =
    typeof body.email === 'string'
      ? body.email.trim()
      : typeof body.username === 'string'
        ? body.username.trim()
        : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json(errorBody('invalid_request', '请输入账号和密码'), { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json(errorBody('server_not_configured', '服务端未配置'), { status: 500 });
  }

  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json(errorBody('invalid_credentials', '用户名或密码错误'), {
      status: 401,
    });
  }

  const profile = await getLauncherProfile(data.user.id);
  if (!profile) {
    return NextResponse.json(errorBody('user_not_found', '账号资料不存在'), { status: 401 });
  }
  if (profile.banned) {
    return NextResponse.json(errorBody('banned', '该账号已被封禁'), { status: 403 });
  }

  try {
    const token = await issueLauncherToken(profile);
    return NextResponse.json({
      ...token,
      refreshToken: data.session?.refresh_token ?? null,
    });
  } catch {
    return NextResponse.json(errorBody('token_failed', '登录令牌签发失败'), { status: 500 });
  }
}
