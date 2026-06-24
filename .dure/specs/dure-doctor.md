# dure-doctor — Requirements Specification (spec.md)

> Status: **FIXED** · slug: `dure-doctor` · Convergence evidence: [interview-logs/dure-doctor.md](../interview-logs/dure-doctor.md)
> Produced by dure's own deep interview (dogfooding). Stop conditions (parent spec §4.4) met at Round 3
> (`gate=PASS`, run_level 0.143, critic sign-off `pass`). Normative keywords follow RFC 2119.

## 1. Vision

A deterministic `.dure/` integrity validator for dure projects. It reads a target repo's `.dure/`
directory and reports structural, schema, and hierarchy problems so users can trust their PM state
(especially after a fresh clone, manual edit, or partial bootstrap).

## 2. Locked decisions

| # | Decision | Value |
|---|---|---|
| D1 | Scope | Comprehensive (checks 1–19) with revisions: check #18 "index regenerability" is **dropped** (deferred to E1.3); #18′ "an id referenced by a parent array or index.md has no backing per-item file" is a **warning** |
| D2 | Form | Python script `scripts/dure-doctor.py` (consistent with `dure-gate.py`); parse via `try: import yaml` (PyYAML present on target) with a documented regex fallback for flat scalar keys |
| D3 | Output | JSON `{status, checks_passed, checks_failed, violations[{check,severity,message}], warnings[]}` + exit codes (0 pass / 1 violations / 2 error), matching `dure-gate.py` |
| D4 | Repair | Report-only by default; `--fix` recreates only missing dirs + an empty `.dure/active`. It MUST NOT touch `config.yml`, `specs/*`, or per-item roadmap files. Index regeneration is **out of scope** until E1.3 |

## 3. Scope

### In scope
- Structural presence: `.dure/` + required subdirs (`specs`, `interview-logs`, `roadmap/{milestones,epics,issues}`, `sync`)
- `config.yml` schema: `interview.ambiguity_threshold` (float), `min_rounds` (int), `dimension_weights` (6 keys), `github.sync ∈ {gh,mcp,off}`, `github.epic_as ∈ {tracking-issue,sub-issues}`
- `active` pointer: if non-empty (after whitespace strip), MUST match an existing `specs/<slug>.md`
- Roadmap per-item front matter: `id`/`slug`/`type`/`title`/`status ∈ {todo,doing,done,blocked}`; `type` MUST match its directory
- Hierarchy: child→parent reference to a nonexistent parent = **error**; parent→child array entry with no backing file = **warning** (#18′)
- `github-map.json`: **conditional** — absent ⇒ informational skip; present ⇒ valid JSON with `{milestones,epics,issues}` dicts whose ids exist in the roadmap

### Out of scope
- `index.md` regeneration (E1.3) · repair of `config.yml`/`specs`/per-item files · trackers beyond github-map validation

## 4. Behavior detail
- **Parsing** — `try: import yaml`; regex fallback limited to flat scalar keys. MUST strip inline `# …`
  comments, handle `null`, and handle block lists (`acceptance:`). MUST produce zero false positives
  on the committed `.dure/config.yml` and sample roadmap files.
- **Exit** — missing `.dure/` ⇒ exit 2 ("uninitialized"); any error-severity violation ⇒ exit 1;
  clean or warnings-only ⇒ exit 0.

## 5. Acceptance criteria (testable)
- **AC-a** Given fixtures {uninitialized, valid-full, one per single-violation-class}, When
  `dure-doctor.py` runs, Then it emits the exact JSON shape and the specified exit code (0/1/2) per fixture.
- **AC-b** Given the committed `.dure/config.yml` and sample roadmap files, Then dure-doctor reports
  zero false-positive violations (warnings allowed), running under `python3` on the target with no extra install.
- **AC-c** Given any `.dure/` state, When `--fix` runs, Then a byte-diff shows it touched ONLY missing
  dirs and an empty `.dure/active`; `config.yml`, `specs/*`, and per-item roadmap files are byte-identical.

## 6. Open questions (non-blocking)
- **OQ1** Add a fixture that forces the regex-fallback path (simulate PyYAML absent); the committed data only exercises the PyYAML path. Non-blocking.
