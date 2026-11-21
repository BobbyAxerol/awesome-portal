# C2 issuer upgrade — concurrent table DDL race, 2026-11-06

**SOURCE/TEST ONLY.** This does not commission P7/A2, install a migration,
qualify a source, permit V2 restore, or prove the safety of privileged DDL.
Base `docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144`,
plus the shared uncommitted candidate.

## Reproduction and change

The prior candidate checked existing column constraints before its first
`ALTER TABLE` acquired an exclusive table lock. In a name-checked disposable
PostgreSQL database, one transaction held that lock while the candidate had
already inspected the catalogue. The transaction replaced the checked source
digest constraint with a weaker constraint and committed. The candidate then
completed the upgrade despite the weaker constraint. The first focused test
failed as intended: the transaction succeeded where refusal was expected
(1 failed, 22 skipped; not a PASS).

The unmounted upgrade candidate now takes a bounded `ACCESS EXCLUSIVE` lock
on the selected leases table before reading its columns, constraints or trigger
state. After the competing DDL commits, validation sees and refuses the weak
constraint and the missing column stays missing. Lock timeout is three seconds;
an operational use would require planned writer quiescence and assessment of
the lock's impact. This does **not** fence a separately owned trigger-function
replacement, role/ACL drift, a privileged DDL actor, old process/source access,
or a restored clone. Those remain required, and V2 restore remains refused.

## Validation and cleanup

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **23/23 PASS**
  after the fix on two disposable PostgreSQL clusters. The concurrent-DDL
  regression is one assertion sequence in the existing upgrade test, not a
  separately counted test.
- `bash scripts/test-elp2-c2-historical-clone.sh`: **2/2 PASS** on the retained
  backup mounted read-only, for the selected historical tables and metadata
  described in [the original rehearsal](CORE_C2_HISTORICAL_CLONE_REHEARSAL_20261106.md).
  It is not a complete migration/restore/rollback qualification.
- A targeted TypeScript run was interrupted after it continued running; it is
  **NOT_RUN_TO_COMPLETION**, not PASS. The normal integration hook was not run.
  Tracked-file `git diff --check` passed; it does not cover untracked files.
- The harnesses report their own teardown. Name-filtered Docker container and
  network checks for the C2 owner test were empty; the historical clone's
  anonymous volume identifier was not captured independently. No unrelated
  Docker resource or backup was deleted. `/home/bobby`: 270 GiB available,
  57% used; actual test peaks were not measured.

| Uncommitted input | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-human-issuer-upgrade-candidate.sql` | `5e3abc674c8d68213c5c01f3e697a3fd8a193615a08db4c674978b282199cf57` |
| `apps/control-api/test/c2-owner-issuer-pg.spec.ts` | `b6ddab91f6486a284a966c2823a525840d6661bd53253fe17928893f41fce27f` |

## Direct Edge check and next work

Read-only SSH checked the Edge worktree and the public coordination STATUS.
Its latest listed C2 entry was the 5 November static verification: the static
bundle is structurally verified but is not installed A2. `C2_SEALED` had been
relayed; P7 owner authority, issuer/listener, source registration and A2
acceptance remain unproved, and B2 remains unsigned. No Edge/runtime/DB
mutation or private credential access was performed. This observation does
not rule out a newer update outside the inspected STATUS/mailbox.

Continue independent P7 owner/writer and recovery authority work, including
function/role/ACL and concurrent-privilege fences; reconcile source terminal
and ACK through Edge. Revalidate migration and full gates on the final pinned
candidate. No UI/contract change is handed to Claude by this slice.
