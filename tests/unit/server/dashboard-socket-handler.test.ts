/**
 * Dashboard Socket Handler unit tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer as createHttpServer, Server } from 'http';
import { Server as SocketServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { EventEmitter } from 'events';
import {
  DashboardSocketHandler,
  createDashboardSocketHandler,
} from '../../../src/server/dashboard/socket-handler.js';
import type { DashboardData, DashboardCRP, DashboardAgentData } from '../../../src/types/index.js';

// Utility to wait for socket event
function waitForEvent<T = any>(socket: ClientSocket, event: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// Create mock DashboardDataProvider
function createMockProvider() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    getData: vi.fn().mockResolvedValue(createMockDashboardData()),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    destroy: vi.fn(),
    isPolling: vi.fn().mockReturnValue(false),
    getPollingInterval: vi.fn().mockReturnValue(500),
  });
}

// Create mock dashboard data
function createMockDashboardData(): DashboardData {
  const emptyAgent: DashboardAgentData = {
    status: 'idle',
    output: '',
  };

  return {
    runId: 'run-20260129120000',
    stage: 'BUILD',
    agents: {
      refiner: { status: 'done', output: 'Refiner output', startedAt: new Date(), finishedAt: new Date() },
      builder: { status: 'running', output: 'Building...', startedAt: new Date() },
      verifier: { ...emptyAgent },
      gatekeeper: { ...emptyAgent },
    },
    usage: {
      totalTokens: 1500,
      cost: 0.02,
    },
    progress: {
      currentStep: 2,
      totalSteps: 4,
      retryCount: 0,
    },
  };
}

describe('DashboardSocketHandler', () => {
  let httpServer: Server;
  let io: SocketServer;
  let handler: DashboardSocketHandler;
  let clientSocket: ClientSocket;
  let port: number;

  beforeEach(async () => {
    // Create server
    httpServer = createHttpServer();
    io = new SocketServer(httpServer, {
      cors: { origin: '*' },
    });

    // Create handler
    handler = createDashboardSocketHandler(io);

    // Start server on random port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        port = typeof address === 'object' && address ? address.port : 3099;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    handler.destroy();
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  describe('Connection', () => {
    it('should connect to /dashboard namespace', async () => {
      clientSocket = ioClient(`http://localhost:${port}/dashboard`);

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      expect(clientSocket.connected).toBe(true);
    });
  });

  describe('Subscription', () => {
    beforeEach(async () => {
      clientSocket = ioClient(`http://localhost:${port}/dashboard`);
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });
    });

    it('should confirm subscription to a run', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      const confirmPromise = waitForEvent(clientSocket, 'dashboard:subscribed');

      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');

      const confirmation = await confirmPromise;
      expect(confirmation.runId).toBe('run-20260129120000');
    });

    it('should send current data on subscription', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      const updatePromise = waitForEvent(clientSocket, 'dashboard:update');

      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');

      const data = await updatePromise;
      expect(data.runId).toBe('run-20260129120000');
      expect(data.stage).toBe('BUILD');
    });

    it('should handle unsubscription', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      // Subscribe first
      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');
      await waitForEvent(clientSocket, 'dashboard:subscribed');

      // Unsubscribe
      const unsubPromise = waitForEvent(clientSocket, 'dashboard:unsubscribed');
      clientSocket.emit('dashboard:unsubscribe');

      await unsubPromise;
      // Should complete without error
    });
  });

  describe('Provider Registration', () => {
    it('should register and unregister providers', () => {
      const mockProvider = createMockProvider();

      handler.registerProvider('run-20260129120000', mockProvider as any);
      expect(mockProvider.startPolling).toHaveBeenCalled();

      handler.unregisterProvider('run-20260129120000');
      expect(mockProvider.stopPolling).toHaveBeenCalled();
    });

    it('should cleanup previous provider when registering same runId', () => {
      const provider1 = createMockProvider();
      const provider2 = createMockProvider();

      handler.registerProvider('run-20260129120000', provider1 as any);
      handler.registerProvider('run-20260129120000', provider2 as any);

      expect(provider1.stopPolling).toHaveBeenCalled();
      expect(provider2.startPolling).toHaveBeenCalled();
    });
  });

  describe('Event Forwarding', () => {
    beforeEach(async () => {
      clientSocket = ioClient(`http://localhost:${port}/dashboard`);
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });
    });

    it('should forward update events to subscribed clients', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      // Set up both listeners BEFORE subscribing to avoid race condition
      const subscribedPromise = waitForEvent(clientSocket, 'dashboard:subscribed');
      const initialUpdatePromise = waitForEvent(clientSocket, 'dashboard:update');

      // Subscribe
      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');
      await subscribedPromise;

      // Wait for initial update
      await initialUpdatePromise;

      // Use a more reliable approach: collect events during a time window
      const receivedEvents: any[] = [];
      const eventHandler = (data: any) => receivedEvents.push(data);
      clientSocket.on('dashboard:update', eventHandler);

      // Ensure listener is registered before emitting
      await new Promise(resolve => setTimeout(resolve, 100));

      // Emit update from provider
      const updatedData = createMockDashboardData();
      updatedData.stage = 'VERIFY';
      mockProvider.emit('update', updatedData);

      // Wait for event to be received
      await new Promise(resolve => setTimeout(resolve, 500));

      clientSocket.off('dashboard:update', eventHandler);

      // Find the VERIFY stage update (may have received multiple updates)
      const verifyUpdate = receivedEvents.find(e => e.stage === 'VERIFY');
      expect(verifyUpdate).toBeDefined();
      expect(verifyUpdate.stage).toBe('VERIFY');
    });

    it('should forward CRP events', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');
      await waitForEvent(clientSocket, 'dashboard:subscribed');

      const crpPromise = waitForEvent(clientSocket, 'dashboard:crp');

      const crp: DashboardCRP = {
        agent: 'gatekeeper',
        question: 'Should we proceed?',
        options: ['Yes', 'No'],
      };
      mockProvider.emit('crp', crp);

      const received = await crpPromise;
      expect(received.agent).toBe('gatekeeper');
      expect(received.question).toBe('Should we proceed?');
    });

    it('should forward stage-change events', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');
      await waitForEvent(clientSocket, 'dashboard:subscribed');

      const changePromise = waitForEvent(clientSocket, 'dashboard:stage-change');

      mockProvider.emit('stage-change', {
        previousStage: 'BUILD',
        newStage: 'VERIFY',
      });

      const received = await changePromise;
      expect(received.previousStage).toBe('BUILD');
      expect(received.newStage).toBe('VERIFY');
    });

    it('should forward agent-status-change events', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');
      await waitForEvent(clientSocket, 'dashboard:subscribed');

      const changePromise = waitForEvent(clientSocket, 'dashboard:agent-status-change');

      mockProvider.emit('agent-status-change', {
        agent: 'builder',
        previousStatus: 'running',
        newStatus: 'done',
      });

      const received = await changePromise;
      expect(received.agent).toBe('builder');
      expect(received.newStatus).toBe('done');
    });

    it('should forward error events', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');
      await waitForEvent(clientSocket, 'dashboard:subscribed');

      const errorPromise = waitForEvent(clientSocket, 'dashboard:error');

      mockProvider.emit('error', new Error('Test error'));

      const received = await errorPromise;
      expect(received.error).toBe('Test error');
    });
  });

  describe('Manual Update Request', () => {
    beforeEach(async () => {
      clientSocket = ioClient(`http://localhost:${port}/dashboard`);
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });
    });

    it('should respond to request-update when subscribed', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      // Set up both listeners BEFORE subscribing to avoid race condition
      const subscribedPromise = waitForEvent(clientSocket, 'dashboard:subscribed');
      const initialUpdatePromise = waitForEvent(clientSocket, 'dashboard:update');

      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');
      await subscribedPromise;
      await initialUpdatePromise;

      // Small delay to ensure Socket.io room is fully synchronized
      await new Promise(resolve => setTimeout(resolve, 50));

      // Clear mock calls
      mockProvider.getData.mockClear();

      const updatePromise = waitForEvent(clientSocket, 'dashboard:update');
      clientSocket.emit('dashboard:request-update');

      await updatePromise;
      expect(mockProvider.getData).toHaveBeenCalled();
    });

    it('should return error when not subscribed', async () => {
      const errorPromise = waitForEvent(clientSocket, 'dashboard:error');
      clientSocket.emit('dashboard:request-update');

      const error = await errorPromise;
      expect(error.error).toBe('Not subscribed to any run');
    });
  });

  describe('Client Count', () => {
    it('should return correct client count for a run', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      // Before subscription
      const count1 = await handler.getClientCount('run-20260129120000');
      expect(count1).toBe(0);

      // Connect and subscribe
      clientSocket = ioClient(`http://localhost:${port}/dashboard`);
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');
      await waitForEvent(clientSocket, 'dashboard:subscribed');

      // After subscription
      const count2 = await handler.getClientCount('run-20260129120000');
      expect(count2).toBe(1);
    });
  });

  describe('Broadcast', () => {
    it('should broadcast updates to subscribed clients', async () => {
      const mockProvider = createMockProvider();
      handler.registerProvider('run-20260129120000', mockProvider as any);

      clientSocket = ioClient(`http://localhost:${port}/dashboard`);
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      // Set up both listeners BEFORE subscribing to avoid race condition
      const subscribedPromise = waitForEvent(clientSocket, 'dashboard:subscribed');
      const initialUpdatePromise = waitForEvent(clientSocket, 'dashboard:update');

      clientSocket.emit('dashboard:subscribe', 'run-20260129120000');
      await subscribedPromise;
      await initialUpdatePromise;

      // Small delay to ensure Socket.io room is fully synchronized
      await new Promise(resolve => setTimeout(resolve, 50));

      const updatePromise = waitForEvent(clientSocket, 'dashboard:update');

      const newData = createMockDashboardData();
      newData.stage = 'DONE';
      handler.broadcastUpdate('run-20260129120000', newData);

      const received = await updatePromise;
      expect(received.stage).toBe('DONE');
    });
  });
});
