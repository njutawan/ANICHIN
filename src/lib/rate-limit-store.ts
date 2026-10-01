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

import { logger } from '@/lib/logger';
import type Redis from 'ioredis';

// ── Lazy Redis connection (only initialized if REDIS_URL is set) ──
let redisClient: Redis | null = null;
let redisInitPromise: Promise<Redis | null> | null = null;
let redisAvailable = false;

function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

async function getRedis(): Promise<Redis | null> {
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
      logger.warn('[redis] init failed, falling back to in-memory', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  })();

  return redisInitPromise;
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

  if (redis && redisAvailable) {
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

  if (redis && redisAvailable) {
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
  if (redis && redisAvailable) {
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
  if (redis && redisAvailable) {
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

  if (redis && redisAvailable) {
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

  if (redis && redisAvailable) {
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
  if (redis && redisAvailable) {
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
  if (!isRedisConfigured()) {
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
