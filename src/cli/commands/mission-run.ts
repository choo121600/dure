/**
 * CLI command: dure mission run
 * Executes mission phases or individual tasks
 */

import chalk from 'chalk';
import ora from 'ora';
import { MissionManager } from '../../core/mission-manager.js';
import type { MissionId, TaskId } from '../../types/branded.js';
import { isOk, isErr } from '../../types/result.js';
import type { Mission } from '../../types/mission.js';

// ============================================================================
// Command Options
// ============================================================================

interface MissionRunOptions {
  phase?: number;
  task?: string;
  continueOnFailure?: boolean;
  watch?: boolean;
}

// ============================================================================
// Main Command Handler
// ============================================================================

export async function missionRunCommand(
  missionId: string,
  options: MissionRunOptions
): Promise<void> {
  const projectRoot = process.cwd();
  const manager = new MissionManager(projectRoot);

  // Load mission
  const missionResult = await manager.getMission(missionId as MissionId);
  if (isErr(missionResult)) {
    console.error(chalk.red(`Error: ${missionResult.error.message}`));
    process.exit(1);
  }

  const mission = missionResult.data;

  // Check if plan is approved
  if (mission.status === 'planning' || mission.status === 'plan_review') {
    console.error(chalk.red('Error: Mission plan not approved yet'));
    console.log(chalk.gray(`Approve with: dure mission approve ${missionId}`));
    process.exit(1);
  }

  console.log(chalk.blue(`🚀 Running mission: ${mission.title}`));
  console.log();

  // Execute based on options
  if (options.task) {
    await runSingleTask(manager, missionId, options.task, options);
  } else if (options.phase !== undefined) {
    await runPhase(manager, missionId, options.phase, options);
  } else {
    // Auto-run next pending phase
    const nextPhase = findNextPhase(mission);
    if (nextPhase === null) {
      console.log(chalk.green('✓ All phases completed!'));
      return;
    }
    await runPhase(manager, missionId, nextPhase, options);
  }
}

// ============================================================================
// Phase Execution
// ============================================================================

async function runPhase(
  manager: MissionManager,
  missionId: string,
  phaseNumber: number,
  options: MissionRunOptions
): Promise<void> {
  console.log(chalk.cyan(`Running Phase ${phaseNumber}...`));
  console.log();

  const spinner = options.watch ? null : ora({ text: 'Executing tasks...', color: 'cyan' }).start();

  const result = await manager.runPhase(
    missionId as MissionId,
    phaseNumber,
    { continueOnFailure: options.continueOnFailure }
  );

  spinner?.stop();

  if (isErr(result)) {
    console.error(chalk.red(`Error: ${result.error.message}`));
    process.exit(1);
  }

  const phaseResult = result.data;

  // Display results
  console.log();
  if (phaseResult.status === 'completed') {
    console.log(chalk.green(`✓ Phase ${phaseNumber} completed`));
    console.log(`  Tasks: ${phaseResult.tasksCompleted} passed`);
  } else {
    console.log(chalk.red(`✗ Phase ${phaseNumber} failed`));
    console.log(`  Tasks: ${phaseResult.tasksCompleted} passed, ${phaseResult.tasksFailed} failed`);

    if (phaseResult.failedTask) {
      console.log();
      console.log(chalk.yellow(`Failed task: ${phaseResult.failedTask}`));
      console.log(chalk.gray(`Retry: dure mission run ${missionId} --task ${phaseResult.failedTask}`));
    }
  }
}

// ============================================================================
// Task Execution
// ============================================================================

async function runSingleTask(
  manager: MissionManager,
  missionId: string,
  taskId: string,
  options: MissionRunOptions
): Promise<void> {
  console.log(chalk.cyan(`Running Task ${taskId}...`));

  const result = await manager.runTask(missionId as MissionId, taskId as TaskId);

  if (isErr(result)) {
    console.error(chalk.red(`Error: ${result.error.message}`));
    process.exit(1);
  }

  const taskResult = result.data;

  console.log();
  if (taskResult.status === 'passed') {
    console.log(chalk.green(`✓ Task ${taskId} passed`));
    if (taskResult.runId) {
      console.log(chalk.gray(`  Run: ${taskResult.runId}`));
    }
  } else {
    console.log(chalk.red(`✗ Task ${taskId} failed`));
    if (taskResult.error) {
      console.log(chalk.red(`  Error: ${taskResult.error}`));
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find the next phase to execute (first pending or failed phase)
 */
function findNextPhase(mission: Mission): number | null {
  for (const phase of mission.phases) {
    if (phase.status === 'pending' || phase.status === 'failed') {
      return phase.number;
    }
  }
  return null;
}
