import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { buildSteamLoginUrl } from '../../../../../lib/steam';
import {
  STEAM_STATE_COOKIE,
  STATE_TTL_SECONDS,
  cookieOptions,
  createStateToken,
} from '../../../../../lib/steam-token';
import { getAnonClient } from '../../../../../lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 发起 Steam OpenID 登录。
 *
 * - source=register：公开入口，注册前必须走这里（不需要登录）。
 * - source=settings：绑定 Steam，必须带 Authorization: Bearer <supabase access token>，
 *   服务端校验 token 后把 userId 写进签名的 state Cookie，回调时不再信任 URL 里的 userId。
 *
 * 返回：
 * - register：302 跳转 Steam
 * - settings：JSON { redirectUrl }，由前端用 window.location 跳转
 */
export async function GET(req: NextRequest) {
  const sourceRequested = req.nextUrl.searchParams.get('source');
  const source: 'register' | 'settings' = sourceRequested === 'settings' ? 'settings' : 'register';

  try {
    let userId: string | undefined;
    if (source === 'settings') {
      const token = readBearer(req);
      if (!token) {
        return NextResponse.json(
          { error: 'unauthorized', message: '登录状态已失效，请重新登录后再绑定 Steam。' },
          { status: 401, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const { data, error } = await getAnonClient().auth.getUser(token);
      if (error || !data.user) {
        return NextResponse.json(
          { error: 'unauthorized', message: '登录状态已失效，请重新登录后再绑定 Steam。' },
          { status: 401, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      userId = data.user.id;
    }

    const nonce = randomBytes(16).toString('hex');
    const origin = req.nextUrl.origin;
    const returnTo = `${origin}/api/auth/steam/callback?nonce=${encodeURIComponent(nonce)}`;
    const loginUrl = buildSteamLoginUrl({ returnTo, realm: origin });

    const stateToken = createStateToken(source, nonce, userId);

    if (source === 'settings') {
      const res = NextResponse.json(
        { redirectUrl: loginUrl },
        { headers: { 'Cache-Control': 'no-store' } }
      );
      res.cookies.set(STEAM_STATE_COOKIE, stateToken, cookieOptions(STATE_TTL_SECONDS));
      return res;
    }

    const res = NextResponse.redirect(loginUrl);
    res.cookies.set(STEAM_STATE_COOKIE, stateToken, cookieOptions(STATE_TTL_SECONDS));
    return res;
  } catch (error) {
    console.error('[steam/verify] 发起 Steam 验证失败:', error);
    return NextResponse.redirect(new URL('/login?error=steam_auth_failed', req.url));
  }
}

function readBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
