# ELP2-06 — Scoped retained Score history and archive classification

<a id="history-terminal-20261017-1347"></a>

## Terminal landing —2026-10-17T13:47UTC

Actual commit `0aad2697fe5f47977b1379329c3167f12aea3849`,63files
+18,920/−3,685 versus `f1f5fc7d` (generated artifacts included, not logic lines).
Controller `20261017/history-land-131843`, terminal PASS/exit0 at13:47:29UTC:
720contracts/64files, APIbuild,5,373API tests/3existing skips in361files,
actual scoped PostgreSQL restore and four access-row digests PASS. Gate log
SHA256 `b83e46235758f6e454d6f3fa44c3e9a86f089ea6d4da0683205581b040d8490e`.
Eight protected runtime image/start/restart tuples unchanged; source/index
freeze checks PASS, owned resources empty and lease released. Capacity after
gate:10,876MiB available RAM,156GiB filesystem available (75% used),
C4 `NO_ACTION_NEEDED`; no prune. Earlier failed receipts below remain retained.

Only that batch's code/contract/isolated correctness gate is closed. Real
source, current-human/trust, calibration, budgets, coexistence/G2, FE/browser
remain separate. New [PATH follow-through](path-original-restated.md) has its
own impacted tests; do not reuse this PASS for the changed PATH implementation.

## Entry, scope and preserved failed gate

Approved backend continuation, `docs/research-loop-plan`, parent
`f1f5fc7d541a2bd9b4aeb324e932d2b4f223ade7`. No FE, source/transport install,
runtime migration/restart, command, push, dev/main or deployment. This replaces
the [Original/Restated](original-restated.md) history stub, not Composition/
Regime restatement or genuine economic-source commissioning.

Normal hook `20261017/restatement-land-123719` TERMINAL FAIL:719contracts/
64files and APIbuild PASS; API5,291PASS/1FAIL/3skip across357files (354PASS,
1FAIL,2skip). Only failure: `elp206-manager-store.spec.ts:446` expected4
migrations after139, actual5. Corrected to5 AND exact139, retaining old131
digest/idempotency checks. No commit or scoped-restore PASS from that run.
Finished13:04:03UTC; logsha256
`10fdfb625debd77ae34de056e1854905327363948d381bc406a98d90425a1b49`.
Source/index/eight protected runtime tuples unchanged; owned resources empty,
lease released. Keep failed evidence; do not call the whole run green.

## Actual implementation and boundaries

- Private `manager-score-history.store.ts` reads one exact workspace/env/profile/
  source revision in READ ONLY REPEATABLE READ. Actual135 payload/digest,
  original custody and every restatement use the same strict historical
  decoders. Today's policy does not erase immutable facts. Reject dangling,
  self/cyclic/reversed/orphan chains and unknown schemas, not silent skipping.
- All138 kinds consume32rows/64MiB actual JSONB before calculation payload
  fetch; source/codecs remain8MiB. These are archive safety ceilings, not
  approved throughput or evidence that maximum-size parsing meets an SLO.
- Four physical borrows/scans, caller deadline1..5000ms, bounded rollback and
  release. Pending late borrow retains admission until settled then destroys
  client. JS decode is byte-bounded, not synchronously preemptible. No queue.
- Current named target/field/population/whole-accounting authority precedes
  public filtering, lineage, counts and pagination; financial/access delivery
  fences remain. At most one coherent rescan after private inventory change:
  stable authorized projection survives hidden-only churn; visible change409.
- Public HMAC refs bind target/scope/source/mode/content, never raw private
  calculation keys, inventory or input hashes. Supersedes chooses nearest
  authorized predecessor and scoped ORIGINAL origin. Pointer order is causal,
  not wall-clock sort. Two-direction keysets,<=1MiB aggregate response; byte-
  shortened pages preserve continuation, not silent history truncation.
- Older public refs remain resolvable after later policies without a running
  coordinator. After final authority await, exact approved handle identity
  labels CURRENT/NOT_CURRENT/UNKNOWN. Verified expired metadata NOT_CURRENT;
  absent/forged/wrong-scope authority UNKNOWN. No historical row is erased by
  policy replacement. Always HISTORICAL_ANALYSIS_ONLY/operational_current=false,
  never operational-current Score. Existing ordinary readers unchanged.

## Published contract and future Claude handoff

Existing IDs `executionManagerScoreRevisionGetV1` and
`executionManagerScoreRevisionHistoryGetV1`; generated types
`ManagerScoreRevisionView`, `ManagerScoreRevisionHistory`,
`ManagerScoreRevisionHistoryQuery` in `execution-manager-models.d.ts`.
No new route/service/browser source access or GET calculation.

Additive `before` exclusive with `after`; nullable opaque supersedes ref and
typed reason; AVAILABLE history with exact authorized counts/items/two cursors.
Structural union keeps unavailable/null-count semantics in Zod/JSON/generated
types. Field-equality refinements still server-enforced with explicit tests.
Canonical `execution-manager-score-history.available.synthetic.valid.json`
shows two historical facts/lineage/NOT_CURRENT. Prior unavailable fixture and
original/restated fixtures remain valid, synthetic, not authentic approvals.

Claude **NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW**. When
assigned: consume union/cursors/refs, distinguish original and historical
restated, source/K/compute/feed clocks and policy eligibility. Follow authorized
supersedes only; clear pins on409 and preserve workspace/profile/resource.
Never infer hidden counts or operational authority. No browser/UI PASS here.

## Tests, next work and rollback

Entry APPLIED/UNCOMMITTED; new tests NOT_RUN. Independent static reviews accepted
source-only, caught hidden-metadata409 and empty-page byte-trimming before gate.
Actual disposable-PG cases cover custody/lineage corruption,32row/64MiB bounds,
coherent append, held borrow and real isolated table-lock timeout. Component
service snapshots are explicit synthetic post-decoder stubs, not PG proof.
Actual coordinator→PG→named BFF cases cover history/old ref/no coordinator;
WeakMap policy tests cover replacement/expiry/forgery/scope/invalid clock.

Group affected build/PG/restore then required normal-hook commit. Reuse unchanged
engine/load/browser/DR receipts. Budget4CPU/4GiB/8GiB transient, own lease/PG/
network; exact cleanup and eight-runtime comparison. Correctness is not source
acceptance, production capacity/calibration or G2.

Next backend: PATH method proof, dependent Composition/Regime restatement,
qualified source→Manager tie-out, full authenticated command-family bridges and
connected replay.14 numeric budgets/calibration/current-human owning-COMMIT
qualification remain OPEN;11 NOT_ENTRY_READY. Rollback additive read callers/
generation only; preserve source/original/revisions/mode heads/grants/audit.

## Impacted gate terminal —2026-10-17T13:16UTC

`20261017/history-focus-131222`: canonical isolated APIbuild PASS;11files/
264tests PASS,45.97s test duration. Includes actual PG history20/coordinator22/
custody31, service component15, selected revision13, worker40,runtime9,
policy44, migration/store28, profile22 and reallocation20. These overlapping
tests are not added to a full-hook total or called source qualification.

Overall controller FAIL_OR_INCOMPLETE,exit3: post-test scoped restore fixture
requires Core `portal_users`, but this deliberately narrow group creates only
its separate per-suite databases, not the common Core schema. No product
test failed and no restore PASS is claimed. Do not rerun these11suites only
to initialize that unrelated schema. Required normal hook runs the complete
Core harness and its restore drill; preserve and inspect its actual terminal.
Logsha256 `f1c12bdbbe10d508de1e1772bcdaca2e657354a000057f2fe125604c9a2a1eb0`.
Source/index/eight runtime tuples unchanged; owned resources empty, lease
released. No runtime DB was opened. Observed cell sample Node805MiB/PG71MiB,
not a peak or production budget qualification. A temporary host build earlier
found TS2366 in the new store; explicit never-return in its catch corrected
before this canonical build, no additional host build receipt reused.

Static next-gap review confirms the smallest next slice is PATH method/input
dependency custody plus the existing restatement worker/restore parser. It must
retain source method/manifest/binding/available-at proof before a new original
publication, read legacy originals unchanged, and update both work() and the
METRICS-only restore assumptions. Existing worker PATH support is not missing;
old immutable originals must not acquire invented proof. Composition separately
needs original allocation/approval/raw inputs; Regime needs full evidence/
policy/receipt corpus. Ordinary current chains already exist. Review is
DESIGN_ONLY/NOT_RUN, not an implementation or source acceptance receipt.

Landing precheck `history-land-131747` stopped at13:17:52UTC on one new test's
blank EOF, before any build/test/DB cell. Correct whitespace only; prior264
test assertions/code remain unchanged. Source/runtime unchanged and own
resources/lease empty. Retry normal hook, no bypass or product-test rerun
claimed for this precheck.
