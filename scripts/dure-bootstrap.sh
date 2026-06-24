#!/usr/bin/env bash
# dure-bootstrap.sh — 타깃 repo에 .dure/ 상태 레이아웃을 멱등 생성 (I1.1.2)
# 기존 파일은 절대 덮어쓰지 않는다. macOS bash 3.2 호환(배열 미사용).
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
# dure config — 인터뷰 임계치·차원 가중치·GitHub 동기화 (spec §4.2 / §5 / §6)
interview:
  ambiguity_threshold: 1.0      # 런 레벨 가중 모호성 ≤ 임계치일 때 수렴 (§4.4)
  min_rounds: 1                 # 게이밍 방지: 최소 라운드 (§4.4 clause4)
  dimension_weights:            # §4.2
    problem: 3
    scope: 3
    acceptance: 3
    constraints: 2
    edge: 2
    stakeholders: 1
github:
  repo: null                    # "owner/name". null = 로컬 전용
  sync: gh                      # gh | mcp | off  (§5.2: gh 우선)
  epic_as: tracking-issue       # tracking-issue | sub-issues  (OQ3)
roadmap:
  id_prefix: ""                 # 항목 id 접두사(선택)
YAML
  created="$created config.yml"
fi

if [ ! -f "$DURE/active" ]; then
  : > "$DURE/active"            # 현재 active spec slug 포인터 (C8). 비어있음=미선택
  created="$created active"
fi

echo "dure: .dure/ ready at $DURE"
if [ -n "$created" ]; then
  echo "dure: created$created"
else
  echo "dure: nothing to create (preserved existing)"
fi
