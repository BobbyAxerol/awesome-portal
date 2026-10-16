# ELP2-10 — authentic human / commit authority continuation

Entry2026-10-17 Asia/Saigon (UTC receipts retain their original timestamps).
Bobby assigned continuation until backend gaps close, including the concrete
authority package linked in source-followthrough. Same Portal branch
`docs/research-loop-plan` atfa857b8538c1dd38ab61af94700c71c911d81424;
three own documentation changes from prior slice remain pending normal hook.
PM candidate9c39b466 is committed/clean; owner now4ec68ff3 (separate clean
worktree, not permission to change it). No ELP2-11/frontend/push/runtime/Live.

## Scope card before implementation

Implement candidate-only versioned human issuance/current-revision and bounded
commit-lease compatibility; reuse real Portal users/sessions/workspace/app facts
and PM HumanIdentityService, not workload-as-human or synthetic revisions.
Proposed acquire/drain/release protocol from the approved continuation remains
uninstalled: existing application behavior is unchanged until commissioning.
No Core DB transaction/socket held over network I/O; no trust/key provisioning.
Missing trust/source/config stays fail-closed. Authentication is not TS economic
permission. Preserve owner WIP and existing immutable association/receipt pins.

Owned paths: new private authority contract/repository/issuer/tests and additive
unmounted candidate SQL under existing Execution V2 boundaries; existing access
implementation only where required to reuse a short DB-only snapshot. Primary
owns shared contracts/SQL/docs. PM candidate new adapter/tests only after exact
wire/schema agreed; no owner-worktree edits or imported WIP. No frontend edits.

Validation: schema/crypto and current actor; real PG serialization/expiry/revoke,
bounded drain/unknown release, cross-session/workspace/issuer rejection, source
COMMIT vs revoke ordering. TEST_ONLY keys exist only inside disposable tests,
not installed credentials or runtime trust. Preserve prior passing receipts;
one normal hook for the coherent Portal landing after its allocated window.
Local qualification existing4CPU/4GiB/8GiB envelope; source candidate per-run
2CPU/1536MiB/300s. No measurement while a foreign host lease is active.
Risk: cross-service revocation linearization. Rollback leaves candidate unmounted
and preserves immutable history; no old revoked rights restored.

## Independent task map

| Task / owner | Allowlist / output | Resource and acceptance |
| --- | --- | --- |
|10A-CORE review|Read Core identity/app mutation paths and candidate design; notes only|Identify every authority-changing table/column and races; no edits/tests/Git|
|10A-SOURCE review|Read exact PM4ec68ff3 human/current-read/session adapters and source candidate; notes only|Return wire/lease expiry/COMMIT requirements and unsafe shortcuts; read-only SSH only|
|10A-QUAL implementation|Own only scripts/execution-v2/qualification-readiness.mjs and its .test.mjs|Close false eligibility from missing calibration/coexistence payloads and untyped budget metrics; no production constants, no tests until primary allocates window, no Git/docs/shared runtime edits|
|10A-PRIMARY|Own implementation, tests, shared schema/SQL and this packet/Unified|Integrate both reviews, schedule one isolated lane, record real counts/bytes/pins and cleanup|

## Result and handoff

Candidate implementation delivered in the coherent commit containing this
packet; validation and source-candidate pin are recorded below. No runtime
gate is PASS from a test plan. Canonical05-001/06-002,00-005/10-002 and10-001
retain their distinct source, calibration/budget and consumer criteria.
Frontend stays on owner hold; no claimed browser acceptance.

## Implemented private wire and revocation semantics

The candidate adds no public route, DI registration, environment default or
numbered migration. `current-human-candidate.sql` is deliberately outside the
migration directory: normal deployment cannot accidentally install its guards.
The existing Access service now reuses `captureCurrentHumanSnapshot`; ordinary
repeatable-read/final-fence semantics and its opaque fingerprint are preserved.
Actual existing user/session/workspace/owner/policy/grants remain authority.

1. `issue` checks the real Core snapshot under a short derived revision barrier,
   creates a bounded durable ISSUED lease, releases the DB connection, then
   signs Ed25519 `pma.identity.v1`. Exact immutable subject/session generation,
   integer authority revision, workspace/environment/workload/request digest
   bind the identity. It carries **no roles, scopes, TS user or business grants**.
2. PM signs an exact `pma.current-human-lease.v1` ENTER proof before borrowing
   a TS connection. Core verifies pinned source issuer/audience/key/workload,
   current revision, token expiry and every binding. ENTER is one-use; even
   same-attempt replay cannot authorize another transaction. Lost ENTER ACK is
   uncertain, not a reason to generate a new write/key or enter twice.
3. Core authority changes, including old/raw SQL/session lifecycle paths, share
   the derived barrier through additive candidate triggers. Table coverage:
   users, sessions, external bindings, workspaces/members, owner anchor, V2
   policy/grants, Governance grants, retained-review delegation and the first
   immutable policy event that disables legacy fallback. Retained permission
   is **never** accepted as upstream business authority. Harmless user display,
   binding last-seen, session last-seen/expiry extension and workspace name
   changes do not create unnecessary drains. Security fields, cascade/deletion
   and TRUNCATE stay guarded; history/revision tombstones cannot be truncated.
4. `beginDrain` commits its own state before reporting DRAIN_PENDING or
   DRAIN_UNKNOWN. It rejects new acquisition/entry and retires only never-used
   ISSUED tokens. No busy exception rolls back the drain. Existing ENTERED/
   UNKNOWN leases remain blocking after token expiry, cancellation or partition.
5. Only exact authenticated source COMMITTED/ROLLED_BACK proof resolves a used
   lease. Same terminal fact replays idempotently; changed attempt/outcome/receipt
   conflicts. The actual existing authority writer then commits; `endDrain`
   requires the resulting integer revision. Pending is not “revoked”, and a
   transport ACK is not a business outcome. This proposal does not retrospectively
   change revocation semantics in an installed runtime.
6. Core persists each admitted attempt before PM can open its transaction.
   Private `recoverableAttempts()` returns its exact binding, without a JWT or
   new admission. This supports a PM process restart even before a source
   marker was written; recovery must still acquire the same source fence and
   persist an immutable rollback tombstone before declaring ROLLED_BACK.
7. Lease transitions physically version a separate singleton `lease_epoch`.
   A raw REPEATABLE READ revoker with a pre-issuance snapshot must fail40001,
   rather than miss a new lease while holding the same row lock. This epoch
   never substitutes for the signed revision of actual authority changes.

Pool acquisition and wire query timeouts are mandatory, in addition to short
SQL lock/statement bounds. Maximum outstanding and retained rows are explicit
candidate-cell inputs, not production budgets. Exhaustion refuses admission;
there is no TTL sweeper silently freeing unknown source COMMITs. Immutable
phase receipts are retained. The coarse global barrier intentionally covers
owner/ancestor/cross-workspace dependencies; finer sharding is **not** guessed
before dependency/capacity qualification.

### Source adapter delivery level

The approved PM candidate implements an adapter around the real
HumanIdentityService, not an alternative identity resolver: ENTER before TS
acquire; one-use marker in the owning transaction; deferred wall-clock validity
at logical COMMIT; immutable terminal receipt and fresh readback under the same
advisory transaction fence. A proven absent marker is sealed as a rollback
tombstone that excludes a late original transaction. A storage/lock/ACK failure
stays UNKNOWN; timeout, expiry and cancellation never prove rollback.
No Portal network I/O holds a TS connection/transaction. Workload, TS membership
and current field policy must independently authorize each business/read
operation. No app, route, key, client or provider is installed by these files.
The pinned Python3.10 runtime is retained. Both timeout classes are handled;
without a public cancellation counter the deadline preserves CancelledError.
Failed rollback/release/unknown recovery cannot mask original cancellation.
Client termination alone does not prove immediate server rollback: the used
lease stays UNKNOWN until fresh fenced readback proves its terminal outcome.

Private wire versions are the two purpose constants above and strict Zod
schemas in the candidate module; there is no browser OpenAPI/generated consumer
change. Source Ed25519 keys in tests are ephemeral TEST_ONLY material; no key
file, trust store, credential, grant, business identity or service is provisioned.
An injected callback/fake transport alone cannot close source-connected runtime.

## Qualification intake correction

`scripts/execution-v2/qualification-readiness.mjs` remains offline evidence
eligibility only, never an activation/phase/capacity authority. It now requires:

- independently pinned approval revision, selection, issue and expiry;
- an approved exact metric catalogue with matching units/scalar semantics and
  complete14-group coverage, not arbitrary rows marked PASS;
- actual calibration policy and runtime approval bytes plus an independently
  pinned receipt from the existing canonical loader, bound to exact runtime,
  calculator, decimal-helper and dependency-lock bytes (no second formula);
- independently pinned repeated B0/B1/B2 workload/hardware/common and per-stage
  configuration, counters/durations/coverage, respecting the approved
  counterbalanced stage order rather than hard-coding B0→B1→B2 chronology.

Source Edge01 uses composite policy codes, e.g. soft/high/hard/actions. These
cannot be represented by one invented scalar. Intake explicitly reports
`SOURCE_BUDGET_REQUIRES_APPROVED_SCALAR_DECOMPOSITION` until the approved named
counters/bounds exist. READY_FOR_MEASUREMENT_REVIEW is not capacity PASS.

## Operational inputs still required — one consolidated return

Read-only repin17:22UTC: PM readiness DRAFT_NOT_APPROVED_FOR_EXECUTION
SHA256`0e2e4ab065fc1602ba2f2ec3bb2df8179a7d29c198ef084f288a430dfceff0bd`;
current-read808PASS receipt remains TEST_ONLY,
`36fb8942179edb741c221271107c13604f29d50fddd45ae8f1eafcddb0d3718d`.
Edge01 plan`aaa1c7d023bd5a36f9a5a219b958c7ea88be67dea332b3a674ff6073ee9a17a1`;
Edge10qualification`6349a9360cf4ee72f9a6597e46cc3755d328ee68b529027a991a64e4b29698cf`.
These are not approved production numeric artifacts.

| Canonical gate | Minimum concrete input / owner | What this candidate does not fabricate |
| --- | --- | --- |
|05-001/06-002|Qualified Portal/PM/Edge trust and current workload/field provider, explicit mappings and selected source publication; coordinated operator installation/recovery scope|No issuer key installation, TS membership/root seed, synthetic human or generic transport pretending to be commissioned|
|10-002|Bobby-approved selected scope/workload/placement and named scalar budgets across14Edge groups, including population, units, baseline, bounds, reserve/actions, revision and validity|Container caps/fixture counters are not production budget approval|
|00-005|Research-derived immutable horizon/basis/calibration/anchors/stress/block/maturity/freshness config with independent approval and exact loader receipt|Formula/weights/bands stay selected; no new formula question or fixture-derived anchors|
|10-002/T10-05/06/08/12|Allocated source-connected window; paired B0/B1/B2 measured receipts and applicable P184 performanceG2 impact/reuse or new proof|HK lock owner is claude-dl-roll through19:13:22UTC (02:13:22Asia/Saigon next day); local correctness tests do not measure shared-host coexistence|
|10-001/T10-14|Claude assigned six Manager/360 consumers and independent browser receipt against an approved compatible build|No UI change, consumer assignment or browser PASS in this backend slice|

PerformanceG2 uses its original P184 apparatus and per-feed/venue populations,
not a new universal Portal SLO or optional mainnet exemption. Edge protocol's
6000/9000controlled canonical events/s,600s,two independent repetitions are
planned inputs, not measured throughput/orders/s or an allocated test window.

Backend next stays **ELP2-10** candidate integration/qualification. ELP2-11 is
not started. Claude has no new browser field from this private authority wire;
existing six-operation/Score handoff remains AWAITING_CONSUMER_REVIEW when
assigned. No request ID is duplicated; no owner/consumer acceptance invented.

## Actual validation and correction record

- First isolated Core attempt:
  `/home/bobby/.local/state/portal-execution-elp210/20261016/authority-attempt-172852/controller.json`.
  Qualification intake111/111PASS; Core buildPASS,147PASS/8FAIL, not a passing
  suite. Seven failures exposed the same polymorphic PL/pgSQL field-planning
  defect; the event-only `NEW.workspace_id` lookup is now in its own nested
  statement. One fixture incorrectly excluded the already-installed protected
  owner from the original snapshot fingerprint; assertion corrected, production
  semantics retained. All owned disposable resources removed.
- Independent review additionally required finite connection/wire query
  timeouts, benign last-seen exemptions, first policy-event coverage and a real
  two-connection stale-snapshot race. These fixes and crash-recovery cases are
  included in the final candidate test source; first-run counts do not cover
  those subsequent changes. Final normal-hook result/pins are recorded in the
  terminal receipt, not inferred from111PASS.
- TEST_ONLY disposable source PG final attempt17:55:03.910429–17:55:23.333353UTC,
  **23PASS/0FAIL/0ERROR/0SKIP**, pytest13.67s. Existing PM verifier/identity and
  actual PostgreSQL transaction/fence/expiry are exercised, but Portal transport
  is injected TEST_ONLY; actual cross-service client/trust is not installed.
  Receipt `/home/bobby/.local/state/portal-execution-elp210/20261016/source-candidate/attempt-175503/controller.json`,
  SHA256`7ffaaf20cf4e6badc6f3fc42cf44acab83e3380288133b0fa9d555b31bd87df6`;
  JUnit`26c651d042fa7bffa97b4f2b967cd61c0fcadac29c745c84c51f8ff7ffe20cd0`.
  All own containers/internal network removed; cleanup_errors empty, own lock
  released,8Portal image/start/restart tuples unchanged. Hard limits prove
  caps, not peak usage/coexistence. No image/build/volume created to prune.
- Source candidate normal commit **0e7059cc968654d50e76fcc76f3a2d3aceababe3**,
 5files+1369/−0, clean, no hook bypass, push, merge or runtime change. Exact
  module`aa437f986301b13bb320770e452fc4a76675a408fd53fe3d98ef0ac4f0a75c01`,
  SQL`305ba23619578935696bbcb6ce434b031746280101034f98accee9271d7ae370`,
  tests`a30d2f71ac20e4e358abf076c1157db3b8dba2de1bf33d0a9e8ff57782b87d43`.
  Reused PG imagefe0737ba/Python3.10 image91681097 are full-pinned in the
  source receipt/handoff. Earlier45association cases were not rerun or added
  to23current-human cases.
- Source failed attempts are retained:17:41:32 had18setup failures (Python3.10
  missing asyncio.timeout);17:50:06 had20PASS/1FAIL (cancellation masked by
  recovery);17:52:53 had22PASS/1FAIL (test wrongly expected immediate rollback
  after client terminate). No source business or authority failure is hidden
  by weakening a claim or converting UNKNOWN to ROLLED_BACK.
- Read-only owner repin17:52UTC: PM advanced4ec68ff3→f8ddea319a0588ea2994b937db1b2e999bd688d9,
  clean. Optional DB-only unit_of_work preserves the default identity call;
  reviewer accepted declared compatibility, not qualification of imported owner
  changes. Candidate remains based9c39/98db; owner source was never overwritten.

### Portal normal-hook terminal record

First normal landing17:57:19–18:15:39UTC was interrupted by the controller's
self-imposed1100s deadline (exit124), not a recorded test failure. Contracts678
and the new Core PG candidate24cases passed before interruption; no full API
PASS/restore is claimed from that attempt. The wrapper initially checked its
proposed suffix, whereas sudo used the child PID3107360. Follow-up explicitly
stopped that orphan group and verified both actual container IDs, network and
`/tmp/tmp.J6nCNNwEmc` removed; foreign PM reservation/runtime were preserved.
Raw failed receipt/log stay at authority-landing-175719. Corrected landing
controller discovers actual child-resource identities and keeps its reservation
until teardown is checked; full-suite allowance is bounded40minutes without
raising CPU/RAM/disk caps. Source23/intake111 remain exact-byte reused.

This coherent landing includes the previously pending source-followthrough
Markdown, current-human implementation/tests and intake correction. Existing
normal hook is required without bypass. Its actual result, full commit SHA,
owned-path hashes, log hash and8service runtime/teardown checks are written to
`/home/bobby/.local/state/portal-execution-elp210/20261016/authority-landing-receipt.json`.
This reference is not a predeclared PASS; inspect status/exit code and dependency
bytes there. Qualification111PASS is reused only because both intake source and
test hashes are unchanged since authority-attempt-172852. A failed hook leaves
this landing pending rather than converting the earlier147/8 into a pass.

### Exact next commissioning package, not implicitly activated

The remaining implementation is mounting the real authenticated Portal↔PM
client/trust and joining the existing authority writers to drain/recovery,
plus independent PM workload/current-read field authority and selected
publication on the source candidate. Requires explicit deployment/trust scope,
exact issuer/audience/key IDs/certificates, resource targets, valid rollback and
allocated source-connected window; these are not present in this candidate-only
approval. Do not provision keys or borrow an owner test provider automatically.
Validation must include actual two-service exchange, revoke while COMMIT/lost
ACK, durable restart recovery and independent human/workload/field denials.
Owner f8ddea31 capture is a separate selected dependency, not imported evidence.
Production budget/calibration artifacts and capacity workload approvals above
remain missing inputs; no scientifically validated Score or capacity default
can be inferred from these correctness tests. All uninstalled source/provider
work remains explicitly backend debt, not renamed as “only external evidence”.

Rollback is to keep the additive candidates unmounted. There is no source
runtime migration, service restart, privilege seed, credential installation,
frontend rebuild, financial command or change to existing user/session data.
Never uninstall a commissioned fence with unresolved leases: first quiesce
issuance and obtain fenced terminal proofs; preserve receipt history.
