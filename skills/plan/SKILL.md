---
name: plan
description: dure decompose — break a finalized active spec into per-item milestone/epic/issue files and generate roadmap/index.md. Every issue MUST have testable acceptance criteria.
argument-hint: "[spec-slug]"
allowed-tools: Bash Read Grep Glob Write Task
disable-model-invocation: true
---

# /dure:plan — Issue Decomposition

Target spec: **$ARGUMENTS** (if empty, use the slug in `.dure/active`)

Goal: Following the decomposition model in [spec §5](../../.dure/spec.md), decompose a
finalized spec into milestones ⊃ epics ⊃ issues. The **per-item files are the source of
truth (canonical)** (`.dure/roadmap/{milestones,epics,issues}/<id>.md`); `roadmap/index.md`
is a generated index.

## Procedure
1. Run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-bootstrap.sh` (idempotent).
2. Determine the active spec: argument > `.dure/active` > ask the user. When asking the user,
   communicate in the user's language; keep all artifacts in English.
3. Decompose the spec into milestones/epics/issues. Each issue MUST have **non-empty, testable
   acceptance criteria**.
   - Per-item file frontmatter: `id`, `slug`, `type`, `title`, `status`, `github`, links,
     and (for issues) `acceptance`.
   - `id` MUST stay stable (re-decomposing the same spec → same id).
4. Review the decomposition with `redteam-critic`: critique missing/duplicate/oversized
   issues, then clean up (I1.3.3).
5. Generate `roadmap/index.md` (summary tree, marked do-not-edit).

For format examples, see the m1 / e1.2 / i1.2.5 samples in `.dure/roadmap/`.

---
> **Implementation status (E1.1 scaffold):** Procedure defined. The automatic decomposer and
> index generator MUST be implemented **in E1.3**.
