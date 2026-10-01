import { NextRequest, NextResponse } from 'next/server';
import {
  incrementRateLimit,
  getRateLimitTTL,
} from '@/lib/rate-limit-store';

/**
 * Rate limiter for Next.js API routes.
 *
 * Backend: Redis (if REDIS_URL set) or in-memory (dev fallback).
 *
 * Tiers:
 *   auth      — 20 req/60s (CSRF + callback + session checks)
 *   search    — 30 req/60s (prevent scraping)
 *   read      — 60 req/60s (general read endpoints)
 *   expensive — 10 req/60s (random/analytics/register)
 *
 * Note: this is async now (Redis I/O). Call with `await`.
 */

const RATE_LIMITS = {
  auth: { max: 20, windowMs: 60_000 },
  search: { max: 30, windowMs: 60_000 },
  read: { max: 60, windowMs: 60_000 },
  expensive: { max: 10, windowMs: 60_000 },
} as const;
export type RateLimitType = keyof typeof RATE_LIMITS;


/**
 * Get client IP from request (Caddy passes X-Forwarded-For / X-Real-IP).
 */
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
  return ip.slice(0, 64);
}

/**
 * Check rate limit for a given request.
 * Returns null if allowed, or a NextResponse with 429 if rate limited.
 *
 * @example
 * const limited = await checkRateLimit(req, 'search');
 * if (limited) return limited;
 */
export async function checkRateLimit(
  req: NextRequest,
  type: RateLimitType = 'read'
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const config = RATE_LIMITS[type];
  const key = `${ip}:${type}`;

  const count = await incrementRateLimit(key, config.windowMs);

  if (count > config.max) {
    const ttlMs = await getRateLimitTTL(key);
    const retryAfter = Math.ceil(ttlMs / 1000);
    return NextResponse.json(
      {
        error: 'Terlalu banyak permintaan. Coba lagi nanti.',
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil((Date.now() + ttlMs) / 1000)),
        },
      }
    );
  }

  return null;
}

/**
 * Add rate limit headers to a successful response.
 */
export function addRateLimitHeaders(
  response: NextResponse,
  type: RateLimitType = 'read'
): NextResponse {
  const config = RATE_LIMITS[type];
  response.headers.set('X-RateLimit-Limit', String(config.max));
  response.headers.set('X-RateLimit-Policy', `${config.max};w=${config.windowMs / 1000}`);
  return response;
}
