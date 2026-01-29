#!/usr/bin/env node
/**
 * TUI Entry Point
 *
 * Standalone TUI dashboard for monitoring Dure runs.
 * Can be started independently or via `dure start --tui`.
 */
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { TmuxManager } from '../../core/tmux-manager.js';
import { StateManager } from '../../core/state-manager.js';
import { DashboardDataProvider } from '../../core/dashboard-data-provider.js';
import { ConfigManager } from '../../config/config-manager.js';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';

interface TUIOptions {
  projectRoot: string;
  runId?: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): TUIOptions {
  const args = process.argv.slice(2);
  const options: TUIOptions = {
    projectRoot: process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project-root' && args[i + 1]) {
      options.projectRoot = args[++i];
    } else if (arg === '--run-id' && args[i + 1]) {
      options.runId = args[++i];
    } else if (!arg.startsWith('-')) {
      // Assume it's a run ID if not a flag
      options.runId = arg;
    }
  }

  return options;
}

/**
 * Find the latest run ID
 */
function findLatestRunId(projectRoot: string): string | null {
  const runsDir = join(projectRoot, '.dure', 'runs');
  if (!existsSync(runsDir)) {
    return null;
  }

  try {
    const runs = readdirSync(runsDir)
      .filter(name => name.startsWith('run-'))
      .sort()
      .reverse();

    return runs[0] || null;
  } catch {
    return null;
  }
}

/**
 * Enter alternate screen buffer for fullscreen TUI
 */
function enterAlternateScreen(): void {
  process.stdout.write('\x1b[?1049h'); // Switch to alternate screen
  process.stdout.write('\x1b[2J');     // Clear screen
  process.stdout.write('\x1b[H');      // Move cursor to home
}

/**
 * Exit alternate screen buffer, restore main screen
 */
function exitAlternateScreen(): void {
  process.stdout.write('\x1b[?1049l'); // Switch back to main screen
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const options = parseArgs();
  const { projectRoot } = options;

  // Initialize configuration
  const configManager = new ConfigManager(projectRoot);
  if (!configManager.configExists()) {
    console.error('Error: Dure is not initialized in this project.');
    console.error('Run "dure start" to initialize.');
    process.exit(1);
  }

  const config = configManager.loadConfig();
  const sessionName = config.global.tmux_session_prefix;

  // Find run ID
  let runId = options.runId;
  if (!runId) {
    runId = findLatestRunId(projectRoot) ?? undefined;
    if (!runId) {
      console.error('Error: No runs found.');
      console.error('Start a new run with "dure run <briefing>".');
      process.exit(1);
    }
  }

  const runDir = join(projectRoot, '.dure', 'runs', runId);
  if (!existsSync(runDir)) {
    console.error(`Error: Run directory not found: ${runDir}`);
    process.exit(1);
  }

  // Initialize managers
  const tmuxManager = new TmuxManager(sessionName, projectRoot, runId);
  const stateManager = new StateManager(runDir);

  // Create dashboard data provider
  const provider = new DashboardDataProvider(
    tmuxManager,
    stateManager,
    runDir,
    {
      pollingIntervalMs: 500,
      outputLines: 50,
      projectRoot,
    }
  );

  // Enter fullscreen mode (alternate screen buffer)
  enterAlternateScreen();

  // Handle detach
  const handleDetach = (): void => {
    provider.destroy();
    exitAlternateScreen();
    console.log('Detached from Dure TUI.');
    console.log(`Run continues in background: ${runId}`);
    console.log('To reattach: dure monitor');
  };

  // Render the app
  const { waitUntilExit } = render(
    <App provider={provider} onDetach={handleDetach} />
  );

  // Wait for exit
  await waitUntilExit();

  // Cleanup
  provider.destroy();
  exitAlternateScreen();
}

// Run
main().catch((error) => {
  // Make sure to exit alternate screen on error
  process.stdout.write('\x1b[?1049l');
  console.error('TUI Error:', error);
  process.exit(1);
});
