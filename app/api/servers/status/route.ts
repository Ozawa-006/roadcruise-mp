import { NextResponse, type NextRequest } from 'next/server';
import {
  fetchServerStatus,
  getServerTargets,
  type FetchServerStatusResult,
  type ServerStatus,
  type ServerStatusError,
  type ServerTarget,
  type ServersStatusPayload,
} from '@/lib/server-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 2000;

type CacheEntry = {
  expires: number;
  payload: ServersStatusPayload;
};

// 模块级缓存：同一个 Next.js 进程内复用 2 秒，避免浏览器轮询放大成对游戏服务器的请求。
const payloadCache = new Map<string, CacheEntry>();
// 同一 cache key 的并发请求合并成一次上游抓取。
const inFlight = new Map<string, Promise<ServersStatusPayload>>();

function jsonResponse(payload: ServersStatusPayload): NextResponse {
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function emptyPayload(configured: boolean): ServersStatusPayload {
  return {
    servers: [],
    errors: [],
    fetchedAt: new Date().toISOString(),
    configured,
  };
}

function buildCacheKey(targets: ServerTarget[], full: boolean): string {
  const mode = full ? 'full' : 'brief';
  const servers = targets.map((target) => `${target.id}@${target.baseUrl}`).join(',');
  return `${mode}|${servers}`;
}

function pruneExpiredCache(now: number): void {
  for (const [key, entry] of payloadCache) {
    if (entry.expires <= now) payloadCache.delete(key);
  }
}

async function fetchTarget(
  target: ServerTarget,
  full: boolean
): Promise<{ target: ServerTarget; result: FetchServerStatusResult }> {
  try {
    return { target, result: await fetchServerStatus(target, { full }) };
  } catch (error) {
    // fetchServerStatus 承诺不抛异常；这里只是防止未来改动引入的意外把整轮抓取打挂。
    console.error(`[api/servers/status] 抓取 ${target.id} 时出现未预期异常：`, error);
    return { target, result: { ok: false, error: 'bad_response' } };
  }
}

async function loadServers(
  targets: ServerTarget[],
  full: boolean
): Promise<ServersStatusPayload> {
  const results = await Promise.all(
    targets.map((target) => fetchTarget(target, full))
  );

  const servers: ServerStatus[] = [];
  const errors: ServerStatusError[] = [];

  for (const { target, result } of results) {
    if (result.ok) {
      servers.push(result.status);
    } else {
      errors.push({ id: target.id, error: result.error });
    }
  }

  return {
    servers,
    errors,
    fetchedAt: new Date().toISOString(),
    configured: targets.length > 0,
  };
}

function failedPayload(targets: ServerTarget[]): ServersStatusPayload {
  return {
    servers: [],
    errors: targets.map((target) => ({ id: target.id, error: 'bad_response' })),
    fetchedAt: new Date().toISOString(),
    configured: true,
  };
}

/**
 * GET /api/servers/status
 *
 * Query:
 * - `id=<server-id>`：只看一台服务器（未知 id 返回 errors + unknown_server）
 * - `full=1`：透传给游戏服务器的 `/status?full=1`，返回全部在线玩家
 *
 * 响应永远 200（单台失败只体现在 errors 中），且 `Cache-Control: no-store`。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const allTargets = getServerTargets();

  // 生产环境没有配置 / RCTMP_SERVERS=[] 时，明确告知前端“未配置”。
  if (allTargets.length === 0) {
    return jsonResponse(emptyPayload(false));
  }

  const idFilter = request.nextUrl.searchParams.get('id')?.trim() ?? '';
  const full = request.nextUrl.searchParams.get('full') === '1';

  const targets = idFilter
    ? allTargets.filter((target) => target.id === idFilter)
    : allTargets;

  if (targets.length === 0) {
    return jsonResponse({
      servers: [],
      errors: [{ id: idFilter, error: 'unknown_server' }],
      fetchedAt: new Date().toISOString(),
      configured: true,
    });
  }

  const now = Date.now();
  pruneExpiredCache(now);

  const cacheKey = buildCacheKey(targets, full);
  const cached = payloadCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return jsonResponse(cached.payload);
  }

  const pending = inFlight.get(cacheKey);
  if (pending) {
    return jsonResponse(await pending);
  }

  const promise = loadServers(targets, full)
    .catch((error: unknown) => {
      console.error('[api/servers/status] 抓取服务器状态失败：', error);
      return failedPayload(targets);
    })
    .then((payload) => {
      payloadCache.set(cacheKey, {
        expires: Date.now() + CACHE_TTL_MS,
        payload,
      });
      return payload;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, promise);

  return jsonResponse(await promise);
}
