/**
 * Unit tests for Orchestrator
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OrchestraConfig, AgentName, AgentModel, Phase, RunState } from '../../../src/types/index.js';
import { getDefaultTestConfig } from '../../helpers/test-utils.js';

// Create mock factory functions that return fresh mock instances
const createMockStateManager = () => ({
  loadState: vi.fn().mockResolvedValue({
    run_id: 'run-20260126000000',
    phase: 'refine' as Phase,
    iteration: 1,
    max_iterations: 3,
    pending_crp: null,
  } as Partial<RunState>),
  updateAgentStatus: vi.fn().mockResolvedValue(undefined),
  updateAgentUsage: vi.fn().mockResolvedValue(undefined),
  addError: vi.fn().mockResolvedValue(undefined),
});

const createMockTmuxManager = () => ({
  getSessionName: vi.fn().mockReturnValue('test-session'),
  killSession: vi.fn(),
  createSession: vi.fn(),
  sessionExists: vi.fn().mockReturnValue(false),
});

const createMockEventLogger = () => ({
  log: vi.fn(),
});

const createMockAgentLifecycle = () => ({
  startAgent: vi.fn().mockResolvedValue(undefined),
  completeAgent: vi.fn().mockResolvedValue(undefined),
  failAgent: vi.fn().mockResolvedValue(undefined),
  stopAgent: vi.fn(),
  getAllOutputs: vi.fn().mockReturnValue({}),
  getAgentOutput: vi.fn().mockReturnValue(''),
  forceCapture: vi.fn().mockReturnValue(''),
  getAgentActivity: vi.fn().mockReturnValue({ lastActivity: new Date(), isStale: false }),
  getAgentUsage: vi.fn().mockReturnValue(null),
  getAllAgentUsage: vi.fn().mockReturnValue({}),
  getTotalUsage: vi.fn().mockReturnValue({ total_input_tokens: 0, total_output_tokens: 0 }),
  restartAgentWithVCR: vi.fn().mockResolvedValue(undefined),
  cleanup: vi.fn(),
  on: vi.fn(),
});

const createMockPhaseManager = () => ({
  transition: vi.fn().mockResolvedValue(true),
  getCurrentPhase: vi.fn().mockResolvedValue('refine' as Phase),
  getPhaseAgent: vi.fn().mockImplementation((phase: Phase) => {
    const map: Record<Phase, AgentName | null> = {
      refine: 'refiner',
      build: 'builder',
      verify: 'verifier',
      gate: 'gatekeeper',
      waiting_human: null,
      completed: null,
      failed: null,
    };
    return map[phase] || null;
  }),
});

// Module-level mock instances (reset in beforeEach)
let stateManagerMock = createMockStateManager();
let tmuxManagerMock = createMockTmuxManager();
let eventLoggerMock = createMockEventLogger();
let agentLifecycleMock = createMockAgentLifecycle();
let phaseManagerMock = createMockPhaseManager();

// Define mock models
const mockSelectedModels: Record<AgentName, AgentModel> = {
  refiner: 'haiku',
  builder: 'sonnet',
  verifier: 'haiku',
  gatekeeper: 'sonnet',
};

const mockModelSelection = {
  models: mockSelectedModels,
  analysis: {
    level: 'standard',
    estimated_complexity: 'medium',
    tokens: { estimated_input: 1000, estimated_output: 500 },
    recommendation: 'sonnet',
  },
  selection_method: 'auto',
  timestamp: new Date().toISOString(),
};

// Mock RunManager
vi.mock('../../../src/core/run-manager.js', () => ({
  RunManager: class MockRunManager {
    initialize = vi.fn().mockResolvedValue(undefined);
    generateRunId = vi.fn().mockReturnValue('run-20260126000000');
    createRun = vi.fn().mockResolvedValue('/test/.dure/runs/run-20260126000000');
    getRunDir = vi.fn().mockReturnValue('/test/.dure/runs/run-20260126000000');
    readModelSelection = vi.fn().mockResolvedValue(null);
    saveModelSelection = vi.fn().mockResolvedValue(undefined);
    readRawBriefing = vi.fn().mockResolvedValue('# Test Briefing');
    listCRPs = vi.fn().mockResolvedValue([]);
    listVCRs = vi.fn().mockResolvedValue([]);
  },
}));

// Mock PromptGenerator
vi.mock('../../../src/agents/prompt-generator.js', () => ({
  PromptGenerator: class MockPromptGenerator {
    generateAllPrompts = vi.fn().mockResolvedValue(undefined);
  },
}));

// Mock ModelSelector
vi.mock('../../../src/core/model-selector.js', () => ({
  ModelSelector: class MockModelSelector {
    selectModels = vi.fn().mockReturnValue(mockModelSelection);
  },
}));

// Mock RetryManager
vi.mock('../../../src/core/retry-manager.js', () => ({
  RetryManager: class MockRetryManager {
    executeWithRetry = vi.fn().mockImplementation(async (fn: Function) => fn());
    getAttemptCount = vi.fn().mockReturnValue(0);
    resetAttempts = vi.fn();
    on = vi.fn();
  },
  defaultRetryConfig: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    recoverableErrors: ['crash', 'timeout', 'validation'],
  },
}));

// Mock RecoveryManager
vi.mock('../../../src/core/recovery-strategies.js', () => ({
  RecoveryManager: class MockRecoveryManager {
    canRecover = vi.fn().mockReturnValue(true);
    recover = vi.fn().mockResolvedValue({ success: true, action: 'restart', message: 'Recovered' });
  },
}));

// Mock RunLifecycleManager
vi.mock('../../../src/core/run-lifecycle-manager.js', () => {
  const { EventEmitter } = require('events');
  return {
    RunLifecycleManager: class MockRunLifecycleManager extends EventEmitter {
      initializeRun = vi.fn().mockImplementation(async () => ({
        runId: 'run-20260126000000',
        runDir: '/test/.dure/runs/run-20260126000000',
        stateManager: stateManagerMock,
        tmuxManager: tmuxManagerMock,
        eventLogger: eventLoggerMock,
        selectedModels: mockSelectedModels,
        modelSelection: mockModelSelection,
      }));
      prepareResume = vi.fn().mockRejectedValue(new Error('Run not found'));
      generatePrompts = vi.fn().mockResolvedValue(undefined);
    },
  };
});

// Mock ErrorRecoveryService
vi.mock('../../../src/core/error-recovery-service.js', () => {
  const { EventEmitter } = require('events');
  return {
    ErrorRecoveryService: class MockErrorRecoveryService extends EventEmitter {
      handleError = vi.fn().mockResolvedValue({ success: true, action: 'restart', message: 'Recovered' });
      shouldRecover = vi.fn().mockReturnValue(true);
    },
  };
});

// Mock ManagerFactory
vi.mock('../../../src/core/manager-factory.js', () => {
  const { EventEmitter } = require('events');
  return {
    ManagerFactory: {
      create: vi.fn().mockImplementation(() => {
        const verdictEmitter = new EventEmitter();
        const coordinatorEmitter = new EventEmitter();
        return {
          agentLifecycle: agentLifecycleMock,
          phaseManager: phaseManagerMock,
          verdictHandler: {
            processVerdict: vi.fn().mockResolvedValue({ action: 'complete', verdict: 'PASS' }),
            executeVerdictResult: vi.fn().mockResolvedValue(undefined),
            on: vi.fn((event: string, handler: Function) => verdictEmitter.on(event, handler)),
            emit: vi.fn((event: string, data: any) => verdictEmitter.emit(event, data)),
          },
          agentCoordinator: {
            handleAgentDone: vi.fn().mockResolvedValue({ type: 'transition', nextPhase: 'build', nextAgent: 'builder' }),
            handleCRPCreated: vi.fn().mockResolvedValue(undefined),
            on: vi.fn((event: string, handler: Function) => coordinatorEmitter.on(event, handler)),
            emit: vi.fn((event: string, data: any) => coordinatorEmitter.emit(event, data)),
          },
          fileWatcher: {
            start: vi.fn(),
            stop: vi.fn().mockResolvedValue(undefined),
          },
          eventCoordinator: {
            cleanup: vi.fn(),
          },
          agentMonitor: {
            start: vi.fn(),
            stop: vi.fn(),
          },
        };
      }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { Orchestrator, OrchestratorEvent } from '../../../src/core/orchestrator.js';

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let config: OrchestraConfig;
  let collectedEvents: OrchestratorEvent[];

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset all mock instances
    stateManagerMock = createMockStateManager();
    tmuxManagerMock = createMockTmuxManager();
    eventLoggerMock = createMockEventLogger();
    agentLifecycleMock = createMockAgentLifecycle();
    phaseManagerMock = createMockPhaseManager();

    config = getDefaultTestConfig();
    orchestrator = new Orchestrator('/test/project', config);
    collectedEvents = [];

    orchestrator.on('orchestrator_event', (event: OrchestratorEvent) => {
      collectedEvents.push(event);
    });
  });

  afterEach(async () => {
    try {
      await orchestrator.stopRun();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should create instance with correct initial state', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.getIsRunning()).toBe(false);
      expect(orchestrator.getCurrentRunId()).toBeNull();
    });

    it('should initialize with custom timeout config', () => {
      const customTimeouts = {
        refiner: 60000,
        builder: 120000,
      };
      const orchestratorWithTimeouts = new Orchestrator('/test/project', config, customTimeouts);
      expect(orchestratorWithTimeouts).toBeDefined();
    });

    it('should expose retry and recovery managers', () => {
      expect(orchestrator.getRetryManager()).toBeDefined();
      expect(orchestrator.getRecoveryManager()).toBeDefined();
    });
  });

  describe('startRun', () => {
    it('should start a new run successfully', async () => {
      const runId = await orchestrator.startRun('# Test Briefing');

      expect(runId).toBe('run-20260126000000');
      expect(orchestrator.getIsRunning()).toBe(true);
      expect(orchestrator.getCurrentRunId()).toBe(runId);
    });

    it('should emit run_started event', async () => {
      const runId = await orchestrator.startRun('# Test Briefing');

      const runStartedEvent = collectedEvents.find((e) => e.type === 'run_started');
      expect(runStartedEvent).toBeDefined();
      expect(runStartedEvent?.runId).toBe(runId);
    });

    it('should emit models_selected event', async () => {
      await orchestrator.startRun('# Test Briefing');

      const modelsSelectedEvent = collectedEvents.find((e) => e.type === 'models_selected');
      expect(modelsSelectedEvent).toBeDefined();
    });

    it('should emit agent_started event for refiner', async () => {
      await orchestrator.startRun('# Test Briefing');

      const agentStartedEvent = collectedEvents.find(
        (e) => e.type === 'agent_started' && 'agent' in e && e.agent === 'refiner'
      );
      expect(agentStartedEvent).toBeDefined();
    });

    it('should throw error when run is already in progress', async () => {
      await orchestrator.startRun('# Test Briefing');

      await expect(orchestrator.startRun('# Another Briefing')).rejects.toThrow(
        'A run is already in progress'
      );
    });

    it('should emit events in correct order', async () => {
      await orchestrator.startRun('# Test Briefing');

      const eventTypes = collectedEvents.map((e) => e.type);
      const runStartedIndex = eventTypes.indexOf('run_started');
      const modelsSelectedIndex = eventTypes.indexOf('models_selected');
      const agentStartedIndex = eventTypes.indexOf('agent_started');

      expect(runStartedIndex).toBeGreaterThanOrEqual(0);
      expect(modelsSelectedIndex).toBeGreaterThan(runStartedIndex);
      expect(agentStartedIndex).toBeGreaterThan(modelsSelectedIndex);
    });
  });

  describe('resumeRun', () => {
    it('should throw error for non-existent run', async () => {
      await expect(orchestrator.resumeRun('run-99999999999999')).rejects.toThrow();
    });
  });

  describe('stopRun', () => {
    it('should stop running run and reset state', async () => {
      await orchestrator.startRun('# Test Briefing');
      expect(orchestrator.getIsRunning()).toBe(true);

      await orchestrator.stopRun();

      expect(orchestrator.getIsRunning()).toBe(false);
      expect(orchestrator.getCurrentRunId()).toBeNull();
    });

    it('should handle stopRun when no run is active', async () => {
      // Should not throw
      await expect(orchestrator.stopRun()).resolves.not.toThrow();
    });

    it('should allow starting new run after stop', async () => {
      await orchestrator.startRun('# Test Briefing');
      await orchestrator.stopRun();

      // Reset mocks for the second run
      stateManagerMock = createMockStateManager();
      tmuxManagerMock = createMockTmuxManager();
      eventLoggerMock = createMockEventLogger();
      agentLifecycleMock = createMockAgentLifecycle();

      const newRunId = await orchestrator.startRun('# New Briefing');
      expect(newRunId).toBeDefined();
      expect(orchestrator.getIsRunning()).toBe(true);
    });
  });

  describe('getCurrentState', () => {
    it('should return null when no run is active', async () => {
      const state = await orchestrator.getCurrentState();
      expect(state).toBeNull();
    });

    it('should return current state when run is active', async () => {
      await orchestrator.startRun('# Test Briefing');

      const state = await orchestrator.getCurrentState();
      expect(state).toBeDefined();
      expect(state?.run_id).toBe('run-20260126000000');
    });
  });

  describe('getSelectedModels', () => {
    it('should return null when no run is active', () => {
      const models = orchestrator.getSelectedModels();
      expect(models).toBeNull();
    });

    it('should return selected models when run is active', async () => {
      await orchestrator.startRun('# Test Briefing');

      const models = orchestrator.getSelectedModels();
      expect(models).toBeDefined();
      expect(models).toHaveProperty('refiner');
      expect(models).toHaveProperty('builder');
      expect(models).toHaveProperty('verifier');
      expect(models).toHaveProperty('gatekeeper');
    });

    it('should return a copy of models (not reference)', async () => {
      await orchestrator.startRun('# Test Briefing');

      const models1 = orchestrator.getSelectedModels();
      const models2 = orchestrator.getSelectedModels();
      expect(models1).not.toBe(models2);
      expect(models1).toEqual(models2);
    });
  });

  describe('public getters when no run is active', () => {
    it('should return null for getCurrentRunId', () => {
      expect(orchestrator.getCurrentRunId()).toBeNull();
    });

    it('should return false for getIsRunning', () => {
      expect(orchestrator.getIsRunning()).toBe(false);
    });

    it('should return null for getTmuxSessionName', () => {
      expect(orchestrator.getTmuxSessionName()).toBeNull();
    });

    it('should return null for getAgentOutputs', () => {
      expect(orchestrator.getAgentOutputs()).toBeNull();
    });

    it('should return null for getAgentOutput', () => {
      expect(orchestrator.getAgentOutput('refiner')).toBeNull();
    });

    it('should return null for forceCapture', () => {
      expect(orchestrator.forceCapture('refiner')).toBeNull();
    });

    it('should return null for getAgentActivity', () => {
      expect(orchestrator.getAgentActivity('refiner')).toBeNull();
    });

    it('should return null for getAgentUsage', () => {
      expect(orchestrator.getAgentUsage('refiner')).toBeNull();
    });

    it('should return null for getAllAgentUsage', () => {
      expect(orchestrator.getAllAgentUsage()).toBeNull();
    });

    it('should return null for getTotalUsage', () => {
      expect(orchestrator.getTotalUsage()).toBeNull();
    });
  });

  describe('public getters when run is active', () => {
    beforeEach(async () => {
      await orchestrator.startRun('# Test Briefing');
    });

    it('should return run id for getCurrentRunId', () => {
      expect(orchestrator.getCurrentRunId()).toBe('run-20260126000000');
    });

    it('should return true for getIsRunning', () => {
      expect(orchestrator.getIsRunning()).toBe(true);
    });

    it('should return session name for getTmuxSessionName', () => {
      expect(orchestrator.getTmuxSessionName()).toBe('test-session');
    });

    it('should return agent outputs', () => {
      const outputs = orchestrator.getAgentOutputs();
      expect(outputs).toBeDefined();
    });

    it('should return agent output for specific agent', () => {
      const output = orchestrator.getAgentOutput('refiner');
      expect(output).toBeDefined();
    });

    it('should return agent activity', () => {
      const activity = orchestrator.getAgentActivity('refiner');
      expect(activity).toBeDefined();
    });

    it('should return total usage', () => {
      const usage = orchestrator.getTotalUsage();
      expect(usage).toBeDefined();
    });
  });

  describe('event emission', () => {
    it('should include runId in all events', async () => {
      const runId = await orchestrator.startRun('# Test Briefing');

      for (const event of collectedEvents) {
        expect(event.runId).toBe(runId);
      }
    });
  });

  describe('model selection result', () => {
    it('should return null for non-existent run', async () => {
      const result = await orchestrator.getModelSelectionResult('run-99999999999999');
      expect(result).toBeNull();
    });
  });

  describe('cleanup behavior', () => {
    it('should reset all internal state on cleanup', async () => {
      await orchestrator.startRun('# Test Briefing');
      expect(orchestrator.getIsRunning()).toBe(true);

      await orchestrator.stopRun();

      expect(orchestrator.getIsRunning()).toBe(false);
      expect(orchestrator.getCurrentRunId()).toBeNull();
      expect(await orchestrator.getCurrentState()).toBeNull();
    });

    it('should preserve selectedModels after cleanup', async () => {
      await orchestrator.startRun('# Test Briefing');
      const modelsBefore = orchestrator.getSelectedModels();
      expect(modelsBefore).toBeDefined();

      await orchestrator.stopRun();

      // selectedModels is preserved even after cleanup (by design)
      const modelsAfter = orchestrator.getSelectedModels();
      expect(modelsAfter).toEqual(modelsBefore);
    });
  });
});

describe('Orchestrator with multiple instances', () => {
  let config: OrchestraConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset all mock instances
    stateManagerMock = createMockStateManager();
    tmuxManagerMock = createMockTmuxManager();
    eventLoggerMock = createMockEventLogger();
    agentLifecycleMock = createMockAgentLifecycle();
    phaseManagerMock = createMockPhaseManager();

    config = getDefaultTestConfig();
  });

  it('should prevent same instance from starting multiple runs', async () => {
    const orchestrator = new Orchestrator('/test/project', config);

    await orchestrator.startRun('# Test Briefing');

    await expect(orchestrator.startRun('# Another Briefing')).rejects.toThrow(
      'A run is already in progress'
    );

    await orchestrator.stopRun();
  });

  it('should allow different instances to be created independently', () => {
    const orchestrator1 = new Orchestrator('/test/project1', config);
    const orchestrator2 = new Orchestrator('/test/project2', config);

    expect(orchestrator1).toBeDefined();
    expect(orchestrator2).toBeDefined();
    expect(orchestrator1).not.toBe(orchestrator2);
  });
});
