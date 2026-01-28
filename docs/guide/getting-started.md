# 빠른 시작

이 가이드는 Dure을 처음 사용하는 분들을 위한 단계별 튜토리얼입니다.

## 사전 준비

### 1. 필수 도구 설치

#### tmux

Dure은 여러 에이전트를 병렬로 실행하기 위해 tmux를 사용합니다.

<!-- tabs:start -->

#### **macOS**

```bash
brew install tmux
```

#### **Ubuntu/Debian**

```bash
sudo apt-get install tmux
```

#### **CentOS/RHEL**

```bash
sudo yum install tmux
```

<!-- tabs:end -->

설치 확인:

```bash
tmux -V
# tmux 3.3a 또는 그 이상
```

#### Claude CLI

Claude CLI가 설치되어 있고 `claude` 명령어가 동작해야 합니다.

```bash
claude --version
```

?> Claude CLI 설치 방법은 [Anthropic 공식 문서](https://docs.anthropic.com/claude/docs/claude-cli)를 참고하세요.

### 2. Node.js 버전 확인

```bash
node --version
# v18.0.0 이상
```

## 설치

### 1. 저장소 클론

```bash
git clone https://github.com/yourusername/dure.git
cd dure
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 빌드

```bash
npm run build
```

이 명령어는:
- TypeScript 파일을 컴파일합니다
- 웹 서버의 정적 파일을 복사합니다
- 템플릿 파일을 복사합니다

### 4. 전역 설치 (선택사항)

전역으로 설치하면 어디서든 `dure` 명령어를 사용할 수 있습니다:

```bash
npm link
```

## 첫 실행

### 1. 프로젝트 폴더 준비

Dure을 실행할 프로젝트 폴더로 이동합니다:

```bash
cd /path/to/your-project
```

!> Dure은 현재 디렉토리에 `.dure/` 폴더를 생성합니다. Git 저장소에서 실행하는 것을 권장합니다.

### 2. Dure 시작

```bash
# npx 사용 (전역 설치 안 한 경우)
npx dure start

# 또는 전역 설치한 경우
dure start
```

### 3. 웹 대시보드 열기

브라우저가 자동으로 열리고 `http://localhost:3000`에 접속됩니다.

자동으로 열리지 않는 경우 수동으로 접속하세요:

```bash
open http://localhost:3000  # macOS
```

## 첫 Run 실행

### 1. New Run 시작

대시보드에서 **"New Run"** 버튼을 클릭합니다.

### 2. Briefing 작성

간단한 예제로 시작해봅시다:

```markdown
# Hello World 함수 구현

## 요구사항
- `sayHello` 함수 생성
- 파라미터: name (string)
- 반환값: "Hello, {name}!" (string)

## 제약 조건
- TypeScript로 구현
- src/utils/hello.ts 파일에 작성

## 예상 동작
sayHello("World") → "Hello, World!"
sayHello("Alice") → "Hello, Alice!"
```

### 3. Run 시작

**"Start Run"** 버튼을 클릭합니다.

### 4. 진행 상황 모니터링

대시보드에서 실시간으로 에이전트 진행 상황을 확인할 수 있습니다:

```
[✓ Refine] → [● Build] → [ Verify] → [ Gate]
             ↑
         "Building... (1:23)"
```

### 5. 결과 확인

모든 에이전트가 완료되면:

1. **MRP(Merge-Readiness Pack)** 가 생성됩니다
2. 변경 사항, 테스트 결과, 비용 정보를 확인할 수 있습니다
3. **"Approve"** 또는 **"Request Changes"** 를 선택합니다

## CLI 옵션

### 포트 변경

```bash
dure start --port 3001
```

### 브라우저 자동 열기 비활성화

```bash
dure start --no-browser
```

### 현재 상태 확인

```bash
dure status
```

출력 예시:

```
Current Run: run-20240126-143022
Phase: build (iteration 1/3)
Status: running

Agents:
  ✓ Refiner   - completed (35s)
  ● Builder   - running (1:23)
  ○ Verifier  - pending
  ○ Gatekeeper - pending

Usage: $0.058
```

### Run 중지

```bash
dure stop
```

### 히스토리 조회

```bash
dure history
```

출력 예시:

```
Recent Runs:
  run-20240126-143022  PASS      $0.12   2 min ago
  run-20240126-120000  FAIL      $0.08   3 hours ago
  run-20240125-180000  PASS      $0.15   1 day ago
```

## 폴더 구조

Dure 시작 시 프로젝트에 `.dure/` 폴더가 생성됩니다:

```
your-project/
├── src/
├── package.json
└── .dure/
    ├── config/              # 설정 파일
    │   ├── global.json
    │   ├── refiner.json
    │   ├── builder.json
    │   ├── verifier.json
    │   └── gatekeeper.json
    └── runs/                # 실행 기록
        └── run-{timestamp}/
            ├── state.json
            ├── events.log
            ├── briefing/
            ├── builder/
            ├── verifier/
            ├── gatekeeper/
            ├── crp/
            ├── vcr/
            └── mrp/
```

?> `.dure/` 폴더를 `.gitignore`에 추가할 수 있지만, 실행 기록을 유지하려면 커밋하는 것도 좋습니다.

## tmux 세션

Dure은 각 Run마다 tmux 세션을 생성합니다:

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

tmux 세션에 접속하여 에이전트 출력을 직접 확인할 수 있습니다:

```bash
tmux attach-session -t dure-run-20240126-143022
```

세션에서 나오기: `Ctrl-b` + `d` (detach)

## 다음 단계

- [Briefing 작성 가이드](/guide/writing-briefings.md) - 효과적인 Briefing 작성 방법
- [에이전트 이해하기](/guide/understanding-agents.md) - 각 에이전트의 역할과 동작 원리
- [설정 파일](/api/configuration.md) - 에이전트 설정 커스터마이징

## 문제 해결

문제가 발생한 경우 [문제 해결 가이드](/guide/troubleshooting.md)를 참고하세요.
