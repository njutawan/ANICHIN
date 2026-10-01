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
import path from 'path';
import { createHash } from 'crypto';

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

/**
 * SHA-256 hash of IP address — irreversible, privacy-safe.
 * Cannot reverse the hash to get the original IP.
 */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

/**
 * Rotate log file if it exceeds max size.
 * Skipped on serverless (no filesystem writes).
 */
function rotateIfNeeded() {
  if (isServerless) return;
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_FILE_SIZE) {
        // Move old file to .old
        if (fs.existsSync(OLD_LOG_FILE)) {
          fs.unlinkSync(OLD_LOG_FILE);
        }
        fs.renameSync(LOG_FILE, OLD_LOG_FILE);
      }
    }
  } catch {
    // Ignore rotation errors
  }
}

/**
 * Append a log entry to file (JSON Lines format).
 * Non-blocking — uses writeFileSync in try/catch.
 * SKIPPED on serverless (Vercel has read-only filesystem).
 */
function appendToFile(entry: LogEntry) {
  if (isServerless) return;
  try {
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // File write may fail — log to console as fallback (already done below)
  }
}

function log(entry: Omit<LogEntry, 'timestamp'>) {
  const fullEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

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
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(fullEntry));
    }
  }
}

export const auditLog = {
  rateLimitHit(ip: string, route: string, type: string) {
    log({
      level: 'warn',
      event: 'RATE_LIMIT_EXCEEDED',
      route,
      ipHash: hashIp(ip),
      message: `Rate limit exceeded for ${type}`,
      metadata: { limitType: type },
    });
  },

  apiError(route: string, method: string, statusCode: number, sanitizedMessage: string) {
    log({
      level: statusCode >= 500 ? 'error' : 'warn',
      event: 'API_ERROR',
      route,
      method,
      statusCode,
      message: sanitizedMessage,
    });
  },

  suspiciousRequest(ip: string, route: string, pattern: string) {
    log({
      level: 'critical',
      event: 'SUSPICIOUS_REQUEST',
      route,
      ipHash: hashIp(ip),
      message: `Potential ${pattern} detected`,
      metadata: { pattern },
    });
  },

  notFound(route: string, method: string) {
    log({
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
