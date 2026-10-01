import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

// GET /api/admin/audit-logs — read recent audit log entries (newest first, max 100)
// On Vercel/serverless: returns in-memory buffer only (per-invocation)
// On Docker/self-hosted: returns file-based logs (persistent across restarts)
export async function GET(req: NextRequest) {
  try {
    const [, authErr] = await requireAdmin(req);
    if (authErr) return authErr;

    const limited = await checkRateLimit(req, 'expensive');
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      500,
      Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100)
    );

    // Try file-based logs first (Docker/self-hosted), fall back to in-memory (Vercel)
    let entries: any[] = auditLog.readFromFile(limit);

    // If file logs empty (or serverless), use in-memory buffer
    if (entries.length === 0) {
      entries = auditLog.getRecent(limit).reverse(); // newest first
    }

    const filePath = auditLog.getLogFilePath();

    return addRateLimitHeaders(
      NextResponse.json({
        logs: entries,
        total: entries.length,
        source: auditLog.isFileLoggingEnabled() ? 'file' : 'memory',
        file: filePath, // null on Vercel
        note: auditLog.isFileLoggingEnabled()
          ? undefined
          : 'Running on serverless — only in-memory logs available for this invocation',
      }),
      'expensive'
    );
  } catch (err) {
    logger.error('admin/audit-logs GET failed', {
      error: err instanceof Error ? err.message : String(err),
      module: 'api/admin/audit-logs',
    });
    return NextResponse.json(
      { error: 'Gagal memuat audit log.' },
      { status: 500 }
    );
  }
}
