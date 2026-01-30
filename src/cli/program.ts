/**
 * Commander Program Definition
 *
 * Separated from index.ts to allow introspection by the screenshots command
 * without circular dependencies.
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { monitorCommand } from './commands/monitor.js';
import { statusCommand } from './commands/status.js';
import { stopCommand } from './commands/stop.js';
import { historyCommand } from './commands/history.js';
import { logsCommand } from './commands/logs.js';
import { deleteCommand } from './commands/delete.js';
import { cleanCommand } from './commands/clean.js';
import { clearCommand } from './commands/clear.js';
import { recoverCommand } from './commands/recover.js';
import { createScreenshotsCommand } from './commands/screenshots.js';
import { missionCreateCommand } from './commands/mission-create.js';
import { missionStatusCommand } from './commands/mission-status.js';
import { missionListCommand } from './commands/mission-list.js';
import { missionRunCommand } from './commands/mission-run.js';
import { missionKanbanCommand } from './commands/mission-kanban.js';

/**
 * Create the main CLI program with all commands registered
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('dure')
    .description(
      'Agentic Software Engineering - 4 agents work cooperatively with human oversight'
    )
    .version('0.1.0');

  program
    .command('init')
    .description('Initialize Dure in the current project')
    .option('--smart', 'Analyze project and generate custom skills/agents using Claude Code')
    .option('--phase <phase>', 'Run specific phase only (plan|execute|finalize|resume)', '')
    .action(initCommand);

  program
    .command('start')
    .description('Start Dure in the current project (TUI by default)')
    .option('-p, --port <number>', 'Web server port', '3873')
    .option('-w, --web', 'Open web dashboard instead of TUI')
    .option('-a, --attach', 'Attach to tmux session (legacy mode)')
    .action(startCommand);

  program
    .command('monitor [run-id]')
    .description('Open dashboard to monitor a running Dure run')
    .option('-w, --web', 'Use web dashboard instead of TUI')
    .option('-p, --port <number>', 'Web server port (for --web)', '3873')
    .action(monitorCommand);

  program
    .command('status')
    .description('Show the status of the current run')
    .action(statusCommand);

  program
    .command('stop')
    .description('Stop the current run')
    .action(stopCommand);

  program
    .command('history')
    .description('Show the history of past runs')
    .action(historyCommand);

  program
    .command('logs')
    .description('Show real-time logs for the current run')
    .action(logsCommand);

  program
    .command('delete <run-id>')
    .description('Delete a specific run')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(deleteCommand);

  program
    .command('clean')
    .description('Delete old completed/failed runs')
    .option(
      '--older-than <duration>',
      'Delete runs older than duration (e.g., 7d, 24h)',
      '7d'
    )
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--dry-run', 'Show what would be deleted without actually deleting')
    .action(cleanCommand);

  program
    .command('clear-run [run-id]')
    .description('Terminate Claude processes in all agent panes (preserves artifacts)')
    .action(clearCommand);

  program
    .command('recover [run-id]')
    .description('Detect and recover interrupted runs')
    .option('-l, --list', 'List all interrupted runs')
    .option('-a, --auto', 'Automatically recover without prompts')
    .option('-f, --force', 'Skip confirmation prompts')
    .action(recoverCommand);

  // Add screenshots command for documentation automation
  program.addCommand(createScreenshotsCommand());

  // Mission command group
  const mission = program
    .command('mission')
    .description('Mission planning and execution');

  mission
    .command('create [description]')
    .description('Create a new mission and start planning')
    .option('-f, --file <path>', 'Read description from file')
    .option('-g, --granularity <type>', 'Run unit: task, phase, auto (default: auto)', 'auto')
    .option('--no-planning', 'Skip planning phase (for debugging)')
    .action(missionCreateCommand);

  mission
    .command('status <mission-id>')
    .description('Show mission status and details')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show detailed task information')
    .action(missionStatusCommand);

  mission
    .command('list')
    .description('List all missions')
    .option('--json', 'Output as JSON')
    .option('-s, --status <status>', 'Filter by status')
    .option('-n, --limit <number>', 'Limit number of results', parseInt)
    .action(missionListCommand);

  mission
    .command('run <mission-id>')
    .description('Run mission phases or tasks')
    .option('-p, --phase <number>', 'Run specific phase', parseInt)
    .option('-t, --task <task-id>', 'Run specific task (e.g., task-1.2)')
    .option('--continue-on-failure', 'Continue to next task even if one fails')
    .option('-w, --watch', 'Show real-time task status')
    .action(missionRunCommand);

  mission
    .command('kanban <mission-id>')
    .description('Display mission kanban board')
    .option('-w, --watch', 'Watch for real-time updates')
    .action(missionKanbanCommand);

  return program;
}
