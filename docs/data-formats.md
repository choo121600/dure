# Dure - Data Formats

## Folder Structure

### Project Root

```
/my-project/                    # User project
├── src/                        # Existing code
├── package.json
│
└── .dure/                # Created when dure start runs
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

### Run Directory

```
run-{timestamp}/
├── state.json                  # Current state
├── events.log                  # Event log
│
├── briefing/
│   ├── raw.md                  # Human original input
│   ├── refined.md              # Refiner output
│   ├── clarifications.json     # Interpretations/supplements
│   └── log.md                  # Refiner log
│
├── builder/
│   ├── output/                 # Generated code
│   ├── log.md                  # Design reasoning
│   ├── done.flag               # Completion signal
│   └── error.flag              # When error occurs
│
├── verifier/
│   ├── tests/                  # Generated tests
│   ├── results.json            # Test results
│   ├── log.md
│   └── done.flag
│
├── gatekeeper/
│   ├── review.md               # Review comments
│   ├── verdict.json            # Verdict result (PASS/MINOR_FAIL/FAIL/NEEDS_HUMAN)
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
  "question": "What criteria should rate limiting be applied with?",
  "context": "Briefing only specifies 'appropriate rate limiting'",
  "options": [
    { "id": "A", "label": "60 requests per minute per IP", "description": "Common API default", "risk": "Low" },
    { "id": "B", "label": "100 requests per minute per user", "description": "Based on authenticated users", "risk": "Requires authentication system" }
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
  "rationale": "Start with simple approach for MVP",
  "additional_notes": "Plan to add per-user limits later",
  "applies_to_future": true
}
```

## MRP (Merge-Readiness Pack)

**summary.md:**
- Run information (ID, iteration count, completion time)
- List of changes
- Test results
- Design decision summary
- Review pass reasoning

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

## verdict.json

Gatekeeper creates this file with the final verdict.

**Verdict Types:**

| Verdict | Description | Next Action |
|---------|-------------|-------------|
| `PASS` | All checks passed | Create MRP, submit to human |
| `MINOR_FAIL` | Small test failures (≤5 failures, ≥90% passing) | Apply fix, re-run Verifier |
| `FAIL` | Significant issues found | Return to Builder for retry |
| `NEEDS_HUMAN` | Requires human judgment | Create CRP, wait for response |

**Example (PASS):**
```json
{
  "verdict": "PASS",
  "reason": "All tests passing, code meets requirements",
  "timestamp": "2024-01-15T15:00:00Z"
}
```

**Example (MINOR_FAIL):**
```json
{
  "verdict": "MINOR_FAIL",
  "reason": "2 tests failed, applying targeted fix",
  "issues": ["Edge case in rate limiter", "Missing null check"],
  "timestamp": "2024-01-15T14:55:00Z",
  "minor_fix_attempt": 1
}
```

**Example (FAIL):**
```json
{
  "verdict": "FAIL",
  "reason": "Core functionality not implemented correctly",
  "issues": ["Rate limiter not resetting counters", "Missing middleware registration"],
  "suggestions": ["Review middleware lifecycle", "Add integration tests"],
  "timestamp": "2024-01-15T14:50:00Z"
}
```

**Example (NEEDS_HUMAN):**
```json
{
  "verdict": "NEEDS_HUMAN",
  "reason": "Security implications require human review",
  "crp_id": "crp-002",
  "timestamp": "2024-01-15T14:45:00Z"
}
```

## Configuration Files

### global.json

```json
{
  "max_iterations": 3,
  "tmux_session_prefix": "dure",
  "web_port": 3873,
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
  "delegation_keywords": ["appropriately", "as needed", "reasonably"],
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
