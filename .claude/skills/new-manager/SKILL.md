---
name: new-manager
description: Create a new core manager class following Result<T,E> pattern with tests. Use when user asks to create a manager, add a core service class, or implement a new system component.
---

# Create Core Manager Class

## Context
This project uses a manager pattern for core system components in `src/core/`. Managers handle specific concerns (state management, cleanup, retry logic, etc.) and follow the Result<T,E> pattern for explicit error handling.

All managers use the Result<T,E> pattern from `src/types/result.ts` for safe error handling, inspired by Rust. Methods that can fail return `Result<T, E>` or `AsyncResult<T, E>` instead of throwing exceptions.

## Instructions

1. **Create the manager file**: `src/core/<name>-manager.ts`
   - Use kebab-case for filename (e.g., `retry-manager.ts`)
   - Export a class named `<Name>Manager` in PascalCase

2. **Implement the manager class**:
   - Follow the Result<T,E> pattern for error handling
   - Import Result types: `import type { Result, AsyncResult } from '../types/index.js';`
   - Import helpers: `import { ok, err } from '../types/index.js';`
   - Use constructor for initialization
   - Provide public methods with clear contracts
   - Use private methods for internal logic
   - Add JSDoc comments for public methods

3. **Create the test file**: `tests/unit/core/<name>-manager.test.ts`
   - Use Vitest as the test framework
   - Import from `vitest`: `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';`
   - Structure: describe blocks for class, nested describe for methods
   - Test both success and error cases
   - Use `vi.useFakeTimers()` for time-dependent tests
   - Clean up in `afterEach` hooks

## Conventions (from existing code)

**File Structure:**
- Managers: `src/core/<name>-manager.ts`
- Tests: `tests/unit/core/<name>-manager.test.ts`
- All imports use `.js` extension (TypeScript ESM requirement)

**Result Pattern Usage (see `src/core/state-manager.ts`):**
```typescript
// For async operations
async loadStateSafe(): AsyncResult<RunState, StateError> {
  try {
    const content = await readFile(this.statePath, 'utf-8');
    return ok(JSON.parse(content) as RunState);
  } catch (error) {
    return err(createStateLoadError(
      this.statePath,
      error instanceof Error ? error : new Error(String(error))
    ));
  }
}

// For sync operations
parseConfig(data: string): Result<Config, ValidationError> {
  try {
    const config = JSON.parse(data);
    return ok(config);
  } catch (error) {
    return err(createValidationError('Invalid JSON'));
  }
}
```

**Error Handling:**
- Import error types from `src/types/index.js`
- Use factory functions like `createStateError()`, `createValidationError()`
- Never throw exceptions in public APIs - return `Result<T, E>` instead
- Preserve original error context when wrapping

**Class Structure (see `src/core/retry-manager.ts`):**
```typescript
export class RetryManager {
  // Private state
  private config: RetryConfig;
  private retryAttempts: Map<string, number> = new Map();

  // Constructor with optional config
  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  // Public methods with JSDoc
  /**
   * Execute an operation with automatic retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: RetryContext
  ): Promise<T> {
    // implementation
  }

  // Getters for state
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  // Private helpers
  private getRetryKey(context: RetryContext): string {
    return `${context.runId}:${context.agent}`;
  }
}
```

**Test Structure (see `tests/unit/core/retry-manager.test.ts`):**
```typescript
describe('RetryManager', () => {
  let manager: RetryManager;

  beforeEach(() => {
    manager = new RetryManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      // test
    });
  });

  describe('methodName', () => {
    it('should handle success case', () => {
      // test
    });

    it('should handle error case', () => {
      // test
    });
  });
});
```

**TypeScript:**
- Strict mode enabled (see `tsconfig.json`)
- Use explicit return types for public methods
- Use `readonly` for immutable properties
- Prefer `type` over `interface` for simple types
- Use `interface` for object shapes and class contracts

**Imports:**
- Always use `.js` extension for local imports (ESM requirement)
- Type imports: `import type { Foo } from './types.js';`
- Value imports: `import { bar } from './utils.js';`

## Template

```typescript
// src/core/<name>-manager.ts
import type { Result, AsyncResult } from '../types/index.js';
import { ok, err } from '../types/index.js';
import { ErrorType, createErrorTypeError } from '../types/index.js';

/**
 * Configuration for <Name>Manager
 */
export interface <Name>Config {
  // config properties
}

/**
 * Default configuration
 */
export const default<Name>Config: <Name>Config = {
  // defaults
};

/**
 * <Name>Manager - <Brief description of what this manager does>
 *
 * <Longer description of responsibilities and usage>
 */
export class <Name>Manager {
  private config: <Name>Config;
  // other private state

  constructor(config: Partial<<Name>Config> = {}) {
    this.config = { ...default<Name>Config, ...config };
  }

  /**
   * <Description of what this method does>
   *
   * @returns Result with data on success, error on failure
   */
  async someMethod(): AsyncResult<ReturnType, ErrorType> {
    try {
      // implementation
      return ok(result);
    } catch (error) {
      return err(createErrorTypeError(
        'context',
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): <Name>Config {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<<Name>Config>): void {
    this.config = { ...this.config, ...config };
  }
}
```

```typescript
// tests/unit/core/<name>-manager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { <Name>Manager, <Name>Config, default<Name>Config } from '../../../src/core/<name>-manager.js';

describe('<Name>Manager', () => {
  let manager: <Name>Manager;

  beforeEach(() => {
    manager = new <Name>Manager();
  });

  afterEach(() => {
    // cleanup
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const manager = new <Name>Manager();
      const config = manager.getConfig();
      expect(config).toEqual(default<Name>Config);
    });

    it('should merge provided config with defaults', () => {
      const manager = new <Name>Manager({ /* partial config */ });
      const config = manager.getConfig();
      // assertions
    });
  });

  describe('someMethod', () => {
    it('should return ok result on success', async () => {
      const result = await manager.someMethod();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
      }
    });

    it('should return err result on failure', async () => {
      // setup error condition
      const result = await manager.someMethod();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
```

## Key Differences from Generic TypeScript

1. **All imports use `.js` extension** - TypeScript ESM requirement
2. **Result<T,E> pattern** - No exceptions in public APIs
3. **Async mutex pattern** - Use `AsyncMutex` for thread-safe operations (see `state-manager.ts`)
4. **Config pattern** - Default config + partial override in constructor
5. **Test isolation** - Always clean up in `afterEach`

## Output

This skill should create:
- `src/core/<name>-manager.ts` - Manager implementation
- `tests/unit/core/<name>-manager.test.ts` - Test suite with full coverage

## Examples

**Usage in code:**
```typescript
// Success case
const result = await manager.someOperation();
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}

// With andThen chaining
const finalResult = andThen(
  await manager.loadData(),
  (data) => manager.processData(data)
);
```

**Error handling:**
```typescript
// Don't throw
throw new Error('Something went wrong'); // ❌

// Return Result instead
return err(createErrorTypeError('context', error)); // ✅
```
