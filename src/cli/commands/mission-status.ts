import chalk from 'chalk';
import { MissionManager } from '../../core/mission-manager.js';
import { isOk, isErr } from '../../types/result.js';
import type { Mission, MissionPhase, MissionTask } from '../../types/mission.js';
import type { MissionId } from '../../types/branded.js';

interface MissionStatusOptions {
  json?: boolean;      // JSON output
  verbose?: boolean;   // Detailed information
}

export async function missionStatusCommand(
  missionId: string,
  options: MissionStatusOptions = {}
): Promise<void> {
  const projectRoot = process.cwd();
  const manager = new MissionManager(projectRoot);

  const result = await manager.getMission(missionId as MissionId);

  if (isErr(result)) {
    console.error(chalk.red(`Error: ${result.error.message}`));
    process.exit(1);
  }

  const mission = result.data;

  if (options.json) {
    console.log(JSON.stringify(mission, null, 2));
    return;
  }

  // Header
  console.log(chalk.blue('═'.repeat(60)));
  console.log(chalk.blue(`  Mission: ${mission.title || mission.mission_id}`));
  console.log(chalk.blue('═'.repeat(60)));
  console.log();

  // Basic Info
  console.log(chalk.white('Basic Info:'));
  console.log(`  ${chalk.gray('ID:')}         ${mission.mission_id}`);
  console.log(`  ${chalk.gray('Status:')}     ${formatStatus(mission.status)}`);
  console.log(`  ${chalk.gray('Created:')}    ${formatDate(mission.created_at)}`);
  console.log(`  ${chalk.gray('Updated:')}    ${formatDate(mission.updated_at)}`);
  console.log();

  // Planning information
  console.log(chalk.white('Planning:'));
  console.log(`  ${chalk.gray('Stage:')}      ${mission.planning.stage}`);
  console.log(`  ${chalk.gray('Iterations:')} ${mission.planning.iterations}`);

  if (mission.planning.critiques.length > 0) {
    const lastCritique = mission.planning.critiques[mission.planning.critiques.length - 1];
    console.log(`  ${chalk.gray('Last Verdict:')} ${formatVerdict(lastCritique.verdict)}`);
  }
  console.log();

  // Progress
  if (mission.phases.length > 0) {
    console.log(chalk.white('Progress:'));
    const { completed_tasks, total_tasks, failed_tasks } = mission.stats;
    const progress = total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0;

    console.log(`  ${chalk.gray('Phases:')}  ${mission.stats.total_phases}`);
    console.log(`  ${chalk.gray('Tasks:')}   ${completed_tasks}/${total_tasks} (${progress}%)`);
    if (failed_tasks > 0) {
      console.log(`  ${chalk.gray('Failed:')}  ${chalk.red(failed_tasks)}`);
    }
    console.log();

    // Progress bar
    const barLength = 40;
    const filled = Math.round((completed_tasks / total_tasks) * barLength);
    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(barLength - filled));
    console.log(`  [${bar}] ${progress}%`);
    console.log();

    // Phase details (verbose)
    if (options.verbose) {
      console.log(chalk.white('Phases:'));
      for (const phase of mission.phases) {
        printPhaseDetail(phase);
      }
    } else {
      // Brief Phase summary
      console.log(chalk.white('Phase Summary:'));
      for (const phase of mission.phases) {
        const icon = getStatusIcon(phase.status);
        const tasksDone = phase.tasks.filter(t => t.status === 'passed').length;
        console.log(`  ${icon} Phase ${phase.number}: ${phase.title} (${tasksDone}/${phase.tasks.length})`);
      }
      console.log();
      console.log(chalk.gray('Use --verbose for task details'));
    }
  }

  // Next action guidance
  printNextActions(mission);
}

function printPhaseDetail(phase: MissionPhase): void {
  const icon = getStatusIcon(phase.status);
  console.log();
  console.log(`  ${icon} ${chalk.cyan(`Phase ${phase.number}:`)} ${phase.title}`);
  console.log(`     ${chalk.gray(phase.description)}`);
  console.log();

  for (const task of phase.tasks) {
    printTaskDetail(task);
  }
}

function printTaskDetail(task: MissionTask): void {
  const icon = getStatusIcon(task.status);
  const runInfo = task.run_id ? chalk.gray(` → ${task.run_id}`) : '';

  console.log(`     ${icon} ${task.task_id}: ${task.title}${runInfo}`);

  if (task.status === 'failed' && task.error) {
    console.log(`        ${chalk.red('Error:')} ${task.error}`);
  }

  if (task.depends_on.length > 0) {
    console.log(`        ${chalk.gray('Depends on:')} ${task.depends_on.join(', ')}`);
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'passed':
    case 'completed':
      return chalk.green('✓');
    case 'in_progress':
      return chalk.blue('▶');
    case 'pending':
      return chalk.yellow('○');
    case 'blocked':
      return chalk.gray('·');
    case 'failed':
      return chalk.red('✗');
    case 'needs_human':
      return chalk.magenta('?');
    case 'skipped':
      return chalk.gray('–');
    default:
      return ' ';
  }
}

function formatStatus(status: string): string {
  switch (status) {
    case 'ready':
      return chalk.green('Ready');
    case 'planning':
      return chalk.cyan('Planning');
    case 'plan_review':
      return chalk.yellow('Plan Review Required');
    case 'in_progress':
      return chalk.blue('In Progress');
    case 'completed':
      return chalk.green('Completed');
    case 'failed':
      return chalk.red('Failed');
    case 'cancelled':
      return chalk.gray('Cancelled');
    default:
      return status;
  }
}

function formatVerdict(verdict: string): string {
  switch (verdict) {
    case 'approved':
      return chalk.green('Approved');
    case 'needs_revision':
      return chalk.yellow('Needs Revision');
    case 'needs_human':
      return chalk.magenta('Needs Human');
    default:
      return verdict;
  }
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString();
}

function printNextActions(mission: Mission): void {
  console.log(chalk.white('Next Actions:'));

  switch (mission.status) {
    case 'plan_review':
      console.log(`  • Review plan: ${chalk.white(`dure mission status ${mission.mission_id} --verbose`)}`);
      console.log(`  • Approve plan: ${chalk.white(`dure mission approve ${mission.mission_id}`)}`);
      break;

    case 'ready':
      console.log(`  • Start execution: ${chalk.white(`dure mission run ${mission.mission_id} --phase 1`)}`);
      console.log(`  • View kanban: ${chalk.white(`dure mission kanban ${mission.mission_id}`)}`);
      break;

    case 'in_progress':
      const currentPhase = mission.stats.current_phase || 1;
      console.log(`  • Continue: ${chalk.white(`dure mission run ${mission.mission_id} --phase ${currentPhase}`)}`);
      console.log(`  • View kanban: ${chalk.white(`dure mission kanban ${mission.mission_id}`)}`);
      break;

    case 'completed':
      console.log(`  • Mission completed! 🎉`);
      break;

    case 'failed':
      console.log(`  • Retry failed task: ${chalk.white(`dure mission run ${mission.mission_id} --retry`)}`);
      break;
  }
}
