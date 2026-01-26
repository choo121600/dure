import { EventEmitter } from 'events';
import { execSync, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { AgentName, UsageInfo, TotalUsage, AgentModel } from '../types/index.js';

export interface UsageUpdateEvent {
  agent: AgentName;
  usage: UsageInfo;
  timestamp: string;
}

interface CCUsageSession {
  sessionId: string;
  projectPath: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

interface CCUsageOutput {
  sessions?: CCUsageSession[];
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCacheCreationTokens?: number;
  totalCacheReadTokens?: number;
  totalCostUsd?: number;
  // Alternative field names ccusage might use
  total_input_tokens?: number;
  total_output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_cost?: number;
  cost?: number;
}

export class UsageTracker extends EventEmitter {
  private projectPath: string;
  private agentUsage: Map<AgentName, UsageInfo> = new Map();
  private agentModels: Map<AgentName, AgentModel> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;
  private isTracking = false;
  private ccusageAvailable: boolean | null = null;
  private claudeProjectsDir: string;

  constructor(projectPath: string) {
    super();
    this.projectPath = projectPath;
    this.claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
    this.initializeUsage();
  }

  /**
   * Check if ccusage is installed and available
   */
  private checkCCUsageAvailable(): boolean {
    if (this.ccusageAvailable !== null) {
      return this.ccusageAvailable;
    }

    try {
      execSync('which ccusage', { encoding: 'utf-8', stdio: 'pipe' });
      this.ccusageAvailable = true;
    } catch {
      this.ccusageAvailable = false;
      console.warn('ccusage not found. Install with: npm install -g ccusage');
    }

    return this.ccusageAvailable;
  }

  /**
   * Initialize usage tracking for all agents
   */
  private initializeUsage(): void {
    const agents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
    for (const agent of agents) {
      this.agentUsage.set(agent, this.createEmptyUsage());
    }
  }

  /**
   * Create empty usage info
   */
  private createEmptyUsage(): UsageInfo {
    return {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      cost_usd: 0,
    };
  }

  /**
   * Set the model for an agent
   */
  setAgentModel(agent: AgentName, model: AgentModel): void {
    this.agentModels.set(agent, model);
  }

  /**
   * Start tracking usage
   */
  startTracking(models: Record<AgentName, AgentModel>): void {
    if (this.isTracking) return;

    // Set models for all agents
    for (const [agent, model] of Object.entries(models)) {
      this.agentModels.set(agent as AgentName, model);
    }

    this.isTracking = true;

    // Poll for usage updates every 10 seconds
    this.pollingInterval = setInterval(() => {
      this.updateAllAgentsUsage();
    }, 10000);

    // Initial update
    this.updateAllAgentsUsage();
  }

  /**
   * Stop tracking
   */
  stopTracking(): void {
    this.isTracking = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Update usage for all agents using ccusage
   */
  private async updateAllAgentsUsage(): Promise<void> {
    if (!this.checkCCUsageAvailable()) {
      return;
    }

    try {
      const usage = await this.fetchUsageFromCCUsage();
      if (usage) {
        // For now, we track total usage and distribute it
        // In the future, we could track per-session if ccusage supports it
        this.distributeUsageToAgents(usage);
      }
    } catch (error) {
      // Silently fail - usage tracking is non-critical
      console.debug('Failed to fetch usage from ccusage:', error);
    }
  }

  /**
   * Fetch usage data using ccusage CLI
   */
  private async fetchUsageFromCCUsage(): Promise<UsageInfo | null> {
    return new Promise((resolve) => {
      exec('ccusage --json --daily 2>/dev/null', { encoding: 'utf-8' }, (error, stdout) => {
        if (error || !stdout) {
          resolve(null);
          return;
        }

        try {
          const data: CCUsageOutput = JSON.parse(stdout);
          const usage = this.parseCCUsageOutput(data);
          resolve(usage);
        } catch {
          resolve(null);
        }
      });
    });
  }

  /**
   * Parse ccusage output into UsageInfo
   */
  private parseCCUsageOutput(data: CCUsageOutput): UsageInfo {
    // Handle various field name formats ccusage might use
    const inputTokens = data.totalInputTokens || data.total_input_tokens || 0;
    const outputTokens = data.totalOutputTokens || data.total_output_tokens || 0;
    const cacheCreation = data.totalCacheCreationTokens || data.cache_creation_tokens || 0;
    const cacheRead = data.totalCacheReadTokens || data.cache_read_tokens || 0;
    const cost = data.totalCostUsd || data.total_cost || data.cost || 0;

    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_tokens: cacheCreation,
      cache_read_tokens: cacheRead,
      cost_usd: cost,
    };
  }

  /**
   * Distribute total usage to agents based on their activity
   * This is a simplified approach - in production, you'd want per-session tracking
   */
  private distributeUsageToAgents(totalUsage: UsageInfo): void {
    // Get agents that are currently running or completed
    const activeAgents: AgentName[] = [];
    for (const [agent, usage] of this.agentUsage.entries()) {
      if (usage.input_tokens > 0 || usage.output_tokens > 0) {
        activeAgents.push(agent);
      }
    }

    // If no active agents, attribute to 'refiner' as default starting agent
    if (activeAgents.length === 0) {
      this.updateAgentUsageInternal('refiner', totalUsage);
    }
  }

  /**
   * Update usage for a specific agent (internal)
   */
  private updateAgentUsageInternal(agent: AgentName, usage: UsageInfo): void {
    const currentUsage = this.agentUsage.get(agent);

    // Only update if usage has changed
    if (
      !currentUsage ||
      usage.input_tokens !== currentUsage.input_tokens ||
      usage.output_tokens !== currentUsage.output_tokens ||
      usage.cache_creation_tokens !== currentUsage.cache_creation_tokens ||
      usage.cache_read_tokens !== currentUsage.cache_read_tokens
    ) {
      this.agentUsage.set(agent, usage);
      this.emit('usage_update', {
        agent,
        usage,
        timestamp: new Date().toISOString(),
      } as UsageUpdateEvent);
    }
  }

  /**
   * Manually update usage for an agent
   */
  updateAgentUsage(
    agent: AgentName,
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens = 0,
    cacheReadTokens = 0,
    costUsd?: number
  ): void {
    const usage: UsageInfo = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_tokens: cacheCreationTokens,
      cache_read_tokens: cacheReadTokens,
      cost_usd: costUsd ?? 0,
    };

    this.agentUsage.set(agent, usage);
    this.emit('usage_update', {
      agent,
      usage,
      timestamp: new Date().toISOString(),
    } as UsageUpdateEvent);
  }

  /**
   * Fetch and update usage for a specific agent when it completes
   */
  async fetchAgentUsage(agent: AgentName): Promise<UsageInfo | null> {
    if (!this.checkCCUsageAvailable()) {
      return this.agentUsage.get(agent) || null;
    }

    try {
      const usage = await this.fetchUsageFromCCUsage();
      if (usage) {
        // Calculate delta from last known usage
        const currentTotal = this.getTotalUsage();
        const delta: UsageInfo = {
          input_tokens: Math.max(0, usage.input_tokens - currentTotal.total_input_tokens),
          output_tokens: Math.max(0, usage.output_tokens - currentTotal.total_output_tokens),
          cache_creation_tokens: Math.max(
            0,
            usage.cache_creation_tokens - currentTotal.total_cache_creation_tokens
          ),
          cache_read_tokens: Math.max(
            0,
            usage.cache_read_tokens - currentTotal.total_cache_read_tokens
          ),
          cost_usd: Math.max(0, usage.cost_usd - currentTotal.total_cost_usd),
        };

        // If there's new usage, attribute it to this agent
        if (delta.input_tokens > 0 || delta.output_tokens > 0) {
          const existingUsage = this.agentUsage.get(agent) || this.createEmptyUsage();
          const updatedUsage: UsageInfo = {
            input_tokens: existingUsage.input_tokens + delta.input_tokens,
            output_tokens: existingUsage.output_tokens + delta.output_tokens,
            cache_creation_tokens: existingUsage.cache_creation_tokens + delta.cache_creation_tokens,
            cache_read_tokens: existingUsage.cache_read_tokens + delta.cache_read_tokens,
            cost_usd: existingUsage.cost_usd + delta.cost_usd,
          };

          this.updateAgentUsageInternal(agent, updatedUsage);
          return updatedUsage;
        }
      }
    } catch (error) {
      console.debug(`Failed to fetch usage for ${agent}:`, error);
    }

    return this.agentUsage.get(agent) || null;
  }

  /**
   * Get usage for a specific agent
   */
  getAgentUsage(agent: AgentName): UsageInfo {
    return this.agentUsage.get(agent) || this.createEmptyUsage();
  }

  /**
   * Get usage for all agents
   */
  getAllAgentUsage(): Record<AgentName, UsageInfo> {
    return {
      refiner: this.getAgentUsage('refiner'),
      builder: this.getAgentUsage('builder'),
      verifier: this.getAgentUsage('verifier'),
      gatekeeper: this.getAgentUsage('gatekeeper'),
    };
  }

  /**
   * Get total usage across all agents
   */
  getTotalUsage(): TotalUsage {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreation = 0;
    let totalCacheRead = 0;
    let totalCost = 0;

    for (const usage of this.agentUsage.values()) {
      totalInput += usage.input_tokens;
      totalOutput += usage.output_tokens;
      totalCacheCreation += usage.cache_creation_tokens;
      totalCacheRead += usage.cache_read_tokens;
      totalCost += usage.cost_usd;
    }

    return {
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      total_cache_creation_tokens: totalCacheCreation,
      total_cache_read_tokens: totalCacheRead,
      total_cost_usd: Math.round(totalCost * 1000000) / 1000000,
    };
  }

  /**
   * Reset usage tracking
   */
  reset(): void {
    this.initializeUsage();
  }

  /**
   * Format tokens for display (e.g., 15300 -> "15.3K")
   */
  static formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) {
      return (tokens / 1_000_000).toFixed(1) + 'M';
    } else if (tokens >= 1_000) {
      return (tokens / 1_000).toFixed(1) + 'K';
    }
    return tokens.toString();
  }

  /**
   * Format cost for display (e.g., 0.058 -> "$0.058")
   */
  static formatCost(cost: number): string {
    if (cost < 0.001) {
      return '$' + cost.toFixed(4);
    } else if (cost < 1) {
      return '$' + cost.toFixed(3);
    }
    return '$' + cost.toFixed(2);
  }

  /**
   * Check if ccusage is available (public method)
   */
  isCCUsageAvailable(): boolean {
    return this.checkCCUsageAvailable();
  }
}
