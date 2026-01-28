/**
 * Common test utilities for Orchestral tests
 */
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { RunState, CRP, VCR, GatekeeperVerdict, OrchestraConfig, UsageInfo, MRPEvidence, Verdict } from '../../src/types/index.js';

/**
 * Create a unique temporary directory for tests
 */
export function createTempDir(prefix: string = 'orchestral-test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const tempDir = join(tmpdir(), `${prefix}-${timestamp}-${random}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up a temporary directory
 */
export function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Generate a valid run ID for testing
 */
export function generateTestRunId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `run-${timestamp}`;
}

/**
 * Create a mock run directory structure
 */
export function createMockRunDir(baseDir: string, runId: string): string {
  const runDir = join(baseDir, '.orchestral', 'runs', runId);
  const dirs = [
    runDir,
    join(runDir, 'briefing'),
    join(runDir, 'builder'),
    join(runDir, 'builder', 'output'),
    join(runDir, 'verifier'),
    join(runDir, 'verifier', 'tests'),
    join(runDir, 'gatekeeper'),
    join(runDir, 'crp'),
    join(runDir, 'vcr'),
    join(runDir, 'mrp'),
    join(runDir, 'mrp', 'code'),
    join(runDir, 'mrp', 'tests'),
    join(runDir, 'prompts'),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  return runDir;
}

/**
 * Create a mock state.json
 */
export function createMockState(runId: string, overrides: Partial<RunState> = {}): RunState {
  const now = new Date().toISOString();

  return {
    run_id: runId,
    phase: 'refine',
    iteration: 1,
    max_iterations: 3,
    started_at: now,
    updated_at: now,
    agents: {
      refiner: { status: 'pending', usage: null },
      builder: { status: 'pending', usage: null },
      verifier: { status: 'pending', usage: null },
      gatekeeper: { status: 'pending', usage: null },
    },
    pending_crp: null,
    last_event: {
      type: 'run.started',
      timestamp: now,
    },
    errors: [],
    history: [],
    usage: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_creation_tokens: 0,
      total_cache_read_tokens: 0,
      total_cost_usd: 0,
    },
    ...overrides,
  };
}

/**
 * Create a mock CRP
 */
export function createMockCRP(crpId: string, overrides: Partial<CRP> = {}): CRP {
  return {
    crp_id: crpId,
    created_at: new Date().toISOString(),
    created_by: 'refiner',
    type: 'clarification',
    question: 'Test question?',
    context: 'Test context',
    options: [
      { id: 'A', label: 'Option A', description: 'Description A', risk: 'low' },
      { id: 'B', label: 'Option B', description: 'Description B', risk: 'medium' },
    ],
    recommendation: 'A',
    status: 'pending',
    ...overrides,
  };
}

/**
 * Create a mock VCR
 */
export function createMockVCR(vcrId: string, crpId: string, overrides: Partial<VCR> = {}): VCR {
  return {
    vcr_id: vcrId,
    crp_id: crpId,
    created_at: new Date().toISOString(),
    decision: 'A',
    rationale: 'Test rationale',
    applies_to_future: false,
    ...overrides,
  };
}

/**
 * Create a mock verdict
 */
export function createMockVerdict(
  verdict: 'PASS' | 'FAIL' | 'NEEDS_HUMAN',
  overrides: Partial<GatekeeperVerdict> = {}
): GatekeeperVerdict {
  return {
    verdict,
    reason: `Verdict: ${verdict}`,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock usage info
 */
export function createMockUsageInfo(overrides: Partial<UsageInfo> = {}): UsageInfo {
  return {
    input_tokens: 1000,
    output_tokens: 500,
    cache_creation_tokens: 100,
    cache_read_tokens: 200,
    cost_usd: 0.01,
    ...overrides,
  };
}

/**
 * Create a mock MRP evidence
 */
export function createMockMRPEvidence(
  runId: string,
  verdict: Verdict = 'PASS',
  overrides: Partial<MRPEvidence> = {}
): MRPEvidence {
  return {
    run_id: runId,
    completed_at: new Date().toISOString(),
    tests: {
      total: 10,
      passed: verdict === 'PASS' ? 10 : 8,
      failed: verdict === 'PASS' ? 0 : 2,
      coverage: 85,
    },
    files_changed: ['src/index.ts', 'src/utils.ts'],
    files_created: ['src/new-file.ts'],
    lines_added: 150,
    lines_deleted: 30,
    net_change: 120,
    decisions: ['Implemented feature X', 'Used library Y'],
    iterations: 2,
    max_iterations: 3,
    logs: {
      refiner: '.orchestral/runs/' + runId + '/refiner.log',
      builder: '.orchestral/runs/' + runId + '/builder.log',
      verifier: '.orchestral/runs/' + runId + '/verifier.log',
      gatekeeper: '.orchestral/runs/' + runId + '/gatekeeper.log',
    },
    edge_cases_tested: ['null input', 'empty string', 'unicode characters'],
    adversarial_findings: verdict === 'FAIL' ? ['Potential XSS vulnerability'] : [],
    verdict,
    ready_for_merge: verdict === 'PASS',
    gatekeeper_confidence: verdict === 'PASS' ? 'High - all tests passing' : 'Low - issues found',
    usage: {
      by_agent: {
        refiner: createMockUsageInfo({ cost_usd: 0.005 }),
        builder: createMockUsageInfo({ cost_usd: 0.015 }),
        verifier: createMockUsageInfo({ cost_usd: 0.008 }),
        gatekeeper: createMockUsageInfo({ cost_usd: 0.012 }),
      },
      total: {
        total_input_tokens: 4000,
        total_output_tokens: 2000,
        total_cache_creation_tokens: 400,
        total_cache_read_tokens: 800,
        total_cost_usd: 0.04,
      },
      iterations: 2,
    },
    ...overrides,
  };
}

/**
 * Write a mock state file to disk
 */
export function writeMockState(runDir: string, state: RunState): void {
  const statePath = join(runDir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Write a mock CRP file to disk
 */
export function writeMockCRP(runDir: string, crp: CRP): void {
  const crpPath = join(runDir, 'crp', `${crp.crp_id}.json`);
  writeFileSync(crpPath, JSON.stringify(crp, null, 2), 'utf-8');
}

/**
 * Write a mock VCR file to disk
 */
export function writeMockVCR(runDir: string, vcr: VCR): void {
  const vcrPath = join(runDir, 'vcr', `${vcr.vcr_id}.json`);
  writeFileSync(vcrPath, JSON.stringify(vcr, null, 2), 'utf-8');
}

/**
 * Write a mock verdict file to disk
 */
export function writeMockVerdict(runDir: string, verdict: GatekeeperVerdict): void {
  const verdictPath = join(runDir, 'gatekeeper', 'verdict.json');
  writeFileSync(verdictPath, JSON.stringify(verdict, null, 2), 'utf-8');
}

/**
 * Write a mock MRP evidence file to disk
 */
export function writeMockMRPEvidence(runDir: string, evidence: MRPEvidence): void {
  const evidencePath = join(runDir, 'mrp', 'evidence.json');
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf-8');
}

/**
 * Write a mock MRP summary file to disk
 */
export function writeMockMRPSummary(runDir: string, summary: string): void {
  const summaryPath = join(runDir, 'mrp', 'summary.md');
  writeFileSync(summaryPath, summary, 'utf-8');
}

/**
 * Create a done.flag file
 */
export function createDoneFlag(runDir: string, agent: 'builder' | 'verifier'): void {
  const flagPath = join(runDir, agent, 'done.flag');
  writeFileSync(flagPath, new Date().toISOString(), 'utf-8');
}

/**
 * Default test config
 */
export function getDefaultTestConfig(): OrchestraConfig {
  return {
    global: {
      max_iterations: 3,
      tmux_session_prefix: 'orchestral-test',
      web_port: 3001,
      log_level: 'info',
      timeouts: {
        refiner: 300000,
        builder: 600000,
        verifier: 300000,
        gatekeeper: 300000,
      },
      timeout_action: 'warn',
      notifications: {
        terminal_bell: false,
        system_notify: false,
      },
      auto_retry: {
        enabled: true,
        max_attempts: 2,
        recoverable_errors: ['crash', 'timeout', 'validation'],
      },
    },
    refiner: {
      model: 'haiku',
      auto_fill: {
        allowed: ['numeric_defaults', 'naming', 'file_paths'],
        forbidden: ['architecture', 'external_deps', 'security'],
      },
      delegation_keywords: ['적당히', '알아서', '합리적으로'],
      max_refinement_iterations: 2,
    },
    builder: {
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
    },
    verifier: {
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
    },
    gatekeeper: {
      model: 'sonnet',
      pass_criteria: {
        tests_passing: true,
        no_critical_issues: true,
        min_test_coverage: 80,
      },
      max_iterations: 3,
      auto_crp_triggers: ['security_concern', 'breaking_change', 'external_dependency_addition'],
    },
  };
}

/**
 * Wait for a specified amount of time
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a sample briefing content
 */
export function getSampleBriefing(): string {
  return `# Test Briefing

## Objective
Create a simple utility function for string manipulation.

## Requirements
- Function should trim whitespace
- Function should normalize line endings
- Return empty string for null input

## Constraints
- Pure TypeScript, no external dependencies
- Must have unit tests
`;
}
