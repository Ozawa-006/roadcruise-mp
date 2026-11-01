import { NextResponse } from 'next/server';
import { fetchDiscordInvite } from '@/lib/discord';

export const runtime = 'nodejs';
export const revalidate = 300;

/** 公开只读：返回 RCT MP Discord 邀请信息（成员数/在线数/图标）。 */
export async function GET(): Promise<NextResponse> {
  const invite = await fetchDiscordInvite();
  if (!invite) {
    return NextResponse.json(
      { ok: false, error: 'discord_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json(
    { ok: true, ...invite },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  );
}
