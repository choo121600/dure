/**
 * Custom error classes for Dure
 * Provides structured error handling with error codes and context
 */

import type { AgentName } from './index.js';

/**
 * Error codes for categorizing errors
 */
export const ErrorCodes = {
  // Validation errors
  VALIDATION_INVALID_PATH: 'VALIDATION_INVALID_PATH',
  VALIDATION_INVALID_SESSION_NAME: 'VALIDATION_INVALID_SESSION_NAME',
  VALIDATION_INVALID_BRIEFING: 'VALIDATION_INVALID_BRIEFING',
  VALIDATION_INVALID_DECISION: 'VALIDATION_INVALID_DECISION',
  VALIDATION_INVALID_RUN_ID: 'VALIDATION_INVALID_RUN_ID',
  VALIDATION_INVALID_CRP_ID: 'VALIDATION_INVALID_CRP_ID',
  VALIDATION_INVALID_VCR_ID: 'VALIDATION_INVALID_VCR_ID',
  VALIDATION_INVALID_PORT: 'VALIDATION_INVALID_PORT',
  VALIDATION_INVALID_MODEL: 'VALIDATION_INVALID_MODEL',
  VALIDATION_INVALID_AGENT: 'VALIDATION_INVALID_AGENT',
  VALIDATION_PATH_TRAVERSAL: 'VALIDATION_PATH_TRAVERSAL',
  VALIDATION_NULL_BYTES: 'VALIDATION_NULL_BYTES',
  VALIDATION_MAX_LENGTH_EXCEEDED: 'VALIDATION_MAX_LENGTH_EXCEEDED',
  VALIDATION_INVALID_CONFIG: 'VALIDATION_INVALID_CONFIG',

  // State errors
  STATE_NOT_FOUND: 'STATE_NOT_FOUND',
  STATE_LOAD_FAILED: 'STATE_LOAD_FAILED',
  STATE_SAVE_FAILED: 'STATE_SAVE_FAILED',
  STATE_INVALID: 'STATE_INVALID',
  STATE_ALREADY_EXISTS: 'STATE_ALREADY_EXISTS',

  // Agent errors
  AGENT_START_FAILED: 'AGENT_START_FAILED',
  AGENT_EXECUTION_FAILED: 'AGENT_EXECUTION_FAILED',
  AGENT_OUTPUT_INVALID: 'AGENT_OUTPUT_INVALID',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_ALREADY_RUNNING: 'AGENT_ALREADY_RUNNING',

  // Recovery errors
  RECOVERY_FAILED: 'RECOVERY_FAILED',
  RECOVERY_EXHAUSTED: 'RECOVERY_EXHAUSTED',
  RECOVERY_NOT_POSSIBLE: 'RECOVERY_NOT_POSSIBLE',
  RECOVERY_STRATEGY_NOT_FOUND: 'RECOVERY_STRATEGY_NOT_FOUND',

  // Timeout errors
  TIMEOUT_AGENT: 'TIMEOUT_AGENT',
  TIMEOUT_OPERATION: 'TIMEOUT_OPERATION',
  TIMEOUT_INACTIVITY: 'TIMEOUT_INACTIVITY',

  // File system errors
  FS_READ_FAILED: 'FS_READ_FAILED',
  FS_WRITE_FAILED: 'FS_WRITE_FAILED',
  FS_NOT_FOUND: 'FS_NOT_FOUND',
  FS_PERMISSION_DENIED: 'FS_PERMISSION_DENIED',

  // Tmux errors
  TMUX_SESSION_NOT_FOUND: 'TMUX_SESSION_NOT_FOUND',
  TMUX_COMMAND_FAILED: 'TMUX_COMMAND_FAILED',
  TMUX_PANE_NOT_FOUND: 'TMUX_PANE_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Base error class for all Dure errors
 */
export class OrchestraError extends Error {
  readonly code: ErrorCode;
  readonly context?: Record<string, unknown>;
  readonly timestamp: Date;
  readonly originalCause?: Error;

  constructor(
    message: string,
    code: ErrorCode,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message);
    this.name = 'OrchestraError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.originalCause = cause;

    // Maintain proper stack trace (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging/transmission
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.originalCause ? {
        name: this.originalCause.name,
        message: this.originalCause.message,
        stack: this.originalCause.stack,
      } : undefined,
    };
  }
}

/**
 * Validation error - thrown when input validation fails
 */
export class ValidationError extends OrchestraError {
  readonly field?: string;
  readonly value?: unknown;

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.VALIDATION_INVALID_PATH,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, code, context, cause);
    this.name = 'ValidationError';
    this.field = context?.field as string | undefined;
    this.value = context?.value;
  }
}

/**
 * State error - thrown when state operations fail
 */
export class StateError extends OrchestraError {
  readonly runId?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.STATE_NOT_FOUND,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, code, context, cause);
    this.name = 'StateError';
    this.runId = context?.runId as string | undefined;
  }
}

/**
 * Agent error - thrown when agent operations fail
 */
export class AgentError extends OrchestraError {
  readonly agent?: AgentName;

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.AGENT_EXECUTION_FAILED,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, code, context, cause);
    this.name = 'AgentError';
    this.agent = context?.agent as AgentName | undefined;
  }
}

/**
 * Recovery error - thrown when error recovery fails
 */
export class RecoveryError extends OrchestraError {
  readonly agent?: AgentName;
  readonly attempts?: number;

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.RECOVERY_FAILED,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, code, context, cause);
    this.name = 'RecoveryError';
    this.agent = context?.agent as AgentName | undefined;
    this.attempts = context?.attempts as number | undefined;
  }
}

/**
 * Timeout error - thrown when operations timeout
 */
export class TimeoutError extends OrchestraError {
  readonly timeoutMs?: number;
  readonly agent?: AgentName;

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.TIMEOUT_OPERATION,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, code, context, cause);
    this.name = 'TimeoutError';
    this.timeoutMs = context?.timeoutMs as number | undefined;
    this.agent = context?.agent as AgentName | undefined;
  }
}

/**
 * File system error - thrown when file operations fail
 */
export class FileSystemError extends OrchestraError {
  readonly path?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.FS_READ_FAILED,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, code, context, cause);
    this.name = 'FileSystemError';
    this.path = context?.path as string | undefined;
  }
}

/**
 * Tmux error - thrown when tmux operations fail
 */
export class TmuxError extends OrchestraError {
  readonly sessionName?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.TMUX_COMMAND_FAILED,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, code, context, cause);
    this.name = 'TmuxError';
    this.sessionName = context?.sessionName as string | undefined;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a validation error for invalid path
 */
export function createPathValidationError(
  message: string,
  path: string,
  cause?: Error
): ValidationError {
  return new ValidationError(message, ErrorCodes.VALIDATION_INVALID_PATH, { path }, cause);
}

/**
 * Create a validation error for path traversal attempt
 */
export function createPathTraversalError(path: string, baseDir: string): ValidationError {
  return new ValidationError(
    'Invalid path: path traversal detected',
    ErrorCodes.VALIDATION_PATH_TRAVERSAL,
    { path, baseDir }
  );
}

/**
 * Create a validation error for null bytes in input
 */
export function createNullBytesError(field: string, value: string): ValidationError {
  return new ValidationError(
    `Invalid ${field}: null bytes are not allowed`,
    ErrorCodes.VALIDATION_NULL_BYTES,
    { field, value: value.slice(0, 100) } // Truncate for safety
  );
}

/**
 * Create a validation error for max length exceeded
 */
export function createMaxLengthError(
  field: string,
  actualLength: number,
  maxLength: number
): ValidationError {
  return new ValidationError(
    `Invalid ${field}: exceeds maximum length of ${maxLength}`,
    ErrorCodes.VALIDATION_MAX_LENGTH_EXCEEDED,
    { field, actualLength, maxLength }
  );
}

/**
 * Create a validation error for invalid session name
 */
export function createSessionNameError(message: string, name: string): ValidationError {
  return new ValidationError(
    message,
    ErrorCodes.VALIDATION_INVALID_SESSION_NAME,
    { field: 'sessionName', value: name }
  );
}

/**
 * Create a state not found error
 */
export function createStateNotFoundError(runId?: string): StateError {
  return new StateError(
    'No state found',
    ErrorCodes.STATE_NOT_FOUND,
    runId ? { runId } : undefined
  );
}

/**
 * Create a state load failed error
 */
export function createStateLoadError(path: string, cause?: Error): StateError {
  return new StateError(
    'Failed to load state.json',
    ErrorCodes.STATE_LOAD_FAILED,
    { path },
    cause
  );
}

/**
 * Create a state save failed error
 */
export function createStateSaveError(path: string, cause?: Error): StateError {
  return new StateError(
    'Failed to save state.json',
    ErrorCodes.STATE_SAVE_FAILED,
    { path },
    cause
  );
}

/**
 * Create an agent error
 */
export function createAgentError(
  agent: AgentName,
  message: string,
  cause?: Error
): AgentError {
  return new AgentError(
    message,
    ErrorCodes.AGENT_EXECUTION_FAILED,
    { agent },
    cause
  );
}

/**
 * Create an agent start failed error
 */
export function createAgentStartError(agent: AgentName, cause?: Error): AgentError {
  return new AgentError(
    `Failed to start agent: ${agent}`,
    ErrorCodes.AGENT_START_FAILED,
    { agent },
    cause
  );
}

/**
 * Create a recovery exhausted error
 */
export function createRecoveryExhaustedError(
  agent: AgentName,
  attempts: number,
  cause?: Error
): RecoveryError {
  return new RecoveryError(
    `Recovery failed after ${attempts} attempts`,
    ErrorCodes.RECOVERY_EXHAUSTED,
    { agent, attempts },
    cause
  );
}

/**
 * Create a timeout error for an agent
 */
export function createAgentTimeoutError(
  agent: AgentName,
  timeoutMs: number
): TimeoutError {
  return new TimeoutError(
    `Agent ${agent} timed out after ${timeoutMs}ms`,
    ErrorCodes.TIMEOUT_AGENT,
    { agent, timeoutMs }
  );
}

/**
 * Create an inactivity timeout error
 */
export function createInactivityTimeoutError(
  agent: AgentName,
  inactivityMs: number
): TimeoutError {
  return new TimeoutError(
    `Agent ${agent} inactive for ${inactivityMs}ms`,
    ErrorCodes.TIMEOUT_INACTIVITY,
    { agent, inactivityMs }
  );
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an error is an OrchestraError
 */
export function isOrchestraError(error: unknown): error is OrchestraError {
  return error instanceof OrchestraError;
}

/**
 * Check if an error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Check if an error is a StateError
 */
export function isStateError(error: unknown): error is StateError {
  return error instanceof StateError;
}

/**
 * Check if an error is an AgentError
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

/**
 * Check if an error is a RecoveryError
 */
export function isRecoveryError(error: unknown): error is RecoveryError {
  return error instanceof RecoveryError;
}

/**
 * Check if an error is a TimeoutError
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

/**
 * Check if an error has a specific error code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return isOrchestraError(error) && error.code === code;
}
