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

**Behavior Rules:**
- Start after Builder completion (detect `builder/done.flag`)
- Generate functional tests, boundary condition tests
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
