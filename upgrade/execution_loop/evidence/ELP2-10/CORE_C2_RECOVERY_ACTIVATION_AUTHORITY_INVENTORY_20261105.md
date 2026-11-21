# Recovery candidate: activation and authority inventory — 2026-11-05

**SOURCE ONLY, uncommitted and unmounted.** ELP2-10/11 remain open. This is
not an independent writer fence, complete authority census, restore/cutover
permit, or connected Edge proof. V2 restore remains refused.

## Gap and implementation

The diagnostic inventory already covered `auth_sessions`, but omitted the
activation credential's `used_at`/`revoked_at` and expiry. Restoring a snapshot
from before a single-use activation was consumed or revoked could therefore
reinstate it while the old inventory reported no activation difference.
The affected table is part of the actual initial identity migration; no token
value is sent out of PostgreSQL by this inventory.

The candidate now also inventories activation credentials, owner step-up
grants, authentication audit, lifecycle operations, capability-grant events,
and promotion authority grants. This expands the bounded fixed table list;
it does not claim every public authority table or every writer has been
discovered. An oversized table fails closed instead of truncating. Security
metadata remains included. Both source and restored sides must provide the
new profile; old snapshots cannot be reinterpreted as having this coverage.

The pre-C2 diagnostic version changes from `portal.restore-inventory.v2` to
`.v3`, with coverage marker `pre-c2-candidate-absence-checked-v2`. The C2
checkpoint commitment domain changes from `candidate.v3` to `candidate.v4`.
Old events are **not rewritten or backfilled**. An exact old checkpoint
operation cannot be silently retried using a new digest; review/reconciliation
of old in-flight operations and historical compatibility is required before
any installation. Receipts for earlier input hashes are not proof for this
selection.

## Verification and cleanup

- `npm test -- test/restore-inventory.spec.ts`: **14/14 PASS**, including
  mismatches for each newly added relation and refusal of legacy version.
- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: **8/8 PASS** on two
  separate disposable PostgreSQL clusters, including the actual migrated
  schema. The test observes a different C2 commitment when the same existing
  activation credential is consumed, without changing its session. It also
  retakes the frozen checkpoint and lost-response test on this selection.
- Strict focused TypeScript compilation of both changed inventory source
  files: exit 0. `git diff --check`: exit 0 for tracked changes. Neither is a
  full project typecheck or normal hook.
- The cell used bounded disposable containers and trap cleanup; a subsequent
  `sudo -n docker ps -a --filter name=elp2-ckpt-` returned no containers.
  Direct unprivileged `docker ps` returned permission denied and is not counted
  as cleanup verification. Filesystem `/home/bobby` was 57% used afterward.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-inventory.ts` | `89862b9630492fc968ad58422759695482317bb5ce88722b408619753521c8ff` |
| `apps/control-api/src/execution-v2/restore-c2-inventory.ts` | `130eccacb990d46ee2c5a5b4431c7b28eb1cc56644cdd749f3ebf47648a13ca6` |
| `apps/control-api/test/restore-inventory.spec.ts` | `0642cf702f074add1366cd8a0fe0389a289e6e586d752c9eee28d4bcb0295ba3` |
| `apps/control-api/test/restore-checkpoint-authority-pg.spec.ts` | `53573db3dc21c0e7833bc0ac9a2ea4f532e9af379e850f987bb160d0b5f0ddad` |

## Next and handoff

Review the full public authority/write-path census, add and qualify local
identity fences, independently fence old holders, reconcile real post-snapshot
terminal/ACK, and rehearse a representative restore on the frozen candidate.
P7/A2, source qualification, final integration, G2 and connected/browser
acceptance remain open. No frontend contract or consumer action was added.
No runtime, shared database, credential, Edge setting, UI or remote was changed.
