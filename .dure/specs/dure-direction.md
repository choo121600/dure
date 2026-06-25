# dure-direction — Requirements Specification (spec.md)

> Status: **FIXED** · slug: `dure-direction` · Convergence evidence: [interview-logs/dure-direction.md](../interview-logs/dure-direction.md)
> First feature of epic **E3.2 (direction-proposal layer)** under milestone M3. Produced by dure's own
> deep interview. Stop conditions met at Round 3 (`gate=PASS`, critic sign-off `pass`).

## 1. Vision
The second half of M3: turn the survey's forward-looking signals into a **critiqued direction
proposal** that feeds `/dure:plan`. The deterministic, testable core of that subjective layer is a
**direction-proposal validator** — `scripts/dure-proposal.py` — that checks a `.dure/directions/<slug>.md`
document is *structurally complete and gate-ready* before it may drive planning. The subjective
synthesis (running evidence + interview to author the document) is the `/dure:direction` skill, built
on top (a later issue in this epic).

## 2. Locked decisions
| # | Decision | Value |
|---|---|---|
| D1 | Scope (first slice) | Deterministic validator `dure-proposal.py` + the `.dure/directions/<slug>.md` schema. The `/dure:direction` orchestration skill is a later issue. |
| D2 | Form/output | Python `scripts/dure-proposal.py`; JSON `{status, violations:[{check, message}]}`; exit 0/1/2 |
| D3 | Boundary | **Validate only** — emits to stdout; MUST NOT write anywhere under `.dure/` (incl. `roadmap/`) |
| D4 | Sign-off | Gate-readiness is the **reused `dure-gate.py` PASS**, embedded verbatim in the document — NOT a hand-typed boolean. Anti-gaming is inherited from `dure-gate.py`, never re-invented. |
| D5 | Issue source-of-truth | Candidate issues in a direction doc are a **non-canonical sketch**; `/dure:plan` re-derives the canonical roadmap. The doc is consumed, never synced. |
| D6 | Naming | One noun — `direction`: skill `/dure:direction`, artifact `.dure/directions/`, classes `direction:*`. (Script keeps the user's "proposal validator" wording: `dure-proposal.py`.) |
| D7 | Ownership | Validates `.dure/directions/` docs (a new artifact). Disjoint from doctor/audit/survey/status (the five-way invariant). Asserted by a test. |

## 3. Scope
### In scope (first slice)
- The `.dure/directions/<slug>.md` schema (§4) and `dure-proposal.py` validating it (§5).
### Non-goals (out of scope for this slice)
- ❌ The `/dure:direction` orchestration skill (evidence → interview → write doc → validate → hand to plan) — a later issue in E3.2.
- ❌ Any semantic judgement — "is the critique real?", "is the acceptance *testable*?", "are the options *distinct*?" — those are the critic's job, delegated via the embedded gate PASS, never asserted by the script (B2).
- ❌ Writing canonical roadmap issues (D5) · ❌ writing/normalizing any `.dure/` file (D3).
- ❌ A second sign-off mechanism — the only gate is the reused `dure-gate.py` block (D4, B1).

## 4. The `.dure/directions/<slug>.md` schema
The **distilled, plan-ready** direction proposal — the direction-analog of `specs/<slug>.md` (a spec
describes one converged feature; a direction argues among options and picks one). Distinct from the
round-ledger `interview-logs/<slug>.md`. Front matter `slug`, `kind: direction`, `status`; body:

- **Problem / Motivation** — non-empty section.
- **Options** — ≥2 option blocks, each with a non-empty **Critique**.
- **Chosen direction** — a marker naming the chosen option + a non-empty **Rationale**.
- **Candidate issues** — ≥1 sketch entry, free-form `- <title> | acceptance: <non-empty string>`,
  deliberately WITHOUT the roadmap `id/slug/status/github` schema (so `dure-index.py`, which loads only
  files with an `id`, can never mistake it for canonical work).
- **Gate** — the **verbatim `dure-gate.py` output block** embedded (the `{gate, run_level_max, threshold,
  round, per_component:[{name, weighted_ambiguity, testable_signoff}], failed}` JSON), as
  `interview-logs/dure-survey.md` already records it.

## 5. Validator checks (deterministic, presence/structure only — zero oracle)
`dure-proposal.py <path>` emits `violations:[{check, message}]`. Check classes (the `direction:*` namespace):
1. `direction:frontmatter` — front matter parses and has `slug` + `kind: direction`.
2. `direction:problem-missing` — Problem/Motivation section present and non-empty.
3. `direction:options-too-few` — fewer than 2 option blocks.
4. `direction:option-critique-missing` — an option block has no non-empty critique.
5. `direction:chosen-missing` — no chosen-direction marker.
6. `direction:rationale-missing` — chosen direction has an empty rationale.
7. `direction:candidate-issue-missing` — fewer than 1 candidate-issue sketch.
8. `direction:acceptance-missing` — a candidate-issue sketch has an empty acceptance string.
9. `direction:gate-not-pass` — the embedded gate block is absent/unparseable, does NOT match
   `dure-gate.py`'s real output shape (`run_level_max`, `threshold`, `failed`, and a non-empty
   `per_component` whose entries each carry `name`, a numeric `weighted_ambiguity`, and
   `testable_signoff`), has `gate != "PASS"`, or is **internally inconsistent with a real PASS** — i.e.
   any of: `failed` non-empty, `run_level_max > threshold`, `run_level_max != max(weighted_ambiguity)`,
   or any component `testable_signoff != "pass"`. It cannot prove a run happened, but it rejects any
   block a real `dure-gate.py` run could never emit (a bare `{"gate":"PASS"}` stub MUST fail). B1-residual.

No check names or asserts "testable" — semantic validity is the embedded gate's (critic's) responsibility.

## 6. Output / exit
- `status`: `pass` (no violations) | `fail` (≥1 violation) | `error` (e.g. unreadable path).
- Exit: `0` valid · `1` ≥1 violation · `2` internal error.

## 7. Acceptance criteria (testable; fixtures-primary)
- **AC-a** Given a complete, gate-PASS direction doc, When `dure-proposal.py` runs, Then status pass,
  zero violations, exit 0.
- **AC-b** Given a doc missing/emptying each section in turn (no problem, <2 options, an option with no
  critique, no chosen marker, empty rationale, no candidate issue, an empty acceptance), Then exactly the
  corresponding `direction:*` violation fires; exit 1.
- **AC-c (gate forgery)** Given a doc whose embedded block is a truncated `{"gate":"PASS"}` stub, or
  `gate:"PASS"` with non-empty `failed`, or `gate:"BLOCK"`, or absent, Then `direction:gate-not-pass`
  fires.
- **AC-d (no writes)** Given any run, Then the entire `.dure/` tree is byte-for-byte unchanged before
  and after (snapshot the whole tree, not only `roadmap/`).
- **AC-e (disjointness)** `dure-proposal.py`'s `direction:*` class set is non-empty and shares no class
  name with `dure-doctor` / `dure-audit` (4) / `dure-survey` (2) / `dure-status` — asserted by a test.

## 8. Open questions (non-blocking)
- **OQ1** The `/dure:direction` skill (orchestration: run survey/audit/status as evidence → run the deep
  interview targeting *which direction* → write `.dure/directions/<slug>.md` → validate → hand the chosen
  direction to `/dure:plan`) is the next issue in E3.2, built on this validator.
- **OQ2** Whether a converged direction's interview-log should carry a `kind: direction` marker is a
  skill-time detail, deferred to OQ1's issue.
