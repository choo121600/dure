import { Server } from 'http';
import { Server as SocketServer } from 'socket.io';
import pino from 'pino';
import type { Orchestrator } from '../core/orchestrator.js';

/**
 * Options for graceful shutdown
 */
export interface ShutdownOptions {
  /** Maximum time to wait for shutdown in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Signals to handle (default: ['SIGTERM', 'SIGINT']) */
  signals?: string[];
  /** Whether to preserve tmux sessions (default: true) */
  preserveTmux?: boolean;
}

/**
 * Shutdown state tracking
 */
interface ShutdownState {
  isShuttingDown: boolean;
  startedAt: number | null;
  reason: string | null;
}

const DEFAULT_OPTIONS: Required<ShutdownOptions> = {
  timeoutMs: 30000,
  signals: ['SIGTERM', 'SIGINT'],
  preserveTmux: true,
};

/**
 * GracefulShutdown manages the orderly shutdown of the server
 *
 * Shutdown sequence:
 * 1. Stop accepting new connections
 * 2. Wait for in-flight HTTP requests to complete
 * 3. Notify WebSocket clients of shutdown
 * 4. Save current run state (if any)
 * 5. Clean up file watchers
 * 6. Optionally preserve tmux sessions
 * 7. Close server
 */
export class GracefulShutdown {
  private readonly httpServer: Server;
  private readonly socketServer: SocketServer | null;
  private readonly orchestrator: Orchestrator;
  private readonly options: Required<ShutdownOptions>;
  private readonly logger: pino.Logger;
  private readonly state: ShutdownState;
  private registeredSignals: string[] = [];

  constructor(
    httpServer: Server,
    orchestrator: Orchestrator,
    options: ShutdownOptions = {},
    socketServer?: SocketServer | null,
    logger?: pino.Logger
  ) {
    this.httpServer = httpServer;
    this.socketServer = socketServer ?? null;
    this.orchestrator = orchestrator;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger =
      logger ??
      pino({
        level: process.env.LOG_LEVEL || 'info',
      });
    this.state = {
      isShuttingDown: false,
      startedAt: null,
      reason: null,
    };
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  register(): void {
    for (const signal of this.options.signals) {
      process.on(signal, () => this.handleSignal(signal));
      this.registeredSignals.push(signal);
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error({ error }, 'Uncaught exception, initiating shutdown');
      this.shutdown('uncaughtException').finally(() => {
        process.exit(1);
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      this.logger.error({ reason }, 'Unhandled rejection, initiating shutdown');
      this.shutdown('unhandledRejection').finally(() => {
        process.exit(1);
      });
    });

    this.logger.info({ signals: this.options.signals }, 'Graceful shutdown handlers registered');
  }

  /**
   * Unregister signal handlers (useful for testing)
   */
  unregister(): void {
    for (const signal of this.registeredSignals) {
      process.removeAllListeners(signal);
    }
    this.registeredSignals = [];
  }

  /**
   * Handle incoming signal
   */
  private handleSignal(signal: string): void {
    this.logger.info({ signal }, 'Received shutdown signal');
    this.shutdown(signal).finally(() => {
      process.exit(0);
    });
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDown(): boolean {
    return this.state.isShuttingDown;
  }

  /**
   * Trigger graceful shutdown
   *
   * @param reason - Reason for shutdown (for logging)
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(reason = 'manual'): Promise<void> {
    // Prevent multiple shutdown attempts
    if (this.state.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.state.isShuttingDown = true;
    this.state.startedAt = Date.now();
    this.state.reason = reason;

    this.logger.info({ reason }, 'Starting graceful shutdown');

    // Set timeout for forced shutdown
    const forceShutdownTimer = setTimeout(() => {
      this.logger.error(
        { timeoutMs: this.options.timeoutMs },
        'Graceful shutdown timeout exceeded, forcing exit'
      );
      process.exit(1);
    }, this.options.timeoutMs);

    try {
      // Step 1: Stop accepting new connections
      this.logger.debug('Stopping new connections');
      this.httpServer.close();

      // Step 2: Notify WebSocket clients
      if (this.socketServer) {
        this.logger.debug('Notifying WebSocket clients');
        this.socketServer.emit('server_shutdown', {
          reason,
          timestamp: new Date().toISOString(),
        });

        // Give clients a moment to receive the message
        await this.delay(100);

        // Disconnect all sockets
        this.socketServer.disconnectSockets(true);
      }

      // Step 3: Save current run state if active
      const currentRunId = this.orchestrator.getCurrentRunId();
      if (currentRunId) {
        this.logger.info({ runId: currentRunId }, 'Saving interrupted run state');
        // Note: The orchestrator's cleanup will handle state preservation
        // We don't kill tmux sessions by default, so agents can continue
      }

      // Step 4: Clean up orchestrator resources
      this.logger.debug('Cleaning up orchestrator resources');
      await this.cleanupOrchestrator();

      // Step 5: Wait for existing connections to close
      await this.waitForConnectionsToClose();

      const duration = Date.now() - (this.state.startedAt ?? Date.now());
      this.logger.info({ duration }, 'Graceful shutdown complete');
    } catch (error) {
      this.logger.error({ error }, 'Error during graceful shutdown');
      throw error;
    } finally {
      clearTimeout(forceShutdownTimer);
    }
  }

  /**
   * Clean up orchestrator resources
   */
  private async cleanupOrchestrator(): Promise<void> {
    try {
      // The orchestrator has a cleanup method, but it's private
      // We can trigger stop which internally calls cleanup
      if (this.orchestrator.getCurrentRunId()) {
        await (this.orchestrator as any).stopRun?.();
      }
    } catch (error) {
      this.logger.warn({ error }, 'Error cleaning up orchestrator');
    }
  }

  /**
   * Wait for all connections to close
   */
  private waitForConnectionsToClose(): Promise<void> {
    return new Promise((resolve) => {
      // Check if server is already closed
      if (!this.httpServer.listening) {
        resolve();
        return;
      }

      // Set a shorter timeout for waiting on connections
      const connectionTimeout = Math.min(this.options.timeoutMs / 2, 10000);
      const startTime = Date.now();

      const checkConnections = () => {
        this.httpServer.getConnections((err, count) => {
          if (err) {
            this.logger.warn({ error: err }, 'Error getting connection count');
            resolve();
            return;
          }

          if (count === 0) {
            this.logger.debug('All connections closed');
            resolve();
            return;
          }

          if (Date.now() - startTime > connectionTimeout) {
            this.logger.warn({ remainingConnections: count }, 'Timeout waiting for connections to close');
            resolve();
            return;
          }

          // Check again in 100ms
          setTimeout(checkConnections, 100);
        });
      };

      checkConnections();
    });
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a GracefulShutdown instance and register handlers
 *
 * @param httpServer - HTTP server instance
 * @param orchestrator - Orchestrator instance
 * @param options - Shutdown options
 * @param socketServer - Optional Socket.io server
 * @returns GracefulShutdown instance
 */
export function setupGracefulShutdown(
  httpServer: Server,
  orchestrator: Orchestrator,
  options: ShutdownOptions = {},
  socketServer?: SocketServer
): GracefulShutdown {
  const shutdown = new GracefulShutdown(httpServer, orchestrator, options, socketServer);
  shutdown.register();
  return shutdown;
}
