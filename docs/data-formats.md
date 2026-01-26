# Orchestral - 데이터 포맷

## 폴더 구조

### 프로젝트 루트

```
/my-project/                    # 사용자 프로젝트
├── src/                        # 기존 코드
├── package.json
│
└── .orchestral/                # orchestral start 시 생성
    ├── config/
    │   ├── global.json
    │   ├── refiner.json
    │   ├── builder.json
    │   ├── verifier.json
    │   └── gatekeeper.json
    │
    └── runs/
        └── run-{timestamp}/
```

### Run 디렉토리

```
run-{timestamp}/
├── state.json                  # 현재 상태
├── events.log                  # 이벤트 로그
│
├── briefing/
│   ├── raw.md                  # 인간 원본 입력
│   ├── refined.md              # Refiner 출력
│   ├── clarifications.json     # 해석/보완 내용
│   └── log.md                  # Refiner 로그
│
├── builder/
│   ├── output/                 # 생성된 코드
│   ├── log.md                  # 설계 근거
│   ├── done.flag               # 완료 신호
│   └── error.flag              # 에러 발생 시
│
├── verifier/
│   ├── tests/                  # 생성된 테스트
│   ├── results.json            # 테스트 결과
│   ├── log.md
│   └── done.flag
│
├── gatekeeper/
│   ├── review.md               # 리뷰 코멘트
│   ├── verdict.json            # 판정 결과
│   └── log.md
│
├── crp/                        # Consultation Request Pack
├── vcr/                        # Version Controlled Resolution
│
└── mrp/                        # Merge-Readiness Pack
    ├── summary.md
    ├── code/
    ├── tests/
    └── evidence.json
```

## state.json

```json
{
  "run_id": "run-20240115-143022",
  "phase": "build",
  "iteration": 1,
  "max_iterations": 3,
  "started_at": "2024-01-15T14:30:22Z",
  "updated_at": "2024-01-15T14:32:15Z",
  "agents": {
    "refiner": { "status": "completed", "completed_at": "..." },
    "builder": { "status": "running", "started_at": "..." },
    "verifier": { "status": "pending" },
    "gatekeeper": { "status": "pending" }
  },
  "pending_crp": null,
  "history": [
    { "phase": "refine", "result": "completed", "timestamp": "..." }
  ]
}
```

## CRP (Consultation Request Pack)

```json
{
  "crp_id": "crp-001",
  "created_at": "2024-01-15T14:35:00Z",
  "created_by": "refiner",
  "type": "clarification",
  "question": "Rate limiting을 어떤 기준으로 적용할까요?",
  "context": "briefing에 '적절한 rate limiting'이라고만 명시됨",
  "options": [
    { "id": "A", "label": "IP당 분당 60회", "description": "일반적인 API 기본값", "risk": "낮음" },
    { "id": "B", "label": "사용자당 분당 100회", "description": "인증된 사용자 기준", "risk": "인증 시스템 필요" }
  ],
  "recommendation": "A",
  "status": "pending"
}
```

## VCR (Version Controlled Resolution)

```json
{
  "vcr_id": "vcr-001",
  "crp_id": "crp-001",
  "created_at": "2024-01-15T14:40:00Z",
  "decision": "A",
  "rationale": "MVP에서는 단순한 방식으로 시작",
  "additional_notes": "추후 사용자별 제한 추가 예정",
  "applies_to_future": true
}
```

## MRP (Merge-Readiness Pack)

**summary.md:**
- Run 정보 (ID, iteration 수, 완료 시간)
- 변경 사항 목록
- 테스트 결과
- 설계 결정 요약
- 리뷰 통과 사유

**evidence.json:**
```json
{
  "tests": { "total": 12, "passed": 12, "failed": 0, "coverage": 85 },
  "files_changed": ["src/middleware/rateLimiter.ts", "src/app.ts"],
  "decisions": ["vcr-001"],
  "iterations": 2,
  "logs": {
    "refiner": "briefing/log.md",
    "builder": "builder/log.md",
    "verifier": "verifier/log.md",
    "gatekeeper": "gatekeeper/log.md"
  }
}
```

## 설정 파일

### global.json

```json
{
  "max_iterations": 3,
  "tmux_session_prefix": "orchestral",
  "web_port": 3000,
  "log_level": "info",
  "timeouts": {
    "refiner": 300000,
    "builder": 600000,
    "verifier": 300000,
    "gatekeeper": 300000
  },
  "timeout_action": "warn",
  "notifications": { "terminal_bell": true, "system_notify": false },
  "auto_retry": { "enabled": true, "max_attempts": 2, "recoverable_errors": ["crash", "timeout", "validation"] }
}
```

### refiner.json

```json
{
  "model": "haiku",
  "auto_fill": {
    "allowed": ["numeric_defaults", "naming", "file_paths"],
    "forbidden": ["architecture", "external_deps", "security"]
  },
  "delegation_keywords": ["적당히", "알아서", "합리적으로"],
  "max_refinement_iterations": 2
}
```

### builder.json

```json
{
  "model": "sonnet",
  "style": { "prefer_libraries": [], "avoid_libraries": [], "code_style": "default" },
  "constraints": { "max_file_size_lines": 500, "require_types": false }
}
```

### verifier.json

```json
{
  "model": "haiku",
  "test_coverage": { "min_percentage": 80, "require_edge_cases": true, "require_error_cases": true },
  "adversarial": { "enabled": true, "max_attack_vectors": 5 }
}
```

### gatekeeper.json

```json
{
  "model": "sonnet",
  "pass_criteria": { "tests_passing": true, "no_critical_issues": true, "min_test_coverage": 80 },
  "max_iterations": 3,
  "auto_crp_triggers": ["security_concern", "breaking_change", "external_dependency_addition"]
}
```
