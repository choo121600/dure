/**
 * Unit tests for RunManager
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { RunManager } from '../../../src/core/run-manager.js';
import { StateManager } from '../../../src/core/state-manager.js';
import {
  createTempDir,
  cleanupTempDir,
  generateTestRunId,
  createMockRunDir,
  createMockState,
  createMockCRP,
  createMockVCR,
  createMockVerdict,
  writeMockState,
  writeMockCRP,
  writeMockVCR,
  writeMockVerdict,
  createDoneFlag,
  getSampleBriefing,
} from '../../helpers/test-utils.js';

describe('RunManager', () => {
  let tempDir: string;
  let runManager: RunManager;

  beforeEach(() => {
    tempDir = createTempDir('run-manager-test');
    runManager = new RunManager(tempDir);
    runManager.initialize();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('generateRunId', () => {
    it('should generate a valid run ID', () => {
      const runId = runManager.generateRunId();

      expect(runId).toMatch(/^run-\d{14}$/);
    });

    it('should generate unique run IDs', async () => {
      const runId1 = runManager.generateRunId();

      // Wait 1ms to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const runId2 = runManager.generateRunId();
      // They could be the same if generated within the same second
      expect(runId1).toMatch(/^run-\d{14}$/);
      expect(runId2).toMatch(/^run-\d{14}$/);
    });
  });

  describe('createRun', () => {
    it('should create run directory structure', async () => {
      const runId = generateTestRunId();
      const briefing = getSampleBriefing();

      const runDir = await runManager.createRun(runId, briefing, 3);

      expect(existsSync(runDir)).toBe(true);
      expect(existsSync(join(runDir, 'briefing'))).toBe(true);
      expect(existsSync(join(runDir, 'builder'))).toBe(true);
      expect(existsSync(join(runDir, 'builder', 'output'))).toBe(true);
      expect(existsSync(join(runDir, 'verifier'))).toBe(true);
      expect(existsSync(join(runDir, 'verifier', 'tests'))).toBe(true);
      expect(existsSync(join(runDir, 'gatekeeper'))).toBe(true);
      expect(existsSync(join(runDir, 'crp'))).toBe(true);
      expect(existsSync(join(runDir, 'vcr'))).toBe(true);
      expect(existsSync(join(runDir, 'mrp'))).toBe(true);
      expect(existsSync(join(runDir, 'prompts'))).toBe(true);
    });

    it('should write raw briefing to file', async () => {
      const runId = generateTestRunId();
      const briefing = getSampleBriefing();

      const runDir = await runManager.createRun(runId, briefing, 3);

      const briefingPath = join(runDir, 'briefing', 'raw.md');
      expect(existsSync(briefingPath)).toBe(true);
      expect(readFileSync(briefingPath, 'utf-8')).toBe(briefing);
    });

    it('should initialize state.json', async () => {
      const runId = generateTestRunId();
      const briefing = getSampleBriefing();

      const runDir = await runManager.createRun(runId, briefing, 3);

      const statePath = join(runDir, 'state.json');
      expect(existsSync(statePath)).toBe(true);

      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      expect(state.run_id).toBe(runId);
      expect(state.phase).toBe('refine');
      expect(state.max_iterations).toBe(3);
    });

    describe('input validation', () => {
      it('should reject invalid run ID format', async () => {
        await expect(runManager.createRun('invalid-id', 'test', 3)).rejects.toThrow('Invalid run ID format');
      });

      it('should reject run ID with path traversal', async () => {
        await expect(runManager.createRun('../run-20260126120000', 'test', 3)).rejects.toThrow('Invalid run ID format');
      });

      it('should reject empty briefing', async () => {
        const runId = generateTestRunId();
        await expect(runManager.createRun(runId, '', 3)).rejects.toThrow('required');
      });

      it('should reject briefing exceeding max length', async () => {
        const runId = generateTestRunId();
        const longBriefing = 'a'.repeat(100001);
        await expect(runManager.createRun(runId, longBriefing, 3)).rejects.toThrow('maximum length');
      });

      it('should reject invalid maxIterations', async () => {
        const runId = generateTestRunId();
        const briefing = getSampleBriefing();

        await expect(runManager.createRun(runId, briefing, 0)).rejects.toThrow('between 1 and 100');
        await expect(runManager.createRun(runId, briefing, 101)).rejects.toThrow('between 1 and 100');
        await expect(runManager.createRun(runId, briefing, 2.5)).rejects.toThrow('integer');
      });
    });
  });

  describe('getRunDir', () => {
    it('should return correct run directory path', () => {
      const runId = 'run-20260126120000';
      const expected = join(tempDir, '.orchestral', 'runs', runId);

      expect(runManager.getRunDir(runId)).toBe(expected);
    });

    it('should throw for invalid run ID', () => {
      expect(() => runManager.getRunDir('invalid')).toThrow('Invalid run ID format');
    });

    it('should throw for path traversal attempt', () => {
      expect(() => runManager.getRunDir('../etc/passwd')).toThrow('Invalid run ID format');
    });
  });

  describe('runExists', () => {
    it('should return true for existing run', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      expect(await runManager.runExists(runId)).toBe(true);
    });

    it('should return false for non-existing run', async () => {
      expect(await runManager.runExists('run-99999999999999')).toBe(false);
    });

    it('should return false for invalid run ID', async () => {
      expect(await runManager.runExists('invalid')).toBe(false);
    });
  });

  describe('listRuns', () => {
    it('should return empty array when no runs exist', async () => {
      const runs = await runManager.listRuns();
      expect(runs).toEqual([]);
    });

    it('should list all runs sorted by start time descending', async () => {
      const runId1 = 'run-20260126100000';
      const runId2 = 'run-20260126120000';
      const runId3 = 'run-20260126110000';

      // Create runs with explicit timestamps to ensure correct ordering
      const runDir1 = await runManager.createRun(runId1, getSampleBriefing(), 3);
      const runDir2 = await runManager.createRun(runId2, getSampleBriefing(), 3);
      const runDir3 = await runManager.createRun(runId3, getSampleBriefing(), 3);

      // Update started_at to match run IDs for predictable sorting
      const stateManager1 = new StateManager(runDir1);
      const state1 = (await stateManager1.loadState())!;
      state1.started_at = '2026-01-26T10:00:00.000Z';
      await stateManager1.saveState(state1);

      const stateManager2 = new StateManager(runDir2);
      const state2 = (await stateManager2.loadState())!;
      state2.started_at = '2026-01-26T12:00:00.000Z';
      await stateManager2.saveState(state2);

      const stateManager3 = new StateManager(runDir3);
      const state3 = (await stateManager3.loadState())!;
      state3.started_at = '2026-01-26T11:00:00.000Z';
      await stateManager3.saveState(state3);

      const runs = await runManager.listRuns();

      expect(runs.length).toBe(3);
      // Should be sorted descending by started_at
      expect(runs[0].run_id).toBe(runId2);
      expect(runs[1].run_id).toBe(runId3);
      expect(runs[2].run_id).toBe(runId1);
    });

    it('should include run info in list items', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const runs = await runManager.listRuns();

      expect(runs[0]).toHaveProperty('run_id', runId);
      expect(runs[0]).toHaveProperty('phase', 'refine');
      expect(runs[0]).toHaveProperty('iteration', 1);
      expect(runs[0]).toHaveProperty('started_at');
      expect(runs[0]).toHaveProperty('updated_at');
    });
  });

  describe('getCurrentRun', () => {
    it('should return null when no runs exist', async () => {
      expect(await runManager.getCurrentRun()).toBeNull();
    });

    it('should return most recent run', async () => {
      await runManager.createRun('run-20260126100000', getSampleBriefing(), 3);
      await runManager.createRun('run-20260126120000', getSampleBriefing(), 3);

      const current = await runManager.getCurrentRun();
      expect(current?.run_id).toBe('run-20260126120000');
    });
  });

  describe('getActiveRun', () => {
    it('should return null when no active runs', async () => {
      expect(await runManager.getActiveRun()).toBeNull();
    });

    it('should return run that is not completed or failed', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const active = await runManager.getActiveRun();
      expect(active?.run_id).toBe(runId);
    });

    it('should skip completed runs', async () => {
      const completedRunId = 'run-20260126100000';
      const activeRunId = 'run-20260126120000';

      await runManager.createRun(completedRunId, getSampleBriefing(), 3);
      await runManager.createRun(activeRunId, getSampleBriefing(), 3);

      // Mark first run as completed
      const runDir = runManager.getRunDir(completedRunId);
      const stateManager = new StateManager(runDir);
      const state = (await stateManager.loadState())!;
      state.phase = 'completed';
      await stateManager.saveState(state);

      const active = await runManager.getActiveRun();
      expect(active?.run_id).toBe(activeRunId);
    });
  });

  describe('readRawBriefing', () => {
    it('should return briefing content', async () => {
      const runId = generateTestRunId();
      const briefing = getSampleBriefing();
      await runManager.createRun(runId, briefing, 3);

      const content = await runManager.readRawBriefing(runId);
      expect(content).toBe(briefing);
    });

    it('should return null for non-existing run', async () => {
      expect(await runManager.readRawBriefing('run-99999999999999')).toBeNull();
    });
  });

  describe('readRefinedBriefing', () => {
    it('should return null when refined.md does not exist', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      expect(await runManager.readRefinedBriefing(runId)).toBeNull();
    });

    it('should return content when refined.md exists', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const refinedContent = '# Refined Briefing';
      writeFileSync(join(runDir, 'briefing', 'refined.md'), refinedContent, 'utf-8');

      expect(await runManager.readRefinedBriefing(runId)).toBe(refinedContent);
    });
  });

  describe('CRP operations', () => {
    let runId: string;
    let runDir: string;

    beforeEach(async () => {
      runId = generateTestRunId();
      runDir = await runManager.createRun(runId, getSampleBriefing(), 3);
    });

    describe('listCRPs', () => {
      it('should return empty array when no CRPs exist', async () => {
        expect(await runManager.listCRPs(runId)).toEqual([]);
      });

      it('should list all CRPs sorted by created_at', async () => {
        const crp1 = createMockCRP('crp-001');
        crp1.created_at = '2026-01-26T10:00:00Z';
        const crp2 = createMockCRP('crp-002');
        crp2.created_at = '2026-01-26T12:00:00Z';

        writeMockCRP(runDir, crp1);
        writeMockCRP(runDir, crp2);

        const crps = await runManager.listCRPs(runId);
        expect(crps.length).toBe(2);
        expect(crps[0].crp_id).toBe('crp-001');
        expect(crps[1].crp_id).toBe('crp-002');
      });
    });

    describe('getCRP', () => {
      it('should return CRP by ID', async () => {
        const crp = createMockCRP('crp-001');
        writeMockCRP(runDir, crp);

        const retrieved = await runManager.getCRP(runId, 'crp-001');
        expect(retrieved?.crp_id).toBe('crp-001');
      });

      it('should return null for non-existing CRP', async () => {
        expect(await runManager.getCRP(runId, 'crp-999')).toBeNull();
      });

      it('should return null for invalid CRP ID format', async () => {
        expect(await runManager.getCRP(runId, 'invalid')).toBeNull();
      });
    });
  });

  describe('VCR operations', () => {
    let runId: string;
    let runDir: string;

    beforeEach(async () => {
      runId = generateTestRunId();
      runDir = await runManager.createRun(runId, getSampleBriefing(), 3);
    });

    describe('listVCRs', () => {
      it('should return empty array when no VCRs exist', async () => {
        expect(await runManager.listVCRs(runId)).toEqual([]);
      });

      it('should list all VCRs', async () => {
        const vcr1 = createMockVCR('vcr-001', 'crp-001');
        const vcr2 = createMockVCR('vcr-002', 'crp-002');

        writeMockVCR(runDir, vcr1);
        writeMockVCR(runDir, vcr2);

        const vcrs = await runManager.listVCRs(runId);
        expect(vcrs.length).toBe(2);
      });
    });

    describe('saveVCR', () => {
      it('should save VCR and update CRP status', async () => {
        const crp = createMockCRP('crp-001');
        writeMockCRP(runDir, crp);

        const vcr = createMockVCR('vcr-001', 'crp-001');
        await runManager.saveVCR(runId, vcr);

        // Check VCR was saved
        const vcrPath = join(runDir, 'vcr', 'vcr-001.json');
        expect(existsSync(vcrPath)).toBe(true);

        // Check CRP status was updated
        const updatedCrp = await runManager.getCRP(runId, 'crp-001');
        expect(updatedCrp?.status).toBe('resolved');
      });
    });
  });

  describe('readVerifierResults', () => {
    it('should return null when results do not exist', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      expect(await runManager.readVerifierResults(runId)).toBeNull();
    });

    it('should return results when they exist', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const results = {
        total: 10,
        passed: 8,
        failed: 2,
        failures: [{ test: 'test1', reason: 'failed' }],
        edge_cases_tested: ['edge1'],
        adversarial_findings: [],
      };

      writeFileSync(join(runDir, 'verifier', 'results.json'), JSON.stringify(results), 'utf-8');

      const retrieved = await runManager.readVerifierResults(runId);
      expect(retrieved?.total).toBe(10);
      expect(retrieved?.passed).toBe(8);
    });
  });

  describe('readGatekeeperVerdict', () => {
    it('should return null when verdict does not exist', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      expect(await runManager.readGatekeeperVerdict(runId)).toBeNull();
    });

    it('should return verdict when it exists', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const verdict = createMockVerdict('PASS');
      writeMockVerdict(runDir, verdict);

      const retrieved = await runManager.readGatekeeperVerdict(runId);
      expect(retrieved?.verdict).toBe('PASS');
    });
  });

  describe('hasAgentCompleted', () => {
    it('should return false when done.flag does not exist', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      expect(await runManager.hasAgentCompleted(runId, 'builder')).toBe(false);
    });

    it('should return true when done.flag exists', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      createDoneFlag(runDir, 'builder');

      expect(await runManager.hasAgentCompleted(runId, 'builder')).toBe(true);
    });
  });

  describe('deleteRun', () => {
    it('should delete existing completed run', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      // Mark as completed
      const stateManager = new StateManager(runDir);
      const state = (await stateManager.loadState())!;
      state.phase = 'completed';
      await stateManager.saveState(state);

      const result = await runManager.deleteRun(runId);
      expect(result).toBe(true);
      expect(existsSync(runDir)).toBe(false);
    });

    it('should return false for non-existing run', async () => {
      expect(await runManager.deleteRun('run-99999999999999')).toBe(false);
    });

    it('should throw for invalid run ID format', async () => {
      await expect(runManager.deleteRun('invalid')).rejects.toThrow('Invalid run ID format');
    });

    it('should throw when trying to delete active run', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      await expect(runManager.deleteRun(runId)).rejects.toThrow('Cannot delete active run');
    });
  });

  describe('cleanRuns', () => {
    it('should delete old completed runs', async () => {
      const oldRunId = 'run-20250101120000';
      const newRunId = 'run-20260126120000';

      await runManager.createRun(oldRunId, getSampleBriefing(), 3);
      await runManager.createRun(newRunId, getSampleBriefing(), 3);

      // Mark old run as completed with old timestamp
      const oldRunDir = runManager.getRunDir(oldRunId);
      const stateManager = new StateManager(oldRunDir);
      const state = (await stateManager.loadState())!;
      state.phase = 'completed';
      state.started_at = '2025-01-01T12:00:00Z';
      await stateManager.saveState(state);

      // Clean runs older than 1 year
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const result = await runManager.cleanRuns(oneYearMs);

      expect(result.count).toBe(1);
      expect(result.deleted).toContain(oldRunId);
      expect(await runManager.runExists(newRunId)).toBe(true);
    });

    it('should not delete active runs', async () => {
      const runId = 'run-20250101120000';
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      // Set old timestamp but keep as active
      const stateManager = new StateManager(runDir);
      const state = (await stateManager.loadState())!;
      state.started_at = '2025-01-01T12:00:00Z';
      await stateManager.saveState(state);

      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const result = await runManager.cleanRuns(oneYearMs);

      expect(result.count).toBe(0);
      expect(await runManager.runExists(runId)).toBe(true);
    });
  });

  describe('parseDuration', () => {
    it('should parse day durations', () => {
      expect(RunManager.parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
      expect(RunManager.parseDuration('30d')).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('should parse hour durations', () => {
      expect(RunManager.parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
    });

    it('should parse minute durations', () => {
      expect(RunManager.parseDuration('30m')).toBe(30 * 60 * 1000);
    });

    it('should parse second durations', () => {
      expect(RunManager.parseDuration('60s')).toBe(60 * 1000);
    });

    it('should throw for invalid format', () => {
      expect(() => RunManager.parseDuration('invalid')).toThrow('Invalid duration format');
      expect(() => RunManager.parseDuration('7')).toThrow('Invalid duration format');
      expect(() => RunManager.parseDuration('d7')).toThrow('Invalid duration format');
    });
  });

  describe('model selection operations', () => {
    it('should save and read model selection', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const modelSelection = {
        models: {
          refiner: 'haiku' as const,
          builder: 'sonnet' as const,
          verifier: 'haiku' as const,
          gatekeeper: 'sonnet' as const,
        },
        analysis: {
          overall_score: 45,
          level: 'medium' as const,
          factors: {
            briefing_length: 30,
            technical_depth: 50,
            scope_estimate: 40,
            risk_level: 60,
          },
          recommended_models: {
            refiner: 'haiku' as const,
            builder: 'sonnet' as const,
            verifier: 'haiku' as const,
            gatekeeper: 'sonnet' as const,
          },
          reasoning: 'Test reasoning',
        },
        selection_method: 'dynamic' as const,
      };

      await runManager.saveModelSelection(runId, modelSelection);
      const retrieved = await runManager.readModelSelection(runId);

      expect(retrieved?.models.builder).toBe('sonnet');
      expect(retrieved?.analysis.level).toBe('medium');
    });

    it('should return null when model selection does not exist', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      expect(await runManager.readModelSelection(runId)).toBeNull();
    });
  });
});
