/**
 * CLI Screenshot Generation and Verification Command
 *
 * Generates SVG screenshots of all CLI --help outputs for documentation.
 * Uses hash-based change detection to only regenerate modified commands.
 *
 * Usage:
 *   dure screenshots generate          # Regenerate only changed screenshots
 *   dure screenshots generate --force  # Regenerate all screenshots
 *   dure screenshots verify            # Verify screenshots are up to date (CI)
 */

import { Command } from 'commander';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
  readlinkSync,
  statSync,
} from 'fs';
import chalk from 'chalk';
import {
  getAvailableThemes,
  getTheme,
  isValidTheme,
  DEFAULT_THEME,
  type ThemeName,
} from '../utils/themes.js';
import {
  isTmuxAvailable,
  loadInteractiveExamples,
  getInteractiveExample,
  runInteractiveExample,
  type InteractiveExample,
} from '../utils/interactive-capture.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const SCREENSHOTS_DIR = join(PROJECT_ROOT, 'docs/images/cli');
const HASH_DIR = join(SCREENSHOTS_DIR, '.hashes');
const INTERACTIVE_EXAMPLES_FILE = join(PROJECT_ROOT, 'docs/assets/interactive-examples.json');

interface CommandInfo {
  path: string[]; // e.g., ['start'], ['screenshots', 'generate']
  name: string;
  description: string;
  options: Array<{
    flags: string;
    description: string;
    defaultValue?: string;
  }>;
}

interface GenerateResult {
  generated: string[];
  skipped: string[];
  failed: string[];
  errors: Map<string, string>;
}

/**
 * Extract all commands from a Commander program
 */
function extractCommands(program: Command, parentPath: string[] = []): CommandInfo[] {
  const commands: CommandInfo[] = [];

  for (const cmd of program.commands) {
    const path = [...parentPath, cmd.name()];

    // Add this command
    commands.push({
      path,
      name: cmd.name(),
      description: cmd.description(),
      options: cmd.options.map((opt) => ({
        flags: opt.flags,
        description: opt.description || '',
        defaultValue: opt.defaultValue?.toString(),
      })),
    });

    // Recursively add subcommands
    if (cmd.commands && cmd.commands.length > 0) {
      commands.push(...extractCommands(cmd, path));
    }
  }

  return commands;
}

/**
 * Compute MD5 hash of command definition for change detection
 */
function computeCommandHash(cmd: CommandInfo): string {
  const definition = {
    name: cmd.name,
    description: cmd.description,
    options: cmd.options,
  };

  return createHash('md5').update(JSON.stringify(definition)).digest('hex');
}

/**
 * Get the output filename for a command
 */
function getOutputFilename(cmdPath: string[]): string {
  if (cmdPath.length === 0) {
    return 'output_.svg'; // Root command
  }
  return `output_${cmdPath.join('_')}.svg`;
}

/**
 * Get the hash filename for a command
 */
function getHashFilename(cmdPath: string[]): string {
  if (cmdPath.length === 0) {
    return 'output_.txt';
  }
  return `output_${cmdPath.join('_')}.txt`;
}

/**
 * Read stored hash for a command
 */
function readStoredHash(cmdPath: string[]): string | null {
  const hashFile = join(HASH_DIR, getHashFilename(cmdPath));
  if (existsSync(hashFile)) {
    return readFileSync(hashFile, 'utf-8').trim();
  }
  return null;
}

/**
 * Write hash for a command
 */
function writeHash(cmdPath: string[], hash: string): void {
  mkdirSync(HASH_DIR, { recursive: true });
  const hashFile = join(HASH_DIR, getHashFilename(cmdPath));
  writeFileSync(hashFile, hash, 'utf-8');
}

/**
 * Generate screenshot for a single command
 */
async function generateScreenshot(
  cmdPath: string[],
  theme: string = DEFAULT_THEME
): Promise<void> {
  const outputFile = join(SCREENSHOTS_DIR, getOutputFilename(cmdPath));
  const cmdString = cmdPath.length === 0 ? 'dure' : `dure ${cmdPath.join(' ')}`;

  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DURE_RECORD_OUTPUT_FILE: outputFile,
    DURE_RECORD_TITLE: `Command: ${cmdString} --help`,
    DURE_RECORD_WIDTH: '100',
    DURE_RECORD_THEME: theme,
    FORCE_COLOR: '1', // Force chalk colors in non-TTY
  };

  const cliPath = join(PROJECT_ROOT, 'dist/cli/index.js');
  const args = [...cmdPath, '--help'];

  return new Promise((resolve, reject) => {
    const child = spawn('node', [cliPath, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Exit code ${code}: ${stderr}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Generate screenshots for all commands
 */
async function generateAllScreenshots(
  program: Command,
  options: { force?: boolean; commands?: string[]; theme?: string }
): Promise<GenerateResult> {
  const result: GenerateResult = {
    generated: [],
    skipped: [],
    failed: [],
    errors: new Map(),
  };

  // Get all commands including root
  const allCommands = extractCommands(program);

  // Add root command
  const rootCommand: CommandInfo = {
    path: [],
    name: '',
    description: program.description(),
    options: program.options.map((opt) => ({
      flags: opt.flags,
      description: opt.description || '',
      defaultValue: opt.defaultValue?.toString(),
    })),
  };

  const commandsToProcess = [rootCommand, ...allCommands];

  // Filter by specific commands if provided
  let filteredCommands = commandsToProcess;
  if (options.commands && options.commands.length > 0) {
    filteredCommands = commandsToProcess.filter((cmd) => {
      const cmdName = cmd.path.join(' ') || 'root';
      return options.commands!.some(
        (c) => cmdName === c || cmdName.startsWith(c + ' ')
      );
    });
  }

  // Process commands concurrently with a limit
  const concurrencyLimit = 4;
  const queue = [...filteredCommands];

  async function processQueue(): Promise<void> {
    while (queue.length > 0) {
      const cmd = queue.shift()!;
      const cmdName = cmd.path.length === 0 ? '(root)' : cmd.path.join(' ');
      const hash = computeCommandHash(cmd);
      const storedHash = readStoredHash(cmd.path);

      // Check if regeneration is needed
      if (!options.force && storedHash === hash) {
        const outputFile = join(SCREENSHOTS_DIR, getOutputFilename(cmd.path));
        if (existsSync(outputFile)) {
          result.skipped.push(cmdName);
          continue;
        }
      }

      try {
        await generateScreenshot(cmd.path, options.theme);
        writeHash(cmd.path, hash);
        result.generated.push(cmdName);
      } catch (err) {
        result.failed.push(cmdName);
        result.errors.set(cmdName, (err as Error).message);
      }
    }
  }

  // Run concurrent workers
  const workers = Array(Math.min(concurrencyLimit, filteredCommands.length))
    .fill(null)
    .map(() => processQueue());

  await Promise.all(workers);

  return result;
}

/**
 * Verify all screenshots are up to date
 */
async function verifyScreenshots(program: Command): Promise<{
  outdated: string[];
  missing: string[];
  upToDate: string[];
}> {
  const result = {
    outdated: [] as string[],
    missing: [] as string[],
    upToDate: [] as string[],
  };

  const allCommands = extractCommands(program);
  const rootCommand: CommandInfo = {
    path: [],
    name: '',
    description: program.description(),
    options: program.options.map((opt) => ({
      flags: opt.flags,
      description: opt.description || '',
      defaultValue: opt.defaultValue?.toString(),
    })),
  };

  const commandsToCheck = [rootCommand, ...allCommands];

  for (const cmd of commandsToCheck) {
    const cmdName = cmd.path.length === 0 ? '(root)' : cmd.path.join(' ');
    const outputFile = join(SCREENSHOTS_DIR, getOutputFilename(cmd.path));
    const hash = computeCommandHash(cmd);
    const storedHash = readStoredHash(cmd.path);

    if (!existsSync(outputFile)) {
      result.missing.push(cmdName);
    } else if (storedHash !== hash) {
      result.outdated.push(cmdName);
    } else {
      result.upToDate.push(cmdName);
    }
  }

  return result;
}

// Version archive constants
const CURRENT_LINK = join(SCREENSHOTS_DIR, 'current');

/**
 * Validate version string format (semver-like: vX.Y.Z)
 */
function isValidVersion(version: string): boolean {
  return /^v?\d+\.\d+\.\d+(-[\w.]+)?$/.test(version);
}

/**
 * Normalize version string to include 'v' prefix
 */
function normalizeVersion(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}

/**
 * Get path to version archive directory
 */
function getVersionDir(version: string): string {
  return join(SCREENSHOTS_DIR, normalizeVersion(version));
}

/**
 * Check if a path is a symlink
 */
function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Get all SVG files in the screenshots directory (excluding version dirs)
 */
function getCurrentScreenshots(): string[] {
  if (!existsSync(SCREENSHOTS_DIR)) {
    return [];
  }

  return readdirSync(SCREENSHOTS_DIR).filter((file) => {
    const filePath = join(SCREENSHOTS_DIR, file);
    return (
      file.endsWith('.svg') &&
      !lstatSync(filePath).isDirectory() &&
      !isSymlink(filePath)
    );
  });
}

/**
 * Get list of archived versions
 */
function getArchivedVersions(): string[] {
  if (!existsSync(SCREENSHOTS_DIR)) {
    return [];
  }

  return readdirSync(SCREENSHOTS_DIR)
    .filter((name) => {
      const fullPath = join(SCREENSHOTS_DIR, name);
      return (
        isValidVersion(name) &&
        existsSync(fullPath) &&
        lstatSync(fullPath).isDirectory()
      );
    })
    .sort((a, b) => {
      // Sort by semver (newest first)
      const parseVersion = (v: string) => {
        const match = v.match(/^v?(\d+)\.(\d+)\.(\d+)/);
        if (!match) return [0, 0, 0];
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      };
      const [aMaj, aMin, aPat] = parseVersion(a);
      const [bMaj, bMin, bPat] = parseVersion(b);
      if (aMaj !== bMaj) return bMaj - aMaj;
      if (aMin !== bMin) return bMin - aMin;
      return bPat - aPat;
    });
}

/**
 * Archive current screenshots to a version directory
 */
function archiveScreenshots(
  version: string,
  options: { dryRun?: boolean }
): {
  copied: string[];
  skipped: string[];
  versionDir: string;
} {
  const normalizedVersion = normalizeVersion(version);
  const versionDir = getVersionDir(normalizedVersion);
  const screenshots = getCurrentScreenshots();

  const result = {
    copied: [] as string[],
    skipped: [] as string[],
    versionDir,
  };

  if (screenshots.length === 0) {
    return result;
  }

  if (!options.dryRun) {
    mkdirSync(versionDir, { recursive: true });
  }

  for (const file of screenshots) {
    const srcPath = join(SCREENSHOTS_DIR, file);
    const destPath = join(versionDir, file);

    // Skip if destination exists and has same content
    if (existsSync(destPath)) {
      const srcHash = createHash('md5')
        .update(readFileSync(srcPath))
        .digest('hex');
      const destHash = createHash('md5')
        .update(readFileSync(destPath))
        .digest('hex');

      if (srcHash === destHash) {
        result.skipped.push(file);
        continue;
      }
    }

    if (!options.dryRun) {
      copyFileSync(srcPath, destPath);
    }
    result.copied.push(file);
  }

  return result;
}

/**
 * Update the 'current' symlink to point to a version
 */
function updateCurrentLink(version: string, options: { dryRun?: boolean }): void {
  const normalizedVersion = normalizeVersion(version);
  const versionDir = getVersionDir(normalizedVersion);

  if (!existsSync(versionDir)) {
    throw new Error(`Version directory does not exist: ${versionDir}`);
  }

  if (options.dryRun) {
    return;
  }

  // Remove existing symlink if it exists
  if (existsSync(CURRENT_LINK) || isSymlink(CURRENT_LINK)) {
    unlinkSync(CURRENT_LINK);
  }

  // Create relative symlink
  const relativePath = relative(dirname(CURRENT_LINK), versionDir);

  // On Windows, use directory junction or copy as fallback
  if (process.platform === 'win32') {
    try {
      symlinkSync(relativePath, CURRENT_LINK, 'junction');
    } catch {
      // Fallback: copy files instead of symlink on Windows
      mkdirSync(CURRENT_LINK, { recursive: true });
      for (const file of readdirSync(versionDir)) {
        if (file.endsWith('.svg')) {
          copyFileSync(join(versionDir, file), join(CURRENT_LINK, file));
        }
      }
    }
  } else {
    symlinkSync(relativePath, CURRENT_LINK);
  }
}

/**
 * Print generation results
 */
function printResults(result: GenerateResult): void {
  if (result.generated.length > 0) {
    console.log(chalk.green(`\n  Generated (${result.generated.length}):`));
    result.generated.forEach((cmd) => console.log(chalk.green(`    + ${cmd}`)));
  }

  if (result.skipped.length > 0) {
    console.log(chalk.dim(`\n  Skipped (${result.skipped.length}):`));
    result.skipped.forEach((cmd) => console.log(chalk.dim(`    - ${cmd}`)));
  }

  if (result.failed.length > 0) {
    console.log(chalk.red(`\n  Failed (${result.failed.length}):`));
    result.failed.forEach((cmd) => {
      console.log(chalk.red(`    x ${cmd}`));
      const error = result.errors.get(cmd);
      if (error) {
        console.log(chalk.red(`      ${error}`));
      }
    });
  }

  console.log('');
}

/**
 * Create and return the screenshots command
 */
export function createScreenshotsCommand(): Command {
  const screenshots = new Command('screenshots')
    .description('Manage CLI screenshots for documentation')
    .addHelpText(
      'after',
      `
Examples:
  $ dure screenshots generate          # Regenerate only changed
  $ dure screenshots generate --force  # Regenerate all
  $ dure screenshots verify            # Verify for CI
`
    );

  screenshots
    .command('generate')
    .description('Generate or update CLI screenshots')
    .option('-f, --force', 'Regenerate all screenshots')
    .option('-c, --command <cmd...>', 'Only regenerate specific commands')
    .option(
      '-t, --theme <theme>',
      `Color theme (${getAvailableThemes().join(', ')})`,
      DEFAULT_THEME
    )
    .action(async (options) => {
      // Validate theme
      if (options.theme && !isValidTheme(options.theme)) {
        console.error(
          chalk.red(`\nError: Unknown theme "${options.theme}"\n`)
        );
        console.log(`Available themes: ${getAvailableThemes().join(', ')}\n`);
        process.exit(1);
      }

      const themeName = options.theme || DEFAULT_THEME;
      console.log(
        chalk.bold(`\nGenerating CLI screenshots (theme: ${themeName})...\n`)
      );

      // We need to get the root program to extract all commands
      // Import it dynamically to avoid circular dependency
      const { createProgram } = await import('../program.js');
      const program = createProgram();

      const result = await generateAllScreenshots(program, {
        force: options.force,
        commands: options.command,
        theme: themeName,
      });

      printResults(result);

      console.log(chalk.bold('Summary:'));
      console.log(`  Generated: ${chalk.green(result.generated.length)}`);
      console.log(`  Skipped:   ${chalk.dim(result.skipped.length)}`);
      console.log(`  Failed:    ${chalk.red(result.failed.length)}`);
      console.log(`\n  Output:    ${chalk.cyan(SCREENSHOTS_DIR)}\n`);

      if (result.failed.length > 0) {
        process.exit(1);
      }
    });

  screenshots
    .command('verify')
    .description('Verify all screenshots are up to date (for CI)')
    .action(async () => {
      console.log(chalk.bold('\nVerifying CLI screenshots...\n'));

      const { createProgram } = await import('../program.js');
      const program = createProgram();

      const result = await verifyScreenshots(program);

      const hasIssues = result.outdated.length > 0 || result.missing.length > 0;

      if (result.missing.length > 0) {
        console.log(chalk.red(`  Missing (${result.missing.length}):`));
        result.missing.forEach((cmd) => console.log(chalk.red(`    - ${cmd}`)));
      }

      if (result.outdated.length > 0) {
        console.log(chalk.yellow(`\n  Outdated (${result.outdated.length}):`));
        result.outdated.forEach((cmd) =>
          console.log(chalk.yellow(`    - ${cmd}`))
        );
      }

      if (!hasIssues) {
        console.log(
          chalk.green(`  All ${result.upToDate.length} screenshots are up to date.\n`)
        );
        return;
      }

      console.log(chalk.bold('\nSummary:'));
      console.log(`  Up to date: ${chalk.green(result.upToDate.length)}`);
      console.log(`  Missing:    ${chalk.red(result.missing.length)}`);
      console.log(`  Outdated:   ${chalk.yellow(result.outdated.length)}`);

      console.log(chalk.red('\nScreenshots are out of date!'));
      console.log(chalk.dim('Run: dure screenshots generate\n'));
      process.exit(1);
    });

  screenshots
    .command('list')
    .description('List all CLI commands that will be screenshotted')
    .action(async () => {
      const { createProgram } = await import('../program.js');
      const program = createProgram();

      const allCommands = extractCommands(program);

      console.log(chalk.bold('\nCLI Commands:\n'));
      console.log(chalk.dim('  (root) - dure --help'));
      allCommands.forEach((cmd) => {
        const cmdPath = cmd.path.join(' ');
        console.log(`  ${cmdPath} - ${chalk.dim(cmd.description || 'No description')}`);
      });
      console.log(`\n  Total: ${allCommands.length + 1} commands\n`);
    });

  screenshots
    .command('themes')
    .description('List available color themes for screenshots')
    .action(() => {
      console.log(chalk.bold('\nAvailable Themes:\n'));

      const themes = getAvailableThemes();
      themes.forEach((themeName) => {
        const theme = getTheme(themeName);
        if (theme) {
          const isDefault = themeName === DEFAULT_THEME;
          const marker = isDefault ? chalk.green(' (default)') : '';
          const bgColor = theme.colors.backgroundColor;

          console.log(`  ${chalk.cyan(themeName)}${marker}`);
          console.log(`    ${chalk.dim(theme.description)}`);
          console.log(`    Background: ${chalk.hex(bgColor)(bgColor)}`);
          console.log('');
        }
      });

      console.log(chalk.dim('Usage: dure screenshots generate --theme <name>\n'));
    });

  screenshots
    .command('archive <version>')
    .description('Archive current screenshots to a version directory')
    .option('-n, --dry-run', 'Show what would be archived without copying')
    .action((version, options) => {
      // Validate version format
      if (!isValidVersion(version)) {
        console.error(
          chalk.red(`\nError: Invalid version format "${version}"\n`)
        );
        console.log(chalk.dim('Expected format: vX.Y.Z (e.g., v0.2.0)\n'));
        process.exit(1);
      }

      const normalizedVersion = normalizeVersion(version);
      const dryRunLabel = options.dryRun ? chalk.yellow(' [DRY RUN]') : '';

      console.log(
        chalk.bold(`\nArchiving screenshots to ${normalizedVersion}...${dryRunLabel}\n`)
      );

      const currentScreenshots = getCurrentScreenshots();

      if (currentScreenshots.length === 0) {
        console.log(chalk.yellow('  No screenshots found to archive.\n'));
        console.log(chalk.dim('Run: dure screenshots generate\n'));
        return;
      }

      const result = archiveScreenshots(version, { dryRun: options.dryRun });

      if (result.copied.length > 0) {
        console.log(chalk.green(`  Copied (${result.copied.length}):`));
        result.copied.forEach((file) =>
          console.log(chalk.green(`    + ${file}`))
        );
      }

      if (result.skipped.length > 0) {
        console.log(chalk.dim(`\n  Unchanged (${result.skipped.length}):`));
        result.skipped.forEach((file) =>
          console.log(chalk.dim(`    - ${file}`))
        );
      }

      // Update 'current' symlink
      if (!options.dryRun && result.copied.length > 0) {
        try {
          updateCurrentLink(version, { dryRun: options.dryRun });
          console.log(
            chalk.cyan(`\n  Updated 'current' symlink -> ${normalizedVersion}`)
          );
        } catch (err) {
          console.log(
            chalk.yellow(`\n  Warning: Could not update 'current' symlink: ${(err as Error).message}`)
          );
        }
      }

      console.log(chalk.bold('\nSummary:'));
      console.log(`  Version:   ${chalk.cyan(normalizedVersion)}`);
      console.log(`  Copied:    ${chalk.green(result.copied.length)}`);
      console.log(`  Unchanged: ${chalk.dim(result.skipped.length)}`);
      console.log(`  Output:    ${chalk.cyan(result.versionDir)}\n`);
    });

  screenshots
    .command('versions')
    .description('List all archived screenshot versions')
    .action(() => {
      console.log(chalk.bold('\nArchived Versions:\n'));

      const versions = getArchivedVersions();

      if (versions.length === 0) {
        console.log(chalk.dim('  No archived versions found.\n'));
        console.log(chalk.dim('Run: dure screenshots archive <version>\n'));
        return;
      }

      // Check what 'current' points to
      let currentTarget: string | null = null;
      if (isSymlink(CURRENT_LINK)) {
        try {
          const linkTarget = readlinkSync(CURRENT_LINK);
          currentTarget = linkTarget.split('/').pop() || null;
        } catch {
          // Ignore errors reading symlink
        }
      }

      versions.forEach((version) => {
        const versionDir = getVersionDir(version);
        const files = readdirSync(versionDir).filter((f) => f.endsWith('.svg'));
        const isCurrent = version === currentTarget;
        const currentMarker = isCurrent ? chalk.green(' <- current') : '';

        // Get modification time
        let modTime = '';
        try {
          const stat = statSync(versionDir);
          modTime = stat.mtime.toISOString().split('T')[0];
        } catch {
          // Ignore
        }

        console.log(
          `  ${chalk.cyan(version)}${currentMarker} - ${chalk.dim(`${files.length} files, ${modTime}`)}`
        );
      });

      console.log(`\n  Total: ${versions.length} versions\n`);
    });

  screenshots
    .command('interactive [example-id]')
    .description('Capture an interactive CLI session as SVG')
    .option(
      '-t, --theme <theme>',
      `Color theme (${getAvailableThemes().join(', ')})`,
      DEFAULT_THEME
    )
    .action(async (exampleId, options) => {
      // Check tmux availability
      if (!isTmuxAvailable()) {
        console.error(chalk.red('\nError: tmux is not installed.\n'));
        console.log(
          chalk.dim('Interactive capture requires tmux. Install it with:\n')
        );
        console.log(chalk.dim('  macOS:  brew install tmux'));
        console.log(chalk.dim('  Ubuntu: apt install tmux\n'));
        process.exit(1);
      }

      // Validate theme
      if (options.theme && !isValidTheme(options.theme)) {
        console.error(
          chalk.red(`\nError: Unknown theme "${options.theme}"\n`)
        );
        console.log(`Available themes: ${getAvailableThemes().join(', ')}\n`);
        process.exit(1);
      }

      // Load examples
      const examples = loadInteractiveExamples(INTERACTIVE_EXAMPLES_FILE);

      if (examples.length === 0) {
        console.error(chalk.red('\nError: No interactive examples found.\n'));
        console.log(
          chalk.dim(`Expected file: ${INTERACTIVE_EXAMPLES_FILE}\n`)
        );
        process.exit(1);
      }

      // If no example ID provided, show list
      if (!exampleId) {
        console.log(chalk.bold('\nInteractive Examples:\n'));
        examples.forEach((ex) => {
          console.log(`  ${chalk.cyan(ex.id)}`);
          console.log(`    ${chalk.dim(ex.description)}`);
        });
        console.log(
          chalk.dim('\nUsage: dure screenshots interactive <example-id>\n')
        );
        return;
      }

      // Find the example
      const example = getInteractiveExample(examples, exampleId);

      if (!example) {
        console.error(
          chalk.red(`\nError: Example "${exampleId}" not found.\n`)
        );
        console.log('Available examples:');
        examples.forEach((ex) =>
          console.log(`  - ${ex.id}: ${chalk.dim(ex.description)}`)
        );
        console.log('');
        process.exit(1);
      }

      console.log(
        chalk.bold(`\nCapturing interactive session: ${example.name}\n`)
      );
      console.log(chalk.dim(`  ${example.description}\n`));

      const result = await runInteractiveExample(example, {
        outputDir: SCREENSHOTS_DIR,
        theme: options.theme,
        cwd: PROJECT_ROOT,
      });

      if (result.success) {
        console.log(chalk.green(`\n  Generated: ${result.outputFile}\n`));
      } else {
        console.error(chalk.red(`\n  Failed: ${result.error}\n`));
        process.exit(1);
      }
    });

  screenshots
    .command('interactive-list')
    .description('List available interactive examples')
    .action(() => {
      const examples = loadInteractiveExamples(INTERACTIVE_EXAMPLES_FILE);

      console.log(chalk.bold('\nInteractive Examples:\n'));

      if (examples.length === 0) {
        console.log(chalk.dim('  No examples defined.\n'));
        console.log(chalk.dim(`  Define examples in: ${INTERACTIVE_EXAMPLES_FILE}\n`));
        return;
      }

      examples.forEach((example) => {
        console.log(`  ${chalk.cyan(example.id)}`);
        console.log(`    Name: ${example.name}`);
        console.log(`    ${chalk.dim(example.description)}`);
        console.log(`    Steps: ${example.steps.length}`);
        if (example.outputFile) {
          console.log(`    Output: ${chalk.dim(example.outputFile)}`);
        }
        console.log('');
      });

      console.log(`  Total: ${examples.length} examples\n`);
      console.log(
        chalk.dim('Usage: dure screenshots interactive <example-id>\n')
      );
    });

  return screenshots;
}

// Also export the old-style function for backward compatibility
export function screenshotsCommand(program: Command): void {
  program.addCommand(createScreenshotsCommand());
}
