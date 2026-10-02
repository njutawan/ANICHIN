import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { listAnime } from '@/lib/data/home';

/**
 * Daftar anime dengan filter (genre/tipe/status/slug), urutan, dan paginasi.
 * Dipakai rail homepage, AnimeBrowseSection, dan halaman bookmark.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, 'read');
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    return NextResponse.json(
      await listAnime({
        genre: searchParams.get('genre'),
        type: searchParams.get('type'),
        status: searchParams.get('status'),
        slugs: searchParams.get('slugs'),
        sort: searchParams.get('sort') || 'latest',
        page: Math.max(1, parseInt(searchParams.get('page') || '1', 10)),
        limit: Math.min(48, Math.max(1, parseInt(searchParams.get('limit') || '18', 10))),
      })
    );
  } catch (_e) {
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
