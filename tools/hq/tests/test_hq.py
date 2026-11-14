"""Unit tests for the pure logic in tools/hq/hq.py (no gh/git calls).

Run: python3 -m unittest discover -s tools/hq/tests -v
"""
from __future__ import annotations

import importlib.util
import os
import stat
import tempfile
import unittest
from datetime import datetime, timezone

HQ_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "hq.py")
_spec = importlib.util.spec_from_file_location("hq", HQ_PATH)
hq = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hq)

NOW = datetime(2026, 11, 14, 12, 0, 0, tzinfo=timezone.utc)
T1, T2, T3, T4 = (
    "2026-11-14T11:00:00Z",
    "2026-11-14T11:10:00Z",
    "2026-11-14T11:20:00Z",
    "2026-11-14T11:30:00Z",
)
A = "ehewes/claude/cayenne"
B = "teammate/codex/paprika"


def L(*names):
    return [{"name": n} for n in names]


def comment(body, ts):
    return {"body": body, "createdAt": ts, "author": {"login": "someone"}}


def claim(cid, ts, branch="feat"):
    return comment(hq.claim_body(cid, branch), ts)


def release(cid, ts, note=""):
    return comment(hq.release_body(cid, note), ts)


def check_run(name, status="COMPLETED", conclusion="SUCCESS"):
    return {"__typename": "CheckRun", "name": name, "status": status, "conclusion": conclusion}


def status_ctx(name, state):
    return {"__typename": "StatusContext", "context": name, "state": state}


ISSUE_BODY = """### Goal

Build the login page.

### Acceptance criteria

- [ ] form renders
- [ ] submit calls the API

### Scope

- `web/src/`
- `api/*.py`

### Do not touch

_No response_

### Blocked by

#12, #14

### Verify

npm test

### Notes

_No response_
"""


class SectionTests(unittest.TestCase):
    def test_parses_each_heading(self):
        s = hq.parse_sections(ISSUE_BODY)
        self.assertEqual(s["goal"], "Build the login page.")
        self.assertEqual(s["acceptance criteria"], "- [ ] form renders\n- [ ] submit calls the API")
        self.assertEqual(s["verify"], "npm test")
        self.assertEqual(s["blocked by"], "#12, #14")

    def test_no_response_is_empty(self):
        s = hq.parse_sections(ISSUE_BODY)
        self.assertEqual(s["do not touch"], "")
        self.assertEqual(s["notes"], "")

    def test_lookup_is_case_insensitive_and_missing_is_empty(self):
        self.assertEqual(hq.section(ISSUE_BODY, "BLOCKED BY"), "#12, #14")
        self.assertEqual(hq.section(ISSUE_BODY, "Nope"), "")
        self.assertEqual(hq.section("", "Goal"), "")
        self.assertEqual(hq.section(None, "Goal"), "")

    def test_crlf_deeper_headings_and_code_fences_stay_inside(self):
        body = "### Goal\r\n\r\nDo it\r\n#### detail\r\n```\r\n### not a heading\r\n```\r\n### Verify\r\nrun"
        s = hq.parse_sections(body)
        self.assertEqual(s["goal"], "Do it\n#### detail\n```\n### not a heading\n```")
        self.assertEqual(s["verify"], "run")

    def test_order_preserved(self):
        heads = [h for h, _ in hq.parse_sections_ordered(ISSUE_BODY)]
        self.assertEqual(heads[:3], ["Goal", "Acceptance criteria", "Scope"])

    def test_render_issue_body_drops_empty_sections(self):
        text = hq.render_issue_body(ISSUE_BODY)
        self.assertIn("### Goal\nBuild the login page.", text)
        self.assertNotIn("_No response_", text)
        self.assertNotIn("### Notes", text)
        self.assertEqual(hq.render_issue_body("plain text body"), "plain text body")
        self.assertEqual(hq.render_issue_body(""), "(empty issue body)")


class IssueRefTests(unittest.TestCase):
    def test_hash_refs(self):
        self.assertEqual(hq.parse_issue_refs("#12, #14"), [12, 14])

    def test_none_variants(self):
        for text in ("none", "None", "", None, "_No response_", "n/a", "-"):
            self.assertEqual(hq.parse_issue_refs(text), [], text)

    def test_bullets_urls_and_dedupe(self):
        text = "- #3 (auth)\n- https://github.com/o/r/issues/7\n- #3\n- https://github.com/o/r/pull/9"
        self.assertEqual(hq.parse_issue_refs(text), [3, 7, 9])

    def test_blocked_by_from_body(self):
        self.assertEqual(hq.blocked_by(ISSUE_BODY), [12, 14])
        self.assertEqual(hq.blocked_by("### Blocked by\n\nnone\n"), [])
        self.assertEqual(hq.blocked_by("no sections at all #5"), [])


class ScopeTests(unittest.TestCase):
    def test_bullets_with_backticks(self):
        self.assertEqual(hq.parse_scope("- `web/src/`\n- `api/*.py`"), ["web/src/", "api/*.py"])

    def test_comma_separated(self):
        self.assertEqual(hq.parse_scope("web/src/, api/*.py,docs/"), ["web/src/", "api/*.py", "docs/"])

    def test_empty_values(self):
        for text in ("", None, "none", "_No response_", "N/A"):
            self.assertEqual(hq.parse_scope(text), [], text)

    def test_strips_dot_slash_comments_numbering_and_dupes(self):
        text = "* ./web/src/ (frontend)\n1. /api/\n- web/src/"
        self.assertEqual(hq.parse_scope(text), ["web/src/", "api/"])

    def test_multiple_backtick_spans_on_one_line(self):
        self.assertEqual(hq.parse_scope("`a/`, `b/*.ts` and more words"), ["a/", "b/*.ts"])

    def test_from_issue_body(self):
        self.assertEqual(hq.parse_scope(hq.section(ISSUE_BODY, "Scope")), ["web/src/", "api/*.py"])


class ClaimTests(unittest.TestCase):
    def test_marker_roundtrip(self):
        self.assertEqual(
            hq.parse_marker(hq.claim_body(A, "ehewes/12-login")),
            {"kind": "claim", "id": A, "branch": "ehewes/12-login"},
        )
        self.assertEqual(hq.parse_marker(hq.release_body(A, "done")), {"kind": "release", "id": A})

    def test_marker_must_lead_the_comment(self):
        self.assertIsNone(hq.parse_marker("see <!-- hq:claim id=a/b/c branch=x -->"))
        self.assertIsNone(hq.parse_marker("just a comment"))
        self.assertIsNone(hq.parse_marker(None))

    def test_bodies_have_human_lines(self):
        self.assertIn(
            "Claimed by **ehewes** via `claude` (workspace `cayenne`) on branch `br`",
            hq.claim_body(A, "br"),
        )
        self.assertTrue(hq.release_body(A, "lost race").startswith("<!-- hq:release id=%s -->" % A))
        self.assertIn("lost race", hq.release_body(A, "lost race"))

    def test_later_release_cancels(self):
        self.assertEqual(hq.active_claims([claim(A, T1), release(A, T2)]), [])

    def test_earlier_release_does_not_cancel(self):
        self.assertEqual([c["id"] for c in hq.active_claims([release(A, T1), claim(A, T2)])], [A])

    def test_release_only_affects_its_own_id(self):
        got = hq.active_claims([claim(A, T1), claim(B, T2), release(B, T3)])
        self.assertEqual([c["id"] for c in got], [A])

    def test_two_ids_earliest_created_wins_even_if_listed_later(self):
        self.assertEqual(hq.claim_winner([claim(B, T2), claim(A, T1)])["id"], A)

    def test_tie_goes_to_list_order(self):
        self.assertEqual(hq.claim_winner([claim(B, T1), claim(A, T1)])["id"], B)
        self.assertEqual(hq.claim_winner([claim(A, T1), claim(B, T1)])["id"], A)

    def test_release_in_same_second_after_in_list_cancels(self):
        self.assertEqual(hq.active_claims([claim(A, T1), release(A, T1)]), [])

    def test_second_claimer_wins_after_first_releases(self):
        self.assertEqual(hq.claim_winner([claim(A, T1), claim(B, T2), release(A, T3)])["id"], B)

    def test_reclaim_after_release_queues_behind_others(self):
        got = hq.active_claims([claim(A, T1), release(A, T2), claim(B, T3), claim(A, T4)])
        self.assertEqual([c["id"] for c in got], [B, A])

    def test_duplicate_claims_keep_earliest(self):
        got = hq.active_claims([claim(A, T1, "one"), claim(A, T3, "two")])
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["branch"], "one")
        self.assertEqual(got[0]["createdAt"], T1)

    def test_no_claims(self):
        self.assertIsNone(hq.claim_winner([comment("hi", T1)]))
        self.assertIsNone(hq.claim_winner([]))
        self.assertIsNone(hq.claim_winner(None))


class ClaimRefusalTests(unittest.TestCase):
    def test_ok(self):
        self.assertEqual(hq.claim_refusals(12, "OPEN", [], None, A, NOW), [])

    def test_closed(self):
        got = hq.claim_refusals(12, "CLOSED", [], None, A, NOW)
        self.assertEqual(len(got), 1)
        self.assertIn("CLOSED", got[0])

    def test_open_blockers(self):
        got = hq.claim_refusals(12, "OPEN", [3, 4], None, A, NOW)
        self.assertEqual(len(got), 1)
        self.assertIn("#3, #4", got[0])

    def test_held_by_someone_else_says_who_and_since_when(self):
        winner = {"id": B, "createdAt": T1, "branch": "x"}
        got = hq.claim_refusals(12, "OPEN", [], winner, A, NOW)
        self.assertEqual(len(got), 1)
        self.assertIn(B, got[0])
        self.assertIn(T1, got[0])
        self.assertIn("1h", got[0])

    def test_held_by_me_is_not_a_refusal(self):
        winner = {"id": A, "createdAt": T1, "branch": "x"}
        self.assertEqual(hq.claim_refusals(12, "OPEN", [], winner, A, NOW), [])


class SlugTests(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(hq.slugify("Add Login Page!"), "add-login-page")

    def test_punctuation_collapses(self):
        self.assertEqual(hq.slugify("  API: /users  (v2) "), "api-users-v2")

    def test_accents_folded(self):
        self.assertEqual(hq.slugify("Café menu"), "cafe-menu")

    def test_max_len_without_trailing_hyphen(self):
        self.assertEqual(hq.slugify("a" * 39 + " bcdef"), "a" * 39)
        self.assertLessEqual(len(hq.slugify("word " * 30)), 40)

    def test_branch_name(self):
        self.assertEqual(hq.branch_name("ehewes", 12, "Add login"), "ehewes/12-add-login")
        self.assertEqual(hq.branch_name("ehewes", 12, "!!!"), "ehewes/12")


class OverlapTests(unittest.TestCase):
    PRS = [
        {"number": 1, "headRefName": "a", "files": [{"path": "web/src/app.tsx"}, {"path": "README.md"}]},
        {"number": 2, "headRefName": "b", "files": [{"path": "web/src/app.tsx"}]},
        {"number": 3, "headRefName": "c", "files": [
            {"path": "web/src/app.tsx"}, {"path": "README.md"}, {"path": "api/main.py"}]},
        {"number": 4, "headRefName": "d", "files": None},
    ]

    def test_overlap_map(self):
        self.assertEqual(
            hq.overlap_map(self.PRS),
            {"README.md": [1, 3], "web/src/app.tsx": [1, 2, 3]},
        )
        self.assertEqual(hq.overlap_map([]), {})

    def test_scope_matches(self):
        cases = [
            ("web/src/", "web/src/app.tsx", True),
            ("web/src/", "web/srcx/a.ts", False),
            ("web/src", "web/src/a.ts", True),
            ("web/src", "web/srcx/a.ts", False),
            ("api/*.py", "api/main.py", True),
            ("api/*.py", "web/main.py", False),
            ("web/*/", "web/lib/x.ts", True),
            ("README.md", "README.md", True),
            ("./web/", "web/a.ts", True),
            ("", "web/a.ts", False),
        ]
        for pattern, path, expected in cases:
            self.assertEqual(hq.scope_matches(pattern, path), expected, (pattern, path))

    def test_scope_overlaps(self):
        self.assertEqual(hq.scope_overlaps(["api/*.py", "docs/"], self.PRS), [(3, "api/main.py", "api/*.py")])
        hits = hq.scope_overlaps(["web/src/"], self.PRS, exclude_branches={"b"})
        self.assertEqual([h[0] for h in hits], [1, 3])
        self.assertEqual(hq.scope_overlaps([], self.PRS), [])


class TimeTests(unittest.TestCase):
    def test_parse_ts(self):
        self.assertEqual(hq.parse_ts("2026-11-14T12:00:00Z"), NOW)
        self.assertEqual(hq.parse_ts("2026-11-14T12:00:00.1234Z").replace(microsecond=0), NOW)
        self.assertIsNone(hq.parse_ts("garbage"))
        self.assertIsNone(hq.parse_ts(None))

    def test_stale(self):
        self.assertTrue(hq.is_stale("2026-11-14T10:30:00Z", NOW, 60))
        self.assertFalse(hq.is_stale("2026-11-14T11:30:00Z", NOW, 60))
        self.assertTrue(hq.is_stale("2026-11-14T11:30:00Z", NOW, 15))
        self.assertFalse(hq.is_stale(None, NOW, 60))
        self.assertFalse(hq.is_stale("garbage", NOW, 60))

    def test_age(self):
        self.assertEqual(hq.age("2026-11-14T11:58:00Z", NOW), "2m")
        self.assertEqual(hq.age("2026-11-14T09:00:00Z", NOW), "3h")
        self.assertEqual(hq.age("2026-11-11T12:00:00Z", NOW), "3d")
        self.assertEqual(hq.age(None, NOW), "?")


class CheckRollupTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(hq.evaluate_checks([]), ("none", []))
        self.assertEqual(hq.evaluate_checks(None), ("none", []))

    def test_success_incl_neutral_skipped_and_status_context(self):
        rollup = [
            check_run("ci"),
            check_run("lint", conclusion="SKIPPED"),
            check_run("x", conclusion="NEUTRAL"),
            status_ctx("vercel", "SUCCESS"),
        ]
        self.assertEqual(hq.evaluate_checks(rollup), ("success", []))

    def test_pending_check_run(self):
        rollup = [check_run("ci"), check_run("e2e", status="IN_PROGRESS", conclusion="")]
        self.assertEqual(hq.evaluate_checks(rollup), ("pending", ["e2e"]))

    def test_pending_status_context(self):
        self.assertEqual(hq.evaluate_checks([status_ctx("vercel", "PENDING")]), ("pending", ["vercel"]))

    def test_failure_beats_pending(self):
        rollup = [
            check_run("ci", conclusion="FAILURE"),
            check_run("e2e", status="QUEUED", conclusion=None),
            status_ctx("deploy", "ERROR"),
        ]
        self.assertEqual(hq.evaluate_checks(rollup), ("failure", ["ci", "deploy"]))

    def test_status_context_failure_and_cancelled_run(self):
        self.assertEqual(hq.evaluate_checks([status_ctx("v", "FAILURE")]), ("failure", ["v"]))
        self.assertEqual(hq.evaluate_checks([check_run("c", conclusion="CANCELLED")]), ("failure", ["c"]))

    def test_missing_typename_is_inferred(self):
        self.assertEqual(hq.evaluate_checks([{"context": "v", "state": "SUCCESS"}]), ("success", []))
        self.assertEqual(hq.evaluate_checks([{"name": "c", "status": "QUEUED"}]), ("pending", ["c"]))


def make_pr(**overrides):
    pr = {
        "number": 7,
        "state": "OPEN",
        "isDraft": False,
        "mergeable": "MERGEABLE",
        "labels": L("review:pass"),
        "statusCheckRollup": [check_run("ci")],
    }
    pr.update(overrides)
    return pr


class ShipGateTests(unittest.TestCase):
    def test_all_green(self):
        self.assertEqual(hq.ship_gates(make_pr()), [])

    def test_zero_checks_is_ok(self):
        self.assertEqual(hq.ship_gates(make_pr(statusCheckRollup=[])), [])

    def test_not_open(self):
        gates = hq.ship_gates(make_pr(state="MERGED"))
        self.assertEqual(len(gates), 1)
        self.assertIn("MERGED", gates[0])

    def test_draft(self):
        gates = hq.ship_gates(make_pr(isDraft=True))
        self.assertEqual(len(gates), 1)
        self.assertIn("draft", gates[0])

    def test_conflicting(self):
        gates = hq.ship_gates(make_pr(mergeable="CONFLICTING"))
        self.assertEqual(len(gates), 1)
        self.assertIn("CONFLICTING", gates[0])

    def test_pending_checks(self):
        gates = hq.ship_gates(make_pr(statusCheckRollup=[check_run("ci", status="IN_PROGRESS", conclusion="")]))
        self.assertEqual(gates, ["checks still running: ci"])

    def test_failing_checks(self):
        gates = hq.ship_gates(make_pr(statusCheckRollup=[status_ctx("deploy", "FAILURE")]))
        self.assertEqual(gates, ["checks failing: deploy"])

    def test_review_label_required_unless_skipped(self):
        gates = hq.ship_gates(make_pr(labels=L("review:changes")))
        self.assertEqual(len(gates), 1)
        self.assertIn("review:pass", gates[0])
        self.assertEqual(hq.ship_gates(make_pr(labels=[]), skip_review=True), [])

    def test_reports_every_failing_gate(self):
        gates = hq.ship_gates(make_pr(isDraft=True, mergeable="CONFLICTING", labels=[]))
        self.assertEqual(len(gates), 3)


class ReadySortTests(unittest.TestCase):
    def test_lane_then_priority_then_size(self):
        issues = [
            {"number": 1, "labels": L("lane:web", "P2", "size:S")},
            {"number": 2, "labels": L("lane:api", "P1", "size:M")},
            {"number": 3, "labels": L("lane:api", "P0", "size:L")},
            {"number": 4, "labels": L("lane:api", "P0", "size:S")},
            {"number": 5, "labels": []},
            {"number": 6, "labels": L("lane:web", "size:S")},
            {"number": 7, "labels": L("lane:web", "P2", "size:M")},
            {"number": 8, "labels": L("lane:web", "P2")},
        ]
        self.assertEqual([i["number"] for i in hq.sort_ready(issues)], [4, 3, 2, 1, 7, 8, 6, 5])


class PrTests(unittest.TestCase):
    def test_labels_to_copy(self):
        names = ["lane:web", "P1", "agent:claude", "size:S", "type:feat",
                 "status:in-progress", "epic", "P10", "review:pass"]
        self.assertEqual(hq.labels_to_copy(names), ["lane:web", "P1", "agent:claude", "size:S", "type:feat"])

    def test_pr_body_and_title(self):
        self.assertEqual(
            hq.pr_body("Did X.\n\n", 12, A),
            "Did X.\n\nCloses #12\n\n---\nAgent: `ehewes/claude/cayenne`",
        )
        self.assertEqual(hq.pr_title("Add login", 12), "Add login (#12)")


class PushTests(unittest.TestCase):
    def test_push_uses_force_with_lease(self):
        self.assertEqual(hq.PUSH_ARGS, ["push", "-u", "--force-with-lease", "origin", "HEAD"])

    def test_retry_only_on_remote_rejected_failed(self):
        out = " ! [remote rejected] HEAD -> feat (failed)\nerror: failed to push some refs"
        self.assertTrue(hq.push_should_retry(out))
        self.assertFalse(hq.push_should_retry(" ! [rejected] HEAD -> feat (stale info)"))
        self.assertFalse(hq.push_should_retry(" ! [remote rejected] HEAD -> main (protected branch hook declined)"))
        self.assertFalse(hq.push_should_retry(""))
        self.assertFalse(hq.push_should_retry(None))


class UnblockTests(unittest.TestCase):
    def test_unblocks_only_when_every_ref_is_closed(self):
        blocked = [
            {"number": 10, "body": "### Blocked by\n\n#1, #2\n"},
            {"number": 11, "body": "### Blocked by\n\n#1, #3\n"},
            {"number": 12, "body": "### Blocked by\n\nnone\n"},
            {"number": 13, "body": "### Blocked by\n\n#2\n"},
            {"number": 14, "body": "### Blocked by\n\n#4\n"},
        ]
        states = {2: "CLOSED", 3: "OPEN", 4: "UNKNOWN"}
        self.assertEqual(hq.unblock_candidates(blocked, states, just_closed={1}), [(10, [1]), (13, [])])

    def test_unblock_comment(self):
        self.assertEqual(hq.unblock_comment([1], 20), "Unblocked: #1 merged in #20")
        self.assertIn("all blockers are closed", hq.unblock_comment([], 20))


class BoardTests(unittest.TestCase):
    def setUp(self):
        self.issues = [
            {"number": 1, "title": "Login", "labels": L("status:in-progress", "lane:web"),
             "assignees": [{"login": "ehewes"}], "updatedAt": "2026-11-14T10:00:00Z", "body": ""},
            {"number": 2, "title": "API", "labels": L("status:ready", "lane:api", "P0", "size:S"),
             "assignees": [], "updatedAt": "2026-11-14T11:59:00Z", "body": ""},
            {"number": 3, "title": "Deploy", "labels": L("status:blocked"), "assignees": [],
             "updatedAt": "2026-11-14T11:00:00Z", "body": "### Blocked by\n\n#1, #9\n"},
            {"number": 4, "title": "Design", "labels": L("status:needs-human"), "assignees": [],
             "updatedAt": "2026-11-14T11:00:00Z", "body": ""},
        ]
        self.prs = [
            {"number": 20, "title": "Login (#1)", "headRefName": "ehewes/1-login", "isDraft": False,
             "labels": L("review:pass"), "statusCheckRollup": [check_run("ci")], "mergeable": "MERGEABLE",
             "updatedAt": "2026-11-14T11:50:00Z", "files": [{"path": "web/a.ts"}],
             "closingIssuesReferences": [{"number": 1}]},
            {"number": 21, "title": "Other", "headRefName": "x", "isDraft": True, "labels": [],
             "statusCheckRollup": [check_run("ci", status="IN_PROGRESS", conclusion="")],
             "mergeable": "CONFLICTING", "updatedAt": "2026-11-14T11:50:00Z",
             "files": [{"path": "web/a.ts"}], "closingIssuesReferences": []},
        ]
        self.claims = {1: {"id": A, "createdAt": "2026-11-14T11:30:00Z", "branch": "ehewes/1-login"}}

    def test_full_board_has_every_section(self):
        text = "\n".join(hq.render_board(self.issues, self.prs, self.claims, NOW, 60))
        for heading in ("IN PROGRESS", "REVIEW", "NEEDS HUMAN", "BLOCKED", "READY", "OVERLAPS", "STALE"):
            self.assertIn(heading, text)
        inprog = [ln for ln in text.splitlines() if ln.startswith("  #1 ")][0]
        self.assertIn(A, inprog)
        self.assertIn("30m", inprog)
        self.assertIn("PR #20", inprog)
        self.assertIn("web/a.ts: PR #20, #21", text)
        pr21 = [ln for ln in text.splitlines() if ln.startswith("  PR #21")][0]
        self.assertIn("CONFLICTING", pr21)
        self.assertIn("draft", pr21)
        self.assertIn("CI …", pr21)
        blocked = [ln for ln in text.splitlines() if ln.startswith("  #3 ")][0]
        self.assertIn("#1", blocked)
        self.assertNotIn("#9", blocked)

    def test_claimer_falls_back_to_assignee(self):
        text = "\n".join(hq.render_board(self.issues, self.prs, {}, NOW, 60))
        inprog = [ln for ln in text.splitlines() if ln.startswith("  #1 ")][0]
        self.assertIn("ehewes", inprog)

    def test_brief_stays_short(self):
        issues = [{"number": i, "title": "t%d" % i, "labels": L("status:in-progress"), "assignees": [],
                   "updatedAt": "2026-11-14T11:59:00Z", "body": ""} for i in range(1, 11)]
        issues += [{"number": i, "title": "r%d" % i, "labels": L("status:ready", "P1"), "assignees": [],
                    "updatedAt": "2026-11-14T11:59:00Z", "body": ""} for i in range(11, 31)]
        prs = [{"number": 100 + k, "title": "p", "headRefName": "b%d" % k, "isDraft": False, "labels": [],
                "statusCheckRollup": [], "mergeable": "MERGEABLE", "updatedAt": "2026-11-14T11:59:00Z",
                "files": [{"path": "a"}, {"path": "b"}, {"path": "c"}], "closingIssuesReferences": []}
               for k in range(5)]
        lines = hq.render_board(issues, prs, {}, NOW, 60, brief=True)
        self.assertLessEqual(len(lines), 15)
        text = "\n".join(lines)
        self.assertIn("#15 r15", text)
        self.assertNotIn("#16 r16", text)

    def test_empty_board(self):
        self.assertEqual(len(hq.render_board([], [], {}, NOW, 60)), 1)


class BootstrapTests(unittest.TestCase):
    def test_labels_include_lanes_and_are_valid(self):
        labels = hq.bootstrap_labels({"web": {"owner": "ehewes", "paths": ["web/"]}})
        names = [name for name, _, _ in labels]
        for expected in ("status:ready", "status:in-progress", "status:review", "status:blocked",
                         "status:needs-human", "P0", "P1", "P2", "size:S", "size:M", "size:L",
                         "type:feat", "type:bug", "type:chore", "type:spike", "type:docs",
                         "review:pass", "review:changes", "agent:claude", "agent:codex",
                         "agent:cursor", "epic", "lane:web"):
            self.assertIn(expected, names)
        self.assertEqual(len(names), len(set(names)))
        for name, color, desc in labels:
            self.assertRegex(color, r"^[0-9a-f]{6}$", name)
            self.assertLessEqual(len(desc), 100, name)
        self.assertIn(("P0", "b60205", "Demo-critical"), labels)
        self.assertIn(("size:S", "c5def5", "<=30 min of agent time"), labels)

    def test_ruleset_payload(self):
        p = hq.ruleset_payload()
        self.assertEqual(p["name"], "hq-protect-main")
        self.assertEqual(p["target"], "branch")
        self.assertEqual(p["enforcement"], "active")
        self.assertEqual(p["conditions"], {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}})
        self.assertEqual([r["type"] for r in p["rules"]], ["deletion", "non_fast_forward", "pull_request"])
        self.assertEqual(p["rules"][2]["parameters"]["required_approving_review_count"], 0)
        self.assertFalse(p["rules"][2]["parameters"]["required_review_thread_resolution"])


class SetupTests(unittest.TestCase):
    def test_entire_backend(self):
        self.assertTrue(hq.entire_backend_ok({"checkpoints": {"primary": {"type": "git-branch"}}}))
        self.assertFalse(hq.entire_backend_ok({"checkpoints": {"primary": {"type": "local"}}}))
        self.assertFalse(hq.entire_backend_ok({}))
        self.assertFalse(hq.entire_backend_ok(None))

    def test_install_guard_fresh_then_idempotent(self):
        with tempfile.TemporaryDirectory() as d:
            hooks = os.path.join(d, "hooks")  # may not exist yet
            status, msg = hq.install_guard(hooks)
            self.assertEqual(status, "✓")
            path = os.path.join(hooks, "pre-commit")
            with open(path) as f:
                self.assertEqual(f.read(), hq.GUARD_SHIM)
            self.assertTrue(os.stat(path).st_mode & stat.S_IXUSR)
            status, msg = hq.install_guard(hooks)
            self.assertIn("already", msg)

    def test_install_guard_chains_existing_hook(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "pre-commit")
            with open(path, "w") as f:
                f.write("#!/bin/sh\necho old\n")
            hq.install_guard(d)
            with open(os.path.join(d, "pre-commit.local")) as f:
                self.assertIn("echo old", f.read())
            with open(path) as f:
                self.assertIn("hq-guard", f.read())

    def test_install_guard_will_not_clobber_existing_local(self):
        with tempfile.TemporaryDirectory() as d:
            for name in ("pre-commit", "pre-commit.local"):
                with open(os.path.join(d, name), "w") as f:
                    f.write("#!/bin/sh\necho %s\n" % name)
            status, _ = hq.install_guard(d)
            self.assertEqual(status, "!")
            with open(os.path.join(d, "pre-commit")) as f:
                self.assertNotIn("hq-guard", f.read())

    def test_tail(self):
        self.assertEqual(hq.tail("a\nb\nc\n", 2), ["b", "c"])
        self.assertEqual(hq.tail("", 2), [])
        self.assertEqual(hq.tail(None, 2), [])


class IdentityTests(unittest.TestCase):
    def test_make_id(self):
        self.assertEqual(hq.make_id("ehewes", "claude", "cayenne"), A)
        self.assertEqual(hq.make_id("ehewes", "My Agent", "ws 1"), "ehewes/my-agent/ws-1")


if __name__ == "__main__":
    unittest.main()
