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
Sibling seam/cursor/page tests passed **24/24**; strict TypeScript on the three
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
