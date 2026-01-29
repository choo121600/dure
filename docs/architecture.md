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
│   │ :3873       │         │   └─ runs/                  │   │
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

## Verifier External Test Execution

### Overview

Verifier 에이전트의 테스트 실행을 외부 subprocess로 분리하여 CPU 리소스 경쟁을 해소하고 에이전트 안정성을 향상시킨다.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Orchestrator                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ FileWatcher  │───▶│ TestRunner   │───▶│ Verifier Phase 2     │  │
│  │              │    │ (subprocess) │    │ (resume with context)│  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│         │                   │                      │                │
│         ▼                   ▼                      ▼                │
│  tests-ready.flag    test-output.json        results.json          │
│                      test-log.txt            done.flag             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2-Phase Execution Flow

```
Verifier Phase 1          External Runner           Verifier Phase 2
(Claude Code, haiku)      (Node subprocess)         (Claude Code, haiku)
─────────────────────     ─────────────────         ─────────────────────
테스트 코드 생성      →   테스트 실행         →    결과 분석/판정
tests-ready.flag          test-output.json          results.json
                          test-log.txt              done.flag
```

### Event Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Verifier Event Flow                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Builder completes (builder/done.flag)                            │
│          │                                                           │
│          ▼                                                           │
│  2. Verifier Phase 1 starts                                          │
│     - Generate test files in verifier/tests/                         │
│     - Create test-config.json                                        │
│     - Create tests-ready.flag                                        │
│          │                                                           │
│          ▼                                                           │
│  3. FileWatcher emits 'tests_ready' event                            │
│          │                                                           │
│          ▼                                                           │
│  4. Orchestrator starts TestRunner (external subprocess)             │
│     - Execute test command from test-config.json                     │
│     - Capture stdout/stderr to test-log.txt                          │
│     - Parse results to test-output.json                              │
│          │                                                           │
│          ▼                                                           │
│  5. FileWatcher emits 'test_execution_done' event                    │
│          │                                                           │
│          ▼                                                           │
│  6. Verifier Phase 2 starts (new Claude session)                     │
│     - Read test-output.json and test-log.txt                         │
│     - Analyze results                                                │
│     - Create results.json and done.flag                              │
│          │                                                           │
│          ▼                                                           │
│  7. FileWatcher emits 'verifier_done' event → Gate phase starts      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
.dure/runs/run-{timestamp}/
└── verifier/
    ├── tests/                    # 생성된 테스트 파일들
    ├── test-config.json          # 테스트 실행 설정
    ├── tests-ready.flag          # Phase 1 완료 시그널
    ├── test-output.json          # 외부 실행 결과
    ├── test-log.txt              # 테스트 실행 로그
    ├── results.json              # 최종 분석 결과
    ├── log.md                    # Verifier 로그
    └── done.flag                 # 전체 완료 시그널
```

### State Transitions

```
┌─────────────────┐     tests-ready.flag     ┌───────────────────────┐
│    running      │ ──────────────────────▶  │ waiting_test_execution│
│ (Verifier Ph1)  │                          │                       │
└─────────────────┘                          └───────────┬───────────┘
                                                         │
                                              test-output.json
                                                         │
                                                         ▼
┌─────────────────┐      done.flag           ┌───────────────────────┐
│   completed     │ ◀────────────────────────│      running          │
│                 │                          │   (Verifier Ph2)      │
└─────────────────┘                          └───────────────────────┘
```

### TestRunner Subprocess

TestRunner는 Orchestrator가 관리하는 외부 subprocess로 테스트를 실행한다:

1. **프로세스 생성**: `child_process.spawn`으로 테스트 명령 실행
2. **출력 캡처**: stdout/stderr를 `test-log.txt`에 저장
3. **타임아웃 처리**: 설정된 시간 초과 시 SIGTERM → SIGKILL
4. **결과 저장**: 실행 결과를 `test-output.json`으로 저장
5. **이벤트 발생**: EventEmitter로 진행 상황 전달
