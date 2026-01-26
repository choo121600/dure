import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryManager, RetryConfig, RetryContext, RetryEvent, defaultRetryConfig } from '../../../src/core/retry-manager.js';

describe('RetryManager', () => {
  let retryManager: RetryManager;

  beforeEach(() => {
    retryManager = new RetryManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    retryManager.resetAll();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const manager = new RetryManager();
      const config = manager.getConfig();
      expect(config.maxAttempts).toBe(defaultRetryConfig.maxAttempts);
      expect(config.baseDelayMs).toBe(defaultRetryConfig.baseDelayMs);
      expect(config.backoffMultiplier).toBe(defaultRetryConfig.backoffMultiplier);
    });

    it('should merge provided config with defaults', () => {
      const manager = new RetryManager({ maxAttempts: 5 });
      const config = manager.getConfig();
      expect(config.maxAttempts).toBe(5);
      expect(config.baseDelayMs).toBe(defaultRetryConfig.baseDelayMs);
    });
  });

  describe('shouldRetry', () => {
    it('should return true for recoverable error with remaining attempts', () => {
      expect(retryManager.shouldRetry('crash', 0)).toBe(true);
      expect(retryManager.shouldRetry('timeout', 1)).toBe(true);
      expect(retryManager.shouldRetry('validation', 1)).toBe(true);
    });

    it('should return false for non-recoverable error types', () => {
      expect(retryManager.shouldRetry('permission', 0)).toBe(false);
      expect(retryManager.shouldRetry('resource', 0)).toBe(false);
      expect(retryManager.shouldRetry('unknown', 0)).toBe(false);
    });

    it('should return false when max attempts reached', () => {
      expect(retryManager.shouldRetry('crash', 2)).toBe(false);
      expect(retryManager.shouldRetry('timeout', 2)).toBe(false);
    });
  });

  describe('isRecoverableError', () => {
    it('should return true for recoverable error types', () => {
      expect(retryManager.isRecoverableError('crash')).toBe(true);
      expect(retryManager.isRecoverableError('timeout')).toBe(true);
      expect(retryManager.isRecoverableError('validation')).toBe(true);
    });

    it('should return false for non-recoverable error types', () => {
      expect(retryManager.isRecoverableError('permission')).toBe(false);
      expect(retryManager.isRecoverableError('resource')).toBe(false);
      expect(retryManager.isRecoverableError('other')).toBe(false);
    });
  });

  describe('getDelay', () => {
    it('should return base delay for first attempt', () => {
      const delay = retryManager.getDelay(1);
      // With jitter, should be within 10% of base delay
      expect(delay).toBeGreaterThanOrEqual(defaultRetryConfig.baseDelayMs * 0.9);
      expect(delay).toBeLessThanOrEqual(defaultRetryConfig.baseDelayMs * 1.1);
    });

    it('should increase delay exponentially', () => {
      const manager = new RetryManager({
        baseDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 100000,
      });

      // Mock random to remove jitter for predictable testing
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Results in no jitter

      const delay1 = manager.getDelay(1);
      const delay2 = manager.getDelay(2);
      const delay3 = manager.getDelay(3);

      // delay2 should be ~2x delay1, delay3 should be ~4x delay1
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should not exceed maxDelay', () => {
      const manager = new RetryManager({
        baseDelayMs: 10000,
        backoffMultiplier: 3,
        maxDelayMs: 15000,
      });

      const delay = manager.getDelay(10);
      expect(delay).toBeLessThanOrEqual(15000);
    });
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt if operation succeeds', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const context: RetryContext = {
        agent: 'builder',
        errorType: 'crash',
        runId: 'run-123',
      };

      const events: RetryEvent[] = [];
      retryManager.on('retry_event', (event) => events.push(event));

      const result = await retryManager.executeWithRetry(operation, context);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(2); // retry_started, retry_success
      expect(events[0].type).toBe('retry_started');
      expect(events[1].type).toBe('retry_success');
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValue('success');

      const context: RetryContext = {
        agent: 'builder',
        errorType: 'crash',
        runId: 'run-123',
      };

      const events: RetryEvent[] = [];
      retryManager.on('retry_event', (event) => events.push(event));

      // Start the retry operation
      const promise = retryManager.executeWithRetry(operation, context);

      // Wait for first attempt to fail and delay to start
      await vi.advanceTimersByTimeAsync(0);

      // Advance past the delay
      await vi.advanceTimersByTimeAsync(defaultRetryConfig.baseDelayMs * 2);

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should exhaust retries and throw on persistent failure', async () => {
      // Use real timers for this test to avoid async issues
      vi.useRealTimers();

      // Create a manager with very short delays for testing
      const fastManager = new RetryManager({
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 50,
        backoffMultiplier: 2,
        recoverableErrors: ['crash', 'timeout', 'validation'],
      });

      const operation = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      const context: RetryContext = {
        agent: 'builder',
        errorType: 'crash',
        runId: 'run-123',
      };

      const events: RetryEvent[] = [];
      fastManager.on('retry_event', (event) => events.push(event));

      await expect(fastManager.executeWithRetry(operation, context)).rejects.toThrow('Persistent failure');
      expect(operation).toHaveBeenCalledTimes(2);

      // Check for retry_exhausted event
      const exhaustedEvent = events.find((e) => e.type === 'retry_exhausted');
      expect(exhaustedEvent).toBeDefined();

      // Restore fake timers
      vi.useFakeTimers();
    });
  });

  describe('getAttemptCount', () => {
    it('should return 0 for context without attempts', () => {
      const context: RetryContext = {
        agent: 'builder',
        errorType: 'crash',
        runId: 'run-123',
      };
      expect(retryManager.getAttemptCount(context)).toBe(0);
    });
  });

  describe('resetAttempts', () => {
    it('should reset attempt count for a context', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const context: RetryContext = {
        agent: 'builder',
        errorType: 'crash',
        runId: 'run-123',
      };

      await retryManager.executeWithRetry(operation, context);

      // Reset should clear the count
      retryManager.resetAttempts(context);
      expect(retryManager.getAttemptCount(context)).toBe(0);
    });
  });

  describe('resetAll', () => {
    it('should reset all attempt counters', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const context1: RetryContext = { agent: 'builder', errorType: 'crash', runId: 'run-1' };
      const context2: RetryContext = { agent: 'verifier', errorType: 'timeout', runId: 'run-2' };

      await retryManager.executeWithRetry(operation, context1);
      await retryManager.executeWithRetry(operation, context2);

      retryManager.resetAll();

      expect(retryManager.getAttemptCount(context1)).toBe(0);
      expect(retryManager.getAttemptCount(context2)).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('should update config partially', () => {
      retryManager.updateConfig({ maxAttempts: 5 });
      const config = retryManager.getConfig();
      expect(config.maxAttempts).toBe(5);
      expect(config.baseDelayMs).toBe(defaultRetryConfig.baseDelayMs);
    });
  });
});
