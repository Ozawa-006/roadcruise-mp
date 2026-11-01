/**
 * 客户端调用 /api/auth/steam/bind 的轻量封装。
 * 注意：本文件只做 fetch，不包含任何服务端密钥。
 */

export interface SteamBindResult {
  ok: boolean;
  code?: string;
  message?: string;
  alreadyBound?: boolean;
  steamIdMasked?: string;
}

export async function attemptSteamBind(accessToken: string): Promise<SteamBindResult> {
  try {
    const res = await fetch('/api/auth/steam/bind', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as SteamBindResult | null;
    if (data) return data;
    return { ok: false, code: 'invalid_response', message: '服务器返回异常，请稍后重试。' };
  } catch {
    return { ok: false, code: 'network_error', message: '网络错误，请稍后重试。' };
  }
}
