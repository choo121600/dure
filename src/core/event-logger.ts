import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { AgentName, Phase } from '../types/index.js';

export type EventLogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface EventLogEntry {
  level: EventLogLevel;
  event: string;
  data?: Record<string, unknown>;
}

/**
 * EventLogger - Logs all orchestrator events to events.log for debugging and reproducibility
 */
export class EventLogger {
  private logPath: string;

  constructor(runDir: string) {
    this.logPath = join(runDir, 'events.log');

    // Ensure directory exists
    const dir = dirname(this.logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Log an event with level, event name, and optional data
   */
  log(level: EventLogLevel, event: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ' ' + this.formatData(data) : '';
    const line = `${timestamp} [${level}] ${event}${dataStr}\n`;

    try {
      appendFileSync(this.logPath, line);
    } catch (error) {
      // Silent fail - don't break orchestration if logging fails
      console.error('Failed to write to events.log:', error);
    }
  }

  /**
   * Format data object as key=value pairs
   */
  private formatData(data: Record<string, unknown>): string {
    return Object.entries(data)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
  }

  // Convenience methods for common events

  logRunStarted(runId: string): void {
    this.log('INFO', 'run.started', { run_id: runId });
  }

  logRunCompleted(runId: string, verdict: 'PASS' | 'FAIL'): void {
    this.log('INFO', 'run.completed', { run_id: runId, verdict });
  }

  logPhaseChanged(from: Phase, to: Phase): void {
    this.log('INFO', 'phase.changed', { from, to });
  }

  logAgentStarted(agent: AgentName): void {
    this.log('INFO', 'agent.started', { agent });
  }

  logAgentCompleted(agent: AgentName, durationMs?: number): void {
    this.log('INFO', 'agent.completed', { agent, duration_ms: durationMs });
  }

  logAgentFailed(agent: AgentName, errorType: string, message: string): void {
    this.log('ERROR', 'agent.failed', { agent, error_type: errorType, message });
  }

  logAgentTimeout(agent: AgentName, elapsedMs: number): void {
    this.log('WARN', 'agent.timeout', { agent, elapsed_ms: elapsedMs });
  }

  logAgentRetry(agent: AgentName, attempt: number): void {
    this.log('INFO', 'agent.retry', { agent, attempt });
  }

  logCRPCreated(crpId: string, agent: AgentName): void {
    this.log('WARN', 'crp.created', { crp_id: crpId, agent });
  }

  logVCRCreated(vcrId: string, crpId: string): void {
    this.log('INFO', 'vcr.created', { vcr_id: vcrId, crp_id: crpId });
  }

  logMRPCreated(runId: string): void {
    this.log('INFO', 'mrp.created', { run_id: runId });
  }

  logIterationStarted(iteration: number, maxIterations: number): void {
    this.log('INFO', 'iteration.started', { iteration, max_iterations: maxIterations });
  }

  logIterationExhausted(iteration: number, maxIterations: number): void {
    this.log('ERROR', 'iteration.exhausted', { iteration, max_iterations: maxIterations });
  }

  logError(message: string, details?: Record<string, unknown>): void {
    this.log('ERROR', 'error', { message, ...details });
  }
}
