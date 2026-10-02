import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTodayEpisodes } from '@/lib/data/home';

/** Episode yang rilis dalam 24 jam terakhir (beranda "Episode Hari Ini"). */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, 'read');
  if (limited) return limited;

  try {
    return NextResponse.json(await getTodayEpisodes());
  } catch (_e) {
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
