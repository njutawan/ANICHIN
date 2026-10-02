/**
 * P2 — regresi versi cache service worker.
 *
 * Sebelumnya `public/sw.js` menyimpan `CACHE_VERSION = 'anichin-v1'` manual:
 * lupa bump = pengguna tertahan aset lama. Sekarang versi disuntikkan saat
 * build dari `NEXT_PUBLIC_BUILD_ID`.
 */
import { describe, expect, it } from 'vitest';
import {
  CACHE_VERSION_PLACEHOLDER,
  buildServiceWorkerScript,
  sanitizeBuildId,
} from './service-worker';

describe('sanitizeBuildId', () => {
  it('membiarkan karakter aman', () => {
    expect(sanitizeBuildId('f60974d')).toBe('f60974d');
    expect(sanitizeBuildId('v1.2.3-rc.1')).toBe('v1.2.3-rc.1');
  });

  it('membuang karakter yang bisa menyuntik kode', () => {
    expect(sanitizeBuildId("'; alert(1); //")).toBe('alert1');
    expect(sanitizeBuildId('a\nb`c${d}')).toBe('abcd');
  });

  it('jatuh ke "dev" kalau kosong / tidak ada', () => {
    expect(sanitizeBuildId('')).toBe('dev');
    expect(sanitizeBuildId(undefined)).toBe('dev');
    expect(sanitizeBuildId(null)).toBe('dev');
    expect(sanitizeBuildId('!!!')).toBe('dev');
  });

  it('membatasi panjang', () => {
    expect(sanitizeBuildId('x'.repeat(200))).toHaveLength(64);
  });
});

describe('buildServiceWorkerScript', () => {
  it('mengganti placeholder dengan versi dari build id', () => {
    const script = buildServiceWorkerScript('abc1234');
    expect(script).toContain("const CACHE_VERSION = 'anichin-abc1234';");
    expect(script).not.toContain(CACHE_VERSION_PLACEHOLDER);
  });

  it('deploy berbeda menghasilkan versi cache berbeda', () => {
    expect(buildServiceWorkerScript('aaa1111')).not.toBe(buildServiceWorkerScript('bbb2222'));
  });

  it('build tanpa id tetap menghasilkan versi yang valid', () => {
    expect(buildServiceWorkerScript(undefined)).toContain("const CACHE_VERSION = 'anichin-dev';");
  });

  it('tetap memuat handler & strategi penting', () => {
    const script = buildServiceWorkerScript('abc1234');
    expect(script).toContain("self.addEventListener('install'");
    expect(script).toContain("self.addEventListener('activate'");
    expect(script).toContain("self.addEventListener('fetch'");
    expect(script).toContain("self.addEventListener('message'");
    expect(script).toContain('caches.delete(key)');
    expect(script).toContain("'/offline'");
    // Endpoint sensitif tidak boleh di-cache.
    expect(script).toContain("url.pathname.indexOf('/api/auth/') === 0");
    expect(script).toContain("url.pathname.indexOf('/api/health') === 0");
  });

  it('tidak menyisakan template literal yang belum di-escape (syntax valid)', () => {
    const script = buildServiceWorkerScript('abc1234');
    // Cek cepat: tidak ada `${` liar dari template literal pembungkus.
    expect(script).not.toContain('${');
    // new Function() akan melempar SyntaxError kalau skrip rusak.
    expect(() => new Function(script)).not.toThrow();
  });
});
