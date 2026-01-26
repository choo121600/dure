import chalk from 'chalk';
import { createInterface } from 'readline';
import { RunManager } from '../../core/run-manager.js';

interface CleanOptions {
  olderThan?: string;
  force?: boolean;
  dryRun?: boolean;
}

export async function cleanCommand(options: CleanOptions): Promise<void> {
  const projectRoot = process.cwd();
  const runManager = new RunManager(projectRoot);

  // Default to 7 days if not specified
  const duration = options.olderThan || '7d';

  let durationMs: number;
  try {
    durationMs = RunManager.parseDuration(duration);
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Invalid duration'}`));
    process.exit(1);
  }

  // Find runs to delete
  const runs = await runManager.listRuns();
  const cutoffTime = Date.now() - durationMs;
  const toDelete = runs.filter(run => {
    const runStartTime = new Date(run.started_at).getTime();
    return runStartTime < cutoffTime && (run.phase === 'completed' || run.phase === 'failed');
  });

  if (toDelete.length === 0) {
    console.log(chalk.yellow(`No completed/failed runs older than ${duration} found.`));
    return;
  }

  console.log(chalk.blue(`Found ${toDelete.length} run(s) to delete:`));
  console.log();
  for (const run of toDelete) {
    const date = new Date(run.started_at).toLocaleString();
    console.log(`  ${chalk.gray(run.run_id)}  ${chalk.dim(date)}`);
  }
  console.log();

  // Dry run mode
  if (options.dryRun) {
    console.log(chalk.yellow('Dry run mode - no runs will be deleted.'));
    return;
  }

  // Confirmation unless --force is used
  if (!options.force) {
    const confirmed = await confirm(`Delete ${toDelete.length} run(s)? This cannot be undone.`);
    if (!confirmed) {
      console.log(chalk.yellow('Cleanup cancelled.'));
      return;
    }
  }

  // Perform cleanup
  const result = await runManager.cleanRuns(durationMs);

  if (result.count > 0) {
    console.log(chalk.green(`✓ Deleted ${result.count} run(s):`));
    for (const runId of result.deleted) {
      console.log(`  ${chalk.gray(runId)}`);
    }
  } else {
    console.log(chalk.yellow('No runs were deleted.'));
  }
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
