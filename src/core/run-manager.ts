import { access, mkdir, readdir, readFile, writeFile, rm, unlink, constants } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { RunState, CRP, VCR, RunListItem, MRPEvidence, VerifierResults, GatekeeperVerdict, ModelSelectionResult } from '../types/index.js';
import { StateManager } from './state-manager.js';
import {
  sanitizePath,
  isValidRunId,
  validateBriefing,
  isValidCrpId,
} from '../utils/sanitize.js';
import { LIMITS, DURATION_MULTIPLIERS } from '../config/constants.js';

export class RunManager {
  private projectRoot: string;
  private runsDir: string;

  constructor(projectRoot: string) {
    // Sanitize project root path
    this.projectRoot = sanitizePath(projectRoot);
    this.runsDir = join(this.projectRoot, '.dure', 'runs');
  }

  /**
   * Generate a new run ID
   */
  generateRunId(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    return `run-${timestamp}`;
  }

  /**
   * Create a new run directory structure
   */
  async createRun(runId: string, rawBriefing: string, maxIterations: number): Promise<string> {
    // Validate run ID format
    if (!isValidRunId(runId)) {
      throw new Error(`Invalid run ID format: ${runId}. Expected format: run-YYYYMMDDHHMMSS`);
    }

    // Validate briefing
    const briefingValidation = validateBriefing(rawBriefing);
    if (!briefingValidation.isValid) {
      throw new Error(briefingValidation.error);
    }

    // Validate maxIterations
    if (!Number.isInteger(maxIterations) || maxIterations < LIMITS.MIN_ITERATIONS || maxIterations > LIMITS.MAX_ITERATIONS) {
      throw new Error(`maxIterations must be an integer between ${LIMITS.MIN_ITERATIONS} and ${LIMITS.MAX_ITERATIONS}`);
    }

    const runDir = join(this.runsDir, runId);

    // Create directory structure
    const dirs = [
      runDir,
      join(runDir, 'briefing'),
      join(runDir, 'builder'),
      join(runDir, 'builder', 'output'),
      join(runDir, 'verifier'),
      join(runDir, 'verifier', 'tests'),
      join(runDir, 'gatekeeper'),
      join(runDir, 'crp'),
      join(runDir, 'vcr'),
      join(runDir, 'mrp'),
      join(runDir, 'mrp', 'code'),
      join(runDir, 'mrp', 'tests'),
      join(runDir, 'prompts'),
    ];

    for (const dir of dirs) {
      await mkdir(dir, { recursive: true });
    }

    // Write raw briefing
    await writeFile(join(runDir, 'briefing', 'raw.md'), rawBriefing, 'utf-8');

    // Initialize state
    const stateManager = new StateManager(runDir);
    await stateManager.createInitialState(runId, maxIterations);

    return runDir;
  }

  /**
   * Get run directory path
   */
  getRunDir(runId: string): string {
    // Validate run ID format to prevent path traversal
    if (!isValidRunId(runId)) {
      throw new Error(`Invalid run ID format: ${runId}`);
    }
    return join(this.runsDir, runId);
  }

  /**
   * Check if run exists (async)
   */
  async runExists(runId: string): Promise<boolean> {
    // Validate run ID format to prevent path traversal
    if (!isValidRunId(runId)) {
      return false;
    }
    try {
      await access(this.getRunDir(runId), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if run exists (sync, for backward compatibility)
   * @deprecated Use runExists() instead. Will be removed in v1.0
   */
  runExistsSync(runId: string): boolean {
    console.warn('[DEPRECATED] runExistsSync() is deprecated. Use runExists() instead. Will be removed in v1.0');
    // Validate run ID format to prevent path traversal
    if (!isValidRunId(runId)) {
      return false;
    }
    return existsSync(this.getRunDir(runId));
  }

  /**
   * List all runs
   */
  async listRuns(): Promise<RunListItem[]> {
    try {
      await access(this.runsDir, constants.F_OK);
    } catch {
      return [];
    }

    const runs: RunListItem[] = [];
    const entries = await readdir(this.runsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('run-')) {
        const runDir = join(this.runsDir, entry.name);
        const stateManager = new StateManager(runDir);
        const state = await stateManager.loadState();

        if (state) {
          runs.push({
            run_id: state.run_id,
            phase: state.phase,
            iteration: state.iteration,
            started_at: state.started_at,
            updated_at: state.updated_at,
          });
        }
      }
    }

    // Sort by started_at descending
    runs.sort((a, b) => b.started_at.localeCompare(a.started_at));
    return runs;
  }

  /**
   * Get the current (most recent) run
   */
  async getCurrentRun(): Promise<RunListItem | null> {
    const runs = await this.listRuns();
    return runs.length > 0 ? runs[0] : null;
  }

  /**
   * Get active run (not completed or failed)
   */
  async getActiveRun(): Promise<RunListItem | null> {
    const runs = await this.listRuns();
    return runs.find(r => r.phase !== 'completed' && r.phase !== 'failed') || null;
  }

  /**
   * Read raw briefing
   */
  async readRawBriefing(runId: string): Promise<string | null> {
    try {
      const filePath = join(this.getRunDir(runId), 'briefing', 'raw.md');
      return await readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Read refined briefing
   */
  async readRefinedBriefing(runId: string): Promise<string | null> {
    try {
      const filePath = join(this.getRunDir(runId), 'briefing', 'refined.md');
      return await readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * List CRPs for a run
   */
  async listCRPs(runId: string): Promise<CRP[]> {
    const crpDir = join(this.getRunDir(runId), 'crp');

    try {
      await access(crpDir, constants.F_OK);
    } catch {
      return [];
    }

    const files = (await readdir(crpDir)).filter(f => f.endsWith('.json'));
    const crps: CRP[] = [];

    for (const file of files) {
      try {
        const content = await readFile(join(crpDir, file), 'utf-8');
        crps.push(JSON.parse(content));
      } catch {
        // Skip invalid files
      }
    }

    return crps.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Find the file path for a CRP by its crp_id
   * Returns the file path if found, null otherwise
   */
  private async findCRPFilePath(runId: string, crpId: string): Promise<string | null> {
    const crpDir = join(this.getRunDir(runId), 'crp');

    // First try direct file lookup (for files named exactly as crpId.json)
    const directPath = join(crpDir, `${crpId}.json`);
    try {
      await access(directPath, constants.F_OK);
      return directPath;
    } catch {
      // Continue to search other files
    }

    // Search through all CRP files to find matching crp_id
    try {
      const files = (await readdir(crpDir)).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const filePath = join(crpDir, file);
        try {
          const content = await readFile(filePath, 'utf-8');
          const crp = JSON.parse(content) as CRP;
          if (crp.crp_id === crpId) {
            return filePath;
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // CRP directory might not exist
    }

    return null;
  }

  /**
   * Get a specific CRP by its crp_id
   * CRP files may be named with timestamps (crp-{timestamp}.json) or by ID (crp-001.json)
   * This function searches all CRP files to find the one with matching crp_id
   */
  async getCRP(runId: string, crpId: string): Promise<CRP | null> {
    // Validate CRP ID format
    if (!isValidCrpId(crpId)) {
      return null;
    }

    try {
      const filePath = await this.findCRPFilePath(runId, crpId);
      if (!filePath) return null;

      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * List VCRs for a run
   */
  async listVCRs(runId: string): Promise<VCR[]> {
    const vcrDir = join(this.getRunDir(runId), 'vcr');

    try {
      await access(vcrDir, constants.F_OK);
    } catch {
      return [];
    }

    const files = (await readdir(vcrDir)).filter(f => f.endsWith('.json'));
    const vcrs: VCR[] = [];

    for (const file of files) {
      try {
        const content = await readFile(join(vcrDir, file), 'utf-8');
        vcrs.push(JSON.parse(content));
      } catch {
        // Skip invalid files
      }
    }

    return vcrs.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Save a VCR (human response to CRP)
   */
  async saveVCR(runId: string, vcr: VCR): Promise<void> {
    const vcrDir = join(this.getRunDir(runId), 'vcr');
    await mkdir(vcrDir, { recursive: true });

    const filePath = join(vcrDir, `${vcr.vcr_id}.json`);
    await writeFile(filePath, JSON.stringify(vcr, null, 2), 'utf-8');

    // Update CRP status to resolved
    const crpPath = await this.findCRPFilePath(runId, vcr.crp_id);
    if (!crpPath) return;

    try {
      const crpContent = await readFile(crpPath, 'utf-8');
      const crp = JSON.parse(crpContent) as CRP;
      crp.status = 'resolved';
      await writeFile(crpPath, JSON.stringify(crp, null, 2), 'utf-8');
    } catch {
      // CRP file read/write failed, ignore
    }
  }

  /**
   * Read verifier results
   */
  async readVerifierResults(runId: string): Promise<VerifierResults | null> {
    try {
      const filePath = join(this.getRunDir(runId), 'verifier', 'results.json');
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Read gatekeeper verdict
   */
  async readGatekeeperVerdict(runId: string): Promise<GatekeeperVerdict | null> {
    try {
      const filePath = join(this.getRunDir(runId), 'gatekeeper', 'verdict.json');
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Read MRP evidence
   */
  async readMRPEvidence(runId: string): Promise<MRPEvidence | null> {
    const mrpDir = join(this.getRunDir(runId), 'mrp');

    // Try evidence.json first (standard location)
    try {
      const content = await readFile(join(mrpDir, 'evidence.json'), 'utf-8');
      return JSON.parse(content);
    } catch {
      // Fallback to mrp.json for backward compatibility
      try {
        const content = await readFile(join(mrpDir, 'mrp.json'), 'utf-8');
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
  }

  /**
   * Read MRP summary
   */
  async readMRPSummary(runId: string): Promise<string | null> {
    try {
      const filePath = join(this.getRunDir(runId), 'mrp', 'summary.md');
      return await readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Check if done.flag exists for an agent (async)
   */
  async hasAgentCompleted(runId: string, agent: 'builder' | 'verifier'): Promise<boolean> {
    const flagPath = join(this.getRunDir(runId), agent, 'done.flag');
    try {
      await access(flagPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if done.flag exists for an agent (sync, for backward compatibility)
   * @deprecated Use hasAgentCompleted() instead. Will be removed in v1.0
   */
  hasAgentCompletedSync(runId: string, agent: 'builder' | 'verifier'): boolean {
    console.warn('[DEPRECATED] hasAgentCompletedSync() is deprecated. Use hasAgentCompleted() instead. Will be removed in v1.0');
    const flagPath = join(this.getRunDir(runId), agent, 'done.flag');
    return existsSync(flagPath);
  }

  /**
   * Get runs directory
   */
  getRunsDir(): string {
    return this.runsDir;
  }

  /**
   * Initialize runs directory
   */
  async initialize(): Promise<void> {
    await mkdir(this.runsDir, { recursive: true });
  }

  /**
   * Delete a run by its ID
   * @returns true if deletion was successful, false if run not found
   */
  async deleteRun(runId: string): Promise<boolean> {
    // Validate run ID format
    if (!isValidRunId(runId)) {
      throw new Error(`Invalid run ID format: ${runId}`);
    }

    const runDir = this.getRunDir(runId);

    try {
      await access(runDir, constants.F_OK);
    } catch {
      return false;
    }

    // Check if run is currently active
    const stateManager = new StateManager(runDir);
    const state = await stateManager.loadState();
    if (state && state.phase !== 'completed' && state.phase !== 'failed') {
      throw new Error(`Cannot delete active run ${runId}. Stop the run first.`);
    }

    await rm(runDir, { recursive: true, force: true });
    return true;
  }

  /**
   * Delete multiple runs older than specified duration
   * @param olderThanMs - Duration in milliseconds
   * @returns Object with deleted run IDs and count
   */
  async cleanRuns(olderThanMs: number): Promise<{ deleted: string[]; count: number }> {
    const runs = await this.listRuns();
    const cutoffTime = Date.now() - olderThanMs;
    const deleted: string[] = [];

    for (const run of runs) {
      const runStartTime = new Date(run.started_at).getTime();

      // Only delete completed or failed runs that are older than the cutoff
      if (runStartTime < cutoffTime && (run.phase === 'completed' || run.phase === 'failed')) {
        try {
          if (await this.deleteRun(run.run_id)) {
            deleted.push(run.run_id);
          }
        } catch {
          // Skip runs that can't be deleted
        }
      }
    }

    return { deleted, count: deleted.length };
  }

  /**
   * Reset verifier directory for retry (MINOR_FAIL scenario)
   * Removes flag files and output files so verifier can run fresh
   */
  async resetVerifierForRetry(runId: string): Promise<void> {
    const runDir = this.getRunDir(runId);
    const verifierDir = join(runDir, 'verifier');

    // Files to remove for a clean retry
    const filesToRemove = [
      'done.flag',
      'tests-ready.flag',
      'test-config.json',
      'test-output.json',
      'results.json',
      'error.flag',
    ];

    for (const file of filesToRemove) {
      const filePath = join(verifierDir, file);
      try {
        await unlink(filePath);
      } catch {
        // File doesn't exist, ignore
      }
    }
  }

  /**
   * Delete error.flag for a specific agent
   */
  async deleteAgentErrorFlag(runId: string, agent: string): Promise<void> {
    const runDir = this.getRunDir(runId);
    const errorFlagPath = join(runDir, agent, 'error.flag');
    try {
      await unlink(errorFlagPath);
    } catch {
      // File doesn't exist, ignore
    }
  }

  /**
   * Reset agent directory for rerun
   * Removes error.flag and done.flag so agent can run fresh
   */
  async resetAgentForRerun(runId: string, agent: string): Promise<void> {
    const runDir = this.getRunDir(runId);
    const agentDir = join(runDir, agent);

    // Files to remove for a clean rerun
    const filesToRemove = ['error.flag', 'done.flag'];

    for (const file of filesToRemove) {
      const filePath = join(agentDir, file);
      try {
        await unlink(filePath);
      } catch {
        // File doesn't exist, ignore
      }
    }
  }

  /**
   * Parse duration string to milliseconds
   * Supports: 1d, 7d, 30d, 1h, 24h, etc.
   */
  static parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([dhms])$/);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}. Use formats like 7d, 24h, 30m, 60s`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2] as keyof typeof DURATION_MULTIPLIERS;

    return value * DURATION_MULTIPLIERS[unit];
  }

  /**
   * Save model selection result for a run
   */
  async saveModelSelection(runId: string, result: ModelSelectionResult): Promise<void> {
    const filePath = join(this.getRunDir(runId), 'model-selection.json');
    await writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
  }

  /**
   * Read model selection result for a run
   */
  async readModelSelection(runId: string): Promise<ModelSelectionResult | null> {
    try {
      const filePath = join(this.getRunDir(runId), 'model-selection.json');
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
