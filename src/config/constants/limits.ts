/**
 * Limit-related constants
 * Supports environment variable overrides
 */

/**
 * Parse integer from environment variable with default fallback
 */
function parseEnvInt(envVar: string | undefined, defaultValue: number): number {
  if (!envVar) return defaultValue;
  const parsed = parseInt(envVar, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Limit configuration interface
 */
export interface LimitsConfig {
  readonly MAX_BRIEFING_LENGTH: number;
  readonly MAX_OUTPUT_HISTORY_LINES: number;
  readonly MAX_PANE_CAPTURE_LINES: number;
  readonly MAX_PANE_CAPTURE_LIMIT: number;
  readonly MAX_PATH_LENGTH: number;
  readonly MAX_TEXT_FIELD_LENGTH: number;
  readonly MAX_DECISION_LENGTH: number;
  readonly MAX_FILE_SIZE_LINES: number;
  readonly MAX_ITERATIONS: number;
  readonly MIN_ITERATIONS: number;
  readonly MAX_COMMAND_BUFFER: number;
  readonly MAX_RECENT_EVENTS: number;
}

/**
 * Limit constants with environment variable overrides
 */
export const LIMITS: LimitsConfig = {
  /** Maximum briefing length in characters (100KB) */
  MAX_BRIEFING_LENGTH: parseEnvInt(process.env.ORCHESTRAL_MAX_BRIEFING_LENGTH, 100000),

  /** Maximum output history lines to capture */
  MAX_OUTPUT_HISTORY_LINES: parseEnvInt(process.env.ORCHESTRAL_MAX_OUTPUT_HISTORY_LINES, 200),

  /** Maximum pane capture lines */
  MAX_PANE_CAPTURE_LINES: parseEnvInt(process.env.ORCHESTRAL_MAX_PANE_CAPTURE_LINES, 100),

  /** Maximum pane capture lines limit */
  MAX_PANE_CAPTURE_LIMIT: parseEnvInt(process.env.ORCHESTRAL_MAX_PANE_CAPTURE_LIMIT, 10000),

  /** Maximum path length */
  MAX_PATH_LENGTH: parseEnvInt(process.env.ORCHESTRAL_MAX_PATH_LENGTH, 4096),

  /** Maximum text field length */
  MAX_TEXT_FIELD_LENGTH: parseEnvInt(process.env.ORCHESTRAL_MAX_TEXT_FIELD_LENGTH, 10000),

  /** Maximum decision text length */
  MAX_DECISION_LENGTH: parseEnvInt(process.env.ORCHESTRAL_MAX_DECISION_LENGTH, 1000),

  /** Maximum file size in lines for builder */
  MAX_FILE_SIZE_LINES: parseEnvInt(process.env.ORCHESTRAL_MAX_FILE_SIZE_LINES, 500),

  /** Maximum iterations allowed */
  MAX_ITERATIONS: parseEnvInt(process.env.ORCHESTRAL_MAX_ITERATIONS, 100),

  /** Minimum iterations allowed */
  MIN_ITERATIONS: parseEnvInt(process.env.ORCHESTRAL_MIN_ITERATIONS, 1),

  /** Maximum buffer size for command output (1MB) */
  MAX_COMMAND_BUFFER: parseEnvInt(process.env.ORCHESTRAL_MAX_COMMAND_BUFFER, 1024 * 1024),

  /** Maximum recent events to track in file watcher */
  MAX_RECENT_EVENTS: parseEnvInt(process.env.ORCHESTRAL_MAX_RECENT_EVENTS, 100),
} as const;
