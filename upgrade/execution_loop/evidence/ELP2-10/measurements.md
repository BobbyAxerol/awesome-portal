# ELP2-10 — isolated observations, not a production SLO

Run1:2026-10-16 11:43:58UTC,35.81s, canonical disposable runner from
[manifest](measurement-manifest.json), PG16.15, pool2, worker1, Node3CPU/3GiB,
PG1CPU/1GiB. Log `/tmp/elp210-focused-pg-20261016.log`.
355/356 tests passed; the one failure asserted an internal code in sanitized
error prose. Corrected to check `code/status`; final normal hook must verify it.
That failure does not erase the separately observed measurements below or turn
this invocation into a successful whole-suite receipt. Restore step was not
reached on run1. Full final counts/log digest live in the landing receipt.

## Actual local SQL amplification and timing

Synthetic1member/1000facts, serialized1,197,252B.20 simultaneous repository
reads, same digest, no external source calls; **not20 authenticated HTTP users**.
ABBA warm order; no OS/PG cache flush, no actual parent-binary execution. The
reference uses one candidate repository per request to disable shared flights;
both paths retain parsing/digest/cloning. This isolates coalescing, not every
change from the entry baseline.

| Round | Document SELECTs | Max observed pool waiting | Wall ms | p50 ms | p95 ms | p99 ms | Process CPU user/system µs | RSS before→after B |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| A1 uncoalesced reference |20|20|2399.45|1167.27|2265.66|2370.31|2504484 /336611|129441792→168689664|
| B1 coalesced |1|1|1007.58|715.40|952.95|979.81|1206016 /82282|168689664→168235008|
| B2 coalesced |1|1|994.49|657.36|941.60|967.49|949558 /130980|168235008→205402112|
| A2 uncoalesced reference |20|20|2390.28|1235.33|2250.93|2360.18|2445647 /326995|205402112→231104512|

SELECT count reduced95% for this overlap. GC/cache/order affect CPU/RSS;
sequential RSS samples are **not peak RSS or independent memory savings**.
Observed p95 still cannot be compared with UDB500ms or P184 per-feed500ms:
different interface/population/metric. No confidence interval/capacity claim.

Mixed local write/read: one successor commit alongside20 prior-revision reads;
all old result digests unchanged, new head exactly successor digest, two
immutable revisions. No export route is mounted in the selected Manager scope;
positive export is N/A, not a fabricated mixed export measurement.

Actual `EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON)` selected Index Scan
`execution_manager_model_revis_workspace_id_environment_prof_key`, exact scope
index condition, revision filter,1 returned/1 filtered row,2 shared hit blocks,
0 shared read/written blocks, planning0.072ms, execution0.050ms. Small **two-row**
relation, not maximum-cardinality tuning. Existing primary key is
`(workspace_id,environment,profile_id,revision)`; no new query index was needed.
Total revision relation bytes122,880 including TOAST/index. It contains two
highly compressible synthetic documents; do not extrapolate production disk
compression from the JSON bytes/relation size difference.

Host I/O, WAL/write amplification, connection-wait milliseconds, ingest/replay
lag, TS/DL/Research regression and browser latency: **NOT_MEASURED**. The query
driver records observed waiting **count**, not time. These omissions remain
visible full-gate blockers rather than silently reusing unrelated old metrics.

## Scope-index diagnostic

Pure synthetic full-authority256tuples;512 known/unknown full-key inputs×4.
Same2048-result sequence,1024 allowed, result digest
`sha256:47379721474a014d9dfbe439f3797fecf3c565b352371e4e1ba403d2742658de`;
input digest
`sha256:51fb9dc719155ce31b80603582fa6e84981a43d39781eff68b9b61f0d336adc8`.
Steady reference-linear30.174ms, indexed10.061ms; one-time scope compilation
excluded. It is an oracle comparison, **not the old binary or a real source
benchmark**. Separate exhaustive projections/getter/partial-row tests preserve
authorization semantics; the speed diagnostic alone would not prove privacy.

## Reproduction and retake policy

Rerun only changed components while developing; one mandatory normal hook on
the final coherent candidate verifies integration and full scoped restore.
Duplicate tests across focused/hook are not added into unique coverage. Raw
diagnostic observations in later hook may vary; final landing receipt records
its log/digest without replacing these run1 observations.

Production budgets are intentionally null for all42×3 logical family/environment
pairs in the manifest. Current Edge14budget groups also have no approval refs.
Before any approved source load, freeze exact source/image/schema/config,
workload/cardinality/hot-cold/cache/repeats/clocks, owner-approved absolute and
relative thresholds, all replicas/pools, source-call counts and TS/DL/Research
B0/B1/B2 baselines. Respect existing HK measurement lock; its expiry is not a
new reservation. Keep P184 performanceG2 separate from optional mainnet canary.
