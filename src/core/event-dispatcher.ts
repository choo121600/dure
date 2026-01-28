/**
 * Event dispatching for Orchestrator
 * Centralizes event emission with logging support
 */

import { EventEmitter } from 'events';
import type { Logger } from '../utils/logger.js';
import { NoOpLogger } from '../utils/logger.js';
import type { OrchestratorEvent } from './orchestrator.js';

/**
 * Options for EventDispatcher
 */
export interface EventDispatcherOptions {
  logger?: Logger;
  eventName?: string;
}

/**
 * EventDispatcher - Centralizes event emission with logging
 *
 * Features:
 * - Automatic event logging (debug level for normal events, error level for errors)
 * - Batch dispatching for multiple events
 * - Error event handling with error details
 */
export class EventDispatcher extends EventEmitter {
  private readonly logger: Logger;
  private readonly eventName: string;

  constructor(options?: EventDispatcherOptions) {
    super();
    this.logger = options?.logger ?? new NoOpLogger();
    this.eventName = options?.eventName ?? 'orchestrator_event';
  }

  /**
   * Dispatch a single event
   */
  dispatch(event: OrchestratorEvent): void {
    // Log the event
    if (event.type === 'error') {
      this.logger.error('Orchestrator error event', undefined, {
        runId: event.runId,
        error: event.error,
      });
    } else {
      this.logger.debug('Orchestrator event dispatched', {
        type: event.type,
        runId: event.runId,
      });
    }

    // Emit the event
    this.emit(this.eventName, event);
  }

  /**
   * Dispatch an error event
   */
  dispatchError(error: Error | string, runId: string): void {
    const errorMessage = error instanceof Error ? error.message : error;

    this.logger.error('Orchestrator error', error instanceof Error ? error : undefined, {
      runId,
    });

    const event: OrchestratorEvent = {
      type: 'error',
      error: errorMessage,
      runId,
    };

    this.emit(this.eventName, event);
  }

  /**
   * Dispatch multiple events in order
   */
  dispatchBatch(events: OrchestratorEvent[]): void {
    for (const event of events) {
      this.dispatch(event);
    }
  }

  /**
   * Get the event name used for emission
   */
  getEventName(): string {
    return this.eventName;
  }
}

/**
 * Create an EventDispatcher instance
 */
export function createEventDispatcher(options?: EventDispatcherOptions): EventDispatcher {
  return new EventDispatcher(options);
}
