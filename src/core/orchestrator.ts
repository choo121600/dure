import { EventEmitter } from 'events';
import { join } from 'path';
import type {
  OrchestraConfig,
  RunState,
  Phase,
  GatekeeperVerdict,
  AgentName,
  AgentModel,
  AgentTimeoutConfig,
  UsageInfo,
  TotalUsage,
  ModelSelectionResult,
} from '../types/index.js';
import { StateManager } from './state-manager.js';
import { RunManager } from './run-manager.js';
import { TmuxManager } from './tmux-manager.js';
import { FileWatcher, WatchEvent, ErrorFlag } from './file-watcher.js';
import { PromptGenerator } from '../agents/prompt-generator.js';
import { AgentMonitor } from './agent-monitor.js';
import { OutputStreamer } from './output-streamer.js';
import { EventLogger } from './event-logger.js';
import { MRPGenerator } from './mrp-generator.js';
import { UsageTracker } from './usage-tracker.js';
import { ModelSelector } from './model-selector.js';
import { RetryManager, defaultRetryConfig } from './retry-manager.js';
import { RecoveryManager, RecoveryContext } from './recovery-strategies.js';
import { AgentLifecycleManager } from './agent-lifecycle-manager.js';
import { PhaseTransitionManager } from './phase-transition-manager.js';
import { EventCoordinator, CoordinatedEvent } from './event-coordinator.js';
import { defaultTimeoutConfig, defaultModelSelectionConfig } from '../config/defaults.js';

export type OrchestratorEvent =
  | { type: 'run_started'; runId: string }
  | { type: 'phase_changed'; phase: Phase; runId: string }
  | { type: 'agent_started'; agent: AgentName; runId: string }
  | { type: 'agent_completed'; agent: AgentName; runId: string }
  | { type: 'agent_timeout'; agent: AgentName; runId: string }
  | { type: 'agent_stale'; agent: AgentName; inactiveMs: number; runId: string }
  | { type: 'agent_output'; agent: AgentName; content: string; runId: string }
  | { type: 'agent_failed'; agent: AgentName; errorFlag: ErrorFlag; runId: string }
  | { type: 'agent_retry'; agent: AgentName; attempt: number; maxAttempts: number; runId: string }
  | { type: 'agent_retry_success'; agent: AgentName; attempt: number; runId: string }
  | { type: 'agent_retry_exhausted'; agent: AgentName; totalAttempts: number; runId: string }
  | { type: 'crp_created'; crpId: string; runId: string }
  | { type: 'vcr_received'; vcrId: string; runId: string }
  | { type: 'mrp_ready'; runId: string }
  | { type: 'run_completed'; runId: string; verdict: 'PASS' | 'FAIL' }
  | { type: 'iteration_started'; iteration: number; runId: string }
  | { type: 'usage_updated'; agent: AgentName; usage: UsageInfo; total: TotalUsage; runId: string }
  | { type: 'models_selected'; result: ModelSelectionResult; runId: string }
  | { type: 'error'; error: string; runId: string };

export class Orchestrator extends EventEmitter {
  private projectRoot: string;
  private config: OrchestraConfig;
  private timeoutConfig: AgentTimeoutConfig;
  private runManager: RunManager;
  private stateManager: StateManager | null = null;
  private tmuxManager: TmuxManager | null = null;
  private fileWatcher: FileWatcher | null = null;
  private promptGenerator: PromptGenerator;
  private eventLogger: EventLogger | null = null;
  private modelSelector: ModelSelector;
  private retryManager: RetryManager;
  private recoveryManager: RecoveryManager;

  // New extracted managers
  private agentLifecycle: AgentLifecycleManager | null = null;
  private phaseManager: PhaseTransitionManager | null = null;
  private eventCoordinator: EventCoordinator | null = null;

  private selectedModels: Record<AgentName, AgentModel> | null = null;
  private currentRunId: string | null = null;
  private isRunning = false;

  constructor(projectRoot: string, config: OrchestraConfig, timeoutConfig?: Partial<AgentTimeoutConfig>) {
    super();
    this.projectRoot = projectRoot;
    this.config = config;
    this.timeoutConfig = {
      ...defaultTimeoutConfig,
      refiner: config.global.timeouts?.refiner ?? defaultTimeoutConfig.refiner,
      builder: config.global.timeouts?.builder ?? defaultTimeoutConfig.builder,
      verifier: config.global.timeouts?.verifier ?? defaultTimeoutConfig.verifier,
      gatekeeper: config.global.timeouts?.gatekeeper ?? defaultTimeoutConfig.gatekeeper,
      ...timeoutConfig,
    };
    this.runManager = new RunManager(projectRoot);
    this.promptGenerator = new PromptGenerator(projectRoot);
    this.modelSelector = new ModelSelector(config.global.model_selection ?? defaultModelSelectionConfig);
    this.retryManager = new RetryManager({
      ...defaultRetryConfig,
      maxAttempts: config.global.auto_retry.max_attempts,
      recoverableErrors: config.global.auto_retry.recoverable_errors as ('crash' | 'timeout' | 'validation')[],
    });
    this.recoveryManager = new RecoveryManager();
  }

  /**
   * Start a new run with the given briefing
   */
  async startRun(rawBriefing: string): Promise<string> {
    if (this.isRunning) {
      throw new Error('A run is already in progress');
    }

    if (!TmuxManager.isTmuxAvailable()) {
      throw new Error('tmux is not installed. Please install tmux to use Orchestral.');
    }

    // Select models based on briefing complexity
    const modelSelection = this.modelSelector.selectModels(rawBriefing);
    this.selectedModels = modelSelection.models;

    // Create run
    const runId = this.runManager.generateRunId();
    const runDir = await this.runManager.createRun(runId, rawBriefing, this.config.global.max_iterations);
    this.currentRunId = runId;

    // Initialize core managers
    this.stateManager = new StateManager(runDir);
    this.eventLogger = new EventLogger(runDir);
    await this.runManager.saveModelSelection(runId, modelSelection);
    await this.stateManager.updateModelSelection(modelSelection);

    // Initialize tmux - reuse existing session if available for better UX
    // First try to use existing session (without runId), then fall back to run-specific session
    this.tmuxManager = new TmuxManager(this.config.global.tmux_session_prefix, this.projectRoot);
    if (!this.tmuxManager.sessionExists()) {
      // No existing session, create a run-specific one
      this.tmuxManager = new TmuxManager(this.config.global.tmux_session_prefix, this.projectRoot, runId);
      this.tmuxManager.createSession();
    }
    this.tmuxManager.updatePaneBordersWithModels(modelSelection);

    // Generate prompts
    await this.generatePrompts(runId);

    // Initialize extracted managers
    this.initializeManagers(runDir, runId);

    this.isRunning = true;
    this.emitEvent({ type: 'run_started', runId });
    this.emitEvent({ type: 'models_selected', result: modelSelection, runId });

    // Start pipeline
    await this.startAgent('refiner');

    return runId;
  }

  /**
   * Resume a run after VCR submission
   */
  async resumeRun(runId: string): Promise<void> {
    const runDir = this.runManager.getRunDir(runId);
    this.stateManager = new StateManager(runDir);
    const state = await this.stateManager.loadState();

    if (!state) throw new Error(`Run ${runId} not found`);
    if (state.phase !== 'waiting_human') throw new Error(`Run ${runId} is not waiting for human input`);

    // Restore model selection
    const savedSelection = await this.runManager.readModelSelection(runId);
    if (savedSelection) {
      this.selectedModels = savedSelection.models;
    } else {
      const rawBriefing = await this.runManager.readRawBriefing(runId);
      if (!rawBriefing) throw new Error(`Cannot read raw briefing for run ${runId}`);
      const modelSelection = this.modelSelector.selectModels(rawBriefing);
      this.selectedModels = modelSelection.models;
      await this.runManager.saveModelSelection(runId, modelSelection);
    }

    this.currentRunId = runId;
    this.eventLogger = new EventLogger(runDir);

    // Initialize tmux - reuse existing session if available, or create new one
    this.tmuxManager = new TmuxManager(this.config.global.tmux_session_prefix, this.projectRoot);
    if (!this.tmuxManager.sessionExists()) {
      this.tmuxManager = new TmuxManager(this.config.global.tmux_session_prefix, this.projectRoot, runId);
      this.tmuxManager.createSession();
    }

    // Re-initialize managers
    this.initializeManagers(runDir, runId);
    this.isRunning = true;

    // Clear pending CRP and restart agent
    const pendingCrp = state.pending_crp;
    await this.stateManager.setPendingCRP(null);

    const crps = await this.runManager.listCRPs(runId);
    const resolvedCrp = crps.find(c => c.crp_id === pendingCrp);

    if (resolvedCrp) {
      const agent = resolvedCrp.created_by;
      const promptFile = join(runDir, 'prompts', `${agent}.md`);
      const agentToPhase: Record<AgentName, Phase> = {
        refiner: 'refine', builder: 'build', verifier: 'verify', gatekeeper: 'gate',
      };

      await this.phaseManager?.transition(agentToPhase[agent]);
      this.emitEvent({ type: 'phase_changed', phase: agentToPhase[agent], runId });

      // Find VCR and build info
      const vcrs = await this.runManager.listVCRs(runId);
      const vcr = vcrs.find(v => v.crp_id === resolvedCrp.crp_id);
      let vcrInfo: Parameters<AgentLifecycleManager['restartAgentWithVCR']>[3];

      if (vcr) {
        // Handle both single-question and multi-question CRP formats
        const isMultiQuestion = resolvedCrp.questions && Array.isArray(resolvedCrp.questions);
        let decisionLabel: string;
        let crpQuestion: string;
        let crpContext: string;

        if (isMultiQuestion) {
          // Multi-question format: build summary of all decisions
          const decisions = typeof vcr.decision === 'object' ? vcr.decision : {};
          const labels = resolvedCrp.questions!.map(q => {
            const optionId = decisions[q.id];
            const option = q.options?.find(o => o.id === optionId);
            return `${q.id}: ${option ? option.label : optionId || 'N/A'}`;
          });
          decisionLabel = labels.join('; ');
          crpQuestion = resolvedCrp.questions!.map(q => q.question).join(' | ');
          crpContext = resolvedCrp.context || '';
        } else {
          // Single question format (legacy)
          const decision = typeof vcr.decision === 'string' ? vcr.decision : '';
          const selectedOption = resolvedCrp.options?.find(o => o.id === decision);
          decisionLabel = selectedOption ? `${selectedOption.id}. ${selectedOption.label}` : decision;
          crpQuestion = resolvedCrp.question || '';
          crpContext = resolvedCrp.context || '';
        }

        vcrInfo = {
          crpQuestion,
          crpContext,
          decision: typeof vcr.decision === 'string' ? vcr.decision : JSON.stringify(vcr.decision),
          decisionLabel,
          rationale: vcr.rationale,
          additionalNotes: vcr.additional_notes,
        };
      }

      await this.agentLifecycle?.restartAgentWithVCR(agent, runId, promptFile, vcrInfo);
      this.emitEvent({ type: 'agent_started', agent, runId });
    }

    this.emitEvent({ type: 'vcr_received', vcrId: pendingCrp || '', runId });
  }

  /**
   * Stop the current run
   */
  async stopRun(): Promise<void> {
    this.cleanup(true);
  }

  /**
   * Get current run state
   */
  async getCurrentState(): Promise<RunState | null> {
    return (await this.stateManager?.loadState()) || null;
  }

  /**
   * Get current run ID
   */
  getCurrentRunId(): string | null {
    return this.currentRunId;
  }

  /**
   * Check if orchestrator is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get tmux session name
   */
  getTmuxSessionName(): string | null {
    return this.tmuxManager?.getSessionName() || null;
  }

  /**
   * Get agent outputs
   */
  getAgentOutputs(): Record<AgentName, string> | null {
    return this.agentLifecycle?.getAllOutputs() || null;
  }

  getAgentOutput(agent: AgentName): string | null {
    return this.agentLifecycle?.getAgentOutput(agent) || null;
  }

  forceCapture(agent: AgentName): string | null {
    return this.agentLifecycle?.forceCapture(agent) || null;
  }

  getAgentActivity(agent: AgentName): { lastActivity: Date; isStale: boolean } | null {
    return this.agentLifecycle?.getAgentActivity(agent) || null;
  }

  getAgentUsage(agent: AgentName): UsageInfo | null {
    return this.agentLifecycle?.getAgentUsage(agent) || null;
  }

  getAllAgentUsage(): Record<AgentName, UsageInfo> | null {
    return this.agentLifecycle?.getAllAgentUsage() || null;
  }

  getTotalUsage(): TotalUsage | null {
    return this.agentLifecycle?.getTotalUsage() || null;
  }

  getSelectedModels(): Record<AgentName, AgentModel> | null {
    return this.selectedModels ? { ...this.selectedModels } : null;
  }

  async getModelSelectionResult(runId: string): Promise<ModelSelectionResult | null> {
    return await this.runManager.readModelSelection(runId);
  }

  getRetryManager(): RetryManager {
    return this.retryManager;
  }

  getRecoveryManager(): RecoveryManager {
    return this.recoveryManager;
  }

  /**
   * Initialize all extracted managers
   */
  private initializeManagers(runDir: string, runId: string): void {
    if (!this.tmuxManager || !this.stateManager || !this.selectedModels) return;

    // Agent monitor
    const agentMonitor = new AgentMonitor(this.tmuxManager, this.timeoutConfig);
    agentMonitor.start();

    // Agent lifecycle manager
    this.agentLifecycle = new AgentLifecycleManager(
      this.tmuxManager,
      this.stateManager,
      agentMonitor,
      {
        projectRoot: this.projectRoot,
        timeoutConfig: this.timeoutConfig,
        selectedModels: this.selectedModels,
      }
    );
    this.agentLifecycle.setRunId(runId);

    // Output streamer
    const outputStreamer = new OutputStreamer(this.tmuxManager);
    this.agentLifecycle.setOutputStreamer(outputStreamer);
    this.agentLifecycle.startOutputStreaming(runId);

    // Usage tracker
    const usageTracker = new UsageTracker(this.projectRoot);
    this.agentLifecycle.setUsageTracker(usageTracker);
    this.agentLifecycle.startUsageTracking();

    // Phase transition manager
    this.phaseManager = new PhaseTransitionManager(this.stateManager);

    // File watcher
    this.fileWatcher = new FileWatcher(runDir);
    this.fileWatcher.start();

    // Event coordinator
    this.eventCoordinator = new EventCoordinator();
    this.eventCoordinator.setFileWatcher(this.fileWatcher);
    this.eventCoordinator.setAgentMonitor(agentMonitor);
    this.eventCoordinator.setOutputStreamer(outputStreamer);
    this.eventCoordinator.setUsageTracker(usageTracker);
    this.eventCoordinator.setRetryManager(this.retryManager);
    this.eventCoordinator.setEventLogger(this.eventLogger!);
    this.eventCoordinator.setRunId(runId);
    this.eventCoordinator.setHandlers({
      onFileWatchEvent: (event) => this.handleWatchEvent(event),
      onAgentMonitorEvent: (event) => {
        if (event.type === 'timeout' && this.stateManager) {
          void this.stateManager.updateAgentStatus(event.agent, 'failed');
        }
      },
      onUsageUpdateEvent: (event) => {
        if (this.stateManager) {
          void this.stateManager.updateAgentUsage(event.agent, event.usage);
        }
      },
    });
    this.eventCoordinator.setupListeners();

    // Forward coordinated events to orchestrator events
    this.eventCoordinator.on('coordinated_event', (event: CoordinatedEvent) => {
      this.emit('orchestrator_event', event);
    });
  }

  /**
   * Generate prompt files for all agents
   */
  private async generatePrompts(runId: string): Promise<void> {
    const runDir = this.runManager.getRunDir(runId);
    const promptsDir = join(runDir, 'prompts');
    await this.promptGenerator.generateAllPrompts(promptsDir, {
      project_root: this.projectRoot,
      run_id: runId,
      config: this.config,
      iteration: 1,
    });
  }

  /**
   * Start an agent
   */
  private async startAgent(agent: AgentName): Promise<void> {
    if (!this.currentRunId || !this.agentLifecycle) return;
    const runDir = this.runManager.getRunDir(this.currentRunId);
    await this.agentLifecycle.startAgent(agent, runDir);
    this.emitEvent({ type: 'agent_started', agent, runId: this.currentRunId });
  }

  /**
   * Handle file watcher events
   */
  private async handleWatchEvent(event: WatchEvent): Promise<void> {
    const runId = this.currentRunId;
    if (!runId || !this.stateManager || !this.agentLifecycle || !this.phaseManager) return;

    switch (event.type) {
      case 'refiner_done':
        await this.handleAgentDone('refiner', 'build');
        break;
      case 'builder_done':
        await this.handleAgentDone('builder', 'verify');
        break;
      case 'verifier_done':
        await this.handleAgentDone('verifier', 'gate');
        break;
      case 'gatekeeper_done':
        await this.handleGatekeeperDone(event.verdict);
        break;
      case 'crp_created':
        await this.handleCRPCreated(event.crp);
        break;
      case 'error_flag':
        await this.handleErrorFlag(event.agent as AgentName, event.errorFlag);
        break;
      case 'error':
        this.emitEvent({ type: 'error', error: event.error, runId });
        break;
    }
  }

  /**
   * Handle agent completion and transition to next phase
   */
  private async handleAgentDone(agent: AgentName, nextPhase: Phase): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.agentLifecycle || !this.phaseManager) return;

    await this.agentLifecycle.completeAgent(agent);
    this.emitEvent({ type: 'agent_completed', agent, runId: this.currentRunId });

    // Wait for potential CRP
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check for unresolved CRP
    const state = await this.stateManager.loadState();
    if (state?.phase === 'waiting_human' || state?.pending_crp || await this.hasUnresolvedCRPByAgent(this.currentRunId, agent)) {
      await this.handleUnresolvedCRP(agent);
      return;
    }

    // Clear and transition
    await this.agentLifecycle.clearAgent(agent);
    await this.phaseManager.transition(nextPhase);
    this.emitEvent({ type: 'phase_changed', phase: nextPhase, runId: this.currentRunId });
    await this.startAgent(this.phaseManager.getPhaseAgent(nextPhase)!);
  }

  /**
   * Handle gatekeeper completion
   */
  private async handleGatekeeperDone(verdict: GatekeeperVerdict): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.agentLifecycle || !this.phaseManager) return;

    await this.agentLifecycle.completeAgent('gatekeeper');
    this.emitEvent({ type: 'agent_completed', agent: 'gatekeeper', runId: this.currentRunId });
    await this.agentLifecycle.clearAgent('gatekeeper');

    const { nextPhase, shouldRetry } = await this.phaseManager.handleVerdict(verdict);

    if (verdict.verdict === 'PASS') {
      // Generate MRP
      const runDir = this.runManager.getRunDir(this.currentRunId);
      new MRPGenerator(runDir, this.projectRoot).generate();
      await this.phaseManager.transition('ready_for_merge');
      this.emitEvent({ type: 'mrp_ready', runId: this.currentRunId });
      this.emitEvent({ type: 'run_completed', runId: this.currentRunId, verdict: 'PASS' });
      process.stdout.write('\x07');
      await this.cleanup(false);
    } else if (verdict.verdict === 'FAIL') {
      if (nextPhase === 'failed') {
        await this.phaseManager.transition('failed');
        this.emitEvent({ type: 'run_completed', runId: this.currentRunId, verdict: 'FAIL' });
        process.stdout.write('\x07');
        await this.cleanup(false);
      } else if (shouldRetry) {
        const { iteration } = await this.phaseManager.incrementIteration();
        this.emitEvent({ type: 'iteration_started', iteration, runId: this.currentRunId });
        await this.regeneratePromptsForRetry();
        await this.phaseManager.transition('build');
        this.emitEvent({ type: 'phase_changed', phase: 'build', runId: this.currentRunId });
        await this.startAgent('builder');
      }
    }
  }

  /**
   * Handle CRP creation
   */
  private async handleCRPCreated(crp: { crp_id: string; created_by: AgentName }): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.agentLifecycle) return;

    this.agentLifecycle.stopAgent(crp.created_by);
    await this.stateManager.updateAgentStatus(crp.created_by, 'pending');
    await this.stateManager.setPendingCRP(crp.crp_id);
    this.emitEvent({ type: 'crp_created', crpId: crp.crp_id, runId: this.currentRunId });
    this.emitEvent({ type: 'phase_changed', phase: 'waiting_human', runId: this.currentRunId });
    if (this.config.global.log_level !== 'error') {
      process.stdout.write('\x07');
    }
  }

  /**
   * Handle unresolved CRP detection
   */
  private async handleUnresolvedCRP(agent: AgentName): Promise<void> {
    if (!this.currentRunId || !this.stateManager) return;

    const crps = (await this.runManager.listCRPs(this.currentRunId)).filter(c => c.created_by === agent);
    const vcrs = await this.runManager.listVCRs(this.currentRunId);
    const unresolvedCRP = crps.find(crp => !vcrs.some(vcr => vcr.crp_id === crp.crp_id));

    const state = await this.stateManager.loadState();
    if (unresolvedCRP && !state?.pending_crp) {
      await this.stateManager.setPendingCRP(unresolvedCRP.crp_id);
      this.emitEvent({ type: 'crp_created', crpId: unresolvedCRP.crp_id, runId: this.currentRunId });
      this.emitEvent({ type: 'phase_changed', phase: 'waiting_human', runId: this.currentRunId });
    }
  }

  /**
   * Handle error flag
   */
  private async handleErrorFlag(agent: AgentName, errorFlag: ErrorFlag): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.agentLifecycle) return;

    await this.agentLifecycle.failAgent(agent, errorFlag.message);
    await this.stateManager.addError(`${agent}: ${errorFlag.message}`);
    this.emitEvent({ type: 'agent_failed', agent, errorFlag, runId: this.currentRunId });

    if (this.shouldAutoRetry(errorFlag)) {
      await this.executeAutoRetry(agent, errorFlag);
    } else if (this.config.global.notifications.terminal_bell) {
      process.stdout.write('\x07');
    }
  }

  /**
   * Check if auto-retry should be attempted
   */
  private shouldAutoRetry(errorFlag: ErrorFlag): boolean {
    return (
      this.config.global.auto_retry.enabled &&
      errorFlag.recoverable &&
      this.config.global.auto_retry.recoverable_errors.includes(errorFlag.error_type) &&
      this.recoveryManager.canRecover(errorFlag)
    );
  }

  /**
   * Execute auto-retry
   */
  private async executeAutoRetry(agent: AgentName, errorFlag: ErrorFlag): Promise<void> {
    if (!this.currentRunId || !this.tmuxManager || !this.stateManager || !this.selectedModels) return;

    const runDir = this.runManager.getRunDir(this.currentRunId);
    const recoveryContext: RecoveryContext = {
      agent,
      runId: this.currentRunId,
      errorFlag,
      tmuxManager: this.tmuxManager,
      stateManager: this.stateManager,
      promptFile: join(runDir, 'prompts', `${agent}.md`),
      model: this.selectedModels[agent],
    };

    try {
      await this.retryManager.executeWithRetry(
        async () => {
          const result = await this.recoveryManager.recover(recoveryContext);
          if (!result.success) throw new Error(result.message);
          return result;
        },
        { agent, errorType: errorFlag.error_type, runId: this.currentRunId }
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.emitEvent({ type: 'error', error: `Auto-retry failed for ${agent}: ${errMsg}`, runId: this.currentRunId });
    }
  }

  /**
   * Check for unresolved CRPs by agent
   */
  private async hasUnresolvedCRPByAgent(runId: string, agent: AgentName): Promise<boolean> {
    const crps = (await this.runManager.listCRPs(runId)).filter(c => c.created_by === agent);
    const vcrs = await this.runManager.listVCRs(runId);
    return crps.some(crp => !vcrs.some(vcr => vcr.crp_id === crp.crp_id));
  }

  /**
   * Regenerate prompts for retry
   */
  private async regeneratePromptsForRetry(): Promise<void> {
    if (!this.currentRunId || !this.stateManager) return;

    const runDir = this.runManager.getRunDir(this.currentRunId);
    const state = await this.stateManager.loadState();
    await this.promptGenerator.generateAllPrompts(join(runDir, 'prompts'), {
      project_root: this.projectRoot,
      run_id: this.currentRunId,
      config: this.config,
      iteration: state?.iteration || 1,
      has_review: true,
    });
  }

  /**
   * Emit event
   */
  private emitEvent(event: OrchestratorEvent): void {
    this.emit('orchestrator_event', event);
  }

  /**
   * Clean up resources
   */
  private async cleanup(killSession: boolean): Promise<void> {
    this.agentLifecycle?.cleanup();
    this.eventCoordinator?.cleanup();
    if (this.fileWatcher) {
      await this.fileWatcher.stop();
      this.fileWatcher = null;
    }
    if (killSession && this.tmuxManager) {
      this.tmuxManager.killSession();
      this.tmuxManager = null;
    }
    this.isRunning = false;
    this.currentRunId = null;
    this.stateManager = null;
    this.eventLogger = null;
    this.agentLifecycle = null;
    this.phaseManager = null;
    this.eventCoordinator = null;
  }
}
