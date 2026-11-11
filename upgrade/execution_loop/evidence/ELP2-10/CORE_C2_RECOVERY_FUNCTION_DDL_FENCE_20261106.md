# Recovery V2 — function DDL fence and forward helper upgrade

**UNCOMMITTED SOURCE/TEST ONLY.** Checkout `docs/research-loop-plan` at
`2faa8968fddbde59b2e59525e334ba3d83886144` plus shared WIP. Not installed,
not an independent checkpoint authority, not a restore permit or a phase PASS.

## Finding and candidate

The earlier [guard-drift receipt](CORE_C2_RECOVERY_GUARD_FUNCTION_DRIFT_20261106.md)
correctly identified that locking journal tables does not prevent
`CREATE OR REPLACE FUNCTION` from changing an enabled guard's body without
changing its OID. The candidate reader's separately provisioned fixed
`SECURITY DEFINER` helper now acquires `SHARE` on the authority database's
`pg_catalog.pg_proc` and the three journal tables; the reader verifies all four
actual locks before trusting its guard/history check. The writer uses a separate
fixed helper to acquire the same catalog lock, verifies it is held, then checks
guards and appends with its existing journal/row locks. Both retain the locks
through the bounded transaction. A stalled writer now has the same 5-second
idle-in-transaction limit as the reader.

The separate candidate forward SQL upgrades the old three-table reader helper
only when its owner, ACL, security attributes and old/new body match the
expected version; it refuses a drifted writer helper, creates a missing writer
helper without PUBLIC EXECUTE, preserves the reader's existing grant, and is
idempotent for the tested state. It does not provision the writer role or grant
it EXECUTE. Before any actual install an authorized operator must qualify the
helper owner/roles/ACL and grant the exact writer, and rehearse the exact schema
and upgrade. The fresh-install helper and upgrade are not numbered migrations.

**Availability and security limits:** `pg_proc` lock is database-wide for
function DDL and the upgrade takes a stronger catalog lock. Contention, role
ownership/privilege requirements, lock ordering and production bounds require
qualification; never install it blindly on a shared database. A privileged
actor able to terminate sessions or rewrite/restore the authority is not fenced
by this lock. Custody's separate guard writer has not received this fence.
Independent monotonic authority, old-holder/source/HTTP fences, complete genuine
terminal/ACK reconciliation and real restore are still required.

## Tests and cleanup

- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: final affected source run
  **29/29 PASS** across three overlapping existing suites, including real
  concurrent function replacement rejected for both a held reader and writer,
  missing/no-op helper refusal, stalled-writer lock release, and disposable
  historical journal upgrade. The writer timeout case actually waited about
  five seconds; it is not a production latency measurement.
- A later test-only upgrade extension added active catalog-lock contention and
  drifted writer-helper cases; targeted `...sh upgrade`: **9/9 PASS** including
  old-helper upgrade twice, exact prior reader ACL, no PUBLIC writer EXECUTE,
  timeout with no partial helper, and drift refusal. These are overlapping tests,
  not 38 separate independent product acceptance cases.
- The three-PG witness test after adding the helper but before the later
  writer-idle and upgrade-test-only changes was **4/4 PASS**; no qualified
  monotonic service was tested. Focused strict TypeScript for changed authority
  and upgrade test imports exited **0**, as did `bash -n` and tracked
  `git diff --check`. No full build, normal hook, live migration or Edge test ran.
- The bounded disposable test scripts cleaned their exact containers/networks;
  name-filtered read-only Docker checks found no `elp2-ckpt-` resources.
  Filesystem `/home/bobby`: 263 GiB free, 58% used. Actual resource peaks and
  database-wide DDL impact were not measured.

## WIP pins

| File | SHA-256 |
| --- | --- |
| `restore-checkpoint-read-lock-candidate.sql` | `39948c793df596d6f8caa3f03afe614ad128cefee23bc31a316996b50987018b` |
| `restore-checkpoint-lock-helper-upgrade-candidate.sql` | `1d5b9f15ca2f294e05e0397a43c084a292c7ea43ef29a868f6786afb085cad26` |
| `restore-checkpoint-authority-reader.ts` | `89be654d143193571172dc81ca1948ed5abc3ccb0c7b0edb92cf5142a2e80440` |
| `restore-checkpoint-authority.ts` | `513a275db3b19106152b75b44f1a9d554a49a572f9bf1a46f4a7e5c9e941c368` |
| `restore-checkpoint-authority-pg.spec.ts` | `d530c044082ca2c073d211ff9495c33f92e84127915a7b0792c65689e9460108` |
| `restore-authority-upgrade-pg.spec.ts` | `de83d2c96aac21b092985be1594570a381fd467ed2dedb22fb5dfc8025227e29` |
| `scripts/test-elp2-restore-checkpoint-pg.sh` | `9e764073f09c456912e63ee99b49f990449229ce60fd9fca22815a3d57b44bfc` |

Core next: complete independently held monotonic authority and old-holder/
source fencing, C2 STATUS/P7/ACK and integration; qualify a final candidate,
upgrade and restore on representative data. Read-only Edge HK inspection in
this turn still showed public static A2 follow-through only, not real A2 or
new source acceptance. No frontend contract/action. Rollback: leave the new
candidate unmounted and retain the existing V2 restore refusal; do not erase
custody or alter live authorities.
