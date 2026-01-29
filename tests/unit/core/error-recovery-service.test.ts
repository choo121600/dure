import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { OrchestraConfig, AgentModel } from '../../../src/types/index.js';
import type { ErrorFlag } from '../../../src/core/file-watcher.js';
import { ErrorRecoveryService, RecoveryAttempt } from '../../../src/core/error-recovery-service.js';
import { RetryManager } from '../../../src/core/retry-manager.js';
import { RecoveryManager } from '../../../src/core/recovery-strategies.js';

describe('ErrorRecoveryService', () => {
  let service: ErrorRecoveryService;
  let mockRetryManager: RetryManager;
  let mockRecoveryManager: RecoveryManager;
  let mockConfig: OrchestraConfig;
  let mockContext: {
    runId: string;
    runManager: any;
    tmuxManager: any;
    stateManager: any;
    selectedModels: Record<string, AgentModel>;
  };

  beforeEach(() => {
    // Create real instances for retry and recovery managers
    mockRetryManager = new RetryManager({
      maxAttempts: 2,
      baseDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
      recoverableErrors: ['crash', 'timeout', 'validation'],
    });

    mockRecoveryManager = new RecoveryManager();

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

    mockContext = {
      runId: 'run-20260126000000',
      runManager: {
        getRunDir: vi.fn().mockReturnValue('/test/project/.dure/runs/run-20260126000000'),
      },
      tmuxManager: {
        startAgent: vi.fn(),
        capturePane: vi.fn().mockReturnValue(''),
      },
      stateManager: {
        updateAgentStatus: vi.fn().mockResolvedValue(undefined),
      },
      selectedModels: {
        refiner: 'haiku',
        builder: 'sonnet',
        verifier: 'haiku',
        gatekeeper: 'sonnet',
      },
    };

    service = new ErrorRecoveryService(
      mockRetryManager,
      mockRecoveryManager,
      mockConfig
    );
  });

  describe('shouldRecover', () => {
    it('should return true for recoverable crash errors', () => {
      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      expect(service.shouldRecover(errorFlag)).toBe(true);
    });

    it('should return true for recoverable timeout errors', () => {
      const errorFlag: ErrorFlag = {
        error_type: 'timeout',
        message: 'Agent timed out',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      expect(service.shouldRecover(errorFlag)).toBe(true);
    });

    it('should return true for recoverable validation errors', () => {
      const errorFlag: ErrorFlag = {
        error_type: 'validation',
        message: 'Validation failed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      expect(service.shouldRecover(errorFlag)).toBe(true);
    });

    it('should return false when auto-retry is disabled', () => {
      mockConfig.global.auto_retry.enabled = false;
      service = new ErrorRecoveryService(mockRetryManager, mockRecoveryManager, mockConfig);

      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      expect(service.shouldRecover(errorFlag)).toBe(false);
    });

    it('should return false when error is not recoverable', () => {
      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: false,
        timestamp: new Date().toISOString(),
      };

      expect(service.shouldRecover(errorFlag)).toBe(false);
    });

    it('should return false when error type is not in recoverable list', () => {
      const errorFlag: ErrorFlag = {
        error_type: 'unknown',
        message: 'Unknown error',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      expect(service.shouldRecover(errorFlag)).toBe(false);
    });
  });

  describe('handleError', () => {
    it('should skip recovery when error is not recoverable', async () => {
      const errorFlag: ErrorFlag = {
        error_type: 'unknown',
        message: 'Unknown error',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      const events: any[] = [];
      service.on('recovery_event', (event) => events.push(event));

      const result = await service.handleError('refiner', errorFlag, mockContext);

      expect(result.success).toBe(false);
      expect(result.action).toBe('abort');
      expect(events.some(e => e.type === 'recovery_skipped')).toBe(true);
    });

    it('should emit recovery_started event', async () => {
      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      const events: any[] = [];
      service.on('recovery_event', (event) => events.push(event));

      // Mock successful recovery
      vi.spyOn(mockRecoveryManager, 'recover').mockResolvedValue({
        success: true,
        action: 'restart',
        message: 'Agent restarted',
      });

      await service.handleError('refiner', errorFlag, mockContext);

      expect(events.some(e => e.type === 'recovery_started')).toBe(true);
    });

    it('should return success result when recovery succeeds', async () => {
      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(mockRecoveryManager, 'recover').mockResolvedValue({
        success: true,
        action: 'restart',
        message: 'Agent restarted',
      });

      const result = await service.handleError('refiner', errorFlag, mockContext);

      expect(result.success).toBe(true);
      expect(result.action).toBe('restart');
    });

    it('should record recovery attempt on success', async () => {
      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(mockRecoveryManager, 'recover').mockResolvedValue({
        success: true,
        action: 'restart',
        message: 'Agent restarted',
      });

      await service.handleError('refiner', errorFlag, mockContext);

      const history = service.getRecoveryHistory('run-20260126000000');
      expect(history.length).toBe(1);
      expect(history[0].agent).toBe('refiner');
      expect(history[0].result).toBe('success');
    });

    it('should return failure result when recovery exhausted', async () => {
      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(mockRecoveryManager, 'recover').mockResolvedValue({
        success: false,
        action: 'abort',
        message: 'Recovery failed',
      });

      const result = await service.handleError('refiner', errorFlag, mockContext);

      expect(result.success).toBe(false);
      expect(result.action).toBe('abort');
    });

    it('should emit recovery_exhausted event when max attempts reached', async () => {
      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(mockRecoveryManager, 'recover').mockResolvedValue({
        success: false,
        action: 'abort',
        message: 'Recovery failed',
      });

      const events: any[] = [];
      service.on('recovery_event', (event) => events.push(event));

      await service.handleError('refiner', errorFlag, mockContext);

      expect(events.some(e => e.type === 'recovery_exhausted')).toBe(true);
    });
  });

  describe('getRecoveryHistory', () => {
    it('should return empty array for unknown run', () => {
      const history = service.getRecoveryHistory('unknown-run');
      expect(history).toEqual([]);
    });

    it('should return history for known run', async () => {
      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(mockRecoveryManager, 'recover').mockResolvedValue({
        success: true,
        action: 'restart',
        message: 'Agent restarted',
      });

      await service.handleError('refiner', errorFlag, mockContext);

      const history = service.getRecoveryHistory('run-20260126000000');
      expect(history.length).toBe(1);
    });
  });

  describe('clearRecoveryHistory', () => {
    it('should clear history for a run', async () => {
      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(mockRecoveryManager, 'recover').mockResolvedValue({
        success: true,
        action: 'restart',
        message: 'Agent restarted',
      });

      await service.handleError('refiner', errorFlag, mockContext);
      expect(service.getRecoveryHistory('run-20260126000000').length).toBe(1);

      service.clearRecoveryHistory('run-20260126000000');
      expect(service.getRecoveryHistory('run-20260126000000').length).toBe(0);
    });
  });

  describe('getRetryCount', () => {
    it('should return 0 for new agent', () => {
      const count = service.getRetryCount('refiner', 'crash', 'run-20260126000000');
      expect(count).toBe(0);
    });
  });

  describe('isRetryExhausted', () => {
    it('should return false when retries not exhausted', () => {
      expect(service.isRetryExhausted('refiner', 'crash', 'run-20260126000000')).toBe(false);
    });
  });

  describe('resetRetryAttempts', () => {
    it('should reset retry count', async () => {
      const errorFlag: ErrorFlag = {
        error_type: 'crash',
        message: 'Agent crashed',
        recoverable: true,
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(mockRecoveryManager, 'recover').mockResolvedValue({
        success: false,
        action: 'abort',
        message: 'Recovery failed',
      });

      await service.handleError('refiner', errorFlag, mockContext);

      service.resetRetryAttempts('refiner', 'crash', 'run-20260126000000');
      expect(service.getRetryCount('refiner', 'crash', 'run-20260126000000')).toBe(0);
    });
  });

  describe('getRetryManager', () => {
    it('should return the retry manager', () => {
      expect(service.getRetryManager()).toBe(mockRetryManager);
    });
  });

  describe('getRecoveryManager', () => {
    it('should return the recovery manager', () => {
      expect(service.getRecoveryManager()).toBe(mockRecoveryManager);
    });
  });
});
