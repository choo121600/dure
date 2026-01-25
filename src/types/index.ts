// Agent Types
export type AgentName = 'refiner' | 'builder' | 'verifier' | 'gatekeeper';
export type AgentModel = 'haiku' | 'sonnet' | 'opus';
export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'waiting_human';

// Phase Types
export type Phase = 'refine' | 'build' | 'verify' | 'gate' | 'waiting_human' | 'ready_for_merge' | 'completed' | 'failed';

// Verdict Types
export type Verdict = 'PASS' | 'FAIL' | 'NEEDS_HUMAN';

// Agent State
export interface AgentState {
  status: AgentStatus;
  started_at?: string;
  completed_at?: string;
  timeout_at?: string;
  error?: string;
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
  risk: string;
}

export interface CRP {
  crp_id: string;
  created_at: string;
  created_by: AgentName;
  type: 'clarification' | 'architecture' | 'security' | 'dependency';
  question: string;
  context: string;
  options: CRPOption[];
  recommendation: string;
  status: 'pending' | 'resolved';
}

// VCR (Version Controlled Resolution)
export interface VCR {
  vcr_id: string;
  crp_id: string;
  created_at: string;
  decision: string;
  rationale: string;
  additional_notes?: string;
  applies_to_future: boolean;
}

// MRP (Merge-Readiness Pack)
export interface MRPEvidence {
  tests: {
    total: number;
    passed: number;
    failed: number;
    coverage?: number;
  };
  files_changed: string[];
  decisions: string[];
  iterations: number;
  logs: {
    refiner: string;
    builder: string;
    verifier: string;
    gatekeeper: string;
  };
}

// Verifier Results
export interface TestFailure {
  test: string;
  reason: string;
}

export interface VerifierResults {
  total: number;
  passed: number;
  failed: number;
  coverage?: number;
  failures: TestFailure[];
  edge_cases_tested: string[];
  adversarial_findings: string[];
}

// Gatekeeper Verdict
export interface GatekeeperVerdict {
  verdict: Verdict;
  reason: string;
  issues?: string[];
  timestamp: string;
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
export interface RunEvent {
  type: 'state_change' | 'agent_start' | 'agent_complete' | 'crp_created' | 'vcr_created' | 'mrp_created' | 'error';
  run_id: string;
  timestamp: string;
  data: unknown;
}

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
