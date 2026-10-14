import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRedisHealth } from '@/lib/rate-limit-store';
import { logger } from '@/lib/logger';

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
 * Response body: { status, uptime, timestamp, checks }
 *
 * F-13 (docs/SECURITY-AUDIT.md): endpoint ini publik dan tanpa auth, jadi
 * isinya dibatasi ke yang benar-benar dipakai monitoring:
 *   - `version` dan `environment` DIHAPUS — keduanya memberi penyerang peta
 *     versi (CVE yang berlaku) dan menandai apakah instance ini staging/produksi.
 *   - RSS proses kini dilaporkan sebagai `rssMb` (angka yang jelas), bukan
 *     diselipkan ke field `latencyMs` (menyesatkan: latensi vs byte).
 *   - status Redis cukup `{ status, configured }` tanpa latensi palsu (0/1).
 *
 * No rate limiting — load balancers poll this frequently.
 */
export async function GET() {
  const checks: Record<string, { status: 'ok' | 'fail'; latencyMs?: number; error?: string }> = {};

  // --- Database check ---
  // SECURITY: hanya kode generik yang dikirim ke klien. Pesan error Prisma
  // mentah bisa memuat host/port/nama database/kredensial — sebelumnya bocor
  // dari endpoint publik tanpa auth ini. Detail lengkap hanya ke server log.
  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.db = { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    logger.error('[health] database check failed', {
      module: 'api/health',
      error: err instanceof Error ? err.message : String(err),
    });
    checks.db = { status: 'fail', error: 'DB_UNAVAILABLE' };
  }

  // --- Memory check (Node.js process RSS) ---
  // Threshold configurable via MAX_MEMORY_MB env (default 3072MB = 3GB for dev Turbopack).
  // Dev (Turbopack) uses ~2.2GB; production standalone uses ~150-300MB.
  const mem = process.memoryUsage();
  const memLimitMB = Number(process.env.MAX_MEMORY_MB ?? '3072');
  const memLimit = memLimitMB * 1024 * 1024;
  const memory = {
    status: (mem.rss < memLimit ? 'ok' : 'fail') as 'ok' | 'fail',
    // F-13: angka RSS yang jujur (MB), bukan disamarkan sebagai `latencyMs`.
    rssMb: Math.round(mem.rss / (1024 * 1024)),
  };

  // --- Redis check (rate limiter backend) ---
  const redisHealth = await checkRedisHealth();
  const redis = {
    status: (!redisHealth.configured || redisHealth.connected
      ? 'ok'
      : 'fail') as 'ok' | 'fail',
    configured: redisHealth.configured,
  };

  // --- Overall status ---
  const allOk =
    Object.values(checks).every((c) => c.status === 'ok') &&
    memory.status === 'ok' &&
    redis.status === 'ok';
  const status = allOk ? 'ok' : 'unhealthy';
  const httpStatus = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        ...checks,
        memory,
        redis,
      },
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
