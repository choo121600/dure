/**
 * TUI Logger
 *
 * File-based logger for TUI error tracking.
 * Writes to .dure/logs/tui.log for debugging purposes.
 */

import { mkdirSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export interface TuiLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, error?: Error, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/**
 * Format log entry as JSON line
 */
function formatLogEntry(
  level: string,
  message: string,
  error?: Error,
  context?: Record<string, unknown>
): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return JSON.stringify(entry);
}

/**
 * Create a file-based TUI logger
 */
export function createTuiLogger(projectRoot: string): TuiLogger {
  const logDir = join(projectRoot, '.dure', 'logs');
  const logFile = join(logDir, 'tui.log');

  // Ensure log directory exists
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  function writeLog(
    level: string,
    message: string,
    error?: Error,
    context?: Record<string, unknown>
  ): void {
    try {
      const entry = formatLogEntry(level, message, error, context);
      appendFileSync(logFile, entry + '\n');
    } catch {
      // Silently fail - we don't want logging errors to crash the TUI
    }
  }

  return {
    debug(message: string, context?: Record<string, unknown>): void {
      writeLog('debug', message, undefined, context);
    },

    info(message: string, context?: Record<string, unknown>): void {
      writeLog('info', message, undefined, context);
    },

    warn(message: string, error?: Error, context?: Record<string, unknown>): void {
      writeLog('warn', message, error, context);
    },

    error(message: string, error?: Error, context?: Record<string, unknown>): void {
      writeLog('error', message, error, context);
    },

    fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
      writeLog('fatal', message, error, context);
    },
  };
}

/**
 * No-op logger for when logging is disabled
 */
export function createNoOpTuiLogger(): TuiLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: (_message: string, _error?: Error, _context?: Record<string, unknown>) => {},
    error: (_message: string, _error?: Error, _context?: Record<string, unknown>) => {},
    fatal: (_message: string, _error?: Error, _context?: Record<string, unknown>) => {},
  };
}
