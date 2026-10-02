/**
 * Augmentasi tipe NextAuth (v4).
 *
 * JWT/session yang dibuat `src/lib/auth.ts` selalu membawa `id` dan `role`,
 * tapi tipe bawaan `next-auth` tidak tahu itu — akhirnya banyak tempat memakai
 * `(session.user as any).id`. Augmentasi ini membuat akses tersebut bertipe
 * benar di server maupun komponen klien (`useSession`).
 */
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'user' | 'admin';
    } & DefaultSession['user'];
  }

  interface User {
    role?: 'user' | 'admin';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: 'user' | 'admin';
  }
}
