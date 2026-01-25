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

export class FileWatcher extends EventEmitter {
  private runDir: string;
  private watcher: FSWatcher | null = null;
  private isWatching = false;

  constructor(runDir: string) {
    super();
    this.runDir = runDir;
  }

  /**
   * Start watching the run directory
   */
  start(): void {
    if (this.isWatching) return;

    this.watcher = watch(this.runDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 3,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

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
        this.emit('event', { type: 'builder_done' } as WatchEvent);
      } else if (parentDir === 'verifier') {
        this.emit('event', { type: 'verifier_done' } as WatchEvent);
      }
    }

    // Check for error.flag files
    if (filename === 'error.flag') {
      this.handleErrorFlagCreated(filePath, parentDir);
    }

    // Check for refined.md (Refiner completion)
    if (filename === 'refined.md' && parentDir === 'briefing') {
      this.emit('event', { type: 'refiner_done' } as WatchEvent);
    }

    // Check for verdict.json (Gatekeeper completion)
    if (filename === 'verdict.json' && parentDir === 'gatekeeper') {
      this.handleVerdictCreated(filePath);
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
    // Currently we mainly care about new files
    // But we could watch for state.json changes here if needed
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
