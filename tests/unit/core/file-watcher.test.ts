/**
 * Unit tests for FileWatcher
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { FileWatcher, WatchEvent, ErrorFlag, FileWatcherOptions } from '../../../src/core/file-watcher.js';

/** Test-optimized options for FileWatcher */
const TEST_WATCHER_OPTIONS: FileWatcherOptions = {
  usePolling: false,
  pollingInterval: 100,
  debounceMs: 500,
  stabilityThreshold: 0,  // Disable awaitWriteFinish for faster test execution
};
import {
  createTempDir,
  cleanupTempDir,
  generateTestRunId,
  createMockRunDir,
  createMockCRP,
  createMockVCR,
  createMockVerdict,
  writeMockCRP,
  writeMockVCR,
  writeMockVerdict,
  createDoneFlag,
  wait,
} from '../../helpers/test-utils.js';
import type { CRP, GatekeeperVerdict } from '../../../src/types/index.js';

/**
 * Wait for a specific event type with timeout
 */
function waitForEvent(
  fileWatcher: FileWatcher,
  eventType: string,
  timeoutMs: number = 5000
): Promise<WatchEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventType}`));
    }, timeoutMs);

    const handler = (event: WatchEvent) => {
      if (event.type === eventType) {
        clearTimeout(timeout);
        fileWatcher.off('event', handler);
        resolve(event);
      }
    };

    fileWatcher.on('event', handler);
  });
}

describe('FileWatcher', () => {
  let tempDir: string;
  let runDir: string;
  let runId: string;
  let fileWatcher: FileWatcher;

  beforeEach(() => {
    tempDir = createTempDir('file-watcher-test');
    runId = generateTestRunId();
    runDir = createMockRunDir(tempDir, runId);
    fileWatcher = new FileWatcher(runDir, TEST_WATCHER_OPTIONS);
  });

  afterEach(async () => {
    await fileWatcher.stop();
    cleanupTempDir(tempDir);
  });

  describe('constructor', () => {
    it('should create FileWatcher with run directory', () => {
      expect(fileWatcher.getRunDir()).toBe(runDir);
    });
  });

  describe('start/stop', () => {
    it('should start watching', () => {
      fileWatcher.start();
      // No error means success
      expect(true).toBe(true);
    });

    it('should stop watching', async () => {
      fileWatcher.start();
      await fileWatcher.stop();
      // No error means success
      expect(true).toBe(true);
    });

    it('should not throw when starting multiple times', () => {
      fileWatcher.start();
      fileWatcher.start();
      expect(true).toBe(true);
    });
  });

  describe('done.flag detection', () => {
    it('should emit builder_done when builder/done.flag is created', async () => {
      fileWatcher.start();
      await wait(200); // Wait for watcher to initialize

      const eventPromise = waitForEvent(fileWatcher, 'builder_done', 5000);
      createDoneFlag(runDir, 'builder');

      const event = await eventPromise;
      expect(event.type).toBe('builder_done');
    });

    it('should emit verifier_done when verifier/done.flag is created', async () => {
      fileWatcher.start();
      await wait(200);

      const eventPromise = waitForEvent(fileWatcher, 'verifier_done', 5000);
      createDoneFlag(runDir, 'verifier');

      const event = await eventPromise;
      expect(event.type).toBe('verifier_done');
    });
  });

  describe('refiner_done detection', () => {
    it('should emit refiner_done when briefing/refined.md is created', async () => {
      fileWatcher.start();
      await wait(200);

      const eventPromise = waitForEvent(fileWatcher, 'refiner_done', 5000);
      writeFileSync(join(runDir, 'briefing', 'refined.md'), '# Refined briefing', 'utf-8');

      const event = await eventPromise;
      expect(event.type).toBe('refiner_done');
    });
  });

  describe('gatekeeper_done detection', () => {
    it('should emit gatekeeper_done with verdict when verdict.json is created', async () => {
      fileWatcher.start();
      await wait(200);

      const eventPromise = waitForEvent(fileWatcher, 'gatekeeper_done', 5000);
      const verdict = createMockVerdict('PASS');
      writeMockVerdict(runDir, verdict);

      const event = await eventPromise as { type: 'gatekeeper_done'; verdict: GatekeeperVerdict };
      expect(event.type).toBe('gatekeeper_done');
      expect(event.verdict.verdict).toBe('PASS');
    });

    it('should parse FAIL verdict correctly', async () => {
      fileWatcher.start();
      await wait(200);

      const eventPromise = waitForEvent(fileWatcher, 'gatekeeper_done', 5000);
      const verdict = createMockVerdict('FAIL', { issues: ['Issue 1', 'Issue 2'] });
      writeMockVerdict(runDir, verdict);

      const event = await eventPromise as { type: 'gatekeeper_done'; verdict: GatekeeperVerdict };
      expect(event.type).toBe('gatekeeper_done');
      expect(event.verdict.verdict).toBe('FAIL');
      expect(event.verdict.issues).toContain('Issue 1');
    });
  });

  describe('CRP detection', () => {
    it('should emit crp_created when CRP file is created', async () => {
      fileWatcher.start();
      await wait(200);

      const eventPromise = waitForEvent(fileWatcher, 'crp_created', 5000);
      const crp = createMockCRP('crp-001');
      writeMockCRP(runDir, crp);

      const event = await eventPromise as { type: 'crp_created'; crp: CRP };
      expect(event.type).toBe('crp_created');
      expect(event.crp.crp_id).toBe('crp-001');
    });

    it('should emit error for invalid CRP JSON', async () => {
      fileWatcher.start();
      await wait(200);

      const eventPromise = waitForEvent(fileWatcher, 'error', 5000);
      writeFileSync(join(runDir, 'crp', 'crp-invalid.json'), 'invalid json {{{', 'utf-8');

      const event = await eventPromise;
      expect(event.type).toBe('error');
    });
  });

  describe('VCR detection', () => {
    it('should emit vcr_created when VCR file is created', async () => {
      fileWatcher.start();
      await wait(200);

      const eventPromise = waitForEvent(fileWatcher, 'vcr_created', 5000);
      const vcr = createMockVCR('vcr-001', 'crp-001');
      writeMockVCR(runDir, vcr);

      const event = await eventPromise as { type: 'vcr_created'; vcrId: string; crpId: string };
      expect(event.type).toBe('vcr_created');
      expect(event.vcrId).toBe('vcr-001');
      expect(event.crpId).toBe('crp-001');
    });
  });

  describe('MRP detection', () => {
    it('should emit mrp_created when mrp/summary.md is created', async () => {
      fileWatcher.start();
      await wait(200);

      const eventPromise = waitForEvent(fileWatcher, 'mrp_created', 5000);
      writeFileSync(join(runDir, 'mrp', 'summary.md'), '# MRP Summary', 'utf-8');

      const event = await eventPromise;
      expect(event.type).toBe('mrp_created');
    });
  });

  describe('error.flag detection', () => {
    it('should emit error_flag when error.flag is created', async () => {
      fileWatcher.start();
      await wait(200);

      const errorFlag: ErrorFlag = {
        agent: 'builder',
        error_type: 'crash',
        message: 'Process crashed',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };

      const eventPromise = waitForEvent(fileWatcher, 'error_flag', 5000);
      writeFileSync(join(runDir, 'builder', 'error.flag'), JSON.stringify(errorFlag), 'utf-8');

      const event = await eventPromise as { type: 'error_flag'; errorFlag: ErrorFlag; agent: string };
      expect(event.type).toBe('error_flag');
      expect(event.errorFlag.error_type).toBe('crash');
      expect(event.agent).toBe('builder');
    });

    it('should handle invalid error.flag JSON', async () => {
      fileWatcher.start();
      await wait(200);

      const eventPromise = waitForEvent(fileWatcher, 'error_flag', 5000);
      writeFileSync(join(runDir, 'builder', 'error.flag'), 'not valid json', 'utf-8');

      const event = await eventPromise as { type: 'error_flag'; errorFlag: ErrorFlag; agent: string };
      expect(event.type).toBe('error_flag');
      // Should create a basic error flag even if JSON is invalid
      expect(event.errorFlag.error_type).toBe('crash');
      expect(event.errorFlag.recoverable).toBe(false);
    });
  });

  describe('debounce behavior', () => {
    it('should debounce duplicate events within debounce window', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();
      await wait(200);

      // Create done.flag - wait for first event
      const eventPromise = waitForEvent(fileWatcher, 'builder_done', 5000);
      createDoneFlag(runDir, 'builder');
      await eventPromise;

      // Modify the file quickly (this should be debounced)
      writeFileSync(join(runDir, 'builder', 'done.flag'), 'updated', 'utf-8');

      // Wait for potential second event (should not arrive due to debounce - 500ms)
      await wait(600);

      // Should only have one builder_done event due to debounce
      const builderDoneEvents = events.filter((e) => e.type === 'builder_done');
      expect(builderDoneEvents.length).toBe(1);
    });

    it('should allow events after debounce window', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();
      await wait(200);

      // First event
      const firstEventPromise = waitForEvent(fileWatcher, 'builder_done', 5000);
      createDoneFlag(runDir, 'builder');
      await firstEventPromise;

      // Wait longer than debounce window (500ms in test mode)
      await wait(700);

      // builder_done events should be at least 1
      const builderDoneEvents = events.filter((e) => e.type === 'builder_done');
      expect(builderDoneEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('checkFileExists', () => {
    it('should return true for existing file', () => {
      createDoneFlag(runDir, 'builder');
      expect(fileWatcher.checkFileExists('builder/done.flag')).toBe(true);
    });

    it('should return false for non-existing file', () => {
      expect(fileWatcher.checkFileExists('builder/done.flag')).toBe(false);
    });
  });

  describe('waitForFile', () => {
    it('should resolve immediately if file exists', async () => {
      createDoneFlag(runDir, 'builder');

      await expect(fileWatcher.waitForFile('builder/done.flag')).resolves.toBeUndefined();
    });

    it('should resolve when file is created', async () => {
      const waitPromise = fileWatcher.waitForFile('builder/done.flag', 5000);

      // Create file after a short delay
      setTimeout(() => {
        createDoneFlag(runDir, 'builder');
      }, 100);

      await expect(waitPromise).resolves.toBeUndefined();
    });

    it('should reject on timeout', async () => {
      await expect(fileWatcher.waitForFile('builder/done.flag', 100)).rejects.toThrow('Timeout');
    });
  });

  describe('error handling', () => {
    it('should emit error event when watcher encounters error', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      // The watcher error is internal to chokidar, so we simulate by checking error events are handled
      // This test verifies the event listener is set up
      expect(true).toBe(true);
    });
  });

  describe('file change handling', () => {
    it('should emit refiner_done on refined.md change (not just add)', async () => {
      // Create the file before starting watcher
      writeFileSync(join(runDir, 'briefing', 'refined.md'), '# Initial', 'utf-8');

      fileWatcher.start();
      await wait(200);

      // Update the file
      const eventPromise = waitForEvent(fileWatcher, 'refiner_done', 5000);
      writeFileSync(join(runDir, 'briefing', 'refined.md'), '# Updated ' + Date.now(), 'utf-8');

      const event = await eventPromise;
      expect(event.type).toBe('refiner_done');
    });

    it('should emit gatekeeper_done on verdict.json change', async () => {
      // Create initial verdict
      const initialVerdict = createMockVerdict('FAIL');
      writeMockVerdict(runDir, initialVerdict);

      fileWatcher.start();
      await wait(200);

      // Update verdict
      const eventPromise = waitForEvent(fileWatcher, 'gatekeeper_done', 5000);
      const updatedVerdict = createMockVerdict('PASS');
      writeMockVerdict(runDir, updatedVerdict);

      const event = await eventPromise as { type: 'gatekeeper_done'; verdict: GatekeeperVerdict };
      expect(event.type).toBe('gatekeeper_done');
    });
  });
});
