# Recovery V2 — closed-database pin retry normalization

**SOURCE/TEST CANDIDATE ONLY; not mounted or qualified for restore.** This
follows [the closed-database observation](CORE_C2_RECOVERY_CLOSED_DB_CHECKPOINT_20261106.md).

## Finding and change

The closed-database checkpoint hashed a caller-provided pin object in its
property insertion order. After the operation had committed, retrying with the
same operation and the same five values in another field order caused
`V2_CHECKPOINT_OPERATION_CONFLICT`, not the recorded receipt. This could
unnecessarily strand a lost-response recovery. A new PostgreSQL regression
reproduced the failure: **20 passed, 1 failed**, exit 1, before the repair.

The candidate now snapshots the five exact fields once in a fixed order,
validates that snapshot, and uses it for both local checks and the committed
digest. The existing database, observer, closure and freeze checks are not
relaxed. An exact retry with reordered fields returns the same generation;
reopening the database still causes refusal. The canonical order preserves the
order used by the immediately preceding isolated test, but older candidate
events emitted using a different insertion order may have a different digest.
No runtime event or production history was checked or rewritten; identify and
reconcile any such event before deploying this candidate. Do not relabel it.

## Validation and resources

- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: **21/21 PASS** after
  the fix, across two disposable PostgreSQL clusters; test-only source.
- Strict targeted TypeScript compilation of
  `restore-checkpoint-authority.ts`: exit 0. `git diff --check`: exit 0 for
  tracked changes; source/test files above remain untracked.
- Runner removes its exact containers and network on exit. A read-only
  `sudo -n docker ps -a --filter name=elp2-ckpt-` census returned no matching
  containers. Peak resources were not measured; no shared DB or runtime changed.
- Source SHA-256 `16f3d47413760b59bb13340fdf624218e599514243834c83a921dbdc4d413308`;
  test SHA-256 `48037415f66a0cfbfd4ae7e79fdc3cce13dda07e7cf969b2911c61270b5aabcd`.

## Remaining / rollback / handoff

The candidate still lacks independent operator/authority qualification,
old-holder and source/HTTP fencing, complete genuine terminal/ACK tie-out,
and a representative restore rehearsal. Preserve the V2 restore refusal.
P7/A2, Edge connected acceptance, final integration hook and ELP2-10/11 gates
remain open. Rollback is to leave this unmounted; no migration was applied.
No frontend contract or consumer action changed.
