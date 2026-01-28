/**
 * Unit tests for TUI App functionality
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createTempDir,
  cleanupTempDir,
  generateTestRunId,
  createMockRunDir,
  createMockState,
  writeMockState,
} from '../../helpers/test-utils.js';
import { ConfigManager } from '../../../src/config/config-manager.js';
import { RunManager } from '../../../src/core/run-manager.js';

describe('TUI App', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = createTempDir('tui-app-test');
    // Initialize config
    const configManager = new ConfigManager(tempDir);
    configManager.initialize();
    // Initialize run manager
    const runManager = new RunManager(tempDir);
    await runManager.initialize();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('createTuiApp', () => {
    it('should be importable and export createTuiApp function', async () => {
      const { createTuiApp } = await import('../../../src/tui/app.js');
      expect(createTuiApp).toBeDefined();
      expect(typeof createTuiApp).toBe('function');
    });

    it('should export TuiApp interface types', async () => {
      const appModule = await import('../../../src/tui/app.js');
      expect(appModule.createTuiApp).toBeDefined();
    });
  });

  describe('TUI index', () => {
    it('should be importable and re-export createTuiApp', async () => {
      const { createTuiApp } = await import('../../../src/tui/index.js');
      expect(createTuiApp).toBeDefined();
      expect(typeof createTuiApp).toBe('function');
    });
  });

  describe('Configuration integration', () => {
    it('should load config from project root', async () => {
      const configManager = new ConfigManager(tempDir);
      configManager.initialize();
      const config = configManager.loadConfig();

      expect(config).toBeDefined();
      expect(config.global).toBeDefined();
    });
  });

  describe('Run management', () => {
    it('should list available runs', async () => {
      const runManager = new RunManager(tempDir);
      await runManager.initialize();

      // Initially empty
      const emptyRuns = await runManager.listRuns();
      expect(emptyRuns).toEqual([]);

      // Create a mock run
      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const state = createMockState(runId);
      writeMockState(runDir, state);

      // Should find the run
      const runs = await runManager.listRuns();
      expect(runs.length).toBe(1);
      expect(runs[0].run_id).toContain('run-');
    });

    it('should get current run', async () => {
      const runManager = new RunManager(tempDir);
      await runManager.initialize();

      const runId = generateTestRunId();
      const runDir = createMockRunDir(tempDir, runId);
      const state = createMockState(runId);
      writeMockState(runDir, state);

      const currentRun = await runManager.getCurrentRun();
      expect(currentRun).toBeDefined();
      expect(currentRun?.run_id).toBe(runId);
    });
  });
});

describe('Run List Screen', () => {
  it('should be importable', async () => {
    const { createRunListScreen } = await import('../../../src/tui/screens/run-list.js');
    expect(createRunListScreen).toBeDefined();
    expect(typeof createRunListScreen).toBe('function');
  });
});

describe('TUI State Manager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = createTempDir('tui-state-test');
    const configManager = new ConfigManager(tempDir);
    configManager.initialize();
    const runManager = new RunManager(tempDir);
    await runManager.initialize();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should be importable', async () => {
    const { TuiStateManager } = await import('../../../src/tui/state/tui-state.js');
    expect(TuiStateManager).toBeDefined();
  });

  it('should initialize with project root', async () => {
    const { TuiStateManager } = await import('../../../src/tui/state/tui-state.js');
    const stateManager = new TuiStateManager({ projectRoot: tempDir });

    expect(stateManager.getState()).toBeNull();
    expect(stateManager.getCurrentRunId()).toBeNull();

    await stateManager.stop();
  });

  it('should list runs when started', async () => {
    const { TuiStateManager } = await import('../../../src/tui/state/tui-state.js');
    const stateManager = new TuiStateManager({ projectRoot: tempDir });

    // Create a mock run
    const runId = generateTestRunId();
    const runDir = createMockRunDir(tempDir, runId);
    const state = createMockState(runId);
    writeMockState(runDir, state);

    const runs = await stateManager.listRuns();
    expect(runs.length).toBe(1);
    expect(runs[0].runId).toBe(runId);

    await stateManager.stop();
  });

  it('should set current run', async () => {
    const { TuiStateManager } = await import('../../../src/tui/state/tui-state.js');
    const stateManager = new TuiStateManager({ projectRoot: tempDir });

    const runId = generateTestRunId();
    const runDir = createMockRunDir(tempDir, runId);
    const state = createMockState(runId);
    writeMockState(runDir, state);

    await stateManager.setCurrentRun(runId);

    expect(stateManager.getCurrentRunId()).toBe(runId);
    expect(stateManager.getState()).not.toBeNull();
    expect(stateManager.getState()?.run_id).toBe(runId);

    await stateManager.stop();
  });
});
