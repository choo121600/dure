import { EventEmitter } from 'events';
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
import { UsageTracker } from './usage-tracker.js';
import { ModelSelector } from './model-selector.js';
import { RetryManager, defaultRetryConfig } from './retry-manager.js';
import { RecoveryManager } from './recovery-strategies.js';
import { AgentLifecycleManager } from './agent-lifecycle-manager.js';
import { PhaseTransitionManager } from './phase-transition-manager.js';
import { EventCoordinator, CoordinatedEvent } from './event-coordinator.js';
import { defaultTimeoutConfig, defaultModelSelectionConfig } from '../config/defaults.js';

// New extracted managers
import { RunLifecycleManager } from './run-lifecycle-manager.js';
import { ErrorRecoveryService } from './error-recovery-service.js';
import { VerdictHandler } from './verdict-handler.js';
import { AgentCoordinator } from './agent-coordinator.js';

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
  private promptGenerator: PromptGenerator;
  private modelSelector: ModelSelector;
  private retryManager: RetryManager;
  private recoveryManager: RecoveryManager;

  // Current run state
  private stateManager: StateManager | null = null;
  private tmuxManager: TmuxManager | null = null;
  private fileWatcher: FileWatcher | null = null;
  private eventLogger: EventLogger | null = null;
  private agentLifecycle: AgentLifecycleManager | null = null;
  private phaseManager: PhaseTransitionManager | null = null;
  private eventCoordinator: EventCoordinator | null = null;

  // New extracted managers
  private runLifecycleManager: RunLifecycleManager;
  private errorRecoveryService: ErrorRecoveryService;
  private verdictHandler: VerdictHandler | null = null;
  private agentCoordinator: AgentCoordinator | null = null;

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

    // Initialize core dependencies
    this.runManager = new RunManager(projectRoot);
    this.promptGenerator = new PromptGenerator(projectRoot);
    this.modelSelector = new ModelSelector(config.global.model_selection ?? defaultModelSelectionConfig);
    this.retryManager = new RetryManager({
      ...defaultRetryConfig,
      maxAttempts: config.global.auto_retry.max_attempts,
      recoverableErrors: config.global.auto_retry.recoverable_errors as ('crash' | 'timeout' | 'validation')[],
    });
    this.recoveryManager = new RecoveryManager();

    // Initialize extracted managers
    this.runLifecycleManager = new RunLifecycleManager(
      this.runManager,
      this.modelSelector,
      this.promptGenerator,
      config,
      projectRoot
    );
    this.errorRecoveryService = new ErrorRecoveryService(
      this.retryManager,
      this.recoveryManager,
      config
    );

    // Setup event forwarding from lifecycle manager
    this.runLifecycleManager.on('lifecycle_event', (event) => {
      if (event.type === 'run_initialized' && this.currentRunId) {
        this.emitEvent({ type: 'models_selected', result: event.modelSelection, runId: this.currentRunId });
      }
    });

    // Setup event forwarding from error recovery service
    this.errorRecoveryService.on('recovery_event', (event) => {
      if (!this.currentRunId) return;
      switch (event.type) {
        case 'recovery_attempt':
          this.emitEvent({
            type: 'agent_retry',
            agent: event.agent,
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            runId: event.runId,
          });
          break;
        case 'recovery_success':
          this.emitEvent({ type: 'agent_retry_success', agent: event.agent, attempt: event.attempt, runId: event.runId });
          break;
        case 'recovery_exhausted':
          this.emitEvent({ type: 'agent_retry_exhausted', agent: event.agent, totalAttempts: event.totalAttempts, runId: event.runId });
          break;
      }
    });
  }

  /**
   * Start a new run with the given briefing
   */
  async startRun(rawBriefing: string): Promise<string> {
    if (this.isRunning) {
      throw new Error('A run is already in progress');
    }

    // Initialize run via RunLifecycleManager
    const result = await this.runLifecycleManager.initializeRun(rawBriefing);
    this.currentRunId = result.runId;
    this.stateManager = result.stateManager;
    this.tmuxManager = result.tmuxManager;
    this.eventLogger = result.eventLogger;
    this.selectedModels = result.selectedModels;

    // Initialize remaining managers
    this.initializeManagers(result.runDir, result.runId);

    this.isRunning = true;
    this.emitEvent({ type: 'run_started', runId: result.runId });
    this.emitEvent({ type: 'models_selected', result: result.modelSelection, runId: result.runId });

    // Start pipeline
    await this.startAgent('refiner');

    return result.runId;
  }

  /**
   * Resume a run after VCR submission
   */
  async resumeRun(runId: string): Promise<void> {
    // Prepare resume via RunLifecycleManager
    const result = await this.runLifecycleManager.prepareResume(runId);
    this.currentRunId = result.runId;
    this.stateManager = result.stateManager;
    this.tmuxManager = result.tmuxManager;
    this.eventLogger = result.eventLogger;
    this.selectedModels = result.selectedModels;

    // Initialize managers
    this.initializeManagers(result.runDir, result.runId);
    this.isRunning = true;

    // Restart agent if there's resume info
    if (result.resumeInfo) {
      const { agent, promptFile, vcrInfo } = result.resumeInfo;
      const agentToPhase: Record<AgentName, Phase> = {
        refiner: 'refine', builder: 'build', verifier: 'verify', gatekeeper: 'gate',
      };

      await this.phaseManager?.transition(agentToPhase[agent]);
      this.emitEvent({ type: 'phase_changed', phase: agentToPhase[agent], runId });

      await this.agentLifecycle?.restartAgentWithVCR(agent, runId, promptFile, vcrInfo);
      this.emitEvent({ type: 'agent_started', agent, runId });
    }

    this.emitEvent({ type: 'vcr_received', vcrId: '', runId });
  }

  /**
   * Stop the current run
   */
  async stopRun(): Promise<void> {
    await this.cleanup(true);
  }

  // ============ Public Getters ============

  async getCurrentState(): Promise<RunState | null> {
    return (await this.stateManager?.loadState()) || null;
  }

  getCurrentRunId(): string | null {
    return this.currentRunId;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getTmuxSessionName(): string | null {
    return this.tmuxManager?.getSessionName() || null;
  }

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

  // ============ Private Methods ============

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
      { projectRoot: this.projectRoot, timeoutConfig: this.timeoutConfig, selectedModels: this.selectedModels }
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

    // Verdict handler
    this.verdictHandler = new VerdictHandler(
      this.phaseManager,
      this.promptGenerator,
      this.runManager,
      this.config,
      this.projectRoot
    );
    this.setupVerdictHandlerEvents();

    // Agent coordinator
    this.agentCoordinator = new AgentCoordinator(
      this.agentLifecycle,
      this.phaseManager,
      this.runManager,
      this.stateManager
    );
    this.setupAgentCoordinatorEvents();

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
    this.eventCoordinator.on('coordinated_event', (event: CoordinatedEvent) => {
      this.emit('orchestrator_event', event);
    });
  }

  private setupVerdictHandlerEvents(): void {
    this.verdictHandler?.on('verdict_event', (event) => {
      if (!this.currentRunId) return;
      switch (event.type) {
        case 'verdict_pass':
          this.emitEvent({ type: 'mrp_ready', runId: this.currentRunId });
          break;
        case 'prompts_regenerated':
          this.emitEvent({ type: 'iteration_started', iteration: event.iteration, runId: this.currentRunId });
          break;
      }
    });
  }

  private setupAgentCoordinatorEvents(): void {
    this.agentCoordinator?.on('coordinator_event', (event) => {
      if (!this.currentRunId) return;
      switch (event.type) {
        case 'agent_completed':
          this.emitEvent({ type: 'agent_completed', agent: event.agent, runId: event.runId });
          break;
        case 'phase_transitioned':
          this.emitEvent({ type: 'phase_changed', phase: event.phase, runId: event.runId });
          break;
        case 'crp_created':
        case 'crp_detected':
          this.emitEvent({ type: 'crp_created', crpId: event.crpId, runId: event.runId });
          this.emitEvent({ type: 'phase_changed', phase: 'waiting_human', runId: event.runId });
          if (this.config.global.log_level !== 'error') {
            process.stdout.write('\x07');
          }
          break;
      }
    });
  }

  private async startAgent(agent: AgentName): Promise<void> {
    if (!this.currentRunId || !this.agentLifecycle) return;
    const runDir = this.runManager.getRunDir(this.currentRunId);
    await this.agentLifecycle.startAgent(agent, runDir);
    this.emitEvent({ type: 'agent_started', agent, runId: this.currentRunId });
  }

  private async handleWatchEvent(event: WatchEvent): Promise<void> {
    const runId = this.currentRunId;
    if (!runId || !this.stateManager || !this.agentCoordinator || !this.verdictHandler) return;

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
        await this.agentCoordinator.handleCRPCreated(event.crp, runId);
        break;
      case 'error_flag':
        await this.handleErrorFlag(event.agent as AgentName, event.errorFlag);
        break;
      case 'error':
        this.emitEvent({ type: 'error', error: event.error, runId });
        break;
    }
  }

  private async handleAgentDone(agent: AgentName, nextPhase: Phase): Promise<void> {
    if (!this.currentRunId || !this.agentCoordinator) return;

    const action = await this.agentCoordinator.handleAgentDone(agent, this.currentRunId, nextPhase);

    // Start next agent if transitioning
    if (action.type === 'transition') {
      this.emitEvent({ type: 'agent_started', agent: action.nextAgent, runId: this.currentRunId });
    }
  }

  private async handleGatekeeperDone(verdict: GatekeeperVerdict): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.agentLifecycle || !this.verdictHandler) return;

    await this.agentLifecycle.completeAgent('gatekeeper');
    this.emitEvent({ type: 'agent_completed', agent: 'gatekeeper', runId: this.currentRunId });
    await this.agentLifecycle.clearAgent('gatekeeper');

    // Process verdict via VerdictHandler
    const result = await this.verdictHandler.processVerdict(verdict, this.currentRunId, this.stateManager);
    await this.verdictHandler.executeVerdictResult(result, this.currentRunId, this.stateManager);

    // Handle completion
    if (result.action === 'complete') {
      this.emitEvent({ type: 'run_completed', runId: this.currentRunId, verdict: 'PASS' });
      process.stdout.write('\x07');
      await this.cleanup(false);
    } else if (result.action === 'fail') {
      this.emitEvent({ type: 'run_completed', runId: this.currentRunId, verdict: 'FAIL' });
      process.stdout.write('\x07');
      await this.cleanup(false);
    } else if (result.action === 'retry') {
      this.emitEvent({ type: 'phase_changed', phase: 'build', runId: this.currentRunId });
      await this.startAgent('builder');
    }
  }

  private async handleErrorFlag(agent: AgentName, errorFlag: ErrorFlag): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.agentLifecycle || !this.selectedModels || !this.tmuxManager) return;

    await this.agentLifecycle.failAgent(agent, errorFlag.message);
    await this.stateManager.addError(`${agent}: ${errorFlag.message}`);
    this.emitEvent({ type: 'agent_failed', agent, errorFlag, runId: this.currentRunId });

    // Delegate to ErrorRecoveryService
    const result = await this.errorRecoveryService.handleError(agent, errorFlag, {
      runId: this.currentRunId,
      runManager: this.runManager,
      tmuxManager: this.tmuxManager,
      stateManager: this.stateManager,
      selectedModels: this.selectedModels,
    });

    if (!result.success && this.config.global.notifications.terminal_bell) {
      process.stdout.write('\x07');
    }
  }

  private emitEvent(event: OrchestratorEvent): void {
    this.emit('orchestrator_event', event);
  }

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
    this.verdictHandler = null;
    this.agentCoordinator = null;
  }
}
