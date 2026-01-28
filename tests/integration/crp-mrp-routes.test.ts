/**
 * Integration tests for CRP and MRP routes
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createCrpRouter } from '../../src/server/routes/crp.js';
import { createMrpRouter } from '../../src/server/routes/mrp.js';
import { RunManager } from '../../src/core/run-manager.js';
import {
  createTempDir,
  cleanupTempDir,
  generateTestRunId,
  getDefaultTestConfig,
  getSampleBriefing,
} from '../helpers/test-utils.js';
import type { OrchestraConfig } from '../../src/types/index.js';

// Mock Orchestrator
const mockOrchestrator = {
  resumeRun: vi.fn(),
};

describe('CRP Routes', () => {
  let app: Express;
  let tempDir: string;
  let runManager: RunManager;
  let config: OrchestraConfig;

  beforeEach(async () => {
    tempDir = createTempDir('crp-routes');
    config = getDefaultTestConfig();
    runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.dure', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.dure', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2),
      'utf-8'
    );

    app = express();
    app.use(express.json());
    app.use('/api/crp', createCrpRouter(tempDir, mockOrchestrator as any));

    vi.clearAllMocks();
    mockOrchestrator.resumeRun.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('GET /api/crp/:runId', () => {
    it('should return 404 for non-existent run', async () => {
      const response = await request(app).get('/api/crp/run-99999999999999');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return empty list when no CRPs exist', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get(`/api/crp/${runId}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('should return list of CRPs', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      // Create CRP
      const crp = {
        crp_id: 'crp-001',
        created_by: 'gatekeeper',
        created_at: new Date().toISOString(),
        question: 'Approve this change?',
        options: [
          { id: 'approve', label: 'Approve' },
          { id: 'reject', label: 'Reject' },
        ],
      };
      mkdirSync(join(runDir, 'crp'), { recursive: true });
      writeFileSync(join(runDir, 'crp', 'crp-001.json'), JSON.stringify(crp), 'utf-8');

      const response = await request(app).get(`/api/crp/${runId}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].crp_id).toBe('crp-001');
    });
  });

  describe('GET /api/crp/:runId/:crpId', () => {
    it('should return 404 for non-existent run', async () => {
      const response = await request(app).get('/api/crp/run-99999999999999/crp-001');

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent CRP', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get(`/api/crp/${runId}/crp-999`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('CRP not found');
    });

    it('should return specific CRP', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const crp = {
        crp_id: 'crp-001',
        created_by: 'gatekeeper',
        created_at: new Date().toISOString(),
        question: 'Approve this change?',
        options: [
          { id: 'approve', label: 'Approve' },
          { id: 'reject', label: 'Reject' },
        ],
      };
      mkdirSync(join(runDir, 'crp'), { recursive: true });
      writeFileSync(join(runDir, 'crp', 'crp-001.json'), JSON.stringify(crp), 'utf-8');

      const response = await request(app).get(`/api/crp/${runId}/crp-001`);

      expect(response.status).toBe(200);
      expect(response.body.data.question).toBe('Approve this change?');
    });
  });

  describe('POST /api/crp/:runId/:crpId/respond', () => {
    it('should return 404 for non-existent run', async () => {
      const response = await request(app)
        .post('/api/crp/run-99999999999999/crp-001/respond')
        .send({ decision: 'approve' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent CRP', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app)
        .post(`/api/crp/${runId}/crp-999/respond`)
        .send({ decision: 'approve' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404);
    });

    it('should create VCR for valid single-question CRP', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const crp = {
        crp_id: 'crp-001',
        created_by: 'gatekeeper',
        created_at: new Date().toISOString(),
        question: 'Approve this change?',
        options: [
          { id: 'approve', label: 'Approve' },
          { id: 'reject', label: 'Reject' },
        ],
      };
      mkdirSync(join(runDir, 'crp'), { recursive: true });
      writeFileSync(join(runDir, 'crp', 'crp-001.json'), JSON.stringify(crp), 'utf-8');

      const response = await request(app)
        .post(`/api/crp/${runId}/crp-001/respond`)
        .send({ decision: 'approve', rationale: 'Looks good' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.data.decision).toBe('approve');
      expect(mockOrchestrator.resumeRun).toHaveBeenCalledWith(runId);
    });

    it('should reject invalid decision option', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const crp = {
        crp_id: 'crp-001',
        created_by: 'gatekeeper',
        created_at: new Date().toISOString(),
        question: 'Approve this change?',
        options: [
          { id: 'approve', label: 'Approve' },
          { id: 'reject', label: 'Reject' },
        ],
      };
      mkdirSync(join(runDir, 'crp'), { recursive: true });
      writeFileSync(join(runDir, 'crp', 'crp-001.json'), JSON.stringify(crp), 'utf-8');

      const response = await request(app)
        .post(`/api/crp/${runId}/crp-001/respond`)
        .send({ decision: 'invalid' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid decision');
    });

    it('should handle multi-question CRP', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const crp = {
        crp_id: 'crp-001',
        created_by: 'gatekeeper',
        created_at: new Date().toISOString(),
        context: 'Please answer these questions',
        questions: [
          {
            id: 'q1',
            question: 'First question?',
            options: [
              { id: 'a', label: 'Option A' },
              { id: 'b', label: 'Option B' },
            ],
          },
          {
            id: 'q2',
            question: 'Second question?',
            required: false,
          },
        ],
      };
      mkdirSync(join(runDir, 'crp'), { recursive: true });
      writeFileSync(join(runDir, 'crp', 'crp-001.json'), JSON.stringify(crp), 'utf-8');

      const response = await request(app)
        .post(`/api/crp/${runId}/crp-001/respond`)
        .send({ decisions: { q1: 'a' } })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.data.decisions).toEqual({ q1: 'a' });
    });

    it('should reject multi-question CRP with invalid option', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const crp = {
        crp_id: 'crp-001',
        created_by: 'gatekeeper',
        created_at: new Date().toISOString(),
        questions: [
          {
            id: 'q1',
            question: 'First question?',
            options: [
              { id: 'a', label: 'Option A' },
              { id: 'b', label: 'Option B' },
            ],
          },
        ],
      };
      mkdirSync(join(runDir, 'crp'), { recursive: true });
      writeFileSync(join(runDir, 'crp', 'crp-001.json'), JSON.stringify(crp), 'utf-8');

      const response = await request(app)
        .post(`/api/crp/${runId}/crp-001/respond`)
        .send({ decisions: { q1: 'invalid' } })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid option');
    });

    it('should handle resume error', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      const crp = {
        crp_id: 'crp-001',
        created_by: 'gatekeeper',
        created_at: new Date().toISOString(),
        question: 'Approve?',
        options: [{ id: 'approve', label: 'Approve' }],
      };
      mkdirSync(join(runDir, 'crp'), { recursive: true });
      writeFileSync(join(runDir, 'crp', 'crp-001.json'), JSON.stringify(crp), 'utf-8');

      mockOrchestrator.resumeRun.mockRejectedValue(new Error('Resume failed'));

      const response = await request(app)
        .post(`/api/crp/${runId}/crp-001/respond`)
        .send({ decision: 'approve' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Resume failed');
    });
  });

  // Note: /api/crp/:runId/vcr route conflicts with /:runId/:crpId
  // In production this is handled by route ordering, but for testing
  // we verify the basic VCR listing through the main API routes
});

describe('MRP Routes', () => {
  let app: Express;
  let tempDir: string;
  let runManager: RunManager;

  beforeEach(async () => {
    tempDir = createTempDir('mrp-routes');
    runManager = new RunManager(tempDir);
    await runManager.initialize();

    app = express();
    app.use(express.json());
    app.use('/api/mrp', createMrpRouter(tempDir));
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('GET /api/mrp/:runId', () => {
    it('should return 404 for non-existent run', async () => {
      const response = await request(app).get('/api/mrp/run-99999999999999');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 404 when MRP does not exist', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).get(`/api/mrp/${runId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('MRP not found');
    });

    it('should return MRP summary and evidence', async () => {
      const runId = generateTestRunId();
      const runDir = await runManager.createRun(runId, getSampleBriefing(), 3);

      // Create MRP files
      mkdirSync(join(runDir, 'mrp'), { recursive: true });
      writeFileSync(join(runDir, 'mrp', 'summary.md'), '# MRP Summary', 'utf-8');
      writeFileSync(
        join(runDir, 'mrp', 'evidence.json'),
        JSON.stringify({
          tests: { total: 10, passed: 10, failed: 0 },
          files_changed: ['src/index.ts'],
          decisions: [],
          iterations: 1,
          logs: {},
        }),
        'utf-8'
      );

      const response = await request(app).get(`/api/mrp/${runId}`);

      expect(response.status).toBe(200);
      expect(response.body.data.summary).toContain('# MRP Summary');
      expect(response.body.data.evidence.tests.total).toBe(10);
    });
  });

  describe('POST /api/mrp/:runId/approve', () => {
    it('should return 404 for non-existent run', async () => {
      const response = await request(app).post('/api/mrp/run-99999999999999/approve');

      expect(response.status).toBe(404);
    });

    it('should approve MRP', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app).post(`/api/mrp/${runId}/approve`);

      expect(response.status).toBe(200);
      expect(response.body.data.approved).toBe(true);
    });
  });

  describe('POST /api/mrp/:runId/request-changes', () => {
    it('should return 404 for non-existent run', async () => {
      const response = await request(app)
        .post('/api/mrp/run-99999999999999/request-changes')
        .send({ feedback: 'Please fix X' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404);
    });

    it('should accept change request', async () => {
      const runId = generateTestRunId();
      await runManager.createRun(runId, getSampleBriefing(), 3);

      const response = await request(app)
        .post(`/api/mrp/${runId}/request-changes`)
        .send({ feedback: 'Please fix the bug' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.data.feedbackReceived).toBe(true);
    });
  });
});
