# Research P19 — Attempt Lineage dark release and rollback

P19 publishes one same-origin, read-only Screen-10 route:

`GET /api/v1/research/alphas/:alphaId/lineage`

It reads only Portal-owned, persisted `research` metadata in a bounded,
repeatable-read transaction. It does not start QuantBT, submit/fork/reproduce
a run, read a worker/artifact/Parquet path, contact an Execution Edge/Trading
System service, alter Governance, or select a promotion from a metric.

## Dark default

Keep the following deployment inputs false by default:

```dotenv
CONTROL_API_FEATURE_RESEARCH_RUN_LIBRARY=false
CONTROL_API_FEATURE_RESEARCH_LINEAGE=false
```

`FEATURE_RESEARCH_LINEAGE=true` requires the retained P12 Run Library reader;
the process fails closed if the dependency is absent. It does not require an
active P10 producer or P11 worker, so historical data remains readable after a
worker stop when the signed release and migration are accepted.

## Preflight before enabling

1. Deploy the signed image with migration `1723680000053` forward. Do not edit
   a release directory or issue ad-hoc DDL.
2. Confirm the generated `research-attempt-lineage.d.ts`, contract snapshot,
   capability inventory and focused migration/service/controller tests are in
   the same image revision.
3. Confirm `CONTROL_API_FEATURE_RESEARCH_RUN_LIBRARY=true` in the intended
   environment. Do not enable the two flags in separate, unreviewed images.
4. Check a known workspace/Alpha through the session route. A missing
   promotion-source fact must render `NOT_PUBLISHED` with
   `P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK`; it must never pick a newest,
   ACTIVE or best-metric attempt.
5. If an Alpha has more than 128 attempts, confirm the response reports
   `coverage.state=PARTIAL` and `P19_BOUNDED_GRAPH_LIMIT_REACHED`; no client
   may present the returned prefix as a complete history.
6. If one returned attempt has more than 32 non-primary child runs, confirm
   `child_runs_coverage.state=PARTIAL` and
   `P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT`. Do not turn the returned prefix into
   an unbounded nested browser graph or silently describe it as complete.

## Rollback

Set only:

```dotenv
CONTROL_API_FEATURE_RESEARCH_LINEAGE=false
```

through the signed deployment workflow. Retain attempts, runs, exposure facts,
promotion facts and indexes. Do not delete lineage nodes, promotion facts, or
historical source evidence as a rollback action.
