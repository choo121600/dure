# dure — Roadmap (Milestones / Epics / Issues) · v1.1

> The result of distilling [`spec.md`](spec.md) v1.1 into dure's decomposition model. v1 = **M1**.
> **Format note (C6):** The source of truth (canonical) is the per-item files at
> `roadmap/{milestones,epics,issues}/<id>.md`. This `roadmap.md` is the *human-facing
> full plan for the bootstrap phase*; the formal per-item files and `roadmap/index.md`
> are generated and canonicalized by `/dure:plan` (I1.3.1).
> For canonical format samples, see the m1 / e1.2 / i1.2.5 files under `roadmap/`.

---

## M1 — Deep interview → issue decomposition + progress tracking *(v1)*

> The user throws in a single line, and out come a converged spec, milestones/epics/issues, and visible progress.

### E1.1 Plugin scaffold + state
- **I1.1.1** Define `.claude-plugin/plugin.json` + the command surface (`/dure:interview|plan|sync|status`).
  - AC: Inside `claude`, the four slash commands are recognized and each stub responds.
- **I1.1.2** `.dure/` bootstrap + `config.yml` (thresholds, weights, repo, sync) + `active` pointer.
  - AC: On first run, `.dure/` is created if absent and preserved if present. The default thresholds/weights (§4.2) are populated.
- **I1.1.3** Target repo detection utility (git/non-git, empty/existing).
  - AC: Across all four combinations, the context is reported without errors.

### E1.2 Deep interview engine (core)
- **I1.2.1** Component decomposition + weighted ambiguity-dimension scoring model (§4.2).
  - AC: For a single input, the component list + per-dimension score table + weighted average are recorded in the log.
- **I1.2.2** `grounding-scout` subagent — **bounded** evidence collection and candidate answers driven by request keywords. *(Trait ①, C9)*
  - AC: The log records (read file paths + derived candidate answers) as evidence, and the read scope is bounded by keywords.
- **I1.2.3** `redteam-critic` subagent — cross-examination / edge cases / simpler alternatives every round. *(Trait ②)*
  - AC: Every round's log contains ≥1 red-team item.
- **I1.2.4** `research-scout` subagent — auto-research candidate answers + conservative auto-answer. *(Trait ③)*
  - AC: When the user answers "don't know / delegate", a candidate answer with a cited source is presented.
- **I1.2.5** Convergence gate + stop conditions + **anti-gaming guard** (§4.4). *(Trait ④, C3)*
  - AC: The spec MUST NOT be locked before critic sign-off + objective signals (at least 1 round complete, zero new ambiguity).
- **I1.2.6** Crystallize — produce `specs/<slug>.md` + `interview-logs/<slug>.md`.
  - AC: The produced spec satisfies the §1 template structure (vision, decisions, scope, AC).
- **I1.2.7** Resume — detect in-progress logs and continue from the last round. *(C7, AC7)*
  - AC: Re-invoking an interrupted interview continues with scores and decisions preserved.

### E1.3 Issue decomposer
- **I1.3.1** Select the active spec + decompose spec → milestone/epic/issue **per-item files**. *(C8, C6)*
  - AC: Every generated issue has a non-empty, testable AC (spec AC3). Per-item files carry a stable `id`.
- **I1.3.2** `roadmap/index.md` generator (summary tree). *(C6)*
  - AC: The index matches the state of the per-item files (a generated artifact, not the source of truth).
- **I1.3.3** Decomposition review pass — critique missing / duplicate / oversized issues, then clean up.
  - AC: Re-decomposing the same spec keeps `id`/`slug` stable.

### E1.4 GitHub sync
- **I1.4.1** `gh` CLI adapter (MCP fallback) + idempotent `sync/github-map.json` mapping. *(C11)*
  - AC: Running twice in a row creates no duplicate issues/milestones (spec AC4).
- **I1.4.2** Push structure — milestone = Milestone, epic = tracking issue, issue = Issue. *(C5)*
  - AC: The local structure is mirrored 1:1 to GitHub and the mapping is cached.
- **I1.4.3** Pull status + conflict detection/reporting + graceful offline handling. *(C5)*
  - AC: Issues closed on GH are reflected locally; when both sides change, the conflict is reported with no auto-merge. When not connected, a skip is reported (spec AC6).

### E1.5 Progress tracking
- **I1.5.1** Status model (todo/doing/done/blocked) + local↔GitHub merge / conflict detection.
  - AC: On status mismatch, the conflict is detected and reported.
- **I1.5.2** `/dure:status` progress report (per-milestone completion rate, blockers).
  - AC: The merged report yields an accurate completion rate and blocker list (spec AC5).

### E1.6 Dogfooding validation
- **I1.6.1** Actually run dure's interview→decomposition on dure's own next feature (part of M2).
  - AC: A spec/roadmap of quality equivalent to a hand-written one is generated automatically.

---

## M2 — Full audit *(later)*
Full codebase scan → debt/bug/structure/security inventory → feed into the M1 decomposition pipeline.

## M3 — Strategic planning *(later)*
Self-discover "what is needed next" from the current state → a plan distilled through deep interview + rigorous critique → turn into milestones.

## M4 — Full-screen TUI dashboard *(after validation)*
If the plugin UX is validated as a limiting factor, add a milestone board, interview progress, and audit views. Re-host the core logic per §3.1 (the wrapping path).

## M5 — Execution orchestration *(optional)*
Issue → branch/implement/verify/PR automation (or delegate to gh-flow). The auto-implementation that was a non-goal in v1.

---

### Dependency order
`E1.1 → E1.2 → E1.3 → (E1.4 ∥ E1.5) → E1.6` · M2/M3 reuse M1's decomposition pipeline.
