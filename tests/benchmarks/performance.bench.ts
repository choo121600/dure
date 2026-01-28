/**
 * Performance benchmarks for Dure
 * Measures async I/O, caching, and other performance-critical operations
 *
 * Run with: npx vitest bench tests/benchmarks/performance.bench.ts
 */
import { describe, bench, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Test directory for benchmarks
const BENCH_DIR = join(tmpdir(), `dure-bench-${Date.now()}`);
const TEST_FILE = join(BENCH_DIR, 'test-state.json');
const LARGE_FILE = join(BENCH_DIR, 'large-state.json');

// Sample state data
const sampleState = {
  run_id: 'run-20260126120000',
  phase: 'build',
  created_at: '2026-01-26T12:00:00.000Z',
  updated_at: '2026-01-26T12:00:00.000Z',
  briefing: {
    raw: 'Test briefing content',
    refined: 'Refined briefing content',
  },
  agents: {
    refiner: { status: 'completed', started_at: '2026-01-26T12:00:00.000Z' },
    builder: { status: 'running', started_at: '2026-01-26T12:00:00.000Z' },
    verifier: { status: 'pending' },
    gatekeeper: { status: 'pending' },
  },
  history: [],
};

// Large state with history
const largeState = {
  ...sampleState,
  history: Array.from({ length: 1000 }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 1000).toISOString(),
    event: `Event ${i}`,
    details: { iteration: i, data: 'x'.repeat(100) },
  })),
};

beforeAll(() => {
  mkdirSync(BENCH_DIR, { recursive: true });
  writeFileSync(TEST_FILE, JSON.stringify(sampleState, null, 2));
  writeFileSync(LARGE_FILE, JSON.stringify(largeState, null, 2));
});

afterAll(() => {
  rmSync(BENCH_DIR, { recursive: true, force: true });
});

describe('File I/O Benchmarks', () => {
  describe('Sync vs Async Read', () => {
    bench('sync read (readFileSync)', () => {
      const content = readFileSync(TEST_FILE, 'utf-8');
      JSON.parse(content);
    });

    bench('async read (readFile)', async () => {
      const content = await readFile(TEST_FILE, 'utf-8');
      JSON.parse(content);
    });
  });

  describe('Sync vs Async Write', () => {
    const writeData = JSON.stringify(sampleState, null, 2);

    bench('sync write (writeFileSync)', () => {
      writeFileSync(join(BENCH_DIR, 'sync-write.json'), writeData);
    });

    bench('async write (writeFile)', async () => {
      await writeFile(join(BENCH_DIR, 'async-write.json'), writeData);
    });
  });

  describe('Large File Operations', () => {
    bench('read large file sync', () => {
      const content = readFileSync(LARGE_FILE, 'utf-8');
      JSON.parse(content);
    });

    bench('read large file async', async () => {
      const content = await readFile(LARGE_FILE, 'utf-8');
      JSON.parse(content);
    });
  });
});

describe('JSON Operations Benchmarks', () => {
  const jsonString = JSON.stringify(sampleState, null, 2);
  const largeJsonString = JSON.stringify(largeState, null, 2);

  bench('JSON.parse small', () => {
    JSON.parse(jsonString);
  });

  bench('JSON.stringify small', () => {
    JSON.stringify(sampleState, null, 2);
  });

  bench('JSON.parse large', () => {
    JSON.parse(largeJsonString);
  });

  bench('JSON.stringify large', () => {
    JSON.stringify(largeState, null, 2);
  });
});

describe('Caching Simulation Benchmarks', () => {
  // Simulate StateManager caching behavior
  class CachedReader {
    private cache: string | null = null;
    private lastReadTime = 0;
    private readonly cacheTtlMs = 1000;

    readWithCache(filePath: string): string {
      const now = Date.now();
      if (this.cache && now - this.lastReadTime < this.cacheTtlMs) {
        return this.cache;
      }
      this.cache = readFileSync(filePath, 'utf-8');
      this.lastReadTime = now;
      return this.cache;
    }

    readWithoutCache(filePath: string): string {
      return readFileSync(filePath, 'utf-8');
    }

    clearCache(): void {
      this.cache = null;
      this.lastReadTime = 0;
    }
  }

  const cachedReader = new CachedReader();

  bench('read without cache (always disk)', () => {
    cachedReader.readWithoutCache(TEST_FILE);
  });

  bench('read with cache (first read)', () => {
    cachedReader.clearCache();
    cachedReader.readWithCache(TEST_FILE);
  });

  bench('read with cache (cache hit)', () => {
    // Cache should be warm from previous iteration
    cachedReader.readWithCache(TEST_FILE);
  });
});

describe('Sanitization Benchmarks', () => {
  // Import-free sanitization simulation for benchmark
  const SESSION_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
  const MAX_SESSION_NAME_LENGTH = 64;

  function sanitizeSessionName(name: string): string {
    if (!name || typeof name !== 'string') {
      throw new Error('Invalid');
    }
    const trimmed = name.trim();
    if (trimmed.length > MAX_SESSION_NAME_LENGTH) {
      throw new Error('Too long');
    }
    if (!SESSION_NAME_PATTERN.test(trimmed)) {
      throw new Error('Invalid chars');
    }
    return trimmed;
  }

  const validName = 'dure-run-12345';
  const longName = 'a'.repeat(64);

  bench('sanitize short name', () => {
    sanitizeSessionName(validName);
  });

  bench('sanitize max length name', () => {
    sanitizeSessionName(longName);
  });
});

describe('Path Operations Benchmarks', () => {
  const { resolve, normalize, isAbsolute } = require('path');

  bench('path.resolve', () => {
    resolve('/tmp/safe', 'subdir/file.txt');
  });

  bench('path.normalize', () => {
    normalize('/tmp//test/../file.txt');
  });

  bench('path.isAbsolute', () => {
    isAbsolute('/tmp/test');
  });

  bench('combined path operations', () => {
    const input = 'subdir/../file.txt';
    const base = '/tmp/safe';
    const normalized = normalize(input);
    const resolved = isAbsolute(normalized) ? resolve(normalized) : resolve(base, normalized);
    resolved.startsWith(base);
  });
});

describe('Concurrent Operations Benchmarks', () => {
  bench('sequential file reads (5 files)', async () => {
    for (let i = 0; i < 5; i++) {
      await readFile(TEST_FILE, 'utf-8');
    }
  });

  bench('parallel file reads (5 files)', async () => {
    await Promise.all([
      readFile(TEST_FILE, 'utf-8'),
      readFile(TEST_FILE, 'utf-8'),
      readFile(TEST_FILE, 'utf-8'),
      readFile(TEST_FILE, 'utf-8'),
      readFile(TEST_FILE, 'utf-8'),
    ]);
  });
});

describe('Event Emitter Benchmarks', () => {
  const { EventEmitter } = require('events');

  bench('emit with no listeners', () => {
    const emitter = new EventEmitter();
    emitter.emit('test', { data: 'value' });
  });

  bench('emit with 1 listener', () => {
    const emitter = new EventEmitter();
    emitter.on('test', () => {});
    emitter.emit('test', { data: 'value' });
  });

  bench('emit with 10 listeners', () => {
    const emitter = new EventEmitter();
    for (let i = 0; i < 10; i++) {
      emitter.on('test', () => {});
    }
    emitter.emit('test', { data: 'value' });
  });
});

describe('RegExp Benchmarks', () => {
  const RUN_ID_PATTERN = /^run-\d{14}$/;
  const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!#*?~^\n\r]/g;

  bench('validate run ID (valid)', () => {
    RUN_ID_PATTERN.test('run-20260126120000');
  });

  bench('validate run ID (invalid)', () => {
    RUN_ID_PATTERN.test('invalid-run-id');
  });

  bench('escape shell metacharacters (clean)', () => {
    'clean-string-no-special'.replace(SHELL_METACHARACTERS, '\\$&');
  });

  bench('escape shell metacharacters (dirty)', () => {
    'test;command|pipe&background'.replace(SHELL_METACHARACTERS, '\\$&');
  });
});
