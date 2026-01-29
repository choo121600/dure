# Dashboard System Architecture

실행 상태를 실시간으로 모니터링하기 위한 대시보드 시스템 아키텍처를 설명합니다.

## Overview

Dure는 두 가지 모니터링 인터페이스를 제공합니다:

| 인터페이스 | 위치 | 용도 |
|------------|------|------|
| **TUI Dashboard** | `src/tui/` | 로컬 터미널 모니터링 (기본) |
| **Web Dashboard** | `src/server/dashboard/` | 원격/웹 기반 모니터링 |

두 인터페이스 모두 `DashboardDataProvider`를 통해 동일한 데이터를 소비합니다.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Dashboard System                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌───────────────┐       ┌───────────────────────────────────┐ │
│   │ StateManager  │       │          TmuxManager              │ │
│   │               │       │                                   │ │
│   │ state.json    │       │  capturePane() → output lines     │ │
│   └───────┬───────┘       └───────────────┬───────────────────┘ │
│           │                               │                      │
│           └──────────────┬────────────────┘                      │
│                          │                                       │
│                          ▼                                       │
│           ┌──────────────────────────────────┐                   │
│           │      DashboardDataProvider       │                   │
│           │                                  │                   │
│           │  - Polling (500ms interval)      │                   │
│           │  - Data aggregation              │                   │
│           │  - Event emission                │                   │
│           └──────────────┬───────────────────┘                   │
│                          │                                       │
│               ┌──────────┴──────────┐                            │
│               │                     │                            │
│               ▼                     ▼                            │
│      ┌──────────────────┐  ┌──────────────────────┐             │
│      │   TUI (Ink)      │  │   Socket Handler     │             │
│      │                  │  │                      │             │
│      │  useDashboardData│  │  io.emit('dashboard: │             │
│      │  () hook         │  │   update', data)     │             │
│      └────────┬─────────┘  └──────────┬───────────┘             │
│               │                       │                          │
│               ▼                       ▼                          │
│      ┌──────────────────┐  ┌──────────────────────┐             │
│      │    Terminal      │  │    Web Browser       │             │
│      └──────────────────┘  └──────────────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## DashboardDataProvider

### 개요

`DashboardDataProvider`는 대시보드 UI에 필요한 데이터를 집계하고 구독자에게 전달하는 중간 레이어입니다.

**파일:** `src/core/dashboard-data-provider.ts`

### 역할

1. **데이터 집계**: StateManager와 TmuxManager에서 데이터 수집
2. **폴링**: 주기적으로 상태 변경 감지 (기본 500ms)
3. **이벤트 발행**: 변경 감지 시 구독자에게 알림
4. **변경 감지**: 이전 상태와 비교하여 세분화된 이벤트 발행

### 생성자

```typescript
constructor(
  tmuxManager: TmuxManager,
  stateManager: StateManager,
  runDir: string,
  options?: DashboardDataProviderOptions
)

interface DashboardDataProviderOptions {
  pollingIntervalMs?: number;  // 기본: 500
  outputLines?: number;        // 기본: 50
  projectRoot?: string;        // 기본: process.cwd()
}
```

### 주요 메서드

| 메서드 | 반환 타입 | 설명 |
|--------|-----------|------|
| `getData()` | `Promise<DashboardData>` | 현재 대시보드 상태 스냅샷 |
| `startPolling(intervalMs?)` | `void` | 폴링 시작 |
| `stopPolling()` | `void` | 폴링 중지 |
| `isPolling()` | `boolean` | 폴링 활성 상태 확인 |
| `destroy()` | `void` | 리소스 정리 |

### 발행 이벤트

```typescript
provider.on('update', (data: DashboardData) => { ... });
provider.on('stage-change', (data: { previousStage, newStage }) => { ... });
provider.on('agent-status-change', (data: { agent, previousStatus, newStatus }) => { ... });
provider.on('crp', (crp: DashboardCRP) => { ... });
provider.on('error', (error: Error) => { ... });
```

---

## DashboardData Type

대시보드에서 사용하는 핵심 데이터 타입입니다.

**파일:** `src/types/index.ts`

```typescript
interface DashboardData {
  runId: string;
  stage: DashboardStage;
  agents: {
    refiner: DashboardAgentData;
    builder: DashboardAgentData;
    verifier: DashboardAgentData;
    gatekeeper: DashboardAgentData;
  };
  usage: DashboardUsage;
  crp?: DashboardCRP;
  progress: DashboardProgress;
}

type DashboardStage =
  | 'REFINE'
  | 'BUILD'
  | 'VERIFY'
  | 'GATE'
  | 'DONE'
  | 'FAILED'
  | 'WAITING_HUMAN';

interface DashboardAgentData {
  status: DashboardAgentStatus;  // 'idle' | 'running' | 'done' | 'error'
  output: string;                // 최근 N줄 출력
  startedAt?: Date;
  finishedAt?: Date;
}

interface DashboardUsage {
  totalTokens: number;
  cost: number;
}

interface DashboardCRP {
  agent: AgentName;
  question: string;
  options: string[];
}

interface DashboardProgress {
  currentStep: number;   // 1-4
  totalSteps: number;    // 4
  retryCount: number;    // 0부터 시작
}
```

---

## TUI Implementation (Ink)

### 개요

TUI 대시보드는 Ink (React for CLI)를 사용하여 구현됩니다.

**진입점:** `src/tui/ink/index.tsx`

### 컴포넌트 구조

```
src/tui/ink/
├── index.tsx              # Ink render 진입점
├── App.tsx                # 메인 컴포넌트
├── Header.tsx             # 상단 정보 (Run ID, Stage, Tokens, Cost)
├── AgentPanel.tsx         # 에이전트 상태 패널
├── OutputView.tsx         # 선택된 에이전트 출력
├── ProgressBar.tsx        # 진행률 바
├── CRPPrompt.tsx          # CRP 응답 프롬프트
├── MRPViewer.tsx          # MRP 결과 뷰어
├── NewRunPrompt.tsx       # 새 실행 생성 프롬프트
├── RunListScreen.tsx      # 실행 목록 화면
└── hooks/
    └── useDashboardData.ts  # DashboardDataProvider 구독 훅
```

### 화면 레이아웃

```
┌─────────────────────────────────────────────────────────────┐
│ Dure Dashboard              run-2024-01-29-143022           │
│ Stage: BUILD                Tokens: 12.5k    Cost: $0.045   │
├─────────────────────────────────────────────────────────────┤
│  [1] Refiner   ✓ Done                                       │
│  [2] Builder   ● Running (45%)                              │
│  [3] Verifier  ○ Pending                                    │
│  [4] Gatekeeper ○ Pending                                   │
├─────────────────────────────────────────────────────────────┤
│ Output: Builder                                             │
│ ─────────────────────────────────────────────────────────── │
│ > Reading refined.md...                                     │
│ > Creating src/features/rate-limiter.ts                     │
│ > Implementing middleware logic...                          │
│ > Running type check...                                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Progress: ████████████░░░░░░░░░░░░░░░░░░░░░░░░ 45%          │
├─────────────────────────────────────────────────────────────┤
│ [1-4] Switch agent  [q] Quit  [d] Detach                    │
└─────────────────────────────────────────────────────────────┘
```

### 키보드 단축키

| 키 | 동작 | 구현 위치 |
|----|------|-----------|
| `1` | Refiner 선택 | `App.tsx:62` |
| `2` | Builder 선택 | `App.tsx:63` |
| `3` | Verifier 선택 | `App.tsx:64` |
| `4` | Gatekeeper 선택 | `App.tsx:65` |
| `q` | TUI 종료 | `App.tsx:71` |
| `d` | Detach (백그라운드) | `App.tsx:77` |
| `Escape` | CRP 모달 닫기 | `App.tsx:84` |

### useDashboardData Hook

DashboardDataProvider를 React 컴포넌트에서 사용하기 위한 훅입니다.

**파일:** `src/tui/ink/hooks/useDashboardData.ts`

```typescript
function useDashboardData(
  provider: DashboardDataProvider | null
): UseDashboardDataResult;

interface UseDashboardDataResult {
  data: DashboardData | null;
  loading: boolean;
  error: Error | null;
  selectedAgent: AgentName;
  selectAgent: (agent: AgentName) => void;
}
```

**자동 동작:**
- Stage 변경 시 해당 에이전트 자동 선택
- Running 상태 에이전트 자동 포커스

---

## Web Dashboard Implementation

### 개요

Web Dashboard는 Socket.io를 통해 실시간 업데이트를 제공합니다.

**파일:** `src/server/dashboard/socket-handler.ts`

### DashboardSocketHandler

Socket.io 연결을 관리하고 DashboardDataProvider 이벤트를 클라이언트에 전달합니다.

```typescript
class DashboardSocketHandler {
  constructor(io: SocketServer, options?: DashboardSocketHandlerOptions);

  registerProvider(runId: string, provider: DashboardDataProvider): void;
  unregisterProvider(runId: string): void;
  getClientCount(runId: string): Promise<number>;
  broadcastUpdate(runId: string, data: DashboardData): void;
  destroy(): void;
}
```

### Socket.io Events

#### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|----------|------|
| `dashboard:update` | `DashboardData` | 전체 상태 업데이트 |
| `dashboard:crp` | `DashboardCRP` | CRP 발생 알림 |
| `dashboard:stage-change` | `{ previousStage, newStage }` | 단계 변경 |
| `dashboard:agent-status-change` | `{ agent, previousStatus, newStatus }` | 에이전트 상태 변경 |
| `dashboard:error` | `{ error: string }` | 에러 발생 |
| `dashboard:subscribed` | `{ runId: string }` | 구독 확인 |
| `dashboard:unsubscribed` | - | 구독 해제 확인 |

#### Client → Server

| 이벤트 | 페이로드 | 설명 |
|--------|----------|------|
| `dashboard:subscribe` | `runId: string` | 특정 run 구독 |
| `dashboard:unsubscribe` | - | 구독 해제 |
| `dashboard:crp-response` | `CRPResponse` | CRP 응답 |
| `dashboard:request-update` | - | 수동 업데이트 요청 |

### 클라이언트 연결 예시

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3873/dashboard');

// 연결 및 구독
socket.on('connect', () => {
  socket.emit('dashboard:subscribe', 'run-2024-01-29-143022');
});

// 업데이트 수신
socket.on('dashboard:update', (data: DashboardData) => {
  console.log('Current stage:', data.stage);
  console.log('Builder status:', data.agents.builder.status);
});

// CRP 처리
socket.on('dashboard:crp', (crp: DashboardCRP) => {
  console.log('Human judgment needed:', crp.question);
});
```

---

## Event Flow Diagram

전체 이벤트 흐름을 나타낸 다이어그램입니다.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Event Flow                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [1] Agent Execution                                                 │
│                                                                      │
│      ┌──────────┐                                                   │
│      │  tmux    │ ── pane output ──────────────────┐               │
│      │  pane    │                                   │               │
│      └──────────┘                                   │               │
│           │                                         │               │
│           │ creates                                 │               │
│           ▼                                         ▼               │
│      ┌──────────┐                          ┌──────────────┐        │
│      │ done.flag│                          │ TmuxManager  │        │
│      │ crp/*.json│                         │ capturePane()│        │
│      └──────────┘                          └──────┬───────┘        │
│           │                                       │                 │
│  [2] State Detection                              │                 │
│           │                                       │                 │
│           ▼                                       │                 │
│      ┌──────────────┐                             │                 │
│      │ FileWatcher  │                             │                 │
│      │              │                             │                 │
│      │ chokidar     │                             │                 │
│      └──────┬───────┘                             │                 │
│             │                                     │                 │
│             │ event                               │                 │
│             ▼                                     │                 │
│      ┌──────────────┐         ┌──────────────────┐                 │
│      │ Orchestrator │────────▶│  StateManager    │                 │
│      │              │         │                  │                 │
│      │ updateState()│         │  loadState()     │                 │
│      └──────────────┘         └────────┬─────────┘                 │
│                                        │                            │
│  [3] Dashboard Data Aggregation        │                            │
│                                        │                            │
│                    ┌───────────────────┴────────────────────┐      │
│                    │                                         │      │
│                    ▼                                         │      │
│           ┌────────────────────────────────────────┐        │      │
│           │        DashboardDataProvider           │◀───────┘      │
│           │                                        │               │
│           │  poll() every 500ms:                   │               │
│           │    1. stateManager.loadState()         │               │
│           │    2. tmuxManager.capturePane()        │               │
│           │    3. buildDashboardData()             │               │
│           │    4. detectChanges()                  │               │
│           │    5. emit('update', data)             │               │
│           └──────────────────┬─────────────────────┘               │
│                              │                                      │
│  [4] UI Update               │                                      │
│                              │                                      │
│               ┌──────────────┴──────────────┐                       │
│               │                             │                       │
│               ▼                             ▼                       │
│      ┌──────────────────┐         ┌─────────────────────┐          │
│      │ TUI (Ink)        │         │ Socket Handler      │          │
│      │                  │         │                     │          │
│      │ useDashboardData │         │ io.to(room).emit()  │          │
│      │ hook             │         │                     │          │
│      └────────┬─────────┘         └──────────┬──────────┘          │
│               │                              │                      │
│               │ React                        │ WebSocket            │
│               │ re-render                    │                      │
│               ▼                              ▼                      │
│      ┌──────────────────┐         ┌─────────────────────┐          │
│      │    Terminal      │         │   Web Browser       │          │
│      │    (stdout)      │         │   (JavaScript)      │          │
│      └──────────────────┘         └─────────────────────┘          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### CLI → TUI 전환

```bash
# TUI와 함께 실행 (기본)
dure start "Your briefing"

# TUI 없이 실행
dure start "Your briefing" --no-tui

# 나중에 TUI로 연결
dure monitor <run-id>
```

### TUI ↔ Orchestrator

```
TUI 시작
    │
    ▼
DashboardDataProvider 생성
    │
    ▼
provider.startPolling()
    │
    ▼
StateManager.loadState() ─────┐
TmuxManager.capturePane() ────┤
                              ▼
                     DashboardData 생성
                              │
                              ▼
                     emit('update', data)
                              │
                              ▼
                     useDashboardData() hook 수신
                              │
                              ▼
                     React component re-render
```

### Web ↔ Socket.io 연결

```
Browser 연결
    │
    ▼
socket.emit('dashboard:subscribe', runId)
    │
    ▼
DashboardSocketHandler.handleSubscribe()
    │
    ▼
socket.join(room) & emit 'dashboard:subscribed'
    │
    ▼
DashboardDataProvider → Socket Handler → Browser
    (update events)         (io.emit)      (socket.on)
```

---

## Related Documents

- [Architecture Overview](/architecture/overview.md) - 시스템 전체 아키텍처
- [API Reference](/api.md) - REST API 및 Socket.io 이벤트
- [Socket Events Reference](/api/socket-events.md) - Socket.io 이벤트 상세
- [CLI Reference](/api/cli.md) - CLI 명령어
- [Monitoring Dashboard Guide](/guide/monitoring-dashboard.md) - 사용 가이드
