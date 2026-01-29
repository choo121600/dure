import { existsSync, mkdirSync, writeFileSync, readFileSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import chalk from 'chalk';
import { ConfigManager } from '../../config/config-manager.js';
import { RunManager } from '../../core/run-manager.js';
import { PromptLoader } from '../../services/prompt-loader.js';

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

export interface InitOptions {
  smart?: boolean;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
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

  // 4. Smart mode: generate skills and agents
  if (options.smart) {
    console.log();
    console.log(chalk.blue('🧠 Smart Mode: Generating skills and agents...'));
    await generateSkillsAndAgents(projectRoot);
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
 * Generate skills and agents using Claude Code
 */
async function generateSkillsAndAgents(projectRoot: string): Promise<void> {
  // Check if Claude Code is available
  const claudeCheck = spawnSync('which', ['claude'], { encoding: 'utf-8' });
  if (claudeCheck.status !== 0) {
    console.log(chalk.yellow('  ⚠ Claude Code CLI not found. Skipping skill/agent generation.'));
    console.log(chalk.gray('    Install: npm install -g @anthropic-ai/claude-code'));
    return;
  }

  // Create output directory
  const initDir = join(projectRoot, '.dure', 'init');
  if (!existsSync(initDir)) {
    mkdirSync(initDir, { recursive: true });
  }

  // Load and prepare prompt
  const promptLoader = new PromptLoader();
  let prompt: string;
  try {
    prompt = await promptLoader.loadPrompt('skill-generator');
  } catch (error) {
    console.log(chalk.yellow('  ⚠ Skill generator prompt not found. Skipping.'));
    return;
  }

  // Substitute variables
  prompt = prompt.replace(/\$\{project_root\}/g, projectRoot);

  // Write prompt to temp file
  const promptFile = join(initDir, 'skill-generator-prompt.md');
  writeFileSync(promptFile, prompt, 'utf-8');

  // Create tmux session for skill generation
  const sessionName = 'dure-init-skills';

  // Kill existing session if any
  spawnSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore' });

  // Create new session
  console.log(chalk.gray('  Starting Claude Code in tmux...'));
  spawnSync('tmux', [
    'new-session', '-d',
    '-s', sessionName,
    '-c', projectRoot,
  ], { stdio: 'ignore' });

  // Prepare output files
  const outputFile = join(initDir, 'output.json');
  const errorFile = join(initDir, 'error.log');
  const doneFlag = join(initDir, 'skill-generator-done.flag');
  const summaryFile = join(initDir, 'skill-generator-summary.md');

  // Remove old done flag if exists
  if (existsSync(doneFlag)) {
    spawnSync('rm', [doneFlag], { stdio: 'ignore' });
  }

  // Run Claude Code in the tmux session
  // Use sonnet model for skill generation (good balance of quality and cost)
  const claudeCmd = `claude -p --output-format json --dangerously-skip-permissions --model sonnet < "${promptFile}" > "${outputFile}" 2> "${errorFile}"`;

  spawnSync('tmux', ['send-keys', '-t', sessionName, '-l', claudeCmd]);
  spawnSync('tmux', ['send-keys', '-t', sessionName, 'Enter']);

  console.log(chalk.gray('  Claude is analyzing your project...'));
  console.log(chalk.gray(`  tmux session: ${sessionName}`));
  console.log(chalk.gray('  Waiting for completion (this may take a few minutes)...'));

  // Wait for completion with timeout
  const timeoutMs = 5 * 60 * 1000; // 5 minutes
  const pollIntervalMs = 2000; // 2 seconds
  const startTime = Date.now();

  let completed = false;

  while (Date.now() - startTime < timeoutMs) {
    // Check if done flag exists
    if (existsSync(doneFlag)) {
      completed = true;
      break;
    }

    // Check if process has finished (output file exists and tmux pane is idle)
    if (existsSync(outputFile)) {
      const paneCheck = spawnSync('tmux', [
        'list-panes', '-t', sessionName,
        '-F', '#{pane_current_command}',
      ], { encoding: 'utf-8' });

      if (paneCheck.stdout) {
        const currentCmd = paneCheck.stdout.trim();
        // If it's back to shell, Claude has finished
        if (['bash', 'zsh', 'sh', 'fish'].includes(currentCmd)) {
          // Give a moment for files to be written
          await sleep(1000);
          completed = true;
          break;
        }
      }
    }

    await sleep(pollIntervalMs);
    process.stdout.write(chalk.gray('.'));
  }

  console.log(); // New line after dots

  // Kill the tmux session
  spawnSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore' });

  if (!completed) {
    console.log(chalk.yellow('  ⚠ Skill generation timed out.'));
    console.log(chalk.gray(`    Check ${errorFile} for details.`));
    return;
  }

  // Check results
  if (existsSync(summaryFile)) {
    console.log(chalk.green('  ✓ Skills and agents generated!'));

    // Show summary
    const summary = readFileSync(summaryFile, 'utf-8');
    console.log();
    console.log(chalk.white('Generated Configuration:'));
    console.log(chalk.gray('─'.repeat(50)));

    // Parse and display summary highlights
    const skillsMatch = summary.match(/## Skills Created[\s\S]*?(?=##|$)/);
    const agentsMatch = summary.match(/## Agents Created[\s\S]*?(?=##|$)/);

    if (skillsMatch) {
      const skillLines = skillsMatch[0].split('\n').filter(l => l.startsWith('|') && !l.includes('---'));
      console.log(chalk.cyan('Skills:'));
      for (const line of skillLines.slice(1)) { // Skip header
        const cols = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length >= 2) {
          console.log(chalk.gray(`  /${cols[0]} - ${cols[1]}`));
        }
      }
    }

    if (agentsMatch) {
      console.log(chalk.cyan('\nAgents:'));
      // Look for role sections
      const roleMatches = agentsMatch[0].matchAll(/### (\w+) Role[\s\S]*?(?=###|$)/g);
      for (const roleMatch of roleMatches) {
        const roleName = roleMatch[1];
        const roleSection = roleMatch[0];
        const agentLines = roleSection.split('\n').filter(l => l.startsWith('|') && !l.includes('---'));
        for (const line of agentLines.slice(1)) { // Skip header
          const cols = line.split('|').map(c => c.trim()).filter(Boolean);
          if (cols.length >= 3) {
            console.log(chalk.gray(`  ${cols[0]} (${cols[2]}) - ${cols[3] || ''}`));
          }
        }
      }
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray(`Full summary: ${summaryFile}`));
  } else if (existsSync(outputFile)) {
    // Check if skills/agents directories were created
    const skillsDir = join(projectRoot, '.claude', 'skills');
    const agentsDir = join(projectRoot, '.claude', 'agents');

    const hasSkills = existsSync(skillsDir);
    const hasAgents = existsSync(agentsDir);

    if (hasSkills || hasAgents) {
      console.log(chalk.green('  ✓ Skills and agents generated!'));
      if (hasSkills) {
        const skills = spawnSync('ls', [skillsDir], { encoding: 'utf-8' });
        console.log(chalk.cyan('  Skills:'), chalk.gray(skills.stdout?.trim().replace(/\n/g, ', ')));
      }
      if (hasAgents) {
        const agents = spawnSync('ls', [agentsDir], { encoding: 'utf-8' });
        console.log(chalk.cyan('  Agents:'), chalk.gray(agents.stdout?.trim().replace(/\n/g, ', ')));
      }
    } else {
      console.log(chalk.yellow('  ⚠ Generation completed but no skills/agents found.'));
      console.log(chalk.gray(`    Check ${errorFile} for details.`));
    }
  } else {
    console.log(chalk.yellow('  ⚠ Generation may have failed.'));
    if (existsSync(errorFile)) {
      const errorContent = readFileSync(errorFile, 'utf-8');
      if (errorContent.trim()) {
        console.log(chalk.red(`    Error: ${errorContent.trim().split('\n')[0]}`));
      }
    }
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
