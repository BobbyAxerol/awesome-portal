# Core independent review: PM S2 Paper candidate — 27 October 2026

## Disposition: CHANGES_REQUESTED before source qualification

Reviewed PM source commit `c76a6aea2a98d0e3b8f5a292eab00856175e16c6`
read-only at `/home/bobby/.worktrees/pm-s2-fix02` on HK. This is a source
review and two pure-function probes, not a connected test or an accusation
that protected source data was modified. PM's reported 250 tests have not
been independently rerun by Core. Source remains uninstalled/unqualified.

### CR-PAPER-01 — lookback rows are used without the page's payload fence

In `services/portfolio_management/paper_committed_outcome_source.py@c76a6aea`,
`read_in_snapshot` checks `payload_digest` on the current page at lines
298–300. The subsequent `_Lookup._rows` at lines 319–326 reads earlier Paper
rows for `events`, `commands`, and `placements`; those returned rows are not
passed through the same digest check before `_resolve_lineage` and `_single`
use them to determine immutable original identity. A pure-function probe with
a synthetic command-shaped row having an intentionally wrong `payload_hash`
verified `_single` nevertheless returned its command identity. This probe does
not claim any such row exists on the real source. It exposes a missing local
integrity defense on the path that establishes provenance.

**Request to Edge → PM:** validate each lookback row's Paper scope and
recomputed payload digest before it can influence lineage or correlation.
Fail closed with an explicit integrity disposition, not a fabricated outcome,
and confirm the accepted handling of damaged source, checkpoint and replay.
Add integration tests with a bad hash outside the current page for correction,
original placement and command correlation; assert no derived success and no
incorrect checkpoint/receipt on integrity failure. Preserve whole-commit and
byte/row bounds; do not alter immutable source data or bypass protected views.

### CR-PAPER-02 — terminal fill-class semantics need an explicit source decision

`classify_order_status` at lines 188–203 returns `ENDED/ANY` whenever a
non-FILLED terminal order does not satisfy `quantity == remaining`, including
missing or inconsistent quantities. Independently running the pure function
returned `ENDED/ANY` for `EXPIRED, quantity=2, remaining=None` and also for
`CANCELED, quantity=2, remaining=3`. PM's unit test explicitly expects the
first case, so this is not an untested accidental branch. The current
`CommittedOutcome` contract requires one of `FULL/ANY/NONE/CHILD` for `ENDED`,
but this review did not find an authoritative explanation establishing whether
`ANY` means **unknown/any possible fill** or **at least one fill**.

**Request to Edge → PM/TS:** pin the authoritative semantics of `ANY` and
valid quantity bounds. If it asserts a positive fill, missing/inconsistent
quantities must instead remain typed unproven, without inventing a fill. If it
means a deliberately unconstrained fill state, publish that exact definition
and ensure all consumers display it as unknown rather than positive fill;
reject impossible quantity relationships according to source rules. Cover
missing, non-numeric, negative, remaining greater than quantity, exact zero,
partial fill and full fill in focused tests. Do not silently choose semantics
or change the existing business contract to pass this review.

## What is not decided by this review

- This Paper outcome stream is not a financial carrier, source authorization,
  gateway commissioning, or proof of actual economic settlement.
- Source trust, retention, membership, whole-commit source proof, current
  runtime and recovery across the real Edge transport still need their own
  qualified evidence. No connected READ/STREAM or ELP2-10 PASS is claimed.
- Claude's FE-069 pagination consumer remains a separate handoff; no new
  frontend contract or UI change is requested by these findings.
- Edge is the sole coordination point for PM/TS; ask owners for source
  semantics and tests through Edge. No credentials or protected source data
  belong in this document.

## Verification and cleanup

Read-only SSH `git show`/`git grep` on the named commit; ran two
`PYTHONDONTWRITEBYTECODE=1 python3 -B` pure-function probes in the existing
candidate checkout, with only synthetic input and no DB, network service,
runtime, source or local file writes. No container, port or volume was created.
No source WIP, frontend, stable/dev/main or command/Live state was changed.

Verification: R0 Markdown-only receipt and Unified link; exact-path staging,
`git diff --cached --check`, linked-path inspection and execution tracking.
