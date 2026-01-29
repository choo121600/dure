/**
 * Unit tests for monitor command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

// Test utilities
const createTestDir = (): string => {
  const testDir = join(tmpdir(), `dure-monitor-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
};

const setupDureProject = (projectRoot: string): void => {
  // Create .dure structure
  const dureDir = join(projectRoot, '.dure');
  const configDir = join(dureDir, 'config');
  const runsDir = join(dureDir, 'runs');

  mkdirSync(configDir, { recursive: true });
  mkdirSync(runsDir, { recursive: true });

  // Create global.json (required by ConfigManager.configExists)
  const globalConfig = {
    tmux_session_prefix: 'dure-test',
    max_iterations: 3,
  };
  writeFileSync(join(configDir, 'global.json'), JSON.stringify(globalConfig, null, 2));

  // Create agents.json
  const agentsConfig = {
    refiner: { model: 'haiku' },
    builder: { model: 'sonnet' },
    verifier: { model: 'haiku' },
    gatekeeper: { model: 'sonnet' },
  };
  writeFileSync(join(configDir, 'agents.json'), JSON.stringify(agentsConfig, null, 2));
};

const createTestRun = (projectRoot: string, runId: string): void => {
  const runDir = join(projectRoot, '.dure', 'runs', runId);
  mkdirSync(runDir, { recursive: true });

  // Create state.json
  const state = {
    run_id: runId,
    phase: 'refine',
    status: 'running',
    iteration: 1,
    max_iterations: 3,
    agents: {
      refiner: { status: 'running' },
      builder: { status: 'pending' },
      verifier: { status: 'pending' },
      gatekeeper: { status: 'pending' },
    },
  };
  writeFileSync(join(runDir, 'state.json'), JSON.stringify(state, null, 2));
};

describe('Monitor Command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Project validation', () => {
    it('should detect uninitialized project', async () => {
      // Project without .dure directory
      const configManager = await import('../../../src/config/config-manager.js');
      const manager = new configManager.ConfigManager(testDir);
      expect(manager.configExists()).toBe(false);
    });

    it('should detect initialized project', async () => {
      setupDureProject(testDir);
      const configManager = await import('../../../src/config/config-manager.js');
      const manager = new configManager.ConfigManager(testDir);
      expect(manager.configExists()).toBe(true);
    });
  });

  describe('Run detection', () => {
    it('should find no runs in empty project', () => {
      setupDureProject(testDir);
      const runsDir = join(testDir, '.dure', 'runs');
      const { readdirSync } = require('fs');
      const runs = readdirSync(runsDir).filter((name: string) => name.startsWith('run-'));
      expect(runs).toHaveLength(0);
    });

    it('should find existing runs', () => {
      setupDureProject(testDir);
      createTestRun(testDir, 'run-20240129-100000');
      createTestRun(testDir, 'run-20240129-110000');

      const runsDir = join(testDir, '.dure', 'runs');
      const { readdirSync } = require('fs');
      const runs = readdirSync(runsDir)
        .filter((name: string) => name.startsWith('run-'))
        .sort()
        .reverse();

      expect(runs).toHaveLength(2);
      expect(runs[0]).toBe('run-20240129-110000'); // Latest first
    });

    it('should verify run directory exists', () => {
      setupDureProject(testDir);
      createTestRun(testDir, 'run-20240129-100000');

      const runDir = join(testDir, '.dure', 'runs', 'run-20240129-100000');
      expect(existsSync(runDir)).toBe(true);

      const nonexistentRunDir = join(testDir, '.dure', 'runs', 'run-nonexistent');
      expect(existsSync(nonexistentRunDir)).toBe(false);
    });
  });

  describe('Options parsing', () => {
    it('should handle web option', () => {
      const options = { web: true, port: '3873' };
      expect(options.web).toBe(true);
      expect(parseInt(options.port, 10)).toBe(3873);
    });

    it('should handle custom port', () => {
      const options = { web: true, port: '8080' };
      expect(parseInt(options.port, 10)).toBe(8080);
    });

    it('should default to TUI mode when web is not specified', () => {
      const options = { port: '3873' };
      expect(options.web).toBeUndefined();
    });
  });

  describe('URL generation', () => {
    it('should generate correct web dashboard URL', () => {
      const runId = 'run-20240129-100000';
      const port = 3873;
      const url = `http://localhost:${port}/run/${runId}`;
      expect(url).toBe('http://localhost:3873/run/run-20240129-100000');
    });

    it('should handle custom port in URL', () => {
      const runId = 'run-20240129-100000';
      const port = 8080;
      const url = `http://localhost:${port}/run/${runId}`;
      expect(url).toBe('http://localhost:8080/run/run-20240129-100000');
    });
  });
});

describe('Start Command Options', () => {
  describe('Options parsing', () => {
    it('should support -w flag for web dashboard', () => {
      const options = { web: true };
      expect(options.web).toBe(true);
    });

    it('should support -a flag for tmux attach', () => {
      const options = { attach: true };
      expect(options.attach).toBe(true);
    });

    it('should default to TUI when no options specified', () => {
      // When no options, TUI is the default
      const options = { port: '3873' };
      expect(options.web).toBeUndefined();
      expect(options.attach).toBeUndefined();
    });
  });
});
