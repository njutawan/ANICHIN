/**
 * API tests for GET /api/health.
 *
 * Covers:
 *   - Returns 200 with status="ok" when the DB ping succeeds
 *   - Returns 503 with status="unhealthy" when the DB throws
 *   - Response body includes status, uptime, checks
 *   - Memory check flips to "fail" when RSS exceeds MAX_MEMORY_MB
 *   - Cache-Control headers are set to prevent caching
 *
 * Mocks:
 *   - @/lib/db → $queryRaw spy (resolved or rejected per test)
 *   - @/lib/rate-limit-store → checkRedisHealth spy
 *
 * Runs in the node environment (vitest default) — no jsdom, no DOM globals.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mocks (hoisted) ─────────────────────────────────────────────────────────

const { dbMock, checkRedisHealthMock } = vi.hoisted(() => ({
  dbMock: { $queryRaw: vi.fn() },
  checkRedisHealthMock: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/rate-limit-store', () => ({ checkRedisHealth: checkRedisHealthMock }));

// ── Component under test ────────────────────────────────────────────────────

import { GET } from './route';

describe('GET /api/health', () => {
  beforeEach(() => {
    dbMock.$queryRaw.mockReset();
    checkRedisHealthMock.mockReset();
    // Default happy-path mocks.
    dbMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    checkRedisHealthMock.mockResolvedValue({ configured: false, connected: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns 200 with status="ok" when the DB ping succeeds', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('returns 503 with status="unhealthy" when the DB throws', async () => {
    dbMock.$queryRaw.mockRejectedValue(new Error('Connection refused'));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('unhealthy');
    expect(body.checks.db.status).toBe('fail');
    expect(body.checks.db.error).toBe('Connection refused');
  });

  it('response body includes status, uptime, and checks', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('environment');
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('db');
    expect(body.checks).toHaveProperty('memory');
    expect(body.checks).toHaveProperty('redis');
    // Uptime is a number (seconds since process start).
    // Note: in the test worker, process.uptime() can be 0 (rounded), so we
    // only assert the type and non-negativity here, not that it is > 0.
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('reports db latency in milliseconds on success', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.checks.db.status).toBe('ok');
    expect(body.checks.db).toHaveProperty('latencyMs');
    expect(typeof body.checks.db.latencyMs).toBe('number');
    expect(body.checks.db.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports memory status ok when RSS is below the configured limit', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.checks.memory.status).toBe('ok');
    expect(body.checks.memory).toHaveProperty('latencyMs');
  });

  it('flips memory check to fail when RSS exceeds MAX_MEMORY_MB', async () => {
    // process.memoryUsage() can't be easily faked — but we can set a tiny
    // MAX_MEMORY_MB (1 MB) so the real RSS (always > 1 MB) trips the check.
    vi.stubEnv('MAX_MEMORY_MB', '1');
    const res = await GET();
    const body = await res.json();
    expect(body.checks.memory.status).toBe('fail');
    // Overall response must be 503 because one check failed.
    expect(res.status).toBe(503);
  });

  it('reports redis check ok when checkRedisHealth returns not-configured', async () => {
    checkRedisHealthMock.mockResolvedValue({ configured: false, connected: false });
    const res = await GET();
    const body = await res.json();
    expect(body.checks.redis.status).toBe('ok');
  });

  it('reports redis check ok when checkRedisHealth returns connected', async () => {
    checkRedisHealthMock.mockResolvedValue({ configured: true, connected: true });
    const res = await GET();
    const body = await res.json();
    expect(body.checks.redis.status).toBe('ok');
  });

  it('reports redis check fail when configured but not connected', async () => {
    checkRedisHealthMock.mockResolvedValue({ configured: true, connected: false });
    const res = await GET();
    const body = await res.json();
    expect(body.checks.redis.status).toBe('fail');
    expect(res.status).toBe(503);
  });

  it('sets no-cache headers so load balancers always re-fetch', async () => {
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
    expect(res.headers.get('Pragma')).toBe('no-cache');
    expect(res.headers.get('Expires')).toBe('0');
  });

  it('returns 503 when db fails but redis is healthy (overall = unhealthy)', async () => {
    dbMock.$queryRaw.mockRejectedValue(new Error('timeout'));
    checkRedisHealthMock.mockResolvedValue({ configured: true, connected: true });
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.db.status).toBe('fail');
    expect(body.checks.redis.status).toBe('ok');
    expect(body.checks.memory.status).toBe('ok');
  });
});
