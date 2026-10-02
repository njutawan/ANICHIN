import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCollections } from '@/lib/data/home';

/** Koleksi kurasi (themed groupings) untuk beranda. */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, 'expensive');
  if (limited) return limited;

  try {
    return NextResponse.json(await getCollections());
  } catch (_e) {
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
