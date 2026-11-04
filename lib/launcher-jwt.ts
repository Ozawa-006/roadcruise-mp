/**
 * 启动器 JWT（RS256）：签发、验签、JWKS。
 * 私钥只存在服务端环境变量 LAUNCHER_JWT_PRIVATE_KEY（PKCS8 PEM 的 base64）。
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type JsonWebKey,
} from 'crypto';

export const LAUNCHER_ISSUER = 'https://www.roadcruise-mp.com';
export const LAUNCHER_AUDIENCE = 'rctmp-game';
export const LAUNCHER_TTL_SECONDS = 60 * 60 * 24; // 24h

export interface LauncherJwtUser {
  id: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
  banned: boolean;
  steamVerified?: boolean;
}

export interface LauncherJwtClaims {
  iss: string;
  aud: string;
  sub: string;
  name: string;
  display_name: string;
  avatar_url: string | null;
  banned: boolean;
  steam_verified: boolean;
  iat: number;
  exp: number;
  jti: string;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

function privateKeyPem(): string | null {
  const raw = process.env.LAUNCHER_JWT_PRIVATE_KEY;
  if (!raw) return null;
  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

export function launcherJwtConfigured(): boolean {
  return Boolean(privateKeyPem() && process.env.LAUNCHER_JWT_KID);
}

function publicKey() {
  const pem = privateKeyPem();
  if (!pem) return null;
  try {
    return createPublicKey(createPrivateKey(pem));
  } catch {
    return null;
  }
}

/** 返回 JWKS（公钥），供游戏服离线验签。 */
export function getLauncherJwks(): { keys: JsonWebKey[] } | null {
  const key = publicKey();
  const kid = process.env.LAUNCHER_JWT_KID;
  if (!key || !kid) return null;
  const jwk = key.export({ format: 'jwk' }) as JsonWebKey;
  return {
    keys: [
      {
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
        alg: 'RS256',
        use: 'sig',
        kid,
      },
    ],
  };
}

export function launcherKeyId(): string | null {
  const key = publicKey();
  if (!key) return null;
  const jwk = key.export({ format: 'jwk' });
  if (!jwk.n) return null;
  return createHash('sha256').update(jwk.n).digest('hex').slice(0, 16);
}

export async function signLauncherToken(
  user: LauncherJwtUser
): Promise<{ token: string; expiresIn: number; expiresAt: number }> {
  const pem = privateKeyPem();
  const kid = process.env.LAUNCHER_JWT_KID;
  if (!pem || !kid) {
    throw new Error('launcher_jwt_not_configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + LAUNCHER_TTL_SECONDS;
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const claims: LauncherJwtClaims = {
    iss: LAUNCHER_ISSUER,
    aud: LAUNCHER_AUDIENCE,
    sub: user.id,
    name: user.name,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    banned: user.banned,
    steam_verified: user.steamVerified ?? false,
    iat: now,
    exp,
    jti: `${now}-${Math.random().toString(36).slice(2, 10)}`,
  };

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claims)
  )}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), pem);

  return {
    token: `${signingInput}.${base64Url(signature)}`,
    expiresIn: LAUNCHER_TTL_SECONDS,
    expiresAt: exp,
  };
}

/** 验签并校验 iss/aud/exp，失败返回 null。 */
export function verifyLauncherToken(token: string): LauncherJwtClaims | null {
  const key = publicKey();
  const kid = process.env.LAUNCHER_JWT_KID;
  if (!key || !kid) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(fromBase64Url(parts[0]).toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    if (header.alg !== 'RS256' || header.kid !== kid) return null;

    const signingInput = `${parts[0]}.${parts[1]}`;
    const valid = verify(
      'RSA-SHA256',
      Buffer.from(signingInput),
      key,
      fromBase64Url(parts[2])
    );
    if (!valid) return null;

    const claims = JSON.parse(fromBase64Url(parts[1]).toString('utf8')) as LauncherJwtClaims;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== LAUNCHER_ISSUER) return null;
    if (claims.aud !== LAUNCHER_AUDIENCE) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= now) return null;
    if (!claims.sub) return null;
    return claims;
  } catch {
    return null;
  }
}
