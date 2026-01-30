import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { OrchestraConfig, GatekeeperVerdict } from '../../../src/types/index.js';

// Mock MRPGenerator
vi.mock('../../../src/core/mrp-generator.js', () => ({
  MRPGenerator: class MockMRPGenerator {
    generate = vi.fn();
  },
}));

import { VerdictHandler } from '../../../src/core/verdict-handler.js';

describe('VerdictHandler', () => {
  let handler: VerdictHandler;
  let mockPhaseManager: any;
  let mockPromptGenerator: any;
  let mockRunManager: any;
  let mockStateManager: any;
  let mockConfig: OrchestraConfig;

  beforeEach(() => {
    mockPhaseManager = {
      handleVerdict: vi.fn().mockResolvedValue({ nextPhase: 'ready_for_merge', shouldRetry: false }),
      transition: vi.fn().mockResolvedValue(true),
      incrementIteration: vi.fn().mockResolvedValue({ iteration: 2, maxExceeded: false }),
      getCurrentIteration: vi.fn().mockResolvedValue(1),
    };

    mockPromptGenerator = {
      generateAllPrompts: vi.fn().mockResolvedValue(undefined),
    };

    mockRunManager = {
      getRunDir: vi.fn().mockReturnValue('/test/project/.dure/runs/run-20260126000000'),
    };

    mockStateManager = {
      loadState: vi.fn().mockResolvedValue({
        run_id: 'run-20260126000000',
        phase: 'gate',
        iteration: 1,
        max_iterations: 3,
        minor_fix_attempts: 0,
        max_minor_fix_attempts: 2,
      }),
      resetMinorFixAttempts: vi.fn().mockResolvedValue(undefined),
      incrementMinorFixAttempt: vi.fn().mockResolvedValue(undefined),
    };

    mockConfig = {
      global: {
        max_iterations: 3,
        tmux_session_prefix: 'dure-test',
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
        auto_fill: { allowed: [], forbidden: [] },
        delegation_keywords: [],
        max_refinement_iterations: 2,
      },
      builder: {
        model: 'sonnet',
        style: { prefer_libraries: [], avoid_libraries: [], code_style: 'default' },
        constraints: { max_file_size_lines: 500, require_types: false },
      },
      verifier: {
        model: 'haiku',
        test_coverage: { min_percentage: 80, require_edge_cases: true, require_error_cases: true },
        adversarial: { enabled: true, max_attack_vectors: 5 },
      },
      gatekeeper: {
        model: 'sonnet',
        pass_criteria: { tests_passing: true, no_critical_issues: true, min_test_coverage: 80 },
        max_iterations: 3,
        auto_crp_triggers: [],
      },
    };

    handler = new VerdictHandler(
      mockPhaseManager,
      mockPromptGenerator,
      mockRunManager,
      mockConfig,
      '/test/project'
    );
  });

  describe('processVerdict', () => {
    describe('PASS verdict', () => {
      it('should return complete action with mrp path', async () => {
        const verdict: GatekeeperVerdict = {
          verdict: 'PASS',
          reason: 'All tests passed',
          timestamp: new Date().toISOString(),
        };

        const result = await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(result.action).toBe('complete');
        expect((result as any).mrpPath).toContain('mrp');
      });

      it('should emit verdict_pass event', async () => {
        const verdict: GatekeeperVerdict = {
          verdict: 'PASS',
          reason: 'All tests passed',
          timestamp: new Date().toISOString(),
        };

        const events: any[] = [];
        handler.on('verdict_event', (event) => events.push(event));

        await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(events.some(e => e.type === 'verdict_pass')).toBe(true);
        expect(events.some(e => e.type === 'mrp_generated')).toBe(true);
      });
    });

    describe('FAIL verdict', () => {
      it('should return retry action when retry is allowed', async () => {
        mockPhaseManager.handleVerdict.mockResolvedValue({ nextPhase: 'build', shouldRetry: true });

        const verdict: GatekeeperVerdict = {
          verdict: 'FAIL',
          reason: 'Tests failed',
          timestamp: new Date().toISOString(),
        };

        const result = await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(result.action).toBe('retry');
        expect((result as any).iteration).toBe(2);
      });

      it('should return fail action when max iterations exceeded', async () => {
        mockPhaseManager.handleVerdict.mockResolvedValue({ nextPhase: 'failed', shouldRetry: false });

        const verdict: GatekeeperVerdict = {
          verdict: 'FAIL',
          reason: 'Tests failed',
          timestamp: new Date().toISOString(),
        };

        const result = await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(result.action).toBe('fail');
        expect((result as any).reason).toContain('Max iterations');
      });

      it('should emit verdict_fail event when max iterations exceeded', async () => {
        mockPhaseManager.handleVerdict.mockResolvedValue({ nextPhase: 'failed', shouldRetry: false });

        const verdict: GatekeeperVerdict = {
          verdict: 'FAIL',
          reason: 'Tests failed',
          timestamp: new Date().toISOString(),
        };

        const events: any[] = [];
        handler.on('verdict_event', (event) => events.push(event));

        await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(events.some(e => e.type === 'verdict_fail' && e.maxIterations === true)).toBe(true);
      });

      it('should call incrementIteration when retrying', async () => {
        mockPhaseManager.handleVerdict.mockResolvedValue({ nextPhase: 'build', shouldRetry: true });

        const verdict: GatekeeperVerdict = {
          verdict: 'FAIL',
          reason: 'Tests failed',
          timestamp: new Date().toISOString(),
        };

        await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(mockPhaseManager.incrementIteration).toHaveBeenCalled();
      });
    });

    describe('NEEDS_HUMAN verdict', () => {
      it('should return wait_human action', async () => {
        mockPhaseManager.handleVerdict.mockResolvedValue({ nextPhase: 'waiting_human', shouldRetry: false });

        const verdict: GatekeeperVerdict = {
          verdict: 'NEEDS_HUMAN',
          reason: 'Need human decision',
          timestamp: new Date().toISOString(),
        };

        const result = await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(result.action).toBe('wait_human');
      });

      it('should emit verdict_needs_human event', async () => {
        mockPhaseManager.handleVerdict.mockResolvedValue({ nextPhase: 'waiting_human', shouldRetry: false });

        const verdict: GatekeeperVerdict = {
          verdict: 'NEEDS_HUMAN',
          reason: 'Need human decision',
          timestamp: new Date().toISOString(),
        };

        const events: any[] = [];
        handler.on('verdict_event', (event) => events.push(event));

        await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(events.some(e => e.type === 'verdict_needs_human')).toBe(true);
      });
    });

    describe('MINOR_FAIL verdict', () => {
      it('should return minor_fix action when minor fix is allowed', async () => {
        mockPhaseManager.handleVerdict.mockResolvedValue({ nextPhase: 'verify', shouldRetry: false, isMinorFix: true });
        mockStateManager.loadState.mockResolvedValue({
          run_id: 'run-20260126000000',
          phase: 'gate',
          iteration: 1,
          max_iterations: 3,
          minor_fix_attempts: 1,
          max_minor_fix_attempts: 2,
        });

        const verdict: GatekeeperVerdict = {
          verdict: 'MINOR_FAIL',
          reason: '2 tests failed, applying targeted fix',
          timestamp: new Date().toISOString(),
        };

        const result = await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(result.action).toBe('minor_fix');
        expect((result as any).attempt).toBe(1);
        expect(mockStateManager.incrementMinorFixAttempt).toHaveBeenCalled();
      });

      it('should fall back to retry when minor fix attempts exceeded', async () => {
        mockPhaseManager.handleVerdict.mockResolvedValue({ nextPhase: 'build', shouldRetry: true, isMinorFix: false });

        const verdict: GatekeeperVerdict = {
          verdict: 'MINOR_FAIL',
          reason: 'Minor fix attempts exhausted',
          timestamp: new Date().toISOString(),
        };

        const result = await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(result.action).toBe('retry');
        expect(mockStateManager.resetMinorFixAttempts).toHaveBeenCalled();
      });

      it('should fail when minor fix exhausted and max iterations exceeded', async () => {
        mockPhaseManager.handleVerdict.mockResolvedValue({ nextPhase: 'failed', shouldRetry: false, isMinorFix: false });

        const verdict: GatekeeperVerdict = {
          verdict: 'MINOR_FAIL',
          reason: 'Minor fix attempts exhausted',
          timestamp: new Date().toISOString(),
        };

        const result = await handler.processVerdict(verdict, 'run-20260126000000', mockStateManager);

        expect(result.action).toBe('fail');
      });
    });
  });

  describe('executeVerdictResult', () => {
    it('should transition to ready_for_merge on complete', async () => {
      const result = { action: 'complete' as const, mrpPath: '/test/mrp' };

      await handler.executeVerdictResult(result, 'run-20260126000000', mockStateManager);

      expect(mockPhaseManager.transition).toHaveBeenCalledWith('ready_for_merge');
    });

    it('should regenerate prompts and transition to build on retry', async () => {
      const result = { action: 'retry' as const, iteration: 2 };

      await handler.executeVerdictResult(result, 'run-20260126000000', mockStateManager);

      expect(mockPromptGenerator.generateAllPrompts).toHaveBeenCalled();
      expect(mockPhaseManager.transition).toHaveBeenCalledWith('build');
    });

    it('should transition to failed on fail', async () => {
      const result = { action: 'fail' as const, reason: 'Max iterations exceeded' };

      await handler.executeVerdictResult(result, 'run-20260126000000', mockStateManager);

      expect(mockPhaseManager.transition).toHaveBeenCalledWith('failed');
    });

    it('should not transition on wait_human', async () => {
      const result = { action: 'wait_human' as const, crpId: 'crp-001' };

      await handler.executeVerdictResult(result, 'run-20260126000000', mockStateManager);

      expect(mockPhaseManager.transition).not.toHaveBeenCalled();
    });

    it('should transition to verify on minor_fix', async () => {
      const result = { action: 'minor_fix' as const, attempt: 1 };

      await handler.executeVerdictResult(result, 'run-20260126000000', mockStateManager);

      expect(mockPhaseManager.transition).toHaveBeenCalledWith('verify');
    });
  });

  describe('regeneratePromptsForRetry', () => {
    it('should generate prompts with has_review flag', async () => {
      await handler.regeneratePromptsForRetry('run-20260126000000', 2, mockStateManager);

      expect(mockPromptGenerator.generateAllPrompts).toHaveBeenCalledWith(
        expect.stringContaining('prompts'),
        expect.objectContaining({
          project_root: '/test/project',
          run_id: 'run-20260126000000',
          has_review: true,
        })
      );
    });

    it('should emit prompts_regenerated event', async () => {
      const events: any[] = [];
      handler.on('verdict_event', (event) => events.push(event));

      await handler.regeneratePromptsForRetry('run-20260126000000', 2, mockStateManager);

      expect(events.some(e => e.type === 'prompts_regenerated')).toBe(true);
    });
  });

  describe('getPhaseManager', () => {
    it('should return the phase manager', () => {
      expect(handler.getPhaseManager()).toBe(mockPhaseManager);
    });
  });

  describe('isMaxIterationsExceeded', () => {
    it('should return false when iterations not exceeded', async () => {
      mockStateManager.loadState.mockResolvedValue({
        iteration: 1,
        max_iterations: 3,
      });

      const result = await handler.isMaxIterationsExceeded(mockStateManager);
      expect(result).toBe(false);
    });

    it('should return true when iterations exceeded', async () => {
      mockStateManager.loadState.mockResolvedValue({
        iteration: 3,
        max_iterations: 3,
      });

      const result = await handler.isMaxIterationsExceeded(mockStateManager);
      expect(result).toBe(true);
    });

    it('should return false when state is null', async () => {
      mockStateManager.loadState.mockResolvedValue(null);

      const result = await handler.isMaxIterationsExceeded(mockStateManager);
      expect(result).toBe(false);
    });
  });

  describe('getCurrentIteration', () => {
    it('should return current iteration from phase manager', async () => {
      mockPhaseManager.getCurrentIteration.mockResolvedValue(2);

      const result = await handler.getCurrentIteration(mockStateManager);
      expect(result).toBe(2);
    });
  });
});
