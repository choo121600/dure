# 파일 구조

Dure의 폴더 및 파일 구조를 상세히 설명합니다.

## 전체 구조

```
your-project/
├── src/                    # 프로젝트 소스 코드
├── package.json
├── .gitignore
│
└── .dure/            # Dure 작업 디렉토리
    ├── config/             # 설정 파일
    │   ├── global.json
    │   ├── refiner.json
    │   ├── builder.json
    │   ├── verifier.json
    │   └── gatekeeper.json
    │
    └── runs/               # 실행 기록
        └── run-{timestamp}/
            ├── state.json
            ├── events.log
            ├── briefing/
            ├── builder/
            ├── verifier/
            ├── gatekeeper/
            ├── crp/
            ├── vcr/
            ├── mrp/
            └── prompts/
```

## .dure/config/

설정 파일들이 저장됩니다. `dure start` 시 자동 생성됩니다.

### global.json

전역 설정:

```json
{
  "max_iterations": 3,
  "tmux_session_prefix": "dure",
  "web_port": 3000,
  "log_level": "info",
  "timeouts": {
    "refiner": 300000,
    "builder": 600000,
    "verifier": 300000,
    "gatekeeper": 300000
  },
  "timeout_action": "warn",
  "notifications": {
    "terminal_bell": true,
    "system_notify": false
  },
  "auto_retry": {
    "enabled": true,
    "max_attempts": 2,
    "recoverable_errors": ["crash", "timeout", "validation"]
  }
}
```

### refiner.json, builder.json, verifier.json, gatekeeper.json

각 에이전트별 설정. 자세한 내용은 [설정 파일](/api/configuration.md) 참고.

## .dure/runs/

모든 Run의 실행 기록이 저장됩니다.

### Run 디렉토리 명명 규칙

```
run-{timestamp}

예시:
run-20240126-143022
run-20240126-150000
```

타임스탬프 형식: `YYYYMMDD-HHMMSS` (UTC)

## Run 디렉토리 구조

```
run-{timestamp}/
├── state.json              # 현재 상태 (항상 존재)
├── events.log              # 이벤트 로그 (항상 존재)
│
├── briefing/               # Briefing 관련 (Phase 0)
│   ├── raw.md
│   ├── refined.md
│   ├── clarifications.json
│   └── log.md
│
├── builder/                # Builder 관련 (Phase 1)
│   ├── output/
│   │   └── files.json
│   ├── log.md
│   ├── done.flag
│   └── error.flag          (에러 시에만)
│
├── verifier/               # Verifier 관련 (Phase 2)
│   ├── tests/
│   │   └── *.test.ts
│   ├── results.json
│   ├── log.md
│   ├── done.flag
│   └── error.flag          (에러 시에만)
│
├── gatekeeper/             # Gatekeeper 관련 (Phase 3)
│   ├── review.md
│   ├── verdict.json
│   └── log.md
│
├── crp/                    # Consultation Request Pack
│   ├── crp-001.json
│   ├── crp-002.json
│   └── ...
│
├── vcr/                    # Version Controlled Resolution
│   ├── vcr-001.json
│   ├── vcr-002.json
│   └── ...
│
├── mrp/                    # Merge-Readiness Pack (PASS 시)
│   ├── summary.md
│   ├── code/
│   │   └── ...
│   ├── tests/
│   │   └── ...
│   └── evidence.json
│
└── prompts/                # 에이전트 프롬프트 파일
    ├── refiner.md
    ├── builder.md
    ├── verifier.md
    └── gatekeeper.md
```

## 주요 파일 설명

### state.json

**위치:** `.dure/runs/{run_id}/state.json`

**용도:** Run의 현재 상태를 저장

**구조:**

```json
{
  "run_id": "run-20240126-143022",
  "phase": "build",
  "iteration": 1,
  "max_iterations": 3,
  "started_at": "2024-01-26T14:30:22Z",
  "updated_at": "2024-01-26T14:32:15Z",
  "agents": {
    "refiner": {
      "status": "completed",
      "started_at": "2024-01-26T14:30:25Z",
      "completed_at": "2024-01-26T14:31:00Z",
      "error": null,
      "usage": {
        "input_tokens": 2100,
        "output_tokens": 800,
        "cost_usd": 0.002
      }
    },
    "builder": {
      "status": "running",
      "started_at": "2024-01-26T14:31:05Z",
      "completed_at": null,
      "error": null,
      "timeout_at": "2024-01-26T14:41:05Z",
      "usage": null
    }
  },
  "usage": {
    "total_input_tokens": 2100,
    "total_output_tokens": 800,
    "total_cost_usd": 0.002
  },
  "pending_crp": null,
  "errors": [],
  "history": [
    {
      "phase": "refine",
      "result": "completed",
      "timestamp": "2024-01-26T14:31:00Z",
      "duration_ms": 35000
    }
  ]
}
```

**업데이트 시점:**
- 에이전트 시작/완료 시
- Phase 전환 시
- CRP/VCR 생성 시
- 에러 발생 시

### events.log

**위치:** `.dure/runs/{run_id}/events.log`

**용도:** 모든 이벤트를 시간순으로 기록

**형식:** 한 줄에 하나의 이벤트

```
2024-01-26T14:30:22Z [INFO] run.started run_id=run-20240126-143022
2024-01-26T14:30:25Z [INFO] agent.started agent=refiner
2024-01-26T14:31:00Z [INFO] agent.completed agent=refiner duration_ms=35000
2024-01-26T14:31:00Z [INFO] phase.changed from=refine to=build
2024-01-26T14:31:05Z [INFO] agent.started agent=builder
2024-01-26T14:35:00Z [ERROR] agent.failed agent=builder error_type=crash message="Unexpected token"
2024-01-26T14:35:00Z [INFO] agent.retry agent=builder attempt=1
```

**로그 레벨:**
- `INFO` - 일반 이벤트
- `WARN` - 경고 (타임아웃 등)
- `ERROR` - 에러

### briefing/raw.md

**위치:** `.dure/runs/{run_id}/briefing/raw.md`

**용도:** 인간이 작성한 원본 Briefing

**생성 시점:** Run 시작 시 (웹 UI에서 제출한 내용)

**예시:**

```markdown
# Rate Limiter 미들웨어 구현

## 요구사항
- Express.js 미들웨어로 구현
- IP 기반 요청 제한
- 분당 60회 제한
```

### briefing/refined.md

**위치:** `.dure/runs/{run_id}/briefing/refined.md`

**용도:** Refiner가 검토/개선한 Briefing

**생성 시점:** Refiner 완료 시

**차이점:**
- 모호한 표현 → 구체적인 값
- 누락된 제약 조건 추가
- 명확화된 요구사항

### done.flag

**위치:**
- `.dure/runs/{run_id}/builder/done.flag`
- `.dure/runs/{run_id}/verifier/done.flag`

**용도:** 에이전트 완료 신호

**내용:** 비어있음 (파일 존재 자체가 신호)

**생성 시점:** 에이전트 작업 완료 시

**감지 방법:**

```typescript
// File Watcher가 감지
chokidar
  .watch('.dure/runs/{run_id}/builder/')
  .on('add', (path) => {
    if (path.endsWith('done.flag')) {
      orchestrator.startNextAgent();
    }
  });
```

### error.flag

**위치:** `.dure/runs/{run_id}/{agent}/error.flag`

**용도:** 에이전트 에러 정보

**생성 시점:** 에이전트 실행 실패 시

**구조:**

```json
{
  "agent": "builder",
  "error_type": "crash",
  "message": "Unexpected token in JSON at position 123",
  "stack": "Error: Unexpected token...\n  at ...",
  "timestamp": "2024-01-26T14:35:00Z",
  "recoverable": true
}
```

### CRP 파일

**위치:** `.dure/runs/{run_id}/crp/crp-{n}.json`

**용도:** 인간 판단 요청

**명명 규칙:** `crp-001.json`, `crp-002.json`, ...

**구조:** [CRP 응답 가이드](/guide/responding-to-crp.md) 참고

### VCR 파일

**위치:** `.dure/runs/{run_id}/vcr/vcr-{n}.json`

**용도:** 인간 결정 기록

**명명 규칙:** `vcr-001.json` (해당 `crp-001.json`에 대한 응답)

**구조:** [CRP 응답 가이드](/guide/responding-to-crp.md) 참고

### MRP 디렉토리

**위치:** `.dure/runs/{run_id}/mrp/`

**용도:** 최종 결과물 패키지

**생성 시점:** Gatekeeper PASS 판정 시

**구조:** [MRP 검토 가이드](/guide/reviewing-mrp.md) 참고

## 파일 생성 순서

### 정상 흐름 (Phase 0 → 3)

```
1. Run 시작
   - state.json
   - events.log
   - briefing/raw.md
   - prompts/*.md

2. Refiner (Phase 0)
   - briefing/refined.md
   - briefing/clarifications.json
   - briefing/log.md

3. Builder (Phase 1)
   - builder/output/files.json
   - builder/log.md
   - builder/done.flag

4. Verifier (Phase 2)
   - verifier/tests/*.test.ts
   - verifier/results.json
   - verifier/log.md
   - verifier/done.flag

5. Gatekeeper (Phase 3)
   - gatekeeper/review.md
   - gatekeeper/verdict.json
   - gatekeeper/log.md
   - (PASS인 경우) mrp/
```

### CRP 발생 시

```
1. 에이전트가 CRP 생성
   - crp/crp-001.json
   - state.json 업데이트 (pending_crp: "crp-001")

2. 인간이 응답
   - vcr/vcr-001.json
   - state.json 업데이트 (pending_crp: null)

3. 에이전트 재시작
   - 기존 로그 파일 덮어쓰기
```

### 재시도 (iteration) 시

```
1. Gatekeeper FAIL 판정
   - gatekeeper/verdict.json (verdict: "FAIL")
   - gatekeeper/review.md (피드백)

2. Builder 재시작 (iteration 2)
   - builder/log.md 덮어쓰기
   - builder/output/files.json 덮어쓰기
   - builder/done.flag 재생성

3. Verifier 재실행
   - verifier/results.json 덮어쓰기
   - ...
```

## 디스크 사용량

### 예상 크기

| 구성요소 | 크기 (평균) |
|---------|------------|
| state.json | ~5 KB |
| events.log | ~10-50 KB |
| briefing/*.md | ~5-20 KB |
| builder/log.md | ~10-100 KB |
| verifier/tests/ | ~10-100 KB |
| MRP | ~50-500 KB |
| **Run 전체** | **~100 KB - 1 MB** |

### 정리 방법

오래된 Run 삭제:

```bash
# 30일 이전 Run 삭제
find .dure/runs -name "run-*" -mtime +30 -exec rm -rf {} \;

# 특정 Run 삭제
rm -rf .dure/runs/run-20240126-143022

# 모든 실패한 Run 삭제
for dir in .dure/runs/run-*; do
  verdict=$(jq -r '.verdict' "$dir/gatekeeper/verdict.json" 2>/dev/null)
  if [ "$verdict" = "FAIL" ]; then
    rm -rf "$dir"
  fi
done
```

## Git 관리

### .gitignore 권장 설정

```gitignore
# Dure - 실행 기록은 무시
.dure/runs/

# Dure - 설정은 커밋 (팀과 공유)
!.dure/config/
```

또는 모두 무시:

```gitignore
# Dure
.dure/
```

### 실행 기록 보존

중요한 Run은 별도 보관:

```bash
# 특정 Run 아카이브
tar -czf run-20240126-143022.tar.gz \
  .dure/runs/run-20240126-143022

# 모든 PASS Run 아카이브
for dir in .dure/runs/run-*; do
  verdict=$(jq -r '.verdict' "$dir/gatekeeper/verdict.json" 2>/dev/null)
  if [ "$verdict" = "PASS" ]; then
    tar -czf "$(basename $dir).tar.gz" "$dir"
  fi
done
```

## 다음 단계

- [데이터 포맷](/architecture/data-formats.md) - 파일 포맷 상세 명세
- [실행 흐름](/architecture/execution-flow.md) - 파일 생성 타이밍
- [설정 파일](/api/configuration.md) - config 파일 상세
