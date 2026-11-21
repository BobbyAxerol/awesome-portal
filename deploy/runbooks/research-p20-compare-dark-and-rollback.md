# Research P20 Compare: dark deployment and rollback

P20 is a same-origin, read-only reader over Portal-persisted Research facts.
It never opens QuantBT, a worker/artifact path, Trading System, Execution
Edge, Redis, a broker, or a CLI. Its only derived value is a bounded,
exact-timestamp Pearson correlation over two already sealed local
`OBSERVATION` revisions. No Compare request can promote, publish, approve,
start, cancel, replay, or modify an attempt/run/evidence record.

## Default: dark

Keep this release input false:

```dotenv
CONTROL_API_FEATURE_RESEARCH_COMPARE=false
```

The route returns a typed `503 RESEARCH_COMPARE_UNAVAILABLE`; migrations can
still be applied safely because they add an index and an expiring operational
cache only. No runtime worker, port, source adapter or data import is added.

## Controlled enablement

Only set the flag true after all three prerequisite read lanes are already
accepted in the *same* deployment profile:

```dotenv
CONTROL_API_FEATURE_RESEARCH_RUN_LIBRARY=true
CONTROL_API_FEATURE_RESEARCH_EVIDENCE=true
CONTROL_API_FEATURE_RESEARCH_SPLIT=true
CONTROL_API_FEATURE_RESEARCH_COMPARE=true
```

Before enabling, run the focused compare contract/service/migration checks and
verify that a same-Alpha pair with sealed P14/RS-02 bindings returns either:

- `AVAILABLE` with formula `pearson-product-moment-correlation`, version
  `p20.raw-return-v1`, exact UTC timestamps and `n`; or
- a typed `NOT_PUBLISHED`/`PARTIAL` reason such as no overlap, zero variance,
  invalid source count, or a seal-binding mismatch.

A different `ComparisonContractKey` must return `REFUSED` with `pair: null`;
no metrics/chart may be present. A controller/service test must also show that
the request emits no job, outbox, approval, publication, execution or source
transport operation.

## Rollback and cleanup

Set only `CONTROL_API_FEATURE_RESEARCH_COMPARE=false` and redeploy the signed
release. Do **not** delete P08/P13/P14/RS-02 rows or cache manually as a
rollback action. Expired rows are per-workspace, boundedly swept on later
Compare writes; they carry no business evidence and expire after 15 minutes.
There is no `VACUUM FULL`, source deletion, engine rerun or cache backfill.
