# Orchestral

> **의도를 입력하면, 네 개의 에이전트가 순차적으로 실행되고,
> 인간은 증거를 보고 결정만 하는 엔지니어링 시스템**

"Agentic Software Engineering" 패러다임의 **MVP** 검증 프로젝트.

## 핵심 원칙

1. **인간은 판단 노드다** - 작업자가 아니라 결정권자
2. **궤적(Trajectory)이 1급 산출물** - 결과물보다 도달 과정이 중요
3. **재현 가능해야 한다** - 모든 실행은 로그로 기록
4. **파일 기반 조율** - 에이전트 간 통신은 파일시스템으로

## 에이전트

| 에이전트 | 역할 | 모델 |
|---------|------|------|
| Refiner | Briefing 검토 및 개선 | haiku |
| Builder | 코드 구현 | sonnet |
| Verifier | 테스트 생성/실행, 반례 탐색 | haiku |
| Gatekeeper | 코드 리뷰, 최종 판정 | sonnet |

## 실행 흐름

```
REFINE → BUILD → VERIFY → GATE
                           │
         ├─ PASS → MRP (인간 검토)
         ├─ FAIL → BUILD 재시도
         └─ NEEDS_HUMAN → CRP (인간 응답)
```

## 기술 스택

- CLI: Node.js + Commander.js
- 웹서버: Express + Socket.io
- 에이전트: Claude Code CLI (headless)
- 프로세스 관리: tmux
- 상태 저장: JSON 파일

## 폴더 구조

```
.orchestral/
├── config/          # 에이전트별 설정
└── runs/
    └── run-{timestamp}/
        ├── state.json
        ├── briefing/    # raw.md, refined.md
        ├── builder/     # output/, done.flag
        ├── verifier/    # tests/, results.json
        ├── gatekeeper/  # verdict.json
        ├── crp/         # 인간 판단 요청
        ├── vcr/         # 인간 응답
        └── mrp/         # 최종 산출물
```

## 상세 문서

| 문서 | 내용 |
|------|------|
| [docs/architecture.md](docs/architecture.md) | 시스템 아키텍처, 실행 흐름, tmux 구성, 에이전트 실행 명세 |
| [docs/agents.md](docs/agents.md) | 에이전트별 상세 정의, 입출력, 행동 규칙 |
| [docs/data-formats.md](docs/data-formats.md) | state.json, CRP, VCR, MRP 포맷, 설정 파일 |
| [docs/api.md](docs/api.md) | CLI 명령어, 웹서버 API, WebSocket 이벤트, 알림 시스템 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 구현 우선순위, 기술 스택, 성공 기준 |

## 구현 위치

- CLI: `src/cli/`
- 코어 로직: `src/core/` (orchestrator, state-manager, tmux-manager, file-watcher)
- 에이전트 프롬프트: `src/agents/prompt-generator.ts`
- 웹서버: `src/server/`
- 타입 정의: `src/types/`
