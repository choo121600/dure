import { watch, FSWatcher } from 'chokidar';
import { existsSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { EventEmitter } from 'events';
import type { CRP, GatekeeperVerdict } from '../types/index.js';

export interface ErrorFlag {
  agent: string;
  error_type: 'crash' | 'timeout' | 'validation' | 'permission' | 'resource';
  message: string;
  stack?: string;
  timestamp: string;
  recoverable: boolean;
}

export type WatchEvent =
  | { type: 'refiner_done' }
  | { type: 'builder_done' }
  | { type: 'verifier_done' }
  | { type: 'gatekeeper_done'; verdict: GatekeeperVerdict }
  | { type: 'crp_created'; crp: CRP }
  | { type: 'vcr_created'; vcrId: string; crpId: string }
  | { type: 'mrp_created' }
  | { type: 'error_flag'; errorFlag: ErrorFlag; agent: string }
  | { type: 'error'; error: string };

export interface FileWatcherOptions {
  /** Use polling for more reliable file detection (slower but more compatible) */
  usePolling?: boolean;
  /** Polling interval in ms when usePolling is true */
  pollingInterval?: number;
  /** Debounce time in ms */
  debounceMs?: number;
  /** Stability threshold in ms for awaitWriteFinish. Set to 0 to disable. */
  stabilityThreshold?: number;
}

export class FileWatcher extends EventEmitter {
  private runDir: string;
  private watcher: FSWatcher | null = null;
  private isWatching = false;
  // Track recently emitted events to prevent duplicates
  private recentEvents: Map<string, number> = new Map();
  private readonly DEBOUNCE_MS: number;
  private readonly options: FileWatcherOptions;

  constructor(runDir: string, options: FileWatcherOptions = {}) {
    super();
    this.runDir = runDir;
    this.options = {
      usePolling: false,
      pollingInterval: 100,
      debounceMs: 2000,
      stabilityThreshold: 500,
      ...options,
    };
    this.DEBOUNCE_MS = this.options.debounceMs!;
  }

  /**
   * Check if an event was recently emitted (within debounce window)
   * Returns true if event should be skipped (duplicate)
   */
  private isDuplicateEvent(eventKey: string): boolean {
    const now = Date.now();
    const lastEmitted = this.recentEvents.get(eventKey);

    if (lastEmitted && (now - lastEmitted) < this.DEBOUNCE_MS) {
      return true;
    }

    this.recentEvents.set(eventKey, now);

    // Clean up old entries periodically
    if (this.recentEvents.size > 100) {
      for (const [key, time] of this.recentEvents.entries()) {
        if (now - time > this.DEBOUNCE_MS * 2) {
          this.recentEvents.delete(key);
        }
      }
    }

    return false;
  }

  /**
   * Start watching the run directory
   */
  start(): void {
    if (this.isWatching) return;

    const watchOptions: Parameters<typeof watch>[1] = {
      persistent: true,
      ignoreInitial: true,
      depth: 3,
      usePolling: this.options.usePolling,
      interval: this.options.pollingInterval,
    };

    // Only enable awaitWriteFinish if stabilityThreshold > 0
    if (this.options.stabilityThreshold && this.options.stabilityThreshold > 0) {
      watchOptions.awaitWriteFinish = {
        stabilityThreshold: this.options.stabilityThreshold,
        pollInterval: this.options.pollingInterval,
      };
    }

    this.watcher = watch(this.runDir, watchOptions);

    this.watcher.on('add', (filePath) => this.handleFileAdd(filePath));
    this.watcher.on('change', (filePath) => this.handleFileChange(filePath));
    this.watcher.on('error', (error) => {
      this.emit('event', { type: 'error', error: error.message } as WatchEvent);
    });

    this.isWatching = true;
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
    }
  }

  /**
   * Handle new file creation
   */
  private handleFileAdd(filePath: string): void {
    const filename = basename(filePath);
    const parentDir = basename(dirname(filePath));

    // Check for done.flag files
    if (filename === 'done.flag') {
      if (parentDir === 'builder') {
        if (!this.isDuplicateEvent('builder_done')) {
          this.emit('event', { type: 'builder_done' } as WatchEvent);
        }
      } else if (parentDir === 'verifier') {
        if (!this.isDuplicateEvent('verifier_done')) {
          this.emit('event', { type: 'verifier_done' } as WatchEvent);
        }
      }
    }

    // Check for error.flag files
    if (filename === 'error.flag') {
      this.handleErrorFlagCreated(filePath, parentDir);
    }

    // Check for refined.md (Refiner completion)
    if (filename === 'refined.md' && parentDir === 'briefing') {
      if (!this.isDuplicateEvent('refiner_done')) {
        this.emit('event', { type: 'refiner_done' } as WatchEvent);
      }
    }

    // Check for verdict.json (Gatekeeper completion)
    if (filename === 'verdict.json' && parentDir === 'gatekeeper') {
      if (!this.isDuplicateEvent('gatekeeper_done')) {
        this.handleVerdictCreated(filePath);
      }
    }

    // Check for CRP creation
    if (filename.endsWith('.json') && parentDir === 'crp') {
      this.handleCRPCreated(filePath);
    }

    // Check for VCR creation
    if (filename.endsWith('.json') && parentDir === 'vcr') {
      this.handleVCRCreated(filePath);
    }

    // Check for MRP creation (summary.md indicates MRP is ready)
    if (filename === 'summary.md' && parentDir === 'mrp') {
      this.emit('event', { type: 'mrp_created' } as WatchEvent);
    }
  }

  /**
   * Handle file changes
   */
  private handleFileChange(filePath: string): void {
    const filename = basename(filePath);
    const parentDir = basename(dirname(filePath));

    // Check for refined.md changes (Refiner completion after VCR)
    // This handles the case where refined.md already exists and is updated
    if (filename === 'refined.md' && parentDir === 'briefing') {
      if (!this.isDuplicateEvent('refiner_done')) {
        this.emit('event', { type: 'refiner_done' } as WatchEvent);
      }
    }

    // Check for verdict.json changes
    if (filename === 'verdict.json' && parentDir === 'gatekeeper') {
      if (!this.isDuplicateEvent('gatekeeper_done')) {
        this.handleVerdictCreated(filePath);
      }
    }
  }

  /**
   * Handle CRP file creation
   */
  private handleCRPCreated(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const crp = JSON.parse(content) as CRP;
      this.emit('event', { type: 'crp_created', crp } as WatchEvent);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to parse CRP file:', errMsg);
      this.emit('event', { type: 'error', error: `Failed to parse CRP file: ${errMsg}` } as WatchEvent);
    }
  }

  /**
   * Handle VCR file creation
   */
  private handleVCRCreated(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const vcr = JSON.parse(content);
      this.emit('event', {
        type: 'vcr_created',
        vcrId: vcr.vcr_id,
        crpId: vcr.crp_id,
      } as WatchEvent);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to parse VCR file:', errMsg);
      this.emit('event', { type: 'error', error: `Failed to parse VCR file: ${errMsg}` } as WatchEvent);
    }
  }

  /**
   * Handle verdict.json creation
   */
  private handleVerdictCreated(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const verdict = JSON.parse(content) as GatekeeperVerdict;
      this.emit('event', { type: 'gatekeeper_done', verdict } as WatchEvent);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to parse verdict file:', errMsg);
      this.emit('event', { type: 'error', error: `Failed to parse verdict file: ${errMsg}` } as WatchEvent);
    }
  }

  /**
   * Handle error.flag file creation
   */
  private handleErrorFlagCreated(filePath: string, agent: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const errorFlag = JSON.parse(content) as ErrorFlag;
      this.emit('event', { type: 'error_flag', errorFlag, agent } as WatchEvent);
    } catch (error) {
      // If error.flag is not valid JSON, create a basic error flag
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      const basicErrorFlag: ErrorFlag = {
        agent,
        error_type: 'crash',
        message: `Error flag created but could not be parsed: ${errMsg}`,
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
      this.emit('event', { type: 'error_flag', errorFlag: basicErrorFlag, agent } as WatchEvent);
    }
  }

  /**
   * Check if specific file exists
   */
  checkFileExists(relativePath: string): boolean {
    return existsSync(join(this.runDir, relativePath));
  }

  /**
   * Wait for a specific file to appear
   */
  waitForFile(relativePath: string, timeoutMs: number = 300000): Promise<void> {
    return new Promise((resolve, reject) => {
      const filePath = join(this.runDir, relativePath);

      // Check if already exists
      if (existsSync(filePath)) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for ${relativePath}`));
      }, timeoutMs);

      const checkWatcher = watch(dirname(filePath), {
        persistent: true,
        depth: 0,
      });

      const cleanup = () => {
        clearTimeout(timeout);
        checkWatcher.close();
      };

      checkWatcher.on('add', (addedPath) => {
        if (addedPath === filePath || basename(addedPath) === basename(filePath)) {
          cleanup();
          resolve();
        }
      });
    });
  }

  /**
   * Get run directory
   */
  getRunDir(): string {
    return this.runDir;
  }
}
