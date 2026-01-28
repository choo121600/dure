/**
 * Unit tests for interactive CLI capture utilities
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  isTmuxAvailable,
  loadInteractiveExamples,
  getInteractiveExample,
  type InteractiveExample,
  type InteractiveStep,
} from '../../../src/cli/utils/interactive-capture.js';

// Test directory
const TEST_DIR = join(process.cwd(), 'tests', '.tmp-interactive-capture');

describe('Interactive Capture Utilities', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('isTmuxAvailable', () => {
    it('should return a boolean', () => {
      const result = isTmuxAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should detect tmux on systems where it is installed', () => {
      // This test's actual result depends on the system
      // Just verify it doesn't throw
      expect(() => isTmuxAvailable()).not.toThrow();
    });
  });

  describe('InteractiveStep interface', () => {
    it('should define required input field', () => {
      const step: InteractiveStep = {
        input: 'echo hello',
      };

      expect(step.input).toBe('echo hello');
    });

    it('should support optional fields', () => {
      const step: InteractiveStep = {
        input: 'npm test',
        waitFor: 'PASS',
        waitMs: 5000,
        description: 'Run tests',
      };

      expect(step.input).toBe('npm test');
      expect(step.waitFor).toBe('PASS');
      expect(step.waitMs).toBe(5000);
      expect(step.description).toBe('Run tests');
    });
  });

  describe('InteractiveExample interface', () => {
    it('should define all required fields', () => {
      const example: InteractiveExample = {
        id: 'test-example',
        name: 'Test Example',
        description: 'A test example',
        steps: [
          { input: 'echo hello' },
        ],
      };

      expect(example.id).toBe('test-example');
      expect(example.name).toBe('Test Example');
      expect(example.description).toBe('A test example');
      expect(example.steps.length).toBe(1);
    });

    it('should support optional outputFile', () => {
      const example: InteractiveExample = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        steps: [],
        outputFile: 'custom_output.svg',
      };

      expect(example.outputFile).toBe('custom_output.svg');
    });
  });

  describe('loadInteractiveExamples', () => {
    it('should return empty array for non-existent file', () => {
      const examples = loadInteractiveExamples('/nonexistent/path.json');
      expect(examples).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const filePath = join(TEST_DIR, 'invalid.json');
      writeFileSync(filePath, 'not valid json', 'utf-8');

      const examples = loadInteractiveExamples(filePath);
      expect(examples).toEqual([]);
    });

    it('should return empty array if no examples key', () => {
      const filePath = join(TEST_DIR, 'empty.json');
      writeFileSync(filePath, '{}', 'utf-8');

      const examples = loadInteractiveExamples(filePath);
      expect(examples).toEqual([]);
    });

    it('should load valid examples', () => {
      const filePath = join(TEST_DIR, 'examples.json');
      const data = {
        examples: [
          {
            id: 'test-1',
            name: 'Test 1',
            description: 'First test',
            steps: [{ input: 'echo 1' }],
          },
          {
            id: 'test-2',
            name: 'Test 2',
            description: 'Second test',
            steps: [{ input: 'echo 2' }],
          },
        ],
      };
      writeFileSync(filePath, JSON.stringify(data), 'utf-8');

      const examples = loadInteractiveExamples(filePath);
      expect(examples.length).toBe(2);
      expect(examples[0].id).toBe('test-1');
      expect(examples[1].id).toBe('test-2');
    });
  });

  describe('getInteractiveExample', () => {
    const examples: InteractiveExample[] = [
      {
        id: 'example-1',
        name: 'Example 1',
        description: 'First example',
        steps: [{ input: 'cmd1' }],
      },
      {
        id: 'example-2',
        name: 'Example 2',
        description: 'Second example',
        steps: [{ input: 'cmd2' }],
      },
    ];

    it('should find example by id', () => {
      const example = getInteractiveExample(examples, 'example-1');
      expect(example).toBeDefined();
      expect(example!.name).toBe('Example 1');
    });

    it('should return undefined for unknown id', () => {
      const example = getInteractiveExample(examples, 'unknown');
      expect(example).toBeUndefined();
    });

    it('should return undefined for empty array', () => {
      const example = getInteractiveExample([], 'any');
      expect(example).toBeUndefined();
    });
  });

  describe('example file structure', () => {
    it('should match expected schema', () => {
      // Load actual examples file to validate structure
      const projectRoot = join(process.cwd());
      const examplesFile = join(
        projectRoot,
        'docs/assets/interactive-examples.json'
      );

      if (existsSync(examplesFile)) {
        const content = readFileSync(examplesFile, 'utf-8');
        const data = JSON.parse(content);

        expect(data.examples).toBeDefined();
        expect(Array.isArray(data.examples)).toBe(true);

        for (const example of data.examples) {
          expect(typeof example.id).toBe('string');
          expect(typeof example.name).toBe('string');
          expect(typeof example.description).toBe('string');
          expect(Array.isArray(example.steps)).toBe(true);

          for (const step of example.steps) {
            expect(typeof step.input).toBe('string');
          }
        }
      }
    });
  });

  describe('waitFor patterns', () => {
    it('should support regex patterns', () => {
      const patterns = [
        { pattern: 'PASS', test: 'All tests PASS', expected: true },
        { pattern: 'PASS', test: 'Some failed', expected: false },
        { pattern: '\\d+ tests', test: '5 tests passed', expected: true },
        { pattern: 'error:', test: 'error: something wrong', expected: true },
      ];

      for (const { pattern, test, expected } of patterns) {
        const regex = new RegExp(pattern);
        expect(
          regex.test(test),
          `"${pattern}" should ${expected ? '' : 'not '}match "${test}"`
        ).toBe(expected);
      }
    });
  });

  describe('output file naming', () => {
    it('should generate default output filename from id', () => {
      const example: InteractiveExample = {
        id: 'my-example',
        name: 'My Example',
        description: 'Test',
        steps: [],
      };

      // Default naming convention
      const defaultFilename = `interactive_${example.id}.svg`;
      expect(defaultFilename).toBe('interactive_my-example.svg');
    });

    it('should use custom outputFile when provided', () => {
      const example: InteractiveExample = {
        id: 'my-example',
        name: 'My Example',
        description: 'Test',
        steps: [],
        outputFile: 'custom_name.svg',
      };

      expect(example.outputFile).toBe('custom_name.svg');
    });
  });
});
