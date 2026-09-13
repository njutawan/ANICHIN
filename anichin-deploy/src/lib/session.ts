import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side auth helpers — typed session, route guards, role checks.
 * Use these in API routes instead of calling getServerSession directly.
 *
 * We define our own typed session interface (AppSession) because NextAuth v4's
 * default Session.user is loosely typed. The actual session object returned
 * by getServerSession IS correctly shaped at runtime (we set it in the
 * `session` callback of authOptions), but TypeScript doesn't know that
 * without module augmentation (which breaks module resolution in NextAuth v4).
 */

export interface AppUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: 'user' | 'admin';
}

export interface AppSession {
  user: AppUser;
  expires: string;
}

/**
 * Get the current session on the server (API routes, server components).
 * Returns a typed AppSession or null if not authenticated.
 */
export async function getServerAuthSession(): Promise<AppSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  // Cast to our typed session — shape is guaranteed by the session callback in authOptions
  return session as unknown as AppSession;
}

/**
 * Require an authenticated user. Returns the session or a 401 response.
 *
 * @example
 * const [session, err] = await requireUser(req);
 * if (err) return err;
 * // session is now defined
 */
export async function requireUser(
  _req?: NextRequest
): Promise<[AppSession | null, NextResponse | null]> {
  const session = await getServerAuthSession();
  if (!session) {
    return [
      null,
      NextResponse.json(
        { error: 'Login dulu buat akses fitur ini.' },
        { status: 401 }
      ),
    ];
  }
  return [session, null];
}

/**
 * Require an admin user. Returns the session or a 401/403 response.
 */
export async function requireAdmin(
  _req?: NextRequest
): Promise<[AppSession | null, NextResponse | null]> {
  const [session, err] = await requireUser();
  if (err) return [null, err];
  if (session!.user.role !== 'admin') {
    return [
      null,
      NextResponse.json(
        { error: 'Akses ditolak. Butuh hak admin.' },
        { status: 403 }
      ),
    ];
  }
  return [session, null];
}

/**
 * Get the current user ID, or null if not authenticated.
 * Convenience wrapper for the common case.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerAuthSession();
  return session?.user.id ?? null;
}

/**
 * Check if current user is admin.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getServerAuthSession();
  return session?.user.role === 'admin';
}
