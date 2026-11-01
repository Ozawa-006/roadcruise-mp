/**
 * Steam OpenID 2.0 验证 + Steam Web API 正版/时长检查。
 * 仅允许在服务端（Route Handler）引用，不要把 STEAM_API_KEY 暴露到客户端。
 */

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
export const STEAM_CLAIMED_ID_PREFIX = 'https://steamcommunity.com/openid/id/';
export const STEAM_OP_ENDPOINT_PREFIX = 'https://steamcommunity.com/openid/';

export const ETS2_APP_ID = 227300;
/** 正版门槛：ETS2 游玩时长必须大于 2 小时 */
export const MIN_ETS2_MINUTES = 120;

/** SteamID64 为 17 位数字 */
const STEAMID64_PATTERN = /^\d{17}$/;

const STEAM_TIMEOUT_MS = 8000;

export function buildSteamLoginUrl(params: { returnTo: string; realm: string }): string {
  const search = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': params.returnTo,
    'openid.realm': params.realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `${STEAM_OPENID_ENDPOINT}?${search.toString()}`;
}

export type OpenIdVerifyResult =
  | { ok: true; steamId: string }
  | {
      ok: false;
      reason:
        | 'bad_assertion'
        | 'signature_invalid'
        | 'steam_unreachable'
        | 'steam_error';
    };

/**
 * 校验 Steam 回跳的 OpenID 断言。
 *
 * 关键：必须把断言原样 POST 回 Steam 的 check_authentication，
 * 只有 Steam 回复 is_valid:true 才算验证通过；仅解析 claimed_id 是不可信的。
 *
 * 防重放：断言必须是我们这次流程签发的（openid.return_to 精确等于
 * `${origin}/api/auth/steam/callback?nonce=<state.nonce>`），且我们依赖的字段
 * 必须出现在 openid.signed 里。否则一条旧的合法断言可以被配上一个新的 state
 * Cookie 重放（Steam 的断言本身不是一次性的）。
 */
export async function verifyOpenIdAssertion(
  assertion: URLSearchParams,
  expectedReturnTo: string
): Promise<OpenIdVerifyResult> {
  if (assertion.get('openid.mode') !== 'id_res') {
    return { ok: false, reason: 'bad_assertion' };
  }

  // 拒绝重复的 openid.* 参数：不同组件对“取第一个/最后一个”的解释可能不同，
  // 重复 key 是签名混淆/断言拼接的常见手法。
  const openidKeys = new Set<string>();
  let duplicated = false;
  assertion.forEach((_value, key) => {
    if (!key.startsWith('openid.')) return;
    if (openidKeys.has(key)) duplicated = true;
    openidKeys.add(key);
  });
  if (duplicated) return { ok: false, reason: 'bad_assertion' };

  const opEndpoint = assertion.get('openid.op_endpoint') ?? '';
  if (!opEndpoint.startsWith(STEAM_OP_ENDPOINT_PREFIX)) {
    return { ok: false, reason: 'bad_assertion' };
  }

  const claimedId = assertion.get('openid.claimed_id') ?? '';
  if (!claimedId.startsWith(STEAM_CLAIMED_ID_PREFIX)) {
    return { ok: false, reason: 'bad_assertion' };
  }

  const steamId = claimedId.slice(STEAM_CLAIMED_ID_PREFIX.length);
  if (!STEAMID64_PATTERN.test(steamId)) {
    return { ok: false, reason: 'bad_assertion' };
  }

  // ① 回来地址必须与本次流程的 nonce 完全一致（防断言重放 / 换 state Cookie）
  const returnTo = assertion.get('openid.return_to') ?? '';
  if (returnTo !== expectedReturnTo) {
    return { ok: false, reason: 'bad_assertion' };
  }

  // ② 我们信任的字段必须由 Steam 签名（防“签名覆盖不到我们读取的字段”）
  const signedFields = (assertion.get('openid.signed') ?? '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  const requiredSigned = ['claimed_id', 'op_endpoint', 'return_to', 'response_nonce'];
  if (!requiredSigned.every((field) => signedFields.includes(field))) {
    return { ok: false, reason: 'bad_assertion' };
  }

  // 原样转发所有 openid.* 参数，只把 mode 换成 check_authentication
  const body = new URLSearchParams();
  assertion.forEach((value, key) => {
    if (key.startsWith('openid.')) body.append(key, value);
  });
  body.set('openid.mode', 'check_authentication');

  try {
    const res = await fetch(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(STEAM_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, reason: 'steam_error' };

    const text = await res.text();
    // 严格按行解析：必须恰好有一行 is_valid:true，且不能出现 is_valid:false
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean);
    const trueCount = lines.filter((line) => line === 'is_valid:true').length;
    const hasFalse = lines.some((line) => line === 'is_valid:false');
    if (trueCount !== 1 || hasFalse) {
      return { ok: false, reason: 'signature_invalid' };
    }
    return { ok: true, steamId };
  } catch {
    return { ok: false, reason: 'steam_unreachable' };
  }
}

export type OwnedGamesResult =
  | {
      ok: true;
      hasEts2: boolean;
      ets2Minutes: number;
      /** false 表示 Steam 资料/游戏详情不公开，拿不到游戏列表 */
      gamesVisible: boolean;
    }
  | {
      ok: false;
      reason: 'missing_key' | 'steam_unreachable' | 'steam_error';
    };

interface SteamOwnedGamesResponse {
  response?: {
    game_count?: number;
    games?: Array<{ appid?: number; playtime_forever?: number }>;
  };
}

/** 查询玩家游戏库，判断是否拥有 ETS2 且时长满足门槛 */
export async function fetchSteamOwnedGames(steamId: string): Promise<OwnedGamesResult> {
  const key = process.env.STEAM_API_KEY;
  if (!key) return { ok: false, reason: 'missing_key' };

  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/');
  url.searchParams.set('key', key);
  url.searchParams.set('steamid', steamId);
  url.searchParams.set('include_played_free_games', '1');
  url.searchParams.set('include_appinfo', '0');
  url.searchParams.set('format', 'json');

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(STEAM_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, reason: 'steam_error' };

    const data = (await res.json()) as SteamOwnedGamesResponse;
    const response = data?.response;
    if (!response || (response.games === undefined && response.game_count === undefined)) {
      // 游戏详情不公开 / 该账号没有公开游戏库
      return { ok: true, hasEts2: false, ets2Minutes: 0, gamesVisible: false };
    }

    const games = response.games ?? [];
    const ets2 = games.find((game) => game.appid === ETS2_APP_ID);
    return {
      ok: true,
      hasEts2: Boolean(ets2),
      ets2Minutes: ets2?.playtime_forever ?? 0,
      gamesVisible: true,
    };
  } catch {
    return { ok: false, reason: 'steam_unreachable' };
  }
}

/** 从 Authorization: Bearer <token> 中取出 access token */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
