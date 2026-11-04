# Sibling pagination and preview migration rehearsal — 3 Nov

Status: **IN PROGRESS; not commissioned, not connected, not phase closure.**
Base `docs/research-loop-plan@23f9bb623`. Bobby assigned the five independent
backend packages together; the banner follow-up and three untracked Edge
mailbox documents already existed and must be preserved.
Verification for this documentation-only checkpoint: R0, scoped diff/link and
execution-tracking checks. Backend source changes are still local and uncommitted;
their final normal-hook gate is outstanding.

## Private pagination preparation

`sibling-page-cursor.ts` provides authenticated, encrypted, fixed-size,
short-lived continuations with bounded key rotation. It binds workspace,
principal, session, environment, family, target, app/field-policy revisions,
source set, snapshot, query and page size; source coordinates are not exposed.
`sibling-paged-source.ts` validates a page against the existing exact source
seam, limits item counts, refuses changed scope/snapshot or non-advancing
source, rejects duplicate identities within a page and rechecks authority
before/after source I/O. Binding and scope are
captured before the await.

This is an **internal component only**: V1 public schemas still have no page
contract. It does not hold current authority through HTTP egress, mount routes,
qualify source/field policy or supply live data. Before it is used, define a
versioned contract and exact multi-collection semantics, bind a server-derived
snapshot/current authority, commission an Edge source, and retain source and
field custody through actual response delivery. Stable ordering and absence of
cross-page duplicates require source proof; the per-page check does not prove
either. Never infer a grant from a
valid cursor. The existing V1 incomplete-source refusal remains unchanged.

Focused suites: sibling cursor, paged source and original seam **21/21**.
The current TTL is also enforced on previously issued cursors after a TTL
reduction; a longer old token is refused rather than silently grandfathered.
The source seam also refuses terminal newlines on identifiers, decimal values
and state codes; JavaScript's `$` anchor alone otherwise accepts a final line
terminator. The regression checks refusal before source access for a bad ID.
An additional group covering financial source composition/bootstrap/
commissioning, batch financial mapping, Approval Evidence and command STATUS
bootstrap/runtime passed **218/218** in an elevated local loopback environment.
The first sandbox run was **217/218**: one listener test failed to bind; it is
not a PASS. Neither group is a connected Edge or browser receipt. Full current
candidate typecheck/hook and deployment are separate gates.
The broad local `tsc --noEmit` exited 2 with numerous diagnostics in existing
test/frontend imports (including JSX outside the backend compiler settings);
it is not counted as a PASS. The production build tsconfig subsequently exited
0, but it was running while the last duplicate-identity guard was added; do
not treat it as verification of the final source. A subsequent strict,
`--skipLibCheck`, ES2022/CommonJS TypeScript check with all three sibling
source entrypoints was rerun after the newline guard and exited 0. Execution
tracking passed before this follow-through; the full hook remains open.

First-checkpoint local source SHA-256: seam
`575291239c78d7f647aeb4d4ba2ff1c02323db843dd13370fb9c9b77bc2a7e0f`; cursor
`f0e33e2ad3adc6b98c4ec17e3fcd58be32f35db0a1a4bf582c011b6f197c63e1`;
paged source `bf296359318117bb0f20c2520026b96d921fe26f0d8abf1fe9bc9e5f499a67b5`.
The uncommitted backend slice is additionally preserved in the private mode
0700 directory `/home/bobby/.local/state/portal-sibling-20261103-FkSPuvWf`:
tracked patch SHA-256 `5b876ed2bf73e2f05f65f3d8c51744e01d3bf270198eb48a6f720c37634fc6a5`;
four untracked source/test files archive SHA-256
`04a8583a1f870d3b5c80c1ce9feb20e76b4dd83eed1c79c67e0f12b9b36aaa74`.
This point-in-time local preservation is not a commit or remote backup.

### Follow-through: source snapshot versus asynchronous revocation

The private seam previously held the source-owned mutable response object
across its final asynchronous authority check. Another task holding that same
object could alter the records or declared scope after the source returned.
The seam now validates and deep-copies the source body and validates its exact
scope synchronously before that await. A failed final authority check still
wins over both the captured data and any captured source error. Regression
tests exercise mutation of a nested financial figure and a paged obligation
during the authority check, plus a revoked caller with a malformed source.
Sibling seam/cursor/page tests passed **25/25**; strict TypeScript on the three
source entrypoints exited 0. These are local checks: the genuine field/source
authority, physical egress fence and HTTP routes are still NOT DELIVERED.

Current seam source SHA-256
`dfba787de5c719ee041c5b207fcc8d045ddb771d39c19a2c2197c8f8d30eaca6`.
Updated uncommitted code is preserved separately under mode-0700
`/home/bobby/.local/state/portal-sibling-20261103-next-1Vu4QWxn` (tracked patch
`72a42845ab5b004893e264bf41a2ca1f7a2a872f02d8c475eccf20f09502d05b`;
untracked archive
`e91da2f3705e8ca13209b9bb7f75d06b611710282f40ab8136927a57ca42157f`).
This does not change or supersede the actual database backup.

### Follow-through: source text and Account360 decimal boundary

The seam now rejects trailing control characters in text fields, including
workspace and source currency, consistent with the existing OpenAPI grammar.
The existing Manager CURRENT Account360 source adapter also rejects a decimal
with a trailing line terminator before native dispatch. No amount is repaired
or converted to zero. The private reader/cursor suites and Account360 suite
passed **67/67** together. The STATUS TLS loopback suite initially failed
18 tests because the sandbox refused `listen` with `EPERM`; rerunning that
same suite with loopback permission passed **18/18**. These synthetic tests
do not commission a source or prove process-restart recovery.
Strict source-entry TypeScript for the three sibling modules plus
`manager-current-accounts.ts` exited 0. Current uncommitted source/tests and
tracking snapshot are preserved in the private directory above as
`sibling-accounts-followthrough-20261103.tar.gz`, SHA-256
`242777fca27ca5e82cc016cb16ae7bf4a7f80b1e556cd47e92b703bf9428494d`.

### Source-dark HTTP routes and contract parity

The four named GET routes are registered in the local application through
`SiblingSourceDarkController`. SessionGuard and workspace/environment access
run before the fixed refusal; valid requests receive 503 and no record,
unauthorized workspace receives 404, and malformed query receives 400. No
provider is injectable into this controller and membership is not treated as
order/field authorization. It deliberately has **no positive reader, cursor
wire, source mapping or native HTTP egress**. Native-Research's independent
route allowlist may refuse even the dark route; it was not expanded.

The generator now documents these four dark routes (other siblings remain
contract-only) and aligns their problems with session/profile/infrastructure
errors and 403. The four OpenAPI files and generated TypeScript DTOs were
regenerated. Synthetic Fastify tests check 401/404/400/503, private no-store
and problem-schema compatibility for each route; they do not qualify native
authority. Sibling/account suites: **72/72**; sibling contracts: **96/96**;
Approval, financial runtime/commissioning and STATUS synthetic/loopback
regressions: **188/188**; the STATUS authority's existing fail-closed restart
and original-custody suite additionally passed **45/45**, without implementing
the missing cross-process continuation. An initial contract suite failed four stale
`CONTRACT ONLY` descriptions; the test now distinguishes source-dark routes
from unmounted contracts and the rerun passed. No API image was built/installed.
`generate-execution-siblings.mjs --check` exited 0. A new strict typecheck
starting from the controller's dependency graph was interrupted after running
for several minutes, so it is **NOT RUN TO COMPLETION**, not PASS. The old
source-only TypeScript result does not cover this controller. The normal hook
also remains pending on the final integrated candidate. All route, contract,
generated and associated test changes remain uncommitted in this working tree.
An additional private source/contract snapshot is
`sibling-dark-route-20261103.tar.gz` in the directory above, SHA-256
`f32c09d24896abc802c8b74fe71d73dab2a1e170b8a9e6adf933b3bd1e1f2265`.

The paged source also validates a source-supplied continuation with the same
bounded coordinate grammar as the cursor codec. Invalid or oversized source
coordinates now return `SIBLING_SOURCE_INVALID`, not an error incorrectly
attributed to the client's cursor. This is an internal seam; there is still no
mounted page API or HTTP egress custody. The six current source/test files and
this receipt were additionally archived as
`sibling-working-tree-20261103.tar.gz` in the private directory above; archive
SHA-256 `d5ff1555e4384f9e12a29c5fcbee26726f05f67dbd1a41acf844635b50302fd3`.

Read-only review of the Edge candidate
`feat/core-current-policy-wire-20261024@6c63d6523a11736e15e9d6e3f62b51c91078c853`,
`services/portal-execution-edge-rs/crates/edge-service/src/command_status_http.rs`,
confirms the ACK-only retry is held in an in-memory `Flight` keyed by the
verified original context. Edge obtains the actual original from its store,
but that alone does not reconstitute the lost flight or Core's vanished
context after restart. Neither endpoint was exercised against a connected
source. Cross-process recovery requires a jointly authenticated durable
original/lease/terminal/ACK reconciliation, with current authorization and no
replacement ISSUE; the candidate has not implemented or qualified that path.

## Actual preview snapshot → disposable migration rehearsal

Read-only inspection of the Research preview `portal_control` database observed
731 MB, latest ledger `1723680000154_execution-operation-health-publication`
and 148 recorded migrations. A `pg_dump -Fc` backup was stored mode 0600 in
the mode 0700 private directory
`/home/bobby/.local/state/portal-preview-migration-20261103-EevDSNOc`;
`preview.dump` SHA-256 is
`324fb9f35dbb606773010af310caf1261e386abc6cb57be3abaf378f9f8c15c8`
(30 MiB). This is a timestamped snapshot, not a guarantee that later preview
writes are in it. Do not commit or transfer its contents.

First restore failed because the isolated PostgreSQL lacked the named RLS role
`portal_research_runtime`; it was discarded. The second attempt created only
that **NOLOGIN** role in the isolated, no-network PostgreSQL cell, restored
the same archive with `--no-owner --no-acl`, and invoked the previously built
Control API image `sha256:cf60a6044b8b331d834cba4e8232e581a90c90b7d3a8f8e3a83dfcef22d76971`
against the clone. Its actual migration CLI applied 0155 and 0156 successfully.
The identity/session/audit/grant/command counts compared before and after
were `2|19306|19592|7|0` in both cases; both new tables and ledger entries
existed. The disposable container was removed. The live preview database and
API were **not** changed.

An additional isolated restore/migrate of the same backup compared a sorted
row-content digest as well as counts before/after for seven tables:
`portal_users`, `auth_sessions`, `auth_audit_events`, `portal_access_grants_v2`,
`execution_trusted_commands`, `portal_native_root_obligations` and
`portal_native_current_read_obligations`. All seven matched; the last three
were empty in this snapshot, so this is not a positive custody-data test.
The cell was removed on completion.

The initial two rehearsals deliberately omitted ownership/ACLs. A subsequent
full-ownership/full-ACL restore and migration on another isolated cell completed
with exit 0. For 844 schemas, relations, functions and column-ACL entries in
the inspected namespaces, owners and effective privileges normalized via
PostgreSQL's `aclexplode`/`acldefault` matched the source and restored copy
(`5f0d93f1ad03d46d497faeaaad788911`), and all pre-existing normalized entries
remained after 0155/0156. Raw ACL strings did differ: the restore made some
implicit owner defaults explicit, which is why raw equality is not asserted.
The private test log is `acl-rehearsal.log` in the backup directory. The same
seven selected-table row-content checks matched. This does not establish all
database/global-role/default-ACL/policy properties or positive custody recovery;
the relevant original custody tables had zero rows. The disposable cell was
removed. No live database or preview image was modified.

The first additional global-role comparison **failed**, correctly: the source
`portal_research_runtime` role has `NOINHERIT`, whereas the first clone role
was created with PostgreSQL's default `INHERIT`. The preceding 844-object ACL
match must not be misread as proof of equivalent role membership semantics.
The mismatch was confined to the disposable role; the source was not changed.
The follow-up created it `NOLOGIN NOINHERIT`, matching the observed source,
then repeated the full restore and 0155/0156 migration with exit 0. Database
ownership/effective ACL, non-built-in role attributes and membership,
default ACLs and row policies in the inspected namespaces matched before
migration; existing entries remained after migration. No role passwords or
credentials were read. The wider check remains scoped to these metadata and
the timestamped backup, not all possible PostgreSQL cluster objects.

The same follow-up inserted one synthetic UNKNOWN ROOT and one synthetic
UNKNOWN CURRENT obligation into the disposable clone only. Their content
digests matched across the forward migration and both delete guards refused
deletion. These are test-only records, not source terminals, ACKs, real
custody recovery, or evidence that a populated live-source custody table has
been restored. `security-custody-rehearsal-v2.log` in the private backup
directory records the check and cell cleanup.

Before real installation, take a fresh verified backup and separately validate
remaining database/global role and policy properties, positive custody/recovery
and full relevant content; choose a rollback which preserves 0156 append-only
ACK custody. The PostgreSQL image was the same digest as preview,
`sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.

Resource observation after the final rehearsal: root filesystem had 118,291,292
of 650,206,116 KiB available (below 20%). Read-only Docker inventory reported
73.98 GB of images as reclaimable, but that number does not identify active,
rollback or other owners' images. No image, cache, backup or volume was
pruned. Per repository rules a documented capacity decision or quiet cleanup
is required before another disk-intensive build or release.

## Open backend work and Claude handoff

1. Implement/mount four sibling readers only after source/field authority and
   egress custody are correctly composed. Publish any new page wire schema and
   generated DTO before asking Claude to consume it.
2. STATUS still lacks authenticated continuation of a vanished in-memory
   context across processes; preserve the same original, lease and terminal/
   delivery proof. Do not create an intent or ACK as a recovery shortcut.
3. Financial and Approval Evidence local tests above are not publication proof;
   actual carrier, ownership/census, field grants and APPLIED→ACK remain open.
4. Rehearse migrations/restore against an isolated copy before installing any
   new preview Control API. The earlier normal hook passed on `23f9bb623`
   (12,176 API tests, eight skips and disposable restore); it does not cover
   the new cursor files and must not be attributed to this working tree.
5. G2/coexistence needs the approved target, bounds and calibration. Claude can
   continue fixture UI, but this slice introduces **no frontend DTO yet** and
   does not claim browser or real-source acceptance.

On 3 Nov, read-only SSH checked the Edge worktree at
`feat/execution-edge-upgrade-v1_2@636d58a7` and the EPG10-08 mailbox. Its
newest listed material remains dated 28 Oct; no newer binding or qualification
receipt was found there. The Edge checkout has other tracked and untracked WIP;
it was not changed. This is a mailbox observation, not proof that no other
source authority has any newer information.

No command or Live activation, dev/main/stable mutation, remote push or UI
component changes are authorized by this private preparation.

## STATUS durable correlation follow-through — source only, 3 Nov

The candidate adds migration `0157`, an append-only link recording only
digests of the context, original, exact call and source binding, plus the
receiver, delivery sequence, previous lease, request digest and context expiry.
For the real STATUS assertion issue path the link and its issued lease are
inserted in the same authority transaction. A successor requires the exact
previous link and a persisted delivery ACK for the same request, principal,
session, workspace, environment and workload. The database lock and existing
source terminal / current-human guards remain in force. No bearer context,
original payload, source receipt or ACK is manufactured or stored in the link.

This is **not** cross-process STATUS recovery: the original context and issued
assertion are still in memory, and the code still fails closed after a process
restart. Existing pre-0157 leases cannot be silently backfilled or recovered
from this table. Before commissioning, settle or explicitly disposition all
such in-flight obligations and evaluate bounded retention. Migration 0157's
down path intentionally refuses to delete custody; a safe rollback needs an
approved archive and a tested compatible recovery procedure. The candidate is
not installed; no connected source, real ACK, release or full phase PASS is
claimed.

Focused checks on this working tree: command assertion/composition **73/73**;
real disposable PostgreSQL candidate suite **107/107**, including the new
atomic link/immutable row/same-original successor negative and simulated
restart test. That test checks persistent link and ACK fencing, **not** actual
cross-process continuation. A separate real-PG mTLS suite was attempted but
its safety guard rejected the loopback cell (`COMMAND_STATUS_DISPOSABLE_DATABASE_REQUIRED`):
**0/4 counted as passed**. Do not relax or bypass its guard; rerun in its
designated Unix-socket or Docker-network cell. Migration 0157 has only been
applied to the disposable database, not to a restored production-like copy;
repeat the restore/ACL/role/custody rehearsal on the final candidate. Receipt
and source are currently uncommitted; no new frontend field is handed off.

The R2 capability ledger check initially exposed four missing inventory rows
for the newly registered source-dark shells. The ledger now names all four
as unconsumed, source-dark, not positive readers, and corrects its stale route
count. The same focused ledger check then passed **22/22**. The disposable
PostgreSQL container and its test-only tmpfs data were removed; no shared
database, volume, image or service was removed or modified.
Full Control API `tsc --noEmit --incremental false` was stopped after several
minutes while still running (exit 130, no diagnostics); it is **not PASS**.
No normal hook was run for this still-incomplete candidate.

Follow-up full `tsc` completed with **exit 2** and many diagnostics, including
the route-shell environment narrowing and a new table-driven test signature;
both identified new errors were corrected. The full configuration also
typechecks existing test imports crossing into frontend without JSX/DOM
settings and reports many additional diagnostics; their baseline versus
candidate provenance has not all been established. Do not count full
typecheck as PASS. The repo's build-source check
`tsc -p tsconfig.build.json --noEmit --pretty false --incremental false`
subsequently completed **exit 0**; it excludes tests and is not the full
typecheck or normal-hook/full-gate, which remain outstanding.

Subsequent guarded mTLS/PG follow-through: reran the original four-test suite
without changing its guard, using an isolated `--internal` Docker network,
the guard's `control-api-test-postgres-*` DNS name and disposable
`portal_control_test`, PostgreSQL image
`sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`,
and the source mounted read-only in the test runner. **4/4 passed** (real
test-only PG and pinned mTLS). The first runner attempt failed before tests
because Vite required a writable cache; the passing rerun mounted only the
Vite cache directories as tmpfs. This neither changes the earlier fact that
the loopback attempt was rejected nor demonstrates context recovery across a
new authority process or an actual Edge/source acceptance.

An additional STATUS fence now refuses issuance for an original with any
unacknowledged delivery even when a restarted caller changes the request
digest or context; legacy unlinked leases retain their exact-request fence.
The 107-test candidate and four-test guarded mTLS/PG suites were then rerun
together against a fresh disposable network/database: **111/111 passed**.
The network and database container/tmpfs were removed. This is still a fence,
not the missing authenticated reconstruction of the original context.
The focused PostgreSQL candidate test additionally executed the **actual**
0157 down-migration SQL, confirmed its deliberate archive-required refusal and
verified that the linked custody row still existed afterward. One selected
test passed; the other 106 in that focused invocation were not run. This is a
destructive-rollback guard check, not an approved archive or restore rehearsal.

Source-only field-authority preparation now permits a server-owned selection
to request specific names from the separately governed record-detail
vocabulary. `prepareNativeCurrent` and each current-view decision check those
names with `scopeAllowsDetailField`; ordinary business fields are unchanged.
Native selections sharing one purpose union the required detail fields before
authority admission, so an unauthorized second selection cannot be dropped by
deduplication. The synthetic/loopback authority and composition suites passed
**58/58**, including a permitted field, forbidden and duplicate names,
detail-field revocation during the native flight before dispatch, and the
shared-purpose negative. This supplies a field-authority
building block, not a producer, mounted positive reader, real native egress
receipt or change to browser-facing DTOs.

Further affected regressions passed **206 tests** across 11 suites; the
additional real-PostgreSQL scope suite was skipped in that no-DB run, then
ran separately in a fresh disposable internal-network cell and passed
**119/119**. The cell's PostgreSQL container, tmpfs and network were removed.
These results do not prove a commissioned source or physical Edge acceptance.

Remaining Core work, independent of Edge, is the positive four-reader field
authority and physical HTTP custody composition and authenticated STATUS
context continuation/recovery with exact original/lease after restart. Then
run the guarded end-to-end local suite and integrated candidate gate. Source
ACK, financial/Approval proof and connected browser acceptance require the
actual commissioned Edge lane and are not represented by synthetic tests.

### Account-profile follow-through (conditional, not commissioned)

The later working-tree change supersedes the statement that all four routes
are only shells: the account-profile route can use the **existing** explicitly
commissioned Paper Manager CURRENT Account360 composition. It checks workspace,
selects only the requested account identity grain and its exact source resource,
without reading balance grains, and performs the
existing business-field/current-human authorization and native finite egress,
and hands HTTP ownership to the native sender only immediately before physical
dispatch. It projects only the source-validated account identity and Portal
read clock. It does not infer product, network, margin, wallet or equity from
balance rows; those optional fields remain absent. No arbitrary source port or
environment flag can enable a positive result. Without native composition the
route still returns typed 503. The other three siblings remain source-dark.

The OpenAPI generator, generated account types and synthetic identity-only
fixture record this limited path and its authority/source 409/503 refusals.
Focused synthetic HTTP/adapter/source-seam tests passed **65/65**, including
approval expiry immediately before native handoff; the HTTP
test double is not real custody or a connected source receipt. Contract tests
passed **97/97** after updating the old assertion that this route was always
dark; the first run of that assertion failed and is not counted as a pass.
The R2 route/persistence ledger regression passed **22/22** after reflecting
the conditional account projection.
The source-only Control API `tsconfig.build.json --noEmit` was rerun after
the profile composition and exited **0**; it is not the full typecheck/hook.
The account path
still requires an installed qualified publication, policy, trust and Edge lane
before it can be declared available on a running candidate. No browser or
financial-source acceptance is implied. STATUS restart reconstruction, the
other three positive readers, full typecheck/hook and final migration/restore
rehearsal remain open.

### STATUS completion after Core process loss — bounded local follow-through

The later source-only candidate supersedes the blanket statement above that
*all* restart reconstruction is absent. Migration 0157 also retains the
authority fingerprint of the original authorized call. When the in-memory
context has disappeared, the completion endpoint can now match the presented
context digest, exact sequence and lease to the persisted original, command
and source binding. It checks current human authority before and after reading
the original through the internally composed Edge STATUS source. It accepts
only the same authenticated receiver/workload and a terminal confirmed by the
existing candidate; the exact response ACK is idempotent. A changed original,
authority, binding or response, an unresolved terminal, revoked human, or an
expired context is refused. Neither a new intent/lease nor a source terminal
or Edge ACK is synthesized. Tokens, original payloads and private keys are not
stored in the correlation table. Recovery is inactive unless the existing
STATUS composition binds its commissioned source and contract.

Focused authority/composition tests **81/81** passed, including changed
authority before and during recovery. Guarded mTLS/PostgreSQL tests **5/5**
passed in an internal-only, disposable Docker cell with the source mounted
read-only: one test started a separate OS process with a fresh database pool
and no in-memory context, verified a foreign mTLS peer was rejected, then
completed and retried the exact ACK after a signed test terminal. It confirmed
one ACK, one original lease and no command mutation. Test trust, relations,
original and source terminal were synthetic; ephemeral test keys travelled
only over local test IPC. The cell container, tmpfs and network were removed.
The related disposable PostgreSQL candidate suite passed **107/107** on the
same source change. These receipts do **not** prove a genuine Edge ACK or a
connected source. The recovered completion currently requires an unexpired
original context and valid current-human authority; previously issued leases
without a 0157 correlation are not backfilled.
The source-only Control API build typecheck was rerun after this recovery
change and exited **0**; the full test-inclusive typecheck and normal hook
remain separate, outstanding gates. A further full typecheck was stopped
after more than five minutes without diagnostics (exit 130), to avoid keeping
a multi-gigabyte gate running on an unfinished candidate; it is not PASS and
does not replace the earlier full-typecheck exit 2.

Still missing: replay/continuation of the outgoing STATUS transport after its
own process loses the prepared in-memory context, recovery beyond the original
context expiry, genuine original/terminal/ACK interoperability with Edge,
three other positive readers with native HTTP custody, the integrated normal
hook and final-candidate migration/restore and rollback rehearsal. No runtime
or schema has been installed and no command or Live operation enabled. The
worktree remains uncommitted; Claude can continue fixture/UI work without
assuming these readers or a real Edge source are available.

### STATUS lost-ISSUE response after restart — local candidate, 3 Nov

The digest-only 0157 link now additionally commits a digest of the exact
EdDSA assertion **in the same transaction** as its original lease, before
the assertion can be delivered. No bearer is stored. An authenticated Edge
retry of the original context and exact issue request on a new Core process
can recover only the same still-ISSUED lease: Core rechecks the current human,
source original and binding, reconstructs and signs the original claims, and
requires the resulting token digest to equal the committed digest. A changed
key/header, request, original, previous lease or authority, expiry, drain or
an entered/retired lease refuses the retry. No second lease or attempt is
created; this does not permit a successor without the separate real ACK and
terminal fences. Signing for this linked STATUS path is local and occurs
inside the existing authority transaction so a crash cannot expose a bearer
without the durable digest; other issuance remains unchanged.

Focused authority/composition regression passed **85/85**, including expiry
immediately before the replay response. A fresh isolated
PostgreSQL/mTLS cell passed **112/112** across the candidate and assertion
suites, including a separate OS process retrying the exact assertion over
pinned test mTLS, comparing all bytes, checking only one lease, refusing
changed request/foreign peer and refusing issue replay after ENTER, followed
by UNKNOWN refusal and exact completion after a test terminal. Candidate
tests also refused a different signing key and checked digest-only persistence.
The test source/original, keys and terminal are synthetic, not connected Edge
evidence. Its dedicated container, tmpfs and internal network were removed.
The test command held the campaign heavy lock; an earlier standalone cell in
the preceding subsection was run without that scheduling lock, and its
overlap with other work was not independently established. Future PostgreSQL
cell commands use the campaign lock and no heavy job is queued behind it.

The 0157 immutable-link table additionally rejects `TRUNCATE` as well as row
updates/deletes. The first combined regression found that the shared test
harness tried to truncate it: **1 test passed, the second suite failed before
tests**. The harness now leaves these uniquely keyed rows for the lifetime of
the disposable test database, without disabling triggers; destroying that
database removes them. A new isolated run passed the **two selected tests**
for the immutable link and two-process retry (110 other tests skipped). The
previous 112/112 run preceded this trigger/harness correction and is not a
full rerun of the final candidate. Its cell was also removed. A subsequent
fresh internal-only PostgreSQL run **did rerun the final trigger/harness
candidate: 112/112 passed** (107 authority tests and five PostgreSQL/mTLS
tests), using the heavy lock, one test worker and bounded containers. The
temporary cell and network were removed. Two earlier attempts in this rerun
failed before any tests: an unsupported Vitest option and a read-only config
cache path; neither is counted as a test pass. The successful run used the
Vitest runner configuration loader and disabled its cache.

After those source changes, Control API production-source typecheck
`tsc -p tsconfig.build.json --noEmit --pretty false --incremental false`
completed with **exit 0**. This is not a test-inclusive typecheck, a normal
hook, or a typecheck of the frontend.

The three focused outbound transport, assertion and composition suites later
passed **103/103**, including 18 local loopback mTLS transport tests. A first
sandboxed attempt reported 85 passes and 18 failures because loopback listen
was denied (`EPERM`); the permitted loopback rerun passed. These tests do not
change the documented missing outbound prepared-context restart recovery and
are not an external Edge receipt.

The earlier timestamped preview backup (`preview.dump`, SHA-256
`324fb9f35dbb606773010af310caf1261e386abc6cb57be3abaf378f9f8c15c8`)
was independently restored into a fresh private PostgreSQL cell with the
Research runtime role `NOLOGIN NOINHERIT`. The actual **working-tree** Core
migration runner applied 0155, 0156 and 0157, and the clone ledger contained
all three. A sorted per-row-content digest and count matched before/after for
seven selected identity, audit, grant, command and native-custody tables; the
three command/custody tables were empty in this source snapshot. The Research
runtime role had no SELECT, INSERT, UPDATE, DELETE or TRUNCATE privilege on
the new link table in this clone. `TRUNCATE` and the actual 0157 down SQL
both refused with their expected guard, and the link table remained present.
The restore and migration used the campaign heavy lock; the cell used an
internal-only network, a 1.5 GiB PostgreSQL tmpfs and bounded test containers,
and was removed with its network afterward. No live source was modified.

This is a **preliminary clone rehearsal**, not final-candidate rollback or
proof that a populated original custody table is restored: the backup is not
fresh, the current source is uncommitted, the test did not repeat the entire
earlier 844-object ACL/security comparison, and the safe archive/restore path
for real 0157 custody remains to be approved and demonstrated. Runtime install
still requires a fresh verified backup and complete candidate gate.

An additional rollback-compatibility probe restored the same **old** preview
dump into another disposable internal-only cell, applied working-tree
0155–0157, inserted one explicitly `TEST_ONLY` 0157 link, and ran the migration
CLI from the old image
`sha256:cf60a6044b8b331d834cba4e8232e581a90c90b7d3a8f8e3a83dfcef22d76971`.
The old CLI exited 0 with `No migrations to run!`; afterward the 0157 ledger
row and the synthetic link both remained present. The first attempt stopped
before restore because PostgreSQL reported ready before its test database was
created; a new disposable cell waited for an actual query and completed the
probe. Both cells and networks were removed. This uses `--no-owner --no-acl`
on the clone **only for this CLI-order experiment**: it does not establish
ownership/ACL parity, old application behavior, custody recovery by that old
image, or an operational rollback. In particular, an old binary not knowing
0157 must not be assumed to recover outstanding links; final rollback still
needs an approved archival/reconciliation procedure and the complete gates.

This closes only the **Edge callback retry of an already ISSUED assertion**
and the previously documented bounded completion retry. The Core outbound
transport still loses its own prepared context after process restart; the
original context must still be retained by the authenticated Edge peer and
must be unexpired. Real source original/terminal/ACK, three remaining native
sibling projections, candidate-wide typecheck/hook and final restore/rollback
remain open. No runtime/schema installation, command activation, push or
production mutation was performed.

Uncommitted working-tree pins for this follow-through (SHA-256):

- `command-source-assertion.ts`: `d2f266bc907e97a4e468c0760934b571a8fa2a55a9d0211c487244b2143fa93a`.
- `current-human-candidate.ts`: `38c490335d7cafea4f16633a21ceb6745902b881f51a121d4d337c7f73cb2f5c`.
- `command-status-composition.ts`: `6529d2425b867ee612b24dc0042355cf0b0694e739c17f4e59e865dd56023334`.
- Migration `0157`: `35457748d0a39da6d11180fae40290811cd6aefe0c2e5080ba6e8df13e29734a`.
- `test/harness.ts`: `6fb9568fef9e0eca394b9d3753430efb7f16454ed9fb47366ce2d29b0d691eda`.

Read-only Edge catalogue check (HK worktree HEAD `636d58a7c436`, dirty
parallel worktree preserved):
`services/portal-execution-edge-rs/contracts/maximum-data-return-v1/SCREEN_FIELD_SOURCE_COVERAGE.csv`
labels the reconciliation-finding surface `EXISTS_BUT_NOT_SAFE_TO_EXPOSE`,
with `E2_SEQUENTIAL_SHAPE_UNQUALIFIED` and named-scope query-plan/ACK evidence
still required. The separate E5 catalogue calling an adapter implemented is
not itself a runtime, field-authority or source-receipt qualification. This
is concrete evidence against turning the reconciliation shell into a positive
reader merely because a relation is listed; it does not dispose of order or
obligations. HK was read-only and its dirty files were not modified.

An additional read of the same Edge coverage catalogue identifies the
`orders.list` surface as `EXISTS_BUT_NOT_SAFE_TO_EXPOSE`,
`E2_SEQUENTIAL_SHAPE_UNQUALIFIED`, with a resource-scoped query plan and ACK
clocks required. `orders.fills` is `EXISTS_NOT_PUBLISHED`, with named resource
keyset and correction semantics still required. These are order/fill source
capability facts, not proof that a Core order-detail relation is authorized;
neither supports publishing a positive order detail yet. The obligation source
and its current resource authority still require a separate exact check.

### Same outbound context after an authenticated callback — 3 Nov follow-through

The uninstalled 0157 candidate now also records **only hashes and issue time**
for the outbound STATUS JWT/request, in the same transaction as the linked
lease. When the authenticated, pinned Edge peer still has the original
context and retries ISSUE or exact terminal completion after a Core restart,
Core checks the live human, independently read original, original/call/lease,
deadline, signing key and token digest. It re-signs the exact old EdDSA token
and restores the same outbound context for a subsequent matching Core prepare;
neither a replacement context, lease nor ACK is invented. A restored context
routes further ISSUE/completion callbacks through the durable checks, and a
retained read cannot be released while any linked delivery lacks exact terminal
and ACK. Context/token/body remain absent from the new link row.

Before the final early custody guard, focused local tests passed **88/88**. On a fresh bounded internal-only
PostgreSQL/test-mTLS cell at that earlier source, **112/112** passed across the candidate and PG
assertion suites. The latter used a genuinely separate Core OS process; after
the pinned callback it recovered the same outbound context and signed token
byte-for-byte via that process, kept one lease, refused a foreign peer and
changed request, and required a test terminal before the exact ACK. These are
synthetic source and keys, not connected Edge acceptance. The cell/network
were removed. No candidate or migration was installed on the preview.

This does not recover a context when no authenticated Edge callback occurs,
when Edge lost that original, before the linked ISSUE commits, after expiry,
or if the status signing key/authority has changed. It also does not itself
restore the transport's pending HTTP promise or prove a replay to the real
Edge. Those remain open along with the three missing positive readers and the
final integration gate. **The earlier clone/old-image migration experiments
in this receipt used the previous 0157 bytes**, before these three new fields;
they cannot be reused as a migration rehearsal for this new candidate.

After that run, an early fail-closed check was added before preparing a new
outbound context when a durable lease for the original or exact request is
still missing terminal plus ACK. The serialized issue-time fence remains the
authoritative race protection; this early query does not replace it and cannot
recover a secret context before Edge presents the original. The local assertion
suite passed **61/61**, and the internal-only PostgreSQL/mTLS suite passed
**112/112** on the updated source. In the latter, a new OS process first
refused competing prepare, then the authenticated original callback restored
the exact outbound context and token. Cleanup removed the disposable cell.
The affected STATUS transport, assertion and composition suites also passed
**106/106**, including loopback mTLS using synthetic peers. The updated
Control API source-only build typecheck exited 0; this is not the full hook.

The same historical preview dump was restored again into a new internal-only
disposable PostgreSQL cell and the working-tree migration runner applied
0155–0157 with the current 0157 bytes. The ledger and all three added digest/time
columns were observed, and the immutable-link `TRUNCATE` guard refused as
expected. The cell and network were removed. This limited restore used
`--no-owner --no-acl`; it is not a fresh backup, ownership/ACL verification,
populated-custody restore, down/rollback proof, or a final-candidate gate.
In another disposable cell, the old image's migration CLI was retested on
these bytes with one `TEST_ONLY` context link: it exited successfully with
`No migrations to run!`, and the 0157 ledger entry and link survived. The
actual 0157 down SQL refused as designed and the link remained. This still
does not prove that the old application can recover custody or that a real
rollback/restore with populated custody, ownership and ACLs is safe.

Working-tree source pins at this checkpoint:

- `command-source-assertion.ts`: `f50f77a69f8825439851d92518c84df2f528daa2970c7aa3d267669a6dc4941e`.
- `current-human-candidate.ts`: `35b51ff7782d4ca31c3684eeab03372a4d71cc876949fc7980b3c44f3b1b3c4a`.
- Migration 0157: `355aecfeee2ceba687afa3d191f6f4fd42c4008d604e90c0daf166e6fe5f5ea7`.

### Sibling cursor session-generation and denial ordering — 3 Nov

The private, unmounted sibling seam now requires the exact nonnegative session
generation, binds it into the encrypted continuation, and compares it with the
server-provided scope. A cursor from an earlier session generation is refused
before source I/O. Cursor parsing now happens **after** the first authority
check, and the seam repeats the authority check even on cursor errors, so a
revoked caller does not learn whether a continuation was otherwise valid. This
uses the existing two checks, not an additional per-page authority round trip.
Neither the cursor nor these checks is a native HTTP egress fence or a grant.

The first retest had **27 PASS / 1 FAIL** because the new negative-generation
test expected a cursor error for an input already rejected by the outer scope
validator; the assertion was corrected to the actual fail-closed input error.
The final focused cursor/paged-source/seam suite passed **28/28**. This is a
source-only internal preparation: no public cursor is mounted, no legacy cursor
is migrated, and no source or real connected acceptance is implied. An actual
caller must supply the authoritative session generation, not a browser value.
The affected account HTTP, Manager account projection and current-view
composition suites separately passed **73/73** with synthetic source/authority
and test mTLS; they do not establish connected Edge data or real HTTP custody.
Control API source-only typecheck completed with exit 0 on the same working
tree; the test-inclusive normal hook remains NOT_RUN.

Working-tree hashes: cursor `fab2cc73bffcb681f5868c28658d8b85374107d654735b6a50170489bff1c503`,
paged source `838b731faae2a3497a8b5831d310e7b080644aee7eafc8b71a4a97072e2b75d4`,
seam `1d1362dc6d495bd0904e9ed49db70fdf5d914903d02349904fc8c71079eac722`.

At approximately **08:28 UTC on 3 Nov**, a read-only SSH check found the Edge
Unified worktree still at `feat/execution-edge-upgrade-v1_2@636d58a7c4368a617903734ab1d0ce933d2804ca`
with tracked and untracked work, and its source candidate at
`feat/core-current-policy-wire-20261024@6c63d6523a11736e15e9d6e3f62b51c91078c853`.
The latest named 08 mailbox files and Unified tail were still dated 28 Oct;
they did not provide a newer qualified reader/binding/receipt in that mailbox.
This is a bounded source/mailbox observation, not a claim about every HK
worktree or deployed runtime. No remote file, permission or service changed.

### Core STATUS restart without waiting for callback — 3 Nov, source-only

The uninstalled 0157 candidate now records a random **public nonce**, not the
bearer context. A domain-separated Ed25519 signing operation with the existing
STATUS-only private key followed by SHA-256 reproduces the original opaque
43-character context; the immutable row also pins the original context and
outbound token digests. On restart Core first checks current human authority,
the exact actor/session generation, workspace, source original, request bytes,
receiver, workload, existing lease and status-token digest. It can then
recreate the same context and token before an Edge callback, without issuing a
replacement lease or inventing a terminal or ACK. A changed nonce, signing key,
session, request, authority or expired link is refused. An unlinked legacy
lease remains fenced. This construction and its key lifecycle need independent
security review and real Edge compatibility verification before commissioning;
neither was performed here. A status-key rotation deliberately prevents this
recovery and needs a separate operator recovery procedure.

Focused synthetic transport/assertion/composition tests: **109/109 PASS**;
the first attempted run exposed an incorrect 86-character context and a
sandbox loopback restriction; the wire length was corrected to 43 and the
suite rerun with permitted loopback. Isolated PostgreSQL + test-mTLS tests:
**112/112 PASS**, including a fresh OS process restoring the identical context
and token *before* the pinned test peer's callback, plus refusal of a foreign
peer and altered bytes. These are synthetic keys, human/source and terminal.
The PostgreSQL container and its internal network were removed. The Control
API source-only `tsc -p tsconfig.build.json --noEmit --incremental false`
completed with exit 0; it is not a test-inclusive normal hook.

The historic preview dump (SHA-256
`324fb9f35dbb606773010af310caf1261e386abc6cb57be3abaf378f9f8c15c8`)
was again restored into an isolated disposable PostgreSQL cell with
`--no-owner --no-acl`; the working-tree runner applied 0155–0157, including
the new nonce column. Ledger and columns were checked, and the immutable
TRUNCATE guard refused as designed. The cell and network were removed. This
is not fresh-backup verification, populated-custody/ACL recovery or an
operational rollback rehearsal. Earlier 0157 migration/old-CLI receipts
above refer to **different schema bytes** and cannot be reused for this one.

Scope remains incomplete: Edge still keeps flight/response custody in memory,
so simultaneous Edge restart and genuine ACK are not proven; no source or
Edge receipt was created. Three sibling readers remain source-dark, not
positive endpoints. The integration hook, browser, real Edge, financial and
Approval qualification and final migration/rollback remain open. No runtime,
preview schema, UI or remote branch was modified.

Read-only follow-through on HK candidate `6c63d6523a11736e15e9d6e3f62b51c91078c853`
confirmed `command_status_issuer.rs` retains the acquired lease, exact raw
PM response digest and completion flag only in its in-process `Delivery`.
The digest is computed from the raw response before completion; it must not be
reconstructed from a parsed outcome. Durable bounded Edge custody/ACK recovery
and its source receipt remain necessary. No remote source was edited.

Source pins at this checkpoint (uncommitted):

- `command-source-assertion.ts`: `71cd1f98580ceae566bdfff413b53bb64996e272d4a1ae4fcebe9c10baa9780a`.
- `current-human-candidate.ts`: `7c52fe256d092697914a8c339d4040ab0a34a343402b44222f5542090c868933`.
- Migration 0157: `d0e5428fcc6c724de1a033e14f3a585b1318f6472350c0b1c2b589b894bf01b5`.

### Concurrent preparers rejoin the winning custody — 3 Nov follow-through

There was a separate race when two Core authorities prepared different contexts
before either wrote its lease: the transaction correctly fenced the loser,
but its cached unissued context could prevent it from rejoining the winner.
After a **proven pre-INSERT** refusal, a subsequent prepare now rechecks the
durable original and rejoins the exact winning context/token. A context is not
discarded when its issue is pending, ambiguous, or already issued. The
transactional issue fence, unchanged, remains the race authority.

Affected transport/assertion/composition tests: **110/110 PASS**. The
isolated PostgreSQL/test-mTLS suites passed **113/113**, including two
independent authority instances preparing before the first real test-database
lease commits, then observing a single lease and the original context. This
new race test uses two authority instances, not two separate OS processes; the
separate-process test described above remains in the same passing run. The
test-only PostgreSQL container and network were removed. No live Edge or source
was involved. Migration 0157 itself is unchanged from the immediately preceding
clone rehearsal. The updated source-only Control API typecheck also exited 0;
the full normal hook remains NOT_RUN. Earlier source pins refer to their named
checkpoints, not automatically to this newer source.

Rollback-compatibility preparation was repeated on another disposable clone
using the **current** 0157 schema bytes and one explicitly `TEST_ONLY` link.
The old image's migration CLI
`sha256:cf60a6044b8b331d834cba4e8232e581a90c90b7d3a8f8e3a83dfcef22d76971`
exited 0 with `No migrations to run!`; the 0157 ledger row and test link both
remained. The actual 0157 down SQL refused with
`COMMAND_STATUS_CONTEXT_DOWN_REQUIRES_APPROVED_ARCHIVE`. The isolated cell and
network were removed. This does **not** prove an old binary can recover that
link, preserve actual custody/ACLs or provide a safe production rollback.

Updated working-tree source pins: `command-source-assertion.ts`
`dc7f808dd655e9db9e1cd392c0ea28893bf5672cb29cc6a65cf404625ec3b94c`;
`command-source-assertion.spec.ts`
`e53aa9860a145da354869a03e6896c3251fe8eb5deb6d38515bd5e30a0f4f7e1`;
`command-source-assertion-pg.spec.ts`
`e146f4a2e9840408cd938622913aa59f198711db493b97737a17897d4cc69cf8`.

For follow-through, an unmodified 8.9 MiB source-only copy of Edge candidate
`6c63d6523a11736e15e9d6e3f62b51c91078c853` was exported via read-only SSH to
`/home/bobby/portal-edge-status-custody-20261103-jsjcp7Gl`. It has not been
built, edited, committed, installed or merged. HK load was approximately 13,
and both hosts had under 20% root free; no disk-intensive build was started.
Persisting the exact verified PM raw-response digest *before* acknowledgement,
alongside the original/lease binding and bounded retention, is still an Edge
implementation task; a parsed or reserialized outcome is not an acceptable
substitute. This source copy is not evidence that the task was completed.

### Owner/ACL-preserving backup round trip — 3 Nov follow-through

A disposable, internal-network PostgreSQL cell restored the historical
preview dump with ownership and ACL restoration enabled, applied current
migrations 0155–0157, inserted one `TEST_ONLY` 0157 correlation, and made and
restored a second custom-format backup. The test correlation's row digest,
the two 0157 immutability triggers and the 0157 migration-ledger entry matched
after restore (`1:03e639f13306fea2660843d5e10d9499:2:1`). A comparison of
relation owner and relation ACL metadata across the two copies matched for
211 relations (`0d0c3e0b719bfb646db1003568ac9985`). The synthetic link is
not a real lease, source terminal or Edge ACK.

The first attempt stopped because the isolated cell lacked the dump's `portal`
owner; another stopped during the second restore with a 2 GiB container limit
configured; the exact cause of that PostgreSQL exit was not captured.
Neither was counted as a pass. The successful cell used a 2-CPU/4-GiB limit,
tmpfs and a read-only mount of the historical backup; its container, temporary
database and network were removed. This comparison covers relation owner/ACL
metadata, not all function/default/database/role privileges or external
custody. It is preparation, not a final-candidate DR/rollback acceptance: real
outstanding 0157 custody, old-binary recovery, final migration pins and a
full security-metadata comparison remain open. No preview or stable database
was changed.
### Edge STATUS durable custody candidate — 3 Nov, source-only

The isolated Edge source snapshot based on `6c63d6523a11736e15e9d6e3f62b51c91078c853`
now has a proposed PostgreSQL custody ledger and migration `0025` for the
STATUS path. It binds the original command, signed context hash, delivered and
request digests, receiver/workload, lease and exact source-response byte hash.
It does not retain the bearer token. The retained normalized response is tied to
the same context, so a later result for the same original cannot replace it.
An advisory session lock and durable `DISPATCHING` fence prevent a retry from
silently re-sending an ambiguous PM request. An already-retained response can
retry the same Core completion; only the actual validated ACK changes it to
`ACKED`. A process lost after dispatch but before receipt remains unresolved:
it requires authenticated source resolution, not a fabricated ACK or another
intent. Status storage is bounded by explicitly configured `max_retained_status`;
its long-term archival and capacity policy still requires owner qualification.

On this final source snapshot `cargo check --offline --locked` for the Edge
service and projection store exited 0, the focused Edge `command_status_`
library tests passed **27/27**, and the PostgreSQL custody suite passed
**18/18** in a disposable loopback cell, including recovery in a separate test
OS process, immutable binding, quota, byte hash and negative cases. The cell
was removed. The completed temporary build directory
`/dev/shm/edge-status-build.quo9l1` (3.7 GiB) was also removed after the
source archive was verified. These are isolated tests, not a whole-service restart with real
Edge/Core authority, a genuine source response, or a connected ACK receipt.

The candidate has **not** been committed, transferred to or installed on HK,
or mounted in a runtime. Its source snapshot is preserved at
`/home/bobby/portal-edge-status-custody-20261103-jsjcp7Gl`; a 12-file source
archive is at
`/home/bobby/.local/state/portal-status-recovery-20261103-9BBN88/edge-status-custody-source-20261103.tar`,
SHA256 `6860bbe6ef16db81c0dbf2c47d8cd75b590441c8a5c84d760f3e5a8e1c8b913f`.
It is not a Git bundle. Reconcile against the actual Edge candidate and WIP,
recheck migration numbering, schema roles/grants and dependencies, then run
the integrated gate before any installation. No production config, ACK, source
authority or connected acceptance is claimed. Three sibling positive readers,
native egress custody, financial/Approval source qualification, final
migration/rollback and the normal integration hook remain open.

#### Edge source integration baseline revalidation

Read-only SSH revalidation found the actual STATUS worktree
`/home/bobby/.worktrees/portal-core-current-policy-wire-20261024` clean at
`6c63d6523a11736e15e9d6e3f62b51c91078c853`; its latest existing projection
migration is `0024`. The discovery V2 candidate `4cf434c45b4ea5b5d62045edcfa536298c5d1da6`
descends from that exact base, with two commits affecting only
`native_relations_gateway.rs` and its tests. Neither overlaps the twelve
STATUS candidate files. This is a source comparison, not runtime verification.

An independent **local** shallow Git clone at
`/home/bobby/portal-edge-status-git-20261103`, branch
`chore/edge-status-custody-20261103`, was created from the exact STATUS base.
All twelve candidate files were applied there and `cmp` verified **12/12**
identical to the separately tested source snapshot. The clone and changes are
not committed or installed; existing HK worktrees and their WIP were not
changed. The vocabulary dependency used by the build has SHA256
`2bff34b773e24c9f477e825f70f7776c03cc1b9038364791b5167f064e487af1` in both
the Edge base and the earlier snapshot dependency.

The actual base catalogue still marks `orders_execution_status`,
`reconciliation`, and `obligations_unknown_execution_outcomes` as
`UNAVAILABLE` / `NEW_EDGE_V1_EXPORT_NOT_QUALIFIED`, with no enabled
environment or coverage proof. Thus those three are not qualified positive
sources; listing source components is not permission to mount them as real
results. Account identity-only native composition remains a separate candidate
and also requires its actual source, authority and connected qualification.

The local Edge clone was subsequently fast-forwarded to discovery V2 base
`4cf434c45b4ea5b5d62045edcfa536298c5d1da6`, preserving all twelve STATUS
files. Its STATUS patch is staged, **not committed**, and is independently
stored at `/home/bobby/.local/state/portal-status-recovery-20261103-9BBN88/edge-status-on-discovery-v2-20261103.patch`,
SHA256 `4ad2aa1d81becc217dacb89ff0e2175dcadcf7cc74f7814f89285e9e50c82ce2`;
reverse application was checked without changing source. The pinned clone
dependency `vocabularies.json` matches the earlier test dependency byte for
byte. Against this combined, uninstalled candidate: discovery tests **25/25**
with one separately handled ignored test; STATUS tests **27/27**; the genuine
Core *synthetic codec* vector (SHA256
`91146ba20bd5dac9fd9407ec21232a7b9e10d1e1f7e680977bceaad5a3e00e87`)
**1/1** when explicitly run; and disposable PostgreSQL custody **18/18**.
These test sets do not overlap, do not provide genuine source rights or ACK,
and do not establish the final Core+Edge image, normal hook or release gate.

#### Strict validation and disposable Edge restore

The first strict `cargo clippy --offline --locked -p edge-service --bins --
-D warnings` failed: the custody API lacked error documentation, there was a
potentially wrapping cast, a redundant closure and an oversized constructor.
These were fixed without disabling lint: the bound now uses checked conversion
and the issuer accepts a grouped delivery structure. **The first source archive
and earlier patch above do not include these subsequent edits.** The current
12-file staged patch on base `4cf434c45b4ea5b5d62045edcfa536298c5d1da6` is
`/home/bobby/.local/state/portal-status-recovery-20261103-9BBN88/edge-status-on-discovery-v2-clippy-20261103.patch`,
SHA256 `8da569557d23f7fb506d51feba54898894d8e9766ce16662f93aa58902aaa330`.
Reverse-apply check and staged `git diff --check` passed. The patch is not a
commit and must not be installed as a runtime artifact.

After these edits strict Clippy exited 0; retested STATUS **27/27**, discovery
**25/25** plus the independently run genuine-Core synthetic codec vector
**1/1**, and isolated PostgreSQL custody **18/18**. In the same test-only
PostgreSQL cell, a custom-format dump containing two synthetic custody rows
was restored to a fresh database. Ordered row bytes matched SHA256
`8c9e522616c0eebe0a1c3988880f5d4de602585518ec8ca2261506fc674f7749`;
both custody triggers and successful migration 0025 were present. Restore was
`--no-owner --no-acl` under a single test role: it does **not** prove live
roles/ACL, backup of original data, old-image recovery, operational rollback,
real source ACK, or final candidate acceptance. The disposable container and
its temporary dump were removed; the 3.7 GiB build directory
`/dev/shm/edge-status-git-20261103.pKaF7z6U` was removed after the current
patch was checksummed; the local source clone remains preserved.

#### Issuer restart and identical-completion regression

Added a feature-gated `TEST_ONLY` integration test on the same local Edge
candidate and discovery V2 base. It exercises the real STATUS issuer and
PostgreSQL custody, with a pinned loopback HTTPS/mTLS mock of Core and **two
separate child OS processes**. The first process obtains one test assertion,
records the source response byte digest and encounters a simulated 503 while
delivering completion. The second opens the same persisted context, original
and lease and retries completion. The mock confirms exactly one assertion
issue, two completion requests, and identical custody identity and byte hash.
The second response is a test-only simulated ACK, not an ACK from Core or Edge
runtime. The focused `status_issuer_process_recovery` invocation passed
**1/1**, exit 0; the nested child runs are validated by the request counts and
matching completion identities, not counted as extra independent tests. The
test uses synthetic credentials and a loopback disposable database; the cell
and temporary build directory were removed. `/tmp/edge-issuer-process-test-20261103.log`
records the test runner summary without credentials.

The current **13-file staged, uncommitted** patch superseding the earlier
12-file patches is
`/home/bobby/.local/state/portal-status-recovery-20261103-9BBN88/edge-status-recovery-mtls-20261103.patch`,
SHA256 `ea9a571b3af8b9fcd16d08c812e543ad660e706a8c2c26cce443282f3f74e9bb`;
reverse-apply and staged whitespace checks passed. This last change adds only
the feature-gated regression module, so the earlier production-source Clippy,
discovery, codec and PostgreSQL results remain relevant to the same source;
they are not claimed as a fresh full integration gate. No commit, runtime
installation, real original/authority, genuine ACK, financial/Approval source
or connected acceptance is claimed. A crash while dispatch is ambiguous and
no retained response exists still needs authenticated source resolution;
neither a second intent nor an ACK may be invented. The three unqualified
sibling exports, field authority/HTTP custody, final candidate hook, actual
permissions/ACL and operational restore/rollback remain open.

#### Lost ACK after simulated commit and second restart

The issuer regression was extended to **three verified child OS processes**
in a new disposable test-only PostgreSQL cell. The loopback mTLS mock now
records one simulated Core completion commit before returning the first 503,
rejects a changed completion body, and acknowledges the exact retry. The
third process reloads the already-ACKED custody and does not issue another
assertion or completion request. The test explicitly confirms each child test
ran, one mock commit, one issuance, and two identical completion requests.
Focused test **1/1 passed**, exit 0. This is a simulated commit/ACK and does
not prove the real Core/Edge joined path, source original, live gateway or
behavior after expiry.

The updated **13-file uncommitted** source patch supersedes the two-process
patch above:
`/home/bobby/.local/state/portal-status-recovery-20261103-9BBN88/edge-status-recovery-three-process-20261103.patch`,
SHA256 `d2882ae955e62798d87df82291860ee71bc2dec238c4b6d43c9502f6a3878e30`.
Reverse application and staged whitespace checks passed. Only the TEST_ONLY
test changed since the previously reported strict source Clippy and other
focused suites; those were not falsely counted as new runs. The PostgreSQL
container and its 2.3 GiB temporary build directory were removed. No runtime,
authority, source data, production command, remote push, final hook or final
migration/rollback acceptance was performed.

Read-only HK revalidation during this round found the STATUS Edge worktree at
`6c63d6523a11736e15e9d6e3f62b51c91078c853`, clean, and the separate Edge plan
worktree at `636d58a7c4368a617903734ab1d0ce933d2804ca`. This is a Git
source check only, not a running image/config/schema or source qualification.

#### STATUS same-original reservation fence — candidate fix

Review found a real gap in the preceding Edge candidate: its advisory lock
was per context, and `reserve_status_custody` could insert a second
`ACQUIRING` context for the same original before Core refused the competing
lease. That orphan could remain unresolved and consume retention capacity.
The writer now checks for any non-ACKED obligation for the same `command_id`
under the ledger/original transaction locks. An exact matching retry rejoins
the existing context; a different context is refused until actual ACK. A
different original remains independent. This does not resolve an ambiguous
old obligation or claim any new source terminal or ACK.

Migration 0025, not installed anywhere, also adds the partial unique index
`command_status_custody_one_unresolved_original` for non-ACKED rows. This
independently prevents a second unresolved context for the same original even
if a writer bypasses the application check or uses different isolation.
Migration SHA256 is
`2fe33ab2c37a256456068a3135e1716bd925a40cdf6455fd7430cf5e6d401e76`.
The PostgreSQL test races two separate store connections and confirms exactly
one winner, exact-context retry, isolation of another original, a new context
after a verified test ACK, and SQLSTATE 23505 for a direct duplicate insert.
The database and all credentials are TEST_ONLY; a new context is not an
authority grant.

After the application fix, strict offline Clippy exited 0. Following the index
change, a fresh guarded disposable PostgreSQL cell reran the affected sets:
custody **19/19**, STATUS **27/27**, and pinned loopback mTLS issuer recovery
**1/1** (three child processes). These are separate tests, not a single joined
Core–Edge receipt. The strict Clippy run preceded the SQL-only index and test
changes; production Rust source was unchanged after it. The cell was removed
and its 4.2 GiB temporary build cache deleted.

The current 13-file staged, uncommitted patch is
`/home/bobby/.local/state/portal-status-recovery-20261103-9BBN88/edge-status-same-original-fence-20261103.patch`,
SHA256 `0cda4c0f67eb2ad621d6790b48355b80fd947719f9e0eb00c7114d67512a4202`;
staged whitespace and reverse-apply checks passed. It supersedes the previous
STATUS candidate patches. HK source/runtime and shared branches were not
changed; no actual source ACK or field authority has been asserted. Final
candidate integration, role/ACL validation, migration/rollback, normal hook,
three sibling positive sources and connected acceptance remain open.

The indexed 0025 bytes were also rehearsed in a separate **network-none**
disposable PostgreSQL cell, using only a minimal synthetic parent table, one
synthetic custody row and a `NOLOGIN NOINHERIT` test role. A custom-format dump
was restored with ownership and ACLs into a second DB. Before/after security
and data tuple matched `1:97f16ad4e2eef9c4f5c0a27afd77d04e:1:2:true:true:false`
(row count/content MD5; unique-index count; trigger count; test-role SELECT,
INSERT and DELETE privileges respectively). Under that test role, a direct
duplicate unresolved insert was refused after restore. The disposable cell
and in-cell dump were deleted. This explicitly checks the new index and test
ACL survival; the minimal parent, synthetic role and one row do **not** prove
actual Edge role grants, source data, full-schema SQLx migration history,
old-image runtime rollback or final-candidate DR.

#### Account profile composition follow-through — 3 Nov

`test/current-view-composition.spec.ts` now also exercises the **real**
`ManagerCurrentAccounts.readNativeProfile`, `CurrentViewCoreComposition`,
selection/field policy and TLS 1.3 loopback callback as one chain. The
commissioning metadata, source page, identity/policy DB and final native
custody are deliberately synthetic test doubles. It checks a positive
identity-only profile, revocation after synthetic ENTER, malformed source
page, and a different workspace; no private body is dispatched on refusal.
The focused Core group (`current-view-composition`,
`manager-current-accounts`, `sibling-source-dark-http`) passed **77/77**.
The initial unprivileged invocation was denied loopback `listen` by the
sandbox; a fresh explicitly permitted loopback-only run passed. This does
**not** combine those doubles with the separate real disposable-PG/native
egress tests, prove actual physical custody for this account adapter, or
commission an Edge provider. The other three positive sources, source field
authority, same-original recovery and final-candidate migration/integration
gates retain their existing open status.

The joined test exposed a real independent configuration mismatch: the
Account adapter requested 65,536 bytes unconditionally even when the
commissioned Core-to-Edge client had a lower valid `response_bytes` limit.
That rejected every such request *before* source I/O. The real composition
now exposes its immutable private configured byte bound to this adapter;
Account requests and validates `min(configured bound, 65,536)`. This does
not raise the bound or grant access. A joined loopback mTLS case confirms an
8,192-byte configured limit is actually sent and succeeds for a smaller
synthetic page; a tighter bound rejects an oversized page before dispatch.
After the change, focused `current-view-composition`,
`manager-current-accounts`, `sibling-source-dark-http`, and
`current-view-edge-client` passed **94/94**. This is local source and test
only: no image, real source or installed configuration changed. The earlier
typecheck process was intentionally interrupted once this additional source
fix made its result stale; a fresh candidate typecheck is recorded separately.

The subsequent `npm run typecheck` (`tsc --noEmit`, including all Core tests)
**FAILED**, not PASS. Its output exceeded the tool output limit; examples
include `AccessActor` missing in `command-source-assertion.spec.ts`, a number
of test-double type errors, and frontend `.tsx` imports entering the backend
test compilation without JSX/DOM settings. These diagnostics must be triaged
against a clean baseline before attributing all of them; the full output was
not retained. The separate source-only production build check is recorded
below. Normal hook remains open.

Two diagnostics in the candidate's STATUS assertion test were addressed:
the missing type-only `AccessActor` import and an over-narrow inferred mock
query result. The focused STATUS assertion test then passed **65/65**. The
whole-project typecheck has not been rerun after those changes, so its other
diagnostics remain open and the typecheck is still **FAILED**, not PASS.

`npm run build -- --noEmit` (`tsconfig.build.json`, source-only BE-PURE
compiler configuration) subsequently ended without printed diagnostics, but
the process exit code was not captured by the polling wrapper. Its result is
therefore **UNKNOWN**, not PASS; rerun with retained exit code at the final
candidate gate. It does not repair or replace the full `npm run typecheck`.

Follow-up: a focused strict `tsc --noEmit` for the STATUS assertion,
current-view composition and Manager CURRENT Account test files first found
three writes to readonly selection fields and one implicit callback type.
Those were fixed without changing authority semantics. The same focused
compiler command then exited **0**, and the three corresponding Vitest files
passed **134/134** with an explicitly permitted loopback test. This does not
turn the earlier full `npm run typecheck`, unrecorded source-only exit, or the
normal hook into PASS. Test hashes for this later run supersede only the
earlier test hashes: current-view composition
`408ace97a113c08d9894ce836ea5d6f79496ec18cfed9ea6b0fdd3cfc3400c2a`,
Manager CURRENT Account
`bf2252adae94f9c7a7b2085efa7c164d9f0c4c9033a371f541480ed237ef5c78`,
STATUS assertion
`d8598da02f257f8d4f0bceed435a080f7845f871f75f18eed6795ce6727d23ad`.

Exact test inputs, SHA256 (uncommitted candidate):

- `current-view-composition.ts`: `8ba1b6cbd04a6c310a74d7c516c1df96cfd71cff07c10533d722edabfc637ad5`.
- `manager-current-accounts.ts`: `4abaf360e75c9b7d76a628c6858d61b5690909a664cefeeb1548fe812d4bc8f6`.
- `current-view-composition.spec.ts`: `36a20d2c87a110117203f497f870ff1c2b9a50ea0f993c4a204c5276c94b77a1`.
- `manager-current-accounts.spec.ts`: `a30f222c5c7d6b45866e2bf455ce76c31f49bc6e971b1efa3f6b3fd59c54fcf4`.

### Native Account custody integration follow-through

A joined Account-profile test exposed a real composition bug: the Manager
CURRENT publication decorator discarded the already-configured native
`currentRelations` custody port. Consequently the reader failed closed with
503 even though the native provider was present. The decorator now preserves
that exact port when supplied; it does not grant a permission or create a
provider when absent. The publication suite passed **42/42**, including both
port-preservation and absent-port cases.

The new joined integration runs actual Core policy evaluation, the ordinary
root receipt intake, native custody in disposable PostgreSQL, mutually
authenticated local TLS and the physical HTTP response. Only the external
source, its explicitly `TEST_ONLY` original and field metadata are synthetic.
The full `elp210-native-current-relations-provider.spec.ts` suite passed
**22/22**, exit 0, including the joined Account case, final dispatch denial,
revoke, and recovery of the same original after a lost acknowledgement. The
temporary isolated container and network were removed by the test harness.
This does **not** prove a real Edge original, field publication or source ACK,
does not mount the other three positive readers, and does not establish STATUS
recovery across the deployed Core/Edge processes. Those remain open.

Uncommitted tested candidate SHA256:

- `manager-current-publication.ts`: `11e54bff2401167e0cf27a54da769f9b626e0cc4bb0fe864520f7d3921811cf0`.
- `manager-current-publication.spec.ts`: `7511ec7b89b243045d6257beedd0389f5d61661c9df0b5f9901e588f355531f3`.
- `elp210-native-current-relations-provider.spec.ts`: `a0c60ba6e3588b8ecc553f6ddfd26384cba732f30f92f85cefcc6aab5232b9a5`.

After the custody decorator fix, `npm run build -- --noEmit` in
`apps/control-api` completed with **exit 0** (production source compiler,
`tsconfig.build.json`); `git diff --check` also exited 0. This replaces the
earlier UNKNOWN result for the source-only compiler, not the FAILED full
test-inclusive typecheck or the still-unrun normal hook. No image was built.

The joined Account test was extended to reject a wrong workspace and a
different account with no body and no additional data-source request. The
complete disposable-PG/mTLS native suite was rerun and passed **22/22**,
exit 0. This supersedes only the prior hash of that test file:
`7a6d4f3cbb52b2211ea29e36c44615b5b19268002f9e2db23e99624d99ed7e31`.
The endpoint still uses a synthetic authority and source; this is not a
cross-workspace acceptance receipt for a commissioned Edge deployment.

The separate catalogue publication decorator had the same native-port loss
as the Manager decorator. It now preserves the exact existing port when
present, without manufacturing one; the joined Account test now composes
both decorators above the real native provider. The full isolated
PostgreSQL/mTLS provider suite again passed **22/22**, including the wrong
workspace/account refusals. Catalogue plus Manager publication suites passed
**68/68**. A targeted test compiler also exposed four incorrect test-harness
`Socket` annotations for HTTPS `connection` events; those annotations were
corrected to `Duplex`, and the targeted compiler rerun exited 0 before the
subsequent catalogue composition edit. The full test-inclusive typecheck is
being rerun on the newer candidate; the preceding source-only compiler result
does not establish a final compile after that additional edit.

Latest uncommitted inputs, SHA256:

- `publication-adapter.ts`: `4fc6c750ad4ca8d58fdeb198f41730355eb61f8227c465a679c4d45681ba03cf`.
- `elp205-publication.spec.ts`: `36b431750d4b246dac87ad68f89f5e7a711f1a42ce8ef47c65692151e9083ac9`.
- `elp210-native-current-relations-provider.spec.ts`: `f51e161add0669b2837a5522949306ab449865bfc9e730b6108550daca821da3`.
- `fixtures/elp210-native-current-relations-server.ts`: `32c25eb9fad5660d695f37cb4593146748a75133a777a06c16fe542b6701651a`.

Further, the joined test now invokes the actual sibling controller on a
physical loopback Fastify listener, exercising `reply.hijack()` with the real
Core/PG native provider and both publication decorators. The entry session
and workspace repository and the upstream source/authority remain synthetic;
this is not a test of the full Nest `SessionGuard` or a live Edge. The entire
isolated suite passed **22/22**, exit 0, including the real listener, and the
cell was removed. Latest test SHA256 supersedes the earlier hashes:
`900732ca20c2fa6d088b3fda36f111702f09d82e77043f8bc06821ab095dbc0b`.

### Native Research SessionGuard route correction

The native Research route ceiling did not admit `/api/v1/execution/accounts/
{account_id}/profile`, even with the Account composer installed; production
requests would therefore receive 403 before reaching native custody. The
ceiling now admits that exact GET route only when the separately installed
Account composer is present, and continues to reject another workspace,
non-Paper environment, other methods, suffixes and invalid/overlong IDs.
This is a routing ceiling, **not** a grant; the existing actual session,
workspace, resource, field and native egress checks remain mandatory.

Guard and sibling HTTP suites passed **141/141**. The joined disposable-PG,
mTLS and physical Fastify Account-profile test then passed **1/1** (21 other
tests intentionally not selected), with the actual `SessionGuard`, an
explicitly synthetic session whose hash and membership reside in disposable
PostgreSQL, the real workspace repository and both publication decorators.
The upstream original, its receipt and the publication metadata are still
`TEST_ONLY`; the call is not a live Edge acceptance. Before this rerun a new
assertion failed because the client can receive HTTP EOF before the route has
finished source settlement; the test now explicitly waits for the controller
completion before asserting both original rows were actually `SERVED` and
settled. That failed run is not counted as PASS. All disposable cell resources
were removed.

Latest uncommitted input hashes:

- `native-review-profile.ts`: `7fa2a7fa5172c60cd49fe2916013c5681da8b0e1b05281360c71ffc998d76b8a` at test time; a subsequent comment-only correction gives `9bd6cb119c7621c5402e888304d23e437a4a6a4873b32580199d6a5bb1dee3cf`.
- `native-research-review-mode.spec.ts`: `e018ef2c1a55b5217d1e39eb24869cc97aca0d2fc2ed9b9abc9be05c1ceab8ab`.
- `elp210-native-current-relations-provider.spec.ts`: `b48f9f100776c4a38922460b97ff7834686bd1c9da2c946d1946cc3160ffee09`.

The whole-Core `npm run typecheck -- --pretty false` was rerun and exited 2
with 421 displayed diagnostic lines including older test fixture mismatches,
unresolved `node-pg-migrate` test types and frontend JSX/DOM imports. Output
was truncated; these are examples, not a complete triage or attribution. The
run overlapped a later Account guard edit and does not validate that final
candidate. A focused compiler run for the affected tests is in progress;
normal hook and final candidate qualification remain open. Root filesystem
had 17% free (112 GiB) during this run; another user's tests were active, so
no cache pruning or disk-intensive build was started.

One diagnostic in the in-scope Approval Evidence negative-fixture test was
corrected by explicitly refusing an empty fixture path before indexing; the
test behavior is unchanged for valid fixture paths. Its focused suite passed
**59/59**. Input `test/approval-evidence.spec.ts` SHA256:
`207333ad79d2d20057b6f86aa5709583bed41a60031506885a987e16970f843b`.
This does not repair the rest of the whole-Core typecheck or qualify the dark
Approval Evidence source.

The focused strict TypeScript compile of the native provider test, native
Research review/guard test and catalogue publication test completed with
**exit 0** after the SessionGuard test addition. It includes their imported
Core sources, but is not the full-Core typecheck and excludes the subsequently
adjusted Approval Evidence test. The full-Core result above remains **FAIL**.

### Installed Manager runtime preserves native custody

Reviewing the actual `AppModule` composition identified a third port-loss
case: when the Manager publication runtime is installed, `accessTrust()`
created a new delegate without the existing native CURRENT port. This is fixed
by retaining the exact existing port; absent remains absent, and delegate
identity/provenance and independent permissions are unchanged. Three focused
Manager runtime/catalogue/publication suites passed **116/116**. The joined
Account test was extended through the actual installed Manager runtime
delegate, both publication decorators, real SessionGuard, Fastify, loopback
mTLS and disposable PostgreSQL native custody; **1/1** selected case passed
(21 other cases intentionally skipped). The external authority and source
data remain synthetic; no runtime or source was commissioned. The earlier
full-Core typecheck remains **FAIL** and the normal hook is not yet run.

Uncommitted input SHA256:

- `manager-runtime.ts`: `fad7f4be86712ac02141cd5be80f17eaabb9e869a0b437e50b4f0027a2771190`.
- `native-manager-preparation.spec.ts`: `7f1be1b9921bfe538f349087bffd72f892f3177530399e8bb834affb5d75a5cc`.
- `elp210-native-current-relations-provider.spec.ts`: `2b0371db97c56f3f3d00ad425b1acaddfcd91a85876c0e11cdf59fe535c6a857`.

The subsequent focused strict compile **failed** with three diagnostics in
`native-manager-preparation.spec.ts`: a widened realtime schema literal and
two accesses to a mock through the `Pool` interface. The test fixture now
retains its typed mock separately and pins the existing literal; no runtime
semantics changed. Its focused suite was rerun: **48/48 PASS**. Updated test
SHA256: `f92810115b2b4cfe5004cb9e2af8673fc12003a5d8867d126c817871aa21724c`.
The focused strict compile of `native-manager-preparation.spec.ts` and
`elp210-native-current-relations-provider.spec.ts`, including their imported
sources, was rerun after this correction and completed with **exit 0**. This
does not supersede the whole-Core typecheck failure: full-Core typecheck and
the normal hook on the final candidate remain open.

After the Manager delegate correction, the production-source-only command
`npm run build -- --noEmit` completed with **exit 0**. It emitted no image and
did not install or start a service. It is not the full test-inclusive
typecheck, a normal hook, or a deployment receipt.

Read-only catalogue recheck: the local Edge candidate at
`4cf434c45b4ea5b5d62045edcfa536298c5d1da6` has registry SHA256
`9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67`;
its `orders_execution_status`, `reconciliation` and
`obligations_unknown_execution_outcomes` families say `UNAVAILABLE`. This is
candidate catalogue evidence, not a claim about a live Edge deployment. The
three endpoints cannot truthfully return source-backed positive records until
their record mapping, field authority and native HTTP custody are qualified.

The test-inclusive `tsc --noEmit --pretty false` was rerun after the scoped
typing corrections, aggregating diagnostics by file without suppressing the
compiler exit. It **exited 2 with 415 diagnostics** across many existing
Research/Execution test files and imported frontend sources. Examples include
`elp2-identity.spec.ts` (32), `elp204-positive-parent.spec.ts` (18), and
frontend `execution/v2/blocks/index.ts` (30); these counts are diagnostics,
not test failures, and no baseline comparison proves ownership of all of them.
The affected two-file strict compile and production-source build passed as
recorded above, but neither changes this full-Core FAIL. No full hook has been
run on a frozen final candidate, and the partially classified failure is not
a reason to weaken the compiler settings or bypass the normal hook.

A separate strict compile narrowed three custody/STATUS test files to four
errors: two fixture types in `current-view-held-native.spec.ts`, one intentional
HTTP-write mock overload in `elp210-native-frame-egress.spec.ts`, and the
`node-pg-migrate` v9 export-types resolution under the existing legacy module
resolver. The two fixtures and overload were corrected without changing Core
runtime behavior; their focused suites passed **54/54** using the resource lock
and loopback permission, and a strict recompile of those two files exited 0.
The migration test now uses the same narrow CommonJS runner shape as the
existing production CLI and disposable harness, without a global resolver or
dependency change. Its focused strict compile also exited 0. Test inputs:
These four fixes postdate the 415-diagnostic run; the whole-Core count has not
been recomputed, and the earlier FAIL is not promoted to PASS.

- `current-view-held-native.spec.ts`: `fa5612217d7bce3ca77a6287eab41e306c4c2682294c52bf1cbeda4ecaf30c63`.
- `elp210-native-frame-egress.spec.ts`: `d07e83949abc19c518c63088b476f11207690e3f3e0c5de1ffcd7f320719cbc2`.

The migration test was extended to exercise 0157 through the real migration
runner as well as 0156. In an internal-only disposable PostgreSQL cell both
cases **passed 2/2**: down was refused on empty and populated custody; 0157
preserved the exact synthetic correlation and ledger and rejected update,
delete and truncate. The test containers/network and in-cell test DBs were
removed by their cleanup paths. Input SHA256: test
`ecab2c16fe855fdfc4426345ef8cd02455dc9fed6aaaa7cc84b33db0b28f0ce8`,
0156 `c48d6e76f45928eaf186cfce445dd72051274cdf5ca422a9e3ea6b4c0b271a6d`,
0157 `d0e5428fcc6c724de1a033e14f3a585b1318f6472350c0b1c2b589b894bf01b5`.
This is a guard/ledger rehearsal, not a successful destructive down, real-data
restore, security-role parity, or rollback of a deployed candidate.

One large typecheck group was traced to the identity test's HTTP helper: its
`unknown` payload prevented Fastify's typed injection overload from being
selected, cascading into response-property diagnostics. The helper's input
was narrowed to the object shape the tests already send; runtime requests and
authentication logic did not change. A guarded disposable PostgreSQL run of
`elp2-identity.spec.ts` passed **18/18**, including revoke and current-authority
cases. Its focused strict recompile exited **0**; no new full-Core error count
is claimed. Input SHA256:
`53343c3539491294f7f8be5b130e65549a71a5350ab2a5c2a5b59ab7af30fdc9`.

### 3 Nov financial partial-total correction and Edge catalogue clarification

Core's `exactCurrencySum` previously ignored missing or malformed amounts in
otherwise present rows and could publish the sum of the remaining rows as a
complete monetary total. It now refuses the whole aggregate with
`EXACT_DECIMAL_SOURCE_VALUE_NOT_PUBLISHED` for null/missing values or
`EXACT_DECIMAL_SOURCE_VALUE_INVALID` for malformed values, including trailing
line terminators. Empty input remains absent; exact decimal zero remains zero.
Canary margin consumption and stage fill-fee tests explicitly cover the
partial-row case. The three affected focused suites passed **43/43**. These
are local synthetic inputs, not financial carrier qualification. Consumers
must preserve the returned null/reason rather than replace it with zero.
The production-source `npm run build -- --noEmit` also exited **0** after this
change. This is not the test-inclusive full-Core typecheck or normal hook.

Source hashes: composer `90a47c2fb6d11ac46c65f769d64df84bbeaedb430f972053b15edb674bfc0334`;
composer test `e17504d237a7a8cab519edf4848a54e55c998a662d73de01e75ec10071e9caa1`;
Canary test `4cf021281c9f82363e1119b19829b7ede4fc4db8fdd05f77b24c32aa56348481`;
stage test `2cb1d3a559be9260e4b1397f58cf6a160c48e44f734e739bc5f7115b4bedc1f7`.

Clarification from the local Edge candidate: maximum-data publication E5
declares implemented named Manager relation adapters for `order_current`
and `reconciliation_findings`; their existence is not the same as a
commissioned logical family or an authorized resource/field source for the
three dark sibling routes. The field coverage catalogue flags those rows as
not yet safe to expose. In particular `finding_id` does not establish the
published reconciliation DTO's `run_id`/`break_id` relation; no such mapping
was invented. Reuse requires qualified selection and same-source parent/field
authority, and native custody through physical HTTP completion. Account profile
remains the positive path already recorded above; the other three routes are
not claimed delivered.
The inspected checkout was `/home/bobby/portal-edge-status-git-20261103`
at `4cf434c45b4ea5b5d62045edcfa536298c5d1da6`, with existing staged/WIP
changes preserved. Candidate file SHA256: E5 publication
`72afcfc1972f3a12a8577d30eacc2bee7ed17c445e7ef6475731707674805df0`;
coverage CSV `2e1c11df82ad6b1826aa1b203805cc0d5ac44da1671e54e5dad7100a21ad6462`.
These are source-file pins, not a deployed Edge image pin.

### 3 Nov STATUS cross-process changed-ACK regression

The existing guarded PostgreSQL/new-OS-process/pinned-mTLS recovery test was
extended: after the same original context and issued lease are recovered and
the synthetic terminal is acknowledged, an exact ACK retry succeeds but an
authenticated callback with a different response digest is refused; the one
durable ACK row retains the original digest. The selected test passed **1/1**
(five other cases not selected) in a new internal-only PostgreSQL/Docker cell.
Container and network cleanup were separately checked. The source original,
terminal, Edge client and keys in this test are synthetic; no real Edge ACK,
connected acceptance or deployment is claimed. Full candidate normal hook and
the remaining three native source-backed readers remain open.

Test SHA256 `d809a6436d1ebc3af462a7bd01cc3fc82834180c09de951ca1c89a58ac85ff18`;
local disposable runner SHA256
`fc1b0d7d5de5b1502fff2f9ebb29510de0dc13d6a4996ef3a922fbc0b850c8e0`.
The default sandbox rejected `sudo` before any cell was created; the same
guarded runner succeeded with the approved Docker access. No shared database,
Edge service, production/dev/main, credentials or real trading were changed.

The selected case was subsequently extended and rerun in a fresh guarded
cell: after the terminal and exact ACK, the real coordinated logout revoked
the requester. The already-restored context in the other process refused the
same callback, while the original ACK and sole lease remained intact. It passed
**1/1**, with five cases not selected. This demonstrates Core's local
cross-process revoke fence under a synthetic source, not active revoke at Edge.
Current test SHA256
`4456915e1bf60fa704c5fa856193396587b9e5b11efe7b00775c83055f3b674d`.

The full six-case STATUS PostgreSQL file was then run in a new cell. The first
run was **5/6**: an older logout test assumed exactly two global completed
mutations, but the new cross-process logout added one legitimate mutation.
That assertion now measures its own before/after delta of exactly one; it
still checks the real session revocation and denied issue. A fresh full rerun
passed **6/6**, with no case skipped. Final test SHA256
`8c4ec23f64c45f77084f2039c762b886e80487156622799e8d285bb9bb59d2dc`;
full-file disposable runner SHA256
`40e4b4730efba066494b4b408558d3db242c55ff6813bfb1698773836e7a5852`.
Synthetic-source, no-install and no-real-ACK qualifications above still apply.

### 3 Nov positive-parent test typecheck and cleanup

A strict focused TypeScript compile of `elp204-positive-parent.spec.ts` first
reported 18 errors: four unsupported Fastify adapter type arguments and 14
assignments caused by a test fixture's configuration being inferred as the
literal `true` even when a separately valid fixture used `false`. The fixture
now uses the actual application config type and the adapter uses the existing
typed Fastify instance pattern. Runtime values and access policy were not
changed. The same focused strict compile then exited **0**. The selected
Approval Evidence real-PG/HTTP test passed **1/1** in a disposable cell;
355 other cases in the file were not selected. This is a dark-source HTTP
test, not commissioned Approval Evidence or full-suite acceptance. The full
test-inclusive Core typecheck and final normal hook have not been rerun.

Test SHA256
`417b32b44a877d53a13e535ae254304a8a9db9bec823792b9f88650425b83d8d`.
The cell's PostgreSQL container and network were confirmed gone. The temporary
runner created for this cell was removed after use; no shared images, volumes,
backups, Claude worktrees or existing caches were deleted. Docker's reported
reclaimable images/volumes alone do not identify safe-to-delete ownership or
rollback artifacts; no system-wide prune was run.

### 3 Nov full-Core typecheck and projected digest audit

`flock -n /tmp/portal-heavy.lock npm run typecheck -- --pretty false` in
`apps/control-api` completed with exit **2**. The returned output was
truncated (601 output lines before truncation), so no exact diagnostic count
is asserted. Visible failures include Core test typing and frontend modules
pulled into the test-inclusive Core compile without JSX/DOM configuration.
This is not PASS, and does not replace the normal hook. Do not bypass the
gate or infer that all failures belong to this candidate. No test cell or
new cache was created for this command.

The cross-loop imports are in `test/paper-history-depth.spec.ts` and
`test/paper-history-http.spec.ts`; the Workbench model's type imports include
the `blocks` and `charts` frontend barrels. Any repair must retain those
cross-loop tests and backend-only compiler protection, and be coordinated
with frontend ownership; simply excluding the tests is not a valid fix.

A subsequent single strict, no-emit TypeScript invocation compiled these ten
affected test files together and exited **0**: `command-source-assertion`,
`command-source-assertion-pg`, `command-status-composition`,
`command-status-bootstrap`, `command-status-runtime`,
`manager-current-accounts`, `manager-current-publication`,
`sibling-source-dark-http`, `sibling-paged-source`, and `sibling-page-cursor`.
It used the Core ES2022, CommonJS, strict, decorator and metadata options;
it compiled their imports as well. This is not execution of those tests, a
whole-project typecheck, a normal hook, or evidence of source commissioning.
No new container, cache or migration was created. Source SHA256 pins for this
check: sibling controller `6a90adc58f03985adbd7adc658376018e7f00eb6a97f45fcb8a5fa78c03521b5`,
seam `1d1362dc6d495bd0904e9ed49db70fdf5d914903d02349904fc8c71079eac722`,
paged source `838b731faae2a3497a8b5831d310e7b080644aee7eafc8b71a4a97072e2b75d4`,
STATUS assertion `dc7f808dd655e9db9e1cd392c0ea28893bf5672cb29cc6a65cf404625ec3b94c`,
and candidate `7c52fe256d092697914a8c339d4040ab0a34a343402b44222f5542090c868933`.

Read-only inspection of Edge candidate `4cf434c45b4ea5b5d62045edcfa536298c5d1da6`,
`manager_current_source.rs`, confirmed that its `revision` is the digest of
the full nested source row, while `payload` is an individually field-filtered
projection. Core therefore cannot verify that revision by hashing the filtered
payload as if it were the same bytes. The source's snapshot validation and
current-view field authorization remain necessary; neither the inspection nor
the existing Account synthetic test commissions the other three source-dark
readers or demonstrates connected Edge acceptance.

### 3 Nov Canary legacy financial consistency and status qualification

The legacy Canary summary/headroom and KPI projection bypassed the qualified
compliance facts: it summed incomplete money, valued positions without
currency/mark provenance, called untimed position P&L "daily", and mapped
broker buying power to equity. Its count also treated every unrecognized
order status as open. The summary now consumes the same typed capital,
gross-notional and open-order facts as the compliance rows; unknown/partial
facts produce null headroom/KPIs with reasons. Daily P&L and broker equity
remain unavailable until their actual sources are published. A complete
empty positions relation still supplies zero; an unknown/missing order status
does not supply an exact count or a false breach. Known terminal `DENIED` and
the existing canonical `RISK_REJECTED` mapping are not counted as open.

Three focused suites passed **45/45**. The Canary control-room HTTP suite
passed **9/9** against disposable PostgreSQL using synthetic profile facts,
with an internal-only network and read-only source mount. Its first attempt
failed at Vitest startup because the read-only mount blocked the default
configuration cache; no tests ran on that attempt. A fresh cell with the
runner config loader passed. The test containers and networks were removed;
no shared image, volume, source data or service was deleted. This is not a
connected financial source or release acceptance. After both changes, the
production-source `npm run build -- --noEmit` exited **0**; the full
test-inclusive Core typecheck remains failed and the normal hook remains
unrun.

Claude handoff: retain the existing UI design; show null/typed warnings and
do not substitute zero, derive daily P&L from an untimed position sum, or
label buying power as equity. No new schema field is required for this fix.
Pins: service `3a7b851faa289981212f31ba3bcbf6c804de146187cf2c130534a308414abb21`,
facts `468128f4675bc981552fe0355a9d660b8e2dc045e7701cd7a3032e6e905055d4`,
unit test `e043f176206f09b8f815e9673efe472992d9ddd4c6a24e24688b5c2feee4622e`,
HTTP test `49900fd19eeabff3c2bc7625549e9267b77cd8770a15cbbd572213afabb78d4d`.

### 3 Nov typecheck classification and test fixture correction

The test-inclusive Core typecheck was repeated once with diagnostics grouped
by source file; it exited **2** with **362 TypeScript diagnostics**, including
the cross-loop frontend imports and numerous existing tests. One diagnostic
was in the changed Canary HTTP test: its synthetic position fixture lacked the
two PnL fields inferred by the existing fixture type. The test fixture now
includes those fields; no producer, authority, source or runtime changed.
The prior 9/9 HTTP receipt above remains pinned to its earlier test hash; it
is not represented as a rerun of the amended fixture. The complete typecheck
and normal hook have not been rerun after this correction and remain open.

Current amended HTTP test SHA256:
`2b802590ae8f03ddb60955543de23be5f7446ada70d9bf84c03b4032effa66e0`.
The first focused compile used TypeScript's default DOM library rather than
the project's `lib: ES2022` and failed in `proxy.service.ts`; it is not a pass.
The focused strict no-emit compile of the amended Canary HTTP test was then
rerun with the project's ES2022 library and exited **0**. It is not a full
Core typecheck or an HTTP test rerun.
The typecheck created no disposable database or container. Cleanup remains
limited to task-owned temporary resources: shared caches, evidence logs,
images, worktrees and retained source data were not pruned.

### 3 Nov CURRENT installation and mTLS test typing

The grouped Core typecheck also identified test-only typing defects in the
CURRENT installation and current-human transport tests. The installation
fixture now constructs its readonly runtime configuration rather than
mutating it. The loopback transport test records Node's `Duplex` connection
type, on which its existing `destroy()` cleanup is valid, rather than assuming
every connection callback is statically a `Socket`. Neither change modifies
the runtime, access guard, transport policy or source authority.

The two files passed together **24/24** with Vitest's runner config loader
and cache disabled. The mTLS suite uses ephemeral TEST_ONLY certificates and
loopback listeners, and closes its listeners/sockets and wipes test keys. It
is not a connected Edge acceptance or a substitute for the separate guarded
PostgreSQL STATUS recovery cell. Pins: installation test
`dd84beb4cd9e83d2f68f546215fe73da3997063159df91fb1c60cdbab5218811`;
transport test `b5af4bac15f1167f93ad56d7999f514e99434609d68a725b7f0f9bab909ff3c9`.
One strict ES2022 no-emit compile covering both files and the amended Canary
HTTP test then exited **0**. This is not the full-Core typecheck or hook.

### 3 Nov refuse new unlinked STATUS leases

The candidate writer previously accepted a new STATUS issuance without the
durable context/original/lease link, even though the current authority caller
always supplied it. Such an issuance cannot satisfy same-context restart
recovery. The writer now requires a valid link at its typed and runtime
boundary, before any lease is inserted. Existing unlinked historical leases
are neither deleted nor rewritten: the existing exact-request fence remains.
The PostgreSQL test asserts the missing-link denial leaves zero leases, then
exercises linked concurrent issuance, restart, terminal/ACK and a successor.

In a fresh internal-only disposable PostgreSQL cell, the complete candidate
and STATUS cross-process suites passed **113/113**, including six pinned
mTLS/new-process cases. Source, terminal and ACK remain TEST_ONLY, not a real
Edge qualification. The first run also passed but its source mount changed
during the run and is not used as the final-hash receipt. An intermediate
retry stopped during database startup, before tests; the final run waited for
TCP readiness. The two test containers/networks were removed and their names
were verified absent. No runtime, protected source, shared data or image was
removed. Pins at start and end: writer
`039620e1fdb6b304bb4c152dbc1944be2fd2dcb2734edeb440731799efed3177`,
candidate test `071350eabc0cc2cf4d340f2fb03adf59331a7a6f43b4466d76df88dee1e2e6cf`,
cross-process test `8c4ec23f64c45f77084f2039c762b886e80487156622799e8d285bb9bb59d2dc`.
The strict ES2022 no-emit compile of both test files and their imports also
exited **0**. Full-Core test-inclusive typecheck and the normal hook remain
separate unmet gates.

A further regression simulates the existing unlinked storage shape with a
generic issued lease. A new linked STATUS issuance with the same request is
refused; the original lease remains byte-for-byte unchanged, no new lease is
created and no link is retroactively manufactured. The two full suites were
rerun together in another disposable cell and passed **114/114**. The cell
and network were confirmed absent after cleanup. Writer and cross-process test
pins above are unchanged; the new candidate test pin is
`24ea9a3b57218092ce826cd5e117d9402a39026caa3ff516e5ba6fe0cf647490`.
The strict ES2022 no-emit compile of both test files at these pins exited 0.

### 3 Nov Manager permission test harness and complete diagnostics

A fresh full test-inclusive Core typecheck exited **2** with **358**
diagnostics before this follow-through. The complete temporary diagnostic log
was inspected by code and file; it included existing Research/Execution test
typing and frontend JSX/DOM imports. No compiler exclusion or weaker policy
was introduced. The temporary log was removed after classification.

The Manager scoped-world test harness imported `AccessPolicyError` from a
module which did not export it; it now imports the actual contract class, so
the `POLICY_PENDING` fixture path can raise the intended typed error. Its
portfolio IDs are copied into the mutable grant input. Separately, the product
read test fixture now exposes its deliberately mutable grant/active-principal
collections as such, without altering the readonly production access type.
The scoped-world suite passed **9/9**; four affected portfolio/Manager suites
passed **272/272**, all with synthetic data. This is not connected source or
browser acceptance. Fixture hashes: scoped-world harness
`230138a19b3be9d25c6ad8155628cbca9e93fce0eda64459ed14838f04df50b3`;
product-read fixture `0e4c4fdeb693e4b8cd850dd6ba95e4079161ca841d4fb7379177cc5064c5e2ba`.
The strict ES2022 no-emit compile of the five affected suites and their
imports exited **0**. It is not a rerun of the full-Core typecheck.

Read-only SSH rechecked the Edge source worktree and EPG10-08 mailbox. The
candidate remains on its existing branch with WIP intact, and the newest
listed mailbox entries remain dated 28 Oct. This does not establish the
absence of any source publication outside the inspected paths. No HK files,
services, credentials, authority or data were changed.

The identity-mapping and native-business-read TLS test harnesses also used a
`Socket`-only cleanup set although Node's connection event is typed as
`Duplex`. They now use the wider actual connection type; only test typing is
changed and the same listeners, destruction and test-only key cleanup remain.
Both loopback suites passed **163/163** using ephemeral synthetic credentials;
this is not a connected Edge or production trust receipt. Test hashes:
identity mapping `6424d3492d3360fef836ee6be40b0b30dc173f1f38c3303d43b013d284a93ba3`,
business read `9ecd25b1b1649cdb3d83313b7cb4812f8ddec6d955387d8986bfe0dd56060e73`.
Their standalone strict compile exited **2** with six Fastify cookie-plugin
augmentation errors in `src/auth/cookies.ts`; the standalone root list did not
include `src/app.ts`, which imports the augmentation. A subsequent strict
ES2022 no-emit compile of both tests with `src/app.ts` included exited **0**.
The full project compile remains a separate gate.

### 3 Nov financial batch test typing follow-through

The financial batch test creates `ManagerListsService` using its prototype and
injects private test seams. Applying `Object.assign` to an already-cast class
intersected its private fields with mock objects, reducing the service type to
`never`. The test now casts the completed prototype-backed double instead;
production classes, authorization and financial logic are unchanged. The
financial-batch suite passed **58/58**, including cross-snapshot, currency,
null, duplicate, actor/session and refresh checks. This uses synthetic source
data and does not qualify the Edge carrier. The test SHA256 is
`e902e09dfb8383536bb6b88d171134ad4ee9f89922998b99b4473f6955b32dec`.

An additional diagnostic-only typecheck invocation was piped to `head`, so
its pipeline exit code must **not** be treated as the compiler exit code or a
full gate result. It printed remaining errors including older incomplete test
fixtures and frontend imports. The prior untruncated full-Core failure above
remains the recorded full result; no compiler exclusion was added. A focused
strict ES2022 no-emit compile of this financial suite and `src/app.ts` exited
**0**. It is not a full-Core typecheck or an integration gate.

### 3 Nov STATUS pre-issuance restart boundary

Recovery is narrower than the post-issuance 114-case receipt: `register()`
stores the new context/nonce only in process memory, while migration 0157
stores its immutable correlation in the same transaction as lease issuance.
If Edge has retained an `ACQUIRING` context and Core restarts **before** the
lease commits, `recoverIssue` cannot find a link and refuses with
`COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED`. The new synthetic regression
confirms no original lookup, replacement lease or ACK is fabricated; the full
`command-source-assertion.spec.ts` suite passed **66/66**. Test SHA256
`72180f13ee204f8117f900f5e82f936fcadba0b0dae9477df933d54a3b5907c0`, source
SHA256 `dc7f808dd655e9db9e1cd392c0ea28893bf5672cb29cc6a65cf404625ec3b94c`.
The regression now explicitly shuts down the original authority, verifies its
context is gone, and confirms that preparing again generates a different
context rather than recovering the one Edge might hold. This synthetic test
does not observe an actual Edge reservation or an OS-process restart.

This is a verified fail-closed state, **not completed restart recovery**.
Core and Edge still need a bounded durable pre-issue reservation or another
jointly fenced, authenticated no-lease resolution that preserves the original
context and cannot race a late issue. Separately, an Edge crash at DISPATCHING
before the exact PM response is retained needs an authenticated source-terminal
resolution; the inspected PM handoff declares its full provider unconfigured,
source dark and wire unmounted. A current source proof must not be simulated,
nor may a digest be used to reconstruct unobserved response bytes. These two
boundaries must be included in the final cross-process/connected acceptance.

### 3 Nov pre-issuance reservation follow-through — candidate, not installed

Migration 0158 adds a bounded preparation correlation referencing the pinned
Core original. It contains a public nonce and digest pins, not the context
bearer, JWT, original bytes, source attempt, terminal receipt or Edge ACK.
For a recovery-bound STATUS composition, Core commits the preparation before
the context/token escape, reuses an exact pending preparation across processes,
and verifies current requester, source original, binding, bytes and signing
pins again after restart. A locked check of the existing lease/ACK fence runs
under the same native authority lock as issuance; a concurrent winning lease
refuses a new preparation. Only expired local preparation rows may be removed;
this is not a source-custody resolution and does not delete original,
lease/link, terminal or ACK evidence. Down migration deliberately refuses
without an independently approved drain.

The 68/68 synthetic authority tests include changed authority before restart
and the concurrent-winning-lease fence. A guarded disposable PostgreSQL cell
passed 10/10 affected tests: a new OS process recovered the same pre-lease
context via pinned TEST_ONLY mTLS, refused wrong certificate and altered bytes,
then used a genuine test candidate lease; a separate migration-runner test
verified 0158's down refusal retains its row and ledger. The test source,
terminal and ACK are synthetic and do **not** commission Edge. Source pins at
both ends of the cell: assertion `c2c66698c0bac2e3e787311b3fe9ff14a67599a479965ca94ebfbdca38ff9da5`,
preparation writer `0f66689a03c100d1e98cbd045a19387b0928274630b8064be993e799428fce27`,
migration `038ff501028b47897747648a28d838542a066f41f098efa2ac61e10c8aaeb352`,
PG test `e81edbaa28b4671b2b02f9e7a2eeed8d1560d35cf400845343e099b41fa9f50c`,
rollback test `556dabf1387950b053e4854c6cf9c1cdcc472400b8342714cc39c19550ab87e8`.
The cell's test containers, tmpfs and private network were removed. An
earlier read-only mount lacked writable Vite temp space and never ran tests;
the next exploratory run passed the new case but failed a later case because
the new test had left its synthetic lease outstanding. Its result is not the
final receipt; its isolated DB/network were also removed.

Subsequently, an exact callback retry after another Core process wins ISSUE
was added: the loser rejoins the **same issued lease**, without another
PREPARE, lease or ACK. On the later source hash, synthetic authority tests
passed 68/68 and the affected guarded PostgreSQL/mTLS suite passed 7/7 in
another isolated cell. Final assertion SHA256
`cc1771ac62c5b130cd133366d7f4aa969b69428b5b83dd7937c1daa140f22d6b`,
PG test SHA256 `bb56cbad0bbcd4129d8c5a0046f07ad7f691dfd3b4c0e91ae4804fbd1535b224`,
synthetic test SHA256 `58e3b279bef94ea20b6be4186cfdcbba5831893da769a63b115fbd2dc699fba0`.
The preparation writer and migration retain their hashes above; the 0158 down
test is independent of this later issuer-only change. Cell cleanup succeeded.
A scoped compiler invocation was stopped after its inputs changed during the
run; it is not a passing typecheck receipt for the final source.
On the final assertion/writer hashes above, source-only
`npm run build -- --noEmit` subsequently exited 0. Two additional synthetic
tests cover bounded preparation capacity and changed outbound bytes; the
issuer suite then passed **70/70**, test SHA256
`788163a0252f8974a73a93662b407f3a36a5ea4e644ff2d1f44bc519078b9990`.
This does not replace the full test-inclusive typecheck or normal hook.

#### STATUS subsequent read / stale-context fence

The preceding reservation alone could retain an already-finished local read
until its token expired, reusing its old Edge flight for a later poll. The
candidate now records a **local read-consumed marker** only after the pinned
Edge retained response has passed the existing current-authority checks and
every linked lease has its exact terminal and Edge ACK. It neither writes nor
infers an Edge ACK. A consumed marker can be replaced under the same authority
lock; a stale issuer holding the old context is refused before new ISSUE. No
original, linked lease, source attempt, terminal or ACK is deleted. A retained
no-ISSUE result remains dependent on the trusted Edge response, not a local
claim about PM. Expiry still does not resolve unobserved Edge custody.

In a fresh guarded PostgreSQL cell, **118/118** candidate, recovery/mTLS and
rollback tests passed. The race case checks that exact retry rejoins the old
lease, a confirmed consumed read creates a distinct subsequent context, the
stale context cannot issue, and the new context can issue a second test lease.
The separate synthetic suite passed **71/71**. All source/terminal/ACK inputs
remain TEST_ONLY; no connected source authority was commissioned. The test
container, database tmpfs and internal network were removed. Final source pins:
assertion `1c237033b6d649d1079c2e9805c92edb9450f07d2a8dc25038556c02a8efc79c`,
preparation writer `823c810a4aaac2424c21fdba15052e655cfb150d70c8d1dc7a9d23aea02c631a`,
candidate `7b137dff5ae3966b4cd7396c6f3dc9be39a8ecd41a2441784cf6678e52733d20`,
migration 0158 `2461986e1c4d8873b44aa719368ab2c8b95ab0e38aaa5060c133841ff3f27b53`,
PG test `38ba11a140613db31571bff26b4396f254d9aaf69470f5aec125df30c02c799e`,
synthetic test `74c35d6aeef461aa551ded311e64602a1747b3f7b099c76e8d05443ecce65816`.
These later pins supersede the earlier candidate pins for any future rerun.
The source-only Control API `npm run build -- --noEmit` subsequently exited 0
on these latest assertion/preparation/candidate pins. The full test-inclusive
typecheck and normal hook are separate and are not claimed here.
An `UNKNOWN` Edge response is deliberately not marked locally consumed by
the current transport, because it does not itself establish full outcome
custody. The same flight can consequently remain cached until its context
expires. Whether and when a new source read is permissible for this case must
be verified against the actual Edge/source custody protocol; neither a local
timeout nor this marker is proof of no unresolved source attempt.

Limits: reservation is active only when the private recovery source is bound;
unbound test/legacy authorities still fail closed after a lost pre-issue
context. The final composition/configuration must prove this binding and a
qualified original before installation. Exact resolution of an expired Edge
ACQUIRING or DISPATCHING context still requires source-owner protocol and
cannot be inferred from local preparation expiry. Full typecheck/hook,
final-candidate restore, real ACK, financial/Approval and connected acceptance
remain open; Account-profile has only the previously recorded qualified
synthetic native composition, and the other three sibling readers remain dark.

#### Focused sibling regression and resource disposition

On 3 Nov, the five focused suites for Account CURRENT, sibling source seam,
dark HTTP routes, bounded cursor and paged source passed **82/82** (five test
files, exit 0). This is synthetic/source-only regression, not a connected
Edge or physical production-HTTP receipt. The account identity-only path
does not read financial balances, and remains inside the native delivery
fence; its test uses a fake delivery port. The other routes remain dark until
source publication, field authority and actual native egress are qualified.

SHA256 source pins: Account CURRENT
`4abaf360e75c9b7d76a628c6858d61b5690909a664cefeeb1548fe812d4bc8f6`,
dark controller `6a90adc58f03985adbd7adc658376018e7f00eb6a97f45fcb8a5fa78c03521b5`,
source seam `1d1362dc6d495bd0904e9ed49db70fdf5d914903d02349904fc8c71079eac722`,
paged source `838b731faae2a3497a8b5831d310e7b080644aee7eafc8b71a4a97072e2b75d4`,
cursor `fab2cc73bffcb681f5868c28658d8b85374107d654735b6a50170489bff1c503`.
The focused run used the existing checkout, no new database, container or
network. Disk inspection reported 103 GiB available on the shared filesystem;
unattributed temporary trees and other agents' resources were not deleted.

#### Full Core typecheck, latest candidate

The complete test-inclusive `npm run typecheck -- --pretty false` ran to
completion on 3 Nov and exited **2**, with **337 TypeScript diagnostics**.
The pipeline retained `pipefail` and grouped diagnostics without writing a
temporary log. Errors span existing Research/Execution tests and frontend
modules imported by tests; examples include incomplete `PortalUser` test
fixtures, unsupported `import.meta` under the current compiler module, and
frontend chart/JSX dependencies. This is a failure, not a connected-source
result or a normal-hook pass. No compiler exclusion or type-safety relaxation
was applied. The STATUS assertion, preparation writer, candidate and 0158
migration still match the four latest hashes in the preceding section. The
compiler process finished; no database, container or temporary test network
was created by this run. A final clean-candidate normal hook remains open.

#### ELP2-10 affected test typing and disposable PostgreSQL

The detailed ELP2-10 compile isolated stale test typing in five suites:
nullable controller/metric results, a widened authority literal, cancellation
promises, an intentionally incomplete negative provider and the Node `Duplex`
connection type. The test-only fixes preserve the negative assertions and
runtime behavior. A focused strict ES2022 no-emit compile of all five suites
with `src/app.ts` and the actual ES2022 library exited **0**. The first scoped
invocation omitted the repository's ES2022-only `lib` and included the DOM
`fetch` overload, so its proxy error is not a repository-gate result.

The five suites passed **153 tests**, with **98 PostgreSQL cases skipped** in
the local run. The two affected database suites were then run in a private,
guarded PostgreSQL 16 container and internal network: **143/143 passed**
(including the previously skipped cases; the two runs overlap and must not
be summed). Source, policy and TLS credentials were TEST_ONLY. Container
`control-api-test-postgres-ff317e31` and network `codex-elp210-ff317e31`
were confirmed absent after cleanup. No preview, shared database, source,
grant or Edge runtime was changed. Test SHA256s respectively:
`a2d157ac9dbac65e74575a446784d2cd19846d72de57116e7d08f0b63c32e3e6`,
`d4118abf86ff0dc0b4eec59865ac46de8549c0d141a3761b652354f17ebf17ce`,
`d1c0e3a0f520311a11b666e2e1cca5baa9c3f52f3eee248c9c50c5ce6aa246fa`,
`c3eea58a9e81a1bd57d35458e5d33eeb69d720f1b377045b629ce1b5cf946c32`,
`97919f4b61c2779ef893d8deab8a0ba151066d920345daeef1d696c3aa09a34d`.
Full Core typecheck remains the recorded failure before these five fixes;
do not infer its current total or claim PASS without rerunning on the final
candidate. Normal hook, connected acceptance and final restore remain open.

#### Restored historical clone through current 0158

The opt-in, hostname/database-guarded test
`test/command-status-preview-clone-migration.spec.ts` exercised the actual
working-tree `runControlApiMigrations` against the existing historical preview
dump (SHA256 `324fb9f35dbb606773010af310caf1261e386abc6cb57be3abaf378f9f8c15c8`).
On the isolated restored clone it applied 0155–0158 and compared row counts
and sorted row-content digests before/after for the seven protected tables
listed in the earlier rehearsal. The test passed **1/1**. The test source is
`5d56808c601f2f1f3e7b80ac0c98e7b27fd9732c5a27d004ceea49352f7c763d`;
0157 is `d0e5428fcc6c724de1a033e14f3a585b1318f6472350c0b1c2b589b894bf01b5`
and 0158 is `2461986e1c4d8873b44aa719368ab2c8b95ab0e38aaa5060c133841ff3f27b53`.
The container, internal network and anonymous volume were confirmed removed.
The first attempt used a size-limited tmpfs and PostgreSQL disconnected while
restoring an index; the underlying cause was not proven, the test never ran,
and that failed cell was removed. The successful attempt used a dedicated
anonymous volume, removed along with its container. Neither attempt altered the
source backup or preview. Both restore paths used `--no-owner --no-acl` and
the snapshot is historical: neither is a full owner/ACL restore, a fresh
backup, populated real-custody rollback, or final-candidate qualification.

#### Historical clone with owner/ACL preserved through 0158

The same archived snapshot was restored in a new private PostgreSQL cell
using `pg_restore` without `--no-owner` or `--no-acl`. The isolated `portal`
owner and `portal_research_runtime NOLOGIN NOINHERIT` role were created for
the clone. The current migration CLI applied 0155–0158; the enhanced test
compared the seven protected-table content fingerprints and every pre-existing
entry in its scoped security metadata before versus after migration:
schema/relation/column/function owners and ACLs, relation RLS flags, policies,
default ACLs, and selected role attributes and memberships. **1/1 passed**;
the test SHA256 is
`b65f3ce87a577db2ae1a77e2b7d13c0599c3836c0b29eb5d7d66a4b7023f8cfb`.
Its explicit scope is the `public`, `research` and `elp210_candidate`
namespaces and selected roles. It checks restored-clone before/after
preservation, not equivalence of every PostgreSQL global or live source role,
database ACL or object. The source snapshot remains historical and real
custody in it is empty; this does not establish a fresh-backup, populated
custody recovery, rollback or final-candidate gate. Earlier 0158 down-refusal
tests remain separate.

The first owner/ACL restore succeeded but the new metadata SQL failed before
migration due to an ambiguous PostgreSQL `char` concatenation. That test error
was fixed by an explicit text cast; only the subsequent run above passed. Both
cells' containers, networks and anonymous volumes were verified removed.

#### STATUS callback ACK versus retained-response race

The old `prepareOne` treated a completed lease callback as permission to
rotate the STATUS context even though Edge's retained STATUS response had not
yet reached Core. A new synthetic regression demonstrated the context changed
in that gap. The candidate now rejoins the existing context until
`acknowledgeRetainedRead` has checked and consumed the retained response; only
then can a subsequent read obtain a fresh context. This does not mint an ACK,
reuse a different original, or resolve an UNKNOWN source attempt.

STATUS assertion, loopback transport and composition passed **156/156**.
The first guarded PostgreSQL run passed 117/118; its one failing assertion
still expected rotation immediately after the callback. That test was updated
to require retained-response consumption, and the affected PostgreSQL/mTLS
suite then passed **7/7**, including same-context retry after callback and the
separate-process recovery cases. Both cells and internal networks were
confirmed removed. The data, source and ACKs are TEST_ONLY. Source SHA256
`078aa684373581fbce6af985621a30a553cec4ad6f9d4fd29ded47630803ca75`,
synthetic test `193260b528af028433ab5f2f3faa6b16302ae37c7aee2b2687ad9d62fddbf828`,
PG test `540b3342e7207bb0d86a6bfb291cd005cc45a9ef8f781c897a5a8e58028a190c`.
These supersede the earlier assertion/test pins. The real Edge retained
response, original/lease/ACK and connected acceptance remain unverified.
The Control API source-only `npm run build -- --noEmit` also exited 0 on this
assertion hash; it is not a full test-inclusive typecheck or normal hook.
The 3 Nov read-only HK inspection observed Edge worktree commit
`636d58a7c4368a617903734ab1d0ce933d2804ca`, 96 existing WIP entries and
mailbox files last listed 28 Oct; it did not modify them or prove all other
possible source channels are empty.

#### STATUS failed-waiter retry and resource hygiene

The STATUS transport previously cleared its in-memory promise unconditionally
when a waiter saw an error. A delayed waiter could thereby discard a newer
same-context retry. It now clears only the exact failed promise; UNKNOWN,
original, lease, custody and ACK semantics are unchanged. The focused
loopback mTLS suite passed **19/19**, including a controlled interleaving
regression; this is synthetic, not an Edge commissioning receipt. Source
SHA256 `07e513dd102b85db087847e013fbba8ce8682e10c012c5be77853de8fbd8ffc4`;
test SHA256 `658958858db774fcdb6ca8d55bdd51d39a4bf1bd5607ba9b188f2c22f4e67906`.
The earlier source-only compiler result predates this change; no full
typecheck or normal hook is claimed.

The test closes its loopback listener and sockets; it created no Docker cell,
volume or private key files. A read-only check found no remaining
`control-api-test-postgres-*` containers. Root filesystem had approximately
101 GiB free (84% used, below the 20% free build threshold). The 31 MiB
private historical preview backup remains deliberately retained for the
incomplete restore/rollback rehearsal; shared caches, images and other agents'
work were not removed. A disk-intensive build requires a documented capacity
decision and safe ownership-based cleanup first.

#### Full Core typecheck after the STATUS retry fix

One subsequent test-inclusive `npm run typecheck -- --pretty false` completed
with **exit 2**, not PASS. The bounded summary reported 30 diagnostics in
frontend `execution/v2/blocks/index.ts`, 25 in
`research-compare.service.spec.ts`, 15 in
`research-rf05-current-source-lane.spec.ts`, and 13 in `paper-read.spec.ts`,
among other files. Some frontend modules are imported by Core tests. The
summary pipeline truncated the total and individual messages, so neither a
current total nor absence of other failures is claimed. The prior detailed
337-diagnostic result is not a count for this later candidate. No test or
compiler setting was excluded or weakened. The diagnostic tempfile was
created via `mktemp` and removed by the shell's EXIT trap. No normal hook,
full build, runtime installation, or Edge qualification was performed.

#### Grouped Core test-type corrections

The targeted diagnostic run identified three test/fixture type groups:
Compare fixtures lacked the now-required nullable row fields and explicitly
undefined workspace query member; the shared search repository test helper
erased the types of passed-in mocks; and Paper tests used an outdated
`PortalUser` fixture, an overly broad subclass return type and unchecked
unknown response data. The changes correct those fixtures and add runtime
object/type assertions without altering production code, API, policy or test
expectations. The numeric query bound now explicitly requires a number.

A focused strict no-emit ES2022 compile including `src/app.ts` and all three
test suites exited **0**, and the three suites passed **87/87**. The earlier
full run's summary attributed 25, 15 and 13 diagnostics respectively to
these suites; a new whole-Core diagnostic count has not been obtained, and
the full typecheck and normal hook remain open. Hashes: shared fixture
`214d81b570ea51f3b9d151ee7eb33d661515ca502663a7101078a1913aa6aba5`;
Compare test `ec36283e20a51bb90a1a5e6b63f1f83cf7f1f7e2a49a75938f9caffdbe097b87`;
RF05 test `f2c2440df62917a37ba4390aac6d48e4fda5019ee28a8e212918f378ae8a7c86`;
Paper test `94a7f2552187b9d3bea64ab87c22975533b5b4d3a0032040ec482ec93582dcd3`.
These checks made no test containers, source grants or database changes.
The shared filesystem had 99 GiB free afterward, still below the 20% free
threshold for a disk-intensive build; no shared cache or backup was removed.

#### Additional grouped type fixes and isolated database regression

One bounded diagnostic compile identified stale Fastify inject overload
types in `local-read-authority`, a widened role and deliberately invalid-role
test in `manager-binding-figures`, an outdated Paper-history user fixture,
an unnarrowed FULL-04 recipe union and a Report test accessing a frozen core
before asserting its v2 discriminator. Those test-only declarations were
corrected; the negative-role case remains explicitly negative and the Report
tests now fail if the promised v2 core is absent. No production API, runtime
authority or frontend component was changed.

A focused strict no-emit compile of the four non-frontend-importing suites
plus `src/app.ts` exited **0**. FULL-04 and Report passed **22 tests**, with
one retained-native-data case skipped because its optional source directory
was not supplied. The other two suites ran against a fresh PostgreSQL 16
database on an internal-only Docker network: **8/8 passed**. The first cell
failed before loading tests because the read-only checkout lacked writable
Vite config scratch; the second used bounded tmpfs for both Vite scratch
locations and passed. Both cells' containers and networks were verified
absent afterward; no host port, shared DB, image pull or runtime was used.
The Paper-history fixture change was not included in that scoped compile
because its test imports frontend modules requiring a different JSX/DOM/module
environment. A full Core typecheck, coherent cross-project compiler setup,
normal hook and final-candidate integration remain open.

Test SHA256s, in order: local authority
`ac7dd6dfd6c58980afc7bc6d2f76898777f7cc4bbdc21f703df5a016d7f7072b`;
binding figures `c644eb553f86839a529d289f12ae30defb34848ec058b964e506a17857df1c63`;
Paper history `9089c50f024cd20934d866025312344981292420fc566018bb6767f1e29a0706`;
FULL-04 `b3c31238da8f360d24d73677efe30bc5aaa3fb14a47d2df648d52ce05fcee43f`;
Report `47b04f26c1acb1b5dddaddf43837a84ef3cd87f1ca6204a221721609412722df`.

#### Cursor contract typing and further test fixture corrections

The Journey cursor runtime schema was already accepting its declared cursor
keys, but `Object.fromEntries` erased those keys from the inferred TypeScript
contract. Its shape is now written explicitly and statically checked against
the same key vocabulary; an additional regression checks the exact runtime
keys and their order. This is a type correction, not a new cursor capability
or change to the authorization model. Admission tests now narrow recipe
unions by their existing descriptor discriminator, and the imported-search
and methodology fixtures use complete typed inputs and explicit fixture
validation. The methodology fixtures now use paths compatible with the Core
CommonJS test compilation environment.

The six affected suites passed 226/226 before the additional cursor check;
Journey then passed 18/18 with that new check, and FULL-04 passed 37/37
after the final type-only test adjustment. The first focused strict compile
reported one remaining FULL-04 union access; that test was corrected and the
repeat focused strict no-emit compile of `src/app.ts` and the six suites exited
**0**. No full-Core typecheck, normal hook,
Edge acceptance or final integration is implied. No container, temporary
database, or new host port was created by this batch. The shared filesystem
reported 99 GiB available (15.9% of 621 GiB); the protected preview backup,
shared caches and other agents' worktrees remain intact. A disk-intensive
build still requires the capacity decision recorded above.

The source hash for `foundation.contract.ts` is
`941397627721b7d64f3ec37d760b5728700213e04bc02bf4d71376e12ebbcfde`;
the updated Journey and FULL-04 test hashes are respectively
`74a7d37a60161f6aef7a55d6b2a44ef677b0216b4779548083f4476a68b205d0`
and `cb4f6f05b5374fb42d442ca0365ee233bb98a2edcf2598d0bc7dadf799b7ebf7`.

#### STATUS process restart after delivery ACK but before retained response

The prior outstanding-lease lookup excluded a lease once its delivery ACK was
durable, even if the corresponding STATUS preparation remained unconsumed. A
fresh Core process could then restore the preparation as a pre-lease context
instead of a linked lease. The lookup now also selects the latest linked lease
for a still-live, unconsumed preparation; genuinely unacknowledged leases
remain independently fenced, ambiguity still fails closed, and consumed or
expired preparations are not revived. No source receipt or ACK is synthesized.

On a guarded PostgreSQL 16 cell, a test stopped a Core child process after the
TEST_ONLY terminal and Edge ACK, started another OS process, and confirmed the
same context/token is recovered, an additional issuance is refused, and there
is still exactly one lease and one ACK. A separate fresh-authority case checks
that the old context can be consumed before the next one is admitted. The
seven PostgreSQL/mTLS tests passed **7/7**. The other affected Core tests
passed **98/98**; a first transport attempt failed with loopback `EPERM` under
the sandbox and the exact suite passed **19/19** after loopback permission.
A focused strict no-emit typecheck of `src/app.ts` and the changed PostgreSQL
suite exited **0**; it is not the full test-inclusive Core typecheck.
The internal Docker network, test containers and tmpfs were checked absent
after the cell. These are TEST_ONLY source and PKI, not a real Edge ACK,
commissioning or final-candidate proof. Full typecheck, hook and the other
three source-authorized positive readers remain open.

SHA256: `command-source-assertion.ts`
`4fe841425adcf58208ab919125c9292aba9f73e5c49a3cf3aaa398723a833942`;
`command-source-assertion-pg.spec.ts`
`72d520450d847ba91f3056f2fb22c3849fc8aed0b9cdbd544e990fcd19631cd6`;
child helper `fbdb60b9226bba6285b1dbcff7d477de2788138ad1c11d63ffc85379cd4a8d9e`.

#### Full Core typecheck census and fixture batch

A new full test-inclusive `npm run typecheck -- --pretty false` on the
then-current worktree exited **2** with **204 TypeScript diagnostics**. This
count predates the fixture changes in this section; no later whole-Core count
is claimed. The largest group was the Core test import of frontend barrel
modules under a CommonJS/no-JSX/no-DOM compiler configuration. Tests and
compiler checks were not excluded or disabled. Further failures include stale
test user and source snapshot types and various independent test declarations.

Eleven test files now give their synthetic `PortalUser` the required account
revision and archive state; the warm-up matcher no longer uses an unsupported
generic. In the affected projection tests, synthetic snapshot catalogue
absence is explicit, mocks carry their actual argument shape, nullable test
continuations are typed correctly, and the manager-list tests assert the
unknown public result's structure without an unchecked property access. These
changes do not publish data or grant permissions. Seven local suites passed
**208/208**; the four modified again after that run passed **157/157**, and
market-context passed **8/8**. Command Center, EDS-07 and Maximum Data passed
**23/23** in a fresh PostgreSQL 16 tmpfs cell on an internal-only network.
The container/network were verified absent; the worktree mount was read-only.
Focused strict no-emit compilation of the seven local suites and `src/app.ts`
exited **0**. Full typecheck, normal hook and final candidate
still remain open; none of these test fixtures qualifies an Edge source.

Changed test hashes: Profile `f105ab6bdc96fe022a977598304d2fbb6aae09bce801946e01af58435f8109af`;
Resource `9eb4fb048c71ab1fd648b92fc4ed5081c5767f256fb5f9a5d58d411b49b7c107`;
Derivations `4c4c2b6226fd2317bb9f2e826af29e1c4e29ca96db7f64315e935db558c402cb`;
Manager decimal `0841b13735c16d91704e8e95e02c692e1cb7fa4a0ea79618721297674615d300`.

#### Bootstrap and authority test typing

The Command Center test fixture no longer supplies the removed `pins` input,
and its development login calls explicitly provide the optional assertion
member required by the current signature. The EDS-02 authority fixture now
contains the complete current `PortalUser` shape. The bootstrap test resolves
the same existing fixture locations from its test directory without
`import.meta`, which is invalid under the Core CommonJS typecheck; no bootstrap
configuration or owner policy was changed. The scoped strict no-emit compile
of these three suites plus `src/app.ts` exited **0**. All three ran against a
guarded internal PostgreSQL 16 tmpfs cell and passed **27/27**; the test runner,
database container, and private network were checked absent afterward.
This is not a whole-Core typecheck or connected source acceptance.

SHA256: Command Center test
`e90ecf61887827c7c0a5e2a30d123677219b422230b15b4e64e74b15367e3694`,
bootstrap test `6f6c8ba485027e65143da3071e0ff3e1bbbf48d0aa22d7ee7b0af9e1d49163e6`,
EDS-02 test `43048855d9f7a64c889783bb3366e06487a0c2c627586e0f110e22f5600510df`.

#### STATUS sub-second authority and resource hygiene

JWT expiry is encoded in whole seconds. The previous pre-sign check used the
unrounded bound and could accept a remaining authority lease shorter than one
second, producing an already-expired token and, with durable preparations,
an invalid expiry interval. The bound is now rounded before it is checked;
an expired encoded interval fails closed before a preparation, lease or token
can escape. The new negative test covers this boundary and checks that no
preparation was inserted. The two affected STATUS unit suites passed **99/99**
after correcting the test's initial setup; the first run was **98/99** and is
not claimed as a pass. These are isolated synthetic checks, not a real Edge
ACK or connected acceptance.

Source SHA256 `d74226bdd9551bde774fc305d086223351373a677623791ef408ba879bd983e6`;
test SHA256 `368d264a9f8aaa166146005f583f386a5b520baae7edd2df284521aa4d584993`.
`git diff --check` passed. No task-created temporary directory was found by
the bounded recent STATUS/Vitest scratch check. Existing older temporary
candidate/backup directories were preserved: ownership and rollback relevance
were not established. The filesystem was 85% used (97 GiB available). Direct
Docker socket access was denied, but read-only `sudo -n docker system df`
later succeeded: 384 images, 60 containers, 129 volumes and 3115 cache entries
were reported. There were no dangling images and no containers matching the
inspected STATUS/sibling test names. These are shared resources; no Docker
cleanup is claimed or broad prune performed. Continue
to remove only explicitly identified test cells and scratch from each run;
do not prune other agents' caches, images, volumes, worktrees or backups.

#### Account selection authority follow-up

An initial proposed restriction would have required every entity in a source
selection to belong to its source-pin account. It failed **45/97** tests and
was removed: the qualified selection may contain several accounts, while the
reader makes a separate `entity_id`/limit-one request for the exact target,
validates the returned ID and account, and its native composition separately
requires the target-account and source-pin authorities before HTTP dispatch.
The mixed-account case must therefore not be rejected solely on catalogue
membership. After reverting that over-restriction, the publication, Account
reader and sibling HTTP suites passed **96/96**. These are synthetic tests;
the source, field-authority receipts and native HTTP custody still require
the separately identified commissioning evidence. No runtime was changed.

A subsequent no-emit, test-inclusive `npx tsc --noEmit --pretty false
--incremental false` exited **2**, with 294 output lines (only the first 110
were retained in the command output); it is not a PASS or an exact count of
individual diagnostics. The run overlapped the temporary Account restriction
and its revert, so it is a diagnostic census, not a frozen-candidate gate.
Reported failures still include stale test shapes, cross-project frontend
typing and test configuration. No full hook was run.
The typecheck ran without the campaign heavy lock while a separate Thanhvuong
test was active. Correction: rules §10.10a/b explicitly exclude host `tsc`
from that lock; running without it was not itself a rules violation. This
diagnostic run still was not a frozen-candidate acceptance gate.

#### STATUS shortened-authority deadline and completion retry

The current-human fingerprint is not itself a guarantee that its validity
deadline cannot shrink. STATUS now checks the exact current deadline, in
addition to the fingerprint, before reusing or issuing a context, during
restart recovery, and on both sides of a completion/retained-read disclosure.
Cached successful completions no longer bypass the current-human check. If
authority changes while the authenticated ACK commits, the ACK is preserved
but the completion response is refused; neither an intent nor an ACK is
fabricated. Synthetic tests cover shortened validity with an unchanged
fingerprint, the already-ACKed retry, the ACK-commit race, and restart before
reading the original. STATUS assertion, composition and loopback transport
tests passed **122/122**. The loopback was explicitly
permitted; it is not an Edge-connected or real-source ACK test.

Scheduling correction: the preceding focused host Vitest command was
unnecessarily wrapped in the heavy lock. Rules §10.10b exclude host Vitest;
this was my mistake. Future focused host test/typecheck commands run without
that lock; disposable Docker/PostgreSQL cells use it for the one test command
as the rules require. No other process or lock was interrupted.

Current source SHA256 `92deaeaa1d8a9f8271d05b62eda0ffc3f2df13b667aa7ebd93856beaa3230d6e`;
test SHA256 `f9c8e77c91a8aee464d3ed81b6d5afc5bbd9e7c29fcdcc6cf379afc6c1c8d32c`.
No new STATUS/Vitest scratch directory was found after the run; another user's
test process was left untouched. Guarded PG/mTLS with the changed source,
full typecheck, normal hook and final candidate gates remain open.

#### Guarded PostgreSQL and pinned mTLS retake on shortened-authority source

The affected `test/command-source-assertion-pg.spec.ts` passed **7/7**, exit 0,
in a new isolated Docker cell with the campaign heavy lock held for that cell.
It exercised Core's PostgreSQL persistence, test-only pinned mTLS, same
context/lease recovery in a new OS process, exact callback retry, and UNKNOWN
fencing. The separate 122/122 unit/loopback tests above cover the new shortened
deadline scenarios; those four scenarios were not individually injected into
this PG/mTLS retake. Source/original, credentials, terminal and ACK in the PG
test remain TEST_ONLY; no external Edge acceptance or production ACK is claimed.

Capacity decision: root was 85% used with ~96 GiB free. The cell performed no
image pull, build, dependency install, shared-volume write or host-port bind;
PG data and runner scratch were tmpfs, the repository mount was read-only,
and the private network had no external access. Node and PostgreSQL were
limited to 1 and 0.5 CPU respectively, with 2 GiB and 1 GiB memory ceilings.
The existing pinned Node image was
`sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`
and PostgreSQL was
`sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`.
A separate Thanhvuong Vitest job was active; no campaign hook or heavy lock
holder was observed. The test used one worker and did not alter that job.

The private test runner and PG container and the `--internal` network were
verified absent after exit; no volume was created. The task-owned temporary
runner script (SHA256 `906d0453390958c98c0b2e9115f753c9e5e25f1bec655ee2625c8a5801d7231a`)
was removed after recording its hash. Source SHA256
`92deaeaa1d8a9f8271d05b62eda0ffc3f2df13b667aa7ebd93856beaa3230d6e`;
PG test SHA256 `72d520450d847ba91f3056f2fb22c3849fc8aed0b9cdbd544e990fcd19631cd6`.
This is an affected-test retake, not the full hook or final migration/restore.

#### Current Core test typing: score/history and native subscription

The score population digest reads only tuple identities; its TypeScript input
now expresses that actual dependency rather than requiring unrelated full
manager-member fields. The implementation and digest bytes did not change.
The synthetic product-read fixture now explicitly verifies that its Paper
profile exists before exposing the narrowed configuration; History's query
pairs are explicitly typed as tuples, and the native realtime negative test
uses the ENTITY subscription variant rather than a union of incompatible
callback signatures. No UI, source authority, database or Score formula was
changed. The five affected Score/History/realtime synthetic suites passed
**112/112**; the database-backed History HTTP suite was not run in that batch.

Source SHA256 `9bca8e2e0717047bbc529ff39fb5589682f0594ef0767e3b75d6b876e8b19263`;
fixture SHA256 `7227d2d64ec8ab84348f9d7291de191b9ac52250ebd0b8044885f12ab9e4171f`;
History test `ac8d1a6ef1db1c113f0f0a7630f8264a0b7c8905a1c53eb6e16c53811ebba1f3`;
native test `3e0a744c140ed7513b38ee97a73dddebbc5b9860d466c851b12771a25362b4b0`.
This batch does not claim a full candidate typecheck, hook, PG, source or
browser acceptance.

The first focused strict TypeScript command exited **2** with three errors:
the same fixture's Live profile remained typed optional in the regime helper.
The fixture was then extended to check both its Paper and Live profile before
exposing them (current fixture SHA256
`3fac78b276f66d5ae0e6caa49911aa9966094743a6ab177bc0f86c24ea6ee881`). The
112/112 test result above applies to the immediately preceding fixture hash.
The same focused strict TypeScript retake covering those five suites plus the
History HTTP test subsequently exited **0**. The Regime suite, which exercises
both Paper and Live profiles, was rerun on the current fixture and passed
**35/35**. The History HTTP test was typechecked only, not executed in PG.
No full typecheck or final-candidate hook is implied.

#### Core test typing and guarded loopback retake

Grouped test-only corrections preserve the test intent: a financial mock now
accepts an asynchronous `void` result; the mTLS test server tracks the actual
Node `Duplex` connection type; a readonly reason list is copied for Vitest's
mutable matcher; the pool type is imported; and missing controller/order results
fail explicitly rather than being silently dereferenced. The account-sync
fixture now includes the same workspace/profile/contract lineage shape as the
other current-account fixture rows. No source authority, UI, or production
financial or command behaviour changed in this group.

Six focused suites were run: financial source composition, native ROOT client
and provider, account policy reader, Manager service and execution analytics.
The sandboxed attempt failed 11 listener cases with `listen EPERM` on
127.0.0.1 (134 passed, 14 skipped); it is not a successful run. The exact
suite was then rerun with loopback allowed: **145 passed, 14 skipped**, exit 0.
The skipped ROOT provider cases require PostgreSQL and were not retaken here.
The mTLS listeners were isolated loopback test fixtures, not an Edge receipt.
No database, image, volume or shared cache was created by this run. Disk free
afterward was approximately 95 GiB; no unrelated resources were deleted.

Changed test SHA256s, in the order listed below:

| Test or helper | SHA256 |
| --- | --- |
| `financial-source-composition.spec.ts` | `c6804db30128b2e0e1f4109725f0aee5eb0fc9872e00b4dec3245b0acd1c7e96` |
| `fixtures/elp210-native-root-server.ts` | `6b7e9c111d78bc269b6de421e9cef76dec077e0aa66ec125ba35d17071ff7702` |
| `elp206-policy-recalculation.spec.ts` | `02c29b4f7e3a2db55ddd24f16987426c9a3b10c885942ea4fde2d900416536cc` |
| `environment-parity.spec.ts` | `bbdd88d6c109d03710dd6c729587ed365cad09d43fa5777eccea2c2ee59dbf03` |
| `elp206-manager-service.spec.ts` | `981cb3562dfa5d5ac5ce4d2f4bb15e88c146f2344a7d38d1a2e8ddcba528b09f` |
| `elp204-account-policy-reader.spec.ts` | `ab4bb01167109e53beaee5212ed4de73f5fc512c28d59de7e8517f499bde336d` |
| `execution-analytics.spec.ts` | `1ceb63516f13e30ea3a66060002c6e4fcfc8aec9745590ffde0648a2a6bff5d4` |

The policy-recalculation and environment-parity PostgreSQL suites were not
executed in this batch. A focused strict `tsc --noEmit` covering those two
suites and the six suites listed above exited **0**; this is typechecking,
not an execution receipt for the PostgreSQL cases. Full candidate typecheck and hook, positive
source-authorized sibling readers, connected STATUS and Edge acceptance,
and final migration/rollback remain open.

Follow-up: the Stage authority-change mock keeps its actual no-argument
return type; Manager assertions explicitly reject missing metrics; and the
native custody test constructs its alternate lease binding without narrowing
the lease ID to the UUID template-literal type. Three affected suites passed
**136 tests**, with **31 PostgreSQL native-custody tests skipped**, exit 0.
This follow-up was not included in the earlier eight-file compiler run and
still needs the subsequent grouped candidate typecheck and guarded PG retake.
Their SHA256s are, respectively:
`21a713bd70f444b3b8947cb097f5c61e567d4f823ec44c4e0841111ce4b8bdea`,
`df220d32b35b05b9b140f61af732f69acd921b544fbae4c21635bab5c3b27883`, and
`a2247c93e46dc799c984e8d39510ac06be4b59210d61cc2cb74fdef07f75b9fe`.

#### Guarded native custody, ROOT and STATUS PostgreSQL retake

On 3 Nov, the three suites `command-source-assertion-pg.spec.ts`,
`elp210-native-core-obligations.spec.ts` and
`elp210-native-root-provider.spec.ts` ran together against a fresh isolated
PostgreSQL 16 cell: **52/52 PASS**, exit 0 (7 STATUS, 31 native custody, 14
ROOT). The STATUS cases include a new OS process, the same original/context
and lease, pinned loopback mTLS, UNKNOWN fencing and a separate TEST_ONLY ACK.
These are isolated synthetic source facts, not an actual Edge ACK or connected
acceptance. The seven STATUS cases overlap the prior 7/7 receipt above and
must not be counted as seven additional unique cases.

The first cell attempt exited before tests because Vitest tried to create its
config cache on the deliberately read-only checkout (`EROFS`). The retake
mounted its Vitest cache directories as bounded container tmpfs; the checkout
remained read-only. Both cells used the existing heavy lock, an internal-only
network, PostgreSQL data in tmpfs, no host ports, no image pull/build and no
shared volume. Node was bounded to 1 CPU / 2 GiB, PostgreSQL to 0.5 CPU /
1 GiB. Images were pinned to Node
`sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`
and PostgreSQL
`sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`.
The test runner SHA256 was
`f51c20641f724d8efc9c5ace5af93c3bf37fe2e92b0fc51c7b3e4962f77f37d9`;
the three test hashes were, in order,
`72d520450d847ba91f3056f2fb22c3849fc8aed0b9cdbd544e990fcd19631cd6`,
`a2247c93e46dc799c984e8d39510ac06be4b59210d61cc2cb74fdef07f75b9fe`,
`aed70b3201242cd69d725c4f76989ed1f985eac8fb575f1bd0f383fc53c04e52`.
The assertion source SHA256 was
`92deaeaa1d8a9f8271d05b62eda0ffc3f2df13b667aa7ebd93856beaa3230d6e`.
After the retake, both owned containers, the owned internal network and the
temporary runner directory were confirmed removed. No other cache, image,
volume, backup or process was removed.

The read-only HK Edge check on the same day found the discovery candidate
still at `4cf434c45b4ea5b5d62045edcfa536298c5d1da6`, clean; its catalogue
continues to label `orders_execution_status`, `reconciliation` and
`obligations_unknown_execution_outcomes` UNAVAILABLE with no enabled
environments and unqualified export gates. This is source-catalogue evidence,
not an attestation of the currently deployed image or real authority. The
three positive readers, final candidate gate and connected acceptance remain
open. The Account identity-only positive remains subject to its own source and
native authority commissioning.

#### Full typecheck follow-through and isolated migration suites

The latest test-inclusive Core typecheck exited **2**, not PASS. Its output
included stale test fixture types and frontend JSX/DOM sources pulled into the
Node test compilation through type-only barrel imports. The output was
truncated; this is not a verified diagnostic count. Grouped corrections retain
the existing security checks and test assertions; they adjust test doubles,
fixture return types and validation rather than suppressing compiler errors.
The migration tests use a narrow typed CommonJS wrapper around the same
`node-pg-migrate` runner used by production; compiler configuration and the
migration ledger were not relaxed.

Focused results: shared product/native Manager suites **342/342**; Score,
Governance and ROOT suites **105 passed, 72 skipped** (PG-dependent cases);
history-population, sync and calendar **42/42**; economic, Fleet and regime
suites **81 passed, 15 skipped**. Some later isolated PG tests overlap these
counts and must not be added as independent coverage.

The access-write, command and native-bootstrap suites passed **74/74** after
a retake outside the sandbox's remapped `/tmp`. The first attempt was
**72 passed, 2 failed** because the private-directory owner check refused the
sandbox's `/tmp` owner; its failures were not counted as PASS, and the
security check was not weakened.

An additional focused TypeScript invocation covering the three migration
tests and the three access/command/bootstrap tests was interrupted after
approximately one minute with exit 130 and no diagnostics. It is not a PASS;
the full test-inclusive typecheck remains failed and must be retaken on the
stable candidate.

A separate guarded PostgreSQL 16 cell ran migration recovery, enriched-chart
migration, UDB cache repair, Manager reads, Score restatement and Manager
lists: **95/95 PASS**, exit 0. This exercises a disposable database, not the
preview's live schema or final-candidate restore. Node and PostgreSQL used the
same pinned images, internal network and resource limits listed in the
preceding cell; the exact temporary runner hash was
`376baf3acdefca58455705e1319f45f13106db72d2998df7aff90e5147a5665c`.
The owned containers, network, temporary runner and directory were verified
removed. No image, shared cache, unrelated temporary directory or volume was
deleted.

Claude integration request: inspect the type-only imports in Execution V2
Workbench model/tests which traverse frontend `blocks`/`charts` barrels and
the `@portal/contracts-screen-data` resolution. Keep the existing UI and
security behaviour, and use appropriately scoped type imports/resolution so
Node tests do not compile a frontend JSX/DOM tree. This is a contributor
handoff, not a claim that it resolves every full-Core diagnostic. Full
typecheck, final normal hook, connected source acceptance and final-candidate
backup/restore/rollback remain open.

#### STATUS shared-caller cancellation

The STATUS transport previously used the initiating caller's AbortSignal for
the coalesced Edge exchange. Cancellation of that caller could therefore
abort another caller waiting on the same original and delivery. The exchange
now owns a separate abort controller, tracks up to 64 waiters, rejects each
cancelled waiter separately, and aborts the physical exchange only when its
last waiter leaves. A failed older exchange cannot erase a newer delivery;
the persisted original, custody and Edge ACK are never invented or discarded.
The same original/context remains the only retry identity. Response validation
uses the captured prepared original, not the canceled caller's mutable object.
No command submit or Live route was enabled and there is no schema or public
API change.

`edge-command-status-transport`, `command-source-assertion` and
`command-status-composition`: **125/125 PASS**, using synthetic source data
and TLS 1.3 loopback, exit 0. New cases cover one of two waiters cancelling,
all waiters cancelling then same-original retry, the 64-waiter bound and a
canceled caller mutating its original after the request is shared.
The immediate previous 124-case run overlaps these tests and must not be
counted again. Strict focused TypeScript compilation of these three test files,
stage-drift and their imports on the final source exited **0**, using Core's
ES2022 library setting. This does not replace the full Core typecheck or final
normal hook. Exact SHA256s: transport
`16c3c82f992958db105f9f9b7534b6c2f9ae3fd18f51c927c1155fa905cb0771`,
transport test `60b974e4f1db387282973fdd6a1cb90563a232a21a00c495906f7ad62ebf63dd`,
assertion test `f9c8e77c91a8aee464d3ed81b6d5afc5bbd9e7c29fcdcc6cf379afc6c1c8d32c`,
composition test `bb7b33c545d3ad0a3e315b7a321249475c6f3841a289a6e3b0f54fd6bfce8c22`.
The test servers close their own loopback sockets; no container, image, volume,
credential file or DB was created. Real Edge gateway/original/ACK and connected
acceptance remain unverified, and ELP2-10/11 remain open. Rollback is to revert
the transport/test change before deployment; do not remove custody or evidence.

Stage-drift test typing was separately corrected by exposing the actual
fixture function rather than using Vitest's constructor-or-function mock
union. Its suite passed **31/31** (synthetic, no source qualification), SHA256
`2e58c970105aecc3b4ef3e479e269b0ee6ee8c42af31f53e28c39777d6499379`.
A first standalone TypeScript invocation exited **2** in `proxy.service.ts`
because that ad-hoc command omitted the project's `lib: ["ES2022"]` setting
and introduced DOM's incompatible `fetch` overload; it is not a PASS and is
not evidence of a defect in the actual configured Core build.
The corrected grouped standalone compiler retake, with Core's `--lib es2022`,
subsequently exited **0** for stage-drift and the three STATUS suites.

Read-only SSH repin at approximately 17:33 UTC: the primary Edge worktree
reported `636d58a7c4368a617903734ab1d0ce933d2804ca`; the separate discovery
candidate reported `4cf434c45b4ea5b5d62045edcfa536298c5d1da6` with zero
tracked modifications. This is source identity only, not a deployed-runtime,
catalogue-wide, permission or connected-acceptance attestation. No remote
files, services, credentials or database were changed by that check.

#### Full-Core retake after grouped fixes

`timeout 300s npm run typecheck -- --pretty false` on the current dirty
candidate exited **124** with no diagnostics. The compiler was observed using
CPU and approximately 2.9 GiB RSS before timeout. This is TIMEOUT, neither a
PASS nor a new diagnostic count; the earlier exit-2 full typecheck remains a
failed gate. No files were edited during that invocation and no build output,
database, container or temporary network was created. The normal hook was not
run; it remains required after the candidate and compiler gate are stable.

#### Scoped step-up and Manager test typing follow-through

Corrected test-only TypeScript annotations in `fe015-capital-step-up.spec.ts`
and `manager-domain-successor-pg.spec.ts`: the former identifies its fake
database as a `Pool`, gives mock call arguments their actual shapes and types
the request-header cases; the latter identifies the `AccessRepository` receiver
of its existing spy. These do not change production policy, SQL or routes.
The final step-up test passed **24/24** (exit 0). The Manager PostgreSQL suite
was **not run** in this follow-through; its receiver annotation is a type-only
change and is not a PostgreSQL receipt.

The first scoped strict TypeScript run exited **2** on the inferred union of
the three header fixtures; after explicitly typing that array, a fresh scoped
strict run for both test files and their imports exited **0**, with
`--lib es2022`, `--noEmit` and a 180-second limit. It does not replace the
full-Core typecheck, which remains TIMEOUT above, or the normal hook. SHA256:
step-up test `ef9c17c985100d78f3b93f23736e6b9ad41df145147359cb6551c3e393920a6c`;
Manager PG test `a53f371c9a4449ae9614e25b097913f51a923d83bcf668d3a0d13165996a1edd`.
The test used its own process only; no container, database, image or temporary
network was created. No unrelated cache or resource was removed. Rollback is
to revert these test-only annotations; this does not change custody or data.

#### STATUS cancellation churn and bounded subscribers

The earlier shared-delivery fix bounded simultaneous waiters but attached a
new Promise reaction for every waiter; cancelled waiters remained retained
until a slow shared exchange settled. The transport now has one settlement
reaction per exchange and a bounded subscriber set. Cancellation immediately
removes the caller's subscriber; the physical exchange is still aborted only
when the final caller leaves. An already-settled successful exchange continues
to serve the same prepared original. Original/context, lease, authority and
ACK semantics are unchanged; no command submit or Live route was enabled.

The three scoped STATUS/authority/composition suites passed **126/126** on the
final source (synthetic mTLS loopback). A new regression holds one caller,
cancels 256 sequential callers and checks that only the holder's subscriber
remains after each cancellation, then receives the single Edge reply. This
retake overlaps the earlier 125/125 and is not additive coverage. Strict
no-emit TypeScript for those same three files and their imports exited **0**.
The full-Core typecheck and normal hook remain open. Final SHA256: transport
`ba2be1816bf7854f51a92f8b9f8fc054bf6b2285f4597202d4e2980f96c7ae8f`;
transport test `c69a9ded945f581c4f694e993375c73050eb682b76a7c493a605d89f9c321bdf`.
These supersede the transport/test source hashes in the earlier cancellation
entry, without changing its historical result. Test servers close their own
loopback sockets; the run did not create a DB, container, image, volume or
credential file. No unrelated resource was removed. Rollback is to revert the
transport/test change before deployment, not to erase any custody records.

Read-only HK source repin: discovery candidate remained at
`4cf434c45b4ea5b5d62045edcfa536298c5d1da6` with no tracked modifications;
the primary Edge worktree remained at `636d58a7c4368a617903734ab1d0ce933d2804ca`.
This observes source SHA only, not a real source grant, runtime deployment or
connected acceptance; no remote mutation was made.

#### STATUS shared preparation reservation

The original admission set released an in-progress capacity reservation when
the caller that first created it exited, even if another caller was still
waiting on the same coalesced preparation. A third, unrelated preparation
could then consume that still-needed slot. The reservation now counts waiting
callers for the exact admission and is released only when its last waiter
leaves. Existing authority and custody limits, original identity, no-ISSUE
recovery and fail-closed capacity remain unchanged.

The focused STATUS/authority/composition retake passed **127/127**, including
a concurrent regression in which the first waiter cancels, the survivor keeps
its reservation, and a fifth distinct preparation is refused at the four-slot
limit. Strict no-emit TypeScript for the same three tests and their imports
exited **0**. This retake overlaps the 126/126 above and is not additional
coverage. Final SHA256: transport
`bb97987dc2012e686eba3a2940351903a23f393e14701641c61b6d9ebbb4c627`,
transport test `420317d4c6bd93e4779362b89adbae8eafd2519156d6d0bb6dd430ef2a3fa105`;
these supersede the previous section's source pins. The test uses synthetic
loopback mTLS and closes its test servers; no DB, container, image, volume or
credential file was created. No unrelated resource was removed. This does not
prove a real Edge original/ACK, connected acceptance or full candidate gate.
Rollback is to revert this transport/test change before deployment, while
preserving all existing custody and evidence.

#### Whole-Core compiler completion on the working candidate

The single retake `timeout 720s npm run typecheck -- --pretty false` completed
with exit **2** after approximately 5.5 minutes, not a timeout or PASS. The
output was truncated by the tool, so no total diagnostic count is asserted.
Visible diagnostics include outdated Research test fixture/types and Node
tests importing frontend component barrels, which pull JSX/DOM into the
Core ES2022/CommonJS compilation. No tests were excluded and no compiler
setting was relaxed. The tracked working diff hash observed during and after
the run was `35c224a34ace3474e328b825d660bbe85a5a14b3d123e765992ed1971e032450`;
this is not a source-tree or untracked-files pin. No code was edited by this
agent while the compiler was running. A read-only process sample showed it
active at 4:08 elapsed, approximately 3.1 GiB RSS and 114% CPU; peak resource
usage was not measured. No build output, database, container or image was
created. Full typecheck and the final normal hook remain failed/not run.

#### STATUS transport joined to PostgreSQL restart rehearsal

Extended the existing guarded PostgreSQL restart case to exercise the actual
`EdgeCommandStatusTransport`, not only the authority callback transport. A
TEST_ONLY Edge HTTPS/mTLS server serves the retained original; the original
fingerprint is written through the real Core writer. A new OS process
reconstructs the same prepared context via that transport, checks the existing
lease through pinned callback mTLS, refuses UNKNOWN completion, and after the
TEST_ONLY source terminal and exact acknowledgement reads the retained STATUS
through the actual transport. The test asserts one lease, unchanged command
rows, the exact original prepared assertion, one STATUS request and revoked
session refusal. The source, terminal, acknowledgement, identity and PKI are
synthetic: this is **not** a real Edge ACK or connected acceptance.

An initial focused cell failed because the newly added test imported
`COMMAND_STATUS_EDGE_PATH` from the wrong module; the source server then
raised a TypeError. The import was corrected and a fresh cell passed **1/1**
(six other cases skipped), exit 0. This case overlaps the previous 7/7 and
52/52 restart receipts and is not additional independent coverage. The two
cells each used the pinned Node/PostgreSQL images, an internal-only network,
no host ports or pulls, read-only checkout, bounded tmpfs and limits of
1 CPU/2 GiB for Node and 0.5 CPU/1 GiB for PostgreSQL. Both owned networks and
containers were verified removed; the temporary runner and its directory were
also removed. No shared caches, other containers, backups or volumes were
deleted. Final SHA256: PG test
`b4cbff2824cf43a926f9f3d9a6b36327da78f2bce5043c9674c3276e84dec5f2`, child
helper `962da16deb5942cb0deb6341b5cd507905e6bdb2b3ea259f26533d9bb3b640dc`,
transport `bb97987dc2012e686eba3a2940351903a23f393e14701641c61b6d9ebbb4c627`,
temporary runner `de949a6aa04770d431e684c6c8d60dc243370aedbe72f307d65b833a40c7989e`.
This test-only change requires no migration or runtime setting; rollback is to
revert the test/helper changes, retaining custody and evidence.

The subsequent complete `command-source-assertion-pg.spec.ts` retake in a
fresh cell passed **7/7**, including the extended concrete transport case,
exit 0. It overlaps the prior 1/1 and 7/7, so these are not additive counts.
The same image pins, network isolation, read-only checkout, tmpfs and resource
limits applied; the cell reported its owned container/network removed and the
temporary runner/directory were removed afterward. Runner SHA256 was
`ead550097f4427d499e76ddd4460f5b71304042430030cd6c510af84fdc765c8`.
Focused strict TypeScript for the modified PG test and imports reached its
180-second limit and exited **124** without diagnostics; it is TIMEOUT, not
PASS. Full-Core compiler remains FAIL as recorded above, and no final normal
hook, real Edge ACK or connected source is implied.

#### Focused fixture repairs after the compiler failure

Updated the two blotter test rows with their synthetic workspace/profile/source
lineage, supplied unused constructor dependencies in the artifact-ingress
controller fixture, and annotated the historical test fold input. The
monetary test retains distinct `null`, explicit `undefined`, omitted, invalid
and genuine zero cases; the out-of-contract `undefined` cast is deliberately
limited to the negative test, not production handling. No contract, authority
or frontend design was changed by this test-fixture batch.

A grouped strict no-emit compiler run exited **2** with one reported error:
the test union represented an omitted field as `total?: undefined`. The test
was corrected after that run to exercise both explicit undefined and an
omitted field independently; that corrected candidate has **not** been
re-typechecked. The first attempt to invoke Vitest via a nonexistent root
`node_modules` path exited 1 before running tests. The correct local Vitest
invocation then passed **4 files / 76 tests**, exit 0, including the corrected
negative cases. This is focused evidence only and does not supersede the
failed full-Core compiler or the required normal hook.

Test SHA256 in command order: blotter
`eeb44b7d02a7898041cf732e835a5301bc72d951782a51b2bc9b81392e52fd9c`, profile
`246584b73410847e41eb58a4356ca8da03228a455efdb3be129ca20a17a2170b`, ingress
`442c04f7dfe2fb87171e38af8f54799bd0c48715c19c3a4f25f40868bb6723d5`, causal
`7d2809164f7b7bf284c73ae5608a1d0a3ee8b47a13a288045375153ddeda43ce`.
No extra container, database, image or explicit temporary file was created
for this test batch. The filesystem reported 94 GiB free (85% used); shared
caches and other worktrees were not removed. Changes remain uncommitted; the
final candidate, integration hook and source acceptance remain open.
An elevated read-only Docker check subsequently found no container matching
the `command-status` name filter; this is not a claim about all other resource
names. The normal sandbox could not access the Docker socket.

A subsequent single grouped strict no-emit TypeScript retake of the four
corrected fixture suites plus `command-source-assertion-pg.spec.ts` and their
imports exited **0** on 3 Nov. It supersedes the earlier grouped exit 2 and
the earlier standalone PG-test timeout only for this scoped compile; it is not
the test-inclusive whole-Core typecheck or normal hook. No test file was changed
while this compiler ran; no database, container, image, build output or
explicit temporary file was created for this compile.

Command from `apps/control-api`:
`timeout 360s ./node_modules/.bin/tsc --noEmit --pretty false --strict --skipLibCheck --esModuleInterop --experimentalDecorators --target es2022 --lib es2022 --module commonjs --moduleResolution node test/paper-read-blotter-scope.spec.ts test/profile-screen-composer.spec.ts test/research-artifact-ingress.spec.ts test/research-causal-seal-consistency.spec.ts test/command-source-assertion-pg.spec.ts`.

#### Direct Edge source catalogue recheck

Read-only SSH on 3 Nov checked the Edge campaign worktree at
`feat/execution-edge-upgrade-v1_2@636d58a7c4368a617903734ab1d0ce933d2804ca`.
The registry is unmodified in that worktree, SHA256
`9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67`.
All three families `orders_execution_status`, `reconciliation`, and
`obligations_unknown_execution_outcomes` still state `UNAVAILABLE`,
`NEW_EDGE_V1_EXPORT_NOT_QUALIFIED`, empty enabled environments, and no coverage
proof. Source code components being inspected is not an export or native
authority. The Edge worktree itself has other tracked/untracked WIP and was
not changed. These catalogue pins are source observations, not runtime or
policy pins; they do not prove an installed image, command receipt or connected
acceptance. The separately identified discovery candidate remains
`feat/research-discovery-lossless-v2@4cf434c45b4ea5b5d62045edcfa536298c5d1da6`;
no candidate was installed or merged in this recheck.

#### Whole-Core diagnostic retake and grouped fixture follow-through

On 3 Nov a single `timeout 720s npm run typecheck -- --pretty false` retake
completed with exit **2**. The tool output was truncated; no exact diagnostic
count is asserted. Reported categories included stale Research test fixtures,
three tests importing the unresolved conditional `node-pg-migrate` entrypoint,
Execution fixture lineage, and frontend JSX/DOM/alias imports from cross-loop
tests. This is a failed gate, not a final-candidate acceptance.

The subsequent work uses the existing test-only CommonJS migration wrapper,
sets explicit disabled mirror flags in one isolated cache fixture, adds
synthetic lineage to portfolio fixtures, and aligns other test fixtures with
their existing session and workspace contracts. The sealed-Research helper
now refuses both not-applicable and terminal-absence responses before treating
them as sealed, and candidate-population trial facts are parsed against the
actual schema. No frontend component, source authority or runtime policy was
changed. The affected local suites ran in groups: **43/43**, **41/41**, then
**80/80** after a further fixture adjustment; some tests overlap and these
counts are not additive. The three migration suites and retained-review PG
suite have not been run in a PostgreSQL cell for this batch. Full Core
typecheck, normal hook and final-candidate rehearsal remain open; a grouped
strict compile was started after these fixture changes and is not yet a PASS.

The grouped strict no-emit TypeScript retake then completed with exit **0**
for the 18 listed test files (the 15 local/HTTP fixtures plus the three
migration fixtures) and their imports. This supersedes only that group's
previous compiler errors. It does not execute those tests or supersede the
failed whole-Core check. The later edited Research fixtures were outside this
group and require their own validation. No test, database, container, image,
build output or explicit temporary file was created by the compiler.

The subsequent Research test-only batch explicitly guards terminal split
absence and nullable source values, binds Compare to its existing optional
workspace parameter, and reads the Replay contract's actual
`emitted_point_count` for the far-seek assertion instead of the nonexistent
`source_sample` field. A focused run with fixture writing disabled returned
**10 files / 173 tests passed, 1 opt-in real-data test skipped**, exit 0.
The skipped case had no real HMD export path and is not evidence of a real
engine run. Its strict grouped typecheck was started separately and is not yet
a PASS. No fixture writer, PostgreSQL, Docker resource or build output was
used in this run. No whole-Core gate or connected acceptance is implied.

The subsequent scoped strict no-emit compiler retake for those 11 Research
test files and their imports exited **0**. The real-data test remains skipped
in the execution receipt above. This scoped compile does not retake the
whole-Core gate, and the later Release Candidate/lineage test edits are
outside its scope.

The later Release Candidate and lineage fixture tests, including explicit
object validation before removing a synthetic witness, passed **42/42** in
two files. They have not yet been included in a subsequent TypeScript retake;
this focused test result is not a full-Core gate.

#### Whole-Core retake and isolated migration tests

The next test-inclusive whole-Core `npm run typecheck -- --pretty false`
completed with exit **2**: 45 diagnostics, one in a backend test constructor
fixture and 44 in frontend files reached through cross-loop test imports
(including unresolved `@portal/contracts-screen-data` and JSX configuration).
This is a failed gate, not an acceptance. The backend test fixture was then
updated for the existing required `whatIf` dependency; its focused Vitest
run passed **16/16** (test SHA256
`f4a858a9d96bab1676e648ade9685ea61339fcd2c7f8e7d84e891b2503e16194`).
The full compiler was not rerun after that edit, so the
effect on the complete diagnostic count is not asserted. The frontend boundary
remains an integration issue, not an excuse to exclude tests or relax types.

The three migration-wrapper suites were executed against a disposable,
network-isolated PostgreSQL cell: **3 files / 29 tests passed**, exit 0. The
cell used existing Node image
`sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`
and PostgreSQL image
`sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`;
the temporary runner SHA256 was
`c32b2004e1ba50d7e3febbd90d7a5bcd28d1c96134b25d76a3ef30eb78dece7e`.
The runner confirmed its own containers and network removed, and its own
temporary script and directory were removed afterward. It did not access the
preview database or prove final-candidate restore/rollback. No other worktree,
shared cache, image, database, or service was removed.

A subsequent grouped strict no-emit compiler run for the W1 ingest fixture,
the Release Candidate retained fixture, the lineage fixture, and their
imports exited **0**. This is scoped type evidence, not another whole-Core
run or normal-hook PASS. `git diff --check` also exited 0 on the working tree.

#### Cross-loop compiler boundary experiment

On 3 Nov a temporary no-emit Core-derived configuration enabled React JSX and
DOM libraries, mapped `@portal/contracts-screen-data` to the generated
contract, and included only `paper-history-depth.spec.ts` and
`paper-history-http.spec.ts`. The compiler exited **2**: the global DOM fetch
overloads rejected the existing Node `Buffer` proxy body in
`src/facade/proxy.service.ts:224`, and the second frontend alias
`@portal/contracts-governance` was missing. The experiment demonstrates why
adding DOM/JSX wholesale to Core is not a safe or complete fix. The test
configuration and its owned temporary directory were removed. No repository
configuration, frontend code, runtime policy or test coverage was changed.

Claude handoff remains to isolate the two Workbench type-only barrel imports
from JSX and provide appropriate generated-contract resolution for the
cross-loop tests, without excluding them or changing the UI. A full Core
typecheck and normal hook remain required after the compatible fix.

The subsequent read-only HK mailbox recheck on 3 Nov observed the Edge
campaign worktree still at `feat/execution-edge-upgrade-v1_2` /
`636d58a7c4368a617903734ab1d0ce933d2804ca`; the newest listed EPG10-08 files
remain dated 28 Oct. This is a source/mailbox observation only: it does not
assert runtime status or current authority and does not establish a qualified
source, fresh grant, ACK or connected acceptance. No remote file was changed.

#### Test-inclusive Core and cross-loop typecheck

The compiler boundary is now handled without changing the frontend or adding
browser globals to the main Node project. `tsconfig.json` omits exactly the
two browser-dependent Paper history test entrypoints from the Node project;
`tsconfig.cross-loop.json` includes both with JSX, DOM and the two generated
contract aliases. The mandatory `npm run typecheck` invokes both compilers
with `&&`. A bare `tsc --noEmit` is only the Node portion and is **not** the
complete test-inclusive gate. The boundary regression asserts that both
entrypoints are in the cross-loop project, that its exclusion list is limited,
and that the package gate runs both projects. This supersedes the preceding
request for a frontend type-only change; Claude need not change the component
or model for this gate. It does not change fixture or browser acceptance.

The proxy's actual `globalThis.fetch` implementation and request bytes are
unchanged; a Node `undici-types` type assertion is used solely to resolve the
conflicting DOM overload when compiling the cross-loop project. Its existing
6.21.0 type dependency is now explicit in package/lock. The first targeted
project run after the change exited 2 on a type-conversion diagnostic; it was
corrected with an explicit Node-only assertion and is not counted as PASS.
The focused boundary and W1 ingress suites then passed **17/17**, and the
single full `timeout 1200s npm run typecheck -- --pretty false` run completed
with exit **0**, including both compiler projects. No frontend, schema, source
authority, API behavior or runtime service was changed. This PASS applies to
the working candidate at the following file hashes, not to a future SHA or
the connected Edge gate:

- proxy `e9aee1ec6063885a9c4069e67e92182c34f48aee74216ed32f2531e31808a911`;
- Node config `9b146ae251250b848a9e84bf07229c171cb75d220102fb1df0855698a337e962`;
- cross-loop config `2c7178414e1965f236633235c319fbf2b8999e94a459aabca45449cf3fcadb23`;
- package `554cf346019ea3857528134bc567d8caa0d350555494dd9a37b873114b50c656`;
- lock `a0d5c4ea56a8c421ba3ca9e1dd1d76388740bfed72b82ae340209b32c9d42750`;
- boundary test `8f892b1e8f05f757eb1d1058e700ecce08dab69d0dce282ade0311b97c816182`.

No temporary runner, DB, container, network, image or build artifact was
created by this gate. Rollback reverts these configuration/type-only changes
together; reverting only the cross-loop invocation would silently lose part
of the gate and is not an acceptable rollback. Normal hook, final-candidate
migration/rollback, qualified sources and actual Edge ACK remain open.

#### Populated STATUS custody backup, restore and guarded down

On 3 Nov the STATUS PostgreSQL suite was run in a new internal-only disposable
cell with the explicit `TEST_ONLY_DISPOSABLE_RESTORE` switch. This leaves the
suite's synthetic candidate schema in that disposable cell long enough to
snapshot; ordinary test runs still remove the schema. Its database guard runs
before any writer. The real local Core writers, synthetic source/PKI and
process-restart mTLS tests passed **7/7**. The cell's PostgreSQL then made a
custom-format dump and restored it into a second, uniquely named database on
the same isolated server; the archive existed only in container tmpfs.

The first restored-copy comparison failed because the lease table's raw ACL
changed from an explicit owner-default ACL to NULL. This was a real observed
representation difference, not a PASS. The comparison was corrected to
evaluate PostgreSQL's effective default ACL while separately reporting raw
differences; the entire cell was rerun. The second STATUS suite again passed
**7/7**, and the restored-copy test passed **1/1**. It compared nonempty
canonical row JSON counts/MD5 for the four STATUS custody tables and native
leases, the full migration ledger, and owner/effective-ACL/RLS/trigger metadata
for those five tables. One raw ACL representation difference remained and was
explicitly reported. The actual migration runner refused down of 0158 without
the approved drain; the restored and source snapshots remained unchanged.
MD5 here is an equality check over this synthetic fixture, not a cryptographic
integrity attestation of production or every schema/role. Archive SHA256 was
`1bf7d13bc14c272fa0d780b19c53d32d3710083d5ef07e2dc10dab1559ff4f8b`;
the archive is deliberately no longer retained.

The owned runner SHA256 was
`8a3b4f21cdce35eea8a7ceedb0535a0ddc8635478a91099b70b8bfb250d8b05d`;
it used the Node and PostgreSQL image digests listed in the prior migration
cell receipt. Both iterations verified their own containers and networks
removed; the temporary runner and its directory were also removed. No preview
database, source credential, live Edge, shared cache, image or unrelated
resource was touched. Source pins: STATUS PG test
`524fdff35afd767f9e18ecc9e81484d3af6bc369d14d28ae5a70875c484a61ea`, restore
test `0692169078b215535169dc37dd4c8ebeab491ac4192fcb30afedc6774ae60b5a`,
0158 `2461986e1c4d8873b44aa719368ab2c8b95ab0e38aaa5060c133841ff3f27b53`.
This improves the populated-custody rehearsal, but is not the final candidate,
a full owner/ACL or historical-data restore qualification, a production
backup, or an actual Edge ACK. The whole-Core typecheck PASS in the prior
section predates these test-only edits and must be revalidated at final gate.
A grouped strict no-emit TypeScript run for the two changed STATUS PG/restore
tests and their imports subsequently exited **0**; this scoped result does
not replace the full final-candidate compiler or normal hook. `git diff
--check` also exited 0.

#### Test-cell packaging follow-through

The subsequent review found that `control-api-test.sh` stages an explicit
file list: without the new cross-loop config, its copied boundary test would
fail when opening that file. The control API test cell and the PG measurement
and M6 drill cells now each copy `tsconfig.cross-loop.json` alongside the
existing configurations. `bash -n` exited 0 on all three scripts; this is a
syntax/static packaging check, not a normal-hook or Docker-cell execution.
The scripts' respective SHA256s are
`157cca085f26d67713e518897c2f6c5e61b20840f85d554e97bf3e8e6b36586d`,
`2c90ae83766606ff6e5634961b4cb272242798e28156b814167a09db389972bf`, and
`b356764493fa2ef4265253d843aec3a448a95b851944114f6e7802794b9e7a73`.

A focused fetch-spy regression also verified that the proxy forwards the same
binary Buffer, string or absent body to the Node global fetch and preserves
the selected response fields. Together with the config-boundary test this
passed **4/4**, and a grouped strict no-emit compile of those two test files
and their imports exited **0**. This is a local mock, not an external HTTP or
source-qualification receipt. Test SHA256:
`9a258e5edb56c1511ccbe0c179ada75779a61ee974267004e080a194052b5933`.
No DB, container, image, temporary runner or frontend file was created. The
new test and shell edits postdate the full-Core compiler PASS; the full gate
and normal hook must be retaken only when the final candidate is frozen.

#### Official focused Control API cell retake

On 3 Nov, under the heavy-cell lock, the actual
`scripts/control-api-test.sh test/cross-loop-typecheck-boundary.spec.ts`
completed with exit **0**. It used the script's pinned Node and PostgreSQL
images, installed the lockfile in its disposable dependency cell, compiled the
Control API, applied the migration chain through 0158 to disposable
PostgreSQL, and ran the selected boundary test **1/1**. Its built-in custom
dump/restore drill then reported success for legacy counts/access digests and
the versioned preservation profile. This confirms the newly staged
cross-loop config is present in the official test cell. The output's long
migration listing was truncated in the tool display; the final command exit
and explicit drill result were captured. This is a focused test and a fresh
synthetic database, not a full test suite, normal hook, final-candidate
historical restore, or connected source acceptance.

The script completed its cleanup trap. Subsequent read-only Docker queries
found no container named `control-api-test-*` and no network named
`control-api-test-net-*`; the generated temporary dependency directory's exact
name was not captured independently, so only the script's cleanup is asserted
for that directory. No preview database or runtime was used. The current
`control-api-test.sh` SHA256 is
`157cca085f26d67713e518897c2f6c5e61b20840f85d554e97bf3e8e6b36586d`.
The full typecheck result above predates the later test-only changes; final
typecheck, the full normal hook and final-candidate rehearsal remain open.

#### Resource follow-up, 2026-11-03 19:17 UTC

The shared filesystem reported 527 GiB used of 621 GiB, with 94 GiB available
(85%). Read-only Docker checks through the script's existing passwordless-sudo
fallback found no containers or networks named `control-api-test-*`. A scan
found older, ambiguously owned test logs under `/tmp`; these were preserved.
No shared image, volume, build cache, unrelated temporary file, service or
user data was removed. Subsequent test cells should remove their own explicitly
identified temporary resources on exit and verify that cleanup; shared
resources require ownership and impact to be established before removal.

#### Full typecheck retake after test-cell follow-through

On 3 Nov, `timeout 900s npm run typecheck -- --pretty false` in
`apps/control-api` exited **0** after both the Node Core and cross-loop
TypeScript projects completed. This supersedes the previous typecheck result
that predated the STATUS restore and cell-packaging test edits, for this
working tree only. No compiler diagnostics were printed. The unstaged tracked
diff for `apps/control-api` and `packages/contracts` had SHA256
`b7c668bddd64e18cc49cb024a3229c96f2544f154845d8482b809b34ba4815fb`
both during and after the run; there were no staged paths. The aggregate of
the untracked file names and SHA256s in those two directories at completion
was `d8b07fc8126bb1a231efe9a59016fa68228affef51314c9cebf1c1557971aa33`.
These are working-tree fingerprints, not a commit or a runtime-image pin.
This no-emit check did not create a test cell or touch preview runtime. The
normal hook and final-candidate migration/rollback remain open, as do the
three unqualified Edge publications, real source authority and connected ACK.

A read-only check of the Edge worktree and local branch refs on HK in this
turn found the newest Edge candidate commit still dated 28 Oct; no newer
source receipt was found in the EPG10-08 mailbox. This is not a runtime,
grant or trust qualification, and no Edge service or file was changed.
