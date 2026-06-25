#!/usr/bin/env python3
"""dure-survey.py — deterministic, report-only state survey (M3 discovery engine).

Spec: .dure/specs/dure-survey.md (M3 first feature). Discovery only: emits forward-looking
planning signals to stdout and NEVER writes to .dure/roadmap/. Disjoint from dure-doctor
(integrity), dure-audit (debt), and dure-status (completion) — see AC-c.

This is the scaffold (issue i3.1.1): config resolution with hard-coded `survey:` defaults, the
finding model, JSON output, the severity/fail_on -> exit-code logic, and robust item loaders that
reuse the audit/status front-matter convention. Signals register into SIGNALS and are implemented in
i3.1.2 (closable-milestone) and i3.1.3 (empty-epic).

Output: JSON {status, counts, findings:[{check,severity,id,message}]}.
Exit: 0 = no finding >= fail_on (advisory) · 1 = a finding >= fail_on · 2 = internal error.
"""
import argparse
import json
import os
import re
import sys

try:
    import yaml
    HAVE_YAML = True
except Exception:  # noqa: BLE001
    HAVE_YAML = False

SEVERITY_ORDER = {"info": 0, "warning": 1, "error": 2}
DEFAULT_SURVEY = {"fail_on": "error"}

# Signal registry: each entry is a callable fn(items) -> list[finding]. Populated in i3.1.2-3.
# `items` is the dict returned by load_items(): {"milestones":{...}, "epics":{...}, "issues":{...}}.
SIGNALS = []


def resolve_config(root):
    """Return the survey config with hard-coded defaults applied.

    Works when .dure/config.yml has no `survey:` section (the live repo's case): defaults kick in.
    Malformed config -> defaults; dure-doctor owns config validation.
    """
    cfg = {"fail_on": DEFAULT_SURVEY["fail_on"]}
    path = os.path.join(root, ".dure", "config.yml")
    if HAVE_YAML and os.path.isfile(path):
        try:
            data = yaml.safe_load(open(path, encoding="utf-8").read()) or {}
            survey = data.get("survey") or {}
            if survey.get("fail_on") in SEVERITY_ORDER:
                cfg["fail_on"] = survey["fail_on"]
        except Exception:  # noqa: BLE001
            pass
    return cfg


def _read_front_matter(path):
    """Parse YAML front matter; return {} on any parse failure (item is then silently skipped).

    Mirrors dure-audit/dure-status so the survey can never disagree with them on membership.
    """
    try:
        txt = open(path, encoding="utf-8").read()
    except (OSError, UnicodeDecodeError):
        return {}
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", txt, re.S)
    if not m:
        return {}
    block = m.group(1)
    if HAVE_YAML:
        try:
            data = yaml.safe_load(block)
            return data if isinstance(data, dict) else {}
        except Exception:  # noqa: BLE001
            return {}
    data, lines, i = {}, block.splitlines(), 0
    while i < len(lines):
        line = re.sub(r"\s+#.*$", "", lines[i])
        i += 1
        mm = re.match(r"^([\w.-]+):\s*(.*)$", line)
        if not mm:
            continue
        k, v = mm.group(1), mm.group(2).strip()
        if v.startswith("[") and v.endswith("]"):
            inner = v[1:-1].strip()
            data[k] = [x.strip() for x in inner.split(",") if x.strip()] if inner else []
        elif v.lower() in ("null", "~", ""):
            data[k] = None
        else:
            data[k] = v.strip('"').strip("'")
    return data


def _load_kind(root, kind):
    out = {}
    d = os.path.join(root, ".dure", "roadmap", kind)
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".md"):
                fm = _read_front_matter(os.path.join(d, fn))
                if fm.get("id"):  # malformed / id-less items are silently skipped
                    out[fm["id"]] = fm
    return out


def load_items(root):
    """Load all roadmap per-item files. Missing dirs -> empty dicts (new/empty project)."""
    return {
        "milestones": _load_kind(root, "milestones"),
        "epics": _load_kind(root, "epics"),
        "issues": _load_kind(root, "issues"),
    }


def run_signals(items):
    findings = []
    for fn in SIGNALS:
        findings.extend(fn(items))
    return findings


def compute_exit(findings, fail_on):
    """0 if no finding has severity >= fail_on, else 1."""
    threshold = SEVERITY_ORDER.get(fail_on, SEVERITY_ORDER["error"])
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
    ap = argparse.ArgumentParser(
        description="Report-only .dure state survey — forward-looking planning signals (discovery only).")
    ap.add_argument("--debug-config", action="store_true",
                    help="print the resolved survey config and exit")
    args = ap.parse_args()
    root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    try:
        cfg = resolve_config(root)
        if args.debug_config:
            print(json.dumps({"survey": cfg}, ensure_ascii=False, indent=2))
            sys.exit(0)
        items = load_items(root)
        findings = run_signals(items)
        code = compute_exit(findings, cfg["fail_on"])
        print(json.dumps(build_report(findings, code), ensure_ascii=False, indent=2))
        sys.exit(code)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"status": "error", "message": str(e),
                          "counts": {"findings": 0}, "findings": []},
                         ensure_ascii=False, indent=2))
        sys.exit(2)


if __name__ == "__main__":
    main()
