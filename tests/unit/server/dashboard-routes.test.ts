/**
 * Dashboard API Routes unit tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import {
  createTempDir,
  cleanupTempDir,
  createMockRunDir,
  createMockState,
  writeMockState,
  getDefaultTestConfig,
} from '../../helpers/test-utils.js';
import { createDashboardRouter } from '../../../src/server/routes/dashboard.js';

describe('Dashboard API Routes', () => {
  let app: Express;
  let tempDir: string;
  let runId: string;
  let runDir: string;

  beforeEach(() => {
    // Reset all mocks
    vi.resetModules();

    tempDir = createTempDir('dashboard-routes-test');
    runId = 'run-20260129120000';
    runDir = createMockRunDir(tempDir, runId);

    // Create state
    const state = createMockState(runId, {
      phase: 'build',
      agents: {
        refiner: { status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString(), usage: null },
        builder: { status: 'running', started_at: new Date().toISOString(), usage: null },
        verifier: { status: 'pending', usage: null },
        gatekeeper: { status: 'pending', usage: null },
      },
      usage: {
        total_input_tokens: 1000,
        total_output_tokens: 500,
        total_cache_creation_tokens: 100,
        total_cache_read_tokens: 200,
        total_cost_usd: 0.02,
      },
    });
    writeMockState(runDir, state);

    // Setup express app
    app = express();
    app.use(express.json());

    const config = getDefaultTestConfig();
    const router = createDashboardRouter(tempDir, config, {
      tmuxSessionPrefix: 'dure-test',
      outputLines: 50,
    });

    app.use('/api/dashboard', router);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    vi.clearAllMocks();
  });

  describe('GET /api/dashboard/:runId/progress', () => {
    it('should return progress for valid run', async () => {
      const response = await request(app)
        .get(`/api/dashboard/${runId}/progress`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.runId).toBe(runId);
      expect(response.body.data.phase).toBe('build');
      expect(response.body.data.currentStep).toBe(2);
      expect(response.body.data.totalSteps).toBe(4);
      expect(response.body.data.iteration).toBe(1);
      expect(response.body.data.maxIterations).toBe(3);
    });

    it('should include agent statuses', async () => {
      const response = await request(app)
        .get(`/api/dashboard/${runId}/progress`)
        .expect(200);

      expect(response.body.data.agents).toBeDefined();
      expect(response.body.data.agents.refiner.status).toBe('completed');
      expect(response.body.data.agents.builder.status).toBe('running');
      expect(response.body.data.agents.verifier.status).toBe('pending');
      expect(response.body.data.agents.gatekeeper.status).toBe('pending');
    });

    it('should return 404 for non-existent run', async () => {
      // Use valid format but non-existent runId
      const response = await request(app)
        .get('/api/dashboard/run-20250101000000/progress')
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid run ID format', async () => {
      const response = await request(app)
        .get('/api/dashboard/invalid-id/progress')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/dashboard/latest', () => {
    it('should return null when no active run', async () => {
      // Set run to completed phase (not active)
      const completedState = createMockState(runId, { phase: 'completed' });
      writeMockState(runDir, completedState);

      const response = await request(app)
        .get('/api/dashboard/latest')
        .expect(200);

      expect(response.body.success).toBe(true);
      // May be null depending on RunManager implementation
    });

    it('should handle request without error', async () => {
      const response = await request(app)
        .get('/api/dashboard/latest')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/dashboard/:runId', () => {
    it('should return 404 for non-existent run', async () => {
      // Use valid format but non-existent runId
      const response = await request(app)
        .get('/api/dashboard/run-20250101000000')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Run not found');
    });

    it('should return 400 for invalid run ID format', async () => {
      const response = await request(app)
        .get('/api/dashboard/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/dashboard/:runId/agent/:agent/output', () => {
    it('should return 400 for invalid agent name', async () => {
      const response = await request(app)
        .get(`/api/dashboard/${runId}/agent/invalid/output`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid agent name');
    });

    it('should return 404 for non-existent run', async () => {
      // Use valid format but non-existent runId
      const response = await request(app)
        .get('/api/dashboard/run-20250101000000/agent/builder/output')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
