import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

import { authOptions } from '@/lib/auth';

const redirect = authOptions.callbacks!.redirect as unknown as (args: {
  url: string;
  baseUrl: string;
}) => Promise<string>;

const baseUrl = 'https://anichin.example';

describe('NextAuth redirect callback', () => {
  it('allows relative and absolute same-origin destinations', async () => {
    await expect(redirect({ url: '/anime/test?from=login', baseUrl }))
      .resolves.toBe('https://anichin.example/anime/test?from=login');
    await expect(redirect({ url: 'https://anichin.example/profile', baseUrl }))
      .resolves.toBe('https://anichin.example/profile');
  });

  it('rejects lookalike hosts, subdomains, and protocol-relative URLs', async () => {
    for (const url of [
      'https://anichin.example.attacker.test/path',
      'https://attacker.anichin.example/path',
      'https://credential@anichin.example/path',
      '//attacker.test/path',
    ]) {
      await expect(redirect({ url, baseUrl })).resolves.toBe(baseUrl);
    }
  });

  it('rejects malformed and non-HTTP destinations', async () => {
    await expect(redirect({ url: 'javascript:alert(1)', baseUrl })).resolves.toBe(baseUrl);
    await expect(redirect({ url: 'http://anichin.example/path', baseUrl })).resolves.toBe(baseUrl);
  });
});
