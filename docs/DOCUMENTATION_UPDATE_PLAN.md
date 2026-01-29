# Documentation Update Plan

> **상태:** Draft
> **생성일:** 2025-01-29
> **목표:** 최신 코드베이스에 맞게 문서 동기화

## Executive Summary

최근 커밋 분석 결과, 다음 주요 기능들이 문서에 미반영되어 있습니다:

| 기능 | 구현 상태 | 문서 반영 |
|------|----------|----------|
| TUI 대시보드 (Ink 기반) | ✅ 완료 | ❌ 미반영 |
| 웹 대시보드 API/Socket.io | ✅ 완료 | ❌ 미반영 |
| `dure monitor` 명령어 | ✅ 완료 | ⚠️ 부분 |
| 풀스크린 TUI 모드 | ✅ 완료 | ❌ 미반영 |
| 헤드리스 에이전트 모드 | ✅ 완료 | ⚠️ 부분 |
| 스킬/에이전트 시스템 | ✅ 완료 | ✅ CLAUDE.md |

---

## Phase Overview

```
Phase 1: Architecture Documentation (Critical)
    ↓
Phase 2: User Guide Updates (High Priority)
    ↓
Phase 3: API & Technical Reference (Medium)
    ↓
Phase 4: Maintenance & Changelog (Low)
```

---

# Phase 1: Architecture Documentation

> **Priority:** Critical
> **Estimated Tasks:** 4
> **Dependencies:** None

## 1.1 Update Main Architecture Document

### Context
`docs/architecture.md`는 현재 레거시 상태로, TUI 대시보드와 새로운 데이터 흐름이 반영되지 않음.

### Task Description
```yaml
file: docs/architecture.md
action: rewrite
sections_to_update:
  - System Overview (TUI 추가)
  - Component Diagram (DashboardDataProvider 추가)
  - Data Flow (실시간 업데이트 흐름)
  - UI Layer (TUI vs Web Dashboard)
```

### Prompt
```markdown
## Task: Rewrite Architecture Document

### Input Files
- Current: docs/architecture.md
- Reference: src/core/dashboard-data-provider.ts
- Reference: src/tui/ink/App.tsx
- Reference: src/server/dashboard/socket-handler.ts

### Requirements
1. 시스템 개요에 TUI 대시보드를 primary UI로 명시
2. 컴포넌트 다이어그램에 다음 추가:
   - DashboardDataProvider (실시간 데이터 집계)
   - TUI Layer (Ink 기반)
   - Socket.io Handler (웹 대시보드)
3. 데이터 흐름 섹션에 다음 추가:
   - Orchestrator → DashboardDataProvider → TUI/Web
   - Event-driven 업데이트 패턴
4. ASCII 다이어그램 업데이트:
   ```
   ┌─────────────────────────────────────────┐
   │              Dure System                │
   ├─────────────────────────────────────────┤
   │  ┌─────────┐     ┌──────────────────┐  │
   │  │   CLI   │────▶│   Orchestrator   │  │
   │  └─────────┘     └────────┬─────────┘  │
   │                           │            │
   │              ┌────────────▼──────────┐ │
   │              │ DashboardDataProvider │ │
   │              └────────────┬──────────┘ │
   │                    ┌──────┴──────┐     │
   │                    ▼             ▼     │
   │              ┌──────────┐  ┌─────────┐ │
   │              │ TUI(Ink) │  │ Web API │ │
   │              └──────────┘  └─────────┘ │
   └─────────────────────────────────────────┘
   ```

### Output Format
- Markdown with ASCII diagrams
- Korean comments for internal concepts
- English for technical terms
```

### Acceptance Criteria
- [ ] TUI가 기본 UI로 명시됨
- [ ] DashboardDataProvider 역할 설명 포함
- [ ] 데이터 흐름 다이어그램 포함
- [ ] 기존 tmux 관리 설명 유지

---

## 1.2 Update Architecture Overview

### Context
`docs/architecture/overview.md`는 시스템 전체 구조를 설명하지만 새로운 UI 레이어가 없음.

### Task Description
```yaml
file: docs/architecture/overview.md
action: update
sections_to_update:
  - System Components
  - Layer Architecture
  - Integration Points
```

### Prompt
```markdown
## Task: Update Architecture Overview

### Input Files
- Current: docs/architecture/overview.md
- Reference: src/tui/ directory structure
- Reference: src/core/dashboard-data-provider.ts

### Requirements
1. Layer 구조에 Presentation Layer 추가:
   - TUI Layer (Primary)
   - Web Dashboard Layer (Secondary)
2. 컴포넌트 목록에 추가:
   - `src/tui/` - Terminal UI components
   - `DashboardDataProvider` - Real-time data aggregation
   - `socket-handler.ts` - WebSocket event handling
3. 통합 포인트 설명:
   - CLI ↔ TUI 전환
   - TUI ↔ Orchestrator 이벤트 구독
   - Web ↔ Socket.io 연결

### Output Format
- Hierarchical structure with clear separation
- Code location references (file:line format)
```

### Acceptance Criteria
- [ ] TUI 컴포넌트 구조 문서화
- [ ] DashboardDataProvider 통합 설명
- [ ] 레이어별 책임 명확히 구분

---

## 1.3 Create Dashboard System Document (New)

### Context
대시보드 시스템은 완전히 새로운 기능으로, 전용 문서가 필요함.

### Task Description
```yaml
file: docs/architecture/dashboard-system.md
action: create
sections:
  - Overview
  - Data Provider Architecture
  - TUI Implementation (Ink)
  - Web Dashboard Implementation
  - Event Types & Flow
```

### Prompt
```markdown
## Task: Create Dashboard System Documentation

### Input Files
- src/core/dashboard-data-provider.ts
- src/tui/ink/App.tsx
- src/tui/ink/hooks/useDashboardData.ts
- src/server/dashboard/socket-handler.ts
- src/types/events.ts

### Document Structure

#### 1. Overview
- 목적: 실행 상태 실시간 모니터링
- 두 가지 인터페이스: TUI (기본), Web Dashboard

#### 2. DashboardDataProvider
- 역할: 오케스트레이터 이벤트 수신 → 대시보드 상태 집계
- 주요 메서드:
  - `getState()` - 현재 대시보드 상태 반환
  - `subscribe(callback)` - 상태 변경 구독
- 데이터 구조: DashboardState 타입 정의

#### 3. TUI Implementation
- 기술 스택: Ink (React for CLI)
- 컴포넌트 구조:
  ```
  App.tsx
  ├── Header.tsx
  ├── AgentPanel.tsx
  ├── OutputView.tsx
  ├── ProgressBar.tsx
  └── CRPPrompt.tsx
  ```
- 키바인딩:
  - `q` - 종료
  - `f` - 풀스크린 토글
  - `Tab` - 패널 전환

#### 4. Web Dashboard
- Socket.io 이벤트:
  - `dashboard:state` - 전체 상태 전송
  - `dashboard:update` - 부분 업데이트
  - `agent:output` - 에이전트 출력 스트림
- REST API 엔드포인트 (참조용)

#### 5. Event Flow Diagram
```
Orchestrator Events
       │
       ▼
DashboardDataProvider.handleEvent()
       │
       ├──────────────────┐
       ▼                  ▼
TUI (direct call)    Socket.io emit
       │                  │
       ▼                  ▼
  Ink render()      Web Client
```

### Output Format
- Technical documentation style
- Code snippets with syntax highlighting
- Type definitions inline
```

### Acceptance Criteria
- [ ] DashboardDataProvider 아키텍처 완전 문서화
- [ ] TUI 컴포넌트 구조 다이어그램 포함
- [ ] Socket.io 이벤트 타입 정의 포함
- [ ] 데이터 흐름 시각화

---

## 1.4 Update File Structure Document

### Context
`docs/architecture/file-structure.md`에 새로운 디렉토리가 반영되지 않음.

### Task Description
```yaml
file: docs/architecture/file-structure.md
action: update
additions:
  - src/tui/ directory
  - src/server/dashboard/
  - src/core/dashboard-data-provider.ts
```

### Prompt
```markdown
## Task: Update File Structure Documentation

### Requirements
1. src/tui/ 디렉토리 구조 추가:
   ```
   src/tui/
   ├── index.ts              # TUI 진입점
   ├── app.ts                # TUI 앱 로직
   ├── ink/                  # Ink 컴포넌트
   │   ├── App.tsx
   │   ├── Header.tsx
   │   ├── AgentPanel.tsx
   │   ├── OutputView.tsx
   │   ├── ProgressBar.tsx
   │   ├── CRPPrompt.tsx
   │   └── hooks/
   │       └── useDashboardData.ts
   ├── components/           # 레거시 컴포넌트
   ├── screens/              # 화면 단위 컴포넌트
   ├── state/                # TUI 상태 관리
   └── utils/                # TUI 유틸리티
   ```

2. src/server/dashboard/ 추가:
   ```
   src/server/dashboard/
   └── socket-handler.ts     # Socket.io 이벤트 핸들러
   ```

3. src/core/ 업데이트:
   - dashboard-data-provider.ts 추가 (설명 포함)

### Output Format
- Tree structure with descriptions
- File purpose annotations
```

### Acceptance Criteria
- [ ] src/tui/ 완전 문서화
- [ ] src/server/dashboard/ 추가됨
- [ ] 각 파일 역할 설명 포함

---

# Phase 2: User Guide Updates

> **Priority:** High
> **Estimated Tasks:** 4
> **Dependencies:** Phase 1.3 (Dashboard System Doc)

## 2.1 Update Getting Started Guide

### Context
`docs/guide/getting-started.md`에 TUI 사용법이 없음. 현재 `dure start`는 TUI를 기본으로 실행함.

### Task Description
```yaml
file: docs/guide/getting-started.md
action: update
sections_to_update:
  - Quick Start (TUI 기본값 반영)
  - Running Your First Task (TUI 화면 설명)
  - Monitoring Progress (새 섹션)
```

### Prompt
```markdown
## Task: Update Getting Started Guide

### Input Files
- Current: docs/guide/getting-started.md
- Reference: src/cli/commands/start.ts
- Reference: src/cli/commands/monitor.ts

### Requirements
1. Quick Start 섹션 수정:
   - `dure start` 실행 시 TUI가 기본으로 표시됨을 명시
   - TUI 없이 실행하려면 `--no-tui` 옵션 사용

2. "Running Your First Task" 섹션에 TUI 스크린샷/설명 추가:
   ```
   ┌────────────────────────────────────────┐
   │ Dure Dashboard          run-xxx        │
   ├────────────────────────────────────────┤
   │ Phase: BUILD              Progress: 45%│
   │ ┌──────────────────────────────────┐   │
   │ │ Agent: Builder                   │   │
   │ │ Status: Running                  │   │
   │ │ Output: Implementing feature...  │   │
   │ └──────────────────────────────────┘   │
   │                                        │
   │ [q] Quit  [f] Fullscreen  [Tab] Switch │
   └────────────────────────────────────────┘
   ```

3. 새 섹션 "Monitoring Progress" 추가:
   - TUI 키바인딩 설명
   - 웹 대시보드 대안 (`dure monitor --web`)
   - 풀스크린 모드 활용

### Output Format
- Step-by-step with ASCII mockups
- Command examples with expected output
```

### Acceptance Criteria
- [ ] TUI가 기본값임을 명시
- [ ] TUI 화면 목업 포함
- [ ] 키바인딩 설명 포함
- [ ] 웹 대시보드 대안 언급

---

## 2.2 Create Monitoring Dashboard Guide (New)

### Context
TUI 및 웹 대시보드 사용법을 다루는 전용 가이드가 필요함.

### Task Description
```yaml
file: docs/guide/monitoring-dashboard.md
action: create
sections:
  - Introduction
  - TUI Dashboard
  - Web Dashboard
  - Choosing Between TUI and Web
  - Advanced Features
```

### Prompt
```markdown
## Task: Create Monitoring Dashboard Guide

### Document Structure

#### 1. Introduction
- 대시보드의 목적: 실행 상태 실시간 모니터링
- 두 가지 옵션: TUI (터미널), Web (브라우저)

#### 2. TUI Dashboard

##### 2.1 Starting the TUI
```bash
# 기본 실행 (TUI 포함)
dure start "Your briefing"

# 실행 중인 run 모니터링
dure monitor <run-id>

# TUI 없이 실행
dure start "Your briefing" --no-tui
```

##### 2.2 TUI Layout
```
┌─ Header ─────────────────────────────────┐
│ Run ID: run-xxx    Phase: BUILD          │
├─ Agent Panel ────────────────────────────┤
│ [Refiner]  ✓ Done                        │
│ [Builder]  ● Running (45%)               │
│ [Verifier] ○ Pending                     │
│ [Gatekeeper] ○ Pending                   │
├─ Output View ────────────────────────────┤
│ > Building component...                  │
│ > Created file: src/feature.ts           │
│ > Running tests...                       │
├─ Status Bar ─────────────────────────────┤
│ [q] Quit [f] Fullscreen [Tab] Switch     │
└──────────────────────────────────────────┘
```

##### 2.3 Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `q` | TUI 종료 (실행은 계속됨) |
| `f` | 풀스크린 토글 |
| `Tab` | 패널 간 이동 |
| `↑/↓` | 출력 스크롤 |
| `Enter` | CRP 응답 입력 (프롬프트 시) |

##### 2.4 CRP Handling in TUI
- CRP 발생 시 TUI 하단에 프롬프트 표시
- 직접 응답 입력 가능

#### 3. Web Dashboard

##### 3.1 Starting Web Dashboard
```bash
# 웹 대시보드 모드로 모니터링
dure monitor <run-id> --web

# 또는 별도의 웹 서버 실행
dure server
```

##### 3.2 Features
- 브라우저 기반 UI
- 실시간 업데이트 (Socket.io)
- CRP 응답 웹 폼
- 히스토리 조회

#### 4. Choosing Between TUI and Web

| 상황 | 추천 |
|------|------|
| 로컬 개발 | TUI (빠른 피드백) |
| 원격 서버 | Web (SSH 포워딩) |
| 팀 협업 | Web (공유 URL) |
| CI/CD | Neither (headless) |

#### 5. Advanced Features

##### 5.1 Fullscreen Mode
- `f` 키로 토글
- 전체 화면 출력 보기

##### 5.2 Detached Execution
```bash
# TUI 없이 백그라운드 실행
dure start "briefing" --no-tui

# 나중에 TUI로 연결
dure monitor <run-id>
```

### Output Format
- User-friendly guide style
- ASCII mockups for TUI
- Command examples with expected behavior
```

### Acceptance Criteria
- [ ] TUI 시작 방법 3가지 이상 설명
- [ ] 키바인딩 완전 문서화
- [ ] 웹 대시보드 시작 방법 설명
- [ ] 사용 시나리오별 추천 포함

---

## 2.3 Update Core Concepts

### Context
`docs/guide/core-concepts.md`에 모니터링 개념이 없음.

### Task Description
```yaml
file: docs/guide/core-concepts.md
action: update
sections_to_add:
  - Monitoring & Dashboards
```

### Prompt
```markdown
## Task: Update Core Concepts Document

### Requirements
1. 새 섹션 "Monitoring & Dashboards" 추가:
   - 왜 실시간 모니터링이 중요한지
   - TUI와 Web Dashboard의 역할
   - 이벤트 기반 업데이트 개념

2. 기존 "Execution Flow" 섹션에 모니터링 포인트 추가:
   ```
   REFINE → BUILD → VERIFY → GATE
      │       │        │       │
      ▼       ▼        ▼       ▼
   [Dashboard: Real-time status updates]
   ```

### Output Format
- Conceptual explanation
- Integration with existing concepts
```

### Acceptance Criteria
- [ ] 모니터링 개념 섹션 추가됨
- [ ] 실행 흐름과 통합됨

---

## 2.4 Update Troubleshooting Guide

### Context
`docs/guide/troubleshooting.md`에 TUI/대시보드 관련 이슈가 없음.

### Task Description
```yaml
file: docs/guide/troubleshooting.md
action: update
sections_to_add:
  - TUI Issues
  - Dashboard Connection Issues
```

### Prompt
```markdown
## Task: Update Troubleshooting Guide

### New Sections

#### TUI Issues

##### TUI가 표시되지 않음
- 원인: 터미널이 TTY가 아님 (CI/CD, 파이프)
- 해결: `--no-tui` 옵션 사용 또는 `dure monitor --web`

##### TUI 화면이 깨짐
- 원인: 터미널 크기 문제
- 해결: 터미널 창 크기 조정, `f` 키로 풀스크린

##### 키 입력이 안 됨
- 원인: 다른 프로세스가 입력 캡처
- 해결: TUI 재시작

#### Dashboard Connection Issues

##### Socket.io 연결 실패
- 원인: 서버 미실행 또는 포트 충돌
- 해결: `dure server` 상태 확인, 포트 변경

##### 웹 대시보드 업데이트 안 됨
- 원인: WebSocket 연결 끊김
- 해결: 페이지 새로고침, 서버 재시작

### Output Format
- Problem → Cause → Solution format
- Command examples for solutions
```

### Acceptance Criteria
- [ ] TUI 이슈 최소 3개 문서화
- [ ] 대시보드 연결 이슈 최소 2개 문서화

---

# Phase 3: API & Technical Reference

> **Priority:** Medium
> **Estimated Tasks:** 3
> **Dependencies:** Phase 1.3

## 3.1 Update API Document

### Context
`docs/api.md`에 Socket.io 이벤트와 대시보드 API가 상세히 없음.

### Task Description
```yaml
file: docs/api.md
action: update
sections_to_update:
  - WebSocket Events (확장)
  - Dashboard API (새 섹션)
```

### Prompt
```markdown
## Task: Update API Documentation

### Input Files
- Current: docs/api.md
- Reference: src/server/dashboard/socket-handler.ts
- Reference: src/types/events.ts

### Requirements

#### 1. WebSocket Events 섹션 확장

##### Dashboard Events
| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `dashboard:subscribe` | Client→Server | `{ runId: string }` | 대시보드 구독 |
| `dashboard:state` | Server→Client | `DashboardState` | 전체 상태 전송 |
| `dashboard:update` | Server→Client | `Partial<DashboardState>` | 부분 업데이트 |
| `agent:output` | Server→Client | `{ agent, line }` | 에이전트 출력 |

##### DashboardState Type
```typescript
interface DashboardState {
  runId: string;
  phase: Phase;
  agents: {
    refiner: AgentStatus;
    builder: AgentStatus;
    verifier: AgentStatus;
    gatekeeper: AgentStatus;
  };
  progress: number;
  currentOutput: string[];
  crpPending: boolean;
  crpData?: CRPData;
}
```

#### 2. Dashboard REST API (참조용)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/:runId` | 대시보드 상태 조회 |
| GET | `/api/dashboard/:runId/output` | 최근 출력 조회 |

### Output Format
- API reference style
- Type definitions
- Request/Response examples
```

### Acceptance Criteria
- [ ] Socket.io 이벤트 전체 문서화
- [ ] DashboardState 타입 정의 포함
- [ ] REST API 엔드포인트 문서화

---

## 3.2 Create Socket Events Reference (New)

### Context
Socket.io 이벤트 전용 참조 문서가 필요함.

### Task Description
```yaml
file: docs/api/socket-events.md
action: create
sections:
  - Connection
  - Dashboard Events
  - Agent Events
  - CRP Events
  - Error Handling
```

### Prompt
```markdown
## Task: Create Socket Events Reference

### Document Structure

#### 1. Connection
```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  socket.emit('dashboard:subscribe', { runId: 'run-xxx' });
});
```

#### 2. Dashboard Events

##### dashboard:subscribe
- Direction: Client → Server
- Payload: `{ runId: string }`
- Response: `dashboard:state` event

##### dashboard:state
- Direction: Server → Client
- Payload: Full `DashboardState` object
- When: Initial connection, major state changes

##### dashboard:update
- Direction: Server → Client
- Payload: Partial `DashboardState`
- When: Incremental updates

#### 3. Agent Events

##### agent:start
- Payload: `{ agent: AgentType, timestamp: number }`

##### agent:output
- Payload: `{ agent: AgentType, line: string, timestamp: number }`

##### agent:complete
- Payload: `{ agent: AgentType, success: boolean, timestamp: number }`

#### 4. CRP Events

##### crp:pending
- Payload: `CRPData`
- When: Human judgment required

##### crp:respond
- Direction: Client → Server
- Payload: `{ runId, crpId, response }`

##### crp:resolved
- Direction: Server → Client
- Payload: `{ crpId }`

#### 5. Error Handling
```javascript
socket.on('error', (error) => {
  // { code: string, message: string }
});
```

### Output Format
- Code examples for each event
- TypeScript types
- Sequence diagrams where helpful
```

### Acceptance Criteria
- [ ] 모든 Socket.io 이벤트 문서화
- [ ] 각 이벤트 페이로드 타입 정의
- [ ] 클라이언트 사용 예제 포함

---

## 3.3 Update CLI Reference

### Context
`docs/CLI_REFERENCE.md`는 자동 생성되지만, `docs/api/cli.md`는 수동 업데이트 필요.

### Task Description
```yaml
file: docs/api/cli.md
action: update
commands_to_update:
  - dure start (--no-tui 옵션)
  - dure monitor (상세 설명)
```

### Prompt
```markdown
## Task: Update CLI Reference

### Requirements

#### 1. dure start 업데이트
```bash
dure start <briefing> [options]

Options:
  --model <model>    모델 선택 (default: sonnet)
  --no-tui           TUI 없이 실행
  --web              웹 대시보드 모드
  --verbose          상세 로그
```

설명:
- 기본적으로 TUI 대시보드가 실행됨
- CI/CD 환경에서는 `--no-tui` 권장
- `--web` 옵션으로 웹 대시보드 사용 가능

#### 2. dure monitor 상세화
```bash
dure monitor [run-id] [options]

Arguments:
  run-id             모니터링할 run ID (생략 시 최신)

Options:
  --web              웹 대시보드로 열기
  --port <port>      웹 서버 포트 (default: 3000)
```

사용 예:
```bash
# 최신 run의 TUI 모니터
dure monitor

# 특정 run의 TUI 모니터
dure monitor run-2024-01-15-abc123

# 웹 대시보드로 모니터
dure monitor --web
```

### Output Format
- CLI reference style
- Usage examples
- Option descriptions
```

### Acceptance Criteria
- [ ] `--no-tui` 옵션 문서화
- [ ] `dure monitor` 완전 문서화
- [ ] 사용 예제 포함

---

# Phase 4: Maintenance & Changelog

> **Priority:** Low
> **Estimated Tasks:** 3
> **Dependencies:** Phase 1-3 완료 후

## 4.1 Update CLAUDE.md

### Context
`CLAUDE.md`의 스킬/에이전트 테이블은 업데이트되었지만, 구현 위치 섹션 등이 outdated.

### Task Description
```yaml
file: CLAUDE.md
action: update
sections_to_update:
  - Implementation Locations (src/tui 추가)
  - Tech Stack (Ink 추가)
```

### Prompt
```markdown
## Task: Update CLAUDE.md

### Requirements

#### 1. Tech Stack 업데이트
```markdown
## Tech Stack

- CLI: Node.js + Commander.js
- TUI: Ink (React for CLI)      # NEW
- Web server: Express + Socket.io
- Agents: Claude Code CLI (headless)
- Process management: tmux
- State storage: JSON files
```

#### 2. Implementation Locations 업데이트
```markdown
## Implementation Locations

- CLI: `src/cli/`
- TUI: `src/tui/`               # NEW
  - Ink components: `src/tui/ink/`
  - Dashboard state: `src/tui/state/`
- Core logic: `src/core/`
  - Dashboard data: `src/core/dashboard-data-provider.ts`  # NEW
- Agent prompts: `src/agents/prompt-generator.ts`
- Web server: `src/server/`
  - Dashboard API: `src/server/dashboard/`  # NEW
- Type definitions: `src/types/`
```

### Output Format
- Maintain existing structure
- Add NEW markers for visibility
```

### Acceptance Criteria
- [ ] Tech Stack에 Ink 추가
- [ ] Implementation Locations에 TUI 섹션 추가
- [ ] src/core/dashboard-data-provider.ts 언급

---

## 4.2 Update Changelog

### Context
`docs/misc/changelog.md`의 [Unreleased] 섹션에 새 기능 기록 필요.

### Task Description
```yaml
file: docs/misc/changelog.md
action: update
section: "[Unreleased]"
```

### Prompt
```markdown
## Task: Update Changelog

### [Unreleased] Section Content

#### Added
- TUI Dashboard: Ink 기반 터미널 대시보드 (#commit)
  - 풀스크린 모드 지원
  - 실시간 에이전트 출력 표시
  - CRP 인라인 응답
- `dure monitor` 명령어: 실행 중인 run 모니터링
- Web Dashboard API: Socket.io 기반 실시간 업데이트
- DashboardDataProvider: 대시보드 데이터 집계 레이어
- 새로운 스킬: `/new-agent`, `/new-command`, `/add-event`, `/new-manager`
- 커스텀 에이전트: `reviewer`, `tester`, `security`, `refactorer`, `documenter`

#### Changed
- `dure start`: TUI가 기본 모드로 변경
- 헤드리스 모드: 에이전트 실행 옵션 추가

#### Fixed
- (해당되는 버그 수정 있으면 추가)

### Output Format
- Keep a Changelog format
- Link to commits where applicable
```

### Acceptance Criteria
- [ ] TUI 대시보드 기능 기록
- [ ] monitor 명령어 기록
- [ ] 스킬/에이전트 시스템 기록

---

## 4.3 Review and Cross-link Documents

### Context
새 문서와 기존 문서 간 상호 참조 확인 필요.

### Task Description
```yaml
action: review
files_to_check:
  - All docs/*.md
  - All docs/**/*.md
cross_links_to_add:
  - getting-started.md → monitoring-dashboard.md
  - architecture.md → dashboard-system.md
  - api.md → socket-events.md
```

### Prompt
```markdown
## Task: Review and Add Cross-links

### Requirements
1. 각 문서에서 관련 문서로의 링크 확인
2. 새 문서 (monitoring-dashboard.md, dashboard-system.md, socket-events.md)에 대한 링크 추가
3. 죽은 링크 확인 및 수정

### Cross-links to Add
| From | To | Context |
|------|----|---------|
| getting-started.md | monitoring-dashboard.md | "자세한 내용은..." |
| architecture.md | dashboard-system.md | "대시보드 아키텍처는..." |
| api.md | socket-events.md | "Socket.io 이벤트 상세는..." |
| troubleshooting.md | monitoring-dashboard.md | "TUI 문제 해결은..." |
| README.md (docs) | 새 문서들 | 목차 업데이트 |

### Output
- List of added cross-links
- List of fixed broken links
```

### Acceptance Criteria
- [ ] 모든 새 문서에 대한 링크 추가됨
- [ ] 죽은 링크 없음
- [ ] docs/README.md 목차 업데이트됨

---

# Execution Checklist

## Phase 1: Architecture Documentation
- [ ] 1.1 Update docs/architecture.md
- [ ] 1.2 Update docs/architecture/overview.md
- [ ] 1.3 Create docs/architecture/dashboard-system.md
- [ ] 1.4 Update docs/architecture/file-structure.md

## Phase 2: User Guide Updates
- [ ] 2.1 Update docs/guide/getting-started.md
- [ ] 2.2 Create docs/guide/monitoring-dashboard.md
- [ ] 2.3 Update docs/guide/core-concepts.md
- [ ] 2.4 Update docs/guide/troubleshooting.md

## Phase 3: API & Technical Reference
- [ ] 3.1 Update docs/api.md
- [ ] 3.2 Create docs/api/socket-events.md
- [ ] 3.3 Update docs/api/cli.md

## Phase 4: Maintenance & Changelog
- [ ] 4.1 Update CLAUDE.md
- [ ] 4.2 Update docs/misc/changelog.md
- [ ] 4.3 Review and cross-link documents

---

# Notes

- 각 태스크의 Prompt 섹션을 Claude Code에 직접 붙여넣어 실행 가능
- Acceptance Criteria를 검증 체크리스트로 활용
- Phase 순서대로 진행하되, 같은 Phase 내 태스크는 병렬 가능
