import chalk from 'chalk';
import { RunManager } from '../../core/run-manager.js';
import { StateManager } from '../../core/state-manager.js';
import { TmuxManager } from '../../core/tmux-manager.js';
import { ConfigManager } from '../../config/config-manager.js';

export async function stopCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const runManager = new RunManager(projectRoot);
  const configManager = new ConfigManager(projectRoot);
  const config = configManager.loadConfig();

  // Kill the main tmux session
  const tmuxManager = new TmuxManager(
    config.global.tmux_session_prefix,
    projectRoot
  );

  if (!tmuxManager.sessionExists()) {
    console.log(chalk.yellow('No Orchestral session is running.'));
    return;
  }

  // Update active run state if exists
  const activeRun = await runManager.getActiveRun();
  if (activeRun) {
    console.log(chalk.gray(`Stopping run: ${activeRun.run_id}...`));

    const runDir = runManager.getRunDir(activeRun.run_id);
    const stateManager = new StateManager(runDir);
    const state = await stateManager.loadState();

    if (state) {
      state.phase = 'failed';
      state.history.push({
        phase: state.phase,
        result: 'stopped_by_user',
        timestamp: new Date().toISOString(),
      });
      await stateManager.saveState(state);
    }
  }

  // Kill tmux session
  tmuxManager.killSession();
  console.log(chalk.gray('Tmux session terminated.'));

  console.log(chalk.green('✓ Orchestral stopped.'));
}
