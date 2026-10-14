/**
 * Klien Redis bersama (lazy) untuk rate limiting, lockout login, dan data
 * sementara lain yang harus bertahan lintas instance/proses.
 *
 * Perilaku:
 *  - `REDIS_URL` tidak diset → semua pemanggil memakai fallback in-memory
 *    masing-masing (dev / single instance).
 *  - Koneksi dibuat sekali per proses (lazy), error koneksi hanya di-log
 *    sebagai warning di non-produksi.
 *  - Kegagalan inisialisasi TIDAK melempar: pemanggil diberi `null` supaya
 *    aplikasi tetap jalan dengan fallback lokal (fail-soft untuk rate limit,
 *    bukan untuk keputusan otorisasi).
 *
 * Modul ini sengaja tidak meng-import apa pun dari aplikasi supaya bisa dipakai
 * rate-limit-store.ts maupun two-factor-pending.ts tanpa siklus impor.
 */

import { logger } from '@/lib/logger';
import type Redis from 'ioredis';

let redisClient: Redis | null = null;
let redisInitPromise: Promise<Redis | null> | null = null;
let redisAvailable = false;

export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

/**
 * Apakah klien Redis sudah terhubung (dipakai pemanggil untuk memutuskan
 * apakah operasi boleh diarahkan ke Redis).
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Ambil klien Redis (membuat koneksi pada pemanggilan pertama).
 * Mengembalikan null bila REDIS_URL tidak diset atau inisialisasi gagal.
 */
export async function getRedis(): Promise<Redis | null> {
  if (!isRedisConfigured()) return null;
  if (redisClient) return redisClient;
  if (redisInitPromise) return redisInitPromise;

  redisInitPromise = (async () => {
    try {
      const { default: IORedis } = await import('ioredis');
      const client = new IORedis(process.env.REDIS_URL!, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
        connectTimeout: 5000,
        retryStrategy: (times) => Math.min(times * 200, 2000),
      });

      client.on('error', (err) => {
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('[redis] connection error', { error: err.message });
        }
      });
      client.on('connect', () => {
        redisAvailable = true;
        if (process.env.NODE_ENV !== 'production') {
          logger.info('[redis] connected — rate limiting is now Redis-backed');
        }
      });
      client.on('close', () => {
        redisAvailable = false;
      });

      redisClient = client;
      return client;
    } catch (err) {
      logger.warn('[redis] init failed, falling back to in-memory', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  })();

  return redisInitPromise;
}
