import { execSync, spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { ConfigManager } from '../../config/config-manager.js';
import { RunManager } from '../../core/run-manager.js';
import { TmuxManager } from '../../core/tmux-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface StartOptions {
  port: string;
  browser: boolean;
  web?: boolean;
  attach?: boolean;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const projectRoot = process.cwd();
  const port = parseInt(options.port, 10);

  console.log(chalk.blue('🎼 Dure'));
  console.log(chalk.gray(`Project: ${projectRoot}`));
  console.log();

  // Check if tmux is available
  if (!TmuxManager.isTmuxAvailable()) {
    console.error(chalk.red('Error: tmux is not installed.'));
    console.error(chalk.gray('Please install tmux to use Dure.'));
    console.error(chalk.gray('  macOS: brew install tmux'));
    console.error(chalk.gray('  Ubuntu: sudo apt-get install tmux'));
    process.exit(1);
  }

  // Initialize config
  console.log(chalk.gray('Initializing configuration...'));
  const configManager = new ConfigManager(projectRoot);
  configManager.initialize();

  // Initialize runs directory
  const runManager = new RunManager(projectRoot);
  runManager.initialize();

  // Load configuration
  const config = configManager.loadConfig();
  const sessionName = config.global.tmux_session_prefix;

  // Check if session already exists
  const tmuxManager = new TmuxManager(sessionName, projectRoot);
  const sessionExists = tmuxManager.sessionExists();

  if (sessionExists) {
    console.log(chalk.yellow(`Session "${sessionName}" already exists.`));
  } else {
    // Create tmux session with 6 panes
    console.log(chalk.gray('Creating tmux session...'));
    tmuxManager.createSession();

    // Start web server in pane 5 (always needed for API)
    const distRoot = join(__dirname, '..', '..');
    const serverScript = join(distRoot, 'server', 'standalone.js');
    console.log(chalk.gray(`Starting server on port ${port}...`));
    const serverCommand = `node "${serverScript}" --port ${port} --project-root "${projectRoot}"`;
    tmuxManager.sendKeys('server', serverCommand);

    // Show server info in debug shell
    tmuxManager.showServerInfo(port);

    console.log();
    console.log(chalk.green('✓ Dure is running'));
    console.log(chalk.gray(`  Server: http://localhost:${port}`));
    console.log();
  }

  // Small delay to let server start
  await new Promise(resolve => setTimeout(resolve, 500));

  const distRoot = join(__dirname, '..', '..');

  // Option 1: --attach → tmux attach (legacy mode)
  if (options.attach) {
    console.log(chalk.gray('Attaching to tmux session...'));
    console.log(chalk.gray('Press Ctrl+B, D to detach from session'));
    console.log();

    const attach = spawn('tmux', ['attach-session', '-t', sessionName], {
      stdio: 'inherit',
    });

    attach.on('close', (code) => {
      console.log();
      console.log(chalk.gray('Detached from Dure session.'));
      console.log(chalk.gray(`To reattach: dure start --attach`));
      console.log(chalk.gray(`To stop: dure stop`));
      process.exit(code || 0);
    });
    return;
  }

  // Option 2: --web → open web dashboard
  if (options.web) {
    const url = `http://localhost:${port}`;
    console.log(chalk.blue('🌐 Opening web dashboard...'));
    console.log(chalk.white(`URL: ${chalk.cyan(url)}`));
    console.log();

    // Open browser
    setTimeout(() => {
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
    }, 500);

    console.log();
    console.log(chalk.gray('Dure is running in the background.'));
    console.log(chalk.gray(`To monitor with TUI: dure monitor`));
    console.log(chalk.gray(`To attach to tmux: dure start --attach`));
    console.log(chalk.gray(`To stop: dure stop`));

    // Keep process alive for a moment to ensure browser opens
    await new Promise(resolve => setTimeout(resolve, 1500));
    return;
  }

  // Default: TUI dashboard
  const latestRunId = findLatestRunId(projectRoot);
  if (!latestRunId) {
    console.log(chalk.yellow('No runs found yet. TUI will wait for a run.'));
  }

  const tuiScript = join(distRoot, 'tui', 'ink', 'index.js');
  if (!existsSync(tuiScript)) {
    console.error(chalk.red('Error: TUI not found.'));
    console.error(chalk.gray(`Expected at: ${tuiScript}`));
    console.error(chalk.gray('Make sure the project is built: npm run build'));
    console.log();
    console.log(chalk.gray('Falling back to tmux attach...'));

    const attach = spawn('tmux', ['attach-session', '-t', sessionName], {
      stdio: 'inherit',
    });

    attach.on('close', (code) => {
      process.exit(code || 0);
    });
    return;
  }

  // Clear screen before launching TUI for full-screen experience
  process.stdout.write('\x1b[2J\x1b[H');

  const tuiArgs = ['--project-root', projectRoot];
  if (latestRunId) {
    tuiArgs.push('--run-id', latestRunId);
  }

  const tui = spawn('node', [tuiScript, ...tuiArgs], {
    stdio: 'inherit',
  });

  tui.on('close', (code) => {
    console.log();
    console.log(chalk.gray('TUI closed. Dure continues in background.'));
    console.log(chalk.gray(`To reattach: dure start`));
    console.log(chalk.gray(`To open web: dure start --web`));
    console.log(chalk.gray(`To stop: dure stop`));
    process.exit(code || 0);
  });
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
