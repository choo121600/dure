import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { AgentName, AgentModel, AgentTimeoutConfig } from '../../../src/types/index.js';

// Mock dependencies
const mockTmuxManager = {
  startAgent: vi.fn(),
  startAgentAndWaitReady: vi.fn().mockResolvedValue(undefined),
  clearAgent: vi.fn(),
  restartAgentWithVCR: vi.fn(),
  updatePaneBordersWithModels: vi.fn(),
  capturePane: vi.fn().mockReturnValue(''),
  isPaneActive: vi.fn().mockReturnValue(false),
};

const mockStateManager = {
  updateAgentStatus: vi.fn().mockResolvedValue(undefined),
  updateAgentUsage: vi.fn().mockResolvedValue(undefined),
  loadState: vi.fn().mockReturnValue({
    run_id: 'run-20260126000000',
    phase: 'refine',
    iteration: 1,
    max_iterations: 3,
    agents: {
      refiner: { status: 'pending' },
      builder: { status: 'pending' },
      verifier: { status: 'pending' },
      gatekeeper: { status: 'pending' },
    },
  }),
};

const mockAgentMonitor = {
  watchAgent: vi.fn(),
  unwatchAgent: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  getActivityInfo: vi.fn().mockReturnValue({ lastActivity: new Date(), isStale: false }),
  on: vi.fn(),
  off: vi.fn(),
};

const mockOutputStreamer = {
  startStreaming: vi.fn(),
  stopStreaming: vi.fn(),
  getAgentOutput: vi.fn().mockReturnValue('test output'),
  getAllOutputs: vi.fn().mockReturnValue({
    refiner: 'refiner output',
    builder: 'builder output',
    verifier: 'verifier output',
    gatekeeper: 'gatekeeper output',
  }),
  forceCapture: vi.fn().mockReturnValue('forced output'),
  on: vi.fn(),
  off: vi.fn(),
};

const mockUsageTracker = {
  startTracking: vi.fn(),
  stopTracking: vi.fn(),
  getAgentUsage: vi.fn().mockReturnValue({
    input_tokens: 1000,
    output_tokens: 500,
    cache_creation_tokens: 100,
    cache_read_tokens: 200,
    cost_usd: 0.01,
  }),
  getAllAgentUsage: vi.fn().mockReturnValue({
    refiner: { input_tokens: 1000, output_tokens: 500, cache_creation_tokens: 100, cache_read_tokens: 200, cost_usd: 0.01 },
    builder: { input_tokens: 2000, output_tokens: 1000, cache_creation_tokens: 200, cache_read_tokens: 400, cost_usd: 0.02 },
    verifier: { input_tokens: 500, output_tokens: 250, cache_creation_tokens: 50, cache_read_tokens: 100, cost_usd: 0.005 },
    gatekeeper: { input_tokens: 800, output_tokens: 400, cache_creation_tokens: 80, cache_read_tokens: 160, cost_usd: 0.008 },
  }),
  getTotalUsage: vi.fn().mockReturnValue({
    total_input_tokens: 4300,
    total_output_tokens: 2150,
    total_cache_creation_tokens: 430,
    total_cache_read_tokens: 860,
    total_cost_usd: 0.043,
  }),
  fetchAgentUsage: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  off: vi.fn(),
};

// Import after setting up mocks
vi.mock('../../../src/core/tmux-manager.js', () => ({
  TmuxManager: vi.fn().mockImplementation(() => mockTmuxManager),
}));

vi.mock('../../../src/core/state-manager.js', () => ({
  StateManager: vi.fn().mockImplementation(() => mockStateManager),
}));

vi.mock('../../../src/core/agent-monitor.js', () => ({
  AgentMonitor: vi.fn().mockImplementation(() => mockAgentMonitor),
}));

vi.mock('../../../src/core/output-streamer.js', () => ({
  OutputStreamer: vi.fn().mockImplementation(() => mockOutputStreamer),
}));

vi.mock('../../../src/core/usage-tracker.js', () => ({
  UsageTracker: vi.fn().mockImplementation(() => mockUsageTracker),
}));

import { AgentLifecycleManager } from '../../../src/core/agent-lifecycle-manager.js';

describe('AgentLifecycleManager', () => {
  let manager: AgentLifecycleManager;
  const selectedModels: Record<AgentName, AgentModel> = {
    refiner: 'haiku',
    builder: 'sonnet',
    verifier: 'haiku',
    gatekeeper: 'sonnet',
  };
  const timeoutConfig: AgentTimeoutConfig = {
    refiner: 300000,
    builder: 600000,
    verifier: 300000,
    gatekeeper: 300000,
    activityCheckInterval: 30000,
    maxInactivityTime: 120000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new AgentLifecycleManager(
      mockTmuxManager as any,
      mockStateManager as any,
      mockAgentMonitor as any,
      {
        projectRoot: '/test/project',
        timeoutConfig,
        selectedModels,
      }
    );
    manager.setRunId('run-20260126000000');
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(manager.getSelectedModels()).toEqual(selectedModels);
    });
  });

  describe('setRunId', () => {
    it('should set the run ID', () => {
      manager.setRunId('new-run-id');
      // No direct getter for runId, but we can verify by attempting to start an agent
    });
  });

  describe('updateSelectedModels', () => {
    it('should update selected models', () => {
      const newModels: Record<AgentName, AgentModel> = {
        refiner: 'sonnet',
        builder: 'opus',
        verifier: 'sonnet',
        gatekeeper: 'opus',
      };
      manager.updateSelectedModels(newModels);
      expect(manager.getSelectedModels()).toEqual(newModels);
    });
  });

  describe('startAgent', () => {
    it('should start an agent successfully', async () => {
      await manager.startAgent('refiner', '/test/project/.orchestral/runs/run-20260126000000');

      expect(mockStateManager.updateAgentStatus).toHaveBeenCalledWith('refiner', 'running');
      expect(mockAgentMonitor.watchAgent).toHaveBeenCalledWith('refiner');
      expect(mockTmuxManager.startAgentAndWaitReady).toHaveBeenCalledWith(
        'refiner',
        'haiku',
        '/test/project/.orchestral/runs/run-20260126000000/prompts/refiner.md'
      );
    });

    it('should throw if run ID not set', async () => {
      manager.setRunId(null as any);
      await expect(manager.startAgent('refiner', '/test/run')).rejects.toThrow('Run ID not set');
    });

    it('should emit lifecycle events', async () => {
      const events: any[] = [];
      manager.on('lifecycle_event', (event) => events.push(event));

      await manager.startAgent('builder', '/test/project/.orchestral/runs/run-20260126000000');

      expect(events).toContainEqual({ type: 'agent_starting', agent: 'builder' });
      expect(events).toContainEqual({ type: 'agent_started', agent: 'builder' });
    });
  });

  describe('stopAgent', () => {
    it('should stop monitoring an agent', () => {
      manager.stopAgent('refiner');
      expect(mockAgentMonitor.unwatchAgent).toHaveBeenCalledWith('refiner');
    });

    it('should emit lifecycle events', () => {
      const events: any[] = [];
      manager.on('lifecycle_event', (event) => events.push(event));

      manager.stopAgent('builder');

      expect(events).toContainEqual({ type: 'agent_stopping', agent: 'builder' });
      expect(events).toContainEqual({ type: 'agent_stopped', agent: 'builder' });
    });
  });

  describe('clearAgent', () => {
    it('should clear agent context', async () => {
      manager.setUsageTracker(mockUsageTracker as any);
      await manager.clearAgent('refiner');

      expect(mockTmuxManager.clearAgent).toHaveBeenCalledWith('refiner');
      expect(mockUsageTracker.fetchAgentUsage).toHaveBeenCalledWith('refiner');
    });

    it('should emit cleared event', async () => {
      const events: any[] = [];
      manager.on('lifecycle_event', (event) => events.push(event));

      await manager.clearAgent('builder');

      expect(events).toContainEqual({ type: 'agent_cleared', agent: 'builder' });
    });
  });

  describe('restartAgentWithVCR', () => {
    it('should restart agent with VCR info', async () => {
      const vcrInfo = {
        crpQuestion: 'Test question?',
        decision: 'A',
        decisionLabel: 'Option A',
        rationale: 'Because A is best',
      };

      await manager.restartAgentWithVCR('refiner', 'run-123', '/test/prompt.md', vcrInfo);

      expect(mockStateManager.updateAgentStatus).toHaveBeenCalledWith('refiner', 'running');
      expect(mockAgentMonitor.watchAgent).toHaveBeenCalledWith('refiner');
      expect(mockTmuxManager.restartAgentWithVCR).toHaveBeenCalledWith(
        'refiner',
        'run-123',
        '/test/prompt.md',
        vcrInfo
      );
    });
  });

  describe('completeAgent', () => {
    it('should complete agent by stopping and updating status', () => {
      manager.completeAgent('verifier');

      expect(mockAgentMonitor.unwatchAgent).toHaveBeenCalledWith('verifier');
      expect(mockStateManager.updateAgentStatus).toHaveBeenCalledWith('verifier', 'completed');
    });
  });

  describe('failAgent', () => {
    it('should fail agent with error message', () => {
      manager.failAgent('builder', 'Test error');

      expect(mockAgentMonitor.unwatchAgent).toHaveBeenCalledWith('builder');
      expect(mockStateManager.updateAgentStatus).toHaveBeenCalledWith('builder', 'failed', 'Test error');
    });
  });

  describe('getAgentModel', () => {
    it('should return the model for a specific agent', () => {
      expect(manager.getAgentModel('refiner')).toBe('haiku');
      expect(manager.getAgentModel('builder')).toBe('sonnet');
    });
  });

  describe('output and usage getters', () => {
    beforeEach(() => {
      manager.setOutputStreamer(mockOutputStreamer as any);
      manager.setUsageTracker(mockUsageTracker as any);
    });

    it('should get agent output', () => {
      expect(manager.getAgentOutput('refiner')).toBe('test output');
    });

    it('should get all outputs', () => {
      const outputs = manager.getAllOutputs();
      expect(outputs).toHaveProperty('refiner', 'refiner output');
      expect(outputs).toHaveProperty('builder', 'builder output');
    });

    it('should force capture', () => {
      expect(manager.forceCapture('builder')).toBe('forced output');
    });

    it('should get agent usage', () => {
      const usage = manager.getAgentUsage('refiner');
      expect(usage?.input_tokens).toBe(1000);
    });

    it('should get all agent usage', () => {
      const usage = manager.getAllAgentUsage();
      expect(usage).toHaveProperty('refiner');
      expect(usage).toHaveProperty('builder');
    });

    it('should get total usage', () => {
      const total = manager.getTotalUsage();
      expect(total?.total_input_tokens).toBe(4300);
    });
  });

  describe('streaming and tracking', () => {
    beforeEach(() => {
      manager.setOutputStreamer(mockOutputStreamer as any);
      manager.setUsageTracker(mockUsageTracker as any);
    });

    it('should start output streaming', () => {
      manager.startOutputStreaming('run-123');
      expect(mockOutputStreamer.startStreaming).toHaveBeenCalledWith('run-123');
    });

    it('should stop output streaming', () => {
      manager.stopOutputStreaming();
      expect(mockOutputStreamer.stopStreaming).toHaveBeenCalled();
    });

    it('should start usage tracking', () => {
      manager.startUsageTracking();
      expect(mockUsageTracker.startTracking).toHaveBeenCalledWith(selectedModels);
    });

    it('should stop usage tracking', () => {
      manager.stopUsageTracking();
      expect(mockUsageTracker.stopTracking).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clean up all resources', () => {
      manager.setOutputStreamer(mockOutputStreamer as any);
      manager.setUsageTracker(mockUsageTracker as any);

      manager.cleanup();

      expect(mockOutputStreamer.stopStreaming).toHaveBeenCalled();
      expect(mockUsageTracker.stopTracking).toHaveBeenCalled();
      expect(mockAgentMonitor.stop).toHaveBeenCalled();
    });
  });
});
