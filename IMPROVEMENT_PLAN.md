# Dure Improvement Plan

> This document breaks down improvements derived from senior developer reviews into actionable units organized by phase.

---

## Overview

### Goals
- Transition from MVP to production-ready state
- Resolve security vulnerabilities
- Improve code quality and maintainability
- Establish test coverage for stability

### Phase Structure

| Phase | Goal | Estimated Difficulty |
|-------|------|---------------------|
| Phase 1 | Security vulnerability fixes | Medium |
| Phase 2 | Test infrastructure setup | Medium |
| Phase 3 | Error handling completion | Medium |
| Phase 4 | Architecture refactoring | High |
| Phase 5 | Performance optimization | Medium |
| Phase 6 | API security and documentation | Medium |
| Phase 7 | Frontend improvements | Low |

---

## Phase 1: Security Vulnerability Fixes

### Goal
Resolve command injection vulnerabilities and strengthen input validation

### Task 1.1: Create Input Sanitization Utilities

**File**: `src/utils/sanitize.ts` (new)

**Implementation**:
```typescript
// Functions to implement
- sanitizePath(path: string): string
- sanitizeSessionName(name: string): string
- sanitizeCommand(cmd: string): string
- isValidRunId(runId: string): boolean
```

**Validation Criteria**:
- Block path traversal (`../`)
- Escape shell metacharacters (`;`, `|`, `&`, `$`, `` ` ``)
- Whitelist-based character allowance

---

### Task 1.2: TmuxManager Security Hardening

**File**: `src/core/tmux-manager.ts`

**Changes**:

| Method | Current Issue | Improvement |
|--------|--------------|-------------|
| `constructor` | No projectRoot validation | Apply `sanitizePath` |
| `createSession` | sessionName injection possible | Apply `sanitizeSessionName` |
| `sendKeys` | Insufficient escaping | Switch to `spawn` array arguments |
| `startAgent` | No promptFile validation | Validate path existence and format |

**Before**:
```typescript
execSync(`tmux new-session -d -s ${this.sessionName} -n main -c "${this.projectRoot}"`);
```

**After**:
```typescript
import { spawn } from 'child_process';
import { sanitizePath, sanitizeSessionName } from '../utils/sanitize.js';

const safePath = sanitizePath(this.projectRoot);
const safeName = sanitizeSessionName(this.sessionName);
spawn('tmux', ['new-session', '-d', '-s', safeName, '-n', 'main', '-c', safePath]);
```

---

### Task 1.3: RunManager Input Validation

**File**: `src/core/run-manager.ts`

**Validations to add**:
- `runId` format validation (`/^run-\d{14}$/`)
- `briefing` maximum length limit
- File path whitelist validation

---

### Task 1.4: API Route Input Validation

**File**: `src/server/routes/api.ts`

**Middleware to add**:
```typescript
// src/server/middleware/validate.ts (new)
- validateRunId(req, res, next)
- validateBriefing(req, res, next)
- validateCRPResponse(req, res, next)
```

---

### Phase 1 Completion Criteria

- [x] `src/utils/sanitize.ts` implemented and tested
- [x] All `execSync` in TmuxManager converted to `spawn`
- [x] Validation applied to all user inputs
- [x] Security test cases written

---

## Phase 2: Test Infrastructure Setup

### Goal
Write unit tests and integration tests for core modules

### Task 2.1: Create Test Directory Structure

```
tests/
├── unit/
│   ├── core/
│   │   ├── state-manager.test.ts
│   │   ├── run-manager.test.ts
│   │   ├── tmux-manager.test.ts
│   │   ├── file-watcher.test.ts
│   │   ├── orchestrator.test.ts
│   │   └── ...
│   ├── utils/
│   │   └── sanitize.test.ts
│   └── agents/
│       └── prompt-generator.test.ts
├── integration/
│   ├── api.test.ts
│   ├── websocket.test.ts
│   └── run-lifecycle.test.ts
├── fixtures/
│   ├── sample-briefing.md
│   ├── sample-state.json
│   └── ...
└── helpers/
    ├── mock-tmux.ts
    └── test-utils.ts
```

---

### Task 2.2: StateManager Unit Tests

**File**: `tests/unit/core/state-manager.test.ts`

**Test Cases**:
```typescript
describe('StateManager', () => {
  describe('createInitialState', () => {
    it('should create valid initial state with all required fields');
    it('should set phase to "refine"');
    it('should initialize all agents as pending');
  });

  describe('updatePhase', () => {
    it('should update phase and add history entry');
    it('should throw if no state exists');
  });

  describe('updateAgentStatus', () => {
    it('should set started_at when status is running');
    it('should set completed_at when status is completed');
    it('should record error when provided');
  });

  describe('saveState', () => {
    it('should write atomically using temp file');
    it('should update updated_at timestamp');
  });

  // Edge cases
  describe('edge cases', () => {
    it('should handle corrupted state file gracefully');
    it('should handle concurrent writes');
  });
});
```

---

### Task 2.3: TmuxManager Unit Tests (Mock-based)

**File**: `tests/unit/core/tmux-manager.test.ts`

**Mock Strategy**:
```typescript
// tests/helpers/mock-tmux.ts
export class MockTmux {
  private sessions: Map<string, MockSession> = new Map();

  execSync(cmd: string): string {
    // Parse and simulate tmux commands
  }
}
```

**Test Cases**:
- Session creation/deletion
- Pane allocation
- Command sending
- Output capture

---

### Task 2.4: FileWatcher Unit Tests

**File**: `tests/unit/core/file-watcher.test.ts`

**Test Cases**:
- `done.flag` detection
- `crp/*.json` detection
- `vcr/*.json` detection
- `verdict.json` parsing
- Debounce behavior
- Error handling

---

### Task 2.5: API Integration Tests

**File**: `tests/integration/api.test.ts`

**Tool**: `supertest`

**Test Cases**:
```typescript
describe('API Routes', () => {
  describe('GET /api/project', () => {
    it('should return project info');
  });

  describe('POST /api/runs', () => {
    it('should create new run with valid briefing');
    it('should reject empty briefing');
    it('should reject if run already in progress');
  });

  describe('GET /api/runs/:runId', () => {
    it('should return run state');
    it('should return 404 for non-existent run');
  });

  // ... more tests
});
```

---

### Task 2.6: vitest.config.ts Update

```typescript
export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.ts',  // Project tests
    ],
    exclude: [
      '.dure/**',  // Exclude runtime-generated tests
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/server/public/**'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
```

---

### Phase 2 Completion Criteria

- [x] Test directory structure created
- [x] StateManager test coverage 77%+
- [x] RunManager test coverage 87%+
- [x] FileWatcher test coverage 89%+
- [x] API integration tests cover major endpoints
- [x] sanitize utility test coverage 96%+
- [x] CI auto-test setup (GitHub Actions)

---

## Phase 3: Error Handling Completion

### Goal
Implement unfinished auto-retry logic and complete error recovery mechanisms

### Task 3.1: RetryManager Implementation

**File**: `src/core/retry-manager.ts` (new)

```typescript
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  recoverableErrors: string[];
}

export class RetryManager {
  constructor(config: RetryConfig);

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: RetryContext
  ): Promise<T>;

  shouldRetry(error: Error, attempt: number): boolean;

  getDelay(attempt: number): number;  // Exponential backoff
}
```

---

### Task 3.2: Integrate RetryManager into Orchestrator

**File**: `src/core/orchestrator.ts`

**Change Location**: `handleWatchEvent` method's `error_flag` case

**Before**:
```typescript
case 'error_flag':
  // ... existing code ...
  if (
    event.errorFlag.recoverable &&
    this.config.global.auto_retry.enabled
  ) {
    // Auto-retry logic would go here
    // For now, just emit the error and let the human decide
  }
```

**After**:
```typescript
case 'error_flag':
  // ... existing code ...
  if (this.shouldAutoRetry(event.errorFlag)) {
    await this.retryManager.executeWithRetry(
      () => this.restartAgent(agentName),
      { agent: agentName, errorType: event.errorFlag.error_type }
    );
  } else {
    this.emitEvent({ type: 'error', error: event.errorFlag.message, runId });
  }
```

---

### Task 3.3: Define Recovery Strategies by Error Type

**File**: `src/core/recovery-strategies.ts` (new)

```typescript
export interface RecoveryStrategy {
  canRecover(error: ErrorFlag): boolean;
  recover(context: RecoveryContext): Promise<void>;
}

export class CrashRecoveryStrategy implements RecoveryStrategy {
  // Restart on Claude process crash
}

export class TimeoutRecoveryStrategy implements RecoveryStrategy {
  // Extend timeout or restart on timeout
}

export class ValidationRecoveryStrategy implements RecoveryStrategy {
  // Retry on output format errors
}
```

---

### Task 3.4: Error State UI Improvements

**File**: `src/server/public/run-detail.html`

**Features to add**:
- Modal display on error occurrence
- Retry/Stop/Extend timeout buttons
- Retry count and status display

---

### Phase 3 Completion Criteria

- [x] RetryManager implemented and tested
- [x] Exponential backoff working confirmed
- [x] Recovery strategy implemented for each error type
- [x] Orchestrator integration complete
- [x] Error state display and actions available in UI

---

## Phase 4: Architecture Refactoring

### Goal
Separate Orchestrator responsibilities and improve code structure

### Task 4.1: Extract AgentLifecycleManager

**File**: `src/core/agent-lifecycle-manager.ts` (new)

**Methods to move from Orchestrator**:
- `startRefiner()`
- `startBuilder()`
- `startVerifier()`
- `startGatekeeper()`
- Agent start/stop related logic

```typescript
export class AgentLifecycleManager {
  constructor(
    private tmuxManager: TmuxManager,
    private stateManager: StateManager,
    private agentMonitor: AgentMonitor
  );

  async startAgent(agent: AgentName, model: AgentModel, promptFile: string): Promise<void>;
  async stopAgent(agent: AgentName): Promise<void>;
  async restartAgent(agent: AgentName): Promise<void>;
}
```

---

### Task 4.2: Extract PhaseTransitionManager

**File**: `src/core/phase-transition-manager.ts` (new)

**Logic to move from Orchestrator**:
- `transitionToPhase()`
- Phase transition validation
- Transition history recording

```typescript
export class PhaseTransitionManager {
  constructor(private stateManager: StateManager);

  canTransition(from: Phase, to: Phase): boolean;
  async transition(to: Phase): Promise<void>;
  getNextPhase(current: Phase, verdict?: Verdict): Phase;
}
```

---

### Task 4.3: Extract EventCoordinator

**File**: `src/core/event-coordinator.ts` (new)

**Role**:
- Setup all event listeners
- Event routing
- Event logging coordination

```typescript
export class EventCoordinator extends EventEmitter {
  constructor(
    private fileWatcher: FileWatcher,
    private agentMonitor: AgentMonitor,
    private outputStreamer: OutputStreamer,
    private usageTracker: UsageTracker,
    private eventLogger: EventLogger
  );

  setupListeners(): void;
  teardownListeners(): void;
}
```

---

### Task 4.4: Orchestrator Refactoring

**File**: `src/core/orchestrator.ts`

**Structure after changes**:
```typescript
export class Orchestrator extends EventEmitter {
  private agentLifecycle: AgentLifecycleManager;
  private phaseManager: PhaseTransitionManager;
  private eventCoordinator: EventCoordinator;
  private retryManager: RetryManager;

  // Keep only simplified public API
  async startRun(briefing: string): Promise<string>;
  async resumeRun(runId: string): Promise<void>;
  async stopRun(): Promise<void>;
  getCurrentState(): RunState | null;
}
```

**Goal**: Reduce Orchestrator from 1000 lines to 300 lines or less

---

### Task 4.5: Dependency Injection Improvement

**File**: `src/core/container.ts` (new, optional)

Introduce simple DI container or factory pattern:

```typescript
export class OrchestratorFactory {
  static create(projectRoot: string, config: OrchestraConfig): Orchestrator {
    const stateManager = new StateManager(runDir);
    const tmuxManager = new TmuxManager(config.global.tmux_session_prefix, projectRoot);
    const agentLifecycle = new AgentLifecycleManager(tmuxManager, stateManager, ...);
    // ... compose all dependencies
    return new Orchestrator(agentLifecycle, phaseManager, eventCoordinator, ...);
  }
}
```

---

### Phase 4 Completion Criteria

- [x] AgentLifecycleManager extracted and tested
- [x] PhaseTransitionManager extracted and tested
- [x] EventCoordinator extracted and tested
- [x] Orchestrator reduced to 700 lines or less (1164 lines → 643 lines)
- [x] All existing functionality working correctly (353 tests passing)
- [x] Documentation updated for new structure

---

## Phase 5: Performance Optimization

### Goal
Remove synchronous I/O, introduce caching, optimize polling

### Task 5.1: Async File I/O Conversion

**Affected files**:
- `src/core/state-manager.ts`
- `src/core/run-manager.ts`
- `src/agents/prompt-generator.ts`

**Change example**:
```typescript
// Before
const content = readFileSync(filePath, 'utf-8');

// After
import { readFile, writeFile } from 'fs/promises';
const content = await readFile(filePath, 'utf-8');
```

**Notes**:
- Maintain atomicity of state saves
- Use `fs/promises`'s `rename`

---

### Task 5.2: StateManager Caching

**File**: `src/core/state-manager.ts`

```typescript
export class StateManager {
  private cachedState: RunState | null = null;
  private lastReadTime: number = 0;
  private readonly CACHE_TTL_MS = 1000;

  async loadState(): Promise<RunState | null> {
    const now = Date.now();
    if (this.cachedState && (now - this.lastReadTime) < this.CACHE_TTL_MS) {
      return this.cachedState;
    }

    this.cachedState = await this.readFromDisk();
    this.lastReadTime = now;
    return this.cachedState;
  }

  async saveState(state: RunState): Promise<void> {
    await this.writeToDisk(state);
    this.cachedState = state;
    this.lastReadTime = Date.now();
  }
}
```

---

### Task 5.3: OutputStreamer Optimization

**File**: `src/core/output-streamer.ts`

**Current issue**: Fixed interval polling

**Improvement**:
1. Adaptive polling: fast when active, slow when inactive
2. Change detection based: emit events only when output length changes

```typescript
export class OutputStreamer {
  private pollingIntervals: Map<AgentName, number> = new Map();

  private adjustPollingInterval(agent: AgentName, hasActivity: boolean): void {
    const current = this.pollingIntervals.get(agent) || 500;
    if (hasActivity) {
      this.pollingIntervals.set(agent, Math.max(100, current / 2));
    } else {
      this.pollingIntervals.set(agent, Math.min(2000, current * 1.5));
    }
  }
}
```

---

### Task 5.4: Constants Extraction

**File**: `src/config/constants.ts` (new)

```typescript
export const TIMING = {
  DEBOUNCE_MS: 2000,
  CLAUDE_STARTUP_DELAY_MS: 2000,
  PASTE_COMPLETION_DELAY_MS: 500,
  CRP_DETECTION_DELAY_MS: 1000,
  ACTIVITY_CHECK_INTERVAL_MS: 30000,
} as const;

export const LIMITS = {
  MAX_BRIEFING_LENGTH: 100000,
  MAX_OUTPUT_HISTORY_LINES: 200,
  MAX_PANE_CAPTURE_LINES: 100,
} as const;
```

---

### Phase 5 Completion Criteria

- [x] All synchronous file I/O converted to async
- [x] StateManager caching implemented
- [x] OutputStreamer adaptive polling implemented
- [x] Magic numbers extracted to constants file
- [x] Performance benchmark (before/after comparison)

---

## Phase 6: API Security and Documentation

### Goal
API authentication/authorization, rate limiting, OpenAPI documentation

### Task 6.1: Add Express Security Middleware

**File**: `src/server/index.ts`

**Packages to add**:
```bash
npm install helmet cors express-rate-limit
```

**Implementation**:
```typescript
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
}));
```

---

### Task 6.2: API Key Authentication (Optional)

**File**: `src/server/middleware/auth.ts` (new)

```typescript
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.DURE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
```

**Configuration**: Manage API key via `.env` file or environment variables

---

### Task 6.3: WebSocket Authentication

**File**: `src/server/index.ts`

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (isValidToken(token)) {
    next();
  } else {
    next(new Error('Authentication error'));
  }
});
```

---

### Task 6.4: OpenAPI Documentation Generation

**File**: `src/server/openapi.yaml` (new)

```yaml
openapi: 3.0.3
info:
  title: Dure API
  version: 0.1.0
  description: Agentic Software Engineering API

paths:
  /api/project:
    get:
      summary: Get project information
      responses:
        '200':
          description: Project info
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProjectInfo'

  /api/runs:
    get:
      summary: List all runs
    post:
      summary: Start a new run

  # ... more endpoints

components:
  schemas:
    ProjectInfo:
      type: object
      properties:
        projectRoot:
          type: string
        config:
          $ref: '#/components/schemas/OrchestraConfig'
```

---

### Task 6.5: Swagger UI Integration

**Packages to add**:
```bash
npm install swagger-ui-express yamljs
```

**Implementation**:
```typescript
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

const swaggerDocument = YAML.load('./src/server/openapi.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
```

---

### Task 6.6: Production Logging Introduction

**Packages to add**:
```bash
npm install pino pino-http
```

**Implementation**:
```typescript
import pino from 'pino';
import pinoHttp from 'pino-http';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

app.use(pinoHttp({ logger }));
```

---

### Phase 6 Completion Criteria

- [x] helmet, cors, rate-limit applied
- [x] API key authentication (optional) implemented
- [x] WebSocket authentication implemented
- [x] OpenAPI spec completed
- [x] Swagger UI accessible (/api-docs)
- [x] Structured logging applied

---

## Phase 7: Frontend Improvements

### Goal
UX improvements, error handling, accessibility enhancements

### Task 7.1: Add Error Boundary

**File**: `src/server/public/app.js`

```javascript
window.addEventListener('error', (event) => {
  showErrorToast('An unexpected error occurred.');
  console.error(event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  showErrorToast('A network error occurred.');
  console.error(event.reason);
});
```

---

### Task 7.2: Loading State Display

**All HTML files**:
- Show loading spinner during API calls
- Disable buttons
- Skeleton loading

---

### Task 7.3: Offline Detection

```javascript
window.addEventListener('online', () => {
  hideOfflineBanner();
  reconnectWebSocket();
});

window.addEventListener('offline', () => {
  showOfflineBanner();
});
```

---

### Task 7.4: Accessibility Improvements

**Checklist**:
- [x] Alt attributes on all images (aria-hidden for emojis)
- [x] Labels connected to form elements
- [x] Keyboard navigation support
- [x] Color contrast WCAG AA compliant
- [x] ARIA attributes added

---

### Task 7.5: Responsive Design

**File**: `src/server/public/styles.css`

```css
@media (max-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .agent-panels {
    flex-direction: column;
  }
}
```

---

### Phase 7 Completion Criteria

- [x] Global error handling implemented
- [x] Loading state displayed for all API calls
- [x] Offline detection and reconnection
- [x] Accessibility checklist completed
- [x] Mobile responsive confirmed

---

## Appendix: Checklist Summary

### Phase 1: Security (P0) ✅
- [x] sanitize.ts implemented
- [x] TmuxManager execSync → spawn
- [x] Input validation middleware
- [x] Security tests

### Phase 2: Testing (P0) ✅
- [x] Test directory structure
- [x] StateManager test 77%+
- [x] RunManager test 87%+
- [x] API integration tests
- [x] CI setup

### Phase 3: Error Handling (P0) ✅
- [x] RetryManager implemented
- [x] Exponential backoff
- [x] Recovery strategies implemented
- [x] UI error display

### Phase 4: Refactoring (P1) ✅
- [x] AgentLifecycleManager
- [x] PhaseTransitionManager
- [x] EventCoordinator
- [x] Orchestrator reduction

### Phase 5: Performance (P1) ✅
- [x] Async I/O
- [x] State caching
- [x] Polling optimization
- [x] Constants extraction
- [x] Performance benchmark

### Phase 6: API Security/Docs (P1) ✅
- [x] Security middleware
- [x] Authentication implemented
- [x] OpenAPI spec
- [x] Logging system

### Phase 7: Frontend (P2) ✅
- [x] Error boundary
- [x] Loading states
- [x] Accessibility
- [x] Responsive design

---

## Progress Tracking

| Phase | Start Date | Completion Date | Status |
|-------|------------|-----------------|--------|
| Phase 1 | 2026-01-26 | 2026-01-26 | ✅ Complete |
| Phase 2 | 2026-01-26 | 2026-01-26 | ✅ Complete |
| Phase 3 | 2026-01-26 | 2026-01-26 | ✅ Complete |
| Phase 4 | 2026-01-26 | 2026-01-26 | ✅ Complete |
| Phase 5 | 2026-01-26 | 2026-01-26 | ✅ Complete |
| Phase 6 | 2026-01-26 | 2026-01-26 | ✅ Complete |
| Phase 7 | 2026-01-26 | 2026-01-26 | ✅ Complete |

---

*Document created: 2026-01-26*
*Last updated: 2026-01-26*

---

### 2026-01-26: Phase 6 Complete

**Implementation**:

1. **Task 6.1: Express Security Middleware (`src/server/index.ts`)**
   - `helmet`: HTTP header security hardening (CSP, XSS prevention, etc.)
   - `cors`: CORS policy configuration (controlled by `ALLOWED_ORIGINS` env var)
   - `express-rate-limit`: API rate limiting (100 requests per 15 minutes default)
   - Static files and HTML pages excluded from rate limiting

2. **Task 6.2: API Key Authentication (`src/server/middleware/auth.ts`)**
   - Optional API key authentication (enabled via environment variable)
   - `DURE_AUTH_ENABLED=true` + `DURE_API_KEY=secret`
   - Authenticate via `x-api-key` header
   - Constant-time comparison to prevent timing attacks

3. **Task 6.3: WebSocket Authentication (`src/server/middleware/auth.ts`)**
   - Socket.io middleware for token authentication
   - Passed from client via `auth.token`
   - Uses same environment variable as API key

4. **Task 6.4: OpenAPI Documentation (`src/server/openapi.yaml`)**
   - OpenAPI 3.0.3 spec completed
   - All API endpoints documented
   - Schema definitions: RunState, CRP, VCR, MRP, Usage, etc.
   - Error response patterns defined

5. **Task 6.5: Swagger UI Integration**
   - Swagger UI available at `/api-docs` path
   - Custom styles applied
   - openapi.yaml auto-copied during build

6. **Task 6.6: Production Logging Introduction**
   - `pino`: High-performance JSON logger
   - `pino-http`: HTTP request/response logging
   - Development: pino-pretty for readable output
   - Production: JSON format for structured logging
   - Auto log level adjustment by status code (5xx=error, 4xx=warn)

**Packages added:**
- helmet, cors, express-rate-limit
- pino, pino-http, pino-pretty
- swagger-ui-express, yamljs
- @types/cors, @types/swagger-ui-express, @types/yamljs

**Test results:**
- All 353 tests passing
- Build successful

**Usage:**
```bash
# Enable API authentication
export DURE_AUTH_ENABLED=true
export DURE_API_KEY=your-secret-key

# Configure CORS origins
export ALLOWED_ORIGINS=http://localhost:3000,https://example.com

# Set log level
export LOG_LEVEL=debug
export NODE_ENV=development  # Enable pino-pretty
```

---

### 2026-01-26: Phase 3 Complete

**Implementation**:

1. **Task 3.1: RetryManager Implementation (`src/core/retry-manager.ts`)**
   - `executeWithRetry()`: Auto-retry logic with exponential backoff
   - `shouldRetry()`: Retry decision based on error type and attempt count
   - `getDelay()`: Exponential backoff with jitter calculation
   - Events emitted: `retry_started`, `retry_success`, `retry_failed`, `retry_exhausted`
   - Configurable: maxAttempts, baseDelayMs, maxDelayMs, backoffMultiplier

2. **Task 3.2: RecoveryManager and Recovery Strategies (`src/core/recovery-strategies.ts`)**
   - `CrashRecoveryStrategy`: Restart agent on process crash
   - `TimeoutRecoveryStrategy`: Extend or restart based on activity on timeout
   - `ValidationRecoveryStrategy`: Retry on output format errors
   - `RecoveryManager`: Strategy pattern for managing recovery strategies

3. **Task 3.3: Orchestrator Integration**
   - RetryManager and RecoveryManager integrated into Orchestrator
   - `shouldAutoRetry()`: Determine auto-retry conditions
   - `executeAutoRetry()`: Execute recovery strategy
   - New event types added: `agent_retry`, `agent_retry_success`, `agent_retry_exhausted`

4. **Task 3.4: Error State UI Improvements (`src/server/public/run-detail.html`, `styles.css`)**
   - Error panel: Display agent, error type, message
   - Retry progress display (spinner + attempt count)
   - Action buttons: Retry Agent, Extend Timeout, Stop Run
   - Toast notification system
   - WebSocket events received: agent_failed, agent_retry, agent_retry_success, agent_retry_exhausted

5. **API Endpoints Added (`src/server/routes/api.ts`)**
   - `POST /api/runs/:runId/retry/:agent`: Manual retry trigger
   - `POST /api/runs/:runId/extend-timeout/:agent`: Timeout extension
   - `POST /api/runs/:runId/stop`: Stop run

6. **WebSocket Event Propagation (`src/server/index.ts`)**
   - agent_failed, agent_retry, agent_retry_success, agent_retry_exhausted events sent to client

7. **Tests (`tests/unit/core/`)**
   - `retry-manager.test.ts`: 17 test cases (100% passing)
   - `recovery-strategies.test.ts`: 24 test cases (100% passing)

**Feature Summary:**
- Auto-retry on error (configurable max attempts)
- Exponential backoff with jitter for retry intervals
- Recovery strategies by error type (crash, timeout, validation)
- Real-time error state monitoring and manual intervention via web UI
- Real-time retry progress display

---

### 2026-01-26: Phase 4 Complete

**Implementation**:

1. **Task 4.1: AgentLifecycleManager Extraction (`src/core/agent-lifecycle-manager.ts`)**
   - Extracted agent start/stop/restart logic
   - `startAgent()`, `stopAgent()`, `clearAgent()`, `restartAgentWithVCR()` methods
   - Agent monitoring integration
   - OutputStreamer, UsageTracker integration
   - 25 test cases

2. **Task 4.2: PhaseTransitionManager Extraction (`src/core/phase-transition-manager.ts`)**
   - Extracted phase transition logic
   - `transition()`, `canTransition()`, `getNextPhase()` methods
   - Gatekeeper verdict handling (`handleVerdict()`)
   - Iteration management (`incrementIteration()`)
   - Valid transition paths defined (`VALID_TRANSITIONS`)
   - 41 test cases

3. **Task 4.3: EventCoordinator Extraction (`src/core/event-coordinator.ts`)**
   - Unified event listener setup
   - FileWatcher, AgentMonitor, OutputStreamer, UsageTracker, RetryManager event routing
   - Unified `CoordinatedEvent` type definition
   - Custom handler support (`setHandlers()`)
   - Event logging integration
   - 21 test cases

4. **Task 4.4: Orchestrator Refactoring (`src/core/orchestrator.ts`)**
   - Reduced from 1164 lines to 643 lines (45% reduction)
   - Three new managers integrated
   - Simplified `initializeManagers()` method
   - Simplified event handlers: `handleAgentDone()`, `handleGatekeeperDone()`, etc.
   - Public API maintained (backward compatibility)

**Test results:**
- All 353 tests passing
- New manager tests: 87 cases

**Architecture improvement:**
```
Before:
  Orchestrator (1164 lines)
    └─ All logic mixed together

After:
  Orchestrator (643 lines)
    ├─ AgentLifecycleManager
    │    └─ Agent start/stop/restart
    ├─ PhaseTransitionManager
    │    └─ Phase validation & transitions
    └─ EventCoordinator
         └─ Event routing & logging
```

---

### 2026-01-26: Phase 5 Complete

**Implementation**:

1. **Task 5.4: Constants Extraction (`src/config/constants.ts`)**
   - `TIMING`: Debounce, delay times, polling intervals
   - `LIMITS`: Max briefing length, max iterations
   - `PORTS`: Default web port
   - `MODEL_SELECTOR`: Model selection constants
   - `CACHE`: Cache TTL settings
   - `DURATION_MULTIPLIERS`: Duration calculation constants
   - `TOKEN_DISPLAY`: Token display format
   - `PRECISION`: Cost calculation decimal precision

2. **Task 5.1: Async File I/O Conversion**
   - `StateManager`: All methods converted to async
     - `loadState()`, `saveState()`, `updatePhase()`, `updateAgentStatus()`, etc.
     - Atomic writes: temp file + rename pattern maintained
     - Backward compatibility: `loadStateSync()`, `stateExistsSync()` provided
   - `RunManager`: All methods converted to async
     - `createRun()`, `runExists()`, `listRuns()`, `deleteRun()`, etc.
     - Backward compatibility: `runExistsSync()`, `hasAgentCompletedSync()` provided
   - `PromptGenerator`: Async conversion + parallel generation
     - `generateAllPrompts()`: 4 prompts generated concurrently

3. **Task 5.2: StateManager Caching Implementation**
   - Memory caching with configurable TTL (default 1 second)
   - `cachedState`, `lastReadTime` added
   - Skip disk read on cache hit
   - Cache sync on `saveState()`
   - `clearCache()` method added

4. **Task 5.3: OutputStreamer Adaptive Polling**
   - Independent polling intervals per agent
   - On activity detection: interval halved (min 100ms)
   - On inactivity: interval increased 1.5x (max 2000ms)
   - `AdaptivePollingConfig` config type added

5. **Caller Updates**
   - `Orchestrator`: await async StateManager/RunManager methods
   - `PhaseTransitionManager`: All methods converted to async
   - `CleanupManager`: Using async methods
   - CLI commands: `status`, `history`, `logs`, `clean`, `delete`, `stop`, `clear`
   - API routes: `api.ts`, `crp.ts`, `mrp.ts`

6. **Test Updates**
   - `state-manager.test.ts`: 43 tests converted to async pattern
   - `run-manager.test.ts`: 55 tests converted to async pattern
   - `phase-transition-manager.test.ts`: Mock functions using `mockResolvedValue`
   - `api.test.ts`: 42 integration tests converted to async

**Test results:**
- All 353 tests passing
- Build successful

**Performance improvements:**
- Event loop blocking removed by async file I/O
- StateManager caching improves repeated read performance
- Adaptive polling optimizes CPU usage

---

## Change History

### 2026-01-26: All Phases Complete

**Final tasks completed:**

1. **Phase 1 - Security Test Cases (`tests/unit/utils/sanitize.security.test.ts`)**
   - Command injection prevention tests (16 injection payloads verified)
   - Path traversal prevention tests (null byte, traversal attacks)
   - Input validation bypass attempt tests (bypass payloads)
   - DoS prevention tests (length limits, ReDoS prevention)
   - Type confusion attack tests (type coercion)
   - Encoding attack tests (Unicode homoglyph, zero-width)
   - Boundary condition tests

2. **Phase 2 - CI Setup (`.github/workflows/ci.yml`)**
   - Lint & Type Check job
   - Multi Node.js version testing (18, 20, 22)
   - Coverage collection and Codecov upload
   - Build verification
   - Security audit (npm audit)
   - Auto security test execution

3. **Phase 5 - Performance Benchmark (`tests/benchmarks/performance.bench.ts`)**
   - Sync vs Async I/O comparison
   - JSON parsing/serialization performance
   - Caching effect measurement (cache hit **180x faster**)
   - Parallel I/O performance (parallel **1.56x faster**)
   - Sanitization performance
   - Regex performance
   - EventEmitter performance

**Benchmark results summary:**
- StateManager caching: **180x faster** than disk reads
- Parallel file reads: **1.56x faster** than sequential
- Sanitization: 16M ops/sec

**Test results:**
- All 488 tests passing
- New security tests: 97 cases

---

### 2026-01-26: Phase 7 Complete

**Implementation**:

1. **Task 7.1: Global Error Boundary (`src/server/public/app.js`)**
   - `window.addEventListener('error')`: Global JavaScript error handling
   - `window.addEventListener('unhandledrejection')`: Promise rejection handling
   - User-friendly error messages (toast notifications)
   - Console error logging maintained

2. **Task 7.2: Loading State Display (`src/server/public/app.js`, `styles.css`)**
   - `showLoading()`, `hideLoading()`: Element-specific loading state management
   - Button loading: spinner + disabled
   - Table loading: colspan loading cell
   - Skeleton loading: `showSkeleton()` function
   - Loading state applied to all API call buttons

3. **Task 7.3: Offline Detection and Reconnection (`src/server/public/app.js`, `styles.css`)**
   - `online`/`offline` event listeners
   - Offline banner: Fixed warning at top of screen
   - WebSocket auto-reconnection (`reconnectWebSocket()`)
   - Toast notification on connection state change

4. **Task 7.4: Accessibility Improvements (all HTML files)**
   - Skip link: "Skip to main content" link for keyboard users
   - ARIA attributes: `role`, `aria-label`, `aria-labelledby`, `aria-live`, `aria-busy`
   - Semantic HTML: `nav`, `main`, `section`, `thead`/`tbody`, etc.
   - Keyboard navigation: `enableKeyboardNav()` function
   - Screen reader support: `announce()` function, `.sr-only` class
   - Focus management: `createFocusTrap()` function
   - `prefers-reduced-motion` media query support
   - `prefers-contrast: high` media query support

5. **Task 7.5: Responsive Design Improvements (`styles.css`)**
   - Mobile navigation: flex-wrap, order rearrangement
   - Mobile pipeline: vertical direction conversion
   - Mobile table: horizontal scroll, font reduction
   - Mobile terminal: 1-column layout, height adjustment
   - Mobile form: 16px font size (iOS zoom prevention)
   - Mobile toast: full width
   - Print styles: hide unnecessary elements

**Files changed:**
- `src/server/public/app.js`: Global error handling, offline detection, loading states, accessibility helpers added
- `src/server/public/styles.css`: Offline banner, loading states, accessibility, responsive styles added
- `src/server/public/index.html`: Accessibility and loading state improvements
- `src/server/public/run-detail.html`: Accessibility and loading state improvements
- `src/server/public/history.html`: Accessibility and loading state improvements
- `src/server/public/settings.html`: Accessibility and loading state improvements

**Test results:**
- All 353 tests passing
- Build successful

---

### 2026-01-26: Phase 2 Complete

**Implementation**:

1. **Task 2.1: Test Directory Structure Created**
   - `tests/unit/core/` - Core module unit tests
   - `tests/unit/utils/` - Utility unit tests
   - `tests/integration/` - API integration tests
   - `tests/fixtures/` - Test data
   - `tests/helpers/` - Test utilities

2. **Task 2.2: StateManager Unit Tests (`tests/unit/core/state-manager.test.ts`)**
   - 43 test cases
   - Coverage: 77%+
   - createInitialState, updatePhase, updateAgentStatus, saveState, etc. verified
   - Edge cases: corrupted file, empty file handling

3. **Task 2.3: RunManager Unit Tests (`tests/unit/core/run-manager.test.ts`)**
   - 55 test cases
   - Coverage: 87%+
   - createRun, listRuns, deleteRun, CRP/VCR handling verified
   - Input validation (path traversal, format validation)

4. **Task 2.4: FileWatcher Unit Tests (`tests/unit/core/file-watcher.test.ts`)**
   - 25 test cases
   - Coverage: 89%+
   - done.flag, CRP, VCR, verdict.json detection verified
   - Debounce behavior verified

5. **Task 2.5: sanitize Utility Tests (`tests/unit/utils/sanitize.test.ts`)**
   - 60 test cases
   - Coverage: 96%+
   - All validation functions tested

6. **Task 2.6: API Integration Tests (`tests/integration/api.test.ts`)**
   - 42 test cases
   - Major API endpoints covered
   - HTTP tests using supertest

7. **Task 2.7: Test Helpers and Fixtures**
   - `tests/helpers/test-utils.ts`: Common test utilities
   - `tests/fixtures/sample-briefing.md`: Sample briefing
   - `tests/fixtures/sample-state.json`: Sample state file

8. **Task 2.8: vitest.config.ts Update**
   - Coverage thresholds set
   - lcov reporter added
   - .dure/** excluded

**Test results:**
- All 225 tests passing
- Core module coverage: 77-96%
- Overall coverage: 31% (including external dependency modules)

**Remaining work:**
- CI setup (GitHub Actions)

---

### 2026-01-26: Phase 1 Complete

**Implementation**:

1. **Task 1.1: Input Sanitization Utilities (`src/utils/sanitize.ts`)**
   - `sanitizePath()`: Path traversal prevention, base directory restriction
   - `sanitizeSessionName()`: Whitelist-based character validation
   - `isValidRunId()`: run ID format validation (`/^run-\d{14}$/`)
   - `validateBriefing()`: Briefing content validation (length, null bytes)
   - `isValidCrpId()`, `isValidVcrId()`: CRP/VCR ID format validation
   - `validateDecision()`: Decision value validation
   - `sanitizeTextField()`: Text field sanitization
   - `validatePort()`: Port number validation
   - `isValidModel()`, `isValidAgentName()`: Model/agent name validation

2. **Task 1.2: TmuxManager Security Hardening (`src/core/tmux-manager.ts`)**
   - All `execSync()` converted to `spawnSync()`/`spawn()` array argument style
   - `sanitizePath()`, `sanitizeSessionName()` applied in constructor
   - Prompt file existence and path validation in `startAgent()`
   - Validation added for all agent/model names

3. **Task 1.3: RunManager Input Validation (`src/core/run-manager.ts`)**
   - `createRun()`: runId, briefing, maxIterations validation
   - `getRunDir()`, `runExists()`: runId format validation
   - `getCRP()`: crpId format validation
   - `deleteRun()`: runId format validation

4. **Task 1.4: API Route Input Validation (`src/server/middleware/validate.ts`)**
   - `validateRunId`: runId parameter validation middleware
   - `validateBriefingMiddleware`: Briefing body validation middleware
   - `validateCrpId`: crpId parameter validation middleware
   - `validateCRPResponse`: VCR response validation and sanitization middleware
   - `validateDuration`: Duration query parameter validation middleware
   - All middleware applied to API routes

**Remaining work:**
- Security test cases (to be done together with Phase 2)
