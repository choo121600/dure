import { access, readFile, writeFile, rename, mkdir, constants, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { RunState, Phase, AgentName, AgentStatus, HistoryEntry, UsageInfo, TotalUsage, AsyncResult } from '../types/index.js';
import type { Result } from '../types/index.js';
import { ok, err } from '../types/index.js';
import { StateError, ErrorCodes, createStateNotFoundError, createStateLoadError, createStateSaveError } from '../types/index.js';
import { CACHE, PRECISION } from '../config/constants.js';

/**
 * Simple mutex implementation for async operations
 */
class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export class StateManager {
  private runDir: string;
  private statePath: string;

  // Caching
  private cachedState: RunState | null = null;
  private lastReadTime: number = 0;
  private cacheTTL: number;

  // Mutex for atomic save operations
  private saveMutex = new AsyncMutex();

  // Counter for unique tmp file names
  private saveCounter = 0;

  constructor(runDir: string, cacheTTL: number = CACHE.STATE_CACHE_TTL_MS) {
    this.runDir = runDir;
    this.statePath = join(runDir, 'state.json');
    this.cacheTTL = cacheTTL;
  }

  /**
   * Create initial state for a new run
   */
  async createInitialState(runId: string, maxIterations: number): Promise<RunState> {
    const now = new Date().toISOString();

    const state: RunState = {
      run_id: runId,
      phase: 'refine',
      iteration: 1,
      max_iterations: maxIterations,
      minor_fix_attempts: 0,
      max_minor_fix_attempts: 2,
      started_at: now,
      updated_at: now,
      agents: {
        refiner: { status: 'pending', usage: null },
        builder: { status: 'pending', usage: null },
        verifier: { status: 'pending', usage: null },
        gatekeeper: { status: 'pending', usage: null },
      },
      pending_crp: null,
      last_event: {
        type: 'run.started',
        timestamp: now,
      },
      errors: [],
      history: [],
      usage: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_creation_tokens: 0,
        total_cache_read_tokens: 0,
        total_cost_usd: 0,
      },
    };

    await this.saveState(state);
    return state;
  }

  /**
   * Load the current state (async with caching)
   */
  async loadState(): Promise<RunState | null> {
    // Check cache first
    const now = Date.now();
    if (this.cachedState && (now - this.lastReadTime) < this.cacheTTL) {
      return this.cachedState;
    }

    // Check if file exists
    try {
      await access(this.statePath, constants.F_OK);
    } catch {
      this.cachedState = null;
      return null;
    }

    try {
      const content = await readFile(this.statePath, 'utf-8');
      this.cachedState = JSON.parse(content) as RunState;
      this.lastReadTime = Date.now();
      return this.cachedState;
    } catch {
      console.error('Failed to load state.json');
      this.cachedState = null;
      return null;
    }
  }

  /**
   * Load state with Result pattern (safe version)
   * Returns Result<RunState, StateError> instead of throwing
   */
  async loadStateSafe(): AsyncResult<RunState, StateError> {
    // Check cache first
    const now = Date.now();
    if (this.cachedState && (now - this.lastReadTime) < this.cacheTTL) {
      return ok(this.cachedState);
    }

    // Check if file exists
    try {
      await access(this.statePath, constants.F_OK);
    } catch {
      this.cachedState = null;
      return err(createStateNotFoundError());
    }

    try {
      const content = await readFile(this.statePath, 'utf-8');
      this.cachedState = JSON.parse(content) as RunState;
      this.lastReadTime = Date.now();
      return ok(this.cachedState);
    } catch (error) {
      this.cachedState = null;
      return err(createStateLoadError(
        this.statePath,
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Load state synchronously (for backward compatibility during transition)
   * @deprecated Use loadState() instead. Will be removed in v1.0
   */
  loadStateSync(): RunState | null {
    console.warn('[DEPRECATED] loadStateSync() is deprecated. Use loadState() instead. Will be removed in v1.0');

    if (!existsSync(this.statePath)) {
      return null;
    }

    try {
      const { readFileSync } = require('fs');
      const content = readFileSync(this.statePath, 'utf-8');
      return JSON.parse(content) as RunState;
    } catch {
      console.error('Failed to load state.json');
      return null;
    }
  }

  /**
   * Save state atomically using temp file + rename
   * Protected by mutex to prevent race conditions
   */
  async saveState(state: RunState): Promise<void> {
    return this.saveMutex.withLock(async () => {
      state.updated_at = new Date().toISOString();

      // Ensure directory exists
      await mkdir(this.runDir, { recursive: true });

      // Use unique temp file name to prevent race conditions
      const uniqueId = `${Date.now()}-${++this.saveCounter}`;
      const tempPath = `${this.statePath}.tmp.${uniqueId}`;

      try {
        await writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8');
        await rename(tempPath, this.statePath);

        // Update cache
        this.cachedState = state;
        this.lastReadTime = Date.now();
      } catch (error) {
        // Clean up temp file on error
        try {
          await unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      }
    });
  }

  /**
   * Save state with Result pattern (safe version)
   * Returns Result<void, StateError> instead of throwing
   * Protected by mutex to prevent race conditions
   */
  async saveStateSafe(state: RunState): AsyncResult<void, StateError> {
    return this.saveMutex.withLock(async () => {
      state.updated_at = new Date().toISOString();

      // Use unique temp file name to prevent race conditions
      const uniqueId = `${Date.now()}-${++this.saveCounter}`;
      const tempPath = `${this.statePath}.tmp.${uniqueId}`;

      try {
        // Ensure directory exists
        await mkdir(this.runDir, { recursive: true });

        await writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8');
        await rename(tempPath, this.statePath);

        // Update cache
        this.cachedState = state;
        this.lastReadTime = Date.now();

        return ok(undefined);
      } catch (error) {
        // Clean up temp file on error
        try {
          await unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        return err(createStateSaveError(
          this.statePath,
          error instanceof Error ? error : new Error(String(error))
        ));
      }
    });
  }

  /**
   * Update the phase
   */
  async updatePhase(phase: Phase): Promise<RunState> {
    const state = await this.loadState();
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
    await this.saveState(state);
    return state;
  }

  /**
   * Update phase with Result pattern (safe version)
   */
  async updatePhaseSafe(phase: Phase): AsyncResult<RunState, StateError> {
    const stateResult = await this.loadStateSafe();
    if (!stateResult.success) {
      return stateResult;
    }

    const state = stateResult.data;

    // Add to history
    state.history.push({
      phase: state.phase,
      result: 'completed',
      timestamp: new Date().toISOString(),
    });

    state.phase = phase;

    const saveResult = await this.saveStateSafe(state);
    if (!saveResult.success) {
      return saveResult as Result<RunState, StateError>;
    }

    return ok(state);
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(agent: AgentName, status: AgentStatus, error?: string): Promise<RunState> {
    const state = await this.loadState();
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

    await this.saveState(state);
    return state;
  }

  /**
   * Update agent status with Result pattern (safe version)
   */
  async updateAgentStatusSafe(agent: AgentName, status: AgentStatus, errorMsg?: string): AsyncResult<RunState, StateError> {
    const stateResult = await this.loadStateSafe();
    if (!stateResult.success) {
      return stateResult;
    }

    const state = stateResult.data;
    const now = new Date().toISOString();
    state.agents[agent].status = status;

    if (status === 'running') {
      state.agents[agent].started_at = now;
    } else if (status === 'completed' || status === 'failed') {
      state.agents[agent].completed_at = now;
    }

    if (errorMsg) {
      state.agents[agent].error = errorMsg;
    }

    const saveResult = await this.saveStateSafe(state);
    if (!saveResult.success) {
      return saveResult as Result<RunState, StateError>;
    }

    return ok(state);
  }

  /**
   * Set pending CRP
   */
  async setPendingCRP(crpId: string | null): Promise<RunState> {
    const state = await this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.pending_crp = crpId;
    if (crpId) {
      state.phase = 'waiting_human';
    }

    await this.saveState(state);
    return state;
  }

  /**
   * Set pending CRP with Result pattern (safe version)
   */
  async setPendingCRPSafe(crpId: string | null): AsyncResult<RunState, StateError> {
    const stateResult = await this.loadStateSafe();
    if (!stateResult.success) {
      return stateResult;
    }

    const state = stateResult.data;
    state.pending_crp = crpId;
    if (crpId) {
      state.phase = 'waiting_human';
    }

    const saveResult = await this.saveStateSafe(state);
    if (!saveResult.success) {
      return saveResult as Result<RunState, StateError>;
    }

    return ok(state);
  }

  /**
   * Increment iteration (for retries)
   */
  async incrementIteration(): Promise<RunState> {
    const state = await this.loadState();
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

    await this.saveState(state);
    return state;
  }

  /**
   * Increment iteration with Result pattern (safe version)
   */
  async incrementIterationSafe(): AsyncResult<RunState, StateError> {
    const stateResult = await this.loadStateSafe();
    if (!stateResult.success) {
      return stateResult;
    }

    const state = stateResult.data;
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

    const saveResult = await this.saveStateSafe(state);
    if (!saveResult.success) {
      return saveResult as Result<RunState, StateError>;
    }

    return ok(state);
  }

  /**
   * Increment minor fix attempt counter
   */
  async incrementMinorFixAttempt(): Promise<RunState> {
    const state = await this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.minor_fix_attempts += 1;

    // Reset verifier and gatekeeper statuses for re-run
    state.agents.verifier.status = 'pending';
    state.agents.verifier.started_at = undefined;
    state.agents.verifier.completed_at = undefined;
    state.agents.verifier.error = undefined;

    state.agents.gatekeeper.status = 'pending';
    state.agents.gatekeeper.started_at = undefined;
    state.agents.gatekeeper.completed_at = undefined;
    state.agents.gatekeeper.error = undefined;

    await this.saveState(state);
    return state;
  }

  /**
   * Reset minor fix attempts (called when iteration increments for BUILD retry)
   */
  async resetMinorFixAttempts(): Promise<RunState> {
    const state = await this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.minor_fix_attempts = 0;
    await this.saveState(state);
    return state;
  }

  /**
   * Check if minor fix attempts exceeded
   */
  async isMinorFixExceeded(): Promise<boolean> {
    const state = await this.loadState();
    if (!state) {
      return false;
    }
    return state.minor_fix_attempts >= state.max_minor_fix_attempts;
  }

  /**
   * Add history entry
   */
  async addHistory(entry: HistoryEntry): Promise<RunState> {
    const state = await this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.history.push(entry);
    await this.saveState(state);
    return state;
  }

  /**
   * Add history entry with Result pattern (safe version)
   */
  async addHistorySafe(entry: HistoryEntry): AsyncResult<RunState, StateError> {
    const stateResult = await this.loadStateSafe();
    if (!stateResult.success) {
      return stateResult;
    }

    const state = stateResult.data;
    state.history.push(entry);

    const saveResult = await this.saveStateSafe(state);
    if (!saveResult.success) {
      return saveResult as Result<RunState, StateError>;
    }

    return ok(state);
  }

  /**
   * Check if max iterations exceeded
   */
  async isMaxIterationsExceeded(): Promise<boolean> {
    const state = await this.loadState();
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
   * Check if state exists (async)
   */
  async stateExists(): Promise<boolean> {
    try {
      await access(this.statePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if state exists (sync, for backward compatibility)
   * @deprecated Use stateExists() instead. Will be removed in v1.0
   */
  stateExistsSync(): boolean {
    console.warn('[DEPRECATED] stateExistsSync() is deprecated. Use stateExists() instead. Will be removed in v1.0');
    return existsSync(this.statePath);
  }

  /**
   * Update last event
   */
  async updateLastEvent(type: string, agent?: 'refiner' | 'builder' | 'verifier' | 'gatekeeper'): Promise<RunState> {
    const state = await this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.last_event = {
      type,
      agent,
      timestamp: new Date().toISOString(),
    };

    await this.saveState(state);
    return state;
  }

  /**
   * Add error to errors array
   */
  async addError(error: string): Promise<RunState> {
    const state = await this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.errors.push(error);
    await this.saveState(state);
    return state;
  }

  /**
   * Add error to errors array with Result pattern (safe version)
   */
  async addErrorSafe(errorMsg: string): AsyncResult<RunState, StateError> {
    const stateResult = await this.loadStateSafe();
    if (!stateResult.success) {
      return stateResult;
    }

    const state = stateResult.data;
    state.errors.push(errorMsg);

    const saveResult = await this.saveStateSafe(state);
    if (!saveResult.success) {
      return saveResult as Result<RunState, StateError>;
    }

    return ok(state);
  }

  /**
   * Set timeout_at for an agent
   */
  async setAgentTimeout(agent: 'refiner' | 'builder' | 'verifier' | 'gatekeeper', timeoutAt: string): Promise<RunState> {
    const state = await this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.agents[agent].timeout_at = timeoutAt;
    await this.saveState(state);
    return state;
  }

  /**
   * Update usage for a specific agent
   */
  async updateAgentUsage(agent: AgentName, usage: UsageInfo): Promise<RunState> {
    const state = await this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.agents[agent].usage = usage;

    // Recalculate total usage
    this.recalculateTotalUsage(state);

    await this.saveState(state);
    return state;
  }

  /**
   * Update total usage directly
   */
  async updateTotalUsage(usage: TotalUsage): Promise<RunState> {
    const state = await this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.usage = usage;
    await this.saveState(state);
    return state;
  }

  /**
   * Recalculate total usage from all agents
   */
  private recalculateTotalUsage(state: RunState): void {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreation = 0;
    let totalCacheRead = 0;
    let totalCost = 0;

    const agents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
    for (const agent of agents) {
      const agentUsage = state.agents[agent].usage;
      if (agentUsage) {
        totalInput += agentUsage.input_tokens;
        totalOutput += agentUsage.output_tokens;
        totalCacheCreation += agentUsage.cache_creation_tokens || 0;
        totalCacheRead += agentUsage.cache_read_tokens || 0;
        totalCost += agentUsage.cost_usd;
      }
    }

    state.usage = {
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      total_cache_creation_tokens: totalCacheCreation,
      total_cache_read_tokens: totalCacheRead,
      total_cost_usd: Math.round(totalCost * PRECISION.COST_MULTIPLIER) / PRECISION.COST_MULTIPLIER,
    };
  }

  /**
   * Get usage for a specific agent
   */
  async getAgentUsage(agent: AgentName): Promise<UsageInfo | undefined> {
    const state = await this.loadState();
    if (!state) {
      return undefined;
    }
    return state.agents[agent].usage ?? undefined;
  }

  /**
   * Get total usage
   */
  async getTotalUsage(): Promise<TotalUsage | undefined> {
    const state = await this.loadState();
    if (!state) {
      return undefined;
    }
    return state.usage;
  }

  /**
   * Update model selection in state
   */
  async updateModelSelection(modelSelection: import('../types/index.js').ModelSelectionResult): Promise<RunState> {
    const state = await this.loadState();
    if (!state) {
      throw new Error('No state found');
    }

    state.model_selection = modelSelection;
    await this.saveState(state);
    return state;
  }

  /**
   * Get model selection from state
   */
  async getModelSelection(): Promise<import('../types/index.js').ModelSelectionResult | undefined> {
    const state = await this.loadState();
    if (!state) {
      return undefined;
    }
    return state.model_selection;
  }

  /**
   * Invalidate cache (force next read from disk)
   */
  invalidateCache(): void {
    this.cachedState = null;
    this.lastReadTime = 0;
  }

  /**
   * Get cache TTL
   */
  getCacheTTL(): number {
    return this.cacheTTL;
  }

  /**
   * Set cache TTL
   */
  setCacheTTL(ttl: number): void {
    this.cacheTTL = ttl;
  }
}
