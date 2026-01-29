import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import chalk from 'chalk';
import { ConfigManager } from '../../config/config-manager.js';
import { RunManager } from '../../core/run-manager.js';
import { PromptLoader } from '../../services/prompt-loader.js';
import type { InitPlan, InitPlanItem, InitItemStatus, InitPhase } from '../../types/index.js';

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
  phase?: 'plan' | 'execute' | 'finalize' | 'resume' | '';
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
    console.log(chalk.blue('🧠 Smart Mode: Multi-phase skill/agent generation'));
    await runMultiPhaseGeneration(projectRoot, options.phase || '');
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
 * Run multi-phase skill/agent generation
 */
async function runMultiPhaseGeneration(projectRoot: string, specificPhase: string): Promise<void> {
  // Check if Claude Code is available
  const claudeCheck = spawnSync('which', ['claude'], { encoding: 'utf-8' });
  if (claudeCheck.status !== 0) {
    console.log(chalk.yellow('  ⚠ Claude Code CLI not found. Skipping skill/agent generation.'));
    console.log(chalk.gray('    Install: npm install -g @anthropic-ai/claude-code'));
    return;
  }

  // Create init directory
  const initDir = join(projectRoot, '.dure', 'init');
  if (!existsSync(initDir)) {
    mkdirSync(initDir, { recursive: true });
  }

  const planPath = join(initDir, 'plan.json');
  const planExists = existsSync(planPath);

  // Determine which phase to run
  if (specificPhase === 'plan') {
    await runPhase0Planning(projectRoot);
  } else if (specificPhase === 'execute') {
    if (!planExists) {
      console.log(chalk.yellow('  ⚠ No plan.json found. Run planning phase first.'));
      return;
    }
    await runPhaseExecution(projectRoot);
  } else if (specificPhase === 'finalize') {
    await runFinalPhase(projectRoot);
  } else if (specificPhase === 'resume' || (planExists && specificPhase === '')) {
    // Resume from existing plan
    const plan = loadPlan(projectRoot);
    console.log(chalk.gray(`  Resuming from phase: ${plan.current_phase}`));

    if (plan.current_phase === 'planning') {
      await runPhase0Planning(projectRoot);
    } else if (plan.current_phase === 'executing') {
      await runPhaseExecution(projectRoot);
    } else if (plan.current_phase === 'finalizing') {
      await runFinalPhase(projectRoot);
    } else if (plan.current_phase === 'completed') {
      console.log(chalk.green('  ✓ Generation already completed!'));
      showSummary(projectRoot);
      return;
    }
  } else {
    // Run all phases
    await runAllPhases(projectRoot);
  }
}

/**
 * Run all phases sequentially
 */
async function runAllPhases(projectRoot: string): Promise<void> {
  console.log(chalk.cyan('\n  Phase 0: Planning...'));
  const planSuccess = await runPhase0Planning(projectRoot);
  if (!planSuccess) {
    console.log(chalk.yellow('  ⚠ Planning phase failed.'));
    return;
  }

  console.log(chalk.cyan('\n  Phase 1-N: Executing items...'));
  const execSuccess = await runPhaseExecution(projectRoot);
  if (!execSuccess) {
    console.log(chalk.yellow('  ⚠ Some items failed during execution.'));
    // Continue to finalization anyway
  }

  console.log(chalk.cyan('\n  Final Phase: Finalizing...'));
  await runFinalPhase(projectRoot);
}

/**
 * Phase 0: Planning - Analyze project and create plan.json
 */
async function runPhase0Planning(projectRoot: string): Promise<boolean> {
  const initDir = join(projectRoot, '.dure', 'init');
  const promptLoader = new PromptLoader();

  let prompt: string;
  try {
    prompt = await promptLoader.loadPrompt('init-planner');
  } catch (error) {
    console.log(chalk.yellow('  ⚠ Init planner prompt not found. Skipping.'));
    return false;
  }

  // Substitute variables
  prompt = prompt.replace(/\$\{project_root\}/g, projectRoot);

  // Write prompt to temp file
  const promptFile = join(initDir, 'planner-prompt.md');
  writeFileSync(promptFile, prompt, 'utf-8');

  // Run Claude in tmux
  const sessionName = 'dure-init-planner';
  const outputFile = join(initDir, 'planner-output.json');
  const errorFile = join(initDir, 'planner-error.log');
  const doneFlag = join(initDir, 'planner-done.flag');

  // Remove old done flag if exists
  if (existsSync(doneFlag)) {
    rmSync(doneFlag);
  }

  const success = await runClaudeInTmux({
    sessionName,
    projectRoot,
    promptFile,
    outputFile,
    errorFile,
    doneFlag,
    model: 'sonnet',
    description: 'Planning',
    timeoutMs: 5 * 60 * 1000, // 5 minutes
  });

  if (!success) {
    return false;
  }

  // Verify plan.json was created
  const planPath = join(initDir, 'plan.json');
  if (!existsSync(planPath)) {
    console.log(chalk.yellow('  ⚠ plan.json was not created.'));
    return false;
  }

  console.log(chalk.green('  ✓ Planning complete!'));

  // Show plan summary
  const plan = loadPlan(projectRoot);
  const skills = plan.items.filter(i => i.type === 'skill');
  const agents = plan.items.filter(i => i.type === 'agent');
  console.log(chalk.gray(`    Planned: ${skills.length} skills, ${agents.length} agents`));

  return true;
}

/**
 * Phase 1-N: Execute each item in the plan
 */
async function runPhaseExecution(projectRoot: string): Promise<boolean> {
  const plan = loadPlan(projectRoot);
  const initDir = join(projectRoot, '.dure', 'init');
  const promptLoader = new PromptLoader();

  // Update phase
  plan.current_phase = 'executing';
  savePlan(projectRoot, plan);

  // Group items by type and dependencies
  const pendingItems = plan.items.filter(i => i.status === 'pending' || i.status === 'in_progress');

  if (pendingItems.length === 0) {
    console.log(chalk.green('  ✓ All items already completed!'));
    return true;
  }

  let hasFailures = false;
  const maxConcurrent = 3;

  // Process items respecting dependencies
  while (true) {
    const currentPlan = loadPlan(projectRoot);
    const readyItems = currentPlan.items.filter(item => {
      if (item.status !== 'pending') return false;

      // Check if all dependencies are completed
      if (item.dependencies && item.dependencies.length > 0) {
        const allDepsCompleted = item.dependencies.every(depId => {
          const dep = currentPlan.items.find(i => i.id === depId);
          return dep && dep.status === 'completed';
        });
        if (!allDepsCompleted) return false;
      }

      return true;
    });

    if (readyItems.length === 0) {
      // Check if there are still in-progress or pending items
      const remaining = currentPlan.items.filter(i => i.status === 'pending' || i.status === 'in_progress');
      if (remaining.length === 0) break;

      // Check for deadlock (pending items with unresolvable dependencies)
      const pendingOnly = remaining.filter(i => i.status === 'pending');
      if (pendingOnly.length > 0 && readyItems.length === 0) {
        console.log(chalk.yellow(`  ⚠ ${pendingOnly.length} items blocked by dependencies.`));
        hasFailures = true;
        break;
      }

      // Wait for in-progress items
      await sleep(1000);
      continue;
    }

    // Process ready items (up to maxConcurrent)
    const batch = readyItems.slice(0, maxConcurrent);

    // For now, process sequentially to avoid complexity
    for (const item of batch) {
      console.log(chalk.gray(`\n  Processing: ${item.id} (${item.type})`));

      // Determine template name
      const templateName = item.type === 'skill' ? 'init-skill-writer' : 'init-agent-writer';

      const success = await runSingleItem(projectRoot, item, templateName, promptLoader);

      if (!success) {
        hasFailures = true;
        updateItemStatus(projectRoot, item.id, 'failed');
      } else {
        updateItemStatus(projectRoot, item.id, 'completed');
      }
    }
  }

  // Update phase to finalizing
  const finalPlan = loadPlan(projectRoot);
  finalPlan.current_phase = 'finalizing';
  savePlan(projectRoot, finalPlan);

  return !hasFailures;
}

/**
 * Run a single skill or agent generation
 */
async function runSingleItem(
  projectRoot: string,
  item: InitPlanItem,
  templateName: string,
  promptLoader: PromptLoader
): Promise<boolean> {
  const initDir = join(projectRoot, '.dure', 'init');

  let prompt: string;
  try {
    prompt = await promptLoader.loadPrompt(templateName);
  } catch (error) {
    console.log(chalk.yellow(`    ⚠ Template ${templateName} not found.`));
    return false;
  }

  // Substitute variables
  prompt = prompt.replace(/\$\{project_root\}/g, projectRoot);

  if (item.type === 'skill') {
    prompt = prompt.replace(/\$\{skill_name\}/g, item.name);
    prompt = prompt.replace(/\$\{skill_description\}/g, item.description);
  } else {
    prompt = prompt.replace(/\$\{agent_name\}/g, item.name);
    prompt = prompt.replace(/\$\{agent_tier\}/g, item.tier || 'standard');
    prompt = prompt.replace(/\$\{agent_description\}/g, item.description);
    prompt = prompt.replace(/\$\{agent_model\}/g, item.model || 'sonnet');
    // For tier references
    const baseName = item.name.replace(/-quick$/, '').replace(/-deep$/, '');
    prompt = prompt.replace(/\$\{base_agent_name\}/g, baseName);
  }

  // Write prompt to temp file
  const promptFile = join(initDir, `${item.id}-prompt.md`);
  writeFileSync(promptFile, prompt, 'utf-8');

  // Run Claude in tmux
  const sessionName = `dure-init-${item.id}`.substring(0, 50); // tmux session name limit
  const outputFile = join(initDir, `${item.id}-output.json`);
  const errorFile = join(initDir, `${item.id}-error.log`);
  const doneFlag = join(initDir, `${item.id}-done.flag`);

  // Remove old done flag if exists
  if (existsSync(doneFlag)) {
    rmSync(doneFlag);
  }

  // Update status to in_progress
  updateItemStatus(projectRoot, item.id, 'in_progress');

  const success = await runClaudeInTmux({
    sessionName,
    projectRoot,
    promptFile,
    outputFile,
    errorFile,
    doneFlag,
    model: item.model || 'sonnet',
    description: `${item.type}: ${item.name}`,
    timeoutMs: 3 * 60 * 1000, // 3 minutes per item
  });

  return success;
}

/**
 * Final Phase: Update CLAUDE.md and create summary
 */
async function runFinalPhase(projectRoot: string): Promise<boolean> {
  const initDir = join(projectRoot, '.dure', 'init');
  const promptLoader = new PromptLoader();

  let prompt: string;
  try {
    prompt = await promptLoader.loadPrompt('init-finalizer');
  } catch (error) {
    console.log(chalk.yellow('  ⚠ Init finalizer prompt not found. Skipping.'));
    return false;
  }

  // Substitute variables
  prompt = prompt.replace(/\$\{project_root\}/g, projectRoot);

  // Write prompt to temp file
  const promptFile = join(initDir, 'finalizer-prompt.md');
  writeFileSync(promptFile, prompt, 'utf-8');

  // Run Claude in tmux
  const sessionName = 'dure-init-finalizer';
  const outputFile = join(initDir, 'finalizer-output.json');
  const errorFile = join(initDir, 'finalizer-error.log');
  const doneFlag = join(initDir, 'skill-generator-done.flag');

  // Remove old done flag if exists
  if (existsSync(doneFlag)) {
    rmSync(doneFlag);
  }

  const success = await runClaudeInTmux({
    sessionName,
    projectRoot,
    promptFile,
    outputFile,
    errorFile,
    doneFlag,
    model: 'haiku', // Use haiku for finalizer (just documentation)
    description: 'Finalizing',
    timeoutMs: 2 * 60 * 1000, // 2 minutes
  });

  if (!success) {
    return false;
  }

  // Update plan status
  const plan = loadPlan(projectRoot);
  plan.current_phase = 'completed';
  plan.last_updated = new Date().toISOString();
  savePlan(projectRoot, plan);

  // Clean up plan.json after successful completion
  const planPath = join(initDir, 'plan.json');
  if (existsSync(planPath)) {
    rmSync(planPath);
    console.log(chalk.gray('    Cleaned up plan.json'));
  }

  console.log(chalk.green('  ✓ Finalization complete!'));
  showSummary(projectRoot);

  return true;
}

/**
 * Show summary of generated skills and agents
 */
function showSummary(projectRoot: string): void {
  const summaryFile = join(projectRoot, '.dure', 'init', 'skill-generator-summary.md');

  if (existsSync(summaryFile)) {
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
      const agentLines = agentsMatch[0].split('\n').filter(l => l.startsWith('|') && !l.includes('---'));
      for (const line of agentLines.slice(1)) { // Skip header
        const cols = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length >= 3) {
          console.log(chalk.gray(`  ${cols[0]} (${cols[2]}) - ${cols[3] || ''}`));
        }
      }
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray(`Full summary: ${summaryFile}`));
  } else {
    // Check if skills/agents directories were created
    const skillsDir = join(projectRoot, '.claude', 'skills');
    const agentsDir = join(projectRoot, '.claude', 'agents');

    const hasSkills = existsSync(skillsDir);
    const hasAgents = existsSync(agentsDir);

    if (hasSkills || hasAgents) {
      if (hasSkills) {
        const skills = spawnSync('ls', [skillsDir], { encoding: 'utf-8' });
        console.log(chalk.cyan('  Skills:'), chalk.gray(skills.stdout?.trim().replace(/\n/g, ', ')));
      }
      if (hasAgents) {
        const agents = spawnSync('ls', [agentsDir], { encoding: 'utf-8' });
        console.log(chalk.cyan('  Agents:'), chalk.gray(agents.stdout?.trim().replace(/\n/g, ', ')));
      }
    }
  }
}

/**
 * Run Claude Code in a tmux session and wait for completion
 */
interface ClaudeRunOptions {
  sessionName: string;
  projectRoot: string;
  promptFile: string;
  outputFile: string;
  errorFile: string;
  doneFlag: string;
  model: string;
  description: string;
  timeoutMs: number;
}

async function runClaudeInTmux(options: ClaudeRunOptions): Promise<boolean> {
  const {
    sessionName,
    projectRoot,
    promptFile,
    outputFile,
    errorFile,
    doneFlag,
    model,
    description,
    timeoutMs,
  } = options;

  // Kill existing session if any
  spawnSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore' });

  // Create new session
  console.log(chalk.gray(`    Starting Claude (${description})...`));
  spawnSync('tmux', [
    'new-session', '-d',
    '-s', sessionName,
    '-c', projectRoot,
  ], { stdio: 'ignore' });

  // Run Claude Code in the tmux session
  const claudeCmd = `claude -p --output-format json --dangerously-skip-permissions --model ${model} < "${promptFile}" > "${outputFile}" 2> "${errorFile}"`;

  spawnSync('tmux', ['send-keys', '-t', sessionName, '-l', claudeCmd]);
  spawnSync('tmux', ['send-keys', '-t', sessionName, 'Enter']);

  // Wait for completion with timeout
  const pollIntervalMs = 2000;
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
    console.log(chalk.yellow(`    ⚠ ${description} timed out.`));
    if (existsSync(errorFile)) {
      const errorContent = readFileSync(errorFile, 'utf-8');
      if (errorContent.trim()) {
        console.log(chalk.red(`    Error: ${errorContent.trim().split('\n')[0]}`));
      }
    }
    return false;
  }

  return true;
}

/**
 * Load plan.json
 */
function loadPlan(projectRoot: string): InitPlan {
  const planPath = join(projectRoot, '.dure', 'init', 'plan.json');
  const content = readFileSync(planPath, 'utf-8');
  return JSON.parse(content) as InitPlan;
}

/**
 * Save plan.json
 */
function savePlan(projectRoot: string, plan: InitPlan): void {
  const planPath = join(projectRoot, '.dure', 'init', 'plan.json');
  plan.last_updated = new Date().toISOString();
  writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
}

/**
 * Update item status in plan.json
 */
function updateItemStatus(
  projectRoot: string,
  itemId: string,
  status: InitItemStatus,
  error?: string
): void {
  const plan = loadPlan(projectRoot);
  const item = plan.items.find(i => i.id === itemId);

  if (item) {
    item.status = status;
    if (status === 'in_progress') {
      item.started_at = new Date().toISOString();
    } else if (status === 'completed' || status === 'failed') {
      item.completed_at = new Date().toISOString();
    }
    if (error) {
      item.error = error;
    }
    savePlan(projectRoot, plan);
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
