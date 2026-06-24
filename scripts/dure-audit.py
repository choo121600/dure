#!/usr/bin/env python3
"""dure-audit.py — deterministic, report-only repo scanner.

Spec: .dure/specs/dure-audit.md (M2 first feature). Inventory only: emits findings to stdout and
NEVER writes to .dure/roadmap/. Disjoint from dure-doctor (which owns hierarchy/orphan/schema).

This is the scaffold (issue i2.1.1): config resolution with hard-coded defaults, the finding model,
JSON output, and the severity/fail_on -> exit-code logic. Individual checks register into CHECKS and
are implemented in i2.1.2 (todo-marker), i2.1.3 (untested-script), i2.1.4 (done-parent-undone-child).

Output: JSON {status, counts, findings:[{check,severity,file?,line?,id?,message}]}.
Exit: 0 = no finding >= fail_on (advisory) · 1 = a finding >= fail_on · 2 = internal error.
"""
import argparse
import json
import os
import sys

try:
    import yaml
    HAVE_YAML = True
except Exception:  # noqa: BLE001
    HAVE_YAML = False

SEVERITY_ORDER = {"info": 0, "warning": 1, "error": 2}
DEFAULT_AUDIT = {"untested_allowlist": ["dure-gate"], "fail_on": "error"}

# Check registry: each entry is a callable fn(root, cfg) -> list[finding]. Populated in i2.1.2-4.
CHECKS = []


def resolve_config(root):
    """Return the audit config with hard-coded defaults applied.

    Works when .dure/config.yml has no `audit:` section (the live repo's case): defaults kick in.
    """
    cfg = {"untested_allowlist": list(DEFAULT_AUDIT["untested_allowlist"]),
           "fail_on": DEFAULT_AUDIT["fail_on"]}
    path = os.path.join(root, ".dure", "config.yml")
    if HAVE_YAML and os.path.isfile(path):
        try:
            data = yaml.safe_load(open(path, encoding="utf-8").read()) or {}
            audit = data.get("audit") or {}
            if isinstance(audit.get("untested_allowlist"), list):
                cfg["untested_allowlist"] = audit["untested_allowlist"]
            if audit.get("fail_on") in SEVERITY_ORDER:
                cfg["fail_on"] = audit["fail_on"]
        except Exception:  # noqa: BLE001
            pass  # malformed config -> defaults; dure-doctor owns config validation
    return cfg


def run_checks(root, cfg):
    findings = []
    for fn in CHECKS:
        findings.extend(fn(root, cfg))
    return findings


def compute_exit(findings, fail_on):
    """0 if no finding has severity >= fail_on, else 1."""
    threshold = SEVERITY_ORDER[fail_on]
    worst = max((SEVERITY_ORDER.get(f.get("severity"), 0) for f in findings), default=-1)
    return 1 if worst >= threshold else 0


def build_report(findings, exit_code):
    counts = {"findings": len(findings)}
    for f in findings:
        sev = f.get("severity", "info")
        counts[sev] = counts.get(sev, 0) + 1
    return {"status": "fail" if exit_code == 1 else "pass",
            "counts": counts,
            "findings": findings}


def main():
    ap = argparse.ArgumentParser(description="Report-only .dure repo audit (inventory only).")
    ap.add_argument("--debug-config", action="store_true",
                    help="print the resolved audit config and exit")
    args = ap.parse_args()
    root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    try:
        cfg = resolve_config(root)
        if args.debug_config:
            print(json.dumps({"audit": cfg}, ensure_ascii=False, indent=2))
            sys.exit(0)
        findings = run_checks(root, cfg)
        code = compute_exit(findings, cfg["fail_on"])
        print(json.dumps(build_report(findings, code), ensure_ascii=False, indent=2))
        sys.exit(code)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"status": "error", "message": str(e),
                          "counts": {"findings": 0}, "findings": []}))
        sys.exit(2)


if __name__ == "__main__":
    main()
