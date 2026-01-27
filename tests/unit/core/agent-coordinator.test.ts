import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RunState, CRP, VCR } from '../../../src/types/index.js';
import { AgentCoordinator } from '../../../src/core/agent-coordinator.js';

describe('AgentCoordinator', () => {
  let coordinator: AgentCoordinator;
  let mockAgentLifecycle: any;
  let mockPhaseManager: any;
  let mockRunManager: any;
  let mockStateManager: any;

  beforeEach(() => {

    mockAgentLifecycle = {
      completeAgent: vi.fn().mockResolvedValue(undefined),
      clearAgent: vi.fn().mockResolvedValue(undefined),
      stopAgent: vi.fn(),
      startAgent: vi.fn().mockResolvedValue(undefined),
    };

    mockPhaseManager = {
      getPhaseAgent: vi.fn().mockImplementation((phase) => {
        const map: Record<string, string> = {
          refine: 'refiner',
          build: 'builder',
          verify: 'verifier',
          gate: 'gatekeeper',
        };
        return map[phase] || null;
      }),
      transition: vi.fn().mockResolvedValue(true),
      getCurrentPhase: vi.fn().mockResolvedValue('refine'),
    };

    mockRunManager = {
      getRunDir: vi.fn().mockReturnValue('/test/project/.orchestral/runs/run-20260126000000'),
      listCRPs: vi.fn().mockResolvedValue([]),
      listVCRs: vi.fn().mockResolvedValue([]),
    };

    mockStateManager = {
      loadState: vi.fn().mockResolvedValue({
        run_id: 'run-20260126000000',
        phase: 'refine',
        iteration: 1,
        max_iterations: 3,
        pending_crp: null,
      } as Partial<RunState>),
      updateAgentStatus: vi.fn().mockResolvedValue(undefined),
      setPendingCRP: vi.fn().mockResolvedValue(undefined),
    };

    coordinator = new AgentCoordinator(
      mockAgentLifecycle,
      mockPhaseManager,
      mockRunManager,
      mockStateManager
    );
  });

  describe('determineNextAction', () => {
    it('should return transition action when no CRP exists', async () => {
      const action = await coordinator.determineNextAction('refiner', 'run-20260126000000', 'build');

      expect(action.type).toBe('transition');
      expect((action as any).nextPhase).toBe('build');
      expect((action as any).nextAgent).toBe('builder');
    });

    it('should return wait_crp action when unresolved CRP exists', async () => {
      const mockCRP: CRP = {
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        created_by: 'refiner',
        type: 'clarification',
        status: 'pending',
      };
      mockRunManager.listCRPs.mockResolvedValue([mockCRP]);
      mockRunManager.listVCRs.mockResolvedValue([]);

      const action = await coordinator.determineNextAction('refiner', 'run-20260126000000', 'build');

      expect(action.type).toBe('wait_crp');
      expect((action as any).crpId).toBe('crp-001');
    });

    it('should return wait_crp action when state has pending_crp', async () => {
      mockStateManager.loadState.mockResolvedValue({
        run_id: 'run-20260126000000',
        phase: 'waiting_human',
        pending_crp: 'crp-002',
      } as Partial<RunState>);

      const action = await coordinator.determineNextAction('refiner', 'run-20260126000000', 'build');

      expect(action.type).toBe('wait_crp');
      expect((action as any).crpId).toBe('crp-002');
    });

    it('should throw error when no agent for next phase', async () => {
      mockPhaseManager.getPhaseAgent.mockReturnValue(null);

      await expect(coordinator.determineNextAction('refiner', 'run-20260126000000', 'completed'))
        .rejects.toThrow('No agent for phase');
    });
  });

  describe('executeAgentCompletion', () => {
    it('should complete agent and transition on transition action', async () => {
      const action = { type: 'transition' as const, nextPhase: 'build' as const, nextAgent: 'builder' as const };

      await coordinator.executeAgentCompletion('refiner', 'run-20260126000000', action);

      expect(mockAgentLifecycle.completeAgent).toHaveBeenCalledWith('refiner');
      expect(mockAgentLifecycle.clearAgent).toHaveBeenCalledWith('refiner');
      expect(mockPhaseManager.transition).toHaveBeenCalledWith('build');
    });

    it('should emit events during completion', async () => {
      const action = { type: 'transition' as const, nextPhase: 'build' as const, nextAgent: 'builder' as const };
      const events: any[] = [];
      coordinator.on('coordinator_event', (event) => events.push(event));

      await coordinator.executeAgentCompletion('refiner', 'run-20260126000000', action);

      expect(events.some(e => e.type === 'agent_completing')).toBe(true);
      expect(events.some(e => e.type === 'agent_completed')).toBe(true);
      expect(events.some(e => e.type === 'phase_transitioned')).toBe(true);
    });

    it('should handle wait_crp action', async () => {
      const action = { type: 'wait_crp' as const, crpId: 'crp-001' };
      const events: any[] = [];
      coordinator.on('coordinator_event', (event) => events.push(event));

      await coordinator.executeAgentCompletion('refiner', 'run-20260126000000', action);

      expect(mockAgentLifecycle.completeAgent).toHaveBeenCalledWith('refiner');
      expect(events.some(e => e.type === 'waiting_human')).toBe(true);
    });
  });

  describe('handleAgentDone', () => {
    it('should complete agent and determine next action', async () => {
      const action = await coordinator.handleAgentDone('refiner', 'run-20260126000000', 'build');

      expect(mockAgentLifecycle.completeAgent).toHaveBeenCalledWith('refiner');
      expect(action.type).toBe('transition');
    }, 5000);

    it('should detect CRP if one exists', async () => {
      const mockCRP: CRP = {
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        created_by: 'refiner',
        type: 'clarification',
        status: 'pending',
      };
      mockRunManager.listCRPs.mockResolvedValue([mockCRP]);
      mockRunManager.listVCRs.mockResolvedValue([]);

      const action = await coordinator.handleAgentDone('refiner', 'run-20260126000000', 'build');

      expect(action.type).toBe('wait_crp');
      expect((action as any).crpId).toBe('crp-001');
    }, 5000);
  });

  describe('handleCRPCreated', () => {
    it('should stop agent and set pending CRP', async () => {
      await coordinator.handleCRPCreated(
        { crp_id: 'crp-001', created_by: 'refiner' },
        'run-20260126000000'
      );

      expect(mockAgentLifecycle.stopAgent).toHaveBeenCalledWith('refiner');
      expect(mockStateManager.updateAgentStatus).toHaveBeenCalledWith('refiner', 'pending');
      expect(mockStateManager.setPendingCRP).toHaveBeenCalledWith('crp-001');
    });

    it('should emit CRP created and waiting_human events', async () => {
      const events: any[] = [];
      coordinator.on('coordinator_event', (event) => events.push(event));

      await coordinator.handleCRPCreated(
        { crp_id: 'crp-001', created_by: 'refiner' },
        'run-20260126000000'
      );

      expect(events.some(e => e.type === 'crp_created')).toBe(true);
      expect(events.some(e => e.type === 'waiting_human')).toBe(true);
    });
  });

  describe('handleUnresolvedCRP', () => {
    it('should return null when no unresolved CRP', async () => {
      const result = await coordinator.handleUnresolvedCRP('refiner', 'run-20260126000000');
      expect(result).toBeNull();
    });

    it('should return existing pending CRP when already tracked', async () => {
      const mockCRP: CRP = {
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        created_by: 'refiner',
        type: 'clarification',
        status: 'pending',
      };
      mockRunManager.listCRPs.mockResolvedValue([mockCRP]);
      mockStateManager.loadState.mockResolvedValue({
        pending_crp: 'crp-001',
      } as Partial<RunState>);

      const result = await coordinator.handleUnresolvedCRP('refiner', 'run-20260126000000');
      expect(result).toBe('crp-001');
    });

    it('should set pending CRP when not tracked', async () => {
      const mockCRP: CRP = {
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        created_by: 'refiner',
        type: 'clarification',
        status: 'pending',
      };
      mockRunManager.listCRPs.mockResolvedValue([mockCRP]);
      mockRunManager.listVCRs.mockResolvedValue([]);
      mockStateManager.loadState.mockResolvedValue({
        pending_crp: null,
      } as Partial<RunState>);

      const result = await coordinator.handleUnresolvedCRP('refiner', 'run-20260126000000');

      expect(result).toBe('crp-001');
      expect(mockStateManager.setPendingCRP).toHaveBeenCalledWith('crp-001');
    });

    it('should emit events when CRP detected', async () => {
      const mockCRP: CRP = {
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        created_by: 'refiner',
        type: 'clarification',
        status: 'pending',
      };
      mockRunManager.listCRPs.mockResolvedValue([mockCRP]);
      mockRunManager.listVCRs.mockResolvedValue([]);
      mockStateManager.loadState.mockResolvedValue({
        pending_crp: null,
      } as Partial<RunState>);

      const events: any[] = [];
      coordinator.on('coordinator_event', (event) => events.push(event));

      await coordinator.handleUnresolvedCRP('refiner', 'run-20260126000000');

      expect(events.some(e => e.type === 'crp_detected')).toBe(true);
      expect(events.some(e => e.type === 'waiting_human')).toBe(true);
    });
  });

  describe('hasUnresolvedCRP', () => {
    it('should return false when no CRPs exist', async () => {
      const result = await coordinator.hasUnresolvedCRP('run-20260126000000', 'refiner');
      expect(result).toBe(false);
    });

    it('should return true when unresolved CRP exists', async () => {
      const mockCRP: CRP = {
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        created_by: 'refiner',
        type: 'clarification',
        status: 'pending',
      };
      mockRunManager.listCRPs.mockResolvedValue([mockCRP]);
      mockRunManager.listVCRs.mockResolvedValue([]);

      const result = await coordinator.hasUnresolvedCRP('run-20260126000000', 'refiner');
      expect(result).toBe(true);
    });

    it('should return false when CRP is resolved', async () => {
      const mockCRP: CRP = {
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        created_by: 'refiner',
        type: 'clarification',
        status: 'resolved',
      };
      const mockVCR: VCR = {
        vcr_id: 'vcr-001',
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        decision: 'A',
        rationale: 'Test',
        applies_to_future: false,
      };
      mockRunManager.listCRPs.mockResolvedValue([mockCRP]);
      mockRunManager.listVCRs.mockResolvedValue([mockVCR]);

      const result = await coordinator.hasUnresolvedCRP('run-20260126000000', 'refiner');
      expect(result).toBe(false);
    });
  });

  describe('startNextAgent', () => {
    it('should start agent in correct run directory', async () => {
      await coordinator.startNextAgent('builder', 'run-20260126000000');

      expect(mockAgentLifecycle.startAgent).toHaveBeenCalledWith(
        'builder',
        '/test/project/.orchestral/runs/run-20260126000000'
      );
    });
  });
});
