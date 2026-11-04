import { NextRequest, NextResponse } from 'next/server';
import { errorBody, getLauncherProfile } from '@/lib/launcher-auth';
import { verifyLauncherToken } from '@/lib/launcher-jwt';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * POST /api/game/verify — 游戏服实时校验启动器 token。
 * body: { token } 或 Authorization: Bearer <token>
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  let token = bearer;
  if (!token) {
    try {
      const body: unknown = await request.json();
      if (isRecord(body) && typeof body.token === 'string') token = body.token.trim();
    } catch {
      /* 允许空 body，交给下面的 401 */
    }
  }

  if (!token) {
    return NextResponse.json(errorBody('invalid_token', '缺少 token'), { status: 401 });
  }

  const claims = verifyLauncherToken(token);
  if (!claims) {
    return NextResponse.json(errorBody('invalid_token', 'token 无效或已过期'), { status: 401 });
  }

  const profile = await getLauncherProfile(claims.sub);
  if (!profile) {
    return NextResponse.json(errorBody('user_not_found', '账号资料不存在'), { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    userId: profile.id,
    name: profile.name,
    displayName: profile.displayName,
    banned: profile.banned,
    expiresAt: claims.exp,
  });
}
