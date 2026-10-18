# ELP2-04 — Finite F0 blocked-intent read and current audit qualification

2026-10-18 UTC. Existing approved backend completion goal; narrows
ELP2-REQ-04-008/009, does not replace their source/parent commissioning gates.
APPLIED_UNCOMMITTED / validation NOT_RUN at entry, after the explicit-Portfolio
normal hook reached verified terminal2026-10-18T00:36:34UTC.
Current2026-10-18T00:49UTC: affected validation PASS below; code is still
UNCOMMITTED/PENDING_NORMAL_HOOK, not a deployed or consumer-accepted artifact.

## Entry, authority and task ownership

- Canonical `/home/bobby/portal-research`, `docs/research-loop-plan`; entry
  67e5ea66af84f9401f14b89e0dc1269cb71792b7, clean source and index at entry.
  Source is not the currently deployed artifact.
- Portal guide4.8/5/ELP2-04 and campaign rules7–8; original04 closeout,
  finite-account-command and capital-workflow receipts remain dependencies.
  Existing approved isolated Core correctness budget: node3CPU/3GiB plus
  PG1CPU/1GiB, internal network/no operating volumes or public ports, at most
  8GiB transient storage. One affected lane then one normal hook, no concurrent
  heavy job or unchanged engine/load/browser/DR retake.
- Main owns canonical code/contracts/generation/census/docs and integration.
  capital_workflow_review independently reviewed authority/error/final-fence
  design; capital_workflow_tests drafted a private standalone PG/HTTP spec.
  Their output was SOURCE_ONLY/NOT_RUN, not independent runtime acceptance.
  Review/task-map/test-note pins are recorded in Main's private state directory.
- No UI, TS/PM/Edge source or runtime change, credentials, migration, command,
  policy/grant seed, new worker, source IO, push/dev/main/release/deploy. Existing
  generic scoped non-ecm parent503 barrier and old operation union stay intact.

## Requirements, implementation and validation

| Requirement | Implementation | Actual validation / limit |
| --- | --- | --- |
| Explicit F0 family, no prefix inference or fallback | GET operations/f0/:operation_id; exact original Core F0 table + workspace + creator | PASS: mounted actual-PG positives, wrong/missing workspace/creator/family, real ADMIN plan and compatible historical opaque id |
| Current resource/environment audit authority | Shared requireCurrentTsAuditRead; complete evaluator, only eligible TS-accepted audit ALLOW leaves, every DENY and delegation ancestor retained | PASS: nine target/environment positives, app-only/business-only/mutation/ADMIN refusal, real delegated ALLOW/DENY/revoked ancestor and current native-proof tests; source proofs are TEST_ONLY |
| Narrow original requested target | ACCOUNT/PORTFOLIO/DEPLOYMENT only, recorded closed environment; no SYSTEM→ROOT, ORDER→ACCOUNT or BROKER_BINDING→BINDING alias | PASS: exact/unsupported target, malformed identity/env and source-scope independence |
| Strict qualification | Require literal qualified:true in the shared audit helper; do not globally rewrite grantCurrent | PASS: false/malformed truthy provider with matching legacy tuple denies F0 and existing command detail/collection/workflow; pure missing/malformed/current-proof/clock vectors |
| Finite public BLOCKED intent | Same12 fields/version; known catalogue key, finite unique1..3 blockers with relay-disabled mandatory, warnings empty, no receipt or source effect, finite nonnegative ordered Portal dates | PASS: runtime/JSON-schema parity, persisted small corruption, SQL-bounded code arrays/target/key including16KiB actual rows; no raw reason/payload/conditions/hash/prose |
| Final current authority on valid AND corrupt bodies | Actual context→bounded raw lookup→exact audit→detached body-or-fixed error→LAST actual Core confirmation→synchronous audit with conservative elapsed-time clamp | PASS: real persisted grant/session/member change after SELECT; actual grant/receipt/native expiry after final DB capture; corrupt/revoke/expiry precedence |
| Bounded/no-write disclosure | READ ONLY REPEATABLE READ, statement_timeout5s; finite raw columns/array projection, three predicates; private,no-store; no cache/source/command calls | PASS: actual transaction SHOW observer, business-ledger equality and forbidden IO spies; auth/session bookkeeping is not falsely labelled zero SQL |
| Compatibility and advertisement | Additive OpenAPI path/sub-schema/generated type and one capability/live-route census row; generic IDs/union preserved | PASS: repo generator/drift/snapshot; routes298/collisions0/protected kernel MATCH; actual error/schema tests; normal-hook landing still pending |

### Accepted independent review dispositions

1. ACCEPTED_FOR_IMPLEMENTATION: literal qualified:true, not JavaScript truthiness;
   preserve every DENY/ancestor and never recover a present-invalid native proof
   through legacy singleton fields. Narrow shared helper also fixes existing
   financial command readers, not a new broad policy evaluator.
2. ACCEPTED_FOR_IMPLEMENTATION: a corrupt public body must traverse the same
   final actual authority fence before safe503. Do not reveal its existence
   after revoke/expiry through a distinguishable error path.
3. ACCEPTED_FOR_IMPLEMENTATION: existing twelve-field base remains closed;
   additive allOf narrows existing properties without a second contradictory
   additionalProperties:false. Runtime ordered/nonnegative date invariants are
   disclosed separately from generated string types/standard JSON Schema.
4. ACCEPTED_FOR_IMPLEMENTATION: final returned Core clock is mandatory; the
   host clock only conservatively shortens elapsed delivery time. It cannot
   extend authority or substitute for Core/current source. This is not a
   distributed/held TS COMMIT fence or installed native trust proof.
5. ACCEPTED_FOR_IMPLEMENTATION, integrated review F0-I01: the original table
   permits large constraint-valid target_id/command_key strings. Bound them in
   SQL to191/128 bytes respectively, returning NULL rather than truncating an
   identity. Invalid target stays uniform404; invalid key is safe503 only after
   current audit and the final fence. Actual-PG oversized-key/target and revoked
   disclosure cases are the affected retake, not a migration or new authority.
6. ACCEPTED_FOR_IMPLEMENTATION, F0-I02: publish the existing external
   CommandProblem schema for all six refusals and regenerate, rather than
   exposing content?:never to typed consumers. Actual HTTP failure assertions
   validate that canonical schema; contract tests cover all six references.

The independent integrated review is SOURCE_REVIEW_ONLY/NOT_RUN, private
`/home/bobby/.local/state/portal-execution-elp210/20261017/f0-integrated-review.md`,
SHA2563764720fdefa328100709ed06b4d8d22561dd5fb7ad2782041bc35dfebcaaca9.
It accepted the identity/current-audit/final-fence design subject to5–6. Both
fixes were applied only after the original focused controller's verified
terminal; the original result does not qualify subsequently changed bytes.

No new actual Claude review/acknowledgement was observed during this entry.
Future findings must get their own disposition in the owning original record
under campaign7.3. Written handoff is not proof of delivery or acceptance.

## Contract and Claude handoff

Operation `executionF0BlockedOperationGetV2` in existing
`execution-operations.openapi.json`; generated component `F0BlockedOperationRead`
in execution-operations.d.ts. Regenerate with
`npm --prefix packages/contracts run generate:execution-operation-reader`.
Canonical example remains `fixtures/execution-command-operation.valid.json`:
synthetic BLOCKED account/sync intent, not an engine/broker/source receipt.

Only required query is workspace_id; no after/resource/environment/from_source
argument. Same twelve-field `execution.command-operation.v1` response. Status
BLOCKED/verification NOT_STARTED never means accepted/sent/APPLIED/filled.
Portal create/update ISO UTC dates are not source freshness. Original five-
minute planning expiry does not remove historical read; current audit grant,
receipt/native-leg and session/workspace checks still apply at delivery.

400 invalid/extra/duplicate query,401 session,403 current actor, uniform404
unknown/hidden/other creator/workspace/family/unsupported target,409 changed
authority, fixed503 invalid body/dependency all remain no-store. No private
parser/SQL/provider text. Refresh is a fresh authorized read; never strip
workspace, use generic/legacy fallback or infer family from shared op_ prefix.
All six refusal response bodies reuse
`execution-trusted-commands.openapi.json#/components/schemas/CommandProblem`;
optional public_copy_key/safe_next_action are not mandatory guard fields.

Frontend NOT_STARTED_BY_OWNER_DIRECTION; handoff AWAITING_CONSUMER_REVIEW.
When assigned, Claude uses this only for known F0 blocked-intent records and
records fixture versus real API/browser receipt separately. Existing source
commands/parents and their distinct grants remain uncommissioned, not empty.

## Actual receipt, resources, exit and next work

Initial focused terminal2026-10-18T00:43:09.799071UTC:6API files/319PASS,
including67F0 cases;1contract file/21PASS. API46.47s, contract1.03s;
build/scopedPGrestore/fouraccess-row digests PASS. Source/index/HEAD and eight
protected runtime tuples unchanged, owned Node/PG/network/lease removed.
Receipt `/home/bobby/.local/state/portal-execution-elp210/20261017/f0-reader-focus-003727/`:
controller SHA256fae42b467769a12dfa2f798d99bdfd58edc9cf2400cbf4621f0bb0e66841cd16;
log80d1e0fea27a16c3660126fefb041c2529e345ceec2bccd5cc9fd28ee635719c.
This is local TEST_ONLY correctness, not installed native/source authority.

Review follow-ups5–6 change only the F0 repository/test and generated refusal
contract. Reuse the other five unchanged suites252PASS from that exact
receipt; retake only F0+its affected contract after generation. Retake and
normal-hook landing were NOT_RUN at that planning update. Never sum repeated focused/
hook cases as new coverage or call unchanged suites fresh final-image proof.

### Affected retake terminal —2026-10-18T00:48:55UTC

- Actual1API file/69PASS,26.00s, and1contract file/27PASS,1.08s; build and
  actual scoped PG restore including four access-row digests PASS. Combined
  focused unique API coverage321=69current+252unchanged reused, not388 by
  adding the repeated original67F0 cases. Contracts27 replaces21, not48.
- Receipt `/home/bobby/.local/state/portal-execution-elp210/20261017/f0-reader-focus-004507/`:
  controller SHA25670737d9f5caa86aac7467e50943d6cf120b92bd88603c103f8dbafa8a5add616;
  log67816ac20cf6711076560eaa8e7b55f74005b2072ec29764b48d8457ddaf7ef0.
  Source/index/HEAD and eight protected runtime tuples unchanged; exact owned
  Node/PG/network/lease removed, no broad prune or runtime action.
- Independent narrow follow-up review accepted both fixes by source, no new
  CHANGE; private f0-followup-review.md SHA256
  a7fb790b1d749c95124a74ecdcc787d55c826605a63ab2948152fa0ddddf41ca.
  That review is NOT_RUN and adds no test count. Main inspected the full return.
- Capacity00:49UTC:155GiB free,9883MiB memory available; NO_ACTION_NEEDED.
  No image/volume/cache/data deletion. Actual transient peak NOT_MEASURED;
  configured4CPU/4GiB/8GiB ceiling is not a peak measurement or source SLO.
- Normal hook is the remaining local landing gate, controlled at
  `/home/bobby/.local/state/portal-execution-elp210/20261017/f0-reader-land-004907/`.
  Its result/commit are not predeclared here. Shared source/index/HEAD freeze
  applies until that controller reaches verified terminal.

Review intake at landing: no new Claude request/consumer receipt observed.
Campaign7.3 remains binding; do not close04-010 or infer acknowledgement from
this prepared contract. Original04-008/009 are PARTIALLY_DELIVERED for this
local F0 subset only and remain OPEN_SOURCE_CONTRACT for their full scope.

Rollback is a reviewed source revert of the additive route/advertisement and
narrow helper correction as appropriate; never delete intent/audit/revocation
rows or restore stale authority. No schema rollback is needed.

Backend next: finish this affected gate and normal-hook landing, then remaining
04 named parent/technical purposes and original09/10 source/trust integration
under the already approved goal. Existing008/009 remain OPEN for their wider
done-when. Installed current-human/workload/app/field trust, applied schema,
budget/calibration/coexistence/P184 performance G2/browser remain separate;
ELP2-11 is NOT_ENTRY_READY. No full04/10/goal or consumer PASS is inferred.
