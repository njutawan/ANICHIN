/**
 * Unit tests for trusted client-IP resolution (src/lib/ip.ts).
 *
 * Fokus: anti-spoofing. Header `x-forwarded-for` dikirim klien TIDAK boleh
 * dipercaya sebagai IP klien — yang dipakai adalah entri yang ditulis proxy
 * tepercaya (paling kanan, sesuai TRUSTED_PROXY_HOPS).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getClientIpFromHeaders, getClientIp, sanitizeIp } from './ip';

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe('sanitizeIp', () => {
  it('accepts IPv4 dan IPv6', () => {
    expect(sanitizeIp('203.0.113.7')).toBe('203.0.113.7');
    expect(sanitizeIp('2001:DB8::1')).toBe('2001:db8::1');
  });

  it('strips ports dari IPv4 dan bracket IPv6', () => {
    expect(sanitizeIp('203.0.113.7:5312')).toBe('203.0.113.7');
    expect(sanitizeIp('[2001:db8::1]:443')).toBe('2001:db8::1');
  });

  it('rejects nilai yang bukan IP', () => {
    expect(sanitizeIp('evil.example.com')).toBeNull();
    expect(sanitizeIp('<script>')).toBeNull();
    expect(sanitizeIp('')).toBeNull();
    expect(sanitizeIp(null)).toBeNull();
    expect(sanitizeIp('1.2.3.4.5')).toBeNull();
  });
});

describe('getClientIpFromHeaders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('memprioritaskan header edge yang tidak bisa dipalsukan', () => {
    const ip = getClientIpFromHeaders(
      headers({
        'x-vercel-forwarded-for': '198.51.100.9',
        'x-forwarded-for': '1.2.3.4',
      })
    );
    expect(ip).toBe('198.51.100.9');
  });

  it('mengabaikan entri XFF paling kiri (spoofable oleh klien)', () => {
    // Klien mengirim "1.2.3.4"; proxy tepercaya menambahkan IP sebenarnya di kanan.
    const ip = getClientIpFromHeaders(
      headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.50' })
    );
    expect(ip).toBe('203.0.113.50');
  });

  it('menghormati TRUSTED_PROXY_HOPS > 1 (CDN + load balancer)', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    const ip = getClientIpFromHeaders(
      headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.50, 10.0.0.1' })
    );
    expect(ip).toBe('203.0.113.50');
  });

  it('melewati entri XFF yang tidak valid', () => {
    const ip = getClientIpFromHeaders(
      headers({ 'x-forwarded-for': 'not-an-ip, 203.0.113.50' })
    );
    expect(ip).toBe('203.0.113.50');
  });

  it('fallback ke x-real-ip bila XFF tidak ada', () => {
    const ip = getClientIpFromHeaders(headers({ 'x-real-ip': '203.0.113.99' }));
    expect(ip).toBe('203.0.113.99');
  });

  it("mengembalikan 'unknown' bila tidak ada header IP", () => {
    expect(getClientIpFromHeaders(headers({}))).toBe('unknown');
    expect(getClientIpFromHeaders(undefined)).toBe('unknown');
  });

  it('mendukung object header biasa (NextAuth RequestInternal)', () => {
    const ip = getClientIpFromHeaders({ 'x-forwarded-for': 'x, 203.0.113.77' });
    expect(ip).toBe('203.0.113.77');
  });
});

describe('getClientIp', () => {
  it('membaca dari objek request', () => {
    expect(getClientIp({ headers: headers({ 'x-real-ip': '198.51.100.1' }) })).toBe('198.51.100.1');
    expect(getClientIp(undefined)).toBe('unknown');
  });
});
