#!/usr/bin/env node
/**
 * TUI Entry Point
 *
 * Standalone TUI dashboard for monitoring Dure runs.
 * Can be started independently or via `dure start --tui`.
 * Supports full standalone operation: create runs, switch runs, submit VCR.
 */
import React from 'react';
import { render, Instance } from 'ink';
import { App } from './App.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { TmuxManager } from '../../core/tmux-manager.js';
import { StateManager } from '../../core/state-manager.js';
import { RunManager } from '../../core/run-manager.js';
import { DashboardDataProvider } from '../../core/dashboard-data-provider.js';
import { ConfigManager } from '../../config/config-manager.js';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import type { RunListItem, MRPEvidence, VCR, CRP, AgentName } from '../../types/index.js';

interface TUIOptions {
  projectRoot: string;
  runId?: string;
}

interface TUIState {
  projectRoot: string;
  configManager: ConfigManager;
  runManager: RunManager;
  orchestrator: Orchestrator | null;
  provider: DashboardDataProvider | null;
  currentRunId: string | null;
  runs: RunListItem[];
  mrpEvidence: MRPEvidence | null;
  currentCRP: CRP | null;
  inkInstance: Instance | null;
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
 * Create dashboard provider for a specific run
 */
function createProvider(state: TUIState, runId: string): DashboardDataProvider {
  const config = state.configManager.loadConfig();
  const sessionName = config.global.tmux_session_prefix;
  const runDir = join(state.projectRoot, '.dure', 'runs', runId);

  const tmuxManager = new TmuxManager(sessionName, state.projectRoot, runId);
  const stateManager = new StateManager(runDir);

  return new DashboardDataProvider(
    tmuxManager,
    stateManager,
    runDir,
    {
      pollingIntervalMs: 500,
      outputLines: 50,
      projectRoot: state.projectRoot,
    }
  );
}

/**
 * Load runs list
 */
async function loadRuns(state: TUIState): Promise<void> {
  state.runs = await state.runManager.listRuns();
}

/**
 * Load MRP evidence for current run
 */
async function loadMRPEvidence(state: TUIState): Promise<void> {
  if (!state.currentRunId) {
    state.mrpEvidence = null;
    return;
  }

  state.mrpEvidence = await state.runManager.readMRPEvidence(state.currentRunId);
}

/**
 * Load current CRP for run
 */
async function loadCurrentCRP(state: TUIState): Promise<void> {
  if (!state.currentRunId) {
    state.currentCRP = null;
    return;
  }

  const crps = await state.runManager.listCRPs(state.currentRunId);
  state.currentCRP = crps.find(crp => crp.status === 'pending') || null;
}

/**
 * Switch to a different run
 */
function switchToRun(state: TUIState, runId: string): void {
  // Cleanup old provider
  if (state.provider) {
    state.provider.destroy();
  }

  // Create new provider
  state.currentRunId = runId;
  state.provider = createProvider(state, runId);

  // Re-render
  rerenderApp(state);
}

/**
 * Re-render the app with current state
 */
function rerenderApp(state: TUIState): void {
  if (!state.inkInstance) return;

  state.inkInstance.rerender(
    <App
      provider={state.provider}
      onDetach={() => handleDetach(state)}
      onNewRun={(briefing) => handleNewRun(state, briefing)}
      onSelectRun={(runId) => handleSelectRun(state, runId)}
      onStopRun={() => handleStopRun(state)}
      onSubmitVCR={(vcr) => handleSubmitVCR(state, vcr)}
      onRerunAgent={(agent) => handleRerunAgent(state, agent)}
      runs={state.runs}
      mrpEvidence={state.mrpEvidence}
      currentCRP={state.currentCRP}
    />
  );
}

/**
 * Handle detach
 */
function handleDetach(state: TUIState): void {
  if (state.provider) {
    state.provider.destroy();
  }
  exitAlternateScreen();
  console.log('Detached from Dure TUI.');
  if (state.currentRunId) {
    console.log(`Run continues in background: ${state.currentRunId}`);
  }
  console.log('To reattach: dure monitor');
}

/**
 * Handle new run creation
 */
async function handleNewRun(state: TUIState, briefing: string): Promise<string> {
  const config = state.configManager.loadConfig();

  // Create orchestrator if not exists
  if (!state.orchestrator) {
    state.orchestrator = new Orchestrator(state.projectRoot, config);
  }

  // Start the run
  const runId = await state.orchestrator.startRun(briefing);

  // Switch to the new run
  switchToRun(state, runId);

  // Reload runs list
  await loadRuns(state);
  rerenderApp(state);

  return runId;
}

/**
 * Handle run selection
 */
async function handleSelectRun(state: TUIState, runId: string): Promise<void> {
  switchToRun(state, runId);
  await loadMRPEvidence(state);
  await loadCurrentCRP(state);
  rerenderApp(state);
}

/**
 * Handle stop run
 */
async function handleStopRun(state: TUIState): Promise<void> {
  if (state.orchestrator) {
    await state.orchestrator.stopRun();
  }
  await loadRuns(state);
  rerenderApp(state);
}

/**
 * Handle VCR submission
 */
async function handleSubmitVCR(state: TUIState, vcr: VCR): Promise<void> {
  if (!state.currentRunId) {
    throw new Error('No run selected');
  }

  await state.runManager.saveVCR(state.currentRunId, vcr);

  // Resume orchestrator if it's waiting for human input
  if (state.orchestrator) {
    await state.orchestrator.resumeRun(state.currentRunId);
  }

  // Reload CRP state
  await loadCurrentCRP(state);
  rerenderApp(state);
}

/**
 * Handle agent rerun
 */
async function handleRerunAgent(state: TUIState, agent: AgentName): Promise<void> {
  if (!state.orchestrator) {
    // Need orchestrator to rerun - create one if we have a config
    const config = state.configManager.loadConfig();
    state.orchestrator = new Orchestrator(state.projectRoot, config);
  }

  await state.orchestrator.rerunAgent(agent);
  rerenderApp(state);
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
    console.error('Run "dure init" to initialize.');
    process.exit(1);
  }

  const config = configManager.loadConfig();

  // Initialize run manager
  const runManager = new RunManager(projectRoot);

  // Find initial run ID
  let runId = options.runId;
  if (!runId) {
    runId = findLatestRunId(projectRoot) ?? undefined;
  }

  // Initialize state
  const state: TUIState = {
    projectRoot,
    configManager,
    runManager,
    orchestrator: null,
    provider: null,
    currentRunId: runId ?? null,
    runs: [],
    mrpEvidence: null,
    currentCRP: null,
    inkInstance: null,
  };

  // Create provider if we have a run
  if (runId) {
    const runDir = join(projectRoot, '.dure', 'runs', runId);
    if (existsSync(runDir)) {
      state.provider = createProvider(state, runId);
    }
  }

  // Load initial data
  await loadRuns(state);
  if (state.currentRunId) {
    await loadMRPEvidence(state);
    await loadCurrentCRP(state);
  }

  // Enter fullscreen mode (alternate screen buffer)
  enterAlternateScreen();

  // Render the app
  state.inkInstance = render(
    <App
      provider={state.provider}
      onDetach={() => handleDetach(state)}
      onNewRun={(briefing) => handleNewRun(state, briefing)}
      onSelectRun={(runId) => handleSelectRun(state, runId)}
      onStopRun={() => handleStopRun(state)}
      onSubmitVCR={(vcr) => handleSubmitVCR(state, vcr)}
      onRerunAgent={(agent) => handleRerunAgent(state, agent)}
      runs={state.runs}
      mrpEvidence={state.mrpEvidence}
      currentCRP={state.currentCRP}
    />
  );

  // Wait for exit
  await state.inkInstance.waitUntilExit();

  // Cleanup
  if (state.provider) {
    state.provider.destroy();
  }
  if (state.orchestrator) {
    await state.orchestrator.stopRun();
  }
  exitAlternateScreen();
}

// Run
main().catch((error) => {
  // Make sure to exit alternate screen on error
  process.stdout.write('\x1b[?1049l');
  console.error('TUI Error:', error);
  process.exit(1);
});
