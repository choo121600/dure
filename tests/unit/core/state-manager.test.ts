/**
 * Unit tests for StateManager
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { StateManager } from '../../../src/core/state-manager.js';
import {
  createTempDir,
  cleanupTempDir,
  generateTestRunId,
  createMockRunDir,
  createMockState,
  createMockUsageInfo,
} from '../../helpers/test-utils.js';
import type { RunState, Phase, AgentName, AgentStatus } from '../../../src/types/index.js';

describe('StateManager', () => {
  let tempDir: string;
  let runDir: string;
  let runId: string;
  let stateManager: StateManager;

  beforeEach(() => {
    tempDir = createTempDir('state-manager-test');
    runId = generateTestRunId();
    runDir = createMockRunDir(tempDir, runId);
    stateManager = new StateManager(runDir);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('createInitialState', () => {
    it('should create valid initial state with all required fields', async () => {
      const state = await stateManager.createInitialState(runId, 3);

      expect(state.run_id).toBe(runId);
      expect(state.phase).toBe('refine');
      expect(state.iteration).toBe(1);
      expect(state.max_iterations).toBe(3);
      expect(state.started_at).toBeDefined();
      expect(state.updated_at).toBeDefined();
      expect(state.pending_crp).toBeNull();
      expect(state.errors).toEqual([]);
      expect(state.history).toEqual([]);
    });

    it('should set phase to "refine"', async () => {
      const state = await stateManager.createInitialState(runId, 3);
      expect(state.phase).toBe('refine');
    });

    it('should initialize all agents as pending', async () => {
      const state = await stateManager.createInitialState(runId, 3);

      expect(state.agents.refiner.status).toBe('pending');
      expect(state.agents.builder.status).toBe('pending');
      expect(state.agents.verifier.status).toBe('pending');
      expect(state.agents.gatekeeper.status).toBe('pending');
    });

    it('should initialize usage tracking', async () => {
      const state = await stateManager.createInitialState(runId, 3);

      expect(state.usage).toBeDefined();
      expect(state.usage?.total_input_tokens).toBe(0);
      expect(state.usage?.total_output_tokens).toBe(0);
      expect(state.usage?.total_cost_usd).toBe(0);

      expect(state.agents.refiner.usage).toBeNull();
      expect(state.agents.builder.usage).toBeNull();
    });

    it('should initialize last_event with run.started', async () => {
      const state = await stateManager.createInitialState(runId, 3);

      expect(state.last_event).toBeDefined();
      expect(state.last_event?.type).toBe('run.started');
      expect(state.last_event?.timestamp).toBeDefined();
    });

    it('should persist state to disk', async () => {
      await stateManager.createInitialState(runId, 3);

      const statePath = join(runDir, 'state.json');
      expect(existsSync(statePath)).toBe(true);

      const content = readFileSync(statePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.run_id).toBe(runId);
    });
  });

  describe('loadState', () => {
    it('should load existing state', async () => {
      await stateManager.createInitialState(runId, 3);
      const loaded = await stateManager.loadState();

      expect(loaded).not.toBeNull();
      expect(loaded?.run_id).toBe(runId);
    });

    it('should return null if state file does not exist', async () => {
      const loaded = await stateManager.loadState();
      expect(loaded).toBeNull();
    });

    it('should return null for corrupted state file', async () => {
      const statePath = join(runDir, 'state.json');
      writeFileSync(statePath, 'invalid json {{{', 'utf-8');

      const loaded = await stateManager.loadState();
      expect(loaded).toBeNull();
    });
  });

  describe('saveState', () => {
    it('should write atomically using temp file', async () => {
      const state = createMockState(runId);

      // Write directly to test atomicity
      await stateManager.saveState(state);

      const loaded = await stateManager.loadState();
      expect(loaded?.run_id).toBe(runId);
    });

    it('should update updated_at timestamp', async () => {
      const state = createMockState(runId);
      const originalTime = state.updated_at;

      // Wait a tiny bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));
      await stateManager.saveState(state);
      expect(state.updated_at).not.toBe(originalTime);
    });

    it('should preserve all state fields', async () => {
      const state = createMockState(runId, {
        phase: 'build',
        iteration: 2,
        errors: ['error1', 'error2'],
      });

      await stateManager.saveState(state);
      const loaded = await stateManager.loadState();

      expect(loaded?.phase).toBe('build');
      expect(loaded?.iteration).toBe(2);
      expect(loaded?.errors).toEqual(['error1', 'error2']);
    });
  });

  describe('updatePhase', () => {
    beforeEach(async () => {
      await stateManager.createInitialState(runId, 3);
    });

    it('should update phase and add history entry', async () => {
      const state = await stateManager.updatePhase('build');

      expect(state.phase).toBe('build');
      expect(state.history.length).toBe(1);
      expect(state.history[0].phase).toBe('refine');
      expect(state.history[0].result).toBe('completed');
    });

    it('should throw if no state exists', async () => {
      const emptyDir = createMockRunDir(tempDir, 'run-99999999999999');
      const emptyStateManager = new StateManager(emptyDir);

      await expect(emptyStateManager.updatePhase('build')).rejects.toThrow('No state found');
    });

    it('should allow valid phase transitions', async () => {
      await stateManager.updatePhase('build');
      const state = await stateManager.updatePhase('verify');

      expect(state.phase).toBe('verify');
      expect(state.history.length).toBe(2);
    });
  });

  describe('updateAgentStatus', () => {
    beforeEach(async () => {
      await stateManager.createInitialState(runId, 3);
    });

    it('should set started_at when status is running', async () => {
      const state = await stateManager.updateAgentStatus('refiner', 'running');

      expect(state.agents.refiner.status).toBe('running');
      expect(state.agents.refiner.started_at).toBeDefined();
    });

    it('should set completed_at when status is completed', async () => {
      await stateManager.updateAgentStatus('refiner', 'running');
      const state = await stateManager.updateAgentStatus('refiner', 'completed');

      expect(state.agents.refiner.status).toBe('completed');
      expect(state.agents.refiner.completed_at).toBeDefined();
    });

    it('should set completed_at when status is failed', async () => {
      await stateManager.updateAgentStatus('refiner', 'running');
      const state = await stateManager.updateAgentStatus('refiner', 'failed');

      expect(state.agents.refiner.status).toBe('failed');
      expect(state.agents.refiner.completed_at).toBeDefined();
    });

    it('should record error when provided', async () => {
      const state = await stateManager.updateAgentStatus('refiner', 'failed', 'Test error');

      expect(state.agents.refiner.error).toBe('Test error');
    });

    it('should throw if no state exists', async () => {
      const emptyDir = createMockRunDir(tempDir, 'run-99999999999998');
      const emptyStateManager = new StateManager(emptyDir);

      await expect(emptyStateManager.updateAgentStatus('refiner', 'running')).rejects.toThrow('No state found');
    });
  });

  describe('setPendingCRP', () => {
    beforeEach(async () => {
      await stateManager.createInitialState(runId, 3);
    });

    it('should set pending CRP and change phase to waiting_human', async () => {
      const state = await stateManager.setPendingCRP('crp-001');

      expect(state.pending_crp).toBe('crp-001');
      expect(state.phase).toBe('waiting_human');
    });

    it('should clear pending CRP when null', async () => {
      await stateManager.setPendingCRP('crp-001');
      const state = await stateManager.setPendingCRP(null);

      expect(state.pending_crp).toBeNull();
    });
  });

  describe('incrementIteration', () => {
    beforeEach(async () => {
      await stateManager.createInitialState(runId, 3);
    });

    it('should increment iteration count', async () => {
      const state = await stateManager.incrementIteration();
      expect(state.iteration).toBe(2);
    });

    it('should reset builder, verifier, gatekeeper statuses', async () => {
      // Set some statuses first
      await stateManager.updateAgentStatus('builder', 'completed');
      await stateManager.updateAgentStatus('verifier', 'completed');
      await stateManager.updateAgentStatus('gatekeeper', 'failed');

      const state = await stateManager.incrementIteration();

      expect(state.agents.builder.status).toBe('pending');
      expect(state.agents.verifier.status).toBe('pending');
      expect(state.agents.gatekeeper.status).toBe('pending');
    });

    it('should clear timestamps and errors for reset agents', async () => {
      await stateManager.updateAgentStatus('builder', 'running');
      await stateManager.updateAgentStatus('builder', 'failed', 'Some error');

      const state = await stateManager.incrementIteration();

      expect(state.agents.builder.started_at).toBeUndefined();
      expect(state.agents.builder.completed_at).toBeUndefined();
      expect(state.agents.builder.error).toBeUndefined();
    });
  });

  describe('isMaxIterationsExceeded', () => {
    it('should return true when iteration >= max_iterations', async () => {
      await stateManager.createInitialState(runId, 2);
      await stateManager.incrementIteration(); // iteration = 2

      expect(await stateManager.isMaxIterationsExceeded()).toBe(true);
    });

    it('should return false when iteration < max_iterations', async () => {
      await stateManager.createInitialState(runId, 3);

      expect(await stateManager.isMaxIterationsExceeded()).toBe(false);
    });

    it('should return false if no state exists', async () => {
      expect(await stateManager.isMaxIterationsExceeded()).toBe(false);
    });
  });

  describe('addHistory', () => {
    beforeEach(async () => {
      await stateManager.createInitialState(runId, 3);
    });

    it('should add history entry', async () => {
      const entry = {
        phase: 'refine' as Phase,
        result: 'completed',
        timestamp: new Date().toISOString(),
      };

      const state = await stateManager.addHistory(entry);

      expect(state.history.length).toBe(1);
      expect(state.history[0]).toEqual(entry);
    });

    it('should preserve existing history', async () => {
      const entry1 = { phase: 'refine' as Phase, result: 'completed', timestamp: new Date().toISOString() };
      const entry2 = { phase: 'build' as Phase, result: 'completed', timestamp: new Date().toISOString() };

      await stateManager.addHistory(entry1);
      const state = await stateManager.addHistory(entry2);

      expect(state.history.length).toBe(2);
    });
  });

  describe('addError', () => {
    beforeEach(async () => {
      await stateManager.createInitialState(runId, 3);
    });

    it('should add error to errors array', async () => {
      const state = await stateManager.addError('Test error');

      expect(state.errors).toContain('Test error');
    });

    it('should preserve existing errors', async () => {
      await stateManager.addError('Error 1');
      const state = await stateManager.addError('Error 2');

      expect(state.errors).toEqual(['Error 1', 'Error 2']);
    });
  });

  describe('updateAgentUsage', () => {
    beforeEach(async () => {
      await stateManager.createInitialState(runId, 3);
    });

    it('should update usage for specific agent', async () => {
      const usage = createMockUsageInfo({
        input_tokens: 1000,
        output_tokens: 500,
        cost_usd: 0.01,
      });

      const state = await stateManager.updateAgentUsage('refiner', usage);

      expect(state.agents.refiner.usage).toEqual(usage);
    });

    it('should recalculate total usage', async () => {
      const usage1 = createMockUsageInfo({ input_tokens: 1000, output_tokens: 500, cost_usd: 0.01 });
      const usage2 = createMockUsageInfo({ input_tokens: 2000, output_tokens: 1000, cost_usd: 0.02 });

      await stateManager.updateAgentUsage('refiner', usage1);
      const state = await stateManager.updateAgentUsage('builder', usage2);

      expect(state.usage?.total_input_tokens).toBe(3000);
      expect(state.usage?.total_output_tokens).toBe(1500);
      expect(state.usage?.total_cost_usd).toBeCloseTo(0.03, 5);
    });
  });

  describe('updateLastEvent', () => {
    beforeEach(async () => {
      await stateManager.createInitialState(runId, 3);
    });

    it('should update last event with type', async () => {
      const state = await stateManager.updateLastEvent('agent.started');

      expect(state.last_event?.type).toBe('agent.started');
      expect(state.last_event?.timestamp).toBeDefined();
    });

    it('should include agent when provided', async () => {
      const state = await stateManager.updateLastEvent('agent.started', 'builder');

      expect(state.last_event?.agent).toBe('builder');
    });
  });

  describe('setAgentTimeout', () => {
    beforeEach(async () => {
      await stateManager.createInitialState(runId, 3);
    });

    it('should set timeout_at for agent', async () => {
      const timeout = new Date(Date.now() + 300000).toISOString();
      const state = await stateManager.setAgentTimeout('refiner', timeout);

      expect(state.agents.refiner.timeout_at).toBe(timeout);
    });
  });

  describe('stateExists', () => {
    it('should return true when state file exists', async () => {
      await stateManager.createInitialState(runId, 3);
      expect(await stateManager.stateExists()).toBe(true);
    });

    it('should return false when state file does not exist', async () => {
      expect(await stateManager.stateExists()).toBe(false);
    });
  });

  describe('getStatePath', () => {
    it('should return correct state file path', () => {
      const path = stateManager.getStatePath();
      expect(path).toBe(join(runDir, 'state.json'));
    });
  });

  describe('edge cases', () => {
    it('should handle sequential writes correctly', async () => {
      await stateManager.createInitialState(runId, 3);

      // Sequential writes to verify state persistence
      for (let i = 1; i <= 5; i++) {
        const state = await stateManager.loadState();
        if (state) {
          state.iteration = i;
          await stateManager.saveState(state);
        }
      }

      const finalState = await stateManager.loadState();
      expect(finalState).not.toBeNull();
      expect(finalState?.iteration).toBe(5);
    });

    it('should handle corrupted state file gracefully', async () => {
      const statePath = join(runDir, 'state.json');
      writeFileSync(statePath, '{"incomplete": true', 'utf-8');

      const state = await stateManager.loadState();
      expect(state).toBeNull();
    });

    it('should handle empty state file', async () => {
      const statePath = join(runDir, 'state.json');
      writeFileSync(statePath, '', 'utf-8');

      const state = await stateManager.loadState();
      expect(state).toBeNull();
    });
  });
});
