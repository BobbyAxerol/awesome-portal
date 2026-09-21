# Research P14 Split / chronology truth — dark deployment and rollback

## Scope

P14 adds one same-origin read of an immutable current-P04 chronology projection.
It does not add an engine worker, raw snapshot/Parquet/artifact reader, direct
database access, Execution Edge/Trading System connection, CLI relay, public
port, generic WFO implementation, holdout result/view, source seal or unlock
mutation.

The reader flag is independent from P10/P11. A P11 callback may materialize a
bounded receipt while the browser reader stays dark; enabling the reader later
does not start a worker or create an action channel.

## Dark-release preflight

1. Confirm the signed image contains migration
   `1723680000047_research-split-truth-v1.sql` and generated
   `research-split.d.ts`.
2. Render only through the ordinary signed deployment workflow; never edit a
   release directory or issue manual schema changes:

   ```bash
   docker compose \
     -f deploy/compose.production.yaml \
     -f deploy/compose.production.stable-runtime.yaml \
     -f deploy/compose.research-progress.yaml \
     --env-file /srv/primus/portal/.env.production config
   ```

3. Keep Research features dark:

   ```text
   CONTROL_API_FEATURE_RESEARCH_RUN_PRODUCER=false
   CONTROL_API_FEATURE_RESEARCH_PROGRESS=false
   PORTAL_FEATURE_RESEARCH_RUN_PRODUCER=false
   PORTAL_FEATURE_RESEARCH_PROGRESS=false
   CONTROL_API_FEATURE_RESEARCH_SPLIT=false
   ```

4. The forward migration only creates append-only bounded source/projection
   relations. It never backfills by reopening QuantBT, a bundle, raw market
   data or a holdout.

## Future reader-only activation evidence

Enable only `CONTROL_API_FEATURE_RESEARCH_SPLIT=true` in a signed release
after migration and Screen-05 consumer acceptance. Keep source-worker flags at
their independently approved values.

Record sanitized evidence for one retained run:

- BFF revision and quoted ETag agree exactly;
- windows are contiguous half-open UTC-millisecond source facts;
- holdout remains `NOT_EXPOSED_TO_CHILD_TAPE`, `NOT_EVALUATED` and
  `NOT_EXPOSED`, with no raw row or action link;
- physical I/O remains `NOT_ATTESTED`, never upgraded by presentation copy;
- duplicate terminal callbacks retain one source/projection revision;
- missing fold/purge/embargo/seal/unlock facts remain typed, and errors are
  `400/403/404/409/503` without relation/cursor/journal detail.

## Rollback

Set `CONTROL_API_FEATURE_RESEARCH_SPLIT=false` through the same signed
workflow. Do not drop P14 relations, delete source receipts, alter bundles,
disable P10/P11 as a side effect, open a holdout, or create a manual database
backfill. A compatible later release may read the exact immutable revision.
