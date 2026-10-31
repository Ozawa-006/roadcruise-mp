import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source') || 'settings';
    const userId = searchParams.get('userId'); // 🌟 获取当前用户ID
    const origin = req.nextUrl.origin;

    // 🌟 核心修复：如果带 userId 过来，就拼接到返回链接里
    let returnTo = `${origin}/api/auth/steam/callback?source=${source}`;
    if (userId) {
      returnTo += `&userId=${userId}`;
    }

    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': origin,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });

    const authUrl = `https://steamcommunity.com/openid/login?${params.toString()}`;
    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    return NextResponse.redirect(new URL('/login?error=steam_auth_failed', req.url));
  }
}