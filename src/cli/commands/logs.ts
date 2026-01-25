import { existsSync, readFileSync, watch } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { RunManager } from '../../core/run-manager.js';

export async function logsCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const runManager = new RunManager(projectRoot);

  // Get active run
  const activeRun = runManager.getActiveRun();

  if (!activeRun) {
    console.log(chalk.yellow('No active run found.'));
    console.log(chalk.gray('Start a new run with: orchestral start'));
    return;
  }

  const runDir = runManager.getRunDir(activeRun.run_id);
  const eventsLogPath = join(runDir, 'events.log');

  console.log(chalk.blue('🎼 Orchestral Logs'));
  console.log(chalk.gray(`Run: ${activeRun.run_id}`));
  console.log(chalk.gray(`Phase: ${activeRun.phase}`));
  console.log(chalk.gray('---'));
  console.log();

  // Print existing log content
  if (existsSync(eventsLogPath)) {
    const content = readFileSync(eventsLogPath, 'utf-8');
    if (content.trim()) {
      const lines = content.trim().split('\n');
      for (const line of lines) {
        printFormattedLogLine(line);
      }
    }
  } else {
    console.log(chalk.gray('No events logged yet.'));
  }

  console.log();
  console.log(chalk.gray('Watching for new events... (Ctrl+C to exit)'));
  console.log();

  // Watch for changes
  let lastSize = existsSync(eventsLogPath)
    ? readFileSync(eventsLogPath, 'utf-8').length
    : 0;

  const watcher = watch(runDir, { persistent: true }, (eventType, filename) => {
    if (filename === 'events.log' && existsSync(eventsLogPath)) {
      const content = readFileSync(eventsLogPath, 'utf-8');
      if (content.length > lastSize) {
        const newContent = content.slice(lastSize);
        const newLines = newContent.trim().split('\n').filter(l => l.trim());
        for (const line of newLines) {
          printFormattedLogLine(line);
        }
        lastSize = content.length;
      }
    }
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    watcher.close();
    console.log();
    console.log(chalk.gray('Stopped watching logs.'));
    process.exit(0);
  });

  // Keep the process running
  await new Promise(() => {});
}

function printFormattedLogLine(line: string): void {
  // Parse log line: "2024-01-15T14:30:22Z [INFO] event.name key=value"
  const match = line.match(/^(\S+)\s+\[(\w+)\]\s+(\S+)(.*)$/);

  if (match) {
    const [, timestamp, level, event, data] = match;
    const time = new Date(timestamp).toLocaleTimeString();

    let levelColor: (s: string) => string;
    switch (level) {
      case 'ERROR':
        levelColor = chalk.red;
        break;
      case 'WARN':
        levelColor = chalk.yellow;
        break;
      default:
        levelColor = chalk.blue;
    }

    console.log(
      `${chalk.gray(time)} ${levelColor(`[${level}]`)} ${chalk.white(event)}${chalk.gray(data)}`
    );
  } else {
    console.log(line);
  }
}
