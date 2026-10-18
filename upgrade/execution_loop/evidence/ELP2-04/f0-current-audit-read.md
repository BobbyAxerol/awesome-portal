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

### Normal-hook terminal — 2026-10-18T01:20:36UTC

Landed880a3d667f96e14e6de51456033cc005ae425134 on the original research
branch; actual controller f0-reader-land-004907 exited0/PASS. Contracts69files/
852tests and API386files/6617tests PASS;2existing skipped API files/3existing
skipped tests. API duration1445.68s. Build/scoped PostgreSQL restore/four
access-row digests PASS. Frozen source/index and eight protected runtime tuples
unchanged, owned containers/network absent and own lease released. These full
suite cases overlap focused receipts, not additional unique coverage.

Terminal controller SHA256
90045d9042452ad889c5d3d6c660d230730102a0fc5f0b5a43bbede7474bf0d7;
gate.log f03ae313f33cb3d1830f422e202b783d3238f058280553b3ff6aeea83d04f436.
Diff25files+1664/−52 includes generated/test/docs, not all application code.
No runtime/source/UI/push activation or consumer acceptance. This supersedes
only pending local landing above; wider04-008/009 and04-010 statuses stay open.

## Exact-own collection and internal session ceiling —2026-10-18

**IN_PROGRESS / APPLIED_UNCOMMITTED / tests NOT_RUN at entry.** Same approved
04-008/009 scope, clean entry1b6df86e8ca8dc8ecee9141045588eb8a0ce35e5 after
the actual frame hook85899 reached terminal and released its freeze/resources.
Branch/worktree remain unchanged. No source/PM/Edge/UI/runtime modification,
SQL migration, commands, new grant, shared preview, push or release authority.

Main owns operations/F0, shared access helper/DI, contracts/generation/census,
tests, Unified and integration. The existing capital_workflow_review agent
owns only a private source-review report; capital_workflow_tests drafted the
standalone new actual-PG/HTTP spec in private state, SOURCE_ONLY/NOT_RUN.
No agent writes shared canonical files or runs heavy tests. One affected cell
then one normal hook; same4CPU/4GiB/8GiB ceiling, one worker, no operating data,
public ports or concurrent engine/load/browser/DR retakes.

### Accepted review, requirement and affected-test matrix

| Finding / requirement | Disposition and implementation | Actual evidence at entry |
| --- | --- | --- |
| Exact current authority before enumeration | ACCEPTED_FOR_IMPLEMENTATION: current TS-accepted audit.read, whole DENY/delegation graph, exact workspace/resource/environment; creator is an extra ceiling, never permission | NOT_RUN; nine target/environment HTTP positives, delegated negatives and unauthorized-empty cases prepared |
| Hidden rows must not alter a cursor, page or overflow | ACCEPTED_FOR_IMPLEMENTATION: all five SQL predicates precede finite1025 census; bounded public columns only; no COUNT/SELECT*/payload/hash/expiry filter | NOT_RUN; real transaction observer,1025 hidden corrupt rows and own1024/1025 prepared |
| Public identity has no original DB bound | ACCEPTED_FOR_IMPLEMENTATION: CASE operation_id1..191 bytes→NULL; invalid visible id gives fixed503 after final fence, never truncate/omit | NOT_RUN; actual constraint-valid512byte immutable row and after-SELECT revoke prepared |
| Finite complete cohort and honest overflow | Complete through1024, explicit503 at1025; validate all visible rows before paging; created_at DESC/id ASCII ASC,1..100 items/page,1MiB response ceiling | NOT_RUN; timestamp ties, off-page corrupt rows, query/cursor/config/driver and overflow authority precedence prepared |
| Cursor correctness/privacy | Existing signed kc1 codec in a separate F0 domain; actor/session/query/current authority plus ONLY own canonical public-row hashes; validate numeric epoch and opaque id boundary independently | NOT_RUN; current binding, hidden-insert privacy, signed malformed semantic/expired/wrong-family cases prepared |
| Contextual errors must not bypass final authority | Body OR fixed refusal held through LAST genuine Core confirmation and synchronous full audit check; no await after delivery check | NOT_RUN; valid/bad cursor/overflow/dependency/missing-config revoke/session/receipt/expiry tests prepared |
| Actual Core session deadline was dropped | ACCEPTED_FOR_IMPLEMENTATION: carry existing min(idle,absolute) as internal actor_lease_until_ms in both real captures; shared audit rejects missing/invalid/expired ceiling on snapshot-shaped contexts and evaluates whole graph at max(Core,host) | NOT_RUN; real DB deadline armed BEFORE capture, unchanged result delayed beyond it, capital status, current renewed ceiling and pure boundary vectors prepared |
| No duplicate permission or native protocol | Pure contexts lacking BOTH internal witnesses keep explicit-clock compatibility. No TEST_ONLY/ADMIN bypass for malformed snapshots; global evaluateAccess, native wire/custody and browser schemas unchanged | NOT_RUN; original detail, capital collection/workflow, scope and current-relation suites are affected regression |
| Contract/route advertisement | Additive operations/f0 collection with existing CommandProblem on all refusals; shared canonical fixture/generated type/census, generic operation union/barriers unchanged | NOT_RUN; generation/drift/schema and whole AppModule literal-route tests prepared |

Private independent source intake `native-frame-next04-intake.md` SHA256
d21a5978bb007b58f566824128240c4510d6437b4fb898223cb6591eada6727f
accepts the final whole-graph conservative clock design, superseding its
earlier lease-only alternative. Private test draft SHA256
1771dc28f6ac1800d8cf7d6f8b8e9ea84fe099485825751925ca4dfae5cb782a;
notes a780b786a667f04a5d92d1acbb7d49323a69c5047c6d0f7228918c07351213c9.
Main inspected the full reports and integrated only owned paths. Neither
review is Claude acceptance or an execution receipt.

Independent integrated source review `f0-collection-integrated-review.md`
SHA25612c85a3f2d104de4de5cedd7a5c11971a6e226c2ad2731ab582a6998ab179fa9
is ACCEPT_FOR_FOCUSED_VALIDATION, not PASS/commissioning. Main accepted both
test refinements: the actual census outlives its original session capture,
with genuine session renewal before expiry, and every HTTP refusal validates
against existing canonical CommandProblem. Applied tests remain NOT_RUN before
the focused gate. No implementation or authority relaxation was requested.

### Additive consumer handoff

- `GET /api/v1/execution/operations/f0`, operation
  **executionF0BlockedOperationsListV2**, generated **F0CommandCollection** in
  execution-operations.d.ts. Required workspace_id/resource_kind/resource_id/
  environment; kinds ACCOUNT/PORTFOLIO/DEPLOYMENT; lowercase paper/sandbox/live.
  limit defaults25, range1..100; opaque after cursor. No other query fields.
- Response version portal.execution.f0-command-collection.v1, family
  F0_BLOCKED_INTENTS_ONLY, coverage CURRENT_ACTOR_EXACT_RESOURCE_ONLY, exact
  resource/environment, same12field BLOCKED items and page limit/returned_count/
  has_more/next_cursor. No global total, source outcome/freshness or peer intents.
  Source-side effect is always false. Known item detail remains the prior F0
  route. Never infer a family from op_ or retry generic/legacy on a refusal.
- Empty means current-authorized empty own history only.503 overflow is not
  the end of history,403/404 not empty,409 requires a fresh list. No-store all
  responses. Internal session lease is NEVER published in response or cursor.
- Generate `npm --prefix packages/contracts run generate:execution-operation-reader`.
  Canonical execution-f0-command-collection.synthetic.valid.json explicitly
  says TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT/runtime_qualified:false; it is
  not a product/source receipt. New schema/client remains additive.
- Claude task, only when assigned: use this explicit collection for known F0
  history, preserve workspace/resource/environment and typed states; distinguish
  F0 from capital commands and source operations. FE remains
  NOT_STARTED_BY_OWNER_DIRECTION/AWAITING_CONSUMER_REVIEW. No new actual review
  or acknowledgement found at this entry; recurring campaign7.3 intake applies.

### Exit / next / rollback at entry

One bounded real-PG/HTTP affected lane including original helper/detail/capital/
workflow/parent regressions and affected contract tests, then normal-hook commit.
No PASS or source SLO predeclared. Retain final receipts/resources and source/
index/eight-runtime freeze. Source revert may remove only the additive route/
advertisement; preserve current revoke, data and deny-default, never restore
stale authority. No DB schema/data rollback is necessary.

Backend next under the same approved goal: finish this gate/landing, remaining
04 named parent/technical purposes and original09/10 source/trust integration.
04-008/009 are PARTIALLY_DELIVERED for local F0 only, still OPEN_SOURCE_CONTRACT
for their full done-when;04-010 consumer remains owner-held. Approved real
budgets/calibration/coexistence/P184G2/browser and11entry stay unchanged.

### Focus attempt1 —2026-10-18T03:40:26UTC

Actual `f0-collection-focus-033711` is BUILD_FAIL/exit2, not a test result:
TS2345 at f0-read.service.ts94 used transport COMMAND_UNAVAILABLE as a member
of the intentionally closed business CommandReason enum. Tests and scoped
restore NOT_RUN. Source/index/eight runtime tuples unchanged; exact owned
Node/PG/network absent, lease released. No gate bypass or weakened schema.
Main replaced only that fallback with a fixed private Error marker, held
through the same final authority fence; existing commandHttpCall translates
it to the existing sanitized503 COMMAND_UNAVAILABLE envelope. It never holds
or emits raw driver/schema diagnostics. Affected lane retake is required
because no test executed, not a repeat of a passing suite.

Preserved attempt1 gate.log SHA256
b170eb55282d679ec2743f880d244d841e92389aafb74a33fc119500607e15ba;
controller.json697ef1fd4c77b6cb519c4068cc8d5a13f925142701410b3e83b6213c32003e92.

### Affected terminal —2026-10-18T03:46:03UTC

Actual PTY10505 / `f0-collection-focus-034103` exited0/PASS. Build PASS;
**7 API suites/454 tests PASS**,0fail/skip,104.97s. Per-suite:
Access transaction128, existing F0 detail69, new F0 collection44, capital
workflow65, capital collection/status39, current-grant relations93 and operation
parent16. These are actual disposable PostgreSQL/Auth/mounted HTTP plus pure
vectors where the suite says so; membership/provider authority is explicitly
TEST_ONLY, not current installed PM authority.

All new collection cases pass, including complete bounded1024/overflow1025,
hidden1025 malformed rows having no cursor effect, released-SELECT revoke,
whole delegation/DENY, safe driver/oversized/cursor/config failures, actual
session/grant/receipt expiry and two real-session-renewal races. Canonical
CommandProblem validates every collection refusal. The changed capital status
case proves the shared helper without relying on a caller host-clock clamp.
Following disposal, **45/45 operations-contract tests PASS**,1file,1.04s;
canonical JSON Schema/runtime/generated/client/query/fixture remain coherent.
No unchanged engine, load, browser, upstream or broad DR retake was performed.

Existing script's real scoped PostgreSQL restore, including four access-row
digests, PASS. Source/index/head freeze and all eight protected runtime tuples
unchanged. Exact owned Node/PG/network absent and own lease released. Controller
SHA256d71053e4ac70370abc24608f44e1225848fc5f868bb81ea3331da1baabfe6280;
gate.log7e83281f27a99a94e53aaaa0d24077cdbbf1d96651421578245191059c9d026d.
Full per-file source pins and actual container IDs are in controller.json.

Capacity after terminal:11891MiB available,154GiB disk free/76% used;
NO_ACTION_NEEDED, no cache/image/volume prune.4CPU/4GiB/8GiB is the approved
ceiling, not measured peak; no source/coexistence/SLO claim follows. One earlier
compile-attempt sample Node1.018GiB/PG71MiB is not a peak or current run metric.

Source-review findings are ACCEPTED/APPLIED and affected tests verified locally;
producer remains UNCOMMITTED until one coherent normal-hook landing. The hook
is not bypassed or counted as new unique cases. F0 collection is a partial
delivery of original04-008/009, not generic parent/source alias commissioning.
Consumer04-010 remains NOT_STARTED_BY_OWNER_DIRECTION/AWAITING_CONSUMER_REVIEW.
Backend next: land this batch, then remaining named parent/technical/source
purposes and original09/10 trust/source integration.11remains NOT_ENTRY_READY.
