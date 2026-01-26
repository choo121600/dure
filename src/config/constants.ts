/**
 * Constants for timing, limits, and other magic numbers
 * These are centralized here to avoid scattered magic numbers throughout the codebase
 */

/**
 * Timing constants (in milliseconds)
 */
export const TIMING = {
  /** Debounce time for file watcher events */
  DEBOUNCE_MS: 2000,

  /** Delay after starting Claude before sending commands */
  CLAUDE_STARTUP_DELAY_MS: 2000,

  /** Delay after paste completion */
  PASTE_COMPLETION_DELAY_MS: 500,

  /** Delay for CRP detection */
  CRP_DETECTION_DELAY_MS: 1000,

  /** Interval for checking agent activity (default 30 seconds) */
  ACTIVITY_CHECK_INTERVAL_MS: 30000,

  /** Maximum inactivity time before considering agent stuck (default 2 minutes) */
  MAX_INACTIVITY_TIME_MS: 120000,

  /** File watcher stability threshold */
  FILE_WATCHER_STABILITY_MS: 500,

  /** File watcher poll interval */
  FILE_WATCHER_POLL_INTERVAL_MS: 100,

  /** Default wait timeout for file operations (5 minutes) */
  DEFAULT_FILE_WAIT_TIMEOUT_MS: 300000,

  /** Graceful shutdown timeout */
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: 5000,

  /** Output streamer default polling interval */
  OUTPUT_POLLING_INTERVAL_MS: 1000,

  /** Minimum output polling interval (fast) */
  OUTPUT_POLLING_MIN_MS: 100,

  /** Maximum output polling interval (slow) */
  OUTPUT_POLLING_MAX_MS: 2000,

  /** Recovery strategy delay between operations */
  RECOVERY_DELAY_MS: 1000,

  /** Default timeout extension (5 minutes) */
  DEFAULT_TIMEOUT_EXTENSION_MS: 300000,

  /** Maximum timeout extension (30 minutes) */
  MAX_TIMEOUT_EXTENSION_MS: 1800000,

  /** Delay before browser opens after server start */
  BROWSER_OPEN_DELAY_MS: 1500,

  /** Delay before stopping tmux session */
  TMUX_STOP_DELAY_MS: 500,

  /** Usage tracker refresh interval (10 seconds) */
  USAGE_TRACKER_REFRESH_MS: 10000,

  /** Inactive pane check threshold */
  INACTIVE_PANE_THRESHOLD_MS: 5000,

  /** Retry base delay */
  RETRY_BASE_DELAY_MS: 1000,

  /** Retry max delay */
  RETRY_MAX_DELAY_MS: 30000,
} as const;

/**
 * Agent timeout defaults (in milliseconds)
 */
export const AGENT_TIMEOUTS = {
  /** Refiner timeout (5 minutes) */
  REFINER_MS: 300000,

  /** Builder timeout (10 minutes) */
  BUILDER_MS: 600000,

  /** Verifier timeout (5 minutes) */
  VERIFIER_MS: 300000,

  /** Gatekeeper timeout (5 minutes) */
  GATEKEEPER_MS: 300000,
} as const;

/**
 * Limit constants
 */
export const LIMITS = {
  /** Maximum briefing length in characters (100KB) */
  MAX_BRIEFING_LENGTH: 100000,

  /** Maximum output history lines to capture */
  MAX_OUTPUT_HISTORY_LINES: 200,

  /** Maximum pane capture lines */
  MAX_PANE_CAPTURE_LINES: 100,

  /** Maximum pane capture lines limit */
  MAX_PANE_CAPTURE_LIMIT: 10000,

  /** Maximum path length */
  MAX_PATH_LENGTH: 4096,

  /** Maximum text field length */
  MAX_TEXT_FIELD_LENGTH: 10000,

  /** Maximum decision text length */
  MAX_DECISION_LENGTH: 1000,

  /** Maximum file size in lines for builder */
  MAX_FILE_SIZE_LINES: 500,

  /** Maximum iterations allowed */
  MAX_ITERATIONS: 100,

  /** Minimum iterations allowed */
  MIN_ITERATIONS: 1,

  /** Maximum buffer size for command output (1MB) */
  MAX_COMMAND_BUFFER: 1024 * 1024,

  /** Maximum recent events to track in file watcher */
  MAX_RECENT_EVENTS: 100,
} as const;

/**
 * Port constants
 */
export const PORTS = {
  /** Default web server port */
  DEFAULT_WEB_PORT: 3000,

  /** Minimum valid port */
  MIN_PORT: 1,

  /** Maximum valid port */
  MAX_PORT: 65535,
} as const;

/**
 * Model selector thresholds
 */
export const MODEL_SELECTOR = {
  /** Simple briefing threshold (characters) */
  SIMPLE_BRIEFING_CHARS: 500,

  /** Complex briefing threshold (characters) */
  COMPLEX_BRIEFING_CHARS: 2000,

  /** Very complex briefing threshold (characters) */
  VERY_COMPLEX_BRIEFING_CHARS: 5000,

  /** Estimated tokens per agent */
  ESTIMATED_TOKENS: {
    refiner: { input: 3000, output: 1000 },
    builder: { input: 15000, output: 5000 },
    verifier: { input: 8000, output: 3000 },
    gatekeeper: { input: 10000, output: 2000 },
  },
} as const;

/**
 * Cache settings
 */
export const CACHE = {
  /** Default state cache TTL (1 second) */
  STATE_CACHE_TTL_MS: 1000,
} as const;

/**
 * Duration multipliers for parsing duration strings
 */
export const DURATION_MULTIPLIERS = {
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
 * Token display thresholds
 */
export const TOKEN_DISPLAY = {
  /** Threshold for displaying in millions */
  MILLION_THRESHOLD: 1_000_000,
  /** Threshold for displaying in thousands */
  THOUSAND_THRESHOLD: 1_000,
} as const;

/**
 * Precision constants for calculations
 */
export const PRECISION = {
  /** Cost precision multiplier (6 decimal places) */
  COST_MULTIPLIER: 1_000_000,
} as const;
