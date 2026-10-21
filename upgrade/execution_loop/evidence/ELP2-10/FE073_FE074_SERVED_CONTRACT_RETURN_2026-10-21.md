# FE-073 / FE-074 — served-contract return

## Current additive return — 21 October, 12:48 UTC

**COMMITTED_FOCUSED_GATES_PASS / FINAL_CANDIDATE_GATE_PENDING / NOT_LANDED**.
The historical source/failed-test readpoints below are preserved. Current
source is branch `chore/elp210-served-contracts-frozen`, base Claude
`d58361eafe071bbc9922a7e87c58f0a9d00b7ea2`, code commit
`c02f63d8808e3d4d8cce7b4dffd58a981a684699`, tree
`21131f7d3d0520e94a837abc3fc0fdf92ccb9e3d`:22 files,+1745/-31.
No frontend implementation or runtime authority was changed.

The corrected Node22/isolated PostgreSQL retake actually finished
`2026-10-21T12:41:21Z`, **EXIT0:11/11 Governance tests and the unchanged
restore drill, including all four scoped-access row digests, PASS**.
Explicit-workspace success remains; omitted workspace rejects another
session's evidence, accepts evidence in the authenticated personal workspace,
and is checked against the stored row. No workspace fence was weakened.

Exact log:
`/home/bobby/.local/state/portal-execution-elp210/20261021/fe073074-governance-retake-ZpUGGK/controller.log`,
SHA256 `86f5656ed22768015161591295b0bc27ebc2fae3261315ce5d2396d7ff592858`.
Staged code diff SHA256 before commit:
`057fc005efd15e344827df3c988f2d200ac8257a52fdbe1ba52fdb3dc6827590`.
Previously passed294 contract and25 Paper-producer tests are reused at their
unchanged input hashes, not rerun or counted as new coverage. Served generator,
both regenerated DTO comparisons,547-file snapshot and N29/EDS12 check PASS.

The intermediate code commit uses Bobby's smart-gate rule §10.10c, recorded
by Claude in `46877cae` and imported into the integration lane. Full normal
gate remains mandatory on the combined frozen candidate before ff-only
landing; this is not a waiver or a claim that the failed Core1130 run passed.
At12:45 UTC, read-only Docker inventory found no test container/network;
heavy lock was free. Root filesystem had137318567936 bytes available and
MemAvailable9733 MiB. Evidence/source and required dependency links remain;
no shared prune, runtime DB, grants or sessions were touched.

Claude may inspect the committed generated types and synthetic fixtures now;
product consumer/real-API acceptance still requires the landed served source.

## Status and pins

**SOURCE_READY / NOT_LANDED / NOT_RUNTIME_QUALIFIED / CONSUMER_NOT_ACCEPTED**.
Worktree `/home/bobby/portal-contract-elp210`, branch
`chore/elp210-served-contracts-r2`, base Claude `4ebc4d9e` after its R2/B1
repairs. Initial source was90f84643; switching the owned candidate carried
the complete code diff unchanged (SHA256
`84879de30f5db2307e1d60f5203fb6cf704e39379eb53593d65515fe3dd35863`).
No merge, stash, reset or peer edit was used. No frontend source, runtime flag,
grant, database or command authority changes. Final commit and normal Node22
gate remain required before this becomes a delivered contract.

## Published shape and compatibility

| ID | Publication | Generated type / canonical example |
| --- | --- | --- |
| FE-073 | Paper root `read_at_ms`, nullable `as_of_ms`, canonical `panels`; capability `lineage_scoped_out`; history coverage/downsample metadata | `execution-paper-read.d.ts` → `PaperReadResponse`, `PanelEnvelope`, `PaperHistoryWindow`, `PaperHistoryRecords`; `execution-paper-read.served-envelope.valid.json` |
| FE-074 | Optional request workspace resolved from the authenticated session and still authorized by server | External `ApprovalCreateRequest` reference in `execution-governance.d.ts` |
| FE-074 | Served Problem's `details`, `public_copy_key`, `safe_next_action`, plus a closed duplicate variant with the existing Governance Identifier grammar | `execution-governance.d.ts` → `DuplicateOpenApprovalProblem`; `execution-governance.duplicate-open.valid.json` and `execution-governance.served-problem.valid.json` |

Examples are **TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT**. A duplicate's
`details.approval_id` is navigation metadata, never access authority. Generic
Problem validation also requires the typed details when its code is
`DUPLICATE_OPEN_APPROVAL`; the generic branch cannot bypass the named variant.
The unrelated RFC9457 fixture is unchanged.

`PanelEnvelope` uses the exact authority dependency closure, with a local
`PanelIdentifier` alias to avoid changing Paper's existing Identifier. Both
Paper publications now use the same redacted `NarrowRecord` contract.

Snapshot pages still cap `Records` at200. Retained account equity has its own
array: the actual producer's720-row case is valid, not truncated. Existing
history target2000 is **not** a hard output ceiling and this patch does not
qualify its cardinality/response-byte budget. That remains a bounded-history
follow-up; neither server nor consumer may advertise a fabricated hard cap.

Regenerate using `npm run generate:execution-served-envelopes`; read-only drift
check is `node tooling/generate-execution-served-envelopes.mjs --check`.

## Validation actually executed

- Host Node20.20.2, Vitest4.1.11, one worker: five focused contract files
  (`execution-served-envelope`, `execution-positive-parent`,
  `execution-reader-refinements`, `execution-stage-facts`, `fixtures`)
  **294/294 PASS**,9.73s,21October10:57UTC.
- Host service-producer test `paper-read.spec.ts`: **25/25 PASS**,5.28s,
  including schema validation of real service output backed by fake source
  relations, source-clock absence, lineage counters and720 retained rows.
  It is not a connected Edge or browser receipt.
- Generator drift and `git diff --check`: PASS.
- Pinned Node22/disposable PostgreSQL Governance run,21October11:28–11:33UTC:
  compilation and migrations completed; **9 PASS /1 FAIL**, EXIT1. The failing
  new test omitted workspace while its evidence belonged to Bobby's workspace
  and the authenticated session belonged to Stan. The producer correctly
  returned422 `EVIDENCE_RUN_NOT_FOUND`; this is a test-scope error, not a reason
  to weaken workspace isolation. Corrected source preserves the original
  explicit-workspace positive and adds a separate omitted-workspace case:
  cross-session evidence is refused, own-personal-workspace evidence succeeds.
  Stored workspace is checked against the DB, not an unpublished response field.
  **Corrected PG retake and normal hook PENDING**. PM's numeric R3 began after
  this cell released the heavy slot; do not compete with or modify its freeze.
  Log: `/home/bobby/.local/state/portal-execution-elp210/20261021/fe073074-governance-focused-1130/controller.log`,
  SHA256 `8dbc07b1b40d96676da6c30a3db6c2278ef28e2bf3a85232c68cd38babe143ca`.
  Failed run's restore drill did not execute after test failure. Owned Node/PG
  and internal network were removed by its EXIT cleanup; no preview/runtime DB
  was involved.
- Initial diagnostic could not load `zod` from the old shared dependency tree:
  zero tests executed in that file. A private disposable dependency install
  resolved this; no shared dependency directory was modified.
- The finite-parent test caches canonical compiled validators rather than
  recompiling the whole graph on every assertion. All assertions and the
  20-second timeout are unchanged. Current Core R3 has independently passed
  its unchanged contracts stage; do not restart it merely for this test repair.

## Claude handoff / exit gate

After the reviewed source lands: remove the five conformance exceptions,
consume the published shapes without local type duplication, and replace
prose parsing with `details.approval_id`. Retain same-origin workspace guards
and unknown-outcome handling on malformed success responses. Empty/nullable
source facts remain absence, not0 or a fabricated timestamp.

Consumer exit: fixture conformance plus affected Workbench/New Request tests;
real duplicate link on an authorized approval when a writable stack is
available. Keep source/runtime/browser statuses distinct. No baseline or UI
design change belongs to this patch.

Independent source review: **ACCEPT**, including optional-workspace isolation,
canonical redaction, no generic-Problem bypass and no720-row truncation.
Review's packaging CHANGE was applied with the existing N29/EDS12 refresh
commands after the final producer-test edit. Both derived integrity ledgers
verify with `runtime_effect:NONE`; the547-file contract snapshot and served
generator drift check PASS. This re-pin is not a new runtime qualification.

## Cleanup and rollback

No stack, grant, identity or listener was created. Two remaining worktree-local
symlinks point only to the task-owned isolated dependency directory. The earlier
app-local link to Claude's dependencies was removed, without modifying its
target. Remove the two owned links and isolated dependencies after the gate;
preserve source, receipts and both peers' dependencies. Rollback is a
reviewed source revert only; it does not revoke a grant or rewrite data.
