# V2 restore inventory diagnostic — 5 November 2026

Status: **source/test WIP, unmounted; NOT an operational recovery barrier**.
On `docs/research-loop-plan`, base `2faa8968fddbde59b2e59525e334ba3d83886144`.

## Change

`apps/control-api/src/execution-v2/restore-inventory.ts` captures a bounded,
repeatable-read, read-only diagnostic over a closed set of 28 V2 tables. It
compares row counts/digests and a digest of selected owner, ACL, RLS, column,
constraint, trigger/function and policy metadata; raw rows do not leave the
database. Missing relations or over-limit tables fail closed. A match is named
`LOCAL_MATCH_NOT_A_CUTOVER_FENCE` and grants no authority or permission to
resume service. Per-table row limit 100,000 and per-statement timeout are
diagnostic bounds, not approved production capacity.

The 05 November continuation explicitly rejects a PostgreSQL role for which
RLS is active or cannot be established. `SET LOCAL row_security=off` does not
grant BYPASSRLS; it makes a would-be filtered query fail rather than silently
comparing a partial view. It also rejects duplicate/missing relations and
malformed row counts. This is a diagnostic hardening, not cutover permission.

Current source SHA256 `0510bdceb4a3e7e9ed61282625c5e731536a18e2122a064cdddb98640005f68b`;
unit test SHA256 `d8855f5343a7d63f7491e92cf4f7ab38020737af8f1fd351c640adb720a6de21`;
PG retake test SHA256 `d0b03ae718a9aa319fbbaadfe57bfb55ec450774afd9711f430bf6ced5108586`.

## Checks and meaning

- Focused inventory Vitest: **9/9 PASS**; focused strict TypeScript of this
  module and related tests: PASS.
- Synthetic PostgreSQL/mTLS/restore test: **1/1 PASS, 7 skipped**, exit 0,
  `TEST_ONLY_COMMITTED_ACK_RESTORE_PASS`, using the existing
  `/home/bobby/.local/state/portal-research-evidence/elp2-ack-restore-20261104/run-committed.sh`
  under `/tmp/portal-heavy.lock` on 5 November. It exercises terminal and ACK persistence
  across `pg_dump`/`pg_restore` and a real source logout after snapshot. It
  compares restored and source inventories: the formerly active restored
  session differs from the now-revoked source and the authority table differs,
  even though the old ACK remains present. See the test and its runner output;
  this is an isolated synthetic case, not an Edge acknowledgement.
- The runner used PostgreSQL image `sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`
  (1 CPU / 1 GiB) and Node image `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`
  (3 CPU / 3 GiB), with private network and temporary data. No matching test
  node/network remained afterward; an unrelated similarly named postgres
  container was observed and left untouched.
- Separate actual PostgreSQL negative: `bash scripts/test-elp2-restore-inventory-rls.sh`,
  **2/2 PASS**, including the safety guard and a real non-superuser,
  `NOBYPASSRLS` role whose ordinary query sees zero of one source session.
  Inventory refuses that role instead of returning a false matching inventory.
  The test uses a fresh empty disposable DB, internal network, 1 CPU/1 GiB PG,
  2 CPU/2 GiB Node, and the same pinned images above; it holds the heavy lock
  and tears down its own DB container/network. No real source was accessed.
- The inventories are captured in separate transactions. An equal result cannot
  rule out post-capture writes, omission of future tables or metadata outside
  the selected list; no independent authority, cutover lock, old-writer fence,
  or trusted source terminal/ACK reconciliation is implemented here.
- The separate source-level C2 revoke/settlement tests were retaken with
  `bash scripts/test-elp2-restore-inventory-rls.sh c2-revoke`: **3/3 PASS,
  108 skipped**, using pinned Node 22 and disposable PG under the heavy lock.
  They cover COMMITTED/ROLLED_BACK exact-original settlement and unrelated-user
  global revision; they do not qualify an installed listener or represent TS
  acceptance. The previous unlocked run is retained in its original record.

The legacy DR guard remains fail-closed for V2. Do not replace it with this
diagnostic. Required next: an independently held current-authority checkpoint,
quiescence and old-holder fencing, source-authenticated post-snapshot terminal
and ACK reconciliation, then a fenced cutover drill. Edge coordinates the
source contract via `CORE_TO_EDGE_C2_AUTHORITY_AND_RECOVERY_20261105.md`.

The diagnostic changes no API/UI contract, needs no Claude consumer action,
and has not been installed, committed or landed. Rollback is to omit these
unmounted files/test edits; no production data or runtime was changed. Full
integration hook, final candidate/recovery qualification and real connected
Edge/browser tests remain outstanding. Preserve unrelated WIP.

## Parallel A2 preparation

The existing public A1 and B1 directories pass their respective `SHA256SUMS`;
the supplied TS CSR self-signature verifies with `openssl req -verify`. This
checks integrity and proof of possession only. It is not a signed client
certificate, installed issuer/listener, delegation, C2 seal or B2 signature.
The public [A2 checkpoint](CORE_TO_EDGE_C2_A2_CHECKPOINT_20261105.md) was
mirrored write-once to the HK Edge mailbox; both copies have SHA256
`6da6a07179967f3790c14b297b453fc523460a935c269dc96f4b0d282551ef32`.

## Core-local quiescence follow-through

`restore-core-quiescence.ts` is a private, **unmounted** local preparation
layer over the existing candidate drain and authenticated source resolution.
It leaves the drain in place and cannot authorize cutover. The same original
must already have entered; the source proof is verified by the existing
candidate resolver. It does not create source receipts or ACKs.

Focused unit tests are included in the combined **32/32** local suite. In
addition, `bash scripts/test-elp2-restore-inventory-rls.sh restore-core` passed
**1/1**, with 111 unrelated cases skipped, on a fresh isolated PostgreSQL and
the pinned Node/PG images under the heavy lock. The retake exercises wrong
attempt and signer, source `UNKNOWN`, a newly constructed service instance
reading the retained drain, exact-original terminal resolution and replay,
and refusal of fresh issue. It is not a separate-process or restored-database
cutover test. The cell's own containers and internal network were removed.

The focused strict TypeScript retake passed after specifying the repository's
decorator flags. An initial ad-hoc invocation without those flags exited 2;
it is not counted as a pass. For current hashes and A2/B2 state see
[preparation follow-through](CORE_C2_PREPARATION_FOLLOWTHROUGH_20261105.md).
