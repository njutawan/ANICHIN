/**
 * Unit tests for the rate limiter.
 *
 * checkRateLimit is async (Redis or in-memory store). In the test environment
 * no REDIS_URL is configured, so the in-memory fallback is used. The in-memory
 * store is shared across the test process, so each test uses a unique client IP
 * and calls resetRateLimit in beforeEach to guarantee isolation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { resetRateLimit } from '@/lib/rate-limit-store';

// Each test gets a unique IP so the shared in-memory store doesn't bleed state.
let ipCounter = 0;
function uniqueIp(): string {
  ipCounter += 1;
  // 198.51.100.0/24 is TEST-NET-2 (RFC 5737) — safe for tests.
  return `198.51.100.${(ipCounter % 250) + 1}`;
}

function makeReq(ip: string): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    headers: { 'x-forwarded-for': ip },
  });
}

describe('checkRateLimit', () => {
  let ip: string;
  let req: NextRequest;

  beforeEach(async () => {
    ip = uniqueIp();
    req = makeReq(ip);
    await resetRateLimit(`${ip}:read`);
  });

  it('allows requests under limit', async () => {
    const result = await checkRateLimit(req, 'read');
    expect(result).toBeNull();
  });

  it('allows up to the read limit (60 req/60s)', async () => {
    for (let i = 0; i < 60; i++) {
      const r = await checkRateLimit(req, 'read');
      expect(r).toBeNull();
    }
  });

  it('blocks requests over limit', async () => {
    // Make 60 requests (read limit is 60/min) — all allowed.
    for (let i = 0; i < 60; i++) {
      await checkRateLimit(req, 'read');
    }
    // The 61st request should be blocked.
    const result = await checkRateLimit(req, 'read');
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
  });

  it('returns 429 response with rate limit headers', async () => {
    for (let i = 0; i < 60; i++) {
      await checkRateLimit(req, 'read');
    }
    const result = await checkRateLimit(req, 'read');
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
    expect(result?.headers.get('Retry-After')).toBeTruthy();
    expect(result?.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(result?.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('respects expensive tier (10 req/60s)', async () => {
    await resetRateLimit(`${ip}:expensive`);
    for (let i = 0; i < 10; i++) {
      const r = await checkRateLimit(req, 'expensive');
      expect(r).toBeNull();
    }
    const blocked = await checkRateLimit(req, 'expensive');
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('X-RateLimit-Limit')).toBe('10');
  });
});

describe('addRateLimitHeaders', () => {
  it('adds rate limit headers to a response', () => {
    const res = NextResponse.json({ ok: true });
    addRateLimitHeaders(res, 'read');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(res.headers.get('X-RateLimit-Policy')).toBe('60;w=60');
  });

  it('respects the auth tier (20 req/60s)', () => {
    const res = NextResponse.json({ ok: true });
    addRateLimitHeaders(res, 'auth');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(res.headers.get('X-RateLimit-Policy')).toBe('20;w=60');
  });

  it('respects the search tier (30 req/60s)', () => {
    const res = NextResponse.json({ ok: true });
    addRateLimitHeaders(res, 'search');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('30');
  });

  it('respects the expensive tier (10 req/60s)', () => {
    const res = NextResponse.json({ ok: true });
    addRateLimitHeaders(res, 'expensive');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
  });

  it('returns the same response instance (mutates in place)', () => {
    const res = NextResponse.json({ ok: true });
    const returned = addRateLimitHeaders(res, 'read');
    expect(returned).toBe(res);
  });
});
