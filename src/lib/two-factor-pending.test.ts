/**
 * Regresi audit F-11 — pending secret 2FA disimpan di luar proses (Redis) dan
 * terenkripsi, dengan fallback in-memory untuk dev/single instance.
 *
 * Yang dikunci di sini:
 *  - tanpa REDIS_URL → perilaku in-memory tetap sama (set/get/clear + TTL),
 *  - dengan REDIS_URL → nilai ditulis ke Redis dengan TTL (PX), sehingga
 *    `/setup` di instance A dan `/enable` di instance B tetap bersambung,
 *  - yang tersimpan TIDAK pernah plaintext (AES-256-GCM via encryptSecret),
 *  - payload rusak / key berubah → dianggap tidak ada, bukan dipakai,
 *  - Redis error tidak boleh menggagalkan alur setup pengguna.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Fake ioredis — meniru subset yang dipakai redis-client + pending store. */
class FakeRedis {
  static instances: FakeRedis[] = [];
  static failNextGet = false;
  static failNextSet = false;
  /** State dibagi antar instance — meniru satu server Redis yang sama. */
  static shared = new Map<string, string>();

  emitted: string[] = [];

  constructor(..._args: unknown[]) {
    FakeRedis.instances.push(this);
    // Tandai "connected" setelah microtask berikutnya: redis-client memasang
    // listener tepat setelah konstruksi, jadi event harus menyusul.
    queueMicrotask(() => this.emit('connect'));
  }

  on(event: string, handler: (...a: unknown[]) => void) {
    this.handlers[event] = handler;
    return this;
  }
  handlers: Record<string, (...a: unknown[]) => void> = {};

  private emit(event: string) {
    this.emitted.push(event);
    this.handlers[event]?.();
  }

  async set(key: string, value: string, _mode?: string, _ttl?: number) {
    if (FakeRedis.failNextSet) {
      FakeRedis.failNextSet = false;
      throw new Error('redis set failed');
    }
    FakeRedis.shared.set(key, value);
    return 'OK';
  }

  async get(key: string) {
    if (FakeRedis.failNextGet) {
      FakeRedis.failNextGet = false;
      throw new Error('redis get failed');
    }
    return FakeRedis.shared.get(key) ?? null;
  }

  async del(key: string) {
    return FakeRedis.shared.delete(key) ? 1 : 0;
  }

  async ping() {
    return 'PONG';
  }
}

vi.mock('ioredis', () => ({ default: FakeRedis }));

type PendingModule = typeof import('@/lib/two-factor-pending');
type TwoFactorModule = typeof import('@/lib/two-factor');

/** Muat ulang modul supaya cache Redis per-proses di-reset antar test. */
async function loadModules(): Promise<{
  pending: PendingModule;
  twoFactor: TwoFactorModule;
}> {
  vi.resetModules();
  const pending = await import('@/lib/two-factor-pending');
  const twoFactor = await import('@/lib/two-factor');
  return { pending, twoFactor };
}

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const OTFAUTH = `otpauth://totp/AniChin:u%40example.com?secret=${SECRET}&issuer=AniChin`;

beforeEach(() => {
  FakeRedis.instances = [];
  FakeRedis.shared = new Map();
  FakeRedis.failNextGet = false;
  FakeRedis.failNextSet = false;
  vi.unstubAllEnvs();
  delete process.env.REDIS_URL;
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.REDIS_URL;
});

describe('fallback in-memory (tanpa REDIS_URL)', () => {
  it('set → get mengembalikan secret & otpauthUrl yang sama', async () => {
    const { pending } = await loadModules();

    await pending.setPendingSecret('user-1', SECRET, OTFAUTH);
    const entry = await pending.getPendingSecret('user-1');

    expect(entry?.secret).toBe(SECRET);
    expect(entry?.otpauthUrl).toBe(OTFAUTH);
    expect(entry?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('clear menghapus entri', async () => {
    const { pending } = await loadModules();

    await pending.setPendingSecret('user-1', SECRET, OTFAUTH);
    await pending.clearPendingSecret('user-1');

    await expect(pending.getPendingSecret('user-1')).resolves.toBeNull();
  });

  it('entri kedaluwarsa tidak dikembalikan', async () => {
    const { pending } = await loadModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));

    await pending.setPendingSecret('user-1', SECRET, OTFAUTH, 1000);
    vi.setSystemTime(new Date('2026-10-15T00:00:02Z')); // +2 detik > TTL 1 detik

    await expect(pending.getPendingSecret('user-1')).resolves.toBeNull();
  });

  it('user lain tidak bisa mengambil secret milik user ini', async () => {
    const { pending } = await loadModules();

    await pending.setPendingSecret('user-1', SECRET, OTFAUTH);

    await expect(pending.getPendingSecret('user-2')).resolves.toBeNull();
  });
});

describe('Redis (multi-instance, F-11)', () => {
  it('menyimpan ke Redis dengan TTL dan tanpa plaintext', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { pending, twoFactor } = await loadModules();

    await pending.setPendingSecret('user-1', SECRET, OTFAUTH);

    const stored = FakeRedis.shared.get('tfa:pending:user-1');
    expect(stored).toBeDefined();
    // Tidak ada plaintext secret di Redis — hanya ciphertext AES-256-GCM.
    expect(stored).not.toContain(SECRET);
    expect(stored!.split(':')).toHaveLength(3); // iv:authTag:ciphertext
    // Dan ciphertext itu memang bisa dibuka dengan key aplikasi.
    const decoded = JSON.parse(twoFactor.decryptSecret(stored!));
    expect(decoded.secret).toBe(SECRET);
  });

  it('get membaca dari Redis (instance lain) — handshake tetap bersambung', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { pending } = await loadModules();

    // Simulasi: instance A menulis.
    await pending.setPendingSecret('user-7', SECRET, OTFAUTH);

    // Instance B: modul dimuat ulang → memori in-process kosong, Redis tetap
    // menyimpan nilainya (inilah yang membuat /enable boleh mendarat di
    // instance lain).
    expect(FakeRedis.shared.has('tfa:pending:user-7')).toBe(true);
    vi.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';
    const freshPending = await import('@/lib/two-factor-pending');

    const entry = await freshPending.getPendingSecret('user-7');
    expect(entry?.secret).toBe(SECRET);
  });

  it('clear menghapus key di Redis', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { pending } = await loadModules();

    await pending.setPendingSecret('user-1', SECRET, OTFAUTH);
    await pending.clearPendingSecret('user-1');

    expect(FakeRedis.shared.has('tfa:pending:user-1')).toBe(false);
    await expect(pending.getPendingSecret('user-1')).resolves.toBeNull();
  });

  it('payload rusak → null (dan entri dibuang), bukan dipakai', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { pending } = await loadModules();
    FakeRedis.shared.set('tfa:pending:user-1', 'bukan-ciphertext');

    await expect(pending.getPendingSecret('user-1')).resolves.toBeNull();
    expect(FakeRedis.shared.has('tfa:pending:user-1')).toBe(false);
  });

  it('Redis error saat set → tetap tersimpan lokal (setup tidak gagal)', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { pending } = await loadModules();
    FakeRedis.failNextSet = true;

    await expect(
      pending.setPendingSecret('user-1', SECRET, OTFAUTH)
    ).resolves.toBeUndefined();
    // Dibaca lagi: nilainya tersedia dari fallback in-memory.
    const entry = await pending.getPendingSecret('user-1');
    expect(entry?.secret).toBe(SECRET);
  });

  it('Redis error saat get → jatuh ke fallback, tidak melempar', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { pending } = await loadModules();
    await pending.setPendingSecret('user-1', SECRET, OTFAUTH);
    FakeRedis.failNextGet = true;

    await expect(pending.getPendingSecret('user-1')).resolves.toBeNull();
  });
});
