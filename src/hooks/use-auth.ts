'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useCallback } from 'react';

/**
 * Client-side auth hook — wraps next-auth useSession with convenience methods.
 *
 * Note: We cast user to AppUser because NextAuth v4's default Session.user
 * type doesn't include `role` (type augmentation breaks module resolution).
 * The runtime shape IS correct (set by the session callback in authOptions).
 */

interface AppUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: 'user' | 'admin';
}

export function useAuth() {
  const { data: session, status, update } = useSession();

  const user = (session?.user as unknown as AppUser | undefined) ?? null;
  const isAuthenticated = status === 'authenticated' && !!user;
  const isAdmin = isAuthenticated && user?.role === 'admin';
  const isLoading = status === 'loading';

  const login = useCallback(
    async (email: string, password: string, redirect: boolean = false) => {
      return signIn('credentials', { email, password, redirect });
    },
    []
  );

  const logout = useCallback(async (redirect: boolean = false) => {
    return signOut({ redirect });
  }, []);

  const refresh = useCallback(async () => {
    return update();
  }, [update]);

  return {
    session,
    user,
    status,
    isAuthenticated,
    isAdmin,
    isLoading,
    login,
    logout,
    refresh,
  };
}

