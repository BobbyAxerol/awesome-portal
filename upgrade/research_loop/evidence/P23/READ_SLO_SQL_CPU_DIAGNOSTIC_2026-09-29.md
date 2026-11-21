# P23 W06 Run Library SQL/CPU diagnostic — 2026-09-29

Status: **diagnostic FAIL, not P23 acceptance**. Only isolated cell
`portal-research-p23-ol12` on loopback `:8096` was read. No source, DB,
runtime setting, shared preview, Execution or production change. The
running image is pinned to clean application source `19a8e813`, not HEAD.

## Measurements

- One authorized Library GET: 200, 66,301 bytes, 179 ms through nginx;
  69 ms directly through Control API. Sequential timing is not an nginx
  penalty measurement.
- Twenty distinct sessions, complete JSON bodies: direct Control API
  20/20 200 p95 462 ms; nginx 20/20 200 p95 384 ms; direct retake
  20/20 200 p95 405 ms. Another direct warm run measured Library
  p95 574 ms while `/api/auth/context` p95 was 24 ms. The 500-ms warm
  SLO is unstable even without a concurrent WFO.
- A further nginx burst: 20/20 200, Library p95 598 ms, wall 657 ms.
  Cgroup `cpu.stat` deltas were ~1,248 ms PostgreSQL CPU, ~691 ms
  Control API CPU and ~110 ms nginx CPU. These include any concurrent
  cell activity. PostgreSQL had no CPU quota/throttling.
- Exact compiled P12 page+census SQL, read-only under runtime RLS and
  actor/workspace context: ten warmed pairs, auto plan p50/p95 27/62 ms.
  PostgreSQL already chose generic plans after five custom plans.
  Forced generic in one connection was 25/32 ms; this is not grounds
  for a global plan-policy change. One EXPLAIN measured page
  planning/execution 19.717/17.75 ms and census 7.277/11.566 ms.

## Gate

The official one-heavy/four-queued W06 still has Library p95 896 ms
FAIL. nginx is not established as the bottleneck; SQL and API CPU are
both material. Do not raise admission/pool, cache personalized truth,
force generic plans globally or relax 500 ms. Partition queue wait,
DB transaction and serialization on a pinned candidate; then retake
official six-read W06. F6/migration/F4-E10/OL-02 stay closed by
their prior receipts; P23/P24 remain OPEN.
