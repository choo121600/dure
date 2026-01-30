import { EventEmitter } from 'events';
import { join } from 'path';
import type {
  GatekeeperVerdict,
  Phase,
  OrchestraConfig,
} from '../types/index.js';
import { PhaseTransitionManager } from './phase-transition-manager.js';
import { MRPGenerator } from './mrp-generator.js';
import { PromptGenerator } from '../agents/prompt-generator.js';
import type { RunManager } from './run-manager.js';
import type { StateManager } from './state-manager.js';

/**
 * Result of verdict processing
 */
export type VerdictResult =
  | { action: 'complete'; mrpPath: string }
  | { action: 'retry'; iteration: number }
  | { action: 'minor_fix'; attempt: number }
  | { action: 'fail'; reason: string }
  | { action: 'wait_human'; crpId: string };

export type VerdictEvent =
  | { type: 'verdict_processing'; verdict: GatekeeperVerdict; runId: string }
  | { type: 'verdict_pass'; runId: string; mrpPath: string }
  | { type: 'verdict_fail'; runId: string; reason: string; maxIterations: boolean }
  | { action: 'verdict_retry'; runId: string; iteration: number }
  | { type: 'verdict_needs_human'; runId: string }
  | { type: 'mrp_generated'; runId: string; mrpPath: string }
  | { type: 'prompts_regenerated'; runId: string; iteration: number };

/**
 * VerdictHandler handles gatekeeper verdict processing:
 * - Processing PASS/FAIL/NEEDS_HUMAN verdicts
 * - Generating MRP on PASS
 * - Managing retry iterations on FAIL
 * - Regenerating prompts for retry
 */
export class VerdictHandler extends EventEmitter {
  private phaseManager: PhaseTransitionManager;
  private promptGenerator: PromptGenerator;
  private runManager: RunManager;
  private config: OrchestraConfig;
  private projectRoot: string;

  constructor(
    phaseManager: PhaseTransitionManager,
    promptGenerator: PromptGenerator,
    runManager: RunManager,
    config: OrchestraConfig,
    projectRoot: string
  ) {
    super();
    this.phaseManager = phaseManager;
    this.promptGenerator = promptGenerator;
    this.runManager = runManager;
    this.config = config;
    this.projectRoot = projectRoot;
  }

  /**
   * Process a gatekeeper verdict
   */
  async processVerdict(
    verdict: GatekeeperVerdict,
    runId: string,
    stateManager: StateManager
  ): Promise<VerdictResult> {
    this.emitEvent({ type: 'verdict_processing', verdict, runId });

    const { nextPhase, shouldRetry, isMinorFix } = await this.phaseManager.handleVerdict(verdict);

    switch (verdict.verdict) {
      case 'PASS':
        return this.handlePass(runId);

      case 'MINOR_FAIL':
        return this.handleMinorFail(runId, nextPhase, shouldRetry, isMinorFix, stateManager);

      case 'FAIL':
        return this.handleFail(runId, nextPhase, shouldRetry, stateManager);

      case 'NEEDS_HUMAN':
        return this.handleNeedsHuman(runId);

      default:
        throw new Error(`Unknown verdict: ${verdict.verdict}`);
    }
  }

  /**
   * Execute the result of verdict processing
   * This method performs the side effects (phase transitions, file generation)
   */
  async executeVerdictResult(
    result: VerdictResult,
    runId: string,
    stateManager: StateManager
  ): Promise<void> {
    switch (result.action) {
      case 'complete':
        await this.phaseManager.transition('ready_for_merge');
        break;

      case 'retry':
        await this.regeneratePromptsForRetry(runId, result.iteration, stateManager);
        await this.phaseManager.transition('build');
        break;

      case 'minor_fix':
        // Transition to verify phase - verifier will be started by orchestrator
        await this.phaseManager.transition('verify');
        break;

      case 'fail':
        await this.phaseManager.transition('failed');
        break;

      case 'wait_human':
        // Phase transition to waiting_human is handled by CRP creation
        break;
    }
  }

  /**
   * Handle PASS verdict
   */
  private async handlePass(runId: string): Promise<VerdictResult> {
    const runDir = this.runManager.getRunDir(runId);
    const mrpPath = join(runDir, 'mrp');

    // Generate MRP
    const mrpGenerator = new MRPGenerator(runDir, this.projectRoot);
    mrpGenerator.generate();

    this.emitEvent({ type: 'verdict_pass', runId, mrpPath });
    this.emitEvent({ type: 'mrp_generated', runId, mrpPath });

    return { action: 'complete', mrpPath };
  }

  /**
   * Handle MINOR_FAIL verdict
   * Gatekeeper made small fixes, re-run verifier to confirm
   */
  private async handleMinorFail(
    runId: string,
    nextPhase: Phase,
    shouldRetry: boolean,
    isMinorFix: boolean | undefined,
    stateManager: StateManager
  ): Promise<VerdictResult> {
    // If minor fix attempts exceeded, fall back to regular retry logic
    if (!isMinorFix) {
      if (nextPhase === 'failed') {
        const reason = 'Max iterations exceeded after minor fix attempts';
        this.emitEvent({ type: 'verdict_fail', runId, reason, maxIterations: true });
        return { action: 'fail', reason };
      }

      if (shouldRetry) {
        // Reset minor fix attempts when going to BUILD retry
        await stateManager.resetMinorFixAttempts();
        const { iteration } = await this.phaseManager.incrementIteration();
        this.emitEvent({ action: 'verdict_retry', runId, iteration });
        return { action: 'retry', iteration };
      }

      const reason = 'Minor fix attempts exhausted and retry not allowed';
      this.emitEvent({ type: 'verdict_fail', runId, reason, maxIterations: false });
      return { action: 'fail', reason };
    }

    // Increment minor fix attempt and re-run verifier
    await stateManager.incrementMinorFixAttempt();
    const state = await stateManager.loadState();
    const attempt = state?.minor_fix_attempts || 1;

    return { action: 'minor_fix', attempt };
  }

  /**
   * Handle FAIL verdict
   */
  private async handleFail(
    runId: string,
    nextPhase: Phase,
    shouldRetry: boolean,
    stateManager: StateManager
  ): Promise<VerdictResult> {
    if (nextPhase === 'failed') {
      const reason = 'Max iterations exceeded';
      this.emitEvent({ type: 'verdict_fail', runId, reason, maxIterations: true });
      return { action: 'fail', reason };
    }

    if (shouldRetry) {
      // Reset minor fix attempts when going to BUILD retry
      await stateManager.resetMinorFixAttempts();
      const { iteration } = await this.phaseManager.incrementIteration();
      this.emitEvent({ action: 'verdict_retry', runId, iteration });
      return { action: 'retry', iteration };
    }

    const reason = 'Retry not allowed';
    this.emitEvent({ type: 'verdict_fail', runId, reason, maxIterations: false });
    return { action: 'fail', reason };
  }

  /**
   * Handle NEEDS_HUMAN verdict
   */
  private async handleNeedsHuman(runId: string): Promise<VerdictResult> {
    this.emitEvent({ type: 'verdict_needs_human', runId });
    // The CRP ID will be set when the CRP is actually created
    return { action: 'wait_human', crpId: '' };
  }

  /**
   * Regenerate prompts for retry iteration
   */
  async regeneratePromptsForRetry(
    runId: string,
    iteration: number,
    stateManager: StateManager
  ): Promise<void> {
    const runDir = this.runManager.getRunDir(runId);
    const state = await stateManager.loadState();
    const currentIteration = state?.iteration || iteration;

    await this.promptGenerator.generateAllPrompts(join(runDir, 'prompts'), {
      project_root: this.projectRoot,
      run_id: runId,
      config: this.config,
      iteration: currentIteration,
      has_review: true,
    });

    this.emitEvent({ type: 'prompts_regenerated', runId, iteration: currentIteration });
  }

  /**
   * Get the phase manager for external access
   */
  getPhaseManager(): PhaseTransitionManager {
    return this.phaseManager;
  }

  /**
   * Check if iteration limit is exceeded
   */
  async isMaxIterationsExceeded(stateManager: StateManager): Promise<boolean> {
    const state = await stateManager.loadState();
    if (!state) return false;
    return state.iteration >= state.max_iterations;
  }

  /**
   * Get current iteration
   */
  async getCurrentIteration(stateManager: StateManager): Promise<number> {
    return this.phaseManager.getCurrentIteration();
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: VerdictEvent): void {
    this.emit('verdict_event', event);
  }
}
