# ELP2-04 — current-authorized retained service-heartbeat reader

## Scope and entry

Approved remaining backend02–11 batch, existing ELP2-REQ-04-009 and consumer
ELP2-REQ-04-010; no replacement request ID. Private preparation started at
`0aad2697fe5f47977b1379329c3167f12aea3849` while the separate PATH landing
controller held checkout/index frozen. These drafts are NOT_APPLIED/NOT_RUN;
integration/actual terminal below supersedes that entry only when recorded.

Integration entry at `609d11dd67d7ecd22f363707fd1e9476c7c7aa89`: now
APPLIED/UNCOMMITTED, not merely private drafts. Exact route wiring, pure
projector, generated contract/types, three synthetic fixtures, runtime-schema
contract tests and mounted HTTP/actual-PG regressions are present. Narrow
generation and route census completed (295mounted route entries); execution
of new tests and normal-hook landing are still PENDING at this entry. No
frontend, source installation or runtime result is inferred from generation.

Own one additive technical DTO/controller/service/pure projector, narrow
OpenAPI generation, synthetic fixtures, actual-PG HTTP tests and tracking.
No frontend, new storage/migration/pool/collector/timer/cache, upstream call,
credential or grant installation, runtime build/restart, push/dev/main/sign/
release/deploy. Technical correctness cell only: total4CPU/4GiB/8GiB transient,
one heavy lane; no overlapping gate or real source/TS/DL performance job.

## Requirement → implementation → evidence

| Requirement | Implementation/semantics | Validation, initially NOT_RUN |
|---|---|---|
|04-009 exact purpose|GET `/api/v1/execution/technical/service-heartbeats`, operation `executionRetainedServiceHeartbeatsPageV1`; no actor/root/source/relation/profile selector|Strict route/query and mounted genuine SessionGuard tests|
|Current authority|Explicit maintenance.read for one current ROOT/environment; exact heartbeat dataset/revision/generation/catalogue, no business tuples/linkage; separate Core workspace and retained storage eligibility|Actual disposable Core users/sessions/membership/grants; current publication, revoke and wrong-workspace negatives|
|Finite redaction|Private declared service_name PK→keyed opaque record_id; source status/health null with `SOURCE_STATUS_SEMANTICS_NOT_PUBLISHED`; no topology/raw status/name/finance|Pure full2000-row cap, duplicate PK/accessor/lineage tests; HTTP public-body redaction|
|Clock/quality truth|Source UTC-ms separate from whole-profile receive clock; missing/invalid/future typed reasons, sub-ms identity retained privately; captured freshness is not current service health|Pure clock/ns vectors and exact projection `read_at_ms` regression|
|Continuity|HMAC revision/cursor binds current authority and served finite observations; ignores hidden finance/uninterpreted status/profile-receive-only changes|201-row paging, tamper/crossactor/workspace/env/session/limit/key and visible/hidden-change tests|
|Final delivery|Snapshot metadata→exact scope→raw snapshot→final metadata→page+source eligibility inside exact delivery; base current authority rechecked; bounded recapture once only for an actually changed capture|PG-backed deterministic mid-read revoke/publication-only-final-await negatives, sanitized SQL errors|

Independent source-only review found and corrected two draft defects before
integration: exact publication fencing originally ended before a later source
eligibility await; clock reason was evaluated at an earlier instant than the
returned read_at_ms. Keep the regression history, not a prewritten test PASS.
This is sequential current-authority fencing, not a native held cross-authority
COMMIT or proof of real installed trust. Source/current-human commissioning
remains separate.

## Contract and future Claude handoff

- Type `ServiceHeartbeatsPage` in generated `execution-scoped-records.d.ts`;
  schema `portal.execution.retained-service-heartbeats.v1`. Additive only.
- Query: optional Core workspace_id≤96, required paper/sandbox/live environment,
  strict limit1–200/default100, opaque after≤4096. No ALL union or generic
  Manager relation URL. Existing V1 and generic V2 null-purpose alias unchanged.
- Envelope reports capture_state separately: SNAPSHOT_NOT_CAPTURED,
  RELATION_NOT_CAPTURED, RELATION_UNAVAILABLE, EMPTY_COMPLETE,
  EMPTY_INCOMPLETE, OBSERVATIONS. Missing source values never become0/HEALTHY.
- `record_basis=PORTAL_RETAINED_OBSERVATION`; source_as_of_ms,
  source_last_seen_at_ms and typed reason fields are actual retained facts.
  snapshot_received_at_ms is whole-profile, not per-service time. read_at_ms
  is the exact projector evaluation instant, not a replacement source clock.
- Health and source_status stay null. Captured FRESH/AGING/STALE/UNKNOWN and
  COMPLETE/PARTIAL/UNKNOWN describe that captured relation, not runtime health,
  source admission, stream readiness or whole-history coverage.
- Page max200; capture max2000 from the existing bounded collector; response
  max1MiB. Page ceiling is not a total-history promise. No added polling,
  stream, refresh/collector request or source traffic from this GET.
- 400 malformed query;401 unauthenticated;403 pending/non-V2 policy;
  404 no current authority/eligibility;409 changed access/publication/cursor;
  503 unavailable/unqualified source observation/authority. Safe typed copy,
  no provider/SQL prose. All responses private,no-store.
- Narrow regeneration: `node packages/contracts/tooling/generate-execution-scoped-records.mjs`,
  then repo openapi-typescript for that OpenAPI and contracts snapshot tooling.
  Canonical cases in `execution-scoped-records.synthetic.valid.json` are
  TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT, not actual installed-source receipts.

When Bobby assigns frontend, Claude can design the technical observation
section and consume these exact states/types/fixtures; do not label anonymous
record IDs as service names or infer health from timestamps. Browser must test
denied/empty/partial/stale/revoked, pagination, independent Core workspace and
no idle polling. Producer delivery does not commission source or accept UI.
Status NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW.

## Requests, remaining gates and next backend work

04-009 is narrowed for one named technical read only, not closed for all
technical/audit/custody aliases. All29 generic null purposes retain their safety
disposition; the selected heartbeat gets a separate exact public purpose,
not a blanket technical exemption. Other aliases still need finite source,
purpose, collection/lineage and current resource authority.

Real accessibility still requires qualified dataset/global-table-to-profile
association, genuine installed technical grants/publications/trust and accepted
component/status semantics. The latter remain typed absence, not invented
health. No synthetic fixture closes these gates. Full04/10/11 are NOT_MET.

Next independent backend work stays within approved02–11: remaining exact
aliases, native authenticated read/command/realtime adapters, dependent
Composition/Regime history. Runtime budgets/calibration/coexistence/G2 are
separate real gates. No new Bobby decision or frontend edit is needed here.

## Validation / resources / rollback

New tests and generation parity NOT_RUN at draft entry. Record actual focused
and normal-hook terminal, log/source hashes and commit here after completion;
never promote a plan/unit fixture into source/runtime evidence. Reuse prior
unchanged engine/browser/load/DR receipts only with explicit impact review.

Validation choice: one coherent normal-hook gate includes the new pure,
contract and mounted HTTP/PG suites, API build and scoped restore. Do not
repeat the already-PASS PATH/engine/browser/load/DR campaigns separately.
Private controller `20261017/heartbeat-gate.py` owns exact source paths,
resource lease, logs and eight runtime identity comparisons; terminal results
must be recorded, not assumed from test declarations or reviewer approval.

Normal-hook reservation `20261017/heartbeat-land-143825` is PENDING at source
freeze. Mounted HTTP/actual-PG inventory39cases includes both independent
review regressions (publication-only final-await withdrawal and exact read
clock). The preceding `heartbeat-land-143816` stopped before tests/index
changes because sandbox sudo was unavailable; no test failure or PASS was
obtained there, no resource leaked. The same approved bounded gate runs in
the permitted execution context; it does not grant new source/runtime access.

### Actual first landing terminal —2026-10-17T14:45UTC

`heartbeat-land-143825` ended14:45:08UTC exit1: contracts760/760 PASS,
65files; API build failed TS2322 at projector base.environment inference.
API regressions and scoped restore NOT_RUN. Fixed the validated base object's
explicit `Pick<RetainedHeartbeatView,...>` type; no assertion, weaker validation
or runtime semantic change. No separate full focus/engine/browser retake.
Log SHA256 `d75ef7126c375bca09e34d3319f8c8946bcaae2db21748e73d08a6eb2895dde8`.
Source/index frozen, eight runtime tuples unchanged, owned resources=[] and
lease clean. One sample, not peak/capacity: Node150.26%CPU/1.331GiB of3GiB,
PG0%/70.72MiB of1GiB. Normal-hook corrected landing still PENDING.

Corrected gate reservation `20261017/heartbeat-land-144607` is PENDING at
source freeze; exact controller/log terminal determines commit/validation.

### Actual second landing terminal —2026-10-17T15:11UTC

`heartbeat-land-144607` finished15:11:44UTC, gate exit1 (controller wrapper's
exit0 is not a PASS). Contracts760/760 and API build PASS; API5,537PASS,
1FAIL,3existing skips across364files. New heartbeat projector69/69PASS;
mounted heartbeat HTTP/PG38/39PASS. Scoped restore NOT_RUN after failure.
Log SHA256 `10fee4f40a492916592b4fa6f8dba55994615344e01e7dcaef09cefe4baf951f`.
Source/index unchanged during gate, eight protected runtime tuples unchanged,
owned resources=[] and owned reservation released. No commit landed.

The failing publication-workspace fixture generated a new UUID on **each**
provider read. The common scope fence correctly returned409 on the differing
initial/confirming publications before the static qualification check503.
Fix only the fixture to capture one wrong workspace before the callback; keep
the existing confirming-publication change409 regression and production
authorization semantics intact. Correction is APPLIED/UNCOMMITTED, retest
PENDING; a reviewed cause is not a passing test. Include it in the next
coherent affected gate/normal-hook landing, not a separate unchanged campaign.

### Corrected focused terminal —2026-10-17T15:34UTC

The coherent native/heartbeat affected cell `native-read-focus-153026` ended
15:34:28.044066UTC **PASS**: API build,221/221 tests across six suites and
scoped PostgreSQL restore. Heartbeat mounted HTTP/PG39/39 and projector69/69
PASS; this closes the fixture retest above, not the pending normal-hook commit.
Exact log SHA256
`c46986e5db3ec8b8e58c75e4c72abab42d1ce7e21621a558a717912463e475cd`.
Eight protected runtimes unchanged, source/index frozen, owned resources=[]
and lease released. [Whole focused receipt and source-only limits](../ELP2-10/native-read-transport.md#corrected-affected-gate-2026-10-17t1534utc).
Normal-hook landing remains PENDING; all earlier failed receipts retained.

Rollback: reviewed forward removal of the exact additive route/parser/wiring;
preserve retained snapshots, source custody, grants, identities, revocations,
keys, immutable history and audit. Teardown only this controller's exact
disposable resources; retain evidence, active/rollback images and all eight
protected runtime tuples. Capacity/cleanup status follows actual terminal.


<a id="heartbeat-terminal-20261017-1602"></a>

## Corrected normal-hook terminal —2026-10-17T16:02:08UTC

Landed `f734db9d1cbdc8d409cbdc19bee23c1e4b09ad9d`,32owned paths
+3,698/−48 including native READ transport, generated heartbeat contract/tests
and recurring Claude review rules.760contracts PASS; APIbuild PASS;
5,618API PASS/3existing skips (364files PASS/2skipped); real disposablePG
dump/restore including four scoped-access row digests PASS. This supersedes
only the prior pending/corrected heartbeat landing, not its preserved failures.

Controller `/home/bobby/.local/state/portal-execution-elp210/20261017/native-read-land-153544/controller.json`,
logSHA256 `bd1b5b4de6d0fe2b1fc903c6e83418cd75f3bc27b20737d4e6132457604f599b`.
Source/index and eight protected runtime tuples unchanged; remaining owned
resources[], exact measurement lease released. Focused221 is overlapping
coverage, not additional unique full-suite tests. No runtime/source/FE change.

Named reader contract/code are landed, not a genuine source publication or
consumer acceptance. Other generic null-purpose technical/audit aliases stay
OPEN04-009;04-010 stays NOT_STARTED_BY_OWNER_DIRECTION /
AWAITING_CONSUMER_REVIEW. Next independent backend slice is
[Composition ORIGINAL custody](../ELP2-06/composition-original-custody.md).
