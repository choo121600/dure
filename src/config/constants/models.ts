/**
 * Model selector-related constants
 * Used for intelligent model selection based on task complexity
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
 * Token estimation configuration
 */
export interface TokenEstimation {
  readonly input: number;
  readonly output: number;
}

/**
 * Model selector configuration interface
 */
export interface ModelSelectorConfig {
  readonly SIMPLE_BRIEFING_CHARS: number;
  readonly COMPLEX_BRIEFING_CHARS: number;
  readonly VERY_COMPLEX_BRIEFING_CHARS: number;
  readonly ESTIMATED_TOKENS: {
    readonly refiner: TokenEstimation;
    readonly builder: TokenEstimation;
    readonly verifier: TokenEstimation;
    readonly gatekeeper: TokenEstimation;
  };
}

/**
 * Model selector thresholds with environment variable overrides
 */
export const MODEL_SELECTOR: ModelSelectorConfig = {
  /** Simple briefing threshold (characters) */
  SIMPLE_BRIEFING_CHARS: parseEnvInt(process.env.ORCHESTRAL_SIMPLE_BRIEFING_CHARS, 500),

  /** Complex briefing threshold (characters) */
  COMPLEX_BRIEFING_CHARS: parseEnvInt(process.env.ORCHESTRAL_COMPLEX_BRIEFING_CHARS, 2000),

  /** Very complex briefing threshold (characters) */
  VERY_COMPLEX_BRIEFING_CHARS: parseEnvInt(process.env.ORCHESTRAL_VERY_COMPLEX_BRIEFING_CHARS, 5000),

  /** Estimated tokens per agent */
  ESTIMATED_TOKENS: {
    refiner: { input: 3000, output: 1000 },
    builder: { input: 15000, output: 5000 },
    verifier: { input: 8000, output: 3000 },
    gatekeeper: { input: 10000, output: 2000 },
  },
} as const;

/**
 * Token display configuration interface
 */
export interface TokenDisplayConfig {
  readonly MILLION_THRESHOLD: number;
  readonly THOUSAND_THRESHOLD: number;
}

/**
 * Token display thresholds
 */
export const TOKEN_DISPLAY: TokenDisplayConfig = {
  /** Threshold for displaying in millions */
  MILLION_THRESHOLD: 1_000_000,
  /** Threshold for displaying in thousands */
  THOUSAND_THRESHOLD: 1_000,
} as const;

/**
 * Precision configuration interface
 */
export interface PrecisionConfig {
  readonly COST_MULTIPLIER: number;
}

/**
 * Precision constants for calculations
 */
export const PRECISION: PrecisionConfig = {
  /** Cost precision multiplier (6 decimal places) */
  COST_MULTIPLIER: 1_000_000,
} as const;
