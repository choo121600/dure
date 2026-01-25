#!/usr/bin/env node

import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { stopCommand } from './commands/stop.js';
import { historyCommand } from './commands/history.js';
import { logsCommand } from './commands/logs.js';

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

program.parse();
