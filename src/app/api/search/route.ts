import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit-log';
import { getClientIp } from '@/lib/ip';

export const dynamic = 'force-dynamic';

// Input sanitization — strip HTML tags and limit length
function sanitizeInput(input: string): string {
  return input
    .trim()
    .slice(0, 100) // Limit to 100 chars to prevent abuse
    .replace(/[<>\"'{}|\\^`]/g, ''); // Strip potentially dangerous chars
}

// Detect suspicious patterns (path traversal, SQL injection attempts)
function detectSuspicious(input: string): boolean {
  const patterns = [
    /\.\.\//,           // Path traversal
    /(\.\.\/)+/,        // Extended path traversal
    /union\s+select/i,  // SQL injection
    /<script/i,         // XSS attempt
    /javascript:/i,     // JavaScript protocol injection
    /on\w+\s*=/i,       // Event handler injection
  ];
  return patterns.some((p) => p.test(input));
}

export async function GET(req: NextRequest) {
  try {
    // --- Rate limiting ---
    const limited = await checkRateLimit(req, 'search');
    if (limited) {
      const ip = getClientIp(req);
      await auditLog.rateLimitHit(ip, '/api/search', 'search');
      return limited;
    }

    const { searchParams } = new URL(req.url);
    const rawQ = searchParams.get('q') || '';
    const q = sanitizeInput(rawQ);

    if (!q || q.length < 2) {
      return addRateLimitHeaders(NextResponse.json({ results: [] }), 'search');
    }

    // --- Suspicious request detection ---
    if (detectSuspicious(rawQ)) {
      const ip = getClientIp(req);
      await auditLog.suspiciousRequest(ip, '/api/search', 'injection_attempt');
      return addRateLimitHeaders(
        NextResponse.json({ error: 'Invalid request.' }, { status: 400 }),
        'search'
      );
    }

    // Use Prisma's parameterized queries — no SQL injection possible
    const results = await db.anime.findMany({
      where: {
        OR: [
          { title: { contains: q } },
          { titleEn: { contains: q } },
          { titleJp: { contains: q } },
        ],
      },
      take: 20,
      orderBy: { views: 'desc' },
      include: { genres: { include: { genre: true } } },
    });

    const response = NextResponse.json({
      results: results.map(a => ({
        ...a,
        genres: a.genres.map(g => g.genre.name),
      })),
    });

    // Cache search results for 30s (shorter than other endpoints — search queries vary)
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

    return addRateLimitHeaders(response, 'search');
  } catch {
    // Don't leak error details to client — log internally
    await auditLog.apiError('/api/search', 'GET', 500, 'Search failed');
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}
