/**
 * Unit tests for TestRunner
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  TestRunner,
  TestRunnerConfig,
  TestRunnerResult,
  TestRunnerEvent,
  createTestRunnerFromConfig,
} from '../../../src/core/test-runner.js';
import type { TestConfig } from '../../../src/types/index.js';
import {
  createTempDir,
  cleanupTempDir,
  wait,
} from '../../helpers/test-utils.js';

describe('TestRunner', () => {
  let tempDir: string;
  let testDir: string;

  beforeEach(() => {
    tempDir = createTempDir('test-runner-test');
    testDir = join(tempDir, 'tests');
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('constructor', () => {
    it('should create TestRunner with config', () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "hello"',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      expect(runner).toBeInstanceOf(TestRunner);
      expect(runner.isTestRunning()).toBe(false);
    });
  });

  describe('run', () => {
    it('should execute test command and capture output', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "test output"',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test output');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.executedAt).toBeDefined();
    });

    it('should capture stderr output', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "error message" >&2',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();

      expect(result.stderr).toContain('error message');
    });

    it('should capture non-zero exit code', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'exit 1',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();

      expect(result.exitCode).toBe(1);
    });

    it('should use custom environment variables', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo $TEST_VAR',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
        env: { TEST_VAR: 'custom_value' },
      };

      const runner = new TestRunner(config);
      const result = await runner.run();

      expect(result.stdout).toContain('custom_value');
    });

    it('should throw error when already running', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'sleep 5',
        testDirectory: testDir,
        timeoutMs: 10000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const runPromise = runner.run();

      // Small delay to ensure the first run has started
      await wait(50);

      await expect(runner.run()).rejects.toThrow('TestRunner is already running');

      runner.stop();
      // Wait for the original run to complete or be stopped
      try {
        await runPromise;
      } catch {
        // Expected - the process was stopped
      }
    });
  });

  describe('timeout handling', () => {
    it('should timeout and kill process after configured duration', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'sleep 10',
        testDirectory: testDir,
        timeoutMs: 500,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const events: TestRunnerEvent[] = [];

      runner.on('event', (event: TestRunnerEvent) => {
        events.push(event);
      });

      await expect(runner.run()).rejects.toThrow('timed out');

      const timeoutEvent = events.find((e) => e.type === 'timeout');
      expect(timeoutEvent).toBeDefined();
      expect((timeoutEvent as { type: 'timeout'; timeoutMs: number }).timeoutMs).toBe(500);
    });
  });

  describe('event emission', () => {
    it('should emit start event when test begins', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "test"',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const events: TestRunnerEvent[] = [];

      runner.on('event', (event: TestRunnerEvent) => {
        events.push(event);
      });

      await runner.run();

      const startEvent = events.find((e) => e.type === 'start');
      expect(startEvent).toBeDefined();
      expect((startEvent as { type: 'start'; command: string }).command).toBe('echo "test"');
    });

    it('should emit stdout event when output is received', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "output line"',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const events: TestRunnerEvent[] = [];

      runner.on('event', (event: TestRunnerEvent) => {
        events.push(event);
      });

      await runner.run();

      const stdoutEvents = events.filter((e) => e.type === 'stdout');
      expect(stdoutEvents.length).toBeGreaterThan(0);
    });

    it('should emit complete event when test finishes', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "done"',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const events: TestRunnerEvent[] = [];

      runner.on('event', (event: TestRunnerEvent) => {
        events.push(event);
      });

      await runner.run();

      const completeEvent = events.find((e) => e.type === 'complete');
      expect(completeEvent).toBeDefined();
      expect((completeEvent as { type: 'complete'; result: TestRunnerResult }).result.exitCode).toBe(0);
    });
  });

  describe('parseTestResults', () => {
    it('should parse vitest JSON output correctly', async () => {
      const vitestOutput = JSON.stringify({
        numTotalTests: 10,
        numPassedTests: 8,
        numFailedTests: 2,
        numPendingTests: 0,
      });

      const config: TestRunnerConfig = {
        testCommand: `echo '${vitestOutput}'`,
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();

      expect(result.testResults).toBeDefined();
      expect(result.testResults?.total).toBe(10);
      expect(result.testResults?.passed).toBe(8);
      expect(result.testResults?.failed).toBe(2);
      expect(result.testResults?.skipped).toBe(0);
    });

    it('should parse jest JSON output correctly', async () => {
      const jestOutput = JSON.stringify({
        numTotalTestSuites: 5,
        numTotalTests: 15,
        numPassedTests: 12,
        numFailedTests: 3,
        numPendingTests: 0,
      });

      const config: TestRunnerConfig = {
        testCommand: `echo '${jestOutput}'`,
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();

      expect(result.testResults).toBeDefined();
      expect(result.testResults?.total).toBe(15);
      expect(result.testResults?.passed).toBe(12);
      expect(result.testResults?.failed).toBe(3);
    });

    it('should parse generic test output format', async () => {
      const genericOutput = '5 tests passed, 2 tests failed, 1 skipped';

      const config: TestRunnerConfig = {
        testCommand: `echo "${genericOutput}"`,
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();

      expect(result.testResults).toBeDefined();
      expect(result.testResults?.passed).toBe(5);
      expect(result.testResults?.failed).toBe(2);
      expect(result.testResults?.skipped).toBe(1);
      expect(result.testResults?.total).toBe(8);
    });

    it('should return undefined for non-parseable output', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "random text without test results"',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();

      expect(result.testResults).toBeUndefined();
    });
  });

  describe('handle process crash gracefully', () => {
    it('should handle non-existent command gracefully', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'nonexistent_command_xyz',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();

      // Should return with non-zero exit code instead of throwing
      expect(result.exitCode).not.toBe(0);
    });

    it('should handle command that exits with signal', async () => {
      // Create a script that kills itself
      const scriptPath = join(tempDir, 'self-kill.sh');
      writeFileSync(scriptPath, '#!/bin/bash\nkill -9 $$', { mode: 0o755 });

      const config: TestRunnerConfig = {
        testCommand: `bash ${scriptPath}`,
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();

      // Process killed by SIGKILL (9) - exit code varies by system
      expect(result.exitCode).not.toBe(0);
      expect(runner.isTestRunning()).toBe(false);
    });
  });

  describe('saveResults', () => {
    it('should save results to test-output.json', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "test output"',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();
      await runner.saveResults(tempDir, result);

      const outputPath = join(tempDir, 'test-output.json');
      expect(existsSync(outputPath)).toBe(true);

      const savedOutput = JSON.parse(readFileSync(outputPath, 'utf-8'));
      expect(savedOutput.exit_code).toBe(0);
      expect(savedOutput.stdout).toContain('test output');
      expect(savedOutput.duration_ms).toBeGreaterThanOrEqual(0);
      expect(savedOutput.executed_at).toBeDefined();
    });

    it('should save test-log.txt with combined output', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "stdout"; echo "stderr" >&2',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const result = await runner.run();
      await runner.saveResults(tempDir, result);

      const logPath = join(tempDir, 'test-log.txt');
      expect(existsSync(logPath)).toBe(true);

      const logContent = readFileSync(logPath, 'utf-8');
      expect(logContent).toContain('=== Test Execution Log ===');
      expect(logContent).toContain('Command:');
      expect(logContent).toContain('=== STDOUT ===');
      expect(logContent).toContain('stdout');
      expect(logContent).toContain('=== STDERR ===');
      expect(logContent).toContain('stderr');
    });
  });

  describe('stop', () => {
    it('should stop running test process', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'sleep 30',
        testDirectory: testDir,
        timeoutMs: 60000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const runPromise = runner.run();

      await wait(100);
      expect(runner.isTestRunning()).toBe(true);

      runner.stop();

      // Process should be stopped
      await wait(200);
      expect(runner.isTestRunning()).toBe(false);

      // Clean up the promise
      try {
        await runPromise;
      } catch {
        // Expected - process was killed
      }
    });

    it('should be safe to call stop when not running', () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "test"',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);

      // Should not throw
      expect(() => runner.stop()).not.toThrow();
    });
  });

  describe('isTestRunning', () => {
    it('should return true while test is running', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'sleep 2',
        testDirectory: testDir,
        timeoutMs: 10000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      const runPromise = runner.run();

      await wait(100);
      expect(runner.isTestRunning()).toBe(true);

      runner.stop();
      await wait(200);

      try {
        await runPromise;
      } catch {
        // Expected
      }
    });

    it('should return false after test completes', async () => {
      const config: TestRunnerConfig = {
        testCommand: 'echo "done"',
        testDirectory: testDir,
        timeoutMs: 5000,
        cwd: tempDir,
      };

      const runner = new TestRunner(config);
      await runner.run();

      expect(runner.isTestRunning()).toBe(false);
    });
  });

  describe('createTestRunnerFromConfig', () => {
    it('should create TestRunner from TestConfig', () => {
      const testConfig: TestConfig = {
        test_framework: 'vitest',
        test_command: 'npx vitest run',
        test_directory: 'verifier/tests',
        timeout_ms: 120000,
        coverage: true,
        created_at: new Date().toISOString(),
      };

      const runner = createTestRunnerFromConfig(testConfig, tempDir);
      expect(runner).toBeInstanceOf(TestRunner);
    });
  });
});
