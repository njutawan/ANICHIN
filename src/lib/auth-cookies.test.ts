/**
 * Regresi audit F-18 (dan F-09) — nama cookie NextAuth.
 *
 * Temuan: `authOptions.cookies` dulu menulis `next-auth.session-token` (tanpa
 * prefix) bahkan di produksi, sementara `getToken()` dari `next-auth/jwt`
 * mencari `__Secure-next-auth.session-token`. Akibatnya middleware /admin selalu
 * menganggap pengguna belum login.
 *
 * Test ini mengunci:
 *   - prefix yang benar di produksi (`__Secure-` untuk sesi, `__Host-` untuk CSRF)
 *     dan atribut Secure/HttpOnly/Path,
 *   - nama di `authOptions.cookies` identik dengan yang dipakai `getToken()`
 *     (`SESSION_COOKIE_NAME` + `tokenCookieParams`),
 *   - tanpa prefix & tanpa Secure di non-produksi (HTTP dev).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('produksi (HTTPS)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  it('memakai prefix __Secure- / __Host- dan cookie Secure', async () => {
    const cookies = await import('@/lib/auth-cookies');

    expect(cookies.USE_SECURE_COOKIES).toBe(true);
    expect(cookies.SESSION_COOKIE_NAME).toBe('__Secure-next-auth.session-token');
    expect(cookies.CSRF_COOKIE_NAME).toBe('__Host-next-auth.csrf-token');
    expect(cookies.CALLBACK_URL_COOKIE_NAME).toBe('__Secure-next-auth.callback-url');
    expect(cookies.tokenCookieParams).toEqual({
      cookieName: '__Secure-next-auth.session-token',
      secureCookie: true,
    });
    expect(cookies.cookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
    });
  });

  it('authOptions menulis cookie dengan nama yang sama seperti yang dicari getToken()', async () => {
    const cookies = await import('@/lib/auth-cookies');
    const { authOptions } = await import('@/lib/auth');
    const cfg = authOptions.cookies!;

    expect(cfg.sessionToken!.name).toBe(cookies.SESSION_COOKIE_NAME);
    expect(cfg.csrfToken!.name).toBe(cookies.CSRF_COOKIE_NAME);
    expect(cfg.callbackUrl!.name).toBe(cookies.CALLBACK_URL_COOKIE_NAME);
    expect(cfg.pkceCodeVerifier!.name).toBe(cookies.PKCE_COOKIE_NAME);
    expect(cfg.pkceCodeVerifier!.options).toMatchObject({ maxAge: 60 * 15 });
    expect(authOptions.useSecureCookies).toBe(true);
  });
});

describe('non-produksi (HTTP dev)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('tanpa prefix dan tanpa atribut Secure supaya cookie tidak ditolak browser', async () => {
    const cookies = await import('@/lib/auth-cookies');

    expect(cookies.USE_SECURE_COOKIES).toBe(false);
    expect(cookies.SESSION_COOKIE_NAME).toBe('next-auth.session-token');
    expect(cookies.CSRF_COOKIE_NAME).toBe('next-auth.csrf-token');
    expect(cookies.tokenCookieParams.secureCookie).toBe(false);
    expect(cookies.cookieOptions().secure).toBe(false);
  });

  it('authOptions tetap konsisten dengan getToken()', async () => {
    const cookies = await import('@/lib/auth-cookies');
    const { authOptions } = await import('@/lib/auth');

    expect(authOptions.cookies!.sessionToken!.name).toBe(cookies.SESSION_COOKIE_NAME);
    expect(authOptions.useSecureCookies).toBe(false);
  });
});
