/**
 * Monitor Command
 *
 * Opens TUI or web dashboard to monitor a running Dure run.
 *
 * Usage:
 *   dure monitor [run-id]        # TUI (default)
 *   dure monitor [run-id] --web  # Web dashboard
 */
import { spawn, execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { ConfigManager } from '../../config/config-manager.js';
import { RunManager } from '../../core/run-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MonitorOptions {
  web?: boolean;
  port?: string;
}

/**
 * Find the latest run ID from the runs directory
 */
function findLatestRunId(projectRoot: string): string | null {
  const runsDir = join(projectRoot, '.dure', 'runs');
  if (!existsSync(runsDir)) {
    return null;
  }

  try {
    const runs = readdirSync(runsDir)
      .filter((name) => name.startsWith('run-'))
      .sort()
      .reverse();

    return runs[0] || null;
  } catch {
    return null;
  }
}

/**
 * Open TUI dashboard for monitoring a run
 */
async function openTUI(runId: string, projectRoot: string): Promise<void> {
  const distRoot = join(__dirname, '..', '..');
  const tuiScript = join(distRoot, 'tui', 'ink', 'index.js');

  if (!existsSync(tuiScript)) {
    console.error(chalk.red('Error: TUI not found.'));
    console.error(chalk.gray(`Expected at: ${tuiScript}`));
    console.error(chalk.gray('Make sure the project is built: npm run build'));
    process.exit(1);
  }

  console.log(chalk.blue('🖥️  Opening TUI dashboard...'));
  console.log(chalk.gray(`Run: ${runId}`));
  console.log();

  const tui = spawn('node', [tuiScript, '--project-root', projectRoot, '--run-id', runId], {
    stdio: 'inherit',
  });

  tui.on('close', (code) => {
    process.exit(code || 0);
  });

  tui.on('error', (error) => {
    console.error(chalk.red('Error starting TUI:'), error.message);
    process.exit(1);
  });
}

/**
 * Open web dashboard for monitoring a run
 */
async function openWebDashboard(runId: string, projectRoot: string, port: number): Promise<void> {
  const url = `http://localhost:${port}/run/${runId}`;

  console.log(chalk.blue('🌐 Opening web dashboard...'));
  console.log(chalk.gray(`Run: ${runId}`));
  console.log(chalk.white(`URL: ${chalk.cyan(url)}`));
  console.log();

  // Try to open browser
  try {
    if (process.platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else if (process.platform === 'linux') {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    } else if (process.platform === 'win32') {
      execSync(`start "${url}"`, { stdio: 'ignore' });
    }
    console.log(chalk.green('✓ Browser opened'));
  } catch {
    console.log(chalk.yellow('Could not open browser automatically.'));
    console.log(chalk.gray(`Please open: ${url}`));
  }
}

/**
 * Monitor command handler
 */
export async function monitorCommand(runId: string | undefined, options: MonitorOptions): Promise<void> {
  const projectRoot = process.cwd();
  const port = parseInt(options.port || '3873', 10);

  // Check if Dure is initialized
  const configManager = new ConfigManager(projectRoot);
  if (!configManager.configExists()) {
    console.error(chalk.red('Error: Dure is not initialized in this project.'));
    console.error(chalk.gray('Run "dure init" to initialize.'));
    process.exit(1);
  }

  // Determine run ID
  let targetRunId = runId;
  if (!targetRunId) {
    targetRunId = findLatestRunId(projectRoot) ?? undefined;
    if (!targetRunId) {
      console.error(chalk.red('Error: No runs found.'));
      console.error(chalk.gray('Start a new run via the web dashboard or API.'));
      process.exit(1);
    }
    console.log(chalk.gray(`Using latest run: ${targetRunId}`));
  }

  // Verify run exists
  const runDir = join(projectRoot, '.dure', 'runs', targetRunId);
  if (!existsSync(runDir)) {
    console.error(chalk.red(`Error: Run not found: ${targetRunId}`));
    console.error(chalk.gray('Use "dure history" to list available runs.'));
    process.exit(1);
  }

  // Open appropriate dashboard
  if (options.web) {
    await openWebDashboard(targetRunId, projectRoot, port);
  } else {
    await openTUI(targetRunId, projectRoot);
  }
}
