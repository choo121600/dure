# Dure - Agent Definitions

## Refiner

| Item | Value |
|------|-----|
| Role | Briefing review and improvement |
| Default Model | haiku |
| Input | `briefing/raw.md` |
| Output | `briefing/refined.md`, `briefing/clarifications.json`, `briefing/log.md` |

**Behavior Rules:**
- Sufficient briefing → Generate `refined.md`, proceed to next phase
- Improvable → Supplement in `refined.md`, record reasoning in `log.md`
- Ambiguous → Create `crp/`, wait for human response

**Auto-improvement Allowed:**
- Numeric defaults
- Naming conventions
- File paths

**CRP Required:**
- Architecture decisions
- Adding external dependencies
- Security-related matters

## Builder

| Item | Value |
|------|-----|
| Role | Code implementation |
| Default Model | sonnet |
| Input | `briefing/refined.md`, `briefing/clarifications.json` |
| Output | `builder/output/`, `builder/log.md`, `builder/done.flag` |

**Behavior Rules:**
- Generate code based on `refined.md`
- Record design decision reasoning in `log.md`
- Create `done.flag` upon completion

## Verifier

| Item | Value |
|------|-----|
| Role | Test generation and execution, counterexample search |
| Default Model | haiku |
| Input | `briefing/refined.md`, `builder/output/` |
| Output | `verifier/tests/`, `verifier/results.json`, `verifier/log.md`, `verifier/done.flag` |

### 2-Phase Execution (External Test Runner)

Verifier는 테스트 실행을 외부 subprocess로 분리하여 2단계로 동작한다:

```
Phase 1 (Test Generation)     External Runner        Phase 2 (Result Analysis)
────────────────────────      ────────────────       ────────────────────────
테스트 코드 생성          →   테스트 실행       →   결과 분석/판정
tests-ready.flag              test-output.json       results.json
test-config.json              test-log.txt           done.flag
```

#### Phase 1: Test Generation

| Item | Value |
|------|-----|
| Role | Test code generation only (NO execution) |
| Input | `briefing/refined.md`, `builder/output/` |
| Output | `verifier/tests/`, `verifier/test-config.json`, `verifier/tests-ready.flag` |

**Behavior Rules:**
- Generate functional tests, boundary condition tests
- Create `test-config.json` with test framework configuration
- Create `tests-ready.flag` when test generation is complete
- DO NOT execute tests (external runner will handle this)

#### Phase 2: Result Analysis

| Item | Value |
|------|-----|
| Role | Analyze externally executed test results |
| Input | `verifier/test-output.json`, `verifier/test-log.txt`, `verifier/tests/` |
| Output | `verifier/results.json`, `verifier/log.md`, `verifier/done.flag` |

**Behavior Rules:**
- Read test execution results from `test-output.json`
- Analyze failures and coverage
- Record analysis in `results.json`
- Create `done.flag` upon completion

### New File Formats

#### test-config.json

Phase 1에서 생성하는 테스트 실행 설정:

```json
{
  "test_framework": "vitest",
  "test_command": "npx vitest run --reporter=json",
  "test_directory": "verifier/tests",
  "timeout_ms": 120000,
  "coverage": true,
  "created_at": "2026-01-29T10:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `test_framework` | `"vitest" \| "jest" \| "mocha" \| "custom"` | 테스트 프레임워크 종류 |
| `test_command` | `string` | 실행할 테스트 명령어 |
| `test_directory` | `string` | 테스트 파일 디렉토리 (run 폴더 기준 상대 경로) |
| `timeout_ms` | `number` | 테스트 실행 타임아웃 (밀리초) |
| `coverage` | `boolean` | 커버리지 수집 여부 |
| `created_at` | `string` | ISO 타임스탬프 |

#### test-output.json

External Runner가 생성하는 테스트 실행 결과:

```json
{
  "exit_code": 0,
  "stdout": "...",
  "stderr": "...",
  "duration_ms": 5432,
  "executed_at": "2026-01-29T10:01:00.000Z",
  "test_results": {
    "total": 10,
    "passed": 8,
    "failed": 2,
    "skipped": 0
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `exit_code` | `number` | 프로세스 종료 코드 (0=성공) |
| `stdout` | `string` | 표준 출력 내용 |
| `stderr` | `string` | 표준 에러 내용 |
| `duration_ms` | `number` | 실행 소요 시간 (밀리초) |
| `executed_at` | `string` | 실행 완료 ISO 타임스탬프 |
| `test_results` | `object` | 파싱된 테스트 결과 (선택적) |

### Legacy Mode

`external_runner.enabled: false` 설정 시 기존 방식(단일 세션에서 생성+실행)으로 동작한다.

**Behavior Rules (Legacy):**
- Start after Builder completion (detect `builder/done.flag`)
- Generate functional tests, boundary condition tests
- Execute tests within the same session
- Record test execution results in `results.json`
- Specify failure cases, edge cases

## Gatekeeper

| Item | Value |
|------|-----|
| Role | Code review, final verdict |
| Default Model | sonnet |
| Input | All artifacts (briefing/, builder/, verifier/) |
| Output | `gatekeeper/review.md`, `gatekeeper/verdict.json`, `mrp/` |

**Verdict Results:**
- `PASS` → Create `mrp/`, submit to human
- `FAIL` → Record reason in `review.md`, return to Phase 1 (retry)
- `NEEDS_HUMAN` → Create `crp/`, wait for human response
