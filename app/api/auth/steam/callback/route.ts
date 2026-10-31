import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// 必须使用 service_role 提权，才能跨用户修改数据
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source') || 'settings';
    const userId = searchParams.get('userId'); // 🌟 接收到刚才传过来的用户ID
    const claimedId = searchParams.get('openid.claimed_id');

    if (!claimedId) throw new Error('验证失败：无 claimed_id');
    const steamId = claimedId.split('/').pop();
    if (!steamId) throw new Error('无法解析 SteamID');

    const steamApiKey = process.env.STEAM_API_KEY;
    
    // 查游戏库
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

    if (source === 'register') {
      return NextResponse.redirect(new URL(`/login?steamid=${steamId}&verified=true`, req.url));
    }

    // 🌟 核心修复：如果是设置页绑定，必须拿到 userId 并写入数据库
    if (source === 'settings') {
      if (!userId) throw new Error('缺少用户ID，无法绑定');
      
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ steam_id: steamId, steam_verified: true }) // 强制更新这俩字段
        .eq('id', userId);
        
      if (error) throw error;
      console.log(`✅ 成功将 SteamID ${steamId} 绑定给用户 ${userId}`);
    }

    return NextResponse.redirect(new URL('/settings?success=steam_verified', req.url));
    
  } catch (error: any) {
    console.error('Steam 绑定报错:', error.message);
    return NextResponse.redirect(new URL('/login?error=steam_callback_failed', req.url));
  }
}