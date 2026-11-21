# C2 custody contention retry — 2026-11-05

**SOURCE ONLY / UNMOUNTED / NOT A RECOVERY CUTOVER.** The changes are in the
shared, uncommitted Research worktree at committed HEAD `2faa8968f`; they are
not an installed image, migration, runtime configuration, source ACK, or A2.
Preserve the unrelated worktree changes. No frontend or contract change.

## Problem and bounded change

An independent custody write can encounter a stale generation or PostgreSQL
transaction conflict when other originals are recorded concurrently. ENTER is
one-shot: if Core has already committed admission, repeating ENTER is not a
safe way to recover its custody write. The unmounted issuer and terminal
compositions now use `appendCustodiedOriginal` to re-read inventory and retry
the **same** operation ID and proof, at most three attempts, with 10/30 ms
backoff. It retries only an exact `RESTORE_CUSTODY_GENERATION_CONFLICT` or a
PostgreSQL `40001`, `40P01`, or `55P03`; other failures, including unknown
commit outcomes, propagate. Every append still executes the existing source,
original, proof, authority, capacity and history checks. ENTER itself is not
retried, and no new original or source ACK is created.

For an existing operation, the helper uses its retained predecessor generation
and leaves the underlying append to check exact binding and replay validity.
A successful local custody write is not an independent production authority,
source receipt, HTTP delivery guarantee, old-holder fence, or restore permit.
An exhausted retry remains an error and may require recovery of the same
original; this slice does not complete that recovery.

## Evidence

- `bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS**, exit 0,
  disposable two-PG cell. The existing real isolated mTLS/PG flow injects a
  `40001` then a generation conflict after ENTER, and checks eventual custody
  for the same operation; a separate injected proof-write failure is attempted
  once and does not create a terminal. Conflict injection is deterministic,
  not a measurement of production contention or a connected Edge receipt.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  disposable two-PG cell with synthetic authority.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **21/21 PASS**,
  exit 0, disposable two-PG cell with synthetic authority.
- Strict focused `tsc --noEmit` over the helper and its issuer/terminal
  consumers: **exit 0**. It is not the full project or test-inclusive check.
- These are focused regressions, not a full project typecheck or normal hook.
  Test runners use isolated bounded containers and their cleanup traps.

| Current input | SHA-256 |
| --- | --- |
| `c2-custody-append-contention.ts` | `bf970125df62870c164280274a495ecae5477c1924b0f7f4a307e01b3b78f25b` |
| `c2-custodied-terminal-candidate.ts` | `9efa5218f3d965c5092d07377bd96c5ad3e3a4283636f09766b55339f3458760` |
| `c2-custodied-issuer-candidate.ts` | `d3050a31d0d55a978971ebf03d6cda6cde990685a87f8ddfacd680422a22d9e7` |
| `restore-independent-custody-candidate.ts` | `30bd2451eb64c965fc80d772b084bd2377f366b2f34f6d76a489a6b41a09986c` |
| `restore-independent-custody-candidate-pg.spec.ts` | `afaa12dbfdfc58b7e68431296b8787353d9f1340a16276167d011d29c39835c2` |
| `test-elp2-independent-custody-pg.sh` | `83a59ce01c88d510b8a9aa90163b395fc5f8de3c498f457ff743c8eb269522d6` |

## Remaining gates

Independent owner authentication and signer custody, an independently
operated checkpoint authority, old-holder/source/HTTP fences, complete
post-snapshot terminal and ACK reconciliation, and representative restore
remain open. Issuer/P7 remain uncommissioned. Full A2, B2 prerequisite
verification, real READ/STREAM, financial, STATUS, G2 and browser acceptance,
and final candidate integration remain open. Edge is the external source
coordination point. Do not infer runtime activation or frontend action from
this source-only change.
