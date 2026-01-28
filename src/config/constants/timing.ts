/**
 * Timing-related constants (in milliseconds)
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
 * Timing configuration interface
 */
export interface TimingConfig {
  readonly DEBOUNCE_MS: number;
  readonly CLAUDE_STARTUP_DELAY_MS: number;
  readonly PASTE_COMPLETION_DELAY_MS: number;
  readonly CRP_DETECTION_DELAY_MS: number;
  readonly ACTIVITY_CHECK_INTERVAL_MS: number;
  readonly MAX_INACTIVITY_TIME_MS: number;
  readonly FILE_WATCHER_STABILITY_MS: number;
  readonly FILE_WATCHER_POLL_INTERVAL_MS: number;
  readonly DEFAULT_FILE_WAIT_TIMEOUT_MS: number;
  readonly GRACEFUL_SHUTDOWN_TIMEOUT_MS: number;
  readonly OUTPUT_POLLING_INTERVAL_MS: number;
  readonly OUTPUT_POLLING_MIN_MS: number;
  readonly OUTPUT_POLLING_MAX_MS: number;
  readonly RECOVERY_DELAY_MS: number;
  readonly DEFAULT_TIMEOUT_EXTENSION_MS: number;
  readonly MAX_TIMEOUT_EXTENSION_MS: number;
  readonly BROWSER_OPEN_DELAY_MS: number;
  readonly TMUX_STOP_DELAY_MS: number;
  readonly USAGE_TRACKER_REFRESH_MS: number;
  readonly INACTIVE_PANE_THRESHOLD_MS: number;
  readonly RETRY_BASE_DELAY_MS: number;
  readonly RETRY_MAX_DELAY_MS: number;
}

/**
 * Timing constants with environment variable overrides
 */
export const TIMING: TimingConfig = {
  /** Debounce time for file watcher events */
  DEBOUNCE_MS: parseEnvInt(process.env.ORCHESTRAL_DEBOUNCE_MS, 2000),

  /** Delay after starting Claude before sending commands */
  CLAUDE_STARTUP_DELAY_MS: parseEnvInt(process.env.ORCHESTRAL_CLAUDE_STARTUP_DELAY_MS, 2000),

  /** Delay after paste completion */
  PASTE_COMPLETION_DELAY_MS: parseEnvInt(process.env.ORCHESTRAL_PASTE_COMPLETION_DELAY_MS, 500),

  /** Delay for CRP detection */
  CRP_DETECTION_DELAY_MS: parseEnvInt(process.env.ORCHESTRAL_CRP_DETECTION_DELAY_MS, 1000),

  /** Interval for checking agent activity (default 30 seconds) */
  ACTIVITY_CHECK_INTERVAL_MS: parseEnvInt(process.env.ORCHESTRAL_ACTIVITY_CHECK_INTERVAL_MS, 30000),

  /** Maximum inactivity time before considering agent stuck (default 2 minutes) */
  MAX_INACTIVITY_TIME_MS: parseEnvInt(process.env.ORCHESTRAL_MAX_INACTIVITY_TIME_MS, 120000),

  /** File watcher stability threshold */
  FILE_WATCHER_STABILITY_MS: parseEnvInt(process.env.ORCHESTRAL_FILE_WATCHER_STABILITY_MS, 500),

  /** File watcher poll interval */
  FILE_WATCHER_POLL_INTERVAL_MS: parseEnvInt(process.env.ORCHESTRAL_FILE_WATCHER_POLL_INTERVAL_MS, 100),

  /** Default wait timeout for file operations (5 minutes) */
  DEFAULT_FILE_WAIT_TIMEOUT_MS: parseEnvInt(process.env.ORCHESTRAL_DEFAULT_FILE_WAIT_TIMEOUT_MS, 300000),

  /** Graceful shutdown timeout */
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: parseEnvInt(process.env.ORCHESTRAL_GRACEFUL_SHUTDOWN_TIMEOUT_MS, 5000),

  /** Output streamer default polling interval */
  OUTPUT_POLLING_INTERVAL_MS: parseEnvInt(process.env.ORCHESTRAL_OUTPUT_POLLING_INTERVAL_MS, 1000),

  /** Minimum output polling interval (fast) */
  OUTPUT_POLLING_MIN_MS: parseEnvInt(process.env.ORCHESTRAL_OUTPUT_POLLING_MIN_MS, 100),

  /** Maximum output polling interval (slow) */
  OUTPUT_POLLING_MAX_MS: parseEnvInt(process.env.ORCHESTRAL_OUTPUT_POLLING_MAX_MS, 2000),

  /** Recovery strategy delay between operations */
  RECOVERY_DELAY_MS: parseEnvInt(process.env.ORCHESTRAL_RECOVERY_DELAY_MS, 1000),

  /** Default timeout extension (5 minutes) */
  DEFAULT_TIMEOUT_EXTENSION_MS: parseEnvInt(process.env.ORCHESTRAL_DEFAULT_TIMEOUT_EXTENSION_MS, 300000),

  /** Maximum timeout extension (30 minutes) */
  MAX_TIMEOUT_EXTENSION_MS: parseEnvInt(process.env.ORCHESTRAL_MAX_TIMEOUT_EXTENSION_MS, 1800000),

  /** Delay before browser opens after server start */
  BROWSER_OPEN_DELAY_MS: parseEnvInt(process.env.ORCHESTRAL_BROWSER_OPEN_DELAY_MS, 1500),

  /** Delay before stopping tmux session */
  TMUX_STOP_DELAY_MS: parseEnvInt(process.env.ORCHESTRAL_TMUX_STOP_DELAY_MS, 500),

  /** Usage tracker refresh interval (10 seconds) */
  USAGE_TRACKER_REFRESH_MS: parseEnvInt(process.env.ORCHESTRAL_USAGE_TRACKER_REFRESH_MS, 10000),

  /** Inactive pane check threshold */
  INACTIVE_PANE_THRESHOLD_MS: parseEnvInt(process.env.ORCHESTRAL_INACTIVE_PANE_THRESHOLD_MS, 5000),

  /** Retry base delay */
  RETRY_BASE_DELAY_MS: parseEnvInt(process.env.ORCHESTRAL_RETRY_BASE_DELAY_MS, 1000),

  /** Retry max delay */
  RETRY_MAX_DELAY_MS: parseEnvInt(process.env.ORCHESTRAL_RETRY_MAX_DELAY_MS, 30000),
} as const;

/**
 * Agent timeout configuration interface
 */
export interface AgentTimeoutsConfig {
  readonly REFINER_MS: number;
  readonly BUILDER_MS: number;
  readonly VERIFIER_MS: number;
  readonly GATEKEEPER_MS: number;
}

/**
 * Agent timeout defaults (in milliseconds)
 */
export const AGENT_TIMEOUTS: AgentTimeoutsConfig = {
  /** Refiner timeout (5 minutes) */
  REFINER_MS: parseEnvInt(process.env.ORCHESTRAL_REFINER_TIMEOUT_MS, 300000),

  /** Builder timeout (10 minutes) */
  BUILDER_MS: parseEnvInt(process.env.ORCHESTRAL_BUILDER_TIMEOUT_MS, 600000),

  /** Verifier timeout (5 minutes) */
  VERIFIER_MS: parseEnvInt(process.env.ORCHESTRAL_VERIFIER_TIMEOUT_MS, 300000),

  /** Gatekeeper timeout (5 minutes) */
  GATEKEEPER_MS: parseEnvInt(process.env.ORCHESTRAL_GATEKEEPER_TIMEOUT_MS, 300000),
} as const;

/**
 * Duration multipliers for parsing duration strings
 */
export interface DurationMultipliersConfig {
  readonly s: number;
  readonly m: number;
  readonly h: number;
  readonly d: number;
}

export const DURATION_MULTIPLIERS: DurationMultipliersConfig = {
  /** Seconds to milliseconds */
  s: 1000,
  /** Minutes to milliseconds */
  m: 60 * 1000,
  /** Hours to milliseconds */
  h: 60 * 60 * 1000,
  /** Days to milliseconds */
  d: 24 * 60 * 60 * 1000,
} as const;

/**
 * Cache settings interface
 */
export interface CacheConfig {
  readonly STATE_CACHE_TTL_MS: number;
}

/**
 * Cache settings
 */
export const CACHE: CacheConfig = {
  /** Default state cache TTL (1 second) */
  STATE_CACHE_TTL_MS: parseEnvInt(process.env.ORCHESTRAL_STATE_CACHE_TTL_MS, 1000),
} as const;
