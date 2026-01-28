import { EventEmitter } from 'events';
import { watch, type FSWatcher } from 'chokidar';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import type { RunState, CRP, MRPEvidence } from '../../types/index.js';

export interface TuiStateEvents {
  stateChanged: (state: RunState | null) => void;
  crpPending: (crp: CRP | null) => void;
  runListChanged: (runs: RunInfo[]) => void;
  error: (error: Error) => void;
}

export interface RunInfo {
  runId: string;
  phase: string;
  iteration: number;
  startedAt: string;
  updatedAt: string;
  hasCrp: boolean;
}

export interface TuiStateManagerOptions {
  projectRoot: string;
  watchInterval?: number;
}

export class TuiStateManager extends EventEmitter {
  private projectRoot: string;
  private dureDir: string;
  private runsDir: string;
  private watcher: FSWatcher | null = null;
  private currentRunId: string | null = null;
  private currentState: RunState | null = null;
  private watchInterval: number;

  constructor(options: TuiStateManagerOptions) {
    super();
    this.projectRoot = options.projectRoot;
    this.dureDir = join(this.projectRoot, '.dure');
    this.runsDir = join(this.dureDir, 'runs');
    this.watchInterval = options.watchInterval ?? 1000;
  }

  /**
   * Start watching for state changes
   */
  async start(): Promise<void> {
    // Find the most recent run
    await this.findLatestRun();

    // Start file watcher
    this.watcher = watch(join(this.runsDir, '*/state.json'), {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('change', async (path) => {
      await this.handleStateChange(path);
    });

    this.watcher.on('add', async (path) => {
      await this.handleStateChange(path);
    });

    this.watcher.on('error', (error) => {
      this.emit('error', error);
    });

    // Also watch for CRP files
    const crpWatcher = watch(join(this.runsDir, '*/crp/*.json'), {
      persistent: true,
      ignoreInitial: false,
    });

    crpWatcher.on('add', async () => {
      await this.checkForPendingCrp();
    });

    crpWatcher.on('change', async () => {
      await this.checkForPendingCrp();
    });
  }

  /**
   * Stop watching for state changes
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Get the current state
   */
  getState(): RunState | null {
    return this.currentState;
  }

  /**
   * Get the current run ID
   */
  getCurrentRunId(): string | null {
    return this.currentRunId;
  }

  /**
   * Set the current run ID to watch
   */
  async setCurrentRun(runId: string): Promise<void> {
    this.currentRunId = runId;
    await this.loadState();
  }

  /**
   * List all available runs
   */
  async listRuns(): Promise<RunInfo[]> {
    const runs: RunInfo[] = [];

    try {
      const entries = await readdir(this.runsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('run-')) {
          const runDir = join(this.runsDir, entry.name);
          const statePath = join(runDir, 'state.json');

          try {
            const content = await readFile(statePath, 'utf-8');
            const state = JSON.parse(content) as RunState;

            runs.push({
              runId: state.run_id,
              phase: state.phase,
              iteration: state.iteration,
              startedAt: state.started_at,
              updatedAt: state.updated_at,
              hasCrp: !!state.pending_crp,
            });
          } catch {
            // Skip if state.json doesn't exist or is invalid
          }
        }
      }

      // Sort by updated_at descending
      runs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch {
      // Runs directory might not exist yet
    }

    return runs;
  }

  /**
   * Find and set the most recent run
   */
  private async findLatestRun(): Promise<void> {
    const runs = await this.listRuns();

    if (runs.length > 0) {
      this.currentRunId = runs[0].runId;
      await this.loadState();
    } else {
      this.currentRunId = null;
      this.currentState = null;
      this.emit('stateChanged', null);
    }
  }

  /**
   * Handle state.json change event
   */
  private async handleStateChange(path: string): Promise<void> {
    // Extract run ID from path
    const match = path.match(/run-[^/\\]+/);
    if (!match) return;

    const runId = match[0];

    // If this is the current run or we don't have a current run, update
    if (!this.currentRunId || runId === this.currentRunId) {
      this.currentRunId = runId;
      await this.loadState();
    }

    // Always emit runListChanged for UI updates
    const runs = await this.listRuns();
    this.emit('runListChanged', runs);
  }

  /**
   * Load state for the current run
   */
  private async loadState(): Promise<void> {
    if (!this.currentRunId) {
      this.currentState = null;
      this.emit('stateChanged', null);
      return;
    }

    const statePath = join(this.runsDir, this.currentRunId, 'state.json');

    try {
      const content = await readFile(statePath, 'utf-8');
      this.currentState = JSON.parse(content) as RunState;
      this.emit('stateChanged', this.currentState);

      // Check for pending CRP
      await this.checkForPendingCrp();
    } catch (error) {
      this.currentState = null;
      this.emit('stateChanged', null);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Check for pending CRP and emit event
   */
  private async checkForPendingCrp(): Promise<void> {
    if (!this.currentRunId || !this.currentState?.pending_crp) {
      this.emit('crpPending', null);
      return;
    }

    const crpPath = join(
      this.runsDir,
      this.currentRunId,
      'crp',
      `${this.currentState.pending_crp}.json`
    );

    try {
      const content = await readFile(crpPath, 'utf-8');
      const crp = JSON.parse(content) as CRP;
      this.emit('crpPending', crp);
    } catch {
      this.emit('crpPending', null);
    }
  }

  /**
   * Get CRP by ID for the current run
   */
  async getCrp(crpId: string): Promise<CRP | null> {
    if (!this.currentRunId) return null;

    const crpPath = join(this.runsDir, this.currentRunId, 'crp', `${crpId}.json`);

    try {
      const content = await readFile(crpPath, 'utf-8');
      return JSON.parse(content) as CRP;
    } catch {
      return null;
    }
  }

  /**
   * Get MRP evidence for the current run
   */
  async getMrp(): Promise<MRPEvidence | null> {
    if (!this.currentRunId) return null;

    // Try evidence.json first (standard location)
    const evidencePath = join(this.runsDir, this.currentRunId, 'mrp', 'evidence.json');

    try {
      const content = await readFile(evidencePath, 'utf-8');
      return JSON.parse(content) as MRPEvidence;
    } catch {
      // Fallback to mrp.json for backward compatibility
      const mrpPath = join(this.runsDir, this.currentRunId, 'mrp', 'mrp.json');
      try {
        const content = await readFile(mrpPath, 'utf-8');
        return JSON.parse(content) as MRPEvidence;
      } catch {
        return null;
      }
    }
  }

  /**
   * Force refresh state
   */
  async refresh(): Promise<void> {
    await this.loadState();
  }
}

// Type-safe event emitter
export interface TuiStateManager {
  on<E extends keyof TuiStateEvents>(event: E, listener: TuiStateEvents[E]): this;
  off<E extends keyof TuiStateEvents>(event: E, listener: TuiStateEvents[E]): this;
  emit<E extends keyof TuiStateEvents>(event: E, ...args: Parameters<TuiStateEvents[E]>): boolean;
}
