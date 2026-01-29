/**
 * Unit tests for DashboardDataProvider
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { DashboardDataProvider } from '../../../src/core/dashboard-data-provider.js';
import { StateManager } from '../../../src/core/state-manager.js';
import {
  createTempDir,
  cleanupTempDir,
  generateTestRunId,
  createMockRunDir,
  createMockState,
  writeMockState,
  createMockCRP,
  writeMockCRP,
  wait,
} from '../../helpers/test-utils.js';
import type { AgentName, Phase } from '../../../src/types/index.js';

/**
 * Mock TmuxManager for testing
 */
class MockTmuxManager {
  private outputs: Map<string, string> = new Map();
  private activeAgents: Set<string> = new Set();

  setOutput(agent: AgentName | 'debug' | 'server', output: string): void {
    this.outputs.set(agent, output);
  }

  setActive(agent: AgentName | 'debug' | 'server', active: boolean): void {
    if (active) {
      this.activeAgents.add(agent);
    } else {
      this.activeAgents.delete(agent);
    }
  }

  capturePane(agent: AgentName | 'debug' | 'server', _historyLines: number = 100): string {
    return this.outputs.get(agent) || '';
  }

  isPaneActive(agent: AgentName | 'debug' | 'server'): boolean {
    return this.activeAgents.has(agent);
  }

  sessionExists(): boolean {
    return true;
  }
}

describe('DashboardDataProvider', () => {
  let tempDir: string;
  let runDir: string;
  let runId: string;
  let stateManager: StateManager;
  let tmuxManager: MockTmuxManager;
  let provider: DashboardDataProvider;

  beforeEach(() => {
    tempDir = createTempDir('dashboard-data-provider-test');
    runId = generateTestRunId();
    runDir = createMockRunDir(tempDir, runId);
    stateManager = new StateManager(runDir);
    tmuxManager = new MockTmuxManager();
    provider = new DashboardDataProvider(
      tmuxManager as unknown as import('../../../src/core/tmux-manager.js').TmuxManager,
      stateManager,
      runDir,
      { pollingIntervalMs: 100 }
    );
  });

  afterEach(() => {
    provider.destroy();
    cleanupTempDir(tempDir);
  });

  describe('getData', () => {
    it('should return empty data when no state exists', async () => {
      const data = await provider.getData();

      expect(data.runId).toBe('');
      expect(data.stage).toBe('REFINE');
      expect(data.agents.refiner.status).toBe('idle');
      expect(data.agents.builder.status).toBe('idle');
      expect(data.agents.verifier.status).toBe('idle');
      expect(data.agents.gatekeeper.status).toBe('idle');
      expect(data.usage.totalTokens).toBe(0);
      expect(data.usage.cost).toBe(0);
      expect(data.progress.currentStep).toBe(0);
    });

    it('should return correct data from state', async () => {
      const state = createMockState(runId, {
        phase: 'build',
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'running', started_at: new Date().toISOString(), usage: null },
          verifier: { status: 'pending', usage: null },
          gatekeeper: { status: 'pending', usage: null },
        },
        usage: {
          total_input_tokens: 1000,
          total_output_tokens: 500,
          total_cache_creation_tokens: 0,
          total_cache_read_tokens: 0,
          total_cost_usd: 0.05,
        },
      });
      writeMockState(runDir, state);

      const data = await provider.getData();

      expect(data.runId).toBe(runId);
      expect(data.stage).toBe('BUILD');
      expect(data.agents.refiner.status).toBe('done');
      expect(data.agents.builder.status).toBe('running');
      expect(data.agents.verifier.status).toBe('idle');
      expect(data.agents.gatekeeper.status).toBe('idle');
      expect(data.usage.totalTokens).toBe(1500);
      expect(data.usage.cost).toBe(0.05);
    });

    it('should map all phases to correct dashboard stages', async () => {
      const phaseMapping: Array<{ phase: Phase; stage: string }> = [
        { phase: 'refine', stage: 'REFINE' },
        { phase: 'build', stage: 'BUILD' },
        { phase: 'verify', stage: 'VERIFY' },
        { phase: 'gate', stage: 'GATE' },
        { phase: 'waiting_human', stage: 'WAITING_HUMAN' },
        { phase: 'ready_for_merge', stage: 'DONE' },
        { phase: 'completed', stage: 'DONE' },
        { phase: 'failed', stage: 'FAILED' },
      ];

      for (const { phase, stage } of phaseMapping) {
        const state = createMockState(runId, { phase });
        writeMockState(runDir, state);
        stateManager.invalidateCache();

        const data = await provider.getData();
        expect(data.stage).toBe(stage);
      }
    });

    it('should map all agent statuses correctly', async () => {
      const statusMapping: Array<{ status: string; expected: string }> = [
        { status: 'pending', expected: 'idle' },
        { status: 'running', expected: 'running' },
        { status: 'waiting_test_execution', expected: 'running' },
        { status: 'waiting_human', expected: 'running' },
        { status: 'completed', expected: 'done' },
        { status: 'failed', expected: 'error' },
        { status: 'timeout', expected: 'error' },
      ];

      for (const { status, expected } of statusMapping) {
        const state = createMockState(runId);
        (state.agents.refiner as { status: string }).status = status;
        writeMockState(runDir, state);
        stateManager.invalidateCache();

        const data = await provider.getData();
        expect(data.agents.refiner.status).toBe(expected);
      }
    });

    it('should capture agent output from tmux', async () => {
      const state = createMockState(runId, {
        phase: 'build',
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'running', usage: null },
          verifier: { status: 'pending', usage: null },
          gatekeeper: { status: 'pending', usage: null },
        },
      });
      writeMockState(runDir, state);

      const expectedOutput = 'Building feature...\nWriting files...';
      tmuxManager.setOutput('builder', expectedOutput);

      const data = await provider.getData();

      expect(data.agents.builder.output).toBe(expectedOutput);
    });

    it('should calculate progress correctly', async () => {
      const progressMapping: Array<{ phase: Phase; expectedStep: number }> = [
        { phase: 'refine', expectedStep: 1 },
        { phase: 'build', expectedStep: 2 },
        { phase: 'verify', expectedStep: 3 },
        { phase: 'gate', expectedStep: 4 },
        { phase: 'waiting_human', expectedStep: 4 },
        { phase: 'completed', expectedStep: 4 },
      ];

      for (const { phase, expectedStep } of progressMapping) {
        const state = createMockState(runId, { phase, iteration: 2 });
        writeMockState(runDir, state);
        stateManager.invalidateCache();

        const data = await provider.getData();
        expect(data.progress.currentStep).toBe(expectedStep);
        expect(data.progress.totalSteps).toBe(4);
        expect(data.progress.retryCount).toBe(1); // iteration 2 = 1 retry
      }
    });

    it('should include agent timestamps when available', async () => {
      const startedAt = new Date('2024-01-15T10:00:00Z');
      const completedAt = new Date('2024-01-15T10:05:00Z');

      const state = createMockState(runId, {
        agents: {
          refiner: {
            status: 'completed',
            started_at: startedAt.toISOString(),
            completed_at: completedAt.toISOString(),
            usage: null,
          },
          builder: { status: 'pending', usage: null },
          verifier: { status: 'pending', usage: null },
          gatekeeper: { status: 'pending', usage: null },
        },
      });
      writeMockState(runDir, state);

      const data = await provider.getData();

      expect(data.agents.refiner.startedAt).toEqual(startedAt);
      expect(data.agents.refiner.finishedAt).toEqual(completedAt);
    });
  });

  describe('CRP handling', () => {
    it('should load CRP data when pending', async () => {
      const crp = createMockCRP('crp-001', {
        created_by: 'gatekeeper',
        question: 'Should we proceed?',
        options: [
          { id: 'yes', label: 'Yes', description: 'Continue' },
          { id: 'no', label: 'No', description: 'Stop' },
        ],
      });
      writeMockCRP(runDir, crp);

      const state = createMockState(runId, {
        pending_crp: 'crp-001',
        phase: 'waiting_human',
      });
      writeMockState(runDir, state);

      const data = await provider.getData();

      expect(data.crp).toBeDefined();
      expect(data.crp?.agent).toBe('gatekeeper');
      expect(data.crp?.question).toBe('Should we proceed?');
      expect(data.crp?.options).toEqual(['Yes', 'No']);
    });

    it('should handle multi-question CRP format', async () => {
      // Create CRP with multi-question format (no single question/options)
      const crp = createMockCRP('crp-002', {
        created_by: 'builder',
        question: undefined,
        options: undefined, // Clear default options
        questions: [
          {
            id: 'q1',
            question: 'Which approach?',
            options: [
              { id: 'a', label: 'Approach A', description: 'First option' },
              { id: 'b', label: 'Approach B', description: 'Second option' },
            ],
          },
        ],
      });
      writeMockCRP(runDir, crp);

      const state = createMockState(runId, {
        pending_crp: 'crp-002',
        phase: 'waiting_human',
      });
      writeMockState(runDir, state);

      const data = await provider.getData();

      expect(data.crp).toBeDefined();
      expect(data.crp?.question).toBe('Which approach?');
      expect(data.crp?.options).toEqual(['Approach A', 'Approach B']);
    });

    it('should handle missing CRP file gracefully', async () => {
      const state = createMockState(runId, {
        pending_crp: 'nonexistent-crp',
        phase: 'waiting_human',
      });
      writeMockState(runDir, state);

      const data = await provider.getData();

      expect(data.crp).toBeUndefined();
    });
  });

  describe('polling', () => {
    it('should start and stop polling', async () => {
      expect(provider.isPolling()).toBe(false);

      provider.startPolling(50);
      expect(provider.isPolling()).toBe(true);

      provider.stopPolling();
      expect(provider.isPolling()).toBe(false);
    });

    it('should emit update events while polling', async () => {
      const state = createMockState(runId);
      writeMockState(runDir, state);

      const updates: unknown[] = [];
      provider.on('update', (data) => updates.push(data));

      provider.startPolling(50);
      await wait(150);
      provider.stopPolling();

      expect(updates.length).toBeGreaterThanOrEqual(2);
    });

    it('should emit stage-change event when stage changes', async () => {
      const state = createMockState(runId, { phase: 'refine' });
      writeMockState(runDir, state);

      const stageChanges: unknown[] = [];
      provider.on('stage-change', (event) => stageChanges.push(event));

      provider.startPolling(50);
      await wait(100);

      // Update state to new phase
      state.phase = 'build';
      writeMockState(runDir, state);
      stateManager.invalidateCache();

      await wait(100);
      provider.stopPolling();

      expect(stageChanges.length).toBeGreaterThanOrEqual(1);
      expect(stageChanges[0]).toEqual({
        previousStage: 'REFINE',
        newStage: 'BUILD',
      });
    });

    it('should emit agent-status-change event when agent status changes', async () => {
      const state = createMockState(runId);
      writeMockState(runDir, state);

      const statusChanges: unknown[] = [];
      provider.on('agent-status-change', (event) => statusChanges.push(event));

      provider.startPolling(50);
      await wait(100);

      // Update agent status
      state.agents.refiner.status = 'running';
      writeMockState(runDir, state);
      stateManager.invalidateCache();

      await wait(100);
      provider.stopPolling();

      expect(statusChanges.length).toBeGreaterThanOrEqual(1);
      expect(statusChanges[0]).toEqual({
        agent: 'refiner',
        previousStatus: 'idle',
        newStatus: 'running',
      });
    });

    it('should emit crp event when CRP is created', async () => {
      const state = createMockState(runId);
      writeMockState(runDir, state);

      const crpEvents: unknown[] = [];
      provider.on('crp', (crp) => crpEvents.push(crp));

      provider.startPolling(50);
      await wait(100);

      // Add CRP
      const crp = createMockCRP('crp-003', { question: 'New question?' });
      writeMockCRP(runDir, crp);
      state.pending_crp = 'crp-003';
      state.phase = 'waiting_human';
      writeMockState(runDir, state);
      stateManager.invalidateCache();

      await wait(100);
      provider.stopPolling();

      expect(crpEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle errors during polling gracefully', async () => {
      const errors: unknown[] = [];
      provider.on('error', (err) => errors.push(err));

      // Write invalid JSON to cause parse error
      const statePath = join(runDir, 'state.json');
      writeFileSync(statePath, 'invalid json {{{', 'utf-8');

      provider.startPolling(50);
      await wait(100);
      provider.stopPolling();

      // Should still be able to get updates (empty data)
      const updates: unknown[] = [];
      provider.on('update', (data) => updates.push(data));
      provider.startPolling(50);
      await wait(100);
      provider.stopPolling();

      // Provider should continue functioning
      expect(provider.isPolling()).toBe(false);
    });

    it('should use custom polling interval', async () => {
      const customProvider = new DashboardDataProvider(
        tmuxManager as unknown as import('../../../src/core/tmux-manager.js').TmuxManager,
        stateManager,
        runDir,
        { pollingIntervalMs: 200 }
      );

      expect(customProvider.getPollingInterval()).toBe(200);

      customProvider.destroy();
    });
  });

  describe('destroy', () => {
    it('should stop polling and remove all listeners', async () => {
      provider.on('update', () => {});
      provider.on('stage-change', () => {});
      provider.startPolling(50);

      provider.destroy();

      expect(provider.isPolling()).toBe(false);
      expect(provider.listenerCount('update')).toBe(0);
      expect(provider.listenerCount('stage-change')).toBe(0);
    });
  });
});
