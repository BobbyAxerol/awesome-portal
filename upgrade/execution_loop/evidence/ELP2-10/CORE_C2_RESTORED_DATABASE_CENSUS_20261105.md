# C2 restored-database observation — 2026-11-05

**SOURCE ONLY; diagnostic, not permission to restore or cut over.** The
working checkout is `docs/research-loop-plan` at committed base
`2faa8968fddbde59b2e59525e334ba3d83886144`; this work is uncommitted and not
installed. No protected runtime, source credential or UI was changed.

## Change and boundaries

The independent custody comparison can inspect a separately selected pool
for a restore candidate while leaving the original source pool and its
custody binding unchanged. The caller must pin both the PostgreSQL system
identifier and exact database name; a mismatched pin or unbounded pool fails
closed. The result identifies the observed target and remains explicitly
`OBSERVED_NOT_CUTOVER`, including when a retained terminal matches.

This is not an independently authenticated target-selection policy. A
PostgreSQL system identifier can survive a physical restore; neither a
different pool nor a different database name proves independent failure
domains, a complete census, an old-holder fence, source ACK, or a safe cutover.
There is no production endpoint, restore invocation, or new frontend contract.

## Validation and limits

- `bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS**, exit 0,
  on two disposable PostgreSQL clusters and test-only mTLS. A test created a
  real database template copy before the source terminal, then observed that
  copy after the signed terminal was retained separately: the comparison
  returned `CORE_TERMINAL_MISSING_OR_DIFFERENT`. Wrong system identifier,
  wrong database, original pool and invalid identifier were rejected.
- The final retake also uses a real concurrent signed test `ENTER` to advance
  the independent custody chain while Core's repeatable-read observation is
  open; the comparison rejects `RESTORE_CUSTODY_CENSUS_CHANGED`. This covers
  that race, not an append that occurs after the method returns.
- This is a **template database copy on the original cluster**, not a
  historical backup/restore, a separate-cluster restore or connected source
  receipt. The test also uses synthetic identity and signed source events.
- Focused strict TypeScript check of the changed source and dependencies
  passed with `timeout 60s ./node_modules/.bin/tsc --noEmit --strict
  --skipLibCheck --esModuleInterop --module commonjs --target es2022
  --moduleResolution node src/execution-v2/restore-independent-custody-candidate.ts`.
  This is not the full test-inclusive typecheck or normal hook.
- The first sandboxed attempt could not access Docker; it did not run tests.
  The bounded disposable test then ran under the approved execution profile;
  the script's trap removed its containers and network. The exact temporary
  database was dropped by the fixture. No shared data or image was deleted.

| Working file | SHA-256 |
| --- | --- |
| `restore-independent-custody-candidate.ts` | `30bd2451eb64c965fc80d772b084bd2377f366b2f34f6d76a489a6b41a09986c` |
| `restore-independent-custody-candidate-pg.spec.ts` | `ee52827e751a2ce2dba3382483eb2533a63f20fcbd5db1bc72c55be9c3f860f6` |

## Remaining

Exercise a representative restored backup and writes after the observation;
implement and qualify independently controlled old-holder
fencing and complete authenticated source/ACK reconciliation; integrate and
test the recovery barrier without unblocking V2 restore prematurely. Complete
P7/issuer, review and freeze the combined candidate, rehearse the affected
schema/ACL/rollback and run the normal hook once on that selection. Claude has
no new consumer request from this diagnostic. Connected Edge qualification,
A2 acceptance, B2 signing and browser/G2 remain separate.
