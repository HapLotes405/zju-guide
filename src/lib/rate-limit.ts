import { NextResponse, type NextRequest } from "next/server";

// =============================================================================
// rate-limit.ts — 轻量内存滑动窗口限流
//
// 适用场景：next start 单实例（生产拓扑即如此）。PM2 重启后计数清零，可接受。
// 若未来横向扩展到多实例，需替换为外部存储（Redis 等）。
// 真实客户端 IP 依赖 nginx 透传（见生产部署拓扑 mse-wiki 配置：
//   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for）。
// =============================================================================

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 桶数硬上限，防止恶意 key 导致内存无限增长；超限时先清理已过期桶 */
const MAX_BUCKETS = 20_000;

export interface RateLimitOptions {
  limit: number; // 窗口内允许的最大次数
  windowMs: number; // 窗口长度（毫秒）
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number; // 被限流时建议重试秒数（ok 时为 0）
}

/**
 * 取真实客户端 IP。
 * 取 X-Forwarded-For 的**最后**一项：nginx 用 $proxy_add_x_forwarded_for 把
 * 真实 $remote_addr 追加在末尾，因此末项是可信的；取首项会被客户端伪造的头绕过。
 */
export function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",");
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  // 直接连本机（如本地 next dev、内网直连 3000）时无任何 IP 头 → 统一归 "unknown"。
  // 生产流量必经 nginx，X-Forwarded-For 一定存在。
  return "unknown";
}

/** 记录一次访问；未超限返回 ok，超限返回建议重试秒数。 */
export function hitRateLimit(
  key: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    if (buckets.size > MAX_BUCKETS) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }
    return { ok: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count <= opts.limit) {
    return { ok: true, retryAfterSec: 0 };
  }
  return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
}

/** 只读检查是否已超限（不计数），用于请求入口的提前拦截。 */
export function isRateLimited(
  key: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return { ok: true, retryAfterSec: 0 };
  if (bucket.count <= opts.limit) return { ok: true, retryAfterSec: 0 };
  return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
}

/** 统一的 429 响应（含 Retry-After）。 */
export function rateLimitResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "TOO_MANY_REQUESTS",
        message: `操作太频繁，请 ${Math.max(1, Math.ceil(retryAfterSec / 60))} 分钟后再试`,
      },
    },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, retryAfterSec)) },
    },
  );
}

/** 清空全部限流计数（供测试 beforeEach 重置，避免跨用例互相干扰）。 */
export function clearRateLimits(): void {
  buckets.clear();
}
