import { NextResponse } from 'next/server';
import { getLauncherJwks } from '@/lib/launcher-jwt';

export const runtime = 'nodejs';

/** GET /api/auth/jwks — 启动器 JWT 公钥（RS256），供游戏服离线验签。 */
export async function GET(): Promise<NextResponse> {
  const jwks = getLauncherJwks();
  if (!jwks) {
    return NextResponse.json({ error: 'jwks_not_configured' }, { status: 503 });
  }
  return NextResponse.json(jwks, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
