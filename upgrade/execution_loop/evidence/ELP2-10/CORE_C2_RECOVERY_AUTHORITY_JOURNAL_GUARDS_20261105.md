# C2 recovery — local authority journal guards, 2026-11-05

**SOURCE ONLY / UNCOMMITTED / UNMOUNTED.** No runtime, schema, grants,
source authority, Edge ACK, restore or cutover was changed or qualified.

The independent checkpoint and original-custody event tables previously
relied on hash-chain verification alone; a writer with table update/delete
privileges could rewrite the stored rows. The candidate schemas now reject
UPDATE, DELETE and TRUNCATE on both event journals. Checkpoint append and
custody append/replay hold a table lock through commit and fail closed when
their immutable triggers are absent or disabled. Custody also checks its
source-proof trigger and preflight checks both guards. This is an incremental
database-local protection, not authenticated external checkpoint authority.

Actual PostgreSQL race testing caught a material error: the first implementation
used `ROW SHARE`, under which `ALTER TABLE ... DISABLE TRIGGER` succeeded while
an append waited on its head row. That run failed 2/8 (the second failure was
a dependent test after the first aborted). The implementation now uses `ROW
EXCLUSIVE`; the final race test verifies that DDL times out while the append
transaction holds the guard. This lock does not protect against replacement of
a guard function by a privileged schema owner, a superuser, another cluster,
filesystem rollback or missing authority/ACK history. Function body, grants,
writer/installer separation, storage independence and availability/lock-order
still need a reviewed installation and qualification. These unnumbered test
schemas are not a migration; any existing candidate schema needs an explicit
forward upgrade and compatibility review before use.

## Actual tests

- `scripts/test-elp2-restore-checkpoint-pg.sh`: final **8/8 PASS**, two
  disposable PostgreSQL clusters. Covers rejected UPDATE/DELETE/TRUNCATE,
  disabled-guard refusal, privileged corruption detection after re-enabling,
  lost-response retry and the DDL race. The earlier race run failed as above.
- `scripts/test-elp2-independent-custody-pg.sh`: final **5/5 PASS**, two
  disposable clusters and synthetic mTLS, covering both immutable tables,
  missing guard refusal and the existing same-original paths. The checkpoint
  DDL race above is not a separate custody concurrency test.
- `npm test -- test/restore-checkpoint-authority.spec.ts`: **6/6 PASS** with
  a SQL fake. The first command accidentally duplicated npm's worker flags
  and exited 1 before running tests; the corrected invocation is the pass.
- Focused strict source-only TypeScript for the two changed TS files: exit 0
  with a 1024 MiB Node heap and 120-second limit. This is not the full project
  or test-inclusive typecheck. The two disposable cells' own traps completed;
  read-only Docker inspection found no `elp2-ckpt-` containers. No full hook.

| Working-source input | SHA-256 |
| --- | --- |
| `restore-checkpoint-authority.sql` | `f27b356afab8ec5c6cf55c563e4e4be482c306a9336272a6e1e49e84db56ada1` |
| `restore-checkpoint-authority.ts` | `4d1f078b42d83048d514c4cc0388112276b28d0ba1b4c59aa97e1a0e827693dd` |
| `restore-independent-custody-candidate.sql` | `061a51a18d17fc10631e9226f0c08e36c6ba160bd409155490a56e9a5addd2d0` |
| `restore-independent-custody-candidate.ts` | `c6bb3fae49a10da8250e7004879dac9d5cc1554c28d98b5345a23ea2343b3406` |
| `restore-checkpoint-authority.spec.ts` | `c6bd825c18faea41804e428b267e970d0024e16c802a624586ce626de16e8a61` |
| `restore-checkpoint-authority-pg.spec.ts` | `880fc53bef9092ec61536d17d3481a640288d3a613689a7334d3beab8f2cf84f` |
| `restore-independent-custody-candidate-pg.spec.ts` | `281556ff1da1c933acf393b5376373c3c3a4b969f94bfc65a5e52252f49cfea7` |

## Remaining / handoff

Core still needs independently operated authority, complete writer/DDL and
source/HTTP/old-holder fences, post-snapshot terminal/ACK completeness and a
representative restore. P7/A2, Edge connected gates, integration and normal
hook remain open. No frontend contract changed; Claude has no new consumer
action from this internal candidate.
