import chalk from 'chalk';
import { RunManager } from '../../core/run-manager.js';
import type { Phase } from '../../types/index.js';

export async function historyCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const runManager = new RunManager(projectRoot);

  const runs = await runManager.listRuns();

  if (runs.length === 0) {
    console.log(chalk.yellow('No runs found.'));
    console.log(chalk.gray('Use `dure start` to create your first run.'));
    return;
  }

  console.log(chalk.blue('🎼 Dure History'));
  console.log();
  console.log(chalk.gray('Run ID                    Phase              Iteration  Started'));
  console.log(chalk.gray('─'.repeat(75)));

  for (const run of runs) {
    const phaseStr = formatPhase(run.phase).padEnd(20);
    const iterStr = `${run.iteration}`.padEnd(10);
    const dateStr = new Date(run.started_at).toLocaleString();

    console.log(`${run.run_id}  ${phaseStr} ${iterStr} ${chalk.gray(dateStr)}`);
  }

  console.log();
  console.log(chalk.gray(`Total: ${runs.length} run(s)`));
}

function formatPhase(phase: Phase): string {
  const colors: Record<Phase, typeof chalk.green> = {
    refine: chalk.cyan,
    build: chalk.blue,
    verify: chalk.magenta,
    gate: chalk.yellow,
    waiting_human: chalk.red,
    ready_for_merge: chalk.green,
    completed: chalk.green,
    failed: chalk.red,
  };

  const labels: Record<Phase, string> = {
    refine: 'Refine',
    build: 'Build',
    verify: 'Verify',
    gate: 'Gate',
    waiting_human: 'Waiting Human',
    ready_for_merge: 'Ready',
    completed: 'Completed',
    failed: 'Failed',
  };

  return colors[phase](labels[phase]);
}
