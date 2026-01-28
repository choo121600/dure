/**
 * Input sanitization utilities for security
 * Prevents command injection, path traversal, and other security vulnerabilities
 */

import { resolve, normalize, isAbsolute } from 'path';
import type { Result } from '../types/index.js';
import { ok, err } from '../types/index.js';
import {
  ValidationError,
  ErrorCodes,
  createPathValidationError,
  createPathTraversalError,
  createNullBytesError,
  createMaxLengthError,
  createSessionNameError,
} from '../types/index.js';

/**
 * Whitelist of allowed characters for session names
 * Only alphanumeric, dash, and underscore
 */
const SESSION_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Pattern for valid run IDs: run-YYYYMMDDHHMMSS (14 digits)
 */
const RUN_ID_PATTERN = /^run-\d{14}$/;

/**
 * Shell metacharacters that could be used for command injection
 */
const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!#*?~^\n\r]/g;

/**
 * Maximum allowed briefing length (100KB)
 */
export const MAX_BRIEFING_LENGTH = 100000;

/**
 * Maximum allowed session name length
 */
export const MAX_SESSION_NAME_LENGTH = 64;

/**
 * Maximum allowed path length
 */
export const MAX_PATH_LENGTH = 4096;

/**
 * Sanitize a file path to prevent path traversal attacks
 * - Normalizes the path
 * - Ensures path stays within the allowed base directory
 * - Rejects paths with null bytes
 *
 * @param inputPath - The path to sanitize
 * @param baseDir - Optional base directory to constrain the path
 * @returns The sanitized absolute path
 * @throws Error if path is invalid or attempts traversal outside baseDir
 */
export function sanitizePath(inputPath: string, baseDir?: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string');
  }

  // Check for null bytes (used in some attacks)
  if (inputPath.includes('\0')) {
    throw new Error('Invalid path: null bytes are not allowed');
  }

  // Check path length
  if (inputPath.length > MAX_PATH_LENGTH) {
    throw new Error(`Invalid path: path exceeds maximum length of ${MAX_PATH_LENGTH}`);
  }

  // Normalize the path to resolve .. and . segments
  const normalizedPath = normalize(inputPath);

  // If baseDir is provided, ensure the path stays within it
  if (baseDir) {
    const resolvedBase = resolve(baseDir);
    const resolvedPath = isAbsolute(normalizedPath)
      ? resolve(normalizedPath)
      : resolve(resolvedBase, normalizedPath);

    // Ensure the resolved path starts with the base directory
    if (!resolvedPath.startsWith(resolvedBase + '/') && resolvedPath !== resolvedBase) {
      throw new Error('Invalid path: path traversal detected');
    }

    return resolvedPath;
  }

  // Return the normalized path (or resolve it if relative)
  return isAbsolute(normalizedPath) ? normalizedPath : resolve(normalizedPath);
}

/**
 * Sanitize a file path with Result pattern (safe version)
 * Returns Result<string, ValidationError> instead of throwing
 *
 * @param inputPath - The path to sanitize
 * @param baseDir - Optional base directory to constrain the path
 * @returns Result containing the sanitized path or a ValidationError
 */
export function sanitizePathSafe(inputPath: string, baseDir?: string): Result<string, ValidationError> {
  if (!inputPath || typeof inputPath !== 'string') {
    return err(createPathValidationError(
      'Invalid path: path must be a non-empty string',
      inputPath ?? ''
    ));
  }

  // Check for null bytes (used in some attacks)
  if (inputPath.includes('\0')) {
    return err(createNullBytesError('path', inputPath));
  }

  // Check path length
  if (inputPath.length > MAX_PATH_LENGTH) {
    return err(createMaxLengthError('path', inputPath.length, MAX_PATH_LENGTH));
  }

  // Normalize the path to resolve .. and . segments
  const normalizedPath = normalize(inputPath);

  // If baseDir is provided, ensure the path stays within it
  if (baseDir) {
    const resolvedBase = resolve(baseDir);
    const resolvedPath = isAbsolute(normalizedPath)
      ? resolve(normalizedPath)
      : resolve(resolvedBase, normalizedPath);

    // Ensure the resolved path starts with the base directory
    if (!resolvedPath.startsWith(resolvedBase + '/') && resolvedPath !== resolvedBase) {
      return err(createPathTraversalError(inputPath, baseDir));
    }

    return ok(resolvedPath);
  }

  // Return the normalized path (or resolve it if relative)
  return ok(isAbsolute(normalizedPath) ? normalizedPath : resolve(normalizedPath));
}

/**
 * Sanitize a tmux session name
 * - Only allows alphanumeric characters, dashes, and underscores
 * - Enforces maximum length
 *
 * @param name - The session name to sanitize
 * @returns The sanitized session name
 * @throws Error if session name contains invalid characters
 */
export function sanitizeSessionName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Invalid session name: name must be a non-empty string');
  }

  // Trim whitespace
  const trimmed = name.trim();

  // Check length
  if (trimmed.length > MAX_SESSION_NAME_LENGTH) {
    throw new Error(`Invalid session name: exceeds maximum length of ${MAX_SESSION_NAME_LENGTH}`);
  }

  if (trimmed.length === 0) {
    throw new Error('Invalid session name: name cannot be empty');
  }

  // Validate against whitelist pattern
  if (!SESSION_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      'Invalid session name: only alphanumeric characters, dashes, and underscores are allowed'
    );
  }

  return trimmed;
}

/**
 * Sanitize a tmux session name with Result pattern (safe version)
 * Returns Result<string, ValidationError> instead of throwing
 *
 * @param name - The session name to sanitize
 * @returns Result containing the sanitized session name or a ValidationError
 */
export function sanitizeSessionNameSafe(name: string): Result<string, ValidationError> {
  if (!name || typeof name !== 'string') {
    return err(createSessionNameError(
      'Invalid session name: name must be a non-empty string',
      name ?? ''
    ));
  }

  // Trim whitespace
  const trimmed = name.trim();

  // Check length
  if (trimmed.length > MAX_SESSION_NAME_LENGTH) {
    return err(createMaxLengthError('sessionName', trimmed.length, MAX_SESSION_NAME_LENGTH));
  }

  if (trimmed.length === 0) {
    return err(createSessionNameError(
      'Invalid session name: name cannot be empty',
      name
    ));
  }

  // Validate against whitelist pattern
  if (!SESSION_NAME_PATTERN.test(trimmed)) {
    return err(createSessionNameError(
      'Invalid session name: only alphanumeric characters, dashes, and underscores are allowed',
      name
    ));
  }

  return ok(trimmed);
}

/**
 * Escape shell metacharacters in a string to prevent command injection
 * This is a secondary defense - prefer using spawn with array arguments
 *
 * @param input - The string to escape
 * @returns The escaped string safe for shell use
 */
export function escapeShellArg(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Replace each metacharacter with its escaped version
  // Also escape single quotes for safe use in single-quoted strings
  return input
    .replace(/'/g, "'\\''")
    .replace(SHELL_METACHARACTERS, '\\$&');
}

/**
 * Validate a run ID format
 * Run IDs must match the pattern: run-YYYYMMDDHHMMSS
 *
 * @param runId - The run ID to validate
 * @returns true if the run ID is valid, false otherwise
 */
export function isValidRunId(runId: string): boolean {
  if (!runId || typeof runId !== 'string') {
    return false;
  }

  return RUN_ID_PATTERN.test(runId);
}

/**
 * Validate briefing content
 * - Checks for maximum length
 * - Checks for null bytes
 *
 * @param briefing - The briefing content to validate
 * @returns Object with isValid boolean and optional error message
 */
export function validateBriefing(briefing: unknown): { isValid: boolean; error?: string } {
  if (!briefing) {
    return { isValid: false, error: 'Briefing is required' };
  }

  if (typeof briefing !== 'string') {
    return { isValid: false, error: 'Briefing must be a string' };
  }

  if (briefing.length === 0) {
    return { isValid: false, error: 'Briefing cannot be empty' };
  }

  if (briefing.length > MAX_BRIEFING_LENGTH) {
    return {
      isValid: false,
      error: `Briefing exceeds maximum length of ${MAX_BRIEFING_LENGTH} characters`,
    };
  }

  if (briefing.includes('\0')) {
    return { isValid: false, error: 'Briefing contains invalid characters' };
  }

  return { isValid: true };
}

/**
 * Validate briefing content with Result pattern (safe version)
 * Returns Result<string, ValidationError> containing the sanitized briefing
 *
 * @param briefing - The briefing content to validate
 * @returns Result containing the validated briefing or a ValidationError
 */
export function validateBriefingSafe(briefing: unknown): Result<string, ValidationError> {
  if (!briefing) {
    return err(new ValidationError(
      'Briefing is required',
      ErrorCodes.VALIDATION_INVALID_BRIEFING,
      { field: 'briefing' }
    ));
  }

  if (typeof briefing !== 'string') {
    return err(new ValidationError(
      'Briefing must be a string',
      ErrorCodes.VALIDATION_INVALID_BRIEFING,
      { field: 'briefing', value: typeof briefing }
    ));
  }

  if (briefing.length === 0) {
    return err(new ValidationError(
      'Briefing cannot be empty',
      ErrorCodes.VALIDATION_INVALID_BRIEFING,
      { field: 'briefing' }
    ));
  }

  if (briefing.length > MAX_BRIEFING_LENGTH) {
    return err(createMaxLengthError('briefing', briefing.length, MAX_BRIEFING_LENGTH));
  }

  if (briefing.includes('\0')) {
    return err(createNullBytesError('briefing', briefing.slice(0, 100)));
  }

  return ok(briefing);
}

/**
 * Validate a CRP ID format
 * CRP IDs should match patterns like: crp-001, crp-123, crp-{timestamp}
 *
 * @param crpId - The CRP ID to validate
 * @returns true if the CRP ID is valid, false otherwise
 */
export function isValidCrpId(crpId: string): boolean {
  if (!crpId || typeof crpId !== 'string') {
    return false;
  }

  // Allow crp-XXX where XXX is digits or alphanumeric (for timestamp-based IDs)
  const CRP_ID_PATTERN = /^crp-[a-zA-Z0-9_-]+$/;
  return CRP_ID_PATTERN.test(crpId) && crpId.length <= 64;
}

/**
 * Validate a VCR ID format
 * VCR IDs should match patterns like: vcr-001, vcr-123
 *
 * @param vcrId - The VCR ID to validate
 * @returns true if the VCR ID is valid, false otherwise
 */
export function isValidVcrId(vcrId: string): boolean {
  if (!vcrId || typeof vcrId !== 'string') {
    return false;
  }

  const VCR_ID_PATTERN = /^vcr-[a-zA-Z0-9_-]+$/;
  return VCR_ID_PATTERN.test(vcrId) && vcrId.length <= 64;
}

/**
 * Validate a decision value for CRP response
 *
 * @param decision - The decision value
 * @param allowedOptions - Optional array of allowed option IDs
 * @returns Object with isValid boolean and optional error message
 */
export function validateDecision(
  decision: unknown,
  allowedOptions?: string[]
): { isValid: boolean; error?: string } {
  if (!decision) {
    return { isValid: false, error: 'Decision is required' };
  }

  if (typeof decision !== 'string') {
    return { isValid: false, error: 'Decision must be a string' };
  }

  if (decision.length === 0) {
    return { isValid: false, error: 'Decision cannot be empty' };
  }

  if (decision.length > 1000) {
    return { isValid: false, error: 'Decision exceeds maximum length' };
  }

  // If allowed options are provided, validate against them
  if (allowedOptions && allowedOptions.length > 0) {
    if (!allowedOptions.includes(decision)) {
      return {
        isValid: false,
        error: `Invalid decision. Allowed options: ${allowedOptions.join(', ')}`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Validate a decision value with Result pattern (safe version)
 * Returns Result<string, ValidationError> containing the validated decision
 *
 * @param decision - The decision value
 * @param allowedOptions - Optional array of allowed option IDs
 * @returns Result containing the validated decision or a ValidationError
 */
export function validateDecisionSafe(
  decision: unknown,
  allowedOptions?: string[]
): Result<string, ValidationError> {
  if (!decision) {
    return err(new ValidationError(
      'Decision is required',
      ErrorCodes.VALIDATION_INVALID_DECISION,
      { field: 'decision' }
    ));
  }

  if (typeof decision !== 'string') {
    return err(new ValidationError(
      'Decision must be a string',
      ErrorCodes.VALIDATION_INVALID_DECISION,
      { field: 'decision', value: typeof decision }
    ));
  }

  if (decision.length === 0) {
    return err(new ValidationError(
      'Decision cannot be empty',
      ErrorCodes.VALIDATION_INVALID_DECISION,
      { field: 'decision' }
    ));
  }

  if (decision.length > 1000) {
    return err(createMaxLengthError('decision', decision.length, 1000));
  }

  // If allowed options are provided, validate against them
  if (allowedOptions && allowedOptions.length > 0) {
    if (!allowedOptions.includes(decision)) {
      return err(new ValidationError(
        `Invalid decision. Allowed options: ${allowedOptions.join(', ')}`,
        ErrorCodes.VALIDATION_INVALID_DECISION,
        { field: 'decision', value: decision, allowedOptions }
      ));
    }
  }

  return ok(decision);
}

/**
 * Sanitize optional text fields (rationale, additional notes)
 * - Trims whitespace
 * - Enforces maximum length
 * - Removes null bytes
 *
 * @param input - The input to sanitize
 * @param maxLength - Maximum allowed length (default: 10000)
 * @returns The sanitized string or empty string if invalid
 */
export function sanitizeTextField(input: unknown, maxLength: number = 10000): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove null bytes and trim
  let sanitized = input.replace(/\0/g, '').trim();

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Validate and sanitize a port number
 *
 * @param port - The port number to validate
 * @returns The validated port number
 * @throws Error if port is invalid
 */
export function validatePort(port: unknown): number {
  const portNum = typeof port === 'string' ? parseInt(port, 10) : port;

  if (typeof portNum !== 'number' || isNaN(portNum)) {
    throw new Error('Invalid port: must be a number');
  }

  if (!Number.isInteger(portNum)) {
    throw new Error('Invalid port: must be an integer');
  }

  if (portNum < 1 || portNum > 65535) {
    throw new Error('Invalid port: must be between 1 and 65535');
  }

  return portNum;
}

/**
 * Validate model name
 *
 * @param model - The model name to validate
 * @returns true if the model name is valid
 */
export function isValidModel(model: string): boolean {
  const VALID_MODELS = ['haiku', 'sonnet', 'opus'];
  return typeof model === 'string' && VALID_MODELS.includes(model);
}

/**
 * Validate agent name
 *
 * @param agent - The agent name to validate
 * @returns true if the agent name is valid
 */
export function isValidAgentName(agent: string): boolean {
  const VALID_AGENTS = ['refiner', 'builder', 'verifier', 'gatekeeper'];
  return typeof agent === 'string' && VALID_AGENTS.includes(agent);
}
