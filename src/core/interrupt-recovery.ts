import { EventEmitter } from 'events';
import { join } from 'path';
import type { AgentName, Phase, OrchestraConfig } from '../types/index.js';
import { RunManager } from './run-manager.js';
import { StateManager } from './state-manager.js';
import { TmuxManager } from './tmux-manager.js';

/**
 * Resume strategy for interrupted runs
 */
export type ResumeStrategy = 'restart_agent' | 'wait_human' | 'manual';

/**
 * Information about an interrupted run
 */
export interface InterruptedRun {
  runId: string;
  phase: Phase;
  lastAgent: AgentName | null;
  interruptedAt: string;
  canResume: boolean;
  resumeStrategy: ResumeStrategy;
  reason: string;
  tmuxSessionExists: boolean;
  iteration: number;
  maxIterations: number;
}

/**
 * Options for interrupt recovery
 */
export interface InterruptRecoveryOptions {
  /** Enable automatic recovery on startup (default: false) */
  autoRecover: boolean;
  /** Maximum age of runs to consider for recovery in milliseconds (default: 24h) */
  maxAgeMs: number;
  /** tmux session prefix for checking session existence */
  tmuxSessionPrefix: string;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  runId: string;
  success: boolean;
  strategy: ResumeStrategy;
  message: string;
  error?: string;
}

export type InterruptRecoveryEvent =
  | { type: 'scan_started' }
  | { type: 'scan_completed'; found: number }
  | { type: 'recovery_started'; runId: string; strategy: ResumeStrategy }
  | { type: 'recovery_completed'; runId: string; success: boolean }
  | { type: 'recovery_failed'; runId: string; error: string };

const DEFAULT_OPTIONS: InterruptRecoveryOptions = {
  autoRecover: false,
  maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
  tmuxSessionPrefix: 'orchestral',
};

/**
 * Phases that indicate an active run was interrupted
 */
const ACTIVE_PHASES: Phase[] = ['refine', 'build', 'verify', 'gate'];

/**
 * Map phases to the agent that should be running
 */
const PHASE_TO_AGENT: Record<string, AgentName> = {
  refine: 'refiner',
  build: 'builder',
  verify: 'verifier',
  gate: 'gatekeeper',
};

/**
 * InterruptRecovery handles detection and recovery of interrupted runs.
 *
 * When the server crashes or is terminated, runs may be left in an
 * intermediate state. This class:
 * - Detects such runs on startup
 * - Determines the appropriate recovery strategy
 * - Provides mechanisms to resume or mark them appropriately
 */
export class InterruptRecovery extends EventEmitter {
  private runManager: RunManager;
  private options: InterruptRecoveryOptions;
  private projectRoot: string;
  private config: OrchestraConfig | null = null;

  constructor(
    projectRoot: string,
    options: Partial<InterruptRecoveryOptions> = {}
  ) {
    super();
    this.projectRoot = projectRoot;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.runManager = new RunManager(projectRoot);
  }

  /**
   * Set configuration (needed for some operations)
   */
  setConfig(config: OrchestraConfig): void {
    this.config = config;
    this.options.tmuxSessionPrefix = config.global.tmux_session_prefix;
  }

  /**
   * Detect all interrupted runs
   */
  async detectInterruptedRuns(): Promise<InterruptedRun[]> {
    this.emitEvent({ type: 'scan_started' });

    const allRuns = await this.runManager.listRuns();
    const interrupted: InterruptedRun[] = [];
    const now = Date.now();

    for (const run of allRuns) {
      // Skip completed or failed runs
      if (run.phase === 'completed' || run.phase === 'failed') {
        continue;
      }

      // Skip runs older than maxAgeMs
      const runTime = new Date(run.started_at).getTime();
      if (now - runTime > this.options.maxAgeMs) {
        continue;
      }

      const runDir = this.runManager.getRunDir(run.run_id);
      const stateManager = new StateManager(runDir);
      const state = await stateManager.loadState();

      if (!state) {
        continue;
      }

      // Check if tmux session exists
      const tmuxManager = new TmuxManager(
        this.options.tmuxSessionPrefix,
        this.projectRoot,
        run.run_id
      );
      const tmuxSessionExists = tmuxManager.sessionExists();

      // Determine recovery strategy
      const { canResume, strategy, reason } = this.determineRecoveryStrategy(
        state.phase,
        state.agents,
        tmuxSessionExists
      );

      // Find the last active agent
      let lastAgent: AgentName | null = null;
      if (ACTIVE_PHASES.includes(state.phase as Phase)) {
        lastAgent = PHASE_TO_AGENT[state.phase] || null;
      } else if (state.last_event?.agent) {
        lastAgent = state.last_event.agent;
      }

      interrupted.push({
        runId: run.run_id,
        phase: state.phase,
        lastAgent,
        interruptedAt: state.updated_at,
        canResume,
        resumeStrategy: strategy,
        reason,
        tmuxSessionExists,
        iteration: state.iteration,
        maxIterations: state.max_iterations,
      });
    }

    this.emitEvent({ type: 'scan_completed', found: interrupted.length });
    return interrupted;
  }

  /**
   * Determine the recovery strategy for a run based on its state
   */
  private determineRecoveryStrategy(
    phase: Phase,
    agents: Record<AgentName, { status: string }>,
    tmuxSessionExists: boolean
  ): { canResume: boolean; strategy: ResumeStrategy; reason: string } {
    // Waiting for human input - just need to wait
    if (phase === 'waiting_human') {
      return {
        canResume: true,
        strategy: 'wait_human',
        reason: 'Run is waiting for human input (CRP pending)',
      };
    }

    // Ready for merge - no recovery needed
    if (phase === 'ready_for_merge') {
      return {
        canResume: false,
        strategy: 'manual',
        reason: 'Run is ready for merge, no recovery needed',
      };
    }

    // Active phase with tmux session - agent might still be running
    if (ACTIVE_PHASES.includes(phase) && tmuxSessionExists) {
      const agent = PHASE_TO_AGENT[phase];
      const agentState = agents[agent];

      if (agentState?.status === 'running') {
        return {
          canResume: true,
          strategy: 'restart_agent',
          reason: `Agent ${agent} was running when interrupted, tmux session exists`,
        };
      }
    }

    // Active phase without tmux - need to restart agent
    if (ACTIVE_PHASES.includes(phase)) {
      const agent = PHASE_TO_AGENT[phase];
      return {
        canResume: true,
        strategy: 'restart_agent',
        reason: `Run was in ${phase} phase, will restart ${agent}`,
      };
    }

    // Unknown state - require manual intervention
    return {
      canResume: false,
      strategy: 'manual',
      reason: `Unknown recovery path for phase: ${phase}`,
    };
  }

  /**
   * Attempt to recover a specific run
   * Note: This method marks the run for recovery. Actual agent restart
   * should be done by the Orchestrator.
   */
  async prepareRecovery(runId: string): Promise<RecoveryResult> {
    this.emitEvent({ type: 'recovery_started', runId, strategy: 'restart_agent' });

    try {
      const runDir = this.runManager.getRunDir(runId);
      const stateManager = new StateManager(runDir);
      const state = await stateManager.loadState();

      if (!state) {
        throw new Error(`Run ${runId} not found`);
      }

      // Detect the interrupted run info
      const tmuxManager = new TmuxManager(
        this.options.tmuxSessionPrefix,
        this.projectRoot,
        runId
      );
      const tmuxSessionExists = tmuxManager.sessionExists();

      const { canResume, strategy, reason } = this.determineRecoveryStrategy(
        state.phase,
        state.agents,
        tmuxSessionExists
      );

      if (!canResume) {
        return {
          runId,
          success: false,
          strategy,
          message: reason,
        };
      }

      // For wait_human strategy, just return success - no action needed
      if (strategy === 'wait_human') {
        this.emitEvent({ type: 'recovery_completed', runId, success: true });
        return {
          runId,
          success: true,
          strategy,
          message: 'Run is waiting for human input, no recovery action needed',
        };
      }

      // For restart_agent strategy, mark the state as ready for recovery
      // The actual restart should be done by the Orchestrator
      const agent = PHASE_TO_AGENT[state.phase];
      if (agent) {
        // Reset agent status to pending so it can be restarted
        await stateManager.updateAgentStatus(agent, 'pending');
      }

      this.emitEvent({ type: 'recovery_completed', runId, success: true });
      return {
        runId,
        success: true,
        strategy,
        message: `Run prepared for recovery. Agent ${agent} will be restarted.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emitEvent({ type: 'recovery_failed', runId, error: errorMessage });
      return {
        runId,
        success: false,
        strategy: 'manual',
        message: 'Recovery failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Mark a run as failed (for runs that cannot be recovered)
   */
  async markAsFailed(runId: string, reason: string): Promise<void> {
    const runDir = this.runManager.getRunDir(runId);
    const stateManager = new StateManager(runDir);
    const state = await stateManager.loadState();

    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    await stateManager.updatePhase('failed');
    await stateManager.addError(`Recovery failed: ${reason}`);
  }

  /**
   * Check if auto-recovery is enabled
   */
  isAutoRecoverEnabled(): boolean {
    return this.options.autoRecover;
  }

  /**
   * Get a summary of interrupted runs for display
   */
  async getInterruptedRunsSummary(): Promise<string> {
    const runs = await this.detectInterruptedRuns();

    if (runs.length === 0) {
      return 'No interrupted runs detected.';
    }

    const lines = [
      `Found ${runs.length} interrupted run(s):`,
      '',
    ];

    for (const run of runs) {
      lines.push(`  ${run.runId}`);
      lines.push(`    Phase: ${run.phase}`);
      lines.push(`    Last Agent: ${run.lastAgent || 'N/A'}`);
      lines.push(`    Strategy: ${run.resumeStrategy}`);
      lines.push(`    Reason: ${run.reason}`);
      lines.push(`    Tmux Session: ${run.tmuxSessionExists ? 'exists' : 'not found'}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: InterruptRecoveryEvent): void {
    this.emit('recovery_event', event);
  }
}

/**
 * Create an InterruptRecovery instance with config
 */
export function createInterruptRecovery(
  projectRoot: string,
  config: OrchestraConfig,
  options: Partial<InterruptRecoveryOptions> = {}
): InterruptRecovery {
  const recovery = new InterruptRecovery(projectRoot, {
    ...options,
    tmuxSessionPrefix: config.global.tmux_session_prefix,
  });
  recovery.setConfig(config);
  return recovery;
}
