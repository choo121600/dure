/**
 * Dashboard Socket Handler - Socket.io event handler for web dashboard
 *
 * Bridges DashboardDataProvider events to Socket.io clients.
 * Handles client subscriptions and CRP responses.
 */
import type { Server as SocketServer, Socket } from 'socket.io';
import type { DashboardDataProvider } from '../../core/dashboard-data-provider.js';
import type { DashboardData, DashboardCRP, DashboardStage, DashboardAgentStatus, AgentName } from '../../types/index.js';
import type { Logger } from 'pino';

/**
 * Events emitted from server to client
 */
export interface ServerToClientEvents {
  'dashboard:update': (data: DashboardData) => void;
  'dashboard:crp': (data: DashboardCRP) => void;
  'dashboard:stage-change': (data: { previousStage: DashboardStage; newStage: DashboardStage }) => void;
  'dashboard:agent-status-change': (data: { agent: AgentName; previousStatus: DashboardAgentStatus; newStatus: DashboardAgentStatus }) => void;
  'dashboard:error': (data: { error: string }) => void;
  'dashboard:subscribed': (data: { runId: string }) => void;
  'dashboard:unsubscribed': () => void;
}

/**
 * Events emitted from client to server
 */
export interface ClientToServerEvents {
  'dashboard:subscribe': (runId: string) => void;
  'dashboard:unsubscribe': () => void;
  'dashboard:crp-response': (response: CRPResponse) => void;
  'dashboard:request-update': () => void;
}

/**
 * CRP response from client
 */
export interface CRPResponse {
  crpId: string;
  decision: string;
  rationale?: string;
}

/**
 * Socket with room tracking
 */
interface DashboardSocket extends Socket<ClientToServerEvents, ServerToClientEvents> {
  currentRunId?: string;
}

/**
 * Handler options
 */
export interface DashboardSocketHandlerOptions {
  /** Logger instance */
  logger?: Logger;
}

/**
 * Dashboard Socket Handler class
 *
 * Manages Socket.io connections for dashboard clients, bridging
 * DashboardDataProvider events to connected clients.
 */
export class DashboardSocketHandler {
  private io: SocketServer;
  private dataProviders: Map<string, DashboardDataProvider> = new Map();
  private logger?: Logger;
  private namespace = '/dashboard';

  constructor(io: SocketServer, options: DashboardSocketHandlerOptions = {}) {
    this.io = io;
    this.logger = options.logger;
    this.setupNamespace();
  }

  /**
   * Register a DashboardDataProvider for a run
   */
  registerProvider(runId: string, provider: DashboardDataProvider): void {
    // Cleanup existing provider if any
    if (this.dataProviders.has(runId)) {
      this.unregisterProvider(runId);
    }

    this.dataProviders.set(runId, provider);
    this.setupProviderListeners(runId, provider);
    this.logger?.info({ runId }, 'Dashboard provider registered');
  }

  /**
   * Unregister a DashboardDataProvider
   */
  unregisterProvider(runId: string): void {
    const provider = this.dataProviders.get(runId);
    if (provider) {
      provider.removeAllListeners();
      provider.stopPolling();
      this.dataProviders.delete(runId);
      this.logger?.info({ runId }, 'Dashboard provider unregistered');
    }
  }

  /**
   * Get room name for a run
   */
  private getRoomName(runId: string): string {
    return `run:${runId}`;
  }

  /**
   * Setup Socket.io namespace
   */
  private setupNamespace(): void {
    const dashboardNs = this.io.of(this.namespace);

    dashboardNs.on('connection', (socket: DashboardSocket) => {
      this.logger?.info({ socketId: socket.id }, 'Dashboard client connected');

      // Handle subscription
      socket.on('dashboard:subscribe', async (runId: string) => {
        await this.handleSubscribe(socket, runId);
      });

      // Handle unsubscription
      socket.on('dashboard:unsubscribe', () => {
        this.handleUnsubscribe(socket);
      });

      // Handle CRP response
      socket.on('dashboard:crp-response', (response: CRPResponse) => {
        this.handleCRPResponse(socket, response);
      });

      // Handle manual update request
      socket.on('dashboard:request-update', async () => {
        await this.handleRequestUpdate(socket);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.logger?.info({ socketId: socket.id }, 'Dashboard client disconnected');
        this.handleUnsubscribe(socket);
      });
    });
  }

  /**
   * Handle client subscription to a run
   */
  private async handleSubscribe(socket: DashboardSocket, runId: string): Promise<void> {
    // Leave previous room if any
    if (socket.currentRunId) {
      socket.leave(this.getRoomName(socket.currentRunId));
    }

    // Join new room
    const roomName = this.getRoomName(runId);
    socket.join(roomName);
    socket.currentRunId = runId;

    this.logger?.info({ socketId: socket.id, runId }, 'Client subscribed to run');

    // Emit confirmation
    socket.emit('dashboard:subscribed', { runId });

    // Send current data if provider exists
    const provider = this.dataProviders.get(runId);
    if (provider) {
      try {
        const data = await provider.getData();
        socket.emit('dashboard:update', data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        socket.emit('dashboard:error', { error: message });
      }
    }
  }

  /**
   * Handle client unsubscription
   */
  private handleUnsubscribe(socket: DashboardSocket): void {
    if (socket.currentRunId) {
      socket.leave(this.getRoomName(socket.currentRunId));
      this.logger?.info({ socketId: socket.id, runId: socket.currentRunId }, 'Client unsubscribed from run');
      socket.currentRunId = undefined;
      socket.emit('dashboard:unsubscribed');
    }
  }

  /**
   * Handle CRP response from client
   * Note: Actual VCR creation is handled by the existing API routes
   */
  private handleCRPResponse(socket: DashboardSocket, response: CRPResponse): void {
    const runId = socket.currentRunId;
    if (!runId) {
      socket.emit('dashboard:error', { error: 'Not subscribed to any run' });
      return;
    }

    this.logger?.info({ socketId: socket.id, runId, crpId: response.crpId }, 'CRP response received');

    // Emit event for other handlers to process
    // The actual VCR creation should be done through the REST API
    this.io.of(this.namespace).to(this.getRoomName(runId)).emit('dashboard:crp', {
      agent: 'builder', // Will be updated when actual CRP data is available
      question: 'Processing response...',
      options: [],
    });
  }

  /**
   * Handle manual update request
   */
  private async handleRequestUpdate(socket: DashboardSocket): Promise<void> {
    const runId = socket.currentRunId;
    if (!runId) {
      socket.emit('dashboard:error', { error: 'Not subscribed to any run' });
      return;
    }

    const provider = this.dataProviders.get(runId);
    if (!provider) {
      socket.emit('dashboard:error', { error: 'No data provider for this run' });
      return;
    }

    try {
      const data = await provider.getData();
      socket.emit('dashboard:update', data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      socket.emit('dashboard:error', { error: message });
    }
  }

  /**
   * Setup event listeners on DashboardDataProvider
   */
  private setupProviderListeners(runId: string, provider: DashboardDataProvider): void {
    const roomName = this.getRoomName(runId);
    const dashboardNs = this.io.of(this.namespace);

    // Forward all updates to subscribed clients
    provider.on('update', (data: DashboardData) => {
      dashboardNs.to(roomName).emit('dashboard:update', data);
    });

    // Forward CRP events
    provider.on('crp', (crp: DashboardCRP) => {
      dashboardNs.to(roomName).emit('dashboard:crp', crp);
    });

    // Forward stage change events
    provider.on('stage-change', (data: { previousStage: DashboardStage; newStage: DashboardStage }) => {
      dashboardNs.to(roomName).emit('dashboard:stage-change', data);
    });

    // Forward agent status change events
    provider.on('agent-status-change', (data: { agent: AgentName; previousStatus: DashboardAgentStatus; newStatus: DashboardAgentStatus }) => {
      dashboardNs.to(roomName).emit('dashboard:agent-status-change', data);
    });

    // Forward errors
    provider.on('error', (error: Error) => {
      dashboardNs.to(roomName).emit('dashboard:error', { error: error.message });
    });

    // Start polling
    provider.startPolling();
  }

  /**
   * Get the number of connected clients for a run
   */
  async getClientCount(runId: string): Promise<number> {
    const roomName = this.getRoomName(runId);
    const sockets = await this.io.of(this.namespace).in(roomName).fetchSockets();
    return sockets.length;
  }

  /**
   * Broadcast a message to all clients subscribed to a run
   */
  broadcastUpdate(runId: string, data: DashboardData): void {
    const roomName = this.getRoomName(runId);
    this.io.of(this.namespace).to(roomName).emit('dashboard:update', data);
  }

  /**
   * Cleanup all providers and disconnect clients
   */
  destroy(): void {
    for (const [runId] of this.dataProviders) {
      this.unregisterProvider(runId);
    }
    this.io.of(this.namespace).disconnectSockets(true);
    this.logger?.info('Dashboard socket handler destroyed');
  }
}

/**
 * Create a dashboard socket handler
 */
export function createDashboardSocketHandler(
  io: SocketServer,
  options: DashboardSocketHandlerOptions = {}
): DashboardSocketHandler {
  return new DashboardSocketHandler(io, options);
}
