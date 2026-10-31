import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(req: NextRequest) {
  try {
    const { searchParams, origin } = new URL(req.url);
    const source = searchParams.get('source') || 'settings';
    const claimedId = searchParams.get('openid.claimed_id');

    // 🌟 修复点：如果没拿到 claimed_id，说明验证未通过
    if (!claimedId) {
      return NextResponse.redirect(new URL('/login?error=steam_auth_failed', req.url));
    }

    // 提取 SteamID64
    const steamId = claimedId.split('/').pop();
    if (!steamId) throw new Error('无法解析 SteamID');

    // 🌟 修复点：校验玩家是否拥有 ETS2 且游玩时长大于 120 分钟
    const steamApiKey = process.env.STEAM_API_KEY;
    const ownedGames = await axios.get('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/', {
      params: {
        key: steamApiKey,
        steamid: steamId,
        include_played_free_games: true,
        appids_filter: JSON.stringify([227300]),
      },
    });

    const games = ownedGames.data.response.games;
    if (!games || games.length === 0 || games[0].playtime_forever < 120) {
      return NextResponse.redirect(new URL('/login?error=no_ets2', req.url));
    }

    // 注册来源：将 steamId 回传前端注册表单
    if (source === 'register') {
      return NextResponse.redirect(new URL(`/login?steamid=${steamId}&verified=true`, req.url));
    }

    // 设置页绑定来源
    return NextResponse.redirect(new URL('/settings?success=steam_verified', req.url));
    } catch (error: any) {
    // 🌟 打印详细的报错信息，方便排查
    console.error('========= Steam 回调报错 =========');
    if (error.response) {
      // 如果是 axios 报错，打印出 Steam 官方返回的具体数据
      console.error('状态码:', error.response.status);
      console.error('返回数据:', error.response.data);
    } else {
      console.error('错误信息:', error.message);
    }
    console.error('===================================');
    
    return NextResponse.redirect(new URL('/login?error=steam_callback_failed', req.url));
  }
}