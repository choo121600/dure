/**
 * Unit tests for GracefulShutdown
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, Server } from 'http';
import { GracefulShutdown, ShutdownOptions } from '../../../src/server/shutdown.js';

// Mock orchestrator
function createMockOrchestrator(currentRunId: string | null = null) {
  return {
    getCurrentRunId: vi.fn(() => currentRunId),
    getCurrentState: vi.fn(async () => null),
    stopRun: vi.fn(async () => {}),
    on: vi.fn(),
    emit: vi.fn(),
  };
}

// Mock socket server
function createMockSocketServer() {
  return {
    emit: vi.fn(),
    disconnectSockets: vi.fn(),
  };
}

// Create a simple test server
function createTestServer(): Server {
  return createServer((req, res) => {
    res.writeHead(200);
    res.end('OK');
  });
}

describe('GracefulShutdown', () => {
  let server: Server;
  let mockOrchestrator: ReturnType<typeof createMockOrchestrator>;
  let mockSocketServer: ReturnType<typeof createMockSocketServer>;
  let gracefulShutdown: GracefulShutdown;

  beforeEach(() => {
    server = createTestServer();
    mockOrchestrator = createMockOrchestrator();
    mockSocketServer = createMockSocketServer();
  });

  afterEach(async () => {
    if (gracefulShutdown) {
      gracefulShutdown.unregister();
    }
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any);
      expect(gracefulShutdown).toBeDefined();
      expect(gracefulShutdown.isShuttingDown()).toBe(false);
    });

    it('should accept custom options', () => {
      const options: ShutdownOptions = {
        timeoutMs: 5000,
        signals: ['SIGTERM'],
        preserveTmux: false,
      };
      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any, options);
      expect(gracefulShutdown).toBeDefined();
    });
  });

  describe('register/unregister', () => {
    it('should register signal handlers', () => {
      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any);
      const registerSpy = vi.spyOn(process, 'on');

      gracefulShutdown.register();

      expect(registerSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(registerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

      registerSpy.mockRestore();
    });

    it('should unregister signal handlers', () => {
      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any);
      gracefulShutdown.register();

      const removeListenerSpy = vi.spyOn(process, 'removeAllListeners');
      gracefulShutdown.unregister();

      expect(removeListenerSpy).toHaveBeenCalledWith('SIGTERM');
      expect(removeListenerSpy).toHaveBeenCalledWith('SIGINT');

      removeListenerSpy.mockRestore();
    });
  });

  describe('shutdown', () => {
    it('should perform orderly shutdown', async () => {
      gracefulShutdown = new GracefulShutdown(
        server,
        mockOrchestrator as any,
        { timeoutMs: 5000 },
        mockSocketServer as any
      );

      // Start server first
      await new Promise<void>((resolve) => server.listen(0, resolve));

      await gracefulShutdown.shutdown('test');

      expect(gracefulShutdown.isShuttingDown()).toBe(true);
      expect(mockSocketServer.emit).toHaveBeenCalledWith(
        'server_shutdown',
        expect.objectContaining({ reason: 'test' })
      );
      expect(mockSocketServer.disconnectSockets).toHaveBeenCalledWith(true);
    });

    it('should prevent multiple shutdown attempts', async () => {
      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any);

      // Start server first
      await new Promise<void>((resolve) => server.listen(0, resolve));

      // First shutdown
      const promise1 = gracefulShutdown.shutdown('first');

      // Second shutdown attempt (should be ignored)
      const promise2 = gracefulShutdown.shutdown('second');

      await Promise.all([promise1, promise2]);

      // Should still be shutting down from first call
      expect(gracefulShutdown.isShuttingDown()).toBe(true);
    });

    it('should call orchestrator cleanup when run is active', async () => {
      mockOrchestrator.getCurrentRunId.mockReturnValue('run-123');

      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any);

      await new Promise<void>((resolve) => server.listen(0, resolve));
      await gracefulShutdown.shutdown('test');

      expect(mockOrchestrator.getCurrentRunId).toHaveBeenCalled();
    });

    it('should work without socket server', async () => {
      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any);

      await new Promise<void>((resolve) => server.listen(0, resolve));
      await gracefulShutdown.shutdown('test');

      expect(gracefulShutdown.isShuttingDown()).toBe(true);
    });

    it('should handle server that is not listening', async () => {
      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any);

      // Don't start the server
      await gracefulShutdown.shutdown('test');

      expect(gracefulShutdown.isShuttingDown()).toBe(true);
    });
  });

  describe('isShuttingDown', () => {
    it('should return false before shutdown', () => {
      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any);
      expect(gracefulShutdown.isShuttingDown()).toBe(false);
    });

    it('should return true during shutdown', async () => {
      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any);

      await new Promise<void>((resolve) => server.listen(0, resolve));

      const shutdownPromise = gracefulShutdown.shutdown('test');
      expect(gracefulShutdown.isShuttingDown()).toBe(true);

      await shutdownPromise;
    });
  });

  describe('timeout handling', () => {
    it('should respect custom timeout', async () => {
      gracefulShutdown = new GracefulShutdown(server, mockOrchestrator as any, {
        timeoutMs: 1000,
      });

      await new Promise<void>((resolve) => server.listen(0, resolve));

      const start = Date.now();
      await gracefulShutdown.shutdown('test');
      const duration = Date.now() - start;

      // Shutdown should complete quickly, not wait for full timeout
      expect(duration).toBeLessThan(500);
    });
  });
});
