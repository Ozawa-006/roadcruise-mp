import { NextRequest, NextResponse } from 'next/server';
import {
  MIN_ETS2_MINUTES,
  fetchSteamOwnedGames,
  verifyOpenIdAssertion,
} from '../../../../../lib/steam';
import {
  PENDING_TTL_SECONDS,
  STEAM_PENDING_COOKIE,
  STEAM_STATE_COOKIE,
  type StatePayload,
  cookieOptions,
  createPendingToken,
  verifyTokenOfType,
} from '../../../../../lib/steam-token';
import { getAdminClient } from '../../../../../lib/supabase-server';
import { clientKey, rateLimit, rateLimitedResponse } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Steam OpenID 回跳入口。
 *
 * 安全要点：
 * 1. state Cookie 必须是服务端签名且未过期，且 URL 里的 nonce 与之匹配（防 CSRF / 重放）。
 * 2. openid 断言必须回 Steam 做 check_authentication 验签（防伪造 claimed_id）。
 * 3. 校验游戏库与时长，通过后才给浏览器下发“已验证”的签名 HttpOnly Cookie。
 * 4. settings 绑定的 userId 取自签名 state Cookie，不再信任 URL 参数。
 */
export async function GET(req: NextRequest) {
  // 限流（内存级兜底）：同一 IP 每分钟最多 20 次回调
  const limited = rateLimit(clientKey(req, 'steam-callback'), 20, 60_000);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfter);

  const params = req.nextUrl.searchParams;

  const state = verifyTokenOfType<StatePayload>(
    req.cookies.get(STEAM_STATE_COOKIE)?.value,
    'state'
  );
  if (!state) {
    return redirectWithClearedState(req, '/login?error=steam_state_invalid');
  }
  if (!state.nonce || params.get('nonce') !== state.nonce) {
    return redirectWithClearedState(req, '/login?error=steam_state_invalid');
  }

  // 断言必须绑定到本次流程的 nonce（防重放：旧断言 + 新 state Cookie 不可用）
  const expectedReturnTo = `${req.nextUrl.origin}/api/auth/steam/callback?nonce=${state.nonce}`;
  const assertion = await verifyOpenIdAssertion(params, expectedReturnTo);
  if (!assertion.ok) {
    const code =
      assertion.reason === 'signature_invalid' || assertion.reason === 'bad_assertion'
        ? 'steam_signature_invalid'
        : 'steam_auth_failed';
    return redirectWithClearedState(req, `/login?error=${code}`);
  }

  const games = await fetchSteamOwnedGames(assertion.steamId);
  if (!games.ok) {
    const code =
      games.reason === 'missing_key' ? 'steam_service_misconfigured' : 'steam_api_failed';
    return redirectWithClearedState(req, `/login?error=${code}`);
  }
  if (!games.gamesVisible) {
    return redirectWithClearedState(req, '/login?error=steam_private');
  }
  if (!games.hasEts2 || games.ets2Minutes < MIN_ETS2_MINUTES) {
    return redirectWithClearedState(req, '/login?error=no_ets2');
  }

  if (state.source === 'register') {
    // 只给浏览器一个 10 分钟有效的签名 Cookie，注册表单是否展示由服务端 /pending 接口决定
    const res = NextResponse.redirect(new URL('/login?steam_verified=1', req.url));
    res.cookies.set(
      STEAM_PENDING_COOKIE,
      createPendingToken(assertion.steamId),
      cookieOptions(PENDING_TTL_SECONDS)
    );
    res.cookies.set(STEAM_STATE_COOKIE, '', cookieOptions(0));
    return res;
  }

  // source === 'settings'：把 Steam 绑定到当前登录用户
  if (!state.userId) {
    return redirectWithClearedState(req, '/login?error=steam_state_invalid');
  }

  try {
    const admin = getAdminClient();

    // 已绑定其它 Steam 的账号不允许客户端自行换绑（需管理员 / service_role）
    const { data: current, error: currentError } = await admin
      .from('profiles')
      .select('steam_id, steam_verified')
      .eq('id', state.userId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (
      current?.steam_verified &&
      current.steam_id &&
      current.steam_id !== assertion.steamId
    ) {
      return redirectWithClearedState(req, '/settings?error=steam_already_bound');
    }

    const { data: existing, error: existingError } = await admin
      .from('profiles')
      .select('id')
      .eq('steam_id', assertion.steamId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.id !== state.userId) {
      return redirectWithClearedState(req, '/settings?error=steam_in_use');
    }

    const { error: updateError } = await admin
      .from('profiles')
      .update({ steam_id: assertion.steamId, steam_verified: true })
      .eq('id', state.userId);
    if (updateError) {
      // 唯一索引兜底：并发双绑时这里会拿到 23505
      if ((updateError as { code?: string }).code === '23505') {
        return redirectWithClearedState(req, '/settings?error=steam_in_use');
      }
      throw updateError;
    }
  } catch (error) {
    console.error('[steam/callback] 绑定 Steam 失败:', error);
    return redirectWithClearedState(req, '/settings?error=steam_bind_failed');
  }

  const res = NextResponse.redirect(new URL('/settings?success=steam_verified', req.url));
  res.cookies.set(STEAM_STATE_COOKIE, '', cookieOptions(0));
  return res;
}

function redirectWithClearedState(req: NextRequest, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, req.url));
  res.cookies.set(STEAM_STATE_COOKIE, '', cookieOptions(0));
  return res;
}
