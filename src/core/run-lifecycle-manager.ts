import { EventEmitter } from 'events';
import { join } from 'path';
import type {
  OrchestraConfig,
  AgentName,
  AgentModel,
  ModelSelectionResult,
  CRP,
  VCR,
} from '../types/index.js';
import { RunManager } from './run-manager.js';
import { StateManager } from './state-manager.js';
import { TmuxManager } from './tmux-manager.js';
import { PromptGenerator } from '../agents/prompt-generator.js';
import { ModelSelector } from './model-selector.js';
import { EventLogger } from './event-logger.js';

/**
 * Result of run initialization
 */
export interface RunInitResult {
  runId: string;
  runDir: string;
  stateManager: StateManager;
  tmuxManager: TmuxManager;
  eventLogger: EventLogger;
  selectedModels: Record<AgentName, AgentModel>;
  modelSelection: ModelSelectionResult;
}

/**
 * Result of run resume preparation
 */
export interface RunResumeResult {
  runId: string;
  runDir: string;
  stateManager: StateManager;
  tmuxManager: TmuxManager;
  eventLogger: EventLogger;
  selectedModels: Record<AgentName, AgentModel>;
  resumeInfo: {
    agent: AgentName;
    promptFile: string;
    vcrInfo?: VCRInfo;
  } | null;
}

/**
 * VCR info for agent restart
 */
export interface VCRInfo {
  crpQuestion: string;
  crpContext?: string;
  decision: string;
  decisionLabel?: string;
  rationale?: string;
  additionalNotes?: string;
}

export type RunLifecycleEvent =
  | { type: 'run_initializing'; runId: string }
  | { type: 'run_initialized'; runId: string; modelSelection: ModelSelectionResult }
  | { type: 'run_resuming'; runId: string }
  | { type: 'run_resumed'; runId: string; agent: AgentName }
  | { type: 'run_cleanup_started'; runId: string | null }
  | { type: 'run_cleanup_completed'; runId: string | null };

/**
 * RunLifecycleManager handles run initialization, resumption, and cleanup:
 * - Creating new runs with model selection and tmux sessions
 * - Resuming runs after VCR submission
 * - Cleaning up resources when runs complete or stop
 */
export class RunLifecycleManager extends EventEmitter {
  private runManager: RunManager;
  private modelSelector: ModelSelector;
  private promptGenerator: PromptGenerator;
  private config: OrchestraConfig;
  private projectRoot: string;

  constructor(
    runManager: RunManager,
    modelSelector: ModelSelector,
    promptGenerator: PromptGenerator,
    config: OrchestraConfig,
    projectRoot: string
  ) {
    super();
    this.runManager = runManager;
    this.modelSelector = modelSelector;
    this.promptGenerator = promptGenerator;
    this.config = config;
    this.projectRoot = projectRoot;
  }

  /**
   * Initialize a new run
   */
  async initializeRun(rawBriefing: string): Promise<RunInitResult> {
    // Check tmux availability
    if (!TmuxManager.isTmuxAvailable()) {
      throw new Error('tmux is not installed. Please install tmux to use Orchestral.');
    }

    // Select models based on briefing complexity
    const modelSelection = this.modelSelector.selectModels(rawBriefing);
    const selectedModels = modelSelection.models;

    // Create run
    const runId = this.runManager.generateRunId();
    this.emitEvent({ type: 'run_initializing', runId });

    const runDir = await this.runManager.createRun(
      runId,
      rawBriefing,
      this.config.global.max_iterations
    );

    // Initialize core managers
    const stateManager = new StateManager(runDir);
    const eventLogger = new EventLogger(runDir);

    await this.runManager.saveModelSelection(runId, modelSelection);
    await stateManager.updateModelSelection(modelSelection);

    // Initialize tmux - reuse existing session if available for better UX
    let tmuxManager = new TmuxManager(
      this.config.global.tmux_session_prefix,
      this.projectRoot
    );

    if (!tmuxManager.sessionExists()) {
      // No existing session, create a run-specific one
      tmuxManager = new TmuxManager(
        this.config.global.tmux_session_prefix,
        this.projectRoot,
        runId
      );
      tmuxManager.createSession();
    }

    tmuxManager.updatePaneBordersWithModels(modelSelection);

    // Generate prompts
    await this.generatePrompts(runDir, runId, 1);

    this.emitEvent({ type: 'run_initialized', runId, modelSelection });

    return {
      runId,
      runDir,
      stateManager,
      tmuxManager,
      eventLogger,
      selectedModels,
      modelSelection,
    };
  }

  /**
   * Prepare a run for resumption after VCR submission
   */
  async prepareResume(runId: string): Promise<RunResumeResult> {
    const runDir = this.runManager.getRunDir(runId);
    const stateManager = new StateManager(runDir);
    const state = await stateManager.loadState();

    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    if (state.phase !== 'waiting_human') {
      throw new Error(`Run ${runId} is not waiting for human input`);
    }

    this.emitEvent({ type: 'run_resuming', runId });

    // Restore model selection
    let selectedModels: Record<AgentName, AgentModel>;
    const savedSelection = await this.runManager.readModelSelection(runId);

    if (savedSelection) {
      selectedModels = savedSelection.models;
    } else {
      const rawBriefing = await this.runManager.readRawBriefing(runId);
      if (!rawBriefing) {
        throw new Error(`Cannot read raw briefing for run ${runId}`);
      }
      const modelSelection = this.modelSelector.selectModels(rawBriefing);
      selectedModels = modelSelection.models;
      await this.runManager.saveModelSelection(runId, modelSelection);
    }

    const eventLogger = new EventLogger(runDir);

    // Initialize tmux - reuse existing session if available, or create new one
    let tmuxManager = new TmuxManager(
      this.config.global.tmux_session_prefix,
      this.projectRoot
    );

    if (!tmuxManager.sessionExists()) {
      tmuxManager = new TmuxManager(
        this.config.global.tmux_session_prefix,
        this.projectRoot,
        runId
      );
      tmuxManager.createSession();
    }

    // Clear pending CRP
    const pendingCrp = state.pending_crp;
    await stateManager.setPendingCRP(null);

    // Find resume info
    let resumeInfo: RunResumeResult['resumeInfo'] = null;

    if (pendingCrp) {
      const crps = await this.runManager.listCRPs(runId);
      const resolvedCrp = crps.find(c => c.crp_id === pendingCrp);

      if (resolvedCrp) {
        const agent = resolvedCrp.created_by;
        const promptFile = join(runDir, 'prompts', `${agent}.md`);

        // Find VCR and build info
        const vcrs = await this.runManager.listVCRs(runId);
        const vcr = vcrs.find(v => v.crp_id === resolvedCrp.crp_id);
        let vcrInfo: VCRInfo | undefined;

        if (vcr) {
          vcrInfo = this.buildVCRInfo(resolvedCrp, vcr);
        }

        resumeInfo = { agent, promptFile, vcrInfo };

        this.emitEvent({ type: 'run_resumed', runId, agent });
      }
    }

    return {
      runId,
      runDir,
      stateManager,
      tmuxManager,
      eventLogger,
      selectedModels,
      resumeInfo,
    };
  }

  /**
   * Generate prompt files for all agents
   */
  async generatePrompts(
    runDir: string,
    runId: string,
    iteration: number,
    hasReview: boolean = false
  ): Promise<void> {
    const promptsDir = join(runDir, 'prompts');
    await this.promptGenerator.generateAllPrompts(promptsDir, {
      project_root: this.projectRoot,
      run_id: runId,
      config: this.config,
      iteration,
      has_review: hasReview,
    });
  }

  /**
   * Build VCR info from CRP and VCR
   */
  private buildVCRInfo(crp: CRP, vcr: VCR): VCRInfo {
    // Handle both single-question and multi-question CRP formats
    const isMultiQuestion = crp.questions && Array.isArray(crp.questions);
    let decisionLabel: string;
    let crpQuestion: string;
    let crpContext: string;

    if (isMultiQuestion) {
      // Multi-question format: build summary of all decisions
      const decisions = typeof vcr.decision === 'object' ? vcr.decision : {};
      const labels = crp.questions!.map(q => {
        const optionId = decisions[q.id];
        const option = q.options?.find(o => o.id === optionId);
        return `${q.id}: ${option ? option.label : optionId || 'N/A'}`;
      });
      decisionLabel = labels.join('; ');
      crpQuestion = crp.questions!.map(q => q.question).join(' | ');
      crpContext = crp.context || '';
    } else {
      // Single question format (legacy)
      const decision = typeof vcr.decision === 'string' ? vcr.decision : '';
      const selectedOption = crp.options?.find(o => o.id === decision);
      decisionLabel = selectedOption ? `${selectedOption.id}. ${selectedOption.label}` : decision;
      crpQuestion = crp.question || '';
      crpContext = crp.context || '';
    }

    return {
      crpQuestion,
      crpContext,
      decision: typeof vcr.decision === 'string' ? vcr.decision : JSON.stringify(vcr.decision),
      decisionLabel,
      rationale: vcr.rationale,
      additionalNotes: vcr.additional_notes,
    };
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: RunLifecycleEvent): void {
    this.emit('lifecycle_event', event);
  }
}
