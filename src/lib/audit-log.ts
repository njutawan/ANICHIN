/**
 * Security Audit Logger — Multi-target persistent logging
 *
 * Logs security-relevant events WITHOUT storing PII.
 *
 * Targets:
 * - Vercel/serverless: in-memory buffer + console (Vercel captures stdout)
 * - Docker/self-hosted: in-memory + file (logs/audit.jsonl, append-only, 10MB rotation)
 *
 * In production, replace with Winston/Pino/Datadog for advanced features
 * (log aggregation, search, alerting, retention policies).
 */

import { logger } from '@/lib/logger';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createHmac, randomBytes } from 'crypto';

type LogLevel = 'info' | 'warn' | 'error' | 'critical';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  route?: string;
  method?: string;
  ipHash?: string;
  statusCode?: number;
  message?: string;
  metadata?: Record<string, string | number | boolean>;
}

// ── Detect environment ──
// Vercel serverless has read-only filesystem — can't write to logs/
// Vercel sets VERCEL=1 automatically
const isVercel = process.env.VERCEL === '1';
const isServerless = isVercel || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;

// ── File-based logging (only for non-serverless) ──
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.jsonl');
const OLD_LOG_FILE = path.join(LOG_DIR, 'audit.old.jsonl');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure log directory exists (only if not serverless)
if (!isServerless) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch {
    // Directory creation may fail in read-only environments — fall back to in-memory only
  }
}

// In-memory buffer (for quick access without file read)
// On Vercel, this is per-invocation only (resets between cold starts)
const logs: LogEntry[] = [];
const MAX_LOGS = 5000;

// Serial write queue — keeps file writes ordered and off the request path.
let writeQueue: Promise<void> = Promise.resolve();

// ── IP hashing salt ──
// SHA-256 tanpa salt TIDAK privacy-safe untuk IP: ruang IPv4 hanya 2^32, jadi
// seluruh tabel bisa di-brute-force dalam hitungan menit di GPU. HMAC dengan
// salt rahasia membuat hash tidak bisa dibalik tanpa salt.
// Set IP_HASH_SALT di produksi. Bila kosong, dipakai salt acak per-proses
// (hash tetap tidak reversibel, tapi berubah tiap restart — korelasi lintas
// restart hilang, jadi tetap set env-nya bila butuh analisis jangka panjang).
let ipHashSaltPromise: Promise<string> | null = null;
let ephemeralSaltWarned = false;

async function getIpHashSalt(): Promise<string> {
  if (!ipHashSaltPromise) {
    const configured = process.env.IP_HASH_SALT;
    if (configured && configured.length >= 16) {
      ipHashSaltPromise = Promise.resolve(configured);
    } else {
      if (process.env.NODE_ENV === 'production' && !ephemeralSaltWarned) {
        ephemeralSaltWarned = true;
        logger.warn(
          '[audit] IP_HASH_SALT not set — using a random per-process salt. ' +
            'Set IP_HASH_SALT for stable, non-reversible IP hashing.'
        );
      }
      ipHashSaltPromise = Promise.resolve(randomBytes(32).toString('hex'));
    }
  }
  return ipHashSaltPromise;
}

/**
 * HMAC-SHA256 of an IP address, keyed with a secret salt.
 * Irreversible (tanpa salt) dan privacy-safe. Output 16 hex chars.
 */
async function hashIp(ip: string): Promise<string> {
  const salt = await getIpHashSalt();
  return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 16);
}

/**
 * Rotate log file if it exceeds max size (async — lihat appendToFile).
 * Skipped on serverless (no filesystem writes).
 */
async function rotateIfNeeded() {
  if (isServerless) return;
  try {
    const stats = await fsp.stat(LOG_FILE);
    if (stats.size > MAX_FILE_SIZE) {
      // Move old file to .old
      await fsp.rm(OLD_LOG_FILE, { force: true });
      await fsp.rename(LOG_FILE, OLD_LOG_FILE);
    }
  } catch {
    // Ignore rotation errors (file may not exist yet)
  }
}

/**
 * Append a log entry to file (JSON Lines format).
 *
 * Non-blocking: memakai `fs.promises.appendFile` + antrean serial, sehingga
 * tidak ada `appendFileSync` di jalur request (sebelumnya setiap rate-limit
 * hit / API error memblokir event loop). Antrean menjaga urutan penulisan dan
 * mencegah penulisan bersamaan ke file yang sama.
 *
 * SKIPPED on serverless (Vercel has read-only filesystem).
 */
function appendToFile(entry: LogEntry) {
  if (isServerless) return;

  // Rotasi juga async supaya tidak ada statSync/renameSync di event loop.
  writeQueue = writeQueue
    .then(async () => {
      await rotateIfNeeded();
      await fsp.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
    })
    .catch(() => {
      // File write may fail — log to console as fallback (already done below)
    });
}

async function log(entry: Omit<LogEntry, 'timestamp'>) {
  const fullEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  // Salted hash — hanya untuk event yang membawa IP.
  if (fullEntry.ipHash) {
    fullEntry.ipHash = await hashIp(fullEntry.ipHash);
  }

  // Add to in-memory buffer (works everywhere, but ephemeral on serverless)
  logs.push(fullEntry);
  if (logs.length > MAX_LOGS) logs.shift();

  // Append to file (only on persistent filesystem — Docker/self-hosted)
  appendToFile(fullEntry);

  // Console output for development + Vercel log capture
  // Vercel captures console.error/warn automatically and makes them searchable in dashboard
  if (entry.level === 'error' || entry.level === 'critical') {
    logger.error(JSON.stringify(fullEntry));
  } else if (entry.level === 'warn') {
    logger.warn(JSON.stringify(fullEntry));
  } else if (process.env.NODE_ENV !== 'production' || isVercel) {
    // Log info-level too on Vercel (free log search) + dev
    if (entry.level === 'info') {
      console.log(JSON.stringify(fullEntry));
    }
  }
}

export const auditLog = {
  async rateLimitHit(ip: string, route: string, type: string) {
    await log({
      level: 'warn',
      event: 'RATE_LIMIT_EXCEEDED',
      route,
      ipHash: ip, // di-hash (HMAC + salt) di dalam log()
      message: `Rate limit exceeded for ${type}`,
      metadata: { limitType: type },
    });
  },

  async apiError(route: string, method: string, statusCode: number, sanitizedMessage: string) {
    await log({
      level: statusCode >= 500 ? 'error' : 'warn',
      event: 'API_ERROR',
      route,
      method,
      statusCode,
      message: sanitizedMessage,
    });
  },

  async suspiciousRequest(ip: string, route: string, pattern: string) {
    await log({
      level: 'critical',
      event: 'SUSPICIOUS_REQUEST',
      route,
      ipHash: ip, // di-hash (HMAC + salt) di dalam log()
      message: `Potential ${pattern} detected`,
      metadata: { pattern },
    });
  },

  async notFound(route: string, method: string) {
    await log({
      level: 'info',
      event: 'NOT_FOUND',
      route,
      method,
      statusCode: 404,
    });
  },

  /** Get recent logs from in-memory buffer (for admin/debugging — never expose to public) */
  getRecent(count: number = 50): LogEntry[] {
    return logs.slice(-count);
  },

  /** Read logs from file (for admin/debugging).
   *  Returns empty array on serverless (no file access). */
  readFromFile(count: number = 100): LogEntry[] {
    if (isServerless) return []; // No file access on Vercel
    try {
      if (!fs.existsSync(LOG_FILE)) return [];
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      const lines = content.trim().split('\n').slice(-count);
      return lines.map(line => JSON.parse(line));
    } catch {
      return [];
    }
  },

  /** Clear in-memory logs (file logs persist on Docker, N/A on Vercel) */
  clear() {
    logs.length = 0;
  },

  /** Get log file path (for monitoring/alerting systems).
   *  Returns null on serverless (no file). */
  getLogFilePath(): string | null {
    return isServerless ? null : LOG_FILE;
  },

  /** Whether file-based logging is active (false on Vercel) */
  isFileLoggingEnabled(): boolean {
    return !isServerless;
  },
};
