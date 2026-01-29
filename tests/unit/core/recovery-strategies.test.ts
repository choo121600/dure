import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RecoveryManager,
  CrashRecoveryStrategy,
  TimeoutRecoveryStrategy,
  ValidationRecoveryStrategy,
  RecoveryContext,
} from '../../../src/core/recovery-strategies.js';
import type { ErrorFlag } from '../../../src/core/file-watcher.js';

// Mock TmuxManager
const createMockTmuxManager = () => ({
  startAgent: vi.fn(),
  capturePane: vi.fn().mockReturnValue('some output'),
});

// Mock StateManager
const createMockStateManager = () => ({
  updateAgentStatus: vi.fn(),
  loadState: vi.fn().mockReturnValue({ phase: 'build', iteration: 1 }),
});

describe('CrashRecoveryStrategy', () => {
  let strategy: CrashRecoveryStrategy;

  beforeEach(() => {
    strategy = new CrashRecoveryStrategy();
  });

  describe('canRecover', () => {
    it('should return true for recoverable crash errors', () => {
      const error: ErrorFlag = {
        agent: 'builder',
        error_type: 'crash',
        message: 'Process crashed',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };
      expect(strategy.canRecover(error)).toBe(true);
    });

    it('should return false for non-recoverable crash errors', () => {
      const error: ErrorFlag = {
        agent: 'builder',
        error_type: 'crash',
        message: 'Process crashed',
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
      expect(strategy.canRecover(error)).toBe(false);
    });

    it('should return false for non-crash errors', () => {
      const error: ErrorFlag = {
        agent: 'builder',
        error_type: 'timeout',
        message: 'Timeout',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };
      expect(strategy.canRecover(error)).toBe(false);
    });
  });

  describe('recover', () => {
    it('should clear agent, update state, and restart', async () => {
      const tmuxManager = createMockTmuxManager();
      const stateManager = createMockStateManager();

      const context: RecoveryContext = {
        agent: 'builder',
        runId: 'run-123',
        runDir: '/path/to/run',
        errorFlag: {
          agent: 'builder',
          error_type: 'crash',
          message: 'Crashed',
          timestamp: new Date().toISOString(),
          recoverable: true,
        },
        tmuxManager: tmuxManager as any,
        stateManager: stateManager as any,
        promptFile: '/path/to/prompt.md',
        model: 'sonnet',
      };

      const result = await strategy.recover(context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('restart');
      expect(stateManager.updateAgentStatus).toHaveBeenCalledWith('builder', 'running');
      expect(tmuxManager.startAgent).toHaveBeenCalledWith('builder', 'sonnet', '/path/to/prompt.md', '/path/to/run/builder');
    });

    it('should return failure result on error', async () => {
      const tmuxManager = createMockTmuxManager();
      tmuxManager.startAgent.mockImplementation(() => {
        throw new Error('Start failed');
      });
      const stateManager = createMockStateManager();

      const context: RecoveryContext = {
        agent: 'builder',
        runId: 'run-123',
        runDir: '/path/to/run',
        errorFlag: {
          agent: 'builder',
          error_type: 'crash',
          message: 'Crashed',
          timestamp: new Date().toISOString(),
          recoverable: true,
        },
        tmuxManager: tmuxManager as any,
        stateManager: stateManager as any,
        promptFile: '/path/to/prompt.md',
        model: 'sonnet',
      };

      const result = await strategy.recover(context);

      expect(result.success).toBe(false);
      expect(result.action).toBe('abort');
      expect(result.message).toContain('Start failed');
    });
  });

  describe('getName', () => {
    it('should return "crash"', () => {
      expect(strategy.getName()).toBe('crash');
    });
  });
});

describe('TimeoutRecoveryStrategy', () => {
  let strategy: TimeoutRecoveryStrategy;

  beforeEach(() => {
    strategy = new TimeoutRecoveryStrategy();
  });

  describe('canRecover', () => {
    it('should return true for recoverable timeout errors', () => {
      const error: ErrorFlag = {
        agent: 'builder',
        error_type: 'timeout',
        message: 'Timeout',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };
      expect(strategy.canRecover(error)).toBe(true);
    });

    it('should return false for non-recoverable timeout errors', () => {
      const error: ErrorFlag = {
        agent: 'builder',
        error_type: 'timeout',
        message: 'Timeout',
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
      expect(strategy.canRecover(error)).toBe(false);
    });
  });

  describe('recover', () => {
    it('should extend timeout when agent is still active', async () => {
      const tmuxManager = createMockTmuxManager();
      tmuxManager.capturePane.mockReturnValue('Claude is thinking...');
      const stateManager = createMockStateManager();

      const context: RecoveryContext = {
        agent: 'builder',
        runId: 'run-123',
        runDir: '/path/to/run',
        errorFlag: {
          agent: 'builder',
          error_type: 'timeout',
          message: 'Timeout',
          timestamp: new Date().toISOString(),
          recoverable: true,
        },
        tmuxManager: tmuxManager as any,
        stateManager: stateManager as any,
        promptFile: '/path/to/prompt.md',
        model: 'sonnet',
      };

      const result = await strategy.recover(context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('extend_timeout');
    });

    it('should restart agent when inactive', async () => {
      const tmuxManager = createMockTmuxManager();
      tmuxManager.capturePane.mockImplementation(() => {
        throw new Error('Cannot capture');
      });
      const stateManager = createMockStateManager();

      const context: RecoveryContext = {
        agent: 'builder',
        runId: 'run-123',
        runDir: '/path/to/run',
        errorFlag: {
          agent: 'builder',
          error_type: 'timeout',
          message: 'Timeout',
          timestamp: new Date().toISOString(),
          recoverable: true,
        },
        tmuxManager: tmuxManager as any,
        stateManager: stateManager as any,
        promptFile: '/path/to/prompt.md',
        model: 'sonnet',
      };

      const result = await strategy.recover(context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('restart');
      expect(tmuxManager.startAgent).toHaveBeenCalledWith('builder', 'sonnet', '/path/to/prompt.md', '/path/to/run/builder');
    });
  });

  describe('getName', () => {
    it('should return "timeout"', () => {
      expect(strategy.getName()).toBe('timeout');
    });
  });
});

describe('ValidationRecoveryStrategy', () => {
  let strategy: ValidationRecoveryStrategy;

  beforeEach(() => {
    strategy = new ValidationRecoveryStrategy();
  });

  describe('canRecover', () => {
    it('should return true for recoverable validation errors', () => {
      const error: ErrorFlag = {
        agent: 'builder',
        error_type: 'validation',
        message: 'Invalid output format',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };
      expect(strategy.canRecover(error)).toBe(true);
    });

    it('should return false for non-recoverable validation errors', () => {
      const error: ErrorFlag = {
        agent: 'builder',
        error_type: 'validation',
        message: 'Invalid output',
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
      expect(strategy.canRecover(error)).toBe(false);
    });
  });

  describe('recover', () => {
    it('should restart agent with validation context', async () => {
      const tmuxManager = createMockTmuxManager();
      const stateManager = createMockStateManager();

      const context: RecoveryContext = {
        agent: 'verifier',
        runId: 'run-123',
        runDir: '/path/to/run',
        errorFlag: {
          agent: 'verifier',
          error_type: 'validation',
          message: 'Invalid JSON output',
          timestamp: new Date().toISOString(),
          recoverable: true,
        },
        tmuxManager: tmuxManager as any,
        stateManager: stateManager as any,
        promptFile: '/path/to/prompt.md',
        model: 'haiku',
      };

      const result = await strategy.recover(context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('restart');
      expect(tmuxManager.startAgent).toHaveBeenCalledWith('verifier', 'haiku', '/path/to/prompt.md', '/path/to/run/verifier');
    });
  });

  describe('getName', () => {
    it('should return "validation"', () => {
      expect(strategy.getName()).toBe('validation');
    });
  });
});

describe('RecoveryManager', () => {
  let manager: RecoveryManager;

  beforeEach(() => {
    manager = new RecoveryManager();
  });

  describe('constructor', () => {
    it('should register default strategies', () => {
      expect(manager.getStrategy('crash')).toBeInstanceOf(CrashRecoveryStrategy);
      expect(manager.getStrategy('timeout')).toBeInstanceOf(TimeoutRecoveryStrategy);
      expect(manager.getStrategy('validation')).toBeInstanceOf(ValidationRecoveryStrategy);
    });
  });

  describe('getStrategyNames', () => {
    it('should return all registered strategy names', () => {
      const names = manager.getStrategyNames();
      expect(names).toContain('crash');
      expect(names).toContain('timeout');
      expect(names).toContain('validation');
    });
  });

  describe('canRecover', () => {
    it('should return true for recoverable errors', () => {
      const crashError: ErrorFlag = {
        agent: 'builder',
        error_type: 'crash',
        message: 'Crashed',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };
      expect(manager.canRecover(crashError)).toBe(true);
    });

    it('should return false for non-recoverable errors', () => {
      const permissionError: ErrorFlag = {
        agent: 'builder',
        error_type: 'permission',
        message: 'No permission',
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
      expect(manager.canRecover(permissionError)).toBe(false);
    });
  });

  describe('findStrategy', () => {
    it('should find matching strategy for crash error', () => {
      const error: ErrorFlag = {
        agent: 'builder',
        error_type: 'crash',
        message: 'Crashed',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };
      const strategy = manager.findStrategy(error);
      expect(strategy).toBeInstanceOf(CrashRecoveryStrategy);
    });

    it('should return undefined for unknown error types', () => {
      const error: ErrorFlag = {
        agent: 'builder',
        error_type: 'resource',
        message: 'Out of memory',
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
      expect(manager.findStrategy(error)).toBeUndefined();
    });
  });

  describe('recover', () => {
    it('should execute matching strategy', async () => {
      const tmuxManager = createMockTmuxManager();
      const stateManager = createMockStateManager();

      const context: RecoveryContext = {
        agent: 'builder',
        runId: 'run-123',
        runDir: '/path/to/run',
        errorFlag: {
          agent: 'builder',
          error_type: 'crash',
          message: 'Crashed',
          timestamp: new Date().toISOString(),
          recoverable: true,
        },
        tmuxManager: tmuxManager as any,
        stateManager: stateManager as any,
        promptFile: '/path/to/prompt.md',
        model: 'sonnet',
      };

      const result = await manager.recover(context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('restart');
    });

    it('should return abort result when no strategy matches', async () => {
      const tmuxManager = createMockTmuxManager();
      const stateManager = createMockStateManager();

      const context: RecoveryContext = {
        agent: 'builder',
        runId: 'run-123',
        runDir: '/path/to/run',
        errorFlag: {
          agent: 'builder',
          error_type: 'resource',
          message: 'Out of memory',
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
        tmuxManager: tmuxManager as any,
        stateManager: stateManager as any,
        promptFile: '/path/to/prompt.md',
        model: 'sonnet',
      };

      const result = await manager.recover(context);

      expect(result.success).toBe(false);
      expect(result.action).toBe('abort');
      expect(result.message).toContain('No recovery strategy');
    });
  });

  describe('registerStrategy', () => {
    it('should register custom strategy', () => {
      const customStrategy = {
        getName: () => 'custom',
        canRecover: () => true,
        recover: async () => ({ success: true, action: 'restart' as const, message: 'Custom recovery' }),
      };

      manager.registerStrategy(customStrategy);

      expect(manager.getStrategy('custom')).toBe(customStrategy);
    });
  });
});
