import { execSync } from 'child_process';
import { TmuxManager } from './tmux-manager.js';
import { StateManager } from './state-manager.js';
import type { AgentName } from '../types/index.js';

export interface CleanupResult {
  success: boolean;
  processes_stopped: number;
  message: string;
  errors?: string[];
}

/**
 * CleanupManager - Handles termination of Claude processes in agent panes
 *
 * This manager provides shared cleanup logic for both CLI and Web UI to
 * terminate Claude processes while preserving run artifacts and tmux session.
 */
export class CleanupManager {
  private tmuxManager: TmuxManager;
  private stateManager: StateManager;
  private gracefulShutdownTimeout: number = 5000; // 5 seconds

  constructor(tmuxManager: TmuxManager, stateManager: StateManager) {
    this.tmuxManager = tmuxManager;
    this.stateManager = stateManager;
  }

  /**
   * Terminate all Claude processes in agent panes
   *
   * @returns CleanupResult with success status and count of processes stopped
   */
  async stopAllAgents(): Promise<CleanupResult> {
    const agents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
    let processesStoppedCount = 0;
    const errors: string[] = [];

    // Check if tmux session exists
    if (!this.tmuxManager.sessionExists()) {
      return {
        success: false,
        processes_stopped: 0,
        message: 'Tmux session not found',
      };
    }

    // Terminate each agent's Claude process
    for (const agent of agents) {
      try {
        const stopped = await this.stopAgentProcess(agent);
        if (stopped) {
          processesStoppedCount++;

          // Update state for this agent
          await this.stateManager.updateAgentStatus(agent, 'failed', 'stopped_by_user');
        }
      } catch (error) {
        const errorMsg = `Failed to stop ${agent}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
      }
    }

    // Update state.json with termination event
    const state = await this.stateManager.loadState();
    if (state) {
      state.history.push({
        phase: state.phase,
        result: 'agents_stopped_by_user',
        timestamp: new Date().toISOString(),
      });
      state.last_event = {
        type: 'run.agents_stopped',
        timestamp: new Date().toISOString(),
      };
      await this.stateManager.saveState(state);
    }

    return {
      success: processesStoppedCount > 0 || errors.length === 0,
      processes_stopped: processesStoppedCount,
      message: processesStoppedCount > 0
        ? `All agents terminated (${processesStoppedCount} processes stopped)`
        : 'No active processes found',
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Stop a single agent's process
   *
   * @param agent - The agent to stop
   * @returns true if process was stopped, false if no process was running
   */
  private async stopAgentProcess(agent: AgentName): Promise<boolean> {
    // Check if pane has an active process
    const isActive = this.tmuxManager.isPaneActive(agent);

    if (!isActive) {
      return false; // No process to stop
    }

    const sessionName = this.tmuxManager.getSessionName();
    const paneIndex = TmuxManager.getPaneIndex(agent);

    try {
      // Try graceful shutdown with Ctrl+C
      execSync(`tmux send-keys -t ${sessionName}:main.${paneIndex} C-c`, {
        stdio: 'ignore',
        timeout: this.gracefulShutdownTimeout,
      });

      // Wait a bit and check if process is still running
      await this.sleep(1000);

      const stillActive = this.tmuxManager.isPaneActive(agent);

      if (stillActive) {
        // Graceful shutdown failed, send another Ctrl+C
        execSync(`tmux send-keys -t ${sessionName}:main.${paneIndex} C-c`, {
          stdio: 'ignore',
        });

        await this.sleep(500);
      }

      return true;
    } catch (error) {
      // If all else fails, we've done our best
      throw new Error(`Failed to terminate ${agent} process: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Helper to sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Set graceful shutdown timeout
   */
  setGracefulShutdownTimeout(timeout: number): void {
    this.gracefulShutdownTimeout = timeout;
  }
}
