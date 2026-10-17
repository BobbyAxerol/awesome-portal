# ELP2-04 — exact operation parent and finite technical runtime

2026-10-17. Approved backend02–11 continuation. Entry
`be97b20ef994909b8f660712f1906a885f54495a`, same research worktree/branch.
Implementation UNCOMMITTED / tests NOT_RUN at entry; terminal results below
supersede preparation only. Claude NOT_STARTED_BY_OWNER_DIRECTION.

## Scope and ownership

Primary owns integration, shared contracts/generation, resource schedule,
packets and Git. Independent private drafts supplied runtime service, mounted
PG tests and operation tests; independent reviewer checked runtime fences.
No frontend, DB migration, runtime flag, source install, push, dev/main merge,
release, deploy or source command. One heavy Core lane4CPU/4GiB/8GiB transient.

This is a **partial delivery under existing04-008/009**, not commissioning all
generic parent/technical aliases. Operation queue and non-ecm_ scoped parents
keep their existing barriers; the33 unclassified aliases stay closed. No new
grant is created to manufacture a positive runtime receipt.

## Implementation and contract

- `GET /api/v1/execution/operations/:operation_id` routes only strict `ecm_`
  IDs to the existing `ExecutionCommandService.status`. Current exact financial
  audit authority, resource/environment and final actor/session/policy checks
  remain there. Hidden and unknown are the same404. Malformed ecm_ is400.
  GET cannot send, lookup, recover, reconcile or mutate the command ledger.
- Existing F0/R1/R2/Live/PaperExit operation families retain their own behavior,
  including scoped-parent503. Both historical OpenAPI documents now describe
  one canonical union via `tooling/execution-operation-reader.mjs`; old
  operationIds remain. The Governance generator preserves this same union.
- Additive `GET /api/v1/execution/runtime-manifest/v2`, operationId
  `executionScopedRuntimeManifestGetV2`, returns closed
  `ExecutionScopedRuntimeManifestV2` in `execution-scoped-records.d.ts`.
  V1 runtime route/DTO and retained source-workspace compatibility are unchanged.
- V2 keeps original Core workspace and per-profile maintenance authority.
  Configured projection storage is checked independently; a source V2 policy
  also requires independent technical scope. All-profile means every configured
  profile must pass, not silently dropping denied profiles. Exact Paper remains
  independent of unrequested Sandbox/Live. Configuration is eligibility, not
  source readiness or a grant.
- Only scalar snapshot metadata, nullable persisted refresh-health and mirror
  integrity are read. No full snapshot, business rows/counts, source cursor,
  endpoint, secret, catalogue, topology or command-readiness field is emitted.
  `health: OBSERVED` means a local snapshot clock exists, not upstream readiness.
  Snapshot without persisted health has `state: NOT_PUBLISHED`; missing snapshot
  has null lag, never a synthetic HEALTHY fact. Mirror disabled remains absent.
- Nested current-scope delivery checks plus source eligibility and synchronous
  final config comparison fence output. These are sequential local checks,
  **not a held transaction across PM/Core authorities**. Genuine source current
  lease/COMMIT proof remains03/07/10 work.
- Errors private/no-store, safe typed400/401/403/404/409/503; repository exceptions
  sanitized. Independent review fixed the async rejection sanitizer, final
  config race and synthetic missing-health fact before integration.

Regenerate `npm --prefix packages/contracts run generate:execution-operation-reader`;
runtime uses the existing scoped-record generator and openapi-typescript.
Canonical fixture `execution-scoped-records.synthetic.valid.json` and command
status fixture `execution-trusted-commands.synthetic.valid.json` are labelled
TEST_ONLY, not source installation evidence. Route inventory registers the
additive read as backend-owned, published/unconsumed; no frontend file changes.

## Validation / exit / rollback

Mounted HTTP/Auth/SessionGuard + real disposable PostgreSQL tests target exact
audit positives/hidden404, environment/resource/membership/session/policy races,
no GET mutation, Core/source separation, V1 regression, missing observations,
async driver errors, final config drift and closed DTO. Source relations/policies
are TEST_ONLY; not genuine TS grants, physical store separation or commissioning.
Contract tests cover both documents, original F0 and strict command status,
runtime schema/fixture correlation and generation parity. One bounded focused
cell then one coherent normal-hook commit; no independent parallel heavy jobs.

Rollback unmounts only additive runtime V2/operation routing. Keep V1 and deny
barriers, all identities/grants/revocations, command/status/audit and projection
history. Clean exact owned containers/network/window only; protect all runtime
services, backups and foreign workload resources.

## Future Claude handoff / next work

AWAITING_CONSUMER_REVIEW, no assignment. Later consume CommandStatus via strict
schema_version union; ACK/UNKNOWN is not APPLIED/FILLED. Runtime V2 is a separate
technical surface, never cast V1 or infer maintenance access from business ALL.
Display null/NOT_PUBLISHED honestly, preserve workspace/environment and error
codes, and do not restore source streaming/polling from local health fields.

Remaining04-008/009: other named parent purposes/source-qualified lineage,
33 null aliases and real accepted source pins. T04-11 applicable physical
coalescer/current-authority proof is now recorded below, not all alias/source
acceptance. Backend may continue these and
03 exact scoped acceptance/06 materialization without waiting for frontend;
unqualified source/runtime and budget/calibration gates remain explicit.

## Physical coalescer proof and terminal focused receipt

`elp2-manager-reads.spec.ts` adds four actual `ManagerModelService.read` cases,
using independent Core/Execution PostgreSQL databases and the existing
`ManagerModelRepository.document` coalescer. An exact UUID-named disposable
revision table is lock-blocked; real `pg_locks` plus forwarding SQL observation
show one document SELECT, one flight and two waiters. No SQL result, document,
service or authority-delivery callback is substituted. Cases:

1. Both current deliveries receive only the permitted Alpha, no peer sentinel.
2. Actual Core grant revoke during the wait refuses both deliveries.
3. Actual Core session revoke during the wait refuses both deliveries.
4. Two real sessions of the same actor share DATA; revoke only leader session:
   leader is refused while the current follower still receives scoped data.

Settled flights are removed; later current reads execute fresh SQL; revoked
requests cannot reach DATA. Same-actor/two-session proof is not cross-actor
qualification. Source publication/commissioning/relations remain explicitly
synthetic TEST_ONLY fixtures, not genuine PM acceptance. The raw retained reader
uses a different transaction/bypass path and is not relabelled as this coalescer.
Lock/client/pool cleanup and finite timeouts are test-local, not new runtime
configuration. Independent review added finite PG pool deadlines and a passive
borrowed-client error listener; query rejections still fail normally.

| Attempt / receipt root under private `20261017/` | Actual result |
| --- | --- |
|`readers-focus-064204`|Build rejected two TypeScript narrowings; no tests ran. Explicit never-return branches fixed; failure retained|
|`readers-focus-064556`|Build PASS;77 tests PASS/20 runtime fixture FAIL because Core/Execution URLs were equal. Kept isolation guard; fixed fixture to two actual disposable databases, no product relaxation|
|`readers-focus-065013`|Build,128/128 tests in7files and scoped PGrestore PASS; test duration44.95s. Includes16 operation/20runtime/31Manager (four new physical-coalescer cases) plus unchanged impacted command/parent/V1/technical regressions|
|Contract focused checks|Operation reader4/4 and scoped-records23/23 PASS; existing trusted-command5/5 PASS. These overlap the normal hook, not additive coverage|
|Final coherent normal hook|The commit containing this packet may land only on normal-hook exit0. Exact final source/runtime/cleanup verdict is `readers-land-*/controller.json`; no full hook is repeated for the final receipt text alone|

Focused terminal06:54:36UTC: source unchanged through gate, eight protected
runtime image/start/restart tuples unchanged, no remaining owned containers or
network. Log sha256
`475414ae7380fe0576f1ed7937be3be7c1111326706cd165f5bd037b6ea62545`.
After that focused gate, only test-harness deadline/error-listener hardening,
packets and generated static route/pin maintenance changed; the final normal
hook covers those final bytes. No extra source/transport or browser acceptance.
API global static routes291→292; backend capability inventory235→236. N29 and
EDS-12 helpers refresh only generated input hashes/MANIFESTs: runtime_effect
NONE, deployed evidence pending and command/Live authority unchanged.

**Disposition:** local04-008 exact `ecm_` /04-009 runtime V2 implementation and
T04-11 physical applicable coalescer proof are delivered by the normal-hook
commit containing this packet. Full04 remains NOT_MET_SOURCE_PARENT_CONSUMER;
Claude remains NOT_STARTED_BY_OWNER_DIRECTION/AWAITING_CONSUMER_REVIEW.

### Terminal normal-hook receipt — 2026-10-17

Landed `68923d2912b2fa58db2789e10f559a17cf600817`:38files,+2058/−50.
Normal hook exit0,64contract files/698PASS,336API files/4616PASS+3existing
skips, APIbuild/scopedPGrestore/four row digests PASS. Controller terminal
07:21:12UTC at `/home/bobby/.local/state/portal-execution-elp210/20261017/readers-land-065637/controller.json`;
log SHA256 `9d5dc774fdf1ae2cdc0bcb49af0467fc057a6557269a4d586d513342a3619c61`.
Source unchanged through gate; eight runtime image/start/restart tuples
unchanged; remaining owned resources empty. No source/runtime/FE/push/deploy.
This terminal addendum supersedes pending-hook wording above only; it does not
close other parents/aliases or genuine source/consumer qualification.

### Approved next subset — 2026-10-17

The[three finite retained aliases](finite-retained-aliases.md) now have an
applied UNCOMMITTED candidate: explicit purposes, narrow current field
intersection, keyed private row identity and same-snapshot parent join.
Tests/normal-hook PENDING;30other null aliases and compound source-current
qualification remain OPEN. This is not all04reader completion or new authority.

**Terminal focused addendum,09:04UTC:** the subset's41cases PASS inside the
247/247API/build/scopedPGrestore gate;84/84impacted workflow/Manager contracts
also PASS in the same sequential window. [Exact receipt and unchanged public
contract](finite-retained-aliases.md#terminal-focused-correctness--2026-10-17t090412z).
Normal-hook landing stays pending; other owner's index and protected runtimes
unchanged, own resources/lease removed. No source or consumer qualification.
