import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { AgentName } from '../../../src/types/index.js';

// Create mock event emitters for dependencies
class MockFileWatcher extends EventEmitter {}
class MockAgentMonitor extends EventEmitter {}
class MockOutputStreamer extends EventEmitter {}
class MockUsageTracker extends EventEmitter {
  getTotalUsage() {
    return {
      total_input_tokens: 1000,
      total_output_tokens: 500,
      total_cache_creation_tokens: 100,
      total_cache_read_tokens: 200,
      total_cost_usd: 0.01,
    };
  }
}
class MockRetryManager extends EventEmitter {}

const mockEventLogger = {
  log: vi.fn(),
  logRunStarted: vi.fn(),
  logAgentStarted: vi.fn(),
  logAgentCompleted: vi.fn(),
  logAgentTimeout: vi.fn(),
  logAgentFailed: vi.fn(),
  logCRPCreated: vi.fn(),
  logVCRCreated: vi.fn(),
  logMRPCreated: vi.fn(),
  logRunCompleted: vi.fn(),
  logIterationStarted: vi.fn(),
  logError: vi.fn(),
};

import { EventCoordinator, CoordinatedEvent } from '../../../src/core/event-coordinator.js';

describe('EventCoordinator', () => {
  let coordinator: EventCoordinator;
  let mockFileWatcher: MockFileWatcher;
  let mockAgentMonitor: MockAgentMonitor;
  let mockOutputStreamer: MockOutputStreamer;
  let mockUsageTracker: MockUsageTracker;
  let mockRetryManager: MockRetryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    coordinator = new EventCoordinator();
    mockFileWatcher = new MockFileWatcher();
    mockAgentMonitor = new MockAgentMonitor();
    mockOutputStreamer = new MockOutputStreamer();
    mockUsageTracker = new MockUsageTracker();
    mockRetryManager = new MockRetryManager();

    coordinator.setFileWatcher(mockFileWatcher as any);
    coordinator.setAgentMonitor(mockAgentMonitor as any);
    coordinator.setOutputStreamer(mockOutputStreamer as any);
    coordinator.setUsageTracker(mockUsageTracker as any);
    coordinator.setRetryManager(mockRetryManager as any);
    coordinator.setEventLogger(mockEventLogger as any);
    coordinator.setRunId('run-20260126000000');
  });

  afterEach(() => {
    coordinator.cleanup();
  });

  describe('setupListeners', () => {
    it('should setup all listeners', () => {
      coordinator.setupListeners();

      // Verify listeners are setup by checking if events are handled
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      // Emit a monitor event
      mockAgentMonitor.emit('monitor_event', { type: 'timeout', agent: 'builder' });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toEqual({
        type: 'agent_timeout',
        agent: 'builder',
        runId: 'run-20260126000000',
      });
    });

    it('should teardown before setup if already setup', () => {
      coordinator.setupListeners();

      // Setup again should teardown first
      coordinator.setupListeners();

      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockAgentMonitor.emit('monitor_event', { type: 'timeout', agent: 'builder' });

      // Should still work after re-setup
      expect(events.length).toBe(1);
    });
  });

  describe('teardownListeners', () => {
    it('should remove all listeners', () => {
      coordinator.setupListeners();
      coordinator.teardownListeners();

      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockAgentMonitor.emit('monitor_event', { type: 'timeout', agent: 'builder' });

      expect(events.length).toBe(0);
    });
  });

  describe('agent monitor events', () => {
    beforeEach(() => {
      coordinator.setupListeners();
    });

    it('should handle timeout event', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockAgentMonitor.emit('monitor_event', { type: 'timeout', agent: 'builder' });

      expect(events).toContainEqual({
        type: 'agent_timeout',
        agent: 'builder',
        runId: 'run-20260126000000',
      });
    });

    it('should handle stale event', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockAgentMonitor.emit('monitor_event', { type: 'stale', agent: 'refiner', inactiveMs: 60000 });

      expect(events).toContainEqual({
        type: 'agent_stale',
        agent: 'refiner',
        inactiveMs: 60000,
        runId: 'run-20260126000000',
      });
    });

    it('should call custom handler if provided', () => {
      const customHandler = vi.fn();
      coordinator.setHandlers({ onAgentMonitorEvent: customHandler });
      coordinator.setupListeners();

      mockAgentMonitor.emit('monitor_event', { type: 'timeout', agent: 'builder' });

      expect(customHandler).toHaveBeenCalledWith({ type: 'timeout', agent: 'builder' });
    });
  });

  describe('output streamer events', () => {
    beforeEach(() => {
      coordinator.setupListeners();
    });

    it('should handle output event with new content', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockOutputStreamer.emit('output', {
        agent: 'builder',
        content: 'test output',
        timestamp: new Date().toISOString(),
        isNew: true,
      });

      expect(events).toContainEqual({
        type: 'agent_output',
        agent: 'builder',
        content: 'test output',
        runId: 'run-20260126000000',
      });
    });

    it('should not emit for non-new content', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockOutputStreamer.emit('output', {
        agent: 'builder',
        content: 'test output',
        timestamp: new Date().toISOString(),
        isNew: false,
      });

      expect(events.filter(e => e.type === 'agent_output').length).toBe(0);
    });

    it('should handle output error', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockOutputStreamer.emit('error', { agent: 'builder', error: 'Test error' });

      expect(events).toContainEqual({
        type: 'error',
        error: 'Output capture error for builder: Test error',
        runId: 'run-20260126000000',
      });
    });
  });

  describe('usage tracker events', () => {
    beforeEach(() => {
      coordinator.setupListeners();
    });

    it('should handle usage update event', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockUsageTracker.emit('usage_update', {
        agent: 'builder',
        usage: {
          input_tokens: 500,
          output_tokens: 200,
          cache_creation_tokens: 50,
          cache_read_tokens: 100,
          cost_usd: 0.005,
        },
      });

      const usageEvent = events.find(e => e.type === 'usage_updated');
      expect(usageEvent).toBeDefined();
      expect(usageEvent).toMatchObject({
        type: 'usage_updated',
        agent: 'builder',
        runId: 'run-20260126000000',
      });
    });

    it('should include total usage in event', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockUsageTracker.emit('usage_update', {
        agent: 'builder',
        usage: { input_tokens: 500, output_tokens: 200, cache_creation_tokens: 50, cache_read_tokens: 100, cost_usd: 0.005 },
      });

      const usageEvent = events.find(e => e.type === 'usage_updated') as any;
      expect(usageEvent?.total?.total_input_tokens).toBe(1000);
    });
  });

  describe('retry manager events', () => {
    beforeEach(() => {
      coordinator.setupListeners();
    });

    it('should handle retry_started event', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockRetryManager.emit('retry_event', {
        type: 'retry_started',
        context: { agent: 'builder', errorType: 'crash', runId: 'run-123' },
        attempt: 1,
        maxAttempts: 3,
      });

      expect(events).toContainEqual({
        type: 'agent_retry',
        agent: 'builder',
        attempt: 1,
        maxAttempts: 3,
        runId: 'run-20260126000000',
      });
    });

    it('should handle retry_success event', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockRetryManager.emit('retry_event', {
        type: 'retry_success',
        context: { agent: 'builder', errorType: 'crash', runId: 'run-123' },
        attempt: 2,
      });

      expect(events).toContainEqual({
        type: 'agent_retry_success',
        agent: 'builder',
        attempt: 2,
        runId: 'run-20260126000000',
      });
    });

    it('should handle retry_exhausted event', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockRetryManager.emit('retry_event', {
        type: 'retry_exhausted',
        context: { agent: 'builder', errorType: 'crash', runId: 'run-123' },
        totalAttempts: 3,
      });

      expect(events).toContainEqual({
        type: 'agent_retry_exhausted',
        agent: 'builder',
        totalAttempts: 3,
        runId: 'run-20260126000000',
      });
    });
  });

  describe('file watcher events', () => {
    beforeEach(() => {
      coordinator.setupListeners();
    });

    it('should call custom handler for file watch events', async () => {
      const customHandler = vi.fn().mockResolvedValue(undefined);
      coordinator.setHandlers({ onFileWatchEvent: customHandler });
      coordinator.setupListeners();

      mockFileWatcher.emit('event', { type: 'builder_done' });

      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(customHandler).toHaveBeenCalledWith({ type: 'builder_done' });
    });

    it('should emit error event if handler throws', async () => {
      const customHandler = vi.fn().mockRejectedValue(new Error('Test error'));
      coordinator.setHandlers({ onFileWatchEvent: customHandler });
      coordinator.setupListeners();

      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockFileWatcher.emit('event', { type: 'builder_done' });

      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(events).toContainEqual({
        type: 'error',
        error: 'Test error',
        runId: 'run-20260126000000',
      });
    });
  });

  describe('emitCoordinatedEvent', () => {
    it('should emit event and log it', () => {
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      coordinator.emitCoordinatedEvent({ type: 'run_started', runId: 'run-123' });

      expect(events).toContainEqual({ type: 'run_started', runId: 'run-123' });
      expect(mockEventLogger.logRunStarted).toHaveBeenCalledWith('run-123');
    });

    it('should log different event types', () => {
      coordinator.emitCoordinatedEvent({ type: 'agent_started', agent: 'builder', runId: 'run-123' });
      expect(mockEventLogger.logAgentStarted).toHaveBeenCalledWith('builder');

      coordinator.emitCoordinatedEvent({ type: 'agent_completed', agent: 'builder', runId: 'run-123' });
      expect(mockEventLogger.logAgentCompleted).toHaveBeenCalledWith('builder');

      coordinator.emitCoordinatedEvent({ type: 'error', error: 'Test error', runId: 'run-123' });
      expect(mockEventLogger.logError).toHaveBeenCalledWith('Test error');
    });
  });

  describe('setRunId', () => {
    it('should update runId for future events', () => {
      coordinator.setupListeners();
      coordinator.setRunId('new-run-id');

      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockAgentMonitor.emit('monitor_event', { type: 'timeout', agent: 'builder' });

      expect(events[0]).toMatchObject({ runId: 'new-run-id' });
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', () => {
      coordinator.setupListeners();
      coordinator.cleanup();

      // Should not throw and events should not be processed
      const events: CoordinatedEvent[] = [];
      coordinator.on('coordinated_event', (event) => events.push(event));

      mockAgentMonitor.emit('monitor_event', { type: 'timeout', agent: 'builder' });

      expect(events.length).toBe(0);
    });
  });

  describe('setHandlers', () => {
    it('should set custom handlers', () => {
      const handlers = {
        onAgentMonitorEvent: vi.fn(),
        onOutputEvent: vi.fn(),
        onUsageUpdateEvent: vi.fn(),
        onRetryEvent: vi.fn(),
      };

      coordinator.setHandlers(handlers);
      coordinator.setupListeners();

      mockAgentMonitor.emit('monitor_event', { type: 'timeout', agent: 'builder' });
      expect(handlers.onAgentMonitorEvent).toHaveBeenCalled();

      mockOutputStreamer.emit('output', { agent: 'builder', content: 'test', timestamp: '', isNew: true });
      expect(handlers.onOutputEvent).toHaveBeenCalled();

      mockUsageTracker.emit('usage_update', { agent: 'builder', usage: {} });
      expect(handlers.onUsageUpdateEvent).toHaveBeenCalled();

      mockRetryManager.emit('retry_event', { type: 'retry_started', context: { agent: 'builder' }, attempt: 1, maxAttempts: 3 });
      expect(handlers.onRetryEvent).toHaveBeenCalled();
    });
  });
});
