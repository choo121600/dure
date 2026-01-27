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
import { WatchEvent, ErrorFlag } from './file-watcher.js';
import { PromptGenerator } from '../agents/prompt-generator.js';
import { EventLogger } from './event-logger.js';
import { ModelSelector } from './model-selector.js';
import { RetryManager, defaultRetryConfig } from './retry-manager.js';
import { RecoveryManager } from './recovery-strategies.js';
import { AgentLifecycleManager } from './agent-lifecycle-manager.js';
import { PhaseTransitionManager } from './phase-transition-manager.js';
import { defaultTimeoutConfig, defaultModelSelectionConfig } from '../config/defaults.js';
import { RunLifecycleManager } from './run-lifecycle-manager.js';
import { ErrorRecoveryService } from './error-recovery-service.js';
import { VerdictHandler } from './verdict-handler.js';
import { AgentCoordinator } from './agent-coordinator.js';
import { ManagerFactory, ManagerContext } from './manager-factory.js';

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
  private readonly projectRoot: string;
  private readonly config: OrchestraConfig;
  private readonly timeoutConfig: AgentTimeoutConfig;
  private readonly runManager: RunManager;
  private readonly promptGenerator: PromptGenerator;
  private readonly modelSelector: ModelSelector;
  private readonly retryManager: RetryManager;
  private readonly recoveryManager: RecoveryManager;
  private readonly runLifecycleManager: RunLifecycleManager;
  private readonly errorRecoveryService: ErrorRecoveryService;

  // Current run state (nullable - only set during active run)
  private stateManager: StateManager | null = null;
  private tmuxManager: TmuxManager | null = null;
  private eventLogger: EventLogger | null = null;
  private managers: ManagerContext | null = null;
  private selectedModels: Record<AgentName, AgentModel> | null = null;
  private currentRunId: string | null = null;
  private isRunning = false;

  constructor(projectRoot: string, config: OrchestraConfig, timeoutConfig?: Partial<AgentTimeoutConfig>) {
    super();
    this.projectRoot = projectRoot;
    this.config = config;
    this.timeoutConfig = this.buildTimeoutConfig(config, timeoutConfig);

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
      this.runManager, this.modelSelector, this.promptGenerator, config, projectRoot
    );
    this.errorRecoveryService = new ErrorRecoveryService(this.retryManager, this.recoveryManager, config);

    this.setupEventForwarding();
  }

  // ============ Public API ============

  async startRun(rawBriefing: string): Promise<string> {
    if (this.isRunning) throw new Error('A run is already in progress');

    const result = await this.runLifecycleManager.initializeRun(rawBriefing);
    this.setRunContext(result);
    this.initializeManagers(result.runDir, result.runId);

    this.isRunning = true;
    this.emitEvent({ type: 'run_started', runId: result.runId });
    this.emitEvent({ type: 'models_selected', result: result.modelSelection, runId: result.runId });

    await this.startAgent('refiner');
    return result.runId;
  }

  async resumeRun(runId: string): Promise<void> {
    const result = await this.runLifecycleManager.prepareResume(runId);
    this.setRunContext(result);
    this.initializeManagers(result.runDir, result.runId);
    this.isRunning = true;

    if (result.resumeInfo) {
      const { agent, promptFile, vcrInfo } = result.resumeInfo;
      const phase = this.agentToPhase(agent);
      await this.managers?.phaseManager.transition(phase);
      this.emitEvent({ type: 'phase_changed', phase, runId });
      await this.managers?.agentLifecycle.restartAgentWithVCR(agent, runId, promptFile, vcrInfo);
      this.emitEvent({ type: 'agent_started', agent, runId });
    }
    this.emitEvent({ type: 'vcr_received', vcrId: '', runId });
  }

  async stopRun(): Promise<void> {
    await this.cleanup(true);
  }

  // ============ Public Getters ============

  async getCurrentState(): Promise<RunState | null> {
    return (await this.stateManager?.loadState()) || null;
  }
  getCurrentRunId(): string | null { return this.currentRunId; }
  getIsRunning(): boolean { return this.isRunning; }
  getTmuxSessionName(): string | null { return this.tmuxManager?.getSessionName() || null; }
  getAgentOutputs(): Record<AgentName, string> | null { return this.managers?.agentLifecycle.getAllOutputs() || null; }
  getAgentOutput(agent: AgentName): string | null { return this.managers?.agentLifecycle.getAgentOutput(agent) || null; }
  forceCapture(agent: AgentName): string | null { return this.managers?.agentLifecycle.forceCapture(agent) || null; }
  getAgentActivity(agent: AgentName): { lastActivity: Date; isStale: boolean } | null {
    return this.managers?.agentLifecycle.getAgentActivity(agent) || null;
  }
  getAgentUsage(agent: AgentName): UsageInfo | null { return this.managers?.agentLifecycle.getAgentUsage(agent) || null; }
  getAllAgentUsage(): Record<AgentName, UsageInfo> | null { return this.managers?.agentLifecycle.getAllAgentUsage() || null; }
  getTotalUsage(): TotalUsage | null { return this.managers?.agentLifecycle.getTotalUsage() || null; }
  getSelectedModels(): Record<AgentName, AgentModel> | null { return this.selectedModels ? { ...this.selectedModels } : null; }
  async getModelSelectionResult(runId: string): Promise<ModelSelectionResult | null> {
    return await this.runManager.readModelSelection(runId);
  }
  getRetryManager(): RetryManager { return this.retryManager; }
  getRecoveryManager(): RecoveryManager { return this.recoveryManager; }

  // ============ Private Methods ============

  private buildTimeoutConfig(config: OrchestraConfig, override?: Partial<AgentTimeoutConfig>): AgentTimeoutConfig {
    return {
      ...defaultTimeoutConfig,
      refiner: config.global.timeouts?.refiner ?? defaultTimeoutConfig.refiner,
      builder: config.global.timeouts?.builder ?? defaultTimeoutConfig.builder,
      verifier: config.global.timeouts?.verifier ?? defaultTimeoutConfig.verifier,
      gatekeeper: config.global.timeouts?.gatekeeper ?? defaultTimeoutConfig.gatekeeper,
      ...override,
    };
  }

  private setRunContext(result: { runId: string; stateManager: StateManager; tmuxManager: TmuxManager; eventLogger: EventLogger; selectedModels: Record<AgentName, AgentModel> }): void {
    this.currentRunId = result.runId;
    this.stateManager = result.stateManager;
    this.tmuxManager = result.tmuxManager;
    this.eventLogger = result.eventLogger;
    this.selectedModels = result.selectedModels;
  }

  private setupEventForwarding(): void {
    this.runLifecycleManager.on('lifecycle_event', (event) => {
      if (event.type === 'run_initialized' && this.currentRunId) {
        this.emitEvent({ type: 'models_selected', result: event.modelSelection, runId: this.currentRunId });
      }
    });

    this.errorRecoveryService.on('recovery_event', (event) => {
      if (!this.currentRunId) return;
      if (event.type === 'recovery_attempt') {
        this.emitEvent({ type: 'agent_retry', agent: event.agent, attempt: event.attempt, maxAttempts: event.maxAttempts, runId: event.runId });
      } else if (event.type === 'recovery_success') {
        this.emitEvent({ type: 'agent_retry_success', agent: event.agent, attempt: event.attempt, runId: event.runId });
      } else if (event.type === 'recovery_exhausted') {
        this.emitEvent({ type: 'agent_retry_exhausted', agent: event.agent, totalAttempts: event.totalAttempts, runId: event.runId });
      }
    });
  }

  private initializeManagers(runDir: string, runId: string): void {
    if (!this.tmuxManager || !this.stateManager || !this.selectedModels || !this.eventLogger) return;

    this.managers = ManagerFactory.create(runDir, runId, {
      tmuxManager: this.tmuxManager,
      stateManager: this.stateManager,
      selectedModels: this.selectedModels,
      eventLogger: this.eventLogger,
      promptGenerator: this.promptGenerator,
      runManager: this.runManager,
      retryManager: this.retryManager,
      config: this.config,
      projectRoot: this.projectRoot,
      timeoutConfig: this.timeoutConfig,
    }, {
      onFileWatchEvent: (event) => this.handleWatchEvent(event),
      onAgentMonitorEvent: (event) => {
        if (event.type === 'timeout' && this.stateManager) {
          void this.stateManager.updateAgentStatus(event.agent, 'failed');
        }
      },
      onUsageUpdateEvent: (event) => {
        if (this.stateManager) {
          void this.stateManager.updateAgentUsage(event.agent, event.usage as UsageInfo);
        }
      },
      onCoordinatedEvent: (event) => this.emit('orchestrator_event', event),
    });

    this.setupManagerEvents();
  }

  private setupManagerEvents(): void {
    this.managers?.verdictHandler.on('verdict_event', (event) => {
      if (!this.currentRunId) return;
      if (event.type === 'verdict_pass') this.emitEvent({ type: 'mrp_ready', runId: this.currentRunId });
      else if (event.type === 'prompts_regenerated') this.emitEvent({ type: 'iteration_started', iteration: event.iteration, runId: this.currentRunId });
    });

    this.managers?.agentCoordinator.on('coordinator_event', (event) => {
      if (!this.currentRunId) return;
      if (event.type === 'agent_completed') {
        this.emitEvent({ type: 'agent_completed', agent: event.agent, runId: event.runId });
      } else if (event.type === 'phase_transitioned') {
        this.emitEvent({ type: 'phase_changed', phase: event.phase, runId: event.runId });
      } else if (event.type === 'crp_created' || event.type === 'crp_detected') {
        this.emitEvent({ type: 'crp_created', crpId: event.crpId, runId: event.runId });
        this.emitEvent({ type: 'phase_changed', phase: 'waiting_human', runId: event.runId });
        if (this.config.global.log_level !== 'error') process.stdout.write('\x07');
      }
    });
  }

  private agentToPhase(agent: AgentName): Phase {
    const map: Record<AgentName, Phase> = { refiner: 'refine', builder: 'build', verifier: 'verify', gatekeeper: 'gate' };
    return map[agent];
  }

  private async startAgent(agent: AgentName): Promise<void> {
    if (!this.currentRunId || !this.managers) return;
    const runDir = this.runManager.getRunDir(this.currentRunId);
    await this.managers.agentLifecycle.startAgent(agent, runDir);
    this.emitEvent({ type: 'agent_started', agent, runId: this.currentRunId });
  }

  private async handleWatchEvent(event: WatchEvent): Promise<void> {
    const runId = this.currentRunId;
    if (!runId || !this.stateManager || !this.managers) return;

    switch (event.type) {
      case 'refiner_done': await this.handleAgentDone('refiner', 'build'); break;
      case 'builder_done': await this.handleAgentDone('builder', 'verify'); break;
      case 'verifier_done': await this.handleAgentDone('verifier', 'gate'); break;
      case 'gatekeeper_done': await this.handleGatekeeperDone(event.verdict); break;
      case 'crp_created': await this.managers.agentCoordinator.handleCRPCreated(event.crp, runId); break;
      case 'error_flag': await this.handleErrorFlag(event.agent as AgentName, event.errorFlag); break;
      case 'error': this.emitEvent({ type: 'error', error: event.error, runId }); break;
    }
  }

  private async handleAgentDone(agent: AgentName, nextPhase: Phase): Promise<void> {
    if (!this.currentRunId || !this.managers) return;
    const action = await this.managers.agentCoordinator.handleAgentDone(agent, this.currentRunId, nextPhase);
    if (action.type === 'transition') {
      this.emitEvent({ type: 'agent_started', agent: action.nextAgent, runId: this.currentRunId });
    }
  }

  private async handleGatekeeperDone(verdict: GatekeeperVerdict): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.managers) return;

    await this.managers.agentLifecycle.completeAgent('gatekeeper');
    this.emitEvent({ type: 'agent_completed', agent: 'gatekeeper', runId: this.currentRunId });
    await this.managers.agentLifecycle.clearAgent('gatekeeper');

    const result = await this.managers.verdictHandler.processVerdict(verdict, this.currentRunId, this.stateManager);
    await this.managers.verdictHandler.executeVerdictResult(result, this.currentRunId, this.stateManager);

    if (result.action === 'complete' || result.action === 'fail') {
      this.emitEvent({ type: 'run_completed', runId: this.currentRunId, verdict: result.action === 'complete' ? 'PASS' : 'FAIL' });
      process.stdout.write('\x07');
      await this.cleanup(false);
    } else if (result.action === 'retry') {
      this.emitEvent({ type: 'phase_changed', phase: 'build', runId: this.currentRunId });
      await this.startAgent('builder');
    }
  }

  private async handleErrorFlag(agent: AgentName, errorFlag: ErrorFlag): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.managers || !this.selectedModels || !this.tmuxManager) return;

    await this.managers.agentLifecycle.failAgent(agent, errorFlag.message);
    await this.stateManager.addError(`${agent}: ${errorFlag.message}`);
    this.emitEvent({ type: 'agent_failed', agent, errorFlag, runId: this.currentRunId });

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
    if (this.managers) {
      await ManagerFactory.cleanup(this.managers, killSession, this.tmuxManager);
    }
    this.managers = null;
    this.isRunning = false;
    this.currentRunId = null;
    this.stateManager = null;
    this.tmuxManager = killSession ? null : this.tmuxManager;
    this.eventLogger = null;
  }
}
