import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRunner, createAgentRunner, type AgentRunOptions } from '../../../src/agents/agent-runner.js';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';

const mockSpawn = spawn as ReturnType<typeof vi.fn>;

describe('AgentRunner', () => {
  let defaultOptions: AgentRunOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    defaultOptions = {
      agent: 'builder',
      model: 'sonnet',
      promptFile: '/path/to/prompt.md',
      projectRoot: '/project/root',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with provided options', () => {
      const runner = new AgentRunner(defaultOptions);
      expect(runner.getAgentName()).toBe('builder');
    });
  });

  describe('buildCommand', () => {
    it('should build correct command and args', () => {
      const runner = new AgentRunner(defaultOptions);
      const { command, args } = runner.buildCommand();

      expect(command).toBe('claude');
      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).toContain('--model');
      expect(args).toContain('sonnet');
      expect(args).toContain('--prompt-file');
      expect(args).toContain('/path/to/prompt.md');
    });

    it('should use the correct model for different agents', () => {
      const runner = new AgentRunner({
        ...defaultOptions,
        agent: 'refiner',
        model: 'haiku',
      });
      const { args } = runner.buildCommand();

      expect(args).toContain('haiku');
    });
  });

  describe('start', () => {
    it('should spawn a process with correct arguments', () => {
      const mockProcess = new EventEmitter() as ReturnType<typeof spawn>;
      mockProcess.stdout = new EventEmitter() as NodeJS.ReadableStream;
      mockProcess.stderr = new EventEmitter() as NodeJS.ReadableStream;
      (mockProcess as unknown as { exitCode: number | null }).exitCode = null;
      mockSpawn.mockReturnValue(mockProcess);

      const runner = new AgentRunner(defaultOptions);
      runner.start();

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--dangerously-skip-permissions', '--model', 'sonnet']),
        expect.objectContaining({
          cwd: '/project/root',
          shell: true,
        })
      );
    });

    it('should call onOutput callback when stdout receives data', () => {
      const mockProcess = new EventEmitter() as ReturnType<typeof spawn>;
      mockProcess.stdout = new EventEmitter() as NodeJS.ReadableStream;
      mockProcess.stderr = new EventEmitter() as NodeJS.ReadableStream;
      (mockProcess as unknown as { exitCode: number | null }).exitCode = null;
      mockSpawn.mockReturnValue(mockProcess);

      const onOutput = vi.fn();
      const runner = new AgentRunner({ ...defaultOptions, onOutput });
      runner.start();

      (mockProcess.stdout as EventEmitter).emit('data', Buffer.from('test output'));
      expect(onOutput).toHaveBeenCalledWith('test output');
    });

    it('should call onError callback when stderr receives data', () => {
      const mockProcess = new EventEmitter() as ReturnType<typeof spawn>;
      mockProcess.stdout = new EventEmitter() as NodeJS.ReadableStream;
      mockProcess.stderr = new EventEmitter() as NodeJS.ReadableStream;
      (mockProcess as unknown as { exitCode: number | null }).exitCode = null;
      mockSpawn.mockReturnValue(mockProcess);

      const onError = vi.fn();
      const runner = new AgentRunner({ ...defaultOptions, onError });
      runner.start();

      (mockProcess.stderr as EventEmitter).emit('data', Buffer.from('error message'));
      expect(onError).toHaveBeenCalledWith('error message');
    });

    it('should call onExit callback when process exits', () => {
      const mockProcess = new EventEmitter() as ReturnType<typeof spawn>;
      mockProcess.stdout = new EventEmitter() as NodeJS.ReadableStream;
      mockProcess.stderr = new EventEmitter() as NodeJS.ReadableStream;
      (mockProcess as unknown as { exitCode: number | null }).exitCode = null;
      mockSpawn.mockReturnValue(mockProcess);

      const onExit = vi.fn();
      const runner = new AgentRunner({ ...defaultOptions, onExit });
      runner.start();

      mockProcess.emit('exit', 0);
      expect(onExit).toHaveBeenCalledWith(0);
    });

    it('should handle process without stdout/stderr', () => {
      const mockProcess = new EventEmitter() as ReturnType<typeof spawn>;
      mockProcess.stdout = null as unknown as NodeJS.ReadableStream;
      mockProcess.stderr = null as unknown as NodeJS.ReadableStream;
      mockSpawn.mockReturnValue(mockProcess);

      const runner = new AgentRunner(defaultOptions);
      expect(() => runner.start()).not.toThrow();
    });
  });

  describe('stop', () => {
    it('should kill the process with SIGTERM', () => {
      const mockProcess = new EventEmitter() as ReturnType<typeof spawn>;
      mockProcess.stdout = new EventEmitter() as NodeJS.ReadableStream;
      mockProcess.stderr = new EventEmitter() as NodeJS.ReadableStream;
      mockProcess.kill = vi.fn();
      (mockProcess as unknown as { exitCode: number | null }).exitCode = null;
      mockSpawn.mockReturnValue(mockProcess);

      const runner = new AgentRunner(defaultOptions);
      runner.start();
      runner.stop();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should do nothing if no process is running', () => {
      const runner = new AgentRunner(defaultOptions);
      expect(() => runner.stop()).not.toThrow();
    });
  });

  describe('isRunning', () => {
    it('should return false when no process started', () => {
      const runner = new AgentRunner(defaultOptions);
      expect(runner.isRunning()).toBe(false);
    });

    it('should return true when process is running', () => {
      const mockProcess = new EventEmitter() as ReturnType<typeof spawn>;
      mockProcess.stdout = new EventEmitter() as NodeJS.ReadableStream;
      mockProcess.stderr = new EventEmitter() as NodeJS.ReadableStream;
      (mockProcess as unknown as { exitCode: number | null }).exitCode = null;
      mockSpawn.mockReturnValue(mockProcess);

      const runner = new AgentRunner(defaultOptions);
      runner.start();
      expect(runner.isRunning()).toBe(true);
    });

    it('should return false when process has exited', () => {
      const mockProcess = new EventEmitter() as ReturnType<typeof spawn>;
      mockProcess.stdout = new EventEmitter() as NodeJS.ReadableStream;
      mockProcess.stderr = new EventEmitter() as NodeJS.ReadableStream;
      (mockProcess as unknown as { exitCode: number | null }).exitCode = 0;
      mockSpawn.mockReturnValue(mockProcess);

      const runner = new AgentRunner(defaultOptions);
      runner.start();
      expect(runner.isRunning()).toBe(false);
    });
  });

  describe('getAgentName', () => {
    it('should return the correct agent name', () => {
      const runner = new AgentRunner({ ...defaultOptions, agent: 'verifier' });
      expect(runner.getAgentName()).toBe('verifier');
    });
  });

  describe('getCommandString', () => {
    it('should return the full command string', () => {
      const runner = new AgentRunner(defaultOptions);
      const cmdString = runner.getCommandString();

      expect(cmdString).toContain('claude');
      expect(cmdString).toContain('--dangerously-skip-permissions');
      expect(cmdString).toContain('--model sonnet');
      expect(cmdString).toContain('--prompt-file /path/to/prompt.md');
    });
  });
});

describe('createAgentRunner', () => {
  it('should create an AgentRunner instance', () => {
    const options: AgentRunOptions = {
      agent: 'gatekeeper',
      model: 'sonnet',
      promptFile: '/path/to/prompt.md',
      projectRoot: '/project/root',
    };
    const runner = createAgentRunner(options);
    expect(runner).toBeInstanceOf(AgentRunner);
    expect(runner.getAgentName()).toBe('gatekeeper');
  });
});
