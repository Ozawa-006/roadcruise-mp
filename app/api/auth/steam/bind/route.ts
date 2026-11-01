import { NextRequest, NextResponse } from 'next/server';
import { MIN_ETS2_MINUTES, fetchSteamOwnedGames } from '../../../../../lib/steam';
import {
  STEAM_PENDING_COOKIE,
  type PendingPayload,
  cookieOptions,
  maskSteamId,
  verifyTokenOfType,
} from '../../../../../lib/steam-token';
import { getAdminClient, getAnonClient, noStoreJson } from '../../../../../lib/supabase-server';
import { clientKey, rateLimit, rateLimitedResponse } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 首次登录后把“已验证的 Steam 身份”写入 profiles。
 *
 * 鉴权三重校验：
 * 1. Authorization: Bearer <access token> —— 证明是本人。
 * 2. 签名 HttpOnly Cookie —— 证明这个浏览器真的完成了 Steam OpenID 验签与时长校验。
 * 3. 服务端再次调用 Steam API 复核正版与时长 —— 防止 Cookie 被长期复用/篡改。
 *
 * 写入使用 service_role（客户端无法直接改 steam_id / steam_verified）。
 */
export async function POST(req: NextRequest) {
  // 限流（内存级兜底）：同一 IP 每分钟最多 20 次绑定请求
  const limited = rateLimit(clientKey(req, 'steam-bind'), 20, 60_000);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfter);

  const token = readBearer(req);
  if (!token) {
    return noStoreJson({ ok: false, code: 'unauthorized', message: '未登录' }, 401);
  }

  let userId: string;
  try {
    const { data, error } = await getAnonClient().auth.getUser(token);
    if (error || !data.user) {
      return noStoreJson({ ok: false, code: 'unauthorized', message: '登录状态已失效' }, 401);
    }
    userId = data.user.id;
  } catch (error) {
    console.error('[steam/bind] 校验用户失败:', error);
    return noStoreJson({ ok: false, code: 'server_error' }, 500);
  }

  const pending = verifyTokenOfType<PendingPayload>(
    req.cookies.get(STEAM_PENDING_COOKIE)?.value,
    'pending'
  );
  if (!pending) {
    return noStoreJson(
      { ok: false, code: 'no_pending', message: '没有有效的 Steam 验证凭证，请重新完成验证。' },
      400
    );
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (error) {
    console.error('[steam/bind] Supabase 管理端初始化失败:', error);
    return noStoreJson(
      {
        ok: false,
        code: 'server_misconfigured',
        message: '服务端未配置 SUPABASE_SERVICE_ROLE_KEY，暂时无法绑定。',
      },
      503
    );
  }

  try {
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('steam_id, steam_verified')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;

    if (!profile) {
      return noStoreJson(
        { ok: false, code: 'profile_missing', message: '账号资料不存在，请先完成注册后再试。' },
        409
      );
    }

    if (profile.steam_verified && profile.steam_id) {
      if (profile.steam_id === pending.steamid) {
        const res = noStoreJson({ ok: true, alreadyBound: true });
        clearPending(res);
        return res;
      }
      const res = noStoreJson(
        { ok: false, code: 'already_verified', message: '该账号已绑定其它 Steam 账号。' },
        409
      );
      clearPending(res);
      return res;
    }

    // 防御性复核：确认该 SteamID 仍然满足正版 + 时长门槛
    const games = await fetchSteamOwnedGames(pending.steamid);
    if (!games.ok) {
      return noStoreJson(
        { ok: false, code: 'steam_api_failed', message: 'Steam 接口暂时不可用，请稍后重试。' },
        502
      );
    }
    if (!games.hasEts2 || games.ets2Minutes < MIN_ETS2_MINUTES) {
      const res = noStoreJson(
        { ok: false, code: 'no_ets2', message: 'Steam 账号不满足正版 ETS2 / 2 小时门槛。' },
        403
      );
      clearPending(res);
      return res;
    }

    const { data: duplicate, error: duplicateError } = await admin
      .from('profiles')
      .select('id')
      .eq('steam_id', pending.steamid)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate && duplicate.id !== userId) {
      const res = noStoreJson(
        { ok: false, code: 'steam_in_use', message: '该 Steam 账号已被其它社区账号绑定。' },
        409
      );
      clearPending(res);
      return res;
    }

    const { data: updatedRows, error: updateError } = await admin
      .from('profiles')
      .update({ steam_id: pending.steamid, steam_verified: true })
      .eq('id', userId)
      .select('id');
    if (updateError) {
      // 唯一索引兜底：并发双绑时数据库拒绝第二个
      if ((updateError as { code?: string }).code === '23505') {
        const res = noStoreJson(
          { ok: false, code: 'steam_in_use', message: '该 Steam 账号已被其它社区账号绑定。' },
          409
        );
        clearPending(res);
        return res;
      }
      throw updateError;
    }
    if (!updatedRows || updatedRows.length === 0) {
      return noStoreJson(
        { ok: false, code: 'profile_missing', message: '账号资料不存在，绑定未写入。' },
        409
      );
    }

    const res = noStoreJson({ ok: true, steamIdMasked: maskSteamId(pending.steamid) });
    clearPending(res);
    return res;
  } catch (error) {
    console.error('[steam/bind] 写入 profiles 失败:', error);
    return noStoreJson(
      { ok: false, code: 'bind_failed', message: 'Steam 绑定失败，请稍后重试。' },
      500
    );
  }
}

function clearPending(res: NextResponse): void {
  res.cookies.set(STEAM_PENDING_COOKIE, '', cookieOptions(0));
}

function readBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
