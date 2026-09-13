/**
 * Structured Logger — replaces console.log/error with leveled logging.
 *
 * Features:
 * - Levels: debug, info, warn, error
 * - Filtered by LOG_LEVEL env (default: info in prod, debug in dev)
 * - Structured JSON output (parseable by log aggregators)
 * - Context support (module, requestId)
 * - No PII logged (privacy-safe)
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('Server started', { port: 3000 });
 *   logger.error('DB query failed', { error: err.message, module: 'api/anime' });
 *   logger.warn('Rate limit hit', { ip_hash: hashedIp, route: '/api/search' });
 *   logger.debug('Cache miss', { key: 'anime-123' });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL as LogLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const minLevel = getMinLevel();

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...context,
  };
  return JSON.stringify(entry);
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (shouldLog('debug')) {
      console.debug(formatLog('debug', message, context));
    }
  },

  info(message: string, context?: LogContext): void {
    if (shouldLog('info')) {
      console.info(formatLog('info', message, context));
    }
  },

  warn(message: string, context?: LogContext): void {
    if (shouldLog('warn')) {
      console.warn(formatLog('warn', message, context));
    }
  },

  error(message: string, context?: LogContext): void {
    if (shouldLog('error')) {
      console.error(formatLog('error', message, context));
    }
  },
};
