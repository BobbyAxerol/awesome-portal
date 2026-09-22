# RS-01 phase report — Correctness, immutable consistency and bounded recovery

Date: 2026-09-22  
Worktree / shared branch: `/home/bobby/portal-research` / `docs/research-loop-plan`  
Status: **BACKEND_REMEDIATED; feature-dark; Claude consumer review pending.**

## Delivered backend scope

| Audit finding | Delivered repair | Boundary preserved |
|---|---|---|
| A01 financial truth | Prior-close UTC monthly returns; exact decimal return/drawdown math; terminal histogram bin is inclusive; rolling series has its own metadata | no browser calculation or source recompute on GET |
| A02 bounded receipt | R2 source caps (`32/16/32/12`) plus a 24 KiB canonical-byte preflight and coverage/omission metadata | full engine vector remains confined to the child |
| A03 chronology | Each range and all range relationships are semantically validated; cross-sidecar transform digest mismatch is refused | no inferred fold/holdout truth |
| A04 immutable identity | Source receipt digest, transform revision, metric registry revision, every retained series digest/count/sampling bind the projection | R1 stays readable through the v1 registry |
| A05 coherent reads | Hub/series/replay use one repeatable-read, revision-pinned bundle and validate stored bytes/digests | no raw relation/cursor reaches the browser |
| A06 replay cache/cursor | no ETag/304 on replay; `private, no-store`; typed expiry and safe ordinal re-location | opaque tokens remain relation-bound/private |
| A07 terminal recovery | immutable terminal-materialization checkpoint; sidecar/lifecycle before checkpoint/fanout; duplicate terminal redelivery re-fanouts | no engine rerun or journal rewrite |
| A08 bounded admission | Research-only active/queue/deadline boundary with AbortSignal removal and late-client release | no global Execution pool policy changed |

## Migration and compatibility

`1723680000049_research-evidence-r2-identity.sql` is additive compatibility:
it accepts only the two explicitly labelled R2 sampling forms and zero
source-observation count where a series is validly empty.  
`1723680000050_research-terminal-materialization-v1.sql` adds an immutable
checkpoint with `SELECT, INSERT` only for `portal_research_runtime`; `UPDATE`
and `DELETE` remain denied. Neither migration updates or deletes historical
evidence.

## Actual verification

| Gate | Command | Result |
|---|---|---|
| R2 numerical/size oracle | `cd apps/portal/backend && ../.venv/bin/python -m pytest -q tests/test_research_evidence_r2.py` | **8 passed** — prior-close, UTC calendar, zero/NaN, histogram closure, rolling metadata, OOS boundary and max legal receipt |
| affected Control API | `cd apps/control-api && npm test -- --run test/research-progress.contract.spec.ts test/research-progress.controller.spec.ts test/research-progress-rs01.service.spec.ts test/research-evidence.contract.spec.ts test/research-evidence.controller.spec.ts test/research-evidence.service.spec.ts test/research-split.contract.spec.ts test/research-split.controller.spec.ts test/research-split.service.spec.ts test/research-search.contract.spec.ts test/research-search.controller.spec.ts test/research-search.service.spec.ts test/research-freeze.contract.spec.ts test/research-freeze.controller.spec.ts test/research-freeze.service.spec.ts test/research-replay.contract.spec.ts test/research-replay.controller.spec.ts test/research-replay.service.spec.ts test/research-bounded-read.spec.ts` | **19 files / 59 passed** |
| Control API production build | `cd apps/control-api && npm run build` | **pass** |
| fresh RS-01 schema proof | `TEST_DATABASE_URL=postgres://portal:portal@127.0.0.1:55432/portal_control npm test -- --run test/research-rs01-migration.spec.ts` | **1 passed** — UUID-named disposable DB, R2 constraints, immutable trigger, runtime grants |
| durable retry/restart proof | `P11_TEST_RUN_SUFFIX=rs01-… bash scripts/research-loop-v11/test-p11-postgres.sh` | **8 passed** — disposable tmpfs PostgreSQL container; container absent after trap |
| legacy migration recovery | `TEST_DATABASE_URL=postgres://portal:portal@127.0.0.1:55432/portal_control npm test -- --run test/migration-recovery.spec.ts` | **2 passed** — historical ledger recovery reaches the append-only chain |

All database work above used only an exact UUID-named disposable database or a
uniquely named tmpfs test container. No dev/stable/production database,
container, image, volume, deployment, source service or secret was changed.

## Rollback and next handoff

Rollback selects the compatible reader/transform or keeps the feature dark;
it never alters old source/evidence/series rows. See [rollback.md](./rollback.md).

Claude must regenerate the three generated declarations and implement only the
rendering/error-state changes in [frontend-handoff-claude.md](./frontend-handoff-claude.md).
RS-02 remains the next backend slice after Bobby approval; it owns complete
current-source adapters and rich read models. RS-03 owns browser/product
acceptance. No claim that P13–P17 are universally complete is made here.
