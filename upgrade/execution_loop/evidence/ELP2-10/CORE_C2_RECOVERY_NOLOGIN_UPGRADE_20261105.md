# Recovery V2 — NOLOGIN checkpoint schema forward-upgrade candidate

**TEST/PREPARATION ONLY; not installed, not a Portal migration, not independent authority or permission to restore.** This follows [the source-only checkpoint observation](CORE_C2_RECOVERY_NOLOGIN_CHECKPOINT_20261105.md).

## What changed

An unmounted SQL candidate adds the new `FROZEN_NOLOGIN_SOURCE_OBSERVATION` event kind to an existing old checkpoint candidate's exact capture-kind CHECK. It takes an exclusive table lock and aborts on timeout, a missing/disabled immutable-event trigger, altered/multiple capture-kind checks (including NOT VALID), or an unexpected old/new definition. An exact reapplication is idempotent after an ambiguous response. It does not rewrite journal rows or change old event hashes.

This preparation is deliberately narrow: operator authorization, authority cluster identity, complete schema/guard integrity, journal hash-chain validity, writer quiescence across processes and independent source fencing are prerequisites for any future deployment; **the SQL does not establish them**. A privileged DDL owner can alter functions or guards and is outside this candidate boundary. The legacy V2 restore refusal stays in place.

## Test and pins

`bash scripts/test-elp2-restore-checkpoint-pg.sh`: **21/21 PASS**, two disposable PostgreSQL clusters. The synthetic old schema starts with a historical event and the original four capture kinds. The upgrade rejects an active writer, disabled guard and validated/unvalidated extra constraints; successful and repeated execution preserves the event bytes and original replay, accepts the new kind only in a rolled-back test transaction, and retains immutability. This does not test production history, external privilege interference or a restore cutover.

Earlier 21/21 also passed before adding the additional unvalidated-constraint negative; the counts are not additive. `git diff --check` passed. The runner removed its own test containers/networks; a read-only post-check found no named ELP2/test-PG containers. Runner limits apply; peak resources were not recorded. Full typecheck/hook was not rerun for this SQL/test-only slice.

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority-nologin-upgrade-candidate.sql` | `f860d2d14c522c29bf9e9d37f5bc2b70781392eec1aa55d62a673252d2f669e3` |
| `apps/control-api/test/restore-authority-upgrade-pg.spec.ts` | `6550c0a6bf31bb112ffcb3a758a2e021c2240c0579dfba335226083228a44c57` |

## Next / rollback / frontend

Before any real upgrade, build a separately authorized pinned operator workflow that verifies full history, schema, rights and quiescence, then rehearse on representative historical data. Independent authority/old-holder fencing, post-snapshot terminal and ACK reconciliation, P7/A2 and connected qualification remain open. Rollback is to leave this candidate unmounted and keep V2 restore blocked; no real schema was changed. No frontend contract/action.
