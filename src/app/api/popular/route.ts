import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getPopular } from '@/lib/data/home';

/** Ranking anime populer (sidebar beranda). */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, 'read');
  if (limited) return limited;

  try {
    return NextResponse.json(await getPopular());
  } catch (_e) {
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
