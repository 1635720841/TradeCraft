/**
 * 按 org 限流配置。
 *
 * 边界：
 * - 不负责：Redis 计数（RateLimitService）
 *
 * 入口：
 * - isRateLimitEnabled / readOrgRateLimitOptions
 */

export interface OrgRateLimitOptions {
  maxRequests: number;
  windowSec: number;
}

export function isRateLimitEnabled(): boolean {
  return process.env.RATE_LIMIT_ENABLED !== 'false';
}

export function readOrgRateLimitOptions(): OrgRateLimitOptions {
  return {
    maxRequests: parsePositiveInt(process.env.RATE_LIMIT_ORG_MAX, 120),
    windowSec: parsePositiveInt(process.env.RATE_LIMIT_ORG_WINDOW_SEC, 60),
  };
}

export function buildOrgRateLimitKey(organizationId: string, windowSec: number, nowMs = Date.now()): string {
  const windowIndex = Math.floor(nowMs / (windowSec * 1000));
  return `rate:org:${organizationId}:${windowIndex}`;
}

export function buildPublicRateLimitKey(clientIp: string, windowSec: number, nowMs = Date.now()): string {
  const windowIndex = Math.floor(nowMs / (windowSec * 1000));
  return `rate:public:${clientIp}:${windowIndex}`;
}

export function readPublicRateLimitOptions(): OrgRateLimitOptions {
  return {
    maxRequests: parsePositiveInt(process.env.RATE_LIMIT_PUBLIC_MAX, 30),
    windowSec: parsePositiveInt(process.env.RATE_LIMIT_PUBLIC_WINDOW_SEC, 60),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
