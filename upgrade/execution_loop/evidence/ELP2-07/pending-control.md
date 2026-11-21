# Original ELP2-REQ-07-002 — Existing pending-recall control family

2026-10-18, primary Codex; branch `docs/research-loop-plan`, entry producer
`ff83f1766b513c18d3fb0102cfc5c6889ffb6343`. APPLIED_UNCOMMITTED; actual new
tests NOT_RUN at entry. This extends the original07/08 approved scope, not a
new economic authority or runtime activation. Migration144 was checked/reserved
after registration143's normal hook became terminal; no shared DB migration.

## Goal, authority and inputs

Complete the separate named APPLY_PENDING/CANCEL_REMAINING family for an
EXISTING recall remainder. Preserve the PM producer's original amount partition,
receipt identity, byte digest, exact five CAS counters and parent/recipient
authorization through its own COMMIT. Do not put these operations into the
eight-operation capital union, invent an amount or submit a new recall.

Read Portal guide11.1–11.4/ELP2-07/08, current PM R2 plus actual operator,
recall writer, intent journal and wire, existing identity/access/current-audit
and registration/store terminal fences. Read-only PM worktree was
`/home/bobby/.worktrees/trading-system-pm-v1_1` on HK; source pin is
`39aaa9c6f02077246abc9480a907455ece06f62b`, not a deployed/runtime attestation.

| PM source | SHA-256 |
|---|---|
|operator_adapters|ab57b9d57398f9166d358c61b2c004cbec552f2f6ce75a44c85ffddb3295943e|
|recall_repository|8c62e73045f7c39483d69ddeff439b747b724970986db91e204005e1d95750e3|
|operator_intent_journal|6cb6fac7bb81e61dddd2d9decbb099d22c040f13a71565a253dddb06b364492b|
|operator_wire|3bfa1f6246224ae21da29668685835806112afa98d4893dd45a4c63b32b58fb9|

Preserve PM WIP and protected preview/dev/stable/probe. No remote edits,
source API/DB/business reads, credentials, provider mounting, actual policy/grant,
source command, UI edit, runtime change, push or release is part of this batch.

## Implementation and semantics

- New app actions capital.apply_pending/capital.cancel_remaining only in the
  V2 vocabulary, not legacy PORTAL_CAPABILITIES or its SQL capability CHECK.
  Require versioned exact current native correspondence: the old qualified
  singleton membership bridge cannot authorize this new family or its audit.
  Full DENY, current issuer/delegation graph, actor/session/step-up and scope
  checks remain authoritative. An old recall creator/admin is not a new grant.
- PORTFOLIO or exact DEPLOYMENT_ACCOUNT pair; source target route reference
  and owning recipient ID stay distinct. Exact original recall ID, currency,
  original normalized PM digest and budget/source/parent/book/command STRING
  int64 counters. No JS-number CAS, ROOT, new amount or physical transfer.
- Rollback-only source PREVIEW returns an actual predicted state, partition,
  delta, versions and blockers. No persistent reservation/receipt or pending
  row. Browser sees only the bounded typed prediction, never private grants,
  workload/delegation/mapping credentials or source URLs.
- Submit locks/rechecks current Core boundary, commits original-key custody,
  exact attempt UUID, immutable event and existing product audit BEFORE source
  I/O, then performs one send behind a final current fence. Commit-ACK loss
  cannot become permission to send again. Key replay precedes capacity checks.
- Separate delivery/business/projection/venue axes. UNKNOWN has null money,
  receipt and business-applied, not zero. ACKNOWLEDGED iff source business is
  known. WAITING_ENCUMBRANCE can have cumulative applied>0 and still pending>0;
  terminal APPLIED/CANCELLED/REJECTED/PARTIALLY_APPLIED_CANCELLED preserve exact
  requested=applied+pending+cancelled+rejected. Projection remains UNKNOWN,
  venue NOT_APPLICABLE, physical-transfer/economic-cash-change false.
- Original control_receipt_id remains immutable; linked latest_receipt_id,
  source_event_id and monotonic versions can progress the ORIGINAL recall.
  PM does not always publish latest_operation. It stays null with
  NOT_PUBLISHED/SOURCE_OPERATION_NOT_PUBLISHED, never substituted with the
  queried operation or inferred from a receipt string.
- Reconcile/recovery only authenticates service lookup of the SAME original
  target/key. It never refreshes the old human credential, resends APPLY or
  erases a known receipt with UNKNOWN/stale data. Exact attempt CAS includes
  null; a concurrent sender remains SENDING until genuine resolution/settlement.
- Independent exact current TS-accepted audit.read protects private status
  before decode, after source I/O and at LAST Core/clock fence, including held
  errors. Same-family status GET alone uses Core workspace in retained review;
  all retained mutations stay refused.
- Bounded JSON32KiB/object, raw source32KiB/depth6/512nodes/64keys/128entries;
  duplicate decoded keys, all numeric source tokens, broken UTF16 and unsupported
  local object forms fail closed. Five source counters retain exact int64 text.
  Four underlying I/O slots;10s caller deadline does not free an abort-ignoring
  provider slot. Pool/lock/statement timeouts are finite and no DB transaction
  is held over PM network await.
- Core144 commands/events are correlation/history, not economic postings or
  a new ledger.100 local unresolved/1024 total per workspace stop NEW intake;
  accepted WAITING is not an unsent slot. No TTL/automatic deletion/recycled
  key. Append-only history byte/storage capacity remains a commissioning gate,
  not proved by the intent count. DOWN intentionally retains history; rollback
  removes/disables the new app family and provider mounting, not source effects.
  This is not a successful down/reapply test or automatic financial rollback.

## Review before verification

Independent source review found two missing SQL defense-in-depth invariants:
wrong next_action and state/partition versus advancing-receipt identity.
Normal store already rejected these; migration144 now rejects direct SQL
violations too. New direct-SQL negatives and genuine legal-progress positives
must run on disposable PostgreSQL before calling the repair PASS. Main also
required the new family to reject legacy singleton correspondence, without
changing other historical command-family compatibility behavior.

Private review/draft provenance is retained under local state
`/home/bobby/.local/state/portal-execution-elp210/20261018/pending-control/`:
task-map, trust-review, store-review, independent-coordinator-review,
transaction-test-review, tests-review and generator-review. Definitions and
source review are not executed tests. Main read/reviewed proposed production
files and test definitions before canonical integration; one writer owns all
canonical source/contracts/ledgers and actual validation.

Generator reviewer also found registration OpenAPI's stale `portal_session`
cookie name. Registration and pending generation now read the canonical
`__Host-portal_session` constant; registration gets a metadata regression.
No session, login/CSRF runtime semantics or credential changes.

## Contract and consumer handoff

`npm run generate:execution-pending-control` in packages/contracts generates
OpenAPI/client and downstream existing workflow/realtime contracts. Main
aggregate generation chains registration→pending→workflow; snapshot and
contract tests include the new sources/outputs. Shared fixture
`execution-pending-control.synthetic.valid.json` is explicitly TEST_ONLY,
runtime_qualified=false, never a real receipt or installed grant.

| OperationId | Route | Generated input/output schema |
|---|---|---|
|executionPendingControlPreviewV1|POST /api/v1/execution/pending-recalls/preview|PendingControlIntent / PendingControlPreview|
|executionPendingControlSubmitV1|POST /api/v1/execution/pending-recalls|PendingControlSubmit / PendingControlStatus|
|executionPendingControlStatusV1|GET /api/v1/execution/pending-recalls/{id}?workspace_id=…|PendingControlQuery / PendingControlStatus|
|executionPendingControlReconcileV1|POST /api/v1/execution/pending-recalls/{id}/reconcile|PendingControlQuery / PendingControlStatus|

All response states private/no-store;401 session,403 authority,404 hidden or
missing,400 input,409 changed context/preview/key,503 unqualified/capacity/
unverified result. Mutations require canonical Origin/CSRF and idempotency
header, preview/submit equals original business key. Fixed public copy only;
ambiguous source result uses QUERY_SAME_INTENT, not a new submit/key.

Claude: when assigned the command consumer, reuse approved preview/confirm/
receipt components; show original recall, exact predicted partition and
independent delivery/business states. Keep original control and latest owning
receipt visibly distinct; missing source operation stays typed absence. Do not
turn WAITING cumulative applied into terminal success or source-dark into an
enabled action. No design/baseline changes by Codex. This family's consumer is
AWAITING_CONSUMER_REVIEW; peer3b6dad16's S0/S1 fixture delivery exists but is not
this family integrated. [Complete current Claude intake](../ELP2-10/claude-review-intake-2026-10-18.md).

## Requirement → verification → current disposition

| Requirement | Actual planned evidence | Entry |
|---|---|---|
|Exact body/5CAS/byte identity, original/latest receipt, monotonic state|Pure trust/parser tests plus AJV/runtime generated fixture parity|NOT_RUN|
|Both operations × both target kinds, source commit only after durable custody|Disposable actual PostgreSQL TEST_ONLY source observing committed command/events/audit|NOT_RUN|
|Exact separate action/audit, legacy singleton refusal, DENY/environment/revoke|Actual session/grant/current relation and mounted HTTP cases|NOT_RUN|
|Same-key concurrency, atomic event/audit rollback, COMMIT-ACK loss|Actual PostgreSQL transactions/counts and held sender races|NOT_RUN|
|Malformed/stale/UNKNOWN frame cannot erase accepted source progress|Pure and PG source-result/recovery cases|NOT_RUN|
|Expiry/revoke during row load, held errors, genuine renewal|Actual Core session/released-row/last-clock cases|NOT_RUN|
|100 unresolved boundary, exact replay, four held slots/10s|Real bounded PG rows and held abort-ignoring promises|NOT_RUN;1024 cohort not executed|
|SQL immutability/state partition/receipt advance|Direct SQL negatives plus legal progress|NOT_RUN|
|Existing registration/capital/current relation behavior|Affected regression suites and cookie metadata assertion|NOT_RUN|
|Selected real PM provider/held COMMIT/retention/pacing|Actual authenticated source and authority commissioning receipt|OPEN_SOURCE_RUNTIME|
|Consumer/browser/real user experience|Claude-generated-client receipt, not fixture inference|AWAITING_CONSUMER_REVIEW|

One existing bounded gate,4CPU/4GiB/8GiB transient aggregate; no parallel
heavy lane. Reuse prior unchanged registration/04 terminal receipts by source
hash; run affected tests/build/PG restore and then one coherent normal-hook
commit, not a hook per request/docs file. Record actual results/failures and
cleanup below only after authoritative terminal. Whole07/08/10 remains OPEN;
11 NOT_ENTRY_READY. Backend can independently continue the Manager query/
window contracts and qualified source/Composition/Regime/realtime follow-through.

## Actual focused terminal — 2026-10-18T13:42:45UTC

FAIL_OR_INCOMPLETE, producer still UNCOMMITTED. The bounded focus started before
Bobby's report-only request, waited for the foreign measurement owner without
removing its lock, then ended. Supported Node22 build PASS;279tests PASS,
79skipped;4/10suites FAIL at migrateTestDatabase with PostgreSQL
`syntax error at end of input`. The new PG/HTTP transaction assertions did not
execute successfully; skipped tests are not N/A or passing proof. Restore and
later contract gate were not reached. Do not revoke the prior ff83f176 receipt
for its own pinned source or apply it to this changed migration/source.

Private controller/log directory:
`/home/bobby/.local/state/portal-execution-elp210/20261018/pending-control/pending-control-focus-133848/`.
gate.log SHA256:
`15fb17b98ffccb7773b72f398fe53f3bf7b2b5a1ef1fb28fbb4a8953d7bd63ba`.
Controller confirms source unchanged during gate and remaining_owned_resources=[].
Failure requires a migration/setup correction and affected qualification before
landing, not a weakened PG gate. No fix or new test is claimed by this report.
Source/runtime/consumer acceptance remain OPEN;11 NOT_ENTRY_READY.

## C1/C2 assigned repair — 2026-10-18, Asia/Saigon

Bobby approved C1→C7 from Claude's PROMPT_FOR_CODEX.md. Main read the complete
peer prompt/rules10.10–12 and Source Truth Board at clean claude/fe-parity
488b245738cd49a320aa948350e679f5d2092697; no peer merge or edits. C1 owns this
family/migration144 and normal R3 landing; C2's queue_v2 ownership correction
can share that coherent ledger landing, no extra full hook just for that row.
Existing49dirty paths were checked as this backend's own work; keep all docs,
failed receipts and unrelated accepted code. No UI/Operations B1/Dockerfile B2.

Repair brackets SQL CASE as a single PL/pgSQL IF expression, preserving every
state/partition predicate. Actual PG migration and direct SQL negatives plus
legal progress, session HTTP/current grants, same-key concurrency/recovery,
contracts/build/restore are required. Scope/resource/rollback remain the
existing approved one-cell4CPU/4GiB/8GiB envelope, no runtime/source operation.
This is APPLIED_UNCOMMITTED; repair NOT_VERIFIED until actual terminal below.

### Repair retake, 2026-10-18T14:27UTC

`pending-control-focus-142241` executed the migration and actual PG assertions:
357 tests PASS, one test FAIL across ten suites. Migration144 syntax and its
direct SQL state/partition/immutability tests now pass. The remaining failure
is the new negative-test setup: inserting a distinct DENY grant incorrectly
called `saveGrant`'s UPDATE default and got ACCESS_GRANT_WRITE_FAILED. The test
now explicitly requests INSERT; production authority logic is unchanged.
No weakened expectation or skipped test. Restore/contracts were not reached
in that failed attempt; these still need the next authoritative terminal.

Log SHA256 `6f0707f3249dd6ef791c6f1628104d7381b33b8b50f7bc587882e88b85780f5f`;
directory `/home/bobby/.local/state/portal-execution-elp210/20261018/pending-control/pending-control-focus-142241/`.
Controller verifies eight protected runtime tuples unchanged, source frozen,
no foreign staging and remaining_owned_resources=[]. The coherent normal R3
commit gate will retake this corrected case with the full affected dependency
suite/build/contracts/restore; do not spend a second build on a test-only
fixture correction immediately before that same mandatory gate.

### First normal R3 terminal — 2026-10-18T15:12:31UTC

`pending-control-land-142935`: **FAIL_OR_INCOMPLETE**, not a timeout or
commissioning result. Contracts73files/996tests PASS; supported Node22 build
PASS; API396files PASS/2files FAIL/2files skipped,7476tests PASS/1test FAIL/
29skipped. Pending transaction34/34, trust42/42 and access130/130 PASS.
Both failing fixtures (History suite setup and retained-review HTTP case)
injected a Core Pool without connectionTimeoutMillis. The new store correctly
requires a finite checkout; the actual production Core pool already uses5000ms
(`src/db/pool.ts`). Both disposable Core fixtures now use that same5000ms bound;
no production check, permission or timeout was weakened. Retake remains pending.

Private receipt directory:
`/home/bobby/.local/state/portal-execution-elp210/20261018/pending-control/pending-control-land-142935/`.
Controller confirms source unchanged during that attempt and no remaining
owned resources. Preserve the failed log/receipt; do not call the commit or
restore successful until the corrected normal-hook terminal is authoritative.

### Actual corrected normal R3 terminal — 2026-10-18T16:04:56UTC

`pending-control-land-151825`: **PASS**, commit
`5291a80f68a11cbccad879d1e99bb6282634f636`,53files,+8451/−19. Normal hook
contracts73files/996tests PASS; supported clean Node22 build PASS;
API398files PASS/2skip,7503tests PASS/3skip. API duration2266.65s; no second
heavy lane. This includes the corrected disposable History/retained fixtures;
production semantics did not change. Static workspace/tracking/census and
release-integrity checks PASS with runtime_effect NONE.

Receipt directory
`/home/bobby/.local/state/portal-execution-elp210/20261018/pending-control/pending-control-land-151825/`;
log SHA256 `275849cab47c0489bdc960b6c97374156f225eafee024b83e5fb883baeabf6f2`.
Controller terminal confirms eight protected runtime tuples unchanged, frozen
source, no foreign staging and no remaining owned resources. Configured bounds
4CPU/4GiB/8GiB transient; this is not a new financial capacity measurement.
Cleanup NO_ACTION_NEEDED; no data/image/volume prune or provider installation.

C1/C2 local code delivery complete, not full ELP2-07 source qualification or
Claude ACK. Pending-control remains a separate family/known-id recovery, never
a capital collection or a new recall amount. Next backend C3–C7 is approved;
Claude can now review this actual producer commit and its generated fixtures.
