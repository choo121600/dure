/**
 * CLI Output Recording and SVG Conversion Utility
 *
 * Captures CLI stdout output and converts it to SVG format for documentation.
 *
 * Environment-variable based control ensures zero impact on production.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createRequire } from 'module';
import type { AnsiToSvgOptions } from '../../types/ansi-to-svg.js';
import {
  getThemeColors,
  getAvailableThemes,
  isValidTheme,
  getTheme,
  THEMES,
  DEFAULT_THEME,
  type ThemeName,
  type Theme,
  type ThemeColors,
} from './themes.js';

// Re-export theme utilities for backward compatibility and convenience
export {
  getThemeColors,
  getAvailableThemes,
  isValidTheme,
  getTheme,
  THEMES,
  DEFAULT_THEME,
  type ThemeName,
  type Theme,
  type ThemeColors,
};

// ansi-to-svg is a CommonJS module, use createRequire for ESM compatibility
const require = createRequire(import.meta.url);
const ansiToSvg: (input: string, options?: AnsiToSvgOptions) => string = require('ansi-to-svg');

// Environment variables
export const ENV = {
  OUTPUT_FILE: 'DURE_RECORD_OUTPUT_FILE',
  TITLE: 'DURE_RECORD_TITLE',
  WIDTH: 'DURE_RECORD_WIDTH',
  THEME: 'DURE_RECORD_THEME',
} as const;

export interface RecordingOptions {
  outputFile: string;
  title?: string;
  width?: number;
  theme?: string; // Theme name (supports all themes in themes.ts)
}

// Buffer to store captured output
let outputBuffer: string[] = [];
let originalStdoutWrite: typeof process.stdout.write | null = null;
let recordingOptions: RecordingOptions | null = null;

/**
 * Check if screenshot recording mode is enabled
 *
 * Recording is enabled when:
 * - DURE_RECORD_OUTPUT_FILE environment variable is set, OR
 * - CLI is invoked with 'regenerate-screenshots' command
 */
export function isRecordingEnabled(): boolean {
  return (
    ENV.OUTPUT_FILE in process.env ||
    process.argv.includes('regenerate-screenshots')
  );
}

/**
 * Get recording options from environment variables
 */
export function getRecordingOptionsFromEnv(): RecordingOptions | null {
  const outputFile = process.env[ENV.OUTPUT_FILE];
  if (!outputFile) return null;

  const widthStr = process.env[ENV.WIDTH];
  const width = widthStr ? parseInt(widthStr, 10) : 100;

  return {
    outputFile,
    title: process.env[ENV.TITLE],
    width,
    theme: process.env[ENV.THEME] || DEFAULT_THEME,
  };
}

/**
 * Convert captured ANSI output to SVG
 */
export function convertToSvg(content: string, options: RecordingOptions): string {
  const colors = getThemeColors(options.theme || DEFAULT_THEME);

  const svg = ansiToSvg(content, {
    paddingTop: 16,
    paddingLeft: 16,
    paddingBottom: 16,
    paddingRight: 16,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    colors,
  });

  // Add title comment if provided
  if (options.title) {
    return `<!-- ${options.title} -->\n${svg}`;
  }

  return svg;
}

/**
 * Save the captured output as SVG
 */
export function saveRecording(): void {
  if (!recordingOptions || outputBuffer.length === 0) return;

  const content = outputBuffer.join('');
  const svg = convertToSvg(content, recordingOptions);

  // Ensure directory exists
  mkdirSync(dirname(recordingOptions.outputFile), { recursive: true });

  // Write SVG file (sync to ensure it completes before process exits)
  writeFileSync(recordingOptions.outputFile, svg, 'utf-8');
}

/**
 * Enable stdout recording
 *
 * Wraps process.stdout.write to capture all output while still
 * displaying it normally. The captured output is saved as SVG
 * when the process exits.
 */
export function enableRecording(options: RecordingOptions): void {
  if (originalStdoutWrite) {
    // Already enabled
    return;
  }

  recordingOptions = options;
  outputBuffer = [];
  originalStdoutWrite = process.stdout.write.bind(process.stdout);

  // Wrap stdout.write with proper type handling
  const wrappedWrite = (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
    callback?: (err?: Error | null) => void
  ): boolean => {
    const str = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    outputBuffer.push(str);

    // Call original write with proper overload handling
    if (typeof encodingOrCallback === 'function') {
      return originalStdoutWrite!(chunk, encodingOrCallback);
    }
    if (callback) {
      return originalStdoutWrite!(chunk, encodingOrCallback, callback);
    }
    if (encodingOrCallback) {
      return originalStdoutWrite!(chunk, encodingOrCallback);
    }
    return originalStdoutWrite!(chunk);
  };

  process.stdout.write = wrappedWrite as typeof process.stdout.write;

  // Register exit handler to save SVG
  // Note: Using 'exit' event with sync operations
  process.on('exit', () => {
    saveRecording();
  });
}

/**
 * Disable recording and optionally save the output
 *
 * @param save - Whether to save the captured output (default: true)
 * @returns The captured output as a string
 */
export function disableRecording(save = true): string {
  if (!originalStdoutWrite) {
    return '';
  }

  // Restore original stdout.write
  process.stdout.write = originalStdoutWrite;
  originalStdoutWrite = null;

  const content = outputBuffer.join('');

  if (save && recordingOptions) {
    const svg = convertToSvg(content, recordingOptions);
    mkdirSync(dirname(recordingOptions.outputFile), { recursive: true });
    writeFileSync(recordingOptions.outputFile, svg, 'utf-8');
  }

  // Clear buffer
  outputBuffer = [];
  recordingOptions = null;

  return content;
}

/**
 * Get the current recording buffer content (for testing)
 */
export function getRecordingBuffer(): string {
  return outputBuffer.join('');
}

/**
 * Clear the recording buffer (for testing)
 */
export function clearRecordingBuffer(): void {
  outputBuffer = [];
}
