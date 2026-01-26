import type {
  GlobalConfig,
  RefinerConfig,
  BuilderConfig,
  VerifierConfig,
  GatekeeperConfig,
  OrchestraConfig,
  AgentTimeoutConfig,
  ModelSelectionConfig,
} from '../types/index.js';

export const defaultModelSelectionConfig: ModelSelectionConfig = {
  enabled: false,  // 기본은 비활성화 (기존 동작 유지)
  strategy: 'balanced',
  planner_model: 'haiku',
};

export const defaultGlobalConfig: GlobalConfig = {
  max_iterations: 3,
  tmux_session_prefix: 'orchestral',
  web_port: 3000,
  log_level: 'info',
  timeouts: {
    refiner: 300000,
    builder: 600000,
    verifier: 300000,
    gatekeeper: 300000,
  },
  timeout_action: 'warn',
  notifications: {
    terminal_bell: true,
    system_notify: false,
  },
  auto_retry: {
    enabled: true,
    max_attempts: 2,
    recoverable_errors: ['crash', 'timeout', 'validation'],
  },
  model_selection: defaultModelSelectionConfig,
};

export const defaultRefinerConfig: RefinerConfig = {
  model: 'haiku',
  auto_fill: {
    allowed: ['numeric_defaults', 'naming', 'file_paths'],
    forbidden: ['architecture', 'external_deps', 'security'],
  },
  delegation_keywords: ['적당히', '알아서', '합리적으로', 'reasonable', 'appropriate'],
  max_refinement_iterations: 2,
};

export const defaultBuilderConfig: BuilderConfig = {
  model: 'sonnet',
  style: {
    prefer_libraries: [],
    avoid_libraries: [],
    code_style: 'default',
  },
  constraints: {
    max_file_size_lines: 500,
    require_types: false,
  },
};

export const defaultVerifierConfig: VerifierConfig = {
  model: 'haiku',
  test_coverage: {
    min_percentage: 80,
    require_edge_cases: true,
    require_error_cases: true,
  },
  adversarial: {
    enabled: true,
    max_attack_vectors: 5,
  },
};

export const defaultGatekeeperConfig: GatekeeperConfig = {
  model: 'sonnet',
  pass_criteria: {
    tests_passing: true,
    no_critical_issues: true,
    min_test_coverage: 80,
  },
  max_iterations: 3,
  auto_crp_triggers: ['security_concern', 'breaking_change', 'external_dependency_addition'],
};

export const defaultConfig: OrchestraConfig = {
  global: defaultGlobalConfig,
  refiner: defaultRefinerConfig,
  builder: defaultBuilderConfig,
  verifier: defaultVerifierConfig,
  gatekeeper: defaultGatekeeperConfig,
};

export const defaultTimeoutConfig: AgentTimeoutConfig = {
  refiner: 300000,    // 5 minutes
  builder: 600000,    // 10 minutes
  verifier: 300000,   // 5 minutes
  gatekeeper: 300000, // 5 minutes
  activityCheckInterval: 30000, // 30 seconds
  maxInactivityTime: 120000,    // 2 minutes
};
