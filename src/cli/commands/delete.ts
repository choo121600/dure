import chalk from 'chalk';
import { createInterface } from 'readline';
import { RunManager } from '../../core/run-manager.js';

export async function deleteCommand(runId: string, options: { force?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const runManager = new RunManager(projectRoot);

  if (!(await runManager.runExists(runId))) {
    console.error(chalk.red(`Error: Run '${runId}' not found.`));
    process.exit(1);
  }

  // Confirmation unless --force is used
  if (!options.force) {
    const confirmed = await confirm(`Are you sure you want to delete ${runId}? This cannot be undone.`);
    if (!confirmed) {
      console.log(chalk.yellow('Deletion cancelled.'));
      return;
    }
  }

  try {
    const success = await runManager.deleteRun(runId);
    if (success) {
      console.log(chalk.green(`✓ Deleted run: ${runId}`));
    } else {
      console.error(chalk.red(`Failed to delete run: ${runId}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
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
