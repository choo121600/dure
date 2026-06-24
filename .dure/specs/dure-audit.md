# dure-audit — Requirements Specification (spec.md)

> Status: **FIXED** · slug: `dure-audit` · Convergence evidence: [interview-logs/dure-audit.md](../interview-logs/dure-audit.md)
> First feature of milestone **M2 (Full audit)**. Produced by dure's own deep interview (dogfooding /
> E1.6). Stop conditions (parent spec §4.4) met at Round 3 (`gate=PASS`, critic sign-off `pass`).

## 1. Vision
A deterministic, **report-only** scanner that inventories high-signal findings in a target repo.
Findings are **evidence** for `/dure:interview` and `/dure:plan` (and humans), NOT auto-created issues.

## 2. Locked decisions
| # | Decision | Value |
|---|---|---|
| D1 | Scope | Exactly 3 deterministic checks (§4): `todo-marker`, `untested-script`, `done-parent-undone-child` |
| D2 | Form/output | Python `scripts/dure-audit.py`; JSON `{status, findings:[{check,severity,file?,line?,id?,message}], counts}`; exit 0/1/2 |
| D3 | Boundary | **Inventory only** — emits to stdout; MUST NOT write to `.dure/roadmap/` |
| D4 | Severity | Tiered info/warning/error, tunable via an `audit:` section in `config.yml` (defaults hard-coded) |
| D5 | Ownership | `dure-doctor` owns hierarchy/orphan/schema/invalid-status; `dure-audit` MUST be disjoint from those |

## 3. Scope
### In scope
- The 3 checks in §4, computed deterministically; JSON inventory output.
### Non-goals (out of scope for v1)
- ❌ Writing/creating issues (D3) · ❌ orphan/hierarchy/schema checks (owned by `dure-doctor`, D5)
- ❌ oversized-by-LOC (wrong signal), git/coverage/security scans (later M2/M3)
- ❌ prose/emoji progress markers as a "stale" signal (no oracle)

## 4. Checks (deterministic)
1. **`todo-marker`** (info) — case-sensitive `\b(TODO|FIXME)\b` across `scripts/`, `skills/`, `agents/`,
   `hooks/`, `docs/`. Emits `{check, severity:info, file, line, message}`.
2. **`untested-script`** (warning) — each `scripts/dure-*.py` whose matching test
   `tests/test_<base>.py` is absent, MINUS `audit.untested_allowlist`. The base name MUST be mapped
   hyphen→underscore (`dure-doctor` → `test_dure_doctor.py`).
3. **`done-parent-undone-child`** (warning) — a milestone/epic with front-matter `status: done` that has
   an existing child (epic under it, or issue under it) with `status ∈ {todo,doing,blocked}`. Computed
   from **front matter only**; prose markers out of scope.

## 5. Config (`audit:` section; defaults hard-coded when absent)
```yaml
audit:
  untested_allowlist: [dure-gate]   # scripts intentionally without a test file
  fail_on: error                    # exit 1 only for findings with severity >= fail_on
```
The implementation MUST apply these defaults when `.dure/config.yml` has no `audit:` section.

## 6. Output / exit
- `status`: `pass` (no finding ≥ `fail_on`) | `fail` (≥1 finding ≥ `fail_on`) | `error`.
- Exit: `0` advisory (default — info/warning never fail) · `1` if any finding severity ≥ `audit.fail_on`
  · `2` internal error. Severity order: `info < warning < error`.

## 7. Acceptance criteria (testable)
- **AC-a** Given fixtures {clean, one-real-TODO, a `dure-*.py` with no test, a done-milestone with a
  todo issue}, When `dure-audit.py` runs, Then each yields exactly the expected findings (check + count)
  and JSON shape; exit 0 by default; exit 1 when `fail_on` is lowered to that severity.
- **AC-b** Given the committed repo, Then there are zero false positives: `todo-marker`=0,
  `untested-script` respects the `dure-gate` allowlist and the hyphen→underscore mapping, and NO finding
  overlaps a `dure-doctor` class; runs under `python3`.
- **AC-c** Ownership disjointness: `dure-audit`'s check-class set is disjoint from `dure-doctor`'s
  (no shared `(check-class, id)` verdict), asserted by a test.

## 8. Open questions (non-blocking)
- **OQ1** Additional M2 checks (coverage depth, security) are future scope, not v1.
