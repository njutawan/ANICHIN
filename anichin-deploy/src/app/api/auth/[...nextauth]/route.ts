import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * NextAuth route handler with rate limiting.
 * Auth endpoints are attractive targets for brute-force / credential stuffing,
 * so we apply a dedicated stricter tier.
 *
 * Note: NextAuth's handler signature is (req, ctx) — we pass both through.
 */
const authHandler = NextAuth(authOptions);

type RouteContext = { params: Promise<{ nextauth: string[] }> };

async function wrappedHandler(req: NextRequest, ctx: RouteContext) {
  const { checkRateLimit, addRateLimitHeaders } = await import('@/lib/rate-limit');

  // Parse the nextauth route segments to identify the action
  const params = await ctx.params;
  const action = params.nextauth?.[0] ?? '';

  // Don't rate-limit passive session checks (GET /api/auth/session, /csrf, /providers)
  // These are called frequently by the client and must always return valid JSON.
  // Only rate-limit mutating/sensitive actions: signin, callback, signout
  const PASSIVE_ACTIONS = new Set(['session', 'csrf', 'providers']);
  const isPassive = req.method === 'GET' && PASSIVE_ACTIONS.has(action);

  if (!isPassive) {
    // Auth tier: 20/min per IP — allows CSRF + callback + signout
    const limited = await checkRateLimit(req, 'auth');
    if (limited) return limited;
  }

  // Delegate to NextAuth — it expects (req, ctx) in App Router
  const res = await authHandler(req, ctx);
  if (res instanceof NextResponse) {
    return addRateLimitHeaders(res, 'auth');
  }
  return res;
}

export { wrappedHandler as GET, wrappedHandler as POST };
