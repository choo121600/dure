/**
 * Integration tests for Verifier External Runner
 *
 * Tests the full flow: Verifier Phase 1 → External Test Runner → Verifier Phase 2
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import { FileWatcher, WatchEvent, FileWatcherOptions } from '../../src/core/file-watcher.js';
import { TestRunner, createTestRunnerFromConfig } from '../../src/core/test-runner.js';
import type { TestConfig, TestOutput } from '../../src/types/index.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockRunDir,
  generateTestRunId,
  wait,
} from '../helpers/test-utils.js';

/** Test-optimized options for FileWatcher */
const TEST_WATCHER_OPTIONS: FileWatcherOptions = {
  usePolling: true,
  pollingInterval: 100,
  debounceMs: 300,
  stabilityThreshold: 0,
};

/**
 * Wait for a specific event type with timeout
 */
function waitForEvent(
  emitter: EventEmitter,
  eventName: string,
  eventType: string,
  timeoutMs: number = 5000
): Promise<WatchEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventType}`));
    }, timeoutMs);

    const handler = (event: WatchEvent) => {
      if (event.type === eventType) {
        clearTimeout(timeout);
        emitter.off(eventName, handler);
        resolve(event);
      }
    };

    emitter.on(eventName, handler);
  });
}

describe('Verifier External Runner Integration', () => {
  let tempDir: string;
  let runDir: string;
  let runId: string;
  let fileWatcher: FileWatcher;
  let verifierDir: string;

  beforeEach(() => {
    tempDir = createTempDir('verifier-runner-integration');
    runId = generateTestRunId();
    runDir = createMockRunDir(tempDir, runId);
    verifierDir = join(runDir, 'verifier');
    fileWatcher = new FileWatcher(runDir, TEST_WATCHER_OPTIONS);
  });

  afterEach(async () => {
    await fileWatcher.stop();
    cleanupTempDir(tempDir);
  });

  describe('tests_ready event detection', () => {
    it('should emit tests_ready when tests-ready.flag is created with valid test-config.json', async () => {
      fileWatcher.start();
      await wait(200);

      const testConfig: TestConfig = {
        test_framework: 'vitest',
        test_command: 'npx vitest run --reporter=json',
        test_directory: 'verifier/tests',
        timeout_ms: 60000,
        coverage: true,
        created_at: new Date().toISOString(),
      };

      // Write test-config.json first
      writeFileSync(
        join(verifierDir, 'test-config.json'),
        JSON.stringify(testConfig, null, 2),
        'utf-8'
      );

      const eventPromise = waitForEvent(fileWatcher, 'event', 'tests_ready', 5000);

      // Create tests-ready.flag
      writeFileSync(join(verifierDir, 'tests-ready.flag'), new Date().toISOString(), 'utf-8');

      const event = await eventPromise as { type: 'tests_ready'; config: TestConfig };
      expect(event.type).toBe('tests_ready');
      expect(event.config.test_framework).toBe('vitest');
      expect(event.config.test_command).toBe('npx vitest run --reporter=json');
    });

    it('should emit error when tests-ready.flag is created without test-config.json', async () => {
      fileWatcher.start();
      await wait(200);

      const eventPromise = waitForEvent(fileWatcher, 'event', 'error', 5000);

      // Create tests-ready.flag without test-config.json
      writeFileSync(join(verifierDir, 'tests-ready.flag'), new Date().toISOString(), 'utf-8');

      const event = await eventPromise as { type: 'error'; error: string };
      expect(event.type).toBe('error');
      expect(event.error).toContain('test-config.json not found');
    });
  });

  describe('test_execution_done event detection', () => {
    it('should emit test_execution_done when test-output.json is created', async () => {
      fileWatcher.start();
      await wait(200);

      const testOutput: TestOutput = {
        exit_code: 0,
        stdout: 'All tests passed',
        stderr: '',
        duration_ms: 5432,
        executed_at: new Date().toISOString(),
        test_results: {
          total: 10,
          passed: 10,
          failed: 0,
          skipped: 0,
        },
      };

      const eventPromise = waitForEvent(fileWatcher, 'event', 'test_execution_done', 5000);

      // Write test-output.json
      writeFileSync(
        join(verifierDir, 'test-output.json'),
        JSON.stringify(testOutput, null, 2),
        'utf-8'
      );

      const event = await eventPromise as { type: 'test_execution_done'; result: TestOutput };
      expect(event.type).toBe('test_execution_done');
      expect(event.result.exit_code).toBe(0);
      expect(event.result.test_results?.total).toBe(10);
      expect(event.result.test_results?.passed).toBe(10);
    });
  });

  describe('complete full flow: generate → execute → analyze', () => {
    it('should handle the full external test runner flow', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();
      await wait(200);

      // Phase 1: Verifier generates tests and creates test-config.json
      const testConfig: TestConfig = {
        test_framework: 'vitest',
        test_command: 'echo "3 tests passed, 0 tests failed"',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      // Create test files (simulating Verifier output)
      writeFileSync(
        join(verifierDir, 'tests', 'example.test.ts'),
        'describe("example", () => { it("works", () => {}) });',
        'utf-8'
      );

      writeFileSync(
        join(verifierDir, 'test-config.json'),
        JSON.stringify(testConfig, null, 2),
        'utf-8'
      );

      // Wait for tests_ready event
      const testsReadyPromise = waitForEvent(fileWatcher, 'event', 'tests_ready', 5000);
      writeFileSync(join(verifierDir, 'tests-ready.flag'), new Date().toISOString(), 'utf-8');
      const testsReadyEvent = await testsReadyPromise as { type: 'tests_ready'; config: TestConfig };
      expect(testsReadyEvent.config.test_command).toBe(testConfig.test_command);

      // Phase: External test execution
      const testRunner = createTestRunnerFromConfig(testsReadyEvent.config, runDir);
      const result = await testRunner.run();
      await testRunner.saveResults(verifierDir, result);

      // Verify test-output.json was created
      expect(existsSync(join(verifierDir, 'test-output.json'))).toBe(true);

      // Wait for test_execution_done event
      const testDoneEvent = await waitForEvent(fileWatcher, 'event', 'test_execution_done', 5000) as {
        type: 'test_execution_done';
        result: TestOutput;
      };
      expect(testDoneEvent.result.exit_code).toBe(0);
      expect(testDoneEvent.result.test_results?.passed).toBe(3);

      // Phase 2: Verifier analyzes results (simulated by creating done.flag)
      const verifierDonePromise = waitForEvent(fileWatcher, 'event', 'verifier_done', 5000);
      writeFileSync(join(verifierDir, 'done.flag'), new Date().toISOString(), 'utf-8');
      await verifierDonePromise;

      // Verify all events were emitted in order
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('tests_ready');
      expect(eventTypes).toContain('test_execution_done');
      expect(eventTypes).toContain('verifier_done');
    });
  });

  describe('handle test failures and pass to phase 2', () => {
    it('should correctly pass failed test results to phase 2', async () => {
      fileWatcher.start();
      await wait(200);

      // Setup test config
      const testConfig: TestConfig = {
        test_framework: 'vitest',
        test_command: 'echo "2 tests passed, 3 tests failed"; exit 1',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      writeFileSync(
        join(verifierDir, 'test-config.json'),
        JSON.stringify(testConfig, null, 2),
        'utf-8'
      );

      // Wait for tests_ready event
      const testsReadyPromise = waitForEvent(fileWatcher, 'event', 'tests_ready', 5000);
      writeFileSync(join(verifierDir, 'tests-ready.flag'), new Date().toISOString(), 'utf-8');
      const testsReadyEvent = await testsReadyPromise as { type: 'tests_ready'; config: TestConfig };

      // Execute tests with failures
      const testRunner = createTestRunnerFromConfig(testsReadyEvent.config, runDir);
      const result = await testRunner.run();
      await testRunner.saveResults(verifierDir, result);

      // Wait for test_execution_done event
      const testDoneEvent = await waitForEvent(fileWatcher, 'event', 'test_execution_done', 5000) as {
        type: 'test_execution_done';
        result: TestOutput;
      };

      // Verify failed tests are captured
      expect(testDoneEvent.result.exit_code).toBe(1);
      expect(testDoneEvent.result.test_results?.passed).toBe(2);
      expect(testDoneEvent.result.test_results?.failed).toBe(3);

      // Verify test-output.json contains failure information
      const savedOutput = JSON.parse(
        readFileSync(join(verifierDir, 'test-output.json'), 'utf-8')
      ) as TestOutput;
      expect(savedOutput.exit_code).toBe(1);
      expect(savedOutput.test_results?.failed).toBe(3);
    });
  });

  describe('respect timeout configuration', () => {
    it('should timeout test execution after configured duration', async () => {
      const testConfig: TestConfig = {
        test_framework: 'custom',
        test_command: 'sleep 10',
        test_directory: 'verifier/tests',
        timeout_ms: 500, // Very short timeout
        coverage: false,
        created_at: new Date().toISOString(),
      };

      const testRunner = createTestRunnerFromConfig(testConfig, runDir);
      const events: { type: string; timeoutMs?: number }[] = [];

      testRunner.on('event', (event) => {
        events.push(event);
      });

      await expect(testRunner.run()).rejects.toThrow('timed out');

      const timeoutEvent = events.find((e) => e.type === 'timeout');
      expect(timeoutEvent).toBeDefined();
      expect(timeoutEvent?.timeoutMs).toBe(500);
    });

    it('should complete within configured timeout', async () => {
      const testConfig: TestConfig = {
        test_framework: 'custom',
        test_command: 'echo "done"',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      const testRunner = createTestRunnerFromConfig(testConfig, runDir);
      const result = await testRunner.run();

      expect(result.exitCode).toBe(0);
      expect(result.durationMs).toBeLessThan(testConfig.timeout_ms);
    });
  });

  describe('emit correct events throughout the flow', () => {
    it('should emit all expected TestRunner events', async () => {
      const testConfig: TestConfig = {
        test_framework: 'vitest',
        test_command: 'echo "stdout"; echo "stderr" >&2; echo "5 tests passed"',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      const testRunner = createTestRunnerFromConfig(testConfig, runDir);
      const events: { type: string }[] = [];

      testRunner.on('event', (event) => {
        events.push({ type: event.type });
      });

      await testRunner.run();

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('start');
      expect(eventTypes).toContain('stdout');
      expect(eventTypes).toContain('complete');
    });

    it('should emit start event with correct command', async () => {
      const testConfig: TestConfig = {
        test_framework: 'custom',
        test_command: 'echo "custom test command"',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      const testRunner = createTestRunnerFromConfig(testConfig, runDir);
      let startEvent: { type: string; command?: string } | null = null;

      testRunner.on('event', (event) => {
        if (event.type === 'start') {
          startEvent = event;
        }
      });

      await testRunner.run();

      expect(startEvent).not.toBeNull();
      expect(startEvent?.command).toBe('echo "custom test command"');
    });

    it('should emit complete event with result', async () => {
      const testConfig: TestConfig = {
        test_framework: 'vitest',
        test_command: 'echo "10 tests passed, 0 tests failed"',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      const testRunner = createTestRunnerFromConfig(testConfig, runDir);
      let completeEvent: { type: string; result?: { exitCode: number; testResults?: { passed: number } } } | null = null;

      testRunner.on('event', (event) => {
        if (event.type === 'complete') {
          completeEvent = event;
        }
      });

      await testRunner.run();

      expect(completeEvent).not.toBeNull();
      expect(completeEvent?.result?.exitCode).toBe(0);
      expect(completeEvent?.result?.testResults?.passed).toBe(10);
    });
  });

  describe('file saving', () => {
    it('should save test-output.json with correct structure', async () => {
      const testConfig: TestConfig = {
        test_framework: 'vitest',
        test_command: 'echo "test output here"',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      const testRunner = createTestRunnerFromConfig(testConfig, runDir);
      const result = await testRunner.run();
      await testRunner.saveResults(verifierDir, result);

      const outputPath = join(verifierDir, 'test-output.json');
      expect(existsSync(outputPath)).toBe(true);

      const savedOutput = JSON.parse(readFileSync(outputPath, 'utf-8')) as TestOutput;
      expect(savedOutput).toHaveProperty('exit_code');
      expect(savedOutput).toHaveProperty('stdout');
      expect(savedOutput).toHaveProperty('stderr');
      expect(savedOutput).toHaveProperty('duration_ms');
      expect(savedOutput).toHaveProperty('executed_at');
    });

    it('should save test-log.txt with execution details', async () => {
      const testConfig: TestConfig = {
        test_framework: 'vitest',
        test_command: 'echo "stdout content" && echo "stderr content" >&2',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      const testRunner = createTestRunnerFromConfig(testConfig, runDir);
      const result = await testRunner.run();
      await testRunner.saveResults(verifierDir, result);

      const logPath = join(verifierDir, 'test-log.txt');
      expect(existsSync(logPath)).toBe(true);

      const logContent = readFileSync(logPath, 'utf-8');
      expect(logContent).toContain('=== Test Execution Log ===');
      expect(logContent).toContain('Command:');
      expect(logContent).toContain('=== STDOUT ===');
      expect(logContent).toContain('stdout content');
      expect(logContent).toContain('=== STDERR ===');
      expect(logContent).toContain('stderr content');
    });
  });

  describe('test framework support', () => {
    it('should handle vitest framework', async () => {
      const testConfig: TestConfig = {
        test_framework: 'vitest',
        test_command: 'echo \'{"numTotalTests":5,"numPassedTests":4,"numFailedTests":1,"numPendingTests":0}\'',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      const testRunner = createTestRunnerFromConfig(testConfig, runDir);
      const result = await testRunner.run();

      expect(result.testResults?.total).toBe(5);
      expect(result.testResults?.passed).toBe(4);
      expect(result.testResults?.failed).toBe(1);
    });

    it('should handle jest framework', async () => {
      const testConfig: TestConfig = {
        test_framework: 'jest',
        test_command: 'echo \'{"numTotalTestSuites":3,"numTotalTests":8,"numPassedTests":7,"numFailedTests":1,"numPendingTests":0}\'',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      const testRunner = createTestRunnerFromConfig(testConfig, runDir);
      const result = await testRunner.run();

      expect(result.testResults?.total).toBe(8);
      expect(result.testResults?.passed).toBe(7);
      expect(result.testResults?.failed).toBe(1);
    });

    it('should handle custom framework with generic output', async () => {
      const testConfig: TestConfig = {
        test_framework: 'custom',
        test_command: 'echo "Results: 12 passing, 2 failing, 1 skipped"',
        test_directory: 'verifier/tests',
        timeout_ms: 30000,
        coverage: false,
        created_at: new Date().toISOString(),
      };

      const testRunner = createTestRunnerFromConfig(testConfig, runDir);
      const result = await testRunner.run();

      expect(result.testResults?.passed).toBe(12);
      expect(result.testResults?.failed).toBe(2);
      expect(result.testResults?.skipped).toBe(1);
    });
  });
});
