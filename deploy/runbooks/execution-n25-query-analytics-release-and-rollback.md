# N25 Query and Analytics Release and Rollback

Status: implementation-qualified; signed dev deployment remains a separate
release action. This runbook does not authorize stable runtime or Trading
System changes.

## Boundary

N25 reads one immutable, ACTIVE N24 projection snapshot and computes bounded,
source-attributed results in Rust. TypeScript only authenticates the Portal
session, selects one of four fixed resources and forwards the canonical
response. The browser must not recompute financial truth.

One request executes one PostgreSQL statement. That statement binds the
subject through `public.strategy_deployments`, reads only the ten allowlisted
relations and caps the population at 20,001 so an oversized result fails
closed before analytics computation. No route accepts an arbitrary relation,
sort expression, SQL fragment, source URL or profile.

## Preconditions

Stop unless all of these are true:

1. migration `0013_manager_query_analytics.sql` is applied;
2. the affected profile has an ACTIVE N24 adapter-v2 epoch sealed by a complete
   13-feed cycle and its state digest matches PostgreSQL;
3. mTLS and the delegated JWT screen resource are accepted for the fixed
   subject route;
4. schema, OpenAPI, generated TypeScript and release-manifest digests match the
   signed candidate;
5. current-source fallback and the retained N24 epoch are healthy;
6. Query response size, database latency and projection freshness budgets are
   green; and
7. SSE and command relay remain false.

Historical 12-feed N24 receipts remain immutable and readable for evidence;
they do not qualify a new N25 cycle. Every new writer cycle requires the
deployment-lineage feed and therefore exactly 13 feeds.

## Candidate and acceptance

Enable only the selected profile, in this order: Paper, Sandbox, Live. Set
`EDGE_ANALYTICS_QUERY_ENABLED=true` on the Edge and
`FEATURE_EXECUTION_ANALYTICS_QUERY=true` on the matching Control API only after
the preconditions pass. Do not change another profile in the same window.
Use `deploy/execution-manager-v2/compose.analytics.yaml` on AWS-HK and
`deploy/compose.execution-manager-analytics.yaml` on SGP. Both overlays pin
realtime and command flags false; the later N26 overlay may enable SSE without
changing the independently accepted Query authority.

Exercise all resource types that are valid for the selected profile:

```text
GET /api/v1/execution/deployments/{deploymentId}/query-analytics
GET /api/v1/execution/alphas/{alphaId}/query-analytics
GET /api/v1/execution/portfolios/{portfolioId}/query-analytics
GET /api/v1/execution/live-gates/{approvalId}/query-analytics
```

Accept only when:

- the envelope reports one repository query and at most 20,000 source facts;
- epoch, catalogue, state and fact digests are present and stable on a repeat
  read of unchanged state;
- exact decimals remain strings and aggregates never cross a relation/currency
  boundary;
- correlation uses aligned daily alpha-return observations, contribution uses
  daily performance-snapshot net-PnL deltas and charts retain declared extrema;
- a valid empty scope is `EMPTY`, while unavailable source semantics carry the
  declared N28 reason code;
- no request mutates source or Portal projection state; and
- p95 response size and latency stay inside the declared deployment budget.

Never remove an unavailable state because a UI wants a chart. Market candles,
benchmark correlation, cross-profile canary drift and broker ACK latency need
new source semantics and remain typed unavailable in N25.

## Failure and rollback

On auth, contract, epoch, integrity, freshness, retention, capacity, database,
latency or response-bound failure:

1. turn off the Control API analytics flag for the affected profile;
2. turn off the matching Edge analytics flag;
3. keep the ACTIVE projection and current-source fallback unchanged;
4. do not retry a failed source operation, mutate Trading System or synthesize
   a response;
5. if the fault is in the projection, stop the affected worker and use the N24
   retained-epoch rollback procedure within its overlap window;
6. preserve redacted epoch/catalogue/state/fact digests and typed failure code;
7. return the canonical unavailable response until a new candidate passes all
   gates.

N26 may activate projection-backed SSE only after this Query path is accepted
for the corresponding profile. N25 rollback never requires an SSE or command
change because both remain disabled.
