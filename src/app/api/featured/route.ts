import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getFeatured } from '@/lib/data/home';

/** Anime unggulan (hero slider & trailer). */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, 'read');
  if (limited) return limited;

  try {
    return NextResponse.json(await getFeatured());
  } catch {
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
