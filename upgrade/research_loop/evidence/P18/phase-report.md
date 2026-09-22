# P18 phase report — immutable report and bounded export backend

## Scope delivered

- Additive migration `1723680000052_research-report-export-v1.sql` creates immutable `run_report_manifests_v1`, separately mutable annotations and bounded retained export jobs. The row guard blocks report mutation/deletion, completed-job mutation/deletion and non-identity-safe transitions.
- `ResearchReportService` materializes only from local P13–P17 projections on `run_completed`; its `processOneExport` is a finite explicit worker action.
- Four session/workspace-scoped same-origin operations are registered in the Control API and R2 capability inventory. Mutating export creation has the existing CSRF/origin guard; read/download keep foreign objects hidden.
- `research-report.openapi.json` and generated `research-report.d.ts` cover every Screen-09 nested panel shape (folds, stages, artifacts, warnings, promotion, provenance and export capabilities), not generic-object placeholders.

## P18 gate ledger

| Gate | Result | Evidence |
| --- | --- | --- |
| P18-T01 raw → Hub/Report parity | PASS | Service unit seals exact P13–P17 revisions, exact decimals and source availability. |
| P18-T02 immutable source/read truth | PASS | Feature-dark service/repository contract; materialization invokes no engine/source/worker transport. |
| P18-T04 restart/recovery transform | PASS (bounded worker logic) | Worker transforms a claimed frozen core without rereading evidence; real disposable PostgreSQL proof executes seal → dedupe → claim → complete → checksum-download through the runtime role. |
| P18-T05 slow client/disk boundedness | PASS | Max 512 KiB DB `bytea`, no scratch-file path, bounded claim limit/lease; oversized row rejected on PostgreSQL. |
| P18-T06 CSV/path injection | PASS | Formula neutralization and server-only filename unit; DB filename constraint. |
| P18-T07 old/partial source | PASS | `NOT_PUBLISHED` facts and source profile retained; no invented per-fold/selection/artifact facts. |
| P18-T09 no recomputation after export | PASS | Export worker uses sealed core only; focused unit asserts source readers are not revisited. |
| P18-T03/T08/T10–T12 browser/print/product conditions | PENDING_CLAUDE | Screen 09 consumer, print page-break, actual browser/network receipt and HIFI comparison are frontend-owned. |

## Verification commands

```bash
npx --prefix apps/control-api tsc -p tsconfig.build.json --noEmit
npm --prefix apps/control-api test -- --run test/research-report.service.spec.ts test/research-report.controller.spec.ts test/config.spec.ts test/research-progress-rs01.service.spec.ts
TEST_DATABASE_URL=postgres://portal:portal@127.0.0.1:55432/portal_control npm --prefix apps/control-api test -- --run test/research-report-migration.spec.ts
npm --prefix packages/contracts run generate:research-report
npm --prefix packages/contracts test
python3 packages/contracts/tooling/snapshot.py --check
```

The local repository test PostgreSQL service is on `127.0.0.1:55432`; port `5432` is not assumed. The migration test creates one randomized database and drops it under `afterAll`, so no shared business or runtime row is changed.

## Release posture

`FEATURE_RESEARCH_REPORTS=false` remains the default and additionally requires Evidence/Split/Search/Freeze/Replay features when set true. This delivery does not enable a container, a background daemon, a source connection or a release overlay. Runtime activation and product acceptance remain separate owner gates.
