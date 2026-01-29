import type { OrchestraConfig, AgentName, AgentModel, AgentTimeoutConfig, UsageInfo } from '../types/index.js';
import { StateManager } from './state-manager.js';
import { TmuxManager } from './tmux-manager.js';
import { FileWatcher, WatchEvent } from './file-watcher.js';
import { PromptGenerator } from '../agents/prompt-generator.js';
import { AgentMonitor } from './agent-monitor.js';
import { OutputStreamer } from './output-streamer.js';
import { EventLogger } from './event-logger.js';
import { UsageTracker } from './usage-tracker.js';
import { RetryManager } from './retry-manager.js';
import { AgentLifecycleManager } from './agent-lifecycle-manager.js';
import { PhaseTransitionManager } from './phase-transition-manager.js';
import { EventCoordinator, CoordinatedEvent, EventHandlers as CoordinatorEventHandlers } from './event-coordinator.js';
import { RunManager } from './run-manager.js';
import { VerdictHandler } from './verdict-handler.js';
import { AgentCoordinator } from './agent-coordinator.js';

export interface ManagerFactoryDeps {
  tmuxManager: TmuxManager;
  stateManager: StateManager;
  selectedModels: Record<AgentName, AgentModel>;
  eventLogger: EventLogger;
  promptGenerator: PromptGenerator;
  runManager: RunManager;
  retryManager: RetryManager;
  config: OrchestraConfig;
  projectRoot: string;
  timeoutConfig: AgentTimeoutConfig;
}

export interface EventHandlers {
  onFileWatchEvent: (event: WatchEvent) => Promise<void>;
  onAgentMonitorEvent: (event: { type: string; agent: AgentName }) => void;
  onUsageUpdateEvent: (event: { agent: AgentName; usage: UsageInfo }) => void;
  onCoordinatedEvent: (event: CoordinatedEvent) => void;
}

export interface ManagerContext {
  agentLifecycle: AgentLifecycleManager;
  phaseManager: PhaseTransitionManager;
  verdictHandler: VerdictHandler;
  agentCoordinator: AgentCoordinator;
  fileWatcher: FileWatcher;
  eventCoordinator: EventCoordinator;
  agentMonitor: AgentMonitor;
}

/**
 * Configuration for ManagerBuilder
 */
interface ManagerBuilderConfig {
  runDir: string;
  runId: string;
  deps: ManagerFactoryDeps;
  handlers: EventHandlers;
}

/**
 * Intermediate state during build process
 */
interface BuildState {
  agentMonitor?: AgentMonitor;
  agentLifecycle?: AgentLifecycleManager;
  outputStreamer?: OutputStreamer;
  usageTracker?: UsageTracker;
  phaseManager?: PhaseTransitionManager;
  verdictHandler?: VerdictHandler;
  agentCoordinator?: AgentCoordinator;
  fileWatcher?: FileWatcher;
  eventCoordinator?: EventCoordinator;
}

/**
 * Builder class for creating ManagerContext with fluent API.
 * Provides fine-grained control over manager creation.
 */
export class ManagerBuilder {
  private config: ManagerBuilderConfig;
  private state: BuildState = {};
  private includeAgentMonitor = true;
  private includeFileWatcher = true;
  private includeEventCoordinator = true;

  constructor(config: ManagerBuilderConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validate required configuration
   */
  private validateConfig(config: ManagerBuilderConfig): void {
    const missing: string[] = [];

    if (!config.runDir) missing.push('runDir');
    if (!config.runId) missing.push('runId');
    if (!config.deps) missing.push('deps');
    if (!config.handlers) missing.push('handlers');

    if (config.deps) {
      if (!config.deps.tmuxManager) missing.push('deps.tmuxManager');
      if (!config.deps.stateManager) missing.push('deps.stateManager');
      if (!config.deps.selectedModels) missing.push('deps.selectedModels');
      if (!config.deps.eventLogger) missing.push('deps.eventLogger');
      if (!config.deps.promptGenerator) missing.push('deps.promptGenerator');
      if (!config.deps.runManager) missing.push('deps.runManager');
      if (!config.deps.retryManager) missing.push('deps.retryManager');
      if (!config.deps.config) missing.push('deps.config');
      if (!config.deps.projectRoot) missing.push('deps.projectRoot');
      if (!config.deps.timeoutConfig) missing.push('deps.timeoutConfig');
    }

    if (config.handlers) {
      if (!config.handlers.onFileWatchEvent) missing.push('handlers.onFileWatchEvent');
      if (!config.handlers.onAgentMonitorEvent) missing.push('handlers.onAgentMonitorEvent');
      if (!config.handlers.onUsageUpdateEvent) missing.push('handlers.onUsageUpdateEvent');
      if (!config.handlers.onCoordinatedEvent) missing.push('handlers.onCoordinatedEvent');
    }

    if (missing.length > 0) {
      throw new Error(`ManagerBuilder: Missing required configuration: ${missing.join(', ')}`);
    }
  }

  /**
   * Configure agent monitor settings
   */
  withAgentMonitor(include = true): this {
    this.includeAgentMonitor = include;
    return this;
  }

  /**
   * Configure file watcher settings
   */
  withFileWatcher(include = true): this {
    this.includeFileWatcher = include;
    return this;
  }

  /**
   * Configure event coordinator settings
   */
  withEventCoordinator(include = true): this {
    this.includeEventCoordinator = include;
    return this;
  }

  /**
   * Create AgentMonitor
   */
  private createAgentMonitor(): AgentMonitor {
    const monitor = new AgentMonitor(
      this.config.deps.tmuxManager,
      this.config.deps.timeoutConfig
    );
    monitor.start();
    return monitor;
  }

  /**
   * Create AgentLifecycleManager with dependencies
   */
  private createAgentLifecycle(agentMonitor: AgentMonitor): AgentLifecycleManager {
    const lifecycle = new AgentLifecycleManager(
      this.config.deps.tmuxManager,
      this.config.deps.stateManager,
      agentMonitor,
      {
        projectRoot: this.config.deps.projectRoot,
        timeoutConfig: this.config.deps.timeoutConfig,
        selectedModels: this.config.deps.selectedModels,
      }
    );
    lifecycle.setRunId(this.config.runId);
    return lifecycle;
  }

  /**
   * Create OutputStreamer and attach to lifecycle
   */
  private createOutputStreamer(agentLifecycle: AgentLifecycleManager): OutputStreamer {
    const streamer = new OutputStreamer(this.config.deps.tmuxManager);
    agentLifecycle.setOutputStreamer(streamer);
    agentLifecycle.startOutputStreaming(this.config.runId);
    return streamer;
  }

  /**
   * Create UsageTracker and attach to lifecycle
   */
  private createUsageTracker(agentLifecycle: AgentLifecycleManager): UsageTracker {
    const tracker = new UsageTracker();
    agentLifecycle.setUsageTracker(tracker);
    agentLifecycle.startUsageTracking();
    return tracker;
  }

  /**
   * Create PhaseTransitionManager
   */
  private createPhaseManager(): PhaseTransitionManager {
    return new PhaseTransitionManager(this.config.deps.stateManager);
  }

  /**
   * Create VerdictHandler
   */
  private createVerdictHandler(phaseManager: PhaseTransitionManager): VerdictHandler {
    return new VerdictHandler(
      phaseManager,
      this.config.deps.promptGenerator,
      this.config.deps.runManager,
      this.config.deps.config,
      this.config.deps.projectRoot
    );
  }

  /**
   * Create AgentCoordinator
   */
  private createAgentCoordinator(
    agentLifecycle: AgentLifecycleManager,
    phaseManager: PhaseTransitionManager
  ): AgentCoordinator {
    return new AgentCoordinator(
      agentLifecycle,
      phaseManager,
      this.config.deps.runManager,
      this.config.deps.stateManager
    );
  }

  /**
   * Create FileWatcher
   */
  private createFileWatcher(): FileWatcher {
    const watcher = new FileWatcher(this.config.runDir);
    watcher.start();
    return watcher;
  }

  /**
   * Create and configure EventCoordinator
   */
  private createEventCoordinator(
    fileWatcher: FileWatcher,
    agentMonitor: AgentMonitor,
    outputStreamer: OutputStreamer,
    usageTracker: UsageTracker
  ): EventCoordinator {
    const coordinator = new EventCoordinator();
    coordinator.setFileWatcher(fileWatcher);
    coordinator.setAgentMonitor(agentMonitor);
    coordinator.setOutputStreamer(outputStreamer);
    coordinator.setUsageTracker(usageTracker);
    coordinator.setRetryManager(this.config.deps.retryManager);
    coordinator.setEventLogger(this.config.deps.eventLogger);
    coordinator.setRunId(this.config.runId);
    coordinator.setHandlers({
      onFileWatchEvent: this.config.handlers.onFileWatchEvent,
      onAgentMonitorEvent: this.config.handlers.onAgentMonitorEvent,
      onUsageUpdateEvent: this.config.handlers.onUsageUpdateEvent,
    });
    coordinator.setupListeners();
    coordinator.on('coordinated_event', this.config.handlers.onCoordinatedEvent);
    return coordinator;
  }

  /**
   * Build and return the complete ManagerContext
   */
  build(): ManagerContext {
    // Create agent monitor
    const agentMonitor = this.createAgentMonitor();
    this.state.agentMonitor = agentMonitor;

    // Create agent lifecycle
    const agentLifecycle = this.createAgentLifecycle(agentMonitor);
    this.state.agentLifecycle = agentLifecycle;

    // Create and attach output streamer
    const outputStreamer = this.createOutputStreamer(agentLifecycle);
    this.state.outputStreamer = outputStreamer;

    // Create and attach usage tracker
    const usageTracker = this.createUsageTracker(agentLifecycle);
    this.state.usageTracker = usageTracker;

    // Create phase manager
    const phaseManager = this.createPhaseManager();
    this.state.phaseManager = phaseManager;

    // Create verdict handler
    const verdictHandler = this.createVerdictHandler(phaseManager);
    this.state.verdictHandler = verdictHandler;

    // Create agent coordinator
    const agentCoordinator = this.createAgentCoordinator(agentLifecycle, phaseManager);
    this.state.agentCoordinator = agentCoordinator;

    // Create file watcher
    const fileWatcher = this.createFileWatcher();
    this.state.fileWatcher = fileWatcher;

    // Create event coordinator
    const eventCoordinator = this.createEventCoordinator(
      fileWatcher,
      agentMonitor,
      outputStreamer,
      usageTracker
    );
    this.state.eventCoordinator = eventCoordinator;

    return {
      agentLifecycle,
      phaseManager,
      verdictHandler,
      agentCoordinator,
      fileWatcher,
      eventCoordinator,
      agentMonitor,
    };
  }
}

/**
 * Factory class for creating and wiring up all managers needed for a run.
 * Extracts the complex initialization logic from Orchestrator.
 */
export class ManagerFactory {
  /**
   * Create a new ManagerBuilder for fluent configuration
   */
  static builder(
    runDir: string,
    runId: string,
    deps: ManagerFactoryDeps,
    handlers: EventHandlers
  ): ManagerBuilder {
    return new ManagerBuilder({ runDir, runId, deps, handlers });
  }

  /**
   * Create all managers needed for a run and wire them together.
   * This is a convenience method that uses the builder with default settings.
   */
  static create(
    runDir: string,
    runId: string,
    deps: ManagerFactoryDeps,
    handlers: EventHandlers
  ): ManagerContext {
    return this.builder(runDir, runId, deps, handlers).build();
  }

  /**
   * Cleanup all managers in a context.
   */
  static async cleanup(
    context: Partial<ManagerContext>,
    killSession: boolean,
    tmuxManager: TmuxManager | null
  ): Promise<void> {
    context.agentLifecycle?.cleanup();
    context.eventCoordinator?.cleanup();
    if (context.fileWatcher) {
      await context.fileWatcher.stop();
    }
    if (killSession && tmuxManager) {
      tmuxManager.killSession();
    }
  }
}
