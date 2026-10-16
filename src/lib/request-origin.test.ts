import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCrossOriginMutation } from './request-origin';

function request({
  method = 'POST',
  origin,
  site,
  url = 'https://anichin.example/api/test',
}: {
  method?: string;
  origin?: string;
  site?: string;
  url?: string;
} = {}) {
  const headers = new Headers();
  if (origin !== undefined) headers.set('origin', origin);
  if (site !== undefined) headers.set('sec-fetch-site', site);
  return { method, url, nextUrl: new URL(url), headers };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isCrossOriginMutation', () => {
  it('allows same-origin mutations with canonical deployment URL', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://anichin.example');
    expect(isCrossOriginMutation(request({ origin: 'https://anichin.example' }))).toBe(false);
  });

  it('compares parsed origin, not a vulnerable string prefix', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://anichin.example');
    expect(isCrossOriginMutation(request({ origin: 'https://anichin.example.attacker.test' }))).toBe(true);
    expect(isCrossOriginMutation(request({ origin: 'https://attacker.test' }))).toBe(true);
  });

  it('rejects opaque, malformed, and path-bearing Origin values', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://anichin.example');
    for (const origin of ['null', 'not-an-origin', 'https://anichin.example/extra']) {
      expect(isCrossOriginMutation(request({ origin }))).toBe(true);
    }
  });

  it('rejects cross-site and same-site sibling requests without an Origin header', () => {
    expect(isCrossOriginMutation(request({ site: 'cross-site' }))).toBe(true);
    expect(isCrossOriginMutation(request({ site: 'same-site' }))).toBe(true);
  });

  it('allows non-browser clients without Origin and safe methods', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://anichin.example');
    expect(isCrossOriginMutation(request())).toBe(false);
    expect(isCrossOriginMutation(request({ method: 'GET', origin: 'https://attacker.test' }))).toBe(false);
  });

  it('falls back to the request origin only when no canonical URL is configured', () => {
    expect(isCrossOriginMutation(request({ origin: 'https://anichin.example' }))).toBe(false);
    expect(isCrossOriginMutation(request({ origin: 'https://attacker.test' }))).toBe(true);
  });
});
