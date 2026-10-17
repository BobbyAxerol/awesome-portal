# ELP2-06 — Exact original Composition allocation custody

## Scope, authority and source pins

Continuation of approved06-002/00-005 under the02–11 backend assignment,
Portal backend guidev1.2 ELP2-06 and FINAL Scorev1.1 original/restated and full
denominator rules. Source checkout `/home/bobby/portal-research`, branch
`docs/research-loop-plan`; parent
`f734db9d1cbdc8d409cbdc19bee23c1e4b09ad9d` (clean entry).
No frontend, public API/schema, migration,
new service, authority/grant/credential installation, upstream request, runtime
activation, push or dev/main/release/deploy change.

Private drafts and static independent review preceded integration. Primary
alone integrates five modules, two existing test files and the phase packets.
No draft or source review is a test receipt. Existing135 source revisions,
138 immutable derived storage and139 ORIGINAL pointer remain the only stores.

## Implementation and consistency boundaries

- Capture the exact approved allocation handle used by the original Composition
  worker, including its accepted UTF8 bytes, approval pin, binding, source135
  digest/generation, original publication, capture time and complete census.
  Capture uses the full final Score/Composition/Regime source document, before
  persistence and ACK; a later current allocation is never substituted.
- Successful capture registers a private first-write identity. JSON clones,
  handcrafted records, Proxy/getter wrappers and historical restored handles
  cannot mint a new ORIGINAL. Restoration requires an independently retained
  immutable-parent digest and the exact source135 publication, not the child's
  self-reported digest. Historical expiry/revocation does not erase a recorded
  fact and does not make its restored handle operational-current authority.
- Add private `portal.execution.manager-score-original-inputs.v3` only for a
  valid complete nonempty Composition custody set. Preserve the exact existing
  v1/v2 bytes, keys and digests when the optional argument is absent or empty.
  A Composition-only v3 may have zero Score tasks only when no Score slots were
  published. Its idle path explicitly reports dependent worker not installed;
  it never writes an empty Score result or silently runs current-policy math.
- Count serialized parent wrappers and children before cloning or historical
  restore. Existing whole-envelope cap,128-record census and shared138
  retained-row/actual-JSONB-byte caps still apply. No extra per-mode allowance
  or auto-delete is created. A dense maximum-census performance measurement
  is not yet a SLO receipt.
- Persist135,138 and139 in the existing caller-owned transaction, with its
  lease, final synchronous source/current-authority fences, COMMIT and later
  ACK unchanged. Lost ACK/restart reuses identical original bytes. A cap or
  invalid new optional custody omits the entire optional ORIGINAL bundle,
  never a partial v3 or fallback old bundle; it does not suppress an otherwise
  valid financial null/partial publication. Corrupt legacy behavior is not
  weakened. History recognizes v3 strictly; unknown schemas still refuse.

## Validation and impact

One heavy lane only: Node3CPU/3GiB + disposable PostgreSQL1CPU/1GiB,
aggregate4CPU/4GiB/8GiB transient. Existing host measurement lease is honored.
Eight protected API runtime tuples are compared before/after; no production,
dev, shared preview, HK/TS/DL job or business data changes.

| Gate | Actual state before grouped landing |
| --- | --- |
| Independent security/consistency review | SOURCE_ONLY; cumulative-copy bound finding corrected in the integration candidate; no test/runtime claim |
| New helper regressions |14 new cases applied; NOT_RUN |
| Actual disposablePG integration regressions |20 new expanded cases applied, covering installed materializer, atomic rollback, restart/lost ACK, census/identity/tamper/quota and strict History; NOT_RUN |
| Existing PATH v1/v2 compatibility |2 new exact-byte/hash regressions applied; NOT_RUN |
| APIbuild, full API/contract gates and scoped dump/restore |NOT_RUN for this batch; mandatory normal hook owns one coherent landing |
| Genuine source/config installation, historical dependent worker, public consumer/browser |NOT_RUN / NOT_DELIVERED by this custody slice |

The36 new cases overlap the eventual full API suite; do not add focused
and full counts as unique coverage. The prior native/heartbeat gate is reused
only for its unchanged paths, with its actual terminal SHA/log/cleanup linked
below. Do not rerun an unrelated engine/browser/load/DR campaign for this slice.

## Claude review and consumer handoff

No generated type, public operation or UI change in this slice. Existing
`ManagerCompositionPublication` and scoped Score History handoff stay in
[Composition publication](composition-publication.md) and
[History](scoped-score-history.md). This records original-allocation provenance;
it does not publish a new historical Composition/restated value to render.
Do not infer AVAILABLE or operational-current authority from a retained v3 tag.

Frontend remains NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW.
At each entry/freeze/landing/exit read the latest relevant Claude review and
request; retain its revision and canonical ID/disposition. Accepted findings
enter06-002 or their existing owning-phase matrix, not another copied queue.
No new Claude receipt/acknowledgement is asserted at this preparation checkpoint.

## Remaining work, exit and rollback

Local custody slice closes only after actual build/PG/restore/normal-hook
terminal success and owned-resource cleanup. Whole06/10 remain open: historical
Composition/Regime recalculation and public retained readers, qualified source
and allocation/config installation, compatible ALL tie-out, actual current-human
Core final-egress/COMMIT authority, approved calibration/numeric budgets and
matched coexistence/P184 performance G2. ELP2-11 NOT_ENTRY_READY.

Backend next can implement the dependent historical worker/read chain from
these immutable inputs and continue independent02–09 seams; Claude need not
start for that code work. Real authority/calibration cannot be fabricated from
fixture constants. Rollback to a compatible reader/unmounted adapter only;
preserve all source/ORIGINAL/RESTATED bytes, grants, pending commands and audit.
Teardown only exact-owned disposable cells/network/lease; keep receipts/logs.

## Actual landing and resource receipts

Parent native/heartbeat normal hook ended16:02:08UTC, PASS, commit
`f734db9d1cbdc8d409cbdc19bee23c1e4b09ad9d`.760contracts, APIbuild,
5,618API PASS/3existing skips (364files PASS/2skipped), real scoped PG restore
including four row digests PASS. LogSHA256
`bd1b5b4de6d0fe2b1fc903c6e83418cd75f3bc27b20737d4e6132457604f599b`;
controller `20261017/native-read-land-153544` under the local evidence root.
Source/index and eight protected runtime tuples unchanged; owned resources[],
lease released. This does not execute the36 new Composition cases.

Capacity snapshot16:02UTC: disk166,111,698,944B free of665,811,062,784B
(76% used), RAM11,003,273,216B available of33,651,220,480B, no swap. Shared
observation only, not exclusive consumption/peak/SLO or approved runtime budget.
No broad cache/image cleanup needed; preserve active/rollback images.

Composition code/tests APPLIED_UNCOMMITTED. Next gate is one coherent normal
hook using `20261017/composition-history-gate.py land`, not a second redundant
full focus. Terminal path/hash/SHA/cleanup PENDING at this preparation point;
no planned gate or wrapper exit is promoted to PASS.
