---
slug: dure-direction
title: dure-direction — direction-proposal layer (E3.2 entry)
status: converged          # in-progress | converged
threshold: 1.0
created_round: 0
---

# dure-direction — Interview Convergence Ledger

> dure interviewing dure (dogfooding). The second half of M3 (the direction-proposal layer) converged in
> 3 scored rounds; the deterministic gate (`dure-gate.py`) decided convergence. Interview ran in the
> user's language; this artifact is English (ADR-0007).

## Components
- C1 `dure-direction` — the deterministic direction-proposal **validator** (`dure-proposal.py`) + the
  `.dure/directions/<slug>.md` schema; first feature of E3.2.

## Round 0 — Decomposition + evidence
- Request: build M3's second half — turn survey signals into a critiqued direction proposal that feeds
  `/dure:plan`. Insight: dure already owns the deep-interview engine + gate (M1) and the survey (E3.1),
  so the genuinely new, testable thing is the **validated, structured direction artifact** between
  interview and planning.
- **Evidence**: `spec.md` §4 + `scripts/dure-gate.py` (anti-gaming gate), `skills/plan/SKILL.md` +
  `dure-index.py` (roadmap source-of-truth), `.dure/specs/dure-survey.md` (D3 report-only boundary,
  dropped-planless-narrative drift lesson), `.dure/interview-logs/dure-survey.md` (already embeds verbatim
  gate JSON — the precedent for the sign-off).

## Round 1 — Score + targeted questions
- Decisions fixed via structured choice: first feature = **skill + deterministic proposal validator**;
  the three guards (deterministic core / redteam sign-off / reduce-to-issues) were already chosen for M3.
- Initial design: `/dure:direction` skill + `dure-proposal.py` validating a new `.dure/proposals/` doc
  carrying a `redteam_signoff: pass` field and "≥2 critiqued options / ≥1 testable acceptance".

## Round 2 — Red-team (gate BLOCK)
- **redteam-critic** `signoff: fail`, verified against the repo:
  (B1) the `redteam_signoff: pass` field is **theater** — strictly weaker than `dure-gate.py:cond2`,
  which itself recomputes arithmetic and takes the critic verdict from a separate context;
  (B2) "≥2 *critiqued* options" and "*testable* acceptance" are NOT deterministically checkable — the repo
  already delegates "testable?" to the critic, not a script — so they are presence checks wearing oracle
  clothing; (B3) candidate issues with acceptance in the doc create a **second source of truth** colliding
  with `/dure:plan` + `dure-index.py` (the prose-vs-canonical drift the survey spec refused to scan).
  Non-blocking: (N1) `.dure/proposals/` largely duplicates the interview-log+gate; (N3) "skill + validator
  + artifact + sign-off" is several features in a trench coat.

## Round 3 — Resolve + re-sign-off (gate PASS)
- Revisions: **B1** drop the boolean; embed the **verbatim `dure-gate.py` PASS block** and require
  `gate == "PASS"` (+ real output shape + `failed == []` consistency, so a `{"gate":"PASS"}` stub fails).
  **B2** downgrade every check to presence/structure, drop all "testable" naming; delegate semantics to the
  embedded gate. **B3** candidate issues are a **non-canonical sketch** (no roadmap schema); validator never
  writes `.dure/`; `/dure:plan` re-derives the canonical roadmap. **N1** `.dure/directions/<slug>.md` is the
  direction-analog of `specs/` (distilled, validated, plan-ready output ≠ the prose ledger) — it earns its
  place because it is the only validated artifact at the pre-plan gate. **N3** first slice = validator +
  schema + gate-reuse; the skill orchestration is deferred. **N2** add a five-way disjointness test for the
  `direction:*` namespace.
- **redteam-critic** re-review: B1/B2/B3 genuinely resolved (not relabeled), N1 artifact justified, the
  `direction:*` namespace verified collision-free against doctor/audit/survey/status. Four AC tightenings
  folded (real-gate-shape forgery check, whole-`.dure/`-tree no-write snapshot, exact `violations[{check}]`
  keys + non-empty guard, single `direction` noun). `signoff: pass`.

```json
{"gate":"PASS","run_level_max":0.571,"run_level_mean":0.571,"threshold":1.0,"min_rounds":1,"round":3,
 "per_component":[{"name":"dure-direction","weighted_ambiguity":0.571,"testable_signoff":"pass"}],
 "failed":[]}
```

## Stop-condition check (gate-enforced, parent spec §4.4)
| Condition | Status |
|---|---|
| 1. Run-level weighted ambiguity ≤ threshold | ✅ 0.571 ≤ 1.0 |
| 2. Critic testable sign-off = pass | ✅ pass |
| 3. Zero blocking open questions | ✅ 0 |
| 4. round ≥ min_rounds AND zero new ambiguity | ✅ round 3, new 0 |

→ **Converged.** Spec FIXED → [`specs/dure-direction.md`](../specs/dure-direction.md). Next: `/dure:plan`.
