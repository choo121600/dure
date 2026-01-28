/**
 * Configuration validation using Zod schemas
 * Provides type-safe configuration parsing and validation
 */

import { z } from 'zod';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { ValidationError, ErrorCodes } from '../types/errors.js';
import type { OrchestraConfig, GlobalConfig, AgentTimeoutConfig } from '../types/index.js';
import {
  defaultGlobalConfig,
  defaultRefinerConfig,
  defaultBuilderConfig,
  defaultVerifierConfig,
  defaultGatekeeperConfig,
  defaultConfig,
  defaultTimeoutConfig,
} from './defaults.js';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Agent model schema
 */
const AgentModelSchema = z.enum(['haiku', 'sonnet', 'opus']);

/**
 * Log level schema
 */
const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

/**
 * Timeout action schema
 */
const TimeoutActionSchema = z.enum(['warn', 'retry', 'stop']);

/**
 * Model selection strategy schema
 */
const ModelSelectionStrategySchema = z.enum(['cost_optimized', 'quality_first', 'balanced']);

/**
 * Model selection config schema
 */
const ModelSelectionConfigSchema = z.object({
  enabled: z.boolean(),
  strategy: ModelSelectionStrategySchema,
  planner_model: AgentModelSchema,
});

/**
 * Timeout config schema
 */
const TimeoutsConfigSchema = z.object({
  refiner: z.number().int().min(0),
  builder: z.number().int().min(0),
  verifier: z.number().int().min(0),
  gatekeeper: z.number().int().min(0),
});

/**
 * Notifications config schema
 */
const NotificationsConfigSchema = z.object({
  terminal_bell: z.boolean(),
  system_notify: z.boolean(),
});

/**
 * Auto retry config schema
 */
const AutoRetryConfigSchema = z.object({
  enabled: z.boolean(),
  max_attempts: z.number().int().min(0).max(10),
  recoverable_errors: z.array(z.string()),
});

/**
 * Global config schema
 */
export const GlobalConfigSchema = z.object({
  max_iterations: z.number().int().min(1).max(100),
  tmux_session_prefix: z.string().regex(/^[a-zA-Z0-9_-]+$/, {
    message: 'tmux_session_prefix must only contain alphanumeric characters, underscores, and hyphens',
  }),
  web_port: z.number().int().min(1).max(65535),
  log_level: LogLevelSchema,
  timeouts: TimeoutsConfigSchema,
  timeout_action: TimeoutActionSchema,
  notifications: NotificationsConfigSchema,
  auto_retry: AutoRetryConfigSchema,
  model_selection: ModelSelectionConfigSchema.optional(),
});

/**
 * Auto fill config schema
 */
const AutoFillConfigSchema = z.object({
  allowed: z.array(z.string()),
  forbidden: z.array(z.string()),
});

/**
 * Refiner config schema
 */
export const RefinerConfigSchema = z.object({
  model: AgentModelSchema,
  auto_fill: AutoFillConfigSchema,
  delegation_keywords: z.array(z.string()),
  max_refinement_iterations: z.number().int().min(1).max(10),
});

/**
 * Builder style config schema
 */
const BuilderStyleConfigSchema = z.object({
  prefer_libraries: z.array(z.string()),
  avoid_libraries: z.array(z.string()),
  code_style: z.string(),
});

/**
 * Builder constraints config schema
 */
const BuilderConstraintsConfigSchema = z.object({
  max_file_size_lines: z.number().int().min(1),
  require_types: z.boolean(),
});

/**
 * Builder config schema
 */
export const BuilderConfigSchema = z.object({
  model: AgentModelSchema,
  style: BuilderStyleConfigSchema,
  constraints: BuilderConstraintsConfigSchema,
});

/**
 * Test coverage config schema
 */
const TestCoverageConfigSchema = z.object({
  min_percentage: z.number().min(0).max(100),
  require_edge_cases: z.boolean(),
  require_error_cases: z.boolean(),
});

/**
 * Adversarial config schema
 */
const AdversarialConfigSchema = z.object({
  enabled: z.boolean(),
  max_attack_vectors: z.number().int().min(0).max(50),
});

/**
 * Verifier config schema
 */
export const VerifierConfigSchema = z.object({
  model: AgentModelSchema,
  test_coverage: TestCoverageConfigSchema,
  adversarial: AdversarialConfigSchema,
});

/**
 * Pass criteria config schema
 */
const PassCriteriaConfigSchema = z.object({
  tests_passing: z.boolean(),
  no_critical_issues: z.boolean(),
  min_test_coverage: z.number().min(0).max(100),
});

/**
 * Gatekeeper config schema
 */
export const GatekeeperConfigSchema = z.object({
  model: AgentModelSchema,
  pass_criteria: PassCriteriaConfigSchema,
  max_iterations: z.number().int().min(1).max(100),
  auto_crp_triggers: z.array(z.string()),
});

/**
 * Full orchestra config schema
 */
export const OrchestraConfigSchema = z.object({
  global: GlobalConfigSchema,
  refiner: RefinerConfigSchema,
  builder: BuilderConfigSchema,
  verifier: VerifierConfigSchema,
  gatekeeper: GatekeeperConfigSchema,
});

/**
 * Agent timeout config schema
 */
export const AgentTimeoutConfigSchema = z.object({
  refiner: z.number().int().min(0),
  builder: z.number().int().min(0),
  verifier: z.number().int().min(0),
  gatekeeper: z.number().int().min(0),
  activityCheckInterval: z.number().int().min(0),
  maxInactivityTime: z.number().int().min(0),
});

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Format Zod error for user-friendly display
 */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Validate OrchestraConfig
 */
export function validateConfig(config: unknown): Result<OrchestraConfig, ValidationError> {
  const result = OrchestraConfigSchema.safeParse(config);

  if (!result.success) {
    return err(
      new ValidationError(
        `Invalid configuration: ${formatZodError(result.error)}`,
        ErrorCodes.VALIDATION_INVALID_CONFIG,
        { config, errors: result.error.issues }
      )
    );
  }

  return ok(result.data);
}

/**
 * Validate GlobalConfig
 */
export function validateGlobalConfig(config: unknown): Result<GlobalConfig, ValidationError> {
  const result = GlobalConfigSchema.safeParse(config);

  if (!result.success) {
    return err(
      new ValidationError(
        `Invalid global configuration: ${formatZodError(result.error)}`,
        ErrorCodes.VALIDATION_INVALID_CONFIG,
        { config, errors: result.error.issues }
      )
    );
  }

  return ok(result.data as GlobalConfig);
}

/**
 * Validate AgentTimeoutConfig
 */
export function validateAgentTimeoutConfig(config: unknown): Result<AgentTimeoutConfig, ValidationError> {
  const result = AgentTimeoutConfigSchema.safeParse(config);

  if (!result.success) {
    return err(
      new ValidationError(
        `Invalid agent timeout configuration: ${formatZodError(result.error)}`,
        ErrorCodes.VALIDATION_INVALID_CONFIG,
        { config, errors: result.error.issues }
      )
    );
  }

  return ok(result.data);
}

// ============================================================================
// Merge Functions
// ============================================================================

/**
 * Deep merge two objects (untyped for flexibility)
 */
function deepMergeUntyped(target: unknown, source: unknown): unknown {
  if (source === null || source === undefined) {
    return target;
  }

  if (typeof target !== 'object' || target === null) {
    return source;
  }

  if (typeof source !== 'object' || source === null) {
    return source;
  }

  if (Array.isArray(source)) {
    return source;
  }

  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const key of Object.keys(source as Record<string, unknown>)) {
    const sourceValue = (source as Record<string, unknown>)[key];
    const targetValue = (target as Record<string, unknown>)[key];

    if (
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue)
    ) {
      result[key] = deepMergeUntyped(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Merge partial config with defaults
 */
export function mergeWithDefaults(partial: DeepPartial<OrchestraConfig>): OrchestraConfig {
  return {
    global: deepMergeUntyped(defaultGlobalConfig, partial.global ?? {}) as GlobalConfig,
    refiner: deepMergeUntyped(defaultRefinerConfig, partial.refiner ?? {}) as typeof defaultRefinerConfig,
    builder: deepMergeUntyped(defaultBuilderConfig, partial.builder ?? {}) as typeof defaultBuilderConfig,
    verifier: deepMergeUntyped(defaultVerifierConfig, partial.verifier ?? {}) as typeof defaultVerifierConfig,
    gatekeeper: deepMergeUntyped(defaultGatekeeperConfig, partial.gatekeeper ?? {}) as typeof defaultGatekeeperConfig,
  };
}

/**
 * Merge partial timeout config with defaults
 */
export function mergeTimeoutWithDefaults(partial: Partial<AgentTimeoutConfig>): AgentTimeoutConfig {
  return deepMergeUntyped(defaultTimeoutConfig, partial) as AgentTimeoutConfig;
}

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Deep partial type utility
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ============================================================================
// Safe Parse Functions
// ============================================================================

/**
 * Parse and validate config, returning merged with defaults on partial match
 */
export function parseConfigSafe(rawConfig: unknown): Result<OrchestraConfig, ValidationError> {
  // First try strict validation
  const strictResult = validateConfig(rawConfig);
  if (strictResult.success) {
    return strictResult;
  }

  // If strict validation fails, try to merge with defaults
  if (typeof rawConfig === 'object' && rawConfig !== null) {
    try {
      const merged = mergeWithDefaults(rawConfig as DeepPartial<OrchestraConfig>);
      const validationResult = validateConfig(merged);
      if (validationResult.success) {
        return validationResult;
      }
    } catch {
      // Fall through to return the original error
    }
  }

  return strictResult;
}

/**
 * Get the default configuration
 */
export function getDefaultConfig(): OrchestraConfig {
  return { ...defaultConfig };
}

/**
 * Get the default timeout configuration
 */
export function getDefaultTimeoutConfig(): AgentTimeoutConfig {
  return { ...defaultTimeoutConfig };
}
