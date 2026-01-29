---
name: new-agent
description: Create a new Dure agent with typed state, event handlers, and test setup. Use when the user asks to add a new agent type, create a custom agent, or extend the agent pipeline with a new processing stage.
---

# Create New Dure Agent

## Context
The Dure system uses a four-agent pipeline (Refiner → Builder → Verifier → Gatekeeper) for collaborative software engineering. Each agent is a specialized TypeScript class that processes inputs, emits events, and coordinates via the file system. This skill helps you create a new agent that integrates with the existing pipeline.

## Agent Architecture Overview

### Core Components
- **Types**: `src/types/index.ts` - Agent names, states, events
- **Events**: `src/types/events.ts` - Typed event system with branded types
- **Prompts**: `templates/prompts/{agent}.md` - Agent instructions with variable substitution
- **Config**: `templates/config/{agent}.json` - Agent-specific configuration
- **State**: File-based coordination via `.dure/runs/{run-id}/` structure

### Integration Points
1. **Type System** - Add agent to `AgentName` union type
2. **State Management** - Add agent state to `RunState.agents`
3. **Event System** - Define agent-specific events
4. **Prompt System** - Create prompt template with config variables
5. **Configuration** - Define agent config schema
6. **Testing** - Unit and integration tests

## Instructions

### Step 1: Define Agent Types

Add your agent to the type system in `src/types/index.ts`:

```typescript
// Line ~148: Update AgentName type
export type AgentName = 'refiner' | 'builder' | 'verifier' | 'gatekeeper' | 'your_agent';

// Line ~217-224: Add agent state to AgentState interface
export interface RunState {
  // ... existing fields
  agents: {
    refiner: AgentState;
    builder: AgentState;
    verifier: AgentState;
    gatekeeper: AgentState;
    your_agent: AgentState;  // Add this
  };
  // ... rest of state
}
```

### Step 2: Define Agent Events

Add agent-specific events to `src/types/events.ts`:

```typescript
// After existing event interfaces (~line 100+)
export interface YourAgentStartedEvent extends BaseOrchestratorEvent {
  type: 'your_agent_started';
  agent: 'your_agent';
}

export interface YourAgentCompletedEvent extends BaseOrchestratorEvent {
  type: 'your_agent_completed';
  agent: 'your_agent';
}

// Update the OrchestratorEventTyped union (~line 197)
export type OrchestratorEventTyped =
  | RunStartedEvent
  // ... existing events
  | YourAgentStartedEvent
  | YourAgentCompletedEvent
  | ErrorEvent;

// Add factory functions (~line 500+)
export function createYourAgentStartedEvent(runId: RunId): YourAgentStartedEvent {
  return {
    type: 'your_agent_started',
    runId,
    agent: 'your_agent',
    timestamp: new Date(),
  };
}
```

### Step 3: Create Agent Prompt Template

Create `templates/prompts/your_agent.md` based on existing patterns:

```markdown
# Your Agent Name

## Role
You are the YourAgent agent of the Dure system.
Your role is to [describe agent's purpose].

## Working Directory
- Project root: ${project_root}
- Run directory: .dure/runs/${run_id}/

## Input
- Previous output: .dure/runs/${run_id}/[previous-agent]/output/
- Other inputs: [list relevant inputs]

## Output
1. Main output: .dure/runs/${run_id}/your_agent/output/
2. Log file: .dure/runs/${run_id}/your_agent/log.md
3. Completion flag: .dure/runs/${run_id}/your_agent/done.flag

## Configuration
```json
${config_your_agent}
```

## Behavioral Rules
1. [Define specific behavioral rules]
2. [Handle edge cases]
3. [Error handling guidelines]

## Completion Criteria
- [List what must be done]
- Create done.flag when complete

## Start
[Instructions to begin work]
```

### Step 4: Create Agent Configuration

Create `templates/config/your_agent.json`:

```json
{
  "model": "sonnet",
  "timeout_ms": 300000,
  "custom_settings": {
    "your_option": "value"
  }
}
```

### Step 5: Add Config Type Definition

Update `src/types/index.ts` to include your agent's config:

```typescript
// Add after existing agent configs (~line 465-535)
export interface YourAgentConfig {
  model: AgentModel;
  timeout_ms: number;
  custom_settings: {
    your_option: string;
  };
}

// Update OrchestraConfig interface (~line 537-543)
export interface OrchestraConfig {
  global: GlobalConfig;
  refiner: RefinerConfig;
  builder: BuilderConfig;
  verifier: VerifierConfig;
  gatekeeper: GatekeeperConfig;
  your_agent: YourAgentConfig;  // Add this
}
```

### Step 6: Update Prompt Generator

Modify `src/agents/prompt-generator.ts` to handle your agent's prompt:

```typescript
// Add to generatePrompt method (~line 150+)
async generatePrompt(
  agent: AgentName,
  context: PromptContext,
  phase?: VerifierPhase
): Promise<string> {
  if (agent === 'your_agent') {
    const template = await this.promptLoader.load('your_agent');
    return this.substituteVariables(template, context);
  }
  // ... existing agent handling
}

// Add config substitution in substituteVariables (~line 50+)
result = result.replace(/\$\{config_your_agent\}/g, JSON.stringify(config.your_agent, null, 2));
```

### Step 7: Update State Manager

Modify `src/core/state-manager.ts` to initialize your agent's state:

```typescript
// In createInitialState method (~line 71-100)
agents: {
  refiner: { status: 'pending', usage: null },
  builder: { status: 'pending', usage: null },
  verifier: { status: 'pending', usage: null },
  gatekeeper: { status: 'pending', usage: null },
  your_agent: { status: 'pending', usage: null },  // Add this
}
```

### Step 8: Update Phase Transition Logic

If your agent requires a new phase, update the phase transition logic:

1. Add phase to `Phase` type in `src/types/index.ts`:
   ```typescript
   export type Phase = 'refine' | 'build' | 'verify' | 'gate' | 'your_phase' | 'waiting_human' | 'ready_for_merge' | 'completed' | 'failed';
   ```

2. Update phase transition manager in `src/core/phase-transition-manager.ts`

### Step 9: Create Unit Tests

Create `tests/unit/agents/your_agent.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTempDir,
  cleanupTempDir,
  generateTestRunId,
  createMockRunDir,
  createMockState,
} from '../../helpers/test-utils.js';
import type { RunState, AgentName } from '../../../src/types/index.js';

describe('YourAgent', () => {
  let tempDir: string;
  let runDir: string;
  let runId: string;

  beforeEach(() => {
    tempDir = createTempDir('your-agent-test');
    runId = generateTestRunId();
    runDir = createMockRunDir(tempDir, runId);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('initialization', () => {
    it('should initialize with pending status', async () => {
      const state = createMockState(runId);
      expect(state.agents.your_agent.status).toBe('pending');
      expect(state.agents.your_agent.usage).toBeNull();
    });
  });

  describe('execution', () => {
    it('should process input correctly', async () => {
      // Test agent execution logic
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      // Test error scenarios
    });
  });
});
```

### Step 10: Create Integration Tests

Create `tests/integration/your_agent_pipeline.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// Test full pipeline integration with your new agent

describe('YourAgent Pipeline Integration', () => {
  it('should integrate with existing pipeline', async () => {
    // Test end-to-end flow
  });
});
```

## Conventions from Existing Agents

### File Structure Pattern
All agents follow this structure:
```
.dure/runs/{run-id}/
  └── {agent-name}/
      ├── output/           # Agent's output files
      ├── log.md           # Execution log and rationale
      └── done.flag        # Completion signal
```

### State Management Pattern
- Agents read from previous agent's output directory
- Agents write to their own output directory
- State transitions happen via file watchers
- All state mutations go through StateManager

### Event Emission Pattern
- Events use branded types from `src/types/branded.ts`
- Factory functions create events (see `src/types/events.ts`)
- Events flow through EventCoordinator
- All events are logged via EventLogger

### Prompt Template Pattern
- Use `${variable}` syntax for substitution
- Include configuration as JSON block
- Clearly define inputs, outputs, and behavioral rules
- Always include completion criteria

### Configuration Pattern
- Store in `templates/config/{agent}.json`
- Include model selection
- Include timeout settings
- Add agent-specific options as needed

### Testing Pattern
- Use Vitest for all tests
- Create test utilities in `tests/helpers/test-utils.js`
- Separate unit and integration tests
- Mock external dependencies

## Example: Adding a "Reviewer" Agent

Here's a concrete example of adding a code review agent:

1. **Types**: Add `'reviewer'` to `AgentName` type
2. **State**: Add `reviewer: AgentState` to `RunState.agents`
3. **Events**: Add `ReviewerStartedEvent`, `ReviewerCompletedEvent`
4. **Prompt**: Create `templates/prompts/reviewer.md` with review instructions
5. **Config**: Create `templates/config/reviewer.json` with review criteria
6. **Phase**: Insert 'review' phase between 'verify' and 'gate'
7. **Tests**: Create unit tests for reviewer logic

## Output Files

After completing this skill, you should have:

1. **Type definitions** in `src/types/index.ts`
2. **Event definitions** in `src/types/events.ts`
3. **Prompt template** at `templates/prompts/your_agent.md`
4. **Configuration** at `templates/config/your_agent.json`
5. **Prompt generator updates** in `src/agents/prompt-generator.ts`
6. **State manager updates** in `src/core/state-manager.ts`
7. **Unit tests** in `tests/unit/agents/your_agent.test.ts`
8. **Integration tests** in `tests/integration/your_agent_pipeline.test.ts`

## Validation Checklist

Before completing, verify:

- [ ] Agent name added to `AgentName` union type
- [ ] Agent state added to `RunState.agents` interface
- [ ] Agent events defined in `events.ts` with factory functions
- [ ] Prompt template created with proper variable substitution
- [ ] Configuration file created with required fields
- [ ] Config type interface defined in `types/index.ts`
- [ ] Prompt generator handles new agent
- [ ] State manager initializes agent state
- [ ] Phase transitions updated (if new phase required)
- [ ] Unit tests created and passing
- [ ] Integration tests created and passing
- [ ] Agent follows file structure conventions
- [ ] Done flag pattern implemented
