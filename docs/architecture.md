# Orchestral - 시스템 아키텍처

## 시스템 개요

```
┌─────────────────────────────────────────────────────────────┐
│                         orchestral                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   CLI (orchestral start)                                     │
│         │                                                    │
│         ▼                                                    │
│   ┌─────────────┐         ┌─────────────────────────────┐   │
│   │ ACE Web     │◄───────►│ .orchestral/                │   │
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
│                    orchestral-run-{timestamp}                 │
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
SESSION="orchestral-run-$1"

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
  --prompt-file .orchestral/runs/{run_id}/prompts/refiner.md
```

**Pane 1 (Builder):**
```bash
cd {project_root} && claude --dangerously-skip-permissions \
  --model {config.builder.model} \
  --prompt-file .orchestral/runs/{run_id}/prompts/builder.md
```

**Pane 2 (Verifier):**
```bash
cd {project_root} && claude --dangerously-skip-permissions \
  --model {config.verifier.model} \
  --prompt-file .orchestral/runs/{run_id}/prompts/verifier.md
```

**Pane 3 (Gatekeeper):**
```bash
cd {project_root} && claude --dangerously-skip-permissions \
  --model {config.gatekeeper.model} \
  --prompt-file .orchestral/runs/{run_id}/prompts/gatekeeper.md
```

**Pane 4 (Debug Shell):** 대기 상태 - 인간 개입용

**Pane 5 (ACE Server):**
```bash
cd {project_root} && node .orchestral/server/index.js --port {config.web_port}
```

### 프롬프트 파일 구조

```
.orchestral/runs/{run_id}/prompts/
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
while [ ! -f ".orchestral/runs/{run_id}/builder/done.flag" ]; do
  sleep 2
done

# 방법 2: inotifywait (효율적)
inotifywait -e create ".orchestral/runs/{run_id}/builder/"
```

### tmux send-keys를 통한 명령어 주입

```bash
# Refiner 시작
tmux send-keys -t orchestral-run-{timestamp}:main.0 \
  "claude --dangerously-skip-permissions --model haiku --prompt-file .orchestral/runs/{run_id}/prompts/refiner.md" Enter

# Builder 시작 (Refiner 완료 후)
tmux send-keys -t orchestral-run-{timestamp}:main.1 \
  "claude --dangerously-skip-permissions --model sonnet --prompt-file .orchestral/runs/{run_id}/prompts/builder.md" Enter
```

### 재시도 시 컨텍스트 초기화

Gatekeeper가 FAIL 판정 시:

1. `state.json`의 `iteration` 증가
2. Builder pane에 `/clear` 명령으로 컨텍스트 초기화
3. 트리거 메시지로 재시작 유도

```bash
tmux send-keys -t orchestral-run-{timestamp}:main.1 "/clear" Enter
sleep 2
tmux send-keys -t orchestral-run-{timestamp}:main.1 \
  "iteration 2를 시작합니다. prompts/builder.md를 읽고 작업을 재개하세요." Enter
```

### CRP 발생 시 흐름

1. 에이전트가 `crp/crp-{n}.json` 생성
2. ACE 서버가 파일 감지 (inotify 또는 폴링)
3. 웹 UI에 알림 표시
4. 인간이 응답 → `vcr/vcr-{n}.json` 생성
5. ACE 서버가 VCR 감지 → 해당 에이전트 `/clear` 후 재시작
