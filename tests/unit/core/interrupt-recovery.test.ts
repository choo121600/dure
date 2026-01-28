import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { RunState, Phase, AgentName } from '../../../src/types/index.js';

// Mock state for different test scenarios
const createMockRunState = (overrides: Partial<RunState> = {}): RunState => ({
  run_id: 'run-20260126000000',
  phase: 'build' as Phase,
  iteration: 1,
  max_iterations: 3,
  started_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  agents: {
    refiner: { status: 'completed' },
    builder: { status: 'running' },
    verifier: { status: 'pending' },
    gatekeeper: { status: 'pending' },
  },
  pending_crp: null,
  errors: [],
  history: [],
  last_event: {
    type: 'agent_started',
    agent: 'builder' as AgentName,
    timestamp: new Date().toISOString(),
  },
  ...overrides,
});

// Mock StateManager
let mockLoadState = vi.fn();
let mockUpdateAgentStatus = vi.fn();
let mockUpdatePhase = vi.fn();
let mockAddError = vi.fn();

vi.mock('../../../src/core/state-manager.js', () => ({
  StateManager: class MockStateManager {
    loadState = mockLoadState;
    updateAgentStatus = mockUpdateAgentStatus;
    updatePhase = mockUpdatePhase;
    addError = mockAddError;
  },
}));

// Mock RunManager
const mockListRuns = vi.fn();
const mockGetRunDir = vi.fn();

vi.mock('../../../src/core/run-manager.js', () => ({
  RunManager: class MockRunManager {
    listRuns = mockListRuns;
    getRunDir = mockGetRunDir;
  },
}));

// Mock TmuxManager
let mockSessionExists = vi.fn();

vi.mock('../../../src/core/tmux-manager.js', () => ({
  TmuxManager: class MockTmuxManager {
    sessionExists = mockSessionExists;
  },
}));

// Import after mocks are set up
const { InterruptRecovery, createInterruptRecovery } = await import(
  '../../../src/core/interrupt-recovery.js'
);

describe('InterruptRecovery', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mocks to default implementations
    mockLoadState = vi.fn().mockResolvedValue(createMockRunState());
    mockUpdateAgentStatus = vi.fn().mockResolvedValue(undefined);
    mockUpdatePhase = vi.fn().mockResolvedValue(undefined);
    mockAddError = vi.fn().mockResolvedValue(undefined);
    mockSessionExists = vi.fn().mockReturnValue(false);

    mockListRuns.mockResolvedValue([]);
    mockGetRunDir.mockReturnValue('/test/project/.dure/runs/run-20260126000000');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const recovery = new InterruptRecovery(projectRoot);
      expect(recovery).toBeInstanceOf(InterruptRecovery);
    });

    it('should create instance with custom options', () => {
      const recovery = new InterruptRecovery(projectRoot, {
        autoRecover: true,
        maxAgeMs: 1000 * 60 * 60, // 1 hour
        tmuxSessionPrefix: 'custom-prefix',
      });
      expect(recovery).toBeInstanceOf(InterruptRecovery);
      expect(recovery.isAutoRecoverEnabled()).toBe(true);
    });
  });

  describe('detectInterruptedRuns', () => {
    it('should return empty array when no runs exist', async () => {
      mockListRuns.mockResolvedValue([]);
      const recovery = new InterruptRecovery(projectRoot);

      const result = await recovery.detectInterruptedRuns();

      expect(result).toEqual([]);
    });

    it('should skip completed runs', async () => {
      mockListRuns.mockResolvedValue([
        {
          run_id: 'run-20260126000000',
          phase: 'completed',
          started_at: new Date().toISOString(),
        },
      ]);
      const recovery = new InterruptRecovery(projectRoot);

      const result = await recovery.detectInterruptedRuns();

      expect(result).toEqual([]);
    });

    it('should skip failed runs', async () => {
      mockListRuns.mockResolvedValue([
        {
          run_id: 'run-20260126000000',
          phase: 'failed',
          started_at: new Date().toISOString(),
        },
      ]);
      const recovery = new InterruptRecovery(projectRoot);

      const result = await recovery.detectInterruptedRuns();

      expect(result).toEqual([]);
    });

    it('should skip runs older than maxAgeMs', async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      mockListRuns.mockResolvedValue([
        {
          run_id: 'run-20260124000000',
          phase: 'build',
          started_at: oldDate.toISOString(),
        },
      ]);
      const recovery = new InterruptRecovery(projectRoot, {
        maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
      });

      const result = await recovery.detectInterruptedRuns();

      expect(result).toEqual([]);
    });

    it('should detect run in build phase', async () => {
      const recentDate = new Date();
      mockListRuns.mockResolvedValue([
        {
          run_id: 'run-20260126000000',
          phase: 'build',
          started_at: recentDate.toISOString(),
        },
      ]);
      mockLoadState.mockResolvedValue(createMockRunState({ phase: 'build' }));

      const recovery = new InterruptRecovery(projectRoot);
      const result = await recovery.detectInterruptedRuns();

      expect(result).toHaveLength(1);
      expect(result[0].runId).toBe('run-20260126000000');
      expect(result[0].phase).toBe('build');
      expect(result[0].resumeStrategy).toBe('restart_agent');
      expect(result[0].canResume).toBe(true);
    });

    it('should detect run waiting for human input', async () => {
      mockListRuns.mockResolvedValue([
        {
          run_id: 'run-20260126000000',
          phase: 'waiting_human',
          started_at: new Date().toISOString(),
        },
      ]);
      mockLoadState.mockResolvedValue(
        createMockRunState({
          phase: 'waiting_human',
          pending_crp: 'crp-001',
        })
      );

      const recovery = new InterruptRecovery(projectRoot);
      const result = await recovery.detectInterruptedRuns();

      expect(result).toHaveLength(1);
      expect(result[0].resumeStrategy).toBe('wait_human');
      expect(result[0].canResume).toBe(true);
    });

    it('should include tmux session status', async () => {
      mockListRuns.mockResolvedValue([
        {
          run_id: 'run-20260126000000',
          phase: 'build',
          started_at: new Date().toISOString(),
        },
      ]);
      mockSessionExists.mockReturnValue(true);

      const recovery = new InterruptRecovery(projectRoot);
      const result = await recovery.detectInterruptedRuns();

      expect(result[0].tmuxSessionExists).toBe(true);
    });

    it('should emit scan events', async () => {
      mockListRuns.mockResolvedValue([]);
      const recovery = new InterruptRecovery(projectRoot);

      const events: any[] = [];
      recovery.on('recovery_event', (event) => events.push(event));

      await recovery.detectInterruptedRuns();

      expect(events).toContainEqual({ type: 'scan_started' });
      expect(events).toContainEqual({ type: 'scan_completed', found: 0 });
    });
  });

  describe('prepareRecovery', () => {
    it('should prepare recovery for build phase run', async () => {
      mockLoadState.mockResolvedValue(
        createMockRunState({
          phase: 'build',
          agents: {
            refiner: { status: 'completed' },
            builder: { status: 'running' },
            verifier: { status: 'pending' },
            gatekeeper: { status: 'pending' },
          },
        })
      );

      const recovery = new InterruptRecovery(projectRoot);
      const result = await recovery.prepareRecovery('run-20260126000000');

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('restart_agent');
      expect(mockUpdateAgentStatus).toHaveBeenCalledWith('builder', 'pending');
    });

    it('should return success for wait_human strategy without action', async () => {
      mockLoadState.mockResolvedValue(
        createMockRunState({
          phase: 'waiting_human',
          pending_crp: 'crp-001',
        })
      );

      const recovery = new InterruptRecovery(projectRoot);
      const result = await recovery.prepareRecovery('run-20260126000000');

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('wait_human');
      expect(mockUpdateAgentStatus).not.toHaveBeenCalled();
    });

    it('should fail for non-resumable runs', async () => {
      mockLoadState.mockResolvedValue(
        createMockRunState({
          phase: 'ready_for_merge',
        })
      );

      const recovery = new InterruptRecovery(projectRoot);
      const result = await recovery.prepareRecovery('run-20260126000000');

      expect(result.success).toBe(false);
      expect(result.strategy).toBe('manual');
    });

    it('should handle run not found error', async () => {
      mockLoadState.mockResolvedValue(null);

      const recovery = new InterruptRecovery(projectRoot);
      const result = await recovery.prepareRecovery('run-nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should emit recovery events', async () => {
      mockLoadState.mockResolvedValue(createMockRunState({ phase: 'build' }));

      const recovery = new InterruptRecovery(projectRoot);
      const events: any[] = [];
      recovery.on('recovery_event', (event) => events.push(event));

      await recovery.prepareRecovery('run-20260126000000');

      expect(events.some((e) => e.type === 'recovery_started')).toBe(true);
      expect(events.some((e) => e.type === 'recovery_completed')).toBe(true);
    });
  });

  describe('markAsFailed', () => {
    it('should mark run as failed', async () => {
      mockLoadState.mockResolvedValue(createMockRunState());

      const recovery = new InterruptRecovery(projectRoot);
      await recovery.markAsFailed('run-20260126000000', 'Test failure reason');

      expect(mockUpdatePhase).toHaveBeenCalledWith('failed');
      expect(mockAddError).toHaveBeenCalledWith('Recovery failed: Test failure reason');
    });

    it('should throw if run not found', async () => {
      mockLoadState.mockResolvedValue(null);

      const recovery = new InterruptRecovery(projectRoot);

      await expect(recovery.markAsFailed('run-nonexistent', 'reason')).rejects.toThrow(
        'not found'
      );
    });
  });

  describe('getInterruptedRunsSummary', () => {
    it('should return no runs message when empty', async () => {
      mockListRuns.mockResolvedValue([]);

      const recovery = new InterruptRecovery(projectRoot);
      const summary = await recovery.getInterruptedRunsSummary();

      expect(summary).toBe('No interrupted runs detected.');
    });

    it('should return formatted summary with runs', async () => {
      mockListRuns.mockResolvedValue([
        {
          run_id: 'run-20260126000000',
          phase: 'build',
          started_at: new Date().toISOString(),
        },
      ]);
      mockLoadState.mockResolvedValue(createMockRunState({ phase: 'build' }));

      const recovery = new InterruptRecovery(projectRoot);
      const summary = await recovery.getInterruptedRunsSummary();

      expect(summary).toContain('1 interrupted run(s)');
      expect(summary).toContain('run-20260126000000');
      expect(summary).toContain('Phase: build');
    });
  });

  describe('recovery strategies', () => {
    const testCases: Array<{
      phase: Phase;
      expectedStrategy: string;
      expectedCanResume: boolean;
    }> = [
      { phase: 'refine', expectedStrategy: 'restart_agent', expectedCanResume: true },
      { phase: 'build', expectedStrategy: 'restart_agent', expectedCanResume: true },
      { phase: 'verify', expectedStrategy: 'restart_agent', expectedCanResume: true },
      { phase: 'gate', expectedStrategy: 'restart_agent', expectedCanResume: true },
      { phase: 'waiting_human', expectedStrategy: 'wait_human', expectedCanResume: true },
      { phase: 'ready_for_merge', expectedStrategy: 'manual', expectedCanResume: false },
    ];

    for (const { phase, expectedStrategy, expectedCanResume } of testCases) {
      it(`should return ${expectedStrategy} strategy for ${phase} phase`, async () => {
        mockListRuns.mockResolvedValue([
          {
            run_id: 'run-20260126000000',
            phase,
            started_at: new Date().toISOString(),
          },
        ]);
        mockLoadState.mockResolvedValue(createMockRunState({ phase }));

        const recovery = new InterruptRecovery(projectRoot);
        const result = await recovery.detectInterruptedRuns();

        expect(result[0].resumeStrategy).toBe(expectedStrategy);
        expect(result[0].canResume).toBe(expectedCanResume);
      });
    }
  });

  describe('createInterruptRecovery factory', () => {
    it('should create instance with config', () => {
      const config = {
        global: {
          tmux_session_prefix: 'custom-prefix',
          max_iterations: 3,
          web_port: 3000,
          log_level: 'info' as const,
          timeouts: { refiner: 300000, builder: 600000, verifier: 300000, gatekeeper: 300000 },
          timeout_action: 'warn' as const,
          notifications: { terminal_bell: false, system_notify: false },
          auto_retry: { enabled: true, max_attempts: 3, recoverable_errors: [] },
        },
        refiner: {} as any,
        builder: {} as any,
        verifier: {} as any,
        gatekeeper: {} as any,
      };

      const recovery = createInterruptRecovery(projectRoot, config);

      expect(recovery).toBeInstanceOf(InterruptRecovery);
    });
  });
});
