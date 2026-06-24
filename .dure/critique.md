# dure — Red-Team Critique Ledger (critique.md)

> The result of applying dure's "aggressive red-team critique" to the spec/roadmap (draft).
> All items resolved → reflected in [`spec.md`](spec.md) v1.1.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| C1 | 🔴 BLOCKING | D3 ('CLI wrapping') ↔ D4 ('plugin') contradiction. A plugin is an extension *inside* a session, not an external orchestrator | **Decision**: plugin-first. Reinterpret D3 as "use Claude Code as the brain." Separate the core logic from the interface to keep the subprocess wrapping path open by design |
| C2 | 🔴 BLOCKING | Unclear whether the 'engine' is code or prompts | Engine MUST be defined as `skill instructions + subagent orchestration + file state` (spec §3.1) |
| C3 | 🔴 BLOCKING | The quantitative convergence gate is model self-assessed, so it can be gamed | Add to the stop conditions an **independent critique subagent sign-off** + the "zero new ambiguity in the previous round" objective signal + at least 1 round (spec §4.4) |
| C4 | 🟠 MAJOR | Subagent roles are absent from the design | Divide the 4 traits across subagents: grounding-scout / redteam-critic / research-scout / main orchestrator (spec §4.5) |
| C5 | 🟠 MAJOR | Sync direction undefined (tracking MUST read GitHub status) | Make it bidirectional: structure = local→GH push, status = GH→local pull, conflicts detected and reported (spec §5.3) |
| C6 | 🟠 MAJOR | Roadmap format mismatch (spec = separate files vs. itself = single file) | **Decision**: per-item files = source of truth, `index.md` = generated index (spec §5.1) |
| C7 | 🟠 MAJOR | Resume absent | Detect an in-progress interview log and continue (spec §4.6) |
| C8 | 🟠 MAJOR | Multi-spec selection absent | An 'active spec' pointer + slug selection (spec §6) |
| C9 | 🟠 MAJOR | Evidence collection runs away on a huge repo | Targeted grounding bounded by request keywords (spec §4.5 grounding-scout) |
| C10 | 🟡 MINOR | No default dimension weights | Problem×3 · Scope×3 · Acceptance×3 · Constraints×2 · Edge×2 · Stakeholders×1 (spec §4.2) |
| C11 | 🟡 MINOR | Sync tooling undecided | **Decision**: gh CLI first, github MCP fallback (spec §5.2) |
| C12 | 🟡 MINOR | Deployment/installation path undecided | Document the install path in the README; non-blocking for v1 (left as an OQ) |
