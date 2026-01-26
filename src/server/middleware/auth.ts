import { Request, Response, NextFunction } from 'express';

/**
 * Environment variable names for authentication configuration
 */
const ENV = {
  API_KEY: 'ORCHESTRAL_API_KEY',
  AUTH_ENABLED: 'ORCHESTRAL_AUTH_ENABLED',
} as const;

/**
 * Authentication configuration
 */
export interface AuthConfig {
  enabled: boolean;
  apiKey?: string;
}

/**
 * Load authentication configuration from environment variables
 */
export function loadAuthConfig(): AuthConfig {
  const authEnabled = process.env[ENV.AUTH_ENABLED] === 'true';
  const apiKey = process.env[ENV.API_KEY];

  return {
    enabled: authEnabled && !!apiKey,
    apiKey: apiKey,
  };
}

/**
 * API key authentication middleware
 *
 * Checks for a valid API key in the x-api-key header.
 * Only enforces authentication when ORCHESTRAL_AUTH_ENABLED=true and ORCHESTRAL_API_KEY is set.
 *
 * @example
 * // Enable authentication by setting environment variables:
 * // ORCHESTRAL_AUTH_ENABLED=true
 * // ORCHESTRAL_API_KEY=your-secret-key
 *
 * // Then make requests with the header:
 * // x-api-key: your-secret-key
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const config = loadAuthConfig();

  // If authentication is not enabled, skip
  if (!config.enabled) {
    return next();
  }

  const apiKey = req.headers['x-api-key'];

  // Check if API key is provided
  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: API key required',
    });
    return;
  }

  // Check if API key is valid (constant-time comparison to prevent timing attacks)
  if (!constantTimeCompare(String(apiKey), config.apiKey!)) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid API key',
    });
    return;
  }

  next();
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to prevent length-based timing attacks
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i % b.length);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * WebSocket authentication handler for Socket.io
 *
 * Validates token from socket handshake auth data.
 * Only enforces authentication when ORCHESTRAL_AUTH_ENABLED=true and ORCHESTRAL_API_KEY is set.
 *
 * @example
 * // Client-side connection with authentication:
 * const socket = io({
 *   auth: {
 *     token: 'your-secret-key'
 *   }
 * });
 */
export function socketAuth(
  socket: { handshake: { auth: { token?: string } } },
  next: (err?: Error) => void
): void {
  const config = loadAuthConfig();

  // If authentication is not enabled, skip
  if (!config.enabled) {
    return next();
  }

  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  if (!constantTimeCompare(String(token), config.apiKey!)) {
    return next(new Error('Invalid authentication token'));
  }

  next();
}

/**
 * Check if authentication is currently enabled
 */
export function isAuthEnabled(): boolean {
  return loadAuthConfig().enabled;
}
