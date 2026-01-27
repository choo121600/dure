/**
 * Unit tests for Health Check endpoints
 */
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { createHealthRouter } from '../../../src/server/routes/health.js';

// Mock TmuxManager
vi.mock('../../../src/core/tmux-manager.js', () => ({
  TmuxManager: {
    listSessions: vi.fn(() => []),
  },
}));

import { TmuxManager } from '../../../src/core/tmux-manager.js';

// Create mock orchestrator
function createMockOrchestrator(currentRunId: string | null = null) {
  return {
    getCurrentRunId: vi.fn(() => currentRunId),
    getCurrentState: vi.fn(async () => null),
    on: vi.fn(),
    emit: vi.fn(),
  };
}

describe('Health Check Routes', () => {
  let app: Express;
  let tempDir: string;
  let mockOrchestrator: ReturnType<typeof createMockOrchestrator>;

  beforeEach(() => {
    // Create temp directory for file system tests
    tempDir = join(process.cwd(), '.test-health-' + Date.now());
    mkdirSync(join(tempDir, '.orchestral'), { recursive: true });

    mockOrchestrator = createMockOrchestrator();

    app = express();
    app.use('/health', createHealthRouter(tempDir, mockOrchestrator as any, 'test-orchestral'));
  });

  afterEach(() => {
    // Cleanup temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return healthy status when all checks pass', async () => {
      (TmuxManager.listSessions as Mock).mockReturnValue([]);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.version).toBeDefined();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      expect(response.body.checks).toBeDefined();
      expect(response.body.checks.orchestrator.status).toBe('pass');
      expect(response.body.checks.tmux.status).toBe('pass');
      expect(response.body.checks.fileSystem.status).toBe('pass');
    });

    it('should return degraded status when some checks fail', async () => {
      // Make tmux check fail
      (TmuxManager.listSessions as Mock).mockImplementation(() => {
        throw new Error('tmux not found');
      });

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
      expect(response.body.checks.orchestrator.status).toBe('pass');
      expect(response.body.checks.tmux.status).toBe('fail');
      expect(response.body.checks.fileSystem.status).toBe('pass');
    });

    it('should return unhealthy status when all checks fail', async () => {
      // Make orchestrator check fail
      mockOrchestrator.getCurrentRunId.mockImplementation(() => {
        throw new Error('Orchestrator error');
      });

      // Make tmux check fail
      (TmuxManager.listSessions as Mock).mockImplementation(() => {
        throw new Error('tmux not found');
      });

      // Remove .orchestral directory to make file system check fail
      rmSync(join(tempDir, '.orchestral'), { recursive: true, force: true });

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.checks.orchestrator.status).toBe('fail');
      expect(response.body.checks.tmux.status).toBe('fail');
      expect(response.body.checks.fileSystem.status).toBe('fail');
    });

    it('should show active run ID when run is in progress', async () => {
      mockOrchestrator.getCurrentRunId.mockReturnValue('run-123');

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.checks.orchestrator.message).toContain('run-123');
    });

    it('should show active tmux sessions count', async () => {
      (TmuxManager.listSessions as Mock).mockReturnValue(['session-1', 'session-2']);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.checks.tmux.message).toContain('2');
    });

    it('should include latency for each check', async () => {
      const response = await request(app).get('/health');

      expect(response.body.checks.orchestrator.latency_ms).toBeGreaterThanOrEqual(0);
      expect(response.body.checks.tmux.latency_ms).toBeGreaterThanOrEqual(0);
      expect(response.body.checks.fileSystem.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /health/live', () => {
    it('should always return ok status', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return ok even when other checks would fail', async () => {
      // Make orchestrator check fail
      mockOrchestrator.getCurrentRunId.mockImplementation(() => {
        throw new Error('Orchestrator error');
      });

      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready when orchestrator and file system are ok', async () => {
      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
      expect(response.body.checks.orchestrator).toBe(true);
      expect(response.body.checks.fileSystem).toBe(true);
    });

    it('should return not_ready when orchestrator fails', async () => {
      mockOrchestrator.getCurrentRunId.mockImplementation(() => {
        throw new Error('Orchestrator error');
      });

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.checks.orchestrator).toBe(false);
      expect(response.body.checks.fileSystem).toBe(true);
    });

    it('should return not_ready when file system fails', async () => {
      // Remove .orchestral directory
      rmSync(join(tempDir, '.orchestral'), { recursive: true, force: true });

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.checks.orchestrator).toBe(true);
      expect(response.body.checks.fileSystem).toBe(false);
    });

    it('should not depend on tmux availability', async () => {
      // Make tmux check fail
      (TmuxManager.listSessions as Mock).mockImplementation(() => {
        throw new Error('tmux not found');
      });

      const response = await request(app).get('/health/ready');

      // Should still be ready because tmux is not required for readiness
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
    });
  });
});
