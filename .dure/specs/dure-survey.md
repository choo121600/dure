# dure-survey — Requirements Specification (spec.md)

> Status: **FIXED** · slug: `dure-survey` · Convergence evidence: [interview-logs/dure-survey.md](../interview-logs/dure-survey.md)
> First feature of milestone **M3 (Strategic planning)**. Produced by dure's own deep interview
> (dogfooding). Stop conditions (parent spec §4.4) met at Round 3 (`gate=PASS`, critic sign-off `pass`).

## 1. Vision
A deterministic, **report-only** survey of the project's own `.dure/` state that surfaces
**forward-looking planning signals** — "what a PM should do next" — as falsifiable evidence.
The survey is the *discovery engine* of M3: it emits only computable signals (no strategic
opinions). A later feature (E3.2, `/dure:direction`) turns these signals into a critiqued
direction proposal. Findings are **evidence** for a human / `/dure:interview` / `/dure:plan`,
NOT auto-created issues.

## 2. Locked decisions
| # | Decision | Value |
|---|---|---|
| D1 | Scope | Exactly 2 deterministic signals (§4): `closable-milestone`, `empty-epic` |
| D2 | Form/output | Python `scripts/dure-survey.py`; JSON `{status, counts, findings:[{check,severity,id,message}]}`; exit 0/1/2 |
| D3 | Boundary | **Discovery only** — emits to stdout; MUST NOT write to `.dure/roadmap/` |
| D4 | Severity | `info` (advisory opportunity); tunable via a `survey:` section in `config.yml` (defaults hard-coded) |
| D5 | Ownership | Disjoint from `dure-doctor` (integrity), `dure-audit` (debt, 4 checks), `dure-status` (completion/blockers/conflicts). Asserted by a test (AC-c). |

> D5 extends audit's ownership boundary into a four-way invariant: **doctor = is the state valid?**,
> **audit = is there code/process debt?**, **status = how complete is the planned work?**,
> **survey = what forward planning action is now available?** No two tools may own the same signal.

## 3. Scope
### In scope
- The 2 signals in §4, computed deterministically from front matter; JSON output.
### Non-goals (out of scope for v1)
- ❌ Writing/creating issues or any `.dure/roadmap/` mutation (D3)
- ❌ Subjective/strategic recommendations (those are E3.2 `/dure:direction`, behind a redteam sign-off gate)
- ❌ `planless-narrative` (prose-vs-canonical drift) — `roadmap.md` is an intentionally broader human
  narrative (its own header says so), so this would be a false-positive generator; and the canonical
  variant duplicates doctor's `ref:missing-backing`. Dropped.
- ❌ `stalled-epic` (epic done-in-fact but `status != done`) — deferred to a follow-up; it couples
  AC-b to live board state. Strong candidate for the next survey signal (§8 OQ1).
- ❌ Integrity / schema / orphan signals (owned by `dure-doctor`) · completion % (owned by `dure-status`)

## 4. Signals (deterministic)
Membership reuses the audit/status **union** convention so the survey can never disagree with them:
- a milestone's child epics = `milestone.epics ∪ {e : e.milestone == mid}`
- an epic's child issues = `epic.issues ∪ {i : i.epic == eid}`
- a milestone's descendant issues = `(⋃ child epics' child issues) ∪ {i : i.milestone == mid}`

1. **`closable-milestone`** (info) — a milestone that is ready to close. Fires iff ALL hold:
   - milestone `status != done`, AND
   - descendant count (epics + issues) > 0 (**vacuous-truth guard** — an empty milestone never fires), AND
   - every descendant **epic** has `status == done`, AND
   - every descendant **issue** has `status == done`.
   Emits `{check:"closable-milestone", severity:"info", id:<milestone id>, message}`.
   > Distinct from `dure-status` completion% (which is issue-only and never inspects the milestone's own
   > status field) and from audit's `done-parent-undone-child` (its logical inverse).

2. **`empty-epic`** (info) — an epic with no concrete work to do. Fires iff the epic's child-issue
   membership (`epic.issues ∪ {i : i.epic == eid}`) is **empty**. Emits
   `{check:"empty-epic", severity:"info", id:<epic id>, message}`.
   > Mutually exclusive with doctor's `ref:missing-backing` by construction: `empty-epic` loads the
   > epic's own front matter (backing file MUST exist); `ref:missing-backing` fires only when a
   > referenced id's backing file is ABSENT. No id can satisfy both.

## 5. Config (`survey:` section; defaults hard-coded when absent)
```yaml
survey:
  fail_on: error   # exit 1 only for findings with severity >= fail_on; info never fails (advisory)
```
The implementation MUST apply this default when `.dure/config.yml` has no `survey:` section.
Severity order: `info < warning < error`.

## 6. Output / exit
- `status`: `pass` (no finding ≥ `fail_on`) | `fail` (≥1 finding ≥ `fail_on`) | `error`.
- Exit: `0` advisory (default — `info` never fails) · `1` if any finding severity ≥ `survey.fail_on`
  · `2` internal error.
- **Robustness**: missing `.dure/roadmap/` → all loaders return `{}`, zero findings, exit 0.
  Unparseable front matter → the item is **silently skipped** (status treated as unknown, i.e. `!= done`,
  so a broken child can never make a parent vacuously closable). The survey MUST NOT emit any
  integrity/schema finding (that is doctor's `item:frontmatter` class).

## 7. Acceptance criteria (testable)
- **AC-a** (primary — synthetic fixtures) Given fixtures {a genuinely-closable milestone (all descendants
  done, milestone `doing`); a milestone with an undone descendant epic (no fire); a zero-descendant
  milestone (vacuous guard → no fire); a done milestone (no fire); an epic with zero child issues (fire);
  an epic with ≥1 child (no fire); a project with zero epics (no `empty-epic` fire); an empty/new project
  with no `roadmap/` (zero findings, exit 0); an item with malformed front matter (silently skipped, no
  integrity finding)}, When `dure-survey.py` runs, Then each yields exactly the expected findings
  (check + count) and JSON shape; exit 0 by default; exit 1 when `fail_on` is lowered to `info`.
- **AC-b** (secondary smoke test — committed repo as of this commit) Given the committed repo, Then
  `closable-milestone = 0` (m2 is not closable while epics `e2.2`/`e2.3` are `doing`) AND `empty-epic = 0`
  (every backed epic has ≥1 child issue), and NO finding overlaps a `dure-doctor`/`dure-audit`/`dure-status`
  class; runs under `python3`.
- **AC-c** Ownership disjointness: `dure-survey`'s check-class set `{closable-milestone, empty-epic}` is
  disjoint (no shared class name) from `dure-doctor`'s violation classes, `dure-audit`'s **4 implemented**
  check classes (`todo-marker`, `untested-script`, `done-parent-undone-child`, `unfinished-interview`),
  and `dure-status`'s reported fields — asserted by a test.

## 8. Open questions (non-blocking)
- **OQ1** `stalled-epic` (epic with all child issues `done` but `status != done`) is the strongest
  candidate for the next survey signal — disjoint from all three tools, forward-looking. Deferred only
  because it couples AC-b to live board state (it would fire on `e2.2`/`e2.3` today).
- **OQ2** The subjective direction-proposal layer (E3.2 `/dure:direction`) consumes these signals and
  MUST pass a `redteam-critic` sign-off gate + reduce to issues that satisfy `/dure:plan` AC3 — the two
  remaining M3 verification guards. Out of scope for this feature.
