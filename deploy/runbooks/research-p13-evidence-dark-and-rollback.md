# Research P13 Evidence Flow — dark deployment and rollback

## Scope

P13 adds the same-origin Evidence Flow Hub and four bounded lazy series reads
for an immutable terminal Research receipt. It does not add an engine worker,
artifact browser, direct database access, Execution Edge/Trading System
access, CLI relay, public port, or browser-held credential.

The reader flag is independent from P10/P11. A P11 callback may materialize a
receipt while this reader remains dark; later enabling the reader only exposes
the reviewed Portal projection of already retained facts. The source worker
and relay must never be enabled merely to make Screen 04 render.

## Dark-release preflight

1. Confirm the signed image includes migration
   `1723680000046_research-evidence-flow-v1.sql` and generated contract
   `research-evidence.d.ts`.
2. Render only through the ordinary signed deployment workflow; never edit a
   release directory or run a manual schema change:

   ```bash
   docker compose \
     -f deploy/compose.production.yaml \
     -f deploy/compose.production.stable-runtime.yaml \
     -f deploy/compose.research-progress.yaml \
     --env-file /srv/primus/portal/.env.production config
   ```

3. Keep all Research flags false for a dark deployment:

   ```text
   CONTROL_API_FEATURE_RESEARCH_RUN_PRODUCER=false
   CONTROL_API_FEATURE_RESEARCH_PROGRESS=false
   PORTAL_FEATURE_RESEARCH_RUN_PRODUCER=false
   PORTAL_FEATURE_RESEARCH_PROGRESS=false
   CONTROL_API_FEATURE_RESEARCH_EVIDENCE=false
   ```

4. The forward migrator creates append-only bounded source/projection/series
   relations. It never backfills by reopening QuantBT or rereading artifacts.

## Future reader-only activation evidence

Enable only `CONTROL_API_FEATURE_RESEARCH_EVIDENCE=true` in a signed release
after the forward migration and Screen 04 consumer acceptance. Keep the P10
and P11 flags at their separately approved values; no flag flip here starts a
worker.

Record sanitized evidence for one retained run:

- Hub and all series have the same opaque revision/ETag;
- the first lazy series has no raw OHLCV, artifact path, worker identity,
  credential or CLI field;
- a duplicate terminal callback retains exactly one source receipt,
  projection and four series rows;
- unavailable benchmark/funding/fold facts remain typed and are not zero;
- a P13 reader error is typed (`400/403/404/409/503`), with no internal
  relation/cursor/journal data returned.

Do not call a missing source receipt a successful Hub. It is
`PENDING_SOURCE_CALLBACK`, `NOT_PUBLISHED`, or legacy metadata according to
the durable run state.

## Rollback

Set `CONTROL_API_FEATURE_RESEARCH_EVIDENCE=false` through the same signed
workflow. Do not drop P13 relations, delete source receipts, alter bundles,
or disable P10/P11 as a side effect. A later compatible release can read the
same immutable revision again.
