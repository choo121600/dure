import { EventEmitter } from 'events';
import type { AgentName, AgentTimeoutConfig, AgentActivityInfo } from '../types/index.js';
import { TmuxManager } from './tmux-manager.js';
import { defaultTimeoutConfig } from '../config/defaults.js';

export type AgentMonitorEvent =
  | { type: 'timeout'; agent: AgentName }
  | { type: 'stale'; agent: AgentName; inactiveMs: number }
  | { type: 'recovered'; agent: AgentName }
  | { type: 'process_ended'; agent: AgentName };

export class AgentMonitor extends EventEmitter {
  private tmuxManager: TmuxManager;
  private config: AgentTimeoutConfig;
  private activityMap: Map<AgentName, AgentActivityInfo> = new Map();
  private outputCache: Map<AgentName, string> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private agentTimeouts: Map<AgentName, NodeJS.Timeout> = new Map();
  private isRunning = false;

  constructor(tmuxManager: TmuxManager, config: Partial<AgentTimeoutConfig> = {}) {
    super();
    this.tmuxManager = tmuxManager;
    this.config = { ...defaultTimeoutConfig, ...config };
  }

  /**
   * Start monitoring agents
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initialize activity tracking
    const agents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
    for (const agent of agents) {
      this.activityMap.set(agent, {
        lastActivity: new Date(),
        isStale: false,
        lastOutputLength: 0,
      });
      this.outputCache.set(agent, '');
    }

    // Start periodic activity checks
    this.checkInterval = setInterval(() => {
      this.checkAllAgentsActivity();
    }, this.config.activityCheckInterval);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all agent timeouts
    for (const timeout of this.agentTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.agentTimeouts.clear();
    this.activityMap.clear();
    this.outputCache.clear();
  }

  /**
   * Start watching a specific agent for timeout
   */
  watchAgent(agent: AgentName): void {
    // Clear existing timeout if any
    this.clearAgentTimeout(agent);

    // Reset activity tracking
    this.activityMap.set(agent, {
      lastActivity: new Date(),
      isStale: false,
      lastOutputLength: 0,
    });

    // Set up timeout
    const timeoutMs = this.config[agent];
    const timeout = setTimeout(() => {
      this.emitEvent({ type: 'timeout', agent });
    }, timeoutMs);

    this.agentTimeouts.set(agent, timeout);
  }

  /**
   * Stop watching a specific agent (called when agent completes)
   */
  unwatchAgent(agent: AgentName): void {
    this.clearAgentTimeout(agent);
  }

  /**
   * Clear timeout for an agent
   */
  private clearAgentTimeout(agent: AgentName): void {
    const existing = this.agentTimeouts.get(agent);
    if (existing) {
      clearTimeout(existing);
      this.agentTimeouts.delete(agent);
    }
  }

  /**
   * Check activity for all agents
   */
  private checkAllAgentsActivity(): void {
    const agents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];

    for (const agent of agents) {
      if (this.agentTimeouts.has(agent)) {
        this.checkAgentActivity(agent);
      }
    }
  }

  /**
   * Check activity for a specific agent by comparing output
   */
  private checkAgentActivity(agent: AgentName): void {
    const currentOutput = this.tmuxManager.capturePane(agent);
    const cachedOutput = this.outputCache.get(agent) || '';
    const activity = this.activityMap.get(agent);

    if (!activity) return;

    const hasNewOutput = currentOutput.length !== cachedOutput.length ||
                         currentOutput !== cachedOutput;

    if (hasNewOutput) {
      // Agent is active - update tracking
      const wasStale = activity.isStale;
      activity.lastActivity = new Date();
      activity.isStale = false;
      activity.lastOutputLength = currentOutput.length;
      this.outputCache.set(agent, currentOutput);

      if (wasStale) {
        this.emitEvent({ type: 'recovered', agent });
      }
    } else {
      // Check if agent is stale (no output for too long)
      const inactiveMs = Date.now() - activity.lastActivity.getTime();

      if (inactiveMs > this.config.maxInactivityTime && !activity.isStale) {
        activity.isStale = true;
        this.emitEvent({ type: 'stale', agent, inactiveMs });
      }

      // Check if process has ended
      if (!this.tmuxManager.isPaneActive(agent) && inactiveMs > 5000) {
        this.emitEvent({ type: 'process_ended', agent });
      }
    }
  }

  /**
   * Get activity info for an agent
   */
  getActivityInfo(agent: AgentName): AgentActivityInfo | null {
    return this.activityMap.get(agent) || null;
  }

  /**
   * Check if an agent appears to be stale (no recent output)
   */
  isAgentStale(agent: AgentName): boolean {
    const activity = this.activityMap.get(agent);
    return activity?.isStale || false;
  }

  /**
   * Reset activity tracking for an agent (e.g., on restart)
   */
  resetAgentActivity(agent: AgentName): void {
    this.activityMap.set(agent, {
      lastActivity: new Date(),
      isStale: false,
      lastOutputLength: 0,
    });
    this.outputCache.set(agent, '');
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: AgentMonitorEvent): void {
    this.emit('monitor_event', event);
  }
}
