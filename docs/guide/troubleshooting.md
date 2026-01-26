# 문제 해결

Orchestral 사용 중 발생할 수 있는 문제와 해결 방법입니다.

## 설치 및 실행 문제

### "tmux is not installed"

**증상:**

```bash
Error: tmux is not installed
```

**해결:**

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

### "claude command not found"

**증상:**

```bash
Error: claude command not found
Please install Claude CLI first
```

**해결:**

1. Claude CLI가 설치되어 있는지 확인:

```bash
which claude
```

2. 없다면 설치: [Claude CLI 공식 문서](https://docs.anthropic.com/claude/docs/claude-cli)

3. PATH 확인:

```bash
echo $PATH | grep -o '/usr/local/bin'
```

### "Port 3000 is already in use"

**증상:**

```bash
Error: Port 3000 is already in use
```

**해결:**

다른 포트로 시작:

```bash
orchestral start --port 3001
```

또는 3000 포트를 사용 중인 프로세스 종료:

```bash
# macOS/Linux
lsof -ti:3000 | xargs kill

# 또는 강제 종료
lsof -ti:3000 | xargs kill -9
```

## 에이전트 실행 문제

### 에이전트가 시작하지 않음

**증상:**

대시보드에서 에이전트가 `pending` 상태로 유지됨

**진단:**

1. tmux 세션 확인:

```bash
tmux list-sessions | grep orchestral
```

2. tmux 세션에 접속하여 에러 확인:

```bash
tmux attach-session -t orchestral-run-{timestamp}
```

3. 에이전트 pane 확인:
   - Refiner: pane 0
   - Builder: pane 1
   - Verifier: pane 2
   - Gatekeeper: pane 3

**해결:**

대부분 Claude CLI 권한 문제입니다:

```bash
# Run 중지
orchestral stop

# 재시작
orchestral start
```

### 에이전트가 멈춤 (timeout)

**증상:**

에이전트가 `running` 상태로 오래 유지됨

**기본 타임아웃:**

| 에이전트 | 타임아웃 |
|---------|---------|
| Refiner | 5분 |
| Builder | 10분 |
| Verifier | 5분 |
| Gatekeeper | 5분 |

**진단:**

1. 대시보드에서 경과 시간 확인
2. tmux 세션 접속하여 에이전트 출력 확인:

```bash
tmux attach-session -t orchestral-run-{timestamp}
```

3. pane 4 (Debug Shell)에서 프로세스 확인:

```bash
# pane 4로 이동 (Ctrl-b + 방향키)
ps aux | grep claude
```

**해결:**

**옵션 1: 타임아웃 연장**

대시보드에서 "Extend Timeout" 클릭 또는:

```bash
# .orchestral/config/global.json 수정
{
  "timeouts": {
    "builder": 1200000  // 20분
  }
}
```

**옵션 2: 재시작**

대시보드에서 "Retry Agent" 클릭 또는:

```bash
orchestral stop
orchestral start
```

### 에이전트가 크래시

**증상:**

에이전트 상태가 `failed`로 변경됨

**진단:**

1. error.flag 확인:

```bash
cat .orchestral/runs/{run_id}/{agent}/error.flag
```

출력 예시:

```json
{
  "agent": "builder",
  "error_type": "crash",
  "message": "Unexpected token in JSON",
  "stack": "...",
  "recoverable": true
}
```

2. 에이전트 로그 확인:

```bash
cat .orchestral/runs/{run_id}/{agent}/log.md
```

**해결:**

**자동 재시도:**

`config.global.auto_retry.enabled: true`인 경우 자동으로 최대 2회 재시도합니다.

**수동 재시도:**

대시보드에서 "Retry Agent" 클릭

**근본 원인 해결:**

- **메모리 부족**: 모델을 Haiku로 변경
- **권한 오류**: 파일 권한 확인
- **JSON 파싱 에러**: Briefing 형식 확인

## CRP 관련 문제

### CRP가 너무 자주 생성됨

**증상:**

Refiner가 계속 CRP를 생성하여 진행이 안 됨

**원인:**

Briefing이 모호한 표현을 포함

**해결:**

Briefing에서 다음 표현을 구체적으로 수정:

| 모호한 표현 | 구체적으로 |
|------------|----------|
| "적당히" | "60회/분" |
| "적절한" | "8자 이상" |
| "빠르게" | "100ms 이내" |

[Briefing 작성 가이드](/guide/writing-briefings.md) 참고

### CRP 응답 후 에이전트가 재시작 안 됨

**증상:**

VCR 작성 후 에이전트가 `waiting_human` 상태 유지

**진단:**

1. VCR 파일 확인:

```bash
ls -la .orchestral/runs/{run_id}/vcr/
```

2. VCR 형식 확인:

```bash
cat .orchestral/runs/{run_id}/vcr/vcr-001.json
```

**해결:**

VCR 파일이 올바른 형식인지 확인:

```json
{
  "vcr_id": "vcr-001",
  "crp_id": "crp-001",
  "decision": "A",
  "rationale": "이유",
  "applies_to_future": true
}
```

웹 UI에서 다시 제출하거나:

```bash
# 수동으로 에이전트 재시작
tmux send-keys -t orchestral-run-{timestamp}:main.0 "/clear" Enter
```

## MRP 검토 문제

### MRP가 생성되지 않음

**증상:**

Gatekeeper가 완료되었지만 MRP가 없음

**원인:**

Gatekeeper가 FAIL 또는 NEEDS_HUMAN 판정

**진단:**

1. verdict.json 확인:

```bash
cat .orchestral/runs/{run_id}/gatekeeper/verdict.json
```

2. review.md 확인:

```bash
cat .orchestral/runs/{run_id}/gatekeeper/review.md
```

**해결:**

**FAIL인 경우:**

- Builder가 자동으로 재시도됩니다
- `max_iterations` 초과 시 수동 개입 필요

**NEEDS_HUMAN인 경우:**

- CRP에 응답하세요

### 코드가 프로젝트에 반영 안 됨

**증상:**

MRP를 Approve 했지만 코드가 없음

**원인:**

Orchestral은 자동으로 머지하지 않습니다

**해결:**

MRP의 코드를 수동으로 프로젝트에 적용:

```bash
# MRP 코드 확인
ls .orchestral/runs/{run_id}/mrp/code/

# 복사
cp -r .orchestral/runs/{run_id}/mrp/code/* .
```

또는 Git diff 확인:

```bash
diff -r .orchestral/runs/{run_id}/mrp/code/ .
```

?> 향후 버전에서 자동 머지 기능 추가 예정

## 성능 문제

### 실행이 너무 느림

**증상:**

각 에이전트가 5분 이상 소요

**원인:**

1. 큰 코드베이스
2. Opus 모델 사용
3. 복잡한 Briefing

**해결:**

**1. 모델 다운그레이드**

```bash
# .orchestral/config/builder.json
{
  "model": "haiku"  # sonnet에서 변경
}
```

| 모델 | 속도 | 품질 | 비용 |
|------|------|------|------|
| Haiku | ⚡⚡⚡ | ⭐⭐ | 💰 |
| Sonnet | ⚡⚡ | ⭐⭐⭐ | 💰💰 |
| Opus | ⚡ | ⭐⭐⭐⭐ | 💰💰💰 |

**2. Briefing 단순화**

복잡한 요구사항을 여러 Run으로 분할

**3. 타임아웃 단축**

```json
// .orchestral/config/global.json
{
  "timeouts": {
    "refiner": 180000,  // 3분
    "builder": 300000   // 5분
  }
}
```

### 비용이 너무 높음

**증상:**

Run 하나에 $1 이상 소요

**진단:**

대시보드에서 Usage 확인:

```
Usage (this run):
  Refiner:    $0.001
  Builder:    $0.850  ← 높음
  Verifier:   $0.050
  Gatekeeper: $0.100
```

**해결:**

**1. 모델 최적화**

Builder만 Sonnet, 나머지는 Haiku:

```json
// builder.json
{ "model": "sonnet" }

// refiner.json, verifier.json, gatekeeper.json
{ "model": "haiku" }
```

**2. Iteration 제한**

```json
// global.json
{ "max_iterations": 2 }  // 기본 3에서 감소
```

**3. Briefing 품질 향상**

명확한 Briefing → 재시도 감소 → 비용 절감

## 파일 시스템 문제

### ".orchestral 폴더를 찾을 수 없음"

**증상:**

```bash
Error: .orchestral directory not found
```

**원인:**

잘못된 디렉토리에서 실행

**해결:**

프로젝트 루트에서 실행:

```bash
cd /path/to/your-project
orchestral start
```

### "Permission denied"

**증상:**

```bash
Error: EACCES: permission denied, mkdir '.orchestral'
```

**해결:**

디렉토리 권한 확인:

```bash
ls -la

# 쓰기 권한 없으면
chmod u+w .
```

### 디스크 공간 부족

**증상:**

```bash
Error: ENOSPC: no space left on device
```

**해결:**

오래된 Run 삭제:

```bash
# 30일 이전 Run 삭제
find .orchestral/runs -name "run-*" -mtime +30 -exec rm -rf {} \;

# 또는 수동으로
rm -rf .orchestral/runs/run-20240101-*
```

## tmux 문제

### tmux 세션에 접속할 수 없음

**증상:**

```bash
tmux attach-session -t orchestral-run-{timestamp}
# error: no sessions
```

**해결:**

1. 세션 목록 확인:

```bash
tmux list-sessions
```

2. 정확한 세션 이름 사용:

```bash
tmux list-sessions | grep orchestral
# orchestral-run-20240126-143022: 6 windows

tmux attach-session -t orchestral-run-20240126-143022
```

### tmux pane 간 이동

tmux 세션 내에서 pane 이동:

```bash
# Prefix 키: Ctrl-b

Ctrl-b + 방향키        # pane 이동
Ctrl-b + o            # 다음 pane
Ctrl-b + q            # pane 번호 표시
Ctrl-b + q + 숫자     # 특정 pane으로 이동
Ctrl-b + d            # 세션에서 빠져나오기 (detach)
```

### tmux 세션이 남아있음

**증상:**

`orchestral stop` 후에도 tmux 세션이 남아있음

**해결:**

수동으로 세션 종료:

```bash
tmux kill-session -t orchestral-run-{timestamp}

# 모든 orchestral 세션 종료
tmux list-sessions | grep orchestral | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

## 디버깅 팁

### 로그 확인

모든 이벤트는 `events.log`에 기록됩니다:

```bash
tail -f .orchestral/runs/{run_id}/events.log
```

출력 예시:

```
2024-01-26T14:30:22Z [INFO] run.started run_id=run-20240126-143022
2024-01-26T14:30:25Z [INFO] agent.started agent=refiner
2024-01-26T14:31:00Z [INFO] agent.completed agent=refiner duration_ms=35000
2024-01-26T14:31:05Z [INFO] agent.started agent=builder
2024-01-26T14:35:00Z [ERROR] agent.failed agent=builder error_type=crash
```

### Debug Shell 사용

tmux pane 4는 Debug Shell입니다:

```bash
# tmux 세션 접속
tmux attach-session -t orchestral-run-{timestamp}

# pane 4로 이동 (Ctrl-b + q + 4)

# 상태 확인
cat .orchestral/runs/{run_id}/state.json

# 파일 확인
ls -la .orchestral/runs/{run_id}/builder/
cat .orchestral/runs/{run_id}/builder/log.md

# 프로세스 확인
ps aux | grep claude
```

### Verbose 로그

더 상세한 로그가 필요한 경우:

```json
// .orchestral/config/global.json
{
  "log_level": "debug"  // "info"에서 변경
}
```

## 도움 요청

위 방법으로 해결되지 않는 경우:

1. **GitHub Issue 생성**
   - https://github.com/yourusername/orchestral/issues
   - 다음 정보 포함:
     - 에러 메시지
     - `events.log` 내용
     - `state.json` 내용
     - 실행 환경 (OS, Node 버전, tmux 버전)

2. **디버그 정보 수집**

```bash
# 환경 정보
node --version
tmux -V
claude --version

# Orchestral 버전
orchestral --version

# 로그 수집
tar -czf debug-logs.tar.gz .orchestral/runs/{run_id}/
```

## 다음 단계

- [고급 디버깅](/advanced/debugging.md) - 상세 디버깅 기법
- [FAQ](/misc/faq.md) - 자주 묻는 질문
- [GitHub Issues](https://github.com/yourusername/orchestral/issues) - 알려진 문제
