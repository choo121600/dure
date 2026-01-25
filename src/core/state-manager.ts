import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import type { RunState, Phase, AgentName, AgentStatus, HistoryEntry } from '../types/index.js';

export class StateManager {
  private runDir: string;
  private statePath: string;

  constructor(runDir: string) {
    this.runDir = runDir;
    this.statePath = join(runDir, 'state.json');
  }

  /**
   * Create initial state for a new run
   */
  createInitialState(runId: string, maxIterations: number): RunState {
    const now = new Date().toISOString();

    const state: RunState = {
      run_id: runId,
      phase: 'refine',
      iteration: 1,
      max_iterations: maxIterations,
      started_at: now,
      updated_at: now,
      agents: {
        refiner: { status: 'pending' },
        builder: { status: 'pending' },
        verifier: { status: 'pending' },
        gatekeeper: { status: 'pending' },
      },
      pending_crp: null,
      last_event: {
        type: 'run.started',
        timestamp: now,
      },
      errors: [],
      history: [],
    };

    this.saveState(state);
    return state;
  }

  /**
   * Load the current state
   */
  loadState(): RunState | null {
    if (!existsSync(this.statePath)) {
      return null;
    }

    try {
      const content = readFileSync(this.statePath, 'utf-8');
      return JSON.parse(content) as RunState;
    } catch {
      console.error('Failed to load state.json');
      return null;
    }
  }

  /**
   * Save state atomically using temp file + rename
   */
  saveState(state: RunState): void {
    state.updated_at = new Date().toISOString();

    const tempPath = `${this.statePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tempPath, this.statePath);
  }

  /**
   * Update the phase
   */
  updatePhase(phase: Phase): RunState {
    const state = this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    // Add to history
    state.history.push({
      phase: state.phase,
      result: 'completed',
      timestamp: new Date().toISOString(),
    });

    state.phase = phase;
    this.saveState(state);
    return state;
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agent: AgentName, status: AgentStatus, error?: string): RunState {
    const state = this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    const now = new Date().toISOString();
    state.agents[agent].status = status;

    if (status === 'running') {
      state.agents[agent].started_at = now;
    } else if (status === 'completed' || status === 'failed') {
      state.agents[agent].completed_at = now;
    }

    if (error) {
      state.agents[agent].error = error;
    }

    this.saveState(state);
    return state;
  }

  /**
   * Set pending CRP
   */
  setPendingCRP(crpId: string | null): RunState {
    const state = this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.pending_crp = crpId;
    if (crpId) {
      state.phase = 'waiting_human';
    }

    this.saveState(state);
    return state;
  }

  /**
   * Increment iteration (for retries)
   */
  incrementIteration(): RunState {
    const state = this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.iteration += 1;

    // Reset agent statuses for retry
    state.agents.builder.status = 'pending';
    state.agents.builder.started_at = undefined;
    state.agents.builder.completed_at = undefined;
    state.agents.builder.error = undefined;

    state.agents.verifier.status = 'pending';
    state.agents.verifier.started_at = undefined;
    state.agents.verifier.completed_at = undefined;
    state.agents.verifier.error = undefined;

    state.agents.gatekeeper.status = 'pending';
    state.agents.gatekeeper.started_at = undefined;
    state.agents.gatekeeper.completed_at = undefined;
    state.agents.gatekeeper.error = undefined;

    this.saveState(state);
    return state;
  }

  /**
   * Add history entry
   */
  addHistory(entry: HistoryEntry): RunState {
    const state = this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.history.push(entry);
    this.saveState(state);
    return state;
  }

  /**
   * Check if max iterations exceeded
   */
  isMaxIterationsExceeded(): boolean {
    const state = this.loadState();
    if (!state) {
      return false;
    }
    return state.iteration >= state.max_iterations;
  }

  /**
   * Get the state file path
   */
  getStatePath(): string {
    return this.statePath;
  }

  /**
   * Check if state exists
   */
  stateExists(): boolean {
    return existsSync(this.statePath);
  }

  /**
   * Update last event
   */
  updateLastEvent(type: string, agent?: 'refiner' | 'builder' | 'verifier' | 'gatekeeper'): RunState {
    const state = this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.last_event = {
      type,
      agent,
      timestamp: new Date().toISOString(),
    };

    this.saveState(state);
    return state;
  }

  /**
   * Add error to errors array
   */
  addError(error: string): RunState {
    const state = this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.errors.push(error);
    this.saveState(state);
    return state;
  }

  /**
   * Set timeout_at for an agent
   */
  setAgentTimeout(agent: 'refiner' | 'builder' | 'verifier' | 'gatekeeper', timeoutAt: string): RunState {
    const state = this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.agents[agent].timeout_at = timeoutAt;
    this.saveState(state);
    return state;
  }
}
