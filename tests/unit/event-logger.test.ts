/**
 * Unit tests for EventLogger
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { EventLogger } from '../../src/core/event-logger.js';
import { createTempDir, cleanupTempDir } from '../helpers/test-utils.js';

describe('EventLogger', () => {
  let tempDir: string;
  let runDir: string;
  let logger: EventLogger;

  beforeEach(() => {
    tempDir = createTempDir('event-logger');
    runDir = join(tempDir, 'run-20260127120000');
    mkdirSync(runDir, { recursive: true });
    logger = new EventLogger(runDir);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('constructor', () => {
    it('should create events.log file directory', () => {
      const deepRunDir = join(tempDir, 'nested', 'deep', 'run');
      const deepLogger = new EventLogger(deepRunDir);

      // Directory should be created
      deepLogger.log('INFO', 'test.event');
      expect(existsSync(join(deepRunDir, 'events.log'))).toBe(true);
    });
  });

  describe('log()', () => {
    it('should write log entry with timestamp, level, and event', () => {
      logger.log('INFO', 'test.event');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(content).toContain('[INFO]');
      expect(content).toContain('test.event');
    });

    it('should write log entry with data', () => {
      logger.log('INFO', 'test.event', { key1: 'value1', key2: 123 });

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('key1="value1"');
      expect(content).toContain('key2=123');
    });

    it('should support WARN level', () => {
      logger.log('WARN', 'warning.event');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('[WARN]');
    });

    it('should support ERROR level', () => {
      logger.log('ERROR', 'error.event');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('[ERROR]');
    });

    it('should append multiple log entries', () => {
      logger.log('INFO', 'event1');
      logger.log('INFO', 'event2');
      logger.log('INFO', 'event3');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(3);
    });
  });

  describe('convenience methods', () => {
    it('should log run started', () => {
      logger.logRunStarted('run-20260127120000');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('[INFO]');
      expect(content).toContain('run.started');
      expect(content).toContain('run_id="run-20260127120000"');
    });

    it('should log run completed', () => {
      logger.logRunCompleted('run-20260127120000', 'PASS');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('run.completed');
      expect(content).toContain('verdict="PASS"');
    });

    it('should log phase changed', () => {
      logger.logPhaseChanged('refine', 'build');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('phase.changed');
      expect(content).toContain('from="refine"');
      expect(content).toContain('to="build"');
    });

    it('should log agent started', () => {
      logger.logAgentStarted('builder');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('agent.started');
      expect(content).toContain('agent="builder"');
    });

    it('should log agent completed with duration', () => {
      logger.logAgentCompleted('builder', 5000);

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('agent.completed');
      expect(content).toContain('duration_ms=5000');
    });

    it('should log agent failed', () => {
      logger.logAgentFailed('verifier', 'crash', 'Process exited unexpectedly');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('[ERROR]');
      expect(content).toContain('agent.failed');
      expect(content).toContain('error_type="crash"');
    });

    it('should log agent timeout', () => {
      logger.logAgentTimeout('refiner', 300000);

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('[WARN]');
      expect(content).toContain('agent.timeout');
      expect(content).toContain('elapsed_ms=300000');
    });

    it('should log agent retry', () => {
      logger.logAgentRetry('builder', 2);

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('agent.retry');
      expect(content).toContain('attempt=2');
    });

    it('should log CRP created', () => {
      logger.logCRPCreated('crp-001', 'gatekeeper');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('[WARN]');
      expect(content).toContain('crp.created');
      expect(content).toContain('crp_id="crp-001"');
    });

    it('should log VCR created', () => {
      logger.logVCRCreated('vcr-001', 'crp-001');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('vcr.created');
      expect(content).toContain('vcr_id="vcr-001"');
      expect(content).toContain('crp_id="crp-001"');
    });

    it('should log MRP created', () => {
      logger.logMRPCreated('run-20260127120000');

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('mrp.created');
    });

    it('should log iteration started', () => {
      logger.logIterationStarted(2, 3);

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('iteration.started');
      expect(content).toContain('iteration=2');
      expect(content).toContain('max_iterations=3');
    });

    it('should log iteration exhausted', () => {
      logger.logIterationExhausted(3, 3);

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('[ERROR]');
      expect(content).toContain('iteration.exhausted');
    });

    it('should log generic error', () => {
      logger.logError('Something went wrong', { code: 500, source: 'test' });

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('[ERROR]');
      expect(content).toContain('message="Something went wrong"');
      expect(content).toContain('code=500');
    });
  });

  describe('data formatting', () => {
    it('should format nested objects', () => {
      logger.log('INFO', 'test.event', {
        nested: { key: 'value' },
      });

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('nested={"key":"value"}');
    });

    it('should format arrays', () => {
      logger.log('INFO', 'test.event', {
        list: [1, 2, 3],
      });

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('list=[1,2,3]');
    });

    it('should format boolean values', () => {
      logger.log('INFO', 'test.event', {
        active: true,
        disabled: false,
      });

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('active=true');
      expect(content).toContain('disabled=false');
    });

    it('should format null values', () => {
      logger.log('INFO', 'test.event', {
        value: null,
      });

      const content = readFileSync(join(runDir, 'events.log'), 'utf-8');
      expect(content).toContain('value=null');
    });
  });
});
