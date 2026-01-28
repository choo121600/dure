/**
 * Interactive CLI Session Capture Utility
 *
 * Captures interactive CLI sessions using tmux and converts them to SVG.
 * No additional dependencies required - uses tmux if available.
 */

import { spawn, execSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { getThemeColors, DEFAULT_THEME, type ThemeName } from './themes.js';
import type { AnsiToSvgOptions } from '../../types/ansi-to-svg.js';

// ansi-to-svg for converting captured output
const require = createRequire(import.meta.url);
const ansiToSvg: (input: string, options?: AnsiToSvgOptions) => string = require('ansi-to-svg');

/**
 * A single step in an interactive session
 */
export interface InteractiveStep {
  /** Command or input to send */
  input: string;
  /** Wait for this pattern in output before proceeding (regex) */
  waitFor?: string;
  /** Fixed wait time in milliseconds */
  waitMs?: number;
  /** Description for logging */
  description?: string;
}

/**
 * An interactive example definition
 */
export interface InteractiveExample {
  /** Unique identifier for the example */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this example demonstrates */
  description: string;
  /** Steps to execute */
  steps: InteractiveStep[];
  /** Output filename (without path) */
  outputFile?: string;
}

/**
 * Options for capturing an interactive session
 */
export interface CaptureOptions {
  /** Steps to execute */
  script: InteractiveStep[];
  /** Output file path */
  outputFile: string;
  /** Color theme */
  theme?: string;
  /** Title for the SVG */
  title?: string;
  /** Terminal width */
  width?: number;
  /** Terminal height */
  height?: number;
  /** Working directory for commands */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Check if tmux is installed
 */
export function isTmuxAvailable(): boolean {
  try {
    execSync('which tmux', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a unique session name
 */
function generateSessionName(): string {
  return `dure-capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a pattern to appear in tmux pane output
 */
async function waitForPattern(
  sessionName: string,
  pattern: string,
  timeoutMs: number = 10000
): Promise<boolean> {
  const regex = new RegExp(pattern);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const output = execSync(
        `tmux capture-pane -t ${sessionName} -p`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      if (regex.test(output)) {
        return true;
      }
    } catch {
      // Session might not exist yet
    }

    await sleep(100);
  }

  return false;
}

/**
 * Capture an interactive CLI session using tmux
 */
export async function captureInteractiveSession(
  options: CaptureOptions
): Promise<{ success: boolean; error?: string }> {
  // Check tmux availability
  if (!isTmuxAvailable()) {
    return {
      success: false,
      error: 'tmux is not installed. Interactive capture requires tmux.',
    };
  }

  const sessionName = generateSessionName();
  const width = options.width || 100;
  const height = options.height || 30;
  const theme = options.theme || DEFAULT_THEME;
  const cwd = options.cwd || process.cwd();

  try {
    // Create tmux session
    spawnSync('tmux', [
      'new-session',
      '-d',
      '-s', sessionName,
      '-x', width.toString(),
      '-y', height.toString(),
    ], {
      cwd,
      env: { ...process.env, ...options.env },
    });

    // Wait for session to be ready
    await sleep(200);

    // Execute each step
    for (const step of options.script) {
      // Log step if description provided
      if (step.description) {
        process.stderr.write(`  Step: ${step.description}\n`);
      }

      // Send the input
      execSync(
        `tmux send-keys -t ${sessionName} ${JSON.stringify(step.input)} Enter`,
        { stdio: 'pipe' }
      );

      // Wait for output pattern or fixed time
      if (step.waitFor) {
        const found = await waitForPattern(sessionName, step.waitFor);
        if (!found) {
          process.stderr.write(
            `  Warning: Pattern "${step.waitFor}" not found within timeout\n`
          );
        }
      }

      if (step.waitMs) {
        await sleep(step.waitMs);
      }

      // Default small delay between steps
      if (!step.waitFor && !step.waitMs) {
        await sleep(500);
      }
    }

    // Final delay to ensure all output is captured
    await sleep(300);

    // Capture the pane content
    const output = execSync(
      `tmux capture-pane -t ${sessionName} -p -S -`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    // Convert to SVG
    const colors = getThemeColors(theme);
    let svg = ansiToSvg(output.trim(), {
      paddingTop: 16,
      paddingLeft: 16,
      paddingBottom: 16,
      paddingRight: 16,
      fontSize: 14,
      lineHeight: 18,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      colors,
    });

    // Add title if provided
    if (options.title) {
      svg = `<!-- ${options.title} -->\n${svg}`;
    }

    // Write output file
    mkdirSync(dirname(options.outputFile), { recursive: true });
    writeFileSync(options.outputFile, svg, 'utf-8');

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
    };
  } finally {
    // Clean up tmux session
    try {
      execSync(`tmux kill-session -t ${sessionName}`, { stdio: 'pipe' });
    } catch {
      // Session might already be gone
    }
  }
}

/**
 * Load interactive examples from JSON file
 */
export function loadInteractiveExamples(filePath: string): InteractiveExample[] {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.examples || [];
  } catch {
    return [];
  }
}

/**
 * Get an interactive example by ID
 */
export function getInteractiveExample(
  examples: InteractiveExample[],
  id: string
): InteractiveExample | undefined {
  return examples.find((ex) => ex.id === id);
}

/**
 * Run an interactive example and generate SVG
 */
export async function runInteractiveExample(
  example: InteractiveExample,
  options: {
    outputDir: string;
    theme?: string;
    cwd?: string;
  }
): Promise<{ success: boolean; outputFile?: string; error?: string }> {
  const outputFile = join(
    options.outputDir,
    example.outputFile || `interactive_${example.id}.svg`
  );

  const result = await captureInteractiveSession({
    script: example.steps,
    outputFile,
    theme: options.theme,
    title: `Interactive Example: ${example.name}`,
    cwd: options.cwd,
  });

  if (result.success) {
    return { success: true, outputFile };
  }

  return { success: false, error: result.error };
}
