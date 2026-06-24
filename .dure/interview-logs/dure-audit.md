---
slug: dure-audit
title: dure-audit — repo health scanner (M2 entry)
status: converged          # in-progress | converged
threshold: 1.0
created_round: 0
---

# dure-audit — Interview Convergence Ledger

> dure interviewing dure (E1.6 dogfooding — the full interview→plan→sync loop). Converged in 3 scored
> rounds; the deterministic gate (`dure-gate.py`) decided convergence. Interview ran in the user's
> language; this artifact is English (ADR-0007).

## Components
- C1 `dure-audit` — a deterministic, report-only repo scanner (first feature of M2)

## Round 0 — Decomposition + evidence
- Request: a deterministic scanner that inventories repo findings (debt/structure/missing-tests/stale)
  as evidence for `/dure:plan`.
- **Evidence (grounding-scout)**: read `roadmap.md` (M2 vision), `spec.md` §3.1, `dure-doctor.py` /
  `dure-status.py` (output/exit conventions), test/script naming conventions, `plan/SKILL.md` (how
  findings feed planning). Derived candidate check sets + the "findings are evidence, not auto-issues" boundary.

## Round 1 — Score + targeted questions
- Scores (problem 1, scope 3, acceptance 3, constraints 2, edge 2, stakeholders 1) → weighted **2.14 > 1.0**.
- Decisions: Scope = **Narrow/high-signal**, Form = **Python + JSON + exit**, Boundary = **inventory only**,
  Severity = **tiered + `audit:` config**.

## Round 2 — Red-team (gate BLOCK)
- **redteam-critic** `signoff: fail`, verified against the repo, with high-severity blockers:
  (B1) "stale status" unfalsifiable — `status` field vs prose markers already contradict in committed data;
  (B2) orphan/hierarchy checks DUPLICATE `dure-doctor`; (B3) TODO scan = 100% false positives on the real
  repo (0 real markers); (B4) `untested-script` flags intentionally-manual `dure-gate.py`; (B5) oversized-LOC
  flags the best-tested file; (B6) `audit:` config section is vaporware.

```json
{"gate":"BLOCK","run_level_max":1.643,"failed":[
  "cond1: run_level_max 1.643 > threshold 1.0",
  "cond2: critic signoff missing -> ['dure-audit']",
  "cond3: 4 blocking open question(s)",
  "cond4: new_ambiguity_last_round 4 != 0"]}
```

## Round 3 — Resolve + re-sign-off (gate PASS)
- Revisions: drop orphan (#5, doctor owns it) + oversized-LOC (#3); redefine #4 as `done-parent-undone-child`
  (front-matter oracle); pin TODO rule to case-sensitive `\b(TODO|FIXME)\b`; add `untested_allowlist:[dure-gate]`;
  add the `audit:` config section (defaults hard-coded). Ownership boundary vs `dure-doctor` written.
- **redteam-critic** re-review: all 6 blockers resolved, no new blocker (2 non-blocking implementer notes,
  both guarded by AC-b), `signoff: pass`.

```json
{"gate":"PASS","run_level_max":0.143,"min_rounds":1,"round":3,"failed":[]}
```

## Stop-condition check (gate-enforced, parent spec §4.4)
| Condition | Status |
|---|---|
| 1. Run-level weighted ambiguity ≤ threshold | ✅ 0.143 ≤ 1.0 |
| 2. Critic testable sign-off = pass | ✅ pass |
| 3. Zero blocking open questions | ✅ 0 |
| 4. round ≥ min_rounds AND zero new ambiguity | ✅ round 3, new 0 |

→ **Converged.** Spec FIXED → [`specs/dure-audit.md`](../specs/dure-audit.md). Next: `/dure:plan`.
