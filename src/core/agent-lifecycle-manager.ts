import { EventEmitter } from 'events';
import { join } from 'path';
import type { AgentName, AgentModel, AgentTimeoutConfig, ModelSelectionResult, TestOutput, UsageInfo, ClaudeCodeOutput } from '../types/index.js';
import { TmuxManager } from './tmux-manager.js';
import { StateManager } from './state-manager.js';
import { AgentMonitor } from './agent-monitor.js';
import { OutputStreamer } from './output-streamer.js';
import { UsageTracker, UsageUpdateEvent } from './usage-tracker.js';

export type AgentLifecycleEvent =
  | { type: 'agent_starting'; agent: AgentName }
  | { type: 'agent_started'; agent: AgentName }
  | { type: 'agent_stopping'; agent: AgentName }
  | { type: 'agent_stopped'; agent: AgentName }
  | { type: 'usage_updated'; agent: AgentName; usage: UsageUpdateEvent['usage'] };

export interface AgentLifecycleConfig {
  projectRoot: string;
  timeoutConfig: AgentTimeoutConfig;
  selectedModels: Record<AgentName, AgentModel>;
}

/**
 * AgentLifecycleManager handles the lifecycle of agents:
 * - Starting agents in tmux panes
 * - Stopping agents
 * - Managing agent monitoring
 * - Handling agent restarts
 */
export class AgentLifecycleManager extends EventEmitter {
  private tmuxManager: TmuxManager;
  private stateManager: StateManager;
  private agentMonitor: AgentMonitor;
  private outputStreamer: OutputStreamer | null = null;
  private usageTracker: UsageTracker | null = null;
  private projectRoot: string;
  private selectedModels: Record<AgentName, AgentModel>;
  private currentRunId: string | null = null;

  constructor(
    tmuxManager: TmuxManager,
    stateManager: StateManager,
    agentMonitor: AgentMonitor,
    config: AgentLifecycleConfig
  ) {
    super();
    this.tmuxManager = tmuxManager;
    this.stateManager = stateManager;
    this.agentMonitor = agentMonitor;
    this.projectRoot = config.projectRoot;
    this.selectedModels = config.selectedModels;
  }

  /**
   * Set up optional output streamer
   */
  setOutputStreamer(streamer: OutputStreamer): void {
    this.outputStreamer = streamer;
  }

  /**
   * Set up optional usage tracker
   */
  setUsageTracker(tracker: UsageTracker): void {
    this.usageTracker = tracker;
    this.setupUsageTrackerListeners();
  }

  /**
   * Set the current run ID
   */
  setRunId(runId: string): void {
    this.currentRunId = runId;
  }

  /**
   * Update selected models
   */
  updateSelectedModels(models: Record<AgentName, AgentModel>): void {
    this.selectedModels = models;
  }

  /**
   * Start an agent in headless mode
   * Runs Claude with -p --output-format json for structured output
   */
  async startAgent(agent: AgentName, runDir: string): Promise<void> {
    if (!this.currentRunId) {
      throw new Error('Run ID not set');
    }

    const model = this.selectedModels[agent];
    if (!model) {
      throw new Error(`No model selected for agent: ${agent}`);
    }

    this.emit('lifecycle_event', { type: 'agent_starting', agent } as AgentLifecycleEvent);

    // Update state
    await this.stateManager.updateAgentStatus(agent, 'running');

    // Start monitoring this agent
    this.agentMonitor.watchAgent(agent);

    // Get prompt file path and output directory
    const promptFile = join(runDir, 'prompts', `${agent}.md`);
    const outputDir = join(runDir, agent);

    // Start the agent in headless mode
    this.tmuxManager.startAgentHeadless(agent, model, promptFile, outputDir);

    this.emit('lifecycle_event', { type: 'agent_started', agent } as AgentLifecycleEvent);
  }

  /**
   * Stop monitoring an agent (called when agent completes)
   */
  stopAgent(agent: AgentName): void {
    this.emit('lifecycle_event', { type: 'agent_stopping', agent } as AgentLifecycleEvent);

    this.agentMonitor.unwatchAgent(agent);

    this.emit('lifecycle_event', { type: 'agent_stopped', agent } as AgentLifecycleEvent);
  }

  /**
   * Restart an agent with VCR response (headless mode)
   * Runs a new headless session with the continuation prompt
   */
  async restartAgentWithVCR(
    agent: AgentName,
    runDir: string,
    promptFile: string
  ): Promise<void> {
    const model = this.selectedModels[agent];
    if (!model) {
      throw new Error(`No model selected for agent: ${agent}`);
    }

    // Update state
    await this.stateManager.updateAgentStatus(agent, 'running');

    // Start monitoring again
    this.agentMonitor.watchAgent(agent);

    // Get output directory
    const outputDir = join(runDir, agent);

    // Start agent in headless mode with continuation prompt
    this.tmuxManager.restartAgentWithVCR(agent, model, promptFile, outputDir);

    this.emit('lifecycle_event', { type: 'agent_started', agent } as AgentLifecycleEvent);
  }

  /**
   * Start Verifier Phase 2 with test execution results (headless mode)
   * Used when external test runner completes and Verifier needs to analyze results
   */
  async startVerifierPhase2(runDir: string, testOutput: TestOutput): Promise<void> {
    const agent: AgentName = 'verifier';

    if (!this.currentRunId) {
      throw new Error('Run ID not set');
    }

    const model = this.selectedModels[agent];
    if (!model) {
      throw new Error(`No model selected for agent: ${agent}`);
    }

    this.emit('lifecycle_event', { type: 'agent_starting', agent } as AgentLifecycleEvent);

    // Update state to running
    await this.stateManager.updateAgentStatus(agent, 'running');

    // Start monitoring this agent
    this.agentMonitor.watchAgent(agent);

    // Get Phase 2 prompt file path and output directory
    const promptFile = join(runDir, 'prompts', 'verifier-phase2.md');
    const outputDir = join(runDir, agent);

    // Start the agent in headless mode with Phase 2 prompt
    this.tmuxManager.startAgentHeadless(agent, model, promptFile, outputDir);

    this.emit('lifecycle_event', { type: 'agent_started', agent } as AgentLifecycleEvent);
  }

  /**
   * Mark agent as waiting for external test execution
   */
  async setAgentWaitingTestExecution(agent: AgentName): Promise<void> {
    this.stopAgent(agent);
    await this.stateManager.updateAgentStatus(agent, 'waiting_test_execution');
  }

  /**
   * Mark agent as completed
   */
  async completeAgent(agent: AgentName): Promise<void> {
    this.stopAgent(agent);
    await this.stateManager.updateAgentStatus(agent, 'completed');
  }

  /**
   * Mark agent as failed
   */
  async failAgent(agent: AgentName, error?: string): Promise<void> {
    this.stopAgent(agent);
    await this.stateManager.updateAgentStatus(agent, 'failed', error);
  }

  /**
   * Get the model for a specific agent
   */
  getAgentModel(agent: AgentName): AgentModel {
    return this.selectedModels[agent];
  }

  /**
   * Get all selected models
   */
  getSelectedModels(): Record<AgentName, AgentModel> {
    return { ...this.selectedModels };
  }

  /**
   * Get activity info for an agent
   */
  getAgentActivity(agent: AgentName): { lastActivity: Date; isStale: boolean } | null {
    return this.agentMonitor.getActivityInfo(agent);
  }

  /**
   * Get output for a specific agent
   */
  getAgentOutput(agent: AgentName): string | null {
    return this.outputStreamer?.getAgentOutput(agent) || null;
  }

  /**
   * Get all agent outputs
   */
  getAllOutputs(): Record<AgentName, string> | null {
    return this.outputStreamer?.getAllOutputs() || null;
  }

  /**
   * Force capture output for a specific agent
   */
  forceCapture(agent: AgentName): string | null {
    return this.outputStreamer?.forceCapture(agent) || null;
  }

  /**
   * Start output streaming for a run
   */
  startOutputStreaming(runId: string): void {
    this.outputStreamer?.startStreaming(runId);
  }

  /**
   * Stop output streaming
   */
  stopOutputStreaming(): void {
    this.outputStreamer?.stopStreaming();
  }

  /**
   * Start usage tracking
   */
  startUsageTracking(): void {
    this.usageTracker?.startTracking(this.selectedModels);
  }

  /**
   * Stop usage tracking
   */
  stopUsageTracking(): void {
    this.usageTracker?.stopTracking();
  }

  /**
   * Get usage for a specific agent
   */
  getAgentUsage(agent: AgentName) {
    return this.usageTracker?.getAgentUsage(agent) || null;
  }

  /**
   * Get usage for all agents
   */
  getAllAgentUsage() {
    return this.usageTracker?.getAllAgentUsage() || null;
  }

  /**
   * Get total usage
   */
  getTotalUsage() {
    return this.usageTracker?.getTotalUsage() || null;
  }

  /**
   * Update agent usage from Claude Code JSON output
   */
  updateAgentUsageFromOutput(agent: AgentName, output: ClaudeCodeOutput): UsageInfo | null {
    if (!this.usageTracker) {
      return null;
    }
    return this.usageTracker.updateFromClaudeOutput(agent, output);
  }

  /**
   * Set agent usage directly
   */
  setAgentUsage(agent: AgentName, usage: UsageInfo): void {
    this.usageTracker?.setAgentUsage(agent, usage);
  }

  /**
   * Update pane borders with model information
   */
  updatePaneBordersWithModels(modelSelection: ModelSelectionResult): void {
    this.tmuxManager.updatePaneBordersWithModels(modelSelection);
  }

  /**
   * Set up usage tracker event listeners
   */
  private setupUsageTrackerListeners(): void {
    if (!this.usageTracker) return;

    this.usageTracker.on('usage_update', (event: UsageUpdateEvent) => {
      // Update state with new usage - properly handle errors to prevent unhandled rejections
      this.stateManager.updateAgentUsage(event.agent, event.usage)
        .then(() => {
          // Re-emit for external listeners only after successful state update
          this.emit('lifecycle_event', {
            type: 'usage_updated',
            agent: event.agent,
            usage: event.usage,
          } as AgentLifecycleEvent);
        })
        .catch((error) => {
          // Log error but don't crash - usage tracking is non-critical
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[AgentLifecycleManager] Failed to update agent usage for ${event.agent}: ${errorMsg}`);

          // Still emit the event so UI can update even if state save failed
          this.emit('lifecycle_event', {
            type: 'usage_updated',
            agent: event.agent,
            usage: event.usage,
          } as AgentLifecycleEvent);
        });
    });
  }

  /**
   * Clean up all resources
   */
  cleanup(): void {
    this.stopOutputStreaming();
    this.stopUsageTracking();
    this.agentMonitor.stop();
    this.outputStreamer = null;
    this.usageTracker = null;
    this.currentRunId = null;
  }
}
