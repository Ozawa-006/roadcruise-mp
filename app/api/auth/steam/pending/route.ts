import { NextRequest } from 'next/server';
import {
  STEAM_PENDING_COOKIE,
  type PendingPayload,
  maskSteamId,
  verifyTokenOfType,
} from '../../../../../lib/steam-token';
import { noStoreJson } from '../../../../../lib/supabase-server';
import { clientKey, rateLimit, rateLimitedResponse } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 返回“当前浏览器是否持有有效的 Steam 验证凭证”。
 * 这是注册表单唯一可信的开关：不再读取 /login?steamid=..&verified=true 这类 URL 参数。
 */
export async function GET(req: NextRequest) {
  // 限流（内存级兜底）：同一 IP 每分钟最多 120 次
  const limited = rateLimit(clientKey(req, 'steam-pending'), 120, 60_000);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfter);

  const pending = verifyTokenOfType<PendingPayload>(
    req.cookies.get(STEAM_PENDING_COOKIE)?.value,
    'pending'
  );

  if (!pending) {
    return noStoreJson({ verified: false });
  }

  return noStoreJson({
    verified: true,
    steamIdMasked: maskSteamId(pending.steamid),
    expiresAt: pending.exp * 1000,
  });
}
