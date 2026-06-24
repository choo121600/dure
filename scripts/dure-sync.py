#!/usr/bin/env python3
"""dure-sync.py — sync the local roadmap with GitHub (E1.4), with plan/apply separation.

--plan (default): compute an IDEMPOTENT create-plan from per-item files + sync/github-map.json.
                  Pure: no network, no gh. Re-running after a full sync yields an empty plan.
--apply         : execute the plan via the `gh` CLI, update sync/github-map.json, then pull
                  issue/epic state into sync/github-status.json (for /dure:status conflicts).

Mapping (spec §5.3): milestone -> GitHub Milestone; epic -> tracking Issue (label `epic`);
issue -> GitHub Issue (assigned to its milestone, label `epic:<epic-id>`). Idempotency key:
the local `id` -> GitHub number map in sync/github-map.json.

Exit: 0 ok · 2 error (e.g. cannot resolve repo, gh failure).
"""
import argparse
import json
import os
import re
import subprocess
import sys

try:
    import yaml
    HAVE_YAML = True
except Exception:  # noqa: BLE001
    HAVE_YAML = False

ROOT = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
DURE = os.path.join(ROOT, ".dure")
RD = os.path.join(DURE, "roadmap")
SYNC = os.path.join(DURE, "sync")
MAP_PATH = os.path.join(SYNC, "github-map.json")
STATUS_PATH = os.path.join(SYNC, "github-status.json")


def read_fm(path):
    txt = open(path, encoding="utf-8").read()
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", txt, re.S)
    if not m:
        return {}
    block = m.group(1)
    if HAVE_YAML:
        try:
            return yaml.safe_load(block) or {}
        except Exception:  # noqa: BLE001
            return {}
    data = {}
    for raw in block.splitlines():
        line = re.sub(r"\s+#.*$", "", raw)
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


def load(kind):
    out = {}
    d = os.path.join(RD, kind)
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".md"):
                fm = read_fm(os.path.join(d, fn))
                if fm.get("id"):
                    out[fm["id"]] = fm
    return out


def load_map():
    m = {}
    if os.path.isfile(MAP_PATH):
        try:
            m = json.load(open(MAP_PATH, encoding="utf-8"))
        except Exception:  # noqa: BLE001
            m = {}
    for k in ("milestones", "epics", "issues"):
        m.setdefault(k, {})
    return m


def build_plan(mp):
    ms, ep, iss = load("milestones"), load("epics"), load("issues")
    plan = {"milestones": [], "epics": [], "issues": []}
    for mid in sorted(ms):
        if mid not in mp["milestones"]:
            plan["milestones"].append({"id": mid, "title": ms[mid].get("title", "")})
    for eid in sorted(ep):
        if eid not in mp["epics"]:
            plan["epics"].append({"id": eid, "title": ep[eid].get("title", ""),
                                  "milestone": ep[eid].get("milestone")})
    for iid in sorted(iss):
        if iid not in mp["issues"]:
            plan["issues"].append({"id": iid, "title": iss[iid].get("title", ""),
                                   "milestone": iss[iid].get("milestone"),
                                   "epic": iss[iid].get("epic"),
                                   "acceptance": iss[iid].get("acceptance") or []})
    return plan, ms, ep, iss


# ---- gh helpers (only used by --apply) -------------------------------------

def _gh(args, check=True):
    p = subprocess.run(["gh"] + args, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {p.stderr.strip()}")
    return p


def _gh_json(args):
    p = _gh(args)
    return json.loads(p.stdout) if p.stdout.strip() else {}


def resolve_repo(cfg):
    repo = ((cfg or {}).get("github") or {}).get("repo")
    if repo:
        return repo
    p = _gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], check=False)
    return p.stdout.strip() if p.returncode == 0 and p.stdout.strip() else None


def ensure_label(repo, name, color="ededed"):
    _gh(["api", "-X", "POST", f"repos/{repo}/labels",
         "-f", f"name={name}", "-f", f"color={color}"], check=False)  # ignore "already exists"


def create_milestone(repo, title):
    j = _gh_json(["api", "-X", "POST", f"repos/{repo}/milestones",
                  "-f", f"title={title}", "-f", "description=Synced by dure."])
    return j["number"]


def create_issue(repo, title, body, labels, milestone_number=None):
    args = ["api", "-X", "POST", f"repos/{repo}/issues", "-f", f"title={title}", "-f", f"body={body}"]
    for lab in labels:
        args += ["-f", f"labels[]={lab}"]
    if milestone_number is not None:
        args += ["-F", f"milestone={milestone_number}"]
    return _gh_json(args)["number"]


def load_config():
    path = os.path.join(DURE, "config.yml")
    if not os.path.isfile(path):
        return {}
    if HAVE_YAML:
        try:
            return yaml.safe_load(open(path, encoding="utf-8").read()) or {}
        except Exception:  # noqa: BLE001
            return {}
    return {}


def save_map(mp):
    os.makedirs(SYNC, exist_ok=True)
    json.dump(mp, open(MAP_PATH, "w", encoding="utf-8"), indent=2, ensure_ascii=False)


def apply(repo, plan, mp):
    created = {"milestones": [], "epics": [], "issues": []}
    ensure_label(repo, "epic", "5319e7")
    for m in plan["milestones"]:
        num = create_milestone(repo, m["title"] or m["id"])
        mp["milestones"][m["id"]] = num
        created["milestones"].append({"id": m["id"], "number": num})
        save_map(mp)
    for e in plan["epics"]:
        body = f"dure epic `{e['id']}`. Milestone: {e.get('milestone')}."
        num = create_issue(repo, f"[epic] {e['title'] or e['id']}", body, ["epic"],
                           mp["milestones"].get(e.get("milestone")))
        mp["epics"][e["id"]] = num
        created["epics"].append({"id": e["id"], "number": num})
        save_map(mp)
    for it in plan["issues"]:
        labels = []
        if it.get("epic"):
            lab = f"epic:{it['epic']}"
            ensure_label(repo, lab, "bfd4f2")
            labels.append(lab)
        acc = "\n".join(f"- [ ] {a}" for a in it.get("acceptance", []))
        body = f"dure issue `{it['id']}`.\n\n**Acceptance**\n{acc}" if acc else f"dure issue `{it['id']}`."
        num = create_issue(repo, it["title"] or it["id"], body, labels,
                           mp["milestones"].get(it.get("milestone")))
        mp["issues"][it["id"]] = num
        created["issues"].append({"id": it["id"], "number": num})
        save_map(mp)
    return created


def pull_status(repo, mp):
    status = {}
    for kind in ("epics", "issues"):
        for lid, num in mp.get(kind, {}).items():
            p = _gh(["api", f"repos/{repo}/issues/{num}", "-q", ".state"], check=False)
            if p.returncode == 0 and p.stdout.strip():
                status[lid] = p.stdout.strip()
    os.makedirs(SYNC, exist_ok=True)
    json.dump(status, open(STATUS_PATH, "w", encoding="utf-8"), indent=2)
    return status


def main():
    ap = argparse.ArgumentParser(description="Sync local roadmap with GitHub.")
    ap.add_argument("--apply", action="store_true", help="execute the plan via gh (creates GitHub items)")
    args = ap.parse_args()

    if not os.path.isdir(DURE):
        print(json.dumps({"status": "uninitialized"}))
        sys.exit(2)

    mp = load_map()
    plan, _, _, _ = build_plan(mp)
    summary = {k: len(v) for k, v in plan.items()}

    if not args.apply:
        print(json.dumps({"mode": "plan", "create": plan, "summary": summary},
                         ensure_ascii=False, indent=2))
        sys.exit(0)

    try:
        repo = resolve_repo(load_config())
        if not repo:
            raise RuntimeError("cannot resolve GitHub repo (set github.repo or a git remote; gh auth)")
        created = apply(repo, plan, mp)
        status = pull_status(repo, mp)
        print(json.dumps({"mode": "apply", "repo": repo, "created": created,
                          "summary": summary, "pulled_status": status},
                         ensure_ascii=False, indent=2))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"mode": "apply", "status": "error", "message": str(e)}))
        sys.exit(2)


if __name__ == "__main__":
    main()
