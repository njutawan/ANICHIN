import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getStats } from '@/lib/data/home';

/** Statistik agregat situs (jumlah anime, episode, views). */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, 'read');
  if (limited) return limited;

  try {
    return NextResponse.json(await getStats());
  } catch (_e) {
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
