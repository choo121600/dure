import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CleanupManager } from '../../../src/core/cleanup-manager.js';
import type { TmuxManager } from '../../../src/core/tmux-manager.js';
import type { StateManager } from '../../../src/core/state-manager.js';
import type { RunState } from '../../../src/types/index.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';

const mockExecSync = execSync as ReturnType<typeof vi.fn>;

describe('CleanupManager', () => {
  let mockTmuxManager: TmuxManager;
  let mockStateManager: StateManager;
  let cleanupManager: CleanupManager;

  const createMockState = (overrides?: Partial<RunState>): RunState => ({
    run_id: 'test-run-123',
    phase: 'build',
    iteration: 1,
    started_at: new Date().toISOString(),
    agents: {
      refiner: { status: 'completed', started_at: '', completed_at: '' },
      builder: { status: 'running', started_at: new Date().toISOString() },
      verifier: { status: 'pending' },
      gatekeeper: { status: 'pending' },
    },
    history: [],
    errors: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockTmuxManager = {
      sessionExists: vi.fn().mockReturnValue(true),
      isPaneActive: vi.fn().mockReturnValue(true),
      getSessionName: vi.fn().mockReturnValue('orchestral-test'),
    } as unknown as TmuxManager;

    mockStateManager = {
      loadState: vi.fn().mockResolvedValue(createMockState()),
      saveState: vi.fn().mockResolvedValue(undefined),
      updateAgentStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as StateManager;

    cleanupManager = new CleanupManager(mockTmuxManager, mockStateManager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stopAllAgents', () => {
    it('should return error when tmux session does not exist', async () => {
      vi.mocked(mockTmuxManager.sessionExists).mockReturnValue(false);

      const result = await cleanupManager.stopAllAgents();

      expect(result.success).toBe(false);
      expect(result.processes_stopped).toBe(0);
      expect(result.message).toBe('Tmux session not found');
    });

    it('should stop all active agents', async () => {
      // After first Ctrl+C, agent becomes inactive
      vi.mocked(mockTmuxManager.isPaneActive)
        .mockReturnValueOnce(true)  // refiner check
        .mockReturnValueOnce(false) // refiner after Ctrl+C
        .mockReturnValueOnce(true)  // builder check
        .mockReturnValueOnce(false) // builder after Ctrl+C
        .mockReturnValueOnce(true)  // verifier check
        .mockReturnValueOnce(false) // verifier after Ctrl+C
        .mockReturnValueOnce(true)  // gatekeeper check
        .mockReturnValueOnce(false); // gatekeeper after Ctrl+C

      const result = await cleanupManager.stopAllAgents();

      expect(result.success).toBe(true);
      expect(result.processes_stopped).toBe(4); // All 4 agents
      expect(mockExecSync).toHaveBeenCalledTimes(4); // Ctrl+C for each
    });

    it('should update agent status for each stopped agent', async () => {
      await cleanupManager.stopAllAgents();

      expect(mockStateManager.updateAgentStatus).toHaveBeenCalledWith('refiner', 'failed', 'stopped_by_user');
      expect(mockStateManager.updateAgentStatus).toHaveBeenCalledWith('builder', 'failed', 'stopped_by_user');
      expect(mockStateManager.updateAgentStatus).toHaveBeenCalledWith('verifier', 'failed', 'stopped_by_user');
      expect(mockStateManager.updateAgentStatus).toHaveBeenCalledWith('gatekeeper', 'failed', 'stopped_by_user');
    });

    it('should not stop agents that are not active', async () => {
      vi.mocked(mockTmuxManager.isPaneActive).mockReturnValue(false);

      const result = await cleanupManager.stopAllAgents();

      expect(result.success).toBe(true);
      expect(result.processes_stopped).toBe(0);
      expect(result.message).toBe('No active processes found');
    });

    it('should handle partial agent activity', async () => {
      vi.mocked(mockTmuxManager.isPaneActive).mockImplementation((agent) => {
        return agent === 'builder' || agent === 'verifier';
      });

      const result = await cleanupManager.stopAllAgents();

      expect(result.success).toBe(true);
      expect(result.processes_stopped).toBe(2);
    });

    it('should update state history with termination event', async () => {
      await cleanupManager.stopAllAgents();

      expect(mockStateManager.saveState).toHaveBeenCalled();
      const savedState = vi.mocked(mockStateManager.saveState).mock.calls[0][0];
      expect(savedState.history).toContainEqual(
        expect.objectContaining({
          result: 'agents_stopped_by_user',
        })
      );
      expect(savedState.last_event).toEqual(
        expect.objectContaining({
          type: 'run.agents_stopped',
        })
      );
    });

    it('should handle errors when stopping individual agents', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('tmux error');
      });

      const result = await cleanupManager.stopAllAgents();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should try second Ctrl+C if agent is still active after first', async () => {
      // For refiner: still active after first Ctrl+C, needs second attempt
      vi.mocked(mockTmuxManager.isPaneActive)
        .mockReturnValueOnce(true)  // refiner initial check
        .mockReturnValueOnce(true)  // refiner still active after 1st Ctrl+C
        .mockReturnValueOnce(true)  // builder initial check
        .mockReturnValueOnce(false) // builder stopped after 1st Ctrl+C
        .mockReturnValueOnce(false) // verifier not active
        .mockReturnValueOnce(false); // gatekeeper not active

      await cleanupManager.stopAllAgents();

      // Should have 3 Ctrl+C: 2 for refiner (retry), 1 for builder
      expect(mockExecSync.mock.calls.length).toBe(3);
    });

    it('should not update state if loadState returns null', async () => {
      vi.mocked(mockStateManager.loadState).mockResolvedValue(null);

      await cleanupManager.stopAllAgents();

      expect(mockStateManager.saveState).not.toHaveBeenCalled();
    });
  });

  describe('setGracefulShutdownTimeout', () => {
    it('should update the graceful shutdown timeout', () => {
      cleanupManager.setGracefulShutdownTimeout(10000);
      // Internal state change - we can verify by checking execSync timeout in future calls
      expect(() => cleanupManager.setGracefulShutdownTimeout(10000)).not.toThrow();
    });
  });
});
