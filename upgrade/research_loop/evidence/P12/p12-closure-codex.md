# P12 closure addendum — route, truth and current-head gates

Date: 2026-09-22  
Scope: P12 only; feature-dark and fixture-backed where explicitly stated.

This addendum closes the remaining Codex-owned P12 checks without claiming a
real QuantBT run, runtime activation, browser-to-live-backend receipt or a
deployment. Its backend evidence re-proves P12-T08 and backend portions of
T09/T11; it does not relabel frontend or real-source gates as backend passes.

## Decisions

| ID | Decision | Rationale and boundary |
|---|---|---|
| `P12-DEC-01` | **Approved:** Screen 01 owns `/research/quantbt/runs`; the pre-existing Run Library remains at `/research/quantbt/runs/legacy`. | The Screen-01 specification names `/research/quantbt/runs`. The existing component is preserved, so this is a reversible route-only change: no deletion, data migration, feature flag change or runtime action. Static `runs/new` and `runs/:runId/progress` remain disjoint from the legacy `runs/:runId/*` workspace route. Existing links to bare `/runs` intentionally land on the new canonical Screen 01; the old reader is explicitly retained at `/runs/legacy`. |
| `CG-P12-01` | **No new status-census contract.** | `claim_ledger` is the source-published typed aggregate. `counters` count row kinds (`logical_runs`, worker children, retries and legacy metadata), so deriving `completed/running/failed` from them would be false. The HiFi sample census is presentation reference, not authority. If a product requirement later needs an exact status census, it must be a separately named server contract with scope, normalized filter binding, `as_of_utc_ms`, completeness/availability and definitions for each status. |

## Intentionally not folded into P12

| Item | Correct owner/state |
|---|---|
| `CG-P10-01` — `client.config_digest` is required but not source-published | P10 producer contract. P12's read-only consumer sends no producer declaration and must not invent a digest. |
| `CG-P09-02` — canonical source fixtures for foundation/library reads | Fixture provenance/evidence hygiene. Claude's P12 receipts remain labelled fixture-backed; generated fixtures never become product truth. It does not invalidate a typed consumer. |
| Visual baseline re-record | Owner decision on the actual visual gate environment. No baseline was re-recorded and no threshold was widened for P12. |

## Current-head evidence

| Gate | Command | Result |
|---|---|---|
| P12 Control unit/config boundary | `npm --prefix apps/control-api test -- --run test/research-run-library.contract.spec.ts test/research-run-library.controller.spec.ts test/config.spec.ts` | 3 files, 23 tests passed |
| P12 generated contract | `npm --prefix packages/contracts run generate:research-run-library && npm --prefix packages/contracts test -- --run test/research-run-library.spec.ts` | generation clean; 3 tests passed |
| P12 durable-reader proof | `bash scripts/research-loop-v11/test-p12-postgres.sh` | 5 tests passed in one named tmpfs PostgreSQL container; the trap removed it |
| P12/S01 route regression | `npm --prefix apps/portal/frontend test -- --run src/research/runLibrary.test.tsx src/features/quantbt/routes.test.ts` | 2 files, 50 tests passed |
| Current Control API compile | `npm --prefix apps/control-api run build` | passed |

The PostgreSQL proof is disposable only. It uses neither a runtime database nor
any execution/Trading System source, and creates no persistent volume.

## Handoff to Claude

P12 has no remaining backend or typed-contract blocker. For P13 frontend work:

1. Keep the Screen-01 route at `/research/quantbt/runs` and retain the legacy
   reader at `/research/quantbt/runs/legacy` unless a separately reviewed
   routing decision changes it.
2. Render `claim_ledger` as the aggregate; do not reconstruct a lifecycle
   census from `counters`, list rows or fixture assumptions.
3. Keep P12 fixtures explicitly fixture-backed. Do not claim real-source or
   deployment evidence until a named activation receipt exists.
4. Continue consuming generated, same-origin contracts only. P10's
   `client.config_digest` and P09 canonical-fixture work are not invitations to
   add browser-side parsing or generated facts.

P13 can begin its frontend composition now; P12 is closed at its documented
feature-dark scope.
