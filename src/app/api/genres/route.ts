import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGenres } from '@/lib/data/home';

/** Semua genre + jumlah anime per genre. */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, 'read');
  if (limited) return limited;

  try {
    return NextResponse.json(await getGenres());
  } catch (_e) {
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
