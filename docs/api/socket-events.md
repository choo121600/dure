# Socket Events Reference

Socket.io 이벤트 전용 참조 문서입니다. Dashboard와 웹 클라이언트 간의 실시간 통신을 정의합니다.

## Connection

Dashboard Socket.io는 `/dashboard` 네임스페이스를 사용합니다.

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3873/dashboard');

socket.on('connect', () => {
  console.log('Connected to dashboard');
  socket.emit('dashboard:subscribe', 'run-20240126-143022');
});
```

### Connection URL

```
http://localhost:{port}/dashboard
```

Default port: `3873`

---

## Dashboard Events

### dashboard:subscribe

클라이언트가 특정 Run의 업데이트를 구독합니다.

**Direction:** Client → Server

**Payload:**
```typescript
runId: string  // e.g., "run-20240126-143022"
```

**Example:**
```typescript
socket.emit('dashboard:subscribe', 'run-20240126-143022');
```

**Response:** `dashboard:subscribed` 이벤트 및 초기 `dashboard:update`

---

### dashboard:subscribed

구독 확인 응답입니다.

**Direction:** Server → Client

**Payload:**
```typescript
interface SubscribedPayload {
  runId: string;
}
```

**Example:**
```typescript
socket.on('dashboard:subscribed', (data) => {
  console.log(`Subscribed to ${data.runId}`);
});
```

---

### dashboard:unsubscribe

현재 Run 구독을 해제합니다.

**Direction:** Client → Server

**Payload:** None

**Example:**
```typescript
socket.emit('dashboard:unsubscribe');
```

**Response:** `dashboard:unsubscribed` 이벤트

---

### dashboard:unsubscribed

구독 해제 확인 응답입니다.

**Direction:** Server → Client

**Payload:** None

**Example:**
```typescript
socket.on('dashboard:unsubscribed', () => {
  console.log('Unsubscribed from run');
});
```

---

### dashboard:update

대시보드 전체 상태 업데이트입니다.

**Direction:** Server → Client

**When:**
- 초기 구독 시
- 상태 변경 시 (폴링 기반, 기본 500ms)

**Payload:**
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
  status: 'idle' | 'running' | 'done' | 'error';
  output: string;        // Last N lines of agent output
  startedAt?: Date;
  finishedAt?: Date;
}

interface DashboardUsage {
  totalTokens: number;
  cost: number;
}

interface DashboardProgress {
  currentStep: number;   // 1-4 (refiner=1, builder=2, verifier=3, gatekeeper=4)
  totalSteps: number;    // Always 4
  retryCount: number;
}
```

**Example:**
```typescript
socket.on('dashboard:update', (data: DashboardData) => {
  console.log(`Stage: ${data.stage}`);
  console.log(`Progress: ${data.progress.currentStep}/${data.progress.totalSteps}`);

  Object.entries(data.agents).forEach(([name, agent]) => {
    console.log(`${name}: ${agent.status}`);
  });
});
```

---

### dashboard:stage-change

실행 스테이지가 변경될 때 발생합니다.

**Direction:** Server → Client

**Payload:**
```typescript
interface StageChangePayload {
  previousStage: DashboardStage;
  newStage: DashboardStage;
}
```

**Example:**
```typescript
socket.on('dashboard:stage-change', (data) => {
  console.log(`Stage changed: ${data.previousStage} → ${data.newStage}`);
});
```

---

### dashboard:agent-status-change

에이전트 상태가 변경될 때 발생합니다.

**Direction:** Server → Client

**Payload:**
```typescript
interface AgentStatusChangePayload {
  agent: 'refiner' | 'builder' | 'verifier' | 'gatekeeper';
  previousStatus: 'idle' | 'running' | 'done' | 'error';
  newStatus: 'idle' | 'running' | 'done' | 'error';
}
```

**Example:**
```typescript
socket.on('dashboard:agent-status-change', (data) => {
  console.log(`${data.agent}: ${data.previousStatus} → ${data.newStatus}`);
});
```

---

## CRP Events

CRP (Clarification Request Point)는 에이전트가 인간의 판단을 요청할 때 발생합니다.

### dashboard:crp

CRP가 발생했을 때 전송됩니다.

**Direction:** Server → Client

**Payload:**
```typescript
interface DashboardCRP {
  agent: 'refiner' | 'builder' | 'verifier' | 'gatekeeper';
  question: string;
  options: string[];
}
```

**Example:**
```typescript
socket.on('dashboard:crp', (crp) => {
  console.log(`CRP from ${crp.agent}:`);
  console.log(`Question: ${crp.question}`);
  crp.options.forEach((opt, i) => {
    console.log(`  ${i + 1}. ${opt}`);
  });
});
```

---

### dashboard:crp-response

클라이언트가 CRP에 응답합니다.

**Direction:** Client → Server

**Payload:**
```typescript
interface CRPResponse {
  crpId: string;
  decision: string;
  rationale?: string;
}
```

**Example:**
```typescript
socket.emit('dashboard:crp-response', {
  crpId: 'crp-001',
  decision: 'option_1',
  rationale: 'This approach aligns with existing patterns'
});
```

> **Note:** 실제 VCR 파일 생성은 REST API (`POST /api/runs/:runId/vcr`)를 통해 처리해야 합니다.

---

### dashboard:request-update

클라이언트가 수동으로 상태 갱신을 요청합니다.

**Direction:** Client → Server

**Payload:** None

**Example:**
```typescript
socket.emit('dashboard:request-update');
```

**Response:** `dashboard:update` 이벤트

---

## Error Handling

### dashboard:error

오류 발생 시 전송됩니다.

**Direction:** Server → Client

**Payload:**
```typescript
interface ErrorPayload {
  error: string;
}
```

**Example:**
```typescript
socket.on('dashboard:error', (data) => {
  console.error('Dashboard error:', data.error);
});
```

**Common Errors:**
- `"Not subscribed to any run"` - CRP 응답 시 구독되지 않음
- `"No data provider for this run"` - Run이 존재하지 않거나 종료됨
- `"Unknown error"` - 예상치 못한 오류

---

## Complete Client Example

```typescript
import { io, Socket } from 'socket.io-client';

interface ClientToServerEvents {
  'dashboard:subscribe': (runId: string) => void;
  'dashboard:unsubscribe': () => void;
  'dashboard:crp-response': (response: CRPResponse) => void;
  'dashboard:request-update': () => void;
}

interface ServerToClientEvents {
  'dashboard:update': (data: DashboardData) => void;
  'dashboard:crp': (data: DashboardCRP) => void;
  'dashboard:stage-change': (data: StageChangePayload) => void;
  'dashboard:agent-status-change': (data: AgentStatusChangePayload) => void;
  'dashboard:error': (data: { error: string }) => void;
  'dashboard:subscribed': (data: { runId: string }) => void;
  'dashboard:unsubscribed': () => void;
}

const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
  io('http://localhost:3873/dashboard');

// Connection handling
socket.on('connect', () => {
  console.log('Connected');
  socket.emit('dashboard:subscribe', 'run-20240126-143022');
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});

// Dashboard events
socket.on('dashboard:subscribed', ({ runId }) => {
  console.log(`Subscribed to ${runId}`);
});

socket.on('dashboard:update', (data) => {
  renderDashboard(data);
});

socket.on('dashboard:stage-change', ({ previousStage, newStage }) => {
  showNotification(`Stage: ${previousStage} → ${newStage}`);
});

socket.on('dashboard:agent-status-change', ({ agent, newStatus }) => {
  updateAgentStatus(agent, newStatus);
});

// CRP handling
socket.on('dashboard:crp', (crp) => {
  showCRPDialog(crp);
});

// Error handling
socket.on('dashboard:error', ({ error }) => {
  showError(error);
});

// Cleanup on exit
process.on('SIGINT', () => {
  socket.emit('dashboard:unsubscribe');
  socket.disconnect();
});
```

---

## Event Flow Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                      Client Connection                          │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  socket.connect()                                               │
│       │                                                         │
│       ▼                                                         │
│  dashboard:subscribe ────────────────▶ Server                   │
│       │                                   │                     │
│       │ ◀──────── dashboard:subscribed ◀──┘                     │
│       │                                   │                     │
│       │ ◀──────── dashboard:update ◀──────┘ (initial state)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Polling Loop (every 500ms)                                     │
│       │                                                         │
│       │ ◀──────── dashboard:update                              │
│       │ ◀──────── dashboard:stage-change (on stage change)      │
│       │ ◀──────── dashboard:agent-status-change (on status)     │
│       │ ◀──────── dashboard:crp (when CRP created)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  CRP Flow (Human Judgment Required)                             │
│       │                                                         │
│       │ ◀──────── dashboard:crp                                 │
│       │                                                         │
│  dashboard:crp-response ──────────────▶ Server                  │
│       │                                   │                     │
│       │ ◀──────── dashboard:update ◀──────┘ (crp resolved)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Next Steps

- [API Documentation](../api.md) - Full API reference
- [Dashboard System](../architecture/dashboard-system.md) - Architecture details
- [CLI Reference](./cli.md) - CLI commands for monitoring
