/**
 * Enhanced event types for Orchestrator
 * Provides type-safe event handling with branded types
 */

import type { AgentName, Phase, UsageInfo, TotalUsage, ModelSelectionResult, Verdict } from './index.js';
import type { RunId, CrpId, VcrId } from './branded.js';
import type { ErrorFlag } from '../core/file-watcher.js';

// ============================================================================
// Event Base Types
// ============================================================================

/**
 * Base interface for all orchestrator events
 */
export interface BaseOrchestratorEvent {
  type: string;
  runId: RunId;
  timestamp: Date;
}

// ============================================================================
// Individual Event Types
// ============================================================================

/**
 * Emitted when a new run starts
 */
export interface RunStartedEvent extends BaseOrchestratorEvent {
  type: 'run_started';
}

/**
 * Emitted when the phase changes
 */
export interface PhaseChangedEvent extends BaseOrchestratorEvent {
  type: 'phase_changed';
  phase: Phase;
  previousPhase?: Phase;
}

/**
 * Emitted when an agent starts
 */
export interface AgentStartedEvent extends BaseOrchestratorEvent {
  type: 'agent_started';
  agent: AgentName;
}

/**
 * Emitted when an agent completes successfully
 */
export interface AgentCompletedEvent extends BaseOrchestratorEvent {
  type: 'agent_completed';
  agent: AgentName;
}

/**
 * Emitted when an agent times out
 */
export interface AgentTimeoutEvent extends BaseOrchestratorEvent {
  type: 'agent_timeout';
  agent: AgentName;
  timeoutMs?: number;
}

/**
 * Emitted when an agent becomes stale (inactive)
 */
export interface AgentStaleEvent extends BaseOrchestratorEvent {
  type: 'agent_stale';
  agent: AgentName;
  inactiveMs: number;
}

/**
 * Emitted when agent produces output
 * Named with Orchestrator prefix to avoid conflict with streaming AgentOutputEvent
 */
export interface OrchestratorAgentOutputEvent extends BaseOrchestratorEvent {
  type: 'agent_output';
  agent: AgentName;
  content: string;
}

/**
 * Emitted when an agent fails
 */
export interface AgentFailedEvent extends BaseOrchestratorEvent {
  type: 'agent_failed';
  agent: AgentName;
  errorFlag: ErrorFlag;
}

/**
 * Emitted when retrying an agent
 */
export interface AgentRetryEvent extends BaseOrchestratorEvent {
  type: 'agent_retry';
  agent: AgentName;
  attempt: number;
  maxAttempts: number;
}

/**
 * Emitted when agent retry succeeds
 */
export interface AgentRetrySuccessEvent extends BaseOrchestratorEvent {
  type: 'agent_retry_success';
  agent: AgentName;
  attempt: number;
}

/**
 * Emitted when agent retries are exhausted
 */
export interface AgentRetryExhaustedEvent extends BaseOrchestratorEvent {
  type: 'agent_retry_exhausted';
  agent: AgentName;
  totalAttempts: number;
}

/**
 * Emitted when a CRP is created
 */
export interface CrpCreatedEvent extends BaseOrchestratorEvent {
  type: 'crp_created';
  crpId: CrpId;
}

/**
 * Emitted when a VCR is received
 */
export interface VcrReceivedEvent extends BaseOrchestratorEvent {
  type: 'vcr_received';
  vcrId: VcrId;
}

/**
 * Emitted when MRP is ready
 */
export interface MrpReadyEvent extends BaseOrchestratorEvent {
  type: 'mrp_ready';
}

/**
 * Emitted when run completes
 */
export interface RunCompletedEvent extends BaseOrchestratorEvent {
  type: 'run_completed';
  verdict: Verdict;
}

/**
 * Emitted when a new iteration starts
 */
export interface IterationStartedEvent extends BaseOrchestratorEvent {
  type: 'iteration_started';
  iteration: number;
}

/**
 * Emitted when usage is updated
 */
export interface UsageUpdatedEvent extends BaseOrchestratorEvent {
  type: 'usage_updated';
  agent: AgentName;
  usage: UsageInfo;
  total: TotalUsage;
}

/**
 * Emitted when models are selected
 */
export interface ModelsSelectedEvent extends BaseOrchestratorEvent {
  type: 'models_selected';
  result: ModelSelectionResult;
}

/**
 * Emitted on error
 */
export interface ErrorEvent extends BaseOrchestratorEvent {
  type: 'error';
  error: string;
  cause?: Error;
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all orchestrator events with branded types
 */
export type OrchestratorEventTyped =
  | RunStartedEvent
  | PhaseChangedEvent
  | AgentStartedEvent
  | AgentCompletedEvent
  | AgentTimeoutEvent
  | AgentStaleEvent
  | OrchestratorAgentOutputEvent
  | AgentFailedEvent
  | AgentRetryEvent
  | AgentRetrySuccessEvent
  | AgentRetryExhaustedEvent
  | CrpCreatedEvent
  | VcrReceivedEvent
  | MrpReadyEvent
  | RunCompletedEvent
  | IterationStartedEvent
  | UsageUpdatedEvent
  | ModelsSelectedEvent
  | ErrorEvent;

/**
 * Event type names
 */
export type OrchestratorEventType = OrchestratorEventTyped['type'];

// ============================================================================
// Event Factory Functions
// ============================================================================

/**
 * Create a run started event
 */
export function createRunStartedEvent(runId: RunId): RunStartedEvent {
  return {
    type: 'run_started',
    runId,
    timestamp: new Date(),
  };
}

/**
 * Create a phase changed event
 */
export function createPhaseChangedEvent(
  runId: RunId,
  phase: Phase,
  previousPhase?: Phase
): PhaseChangedEvent {
  return {
    type: 'phase_changed',
    runId,
    phase,
    previousPhase,
    timestamp: new Date(),
  };
}

/**
 * Create an agent started event
 */
export function createAgentStartedEvent(runId: RunId, agent: AgentName): AgentStartedEvent {
  return {
    type: 'agent_started',
    runId,
    agent,
    timestamp: new Date(),
  };
}

/**
 * Create an agent completed event
 */
export function createAgentCompletedEvent(runId: RunId, agent: AgentName): AgentCompletedEvent {
  return {
    type: 'agent_completed',
    runId,
    agent,
    timestamp: new Date(),
  };
}

/**
 * Create an agent timeout event
 */
export function createAgentTimeoutEvent(
  runId: RunId,
  agent: AgentName,
  timeoutMs?: number
): AgentTimeoutEvent {
  return {
    type: 'agent_timeout',
    runId,
    agent,
    timeoutMs,
    timestamp: new Date(),
  };
}

/**
 * Create an agent stale event
 */
export function createAgentStaleEvent(
  runId: RunId,
  agent: AgentName,
  inactiveMs: number
): AgentStaleEvent {
  return {
    type: 'agent_stale',
    runId,
    agent,
    inactiveMs,
    timestamp: new Date(),
  };
}

/**
 * Create an agent output event
 */
export function createOrchestratorAgentOutputEvent(
  runId: RunId,
  agent: AgentName,
  content: string
): OrchestratorAgentOutputEvent {
  return {
    type: 'agent_output',
    runId,
    agent,
    content,
    timestamp: new Date(),
  };
}

/**
 * Create an agent failed event
 */
export function createAgentFailedEvent(
  runId: RunId,
  agent: AgentName,
  errorFlag: ErrorFlag
): AgentFailedEvent {
  return {
    type: 'agent_failed',
    runId,
    agent,
    errorFlag,
    timestamp: new Date(),
  };
}

/**
 * Create an agent retry event
 */
export function createAgentRetryEvent(
  runId: RunId,
  agent: AgentName,
  attempt: number,
  maxAttempts: number
): AgentRetryEvent {
  return {
    type: 'agent_retry',
    runId,
    agent,
    attempt,
    maxAttempts,
    timestamp: new Date(),
  };
}

/**
 * Create an agent retry success event
 */
export function createAgentRetrySuccessEvent(
  runId: RunId,
  agent: AgentName,
  attempt: number
): AgentRetrySuccessEvent {
  return {
    type: 'agent_retry_success',
    runId,
    agent,
    attempt,
    timestamp: new Date(),
  };
}

/**
 * Create an agent retry exhausted event
 */
export function createAgentRetryExhaustedEvent(
  runId: RunId,
  agent: AgentName,
  totalAttempts: number
): AgentRetryExhaustedEvent {
  return {
    type: 'agent_retry_exhausted',
    runId,
    agent,
    totalAttempts,
    timestamp: new Date(),
  };
}

/**
 * Create a CRP created event
 */
export function createCrpCreatedEvent(runId: RunId, crpId: CrpId): CrpCreatedEvent {
  return {
    type: 'crp_created',
    runId,
    crpId,
    timestamp: new Date(),
  };
}

/**
 * Create a VCR received event
 */
export function createVcrReceivedEvent(runId: RunId, vcrId: VcrId): VcrReceivedEvent {
  return {
    type: 'vcr_received',
    runId,
    vcrId,
    timestamp: new Date(),
  };
}

/**
 * Create an MRP ready event
 */
export function createMrpReadyEvent(runId: RunId): MrpReadyEvent {
  return {
    type: 'mrp_ready',
    runId,
    timestamp: new Date(),
  };
}

/**
 * Create a run completed event
 */
export function createRunCompletedEvent(runId: RunId, verdict: Verdict): RunCompletedEvent {
  return {
    type: 'run_completed',
    runId,
    verdict,
    timestamp: new Date(),
  };
}

/**
 * Create an iteration started event
 */
export function createIterationStartedEvent(
  runId: RunId,
  iteration: number
): IterationStartedEvent {
  return {
    type: 'iteration_started',
    runId,
    iteration,
    timestamp: new Date(),
  };
}

/**
 * Create a usage updated event
 */
export function createUsageUpdatedEvent(
  runId: RunId,
  agent: AgentName,
  usage: UsageInfo,
  total: TotalUsage
): UsageUpdatedEvent {
  return {
    type: 'usage_updated',
    runId,
    agent,
    usage,
    total,
    timestamp: new Date(),
  };
}

/**
 * Create a models selected event
 */
export function createModelsSelectedEvent(
  runId: RunId,
  result: ModelSelectionResult
): ModelsSelectedEvent {
  return {
    type: 'models_selected',
    runId,
    result,
    timestamp: new Date(),
  };
}

/**
 * Create an error event
 */
export function createErrorEvent(runId: RunId, error: string, cause?: Error): ErrorEvent {
  return {
    type: 'error',
    runId,
    error,
    cause,
    timestamp: new Date(),
  };
}

// ============================================================================
// Event Handler Types
// ============================================================================

/**
 * Extract a specific event type from the union
 */
export type ExtractEvent<T extends OrchestratorEventType> = Extract<
  OrchestratorEventTyped,
  { type: T }
>;

/**
 * Type-safe event handler for a specific event type
 *
 * @example
 * ```typescript
 * const handler: OrchestratorEventHandler<'run_started'> = (event) => {
 *   // event is typed as RunStartedEvent
 *   console.log(`Run ${event.runId} started`);
 * };
 * ```
 */
export type OrchestratorEventHandler<T extends OrchestratorEventType> = (
  event: ExtractEvent<T>
) => void;

/**
 * Async event handler type
 */
export type AsyncOrchestratorEventHandler<T extends OrchestratorEventType> = (
  event: ExtractEvent<T>
) => Promise<void>;

/**
 * Generic event handler that accepts any orchestrator event
 */
export type GenericOrchestratorEventHandler = (event: OrchestratorEventTyped) => void;

/**
 * Map of event handlers by event type
 */
export type OrchestratorEventHandlerMap = {
  [K in OrchestratorEventType]?: OrchestratorEventHandler<K>;
};

// ============================================================================
// Type Guards for Events
// ============================================================================

/**
 * Check if an event is a specific type
 */
export function isEventType<T extends OrchestratorEventType>(
  event: OrchestratorEventTyped,
  type: T
): event is ExtractEvent<T> {
  return event.type === type;
}

/**
 * Check if event is agent-related
 */
export function isAgentEvent(
  event: OrchestratorEventTyped
): event is
  | AgentStartedEvent
  | AgentCompletedEvent
  | AgentTimeoutEvent
  | AgentStaleEvent
  | OrchestratorAgentOutputEvent
  | AgentFailedEvent
  | AgentRetryEvent
  | AgentRetrySuccessEvent
  | AgentRetryExhaustedEvent {
  return event.type.startsWith('agent_');
}

/**
 * Check if event is run-related
 */
export function isRunEvent(
  event: OrchestratorEventTyped
): event is RunStartedEvent | RunCompletedEvent {
  return event.type === 'run_started' || event.type === 'run_completed';
}
