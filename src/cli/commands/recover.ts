import chalk from 'chalk';
import { createInterface } from 'readline';
import { ConfigManager } from '../../config/config-manager.js';
import { InterruptRecovery, InterruptedRun, ResumeStrategy } from '../../core/interrupt-recovery.js';

interface RecoverOptions {
  list?: boolean;
  auto?: boolean;
  force?: boolean;
}

export async function recoverCommand(
  runId: string | undefined,
  options: RecoverOptions
): Promise<void> {
  const projectRoot = process.cwd();

  // Load config
  const configManager = new ConfigManager(projectRoot);
  configManager.initialize();
  const config = configManager.loadConfig();

  const recovery = new InterruptRecovery(projectRoot, {
    tmuxSessionPrefix: config.global.tmux_session_prefix,
  });
  recovery.setConfig(config);

  // List mode
  if (options.list || !runId) {
    await listInterruptedRuns(recovery, options);
    return;
  }

  // Recover specific run
  await recoverRun(recovery, runId, options);
}

async function listInterruptedRuns(
  recovery: InterruptRecovery,
  options: RecoverOptions
): Promise<void> {
  console.log(chalk.blue('Scanning for interrupted runs...'));
  console.log();

  const runs = await recovery.detectInterruptedRuns();

  if (runs.length === 0) {
    console.log(chalk.green('No interrupted runs detected.'));
    console.log(chalk.gray('All runs are either completed, failed, or too old.'));
    return;
  }

  console.log(chalk.yellow(`Found ${runs.length} interrupted run(s):`));
  console.log();

  for (const run of runs) {
    printRunInfo(run);
  }

  // Ask if user wants to recover
  if (options.auto || options.force) {
    const recoverableRuns = runs.filter(r => r.canResume && r.resumeStrategy === 'restart_agent');
    if (recoverableRuns.length > 0) {
      console.log(chalk.blue(`Auto-recovering ${recoverableRuns.length} run(s)...`));
      for (const run of recoverableRuns) {
        await recoverRun(recovery, run.runId, { force: true });
      }
    }
    return;
  }

  console.log(chalk.gray('Use `orchestral recover <run-id>` to recover a specific run.'));
  console.log(chalk.gray('Use `orchestral recover --auto` to auto-recover all recoverable runs.'));
}

async function recoverRun(
  recovery: InterruptRecovery,
  runId: string,
  options: RecoverOptions
): Promise<void> {
  console.log(chalk.blue(`Checking run ${runId}...`));
  console.log();

  // Detect specific run
  const runs = await recovery.detectInterruptedRuns();
  const run = runs.find(r => r.runId === runId);

  if (!run) {
    // Check if run exists but is not interrupted
    console.log(chalk.red(`Run ${runId} is not in an interrupted state.`));
    console.log(chalk.gray('It may be completed, failed, or not exist.'));
    return;
  }

  printRunInfo(run);

  if (!run.canResume) {
    console.log(chalk.red('This run cannot be automatically recovered.'));
    console.log(chalk.gray(`Reason: ${run.reason}`));

    if (!options.force) {
      const shouldMarkFailed = await confirm('Would you like to mark this run as failed?');

      if (shouldMarkFailed) {
        await recovery.markAsFailed(runId, 'Manually marked as failed during recovery');
        console.log(chalk.yellow(`Run ${runId} has been marked as failed.`));
      }
    }
    return;
  }

  // Handle different strategies
  if (run.resumeStrategy === 'wait_human') {
    console.log(chalk.yellow('This run is waiting for human input.'));
    console.log(chalk.gray('Please respond to the pending CRP via the web dashboard.'));
    console.log(chalk.gray('Use `orchestral start` to open the dashboard.'));
    return;
  }

  // Confirm recovery
  if (!options.force && !options.auto) {
    const shouldProceed = await confirm(
      `Recover run ${runId}? This will restart the ${run.lastAgent} agent.`
    );

    if (!shouldProceed) {
      console.log(chalk.gray('Recovery cancelled.'));
      return;
    }
  }

  // Prepare recovery
  console.log(chalk.blue('Preparing recovery...'));
  const result = await recovery.prepareRecovery(runId);

  if (result.success) {
    console.log(chalk.green(`Recovery prepared successfully.`));
    console.log(chalk.white(result.message));
    console.log();
    console.log(chalk.yellow('Next steps:'));
    console.log(chalk.gray('  1. Run `orchestral start` to resume the run'));
    console.log(chalk.gray('  2. The agent will automatically restart'));
  } else {
    console.log(chalk.red('Recovery failed.'));
    console.log(chalk.white(result.message));
    if (result.error) {
      console.log(chalk.gray(`Error: ${result.error}`));
    }
  }
}

function printRunInfo(run: InterruptedRun): void {
  const strategyColors: Record<ResumeStrategy, typeof chalk.green> = {
    restart_agent: chalk.blue,
    wait_human: chalk.yellow,
    manual: chalk.red,
  };

  const strategyLabels: Record<ResumeStrategy, string> = {
    restart_agent: 'Restart Agent',
    wait_human: 'Wait for Human',
    manual: 'Manual Recovery',
  };

  console.log(chalk.white(`Run: ${chalk.bold(run.runId)}`));
  console.log(chalk.gray(`  Phase:       ${run.phase}`));
  console.log(chalk.gray(`  Last Agent:  ${run.lastAgent || 'N/A'}`));
  console.log(chalk.gray(`  Iteration:   ${run.iteration} / ${run.maxIterations}`));
  console.log(chalk.gray(`  Interrupted: ${new Date(run.interruptedAt).toLocaleString()}`));
  console.log(chalk.gray(`  Tmux:        ${run.tmuxSessionExists ? chalk.green('exists') : chalk.red('not found')}`));
  console.log(
    chalk.gray(`  Strategy:    `) +
      strategyColors[run.resumeStrategy](strategyLabels[run.resumeStrategy])
  );
  console.log(chalk.gray(`  Can Resume:  ${run.canResume ? chalk.green('Yes') : chalk.red('No')}`));
  console.log(chalk.gray(`  Reason:      ${run.reason}`));
  console.log();
}

function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
