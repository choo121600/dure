import type { OrchestraConfig, AgentName, AgentModel, AgentTimeoutConfig } from '../types/index.js';
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
import { EventCoordinator, CoordinatedEvent } from './event-coordinator.js';
import { RunManager } from './run-manager.js';
import { VerdictHandler } from './verdict-handler.js';
import { AgentCoordinator } from './agent-coordinator.js';
import { EventEmitter } from 'events';

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
  onFileWatchEvent: (event: WatchEvent) => void;
  onAgentMonitorEvent: (event: { type: string; agent: AgentName }) => void;
  onUsageUpdateEvent: (event: { agent: AgentName; usage: unknown }) => void;
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
 * Factory class for creating and wiring up all managers needed for a run.
 * Extracts the complex initialization logic from Orchestrator.
 */
export class ManagerFactory {
  /**
   * Create all managers needed for a run and wire them together.
   */
  static create(
    runDir: string,
    runId: string,
    deps: ManagerFactoryDeps,
    handlers: EventHandlers
  ): ManagerContext {
    // Create agent monitor
    const agentMonitor = new AgentMonitor(deps.tmuxManager, deps.timeoutConfig);
    agentMonitor.start();

    // Create agent lifecycle manager
    const agentLifecycle = new AgentLifecycleManager(
      deps.tmuxManager,
      deps.stateManager,
      agentMonitor,
      {
        projectRoot: deps.projectRoot,
        timeoutConfig: deps.timeoutConfig,
        selectedModels: deps.selectedModels,
      }
    );
    agentLifecycle.setRunId(runId);

    // Create and attach output streamer
    const outputStreamer = new OutputStreamer(deps.tmuxManager);
    agentLifecycle.setOutputStreamer(outputStreamer);
    agentLifecycle.startOutputStreaming(runId);

    // Create and attach usage tracker
    const usageTracker = new UsageTracker(deps.projectRoot);
    agentLifecycle.setUsageTracker(usageTracker);
    agentLifecycle.startUsageTracking();

    // Create phase manager
    const phaseManager = new PhaseTransitionManager(deps.stateManager);

    // Create verdict handler
    const verdictHandler = new VerdictHandler(
      phaseManager,
      deps.promptGenerator,
      deps.runManager,
      deps.config,
      deps.projectRoot
    );

    // Create agent coordinator
    const agentCoordinator = new AgentCoordinator(
      agentLifecycle,
      phaseManager,
      deps.runManager,
      deps.stateManager
    );

    // Create file watcher
    const fileWatcher = new FileWatcher(runDir);
    fileWatcher.start();

    // Create and configure event coordinator
    const eventCoordinator = new EventCoordinator();
    eventCoordinator.setFileWatcher(fileWatcher);
    eventCoordinator.setAgentMonitor(agentMonitor);
    eventCoordinator.setOutputStreamer(outputStreamer);
    eventCoordinator.setUsageTracker(usageTracker);
    eventCoordinator.setRetryManager(deps.retryManager);
    eventCoordinator.setEventLogger(deps.eventLogger);
    eventCoordinator.setRunId(runId);
    eventCoordinator.setHandlers({
      onFileWatchEvent: handlers.onFileWatchEvent,
      onAgentMonitorEvent: handlers.onAgentMonitorEvent,
      onUsageUpdateEvent: handlers.onUsageUpdateEvent,
    });
    eventCoordinator.setupListeners();
    eventCoordinator.on('coordinated_event', handlers.onCoordinatedEvent);

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

  /**
   * Cleanup all managers in a context.
   */
  static async cleanup(context: Partial<ManagerContext>, killSession: boolean, tmuxManager: TmuxManager | null): Promise<void> {
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
