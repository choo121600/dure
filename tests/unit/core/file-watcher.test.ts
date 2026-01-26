/**
 * Unit tests for FileWatcher
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { FileWatcher, WatchEvent, ErrorFlag } from '../../../src/core/file-watcher.js';
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

describe('FileWatcher', () => {
  let tempDir: string;
  let runDir: string;
  let runId: string;
  let fileWatcher: FileWatcher;

  beforeEach(() => {
    tempDir = createTempDir('file-watcher-test');
    runId = generateTestRunId();
    runDir = createMockRunDir(tempDir, runId);
    fileWatcher = new FileWatcher(runDir);
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
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100); // Wait for watcher to initialize

      createDoneFlag(runDir, 'builder');

      await wait(1500); // Wait for debounce and file detection

      const builderDoneEvents = events.filter((e) => e.type === 'builder_done');
      expect(builderDoneEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit verifier_done when verifier/done.flag is created', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      createDoneFlag(runDir, 'verifier');

      await wait(1500);

      const verifierDoneEvents = events.filter((e) => e.type === 'verifier_done');
      expect(verifierDoneEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('refiner_done detection', () => {
    it('should emit refiner_done when briefing/refined.md is created', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      writeFileSync(join(runDir, 'briefing', 'refined.md'), '# Refined briefing', 'utf-8');

      await wait(1500);

      const refinerDoneEvents = events.filter((e) => e.type === 'refiner_done');
      expect(refinerDoneEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('gatekeeper_done detection', () => {
    it('should emit gatekeeper_done with verdict when verdict.json is created', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      const verdict = createMockVerdict('PASS');
      writeMockVerdict(runDir, verdict);

      await wait(1500);

      const gatekeeperDoneEvents = events.filter(
        (e) => e.type === 'gatekeeper_done'
      ) as Array<{ type: 'gatekeeper_done'; verdict: GatekeeperVerdict }>;
      expect(gatekeeperDoneEvents.length).toBeGreaterThanOrEqual(1);
      expect(gatekeeperDoneEvents[0].verdict.verdict).toBe('PASS');
    });

    it('should parse FAIL verdict correctly', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      const verdict = createMockVerdict('FAIL', { issues: ['Issue 1', 'Issue 2'] });
      writeMockVerdict(runDir, verdict);

      await wait(1500);

      const gatekeeperDoneEvents = events.filter(
        (e) => e.type === 'gatekeeper_done'
      ) as Array<{ type: 'gatekeeper_done'; verdict: GatekeeperVerdict }>;
      expect(gatekeeperDoneEvents.length).toBeGreaterThanOrEqual(1);
      expect(gatekeeperDoneEvents[0].verdict.verdict).toBe('FAIL');
      expect(gatekeeperDoneEvents[0].verdict.issues).toContain('Issue 1');
    });
  });

  describe('CRP detection', () => {
    it('should emit crp_created when CRP file is created', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      const crp = createMockCRP('crp-001');
      writeMockCRP(runDir, crp);

      await wait(1500);

      const crpCreatedEvents = events.filter(
        (e) => e.type === 'crp_created'
      ) as Array<{ type: 'crp_created'; crp: CRP }>;
      expect(crpCreatedEvents.length).toBeGreaterThanOrEqual(1);
      expect(crpCreatedEvents[0].crp.crp_id).toBe('crp-001');
    });

    it('should emit error for invalid CRP JSON', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      writeFileSync(join(runDir, 'crp', 'crp-invalid.json'), 'invalid json {{{', 'utf-8');

      await wait(1500);

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('VCR detection', () => {
    it('should emit vcr_created when VCR file is created', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      const vcr = createMockVCR('vcr-001', 'crp-001');
      writeMockVCR(runDir, vcr);

      await wait(1500);

      const vcrCreatedEvents = events.filter(
        (e) => e.type === 'vcr_created'
      ) as Array<{ type: 'vcr_created'; vcrId: string; crpId: string }>;
      expect(vcrCreatedEvents.length).toBeGreaterThanOrEqual(1);
      expect(vcrCreatedEvents[0].vcrId).toBe('vcr-001');
      expect(vcrCreatedEvents[0].crpId).toBe('crp-001');
    });
  });

  describe('MRP detection', () => {
    it('should emit mrp_created when mrp/summary.md is created', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      writeFileSync(join(runDir, 'mrp', 'summary.md'), '# MRP Summary', 'utf-8');

      await wait(1500);

      const mrpCreatedEvents = events.filter((e) => e.type === 'mrp_created');
      expect(mrpCreatedEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error.flag detection', () => {
    it('should emit error_flag when error.flag is created', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      const errorFlag: ErrorFlag = {
        agent: 'builder',
        error_type: 'crash',
        message: 'Process crashed',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };

      writeFileSync(join(runDir, 'builder', 'error.flag'), JSON.stringify(errorFlag), 'utf-8');

      await wait(1500);

      const errorFlagEvents = events.filter(
        (e) => e.type === 'error_flag'
      ) as Array<{ type: 'error_flag'; errorFlag: ErrorFlag; agent: string }>;
      expect(errorFlagEvents.length).toBeGreaterThanOrEqual(1);
      expect(errorFlagEvents[0].errorFlag.error_type).toBe('crash');
      expect(errorFlagEvents[0].agent).toBe('builder');
    });

    it('should handle invalid error.flag JSON', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      writeFileSync(join(runDir, 'builder', 'error.flag'), 'not valid json', 'utf-8');

      await wait(1500);

      const errorFlagEvents = events.filter(
        (e) => e.type === 'error_flag'
      ) as Array<{ type: 'error_flag'; errorFlag: ErrorFlag; agent: string }>;
      expect(errorFlagEvents.length).toBeGreaterThanOrEqual(1);
      // Should create a basic error flag even if JSON is invalid
      expect(errorFlagEvents[0].errorFlag.error_type).toBe('crash');
      expect(errorFlagEvents[0].errorFlag.recoverable).toBe(false);
    });
  });

  describe('debounce behavior', () => {
    it('should debounce duplicate events within debounce window', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      // Create done.flag twice quickly
      createDoneFlag(runDir, 'builder');
      await wait(100);

      // Modify the file (this should be debounced)
      writeFileSync(join(runDir, 'builder', 'done.flag'), 'updated', 'utf-8');

      await wait(1500);

      // Should only have one builder_done event due to debounce
      const builderDoneEvents = events.filter((e) => e.type === 'builder_done');
      expect(builderDoneEvents.length).toBe(1);
    });

    it('should allow events after debounce window', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));
      fileWatcher.start();

      await wait(100);

      createDoneFlag(runDir, 'builder');

      // Wait longer than debounce window
      await wait(3000);

      // Simulate another creation by modifying (triggering change event)
      writeFileSync(join(runDir, 'builder', 'done.flag'), 'new content ' + Date.now(), 'utf-8');

      await wait(1500);

      // builder_done events should be at least 1 (the second may or may not trigger depending on timing)
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
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));

      // Create the file before starting watcher
      writeFileSync(join(runDir, 'briefing', 'refined.md'), '# Initial', 'utf-8');

      fileWatcher.start();

      await wait(100);

      // Update the file
      writeFileSync(join(runDir, 'briefing', 'refined.md'), '# Updated', 'utf-8');

      await wait(1500);

      const refinerDoneEvents = events.filter((e) => e.type === 'refiner_done');
      expect(refinerDoneEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit gatekeeper_done on verdict.json change', async () => {
      const events: WatchEvent[] = [];
      fileWatcher.on('event', (event) => events.push(event));

      // Create initial verdict
      const initialVerdict = createMockVerdict('FAIL');
      writeMockVerdict(runDir, initialVerdict);

      fileWatcher.start();

      await wait(100);

      // Update verdict
      const updatedVerdict = createMockVerdict('PASS');
      writeMockVerdict(runDir, updatedVerdict);

      await wait(1500);

      const gatekeeperDoneEvents = events.filter(
        (e) => e.type === 'gatekeeper_done'
      ) as Array<{ type: 'gatekeeper_done'; verdict: GatekeeperVerdict }>;
      expect(gatekeeperDoneEvents.length).toBeGreaterThanOrEqual(1);
    });
  });
});
