# P18 backend and contract packet — Report, print and reproducible export

Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK · S09_BROWSER_PRINT_PENDING_CLAUDE.**

This packet closes the Portal backend slice for an immutable Report assembled from persisted P13–P17 facts and for a bounded durable export job. It does **not** claim a QuantBT rerun, source/worker/artifact filesystem access, PDF generation, browser/print receipt, runtime activation, deployment or `PRODUCT_ACTIVE`.

Read [phase-report.md](./phase-report.md) and [frontend-handoff-claude.md](./frontend-handoff-claude.md) before changing Screen 09.

## Published same-origin operations

| Generated operation | Route | Bound behaviour |
| --- | --- | --- |
| `researchReportDetailGetV1` | `GET /api/v1/quantbt/runs/{runId}/report` | Caller/workspace-scoped immutable report. Supports exact private ETag/304 only for the sealed revision. |
| `researchReportExportCreateV1` | `POST /api/v1/quantbt/runs/{runId}/report/exports` | CSRF/origin-protected request for one caller/revision/format durable job; duplicate clicks return the same queued/running/ready job. |
| `researchReportExportStatusGetV1` | `GET /api/v1/quantbt/runs/{runId}/report/exports/{jobId}` | Caller-owned bounded job state only. |
| `researchReportExportDownloadGetV1` | `GET /api/v1/quantbt/runs/{runId}/report/exports/{jobId}/download` | Ready-only, `private, no-store`, server-generated filename, JSON/CSV bytes at most 512 KiB. |

`workspace_id` is optional only because the authenticated workspace is the default. Every route repeats membership. A foreign workspace, foreign job and unknown run resolve to the same typed `404`; no route accepts a relation, cursor, revision, source locator, lease, worker identity, artifact path or command input.

## Immutable truth boundary

The frozen core has exactly one source profile: `P13_P17_FIXED_PROFILE`. At terminal `run_completed`, it reads the persisted Evidence Hub, split, search, freeze and replay projections once, validates the full Zod contract and seals a `p18r1_<sha256>` row. Duplicate terminal delivery returns the existing same core/revision. The report has no timer, source call, engine call or worker dependency after that point.

Approval annotation is a separate mutable row. It cannot rewrite a report revision, core digest or any frozen field.

The current P04 source publishes identifying digests but not downloadable artifact bytes. P18 therefore keeps the five digests in `source_digests` and labels all physical report artifacts `NOT_PUBLISHED`; it never turns a digest into a false `SEALED` downloadable artifact. Current truthful absences include per-fold report rows, audited fills, selection trace, artifact payloads, promotion approval and execution-state replay.

## Export and recovery boundary

The explicit finite worker command is:

```bash
npm --prefix apps/control-api run build
npm --prefix apps/control-api run worker:research-report-export -- --limit=1
```

It is off unless `FEATURE_RESEARCH_REPORTS=true`, claims at most the explicit limit (1–16), has a 15–300 second lease, stores only a validated transform of the sealed core in PostgreSQL, and never writes a scratch file. Each JSON export carries the report revision, frozen-core SHA-256 and seal time in addition to the exact core. JSON and CSV are the only published formats. CSV applies spreadsheet-formula neutralization before quoting; all filenames are server-derived. `PARQUET` and `ARCHIVE` stay explicitly unavailable because the current source does not publish the necessary rowset/archive facts.

Rollback is a signed release with `FEATURE_RESEARCH_REPORTS=false`; retain immutable reports and completed export audit rows. Do not delete historical report bytes to roll back a transformer. The exact dark-release and future activation sequence is [the P18 runbook](../../../../deploy/runbooks/research-p18-report-dark-and-rollback.md).

## Evidence actually run

| Check | Result |
| --- | --- |
| Control API production-source compile | `npx tsc -p tsconfig.build.json --noEmit` — pass |
| P18 service/controller/config/progress focused units | 26 tests — pass |
| P18 disposable PostgreSQL migration/repository/immutability/size proof | 3 tests — pass using UUID-named disposable database on the local repo test PostgreSQL cell; seal → dedupe → claim → complete → checksum-download runs through the least-privilege runtime role, and teardown drops it |
| Contracts generation | `npm --prefix packages/contracts run generate:research-report` — pass |
| Contracts snapshot | `python3 packages/contracts/tooling/snapshot.py` then `--check` — pass |
| Contracts suite | `npm --prefix packages/contracts test` — pass; P18 has a generated-contract guard |

Focused test evidence proves the persistence/lease/transform boundary. It is not a substitute for Claude's actual Screen 09 browser and print receipt.

## Next owner

Claude owns rich Screen 09 composition, accessibility and real browser/print acceptance. Regenerate only `research-report.d.ts`, preserve the HiFi shell, and use the handoff's typed error/retry rules. Do not modify backend contracts, migrations, feature flags, deployment overlays or current P12 WIP to make a visual panel appear populated.
