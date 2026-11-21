# Recovery V2 — closed-observation journal candidate

**SOURCE/TEST ONLY.** This extends [the closed-DB checkpoint](CORE_C2_RECOVERY_CLOSED_DB_CHECKPOINT_20261106.md)
and supersedes the source/test hashes in [the retry follow-through](CORE_C2_RECOVERY_CLOSED_PIN_RETRY_20261106.md).
No runtime, shared database, source grant or frontend contract changed.

## Change

Previously the independent checkpoint stored only a digest; an auditor could
not inspect the selected DB/observer pin or recompute what it committed to.
The source candidate now writes the exact bounded, non-secret closed-observation
preimage into `portal_restore_authority.closed_observations` **in the same
authority transaction** as its event and generation update. A foreign key binds
it to the operation; an immutable trigger blocks ordinary UPDATE/DELETE/TRUNCATE.
On future append/replay, the candidate locks and checks the guard, requires one
preimage for each historical closed observation, and checks its SHA-256 against
the hash-chained event. Missing or changed bytes refuse rather than being filled
from a caller. Existing closure, source, inventory and freeze checks still run.

The test-only forward upgrade creates and validates this table for an eligible
older candidate without rewriting its journal. It refuses when an older closed
event has no retained preimage and requires independent reconciliation; retry
is allowed before the new table is used. Its input identity, exact ACL, journal,
operator and deployment permissions must be independently qualified. No such
upgrade was applied to a Research or production authority database.

This is **not** proof of independently operated authority, provenance of the
operator, old-holder/clone fencing, source/HTTP quiescence, complete terminal or
ACK census, or permission to restore. A privileged administrator able to
rewrite the entire authority database can still forge a matching chain. The
preimage allows inspection of an observation; it does not authenticate it.
The source's broad catalog lock remains potentially disruptive. Keep V2 restore
refusal enabled until the independently qualified end-to-end barrier exists.

## Validation

- Two disposable PostgreSQL clusters, `scripts/test-elp2-restore-checkpoint-pg.sh`:
  final **23/23 PASS**. The closed-DB case verifies event/preimage atomicity
  across an injected lost authority COMMIT response and same-operation retry,
  reordered pin replay, active guard, changed/missing preimage refusal and
  refusal after DB reopen. An earlier 23/23 run preceded the final lost-response
  test change and is not additive.
- Upgrade cases refuse missing historical preimages, preserve existing journal
  bytes, retry before use, and reject a disabled evidence guard. The upgrade is
  deliberately not declared a safe migration on real historical databases.
- Strict targeted TypeScript compilation of the source exited 0. `git diff
  --check` exited 0 for tracked changes; candidate sources and tests are
  currently untracked. The runner removed its own containers/networks; a
  read-only rootful Docker census found no `elp2-ckpt-` containers or networks.
  Peak resource use was not measured. No full typecheck or normal hook was run.

| Candidate input | SHA-256 |
| --- | --- |
| `restore-checkpoint-authority.ts` | `4b729bbbf2afd0f1deddf4c9729ac2e6b8c830e1c2e55bb124ffa69a3948c504` |
| `restore-checkpoint-authority.sql` | `116293cf504dec713f6a64f33e1519517a6283c691c94fdbf83f9fe3eb99433d` |
| `restore-checkpoint-closed-observation-upgrade-candidate.sql` | `7e206a6ac9c9a4a94c7238e0d830af67c485dd01d40df9f496d10db2286682d4` |
| `restore-checkpoint-authority-pg.spec.ts` | `bc262025c12265247d267ed2d16cb128551932da8cf94886bee2826dbe4dda7a` |
| `restore-authority-upgrade-pg.spec.ts` | `5982776647ebddbaf6322598528e95fd41f08ff65782060a17ba26bf403ef603` |

## Coordination / next / rollback

Read-only SSH on 2026-11-06 confirmed the Edge checkout is still at
`636d58a7c4368a617903734ab1d0ce933d2804ca`, with concurrent WIP; its latest
public status available at inspection still records static A2 as structurally
verified, not installed/full A2. No Edge change was made. Core still needs an
independently commissioned P7 owner/writer boundary, P1/P7/P8 actual A2,
old-holder/source/ACK reconciliation, representative restore and final
integration. Rollback now is to leave these sources unmounted; there is no
applied schema to roll back. No consumer action is requested from Claude.
