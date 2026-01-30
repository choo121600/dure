/**
 * Mission Socket Handler - Socket.io event handler for mission kanban
 *
 * Provides real-time updates for mission kanban state changes.
 * Manages client subscriptions and broadcasts state updates.
 */
import type { Server as SocketServer, Socket } from 'socket.io';
import type { Logger } from 'pino';
import { KanbanDataProvider, KanbanEvent } from '../../core/kanban-data-provider.js';
import type { MissionId, KanbanState, KanbanUpdate } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Subscription tracking
 */
interface MissionSubscription {
  missionId: MissionId;
  provider: KanbanDataProvider;
  clients: Set<string>;
}

/**
 * Server to client events
 */
export interface MissionServerToClientEvents {
  'mission:kanban:initial': (data: KanbanState) => void;
  'mission:kanban:updated': (data: { missionId: string; data: KanbanState; timestamp: string }) => void;
  'mission:task:updated': (data: { missionId: string; data: KanbanUpdate; timestamp: string }) => void;
  'mission:phase:updated': (data: { missionId: string; data: KanbanUpdate; timestamp: string }) => void;
  'mission:error': (data: { error: string }) => void;
  'mission:subscribed': (data: { missionId: string }) => void;
  'mission:unsubscribed': (data: { missionId: string }) => void;
}

/**
 * Client to server events
 */
export interface MissionClientToServerEvents {
  'mission:subscribe': (missionId: string) => void;
  'mission:unsubscribe': (missionId: string) => void;
}

/**
 * Socket with mission subscription tracking
 */
interface MissionSocket extends Socket<MissionClientToServerEvents, MissionServerToClientEvents> {
  subscribedMissions?: Set<string>;
}

/**
 * Handler options
 */
export interface MissionSocketHandlerOptions {
  logger?: Logger;
}

// ============================================================================
// MissionSocketHandler Class
// ============================================================================

export class MissionSocketHandler {
  private io: SocketServer;
  private projectRoot: string;
  private subscriptions: Map<MissionId, MissionSubscription> = new Map();
  private logger?: Logger;

  constructor(
    io: SocketServer,
    projectRoot: string,
    options: MissionSocketHandlerOptions = {}
  ) {
    this.io = io;
    this.projectRoot = projectRoot;
    this.logger = options.logger;
    this.setupHandlers();
  }

  /**
   * Setup Socket.io event handlers
   */
  private setupHandlers(): void {
    this.io.on('connection', (socket: MissionSocket) => {
      this.logger?.debug({ socketId: socket.id }, 'Mission client connected');

      socket.subscribedMissions = new Set();

      // Handle mission subscription
      socket.on('mission:subscribe', async (missionId: string) => {
        await this.handleSubscribe(socket, missionId as MissionId);
      });

      // Handle mission unsubscription
      socket.on('mission:unsubscribe', (missionId: string) => {
        this.handleUnsubscribe(socket, missionId as MissionId);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Handle client subscription to a mission
   */
  private async handleSubscribe(socket: MissionSocket, missionId: MissionId): Promise<void> {
    let subscription = this.subscriptions.get(missionId);

    if (!subscription) {
      // Create new subscription
      const provider = new KanbanDataProvider(this.projectRoot, missionId);

      // Setup event listeners
      provider.on('state:updated', (event: KanbanEvent) => {
        this.broadcastToSubscribers(missionId, 'mission:kanban:updated', event.data as KanbanState);
      });

      provider.on('task:updated', (event: KanbanEvent) => {
        this.broadcastTaskUpdate(missionId, event.data as KanbanUpdate);
      });

      provider.on('phase:updated', (event: KanbanEvent) => {
        this.broadcastPhaseUpdate(missionId, event.data as KanbanUpdate);
      });

      provider.on('error', (event: KanbanEvent) => {
        this.broadcastError(missionId, (event.data as Error).message);
      });

      // Start watching
      const watchResult = await provider.startWatching();
      if (watchResult && 'error' in watchResult && watchResult.error) {
        socket.emit('mission:error', { error: watchResult.error.message });
        return;
      }

      subscription = {
        missionId,
        provider,
        clients: new Set(),
      };
      this.subscriptions.set(missionId, subscription);
    }

    // Add client to subscription
    subscription.clients.add(socket.id);
    socket.subscribedMissions?.add(missionId);
    socket.join(`mission:${missionId}`);

    // Send current state
    const stateResult = await subscription.provider.getState();
    if (stateResult && 'data' in stateResult && stateResult.data) {
      socket.emit('mission:kanban:initial', stateResult.data);
    }

    socket.emit('mission:subscribed', { missionId });

    this.logger?.info(
      { socketId: socket.id, missionId },
      'Client subscribed to mission'
    );
  }

  /**
   * Handle client unsubscription from a mission
   */
  private handleUnsubscribe(socket: MissionSocket, missionId: MissionId): void {
    const subscription = this.subscriptions.get(missionId);
    if (!subscription) return;

    subscription.clients.delete(socket.id);
    socket.subscribedMissions?.delete(missionId);
    socket.leave(`mission:${missionId}`);

    // Cleanup subscription if no clients left
    if (subscription.clients.size === 0) {
      subscription.provider.stopWatching();
      subscription.provider.removeAllListeners();
      this.subscriptions.delete(missionId);
    }

    socket.emit('mission:unsubscribed', { missionId });

    this.logger?.info(
      { socketId: socket.id, missionId },
      'Client unsubscribed from mission'
    );
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(socket: MissionSocket): void {
    // Unsubscribe from all missions
    if (socket.subscribedMissions) {
      for (const missionId of socket.subscribedMissions) {
        this.handleUnsubscribe(socket, missionId as MissionId);
      }
    }

    this.logger?.debug({ socketId: socket.id }, 'Mission client disconnected');
  }

  /**
   * Broadcast kanban state to subscribers
   */
  private broadcastToSubscribers(
    missionId: MissionId,
    event: 'mission:kanban:updated',
    data: KanbanState
  ): void {
    this.io.to(`mission:${missionId}`).emit(event, {
      missionId,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast task update to subscribers
   */
  private broadcastTaskUpdate(missionId: MissionId, update: KanbanUpdate): void {
    this.io.to(`mission:${missionId}`).emit('mission:task:updated', {
      missionId,
      data: update,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast phase update to subscribers
   */
  private broadcastPhaseUpdate(missionId: MissionId, update: KanbanUpdate): void {
    this.io.to(`mission:${missionId}`).emit('mission:phase:updated', {
      missionId,
      data: update,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast error to subscribers
   */
  private broadcastError(missionId: MissionId, error: string): void {
    this.io.to(`mission:${missionId}`).emit('mission:error', { error });
  }

  /**
   * Get subscriber count for a mission
   */
  getSubscriberCount(missionId: MissionId): number {
    const subscription = this.subscriptions.get(missionId);
    return subscription?.clients.size ?? 0;
  }

  /**
   * Check if a mission has subscribers
   */
  hasSubscribers(missionId: MissionId): boolean {
    return this.getSubscriberCount(missionId) > 0;
  }

  /**
   * Cleanup all subscriptions
   */
  async cleanup(): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      await subscription.provider.stopWatching();
      subscription.provider.removeAllListeners();
    }
    this.subscriptions.clear();
    this.logger?.info('Mission socket handler cleaned up');
  }
}

/**
 * Create a mission socket handler
 */
export function createMissionSocketHandler(
  io: SocketServer,
  projectRoot: string,
  options: MissionSocketHandlerOptions = {}
): MissionSocketHandler {
  return new MissionSocketHandler(io, projectRoot, options);
}
