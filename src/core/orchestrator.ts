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
  TestConfig,
  TestOutput,
  ClaudeCodeOutput,
} from '../types/index.js';
import { TestRunner, createTestRunnerFromConfig, validateTestConfig, type TestRunnerResult } from './test-runner.js';
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
import type { Logger } from '../utils/logger.js';
import { NoOpLogger } from '../utils/logger.js';
import type { Metrics, TimerStop } from '../utils/metrics.js';
import { NoOpMetrics, MetricNames, createAgentLabels, createRunLabels, createTokenLabels } from '../utils/metrics.js';
import { EventDispatcher } from './event-dispatcher.js';

/**
 * Options for Orchestrator constructor
 */
export interface OrchestratorOptions {
  timeoutConfig?: Partial<AgentTimeoutConfig>;
  logger?: Logger;
  metrics?: Metrics;
}

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
  private readonly logger: Logger;
  private readonly metrics: Metrics;
  private readonly eventDispatcher: EventDispatcher;

  // Current run state (nullable - only set during active run)
  private stateManager: StateManager | null = null;
  private tmuxManager: TmuxManager | null = null;
  private eventLogger: EventLogger | null = null;
  private managers: ManagerContext | null = null;
  private selectedModels: Record<AgentName, AgentModel> | null = null;
  private currentRunId: string | null = null;
  private isRunning = false;

  // Metric timers
  private runTimer: TimerStop | null = null;
  private agentTimers: Map<AgentName, TimerStop> = new Map();

  constructor(projectRoot: string, config: OrchestraConfig, options?: OrchestratorOptions) {
    super();
    this.projectRoot = projectRoot;
    this.config = config;
    this.timeoutConfig = this.buildTimeoutConfig(config, options?.timeoutConfig);
    this.logger = options?.logger ?? new NoOpLogger();
    this.metrics = options?.metrics ?? new NoOpMetrics();
    this.eventDispatcher = new EventDispatcher({ logger: this.logger });

    // Forward events from dispatcher to this emitter
    this.eventDispatcher.on('orchestrator_event', (event) => {
      this.emit('orchestrator_event', event);
    });

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

    this.logger.debug('Orchestrator initialized', {
      projectRoot,
      maxIterations: config.global.max_iterations,
    });
  }

  // ============ Public API ============

  async startRun(rawBriefing: string): Promise<string> {
    if (this.isRunning) {
      this.logger.warn('Attempted to start run while one is already in progress');
      throw new Error('A run is already in progress');
    }

    this.logger.info('Starting new run', { briefingLength: rawBriefing.length });

    const result = await this.runLifecycleManager.initializeRun(rawBriefing);
    this.setRunContext(result);
    this.initializeManagers(result.runDir, result.runId);

    this.isRunning = true;

    // Start run metrics
    this.metrics.incrementCounter(MetricNames.RUN_TOTAL, createRunLabels(result.runId, 'started'));
    this.metrics.setGauge(MetricNames.ACTIVE_RUNS, 1);
    this.runTimer = this.metrics.startTimer(MetricNames.RUN_DURATION, createRunLabels(result.runId));

    this.emitEvent({ type: 'run_started', runId: result.runId });
    this.emitEvent({ type: 'models_selected', result: result.modelSelection, runId: result.runId });

    this.logger.info('Run started', {
      runId: result.runId,
      models: result.selectedModels,
      maxIterations: this.config.global.max_iterations,
    });

    await this.startAgent('refiner');
    return result.runId;
  }

  async resumeRun(runId: string): Promise<void> {
    this.logger.info('Resuming run', { runId });

    const result = await this.runLifecycleManager.prepareResume(runId);
    this.setRunContext(result);
    this.initializeManagers(result.runDir, result.runId);
    this.isRunning = true;

    if (result.resumeInfo) {
      const { agent, promptFile } = result.resumeInfo;
      const phase = this.agentToPhase(agent);
      await this.managers?.phaseManager.transition(phase);
      this.emitEvent({ type: 'phase_changed', phase, runId });
      await this.managers?.agentLifecycle.restartAgentWithVCR(agent, result.runDir, promptFile);
      this.emitEvent({ type: 'agent_started', agent, runId });

      this.logger.info('Run resumed', { runId, agent, phase });
    }
    this.emitEvent({ type: 'vcr_received', vcrId: '', runId });
  }

  async stopRun(): Promise<void> {
    this.logger.info('Stopping run', { runId: this.currentRunId ?? undefined });
    await this.cleanup(true);
    this.logger.info('Run stopped');
  }

  /**
   * Manually rerun a failed or completed agent
   * Only allows rerun for agents in 'failed', 'timeout', or 'completed' status
   */
  async rerunAgent(agent: AgentName): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.managers) {
      throw new Error('No active run');
    }

    const state = await this.stateManager.loadState();
    if (!state) {
      throw new Error('Failed to load run state');
    }

    const agentState = state.agents[agent];
    const allowedStatuses = ['failed', 'timeout', 'completed'];

    if (!allowedStatuses.includes(agentState.status)) {
      throw new Error(
        `Cannot rerun agent '${agent}' with status '${agentState.status}'. ` +
        `Only agents with status: ${allowedStatuses.join(', ')} can be rerun.`
      );
    }

    this.logger.info('Manual agent rerun requested', {
      runId: this.currentRunId,
      agent,
      previousStatus: agentState.status,
    });

    // Reset agent directory (delete error.flag, done.flag)
    await this.runManager.resetAgentForRerun(this.currentRunId, agent);

    // Update agent status to pending, then start
    await this.stateManager.updateAgentStatus(agent, 'pending');

    // Transition to agent's phase
    const phase = this.agentToPhase(agent);
    await this.managers.phaseManager.transition(phase);
    await this.stateManager.updatePhase(phase);
    this.emitEvent({ type: 'phase_changed', phase, runId: this.currentRunId });

    // Start the agent
    await this.startAgent(agent);

    this.logger.info('Agent rerun started', { runId: this.currentRunId, agent });
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
          this.stateManager.updateAgentStatus(event.agent, 'failed').catch((error) => {
            this.logger.error('Failed to update agent status on timeout', error instanceof Error ? error : undefined, {
              agent: event.agent,
            });
          });
        }
      },
      // Note: Usage updates are handled by AgentLifecycleManager.setupUsageTrackerListeners()
      // to avoid duplicate calls that cause race conditions
      onUsageUpdateEvent: () => {
        // Intentionally empty - AgentLifecycleManager handles state updates
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

    this.logger.debug('Starting agent', { runId: this.currentRunId, agent });

    // Start agent timer
    const timer = this.metrics.startTimer(MetricNames.AGENT_DURATION, createAgentLabels(agent, this.currentRunId));
    this.agentTimers.set(agent, timer);

    const runDir = this.runManager.getRunDir(this.currentRunId);
    await this.managers.agentLifecycle.startAgent(agent, runDir);
    this.emitEvent({ type: 'agent_started', agent, runId: this.currentRunId });

    this.logger.info('Agent started', { runId: this.currentRunId, agent });
  }

  private async handleWatchEvent(event: WatchEvent): Promise<void> {
    const runId = this.currentRunId;
    if (!runId || !this.stateManager || !this.managers) return;

    switch (event.type) {
      case 'refiner_done': await this.handleAgentDone('refiner', 'build'); break;
      case 'builder_done': await this.handleAgentDone('builder', 'verify'); break;
      case 'verifier_done': await this.handleAgentDone('verifier', 'gate'); break;
      case 'tests_ready': await this.handleTestsReady(event.config, runId); break;
      case 'test_execution_done': await this.handleTestExecutionDone(event.result, runId); break;
      case 'gatekeeper_done': await this.handleGatekeeperDone(event.verdict); break;
      case 'crp_created': await this.managers.agentCoordinator.handleCRPCreated(event.crp, runId); break;
      case 'error_flag': await this.handleErrorFlag(event.agent as AgentName, event.errorFlag); break;
      case 'error': this.emitEvent({ type: 'error', error: event.error, runId }); break;
      case 'agent_output': await this.handleAgentOutput(event.agent, event.output, event.usage); break;
    }
  }

  private async handleAgentDone(agent: AgentName, nextPhase: Phase): Promise<void> {
    if (!this.currentRunId || !this.managers) return;

    // Stop agent timer
    const timer = this.agentTimers.get(agent);
    if (timer) {
      timer();
      this.agentTimers.delete(agent);
    }

    this.logger.debug('Agent completed', { runId: this.currentRunId, agent, nextPhase });

    const action = await this.managers.agentCoordinator.handleAgentDone(agent, this.currentRunId, nextPhase);
    if (action.type === 'transition') {
      this.logger.info('Phase transition', {
        runId: this.currentRunId,
        from: this.agentToPhase(agent),
        to: nextPhase,
        nextAgent: action.nextAgent,
      });
      this.emitEvent({ type: 'agent_started', agent: action.nextAgent, runId: this.currentRunId });
    }
  }

  /**
   * Handle tests_ready event (Verifier Phase 1 completion)
   * Starts external TestRunner to execute tests
   */
  private async handleTestsReady(config: TestConfig, runId: string): Promise<void> {
    if (!this.managers) return;

    // Validate and normalize config with defaults for missing fields
    let validatedConfig: TestConfig;
    try {
      validatedConfig = validateTestConfig(config);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Invalid test-config.json from Verifier', error instanceof Error ? error : undefined, {
        runId,
        receivedConfig: config,
      });
      this.emitEvent({
        type: 'error',
        error: `Verifier generated invalid test-config.json: ${errorMessage}`,
        runId,
      });
      if (this.stateManager) {
        await this.stateManager.updateAgentStatus('verifier', 'failed', errorMessage);
      }
      return;
    }

    this.logger.info('Verifier Phase 1 completed, starting external test execution', {
      runId,
      testFramework: validatedConfig.test_framework,
      testCommand: validatedConfig.test_command,
    });

    // Notify AgentCoordinator that Verifier Phase 1 is done
    await this.managers.agentCoordinator.handleVerifierPhase1Done(runId, validatedConfig);

    // Get run directory and start TestRunner
    const runDir = this.runManager.getRunDir(runId);
    const verifierDir = `${runDir}/verifier`;

    // IMPORTANT: TestRunner must run from project root to find test files
    const testRunner = createTestRunnerFromConfig(validatedConfig, this.projectRoot);

    // Listen to TestRunner events
    testRunner.on('event', (event) => {
      if (event.type === 'start') {
        this.logger.debug('Test execution started', { runId, command: event.command });
      } else if (event.type === 'timeout') {
        this.logger.warn('Test execution timed out', { runId, timeoutMs: event.timeoutMs });
      } else if (event.type === 'error') {
        this.logger.error('Test execution error', event.error, { runId });
        this.emitEvent({ type: 'error', error: event.error.message, runId });
      }
    });

    try {
      // Execute tests
      const result = await testRunner.run();

      // Save results to verifier directory
      await testRunner.saveResults(verifierDir, result);

      this.logger.info('Test execution completed', {
        runId,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        testResults: result.testResults,
      });

      // Note: test_execution_done event will be triggered by FileWatcher
      // when test-output.json is written
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Test execution failed', error instanceof Error ? error : undefined, { runId });
      this.emitEvent({ type: 'error', error: `Test execution failed: ${errorMessage}`, runId });

      // Create error flag for verifier
      if (this.stateManager) {
        await this.stateManager.updateAgentStatus('verifier', 'failed', errorMessage);
      }
    }
  }

  /**
   * Handle test_execution_done event (test-output.json written)
   * Starts Verifier Phase 2 to analyze results
   */
  private async handleTestExecutionDone(testOutput: TestOutput, runId: string): Promise<void> {
    if (!this.managers) return;

    this.logger.info('Test execution done, starting Verifier Phase 2', {
      runId,
      exitCode: testOutput.exit_code,
      testResults: testOutput.test_results,
    });

    // Notify AgentCoordinator to start Verifier Phase 2
    await this.managers.agentCoordinator.handleTestExecutionDone(runId, testOutput);

    this.emitEvent({ type: 'agent_started', agent: 'verifier', runId });
  }

  private async handleGatekeeperDone(verdict: GatekeeperVerdict): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.managers) return;

    // Stop gatekeeper timer
    const timer = this.agentTimers.get('gatekeeper');
    if (timer) {
      timer();
      this.agentTimers.delete('gatekeeper');
    }

    this.logger.info('Gatekeeper verdict received', {
      runId: this.currentRunId,
      verdict: verdict.verdict,
      reason: verdict.reason,
    });

    await this.managers.agentLifecycle.completeAgent('gatekeeper');
    this.emitEvent({ type: 'agent_completed', agent: 'gatekeeper', runId: this.currentRunId });

    const result = await this.managers.verdictHandler.processVerdict(verdict, this.currentRunId, this.stateManager);
    await this.managers.verdictHandler.executeVerdictResult(result, this.currentRunId, this.stateManager);

    if (result.action === 'complete' || result.action === 'fail') {
      const finalVerdict = result.action === 'complete' ? 'PASS' : 'FAIL';
      const status = finalVerdict === 'PASS' ? 'success' : 'failure';

      // Record run completion metrics
      this.metrics.incrementCounter(MetricNames.RUN_TOTAL, createRunLabels(this.currentRunId, status));
      if (this.runTimer) {
        this.runTimer();
        this.runTimer = null;
      }

      this.logger.info('Run completed', { runId: this.currentRunId, verdict: finalVerdict });
      this.emitEvent({ type: 'run_completed', runId: this.currentRunId, verdict: finalVerdict });
      process.stdout.write('\x07');
      await this.cleanup(false);
    } else if (result.action === 'retry') {
      // Record iteration metric
      const state = await this.stateManager.loadState();
      if (state) {
        this.metrics.incrementCounter(MetricNames.RUN_ITERATIONS, createRunLabels(this.currentRunId));
      }

      this.logger.info('Retrying build phase', { runId: this.currentRunId });
      this.emitEvent({ type: 'phase_changed', phase: 'build', runId: this.currentRunId });
      await this.startAgent('builder');
    } else if (result.action === 'minor_fix') {
      // Gatekeeper made small fixes, re-run verifier to confirm
      this.logger.info('Minor fix applied, re-running verifier', {
        runId: this.currentRunId,
        attempt: result.attempt,
      });

      // Reset verifier directory to avoid stale flag files
      await this.runManager.resetVerifierForRetry(this.currentRunId);

      this.emitEvent({ type: 'phase_changed', phase: 'verify', runId: this.currentRunId });
      await this.startAgent('verifier');
    }
  }

  /**
   * Handle agent output from headless mode
   * Updates usage tracking when agent completes
   */
  private async handleAgentOutput(agent: AgentName, output: ClaudeCodeOutput, usage: UsageInfo): Promise<void> {
    if (!this.currentRunId || !this.managers) return;

    this.logger.debug('Agent output received', {
      runId: this.currentRunId,
      agent,
      durationMs: output.duration_ms,
      costUsd: output.total_cost_usd,
    });

    // Update usage tracking
    this.managers.agentLifecycle.setAgentUsage(agent, usage);

    // Record token metrics
    const total = this.managers.agentLifecycle.getTotalUsage();
    if (total) {
      this.metrics.setGauge(MetricNames.TOKEN_USAGE, total.total_input_tokens, createTokenLabels(this.currentRunId, 'input'));
      this.metrics.setGauge(MetricNames.TOKEN_USAGE, total.total_output_tokens, createTokenLabels(this.currentRunId, 'output'));

      this.emitEvent({
        type: 'usage_updated',
        agent,
        usage,
        total,
        runId: this.currentRunId,
      });
    }

    // Handle agent completion based on agent type
    // Note: refiner_done, builder_done, etc. events are still triggered by file creation
    // This just updates the usage tracking
  }

  private async handleErrorFlag(agent: AgentName, errorFlag: ErrorFlag): Promise<void> {
    if (!this.currentRunId || !this.stateManager || !this.managers || !this.selectedModels || !this.tmuxManager) return;

    // Record agent error metric
    this.metrics.incrementCounter(MetricNames.AGENT_ERRORS, {
      ...createAgentLabels(agent, this.currentRunId),
      error_type: errorFlag.error_type,
    });

    // Stop agent timer on error
    const timer = this.agentTimers.get(agent);
    if (timer) {
      timer();
      this.agentTimers.delete(agent);
    }

    this.logger.error('Agent error detected', new Error(errorFlag.message), {
      runId: this.currentRunId,
      agent,
      errorType: errorFlag.error_type,
      recoverable: errorFlag.recoverable,
    });

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

    if (!result.success) {
      this.logger.error('Error recovery failed', undefined, {
        runId: this.currentRunId,
        agent,
        action: result.action,
        message: result.message,
      });
      if (this.config.global.notifications.terminal_bell) {
        process.stdout.write('\x07');
      }
    } else {
      // Record retry metric
      this.metrics.incrementCounter(MetricNames.AGENT_RETRIES, createAgentLabels(agent, this.currentRunId));

      this.logger.info('Error recovery succeeded', {
        runId: this.currentRunId,
        agent,
        action: result.action,
      });
    }
  }

  private emitEvent(event: OrchestratorEvent): void {
    this.eventDispatcher.dispatch(event);
  }

  private async cleanup(killSession: boolean): Promise<void> {
    // Stop any running timers
    if (this.runTimer) {
      this.runTimer();
      this.runTimer = null;
    }
    for (const timer of this.agentTimers.values()) {
      timer();
    }
    this.agentTimers.clear();

    // Update active runs gauge
    this.metrics.setGauge(MetricNames.ACTIVE_RUNS, 0);

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
