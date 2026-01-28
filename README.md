# Dure

> Named after the Korean tradition of "두레" (cooperative farming),
> where villagers work together with distinct roles toward a shared goal.

[![CI](https://github.com/choo121600/dure/actions/workflows/ci.yml/badge.svg)](https://github.com/choo121600/dure/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/choo121600/dure/branch/main/graph/badge.svg)](https://codecov.io/gh/choo121600/dure)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 의도를 입력하면, 네 개의 에이전트가 순차적으로 실행되고, 인간은 증거를 보고 결정만 하는 엔지니어링 시스템

Agentic Software Engineering MVP - 4개의 AI 에이전트가 코드를 생성하고, 인간은 판단만 하는 시스템입니다.

## 요구 사항

- **Node.js** 18.0.0 이상
- **tmux** (터미널 멀티플렉서)
- **Claude CLI** (`claude` 명령어가 설치되어 있어야 함)

### tmux 설치

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# CentOS/RHEL
sudo yum install tmux
```

## 설치

```bash
# 저장소 클론
git clone <repository-url>
cd dure

# 의존성 설치
npm install

# 빌드
npm run build

# 전역 설치 (선택사항)
npm link
```

## 사용법

### 기본 사용

```bash
# 프로젝트 폴더로 이동
cd /path/to/your-project

# Dure 시작
npx dure start

# 또는 전역 설치했다면
dure start
```

브라우저가 자동으로 열리고 대시보드(http://localhost:3000)가 표시됩니다.

### CLI 옵션

```bash
# 포트 지정
dure start --port 3001

# 브라우저 자동 열기 비활성화
dure start --no-browser

# 현재 실행 상태 확인
dure status

# 실행 중인 run 중지
dure stop

# 과거 run 목록
dure history

# 중단된 run 복구
dure recover [run-id]

# 중단된 run 목록 확인
dure recover --list
```

## 워크플로우

### 1. 새 Run 시작

1. 대시보드에서 "New Run" 클릭
2. Briefing 작성 (Markdown 지원)
3. "Start Run" 클릭

### 2. 에이전트 파이프라인

```
Refiner → Builder → Verifier → Gatekeeper
   ↓         ↓          ↓          ↓
briefing  코드 생성   테스트    최종 판정
  검토                 실행
```

- **Refiner**: Briefing을 검토하고 개선
- **Builder**: 코드 구현
- **Verifier**: 테스트 생성 및 실행
- **Gatekeeper**: 최종 검토 및 판정

### 3. 인간 개입 (CRP)

에이전트가 판단이 필요한 상황을 만나면 **CRP(Consultation Request Pack)**를 생성합니다:

1. 대시보드에 알림 표시
2. CRP 페이지에서 옵션 선택
3. 결정 사유 입력 (선택)
4. 제출 후 에이전트 재시작

### 4. 최종 검토 (MRP)

Gatekeeper가 PASS 판정을 내리면 **MRP(Merge-Readiness Pack)**가 생성됩니다:

1. 변경 사항 요약
2. 테스트 결과 확인
3. Approve 또는 Request Changes

## Briefing 작성 가이드

좋은 Briefing 예시:

```markdown
# Rate Limiter 미들웨어 구현

## 요구사항
- Express.js 미들웨어로 구현
- IP 기반 요청 제한
- 분당 60회 제한
- 429 응답 시 Retry-After 헤더 포함

## 제약 조건
- 외부 라이브러리 사용 금지 (express-rate-limit 등)
- 인메모리 저장소 사용

## 예상 동작
- 정상 요청: 다음 미들웨어로 전달
- 제한 초과: 429 Too Many Requests 응답
```

### 피해야 할 표현

다음 표현들은 CRP를 트리거합니다:
- "적당히", "알아서", "합리적으로"
- "적절한", "reasonable", "appropriate"

구체적인 수치와 명확한 요구사항을 작성하세요.

## 폴더 구조

Dure 실행 시 프로젝트에 `.dure/` 폴더가 생성됩니다:

```
.dure/
├── config/           # 에이전트 설정
│   ├── global.json
│   ├── refiner.json
│   ├── builder.json
│   ├── verifier.json
│   └── gatekeeper.json
│
└── runs/             # 실행 기록
    └── run-{timestamp}/
        ├── state.json        # 현재 상태
        ├── briefing/         # Briefing 파일
        ├── builder/          # Builder 출력
        ├── verifier/         # 테스트 결과
        ├── gatekeeper/       # 판정 결과
        ├── crp/              # 인간 질의
        ├── vcr/              # 인간 응답
        └── mrp/              # 최종 결과물
```

## 설정

Settings 페이지 또는 `.dure/config/` 파일을 직접 수정하여 설정을 변경할 수 있습니다.

### 주요 설정

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `global.max_iterations` | 3 | 최대 재시도 횟수 |
| `global.web_port` | 3000 | 웹 서버 포트 |
| `refiner.model` | haiku | Refiner 모델 |
| `builder.model` | sonnet | Builder 모델 |
| `verifier.model` | haiku | Verifier 모델 |
| `gatekeeper.model` | sonnet | Gatekeeper 모델 |

### 모델 선택

- **haiku**: 빠른 응답, 간단한 작업에 적합
- **sonnet**: 균형 잡힌 성능 (권장)
- **opus**: 최고 품질, 복잡한 작업에 적합

## tmux 세션

Dure는 tmux를 사용하여 에이전트를 병렬 실행합니다:

```
┌──────────┬──────────┬──────────┬──────────┐
│ Refiner  │ Builder  │ Verifier │Gatekeeper│
│ (pane 0) │ (pane 1) │ (pane 2) │ (pane 3) │
├──────────┴──────────┴──────────┴──────────┤
│              Debug Shell (pane 4)          │
├────────────────────────────────────────────┤
│              ACE Server (pane 5)           │
└────────────────────────────────────────────┘
```

tmux 세션에 직접 접속하려면:

```bash
tmux attach-session -t dure-run-{timestamp}
```

## 문제 해결

### "tmux is not installed" 오류

tmux를 설치하세요:
```bash
brew install tmux  # macOS
```

### "claude command not found" 오류

Claude CLI가 설치되어 있고 PATH에 포함되어 있는지 확인하세요.

### 에이전트가 멈춤

1. tmux 세션에 접속하여 에이전트 상태 확인
2. `dure stop`으로 중지 후 재시작
3. Debug Shell (pane 4)에서 직접 디버깅

### 포트 충돌

```bash
dure start --port 3001
```

## 문서

상세한 문서는 [공식 문서 사이트](https://choo121600.github.io/dure/)를 참고하세요.

- [빠른 시작](https://choo121600.github.io/dure/#/guide/getting-started)
- [Briefing 작성 가이드](https://choo121600.github.io/dure/#/guide/writing-briefings)
- [아키텍처](https://choo121600.github.io/dure/#/architecture/overview)
- [API 레퍼런스](https://choo121600.github.io/dure/#/api/cli)

### 로컬에서 문서 확인

```bash
# Docsify CLI 설치
npm install -g docsify-cli

# 문서 서버 실행
docsify serve docs

# http://localhost:3000 접속
```

## 라이선스

MIT

## 기여

이슈와 PR을 환영합니다. 자세한 내용은 [기여 가이드](https://yourusername.github.io/dure/#/misc/contributing)를 참고하세요.
