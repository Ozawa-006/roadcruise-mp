import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source') || 'settings';
    const userId = searchParams.get('userId'); // 设置页绑定需要用到
    const claimedId = searchParams.get('openid.claimed_id');

    if (!claimedId) throw new Error('验证失败：无 claimed_id');

    const steamId = claimedId.split('/').pop();
    if (!steamId) throw new Error('无法解析 SteamID');

    const steamApiKey = process.env.STEAM_API_KEY;
    
    // 获取游戏数据
    const ownedGames = await axios.get('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/', {
      params: {
        key: steamApiKey,
        steamid: steamId,
        include_played_free_games: true,
      },
    });

    const games = ownedGames.data.response.games || [];
    const ets2Game = games.find((game: any) => game.appid === 227300);
    const playtime = ets2Game ? ets2Game.playtime_forever : 0;

    if (!ets2Game || playtime < 120) {
      return NextResponse.redirect(new URL('/login?error=no_ets2', req.url));
    }

    // 注册流程
    if (source === 'register') {
      return NextResponse.redirect(new URL(`/login?steamid=${steamId}&verified=true`, req.url));
    }

    // 设置页绑定流程：强制更新 steam_id 和 steam_verified
    if (source === 'settings' && userId) {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ steam_id: steamId, steam_verified: true })
        .eq('id', userId);
        
      if (error) throw error;
    }

    return NextResponse.redirect(new URL('/settings?success=steam_verified', req.url));
    
  } catch (error: any) {
    console.error('Steam Error:', error.message);
    return NextResponse.redirect(new URL('/login?error=steam_callback_failed', req.url));
  }
}