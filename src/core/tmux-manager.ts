import { execSync, spawn, spawnSync } from 'child_process';
import type { AgentName, AgentModel } from '../types/index.js';
import { sanitizePath, sanitizeSessionName, isValidModel, isValidAgentName } from '../utils/sanitize.js';
import { existsSync, mkdirSync } from 'fs';

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
    // Sanitize session prefix (validates characters)
    const sanitizedPrefix = sanitizeSessionName(sessionPrefix);

    // Sanitize project root (validates path)
    this.projectRoot = sanitizePath(projectRoot);

    // Build session name with optional run ID
    if (runId) {
      // Validate run ID format or sanitize it
      const sanitizedRunId = runId.replace(/[^a-zA-Z0-9_-]/g, '');
      this.sessionName = `${sanitizedPrefix}-${sanitizedRunId}`;
    } else {
      this.sessionName = sanitizedPrefix;
    }

    // Validate final session name
    this.sessionName = sanitizeSessionName(this.sessionName);
  }

  /**
   * Check if tmux is available
   */
  static isTmuxAvailable(): boolean {
    try {
      const result = spawnSync('which', ['tmux'], { stdio: 'pipe' });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if the session already exists
   */
  sessionExists(): boolean {
    try {
      const result = spawnSync('tmux', ['has-session', '-t', this.sessionName], {
        stdio: 'pipe',
      });
      return result.status === 0;
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

    const target = (pane: number) => `${this.sessionName}:main.${pane}`;

    // Create new session with first pane
    spawnSync('tmux', [
      'new-session', '-d',
      '-s', this.sessionName,
      '-n', 'main',
      '-c', this.projectRoot,
    ], { stdio: 'inherit' });

    // Create panes for 4 agents (horizontal splits for first row)
    // Split pane 0 horizontally to create pane 1
    spawnSync('tmux', ['split-window', '-h', '-t', target(0), '-c', this.projectRoot]);
    // Split pane 0 horizontally again to create a pane between 0 and 1
    spawnSync('tmux', ['split-window', '-h', '-t', target(0), '-c', this.projectRoot]);
    // Split pane 2 horizontally to create pane 3
    spawnSync('tmux', ['split-window', '-h', '-t', target(2), '-c', this.projectRoot]);

    // Create debug shell pane (vertical split below all 4)
    spawnSync('tmux', ['split-window', '-v', '-t', target(0), '-c', this.projectRoot]);

    // Create server pane (vertical split below debug)
    spawnSync('tmux', ['split-window', '-v', '-t', target(4), '-c', this.projectRoot]);

    // Apply tiled layout and then adjust
    spawnSync('tmux', ['select-layout', '-t', `${this.sessionName}:main`, 'tiled']);

    // Enable mouse mode for easier pane navigation
    spawnSync('tmux', ['set-option', '-t', this.sessionName, '-g', 'mouse', 'on']);

    // Keep panes open after process exits (prevents session termination on agent completion)
    spawnSync('tmux', ['set-option', '-t', this.sessionName, 'remain-on-exit', 'on']);

    // Enable pane border status to show pane names
    spawnSync('tmux', ['set-option', '-t', this.sessionName, 'pane-border-status', 'top']);
    spawnSync('tmux', [
      'set-option', '-t', this.sessionName,
      'pane-border-format', ' #{pane_index}: #{pane_title} ',
    ]);

    // Set pane titles
    const paneTitles: Record<number, string> = {
      0: 'Refiner',
      1: 'Builder',
      2: 'Verifier',
      3: 'Gatekeeper',
      4: 'Debug Shell',
      5: 'ACE Server',
    };

    for (const [pane, title] of Object.entries(paneTitles)) {
      spawnSync('tmux', ['select-pane', '-t', target(parseInt(pane)), '-T', title]);
    }

    // Set up debug shell with helper commands and instructions
    const debugCommands = [
      'clear',
      'echo "Commands:"',
      'echo "  stop      - Stop Dure and exit tmux"',
      'echo "  detach    - Detach from tmux (Ctrl+B, D)"',
      'echo "  logs      - Show recent run logs"',
      'echo ""',
      'echo "Pane Navigation: Click with mouse or Ctrl+B, Arrow keys"',
      'echo ""',
      `stop() { tmux kill-session -t ${this.sessionName}; }`,
      'detach() { tmux detach; }',
      'logs() { ls -la .dure/runs/ 2>/dev/null || echo "No runs yet"; }',
    ];
    this.sendKeys('debug', debugCommands.join(' && '));
  }

  /**
   * Send keys to a specific pane
   * Uses spawn with array arguments to prevent command injection
   */
  sendKeys(pane: AgentName | 'debug' | 'server', command: string): void {
    const paneIndex = TmuxManager.PANES[pane];
    const target = `${this.sessionName}:main.${paneIndex}`;

    // Use -l flag for literal input to avoid shell interpretation
    // Send command and Enter key separately for reliability
    spawnSync('tmux', ['send-keys', '-t', target, '-l', command]);
    spawnSync('tmux', ['send-keys', '-t', target, 'Enter']);
  }

  /**
   * Wait for Claude Code to be ready in a pane
   * Polls the pane output to detect Claude Code's ready state
   * @param agent - The agent pane to check
   * @param timeoutMs - Maximum time to wait (default: 30000ms)
   * @param pollIntervalMs - Polling interval (default: 500ms)
   * @returns Promise<boolean> - true if Claude is ready, false if timeout
   */
  async waitForClaudeReady(
    agent: AgentName,
    timeoutMs: number = 30000,
    pollIntervalMs: number = 500
  ): Promise<boolean> {
    const startTime = Date.now();
    const paneIndex = TmuxManager.PANES[agent];

    while (Date.now() - startTime < timeoutMs) {
      // Check 1: Is the pane running something other than shell?
      if (this.isPaneActive(agent)) {
        // Check 2: Look for Claude Code ready indicators in pane output
        const output = this.capturePane(agent, 50);

        // Claude Code shows these patterns when ready:
        // - ">" prompt at the start of a line
        // - "╭" box drawing character (UI element)
        // - "Tips:" section appears after startup
        const readyPatterns = [
          /^>/m,           // Input prompt
          /╭/,             // Box drawing (UI ready)
          /Tips:/,         // Tips section shown after ready
          /Type .* or/,    // "Type /help or ..." message
        ];

        for (const pattern of readyPatterns) {
          if (pattern.test(output)) {
            return true;
          }
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    return false;
  }

  /**
   * Start Claude agent in a pane (headless mode)
   * Runs Claude with -p --output-format json for structured output and usage tracking
   */
  startAgent(agent: AgentName, model: AgentModel, promptFile: string, outputDir: string): void {
    // Validate agent name
    if (!isValidAgentName(agent)) {
      throw new Error(`Invalid agent name: ${agent}`);
    }

    // Validate model
    if (!isValidModel(model)) {
      throw new Error(`Invalid model: ${model}`);
    }

    // Validate prompt file exists and is within project root
    const sanitizedPromptFile = sanitizePath(promptFile, this.projectRoot);
    if (!existsSync(sanitizedPromptFile)) {
      throw new Error(`Prompt file does not exist: ${sanitizedPromptFile}`);
    }

    // Validate and ensure output directory exists
    const sanitizedOutputDir = sanitizePath(outputDir, this.projectRoot);
    if (!existsSync(sanitizedOutputDir)) {
      mkdirSync(sanitizedOutputDir, { recursive: true });
    }

    // Build headless command
    // DURE_AGENT_MODE=1 enables hook-based test command blocking
    // -p: print mode (non-interactive)
    // --output-format json: structured output with usage info
    // stderr goes to separate file to avoid corrupting JSON output
    const outputFile = `${sanitizedOutputDir}/output.json`;
    const errorFile = `${sanitizedOutputDir}/error.log`;
    const startCmd = `cd "${this.projectRoot}" && DURE_AGENT_MODE=1 claude -p --output-format json --dangerously-skip-permissions --model ${model} < "${sanitizedPromptFile}" > "${outputFile}" 2> "${errorFile}"`;
    this.sendKeys(agent, startCmd);
  }

  /**
   * Start agent in headless mode
   * No need to wait for ready state since headless mode runs immediately
   */
  startAgentHeadless(
    agent: AgentName,
    model: AgentModel,
    promptFile: string,
    outputDir: string
  ): void {
    this.startAgent(agent, model, promptFile, outputDir);
  }

  /**
   * Start the web server in its pane
   */
  startServer(port: number): void {
    // Validate port
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${port}`);
    }

    const command = `cd "${this.projectRoot}" && node dist/server/index.js --port ${port}`;
    this.sendKeys('server', command);
  }

  /**
   * Display server info in debug shell
   * Shows the web server URL and API documentation URL
   */
  showServerInfo(port: number): void {
    // Validate port
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${port}`);
    }

    const commands = [
      'echo ""',
      `echo "Server:   http://localhost:${port}"`,
      `echo "API Docs: http://localhost:${port}/api-docs"`,
      'echo ""',
    ];
    this.sendKeys('debug', commands.join(' && '));
  }

  /**
   * Kill the tmux session
   */
  killSession(): void {
    if (this.sessionExists()) {
      spawnSync('tmux', ['kill-session', '-t', this.sessionName], { stdio: 'ignore' });
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
   * List all dure sessions
   */
  static listSessions(sessionPrefix: string): string[] {
    try {
      // Sanitize session prefix
      const sanitizedPrefix = sanitizeSessionName(sessionPrefix);

      const result = spawnSync('tmux', ['list-sessions', '-F', '#{session_name}'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (result.status !== 0 || !result.stdout) {
        return [];
      }

      return result.stdout
        .trim()
        .split('\n')
        .filter(s => s.startsWith(sanitizedPrefix));
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

    // Validate history lines
    const safeHistoryLines = Math.min(Math.max(1, Math.floor(historyLines)), 10000);

    const paneIndex = TmuxManager.PANES[pane];
    const target = `${this.sessionName}:main.${paneIndex}`;

    try {
      const result = spawnSync('tmux', [
        'capture-pane', '-t', target,
        '-p',
        '-S', `-${safeHistoryLines}`,
      ], {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return result.stdout || '';
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
      const result = spawnSync('tmux', [
        'list-panes', '-t', `${this.sessionName}:main`,
        '-F', '#{pane_index}:#{pane_current_command}',
      ], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!result.stdout) {
        return false;
      }

      const lines = result.stdout.trim().split('\n');
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

  /**
   * Resume an agent after VCR response (headless mode)
   * Runs a new headless session with the VCR continuation prompt
   * @param agent - The agent to resume
   * @param model - The model to use
   * @param promptFile - Path to the continuation prompt file
   * @param outputDir - Directory to write output.json
   */
  restartAgentWithVCR(
    agent: AgentName,
    model: AgentModel,
    promptFile: string,
    outputDir: string
  ): void {
    // Validate agent name
    if (!isValidAgentName(agent)) {
      throw new Error(`Invalid agent name: ${agent}`);
    }

    // Validate model
    if (!isValidModel(model)) {
      throw new Error(`Invalid model: ${model}`);
    }

    // Validate prompt file exists
    const sanitizedPromptFile = sanitizePath(promptFile, this.projectRoot);
    if (!existsSync(sanitizedPromptFile)) {
      throw new Error(`Prompt file does not exist: ${sanitizedPromptFile}`);
    }

    // Validate and ensure output directory exists
    const sanitizedOutputDir = sanitizePath(outputDir, this.projectRoot);
    if (!existsSync(sanitizedOutputDir)) {
      mkdirSync(sanitizedOutputDir, { recursive: true });
    }

    // Run headless with continuation prompt
    // stderr goes to separate file to avoid corrupting JSON output
    const outputFile = `${sanitizedOutputDir}/output.json`;
    const errorFile = `${sanitizedOutputDir}/error.log`;
    const startCmd = `cd "${this.projectRoot}" && DURE_AGENT_MODE=1 claude -p --output-format json --dangerously-skip-permissions --model ${model} < "${sanitizedPromptFile}" > "${outputFile}" 2> "${errorFile}"`;
    this.sendKeys(agent, startCmd);
  }

  /**
   * Update pane borders to show model information
   * @param modelSelection - Model selection result with models and strategy
   */
  updatePaneBordersWithModels(modelSelection: {
    models: Record<AgentName, AgentModel>;
    analysis: { level: string };
    selection_method: string;
  }): void {
    if (!this.sessionExists()) {
      return;
    }

    const { models, analysis, selection_method } = modelSelection;

    // Build the header format string
    const parts: string[] = [];
    const agents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];

    for (const agent of agents) {
      const model = models[agent];
      const agentName = agent.charAt(0).toUpperCase() + agent.slice(1);
      parts.push(`${agentName}: ${model}`);
    }

    const headerText = `${parts.join(' | ')} [${analysis.level}/${selection_method}]`;

    // Update pane border format to show the model header
    try {
      spawnSync('tmux', [
        'set-option', '-t', this.sessionName,
        'pane-border-format', ` #{pane_index}: #{pane_title} | ${headerText} `,
      ], { stdio: 'ignore' });
    } catch {
      // Ignore errors if tmux command fails
    }
  }
}
