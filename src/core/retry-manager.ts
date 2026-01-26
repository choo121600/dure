import { EventEmitter } from 'events';
import type { AgentName } from '../types/index.js';

export type RecoverableErrorType = 'crash' | 'timeout' | 'validation';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  recoverableErrors: RecoverableErrorType[];
}

export interface RetryContext {
  agent: AgentName;
  errorType: string;
  runId: string;
}

export interface RetryAttempt {
  attempt: number;
  error: Error;
  timestamp: Date;
  willRetry: boolean;
  delayMs: number;
}

export type RetryEvent =
  | { type: 'retry_started'; context: RetryContext; attempt: number; maxAttempts: number }
  | { type: 'retry_delay'; context: RetryContext; delayMs: number; attempt: number }
  | { type: 'retry_success'; context: RetryContext; attempt: number }
  | { type: 'retry_failed'; context: RetryContext; attempt: number; error: string }
  | { type: 'retry_exhausted'; context: RetryContext; totalAttempts: number };

export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 2,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  recoverableErrors: ['crash', 'timeout', 'validation'],
};

export class RetryManager extends EventEmitter {
  private config: RetryConfig;
  private retryAttempts: Map<string, number> = new Map();

  constructor(config: Partial<RetryConfig> = {}) {
    super();
    this.config = { ...defaultRetryConfig, ...config };
  }

  /**
   * Execute an operation with automatic retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: RetryContext
  ): Promise<T> {
    const key = this.getRetryKey(context);
    let attempt = this.retryAttempts.get(key) || 0;

    while (attempt < this.config.maxAttempts) {
      attempt++;
      this.retryAttempts.set(key, attempt);

      this.emitEvent({
        type: 'retry_started',
        context,
        attempt,
        maxAttempts: this.config.maxAttempts,
      });

      try {
        const result = await operation();

        // Success - clear retry counter
        this.retryAttempts.delete(key);
        this.emitEvent({
          type: 'retry_success',
          context,
          attempt,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        this.emitEvent({
          type: 'retry_failed',
          context,
          attempt,
          error: errorMessage,
        });

        if (attempt >= this.config.maxAttempts) {
          // Exhausted all retry attempts
          this.retryAttempts.delete(key);
          this.emitEvent({
            type: 'retry_exhausted',
            context,
            totalAttempts: attempt,
          });
          throw error;
        }

        // Calculate delay with exponential backoff
        const delayMs = this.getDelay(attempt);

        this.emitEvent({
          type: 'retry_delay',
          context,
          delayMs,
          attempt,
        });

        // Wait before next attempt
        await this.delay(delayMs);
      }
    }

    // Should not reach here, but handle edge case
    throw new Error('Retry exhausted without success');
  }

  /**
   * Determine if an error is recoverable based on config
   */
  shouldRetry(errorType: string, attempt: number): boolean {
    // Check if error type is recoverable
    if (!this.config.recoverableErrors.includes(errorType as RecoverableErrorType)) {
      return false;
    }

    // Check if we have attempts remaining
    return attempt < this.config.maxAttempts;
  }

  /**
   * Check if an error type is configured as recoverable
   */
  isRecoverableError(errorType: string): boolean {
    return this.config.recoverableErrors.includes(errorType as RecoverableErrorType);
  }

  /**
   * Calculate delay with exponential backoff
   */
  getDelay(attempt: number): number {
    // Exponential backoff: baseDelay * (multiplier ^ (attempt - 1))
    const delay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);

    // Add some jitter (±10%) to prevent thundering herd
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);

    // Clamp to maxDelay
    return Math.min(delay + jitter, this.config.maxDelayMs);
  }

  /**
   * Get current retry attempt count for a context
   */
  getAttemptCount(context: RetryContext): number {
    return this.retryAttempts.get(this.getRetryKey(context)) || 0;
  }

  /**
   * Reset retry counter for a context
   */
  resetAttempts(context: RetryContext): void {
    this.retryAttempts.delete(this.getRetryKey(context));
  }

  /**
   * Reset all retry counters
   */
  resetAll(): void {
    this.retryAttempts.clear();
  }

  /**
   * Get config
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Generate a unique key for retry tracking
   */
  private getRetryKey(context: RetryContext): string {
    return `${context.runId}:${context.agent}:${context.errorType}`;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: RetryEvent): void {
    this.emit('retry_event', event);
  }
}
