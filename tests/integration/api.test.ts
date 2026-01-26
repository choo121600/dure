/**
 * Integration tests for API routes
 */
import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createApiRouter } from '../../src/server/routes/api.js';
import { RunManager } from '../../src/core/run-manager.js';
import { StateManager } from '../../src/core/state-manager.js';
import {
  createTempDir,
  cleanupTempDir,
  generateTestRunId,
  createMockRunDir,
  createMockState,
  createMockCRP,
  createMockVerdict,
  writeMockState,
  writeMockCRP,
  writeMockVerdict,
  getDefaultTestConfig,
  getSampleBriefing,
} from '../helpers/test-utils.js';
import type { OrchestraConfig, RunState } from '../../src/types/index.js';

// Mock Orchestrator to avoid starting actual agents
const mockOrchestrator = {
  startRun: vi.fn(),
  stopRun: vi.fn(),
  resumeRun: vi.fn(),
  getCurrentState: vi.fn(),
  getCurrentRunId: vi.fn(),
  getAgentOutputs: vi.fn(),
  getAllAgentUsage: vi.fn(),
  getTotalUsage: vi.fn(),
  forceCapture: vi.fn(),
  getModelSelectionResult: vi.fn(),
  on: vi.fn(),
  emit: vi.fn(),
};

describe('API Routes', () => {
  let app: Express;
  let tempDir: string;
  let config: OrchestraConfig;
  let runManager: RunManager;

  beforeEach(async () => {
    tempDir = createTempDir('api-test');
    config = getDefaultTestConfig();
    runManager = new RunManager(tempDir);
    await runManager.initialize();

    // Initialize config directory
    mkdirSync(join(tempDir, '.orchestral', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.orchestral', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2),
      'utf-8'
    );

    app = express();
    app.use(express.json());

    // Reset mock functions
    vi.clearAllMocks();
    mockOrchestrator.startRun.mockResolvedValue('run-20260126120000');
    mockOrchestrator.stopRun.mockResolvedValue(undefined);
    mockOrchestrator.resumeRun.mockResolvedValue(undefined);
    mockOrchestrator.getCurrentState.mockReturnValue(null);
    mockOrchestrator.getAllAgentUsage.mockReturnValue(null);
    mockOrchestrator.getTotalUsage.mockReturnValue(null);

    app.use('/api', createApiRouter(tempDir, config, mockOrchestrator as any));
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('GET /api/project', () => {
    it('should return project information', async () => {
      const response = await request(app).get('/api/project');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.projectRoot).toBe(tempDir);
      expect(response.body.data.config).toBeDefined();
    });
  });

  describe('GET /api/config', () => {
    it('should return current configuration', async () => {
      const response = await request(app).get('/api/config');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.global).toBeDefined();
    });
  });

  describe('GET /api/runs', () => {
    it('should return empty array when no runs exist', async () => {
      const response = await request(app).get('/api/runs');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return list of runs', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get('/api/runs');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].run_id).toBe(runId);
    });
  });

  describe('GET /api/runs/active', () => {
    it('should return null when no active run', async () => {
      const response = await request(app).get('/api/runs/active');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
    });

    it('should return active run state', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get('/api/runs/active');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.run_id).toBe(runId);
      expect(response.body.data.phase).toBe('refine');
    });
  });

  describe('GET /api/runs/:runId', () => {
    it('should return run state for valid run ID', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get(`/api/runs/${runId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.run_id).toBe(runId);
    });

    it('should return 404 for non-existent run', async () => {
      const response = await request(app).get('/api/runs/run-99999999999999');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should return 400 for invalid run ID format', async () => {
      const response = await request(app).get('/api/runs/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid run ID format');
    });

    it('should reject path traversal attempts in run ID', async () => {
      // Test with an actual path traversal in the runId parameter itself
      const response = await request(app).get('/api/runs/..%2F..%2F..%2Fetc%2Fpasswd');

      // Should be rejected either as invalid format (400) or not found (404)
      expect([400, 404]).toContain(response.status);
    });
  });

  describe('POST /api/runs', () => {
    it('should start new run with valid briefing', async () => {
      const response = await request(app)
        .post('/api/runs')
        .send({ briefing: getSampleBriefing() })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.runId).toBeDefined();
      expect(mockOrchestrator.startRun).toHaveBeenCalledWith(getSampleBriefing());
    });

    it('should reject empty briefing', async () => {
      const response = await request(app)
        .post('/api/runs')
        .send({ briefing: '' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should reject missing briefing', async () => {
      const response = await request(app)
        .post('/api/runs')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should reject briefing exceeding max length', async () => {
      const longBriefing = 'a'.repeat(100001);

      const response = await request(app)
        .post('/api/runs')
        .send({ briefing: longBriefing })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('maximum length');
    });
  });

  describe('POST /api/runs/:runId/stop', () => {
    it('should stop the run', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).post(`/api/runs/${runId}/stop`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockOrchestrator.stopRun).toHaveBeenCalled();
    });

    it('should reject invalid run ID', async () => {
      const response = await request(app).post('/api/runs/invalid/stop');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/runs/:runId/briefing', () => {
    it('should return raw and refined briefing', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      // Create refined briefing
      writeFileSync(join(runDir, 'briefing', 'refined.md'), '# Refined', 'utf-8');

      const response = await request(app).get(`/api/runs/${runId}/briefing`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.raw).toBe(getSampleBriefing());
      expect(response.body.data.refined).toBe('# Refined');
    });
  });

  describe('GET /api/runs/:runId/crps', () => {
    it('should return empty array when no CRPs', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get(`/api/runs/${runId}/crps`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return list of CRPs', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const crp = createMockCRP('crp-001');
      writeMockCRP(runDir, crp);

      const response = await request(app).get(`/api/runs/${runId}/crps`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].crp_id).toBe('crp-001');
    });

    it('should return 404 for non-existent run', async () => {
      const response = await request(app).get('/api/runs/run-99999999999999/crps');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/runs/:runId/crp/:crpId', () => {
    it('should return specific CRP', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const crp = createMockCRP('crp-001');
      writeMockCRP(runDir, crp);

      const response = await request(app).get(`/api/runs/${runId}/crp/crp-001`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.crp_id).toBe('crp-001');
    });

    it('should return 404 for non-existent CRP', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get(`/api/runs/${runId}/crp/crp-999`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('CRP not found');
    });

    it('should reject invalid CRP ID format', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get(`/api/runs/${runId}/crp/invalid-crp`);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/runs/:runId/crp/:crpId/respond', () => {
    it('should create VCR and resume run', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const crp = createMockCRP('crp-001');
      writeMockCRP(runDir, crp);

      const response = await request(app)
        .post(`/api/runs/${runId}/crp/crp-001/respond`)
        .send({
          decision: 'A',
          rationale: 'Test rationale',
          applies_to_future: false,
        })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.vcr_id).toBe('vcr-001');
      expect(mockOrchestrator.resumeRun).toHaveBeenCalledWith(runId);

      // Verify VCR was created
      const vcrs = await runManager.listVCRs(runId);
      expect(vcrs.length).toBe(1);
      expect(vcrs[0].decision).toBe('A');
    });

    it('should reject missing decision', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const crp = createMockCRP('crp-001');
      writeMockCRP(runDir, crp);

      const response = await request(app)
        .post(`/api/runs/${runId}/crp/crp-001/respond`)
        .send({ rationale: 'Test' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    it('should return 404 for non-existent CRP', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app)
        .post(`/api/runs/${runId}/crp/crp-999/respond`)
        .send({ decision: 'A' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/runs/:runId/usage', () => {
    it('should return usage data for run', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      // Update state with usage
      const stateManager = new StateManager(runDir);
      const state = (await stateManager.loadState())!;
      state.agents.refiner.usage = {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_tokens: 100,
        cache_read_tokens: 200,
        cost_usd: 0.01,
      };
      state.usage = {
        total_input_tokens: 1000,
        total_output_tokens: 500,
        total_cache_creation_tokens: 100,
        total_cache_read_tokens: 200,
        total_cost_usd: 0.01,
      };
      await stateManager.saveState(state);

      const response = await request(app).get(`/api/runs/${runId}/usage`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.by_agent.refiner.input_tokens).toBe(1000);
      expect(response.body.data.total.total_cost_usd).toBe(0.01);
    });

    it('should return 404 for non-existent run', async () => {
      const response = await request(app).get('/api/runs/run-99999999999999/usage');

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/runs/:runId', () => {
    it('should delete completed run', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      // Mark as completed
      const stateManager = new StateManager(runDir);
      const state = (await stateManager.loadState())!;
      state.phase = 'completed';
      await stateManager.saveState(state);

      const response = await request(app).delete(`/api/runs/${runId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);
      expect(await runManager.runExists(runId)).toBe(false);
    });

    it('should return 400 when trying to delete active run', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).delete(`/api/runs/${runId}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot delete active run');
    });

    it('should return 404 for non-existent run', async () => {
      const response = await request(app).delete('/api/runs/run-99999999999999');

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/runs (clean old runs)', () => {
    it('should clean old completed runs', async () => {
      const oldRunId = 'run-20250101120000';
      const runDir = await runManager.createRun(oldRunId, getSampleBriefing(), 3);

      // Mark as completed with old timestamp
      const stateManager = new StateManager(runDir);
      const state = (await stateManager.loadState())!;
      state.phase = 'completed';
      state.started_at = '2025-01-01T12:00:00Z';
      await stateManager.saveState(state);

      const response = await request(app).delete('/api/runs?olderThan=30d');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBeGreaterThanOrEqual(0);
    });

    it('should reject invalid duration format', async () => {
      const response = await request(app).delete('/api/runs?olderThan=invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid duration format');
    });

    it('should reject missing duration parameter', async () => {
      const response = await request(app).delete('/api/runs');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /api/runs/:runId/verifier/results', () => {
    it('should return null when no results', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get(`/api/runs/${runId}/verifier/results`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
    });

    it('should return verifier results when available', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const results = {
        total: 10,
        passed: 8,
        failed: 2,
        failures: [],
        edge_cases_tested: [],
        adversarial_findings: [],
      };
      writeFileSync(join(runDir, 'verifier', 'results.json'), JSON.stringify(results), 'utf-8');

      const response = await request(app).get(`/api/runs/${runId}/verifier/results`);

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(10);
    });
  });

  describe('GET /api/runs/:runId/gatekeeper/verdict', () => {
    it('should return null when no verdict', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get(`/api/runs/${runId}/gatekeeper/verdict`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
    });

    it('should return verdict when available', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const verdict = createMockVerdict('PASS');
      writeMockVerdict(runDir, verdict);

      const response = await request(app).get(`/api/runs/${runId}/gatekeeper/verdict`);

      expect(response.status).toBe(200);
      expect(response.body.data.verdict).toBe('PASS');
    });
  });

  describe('GET /api/usage/live', () => {
    it('should return null when no active run', async () => {
      const response = await request(app).get('/api/usage/live');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
    });

    it('should return live usage when available', async () => {
      mockOrchestrator.getAllAgentUsage.mockReturnValue({
        refiner: { input_tokens: 1000, output_tokens: 500, cache_creation_tokens: 0, cache_read_tokens: 0, cost_usd: 0.01 },
        builder: null,
        verifier: null,
        gatekeeper: null,
      });
      mockOrchestrator.getTotalUsage.mockReturnValue({
        total_input_tokens: 1000,
        total_output_tokens: 500,
        total_cache_creation_tokens: 0,
        total_cache_read_tokens: 0,
        total_cost_usd: 0.01,
      });

      const response = await request(app).get('/api/usage/live');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.by_agent.refiner.input_tokens).toBe(1000);
    });
  });

  describe('GET /api/runs/:runId/models', () => {
    it('should return null when no model selection', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get(`/api/runs/${runId}/models`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
    });

    it('should return model selection when available', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const modelSelection = {
        models: {
          refiner: 'haiku',
          builder: 'sonnet',
          verifier: 'haiku',
          gatekeeper: 'sonnet',
        },
        analysis: {
          overall_score: 50,
          level: 'medium',
          factors: {
            briefing_length: 30,
            technical_depth: 50,
            scope_estimate: 40,
            risk_level: 60,
          },
          recommended_models: {
            refiner: 'haiku',
            builder: 'sonnet',
            verifier: 'haiku',
            gatekeeper: 'sonnet',
          },
          reasoning: 'Test',
        },
        selection_method: 'dynamic',
      };
      writeFileSync(join(runDir, 'model-selection.json'), JSON.stringify(modelSelection), 'utf-8');

      const response = await request(app).get(`/api/runs/${runId}/models`);

      expect(response.status).toBe(200);
      expect(response.body.data.models.builder).toBe('sonnet');
    });
  });
});
