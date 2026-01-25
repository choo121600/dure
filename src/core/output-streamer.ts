import { EventEmitter } from 'events';
import type { AgentName, AgentOutputEvent } from '../types/index.js';
import { TmuxManager } from './tmux-manager.js';

export interface OutputStreamerConfig {
  pollingInterval: number;  // How often to check for new output (ms)
  historyLines: number;     // How many lines of history to capture
}

const defaultConfig: OutputStreamerConfig = {
  pollingInterval: 1000,  // 1 second
  historyLines: 200,
};

export class OutputStreamer extends EventEmitter {
  private tmuxManager: TmuxManager;
  private config: OutputStreamerConfig;
  private runId: string | null = null;
  private outputCache: Map<AgentName, string> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;
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

    // Initialize output cache
    const agents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
    for (const agent of agents) {
      this.outputCache.set(agent, '');
    }

    // Start polling for output
    this.pollingInterval = setInterval(() => {
      this.captureAllOutputs();
    }, this.config.pollingInterval);

    // Capture initial output
    this.captureAllOutputs();
  }

  /**
   * Stop streaming
   */
  stopStreaming(): void {
    this.isStreaming = false;
    this.runId = null;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.outputCache.clear();
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
      if (currentOutput !== cachedOutput) {
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
}
