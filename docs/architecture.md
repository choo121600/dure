# Dure - System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         dure                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   CLI (dure start)                                     │
│         │                                                    │
│         ▼                                                    │
│   ┌─────────────┐         ┌─────────────────────────────┐   │
│   │ ACE Web     │◄───────►│ .dure/                │   │
│   │ Server      │         │   ├─ config/                │   │
│   │ :3000       │         │   └─ runs/                  │   │
│   └─────────────┘         └─────────────────────────────┘   │
│         │                              ▲                     │
│         │ Run start                    │                     │
│         ▼                              │                     │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                  tmux session                        │   │
│   │  ┌──────────┬──────────┬──────────┬──────────┐      │   │
│   │  │ Refiner  │ Builder  │ Verifier │Gatekeeper│      │   │
│   │  │ (pane 0) │ (pane 1) │ (pane 2) │ (pane 3) │      │   │
│   │  └──────────┴──────────┴──────────┴──────────┘      │   │
│   │  ┌─────────────────────┬────────────────────┐       │   │
│   │  │ Debug Shell (pane 4)│ ACE Server (pane 5)│       │   │
│   │  └─────────────────────┴────────────────────┘       │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Execution Flow

### Phase Diagram

```
     ┌──────────────────────────────────────────────────────────┐
     │                                                          │
     ▼                                                          │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐       │
│ REFINE  │───►│  BUILD  │───►│ VERIFY  │───►│  GATE   │       │
│ Phase 0 │    │ Phase 1 │    │ Phase 2 │    │ Phase 3 │       │
└─────────┘    └─────────┘    └─────────┘    └────┬────┘       │
     ▲              ▲                             │             │
     │              │                             ▼             │
     │              │         ┌───────────────────────────┐     │
     │              │         │        Verdict?           │     │
     │              │         └───────────────────────────┘     │
     │              │              │         │         │        │
     │              │            PASS      FAIL    NEEDS_HUMAN  │
     │              │              │         │         │        │
     │              │              ▼         │         ▼        │
     │              │         ┌───────┐      │    ┌────────┐    │
     │              │         │  MRP  │      │    │  CRP   │    │
     │              │         └───┬───┘      │    └────┬───┘    │
     │              │             │          │         │        │
     │              │             ▼          │         ▼        │
     │              │        [Human Review]  │    [Human Response]
     │              │             │          │         │        │
     │              └─────────────┼──────────┘         │        │
     │                            │                    │        │
     │                            ▼                    │        │
     │                        [Complete]               │        │
     │                                                 │        │
     └─────────────────────────────────────────────────┘        │
                                                                │
     iteration < max_iterations ────────────────────────────────┘
```

### Detailed Flow

```
T0   Human: Write briefing/raw.md
     state = { phase: "refine", iteration: 1 }

T1   Refiner runs
     ├─ Sufficient → refined.md, phase: "build"
     ├─ Improved → refined.md + log.md, phase: "build"
     └─ Ambiguous → crp/ created, phase: "waiting_human"

T2   Builder runs
     - Read refined.md
     - Generate code in output/
     - Create done.flag
     - phase: "verify"

T3   Verifier runs
     - Start after detecting builder/done.flag
     - Create tests/, run tests
     - Record results.json
     - Create done.flag
     - phase: "gate"

T4   Gatekeeper runs
     - Review all artifacts
     - Write verdict.json
     ├─ PASS → Create mrp/, phase: "ready_for_merge"
     ├─ FAIL → review.md, phase: "build", iteration++
     └─ NEEDS_HUMAN → Create crp/, phase: "waiting_human"

T5   [PASS] Human: Review MRP → Approve or provide feedback
     [FAIL] Builder restarts (reference review.md)
     [NEEDS_HUMAN] Human: Write VCR → Restart corresponding stage
```

## tmux Session Configuration

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│                    dure-run-{timestamp}                 │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│   Refiner    │   Builder    │   Verifier   │   Gatekeeper    │
│   (pane 0)   │   (pane 1)   │   (pane 2)   │   (pane 3)      │
├──────────────┴──────────────┴──────────────┴─────────────────┤
│                        Debug Shell (pane 4)                   │
├──────────────────────────────────────────────────────────────┤
│                        ACE Server (pane 5)                    │
└──────────────────────────────────────────────────────────────┘
```

### Creation Script

```bash
#!/bin/bash
SESSION="dure-run-$1"

tmux new-session -d -s $SESSION -n main

# 4 agent panes
tmux split-window -h -t $SESSION:main
tmux split-window -h -t $SESSION:main.0
tmux split-window -h -t $SESSION:main.2

# Debug shell
tmux split-window -v -t $SESSION:main.0
tmux join-pane -v -s $SESSION:main.1 -t $SESSION:main.4

# ACE server
tmux split-window -v -t $SESSION:main.4

# Adjust layout
tmux select-layout -t $SESSION:main tiled
```

## Agent Execution Specification

### Execution Flow Overview

```
tmux pane created
       │
       ▼
claude --dangerously-skip-permissions execution
       │
       ▼
Prompt file path passed (--prompt-file)
       │
       ▼
Agent task starts
       │
       ▼
done.flag created → Next agent triggered
```

### Commands for Each Pane

**Pane 0 (Refiner):**
```bash
cd {project_root} && claude --dangerously-skip-permissions \
  --model {config.refiner.model} \
  --prompt-file .dure/runs/{run_id}/prompts/refiner.md
```

**Pane 1 (Builder):**
```bash
cd {project_root} && claude --dangerously-skip-permissions \
  --model {config.builder.model} \
  --prompt-file .dure/runs/{run_id}/prompts/builder.md
```

**Pane 2 (Verifier):**
```bash
cd {project_root} && claude --dangerously-skip-permissions \
  --model {config.verifier.model} \
  --prompt-file .dure/runs/{run_id}/prompts/verifier.md
```

**Pane 3 (Gatekeeper):**
```bash
cd {project_root} && claude --dangerously-skip-permissions \
  --model {config.gatekeeper.model} \
  --prompt-file .dure/runs/{run_id}/prompts/gatekeeper.md
```

**Pane 4 (Debug Shell):** Standby state - for human intervention

**Pane 5 (ACE Server):**
```bash
cd {project_root} && node .dure/server/index.js --port {config.web_port}
```

### Prompt File Structure

```
.dure/runs/{run_id}/prompts/
├── refiner.md
├── builder.md
├── verifier.md
└── gatekeeper.md
```

Prompt templates are implemented in `src/agents/prompt-generator.ts`.

### Agent Trigger Mechanism

done.flag detection method for sequential execution:

```bash
# Method 1: Polling (simple)
while [ ! -f ".dure/runs/{run_id}/builder/done.flag" ]; do
  sleep 2
done

# Method 2: inotifywait (efficient)
inotifywait -e create ".dure/runs/{run_id}/builder/"
```

### Command Injection via tmux send-keys

```bash
# Start Refiner
tmux send-keys -t dure-run-{timestamp}:main.0 \
  "claude --dangerously-skip-permissions --model haiku --prompt-file .dure/runs/{run_id}/prompts/refiner.md" Enter

# Start Builder (after Refiner completes)
tmux send-keys -t dure-run-{timestamp}:main.1 \
  "claude --dangerously-skip-permissions --model sonnet --prompt-file .dure/runs/{run_id}/prompts/builder.md" Enter
```

### Context Reset on Retry

When Gatekeeper issues FAIL verdict:

1. Increment `iteration` in `state.json`
2. Reset context in Builder pane with `/clear` command
3. Trigger message to initiate restart

```bash
tmux send-keys -t dure-run-{timestamp}:main.1 "/clear" Enter
sleep 2
tmux send-keys -t dure-run-{timestamp}:main.1 \
  "Starting iteration 2. Please read prompts/builder.md and resume work." Enter
```

### CRP Occurrence Flow

1. Agent creates `crp/crp-{n}.json`
2. ACE server detects file (inotify or polling)
3. Notification displayed in web UI
4. Human responds → `vcr/vcr-{n}.json` created
5. ACE server detects VCR → `/clear` and restart corresponding agent

## Core Class Structure

### Orchestrator Responsibility Separation

Orchestrator responsibilities are separated into multiple specialized classes following the Single Responsibility Principle (SRP).

```
src/core/
├── orchestrator.ts           # Only coordination role (entry point)
├── run-lifecycle-manager.ts  # Run creation/resume/stop management
├── agent-coordinator.ts      # Agent start/completion/transition coordination
├── error-recovery-service.ts # Error detection/retry logic
├── verdict-handler.ts        # Gatekeeper verdict handling (PASS/FAIL/NEEDS_HUMAN)
├── agent-lifecycle-manager.ts # Individual agent lifecycle management
├── phase-transition-manager.ts # Phase transition state management
├── event-coordinator.ts      # Event collection and coordination
└── interrupt-recovery.ts     # Interrupted run recovery
```

### Class Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Orchestrator                            │
│ - Event publishing (EventEmitter)                            │
│ - Public API provision                                       │
└───────────────────────────────┬─────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐       ┌───────────────┐
│ RunLifecycle  │      │    Agent      │       │    Error      │
│   Manager     │      │  Coordinator  │       │  Recovery     │
│               │      │               │       │   Service     │
│ - startRun()  │      │ - handleDone()│       │ - handleError │
│ - resumeRun() │      │ - handleCRP() │       │ - shouldRetry │
│ - stopRun()   │      │ - transition()│       │ - executeRetry│
└───────────────┘      └───────────────┘       └───────────────┘
        │                       │
        ▼                       ▼
┌───────────────┐      ┌───────────────┐
│   Verdict     │      │    Phase      │
│   Handler     │      │  Transition   │
│               │      │   Manager     │
│ - PASS → MRP  │      │               │
│ - FAIL → retry│      │ - validate()  │
│ - NEEDS_HUMAN │      │ - transition()│
└───────────────┘      └───────────────┘
```

### Graceful Shutdown

Structure for safe state preservation on server shutdown:

```
┌─────────────────────────────────────────────────────────────┐
│                   GracefulShutdown                           │
├─────────────────────────────────────────────────────────────┤
│ 1. Start rejecting new requests                              │
│ 2. Wait for in-progress HTTP requests to complete            │
│ 3. Send shutdown notification to WebSocket connections       │
│ 4. Save in-progress run state (phase: 'interrupted')         │
│ 5. Maintain tmux session (agents can continue running)       │
│ 6. Clean up file watchers                                    │
│ 7. Shutdown server                                           │
└─────────────────────────────────────────────────────────────┘
```

### Interrupt Recovery

Structure for recovering interrupted runs on server restart:

```
┌─────────────────────────────────────────────────────────────┐
│                   InterruptRecovery                          │
├─────────────────────────────────────────────────────────────┤
│ detectInterruptedRuns()                                      │
│   └─ Scan .dure/runs/                                        │
│   └─ Identify runs with phase: 'interrupted'                 │
│                                                              │
│ Recovery strategy:                                           │
│   - refine/build/verify: Restart corresponding agent         │
│   - gate: Restart Gatekeeper                                 │
│   - waiting_human: Continue waiting                          │
└─────────────────────────────────────────────────────────────┘
```
