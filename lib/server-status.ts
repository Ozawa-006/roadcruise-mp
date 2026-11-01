/**
 * RCTMP 游戏服务器状态：服务器注册表、字段归一化、带超时的抓取。
 *
 * 本模块只在服务端使用（Route Handler / Server Component）。
 * 不要把其中的运行时函数导入到 `'use client'` 组件，否则 apiKey / 内网 baseUrl
 * 可能被打进浏览器 bundle。
 */

export type ServerTarget = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
};

export type PlayerPosition = {
  x?: number | null;
  y?: number | null;
  z?: number | null;
  kmh?: number | null;
  [key: string]: unknown;
};

/**
 * 玩家字段按 API 文档做类型描述，但保留服务端返回的原始对象（含未来新增字段）。
 */
export type ServerPlayer = {
  id?: number | null;
  name?: string | null;
  tag?: string | null;
  ping?: number | null;
  addr?: string | null;
  connectedSec?: number | null;
  silentMs?: number | null;
  pos?: PlayerPosition | null;
  [key: string]: unknown;
};

export type ServerStats = {
  packetsIn?: number | null;
  packetsOut?: number | null;
  bytesIn?: number | null;
  bytesOut?: number | null;
  rejects?: {
    jump?: number | null;
    zero?: number | null;
    [key: string]: unknown;
  } | null;
  chats?: number | null;
  logins?: number | null;
  kicks?: number | null;
  snapshotTicks?: number | null;
  lastTickMs?: number | null;
  avgNeighbors?: number | null;
  resyncs?: number | null;
  [key: string]: unknown;
};

export type ServerConfig = {
  port?: number | null;
  maxPlayers?: number | null;
  snapshotHz?: number | null;
  radius?: number | null;
  maxNeighbors?: number | null;
  auth?: boolean | null;
  [key: string]: unknown;
};

export type ServerStatus = {
  id: string;
  name: string;
  region: string | null;
  game: string | null;
  version: string | null;
  protocolVersion: number | null;
  uptimeSec: number | null;
  capacity: number;
  online: number;
  avgNeighbors: number | null;
  lastTickMs: number | null;
  config: ServerConfig | null;
  players: ServerPlayer[];
  stats: ServerStats | null;
  /**
   * 代理附加字段：该状态的来源 base URL。
   * 游戏服务器的 `/status` 本身不返回 baseUrl，浏览器需要它来展示 host。
   */
  baseUrl: string;
};

export type ServerFetchError =
  | 'unauthorized'
  | 'timeout'
  | 'bad_response'
  | 'network_error';

export type FetchServerStatusResult =
  | { ok: true; status: ServerStatus }
  | { ok: false; error: ServerFetchError };

export type ServerStatusError = {
  id: string;
  error: string;
};

/** `GET /api/servers/status` 的响应结构。 */
export type ServersStatusPayload = {
  servers: ServerStatus[];
  errors: ServerStatusError[];
  fetchedAt: string;
  configured: boolean;
};

const REQUEST_TIMEOUT_MS = 2500;
const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';
const DEFAULT_SERVER_ID = 'rct1';
const DEFAULT_SERVER_NAME = 'RCTMP 路驰 · RCT1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNonNegativeNumber(value: unknown): number | null {
  const number = readNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function readCount(value: unknown): number | null {
  const number = readNonNegativeNumber(value);
  return number === null ? null : Math.floor(number);
}

function readPort(value: unknown): number | null {
  const number = readNumber(value);
  if (number === null || !Number.isInteger(number) || number < 1 || number > 65535) {
    return null;
  }
  return number;
}

function defaultServerName(id: string): string {
  return id === DEFAULT_SERVER_ID ? DEFAULT_SERVER_NAME : `RCTMP 路驰 · ${id.toUpperCase()}`;
}

/**
 * 校验并规范化 base URL：只允许 http(s)，去掉 query / hash / 末尾斜杠。
 * 允许带路径前缀（例如 https://example.com/game-api），后续会拼接 `/status`。
 */
export function normalizeBaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    // 不把 URL 内嵌账号密码带回浏览器；鉴权请用 RCTMP_API_KEY / apiKey。
    if (url.username || url.password) return null;

    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function parseServerList(raw: string): ServerTarget[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error('[server-status] RCTMP_SERVERS 不是合法 JSON：', error);
    return null;
  }

  if (!Array.isArray(parsed)) {
    console.error('[server-status] RCTMP_SERVERS 必须是 JSON 数组。');
    return null;
  }

  // 显式配置空数组 = 明确关闭服务器列表（用于维护页 / 预览环境）。
  if (parsed.length === 0) {
    console.warn('[server-status] RCTMP_SERVERS 是空数组，当前不提供任何服务器。');
    return [];
  }

  const globalApiKey = readTrimmedString(process.env.RCTMP_API_KEY) ?? undefined;
  const targets: ServerTarget[] = [];
  const seenIds = new Set<string>();

  parsed.forEach((entry, index) => {
    if (!isRecord(entry)) {
      console.error(`[server-status] RCTMP_SERVERS[${index}] 不是对象，已忽略。`);
      return;
    }

    const rawBaseUrl = readTrimmedString(entry.baseUrl);
    const baseUrl = rawBaseUrl ? normalizeBaseUrl(rawBaseUrl) : null;
    if (!baseUrl) {
      console.error(`[server-status] RCTMP_SERVERS[${index}] 的 baseUrl 缺失或非法，已忽略。`);
      return;
    }

    const id = readTrimmedString(entry.id) ?? `server-${index + 1}`;
    if (seenIds.has(id)) {
      console.error(`[server-status] RCTMP_SERVERS 中存在重复 id "${id}"，已忽略。`);
      return;
    }
    seenIds.add(id);

    const name = readTrimmedString(entry.name) ?? defaultServerName(id);
    const apiKey = readTrimmedString(entry.apiKey) ?? globalApiKey;
    targets.push({
      id,
      name,
      baseUrl,
      ...(apiKey ? { apiKey } : {}),
    });
  });

  if (targets.length === 0) {
    console.error('[server-status] RCTMP_SERVERS 中没有可用的服务器条目。');
    return null;
  }

  return targets;
}

function getSingleTarget(): ServerTarget[] {
  const rawBaseUrl = readTrimmedString(process.env.RCTMP_API_BASE_URL);
  const isProduction = process.env.NODE_ENV === 'production';

  // 生产环境必须显式配置；本地开发缺省指向本机 8080，方便直接联调。
  if (!rawBaseUrl && isProduction) return [];

  const baseUrl = rawBaseUrl ? normalizeBaseUrl(rawBaseUrl) : DEFAULT_BASE_URL;
  if (!baseUrl) {
    console.error(
      `[server-status] RCTMP_API_BASE_URL 不是合法的 http(s) 地址："${rawBaseUrl ?? ''}"，已忽略。`
    );
    return [];
  }

  const id = readTrimmedString(process.env.RCTMP_SERVER_ID) ?? DEFAULT_SERVER_ID;
  const name = readTrimmedString(process.env.RCTMP_SERVER_NAME) ?? defaultServerName(id);
  const apiKey = readTrimmedString(process.env.RCTMP_API_KEY) ?? undefined;

  return [
    {
      id,
      name,
      baseUrl,
      ...(apiKey ? { apiKey } : {}),
    },
  ];
}

/**
 * 读取服务器注册表。
 *
 * 优先级：
 * 1. RCTMP_SERVERS（JSON 数组）——多台服务器；
 * 2. RCTMP_API_BASE_URL / RCTMP_SERVER_ID / RCTMP_SERVER_NAME / RCTMP_API_KEY——单台；
 * 3. 非 production 环境且以上都没配时，回退到 http://127.0.0.1:8080。
 *
 * 解析失败不会抛异常，而是记录错误并降级到单台配置。
 * baseUrl 非法的条目会被过滤。
 */
export function getServerTargets(): ServerTarget[] {
  const rawList = readTrimmedString(process.env.RCTMP_SERVERS);

  if (rawList) {
    const parsed = parseServerList(rawList);
    if (parsed !== null) return parsed;
    console.error(
      '[server-status] RCTMP_SERVERS 解析失败，降级为 RCTMP_API_BASE_URL 单台配置。'
    );
  }

  return getSingleTarget();
}

function normalizeConfig(value: unknown): ServerConfig | null {
  if (!isRecord(value)) return null;

  return {
    ...value,
    port: readPort(value.port),
    maxPlayers: readCount(value.maxPlayers),
    snapshotHz: readNumber(value.snapshotHz),
    radius: readNumber(value.radius),
    maxNeighbors: readNumber(value.maxNeighbors),
    auth: typeof value.auth === 'boolean' ? value.auth : null,
  };
}

/**
 * players 原样透传（保留未来字段），只丢弃非对象条目。
 */
function normalizePlayers(value: unknown): ServerPlayer[] {
  if (!Array.isArray(value)) return [];

  const players: ServerPlayer[] = [];
  for (const entry of value) {
    if (isRecord(entry)) players.push(entry as unknown as ServerPlayer);
  }
  return players;
}

function normalizeStats(value: unknown): ServerStats | null {
  return isRecord(value) ? (value as unknown as ServerStats) : null;
}

/**
 * 将游戏服务器 `/status` 的原始 JSON 归一化成前端可安全消费的 ServerStatus。
 * 缺失字段用 null / 0 兜底，未知字段保留。
 */
export function normalizeStatus(raw: unknown, target: ServerTarget): ServerStatus {
  const record = isRecord(raw) ? raw : {};
  const config = normalizeConfig(record.config);
  const players = normalizePlayers(record.players);

  const online = readCount(record.online) ?? players.length;
  const capacity = readCount(record.capacity) ?? config?.maxPlayers ?? 0;

  return {
    id: readTrimmedString(record.id) ?? target.id,
    name: readTrimmedString(record.name) ?? target.name,
    region: readTrimmedString(record.region),
    game: readTrimmedString(record.game),
    version: readTrimmedString(record.version),
    protocolVersion: readNumber(record.protocolVersion),
    uptimeSec: readNonNegativeNumber(record.uptimeSec),
    capacity,
    online,
    avgNeighbors: readNumber(record.avgNeighbors),
    lastTickMs: readNumber(record.lastTickMs),
    config,
    players,
    stats: normalizeStats(record.stats),
    baseUrl: target.baseUrl,
  };
}

function buildStatusUrl(baseUrl: string, full: boolean): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/status`);
  if (full) url.searchParams.set('full', '1');
  return url.toString();
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

/**
 * 抓取单台游戏服务器的 `/status`。
 *
 * - 2500ms 超时（AbortSignal.timeout）
 * - cache: 'no-store'
 * - 配置了 apiKey 时带 `x-api-key`
 * - full=true 时追加 `?full=1`
 * - 任何异常都会转为 `{ ok: false, error }`，绝不抛出
 */
export async function fetchServerStatus(
  target: ServerTarget,
  options: { full?: boolean } = {}
): Promise<FetchServerStatusResult> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (target.apiKey) headers['x-api-key'] = target.apiKey;

  try {
    const url = buildStatusUrl(target.baseUrl, options.full === true);
    const response = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401) {
      return { ok: false, error: 'unauthorized' };
    }

    if (!response.ok) {
      return { ok: false, error: 'bad_response' };
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return { ok: false, error: 'bad_response' };
    }

    // 合法状态必须是一个 JSON 对象（而不是 null / 数组 / 字符串）。
    if (!isRecord(raw)) {
      return { ok: false, error: 'bad_response' };
    }

    return { ok: true, status: normalizeStatus(raw, target) };
  } catch (error) {
    if (isTimeoutError(error)) {
      return { ok: false, error: 'timeout' };
    }
    return { ok: false, error: 'network_error' };
  }
}
