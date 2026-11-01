import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Steam 验证流程使用的签名令牌 / Cookie 工具。
 *
 * 设计要点（防伪）：
 * - 所有“Steam 已验证”状态只存在于服务端签名过的 HttpOnly Cookie 里，
 *   浏览器 JS 读不到、也无法伪造；URL 参数（steamid/verified）不再被信任。
 * - AUTH_SECRET 只在服务端使用（不可加 NEXT_PUBLIC_ 前缀），Vercel 上必须配置同一值。
 */

export const STEAM_PENDING_COOKIE = 'rct_steam_pending';
export const STEAM_STATE_COOKIE = 'rct_steam_state';

/** 注册闸门令牌有效期：30 分钟
 *  （要覆盖“注册 → 查收邮件 → 点确认 → 首次登录”的完整链路；过期后仍可在
 *   账号设置页用「绑定 Steam」重新完成验证，不会把账号卡死。） */
export const PENDING_TTL_SECONDS = 30 * 60;
/** OpenID state 令牌有效期：10 分钟 */
export const STATE_TTL_SECONDS = 10 * 60;

export type SteamSource = 'register' | 'settings';

export interface PendingPayload {
  typ: 'pending';
  steamid: string;
  iat: number;
  exp: number;
}

export interface StatePayload {
  typ: 'state';
  source: SteamSource;
  userId?: string;
  nonce: string;
  iat: number;
  exp: number;
}

export interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'AUTH_SECRET 未配置：请在环境变量中设置至少 16 字符的随机密钥（本地 .env.local 与 Vercel 都要配置）'
    );
  }
  return secret;
}

function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function createSignedToken(payload: Record<string, unknown>): string {
  const secret = getSecret();
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${signBody(body, secret)}`;
}

/**
 * 校验签名与过期时间。任何异常（缺密钥、格式错误、签名不符、过期）统一返回 null。
 */
export function verifySignedToken<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!body || !signature) return null;

  try {
    const expected = signBody(body, getSecret());
    const given = Buffer.from(signature, 'utf8');
    const want = Buffer.from(expected, 'utf8');
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as
      | (T & { exp?: number })
      | null;
    if (!payload || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < Date.now()) return null;

    return payload as T;
  } catch {
    return null;
  }
}

export function createPendingToken(steamid: string): string {
  const now = Math.floor(Date.now() / 1000);
  return createSignedToken({
    typ: 'pending',
    steamid,
    iat: now,
    exp: now + PENDING_TTL_SECONDS,
  } satisfies PendingPayload);
}

export function createStateToken(source: SteamSource, nonce: string, userId?: string): string {
  const now = Math.floor(Date.now() / 1000);
  return createSignedToken({
    typ: 'state',
    source,
    userId,
    nonce,
    iat: now,
    exp: now + STATE_TTL_SECONDS,
  } satisfies StatePayload);
}

/**
 * 校验令牌用途，防止 state token 与 pending token 互相顶替
 * （两者用同一密钥，必须用 typ 区分）。
 */
export function verifyTokenOfType<T extends { typ?: string }>(
  token: string | undefined | null,
  expectedType: 'pending' | 'state'
): T | null {
  const payload = verifySignedToken<T>(token);
  if (!payload || payload.typ !== expectedType) return null;
  return payload;
}

export function cookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // 本地 dev 是 http，生产是 https；secure 只在生产开启，否则本地 Cookie 不会写入
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/** 只用于前端展示，避免把完整 SteamID 暴露给页面 JS */
export function maskSteamId(steamid: string): string {
  if (steamid.length <= 7) return '****';
  return `${steamid.slice(0, 3)}****${steamid.slice(-4)}`;
}
