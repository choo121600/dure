/**
 * DashboardDataProvider - Data layer for TUI and Web dashboards
 *
 * Aggregates data from TmuxManager and StateManager, providing a unified
 * data source for dashboard views. Uses polling to detect changes and
 * emits events for subscribers.
 */
import { EventEmitter } from 'events';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { TmuxManager } from './tmux-manager.js';
import type { StateManager } from './state-manager.js';
import type {
  AgentName,
  Phase,
  AgentStatus,
  DashboardData,
  DashboardStage,
  DashboardAgentStatus,
  DashboardAgentData,
  DashboardCRP,
  CRP,
  GatekeeperVerdict,
} from '../types/index.js';

/**
 * Map Phase to DashboardStage
 */
function phaseToDashboardStage(phase: Phase): DashboardStage {
  switch (phase) {
    case 'refine':
      return 'REFINE';
    case 'build':
      return 'BUILD';
    case 'verify':
      return 'VERIFY';
    case 'gate':
      return 'GATE';
    case 'waiting_human':
      return 'WAITING_HUMAN';
    case 'ready_for_merge':
    case 'completed':
      return 'DONE';
    case 'failed':
      return 'FAILED';
    default:
      return 'REFINE';
  }
}

/**
 * Map AgentStatus to DashboardAgentStatus
 */
function agentStatusToDashboardStatus(status: AgentStatus): DashboardAgentStatus {
  switch (status) {
    case 'pending':
      return 'idle';
    case 'running':
    case 'waiting_test_execution':
    case 'waiting_human':
      return 'running';
    case 'completed':
      return 'done';
    case 'failed':
    case 'timeout':
      return 'error';
    default:
      return 'idle';
  }
}

/**
 * Default polling interval in milliseconds
 */
const DEFAULT_POLLING_INTERVAL_MS = 500;

/**
 * Default number of output lines to capture
 */
const DEFAULT_OUTPUT_LINES = 50;

/**
 * Agents in execution order
 */
const AGENTS: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];

/**
 * Total steps in the pipeline (used for progress calculation)
 */
const TOTAL_STEPS = 4;

export interface DashboardDataProviderOptions {
  /** Polling interval in milliseconds (default: 500) */
  pollingIntervalMs?: number;
  /** Number of output lines to capture from each agent (default: 50) */
  outputLines?: number;
  /** Project root directory for reading CRP files */
  projectRoot?: string;
}

export class DashboardDataProvider extends EventEmitter {
  private tmuxManager: TmuxManager;
  private stateManager: StateManager;
  private pollingInterval: NodeJS.Timeout | null = null;
  private pollingIntervalMs: number;
  private outputLines: number;
  private projectRoot: string;
  private runDir: string;

  // Cached previous state for change detection
  private previousData: DashboardData | null = null;

  constructor(
    tmuxManager: TmuxManager,
    stateManager: StateManager,
    runDir: string,
    options: DashboardDataProviderOptions = {}
  ) {
    super();
    this.tmuxManager = tmuxManager;
    this.stateManager = stateManager;
    this.runDir = runDir;
    this.pollingIntervalMs = options.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS;
    this.outputLines = options.outputLines ?? DEFAULT_OUTPUT_LINES;
    this.projectRoot = options.projectRoot ?? process.cwd();
  }

  /**
   * Start polling for data changes
   */
  startPolling(intervalMs?: number): void {
    if (this.pollingInterval) {
      this.stopPolling();
    }

    const interval = intervalMs ?? this.pollingIntervalMs;
    this.pollingInterval = setInterval(() => this.poll(), interval);

    // Immediately poll once
    this.poll();
  }

  /**
   * Stop polling for data changes
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Get current dashboard data snapshot
   */
  async getData(): Promise<DashboardData> {
    const state = await this.stateManager.loadState();

    if (!state) {
      // Return empty data if no state exists
      return this.createEmptyData();
    }

    // Build agent data
    const agents: DashboardData['agents'] = {
      refiner: await this.getAgentData('refiner', state.agents.refiner.status, state.agents.refiner.started_at, state.agents.refiner.completed_at),
      builder: await this.getAgentData('builder', state.agents.builder.status, state.agents.builder.started_at, state.agents.builder.completed_at),
      verifier: await this.getAgentData('verifier', state.agents.verifier.status, state.agents.verifier.started_at, state.agents.verifier.completed_at),
      gatekeeper: await this.getAgentData('gatekeeper', state.agents.gatekeeper.status, state.agents.gatekeeper.started_at, state.agents.gatekeeper.completed_at),
    };

    // Calculate usage
    const usage = {
      totalTokens: (state.usage?.total_input_tokens ?? 0) + (state.usage?.total_output_tokens ?? 0),
      cost: state.usage?.total_cost_usd ?? 0,
    };

    // Get CRP if pending
    let crp: DashboardCRP | undefined;
    if (state.pending_crp) {
      crp = await this.loadCRP(state.pending_crp);
    }

    // Calculate progress
    const progress = this.calculateProgress(state.phase, state.iteration, state.max_iterations);

    // Load verdict if run failed or completed
    let verdict: GatekeeperVerdict | undefined;
    if (state.phase === 'failed' || state.phase === 'completed' || state.phase === 'ready_for_merge') {
      verdict = await this.loadVerdict();
    }

    return {
      runId: state.run_id,
      stage: phaseToDashboardStage(state.phase),
      agents,
      usage,
      crp,
      progress,
      verdict,
    };
  }

  /**
   * Internal polling function
   */
  private async poll(): Promise<void> {
    try {
      const data = await this.getData();

      // Detect and emit specific change events
      if (this.previousData) {
        this.detectAndEmitChanges(this.previousData, data);
      }

      // Always emit general update
      this.emit('update', data);

      // Store for next comparison
      this.previousData = data;
    } catch (error) {
      // Emit error but don't stop polling
      this.emit('error', error);
    }
  }

  /**
   * Detect changes and emit specific events
   */
  private detectAndEmitChanges(prev: DashboardData, curr: DashboardData): void {
    // Stage change
    if (prev.stage !== curr.stage) {
      this.emit('stage-change', {
        previousStage: prev.stage,
        newStage: curr.stage,
      });
    }

    // Agent status changes
    for (const agent of AGENTS) {
      if (prev.agents[agent].status !== curr.agents[agent].status) {
        this.emit('agent-status-change', {
          agent,
          previousStatus: prev.agents[agent].status,
          newStatus: curr.agents[agent].status,
        });
      }
    }

    // CRP created
    if (!prev.crp && curr.crp) {
      this.emit('crp', curr.crp);
    }
  }

  /**
   * Get data for a single agent
   */
  private async getAgentData(
    agent: AgentName,
    status: AgentStatus,
    startedAt?: string,
    completedAt?: string
  ): Promise<DashboardAgentData> {
    // Capture output from tmux pane
    let output = '';
    try {
      output = this.tmuxManager.capturePane(agent, this.outputLines);
    } catch {
      // Ignore capture errors (pane might not exist)
    }

    return {
      status: agentStatusToDashboardStatus(status),
      output,
      startedAt: startedAt ? new Date(startedAt) : undefined,
      finishedAt: completedAt ? new Date(completedAt) : undefined,
    };
  }

  /**
   * Load CRP data from file
   */
  private async loadCRP(crpId: string): Promise<DashboardCRP | undefined> {
    try {
      const crpPath = join(this.runDir, 'crp', `${crpId}.json`);
      const content = await readFile(crpPath, 'utf-8');
      const crp: CRP = JSON.parse(content);

      // Determine the agent that created the CRP
      const agent = crp.created_by;

      // Get question - support both single and multi-question formats
      let question = '';
      if (crp.question) {
        question = crp.question;
      } else if (crp.questions && crp.questions.length > 0) {
        question = crp.questions[0].question;
      }

      // Get options
      const options: string[] = [];
      if (crp.options) {
        for (const opt of crp.options) {
          options.push(opt.label);
        }
      } else if (crp.questions && crp.questions.length > 0 && crp.questions[0].options) {
        for (const opt of crp.questions[0].options) {
          options.push(opt.label);
        }
      }

      return {
        agent,
        question,
        options,
      };
    } catch {
      // CRP file not found or invalid
      return undefined;
    }
  }

  /**
   * Load Gatekeeper verdict from file
   */
  private async loadVerdict(): Promise<GatekeeperVerdict | undefined> {
    try {
      const verdictPath = join(this.runDir, 'gatekeeper', 'verdict.json');
      const content = await readFile(verdictPath, 'utf-8');
      return JSON.parse(content) as GatekeeperVerdict;
    } catch {
      // Verdict file not found or invalid
      return undefined;
    }
  }

  /**
   * Calculate progress based on current phase
   */
  private calculateProgress(phase: Phase, iteration: number, maxIterations: number): DashboardData['progress'] {
    let currentStep: number;

    switch (phase) {
      case 'refine':
        currentStep = 1;
        break;
      case 'build':
        currentStep = 2;
        break;
      case 'verify':
        currentStep = 3;
        break;
      case 'gate':
      case 'waiting_human':
        currentStep = 4;
        break;
      case 'ready_for_merge':
      case 'completed':
      case 'failed':
        currentStep = TOTAL_STEPS;
        break;
      default:
        currentStep = 1;
    }

    return {
      currentStep,
      totalSteps: TOTAL_STEPS,
      retryCount: iteration - 1, // iteration starts at 1, retry count starts at 0
    };
  }

  /**
   * Create empty dashboard data (when no state exists)
   */
  private createEmptyData(): DashboardData {
    const emptyAgent: DashboardAgentData = {
      status: 'idle',
      output: '',
    };

    return {
      runId: '',
      stage: 'REFINE',
      agents: {
        refiner: { ...emptyAgent },
        builder: { ...emptyAgent },
        verifier: { ...emptyAgent },
        gatekeeper: { ...emptyAgent },
      },
      usage: {
        totalTokens: 0,
        cost: 0,
      },
      progress: {
        currentStep: 0,
        totalSteps: TOTAL_STEPS,
        retryCount: 0,
      },
    };
  }

  /**
   * Get the current polling interval
   */
  getPollingInterval(): number {
    return this.pollingIntervalMs;
  }

  /**
   * Check if polling is active
   */
  isPolling(): boolean {
    return this.pollingInterval !== null;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopPolling();
    this.removeAllListeners();
  }
}
