/**
 * Branded types for type-safe identifiers
 * Prevents mixing up different ID types at compile time
 */

import type { Result } from './result.js';
import { ok, err } from './result.js';
import { ValidationError, ErrorCodes } from './errors.js';

// ============================================================================
// Brand Type Utility
// ============================================================================

/**
 * Brand type utility - creates a nominal type from a structural type
 * The __brand property exists only at compile time
 *
 * @example
 * ```typescript
 * type UserId = Brand<string, 'UserId'>;
 * type OrderId = Brand<string, 'OrderId'>;
 *
 * const userId: UserId = createUserId('user-123');
 * const orderId: OrderId = createOrderId('order-456');
 *
 * // Type error: Cannot assign UserId to OrderId
 * const wrong: OrderId = userId;
 * ```
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

// ============================================================================
// ID Types
// ============================================================================

/**
 * Run ID - identifies a unique run
 * Format: run-YYYYMMDDHHMMSS (14 digits)
 */
export type RunId = Brand<string, 'RunId'>;

/**
 * CRP ID - identifies a Consultation Request Pack
 * Format: crp-XXX where XXX is alphanumeric
 */
export type CrpId = Brand<string, 'CrpId'>;

/**
 * VCR ID - identifies a Version Controlled Resolution
 * Format: vcr-XXX where XXX is alphanumeric
 */
export type VcrId = Brand<string, 'VcrId'>;

/**
 * Session Name - identifies a tmux session
 * Only alphanumeric, dash, and underscore allowed
 */
export type SessionName = Brand<string, 'SessionName'>;

/**
 * Mission ID - identifies a multi-phase mission
 * Format: mission-YYYYMMDDHHMMSS (14 digits)
 */
export type MissionId = Brand<string, 'MissionId'>;

/**
 * Phase ID - identifies a phase within a mission
 * Format: phase-XXX where XXX is alphanumeric
 */
export type PhaseId = Brand<string, 'PhaseId'>;

/**
 * Task ID - identifies a task within a phase
 * Format: task-XXX where XXX is alphanumeric
 */
export type TaskId = Brand<string, 'TaskId'>;

// ============================================================================
// Validation Patterns
// ============================================================================

/**
 * Pattern for valid run IDs: run-YYYYMMDDHHMMSS (14 digits)
 */
const RUN_ID_PATTERN = /^run-\d{14}$/;

/**
 * Pattern for valid CRP IDs: crp-XXX where XXX is alphanumeric
 */
const CRP_ID_PATTERN = /^crp-[a-zA-Z0-9_-]+$/;

/**
 * Pattern for valid VCR IDs: vcr-XXX where XXX is alphanumeric
 */
const VCR_ID_PATTERN = /^vcr-[a-zA-Z0-9_-]+$/;

/**
 * Pattern for valid session names: alphanumeric, dash, underscore
 */
const SESSION_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Maximum length for IDs
 */
const MAX_ID_LENGTH = 64;

/**
 * Maximum length for session names
 */
const MAX_SESSION_NAME_LENGTH = 64;

/**
 * Pattern for valid mission IDs: mission-YYYYMMDDHHMMSS (14 digits)
 */
const MISSION_ID_PATTERN = /^mission-\d{14}$/;

/**
 * Pattern for valid phase IDs: phase-XXX where XXX is alphanumeric
 */
const PHASE_ID_PATTERN = /^phase-[a-zA-Z0-9_-]+$/;

/**
 * Pattern for valid task IDs: task-XXX where XXX is alphanumeric
 */
const TASK_ID_PATTERN = /^task-[a-zA-Z0-9_-]+$/;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a run ID format
 * Run IDs must match the pattern: run-YYYYMMDDHHMMSS
 */
export function isValidRunId(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return RUN_ID_PATTERN.test(value);
}

/**
 * Validate a CRP ID format
 * CRP IDs should match patterns like: crp-001, crp-123, crp-{timestamp}
 */
export function isValidCrpId(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return CRP_ID_PATTERN.test(value) && value.length <= MAX_ID_LENGTH;
}

/**
 * Validate a VCR ID format
 * VCR IDs should match patterns like: vcr-001, vcr-123
 */
export function isValidVcrId(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return VCR_ID_PATTERN.test(value) && value.length <= MAX_ID_LENGTH;
}

/**
 * Validate a session name format
 */
export function isValidSessionName(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_SESSION_NAME_LENGTH &&
    SESSION_NAME_PATTERN.test(trimmed)
  );
}

/**
 * Validate a mission ID format
 * Mission IDs must match the pattern: mission-YYYYMMDDHHMMSS
 */
export function isValidMissionId(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return MISSION_ID_PATTERN.test(value);
}

/**
 * Validate a phase ID format
 * Phase IDs should match patterns like: phase-001, phase-setup
 */
export function isValidPhaseId(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return PHASE_ID_PATTERN.test(value) && value.length <= MAX_ID_LENGTH;
}

/**
 * Validate a task ID format
 * Task IDs should match patterns like: task-001, task-implement-feature
 */
export function isValidTaskId(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return TASK_ID_PATTERN.test(value) && value.length <= MAX_ID_LENGTH;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for RunId
 * Narrows string to RunId if valid
 */
export function isRunId(value: string): value is RunId {
  return isValidRunId(value);
}

/**
 * Type guard for CrpId
 * Narrows string to CrpId if valid
 */
export function isCrpId(value: string): value is CrpId {
  return isValidCrpId(value);
}

/**
 * Type guard for VcrId
 * Narrows string to VcrId if valid
 */
export function isVcrId(value: string): value is VcrId {
  return isValidVcrId(value);
}

/**
 * Type guard for SessionName
 * Narrows string to SessionName if valid
 */
export function isSessionName(value: string): value is SessionName {
  return isValidSessionName(value);
}

/**
 * Type guard for MissionId
 * Narrows string to MissionId if valid
 */
export function isMissionId(value: string): value is MissionId {
  return isValidMissionId(value);
}

/**
 * Type guard for PhaseId
 * Narrows string to PhaseId if valid
 */
export function isPhaseId(value: string): value is PhaseId {
  return isValidPhaseId(value);
}

/**
 * Type guard for TaskId
 * Narrows string to TaskId if valid
 */
export function isTaskId(value: string): value is TaskId {
  return isValidTaskId(value);
}

// ============================================================================
// Creation Functions (with validation)
// ============================================================================

/**
 * Create a validated RunId
 * Returns Result<RunId, ValidationError>
 *
 * @example
 * ```typescript
 * const result = createRunId('run-20240115120000');
 * if (isOk(result)) {
 *   const runId: RunId = result.data;
 * }
 * ```
 */
export function createRunId(value: string): Result<RunId, ValidationError> {
  if (!value || typeof value !== 'string') {
    return err(new ValidationError(
      'Invalid run ID: must be a non-empty string',
      ErrorCodes.VALIDATION_INVALID_RUN_ID,
      { field: 'runId', value }
    ));
  }

  if (!RUN_ID_PATTERN.test(value)) {
    return err(new ValidationError(
      'Invalid run ID format: must match pattern run-YYYYMMDDHHMMSS',
      ErrorCodes.VALIDATION_INVALID_RUN_ID,
      { field: 'runId', value, pattern: 'run-YYYYMMDDHHMMSS' }
    ));
  }

  return ok(value as RunId);
}

/**
 * Create a validated CrpId
 * Returns Result<CrpId, ValidationError>
 */
export function createCrpId(value: string): Result<CrpId, ValidationError> {
  if (!value || typeof value !== 'string') {
    return err(new ValidationError(
      'Invalid CRP ID: must be a non-empty string',
      ErrorCodes.VALIDATION_INVALID_CRP_ID,
      { field: 'crpId', value }
    ));
  }

  if (!CRP_ID_PATTERN.test(value)) {
    return err(new ValidationError(
      'Invalid CRP ID format: must match pattern crp-XXX',
      ErrorCodes.VALIDATION_INVALID_CRP_ID,
      { field: 'crpId', value }
    ));
  }

  if (value.length > MAX_ID_LENGTH) {
    return err(new ValidationError(
      `Invalid CRP ID: exceeds maximum length of ${MAX_ID_LENGTH}`,
      ErrorCodes.VALIDATION_INVALID_CRP_ID,
      { field: 'crpId', value, maxLength: MAX_ID_LENGTH }
    ));
  }

  return ok(value as CrpId);
}

/**
 * Create a validated VcrId
 * Returns Result<VcrId, ValidationError>
 */
export function createVcrId(value: string): Result<VcrId, ValidationError> {
  if (!value || typeof value !== 'string') {
    return err(new ValidationError(
      'Invalid VCR ID: must be a non-empty string',
      ErrorCodes.VALIDATION_INVALID_VCR_ID,
      { field: 'vcrId', value }
    ));
  }

  if (!VCR_ID_PATTERN.test(value)) {
    return err(new ValidationError(
      'Invalid VCR ID format: must match pattern vcr-XXX',
      ErrorCodes.VALIDATION_INVALID_VCR_ID,
      { field: 'vcrId', value }
    ));
  }

  if (value.length > MAX_ID_LENGTH) {
    return err(new ValidationError(
      `Invalid VCR ID: exceeds maximum length of ${MAX_ID_LENGTH}`,
      ErrorCodes.VALIDATION_INVALID_VCR_ID,
      { field: 'vcrId', value, maxLength: MAX_ID_LENGTH }
    ));
  }

  return ok(value as VcrId);
}

/**
 * Create a validated SessionName
 * Returns Result<SessionName, ValidationError>
 */
export function createSessionName(value: string): Result<SessionName, ValidationError> {
  if (!value || typeof value !== 'string') {
    return err(new ValidationError(
      'Invalid session name: must be a non-empty string',
      ErrorCodes.VALIDATION_INVALID_SESSION_NAME,
      { field: 'sessionName', value }
    ));
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return err(new ValidationError(
      'Invalid session name: cannot be empty',
      ErrorCodes.VALIDATION_INVALID_SESSION_NAME,
      { field: 'sessionName', value }
    ));
  }

  if (trimmed.length > MAX_SESSION_NAME_LENGTH) {
    return err(new ValidationError(
      `Invalid session name: exceeds maximum length of ${MAX_SESSION_NAME_LENGTH}`,
      ErrorCodes.VALIDATION_INVALID_SESSION_NAME,
      { field: 'sessionName', value, maxLength: MAX_SESSION_NAME_LENGTH }
    ));
  }

  if (!SESSION_NAME_PATTERN.test(trimmed)) {
    return err(new ValidationError(
      'Invalid session name: only alphanumeric characters, dashes, and underscores are allowed',
      ErrorCodes.VALIDATION_INVALID_SESSION_NAME,
      { field: 'sessionName', value }
    ));
  }

  return ok(trimmed as SessionName);
}

/**
 * Create a validated MissionId
 * Returns Result<MissionId, ValidationError>
 */
export function createMissionId(value: string): Result<MissionId, ValidationError> {
  if (!value || typeof value !== 'string') {
    return err(new ValidationError(
      'Invalid mission ID: must be a non-empty string',
      ErrorCodes.VALIDATION_INVALID_RUN_ID,
      { field: 'missionId', value }
    ));
  }

  if (!MISSION_ID_PATTERN.test(value)) {
    return err(new ValidationError(
      'Invalid mission ID format: must match pattern mission-YYYYMMDDHHMMSS',
      ErrorCodes.VALIDATION_INVALID_RUN_ID,
      { field: 'missionId', value, pattern: 'mission-YYYYMMDDHHMMSS' }
    ));
  }

  return ok(value as MissionId);
}

/**
 * Create a validated PhaseId
 * Returns Result<PhaseId, ValidationError>
 */
export function createPhaseId(value: string): Result<PhaseId, ValidationError> {
  if (!value || typeof value !== 'string') {
    return err(new ValidationError(
      'Invalid phase ID: must be a non-empty string',
      ErrorCodes.VALIDATION_INVALID_RUN_ID,
      { field: 'phaseId', value }
    ));
  }

  if (!PHASE_ID_PATTERN.test(value)) {
    return err(new ValidationError(
      'Invalid phase ID format: must match pattern phase-XXX',
      ErrorCodes.VALIDATION_INVALID_RUN_ID,
      { field: 'phaseId', value }
    ));
  }

  if (value.length > MAX_ID_LENGTH) {
    return err(new ValidationError(
      `Invalid phase ID: exceeds maximum length of ${MAX_ID_LENGTH}`,
      ErrorCodes.VALIDATION_INVALID_RUN_ID,
      { field: 'phaseId', value, maxLength: MAX_ID_LENGTH }
    ));
  }

  return ok(value as PhaseId);
}

/**
 * Create a validated TaskId
 * Returns Result<TaskId, ValidationError>
 */
export function createTaskId(value: string): Result<TaskId, ValidationError> {
  if (!value || typeof value !== 'string') {
    return err(new ValidationError(
      'Invalid task ID: must be a non-empty string',
      ErrorCodes.VALIDATION_INVALID_RUN_ID,
      { field: 'taskId', value }
    ));
  }

  if (!TASK_ID_PATTERN.test(value)) {
    return err(new ValidationError(
      'Invalid task ID format: must match pattern task-XXX',
      ErrorCodes.VALIDATION_INVALID_RUN_ID,
      { field: 'taskId', value }
    ));
  }

  if (value.length > MAX_ID_LENGTH) {
    return err(new ValidationError(
      `Invalid task ID: exceeds maximum length of ${MAX_ID_LENGTH}`,
      ErrorCodes.VALIDATION_INVALID_RUN_ID,
      { field: 'taskId', value, maxLength: MAX_ID_LENGTH }
    ));
  }

  return ok(value as TaskId);
}

// ============================================================================
// Unsafe Creation Functions (for trusted sources)
// ============================================================================

/**
 * Create a RunId without validation (for trusted sources like database)
 * Use only when the value is known to be valid
 */
export function unsafeCreateRunId(value: string): RunId {
  return value as RunId;
}

/**
 * Create a CrpId without validation (for trusted sources)
 */
export function unsafeCreateCrpId(value: string): CrpId {
  return value as CrpId;
}

/**
 * Create a VcrId without validation (for trusted sources)
 */
export function unsafeCreateVcrId(value: string): VcrId {
  return value as VcrId;
}

/**
 * Create a SessionName without validation (for trusted sources)
 */
export function unsafeCreateSessionName(value: string): SessionName {
  return value as SessionName;
}

/**
 * Create a MissionId without validation (for trusted sources)
 */
export function unsafeCreateMissionId(value: string): MissionId {
  return value as MissionId;
}

/**
 * Create a PhaseId without validation (for trusted sources)
 */
export function unsafeCreatePhaseId(value: string): PhaseId {
  return value as PhaseId;
}

/**
 * Create a TaskId without validation (for trusted sources)
 */
export function unsafeCreateTaskId(value: string): TaskId {
  return value as TaskId;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract the raw string value from a branded type
 * Useful when interfacing with external APIs that expect plain strings
 */
export function unwrapBrand<T extends Brand<string, string>>(branded: T): string {
  return branded as string;
}

/**
 * Generate a new RunId with current timestamp
 */
export function generateRunId(): RunId {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14);
  return `run-${timestamp}` as RunId;
}

/**
 * Generate a new CrpId with given suffix
 */
export function generateCrpId(suffix: string | number): Result<CrpId, ValidationError> {
  const value = `crp-${suffix}`;
  return createCrpId(value);
}

/**
 * Generate a new VcrId with given suffix
 */
export function generateVcrId(suffix: string | number): Result<VcrId, ValidationError> {
  const value = `vcr-${suffix}`;
  return createVcrId(value);
}

/**
 * Generate a new MissionId with current timestamp
 */
export function generateMissionId(): MissionId {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14);
  return `mission-${timestamp}` as MissionId;
}
