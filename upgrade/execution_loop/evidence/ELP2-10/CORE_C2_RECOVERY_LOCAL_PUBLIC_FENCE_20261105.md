# Recovery candidate — local public-table fence, 2026-11-05

**UNCOMMITTED, UNMOUNTED, TEST-ONLY.** Not a product migration, independent
authority, old-clone/HTTP/source fence, Edge ACK, or restore/cutover permit.
V2 restore remains refused. The chosen single-login model is a candidate and
is not a claim about the actual multi-service runtime or its approved ACLs.

## Scope and change

The previous local generation stop covered 21 candidate tables, but not
public identity, session, activation, grants and local custody. A frozen
checkpoint could be captured while those public tables remained writable.
The new isolated SQL extension adds statement-level guards to the exact 28
public tables in the current C2 inventory. Selected mutations hold a shared
generation-head lock until commit; `stop_writes` waits for them and later
selected writes fail. The guard rejects a selected writer with public schema
CREATE, table TRIGGER, ownership or inherited authority, in addition to the
existing C2 writer checks. Missing, disabled or changed public guards fail
closed for other guarded public writes.

`captureFrozenAndAppend` now refuses a frozen capture when that extension is
missing, its fixed guards do not match, or the previous writer is unsafe.
The source tables remain SHARE-locked while the separate checkpoint is
appended. The test also checks the SQL list agrees with the TypeScript
inventory list. Candidate definition and runtime ACLs still require separate
trusted installation and verification; database owner/superuser and unknown
public tables remain outside the stated boundary.

This is intentionally more restrictive than the prior `FROZEN_SOURCE_CAPTURE`.
Existing history is not rewritten, and retry/compatibility and migration must
be reviewed on a final selected candidate. A local stop can pause logout
updates on this database: safe operational routing, availability and
independently fenced alternative authority are required before any use. Do
not deploy this candidate merely because isolated tests pass.

## Test evidence

- Two-cluster disposable PostgreSQL retake: **8/8 PASS**. On the real migrated
  schema a session revoke holds the fence while stop waits; after it commits,
  a subsequent attempted session reactivation is denied and checkpoint binds
  the updated authority revision. Tests also reject the missing extension,
  an incomplete/disabled activation trigger, public `TRIGGER` and schema
  `CREATE` grants, and retain lost-COMMIT-response same-operation recovery.
- The first two executions were **7/8**, failing because the synthetic test
  role lacked existing authority/native-custody trigger read privileges. The
  grants were corrected in the disposable test only; these failures are not
  counted as passes or as a production ACL policy.
- Checkpoint and inventory unit suites: **20/20 PASS**. Focused strict
  TypeScript source check: exit 0. This is not full typecheck or normal hook.
- The cell's trap removed its own containers/network. A subsequent read-only
  `sudo -n docker ps -a --filter name=elp2-ckpt-` found none. Filesystem was
  57% used. `git diff --check` passed for tracked changes.

| Working-source input | SHA-256 |
| --- | --- |
| `restore-local-generation-public-extension-candidate.sql` | `65a5d1b44967e94936d512de1f48d4ec7e0aeac05131b0b8c008eb6931eadbd9` |
| `restore-checkpoint-authority.ts` | `e316ea7abb57ed5c7dceece3d8e4701aed71ba72e239c6747deffdf33d719bc8` |
| `restore-checkpoint-authority-pg.spec.ts` | `92f32a0e8e1f4bafa8b4076aa6fccd49d466999897e58b80b9dd68e48b847c7e` |
| `restore-c2-inventory.ts` | `130eccacb990d46ee2c5a5b4431c7b28eb1cc56644cdd749f3ebf47648a13ca6` |

## Remaining and handoff

Core must finish the complete writer/authority census, qualify exact
role/schema/function bodies and privileged paths, independently fence old
holders and remote/source/HTTP operations, reconcile post-snapshot terminal
and actual ACK, and rehearse an actual representative restore with the final
candidate. Integrate/review WIP and retake affected checks before the single
normal hook. P7/A2 and connected acceptance remain open. No frontend contract
or Claude consumer action arises from this internal candidate. No shared
runtime/database, Edge, UI or Git remote was changed.

## Follow-through: candidate-guard drift and exact target set

The earlier retake above did not make frozen capture refuse a disabled guard
on the 21 C2/delivery tables. Observing the changed metadata in a digest is
not the same as rejecting it. The working candidate now checks the exact
C2 relation set, all 21 generation guards and the five delivery invariants;
guarded public writes reject the same drift. At checkpoint time the public
target names returned by the SQL function must exactly match the public
relations in the TypeScript inventory. The same trusted-database-admin and
unlisted-authority limitations above still apply; these catalogue functions
are not independently authenticated installation authority.

Focused retake on the new source: **8/8 two-PG**, including disabled C2 lease
and delivery business guards both before freeze and at checkpoint; unit
**20/20**; strict focused TypeScript exit 0. The cell containers were absent
in the subsequent read-only Docker inspection. `git diff --check` passed for
tracked files. New pins replace the corresponding three pins above:

| Working-source input | SHA-256 |
| --- | --- |
| `restore-local-generation-public-extension-candidate.sql` | `43c5f06173fa5559b1f6c9d8aecfa1a6b0b607bc5b916b671a55a3c636df2985` |
| `restore-checkpoint-authority.ts` | `2371dc74373b8a77a6925600b641d2c6feefebb344477dc86221ff4c897e9031` |
| `restore-checkpoint-authority-pg.spec.ts` | `c341871d2d9532067d5ccc0b2cea922cfabef4770237ed5ad3714d97df1df379` |

The result is still uncommitted/unmounted; no normal hook, actual old-holder
fence, source ACK or recovery cutover is claimed.

## Follow-through: consistent writer admission and candidate writes

The previous extension checked public privileges only on public-table writes
and frozen capture. Rotation still selected a writer with public `CREATE` or
`TRIGGER`, and a selected writer whose public privileges later drifted could
still mutate C2 tables. The local extension now applies the same public writer
and full public/C2/delivery guard checks when rotating and on candidate-table
writes. A rejected rotation does not select a writer or consume a generation.
The previous fixed-table, trusted-administrator, single-login and source/HTTP
limitations remain; this does not establish a complete recovery barrier.

Focused two-PG retake: **8/8 PASS**, including rotation refusal for public
`CREATE`, `TRIGGER` and disabled public guards, and candidate write refusal
after those grants or guard drift. The test also exercises the legitimate
same-original settle/freeze path. Test cell cleanup was verified with a
read-only Docker container list; no named cell container remained. No full
typecheck or normal hook was run; this change is SQL plus its isolated test.

| Working-source input | SHA-256 |
| --- | --- |
| `restore-local-generation-public-extension-candidate.sql` | `a5514cf66befa3bb166835aca95259ddb89435fc14cd05379ada76bd94e3ca7f` |
| `restore-checkpoint-authority-pg.spec.ts` | `e923a852515fd5cd400ba850e802602e002affb6dc658ed4032771b0dbc6f1be` |

Still source-only and uncommitted. Independent operational authority, full
writer census, old-holder/source/HTTP fencing, source ACK reconciliation and
representative restore are open. No frontend contract or action is requested.
