import { NextRequest, NextResponse } from 'next/server';
import { errorBody, getLauncherProfile } from '@/lib/launcher-auth';
import { verifyLauncherToken } from '@/lib/launcher-jwt';

export const runtime = 'nodejs';

/** GET /api/auth/me — Bearer 启动器 JWT，返回当前用户与封禁状态。 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json(errorBody('unauthorized', '未登录'), { status: 401 });
  }

  const claims = verifyLauncherToken(token);
  if (!claims) {
    return NextResponse.json(errorBody('invalid_token', '登录已过期，请重新登录'), { status: 401 });
  }

  const profile = await getLauncherProfile(claims.sub);
  if (!profile) {
    return NextResponse.json(errorBody('user_not_found', '账号资料不存在'), { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: profile.id,
      name: profile.name,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      banned: profile.banned,
    },
    expiresAt: claims.exp,
  });
}
