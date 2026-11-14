#!/usr/bin/env python3
"""hq: coordinate humans and coding agents through GitHub Issues.

Layout: pure logic first (parsing and decisions on plain dicts/lists, unit
tested in tools/hq/tests), then the I/O layer (gh/git via subprocess), then
one function per subcommand, then argparse.

Exit codes: 0 ok, 1 error, 2 refused by a gate, 3 lost a claim race.
Python 3.9+, stdlib only.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import fnmatch
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import time
import unicodedata
from datetime import datetime, timezone

EXIT_OK, EXIT_ERROR, EXIT_REFUSED, EXIT_LOST = 0, 1, 2, 3
OK, BAD, WARN = "✓", "✗", "!"

DEFAULT_CONFIG = {"default_branch": "main", "lanes": {}, "check": [], "setup": [], "stale_minutes": 60}
KNOWN_AGENTS = ("claude", "codex", "cursor")
NO_RESPONSE = "_No response_"
RULESET_NAME = "hq-protect-main"
MILESTONES = ["M0 Skeleton", "M1 MVP demo path", "M2 Prizes + polish", "M3 Submission"]
PUSH_ARGS = ["push", "-u", "--force-with-lease", "origin", "HEAD"]

GUARD_MARKER = "hq-guard"
GUARD_SHIM = """#!/bin/sh
# hq-guard: run the versioned guard
root="$(git rev-parse --show-toplevel)"
if [ -x "$root/.githooks/pre-commit" ]; then "$root/.githooks/pre-commit" "$@" || exit $?; fi
[ -x "$(dirname "$0")/pre-commit.local" ] && exec "$(dirname "$0")/pre-commit.local" "$@"
exit 0
"""

# Board precedence when an issue carries more than one status label.
STATUS_PRECEDENCE = ("status:needs-human", "status:in-progress", "status:review", "status:blocked", "status:ready")
PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2}
SIZE_RANK = {"size:S": 0, "size:M": 1, "size:L": 2}
OK_CONCLUSIONS = ("SUCCESS", "NEUTRAL", "SKIPPED")
CLOSED_STATES = ("CLOSED", "MERGED")
CI_SYMBOL = {"success": OK, "failure": BAD, "pending": "…", "none": "-"}

ISSUE_LIST_FIELDS = "number,title,labels,assignees,updatedAt,body"
PR_LIST_FIELDS = ("number,title,headRefName,isDraft,labels,statusCheckRollup,mergeable,"
                  "updatedAt,files,closingIssuesReferences")
CLAIM_FIELDS = "number,title,body,state,labels,assignees,comments,url"
SHIP_FIELDS = ("number,title,state,isDraft,mergeable,mergeStateStatus,labels,statusCheckRollup,"
               "headRefName,closingIssuesReferences,url")

BASE_LABELS = [
    ("status:ready", "0e8a16", "Ready to claim: ./hq claim N"),
    ("status:in-progress", "fbca04", "Claimed by an agent"),
    ("status:review", "1d76db", "PR open: review, then ./hq ship"),
    ("status:blocked", "b60205", "Waiting on the issues under Blocked by"),
    ("status:needs-human", "5319e7", "Agent stuck: a human must decide"),
    ("P0", "b60205", "Demo-critical"),
    ("P1", "d93f0b", "Important"),
    ("P2", "c2e0c6", "Nice to have"),
    ("size:S", "c5def5", "<=30 min of agent time"),
    ("size:M", "bfd4f2", "<=90 min"),
    ("size:L", "5319e7", "Too big: split it"),
    ("type:feat", "a2eeef", "New capability"),
    ("type:bug", "d73a4a", "Something is broken"),
    ("type:chore", "ededed", "Tooling, config, cleanup"),
    ("type:spike", "f9d0c4", "Time-boxed investigation"),
    ("type:docs", "0075ca", "Documentation"),
    ("review:pass", "0e8a16", "Review passed: ready to ship"),
    ("review:changes", "d93f0b", "Review asked for changes"),
    ("agent:claude", "d4c5f9", "Worked by Claude Code"),
    ("agent:codex", "c2e0c6", "Worked by Codex"),
    ("agent:cursor", "bfdadc", "Worked by Cursor"),
    ("epic", "3e4b9e", "Tracks a group of issues"),
]


# =============================================================== pure logic

# ---- issue bodies (GitHub issue forms: "### Label" then the value)

_HEADING = re.compile(r"^###(?!#)\s*(\S.*?)\s*$")
_FENCE = re.compile(r"^\s*(```|~~~)")


def _section_value(lines):
    value = "\n".join(lines).strip()
    return "" if value == NO_RESPONSE else value


def parse_sections_ordered(body):
    """Body -> [(heading, value)] in order; `_No response_` becomes ''."""
    sections, heading, buf, in_fence = [], None, [], False
    text = (body or "").replace("\r\n", "\n").replace("\r", "\n")
    for line in text.split("\n"):
        m = None if in_fence else _HEADING.match(line)
        if m:
            if heading is not None:
                sections.append((heading, _section_value(buf)))
            heading, buf = m.group(1), []
            continue
        if _FENCE.match(line):
            in_fence = not in_fence
        if heading is not None:
            buf.append(line)
    if heading is not None:
        sections.append((heading, _section_value(buf)))
    return sections


def parse_sections(body):
    """Body -> {lowercased heading: value}."""
    out = {}
    for heading, value in parse_sections_ordered(body):
        out.setdefault(heading.strip().lower(), value)
    return out


def section(body, name):
    return parse_sections(body).get(name.strip().lower(), "")


def render_issue_body(body):
    """The body without empty (`_No response_`) sections."""
    sections = parse_sections_ordered(body)
    filled = [(h, v) for h, v in sections if v]
    if filled:
        return "\n\n".join("### %s\n%s" % (h, v) for h, v in filled)
    if sections:
        return "(empty issue body)"
    return (body or "").strip() or "(empty issue body)"


_REF = re.compile(r"(?:#|/(?:issues|pull)/)(\d+)")


def parse_issue_refs(text):
    """'#12, #14' / issue URLs -> [12, 14]; 'none' or '' -> []."""
    refs = []
    for m in _REF.finditer(text or ""):
        n = int(m.group(1))
        if n not in refs:
            refs.append(n)
    return refs


def blocked_by(body):
    return parse_issue_refs(section(body, "Blocked by"))


_BULLET = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
_EMPTY_WORDS = {"", "none", "n/a", "na", "-", "tbd", "nothing", NO_RESPONSE.lower()}


def normalize_path(path):
    p = (path or "").strip().replace("\\", "/")
    while p.startswith("./"):
        p = p[2:]
    return p.lstrip("/")


def parse_scope(text):
    """Scope field -> paths/globs. One per line or comma separated, bullets and backticks ok."""
    paths = []
    for raw in (text or "").splitlines():
        line = _BULLET.sub("", raw).strip()
        if line.lower() in _EMPTY_WORDS:
            continue
        ticks = re.findall(r"`([^`]+)`", line)
        if ticks:
            parts = [p for t in ticks for p in t.split(",")]
        else:  # 'web/src/ (frontend)' -> 'web/src/'
            parts = [p.split()[0] for p in line.split(",") if p.strip()]
        for part in parts:
            p = normalize_path(part.strip().strip("'\""))
            if p and p.lower() not in _EMPTY_WORDS and p not in paths:
                paths.append(p)
    return paths


# ---- claims (comment markers; race-safe without a lock)

_MARKER = re.compile(r"^\s*<!--\s*hq:(claim|release)\s+id=(\S+?)(?:\s+branch=(\S+?))?\s*-->")


def sanitize(part):
    return re.sub(r"[^A-Za-z0-9._-]+", "-", (part or "").strip()).strip("-").lower() or "x"


def make_id(login, agent, workspace):
    return "%s/%s/%s" % (login, sanitize(agent), sanitize(workspace))


def split_id(cid):
    return ((cid or "").split("/", 2) + ["", "", ""])[:3]


def claim_marker(cid, branch):
    return "<!-- hq:claim id=%s branch=%s -->" % (cid, branch)


def release_marker(cid):
    return "<!-- hq:release id=%s -->" % cid


def claim_body(cid, branch):
    login, agent, ws = split_id(cid)
    return "%s\nClaimed by **%s** via `%s` (workspace `%s`) on branch `%s`" % (
        claim_marker(cid, branch), login, agent, ws, branch)


def release_body(cid, note=""):
    login, agent, ws = split_id(cid)
    text = "%s\nReleased by **%s** via `%s` (workspace `%s`)" % (release_marker(cid), login, agent, ws)
    note = (note or "").strip()
    return text + (": " + note if note else "")


def parse_marker(body):
    m = _MARKER.match(body or "")
    if not m:
        return None
    kind, cid, branch = m.groups()
    if kind == "claim":
        return {"kind": kind, "id": cid, "branch": branch or ""}
    return {"kind": kind, "id": cid}


def _order_key(ts, index):
    dt = parse_ts(ts)
    return (dt.timestamp() if dt else 0.0, index)


def active_claims(comments):
    """Claims with no later release for the same id, earliest first (createdAt, then list order).
    One entry per id: the earliest still-active claim."""
    events = []
    for index, c in enumerate(comments or []):
        marker = parse_marker((c or {}).get("body"))
        if marker:
            events.append((_order_key(c.get("createdAt"), index), marker, c))
    events.sort(key=lambda e: e[0])
    active = {}  # insertion order == chronological order of the surviving claim
    for _, marker, c in events:
        if marker["kind"] == "release":
            active.pop(marker["id"], None)
        elif marker["id"] not in active:
            active[marker["id"]] = {
                "id": marker["id"],
                "branch": marker.get("branch", ""),
                "createdAt": c.get("createdAt"),
                "author": (c.get("author") or {}).get("login") or "",
                "url": c.get("url") or "",
            }
    return list(active.values())


def claim_winner(comments):
    active = active_claims(comments)
    return active[0] if active else None


def claim_refusals(number, state, open_blockers, winner, my_id, now):
    out = []
    if state != "OPEN":
        out.append("#%s is %s, not OPEN" % (number, state or "?"))
    if open_blockers:
        out.append("#%s is blocked by open %s" % (number, ", ".join("#%d" % r for r in open_blockers)))
    if winner and winner.get("id") != my_id:
        out.append("#%s is claimed by %s since %s (%s ago); pick another: ./hq board --brief" % (
            number, winner.get("id"), winner.get("createdAt") or "?", age(winner.get("createdAt"), now)))
    return out


def slugify(title, max_len=40):
    text = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:max_len].rstrip("-")


def branch_name(login, number, title):
    slug = slugify(title)
    return "%s/%s-%s" % (login, number, slug) if slug else "%s/%s" % (login, number)


# ---- files, scope, overlaps

def pr_files(pr):
    return [normalize_path(f.get("path")) for f in (pr.get("files") or []) if isinstance(f, dict) and f.get("path")]


def overlap_map(prs):
    """{path: [pr numbers]} for files touched by more than one open PR."""
    touched = {}
    for pr in prs:
        for path in sorted(set(pr_files(pr))):
            touched.setdefault(path, []).append(pr["number"])
    return {p: sorted(nums) for p, nums in sorted(touched.items()) if len(nums) > 1}


def scope_matches(pattern, path):
    """Directory prefix ('web/src/' or 'web/src') or fnmatch glob ('api/*.py')."""
    pat, path = normalize_path(pattern), normalize_path(path)
    if not pat or not path:
        return False
    if pat.endswith("/"):
        if path.startswith(pat):
            return True
    elif path == pat or path.startswith(pat + "/"):
        return True
    return fnmatch.fnmatchcase(path, pat) or (pat.endswith("/") and fnmatch.fnmatchcase(path, pat + "*"))


def scope_overlaps(patterns, prs, exclude_branches=()):
    """[(pr number, file, pattern)] for open-PR files inside the given scope."""
    hits = []
    for pr in prs:
        if pr.get("headRefName") in exclude_branches:
            continue
        for path in pr_files(pr):
            for pat in patterns:
                if scope_matches(pat, path):
                    hits.append((pr["number"], path, pat))
                    break
    return hits


# ---- time

_FRACTION = re.compile(r"^(.*T\d\d:\d\d:\d\d)\.(\d+)(.*)$")


def parse_ts(value):
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    if s[-1:] in ("Z", "z"):
        s = s[:-1] + "+00:00"
    m = _FRACTION.match(s)
    if m:  # Python 3.9 fromisoformat wants exactly 6 fraction digits
        s = "%s.%s%s" % (m.group(1), (m.group(2) + "000000")[:6], m.group(3))
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def age(ts, now):
    dt = parse_ts(ts)
    if dt is None:
        return "?"
    secs = max(0, int((now - dt).total_seconds()))
    if secs < 3600:
        return "%dm" % (secs // 60)
    if secs < 86400:
        return "%dh" % (secs // 3600)
    return "%dd" % (secs // 86400)


def is_stale(updated_at, now, stale_minutes):
    dt = parse_ts(updated_at)
    return dt is not None and (now - dt).total_seconds() > stale_minutes * 60


# ---- checks, gates, labels

def evaluate_checks(rollup):
    """statusCheckRollup -> ('success'|'pending'|'failure'|'none', [names behind the verdict])."""
    failing, pending = [], []
    items = [i for i in (rollup or []) if isinstance(i, dict)]
    for item in items:
        kind = item.get("__typename") or ("StatusContext" if "state" in item and "status" not in item else "CheckRun")
        name = item.get("name") or item.get("context") or "?"
        if kind == "StatusContext":
            state = (item.get("state") or "").upper()
            if state != "SUCCESS":
                (pending if state in ("PENDING", "EXPECTED", "") else failing).append(name)
        elif (item.get("status") or "").upper() != "COMPLETED":
            pending.append(name)
        elif (item.get("conclusion") or "").upper() not in OK_CONCLUSIONS:
            failing.append(name)
    if failing:
        return "failure", failing
    if pending:
        return "pending", pending
    return ("success", []) if items else ("none", [])


def label_names(item):
    return [(lb.get("name") or "") if isinstance(lb, dict) else str(lb) for lb in (item.get("labels") or [])]


def ship_gates(pr, skip_review=False, default_branch="main"):
    """Failing merge gates as messages; [] means shippable."""
    n = pr.get("number")
    gates = []
    state = pr.get("state") or "?"
    if state != "OPEN":
        gates.append("PR #%s is %s, not OPEN" % (n, state))
    if pr.get("isDraft"):
        gates.append("PR #%s is a draft: gh pr ready %s" % (n, n))
    if pr.get("mergeable") == "CONFLICTING":
        gates.append("PR #%s is CONFLICTING: git rebase origin/%s, ./hq check, then re-run ./hq pr" % (n, default_branch))
    ci, names = evaluate_checks(pr.get("statusCheckRollup"))
    if ci == "pending":
        gates.append("checks still running: " + ", ".join(names))
    elif ci == "failure":
        gates.append("checks failing: " + ", ".join(names))
    if not skip_review and "review:pass" not in label_names(pr):
        gates.append("no review:pass label: entire review, then gh pr edit %s --add-label review:pass "
                     "(or ./hq ship %s --skip-review)" % (n, n))
    return gates


def issue_status(issue):
    names = set(label_names(issue))
    for status in STATUS_PRECEDENCE:
        if status in names:
            return status
    return None


def issue_lane(issue):
    for name in label_names(issue):
        if name.startswith("lane:"):
            return name[len("lane:"):]
    return None


def ready_sort_key(issue):
    names = label_names(issue)
    lane = issue_lane(issue)
    prio = min([PRIORITY_RANK[n] for n in names if n in PRIORITY_RANK] or [3])
    size = min([SIZE_RANK[n] for n in names if n in SIZE_RANK] or [3])
    return (lane is None, lane or "", prio, size, issue.get("number") or 0)


def sort_ready(issues):
    """Lane (unlaned last), then P0<P1<P2<none, then S<M<L<none, then number."""
    return sorted(issues, key=ready_sort_key)


_COPY_LABEL = re.compile(r"^(?:lane:.+|P[012]|agent:.+|size:.+|type:.+)$")


def labels_to_copy(names):
    return [n for n in names if _COPY_LABEL.match(n)]


def pr_title(title, number):
    return "%s (#%s)" % ((title or "").strip(), number)


def pr_body(text, number, agent_id):
    return "%s\n\nCloses #%s\n\n---\nAgent: `%s`" % ((text or "").rstrip(), number, agent_id)


def push_should_retry(output):
    """Entire's pre-push hook pushes its checkpoint branch at the same moment; GitHub
    sometimes rejects the first attempt with '[remote rejected] ... (failed)'."""
    text = output or ""
    return "remote rejected" in text and "(failed)" in text


def unblock_candidates(blocked_issues, ref_states, just_closed=()):
    """[(issue number, refs closed by this merge)] for blocked issues whose refs are all closed.
    Issues with no refs stay blocked (blocked for a reason hq cannot see)."""
    just_closed = set(just_closed or ())
    out = []
    for issue in blocked_issues:
        refs = blocked_by(issue.get("body"))
        if refs and all(r in just_closed or ref_states.get(r) in CLOSED_STATES for r in refs):
            out.append((issue["number"], [r for r in refs if r in just_closed]))
    return out


def unblock_comment(freed, pr_number):
    if freed:
        return "Unblocked: %s merged in #%s" % (", ".join("#%d" % r for r in freed), pr_number)
    return "Unblocked: all blockers are closed (checked when #%s merged)" % pr_number


def linked_prs(number, prs, branches=()):
    out = []
    for pr in prs:
        closes = [r.get("number") for r in (pr.get("closingIssuesReferences") or []) if isinstance(r, dict)]
        if number in closes or (pr.get("headRefName") and pr.get("headRefName") in branches):
            out.append(pr["number"])
    return out


# ---- board

def render_board(issues, prs, claims, now, stale_minutes, brief=False):
    """Board lines. claims: {issue number: winning claim} (may be empty)."""
    if not issues and not prs:
        return ["board empty: no open issues or PRs"]
    groups = {s: [] for s in STATUS_PRECEDENCE}
    untriaged = 0
    for issue in issues:
        status = issue_status(issue)
        if status:
            groups[status].append(issue)
        else:
            untriaged += 1
    by_number = lambda i: i.get("number") or 0  # noqa: E731
    in_progress = sorted(groups["status:in-progress"], key=by_number)
    ready = sort_ready(groups["status:ready"])
    stale = [i for i in in_progress if is_stale(i.get("updatedAt"), now, stale_minutes)]
    overlaps = overlap_map(prs)
    open_numbers = {i.get("number") for i in issues} | {p.get("number") for p in prs}

    def who(issue):
        c = claims.get(issue.get("number"))
        if c:
            return c["id"]
        logins = [a.get("login", "") for a in (issue.get("assignees") or []) if isinstance(a, dict)]
        return ", ".join(logins) if logins else "unassigned"

    def row(issue, bits):
        return "  #%s %s  [%s]" % (issue.get("number"), issue.get("title", ""), ", ".join(b for b in bits if b))

    def in_progress_row(issue):
        c = claims.get(issue.get("number"))
        bits = [who(issue), age(c.get("createdAt") if c else issue.get("updatedAt"), now)]
        prn = linked_prs(issue.get("number"), prs, [c["branch"]] if c and c.get("branch") else [])
        if prn:
            bits.append("PR " + ", ".join("#%d" % p for p in prn))
        return row(issue, bits)

    def pr_row(pr):
        ci, _ = evaluate_checks(pr.get("statusCheckRollup"))
        bits = ["CI " + CI_SYMBOL[ci]] + ([n for n in label_names(pr) if n.startswith("review:")] or ["unreviewed"])
        if pr.get("isDraft"):
            bits.append("draft")
        if pr.get("mergeable") == "CONFLICTING":
            bits.append("CONFLICTING")
        closes = [r.get("number") for r in (pr.get("closingIssuesReferences") or []) if isinstance(r, dict)]
        target = (" -> " + ", ".join("#%s" % c for c in closes)) if closes else ""
        return "  PR #%s%s %s  [%s]" % (pr.get("number"), target, pr.get("title", ""), ", ".join(bits))

    def blocked_row(issue):
        refs = blocked_by(issue.get("body"))
        waiting = [r for r in refs if r in open_numbers]
        if waiting:
            note = "waiting on " + ", ".join("#%d" % r for r in waiting)
        else:
            note = "blockers closed: set status:ready" if refs else "no Blocked by refs"
        return row(issue, [note])

    def ready_row(issue):
        names = label_names(issue)
        lane = issue_lane(issue)
        tags = (["lane:" + lane] if lane else []) + [n for n in names if n in PRIORITY_RANK][:1] \
            + [n for n in names if n in SIZE_RANK][:1]
        return row(issue, tags) if tags else "  #%s %s" % (issue.get("number"), issue.get("title", ""))

    overlap_rows = ["  %s: PR %s" % (path, ", ".join("#%d" % n for n in nums)) for path, nums in overlaps.items()]
    counts = [
        "%d in progress" % len(in_progress),
        "%d open PRs" % len(prs),
        "%d needs human" % len(groups["status:needs-human"]),
        "%d blocked" % len(groups["status:blocked"]),
        "%d ready" % len(ready),
        "%d overlapping files" % len(overlaps),
        "%d stale" % len(stale),
    ]
    if untriaged:
        counts.append("%d without a status label" % untriaged)
    lines = [", ".join(counts)]

    def add(title, rows, cap=None):
        if not rows:
            return
        if cap is not None and len(rows) > cap:
            lines.append("%s (%d, showing %d)" % (title, len(rows), cap))
            rows = rows[:cap]
        else:
            lines.append(title)
        lines.extend(rows)

    if brief:  # <= 15 lines: counts, in progress, overlaps, top 5 ready
        add("IN PROGRESS", [in_progress_row(i) for i in in_progress], cap=4)
        add("OVERLAPS", overlap_rows, cap=2)
        add("READY", [ready_row(i) for i in ready], cap=5)
        return lines
    add("IN PROGRESS", [in_progress_row(i) for i in in_progress])
    add("REVIEW", [pr_row(p) for p in sorted(prs, key=by_number)])
    add("NEEDS HUMAN", [row(i, [who(i)]) for i in sorted(groups["status:needs-human"], key=by_number)])
    add("BLOCKED", [blocked_row(i) for i in sorted(groups["status:blocked"], key=by_number)])
    add("READY", [ready_row(i) for i in ready])
    add("OVERLAPS", overlap_rows)
    add("STALE (no issue activity for %d min: nudge the agent or ./hq release N)" % stale_minutes,
        [row(i, [who(i), "idle " + age(i.get("updatedAt"), now)]) for i in stale])
    return lines


# ---- bootstrap and setup payloads

def bootstrap_labels(lanes):
    labels = list(BASE_LABELS)
    for name, spec in sorted((lanes or {}).items()):
        spec = spec if isinstance(spec, dict) else {}
        bits = []
        if spec.get("owner"):
            bits.append("owner " + str(spec["owner"]))
        if spec.get("paths"):
            bits.append(" ".join(str(p) for p in spec["paths"]))
        desc = ("Lane %s: %s" % (name, "; ".join(bits))) if bits else "Lane %s" % name
        labels.append(("lane:" + name, "fef2c0", desc[:100]))
    return labels


def ruleset_payload():
    return {
        "name": RULESET_NAME,
        "target": "branch",
        "enforcement": "active",
        "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
        "rules": [
            {"type": "deletion"},
            {"type": "non_fast_forward"},
            {"type": "pull_request", "parameters": {
                "required_approving_review_count": 0,
                "dismiss_stale_reviews_on_push": False,
                "require_code_owner_review": False,
                "require_last_push_approval": False,
                "required_review_thread_resolution": False,
            }},
        ],
    }


def entire_backend_ok(settings):
    try:
        return settings["checkpoints"]["primary"]["type"] == "git-branch"
    except (KeyError, TypeError):
        return False


def install_guard(hooks_dir):
    """Install the hq-guard pre-commit shim; an existing foreign hook becomes pre-commit.local."""
    os.makedirs(hooks_dir, exist_ok=True)
    hook = os.path.join(hooks_dir, "pre-commit")
    local = os.path.join(hooks_dir, "pre-commit.local")
    kept = ""
    if os.path.exists(hook):
        with open(hook, encoding="utf-8", errors="replace") as f:
            if GUARD_MARKER in f.read():
                return OK, "guard already installed: " + hook
        if os.path.exists(local):
            return WARN, ("guard not installed: %s and pre-commit.local both exist; merge them into "
                          "pre-commit.local, delete pre-commit, re-run ./hq setup" % hook)
        os.replace(hook, local)
        kept = " (previous hook kept as pre-commit.local, still runs)"
    with open(hook, "w", encoding="utf-8", newline="\n") as f:
        f.write(GUARD_SHIM)
    os.chmod(hook, os.stat(hook).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return OK, "installed guard: %s%s" % (hook, kept)


def tail(text, n=30):
    lines = (text or "").rstrip("\n").splitlines()
    return lines[-n:] if n > 0 else []


# ====================================================================== I/O

class HQError(Exception):
    code = EXIT_ERROR

    def __init__(self, *lines):
        super().__init__(lines[0] if lines else "error")
        self.lines = [str(x) for x in lines] or ["error"]


class Refused(HQError):
    code = EXIT_REFUSED


class LostRace(HQError):
    code = EXIT_LOST


def run(cmd, input_text=None, cwd=None):
    io = {"input": input_text} if input_text is not None else {"stdin": subprocess.DEVNULL}
    try:
        return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              cwd=cwd, **io)
    except FileNotFoundError:
        hint = " (install: https://cli.github.com, then gh auth login)" if cmd[0] == "gh" else ""
        raise HQError("%s: command not found%s" % (cmd[0], hint))


def err_line(p):
    for stream in (p.stderr, p.stdout):
        lines = [ln.strip() for ln in (stream or "").splitlines() if ln.strip()]
        if lines:
            return lines[-1]
    return "exit %d" % p.returncode


def loads(text, default):
    try:
        value = json.loads(text or "")
    except ValueError:
        return default
    return default if value is None else value


def gh(args, input_text=None, check=True):
    args = [str(a) for a in args]
    p = run(["gh"] + args, input_text=input_text)
    if check and p.returncode != 0:
        raise HQError("gh %s: %s" % (" ".join(args[:2]), err_line(p)))
    return p


def gh_json(args):
    p = gh(args)
    try:
        return json.loads(p.stdout or "null")
    except ValueError:
        raise HQError("gh %s: could not parse JSON output" % " ".join(str(a) for a in args[:2]))


def git(args, check=True):
    p = run(["git"] + list(args))
    if check and p.returncode != 0:
        raise HQError("git %s: %s" % (" ".join(args[:2]), err_line(p)))
    return p


_CACHE = {}


def cached(key, fn):
    if key not in _CACHE:
        _CACHE[key] = fn()
    return _CACHE[key]


def repo_root():
    def find():
        p = run(["git", "rev-parse", "--show-toplevel"])
        if p.returncode != 0:
            raise HQError("not inside a git repository")
        return os.path.normpath(p.stdout.strip())
    return cached("root", find)


def load_config(root=None):
    path = os.path.join(root or repo_root(), "hq.json")
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except ValueError as e:
            raise HQError("hq.json is not valid JSON: %s" % e)
        if not isinstance(data, dict):
            raise HQError("hq.json must be a JSON object")
        cfg.update(data)
    return cfg


def default_branch(cfg):
    return cfg.get("default_branch") or "main"


def gh_login():
    return cached("login", lambda: gh(["api", "user", "--jq", ".login"]).stdout.strip())


def repo_slug():
    return cached("slug", lambda: gh_json(["repo", "view", "--json", "nameWithOwner"])["nameWithOwner"])


def identity(args):
    login = gh_login()
    agent = getattr(args, "agent", None) or os.environ.get("HQ_AGENT") or "agent"
    ws = (getattr(args, "workspace", None) or os.environ.get("CONDUCTOR_WORKSPACE_NAME")
          or os.path.basename(repo_root()))
    return {"login": login, "agent": sanitize(agent), "workspace": sanitize(ws), "id": make_id(login, agent, ws)}


def agent_flag(me):
    return "" if me["agent"] == "agent" or os.environ.get("HQ_AGENT") else " --agent " + me["agent"]


def current_branch():
    p = run(["git", "symbolic-ref", "--quiet", "--short", "HEAD"])
    return p.stdout.strip() if p.returncode == 0 else ""


def hooks_dir():
    common = git(["rev-parse", "--git-common-dir"]).stdout.strip()
    return os.path.join(os.path.abspath(common), "hooks")


def file_contains(path, needle):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return needle in f.read()
    except OSError:
        return False


def pmap(fn, items, workers=8):
    items = list(items)
    if len(items) < 2:
        return [fn(i) for i in items]
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(workers, len(items))) as pool:
        return list(pool.map(fn, items))


def now_utc():
    return datetime.now(timezone.utc)


def ref_state(number):
    """OPEN / CLOSED / MERGED for an issue or PR number; UNKNOWN if neither can be read."""
    for kind in ("issue", "pr"):
        p = gh([kind, "view", number, "--json", "state"], check=False)
        if p.returncode == 0:
            return loads(p.stdout, {}).get("state") or "UNKNOWN"
    return "UNKNOWN"


def post_comment(number, body):
    gh(["issue", "comment", number, "--body-file", "-"], input_text=body)


def gh_edit(kind, number, attempts):
    """Run `gh <kind> edit N` with each argument set until one works (later sets drop labels)."""
    last = None
    for i, extra in enumerate(attempts):
        p = gh([kind, "edit", number] + extra, check=False)
        if p.returncode == 0:
            if i:
                print("%s %s #%s: fell back to fewer labels (%s); run ./hq bootstrap" % (
                    WARN, kind, number, err_line(last)))
            return True
        last = p
    print("%s %s #%s: edit failed: %s" % (WARN, kind, number, err_line(last)))
    return False


def run_shell(cmd, cwd):
    start = time.monotonic()
    p = subprocess.run(cmd, shell=True, cwd=cwd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    return p.returncode, time.monotonic() - start, p.stdout


def run_command_list(cmds, cwd):
    """Run every command; print ✓/✗ lines (+ last 30 output lines on failure). Returns #failed."""
    failed = 0
    for cmd in cmds:
        code, secs, out = run_shell(str(cmd), cwd)
        if code == 0:
            print("%s %s (%.1fs)" % (OK, cmd, secs))
        else:
            failed += 1
            print("%s %s (exit %d)" % (BAD, cmd, code))
            for ln in tail(out, 30):
                print("  " + ln)
    return failed


# ================================================================= commands

def cmd_setup(args):
    root = repo_root()
    cfg = load_config(root)
    setup_cmds = cfg.get("setup") or []
    if args.ci:
        if not setup_cmds:
            print('no setup commands configured (hq.json "setup")')
            return EXIT_OK
        return EXIT_ERROR if run_command_list(setup_cmds, root) else EXIT_OK
    fix_failed = 0
    if not args.check:
        print("FIXES")
        status, msg = install_guard(hooks_dir())
        print("%s %s" % (status, msg))
        p = git(["config", "gc.auto", "0"], check=False)
        print("%s git config gc.auto 0" % OK if p.returncode == 0 else "%s git config gc.auto 0: %s" % (BAD, err_line(p)))
        fix_failed = run_command_list(setup_cmds, root)
        print()
    items = setup_checks(root, cfg)
    print("CHECKLIST")
    for status, label, hint in items:
        print("%s %s%s" % (status, label, ("  fix: " + hint) if hint and status != OK else ""))
    bad = sum(1 for s, _, _ in items if s == BAD)
    warn = sum(1 for s, _, _ in items if s == WARN)
    print("%s: %d failing, %d warnings" % ("not ready" if bad else "ready", bad, warn))
    return EXIT_ERROR if bad or fix_failed else EXIT_OK


def setup_checks(root, cfg):
    items = []

    def add(ok, label, hint="", warn_only=False):
        items.append((OK if ok else (WARN if warn_only else BAD), label, hint))

    v = sys.version_info
    add(v >= (3, 9), "python %d.%d.%d" % (v[0], v[1], v[2]), "install Python 3.9+")

    gh_ready = False
    if not shutil.which("gh"):
        add(False, "gh not installed", "brew install gh (or https://cli.github.com), then gh auth login")
    else:
        gh_ready = run(["gh", "auth", "status"]).returncode == 0
        add(gh_ready, "gh authenticated" if gh_ready else "gh not authenticated", "gh auth login")
    if gh_ready:
        p = run(["gh", "repo", "view", "--json", "nameWithOwner"])
        slug = loads(p.stdout, {}).get("nameWithOwner") if p.returncode == 0 else None
        add(bool(slug), "gh repo view: %s" % slug if slug else "gh repo view failed: " + err_line(p),
            "check git remote -v, then gh repo set-default")
    else:
        add(False, "gh repo view skipped (gh not ready)", "fix gh first")

    email = run(["git", "config", "user.email"]).stdout.strip()
    add(bool(email), "git user.email " + (email or "not set"), 'git config --global user.email "you@example.com"')

    version = ""
    if shutil.which("entire"):
        p = run(["entire", "--version"])
        if p.returncode == 0:
            version = (p.stdout.strip().splitlines() or ["?"])[0]
    add(bool(version), "entire: " + version if version else "entire not found",
        "brew install --cask entireio/tap/entire", warn_only=True)

    settings = None
    try:
        with open(os.path.join(root, ".entire", "settings.json"), encoding="utf-8") as f:
            settings = json.load(f)
    except (OSError, ValueError):
        pass
    ok = entire_backend_ok(settings)
    add(ok, "entire checkpoints on git-branch" if ok else "entire checkpoints not on git-branch",
        "entire configure --checkpoint-backend branch", warn_only=True)

    hook = os.path.join(hooks_dir(), "pre-commit")
    ok = file_contains(hook, GUARD_MARKER)
    add(ok, ("guard installed: " if ok else "guard missing: ") + hook, "./hq setup")
    hooks_path = run(["git", "config", "--get", "core.hooksPath"]).stdout.strip()
    if hooks_path:
        add(False, "core.hooksPath=%s: git skips the shared hooks dir (guard and Entire hooks)" % hooks_path,
            "git config --unset core.hooksPath", warn_only=True)

    gc = run(["git", "config", "--get", "gc.auto"]).stdout.strip()
    add(gc == "0", "gc.auto=" + (gc or "unset"), "git config gc.auto 0 (./hq setup does it)")

    conductor_root = os.environ.get("CONDUCTOR_ROOT_PATH")
    if conductor_root:
        ok = os.path.exists(os.path.join(conductor_root, ".codex", "hooks.json"))
        add(ok, "codex hooks found in $CONDUCTOR_ROOT_PATH" if ok
            else "no .codex/hooks.json in $CONDUCTOR_ROOT_PATH (Codex will not find its hooks)",
            'git -C "$CONDUCTOR_ROOT_PATH" pull --ff-only', warn_only=True)

    branch = current_branch()
    on_default = branch == default_branch(cfg)
    add(not on_default, "branch %s%s" % (branch or "(detached HEAD)", " is the default branch" if on_default else ""),
        "work on a feature branch (./hq claim N creates one)", warn_only=True)
    return items


def cmd_bootstrap(args):
    cfg = load_config()
    slug = repo_slug()
    problems = 0

    labels = bootstrap_labels(cfg.get("lanes"))

    def make_label(spec):
        name, color, desc = spec
        p = gh(["label", "create", name, "--color", color, "--description", desc, "--force"], check=False)
        return name, (err_line(p) if p.returncode else "")

    errors = [(n, e) for n, e in pmap(make_label, labels, workers=6) if e]
    problems += len(errors)
    print("%s labels: %d/%d created or updated" % (BAD if errors else OK, len(labels) - len(errors), len(labels)))
    for name, e in errors:
        print("  %s %s: %s" % (BAD, name, e))

    p = gh(["api", "repos/%s/milestones?state=all&per_page=100" % slug], check=False)
    if p.returncode != 0:
        problems += 1
        print("%s milestones: %s" % (BAD, err_line(p)))
    else:
        have = {m.get("title") for m in loads(p.stdout, []) if isinstance(m, dict)}
        created, failed = [], []
        for title in MILESTONES:
            if title not in have:
                q = gh(["api", "repos/%s/milestones" % slug, "-f", "title=" + title], check=False)
                (created if q.returncode == 0 else failed).append(title if q.returncode == 0 else (title, err_line(q)))
        problems += len(failed)
        print("%s milestones: %d created, %d already existed" % (
            BAD if failed else OK, len(created), len(MILESTONES) - len(created) - len(failed)))
        for title, e in failed:
            print("  %s %s: %s" % (BAD, title, e))

    p = gh(["api", "-X", "PATCH", "repos/" + slug,
            "-F", "allow_squash_merge=true", "-F", "allow_merge_commit=false", "-F", "allow_rebase_merge=false",
            "-F", "delete_branch_on_merge=true",
            "-f", "squash_merge_commit_title=PR_TITLE", "-f", "squash_merge_commit_message=COMMIT_MESSAGES"],
           check=False)
    if p.returncode == 0:
        print("%s repo settings: squash only (PR title + commit messages, keeps Entire-Checkpoint trailers), "
              "delete branch on merge" % OK)
    else:
        problems += 1
        print("%s repo settings: %s" % (BAD, err_line(p)))

    p = gh(["api", "repos/%s/rulesets" % slug], check=False)
    existing = loads(p.stdout, []) if p.returncode == 0 else []
    if p.returncode == 0 and any(isinstance(r, dict) and r.get("name") == RULESET_NAME for r in existing):
        print("%s ruleset %s: already exists" % (OK, RULESET_NAME))
    else:
        if p.returncode == 0:
            p = gh(["api", "-X", "POST", "repos/%s/rulesets" % slug, "--input", "-"],
                   input_text=json.dumps(ruleset_payload()), check=False)
        if p.returncode == 0:
            print("%s ruleset %s: created (default branch needs PRs; no force-push or delete)" % (OK, RULESET_NAME))
        else:
            print("%s ruleset unavailable: %s; the pre-commit guard is the protection" % (WARN, err_line(p)))

    print("bootstrap %s for %s" % ("done" if not problems else "finished with %d problem(s)" % problems, slug))
    return EXIT_ERROR if problems else EXIT_OK


def cmd_board(args):
    cfg = load_config()
    issues, prs = pmap(lambda f: f(), [
        lambda: gh_json(["issue", "list", "--state", "open", "--limit", "200", "--json", ISSUE_LIST_FIELDS]),
        lambda: gh_json(["pr", "list", "--state", "open", "--limit", "100", "--json", PR_LIST_FIELDS]),
    ])
    issues, prs = issues or [], prs or []
    claims = {}
    if not args.brief:
        numbers = [i["number"] for i in issues if issue_status(i) == "status:in-progress"]

        def winner_for(n):
            p = gh(["issue", "view", n, "--json", "comments"], check=False)
            return n, (claim_winner(loads(p.stdout, {}).get("comments")) if p.returncode == 0 else None)

        claims = {n: w for n, w in pmap(winner_for, numbers) if w}
    try:
        stale_minutes = int(cfg.get("stale_minutes") or 60)
    except (TypeError, ValueError):
        stale_minutes = 60
    for line in render_board(issues, prs, claims, now_utc(), stale_minutes, brief=args.brief):
        print(line)
    return EXIT_OK


def switch_to(name):
    exists = run(["git", "rev-parse", "--verify", "--quiet", "refs/heads/" + name]).returncode == 0
    git(["switch", name] if exists else ["switch", "-c", name])
    print("%s %s branch %s" % (OK, "switched to" if exists else "created", name))
    return name


def confirm_claim(number, my_id, tries=3):
    """Re-read the comments until our claim is visible; return the winning claim."""
    for attempt in range(tries):
        if attempt:
            time.sleep(1.5)
        active = active_claims((gh_json(["issue", "view", number, "--json", "comments"]) or {}).get("comments"))
        if any(c["id"] == my_id for c in active):
            return active[0]
    raise HQError("posted a claim on #%s but cannot see it yet; re-run ./hq claim %s (it is idempotent)"
                  % (number, number))


def cmd_claim(args):
    cfg = load_config()
    n = args.number
    me = identity(args)
    issue = gh_json(["issue", "view", n, "--json", CLAIM_FIELDS])
    body = issue.get("body") or ""
    refs = blocked_by(body)
    states = dict(zip(refs, pmap(ref_state, refs)))
    for r in refs:
        if states[r] == "UNKNOWN":
            print("%s cannot read blocker #%d; ignoring it" % (WARN, r))
    now = now_utc()
    winner = claim_winner(issue.get("comments"))
    refusals = claim_refusals(n, issue.get("state"), [r for r in refs if states[r] == "OPEN"], winner, me["id"], now)
    if refusals:
        raise Refused(*refusals)

    branch = current_branch()
    if not branch or branch == default_branch(cfg):
        branch = switch_to(branch_name(me["login"], n, issue.get("title") or ""))

    if winner and winner["id"] == me["id"]:
        print("%s already yours: %s claimed #%d %s ago" % (OK, me["id"], n, age(winner.get("createdAt"), now)))
    else:
        post_comment(n, claim_body(me["id"], branch))
        winner = confirm_claim(n, me["id"])
        if winner["id"] != me["id"]:
            try:
                post_comment(n, release_body(me["id"], "lost race to " + winner["id"]))
            except HQError as e:
                print("%s could not post my release marker: %s" % (WARN, e.lines[0]))
            raise LostRace("lost the race for #%d to %s (claimed %s); pick another: ./hq board --brief"
                           % (n, winner["id"], winner.get("createdAt")))
        print("%s claimed #%d as %s on branch %s" % (OK, n, me["id"], branch))

    add = ["status:in-progress"] + (["agent:" + me["agent"]] if me["agent"] in KNOWN_AGENTS else [])
    gh_edit("issue", n, [
        ["--add-assignee", "@me", "--add-label", ",".join(add), "--remove-label", "status:ready"],
        ["--add-assignee", "@me", "--add-label", "status:in-progress"],
        ["--add-assignee", "@me"],
    ])

    inflight, prs = pmap(lambda f: f(), [
        lambda: gh_json(["issue", "list", "--state", "open", "--label", "status:in-progress", "--limit", "100",
                         "--json", "number,title,assignees"]),
        lambda: gh_json(["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,headRefName,files"]),
    ])
    inflight, prs = inflight or [], prs or []
    print()
    print("#%d %s" % (n, issue.get("title", "")))
    print(issue.get("url", ""))
    print()
    print(render_issue_body(body))
    print()
    print("IN FLIGHT")
    others = [i for i in inflight if i.get("number") != n]
    for i in others:
        logins = ", ".join(a.get("login", "") for a in (i.get("assignees") or [])) or "unassigned"
        print("  #%s %s  [%s]" % (i.get("number"), i.get("title", ""), logins))
    if not others:
        print("  nothing else in progress")
    print("OVERLAPS")
    scope = parse_scope(section(body, "Scope"))
    hits = scope_overlaps(scope, prs, exclude_branches={branch})
    if not scope:
        print("  issue has no Scope; check OVERLAPS in ./hq board")
    elif not hits:
        print("  none: no open PR touches " + ", ".join(scope))
    else:
        by_pr = {}
        for prn, path, _ in hits:
            by_pr.setdefault(prn, []).append(path)
        titles = {p.get("number"): p.get("title", "") for p in prs}
        for prn, paths in by_pr.items():
            more = " (+%d more)" % (len(paths) - 5) if len(paths) > 5 else ""
            print("  PR #%s %s: %s%s" % (prn, titles.get(prn, ""), ", ".join(paths[:5]), more))
    flag = agent_flag(me)
    print("NEXT STEPS")
    print('  1. context: entire search "<topic>", entire graph query, entire brain brief')
    print("  2. small commits; stage files by name (git add path/to/file), never git add -A")
    print("  3. ./hq check before every push")
    print("  4. write .context/pr-%d.md, then ./hq pr %d%s --body-file .context/pr-%d.md" % (n, n, flag, n))
    print('  stuck: ./hq release %d%s --needs-human --note "<why>"' % (n, flag))
    return EXIT_OK


def cmd_release(args):
    n = args.number
    me = identity(args)
    issue = gh_json(["issue", "view", n, "--json", "number,state,comments"])
    active = active_claims(issue.get("comments"))
    mine = any(c["id"] == me["id"] for c in active)
    others = [c for c in active if c["id"] != me["id"]]
    if others and not mine:
        raise Refused("#%d is claimed by %s, not %s" % (n, others[0]["id"], me["id"]),
                      "  to release your own claim, pass the --agent/--workspace you claimed with")
    post_comment(n, release_body(me["id"], args.note or ""))
    print("%s released #%d (%s)" % (OK, n, me["id"]))
    if others:
        print("%s #%d is still claimed by %s; labels left alone" % (WARN, n, others[0]["id"]))
    else:
        target = "status:needs-human" if args.needs_human else "status:ready"
        if gh_edit("issue", n, [["--remove-label", "status:in-progress", "--add-label", target],
                                ["--add-label", target]]):
            print("%s #%d is now %s" % (OK, n, target))
    if not any(split_id(c["id"])[0] == me["login"] for c in others):
        if gh_edit("issue", n, [["--remove-assignee", "@me"]]):
            print("%s unassigned %s" % (OK, me["login"]))
    # Drop this vendor's agent label unless another active claim still uses that vendor,
    # so PRs (which copy agent:* labels) credit only the agents that did the work.
    if me["agent"] in KNOWN_AGENTS and not any(split_id(c["id"])[1] == me["agent"] for c in others):
        gh_edit("issue", n, [["--remove-label", "agent:" + me["agent"]]])
    return EXIT_OK


def dirty_lines(root, body_file):
    """`git status --porcelain` lines, minus the untracked PR body file itself."""
    rel = os.path.relpath(os.path.abspath(body_file), root).replace(os.sep, "/")
    out = []
    for line in git(["status", "--porcelain"]).stdout.splitlines():
        if not line.strip():
            continue
        path = line[3:].strip('"')
        if line.startswith("??") and (path == rel or (path.endswith("/") and rel.startswith(path))):
            continue
        out.append(line)
    return out


def push_branch():
    p = git(PUSH_ARGS, check=False)
    if p.returncode != 0 and push_should_retry((p.stdout or "") + (p.stderr or "")):
        print("%s push rejected by the remote (failed); retrying once in 3s" % WARN)
        time.sleep(3)
        p = git(PUSH_ARGS, check=False)
    if p.returncode != 0:
        raise HQError("git push failed:", *["  " + ln for ln in tail((p.stderr or "") + (p.stdout or ""), 15)])


def cmd_pr(args):
    root = repo_root()
    cfg = load_config(root)
    default = default_branch(cfg)
    n = args.number
    branch = current_branch()
    if not branch or branch == default:
        raise Refused("on %s: open PRs from a feature branch (./hq claim %d makes one)"
                      % (branch or "a detached HEAD", n))
    try:
        with open(args.body_file, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        raise HQError("cannot read --body-file %s: %s" % (args.body_file, e.strerror or e))
    if not args.allow_dirty:
        dirty = dirty_lines(root, args.body_file)
        if dirty:
            raise Refused("uncommitted changes: commit them (stage files by name) or pass --allow-dirty",
                          *["  " + ln for ln in dirty[:10]])
    if not args.no_rebase_check:
        f = git(["fetch", "origin", default], check=False)
        if f.returncode != 0:
            print("%s git fetch origin %s failed (%s); checking the last fetched copy" % (WARN, default, err_line(f)))
        has_remote = run(["git", "rev-parse", "--verify", "--quiet", "refs/remotes/origin/" + default]).returncode == 0
        if has_remote and run(["git", "merge-base", "--is-ancestor", "origin/" + default, "HEAD"]).returncode != 0:
            raise Refused("rebase first: git rebase origin/%s, then ./hq check" % default)
    push_branch()
    print("%s pushed %s" % (OK, branch))

    me = identity(args)
    issue = gh_json(["issue", "view", n, "--json", "number,title,labels,url"])
    title = pr_title(issue.get("title"), n)
    body = pr_body(text, n, me["id"])
    existing = gh_json(["pr", "list", "--head", branch, "--state", "open", "--json", "number,url"]) or []
    if existing:
        prn, url = existing[0]["number"], existing[0]["url"]
        gh(["pr", "edit", prn, "--title", title, "--body-file", "-"], input_text=body)
        print("%s updated PR #%s" % (OK, prn))
    else:
        cmd = ["pr", "create", "--base", default, "--head", branch, "--title", title, "--body-file", "-"]
        if args.draft:
            cmd.append("--draft")
        m = re.search(r"https://\S+/pull/(\d+)", gh(cmd, input_text=body).stdout or "")
        if m:
            prn, url = int(m.group(1)), m.group(0)
        else:
            found = gh_json(["pr", "list", "--head", branch, "--state", "open", "--json", "number,url"]) or []
            if not found:
                raise HQError("gh pr create returned no PR URL and no open PR was found for " + branch)
            prn, url = found[0]["number"], found[0]["url"]
        print("%s opened PR #%s%s" % (OK, prn, " (draft)" if args.draft else ""))

    names = label_names(issue)
    copy = labels_to_copy(names)
    if copy and gh_edit("pr", prn, [["--add-label", ",".join(copy)]]):
        print("%s PR labels: %s" % (OK, ", ".join(copy)))
    if gh_edit("issue", n, [["--add-label", "status:review", "--remove-label", "status:in-progress"],
                            ["--add-label", "status:review"]]):
        print("%s #%d is now status:review" % (OK, n))
    print(url)
    print("NEXT STEPS")
    print("  entire trail show      (Entire opens a trail for the PR by itself)")
    print("  entire trail ci-pr     (links it to the PR; safe to re-run)")
    print('  only if trail show finds none: entire trail create --title "%s" --type feature'
          % title.replace('"', '\\"'))
    if "size:S" not in names:
        print("  entire review")
    print("  gh pr edit %s --add-label review:pass" % prn)
    print("  entire trail ready")
    print("  ./hq ship %s" % prn)
    return EXIT_OK


def cmd_ship(args):
    cfg = load_config()
    prn = args.pr
    view = ["pr", "view", prn, "--json", SHIP_FIELDS]
    pr = gh_json(view)
    for _ in range(3):
        if pr.get("mergeable") != "UNKNOWN":
            break
        time.sleep(2)
        pr = gh_json(view)
    gates = ship_gates(pr, args.skip_review, default_branch(cfg))
    if gates:
        raise Refused(*gates)
    if pr.get("mergeable") == "UNKNOWN":
        print("%s GitHub has not computed mergeability yet; trying the merge anyway" % WARN)
    p = gh(["pr", "merge", prn, "--squash"], check=False)  # no --delete-branch: breaks in worktrees
    if p.returncode != 0:
        raise HQError("gh pr merge %s failed: %s" % (prn, err_line(p)))
    print("%s merged PR #%s %s" % (OK, prn, pr.get("title", "")))
    print(pr.get("url", ""))

    closing = [r.get("number") for r in (pr.get("closingIssuesReferences") or []) if isinstance(r, dict)]
    just_closed = set(closing) | {prn}  # GitHub closes linked issues asynchronously
    blocked = gh_json(["issue", "list", "--state", "open", "--label", "status:blocked", "--limit", "200",
                       "--json", "number,title,body"]) or []
    refs = sorted({r for i in blocked for r in blocked_by(i.get("body")) if r not in just_closed})
    states = dict(zip(refs, pmap(ref_state, refs)))
    todo = unblock_candidates(blocked, states, just_closed)
    titles = {i.get("number"): i.get("title", "") for i in blocked}
    for num, freed in todo:
        gh_edit("issue", num, [["--add-label", "status:ready", "--remove-label", "status:blocked"]])
        gh(["issue", "comment", num, "--body", unblock_comment(freed, prn)], check=False)
        print("%s unblocked #%s %s" % (OK, num, titles.get(num, "")))
    if not todo:
        print("no issues unblocked")
    return EXIT_OK


def cmd_check(args):
    root = repo_root()
    cmds = load_config(root).get("check") or []
    if not cmds:
        print('no checks configured yet (hq.json "check")')
        return EXIT_OK
    failed = run_command_list(cmds, root)
    print("%s %d/%d checks passed" % (BAD if failed else OK, len(cmds) - failed, len(cmds)))
    return EXIT_ERROR if failed else EXIT_OK


# =================================================================== argparse

class _Parser(argparse.ArgumentParser):
    def error(self, message):  # usage errors exit 1; exit 2 means "refused by a gate"
        self.print_usage(sys.stderr)
        self.exit(EXIT_ERROR, "hq: error: %s\n" % message)


def _number(text):
    try:
        return int(str(text).lstrip("#"))
    except ValueError:
        raise argparse.ArgumentTypeError("not an issue/PR number: %s" % text)


def build_parser():
    parser = _Parser(prog="hq", description="Coordinate humans and coding agents through GitHub Issues.",
                     epilog="exit codes: 0 ok, 1 error, 2 refused by a gate, 3 lost a claim race")
    sub = parser.add_subparsers(dest="command", metavar="<command>")
    who = argparse.ArgumentParser(add_help=False)
    who.add_argument("--agent", help="agent name, e.g. claude, codex, cursor (default: $HQ_AGENT or 'agent')")
    who.add_argument("--workspace", help="workspace name (default: $CONDUCTOR_WORKSPACE_NAME or worktree folder)")

    s = sub.add_parser("setup", help="install the guard, set gc.auto=0, run setup commands, print a checklist")
    mode = s.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="only report; exit 1 if anything is a fail")
    mode.add_argument("--ci", action="store_true", help='only run hq.json "setup" commands')
    s.set_defaults(func=cmd_setup)

    s = sub.add_parser("bootstrap", help="labels, milestones, repo merge settings, ruleset (idempotent)")
    s.set_defaults(func=cmd_bootstrap)

    s = sub.add_parser("board", help="who is doing what: in progress, review, blocked, ready, overlaps, stale")
    s.add_argument("--brief", action="store_true", help="at most ~15 lines, no per-issue comment fetches")
    s.set_defaults(func=cmd_board)

    s = sub.add_parser("claim", parents=[who], help="claim issue N (race-safe), branch, and print its brief")
    s.add_argument("number", type=_number, help="issue number")
    s.set_defaults(func=cmd_claim)

    s = sub.add_parser("release", parents=[who], help="give issue N back (status:ready, or status:needs-human)")
    s.add_argument("number", type=_number, help="issue number")
    s.add_argument("--needs-human", action="store_true", help="label status:needs-human instead of status:ready")
    s.add_argument("--note", help="why (posted with the release)")
    s.set_defaults(func=cmd_release)

    s = sub.add_parser("pr", parents=[who], help="push the branch and open/update the PR for issue N")
    s.add_argument("number", type=_number, help="issue number")
    s.add_argument("--body-file", required=True, help="PR description (markdown), e.g. .context/pr-N.md")
    s.add_argument("--draft", action="store_true", help="open as a draft PR")
    s.add_argument("--allow-dirty", action="store_true", help="allow uncommitted changes")
    s.add_argument("--no-rebase-check", action="store_true", help="skip the origin/<default> ancestry check")
    s.set_defaults(func=cmd_pr)

    s = sub.add_parser("ship", help="gate-check, squash-merge PR, and unblock dependent issues")
    s.add_argument("pr", type=_number, help="PR number")
    s.add_argument("--skip-review", action="store_true", help="do not require the review:pass label")
    s.set_defaults(func=cmd_ship)

    s = sub.add_parser("check", help='run hq.json "check" commands')
    s.set_defaults(func=cmd_check)
    return parser


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace", line_buffering=True)
        except (AttributeError, ValueError):
            pass
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return EXIT_ERROR
    try:
        return args.func(args) or EXIT_OK
    except HQError as e:
        sys.stdout.flush()
        for line in e.lines:
            print(line if line.startswith(" ") else "%s %s" % (BAD, line), file=sys.stderr)
        return e.code
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
