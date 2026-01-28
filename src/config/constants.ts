/**
 * Constants for timing, limits, and other magic numbers
 * Re-exports from domain-specific modules for backward compatibility
 *
 * New code should import from 'src/config/constants/index.js' for better tree-shaking
 */

// Re-export all constants from the new modular structure
export {
  TIMING,
  AGENT_TIMEOUTS,
  DURATION_MULTIPLIERS,
  CACHE,
  LIMITS,
  PORTS,
  MODEL_SELECTOR,
  TOKEN_DISPLAY,
  PRECISION,
  // Type exports
  type TimingConfig,
  type AgentTimeoutsConfig,
  type DurationMultipliersConfig,
  type CacheConfig,
  type LimitsConfig,
  type PortsConfig,
  type ModelSelectorConfig,
  type TokenEstimation,
  type TokenDisplayConfig,
  type PrecisionConfig,
} from './constants/index.js';
