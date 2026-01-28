# Dure - 시스템 아키텍처

## 시스템 개요

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
│         │ Run 시작                     │                     │
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

## 실행 흐름

### Phase 다이어그램

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
     │              │        [인간 검토]      │    [인간 응답]   │
     │              │             │          │         │        │
     │              └─────────────┼──────────┘         │        │
     │                            │                    │        │
     │                            ▼                    │        │
     │                        [완료]                   │        │
     │                                                 │        │
     └─────────────────────────────────────────────────┘        │
                                                                │
     iteration < max_iterations ────────────────────────────────┘
```

### 상세 흐름

```
T0   인간: briefing/raw.md 작성
     state = { phase: "refine", iteration: 1 }

T1   Refiner 실행
     ├─ 충분 → refined.md, phase: "build"
     ├─ 개선 → refined.md + log.md, phase: "build"
     └─ 모호 → crp/ 생성, phase: "waiting_human"

T2   Builder 실행
     - refined.md 읽음
     - output/에 코드 생성
     - done.flag 생성
     - phase: "verify"

T3   Verifier 실행
     - builder/done.flag 감지 후 시작
     - tests/ 생성, 테스트 실행
     - results.json 기록
     - done.flag 생성
     - phase: "gate"

T4   Gatekeeper 실행
     - 전체 아티팩트 검토
     - verdict.json 작성
     ├─ PASS → mrp/ 생성, phase: "ready_for_merge"
     ├─ FAIL → review.md, phase: "build", iteration++
     └─ NEEDS_HUMAN → crp/ 생성, phase: "waiting_human"

T5   [PASS] 인간: MRP 검토 → 승인 또는 피드백
     [FAIL] Builder 재시작 (review.md 참조)
     [NEEDS_HUMAN] 인간: VCR 작성 → 해당 단계 재시작
```

## tmux 세션 구성

### 레이아웃

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

### 생성 스크립트

```bash
#!/bin/bash
SESSION="dure-run-$1"

tmux new-session -d -s $SESSION -n main

# 4개 에이전트 pane
tmux split-window -h -t $SESSION:main
tmux split-window -h -t $SESSION:main.0
tmux split-window -h -t $SESSION:main.2

# Debug shell
tmux split-window -v -t $SESSION:main.0
tmux join-pane -v -s $SESSION:main.1 -t $SESSION:main.4

# ACE server
tmux split-window -v -t $SESSION:main.4

# 레이아웃 조정
tmux select-layout -t $SESSION:main tiled
```

## 에이전트 실행 명세

### 실행 흐름 개요

```
tmux pane 생성
       │
       ▼
claude --dangerously-skip-permissions 실행
       │
       ▼
프롬프트 파일 경로 전달 (--prompt-file)
       │
       ▼
에이전트 작업 시작
       │
       ▼
done.flag 생성 → 다음 에이전트 트리거
```

### 각 pane 실행 명령어

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

**Pane 4 (Debug Shell):** 대기 상태 - 인간 개입용

**Pane 5 (ACE Server):**
```bash
cd {project_root} && node .dure/server/index.js --port {config.web_port}
```

### 프롬프트 파일 구조

```
.dure/runs/{run_id}/prompts/
├── refiner.md
├── builder.md
├── verifier.md
└── gatekeeper.md
```

프롬프트 템플릿은 `src/agents/prompt-generator.ts`에 구현되어 있음.

### 에이전트 트리거 메커니즘

순차 실행을 위한 done.flag 감지 방식:

```bash
# 방법 1: 폴링 (단순)
while [ ! -f ".dure/runs/{run_id}/builder/done.flag" ]; do
  sleep 2
done

# 방법 2: inotifywait (효율적)
inotifywait -e create ".dure/runs/{run_id}/builder/"
```

### tmux send-keys를 통한 명령어 주입

```bash
# Refiner 시작
tmux send-keys -t dure-run-{timestamp}:main.0 \
  "claude --dangerously-skip-permissions --model haiku --prompt-file .dure/runs/{run_id}/prompts/refiner.md" Enter

# Builder 시작 (Refiner 완료 후)
tmux send-keys -t dure-run-{timestamp}:main.1 \
  "claude --dangerously-skip-permissions --model sonnet --prompt-file .dure/runs/{run_id}/prompts/builder.md" Enter
```

### 재시도 시 컨텍스트 초기화

Gatekeeper가 FAIL 판정 시:

1. `state.json`의 `iteration` 증가
2. Builder pane에 `/clear` 명령으로 컨텍스트 초기화
3. 트리거 메시지로 재시작 유도

```bash
tmux send-keys -t dure-run-{timestamp}:main.1 "/clear" Enter
sleep 2
tmux send-keys -t dure-run-{timestamp}:main.1 \
  "iteration 2를 시작합니다. prompts/builder.md를 읽고 작업을 재개하세요." Enter
```

### CRP 발생 시 흐름

1. 에이전트가 `crp/crp-{n}.json` 생성
2. ACE 서버가 파일 감지 (inotify 또는 폴링)
3. 웹 UI에 알림 표시
4. 인간이 응답 → `vcr/vcr-{n}.json` 생성
5. ACE 서버가 VCR 감지 → 해당 에이전트 `/clear` 후 재시작

## 코어 클래스 구조

### Orchestrator 책임 분리

Orchestrator의 책임을 여러 전문 클래스로 분리하여 단일 책임 원칙(SRP)을 준수합니다.

```
src/core/
├── orchestrator.ts           # 조율 역할만 담당 (진입점)
├── run-lifecycle-manager.ts  # 런 생성/재개/중지 관리
├── agent-coordinator.ts      # 에이전트 시작/완료/전환 조정
├── error-recovery-service.ts # 에러 감지/재시도 로직
├── verdict-handler.ts        # Gatekeeper 판정 처리 (PASS/FAIL/NEEDS_HUMAN)
├── agent-lifecycle-manager.ts # 개별 에이전트 생명주기 관리
├── phase-transition-manager.ts # 페이즈 전환 상태 관리
├── event-coordinator.ts      # 이벤트 수집 및 조정
└── interrupt-recovery.ts     # 중단된 런 복구
```

### 클래스 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                      Orchestrator                            │
│ - 이벤트 발행 (EventEmitter)                                 │
│ - 공개 API 제공                                              │
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

서버 종료 시 안전한 상태 저장을 위한 구조:

```
┌─────────────────────────────────────────────────────────────┐
│                   GracefulShutdown                           │
├─────────────────────────────────────────────────────────────┤
│ 1. 새로운 요청 거부 시작                                      │
│ 2. 진행 중인 HTTP 요청 완료 대기                             │
│ 3. WebSocket 연결에 종료 알림 전송                           │
│ 4. 진행 중인 런 상태 저장 (phase: 'interrupted')             │
│ 5. tmux 세션 유지 (에이전트 계속 실행 가능)                  │
│ 6. 파일 워처 정리                                            │
│ 7. 서버 종료                                                 │
└─────────────────────────────────────────────────────────────┘
```

### 인터럽트 복구

서버 재시작 시 중단된 런을 복구하는 구조:

```
┌─────────────────────────────────────────────────────────────┐
│                   InterruptRecovery                          │
├─────────────────────────────────────────────────────────────┤
│ detectInterruptedRuns()                                      │
│   └─ .dure/runs/ 스캔                                  │
│   └─ phase: 'interrupted' 런 식별                            │
│                                                              │
│ 복구 전략:                                                   │
│   - refine/build/verify: 해당 에이전트 재시작                │
│   - gate: Gatekeeper 재시작                                  │
│   - waiting_human: 그대로 대기                               │
└─────────────────────────────────────────────────────────────┘
```
