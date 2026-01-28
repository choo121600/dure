/**
 * Unit tests for CLI recording utilities
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import {
  isRecordingEnabled,
  getRecordingOptionsFromEnv,
  convertToSvg,
  enableRecording,
  disableRecording,
  getRecordingBuffer,
  clearRecordingBuffer,
  ENV,
} from '../../../src/cli/utils/recording.js';

describe('CLI Recording Utilities', () => {
  const testOutputDir = join(process.cwd(), 'tests', '.tmp-recording');

  beforeEach(() => {
    // Clean environment
    delete process.env[ENV.OUTPUT_FILE];
    delete process.env[ENV.TITLE];
    delete process.env[ENV.WIDTH];
    delete process.env[ENV.THEME];

    // Create test output directory
    mkdirSync(testOutputDir, { recursive: true });

    // Clear any existing recording state
    clearRecordingBuffer();
  });

  afterEach(() => {
    // Cleanup
    delete process.env[ENV.OUTPUT_FILE];
    delete process.env[ENV.TITLE];
    delete process.env[ENV.WIDTH];
    delete process.env[ENV.THEME];

    // Remove test directory
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe('isRecordingEnabled', () => {
    it('should return false when no environment variable is set', () => {
      expect(isRecordingEnabled()).toBe(false);
    });

    it('should return true when DURE_RECORD_OUTPUT_FILE is set', () => {
      process.env[ENV.OUTPUT_FILE] = '/tmp/test.svg';
      expect(isRecordingEnabled()).toBe(true);
    });

    it('should return true when regenerate-screenshots is in argv', () => {
      const originalArgv = process.argv;
      process.argv = [...originalArgv, 'regenerate-screenshots'];

      expect(isRecordingEnabled()).toBe(true);

      process.argv = originalArgv;
    });
  });

  describe('getRecordingOptionsFromEnv', () => {
    it('should return null when OUTPUT_FILE is not set', () => {
      expect(getRecordingOptionsFromEnv()).toBeNull();
    });

    it('should return options with defaults when only OUTPUT_FILE is set', () => {
      process.env[ENV.OUTPUT_FILE] = '/tmp/test.svg';

      const options = getRecordingOptionsFromEnv();

      expect(options).not.toBeNull();
      expect(options!.outputFile).toBe('/tmp/test.svg');
      expect(options!.width).toBe(100);
      expect(options!.theme).toBe('dark');
      expect(options!.title).toBeUndefined();
    });

    it('should parse all environment variables', () => {
      process.env[ENV.OUTPUT_FILE] = '/tmp/test.svg';
      process.env[ENV.TITLE] = 'Test Title';
      process.env[ENV.WIDTH] = '120';
      process.env[ENV.THEME] = 'light';

      const options = getRecordingOptionsFromEnv();

      expect(options).not.toBeNull();
      expect(options!.outputFile).toBe('/tmp/test.svg');
      expect(options!.title).toBe('Test Title');
      expect(options!.width).toBe(120);
      expect(options!.theme).toBe('light');
    });
  });

  describe('convertToSvg', () => {
    it('should convert plain text to SVG', () => {
      const svg = convertToSvg('Hello World', {
        outputFile: 'test.svg',
        theme: 'dark',
      });

      expect(svg).toContain('<svg');
      expect(svg).toContain('Hello World');
      expect(svg).toContain('</svg>');
    });

    it('should convert ANSI colored text to SVG', () => {
      // Red text: \x1b[31m
      const ansiText = '\x1b[31mError:\x1b[0m Something went wrong';

      const svg = convertToSvg(ansiText, {
        outputFile: 'test.svg',
        theme: 'dark',
      });

      expect(svg).toContain('<svg');
      expect(svg).toContain('Error:');
      expect(svg).toContain('Something went wrong');
    });

    it('should include title comment when provided', () => {
      const svg = convertToSvg('Test', {
        outputFile: 'test.svg',
        title: 'My Command Help',
      });

      expect(svg).toContain('<!-- My Command Help -->');
    });

    it('should use light theme when specified', () => {
      const svg = convertToSvg('Test', {
        outputFile: 'test.svg',
        theme: 'light',
      });

      // Light theme has white background
      expect(svg).toContain('#ffffff');
    });

    it('should use dark theme by default', () => {
      const svg = convertToSvg('Test', {
        outputFile: 'test.svg',
      });

      // Dark theme has dark background
      expect(svg).toContain('#1e1e1e');
    });
  });

  describe('enableRecording / disableRecording', () => {
    it('should capture stdout output', () => {
      const outputFile = join(testOutputDir, 'capture-test.svg');

      enableRecording({ outputFile });

      process.stdout.write('First line\n');
      process.stdout.write('Second line\n');

      const buffer = getRecordingBuffer();
      expect(buffer).toContain('First line');
      expect(buffer).toContain('Second line');

      disableRecording(false); // Don't save
    });

    it('should save SVG file when disabling with save=true', () => {
      const outputFile = join(testOutputDir, 'save-test.svg');

      enableRecording({ outputFile });
      process.stdout.write('Test output\n');
      disableRecording(true);

      expect(existsSync(outputFile)).toBe(true);

      const content = readFileSync(outputFile, 'utf-8');
      expect(content).toContain('<svg');
      expect(content).toContain('Test output');
    });

    it('should not save when save=false', () => {
      const outputFile = join(testOutputDir, 'no-save-test.svg');

      enableRecording({ outputFile });
      process.stdout.write('Test\n');
      disableRecording(false);

      expect(existsSync(outputFile)).toBe(false);
    });

    it('should return captured content when disabling', () => {
      const outputFile = join(testOutputDir, 'return-test.svg');

      enableRecording({ outputFile });
      process.stdout.write('Captured content\n');

      const content = disableRecording(false);
      expect(content).toContain('Captured content');
    });

    it('should create directories recursively', () => {
      const nestedDir = join(testOutputDir, 'nested', 'deep', 'dir');
      const outputFile = join(nestedDir, 'test.svg');

      enableRecording({ outputFile });
      process.stdout.write('Test\n');
      disableRecording(true);

      expect(existsSync(outputFile)).toBe(true);
    });

    it('should not double-wrap stdout when called twice', () => {
      const outputFile = join(testOutputDir, 'double-test.svg');

      enableRecording({ outputFile });
      enableRecording({ outputFile }); // Second call should be no-op

      process.stdout.write('Single output\n');

      const buffer = getRecordingBuffer();
      // Should contain "Single output" only once, not twice
      const matches = buffer.match(/Single output/g);
      expect(matches).toHaveLength(1);

      disableRecording(false);
    });
  });

  describe('clearRecordingBuffer', () => {
    it('should clear the recording buffer', () => {
      const outputFile = join(testOutputDir, 'clear-test.svg');

      enableRecording({ outputFile });
      process.stdout.write('Some content\n');

      expect(getRecordingBuffer()).toContain('Some content');

      clearRecordingBuffer();

      expect(getRecordingBuffer()).toBe('');

      disableRecording(false);
    });
  });
});
