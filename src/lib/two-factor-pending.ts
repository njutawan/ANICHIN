/**
 * Pending secret 2FA — store sementara antara `/api/auth/2fa/setup` dan
 * `/api/auth/2fa/enable` (F-11 pada docs/SECURITY-AUDIT.md).
 *
 * Sebelumnya secret calon ini disimpan di `Map` in-memory milik
 * `src/lib/two-factor.ts`. Itu cukup untuk satu proses, tetapi di deployment
 * multi-instance tanpa sticky session request `/setup` bisa mendarat di
 * instance A dan `/enable` di instance B → "sesi setup kedaluwarsa" padahal
 * pengguna baru saja scan QR. Karena container bisa di-scale
 * (`docker compose up -d --scale web=3`), state ini harus hidup di luar proses.
 *
 * Aturan:
 *  - `REDIS_URL` diset → Redis (`SET key value PX ttl`), berlaku lintas instance.
 *  - Tidak diset → fallback `Map` in-memory dengan TTL yang sama (dev/single
 *    instance); perilakunya identik dari sisi pemanggil.
 *  - Nilai yang disimpan **terenkripsi** (AES-256-GCM, `encryptSecret`): Redis
 *    tidak pernah menerima secret TOTP dalam bentuk plaintext, dan dump/cache
 *    Redis yang bocor tidak langsung memberi secret.
 *  - Secret yang gagal didekripsi (mis. `TWO_FACTOR_ENCRYPTION_KEY` berubah)
 *    diperlakukan sebagai tidak ada + entri dihapus → pengguna mengulang setup
 *    dari awal, bukan memakai secret yang tidak bisa diverifikasi.
 */

import { logger } from '@/lib/logger';
import { getRedis, isRedisAvailable } from '@/lib/redis-client';
import { decryptSecret, encryptSecret } from '@/lib/two-factor';

export interface PendingSecret {
  secret: string;
  otpauthUrl: string;
  expiresAt: number;
}

/** TTL default: 5 menit — cukup untuk scan QR + mengetik kode pertama. */
export const PENDING_TTL_MS = 5 * 60 * 1000;

const KEY_PREFIX = 'tfa:pending:';

// ── Fallback in-memory ──
const memStore = new Map<string, { value: string; expiresAt: number }>();

function sweepExpired(now = Date.now()): void {
  for (const [key, entry] of memStore) {
    if (entry.expiresAt <= now) memStore.delete(key);
  }
}

function redisKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/**
 * Simpan secret calon untuk user, berlaku `ttlMs` (default 5 menit).
 * Menimpa entri sebelumnya (setup diulang = secret lama tidak berlaku lagi).
 */
export async function setPendingSecret(
  userId: string,
  secret: string,
  otpauthUrl: string,
  ttlMs: number = PENDING_TTL_MS
): Promise<void> {
  const expiresAt = Date.now() + ttlMs;
  const payload = encryptSecret(JSON.stringify({ secret, otpauthUrl, expiresAt }));

  const redis = await getRedis();
  if (redis && isRedisAvailable()) {
    try {
      await redis.set(redisKey(userId), payload, 'PX', ttlMs);
      return;
    } catch (err) {
      // Redis error saat menyimpan → jangan menggagalkan alur setup; simpan
      // lokal supaya pengguna tetap bisa menyelesaikan enable di instance ini.
      logger.warn('[two-factor] gagal menulis pending secret ke Redis, pakai memori', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  sweepExpired();
  memStore.set(userId, { value: payload, expiresAt });
}

/**
 * Ambil pending secret untuk user. Mengembalikan null bila tidak ada,
 * sudah kedaluwarsa, atau tidak bisa didekripsi.
 */
export async function getPendingSecret(userId: string): Promise<PendingSecret | null> {
  const redis = await getRedis();
  let payload: string | null = null;

  if (redis && isRedisAvailable()) {
    try {
      payload = await redis.get(redisKey(userId));
    } catch (err) {
      logger.warn('[two-factor] gagal membaca pending secret dari Redis', {
        error: err instanceof Error ? err.message : String(err),
      });
      payload = null;
    }
  }

  if (!payload) {
    sweepExpired();
    const entry = memStore.get(userId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      memStore.delete(userId);
      return null;
    }
    payload = entry.value;
  }

  try {
    const parsed = JSON.parse(decryptSecret(payload)) as PendingSecret;
    if (!parsed?.secret || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt <= Date.now()) {
      await clearPendingSecret(userId);
      return null;
    }
    return parsed;
  } catch {
    // Payload rusak / key enkripsi berubah → buang, pengguna ulangi setup.
    logger.warn('[two-factor] pending secret tidak bisa didekripsi, entri dibuang');
    await clearPendingSecret(userId);
    return null;
  }
}

/** Hapus pending secret (setelah enable sukses, disable, atau kedaluwarsa). */
export async function clearPendingSecret(userId: string): Promise<void> {
  memStore.delete(userId);

  const redis = await getRedis();
  if (redis && isRedisAvailable()) {
    try {
      await redis.del(redisKey(userId));
    } catch (err) {
      logger.warn('[two-factor] gagal menghapus pending secret di Redis', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
