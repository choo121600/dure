// Re-export Result types
export {
  type Result,
  type AsyncResult,
  type Ok,
  type Err,
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  unwrapErr,
  map,
  mapErr,
  andThen,
  fromPromise,
  tryCatch,
  collect,
} from './result.js';

// Re-export Error types
export {
  OrchestraError,
  ValidationError,
  StateError,
  AgentError,
  RecoveryError,
  TimeoutError,
  FileSystemError,
  TmuxError,
  ErrorCodes,
  type ErrorCode,
  // Type guards
  isOrchestraError,
  isValidationError,
  isStateError,
  isAgentError,
  isRecoveryError,
  isTimeoutError,
  hasErrorCode,
  // Factory functions
  createPathValidationError,
  createPathTraversalError,
  createNullBytesError,
  createMaxLengthError,
  createSessionNameError,
  createStateNotFoundError,
  createStateLoadError,
  createStateSaveError,
  createAgentError,
  createAgentStartError,
  createRecoveryExhaustedError,
  createAgentTimeoutError,
  createInactivityTimeoutError,
} from './errors.js';

// Re-export Branded types
export {
  type Brand,
  type RunId,
  type CrpId,
  type VcrId,
  type SessionName,
  type MissionId,
  type PhaseId,
  type TaskId,
  // Validation functions
  isValidRunId,
  isValidCrpId,
  isValidVcrId,
  isValidSessionName,
  isValidMissionId,
  isValidPhaseId,
  isValidTaskId,
  // Type guards
  isRunId,
  isCrpId,
  isVcrId,
  isSessionName,
  isMissionId,
  isPhaseId,
  isTaskId,
  // Creation functions (with validation)
  createRunId,
  createCrpId,
  createVcrId,
  createSessionName,
  createMissionId,
  createPhaseId,
  createTaskId,
  // Unsafe creation functions (for trusted sources)
  unsafeCreateRunId,
  unsafeCreateCrpId,
  unsafeCreateVcrId,
  unsafeCreateSessionName,
  unsafeCreateMissionId,
  unsafeCreatePhaseId,
  unsafeCreateTaskId,
  // Utility functions
  unwrapBrand,
  generateRunId,
  generateCrpId,
  generateVcrId,
  generateMissionId,
} from './branded.js';

// Re-export Event types
export {
  type BaseOrchestratorEvent,
  type RunStartedEvent,
  type PhaseChangedEvent,
  type AgentStartedEvent,
  type AgentCompletedEvent,
  type AgentTimeoutEvent,
  type AgentStaleEvent,
  type OrchestratorAgentOutputEvent,
  type AgentFailedEvent,
  type AgentRetryEvent,
  type AgentRetrySuccessEvent,
  type AgentRetryExhaustedEvent,
  type CrpCreatedEvent,
  type VcrReceivedEvent,
  type MrpReadyEvent,
  type RunCompletedEvent,
  type IterationStartedEvent,
  type UsageUpdatedEvent,
  type ModelsSelectedEvent,
  type ErrorEvent,
  type MissionCreatedEvent,
  type PlanningStageStartedEvent,
  type PlanningStageCompletedEvent,
  type PlanApprovedEvent,
  type MissionPhaseStartedEvent,
  type MissionPhaseCompletedEvent,
  type MissionTaskUpdateEvent,
  type MissionCompletedEvent,
  type OrchestratorEventTyped,
  type OrchestratorEventType,
  type ExtractEvent,
  type OrchestratorEventHandler,
  type AsyncOrchestratorEventHandler,
  type GenericOrchestratorEventHandler,
  type OrchestratorEventHandlerMap,
  // Factory functions
  createRunStartedEvent,
  createPhaseChangedEvent,
  createAgentStartedEvent,
  createAgentCompletedEvent,
  createAgentTimeoutEvent,
  createAgentStaleEvent,
  createOrchestratorAgentOutputEvent,
  createAgentFailedEvent,
  createAgentRetryEvent,
  createAgentRetrySuccessEvent,
  createAgentRetryExhaustedEvent,
  createCrpCreatedEvent,
  createVcrReceivedEvent,
  createMrpReadyEvent,
  createRunCompletedEvent,
  createIterationStartedEvent,
  createUsageUpdatedEvent,
  createModelsSelectedEvent,
  createErrorEvent,
  createMissionCreatedEvent,
  createPlanningStageStartedEvent,
  createPlanningStageCompletedEvent,
  createPlanApprovedEvent,
  createMissionPhaseStartedEvent,
  createMissionPhaseCompletedEvent,
  createMissionTaskUpdateEvent,
  createMissionCompletedEvent,
  // Constants
  MissionEventTypes,
  // Type guards
  isEventType,
  isAgentEvent,
  isRunEvent,
  isMissionEvent,
  isPlanningEvent,
} from './events.js';

// Agent Types
export type AgentName = 'refiner' | 'builder' | 'verifier' | 'gatekeeper';
export type AgentModel = 'haiku' | 'sonnet' | 'opus';
export type AgentStatus = 'pending' | 'running' | 'waiting_test_execution' | 'completed' | 'failed' | 'timeout' | 'waiting_human';

// Claude Code Headless Output (from --output-format json)
export interface ClaudeCodeOutput {
  type: 'result';
  subtype: 'success' | 'error';
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
    server_tool_use?: {
      web_search_requests: number;
      web_fetch_requests: number;
    };
    service_tier?: string;
    cache_creation?: {
      ephemeral_1h_input_tokens: number;
      ephemeral_5m_input_tokens: number;
    };
  };
  modelUsage?: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
    costUSD: number;
    contextWindow: number;
    maxOutputTokens: number;
  }>;
  permission_denials?: string[];
  uuid?: string;
}

// Phase Types
export type Phase = 'refine' | 'build' | 'verify' | 'gate' | 'waiting_human' | 'ready_for_merge' | 'completed' | 'failed';

// Verdict Types
export type Verdict = 'PASS' | 'FAIL' | 'MINOR_FAIL' | 'NEEDS_HUMAN';

// Usage Info
export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

// Total Usage
export interface TotalUsage {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_cost_usd: number;
}

// Agent State
export interface AgentState {
  status: AgentStatus;
  started_at?: string;
  completed_at?: string;
  timeout_at?: string;
  error?: string;
  usage?: UsageInfo | null;
}

// Last Event (for state.json)
export interface LastEvent {
  type: string;
  agent?: AgentName;
  timestamp: string;
}

// Run State (state.json)
export interface RunState {
  run_id: string;
  phase: Phase;
  iteration: number;
  max_iterations: number;
  minor_fix_attempts: number;
  max_minor_fix_attempts: number;
  started_at: string;
  updated_at: string;
  agents: {
    refiner: AgentState;
    builder: AgentState;
    verifier: AgentState;
    gatekeeper: AgentState;
  };
  pending_crp: string | null;
  last_event?: LastEvent;
  errors: string[];
  history: HistoryEntry[];
  usage?: TotalUsage;
  model_selection?: ModelSelectionResult;
}

export interface HistoryEntry {
  phase: Phase;
  result: string;
  timestamp: string;
}

// CRP (Consultation Request Pack)
export interface CRPOption {
  id: string;
  label: string;
  description: string;
  risk?: string;
  pros?: string[];
  cons?: string[];
}

export interface CRPQuestion {
  id: string;
  question: string;
  context?: string;
  options?: CRPOption[];
  recommendation?: string;
  required?: boolean;
}

// CRP supports both single-question (legacy) and multi-question formats
export interface CRP {
  crp_id: string;
  created_at: string;
  created_by: AgentName;
  type: 'clarification' | 'architecture' | 'security' | 'dependency' | 'architecture_decision';
  // Single question format (legacy)
  question?: string;
  context?: string;
  options?: CRPOption[];
  recommendation?: string;
  // Multi-question format
  questions?: CRPQuestion[];
  // Common fields
  status: 'pending' | 'resolved';
  additional_context?: string;
}

// VCR (Version Controlled Resolution)
export interface VCR {
  vcr_id: string;
  crp_id: string;
  created_at: string;
  // Single decision (legacy) or multi-question decision
  decision: string | Record<string, string>;
  // Multi-question decisions mapping (questionId -> optionId)
  decisions?: Record<string, string>;
  rationale: string;
  additional_notes?: string;
  applies_to_future: boolean;
}

// MRP Usage by Agent
export interface MRPUsageByAgent {
  refiner?: UsageInfo;
  builder?: UsageInfo;
  verifier?: UsageInfo;
  gatekeeper?: UsageInfo;
}

// MRP Usage
export interface MRPUsage {
  by_agent: MRPUsageByAgent;
  total: TotalUsage;
  iterations: number;
}

// MRP (Merge-Readiness Pack)
export interface MRPTestResults {
  total: number;
  passed: number;
  failed: number;
  coverage?: number;
  categories?: Record<string, unknown>;
}

export interface MRPEvidence {
  run_id?: string;
  completed_at?: string;
  tests: MRPTestResults;
  files_changed: string[];
  files_created?: string[];
  lines_added?: number;
  lines_deleted?: number;
  net_change?: number;
  decisions: string[];
  iterations: number;
  max_iterations?: number;
  logs: {
    refiner: string;
    builder: string;
    verifier: string;
    gatekeeper: string;
  };
  artifacts?: Record<string, unknown>;
  quality_metrics?: Record<string, unknown>;
  security?: Record<string, unknown>;
  compatibility?: Record<string, unknown>;
  performance?: Record<string, unknown>;
  coverage_details?: Record<string, unknown>;
  edge_cases_tested?: string[];
  adversarial_findings?: string[];
  verdict?: Verdict;
  ready_for_merge?: boolean;
  gatekeeper_confidence?: string;
  usage?: MRPUsage;
}

// Verifier Results
export interface TestFailure {
  test: string;
  reason: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  categories?: string[];
}

export interface VerifierResults {
  total: number;
  passed: number;
  failed: number;
  coverage?: number;
  failures: TestFailure[];
  edge_cases_tested: string[];
  adversarial_findings: string[];
  test_summary?: {
    model_selector_tests?: TestSummary;
    edge_cases_tests?: TestSummary;
    adversarial_tests?: TestSummary;
  };
  fix_verification?: Record<string, unknown>;
  coverage_details?: Record<string, unknown>;
  execution_time?: string;
  timestamp?: string;
}

// Gatekeeper Verdict
export interface VerdictDetails {
  tests_passing: boolean;
  tests_total: number;
  tests_passed: number;
  tests_failed: number;
  coverage_percentage?: number;
  coverage_meets_minimum?: boolean;
  critical_issues_found?: number;
  security_concerns?: number;
  breaking_changes?: number;
  external_dependencies_added?: number;
}

export interface QualityScores {
  code_quality?: string;
  design_quality?: string;
  test_quality?: string;
  documentation_quality?: string;
}

export interface GatekeeperVerdict {
  verdict: Verdict;
  reason: string;
  issues?: string[];
  timestamp: string;
  details?: VerdictDetails;
  quality_scores?: QualityScores;
  iteration?: number;
  max_iterations?: number;
  tests_passing?: boolean;
  coverage?: number;
}

// Configuration Types
export interface GlobalConfig {
  max_iterations: number;
  tmux_session_prefix: string;
  web_port: number;
  log_level: 'debug' | 'info' | 'warn' | 'error';
  timeouts: {
    refiner: number;
    builder: number;
    verifier: number;
    gatekeeper: number;
  };
  timeout_action: 'warn' | 'retry' | 'stop';
  notifications: {
    terminal_bell: boolean;
    system_notify: boolean;
  };
  auto_retry: {
    enabled: boolean;
    max_attempts: number;
    recoverable_errors: string[];
  };
  model_selection?: ModelSelectionConfig;
}

export interface RefinerConfig {
  model: AgentModel;
  auto_fill: {
    allowed: string[];
    forbidden: string[];
  };
  delegation_keywords: string[];
  max_refinement_iterations: number;
}

export interface BuilderConfig {
  model: AgentModel;
  style: {
    prefer_libraries: string[];
    avoid_libraries: string[];
    code_style: string;
  };
  constraints: {
    max_file_size_lines: number;
    require_types: boolean;
  };
}

// Test Runner Types (External Test Execution)
export type TestFramework = 'vitest' | 'jest' | 'mocha' | 'custom';

export interface TestConfig {
  test_framework: TestFramework;
  test_command: string;
  test_directory: string;
  timeout_ms: number;
  coverage: boolean;
  created_at: string;
}

export interface TestOutput {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  executed_at: string;
  test_results?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

export interface ExternalRunnerConfig {
  enabled: boolean;
  default_framework: TestFramework;
  default_timeout_ms: number;
}

export interface VerifierConfig {
  model: AgentModel;
  test_coverage: {
    min_percentage: number;
    require_edge_cases: boolean;
    require_error_cases: boolean;
  };
  adversarial: {
    enabled: boolean;
    max_attack_vectors: number;
  };
  external_runner?: ExternalRunnerConfig;
}

export interface GatekeeperConfig {
  model: AgentModel;
  pass_criteria: {
    tests_passing: boolean;
    no_critical_issues: boolean;
    min_test_coverage: number;
  };
  max_iterations: number;
  auto_crp_triggers: string[];
}

export interface OrchestraConfig {
  global: GlobalConfig;
  refiner: RefinerConfig;
  builder: BuilderConfig;
  verifier: VerifierConfig;
  gatekeeper: GatekeeperConfig;
}

// Clarifications (from Refiner)
export interface Clarification {
  field: string;
  original: string | null;
  clarified: string;
  reason: string;
}

export interface ClarificationsFile {
  clarifications: Clarification[];
  auto_filled: string[];
  timestamp: string;
}

// Builder Output Manifest
export interface BuilderOutputManifest {
  files_created: string[];
  files_modified: string[];
  timestamp: string;
}

// Event Types for Socket.io

/**
 * Event data types for different Socket.io events
 */
export interface StateChangeEventData {
  state: RunState;
}

export interface AgentStartEventData {
  agent: AgentName;
}

export interface AgentCompleteEventData {
  agent: AgentName;
}

export interface CrpCreatedEventData {
  crp_id: string;
  crp: CRP;
}

export interface VcrCreatedEventData {
  vcr_id: string;
  vcr: VCR;
}

export interface MrpCreatedEventData {
  mrp_path: string;
}

export interface ErrorEventData {
  error: string;
  agent?: AgentName;
}

/**
 * Union of all possible event data types
 */
export type RunEventData =
  | StateChangeEventData
  | AgentStartEventData
  | AgentCompleteEventData
  | CrpCreatedEventData
  | VcrCreatedEventData
  | MrpCreatedEventData
  | ErrorEventData;

/**
 * Run event type for Socket.io
 * Uses discriminated union for type-safe event handling
 */
export type RunEvent =
  | { type: 'state_change'; run_id: string; timestamp: string; data: StateChangeEventData }
  | { type: 'agent_start'; run_id: string; timestamp: string; data: AgentStartEventData }
  | { type: 'agent_complete'; run_id: string; timestamp: string; data: AgentCompleteEventData }
  | { type: 'crp_created'; run_id: string; timestamp: string; data: CrpCreatedEventData }
  | { type: 'vcr_created'; run_id: string; timestamp: string; data: VcrCreatedEventData }
  | { type: 'mrp_created'; run_id: string; timestamp: string; data: MrpCreatedEventData }
  | { type: 'error'; run_id: string; timestamp: string; data: ErrorEventData };

/**
 * Helper type to extract event data by type
 */
export type RunEventByType<T extends RunEvent['type']> = Extract<RunEvent, { type: T }>;

/**
 * Helper type to extract event data type by event type
 */
export type RunEventDataByType<T extends RunEvent['type']> = RunEventByType<T>['data'];

// Agent Timeout Configuration
export interface AgentTimeoutConfig {
  refiner: number;   // Default 300000 (5 min)
  builder: number;   // Default 600000 (10 min)
  verifier: number;  // Default 300000 (5 min)
  gatekeeper: number; // Default 300000 (5 min)
  activityCheckInterval: number; // Default 30000 (30 sec)
  maxInactivityTime: number; // Default 120000 (2 min)
}

// Output Streaming Event
export interface AgentOutputEvent {
  agent: AgentName;
  content: string;
  timestamp: string;
  isNew: boolean;
}

// Agent Activity Info
export interface AgentActivityInfo {
  lastActivity: Date;
  isStale: boolean;
  lastOutputLength: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface RunListItem {
  run_id: string;
  phase: Phase;
  iteration: number;
  started_at: string;
  updated_at: string;
}

// Prompt Template Context
export interface PromptContext {
  project_root: string;
  run_id: string;
  config: OrchestraConfig;
  iteration: number;
  has_review?: boolean;
  has_vcr?: boolean;
}

// Model Selection Types
export type ModelSelectionStrategy = 'cost_optimized' | 'balanced' | 'quality_first' | 'performance_first';

export interface ModelSelectionConfig {
  enabled: boolean;
  strategy: ModelSelectionStrategy;
  planner_model: AgentModel;  // Model used by ModelSelector itself
}

export interface ComplexityFactors {
  briefing_length: number;       // 0-100: based on character count
  technical_depth: number;       // 0-100: technical keyword density
  scope_estimate: number;        // 0-100: estimated change scope
  risk_level: number;            // 0-100: security/performance requirements
}

export interface ComplexityAnalysis {
  overall_score: number;         // 0-100
  level: 'simple' | 'medium' | 'complex';
  factors: ComplexityFactors;
  recommended_models: {
    refiner: AgentModel;
    builder: AgentModel;
    verifier: AgentModel;
    gatekeeper: AgentModel;
  };
  reasoning: string;
  estimated_cost_savings?: number;  // Estimated cost savings (%)
}

export interface ModelSelectionResult {
  models: {
    refiner: AgentModel;
    builder: AgentModel;
    verifier: AgentModel;
    gatekeeper: AgentModel;
  };
  analysis: ComplexityAnalysis;
  selection_method: 'dynamic' | 'static';  // Dynamic selection vs static config
}

// ============================================================================
// Typed versions with branded types (for gradual migration)
// ============================================================================

import type { RunId, CrpId, VcrId } from './branded.js';
import type { Result, Err } from './result.js';
import { ok, err, isErr } from './result.js';
import { ValidationError } from './errors.js';
import { createRunId, createCrpId, createVcrId, unsafeCreateRunId, unsafeCreateCrpId, unsafeCreateVcrId, unwrapBrand } from './branded.js';

/**
 * RunState with branded types for type-safe ID handling
 * Use this for new code; gradually migrate from RunState
 */
export interface RunStateTyped {
  run_id: RunId;
  phase: Phase;
  iteration: number;
  max_iterations: number;
  minor_fix_attempts: number;
  max_minor_fix_attempts: number;
  started_at: string;
  updated_at: string;
  agents: {
    refiner: AgentState;
    builder: AgentState;
    verifier: AgentState;
    gatekeeper: AgentState;
  };
  pending_crp: CrpId | null;
  last_event?: LastEvent;
  errors: string[];
  history: HistoryEntry[];
  usage?: TotalUsage;
  model_selection?: ModelSelectionResult;
}

/**
 * CRP with branded types
 */
export interface CRPTyped {
  crp_id: CrpId;
  created_at: string;
  created_by: AgentName;
  type: 'clarification' | 'architecture' | 'security' | 'dependency' | 'architecture_decision';
  question?: string;
  context?: string;
  options?: CRPOption[];
  recommendation?: string;
  questions?: CRPQuestion[];
  status: 'pending' | 'resolved';
  additional_context?: string;
}

/**
 * VCR with branded types
 */
export interface VCRTyped {
  vcr_id: VcrId;
  crp_id: CrpId;
  created_at: string;
  decision: string | Record<string, string>;
  decisions?: Record<string, string>;
  rationale: string;
  additional_notes?: string;
  applies_to_future: boolean;
}

// ============================================================================
// Conversion functions
// ============================================================================

/**
 * Convert RunState to RunStateTyped with validation
 * Returns Result to handle potential validation errors
 */
export function toTypedRunState(state: RunState): Result<RunStateTyped, ValidationError> {
  const runIdResult = createRunId(state.run_id);
  if (isErr(runIdResult)) {
    return runIdResult;
  }

  let pendingCrp: CrpId | null = null;
  if (state.pending_crp) {
    const crpIdResult = createCrpId(state.pending_crp);
    if (isErr(crpIdResult)) {
      return crpIdResult;
    }
    pendingCrp = crpIdResult.data;
  }

  return ok({
    ...state,
    run_id: runIdResult.data,
    pending_crp: pendingCrp,
  });
}

/**
 * Convert RunStateTyped back to RunState
 * Safe conversion - no validation needed
 */
export function fromTypedRunState(state: RunStateTyped): RunState {
  return {
    ...state,
    run_id: unwrapBrand(state.run_id),
    pending_crp: state.pending_crp ? unwrapBrand(state.pending_crp) : null,
  };
}

/**
 * Convert CRP to CRPTyped with validation
 */
export function toTypedCRP(crp: CRP): Result<CRPTyped, ValidationError> {
  const crpIdResult = createCrpId(crp.crp_id);
  if (isErr(crpIdResult)) {
    return crpIdResult;
  }

  return ok({
    ...crp,
    crp_id: crpIdResult.data,
  });
}

/**
 * Convert CRPTyped back to CRP
 */
export function fromTypedCRP(crp: CRPTyped): CRP {
  return {
    ...crp,
    crp_id: unwrapBrand(crp.crp_id),
  };
}

/**
 * Convert VCR to VCRTyped with validation
 */
export function toTypedVCR(vcr: VCR): Result<VCRTyped, ValidationError> {
  const vcrIdResult = createVcrId(vcr.vcr_id);
  if (isErr(vcrIdResult)) {
    return vcrIdResult;
  }

  const crpIdResult = createCrpId(vcr.crp_id);
  if (isErr(crpIdResult)) {
    return crpIdResult;
  }

  return ok({
    ...vcr,
    vcr_id: vcrIdResult.data,
    crp_id: crpIdResult.data,
  });
}

/**
 * Convert VCRTyped back to VCR
 */
export function fromTypedVCR(vcr: VCRTyped): VCR {
  return {
    ...vcr,
    vcr_id: unwrapBrand(vcr.vcr_id),
    crp_id: unwrapBrand(vcr.crp_id),
  };
}

/**
 * Unsafe conversion from RunState to RunStateTyped
 * Use only when the data is known to be valid (e.g., from trusted sources)
 */
export function unsafeToTypedRunState(state: RunState): RunStateTyped {
  return {
    ...state,
    run_id: unsafeCreateRunId(state.run_id),
    pending_crp: state.pending_crp ? unsafeCreateCrpId(state.pending_crp) : null,
  };
}

/**
 * Unsafe conversion from CRP to CRPTyped
 */
export function unsafeToTypedCRP(crp: CRP): CRPTyped {
  return {
    ...crp,
    crp_id: unsafeCreateCrpId(crp.crp_id),
  };
}

/**
 * Unsafe conversion from VCR to VCRTyped
 */
export function unsafeToTypedVCR(vcr: VCR): VCRTyped {
  return {
    ...vcr,
    vcr_id: unsafeCreateVcrId(vcr.vcr_id),
    crp_id: unsafeCreateCrpId(vcr.crp_id),
  };
}

// ============================================================================
// Init Plan Types (Multi-phase skill/agent generation)
// ============================================================================

export type InitItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type InitPhase = 'planning' | 'executing' | 'finalizing' | 'completed';

// ============================================================================
// Dashboard Types (Phase 1: Data Layer)
// ============================================================================

/**
 * Dashboard stage - simplified view of Phase for dashboard display
 */
export type DashboardStage = 'REFINE' | 'BUILD' | 'VERIFY' | 'GATE' | 'DONE' | 'FAILED' | 'WAITING_HUMAN';

/**
 * Agent display status for dashboard
 */
export type DashboardAgentStatus = 'idle' | 'running' | 'done' | 'error';

/**
 * Individual agent data for dashboard
 */
export interface DashboardAgentData {
  status: DashboardAgentStatus;
  output: string;        // Last N lines of output
  startedAt?: Date;
  finishedAt?: Date;
}

/**
 * Usage information for dashboard display
 */
export interface DashboardUsage {
  totalTokens: number;
  cost: number;
}

/**
 * CRP information for dashboard when human judgment is needed
 */
export interface DashboardCRP {
  agent: AgentName;
  question: string;
  options: string[];
}

/**
 * Progress information for dashboard
 */
export interface DashboardProgress {
  currentStep: number;
  totalSteps: number;
  retryCount: number;
}

/**
 * Complete dashboard data structure
 * Aggregates data from TmuxManager and StateManager
 */
export interface DashboardData {
  runId: string;
  stage: DashboardStage;
  agents: {
    [key in AgentName]: DashboardAgentData;
  };
  usage: DashboardUsage;
  crp?: DashboardCRP;
  progress: DashboardProgress;
  verdict?: GatekeeperVerdict;
}

/**
 * Dashboard event types
 */
export type DashboardEventType = 'update' | 'crp' | 'stage-change' | 'agent-status-change';

/**
 * Dashboard event payloads
 */
export interface DashboardUpdateEvent {
  type: 'update';
  data: DashboardData;
}

export interface DashboardCRPEvent {
  type: 'crp';
  crp: DashboardCRP;
}

export interface DashboardStageChangeEvent {
  type: 'stage-change';
  previousStage: DashboardStage;
  newStage: DashboardStage;
}

export interface DashboardAgentStatusChangeEvent {
  type: 'agent-status-change';
  agent: AgentName;
  previousStatus: DashboardAgentStatus;
  newStatus: DashboardAgentStatus;
}

export type DashboardEvent =
  | DashboardUpdateEvent
  | DashboardCRPEvent
  | DashboardStageChangeEvent
  | DashboardAgentStatusChangeEvent;

export interface InitPlanItem {
  id: string;                    // "skill-{name}" or "agent-{name}"
  type: 'skill' | 'agent';
  name: string;
  description: string;
  tier?: 'quick' | 'standard' | 'deep';  // agents only
  model?: 'haiku' | 'sonnet';
  dependencies?: string[];       // item IDs that must complete first
  status: InitItemStatus;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface InitPlan {
  version: '1.0';
  created_at: string;
  project_analysis: {
    type: string;
    stack: string[];
    patterns: string[];
  };
  items: InitPlanItem[];
  current_phase: InitPhase;
  last_updated: string;
}

// Re-export Mission Planning types
export {
  // Critique types
  type CritiqueSeverity,
  type CritiqueCategory,
  type CritiqueItem,
  type Critique,
  CRITIQUE_AUTO_APPROVE_THRESHOLD,
  // CarryForward types
  type CarryForward,
  type PhaseContext,
  type MissionGatekeeperVerdict,
  // Task types
  type MissionTaskStatus,
  type AgentConfigOverride,
  type MissionTask,
  // Phase types
  type PhaseStatus,
  type PhaseSummary,
  type MissionPhase,
  // Mission types
  type MissionStatus,
  type PlanningStage,
  type PlanDraft,
  type MissionStats,
  type Mission,
} from './mission.js';
