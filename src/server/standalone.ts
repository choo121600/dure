#!/usr/bin/env node

/**
 * Standalone server entry point
 * Used by tmux pane to run the ACE web server
 */

import { createServer } from './index.js';
import { ConfigManager } from '../config/config-manager.js';
import { RunManager } from '../core/run-manager.js';

const args = process.argv.slice(2);
let port = 3000;
let projectRoot = process.cwd();

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--project-root' && args[i + 1]) {
    projectRoot = args[i + 1];
    i++;
  }
}

// Initialize
const configManager = new ConfigManager(projectRoot);
configManager.initialize();

const runManager = new RunManager(projectRoot);
runManager.initialize();

const config = configManager.loadConfig();

// Start server with graceful shutdown support
const server = createServer(projectRoot, config, {}, {
  timeoutMs: 30000,
  signals: ['SIGTERM', 'SIGINT'],
  preserveTmux: true,
});

// Register graceful shutdown handlers
server.gracefulShutdown.register();

server.listen(port, () => {
  console.log(`ACE Server running on http://localhost:${port}`);
  console.log(`Project: ${projectRoot}`);
  console.log('Graceful shutdown enabled (SIGTERM, SIGINT)');
});
