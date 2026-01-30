/**
 * Enhanced event types for Orchestrator
 * Provides type-safe event handling with branded types
 */

import type { AgentName, Phase, UsageInfo, TotalUsage, ModelSelectionResult, Verdict } from './index.js';
import type { RunId, CrpId, VcrId, MissionId, PhaseId, TaskId } from './branded.js';
import { unsafeCreateRunId } from './branded.js';
import type { MissionTaskStatus, MissionStats } from './mission.js';
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

/**
 * Emitted when an agent is manually rerun by the user
 */
export interface AgentManualRerunEvent extends BaseOrchestratorEvent {
  type: 'agent_manual_rerun';
  agent: AgentName;
}

// ============================================================================
// Mission Planning Events (Task 1.3)
// ============================================================================

/**
 * Emitted when a new mission is created
 */
export interface MissionCreatedEvent extends BaseOrchestratorEvent {
  type: 'mission_created';
  missionId: MissionId;
  title: string;
}

/**
 * Emitted when a planning stage starts (Planner or Critic)
 */
export interface PlanningStageStartedEvent extends BaseOrchestratorEvent {
  type: 'planning_stage_started';
  missionId: MissionId;
  stage: 'planner' | 'critic';
  iteration: number;
}

/**
 * Emitted when a planning stage completes
 */
export interface PlanningStageCompletedEvent extends BaseOrchestratorEvent {
  type: 'planning_stage_completed';
  missionId: MissionId;
  stage: 'planner' | 'critic';
  iteration: number;
  result: 'success' | 'needs_revision' | 'needs_human';
}

/**
 * Emitted when a plan is approved (automatically or by human)
 */
export interface PlanApprovedEvent extends BaseOrchestratorEvent {
  type: 'plan_approved';
  missionId: MissionId;
  totalPhases: number;
  totalTasks: number;
  approvedBy: 'auto' | 'human';
}

/**
 * Emitted when a mission phase starts
 */
export interface MissionPhaseStartedEvent extends BaseOrchestratorEvent {
  type: 'mission_phase_started';
  missionId: MissionId;
  phaseId: PhaseId;
  phaseNumber: number;
}

/**
 * Emitted when a mission phase completes
 */
export interface MissionPhaseCompletedEvent extends BaseOrchestratorEvent {
  type: 'mission_phase_completed';
  missionId: MissionId;
  phaseId: PhaseId;
  phaseNumber: number;
  tasksCompleted: number;
  tasksFailed: number;
}

/**
 * Emitted when a mission task status changes
 */
export interface MissionTaskUpdateEvent extends BaseOrchestratorEvent {
  type: 'mission_task_update';
  missionId: MissionId;
  taskId: TaskId;
  previousStatus: MissionTaskStatus;
  newStatus: MissionTaskStatus;
  taskRunId?: string;  // Associated Run ID if task is executing (renamed to avoid conflict with base)
}

/**
 * Emitted when a mission completes (success, failure, or cancellation)
 */
export interface MissionCompletedEvent extends BaseOrchestratorEvent {
  type: 'mission_completed';
  missionId: MissionId;
  status: 'completed' | 'failed' | 'cancelled';
  stats: MissionStats;
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
  | ErrorEvent
  | AgentManualRerunEvent
  | MissionCreatedEvent
  | PlanningStageStartedEvent
  | PlanningStageCompletedEvent
  | PlanApprovedEvent
  | MissionPhaseStartedEvent
  | MissionPhaseCompletedEvent
  | MissionTaskUpdateEvent
  | MissionCompletedEvent;

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

/**
 * Create an agent manual rerun event
 */
export function createAgentManualRerunEvent(runId: RunId, agent: AgentName): AgentManualRerunEvent {
  return {
    type: 'agent_manual_rerun',
    runId,
    agent,
    timestamp: new Date(),
  };
}

// ============================================================================
// Mission Event Constants
// ============================================================================

/**
 * Mission event type constants
 */
export const MissionEventTypes = {
  MISSION_CREATED: 'mission_created',
  PLANNING_STAGE_STARTED: 'planning_stage_started',
  PLANNING_STAGE_COMPLETED: 'planning_stage_completed',
  PLAN_APPROVED: 'plan_approved',
  MISSION_PHASE_STARTED: 'mission_phase_started',
  MISSION_PHASE_COMPLETED: 'mission_phase_completed',
  MISSION_TASK_UPDATE: 'mission_task_update',
  MISSION_COMPLETED: 'mission_completed',
} as const;

// ============================================================================
// Mission Event Factory Functions
// ============================================================================

/**
 * Create a mission created event
 */
export function createMissionCreatedEvent(
  missionId: MissionId,
  title: string
): MissionCreatedEvent {
  return {
    type: 'mission_created',
    runId: unsafeCreateRunId('run-00000000000000'), // Placeholder - missions don't have runId
    missionId,
    title,
    timestamp: new Date(),
  };
}

/**
 * Create a planning stage started event
 */
export function createPlanningStageStartedEvent(
  missionId: MissionId,
  stage: 'planner' | 'critic',
  iteration: number
): PlanningStageStartedEvent {
  return {
    type: 'planning_stage_started',
    runId: unsafeCreateRunId('run-00000000000000'),
    missionId,
    stage,
    iteration,
    timestamp: new Date(),
  };
}

/**
 * Create a planning stage completed event
 */
export function createPlanningStageCompletedEvent(
  missionId: MissionId,
  stage: 'planner' | 'critic',
  iteration: number,
  result: 'success' | 'needs_revision' | 'needs_human'
): PlanningStageCompletedEvent {
  return {
    type: 'planning_stage_completed',
    runId: unsafeCreateRunId('run-00000000000000'),
    missionId,
    stage,
    iteration,
    result,
    timestamp: new Date(),
  };
}

/**
 * Create a plan approved event
 */
export function createPlanApprovedEvent(
  missionId: MissionId,
  totalPhases: number,
  totalTasks: number,
  approvedBy: 'auto' | 'human'
): PlanApprovedEvent {
  return {
    type: 'plan_approved',
    runId: unsafeCreateRunId('run-00000000000000'),
    missionId,
    totalPhases,
    totalTasks,
    approvedBy,
    timestamp: new Date(),
  };
}

/**
 * Create a mission phase started event
 */
export function createMissionPhaseStartedEvent(
  missionId: MissionId,
  phaseId: PhaseId,
  phaseNumber: number
): MissionPhaseStartedEvent {
  return {
    type: 'mission_phase_started',
    runId: unsafeCreateRunId('run-00000000000000'),
    missionId,
    phaseId,
    phaseNumber,
    timestamp: new Date(),
  };
}

/**
 * Create a mission phase completed event
 */
export function createMissionPhaseCompletedEvent(
  missionId: MissionId,
  phaseId: PhaseId,
  phaseNumber: number,
  tasksCompleted: number,
  tasksFailed: number
): MissionPhaseCompletedEvent {
  return {
    type: 'mission_phase_completed',
    runId: unsafeCreateRunId('run-00000000000000'),
    missionId,
    phaseId,
    phaseNumber,
    tasksCompleted,
    tasksFailed,
    timestamp: new Date(),
  };
}

/**
 * Create a mission task update event
 */
export function createMissionTaskUpdateEvent(
  missionId: MissionId,
  taskId: TaskId,
  previousStatus: MissionTaskStatus,
  newStatus: MissionTaskStatus,
  taskRunId?: string
): MissionTaskUpdateEvent {
  return {
    type: 'mission_task_update',
    runId: unsafeCreateRunId('run-00000000000000'),
    missionId,
    taskId,
    previousStatus,
    newStatus,
    taskRunId,
    timestamp: new Date(),
  };
}

/**
 * Create a mission completed event
 */
export function createMissionCompletedEvent(
  missionId: MissionId,
  status: 'completed' | 'failed' | 'cancelled',
  stats: MissionStats
): MissionCompletedEvent {
  return {
    type: 'mission_completed',
    runId: unsafeCreateRunId('run-00000000000000'),
    missionId,
    status,
    stats,
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

/**
 * Check if event is mission-related
 */
export function isMissionEvent(
  event: OrchestratorEventTyped
): event is
  | MissionCreatedEvent
  | PlanningStageStartedEvent
  | PlanningStageCompletedEvent
  | PlanApprovedEvent
  | MissionPhaseStartedEvent
  | MissionPhaseCompletedEvent
  | MissionTaskUpdateEvent
  | MissionCompletedEvent {
  return (
    event.type.startsWith('mission_') ||
    event.type.startsWith('planning_') ||
    event.type === 'plan_approved'
  );
}

/**
 * Check if event is planning-related
 */
export function isPlanningEvent(
  event: OrchestratorEventTyped
): event is PlanningStageStartedEvent | PlanningStageCompletedEvent | PlanApprovedEvent {
  return event.type.startsWith('planning_') || event.type === 'plan_approved';
}
