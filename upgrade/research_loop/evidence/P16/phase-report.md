# P16 phase report — Freeze, retained integrity verification and what-if truth

Date: 2026-09-22  
Base before P16: `ddd2cfa4` (`docs/research-loop-plan`)  
Status: **BACKEND_CURRENT_SOURCE_CONTRACT_COMPLETE; feature-dark; no frontend,
runtime, source-artifact, optimizer or deployment claim.**

## 1. Scope actually delivered

P16 implements the safe current-source compatibility half of Screen 07:

1. `ResearchFreezeService` reads the existing P14 immutable projection through
   the bounded session/workspace `ResearchSplitRepository` only.
2. It compares three exact retained digest bindings: compiled P04 adapter ↔
   P10 producer, P10 producer manifest ↔ P14 source manifest, and compiled
   fixed P04 parameter bundle ↔ P14 selection bundle.
3. It creates one derived revision/ETag from those immutable inputs. A
   mismatch is a typed `BLOCKED` integrity state and removes local frozen
   values rather than presenting a plausible map from a different adapter.
4. It exposes P14 data-time windows and all current P04 absences exactly:
   no selection/pool/trial, no strict causal ordering, no artifact bytes, no
   what-if grid, diagnostic action or sibling draft.
5. The explicit verify POST is origin/CSRF protected and merely re-runs the
   same bounded read. It creates no receipt, audit event, queue item or source
   transport call.

No TSX/CSS/HiFi/frontend fixture was changed by Codex. Claude's in-progress
P12 files remain unstaged and untouched.

## 2. Authority, safety and resource model

| Layer | Implementation | Guard |
|---|---|---|
| retained source | P10/P14 immutable rows through `ResearchSplitRepository.hub` | session/workspace scope, repeatable read, 2 active / 8 queued admission and finite transaction budgets inherited from P14 |
| verifier | `ResearchFreezeService` | exactly three digest comparisons; `PARTIAL_MATCH` never becomes source artifact or causal-order proof |
| GET | `GET /api/v1/quantbt/runs/:runId/freeze` | strict run/workspace/fold schema, membership, immutable ETag, feature dark by default |
| explicit re-read | `POST …/freeze/verify` | origin + CSRF proof, no body/override, no persistence, no enqueue, no source call |
| contract | `research-freeze.openapi.json` → generated declaration | named operations only; exact decimal strings/UTC milliseconds; no manual DTO required |
| persistence | **none added** | P16 reuses one P14 source/projection; no table, migration, cache, worker, volume or background loop |

## 3. Current-source capability decision

P04 is fixed-parameter. P10 admission rejects non-one trial counts, parameter
overrides, random seed, optimizer config and early stopping. P14 publishes no
selection artifact/sequence, candidate pool, wall-clock method events,
artifact-byte evidence or evaluated grid. P16 represents these as source gaps;
it does not read an old worker/artifact/database to fabricate them.

See [source-capability-matrix.md](./source-capability-matrix.md) for each
screen element and the exact future contract prerequisite.

## 4. Test evidence

| Gate | Command | Result / relevant coverage |
|---|---|---|
| TypeScript production build | `npm --prefix apps/control-api run build` | pass |
| P16 unit/controller/config contracts | `cd apps/control-api && vitest run test/research-freeze.service.spec.ts test/research-freeze.controller.spec.ts test/research-freeze.contract.spec.ts test/config.spec.ts --maxWorkers=1 --no-file-parallelism` | 4 files / 23 tests pass: exact checks, mismatch table removal, pending/legacy nesting, dark flag, ETag, workspace hiding, origin/CSRF verification |
| Fresh P16 PostgreSQL proof | `scripts/research-loop-v11/test-p16-postgres.sh` | 1 focused P10→P14→P16 scenario passes in a uniquely named tmpfs PostgreSQL 16 container; 3 matches, partial result, no new P16 receipt relation; trap removes container |
| Generated contract | `npm --prefix packages/contracts test` | 10 files / 161 tests pass, including P16 named-operation/no-authority check |
| Route ownership ledger | `npm --prefix apps/portal/frontend test -- --run src/execution/r2Ledger.test.ts` | 22 tests pass; both P16 routes classified/owned with evidence |

The generic P16 source tests requiring corrupt expected bytes, wall-clock skew,
81-cell evaluation reuse, diagnostic cancellation and sibling draft do not
apply to P16-A because there is no such current source capability. They are
recorded as source capability gates, not claimed as skipped success.

## 5. Resources, cleanup and rollback

Only one `research-p16-postgres-*` test container was created. It used tmpfs
for PostgreSQL data and was removed by the script's EXIT trap. A post-run
read-only Docker check found no matching container. No broad prune, volume,
image or cache removal, restart, runtime configuration change, deployment,
database migration, source-data change or Execution Edge/Trading System call
occurred.

Rollback is a signed release with `FEATURE_RESEARCH_FREEZE=false`; immutable
P10/P14 evidence stays retained.

## 6. In-scope closeout and frontend handoff

**P16-A has no known backend technical debt.** P16-B is an external source
capability boundary whose exact required schema is recorded in this packet and
the Unified Plan. It must not be satisfied through a direct source DB/artifact
read or a frontend inference.

Claude owns Screen 07. Read [frontend-handoff-claude.md](./frontend-handoff-claude.md)
before touching it and return a browser/HiFi receipt plus only focused
`CG-P16-*` requests for genuinely missing typed source facts.

## RS-01 corrective amendment — 2026-09-22

No P16 integrity fact/action changes in RS-01. The retained P14 source is now
semantically range-validated and its bounded reader can be cancelled without a
late pool-client leak. Artifact-byte verification, historical binding and any
valid diagnostic remain RS-02-owned rather than being inferred from this
repair.
