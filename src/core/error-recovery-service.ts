import { EventEmitter } from 'events';
import { join } from 'path';
import type { AgentName, AgentModel, OrchestraConfig, AsyncResult } from '../types/index.js';
import { ok, err, RecoveryError, ErrorCodes, createRecoveryExhaustedError } from '../types/index.js';
import type { ErrorFlag } from './file-watcher.js';
import { RetryManager, RetryConfig, RetryEvent } from './retry-manager.js';
import { RecoveryManager, RecoveryContext, RecoveryResult } from './recovery-strategies.js';
import type { TmuxManager } from './tmux-manager.js';
import type { StateManager } from './state-manager.js';
import type { RunManager } from './run-manager.js';

/**
 * Recovery attempt record
 */
export interface RecoveryAttempt {
  agent: AgentName;
  errorType: string;
  timestamp: Date;
  attempt: number;
  result: 'success' | 'failed' | 'exhausted';
  action: RecoveryResult['action'];
  message: string;
}

/**
 * Success result from recovery operation
 * Used with Result pattern for type-safe error handling
 */
export interface RecoverySuccess {
  action: 'restart' | 'extend_timeout' | 'skip' | 'abort';
  message: string;
}

export type ErrorRecoveryEvent =
  | { type: 'recovery_started'; agent: AgentName; errorFlag: ErrorFlag; runId: string }
  | { type: 'recovery_attempt'; agent: AgentName; attempt: number; maxAttempts: number; runId: string }
  | { type: 'recovery_success'; agent: AgentName; attempt: number; runId: string }
  | { type: 'recovery_failed'; agent: AgentName; error: string; runId: string }
  | { type: 'recovery_exhausted'; agent: AgentName; totalAttempts: number; runId: string }
  | { type: 'recovery_skipped'; agent: AgentName; reason: string; runId: string };

/**
 * ErrorRecoveryService handles error detection and recovery:
 * - Determines if errors are recoverable
 * - Executes recovery strategies with retry logic
 * - Tracks recovery history
 */
export class ErrorRecoveryService extends EventEmitter {
  private retryManager: RetryManager;
  private recoveryManager: RecoveryManager;
  private config: OrchestraConfig;
  private recoveryHistory: Map<string, RecoveryAttempt[]> = new Map();

  constructor(
    retryManager: RetryManager,
    recoveryManager: RecoveryManager,
    config: OrchestraConfig
  ) {
    super();
    this.retryManager = retryManager;
    this.recoveryManager = recoveryManager;
    this.config = config;

    // Forward retry events
    this.setupRetryEventForwarding();
  }

  /**
   * Check if an error should trigger recovery
   */
  shouldRecover(errorFlag: ErrorFlag): boolean {
    // Check if auto-retry is enabled
    if (!this.config.global.auto_retry.enabled) {
      return false;
    }

    // Check if error is marked as recoverable
    if (!errorFlag.recoverable) {
      return false;
    }

    // Check if error type is in the recoverable list
    if (!this.config.global.auto_retry.recoverable_errors.includes(errorFlag.error_type)) {
      return false;
    }

    // Check if recovery manager has a strategy for this error
    return this.recoveryManager.canRecover(errorFlag);
  }

  /**
   * Handle an error and attempt recovery
   */
  async handleError(
    agent: AgentName,
    errorFlag: ErrorFlag,
    context: {
      runId: string;
      runManager: RunManager;
      tmuxManager: TmuxManager;
      stateManager: StateManager;
      selectedModels: Record<AgentName, AgentModel>;
    }
  ): Promise<RecoveryResult> {
    const { runId } = context;

    // Check if recovery should be attempted
    if (!this.shouldRecover(errorFlag)) {
      const reason = this.getSkipReason(errorFlag);
      this.emitEvent({ type: 'recovery_skipped', agent, reason, runId });
      return {
        success: false,
        action: 'abort',
        message: reason,
      };
    }

    this.emitEvent({ type: 'recovery_started', agent, errorFlag, runId });

    // Build recovery context
    const runDir = context.runManager.getRunDir(runId);
    const recoveryContext: RecoveryContext = {
      agent,
      runId,
      errorFlag,
      tmuxManager: context.tmuxManager,
      stateManager: context.stateManager,
      promptFile: join(runDir, 'prompts', `${agent}.md`),
      model: context.selectedModels[agent],
    };

    try {
      // Execute recovery with retry logic
      const result = await this.retryManager.executeWithRetry(
        async () => {
          const recoveryResult = await this.recoveryManager.recover(recoveryContext);
          if (!recoveryResult.success) {
            throw new Error(recoveryResult.message);
          }
          return recoveryResult;
        },
        { agent, errorType: errorFlag.error_type, runId }
      );

      // Record successful recovery
      this.recordRecoveryAttempt(runId, {
        agent,
        errorType: errorFlag.error_type,
        timestamp: new Date(),
        attempt: this.retryManager.getAttemptCount({ agent, errorType: errorFlag.error_type, runId }),
        result: 'success',
        action: result.action,
        message: result.message,
      });

      this.emitEvent({ type: 'recovery_success', agent, attempt: 1, runId });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Record failed recovery
      this.recordRecoveryAttempt(runId, {
        agent,
        errorType: errorFlag.error_type,
        timestamp: new Date(),
        attempt: this.config.global.auto_retry.max_attempts,
        result: 'exhausted',
        action: 'abort',
        message: errorMessage,
      });

      this.emitEvent({ type: 'recovery_exhausted', agent, totalAttempts: this.config.global.auto_retry.max_attempts, runId });

      return {
        success: false,
        action: 'abort',
        message: `Recovery failed after ${this.config.global.auto_retry.max_attempts} attempts: ${errorMessage}`,
      };
    }
  }

  /**
   * Handle an error and attempt recovery with Result pattern (safe version)
   * Returns AsyncResult<RecoverySuccess, RecoveryError> for type-safe error handling
   */
  async handleErrorSafe(
    agent: AgentName,
    errorFlag: ErrorFlag,
    context: {
      runId: string;
      runManager: RunManager;
      tmuxManager: TmuxManager;
      stateManager: StateManager;
      selectedModels: Record<AgentName, AgentModel>;
    }
  ): AsyncResult<RecoverySuccess, RecoveryError> {
    const { runId } = context;

    // Check if recovery should be attempted
    if (!this.shouldRecover(errorFlag)) {
      const reason = this.getSkipReason(errorFlag);
      this.emitEvent({ type: 'recovery_skipped', agent, reason, runId });
      return err(new RecoveryError(
        reason,
        ErrorCodes.RECOVERY_NOT_POSSIBLE,
        { agent, runId, errorType: errorFlag.error_type }
      ));
    }

    this.emitEvent({ type: 'recovery_started', agent, errorFlag, runId });

    // Build recovery context
    const runDir = context.runManager.getRunDir(runId);
    const recoveryContext: RecoveryContext = {
      agent,
      runId,
      errorFlag,
      tmuxManager: context.tmuxManager,
      stateManager: context.stateManager,
      promptFile: join(runDir, 'prompts', `${agent}.md`),
      model: context.selectedModels[agent],
    };

    try {
      // Execute recovery with retry logic
      const result = await this.retryManager.executeWithRetry(
        async () => {
          const recoveryResult = await this.recoveryManager.recover(recoveryContext);
          if (!recoveryResult.success) {
            throw new Error(recoveryResult.message);
          }
          return recoveryResult;
        },
        { agent, errorType: errorFlag.error_type, runId }
      );

      // Record successful recovery
      const attemptCount = this.retryManager.getAttemptCount({ agent, errorType: errorFlag.error_type, runId });
      this.recordRecoveryAttempt(runId, {
        agent,
        errorType: errorFlag.error_type,
        timestamp: new Date(),
        attempt: attemptCount,
        result: 'success',
        action: result.action,
        message: result.message,
      });

      this.emitEvent({ type: 'recovery_success', agent, attempt: attemptCount, runId });
      return ok({ action: result.action, message: result.message });
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      const maxAttempts = this.config.global.auto_retry.max_attempts;

      // Record failed recovery with full error details
      this.recordRecoveryAttempt(runId, {
        agent,
        errorType: errorFlag.error_type,
        timestamp: new Date(),
        attempt: maxAttempts,
        result: 'exhausted',
        action: 'abort',
        message: originalError.message,
      });

      this.emitEvent({ type: 'recovery_exhausted', agent, totalAttempts: maxAttempts, runId });

      // Return RecoveryError with full cause chain
      return err(createRecoveryExhaustedError(agent, maxAttempts, originalError));
    }
  }

  /**
   * Get recovery history for a run
   */
  getRecoveryHistory(runId: string): RecoveryAttempt[] {
    return this.recoveryHistory.get(runId) || [];
  }

  /**
   * Clear recovery history for a run
   */
  clearRecoveryHistory(runId: string): void {
    this.recoveryHistory.delete(runId);
  }

  /**
   * Reset retry attempts for an agent in a run
   */
  resetRetryAttempts(agent: AgentName, errorType: string, runId: string): void {
    this.retryManager.resetAttempts({ agent, errorType, runId });
  }

  /**
   * Get the retry manager for external access
   */
  getRetryManager(): RetryManager {
    return this.retryManager;
  }

  /**
   * Get the recovery manager for external access
   */
  getRecoveryManager(): RecoveryManager {
    return this.recoveryManager;
  }

  /**
   * Get current retry count for an agent
   */
  getRetryCount(agent: AgentName, errorType: string, runId: string): number {
    return this.retryManager.getAttemptCount({ agent, errorType, runId });
  }

  /**
   * Check if max retries have been reached
   */
  isRetryExhausted(agent: AgentName, errorType: string, runId: string): boolean {
    const count = this.getRetryCount(agent, errorType, runId);
    return count >= this.config.global.auto_retry.max_attempts;
  }

  /**
   * Get reason for skipping recovery
   */
  private getSkipReason(errorFlag: ErrorFlag): string {
    if (!this.config.global.auto_retry.enabled) {
      return 'Auto-retry is disabled';
    }

    if (!errorFlag.recoverable) {
      return 'Error is not marked as recoverable';
    }

    if (!this.config.global.auto_retry.recoverable_errors.includes(errorFlag.error_type)) {
      return `Error type '${errorFlag.error_type}' is not in recoverable errors list`;
    }

    if (!this.recoveryManager.canRecover(errorFlag)) {
      return `No recovery strategy available for error type '${errorFlag.error_type}'`;
    }

    return 'Unknown reason';
  }

  /**
   * Record a recovery attempt
   */
  private recordRecoveryAttempt(runId: string, attempt: RecoveryAttempt): void {
    if (!this.recoveryHistory.has(runId)) {
      this.recoveryHistory.set(runId, []);
    }
    this.recoveryHistory.get(runId)!.push(attempt);
  }

  /**
   * Set up forwarding of retry manager events
   */
  private setupRetryEventForwarding(): void {
    this.retryManager.on('retry_event', (event: RetryEvent) => {
      const { context } = event;

      switch (event.type) {
        case 'retry_started':
          this.emitEvent({
            type: 'recovery_attempt',
            agent: context.agent,
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            runId: context.runId,
          });
          break;

        case 'retry_success':
          // Already handled in handleError
          break;

        case 'retry_failed':
          this.emitEvent({
            type: 'recovery_failed',
            agent: context.agent,
            error: event.error,
            runId: context.runId,
          });
          break;

        case 'retry_exhausted':
          // Already handled in handleError
          break;
      }
    });
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: ErrorRecoveryEvent): void {
    this.emit('recovery_event', event);
  }
}
