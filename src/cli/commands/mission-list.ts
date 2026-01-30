import chalk from 'chalk';
import { MissionManager } from '../../core/mission-manager.js';
import { isOk, isErr } from '../../types/result.js';

interface MissionListOptions {
  json?: boolean;
  status?: string;    // Status filter
  limit?: number;     // Result count limit
}

export async function missionListCommand(options: MissionListOptions = {}): Promise<void> {
  const projectRoot = process.cwd();
  const manager = new MissionManager(projectRoot);

  const result = await manager.listMissions();

  if (isErr(result)) {
    console.error(chalk.red(`Error: ${result.error.message}`));
    process.exit(1);
  }

  let missions = result.data;

  // Status filter
  if (options.status) {
    missions = missions.filter(m => m.status === options.status);
  }

  // Limit count (handle negative and zero limits)
  if (options.limit !== undefined) {
    if (options.limit <= 0) {
      missions = [];
    } else {
      missions = missions.slice(0, options.limit);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(missions, null, 2));
    return;
  }

  if (missions.length === 0) {
    console.log(chalk.gray('No missions found.'));
    console.log(chalk.gray('Create one with: dure mission create "description"'));
    return;
  }

  console.log(chalk.blue('🎯 Missions'));
  console.log();

  // Table header
  console.log(
    chalk.gray(
      padEnd('ID', 26) +
      padEnd('Title', 30) +
      padEnd('Status', 15) +
      padEnd('Progress', 12) +
      'Updated'
    )
  );
  console.log(chalk.gray('─'.repeat(100)));

  for (const mission of missions) {
    const progress = mission.stats?.total_tasks > 0
      ? `${mission.stats.completed_tasks}/${mission.stats.total_tasks}`
      : '-';

    const row =
      chalk.white(padEnd(mission.mission_id, 26)) +
      padEnd(truncate(mission.title || '(untitled)', 28), 30) +
      formatStatusShort(mission.status, 15) +
      padEnd(progress, 12) +
      chalk.gray(formatRelativeDate(mission.updated_at));

    console.log(row);
  }

  console.log();
  console.log(chalk.gray(`Total: ${missions.length} mission(s)`));
}

function padEnd(str: string, length: number): string {
  return str.padEnd(length);
}

function truncate(str: string, length: number): string {
  return str.length > length ? str.slice(0, length - 2) + '..' : str;
}

function formatStatusShort(status: string, length: number): string {
  let formatted: string;
  switch (status) {
    case 'ready':
      formatted = chalk.green('Ready');
      break;
    case 'planning':
      formatted = chalk.cyan('Planning');
      break;
    case 'plan_review':
      formatted = chalk.yellow('Review');
      break;
    case 'in_progress':
      formatted = chalk.blue('Running');
      break;
    case 'completed':
      formatted = chalk.green('Done');
      break;
    case 'failed':
      formatted = chalk.red('Failed');
      break;
    default:
      formatted = status;
  }
  return padEnd(formatted, length);
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
