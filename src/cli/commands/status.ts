import chalk from 'chalk';
import { RunManager } from '../../core/run-manager.js';
import { StateManager } from '../../core/state-manager.js';
import type { Phase, AgentStatus } from '../../types/index.js';

export async function statusCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const runManager = new RunManager(projectRoot);

  const activeRun = await runManager.getActiveRun();

  if (!activeRun) {
    console.log(chalk.yellow('No active run found.'));
    console.log(chalk.gray('Use `orchestral start` to begin.'));
    return;
  }

  const runDir = runManager.getRunDir(activeRun.run_id);
  const stateManager = new StateManager(runDir);
  const state = await stateManager.loadState();

  if (!state) {
    console.log(chalk.red('Error: Could not load run state.'));
    return;
  }

  console.log(chalk.blue('🎼 Orchestral Status'));
  console.log();
  console.log(chalk.white(`Run ID:    ${state.run_id}`));
  console.log(chalk.white(`Phase:     ${formatPhase(state.phase)}`));
  console.log(chalk.white(`Iteration: ${state.iteration} / ${state.max_iterations}`));
  console.log();

  // Agent status
  console.log(chalk.white('Agents:'));
  console.log(`  Refiner:    ${formatAgentStatus(state.agents.refiner.status)}`);
  console.log(`  Builder:    ${formatAgentStatus(state.agents.builder.status)}`);
  console.log(`  Verifier:   ${formatAgentStatus(state.agents.verifier.status)}`);
  console.log(`  Gatekeeper: ${formatAgentStatus(state.agents.gatekeeper.status)}`);
  console.log();

  // Pending CRP
  if (state.pending_crp) {
    console.log(chalk.yellow(`⚠ Pending CRP: ${state.pending_crp}`));
    console.log(chalk.gray('  Human input required. Check the web dashboard.'));
    console.log();
  }

  // Timeline
  console.log(chalk.white('Timeline:'));
  console.log(chalk.gray(`  Started:  ${new Date(state.started_at).toLocaleString()}`));
  console.log(chalk.gray(`  Updated:  ${new Date(state.updated_at).toLocaleString()}`));
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
    waiting_human: 'Waiting for Human',
    ready_for_merge: 'Ready for Merge',
    completed: 'Completed',
    failed: 'Failed',
  };

  return colors[phase](labels[phase]);
}

function formatAgentStatus(status: AgentStatus): string {
  switch (status) {
    case 'pending':
      return chalk.gray('○ Pending');
    case 'running':
      return chalk.yellow('● Running');
    case 'completed':
      return chalk.green('✓ Completed');
    case 'failed':
      return chalk.red('✗ Failed');
    default:
      return chalk.gray('? Unknown');
  }
}
