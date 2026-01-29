import { watch, FSWatcher } from 'chokidar';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { EventEmitter } from 'events';
import type { CRP, GatekeeperVerdict, TestConfig, TestOutput, ClaudeCodeOutput, AgentName, UsageInfo } from '../types/index.js';

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
  | { type: 'tests_ready'; config: TestConfig }
  | { type: 'test_execution_done'; result: TestOutput }
  | { type: 'gatekeeper_done'; verdict: GatekeeperVerdict }
  | { type: 'crp_created'; crp: CRP }
  | { type: 'vcr_created'; vcrId: string; crpId: string }
  | { type: 'mrp_created' }
  | { type: 'error_flag'; errorFlag: ErrorFlag; agent: string }
  | { type: 'error'; error: string }
  | { type: 'agent_output'; agent: AgentName; output: ClaudeCodeOutput; usage: UsageInfo };

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

    // Check for tests-ready.flag (Verifier Phase 1 completion)
    if (filename === 'tests-ready.flag' && parentDir === 'verifier') {
      if (!this.isDuplicateEvent('tests_ready')) {
        this.handleTestsReadyCreated(filePath);
      }
    }

    // Check for test-output.json (External test execution completion)
    if (filename === 'test-output.json' && parentDir === 'verifier') {
      if (!this.isDuplicateEvent('test_execution_done')) {
        this.handleTestOutputCreated(filePath);
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

    // Check for agent output.json (headless mode completion)
    if (filename === 'output.json') {
      const agentDirs: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
      if (agentDirs.includes(parentDir as AgentName)) {
        this.handleAgentOutputCreated(filePath, parentDir as AgentName);
      }
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
   * Handle tests-ready.flag file creation (Verifier Phase 1 completion)
   */
  private handleTestsReadyCreated(filePath: string): void {
    try {
      // Read test-config.json from the same directory
      const configPath = join(dirname(filePath), 'test-config.json');
      if (!existsSync(configPath)) {
        this.emit('event', {
          type: 'error',
          error: 'tests-ready.flag created but test-config.json not found',
        } as WatchEvent);
        return;
      }

      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as TestConfig;
      this.emit('event', { type: 'tests_ready', config } as WatchEvent);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to parse test-config.json:', errMsg);
      this.emit('event', {
        type: 'error',
        error: `Failed to parse test-config.json: ${errMsg}`,
      } as WatchEvent);
    }
  }

  /**
   * Handle test-output.json file creation (External test execution completion)
   */
  private handleTestOutputCreated(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const result = JSON.parse(content) as TestOutput;
      this.emit('event', { type: 'test_execution_done', result } as WatchEvent);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to parse test-output.json:', errMsg);
      this.emit('event', {
        type: 'error',
        error: `Failed to parse test-output.json: ${errMsg}`,
      } as WatchEvent);
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
   * Handle agent output.json file creation (headless mode)
   * Waits for file size to stabilize before parsing
   */
  private handleAgentOutputCreated(filePath: string, agent: AgentName): void {
    const eventKey = `agent_output_${agent}`;
    if (this.isDuplicateEvent(eventKey)) {
      return;
    }

    // Wait for file to be fully written by checking size stability
    this.waitForFileStable(filePath, agent, 0, 0);
  }

  /**
   * Wait for file size to stabilize before parsing
   * Checks every 1 second, requires 2 consecutive same-size readings
   */
  private waitForFileStable(
    filePath: string,
    agent: AgentName,
    lastSize: number,
    stableCount: number,
    maxWaitSeconds: number = 300 // 5 minutes max wait
  ): void {
    if (!existsSync(filePath)) {
      // File doesn't exist yet, retry
      if (maxWaitSeconds > 0) {
        setTimeout(() => {
          this.waitForFileStable(filePath, agent, 0, 0, maxWaitSeconds - 1);
        }, 1000);
      }
      return;
    }

    try {
      const currentSize = statSync(filePath).size;

      // File is empty, keep waiting
      if (currentSize === 0) {
        if (maxWaitSeconds > 0) {
          setTimeout(() => {
            this.waitForFileStable(filePath, agent, 0, 0, maxWaitSeconds - 1);
          }, 1000);
        }
        return;
      }

      // Check if size is stable (same as last check)
      if (currentSize === lastSize) {
        stableCount++;
        // Require 2 consecutive stable readings
        if (stableCount >= 2) {
          this.parseAgentOutput(filePath, agent);
          return;
        }
      } else {
        stableCount = 0;
      }

      // Continue waiting
      if (maxWaitSeconds > 0) {
        setTimeout(() => {
          this.waitForFileStable(filePath, agent, currentSize, stableCount, maxWaitSeconds - 1);
        }, 1000);
      } else {
        // Timeout - try to parse anyway
        this.parseAgentOutput(filePath, agent);
      }
    } catch (error) {
      // Error checking file, retry
      if (maxWaitSeconds > 0) {
        setTimeout(() => {
          this.waitForFileStable(filePath, agent, lastSize, stableCount, maxWaitSeconds - 1);
        }, 1000);
      }
    }
  }

  /**
   * Parse agent output JSON file
   */
  private parseAgentOutput(filePath: string, agent: AgentName): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const output = JSON.parse(content) as ClaudeCodeOutput;

      // Extract usage info from Claude Code output
      const usage: UsageInfo = {
        input_tokens: output.usage.input_tokens,
        output_tokens: output.usage.output_tokens,
        cache_creation_tokens: output.usage.cache_creation_input_tokens,
        cache_read_tokens: output.usage.cache_read_input_tokens,
        cost_usd: output.total_cost_usd,
      };

      this.emit('event', {
        type: 'agent_output',
        agent,
        output,
        usage,
      } as WatchEvent);

      // Also emit the legacy done events for backward compatibility
      // Use isDuplicateEvent to prevent double-emit when done.flag also exists
      if (agent === 'builder') {
        if (!this.isDuplicateEvent('builder_done')) {
          this.emit('event', { type: 'builder_done' } as WatchEvent);
        }
      } else if (agent === 'verifier') {
        // Note: verifier_done is still triggered by done.flag or tests-ready.flag
        // This is handled separately in the verifier workflow
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to parse agent output for ${agent}:`, errMsg);
      this.emit('event', {
        type: 'error',
        error: `Failed to parse agent output for ${agent}: ${errMsg}`,
      } as WatchEvent);
    }
  }

  /**
   * Get run directory
   */
  getRunDir(): string {
    return this.runDir;
  }
}
