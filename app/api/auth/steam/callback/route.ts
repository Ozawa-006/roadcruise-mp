import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source') || 'settings';
    const claimedId = searchParams.get('openid.claimed_id');

    if (!claimedId) {
      return NextResponse.redirect(new URL('/login?error=steam_auth_failed', req.url));
    }

    const steamId = claimedId.split('/').pop();
    if (!steamId) throw new Error('无法解析 SteamID');

    const steamApiKey = process.env.STEAM_API_KEY;
    
    // 🌟 修改1：去掉 appids_filter，直接拉取所有游戏，在本地过滤
    const ownedGames = await axios.get('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/', {
      params: {
        key: steamApiKey,
        steamid: steamId,
        include_played_free_games: true,
      },
    });

    const games = ownedGames.data.response.games || [];
    
    // 🌟 修改2：在本地数组里找 ETS2 (AppID: 227300)
    const ets2Game = games.find((game: any) => game.appid === 227300);
    const playtime = ets2Game ? ets2Game.playtime_forever : 0;

    console.log(`玩家 SteamID: ${steamId}, 拥有的游戏数量: ${games.length}, ETS2 游玩时长: ${playtime} 分钟`);

    // 校验：没找到游戏，或者时长不到 120 分钟
    if (!ets2Game || playtime < 120) {
      return NextResponse.redirect(new URL('/login?error=no_ets2', req.url));
    }

    if (source === 'register') {
      return NextResponse.redirect(new URL(`/login?steamid=${steamId}&verified=true`, req.url));
    }

    return NextResponse.redirect(new URL('/settings?success=steam_verified', req.url));
    
  } catch (error: any) {
    console.error('========= Steam 回调报错 =========');
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('返回数据:', error.response.data);
    } else {
      console.error('错误信息:', error.message);
    }
    console.error('===================================');
    
    return NextResponse.redirect(new URL('/login?error=steam_callback_failed', req.url));
  }
}