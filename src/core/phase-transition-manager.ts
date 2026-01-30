import { EventEmitter } from 'events';
import type { Phase, AgentName, GatekeeperVerdict, Verdict } from '../types/index.js';
import { StateManager } from './state-manager.js';

export type PhaseTransitionEvent =
  | { type: 'transition_started'; from: Phase; to: Phase }
  | { type: 'transition_completed'; from: Phase; to: Phase }
  | { type: 'transition_blocked'; from: Phase; to: Phase; reason: string }
  | { type: 'iteration_started'; iteration: number; maxIterations: number }
  | { type: 'max_iterations_exceeded'; iteration: number; maxIterations: number };

/**
 * Valid phase transitions map
 * Maps from phase to array of valid next phases
 */
const VALID_TRANSITIONS: Record<Phase, Phase[]> = {
  refine: ['build', 'waiting_human'],
  build: ['verify', 'waiting_human'],
  verify: ['gate', 'waiting_human'],
  gate: ['ready_for_merge', 'build', 'verify', 'waiting_human', 'failed'],
  waiting_human: ['refine', 'build', 'verify', 'gate'],
  ready_for_merge: ['completed'],
  completed: [],
  failed: [],
};

/**
 * Phase to agent mapping
 */
const PHASE_TO_AGENT: Record<Phase, AgentName | null> = {
  refine: 'refiner',
  build: 'builder',
  verify: 'verifier',
  gate: 'gatekeeper',
  waiting_human: null,
  ready_for_merge: null,
  completed: null,
  failed: null,
};

/**
 * Agent to phase mapping
 */
const AGENT_TO_PHASE: Record<AgentName, Phase> = {
  refiner: 'refine',
  builder: 'build',
  verifier: 'verify',
  gatekeeper: 'gate',
};

/**
 * PhaseTransitionManager handles phase transitions:
 * - Validates if transitions are allowed
 * - Executes phase transitions
 * - Determines next phase based on verdict
 * - Tracks iteration count
 */
export class PhaseTransitionManager extends EventEmitter {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    super();
    this.stateManager = stateManager;
  }

  /**
   * Check if a transition from one phase to another is valid
   */
  canTransition(from: Phase, to: Phase): boolean {
    const validTargets = VALID_TRANSITIONS[from];
    return validTargets.includes(to);
  }

  /**
   * Execute a phase transition
   */
  async transition(to: Phase): Promise<boolean> {
    const state = await this.stateManager.loadState();
    if (!state) {
      throw new Error('No state available for transition');
    }

    const from = state.phase;

    // Check if transition is valid
    if (!this.canTransition(from, to)) {
      this.emitEvent({
        type: 'transition_blocked',
        from,
        to,
        reason: `Invalid transition from ${from} to ${to}`,
      });
      return false;
    }

    this.emitEvent({ type: 'transition_started', from, to });

    // Update state
    await this.stateManager.updatePhase(to);

    this.emitEvent({ type: 'transition_completed', from, to });

    return true;
  }

  /**
   * Get the next phase based on current phase and optional verdict
   */
  async getNextPhase(current: Phase, verdict?: Verdict): Promise<Phase | null> {
    switch (current) {
      case 'refine':
        return 'build';
      case 'build':
        return 'verify';
      case 'verify':
        return 'gate';
      case 'gate':
        if (verdict === 'PASS') {
          return 'ready_for_merge';
        } else if (verdict === 'MINOR_FAIL') {
          // Check if minor fix attempts exceeded
          if (await this.stateManager.isMinorFixExceeded()) {
            // Fall back to BUILD retry
            if (await this.stateManager.isMaxIterationsExceeded()) {
              return 'failed';
            }
            return 'build';
          }
          return 'verify'; // Re-run verifier after gatekeeper fix
        } else if (verdict === 'FAIL') {
          // Check if max iterations exceeded
          if (await this.stateManager.isMaxIterationsExceeded()) {
            return 'failed';
          }
          return 'build'; // Retry from builder
        } else if (verdict === 'NEEDS_HUMAN') {
          return 'waiting_human';
        }
        return null;
      case 'waiting_human':
        // Next phase depends on which agent created the CRP
        return null; // Will be determined dynamically
      case 'ready_for_merge':
        return 'completed';
      default:
        return null;
    }
  }

  /**
   * Get the agent responsible for a phase
   */
  getPhaseAgent(phase: Phase): AgentName | null {
    return PHASE_TO_AGENT[phase];
  }

  /**
   * Get the phase for an agent
   */
  getAgentPhase(agent: AgentName): Phase {
    return AGENT_TO_PHASE[agent];
  }

  /**
   * Get the previous agent based on current phase
   */
  getPreviousAgent(phase: Phase): AgentName | null {
    switch (phase) {
      case 'build':
        return 'refiner';
      case 'verify':
        return 'builder';
      case 'gate':
        return 'verifier';
      case 'ready_for_merge':
      case 'failed':
        return 'gatekeeper';
      default:
        return null;
    }
  }

  /**
   * Handle gatekeeper verdict and determine appropriate action
   */
  async handleVerdict(verdict: GatekeeperVerdict): Promise<{ nextPhase: Phase; shouldRetry: boolean; isMinorFix?: boolean }> {
    const state = await this.stateManager.loadState();
    if (!state) {
      throw new Error('No state available');
    }

    switch (verdict.verdict) {
      case 'PASS':
        return { nextPhase: 'ready_for_merge', shouldRetry: false };

      case 'MINOR_FAIL':
        // Check if minor fix attempts exceeded
        if (await this.stateManager.isMinorFixExceeded()) {
          // Fall back to BUILD retry if max iterations not exceeded
          if (await this.stateManager.isMaxIterationsExceeded()) {
            return { nextPhase: 'failed', shouldRetry: false };
          }
          return { nextPhase: 'build', shouldRetry: true };
        }
        return { nextPhase: 'verify', shouldRetry: false, isMinorFix: true };

      case 'FAIL':
        if (await this.stateManager.isMaxIterationsExceeded()) {
          return { nextPhase: 'failed', shouldRetry: false };
        }
        return { nextPhase: 'build', shouldRetry: true };

      case 'NEEDS_HUMAN':
        return { nextPhase: 'waiting_human', shouldRetry: false };

      default:
        throw new Error(`Unknown verdict: ${verdict.verdict}`);
    }
  }

  /**
   * Increment iteration and check if max exceeded
   */
  async incrementIteration(): Promise<{ iteration: number; maxExceeded: boolean }> {
    const state = await this.stateManager.loadState();
    if (!state) {
      throw new Error('No state available');
    }

    await this.stateManager.incrementIteration();
    const newState = (await this.stateManager.loadState())!;

    const iteration = newState.iteration;
    const maxIterations = newState.max_iterations;
    const maxExceeded = iteration > maxIterations;

    this.emitEvent({
      type: 'iteration_started',
      iteration,
      maxIterations,
    });

    if (maxExceeded) {
      this.emitEvent({
        type: 'max_iterations_exceeded',
        iteration,
        maxIterations,
      });
    }

    return { iteration, maxExceeded };
  }

  /**
   * Get current phase from state
   */
  async getCurrentPhase(): Promise<Phase | null> {
    const state = await this.stateManager.loadState();
    return state?.phase || null;
  }

  /**
   * Get current iteration
   */
  async getCurrentIteration(): Promise<number> {
    const state = await this.stateManager.loadState();
    return state?.iteration || 1;
  }

  /**
   * Get max iterations
   */
  async getMaxIterations(): Promise<number> {
    const state = await this.stateManager.loadState();
    return state?.max_iterations || 3;
  }

  /**
   * Check if currently in terminal state
   */
  async isTerminalPhase(): Promise<boolean> {
    const phase = await this.getCurrentPhase();
    return phase === 'completed' || phase === 'failed' || phase === 'ready_for_merge';
  }

  /**
   * Check if waiting for human input
   */
  async isWaitingForHuman(): Promise<boolean> {
    return (await this.getCurrentPhase()) === 'waiting_human';
  }

  /**
   * Set pending CRP and transition to waiting_human
   */
  async setPendingCRP(crpId: string | null): Promise<void> {
    await this.stateManager.setPendingCRP(crpId);
    if (crpId) {
      await this.transition('waiting_human');
    }
  }

  /**
   * Get pending CRP ID
   */
  async getPendingCRP(): Promise<string | null> {
    const state = await this.stateManager.loadState();
    return state?.pending_crp || null;
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: PhaseTransitionEvent): void {
    this.emit('phase_event', event);
  }
}
