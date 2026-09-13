import { NextResponse } from 'next/server';
import { checkRateLimit, addRateLimitHeaders } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const limited = await checkRateLimit(req as any, 'read');
  if (limited) return limited;
  return addRateLimitHeaders(
    NextResponse.json({ status: 'ok', service: 'AniChin API' }),
    'read'
  );
}
