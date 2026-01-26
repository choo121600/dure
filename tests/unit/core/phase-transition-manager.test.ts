import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Phase, RunState, GatekeeperVerdict } from '../../../src/types/index.js';

// Mock StateManager
const mockStateManager = {
  loadState: vi.fn(),
  updatePhase: vi.fn(),
  setPendingCRP: vi.fn(),
  incrementIteration: vi.fn(),
  isMaxIterationsExceeded: vi.fn().mockResolvedValue(false),
};

vi.mock('../../../src/core/state-manager.js', () => ({
  StateManager: vi.fn().mockImplementation(() => mockStateManager),
}));

import { PhaseTransitionManager } from '../../../src/core/phase-transition-manager.js';

describe('PhaseTransitionManager', () => {
  let manager: PhaseTransitionManager;
  const createState = (overrides: Partial<RunState> = {}): RunState => ({
    run_id: 'run-20260126000000',
    phase: 'refine',
    iteration: 1,
    max_iterations: 3,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agents: {
      refiner: { status: 'pending' },
      builder: { status: 'pending' },
      verifier: { status: 'pending' },
      gatekeeper: { status: 'pending' },
    },
    pending_crp: null,
    errors: [],
    history: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockStateManager.loadState.mockResolvedValue(createState());
    mockStateManager.updatePhase.mockResolvedValue(createState());
    mockStateManager.setPendingCRP.mockResolvedValue(undefined);
    mockStateManager.incrementIteration.mockResolvedValue(undefined);
    mockStateManager.isMaxIterationsExceeded.mockResolvedValue(false);
    manager = new PhaseTransitionManager(mockStateManager as any);
  });

  describe('canTransition', () => {
    it('should allow valid transitions', () => {
      expect(manager.canTransition('refine', 'build')).toBe(true);
      expect(manager.canTransition('refine', 'waiting_human')).toBe(true);
      expect(manager.canTransition('build', 'verify')).toBe(true);
      expect(manager.canTransition('verify', 'gate')).toBe(true);
      expect(manager.canTransition('gate', 'ready_for_merge')).toBe(true);
      expect(manager.canTransition('gate', 'build')).toBe(true);
      expect(manager.canTransition('gate', 'failed')).toBe(true);
      expect(manager.canTransition('waiting_human', 'refine')).toBe(true);
      expect(manager.canTransition('waiting_human', 'build')).toBe(true);
      expect(manager.canTransition('ready_for_merge', 'completed')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(manager.canTransition('refine', 'gate')).toBe(false);
      expect(manager.canTransition('refine', 'verify')).toBe(false);
      expect(manager.canTransition('build', 'refine')).toBe(false);
      expect(manager.canTransition('completed', 'refine')).toBe(false);
      expect(manager.canTransition('failed', 'build')).toBe(false);
    });
  });

  describe('transition', () => {
    it('should transition to valid phase', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'refine' }));

      const result = await manager.transition('build');

      expect(result).toBe(true);
      expect(mockStateManager.updatePhase).toHaveBeenCalledWith('build');
    });

    it('should reject invalid transition', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'refine' }));

      const result = await manager.transition('gate');

      expect(result).toBe(false);
      expect(mockStateManager.updatePhase).not.toHaveBeenCalled();
    });

    it('should throw if no state available', async () => {
      mockStateManager.loadState.mockResolvedValue(null);

      await expect(manager.transition('build')).rejects.toThrow('No state available for transition');
    });

    it('should emit transition events', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'build' }));
      const events: any[] = [];
      manager.on('phase_event', (event) => events.push(event));

      await manager.transition('verify');

      expect(events).toContainEqual({ type: 'transition_started', from: 'build', to: 'verify' });
      expect(events).toContainEqual({ type: 'transition_completed', from: 'build', to: 'verify' });
    });

    it('should emit blocked event for invalid transition', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'refine' }));
      const events: any[] = [];
      manager.on('phase_event', (event) => events.push(event));

      await manager.transition('gate');

      expect(events.some(e => e.type === 'transition_blocked')).toBe(true);
    });
  });

  describe('getNextPhase', () => {
    it('should return build after refine', async () => {
      expect(await manager.getNextPhase('refine')).toBe('build');
    });

    it('should return verify after build', async () => {
      expect(await manager.getNextPhase('build')).toBe('verify');
    });

    it('should return gate after verify', async () => {
      expect(await manager.getNextPhase('verify')).toBe('gate');
    });

    it('should return ready_for_merge for PASS verdict', async () => {
      expect(await manager.getNextPhase('gate', 'PASS')).toBe('ready_for_merge');
    });

    it('should return build for FAIL verdict (retry)', async () => {
      mockStateManager.isMaxIterationsExceeded.mockResolvedValue(false);
      expect(await manager.getNextPhase('gate', 'FAIL')).toBe('build');
    });

    it('should return failed for FAIL verdict when max iterations exceeded', async () => {
      mockStateManager.isMaxIterationsExceeded.mockResolvedValue(true);
      expect(await manager.getNextPhase('gate', 'FAIL')).toBe('failed');
    });

    it('should return waiting_human for NEEDS_HUMAN verdict', async () => {
      expect(await manager.getNextPhase('gate', 'NEEDS_HUMAN')).toBe('waiting_human');
    });

    it('should return completed after ready_for_merge', async () => {
      expect(await manager.getNextPhase('ready_for_merge')).toBe('completed');
    });

    it('should return null for terminal phases', async () => {
      expect(await manager.getNextPhase('completed')).toBe(null);
      expect(await manager.getNextPhase('failed')).toBe(null);
    });
  });

  describe('getPhaseAgent', () => {
    it('should return correct agent for each phase', () => {
      expect(manager.getPhaseAgent('refine')).toBe('refiner');
      expect(manager.getPhaseAgent('build')).toBe('builder');
      expect(manager.getPhaseAgent('verify')).toBe('verifier');
      expect(manager.getPhaseAgent('gate')).toBe('gatekeeper');
    });

    it('should return null for phases without agents', () => {
      expect(manager.getPhaseAgent('waiting_human')).toBe(null);
      expect(manager.getPhaseAgent('ready_for_merge')).toBe(null);
      expect(manager.getPhaseAgent('completed')).toBe(null);
      expect(manager.getPhaseAgent('failed')).toBe(null);
    });
  });

  describe('getAgentPhase', () => {
    it('should return correct phase for each agent', () => {
      expect(manager.getAgentPhase('refiner')).toBe('refine');
      expect(manager.getAgentPhase('builder')).toBe('build');
      expect(manager.getAgentPhase('verifier')).toBe('verify');
      expect(manager.getAgentPhase('gatekeeper')).toBe('gate');
    });
  });

  describe('getPreviousAgent', () => {
    it('should return correct previous agent', () => {
      expect(manager.getPreviousAgent('build')).toBe('refiner');
      expect(manager.getPreviousAgent('verify')).toBe('builder');
      expect(manager.getPreviousAgent('gate')).toBe('verifier');
      expect(manager.getPreviousAgent('ready_for_merge')).toBe('gatekeeper');
      expect(manager.getPreviousAgent('failed')).toBe('gatekeeper');
    });

    it('should return null for phases without previous agent', () => {
      expect(manager.getPreviousAgent('refine')).toBe(null);
      expect(manager.getPreviousAgent('waiting_human')).toBe(null);
    });
  });

  describe('handleVerdict', () => {
    it('should handle PASS verdict', async () => {
      const verdict: GatekeeperVerdict = {
        verdict: 'PASS',
        reason: 'All tests passed',
        timestamp: new Date().toISOString(),
      };

      const result = await manager.handleVerdict(verdict);

      expect(result).toEqual({ nextPhase: 'ready_for_merge', shouldRetry: false });
    });

    it('should handle FAIL verdict with retry', async () => {
      mockStateManager.isMaxIterationsExceeded.mockResolvedValue(false);
      const verdict: GatekeeperVerdict = {
        verdict: 'FAIL',
        reason: 'Tests failed',
        timestamp: new Date().toISOString(),
      };

      const result = await manager.handleVerdict(verdict);

      expect(result).toEqual({ nextPhase: 'build', shouldRetry: true });
    });

    it('should handle FAIL verdict when max iterations exceeded', async () => {
      mockStateManager.isMaxIterationsExceeded.mockResolvedValue(true);
      const verdict: GatekeeperVerdict = {
        verdict: 'FAIL',
        reason: 'Tests failed',
        timestamp: new Date().toISOString(),
      };

      const result = await manager.handleVerdict(verdict);

      expect(result).toEqual({ nextPhase: 'failed', shouldRetry: false });
    });

    it('should handle NEEDS_HUMAN verdict', async () => {
      const verdict: GatekeeperVerdict = {
        verdict: 'NEEDS_HUMAN',
        reason: 'Decision required',
        timestamp: new Date().toISOString(),
      };

      const result = await manager.handleVerdict(verdict);

      expect(result).toEqual({ nextPhase: 'waiting_human', shouldRetry: false });
    });

    it('should throw for unknown verdict', async () => {
      const verdict = {
        verdict: 'UNKNOWN',
        reason: 'Test',
        timestamp: new Date().toISOString(),
      } as GatekeeperVerdict;

      await expect(manager.handleVerdict(verdict)).rejects.toThrow('Unknown verdict');
    });
  });

  describe('incrementIteration', () => {
    it('should increment iteration and return result', async () => {
      mockStateManager.loadState.mockResolvedValueOnce(createState());
      mockStateManager.loadState.mockResolvedValueOnce(createState({ iteration: 2 }));

      const result = await manager.incrementIteration();

      expect(mockStateManager.incrementIteration).toHaveBeenCalled();
      expect(result.iteration).toBe(2);
      expect(result.maxExceeded).toBe(false);
    });

    it('should emit iteration_started event', async () => {
      mockStateManager.loadState.mockResolvedValueOnce(createState());
      mockStateManager.loadState.mockResolvedValueOnce(createState({ iteration: 2 }));
      const events: any[] = [];
      manager.on('phase_event', (event) => events.push(event));

      await manager.incrementIteration();

      expect(events.some(e => e.type === 'iteration_started')).toBe(true);
    });

    it('should detect max iterations exceeded', async () => {
      mockStateManager.loadState.mockResolvedValueOnce(createState());
      mockStateManager.loadState.mockResolvedValueOnce(createState({ iteration: 4, max_iterations: 3 }));
      const events: any[] = [];
      manager.on('phase_event', (event) => events.push(event));

      const result = await manager.incrementIteration();

      expect(result.maxExceeded).toBe(true);
      expect(events.some(e => e.type === 'max_iterations_exceeded')).toBe(true);
    });
  });

  describe('state getters', () => {
    it('should get current phase', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'build' }));
      expect(await manager.getCurrentPhase()).toBe('build');
    });

    it('should return null if no state', async () => {
      mockStateManager.loadState.mockResolvedValue(null);
      expect(await manager.getCurrentPhase()).toBe(null);
    });

    it('should get current iteration', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ iteration: 2 }));
      expect(await manager.getCurrentIteration()).toBe(2);
    });

    it('should get max iterations', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ max_iterations: 5 }));
      expect(await manager.getMaxIterations()).toBe(5);
    });
  });

  describe('isTerminalPhase', () => {
    it('should return true for terminal phases', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'completed' }));
      expect(await manager.isTerminalPhase()).toBe(true);

      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'failed' }));
      expect(await manager.isTerminalPhase()).toBe(true);

      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'ready_for_merge' }));
      expect(await manager.isTerminalPhase()).toBe(true);
    });

    it('should return false for non-terminal phases', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'build' }));
      expect(await manager.isTerminalPhase()).toBe(false);
    });
  });

  describe('isWaitingForHuman', () => {
    it('should return true when waiting for human', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'waiting_human' }));
      expect(await manager.isWaitingForHuman()).toBe(true);
    });

    it('should return false when not waiting', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'build' }));
      expect(await manager.isWaitingForHuman()).toBe(false);
    });
  });

  describe('setPendingCRP', () => {
    it('should set pending CRP and transition to waiting_human', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'refine' }));

      await manager.setPendingCRP('crp-001');

      expect(mockStateManager.setPendingCRP).toHaveBeenCalledWith('crp-001');
      expect(mockStateManager.updatePhase).toHaveBeenCalledWith('waiting_human');
    });

    it('should clear pending CRP without transition when null', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ phase: 'waiting_human' }));

      await manager.setPendingCRP(null);

      expect(mockStateManager.setPendingCRP).toHaveBeenCalledWith(null);
      expect(mockStateManager.updatePhase).not.toHaveBeenCalled();
    });
  });

  describe('getPendingCRP', () => {
    it('should return pending CRP ID', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ pending_crp: 'crp-001' }));
      expect(await manager.getPendingCRP()).toBe('crp-001');
    });

    it('should return null if no pending CRP', async () => {
      mockStateManager.loadState.mockResolvedValue(createState({ pending_crp: null }));
      expect(await manager.getPendingCRP()).toBe(null);
    });
  });
});
