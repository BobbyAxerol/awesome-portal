# Recovery V2 — bounded custody writer preflight, 2026-11-06

**SOURCE/TEST CANDIDATE ONLY. NOT INDEPENDENT AUTHORITY, RESTORE, OR CONNECTED ACCEPTANCE.**

## Reproduced failure and change

On `docs/research-loop-plan@2faa8968f` plus shared uncommitted WIP, the
custody preflight accepted a non-owner writer whose `INSERT` on the event
journal had been revoked. It checked the source-proof table but not all
privileges subsequently required to append the original. The bounded-role
regression initially failed: **5/6**, because preflight resolved after the
revocation. This is a real pre-issuance safety gap, not a statement that an
assertion escaped to a source.

The unmounted candidate now additionally checks `SELECT` on the head and
journal, `INSERT` on the journal, and `UPDATE` on both head columns
`generation` and `event_hash`, before permitting preflight. The checks on
source proofs and both guard functions remain in place. This remains advisory:
privileges, policies, capacity or availability can change after the check;
the serialized append and its fail-closed custody handling remain necessary.
The check does not prove RLS, row-specific access, key custody, or independence.

## Independent-authority counterexample

In the same disposable cluster, a role with the bounded privileges needed by
the current writer could not delete journal events or disable the trigger,
but could insert a fabricated event and advance its head using a correctly
computed **unkeyed** hash. `inventory()` accepted that syntactically consistent
chain as `INVENTORY_NOT_CUTOVER`; the particular fabricated record used by the
test was rejected by the separate Core comparison as
`RESTORE_CUSTODY_CENSUS_HISTORY_INVALID`. That negative comparison is not a
proof against a coherent forgery, omitted events, compromised Core, source
settlement, or missing ACKs. This counterexample confirms that a restricted
SQL writer and hash chain do **not** constitute an independent recovery
authority. Do not authorize restore or enable issuer on this basis.

## Test, pins and cleanup

- `bash scripts/test-elp2-independent-custody-pg.sh`: final **6/6** on two
  disposable PostgreSQL clusters. The new case exercises missing event
  `INSERT`, each head-column `UPDATE`, proof `INSERT`, a valid restricted-role
  append and same-operation retry, privilege denials, and the counterexample.
  These are assertions within the suite, not independent connected receipts.
- The test creates an exact random role and drops its grants and role in
  `finally`; the runner destroys its own exact temporary containers/network.
  A subsequent name-filtered container check was empty. Free disk was 269 GiB;
  peak CPU/memory were not measured.
- Source SHA-256: `a83af282a720d2b0037f7503a10b2f3f5cf1a788c55c6058794f24afa1bb13e2`.
- Test SHA-256: `b3bffed1d7168350eda6b4c92d0e3b0875bdfd2adf762df739b53716f6f861ef`.
- Runner SHA-256: `83a59ce01c88d510b8a9aa90163b395fc5f8de3c498f457ff743c8eb269522d6`.
- The prior full typecheck predates these edits; no new full typecheck, normal
  hook, migration, runtime installation or source acceptance is claimed.

## Next action and consumer impact

Core must qualify a separately controlled writer/witness and monotonic
checkpoint, fence old holders and source writers, and reconcile authenticated
post-snapshot terminals and ACKs before V2 restore. P7 owner authority and
real A2/READ/STREAM remain open. No frontend contract or consumer change is
requested. Source and evidence remain uncommitted shared WIP.
