---
name: add-event
description: Add a new typed event to the orchestrator event system. Use when user asks to add a new event type, create an event, or extend the event system with new event handling.
---

# Add Orchestrator Event

## Context
This project uses a typed event system for orchestrator events with:
- Event type definitions in `src/types/events.ts`
- Factory functions for type-safe event creation
- Type guards for runtime type checking
- Full TypeScript strict mode compliance
- Events extend `BaseOrchestratorEvent` with `type`, `runId`, and `timestamp`

All events are:
- Defined as interfaces extending `BaseOrchestratorEvent`
- Added to the `OrchestratorEventTyped` union type
- Exported from `src/types/index.ts`
- Created via factory functions that set timestamp automatically

## Instructions

Follow these steps to add a new event:

### 1. Define the Event Interface

In `src/types/events.ts`, add your event interface in the "Individual Event Types" section:

```typescript
/**
 * Emitted when <describe when this event is emitted>
 */
export interface <EventName>Event extends BaseOrchestratorEvent {
  type: '<event_type>';
  // Add event-specific properties here
  // Example: agent: AgentName;
  // Example: someData: string;
}
```

### 2. Add to Union Type

In the "Union Type" section, add your event to `OrchestratorEventTyped`:

```typescript
export type OrchestratorEventTyped =
  | RunStartedEvent
  | PhaseChangedEvent
  // ... existing events ...
  | <EventName>Event;  // Add your event here
```

### 3. Create Factory Function

In the "Event Factory Functions" section, add a factory function:

```typescript
/**
 * Create a <event name> event
 */
export function create<EventName>Event(
  runId: RunId,
  // Add parameters for event-specific properties
): <EventName>Event {
  return {
    type: '<event_type>',
    runId,
    // Add event-specific properties
    timestamp: new Date(),
  };
}
```

### 4. Add Type Guard (Optional)

If this event belongs to a logical group, add or update type guards in the "Type Guards for Events" section:

```typescript
/**
 * Check if event is <group>-related
 */
export function is<Group>Event(
  event: OrchestratorEventTyped
): event is <EventName>Event | <OtherRelatedEvent> {
  return event.type === '<event_type>' || event.type === '<other_type>';
}
```

### 5. Export from index.ts

In `src/types/index.ts`, add your exports in the "Re-export Event types" section:

```typescript
export {
  // ... existing types ...
  type <EventName>Event,
  // ... existing factories ...
  create<EventName>Event,
  // ... existing type guards ...
  is<Group>Event,  // If you added a type guard
} from './events.js';
```

### 6. Update OrchestratorEvent Union (Legacy)

In `src/core/orchestrator.ts`, add your event to the legacy `OrchestratorEvent` union type around line 50-69:

```typescript
export type OrchestratorEvent =
  | { type: 'run_started'; runId: string }
  // ... existing events ...
  | { type: '<event_type>'; /* properties */; runId: string };
```

## Conventions (from existing code)

### Naming
- Interface names: `<PascalCase>Event` (e.g., `AgentStartedEvent`)
- Factory functions: `create<PascalCase>Event` (e.g., `createAgentStartedEvent`)
- Type guards: `is<Group>Event` (e.g., `isAgentEvent`, `isRunEvent`)
- Event type strings: `'snake_case'` (e.g., `'agent_started'`, `'phase_changed'`)

### Documentation
- Use JSDoc comments with `/**` for all interfaces and functions
- Describe when the event is emitted in interface comments
- Keep comments concise and descriptive

### Type Safety
- Use branded types from `src/types/branded.js` (e.g., `RunId`, `CrpId`, `VcrId`)
- Use existing types from `src/types/index.js` (e.g., `AgentName`, `Phase`, `Verdict`)
- Always include `runId: RunId` in factory function parameters
- Always set `timestamp: new Date()` in factory functions

### Event Properties
- Required base properties: `type`, `runId`, `timestamp`
- Add event-specific properties as needed
- Use optional properties (`prop?:`) for data that may not always be available
- Refer to existing events for similar patterns (e.g., timeout events include `timeoutMs?: number`)

## Examples

### Example 1: Simple Event (like RunStartedEvent)

```typescript
// 1. Interface
export interface DeploymentStartedEvent extends BaseOrchestratorEvent {
  type: 'deployment_started';
}

// 2. Add to union
export type OrchestratorEventTyped =
  | RunStartedEvent
  | DeploymentStartedEvent  // Added
  | ...;

// 3. Factory
export function createDeploymentStartedEvent(runId: RunId): DeploymentStartedEvent {
  return {
    type: 'deployment_started',
    runId,
    timestamp: new Date(),
  };
}

// 4. Export from index.ts
export {
  type DeploymentStartedEvent,
  createDeploymentStartedEvent,
} from './events.js';

// 5. Add to legacy union in orchestrator.ts
export type OrchestratorEvent =
  | { type: 'deployment_started'; runId: string }
  | ...;
```

### Example 2: Event with Additional Data (like AgentFailedEvent)

```typescript
// 1. Interface
export interface TestFailedEvent extends BaseOrchestratorEvent {
  type: 'test_failed';
  testName: string;
  errorMessage: string;
}

// 2. Add to union
export type OrchestratorEventTyped =
  | AgentFailedEvent
  | TestFailedEvent  // Added
  | ...;

// 3. Factory
export function createTestFailedEvent(
  runId: RunId,
  testName: string,
  errorMessage: string
): TestFailedEvent {
  return {
    type: 'test_failed',
    runId,
    testName,
    errorMessage,
    timestamp: new Date(),
  };
}

// 4. Type guard (optional)
export function isTestEvent(
  event: OrchestratorEventTyped
): event is TestFailedEvent | TestPassedEvent {
  return event.type === 'test_failed' || event.type === 'test_passed';
}

// 5. Export from index.ts
export {
  type TestFailedEvent,
  createTestFailedEvent,
  isTestEvent,
} from './events.js';

// 6. Add to legacy union in orchestrator.ts
export type OrchestratorEvent =
  | { type: 'test_failed'; testName: string; errorMessage: string; runId: string }
  | ...;
```

## Output

After following these steps, you will have:
- ✅ Type-safe event interface in `src/types/events.ts`
- ✅ Factory function for creating the event
- ✅ Event added to `OrchestratorEventTyped` union
- ✅ Exports added to `src/types/index.ts`
- ✅ Legacy union updated in `src/core/orchestrator.ts`
- ✅ Optional type guard for event categorization

## Testing Your Event

To verify your event works correctly:

1. Import and use the factory function:
```typescript
import { createYourEvent } from './types/index.js';

const event = createYourEvent(runId, /* params */);
```

2. The TypeScript compiler will enforce type safety
3. The event can be dispatched via `EventDispatcher`
4. Event handlers can use type guards for type narrowing

## Common Pitfalls

1. **Forgetting timestamp**: Factory must set `timestamp: new Date()`
2. **Inconsistent naming**: Use PascalCase for interfaces, snake_case for type strings
3. **Missing exports**: Export from both `events.ts` and `index.ts`
4. **Legacy union**: Don't forget to update `OrchestratorEvent` in `orchestrator.ts`
5. **Branded types**: Use `RunId` (not `string`) for runId parameter
