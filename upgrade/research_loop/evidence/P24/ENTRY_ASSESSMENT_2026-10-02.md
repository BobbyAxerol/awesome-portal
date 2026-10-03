# P24 — entry assessment, not full acceptance

**Superseding checkpoint 2026-10-03:** [V1 acceptance matrix](./V1_ACCEPTANCE.md)
and [candidate v2](./current-source-candidate-manifest.v2.json). Clean mixed
load now passes (Library 499 / Progress 403 ms), exact historical-loss
accounting/coherent restore is delivered (full byte integrity still false),
independent WFO recomputation passes, and producer rollback retaining current
schema readers passes. Old Control reader downgrade is incompatible with new
seal fields. The historical table below is retained, not the current verdict
for those completed subsets. Full P24/browser/engine-two/release stays OPEN.

Status: **NOT_READY_FOR_FULL_P24**. Approval covers backend implementation,
not skipping mandatory tests, pushing remotes or deploying production.

## Delivered

[P10 packet](../P10/B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md): generated
declaration metadata, bounded temporal Delta/global v2, Spot/Quarterly
qualification, real rolling/fixed/Quarterly product runs, exact retained
self-audit and source-attested exposure writer. Claude eae8a7b5 is preserved.
Backend commits change no frontend, protected strategy, Production/Execution
data, accounts or Cloudflare configuration.

## Required open gates

| Gate | Evidence / remaining work |
| --- | --- |
| P23 one candidate | Clean `65bdc8e2` far-seek, utility and outage PASS; real 92-day WFO seals COMPLETED/READY. Mixed Library 538/500 and Progress 568/500 ms still FAIL. Coherent restore copies all state correctly but retains three missing old disposable test-store manifests; full integrity FAIL. [Actual results](../P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md#final-actual-candidate--65bdc8e2). |
| T07/T13 | Only QuantBT 1.1.1 is installed/accepted. No real second qualified engine image exists. Simulated pins, v2 profiles or another container of the same wheel are not upgrade/default/rollback proof. [Exact gap](../P23/T07_T13_P04_RELEASE_PIN_GAP_2026-09-30.md). |
| T12 | Exact retained self-audit has real proof. Linked non-reusable AUDIT_OF_SELECTION stays unsupported, never a promoted diagnostic. Utility/primary quota evidence must match the candidate. |
| T14 | New exposure is proved; whole restore must preserve audit/exposure/selection/publication references and verify every published part. |
| Product/FE | QA inventory, full real-browser/visual/print/15-screen coverage and owner parity still need closure. Unit/source proof is not DOM proof. |
| Security | Selected compatible-major HTTP/parser/dev-client pins are repaired; actual lock-only audit and production-image prune report 0 vulnerabilities on 2026-10-02. Regression and clean candidate acceptance are still required; this is not whole-product security clearance. |
| Signed release | Local images are not signed release/SBOM/provenance. No remote push or release dispatch occurs in this task. |

## Continuation

The recovery, utility and identity teardown below have already run; the
owned cell is down. Next, repair mixed-load latency and resolve the exact
old-test-store integrity gap without inventing bytes or deleting history.
Retake only affected gates on a named clean candidate; reuse unaffected
evidence only with explicit code/config/image pins and preserve failures.
Keep volumes, rollback images and private 0600 receipts; no broad prune.
Shared :8095, dev and production remain untouched. Claude owns consumer/
browser/visual closure and receives generated fields in backend queue §9.

All mandatory PASS is required for READY_FOR_BOBBY_REVIEW. Owner acceptance
and eventual production rollout are separate actual events.

## Actual closeout checkpoint — 2026-10-02

[Local candidate manifest](./current-source-candidate-manifest.v1.json) pins
seven images and receipt hashes. It is **unsigned / NOT_READY_FOR_FULL_P24**,
not a release manifest. It includes Claude's latest chart commit `a599bd3f`
without Codex frontend edits. Application builds and mandatory backend hook
pass (1469 / 1 opt-in skip, 219 contracts); no browser/visual verdict inferred.
144-table coherent restore and original-volume recovery actually ran; default
strict and explicit partial-mode integrity FAILs are retained. No data/record
was removed to make either gate green. Cleanup proves zero owned active
sessions, 21 temporary accounts disabled, owner anchor kept, cell :8096 down;
all original data/backups/rollback pins retained. No remote push or release.
