/**
 * Regresi audit F-07 / F-19 — kebijakan penautan akun OAuth (Google/GitHub).
 *
 * Konteks: aplikasi ini TIDAK memakai adapter NextAuth, sehingga
 * `core/lib/callback-handler.js` mengembalikan objek profil lebih awal
 * (`if (!adapter) return { user: profile }`) dan flag
 * `allowDangerousEmailAccountLinking` tidak pernah dibaca. Penautan akun
 * berdasarkan email sebenarnya dilakukan callback `signIn` di src/lib/auth.ts,
 * jadi aturan berikut yang harus benar-benar berlaku:
 *
 *   1. email wajib terverifikasi di provider (Google: `email_verified`;
 *      GitHub: dicek ke /user/emails — fail closed bila ragu),
 *   2. akun lokal yang memakai 2FA tidak boleh masuk lewat OAuth (bypass 2FA),
 *   3. akun baru hanya dibuat setelah (1) terpenuhi, dan kegagalan DB → tolak.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, fetchMock, loggerMock } = vi.hoisted(() => {
  // Provider Google/GitHub hanya didaftarkan bila env-nya ada — di-set di sini
  // (sebelum modul auth diimpor) supaya `authOptions.providers` benar-benar
  // memuat keduanya dan pengujian flag/perilaku tidak jadi hampa.
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'test-secret-min-16-chars-abcdef';
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'test-google-id';
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'test-google-secret';
  process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? 'test-github-id';
  process.env.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? 'test-github-secret';

  return {
    dbMock: { user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
    fetchMock: vi.fn(),
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));

import { authOptions } from '@/lib/auth';

type SignInArgs = {
  user: { id?: string; email?: string | null; name?: string | null; image?: string | null };
  account: { provider?: string; type?: string; access_token?: string } | null;
  profile?: unknown;
};
type SignInResult = boolean | string;

const signIn = authOptions.callbacks!.signIn as unknown as (args: SignInArgs) => Promise<SignInResult>;

const EMAIL_NOT_VERIFIED = '/auth/login?error=OAuthEmailNotVerified';
const USE_PASSWORD_LOGIN = '/auth/login?error=UsePasswordLogin';

const googleAccount = { provider: 'google', type: 'oauth' as const, access_token: 'gtoken' };
const githubAccount = { provider: 'github', type: 'oauth' as const, access_token: 'ghtoken' };

/** Respons sukses GET /user/emails dari GitHub. */
function githubEmails(payload: unknown, ok = true) {
  fetchMock.mockResolvedValue({ ok, json: async () => payload });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Stub ulang tiap test: `afterEach` melepas global stub (unstubAllGlobals).
  vi.stubGlobal('fetch', fetchMock);
  dbMock.user.findUnique.mockResolvedValue(null);
  dbMock.user.create.mockResolvedValue({ id: 'new-user' });
  dbMock.user.update.mockResolvedValue({ id: 'existing' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provider tanpa penautan "dangerous"', () => {
  it('Google & GitHub terdaftar (env uji) dan keduanya tanpa allowDangerousEmailAccountLinking', () => {
    const ids = authOptions.providers.map((p) => (p as unknown as { id: string }).id);
    expect(ids).toEqual(expect.arrayContaining(['credentials', 'google', 'github']));

    for (const provider of authOptions.providers) {
      const p = provider as unknown as { id?: string; allowDangerousEmailAccountLinking?: unknown };
      expect(p.allowDangerousEmailAccountLinking).toBeUndefined();
    }
  });
});

describe('kredensial & provider non-OAuth', () => {
  it('login kredensial dilewatkan tanpa menyentuh DB', async () => {
    const result = await signIn({
      user: { id: 'u1', email: 'u@example.com' },
      account: { provider: 'credentials', type: 'credentials' },
    });

    expect(result).toBe(true);
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('provider tanpa account dilewatkan', async () => {
    expect(await signIn({ user: { email: 'u@example.com' }, account: null })).toBe(true);
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('provider OIDC diperlakukan sama seperti OAuth (tidak lolos begitu saja)', async () => {
    const result = await signIn({
      user: { email: 'u@example.com' },
      account: { provider: 'google', type: 'oidc', access_token: 'gtoken' },
      profile: { email: 'u@example.com', email_verified: false },
    });

    expect(result).toBe(EMAIL_NOT_VERIFIED);
  });
});

describe('Google', () => {
  it('kontrak with provider NextAuth: type akun adalah "oauth"', () => {
    const google = authOptions.providers.find(
      (p) => (p as unknown as { id?: string }).id === 'google'
    ) as unknown as { type?: string } | undefined;
    // Kalau ini berubah (mis. provider jadi OIDC), guard di src/lib/auth.ts
    // tetap aman karena memperlakukan semua non-credentials sebagai OAuth.
    expect(google?.type).toBe('oauth');
  });

  it('email terverifikasi + belum ada akun → membuat akun baru (verified, role user)', async () => {
    const result = await signIn({
      user: { email: 'Baru@Example.com', name: 'Nama Baru', image: 'https://img/x.png' },
      account: googleAccount,
      profile: { email: 'Baru@Example.com', email_verified: true },
    });

    expect(result).toBe(true);
    expect(dbMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'baru@example.com' },
      select: { id: true, twoFactorEnabled: true, emailVerified: true },
    });
    const created = dbMock.user.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ email: 'baru@example.com', role: 'user' });
    expect(created.emailVerified).toBeInstanceOf(Date);
    expect(created.password).toMatch(/^\$2[aby]\$/); // hash bcrypt dari password acak
  });

  it('email BELUM terverifikasi → ditolak, tidak ada akun dibuat/ditautkan', async () => {
    const result = await signIn({
      user: { email: 'u@example.com' },
      account: googleAccount,
      profile: { email: 'u@example.com', email_verified: false },
    });

    expect(result).toBe(EMAIL_NOT_VERIFIED);
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });

  it('klaim email_verified hilang → ditolak (fail closed)', async () => {
    const result = await signIn({
      user: { email: 'u@example.com' },
      account: googleAccount,
      profile: { email: 'u@example.com' },
    });

    expect(result).toBe(EMAIL_NOT_VERIFIED);
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });

  it('email kosong dari provider → ditolak', async () => {
    const result = await signIn({
      user: { email: '' },
      account: googleAccount,
      profile: { email_verified: true },
    });

    expect(result).toBe(EMAIL_NOT_VERIFIED);
  });

  it('akun lokal sudah ada & tanpa 2FA → diizinkan, email ditandai verified', async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 'u1', twoFactorEnabled: false, emailVerified: null });

    const result = await signIn({
      user: { email: 'u@example.com' },
      account: googleAccount,
      profile: { email_verified: true },
    });

    expect(result).toBe(true);
    expect(dbMock.user.create).not.toHaveBeenCalled();
    expect(dbMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { emailVerified: expect.any(Date) },
    });
  });

  it('akun lokal sudah terverifikasi → tidak menulis ulang apa pun', async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 'u1', twoFactorEnabled: false, emailVerified: new Date() });

    expect(
      await signIn({ user: { email: 'u@example.com' }, account: googleAccount, profile: { email_verified: true } })
    ).toBe(true);
    expect(dbMock.user.update).not.toHaveBeenCalled();
  });

  it('akun lokal memakai 2FA → ditolak (tidak boleh melewati 2FA lewat OAuth)', async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 'u1', twoFactorEnabled: true, emailVerified: new Date() });

    const result = await signIn({
      user: { email: 'u@example.com' },
      account: googleAccount,
      profile: { email_verified: true },
    });

    expect(result).toBe(USE_PASSWORD_LOGIN);
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });

  it('error DB → ditolak (fail closed), tidak melempar', async () => {
    dbMock.user.findUnique.mockRejectedValue(new Error('db down'));

    const result = await signIn({
      user: { email: 'u@example.com' },
      account: googleAccount,
      profile: { email_verified: true },
    });

    expect(result).toBe(false);
  });

  it('balapan create (P2002) → diizinkan', async () => {
    dbMock.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    expect(
      await signIn({ user: { email: 'u@example.com' }, account: googleAccount, profile: { email_verified: true } })
    ).toBe(true);
  });
});

describe('GitHub', () => {
  const profile = { email: 'u@example.com' };

  it('email ada di daftar verified → login diteruskan', async () => {
    githubEmails([
      { email: 'lain@example.com', verified: true, primary: false },
      { email: 'u@example.com', verified: true, primary: true },
    ]);

    const result = await signIn({ user: { email: 'u@example.com' }, account: githubAccount, profile });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user/emails',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'token ghtoken' }),
      })
    );
  });

  it('email belum verified di GitHub → ditolak walau email primary', async () => {
    githubEmails([{ email: 'u@example.com', verified: false, primary: true }]);

    const result = await signIn({ user: { email: 'u@example.com' }, account: githubAccount, profile });

    expect(result).toBe(EMAIL_NOT_VERIFIED);
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });

  it('email tidak ada di daftar → ditolak', async () => {
    githubEmails([{ email: 'lain@example.com', verified: true }]);

    expect(
      await signIn({ user: { email: 'u@example.com' }, account: githubAccount, profile })
    ).toBe(EMAIL_NOT_VERIFIED);
  });

  it('API GitHub error (500) → ditolak (fail closed)', async () => {
    githubEmails([], false);

    expect(
      await signIn({ user: { email: 'u@example.com' }, account: githubAccount, profile })
    ).toBe(EMAIL_NOT_VERIFIED);
  });

  it('fetch melempar (timeout/jaringan) → ditolak, tidak crash', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    expect(
      await signIn({ user: { email: 'u@example.com' }, account: githubAccount, profile })
    ).toBe(EMAIL_NOT_VERIFIED);
  });

  it('tanpa access_token → ditolak tanpa memanggil API', async () => {
    const result = await signIn({
      user: { email: 'u@example.com' },
      account: { provider: 'github', type: 'oauth' },
      profile,
    });

    expect(result).toBe(EMAIL_NOT_VERIFIED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('email terverifikasi + akun 2FA lokal → tetap ditolak', async () => {
    githubEmails([{ email: 'u@example.com', verified: true, primary: true }]);
    dbMock.user.findUnique.mockResolvedValue({ id: 'u1', twoFactorEnabled: true, emailVerified: new Date() });

    expect(
      await signIn({ user: { email: 'u@example.com' }, account: githubAccount, profile })
    ).toBe(USE_PASSWORD_LOGIN);
  });
});

describe('provider asing', () => {
  it('provider yang tidak dikenal → ditolak (tidak pernah menautkan tanpa verifikasi)', async () => {
    const result = await signIn({
      user: { email: 'u@example.com' },
      account: { provider: 'gitlab', type: 'oauth', access_token: 'x' },
      profile: { email_verified: true },
    });

    expect(result).toBe(EMAIL_NOT_VERIFIED);
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });
});
