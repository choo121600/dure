import chalk from 'chalk';
import { readFile } from 'fs/promises';
import ora from 'ora';
import { MissionManager } from '../../core/mission-manager.js';
import { isOk, isErr } from '../../types/result.js';
import type { Granularity } from '../../types/index.js';

interface MissionCreateOptions {
  file?: string;           // Read description from file
  granularity?: Granularity; // Execution unit: task, phase, auto
  noPlanning?: boolean;    // Skip planning (for debugging)
}

export async function missionCreateCommand(
  description: string | undefined,
  options: MissionCreateOptions
): Promise<void> {
  const projectRoot = process.cwd();

  // 1. Get description from file or argument
  let missionDescription: string;

  if (options.file) {
    try {
      missionDescription = await readFile(options.file, 'utf-8');
    } catch (error) {
      console.error(chalk.red(`Error: Could not read file: ${options.file}`));
      process.exit(1);
    }
  } else if (description) {
    missionDescription = description;
  } else {
    console.error(chalk.red('Error: Mission description required'));
    console.log('Usage: dure mission create "description" or dure mission create -f file.md');
    process.exit(1);
  }

  // 2. Show mission creation header
  console.log(chalk.blue('🎯 Creating new mission...'));
  console.log();
  console.log(chalk.gray('Description:'));
  console.log(chalk.white(missionDescription.slice(0, 200) + (missionDescription.length > 200 ? '...' : '')));
  console.log();

  const manager = new MissionManager(projectRoot);
  const granularity = options.granularity || 'auto';

  console.log(chalk.gray(`Granularity: ${granularity}`));
  console.log();

  // 3. Run planning with spinner
  const spinner = ora({
    text: 'Running Planner agent...',
    color: 'cyan',
  }).start();

  const result = await manager.createMission(missionDescription);

  spinner.stop();

  if (isErr(result)) {
    console.error(chalk.red(`✗ Mission creation failed: ${result.error.message}`));
    process.exit(1);
  }

  const mission = result.data;

  // 4. Display results
  console.log(chalk.green('✓ Mission created successfully'));
  console.log();
  console.log(chalk.blue('Mission Details:'));
  console.log(`  ${chalk.gray('ID:')}      ${mission.mission_id}`);
  console.log(`  ${chalk.gray('Title:')}   ${mission.title}`);
  console.log(`  ${chalk.gray('Status:')}  ${formatStatus(mission.status)}`);
  console.log();

  if (mission.status === 'ready') {
    console.log(chalk.blue('Plan Summary:'));
    console.log(`  ${chalk.gray('Phases:')} ${mission.stats.total_phases}`);
    console.log(`  ${chalk.gray('Tasks:')}  ${mission.stats.total_tasks}`);
    console.log();

    // Display phase list
    for (const phase of mission.phases) {
      console.log(`  ${chalk.cyan(`Phase ${phase.number}:`)} ${phase.title}`);
      for (const task of phase.tasks) {
        console.log(`    ${chalk.gray('•')} ${task.title}`);
      }
    }
    console.log();

    console.log(chalk.gray('To view kanban: ') + chalk.white(`dure mission kanban ${mission.mission_id}`));
    console.log(chalk.gray('To run phase 1: ') + chalk.white(`dure mission run ${mission.mission_id} --phase 1`));
  } else if (mission.status === 'plan_review') {
    console.log(chalk.yellow('⚠ Plan needs human review'));
    console.log();
    console.log(chalk.gray('Planning iterations: ') + mission.planning.iterations);
    console.log(chalk.gray('View plan: ') + `dure mission status ${mission.mission_id}`);
    console.log(chalk.gray('Approve plan: ') + `dure mission approve ${mission.mission_id}`);
  }
}

function formatStatus(status: string): string {
  switch (status) {
    case 'ready':
      return chalk.green('Ready');
    case 'planning':
      return chalk.cyan('Planning');
    case 'plan_review':
      return chalk.yellow('Needs Review');
    case 'in_progress':
      return chalk.blue('In Progress');
    case 'completed':
      return chalk.green('Completed');
    case 'failed':
      return chalk.red('Failed');
    default:
      return status;
  }
}
