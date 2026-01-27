/**
 * Integration tests for Orchestrator
 * Tests the complete workflow without actual tmux/Claude
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { EventEmitter } from 'events';
import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { Orchestrator, OrchestratorEvent } from '../../src/core/orchestrator.js';
import { RunManager } from '../../src/core/run-manager.js';
import * as TmuxModule from '../../src/core/tmux-manager.js';
import {
  createTempDir,
  cleanupTempDir,
  generateTestRunId,
  getDefaultTestConfig,
  getSampleBriefing,
  createMockVerdict,
  createMockCRP,
  writeMockCRP,
  writeMockVerdict,
} from '../helpers/test-utils.js';
import type { OrchestraConfig, GatekeeperVerdict, Phase, AgentName } from '../../src/types/index.js';

// Spy on TmuxManager static method and instance methods
const originalIsTmuxAvailable = TmuxModule.TmuxManager.isTmuxAvailable;

describe('Orchestrator Integration', () => {
  let tempDir: string;
  let config: OrchestraConfig;
  let orchestrator: Orchestrator;
  let runManager: RunManager;
  let collectedEvents: OrchestratorEvent[];
  let tmuxMock: {
    createSession: Mock;
    killSession: Mock;
    sessionExists: Mock;
    getSessionName: Mock;
    runAgent: Mock;
    capturePane: Mock;
    updatePaneBordersWithModels: Mock;
  };

  beforeEach(async () => {
    tempDir = createTempDir('orchestrator-integration');
    config = getDefaultTestConfig();
    runManager = new RunManager(tempDir);
    await runManager.initialize();

    // Create config directory
    mkdirSync(join(tempDir, '.orchestral', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.orchestral', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    // Mock TmuxManager static method
    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);

    // Setup instance method mocks
    tmuxMock = {
      createSession: vi.fn(),
      killSession: vi.fn(),
      sessionExists: vi.fn().mockReturnValue(false),
      getSessionName: vi.fn().mockReturnValue('test-session'),
      startAgent: vi.fn(),
      capturePane: vi.fn().mockReturnValue(''),
      updatePaneBordersWithModels: vi.fn(),
      clearAgent: vi.fn(),
      isPaneActive: vi.fn().mockReturnValue(true),
    };

    // Mock TmuxManager prototype methods
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(tmuxMock.createSession);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(tmuxMock.killSession);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockImplementation(tmuxMock.sessionExists);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockImplementation(tmuxMock.getSessionName);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgent').mockImplementation(tmuxMock.startAgent);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'capturePane').mockImplementation(tmuxMock.capturePane);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(tmuxMock.updatePaneBordersWithModels);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'clearAgent').mockImplementation(tmuxMock.clearAgent);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'isPaneActive').mockImplementation(tmuxMock.isPaneActive);

    orchestrator = new Orchestrator(tempDir, config);
    collectedEvents = [];

    // Collect all events
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
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should create orchestrator with correct configuration', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.getIsRunning()).toBe(false);
      expect(orchestrator.getCurrentRunId()).toBeNull();
    });

    it('should expose retry and recovery managers', () => {
      expect(orchestrator.getRetryManager()).toBeDefined();
      expect(orchestrator.getRecoveryManager()).toBeDefined();
    });

    it('should return null for state when no run active', async () => {
      const state = await orchestrator.getCurrentState();
      expect(state).toBeNull();
    });
  });

  describe('Run Lifecycle', () => {
    it('should start a new run successfully', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());

      expect(runId).toMatch(/^run-\d{14}$/);
      expect(orchestrator.getIsRunning()).toBe(true);
      expect(orchestrator.getCurrentRunId()).toBe(runId);

      // Verify run_started event was emitted
      const runStartedEvent = collectedEvents.find(e => e.type === 'run_started');
      expect(runStartedEvent).toBeDefined();
      expect(runStartedEvent?.runId).toBe(runId);
    });

    it('should reject starting a run when one is already in progress', async () => {
      await orchestrator.startRun(getSampleBriefing());

      await expect(orchestrator.startRun(getSampleBriefing())).rejects.toThrow(
        'A run is already in progress'
      );
    });

    it('should stop a running run', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());
      expect(orchestrator.getIsRunning()).toBe(true);

      await orchestrator.stopRun();

      expect(orchestrator.getIsRunning()).toBe(false);
      expect(orchestrator.getCurrentRunId()).toBeNull();
    });

    it('should emit agent_started event when starting refiner', async () => {
      await orchestrator.startRun(getSampleBriefing());

      const agentStartedEvent = collectedEvents.find(
        e => e.type === 'agent_started' && (e as any).agent === 'refiner'
      );
      expect(agentStartedEvent).toBeDefined();
    });

    it('should emit models_selected event on run start', async () => {
      await orchestrator.startRun(getSampleBriefing());

      const modelsSelectedEvent = collectedEvents.find(e => e.type === 'models_selected');
      expect(modelsSelectedEvent).toBeDefined();
    });

    it('should create tmux session when starting run', async () => {
      await orchestrator.startRun(getSampleBriefing());

      expect(tmuxMock.createSession).toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    it('should return current state for active run', async () => {
      await orchestrator.startRun(getSampleBriefing());

      const state = await orchestrator.getCurrentState();
      expect(state).toBeDefined();
      expect(state?.phase).toBe('refine');
      expect(state?.iteration).toBe(1);
    });

    it('should return selected models after run start', async () => {
      await orchestrator.startRun(getSampleBriefing());

      const models = orchestrator.getSelectedModels();
      expect(models).toBeDefined();
      expect(models).toHaveProperty('refiner');
      expect(models).toHaveProperty('builder');
      expect(models).toHaveProperty('verifier');
      expect(models).toHaveProperty('gatekeeper');
    });

    it('should return tmux session name for active run', async () => {
      await orchestrator.startRun(getSampleBriefing());

      const sessionName = orchestrator.getTmuxSessionName();
      expect(sessionName).toBe('test-session');
    });
  });

  describe('Agent Outputs', () => {
    it('should return null for agent outputs when no run active', () => {
      const outputs = orchestrator.getAgentOutputs();
      expect(outputs).toBeNull();
    });

    it('should return null for specific agent output when no run active', () => {
      const output = orchestrator.getAgentOutput('refiner');
      expect(output).toBeNull();
    });

    it('should return null for agent activity when no run active', () => {
      const activity = orchestrator.getAgentActivity('refiner');
      expect(activity).toBeNull();
    });
  });

  describe('Usage Tracking', () => {
    it('should return null for agent usage when no run active', () => {
      const usage = orchestrator.getAgentUsage('refiner');
      expect(usage).toBeNull();
    });

    it('should return null for all agent usage when no run active', () => {
      const usage = orchestrator.getAllAgentUsage();
      expect(usage).toBeNull();
    });

    it('should return null for total usage when no run active', () => {
      const usage = orchestrator.getTotalUsage();
      expect(usage).toBeNull();
    });
  });

  describe('Model Selection', () => {
    it('should read model selection result for a run', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());

      // Model selection result should be saved during run initialization
      const result = await orchestrator.getModelSelectionResult(runId);
      expect(result).toBeDefined();
      expect(result?.models).toHaveProperty('refiner');
      expect(result?.models).toHaveProperty('builder');
    });
  });

  describe('Error Handling', () => {
    it('should handle stopRun gracefully when no run is active', async () => {
      // Should not throw
      await expect(orchestrator.stopRun()).resolves.not.toThrow();
    });

    it('should clean up resources on stop', async () => {
      await orchestrator.startRun(getSampleBriefing());
      await orchestrator.stopRun();

      expect(orchestrator.getIsRunning()).toBe(false);
      expect(orchestrator.getCurrentRunId()).toBeNull();
      expect(await orchestrator.getCurrentState()).toBeNull();
    });

    it('should throw when tmux is not available', async () => {
      vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(false);

      const newOrchestrator = new Orchestrator(tempDir, config);

      await expect(newOrchestrator.startRun(getSampleBriefing())).rejects.toThrow(
        'tmux is not installed'
      );
    });
  });

  describe('Event Emission', () => {
    it('should emit events in correct order during run start', async () => {
      await orchestrator.startRun(getSampleBriefing());

      const eventTypes = collectedEvents.map(e => e.type);

      // run_started should come first
      const runStartedIndex = eventTypes.indexOf('run_started');
      expect(runStartedIndex).toBeGreaterThanOrEqual(0);

      // models_selected should be emitted
      expect(eventTypes).toContain('models_selected');

      // agent_started for refiner should be emitted
      const agentStartedIndex = eventTypes.findIndex(
        (t, i) => t === 'agent_started' && (collectedEvents[i] as any).agent === 'refiner'
      );
      expect(agentStartedIndex).toBeGreaterThan(runStartedIndex);
    });

    it('should include runId in all events', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());

      for (const event of collectedEvents) {
        expect(event.runId).toBe(runId);
      }
    });
  });
});

describe('Orchestrator Cleanup Behavior', () => {
  let tempDir: string;
  let config: OrchestraConfig;
  let orchestrator: Orchestrator;

  beforeEach(async () => {
    tempDir = createTempDir('orchestrator-cleanup');
    config = getDefaultTestConfig();
    const runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.orchestral', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.orchestral', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    // Mock TmuxManager
    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockReturnValue(false);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockReturnValue('test-session');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'capturePane').mockReturnValue('');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'clearAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'isPaneActive').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(() => {});

    orchestrator = new Orchestrator(tempDir, config);
  });

  afterEach(async () => {
    try {
      await orchestrator.stopRun();
    } catch {
      // Ignore cleanup errors
    }
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  it('should reset all internal state on cleanup', async () => {
    await orchestrator.startRun(getSampleBriefing());
    expect(orchestrator.getIsRunning()).toBe(true);

    await orchestrator.stopRun();

    expect(orchestrator.getIsRunning()).toBe(false);
    expect(orchestrator.getCurrentRunId()).toBeNull();
    expect(orchestrator.getTmuxSessionName()).toBeNull();
    expect(orchestrator.getAgentOutputs()).toBeNull();
  });

  it('should allow starting new run after cleanup', async () => {
    await orchestrator.startRun(getSampleBriefing());
    await orchestrator.stopRun();

    const newRunId = await orchestrator.startRun(getSampleBriefing());
    expect(newRunId).toMatch(/^run-\d{14}$/);
    expect(orchestrator.getIsRunning()).toBe(true);
  });
});

describe('Orchestrator Timeout Configuration', () => {
  let tempDir: string;
  let config: OrchestraConfig;

  beforeEach(async () => {
    tempDir = createTempDir('orchestrator-timeout');
    config = getDefaultTestConfig();
    const runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.orchestral', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.orchestral', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  it('should use custom timeout config when provided', () => {
    const customTimeouts = {
      refiner: 60000,
      builder: 120000,
      verifier: 60000,
      gatekeeper: 60000,
    };

    const customOrchestrator = new Orchestrator(tempDir, config, customTimeouts);
    expect(customOrchestrator).toBeDefined();
  });

  it('should merge timeout config with defaults', () => {
    const partialTimeouts = {
      refiner: 60000,
    };

    const customOrchestrator = new Orchestrator(tempDir, config, partialTimeouts);
    expect(customOrchestrator).toBeDefined();
  });
});

describe('Orchestrator Resume Flow', () => {
  let tempDir: string;
  let config: OrchestraConfig;
  let orchestrator: Orchestrator;

  beforeEach(async () => {
    tempDir = createTempDir('orchestrator-resume');
    config = getDefaultTestConfig();
    const runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.orchestral', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.orchestral', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockReturnValue(false);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockReturnValue('test-session');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(() => {});

    orchestrator = new Orchestrator(tempDir, config);
  });

  afterEach(async () => {
    try {
      await orchestrator.stopRun();
    } catch {
      // Ignore cleanup errors
    }
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  it('should throw error when resuming non-existent run', async () => {
    await expect(orchestrator.resumeRun('run-99999999999999')).rejects.toThrow();
  });

  it('should throw error when resuming run not in waiting_human state', async () => {
    const runId = await orchestrator.startRun(getSampleBriefing());
    await orchestrator.stopRun();

    await expect(orchestrator.resumeRun(runId)).rejects.toThrow(
      'is not waiting for human input'
    );
  });
});

describe('Orchestrator Concurrent Protection', () => {
  let tempDir: string;
  let config: OrchestraConfig;

  beforeEach(async () => {
    tempDir = createTempDir('orchestrator-concurrent');
    config = getDefaultTestConfig();
    const runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.orchestral', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.orchestral', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockReturnValue(false);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockReturnValue('test-session');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'capturePane').mockReturnValue('');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'clearAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'isPaneActive').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  it('should prevent same instance from starting multiple runs', async () => {
    const orchestrator = new Orchestrator(tempDir, config);

    await orchestrator.startRun(getSampleBriefing());

    await expect(orchestrator.startRun(getSampleBriefing())).rejects.toThrow(
      'A run is already in progress'
    );

    await orchestrator.stopRun();
  });

  it('should allow different instances to start runs independently', async () => {
    const orchestrator1 = new Orchestrator(tempDir, config);
    const orchestrator2 = new Orchestrator(tempDir, config);

    const runId1 = await orchestrator1.startRun(getSampleBriefing());
    const runId2 = await orchestrator2.startRun(getSampleBriefing());

    expect(runId1).toBeDefined();
    expect(runId2).toBeDefined();
    // Different runs should have different IDs (timestamps may differ)
    // Note: In quick succession they might have same timestamp

    await orchestrator1.stopRun();
    await orchestrator2.stopRun();
  });
});

describe('Orchestrator forceCapture', () => {
  let tempDir: string;
  let config: OrchestraConfig;
  let orchestrator: Orchestrator;

  beforeEach(async () => {
    tempDir = createTempDir('orchestrator-capture');
    config = getDefaultTestConfig();
    const runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.orchestral', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.orchestral', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockReturnValue(false);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockReturnValue('test-session');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'capturePane').mockReturnValue('mock output');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'clearAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'isPaneActive').mockReturnValue(true);

    orchestrator = new Orchestrator(tempDir, config);
  });

  afterEach(async () => {
    try {
      await orchestrator.stopRun();
    } catch {
      // Ignore cleanup errors
    }
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  it('should return null when no run is active', () => {
    const output = orchestrator.forceCapture('refiner');
    expect(output).toBeNull();
  });
});

describe('Orchestrator Getter Methods', () => {
  let tempDir: string;
  let config: OrchestraConfig;
  let orchestrator: Orchestrator;

  beforeEach(async () => {
    tempDir = createTempDir('orchestrator-getters');
    config = getDefaultTestConfig();
    const runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.orchestral', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.orchestral', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockReturnValue(false);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockReturnValue('test-session');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'capturePane').mockReturnValue('mock output');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'clearAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'isPaneActive').mockReturnValue(true);

    orchestrator = new Orchestrator(tempDir, config);
  });

  afterEach(async () => {
    try {
      await orchestrator.stopRun();
    } catch {
      // Ignore cleanup errors
    }
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  describe('when no run is active', () => {
    it('should return null for getCurrentState', async () => {
      const state = await orchestrator.getCurrentState();
      expect(state).toBeNull();
    });

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

    it('should return null for getAgentActivity', () => {
      expect(orchestrator.getAgentActivity('builder')).toBeNull();
    });

    it('should return null for getAgentUsage', () => {
      expect(orchestrator.getAgentUsage('verifier')).toBeNull();
    });

    it('should return null for getAllAgentUsage', () => {
      expect(orchestrator.getAllAgentUsage()).toBeNull();
    });

    it('should return null for getTotalUsage', () => {
      expect(orchestrator.getTotalUsage()).toBeNull();
    });

    it('should return null for getSelectedModels', () => {
      expect(orchestrator.getSelectedModels()).toBeNull();
    });

    it('should return RetryManager instance', () => {
      expect(orchestrator.getRetryManager()).toBeDefined();
    });

    it('should return RecoveryManager instance', () => {
      expect(orchestrator.getRecoveryManager()).toBeDefined();
    });
  });

  describe('when run is active', () => {
    it('should return current state', async () => {
      await orchestrator.startRun(getSampleBriefing());
      const state = await orchestrator.getCurrentState();
      expect(state).toBeDefined();
      expect(state?.phase).toBe('refine');
    });

    it('should return current run id', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());
      expect(orchestrator.getCurrentRunId()).toBe(runId);
    });

    it('should return true for getIsRunning', async () => {
      await orchestrator.startRun(getSampleBriefing());
      expect(orchestrator.getIsRunning()).toBe(true);
    });

    it('should return tmux session name', async () => {
      await orchestrator.startRun(getSampleBriefing());
      expect(orchestrator.getTmuxSessionName()).toBe('test-session');
    });

    it('should return selected models', async () => {
      await orchestrator.startRun(getSampleBriefing());
      const models = orchestrator.getSelectedModels();
      expect(models).toBeDefined();
      expect(models).toHaveProperty('refiner');
      expect(models).toHaveProperty('builder');
    });

    it('should return model selection result for run', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());
      const result = await orchestrator.getModelSelectionResult(runId);
      expect(result).toBeDefined();
    });
  });
});

describe('Orchestrator Event Handling', () => {
  let tempDir: string;
  let config: OrchestraConfig;
  let orchestrator: Orchestrator;
  let collectedEvents: OrchestratorEvent[];

  beforeEach(async () => {
    tempDir = createTempDir('orchestrator-events');
    config = getDefaultTestConfig();
    const runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.orchestral', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.orchestral', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockReturnValue(false);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockReturnValue('test-session');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'capturePane').mockReturnValue('');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'clearAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'isPaneActive').mockReturnValue(true);

    orchestrator = new Orchestrator(tempDir, config);
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
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  it('should emit run_started and models_selected events on start', async () => {
    await orchestrator.startRun(getSampleBriefing());

    const runStartedEvents = collectedEvents.filter(e => e.type === 'run_started');
    const modelsSelectedEvents = collectedEvents.filter(e => e.type === 'models_selected');

    expect(runStartedEvents.length).toBeGreaterThan(0);
    expect(modelsSelectedEvents.length).toBeGreaterThan(0);
  });

  it('should emit agent_started event for refiner', async () => {
    await orchestrator.startRun(getSampleBriefing());

    const agentStartedEvents = collectedEvents.filter(
      e => e.type === 'agent_started' && 'agent' in e && e.agent === 'refiner'
    );

    expect(agentStartedEvents.length).toBeGreaterThan(0);
  });
});
