import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Web Vitals collector endpoint — receives Core Web Vitals metrics from client.
 *
 * POST /api/web-vitals
 * Body: { name, value, rating, id, page, ts }
 *
 * In production, this should:
 * - Write to time-series DB (Postgres timeseries, ClickHouse, InfluxDB)
 * - Or forward to Vercel Analytics / Google Analytics / Datadog / Sentry
 *
 * Currently: logs to stdout (captured by Docker logs / pm2 / systemd journal).
 * No rate limit — beacon requests are infrequent (1 per page load per metric).
 */

export const dynamic = 'force-dynamic';

const VALID_METRICS = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);
const MAX_BODY_SIZE = 2048;

export async function POST(req: NextRequest) {
  try {
    // Body size guard
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    const { name, value, rating, id, page } = body as Record<string, unknown>;

    // Validate
    if (typeof name !== 'string' || !VALID_METRICS.has(name)) {
      return NextResponse.json({ error: 'Invalid metric name' }, { status: 400 });
    }
    if (typeof value !== 'number' || value < 0 || value > 60000) {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
    }
    if (typeof page !== 'string' || page.length > 500) {
      return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
    }

    // Structured log (captured by container logs / journald)
    // Format: JSON line for easy parsing by log aggregators
    const logEntry = JSON.stringify({
      type: 'web-vital',
      metric: name,
      value: Math.round(value),
      rating,
      id: typeof id === 'string' ? id.slice(0, 64) : undefined,
      page: page.slice(0, 500),
      ts: Date.now(),
    });
    logger.info(logEntry);

    // 204 No Content — beacon doesn't need a response body
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: 'Failed to record metric' },
      { status: 500 }
    );
  }
}
