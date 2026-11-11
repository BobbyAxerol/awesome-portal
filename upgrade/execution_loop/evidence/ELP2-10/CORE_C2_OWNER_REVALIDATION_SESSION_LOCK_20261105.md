# C2 owner revalidation and in-flight session mutation — 2026-11-05

**SOURCE ONLY; NOT P7 AUTHORIZATION OR HTTP DELIVERY CUSTODY.** The C2
post-signing `revalidateBoundIssue` path used an unlocked MVCC snapshot for
the owner and session. On a disposable database, a second transaction held
the session row `FOR UPDATE` while revalidation still completed from the
older ACTIVE version. This showed that the revalidation transaction itself
did not serialize with that in-flight session mutation. It does not by itself
show that a real HTTP bearer was delivered during a revoke.

For C2 only, the candidate now uses `lockCurrentHumanSnapshot` for the
post-signing recheck, retaining the owner, session, workspace and policy locks
until that short transaction ends. Lock contention fails closed; after the
competing transaction rolls back, the same original can be revalidated. The
non-C2 reader continues to use its existing path. This does not hold locks
through the HTTP write, qualify owner acceptance/delegation, authorize issuer
commissioning or replace the separate source/ENTER fence.

## Evidence

- Before the fix, the new disposable-PG negative failed because
  revalidation resolved instead of refusing while the session lock was held.
- The first post-fix focused run correctly refused during the held lock, but
  its extra cleanup assertion tried to revoke a live issued session without
  the required drain and failed `CURRENT_HUMAN_DRAIN_REQUIRED`. That
  out-of-scope test step was removed; no drain check was weakened and the
  failed run is not counted as a pass. Existing tests cover the revoke path.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **19/19 PASS**,
  exit 0, on two disposable PostgreSQL clusters, including the new lock case,
  existing revoke-between-issue-and-check, and source settlement after revoke.
- The script's cleanup trap completed; no `elp2-restore-rls`-named node
  container appeared in the subsequent read-only check. `git diff --check`
  passed for tracked files. No shared runtime, real credential or DB changed.

Local WIP SHA-256: `current-human-candidate.ts`
`8ae69de026d5eee41fa00deea81ed9141d5a23d9e9b5025390c9964817937f36`;
`c2-owner-issuer-pg.spec.ts`
`08288cafe1491bb49358894ff9ce8331e4c3252075ff3e79d0a59679f6774e54`;
test runner `4ab1ab6d37df81c27b5c2238b6f2b1c67d37b9722a3eff65bee220bc99e09089`.

Full typecheck and normal hook remain open. Real owner acceptance/delegation,
same-authority issuance through HTTP delivery, Edge source/ACK, independent
restore fencing and post-snapshot reconciliation still require qualification.
The issuer stays fail-closed, restore V2 remains refused and B2 remains
unsigned. No frontend field changed.
