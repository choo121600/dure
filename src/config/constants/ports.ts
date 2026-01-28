/**
 * Port-related constants
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
 * Port configuration interface
 */
export interface PortsConfig {
  readonly DEFAULT_WEB_PORT: number;
  readonly MIN_PORT: number;
  readonly MAX_PORT: number;
}

/**
 * Port constants with environment variable overrides
 */
export const PORTS: PortsConfig = {
  /** Default web server port */
  DEFAULT_WEB_PORT: parseEnvInt(process.env.DURE_WEB_PORT, 3000),

  /** Minimum valid port */
  MIN_PORT: 1,

  /** Maximum valid port */
  MAX_PORT: 65535,
} as const;
