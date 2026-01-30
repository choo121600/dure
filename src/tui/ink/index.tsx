#!/usr/bin/env node
/**
 * TUI Entry Point
 *
 * Standalone TUI dashboard with tab navigation for Kanban/Run/History.
 * Integrates MissionManager for mission lifecycle management.
 */
import React from 'react';
import { render, Instance } from 'ink';
import { App } from './App.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { TmuxManager } from '../../core/tmux-manager.js';
import { StateManager } from '../../core/state-manager.js';
import { RunManager } from '../../core/run-manager.js';
import { MissionManager } from '../../core/mission-manager.js';
import { DashboardDataProvider } from '../../core/dashboard-data-provider.js';
import { ConfigManager } from '../../config/config-manager.js';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import { isOk, isErr } from '../../types/result.js';
import type { RunListItem, MRPEvidence, VCR, CRP, AgentName, MissionId, TaskId } from '../../types/index.js';
import type { Mission, MissionTask, MissionPhase } from '../../types/mission.js';

interface TUIOptions {
  projectRoot: string;
  runId?: string;
  missionId?: string;
}

interface TaskContext {
  taskId: TaskId;
  taskTitle: string;
  phaseNumber: number;
}

interface TUIState {
  projectRoot: string;
  configManager: ConfigManager;
  runManager: RunManager;
  missionManager: MissionManager;
  orchestrator: Orchestrator | null;
  provider: DashboardDataProvider | null;
  // Mission state
  activeMission: Mission | null;
  missions: Mission[];
  // Run state
  currentRunId: string | null;
  runs: RunListItem[];
  mrpEvidence: MRPEvidence | null;
  currentCRP: CRP | null;
  // Task context for runs from kanban
  taskContext: TaskContext | null;
  // Ink instance
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
    } else if (arg === '--mission-id' && args[i + 1]) {
      options.missionId = args[++i];
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
 * Load missions list
 */
async function loadMissions(state: TUIState): Promise<void> {
  const result = await state.missionManager.listMissions();
  if (isOk(result)) {
    state.missions = result.data;
  } else {
    state.missions = [];
  }
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
      projectRoot={state.projectRoot}
      provider={state.provider}
      activeMission={state.activeMission}
      missions={state.missions}
      runs={state.runs}
      mrpEvidence={state.mrpEvidence}
      currentCRP={state.currentCRP}
      taskContext={state.taskContext}
      onNewMission={(description) => handleNewMission(state, description)}
      onSelectMission={(missionId) => handleSelectMission(state, missionId)}
      onRunTask={(taskId) => handleRunTask(state, taskId)}
      onRetryTask={(taskId) => handleRetryTask(state, taskId)}
      onSkipTask={(taskId) => handleSkipTask(state, taskId)}
      onSelectRun={(runId) => handleSelectRun(state, runId)}
      onStopRun={() => handleStopRun(state)}
      onSubmitVCR={(vcr) => handleSubmitVCR(state, vcr)}
      onRerunAgent={(agent) => handleRerunAgent(state, agent)}
      onDetach={() => handleDetach(state)}
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
  if (state.activeMission) {
    console.log(`Active mission: ${state.activeMission.mission_id}`);
  }
  console.log('To reattach: dure monitor');
}

/**
 * Handle new mission creation
 */
async function handleNewMission(state: TUIState, description: string): Promise<string> {
  const result = await state.missionManager.createMission(description);
  if (isErr(result)) {
    throw new Error(result.error.message);
  }

  state.activeMission = result.data;
  await loadMissions(state);
  rerenderApp(state);

  return result.data.mission_id;
}

/**
 * Handle mission selection
 */
async function handleSelectMission(state: TUIState, missionId: MissionId): Promise<void> {
  const result = await state.missionManager.getMission(missionId);
  if (isOk(result)) {
    state.activeMission = result.data;
    state.taskContext = null; // Clear task context when switching missions
    rerenderApp(state);
  }
}

/**
 * Handle task run from kanban
 */
async function handleRunTask(state: TUIState, taskId: TaskId): Promise<void> {
  if (!state.activeMission) {
    throw new Error('No active mission');
  }

  // Find the task in the mission
  let targetTask: MissionTask | undefined;
  let targetPhase: MissionPhase | undefined;

  for (const phase of state.activeMission.phases) {
    const task = phase.tasks.find(t => t.task_id === taskId);
    if (task) {
      targetTask = task;
      targetPhase = phase;
      break;
    }
  }

  if (!targetTask || !targetPhase) {
    throw new Error(`Task ${taskId} not found`);
  }

  // Set task context
  state.taskContext = {
    taskId: taskId,
    taskTitle: targetTask.title,
    phaseNumber: targetPhase.number,
  };

  // Start the task run
  const result = await state.missionManager.runTask(state.activeMission.mission_id, taskId);
  if (isErr(result)) {
    throw new Error(result.error.message);
  }

  // Switch to the run
  if (result.data.runId) {
    switchToRun(state, result.data.runId);
  }

  // Reload mission to get updated state
  const missionResult = await state.missionManager.getMission(state.activeMission.mission_id);
  if (isOk(missionResult)) {
    state.activeMission = missionResult.data;
  }

  await loadRuns(state);
  rerenderApp(state);
}

/**
 * Handle task retry from kanban
 */
async function handleRetryTask(state: TUIState, taskId: TaskId): Promise<void> {
  if (!state.activeMission) {
    throw new Error('No active mission');
  }

  const result = await state.missionManager.retryTask(state.activeMission.mission_id, taskId);
  if (isErr(result)) {
    throw new Error(result.error.message);
  }

  // Reload mission to get updated state
  const missionResult = await state.missionManager.getMission(state.activeMission.mission_id);
  if (isOk(missionResult)) {
    state.activeMission = missionResult.data;
  }

  await loadRuns(state);
  rerenderApp(state);
}

/**
 * Handle task skip from kanban
 */
async function handleSkipTask(state: TUIState, taskId: TaskId): Promise<void> {
  if (!state.activeMission) {
    throw new Error('No active mission');
  }

  const result = await state.missionManager.skipTask(state.activeMission.mission_id, taskId);
  if (isErr(result)) {
    throw new Error(result.error.message);
  }

  // Reload mission to get updated state
  const missionResult = await state.missionManager.getMission(state.activeMission.mission_id);
  if (isOk(missionResult)) {
    state.activeMission = missionResult.data;
  }

  rerenderApp(state);
}

/**
 * Handle run selection (from history or list)
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
  state.taskContext = null; // Clear task context
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

  // Initialize managers
  const runManager = new RunManager(projectRoot);
  const missionManager = new MissionManager(projectRoot);

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
    missionManager,
    orchestrator: null,
    provider: null,
    activeMission: null,
    missions: [],
    currentRunId: runId ?? null,
    runs: [],
    mrpEvidence: null,
    currentCRP: null,
    taskContext: null,
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
  await loadMissions(state);

  // Load active mission if specified or find most recent
  if (options.missionId) {
    const missionResult = await missionManager.getMission(options.missionId as MissionId);
    if (isOk(missionResult)) {
      state.activeMission = missionResult.data;
    }
  } else if (state.missions.length > 0) {
    // Use most recent non-completed mission, or most recent if all completed
    const activeMission = state.missions.find(m => m.status !== 'completed' && m.status !== 'failed')
      || state.missions[0];
    state.activeMission = activeMission || null;
  }

  if (state.currentRunId) {
    await loadMRPEvidence(state);
    await loadCurrentCRP(state);
  }

  // Enter fullscreen mode (alternate screen buffer)
  enterAlternateScreen();

  // Render the app
  state.inkInstance = render(
    <App
      projectRoot={state.projectRoot}
      provider={state.provider}
      activeMission={state.activeMission}
      missions={state.missions}
      runs={state.runs}
      mrpEvidence={state.mrpEvidence}
      currentCRP={state.currentCRP}
      taskContext={state.taskContext}
      onNewMission={(description) => handleNewMission(state, description)}
      onSelectMission={(missionId) => handleSelectMission(state, missionId)}
      onRunTask={(taskId) => handleRunTask(state, taskId)}
      onRetryTask={(taskId) => handleRetryTask(state, taskId)}
      onSkipTask={(taskId) => handleSkipTask(state, taskId)}
      onSelectRun={(runId) => handleSelectRun(state, runId)}
      onStopRun={() => handleStopRun(state)}
      onSubmitVCR={(vcr) => handleSubmitVCR(state, vcr)}
      onRerunAgent={(agent) => handleRerunAgent(state, agent)}
      onDetach={() => handleDetach(state)}
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
