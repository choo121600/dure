#!/usr/bin/env bash
# dure-slug.sh — convert a title into a stable, deterministic slug (I1.2.6 / I1.3.1 stable id).
# Same title -> same slug. Usage: dure-slug.sh "Add refund feature"
set -eu

input="${*:-}"

# Lowercase, keep ASCII alphanumerics only (LC_ALL=C fixes sed behavior); everything else -> hyphen
slug="$(printf '%s' "$input" \
  | tr '[:upper:]' '[:lower:]' \
  | LC_ALL=C sed -E 's/[^a-z0-9]+/-/g; s/-+/-/g; s/^-//; s/-$//')"

# If the title is non-ASCII (e.g. Korean) and the slug is empty, fall back to a stable input hash
if [ -z "$slug" ]; then
  if command -v md5 >/dev/null 2>&1; then
    h="$(printf '%s' "$input" | md5)"
  else
    h="$(printf '%s' "$input" | md5sum | cut -d' ' -f1)"
  fi
  slug="spec-$(printf '%s' "$h" | cut -c1-8)"
fi

printf '%s\n' "$slug"
