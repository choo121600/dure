#!/usr/bin/env bash
# dure-context.sh — 타깃 repo 컨텍스트 감지: git/non-git, green/brownfield (I1.1.3)
# 어떤 조합에서도 오류 없이 key=value 라인을 출력한다.
set -eu

ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$ROOT"

# git 여부
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  is_git=yes
  branch="$(git branch --show-current 2>/dev/null || echo '(detached)')"
  remote="$(git remote get-url origin 2>/dev/null || echo '')"
else
  is_git=no
  branch=''
  remote=''
fi

# green/brownfield: .git/.dure 제외한 최상위 항목 수
entries="$(find . -maxdepth 1 -mindepth 1 -not -name '.git' -not -name '.dure' 2>/dev/null | wc -l | tr -d ' ')"
if [ "${entries:-0}" -eq 0 ]; then
  kind=greenfield
else
  kind=brownfield
fi

# dure 초기화 여부
if [ -d "$ROOT/.dure" ]; then dure_init=yes; else dure_init=no; fi

# active spec
active=''
if [ -f "$ROOT/.dure/active" ]; then
  active="$(tr -d '[:space:]' < "$ROOT/.dure/active" 2>/dev/null || echo '')"
fi

echo "root=$ROOT"
echo "git=$is_git"
echo "branch=${branch:-}"
echo "remote=${remote:-}"
echo "kind=$kind"
echo "entries=${entries:-0}"
echo "dure_initialized=$dure_init"
echo "active_spec=${active:-}"
