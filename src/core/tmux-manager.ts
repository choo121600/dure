import { execSync, spawn } from 'child_process';
import type { AgentName, AgentModel } from '../types/index.js';

export interface TmuxPane {
  index: number;
  name: string;
}

export class TmuxManager {
  private sessionName: string;
  private projectRoot: string;

  // Pane assignments
  private static readonly PANES: Record<AgentName | 'debug' | 'server', number> = {
    refiner: 0,
    builder: 1,
    verifier: 2,
    gatekeeper: 3,
    debug: 4,
    server: 5,
  };

  constructor(sessionPrefix: string, projectRoot: string, runId?: string) {
    this.sessionName = runId ? `${sessionPrefix}-${runId}` : sessionPrefix;
    this.projectRoot = projectRoot;
  }

  /**
   * Check if tmux is available
   */
  static isTmuxAvailable(): boolean {
    try {
      execSync('which tmux', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the session already exists
   */
  sessionExists(): boolean {
    try {
      execSync(`tmux has-session -t ${this.sessionName} 2>/dev/null`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create the tmux session with 6 panes
   * Layout:
   * ┌──────────┬──────────┬──────────┬──────────┐
   * │ Refiner  │ Builder  │ Verifier │Gatekeeper│
   * │ (pane 0) │ (pane 1) │ (pane 2) │ (pane 3) │
   * ├──────────┴──────────┴──────────┴──────────┤
   * │              Debug Shell (pane 4)          │
   * ├────────────────────────────────────────────┤
   * │              ACE Server (pane 5)           │
   * └────────────────────────────────────────────┘
   */
  createSession(): void {
    if (this.sessionExists()) {
      console.log(`Session ${this.sessionName} already exists`);
      return;
    }

    // Create new session with first pane
    execSync(`tmux new-session -d -s ${this.sessionName} -n main -c "${this.projectRoot}"`, {
      stdio: 'inherit',
    });

    // Create panes for 4 agents (horizontal splits for first row)
    // Split pane 0 horizontally to create pane 1
    execSync(`tmux split-window -h -t ${this.sessionName}:main.0 -c "${this.projectRoot}"`);
    // Split pane 0 horizontally again to create a pane between 0 and 1
    execSync(`tmux split-window -h -t ${this.sessionName}:main.0 -c "${this.projectRoot}"`);
    // Split pane 2 horizontally to create pane 3
    execSync(`tmux split-window -h -t ${this.sessionName}:main.2 -c "${this.projectRoot}"`);

    // Create debug shell pane (vertical split below all 4)
    execSync(`tmux split-window -v -t ${this.sessionName}:main.0 -c "${this.projectRoot}"`);

    // Create server pane (vertical split below debug)
    execSync(`tmux split-window -v -t ${this.sessionName}:main.4 -c "${this.projectRoot}"`);

    // Apply tiled layout and then adjust
    execSync(`tmux select-layout -t ${this.sessionName}:main tiled`);

    // Enable mouse mode for easier pane navigation
    execSync(`tmux set-option -t ${this.sessionName} -g mouse on`);

    // Enable pane border status to show pane names
    execSync(`tmux set-option -t ${this.sessionName} pane-border-status top`);
    execSync(`tmux set-option -t ${this.sessionName} pane-border-format " #{pane_index}: #{pane_title} "`);

    // Set pane titles
    execSync(`tmux select-pane -t ${this.sessionName}:main.0 -T "Refiner"`);
    execSync(`tmux select-pane -t ${this.sessionName}:main.1 -T "Builder"`);
    execSync(`tmux select-pane -t ${this.sessionName}:main.2 -T "Verifier"`);
    execSync(`tmux select-pane -t ${this.sessionName}:main.3 -T "Gatekeeper"`);
    execSync(`tmux select-pane -t ${this.sessionName}:main.4 -T "Debug Shell"`);
    execSync(`tmux select-pane -t ${this.sessionName}:main.5 -T "ACE Server"`);

    // Set up debug shell with helper commands and instructions
    const debugSetup = [
      'clear',
      'echo "Commands:"',
      'echo "  stop      - Stop Orchestral and exit tmux"',
      'echo "  detach    - Detach from tmux (Ctrl+B, D)"',
      'echo "  logs      - Show recent run logs"',
      'echo ""',
      'echo "Pane Navigation: Click with mouse or Ctrl+B, Arrow keys"',
      'echo ""',
      // Define helper functions
      `stop() { tmux kill-session -t ${this.sessionName}; }`,
      'detach() { tmux detach; }',
      'logs() { ls -la .orchestral/runs/ 2>/dev/null || echo "No runs yet"; }',
    ].join(' && ');
    this.sendKeys('debug', debugSetup);
  }

  /**
   * Send keys to a specific pane
   */
  sendKeys(pane: AgentName | 'debug' | 'server', command: string): void {
    const paneIndex = TmuxManager.PANES[pane];
    // Escape special characters for tmux
    const escapedCommand = command.replace(/"/g, '\\"');
    execSync(`tmux send-keys -t ${this.sessionName}:main.${paneIndex} "${escapedCommand}" Enter`);
  }

  /**
   * Start Claude agent in a pane
   * Uses tmux load-buffer to avoid shell interpretation of special characters in prompt
   */
  startAgent(agent: AgentName, model: AgentModel, promptFile: string): void {
    const paneIndex = TmuxManager.PANES[agent];
    const bufferName = `prompt-${agent}`;

    // Start Claude in interactive mode
    const startCmd = `cd "${this.projectRoot}" && claude --dangerously-skip-permissions --model ${model}`;
    this.sendKeys(agent, startCmd);

    // Load prompt file into tmux buffer and paste it (in background after delay for Claude to start)
    // Added sleep 0.5 between paste and Enter to ensure paste completes
    spawn('sh', ['-c',
      `sleep 2 && ` +
      `tmux load-buffer -b ${bufferName} "${promptFile}" && ` +
      `tmux paste-buffer -b ${bufferName} -t ${this.sessionName}:main.${paneIndex} && ` +
      `sleep 0.5 && ` +
      `tmux send-keys -t ${this.sessionName}:main.${paneIndex} C-m`
    ], { detached: true, stdio: 'ignore' }).unref();
  }

  /**
   * Start the web server in its pane
   */
  startServer(port: number): void {
    const command = `cd "${this.projectRoot}" && node dist/server/index.js --port ${port}`;
    this.sendKeys('server', command);
  }

  /**
   * Kill the tmux session
   */
  killSession(): void {
    if (this.sessionExists()) {
      execSync(`tmux kill-session -t ${this.sessionName}`, { stdio: 'ignore' });
    }
  }

  /**
   * Attach to the session (for interactive use)
   */
  attachSession(): void {
    spawn('tmux', ['attach-session', '-t', this.sessionName], {
      stdio: 'inherit',
    });
  }

  /**
   * Get session name
   */
  getSessionName(): string {
    return this.sessionName;
  }

  /**
   * List all orchestral sessions
   */
  static listSessions(sessionPrefix: string): string[] {
    try {
      const output = execSync('tmux list-sessions -F "#{session_name}"', { encoding: 'utf-8' });
      return output
        .trim()
        .split('\n')
        .filter(s => s.startsWith(sessionPrefix));
    } catch {
      return [];
    }
  }

  /**
   * Capture the output from a specific pane
   * @param pane - The pane to capture (agent name or 'debug'/'server')
   * @param historyLines - Number of history lines to capture (default: 100)
   * @returns The captured output as a string
   */
  capturePane(pane: AgentName | 'debug' | 'server', historyLines: number = 100): string {
    if (!this.sessionExists()) {
      return '';
    }

    const paneIndex = TmuxManager.PANES[pane];
    try {
      // -p: print to stdout, -S: start line (negative for history), -E: end line
      const output = execSync(
        `tmux capture-pane -t ${this.sessionName}:main.${paneIndex} -p -S -${historyLines}`,
        { encoding: 'utf-8', maxBuffer: 1024 * 1024 }
      );
      return output;
    } catch {
      return '';
    }
  }

  /**
   * Check if a pane has an active process running
   * @param pane - The pane to check
   * @returns true if a process is running (not just shell prompt)
   */
  isPaneActive(pane: AgentName | 'debug' | 'server'): boolean {
    if (!this.sessionExists()) {
      return false;
    }

    const paneIndex = TmuxManager.PANES[pane];
    try {
      // Get the pane's current command
      const output = execSync(
        `tmux list-panes -t ${this.sessionName}:main -F "#{pane_index}:#{pane_current_command}"`,
        { encoding: 'utf-8' }
      );
      const lines = output.trim().split('\n');
      for (const line of lines) {
        const [idx, cmd] = line.split(':');
        if (parseInt(idx) === paneIndex) {
          // Check if it's not just a shell (bash, zsh, sh)
          const isShell = ['bash', 'zsh', 'sh', 'fish'].includes(cmd);
          return !isShell;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get pane index for an agent
   */
  static getPaneIndex(pane: AgentName | 'debug' | 'server'): number {
    return TmuxManager.PANES[pane];
  }
}
