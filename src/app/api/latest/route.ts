import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getLatestEpisodes } from '@/lib/data/home';

/**
 * Riwayat rilisan episode (paginasi).
 *
 * Logika query ada di `src/lib/data/home.ts` (dipakai bersama prefetch RSC
 * homepage) dan di-cache `unstable_cache` — route ini hanya menangani rate
 * limit + bentuk respons HTTP.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, 'read');
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(60, Math.max(1, parseInt(searchParams.get('limit') || '24', 10)));

    return NextResponse.json(await getLatestEpisodes(page, limit));
  } catch (_e) {
    // Jangan bocorkan detail error internal ke client
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
