# UDB-03 — Retained Execution reads and unified resource policy

2026-10-10 backend · 2026-10-11 consumer · **BACKEND_PASS / RETAINED_PREVIEW_REVIEW_READY / SCOPED_FE_CONSUMER_VERIFIED**
· `docs/research-loop-plan` · parent `56f2250b`.

Bobby approved this phase only. Follow [Unified UDB-03](../../../UNIFIED_IMPLEMENTATION_PLAN.md#udb-03)
and [UDB-02 coverage/authority handoff](../UDB-02/handoff.md).

Implementation order: explicit local retained-review profile with all source
workers/transports disabled; bounded retained source adapter; unified Core
workspace/resource/action policy and typed effective permissions; named screen
DTOs/history/analytics; actual API/auth/pacing and browser receipts; Claude
rich-screen mapping and UDB-04 candidate handoff. Reuse UDB-02 import/hash and
DB isolation proofs when dependencies are unchanged. No source refresh, TLS
bypass, fabricated freshness/history/approval, frontend design/baseline edits,
remote push or dev/main/stable changes.

Required gates: UDB03-T01 actual retained reads/pagination/filter/UTC/decimal/
coverage; T02 policy/direct API/wrong scopes/revoke/expiry; T03 no upstream
read-through/hidden jobs/request storm; T04 existing rich browser routes and
deep links at 1280/660. Source absence remains typed and panel-local. Browser
consumer gaps require an exact Claude handoff, never a fabricated PASS.

## Delivered receipt

Final backend image: `sha256:ac7bb2950ecb2b3ec4ba0542f3725ea79205acc69deeeda25b668832a2ed0acd`.
Existing frontend bundle unchanged: `index-hBXCtrBk.js`.
Actual API222/222 and existing rich-browser68/68 cells at1280/660 PASS;
console/request/page errors0, streams0, product writes0, external data calls0.
All9 temporary review sessions revoked; original19,047 sessions, authority
and Research data preserved. Normal grouped commit hook gates landing.
No known backend implementation debt in this approved retained-read scope.

- [Implementation, exact gates, custody, attempts and cleanup](./phase-report.md)
- [Screen/panel → named operation → authority/state/browser matrix](./screen-matrix.md)
- [Claude's exact three consumer handoff tasks](./handoff.md)
- [Debt / consumer / external disposition register](./debt-register.json)

## Consumer refinement — 2026-10-11 (Asia/Saigon)

Claude's two consumer commits `13f64a3a`/`1c01aefb` are preserved. Bobby then
approved Codex to finish three review findings and classify four UDB tables.
Session-bound context, fail-closed context failures and strict UTC/schema
reading are verified by91 targeted tests/typecheck and6 affected real-preview
cells plus explicitly injected503/invalid-clock/401 recovery. Existing design
and baseline unchanged, web-only preview rebuilt. All3 test sessions revoked.
[Exact refinement receipt / images / hashes / historical helper failures](./codex-consumer-refinement.md).
Consumer handoff is implemented and verified within this scoped slice, not a
new full68-cell HiFi or UDB-04 acceptance.

The old READ/GENERATED-only note above is superseded by Claude's
[consumer receipt](./claude-consumer-receipt.md) and the refinement receipt.
UDB-04 remains unopened and needs Bobby's separate approval for cross-loop
candidate acceptance. This is not source-live/Product GO.
