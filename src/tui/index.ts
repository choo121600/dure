#!/usr/bin/env node
/**
 * TUI Entry Point
 *
 * This is the entry point for the Terminal User Interface.
 * It parses CLI arguments and launches the TUI application.
 */

import { createTuiApp } from './app.js';
import { createTuiLogger, type TuiLogger } from './utils/tui-logger.js';

export interface TuiOptions {
  projectRoot?: string;
}

// Module-level logger instance
let tuiLogger: TuiLogger | null = null;

/**
 * Parse CLI arguments
 */
function parseArgs(args: string[]): TuiOptions {
  const options: TuiOptions = {};

  const projectRootIndex = args.indexOf('--project-root');
  if (projectRootIndex !== -1 && args[projectRootIndex + 1]) {
    options.projectRoot = args[projectRootIndex + 1];
  }

  return options;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  const projectRoot = options.projectRoot || process.cwd();

  // Initialize TUI logger
  tuiLogger = createTuiLogger(projectRoot);
  tuiLogger.info('TUI starting', { projectRoot });

  try {
    const app = await createTuiApp({ projectRoot, logger: tuiLogger });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      tuiLogger?.info('Received SIGINT, shutting down');
      await app.destroy();
    });

    process.on('SIGTERM', async () => {
      tuiLogger?.info('Received SIGTERM, shutting down');
      await app.destroy();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      tuiLogger?.fatal('Uncaught exception', error);
      await app.destroy();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      tuiLogger?.fatal('Unhandled rejection', error);
      await app.destroy();
      process.exit(1);
    });

    // Listen for app exit
    app.on('exit', (code: number) => {
      tuiLogger?.info('TUI exiting', { code });
      process.exit(code);
    });

    // Listen for app errors
    app.on('error', (error: Error) => {
      tuiLogger?.error('TUI error', error);
    });

    // Start the application
    await app.start();
    tuiLogger.info('TUI started successfully');
  } catch (error) {
    tuiLogger?.fatal('Failed to start TUI', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

// Run as standalone
main().catch((error) => {
  tuiLogger?.fatal('Fatal error in main', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
});

// Re-export for programmatic use
export { createTuiApp } from './app.js';
export type { TuiApp, TuiAppOptions, TuiAppEvents } from './app.js';
