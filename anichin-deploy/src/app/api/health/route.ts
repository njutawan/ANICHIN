import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRedisHealth } from '@/lib/rate-limit-store';

// Health check should never be cached or rate-limited (load balancer polls frequently)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Health check endpoint — for uptime monitoring, load balancer, Kubernetes liveness/readiness.
 *
 * Returns:
 *   200 OK — service healthy (DB reachable, memory OK)
 *   503    — service unhealthy (DB down or other critical failure)
 *
 * Response body: { status, uptime, timestamp, version, environment, checks }
 *
 * No rate limiting — load balancers poll this frequently.
 */
export async function GET() {
  const checks: Record<string, { status: 'ok' | 'fail'; latencyMs?: number; error?: string }> = {};

  // --- Database check ---
  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.db = { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    checks.db = { status: 'fail', error: err instanceof Error ? err.message : 'unknown' };
  }

  // --- Memory check (Node.js process RSS) ---
  // Threshold configurable via MAX_MEMORY_MB env (default 3072MB = 3GB for dev Turbopack).
  // Dev (Turbopack) uses ~2.2GB; production standalone uses ~150-300MB.
  const mem = process.memoryUsage();
  const memLimitMB = Number(process.env.MAX_MEMORY_MB ?? '3072');
  const memLimit = memLimitMB * 1024 * 1024;
  checks.memory = {
    status: mem.rss < memLimit ? 'ok' : 'fail',
    latencyMs: mem.rss,
  };

  // --- Redis check (rate limiter backend) ---
  const redisHealth = await checkRedisHealth();
  checks.redis = {
    status: !redisHealth.configured || redisHealth.connected ? 'ok' : 'fail',
    latencyMs: redisHealth.configured ? (redisHealth.connected ? 1 : 0) : 0,
  };

  // --- Overall status ---
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const status = allOk ? 'ok' : 'unhealthy';
  const httpStatus = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      checks,
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
