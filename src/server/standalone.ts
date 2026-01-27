#!/usr/bin/env node

/**
 * Standalone server entry point
 * Used by tmux pane to run the ACE web server
 */

import { createServer } from './index.js';
import { ConfigManager } from '../config/config-manager.js';
import { RunManager } from '../core/run-manager.js';
import { InterruptRecovery } from '../core/interrupt-recovery.js';

const args = process.argv.slice(2);
let port = 3000;
let projectRoot = process.cwd();
let autoRecover = false;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--project-root' && args[i + 1]) {
    projectRoot = args[i + 1];
    i++;
  } else if (args[i] === '--auto-recover') {
    autoRecover = true;
  }
}

// Initialize
const configManager = new ConfigManager(projectRoot);
configManager.initialize();

const runManager = new RunManager(projectRoot);
runManager.initialize();

const config = configManager.loadConfig();

// Detect interrupted runs on startup
async function checkInterruptedRuns(): Promise<void> {
  const recovery = new InterruptRecovery(projectRoot, {
    tmuxSessionPrefix: config.global.tmux_session_prefix,
    autoRecover,
  });
  recovery.setConfig(config);

  const runs = await recovery.detectInterruptedRuns();

  if (runs.length > 0) {
    console.log('\n========================================');
    console.log(`Found ${runs.length} interrupted run(s):`);
    console.log('========================================');

    for (const run of runs) {
      console.log(`  - ${run.runId} (${run.phase})`);
      console.log(`    Strategy: ${run.resumeStrategy}`);
      console.log(`    Reason: ${run.reason}`);
    }

    console.log('\nUse `orchestral recover` to manage these runs.');
    console.log('Or visit /health/interrupted for API access.');
    console.log('========================================\n');
  }
}

// Start server with graceful shutdown support
const server = createServer(projectRoot, config, {}, {
  timeoutMs: 30000,
  signals: ['SIGTERM', 'SIGINT'],
  preserveTmux: true,
});

// Register graceful shutdown handlers
server.gracefulShutdown.register();

server.listen(port, async () => {
  console.log(`ACE Server running on http://localhost:${port}`);
  console.log(`Project: ${projectRoot}`);
  console.log('Graceful shutdown enabled (SIGTERM, SIGINT)');

  // Check for interrupted runs after server starts
  try {
    await checkInterruptedRuns();
  } catch (error) {
    console.error('Warning: Failed to check for interrupted runs:', error);
  }
});
