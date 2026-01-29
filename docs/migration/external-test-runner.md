# Migration Guide: External Test Runner

> **Version**: 1.0.0
> **Date**: 2026-01-29

## Overview

이 문서는 Verifier 에이전트의 External Test Runner 기능 도입에 따른 마이그레이션 가이드입니다.

## Breaking Changes

**없음** - External Test Runner는 opt-in 기능으로, 기존 동작에 영향을 주지 않습니다.

## What's New

### External Test Runner

Verifier 에이전트가 2-phase로 분리되어 테스트 실행이 외부 subprocess로 이동합니다:

| 기존 방식 | 새로운 방식 |
|-----------|-------------|
| 단일 Claude 세션에서 테스트 생성 + 실행 + 분석 | Phase 1: 테스트 생성 → External Runner: 테스트 실행 → Phase 2: 결과 분석 |

### Benefits

- **CPU 리소스 경쟁 해소**: LLM inference와 테스트 실행이 분리됨
- **에이전트 타임아웃 위험 감소**: 테스트 실행 시간이 에이전트 타임아웃에서 분리됨
- **컨텍스트 오염 방지**: 테스트 프레임워크 오류가 에이전트 컨텍스트에 영향 없음

## Configuration

### Enabling External Test Runner

`.dure/config/verifier.json`에서 설정:

```json
{
  "model": "haiku",
  "external_runner": {
    "enabled": true,
    "default_framework": "vitest",
    "default_timeout_ms": 120000
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `external_runner.enabled` | `boolean` | `true` | External Runner 사용 여부 |
| `external_runner.default_framework` | `string` | `"vitest"` | 기본 테스트 프레임워크 (`vitest`, `jest`, `mocha`, `custom`) |
| `external_runner.default_timeout_ms` | `number` | `120000` | 테스트 실행 타임아웃 (밀리초) |

### Disabling External Test Runner (Legacy Mode)

기존 방식으로 동작하려면:

```json
{
  "model": "haiku",
  "external_runner": {
    "enabled": false
  }
}
```

## Backward Compatibility

### Existing Runs

- 기존에 완료된 run은 영향 없음
- 진행 중인 run은 시작 시점의 설정을 유지

### Configuration Defaults

| Version | `external_runner.enabled` Default |
|---------|-----------------------------------|
| 1.0.0 (초기 릴리스) | `true` |

Legacy mode는 계속 지원되며 deprecated 예정 없음.

## New Files

External Test Runner 활성화 시 `verifier/` 폴더에 새로운 파일이 생성됩니다:

```
.dure/runs/run-{timestamp}/verifier/
├── tests/                # 기존
├── results.json          # 기존
├── log.md                # 기존
├── done.flag             # 기존
├── test-config.json      # NEW - 테스트 실행 설정
├── tests-ready.flag      # NEW - Phase 1 완료 시그널
├── test-output.json      # NEW - 테스트 실행 결과
└── test-log.txt          # NEW - 테스트 실행 로그
```

### New File Formats

#### test-config.json

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

#### test-output.json

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

## New Events

FileWatcher에서 새로운 이벤트가 발생합니다:

| Event | Trigger | Description |
|-------|---------|-------------|
| `tests_ready` | `tests-ready.flag` 생성 | Verifier Phase 1 완료 |
| `test_execution_done` | `test-output.json` 생성 | External Runner 완료 |

## New Agent Status

`state.json`에 새로운 상태가 추가됩니다:

| Status | Description |
|--------|-------------|
| `waiting_test_execution` | Verifier Phase 1 완료 후 테스트 실행 대기 중 |

## Troubleshooting

### Test Execution Timeout

테스트가 타임아웃되면 `test-output.json`에 다음과 같이 기록됩니다:

```json
{
  "exit_code": -1,
  "stdout": "...",
  "stderr": "Process timed out after 120000ms",
  "duration_ms": 120000,
  "executed_at": "..."
}
```

**해결 방법**:
1. `external_runner.default_timeout_ms` 값 증가
2. 또는 Verifier Phase 1에서 `test-config.json`의 `timeout_ms` 값 조정

### Framework Compatibility Issues

지원되지 않는 테스트 프레임워크의 경우:

1. `test_framework: "custom"` 사용
2. `test_command`에 전체 실행 명령 지정

```json
{
  "test_framework": "custom",
  "test_command": "npm run test:custom -- --json",
  "test_directory": "verifier/tests",
  "timeout_ms": 120000,
  "coverage": false,
  "created_at": "..."
}
```

### Process Zombie Issues

테스트 프로세스가 정상 종료되지 않는 경우:

1. TestRunner가 타임아웃 후 SIGTERM 전송
2. 5초 대기 후 SIGKILL 전송
3. 프로세스 그룹 전체 종료

이슈 발생 시 `test-log.txt`에서 상세 로그 확인.

## FAQ

### Q: 기존 설정 파일을 수정해야 하나요?

A: 아니요. `external_runner` 설정이 없으면 기본값 (`enabled: true`)이 적용됩니다.

### Q: Legacy mode를 계속 사용할 수 있나요?

A: 네. `external_runner.enabled: false`로 설정하면 기존 방식으로 동작합니다.

### Q: 성능 차이가 있나요?

A: External Runner 사용 시:
- 전체 실행 시간은 비슷하거나 약간 증가 (프로세스 오버헤드)
- 에이전트 토큰 사용량 감소 (테스트 출력이 컨텍스트에 포함되지 않음)
- 에이전트 타임아웃 발생률 감소

### Q: Custom test framework를 사용할 수 있나요?

A: 네. `test_framework: "custom"`으로 설정하고 `test_command`에 원하는 명령을 지정하세요.
