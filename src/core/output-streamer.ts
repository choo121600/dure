import { EventEmitter } from 'events';
import type { AgentName, AgentOutputEvent } from '../types/index.js';
import { TmuxManager } from './tmux-manager.js';
import { TIMING, LIMITS } from '../config/constants.js';

export interface OutputStreamerConfig {
  pollingInterval: number;      // Base polling interval (ms)
  historyLines: number;         // How many lines of history to capture
  adaptivePolling: boolean;     // Enable adaptive polling
  minPollingInterval: number;   // Minimum polling interval when active
  maxPollingInterval: number;   // Maximum polling interval when idle
}

const defaultConfig: OutputStreamerConfig = {
  pollingInterval: TIMING.OUTPUT_POLLING_INTERVAL_MS,
  historyLines: LIMITS.MAX_OUTPUT_HISTORY_LINES,
  adaptivePolling: true,
  minPollingInterval: TIMING.OUTPUT_POLLING_MIN_MS,
  maxPollingInterval: TIMING.OUTPUT_POLLING_MAX_MS,
};

export class OutputStreamer extends EventEmitter {
  private tmuxManager: TmuxManager;
  private config: OutputStreamerConfig;
  private runId: string | null = null;
  private outputCache: Map<AgentName, string> = new Map();
  private pollingTimeouts: Map<AgentName, NodeJS.Timeout> = new Map();
  private currentIntervals: Map<AgentName, number> = new Map();
  private lastActivityTime: Map<AgentName, number> = new Map();
  private isStreaming = false;

  constructor(tmuxManager: TmuxManager, config: Partial<OutputStreamerConfig> = {}) {
    super();
    this.tmuxManager = tmuxManager;
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Start streaming output from all agent panes
   */
  startStreaming(runId: string): void {
    if (this.isStreaming) {
      this.stopStreaming();
    }

    this.runId = runId;
    this.isStreaming = true;

    // Initialize output cache and polling intervals
    const agents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
    for (const agent of agents) {
      this.outputCache.set(agent, '');
      this.currentIntervals.set(agent, this.config.pollingInterval);
      this.lastActivityTime.set(agent, Date.now());

      // Start individual polling for each agent
      this.scheduleNextCapture(agent);
    }

    // Capture initial output
    this.captureAllOutputs();
  }

  /**
   * Stop streaming
   */
  stopStreaming(): void {
    this.isStreaming = false;
    this.runId = null;

    // Clear all polling timeouts
    for (const [_agent, timeout] of this.pollingTimeouts) {
      clearTimeout(timeout);
    }

    this.pollingTimeouts.clear();
    this.outputCache.clear();
    this.currentIntervals.clear();
    this.lastActivityTime.clear();
  }

  /**
   * Schedule next capture for a specific agent with adaptive timing
   */
  private scheduleNextCapture(agent: AgentName): void {
    if (!this.isStreaming) return;

    const interval = this.currentIntervals.get(agent) || this.config.pollingInterval;

    const timeout = setTimeout(() => {
      this.captureAgentOutput(agent);
      this.scheduleNextCapture(agent);
    }, interval);

    this.pollingTimeouts.set(agent, timeout);
  }

  /**
   * Adjust polling interval based on activity
   */
  private adjustPollingInterval(agent: AgentName, hasActivity: boolean): void {
    if (!this.config.adaptivePolling) return;

    const current = this.currentIntervals.get(agent) || this.config.pollingInterval;

    let newInterval: number;
    if (hasActivity) {
      // Activity detected - speed up polling (but not below minimum)
      newInterval = Math.max(
        this.config.minPollingInterval,
        Math.floor(current / 2)
      );
      this.lastActivityTime.set(agent, Date.now());
    } else {
      // No activity - slow down polling (but not above maximum)
      const timeSinceActivity = Date.now() - (this.lastActivityTime.get(agent) || 0);

      // Only slow down if no activity for a while
      if (timeSinceActivity > this.config.pollingInterval * 3) {
        newInterval = Math.min(
          this.config.maxPollingInterval,
          Math.floor(current * 1.5)
        );
      } else {
        newInterval = current;
      }
    }

    if (newInterval !== current) {
      this.currentIntervals.set(agent, newInterval);
    }
  }

  /**
   * Capture output from all agent panes and emit events for new content
   */
  private captureAllOutputs(): void {
    const agents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];

    for (const agent of agents) {
      this.captureAgentOutput(agent);
    }
  }

  /**
   * Capture output from a specific agent pane
   */
  private captureAgentOutput(agent: AgentName): void {
    try {
      const currentOutput = this.tmuxManager.capturePane(agent, this.config.historyLines);
      const cachedOutput = this.outputCache.get(agent) || '';

      // Check if there's new content
      const hasNewContent = currentOutput !== cachedOutput;

      if (hasNewContent) {
        const newContent = this.extractNewContent(cachedOutput, currentOutput);

        // Update cache
        this.outputCache.set(agent, currentOutput);

        // Emit output event
        const event: AgentOutputEvent = {
          agent,
          content: currentOutput,
          timestamp: new Date().toISOString(),
          isNew: newContent.length > 0,
        };

        this.emit('output', event);

        // Also emit just the new lines if there are any
        if (newContent.length > 0) {
          this.emit('new_output', {
            agent,
            content: newContent,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Adjust polling interval based on activity
      this.adjustPollingInterval(agent, hasNewContent);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', { agent, error: errMsg });
    }
  }

  /**
   * Extract new content by comparing old and new output
   */
  private extractNewContent(oldOutput: string, newOutput: string): string {
    if (!oldOutput) {
      return newOutput;
    }

    // Simple approach: find where old output ends in new output
    const oldLines = oldOutput.trim().split('\n');
    const newLines = newOutput.trim().split('\n');

    // Find the last line of old output in new output
    const lastOldLine = oldLines[oldLines.length - 1];
    const lastOldLineIndex = newLines.lastIndexOf(lastOldLine);

    if (lastOldLineIndex >= 0 && lastOldLineIndex < newLines.length - 1) {
      return newLines.slice(lastOldLineIndex + 1).join('\n');
    }

    // If old content not found, assume all new
    if (newLines.length > oldLines.length) {
      return newLines.slice(oldLines.length).join('\n');
    }

    return '';
  }

  /**
   * Get current output for an agent
   */
  getAgentOutput(agent: AgentName): string {
    return this.outputCache.get(agent) || '';
  }

  /**
   * Get all current outputs
   */
  getAllOutputs(): Record<AgentName, string> {
    return {
      refiner: this.outputCache.get('refiner') || '',
      builder: this.outputCache.get('builder') || '',
      verifier: this.outputCache.get('verifier') || '',
      gatekeeper: this.outputCache.get('gatekeeper') || '',
    };
  }

  /**
   * Force capture output for a specific agent (on demand)
   */
  forceCapture(agent: AgentName): string {
    const output = this.tmuxManager.capturePane(agent, this.config.historyLines);
    this.outputCache.set(agent, output);
    return output;
  }

  /**
   * Check if currently streaming
   */
  isCurrentlyStreaming(): boolean {
    return this.isStreaming;
  }

  /**
   * Get current polling interval for an agent
   */
  getCurrentInterval(agent: AgentName): number {
    return this.currentIntervals.get(agent) || this.config.pollingInterval;
  }

  /**
   * Get current configuration
   */
  getConfig(): OutputStreamerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart of streaming to take effect)
   */
  updateConfig(config: Partial<OutputStreamerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset polling interval for an agent to default
   */
  resetInterval(agent: AgentName): void {
    this.currentIntervals.set(agent, this.config.pollingInterval);
  }
}
