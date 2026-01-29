/**
 * TUI Application - Main orchestration and screen management
 *
 * This is the core TUI application that manages:
 * - Screen lifecycle and transitions
 * - Orchestrator event handling
 * - Component coordination
 * - Error handling and graceful shutdown
 */

import blessed from 'blessed';
import { EventEmitter } from 'events';
import { setupKeybindings, type KeyHandler } from './utils/keybindings.js';
import { createDashboard, type DashboardComponent } from './components/dashboard.js';
import { createStatusBar, type StatusBarComponent, type TuiMode } from './components/status-bar.js';
import { createCrpNotification, type CrpNotificationComponent } from './components/crp-notification.js';
import { TuiStateManager } from './state/tui-state.js';
import { createNewRunScreen, type NewRunScreen } from './screens/new-run.js';
import { createCrpRespondScreen, type CrpRespondScreen } from './screens/crp-respond.js';
import { createMrpViewScreen, type MrpViewScreen } from './screens/mrp-view.js';
import { createRunListScreen, type RunListScreen } from './screens/run-list.js';
import { ConfigManager } from '../config/config-manager.js';
import { RunManager } from '../core/run-manager.js';
import { Orchestrator, type OrchestratorEvent } from '../core/orchestrator.js';
import { TmuxManager } from '../core/tmux-manager.js';
import type { RunState, CRP, OrchestraConfig } from '../types/index.js';
import type { TuiLogger } from './utils/tui-logger.js';

export interface TuiAppOptions {
  projectRoot: string;
  logger?: TuiLogger;
}

export interface TuiAppEvents {
  error: (error: Error) => void;
  exit: (code: number) => void;
}

export interface TuiApp extends EventEmitter {
  screen: blessed.Widgets.Screen;
  orchestrator: Orchestrator;
  runManager: RunManager;
  config: OrchestraConfig;
  start: () => Promise<void>;
  destroy: () => Promise<void>;
  on<E extends keyof TuiAppEvents>(event: E, listener: TuiAppEvents[E]): this;
  emit<E extends keyof TuiAppEvents>(event: E, ...args: Parameters<TuiAppEvents[E]>): boolean;
}

interface ScreenState {
  currentMode: TuiMode;
  newRunScreen: NewRunScreen | null;
  crpRespondScreen: CrpRespondScreen | null;
  mrpViewScreen: MrpViewScreen | null;
  runListScreen: RunListScreen | null;
  pendingCrp: CRP | null;
}

/**
 * Create and initialize the TUI application
 */
export async function createTuiApp(options: TuiAppOptions): Promise<TuiApp> {
  const { projectRoot, logger } = options;
  const emitter = new EventEmitter() as TuiApp;

  // Initialize configuration
  const configManager = new ConfigManager(projectRoot);
  configManager.initialize();
  const config = configManager.loadConfig();

  // Initialize managers
  const runManager = new RunManager(projectRoot);
  runManager.initialize();

  const orchestrator = new Orchestrator(projectRoot, config);

  // Create blessed screen
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Dure TUI',
    fullUnicode: true,
  });

  // Screen state
  const state: ScreenState = {
    currentMode: 'viewing',
    newRunScreen: null,
    crpRespondScreen: null,
    mrpViewScreen: null,
    runListScreen: null,
    pendingCrp: null,
  };

  // Create header
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{center}{bold}Dure TUI{/bold}{/center}',
    tags: true,
    style: {
      fg: 'white',
      bg: 'blue',
    },
  });

  // Create main components
  const dashboard = createDashboard({
    parent: screen,
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-13',
  });

  const crpNotification = createCrpNotification({
    parent: screen,
    top: '100%-10',
    left: 0,
    width: '100%',
    height: 7,
  });

  const statusBar = createStatusBar({
    parent: screen,
  });

  // Create state manager for file watching
  const stateManager = new TuiStateManager({
    projectRoot,
  });

  // ============ State Change Handlers ============

  function handleStateChanged(runState: RunState | null): void {
    dashboard.update(runState);

    if (runState) {
      header.setContent(
        `{center}{bold}Dure TUI{/bold} | {gray-fg}${projectRoot}{/gray-fg}{/center}`
      );
    } else {
      header.setContent('{center}{bold}Dure TUI{/bold} | {yellow-fg}No active run{/yellow-fg}{/center}');
    }

    screen.render();
  }

  function handleCrpPending(crp: CRP | null): void {
    state.pendingCrp = crp;
    statusBar.setCrpPending(!!crp);

    if (crp) {
      crpNotification.show(crp);
    } else {
      crpNotification.hide();
    }
  }

  function handleError(error: Error): void {
    logger?.error('State manager error', error);
    statusBar.setMessage(`Error: ${error.message}`);
    setTimeout(() => statusBar.clearMessage(), 3000);
    emitter.emit('error', error);
  }

  // ============ Orchestrator Event Handler ============

  function handleOrchestratorEvent(event: OrchestratorEvent): void {
    switch (event.type) {
      case 'run_started':
        statusBar.setMessage(`Run started: ${event.runId}`);
        stateManager.setCurrentRun(event.runId);
        break;

      case 'phase_changed':
        statusBar.setMessage(`Phase: ${event.phase}`);
        stateManager.refresh();
        break;

      case 'agent_started':
        statusBar.setMessage(`${event.agent} started`);
        break;

      case 'agent_completed':
        statusBar.setMessage(`${event.agent} completed`);
        stateManager.refresh();
        break;

      case 'crp_created':
        statusBar.setMessage(`CRP created: ${event.crpId}`);
        statusBar.setCrpPending(true);
        stateManager.refresh();
        // Terminal bell for attention
        process.stdout.write('\x07');
        break;

      case 'mrp_ready':
        statusBar.setMessage('MRP ready!');
        stateManager.refresh();
        process.stdout.write('\x07');
        break;

      case 'run_completed':
        statusBar.setMessage(`Run completed: ${event.verdict}`);
        stateManager.refresh();
        process.stdout.write('\x07');
        break;

      case 'error':
        logger?.error('Orchestrator error', new Error(event.error));
        statusBar.setMessage(`Error: ${event.error}`);
        break;
    }

    setTimeout(() => statusBar.clearMessage(), 3000);
    screen.render();
  }

  // ============ Screen Transition Helpers ============

  function setMode(mode: TuiMode): void {
    state.currentMode = mode;
    statusBar.setMode(mode);
  }

  function returnToViewing(): void {
    setMode('viewing');
    statusBar.clearMessage();
  }

  // ============ Key Handlers ============

  const keyHandlers: KeyHandler[] = [
    {
      key: 'n',
      description: 'New run',
      handler: () => {
        if (orchestrator.getIsRunning()) {
          statusBar.setMessage('A run is already in progress');
          setTimeout(() => statusBar.clearMessage(), 2000);
          return;
        }

        setMode('input');

        state.newRunScreen = createNewRunScreen({
          screen,
          orchestrator,
          onSuccess: (runId: string) => {
            returnToViewing();
            statusBar.setMessage(`Run started: ${runId}`);
            stateManager.setCurrentRun(runId);
            setTimeout(() => statusBar.clearMessage(), 3000);
          },
          onCancel: () => returnToViewing(),
          onError: (error: Error) => {
            logger?.error('New run error', error);
            returnToViewing();
            statusBar.setMessage(`Error: ${error.message}`);
            setTimeout(() => statusBar.clearMessage(), 5000);
          },
        });

        state.newRunScreen.show();
      },
    },
    {
      key: 'l',
      description: 'List runs',
      handler: async () => {
        const runs = await stateManager.listRuns();

        if (runs.length === 0) {
          statusBar.setMessage('No runs found');
          setTimeout(() => statusBar.clearMessage(), 2000);
          return;
        }

        setMode('list');

        state.runListScreen = createRunListScreen({
          screen,
          stateManager,
          onSelect: async (runId: string) => {
            returnToViewing();
            await stateManager.setCurrentRun(runId);
            statusBar.setMessage(`Switched to run: ${runId}`);
            setTimeout(() => statusBar.clearMessage(), 2000);
          },
          onCancel: () => returnToViewing(),
        });

        await state.runListScreen.show();
      },
    },
    {
      key: 'c',
      description: 'CRP response',
      handler: async () => {
        const currentState = stateManager.getState();
        const runId = stateManager.getCurrentRunId();

        if (!currentState?.pending_crp || !runId) {
          statusBar.setMessage('No pending CRP');
          setTimeout(() => statusBar.clearMessage(), 2000);
          return;
        }

        const crp = await stateManager.getCrp(currentState.pending_crp);
        if (!crp) {
          statusBar.setMessage('Failed to load CRP');
          setTimeout(() => statusBar.clearMessage(), 2000);
          return;
        }

        setMode('crp');

        state.crpRespondScreen = createCrpRespondScreen({
          screen,
          orchestrator,
          runManager,
          onSuccess: (vcrId: string) => {
            returnToViewing();
            statusBar.setMessage(`VCR submitted: ${vcrId}`);
            statusBar.setCrpPending(false);
            crpNotification.hide();
            state.pendingCrp = null;
            stateManager.refresh();
            setTimeout(() => statusBar.clearMessage(), 3000);
          },
          onCancel: () => returnToViewing(),
          onError: (error: Error) => {
            logger?.error('CRP respond error', error);
            returnToViewing();
            statusBar.setMessage(`Error: ${error.message}`);
            setTimeout(() => statusBar.clearMessage(), 5000);
          },
        });

        state.crpRespondScreen.show(runId, crp);
      },
    },
    {
      key: 'm',
      description: 'MRP viewer',
      handler: async () => {
        const runId = stateManager.getCurrentRunId();

        if (!runId) {
          statusBar.setMessage('No active run');
          setTimeout(() => statusBar.clearMessage(), 2000);
          return;
        }

        setMode('mrp');

        state.mrpViewScreen = createMrpViewScreen({
          screen,
          runManager,
          onClose: () => returnToViewing(),
          onError: (error: Error) => {
            logger?.error('MRP view error', error);
            returnToViewing();
            statusBar.setMessage(`Error: ${error.message}`);
            setTimeout(() => statusBar.clearMessage(), 5000);
          },
        });

        await state.mrpViewScreen.show(runId);
      },
    },
    {
      key: 's',
      description: 'Stop',
      handler: async () => {
        if (orchestrator.getIsRunning()) {
          statusBar.setMessage('Stopping run...');
          try {
            await orchestrator.stopRun();
            logger?.info('Run stopped by user');
            statusBar.setMessage('Run stopped');
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger?.error('Failed to stop run', err);
            statusBar.setMessage(`Error: ${err.message}`);
          }
        } else {
          statusBar.setMessage('No run in progress');
        }
        setTimeout(() => statusBar.clearMessage(), 2000);
      },
    },
    {
      key: 'r',
      description: 'Refresh',
      handler: async () => {
        statusBar.setMessage('Refreshing...');
        await stateManager.refresh();
        statusBar.clearMessage();
      },
    },
    {
      key: 'q',
      description: 'Quit',
      handler: async () => {
        await destroy();
      },
    },
  ];

  // ============ Cleanup and Destruction ============

  async function destroy(): Promise<void> {
    logger?.info('TUI destroy initiated');

    // Stop orchestrator if running
    if (orchestrator.getIsRunning()) {
      try {
        await orchestrator.stopRun();
        logger?.info('Orchestrator stopped during destroy');
      } catch (error) {
        logger?.warn('Error stopping orchestrator during destroy', error instanceof Error ? error : undefined);
      }
    }

    // Always kill tmux session (even if orchestrator is not running)
    // This handles the case where a run completed but tmux session still exists
    const tmuxManager = new TmuxManager(
      config.global.tmux_session_prefix,
      projectRoot
    );
    if (tmuxManager.sessionExists()) {
      tmuxManager.killSession();
    }

    // Stop state manager (file watcher)
    await stateManager.stop();

    // Clean up screens
    state.newRunScreen?.destroy();
    state.crpRespondScreen?.destroy();
    state.mrpViewScreen?.destroy();
    state.runListScreen?.destroy();

    // Destroy blessed screen
    screen.destroy();

    emitter.emit('exit', 0);
  }

  // ============ Initialization ============

  async function start(): Promise<void> {
    // Setup event listeners
    stateManager.on('stateChanged', handleStateChanged);
    stateManager.on('crpPending', handleCrpPending);
    stateManager.on('error', handleError);

    orchestrator.on('orchestrator_event', handleOrchestratorEvent);

    // Setup keybindings
    setupKeybindings(screen, keyHandlers);

    // Also allow Ctrl+C to exit
    screen.key(['C-c'], async () => {
      await destroy();
    });

    // Start state manager (begins file watching)
    await stateManager.start();

    // Initial render
    screen.render();
  }

  // Build the TuiApp interface
  Object.assign(emitter, {
    screen,
    orchestrator,
    runManager,
    config,
    start,
    destroy,
  });

  return emitter;
}
