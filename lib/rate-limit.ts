/**
 * 极简内存限流（P1 兜底）。
 *
 * ⚠️ 限制说明：Vercel Serverless 每个实例有独立内存，冷启动/多实例时
 * 计数不会共享，所以它只能挡住“单实例上的高频刷接口”，不能替代
 * Upstash/Redis 级别的分布式限流。真正的强限流建议后续接 Upstash。
 *
 * 用途：Steam 登录/回调/绑定、服务器状态代理等外部请求放大点。
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

export interface RateLimitResult {
  ok: boolean;
  /** 需要等待的秒数（仅 ok=false 时有意义） */
  retryAfter: number;
}

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * @param key    限流键（通常 scope + IP）
 * @param limit  窗口内允许次数
 * @param windowMs 窗口长度（毫秒）
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** 从请求头里取客户端标识（Vercel 会带 x-forwarded-for） */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const first = forwarded.split(',')[0]?.trim();
  const ip = first || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

/** 统一 429 响应（带 Retry-After） */
export function rateLimitedResponse(retryAfter: number): Response {
  return new Response('Too Many Requests', {
    status: 429,
    headers: {
      'Retry-After': String(retryAfter),
      'Cache-Control': 'no-store',
    },
  });
}
