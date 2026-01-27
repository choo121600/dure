#!/usr/bin/env node

import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { stopCommand } from './commands/stop.js';
import { historyCommand } from './commands/history.js';
import { logsCommand } from './commands/logs.js';
import { deleteCommand } from './commands/delete.js';
import { cleanCommand } from './commands/clean.js';
import { clearCommand } from './commands/clear.js';
import { recoverCommand } from './commands/recover.js';

const program = new Command();

program
  .name('orchestral')
  .description('Agentic Software Engineering - 4 agents orchestrate code generation with human oversight')
  .version('0.1.0');

program
  .command('start')
  .description('Start Orchestral in the current project')
  .option('-p, --port <number>', 'Web server port', '3000')
  .option('--no-browser', 'Do not open browser automatically')
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
  .option('--older-than <duration>', 'Delete runs older than duration (e.g., 7d, 24h)', '7d')
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

program.parse();
