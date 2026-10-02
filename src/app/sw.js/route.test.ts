import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /sw.js', () => {
  const original = process.env.NEXT_PUBLIC_BUILD_ID;
  afterEach(() => {
    process.env.NEXT_PUBLIC_BUILD_ID = original;
  });

  it('menyajikan JavaScript dengan versi cache dari build id', async () => {
    process.env.NEXT_PUBLIC_BUILD_ID = 'deadbee';
    const res = GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/javascript');
    // Update SW tidak boleh tertahan cache lama.
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('Service-Worker-Allowed')).toBe('/');

    const body = await res.text();
    expect(body).toContain("const CACHE_VERSION = 'anichin-deadbee';");
    expect(body).toContain("self.addEventListener('fetch'");
  });

  it('tetap valid tanpa env build id (mis. `next dev` tanpa config)', async () => {
    delete process.env.NEXT_PUBLIC_BUILD_ID;
    const body = await GET().text();
    expect(body).toContain("const CACHE_VERSION = 'anichin-dev';");
  });
});
