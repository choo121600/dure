/**
 * WebSocket integration tests for Socket.io events
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer as createHttpServer, Server } from 'http';
import { Server as SocketServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import express, { Express } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import {
  createTempDir,
  cleanupTempDir,
  getDefaultTestConfig,
} from '../helpers/test-utils.js';
import type { OrchestraConfig, RunState, AgentName } from '../../src/types/index.js';

// Utility to wait for socket event with timeout
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

// Utility to wait for multiple events
async function waitForEvents(
  socket: ClientSocket,
  events: string[],
  timeout = 5000
): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
  const promises = events.map(async (event) => {
    results[event] = await waitForEvent(socket, event, timeout);
  });
  await Promise.all(promises);
  return results;
}

describe('WebSocket Integration', () => {
  let app: Express;
  let httpServer: Server;
  let io: SocketServer;
  let clientSocket: ClientSocket;
  let tempDir: string;
  let config: OrchestraConfig;
  let port: number;
  let mockOrchestrator: EventEmitter & {
    getCurrentState: () => Promise<RunState | null>;
    getAgentOutputs: () => Record<AgentName, string> | null;
    getAllAgentUsage: () => null;
    getTotalUsage: () => null;
    getCurrentRunId: () => string | null;
    getModelSelectionResult: () => Promise<null>;
    forceCapture: (agent: AgentName) => string | null;
  };

  beforeEach(async () => {
    tempDir = createTempDir('websocket-test');
    config = getDefaultTestConfig();

    mkdirSync(join(tempDir, '.orchestral', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.orchestral', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2),
      'utf-8'
    );

    // Create mock orchestrator
    mockOrchestrator = Object.assign(new EventEmitter(), {
      getCurrentState: vi.fn().mockResolvedValue(null),
      getAgentOutputs: vi.fn().mockReturnValue(null),
      getAllAgentUsage: vi.fn().mockReturnValue(null),
      getTotalUsage: vi.fn().mockReturnValue(null),
      getCurrentRunId: vi.fn().mockReturnValue(null),
      getModelSelectionResult: vi.fn().mockResolvedValue(null),
      forceCapture: vi.fn().mockReturnValue(null),
    });

    // Create server
    app = express();
    httpServer = createHttpServer(app);
    io = new SocketServer(httpServer, {
      cors: { origin: '*' },
    });

    // Setup connection handler similar to actual server
    io.on('connection', async (socket) => {
      // Send current state on connection
      const currentState = await mockOrchestrator.getCurrentState();
      if (currentState) {
        socket.emit('state_update', currentState);
      }

      // Send current agent outputs
      const outputs = mockOrchestrator.getAgentOutputs();
      if (outputs) {
        socket.emit('agent_outputs_initial', outputs);
      }

      // Send current usage
      const allUsage = mockOrchestrator.getAllAgentUsage();
      const totalUsage = mockOrchestrator.getTotalUsage();
      if (allUsage && totalUsage) {
        socket.emit('usage_initial', { by_agent: allUsage, total: totalUsage });
      }

      // Handle agent output requests
      socket.on('request_agent_output', (agent: string) => {
        const validAgents = ['refiner', 'builder', 'verifier', 'gatekeeper'];
        if (validAgents.includes(agent)) {
          const output = mockOrchestrator.forceCapture(agent as AgentName);
          socket.emit('agent_output_response', { agent, content: output || '' });
        }
      });
    });

    // Forward orchestrator events to clients
    mockOrchestrator.on('orchestrator_event', (event) => {
      io.emit('orchestrator_event', event);

      if (event.type === 'agent_output') {
        io.emit('agent_output', {
          agent: event.agent,
          content: event.content,
          runId: event.runId,
          timestamp: new Date().toISOString(),
        });
      }
    });

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
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });
    cleanupTempDir(tempDir);
  });

  describe('Connection', () => {
    it('should connect successfully', async () => {
      clientSocket = ioClient(`http://localhost:${port}`);

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      expect(clientSocket.connected).toBe(true);
    });

    it('should emit current state on connection when run is active', async () => {
      const mockState: RunState = {
        run_id: 'run-20260127120000',
        phase: 'build',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'running', usage: null },
          verifier: { status: 'pending', usage: null },
          gatekeeper: { status: 'pending', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };

      (mockOrchestrator.getCurrentState as any).mockResolvedValue(mockState);

      clientSocket = ioClient(`http://localhost:${port}`);

      const stateUpdate = await waitForEvent(clientSocket, 'state_update');

      expect(stateUpdate.run_id).toBe('run-20260127120000');
      expect(stateUpdate.phase).toBe('build');
    });

    it('should emit initial agent outputs on connection', async () => {
      const mockOutputs = {
        refiner: 'Refiner output...',
        builder: 'Builder output...',
        verifier: '',
        gatekeeper: '',
      };

      (mockOrchestrator.getAgentOutputs as any).mockReturnValue(mockOutputs);

      clientSocket = ioClient(`http://localhost:${port}`);

      const outputs = await waitForEvent(clientSocket, 'agent_outputs_initial');

      expect(outputs.refiner).toBe('Refiner output...');
      expect(outputs.builder).toBe('Builder output...');
    });

    it('should emit initial usage data on connection', async () => {
      const mockUsage = {
        refiner: { input_tokens: 1000, output_tokens: 500, cache_creation_tokens: 0, cache_read_tokens: 0, cost_usd: 0.01 },
        builder: null,
        verifier: null,
        gatekeeper: null,
      };
      const mockTotal = {
        total_input_tokens: 1000,
        total_output_tokens: 500,
        total_cache_creation_tokens: 0,
        total_cache_read_tokens: 0,
        total_cost_usd: 0.01,
      };

      (mockOrchestrator.getAllAgentUsage as any).mockReturnValue(mockUsage);
      (mockOrchestrator.getTotalUsage as any).mockReturnValue(mockTotal);

      clientSocket = ioClient(`http://localhost:${port}`);

      const usage = await waitForEvent(clientSocket, 'usage_initial');

      expect(usage.by_agent.refiner.input_tokens).toBe(1000);
      expect(usage.total.total_cost_usd).toBe(0.01);
    });
  });

  describe('Event Broadcasting', () => {
    beforeEach(async () => {
      clientSocket = ioClient(`http://localhost:${port}`);
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });
    });

    it('should broadcast orchestrator_event to clients', async () => {
      const event = {
        type: 'run_started',
        runId: 'run-20260127120000',
      };

      const eventPromise = waitForEvent(clientSocket, 'orchestrator_event');

      mockOrchestrator.emit('orchestrator_event', event);

      const received = await eventPromise;
      expect(received.type).toBe('run_started');
      expect(received.runId).toBe('run-20260127120000');
    });

    it('should broadcast agent_output event separately', async () => {
      const event = {
        type: 'agent_output',
        agent: 'builder',
        content: 'Building code...',
        runId: 'run-20260127120000',
      };

      const agentOutputPromise = waitForEvent(clientSocket, 'agent_output');

      mockOrchestrator.emit('orchestrator_event', event);

      const received = await agentOutputPromise;
      expect(received.agent).toBe('builder');
      expect(received.content).toBe('Building code...');
      expect(received.timestamp).toBeDefined();
    });

    it('should broadcast phase_changed event', async () => {
      const event = {
        type: 'phase_changed',
        phase: 'verify',
        runId: 'run-20260127120000',
      };

      const eventPromise = waitForEvent(clientSocket, 'orchestrator_event');

      mockOrchestrator.emit('orchestrator_event', event);

      const received = await eventPromise;
      expect(received.type).toBe('phase_changed');
      expect(received.phase).toBe('verify');
    });

    it('should broadcast crp_created event', async () => {
      const event = {
        type: 'crp_created',
        crpId: 'crp-001',
        runId: 'run-20260127120000',
      };

      const eventPromise = waitForEvent(clientSocket, 'orchestrator_event');

      mockOrchestrator.emit('orchestrator_event', event);

      const received = await eventPromise;
      expect(received.type).toBe('crp_created');
      expect(received.crpId).toBe('crp-001');
    });

    it('should broadcast run_completed event', async () => {
      const event = {
        type: 'run_completed',
        runId: 'run-20260127120000',
        verdict: 'PASS',
      };

      const eventPromise = waitForEvent(clientSocket, 'orchestrator_event');

      mockOrchestrator.emit('orchestrator_event', event);

      const received = await eventPromise;
      expect(received.type).toBe('run_completed');
      expect(received.verdict).toBe('PASS');
    });
  });

  describe('Client Requests', () => {
    beforeEach(async () => {
      clientSocket = ioClient(`http://localhost:${port}`);
      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });
    });

    it('should respond to request_agent_output', async () => {
      (mockOrchestrator.forceCapture as any).mockReturnValue('Captured output');

      const responsePromise = waitForEvent(clientSocket, 'agent_output_response');

      clientSocket.emit('request_agent_output', 'refiner');

      const response = await responsePromise;
      expect(response.agent).toBe('refiner');
      expect(response.content).toBe('Captured output');
    });

    it('should handle request for invalid agent', async () => {
      // Should not emit response for invalid agent
      const timeoutPromise = waitForEvent(clientSocket, 'agent_output_response', 100)
        .then(() => 'received')
        .catch(() => 'timeout');

      clientSocket.emit('request_agent_output', 'invalid-agent');

      const result = await timeoutPromise;
      expect(result).toBe('timeout');
    });
  });

  describe('Multiple Clients', () => {
    let clientSocket2: ClientSocket;

    afterEach(() => {
      if (clientSocket2?.connected) {
        clientSocket2.disconnect();
      }
    });

    it('should broadcast events to all connected clients', async () => {
      clientSocket = ioClient(`http://localhost:${port}`);
      clientSocket2 = ioClient(`http://localhost:${port}`);

      await Promise.all([
        new Promise<void>((resolve) => clientSocket.on('connect', resolve)),
        new Promise<void>((resolve) => clientSocket2.on('connect', resolve)),
      ]);

      const event = {
        type: 'agent_started',
        agent: 'builder',
        runId: 'run-20260127120000',
      };

      const promise1 = waitForEvent(clientSocket, 'orchestrator_event');
      const promise2 = waitForEvent(clientSocket2, 'orchestrator_event');

      mockOrchestrator.emit('orchestrator_event', event);

      const [received1, received2] = await Promise.all([promise1, promise2]);

      expect(received1.type).toBe('agent_started');
      expect(received2.type).toBe('agent_started');
    });
  });

  describe('Disconnection', () => {
    it('should handle client disconnection gracefully', async () => {
      clientSocket = ioClient(`http://localhost:${port}`);

      await new Promise<void>((resolve) => {
        clientSocket.on('connect', resolve);
      });

      expect(clientSocket.connected).toBe(true);

      // Use disconnect and wait a bit for it to complete
      clientSocket.disconnect();

      // Wait for disconnect to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(clientSocket.connected).toBe(false);
    });

    it('should continue broadcasting after client disconnects', async () => {
      let clientSocket2: ClientSocket;

      clientSocket = ioClient(`http://localhost:${port}`);
      clientSocket2 = ioClient(`http://localhost:${port}`);

      await Promise.all([
        new Promise<void>((resolve) => clientSocket.on('connect', resolve)),
        new Promise<void>((resolve) => clientSocket2.on('connect', resolve)),
      ]);

      // Disconnect first client
      clientSocket.disconnect();

      // Wait for disconnect to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second client should still receive events
      const eventPromise = waitForEvent(clientSocket2, 'orchestrator_event');

      mockOrchestrator.emit('orchestrator_event', {
        type: 'run_started',
        runId: 'run-20260127120000',
      });

      const received = await eventPromise;
      expect(received.type).toBe('run_started');

      clientSocket2.disconnect();
    });
  });
});
