/**
 * Structured logging utilities for Dure
 * Provides a consistent logging interface with context support
 */

import pino from 'pino';
import type { AgentName, Phase } from '../types/index.js';

// ============================================================================
// Log Level Constants
// ============================================================================

export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
} as const;

export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

// ============================================================================
// Log Context Types
// ============================================================================

/**
 * Context information to include with log entries
 */
export interface LogContext {
  runId?: string;
  agent?: AgentName;
  phase?: Phase;
  iteration?: number;
  [key: string]: unknown;
}

/**
 * Serialized error information
 */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: SerializedError;
  context?: Record<string, unknown>;
}

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Structured logger interface
 * Provides consistent logging methods with context support
 */
export interface Logger {
  /**
   * Log debug level message
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log info level message
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log warning level message
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log error level message with optional error object
   */
  error(message: string, error?: Error, context?: LogContext): void;

  /**
   * Log fatal level message with optional error object
   */
  fatal(message: string, error?: Error, context?: LogContext): void;

  /**
   * Create a child logger with bound context
   */
  child(context: LogContext): Logger;

  /**
   * Check if a log level is enabled
   */
  isLevelEnabled(level: LogLevelType): boolean;
}

// ============================================================================
// Error Serialization
// ============================================================================

/**
 * Serialize an error object for logging
 * Handles nested cause chains and custom error properties
 */
export function serializeError(error: Error): SerializedError {
  const serialized: SerializedError = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  // Handle error code (common in Node.js errors)
  if ('code' in error && typeof error.code === 'string') {
    serialized.code = error.code;
  }

  // Handle error context (from OrchestraError)
  if ('context' in error && typeof error.context === 'object') {
    serialized.context = error.context as Record<string, unknown>;
  }

  // Handle cause chain (ES2022+)
  if (error.cause instanceof Error) {
    serialized.cause = serializeError(error.cause);
  }

  // Handle originalCause (from OrchestraError)
  if ('originalCause' in error && error.originalCause instanceof Error) {
    serialized.cause = serializeError(error.originalCause);
  }

  return serialized;
}

// ============================================================================
// Pino Logger Implementation
// ============================================================================

/**
 * Logger implementation using Pino
 */
export class PinoLogger implements Logger {
  private readonly pino: pino.Logger;

  constructor(pinoInstance: pino.Logger) {
    this.pino = pinoInstance;
  }

  debug(message: string, context?: LogContext): void {
    if (context) {
      this.pino.debug(context, message);
    } else {
      this.pino.debug(message);
    }
  }

  info(message: string, context?: LogContext): void {
    if (context) {
      this.pino.info(context, message);
    } else {
      this.pino.info(message);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (context) {
      this.pino.warn(context, message);
    } else {
      this.pino.warn(message);
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const logContext = {
      ...context,
      ...(error ? { err: serializeError(error) } : {}),
    };

    if (Object.keys(logContext).length > 0) {
      this.pino.error(logContext, message);
    } else {
      this.pino.error(message);
    }
  }

  fatal(message: string, error?: Error, context?: LogContext): void {
    const logContext = {
      ...context,
      ...(error ? { err: serializeError(error) } : {}),
    };

    if (Object.keys(logContext).length > 0) {
      this.pino.fatal(logContext, message);
    } else {
      this.pino.fatal(message);
    }
  }

  child(context: LogContext): Logger {
    return new PinoLogger(this.pino.child(context));
  }

  isLevelEnabled(level: LogLevelType): boolean {
    return this.pino.isLevelEnabled(level);
  }
}

// ============================================================================
// No-Op Logger Implementation
// ============================================================================

/**
 * No-op logger that discards all log messages
 * Useful for testing or when logging is disabled
 */
export class NoOpLogger implements Logger {
  debug(_message: string, _context?: LogContext): void {
    // No-op
  }

  info(_message: string, _context?: LogContext): void {
    // No-op
  }

  warn(_message: string, _context?: LogContext): void {
    // No-op
  }

  error(_message: string, _error?: Error, _context?: LogContext): void {
    // No-op
  }

  fatal(_message: string, _error?: Error, _context?: LogContext): void {
    // No-op
  }

  child(_context: LogContext): Logger {
    return this;
  }

  isLevelEnabled(_level: LogLevelType): boolean {
    return false;
  }
}

// ============================================================================
// Console Logger Implementation
// ============================================================================

/**
 * Simple console logger for development/testing
 */
export class ConsoleLogger implements Logger {
  private readonly context: LogContext;
  private readonly minLevel: LogLevelType;
  private readonly levelPriority: Record<LogLevelType, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };

  constructor(context: LogContext = {}, minLevel: LogLevelType = LogLevel.DEBUG) {
    this.context = context;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevelType): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const ctx = { ...this.context, ...context };
    const contextStr = Object.keys(ctx).length > 0 ? ` ${JSON.stringify(ctx)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const ctx = error ? { ...context, err: serializeError(error) } : context;
      console.error(this.formatMessage('error', message, ctx));
    }
  }

  fatal(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog(LogLevel.FATAL)) {
      const ctx = error ? { ...context, err: serializeError(error) } : context;
      console.error(this.formatMessage('fatal', message, ctx));
    }
  }

  child(context: LogContext): Logger {
    return new ConsoleLogger({ ...this.context, ...context }, this.minLevel);
  }

  isLevelEnabled(level: LogLevelType): boolean {
    return this.shouldLog(level);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a child logger with additional context
 */
export function createChildLogger(parent: Logger, context: LogContext): Logger {
  return parent.child(context);
}

/**
 * Create a Pino-based logger with standard configuration
 */
export function createPinoLogger(options?: {
  level?: LogLevelType;
  pretty?: boolean;
  name?: string;
}): Logger {
  const {
    level = LogLevel.INFO,
    pretty = process.env.NODE_ENV === 'development',
    name,
  } = options ?? {};

  const pinoInstance = pino({
    level,
    name,
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });

  return new PinoLogger(pinoInstance);
}

/**
 * Create a no-op logger
 */
export function createNoOpLogger(): Logger {
  return new NoOpLogger();
}

/**
 * Create a console logger
 */
export function createConsoleLogger(minLevel: LogLevelType = LogLevel.DEBUG): Logger {
  return new ConsoleLogger({}, minLevel);
}

// ============================================================================
// Default Logger Instance
// ============================================================================

/**
 * Default logger instance
 * Uses Pino in production, console in development when pino-pretty is not available
 */
let defaultLogger: Logger | null = null;

/**
 * Get or create the default logger instance
 */
export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    try {
      defaultLogger = createPinoLogger();
    } catch {
      // Fall back to console logger if Pino fails
      defaultLogger = createConsoleLogger();
    }
  }
  return defaultLogger;
}

/**
 * Set the default logger instance
 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}
