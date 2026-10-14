/**
 * Rate Limit Storage — pluggable backend (in-memory or Redis).
 *
 * In dev (no REDIS_URL): uses in-memory Map (fast, but lost on restart).
 * In prod (REDIS_URL set): uses Redis (survives restarts, multi-instance ready).
 *
 * Interface:
 *   increment(key, windowMs) → count (current count in window)
 *   get(key) → current count
 *   reset(key) → void
 *   ttl(key) → ms until window resets
 *
 * For login lockout:
 *   setLock(key, ttlMs) → void
 *   isLocked(key) → boolean
 *   incrFails(key, ttlMs) → count
 *   clearFails(key) → void
 */

import {
  getRedis,
  isRedisAvailable as redisAvailable,
} from '@/lib/redis-client';

// ── Koneksi Redis ──
// Klien (lazy, satu per proses) dipusatkan di '@/lib/redis-client' karena dipakai
// juga oleh store pending-secret 2FA (F-11). Flag ketersediaan di-export oleh
// modul itu dan dibaca di sini sebagai fungsi supaya nilainya selalu terbaru.
function isRedisReady(): boolean {
  return redisAvailable();
}

// ── In-memory fallback store ──
interface MemoryEntry {
  count: number;
  resetTime: number;
}
const memStore = new Map<string, MemoryEntry>();

const memLockStore = new Map<string, number>(); // key → unlock timestamp
const memFailStore = new Map<string, { count: number; expireAt: number }>();

// Periodic cleanup for memory stores
let lastMemCleanup = Date.now();
const MEM_CLEANUP_INTERVAL = 5 * 60 * 1000;
function maybeCleanupMemory(): void {
  const now = Date.now();
  if (now - lastMemCleanup < MEM_CLEANUP_INTERVAL) return;
  lastMemCleanup = now;
  for (const [key, entry] of memStore) {
    if (now > entry.resetTime) memStore.delete(key);
  }
  for (const [key, unlockAt] of memLockStore) {
    if (unlockAt <= now) memLockStore.delete(key);
  }
  for (const [key, entry] of memFailStore) {
    if (entry.expireAt <= now) memFailStore.delete(key);
  }
}

// ── Public API ──

/**
 * Increment a counter for a rate-limit window.
 * Returns the current count in the window.
 */
export async function incrementRateLimit(
  key: string,
  windowMs: number
): Promise<number> {
  maybeCleanupMemory();
  const redis = await getRedis();

  if (redis && isRedisReady()) {
    // Redis: use INCR + EXPIRE (atomic)
    const redisKey = `rl:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      // First request in window — set TTL
      await redis.pexpire(redisKey, windowMs);
    }
    return count;
  }

  // In-memory fallback
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || now > entry.resetTime) {
    memStore.set(key, { count: 1, resetTime: now + windowMs });
    return 1;
  }
  entry.count++;
  return entry.count;
}

/**
 * Get remaining time (ms) until the rate limit window resets for a key.
 */
export async function getRateLimitTTL(key: string): Promise<number> {
  const redis = await getRedis();

  if (redis && isRedisReady()) {
    const ttl = await redis.pttl(`rl:${key}`);
    return ttl > 0 ? ttl : 0;
  }

  const entry = memStore.get(key);
  if (!entry) return 0;
  return Math.max(0, entry.resetTime - Date.now());
}

/**
 * Reset a rate limit key (e.g. after successful action).
 */
export async function resetRateLimit(key: string): Promise<void> {
  const redis = await getRedis();
  if (redis && isRedisReady()) {
    await redis.del(`rl:${key}`);
    return;
  }
  memStore.delete(key);
}

// ── Login lockout storage ──

/**
 * Set a lock for a key (login attempt tracking).
 * ttlMs = how long the lock lasts.
 */
export async function setLock(key: string, ttlMs: number): Promise<void> {
  const redis = await getRedis();
  if (redis && isRedisReady()) {
    await redis.set(`lock:${key}`, '1', 'PX', ttlMs);
    return;
  }
  memLockStore.set(key, Date.now() + ttlMs);
}

/**
 * Check if a key is currently locked.
 */
export async function isLocked(key: string): Promise<boolean> {
  maybeCleanupMemory();
  const redis = await getRedis();

  if (redis && isRedisReady()) {
    const val = await redis.get(`lock:${key}`);
    return val !== null;
  }

  const unlockAt = memLockStore.get(key);
  if (!unlockAt) return false;
  if (unlockAt <= Date.now()) {
    memLockStore.delete(key);
    return false;
  }
  return true;
}

/**
 * Increment failed attempts for a key, with a sliding TTL.
 * Returns the current count.
 */
export async function incrFails(key: string, ttlMs: number): Promise<number> {
  maybeCleanupMemory();
  const redis = await getRedis();

  if (redis && isRedisReady()) {
    const redisKey = `fails:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, ttlMs);
    }
    return count;
  }

  const now = Date.now();
  const entry = memFailStore.get(key);
  if (!entry || entry.expireAt <= now) {
    memFailStore.set(key, { count: 1, expireAt: now + ttlMs });
    return 1;
  }
  entry.count++;
  return entry.count;
}

/**
 * Clear failed attempts for a key (on successful login).
 */
export async function clearFails(key: string): Promise<void> {
  const redis = await getRedis();
  if (redis && isRedisReady()) {
    await redis.del(`fails:${key}`);
    await redis.del(`lock:${key}`);
    return;
  }
  memFailStore.delete(key);
  memLockStore.delete(key);
}

/**
 * Health check — is Redis connected and responsive?
 */
export async function checkRedisHealth(): Promise<{
  configured: boolean;
  connected: boolean;
}> {
  if (!process.env.REDIS_URL) {
    return { configured: false, connected: false };
  }
  const redis = await getRedis();
  if (!redis) return { configured: true, connected: false };
  try {
    await redis.ping();
    return { configured: true, connected: true };
  } catch {
    return { configured: true, connected: false };
  }
}
