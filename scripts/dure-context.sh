#!/usr/bin/env bash
# dure-context.sh — detect target repo context: git/non-git, greenfield/brownfield (I1.1.3).
# Emits key=value lines without error in any combination.
set -eu

ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$ROOT"

# git?
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  is_git=yes
  branch="$(git branch --show-current 2>/dev/null || echo '(detached)')"
  remote="$(git remote get-url origin 2>/dev/null || echo '')"
else
  is_git=no
  branch=''
  remote=''
fi

# greenfield/brownfield: count top-level entries excluding .git/.dure
entries="$(find . -maxdepth 1 -mindepth 1 -not -name '.git' -not -name '.dure' 2>/dev/null | wc -l | tr -d ' ')"
if [ "${entries:-0}" -eq 0 ]; then
  kind=greenfield
else
  kind=brownfield
fi

# is dure initialized?
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
