#!/usr/bin/env node
/**
 * TUI Entry Point
 *
 * This is the entry point for the Terminal User Interface.
 * It parses CLI arguments and launches the TUI application.
 */

import { createTuiApp } from './app.js';

export interface TuiOptions {
  projectRoot?: string;
}

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

  try {
    const app = await createTuiApp({ projectRoot });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await app.destroy();
    });

    process.on('SIGTERM', async () => {
      await app.destroy();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      // eslint-disable-next-line no-console
      console.error('Uncaught exception:', error);
      await app.destroy();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason) => {
      // eslint-disable-next-line no-console
      console.error('Unhandled rejection:', reason);
      await app.destroy();
      process.exit(1);
    });

    // Listen for app exit
    app.on('exit', (code: number) => {
      process.exit(code);
    });

    // Listen for app errors
    app.on('error', (error: Error) => {
      // Errors are handled by the TUI, just log for debugging
      // eslint-disable-next-line no-console
      console.error('TUI error:', error.message);
    });

    // Start the application
    await app.start();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start TUI:', error);
    process.exit(1);
  }
}

// Run as standalone
main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', error);
  process.exit(1);
});

// Re-export for programmatic use
export { createTuiApp } from './app.js';
export type { TuiApp, TuiAppOptions, TuiAppEvents } from './app.js';
