import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Importing auth configuration must not require a database or runtime secrets.
vi.mock('@/lib/db', () => ({ db: {} }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXTAUTH_SECRET', undefined);
  vi.stubEnv('HOSTNAME', 'localhost');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('runtime auth secret', () => {
  it('imports auth configuration without a secret during a production build', async () => {
    const { authOptions } = await import('@/lib/auth');
    expect(authOptions.providers.length).toBeGreaterThan(0);
  });

  it('creates the NextAuth route without reading runtime secrets', async () => {
    const route = await import('@/app/api/auth/[...nextauth]/route');
    expect(route.GET).toBeTypeOf('function');
    expect(route.POST).toBeTypeOf('function');
  });

  it('still rejects authentication without a secret in production', async () => {
    const { authOptions } = await import('@/lib/auth');
    const { default: NextAuth } = await import('next-auth');
    const handler = NextAuth(authOptions);

    await expect(
      handler(new Request('http://localhost/api/auth/session'), {
        params: Promise.resolve({ nextauth: ['session'] }),
      }),
    ).rejects.toThrow('NEXTAUTH_SECRET missing in production');
  });

  it('still rejects a secret that is too short', async () => {
    const { authOptions } = await import('@/lib/auth');
    vi.stubEnv('NEXTAUTH_SECRET', 'too-short');

    expect(() => authOptions.secret).toThrow('NEXTAUTH_SECRET too short');
  });

  it('reads the secret supplied at runtime, after the module was imported', async () => {
    const { authOptions } = await import('@/lib/auth');
    const secret = 'runtime-only-test-secret-at-least-32-characters';
    vi.stubEnv('NEXTAUTH_SECRET', secret);

    // NextAuth also copies options when resolving server sessions.
    expect({ ...authOptions }.secret).toBe(secret);
  });

  it('keeps the local development fallback stable across accesses', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { authOptions } = await import('@/lib/auth');

    const secret = authOptions.secret;
    expect(secret).toMatch(/^anichin-dev-secret-change-in-production-/);
    expect(authOptions.secret).toBe(secret);
    expect({ ...authOptions }.secret).toBe(secret);
  });

  it('does not allow a development fallback on a non-local host', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('HOSTNAME', 'staging.example.com');
    const { authOptions } = await import('@/lib/auth');

    expect(() => authOptions.secret).toThrow('NEXTAUTH_SECRET missing for non-localhost host');
  });
});
