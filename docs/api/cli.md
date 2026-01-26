# CLI 명령어

Orchestral CLI의 모든 명령어와 옵션을 설명합니다.

## 설치

```bash
# npm으로 전역 설치
npm install -g orchestral

# 또는 로컬 설치
npm install orchestral

# 또는 npx 사용 (설치 없이)
npx orchestral [command]
```

## orchestral start

Orchestral을 시작합니다.

### 기본 사용

```bash
orchestral start [options]
```

### 옵션

| 옵션 | 짧은 형식 | 기본값 | 설명 |
|------|----------|--------|------|
| `--port <number>` | `-p` | 3000 | 웹 서버 포트 |
| `--no-browser` | - | false | 브라우저 자동 열기 비활성화 |
| `--config <path>` | `-c` | `.orchestral/config` | 설정 파일 경로 |
| `--log-level <level>` | `-l` | `info` | 로그 레벨 (debug/info/warn/error) |

### 예시

```bash
# 기본 실행
orchestral start

# 포트 변경
orchestral start --port 3001

# 브라우저 자동 열기 비활성화
orchestral start --no-browser

# 디버그 로그
orchestral start --log-level debug

# 복합
orchestral start -p 3001 --no-browser
```

### 동작

1. `.orchestral/` 폴더가 없으면 생성
2. 설정 파일이 없으면 기본값으로 생성
3. tmux 세션 생성 (pane 구조)
4. 웹 서버 시작 (포트 3000)
5. 브라우저 열기 (옵션에 따라)

### 출력

```
🎼 Orchestral starting...

✓ Configuration initialized
✓ Tmux session created (orchestral-run-20240126-143022)
✓ Web server started at http://localhost:3000

Opening browser...

Press Ctrl+C to stop
```

## orchestral status

현재 실행 중인 Run의 상태를 확인합니다.

### 기본 사용

```bash
orchestral status [options]
```

### 옵션

| 옵션 | 짧은 형식 | 기본값 | 설명 |
|------|----------|--------|------|
| `--json` | - | false | JSON 형식으로 출력 |
| `--watch` | `-w` | false | 실시간 모니터링 (1초마다 갱신) |

### 예시

```bash
# 현재 상태 확인
orchestral status

# JSON 형식
orchestral status --json

# 실시간 모니터링
orchestral status --watch
```

### 출력 (일반)

```
Current Run: run-20240126-143022
Phase: build (iteration 1/3)
Status: running
Started: 2024-01-26 14:30:22 (5 minutes ago)

Agents:
  ✓ Refiner    completed  (35s)   $0.002
  ● Builder    running    (2:15)  $0.058
  ○ Verifier   pending
  ○ Gatekeeper pending

Usage:
  Input tokens:  17,400
  Output tokens: 5,000
  Total cost:    $0.060

Pending CRP: None
```

### 출력 (JSON)

```json
{
  "run_id": "run-20240126-143022",
  "phase": "build",
  "iteration": 1,
  "max_iterations": 3,
  "status": "running",
  "started_at": "2024-01-26T14:30:22Z",
  "elapsed_ms": 300000,
  "agents": {
    "refiner": {
      "status": "completed",
      "duration_ms": 35000,
      "cost_usd": 0.002
    },
    "builder": {
      "status": "running",
      "elapsed_ms": 135000,
      "cost_usd": 0.058
    },
    "verifier": {
      "status": "pending"
    },
    "gatekeeper": {
      "status": "pending"
    }
  },
  "usage": {
    "total_input_tokens": 17400,
    "total_output_tokens": 5000,
    "total_cost_usd": 0.060
  },
  "pending_crp": null
}
```

### 출력 (Run 없음)

```
No active run

Use 'orchestral start' to begin
```

## orchestral stop

현재 실행 중인 Run을 중지합니다.

### 기본 사용

```bash
orchestral stop [options]
```

### 옵션

| 옵션 | 짧은 형식 | 기본값 | 설명 |
|------|----------|--------|------|
| `--force` | `-f` | false | 강제 종료 (에이전트 응답 대기 없이) |

### 예시

```bash
# 정상 종료
orchestral stop

# 강제 종료
orchestral stop --force
```

### 동작

1. 현재 실행 중인 에이전트에 종료 신호 전송
2. 에이전트 완료 대기 (최대 30초)
3. tmux 세션 종료
4. 웹 서버 종료

### 출력

```
Stopping run-20240126-143022...

✓ Builder stopped
✓ Tmux session killed
✓ Web server stopped

Run stopped successfully
```

## orchestral history

과거 Run 목록을 조회합니다.

### 기본 사용

```bash
orchestral history [options]
```

### 옵션

| 옵션 | 짧은 형식 | 기본값 | 설명 |
|------|----------|--------|------|
| `--limit <number>` | `-n` | 10 | 표시할 Run 개수 |
| `--filter <status>` | - | all | 필터 (all/pass/fail/running) |
| `--json` | - | false | JSON 형식 출력 |

### 예시

```bash
# 최근 10개 Run
orchestral history

# 최근 20개 Run
orchestral history --limit 20

# PASS만 보기
orchestral history --filter pass

# FAIL만 보기
orchestral history --filter fail

# JSON 형식
orchestral history --json
```

### 출력

```
Recent Runs:

run-20240126-150000  ✓ PASS   $0.124  10 min ago   "Add rate limiter"
run-20240126-143022  ✓ PASS   $0.095  2 hours ago  "Refactor UserService"
run-20240126-120000  ✗ FAIL   $0.082  5 hours ago  "Add authentication"
run-20240125-180000  ● RUN    $0.050  running      "Fix bug in API"
run-20240125-150000  ✓ PASS   $0.145  1 day ago    "Add user API"

Total: 5 runs
```

### 출력 (JSON)

```json
{
  "runs": [
    {
      "run_id": "run-20240126-150000",
      "status": "completed",
      "verdict": "PASS",
      "cost_usd": 0.124,
      "started_at": "2024-01-26T15:00:00Z",
      "completed_at": "2024-01-26T15:10:00Z",
      "duration_ms": 600000,
      "briefing_title": "Add rate limiter"
    },
    ...
  ],
  "total": 5
}
```

## orchestral logs

Run의 로그를 실시간으로 확인합니다.

### 기본 사용

```bash
orchestral logs [run_id] [options]
```

### 옵션

| 옵션 | 짧은 형식 | 기본값 | 설명 |
|------|----------|--------|------|
| `--follow` | `-f` | false | 실시간 로그 팔로우 (tail -f) |
| `--agent <name>` | `-a` | all | 특정 에이전트 로그만 |
| `--lines <number>` | `-n` | 100 | 표시할 줄 수 |

### 예시

```bash
# 현재 Run 로그
orchestral logs

# 특정 Run 로그
orchestral logs run-20240126-143022

# 실시간 팔로우
orchestral logs --follow

# Builder 로그만
orchestral logs --agent builder

# 최근 50줄
orchestral logs --lines 50
```

### 출력

```
=== Events Log (run-20240126-143022) ===

2024-01-26T14:30:22Z [INFO] run.started run_id=run-20240126-143022
2024-01-26T14:30:25Z [INFO] agent.started agent=refiner
2024-01-26T14:31:00Z [INFO] agent.completed agent=refiner duration_ms=35000
2024-01-26T14:31:00Z [INFO] phase.changed from=refine to=build
2024-01-26T14:31:05Z [INFO] agent.started agent=builder
2024-01-26T14:32:30Z [INFO] usage.updated agent=builder input=15300 output=4200
...
```

## orchestral clean

오래된 Run을 정리합니다.

### 기본 사용

```bash
orchestral clean [options]
```

### 옵션

| 옵션 | 짧은 형식 | 기본값 | 설명 |
|------|----------|--------|------|
| `--days <number>` | `-d` | 30 | N일 이전 Run 삭제 |
| `--status <status>` | - | - | 특정 상태만 삭제 (fail/pass) |
| `--dry-run` | - | false | 실제 삭제 없이 목록만 표시 |
| `--force` | `-f` | false | 확인 없이 삭제 |

### 예시

```bash
# 30일 이전 Run 삭제 (대화형)
orchestral clean

# 7일 이전 Run 삭제
orchestral clean --days 7

# FAIL Run만 삭제
orchestral clean --status fail

# Dry run (실제 삭제 안 함)
orchestral clean --dry-run

# 확인 없이 삭제
orchestral clean --force
```

### 출력

```
Runs to be deleted:

run-20240101-120000  FAIL  30 days ago  1.2 MB
run-20240105-150000  FAIL  25 days ago  850 KB
run-20240110-180000  PASS  20 days ago  1.5 MB

Total: 3 runs (3.5 MB)

Delete these runs? (y/N):
```

## orchestral delete

특정 Run을 삭제합니다.

### 기본 사용

```bash
orchestral delete <run_id> [options]
```

### 옵션

| 옵션 | 짧은 형식 | 기본값 | 설명 |
|------|----------|--------|------|
| `--force` | `-f` | false | 확인 없이 삭제 |

### 예시

```bash
# 특정 Run 삭제
orchestral delete run-20240126-143022

# 확인 없이 삭제
orchestral delete run-20240126-143022 --force
```

### 출력

```
Run: run-20240126-143022
Status: PASS
Size: 1.2 MB

Delete this run? (y/N):
```

## orchestral config

설정을 확인하거나 수정합니다.

### 기본 사용

```bash
orchestral config [command] [options]
```

### 서브 명령어

#### show

설정 확인:

```bash
# 전체 설정
orchestral config show

# 특정 에이전트 설정
orchestral config show refiner
orchestral config show builder

# JSON 형식
orchestral config show --json
```

#### set

설정 변경:

```bash
# 전역 설정
orchestral config set global.max_iterations 5

# 에이전트 모델 변경
orchestral config set builder.model opus

# 타임아웃 변경
orchestral config set global.timeouts.builder 900000
```

#### reset

설정 초기화:

```bash
# 전체 초기화
orchestral config reset

# 특정 에이전트만
orchestral config reset builder
```

## orchestral version

버전 정보 확인:

```bash
orchestral version
# orchestral v0.1.0
```

또는:

```bash
orchestral --version
# orchestral v0.1.0
```

## orchestral help

도움말 확인:

```bash
# 전체 명령어 목록
orchestral help

# 특정 명령어 도움말
orchestral help start
orchestral help status
```

## 환경 변수

Orchestral은 다음 환경 변수를 지원합니다:

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `ORCHESTRAL_PORT` | 웹 서버 포트 | 3000 |
| `ORCHESTRAL_LOG_LEVEL` | 로그 레벨 | info |
| `ORCHESTRAL_CONFIG_DIR` | 설정 디렉토리 | .orchestral/config |

예시:

```bash
ORCHESTRAL_PORT=3001 orchestral start
```

## 종료 코드

| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 일반 에러 |
| 2 | 설정 에러 |
| 3 | tmux 에러 |
| 4 | 웹 서버 에러 |

## 다음 단계

- [설정 파일](/api/configuration.md) - 설정 파일 상세
- [웹 API](/api/web-api.md) - HTTP API 엔드포인트
- [문제 해결](/guide/troubleshooting.md) - CLI 문제 해결
