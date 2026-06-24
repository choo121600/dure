# dure — Requirements Specification (spec.md) · v1.1

> Status: **FIXED (v1 scope)** · Convergence evidence: [`interview-log.md`](interview-log.md) · Critique: [`critique.md`](critique.md)
> v1.1 reflects red-team critique C1–C12 (architecture-contradiction fix, subagent division of labor,
> anti-gaming convergence gate, bidirectional sync, etc.).
> This document is the output of dure applying its own deep interview + red-team critique to itself (dogfooding).
> Normative keywords (MUST/SHOULD/MAY) follow RFC 2119. Architectural decisions are recorded as
> ADRs under [`docs/adr/`](../docs/adr/).

## 1. Vision

dure is an agent that attaches to a codebase and acts as its PM. It takes vague user input,
runs a deep interview **until requirements understanding has sufficiently converged**, decomposes
the fixed requirements into milestones/epics/issues, and tracks progress. The brain is Claude Code.

## 2. Locked decisions (see `docs/adr/`)

| # | Decision | Value | ADR |
|---|---|---|---|
| D1 | Identity | Fully independent project (no odin-loop dependency) | [0001](../docs/adr/0001-deliver-as-in-process-claude-code-plugin.md) |
| D2 | Managed targets | Any external codebase | [0002](../docs/adr/0002-operate-on-arbitrary-external-codebases.md) |
| D3 | Engine | Claude Code as the brain (in-process; wrapper path kept open, §3.1) | [0001](../docs/adr/0001-deliver-as-in-process-claude-code-plugin.md) |
| D4 | Interface | Claude Code plugin first (TUI deferred to M4) | [0001](../docs/adr/0001-deliver-as-in-process-claude-code-plugin.md) |
| D5 | Issue backend | Hybrid: local-first source of truth + GitHub sync | [0003](../docs/adr/0003-hybrid-local-first-issue-backend.md) |
| D6 | v1 slice | Deep interview → issue decomposition + progress tracking | — |
| D7 | Interview depth | All four traits (§4) | [0004](../docs/adr/0004-four-trait-deep-interview-engine.md) |
| D8 | Execution scope | Up to issue creation + progress tracking | — |
| D9 | Working language | English artifacts; localized runtime interview | [0007](../docs/adr/0007-english-artifacts-localized-runtime.md) |

## 3. v1 scope

### In scope
- `/dure:interview <one-line input>` — the deep-interview convergence loop (resumable, §4.6)
- Crystallize fixed requirements into `.dure/specs/<slug>.md`
- `/dure:plan` — decompose the active spec into milestones/epics/issues (`.dure/roadmap/`)
- `/dure:sync` — idempotent local ↔ GitHub sync (structure push / status pull, §5.3)
- `/dure:status` — progress tracking/report (local + GitHub merge)
- The `.dure/` state layout inside the target repo (§6)

### Non-goals (out of scope for v1)
- ❌ Auto-implementation of issues (branch/code/PR) → M5 or delegated to gh-flow
- ❌ Full audit → M2 · ❌ Strategic planning → M3 · ❌ Full-screen TUI → M4
- ❌ Trackers other than GitHub (Jira/Linear)

### 3.1 Architecture: what is code vs. prompt (ADR-0001, ADR-0004)
In v1, dure is a plugin that runs inside Claude Code. The "engine" is concretely:

- **Prompt/skill** — the *methodology* of the convergence loop, critique, and decomposition is
  expressed in `skills/*/SKILL.md` instructions that **the model follows**. It is not algorithmic code.
- **Subagents** — evidence gathering, red-team, and research are separated into independent
  subagents (§4.5).
- **Small deterministic code (bash/python)** — only the parts that REQUIRE determinism are scripts:
  file I/O, `.dure/` bootstrap, `gh` calls, idempotent mapping, and the convergence gate.
- **State** — all cross-round persistence is files (`interview-logs/`, `roadmap/`, `sync/`).

> The core methodology logic MUST stay separable from the interface (slash commands) so it can be
> re-hosted behind a subprocess wrapper or standalone TUI later (M4).

## 4. Deep-interview engine ("beyond Huginn")

Per D7, all four traits below MUST hold. Each is realized by the subagents in §4.5.

1. **Evidence-grounded questions** — before asking, read actual code/structure/existing issues
   (grep/read) and ask/propose candidate answers *from evidence, not guesses*. (grounding-scout)
2. **Aggressive red-team critique** — every round, inject cross-examination that tries to *break*
   the requirements: hidden assumptions, edge cases, failure modes, simpler alternatives. (redteam-critic)
3. **Auto-research candidate answers** — when the user does not know or delegates, research sourced
   candidate answers and let them choose; otherwise propose a conservative auto-answer. (research-scout)
4. **Quantitative convergence gate** — score ambiguity honestly and stop only when the
   anti-gaming-guarded stop conditions (§4.4) are met. *Every score is an honest self-assessment.*

### 4.1 Convergence loop
```
Round 0  Decompose the request into components. Collect bounded evidence via grounding-scout.
Round N
  1. (evidence) grounding-scout reads code/issues within keyword scope → context + candidate answers
  2. (score)    self-assess component × dimension ambiguity (0 = clear … 5 = pitch black)
  3. (ask)      target the weakest dimension with 1–4 questions (structured choice + free-form, with candidates)
  4. (red-team) redteam-critic injects ≥1 requirement-breaking cross-examination
  5. (research) research-scout candidate answers when the user defers
  6. (converge) update scores → evaluate stop conditions via dure-gate.py
```

### 4.2 Ambiguity dimensions + weights
| Dimension | Weight | Asks |
|---|---|---|
| Problem | 3 | The real problem/motivation being solved |
| Scope | 3 | What is in / out |
| Acceptance | 3 | How completion is judged in a testable way |
| Constraints | 2 | Technical/time/dependency/compatibility |
| Edge | 2 | Edge cases, failure modes, rollback |
| Stakeholders | 1 | Who uses it and who is affected |

Run-level ambiguity = the **weighted average** of dimension scores (per component; the run-level
value used by the gate is the worst/maximum component, §4.4).

### 4.3 Artifacts
- `.dure/specs/<slug>.md` — the fixed spec (same structure as this document)
- `.dure/interview-logs/<slug>.md` — per-round ledger of scores, evidence files, red-team items, decisions

### 4.4 Stop conditions + anti-gaming guard (ADR-0005)
Convergence is decided by `scripts/dure-gate.py`, not by self-declaration. The gate MUST require all of:
1. Run-level (weakest component) weighted ambiguity ≤ `ambiguity_threshold` (default 1.0, configurable).
2. Every active component has testable acceptance criteria — **`redteam-critic` MUST sign this off**
   (`pass`); this is the guard that self-declaration cannot open.
3. Zero unresolved blocking open questions.
4. (objective signal) `round ≥ min_rounds` AND zero new ambiguity in the previous round.

### 4.5 Subagent division of labor (ADR-0004)
| Subagent | Permissions | Role |
|---|---|---|
| grounding-scout | read-only | Keyword-**bounded** code/issue evidence + candidate answers (C9) |
| redteam-critic | read-only | Per-round cross-examination + §4.4 clause-2 sign-off |
| research-scout | web/read | Sourced candidate answers |
| (main) orchestrator | — | Scoring, questioning, synthesis, crystallization |

> Rationale: separation avoids same-context self-censorship and yields *independent* challenge and evidence.

### 4.6 Resume (C7)
When `/dure:interview` is re-invoked and an in-progress log (unmet stop conditions) exists, dure MUST
detect it and offer to continue from the last round. A new slug starts a new interview. Convergence
survives across sessions.

## 5. Issue decomposition model

- **Hierarchy**: milestone ⊃ epic ⊃ issue. Every issue MUST have testable acceptance criteria.

### 5.1 Local format — per-item files = source of truth (ADR-0003)
- `roadmap/{milestones,epics,issues}/<id>.md` (front matter `id`·`slug`·`status`·`github`·links +
  body; issues also carry `acceptance`).
- `roadmap/index.md` is a **generated** human index (summary tree), NOT the source of truth.
- The stable `id` is the key for idempotent sync.

### 5.2 Sync tooling (ADR-0006)
- `gh` CLI is primary (token-based, robust for distribution/headless). GitHub MCP MAY be a fallback.

### 5.3 GitHub mapping + direction (idempotent)
- milestone → GitHub Milestone · epic → tracking issue (label `epic`, child checklist) · issue → GitHub Issue
- **Structure = local → GitHub push**, **status = GitHub → local pull** (closed/labels/assignee)
- Conflicts (both sides changed) MUST be detected and reported, never auto-merged.
- Mapping cache: `sync/github-map.json` (local `id` ↔ GitHub number)
- dure MUST function fully with no GitHub connection (push/pull are skipped and reported).

## 6. State layout (inside the target repo's `.dure/`)
```
.dure/
  config.yml            # thresholds, weights, GitHub repo, sync settings
  active                # pointer to the current active spec slug (C8)
  specs/<slug>.md
  interview-logs/<slug>.md
  roadmap/
    milestones/<id>.md  # source of truth (per-item files)
    epics/<id>.md
    issues/<id>.md
    index.md            # generated index
  sync/github-map.json
```

## 7. v1 acceptance criteria (all MUST pass for v1 completion)
Phrased Given/When/Then where natural; each is observable and testable.

- **AC1** Given an empty polyglot repo or an existing repo, When `/dure:interview` runs, Then it
  MUST crystallize a spec ONLY after the §4.4 stop conditions (guard included) are met.
- **AC2** Given a completed interview, Then the log MUST contain, observably: (a) evidence file
  paths read, (b) red-team questions, (c) candidate-answer sources, (d) per-round scores.
- **AC3** Given an active spec, When `/dure:plan` runs, Then it MUST produce per-item files in which
  every issue has a non-empty, testable acceptance criterion.
- **AC4** Given a synced roadmap, When `/dure:sync` runs twice in a row, Then no duplicate
  issues/milestones are created (idempotent).
- **AC5** When `/dure:status` runs, Then it MUST merge local + GitHub status into an accurate
  completion rate and blocker list.
- **AC6** Given no GitHub connection, Then AC1–AC3 and the local portion of AC5 MUST still work.
- **AC7** Given an interrupted interview, When `/dure:interview` is re-invoked, Then it MUST resume (§4.6).

## 8. Open questions (non-blocking for v1)
- **OQ1 (resolved)** Question presentation = structured choice by default + free-form, with cited candidates.
- **OQ2 (resolved)** Dimension weights = §4.2 defaults; tune via dogfooding.
- **OQ3** GitHub sub-issues (beta) vs. checklist — default checklist, use sub-issues when available; decided at sync implementation.
- **OQ4** Distribution/install path (plugin marketplace vs. git clone) — documented in README, non-blocking for v1.
