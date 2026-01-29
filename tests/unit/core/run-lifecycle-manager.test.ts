import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { OrchestraConfig, AgentModel, ModelSelectionResult, CRP, VCR, RunState } from '../../../src/types/index.js';

// Mock fs module
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

// Create mock factory functions that return fresh instances
const createMockStateManager = () => ({
  updateModelSelection: vi.fn().mockResolvedValue(undefined),
  loadState: vi.fn().mockResolvedValue({
    run_id: 'run-20260126000000',
    phase: 'waiting_human',
    iteration: 1,
    max_iterations: 3,
    pending_crp: 'crp-001',
    agents: {
      refiner: { status: 'pending' },
      builder: { status: 'pending' },
      verifier: { status: 'pending' },
      gatekeeper: { status: 'pending' },
    },
    errors: [],
    history: [],
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as RunState),
  setPendingCRP: vi.fn().mockResolvedValue(undefined),
});

const createMockTmuxManager = () => ({
  sessionExists: vi.fn().mockReturnValue(false),
  createSession: vi.fn(),
  updatePaneBordersWithModels: vi.fn(),
});

// Use module-level variables that tests can modify
let stateManagerMock = createMockStateManager();
let tmuxManagerMock = createMockTmuxManager();

// Mock using class syntax which vitest handles correctly
vi.mock('../../../src/core/state-manager.js', () => ({
  StateManager: class MockStateManager {
    updateModelSelection = stateManagerMock.updateModelSelection;
    loadState = stateManagerMock.loadState;
    setPendingCRP = stateManagerMock.setPendingCRP;
  },
}));

vi.mock('../../../src/core/tmux-manager.js', () => {
  class MockTmuxManager {
    sessionExists = tmuxManagerMock.sessionExists;
    createSession = tmuxManagerMock.createSession;
    updatePaneBordersWithModels = tmuxManagerMock.updatePaneBordersWithModels;
    static isTmuxAvailable = vi.fn().mockReturnValue(true);
  }
  return { TmuxManager: MockTmuxManager };
});

vi.mock('../../../src/core/event-logger.js', () => ({
  EventLogger: class MockEventLogger {},
}));

// Mock dependencies passed to constructor
const mockRunManager = {
  generateRunId: vi.fn().mockReturnValue('run-20260126000000'),
  createRun: vi.fn().mockResolvedValue('/test/project/.dure/runs/run-20260126000000'),
  getRunDir: vi.fn().mockReturnValue('/test/project/.dure/runs/run-20260126000000'),
  saveModelSelection: vi.fn().mockResolvedValue(undefined),
  readModelSelection: vi.fn().mockResolvedValue(null),
  readRawBriefing: vi.fn().mockResolvedValue('Test briefing content'),
  listCRPs: vi.fn().mockResolvedValue([]),
  listVCRs: vi.fn().mockResolvedValue([]),
};

const mockModelSelector = {
  selectModels: vi.fn().mockReturnValue({
    models: {
      refiner: 'haiku' as AgentModel,
      builder: 'sonnet' as AgentModel,
      verifier: 'haiku' as AgentModel,
      gatekeeper: 'sonnet' as AgentModel,
    },
    analysis: {
      overall_score: 50,
      level: 'medium',
      factors: {
        briefing_length: 50,
        technical_depth: 50,
        scope_estimate: 50,
        risk_level: 50,
      },
      recommended_models: {
        refiner: 'haiku',
        builder: 'sonnet',
        verifier: 'haiku',
        gatekeeper: 'sonnet',
      },
      reasoning: 'Test reasoning',
    },
    selection_method: 'dynamic',
  } as ModelSelectionResult),
};

const mockPromptGenerator = {
  generateAllPrompts: vi.fn().mockResolvedValue(undefined),
  generateContinuationPrompt: vi.fn().mockResolvedValue('/test/project/.dure/runs/run-20260126000000/prompts/refiner-continue.md'),
};

import { RunLifecycleManager } from '../../../src/core/run-lifecycle-manager.js';
import { TmuxManager } from '../../../src/core/tmux-manager.js';

describe('RunLifecycleManager', () => {
  let manager: RunLifecycleManager;
  const mockConfig: OrchestraConfig = {
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

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock instances with fresh state
    stateManagerMock = createMockStateManager();
    tmuxManagerMock = createMockTmuxManager();
    // Reset TmuxManager static method
    (TmuxManager as any).isTmuxAvailable = vi.fn().mockReturnValue(true);

    manager = new RunLifecycleManager(
      mockRunManager as any,
      mockModelSelector as any,
      mockPromptGenerator as any,
      mockConfig,
      '/test/project'
    );
  });

  describe('initializeRun', () => {
    it('should create a new run with model selection', async () => {
      const result = await manager.initializeRun('Test briefing');

      expect(mockModelSelector.selectModels).toHaveBeenCalledWith('Test briefing');
      expect(mockRunManager.generateRunId).toHaveBeenCalled();
      expect(mockRunManager.createRun).toHaveBeenCalledWith(
        'run-20260126000000',
        'Test briefing',
        3
      );
      expect(result.runId).toBe('run-20260126000000');
      expect(result.selectedModels).toEqual({
        refiner: 'haiku',
        builder: 'sonnet',
        verifier: 'haiku',
        gatekeeper: 'sonnet',
      });
    });

    it('should save model selection', async () => {
      await manager.initializeRun('Test briefing');

      expect(mockRunManager.saveModelSelection).toHaveBeenCalled();
      expect(stateManagerMock.updateModelSelection).toHaveBeenCalled();
    });

    it('should generate prompts', async () => {
      await manager.initializeRun('Test briefing');

      expect(mockPromptGenerator.generateAllPrompts).toHaveBeenCalled();
    });

    it('should emit lifecycle events', async () => {
      const events: any[] = [];
      manager.on('lifecycle_event', (event) => events.push(event));

      await manager.initializeRun('Test briefing');

      expect(events).toContainEqual({ type: 'run_initializing', runId: 'run-20260126000000' });
      expect(events.some(e => e.type === 'run_initialized')).toBe(true);
    });

    it('should throw if tmux is not available', async () => {
      (TmuxManager as any).isTmuxAvailable = vi.fn().mockReturnValue(false);

      await expect(manager.initializeRun('Test briefing')).rejects.toThrow('tmux is not installed');
    });

    it('should create tmux session when none exists', async () => {
      tmuxManagerMock.sessionExists.mockReturnValue(false);

      await manager.initializeRun('Test briefing');

      expect(tmuxManagerMock.createSession).toHaveBeenCalled();
    });

    it('should reuse existing tmux session', async () => {
      tmuxManagerMock.sessionExists.mockReturnValue(true);

      await manager.initializeRun('Test briefing');

      expect(tmuxManagerMock.createSession).not.toHaveBeenCalled();
    });
  });

  describe('prepareResume', () => {
    it('should prepare resume info from pending CRP', async () => {
      const mockCRP: CRP = {
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        created_by: 'refiner',
        type: 'clarification',
        question: 'Test question?',
        context: 'Test context',
        options: [
          { id: 'A', label: 'Option A', description: 'Desc A' },
          { id: 'B', label: 'Option B', description: 'Desc B' },
        ],
        status: 'resolved',
      };

      const mockVCR: VCR = {
        vcr_id: 'vcr-001',
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        decision: 'A',
        rationale: 'Test rationale',
        applies_to_future: false,
      };

      mockRunManager.listCRPs.mockResolvedValue([mockCRP]);
      mockRunManager.listVCRs.mockResolvedValue([mockVCR]);

      const result = await manager.prepareResume('run-20260126000000');

      expect(result.runId).toBe('run-20260126000000');
      expect(result.resumeInfo).not.toBeNull();
      expect(result.resumeInfo?.agent).toBe('refiner');
      expect(result.resumeInfo?.vcrInfo?.decision).toBe('A');
    });

    it('should throw if run is not waiting for human', async () => {
      stateManagerMock.loadState.mockResolvedValue({
        run_id: 'run-20260126000000',
        phase: 'build',
        iteration: 1,
        max_iterations: 3,
        pending_crp: null,
      } as any);

      await expect(manager.prepareResume('run-20260126000000'))
        .rejects.toThrow('is not waiting for human input');
    });

    it('should throw if run not found', async () => {
      stateManagerMock.loadState.mockResolvedValue(null);

      await expect(manager.prepareResume('run-20260126000000'))
        .rejects.toThrow('not found');
    });

    it('should handle multi-question CRP format', async () => {
      const mockCRP: CRP = {
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        created_by: 'builder',
        type: 'architecture_decision',
        context: 'Multi-question context',
        questions: [
          {
            id: 'q1',
            question: 'Question 1?',
            options: [
              { id: 'opt1', label: 'Option 1', description: 'Desc 1' },
              { id: 'opt2', label: 'Option 2', description: 'Desc 2' },
            ],
          },
          {
            id: 'q2',
            question: 'Question 2?',
            options: [
              { id: 'optA', label: 'Option A', description: 'Desc A' },
              { id: 'optB', label: 'Option B', description: 'Desc B' },
            ],
          },
        ],
        status: 'resolved',
      };

      const mockVCR: VCR = {
        vcr_id: 'vcr-001',
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        decision: { q1: 'opt1', q2: 'optA' },
        rationale: 'Test rationale',
        applies_to_future: false,
      };

      mockRunManager.listCRPs.mockResolvedValue([mockCRP]);
      mockRunManager.listVCRs.mockResolvedValue([mockVCR]);

      const result = await manager.prepareResume('run-20260126000000');

      expect(result.resumeInfo?.agent).toBe('builder');
      expect(result.resumeInfo?.vcrInfo?.crpQuestion).toContain('Question 1?');
      expect(result.resumeInfo?.vcrInfo?.crpQuestion).toContain('Question 2?');
    });

    it('should restore model selection from saved file', async () => {
      const savedSelection: ModelSelectionResult = {
        models: {
          refiner: 'sonnet',
          builder: 'opus',
          verifier: 'sonnet',
          gatekeeper: 'opus',
        },
        analysis: {
          overall_score: 80,
          level: 'complex',
          factors: {
            briefing_length: 80,
            technical_depth: 80,
            scope_estimate: 80,
            risk_level: 80,
          },
          recommended_models: {
            refiner: 'sonnet',
            builder: 'opus',
            verifier: 'sonnet',
            gatekeeper: 'opus',
          },
          reasoning: 'Complex task',
        },
        selection_method: 'dynamic',
      };

      mockRunManager.readModelSelection.mockResolvedValue(savedSelection);
      mockRunManager.listCRPs.mockResolvedValue([]);

      const result = await manager.prepareResume('run-20260126000000');

      expect(result.selectedModels).toEqual(savedSelection.models);
    });

    it('should emit lifecycle events', async () => {
      mockRunManager.listCRPs.mockResolvedValue([{
        crp_id: 'crp-001',
        created_by: 'refiner',
        status: 'resolved',
      }]);
      mockRunManager.listVCRs.mockResolvedValue([{
        vcr_id: 'vcr-001',
        crp_id: 'crp-001',
        decision: 'A',
      }]);

      const events: any[] = [];
      manager.on('lifecycle_event', (event) => events.push(event));

      await manager.prepareResume('run-20260126000000');

      expect(events).toContainEqual({ type: 'run_resuming', runId: 'run-20260126000000' });
      expect(events).toContainEqual({ type: 'run_resumed', runId: 'run-20260126000000', agent: 'refiner' });
    });

    it('should return null resumeInfo when no pending CRP', async () => {
      stateManagerMock.loadState.mockResolvedValue({
        run_id: 'run-20260126000000',
        phase: 'waiting_human',
        iteration: 1,
        max_iterations: 3,
        pending_crp: null,
      } as any);

      const result = await manager.prepareResume('run-20260126000000');

      expect(result.resumeInfo).toBeNull();
    });
  });

  describe('generatePrompts', () => {
    it('should generate prompts for a run', async () => {
      await manager.generatePrompts(
        '/test/run',
        'run-123',
        2,
        true
      );

      expect(mockPromptGenerator.generateAllPrompts).toHaveBeenCalledWith(
        '/test/run/prompts',
        expect.objectContaining({
          project_root: '/test/project',
          run_id: 'run-123',
          iteration: 2,
          has_review: true,
        })
      );
    });

    it('should default hasReview to false', async () => {
      await manager.generatePrompts('/test/run', 'run-123', 1);

      expect(mockPromptGenerator.generateAllPrompts).toHaveBeenCalledWith(
        '/test/run/prompts',
        expect.objectContaining({
          has_review: false,
        })
      );
    });
  });
});
