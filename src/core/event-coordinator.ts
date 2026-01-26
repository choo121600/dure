import { EventEmitter } from 'events';
import type { AgentName, AgentOutputEvent, Phase, GatekeeperVerdict, UsageInfo, TotalUsage, ModelSelectionResult } from '../types/index.js';
import { FileWatcher, WatchEvent, ErrorFlag } from './file-watcher.js';
import { AgentMonitor, AgentMonitorEvent } from './agent-monitor.js';
import { OutputStreamer } from './output-streamer.js';
import { UsageTracker, UsageUpdateEvent } from './usage-tracker.js';
import { EventLogger } from './event-logger.js';
import { RetryManager, RetryEvent } from './retry-manager.js';

/**
 * Unified event types for the orchestration system
 */
export type CoordinatedEvent =
  // Run lifecycle events
  | { type: 'run_started'; runId: string }
  | { type: 'run_completed'; runId: string; verdict: 'PASS' | 'FAIL' }
  // Phase events
  | { type: 'phase_changed'; phase: Phase; runId: string }
  | { type: 'iteration_started'; iteration: number; runId: string }
  // Agent lifecycle events
  | { type: 'agent_started'; agent: AgentName; runId: string }
  | { type: 'agent_completed'; agent: AgentName; runId: string }
  | { type: 'agent_timeout'; agent: AgentName; runId: string }
  | { type: 'agent_stale'; agent: AgentName; inactiveMs: number; runId: string }
  | { type: 'agent_failed'; agent: AgentName; errorFlag: ErrorFlag; runId: string }
  // Agent output events
  | { type: 'agent_output'; agent: AgentName; content: string; runId: string }
  // Retry events
  | { type: 'agent_retry'; agent: AgentName; attempt: number; maxAttempts: number; runId: string }
  | { type: 'agent_retry_success'; agent: AgentName; attempt: number; runId: string }
  | { type: 'agent_retry_exhausted'; agent: AgentName; totalAttempts: number; runId: string }
  // CRP/VCR/MRP events
  | { type: 'crp_created'; crpId: string; runId: string }
  | { type: 'vcr_received'; vcrId: string; runId: string }
  | { type: 'mrp_ready'; runId: string }
  // Usage events
  | { type: 'usage_updated'; agent: AgentName; usage: UsageInfo; total: TotalUsage; runId: string }
  // Model selection events
  | { type: 'models_selected'; result: ModelSelectionResult; runId: string }
  // Error events
  | { type: 'error'; error: string; runId: string };

/**
 * Handler functions for different event sources
 */
export interface EventHandlers {
  onFileWatchEvent?: (event: WatchEvent) => Promise<void>;
  onAgentMonitorEvent?: (event: AgentMonitorEvent) => void;
  onOutputEvent?: (event: AgentOutputEvent) => void;
  onUsageUpdateEvent?: (event: UsageUpdateEvent) => void;
  onRetryEvent?: (event: RetryEvent) => void;
}

/**
 * EventCoordinator centralizes all event listening and routing.
 * It listens to events from multiple sources and translates them
 * into a unified event stream.
 */
export class EventCoordinator extends EventEmitter {
  private fileWatcher: FileWatcher | null = null;
  private agentMonitor: AgentMonitor | null = null;
  private outputStreamer: OutputStreamer | null = null;
  private usageTracker: UsageTracker | null = null;
  private retryManager: RetryManager | null = null;
  private eventLogger: EventLogger | null = null;
  private handlers: EventHandlers = {};
  private currentRunId: string | null = null;
  private listenersSetup = false;

  // Store bound listener references for cleanup
  private boundListeners: {
    fileWatcher?: (event: WatchEvent) => void;
    agentMonitor?: (event: AgentMonitorEvent) => void;
    outputStreamer?: (event: AgentOutputEvent) => void;
    outputError?: (event: { agent: AgentName; error: string }) => void;
    usageTracker?: (event: UsageUpdateEvent) => void;
    retryManager?: (event: RetryEvent) => void;
  } = {};

  constructor() {
    super();
  }

  /**
   * Set the file watcher to listen to
   */
  setFileWatcher(watcher: FileWatcher): void {
    this.fileWatcher = watcher;
  }

  /**
   * Set the agent monitor to listen to
   */
  setAgentMonitor(monitor: AgentMonitor): void {
    this.agentMonitor = monitor;
  }

  /**
   * Set the output streamer to listen to
   */
  setOutputStreamer(streamer: OutputStreamer): void {
    this.outputStreamer = streamer;
  }

  /**
   * Set the usage tracker to listen to
   */
  setUsageTracker(tracker: UsageTracker): void {
    this.usageTracker = tracker;
  }

  /**
   * Set the retry manager to listen to
   */
  setRetryManager(manager: RetryManager): void {
    this.retryManager = manager;
  }

  /**
   * Set the event logger for logging events
   */
  setEventLogger(logger: EventLogger): void {
    this.eventLogger = logger;
  }

  /**
   * Set custom event handlers
   */
  setHandlers(handlers: EventHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Set the current run ID
   */
  setRunId(runId: string): void {
    this.currentRunId = runId;
  }

  /**
   * Set up all event listeners
   */
  setupListeners(): void {
    if (this.listenersSetup) {
      this.teardownListeners();
    }

    this.setupFileWatcherListeners();
    this.setupAgentMonitorListeners();
    this.setupOutputStreamerListeners();
    this.setupUsageTrackerListeners();
    this.setupRetryManagerListeners();

    this.listenersSetup = true;
  }

  /**
   * Tear down all event listeners
   */
  teardownListeners(): void {
    if (this.fileWatcher && this.boundListeners.fileWatcher) {
      this.fileWatcher.off('event', this.boundListeners.fileWatcher);
    }

    if (this.agentMonitor && this.boundListeners.agentMonitor) {
      this.agentMonitor.off('monitor_event', this.boundListeners.agentMonitor);
    }

    if (this.outputStreamer) {
      if (this.boundListeners.outputStreamer) {
        this.outputStreamer.off('output', this.boundListeners.outputStreamer);
      }
      if (this.boundListeners.outputError) {
        this.outputStreamer.off('error', this.boundListeners.outputError);
      }
    }

    if (this.usageTracker && this.boundListeners.usageTracker) {
      this.usageTracker.off('usage_update', this.boundListeners.usageTracker);
    }

    if (this.retryManager && this.boundListeners.retryManager) {
      this.retryManager.off('retry_event', this.boundListeners.retryManager);
    }

    this.boundListeners = {};
    this.listenersSetup = false;
  }

  /**
   * Set up file watcher event listeners
   */
  private setupFileWatcherListeners(): void {
    if (!this.fileWatcher) return;

    this.boundListeners.fileWatcher = async (event: WatchEvent) => {
      try {
        // Call custom handler if provided
        if (this.handlers.onFileWatchEvent) {
          await this.handlers.onFileWatchEvent(event);
        }

        // The custom handler is responsible for emitting appropriate events
        // This coordinator just routes the raw events
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        this.emitCoordinatedEvent({ type: 'error', error: errMsg, runId: this.currentRunId || '' });
      }
    };

    this.fileWatcher.on('event', this.boundListeners.fileWatcher);
  }

  /**
   * Set up agent monitor event listeners
   */
  private setupAgentMonitorListeners(): void {
    if (!this.agentMonitor) return;

    this.boundListeners.agentMonitor = (event: AgentMonitorEvent) => {
      const runId = this.currentRunId || '';

      // Call custom handler if provided
      if (this.handlers.onAgentMonitorEvent) {
        this.handlers.onAgentMonitorEvent(event);
      }

      // Translate monitor events to coordinated events
      switch (event.type) {
        case 'timeout':
          this.emitCoordinatedEvent({ type: 'agent_timeout', agent: event.agent, runId });
          break;
        case 'stale':
          this.emitCoordinatedEvent({
            type: 'agent_stale',
            agent: event.agent,
            inactiveMs: event.inactiveMs,
            runId,
          });
          break;
        case 'process_ended':
          // Process ended events are informational - the file watcher handles completion
          break;
      }
    };

    this.agentMonitor.on('monitor_event', this.boundListeners.agentMonitor);
  }

  /**
   * Set up output streamer event listeners
   */
  private setupOutputStreamerListeners(): void {
    if (!this.outputStreamer) return;

    this.boundListeners.outputStreamer = (event: AgentOutputEvent) => {
      // Call custom handler if provided
      if (this.handlers.onOutputEvent) {
        this.handlers.onOutputEvent(event);
      }

      // Only emit for new output
      if (event.isNew && this.currentRunId) {
        this.emitCoordinatedEvent({
          type: 'agent_output',
          agent: event.agent,
          content: event.content,
          runId: this.currentRunId,
        });
      }
    };

    this.boundListeners.outputError = (event: { agent: AgentName; error: string }) => {
      this.emitCoordinatedEvent({
        type: 'error',
        error: `Output capture error for ${event.agent}: ${event.error}`,
        runId: this.currentRunId || '',
      });
    };

    this.outputStreamer.on('output', this.boundListeners.outputStreamer);
    this.outputStreamer.on('error', this.boundListeners.outputError);
  }

  /**
   * Set up usage tracker event listeners
   */
  private setupUsageTrackerListeners(): void {
    if (!this.usageTracker) return;

    this.boundListeners.usageTracker = (event: UsageUpdateEvent) => {
      // Call custom handler if provided
      if (this.handlers.onUsageUpdateEvent) {
        this.handlers.onUsageUpdateEvent(event);
      }

      // Get total usage for the event
      const totalUsage = this.usageTracker?.getTotalUsage() || {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_creation_tokens: 0,
        total_cache_read_tokens: 0,
        total_cost_usd: 0,
      };

      if (this.currentRunId) {
        this.emitCoordinatedEvent({
          type: 'usage_updated',
          agent: event.agent,
          usage: event.usage,
          total: totalUsage,
          runId: this.currentRunId,
        });
      }
    };

    this.usageTracker.on('usage_update', this.boundListeners.usageTracker);
  }

  /**
   * Set up retry manager event listeners
   */
  private setupRetryManagerListeners(): void {
    if (!this.retryManager) return;

    this.boundListeners.retryManager = (event: RetryEvent) => {
      const runId = this.currentRunId || '';

      // Call custom handler if provided
      if (this.handlers.onRetryEvent) {
        this.handlers.onRetryEvent(event);
      }

      // Translate retry events to coordinated events
      switch (event.type) {
        case 'retry_started':
          this.emitCoordinatedEvent({
            type: 'agent_retry',
            agent: event.context.agent,
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            runId,
          });
          break;
        case 'retry_success':
          this.emitCoordinatedEvent({
            type: 'agent_retry_success',
            agent: event.context.agent,
            attempt: event.attempt,
            runId,
          });
          break;
        case 'retry_exhausted':
          this.emitCoordinatedEvent({
            type: 'agent_retry_exhausted',
            agent: event.context.agent,
            totalAttempts: event.totalAttempts,
            runId,
          });
          break;
      }
    };

    this.retryManager.on('retry_event', this.boundListeners.retryManager);
  }

  /**
   * Emit a coordinated event and log it
   */
  emitCoordinatedEvent(event: CoordinatedEvent): void {
    this.emit('coordinated_event', event);
    this.logEvent(event);
  }

  /**
   * Log event to EventLogger
   */
  private logEvent(event: CoordinatedEvent): void {
    if (!this.eventLogger) return;

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
        this.eventLogger.logCRPCreated(event.crpId, 'refiner');
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
      case 'usage_updated':
        this.eventLogger.log('INFO', 'usage.updated', {
          agent: event.agent,
          input_tokens: event.usage.input_tokens,
          output_tokens: event.usage.output_tokens,
          cost_usd: event.usage.cost_usd,
        });
        break;
      case 'error':
        this.eventLogger.logError(event.error);
        break;
    }
  }

  /**
   * Clean up all resources
   */
  cleanup(): void {
    this.teardownListeners();
    this.fileWatcher = null;
    this.agentMonitor = null;
    this.outputStreamer = null;
    this.usageTracker = null;
    this.retryManager = null;
    this.eventLogger = null;
    this.handlers = {};
    this.currentRunId = null;
  }
}
