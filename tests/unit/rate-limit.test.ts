// =============================================================================
// rate-limit.test.ts — 内存限流器单元测试
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  getClientIp,
  hitRateLimit,
  isRateLimited,
  rateLimitResponse,
  clearRateLimits,
} from "@/lib/rate-limit";

const WINDOW = 60_000;
const OPTIONS = { limit: 3, windowMs: WINDOW };

beforeEach(() => {
  clearRateLimits();
});

describe("hitRateLimit / isRateLimited", () => {
  it("limit 内放行，超过 limit 后拦截", () => {
    expect(hitRateLimit("k", OPTIONS).ok).toBe(true); // 1
    expect(hitRateLimit("k", OPTIONS).ok).toBe(true); // 2
    expect(hitRateLimit("k", OPTIONS).ok).toBe(true); // 3
    const over = hitRateLimit("k", OPTIONS); // 4
    expect(over.ok).toBe(false);
    expect(over.retryAfterSec).toBeGreaterThan(0);
  });

  it("不同 key 相互独立", () => {
    hitRateLimit("a", OPTIONS);
    hitRateLimit("a", OPTIONS);
    hitRateLimit("a", OPTIONS);
    expect(hitRateLimit("b", OPTIONS).ok).toBe(true); // b 未用过
  });

  it("isRateLimited 只读不计数", () => {
    hitRateLimit("k", OPTIONS); // 1
    hitRateLimit("k", OPTIONS); // 2
    expect(isRateLimited("k", OPTIONS).ok).toBe(true); // 仍是 2
    expect(hitRateLimit("k", OPTIONS).ok).toBe(true); // 3
    expect(isRateLimited("k", OPTIONS).ok).toBe(true); // 3 ≤ 3
    expect(isRateLimited("k", OPTIONS).ok).toBe(true); // 仍不计数
    const over = hitRateLimit("k", OPTIONS); // 4 → 超
    expect(over.ok).toBe(false);
  });

  it("窗口过期后重置计数", () => {
    // 直接构造一个已过期桶：先借 windowMs 非常小模拟，或手动改写内部状态不便，
    // 这里用一个短窗口验证过期逻辑
    hitRateLimit("exp", { limit: 1, windowMs: -1 }); // 负窗口 → resetAt 在过去
    expect(hitRateLimit("exp", { limit: 1, windowMs: -1 }).ok).toBe(true); // 旧桶过期，重建
  });

  it("clearRateLimits 后计数清零", () => {
    hitRateLimit("k", OPTIONS);
    hitRateLimit("k", OPTIONS);
    hitRateLimit("k", OPTIONS);
    clearRateLimits();
    expect(hitRateLimit("k", OPTIONS).ok).toBe(true);
  });
});

describe("getClientIp", () => {
  function makeReq(ip: string): NextRequest {
    return new NextRequest("http://localhost/api/auth/register", {
      headers: { "X-Forwarded-For": ip },
    });
  }

  it("取 X-Forwarded-For 最后一项（防伪造头绕过）", () => {
    // 攻击者伪造 X-Forwarded-For: <fake>，nginx 追加真实 remote_addr 到末尾
    expect(getClientIp(makeReq("203.0.113.7, 203.0.113.200"))).toBe("203.0.113.200");
    // 未附加时直接取末项（等于唯一值）
    expect(getClientIp(makeReq("1.2.3.4"))).toBe("1.2.3.4");
  });

  it("无 X-Forwarded-For 时回退 x-real-ip / unknown", () => {
    const noHeader = new NextRequest("http://localhost/api/auth/register");
    expect(getClientIp(noHeader)).toBe("unknown");

    const realIp = new NextRequest("http://localhost/api/auth/register", {
      headers: { "X-Real-IP": "9.9.9.9" },
    });
    expect(getClientIp(realIp)).toBe("9.9.9.9");
  });
});

describe("rateLimitResponse", () => {
  it("返回 429 + Retry-After + 统一错误码", () => {
    const res = rateLimitResponse(120);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    return res.json().then((json) => {
      expect(json.error.code).toBe("TOO_MANY_REQUESTS");
    });
  });
});
