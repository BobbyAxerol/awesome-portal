# Research P18 Report/export — dark deployment and rollback

## Scope

P18 adds one immutable same-origin Report read and an explicit bounded JSON/CSV export transformer over already-persisted P13–P17 projections. It does not add a QuantBT worker, source/Trading-System/Execution connection, artifact or Parquet reader, direct browser database access, CLI relay, public port, PDF renderer or always-on export daemon.

The finite worker is an operator-invoked command after a job exists; enabling the reader feature cannot start it. Report materialization remains a terminal sidecar over an already-persisted callback and never reruns a source job.

## Dark-release preflight

1. Confirm the signed image contains `1723680000052_research-report-export-v1.sql`, `research-report.d.ts`, and the P18 report worker CLI.
2. Render only through the ordinary signed deployment workflow; never edit a release directory or issue manual schema changes:

   ```bash
   docker compose \
     -f deploy/compose.production.yaml \
     -f deploy/compose.production.stable-runtime.yaml \
     -f deploy/compose.research-progress.yaml \
     --env-file /srv/primus/portal/.env.production config
   ```

3. Keep the entire dependency chain dark:

   ```text
   CONTROL_API_FEATURE_RESEARCH_EVIDENCE=false
   CONTROL_API_FEATURE_RESEARCH_SPLIT=false
   CONTROL_API_FEATURE_RESEARCH_SEARCH=false
   CONTROL_API_FEATURE_RESEARCH_FREEZE=false
   CONTROL_API_FEATURE_RESEARCH_REPLAY=false
   CONTROL_API_FEATURE_RESEARCH_REPORTS=false
   ```

4. The forward migration is additive. It creates immutable report cores, separately mutable annotations and bounded retained export jobs. It never backfills by opening QuantBT, an artifact, a source data store or a holdout.

## Future reader/export activation evidence

Enable `CONTROL_API_FEATURE_RESEARCH_REPORTS=true` only in a signed release after all five dependent reader flags, the generated Screen-09 consumer and actual browser/print receipt have been separately accepted. This does not start the export worker.

Before invoking the finite worker, record sanitized evidence for a retained run:

- Report core revisions/digests/UTC/exact values match the P13–P17 readers and stay unchanged across a second read/re-export.
- A duplicate export click returns the same caller/revision/format job; foreign jobs remain a typed `404`.
- JSON and CSV output hash/size agree with the stored job; each is at most the declared byte ceiling; CSV formula/path attempts remain literal.
- A worker restart/expired lease resumes from the sealed core only; it never rereads a source/artifact or reruns QuantBT.
- Current missing physical artifacts, folds, fills, promotion and Parquet/archive facts remain typed `NOT_PUBLISHED`/unavailable.

## Rollback

Set `CONTROL_API_FEATURE_RESEARCH_REPORTS=false` through the same signed workflow. Do not drop P18 relations, delete immutable report/export audit rows, edit a frozen core, disable P13–P17 as a side effect, alter QuantBT or run manual storage cleanup. A compatible later release may read the exact historical revision again.
