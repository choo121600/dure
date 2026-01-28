/**
 * Unit tests for MRP View functionality
 * Tests the data loading and content building aspects of the MRP viewer
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RunManager } from '../../../src/core/run-manager.js';
import { TuiStateManager } from '../../../src/tui/state/tui-state.js';
import {
  createTempDir,
  cleanupTempDir,
  generateTestRunId,
  createMockRunDir,
  createMockState,
  createMockMRPEvidence,
  writeMockState,
  writeMockMRPEvidence,
  writeMockMRPSummary,
} from '../../helpers/test-utils.js';

describe('MRP View', () => {
  let tempDir: string;
  let runManager: RunManager;

  beforeEach(async () => {
    tempDir = createTempDir('mrp-view-test');
    runManager = new RunManager(tempDir);
    await runManager.initialize();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('RunManager.readMRPEvidence', () => {
    it('should read MRP evidence from evidence.json', async () => {
      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const mrpEvidence = createMockMRPEvidence(runId, 'PASS');
      writeMockMRPEvidence(runDir, mrpEvidence);

      const evidence = await runManager.readMRPEvidence(runId);

      expect(evidence).not.toBeNull();
      expect(evidence?.run_id).toBe(runId);
      expect(evidence?.verdict).toBe('PASS');
      expect(evidence?.tests.total).toBe(10);
      expect(evidence?.tests.passed).toBe(10);
      expect(evidence?.tests.failed).toBe(0);
      expect(evidence?.files_changed).toEqual(['src/index.ts', 'src/utils.ts']);
    });

    it('should return null when MRP evidence does not exist', async () => {
      const runId = generateTestRunId();
      createMockRunDir(tempDir, runId);

      const evidence = await runManager.readMRPEvidence(runId);

      expect(evidence).toBeNull();
    });

    it('should read MRP evidence with FAIL verdict', async () => {
      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const mrpEvidence = createMockMRPEvidence(runId, 'FAIL');
      writeMockMRPEvidence(runDir, mrpEvidence);

      const evidence = await runManager.readMRPEvidence(runId);

      expect(evidence?.verdict).toBe('FAIL');
      expect(evidence?.tests.failed).toBeGreaterThan(0);
      expect(evidence?.adversarial_findings?.length).toBeGreaterThan(0);
    });

    it('should read MRP evidence with NEEDS_HUMAN verdict', async () => {
      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const mrpEvidence = createMockMRPEvidence(runId, 'NEEDS_HUMAN');
      writeMockMRPEvidence(runDir, mrpEvidence);

      const evidence = await runManager.readMRPEvidence(runId);

      expect(evidence?.verdict).toBe('NEEDS_HUMAN');
    });

    it('should include usage information in MRP evidence', async () => {
      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const mrpEvidence = createMockMRPEvidence(runId, 'PASS');
      writeMockMRPEvidence(runDir, mrpEvidence);

      const evidence = await runManager.readMRPEvidence(runId);

      expect(evidence?.usage).toBeDefined();
      expect(evidence?.usage?.total.total_cost_usd).toBeGreaterThan(0);
      expect(evidence?.usage?.by_agent.refiner).toBeDefined();
      expect(evidence?.usage?.by_agent.builder).toBeDefined();
      expect(evidence?.usage?.by_agent.verifier).toBeDefined();
      expect(evidence?.usage?.by_agent.gatekeeper).toBeDefined();
    });
  });

  describe('RunManager.readMRPSummary', () => {
    it('should read MRP summary from summary.md', async () => {
      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const summaryContent = '# MRP Summary\n\nAll tests passing.';
      writeMockMRPSummary(runDir, summaryContent);

      const summary = await runManager.readMRPSummary(runId);

      expect(summary).toBe(summaryContent);
    });

    it('should return null when summary does not exist', async () => {
      const runId = generateTestRunId();
      createMockRunDir(tempDir, runId);

      const summary = await runManager.readMRPSummary(runId);

      expect(summary).toBeNull();
    });
  });

  describe('TuiStateManager.getMrp', () => {
    let tuiStateManager: TuiStateManager;

    beforeEach(() => {
      tuiStateManager = new TuiStateManager({
        projectRoot: tempDir,
      });
    });

    afterEach(async () => {
      await tuiStateManager.stop();
    });

    it('should return null when no current run', async () => {
      const mrp = await tuiStateManager.getMrp();
      expect(mrp).toBeNull();
    });

    it('should read MRP evidence for current run', async () => {
      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const state = createMockState(runId);
      writeMockState(runDir, state);
      const mrpEvidence = createMockMRPEvidence(runId, 'PASS');
      writeMockMRPEvidence(runDir, mrpEvidence);

      await tuiStateManager.setCurrentRun(runId);
      const mrp = await tuiStateManager.getMrp();

      expect(mrp).not.toBeNull();
      expect(mrp?.verdict).toBe('PASS');
    });

    it('should return null when MRP does not exist', async () => {
      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const state = createMockState(runId);
      writeMockState(runDir, state);

      await tuiStateManager.setCurrentRun(runId);
      const mrp = await tuiStateManager.getMrp();

      expect(mrp).toBeNull();
    });
  });

  describe('MRP Evidence Data Structure', () => {
    it('should have all required fields for display', async () => {
      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const mrpEvidence = createMockMRPEvidence(runId, 'PASS');
      writeMockMRPEvidence(runDir, mrpEvidence);

      const evidence = await runManager.readMRPEvidence(runId);

      // Required fields for MRP viewer display
      expect(evidence).toHaveProperty('tests');
      expect(evidence?.tests).toHaveProperty('total');
      expect(evidence?.tests).toHaveProperty('passed');
      expect(evidence?.tests).toHaveProperty('failed');
      expect(evidence).toHaveProperty('files_changed');
      expect(evidence).toHaveProperty('iterations');
      expect(evidence).toHaveProperty('verdict');
      expect(evidence).toHaveProperty('logs');
    });

    it('should support optional fields', async () => {
      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const mrpEvidence = createMockMRPEvidence(runId, 'PASS', {
        coverage_details: { 'src/index.ts': 90 },
        quality_metrics: { complexity: 'low' },
        security: { vulnerabilities: 0 },
      });
      writeMockMRPEvidence(runDir, mrpEvidence);

      const evidence = await runManager.readMRPEvidence(runId);

      expect(evidence?.coverage_details).toEqual({ 'src/index.ts': 90 });
      expect(evidence?.quality_metrics).toEqual({ complexity: 'low' });
      expect(evidence?.security).toEqual({ vulnerabilities: 0 });
    });
  });
});
