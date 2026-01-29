/**
 * Commander Program Definition
 *
 * Separated from index.ts to allow introspection by the screenshots command
 * without circular dependencies.
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { stopCommand } from './commands/stop.js';
import { historyCommand } from './commands/history.js';
import { logsCommand } from './commands/logs.js';
import { deleteCommand } from './commands/delete.js';
import { cleanCommand } from './commands/clean.js';
import { clearCommand } from './commands/clear.js';
import { recoverCommand } from './commands/recover.js';
import { createScreenshotsCommand } from './commands/screenshots.js';

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
    .action(initCommand);

  program
    .command('start')
    .description('Start Dure in the current project')
    .option('-p, --port <number>', 'Web server port', '3873')
    .option('--no-browser', 'Do not open browser automatically')
    .option('--tui', 'Use TUI mode (Terminal User Interface) instead of web server')
    .action(startCommand);

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

  return program;
}
