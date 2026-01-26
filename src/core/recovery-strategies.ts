import type { AgentName } from '../types/index.js';
import type { ErrorFlag } from './file-watcher.js';
import type { TmuxManager } from './tmux-manager.js';
import type { StateManager } from './state-manager.js';

/**
 * Context for recovery operations
 */
export interface RecoveryContext {
  agent: AgentName;
  runId: string;
  errorFlag: ErrorFlag;
  tmuxManager: TmuxManager;
  stateManager: StateManager;
  promptFile: string;
  model: string;
}

/**
 * Result of a recovery operation
 */
export interface RecoveryResult {
  success: boolean;
  action: 'restart' | 'extend_timeout' | 'skip' | 'abort';
  message: string;
}

/**
 * Base interface for recovery strategies
 */
export interface RecoveryStrategy {
  /**
   * Check if this strategy can handle the given error
   */
  canRecover(error: ErrorFlag): boolean;

  /**
   * Execute the recovery action
   */
  recover(context: RecoveryContext): Promise<RecoveryResult>;

  /**
   * Get the strategy name
   */
  getName(): string;
}

/**
 * Recovery strategy for Claude process crashes
 * Attempts to restart the agent with a clean context
 */
export class CrashRecoveryStrategy implements RecoveryStrategy {
  getName(): string {
    return 'crash';
  }

  canRecover(error: ErrorFlag): boolean {
    return error.error_type === 'crash' && error.recoverable;
  }

  async recover(context: RecoveryContext): Promise<RecoveryResult> {
    try {
      // Clear the agent's tmux pane
      context.tmuxManager.clearAgent(context.agent);

      // Wait a bit for the pane to clear
      await this.delay(1000);

      // Update state to running
      context.stateManager.updateAgentStatus(context.agent, 'running');

      // Restart the agent
      context.tmuxManager.startAgent(
        context.agent,
        context.model as 'haiku' | 'sonnet' | 'opus',
        context.promptFile
      );

      return {
        success: true,
        action: 'restart',
        message: `Agent ${context.agent} restarted after crash`,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        action: 'abort',
        message: `Failed to restart agent ${context.agent}: ${errMsg}`,
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Recovery strategy for agent timeouts
 * Can either extend the timeout or restart the agent
 */
export class TimeoutRecoveryStrategy implements RecoveryStrategy {
  private defaultExtensionMs = 300000; // 5 minutes

  getName(): string {
    return 'timeout';
  }

  canRecover(error: ErrorFlag): boolean {
    return error.error_type === 'timeout' && error.recoverable;
  }

  async recover(context: RecoveryContext): Promise<RecoveryResult> {
    try {
      // Check if the agent is still active (might be slow but working)
      const isActive = this.checkAgentActivity(context);

      if (isActive) {
        // Extend timeout rather than restart
        return {
          success: true,
          action: 'extend_timeout',
          message: `Extended timeout for agent ${context.agent}`,
        };
      }

      // Agent is not active, restart it
      context.tmuxManager.clearAgent(context.agent);
      await this.delay(1000);

      context.stateManager.updateAgentStatus(context.agent, 'running');
      context.tmuxManager.startAgent(
        context.agent,
        context.model as 'haiku' | 'sonnet' | 'opus',
        context.promptFile
      );

      return {
        success: true,
        action: 'restart',
        message: `Agent ${context.agent} restarted after timeout`,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        action: 'abort',
        message: `Failed to recover agent ${context.agent} from timeout: ${errMsg}`,
      };
    }
  }

  /**
   * Check if agent is still producing output
   */
  private checkAgentActivity(context: RecoveryContext): boolean {
    try {
      // Try to capture recent output
      const output = context.tmuxManager.capturePane(context.agent);
      // If there's output and it looks like it's still working, consider it active
      return output.length > 0 && !output.includes('Error:') && !output.includes('crashed');
    } catch {
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Recovery strategy for validation errors
 * Attempts to restart with a clear instruction to fix the format
 */
export class ValidationRecoveryStrategy implements RecoveryStrategy {
  getName(): string {
    return 'validation';
  }

  canRecover(error: ErrorFlag): boolean {
    return error.error_type === 'validation' && error.recoverable;
  }

  async recover(context: RecoveryContext): Promise<RecoveryResult> {
    try {
      // Clear the agent's context
      context.tmuxManager.clearAgent(context.agent);
      await this.delay(1000);

      // Update state
      context.stateManager.updateAgentStatus(context.agent, 'running');

      // Restart with validation error context
      // The agent will read the error flag and understand the validation issue
      context.tmuxManager.startAgent(
        context.agent,
        context.model as 'haiku' | 'sonnet' | 'opus',
        context.promptFile
      );

      return {
        success: true,
        action: 'restart',
        message: `Agent ${context.agent} restarted to fix validation error`,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        action: 'abort',
        message: `Failed to recover agent ${context.agent} from validation error: ${errMsg}`,
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Manager for recovery strategies
 * Selects and executes the appropriate strategy for each error type
 */
export class RecoveryManager {
  private strategies: Map<string, RecoveryStrategy> = new Map();

  constructor() {
    // Register default strategies
    this.registerStrategy(new CrashRecoveryStrategy());
    this.registerStrategy(new TimeoutRecoveryStrategy());
    this.registerStrategy(new ValidationRecoveryStrategy());
  }

  /**
   * Register a recovery strategy
   */
  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.set(strategy.getName(), strategy);
  }

  /**
   * Get a strategy by name
   */
  getStrategy(name: string): RecoveryStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Find a strategy that can recover from the given error
   */
  findStrategy(error: ErrorFlag): RecoveryStrategy | undefined {
    for (const strategy of this.strategies.values()) {
      if (strategy.canRecover(error)) {
        return strategy;
      }
    }
    return undefined;
  }

  /**
   * Check if an error can be recovered
   */
  canRecover(error: ErrorFlag): boolean {
    return this.findStrategy(error) !== undefined;
  }

  /**
   * Execute recovery for an error
   */
  async recover(context: RecoveryContext): Promise<RecoveryResult> {
    const strategy = this.findStrategy(context.errorFlag);

    if (!strategy) {
      return {
        success: false,
        action: 'abort',
        message: `No recovery strategy available for error type: ${context.errorFlag.error_type}`,
      };
    }

    return strategy.recover(context);
  }

  /**
   * Get all registered strategy names
   */
  getStrategyNames(): string[] {
    return Array.from(this.strategies.keys());
  }
}

/**
 * Default recovery manager instance
 */
export const defaultRecoveryManager = new RecoveryManager();
