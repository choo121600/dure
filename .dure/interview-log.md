# dure — Interview Convergence Ledger (interview-log.md)

> Subject: the dure project itself (meta). Method: apply the deep interview dure designed to dure.
> Result: stop conditions met in 3 rounds → locked into [`spec.md`](spec.md).
>
> Note: dure's runtime interview responds in the user's language; only the committed artifacts (such as this log) are kept in English.

## Round 0 — Component decomposition + evidence collection

- Input: "A TUI that leads the whole thing as an expert project PM. Converge
  requirements via deep interview → create and run milestones/epics/issues.
  + full audit. + strategic planning."
- Evidence collection: `/Users/yeonguk/Project/dure` is empty (greenfield, non-git).
  Confirmed the structure of the reference `deep-interview.md` (Huginn) — component
  decomposition, dimension scoring, opposing-view injection, threshold convergence,
  and `spec.md` / `interview-log.md` outputs.
- Components: ①identity/scope ②managed targets ③interface ④engine ⑤issue backend ⑥interview depth ⑦execution scope.

## Round 1 — Weak dimensions: 4 foundational decisions

| Question | Answer |
|---|---|
| Identity (relation to odin-loop) | **Fully independent, new** |
| Managed targets | **Any external codebase** |
| Tech stack / interface | *(undecided)* "Considering whether a TUI is best; would go a different way if the UX is better" |
| Agent engine | **Wrap the Claude Code CLI** |

- Red-team injection: "If the engine wraps Claude Code, building a new full-screen TUI is overkill —
  Claude Code already has a conversation loop + UI. A plugin fits the essence better." → Triggered a re-question on the interface.

## Round 2 — Weak dimension: interface + unlocked decisions

| Question | Answer |
|---|---|
| Interface form | **Claude Code plugin first** (TUI later) |
| Issue backend | **Hybrid: local-first + GitHub sync** |
| v1 priority slice | **Deep interview → issue decomposition** |

- Rationale: the user's existing assets (github MCP, gh-flow, qt-roadmap) lean GitHub →
  but since targets are "any codebase," GitHub independence is needed → a hybrid satisfies both constraints at once.

## Round 3 — Locking the differentiator: interview depth + execution scope

| Question | Answer |
|---|---|
| The concrete "beyond Huginn" traits | **All 4 traits**: code-grounded questions / aggressive red team / auto-research candidate answers / quantitative convergence gate |
| Scope of "running" (the execution boundary) | **Up to issue creation + progress tracking** (auto-implementation is a non-goal) |

- Red-team injection: "Reading 'I want to make it run' as auto-implementation would blow up v1." →
  Disciplined the execution boundary to tracking only, and isolated auto-implementation to a later milestone.

## Stop-condition check

| Condition | Status |
|---|---|
| 1. Run-level ambiguity ≤ threshold | ✅ All 8 decision dimensions clear (≤1) |
| 2. Testable acceptance criteria for every active component | ✅ spec §7 AC1–AC6 |
| 3. Zero unresolved blocking open questions | ✅ Remaining OQ1–OQ3 are non-blocking (decided during build) |

→ **Convergence complete.** Spec FIXED; proceed to roadmap decomposition.

## Round 4 — Red-team critique pass (distilling before build)

Applied dure's "aggressive red-team critique" to the spec/roadmap draft. Details in [`critique.md`](critique.md).
12 findings including 1 BLOCKING contradiction → all resolved. 3 user forks:

| Fork | Decision |
|---|---|
| C1 architecture (D3↔D4 contradiction) | Plugin-first; the wrapping path kept open by design (D3 reinterpreted: "Claude Code as the brain") |
| C6 roadmap format | Per-item files = source of truth + generated index |
| C11 sync tooling | gh CLI first, MCP fallback |

The remaining 9 (C2·C3·C4·C5·C7·C8·C9·C10·C12) were auto-resolved per the recommended option → reflected in spec v1.1.
Key reinforcements: subagent division of labor (§4.5), anti-gaming guard for the convergence gate (§4.4), bidirectional sync (§5.3), resume (§4.6).
