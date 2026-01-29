import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { ConfigManager } from '../../config/config-manager.js';
import { RunManager } from '../../core/run-manager.js';

/**
 * Claude Code settings.local.json for Dure
 * This hook blocks direct test execution inside Dure agents
 */
const CLAUDE_SETTINGS = {
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command:
              'node -e "const cmd = process.env.CLAUDE_TOOL_INPUT || \'\'; const isDureAgent = process.env.DURE_AGENT_MODE === \'1\'; if (!isDureAgent) process.exit(0); const blocked = [\'npm test\', \'npm run test\', \'npx vitest\', \'npx jest\', \'vitest run\', \'vitest \', \'jest \', \'pnpm test\', \'yarn test\']; const isBlocked = blocked.some(b => cmd.includes(b)); if (isBlocked) { console.error(\'BLOCKED: Test execution is not allowed inside Dure agents. External test runner will handle this.\'); process.exit(2); }"',
          },
        ],
      },
    ],
  },
};

export async function initCommand(): Promise<void> {
  const projectRoot = process.cwd();

  console.log(chalk.blue('🎼 Dure Init'));
  console.log(chalk.gray(`Project: ${projectRoot}`));
  console.log();

  // 1. Initialize .dure/config
  console.log(chalk.gray('Creating .dure/config...'));
  const configManager = new ConfigManager(projectRoot);
  configManager.initialize();
  console.log(chalk.green('  ✓ .dure/config/ created'));

  // 2. Initialize .dure/runs
  console.log(chalk.gray('Creating .dure/runs...'));
  const runManager = new RunManager(projectRoot);
  runManager.initialize();
  console.log(chalk.green('  ✓ .dure/runs/ created'));

  // 3. Initialize .claude/settings.local.json
  console.log(chalk.gray('Creating .claude/settings.local.json...'));
  const claudeDir = join(projectRoot, '.claude');
  const settingsPath = join(claudeDir, 'settings.local.json');

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  if (existsSync(settingsPath)) {
    // Merge with existing settings
    try {
      const existing = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const merged = mergeClaudeSettings(existing, CLAUDE_SETTINGS);
      writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
      console.log(chalk.green('  ✓ .claude/settings.local.json updated (merged with existing)'));
    } catch {
      console.log(chalk.yellow('  ⚠ Could not parse existing settings, skipping merge'));
    }
  } else {
    writeFileSync(settingsPath, JSON.stringify(CLAUDE_SETTINGS, null, 2), 'utf-8');
    console.log(chalk.green('  ✓ .claude/settings.local.json created'));
  }

  console.log();
  console.log(chalk.green('✓ Dure initialized successfully!'));
  console.log();
  console.log(chalk.white('Next steps:'));
  console.log(chalk.gray('  1. Run `dure start` to start the Dure session'));
  console.log(chalk.gray('  2. Open the dashboard in your browser'));
  console.log(chalk.gray('  3. Create a new run with your briefing'));
  console.log();
}

/**
 * Merge Claude settings, preserving existing hooks while adding Dure hooks
 */
function mergeClaudeSettings(
  existing: Record<string, unknown>,
  dureSettings: typeof CLAUDE_SETTINGS
): Record<string, unknown> {
  const result = { ...existing };

  if (!result.hooks) {
    result.hooks = {};
  }

  const hooks = result.hooks as Record<string, unknown[]>;

  if (!hooks.PreToolUse) {
    hooks.PreToolUse = [];
  }

  // Check if Dure hook already exists
  const preToolUse = hooks.PreToolUse as Array<{ matcher?: string; hooks?: unknown[] }>;
  const hasDureHook = preToolUse.some(
    (hook) =>
      hook.matcher === 'Bash' &&
      hook.hooks?.some(
        (h: unknown) =>
          typeof h === 'object' &&
          h !== null &&
          'command' in h &&
          typeof (h as { command: string }).command === 'string' &&
          (h as { command: string }).command.includes('DURE_AGENT_MODE')
      )
  );

  if (!hasDureHook) {
    preToolUse.push(...dureSettings.hooks.PreToolUse);
  }

  return result;
}
