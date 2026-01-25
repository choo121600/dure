import { EventEmitter } from 'events';
import { join } from 'path';
import type { OrchestraConfig, RunState, Phase, GatekeeperVerdict, AgentName, AgentOutputEvent, AgentTimeoutConfig } from '../types/index.js';
import { StateManager } from './state-manager.js';
import { RunManager } from './run-manager.js';
import { TmuxManager } from './tmux-manager.js';
import { FileWatcher, WatchEvent, ErrorFlag } from './file-watcher.js';
import { PromptGenerator } from '../agents/prompt-generator.js';
import { AgentMonitor, AgentMonitorEvent } from './agent-monitor.js';
import { OutputStreamer } from './output-streamer.js';
import { EventLogger } from './event-logger.js';
import { MRPGenerator } from './mrp-generator.js';
import { defaultTimeoutConfig } from '../config/defaults.js';

export type OrchestratorEvent =
  | { type: 'run_started'; runId: string }
  | { type: 'phase_changed'; phase: Phase; runId: string }
  | { type: 'agent_started'; agent: AgentName; runId: string }
  | { type: 'agent_completed'; agent: AgentName; runId: string }
  | { type: 'agent_timeout'; agent: AgentName; runId: string }
  | { type: 'agent_stale'; agent: AgentName; inactiveMs: number; runId: string }
  | { type: 'agent_output'; agent: AgentName; content: string; runId: string }
  | { type: 'agent_failed'; agent: AgentName; errorFlag: ErrorFlag; runId: string }
  | { type: 'crp_created'; crpId: string; runId: string }
  | { type: 'vcr_received'; vcrId: string; runId: string }
  | { type: 'mrp_ready'; runId: string }
  | { type: 'run_completed'; runId: string; verdict: 'PASS' | 'FAIL' }
  | { type: 'iteration_started'; iteration: number; runId: string }
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
  private agentMonitor: AgentMonitor | null = null;
  private outputStreamer: OutputStreamer | null = null;
  private eventLogger: EventLogger | null = null;
  private currentRunId: string | null = null;
  private isRunning = false;

  constructor(projectRoot: string, config: OrchestraConfig, timeoutConfig?: Partial<AgentTimeoutConfig>) {
    super();
    this.projectRoot = projectRoot;
    this.config = config;
    // Merge timeout config with global config timeouts
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
  }

  /**
   * Start a new run with the given briefing
   */
  async startRun(rawBriefing: string): Promise<string> {
    if (this.isRunning) {
      throw new Error('A run is already in progress');
    }

    // Check for tmux
    if (!TmuxManager.isTmuxAvailable()) {
      throw new Error('tmux is not installed. Please install tmux to use Orchestral.');
    }

    // Generate run ID and create run directory
    const runId = this.runManager.generateRunId();
    const runDir = this.runManager.createRun(runId, rawBriefing, this.config.global.max_iterations);

    this.currentRunId = runId;
    this.stateManager = new StateManager(runDir);
    this.eventLogger = new EventLogger(runDir);

    // Use existing main session (created by `orchestral start`)
    this.tmuxManager = new TmuxManager(
      this.config.global.tmux_session_prefix,
      this.projectRoot
    );

    // Generate prompt files
    await this.generatePrompts(runId);

    // Session should already exist from `orchestral start`
    // If not, create it (for backwards compatibility)
    if (!this.tmuxManager.sessionExists()) {
      this.tmuxManager.createSession();
    }

    // Set up file watcher
    this.fileWatcher = new FileWatcher(runDir);
    this.setupFileWatcherListeners();
    this.fileWatcher.start();

    // Set up agent monitor
    this.agentMonitor = new AgentMonitor(this.tmuxManager, this.timeoutConfig);
    this.setupAgentMonitorListeners();
    this.agentMonitor.start();

    // Set up output streamer
    this.outputStreamer = new OutputStreamer(this.tmuxManager);
    this.setupOutputStreamerListeners();
    this.outputStreamer.startStreaming(runId);

    this.isRunning = true;
    this.emitEvent({ type: 'run_started', runId });

    // Start the pipeline with Refiner
    await this.startRefiner();

    return runId;
  }

  /**
   * Resume a run (after VCR submission)
   */
  async resumeRun(runId: string): Promise<void> {
    const runDir = this.runManager.getRunDir(runId);
    this.stateManager = new StateManager(runDir);
    const state = this.stateManager.loadState();

    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    if (state.phase !== 'waiting_human') {
      throw new Error(`Run ${runId} is not waiting for human input`);
    }

    this.currentRunId = runId;
    this.eventLogger = new EventLogger(runDir);
    this.tmuxManager = new TmuxManager(
      this.config.global.tmux_session_prefix,
      this.projectRoot
    );

    // Restart file watcher
    this.fileWatcher = new FileWatcher(runDir);
    this.setupFileWatcherListeners();
    this.fileWatcher.start();

    // Restart agent monitor
    this.agentMonitor = new AgentMonitor(this.tmuxManager, this.timeoutConfig);
    this.setupAgentMonitorListeners();
    this.agentMonitor.start();

    // Restart output streamer
    this.outputStreamer = new OutputStreamer(this.tmuxManager);
    this.setupOutputStreamerListeners();
    this.outputStreamer.startStreaming(runId);

    this.isRunning = true;

    // Clear pending CRP and determine which agent to restart
    const pendingCrp = state.pending_crp;
    this.stateManager.setPendingCRP(null);

    // Determine which agent created the CRP and restart from there
    const crps = this.runManager.listCRPs(runId);
    const resolvedCrp = crps.find(c => c.crp_id === pendingCrp);

    if (resolvedCrp) {
      switch (resolvedCrp.created_by) {
        case 'refiner':
          await this.startRefiner();
          break;
        case 'builder':
          await this.startBuilder();
          break;
        case 'verifier':
          await this.startVerifier();
          break;
        case 'gatekeeper':
          await this.startGatekeeper();
          break;
      }
    }

    this.emitEvent({ type: 'vcr_received', vcrId: pendingCrp || '', runId });
  }

  /**
   * Stop the current run
   */
  async stopRun(): Promise<void> {
    if (this.outputStreamer) {
      this.outputStreamer.stopStreaming();
      this.outputStreamer = null;
    }

    if (this.agentMonitor) {
      this.agentMonitor.stop();
      this.agentMonitor = null;
    }

    if (this.fileWatcher) {
      await this.fileWatcher.stop();
      this.fileWatcher = null;
    }

    if (this.tmuxManager) {
      this.tmuxManager.killSession();
      this.tmuxManager = null;
    }

    this.isRunning = false;
    this.currentRunId = null;
    this.stateManager = null;
    this.eventLogger = null;
  }

  /**
   * Get current run state
   */
  getCurrentState(): RunState | null {
    return this.stateManager?.loadState() || null;
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
   * Generate prompt files for all agents
   */
  private async generatePrompts(runId: string): Promise<void> {
    const runDir = this.runManager.getRunDir(runId);
    const promptsDir = join(runDir, 'prompts');

    const context = {
      project_root: this.projectRoot,
      run_id: runId,
      config: this.config,
      iteration: 1,
    };

    this.promptGenerator.generateAllPrompts(promptsDir, context);
  }

  /**
   * Set up file watcher event listeners
   */
  private setupFileWatcherListeners(): void {
    if (!this.fileWatcher) return;

    this.fileWatcher.on('event', async (event: WatchEvent) => {
      try {
        await this.handleWatchEvent(event);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        this.emitEvent({ type: 'error', error: errMsg, runId: this.currentRunId || '' });
      }
    });
  }

  /**
   * Set up agent monitor event listeners
   */
  private setupAgentMonitorListeners(): void {
    if (!this.agentMonitor) return;

    this.agentMonitor.on('monitor_event', (event: AgentMonitorEvent) => {
      const runId = this.currentRunId || '';

      switch (event.type) {
        case 'timeout':
          this.emitEvent({ type: 'agent_timeout', agent: event.agent, runId });
          // Mark agent as failed
          if (this.stateManager) {
            this.stateManager.updateAgentStatus(event.agent, 'failed');
          }
          break;

        case 'stale':
          this.emitEvent({
            type: 'agent_stale',
            agent: event.agent,
            inactiveMs: event.inactiveMs,
            runId,
          });
          break;

        case 'process_ended':
          // Process ended without done.flag - might be an error
          // The file watcher will handle normal completion
          break;
      }
    });
  }

  /**
   * Set up output streamer event listeners
   */
  private setupOutputStreamerListeners(): void {
    if (!this.outputStreamer) return;

    this.outputStreamer.on('output', (event: AgentOutputEvent) => {
      if (event.isNew && this.currentRunId) {
        this.emitEvent({
          type: 'agent_output',
          agent: event.agent,
          content: event.content,
          runId: this.currentRunId,
        });
      }
    });

    this.outputStreamer.on('error', (event: { agent: AgentName; error: string }) => {
      this.emitEvent({
        type: 'error',
        error: `Output capture error for ${event.agent}: ${event.error}`,
        runId: this.currentRunId || '',
      });
    });
  }

  /**
   * Handle file watcher events
   */
  private async handleWatchEvent(event: WatchEvent): Promise<void> {
    const runId = this.currentRunId;
    if (!runId || !this.stateManager) return;

    switch (event.type) {
      case 'refiner_done':
        this.agentMonitor?.unwatchAgent('refiner');
        this.stateManager.updateAgentStatus('refiner', 'completed');
        this.emitEvent({ type: 'agent_completed', agent: 'refiner', runId });
        await this.transitionToPhase('build');
        break;

      case 'builder_done':
        this.agentMonitor?.unwatchAgent('builder');
        this.stateManager.updateAgentStatus('builder', 'completed');
        this.emitEvent({ type: 'agent_completed', agent: 'builder', runId });
        await this.transitionToPhase('verify');
        break;

      case 'verifier_done':
        this.agentMonitor?.unwatchAgent('verifier');
        this.stateManager.updateAgentStatus('verifier', 'completed');
        this.emitEvent({ type: 'agent_completed', agent: 'verifier', runId });
        await this.transitionToPhase('gate');
        break;

      case 'gatekeeper_done':
        this.agentMonitor?.unwatchAgent('gatekeeper');
        this.stateManager.updateAgentStatus('gatekeeper', 'completed');
        this.emitEvent({ type: 'agent_completed', agent: 'gatekeeper', runId });
        await this.handleGatekeeperVerdict(event.verdict);
        break;

      case 'crp_created':
        // Stop monitoring the agent that created the CRP
        this.agentMonitor?.unwatchAgent(event.crp.created_by);
        // Update agent status to waiting_human
        this.stateManager.updateAgentStatus(event.crp.created_by, 'pending');
        // Set pending CRP (this also sets phase to waiting_human)
        this.stateManager.setPendingCRP(event.crp.crp_id);
        // Emit events
        this.emitEvent({ type: 'crp_created', crpId: event.crp.crp_id, runId });
        this.emitEvent({ type: 'phase_changed', phase: 'waiting_human', runId });
        // Terminal bell notification for human attention
        if (this.config.global.log_level !== 'error') {
          process.stdout.write('\x07'); // Terminal bell
        }
        break;

      case 'vcr_created':
        // VCR creation is handled by API, which calls resumeRun
        break;

      case 'mrp_created':
        this.emitEvent({ type: 'mrp_ready', runId });
        break;

      case 'error_flag':
        // Handle agent error flag
        const agentName = event.agent as AgentName;
        this.agentMonitor?.unwatchAgent(agentName);
        this.stateManager.updateAgentStatus(agentName, 'failed', event.errorFlag.message);
        this.stateManager.addError(`${agentName}: ${event.errorFlag.message}`);
        this.emitEvent({
          type: 'agent_failed',
          agent: agentName,
          errorFlag: event.errorFlag,
          runId,
        });

        // Check if we should auto-retry
        if (
          event.errorFlag.recoverable &&
          this.config.global.auto_retry.enabled &&
          this.config.global.auto_retry.recoverable_errors.includes(event.errorFlag.error_type)
        ) {
          // Auto-retry logic would go here
          // For now, just emit the error and let the human decide
        }

        // Terminal bell notification
        if (this.config.global.notifications.terminal_bell) {
          process.stdout.write('\x07');
        }
        break;

      case 'error':
        this.emitEvent({ type: 'error', error: event.error, runId });
        break;
    }
  }

  /**
   * Transition to a new phase
   */
  private async transitionToPhase(phase: Phase): Promise<void> {
    if (!this.stateManager || !this.currentRunId) return;

    this.stateManager.updatePhase(phase);
    this.emitEvent({ type: 'phase_changed', phase, runId: this.currentRunId });

    switch (phase) {
      case 'build':
        await this.startBuilder();
        break;
      case 'verify':
        await this.startVerifier();
        break;
      case 'gate':
        await this.startGatekeeper();
        break;
    }
  }

  /**
   * Handle Gatekeeper verdict
   */
  private async handleGatekeeperVerdict(verdict: GatekeeperVerdict): Promise<void> {
    if (!this.stateManager || !this.currentRunId) return;

    switch (verdict.verdict) {
      case 'PASS':
        // Generate MRP
        const runDir = this.runManager.getRunDir(this.currentRunId);
        const mrpGenerator = new MRPGenerator(runDir, this.projectRoot);
        mrpGenerator.generate();

        this.stateManager.updatePhase('ready_for_merge');
        this.emitEvent({ type: 'mrp_ready', runId: this.currentRunId });
        this.emitEvent({ type: 'run_completed', runId: this.currentRunId, verdict: 'PASS' });

        // Terminal bell notification
        process.stdout.write('\x07');
        break;

      case 'FAIL':
        if (this.stateManager.isMaxIterationsExceeded()) {
          this.stateManager.updatePhase('failed');
          this.eventLogger?.logIterationExhausted(
            this.stateManager.loadState()?.iteration || 0,
            this.stateManager.loadState()?.max_iterations || 0
          );
          this.emitEvent({ type: 'run_completed', runId: this.currentRunId, verdict: 'FAIL' });
          // Terminal bell notification
          process.stdout.write('\x07');
        } else {
          // Retry from Builder
          this.stateManager.incrementIteration();
          const state = this.stateManager.loadState();
          this.emitEvent({
            type: 'iteration_started',
            iteration: state?.iteration || 1,
            runId: this.currentRunId,
          });

          // Regenerate prompts with updated context
          await this.regeneratePromptsForRetry();
          await this.transitionToPhase('build');
        }
        break;

      case 'NEEDS_HUMAN':
        // CRP should have been created, phase transition handled by crp_created event
        break;
    }
  }

  /**
   * Regenerate prompts for retry iteration
   */
  private async regeneratePromptsForRetry(): Promise<void> {
    if (!this.currentRunId || !this.stateManager) return;

    const runDir = this.runManager.getRunDir(this.currentRunId);
    const promptsDir = join(runDir, 'prompts');
    const state = this.stateManager.loadState();

    const context = {
      project_root: this.projectRoot,
      run_id: this.currentRunId,
      config: this.config,
      iteration: state?.iteration || 1,
      has_review: true,
    };

    this.promptGenerator.generateAllPrompts(promptsDir, context);
  }

  /**
   * Start Refiner agent
   */
  private async startRefiner(): Promise<void> {
    if (!this.tmuxManager || !this.stateManager || !this.currentRunId) return;

    this.stateManager.updateAgentStatus('refiner', 'running');
    this.emitEvent({ type: 'agent_started', agent: 'refiner', runId: this.currentRunId });

    // Start monitoring this agent
    this.agentMonitor?.watchAgent('refiner');

    const runDir = this.runManager.getRunDir(this.currentRunId);
    const promptFile = join(runDir, 'prompts', 'refiner.md');

    this.tmuxManager.startAgent('refiner', this.config.refiner.model, promptFile);
  }

  /**
   * Start Builder agent
   */
  private async startBuilder(): Promise<void> {
    if (!this.tmuxManager || !this.stateManager || !this.currentRunId) return;

    this.stateManager.updateAgentStatus('builder', 'running');
    this.emitEvent({ type: 'agent_started', agent: 'builder', runId: this.currentRunId });

    // Start monitoring this agent
    this.agentMonitor?.watchAgent('builder');

    const runDir = this.runManager.getRunDir(this.currentRunId);
    const promptFile = join(runDir, 'prompts', 'builder.md');

    this.tmuxManager.startAgent('builder', this.config.builder.model, promptFile);
  }

  /**
   * Start Verifier agent
   */
  private async startVerifier(): Promise<void> {
    if (!this.tmuxManager || !this.stateManager || !this.currentRunId) return;

    this.stateManager.updateAgentStatus('verifier', 'running');
    this.emitEvent({ type: 'agent_started', agent: 'verifier', runId: this.currentRunId });

    // Start monitoring this agent
    this.agentMonitor?.watchAgent('verifier');

    const runDir = this.runManager.getRunDir(this.currentRunId);
    const promptFile = join(runDir, 'prompts', 'verifier.md');

    this.tmuxManager.startAgent('verifier', this.config.verifier.model, promptFile);
  }

  /**
   * Start Gatekeeper agent
   */
  private async startGatekeeper(): Promise<void> {
    if (!this.tmuxManager || !this.stateManager || !this.currentRunId) return;

    this.stateManager.updateAgentStatus('gatekeeper', 'running');
    this.emitEvent({ type: 'agent_started', agent: 'gatekeeper', runId: this.currentRunId });

    // Start monitoring this agent
    this.agentMonitor?.watchAgent('gatekeeper');

    const runDir = this.runManager.getRunDir(this.currentRunId);
    const promptFile = join(runDir, 'prompts', 'gatekeeper.md');

    this.tmuxManager.startAgent('gatekeeper', this.config.gatekeeper.model, promptFile);
  }

  /**
   * Emit typed event and log to events.log
   */
  private emitEvent(event: OrchestratorEvent): void {
    this.emit('orchestrator_event', event);

    // Log to events.log
    if (this.eventLogger) {
      switch (event.type) {
        case 'run_started':
          this.eventLogger.logRunStarted(event.runId);
          break;
        case 'phase_changed':
          this.eventLogger.log('INFO', 'phase.changed', { phase: event.phase });
          break;
        case 'agent_started':
          this.eventLogger.logAgentStarted(event.agent);
          break;
        case 'agent_completed':
          this.eventLogger.logAgentCompleted(event.agent);
          break;
        case 'agent_timeout':
          this.eventLogger.logAgentTimeout(event.agent, 0);
          break;
        case 'agent_failed':
          this.eventLogger.logAgentFailed(event.agent, event.errorFlag.error_type, event.errorFlag.message);
          break;
        case 'crp_created':
          this.eventLogger.logCRPCreated(event.crpId, 'refiner'); // Agent info not available in event
          break;
        case 'vcr_received':
          this.eventLogger.logVCRCreated(event.vcrId, '');
          break;
        case 'mrp_ready':
          this.eventLogger.logMRPCreated(event.runId);
          break;
        case 'run_completed':
          this.eventLogger.logRunCompleted(event.runId, event.verdict);
          break;
        case 'iteration_started':
          this.eventLogger.logIterationStarted(event.iteration, 3);
          break;
        case 'error':
          this.eventLogger.logError(event.error);
          break;
      }
    }
  }

  /**
   * Get tmux session name
   */
  getTmuxSessionName(): string | null {
    return this.tmuxManager?.getSessionName() || null;
  }

  /**
   * Get current agent outputs
   */
  getAgentOutputs(): Record<AgentName, string> | null {
    return this.outputStreamer?.getAllOutputs() || null;
  }

  /**
   * Get output for a specific agent
   */
  getAgentOutput(agent: AgentName): string | null {
    return this.outputStreamer?.getAgentOutput(agent) || null;
  }

  /**
   * Force capture output for a specific agent
   */
  forceCapture(agent: AgentName): string | null {
    return this.outputStreamer?.forceCapture(agent) || null;
  }

  /**
   * Get agent activity info
   */
  getAgentActivity(agent: AgentName): { lastActivity: Date; isStale: boolean } | null {
    return this.agentMonitor?.getActivityInfo(agent) || null;
  }
}
