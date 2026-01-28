/**
 * Security integration tests for API authentication and rate limiting
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createApiRouter } from '../../src/server/routes/api.js';
import { apiKeyAuth, loadAuthConfig, isAuthEnabled, socketAuth } from '../../src/server/middleware/auth.js';
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
  getRetryManager: vi.fn(),
  getRecoveryManager: vi.fn(),
  getSelectedModels: vi.fn(),
  on: vi.fn(),
  emit: vi.fn(),
};

describe('API Authentication', () => {
  let app: Express;
  let tempDir: string;
  let config: OrchestraConfig;
  let runManager: RunManager;

  beforeEach(async () => {
    tempDir = createTempDir('auth-test');
    config = getDefaultTestConfig();
    runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.dure', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.dure', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2),
      'utf-8'
    );

    vi.clearAllMocks();
    mockOrchestrator.startRun.mockResolvedValue('run-20260126120000');
    mockOrchestrator.getCurrentState.mockReturnValue(null);
    mockOrchestrator.getAllAgentUsage.mockReturnValue(null);
    mockOrchestrator.getTotalUsage.mockReturnValue(null);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    // Reset environment variables
    delete process.env.DURE_AUTH_ENABLED;
    delete process.env.DURE_API_KEY;
  });

  describe('when authentication is disabled', () => {
    beforeEach(() => {
      delete process.env.DURE_AUTH_ENABLED;
      delete process.env.DURE_API_KEY;

      app = express();
      app.use(express.json());
      app.use('/api', apiKeyAuth);
      app.use('/api', createApiRouter(tempDir, config, mockOrchestrator as any));
    });

    it('should allow requests without API key', async () => {
      const response = await request(app).get('/api/project');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should report authentication as disabled', () => {
      expect(isAuthEnabled()).toBe(false);
    });
  });

  describe('when authentication is enabled', () => {
    const API_KEY = 'test-secret-api-key-12345';

    beforeEach(() => {
      process.env.DURE_AUTH_ENABLED = 'true';
      process.env.DURE_API_KEY = API_KEY;

      app = express();
      app.use(express.json());
      app.use('/api', apiKeyAuth);
      app.use('/api', createApiRouter(tempDir, config, mockOrchestrator as any));
    });

    it('should reject requests without API key', async () => {
      const response = await request(app).get('/api/project');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('API key required');
    });

    it('should reject requests with invalid API key', async () => {
      const response = await request(app)
        .get('/api/project')
        .set('x-api-key', 'wrong-key');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid API key');
    });

    it('should accept requests with valid API key', async () => {
      const response = await request(app)
        .get('/api/project')
        .set('x-api-key', API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should work with all authenticated endpoints', async () => {
      // Test multiple endpoints
      const endpoints = [
        { method: 'get', path: '/api/project' },
        { method: 'get', path: '/api/config' },
        { method: 'get', path: '/api/runs' },
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method as 'get'](endpoint.path)
          .set('x-api-key', API_KEY);

        expect(response.status).toBeLessThan(400);
      }
    });

    it('should report authentication as enabled', () => {
      expect(isAuthEnabled()).toBe(true);
    });

    it('should load auth config correctly', () => {
      const authConfig = loadAuthConfig();
      expect(authConfig.enabled).toBe(true);
      expect(authConfig.apiKey).toBe(API_KEY);
    });
  });

  describe('when DURE_AUTH_ENABLED is true but no API key is set', () => {
    beforeEach(() => {
      process.env.DURE_AUTH_ENABLED = 'true';
      delete process.env.DURE_API_KEY;

      app = express();
      app.use(express.json());
      app.use('/api', apiKeyAuth);
      app.use('/api', createApiRouter(tempDir, config, mockOrchestrator as any));
    });

    it('should allow requests (auth effectively disabled)', async () => {
      const response = await request(app).get('/api/project');

      expect(response.status).toBe(200);
    });

    it('should report authentication as disabled', () => {
      expect(isAuthEnabled()).toBe(false);
    });
  });
});

describe('WebSocket Authentication', () => {
  afterEach(() => {
    delete process.env.DURE_AUTH_ENABLED;
    delete process.env.DURE_API_KEY;
  });

  describe('when authentication is disabled', () => {
    beforeEach(() => {
      delete process.env.DURE_AUTH_ENABLED;
      delete process.env.DURE_API_KEY;
    });

    it('should allow connections without token', () => {
      const mockSocket = { handshake: { auth: {} } };
      const next = vi.fn();

      socketAuth(mockSocket as any, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('when authentication is enabled', () => {
    const API_KEY = 'test-secret-key';

    beforeEach(() => {
      process.env.DURE_AUTH_ENABLED = 'true';
      process.env.DURE_API_KEY = API_KEY;
    });

    it('should reject connections without token', () => {
      const mockSocket = { handshake: { auth: {} } };
      const next = vi.fn();

      socketAuth(mockSocket as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect((next.mock.calls[0][0] as Error).message).toContain('Authentication required');
    });

    it('should reject connections with invalid token', () => {
      const mockSocket = { handshake: { auth: { token: 'wrong-token' } } };
      const next = vi.fn();

      socketAuth(mockSocket as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect((next.mock.calls[0][0] as Error).message).toContain('Invalid');
    });

    it('should accept connections with valid token', () => {
      const mockSocket = { handshake: { auth: { token: API_KEY } } };
      const next = vi.fn();

      socketAuth(mockSocket as any, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});

describe('Input Sanitization', () => {
  let app: Express;
  let tempDir: string;
  let config: OrchestraConfig;

  beforeEach(async () => {
    tempDir = createTempDir('sanitize-test');
    config = getDefaultTestConfig();
    const runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.dure', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.dure', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2),
      'utf-8'
    );

    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(tempDir, config, mockOrchestrator as any));
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('Path traversal prevention', () => {
    it('should reject run ID with path traversal attempts', async () => {
      const maliciousIds = [
        '../../../etc/passwd',
        '..%2F..%2Fetc%2Fpasswd',
        'run-20260101.....',
        'run-20260101/%00',
      ];

      for (const id of maliciousIds) {
        const response = await request(app).get(`/api/runs/${encodeURIComponent(id)}`);
        expect([400, 404]).toContain(response.status);
      }
    });

    it('should reject CRP ID with special characters', async () => {
      const runId = generateTestRunId();

      const maliciousCrpIds = [
        '../../../secret',
        'crp-001; rm -rf /',
        'crp-001\x00null',
      ];

      for (const crpId of maliciousCrpIds) {
        const response = await request(app).get(
          `/api/runs/${runId}/crp/${encodeURIComponent(crpId)}`
        );
        expect([400, 404]).toContain(response.status);
      }
    });
  });

  describe('XSS prevention', () => {
    it('should handle briefing with script tags', async () => {
      mockOrchestrator.startRun.mockResolvedValue('run-20260126120000');

      const xssBriefing = '<script>alert("xss")</script>';

      const response = await request(app)
        .post('/api/runs')
        .send({ briefing: xssBriefing })
        .set('Content-Type', 'application/json');

      // Should be accepted (sanitization happens at display, not storage)
      expect(response.status).toBe(200);
    });
  });
});
