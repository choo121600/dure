import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { TestConfig, TestOutput } from '../types/index.js';

/**
 * Configuration for TestRunner
 */
export interface TestRunnerConfig {
  testCommand: string;
  testDirectory: string;
  timeoutMs: number;
  cwd: string;
  env?: Record<string, string>;
}

/**
 * Result returned by TestRunner
 */
export interface TestRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  executedAt: string;
  testResults?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

/**
 * Events emitted by TestRunner
 */
export type TestRunnerEvent =
  | { type: 'start'; command: string }
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'timeout'; timeoutMs: number }
  | { type: 'complete'; result: TestRunnerResult }
  | { type: 'error'; error: Error };

/**
 * TestRunner - External subprocess for test execution
 *
 * Separates test execution from the Verifier agent to avoid:
 * - CPU resource competition
 * - Agent timeout risks
 * - Context pollution from test framework errors
 */
export class TestRunner extends EventEmitter {
  private config: TestRunnerConfig;
  private process: ChildProcess | null = null;
  private isRunning = false;
  private stdout = '';
  private stderr = '';
  private startTime: number = 0;

  constructor(config: TestRunnerConfig) {
    super();
    this.config = config;
  }

  /**
   * Execute the test command
   * @returns Promise<TestRunnerResult>
   */
  async run(): Promise<TestRunnerResult> {
    if (this.isRunning) {
      throw new Error('TestRunner is already running');
    }

    this.isRunning = true;
    this.stdout = '';
    this.stderr = '';
    this.startTime = Date.now();

    const executedAt = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const [command, ...args] = this.parseCommand(this.config.testCommand);

      this.emit('event', {
        type: 'start',
        command: this.config.testCommand,
      } as TestRunnerEvent);

      this.process = spawn(command, args, {
        cwd: this.config.cwd,
        shell: true,
        detached: true,
        env: {
          ...process.env,
          ...this.config.env,
        },
      });

      // Timeout handling
      const timeoutId = setTimeout(() => {
        this.handleTimeout(reject);
      }, this.config.timeoutMs);

      // stdout capture
      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.stdout += text;
        this.emit('event', { type: 'stdout', data: text } as TestRunnerEvent);
      });

      // stderr capture
      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.stderr += text;
        this.emit('event', { type: 'stderr', data: text } as TestRunnerEvent);
      });

      // Process exit
      this.process.on('close', (code) => {
        clearTimeout(timeoutId);
        this.isRunning = false;

        const durationMs = Date.now() - this.startTime;
        const testResults = this.parseTestResults();

        const result: TestRunnerResult = {
          exitCode: code ?? 1,
          stdout: this.stdout,
          stderr: this.stderr,
          durationMs,
          executedAt,
          testResults,
        };

        this.emit('event', { type: 'complete', result } as TestRunnerEvent);
        resolve(result);
      });

      // Process error
      this.process.on('error', (error) => {
        clearTimeout(timeoutId);
        this.isRunning = false;

        this.emit('event', { type: 'error', error } as TestRunnerEvent);
        reject(error);
      });
    });
  }

  /**
   * Handle timeout - send SIGTERM, then SIGKILL if needed
   */
  private handleTimeout(reject: (reason: Error) => void): void {
    if (!this.process) return;

    this.emit('event', {
      type: 'timeout',
      timeoutMs: this.config.timeoutMs,
    } as TestRunnerEvent);

    // Kill the entire process group to ensure child processes are also killed
    // This is necessary when shell: true creates an intermediate shell process
    this.killProcessGroup('SIGTERM');

    // If process doesn't exit within 5 seconds, force kill with SIGKILL
    setTimeout(() => {
      if (this.process && !this.process.killed) {
        this.killProcessGroup('SIGKILL');
      }
    }, 5000);

    this.isRunning = false;

    const error = new Error(
      `Test execution timed out after ${this.config.timeoutMs}ms`
    );
    reject(error);
  }

  /**
   * Kill the process group (all child processes)
   */
  private killProcessGroup(signal: 'SIGTERM' | 'SIGKILL'): void {
    if (!this.process || !this.process.pid) return;

    try {
      // Negative PID kills the entire process group
      process.kill(-this.process.pid, signal);
    } catch {
      // Fallback to direct process kill if process group kill fails
      try {
        this.process.kill(signal);
      } catch {
        // Process may have already exited
      }
    }
  }

  /**
   * Parse command string into command and arguments
   */
  private parseCommand(command: string): string[] {
    // Simple parsing - shell: true handles complex cases
    return command.split(' ').filter(Boolean);
  }

  /**
   * Parse test results from stdout
   * Supports vitest and jest JSON output formats
   */
  private parseTestResults(): TestRunnerResult['testResults'] | undefined {
    try {
      // Try to parse vitest JSON output
      const vitestMatch = this.stdout.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
      if (vitestMatch) {
        const json = JSON.parse(vitestMatch[0]);
        return {
          total: json.numTotalTests ?? 0,
          passed: json.numPassedTests ?? 0,
          failed: json.numFailedTests ?? 0,
          skipped: json.numPendingTests ?? json.numSkippedTests ?? 0,
        };
      }

      // Try to parse jest JSON output
      const jestMatch = this.stdout.match(/\{[\s\S]*"numTotalTestSuites"[\s\S]*\}/);
      if (jestMatch) {
        const json = JSON.parse(jestMatch[0]);
        return {
          total: json.numTotalTests ?? 0,
          passed: json.numPassedTests ?? 0,
          failed: json.numFailedTests ?? 0,
          skipped: json.numPendingTests ?? 0,
        };
      }

      // Try generic test result parsing from output
      const passMatch = this.stdout.match(/(\d+)\s*(?:tests?\s+)?pass(?:ed|ing)?/i);
      const failMatch = this.stdout.match(/(\d+)\s*(?:tests?\s+)?fail(?:ed|ing)?/i);
      const skipMatch = this.stdout.match(/(\d+)\s*(?:tests?\s+)?skip(?:ped)?/i);

      if (passMatch || failMatch) {
        const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
        const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
        const skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;

        return {
          total: passed + failed + skipped,
          passed,
          failed,
          skipped,
        };
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Save test results to files
   * @param outputDir Directory to save results
   */
  async saveResults(outputDir: string, result: TestRunnerResult): Promise<void> {
    // Save test-output.json
    const testOutput: TestOutput = {
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration_ms: result.durationMs,
      executed_at: result.executedAt,
      test_results: result.testResults,
    };

    await writeFile(
      join(outputDir, 'test-output.json'),
      JSON.stringify(testOutput, null, 2),
      'utf-8'
    );

    // Save test-log.txt (combined stdout + stderr)
    const logContent = [
      '=== Test Execution Log ===',
      `Command: ${this.config.testCommand}`,
      `Directory: ${this.config.cwd}`,
      `Started: ${result.executedAt}`,
      `Duration: ${result.durationMs}ms`,
      `Exit Code: ${result.exitCode}`,
      '',
      '=== STDOUT ===',
      result.stdout,
      '',
      '=== STDERR ===',
      result.stderr,
    ].join('\n');

    await writeFile(join(outputDir, 'test-log.txt'), logContent, 'utf-8');
  }

  /**
   * Stop the running test process
   */
  stop(): void {
    if (this.process && !this.process.killed) {
      this.killProcessGroup('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.killProcessGroup('SIGKILL');
        }
      }, 5000);
    }
    this.isRunning = false;
  }

  /**
   * Check if tests are currently running
   */
  isTestRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * Create TestRunner from TestConfig
 * @param config TestConfig from test-config.json
 * @param runDir Run directory path
 * @returns TestRunner instance
 */
export function createTestRunnerFromConfig(
  config: TestConfig,
  runDir: string
): TestRunner {
  return new TestRunner({
    testCommand: config.test_command,
    testDirectory: config.test_directory,
    timeoutMs: config.timeout_ms,
    cwd: runDir,
  });
}
