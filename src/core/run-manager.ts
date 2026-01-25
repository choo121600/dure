import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { RunState, CRP, VCR, RunListItem, MRPEvidence, VerifierResults, GatekeeperVerdict } from '../types/index.js';
import { StateManager } from './state-manager.js';

export class RunManager {
  private projectRoot: string;
  private runsDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.runsDir = join(projectRoot, '.orchestral', 'runs');
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
  createRun(runId: string, rawBriefing: string, maxIterations: number): string {
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
      mkdirSync(dir, { recursive: true });
    }

    // Write raw briefing
    writeFileSync(join(runDir, 'briefing', 'raw.md'), rawBriefing, 'utf-8');

    // Initialize state
    const stateManager = new StateManager(runDir);
    stateManager.createInitialState(runId, maxIterations);

    return runDir;
  }

  /**
   * Get run directory path
   */
  getRunDir(runId: string): string {
    return join(this.runsDir, runId);
  }

  /**
   * Check if run exists
   */
  runExists(runId: string): boolean {
    return existsSync(this.getRunDir(runId));
  }

  /**
   * List all runs
   */
  listRuns(): RunListItem[] {
    if (!existsSync(this.runsDir)) {
      return [];
    }

    const runs: RunListItem[] = [];
    const dirs = readdirSync(this.runsDir, { withFileTypes: true });

    for (const dir of dirs) {
      if (dir.isDirectory() && dir.name.startsWith('run-')) {
        const runDir = join(this.runsDir, dir.name);
        const stateManager = new StateManager(runDir);
        const state = stateManager.loadState();

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
  getCurrentRun(): RunListItem | null {
    const runs = this.listRuns();
    return runs.length > 0 ? runs[0] : null;
  }

  /**
   * Get active run (not completed or failed)
   */
  getActiveRun(): RunListItem | null {
    const runs = this.listRuns();
    return runs.find(r => r.phase !== 'completed' && r.phase !== 'failed') || null;
  }

  /**
   * Read raw briefing
   */
  readRawBriefing(runId: string): string | null {
    const filePath = join(this.getRunDir(runId), 'briefing', 'raw.md');
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8');
  }

  /**
   * Read refined briefing
   */
  readRefinedBriefing(runId: string): string | null {
    const filePath = join(this.getRunDir(runId), 'briefing', 'refined.md');
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8');
  }

  /**
   * List CRPs for a run
   */
  listCRPs(runId: string): CRP[] {
    const crpDir = join(this.getRunDir(runId), 'crp');
    if (!existsSync(crpDir)) return [];

    const files = readdirSync(crpDir).filter(f => f.endsWith('.json'));
    const crps: CRP[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(join(crpDir, file), 'utf-8');
        crps.push(JSON.parse(content));
      } catch {
        // Skip invalid files
      }
    }

    return crps.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Get a specific CRP by its crp_id
   * CRP files may be named with timestamps (crp-{timestamp}.json) or by ID (crp-001.json)
   * This function searches all CRP files to find the one with matching crp_id
   */
  getCRP(runId: string, crpId: string): CRP | null {
    // First try direct file lookup (for files named exactly as crpId.json)
    const directPath = join(this.getRunDir(runId), 'crp', `${crpId}.json`);
    if (existsSync(directPath)) {
      try {
        const content = readFileSync(directPath, 'utf-8');
        return JSON.parse(content);
      } catch {
        // Continue to search other files
      }
    }

    // Search through all CRP files to find matching crp_id
    const crps = this.listCRPs(runId);
    const found = crps.find(crp => crp.crp_id === crpId);
    return found || null;
  }

  /**
   * List VCRs for a run
   */
  listVCRs(runId: string): VCR[] {
    const vcrDir = join(this.getRunDir(runId), 'vcr');
    if (!existsSync(vcrDir)) return [];

    const files = readdirSync(vcrDir).filter(f => f.endsWith('.json'));
    const vcrs: VCR[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(join(vcrDir, file), 'utf-8');
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
  saveVCR(runId: string, vcr: VCR): void {
    const vcrDir = join(this.getRunDir(runId), 'vcr');
    mkdirSync(vcrDir, { recursive: true });

    const filePath = join(vcrDir, `${vcr.vcr_id}.json`);
    writeFileSync(filePath, JSON.stringify(vcr, null, 2), 'utf-8');

    // Update CRP status to resolved
    const crpPath = join(this.getRunDir(runId), 'crp', `${vcr.crp_id}.json`);
    if (existsSync(crpPath)) {
      const crp = JSON.parse(readFileSync(crpPath, 'utf-8')) as CRP;
      crp.status = 'resolved';
      writeFileSync(crpPath, JSON.stringify(crp, null, 2), 'utf-8');
    }
  }

  /**
   * Read verifier results
   */
  readVerifierResults(runId: string): VerifierResults | null {
    const filePath = join(this.getRunDir(runId), 'verifier', 'results.json');
    if (!existsSync(filePath)) return null;

    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Read gatekeeper verdict
   */
  readGatekeeperVerdict(runId: string): GatekeeperVerdict | null {
    const filePath = join(this.getRunDir(runId), 'gatekeeper', 'verdict.json');
    if (!existsSync(filePath)) return null;

    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Read MRP evidence
   */
  readMRPEvidence(runId: string): MRPEvidence | null {
    const filePath = join(this.getRunDir(runId), 'mrp', 'evidence.json');
    if (!existsSync(filePath)) return null;

    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Read MRP summary
   */
  readMRPSummary(runId: string): string | null {
    const filePath = join(this.getRunDir(runId), 'mrp', 'summary.md');
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8');
  }

  /**
   * Check if done.flag exists for an agent
   */
  hasAgentCompleted(runId: string, agent: 'builder' | 'verifier'): boolean {
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
  initialize(): void {
    if (!existsSync(this.runsDir)) {
      mkdirSync(this.runsDir, { recursive: true });
    }
  }
}
