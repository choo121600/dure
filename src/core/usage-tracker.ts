import { EventEmitter } from 'events';
import type { AgentName, UsageInfo, TotalUsage, AgentModel, ClaudeCodeOutput } from '../types/index.js';

export interface UsageUpdateEvent {
  agent: AgentName;
  usage: UsageInfo;
  timestamp: string;
}

export class UsageTracker extends EventEmitter {
  private agentUsage: Map<AgentName, UsageInfo> = new Map();
  private agentModels: Map<AgentName, AgentModel> = new Map();

  constructor() {
    super();
    this.initializeUsage();
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
   * Start tracking usage (sets models for all agents)
   */
  startTracking(models: Record<AgentName, AgentModel>): void {
    for (const [agent, model] of Object.entries(models)) {
      this.agentModels.set(agent as AgentName, model);
    }
  }

  /**
   * Stop tracking (no-op in simplified version)
   */
  stopTracking(): void {
    // No polling to stop in headless mode
  }

  /**
   * Update usage for an agent from Claude Code JSON output
   */
  updateFromClaudeOutput(agent: AgentName, output: ClaudeCodeOutput): UsageInfo {
    const usage: UsageInfo = {
      input_tokens: output.usage.input_tokens,
      output_tokens: output.usage.output_tokens,
      cache_creation_tokens: output.usage.cache_creation_input_tokens,
      cache_read_tokens: output.usage.cache_read_input_tokens,
      cost_usd: output.total_cost_usd,
    };

    // Add to existing usage (agent may run multiple times, e.g., after VCR)
    const existingUsage = this.agentUsage.get(agent) || this.createEmptyUsage();
    const updatedUsage: UsageInfo = {
      input_tokens: existingUsage.input_tokens + usage.input_tokens,
      output_tokens: existingUsage.output_tokens + usage.output_tokens,
      cache_creation_tokens: existingUsage.cache_creation_tokens + usage.cache_creation_tokens,
      cache_read_tokens: existingUsage.cache_read_tokens + usage.cache_read_tokens,
      cost_usd: existingUsage.cost_usd + usage.cost_usd,
    };

    this.agentUsage.set(agent, updatedUsage);
    this.emit('usage_update', {
      agent,
      usage: updatedUsage,
      timestamp: new Date().toISOString(),
    } as UsageUpdateEvent);

    return updatedUsage;
  }

  /**
   * Update usage for an agent directly
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
   * Set usage for an agent (from UsageInfo object)
   */
  setAgentUsage(agent: AgentName, usage: UsageInfo): void {
    this.agentUsage.set(agent, usage);
    this.emit('usage_update', {
      agent,
      usage,
      timestamp: new Date().toISOString(),
    } as UsageUpdateEvent);
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
}
