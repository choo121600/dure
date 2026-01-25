import { spawn, ChildProcess } from 'child_process';
import type { AgentName, AgentModel } from '../types/index.js';

export interface AgentRunOptions {
  agent: AgentName;
  model: AgentModel;
  promptFile: string;
  projectRoot: string;
  onOutput?: (data: string) => void;
  onError?: (error: string) => void;
  onExit?: (code: number | null) => void;
}

export class AgentRunner {
  private process: ChildProcess | null = null;
  private agent: AgentName;

  constructor(private options: AgentRunOptions) {
    this.agent = options.agent;
  }

  /**
   * Build the Claude CLI command
   */
  buildCommand(): { command: string; args: string[] } {
    return {
      command: 'claude',
      args: [
        '--dangerously-skip-permissions',
        '--model',
        this.options.model,
        '--prompt-file',
        this.options.promptFile,
      ],
    };
  }

  /**
   * Start the agent process
   */
  start(): ChildProcess {
    const { command, args } = this.buildCommand();

    this.process = spawn(command, args, {
      cwd: this.options.projectRoot,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    if (this.process.stdout) {
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        this.options.onOutput?.(output);
      });
    }

    if (this.process.stderr) {
      this.process.stderr.on('data', (data) => {
        const error = data.toString();
        this.options.onError?.(error);
      });
    }

    this.process.on('exit', (code) => {
      this.options.onExit?.(code);
    });

    return this.process;
  }

  /**
   * Stop the agent process
   */
  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  /**
   * Check if the agent is running
   */
  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  /**
   * Get agent name
   */
  getAgentName(): AgentName {
    return this.agent;
  }

  /**
   * Get the full command string (for display/debugging)
   */
  getCommandString(): string {
    const { command, args } = this.buildCommand();
    return `${command} ${args.join(' ')}`;
  }
}

/**
 * Factory function to create an agent runner
 */
export function createAgentRunner(options: AgentRunOptions): AgentRunner {
  return new AgentRunner(options);
}
