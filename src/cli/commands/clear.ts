import chalk from 'chalk';
import { RunManager } from '../../core/run-manager.js';
import { StateManager } from '../../core/state-manager.js';
import { TmuxManager } from '../../core/tmux-manager.js';
import { ConfigManager } from '../../config/config-manager.js';
import { CleanupManager } from '../../core/cleanup-manager.js';

/**
 * Clear Run Command
 *
 * Terminates all Claude processes in agent panes while preserving run artifacts.
 * Usage: dure clear-run [run_id]
 */
export async function clearCommand(runId?: string): Promise<void> {
  const projectRoot = process.cwd();
  const runManager = new RunManager(projectRoot);
  const configManager = new ConfigManager(projectRoot);
  const config = configManager.loadConfig();

  // Determine which run to clear
  let targetRunId: string | undefined = runId;

  if (!targetRunId) {
    // Use active run if no run_id specified
    const activeRun = await runManager.getActiveRun();
    if (!activeRun) {
      console.log(chalk.yellow('No active run found.'));
      console.log(chalk.gray('Specify a run ID or use "dure status" to check for active runs.'));
      process.exit(1);
    }
    targetRunId = activeRun.run_id;
  }

  // Check if run exists
  if (!(await runManager.runExists(targetRunId))) {
    console.log(chalk.red(`Error: Run "${targetRunId}" not found.`));
    console.log(chalk.gray('Use "dure history" to see available runs.'));
    process.exit(1);
  }

  // Check if already stopped
  const runDir = runManager.getRunDir(targetRunId);
  const stateManager = new StateManager(runDir);
  const state = await stateManager.loadState();

  if (state) {
    const allStopped = Object.values(state.agents).every(
      agent => agent.status === 'completed' || agent.status === 'failed'
    );

    if (allStopped) {
      console.log(chalk.gray(`Run "${targetRunId}" is already stopped.`));
      return;
    }
  }

  // Create tmux manager for this run
  const tmuxManager = new TmuxManager(
    config.global.tmux_session_prefix,
    projectRoot,
    targetRunId
  );

  // Check if tmux session exists
  if (!tmuxManager.sessionExists()) {
    console.log(chalk.yellow(`Tmux session for run "${targetRunId}" not found.`));
    console.log(chalk.gray('Run may have already been stopped.'));
    process.exit(1);
  }

  console.log(chalk.gray(`Stopping all agents for run: ${targetRunId}...`));

  // Create cleanup manager and execute
  const cleanupManager = new CleanupManager(tmuxManager, stateManager);

  try {
    const result = await cleanupManager.stopAllAgents();

    if (result.success) {
      console.log(chalk.green(`✓ ${result.message}`));

      if (result.errors && result.errors.length > 0) {
        console.log(chalk.yellow('\nWarnings:'));
        result.errors.forEach(err => console.log(chalk.yellow(`  - ${err}`)));
      }

      console.log(chalk.gray('\nAll run artifacts have been preserved in:'));
      console.log(chalk.gray(`  ${runDir}`));
    } else {
      console.log(chalk.red(`✗ ${result.message}`));
      if (result.errors && result.errors.length > 0) {
        console.log(chalk.red('\nErrors:'));
        result.errors.forEach(err => console.log(chalk.red(`  - ${err}`)));
      }
      process.exit(1);
    }
  } catch (error) {
    console.log(chalk.red(`Error during cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}
