#!/usr/bin/env bash
# dure-bootstrap.sh — idempotently create the .dure/ state layout in the target repo (I1.1.2).
# Never overwrites existing files. Compatible with macOS bash 3.2 (no arrays).
set -eu

ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
DURE="$ROOT/.dure"

mkdir -p \
  "$DURE/specs" \
  "$DURE/interview-logs" \
  "$DURE/roadmap/milestones" \
  "$DURE/roadmap/epics" \
  "$DURE/roadmap/issues" \
  "$DURE/sync"

created=""

if [ ! -f "$DURE/config.yml" ]; then
  cat > "$DURE/config.yml" <<'YAML'
# dure config — interview thresholds, dimension weights, GitHub sync (spec §4.2 / §5 / §6)
interview:
  ambiguity_threshold: 1.0      # converge when run-level weighted ambiguity <= threshold (§4.4)
  min_rounds: 1                 # anti-gaming: minimum rounds (§4.4 clause 4)
  dimension_weights:            # §4.2
    problem: 3
    scope: 3
    acceptance: 3
    constraints: 2
    edge: 2
    stakeholders: 1
github:
  repo: null                    # "owner/name". null = local-only
  sync: gh                      # gh | mcp | off  (§5.2: gh first)
  epic_as: tracking-issue       # tracking-issue | sub-issues  (OQ3)
roadmap:
  id_prefix: ""                 # optional item id prefix
YAML
  created="$created config.yml"
fi

if [ ! -f "$DURE/active" ]; then
  : > "$DURE/active"            # pointer to the current active spec slug (C8). empty = none selected
  created="$created active"
fi

echo "dure: .dure/ ready at $DURE"
if [ -n "$created" ]; then
  echo "dure: created$created"
else
  echo "dure: nothing to create (preserved existing)"
fi
