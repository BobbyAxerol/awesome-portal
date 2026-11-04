# Core native finite / Approval / sibling retake — 4 November 2026

## Scope and change

The integrated Core branch began at `b9d77bd1b`. No API is mounted, no source
or credential is installed, no frontend is changed, and the three sibling
routes remain source-dark without a qualified producer. Review of the
unmounted sibling composition found that a server qualifier could return a
body and field proofs without actually consuming the selected source. It now
requires at least one native-fenced read and, for every published non-envelope
field, a read of the selection named by that field's proof. This proves only
that the selected read occurred: source meaning, relation and lineage still
belong to the separately qualified server adapter. It does not authorize a
fixture or turn an order ID into account/deployment authority.

## Results

- On the changed working tree, three focused local suites
  `sibling-native-delivery`, `sibling-native-http-composition` and
  `approval-evidence-native-http` passed **31/31**. They include no-read and
  wrong-selection refusal and existing CURRENT/HISTORY negatives. Their native
  fences and authorities are synthetic; they are not actual Edge acceptance.
- A pinned PostgreSQL/Node disposable, internal-only Docker cell ran the one
  `joins Account profile` test in
  `elp210-native-current-relations-provider.spec.ts`: **1 passed, 21 skipped**.
  It now also exercises Approval two sections using one source read; physical
  HTTP custody and final-dispatch revoke with zero bytes; terminal response
  loss twice followed by a newly constructed provider's recovery using the
  same persisted originals and terminal IDs/digests; and all three sibling
  families with native PG/mTLS, cursor paging, cross-workspace refusal and
  final-dispatch revoke. The source publisher, identities, rights, qualifier,
  mappings, approval and terminal source responses are TEST_ONLY synthetic;
  the provider restart is a **new instance in one process**, not proof of an
  OS restart. Synthetic ACK is not the Edge ACK. No semantics of an order's
  real account/deployment relationship are established by this test.
- This fast diagnostic cell mounted the existing local dependencies read-only
  and did **not** run the full build, official restore drill or normal hook.
  It used Node image `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`
  and PostgreSQL `sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`.
  Cleanup was restricted to that invocation's unique container/network.
- Three earlier attempts failed on the evolving integration test itself:
  advisory leases were incorrectly counted as the HTTP lease; then a final
  dispatch abort was incorrectly expected to throw; finally one dropped ACK
  was immediately retried by the provider. Those attempts were not PASS.
  The last fast run exercises the corrected expectations and double lost ACK.
- `npm run typecheck` in `apps/control-api` completed **exit 0** on this
  working source, including tests and the cross-loop TypeScript project. An
  earlier invocation stopped after its source changed is not counted.
- The official `scripts/control-api-test.sh` grouped isolated gate then passed
  **53/53** across the native PG/mTLS provider, sibling delivery/HTTP and
  Approval native HTTP suites; its PostgreSQL restore drill also passed. It
  built the copied source in its own disposable cell and cleaned its resources.
  Inputs and qualifiers remain synthetic; this does not establish a real Edge
  ACK or process-restart acceptance.
- The normal monorepo hook subsequently completed successfully on code commit
  `d1462632c446891d0bb115f21a6aab245a38f865` (tree
  `c13c848df239c303288facc030f1f760b40f22ab`). It included the Control API
  suite and PostgreSQL restore drill, contract/OpenAPI checks and the normal
  integration gates. This is a source/test result, not an installed image or
  a connected Edge, browser or G2 acceptance.

Working-file SHA-256 at this retake:

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/sibling-native-delivery.ts` | `e03d9401978af38bf0fb848333a1d17c84f200ab91cabb9567fa524bd58b23e1` |
| `apps/control-api/test/elp210-native-current-relations-provider.spec.ts` | `89f9f41ebed18f1d7243ef584e7c3b66283b59c05c23a49ae29ae23749cc5171` |
| `apps/control-api/test/sibling-native-delivery.spec.ts` | `c9e98a9b86562bb401f9e9c3a588f74f12561b03947cf24f9bb7fde98afea81e` |
| `apps/control-api/test/sibling-native-http-composition.spec.ts` | `5e168ede4649a7f568c7bb8263aa29a45c5d71fd9443a894138a2b52c7fe6bac` |

## Next and limits

[HISTORY/diff authority design](APPROVAL_HISTORY_DIFF_AUTHORITY_DESIGN_2026-11-04.md)
keeps historical sections refused on CURRENT. [Qualification matrix](CORE_AUTHORITY_QUALIFICATION_MATRIX_2026-11-04.md)
separates reusable source pins from final connected, restore and G2 gates.
Further independent work remains: an approved operational rollback; the combined
historical-clone/custody restore and maintained Approval crash/restart test are
recorded below. Edge must qualify the real
source, grants, field policy and approval/order lineage. STATUS real ACK,
financial/Approval, connected browser and G2 are not established here.

## Historical clone with synthetic custody — restore retake

An isolated PostgreSQL cell restored historical preview backup SHA-256
`324fb9f35dbb606773010af310caf1261e386abc6cb57be3abaf378f9f8c15c8`.
The backup was read-only; the shared preview database was not contacted.
A TEST_ONLY settled custody record was added to the clone before migration.
The guarded clone test, SHA-256
`cca0778f3565beb1d5d52d7ef7014b657ea6d85671863c059d43f17ea08800fc`,
passed **2/2** for migration through 0158, protected rows, scoped security
metadata and refusal of an unapproved down. Afterwards, TEST_ONLY STATUS
context and ACK records were added to that same clone; a new custom dump was
restored into another disposable database in the cell. Scoped row digests
(users, sessions, custody, STATUS context/ACK and migrations) and relation
owner/ACL/RLS, non-internal trigger and function owner/ACL/definer digests
matched. This is synthetic ACK data, not an Edge receipt.

This did not execute an approved operational rollback or compare all database
objects; real custody, final candidate/runtime and integrated connected gates
remain unqualified. PostgreSQL and Node image pins match the fast cell above.
The cell's explicit containers and internal network were removed; a read-only
name check found no `elp2-restore` containers or networks. An initial readiness
attempt before this retake failed before migration because the test database
was not yet created; it is not counted as PASS.

## Separate-process recovery diagnostic

A subsequent disposable PG/mTLS cell ran the same Approval lost-ACK path on
`d1462632c` with a temporary test overlay. A separate Node process constructed
the provider, with TEST_ONLY loopback TLS material and signing key sent over
private IPC, and called `recover()` against the same database and synthetic
source. The child PID and provider source configuration digest were checked;
the test also compared the original base body and terminal receipt id/digest,
confirmed no new issue and that the original became settled. Result: **1 test
passed, 21 skipped**. The two earlier attempts failed before the test ran:
first the Vite cache was on a read-only mount; second the temporary dependency
directory was empty. Neither failure is counted as PASS. The final test's source
overlay SHA-256 was `30155f115cfbf44d180cd9bdd7a4425954c27b7893eb5b92f3e3d5d22b4da790`;
the diagnostic child script SHA-256 was
`b74d6d5ca71bc98922ebe998464324b2580042d7f75c147b913355e2d4766fc3`.
The non-secret diagnostic inputs, including the cell runner, were retained
locally under `/home/bobby/.local/state/portal-research-evidence/elp2-approval-boundary-20261104/`;
they are not part of the committed regression suite or a remote artifact.

The issuer process remained alive throughout. This proves recovery across a
process boundary, **not** kill/restart of the issuer, a production source,
or real Edge ACK. The overlay was a disposable diagnostic, not a maintained
regression test. Promoting an issuer-kill/restart test into the suite remains
follow-up; no real-world credential or session was used. The cell containers
and network were removed and checked by their explicit names.

## Maintained Approval issuer crash and STATUS restored-repository retake

On the working tree after `53aadef2c`, a single internally networked,
disposable PG/mTLS cell compiled Core and ran these tests sequentially:

- `elp210-native-current-relations-provider.spec.ts`, one selected test
  **PASS** (21 skipped): in addition to the prior full CurrentView composition
  and physical HTTP assertions, a TEST_ONLY issuer process sent two Approval
  sections under native custody, lost two synthetic source terminal responses,
  and was killed with `SIGKILL` after a persisted `SERVED` terminal. A new OS
  process recovered; the test compared the original base, terminal id/digest,
  source configuration and issue count. Its separate-process selected-read
  adapter, field permits, source and ACK are deliberately synthetic. The
  selected-read adapter for this crash subcase is not the production
  `CurrentViewCoreComposition`; that composition is exercised separately in
  the same selected test. This is neither connected Edge proof nor a grant.
- `command-source-assertion-pg.spec.ts` **8/8 PASS** with writer-created
  TEST_ONLY custody retained, then a PostgreSQL dump restored to another
  disposable database in the same cell.
- `command-status-populated-restore.spec.ts` **1/1 PASS** on that restore:
  original/context/lease/ACK rows and effective ACL matched, re-pinning the
  same writer-created original twice was idempotent, changed original and
  wrong workspace were refused, and all captured records remained unchanged.
  An unapproved down was refused. Raw ACL representation differed in one
  case while effective ACL matched; no approved operational rollback or real
  Edge acknowledgement is claimed.

Test-inclusive `npm run typecheck` passed on this working tree. Input SHA-256:
`elp210-native-current-relations-provider.spec.ts` `cf3708307ee6c6aef5f681b14a516ca5c2c5c248e4b113f704bad521519492dd`,
`command-status-populated-restore.spec.ts` `94c216b92125401d5e65e0bb63a10d7d3aa17b8a17728f2b33b6585015f7d268`,
and `native-approval-restart-child.cjs` `05bcdfcd66ae30a867b9dc0d0c451f7797cdb89095f6e7021dcfe3bbb3a66953`.
Node/PG image digests are the same as the earlier retake. The non-secret cell
runner is retained locally at
`/home/bobby/.local/state/portal-research-evidence/elp2-crash-restore-20261104/run.sh`
(SHA-256 `8f1653dd6e0f7eef4a91f793a52a90caf4c76b18c8b1f3319adfe6e77b5dbe47`);
it is not a remote or production artifact. Its containers/network and the
189 MiB temporary cell were removed. The normal monorepo hook finished with
exit 0 on test commit `fec700592a78c4e7a789fd18865c3a6d5ddcc550` (tree
`ccc6e48b0bc583a8f9223fb37367ad3eb5d3f7bc`); the portal monorepo verification
and execution tracking gates completed. The populated-restore test is opt-in
and was **skipped in the normal hook**; its separate 1/1 disposable-cell run
above, rather than the hook, is its execution receipt. The synthetic Approval
test remains distinct from connected production authority or an Edge ACK.

## STATUS completion retry on a restored database

An additional opt-in `TEST_ONLY` path in
`command-source-assertion-pg.spec.ts` paused immediately after the real Core
writer committed its synthetic source terminal and Edge-delivery ACK. The
bounded, internal-only PostgreSQL cell performed `pg_dump` and `pg_restore`
into a new database, then built a fresh Core authority using that restored
database and the same synthetic source mapping, credentials and original.
Through a pinned loopback mTLS transport, two exact completion retries each
returned the same completion; a different client certificate and a different
response digest were refused. The restored database retained exactly one
ACK and one lease with the same lease/attempt/terminal. The selected test
passed **1/1, 7 skipped**; the test process also verifies restart recovery on
the original database. The restored lease in this specific test is
`ROLLED_BACK`; this receipt does not prove a restored `COMMITTED` terminal or
the preservation of events and revocations after the snapshot. All source
terminals, source/field permissions, human
and mTLS identities are TEST_ONLY, not a real gateway ACK or a connected
acceptance. The issuer restored in this subcase is a fresh instance in the
same test process; separate-process recovery is tested by the surrounding case
against the original database, not by this subcase against the restored one.

The test file SHA-256 is
`3401cb30baafc19ff2ebf371ecfbde6236a2bb074bb8fc7d8b147ed31211d4d6`;
the non-secret runner is retained at
`/home/bobby/.local/state/portal-research-evidence/elp2-ack-restore-20261104/run.sh`
(SHA-256 `9173b63aa0fc7ec41f78a5f65b312381f19e98bfb64650718567346d47e4ac3c`).
Node/PG image digests match the earlier retake. The exact test container,
PostgreSQL container, network and owned temporary directory were absent after
cleanup. `npm run typecheck`, including tests and cross-loop TypeScript, also
completed with exit 0 after this test change. Its normal monorepo commit hook
finished with exit 0 on commit `1d34b4e5bbbd48bb98086039851e9dcd2dbaf7d9`
(tree `1b7439c634738e5e8d0728983694b0aede7848df`), including the portal
verification and execution tracking gates. The restored-database subcase is
opt-in and was not enabled by that hook: the separate isolated 1/1 run above,
not the hook, is its execution receipt.

## Legacy UDB DR schema guard

The historical UDB-04 harness compares a fixed legacy authority-table digest.
It omits Execution V2 access policy, native read custody and STATUS custody;
therefore matching that digest on an ELP2 candidate is insufficient to prove
safe cutover. The harness now checks for V2 authority/custody relations or a
migration at or beyond 0134 before touching test identities, again after
stopping its private clone's control API and before restore, and before
resuming reads. Missing or invalid probe results fail closed. This deliberately
refuses the old harness on V2; it does not implement V2 rollback or protect
source facts that arrive after a snapshot.

`node --test scripts/research-udb/legacy-dr-guard.test.mjs`, `node --check`
of the harness and `git diff --check` passed. A network-disabled, disposable
PostgreSQL image `sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`
ran the actual SQL and guard: legacy schema allowed; V2 policy table alone,
STATUS ACK table alone and a later migration ledger row alone each refused.
These were minimal synthetic schema probes, not a full DR rehearsal. The
explicit test container was stopped and verified absent afterwards.
SHA-256: guard `5a9f5a840d2b0f45021dcc4cfa667658c8adecfbbbddf4e819f9e3be42ef1c63`,
unit test `599a9c8d2b2b178fbe026dc6905da7dd105f1a982cac23da4a0212c3799d9db3`,
updated harness `e4af45741ab01c3f0852fd2f2a0ecd0e48060b81730c9f014a1b71af191587c6`.
The normal commit hook exited 0 for commit
`68f32714402bc10c891c22cfbc09eba5af608f52` (tree
`98709b52fa8f4eb17126ab84b3f9deba6cba0053`); its Control API suite reported
12,327 passed and 10 skipped. The later namespace follow-through was edited
in the working tree before this hook finished, while the commit index still
contained the earlier guard: this is not a frozen-clean-tree final-candidate
receipt. The first sandboxed attempt failed before
verification because it could not access Docker and is not a PASS.

### Independent candidate schema follow-through — working source

Review after starting that hook found a separate installer can create the
`elp210_candidate` custody namespace without a numbered migration. The guard
was extended to refuse that namespace even with an otherwise legacy ledger.
On a separate network-disabled PostgreSQL cell, the actual probe allowed the
empty legacy ledger and refused after creating only that namespace. Its exact
container was removed. The focused Node test passed. This extension is not in
commit `68f327144`; it was subsequently included in normal-hook commit
`48e675f06`.
Working SHA-256: guard
`10d584a67cf86a025c86a3cc141f8745df83ea299375d1d587239f06d25e5073`,
unit test `257ce3f452446a87781b4e8af7074d8f8cb55ff3a3a9bbfabea8a71facc3f4d3`.

## Restored COMMITTED terminal and separate Core process — working source

The separate disposable PG/mTLS runner restored a database containing a
TEST_ONLY `COMMITTED` terminal and its synthetic ACK. A fresh parent authority
and then a separate OS process both retried the same completion against that
restore; the same original, lease, attempt and terminal remained and the ACK
row count stayed one. Foreign certificate and changed digest were refused.
The selected test passed **1/1, 7 skipped**; the exact test containers,
network and owned temporary directory were cleaned. This is not an Edge ACK,
not a real gateway, and not preservation of post-snapshot revocations or late
source facts. The new process receives synthetic source mapping and test-only
keys over private IPC. The test and helper changes were subsequently committed
with the normal hook in `48e675f06`. `npm run typecheck` in the Control API,
including tests and the cross-loop project, exited 0 on the earlier test
bytes below; a later edit adds an exact terminal digest comparison and separates
the independent original-DB lane, so that result is not a final-source retake.

Earlier selected-test SHA-256: test
`991b080d3d5f540b258e58e0bf5f91e3ab4e123673e0aa6089aa5a5e14ef7496`,
child `5901223fd8a25efab1e3e36308584b2c1d569c2212b22e9bf6017ef176d96ac0`,
runner `/home/bobby/.local/state/portal-research-evidence/elp2-ack-restore-20261104/run-committed.sh`
`e0b98e0fb6822c705c2008c9b03c093bc39edd05c208e1f031892bb95d019a83`.

The next retake compared the original terminal digest directly with the clone.
Its first run failed after the clone checks, when an unrelated original-DB
restart crossed the test's 30-second context expiry under load. That failure
is not a PASS. The restore lane now returns after the restored-process checks;
the normal test still exercises original-DB restart independently. On the
revised test, the bounded PG/mTLS `COMMITTED` restore retake passed **1/1,
7 skipped**, including exact terminal digest and single-ACK comparison.
Its test SHA-256 is
`511ca352f731593d5ea4699dbe5d00114d31e69f33b46a7dfeff22e45c57d7d0`.
The owned test containers/network were verified absent afterwards. The final
typecheck subsequently passed, and the later bytes passed the normal hook in
`48e675f06` as specified below.
After that retake, the original-DB restart assertion was changed to compare
digests instead of printing its TEST_ONLY token/context on mismatch. Current
test SHA-256 is `e143d99634e56244a55c8079fb95a7dfb5e0ded89f1744a7656981adb70ebc87`;
the original-DB path needs its normal-hook retake on those bytes.

## Approval issuer crash with actual Core composition — working source

On 4 November the focused disposable PostgreSQL/mTLS test passed **1 selected,
21 skipped**. It sends two Approval sections from a single selected source
read through the actual `CurrentViewCoreComposition` and native custody to
physical HTTP, refuses a revoked dispatch with zero response bytes, loses the
synthetic source acknowledgement, kills the issuer OS process and recovers
the same durable original and terminal in another process without issuing a
new source lease. Its metadata, source response, field policy and private test
credentials are synthetic: no Edge field authority, real source lineage or
connected ACK is claimed. This is not a database restore rehearsal.

The first attempt's test result was lost in verbose migration and cleanup
output; cleanup also encountered root-owned build files. It is not counted.
The exact owned temporary directory was removed after verifying its container
was absent. The runner was updated to quiet migration output and remove only
its own validated temporary directory; the passing retake exited 0 and its
test containers were verified absent. A subsequent name/ID check also found
the earlier interrupted cell's 14 MiB temporary directory with no matching
container or network; that exact owned directory was removed. Working source hashes: test
`ff5533f9f3f83b6c11a218ee424e917dbdb68212a1d3bfa0606c404205a43f4f`,
child `e7375a9a8f8ce9b56610fc32342028807d488c9112e5052b8a109f2e012d06d2`,
runner `ad18610373220d64ec0a667d548ddccd07e2991c7f6b523380d3727c0af4aa4e`.
The two test files were subsequently committed in `48e675f06`. A Control API `npm run typecheck`,
including tests and the cross-loop project, subsequently exited 0 against
these bytes and the staged STATUS/guard follow-through. The normal hook for
`48e675f06b7102bb62e98dc448b98b404d0ffeca`, tree
`690722203b90b901ebcd70354d4959e2ac9ff435`, exited 0; Control API reported
584 files / 12,327 tests passed and 5 files / 10 tests skipped. These opt-in
isolated retakes were separate; they are not counted as tests run by the hook.
Unrelated documentation WIP remained present while the hook ran. This does not
establish the deployed runtime, source authority or final connected acceptance.

The final committed STATUS test SHA-256 is
`e143d99634e56244a55c8079fb95a7dfb5e0ded89f1744a7656981adb70ebc87`.
The opt-in COMMITTED restore retake used the earlier test bytes explicitly
recorded above; the later change affects the separately exercised original-DB
restart assertion, and the normal hook covers that original-DB path. Neither
the hook nor this receipt upgrades a synthetic ACK into an Edge ACK.

## Expanded V2 restore inventory and stale-snapshot diagnostic

The disposable PostgreSQL/mTLS runner built the current source and produced
writer-created synthetic custody: `command-source-assertion-pg.spec.ts` passed
**8/8**, then a custom dump was restored into a second database in the same
isolated cell. `command-status-populated-restore.spec.ts` passed **1/1**.
It compares rows and scoped owner/effective ACL/RLS/trigger metadata for the
four STATUS tables, the candidate lease, identity/session/workspace records,
V2 policies and grants, native obligations, candidate authority/mutations and
events, Manager fences and trusted commands. One raw ACL representation
changed while the checked effective ACL remained equal.

In a rollback-only transaction on the disposable source, a synthetic authority
revision was advanced and a new TEST_ONLY pending mutation was inserted. The
original STATUS-only snapshot still matched the restored copy, while the V2
authority, mutation and mutation-event snapshots differed. Both synthetic
writes were rolled back. This is a diagnostic of a stale snapshot, **not** an
actual revoked grant, real Edge fact, production recovery barrier, safe
cutover decision or operational rollback. A source-independent authority
checkpoint, quiescence, lease fencing and reconciliation of post-snapshot
facts are still required before an actual cutover.

Inputs: test SHA-256
`957e8db39be97f5e78e78ffdc354b769428f1590ec7c7f5c99ed07258d2c58f0`;
local runner `/home/bobby/.local/state/portal-research-evidence/elp2-crash-restore-20261104/run-v2-inventory.sh`
SHA-256 `24d8f20b483c640a6989c66de79b7fe04343a53faea5a4960ad9e8c31ccf66cf`.
Node/PG image pins match the runner. The owned containers and network were
verified absent after exit 0; the runner also removes its validated temporary
directory. Control API `npm run typecheck`, including tests and the cross-loop
project, subsequently exited 0 with these test bytes. The added test is in
`02086aae876838ed23dafb8411aa9360d89f1704` (tree
`c51662101bd4edcdcc2206dfd7f210b058ff059d`); its normal monorepo hook
exited **0**, including Control API, contract and tracking gates. The
opt-in restore test was skipped by that hook: its **1/1** result above is
from the separately executed disposable PostgreSQL cell, not hook coverage.
The hook's exact named Control API test containers and network were absent
after exit. No source-connected acceptance or installed runtime is implied.
